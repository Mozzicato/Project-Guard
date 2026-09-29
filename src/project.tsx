import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ALLOWED_RELATIONS,
  NODE_LABELS,
  NODE_PREFIX,
  PROVENANCES,
  PROVENANCE_LABELS,
  nodeRef,
  relationLabel,
  type NodeType,
  type PEdge,
  type PNode,
  type Project,
  type Provenance,
  DESIGN_KINDS,
  TEST_STATUSES,
  VERIFICATION_METHODS,
} from '../shared/model';
import { api, type GraphData, type Impact, type NodeVersion } from './api';
import { Modal, ProvBadge, Spinner, timeAgo, useAction, useToast } from './ui';
import { TYPE_COLOR } from './sections';

// ---------------------------------------------------------------------------
// Project context
// ---------------------------------------------------------------------------

interface Ctx {
  project: Project;
  graph: GraphData;
  byId: Map<number, PNode>;
  refresh: () => Promise<void>;
  setProject: (p: Project) => void;
  openNode: (id: number) => void;
  editNode: (init: Partial<PNode> & { type: NodeType }, link?: { from?: number; to?: number; relation: string }) => void;
  llm: boolean;
}

const ProjectCtx = createContext<Ctx | null>(null);
export const useProject = () => {
  const c = useContext(ProjectCtx);
  if (!c) throw new Error('useProject outside provider');
  return c;
};

export function ProjectProvider({ id, children, llm }: { id: number; children: ReactNode; llm: boolean }) {
  const [project, setProject] = useState<Project | null>(null);
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [editing, setEditing] = useState<{ init: Partial<PNode> & { type: NodeType }; link?: { from?: number; to?: number; relation: string } } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [p, g] = await Promise.all([api.project(id), api.graph(id)]);
      setProject(p);
      setGraph(g);
    } catch (e: any) {
      setError(e.message);
    }
  }, [id]);

  useEffect(() => {
    setProject(null);
    setGraph(null);
    refresh();
  }, [refresh]);

  const byId = useMemo(() => new Map((graph?.nodes ?? []).map((n) => [n.id, n])), [graph]);

  if (error) return <div className="page"><div className="error-box">{error}</div></div>;
  if (!project || !graph) return <div className="page faint"><Spinner /> Loading project…</div>;

  const value: Ctx = {
    project,
    graph,
    byId,
    refresh,
    setProject,
    openNode: setOpenId,
    editNode: (init, link) => setEditing({ init, link }),
    llm,
  };
  return (
    <ProjectCtx.Provider value={value}>
      {children}
      {openId != null && byId.has(openId) && <NodeModal id={openId} onClose={() => setOpenId(null)} />}
      {editing && <NodeEditor init={editing.init} link={editing.link} onClose={() => setEditing(null)} />}
    </ProjectCtx.Provider>
  );
}

// ---------------------------------------------------------------------------
// Reference chip — every AI statement and report paragraph points back here (NFR-01)
// ---------------------------------------------------------------------------

export function Ref({ id }: { id: number }) {
  const { byId, openNode } = useProject();
  const n = byId.get(id);
  if (!n) return <span className="ref" title="Component no longer exists">#{id}</span>;
  return (
    <button className="ref" title={`${NODE_LABELS[n.type]}: ${n.title}`} onClick={() => openNode(id)} style={{ ['--type' as any]: TYPE_COLOR[n.type] }}>
      {nodeRef(n)}
    </button>
  );
}

export function Refs({ ids }: { ids: number[] }) {
  if (!ids.length) return null;
  return (
    <span className="row wrap" style={{ gap: 4, display: 'inline-flex' }}>
      {ids.map((i) => (
        <Ref key={i} id={i} />
      ))}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Node card
// ---------------------------------------------------------------------------

export function linksOf(graph: GraphData, id: number) {
  return {
    out: graph.edges.filter((e) => e.from_id === id),
    inc: graph.edges.filter((e) => e.to_id === id),
  };
}

export function NodeCard({ node, children, hideLinks }: { node: PNode; children?: ReactNode; hideLinks?: boolean }) {
  const { graph, refresh, editNode, byId } = useProject();
  const { busy, run } = useAction();
  const [linking, setLinking] = useState(false);
  const [history, setHistory] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { out, inc } = linksOf(graph, node.id);
  const suggested = node.status === 'suggested';

  return (
    <div className={`node-card${suggested ? ' suggested' : ''}`} style={{ ['--type' as any]: TYPE_COLOR[node.type] }}>
      <div className="head">
        <span className="ref type-ref" style={{ cursor: 'default' }} title={NODE_LABELS[node.type]}>{nodeRef(node)}</span>
        <span className="title">{node.title || <span className="faint">(untitled)</span>}</span>
        <ProvBadge p={node.provenance} />
        {suggested ? (
          <>
            <button className="btn sm primary" disabled={!!busy} onClick={() => run('acc', async () => { await api.acceptNode(node.id); await refresh(); })}>
              Accept
            </button>
            <button className="btn sm" onClick={() => editNode(node)}>Edit</button>
            <button className="btn sm danger" disabled={!!busy} onClick={() => run('rej', async () => { await api.deleteNode(node.id); await refresh(); })}>
              Reject
            </button>
          </>
        ) : (
          <>
            <button className="btn sm ghost" onClick={() => editNode(node)} title="Edit">Edit</button>
            {!hideLinks && <button className="btn sm ghost" onClick={() => setLinking(true)} title="Link to another component">Link</button>}
            <button className="btn sm ghost" onClick={() => setHistory(true)} title="Version history">v{node.version}</button>
            <button className="btn sm ghost danger" onClick={() => setDeleting(true)} title="Delete" aria-label="Delete">✕</button>
          </>
        )}
      </div>
      {node.content && <div className="content">{node.content}</div>}
      {children}
      {!hideLinks && (out.length > 0 || inc.length > 0) && (
        <div className="links">
          {inc.map((e) => (
            <EdgeChip key={e.id} edge={e} other={byId.get(e.from_id)} dir="in" />
          ))}
          {out.map((e) => (
            <EdgeChip key={e.id} edge={e} other={byId.get(e.to_id)} dir="out" />
          ))}
        </div>
      )}
      {linking && <LinkModal node={node} onClose={() => setLinking(false)} />}
      {history && <HistoryModal node={node} onClose={() => setHistory(false)} />}
      {deleting && <DeleteModal node={node} onClose={() => setDeleting(false)} />}
    </div>
  );
}

function EdgeChip({ edge, other, dir }: { edge: PEdge; other?: PNode; dir: 'in' | 'out' }) {
  const { refresh } = useProject();
  const { run } = useAction();
  if (!other) return null;
  const suggested = edge.status === 'suggested';
  return (
    <span className={`link-chip${suggested ? ' suggested' : ''}`} title={suggested ? 'Suggested link — accept or remove' : undefined}>
      {dir === 'in' ? (
        <>
          <Ref id={other.id} /> {relationLabel(edge.relation)} →
        </>
      ) : (
        <>
          → {relationLabel(edge.relation)} <Ref id={other.id} />
        </>
      )}
      {suggested && (
        <button title="Accept link" onClick={() => run('a', async () => { await api.acceptEdge(edge.id); await refresh(); })} style={{ color: 'var(--ok)' }}>
          ✓
        </button>
      )}
      <button title="Remove link" onClick={() => run('d', async () => { await api.deleteEdge(edge.id); await refresh(); })}>
        ×
      </button>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

export function NodeEditor({ init, link, onClose }: { init: Partial<PNode> & { type: NodeType }; link?: { from?: number; to?: number; relation: string }; onClose: () => void }) {
  const { project, refresh } = useProject();
  const toast = useToast();
  const { busy, run } = useAction();
  const [title, setTitle] = useState(init.title ?? '');
  const [content, setContent] = useState(init.content ?? '');
  const [prov, setProv] = useState<Provenance>(init.provenance ?? 'user');
  const [data, setData] = useState<Record<string, any>>(init.data ?? {});
  const fields = DATA_FIELDS[init.type] ?? [];
  const isNew = !init.id;

  const save = () =>
    run('save', async () => {
      if (!title.trim()) throw new Error('Give it a short title');
      if (isNew) {
        await api.createNode(project.id, {
          type: init.type,
          title,
          content,
          provenance: prov,
          data,
          ...(link?.from ? { link_from: link.from, link_relation: link.relation } : {}),
          ...(link?.to ? { link_to: link.to, link_relation: link.relation } : {}),
        });
      } else {
        const provChangedByStudent = prov !== init.provenance;
        await api.updateNode(init.id!, { title, content, ...(fields.length ? { data } : {}), ...(provChangedByStudent ? { provenance: prov } : {}), take_ownership: !provChangedByStudent });
      }
      await refresh();
      toast(isNew ? `${NODE_LABELS[init.type]} added` : 'Saved — previous version kept in history');
      onClose();
    });

  return (
    <Modal
      title={`${isNew ? 'New' : 'Edit'} ${NODE_LABELS[init.type].toLowerCase()}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={save} disabled={!!busy}>
            {busy ? <Spinner /> : null} Save
          </button>
        </>
      }
    >
      <div className="stack">
        <label className="field">
          Title
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder={placeholderTitle(init.type)} />
        </label>
        <label className="field">
          Statement / details
          <textarea rows={fields.length ? 4 : 6} value={content} onChange={(e) => setContent(e.target.value)} placeholder={placeholderContent(init.type)} />
        </label>
        {fields.length > 0 && (
          <div className="grid-2" style={{ gap: 10 }}>
            {fields.map((f) => (
              <label key={f.key} className="field">
                {f.label}
                {f.options ? (
                  <select value={data[f.key] ?? f.options[0]} onChange={(e) => setData({ ...data, [f.key]: e.target.value })}>
                    {f.options.map((o) => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
                  </select>
                ) : (
                  <input
                    type={f.number ? 'number' : 'text'}
                    value={data[f.key] ?? ''}
                    placeholder={f.placeholder}
                    onChange={(e) => setData({ ...data, [f.key]: f.number && e.target.value !== '' ? Number(e.target.value) : e.target.value })}
                  />
                )}
              </label>
            ))}
          </div>
        )}
        <label className="field">
          Provenance
          <select value={prov} onChange={(e) => setProv(e.target.value as Provenance)}>
            {PROVENANCES.map((p) => (
              <option key={p} value={p}>{PROVENANCE_LABELS[p]}</option>
            ))}
          </select>
          <span className="faint small" style={{ fontWeight: 400 }}>
            Mark as “Verified evidence” only when it comes from a source, measurement or experiment you can show.
            {!isNew && init.provenance === 'ai_suggestion' && ' Editing an AI suggestion makes it yours (User-provided) unless you pick otherwise.'}
          </span>
        </label>
      </div>
    </Modal>
  );
}

/** Structured fields for the hardware-track component types. */
const DATA_FIELDS: Partial<Record<NodeType, { key: string; label: string; placeholder?: string; number?: boolean; options?: readonly string[] }[]>> = {
  requirement: [
    { key: 'target', label: 'Target value', placeholder: 'e.g. ≤ 2' },
    { key: 'unit', label: 'Unit', placeholder: 'e.g. s, V, %, h' },
    { key: 'verification', label: 'Verify by', options: VERIFICATION_METHODS },
  ],
  component: [
    { key: 'part', label: 'Part number / model', placeholder: 'e.g. ESP32-WROOM-32' },
    { key: 'qty', label: 'Quantity', number: true },
    { key: 'unit_cost', label: 'Unit cost', placeholder: 'e.g. 4500' },
    { key: 'supplier', label: 'Supplier', placeholder: 'optional' },
  ],
  test: [
    { key: 'expected', label: 'Expected (pass criterion)', placeholder: 'e.g. ≤ 2 s in 10/10 trials' },
    { key: 'measured', label: 'Measured', placeholder: 'fill in after testing' },
    { key: 'status', label: 'Result', options: TEST_STATUSES },
    { key: 'equipment', label: 'Equipment', placeholder: 'e.g. multimeter' },
  ],
  design: [{ key: 'kind', label: 'Kind', options: DESIGN_KINDS }],
};

function placeholderTitle(t: NodeType) {
  return (
    {
      objective: 'e.g. Evaluate classifier accuracy on Pidgin news',
      research_question: 'e.g. How accurately can a transformer detect false claims in Pidgin?',
      claim: 'e.g. Existing models perform poorly on low-resource Nigerian languages',
      method: 'e.g. Fine-tune a multilingual transformer',
      result: 'e.g. F1 = 0.81 on held-out test set',
      requirement: 'e.g. Response time',
      component: 'e.g. Microcontroller',
      test: 'e.g. Response time test',
      design: 'e.g. System block diagram',
    } as Partial<Record<NodeType, string>>
  )[t] ?? 'Short label';
}
function placeholderContent(t: NodeType) {
  return (
    {
      objective: 'A specific, measurable objective. What will be done, how, and how you will know it was achieved.',
      method: 'What you will do, with what data/participants/materials, and why this method answers the linked objective.',
      claim: 'State the claim precisely. Then attach evidence or a source in the Evidence Ledger.',
      evidence: 'What the evidence shows, and where it comes from (paper section, dataset, measurement).',
    } as Partial<Record<NodeType, string>>
  )[t] ?? '';
}

// ---------------------------------------------------------------------------
// Linking
// ---------------------------------------------------------------------------

export function LinkModal({ node, onClose }: { node: PNode; onClose: () => void }) {
  const { project, graph, refresh, editNode } = useProject();
  const { busy, run } = useAction();
  const options = ALLOWED_RELATIONS.flatMap((r) => [
    ...(r.from === node.type ? [{ key: `out:${r.relation}:${r.to}`, dir: 'out' as const, rel: r, otherType: r.to }] : []),
    ...(r.to === node.type ? [{ key: `in:${r.relation}:${r.from}`, dir: 'in' as const, rel: r, otherType: r.from }] : []),
  ]);
  const [key, setKey] = useState(options[0]?.key ?? '');
  const opt = options.find((o) => o.key === key);
  const existing = new Set(graph.edges.filter((e) => e.relation === opt?.rel.relation && (opt?.dir === 'out' ? e.from_id === node.id : e.to_id === node.id)).map((e) => (opt?.dir === 'out' ? e.to_id : e.from_id)));
  const candidates = graph.nodes.filter((n) => n.status === 'active' && n.type === opt?.otherType && n.id !== node.id);
  const [target, setTarget] = useState<number | ''>('');

  const link = () =>
    run('link', async () => {
      if (!opt || !target) throw new Error('Choose a component to link');
      await api.createEdge(project.id, opt.dir === 'out' ? node.id : Number(target), opt.dir === 'out' ? Number(target) : node.id, opt.rel.relation);
      await refresh();
      onClose();
    });

  if (!options.length) return <Modal title="Link" onClose={onClose}><p className="muted">This component type has no defined relationships.</p></Modal>;

  return (
    <Modal
      title={<>Link <span className="ref">{nodeRef(node)}</span></>}
      onClose={onClose}
      footer={
        <>
          {opt && (
            <button
              className="btn"
              onClick={() => {
                onClose();
                editNode({ type: opt.otherType }, opt.dir === 'out' ? { from: node.id, relation: opt.rel.relation } : { to: node.id, relation: opt.rel.relation });
              }}
            >
              + New {NODE_LABELS[opt.otherType].toLowerCase()} instead
            </button>
          )}
          <button className="btn primary" disabled={!target || !!busy} onClick={link}>Create link</button>
        </>
      }
    >
      <div className="stack">
        <label className="field">
          Relationship
          <select value={key} onChange={(e) => { setKey(e.target.value); setTarget(''); }}>
            {options.map((o) => (
              <option key={o.key} value={o.key}>
                {o.dir === 'out'
                  ? `This ${NODE_LABELS[node.type].toLowerCase()} ${o.rel.label} → ${NODE_LABELS[o.otherType]}`
                  : `${NODE_LABELS[o.otherType]} ${o.rel.label} → this ${NODE_LABELS[node.type].toLowerCase()}`}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          {opt ? NODE_LABELS[opt.otherType] : 'Target'}
          {candidates.length ? (
            <select value={target} onChange={(e) => setTarget(e.target.value ? Number(e.target.value) : '')}>
              <option value="">Choose…</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id} disabled={existing.has(c.id)}>
                  {NODE_PREFIX[c.type]}-{c.id} · {c.title}{existing.has(c.id) ? ' (already linked)' : ''}
                </option>
              ))}
            </select>
          ) : (
            <div className="note-box">No {opt ? NODE_LABELS[opt.otherType].toLowerCase() : ''} components yet — create one instead.</div>
          )}
        </label>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Delete with impact analysis (FR-06 — Principle 5: every change has consequences)
// ---------------------------------------------------------------------------

export function DeleteModal({ node, onClose }: { node: PNode; onClose: () => void }) {
  const { refresh } = useProject();
  const toast = useToast();
  const { busy, run } = useAction();
  const [impact, setImpact] = useState<Impact | null>(null);
  useEffect(() => {
    api.impact(node.id).then(setImpact).catch((e) => toast(e.message, true));
  }, [node.id, toast]);
  const del = () =>
    run('del', async () => {
      await api.deleteNode(node.id);
      await refresh();
      toast(`${nodeRef(node)} deleted`);
      onClose();
    });
  const affected = impact ? Object.entries(impact.downstream_by_type) : [];
  return (
    <Modal
      title={<>Delete <span className="ref">{nodeRef(node)}</span>?</>}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" style={{ background: 'var(--crit)', borderColor: 'var(--crit)' }} disabled={!impact || !!busy} onClick={del}>
            Delete anyway
          </button>
        </>
      }
    >
      {!impact ? (
        <div className="faint"><Spinner /> Analysing what depends on this…</div>
      ) : (
        <div className="stack">
          <p><b>{node.title}</b></p>
          {impact.downstream_count === 0 && !impact.feedback.length ? (
            <div className="note-box">Nothing else in the project depends on this component.</div>
          ) : (
            <>
              <div className="warn-box">
                {impact.downstream_count} downstream component(s) depend on this. Deleting it removes {impact.direct_links} link(s)
                {impact.orphaned.length ? ` and leaves ${impact.orphaned.length} component(s) disconnected` : ''}.
              </div>
              {affected.map(([type, list]) => (
                <div key={type}>
                  <div className="small bold muted">{NODE_LABELS[type as NodeType]} ({list.length})</div>
                  <div className="row wrap" style={{ marginTop: 4, gap: 4 }}>
                    {list.map((n) => (
                      <span key={n.id} className="link-chip" style={{ paddingRight: 7 }}>
                        <span className="mono">{n.ref}</span> {n.title}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
              {impact.orphaned.length > 0 && (
                <div>
                  <div className="small bold" style={{ color: 'var(--crit)' }}>Will be left disconnected</div>
                  <div className="small muted">{impact.orphaned.map((o) => `${o.ref} ${o.title}`).join(' · ')}</div>
                </div>
              )}
              {impact.feedback.length > 0 && (
                <div className="small muted">Referenced by supervisor feedback: {impact.feedback.map((f) => f.summary).join('; ')}</div>
              )}
              {impact.defense_questions > 0 && <div className="small muted">Targeted by {impact.defense_questions} defense question(s).</div>}
            </>
          )}
        </div>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Version history (NFR-03)
// ---------------------------------------------------------------------------

function wordDiff(a: string, b: string) {
  const aw = a.split(/(\s+)/);
  const bw = b.split(/(\s+)/);
  // LCS on words — inputs are short component statements.
  const dp = Array.from({ length: aw.length + 1 }, () => new Array<number>(bw.length + 1).fill(0));
  for (let i = aw.length - 1; i >= 0; i--) for (let j = bw.length - 1; j >= 0; j--) dp[i][j] = aw[i] === bw[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: ReactNode[] = [];
  let i = 0;
  let j = 0;
  let k = 0;
  while (i < aw.length || j < bw.length) {
    if (i < aw.length && j < bw.length && aw[i] === bw[j]) { out.push(aw[i]); i++; j++; }
    else if (j < bw.length && (i >= aw.length || dp[i][j + 1] >= dp[i + 1][j])) { out.push(<ins key={k++} style={{ background: 'var(--ok-soft)', color: 'var(--ok)', textDecoration: 'none' }}>{bw[j]}</ins>); j++; }
    else { out.push(<del key={k++} style={{ background: 'var(--crit-soft)', color: 'var(--crit)' }}>{aw[i]}</del>); i++; }
  }
  return out;
}

export function HistoryModal({ node, onClose }: { node: PNode; onClose: () => void }) {
  const { refresh } = useProject();
  const { busy, run } = useAction();
  const [versions, setVersions] = useState<NodeVersion[] | null>(null);
  useEffect(() => {
    api.versions(node.id).then(setVersions);
  }, [node.id, node.version]);
  return (
    <Modal title={<>History · <span className="ref">{nodeRef(node)}</span></>} onClose={onClose} size="lg">
      {!versions ? (
        <Spinner />
      ) : (
        <div className="stack">
          {versions.map((v, idx) => {
            const prev = versions[idx + 1];
            return (
              <div key={v.id} className="card card-pad">
                <div className="row between">
                  <div className="row">
                    <b>Version {v.version}</b>
                    <span className="faint small">{v.note} · {timeAgo(v.created_at)}</span>
                    <ProvBadge p={v.provenance} />
                  </div>
                  {v.version !== node.version && (
                    <button className="btn sm" disabled={!!busy} onClick={() => run('r', async () => { await api.restore(node.id, v.version); await refresh(); onClose(); }, `Restored version ${v.version}`)}>
                      Restore
                    </button>
                  )}
                </div>
                <div style={{ marginTop: 6 }}>
                  <div className="bold">{prev ? wordDiff(prev.title, v.title) : v.title}</div>
                  <div className="muted pre" style={{ marginTop: 4 }}>{prev ? wordDiff(prev.content, v.content) : v.content}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Node detail modal (opened from any reference chip)
// ---------------------------------------------------------------------------

function NodeModal({ id, onClose }: { id: number; onClose: () => void }) {
  const { byId } = useProject();
  const n = byId.get(id)!;
  return (
    <Modal title={NODE_LABELS[n.type]} onClose={onClose}>
      <div className="stack">
        <NodeCard node={n} />
        {n.type === 'source' && <SourceDetails node={n} />}
        <div className="faint small">Created {timeAgo(n.created_at)} · updated {timeAgo(n.updated_at)}</div>
      </div>
    </Modal>
  );
}

export function SourceDetails({ node }: { node: PNode }) {
  const d = node.data ?? {};
  const list = (label: string, items?: string[]) =>
    items?.length ? (
      <div>
        <div className="small bold muted">{label}</div>
        <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{items.map((x, i) => <li key={i}>{x}</li>)}</ul>
      </div>
    ) : null;
  return (
    <div className="stack-sm">
      <div className="small muted">
        {[d.authors, d.year].filter(Boolean).join(' · ') || 'Authors / year not recorded'}
        {d.url && <> · <a href={d.url} target="_blank" rel="noreferrer">link</a></>}
        {d.filename && <> · {d.filename}</>}
      </div>
      {d.summary && <p>{d.summary}</p>}
      {list('Key claims', d.key_claims)}
      {list('Findings', d.findings)}
      {list('Limitations', d.limitations)}
      {d.relevance && (
        <div>
          <div className="small bold muted">Relevance {d.relevance_score != null && <span className="badge outline">{d.relevance_score}/100</span>}</div>
          <p className="muted">{d.relevance}</p>
        </div>
      )}
      {d.gap_rationale && (
        <div>
          <div className="small bold muted">Relationship to research gap: {d.gap_relationship}</div>
          <p className="muted">{d.gap_rationale}</p>
        </div>
      )}
      {d.extracted_by_ai && <span className="prov ai_inference">Summary extracted by AI — check it against the original</span>}
    </div>
  );
}
