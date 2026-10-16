import { useState, type FormEvent, type InputHTMLAttributes } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ApiError, describeError } from '../api/client';
import { LiveRegion } from '../components/ui';
import { Brand } from '../components/Brand';
import { Icon } from '../components/Icon';
import { useAuth } from '../state/AuthContext';

function PasswordInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="password-input">
      <input {...props} type={visible ? 'text' : 'password'} />
      <button
        type="button"
        className="btn btn--ghost"
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        aria-controls={props.id}
        title={visible ? 'Hide password' : 'Show password'}
        onClick={() => setVisible(value => !value)}
      >
        <Icon name={visible ? 'hidden' : 'eye'} />
      </button>
    </div>
  );
}

function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="auth-layout">
      <div className="container" style={{ display: 'grid', placeItems: 'center' }}>
        <section className="card-glass auth-card" aria-labelledby="auth-title">
          <Brand className="brand--auth" />
          <div>
            <h1 id="auth-title" style={{ fontSize: 'var(--text-xl)' }}>
              {title}
            </h1>
            <p className="muted">{subtitle}</p>
          </div>
          {children}
        </section>
      </div>
    </div>
  );
}

// "/" is the public showcase, so signing in with no pending destination lands on the catalogue.
function useRedirectTarget(): string {
  const location = useLocation();
  const state = location.state as { from?: string } | null;
  return state?.from && state.from !== '/' && state.from.startsWith('/') && !state.from.startsWith('//')
    ? state.from : '/products';
}

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const target = useRedirectTarget();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={target} replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      await login(email.trim(), password);
      navigate(target, { replace: true });
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.isUnauthorized
          ? 'Invalid email or password.'
          : describeError(caught)
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Sign in" subtitle="Use your NineCube account to continue.">
      <form className="stack" onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="login-email">Email</label>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="login-password">Password</label>
          <PasswordInput
            id="login-password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>

        {error ? (
          <p role="alert" style={{ color: 'var(--danger)', fontWeight: 600 }}>
            {error}
          </p>
        ) : null}

        <button type="submit" className="btn btn--primary" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>

        <LiveRegion message={busy ? 'Signing in' : ''} />
      </form>

      <p className="muted">
        New customer? <Link to="/register">Create an account</Link>.
      </p>
    </AuthShell>
  );
}

export function RegisterPage() {
  const { user, register } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/products" replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      await register(email.trim(), password, name.trim());
      navigate('/products', { replace: true });
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title="Create your account"
      subtitle="Registration always creates a customer account. Staff, inventory and administrator roles are assigned by an administrator."
    >
      <form className="stack" onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="register-name">Full name</label>
          <input id="register-name" required value={name} onChange={(event) => setName(event.target.value)} />
        </div>

        <div className="field">
          <label htmlFor="register-email">Email</label>
          <input
            id="register-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="register-password">Password</label>
          <PasswordInput
            id="register-password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <span className="hint">At least 8 characters.</span>
        </div>

        {error ? (
          <p role="alert" style={{ color: 'var(--danger)', fontWeight: 600 }}>
            {error}
          </p>
        ) : null}

        <button type="submit" className="btn btn--primary" disabled={busy}>
          {busy ? 'Creating account…' : 'Create account'}
        </button>

        <LiveRegion message={busy ? 'Creating your account' : ''} />
      </form>

      <p className="muted">
        Already registered? <Link to="/login">Sign in</Link>.
      </p>
    </AuthShell>
  );
}
