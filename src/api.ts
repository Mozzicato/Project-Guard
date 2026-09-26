import type {
  AssistantReply,
  DefenseQuestion,
  Feedback,
  HealthMetrics,
  IntegrityRun,
  Issue,
  NodeType,
  PEdge,
  PNode,
  Project,
  Provenance,
} from '../shared/model';

async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, headers: {} };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    init.body = JSON.stringify(body);
    (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
  }
  const res = await fetch(`/api${url}`, init);
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON error page */
  }
  // A lapsed session anywhere sends the app back to the sign-in screen.
  if (res.status === 401 && !url.startsWith('/auth/')) window.dispatchEvent(new Event('pc-signed-out'));
  if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
  return data as T;
}

export interface GraphData {
  nodes: PNode[];
  edges: PEdge[];
  claimStatus: Record<number, boolean>;
}

export interface Summary {
  project: Project;
  live: HealthMetrics;
  issues: Issue[];
  counts: Record<string, number>;
  suggested: number;
  feedback_open: number;
  runs: { id: number; created_at: string; score: number; include_ai: boolean }[];
  defense: Readiness;
}

export interface Readiness {
  overall: number | null;
  categories: Record<string, number>;
  answered: number;
  total: number;
}

export interface Impact {
  node: { id: number; ref: string; title: string; type: NodeType };
  direct_links: number;
  downstream_count: number;
  downstream_by_type: Record<string, { id: number; ref: string; title: string }[]>;
  orphaned: { id: number; ref: string; title: string; type: NodeType }[];
  feedback: { id: number; summary: string }[];
  defense_questions: number;
}

export interface NodeVersion {
  id: number;
  node_id: number;
  version: number;
  title: string;
  content: string;
  provenance: Provenance;
  data: Record<string, any>;
  note: string;
  created_at: string;
}

export interface ReportChapter {
  title: string;
  blocks: { kind: 'heading' | 'paragraph' | 'list' | 'missing'; text: string; refs: number[]; items?: { text: string; refs: number[] }[] }[];
}

export interface User {
  id: number;
  email: string;
  name: string;
}

export const api = {
  me: () => req<User>('GET', '/auth/me'),
  login: (email: string, password: string) => req<User>('POST', '/auth/login', { email, password }),
  signup: (email: string, name: string, password: string) => req<User>('POST', '/auth/signup', { email, name, password }),
  logout: () => req('POST', '/auth/logout'),
  health: () => req<{ ok: boolean; llm: boolean }>('GET', '/health'),
  projects: () => req<(Project & { latest: HealthMetrics | null; nodes: number })[]>('GET', '/projects'),
  createProject: (p: Partial<Project>) => req<Project>('POST', '/projects', p),
  project: (id: number) => req<Project>('GET', `/projects/${id}`),
  updateProject: (id: number, p: Partial<Project>) => req<Project>('PATCH', `/projects/${id}`, p),
  deleteProject: (id: number) => req('DELETE', `/projects/${id}`),
  summary: (id: number) => req<Summary>('GET', `/projects/${id}/summary`),

  graph: (id: number) => req<GraphData>('GET', `/projects/${id}/graph`),
  createNode: (pid: number, n: Partial<PNode> & { link_from?: number; link_to?: number; link_relation?: string }) =>
    req<PNode>('POST', `/projects/${pid}/nodes`, n),
  updateNode: (id: number, patch: Partial<PNode> & { note?: string; take_ownership?: boolean }) => req<PNode>('PATCH', `/nodes/${id}`, patch),
  deleteNode: (id: number) => req('DELETE', `/nodes/${id}`),
  impact: (id: number) => req<Impact>('GET', `/nodes/${id}/impact`),
  versions: (id: number) => req<NodeVersion[]>('GET', `/nodes/${id}/versions`),
  restore: (id: number, version: number) => req<PNode>('POST', `/nodes/${id}/restore`, { version }),
  acceptNode: (id: number) => req<PNode>('POST', `/nodes/${id}/accept`),
  createEdge: (pid: number, from_id: number, to_id: number, relation: string) => req<PEdge>('POST', `/projects/${pid}/edges`, { from_id, to_id, relation }),
  acceptEdge: (id: number) => req('POST', `/edges/${id}/accept`),
  deleteEdge: (id: number) => req('DELETE', `/edges/${id}`),
  suggestions: (pid: number, action: 'accept-all' | 'reject-all') => req('POST', `/projects/${pid}/suggestions/${action}`),

  analyzeIdea: (pid: number, body: { idea?: string; brief?: unknown }) => req<Project>('POST', `/projects/${pid}/idea/analyze`, body),
  suggestBlueprint: (pid: number) => req<{ nodes: number; edges: number }>('POST', `/projects/${pid}/blueprint/suggest`),

  addSource: (pid: number, form: FormData) => req<{ node: PNode; extraction_error: string | null }>('POST', `/projects/${pid}/sources`, form),
  extract: (nodeId: number) => req<PNode>('POST', `/nodes/${nodeId}/extract`),

  check: (pid: number, include_ai: boolean) => req<IntegrityRun>('POST', `/projects/${pid}/check`, { include_ai }),
  runs: (pid: number) => req<IntegrityRun[]>('GET', `/projects/${pid}/runs`),

  feedback: (pid: number) => req<Feedback[]>('GET', `/projects/${pid}/feedback`),
  addFeedback: (pid: number, text: string, supervisor: string) =>
    req<{ feedback: Feedback; parse_error: string | null }>('POST', `/projects/${pid}/feedback`, { text, supervisor }),
  updateFeedback: (id: number, patch: Partial<Feedback>) => req<Feedback>('PATCH', `/feedback/${id}`, patch),
  deleteFeedback: (id: number) => req('DELETE', `/feedback/${id}`),

  defense: (pid: number) => req<{ questions: DefenseQuestion[]; readiness: Readiness }>('GET', `/projects/${pid}/defense`),
  generateQuestions: (pid: number, count: number, replace: boolean) => req<{ created: number }>('POST', `/projects/${pid}/defense/generate`, { count, replace }),
  customQuestion: (pid: number, question: string, category: string) => req<DefenseQuestion>('POST', `/projects/${pid}/defense/custom`, { question, category }),
  answer: (qid: number, answer: string) => req<DefenseQuestion>('POST', `/defense/${qid}/answer`, { answer }),
  deleteQuestion: (qid: number) => req('DELETE', `/defense/${qid}`),

  assist: (pid: number, mode: string, message: string, history: { role: string; content: string }[]) =>
    req<AssistantReply>('POST', `/projects/${pid}/assist`, { mode, message, history }),
  applyEdit: (pid: number, edit: { node_id: number | null; type: NodeType; title: string; content: string }) => req<PNode>('POST', `/projects/${pid}/apply-edit`, edit),

  report: (pid: number) => req<ReportChapter[]>('GET', `/projects/${pid}/report`),
};
