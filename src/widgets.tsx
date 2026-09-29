// Small building blocks shared by the step pages.
import { useEffect, useState } from 'react';
import type { PNode } from '../shared/model';
import { api } from './api';
import { useProject } from './project';
import { useAction } from './ui';

/** Review bar for AI suggestions: nothing enters the project until the student accepts it. */
export function SuggestionBar({ types }: { types?: PNode['type'][] }) {
  const { project, graph, refresh } = useProject();
  const { busy, run } = useAction();
  const pending = graph.nodes.filter((n) => n.status === 'suggested' && (!types || types.includes(n.type)));
  if (!pending.length) return null;
  return (
    <div className="suggest-bar">
      <div>
        <b>{pending.length} AI suggestion{pending.length === 1 ? '' : 's'} to review.</b> They're dashed below. Accept, edit or reject each one; nothing is added until you say so.
      </div>
      <div className="row">
        <button className="btn sm" disabled={!!busy} onClick={() => run('r', async () => { await api.suggestions(project.id, 'reject-all'); await refresh(); }, 'Suggestions rejected')}>Reject all</button>
        <button className="btn sm primary" disabled={!!busy} onClick={() => run('a', async () => { await api.suggestions(project.id, 'accept-all'); await refresh(); }, 'Suggestions accepted')}>Accept all</button>
      </div>
    </div>
  );
}

/** A table cell that edits one `data` field of a node and saves on blur (every save is versioned). */
export function DataField({
  node,
  field,
  placeholder,
  width,
  type = 'text',
  options,
}: {
  node: PNode;
  field: string;
  placeholder?: string;
  width?: number | string;
  type?: 'text' | 'number';
  options?: readonly string[];
}) {
  const { refresh } = useProject();
  const { run } = useAction();
  const current = node.data?.[field] ?? '';
  const [v, setV] = useState(String(current));
  useEffect(() => setV(String(node.data?.[field] ?? '')), [node.data, field]);
  const save = (value: string) => {
    if (value === String(current)) return;
    run('save', async () => {
      await api.updateNode(node.id, { data: { [field]: type === 'number' && value !== '' ? Number(value) : value }, note: `Updated ${field.replace(/_/g, ' ')}` });
      await refresh();
    });
  };
  if (options) {
    return (
      <select className="cell-input" style={{ width }} value={v} onChange={(e) => { setV(e.target.value); save(e.target.value); }}>
        {options.map((o) => (
          <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>
        ))}
      </select>
    );
  }
  return (
    <input
      className="cell-input"
      style={{ width }}
      type={type}
      value={v}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={(e) => save(e.target.value)}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}

export function StatTile({ label, value, sub, color }: { label: string; value: React.ReactNode; sub?: string; color: string }) {
  return (
    <div className="stat-tile" style={{ ['--c' as any]: color }}>
      <div className="st-label">{label}</div>
      <div className="st-value">{value}</div>
      {sub && <div className="st-sub">{sub}</div>}
    </div>
  );
}
