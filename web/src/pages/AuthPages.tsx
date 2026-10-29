import { t, useLanguage } from '../i18n/language';
import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ApiError, describeError } from '../api/client';
import { AuthCard, NeuButton, NeuInput, SocialButtons, type SocialProvider } from '../components/auth/AuthCard';
import { useAuth } from '../state/AuthContext';
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
                    <button type="button" className={styles.textButton} onClick={() => onForgotPassword
                      ? void integration(() => onForgotPassword(email.trim()))
                      : setNotice('For help accessing your account, contact your administrator.')}>{t("Forgot Password?")}</button>
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
    </AuthCard>
  );
}
