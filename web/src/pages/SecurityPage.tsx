import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthedRequest } from '../api/hooks';
import { useAuth } from '../state/AuthContext';
import { ErrorState, LoadingBlock, useToast } from '../components/ui';
import { formatDateTime } from '../lib/helpers';
import { t, useLanguage } from '../i18n/language';

export function SecurityPage() {
  useLanguage(); const request = useAuthedRequest(); const { logout } = useAuth(); const toast = useToast();
  const [code, setCode] = useState(''); const [busy, setBusy] = useState(false);
  const security = useQuery({ queryKey: ['account-security'], queryFn: () => request<{ verified: boolean; sessions: { id: number; createdAtUtc: string; expiresAtUtc: string }[] }>('/api/me/security') });
  const action = async (path: string, body?: unknown) => {
    setBusy(true); try { await request(path, { method: 'POST', body }); await security.refetch(); }
    catch (error) { toast.pushError(error); } finally { setBusy(false); }
  };
  return <div className="page container stack"><h1>{t('Account security')}</h1>
    {security.isLoading && <LoadingBlock label={t("Loading account security")} />}{security.isError && <ErrorState error={security.error} />}
    {security.data && <>
      <section className="card-glass stack" style={{ padding: 'var(--space-4)' }}><h2>{t('Email verification')}</h2>
        <p>{t(security.data.verified ? 'Your email is verified.' : 'Verify your email to securely link guest orders to your account.')}</p>
        {!security.data.verified && <>
          <button className="btn" disabled={busy} onClick={() => void action('/api/me/security/verification').then(() => toast.push('success', t('Check your email for a verification token.')))}>{t('Send verification token')}</button>
          <form className="row" onSubmit={e => { e.preventDefault(); void action('/api/me/security/verification/confirm', { code }); }}>
            <label className="field">{t('Verification token')}<input required autoComplete="one-time-code" value={code} onChange={e => setCode(e.target.value)} /></label><button className="btn btn--primary" disabled={busy}>{t('Verify email')}</button>
          </form></>}
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
