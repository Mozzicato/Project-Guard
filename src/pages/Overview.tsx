import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CHECK_NAMES, NODE_LABELS, PROJECT_STAGES, type NodeType, type ProjectStage } from '../../shared/model';
import { api, type Summary } from '../api';
import { Refs, useProject } from '../project';
import { Bar, ScoreRing, SevBadge, Spinner, scoreColor, timeAgo, titleCase, useAction } from '../ui';

export default function Overview() {
  const { project, graph, setProject } = useProject();
  const [s, setS] = useState<Summary | null>(null);
  const { run } = useAction();
  useEffect(() => {
    api.summary(project.id).then(setS);
  }, [project.id, graph]);

  if (!s) return <div className="page"><Spinner /></div>;
  const m = s.live;
  const base = `/p/${project.id}`;
  const empty = graph.nodes.filter((n) => n.status === 'active').length === 0;
  const first = s.runs[s.runs.length - 1];
  const last = s.runs[0];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{project.title}</h1>
          <p>{[project.discipline, project.department, project.institution].filter(Boolean).join(' · ') || 'Add your discipline and institution in the Idea Lab.'}</p>
        </div>
        <label className="field" style={{ width: 200 }}>
          Stage
          <select value={project.stage} onChange={(e) => run('stage', async () => setProject(await api.updateProject(project.id, { stage: e.target.value as ProjectStage })))}>
            {PROJECT_STAGES.map((st) => <option key={st} value={st}>{titleCase(st)}</option>)}
          </select>
        </label>
      </div>

      {empty ? (
        <div className="card card-pad stack" style={{ alignItems: 'flex-start' }}>
          <h2>Start with your idea</h2>
          <p className="muted">
            Project Compiler maps your project as a connected research system — problem → gap → objectives → questions → methods → evidence → results → conclusions — and keeps checking that the chain holds.
          </p>
          <div className="row">
            <Link className="btn primary" to={`${base}/idea`}>Open the Idea Lab</Link>
            <Link className="btn" to={`${base}/blueprint`}>Build the blueprint manually</Link>
          </div>
        </div>
      ) : (
        <div className="stack">
          <div className="card card-pad row" style={{ gap: 28, alignItems: 'center', flexWrap: 'wrap' }}>
            <ScoreRing value={m.score} label="Project health" />
            <div className="grow" style={{ minWidth: 260 }}>
              <div className="grid-4">
                <Stat k="Critical" v={m.critical} color={m.critical ? 'var(--crit)' : undefined} />
                <Stat k="Warnings" v={m.warnings} color={m.warnings ? 'var(--warn)' : undefined} />
                <Stat k="Missing evidence" v={m.missing_evidence} />
                <Stat k="Objectives covered" v={`${m.objectives_covered}/${m.objectives_total}`} />
              </div>
              <div className="grid-2" style={{ marginTop: 14 }}>
                <div>
                  <div className="row between small"><span className="muted bold">Defensibility rate</span><span className="mono">{m.defensibility_rate}%</span></div>
                  <Bar value={m.defensibility_rate} color={scoreColor(m.defensibility_rate)} />
                  <div className="tiny faint" style={{ marginTop: 3 }}>Critical components with valid supporting relationships</div>
                </div>
                <div>
                  <div className="row between small"><span className="muted bold">Defense readiness</span><span className="mono">{m.defense_readiness == null ? '—' : `${m.defense_readiness}%`}</span></div>
                  <Bar value={m.defense_readiness ?? 0} color={scoreColor(m.defense_readiness)} />
                  <div className="tiny faint" style={{ marginTop: 3 }}>{m.defense_readiness == null ? 'Answer questions in the Defense Simulator' : `${s.defense.answered}/${s.defense.total} questions answered`}</div>
                </div>
              </div>
            </div>
          </div>
          <p className="tiny faint">
            The health score is the system's current assessment of completeness and internal consistency — it is not an academic grade. Live values use structural checks; run a full Project Check for AI reasoning.
          </p>

          <div className="grid-2">
            <div className="card">
              <div className="card-head">
                <h3>What to fix next</h3>
                <Link to={`${base}/check`} className="small">Full project check →</Link>
              </div>
              <div className="card-pad stack-sm">
                {s.issues.length === 0 && <div className="faint">No structural issues. Run a full check including AI reasoning.</div>}
                {s.issues.map((i) => (
                  <div key={i.id} className="row" style={{ alignItems: 'flex-start' }}>
                    <SevBadge s={i.severity} />
                    <div className="grow">
                      <div className="small bold">{i.title}</div>
                      <div className="tiny faint">{CHECK_NAMES[i.check]} {i.affected.length > 0 && <Refs ids={i.affected.slice(0, 4)} />}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="stack">
              {s.suggested > 0 && (
                <div className="warn-box row between">
                  <span>{s.suggested} AI suggestion(s) are waiting for your review.</span>
                  <Link className="btn sm" to={`${base}/blueprint`}>Review</Link>
                </div>
              )}
              {s.feedback_open > 0 && (
                <div className="note-box row between">
                  <span>{s.feedback_open} supervisor feedback item(s) are still open.</span>
                  <Link className="btn sm" to={`${base}/feedback`}>Open</Link>
                </div>
              )}
              <div className="card">
                <div className="card-head"><h3>Project model</h3></div>
                <div className="card-pad">
                  <div className="grid-2" style={{ gap: 6 }}>
                    {(['research_gap', 'objective', 'research_question', 'method', 'source', 'claim', 'evidence', 'experiment', 'result', 'conclusion'] as NodeType[]).map((t) => (
                      <div key={t} className="row between small">
                        <span className="muted">{NODE_LABELS[t]}</span>
                        <span className="mono" style={{ color: s.counts[t] ? undefined : 'var(--ink-3)' }}>{s.counts[t] ?? 0}</span>
                      </div>
                    ))}
                  </div>
                  <div className="small muted" style={{ marginTop: 10 }}>
                    Claims evidence-backed: <b>{m.evidence_backed_claims}/{m.claims_total}</b>
                  </div>
                </div>
              </div>
              {s.runs.length > 0 && (
                <div className="card">
                  <div className="card-head">
                    <h3>Integrity over time</h3>
                    {first && last && s.runs.length > 1 && (
                      <span className="small" style={{ color: last.score - first.score >= 0 ? 'var(--ok)' : 'var(--crit)' }}>
                        {last.score - first.score >= 0 ? '+' : ''}{last.score - first.score} since first check
                      </span>
                    )}
                  </div>
                  <div className="card-pad">
                    <Sparkline values={[...s.runs].reverse().map((r) => r.score)} />
                    <div className="tiny faint" style={{ marginTop: 4 }}>Last check {timeAgo(last.created_at)}</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ k, v, color }: { k: string; v: React.ReactNode; color?: string }) {
  return (
    <div className="stat" style={{ padding: 0 }}>
      <div className="k">{k}</div>
      <div className="v" style={{ color }}>{v}</div>
    </div>
  );
}

export function Sparkline({ values }: { values: number[] }) {
  const w = 300;
  const h = 48;
  if (values.length < 2) return <div className="small muted">Score: <b className="mono">{values[0]}</b> — run more checks to see a trend.</div>;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * (w - 8) + 4, h - 4 - (v / 100) * (h - 8)]);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none" role="img" aria-label={`Scores: ${values.join(', ')}`}>
      <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="2.5" fill="var(--accent)">
          <title>{values[i]}</title>
        </circle>
      ))}
    </svg>
  );
}
