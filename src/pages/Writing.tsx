import { useEffect, useRef, useState } from 'react';
import { NODE_LABELS, nodeRef, type AssistantReply, type Segment, type SuggestedEdit } from '../../shared/model';
import { api } from '../api';
import { Refs, useProject } from '../project';
import { Md, Spinner, useAction } from '../ui';

const MODES: [string, string, string][] = [
  ['ask', 'Ask', 'Where did this come from? What does my method need?'],
  ['outline', 'Outline', 'Outline Chapter 3 from my blueprint'],
  ['draft', 'Draft section', 'Draft section 1.2 (statement of the problem)'],
  ['rewrite', 'Rewrite', 'Paste a paragraph to rewrite in academic tone'],
  ['critique', 'Critique', 'Paste a paragraph for critique against your project record'],
  ['explain', 'Explain', 'Explain stratified sampling and whether it fits my project'],
  ['summarize', 'Summarise', 'Summarise my literature on the research gap'],
  ['transitions', 'Transitions', 'Connect my problem statement to my objectives'],
];

const BASIS_LABEL: Record<Segment['basis'], string> = {
  project: 'From your project',
  source: 'From a source',
  user: 'What you wrote',
  ai_inference: 'AI inference',
  ai_suggestion: 'AI suggestion',
};

type Msg = { role: 'user'; content: string; mode: string } | { role: 'assistant'; reply: AssistantReply };

export default function Writing() {
  const { project, llm } = useProject();
  const storeKey = `pc-chat-${project.id}`;
  const [msgs, setMsgs] = useState<Msg[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(storeKey) ?? '[]');
    } catch {
      return [];
    }
  });
  const [mode, setMode] = useState('ask');
  const [text, setText] = useState('');
  const [trace, setTrace] = useState(true);
  const { busy, run } = useAction();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(storeKey, JSON.stringify(msgs.slice(-40)));
    } catch {
      /* storage unavailable — chat just won't persist */
    }
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs, storeKey]);

  const send = () =>
    run('send', async () => {
      const message = text.trim();
      if (!message) return;
      const history = msgs.map((m) => (m.role === 'user' ? { role: 'user', content: m.content } : { role: 'assistant', content: m.reply.segments.map((s) => s.text).join(' ') }));
      setMsgs((m) => [...m, { role: 'user', content: message, mode }]);
      setText('');
      const reply = await api.assist(project.id, mode, message, history);
      setMsgs((m) => [...m, { role: 'assistant', reply }]);
    });

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <div className="page-head">
        <div>
          <h1>Writing Assistant</h1>
          <p>Works from your structured project, not generic text. Every statement is labelled by where it came from, and anything that changes your project is a suggestion you must accept.</p>
        </div>
        <div className="stack-sm" style={{ alignItems: 'flex-end' }}>
          <label className="row small muted" style={{ gap: 6 }}>
            <input type="checkbox" checked={trace} onChange={(e) => setTrace(e.target.checked)} /> Highlight sources
          </label>
          {msgs.length > 0 && <button className="btn sm ghost" onClick={() => setMsgs([])}>Clear conversation</button>}
        </div>
      </div>

      {trace && (
        <div className="legend" style={{ marginBottom: 12 }}>
          {(['project', 'user', 'ai_inference', 'ai_suggestion'] as const).map((b) => (
            <span key={b}><span className={`seg ${b}`} style={{ padding: '0 8px' }}>&nbsp;</span> {BASIS_LABEL[b]}{b === 'project' ? ' / source' : ''}</span>
          ))}
        </div>
      )}

      <div className="chat grow" style={{ marginBottom: 16 }}>
        {msgs.length === 0 && (
          <div className="empty">
            Try: “Where did the claim that existing models perform poorly come from?” or “Draft section 1.2 using my problem and gap.” Missing content is marked <code>[MISSING: …]</code> instead of being invented.
          </div>
        )}
        {msgs.map((m, i) =>
          m.role === 'user' ? (
            <div key={i} className="msg user">
              <div className="tiny" style={{ opacity: 0.75, marginBottom: 2 }}>{MODES.find((x) => x[0] === m.mode)?.[1]}</div>
              {m.content}
            </div>
          ) : (
            <AssistantMsg key={i} reply={m.reply} trace={trace} />
          ),
        )}
        {busy && <div className="msg assistant"><div className="body faint"><Spinner /> Reading your project…</div></div>}
        <div ref={endRef} />
      </div>

      <div className="card card-pad stack-sm" style={{ position: 'sticky', bottom: 12 }}>
        <div className="row wrap" style={{ gap: 4 }}>
          {MODES.map(([k, label]) => (
            <button key={k} className={`btn sm${mode === k ? ' primary' : ''}`} onClick={() => setMode(k)}>{label}</button>
          ))}
        </div>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <textarea
            rows={mode === 'rewrite' || mode === 'critique' ? 5 : 2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={MODES.find((x) => x[0] === mode)?.[2]}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send();
            }}
          />
          <button className="btn primary" onClick={send} disabled={!!busy || !text.trim() || !llm} style={{ height: 40 }}>Send</button>
        </div>
        <div className="tiny faint"><span className="kbd">Ctrl</span> + <span className="kbd">Enter</span> to send</div>
      </div>
    </div>
  );
}

function AssistantMsg({ reply, trace }: { reply: AssistantReply; trace: boolean }) {
  const traced = reply.segments.filter((s) => s.refs.length).length;
  return (
    <div className="msg assistant">
      <div className="body">
        {reply.segments.map((s, i) => (
          <div key={i} className={trace ? `seg ${s.basis}` : undefined} style={{ marginBottom: 6, padding: trace ? '2px 6px' : 0 }} title={BASIS_LABEL[s.basis]}>
            <Md text={s.text} />
            {s.refs.length > 0 && (
              <div style={{ marginTop: 2 }}>
                <Refs ids={s.refs} />
              </div>
            )}
          </div>
        ))}
        {!reply.segments.length && <span className="faint">(no answer)</span>}
      </div>
      <div className="tiny faint" style={{ marginTop: 4 }}>
        {traced}/{reply.segments.length} statement(s) traced to your project · statements without references are AI reasoning, not established fact
      </div>
      {reply.suggested_edits.length > 0 && (
        <div className="stack-sm" style={{ marginTop: 8 }}>
          {reply.suggested_edits.map((e, i) => <SuggestedEditCard key={i} edit={e} />)}
        </div>
      )}
    </div>
  );
}

function SuggestedEditCard({ edit }: { edit: SuggestedEdit }) {
  const { project, byId, refresh } = useProject();
  const { busy, run } = useAction();
  const [state, setState] = useState<'pending' | 'applied' | 'dismissed'>('pending');
  const [content, setContent] = useState(edit.content);
  const target = edit.node_id ? byId.get(edit.node_id) : undefined;
  if (state === 'dismissed') return null;
  return (
    <div className="node-card suggested">
      <div className="row between">
        <span className="small bold">
          Suggested {target ? <>edit to <span className="ref">{nodeRef(target)}</span></> : <>new {NODE_LABELS[edit.type].toLowerCase()}</>}
        </span>
        <span className="prov ai_suggestion">AI suggestion</span>
      </div>
      {edit.title && <div className="bold small" style={{ marginTop: 4 }}>{edit.title}</div>}
      {target && <div className="tiny faint" style={{ marginTop: 4 }}>Current: {target.content || target.title}</div>}
      {state === 'pending' ? (
        <textarea rows={3} style={{ marginTop: 6 }} value={content} onChange={(e) => setContent(e.target.value)} />
      ) : (
        <div className="small" style={{ marginTop: 6 }}>{content}</div>
      )}
      <div className="tiny muted" style={{ marginTop: 4 }}>{edit.reason}</div>
      {state === 'pending' ? (
        <div className="row" style={{ marginTop: 8, justifyContent: 'flex-end' }}>
          <button className="btn sm" onClick={() => setState('dismissed')}>Dismiss</button>
          <button
            className="btn sm primary"
            disabled={!!busy}
            onClick={() =>
              run('apply', async () => {
                await api.applyEdit(project.id, { node_id: edit.node_id, type: edit.type, title: edit.title, content });
                await refresh();
                setState('applied');
              }, target ? 'Applied — previous version kept in history' : 'Added to your project')
            }
          >
            Accept into project
          </button>
        </div>
      ) : (
        <div className="badge ok" style={{ marginTop: 8 }}>Accepted</div>
      )}
    </div>
  );
}
