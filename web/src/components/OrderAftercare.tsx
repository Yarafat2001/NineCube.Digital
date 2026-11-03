import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthedRequest } from '../api/hooks';
import type { Order } from '../api/types';
import { useAuth } from '../state/AuthContext';
import { ErrorState, useToast } from './ui';
import { formatMoney } from '../lib/helpers';
import { t, useLanguage } from '../i18n/language';

interface ReturnCase { id: number; kind: string; status: string; message: string; response?: string }
interface ReturnLine { id: number; serviceCaseId: number; orderItemId: number; quantity: number; receivedQuantity: number; restockedQuantity: number }
interface ReturnData { cases: ReturnCase[]; lines: ReturnLine[]; deadline?: string; items: { id: number; name: string; quantity: number; remaining: number }[] }
interface Refund { id: number; serviceCaseId?: number; amount: number; giftCardAmount: number; currency: string; status: string; reason: string; reference?: string }

export function OrderAftercare({ order }: { order: Order }) {
  useLanguage(); const request = useAuthedRequest(); const { hasRole } = useAuth(); const toast = useToast(); const client = useQueryClient();
  const manage = hasRole('Staff', 'Administrator');
  const [quantities, setQuantities] = useState<Record<number, string>>({}); const [reason, setReason] = useState(''); const [kind, setKind] = useState('Return');
  const [received, setReceived] = useState<Record<number, string>>({}); const [restock, setRestock] = useState<Record<number, string>>({});
  const [response, setResponse] = useState(''); const [amount, setAmount] = useState(''); const [caseId, setCaseId] = useState('');
  const [reference, setReference] = useState(''); const [method, setMethod] = useState('BankTransfer'); const [busy, setBusy] = useState(false);
  const enabled = order.status === 'Delivered' || order.paymentStatus === 'Paid' || order.paymentStatus === 'Refunded';
  const returns = useQuery({ queryKey: ['order-returns', order.id], queryFn: () => request<ReturnData>(`/api/orders/${order.id}/returns`), enabled });
  const refunds = useQuery({ queryKey: ['order-refunds', order.id], queryFn: () => request<Refund[]>(`/api/orders/${order.id}/refunds`), enabled });
  const action = async (path: string, body: unknown, method: 'POST' | 'PUT' = 'POST') => {
    setBusy(true); try { await request(path, { method, body }); await Promise.all([returns.refetch(), refunds.refetch(), client.invalidateQueries({ queryKey: ['order', order.id] }), client.invalidateQueries({ queryKey: ['orders'] })]); toast.push('success', t('Changes saved.')); }
    catch (error) { toast.pushError(error); } finally { setBusy(false); }
  };
  if (!enabled) return null;
  return <section className="card-glass stack" style={{ padding: 'var(--space-4)' }}><h2>{t('Returns, exchanges & refunds')}</h2>
    {returns.isError && <ErrorState error={returns.error} />}{refunds.isError && <ErrorState error={refunds.error} />}
    {returns.data && <>
      {returns.data.deadline && <p>{t('Return deadline')}: {new Date(returns.data.deadline).toLocaleDateString()}</p>}
      {!manage && order.status === 'Delivered' && <form className="stack" onSubmit={e => {
        e.preventDefault(); const items = Object.entries(quantities).filter(([, qty]) => Number(qty) > 0).map(([id, qty]) => ({ orderItemId: Number(id), quantity: Number(qty) }));
        void action(`/api/orders/${order.id}/returns`, { kind, reason, items });
      }}>
        <label className="field">{t('Request type')}<select value={kind} onChange={e => setKind(e.target.value)}><option value="Return">{t('Return')}</option><option value="Exchange">{t('Exchange')}</option></select></label>
        {returns.data.items.map(item => <label className="field" key={item.id}>{item.name} · {t('Remaining quantity')}: {item.remaining}
          <input aria-label={`${t('Return quantity')}: ${item.name}`} type="number" min="0" max={item.remaining} disabled={!item.remaining} value={quantities[item.id] ?? '0'} onChange={e => setQuantities(current => ({ ...current, [item.id]: e.target.value }))} /></label>)}
        <label className="field">{t('Reason')}<textarea required maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} /></label>
        <button className="btn" disabled={busy}>{t('Request return or exchange')}</button>
      </form>}
      {returns.data.cases.map(entry => <article className="address-card stack" key={entry.id}>
        <strong>{t(entry.kind)} #{entry.id} · {t(entry.status)}</strong><p>{entry.message}</p>{entry.response && <p>{entry.response}</p>}
        <ul>{returns.data!.lines.filter(l => l.serviceCaseId === entry.id).map(line => <li key={line.id}>{returns.data!.items.find(i => i.id === line.orderItemId)?.name} · {line.quantity} / {line.receivedQuantity} / {line.restockedQuantity}</li>)}</ul>
        {manage && entry.status === 'Open' && <div className="stack"><label className="field">{t('Store response')}<textarea required maxLength={2000} value={response} onChange={e => setResponse(e.target.value)} /></label>
          <div className="row">{['Approved', 'Rejected'].map(status => <button className="btn" key={status} disabled={busy || !response.trim()} onClick={() => void action(`/api/service-cases/${entry.id}`, { status, response }, 'PUT')}>{t(status)}</button>)}</div></div>}
        {manage && entry.status === 'Approved' && <form className="stack" onSubmit={e => {
          e.preventDefault(); void action(`/api/service-cases/${entry.id}/inspect`, { response, items: returns.data!.lines.filter(l => l.serviceCaseId === entry.id).map(line => ({ id: line.id, receivedQuantity: Number(received[line.id] ?? line.quantity), restockQuantity: Number(restock[line.id] ?? 0) })) });
        }}>
          <p>{t('Record received quantities and restock only items inspected as sellable. This action can be completed once.')}</p>
          {returns.data!.lines.filter(l => l.serviceCaseId === entry.id).map(line => <div className="row" key={line.id}>
            <span>{returns.data!.items.find(i => i.id === line.orderItemId)?.name}</span>
            <label className="field">{t('Received quantity')}<input type="number" min="0" max={line.quantity} value={received[line.id] ?? line.quantity} onChange={e => setReceived(current => ({ ...current, [line.id]: e.target.value }))} /></label>
            <label className="field">{t('Restock quantity')}<input type="number" min="0" max={received[line.id] ?? line.quantity} value={restock[line.id] ?? '0'} onChange={e => setRestock(current => ({ ...current, [line.id]: e.target.value }))} /></label>
          </div>)}
          <label className="field">{t('Inspection notes')}<textarea required maxLength={2000} value={response} onChange={e => setResponse(e.target.value)} /></label><button className="btn" disabled={busy}>{t('Confirm inspection')}</button>
        </form>}
      </article>)}
    </>}
    {manage && order.paymentStatus === 'Paid' && <form className="stack" onSubmit={e => { e.preventDefault(); void action(`/api/orders/${order.id}/refunds`, { amount: Number(amount), reason, serviceCaseId: caseId ? Number(caseId) : null }); }}>
      <h3>{t('Approve a refund')}</h3><p>{t('Refunds reserve the approved amount. Returned merchandise is refunded after discounts; shipping is retained. Gift-card credit is returned to the original card first.')}</p>
      <label className="field">{t('Return request')}<select value={caseId} onChange={e => setCaseId(e.target.value)}><option value="">{t('Order adjustment')}</option>{returns.data?.cases.filter(c => c.status === 'Received').map(c => <option key={c.id} value={c.id}>#{c.id} {t(c.kind)}</option>)}</select></label>
      <label className="field">{t('Amount')} ({order.currency})<input required type="number" min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} /></label>
      <label className="field">{t('Reason')}<textarea required maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} /></label><button className="btn" disabled={busy}>{t('Approve refund amount')}</button>
    </form>}
    {refunds.data?.map(refund => <article className="address-card stack" key={refund.id}>
      <strong>{formatMoney(refund.amount, refund.currency)} · {t(refund.status)}</strong><p>{refund.reason}</p>
      <p>{t('Gift-card credit')}: {formatMoney(refund.giftCardAmount, refund.currency)} · {t('Cash repayment')}: {formatMoney(refund.amount - refund.giftCardAmount, refund.currency)}</p>
      {refund.reference && <p>{t('Reference')}: {refund.reference}</p>}
      {manage && ['Pending', 'Processing'].includes(refund.status) && refund.amount > refund.giftCardAmount && order.paymentMethod !== 'CashOnDelivery' && <button className="btn" disabled={busy} onClick={() => void action(`/api/refunds/${refund.id}/gateway`, {})}>{t(refund.status === 'Pending' ? 'Submit refund to SSLCOMMERZ' : 'Check refund settlement')}</button>}
      {manage && ['Pending', 'NeedsReview'].includes(refund.status) && <form className="stack" onSubmit={e => { e.preventDefault(); void action(`/api/refunds/${refund.id}/settle`, { method, reference }); }}>
        <p>{t('Record manual settlement only after verifying the repayment. For uncertain gateway results, reconcile with the provider before paying again.')}</p>
        <label className="field">{t('Settlement method')}<select value={method} onChange={e => setMethod(e.target.value)}>{['BankTransfer', 'Cash', 'GiftCard'].map(value => <option key={value} value={value}>{t(value)}</option>)}</select></label>
        <label className="field">{t('Repayment reference')}<input required maxLength={200} value={reference} onChange={e => setReference(e.target.value)} /></label><button className="btn" disabled={busy}>{t('Confirm recorded repayment')}</button>
      </form>}
    </article>)}
    {manage && order.status === 'Delivered' && order.paymentMethod === 'CashOnDelivery' && order.paymentStatus === 'Unpaid' && <form className="stack" onSubmit={e => { e.preventDefault(); void action(`/api/orders/${order.id}/cod-settlement`, { method: 'Cash', reference }); }}>
      <h3>{t('Record COD remittance')}</h3><label className="field">{t('Courier remittance reference')}<input required maxLength={200} value={reference} onChange={e => setReference(e.target.value)} /></label><button className="btn" disabled={busy}>{t('Confirm collected payment')}</button>
    </form>}
  </section>;
}
