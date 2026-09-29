import { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { NODE_LABELS, type NodeType, type PNode } from '../../shared/model';
import { api } from '../api';
import { NodeCard, Ref, useProject } from '../project';
import { Spinner, useAction } from '../ui';
import { Icon, SectionBadge, TYPE_COLOR } from '../sections';

const SECTIONS: { title: string; types: NodeType[]; hint: string }[] = [
  { title: 'Foundation', types: ['problem', 'research_gap', 'aim'], hint: 'What problem, what gap in existing work, and what you aim to do about it.' },
  { title: 'Objectives & questions', types: ['objective', 'research_question'], hint: 'Specific objectives, each refined into research questions.' },
  { title: 'Boundaries', types: ['scope', 'limitation'], hint: 'What is in and out, and what constrains the study.' },
  { title: 'Methodology', types: ['method', 'evaluation'], hint: 'How each objective will be investigated and how success is measured.' },
  { title: 'Execution', types: ['experiment', 'result', 'conclusion'], hint: 'What you ran, what you found, and what you conclude.' },
  { title: 'Contribution', types: ['contribution'], hint: 'What your project adds.' },
];

export default function Blueprint() {
  const { project, graph, refresh, editNode } = useProject();
  const location = useLocation();
  const generated = (location.state as any)?.generated as { nodes: number; edges: number } | undefined;
  const { busy, run } = useAction();
  const [tab, setTab] = useState<'sections' | 'chain'>('sections');
  const suggested = graph.nodes.filter((n) => n.status === 'suggested');
  const suggestedEdges = graph.edges.filter((e) => e.status === 'suggested').length;
  const base = `/p/${project.id}`;
  const { llm } = useProject();
  const hasBlueprint = graph.nodes.some((n) => n.status === 'active' && ['problem', 'research_gap', 'objective'].includes(n.type));
  const draft = () =>
    run('draft', async () => {
      const r = await api.suggestBlueprint(project.id);
      await refresh();
      return r;
    }, 'Draft ready — review the dashed suggestions below');

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title"><SectionBadge id="blueprint" />Project Blueprint</h1>
          <p>Your project's foundation — not isolated text fields, but linked components. Every objective should trace through a question, a method, evidence, a result and a conclusion.</p>
        </div>
        {llm && (project.idea.trim() || project.brief) && (
          <button className={`btn ${hasBlueprint ? '' : 'primary lg'}`} onClick={draft} disabled={!!busy}>
            {busy === 'draft' ? <><Spinner /> Drafting (~15s)…</> : <><Icon name="sparkle" size={16} /> {hasBlueprint ? 'Suggest more' : 'Draft a blueprint for me'}</>}
          </button>
        )}
      </div>

      {!hasBlueprint && !suggested.length && busy !== 'draft' && (
        <div className="empty-cta">
          <h3>Your blueprint is empty</h3>
          {project.idea.trim() || project.brief ? (
            <p>Let us draft one from your idea — problem, research gap, objectives, questions and methods — as suggestions you review one by one. Or add each part yourself with <b>+ Add</b> below.</p>
          ) : (
            <p>
              Start in <Link to={`${base}/idea`}>step 1 — Shape your idea</Link> so we can draft a blueprint from it, or add each part yourself with <b>+ Add</b> below.
            </p>
          )}
        </div>
      )}

      {(suggested.length > 0 || suggestedEdges > 0) && (
        <div className="warn-box row between" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
          <span>
            {generated ? `Generated ${generated.nodes} suggestions. ` : ''}
            <b>{suggested.length}</b> suggested component(s){suggestedEdges ? ` and ${suggestedEdges} suggested link(s)` : ''} are awaiting your review (dashed cards). Accept, edit or reject each — the system never modifies your project silently.
          </span>
          <span className="row">
            <button className="btn sm" disabled={!!busy} onClick={() => run('ra', async () => { await api.suggestions(project.id, 'reject-all'); await refresh(); }, 'Suggestions rejected')}>Reject all</button>
            <button className="btn sm primary" disabled={!!busy} onClick={() => run('aa', async () => { await api.suggestions(project.id, 'accept-all'); await refresh(); }, 'Suggestions accepted')}>Accept all</button>
          </span>
        </div>
      )}

      <div className="tabs">
        <button className={`tab${tab === 'sections' ? ' active' : ''}`} onClick={() => setTab('sections')}>Components</button>
        <button className={`tab${tab === 'chain' ? ' active' : ''}`} onClick={() => setTab('chain')}>Objective chains</button>
      </div>

      {tab === 'chain' ? (
        <ChainMatrix />
      ) : (
        <>
          {SECTIONS.map((s) => (
            <div key={s.title} className="section-block">
              <div className="section-head" style={{ marginBottom: 4 }}>
                <h2>{s.title}</h2>
              </div>
              <p className="small faint" style={{ marginBottom: 10 }}>{s.hint}</p>
              <div className="stack">
                {s.types.map((t) => {
                  const nodes = graph.nodes.filter((n) => n.type === t);
                  return (
                    <div key={t}>
                      <div className="section-head">
                        <h3>
                          <span className="type-dot" style={{ background: TYPE_COLOR[t] }} />
                          {NODE_LABELS[t]}
                          {nodes.length > 1 && <span className="badge outline">{nodes.length}</span>}
                        </h3>
                        <button className="btn sm" onClick={() => editNode({ type: t })}>+ Add</button>
                      </div>
                      <div className="stack-sm">
                        {nodes.length === 0 && <div className="empty small" style={{ padding: 12 }}>No {NODE_LABELS[t].toLowerCase()} yet</div>}
                        {nodes.map((n) => (
                          <NodeCard key={n.id} node={n} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </>
      )}
      {busy && <div className="faint small"><Spinner /></div>}
    </div>
  );
}

/** FR-03 critical requirement: Objective → RQ → Method → Evidence → Result → Conclusion, at a glance. */
function ChainMatrix() {
  const { graph } = useProject();
  const active = useMemo(() => {
    const nodes = graph.nodes.filter((n) => n.status === 'active');
    const ids = new Set(nodes.map((n) => n.id));
    const edges = graph.edges.filter((e) => e.status === 'active' && ids.has(e.from_id) && ids.has(e.to_id));
    return { nodes, edges };
  }, [graph]);
  const byId = new Map(active.nodes.map((n) => [n.id, n]));
  const children = (id: number) => active.edges.filter((e) => e.from_id === id).map((e) => byId.get(e.to_id)!);
  const chainTypes: NodeType[] = ['research_question', 'method', 'experiment', 'evidence', 'result', 'conclusion'];
  const down = (id: number) => {
    const seen = new Set<number>([id]);
    const out: PNode[] = [];
    const stack = [id];
    while (stack.length) {
      for (const c of children(stack.pop()!)) {
        if (seen.has(c.id) || !chainTypes.includes(c.type)) continue;
        seen.add(c.id);
        out.push(c);
        stack.push(c.id);
      }
    }
    return out;
  };
  const objectives = active.nodes.filter((n) => n.type === 'objective');
  if (!objectives.length) return <div className="empty">Add objectives to see their chains.</div>;
  const cols: { label: string; types: NodeType[] }[] = [
    { label: 'Research question', types: ['research_question'] },
    { label: 'Method', types: ['method'] },
    { label: 'Evidence / experiment', types: ['experiment', 'evidence'] },
    { label: 'Result', types: ['result'] },
    { label: 'Conclusion', types: ['conclusion'] },
  ];
  return (
    <div className="card" style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ textAlign: 'left', color: 'var(--ink-3)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em' }}>
            <th style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)' }}>Objective</th>
            {cols.map((c) => <th key={c.label} style={{ padding: '10px 10px', borderBottom: '1px solid var(--line)' }}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {objectives.map((o) => {
            const d = down(o.id);
            return (
              <tr key={o.id}>
                <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)', verticalAlign: 'top', maxWidth: 260 }}>
                  <Ref id={o.id} /> <span className="bold">{o.title}</span>
                </td>
                {cols.map((c) => {
                  const hits = d.filter((n) => c.types.includes(n.type));
                  return (
                    <td key={c.label} style={{ padding: '10px', borderBottom: '1px solid var(--line)', verticalAlign: 'top', background: hits.length ? undefined : 'var(--crit-soft)' }}>
                      {hits.length ? (
                        <div className="row wrap" style={{ gap: 4 }}>{hits.map((h) => <Ref key={h.id} id={h.id} />)}</div>
                      ) : (
                        <span style={{ color: 'var(--crit)' }} className="small bold">missing</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
