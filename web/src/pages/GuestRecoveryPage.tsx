import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequest, describeError } from '../api/client';
import { t, useLanguage } from '../i18n/language';

export function GuestRecoveryPage() {
  useLanguage(); const navigate = useNavigate();
  const [order, setOrder] = useState(''); const [email, setEmail] = useState(''); const [code, setCode] = useState('');
  const [sent, setSent] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  return <div className="page container stack"><h1>{t('Recover a guest order')}</h1>
    <form className="card-glass stack" style={{ padding: 'var(--space-4)', maxWidth: 560 }} onSubmit={async event => {
      event.preventDefault(); setBusy(true); setError('');
      try {
        if (!sent) { await apiRequest('/api/guest/recovery/request', { method: 'POST', body: { orderId: Number(order), email } }); setSent(true); }
        else {
          const result = await apiRequest<{ token: string; orderId: number }>('/api/guest/recovery/confirm', { method: 'POST', body: { orderId: Number(order), token: code } });
          sessionStorage.setItem(`ninecube.guest.order.${result.orderId}`, result.token); navigate(`/guest/orders/${result.orderId}`);
        }
      } catch (caught) { setError(describeError(caught)); } finally { setBusy(false); }
    }}>
      <label className="field">{t('Order number')}<input type="number" min="1" required disabled={sent} value={order} onChange={e => setOrder(e.target.value)} /></label>
      <label className="field">{t('Email')}<input type="email" required disabled={sent} value={email} onChange={e => setEmail(e.target.value)} /></label>
      {sent && <><p>{t('If these details match a guest order, a recovery token will arrive by email.')}</p><label className="field">{t('Recovery token')}<input required autoComplete="one-time-code" value={code} onChange={e => setCode(e.target.value)} /></label></>}
      {error && <p role="alert" className="error">{t(error)}</p>}
      <button className="btn btn--primary" disabled={busy}>{t(sent ? 'Open my order' : 'Email recovery token')}</button>
      {sent && <button className="btn btn--ghost" type="button" disabled={busy} onClick={() => setSent(false)}>{t('Back')}</button>}
    </form></div>;
}
