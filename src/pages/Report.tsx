import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type ReportChapter } from '../api';
import { useProject } from '../project';
import { Md, Spinner } from '../ui';
import { SectionBadge } from '../sections';

export default function Report() {
  const { project, graph, openNode } = useProject();
  const [chapters, setChapters] = useState<ReportChapter[] | null>(null);
  useEffect(() => {
    api.report(project.id).then(setChapters);
  }, [project.id, graph]);

  const missing = chapters?.flatMap((c) => c.blocks).filter((b) => b.kind === 'missing' || b.items?.some((i) => i.text.includes('[MISSING'))).length ?? 0;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title"><SectionBadge id="report" />Report</h1>
          <p>
            The document is an output — this draft is compiled from your project model, so it is always consistent with it. Click any paragraph to open the component it came from. Use the <Link to={`/p/${project.id}/writing`}>Writing Assistant</Link> to turn it into polished prose.
          </p>
        </div>
        <a className="btn" href={`/api/projects/${project.id}/report?format=md`}>Export Markdown</a>
      </div>
      {missing > 0 && <div className="warn-box" style={{ marginBottom: 16 }}>{missing} gap(s) marked <b>[MISSING]</b> — these need project content before the report can be complete.</div>}
      {!chapters ? (
        <Spinner />
      ) : (
        <div className="card card-pad" style={{ padding: '32px 40px' }}>
          <article className="report">
            <h1 style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: 26, textAlign: 'center' }}>{project.title}</h1>
            <p style={{ textAlign: 'center', color: 'var(--ink-3)', fontSize: 14 }}>{[project.department, project.institution].filter(Boolean).join(' · ')}</p>
            {chapters.map((ch) => (
              <section key={ch.title}>
                <h2>{ch.title}</h2>
                {ch.blocks.map((b, i) => {
                  if (b.kind === 'heading') return <h3 key={i}>{b.text}</h3>;
                  if (b.kind === 'missing') return <div key={i}><span className="missing">{b.text}</span></div>;
                  if (b.kind === 'list')
                    return (
                      <ul key={i}>
                        {b.items?.map((it, j) => (
                          <li key={j} className="traced" onClick={() => it.refs[0] && openNode(it.refs[0])} title="Open source component">
                            <Md text={it.text} inlineOnly />
                          </li>
                        ))}
                      </ul>
                    );
                  return (
                    <p key={i} className="traced" onClick={() => b.refs[0] && openNode(b.refs[0])} title="Open source component">
                      {b.text}
                    </p>
                  );
                })}
              </section>
            ))}
          </article>
        </div>
      )}
    </div>
  );
}
