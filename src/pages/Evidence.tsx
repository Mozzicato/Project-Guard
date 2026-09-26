import { useState } from 'react';
import { NODE_PREFIX, type PNode } from '../../shared/model';
import { api } from '../api';
import { NodeCard, Ref, useProject } from '../project';
import { Modal, Spinner, useAction } from '../ui';

export const EVIDENCE_KINDS = ['academic paper', 'dataset', 'experiment', 'survey', 'interview', 'measurement', 'screenshot', 'observation'];

export default function Evidence() {
  const { graph, editNode } = useProject();
  const [tab, setTab] = useState<'claims' | 'evidence'>('claims');
  const [show, setShow] = useState<'all' | 'unbacked'>('all');
  const claims = graph.nodes.filter((n) => n.type === 'claim');
  const evidence = graph.nodes.filter((n) => n.type === 'evidence');
  const backed = claims.filter((c) => graph.claimStatus[c.id]).length;
  const shown = claims.filter((c) => show === 'all' || !graph.claimStatus[c.id]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Evidence Ledger</h1>
          <p>Every claim is either a <b>student assertion</b> or an <b>evidence-backed claim</b>. A beautifully written unsupported claim is still a weak claim.</p>
        </div>
        <div className="row">
          <button className="btn" onClick={() => editNode({ type: 'evidence', data: { kind: 'academic paper' } })}>+ Evidence</button>
          <button className="btn primary" onClick={() => editNode({ type: 'claim' })}>+ Claim</button>
        </div>
      </div>

      <div className="grid-3" style={{ marginBottom: 18 }}>
        <div className="card stat"><div className="k">Claims</div><div className="v">{claims.length}</div></div>
        <div className="card stat"><div className="k">Evidence-backed</div><div className="v" style={{ color: 'var(--ok)' }}>{backed}</div></div>
        <div className="card stat"><div className="k">Student assertions</div><div className="v" style={{ color: claims.length - backed ? 'var(--crit)' : undefined }}>{claims.length - backed}</div></div>
      </div>

      <div className="tabs">
        <button className={`tab${tab === 'claims' ? ' active' : ''}`} onClick={() => setTab('claims')}>Claims ({claims.length})</button>
        <button className={`tab${tab === 'evidence' ? ' active' : ''}`} onClick={() => setTab('evidence')}>Evidence ({evidence.length})</button>
      </div>

      {tab === 'claims' ? (
        <>
          <div className="row" style={{ marginBottom: 10 }}>
            <button className={`btn sm${show === 'all' ? ' primary' : ''}`} onClick={() => setShow('all')}>All</button>
            <button className={`btn sm${show === 'unbacked' ? ' primary' : ''}`} onClick={() => setShow('unbacked')}>Assertions only</button>
          </div>
          <div className="stack">
            {claims.length === 0 && <div className="empty">No claims yet. Add the key claims your project makes — or turn key claims from your sources into claims in the Research workspace.</div>}
            {shown.map((c) => <ClaimCard key={c.id} claim={c} />)}
          </div>
        </>
      ) : (
        <div className="stack">
          {evidence.length === 0 && <div className="empty">No evidence items yet.</div>}
          {evidence.map((e) => <EvidenceCard key={e.id} ev={e} />)}
        </div>
      )}
    </div>
  );
}

function ClaimCard({ claim }: { claim: PNode }) {
  const { project, graph, byId, refresh } = useProject();
  const { busy, run } = useAction();
  const [attach, setAttach] = useState(false);
  const backedStatus = graph.claimStatus[claim.id];
  const out = graph.edges.filter((e) => e.from_id === claim.id);
  const sources = out.filter((e) => e.relation === 'cites').map((e) => byId.get(e.to_id)!).filter(Boolean);
  const evidence = out.filter((e) => e.relation === 'backed_by').map((e) => byId.get(e.to_id)!).filter(Boolean);
  // Claim → Source → Research gap: show which gaps this claim's literature feeds.
  const gaps = [...new Set(sources.flatMap((s) => graph.edges.filter((e) => e.from_id === s.id && e.relation === 'supports_gap').map((e) => e.to_id)))];

  return (
    <NodeCard node={claim} hideLinks>
      <div className="row wrap" style={{ marginTop: 8, gap: 6 }}>
        {backedStatus ? <span className="badge ok">Evidence-backed claim</span> : <span className="badge crit">Student assertion — no evidence</span>}
        <label className="row tiny muted" style={{ gap: 4, marginLeft: 6 }}>
          <input
            type="checkbox"
            checked={!!claim.data?.important}
            onChange={(e) => run('imp', async () => { await api.updateNode(claim.id, { data: { important: e.target.checked }, note: 'Marked importance' }); await refresh(); })}
          />
          Major claim
        </label>
      </div>
      <div className="row wrap small" style={{ marginTop: 8, gap: 6 }}>
        <span className="faint">Chain:</span>
        <span className="ref" style={{ cursor: 'default' }}>{NODE_PREFIX.claim}-{claim.id}</span>
        <span className="faint">→ sources</span>
        {sources.length ? sources.map((s) => <Ref key={s.id} id={s.id} />) : <span className="faint">none</span>}
        <span className="faint">→ evidence</span>
        {evidence.length ? evidence.map((s) => <Ref key={s.id} id={s.id} />) : <span className="faint">none</span>}
        {gaps.length > 0 && (
          <>
            <span className="faint">→ gap</span>
            {gaps.map((g) => <Ref key={g} id={g} />)}
          </>
        )}
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn sm" onClick={() => setAttach(true)}>Attach source / evidence</button>
        {[...out].map((e) => (
          <span key={e.id} className="link-chip">
            {e.relation === 'cites' ? 'cites' : 'backed by'} <Ref id={e.to_id} />
            <button title="Detach" disabled={!!busy} onClick={() => run('d', async () => { await api.deleteEdge(e.id); await refresh(); })}>×</button>
          </span>
        ))}
      </div>
      {attach && <AttachModal claim={claim} onClose={() => setAttach(false)} projectId={project.id} />}
    </NodeCard>
  );
}

function AttachModal({ claim, onClose, projectId }: { claim: PNode; onClose: () => void; projectId: number }) {
  const { graph, refresh } = useProject();
  const { busy, run } = useAction();
  const linked = new Set(graph.edges.filter((e) => e.from_id === claim.id).map((e) => e.to_id));
  const sources = graph.nodes.filter((n) => n.type === 'source' && n.status === 'active');
  const evidence = graph.nodes.filter((n) => n.type === 'evidence' && n.status === 'active');
  const [nw, setNw] = useState({ title: '', content: '', kind: 'academic paper', source: '' });

  const link = (id: number, relation: 'cites' | 'backed_by') =>
    run(`l${id}`, async () => { await api.createEdge(projectId, claim.id, id, relation); await refresh(); });
  const createEvidence = () =>
    run('new', async () => {
      if (!nw.title.trim()) throw new Error('Describe the evidence');
      const ev = await api.createNode(projectId, {
        type: 'evidence',
        title: nw.title,
        content: nw.content,
        provenance: nw.source ? 'verified' : 'user',
        data: { kind: nw.kind },
        link_from: claim.id,
        link_relation: 'backed_by',
      });
      if (nw.source) await api.createEdge(projectId, ev.id, Number(nw.source), 'derived_from');
      await refresh();
      onClose();
    });

  return (
    <Modal title="Attach support" onClose={onClose} size="lg">
      <div className="stack">
        <div className="note-box">“{claim.title}”</div>
        <div className="grid-2" style={{ alignItems: 'start' }}>
          <div className="stack-sm">
            <h3>Cite a source</h3>
            {sources.length === 0 && <div className="faint small">No sources yet — add them in the Research workspace.</div>}
            {sources.map((s) => (
              <div key={s.id} className="row small">
                <Ref id={s.id} /> <span className="grow">{s.title}</span>
                {linked.has(s.id) ? <span className="badge ok">linked</span> : <button className="btn sm" disabled={!!busy} onClick={() => link(s.id, 'cites')}>Cite</button>}
              </div>
            ))}
            <h3 style={{ marginTop: 12 }}>Existing evidence</h3>
            {evidence.length === 0 && <div className="faint small">No evidence items yet.</div>}
            {evidence.map((s) => (
              <div key={s.id} className="row small">
                <Ref id={s.id} /> <span className="grow">{s.title}</span>
                {linked.has(s.id) ? <span className="badge ok">linked</span> : <button className="btn sm" disabled={!!busy} onClick={() => link(s.id, 'backed_by')}>Attach</button>}
              </div>
            ))}
          </div>
          <div className="stack-sm card card-pad">
            <h3>New evidence</h3>
            <label className="field">
              Type
              <select value={nw.kind} onChange={(e) => setNw({ ...nw, kind: e.target.value })}>
                {EVIDENCE_KINDS.map((k) => <option key={k}>{k}</option>)}
              </select>
            </label>
            <label className="field">
              What it shows
              <input value={nw.title} onChange={(e) => setNw({ ...nw, title: e.target.value })} placeholder="e.g. mBERT scores 0.52 F1 on Pidgin sentiment (Table 3)" />
            </label>
            <label className="field">
              Details
              <textarea rows={3} value={nw.content} onChange={(e) => setNw({ ...nw, content: e.target.value })} />
            </label>
            <label className="field">
              Derived from source
              <select value={nw.source} onChange={(e) => setNw({ ...nw, source: e.target.value })}>
                <option value="">— none (own measurement / observation) —</option>
                {sources.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
              </select>
            </label>
            <button className="btn primary" disabled={!!busy} onClick={createEvidence}>{busy === 'new' ? <Spinner /> : null} Create & attach</button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function EvidenceCard({ ev }: { ev: PNode }) {
  const { refresh } = useProject();
  const { run } = useAction();
  return (
    <NodeCard node={ev}>
      <div className="row small" style={{ marginTop: 6 }}>
        <span className="faint">Type</span>
        <select
          style={{ width: 180, padding: '2px 6px' }}
          value={ev.data?.kind ?? ''}
          onChange={(e) => run('k', async () => { await api.updateNode(ev.id, { data: { kind: e.target.value }, note: 'Changed evidence type' }); await refresh(); })}
        >
          <option value="">—</option>
          {EVIDENCE_KINDS.map((k) => <option key={k}>{k}</option>)}
        </select>
      </div>
    </NodeCard>
  );
}
