import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { DEFAULT_PROJECT_TITLE, PROJECT_STAGES, PROJECT_TYPES, type HealthMetrics, type Project, type Track } from '../../shared/model';
import { api } from '../api';
import { useAuth } from '../auth';
import { Spinner, scoreColor, timeAgo, titleCase, useAction } from '../ui';
import { Icon, SectionBadge, type IconName } from '../sections';

const TRACK_OPTIONS: { id: Track; title: string; text: string; steps: string; icon: IconName; color: string }[] = [
  {
    id: 'research',
    title: 'Research, software or study',
    text: 'Surveys, experiments, data analysis, software systems, case studies.',
    steps: 'Idea → Blueprint → Research → Claims → Check → Defense',
    icon: 'book',
    color: '#4f46e5',
  },
  {
    id: 'hardware',
    title: 'Hardware / engineering build',
    text: 'You will design, build and test a physical device or system.',
    steps: 'Idea → Requirements → Related work → Design → Build & test → Check → Defense',
    icon: 'cpu',
    color: '#ea580c',
  },
];

type ProjectRow = Project & { latest: HealthMetrics | null; nodes: number };

export default function Projects() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<ProjectRow[] | null>(null);
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    api.projects().then(setProjects).catch(() => setProjects([]));
  }, []);

  if (!projects) return <div className="page"><Spinner /></div>;
  const firstName = (user.name || '').split(' ')[0];

  // First visit: welcome + the create form, nothing else competing for attention.
  if (projects.length === 0) {
    return (
      <div className="page">
        <div className="welcome">
          <h1>Welcome{firstName ? `, ${firstName}` : ''}. Let's start your project.</h1>
          <p>Tell us your idea — even a rough one. We'll question it, help you structure it, and check it the way your examiners will.</p>
          <div className="welcome-steps">
            <div><span>1</span>Describe your idea</div>
            <div><span>2</span>We analyse it and ask the hard questions</div>
            <div><span>3</span>Follow the guided steps to a defensible project</div>
          </div>
        </div>
        <CreateProject />
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title"><SectionBadge id="projects" />Your projects</h1>
          <p>Pick up where you left off, or start something new.</p>
        </div>
        {!creating && <button className="btn primary" onClick={() => setCreating(true)}>+ New project</button>}
      </div>
      {creating && (
        <div style={{ marginBottom: 24 }}>
          <CreateProject onCancel={() => setCreating(false)} />
        </div>
      )}
      <div className="grid-3">
        {projects.map((p) => (
          <Link key={p.id} to={`/p/${p.id}`} className="card card-pad project-card">
            <div className="row between" style={{ alignItems: 'flex-start' }}>
              <h3 style={{ lineHeight: 1.35 }}>{p.title}</h3>
              {p.latest && (
                <span className="score-chip" style={{ color: scoreColor(p.latest.score) }} title="Health at last check">
                  {p.latest.score}
                </span>
              )}
            </div>
            <div className="small muted" style={{ marginTop: 6 }}>{[p.discipline, titleCase(p.stage)].filter(Boolean).join(' · ')}</div>
            <div className="row between" style={{ marginTop: 14 }}>
              <span className="tiny faint">{p.nodes} components · updated {timeAgo(p.updated_at)}</span>
              <span className="small bold" style={{ color: 'var(--sec)' }}>Continue →</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function CreateProject({ onCancel }: { onCancel?: () => void }) {
  const nav = useNavigate();
  const { busy, run } = useAction();
  const [more, setMore] = useState(false);
  const [track, setTrack] = useState<Track>('research');
  const [f, setF] = useState({
    title: '',
    discipline: '',
    department: '',
    institution: '',
    project_type: '',
    stage: 'ideation',
    idea: '',
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run('create', async () => {
      // Left blank, the Idea Lab replaces the placeholder with a suggested title.
      const title = f.title.trim() || DEFAULT_PROJECT_TITLE;
      const p = await api.createProject({ ...f, title, track, project_type: f.project_type || (track === 'hardware' ? 'design_and_build' : '') } as Partial<Project>);
      // With an idea, go straight into the analysis so the first screen already has something useful.
      nav(`/p/${p.id}/idea`, { state: { autoAnalyze: !!f.idea.trim() } });
    });
  };

  return (
    <form className="card create-card" onSubmit={submit}>
      <div className="card-pad stack" style={{ gap: 16 }}>
        <div>
          <span className="big-label">What kind of project is it?</span>
          <div className="track-cards">
            {TRACK_OPTIONS.map((t) => (
              <button type="button" key={t.id} className={`track-card${track === t.id ? ' on' : ''}`} style={{ ['--c' as any]: t.color }} onClick={() => setTrack(t.id)} aria-pressed={track === t.id}>
                <span className="tc-icon"><Icon name={t.icon} size={22} /></span>
                <span className="grow">
                  <b>{t.title}</b>
                  <span>{t.text}</span>
                  <span className="tc-steps">{t.steps}</span>
                </span>
                <span className="tc-radio">{track === t.id && <Icon name="check" size={13} />}</span>
              </button>
            ))}
          </div>
        </div>
        <label className="field">
          <span className="big-label">What is your project about?</span>
          <textarea
            rows={4}
            autoFocus
            value={f.idea}
            onChange={set('idea')}
            placeholder={
              track === 'hardware'
                ? 'e.g. I want to build a solar-powered controller that waters crops automatically when the soil gets dry, and alerts the farmer by SMS.'
                : 'e.g. I want to study why smallholder farmers in Kano are not adopting solar-powered irrigation pumps, even though they are cheaper in the long run.'
            }
          />
          <span className="tiny faint" style={{ fontWeight: 400 }}>Rough is fine. Two or three sentences in your own words.</span>
        </label>
        <div className="grid-2">
          <label className="field">
            Working title <span className="faint" style={{ fontWeight: 400 }}>(optional — we'll suggest one)</span>
            <input value={f.title} onChange={set('title')} placeholder="e.g. Solar irrigation adoption in Kano" />
          </label>
          <label className="field">
            Discipline
            <input value={f.discipline} onChange={set('discipline')} placeholder={track === 'hardware' ? 'e.g. Electrical & Electronics Engineering' : 'e.g. Agricultural Economics'} />
          </label>
        </div>
        {more ? (
          <div className="grid-2">
            <label className="field">
              Department
              <input value={f.department} onChange={set('department')} />
            </label>
            <label className="field">
              Institution
              <input value={f.institution} onChange={set('institution')} />
            </label>
            <label className="field">
              Project type
              <select value={f.project_type} onChange={set('project_type')}>
                <option value="">Not sure yet</option>
                {PROJECT_TYPES.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}
              </select>
            </label>
            <label className="field">
              Where are you now?
              <select value={f.stage} onChange={set('stage')}>
                {PROJECT_STAGES.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}
              </select>
            </label>
          </div>
        ) : (
          <button type="button" className="btn sm ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setMore(true)}>
            + Department, institution, project type (optional)
          </button>
        )}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          {onCancel && <button type="button" className="btn" onClick={onCancel}>Cancel</button>}
          <button className="btn primary lg" disabled={!!busy || (!f.idea.trim() && !f.title.trim())}>
            {busy ? <Spinner /> : <Icon name="sparkle" size={16} />} {f.idea.trim() ? 'Create & analyse my idea' : 'Create project'}
          </button>
        </div>
      </div>
    </form>
  );
}
