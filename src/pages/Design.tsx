// Hardware step 4: block diagram, calculations and component choices — each traced to a requirement.
import { useState } from 'react';
import { DESIGN_KINDS, type PNode } from '../../shared/model';
import { api } from '../api';
import { LinkModal, NodeCard, Ref, useProject } from '../project';
import { Icon, SectionBadge, TYPE_COLOR } from '../sections';
import { Spinner, titleCase, useAction } from '../ui';
import { DataField, StatTile, SuggestionBar } from '../widgets';

export default function Design() {
  const { project, graph, refresh, editNode, llm } = useProject();
  const { busy, run } = useAction();
  const of = (t: PNode['type']) => graph.nodes.filter((n) => n.type === t);
  const kids = (id: number, ...t: PNode['type'][]) => graph.edges.filter((e) => e.from_id === id).map((e) => graph.nodes.find((n) => n.id === e.to_id)!).filter((n) => n && t.includes(n.type));
  const parents = (id: number, ...t: PNode['type'][]) => graph.edges.filter((e) => e.to_id === id).map((e) => graph.nodes.find((n) => n.id === e.from_id)!).filter((n) => n && t.includes(n.type));

  const reqs = of('requirement').filter((r) => r.status === 'active');
  const designs = of('design');
  const comps = of('component');
  const realised = reqs.filter((r) => kids(r.id, 'design', 'component').length > 0);
  const total = comps.filter((c) => c.status === 'active').reduce((s, c) => s + (Number(c.data?.qty) || 0) * (Number(c.data?.unit_cost) || 0), 0);

  const suggest = () =>
    run('suggest', async () => {
      await api.suggestDesign(project.id);
      await refresh();
    }, 'Design suggestions ready — confirm part numbers and prices before accepting');

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title"><SectionBadge id="design" />System Design</h1>
          <p>Block diagram, calculations and component choices.</p>
        </div>
        <div className="row">
          {llm && reqs.length > 0 && (
            <button className={`btn ${comps.length ? '' : 'primary lg'}`} onClick={suggest} disabled={!!busy}>
              {busy === 'suggest' ? <><Spinner /> Designing (~25s)…</> : <><Icon name="sparkle" size={16} /> {comps.length ? 'Suggest more' : 'Suggest a design from my requirements'}</>}
            </button>
          )}
        </div>
      </div>

      <SuggestionBar types={['design', 'component']} />

      <div className="tiles">
        <StatTile label="Design artifacts" value={designs.length} color={TYPE_COLOR.design} />
        <StatTile label="Components" value={comps.length} color={TYPE_COLOR.component} />
        <StatTile label="Requirements realised" value={`${realised.length}/${reqs.length}`} color={realised.length === reqs.length && reqs.length ? '#16a34a' : '#d97706'} />
        <StatTile label="Estimated cost" value={total ? total.toLocaleString() : '—'} sub="sum of qty × unit cost" color="#0f766e" />
      </div>

      {!reqs.length && (
        <div className="empty-cta">
          <h3>Define your requirements first</h3>
          <p>Every block and part in your design should exist to meet a requirement. Set them in step 2, then come back here.</p>
        </div>
      )}

      {reqs.length > 0 && (
        <div className="coverage">
          <span className="small bold muted">Requirement coverage:</span>
          {reqs.map((r) => (
            <span key={r.id} className={`cov-chip ${kids(r.id, 'design', 'component').length ? 'ok' : 'missing'}`} title={r.title}>
              <Ref id={r.id} /> {kids(r.id, 'design', 'component').length ? 'realised' : 'not realised'}
            </span>
          ))}
        </div>
      )}

      <div className="section-head" style={{ marginTop: 18 }}>
        <h2>Design artifacts</h2>
        <button className="btn sm" onClick={() => editNode({ type: 'design', data: { kind: 'block_diagram' } })}>+ Design artifact</button>
      </div>
      <p className="small faint" style={{ marginBottom: 10 }}>
        Your block diagram, key calculations (power budget, sensor ranges), schematic notes, simulation, PCB and firmware. For a block diagram, write one connection per line, like <code>Soil sensor → ESP32 ADC</code>.
      </p>
      {!designs.length && <div className="table-empty">No design artifacts yet. Start with a block diagram of the subsystems.</div>}
      <div className="grid-2">
        {designs.map((d) => (
          <NodeCard key={d.id} node={d}>
            <div className="row" style={{ marginTop: 8, gap: 8 }}>
              <span className="small faint">Kind</span>
              <DataField node={d} field="kind" options={DESIGN_KINDS} width={170} />
            </div>
            {(d.data?.kind ?? 'block_diagram') === 'block_diagram' && <BlockFlow text={d.content} />}
          </NodeCard>
        ))}
      </div>

      <div className="section-head" style={{ marginTop: 26 }}>
        <h2>Components &amp; bill of materials</h2>
        <button className="btn sm" onClick={() => editNode({ type: 'component', data: { qty: 1 } })}>+ Component</button>
      </div>
      {comps.length === 0 ? (
        <div className="table-empty">No components yet. List every part you will buy, with why you chose it.</div>
      ) : (
        <div className="table-wrap">
          <table className="dtable">
            <thead>
              <tr>
                <th style={{ width: 80 }}>ID</th>
                <th>Component &amp; why</th>
                <th style={{ width: 150 }}>Part number</th>
                <th style={{ width: 70 }}>Qty</th>
                <th style={{ width: 110 }}>Unit cost</th>
                <th style={{ width: 100 }}>Subtotal</th>
                <th style={{ width: 150 }}>Meets</th>
                <th style={{ width: 80 }} />
              </tr>
            </thead>
            <tbody>
              {comps.map((c) => (
                <ComponentRow key={c.id} c={c} meets={parents(c.id, 'requirement', 'design')} />
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={5} style={{ textAlign: 'right' }} className="bold">Estimated total</td>
                <td className="bold mono">{total.toLocaleString()}</td>
                <td colSpan={2} className="tiny faint">Prices marked “est.” are AI estimates; confirm them.</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

function ComponentRow({ c, meets }: { c: PNode; meets: PNode[] }) {
  const { refresh, editNode } = useProject();
  const { run } = useAction();
  const [linking, setLinking] = useState(false);
  const qty = Number(c.data?.qty) || 0;
  const unit = Number(c.data?.unit_cost);
  const suggested = c.status === 'suggested';
  return (
    <tr className={suggested ? 'suggested' : ''}>
      <td><Ref id={c.id} /></td>
      <td>
        <div className="bold">{c.title}</div>
        {c.content ? <div className="tiny muted">{c.content}</div> : <div className="tiny" style={{ color: 'var(--warn)' }}>Why this part? Add the rationale.</div>}
      </td>
      <td><DataField node={c} field="part" placeholder="e.g. ESP32" /></td>
      <td><DataField node={c} field="qty" type="number" /></td>
      <td>
        <DataField node={c} field="unit_cost" placeholder="0" />
        {c.data?.price_estimated && <span className="tiny" style={{ color: 'var(--warn)' }}>est.</span>}
      </td>
      <td className="mono">{qty && Number.isFinite(unit) ? (qty * unit).toLocaleString() : '—'}</td>
      <td>
        <div className="row wrap" style={{ gap: 3 }}>
          {meets.map((m) => <Ref key={m.id} id={m.id} />)}
          {!meets.length && <span className="tiny" style={{ color: 'var(--warn)' }}>not traced</span>}
        </div>
      </td>
      <td>
        {suggested ? (
          <div className="row" style={{ gap: 4 }}>
            <button className="btn sm primary" onClick={() => run('a', async () => { await api.acceptNode(c.id); await refresh(); })} title="Accept">✓</button>
            <button className="btn sm danger" onClick={() => run('d', async () => { await api.deleteNode(c.id); await refresh(); })} title="Reject">✕</button>
          </div>
        ) : (
          <div className="row" style={{ gap: 2 }}>
            <button className="btn sm ghost" onClick={() => editNode(c)}>Edit</button>
            <button className="btn sm ghost" onClick={() => setLinking(true)} title="Link to a requirement or design block">Link</button>
          </div>
        )}
        {linking && <LinkModal node={c} onClose={() => setLinking(false)} />}
      </td>
    </tr>
  );
}

/** Render "A → B" lines as a simple left-to-right flow so a block diagram reads as a diagram. */
function BlockFlow({ text }: { text: string }) {
  const lines = text
    .split('\n')
    .map((l) => l.replace(/^[-*\d.)\s]+/, '').trim())
    .filter((l) => /→|->/.test(l))
    .map((l) => l.split(/\s*(?:→|->)\s*/).filter(Boolean));
  if (!lines.length) return null;
  return (
    <div className="block-flow">
      {lines.slice(0, 12).map((parts, i) => (
        <div key={i} className="bf-row">
          {parts.map((p, j) => (
            <span key={j} className="row" style={{ gap: 6 }}>
              <span className="bf-block">{titleCase(p)}</span>
              {j < parts.length - 1 && <span className="bf-arrow">→</span>}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
