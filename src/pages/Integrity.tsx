import { useEffect, useState } from 'react';
import { CHECK_NAMES, type CheckId, type IntegrityRun, type Issue, type Severity } from '../../shared/model';
import { api } from '../api';
import { Refs, useProject } from '../project';
import { ScoreRing, SevBadge, Spinner, timeAgo, useAction } from '../ui';
import { Sparkline } from './Overview';
import { SectionBadge } from '../sections';

export default function Integrity() {
  const { project, llm, graph } = useProject();
  const { busy, run } = useAction();
  const [runs, setRuns] = useState<IntegrityRun[] | null>(null);
  const [includeAi, setIncludeAi] = useState(llm);
  const [sel, setSel] = useState(0);
  const [sevFilter, setSevFilter] = useState<Severity | 'all'>('all');
  const [checkFilter, setCheckFilter] = useState<CheckId | 'all'>('all');

  useEffect(() => {
    api.runs(project.id).then(setRuns);
  }, [project.id]);

  const check = () =>
    run('check', async () => {
      const r = await api.check(project.id, includeAi);
      setRuns((rs) => [r, ...(rs ?? [])]);
      setSel(0);
    });

  const cur = runs?.[sel];
  const prev = runs?.[sel + 1];
  const first = runs?.[runs.length - 1];
  const issues = (cur?.issues ?? []).filter((i) => (sevFilter === 'all' || i.severity === sevFilter) && (checkFilter === 'all' || i.check === checkFilter));
  const key = (i: Issue) => `${i.check}|${i.title}`;
  const prevKeys = new Set((prev?.issues ?? []).filter((i) => i.severity !== 'passed').map(key));
  const curKeys = new Set((cur?.issues ?? []).filter((i) => i.severity !== 'passed').map(key));
  const resolved = prev ? prev.issues.filter((i) => i.severity !== 'passed' && !curKeys.has(key(i))) : [];
  const stale = cur && new Date(`${cur.created_at.replace(' ', 'T')}Z`).getTime() < Math.max(...graph.nodes.map((n) => new Date(`${n.updated_at.replace(' ', 'T')}Z`).getTime()), 0);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title"><SectionBadge id="check" />Project Check</h1>
          <p>The Integrity Engine runs deterministic structural checks on your project graph, then AI reasoning for what rules cannot see: methodology fit, gap support, scope drift and contradictions.</p>
        </div>
        <div className="stack-sm" style={{ alignItems: 'flex-end' }}>
          <button className="btn primary" onClick={check} disabled={!!busy}>
            {busy ? <><Spinner /> {includeAi ? 'Checking (AI reasoning takes ~20s)…' : 'Checking…'}</> : cur ? 'Re-run check' : 'Run project check'}
          </button>
          <label className="row small muted" style={{ gap: 6 }}>
            <input type="checkbox" checked={includeAi} disabled={!llm} onChange={(e) => setIncludeAi(e.target.checked)} /> Include AI reasoning (checks B, D, G, H)
          </label>
        </div>
      </div>

      {!runs ? (
        <Spinner />
      ) : !cur ? (
        <div className="empty">No checks yet. Run your first project check to see where the chain breaks.</div>
      ) : (
        <div className="stack">
          {sel === 0 && stale && <div className="note-box">You have changed the project since this check. Re-run it to validate your changes.</div>}
          {cur.ai_error && <div className="warn-box">AI reasoning failed for this run, so only structural checks are shown: {cur.ai_error}</div>}
          <div className="card card-pad row" style={{ gap: 28, flexWrap: 'wrap' }}>
            <ScoreRing value={cur.metrics.score} label="Project health" critical={cur.metrics.critical} />
            <div className="grow" style={{ minWidth: 280 }}>
              <div className="grid-4">
                <Metric k="Critical issues" v={cur.metrics.critical} c={cur.metrics.critical ? 'var(--crit)' : undefined} />
                <Metric k="Warnings" v={cur.metrics.warnings} c={cur.metrics.warnings ? 'var(--warn)' : undefined} />
                <Metric k="Missing evidence" v={cur.metrics.missing_evidence} />
                <Metric k="Objectives covered" v={`${cur.metrics.objectives_covered}/${cur.metrics.objectives_total}`} />
                <Metric k="Defensibility rate" v={`${cur.metrics.defensibility_rate}%`} />
                <Metric k="Defense readiness" v={cur.metrics.defense_readiness == null ? '—' : `${cur.metrics.defense_readiness}%`} />
                <Metric k="Claims backed" v={`${cur.metrics.evidence_backed_claims}/${cur.metrics.claims_total}`} />
                <Metric k="Integrity change" v={first && first.id !== cur.id ? `${cur.metrics.score - first.metrics.score >= 0 ? '+' : ''}${cur.metrics.score - first.metrics.score}` : '—'} c={first && cur.metrics.score - first.metrics.score > 0 ? 'var(--ok)' : undefined} />
              </div>
              <div className="tiny faint" style={{ marginTop: 10 }}>
                {cur.include_ai ? 'Structural + AI reasoning' : 'Structural checks only'} · {timeAgo(cur.created_at)} · Not an academic grade — a measure of completeness and internal consistency.
              </div>
            </div>
          </div>

          {prev && (resolved.length > 0 || [...curKeys].some((k) => !prevKeys.has(k))) && (
            <div className="grid-2">
              <div className="card card-pad">
                <h3 style={{ color: 'var(--ok)' }}>Resolved since previous check ({resolved.length})</h3>
                <ul className="small muted" style={{ margin: '6px 0 0', paddingLeft: 18 }}>{resolved.slice(0, 8).map((i) => <li key={i.id}>{i.title}</li>)}</ul>
              </div>
              <div className="card card-pad">
                <h3 style={{ color: 'var(--crit)' }}>New since previous check ({[...curKeys].filter((k) => !prevKeys.has(k)).length})</h3>
                <ul className="small muted" style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                  {cur.issues.filter((i) => i.severity !== 'passed' && !prevKeys.has(key(i))).slice(0, 8).map((i) => <li key={i.id}>{i.title}</li>)}
                </ul>
              </div>
            </div>
          )}

          <div className="row wrap" style={{ gap: 6 }}>
            {(['all', 'critical', 'warning', 'info', 'passed'] as const).map((s) => {
              const n = s === 'all' ? cur.issues.length : cur.issues.filter((i) => i.severity === s).length;
              return <button key={s} className={`btn sm${sevFilter === s ? ' primary' : ''}`} onClick={() => setSevFilter(s)}>{s === 'all' ? 'All' : s[0].toUpperCase() + s.slice(1)} ({n})</button>;
            })}
            <select style={{ width: 240, marginLeft: 'auto' }} value={checkFilter} onChange={(e) => setCheckFilter(e.target.value as CheckId | 'all')}>
              <option value="all">All checks</option>
              {(Object.keys(CHECK_NAMES) as CheckId[]).map((c) => <option key={c} value={c}>{c === 'FB' || c === 'S' ? '' : `${c} — `}{CHECK_NAMES[c]}</option>)}
            </select>
          </div>

          <div className="stack">
            {issues.map((i) => <IssueCard key={i.id} i={i} isNew={!!prev && i.severity !== 'passed' && !prevKeys.has(key(i))} />)}
            {!issues.length && <div className="empty">Nothing matches this filter.</div>}
          </div>

          {runs.length > 1 && (
            <div className="card">
              <div className="card-head"><h3>Check history</h3><span className="faint small">Project Integrity Improvement = latest − first</span></div>
              <div className="card-pad stack-sm">
                <Sparkline values={[...runs].reverse().map((r) => r.metrics.score)} />
                {runs.slice(0, 12).map((r, idx) => (
                  <button key={r.id} className={`btn sm ghost`} style={{ justifyContent: 'space-between', background: idx === sel ? 'var(--accent-soft)' : undefined }} onClick={() => setSel(idx)}>
                    <span>{timeAgo(r.created_at)} {r.include_ai ? '· with AI' : ''}</span>
                    <span className="mono">{r.metrics.score} · {r.metrics.critical} crit · {r.metrics.warnings} warn</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Metric({ k, v, c }: { k: string; v: React.ReactNode; c?: string }) {
  return (
    <div>
      <div className="tiny faint bold" style={{ textTransform: 'uppercase', letterSpacing: '.05em' }}>{k}</div>
      <div style={{ fontSize: 20, fontWeight: 680, color: c }} className="mono">{v}</div>
    </div>
  );
}

export function IssueCard({ i, isNew }: { i: Issue; isNew?: boolean }) {
  const [open, setOpen] = useState(i.severity === 'critical');
  const passed = i.severity === 'passed';
  return (
    <div className={`issue ${i.severity}`}>
      <div className="row" style={{ alignItems: 'flex-start', cursor: passed ? 'default' : 'pointer' }} onClick={() => !passed && setOpen(!open)}>
        <SevBadge s={i.severity} />
        <div className="grow">
          <div className="t">{i.title}</div>
          <div className="tiny faint">
            {i.check !== 'S' && i.check !== 'FB' ? `Check ${i.check} · ` : ''}{CHECK_NAMES[i.check]} · {i.origin === 'ai' ? <span className="prov ai_inference">AI reasoning</span> : 'rule'}
            {isNew && <span className="badge crit" style={{ marginLeft: 6, height: 16 }}>new</span>}
          </div>
        </div>
        {!passed && <span className="faint small">{open ? '▾' : '▸'}</span>}
      </div>
      {open && !passed && (
        <dl>
          <dt>Problem</dt>
          <dd>{i.title}</dd>
          <dt>Why it matters</dt>
          <dd>{i.why || '—'}</dd>
          <dt>Affected</dt>
          <dd>{i.affected.length ? <Refs ids={i.affected} /> : <span className="faint">Project-wide</span>}</dd>
          <dt>Evidence</dt>
          <dd>{i.evidence || '—'}</dd>
          <dt>Next action</dt>
          <dd style={{ color: 'var(--ink)', fontWeight: 500 }}>{i.action || '—'}</dd>
        </dl>
      )}
    </div>
  );
}
