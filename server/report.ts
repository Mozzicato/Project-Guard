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
    { title: 'Chapter 3 — Methodology', blocks: ch3 },
    { title: 'Chapter 4 — Results', blocks: ch4 },
    { title: 'Chapter 5 — Conclusion', blocks: ch5 },
    { title: 'References', blocks: refs },
  ];
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
