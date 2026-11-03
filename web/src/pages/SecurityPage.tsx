import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthedRequest } from '../api/hooks';
import { useAuth } from '../state/AuthContext';
import { ErrorState, LoadingBlock, useToast } from '../components/ui';
import { formatDateTime } from '../lib/helpers';
import { t, useLanguage } from '../i18n/language';
import { apiRequest } from '../api/client';

export function SecurityPage() {
  useLanguage(); const request = useAuthedRequest(); const { logout, user } = useAuth(); const toast = useToast();
  const [code, setCode] = useState(''); const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState(''); const [mfaCode, setMfaCode] = useState('');
  const security = useQuery({ queryKey: ['account-security'], queryFn: () => request<{ verified: boolean; mfaEnabled: boolean; sessions: { id: number; createdAtUtc: string; expiresAtUtc: string }[] }>('/api/me/security') });
  const action = async (path: string, body?: unknown) => {
    setBusy(true); try { await request(path, { method: 'POST', body }); await security.refetch(); return true; }
    catch (error) { toast.pushError(error); return false; } finally { setBusy(false); }
  };
  return <div className="page container stack"><h1>{t('Account security')}</h1>
    {security.isLoading && <LoadingBlock label={t("Loading account security")} />}{security.isError && <ErrorState error={security.error} />}
    {security.data && <>
      <section className="card-glass stack" style={{ padding: 'var(--space-4)' }}><h2>{t('Email verification')}</h2>
        <p>{t(security.data.verified ? 'Your email is verified.' : 'Verify your email to securely link guest orders to your account.')}</p>
        {!security.data.verified && <>
          <button className="btn" disabled={busy} onClick={() => void action('/api/me/security/verification').then(saved => { if (saved) toast.push('success', t('Check your email for a verification token.')); })}>{t('Send verification token')}</button>
          <form className="row" onSubmit={e => { e.preventDefault(); void action('/api/me/security/verification/confirm', { code }); }}>
            <label className="field">{t('Verification token')}<input required autoComplete="one-time-code" value={code} onChange={e => setCode(e.target.value)} /></label><button className="btn btn--primary" disabled={busy}>{t('Verify email')}</button>
          </form></>}
      </section>
      <section className="card-glass stack" style={{ padding: 'var(--space-4)' }}><h2>{t('Two-step sign-in')}</h2>
        <p>{t(security.data.mfaEnabled ? 'Email sign-in codes are enabled.' : 'Add an email code after your password when signing in.')}</p>
        {!security.data.verified && <p>{t('Verify your email before changing two-step sign-in.')}</p>}
        <form className="stack" onSubmit={async e => {
          e.preventDefault(); setBusy(true);
          try { await request('/api/me/security/mfa', { method: 'POST', body: { enabled: !security.data!.mfaEnabled, password, code: mfaCode } }); logout(); }
          catch (error) { toast.pushError(error); setBusy(false); }
        }}>
          <label className="field">{t('Current password')}<input type="password" required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} disabled={busy || !security.data.verified} /></label>
          <button type="button" className="btn" disabled={busy || !password || !security.data.verified} onClick={async () => {
            setBusy(true); try { await apiRequest('/api/auth/signin-code', { method: 'POST', body: { email: user?.email, password } }); toast.push('info', t('Check your email for a sign-in code.')); }
            catch (error) { toast.pushError(error); } finally { setBusy(false); }
          }}>{t('Send sign-in code')}</button>
          <label className="field">{t('Sign-in code')}<input required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={mfaCode} onChange={e => setMfaCode(e.target.value)} disabled={busy || !security.data.verified} /></label>
          <p className="muted">{t('Changing two-step sign-in signs you out on every device.')}</p>
          <button className="btn btn--primary" disabled={busy || !security.data.verified}>{t(security.data.mfaEnabled ? 'Disable two-step sign-in' : 'Enable two-step sign-in')}</button>
        </form>
      </section>
      <section className="card-glass stack" style={{ padding: 'var(--space-4)' }}><h2>{t('Active sessions')}</h2>
        <p>{t('Signing out everywhere revokes access and refresh tokens on all devices.')}</p>
        <ul>{security.data.sessions.map(session => <li key={session.id}>{formatDateTime(session.createdAtUtc)} — {formatDateTime(session.expiresAtUtc)}</li>)}</ul>
        <button className="btn btn--danger" disabled={busy} onClick={async () => {
          setBusy(true); try { await request('/api/me/security/revoke-sessions', { method: 'POST' }); logout(); } catch (error) { toast.pushError(error); setBusy(false); }
        }}>{t('Sign out everywhere')}</button>
      </section>
    </>}
  </div>;
}
