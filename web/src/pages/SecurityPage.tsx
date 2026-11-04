import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthedRequest } from '../api/hooks';
import { useAuth } from '../state/AuthContext';
import { ErrorState, LoadingBlock, useToast } from '../components/ui';
import { Icon } from '../components/Icon';
import { formatDateTime, timeAgo } from '../lib/helpers';
import { t, useLanguage } from '../i18n/language';
import { apiRequest } from '../api/client';

type Security = {
  verified: boolean; mfaEnabled: boolean;
  sessions: { id: number; createdAtUtc: string; expiresAtUtc: string }[];
};

export function SecurityPage() {
  useLanguage(); const request = useAuthedRequest(); const { logout, user } = useAuth(); const toast = useToast();
  const id = useId();
  const [code, setCode] = useState(''); const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState(''); const [mfaCode, setMfaCode] = useState('');
  const security = useQuery({ queryKey: ['account-security'], queryFn: () => request<Security>('/api/me/security') });
  const action = async (path: string, body?: unknown) => {
    setBusy(true); try { await request(path, { method: 'POST', body }); await security.refetch(); return true; }
    catch (error) { toast.pushError(error); return false; } finally { setBusy(false); }
  };
  return <div className="page container stack security-page">
    <header className="security-page__head">
      <h1><Icon name="shield" width={24} height={24} aria-hidden="true" /> {t('Account security')}</h1>
      <p>{t('Three things keep an account yours: a verified email, a code at sign-in, and knowing which devices can still reach it.')}</p>
    </header>

    {security.isLoading && <LoadingBlock label={t('Loading account security')} />}
    {security.isError && <ErrorState error={security.error} onRetry={() => void security.refetch()} />}

    {security.data && <div className="security-page__grid">
      <div className="table-surface settings-plate security-work">
      <section className="settings-block">
        <div className="policy-card__head">
          <h2 className="policy-card__title"><Icon name="mail" width={15} height={15} aria-hidden="true" />{t('Email verification')}</h2>
          <span className={`badge badge--${security.data.verified ? 'ok' : 'warn'}`}>{t(security.data.verified ? 'Verified' : 'Not verified')}</span>
        </div>
        <p className="policy-card__lead">{t(security.data.verified
          ? 'Your email is verified, so guest orders can be linked to this account.'
          : 'Verify your email to link guest orders to this account. Two-step sign-in stays locked until it is verified.')}</p>
        {!security.data.verified && <div className="security-steps">
          <div className="setting-row security-step">
            <span className="security-step__number" aria-hidden="true">1</span>
            <div className="field"><strong>{t('Ask for a verification token')}</strong>
              <span className="hint">{t('The token arrives by email and lasts ten minutes.')}</span></div>
            <div className="setting-row__control">
              <button className="btn" disabled={busy} onClick={() => void action('/api/me/security/verification').then(sent => {
                if (sent) toast.push('success', t('Check your email for a verification token.'));
              })}>{t('Send verification token')}</button>
            </div>
          </div>
          <form className="setting-row security-step" onSubmit={e => { e.preventDefault(); void action('/api/me/security/verification/confirm', { code }); }}>
            <span className="security-step__number" aria-hidden="true">2</span>
            <label className="field" htmlFor={`${id}-token`}>{t('Verification token')}
              <span className="hint">{t('Paste the token here, then verify it.')}</span></label>
            <div className="setting-row__control">
              <input id={`${id}-token`} className="setting-row__number" required autoComplete="one-time-code" inputMode="numeric" value={code} onChange={e => setCode(e.target.value)} />
              <button className="btn btn--primary" disabled={busy || !code.trim()}>{t('Verify email')}</button>
            </div>
          </form>
        </div>}
      </section>

      <section className="settings-block">
        <div className="policy-card__head">
          <h2 className="policy-card__title"><Icon name="bolt" width={15} height={15} aria-hidden="true" />{t('Two-step sign-in')}</h2>
          <span className={`badge badge--${security.data.mfaEnabled ? 'ok' : 'neutral'}`}>{t(security.data.mfaEnabled ? 'On' : 'Off')}</span>
        </div>
        <p className="policy-card__lead">{t(security.data.mfaEnabled
          ? 'Signing in needs your password and a code from your email.'
          : 'After your password, signing in will also need a code from your email.')}</p>
        {!security.data.verified && <p className="security-block__note"><Icon name="shield" width={14} height={14} aria-hidden="true" />{t('Verify your email above before changing this.')}</p>}
        <form className="security-steps" onSubmit={async e => {
          e.preventDefault(); setBusy(true);
          try { await request('/api/me/security/mfa', { method: 'POST', body: { enabled: !security.data!.mfaEnabled, password, code: mfaCode } }); logout(); }
          catch (error) { toast.pushError(error); setBusy(false); }
        }}>
          <div className="setting-row security-step">
            <span className="security-step__number" aria-hidden="true">1</span>
            <label className="field" htmlFor={`${id}-password`}>{t('Current password')}
              <span className="hint">{t('Confirms this is really you.')}</span></label>
            <div className="setting-row__control">
              <input id={`${id}-password`} type="password" required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} disabled={busy || !security.data.verified} />
            </div>
          </div>
          <div className="setting-row security-step">
            <span className="security-step__number" aria-hidden="true">2</span>
            <label className="field" htmlFor={`${id}-code`}>{t('Sign-in code')}
              <span className="hint">{t('Six digits, sent to your email.')}</span></label>
            <div className="setting-row__control">
              <input id={`${id}-code`} className="setting-row__number" required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={mfaCode} onChange={e => setMfaCode(e.target.value)} disabled={busy || !security.data.verified} />
              <button type="button" className="btn btn--sm" disabled={busy || !password || !security.data.verified} onClick={async () => {
                setBusy(true); try { await apiRequest('/api/auth/signin-code', { method: 'POST', body: { email: user?.email, password } }); toast.push('info', t('Check your email for a sign-in code.')); }
                catch (error) { toast.pushError(error); } finally { setBusy(false); }
              }}>{t('Send sign-in code')}</button>
            </div>
          </div>
          <div className="setting-row security-step">
            <span className="security-step__number" aria-hidden="true">3</span>
            <div className="field"><strong>{t(security.data.mfaEnabled ? 'Turn two-step sign-in off' : 'Turn two-step sign-in on')}</strong>
              <span className="hint">{t('Saving signs every device out, so each one has to sign in again.')}</span></div>
            <div className="setting-row__control">
              <button className="btn btn--primary" disabled={busy || !security.data.verified}>{t(security.data.mfaEnabled ? 'Disable two-step sign-in' : 'Enable two-step sign-in')}</button>
            </div>
          </div>
        </form>
      </section>
      </div>

      <aside className="table-surface settings-plate security-page__status" aria-labelledby={`${id}-sessions`}>
      <section className="settings-block">
        <div className="policy-card__head">
          <h2 className="policy-card__title" id={`${id}-sessions`}><Icon name="clock" width={15} height={15} aria-hidden="true" />{t('Active sessions')}</h2>
          <span className="badge badge--neutral">{security.data.sessions.length} {t('live')}</span>
        </div>
        <p className="policy-card__lead">{t('Each entry is a sign-in whose access has not run out yet.')}</p>
        <div className="security-status__log">
        {security.data.sessions.length === 0 ? <p className="hint">{t('No device is signed in right now.')}</p> :
          <ul className="security-sessions">
            {security.data.sessions.map((session, index) => <li key={session.id}>
              <div className="security-session__head">
                <strong>{t('Signed in')} {timeAgo(session.createdAtUtc)}</strong>
                {index === 0 && <span className="badge badge--info">{t('Most recent')}</span>}
              </div>
              <div className="security-session__times">
                <span>{t('Started')} <time dateTime={session.createdAtUtc}>{formatDateTime(session.createdAtUtc)}</time></span>
                <span>{t('Runs out')} <time dateTime={session.expiresAtUtc}>{formatDateTime(session.expiresAtUtc)}</time></span>
              </div>
            </li>)}
          </ul>}
        </div>
        <div className="setting-row security-danger">
          <span className="hint">{t('Use this if a device is not yours. It revokes access and refresh tokens everywhere.')}</span>
          <div className="setting-row__control">
            <button className="btn btn--danger" disabled={busy} onClick={async () => {
              setBusy(true); try { await request('/api/me/security/revoke-sessions', { method: 'POST' }); logout(); } catch (error) { toast.pushError(error); setBusy(false); }
            }}>{t('Sign out everywhere')}</button>
          </div>
        </div>
      </section>
      </aside>
    </div>}
  </div>;
}
