import { useRef, useState } from 'react';
import { type PNode } from '../../shared/model';
import { api } from '../api';
import { NodeCard, Ref, SourceDetails, useProject } from '../project';
import { Spinner, useAction, useToast } from '../ui';

type Mode = 'file' | 'url' | 'note' | 'manual' | 'dataset';

export default function Research() {
  const { graph } = useProject();
  const sources = graph.nodes.filter((n) => n.type === 'source');
  const artifacts = graph.nodes.filter((n) => (n.type === 'evidence' || n.type === 'experiment') && n.data?.kind === 'dataset');
  const [filter, setFilter] = useState('');
  const shown = sources.filter((s) => !filter || `${s.title} ${s.data?.authors ?? ''} ${s.data?.summary ?? ''}`.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Research workspace</h1>
          <p>Add papers, links, notes and data. Each source is summarised — claims, findings, limitations, relevance, and whether it supports or challenges your research gap. Always check AI summaries against the original.</p>
        </div>
      </div>
      <AddSource />
      <div className="row between" style={{ margin: '22px 0 10px' }}>
        <h2>Sources <span className="faint" style={{ fontWeight: 400 }}>({sources.length})</span></h2>
        {sources.length > 3 && <input style={{ width: 240 }} placeholder="Filter sources…" value={filter} onChange={(e) => setFilter(e.target.value)} />}
      </div>
      <div className="stack">
        {sources.length === 0 && <div className="empty">No sources yet. Your research gap needs literature behind it.</div>}
        {shown.map((s) => <SourceCard key={s.id} node={s} />)}
      </div>
      {artifacts.length > 0 && (
        <>
          <h2 style={{ margin: '22px 0 10px' }}>Datasets & artifacts</h2>
          <div className="stack">{artifacts.map((a) => <NodeCard key={a.id} node={a} />)}</div>
        </>
      )}
    </div>
  );
}

function AddSource() {
  const { project, refresh, llm } = useProject();
  const toast = useToast();
  const { busy, run } = useAction();
  const [mode, setMode] = useState<Mode>('file');
  const [f, setF] = useState({ title: '', url: '', text: '', authors: '', year: '', content: '', node_type: 'evidence' });
  const [extract, setExtract] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  const submit = () =>
    run('add', async () => {
      const form = new FormData();
      const kind = { file: 'paper', url: 'url', note: 'note', manual: 'manual', dataset: 'dataset' }[mode];
      form.set('kind', kind);
      const file = fileRef.current?.files?.[0];
      if (file && file.size > 4 * 1024 * 1024) throw new Error('That file is over the 4 MB upload limit. Paste the abstract instead, or upload a smaller PDF.');
      if ((mode === 'file' || mode === 'dataset') && file) form.set('file', file);
      if (mode === 'file' && !file) throw new Error('Choose a file');
      if (mode === 'url' && !f.url.trim()) throw new Error('Enter a URL');
      if (mode === 'note' && !f.text.trim()) throw new Error('Paste some text');
      if ((mode === 'manual' || mode === 'dataset') && !f.title.trim()) throw new Error('Enter a title');
      for (const [k, v] of Object.entries(f)) if (v) form.set(k, v);
      if (mode !== 'dataset') form.delete('node_type');
      form.set('extract', String(extract && llm));
      const r = await api.addSource(project.id, form);
      await refresh();
      if (r.extraction_error) toast(`Saved, but AI extraction failed: ${r.extraction_error}`, true);
      else toast(mode === 'dataset' ? 'Artifact added' : 'Source added');
      setF({ title: '', url: '', text: '', authors: '', year: '', content: '', node_type: 'evidence' });
      if (fileRef.current) fileRef.current.value = '';
    });

  const tabs: [Mode, string][] = [['file', 'Upload PDF / document'], ['url', 'URL'], ['note', 'Paste abstract / notes'], ['manual', 'Manual reference'], ['dataset', 'Dataset / artifact']];
  return (
    <div className="card">
      <div className="card-pad" style={{ paddingBottom: 0 }}>
        <div className="tabs" style={{ marginBottom: 12 }}>
          {tabs.map(([m, l]) => (
            <button key={m} className={`tab${mode === m ? ' active' : ''}`} onClick={() => setMode(m)}>{l}</button>
          ))}
        </div>
      </div>
      <div className="card-pad stack" style={{ paddingTop: 0 }}>
        {(mode === 'file' || mode === 'dataset') && (
          <input ref={fileRef} type="file" accept={mode === 'file' ? '.pdf,.txt,.md,.html,.tex' : undefined} />
        )}
        {mode === 'url' && <input placeholder="https://… (paper page, article, arXiv, PDF link)" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} />}
        {mode === 'note' && <textarea rows={6} placeholder="Paste an abstract, excerpt or your reading notes" value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} />}
        {mode === 'dataset' && (
          <div className="grid-2">
            <label className="field">
              Record as
              <select value={f.node_type} onChange={(e) => setF({ ...f, node_type: e.target.value })}>
                <option value="evidence">Evidence (dataset, survey, measurement, screenshot…)</option>
                <option value="experiment">Experiment (run, study, test)</option>
              </select>
            </label>
            <label className="field">
              Title
              <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. 2,400 labelled Pidgin WhatsApp messages" />
            </label>
          </div>
        )}
        {mode === 'dataset' && <textarea rows={3} placeholder="What does it contain / show? How was it collected?" value={f.content} onChange={(e) => setF({ ...f, content: e.target.value })} />}
        {mode !== 'dataset' && (
          <div className="grid-3">
            <label className="field">
              <span>Title {mode !== 'manual' && <span className="faint" style={{ fontWeight: 400 }}>(optional)</span>}</span>
              <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
            </label>
            <label className="field">
              <span>Authors <span className="faint" style={{ fontWeight: 400 }}>(optional)</span></span>
              <input value={f.authors} onChange={(e) => setF({ ...f, authors: e.target.value })} />
            </label>
            <label className="field">
              <span>Year <span className="faint" style={{ fontWeight: 400 }}>(optional)</span></span>
              <input value={f.year} onChange={(e) => setF({ ...f, year: e.target.value })} />
            </label>
          </div>
        )}
        {mode === 'manual' && <textarea rows={3} placeholder="What does this source say that matters to your project?" value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} />}
        <div className="row between">
          {mode !== 'dataset' ? (
            <label className="row small muted" style={{ gap: 6 }}>
              <input type="checkbox" checked={extract && llm} disabled={!llm} onChange={(e) => setExtract(e.target.checked)} /> Extract summary, claims, findings & gap relationship with AI
            </label>
          ) : <span />}
          <button className="btn primary" onClick={submit} disabled={!!busy}>
            {busy ? <><Spinner /> {extract && mode !== 'dataset' ? 'Reading & extracting…' : 'Saving…'}</> : 'Add'}
          </button>
        </div>
      </div>
    </div>
  );
}

function SourceCard({ node }: { node: PNode }) {
  const { project, graph, refresh, byId } = useProject();
  const { busy, run } = useAction();
  const [open, setOpen] = useState(false);
  const d = node.data ?? {};
  const gaps = graph.nodes.filter((n) => n.type === 'research_gap' && n.status === 'active');
  const claimsFromThis = graph.edges.filter((e) => e.to_id === node.id && e.relation === 'cites').map((e) => byId.get(e.from_id)!).filter(Boolean);
  const existingClaimTitles = new Set(claimsFromThis.map((c) => c.title.trim().toLowerCase()));
  const gapLink = (gid: number) => graph.edges.find((e) => e.from_id === node.id && e.to_id === gid && (e.relation === 'supports_gap' || e.relation === 'challenges_gap'));

  const addClaim = (text: string) =>
    run(`c${text}`, async () => {
      await api.createNode(project.id, { type: 'claim', title: text.slice(0, 280), content: text, provenance: 'ai_inference', link_to: node.id, link_relation: 'cites', data: { from_source: node.id } });
      await refresh();
    }, 'Claim added to Evidence Ledger, citing this source');

  return (
    <NodeCard node={node}>
      <div className="small muted" style={{ marginTop: 4 }}>
        {[d.authors, d.year].filter(Boolean).join(' · ') || 'No author/year'}
        {d.relevance_score != null && d.extracted_by_ai && <> · relevance <b>{d.relevance_score}</b>/100</>}
        {d.gap_relationship && d.gap_relationship !== 'unclear' && <> · AI reads it as <b>{d.gap_relationship}</b> the gap</>}
      </div>
      {d.summary ? (
        <p style={{ marginTop: 6 }}>{d.summary}</p>
      ) : (
        !node.content && d.text && <p className="muted" style={{ marginTop: 6 }}>{String(d.text).slice(0, 400)}{String(d.text).length > 400 ? '…' : ''}</p>
      )}
      {gaps.length > 0 && (
        <div className="row wrap small" style={{ marginTop: 8, gap: 6 }}>
          <span className="faint">Research gap:</span>
          {gaps.map((g) => {
            const l = gapLink(g.id);
            return (
              <span key={g.id} className="row" style={{ gap: 4 }}>
                <Ref id={g.id} />
                {l ? (
                  <span className={`badge ${l.relation === 'supports_gap' ? 'ok' : 'warn'}`} style={{ outline: l.status === 'suggested' ? '1px dashed currentColor' : undefined }}>
                    {l.relation === 'supports_gap' ? 'supports' : 'challenges'}{l.status === 'suggested' ? ' (suggested)' : ''}
                  </span>
                ) : null}
                {l?.status === 'suggested' && (
                  <button className="btn sm" onClick={() => run('ae', async () => { await api.acceptEdge(l.id); await refresh(); })}>Confirm</button>
                )}
                {!l && (
                  <>
                    <button className="btn sm" disabled={!!busy} onClick={() => run('s', async () => { await api.createEdge(project.id, node.id, g.id, 'supports_gap'); await refresh(); })}>Supports</button>
                    <button className="btn sm" disabled={!!busy} onClick={() => run('c', async () => { await api.createEdge(project.id, node.id, g.id, 'challenges_gap'); await refresh(); })}>Challenges</button>
                  </>
                )}
              </span>
            );
          })}
        </div>
      )}
      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn sm" onClick={() => setOpen(!open)}>{open ? 'Hide details' : 'Details & key claims'}</button>
        <button className="btn sm" disabled={!!busy} onClick={() => run('x', async () => { await api.extract(node.id); await refresh(); }, 'Re-extracted')}>
          {busy === 'x' ? <Spinner /> : null} {d.extracted_by_ai ? 'Re-extract' : 'Extract with AI'}
        </button>
      </div>
      {open && (
        <div style={{ marginTop: 10 }} className="stack">
          <SourceDetails node={node} />
          {Array.isArray(d.key_claims) && d.key_claims.length > 0 && (
            <div>
              <div className="small bold muted">Turn a key claim into an evidence-backed claim</div>
              <div className="stack-sm" style={{ marginTop: 6 }}>
                {d.key_claims.map((c: string, i: number) => (
                  <div key={i} className="row small" style={{ alignItems: 'flex-start' }}>
                    <span className="grow">{c}</span>
                    {existingClaimTitles.has(c.slice(0, 280).trim().toLowerCase()) ? (
                      <span className="badge ok">in ledger</span>
                    ) : (
                      <button className="btn sm" disabled={!!busy} onClick={() => addClaim(c)}>+ Claim</button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </NodeCard>
  );
}
