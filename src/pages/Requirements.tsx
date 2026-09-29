// Hardware step 2: objectives become measurable engineering specifications.
import { NODE_LABELS, VERIFICATION_METHODS, type PNode } from '../../shared/model';
import { api } from '../api';
import { NodeCard, Ref, useProject } from '../project';
import { Icon, SectionBadge, TYPE_COLOR } from '../sections';
import { Spinner, useAction } from '../ui';
import { DataField, StatTile, SuggestionBar } from '../widgets';

export default function Requirements() {
  const { project, graph, refresh, editNode, llm } = useProject();
  const { busy, run } = useAction();
  // Suggested items are shown inline (dashed) so they can be reviewed where they belong.
  const of = (t: PNode['type']) => graph.nodes.filter((n) => n.type === t);
  const edges = graph.edges;
  const kids = (id: number, t: PNode['type']) => edges.filter((e) => e.from_id === id).map((e) => graph.nodes.find((n) => n.id === e.to_id)!).filter((n) => n?.type === t);
  const parents = (id: number, t: PNode['type']) => edges.filter((e) => e.to_id === id).map((e) => graph.nodes.find((n) => n.id === e.from_id)!).filter((n) => n?.type === t);

  const objectives = of('objective');
  const reqs = of('requirement');
  const unlinked = reqs.filter((r) => parents(r.id, 'objective').length === 0);
  const measurable = reqs.filter((r) => String(r.data?.target ?? '').trim()).length;
  const withTest = reqs.filter((r) => kids(r.id, 'test').length).length;
  const problem = of('problem')[0];
  const canDraft = llm && (project.idea.trim() || project.brief);

  const draft = () =>
    run('draft', async () => {
      await api.suggestBlueprint(project.id);
      await refresh();
    }, 'Draft ready — review the suggestions below');

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title"><SectionBadge id="requirements" />Requirements</h1>
          <p>Objectives become measurable engineering specifications.</p>
        </div>
        <div className="row">
          {canDraft && (
            <button className={`btn ${reqs.length ? '' : 'primary lg'}`} onClick={draft} disabled={!!busy}>
              {busy === 'draft' ? <><Spinner /> Drafting (~20s)…</> : <><Icon name="sparkle" size={16} /> {reqs.length ? 'Suggest more' : 'Draft objectives & requirements from my idea'}</>}
            </button>
          )}
        </div>
      </div>

      <SuggestionBar />

      <div className="tiles">
        <StatTile label="Objectives" value={objectives.length} color={TYPE_COLOR.objective} />
        <StatTile label="Requirements" value={reqs.length} color={TYPE_COLOR.requirement} />
        <StatTile label="Measurable" value={`${measurable}/${reqs.length}`} sub="have a target value" color={measurable === reqs.length && reqs.length ? '#16a34a' : '#d97706'} />
        <StatTile label="Have a test" value={`${withTest}/${reqs.length}`} sub="planned or run" color={withTest === reqs.length && reqs.length ? '#16a34a' : '#64748b'} />
      </div>

      <div className="explain">
        <b>What makes a good requirement?</b> It is <b>measurable</b> (a number and a unit), <b>testable</b> (you can prove it in the lab) and tied to an objective.
        Instead of “the device should be fast”, write <i>“Response time ≤ 2 s”</i>.
      </div>

      {problem ? (
        <div style={{ marginBottom: 18 }}>
          <NodeCard node={problem} />
        </div>
      ) : (
        !reqs.length &&
        !objectives.length && (
          <div className="empty-cta">
            <h3>Start by setting your objectives</h3>
            <p>{canDraft ? 'Let us draft the problem, objectives and measurable requirements from your idea — you review each one.' : 'Add a problem statement and objectives, then the requirements that make each objective measurable.'}</p>
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn" onClick={() => editNode({ type: 'problem' })}>+ Problem statement</button>
              <button className="btn" onClick={() => editNode({ type: 'objective' })}>+ Objective</button>
            </div>
          </div>
        )
      )}

      {objectives.map((o) => {
        const rs = kids(o.id, 'requirement');
        return (
          <div key={o.id} className={`obj-block${o.status === 'suggested' ? ' suggested' : ''}`}>
            <div className="obj-head">
              <Ref id={o.id} />
              <b className="grow">{o.title}</b>
              {o.status === 'suggested' && <span className="badge warn">Suggested</span>}
              <button className="btn sm" onClick={() => editNode(o)}>Edit</button>
              {o.status === 'suggested' && (
                <button className="btn sm primary" onClick={() => run('acc', async () => { await api.acceptNode(o.id); await refresh(); })}>Accept</button>
              )}
            </div>
            {o.content && <p className="obj-desc">{o.content}</p>}
            <ReqTable reqs={rs} kids={kids} />
            <button className="btn sm ghost add-row" onClick={() => editNode({ type: 'requirement', data: { verification: 'test' } }, { from: o.id, relation: 'specified_by' })}>
              + Add a requirement to this objective
            </button>
          </div>
        );
      })}
      {objectives.length > 0 && (
        <button className="btn" onClick={() => editNode({ type: 'objective' })} style={{ marginBottom: 20 }}>+ Objective</button>
      )}

      {unlinked.length > 0 && (
        <div className="obj-block loose">
          <div className="obj-head"><b>Requirements not linked to an objective</b></div>
          <ReqTable reqs={unlinked} kids={kids} />
        </div>
      )}
    </div>
  );
}

function ReqTable({ reqs, kids }: { reqs: PNode[]; kids: (id: number, t: PNode['type']) => PNode[] }) {
  const { editNode, refresh } = useProject();
  const { run } = useAction();
  if (!reqs.length) return <div className="table-empty">No requirements yet. What must the device achieve, as a number?</div>;
  return (
    <div className="table-wrap">
      <table className="dtable">
        <thead>
          <tr>
            <th style={{ width: 80 }}>ID</th>
            <th>Requirement</th>
            <th style={{ width: 110 }}>Target</th>
            <th style={{ width: 80 }}>Unit</th>
            <th style={{ width: 140 }}>Verify by</th>
            <th style={{ width: 150 }}>Traced to</th>
            <th style={{ width: 90 }} />
          </tr>
        </thead>
        <tbody>
          {reqs.map((r) => {
            const realised = [...kids(r.id, 'design'), ...kids(r.id, 'component')];
            const tests = kids(r.id, 'test');
            const suggested = r.status === 'suggested';
            return (
              <tr key={r.id} className={suggested ? 'suggested' : ''}>
                <td><Ref id={r.id} /></td>
                <td>
                  <div className="bold">{r.title}</div>
                  {r.content && <div className="tiny muted">{r.content}</div>}
                </td>
                <td><DataField node={r} field="target" placeholder="e.g. ≤ 2" /></td>
                <td><DataField node={r} field="unit" placeholder="s" /></td>
                <td><DataField node={r} field="verification" options={VERIFICATION_METHODS} /></td>
                <td>
                  <span className={`trace ${realised.length ? 'on' : ''}`} title={realised.length ? `Realised by ${realised.map((x) => x.title).join(', ')}` : 'Not yet realised in the design'}>Design</span>
                  <span className={`trace ${tests.length ? 'on' : ''}`} title={tests.length ? `Verified by ${tests.map((x) => x.title).join(', ')}` : 'No test yet'}>Test</span>
                </td>
                <td className="row" style={{ gap: 4 }}>
                  {suggested ? (
                    <>
                      <button className="btn sm primary" onClick={() => run('a', async () => { await api.acceptNode(r.id); await refresh(); })} title="Accept">✓</button>
                      <button className="btn sm danger" onClick={() => run('d', async () => { await api.deleteNode(r.id); await refresh(); })} title="Reject">✕</button>
                    </>
                  ) : (
                    <button className="btn sm ghost" onClick={() => editNode(r)} title={`Edit ${NODE_LABELS.requirement.toLowerCase()}`}>Edit</button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
