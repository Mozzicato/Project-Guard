// §27 Principle 7 — the document is an output. The report is compiled from the project graph,
// and every paragraph keeps a pointer to the component it came from.
import { nodeRef, type NodeType, type PNode, type Project } from '../shared/model.js';
import { Graph } from './graph.js';

export interface ReportBlock {
  kind: 'heading' | 'paragraph' | 'list' | 'missing';
  text: string;
  items?: { text: string; refs: number[] }[];
  refs: number[];
}
export interface ReportChapter {
  title: string;
  blocks: ReportBlock[];
}

export function buildReport(project: Project, g: Graph): ReportChapter[] {
  const of = (t: NodeType) => g.ofType(t);
  const para = (n: PNode): ReportBlock => ({ kind: 'paragraph', text: n.content || n.title, refs: [n.id] });
  const heading = (text: string): ReportBlock => ({ kind: 'heading', text, refs: [] });
  const missing = (what: string): ReportBlock => ({ kind: 'missing', text: `[MISSING: ${what}]`, refs: [] });
  const section = (title: string, nodes: PNode[], what: string, asList = false): ReportBlock[] => {
    if (!nodes.length) return [heading(title), missing(what)];
    if (asList) {
      return [heading(title), { kind: 'list', text: '', refs: nodes.map((n) => n.id), items: nodes.map((n) => ({ text: n.content ? `**${n.title}.** ${n.content}` : n.title, refs: [n.id] })) }];
    }
    return [heading(title), ...nodes.map(para)];
  };

  const sources = of('source');
  const cite = (s: PNode) => {
    const a = String(s.data?.authors ?? '').split(',')[0]?.trim();
    return `${a ? `${a}${String(s.data?.authors ?? '').includes(',') ? ' et al.' : ''}` : s.title}${s.data?.year ? `, ${s.data.year}` : ''}`;
  };

  const ch1: ReportChapter = {
    title: 'Chapter 1 — Introduction',
    blocks: [
      ...section('1.1 Background and Problem Statement', of('problem'), 'problem statement'),
      ...section('1.2 Research Gap', of('research_gap'), 'research gap'),
      ...section('1.3 Aim', of('aim'), 'aim'),
      ...section('1.4 Objectives', of('objective'), 'objectives', true),
      ...section('1.5 Research Questions', of('research_question'), 'research questions', true),
      ...section('1.6 Scope', of('scope'), 'scope'),
      ...section('1.7 Expected Contribution', of('contribution'), 'expected contribution'),
    ],
  };

  const litBlocks: ReportBlock[] = [];
  if (!sources.length) litBlocks.push(missing('literature — add sources in the Research workspace'));
  for (const s of sources) {
    litBlocks.push(heading(`${s.title}`));
    const bits = [s.data?.summary, s.data?.limitations?.length ? `Limitations noted: ${s.data.limitations.join('; ')}.` : ''].filter(Boolean).join(' ');
    litBlocks.push({ kind: 'paragraph', text: `${bits || s.content || '(no summary yet)'} (${cite(s)})`, refs: [s.id] });
  }
  for (const gap of of('research_gap')) {
    const sup = g.parents(gap.id, 'source');
    litBlocks.push(heading(`Synthesis: ${gap.title}`));
    litBlocks.push(
      sup.length
        ? { kind: 'paragraph', text: `${gap.content || gap.title} This gap is informed by ${sup.map(cite).join('; ')}.`, refs: [gap.id, ...sup.map((s) => s.id)] }
        : missing(`literature supporting the gap "${gap.title}"`),
    );
  }

  if (project.track === 'hardware') {
    const { ch3: hw3, ch4: hw4 } = hardwareChapters(g);
    return finish(hw3, hw4, 'Chapter 3 — System Design and Methodology', 'Chapter 4 — Construction, Testing and Results');
  }

  const ch3: ReportBlock[] = [...section('3.1 Methods', of('method'), 'methodology')];
  for (const m of of('method')) {
    const serves = g.parents(m.id, 'objective', 'research_question');
    if (serves.length) ch3.push({ kind: 'paragraph', text: `${m.title} addresses ${serves.map((s) => nodeRef(s)).join(', ')}.`, refs: [m.id, ...serves.map((s) => s.id)] });
  }
  ch3.push(...section('3.2 Evaluation Strategy', of('evaluation'), 'evaluation strategy'));
  ch3.push(...section('3.3 Limitations', of('limitation'), 'limitations', true));

  const ch4: ReportBlock[] = [...section('4.1 Experiments', of('experiment'), 'experiments / data collection'), ...section('4.2 Results', of('result'), 'results')];
  const ev = of('evidence');
  if (ev.length) ch4.push(...section('4.3 Supporting Evidence', ev, 'evidence', true));

  return finish(ch3, ch4, 'Chapter 3 — Methodology', 'Chapter 4 — Results');

  function finish(ch3: ReportBlock[], ch4: ReportBlock[], t3: string, t4: string): ReportChapter[] {
  const ch5: ReportBlock[] = [...section('5.1 Conclusions', of('conclusion'), 'conclusions')];
  const objectives = of('objective');
  if (objectives.length) {
    ch5.push(heading('5.2 Achievement of Objectives'));
    ch5.push({
      kind: 'list',
      text: '',
      refs: objectives.map((o) => o.id),
      items: objectives.map((o) => {
        const concl = g.chainDown(o.id).filter((n) => n.type === 'conclusion');
        return {
          text: concl.length ? `**${o.title}** — ${concl.map((c) => c.title).join('; ')}` : `**${o.title}** — [MISSING: conclusion for this objective]`,
          refs: [o.id, ...concl.map((c) => c.id)],
        };
      }),
    });
  }
  ch5.push(...section('5.3 Contribution', of('contribution'), 'contribution'));

  const refs: ReportBlock[] = sources.length
    ? [{ kind: 'list', text: '', refs: sources.map((s) => s.id), items: sources.map((s) => ({ text: `${s.data?.authors || 'Unknown author'} (${s.data?.year || 'n.d.'}). *${s.title}*.${s.data?.url ? ` ${s.data.url}` : ''}`, refs: [s.id] })) }]
    : [missing('references')];

  return [
    ch1,
    { title: 'Chapter 2 — Literature Review', blocks: litBlocks },
    { title: t3, blocks: ch3 },
    { title: t4, blocks: ch4 },
    { title: 'Chapter 5 — Conclusion', blocks: ch5 },
    { title: 'References', blocks: refs },
  ];
  }
}

export function reportMarkdown(project: Project, chapters: ReportChapter[]): string {
  const out = [`# ${project.title}`, '', `*${[project.department, project.institution].filter(Boolean).join(', ')}*`, ''];
  for (const ch of chapters) {
    out.push(`## ${ch.title}`, '');
    for (const b of ch.blocks) {
      if (b.kind === 'heading') out.push(`### ${b.text}`, '');
      else if (b.kind === 'list') out.push(...(b.items ?? []).map((i) => `- ${i.text}`), '');
      else out.push(b.text, '');
    }
  }
  return out.join('\n');
}

/** Engineering-report chapters for build projects: specifications → design → BOM, then tests against specs. */
function hardwareChapters(g: Graph): { ch3: ReportBlock[]; ch4: ReportBlock[] } {
  const heading = (text: string): ReportBlock => ({ kind: 'heading', text, refs: [] });
  const missing = (what: string): ReportBlock => ({ kind: 'missing', text: `[MISSING: ${what}]`, refs: [] });
  const reqs = g.ofType('requirement');
  const designs = g.ofType('design');
  const comps = g.ofType('component');
  const tests = g.ofType('test');
  const spec = (r: PNode) => (r.data?.target ? `${r.data.target} ${r.data.unit ?? ''}`.trim() : '[MISSING: target value]');

  const ch3: ReportBlock[] = [heading('3.1 Requirements and Engineering Specifications')];
  ch3.push(
    reqs.length
      ? { kind: 'list', text: '', refs: reqs.map((r) => r.id), items: reqs.map((r) => ({ text: `**${nodeRef(r)} ${r.title}** — target: ${spec(r)}; verified by ${r.data?.verification ?? 'test'}.`, refs: [r.id] })) }
      : missing('requirements with measurable targets'),
  );
  const kinds: [string, string][] = [
    ['block_diagram', 'System Block Diagram'],
    ['calculation', 'Design Calculations'],
    ['schematic', 'Circuit Design'],
    ['simulation', 'Simulation'],
    ['pcb_layout', 'PCB / Layout'],
    ['firmware', 'Firmware / Software'],
    ['mechanical', 'Mechanical Design'],
  ];
  // Sections are numbered in order of appearance; optional ones are skipped when empty.
  let sec = 1;
  const next = (title: string) => heading(`3.${++sec} ${title}`);
  for (const [kind, title] of kinds) {
    const ds = designs.filter((d) => (d.data?.kind ?? 'block_diagram') === kind);
    if (!ds.length && !['block_diagram', 'calculation', 'schematic'].includes(kind)) continue;
    ch3.push(next(title));
    if (!ds.length) ch3.push(missing(title.toLowerCase()));
    for (const d of ds) ch3.push({ kind: 'paragraph', text: `${d.title}. ${d.content}`.trim(), refs: [d.id] });
  }
  ch3.push(next('Component Selection'));
  if (!comps.length) ch3.push(missing('component selection with rationale'));
  else ch3.push({ kind: 'list', text: '', refs: comps.map((c) => c.id), items: comps.map((c) => ({ text: `**${c.title}${c.data?.part ? ` (${c.data.part})` : ''}** — ${c.content || '[MISSING: why this part was chosen]'}`, refs: [c.id] })) });
  ch3.push(next('Bill of Materials and Cost'));
  if (!comps.length) ch3.push(missing('bill of materials'));
  else {
    ch3.push({
      kind: 'list',
      text: '',
      refs: comps.map((c) => c.id),
      items: comps.map((c) => {
        const qty = Number(c.data?.qty) || 0;
        const unit = Number(c.data?.unit_cost);
        return { text: `${c.title}${c.data?.part ? ` (${c.data.part})` : ''} — qty ${qty || '?'} × ${Number.isFinite(unit) && String(c.data?.unit_cost ?? '') !== '' ? unit.toLocaleString() : '?'} = ${qty && Number.isFinite(unit) ? (qty * unit).toLocaleString() : '?'}`, refs: [c.id] };
      }),
    });
    ch3.push({ kind: 'paragraph', text: `Total estimated cost: ${g.bomTotal().toLocaleString()}.`, refs: comps.map((c) => c.id) });
  }

  const ch4: ReportBlock[] = [heading('4.1 Construction')];
  const builds = g.ofType('experiment');
  if (!builds.length) ch4.push(missing('construction / prototype build description'));
  for (const b of builds) ch4.push({ kind: 'paragraph', text: `${b.title}. ${b.content}`.trim(), refs: [b.id] });
  ch4.push(heading('4.2 Testing Against Specifications'));
  if (!reqs.length) ch4.push(missing('requirements to test against'));
  else {
    ch4.push({
      kind: 'list',
      text: '',
      refs: reqs.map((r) => r.id),
      items: reqs.map((r) => {
        const ts = g.children(r.id, 'test');
        if (!ts.length) return { text: `**${nodeRef(r)} ${r.title}** (target ${spec(r)}) — [MISSING: test]`, refs: [r.id] };
        const t = ts[0];
        const status = String(t.data?.status ?? 'planned').toUpperCase();
        return {
          text: `**${nodeRef(r)} ${r.title}** (target ${spec(r)}) — ${t.title}: measured ${t.data?.measured || '[MISSING: measured value]'} → **${status}**`,
          refs: [r.id, ...ts.map((x) => x.id)],
        };
      }),
    });
  }
  const orphanTests = tests.filter((t) => !g.parents(t.id, 'requirement').length);
  for (const t of orphanTests) ch4.push({ kind: 'paragraph', text: `${t.title}: ${t.data?.measured || 'not measured'}.`, refs: [t.id] });
  ch4.push(heading('4.3 Results and Discussion'));
  const results = g.ofType('result');
  if (!results.length) ch4.push(missing('discussion of results against the specifications'));
  for (const r of results) ch4.push({ kind: 'paragraph', text: r.content || r.title, refs: [r.id] });
  const lims = g.ofType('limitation');
  if (lims.length) {
    ch4.push(heading('4.4 Limitations'));
    ch4.push({ kind: 'list', text: '', refs: lims.map((l) => l.id), items: lims.map((l) => ({ text: l.content ? `**${l.title}.** ${l.content}` : l.title, refs: [l.id] })) });
  }
  return { ch3, ch4 };
}
