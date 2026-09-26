import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { PROVENANCE_LABELS, type Provenance, type Severity } from '../shared/model';

// ---------- toasts ----------

type Toast = { id: number; text: string; err?: boolean };
const ToastCtx = createContext<(text: string, err?: boolean) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, err = false) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, err }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), err ? 7000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast${t.err ? ' err' : ''}`}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

/** Wrap an async action with busy state and error toasts. */
export function useAction() {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const run = useCallback(
    async <T,>(key: string, fn: () => Promise<T>, success?: string): Promise<T | undefined> => {
      setBusy(key);
      try {
        const r = await fn();
        if (success) toast(success);
        return r;
      } catch (e: any) {
        toast(e?.message ?? String(e), true);
        return undefined;
      } finally {
        setBusy(null);
      }
    },
    [toast],
  );
  return { busy, run };
}

// ---------- primitives ----------

export const Spinner = () => <span className="spinner" aria-label="Loading" />;

export function Modal({ title, onClose, children, footer, size }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; size?: 'lg' }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${size ? ` ${size}` : ''}`} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="btn ghost icon" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function ProvBadge({ p }: { p: Provenance }) {
  return (
    <span className={`prov ${p}`} title="Where this content came from">
      {PROVENANCE_LABELS[p]}
    </span>
  );
}

const SEV: Record<Severity, [string, string]> = {
  critical: ['crit', 'Critical'],
  warning: ['warn', 'Warning'],
  info: ['info', 'Info'],
  passed: ['ok', 'Passed'],
};
export function SevBadge({ s }: { s: Severity }) {
  return <span className={`badge ${SEV[s][0]}`}>{SEV[s][1]}</span>;
}

export function Bar({ value, color }: { value: number; color?: string }) {
  return (
    <div className="bar">
      <div style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} />
    </div>
  );
}

export function scoreColor(v: number | null | undefined) {
  if (v == null) return 'var(--ink-3)';
  return v >= 80 ? 'var(--ok)' : v >= 55 ? 'var(--warn)' : 'var(--crit)';
}

export function ScoreRing({ value, label }: { value: number | null; label: string }) {
  const r = 56;
  const c = 2 * Math.PI * r;
  const v = value ?? 0;
  return (
    <div className="score-ring">
      <svg width="132" height="132" viewBox="0 0 132 132">
        <circle cx="66" cy="66" r={r} fill="none" stroke="var(--panel-2)" strokeWidth="10" />
        <circle
          cx="66"
          cy="66"
          r={r}
          fill="none"
          stroke={scoreColor(value)}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${(v / 100) * c} ${c}`}
          transform="rotate(-90 66 66)"
        />
      </svg>
      <div className="n">
        <div>
          <b>{value ?? '—'}</b>
          <span>{label}</span>
        </div>
      </div>
    </div>
  );
}

// ---------- tiny markdown (bold, italics, code, lists, headings) ----------

function inline(text: string, key: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith('**')) parts.push(<strong key={`${key}-${i++}`}>{t.slice(2, -2)}</strong>);
    else if (t.startsWith('`')) parts.push(<code key={`${key}-${i++}`}>{t.slice(1, -1)}</code>);
    else parts.push(<em key={`${key}-${i++}`}>{t.slice(1, -1)}</em>);
    last = m.index + t.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function Md({ text, inlineOnly }: { text: string; inlineOnly?: boolean }) {
  if (inlineOnly) return <>{inline(text, 'i')}</>;
  const lines = text.split('\n');
  const out: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const items = list.items.map((it, i) => <li key={i}>{inline(it, `l${out.length}-${i}`)}</li>);
    out.push(list.ordered ? <ol key={out.length}>{items}</ol> : <ul key={out.length}>{items}</ul>);
    list = null;
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const ul = /^\s*[-*•]\s+(.*)$/.exec(line);
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (ul || ol) {
      const ordered = !!ol;
      if (!list || list.ordered !== ordered) {
        flush();
        list = { ordered, items: [] };
      }
      list.items.push((ul ?? ol)![1]);
      continue;
    }
    flush();
    if (!line.trim()) continue;
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) out.push(<h4 key={out.length}>{inline(h[2], `h${out.length}`)}</h4>);
    else out.push(<p key={out.length}>{inline(line, `p${out.length}`)}</p>);
  }
  flush();
  return <div className="md">{out}</div>;
}

export function timeAgo(iso: string) {
  const d = new Date(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`);
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return d.toLocaleDateString();
}

export const titleCase = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
