import { useEffect, useState } from 'react';
import type { Feedback, FeedbackStatus } from '../../shared/model';
import { api } from '../api';
import { Refs, useProject } from '../project';
import { Spinner, timeAgo, useAction, useToast } from '../ui';
import { SectionBadge } from '../sections';

const STATUSES: [FeedbackStatus, string, string][] = [
  ['open', 'Open', 'crit'],
  ['in_progress', 'In progress', 'warn'],
  ['resolved', 'Resolved', 'ok'],
  ['rejected', 'Rejected / N.A.', 'info'],
];

export default function FeedbackPage() {
  const { project, graph } = useProject();
  const toast = useToast();
  const { busy, run } = useAction();
  const [items, setItems] = useState<Feedback[] | null>(null);
  const [text, setText] = useState('');
  const [supervisor, setSupervisor] = useState('');
  const [filter, setFilter] = useState<FeedbackStatus | 'all'>('all');

  useEffect(() => {
    api.feedback(project.id).then(setItems);
  }, [project.id, graph]);

  const add = () =>
    run('add', async () => {
      const r = await api.addFeedback(project.id, text, supervisor);
      setItems((xs) => [r.feedback, ...(xs ?? [])]);
      setText('');
      if (r.parse_error) toast(`Saved without AI breakdown: ${r.parse_error}`, true);
    });

  const update = (id: number, patch: Partial<Feedback>) =>
    run(`u${id}`, async () => {
      const f = await api.updateFeedback(id, patch);
      setItems((xs) => (xs ?? []).map((x) => (x.id === id ? f : x)));
    });

  const shown = (items ?? []).filter((f) => filter === 'all' || f.status === filter);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title"><SectionBadge id="feedback" />Supervisor feedback</h1>
          <p>Record feedback as you get it. Each item becomes a tracked checklist tied to the parts of your project it affects. You remain the decision-maker — you can reject feedback that doesn't apply.</p>
        </div>
      </div>

      <div className="card card-pad stack" style={{ marginBottom: 20 }}>
        <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. “Your sampling methodology needs justification.”" />
        <div className="row">
          <input style={{ maxWidth: 260 }} value={supervisor} onChange={(e) => setSupervisor(e.target.value)} placeholder="Supervisor / reviewer (optional)" />
          <span className="grow" />
          <button className="btn primary" disabled={!text.trim() || !!busy} onClick={add}>
            {busy === 'add' ? <><Spinner /> Breaking it down…</> : 'Add feedback'}
          </button>
        </div>
      </div>

      <div className="row wrap" style={{ gap: 6, marginBottom: 12 }}>
        <button className={`btn sm${filter === 'all' ? ' primary' : ''}`} onClick={() => setFilter('all')}>All ({items?.length ?? 0})</button>
        {STATUSES.map(([s, l]) => (
          <button key={s} className={`btn sm${filter === s ? ' primary' : ''}`} onClick={() => setFilter(s)}>
            {l} ({(items ?? []).filter((f) => f.status === s).length})
          </button>
        ))}
      </div>

      {!items ? <Spinner /> : (
        <div className="stack">
          {shown.length === 0 && <div className="empty">No feedback here.</div>}
          {shown.map((f) => <FeedbackCard key={f.id} f={f} update={update} onDelete={() => run('del', async () => { await api.deleteFeedback(f.id); setItems((xs) => (xs ?? []).filter((x) => x.id !== f.id)); })} />)}
        </div>
      )}
    </div>
  );
}

function FeedbackCard({ f, update, onDelete }: { f: Feedback; update: (id: number, p: Partial<Feedback>) => void; onDelete: () => void }) {
  const { graph } = useProject();
  const [newAction, setNewAction] = useState('');
  const [editingAffected, setEditingAffected] = useState(false);
  const done = f.actions.filter((a) => a.done).length;
  const st = STATUSES.find((s) => s[0] === f.status)!;
  return (
    <div className="card">
      <div className="card-head" style={{ alignItems: 'flex-start' }}>
        <div className="grow">
          <div className="row" style={{ gap: 8 }}>
            <span className={`badge ${st[2]}`}>{st[1]}</span>
            <h3>{f.summary || f.raw_text}</h3>
          </div>
          <div className="tiny faint" style={{ marginTop: 4 }}>
            {f.supervisor ? `${f.supervisor} · ` : ''}{timeAgo(f.created_at)}
          </div>
        </div>
        <select style={{ width: 150 }} value={f.status} onChange={(e) => update(f.id, { status: e.target.value as FeedbackStatus })}>
          {STATUSES.map(([s, l]) => <option key={s} value={s}>{l}</option>)}
        </select>
        <button className="btn sm ghost danger" onClick={onDelete} aria-label="Delete feedback">✕</button>
      </div>
      <div className="card-pad stack-sm">
        <div className="small muted" style={{ fontStyle: 'italic' }}>“{f.raw_text}”</div>
        <div className="row wrap small" style={{ gap: 6 }}>
          {f.location && <><span className="faint">Affected:</span> <b>{f.location}</b></>}
          <Refs ids={f.affected} />
          <button className="btn sm ghost" onClick={() => setEditingAffected(!editingAffected)}>{editingAffected ? 'Done' : 'Edit components'}</button>
        </div>
        {editingAffected && (
          <div className="row wrap" style={{ gap: 4 }}>
            {graph.nodes.filter((n) => n.status === 'active').map((n) => {
              const on = f.affected.includes(n.id);
              return (
                <button key={n.id} className={`btn sm${on ? ' primary' : ''}`} onClick={() => update(f.id, { affected: on ? f.affected.filter((x) => x !== n.id) : [...f.affected, n.id] })} title={n.title}>
                  {n.title.slice(0, 32)}
                </button>
              );
            })}
          </div>
        )}
        <div className="divider" />
        <div className="row between">
          <span className="small bold">Actions</span>
          <span className="tiny faint">{done}/{f.actions.length} done</span>
        </div>
        {f.actions.map((a, i) => (
          <label key={i} className="row small" style={{ gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={a.done}
              onChange={() => {
                const actions = f.actions.map((x, j) => (j === i ? { ...x, done: !x.done } : x));
                update(f.id, { actions, ...(f.status === 'open' ? { status: 'in_progress' as const } : {}) });
              }}
            />
            <span style={{ textDecoration: a.done ? 'line-through' : undefined, color: a.done ? 'var(--ink-3)' : undefined }}>{a.text}</span>
          </label>
        ))}
        <div className="row">
          <input value={newAction} onChange={(e) => setNewAction(e.target.value)} placeholder="Add an action…" onKeyDown={(e) => {
            if (e.key === 'Enter' && newAction.trim()) {
              update(f.id, { actions: [...f.actions, { text: newAction.trim(), done: false }] });
              setNewAction('');
            }
          }} />
        </div>
        {f.actions.length > 0 && f.actions.every((a) => a.done) && f.status !== 'resolved' && (
          <div className="note-box row between">
            <span>All actions done.</span>
            <button className="btn sm primary" onClick={() => update(f.id, { status: 'resolved' })}>Mark resolved</button>
          </div>
        )}
      </div>
    </div>
  );
}
