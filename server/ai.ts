// AI reasoning layer. Every function returns structured data; nothing here writes to the
// project directly — callers store AI output as suggestions the student must accept (NFR-02).
import {
  ALLOWED_RELATIONS,
  BRIEF_FIELDS,
  DEFENSE_CATEGORIES,
  NODE_TYPES,
  PROVENANCES,
  type AnswerEvaluation,
  type AssistantReply,
  type BriefKey,
  type DefenseQuestion,
  type NodeType,
  type OpportunityBrief,
  type Project,
  type Provenance,
  type Segment,
} from '../shared/model.ts';
import { Graph, graphContext, humanizeRefs, validIds } from './graph.ts';
import { chatJson } from './llm.ts';

const PERSONA = `You are Project Compiler, a rigorous research mentor for final-year undergraduate students.
Core promise: "We don't write your project. We make sure you can defend it."
You help the student think and research; you do not ghost-write the project. You are discipline-aware and never assume every project is a software project.
You strictly separate what the student said (user), what is established by evidence (verified), what you infer (ai_inference), what you are proposing (ai_suggestion), and what nobody knows yet (unknown). Never present an inference as a fact.`;

const clampText = (s: unknown, n = 4000) => String(s ?? '').slice(0, n);

// ---------------- Idea Lab (FR-02) ----------------

export async function analyzeIdea(project: Project, previous: OpportunityBrief | null): Promise<OpportunityBrief> {
  const keys = BRIEF_FIELDS.map(([k, label]) => `"${k}": {"value": "...", "basis": "user|ai_inference|ai_suggestion|unknown"}  // ${label}`).join(',\n    ');
  const prior = previous
    ? `\n\nPREVIOUS BRIEF (the student may have edited fields — fields with basis "user" are the student's own words and must be kept unless contradicted by their answers):\n${JSON.stringify(previous.fields, null, 1)}\n\nSTUDENT ANSWERS TO YOUR QUESTIONS:\n${previous.questions
        .filter((q) => q.answer.trim())
        .map((q) => `Q: ${q.question}\nA: ${q.answer}`)
        .join('\n\n') || '(none yet)'}`
    : '';
  const user = `Interrogate this project idea. Do NOT write a project report. Investigate problem clarity, target population, context, existing alternatives, research gap, feasibility, required resources, data availability, scope, evaluation strategy and potential contribution.

Project title: ${project.title}
Discipline: ${project.discipline || 'unspecified'} | Department: ${project.department || 'unspecified'} | Institution: ${project.institution || 'unspecified'}
Project type: ${project.project_type || 'unspecified'} | Stage: ${project.stage}
Idea (student's words): """${clampText(project.idea, 3000)}"""${prior}

Return JSON:
{
  "fields": {
    ${keys}
  },
  "problem_clarity": {"score": 0-100, "comment": "how well-defined the problem is and what is vague"},
  "questions": [{"question": "a pointed question the student must answer to sharpen the project", "why": "what it unblocks"}]
}
Rules: keep each field value concise (1-4 sentences, concrete, specific to this idea and context). When you mention existing approaches, name real, well-known ones only if you are confident; otherwise say what kind of approaches the student should search for and mark basis "ai_suggestion". Mark "unknown" where the student must find out. Ask 4-7 questions, prioritising the weakest parts of the idea; do not re-ask what the student already answered.`;
  const res = await chatJson<any>(PERSONA, user);
  const fields = {} as OpportunityBrief['fields'];
  for (const [k] of BRIEF_FIELDS) {
    const f = res?.fields?.[k];
    const basis: Provenance = PROVENANCES.includes(f?.basis) ? f.basis : 'ai_inference';
    const prevField = previous?.fields?.[k as BriefKey];
    // A field the student edited stays theirs unless the model returns an updated value with user basis.
    if (prevField?.basis === 'user' && basis !== 'user') fields[k as BriefKey] = prevField;
    else fields[k as BriefKey] = { value: clampText(f?.value ?? '', 1500), basis };
  }
  const answered = (previous?.questions ?? []).filter((q) => q.answer.trim());
  const questions = [
    ...answered,
    ...(Array.isArray(res?.questions) ? res.questions : []).slice(0, 8).map((q: any, i: number) => ({
      id: `q${Date.now().toString(36)}${i}`,
      question: clampText(q?.question, 400),
      why: clampText(q?.why, 400),
      answer: '',
    })),
  ];
  return {
    fields,
    problem_clarity: {
      score: Math.max(0, Math.min(100, Number(res?.problem_clarity?.score) || 0)),
      comment: clampText(res?.problem_clarity?.comment, 600),
    },
    questions,
    analyzed_at: new Date().toISOString(),
  };
}

// ---------------- Blueprint suggestions (FR-03) ----------------

export interface BlueprintSuggestion {
  nodes: { key: string; type: NodeType; title: string; content: string; provenance: Provenance }[];
  edges: { from: string; to: string; relation: string }[];
}

export async function suggestBlueprint(project: Project, g: Graph): Promise<BlueprintSuggestion> {
  const rel = ALLOWED_RELATIONS.filter((r) => !['source', 'claim', 'evidence', 'experiment', 'result', 'conclusion'].includes(r.from) && !['source', 'claim', 'evidence', 'experiment', 'result', 'conclusion'].includes(r.to))
    .map((r) => `${r.from} -${r.relation}-> ${r.to}`)
    .join('\n');
  const brief = project.brief
    ? Object.entries(project.brief.fields)
        .map(([k, f]) => `${k} (${f.basis}): ${f.value}`)
        .join('\n')
    : '(no brief yet)';
  const answers = project.brief?.questions.filter((q) => q.answer.trim()).map((q) => `Q: ${q.question}\nA: ${q.answer}`).join('\n') ?? '';
  const user = `Propose a project blueprint skeleton for the student to review, accept, edit or reject.

${graphContext(project, g)}

OPPORTUNITY BRIEF:
${brief}
${answers ? `\nSTUDENT ANSWERS:\n${answers}` : ''}

Produce blueprint components of these types only: problem, aim, research_gap, objective (3-5, SMART, each achievable), research_question (one or more per objective), scope, limitation, method (appropriate for the discipline — each method must genuinely answer its objective/question), evaluation, contribution.
Skip any type that already exists above unless it is clearly inadequate. Use short keys like "p1", "o1", "q1", "m1" for new components; refer to existing components by their numeric id as a string, e.g. "12".

Allowed relationships (from -relation-> to):
${rel}

Return JSON:
{"nodes": [{"key": "o1", "type": "objective", "title": "short label (max 12 words)", "content": "1-3 sentence statement", "provenance": "ai_suggestion" | "ai_inference"}],
 "edges": [{"from": "p1", "to": "g1", "relation": "motivates"}]}
Use provenance "ai_inference" only when the component restates what the student already said; otherwise "ai_suggestion". Link every objective to at least one research question and one method.`;
  const res = await chatJson<any>(PERSONA, user, 8000);
  const nodes = (Array.isArray(res?.nodes) ? res.nodes : [])
    .filter((n: any) => NODE_TYPES.includes(n?.type) && n?.key && n?.title)
    .slice(0, 40)
    .map((n: any) => ({
      key: String(n.key),
      type: n.type as NodeType,
      title: clampText(n.title, 200),
      content: clampText(n.content, 2000),
      provenance: (n.provenance === 'ai_inference' ? 'ai_inference' : 'ai_suggestion') as Provenance,
    }));
  const edges = (Array.isArray(res?.edges) ? res.edges : []).map((e: any) => ({ from: String(e?.from), to: String(e?.to), relation: String(e?.relation) }));
  return { nodes, edges };
}

// ---------------- Research workspace (FR-04) ----------------

export interface SourceExtraction {
  title: string;
  authors: string;
  year: string;
  summary: string;
  key_claims: string[];
  findings: string[];
  limitations: string[];
  relevance: string;
  relevance_score: number;
  gap_relationship: 'supports' | 'challenges' | 'neutral' | 'unclear';
  gap_rationale: string;
  gap_ids: number[];
}

export async function extractSource(project: Project, g: Graph, text: string, hint: { title?: string; url?: string; kind: string }): Promise<SourceExtraction> {
  const gaps = g.ofType('research_gap', 'problem', 'objective').map((n) => `#${n.id} [${n.type}] ${n.title}: ${n.content.slice(0, 300)}`).join('\n') || '(none defined yet)';
  const user = `Extract structured information from this research material for the student's project.

PROJECT: ${project.title} (${project.discipline || 'discipline unspecified'})
PROJECT PROBLEM / GAP / OBJECTIVES:
${gaps}

MATERIAL (${hint.kind}${hint.url ? `, ${hint.url}` : ''}${hint.title ? `, titled "${hint.title}"` : ''}):
"""${clampText(text, 24000)}"""

Return JSON:
{"title": "the stated title; if none is stated, a short descriptive label in square brackets, e.g. [Survey of solar irrigation adoption in Kano]", "authors": "comma separated, empty if not stated", "year": "publication year or empty", "summary": "3-5 sentence abstract-like summary",
 "key_claims": ["claims the material itself makes"], "findings": ["concrete findings, numbers where present"], "limitations": ["limitations stated or evident"],
 "relevance": "how this material relates to the student's project", "relevance_score": 0-100,
 "gap_relationship": "supports" | "challenges" | "neutral" | "unclear", "gap_rationale": "does this support the research gap (shows the gap exists) or challenge it (already solves it)?", "gap_ids": [ids of research gaps it relates to]}
Only extract what the material actually says. Never fabricate authors, years or numbers — leave empty if absent.`;
  const r = await chatJson<any>(PERSONA, user);
  const arr = (x: any) => (Array.isArray(x) ? x.map((s) => clampText(s, 500)).filter(Boolean).slice(0, 10) : []);
  return {
    title: clampText(r?.title || hint.title || 'Untitled source', 300),
    authors: clampText(r?.authors, 300),
    year: clampText(r?.year, 10),
    summary: clampText(r?.summary, 2000),
    key_claims: arr(r?.key_claims),
    findings: arr(r?.findings),
    limitations: arr(r?.limitations),
    relevance: humanizeRefs(g, clampText(r?.relevance, 1000)),
    relevance_score: Math.max(0, Math.min(100, Number(r?.relevance_score) || 0)),
    gap_relationship: ['supports', 'challenges', 'neutral', 'unclear'].includes(r?.gap_relationship) ? r.gap_relationship : 'unclear',
    gap_rationale: humanizeRefs(g, clampText(r?.gap_rationale, 800)),
    gap_ids: validIds(g, r?.gap_ids).filter((id) => g.byId.get(id)?.type === 'research_gap'),
  };
}

// ---------------- Supervisor feedback (FR-09) ----------------

export async function parseFeedback(project: Project, g: Graph, text: string) {
  const user = `A supervisor gave this feedback on the student's project. Convert it into a tracked, actionable item.

${graphContext(project, g, { contentChars: 250 })}

FEEDBACK: """${clampText(text, 4000)}"""

Return JSON:
{"summary": "one-line restatement of the concern", "location": "likely chapter/section affected, e.g. 'Chapter 3 → Section 3.4 (Sampling)'",
 "affected": [ids of project components this feedback concerns], "actions": ["concrete checklist steps the student can tick off (3-6)"]}
Do not decide whether the supervisor is right; the student remains the decision-maker.`;
  const r = await chatJson<any>(PERSONA, user);
  return {
    summary: humanizeRefs(g, clampText(r?.summary, 400)),
    location: clampText(r?.location, 200),
    affected: validIds(g, r?.affected),
    actions: (Array.isArray(r?.actions) ? r.actions : []).slice(0, 8).map((a: any) => ({ text: humanizeRefs(g, clampText(a, 300)), done: false })),
  };
}

// ---------------- Defense simulator (FR-10) ----------------

export async function generateDefenseQuestions(project: Project, g: Graph, count: number, weakSpots: string[]) {
  const user = `Generate oral-defense questions an examining panel would ask about THIS project, grounded in its actual components.

${graphContext(project, g)}

KNOWN WEAK SPOTS FROM THE INTEGRITY CHECK:
${weakSpots.length ? weakSpots.map((w) => `- ${w}`).join('\n') : '(none recorded)'}

Categories: ${DEFENSE_CATEGORIES.join(', ')} (challenge = why prefer your approach over existing ones).
Return JSON: {"questions": [{"category": "...", "question": "specific question referencing the project's actual content", "rationale": "what weakness or component this probes", "risk": "high" | "medium" | "low", "target_ids": [ids]}]}
Generate ${count} questions covering every category; make high-risk questions target the weak spots. Avoid generic questions that could apply to any project.`;
  const r = await chatJson<any>(PERSONA, user);
  return (Array.isArray(r?.questions) ? r.questions : [])
    .filter((q: any) => typeof q?.question === 'string')
    .slice(0, 20)
    .map((q: any) => ({
      category: (DEFENSE_CATEGORIES.includes(q.category) ? q.category : 'fundamentals') as DefenseQuestion['category'],
      question: humanizeRefs(g, clampText(q.question, 600)),
      rationale: humanizeRefs(g, clampText(q.rationale, 600)),
      risk: (['high', 'medium', 'low'].includes(q.risk) ? q.risk : 'medium') as DefenseQuestion['risk'],
      target_ids: validIds(g, q.target_ids),
    }));
}

export async function evaluateAnswer(project: Project, g: Graph, q: DefenseQuestion, answer: string): Promise<AnswerEvaluation> {
  const user = `You are an examiner evaluating a student's oral-defense answer against their own project record.

${graphContext(project, g)}

QUESTION (${q.category}, risk ${q.risk}): ${q.question}
Components probed: ${q.target_ids.map((i) => `#${i}`).join(', ') || 'n/a'}
STUDENT ANSWER: """${clampText(answer, 5000)}"""

Assess: relevance to the question; consistency with the project record; claims made without evidence in the project; statements that contradict project components; missing evidence the student should have cited.
Return JSON:
{"score": 0-100, "relevance": 0-100, "consistency": 0-100, "summary": "2-3 sentence examiner's verdict",
 "strengths": [""], "missing_evidence": [""], "unsupported_claims": ["claims in the answer not backed by the project record"],
 "contradictions": [{"statement": "what the student said", "conflicts_with": [ids]}],
 "follow_ups": ["likely follow-up questions from the panel"]}
Be fair but demanding: a vague answer that does not reference the actual method, data or results should score below 50.`;
  const r = await chatJson<any>(PERSONA, user);
  const pct = (x: any) => Math.max(0, Math.min(100, Math.round(Number(x) || 0)));
  const arr = (x: any) => (Array.isArray(x) ? x.map((s) => humanizeRefs(g, clampText(s, 400))).filter(Boolean).slice(0, 6) : []);
  return {
    score: pct(r?.score),
    relevance: pct(r?.relevance),
    consistency: pct(r?.consistency),
    summary: humanizeRefs(g, clampText(r?.summary, 1000)),
    strengths: arr(r?.strengths),
    missing_evidence: arr(r?.missing_evidence),
    unsupported_claims: arr(r?.unsupported_claims),
    contradictions: (Array.isArray(r?.contradictions) ? r.contradictions : []).slice(0, 5).map((c: any) => ({
      statement: humanizeRefs(g, clampText(c?.statement, 400)),
      conflicts_with: validIds(g, c?.conflicts_with),
    })),
    follow_ups: arr(r?.follow_ups),
  };
}

// ---------------- Writing assistant (FR-08) ----------------

export const WRITING_MODES = {
  ask: 'Answer the student\'s question about their project.',
  outline: 'Produce an outline for the requested chapter/section, built from the project components.',
  draft: 'Draft the requested section using ONLY project components as substance. Where the project lacks the needed content, insert a clearly marked gap like "[MISSING: sample size justification]" instead of inventing it.',
  rewrite: 'Rewrite the provided text in a clear academic tone without adding new substantive claims.',
  critique: 'Critique the provided text or section: unsupported claims, vagueness, logical gaps, inconsistencies with the project record.',
  explain: 'Explain the concept or project component the student asks about, in plain language, and how it applies to their project.',
  summarize: 'Summarise the requested material from the project.',
  transitions: 'Suggest transitions that connect the named sections logically, grounded in the project chain.',
} as const;
export type WritingMode = keyof typeof WRITING_MODES;

export async function assist(
  project: Project,
  g: Graph,
  mode: WritingMode,
  message: string,
  history: { role: 'user' | 'assistant'; content: string }[],
): Promise<AssistantReply> {
  const convo = history
    .slice(-8)
    .map((h) => `${h.role.toUpperCase()}: ${clampText(h.content, 1500)}`)
    .join('\n');
  const user = `${graphContext(project, g)}

TASK MODE: ${mode} — ${WRITING_MODES[mode]}
${convo ? `\nRECENT CONVERSATION:\n${convo}\n` : ''}
STUDENT: """${clampText(message, 6000)}"""

Prioritise project evidence over generic generation. Split your reply into segments so every statement is traceable:
- basis "project": restates or is directly derived from project components — refs MUST list their ids
- basis "source": comes from a Source component — refs MUST list the source ids
- basis "user": repeats what the student just wrote
- basis "ai_inference": your own reasoning or general knowledge not in the project (refs empty)
- basis "ai_suggestion": a recommendation for the student
Return JSON:
{"segments": [{"text": "markdown text (a sentence or paragraph)", "basis": "...", "refs": [ids]}],
 "suggested_edits": [{"node_id": id or null for a new component, "type": "component type", "title": "", "content": "", "reason": "why"}]}
Only include suggested_edits when the student asked for a change to a component or a concrete improvement is clearly warranted; the student must accept each one. Never claim a statement is from the project if it is not.`;
  const r = await chatJson<any>(PERSONA, user, 8000);
  const bases: Segment['basis'][] = ['project', 'source', 'user', 'ai_inference', 'ai_suggestion'];
  const segments: Segment[] = (Array.isArray(r?.segments) ? r.segments : [])
    .filter((s: any) => typeof s?.text === 'string' && s.text.trim())
    .map((s: any) => {
      const refs = validIds(g, s.refs);
      let basis: Segment['basis'] = bases.includes(s.basis) ? s.basis : 'ai_inference';
      // A segment that claims project/source basis but cites nothing traceable is downgraded.
      if ((basis === 'project' || basis === 'source') && !refs.length) basis = 'ai_inference';
      return { text: humanizeRefs(g, clampText(s.text, 6000)), basis, refs };
    });
  const suggested_edits = (Array.isArray(r?.suggested_edits) ? r.suggested_edits : [])
    .filter((e: any) => NODE_TYPES.includes(e?.type) && (e?.content || e?.title))
    .slice(0, 6)
    .map((e: any) => {
      const id = validIds(g, [e.node_id])[0] ?? null;
      return {
        node_id: id,
        type: (id ? g.byId.get(id)!.type : e.type) as NodeType,
        title: clampText(e.title || (id ? g.byId.get(id)!.title : ''), 200),
        content: clampText(e.content, 4000),
        reason: humanizeRefs(g, clampText(e.reason, 500)),
      };
    });
  return { segments, suggested_edits };
}
