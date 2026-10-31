import { t, useLanguage } from '../i18n/language';
import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ApiError, describeError } from '../api/client';
import { AuthCard, NeuButton, NeuInput, SocialButtons, type SocialProvider } from '../components/auth/AuthCard';
import { useAuth } from '../state/AuthContext';
import { useForgotPassword, useResetPassword } from '../api/hooks';
import styles from '../components/auth/Auth.module.css';

const EMAIL_KEY = 'ninecube.auth.remembered-email';
function rememberedEmail() {
  try { return localStorage.getItem(EMAIL_KEY) ?? ''; } catch { return ''; }
}

/** Supply password recovery and OAuth integrations here when they are available. */
export interface AuthPageProps {
  onForgotPassword?: (email: string) => void | Promise<void>;
  onSocialAuth?: (provider: SocialProvider) => void | Promise<void>;
}

export function AuthPage({ onForgotPassword, onSocialAuth }: AuthPageProps) {
  useLanguage();
  const { user, login, register } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const signup = location.pathname === '/register';
  const state = location.state as { from?: string } | null;
  const target = state?.from && state.from !== '/' && state.from.startsWith('/') && !state.from.startsWith('//')
    ? state.from : '/products';
  const [email, setEmail] = useState(rememberedEmail);
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [remember, setRemember] = useState(() => Boolean(rememberedEmail()));
  const [blurred, setBlurred] = useState<Record<string, boolean>>({});
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [tooltip, setTooltip] = useState('');
  const previousPath = useRef(location.pathname);

  // Password Recovery Modal State
  const [showRecovery, setShowRecovery] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoveryToken, setRecoveryToken] = useState('');
  const [recoveryNewPassword, setRecoveryNewPassword] = useState('');
  const [recoveryStep, setRecoveryStep] = useState<'request' | 'reset'>('request');
  const [recoveryNotice, setRecoveryNotice] = useState<string | null>(null);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);

  const forgotPasswordMutation = useForgotPassword();
  const resetPasswordMutation = useResetPassword();

  const handleRequestToken = async (e: FormEvent) => {
    e.preventDefault();
    if (!recoveryEmail.trim()) return;
    setRecoveryError(null);
    setRecoveryNotice(null);
    try {
      const res = await forgotPasswordMutation.mutateAsync(recoveryEmail.trim());
      setRecoveryNotice(res.message);
      if (res.demoResetToken) {
        setRecoveryToken(res.demoResetToken);
      }
      setRecoveryStep('reset');
    } catch (err: any) {
      setRecoveryError(err.message ?? 'Failed to send recovery instructions.');
    }
  };

  const handleResetPassword = async (e: FormEvent) => {
    e.preventDefault();
    if (!recoveryEmail.trim() || !recoveryToken.trim() || !recoveryNewPassword) return;
    setRecoveryError(null);
    setRecoveryNotice(null);
    try {
      const res = await resetPasswordMutation.mutateAsync({
        email: recoveryEmail.trim(),
        token: recoveryToken.trim(),
        newPassword: recoveryNewPassword
      });
      setRecoveryNotice(res.message ?? 'Password successfully reset! You can now log in.');
      setTimeout(() => {
        setShowRecovery(false);
        setRecoveryStep('request');
        setRecoveryNotice(null);
        setRecoveryToken('');
        setRecoveryNewPassword('');
      }, 2500);
    } catch (err: any) {
      setRecoveryError(err.message ?? 'Failed to reset password. Please verify your token.');
    }
  };

  useEffect(() => {
    if (previousPath.current === location.pathname) return;
    previousPath.current = location.pathname;
    setSubmitted(false);
    setBlurred({});
    setTooltip('');
    setNotice('');
    setPassword('');
    setConfirmation('');
    // Wait for the incoming panel to become visible before moving keyboard focus.
    const delay = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 550;
    const timer = window.setTimeout(() => {
      document.getElementById(signup ? 'signup-title' : 'login-title')?.focus({ preventScroll: true });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [location.pathname, signup]);

  if (user) return <Navigate to={target} replace />;

  function validation() {
    const result: Record<string, string> = {};
    if (signup && !name.trim()) result.name = 'Please fill in this field.';
    if (!email.trim()) result.email = 'Please fill in this field.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) result.email = 'Please enter a valid email address.';
    if (!password) result.password = 'Please fill in this field.';
    else if (password.length < 8) result.password = 'Use at least 8 characters.';
    if (signup && !confirmation) result.confirmation = 'Please fill in this field.';
    else if (signup && confirmation !== password) result.confirmation = 'Passwords must match.';
    return result;
  }
  const errors = validation();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setSubmitted(true);
    setNotice('');
    const first = Object.keys(validation())[0];
    if (first) {
      setTooltip(first);
      event.currentTarget.querySelector<HTMLInputElement>(`[name="${first}"]`)?.focus();
      return;
    }
    setTooltip('');
    setBusy(true);
    try {
      if (signup) await register(email.trim(), password, name.trim());
      else await login(email.trim(), password);
      try {
        if (remember) localStorage.setItem(EMAIL_KEY, email.trim());
        else localStorage.removeItem(EMAIL_KEY);
      } catch { /* Auth still works when local storage is unavailable. */ }
      navigate(target, { replace: true });
    } catch (caught) {
      setNotice(caught instanceof ApiError && caught.isUnauthorized ? 'Invalid email or password.' : describeError(caught));
    } finally { setBusy(false); }
  }

  async function integration(action: () => void | Promise<void>) {
    setBusy(true);
    setNotice('');
    try { await action(); } catch (caught) { setNotice(describeError(caught)); }
    finally { setBusy(false); }
  }

  function switchView(event: MouseEvent<HTMLAnchorElement>) {
    if (busy) event.preventDefault();
  }

  const field = (key: string, label: string, value: string, update: (value: string) => void, mode: 'login' | 'signup', type = 'text') => (
    <NeuInput key={key} id={`${mode}-${key}`} name={key} label={t(label)} type={type} value={value}
      onChange={event => { update(event.target.value); setTooltip(''); }}
      autoComplete={key === 'name' ? 'name' : key === 'email' ? 'email' : mode === 'signup' ? 'new-password' : 'current-password'}
      maxLength={key === 'name' ? 200 : key === 'email' ? 256 : 128}
      minLength={type === 'password' ? 8 : undefined} required disabled={busy}
      error={mode === (signup ? 'signup' : 'login') && (submitted || blurred[key]) ? errors[key] : undefined}
      tooltip={tooltip === key && errors[key] === 'Please fill in this field.' && mode === (signup ? 'signup' : 'login')}
      onBlur={() => { if (value) setBlurred(previous => ({ ...previous, [key]: true })); }} />
  );

  return (
    <AuthCard signup={signup}>
      <div className={styles.panels}>
        {(['login', 'signup'] as const).map(mode => {
          const registering = mode === 'signup';
          const active = registering === signup;
          return <section key={mode} className={`${styles.panel} ${active ? styles.active : ''}`} aria-hidden={!active}
            {...(!active ? { inert: '' } : {})}>
            <header className={styles.heading}>
              <div className={styles.badge} aria-hidden="true">{registering ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M16 21v-2a5 5 0 0 0-5-5H7a5 5 0 0 0-5 5v2M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8M19 8v6m-3-3h6" /></svg> : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></svg>}</div>
              <p className={styles.eyebrow}>{t("NineCube Digital")}</p>
              <h1 id={`${mode}-title`} tabIndex={-1}>{t(registering ? 'Create Account' : 'Welcome')}</h1>
              <p>{t(registering ? 'Start your journey with us' : 'Login to continue your journey')}</p>
            </header>
            <form onSubmit={submit} noValidate aria-labelledby={`${mode}-title`} aria-busy={busy}>
              <fieldset disabled={busy || !active} className={styles.fields}>
                <legend className="visually-hidden">{t(registering ? 'Sign up details' : 'Login details')}</legend>
                {t(registering && field('name', 'Full Name', name, setName, mode))}
                {t(field('email', 'Email Address', email, setEmail, mode, 'email'))}
                {t(field('password', 'Password', password, setPassword, mode, 'password'))}
                {t(registering && field('confirmation', 'Confirm Password', confirmation, setConfirmation, mode, 'password'))}
                {!registering && <>
                  <div className={styles.options}>
                    <label className={styles.checkbox}><input type="checkbox" checked={remember} aria-describedby="remember-description"
                      onChange={event => {
                        setRemember(event.target.checked);
                        if (!event.target.checked) { try { localStorage.removeItem(EMAIL_KEY); } catch { /* Optional preference. */ } }
                      }} /><span>{t("Remember me")}</span></label>
                    <button type="button" className={styles.textButton} onClick={() => {
                      if (onForgotPassword) {
                        void integration(() => onForgotPassword(email.trim()));
                      } else {
                        setRecoveryEmail(email.trim());
                        setRecoveryError(null);
                        setRecoveryNotice(null);
                        setRecoveryStep('request');
                        setShowRecovery(true);
                      }
                    }}>{t("Forgot Password?")}</button>
                  </div>
                  <p id="remember-description" className={styles.hint}>{t("Remembers your email on this device. Your session ends when you close this tab.")}</p>
                </>}
                <NeuButton busy={busy} valid={Object.keys(errors).length === 0}>
                  {t(busy ? registering ? 'Creating account…' : 'Signing in…' : registering ? 'CREATE ACCOUNT' : 'LOGIN')}
                </NeuButton>
              </fieldset>
            </form>
            <div className={styles.switch}>
              <span>{t(registering ? 'Already have an account?' : "Don't have an account?")}</span>
              <Link to={registering ? '/login' : '/register'} state={state} onClick={switchView}
                aria-label={t(registering ? 'Back to login' : 'Create an account')} aria-disabled={busy}
                tabIndex={busy || !active ? -1 : undefined} className={styles.circle}>{t(registering ? '←' : '+')}</Link>
            </div>
            {!registering && <SocialButtons disabled={busy} onSocialAuth={onSocialAuth ? provider => void integration(() => onSocialAuth(provider)) : undefined} />}
          </section>;
        })}
      </div>
      <p className={styles.notice} role="status" aria-live="polite" aria-atomic="true">{t(notice || (busy ? 'Please wait…' : ''))}</p>

      {/* Self-service password recovery modal */}
      {showRecovery && (
        <div className="sheet-backdrop" onClick={() => setShowRecovery(false)} role="presentation" style={{ zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="card-glass stack" onClick={e => e.stopPropagation()} style={{ width: '90%', maxWidth: '440px', padding: 'var(--space-5)', borderRadius: 'var(--radius-lg, 16px)', background: 'var(--surface-overlay, #18181b)' }} role="dialog" aria-modal="true" aria-labelledby="recovery-title">
            <div className="row-between">
              <h2 id="recovery-title" style={{ fontSize: 'var(--text-lg)', margin: 0 }}>{t("Reset Password")}</h2>
              <button type="button" className="link-button" onClick={() => setShowRecovery(false)} aria-label={t("Close")}>✕</button>
            </div>

            {recoveryStep === 'request' ? (
              <form onSubmit={handleRequestToken} className="stack" style={{ gap: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
                <p className="muted" style={{ fontSize: 'var(--text-sm)', margin: 0 }}>
                  {t("Enter your account email to receive a password reset token.")}
                </p>
                <input
                  type="email"
                  placeholder={t("Your account email")}
                  value={recoveryEmail}
                  onChange={e => setRecoveryEmail(e.target.value)}
                  required
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}
                />
                {recoveryError && <p style={{ color: 'var(--danger)', fontSize: 'var(--text-xs)', margin: 0 }}>{recoveryError}</p>}
                <div className="row" style={{ justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => setShowRecovery(false)}>{t("Cancel")}</button>
                  <button type="submit" className="btn btn--primary btn--sm" disabled={forgotPasswordMutation.isPending || !recoveryEmail.trim()}>
                    {t(forgotPasswordMutation.isPending ? 'Sending…' : 'Send Reset Token')}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleResetPassword} className="stack" style={{ gap: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
                <p className="muted" style={{ fontSize: 'var(--text-sm)', margin: 0 }}>
                  {recoveryNotice ?? t("Enter the reset token sent to your email and your new password.")}
                </p>
                <div>
                  <label style={{ fontSize: 'var(--text-xs)', display: 'block', marginBottom: '4px' }}>{t("Reset Token")}</label>
                  <input
                    type="text"
                    placeholder={t("Paste reset token")}
                    value={recoveryToken}
                    onChange={e => setRecoveryToken(e.target.value)}
                    required
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 'var(--text-xs)', display: 'block', marginBottom: '4px' }}>{t("New Password (min 8 chars)")}</label>
                  <input
                    type="password"
                    placeholder={t("Enter new password")}
                    value={recoveryNewPassword}
                    onChange={e => setRecoveryNewPassword(e.target.value)}
                    minLength={8}
                    required
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}
                  />
                </div>
                {recoveryError && <p style={{ color: 'var(--danger)', fontSize: 'var(--text-xs)', margin: 0 }}>{recoveryError}</p>}
                <div className="row" style={{ justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => setRecoveryStep('request')}>{t("Back")}</button>
                  <button type="submit" className="btn btn--primary btn--sm" disabled={resetPasswordMutation.isPending || !recoveryToken.trim() || recoveryNewPassword.length < 8}>
                    {t(resetPasswordMutation.isPending ? 'Updating…' : 'Set New Password')}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </AuthCard>
  );
}
