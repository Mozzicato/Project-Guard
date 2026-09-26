import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, type User } from './api';
import { Spinner } from './ui';

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

function SignIn({ onSignedIn }: { onSignedIn: (u: User) => void }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [f, setF] = useState({ email: '', name: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onSignedIn(mode === 'login' ? await api.login(f.email, f.password) : await api.signup(f.email, f.name, f.password));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: '100%', display: 'grid', placeItems: 'center', padding: 16 }}>
      <form className="card" onSubmit={submit} style={{ width: 'min(400px, 100%)' }}>
        <div className="card-pad stack">
          <div className="row" style={{ gap: 10 }}>
            <div className="brand-mark">PC</div>
            <div>
              <div className="brand-name">Project Compiler</div>
              <div className="brand-tag">From idea to defensible research</div>
            </div>
          </div>
          <h2>{mode === 'login' ? 'Sign in' : 'Create your account'}</h2>
          {mode === 'signup' && (
            <label className="field">
              Name
              <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" />
            </label>
          )}
          <label className="field">
            Email
            <input type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" autoFocus />
          </label>
          <label className="field">
            Password
            <input
              type="password"
              required
              minLength={mode === 'signup' ? 8 : undefined}
              value={f.password}
              onChange={(e) => setF({ ...f, password: e.target.value })}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              placeholder={mode === 'signup' ? 'At least 8 characters' : undefined}
            />
          </label>
          {error && <div className="error-box">{error}</div>}
          <button className="btn primary" disabled={busy} style={{ height: 38 }}>
            {busy ? <Spinner /> : null} {mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
          <div className="small muted" style={{ textAlign: 'center' }}>
            {mode === 'login' ? 'New here? ' : 'Already have an account? '}
            <a href="#" onClick={(e) => { e.preventDefault(); setMode(mode === 'login' ? 'signup' : 'login'); setError(null); }}>
              {mode === 'login' ? 'Create an account' : 'Sign in'}
            </a>
          </div>
        </div>
      </form>
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
      <button className="btn sm ghost" onClick={signOut}>Sign out</button>
    </div>
  );
}
