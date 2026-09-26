import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { NodeType, PEdge, PNode, Relation } from '../shared/model.js';
import { Graph, impactOf } from './graph.js';
import { computeMetrics, mergeIssues, ruleChecks } from './integrity.js';

let nid = 0;
let eid = 0;
const node = (type: NodeType, title: string = type): PNode => ({
  id: ++nid,
  project_id: 1,
  type,
  title,
  content: '',
  provenance: 'user',
  status: 'active',
  data: {},
  version: 1,
  created_at: '',
  updated_at: '',
});
const edge = (a: PNode, b: PNode, relation: Relation): PEdge => ({ id: ++eid, project_id: 1, from_id: a.id, to_id: b.id, relation, status: 'active', created_at: '' });

function fullChain() {
  const problem = node('problem');
  const gap = node('research_gap');
  const src = node('source');
  const obj = node('objective');
  const rq = node('research_question');
  const method = node('method');
  const exp = node('experiment');
  const result = node('result');
  const concl = node('conclusion');
  const nodes = [problem, gap, src, obj, rq, method, exp, result, concl];
  const edges = [
    edge(problem, gap, 'motivates'),
    edge(src, gap, 'supports_gap'),
    edge(gap, obj, 'addressed_by'),
    edge(obj, rq, 'refined_into'),
    edge(rq, method, 'investigated_by'),
    edge(method, exp, 'operationalized_as'),
    edge(exp, result, 'produces'),
    edge(result, concl, 'supports'),
  ];
  return { nodes, edges, obj, result, concl, gap, method };
}

const has = (issues: ReturnType<typeof ruleChecks>, check: string, severity: string, text: string) =>
  issues.some((i) => i.check === check && i.severity === severity && i.title.includes(text));

test('a complete objective chain passes coverage', () => {
  const { nodes, edges } = fullChain();
  const issues = ruleChecks(new Graph(nodes, edges), []);
  assert.ok(has(issues, 'A', 'passed', 'Every objective traces'));
  assert.ok(has(issues, 'E', 'passed', 'All reported results map'));
  assert.ok(has(issues, 'F', 'passed', 'address every objective'));
  assert.ok(has(issues, 'D', 'passed', 'supported by 1 source'));
});

test('objective without method is critical', () => {
  const obj = node('objective', 'Lonely objective');
  const issues = ruleChecks(new Graph([obj], []), []);
  const i = issues.find((x) => x.check === 'A' && x.affected.includes(obj.id));
  assert.equal(i?.severity, 'critical');
  assert.match(i!.title, /method/);
});

test('unsupported claims are flagged and become backed once linked', () => {
  const claim = node('claim');
  const src = node('source');
  let issues = ruleChecks(new Graph([claim, src], []), []);
  assert.ok(issues.some((i) => i.check === 'C' && i.affected.includes(claim.id) && i.severity !== 'passed'));
  issues = ruleChecks(new Graph([claim, src], [edge(claim, src, 'cites')]), []);
  assert.ok(has(issues, 'C', 'passed', 'All claims are evidence-backed'));
});

test('orphan result is not aligned to an objective', () => {
  const { nodes, edges } = fullChain();
  const stray = node('result', 'Stray result');
  const issues = ruleChecks(new Graph([...nodes, stray], edges), []);
  assert.ok(issues.some((i) => i.check === 'E' && i.affected.includes(stray.id)));
});

test('gap with no literature is critical; contested gap warns', () => {
  const gap = node('research_gap');
  let issues = ruleChecks(new Graph([gap], []), []);
  assert.ok(issues.some((i) => i.check === 'D' && i.severity === 'critical'));
  const s1 = node('source');
  const s2 = node('source');
  issues = ruleChecks(new Graph([gap, s1, s2], [edge(s1, gap, 'supports_gap'), edge(s2, gap, 'challenges_gap')]), []);
  assert.ok(issues.some((i) => i.check === 'D' && i.severity === 'warning' && i.title.includes('contested')));
});

test('open feedback produces a warning', () => {
  const issues = ruleChecks(new Graph([], []), [
    { id: 1, project_id: 1, raw_text: 'Justify sampling', summary: 'Justify sampling', location: '', affected: [], actions: [{ text: 'x', done: false }], status: 'open', supervisor: '', created_at: '', updated_at: '' },
  ]);
  assert.ok(issues.some((i) => i.check === 'FB' && i.severity === 'warning'));
});

test('impact analysis finds downstream dependencies of an objective', () => {
  const { nodes, edges, obj, result, concl } = fullChain();
  const imp = impactOf(new Graph(nodes, edges), obj.id)!;
  const ids = Object.values(imp.downstream_by_type).flat().map((n) => n.id);
  assert.ok(ids.includes(result.id));
  assert.ok(ids.includes(concl.id));
});

test('metrics: defensibility rate and objective coverage', () => {
  const { nodes, edges } = fullChain();
  const g = new Graph(nodes, edges);
  const m = computeMetrics(g, ruleChecks(g, []), []);
  assert.equal(m.objectives_covered, 1);
  assert.equal(m.defensibility_rate, 100);
  const broken = new Graph(nodes, edges.slice(0, 4));
  const m2 = computeMetrics(broken, ruleChecks(broken, []), []);
  assert.ok(m2.defensibility_rate < 100);
  assert.ok(m2.score < m.score);
});

test('AI findings that restate a rule finding are dropped', () => {
  const gap = node('research_gap');
  const rules = ruleChecks(new Graph([gap], []), []);
  const ai = [
    { id: 'x', check: 'D' as const, severity: 'warning' as const, title: 'Gap lacks literature', why: '', affected: [gap.id], evidence: '', action: '', origin: 'ai' as const },
    { id: 'y', check: 'H' as const, severity: 'critical' as const, title: 'Contradiction', why: '', affected: [gap.id], evidence: '', action: '', origin: 'ai' as const },
  ];
  const merged = mergeIssues(rules, ai);
  assert.ok(!merged.some((i) => i.id === 'x'));
  assert.ok(merged.some((i) => i.id === 'y'));
});

test('missing results are informational before implementation, warnings after', () => {
  const obj = node('objective');
  const rq = node('research_question');
  const m = node('method');
  const g = new Graph([obj, rq, m], [edge(obj, rq, 'refined_into'), edge(rq, m, 'investigated_by')]);
  const early = ruleChecks(g, [], 'proposal').find((i) => i.check === 'A' && i.affected.includes(obj.id));
  const late = ruleChecks(g, [], 'analysis').find((i) => i.check === 'A' && i.affected.includes(obj.id));
  assert.equal(early?.severity, 'info');
  assert.equal(late?.severity, 'warning');
});
