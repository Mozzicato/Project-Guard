import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import type {
  DefenseQuestion,
  Feedback,
  IntegrityRun,
  NodeStatus,
  NodeType,
  PEdge,
  PNode,
  Project,
  Provenance,
} from '../shared/model.ts';

const DB_PATH = process.env.DB_PATH ?? path.join(process.cwd(), 'data', 'projguard.db');
if (DB_PATH !== ':memory:') fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  discipline TEXT NOT NULL DEFAULT '',
  department TEXT NOT NULL DEFAULT '',
  institution TEXT NOT NULL DEFAULT '',
  project_type TEXT NOT NULL DEFAULT '',
  stage TEXT NOT NULL DEFAULT 'ideation',
  idea TEXT NOT NULL DEFAULT '',
  brief TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS nodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  provenance TEXT NOT NULL DEFAULT 'user',
  status TEXT NOT NULL DEFAULT 'active',
  data TEXT NOT NULL DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS nodes_project ON nodes(project_id);

CREATE TABLE IF NOT EXISTS edges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  from_id INTEGER NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  to_id INTEGER NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  relation TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(from_id, to_id, relation)
);
CREATE INDEX IF NOT EXISTS edges_project ON edges(project_id);

CREATE TABLE IF NOT EXISTS node_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  node_id INTEGER NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  provenance TEXT NOT NULL,
  data TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS integrity_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  include_ai INTEGER NOT NULL DEFAULT 0,
  metrics TEXT NOT NULL,
  issues TEXT NOT NULL,
  ai_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  raw_text TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  affected TEXT NOT NULL DEFAULT '[]',
  actions TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'open',
  supervisor TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS defense_questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  question TEXT NOT NULL,
  rationale TEXT NOT NULL DEFAULT '',
  risk TEXT NOT NULL DEFAULT 'medium',
  target_ids TEXT NOT NULL DEFAULT '[]',
  answer TEXT NOT NULL DEFAULT '',
  evaluation TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

const json = <T>(s: unknown, fallback: T): T => {
  if (typeof s !== 'string' || !s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
};

// ---------- row mappers ----------

const toProject = (r: any): Project => ({ ...r, brief: json(r.brief, null) });
const toNode = (r: any): PNode => ({ ...r, data: json(r.data, {}) });
const toEdge = (r: any): PEdge => ({ ...r });
const toRun = (r: any): IntegrityRun => ({
  id: r.id,
  project_id: r.project_id,
  created_at: r.created_at,
  include_ai: !!r.include_ai,
  metrics: json(r.metrics, {} as any),
  issues: json(r.issues, []),
  ai_error: r.ai_error ?? null,
});
const toFeedback = (r: any): Feedback => ({
  ...r,
  affected: json(r.affected, []),
  actions: json(r.actions, []),
});
const toQuestion = (r: any): DefenseQuestion => ({
  ...r,
  target_ids: json(r.target_ids, []),
  evaluation: json(r.evaluation, null),
});

// ---------- projects ----------

export function listProjects(): Project[] {
  return db.prepare('SELECT * FROM projects ORDER BY updated_at DESC').all().map(toProject);
}

export function getProject(id: number): Project | undefined {
  const r = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  return r ? toProject(r) : undefined;
}

export function createProject(p: Partial<Project>): Project {
  const r = db
    .prepare(
      `INSERT INTO projects (title, discipline, department, institution, project_type, stage, idea)
       VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *`,
    )
    .get(
      p.title ?? 'Untitled project',
      p.discipline ?? '',
      p.department ?? '',
      p.institution ?? '',
      p.project_type ?? '',
      p.stage ?? 'ideation',
      p.idea ?? '',
    );
  return toProject(r);
}

const PROJECT_FIELDS = ['title', 'discipline', 'department', 'institution', 'project_type', 'stage', 'idea', 'brief'] as const;

export function updateProject(id: number, patch: Partial<Project>): Project | undefined {
  const sets: string[] = [];
  const vals: any[] = [];
  for (const f of PROJECT_FIELDS) {
    if (patch[f] === undefined) continue;
    sets.push(`${f} = ?`);
    vals.push(f === 'brief' ? JSON.stringify(patch.brief) : patch[f]);
  }
  if (sets.length) {
    db.prepare(`UPDATE projects SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(...vals, id);
  }
  return getProject(id);
}

export function touchProject(id: number) {
  db.prepare(`UPDATE projects SET updated_at = datetime('now') WHERE id = ?`).run(id);
}

export function deleteProject(id: number) {
  db.prepare('DELETE FROM projects WHERE id = ?').run(id);
}

// ---------- nodes ----------

export function listNodes(projectId: number, opts: { includeSuggested?: boolean } = {}): PNode[] {
  const sql = opts.includeSuggested
    ? 'SELECT * FROM nodes WHERE project_id = ? ORDER BY id'
    : `SELECT * FROM nodes WHERE project_id = ? AND status = 'active' ORDER BY id`;
  return db.prepare(sql).all(projectId).map(toNode);
}

export function getNode(id: number): PNode | undefined {
  const r = db.prepare('SELECT * FROM nodes WHERE id = ?').get(id);
  return r ? toNode(r) : undefined;
}

export function createNode(n: {
  project_id: number;
  type: NodeType;
  title?: string;
  content?: string;
  provenance?: Provenance;
  status?: NodeStatus;
  data?: Record<string, any>;
}): PNode {
  const r = db
    .prepare(
      `INSERT INTO nodes (project_id, type, title, content, provenance, status, data)
       VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *`,
    )
    .get(
      n.project_id,
      n.type,
      n.title ?? '',
      n.content ?? '',
      n.provenance ?? 'user',
      n.status ?? 'active',
      JSON.stringify(n.data ?? {}),
    );
  const node = toNode(r);
  snapshotNode(node, 'Created');
  touchProject(n.project_id);
  return node;
}

function snapshotNode(n: PNode, note: string) {
  db.prepare(
    `INSERT INTO node_versions (node_id, version, title, content, provenance, data, note) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(n.id, n.version, n.title, n.content, n.provenance, JSON.stringify(n.data), note);
}

/**
 * NFR-03: every meaningful change bumps the version and stores a snapshot.
 * Status-only changes (accepting a suggestion) are recorded too.
 */
export function updateNode(
  id: number,
  patch: Partial<Pick<PNode, 'title' | 'content' | 'provenance' | 'status' | 'data' | 'type'>>,
  note = 'Edited',
): PNode | undefined {
  const cur = getNode(id);
  if (!cur) return undefined;
  const next = {
    title: patch.title ?? cur.title,
    content: patch.content ?? cur.content,
    provenance: patch.provenance ?? cur.provenance,
    status: patch.status ?? cur.status,
    type: patch.type ?? cur.type,
    data: patch.data ?? cur.data,
  };
  const changed =
    next.title !== cur.title ||
    next.content !== cur.content ||
    next.provenance !== cur.provenance ||
    next.status !== cur.status ||
    next.type !== cur.type ||
    JSON.stringify(next.data) !== JSON.stringify(cur.data);
  if (!changed) return cur;
  db.prepare(
    `UPDATE nodes SET title = ?, content = ?, provenance = ?, status = ?, type = ?, data = ?,
       version = version + 1, updated_at = datetime('now') WHERE id = ?`,
  ).run(next.title, next.content, next.provenance, next.status, next.type, JSON.stringify(next.data), id);
  const updated = getNode(id)!;
  snapshotNode(updated, note);
  touchProject(cur.project_id);
  return updated;
}

export function deleteNode(id: number) {
  const n = getNode(id);
  db.prepare('DELETE FROM nodes WHERE id = ?').run(id);
  if (n) touchProject(n.project_id);
}

export function nodeVersions(id: number) {
  return db
    .prepare('SELECT * FROM node_versions WHERE node_id = ? ORDER BY version DESC, id DESC')
    .all(id)
    .map((r: any) => ({ ...r, data: json(r.data, {}) }));
}

// ---------- edges ----------

export function listEdges(projectId: number, opts: { includeSuggested?: boolean } = {}): PEdge[] {
  const sql = opts.includeSuggested
    ? 'SELECT * FROM edges WHERE project_id = ? ORDER BY id'
    : `SELECT e.* FROM edges e
         JOIN nodes a ON a.id = e.from_id JOIN nodes b ON b.id = e.to_id
        WHERE e.project_id = ? AND e.status = 'active' AND a.status = 'active' AND b.status = 'active'
        ORDER BY e.id`;
  return db.prepare(sql).all(projectId).map(toEdge);
}

export function getEdge(id: number): PEdge | undefined {
  const r = db.prepare('SELECT * FROM edges WHERE id = ?').get(id);
  return r ? toEdge(r) : undefined;
}

export function createEdge(e: {
  project_id: number;
  from_id: number;
  to_id: number;
  relation: string;
  status?: NodeStatus;
}): PEdge {
  const r = db
    .prepare(
      `INSERT INTO edges (project_id, from_id, to_id, relation, status) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(from_id, to_id, relation) DO UPDATE SET status = CASE
         WHEN edges.status = 'active' THEN 'active' ELSE excluded.status END
       RETURNING *`,
    )
    .get(e.project_id, e.from_id, e.to_id, e.relation, e.status ?? 'active');
  touchProject(e.project_id);
  return toEdge(r);
}

export function setEdgeStatus(id: number, status: NodeStatus) {
  db.prepare('UPDATE edges SET status = ? WHERE id = ?').run(status, id);
}

export function deleteEdge(id: number) {
  db.prepare('DELETE FROM edges WHERE id = ?').run(id);
}

// ---------- integrity runs ----------

export function saveRun(r: Omit<IntegrityRun, 'id' | 'created_at'>): IntegrityRun {
  const row = db
    .prepare(
      `INSERT INTO integrity_runs (project_id, include_ai, metrics, issues, ai_error) VALUES (?, ?, ?, ?, ?) RETURNING *`,
    )
    .get(r.project_id, r.include_ai ? 1 : 0, JSON.stringify(r.metrics), JSON.stringify(r.issues), r.ai_error);
  return toRun(row);
}

export function listRuns(projectId: number): IntegrityRun[] {
  return db
    .prepare('SELECT * FROM integrity_runs WHERE project_id = ? ORDER BY id DESC LIMIT 50')
    .all(projectId)
    .map(toRun);
}

export function latestRun(projectId: number): IntegrityRun | undefined {
  const r = db.prepare('SELECT * FROM integrity_runs WHERE project_id = ? ORDER BY id DESC LIMIT 1').get(projectId);
  return r ? toRun(r) : undefined;
}

// ---------- feedback ----------

export function listFeedback(projectId: number): Feedback[] {
  return db.prepare('SELECT * FROM feedback WHERE project_id = ? ORDER BY id DESC').all(projectId).map(toFeedback);
}

export function getFeedback(id: number): Feedback | undefined {
  const r = db.prepare('SELECT * FROM feedback WHERE id = ?').get(id);
  return r ? toFeedback(r) : undefined;
}

export function createFeedback(f: Omit<Feedback, 'id' | 'created_at' | 'updated_at'>): Feedback {
  const r = db
    .prepare(
      `INSERT INTO feedback (project_id, raw_text, summary, location, affected, actions, status, supervisor)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
    )
    .get(
      f.project_id,
      f.raw_text,
      f.summary,
      f.location,
      JSON.stringify(f.affected),
      JSON.stringify(f.actions),
      f.status,
      f.supervisor,
    );
  touchProject(f.project_id);
  return toFeedback(r);
}

export function updateFeedback(id: number, patch: Partial<Feedback>): Feedback | undefined {
  const cur = getFeedback(id);
  if (!cur) return undefined;
  const n = { ...cur, ...patch };
  db.prepare(
    `UPDATE feedback SET summary = ?, location = ?, affected = ?, actions = ?, status = ?, supervisor = ?,
       updated_at = datetime('now') WHERE id = ?`,
  ).run(n.summary, n.location, JSON.stringify(n.affected), JSON.stringify(n.actions), n.status, n.supervisor, id);
  touchProject(cur.project_id);
  return getFeedback(id);
}

export function deleteFeedback(id: number) {
  db.prepare('DELETE FROM feedback WHERE id = ?').run(id);
}

// ---------- defense ----------

export function listQuestions(projectId: number): DefenseQuestion[] {
  return db
    .prepare('SELECT * FROM defense_questions WHERE project_id = ? ORDER BY id')
    .all(projectId)
    .map(toQuestion);
}

export function getQuestion(id: number): DefenseQuestion | undefined {
  const r = db.prepare('SELECT * FROM defense_questions WHERE id = ?').get(id);
  return r ? toQuestion(r) : undefined;
}

export function createQuestion(q: Omit<DefenseQuestion, 'id' | 'created_at' | 'answer' | 'evaluation'>): DefenseQuestion {
  const r = db
    .prepare(
      `INSERT INTO defense_questions (project_id, category, question, rationale, risk, target_ids)
       VALUES (?, ?, ?, ?, ?, ?) RETURNING *`,
    )
    .get(q.project_id, q.category, q.question, q.rationale, q.risk, JSON.stringify(q.target_ids));
  return toQuestion(r);
}

export function saveAnswer(id: number, answer: string, evaluation: unknown) {
  db.prepare('UPDATE defense_questions SET answer = ?, evaluation = ? WHERE id = ?').run(
    answer,
    evaluation ? JSON.stringify(evaluation) : null,
    id,
  );
  return getQuestion(id);
}

export function clearQuestions(projectId: number) {
  db.prepare('DELETE FROM defense_questions WHERE project_id = ?').run(projectId);
}

export function deleteQuestion(id: number) {
  db.prepare('DELETE FROM defense_questions WHERE id = ?').run(id);
}
