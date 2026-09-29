import { NODE_LABELS, nodeRef, type NodeType, type PEdge, type PNode, type Project } from '../shared/model.js';

/** In-memory view of a project graph with fast adjacency lookups. */
export class Graph {
  readonly byId = new Map<number, PNode>();
  readonly out = new Map<number, PEdge[]>();
  readonly inc = new Map<number, PEdge[]>();

  constructor(
    readonly nodes: PNode[],
    readonly edges: PEdge[],
  ) {
    for (const n of nodes) {
      this.byId.set(n.id, n);
      this.out.set(n.id, []);
      this.inc.set(n.id, []);
    }
    for (const e of edges) {
      if (!this.byId.has(e.from_id) || !this.byId.has(e.to_id)) continue;
      this.out.get(e.from_id)!.push(e);
      this.inc.get(e.to_id)!.push(e);
    }
  }

  ofType(...types: NodeType[]): PNode[] {
    return this.nodes.filter((n) => types.includes(n.type));
  }

  children(id: number, ...types: NodeType[]): PNode[] {
    return (this.out.get(id) ?? [])
      .map((e) => this.byId.get(e.to_id)!)
      .filter((n) => !types.length || types.includes(n.type));
  }

  parents(id: number, ...types: NodeType[]): PNode[] {
    return (this.inc.get(id) ?? [])
      .map((e) => this.byId.get(e.from_id)!)
      .filter((n) => !types.length || types.includes(n.type));
  }

  /**
   * Nodes reachable following edges in one direction. `through` limits which node types
   * the walk may pass through (the start node is always allowed).
   */
  reach(id: number, dir: 'down' | 'up', through?: NodeType[]): PNode[] {
    const seen = new Set<number>([id]);
    const result: PNode[] = [];
    const stack = [id];
    while (stack.length) {
      const cur = stack.pop()!;
      const next = dir === 'down' ? this.children(cur) : this.parents(cur);
      for (const n of next) {
        if (seen.has(n.id)) continue;
        seen.add(n.id);
        result.push(n);
        if (!through || through.includes(n.type)) stack.push(n.id);
      }
    }
    return result;
  }

  /** The research chain downstream of an objective (does not wander into sources/claims). */
  chainDown(id: number): PNode[] {
    return this.reach(id, 'down', ['objective', 'research_question', 'method', 'experiment', 'evidence', 'result', 'conclusion', 'requirement', 'design', 'test']);
  }

  chainUp(id: number): PNode[] {
    return this.reach(id, 'up', ['conclusion', 'result', 'evidence', 'experiment', 'method', 'research_question', 'objective', 'test', 'requirement', 'design']);
  }

  /** FR-05: a claim is evidence-backed only if it is linked to evidence or a source. */
  claimBacking(claimId: number): { backed: boolean; evidence: PNode[]; sources: PNode[] } {
    const evidence = this.children(claimId, 'evidence');
    const sources = this.children(claimId, 'source');
    for (const ev of evidence) sources.push(...this.children(ev.id, 'source'));
    return { backed: evidence.length > 0 || sources.length > 0, evidence, sources: dedupe(sources) };
  }

  objectiveCoverage(objId: number) {
    const down = this.chainDown(objId);
    const has = (t: NodeType) => down.some((n) => n.type === t);
    return {
      research_question: has('research_question'),
      method: has('method'),
      evidence_or_result: has('result') || has('evidence') || has('experiment') || has('test'),
      result: has('result'),
      conclusion: has('conclusion'),
      requirement: has('requirement'),
      design: has('design') || down.some((n) => n.type === 'requirement' && this.children(n.id, 'component').length > 0),
      test: has('test'),
    };
  }

  /** Hardware track: how far a requirement is traced — realised in the design, and verified by a test. */
  requirementTrace(reqId: number) {
    const tests = this.children(reqId, 'test');
    const realized = this.children(reqId, 'design', 'component');
    const passed = tests.filter((t) => t.data?.status === 'pass');
    const failed = tests.filter((t) => t.data?.status === 'fail');
    return { realized, tests, passed, failed, verified: passed.length > 0 && failed.length === 0 };
  }

  bomTotal(): number {
    return this.ofType('component').reduce((sum, c) => sum + (Number(c.data?.qty) || 0) * (Number(c.data?.unit_cost) || 0), 0);
  }
}

function dedupe(ns: PNode[]): PNode[] {
  const m = new Map<number, PNode>();
  for (const n of ns) m.set(n.id, n);
  return [...m.values()];
}

/** FR-06: what depends on a node — used to warn before deletion or major edits. */
export function impactOf(g: Graph, id: number) {
  const node = g.byId.get(id);
  if (!node) return null;
  const downstream = g.reach(id, 'down');
  const direct = [...g.children(id), ...g.parents(id)];
  // Nodes that would be left with no incoming link of their structural kind.
  const orphaned = g.children(id).filter((c) => g.parents(c.id).every((p) => p.id === id));
  const byType: Record<string, { id: number; ref: string; title: string }[]> = {};
  for (const n of downstream) {
    (byType[n.type] ??= []).push({ id: n.id, ref: nodeRef(n), title: n.title });
  }
  return {
    node: { id: node.id, ref: nodeRef(node), title: node.title, type: node.type },
    direct_links: direct.length,
    downstream_count: downstream.length,
    downstream_by_type: byType,
    orphaned: orphaned.map((n) => ({ id: n.id, ref: nodeRef(n), title: n.title, type: n.type })),
  };
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

/**
 * Serialise the project graph for LLM prompts. Nodes are referenced as `#<id>` so that
 * model output can be traced back to real project components (NFR-01).
 */
export function graphContext(project: Project, g: Graph, opts: { contentChars?: number } = {}): string {
  const limit = opts.contentChars ?? 600;
  const lines: string[] = [];
  lines.push(`PROJECT: ${project.title}`);
  lines.push(`Discipline: ${project.discipline || 'n/a'} | Department: ${project.department || 'n/a'} | Type: ${project.project_type || 'n/a'} | Track: ${project.track === 'hardware' ? 'HARDWARE / engineering build' : 'research'} | Stage: ${project.stage}`);
  if (project.idea) lines.push(`Original idea: ${clip(project.idea, 800)}`);
  lines.push('', 'COMPONENTS (reference them as #id):');
  for (const n of g.nodes) {
    const extra: string[] = [];
    if (n.type === 'source') {
      const d = n.data ?? {};
      if (d.authors) extra.push(`authors: ${d.authors}`);
      if (d.year) extra.push(`year: ${d.year}`);
      if (d.summary) extra.push(`summary: ${clip(String(d.summary), 400)}`);
      if (Array.isArray(d.key_claims) && d.key_claims.length) extra.push(`key claims: ${d.key_claims.slice(0, 5).join('; ')}`);
      if (Array.isArray(d.limitations) && d.limitations.length) extra.push(`limitations: ${d.limitations.slice(0, 3).join('; ')}`);
    }
    if (n.type === 'claim') extra.push(g.claimBacking(n.id).backed ? 'status: evidence-backed' : 'status: UNSUPPORTED ASSERTION');
    const d = n.data ?? {};
    if (n.type === 'requirement') extra.push(`target: ${d.target ? `${d.target} ${d.unit ?? ''}`.trim() : 'NOT MEASURABLE (no target)'}`, `verify by: ${d.verification ?? 'unspecified'}`);
    if (n.type === 'component') extra.push(`part: ${d.part || 'n/a'}`, `qty: ${d.qty ?? '?'}`, `unit cost: ${d.unit_cost ?? '?'}`);
    if (n.type === 'design') extra.push(`kind: ${d.kind ?? 'n/a'}`);
    if (n.type === 'test') extra.push(`expected: ${d.expected || 'n/a'}`, `measured: ${d.measured || 'not yet measured'}`, `status: ${d.status ?? 'planned'}`);
    lines.push(
      `#${n.id} [${NODE_LABELS[n.type]}] (${n.provenance}) ${n.title}${n.content ? ` — ${clip(n.content, limit)}` : ''}${extra.length ? ` {${extra.join(' | ')}}` : ''}`,
    );
  }
  lines.push('', 'RELATIONSHIPS:');
  if (!g.edges.length) lines.push('(none)');
  for (const e of g.edges) lines.push(`#${e.from_id} -${e.relation}-> #${e.to_id}`);
  return lines.join('\n');
}

/** Rewrite model-style references ("#12", "[#12]") into the refs students see in the UI ("OBJ-12"). */
export function humanizeRefs(g: Graph, text: string): string {
  return text.replace(/\[?#(\d+)\]?/g, (m, id) => {
    const n = g.byId.get(Number(id));
    return n ? nodeRef(n) : m;
  });
}

/** Keep only ids that exist in the graph — never trust model-produced references blindly. */
export function validIds(g: Graph, ids: unknown): number[] {
  if (!Array.isArray(ids)) return [];
  const out = new Set<number>();
  for (const raw of ids) {
    const n = typeof raw === 'number' ? raw : Number(String(raw).replace(/[^0-9]/g, ''));
    if (Number.isFinite(n) && g.byId.has(n)) out.add(n);
  }
  return [...out];
}
