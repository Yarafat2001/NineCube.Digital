import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuthedRequest, useProducts } from '../api/hooks';
import { useAuth } from '../state/AuthContext';
import { ErrorState, useToast } from '../components/ui';
import { formatMoney } from '../lib/helpers';
import { countryName, addressCountries } from '../lib/addresses';
import { t, useLanguage } from '../i18n/language';
import { FloatingGlassAdminShell } from '../components/admin/FloatingGlassAdminShell';

interface Supplier { id: number; name: string; email?: string; phone?: string }
interface Purchase { id: number; supplierId: number; reference: string; currency: string; status: string; lines: { id: number; productId: number; quantity: number; receivedQuantity: number; unitCost: number }[] }
interface Review { id: number; productId: number; rating: number; comment?: string; isApproved: boolean; merchantResponse?: string; reports: number }
interface Rate { countryCode: string; division: string | null; district: string | null; currency: string; fee: number; freeAbove: number | null; minDays: number | null; maxDays: number | null }

export function OperationsPage() {
  useLanguage(); const { hasRole } = useAuth();
  return (
    <FloatingGlassAdminShell activeSection="Operations">
      <div className="page container stack">
        <h1>{t('Store operations')}</h1>
        {hasRole('InventoryManager', 'Administrator') && <Purchasing />}
        {hasRole('Staff', 'Administrator') && <ReviewQueue />}
        {hasRole('Administrator') && <DeliveryRatesEditor />}
      </div>
    </FloatingGlassAdminShell>
  );
}

function Purchasing() {
  const request = useAuthedRequest(); const client = useQueryClient(); const toast = useToast();
  const [busy, setBusy] = useState(false); const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [phone, setPhone] = useState('');
  const [search, setSearch] = useState(''); const products = useProducts({ q: search, page: 1, pageSize: 100 });
  const [supplier, setSupplier] = useState(''); const [reference, setReference] = useState(''); const [currency, setCurrency] = useState('BDT');
  const [lines, setLines] = useState([{ productId: '', quantity: '1', unitCost: '' }]); const [receipts, setReceipts] = useState<Record<number, string>>({});
  const [parent, setParent] = useState(''); const [label, setLabel] = useState(''); const [sku, setSku] = useState(''); const [price, setPrice] = useState(''); const [stock, setStock] = useState('0');
  const suppliers = useQuery({ queryKey: ['suppliers'], queryFn: () => request<Supplier[]>('/api/purchasing/suppliers') });
  const purchases = useQuery({ queryKey: ['purchase-orders'], queryFn: () => request<Purchase[]>('/api/purchasing/orders') });
  const action = async (path: string, body: unknown) => {
    setBusy(true); try { await request(path, { method: 'POST', body }); await Promise.all([client.invalidateQueries({ queryKey: ['purchase-orders'] }), client.invalidateQueries({ queryKey: ['suppliers'] }), client.invalidateQueries({ queryKey: ['products'] })]); toast.push('success', t('Changes saved.')); return true; }
    catch (error) { toast.pushError(error); return false; } finally { setBusy(false); }
  };
  const productOptions = products.data?.items ?? [];
  return <>
    <section className="card-glass stack" style={{ padding: 'var(--space-4)' }}><h2>{t('Suppliers & purchasing')}</h2>
      {suppliers.isError && <ErrorState error={suppliers.error} />}{purchases.isError && <ErrorState error={purchases.error} />}
      <details><summary>{t('Add supplier')}</summary><form className="stack" onSubmit={async e => { e.preventDefault(); if (await action('/api/purchasing/suppliers', { name, email, phone })) { setName(''); setEmail(''); setPhone(''); } }}>
        <label className="field">{t('Supplier name')}<input required maxLength={200} value={name} onChange={e => setName(e.target.value)} /></label>
        <label className="field">{t('Email')}<input type="email" maxLength={256} value={email} onChange={e => setEmail(e.target.value)} /></label>
        <label className="field">{t('Phone')}<input type="tel" maxLength={32} value={phone} onChange={e => setPhone(e.target.value)} /></label><button className="btn" disabled={busy}>{t('Save supplier')}</button>
      </form></details>
      <form className="stack" onSubmit={async e => {
        e.preventDefault(); if (await action('/api/purchasing/orders', { supplierId: Number(supplier), reference, currency, lines: lines.map(l => ({ productId: Number(l.productId), quantity: Number(l.quantity), unitCost: Number(l.unitCost) })) })) { setReference(''); setLines([{ productId: '', quantity: '1', unitCost: '' }]); }
      }}>
        <h3>{t('Create purchase order')}</h3>
        <label className="field">{t('Supplier')}<select required value={supplier} onChange={e => setSupplier(e.target.value)}><option value="">{t('Choose supplier')}</option>{suppliers.data?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label className="field">{t('Supplier reference')}<input required maxLength={100} value={reference} onChange={e => setReference(e.target.value)} /></label>
        <label className="field">{t('Currency')}<select value={currency} onChange={e => setCurrency(e.target.value)}><option>{t('BDT')}</option><option>{t('USD')}</option></select></label>
        <label className="field">{t('Find products')}<input type="search" value={search} onChange={e => setSearch(e.target.value)} /></label>
        {products.isError && <ErrorState error={products.error} />}
        {lines.map((line, index) => <div className="row" key={index}>
          <label className="field">{t('Product')}<select required value={line.productId} onChange={e => setLines(current => current.map((l, i) => i === index ? { ...l, productId: e.target.value } : l))}><option value="">{t('Choose product')}</option>{productOptions.filter(p => (p.currency ?? 'BDT') === currency).map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}</select></label>
          <label className="field">{t('Quantity')}<input required type="number" min="1" max="100000" value={line.quantity} onChange={e => setLines(current => current.map((l, i) => i === index ? { ...l, quantity: e.target.value } : l))} /></label>
          <label className="field">{t('Unit cost')}<input required type="number" min="0" step="0.01" value={line.unitCost} onChange={e => setLines(current => current.map((l, i) => i === index ? { ...l, unitCost: e.target.value } : l))} /></label>
          {lines.length > 1 && <button type="button" className="btn btn--ghost" onClick={() => setLines(current => current.filter((_, i) => i !== index))}>{t('Remove')}</button>}
        </div>)}
        <div className="row"><button className="btn btn--ghost" type="button" disabled={lines.length >= 200} onClick={() => setLines(current => [...current, { productId: '', quantity: '1', unitCost: '' }])}>{t('Add purchase line')}</button><button className="btn btn--primary" disabled={busy}>{t('Save purchase order')}</button></div>
      </form>
      {purchases.data?.map(purchase => <article className="address-card stack" key={purchase.id}>
        <h3>{suppliers.data?.find(s => s.id === purchase.supplierId)?.name} · {purchase.reference} · {t(purchase.status)}</h3>
        <form className="stack" onSubmit={e => { e.preventDefault(); void action(`/api/purchasing/orders/${purchase.id}/receive`, { lines: purchase.lines.filter(l => Number(receipts[l.id] ?? 0) > 0).map(l => ({ lineId: l.id, quantity: Number(receipts[l.id]) })) }).then(saved => { if (saved) setReceipts({}); }); }}>
          {purchase.lines.map(line => <div key={line.id} className="row"><span>{productOptions.find(p => p.id === line.productId)?.name ?? t('Product')} · {line.receivedQuantity}/{line.quantity} · {formatMoney(line.unitCost, purchase.currency)}</span>
            {line.receivedQuantity < line.quantity && <label className="field">{t('Receive quantity')}<input type="number" min="0" max={line.quantity - line.receivedQuantity} value={receipts[line.id] ?? '0'} onChange={e => setReceipts(current => ({ ...current, [line.id]: e.target.value }))} /></label>}
          </div>)}
          {purchase.status !== 'Received' && <button className="btn" disabled={busy}>{t('Record received stock')}</button>}
        </form>
      </article>)}
    </section>
    <section className="card-glass stack" style={{ padding: 'var(--space-4)' }}><h2>{t('Product variants')}</h2><p>{t('Each variant has its own SKU, price and stock. Reconcile parent stock to zero before creating variants.')}</p>
      <form className="stack" onSubmit={async e => { e.preventDefault(); if (await action(`/api/products/${parent}/variants`, { sku, label, price: Number(price), initialStock: Number(stock) })) { setSku(''); setLabel(''); setStock('0'); } }}>
        <label className="field">{t('Parent product')}<select required value={parent} onChange={e => setParent(e.target.value)}><option value="">{t('Choose product')}</option>{productOptions.filter(p => !p.parentProductId).map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}</select></label>
        <label className="field">{t('Variant label')}<input required maxLength={100} value={label} onChange={e => setLabel(e.target.value)} /></label>
        <label className="field">{t('SKU')}<input required maxLength={64} value={sku} onChange={e => setSku(e.target.value)} /></label>
        <label className="field">{t('Price')}<input required type="number" min="0.01" step="0.01" value={price} onChange={e => setPrice(e.target.value)} /></label>
        <label className="field">{t('Opening stock')}<input required type="number" min="0" max="100000" value={stock} onChange={e => setStock(e.target.value)} /></label>
        <button className="btn btn--primary" disabled={busy}>{t('Create variant')}</button>
      </form>
    </section>
  </>;
}

function ReviewQueue() {
  const request = useAuthedRequest(); const toast = useToast(); const [busy, setBusy] = useState(false); const [responses, setResponses] = useState<Record<number, string>>({});
  const reviews = useQuery({ queryKey: ['review-moderation'], queryFn: () => request<Review[]>('/api/reviews/moderation') });
  return <section className="card-glass stack" style={{ padding: 'var(--space-4)' }}><h2>{t('Review moderation')}</h2>
    {reviews.isError && <ErrorState error={reviews.error} />}
    {reviews.data?.map(review => <article key={review.id} className="address-card stack"><Link to={`/products/${review.productId}`}>{t('View product')}</Link>
      <strong>{review.rating}/5 · {t(review.isApproved ? 'Published' : 'Awaiting review')} · {t('Reports')}: {review.reports}</strong><p>{review.comment}</p>
      <label className="field">{t('Merchant response')}<textarea maxLength={2000} value={responses[review.id] ?? review.merchantResponse ?? ''} onChange={e => setResponses(current => ({ ...current, [review.id]: e.target.value }))} /></label>
      <div className="row">{[true, false].map(approved => <button className="btn" key={String(approved)} disabled={busy} onClick={async () => {
        setBusy(true); try { await request(`/api/reviews/${review.id}/moderation`, { method: 'PUT', body: { isApproved: approved, response: responses[review.id] ?? review.merchantResponse ?? '' } }); await reviews.refetch(); }
        catch (error) { toast.pushError(error); } finally { setBusy(false); }
      }}>{t(approved ? 'Publish review' : 'Hide review')}</button>)}</div>
    </article>)}
  </section>;
}

function DeliveryRatesEditor() {
  const request = useAuthedRequest(); const toast = useToast(); const [draft, setDraft] = useState<Rate[] | null>(null); const [busy, setBusy] = useState(false);
  const rates = useQuery({ queryKey: ['delivery-rates'], queryFn: () => request<Rate[]>('/api/delivery/rates') });
  const rows = draft ?? rates.data ?? [];
  const change = (index: number, patch: Partial<Rate>) => setDraft(rows.map((rate, i) => i === index ? { ...rate, ...patch } : rate));
  return <section className="card-glass stack" style={{ padding: 'var(--space-4)' }}><h2>{t('Delivery rates & estimates')}</h2>
    <p>{t('Specific district rules take priority over division and country rules. Configure only destinations the store can fulfil.')}</p>
    {rates.isError && <ErrorState error={rates.error} />}
    <form className="stack" onSubmit={async e => { e.preventDefault(); setBusy(true); try { await request('/api/delivery/rates', { method: 'PUT', body: rows }); await rates.refetch(); setDraft(null); toast.push('success', t('Changes saved.')); } catch (error) { toast.pushError(error); } finally { setBusy(false); } }}>
      {rows.map((rate, index) => <fieldset className="address-fields address-card" key={index}>
        <label className="field">{t('Country / region')}<select value={rate.countryCode} onChange={e => change(index, { countryCode: e.target.value, division: null, district: null })}>{Object.keys(addressCountries).map(code => <option key={code} value={code}>{countryName(code)}</option>)}</select></label>
        <label className="field">{t('Division / state (optional)')}<input maxLength={80} value={rate.division ?? ''} onChange={e => change(index, { division: e.target.value || null })} /></label>
        <label className="field">{t('District / city (optional)')}<input maxLength={80} value={rate.district ?? ''} onChange={e => change(index, { district: e.target.value || null })} /></label>
        <label className="field">{t('Currency')}<select value={rate.currency} onChange={e => change(index, { currency: e.target.value })}><option>{t('BDT')}</option><option>{t('USD')}</option></select></label>
        <label className="field">{t('Delivery fee')}<input required type="number" min="0" step="0.01" value={rate.fee} onChange={e => change(index, { fee: Number(e.target.value) })} /></label>
        <label className="field">{t('Free shipping above (optional)')}<input type="number" min="0" step="0.01" value={rate.freeAbove ?? ''} onChange={e => change(index, { freeAbove: e.target.value ? Number(e.target.value) : null })} /></label>
        <label className="field">{t('Minimum delivery days (optional)')}<input type="number" min="0" max="365" value={rate.minDays ?? ''} onChange={e => change(index, { minDays: e.target.value ? Number(e.target.value) : null })} /></label>
        <label className="field">{t('Maximum delivery days (optional)')}<input type="number" min={rate.minDays ?? 0} max="365" value={rate.maxDays ?? ''} onChange={e => change(index, { maxDays: e.target.value ? Number(e.target.value) : null })} /></label>
        <button type="button" className="btn btn--ghost" onClick={() => setDraft(rows.filter((_, i) => i !== index))}>{t('Remove')}</button>
      </fieldset>)}
      <div className="row"><button type="button" className="btn" onClick={() => setDraft([...rows, { countryCode: 'BD', division: null, district: null, currency: 'BDT', fee: 0, freeAbove: null, minDays: null, maxDays: null }])}>{t('Add delivery rule')}</button><button className="btn btn--primary" disabled={busy || !rows.length}>{t('Save delivery rules')}</button></div>
    </form>
  </section>;
}
