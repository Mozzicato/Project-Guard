import { useEffect, useRef, useState } from 'react';
import { DEFENSE_CATEGORIES, type DefenseCategory, type DefenseQuestion } from '../../shared/model';
import { api, type Readiness } from '../api';
import { Refs, useProject } from '../project';
import { Bar, ScoreRing, Spinner, scoreColor, titleCase, useAction } from '../ui';

const CAT_HINT: Record<DefenseCategory, string> = {
  fundamentals: 'What problem are you solving?',
  methodology: 'Why this methodology?',
  technical: 'Why this algorithm / tool / design?',
  evidence: 'What supports this conclusion?',
  limitations: 'What are the limitations?',
  challenge: 'Why prefer your approach over existing ones?',
};

export default function Defense() {
  const { project, llm, graph } = useProject();
  const { busy, run } = useAction();
  const [data, setData] = useState<{ questions: DefenseQuestion[]; readiness: Readiness } | null>(null);
  const [cat, setCat] = useState<DefenseCategory | 'all'>('all');
  const [active, setActive] = useState<number | null>(null);
  const [custom, setCustom] = useState({ q: '', c: 'fundamentals' });

  const load = () => api.defense(project.id).then(setData);
  useEffect(() => {
    load();
  }, [project.id]);

  const generate = (replace: boolean) =>
    run('gen', async () => {
      await api.generateQuestions(project.id, 12, replace);
      await load();
    });

  if (!data) return <div className="page"><Spinner /></div>;
  const qs = data.questions;
  const r = data.readiness;
  const shown = qs.filter((q) => cat === 'all' || q.category === cat);
  const strong = Object.entries(r.categories).filter(([, v]) => v >= 70);
  const weak = Object.entries(r.categories).filter(([, v]) => v < 70);
  const highRisk = qs
    .filter((q) => q.risk === 'high' || (q.evaluation && q.evaluation.score < 55))
    .sort((a, b) => (a.evaluation?.score ?? -1) - (b.evaluation?.score ?? -1))
    .slice(0, 5);
  const activeQ = qs.find((q) => q.id === active);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Defense Simulator</h1>
          <p>Questions generated from your project graph and its known weak spots. Answer by typing or speaking; each answer is checked for relevance, consistency with your project, unsupported claims and contradictions.</p>
        </div>
        <div className="row">
          {qs.length > 0 && <button className="btn" disabled={!!busy || !llm} onClick={() => generate(false)}>+ More questions</button>}
          <button className="btn primary" disabled={!!busy || !llm || !graph.nodes.length} onClick={() => generate(qs.length > 0)}>
            {busy === 'gen' ? <><Spinner /> Preparing the panel…</> : qs.length ? 'New question set' : 'Generate questions'}
          </button>
        </div>
      </div>

      {qs.length === 0 ? (
        <div className="empty">{graph.nodes.length ? 'Generate a question set to start practising.' : 'Build your blueprint first — questions come from your project graph.'}</div>
      ) : (
        <div className="stack">
          <div className="card card-pad row" style={{ gap: 28, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <ScoreRing value={r.overall} label="Defense readiness" />
            <div className="grow grid-3" style={{ minWidth: 300 }}>
              <div>
                <div className="small bold" style={{ color: 'var(--ok)' }}>Strong</div>
                {strong.length ? strong.map(([k, v]) => <div key={k} className="small">✓ {titleCase(k)} <span className="faint mono">{v}</span></div>) : <div className="small faint">—</div>}
              </div>
              <div>
                <div className="small bold" style={{ color: 'var(--warn)' }}>Needs work</div>
                {weak.length ? weak.map(([k, v]) => <div key={k} className="small">⚠ {titleCase(k)} <span className="faint mono">{v}</span></div>) : <div className="small faint">—</div>}
                {DEFENSE_CATEGORIES.filter((c) => !(c in r.categories) && qs.some((q) => q.category === c)).map((c) => <div key={c} className="small faint">○ {titleCase(c)} (not practised)</div>)}
              </div>
              <div>
                <div className="small bold" style={{ color: 'var(--crit)' }}>High-risk questions</div>
                <ol className="small" style={{ margin: '2px 0 0', paddingLeft: 18 }}>
                  {highRisk.map((q) => (
                    <li key={q.id}><a href="#" onClick={(e) => { e.preventDefault(); setActive(q.id); }}>{q.question.length > 70 ? `${q.question.slice(0, 70)}…` : q.question}</a></li>
                  ))}
                </ol>
              </div>
            </div>
          </div>
          <div className="tiny faint">{r.answered}/{r.total} answered. Unanswered high-risk questions count against readiness.</div>

          <div className="grid-2" style={{ gridTemplateColumns: 'minmax(0, 5fr) minmax(0, 7fr)', alignItems: 'start' }}>
            <div className="stack-sm">
              <div className="row wrap" style={{ gap: 4 }}>
                <button className={`btn sm${cat === 'all' ? ' primary' : ''}`} onClick={() => setCat('all')}>All</button>
                {DEFENSE_CATEGORIES.map((c) => (
                  <button key={c} className={`btn sm${cat === c ? ' primary' : ''}`} onClick={() => setCat(c)} title={CAT_HINT[c]}>{titleCase(c)}</button>
                ))}
              </div>
              {shown.map((q) => (
                <button key={q.id} className="card card-pad" onClick={() => setActive(q.id)} style={{ textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit', borderColor: q.id === active ? 'var(--accent)' : undefined, padding: '10px 12px' }}>
                  <div className="row between">
                    <span className="tiny faint bold" style={{ textTransform: 'uppercase' }}>{q.category}</span>
                    <span className="row" style={{ gap: 4 }}>
                      {q.risk === 'high' && <span className="badge crit">high risk</span>}
                      {q.evaluation ? <span className="badge" style={{ background: 'var(--panel-2)', color: scoreColor(q.evaluation.score) }}>{q.evaluation.score}</span> : <span className="badge outline">unanswered</span>}
                    </span>
                  </div>
                  <div className="small" style={{ marginTop: 4 }}>{q.question}</div>
                </button>
              ))}
              <div className="card card-pad stack-sm">
                <div className="small bold">Add your own question</div>
                <input value={custom.q} onChange={(e) => setCustom({ ...custom, q: e.target.value })} placeholder="A question you expect from the panel" />
                <div className="row">
                  <select value={custom.c} onChange={(e) => setCustom({ ...custom, c: e.target.value })}>
                    {DEFENSE_CATEGORIES.map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}
                  </select>
                  <button className="btn" disabled={!custom.q.trim()} onClick={() => run('cq', async () => { const q = await api.customQuestion(project.id, custom.q, custom.c); setCustom({ ...custom, q: '' }); await load(); setActive(q.id); })}>Add</button>
                </div>
              </div>
            </div>
            <div style={{ position: 'sticky', top: 16 }}>
              {activeQ ? <AnswerPanel key={activeQ.id} q={activeQ} onSaved={load} onDelete={() => run('dq', async () => { await api.deleteQuestion(activeQ.id); setActive(null); await load(); })} /> : <div className="empty">Pick a question to practise.</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Minimal typing for the Web Speech API (Chrome / Edge).
type SpeechRec = { lang: string; continuous: boolean; interimResults: boolean; start(): void; stop(): void; onresult: (e: any) => void; onend: () => void; onerror: (e: any) => void };

function AnswerPanel({ q, onSaved, onDelete }: { q: DefenseQuestion; onSaved: () => void; onDelete: () => void }) {
  const { llm } = useProject();
  const { busy, run } = useAction();
  const [answer, setAnswer] = useState(q.answer);
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRec | null>(null);
  const baseRef = useRef('');
  const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;

  useEffect(() => () => recRef.current?.stop(), []);

  const toggleVoice = () => {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const rec: SpeechRec = new SR();
    rec.lang = 'en-NG';
    rec.continuous = true;
    rec.interimResults = true;
    baseRef.current = answer ? `${answer.trim()} ` : '';
    rec.onresult = (e: any) => {
      let finalText = '';
      let interim = '';
      for (let i = 0; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t;
        else interim += t;
      }
      setAnswer(baseRef.current + finalText + interim);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  };

  const submit = () =>
    run('ans', async () => {
      recRef.current?.stop();
      await api.answer(q.id, answer);
      onSaved();
    });

  const ev = q.evaluation;
  return (
    <div className="card">
      <div className="card-head" style={{ alignItems: 'flex-start' }}>
        <div>
          <div className="tiny faint bold" style={{ textTransform: 'uppercase' }}>{q.category} · {q.risk} risk</div>
          <h2 style={{ marginTop: 4, lineHeight: 1.4 }}>{q.question}</h2>
          {q.rationale && <div className="tiny faint" style={{ marginTop: 4 }}>Probes: {q.rationale} <Refs ids={q.target_ids} /></div>}
        </div>
        <button className="btn sm ghost danger" onClick={onDelete} aria-label="Delete question">✕</button>
      </div>
      <div className="card-pad stack">
        <textarea rows={7} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Answer as you would in front of the panel. Reference your actual method, data and results." />
        <div className="row">
          {SR ? (
            <button className={`btn${listening ? ' danger' : ''}`} onClick={toggleVoice}>
              {listening ? <><span className="pulse">●</span> Stop recording</> : '🎙 Answer by voice'}
            </button>
          ) : (
            <span className="tiny faint">Voice answers need Chrome or Edge.</span>
          )}
          <span className="grow" />
          <button className="btn primary" disabled={!answer.trim() || !!busy || !llm} onClick={submit}>
            {busy ? <><Spinner /> Examining…</> : ev ? 'Re-submit answer' : 'Submit answer'}
          </button>
        </div>

        {ev && (
          <div className="stack">
            <div className="divider" />
            <div className="grid-3">
              {([['Overall', ev.score], ['Relevance', ev.relevance], ['Consistency', ev.consistency]] as const).map(([k, v]) => (
                <div key={k}>
                  <div className="row between small"><span className="muted bold">{k}</span><span className="mono" style={{ color: scoreColor(v) }}>{v}</span></div>
                  <Bar value={v} color={scoreColor(v)} />
                </div>
              ))}
            </div>
            <p>{ev.summary}</p>
            <EvalList title="Strengths" items={ev.strengths} color="var(--ok)" />
            <EvalList title="Unsupported claims" items={ev.unsupported_claims} color="var(--crit)" />
            <EvalList title="Missing evidence" items={ev.missing_evidence} color="var(--warn)" />
            {ev.contradictions.length > 0 && (
              <div>
                <div className="small bold" style={{ color: 'var(--crit)' }}>Contradicts your project</div>
                {ev.contradictions.map((c, i) => (
                  <div key={i} className="small" style={{ marginTop: 4 }}>“{c.statement}” <Refs ids={c.conflicts_with} /></div>
                ))}
              </div>
            )}
            <EvalList title="Likely follow-up questions" items={ev.follow_ups} color="var(--accent)" />
            <div className="tiny faint">AI examiner assessment — an inference to help you prepare, not a grade.</div>
          </div>
        )}
      </div>
    </div>
  );
}

function EvalList({ title, items, color }: { title: string; items: string[]; color: string }) {
  if (!items.length) return null;
  return (
    <div>
      <div className="small bold" style={{ color }}>{title}</div>
      <ul className="small" style={{ margin: '4px 0 0', paddingLeft: 18 }}>{items.map((x, i) => <li key={i}>{x}</li>)}</ul>
    </div>
  );
}
