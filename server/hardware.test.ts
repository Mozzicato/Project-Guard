import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { NodeType, PEdge, PNode, Relation } from '../shared/model.js';
import { Graph } from './graph.js';
import { computeMetrics, ruleChecks } from './integrity.js';

let nid = 1000;
let eid = 1000;
const node = (type: NodeType, data: Record<string, any> = {}, title: string = type): PNode => ({
  id: ++nid, project_id: 1, type, title, content: '', provenance: 'user', status: 'active', data, version: 1, created_at: '', updated_at: '',
});
const edge = (a: PNode, b: PNode, relation: Relation): PEdge => ({ id: ++eid, project_id: 1, from_id: a.id, to_id: b.id, relation, status: 'active', created_at: '' });
const hw = (g: Graph, stage = 'implementation') => ruleChecks(g, [], stage, 'hardware');

function tracedProject(testStatus = 'pass') {
  const obj = node('objective');
  const req = node('requirement', { target: '≤ 2', unit: 's', verification: 'test' });
  const dsn = node('design', { kind: 'block_diagram' });
  const cmp = node('component', { part: 'ESP32', qty: 1, unit_cost: 4500 });
  const tst = node('test', { expected: '≤ 2 s', measured: '1.4 s', status: testStatus });
  const nodes = [obj, req, dsn, cmp, tst];
  const edges = [edge(obj, req, 'specified_by'), edge(req, dsn, 'realized_by'), edge(dsn, cmp, 'uses'), edge(req, tst, 'verified_by')];
  return { nodes, edges, req, tst, cmp };
}

test('a fully traced requirement passes the traceability check', () => {
  const { nodes, edges } = tracedProject();
  const issues = hw(new Graph(nodes, edges));
  assert.ok(issues.some((i) => i.check === 'R' && i.severity === 'passed'));
  assert.ok(!issues.some((i) => (i.check === 'R' || i.check === 'V') && (i.severity === 'critical' || i.severity === 'warning')));
});

test('an untested requirement is critical after the build starts, a warning before', () => {
  const obj = node('objective');
  const req = node('requirement', { target: '8', unit: 'h' });
  const g = new Graph([obj, req], [edge(obj, req, 'specified_by')]);
  assert.equal(hw(g, 'implementation').find((i) => i.check === 'V' && i.affected.includes(req.id))?.severity, 'critical');
  assert.equal(hw(g, 'proposal').find((i) => i.check === 'V' && i.affected.includes(req.id))?.severity, 'warning');
});

test('a requirement without a target is flagged as not measurable', () => {
  const obj = node('objective');
  const req = node('requirement', {}, 'Fast response');
  const issues = hw(new Graph([obj, req], [edge(obj, req, 'specified_by')]));
  assert.ok(issues.some((i) => i.check === 'R' && i.title.includes('not measurable')));
});

test('a failed test is reported against its requirement', () => {
  const { nodes, edges, req, tst } = tracedProject('fail');
  const f = hw(new Graph(nodes, edges)).find((i) => i.check === 'V' && i.title.includes('failed'));
  assert.ok(f);
  assert.deepEqual(new Set(f!.affected), new Set([req.id, tst.id]));
});

test('unpriced components and untraced parts are reported; BOM total is computed', () => {
  const { nodes, edges } = tracedProject();
  const loose = node('component', { qty: 2 }, 'Buzzer');
  const g = new Graph([...nodes, loose], edges);
  const issues = hw(g);
  assert.ok(issues.some((i) => i.check === 'R' && i.title.includes('not traced')));
  assert.ok(issues.some((i) => i.check === 'R' && i.title.includes('no quantity or unit cost')));
  const m = computeMetrics(g, issues, []);
  assert.equal(m.bom_total, 4500);
  assert.equal(m.requirements_verified, 1);
  assert.equal(m.requirements_total, 1);
});

test('research projects are not judged on hardware rules', () => {
  const obj = node('objective');
  const issues = ruleChecks(new Graph([obj], []), [], 'implementation', 'research');
  assert.ok(!issues.some((i) => i.check === 'R' || i.check === 'V'));
  assert.ok(issues.some((i) => i.title.includes('Research questions')));
});
