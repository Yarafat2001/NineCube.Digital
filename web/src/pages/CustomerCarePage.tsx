import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthedRequest } from '../api/hooks';
import { useAuth } from '../state/AuthContext';
import { useToast, ErrorState } from '../components/ui';
import { t, useLanguage } from '../i18n/language';

interface ServiceCase { id: number; orderId: number; kind: string; status: string; message: string; response?: string; }

export function CustomerCarePage() {
  useLanguage();
  const { user, hasRole } = useAuth();
  const request = useAuthedRequest();
  const client = useQueryClient();
  const toast = useToast();
  const [params] = useSearchParams();
  const [orderId, setOrderId] = useState(params.get('order') ?? '');
  const [kind, setKind] = useState('Support');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [responses, setResponses] = useState<Record<number, string>>({});
  const [states, setStates] = useState<Record<number, string>>({});
  const canManage = hasRole('Staff', 'Administrator');
  const cases = useQuery({ queryKey: ['service-cases', user?.id], queryFn: () => request<ServiceCase[]>('/api/service-cases'), enabled: !!user && (canManage || hasRole('Customer')) });

  return (
    <div className="page container stack">
      <h1>{t('Help, returns & warranty')}</h1>
      <p>{t('Send a question or request help with an order. Store staff review return, exchange and warranty requests before any refund or stock change.')}</p>

      <div className="card-glass row" style={{ padding: 'var(--space-3) var(--space-4)', gap: 'var(--space-4)', flexWrap: 'wrap', alignItems: 'center' }}>
        <span>📧 <strong>{t('Customer Support:')}</strong> <a href="mailto:support@ninecube.digital">{t('support@ninecube.digital')}</a></span>
        <span>⚡ <strong>{t('Response time:')}</strong> {t('Within 24 business hours')}</span>
      </div>

      <nav className="row" aria-label={t('Store policies')}>
        <Link to="/policies/delivery">{t('Delivery')}</Link>
        <Link to="/policies/returns">{t('Returns & warranty')}</Link>
        <Link to="/policies/privacy">{t('Privacy')}</Link>
        <Link to="/policies/terms">{t('Terms')}</Link>
      </nav>

      {!user ? <p><Link to="/login">{t('Sign in to contact support about your account order.')}</Link></p> : null}

      {hasRole('Customer') ? (
        <form className="card-glass stack" style={{ padding: 'var(--space-4)' }} onSubmit={async event => {
          event.preventDefault(); setBusy(true);
          try {
            await request('/api/service-cases', { method: 'POST', body: { orderId: Number(orderId), kind, message } });
            setMessage(''); toast.push('success', t('Your request has been saved.'));
            await client.invalidateQueries({ queryKey: ['service-cases'] });
          } catch (error) { toast.pushError(error); } finally { setBusy(false); }
        }}>
          <label className="field">{t('Order number')}<input className="input" type="number" min="1" required value={orderId} onChange={e => setOrderId(e.target.value)} /></label>
          <label className="field">{t('Request type')}<select value={kind} onChange={e => setKind(e.target.value)}>{['Support', 'Warranty'].map(value => <option key={value}>{value}</option>)}</select></label>
          <label className="field">{t('How can we help?')}<textarea className="input" required maxLength={2000} rows={4} value={message} onChange={e => setMessage(e.target.value)} /></label>
          <button className="btn btn--primary" disabled={busy}>{t(busy ? 'Saving…' : 'Send request')}</button>
        </form>
      ) : null}

      {cases.isError ? <ErrorState error={cases.error} onRetry={() => void cases.refetch()} /> : null}

      {cases.data?.map(entry => (
        <article key={entry.id} className="card-glass stack" style={{ padding: 'var(--space-4)' }}>
          <h2>{t('Request #')}{entry.id} · {entry.kind} · {entry.status}</h2>
          <Link to={`/orders/${entry.orderId}`}>{t('Order #')}{entry.orderId}</Link>
          <p style={{ whiteSpace: 'pre-wrap' }}>{entry.message}</p>
          {entry.response ? <p style={{ whiteSpace: 'pre-wrap' }}>{t('Store response')}: {entry.response}</p> : null}

          {canManage && !['Completed', 'Rejected'].includes(entry.status) ? (
            <form className="stack" onSubmit={async event => {
              event.preventDefault(); setBusy(true);
              try {
                await request(`/api/service-cases/${entry.id}`, { method: 'PUT', body: { status: states[entry.id] ?? 'Approved', response: responses[entry.id] ?? '' } });
                await client.invalidateQueries({ queryKey: ['service-cases'] });
              } catch (error) { toast.pushError(error); } finally { setBusy(false); }
            }}>
              <label>{t('Decision')}<select value={states[entry.id] ?? 'Approved'} onChange={e => setStates(current => ({ ...current, [entry.id]: e.target.value }))}>{['Approved', 'Rejected', 'Completed'].map(value => <option key={value}>{value}</option>)}</select></label>
              <label>{t('Response')}<textarea className="input" required rows={3} maxLength={2000} value={responses[entry.id] ?? ''} onChange={e => setResponses(current => ({ ...current, [entry.id]: e.target.value }))} /></label>
              <p className="muted">{t('Closing a request records the service decision. Refunds and returned-stock adjustments must be recorded separately after verification.')}</p>
              <button className="btn" disabled={busy}>{t('Save response')}</button>
            </form>
          ) : null}
        </article>
      ))}

      {cases.data?.length === 0 ? <p>{t('No support requests yet.')}</p> : null}
    </div>
  );
}

export function StorePolicyPage() {
  useLanguage();
  return (
    <div className="page container stack" style={{ maxWidth: 850 }}>
      <h1>{t('Shopping information')}</h1>

      <section id="delivery" className="stack">
        <h2>{t('Delivery & Shipping Policy')}</h2>
        <p>{t('For BDT orders, standard delivery is BDT 60 below a merchandise subtotal of BDT 2,500 and free at or above BDT 2,500. Your final delivery charge is shown before placing the order. Staff add the carrier and tracking reference after dispatch.')}</p>
        <p>{t('Standard fulfillment typically delivers within 2–4 business days depending on location. Courier tracking references are accessible under My Orders once your package is dispatched.')}</p>
        <p>{t('Reverse courier pickups for approved returns or store-error exchanges are free of charge. For elective size or preference exchanges, standard return courier fees may apply.')}</p>
      </section>

      <section id="returns" className="stack">
        <h2>{t('Returns, Exchanges & Warranty Rules')}</h2>
        <p>{t('Our return and exchange policy is designed to protect your purchase while ensuring fair handling across different product categories:')}</p>
        <ul className="stack" style={{ gap: 'var(--space-2)' }}>
          <li>
            <strong>{t('Footwear & Lifestyle Gear (Apex, Bata, Nino Rossi):')}</strong> {t('7-day return or exchange window from delivery date. Items must be unworn, in original box packaging with intact tags. One complimentary size exchange is offered per order. In addition, a 30-day warranty covers verified manufacturing defects (sole detachment, stitching tears, or adhesive failure).')}
          </li>
          <li>
            <strong>{t('Electronics & Laptops (Acer, Asus, Apple):')}</strong> {t('Covered by 1–2 year official brand manufacturer warranty through authorized service centers in Bangladesh. If a product arrives Dead on Arrival (DOA) or damaged in transit, report it within 7 days via Help for an immediate store replacement.')}
          </li>
          <li>
            <strong>{t('Furniture (Hatil):')}</strong> {t('Report any transit damage within 3 days of delivery. High-grade structural furniture includes a 1-year limited structural warranty against manufacturing joinery defects.')}
          </li>
          <li>
            <strong>{t('Grocery & Consumables (Bisk Club, Bombay Sweets, Cadbury):')}</strong> {t('Perishable and edible items cannot be returned once opened. Damaged packaging or expired deliveries must be reported within 24 hours of receipt for immediate replacement or store refund.')}
          </li>
          <li>
            <strong>{t('Hygiene & Personal Care Items:')}</strong> {t('Non-returnable once the factory seal is broken, for hygiene and sanitary protection.')}
          </li>
        </ul>
        <p>{t('How to submit a claim: Navigate to Help, enter your Order Number, choose Return, Exchange, or Warranty, and describe your issue. Store staff review every case within 24 business hours. Refunds or stock adjustments are processed upon verification.')}</p>
        <p>{t('Support email: support@ninecube.digital (escalations: care@ninecube.digital).')}</p>
      </section>

      <section id="privacy" className="stack">
        <h2>{t('Privacy')}</h2>
        <p>{t('The store processes your account details, contact information, addresses, orders and support messages to provide shopping and order support. Cart and appearance preferences are stored in your browser. Online payment takes place on SSLCOMMERZ; card details are not entered in NineCube checkout.')}</p>
      </section>

      <section id="terms" className="stack">
        <h2>{t('Order terms')}</h2>
        <p>{t('Prices and availability are rechecked by the server when you place an order. Placing an order does not guarantee dispatch. Online payments count as paid after verification by the payment provider. Keep your order reference for support.')}</p>
      </section>

      <div className="row" style={{ gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
        <Link className="btn btn--primary" to="/help">{t('Contact support')}</Link>
        <Link className="btn btn--ghost" to="/products">{t('Continue shopping')}</Link>
      </div>
    </div>
  );
}
