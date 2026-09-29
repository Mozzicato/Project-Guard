import {
  CHECK_NAMES,
  nodeRef,
  type CheckId,
  type DefenseQuestion,
  type Feedback,
  type HealthMetrics,
  type Issue,
  type PNode,
  type Project,
  type Severity,
} from '../shared/model.js';
import { Graph, graphContext, humanizeRefs, validIds } from './graph.js';
import { chatJson } from './llm.js';

let seq = 0;
function issue(
  check: CheckId,
  severity: Severity,
  title: string,
  why: string,
  affected: PNode[] | number[],
  evidence: string,
  action: string,
  origin: 'rule' | 'ai' = 'rule',
): Issue {
  return {
    id: `${check}-${++seq}`,
    check,
    severity,
    title,
    why,
    affected: (affected as any[]).map((a) => (typeof a === 'number' ? a : a.id)),
    evidence,
    action,
    origin,
  };
}

const refs = (ns: PNode[]) => ns.map((n) => `${nodeRef(n)} "${n.title}"`).join(', ');

// ---------------------------------------------------------------------------
// Deterministic checks (§22): structural questions that need no model.
// ---------------------------------------------------------------------------

/** Stages before any data exists — missing results/conclusions are expected there, not a defect. */
const EARLY_STAGES = ['ideation', 'proposal', 'literature_review', 'methodology'];

export function ruleChecks(g: Graph, feedback: Feedback[], stage = 'implementation', track: 'research' | 'hardware' = 'research'): Issue[] {
  const out: Issue[] = [];
  const early = EARLY_STAGES.includes(stage);
  const hardware = track === 'hardware';

  // S — required blueprint components are present. A build project is judged on requirements,
  // design and components rather than research questions and a research method.
  const required: [Parameters<Graph['ofType']>[0], string, Severity][] = hardware
    ? [
        ['problem', 'Problem statement', 'critical'],
        ['aim', 'Aim', 'warning'],
        ['research_gap', 'Gap in existing solutions', 'warning'],
        ['objective', 'Objectives', 'critical'],
        ['requirement', 'Requirements (engineering specifications)', 'critical'],
        ['design', 'Design artifacts (block diagram, schematic, calculations)', early ? 'info' : 'warning'],
        ['component', 'Components / bill of materials', early ? 'info' : 'warning'],
        ['scope', 'Scope', 'warning'],
        ['contribution', 'Expected contribution', 'info'],
        ['limitation', 'Limitations', 'info'],
      ]
    : [
    ['problem', 'Problem statement', 'critical'],
    ['aim', 'Aim', 'warning'],
    ['research_gap', 'Research gap', 'critical'],
    ['objective', 'Objectives', 'critical'],
    ['research_question', 'Research questions', 'warning'],
    ['method', 'Methodology', 'critical'],
    ['scope', 'Scope', 'warning'],
    ['evaluation', 'Evaluation strategy', 'warning'],
    ['contribution', 'Expected contribution', 'info'],
    ['limitation', 'Limitations', 'info'],
      ];
  const missing = required.filter(([t]) => g.ofType(t).length === 0);
  for (const [, label, sev] of missing) {
    out.push(
      issue('S', sev, `${label} is missing`, `Every defensible project needs a clear ${label.toLowerCase()}; later components depend on it.`, [], `No ${label.toLowerCase()} component exists in the project blueprint.`, `Add a ${label.toLowerCase()} in the Blueprint.`),
    );
  }
  if (!missing.length) {
    out.push(issue('S', 'passed', 'All core blueprint components are present', '', [], '', ''));
  }
  const problems = g.ofType('problem');
  const gaps = g.ofType('research_gap');
  for (const gap of gaps) {
    if (problems.length && g.parents(gap.id, 'problem').length === 0) {
      out.push(issue('S', 'warning', `Research gap ${nodeRef(gap)} is not linked to the problem`, 'A gap that is not motivated by the stated problem suggests the project framing is disconnected.', [gap], `${nodeRef(gap)} has no "motivates" link from a problem statement.`, 'Link the problem statement to this research gap, or revise the gap.'));
    }
  }

  // A — objective coverage.
  const objectives = g.ofType('objective');
  let fullyCovered = 0;
  for (const o of objectives) {
    const c = g.objectiveCoverage(o.id);
    const gaps: string[] = [];
    if (hardware) {
      if (!c.requirement) gaps.push('requirement');
      if (!c.design) gaps.push('design');
      if (!c.test && !c.evidence_or_result) gaps.push('test');
    } else {
      if (!c.research_question) gaps.push('research question');
      if (!c.method) gaps.push('method');
      if (!c.evidence_or_result) gaps.push('evidence/result');
    }
    if (!c.conclusion) gaps.push('conclusion');
    if (!gaps.length) {
      fullyCovered++;
      continue;
    }
    const structural = hardware ? !c.requirement : !c.method || !c.research_question;
    const sev: Severity = structural ? 'critical' : early ? 'info' : 'warning';
    out.push(
      issue('A', sev, `${nodeRef(o)} has no ${gaps.join(', ')}${!structural && early ? ' yet (expected at this stage)' : ''}`, hardware && !c.requirement ? 'An objective with no measurable requirement cannot be designed for or tested; examiners will ask how you know it was achieved.' : !hardware && !c.method ? 'An objective without a method cannot be achieved or examined — it will be the first thing questioned at defense.' : 'An objective must trace all the way through to a result and a conclusion, or it will look abandoned.', [o], `Objective "${o.title}" is missing downstream links to: ${gaps.join(', ')}.`, `Link ${nodeRef(o)} to a ${gaps[0]} (or remove the objective if it is out of scope).`),
    );
  }
  if (objectives.length && fullyCovered === objectives.length) {
    out.push(issue('A', 'passed', hardware ? 'Every objective traces to a requirement, design, test and conclusion' : 'Every objective traces to a question, method, result and conclusion', '', [], '', ''));
  }
  const rqs = g.ofType('research_question');
  for (const q of rqs) {
    if (g.parents(q.id, 'objective').length === 0) {
      out.push(issue('A', 'warning', `${nodeRef(q)} is not linked to any objective`, 'A research question that answers no objective adds work without adding to the argument.', [q], `No objective is refined into "${q.title}".`, 'Link it to the objective it serves, or remove it.'));
    }
    if (g.children(q.id, 'method').length === 0) {
      out.push(issue('A', 'warning', `${nodeRef(q)} has no method`, 'Without a method there is no way to answer the question.', [q], `"${q.title}" has no "investigated_by" link.`, 'Link the research question to the method that will answer it.'));
    }
  }

  // C — claims and results need evidence.
  const claims = g.ofType('claim');
  const unsupported = claims.filter((c) => !g.claimBacking(c.id).backed);
  for (const c of unsupported) {
    const important = !!c.data?.important || g.parents(c.id).length > 0;
    out.push(issue('C', important ? 'critical' : 'warning', `Claim ${nodeRef(c)} has no supporting evidence`, 'An unsupported claim is a student assertion, not a finding. Examiners will ask for the source.', [c], `"${c.title}" is not linked to any evidence item or source.`, 'Attach a source or evidence in the Evidence Ledger, soften the wording, or remove the claim.'));
  }
  if (claims.length && !unsupported.length) {
    out.push(issue('C', 'passed', 'All claims are evidence-backed', '', [], '', ''));
  }
  const results = g.ofType('result');
  for (const r of results) {
    if (g.parents(r.id, 'experiment', 'evidence', 'test').length === 0) {
      out.push(issue('C', 'warning', `Result ${nodeRef(r)} is not supported by an experiment or evidence`, 'A result with no recorded origin cannot be reproduced or defended.', [r], `No experiment or evidence item "produces"/"supports" "${r.title}".`, 'Link the experiment or evidence that produced this result.'));
    }
  }
  for (const ev of g.ofType('evidence')) {
    if (g.children(ev.id, 'source').length === 0 && g.parents(ev.id, 'method', 'experiment').length === 0 && ev.provenance !== 'verified') {
      out.push(issue('C', 'info', `Evidence ${nodeRef(ev)} has no recorded origin`, 'Evidence should come from a source, a method, or an experiment so it can be verified.', [ev], `"${ev.title}" is not derived from a source or produced by a method/experiment.`, 'Link it to its source or to the method/experiment that produced it.'));
    }
  }

  // D — research gap has literature behind it.
  for (const gap of gaps) {
    const supporting = g.parents(gap.id, 'source').filter((s) => (g.out.get(s.id) ?? []).some((e) => e.to_id === gap.id && e.relation === 'supports_gap'));
    const challenging = g.parents(gap.id, 'source').filter((s) => (g.out.get(s.id) ?? []).some((e) => e.to_id === gap.id && e.relation === 'challenges_gap'));
    if (!supporting.length) {
      out.push(issue('D', 'critical', `Research gap ${nodeRef(gap)} has no supporting literature`, 'A research gap must be demonstrated from the literature; otherwise it is an assumption.', [gap], `No source is linked to "${gap.title}" with a "supports gap" relationship.`, 'Add sources in the Research workspace and link the ones that show the gap.'));
    } else if (challenging.length >= supporting.length) {
      out.push(issue('D', 'warning', `Research gap ${nodeRef(gap)} is contested by the literature`, 'As many sources challenge the gap as support it — the contribution may already exist.', [gap, ...challenging], `Supporting: ${refs(supporting)}. Challenging: ${refs(challenging)}.`, 'Narrow the gap to what the challenging sources do not cover, and say so explicitly.'));
    } else {
      out.push(issue('D', 'passed', `Research gap ${nodeRef(gap)} is supported by ${supporting.length} source(s)`, '', [], '', ''));
    }
    if (g.children(gap.id, 'objective').length === 0) {
      out.push(issue('D', 'warning', `No objective addresses research gap ${nodeRef(gap)}`, 'If no objective targets the gap, the project does not actually close it.', [gap], `"${gap.title}" has no "addressed_by" link to an objective.`, 'Link the objective(s) that address this gap.'));
    }
  }

  // E — every result maps back to an objective.
  const orphanResults = results.filter((r) => !g.chainUp(r.id).some((n) => n.type === 'objective'));
  for (const r of orphanResults) {
    out.push(issue('E', 'warning', `Result ${nodeRef(r)} does not answer any objective`, 'Results that answer no objective distract from the argument and suggest scope drift.', [r], `Tracing "${r.title}" upstream reaches no objective.`, 'Link the result into an objective\'s chain (via its experiment/method), or move it to an appendix.'));
  }
  if (results.length && !orphanResults.length) {
    out.push(issue('E', 'passed', 'All reported results map to an objective', '', [], '', ''));
  }
  // In a build project, experiments are build-log entries rather than research experiments.
  for (const ex of hardware ? [] : g.ofType('experiment')) {
    if (!g.chainUp(ex.id).some((n) => n.type === 'objective')) {
      out.push(issue('E', 'warning', `Experiment ${nodeRef(ex)} is not tied to an objective`, 'Every experiment should exist to answer an objective.', [ex], `"${ex.title}" has no method→objective chain above it.`, 'Link the method that this experiment operationalises.'));
    }
  }

  // F — conclusions cover objectives and rest on results.
  const conclusions = g.ofType('conclusion');
  for (const c of conclusions) {
    if (g.parents(c.id, 'result').length === 0) {
      out.push(issue('F', 'critical', `Conclusion ${nodeRef(c)} is not supported by any result`, 'A conclusion without results behind it is an opinion.', [c], `No result "supports" "${c.title}".`, 'Link the result(s) this conclusion is drawn from, or rewrite it.'));
    }
  }
  const noConclusion = objectives.filter((o) => !g.objectiveCoverage(o.id).conclusion);
  if (conclusions.length && noConclusion.length) {
    out.push(issue('F', 'warning', `${noConclusion.length} objective(s) are not addressed by any conclusion`, 'The conclusion must say whether each objective was achieved.', noConclusion, `Objectives without a conclusion: ${refs(noConclusion)}.`, 'Add or link a conclusion for each of these objectives.'));
  }
  if (conclusions.length && !noConclusion.length && objectives.length) {
    out.push(issue('F', 'passed', 'The conclusions address every objective', '', [], '', ''));
  }

  if (hardware) out.push(...hardwareChecks(g, early));

  // FB — outstanding supervisor feedback.
  const open = feedback.filter((f) => f.status === 'open' || f.status === 'in_progress');
  for (const f of open) {
    const pending = f.actions.filter((a) => !a.done).length;
    out.push(issue('FB', 'warning', `Supervisor feedback not yet addressed: ${f.summary || f.raw_text.slice(0, 80)}`, 'Unaddressed supervisor feedback is a frequent cause of failed reviews and hard defense questions.', f.affected, `Status: ${f.status.replace('_', ' ')}; ${pending} of ${f.actions.length} action(s) outstanding.`, 'Work through the feedback actions, then mark it resolved.'));
  }
  if (feedback.length && !open.length) {
    out.push(issue('FB', 'passed', 'All supervisor feedback has been resolved', '', [], '', ''));
  }

  return out;
}

// ---------------------------------------------------------------------------
// Hardware track (R, V): every requirement must be measurable, realised in the design and
// verified by a test — the requirements traceability matrix used in engineering capstones.
// ---------------------------------------------------------------------------

function hardwareChecks(g: Graph, early: boolean): Issue[] {
  const out: Issue[] = [];
  const reqs = g.ofType('requirement');
  let fullyTraced = 0;
  for (const r of reqs) {
    const t = g.requirementTrace(r.id);
    const target = String(r.data?.target ?? '').trim();
    if (!g.parents(r.id, 'objective').length) {
      out.push(issue('R', 'warning', `Requirement ${nodeRef(r)} is not linked to any objective`, 'A requirement that serves no objective is scope creep, or an objective is missing.', [r], `No objective is "specified by" "${r.title}".`, 'Link it to the objective it makes measurable, or remove it.'));
    }
    if (!target) {
      out.push(issue('R', 'warning', `Requirement ${nodeRef(r)} is not measurable`, 'A requirement without a target value cannot be tested, so nobody can say whether it was met.', [r], `"${r.title}" has no target value (for example "at most 2 s response" or "at least 8 h battery life").`, 'Give it a target value and unit on the Requirements page.'));
    }
    if (!t.realized.length) {
      out.push(issue('R', early ? 'info' : 'warning', `Requirement ${nodeRef(r)} is not realised in the design`, 'Every requirement should be met by a design element or component; otherwise, how is it satisfied?', [r], `"${r.title}" has no linked design artifact or component.`, 'On the Design page, link the block, circuit or component that satisfies it.'));
    }
    if (!t.tests.length) {
      out.push(issue('V', early ? 'warning' : 'critical', `Requirement ${nodeRef(r)} has no test`, 'An untested requirement is only a claim. Your panel will ask how you proved the device meets it.', [r], `No test "verifies" "${r.title}".`, 'Add a test on the Build & test page: the procedure, the expected value, then the measured value.'));
    }
    for (const f of t.failed) {
      out.push(issue('V', 'warning', `Test ${nodeRef(f)} failed, so ${nodeRef(r)} is not met`, 'A failed test is fine to report, but it must be explained and either fixed or stated as a limitation.', [r, f], `Expected ${f.data?.expected || '?'}, measured ${f.data?.measured || '?'}.`, 'Fix the design and re-test, or discuss the shortfall as a limitation in Chapter 4.'));
    }
    if (target && t.realized.length && t.verified) fullyTraced++;
  }
  if (reqs.length && fullyTraced === reqs.length) {
    out.push(issue('R', 'passed', 'Every requirement is measurable, realised in the design and verified by a passing test', '', [], '', ''));
  }
  for (const test of g.ofType('test')) {
    const status = test.data?.status ?? 'planned';
    if (!g.parents(test.id, 'requirement').length) {
      out.push(issue('V', 'info', `Test ${nodeRef(test)} does not verify any requirement`, 'Tests should exist to prove requirements; otherwise they add pages without adding proof.', [test], `"${test.title}" has no requirement linked.`, 'Link it to the requirement it verifies.'));
    }
    if (status === 'planned' && !early) {
      out.push(issue('V', 'warning', `Test ${nodeRef(test)} has no measured result yet`, 'Chapter 4 needs measured values compared with the specification.', [test], `Expected: ${test.data?.expected || 'not stated'}; measured: not recorded.`, 'Run the test and record the measured value and pass/fail.'));
    }
  }
  const components = g.ofType('component');
  for (const c of components) {
    if (!g.parents(c.id, 'requirement', 'design').length) {
      out.push(issue('R', 'info', `Component ${nodeRef(c)} is not traced to a requirement or design`, 'Each part should be justified by what it does for the system; this is the "component selection rationale" examiners expect in Chapter 3.', [c], `"${c.title}" is not used by any design artifact or requirement.`, 'Link it to the design block or requirement it serves.'));
    }
  }
  const unpriced = components.filter((c) => !(Number(c.data?.qty) > 0) || String(c.data?.unit_cost ?? '').trim() === '');
  if (unpriced.length) {
    out.push(issue('R', 'info', `${unpriced.length} component(s) have no quantity or unit cost`, 'The bill of materials and cost analysis are expected in the report, and panels often ask what the device costs.', unpriced, `Missing quantity or cost: ${refs(unpriced)}.`, 'Fill in quantity and unit cost on the Design page.'));
  }
  return out;
}

// ---------------------------------------------------------------------------
// AI checks: semantic questions a rule cannot answer (B, D, G, H).
// ---------------------------------------------------------------------------

const AI_SYSTEM = `You are the reasoning layer of Project Compiler's Integrity Engine, reviewing a final-year undergraduate research project.
You find real, specific weaknesses that an examiner would raise. You never invent facts about the project: base every finding on the components provided and cite them by #id.
Do not repeat purely structural problems (missing links or missing components) — a rule engine already reports those. Focus on meaning.
Be discipline-aware: do not assume every project is a software or experimental project.
If something is fine, report it as "passed". Prefer fewer, sharper findings over many vague ones. Never give generic writing advice.`;

const HARDWARE_TASK = `This is a HARDWARE / engineering-build project. In addition, check:
- whether each requirement's target is realistic and consistent with the chosen components (ranges, ratings, accuracy, power budget);
- whether the design artifacts and components actually satisfy the requirements they are linked to;
- whether test procedures would genuinely verify their requirement (right instrument, right conditions).
Report these under check "B" (design/method consistency) or "H" (contradiction).`;

const AI_TASK = `Run these semantic checks on the project below:

B. Methodology consistency — does each method actually answer the objective/research question it is linked to? (e.g. a regression method for a classification problem; a survey used to measure system performance)
D. Research gap integrity — does the literature (sources, their summaries and claims) actually support the stated research gap, or does it contradict / already fill it?
G. Scope drift — compared to the scope statement and the original idea, have objectives, methods or results expanded beyond (or drifted away from) the original scope?
H. Internal contradiction — do any two components contradict one another (problem type, population, data, metrics, claims, results vs conclusions)?

Return JSON:
{
  "findings": [
    {
      "check": "B" | "D" | "G" | "H",
      "severity": "critical" | "warning" | "info" | "passed",
      "title": "one specific sentence naming the components, e.g. 'Method #12 (regression) cannot answer classification objective #4'",
      "why": "why it matters for the project's defensibility",
      "affected": [ids of the components involved],
      "evidence": "quote or paraphrase the exact component text that shows the problem",
      "action": "the concrete next step the student should take"
    }
  ]
}
Include at least one entry per check (use severity "passed" when the check finds nothing). Severity "critical" is only for problems that would undermine the project if unaddressed.`;

export async function aiChecks(project: Project, g: Graph): Promise<Issue[]> {
  if (g.nodes.length === 0) return [];
  const task = project.track === 'hardware' ? `${AI_TASK}\n\n${HARDWARE_TASK}` : AI_TASK;
  const res = await chatJson<{ findings: any[] }>(AI_SYSTEM, `${task}\n\n${graphContext(project, g)}`);
  const findings = Array.isArray(res?.findings) ? res.findings : [];
  const allowed: CheckId[] = ['B', 'D', 'G', 'H'];
  const sevs: Severity[] = ['critical', 'warning', 'info', 'passed'];
  return findings
    .filter((f) => allowed.includes(f?.check) && typeof f?.title === 'string')
    .map((f) =>
      issue(
        f.check,
        sevs.includes(f.severity) ? f.severity : 'warning',
        humanizeRefs(g, String(f.title)),
        humanizeRefs(g, String(f.why ?? '')),
        validIds(g, f.affected),
        humanizeRefs(g, String(f.evidence ?? '')),
        humanizeRefs(g, String(f.action ?? '')),
        'ai',
      ),
    );
}

// ---------------------------------------------------------------------------
// Metrics (§14, §26)
// ---------------------------------------------------------------------------

/** Does a critical component have the relationships it needs to be defensible? */
export function componentValid(g: Graph, n: PNode): boolean {
  switch (n.type) {
    case 'objective': {
      const c = g.objectiveCoverage(n.id);
      return c.research_question && c.method && c.evidence_or_result && c.conclusion;
    }
    case 'research_question':
      return g.parents(n.id, 'objective').length > 0 && g.children(n.id, 'method').length > 0;
    case 'method':
      return g.parents(n.id, 'objective', 'research_question').length > 0 && g.children(n.id, 'experiment', 'evidence').length > 0;
    case 'research_gap':
      return (g.parents(n.id, 'source').some((s) => (g.out.get(s.id) ?? []).some((e) => e.to_id === n.id && e.relation === 'supports_gap'))) && g.children(n.id, 'objective').length > 0;
    case 'result':
      return g.parents(n.id, 'experiment', 'evidence').length > 0 && g.chainUp(n.id).some((x) => x.type === 'objective');
    case 'conclusion':
      return g.parents(n.id, 'result').length > 0;
    case 'claim':
      return g.claimBacking(n.id).backed;
    case 'requirement': {
      const t = g.requirementTrace(n.id);
      return !!String(n.data?.target ?? '').trim() && t.realized.length > 0 && t.verified;
    }
    default:
      return true;
  }
}

export const CRITICAL_TYPES = ['research_gap', 'objective', 'research_question', 'method', 'result', 'conclusion', 'claim', 'requirement'] as const;

export function computeMetrics(g: Graph, issues: Issue[], questions: DefenseQuestion[]): HealthMetrics {
  const critical = issues.filter((i) => i.severity === 'critical').length;
  const warnings = issues.filter((i) => i.severity === 'warning').length;
  const info = issues.filter((i) => i.severity === 'info').length;
  const objectives = g.ofType('objective');
  const covered = objectives.filter((o) => componentValid(g, o)).length;
  const claims = g.ofType('claim');
  const backed = claims.filter((c) => g.claimBacking(c.id).backed).length;
  const resultsNoEvidence = g.ofType('result').filter((r) => g.parents(r.id, 'experiment', 'evidence').length === 0).length;
  const crit = g.ofType(...CRITICAL_TYPES);
  const valid = crit.filter((n) => componentValid(g, n)).length;
  const readiness = defenseReadiness(questions).overall;
  const score = Math.max(0, Math.min(100, Math.round(100 - critical * 12 - warnings * 4 - info * 1)));
  return {
    score: g.nodes.length === 0 ? 0 : score,
    critical,
    warnings,
    info,
    missing_evidence: claims.length - backed + resultsNoEvidence,
    objectives_covered: covered,
    objectives_total: objectives.length,
    defensibility_rate: crit.length ? Math.round((valid / crit.length) * 100) : 0,
    defense_readiness: readiness,
    evidence_backed_claims: backed,
    claims_total: claims.length,
    ...(g.ofType('requirement').length || g.ofType('component').length
      ? {
          requirements_verified: g.ofType('requirement').filter((r) => g.requirementTrace(r.id).verified).length,
          requirements_total: g.ofType('requirement').length,
          bom_total: Math.round(g.bomTotal() * 100) / 100,
        }
      : {}),
  };
}

export function defenseReadiness(questions: DefenseQuestion[]) {
  const answered = questions.filter((q) => q.evaluation);
  if (!answered.length) return { overall: null as number | null, categories: {} as Record<string, number>, answered: 0, total: questions.length };
  const byCat: Record<string, number[]> = {};
  for (const q of answered) (byCat[q.category] ??= []).push(q.evaluation!.score);
  const categories: Record<string, number> = {};
  for (const [k, v] of Object.entries(byCat)) categories[k] = Math.round(v.reduce((a, b) => a + b, 0) / v.length);
  // Unanswered high-risk questions count as zero: an unprepared answer is a risk.
  const weights = questions.map((q) => (q.risk === 'high' ? 2 : 1));
  const scores = questions.map((q) => q.evaluation?.score ?? 0);
  const overall = Math.round(scores.reduce((a, s, i) => a + s * weights[i], 0) / weights.reduce((a, b) => a + b, 0));
  return { overall, categories, answered: answered.length, total: questions.length };
}

/** Drop AI findings that only restate a rule finding about the same components. */
export function mergeIssues(rules: Issue[], aiIssues: Issue[]): Issue[] {
  const flagged = rules.filter((r) => r.severity !== 'passed' && r.affected.length);
  const kept = aiIssues.filter((a) => {
    if (a.severity === 'passed' || !a.affected.length) return true;
    return !flagged.some((r) => r.check === a.check && a.affected.every((id) => r.affected.includes(id)));
  });
  return [...rules, ...kept];
}

export function sortIssues(issues: Issue[]): Issue[] {
  const rank: Record<Severity, number> = { critical: 0, warning: 1, info: 2, passed: 3 };
  const checkOrder = Object.keys(CHECK_NAMES);
  return [...issues].sort((a, b) => rank[a.severity] - rank[b.severity] || checkOrder.indexOf(a.check) - checkOrder.indexOf(b.check));
}
