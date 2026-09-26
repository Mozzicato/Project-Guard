import { useEffect, useState } from 'react';
import { NavLink, Route, Routes, useParams, Link } from 'react-router-dom';
import { api } from './api';
import { ProjectProvider, useProject } from './project';
import Projects from './pages/Projects';
import Overview from './pages/Overview';
import IdeaLab from './pages/IdeaLab';
import Blueprint from './pages/Blueprint';
import Research from './pages/Research';
import Evidence from './pages/Evidence';
import GraphView from './pages/GraphView';
import Integrity from './pages/Integrity';
import Writing from './pages/Writing';
import FeedbackPage from './pages/Feedback';
import Defense from './pages/Defense';
import Report from './pages/Report';
import { titleCase } from './ui';

export default function App() {
  const [llm, setLlm] = useState(true);
  useEffect(() => {
    api.health().then((h) => setLlm(h.llm)).catch(() => setLlm(false));
  }, []);
  return (
    <Routes>
      <Route path="/" element={<Shell><Projects /></Shell>} />
      <Route path="/p/:pid/*" element={<ProjectRoutes llm={llm} />} />
    </Routes>
  );
}

function Brand() {
  return (
    <Link to="/" className="brand" style={{ textDecoration: 'none', color: 'inherit' }}>
      <div className="brand-mark">PC</div>
      <div>
        <div className="brand-name">Project Compiler</div>
        <div className="brand-tag">From idea to defensible research</div>
      </div>
    </Link>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app">
      <aside className="sidebar">
        <Brand />
        <nav className="nav">
          <NavLink to="/" end>Projects</NavLink>
        </nav>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}

function ProjectRoutes({ llm }: { llm: boolean }) {
  const pid = Number(useParams().pid);
  return (
    <ProjectProvider id={pid} llm={llm}>
      <div className="app">
        <ProjectSidebar />
        <main className="main">
          {!llm && (
            <div className="warn-box" style={{ borderRadius: 0 }}>
              No AI provider is configured — structural checks work, but AI analysis is unavailable. Add GEMINI_API_KEY or GROQ_API_KEY to .env.
            </div>
          )}
          <Routes>
            <Route index element={<Overview />} />
            <Route path="idea" element={<IdeaLab />} />
            <Route path="blueprint" element={<Blueprint />} />
            <Route path="research" element={<Research />} />
            <Route path="evidence" element={<Evidence />} />
            <Route path="graph" element={<GraphView />} />
            <Route path="check" element={<Integrity />} />
            <Route path="writing" element={<Writing />} />
            <Route path="feedback" element={<FeedbackPage />} />
            <Route path="defense" element={<Defense />} />
            <Route path="report" element={<Report />} />
          </Routes>
        </main>
      </div>
    </ProjectProvider>
  );
}

function ProjectSidebar() {
  const { project, graph } = useProject();
  const base = `/p/${project.id}`;
  const count = (...types: string[]) => graph.nodes.filter((n) => n.status === 'active' && types.includes(n.type)).length;
  const suggested = graph.nodes.filter((n) => n.status === 'suggested').length;
  const unsupported = Object.values(graph.claimStatus).filter((b) => !b).length;
  const item = (to: string, label: string, extra?: React.ReactNode) => (
    <NavLink to={`${base}${to}`} end={to === ''}>
      {label}
      {extra}
    </NavLink>
  );
  const c = (n: number) => (n ? <span className="count">{n}</span> : null);
  return (
    <aside className="sidebar">
      <Brand />
      <div className="side-project">
        <div className="t">{project.title}</div>
        <div className="s">{[project.discipline, titleCase(project.stage)].filter(Boolean).join(' · ')}</div>
      </div>
      <nav className="nav">
        {item('', 'Overview')}
        <div className="nav-group">Build</div>
        {item('/idea', 'Idea Lab')}
        {item('/blueprint', 'Blueprint', suggested ? <span className="count" style={{ color: 'var(--prov-suggestion)' }}>{suggested} new</span> : c(count('objective', 'research_question', 'method')))}
        {item('/research', 'Research', c(count('source')))}
        {item('/evidence', 'Evidence Ledger', unsupported ? <span className="count" style={{ color: 'var(--crit)' }}>{unsupported} unbacked</span> : c(count('claim', 'evidence')))}
        {item('/graph', 'Knowledge Graph')}
        <div className="nav-group">Validate</div>
        {item('/check', 'Project Check')}
        {item('/feedback', 'Supervisor Feedback')}
        {item('/defense', 'Defense Simulator')}
        <div className="nav-group">Write</div>
        {item('/writing', 'Writing Assistant')}
        {item('/report', 'Report')}
      </nav>
    </aside>
  );
}
