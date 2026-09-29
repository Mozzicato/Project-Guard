// Hardware step 5: every requirement proven by a measured test — the traceability matrix
// (requirement → design → test → result) that engineering examiners look for.
import { TEST_STATUSES, type PNode } from '../../shared/model';
import { api } from '../api';
import { NodeCard, Ref, useProject } from '../project';
import { Icon, SectionBadge } from '../sections';
import { Spinner, useAction } from '../ui';
import { DataField, StatTile, SuggestionBar } from '../widgets';

export default function Testing() {
  const { project, graph, refresh, editNode, llm } = useProject();
  const { busy, run } = useAction();
  const of = (t: PNode['type']) => graph.nodes.filter((n) => n.type === t);
  const kids = (id: number, ...t: PNode['type'][]) => graph.edges.filter((e) => e.from_id === id).map((e) => graph.nodes.find((n) => n.id === e.to_id)!).filter((n) => n && t.includes(n.type));

  const reqs = of('requirement').filter((r) => r.status === 'active');
  const tests = of('test');
  const builds = of('experiment');
  const status = (t: PNode) => t.data?.status ?? 'planned';
  const passed = tests.filter((t) => status(t) === 'pass').length;
  const failed = tests.filter((t) => status(t) === 'fail').length;
  const verified = reqs.filter((r) => {
    const ts = kids(r.id, 'test').filter((t) => t.status === 'active');
    return ts.length > 0 && ts.every((t) => status(t) === 'pass');
  }).length;
  const untested = reqs.filter((r) => kids(r.id, 'test').length === 0);

  const draft = () =>
    run('draft', async () => {
      await api.suggestTests(project.id);
      await refresh();
    }, 'Test plan drafted — review each test below');

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title"><SectionBadge id="testing" />Build &amp; Test</h1>
          <p>Prove every requirement with a measured result.</p>
        </div>
        <div className="row">
          {llm && untested.length > 0 && (
            <button className={`btn ${tests.length ? '' : 'primary lg'}`} onClick={draft} disabled={!!busy}>
              {busy === 'draft' ? <><Spinner /> Writing tests (~15s)…</> : <><Icon name="sparkle" size={16} /> Draft a test plan for {untested.length} requirement{untested.length === 1 ? '' : 's'}</>}
            </button>
          )}
        </div>
      </div>

      <SuggestionBar types={['test']} />

      <div className="tiles">
        <StatTile label="Requirements verified" value={`${verified}/${reqs.length}`} sub="every test passing" color={verified === reqs.length && reqs.length ? '#16a34a' : '#0891b2'} />
        <StatTile label="Tests passed" value={passed} color="#16a34a" />
        <StatTile label="Tests failed" value={failed} sub={failed ? 'explain or fix these' : undefined} color={failed ? '#dc2626' : '#64748b'} />
        <StatTile label="Not yet run" value={tests.length - passed - failed} color="#64748b" />
      </div>

      {!reqs.length ? (
        <div className="empty-cta">
          <h3>Nothing to test yet</h3>
          <p>Tests prove requirements. Define your requirements in step 2 first.</p>
        </div>
      ) : (
        <>
          <div className="section-head">
            <h2>Traceability matrix</h2>
            <span className="small faint">Requirement → design → test → result</span>
          </div>
          <div className="table-wrap">
            <table className="dtable rtm">
              <thead>
                <tr>
                  <th style={{ width: 200 }}>Requirement &amp; target</th>
                  <th style={{ width: 120 }}>Realised by</th>
                  <th>Test</th>
                  <th style={{ width: 150 }}>Expected</th>
                  <th style={{ width: 150 }}>Measured</th>
                  <th style={{ width: 110 }}>Result</th>
                </tr>
              </thead>
              <tbody>
                {reqs.map((r) => {
                  const ts = kids(r.id, 'test');
                  const realised = kids(r.id, 'design', 'component');
                  const target = r.data?.target ? `${r.data.target} ${r.data.unit ?? ''}`.trim() : null;
                  const reqCell = (
                    <td rowSpan={Math.max(1, ts.length)}>
                      <div className="row" style={{ gap: 6 }}><Ref id={r.id} /> <b className="small">{r.title}</b></div>
                      <div className="tiny" style={{ color: target ? 'var(--ink-2)' : 'var(--warn)', marginTop: 3 }}>{target ? `Target: ${target}` : 'No target value'}</div>
                    </td>
                  );
                  const realCell = (
                    <td rowSpan={Math.max(1, ts.length)}>
                      <div className="row wrap" style={{ gap: 3 }}>
                        {realised.length ? realised.map((x) => <Ref key={x.id} id={x.id} />) : <span className="tiny" style={{ color: 'var(--warn)' }}>not in design</span>}
                      </div>
                    </td>
                  );
                  if (!ts.length) {
                    return (
                      <tr key={r.id}>
                        {reqCell}
                        {realCell}
                        <td colSpan={4}>
                          <button className="btn sm" onClick={() => editNode({ type: 'test', data: { status: 'planned' } }, { from: r.id, relation: 'verified_by' })}>+ Add a test for this requirement</button>
                        </td>
                      </tr>
                    );
                  }
                  return ts.map((t, i) => (
                    <tr key={t.id} className={`${t.status === 'suggested' ? 'suggested' : ''} res-${status(t)}`}>
                      {i === 0 && reqCell}
                      {i === 0 && realCell}
                      <td>
                        <div className="row" style={{ gap: 6 }}>
                          <Ref id={t.id} /> <b className="small grow">{t.title}</b>
                          {t.status === 'suggested' ? (
                            <>
                              <button className="btn sm primary" onClick={() => run('a', async () => { await api.acceptNode(t.id); await refresh(); })} title="Accept">✓</button>
                              <button className="btn sm danger" onClick={() => run('d', async () => { await api.deleteNode(t.id); await refresh(); })} title="Reject">✕</button>
                            </>
                          ) : (
                            <button className="btn sm ghost" onClick={() => editNode(t)}>Edit</button>
                          )}
                        </div>
                        {t.content && <details className="tiny muted" style={{ marginTop: 3 }}><summary>Procedure{t.data?.equipment ? ` · ${t.data.equipment}` : ''}</summary><div className="pre">{t.content}</div></details>}
                      </td>
                      <td><DataField node={t} field="expected" placeholder="pass criterion" /></td>
                      <td><DataField node={t} field="measured" placeholder="what you measured" /></td>
                      <td><DataField node={t} field="status" options={TEST_STATUSES} /></td>
                    </tr>
                  ));
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="section-head" style={{ marginTop: 26 }}>
        <h2>Build log</h2>
        <button className="btn sm" onClick={() => editNode({ type: 'experiment' })}>+ Build entry</button>
      </div>
      <p className="small faint" style={{ marginBottom: 10 }}>What you built and when: breadboard prototype, PCB assembly, enclosure, firmware versions, problems you hit and how you fixed them. This becomes the construction section of Chapter 4.</p>
      {!builds.length && <div className="table-empty">No build entries yet.</div>}
      <div className="stack-sm">
        {builds.map((b) => <NodeCard key={b.id} node={b} />)}
      </div>
    </div>
  );
}
