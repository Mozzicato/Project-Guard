import { useEffect, useMemo, useState } from 'react';
import { Background, Controls, Handle, MarkerType, Position, ReactFlow, type Edge, type Node, type NodeProps } from '@xyflow/react';
import { NODE_LABELS, NODE_PREFIX, relationLabel, type NodeType, type PNode } from '../../shared/model';
import { api, type Summary } from '../api';
import { NodeCard, useProject } from '../project';
import { titleCase } from '../ui';
import { TYPE_COLOR } from '../sections';
import { SectionBadge } from '../sections';

const COLUMN: Record<NodeType, number> = {
  claim: 0,
  source: 2,
  problem: 2,
  scope: 2,
  research_gap: 3,
  aim: 3,
  objective: 4,
  research_question: 5,
  limitation: 5,
  method: 6,
  evaluation: 7,
  experiment: 7,
  evidence: 8,
  result: 9,
  conclusion: 10,
  contribution: 11,
  requirement: 5,
  design: 6,
  component: 7,
  test: 8,
};

/** Literature evidence (backing a claim, derived from a source) sits between claims and sources. */
function columnOf(n: PNode, edges: { from_id: number; to_id: number }[], byId: Map<number, PNode>): number {
  if (n.type !== 'evidence') return COLUMN[n.type];
  const producedByMethod = edges.some((e) => e.to_id === n.id && ['method', 'experiment'].includes(byId.get(e.from_id)?.type ?? ''));
  return producedByMethod ? COLUMN.evidence : 1;
}


type GData = { node: PNode; bad: boolean; hl: boolean; dim: boolean; unbacked: boolean };

function GNode({ data }: NodeProps<Node<GData>>) {
  const { node, bad, hl, dim, unbacked } = data;
  return (
    <div className={`gnode${bad ? ' bad' : ''}${hl ? ' hl' : ''}${dim ? ' dim' : ''}${node.status === 'suggested' ? ' suggested' : ''}`} style={{ borderTopColor: TYPE_COLOR[node.type], borderTopWidth: 4 }}>
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <div className="gt" style={{ color: TYPE_COLOR[node.type] }}>
        {NODE_PREFIX[node.type]}-{node.id} · {NODE_LABELS[node.type].toUpperCase()}
      </div>
      <div className="gl">{node.title || '(untitled)'}</div>
      {unbacked && <div className="tiny" style={{ color: 'var(--crit)', fontWeight: 600, marginTop: 2 }}>no evidence</div>}
      {node.status === 'suggested' && <div className="tiny" style={{ color: 'var(--prov-suggestion)', fontWeight: 600, marginTop: 2 }}>suggested</div>}
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  );
}
const nodeTypes = { g: GNode };

export default function GraphView() {
  const { project, graph } = useProject();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [hidden, setHidden] = useState<Set<NodeType>>(new Set());
  const [showSuggested, setShowSuggested] = useState(true);

  useEffect(() => {
    api.summary(project.id).then(setSummary);
  }, [project.id, graph]);

  const visible = graph.nodes.filter((n) => !hidden.has(n.type) && (showSuggested || n.status === 'active'));
  const visIds = new Set(visible.map((n) => n.id));
  const visEdges = graph.edges.filter((e) => visIds.has(e.from_id) && visIds.has(e.to_id) && (showSuggested || e.status === 'active'));
  const flagged = new Set((summary?.issues ?? []).flatMap((i) => (i.severity === 'critical' || i.severity === 'warning' ? i.affected : [])));

  // Dependency trace for the selected node: everything upstream and downstream.
  const related = useMemo(() => {
    if (selected == null) return null;
    const set = new Set<number>([selected]);
    const walk = (dir: 'down' | 'up') => {
      const stack = [selected];
      const seen = new Set<number>([selected]);
      while (stack.length) {
        const cur = stack.pop()!;
        for (const e of visEdges) {
          const next = dir === 'down' ? (e.from_id === cur ? e.to_id : null) : e.to_id === cur ? e.from_id : null;
          if (next != null && !seen.has(next)) {
            seen.add(next);
            set.add(next);
            stack.push(next);
          }
        }
      }
    };
    walk('down');
    walk('up');
    return set;
  }, [selected, visEdges]);

  const { nodes, edges } = useMemo(() => {
    // Layered layout: columns follow the research chain; order within a column by parents' positions.
    const byId = new Map(visible.map((n) => [n.id, n]));
    const colOf = new Map(visible.map((n) => [n.id, columnOf(n, visEdges, byId)]));
    const cols = new Map<number, PNode[]>();
    for (const n of visible) {
      const c = colOf.get(n.id)!;
      if (!cols.has(c)) cols.set(c, []);
      cols.get(c)!.push(n);
    }
    const y = new Map<number, number>();
    const order = [...cols.keys()].sort((a, b) => a - b);
    const X = 240;
    const Y = 96;
    for (const c of order) {
      const list = cols.get(c)!;
      const bary = (n: PNode) => {
        const ps = visEdges.filter((e) => e.to_id === n.id && y.has(e.from_id)).map((e) => y.get(e.from_id)!);
        const cs = visEdges.filter((e) => e.from_id === n.id && y.has(e.to_id)).map((e) => y.get(e.to_id)!);
        const all = [...ps, ...cs];
        return all.length ? all.reduce((a, b) => a + b, 0) / all.length : Number.MAX_SAFE_INTEGER / 2 + n.id;
      };
      list.sort((a, b) => bary(a) - bary(b) || a.type.localeCompare(b.type) || a.id - b.id);
      list.forEach((n, i) => y.set(n.id, i));
    }
    const maxLen = Math.max(1, ...[...cols.values()].map((l) => l.length));
    const nodes: Node<GData>[] = visible.map((n) => {
      const c = colOf.get(n.id)!;
      const offset = ((maxLen - cols.get(c)!.length) * Y) / 2;
      return {
        id: String(n.id),
        type: 'g',
        position: { x: order.indexOf(c) * X, y: offset + y.get(n.id)! * Y },
        data: {
          node: n,
          bad: flagged.has(n.id),
          hl: n.id === selected,
          dim: !!related && !related.has(n.id),
          unbacked: n.type === 'claim' && graph.claimStatus[n.id] === false,
        },
      };
    });
    const edges: Edge[] = visEdges.map((e) => {
      const on = !related || (related.has(e.from_id) && related.has(e.to_id));
      const challenge = e.relation === 'challenges_gap';
      return {
        id: String(e.id),
        source: String(e.from_id),
        target: String(e.to_id),
        label: selected != null && on ? relationLabel(e.relation) : undefined,
        labelStyle: { fontSize: 10, fill: 'var(--ink-2)' },
        labelBgStyle: { fill: 'var(--panel)' },
        animated: e.status === 'suggested',
        style: { stroke: challenge ? 'var(--warn)' : on ? 'var(--line-2)' : 'var(--line)', strokeWidth: on && related ? 2 : 1.3, opacity: on ? 1 : 0.25, strokeDasharray: e.status === 'suggested' || challenge ? '5 4' : undefined },
        markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: challenge ? 'var(--warn)' : 'var(--line-2)' },
      };
    });
    return { nodes, edges };
  }, [visible, visEdges, flagged, selected, related, graph.claimStatus]);

  const sel = selected != null ? graph.nodes.find((n) => n.id === selected) : undefined;
  const typesPresent = [...new Set(graph.nodes.map((n) => n.type))].sort((a, b) => COLUMN[a] - COLUMN[b]);

  return (
    <div className="page wide" style={{ paddingBottom: 16 }}>
      <div className="page-head" style={{ marginBottom: 12 }}>
        <div>
          <h1 className="page-title"><SectionBadge id="graph" />Knowledge Graph</h1>
          <p>The project as a connected research system. Red outline = flagged by the integrity engine. Click a component to trace everything that depends on it.</p>
        </div>
        <label className="row small muted" style={{ gap: 6 }}>
          <input type="checkbox" checked={showSuggested} onChange={(e) => setShowSuggested(e.target.checked)} /> Show suggestions
        </label>
      </div>
      <div className="legend" style={{ marginBottom: 10 }}>
        {typesPresent.map((t) => (
          <span key={t} style={{ cursor: 'pointer', opacity: hidden.has(t) ? 0.35 : 1 }} onClick={() => setHidden((h) => { const n = new Set(h); n.has(t) ? n.delete(t) : n.add(t); return n; })} title="Click to show/hide">
            <i style={{ background: TYPE_COLOR[t] }} /> {titleCase(NODE_LABELS[t])}
          </span>
        ))}
      </div>
      <div className="graph-wrap">
        {graph.nodes.length === 0 ? (
          <div className="empty" style={{ margin: 40 }}>Your graph is empty — build the blueprint first.</div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.06, minZoom: 0.5 }}
            minZoom={0.15}
            nodesConnectable={false}
            onNodeClick={(_, n) => setSelected(Number(n.id))}
            onPaneClick={() => setSelected(null)}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={24} color="var(--line)" />
            <Controls showInteractive={false} />
          </ReactFlow>
        )}
        {sel && (
          <div className="graph-side card card-pad stack">
            <div className="row between">
              <span className="small bold muted">Selected</span>
              <button className="btn sm ghost" onClick={() => setSelected(null)}>✕</button>
            </div>
            <NodeCard node={sel} />
            {related && (
              <div className="small muted">
                Connected chain: <b>{related.size - 1}</b> component(s). Deleting or changing this affects everything highlighted.
              </div>
            )}
            {(summary?.issues ?? []).filter((i) => i.affected.includes(sel.id)).map((i) => (
              <div key={i.id} className={`issue ${i.severity}`} style={{ padding: '8px 10px' }}>
                <div className="small bold">{i.title}</div>
                <div className="tiny muted">{i.action}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
