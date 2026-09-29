import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, type User } from './api';
import { Spinner } from './ui';
import { Icon } from './sections';

interface AuthCtx {
  user: User;
  signOut: () => Promise<void>;
}
const Ctx = createContext<AuthCtx | null>(null);
export const useAuth = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth outside AuthGate');
  return c;
};

/** Renders the app only for a signed-in user; otherwise the sign-in screen. */
export function AuthGate({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    api.me().then(setUser).catch(() => setUser(null));
    const onSignedOut = () => setUser(null);
    window.addEventListener('pc-signed-out', onSignedOut);
    return () => window.removeEventListener('pc-signed-out', onSignedOut);
  }, []);

  const signOut = useCallback(async () => {
    await api.logout().catch(() => {});
    setUser(null);
  }, []);

  if (user === undefined) return <div className="page faint"><Spinner /></div>;
  if (!user) return <SignIn onSignedIn={setUser} />;
  return <Ctx.Provider value={{ user, signOut }}>{children}</Ctx.Provider>;
}

// Seeded by `npm run seed`; lets judges and first-time visitors explore a realistic project in one click.
const DEMO = { email: 'demo@projectcompiler.local', password: 'demo-password' };

const CHAIN: { label: string; color: string; flag?: boolean }[] = [
  { label: 'Problem', color: '#f87171' },
  { label: 'Research gap', color: '#fbbf24' },
  { label: 'Objectives', color: '#60a5fa' },
  { label: 'Method', color: '#a78bfa', flag: true },
  { label: 'Evidence', color: '#34d399' },
  { label: 'Results', color: '#38bdf8' },
  { label: 'Conclusion', color: '#4ade80' },
  { label: 'Defense', color: '#f472b6' },
];

const STRENGTH = [
  { label: 'At least 8 characters', color: 'var(--crit)' },
  { label: 'Weak', color: 'var(--crit)' },
  { label: 'Fair', color: 'var(--warn)' },
  { label: 'Good', color: 'var(--ok)' },
  { label: 'Strong', color: 'var(--ok)' },
];

function passwordStrength(pw: string) {
  if (pw.length < 8) return { score: 0, ...STRENGTH[0] };
  let score = 1;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
  return { score, ...STRENGTH[score] };
}

function SignIn({ onSignedIn }: { onSignedIn: (u: User) => void }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [f, setF] = useState({ email: '', name: '', password: '' });
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'form' | 'demo' | null>(null);
  const strength = passwordStrength(f.password);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy('form');
    setError(null);
    try {
      onSignedIn(mode === 'login' ? await api.login(f.email, f.password) : await api.signup(f.email, f.name, f.password));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  const tryDemo = async () => {
    setBusy('demo');
    setError(null);
    try {
      onSignedIn(await api.login(DEMO.email, DEMO.password));
    } catch {
      setError('The demo account is not available on this server. Create an account instead — it takes 10 seconds.');
    } finally {
      setBusy(null);
    }
  };

  const switchMode = (m: 'login' | 'signup') => {
    setMode(m);
    setError(null);
  };

  return (
    <div className="auth">
      <section className="auth-hero">
        <div className="row" style={{ gap: 10 }}>
          <div className="brand-mark">PC</div>
          <div className="bold" style={{ fontSize: 15 }}>Project Compiler</div>
        </div>
        <div>
          <h1>
            From idea to <span>defensible research.</span>
          </h1>
          <p className="lead">
            We don't write your final-year project. We map it, check every link from problem to conclusion, and make sure you can defend it.
          </p>
          <div className="chain" style={{ marginTop: 26 }} aria-label="The research chain Project Compiler checks">
            {CHAIN.map((c, i) => (
              <span key={c.label} className="row" style={{ gap: 6 }}>
                <span className={`step${c.flag ? ' flag' : ''}`} title={c.flag ? 'Example: a method that does not answer its objective' : undefined}>
                  <i style={{ background: c.color }} />
                  {c.label}
                  {c.flag && <span style={{ color: '#fca5a5' }}>⚠</span>}
                </span>
                {i < CHAIN.length - 1 && <span className="arrow">→</span>}
              </span>
            ))}
          </div>
        </div>
        <div className="hero-points">
          <div>
            <Icon name="shield" size={16} />
            <span>
              <b>Catches what examiners catch</b> — a method that can't answer its objective, a gap the literature already filled, a claim with no evidence.
            </span>
          </div>
          <div>
            <Icon name="graph" size={16} />
            <span>
              <b>Every statement is traceable</b> to your sources and project components. AI suggestions are clearly labelled and never applied silently.
            </span>
          </div>
          <div>
            <Icon name="mic" size={16} />
            <span>
              <b>Rehearse your defense</b> with questions generated from your own project's weak spots.
            </span>
          </div>
        </div>
        <div className="auth-foot">Your projects are private to your account.</div>
      </section>

      <section className="auth-panel">
        <form className="auth-card stack" onSubmit={submit} noValidate style={{ gap: 16 }}>
          <div>
            <h2>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
            <p className="sub">{mode === 'login' ? 'Sign in to continue your project.' : 'Free for students. Start with a rough idea — we will help you sharpen it.'}</p>
          </div>

          <div className="seg" role="tablist">
            <button type="button" role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'on' : ''} onClick={() => switchMode('login')}>
              Sign in
            </button>
            <button type="button" role="tab" aria-selected={mode === 'signup'} className={mode === 'signup' ? 'on' : ''} onClick={() => switchMode('signup')}>
              Create account
            </button>
          </div>

          {mode === 'signup' && (
            <label className="field">
              Full name
              <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" placeholder="e.g. Amina Bello" />
            </label>
          )}
          <label className="field">
            Email
            <input
              type="email"
              required
              value={f.email}
              onChange={(e) => setF({ ...f, email: e.target.value })}
              autoComplete="email"
              autoFocus
              placeholder="you@university.edu.ng"
            />
          </label>
          <label className="field">
            Password
            <span className="pw-wrap">
              <input
                type={showPw ? 'text' : 'password'}
                required
                value={f.password}
                onChange={(e) => setF({ ...f, password: e.target.value })}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                placeholder={mode === 'signup' ? 'At least 8 characters' : 'Your password'}
              />
              <button type="button" onClick={() => setShowPw(!showPw)} aria-label={showPw ? 'Hide password' : 'Show password'} title={showPw ? 'Hide password' : 'Show password'}>
                <Icon name={showPw ? 'eyeOff' : 'eye'} size={17} />
              </button>
            </span>
            {mode === 'signup' && f.password && (
              <span className="stack-sm" style={{ gap: 4, fontWeight: 500 }}>
                <span className="strength">
                  {[1, 2, 3, 4].map((i) => (
                    <i key={i} style={{ background: i <= strength.score ? strength.color : undefined }} />
                  ))}
                </span>
                <span className="tiny" style={{ color: strength.color }}>{strength.label}</span>
              </span>
            )}
          </label>

          {error && (
            <div className="error-box" role="alert">
              {error}
            </div>
          )}

          <button className="btn lg grad" disabled={!!busy}>
            {busy === 'form' ? <Spinner /> : null} {mode === 'login' ? 'Sign in' : 'Create account'}
          </button>

          <div className="or">or</div>

          <button type="button" className="btn lg demo-btn" onClick={tryDemo} disabled={!!busy}>
            {busy === 'demo' ? <Spinner /> : <Icon name="sparkle" size={17} />} Explore the demo project
          </button>
          <p className="tiny faint" style={{ textAlign: 'center', marginTop: -6 }}>
            Opens a sample final-year project with real flaws for the integrity engine to find.
          </p>
        </form>
      </section>
    </div>
  );
}

export function UserMenu() {
  const { user, signOut } = useAuth();
  return (
    <div className="row" style={{ margin: 'auto 12px 14px', padding: '10px', borderTop: '1px solid var(--line)', gap: 8 }}>
      <div className="grow">
        <div className="small bold" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.name || user.email}</div>
        {user.name && <div className="tiny faint" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.email}</div>}
      </div>
      <button className="btn sm ghost" onClick={signOut} title="Sign out">
        <Icon name="logout" size={15} /> Sign out
      </button>
    </div>
  );
}
