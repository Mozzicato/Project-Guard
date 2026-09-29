import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BRIEF_FIELDS, PROJECT_TYPES, type BriefKey, type OpportunityBrief } from '../../shared/model';
import { api } from '../api';
import { useProject } from '../project';
import { Bar, ProvBadge, Spinner, scoreColor, timeAgo, titleCase, useAction } from '../ui';
import { SectionBadge } from '../sections';

export default function IdeaLab() {
  const { project, setProject, refresh, llm, graph } = useProject();
  const nav = useNavigate();
  const { busy, run } = useAction();
  const [idea, setIdea] = useState(project.idea);
  const [meta, setMeta] = useState({ title: project.title, discipline: project.discipline, department: project.department, institution: project.institution, project_type: project.project_type });
  const [brief, setBrief] = useState<OpportunityBrief | null>(project.brief);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setBrief(project.brief);
    setDirty(false);
  }, [project.brief]);
  // The analysis may replace a placeholder title with a suggested one.
  useEffect(() => {
    setMeta((m) => ({ ...m, title: project.title }));
  }, [project.title]);

  const analyze = () =>
    run('analyze', async () => {
      await api.updateProject(project.id, meta);
      const p = await api.analyzeIdea(project.id, { idea, brief });
      setProject(p);
    });

  // Arriving from "Create & analyse my idea": start the analysis immediately (once, even under StrictMode).
  const location = useLocation();
  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoStarted.current || !(location.state as any)?.autoAnalyze || project.brief || !llm || !project.idea.trim()) return;
    autoStarted.current = true;
    nav(location.pathname, { replace: true, state: null });
    analyze();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveBrief = () =>
    run('save', async () => {
      setProject(await api.updateProject(project.id, { ...meta, idea, brief }));
      setDirty(false);
    }, 'Brief saved');

  const blueprint = () =>
    run('bp', async () => {
      if (dirty) await api.updateProject(project.id, { ...meta, idea, brief });
      const r = await api.suggestBlueprint(project.id);
      await refresh();
      nav(`/p/${project.id}/blueprint`, { state: { generated: r } });
    });

  const setField = (k: BriefKey, value: string) => {
    if (!brief) return;
    // Anything the student writes becomes their own statement (NFR-05).
    setBrief({ ...brief, fields: { ...brief.fields, [k]: { value, basis: 'user' } } });
    setDirty(true);
  };
  const setAnswer = (qid: string, answer: string) => {
    if (!brief) return;
    setBrief({ ...brief, questions: brief.questions.map((q) => (q.id === qid ? { ...q, answer } : q)) });
    setDirty(true);
  };

  const unanswered = brief?.questions.filter((q) => !q.answer.trim()).length ?? 0;
  const hasBlueprint = graph.nodes.some((n) => ['objective', 'problem', 'research_gap'].includes(n.type));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title"><SectionBadge id="idea" />Idea Lab</h1>
          <p>Describe your idea roughly. The Lab will not write your project — it interrogates the idea so you find weaknesses now, not at your defense.</p>
        </div>
      </div>

      <div className="grid-2" style={{ gridTemplateColumns: 'minmax(0, 5fr) minmax(0, 7fr)', alignItems: 'start' }}>
        <div className="card">
          <div className="card-head"><h3>Your idea</h3></div>
          <div className="card-pad stack">
            <label className="field">
              Title
              <input value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} />
            </label>
            <div className="grid-2" style={{ gap: 10 }}>
              <label className="field">
                Discipline
                <input value={meta.discipline} onChange={(e) => setMeta({ ...meta, discipline: e.target.value })} />
              </label>
              <label className="field">
                Project type
                <select value={meta.project_type} onChange={(e) => setMeta({ ...meta, project_type: e.target.value })}>
                  <option value="">Not sure yet</option>
                  {PROJECT_TYPES.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}
                </select>
              </label>
              <label className="field">
                Department
                <input value={meta.department} onChange={(e) => setMeta({ ...meta, department: e.target.value })} />
              </label>
              <label className="field">
                Institution
                <input value={meta.institution} onChange={(e) => setMeta({ ...meta, institution: e.target.value })} />
              </label>
            </div>
            <label className="field">
              Idea
              <textarea rows={7} value={idea} onChange={(e) => setIdea(e.target.value)} placeholder="I want to build a system that detects fake news." />
            </label>
            <button className="btn primary" onClick={analyze} disabled={!!busy || !idea.trim() || !llm}>
              {busy === 'analyze' ? <><Spinner /> Interrogating your idea…</> : brief ? 'Re-analyse with my edits & answers' : 'Analyse my idea'}
            </button>
            {brief && <div className="tiny faint">Last analysed {timeAgo(brief.analyzed_at)}. Fields you edit are kept as your own on re-analysis.</div>}
          </div>
        </div>

        <div className="stack">
          {!brief && busy === 'analyze' ? (
            <div className="card card-pad stack analyzing">
              <div className="row" style={{ gap: 10 }}>
                <Spinner />
                <b>Reading your idea…</b>
              </div>
              <p className="muted small">This takes about 15 seconds. We're looking at:</p>
              <ul className="small muted" style={{ margin: 0, paddingLeft: 18 }}>
                <li>how clear the problem is, and who it affects</li>
                <li>what already exists, and where the research gap might be</li>
                <li>whether it's feasible — data, resources, scope</li>
                <li>the questions your supervisor is likely to ask</li>
              </ul>
            </div>
          ) : !brief ? (
            <div className="empty">
              Describe your idea on the left and click <b>Analyse my idea</b>. You'll get a brief — problem, target, existing approaches, gap, risks, scope, evaluation — plus the questions you need to answer. Every point is labelled with where it came from.
            </div>
          ) : (
            <>
              <div className="card card-pad">
                <div className="row between">
                  <h3>Problem clarity</h3>
                  <span className="mono bold" style={{ color: scoreColor(brief.problem_clarity.score) }}>{brief.problem_clarity.score}/100</span>
                </div>
                <div style={{ margin: '8px 0' }}><Bar value={brief.problem_clarity.score} color={scoreColor(brief.problem_clarity.score)} /></div>
                <p className="muted small">{brief.problem_clarity.comment}</p>
              </div>

              {brief.questions.length > 0 && (
                <div className="card">
                  <div className="card-head">
                    <h3>Questions you need to answer</h3>
                    <span className="faint small">{unanswered} unanswered</span>
                  </div>
                  <div className="card-pad stack">
                    {brief.questions.map((q) => (
                      <div key={q.id} className="stack-sm">
                        <div className="bold">{q.question}</div>
                        {q.why && <div className="tiny faint">{q.why}</div>}
                        <textarea rows={2} value={q.answer} onChange={(e) => setAnswer(q.id, e.target.value)} placeholder="Your answer (or 'I don't know yet')" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="card">
                <div className="card-head">
                  <h3>Project Opportunity Brief</h3>
                  <div className="row">
                    {dirty && <span className="tiny faint">Unsaved edits</span>}
                    <button className="btn sm" disabled={!dirty || !!busy} onClick={saveBrief}>Save</button>
                  </div>
                </div>
                <div className="card-pad stack">
                  {BRIEF_FIELDS.map(([k, label]) => {
                    const f = brief.fields[k];
                    return (
                      <div key={k} className="stack-sm">
                        <div className="row between">
                          <span className="small bold">{label}</span>
                          <ProvBadge p={f?.basis ?? 'unknown'} />
                        </div>
                        <textarea rows={Math.min(6, Math.max(2, Math.ceil((f?.value.length ?? 0) / 90)))} value={f?.value ?? ''} onChange={(e) => setField(k, e.target.value)} />
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="card card-pad row between" style={{ flexWrap: 'wrap' }}>
                <div className="grow" style={{ minWidth: 240 }}>
                  <div className="bold">Ready to structure it?</div>
                  <div className="small muted">
                    Generate a blueprint skeleton (problem, gap, objectives, questions, methods…) as <b>suggestions</b>. Nothing enters your project until you accept it.
                  </div>
                </div>
                <button className="btn primary" onClick={blueprint} disabled={!!busy || !llm}>
                  {busy === 'bp' ? <><Spinner /> Drafting suggestions…</> : hasBlueprint ? 'Suggest more blueprint items' : 'Suggest a blueprint'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
