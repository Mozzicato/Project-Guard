// Visual identity for each workspace section and component type: one color + one icon each,
// used by the sidebar, page headers and cards so students learn where they are at a glance.
import type { NodeType } from '../shared/model';

export type SectionId =
  | 'projects'
  | 'overview'
  | 'idea'
  | 'blueprint'
  | 'research'
  | 'evidence'
  | 'graph'
  | 'check'
  | 'feedback'
  | 'defense'
  | 'writing'
  | 'report'
  | 'requirements'
  | 'design'
  | 'testing';

export const SECTIONS: Record<SectionId, { label: string; path: string; color: string; icon: IconName }> = {
  projects: { label: 'Projects', path: '', color: '#2f5bea', icon: 'folder' },
  overview: { label: 'Overview', path: '', color: '#0284c7', icon: 'dashboard' },
  idea: { label: 'Idea Lab', path: '/idea', color: '#7c3aed', icon: 'bulb' },
  blueprint: { label: 'Blueprint', path: '/blueprint', color: '#2563eb', icon: 'layers' },
  research: { label: 'Research', path: '/research', color: '#059669', icon: 'book' },
  evidence: { label: 'Evidence Ledger', path: '/evidence', color: '#0d9488', icon: 'scale' },
  graph: { label: 'Knowledge Graph', path: '/graph', color: '#4f46e5', icon: 'graph' },
  check: { label: 'Project Check', path: '/check', color: '#dc2626', icon: 'shield' },
  feedback: { label: 'Supervisor Feedback', path: '/feedback', color: '#c2410c', icon: 'chat' },
  defense: { label: 'Defense Simulator', path: '/defense', color: '#db2777', icon: 'mic' },
  writing: { label: 'Writing Assistant', path: '/writing', color: '#9333ea', icon: 'pen' },
  report: { label: 'Report', path: '/report', color: '#475569', icon: 'doc' },
  requirements: { label: 'Requirements', path: '/requirements', color: '#0891b2', icon: 'target' },
  design: { label: 'System Design', path: '/design', color: '#ea580c', icon: 'cpu' },
  testing: { label: 'Build & Test', path: '/testing', color: '#16a34a', icon: 'gauge' },
};

export function sectionFromPath(pathname: string): SectionId {
  const seg = pathname.split('/')[3] ?? '';
  const hit = (Object.keys(SECTIONS) as SectionId[]).find((k) => k !== 'projects' && k !== 'overview' && SECTIONS[k].path === `/${seg}`);
  return hit ?? (pathname.startsWith('/p/') ? 'overview' : 'projects');
}

export const TYPE_COLOR: Record<NodeType, string> = {
  problem: '#d23c3c',
  aim: '#e0663a',
  research_gap: '#c97a09',
  objective: '#2f5bea',
  research_question: '#4f7cff',
  scope: '#7d8797',
  limitation: '#7d8797',
  method: '#8b5cf6',
  evaluation: '#a67ff7',
  contribution: '#0e9f8e',
  source: '#1f8a5b',
  claim: '#b8458f',
  evidence: '#2a9d6a',
  experiment: '#6b5bd6',
  result: '#0a7ea4',
  conclusion: '#14532d',
  requirement: '#0891b2',
  design: '#ea580c',
  component: '#b45309',
  test: '#16a34a',
};

// Minimal stroke icons (24×24, lucide-style geometry).
const PATHS = {
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  dashboard: 'M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z',
  bulb: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V17h5v-1.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z',
  layers: 'M12 3 3 8l9 5 9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5',
  book: 'M3 5a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v16a2 2 0 0 0-2-2H3zM21 5a2 2 0 0 0-2-2h-5a2 2 0 0 0-2 2v16a2 2 0 0 1 2-2h7z',
  scale: 'M12 3v18M7 21h10M5 7h14M5 7l-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0z',
  graph: 'M6 6m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0M18 6m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0M12 18m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0M8.5 6h7M7.2 8.2l3.6 7.6M16.8 8.2l-3.6 7.6',
  shield: 'M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6zM8.5 12l2.5 2.5 4.5-5',
  chat: 'M4 5h16v11H9l-5 4zM8 9h8M8 12h5',
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3',
  pen: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4M14 20h6',
  doc: 'M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0',
  eyeOff: 'M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3 3.8M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7c1.7 0 3.2-.5 4.5-1.2M9.9 9.9a3 3 0 0 0 4.2 4.2',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11',
  target: 'M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0M12 12m-5 0a5 5 0 1 0 10 0a5 5 0 1 0-10 0M12 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0-2 0',
  cpu: 'M7 7h10v10H7zM10 10h4v4h-4zM9 3v4M15 3v4M9 17v4M15 17v4M3 9h4M3 15h4M17 9h4M17 15h4',
  gauge: 'M12 14l4-4M4.9 19a9 9 0 1 1 14.2 0M12 14m-1.5 0a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  circle: 'M12 12m-8 0a8 8 0 1 0 16 0a8 8 0 1 0-16 0',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  trophy: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3',
  wrench: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z',
} as const;
export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18, className, style }: { name: IconName; size?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

/** Colored icon tile shown beside a page title. */
export function SectionBadge({ id, size = 40 }: { id: SectionId; size?: number }) {
  const s = SECTIONS[id];
  return (
    <span className="sec-badge" style={{ width: size, height: size, ['--sec' as any]: s.color }}>
      <Icon name={s.icon} size={Math.round(size * 0.5)} />
    </span>
  );
}
