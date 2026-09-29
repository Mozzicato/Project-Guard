// The guided path through a project. Every step is a short checklist of concrete tasks whose
// completion is read from the project itself, so the app can always answer "what do I do next?".
// Research projects follow 6 steps; hardware (engineering-build) projects follow 7.
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { PNode, Project } from '../shared/model';
import type { GraphData } from './api';
import { useProject } from './project';
import { Icon, SECTIONS, type SectionId } from './sections';

export interface Task {
  label: string;
  done: boolean;
  /** Where to go to do it (a section of this project); omitted when it is done on the step page itself. */
  to?: SectionId;
}

export interface Step {
  n: number;
  id: SectionId;
  title: string;
  short: string;
  why: string;
  tasks: Task[];
  done: boolean;
  status: string;
  cta: string;
}

function analyse(graph: GraphData) {
  const nodes = graph.nodes.filter((n) => n.status === 'active');
  const ids = new Set(nodes.map((n) => n.id));
  const edges = graph.edges.filter((e) => e.status === 'active' && ids.has(e.from_id) && ids.has(e.to_id));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const of = (t: PNode['type']) => nodes.filter((n) => n.type === t);
  const kids = (id: number, ...types: PNode['type'][]) => edges.filter((e) => e.from_id === id).map((e) => byId.get(e.to_id)!).filter((n) => !types.length || types.includes(n.type));
  const reach = (from: number, type: PNode['type'], through: PNode['type'][]) => {
    const seen = new Set([from]);
    const stack = [from];
    while (stack.length) {
      for (const n of kids(stack.pop()!)) {
        if (n.type === type) return true;
        if (through.includes(n.type) && !seen.has(n.id)) {
          seen.add(n.id);
          stack.push(n.id);
        }
      }
    }
    return false;
  };
  return { nodes, edges, of, kids, reach, suggested: graph.nodes.filter((n) => n.status === 'suggested').length };
}

const done = (tasks: Task[]) => tasks.every((t) => t.done);
const count = (tasks: Task[]) => `${tasks.filter((t) => t.done).length} of ${tasks.length} tasks done`;

export function computeJourney(graph: GraphData, project: Project): Step[] {
  const a = analyse(graph);
  const brief = project.brief;
  const answered = brief?.questions.filter((q) => q.answer.trim()).length ?? 0;
  const check = graph.meta?.last_check ?? null;
  const defAnswered = graph.meta?.defense_answered ?? 0;
  const defTotal = graph.meta?.defense_total ?? 0;
  const sources = a.of('source');
  const gapSupport = a.edges.some((e) => e.relation === 'supports_gap');
  const objectives = a.of('objective');
  const started = a.of('problem').length > 0 || objectives.length > 0;

  const ideaTasks: Task[] = [
    { label: 'Describe your idea in your own words', done: !!project.idea.trim() || started },
    { label: 'Get it analysed and read the brief', done: !!brief || started },
    { label: 'Answer at least one of the questions it asks', done: answered > 0 || started },
  ];
  const idea: Omit<Step, 'n'> = {
    id: 'idea',
    title: 'Shape your idea',
    short: 'Idea',
    why: 'Find the weak spots in your idea before you commit to it.',
    tasks: ideaTasks,
    done: done(ideaTasks),
    status: brief ? `Brief ready · ${answered} question(s) answered` : started ? 'Skipped' : 'Not started',
    cta: brief ? 'Answer the questions' : 'Analyse my idea',
  };

  const checkTasks: Task[] = [
    { label: 'Run the project check', done: !!check },
    { label: 'Fix every critical issue, then re-run', done: !!check && check.critical === 0 },
  ];
  const checkStep: Omit<Step, 'n'> = {
    id: 'check',
    title: 'Check your project',
    short: 'Check',
    why: 'See your project the way an examiner will, and fix what breaks.',
    tasks: checkTasks,
    done: done(checkTasks),
    status: check ? (check.critical ? `${check.critical} critical issue(s) to fix` : `No critical issues · health ${check.score}`) : 'Not run yet',
    cta: check ? 'Fix issues & re-check' : 'Run the check',
  };
  const defTasks: Task[] = [
    { label: 'Generate questions from your project', done: defTotal > 0 },
    { label: 'Answer at least 3 (type or speak)', done: defAnswered >= 3 },
  ];
  const defense: Omit<Step, 'n'> = {
    id: 'defense',
    title: 'Rehearse your defense',
    short: 'Defense',
    why: 'Practise the questions your panel is most likely to ask.',
    tasks: defTasks,
    done: done(defTasks),
    status: defTotal ? `${defAnswered} of ${defTotal} answered` : 'No questions yet',
    cta: defTotal ? 'Keep rehearsing' : 'Generate questions',
  };

  let steps: Omit<Step, 'n'>[];
  if (project.track === 'hardware') {
    const reqs = a.of('requirement');
    const measurable = reqs.filter((r) => String(r.data?.target ?? '').trim()).length;
    const objWithReq = objectives.filter((o) => a.kids(o.id, 'requirement').length > 0).length;
    const reqTasks: Task[] = [
      { label: 'Set the problem and objectives (draft them from your idea)', done: a.of('problem').length > 0 && objectives.length > 0 },
      { label: 'Give every objective a measurable requirement', done: objectives.length > 0 && objWithReq === objectives.length },
      { label: 'Give every requirement a target value', done: reqs.length > 0 && measurable === reqs.length },
      { label: 'Review every AI suggestion', done: a.suggested === 0 },
    ];
    const researchTasks: Task[] = [
      { label: 'Add 2+ sources on existing solutions, parts or methods', done: sources.length >= 2 },
      { label: 'Check each AI summary against the original', done: sources.length >= 2 },
    ];
    const designs = a.of('design');
    const comps = a.of('component');
    const realised = reqs.filter((r) => a.kids(r.id, 'design', 'component').length > 0).length;
    const priced = comps.filter((c) => Number(c.data?.qty) > 0 && String(c.data?.unit_cost ?? '').trim() !== '').length;
    const designTasks: Task[] = [
      { label: 'Add a system block diagram', done: designs.some((d) => (d.data?.kind ?? 'block_diagram') === 'block_diagram') },
      { label: 'List your components (3 or more)', done: comps.length >= 3 },
      { label: 'Link every requirement to the part of the design that meets it', done: reqs.length > 0 && realised === reqs.length },
      { label: 'Add quantity and cost for every part', done: comps.length > 0 && priced === comps.length },
    ];
    const tests = a.of('test');
    const tested = reqs.filter((r) => a.kids(r.id, 'test').length > 0).length;
    const measured = tests.filter((t) => (t.data?.status ?? 'planned') !== 'planned').length;
    const testTasks: Task[] = [
      { label: 'Plan a test for every requirement', done: reqs.length > 0 && tested === reqs.length },
      { label: 'Build it, run the tests and record measured values', done: tests.length > 0 && measured === tests.length },
    ];
    steps = [
      idea,
      {
        id: 'requirements',
        title: 'Define requirements',
        short: 'Requirements',
        why: 'Turn your objectives into measurable engineering specifications you can design for and test.',
        tasks: reqTasks,
        done: done(reqTasks),
        status: reqs.length ? `${reqs.length} requirement(s), ${measurable} measurable` : 'No requirements yet',
        cta: reqs.length ? 'Refine requirements' : 'Draft my requirements',
      },
      {
        id: 'research',
        title: 'Review related work',
        short: 'Related work',
        why: 'Show what already exists and why your design is needed. This is your Chapter 2.',
        tasks: researchTasks,
        done: done(researchTasks),
        status: sources.length ? `${sources.length} source(s)` : 'No sources yet',
        cta: 'Add a source',
      },
      {
        id: 'design',
        title: 'Design the system',
        short: 'Design',
        why: 'Block diagram, calculations and component choices, each justified against a requirement.',
        tasks: designTasks,
        done: done(designTasks),
        status: comps.length || designs.length ? `${designs.length} design artifact(s), ${comps.length} component(s)` : 'Not started',
        cta: comps.length ? 'Complete the design' : 'Design my system',
      },
      {
        id: 'testing',
        title: 'Build & test',
        short: 'Build & test',
        why: 'Prove every requirement with a measured result. This is your Chapter 4.',
        tasks: testTasks,
        done: done(testTasks),
        status: reqs.length ? `${tested}/${reqs.length} requirements have a test · ${measured} measured` : 'Define requirements first',
        cta: tests.length ? 'Record test results' : 'Plan my tests',
      },
      checkStep,
      defense,
    ];
  } else {
    const structured = objectives.filter((o) => a.reach(o.id, 'research_question', ['research_question', 'method']) && a.reach(o.id, 'method', ['research_question', 'method'])).length;
    const bpTasks: Task[] = [
      { label: 'Set the problem and research gap (draft them from your idea)', done: a.of('problem').length > 0 && a.of('research_gap').length > 0 },
      { label: 'Set your objectives', done: objectives.length > 0 },
      { label: 'Give every objective a research question and a method', done: objectives.length > 0 && structured === objectives.length },
      { label: 'Review every AI suggestion', done: a.suggested === 0 },
    ];
    const researchTasks: Task[] = [
      { label: 'Add 2 or more sources (PDF, link or abstract)', done: sources.length >= 2 },
      { label: 'Mark a source that supports your research gap', done: gapSupport },
    ];
    const claims = a.of('claim');
    const unbacked = claims.filter((c) => graph.claimStatus[c.id] === false).length;
    const evTasks: Task[] = [
      { label: 'Add the key claims your project makes', done: claims.length > 0 },
      { label: 'Attach a source or evidence to every claim', done: claims.length > 0 && unbacked === 0 },
    ];
    steps = [
      idea,
      {
        id: 'blueprint',
        title: 'Build the blueprint',
        short: 'Blueprint',
        why: 'Turn the idea into linked parts: problem, gap, objectives, questions, methods.',
        tasks: bpTasks,
        done: done(bpTasks),
        status: a.suggested ? `${a.suggested} suggestion(s) to review` : objectives.length ? `${structured}/${objectives.length} objectives complete` : 'Not started',
        cta: a.suggested ? 'Review suggestions' : objectives.length ? 'Complete the blueprint' : 'Draft my blueprint',
      },
      {
        id: 'research',
        title: 'Gather research',
        short: 'Research',
        why: 'Your research gap only counts if the literature shows it.',
        tasks: researchTasks,
        done: done(researchTasks),
        status: sources.length ? `${sources.length} source(s)${gapSupport ? ', gap supported' : ''}` : 'No sources yet',
        cta: 'Add a source',
      },
      {
        id: 'evidence',
        title: 'Back your claims',
        short: 'Claims',
        why: 'A claim without evidence is just an opinion; examiners will ask for the source.',
        tasks: evTasks,
        done: done(evTasks),
        status: claims.length ? (unbacked ? `${unbacked} of ${claims.length} unbacked` : `All ${claims.length} backed`) : 'No claims yet',
        cta: unbacked ? 'Back my claims' : 'Add a claim',
      },
      checkStep,
      defense,
    ];
  }
  return steps.map((s, i) => ({ ...s, n: i + 1 }));
}

export function useJourney() {
  const { graph, project } = useProject();
  const steps = computeJourney(graph, project);
  const current = steps.find((s) => !s.done) ?? null;
  return { steps, current, total: steps.length, doneCount: steps.filter((s) => s.done).length };
}

export const pathOf = (pid: number, id: SectionId) => `/p/${pid}${SECTIONS[id].path}`;

// ---------------------------------------------------------------------------
// Step hero: the top of every step page (gradient banner + task checklist)
// ---------------------------------------------------------------------------

export function StepHero({ section }: { section: SectionId }) {
  const { project } = useProject();
  const { steps, total } = useJourney();
  const step = steps.find((s) => s.id === section);
  if (!step) return null;
  const tasksDone = step.tasks.filter((t) => t.done).length;
  return (
    <div className="step-hero" style={{ ['--sec' as any]: SECTIONS[section].color }}>
      <div className="sh-main">
        <div className="sh-kicker">
          <span className="sh-pill">Step {step.n} of {total}</span>
          {step.done && <span className="sh-pill done"><Icon name="check" size={12} /> Complete</span>}
        </div>
        <h1>{step.title}</h1>
        <p>{step.why}</p>
        <div className="sh-track" aria-label="Your progress through the steps">
          {steps.map((s) => (
            <Link key={s.n} to={pathOf(project.id, s.id)} className={`sh-dot${s.done ? ' done' : ''}${s.id === section ? ' here' : ''}`} title={`Step ${s.n}: ${s.title}`}>
              {s.done ? <Icon name="check" size={11} /> : s.n}
            </Link>
          ))}
        </div>
      </div>
      <div className="sh-tasks">
        <div className="sh-tasks-head">
          <b>Your tasks</b>
          <span>{tasksDone}/{step.tasks.length}</span>
        </div>
        <div className="sh-bar"><div style={{ width: `${(tasksDone / step.tasks.length) * 100}%` }} /></div>
        <ul>
          {step.tasks.map((t) => (
            <li key={t.label} className={t.done ? 'done' : ''}>
              <span className="tk">{t.done ? <Icon name="check" size={12} /> : null}</span>
              <span className="grow">{t.label}</span>
              {!t.done && t.to && t.to !== section && (
                <Link to={pathOf(project.id, t.to)} className="tk-go">Go →</Link>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Continue bar: always visible at the bottom of a step page
// ---------------------------------------------------------------------------

export function ContinueBar({ section }: { section: SectionId }) {
  const { project } = useProject();
  const { steps } = useJourney();
  const idx = steps.findIndex((s) => s.id === section);
  if (idx < 0) return null;
  const step = steps[idx];
  const next = steps[idx + 1] ?? null;
  const left = step.tasks.filter((t) => !t.done).length;
  return (
    <div className={`continue-bar${step.done ? ' ready' : ''}`} style={{ ['--sec' as any]: next ? SECTIONS[next.id].color : SECTIONS.check.color }}>
      <div className="cb-left">
        {step.done ? (
          <>
            <span className="cb-ok"><Icon name="check" size={15} /></span>
            <span><b>Step {step.n} complete.</b> {next ? `Up next: ${next.title}.` : 'You have finished every step.'}</span>
          </>
        ) : (
          <>
            <span className="cb-count">{left}</span>
            <span>
              <b>{left === 1 ? '1 task left' : `${left} tasks left`}</b> in this step · {step.tasks.find((t) => !t.done)?.label}
            </span>
          </>
        )}
      </div>
      <div className="row" style={{ gap: 8 }}>
        {next ? (
          step.done ? (
            <Link className="btn cb-go" to={pathOf(project.id, next.id)}>
              Continue to step {next.n} <Icon name="arrow" size={16} />
            </Link>
          ) : (
            <Link className="cb-skip" to={pathOf(project.id, next.id)}>Skip to step {next.n} →</Link>
          )
        ) : (
          <Link className="btn cb-go" to={`/p/${project.id}`}>Back to your path</Link>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Celebration when a step is completed (small wins keep momentum)
// ---------------------------------------------------------------------------

export function Celebration() {
  const { project } = useProject();
  const { steps } = useJourney();
  const nav = useNavigate();
  const prev = useRef<Set<number> | null>(null);
  const [shown, setShown] = useState<{ step: Step; next: Step | null } | null>(null);
  useEffect(() => {
    const doneNow = new Set(steps.filter((s) => s.done).map((s) => s.n));
    if (prev.current) {
      const newly = steps.find((s) => s.done && !prev.current!.has(s.n));
      if (newly) setShown({ step: newly, next: steps.find((s) => s.n > newly.n && !s.done) ?? steps.find((s) => !s.done) ?? null });
    }
    prev.current = doneNow;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps.map((s) => (s.done ? 1 : 0)).join('')]);
  if (!shown) return null;
  const { step, next } = shown;
  return (
    <div className="celebrate-back" onMouseDown={(e) => e.target === e.currentTarget && setShown(null)}>
      <div className="celebrate" style={{ ['--sec' as any]: SECTIONS[step.id].color }}>
        <div className="confetti" aria-hidden="true">
          {Array.from({ length: 18 }).map((_, i) => (
            <i key={i} style={{ ['--i' as any]: i }} />
          ))}
        </div>
        <div className="cel-badge"><Icon name="trophy" size={34} /></div>
        <h2>Step {step.n} complete!</h2>
        <p>
          <b>{step.title}</b> is done. {next ? `Next up: step ${next.n}, ${next.title.toLowerCase()}.` : 'Every step is complete. Your project is in defensible shape.'}
        </p>
        <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 6 }}>
          <button className="btn" onClick={() => setShown(null)}>Stay here</button>
          {next && (
            <button
              className="btn cel-go"
              onClick={() => {
                setShown(null);
                nav(pathOf(project.id, next.id));
              }}
            >
              Continue to step {next.n} →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Home: greeting hero + a Duolingo-style path of steps
// ---------------------------------------------------------------------------

export function HomeHero({ name }: { name: string }) {
  const { project } = useProject();
  const { current, doneCount, total } = useJourney();
  const pct = Math.round((doneCount / total) * 100);
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <div className="home-hero">
      <div className="grow">
        <div className="hh-kicker">{project.track === 'hardware' ? 'Hardware / engineering build' : 'Research project'}</div>
        <h1>{doneCount === 0 ? `Let's get started${name ? `, ${name}` : ''}.` : current ? `Keep going${name ? `, ${name}` : ''}.` : `Brilliant work${name ? `, ${name}` : ''}.`}</h1>
        <p>{current ? <>Your next step is <b>{current.title.toLowerCase()}</b>: {current.why.charAt(0).toLowerCase() + current.why.slice(1)}</> : 'All steps are complete. Re-run the check after every change and keep rehearsing.'}</p>
        {current && (
          <Link className="btn hh-go" to={pathOf(project.id, current.id)}>
            {current.cta} <Icon name="arrow" size={16} />
          </Link>
        )}
      </div>
      <div className="hh-ring" title={`${doneCount} of ${total} steps done`}>
        <svg width="96" height="96" viewBox="0 0 96 96">
          <circle cx="48" cy="48" r={r} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="9" />
          <circle cx="48" cy="48" r={r} fill="none" stroke="#fff" strokeWidth="9" strokeLinecap="round" strokeDasharray={`${(pct / 100) * c} ${c}`} transform="rotate(-90 48 48)" />
        </svg>
        <div><b>{doneCount}/{total}</b><span>steps</span></div>
      </div>
    </div>
  );
}

export function PathMap() {
  const { project } = useProject();
  const { steps, current } = useJourney();
  return (
    <div className="path-map">
      {steps.map((s, i) => {
        const state = s.done ? 'done' : current?.n === s.n ? 'current' : 'todo';
        const side = i % 2 === 0 ? 'left' : 'right';
        return (
          <div key={s.n} className={`pm-row ${side} ${state}`} style={{ ['--sec' as any]: SECTIONS[s.id].color }}>
            {i < steps.length - 1 && <span className="pm-line" />}
            <Link to={pathOf(project.id, s.id)} className="pm-node" aria-label={`Step ${s.n}: ${s.title}`}>
              {state === 'current' && <span className="pm-bubble">{s.n === 1 && !steps[0].done ? 'Start here' : 'Next'}</span>}
              <Icon name={SECTIONS[s.id].icon} size={28} />
              {s.done && <span className="pm-check"><Icon name="check" size={12} /></span>}
            </Link>
            <Link to={pathOf(project.id, s.id)} className="pm-card">
              <span className="pm-step">Step {s.n}</span>
              <b>{s.title}</b>
              <span className="pm-status">{s.status}</span>
              <span className="pm-mini">
                {s.tasks.map((t) => (
                  <i key={t.label} className={t.done ? 'on' : ''} />
                ))}
              </span>
            </Link>
          </div>
        );
      })}
    </div>
  );
}
