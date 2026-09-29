import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PROJECT_STAGES, PROJECT_TYPES, type HealthMetrics, type Project } from '../../shared/model';
import { api } from '../api';
import { Spinner, scoreColor, timeAgo, titleCase, useAction } from '../ui';
import { SectionBadge } from '../sections';

export default function Projects() {
  const [projects, setProjects] = useState<(Project & { latest: HealthMetrics | null; nodes: number })[] | null>(null);
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    api.projects().then(setProjects).catch(() => setProjects([]));
  }, []);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title"><SectionBadge id="projects" />Your projects</h1>
          <p>We don't write your project. We make sure you can defend it.</p>
        </div>
        {!creating && projects && projects.length > 0 && (
          <button className="btn primary" onClick={() => setCreating(true)}>+ New project</button>
        )}
      </div>
      {!projects ? (
        <Spinner />
      ) : creating || projects.length === 0 ? (
        <CreateProject onCancel={projects.length ? () => setCreating(false) : undefined} />
      ) : (
        <div className="grid-3">
          {projects.map((p) => (
            <Link key={p.id} to={`/p/${p.id}`} className="card card-pad" style={{ color: 'inherit', textDecoration: 'none' }}>
              <div className="row between" style={{ alignItems: 'flex-start' }}>
                <h3 style={{ lineHeight: 1.35 }}>{p.title}</h3>
                {p.latest && (
                  <span className="bold mono" style={{ color: scoreColor(p.latest.score), fontSize: 16 }}>
                    {p.latest.score}
                  </span>
                )}
              </div>
              <div className="small muted" style={{ marginTop: 6 }}>
                {[p.discipline, titleCase(p.stage)].filter(Boolean).join(' · ')}
              </div>
              <div className="tiny faint" style={{ marginTop: 10 }}>
                {p.nodes} components · updated {timeAgo(p.updated_at)}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateProject({ onCancel }: { onCancel?: () => void }) {
  const nav = useNavigate();
  const { busy, run } = useAction();
  const [f, setF] = useState({
    title: '',
    discipline: '',
    department: '',
    institution: '',
    project_type: 'software_system',
    stage: 'ideation',
    idea: '',
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run('create', async () => {
      const p = await api.createProject(f as Partial<Project>);
      nav(`/p/${p.id}/idea`);
    });
  };

  return (
    <form className="card" onSubmit={submit} style={{ maxWidth: 760 }}>
      <div className="card-head">
        <h2>Start a project</h2>
        <span className="faint small">You can change any of this later</span>
      </div>
      <div className="card-pad stack">
        <label className="field">
          Working title
          <input required value={f.title} onChange={set('title')} placeholder="e.g. Fake news detection for Nigerian Pidgin on WhatsApp" />
        </label>
        <div className="grid-3">
          <label className="field">
            Discipline
            <input value={f.discipline} onChange={set('discipline')} placeholder="Computer Science" />
          </label>
          <label className="field">
            Department
            <input value={f.department} onChange={set('department')} placeholder="Computer Sciences" />
          </label>
          <label className="field">
            Institution
            <input value={f.institution} onChange={set('institution')} placeholder="University of Lagos" />
          </label>
        </div>
        <div className="grid-2">
          <label className="field">
            Project type
            <select value={f.project_type} onChange={set('project_type')}>
              {PROJECT_TYPES.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}
            </select>
          </label>
          <label className="field">
            Current stage
            <select value={f.stage} onChange={set('stage')}>
              {PROJECT_STAGES.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}
            </select>
          </label>
        </div>
        <label className="field">
          Your idea, in your own words
          <textarea rows={5} value={f.idea} onChange={set('idea')} placeholder="I want to build a system that detects fake news…  (rough is fine — the Idea Lab will interrogate it with you)" />
        </label>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          {onCancel && <button type="button" className="btn" onClick={onCancel}>Cancel</button>}
          <button className="btn primary" disabled={!!busy}>{busy ? <Spinner /> : null} Create project → Idea Lab</button>
        </div>
      </div>
    </form>
  );
}
