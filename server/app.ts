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
} from '../shared/model.js';
import * as db from './db.js';
import { Graph, impactOf } from './graph.js';
import { aiChecks, computeMetrics, defenseReadiness, mergeIssues, ruleChecks, sortIssues } from './integrity.js';
import * as ai from './ai.js';
import { LLMError, llmAvailable } from './llm.js';
import { textFromFile, textFromUrl } from './extract.js';
import { buildReport, reportMarkdown } from './report.js';
import * as auth from './auth.js';

/** Vercel rejects request bodies over ~4.5 MB, so uploads are capped just below that. */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export const app = express();
app.set('trust proxy', true);
app.use(express.json({ limit: '4mb' }));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES } });

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

/** Every project-scoped lookup goes through ownership checks; other users' data reads as 404. */
async function projectOf(req: Request) {
  const p = await db.getProject(id(req.params.pid));
  if (!p || p.user_id !== req.userId) throw new HttpError(404, 'Project not found');
  return p;
}
async function owned<T extends { project_id: number }>(req: Request, lookup: Promise<T | undefined>): Promise<T> {
  const entity = await lookup;
  if (!entity || (await db.getProject(entity.project_id))?.user_id !== req.userId) throw new HttpError(404, 'Not found');
  return entity;
}
async function graphOf(pid: number, includeSuggested = false) {
  const [nodes, edges] = await Promise.all([db.listNodes(pid, { includeSuggested }), db.listEdges(pid, { includeSuggested })]);
  return new Graph(nodes, edges);
}

app.get('/api/health', (_req, res) => res.json({ ok: true, llm: llmAvailable() }));

// ---------------- auth ----------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

app.post('/api/auth/signup', async (req, res) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const name = String(req.body?.name ?? '').trim().slice(0, 100);
  const password = String(req.body?.password ?? '');
  if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Enter a valid email address');
  if (password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters');
  if (await db.getUserByEmail(email)) throw new HttpError(409, 'An account with that email already exists');
  const first = (await db.countUsers()) === 0;
  const user = await db.createUser(email, name, await auth.hashPassword(password));
  if (first) await db.claimOrphanProjects(user.id);
  await auth.setSession(req, res, user.id);
  res.status(201).json(auth.publicUser(user));
});

app.post('/api/auth/login', async (req, res) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const password = String(req.body?.password ?? '');
  const key = `${email}|${req.ip}`;
  if (auth.throttled(key)) throw new HttpError(429, 'Too many attempts. Try again in 15 minutes.');
  const user = await db.getUserByEmail(email);
  if (!user || !(await auth.verifyPassword(password, user.password_hash))) {
    auth.recordFailure(key);
    throw new HttpError(401, 'Incorrect email or password');
  }
  auth.clearFailures(key);
  await auth.setSession(req, res, user.id);
  res.json(auth.publicUser(user));
});

app.post('/api/auth/logout', (req, res) => {
  auth.clearSession(req, res);
  res.json({ ok: true });
});

app.get('/api/auth/me', async (req, res) => {
  const uid = await auth.sessionUser(req);
  if (!uid) throw new HttpError(401, 'Please sign in');
  res.json(auth.publicUser((await db.getUser(uid))!));
});

// Everything below requires a signed-in user.
app.use('/api', auth.requireAuth);

// ---------------- projects ----------------

app.get('/api/projects', async (req, res) => {
  const projects = await db.listProjects(req.userId!);
  res.json(
    await Promise.all(
      projects.map(async (p) => ({ ...p, latest: (await db.latestRun(p.id))?.metrics ?? null, nodes: (await db.listNodes(p.id)).length })),
    ),
  );
});

app.post('/api/projects', async (req, res) => {
  const b = req.body ?? {};
  if (!String(b.title ?? '').trim()) throw new HttpError(400, 'A project title is required');
  res.status(201).json(await db.createProject(req.userId!, b));
});

app.get('/api/projects/:pid', async (req, res) => res.json(await projectOf(req)));

app.patch('/api/projects/:pid', async (req, res) => {
  const p = await projectOf(req);
  const { brief, ...rest } = req.body ?? {};
  res.json(await db.updateProject(p.id, brief !== undefined ? { ...rest, brief } : rest));
});

app.delete('/api/projects/:pid', async (req, res) => {
  await db.deleteProject((await projectOf(req)).id);
  res.json({ ok: true });
});

/** Live overview: deterministic checks are cheap, so the dashboard never shows stale structure. */
app.get('/api/projects/:pid/summary', async (req, res) => {
  const p = await projectOf(req);
  const [g, feedback, questions, all, runs] = await Promise.all([
    graphOf(p.id),
    db.listFeedback(p.id),
    db.listQuestions(p.id),
    db.listNodes(p.id, { includeSuggested: true }),
    db.listRuns(p.id),
  ]);
  const issues = sortIssues(ruleChecks(g, feedback, p.stage));
  const counts: Record<string, number> = {};
  for (const n of g.nodes) counts[n.type] = (counts[n.type] ?? 0) + 1;
  res.json({
    project: p,
    live: computeMetrics(g, issues, questions),
    issues: issues.filter((i) => i.severity !== 'passed').slice(0, 8),
    counts,
    suggested: all.filter((n) => n.status === 'suggested').length,
    feedback_open: feedback.filter((f) => f.status === 'open' || f.status === 'in_progress').length,
    runs: runs.map((r) => ({ id: r.id, created_at: r.created_at, score: r.metrics.score, include_ai: r.include_ai })),
    defense: defenseReadiness(questions),
  });
});

// ---------------- graph ----------------

app.get('/api/projects/:pid/graph', async (req, res) => {
  const p = await projectOf(req);
  const includeSuggested = req.query.suggested !== '0';
  const [nodes, edges, g] = await Promise.all([db.listNodes(p.id, { includeSuggested }), db.listEdges(p.id, { includeSuggested }), graphOf(p.id)]);
  const claimStatus: Record<number, boolean> = {};
  for (const c of g.ofType('claim')) claimStatus[c.id] = g.claimBacking(c.id).backed;
  res.json({ nodes, edges, claimStatus });
});

app.post('/api/projects/:pid/nodes', async (req, res) => {
  const p = await projectOf(req);
  const b = req.body ?? {};
  if (!NODE_TYPES.includes(b.type)) throw new HttpError(400, 'Unknown component type');
  const node = await db.createNode({
    project_id: p.id,
    type: b.type,
    title: String(b.title ?? '').slice(0, 300),
    content: String(b.content ?? ''),
    provenance: PROVENANCES.includes(b.provenance) ? b.provenance : 'user',
    data: typeof b.data === 'object' && b.data ? b.data : {},
  });
  // Optional convenience: link the new node in the same request.
  if (b.link_from) await linkOrThrow(p.id, id(b.link_from), node.id, b.link_relation);
  if (b.link_to) await linkOrThrow(p.id, node.id, id(b.link_to), b.link_relation);
  res.status(201).json(node);
});

async function linkOrThrow(pid: number, fromId: number, toId: number, relation: string) {
  const a = need(await db.getNode(fromId), 'Source component not found');
  const b = need(await db.getNode(toId), 'Target component not found');
  if (a.project_id !== pid || b.project_id !== pid) throw new HttpError(400, 'Components belong to another project');
  if (!isAllowedRelation(a.type, b.type, relation)) throw new HttpError(400, `A ${a.type} cannot "${relation}" a ${b.type}`);
  return db.createEdge({ project_id: pid, from_id: a.id, to_id: b.id, relation });
}

app.patch('/api/nodes/:id', async (req, res) => {
  const n = await owned(req, db.getNode(id(req.params.id)));
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
  res.json(await db.updateNode(n.id, patch, String(b.note ?? 'Edited')));
});

app.get('/api/nodes/:id/impact', async (req, res) => {
  const n = await owned(req, db.getNode(id(req.params.id)));
  const [g, feedback, questions] = await Promise.all([graphOf(n.project_id, true), db.listFeedback(n.project_id), db.listQuestions(n.project_id)]);
  res.json({
    ...impactOf(g, n.id),
    feedback: feedback.filter((f) => f.affected.includes(n.id)).map((f) => ({ id: f.id, summary: f.summary })),
    defense_questions: questions.filter((q) => q.target_ids.includes(n.id)).length,
  });
});

app.delete('/api/nodes/:id', async (req, res) => {
  const n = await owned(req, db.getNode(id(req.params.id)));
  await db.deleteNode(n.id);
  res.json({ ok: true });
});

app.get('/api/nodes/:id/versions', async (req, res) => {
  const n = await owned(req, db.getNode(id(req.params.id)));
  res.json(await db.nodeVersions(n.id));
});

app.post('/api/nodes/:id/restore', async (req, res) => {
  const n = await owned(req, db.getNode(id(req.params.id)));
  const v = need((await db.nodeVersions(n.id)).find((x: any) => x.version === Number(req.body?.version)), 'Version not found') as any;
  res.json(await db.updateNode(n.id, { title: v.title, content: v.content, provenance: v.provenance, data: v.data }, `Restored version ${v.version}`));
});

app.post('/api/nodes/:id/accept', async (req, res) => {
  const n = await owned(req, db.getNode(id(req.params.id)));
  const node = await db.updateNode(n.id, { status: 'active' }, 'Accepted AI suggestion');
  // Accepting a node also accepts suggested links between it and other active nodes.
  const nodes = new Map((await db.listNodes(n.project_id, { includeSuggested: true })).map((x) => [x.id, x]));
  for (const e of await db.listEdges(n.project_id, { includeSuggested: true })) {
    if (e.status !== 'suggested' || (e.from_id !== n.id && e.to_id !== n.id)) continue;
    const other = nodes.get(e.from_id === n.id ? e.to_id : e.from_id);
    if (other?.status === 'active') await db.setEdgeStatus(e.id, 'active');
  }
  res.json(node);
});

app.post('/api/projects/:pid/edges', async (req, res) => {
  const p = await projectOf(req);
  const b = req.body ?? {};
  res.status(201).json(await linkOrThrow(p.id, id(b.from_id), id(b.to_id), String(b.relation)));
});

app.post('/api/edges/:id/accept', async (req, res) => {
  const e = await owned(req, db.getEdge(id(req.params.id)));
  await db.setEdgeStatus(e.id, 'active');
  res.json({ ok: true });
});

app.delete('/api/edges/:id', async (req, res) => {
  const e = await owned(req, db.getEdge(id(req.params.id)));
  await db.deleteEdge(e.id);
  res.json({ ok: true });
});

app.post('/api/projects/:pid/suggestions/:action', async (req, res) => {
  const p = await projectOf(req);
  const nodes = (await db.listNodes(p.id, { includeSuggested: true })).filter((n) => n.status === 'suggested');
  const edges = (await db.listEdges(p.id, { includeSuggested: true })).filter((e) => e.status === 'suggested');
  if (req.params.action === 'accept-all') {
    for (const n of nodes) await db.updateNode(n.id, { status: 'active' }, 'Accepted AI suggestion');
    for (const e of edges) await db.setEdgeStatus(e.id, 'active');
  } else if (req.params.action === 'reject-all') {
    for (const n of nodes) await db.deleteNode(n.id);
    for (const e of edges) await db.deleteEdge(e.id);
  } else throw new HttpError(400, 'Unknown action');
  res.json({ ok: true });
});

// ---------------- Idea Lab & Blueprint ----------------

app.post('/api/projects/:pid/idea/analyze', async (req, res) => {
  let p = await projectOf(req);
  if (typeof req.body?.idea === 'string') p = (await db.updateProject(p.id, { idea: req.body.idea }))!;
  if (!p.idea.trim()) throw new HttpError(400, 'Describe your idea first');
  const previous: OpportunityBrief | null = req.body?.brief ?? p.brief;
  const brief = await ai.analyzeIdea(p, previous);
  res.json(await db.updateProject(p.id, { brief }));
});

app.post('/api/projects/:pid/blueprint/suggest', async (req, res) => {
  const p = await projectOf(req);
  const g = await graphOf(p.id);
  const s = await ai.suggestBlueprint(p, g);
  const created = new Map<string, { id: number; type: NodeType }>();
  for (const n of s.nodes) {
    const node = await db.createNode({ project_id: p.id, type: n.type, title: n.title, content: n.content, provenance: n.provenance, status: 'suggested', data: { suggested_by: 'blueprint' } });
    created.set(n.key, { id: node.id, type: node.type });
  }
  const resolve = (k: string) => created.get(k) ?? g.byId.get(Number(k));
  let edges = 0;
  for (const e of s.edges) {
    const a = resolve(e.from);
    const b = resolve(e.to);
    if (!a || !b || !isAllowedRelation(a.type, b.type, e.relation)) continue;
    await db.createEdge({ project_id: p.id, from_id: a.id, to_id: b.id, relation: e.relation, status: 'suggested' });
    edges++;
  }
  res.json({ nodes: created.size, edges });
});

// ---------------- Research workspace ----------------

const SOURCE_KINDS = ['paper', 'url', 'note', 'document', 'manual', 'dataset'];

app.post('/api/projects/:pid/sources', upload.single('file'), async (req, res) => {
  const p = await projectOf(req);
  const b = req.body ?? {};
  const kind = SOURCE_KINDS.includes(b.kind) ? b.kind : 'manual';
  let text = String(b.text ?? '');
  let title = String(b.title ?? '').trim();
  const url = String(b.url ?? '').trim();
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
  let node = await db.createNode({
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
      node = await applyExtraction(p.id, node.id, await ai.extractSource(p, await graphOf(p.id), text, { title, url, kind }));
    } catch (e: any) {
      extraction_error = e.message;
    }
  }
  res.status(201).json({ node, extraction_error });
});

async function applyExtraction(pid: number, nodeId: number, x: ai.SourceExtraction) {
  const n = (await db.getNode(nodeId))!;
  const updated = (await db.updateNode(
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
  ))!;
  // Proposed gap relationships stay suggestions until the student confirms them.
  if (x.gap_relationship === 'supports' || x.gap_relationship === 'challenges') {
    for (const gid of x.gap_ids) {
      await db.createEdge({ project_id: pid, from_id: nodeId, to_id: gid, relation: x.gap_relationship === 'supports' ? 'supports_gap' : 'challenges_gap', status: 'suggested' });
    }
  }
  return updated;
}

app.post('/api/nodes/:id/extract', async (req, res) => {
  const n = await owned(req, db.getNode(id(req.params.id)));
  const p = need(await db.getProject(n.project_id));
  const text = [n.data.text, n.content].filter(Boolean).join('\n\n');
  if (text.trim().length < 40) throw new HttpError(400, 'There is not enough text on this source to analyse. Paste an abstract or notes first.');
  res.json(await applyExtraction(p.id, n.id, await ai.extractSource(p, await graphOf(p.id), text, { title: n.title, url: n.data.url, kind: n.data.kind ?? 'manual' })));
});

// ---------------- Integrity engine ----------------

app.post('/api/projects/:pid/check', async (req, res) => {
  const p = await projectOf(req);
  const [g, feedback, questions] = await Promise.all([graphOf(p.id), db.listFeedback(p.id), db.listQuestions(p.id)]);
  const includeAi = !!req.body?.include_ai && llmAvailable();
  let issues = ruleChecks(g, feedback, p.stage);
  let ai_error: string | null = null;
  if (includeAi) {
    try {
      issues = mergeIssues(issues, await aiChecks(p, g));
    } catch (e: any) {
      ai_error = e.message;
    }
  }
  const sorted = sortIssues(issues);
  res.json(await db.saveRun({ project_id: p.id, include_ai: includeAi, metrics: computeMetrics(g, sorted, questions), issues: sorted, ai_error }));
});

app.get('/api/projects/:pid/runs', async (req, res) => res.json(await db.listRuns((await projectOf(req)).id)));

// ---------------- Feedback ----------------

app.get('/api/projects/:pid/feedback', async (req, res) => res.json(await db.listFeedback((await projectOf(req)).id)));

app.post('/api/projects/:pid/feedback', async (req, res) => {
  const p = await projectOf(req);
  const text = String(req.body?.text ?? '').trim();
  if (!text) throw new HttpError(400, 'Enter the feedback text');
  let parsed = { summary: text.slice(0, 200), location: '', affected: [] as number[], actions: [] as { text: string; done: boolean }[] };
  let parse_error: string | null = null;
  if (req.body?.parse !== false && llmAvailable()) {
    try {
      parsed = await ai.parseFeedback(p, await graphOf(p.id), text);
    } catch (e: any) {
      parse_error = e.message;
    }
  }
  const fb = await db.createFeedback({ project_id: p.id, raw_text: text, ...parsed, status: 'open', supervisor: String(req.body?.supervisor ?? '') });
  res.status(201).json({ feedback: fb, parse_error });
});

app.patch('/api/feedback/:id', async (req, res) => {
  const f = await owned(req, db.getFeedback(id(req.params.id)));
  const b = req.body ?? {};
  const statuses: FeedbackStatus[] = ['open', 'in_progress', 'resolved', 'rejected'];
  res.json(
    await db.updateFeedback(f.id, {
      ...(typeof b.summary === 'string' ? { summary: b.summary } : {}),
      ...(typeof b.location === 'string' ? { location: b.location } : {}),
      ...(Array.isArray(b.affected) ? { affected: b.affected.map(Number).filter(Number.isInteger) } : {}),
      ...(Array.isArray(b.actions) ? { actions: b.actions.map((a: any) => ({ text: String(a.text ?? ''), done: !!a.done })) } : {}),
      ...(statuses.includes(b.status) ? { status: b.status } : {}),
      ...(typeof b.supervisor === 'string' ? { supervisor: b.supervisor } : {}),
    }),
  );
});

app.delete('/api/feedback/:id', async (req, res) => {
  const f = await owned(req, db.getFeedback(id(req.params.id)));
  await db.deleteFeedback(f.id);
  res.json({ ok: true });
});

// ---------------- Defense simulator ----------------

app.get('/api/projects/:pid/defense', async (req, res) => {
  const p = await projectOf(req);
  const questions = await db.listQuestions(p.id);
  res.json({ questions, readiness: defenseReadiness(questions) });
});

app.post('/api/projects/:pid/defense/generate', async (req, res) => {
  const p = await projectOf(req);
  const g = await graphOf(p.id);
  if (!g.nodes.length) throw new HttpError(400, 'Build your blueprint first — questions are generated from your project graph.');
  const weak = ((await db.latestRun(p.id))?.issues ?? ruleChecks(g, await db.listFeedback(p.id), p.stage))
    .filter((i) => i.severity === 'critical' || i.severity === 'warning')
    .slice(0, 12)
    .map((i) => i.title);
  const qs = await ai.generateDefenseQuestions(p, g, Math.min(18, Math.max(6, Number(req.body?.count) || 12)), weak);
  if (req.body?.replace) await db.clearQuestions(p.id);
  for (const q of qs) await db.createQuestion({ project_id: p.id, ...q });
  res.json({ created: qs.length });
});

app.post('/api/projects/:pid/defense/custom', async (req, res) => {
  const p = await projectOf(req);
  const question = String(req.body?.question ?? '').trim();
  if (!question) throw new HttpError(400, 'Enter a question');
  const category = DEFENSE_CATEGORIES.includes(req.body?.category) ? req.body.category : 'fundamentals';
  res.status(201).json(await db.createQuestion({ project_id: p.id, category, question, rationale: 'Added by student', risk: 'medium', target_ids: [] }));
});

app.post('/api/defense/:id/answer', async (req, res) => {
  const q = await owned(req, db.getQuestion(id(req.params.id)));
  const p = need(await db.getProject(q.project_id));
  const answer = String(req.body?.answer ?? '').trim();
  if (!answer) throw new HttpError(400, 'Enter an answer first');
  const evaluation = await ai.evaluateAnswer(p, await graphOf(p.id), q, answer);
  res.json(await db.saveAnswer(q.id, answer, evaluation));
});

app.delete('/api/defense/:id', async (req, res) => {
  const q = await owned(req, db.getQuestion(id(req.params.id)));
  await db.deleteQuestion(q.id);
  res.json({ ok: true });
});

// ---------------- Writing assistant & report ----------------

app.post('/api/projects/:pid/assist', async (req, res) => {
  const p = await projectOf(req);
  const mode = (Object.keys(ai.WRITING_MODES).includes(req.body?.mode) ? req.body.mode : 'ask') as ai.WritingMode;
  const message = String(req.body?.message ?? '').trim();
  if (!message) throw new HttpError(400, 'Enter a message');
  const history = Array.isArray(req.body?.history) ? req.body.history : [];
  res.json(await ai.assist(p, await graphOf(p.id), mode, message, history));
});

/** Accepting a suggested edit from the assistant — the only way AI text enters the project. */
app.post('/api/projects/:pid/apply-edit', async (req, res) => {
  const p = await projectOf(req);
  const b = req.body ?? {};
  if (b.node_id) {
    const n = await owned(req, db.getNode(id(b.node_id)));
    if (n.project_id !== p.id) throw new HttpError(400, 'Component belongs to another project');
    res.json(await db.updateNode(n.id, { title: b.title || n.title, content: String(b.content ?? n.content), provenance: 'ai_suggestion' }, 'Accepted assistant edit'));
  } else {
    if (!NODE_TYPES.includes(b.type)) throw new HttpError(400, 'Unknown component type');
    res.status(201).json(await db.createNode({ project_id: p.id, type: b.type, title: String(b.title ?? ''), content: String(b.content ?? ''), provenance: 'ai_suggestion' }));
  }
});

app.get('/api/projects/:pid/report', async (req, res) => {
  const p = await projectOf(req);
  const chapters = buildReport(p, await graphOf(p.id));
  if (req.query.format === 'md') {
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${p.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.md"`);
    res.send(reportMarkdown(p, chapters));
    return;
  }
  res.json(chapters);
});

// ---------------- static + errors ----------------

// Local production only; on Vercel the static build is served by the platform.
const dist = path.join(process.cwd(), 'dist');
if (!process.env.VERCEL && fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status =
    err instanceof HttpError ? err.status : err instanceof LLMError ? 502 : err?.code === 'LIMIT_FILE_SIZE' ? 413 : 500;
  if (status === 500) console.error(err);
  const message = status === 413 ? 'File is too large — the limit is 4 MB. Paste the abstract instead, or upload a smaller PDF.' : err?.message ?? 'Server error';
  res.status(status).json({ error: message });
});

export default app;
