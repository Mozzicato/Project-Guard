// Data access over libSQL: Turso in production (TURSO_DATABASE_URL), a local SQLite file otherwise.
import { createClient, type InArgs, type InStatement, type ResultSet } from '@libsql/client';
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
} from '../shared/model.js';

function databaseUrl(): string {
  if (process.env.TURSO_DATABASE_URL) return process.env.TURSO_DATABASE_URL;
  const file = process.env.DB_PATH ?? path.join('data', 'projguard.db');
  if (file === ':memory:') return ':memory:';
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  return `file:${file.replace(/\\/g, '/')}`;
}

export const client = createClient({ url: databaseUrl(), authToken: process.env.TURSO_AUTH_TOKEN });

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
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
CREATE INDEX IF NOT EXISTS node_versions_node ON node_versions(node_id);
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
`;

async function migrate() {
  await client.executeMultiple(SCHEMA);
  // Projects created before accounts existed have no owner.
  const cols = await client.execute('PRAGMA table_info(projects)');
  if (!cols.rows.some((c: any) => c.name === 'user_id')) {
    await client.execute('ALTER TABLE projects ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE');
  }
  await client.execute('CREATE INDEX IF NOT EXISTS projects_user ON projects(user_id)');
}

// Schema setup runs once per process (per cold start on serverless) before the first query.
let ready: Promise<void> | null = null;
export const init = () => (ready ??= migrate().catch((e) => { ready = null; throw e; }));

const plain = (rs: ResultSet): any[] => rs.rows.map((r) => Object.fromEntries(rs.columns.map((c, i) => [c, r[i]])));

async function all(sql: string, args: InArgs = []): Promise<any[]> {
  await init();
  return plain(await client.execute({ sql, args }));
}
async function get(sql: string, args: InArgs = []): Promise<any | undefined> {
  return (await all(sql, args))[0];
}
async function run(sql: string, args: InArgs = []): Promise<void> {
  await init();
  await client.execute({ sql, args });
}
/** Several statements atomically (one transaction). */
async function tx(stmts: InStatement[]): Promise<void> {
  await init();
  await client.batch(stmts, 'write');
}

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
const toFeedback = (r: any): Feedback => ({ ...r, affected: json(r.affected, []), actions: json(r.actions, []) });
const toQuestion = (r: any): DefenseQuestion => ({ ...r, target_ids: json(r.target_ids, []), evaluation: json(r.evaluation, null) });

// ---------- users & settings ----------

export interface User {
  id: number;
  email: string;
  name: string;
  password_hash: string;
  created_at: string;
}

export const getUser = (id: number): Promise<User | undefined> => get('SELECT * FROM users WHERE id = ?', [id]);
export const getUserByEmail = (email: string): Promise<User | undefined> => get('SELECT * FROM users WHERE email = ?', [email]);

export async function createUser(email: string, name: string, passwordHash: string): Promise<User> {
  return get('INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?) RETURNING *', [email, name, passwordHash]);
}

export async function countUsers(): Promise<number> {
  return Number((await get('SELECT COUNT(*) AS n FROM users')).n);
}

/** Hand projects created before accounts existed to the first account. */
export const claimOrphanProjects = (userId: number) => run('UPDATE projects SET user_id = ? WHERE user_id IS NULL', [userId]);

export async function getSetting(key: string): Promise<string | undefined> {
  return (await get('SELECT value FROM settings WHERE key = ?', [key]))?.value;
}

export const setSetting = (key: string, value: string) =>
  run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, value]);

// ---------- projects ----------

export async function listProjects(userId: number): Promise<Project[]> {
  return (await all('SELECT * FROM projects WHERE user_id = ? ORDER BY updated_at DESC', [userId])).map(toProject);
}

export async function getProject(id: number): Promise<Project | undefined> {
  const r = await get('SELECT * FROM projects WHERE id = ?', [id]);
  return r ? toProject(r) : undefined;
}

export async function createProject(userId: number, p: Partial<Project>): Promise<Project> {
  return toProject(
    await get(
      `INSERT INTO projects (user_id, title, discipline, department, institution, project_type, stage, idea)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
      [userId, p.title ?? 'Untitled project', p.discipline ?? '', p.department ?? '', p.institution ?? '', p.project_type ?? '', p.stage ?? 'ideation', p.idea ?? ''],
    ),
  );
}

const PROJECT_FIELDS = ['title', 'discipline', 'department', 'institution', 'project_type', 'stage', 'idea', 'brief'] as const;

export async function updateProject(id: number, patch: Partial<Project>): Promise<Project | undefined> {
  const sets: string[] = [];
  const vals: any[] = [];
  for (const f of PROJECT_FIELDS) {
    if (patch[f] === undefined) continue;
    sets.push(`${f} = ?`);
    vals.push(f === 'brief' ? JSON.stringify(patch.brief) : patch[f]);
  }
  if (sets.length) await run(`UPDATE projects SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`, [...vals, id]);
  return getProject(id);
}

export const touchProject = (id: number) => run(`UPDATE projects SET updated_at = datetime('now') WHERE id = ?`, [id]);

export async function deleteProject(id: number) {
  await tx([
    { sql: 'DELETE FROM node_versions WHERE node_id IN (SELECT id FROM nodes WHERE project_id = ?)', args: [id] },
    ...['edges', 'nodes', 'integrity_runs', 'feedback', 'defense_questions'].map((t) => ({ sql: `DELETE FROM ${t} WHERE project_id = ?`, args: [id] })),
    { sql: 'DELETE FROM projects WHERE id = ?', args: [id] },
  ]);
}

// ---------- nodes ----------

export async function listNodes(projectId: number, opts: { includeSuggested?: boolean } = {}): Promise<PNode[]> {
  const sql = opts.includeSuggested
    ? 'SELECT * FROM nodes WHERE project_id = ? ORDER BY id'
    : `SELECT * FROM nodes WHERE project_id = ? AND status = 'active' ORDER BY id`;
  return (await all(sql, [projectId])).map(toNode);
}

export async function getNode(id: number): Promise<PNode | undefined> {
  const r = await get('SELECT * FROM nodes WHERE id = ?', [id]);
  return r ? toNode(r) : undefined;
}

const snapshot = (n: PNode, note: string): InStatement => ({
  sql: 'INSERT INTO node_versions (node_id, version, title, content, provenance, data, note) VALUES (?, ?, ?, ?, ?, ?, ?)',
  args: [n.id, n.version, n.title, n.content, n.provenance, JSON.stringify(n.data), note],
});

export async function createNode(n: {
  project_id: number;
  type: NodeType;
  title?: string;
  content?: string;
  provenance?: Provenance;
  status?: NodeStatus;
  data?: Record<string, any>;
}): Promise<PNode> {
  const node = toNode(
    await get(
      `INSERT INTO nodes (project_id, type, title, content, provenance, status, data) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *`,
      [n.project_id, n.type, n.title ?? '', n.content ?? '', n.provenance ?? 'user', n.status ?? 'active', JSON.stringify(n.data ?? {})],
    ),
  );
  await tx([snapshot(node, 'Created'), { sql: `UPDATE projects SET updated_at = datetime('now') WHERE id = ?`, args: [n.project_id] }]);
  return node;
}

/**
 * NFR-03: every meaningful change bumps the version and stores a snapshot.
 * Status-only changes (accepting a suggestion) are recorded too.
 */
export async function updateNode(
  id: number,
  patch: Partial<Pick<PNode, 'title' | 'content' | 'provenance' | 'status' | 'data' | 'type'>>,
  note = 'Edited',
): Promise<PNode | undefined> {
  const cur = await getNode(id);
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
  const updated: PNode = { ...cur, ...next, version: cur.version + 1 };
  await tx([
    {
      sql: `UPDATE nodes SET title = ?, content = ?, provenance = ?, status = ?, type = ?, data = ?,
              version = version + 1, updated_at = datetime('now') WHERE id = ?`,
      args: [next.title, next.content, next.provenance, next.status, next.type, JSON.stringify(next.data), id],
    },
    snapshot(updated, note),
    { sql: `UPDATE projects SET updated_at = datetime('now') WHERE id = ?`, args: [cur.project_id] },
  ]);
  return getNode(id);
}

export async function deleteNode(id: number) {
  const n = await getNode(id);
  if (!n) return;
  await tx([
    { sql: 'DELETE FROM edges WHERE from_id = ? OR to_id = ?', args: [id, id] },
    { sql: 'DELETE FROM node_versions WHERE node_id = ?', args: [id] },
    { sql: 'DELETE FROM nodes WHERE id = ?', args: [id] },
    { sql: `UPDATE projects SET updated_at = datetime('now') WHERE id = ?`, args: [n.project_id] },
  ]);
}

export async function nodeVersions(id: number) {
  return (await all('SELECT * FROM node_versions WHERE node_id = ? ORDER BY version DESC, id DESC', [id])).map((r) => ({ ...r, data: json(r.data, {}) }));
}

// ---------- edges ----------

export async function listEdges(projectId: number, opts: { includeSuggested?: boolean } = {}): Promise<PEdge[]> {
  const sql = opts.includeSuggested
    ? 'SELECT * FROM edges WHERE project_id = ? ORDER BY id'
    : `SELECT e.* FROM edges e
         JOIN nodes a ON a.id = e.from_id JOIN nodes b ON b.id = e.to_id
        WHERE e.project_id = ? AND e.status = 'active' AND a.status = 'active' AND b.status = 'active'
        ORDER BY e.id`;
  return (await all(sql, [projectId])).map(toEdge);
}

export async function getEdge(id: number): Promise<PEdge | undefined> {
  const r = await get('SELECT * FROM edges WHERE id = ?', [id]);
  return r ? toEdge(r) : undefined;
}

export async function createEdge(e: { project_id: number; from_id: number; to_id: number; relation: string; status?: NodeStatus }): Promise<PEdge> {
  const r = await get(
    `INSERT INTO edges (project_id, from_id, to_id, relation, status) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(from_id, to_id, relation) DO UPDATE SET status = CASE
       WHEN edges.status = 'active' THEN 'active' ELSE excluded.status END
     RETURNING *`,
    [e.project_id, e.from_id, e.to_id, e.relation, e.status ?? 'active'],
  );
  await touchProject(e.project_id);
  return toEdge(r);
}

export const setEdgeStatus = (id: number, status: NodeStatus) => run('UPDATE edges SET status = ? WHERE id = ?', [status, id]);
export const deleteEdge = (id: number) => run('DELETE FROM edges WHERE id = ?', [id]);

// ---------- integrity runs ----------

export async function saveRun(r: Omit<IntegrityRun, 'id' | 'created_at'>): Promise<IntegrityRun> {
  return toRun(
    await get(`INSERT INTO integrity_runs (project_id, include_ai, metrics, issues, ai_error) VALUES (?, ?, ?, ?, ?) RETURNING *`, [
      r.project_id,
      r.include_ai ? 1 : 0,
      JSON.stringify(r.metrics),
      JSON.stringify(r.issues),
      r.ai_error,
    ]),
  );
}

export async function listRuns(projectId: number): Promise<IntegrityRun[]> {
  return (await all('SELECT * FROM integrity_runs WHERE project_id = ? ORDER BY id DESC LIMIT 50', [projectId])).map(toRun);
}

export async function latestRun(projectId: number): Promise<IntegrityRun | undefined> {
  const r = await get('SELECT * FROM integrity_runs WHERE project_id = ? ORDER BY id DESC LIMIT 1', [projectId]);
  return r ? toRun(r) : undefined;
}

// ---------- feedback ----------

export async function listFeedback(projectId: number): Promise<Feedback[]> {
  return (await all('SELECT * FROM feedback WHERE project_id = ? ORDER BY id DESC', [projectId])).map(toFeedback);
}

export async function getFeedback(id: number): Promise<Feedback | undefined> {
  const r = await get('SELECT * FROM feedback WHERE id = ?', [id]);
  return r ? toFeedback(r) : undefined;
}

export async function createFeedback(f: Omit<Feedback, 'id' | 'created_at' | 'updated_at'>): Promise<Feedback> {
  const r = await get(
    `INSERT INTO feedback (project_id, raw_text, summary, location, affected, actions, status, supervisor)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
    [f.project_id, f.raw_text, f.summary, f.location, JSON.stringify(f.affected), JSON.stringify(f.actions), f.status, f.supervisor],
  );
  await touchProject(f.project_id);
  return toFeedback(r);
}

export async function updateFeedback(id: number, patch: Partial<Feedback>): Promise<Feedback | undefined> {
  const cur = await getFeedback(id);
  if (!cur) return undefined;
  const n = { ...cur, ...patch };
  await run(
    `UPDATE feedback SET summary = ?, location = ?, affected = ?, actions = ?, status = ?, supervisor = ?,
       updated_at = datetime('now') WHERE id = ?`,
    [n.summary, n.location, JSON.stringify(n.affected), JSON.stringify(n.actions), n.status, n.supervisor, id],
  );
  await touchProject(cur.project_id);
  return getFeedback(id);
}

export const deleteFeedback = (id: number) => run('DELETE FROM feedback WHERE id = ?', [id]);

// ---------- defense ----------

export async function listQuestions(projectId: number): Promise<DefenseQuestion[]> {
  return (await all('SELECT * FROM defense_questions WHERE project_id = ? ORDER BY id', [projectId])).map(toQuestion);
}

export async function getQuestion(id: number): Promise<DefenseQuestion | undefined> {
  const r = await get('SELECT * FROM defense_questions WHERE id = ?', [id]);
  return r ? toQuestion(r) : undefined;
}

export async function createQuestion(q: Omit<DefenseQuestion, 'id' | 'created_at' | 'answer' | 'evaluation'>): Promise<DefenseQuestion> {
  return toQuestion(
    await get(
      `INSERT INTO defense_questions (project_id, category, question, rationale, risk, target_ids) VALUES (?, ?, ?, ?, ?, ?) RETURNING *`,
      [q.project_id, q.category, q.question, q.rationale, q.risk, JSON.stringify(q.target_ids)],
    ),
  );
}

export async function saveAnswer(id: number, answer: string, evaluation: unknown) {
  await run('UPDATE defense_questions SET answer = ?, evaluation = ? WHERE id = ?', [answer, evaluation ? JSON.stringify(evaluation) : null, id]);
  return getQuestion(id);
}

export const clearQuestions = (projectId: number) => run('DELETE FROM defense_questions WHERE project_id = ?', [projectId]);
export const deleteQuestion = (id: number) => run('DELETE FROM defense_questions WHERE id = ?', [id]);
