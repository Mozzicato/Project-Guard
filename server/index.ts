import express, { type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import {
  DEFENSE_CATEGORIES,
  NODE_TYPES,
  PROVENANCES,
  isAllowedRelation,
  type FeedbackStatus,
  type NodeType,
  type OpportunityBrief,
} from '../shared/model.ts';
import * as db from './db.ts';
import { Graph, impactOf } from './graph.ts';
import { aiChecks, computeMetrics, defenseReadiness, mergeIssues, ruleChecks, sortIssues } from './integrity.ts';
import * as ai from './ai.ts';
import { LLMError, llmAvailable } from './llm.ts';
import { textFromFile, textFromUrl } from './extract.ts';
import { buildReport, reportMarkdown } from './report.ts';

const app = express();
app.use(express.json({ limit: '5mb' }));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const id = (v: unknown) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, 'Invalid id');
  return n;
};
const need = <T>(v: T | undefined, what = 'Not found'): T => {
  if (v === undefined || v === null) throw new HttpError(404, what);
  return v;
};
const projectOf = (req: Request) => need(db.getProject(id(req.params.pid)), 'Project not found');
const graphOf = (pid: number) => new Graph(db.listNodes(pid), db.listEdges(pid));

app.get('/api/health', (_req, res) => res.json({ ok: true, llm: llmAvailable() }));

// ---------------- projects ----------------

app.get('/api/projects', (_req, res) => {
  res.json(
    db.listProjects().map((p) => ({ ...p, latest: db.latestRun(p.id)?.metrics ?? null, nodes: db.listNodes(p.id).length })),
  );
});

app.post('/api/projects', (req, res) => {
  const b = req.body ?? {};
  if (!String(b.title ?? '').trim()) throw new HttpError(400, 'A project title is required');
  res.status(201).json(db.createProject(b));
});

app.get('/api/projects/:pid', (req, res) => res.json(projectOf(req)));

app.patch('/api/projects/:pid', (req, res) => {
  const p = projectOf(req);
  const { brief, ...rest } = req.body ?? {};
  res.json(db.updateProject(p.id, brief !== undefined ? { ...rest, brief } : rest));
});

app.delete('/api/projects/:pid', (req, res) => {
  db.deleteProject(projectOf(req).id);
  res.json({ ok: true });
});

/** Live overview: deterministic checks are cheap, so the dashboard never shows stale structure. */
app.get('/api/projects/:pid/summary', (req, res) => {
  const p = projectOf(req);
  const g = graphOf(p.id);
  const feedback = db.listFeedback(p.id);
  const questions = db.listQuestions(p.id);
  const issues = sortIssues(ruleChecks(g, feedback, p.stage));
  const counts: Record<string, number> = {};
  for (const n of g.nodes) counts[n.type] = (counts[n.type] ?? 0) + 1;
  const suggested = db.listNodes(p.id, { includeSuggested: true }).filter((n) => n.status === 'suggested').length;
  res.json({
    project: p,
    live: computeMetrics(g, issues, questions),
    issues: issues.filter((i) => i.severity !== 'passed').slice(0, 8),
    counts,
    suggested,
    feedback_open: feedback.filter((f) => f.status === 'open' || f.status === 'in_progress').length,
    runs: db.listRuns(p.id).map((r) => ({ id: r.id, created_at: r.created_at, score: r.metrics.score, include_ai: r.include_ai })),
    defense: defenseReadiness(questions),
  });
});

// ---------------- graph ----------------

app.get('/api/projects/:pid/graph', (req, res) => {
  const p = projectOf(req);
  const includeSuggested = req.query.suggested !== '0';
  const nodes = db.listNodes(p.id, { includeSuggested });
  const edges = db.listEdges(p.id, { includeSuggested });
  const g = graphOf(p.id);
  const claimStatus: Record<number, boolean> = {};
  for (const c of g.ofType('claim')) claimStatus[c.id] = g.claimBacking(c.id).backed;
  res.json({ nodes, edges, claimStatus });
});

app.post('/api/projects/:pid/nodes', (req, res) => {
  const p = projectOf(req);
  const b = req.body ?? {};
  if (!NODE_TYPES.includes(b.type)) throw new HttpError(400, 'Unknown component type');
  const node = db.createNode({
    project_id: p.id,
    type: b.type,
    title: String(b.title ?? '').slice(0, 300),
    content: String(b.content ?? ''),
    provenance: PROVENANCES.includes(b.provenance) ? b.provenance : 'user',
    data: typeof b.data === 'object' && b.data ? b.data : {},
  });
  // Optional convenience: link the new node in the same request.
  if (b.link_from) linkOrThrow(p.id, id(b.link_from), node.id, b.link_relation);
  if (b.link_to) linkOrThrow(p.id, node.id, id(b.link_to), b.link_relation);
  res.status(201).json(node);
});

function linkOrThrow(pid: number, fromId: number, toId: number, relation: string) {
  const a = need(db.getNode(fromId), 'Source component not found');
  const b = need(db.getNode(toId), 'Target component not found');
  if (a.project_id !== pid || b.project_id !== pid) throw new HttpError(400, 'Components belong to another project');
  if (!isAllowedRelation(a.type, b.type, relation)) throw new HttpError(400, `A ${a.type} cannot "${relation}" a ${b.type}`);
  return db.createEdge({ project_id: pid, from_id: a.id, to_id: b.id, relation });
}

app.patch('/api/nodes/:id', (req, res) => {
  const n = need(db.getNode(id(req.params.id)));
  const b = req.body ?? {};
  const patch: Parameters<typeof db.updateNode>[1] = {};
  if (typeof b.title === 'string') patch.title = b.title.slice(0, 300);
  if (typeof b.content === 'string') patch.content = b.content;
  if (PROVENANCES.includes(b.provenance)) patch.provenance = b.provenance;
  if (b.data && typeof b.data === 'object') patch.data = { ...n.data, ...b.data };
  // A student editing an AI suggestion takes ownership of it.
  if ((patch.title !== undefined || patch.content !== undefined) && !patch.provenance && n.provenance === 'ai_suggestion' && b.take_ownership) {
    patch.provenance = 'user';
  }
  res.json(db.updateNode(n.id, patch, String(b.note ?? 'Edited')));
});

app.get('/api/nodes/:id/impact', (req, res) => {
  const n = need(db.getNode(id(req.params.id)));
  const g = new Graph(db.listNodes(n.project_id, { includeSuggested: true }), db.listEdges(n.project_id, { includeSuggested: true }));
  const feedback = db.listFeedback(n.project_id).filter((f) => f.affected.includes(n.id));
  const questions = db.listQuestions(n.project_id).filter((q) => q.target_ids.includes(n.id));
  res.json({ ...impactOf(g, n.id), feedback: feedback.map((f) => ({ id: f.id, summary: f.summary })), defense_questions: questions.length });
});

app.delete('/api/nodes/:id', (req, res) => {
  const n = need(db.getNode(id(req.params.id)));
  db.deleteNode(n.id);
  res.json({ ok: true });
});

app.get('/api/nodes/:id/versions', (req, res) => {
  need(db.getNode(id(req.params.id)));
  res.json(db.nodeVersions(id(req.params.id)));
});

app.post('/api/nodes/:id/restore', (req, res) => {
  const n = need(db.getNode(id(req.params.id)));
  const v = need(db.nodeVersions(n.id).find((x: any) => x.version === Number(req.body?.version)), 'Version not found') as any;
  res.json(db.updateNode(n.id, { title: v.title, content: v.content, provenance: v.provenance, data: v.data }, `Restored version ${v.version}`));
});

app.post('/api/nodes/:id/accept', (req, res) => {
  const n = need(db.getNode(id(req.params.id)));
  const node = db.updateNode(n.id, { status: 'active' }, 'Accepted AI suggestion');
  // Accepting a node also accepts suggested links between it and other active nodes.
  for (const e of db.listEdges(n.project_id, { includeSuggested: true })) {
    if (e.status !== 'suggested' || (e.from_id !== n.id && e.to_id !== n.id)) continue;
    const other = db.getNode(e.from_id === n.id ? e.to_id : e.from_id);
    if (other?.status === 'active') db.setEdgeStatus(e.id, 'active');
  }
  res.json(node);
});

app.post('/api/projects/:pid/edges', (req, res) => {
  const p = projectOf(req);
  const b = req.body ?? {};
  res.status(201).json(linkOrThrow(p.id, id(b.from_id), id(b.to_id), String(b.relation)));
});

app.post('/api/edges/:id/accept', (req, res) => {
  const e = need(db.getEdge(id(req.params.id)));
  db.setEdgeStatus(e.id, 'active');
  res.json({ ok: true });
});

app.delete('/api/edges/:id', (req, res) => {
  need(db.getEdge(id(req.params.id)));
  db.deleteEdge(id(req.params.id));
  res.json({ ok: true });
});

app.post('/api/projects/:pid/suggestions/:action', (req, res) => {
  const p = projectOf(req);
  const nodes = db.listNodes(p.id, { includeSuggested: true }).filter((n) => n.status === 'suggested');
  if (req.params.action === 'accept-all') {
    for (const n of nodes) db.updateNode(n.id, { status: 'active' }, 'Accepted AI suggestion');
    for (const e of db.listEdges(p.id, { includeSuggested: true })) if (e.status === 'suggested') db.setEdgeStatus(e.id, 'active');
  } else if (req.params.action === 'reject-all') {
    for (const n of nodes) db.deleteNode(n.id);
    for (const e of db.listEdges(p.id, { includeSuggested: true })) if (e.status === 'suggested') db.deleteEdge(e.id);
  } else throw new HttpError(400, 'Unknown action');
  res.json({ ok: true });
});

// ---------------- Idea Lab & Blueprint ----------------

app.post('/api/projects/:pid/idea/analyze', async (req, res) => {
  let p = projectOf(req);
  if (typeof req.body?.idea === 'string') p = db.updateProject(p.id, { idea: req.body.idea })!;
  if (!p.idea.trim()) throw new HttpError(400, 'Describe your idea first');
  const previous: OpportunityBrief | null = req.body?.brief ?? p.brief;
  const brief = await ai.analyzeIdea(p, previous);
  res.json(db.updateProject(p.id, { brief }));
});

app.post('/api/projects/:pid/blueprint/suggest', async (req, res) => {
  const p = projectOf(req);
  const g = graphOf(p.id);
  const s = await ai.suggestBlueprint(p, g);
  const keyToId = new Map<string, number>();
  const created = [];
  for (const n of s.nodes) {
    const node = db.createNode({ project_id: p.id, type: n.type, title: n.title, content: n.content, provenance: n.provenance, status: 'suggested', data: { suggested_by: 'blueprint' } });
    keyToId.set(n.key, node.id);
    created.push(node);
  }
  const resolve = (k: string) => keyToId.get(k) ?? (g.byId.has(Number(k)) ? Number(k) : undefined);
  let edges = 0;
  for (const e of s.edges) {
    const from = resolve(e.from);
    const to = resolve(e.to);
    if (!from || !to) continue;
    const a = db.getNode(from)!;
    const b = db.getNode(to)!;
    if (!isAllowedRelation(a.type, b.type, e.relation)) continue;
    db.createEdge({ project_id: p.id, from_id: from, to_id: to, relation: e.relation, status: 'suggested' });
    edges++;
  }
  res.json({ nodes: created.length, edges });
});

// ---------------- Research workspace ----------------

const SOURCE_KINDS = ['paper', 'url', 'note', 'document', 'manual', 'dataset'];

app.post('/api/projects/:pid/sources', upload.single('file'), async (req, res) => {
  const p = projectOf(req);
  const b = req.body ?? {};
  const kind = SOURCE_KINDS.includes(b.kind) ? b.kind : 'manual';
  let text = String(b.text ?? '');
  let title = String(b.title ?? '').trim();
  let url = String(b.url ?? '').trim();
  let filename = '';
  if (req.file) {
    filename = req.file.originalname;
    const t = await textFromFile(req.file.buffer, req.file.originalname, req.file.mimetype);
    text = [text, t].filter(Boolean).join('\n\n');
    if (!title) title = filename.replace(/\.[^.]+$/, '');
  }
  if (url) {
    try {
      const fetched = await textFromUrl(url);
      text = [text, fetched.text].filter(Boolean).join('\n\n');
      if (!title) title = fetched.title;
    } catch (e: any) {
      if (!text) throw new HttpError(400, `Could not read that URL: ${e.message}`);
    }
  }
  const nodeType: NodeType = b.node_type === 'evidence' || b.node_type === 'experiment' ? b.node_type : 'source';
  const data: Record<string, any> = { kind, url, filename, text: text.slice(0, 60_000), authors: String(b.authors ?? ''), year: String(b.year ?? '') };
  let node = db.createNode({
    project_id: p.id,
    type: nodeType,
    title: title || (nodeType === 'source' ? 'Untitled source' : 'Untitled artifact'),
    // Pasted notes stay as the source text; they only become the card body if there is no AI summary.
    content: String(b.content ?? ''),
    // A real document the student supplied is verified material; a manually typed reference is user-provided.
    provenance: req.file || url || nodeType !== 'source' ? 'verified' : 'user',
    data,
  });
  let extraction_error: string | null = null;
  if (nodeType === 'source' && b.extract !== 'false' && text.trim().length > 80 && llmAvailable()) {
    try {
      node = applyExtraction(p.id, node.id, await ai.extractSource(p, graphOf(p.id), text, { title, url, kind }));
    } catch (e: any) {
      extraction_error = e.message;
    }
  }
  res.status(201).json({ node, extraction_error });
});

function applyExtraction(pid: number, nodeId: number, x: ai.SourceExtraction) {
  const n = db.getNode(nodeId)!;
  const updated = db.updateNode(
    nodeId,
    {
      title: n.title && n.title !== 'Untitled source' ? n.title : x.title,
      data: {
        ...n.data,
        authors: n.data.authors || x.authors,
        year: n.data.year || x.year,
        summary: x.summary,
        key_claims: x.key_claims,
        findings: x.findings,
        limitations: x.limitations,
        relevance: x.relevance,
        relevance_score: x.relevance_score,
        gap_relationship: x.gap_relationship,
        gap_rationale: x.gap_rationale,
        extracted_by_ai: true,
        extracted_at: new Date().toISOString(),
      },
    },
    'AI extraction',
  )!;
  // Proposed gap relationships stay suggestions until the student confirms them.
  if (x.gap_relationship === 'supports' || x.gap_relationship === 'challenges') {
    for (const gid of x.gap_ids) {
      db.createEdge({ project_id: pid, from_id: nodeId, to_id: gid, relation: x.gap_relationship === 'supports' ? 'supports_gap' : 'challenges_gap', status: 'suggested' });
    }
  }
  return updated;
}

app.post('/api/nodes/:id/extract', async (req, res) => {
  const n = need(db.getNode(id(req.params.id)));
  const p = need(db.getProject(n.project_id));
  const text = [n.data.text, n.content].filter(Boolean).join('\n\n');
  if (text.trim().length < 40) throw new HttpError(400, 'There is not enough text on this source to analyse. Paste an abstract or notes first.');
  res.json(applyExtraction(p.id, n.id, await ai.extractSource(p, graphOf(p.id), text, { title: n.title, url: n.data.url, kind: n.data.kind ?? 'manual' })));
});

// ---------------- Integrity engine ----------------

app.post('/api/projects/:pid/check', async (req, res) => {
  const p = projectOf(req);
  const g = graphOf(p.id);
  const includeAi = !!req.body?.include_ai && llmAvailable();
  let issues = ruleChecks(g, db.listFeedback(p.id), p.stage);
  let ai_error: string | null = null;
  if (includeAi) {
    try {
      issues = mergeIssues(issues, await aiChecks(p, g));
    } catch (e: any) {
      ai_error = e.message;
    }
  }
  const sorted = sortIssues(issues);
  const run = db.saveRun({ project_id: p.id, include_ai: includeAi, metrics: computeMetrics(g, sorted, db.listQuestions(p.id)), issues: sorted, ai_error });
  res.json(run);
});

app.get('/api/projects/:pid/runs', (req, res) => res.json(db.listRuns(projectOf(req).id)));

// ---------------- Feedback ----------------

app.get('/api/projects/:pid/feedback', (req, res) => res.json(db.listFeedback(projectOf(req).id)));

app.post('/api/projects/:pid/feedback', async (req, res) => {
  const p = projectOf(req);
  const text = String(req.body?.text ?? '').trim();
  if (!text) throw new HttpError(400, 'Enter the feedback text');
  let parsed = { summary: text.slice(0, 200), location: '', affected: [] as number[], actions: [] as { text: string; done: boolean }[] };
  let parse_error: string | null = null;
  if (req.body?.parse !== false && llmAvailable()) {
    try {
      parsed = await ai.parseFeedback(p, graphOf(p.id), text);
    } catch (e: any) {
      parse_error = e.message;
    }
  }
  const fb = db.createFeedback({ project_id: p.id, raw_text: text, ...parsed, status: 'open', supervisor: String(req.body?.supervisor ?? '') });
  res.status(201).json({ feedback: fb, parse_error });
});

app.patch('/api/feedback/:id', (req, res) => {
  const f = need(db.getFeedback(id(req.params.id)));
  const b = req.body ?? {};
  const statuses: FeedbackStatus[] = ['open', 'in_progress', 'resolved', 'rejected'];
  res.json(
    db.updateFeedback(f.id, {
      ...(typeof b.summary === 'string' ? { summary: b.summary } : {}),
      ...(typeof b.location === 'string' ? { location: b.location } : {}),
      ...(Array.isArray(b.affected) ? { affected: b.affected.map(Number).filter(Number.isInteger) } : {}),
      ...(Array.isArray(b.actions) ? { actions: b.actions.map((a: any) => ({ text: String(a.text ?? ''), done: !!a.done })) } : {}),
      ...(statuses.includes(b.status) ? { status: b.status } : {}),
      ...(typeof b.supervisor === 'string' ? { supervisor: b.supervisor } : {}),
    }),
  );
});

app.delete('/api/feedback/:id', (req, res) => {
  need(db.getFeedback(id(req.params.id)));
  db.deleteFeedback(id(req.params.id));
  res.json({ ok: true });
});

// ---------------- Defense simulator ----------------

app.get('/api/projects/:pid/defense', (req, res) => {
  const p = projectOf(req);
  const questions = db.listQuestions(p.id);
  res.json({ questions, readiness: defenseReadiness(questions) });
});

app.post('/api/projects/:pid/defense/generate', async (req, res) => {
  const p = projectOf(req);
  const g = graphOf(p.id);
  if (!g.nodes.length) throw new HttpError(400, 'Build your blueprint first — questions are generated from your project graph.');
  const weak = (db.latestRun(p.id)?.issues ?? ruleChecks(g, db.listFeedback(p.id), p.stage))
    .filter((i) => i.severity === 'critical' || i.severity === 'warning')
    .slice(0, 12)
    .map((i) => i.title);
  const qs = await ai.generateDefenseQuestions(p, g, Math.min(18, Math.max(6, Number(req.body?.count) || 12)), weak);
  if (req.body?.replace) db.clearQuestions(p.id);
  for (const q of qs) db.createQuestion({ project_id: p.id, ...q });
  res.json({ created: qs.length });
});

app.post('/api/projects/:pid/defense/custom', (req, res) => {
  const p = projectOf(req);
  const question = String(req.body?.question ?? '').trim();
  if (!question) throw new HttpError(400, 'Enter a question');
  const category = DEFENSE_CATEGORIES.includes(req.body?.category) ? req.body.category : 'fundamentals';
  res.status(201).json(db.createQuestion({ project_id: p.id, category, question, rationale: 'Added by student', risk: 'medium', target_ids: [] }));
});

app.post('/api/defense/:id/answer', async (req, res) => {
  const q = need(db.getQuestion(id(req.params.id)));
  const p = need(db.getProject(q.project_id));
  const answer = String(req.body?.answer ?? '').trim();
  if (!answer) throw new HttpError(400, 'Enter an answer first');
  const evaluation = await ai.evaluateAnswer(p, graphOf(p.id), q, answer);
  res.json(db.saveAnswer(q.id, answer, evaluation));
});

app.delete('/api/defense/:id', (req, res) => {
  need(db.getQuestion(id(req.params.id)));
  db.deleteQuestion(id(req.params.id));
  res.json({ ok: true });
});

// ---------------- Writing assistant & report ----------------

app.post('/api/projects/:pid/assist', async (req, res) => {
  const p = projectOf(req);
  const mode = (Object.keys(ai.WRITING_MODES).includes(req.body?.mode) ? req.body.mode : 'ask') as ai.WritingMode;
  const message = String(req.body?.message ?? '').trim();
  if (!message) throw new HttpError(400, 'Enter a message');
  const history = Array.isArray(req.body?.history) ? req.body.history : [];
  res.json(await ai.assist(p, graphOf(p.id), mode, message, history));
});

/** Accepting a suggested edit from the assistant — the only way AI text enters the project. */
app.post('/api/projects/:pid/apply-edit', (req, res) => {
  const p = projectOf(req);
  const b = req.body ?? {};
  if (b.node_id) {
    const n = need(db.getNode(id(b.node_id)));
    if (n.project_id !== p.id) throw new HttpError(400, 'Component belongs to another project');
    res.json(db.updateNode(n.id, { title: b.title || n.title, content: String(b.content ?? n.content), provenance: 'ai_suggestion' }, 'Accepted assistant edit'));
  } else {
    if (!NODE_TYPES.includes(b.type)) throw new HttpError(400, 'Unknown component type');
    res.status(201).json(db.createNode({ project_id: p.id, type: b.type, title: String(b.title ?? ''), content: String(b.content ?? ''), provenance: 'ai_suggestion' }));
  }
});

app.get('/api/projects/:pid/report', (req, res) => {
  const p = projectOf(req);
  const chapters = buildReport(p, graphOf(p.id));
  if (req.query.format === 'md') {
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${p.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.md"`);
    res.send(reportMarkdown(p, chapters));
    return;
  }
  res.json(chapters);
});

// ---------------- static + errors ----------------

const dist = path.join(process.cwd(), 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = err instanceof HttpError ? err.status : err instanceof LLMError ? 502 : 500;
  if (status === 500) console.error(err);
  res.status(status).json({ error: err?.message ?? 'Server error' });
});

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => console.log(`Project Compiler API on http://localhost:${port} (LLM ${llmAvailable() ? 'enabled' : 'NOT configured'})`));
