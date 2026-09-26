// Shared domain model for Project Compiler.
// The project is a graph of typed nodes joined by typed relationships;
// documents (the report) are rendered from this graph, never the other way round.

export const NODE_TYPES = [
  'problem',
  'aim',
  'research_gap',
  'objective',
  'research_question',
  'scope',
  'limitation',
  'method',
  'evaluation',
  'contribution',
  'source',
  'claim',
  'evidence',
  'experiment',
  'result',
  'conclusion',
] as const;
export type NodeType = (typeof NODE_TYPES)[number];

export const NODE_LABELS: Record<NodeType, string> = {
  problem: 'Problem Statement',
  aim: 'Aim',
  research_gap: 'Research Gap',
  objective: 'Objective',
  research_question: 'Research Question',
  scope: 'Scope',
  limitation: 'Limitation',
  method: 'Method',
  evaluation: 'Evaluation Strategy',
  contribution: 'Expected Contribution',
  source: 'Source',
  claim: 'Claim',
  evidence: 'Evidence',
  experiment: 'Experiment',
  result: 'Result',
  conclusion: 'Conclusion',
};

/** Short prefix used when showing / referencing nodes, e.g. OBJ-3. */
export const NODE_PREFIX: Record<NodeType, string> = {
  problem: 'PRB',
  aim: 'AIM',
  research_gap: 'GAP',
  objective: 'OBJ',
  research_question: 'RQ',
  scope: 'SCP',
  limitation: 'LIM',
  method: 'MTH',
  evaluation: 'EVL',
  contribution: 'CON',
  source: 'SRC',
  claim: 'CLM',
  evidence: 'EVD',
  experiment: 'EXP',
  result: 'RES',
  conclusion: 'CNC',
};

/** NFR-05: every piece of content is labelled with where it came from. */
export const PROVENANCES = ['verified', 'user', 'ai_inference', 'ai_suggestion', 'unknown'] as const;
export type Provenance = (typeof PROVENANCES)[number];

export const PROVENANCE_LABELS: Record<Provenance, string> = {
  verified: 'Verified evidence',
  user: 'User-provided',
  ai_inference: 'AI inference',
  ai_suggestion: 'AI suggestion',
  unknown: 'Unknown',
};

/** NFR-02: AI-created nodes start as `suggested` and only count once the student accepts them. */
export type NodeStatus = 'active' | 'suggested';

export interface PNode {
  id: number;
  project_id: number;
  type: NodeType;
  title: string;
  content: string;
  provenance: Provenance;
  status: NodeStatus;
  data: Record<string, any>;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface PEdge {
  id: number;
  project_id: number;
  from_id: number;
  to_id: number;
  relation: Relation;
  status: NodeStatus;
  created_at: string;
}

export type Relation =
  | 'motivates'
  | 'framed_as'
  | 'decomposes_into'
  | 'addressed_by'
  | 'enables'
  | 'refined_into'
  | 'investigated_by'
  | 'operationalized_as'
  | 'produces'
  | 'supports'
  | 'measured_by'
  | 'cites'
  | 'backed_by'
  | 'derived_from'
  | 'supports_gap'
  | 'challenges_gap'
  | 'bounds'
  | 'constrains'
  | 'demonstrates';

/** The relationships the system understands. Direction always follows the research chain. */
export const ALLOWED_RELATIONS: { from: NodeType; to: NodeType; relation: Relation; label: string }[] = [
  { from: 'problem', to: 'research_gap', relation: 'motivates', label: 'motivates' },
  { from: 'problem', to: 'aim', relation: 'framed_as', label: 'is framed as' },
  { from: 'aim', to: 'objective', relation: 'decomposes_into', label: 'decomposes into' },
  { from: 'research_gap', to: 'objective', relation: 'addressed_by', label: 'is addressed by' },
  { from: 'research_gap', to: 'contribution', relation: 'enables', label: 'enables' },
  { from: 'objective', to: 'research_question', relation: 'refined_into', label: 'is refined into' },
  { from: 'objective', to: 'method', relation: 'investigated_by', label: 'is investigated by' },
  { from: 'research_question', to: 'method', relation: 'investigated_by', label: 'is investigated by' },
  { from: 'method', to: 'experiment', relation: 'operationalized_as', label: 'is operationalised as' },
  { from: 'method', to: 'evidence', relation: 'produces', label: 'produces' },
  { from: 'method', to: 'evaluation', relation: 'measured_by', label: 'is measured by' },
  { from: 'experiment', to: 'result', relation: 'produces', label: 'produces' },
  { from: 'experiment', to: 'evidence', relation: 'produces', label: 'produces' },
  { from: 'evidence', to: 'result', relation: 'supports', label: 'supports' },
  { from: 'result', to: 'conclusion', relation: 'supports', label: 'supports' },
  { from: 'conclusion', to: 'contribution', relation: 'demonstrates', label: 'demonstrates' },
  { from: 'claim', to: 'source', relation: 'cites', label: 'cites' },
  { from: 'claim', to: 'evidence', relation: 'backed_by', label: 'is backed by' },
  { from: 'evidence', to: 'source', relation: 'derived_from', label: 'is derived from' },
  { from: 'source', to: 'research_gap', relation: 'supports_gap', label: 'supports gap' },
  { from: 'source', to: 'research_gap', relation: 'challenges_gap', label: 'challenges gap' },
  { from: 'scope', to: 'objective', relation: 'bounds', label: 'bounds' },
  { from: 'limitation', to: 'method', relation: 'constrains', label: 'constrains' },
];

export function isAllowedRelation(from: NodeType, to: NodeType, relation: string): boolean {
  return ALLOWED_RELATIONS.some((r) => r.from === from && r.to === to && r.relation === relation);
}

export function relationLabel(relation: string): string {
  return ALLOWED_RELATIONS.find((r) => r.relation === relation)?.label ?? relation.replace(/_/g, ' ');
}

export function nodeRef(n: Pick<PNode, 'type' | 'id'>): string {
  return `${NODE_PREFIX[n.type]}-${n.id}`;
}

export const PROJECT_STAGES = [
  'ideation',
  'proposal',
  'literature_review',
  'methodology',
  'implementation',
  'analysis',
  'writing',
  'defense_prep',
] as const;
export type ProjectStage = (typeof PROJECT_STAGES)[number];

export const PROJECT_TYPES = [
  'software_system',
  'experimental',
  'survey_research',
  'case_study',
  'design_and_build',
  'theoretical',
  'data_analysis',
  'mixed_methods',
] as const;

export interface Project {
  id: number;
  user_id: number | null;
  title: string;
  discipline: string;
  department: string;
  institution: string;
  project_type: string;
  stage: ProjectStage;
  idea: string;
  brief: OpportunityBrief | null;
  created_at: string;
  updated_at: string;
}

export interface BriefField {
  value: string;
  basis: Provenance;
}

export const BRIEF_FIELDS = [
  ['problem', 'Problem'],
  ['target', 'Target population'],
  ['context', 'Context'],
  ['existing_approaches', 'Existing approaches'],
  ['potential_gap', 'Potential gap'],
  ['proposed_contribution', 'Proposed contribution'],
  ['required_resources', 'Required resources'],
  ['data_availability', 'Data availability'],
  ['feasibility', 'Feasibility'],
  ['major_risks', 'Major risks'],
  ['suggested_scope', 'Suggested scope'],
  ['possible_evaluation', 'Possible evaluation'],
] as const;
export type BriefKey = (typeof BRIEF_FIELDS)[number][0];

export interface OpportunityBrief {
  fields: Record<BriefKey, BriefField>;
  problem_clarity: { score: number; comment: string };
  questions: { id: string; question: string; why: string; answer: string }[];
  analyzed_at: string;
}

export type Severity = 'critical' | 'warning' | 'info' | 'passed';

export interface Issue {
  id: string;
  check: CheckId;
  severity: Severity;
  title: string;
  why: string;
  affected: number[];
  evidence: string;
  action: string;
  origin: 'rule' | 'ai';
}

export type CheckId = 'S' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'FB';

export const CHECK_NAMES: Record<CheckId, string> = {
  S: 'Structural completeness',
  A: 'Objective coverage',
  B: 'Methodology consistency',
  C: 'Claim–evidence coverage',
  D: 'Research gap integrity',
  E: 'Result–objective alignment',
  F: 'Conclusion coverage',
  G: 'Scope drift',
  H: 'Internal contradiction',
  FB: 'Supervisor feedback',
};

export interface HealthMetrics {
  score: number;
  critical: number;
  warnings: number;
  info: number;
  missing_evidence: number;
  objectives_covered: number;
  objectives_total: number;
  defensibility_rate: number;
  defense_readiness: number | null;
  evidence_backed_claims: number;
  claims_total: number;
}

export interface IntegrityRun {
  id: number;
  project_id: number;
  created_at: string;
  include_ai: boolean;
  metrics: HealthMetrics;
  issues: Issue[];
  ai_error: string | null;
}

export type FeedbackStatus = 'open' | 'in_progress' | 'resolved' | 'rejected';

export interface Feedback {
  id: number;
  project_id: number;
  raw_text: string;
  summary: string;
  location: string;
  affected: number[];
  actions: { text: string; done: boolean }[];
  status: FeedbackStatus;
  supervisor: string;
  created_at: string;
  updated_at: string;
}

export const DEFENSE_CATEGORIES = [
  'fundamentals',
  'methodology',
  'technical',
  'evidence',
  'limitations',
  'challenge',
] as const;
export type DefenseCategory = (typeof DEFENSE_CATEGORIES)[number];

export interface AnswerEvaluation {
  score: number;
  relevance: number;
  consistency: number;
  summary: string;
  strengths: string[];
  missing_evidence: string[];
  unsupported_claims: string[];
  contradictions: { statement: string; conflicts_with: number[] }[];
  follow_ups: string[];
}

export interface DefenseQuestion {
  id: number;
  project_id: number;
  category: DefenseCategory;
  question: string;
  rationale: string;
  risk: 'high' | 'medium' | 'low';
  target_ids: number[];
  answer: string;
  evaluation: AnswerEvaluation | null;
  created_at: string;
}

export interface Segment {
  text: string;
  basis: 'project' | 'source' | 'user' | 'ai_inference' | 'ai_suggestion';
  refs: number[];
}

export interface SuggestedEdit {
  node_id: number | null;
  type: NodeType;
  title: string;
  content: string;
  reason: string;
}

export interface AssistantReply {
  segments: Segment[];
  suggested_edits: SuggestedEdit[];
}
