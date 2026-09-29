import { useEffect, useState } from 'react';
import { NavLink, Route, Routes, useParams, Link, useLocation } from 'react-router-dom';
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
import Requirements from './pages/Requirements';
import Design from './pages/Design';
import Testing from './pages/Testing';
import { titleCase } from './ui';
import { AuthGate, UserMenu } from './auth';
import { Celebration, ContinueBar, StepHero, useJourney } from './journey';
import { Icon, SECTIONS, sectionFromPath, type SectionId } from './sections';

export default function App() {
  const [llm, setLlm] = useState(true);
  useEffect(() => {
    api.health().then((h) => setLlm(h.llm)).catch(() => setLlm(false));
  }, []);
  return (
    <AuthGate>
      <Routes>
        <Route path="/" element={<Shell><Projects /></Shell>} />
        <Route path="/p/:pid/*" element={<ProjectRoutes llm={llm} />} />
      </Routes>
    </AuthGate>
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
          <NavLink to="/" end style={{ ['--sec' as any]: SECTIONS.projects.color }}>
            <span className="nav-ico"><Icon name="folder" size={15} /></span>
            Projects
          </NavLink>
        </nav>
        <UserMenu />
      </aside>
      <SectionMain>{children}</SectionMain>
    </div>
  );
}

function ProjectRoutes({ llm }: { llm: boolean }) {
  const pid = Number(useParams().pid);
  return (
    <ProjectProvider id={pid} llm={llm}>
      <div className="app">
        <ProjectSidebar />
        <SectionMain>
          {!llm && (
            <div className="warn-box" style={{ borderRadius: 0 }}>
              No AI provider is configured — structural checks work, but AI analysis is unavailable. Add GEMINI_API_KEY or GROQ_API_KEY to .env.
            </div>
          )}
          <JourneyChrome>
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
              <Route path="requirements" element={<Requirements />} />
              <Route path="design" element={<Design />} />
              <Route path="testing" element={<Testing />} />
            </Routes>
          </JourneyChrome>
        </SectionMain>
      </div>
    </ProjectProvider>
  );
}

/** On a journey step's page: the step banner with its tasks above the page, and the Continue bar below. */
function JourneyChrome({ children }: { children: React.ReactNode }) {
  const id = sectionFromPath(useLocation().pathname);
  const { steps } = useJourney();
  const { project } = useProject();
  const isStep = steps.some((s) => s.id === id);
  return (
    <div className={isStep ? 'is-step' : undefined}>
      {isStep && (
        <div className={`hero-wrap${id === 'graph' ? ' wide' : ''}`}>
          <StepHero section={id} />
        </div>
      )}
      {children}
      {isStep && <ContinueBar section={id} />}
      {/* Keyed by project so switching projects never counts as "completing" steps. */}
      <Celebration key={project.id} />
    </div>
  );
}

function ProjectSidebar() {
  const { project, graph } = useProject();
  const { steps, current, doneCount, total } = useJourney();
  const base = `/p/${project.id}`;
  const suggested = graph.nodes.filter((n) => n.status === 'suggested').length;
  const unsupported = Object.values(graph.claimStatus).filter((b) => !b).length;
  const badge: Partial<Record<SectionId, React.ReactNode>> = {
    blueprint: suggested ? <span className="pill warn" title={`${suggested} AI suggestion(s) to review`}>{suggested} new</span> : null,
    evidence: unsupported ? <span className="pill crit" title={`${unsupported} claim(s) with no evidence`}>{unsupported}</span> : null,
    feedback: graph.meta?.feedback_open ? <span className="pill warn" title="Open supervisor feedback">{graph.meta.feedback_open}</span> : null,
  };
  const tool = (id: SectionId) => {
    const s = SECTIONS[id];
    return (
      <NavLink to={`${base}${s.path}`} end={s.path === ''} style={{ ['--sec' as any]: s.color }}>
        <span className="nav-ico"><Icon name={s.icon} size={15} /></span>
        {id === 'overview' ? 'Home' : s.label}
        {badge[id]}
      </NavLink>
    );
  };
  return (
    <aside className="sidebar">
      <Brand />
      <div className="side-project">
        <div className="t">{project.title}</div>
        <div className="s">{[project.track === 'hardware' ? 'Hardware build' : 'Research', project.discipline].filter(Boolean).join(' · ')}</div>
        <div className="side-progress" title={`${doneCount} of ${total} steps done`}>
          <div style={{ width: `${(doneCount / total) * 100}%` }} />
        </div>
      </div>
      <nav className="nav">
        {tool('overview')}
        <div className="nav-group">Your path · {doneCount}/{total}</div>
        {steps.map((st) => (
          <NavLink
            key={st.n}
            to={`${base}${SECTIONS[st.id].path}`}
            className={`path-item${st.done ? ' done' : ''}${current?.n === st.n ? ' current' : ''}`}
            style={{ ['--sec' as any]: SECTIONS[st.id].color }}
            title={st.status}
          >
            <span className="path-num">{st.done ? <Icon name="check" size={13} /> : st.n}</span>
            {st.title}
            {badge[st.id] ?? (current?.n === st.n ? <span className="next-dot" title="Your next step" /> : null)}
          </NavLink>
        ))}
        <div className="nav-group">Tools</div>
        {project.track === 'hardware' && tool('blueprint')}
        {project.track === 'hardware' && tool('evidence')}
        {tool('graph')}
        {tool('feedback')}
        {tool('writing')}
        {tool('report')}
      </nav>
      <UserMenu />
    </aside>
  );
}

/** Main column tinted with the current section's color (page header, tabs, primary buttons pick it up). */
function SectionMain({ children }: { children: React.ReactNode }) {
  const id = sectionFromPath(useLocation().pathname);
  return (
    <main className="main" data-section={id} style={{ ['--sec' as any]: SECTIONS[id].color }}>
      {children}
    </main>
  );
}
