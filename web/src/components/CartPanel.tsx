import { t, useLanguage } from '../i18n/language';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ApiError, apiRequest } from '../api/client';
import { usePlaceOrder, useValidateCoupon, useValidateGiftCard, useProcessPayment, useProfile } from '../api/hooks';
import type { Order, Product, ShortItem, CouponValidationResult, ValidateGiftCardResult, PaymentMethod } from '../api/types';
import { Link } from 'react-router-dom';
import { createIdempotencyKey, formatMoney } from '../lib/helpers';
import { useAuth } from '../state/AuthContext';
import { useCart } from '../state/CartContext';
import { useToast } from './ui';

export interface CartPanelProps {
  onPlaced: (order: Order) => void;
}

/**
 * Order builder.
 *
 * Double-submit protection works in three layers: the button is disabled while a request is in
 * flight, a ref guard rejects a second click in the same tick, and the submission carries an
 * Idempotency-Key so even a duplicated request on the wire returns the original order.
 *
 * The key is generated once per submission attempt and deliberately kept after a network or
 * server error so an explicit retry is still idempotent. It is only cleared after the order is
 * accepted or the request is rejected for a client reason.
 */
export function CartPanel({ onPlaced }: CartPanelProps) {
  useLanguage();
  const cart = useCart();
  const { token } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const placeOrder = usePlaceOrder();

  const [shortItems, setShortItems] = useState<ShortItem[]>([]);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const { data: profile } = useProfile();
  const validateCoupon = useValidateCoupon();
  const validateGiftCard = useValidateGiftCard();
  const processPayment = useProcessPayment();

  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<CouponValidationResult | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);

  const [giftCardCode, setGiftCardCode] = useState('');
  const [appliedGiftCard, setAppliedGiftCard] = useState<ValidateGiftCardResult | null>(null);
  const [giftCardError, setGiftCardError] = useState<string | null>(null);

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CashOnDelivery');
  const [selectedAddressId, setSelectedAddressId] = useState<number | null>(null);

  useEffect(() => {
    if (profile?.addresses && profile.addresses.length > 0 && selectedAddressId === null) {
      const def = profile.addresses.find(a => a.isDefault) ?? profile.addresses[0];
      if (def) setSelectedAddressId(def.id);
    }
  }, [profile, selectedAddressId]);

  const discountAmount = appliedCoupon?.isValid ? appliedCoupon.discountAmount : 0;
  const amountAfterCoupon = Math.max(0, cart.total - discountAmount);
  const giftCardDeduction = appliedGiftCard?.isValid ? Math.min(amountAfterCoupon, appliedGiftCard.currentBalance) : 0;
  const remainingGiftCardBalance = appliedGiftCard?.isValid ? appliedGiftCard.currentBalance - giftCardDeduction : 0;
  const finalTotal = Math.max(0, amountAfterCoupon - giftCardDeduction);

  const applyCoupon = async () => {
    if (!couponCode.trim()) return;
    setCouponError(null);
    try {
      const res = await validateCoupon.mutateAsync({ code: couponCode.trim(), subTotal: cart.total });
      if (res.isValid) {
        setAppliedCoupon(res);
        toast.push('success', `Coupon ${res.code} applied: save ${formatMoney(res.discountAmount, cart.currency)}!`);
      } else {
        setAppliedCoupon(null);
        setCouponError(res.reason ?? 'Invalid coupon code.');
      }
    } catch (err: any) {
      setAppliedCoupon(null);
      setCouponError(err.message ?? 'Failed to validate coupon.');
    }
  };

  const removeCoupon = () => {
    setAppliedCoupon(null);
    setCouponCode('');
    setCouponError(null);
  };

  const applyGiftCard = async () => {
    if (!giftCardCode.trim()) return;
    setGiftCardError(null);
    try {
      const res = await validateGiftCard.mutateAsync(giftCardCode.trim());
      if (res.isValid) {
        setAppliedGiftCard(res);
        toast.push('success', `Gift card applied: BDT ${res.currentBalance.toLocaleString()} available.`);
      } else {
        setAppliedGiftCard(null);
        setGiftCardError(res.reason ?? 'Invalid gift card code.');
      }
    } catch (err: any) {
      setAppliedGiftCard(null);
      setGiftCardError(err.message ?? 'Failed to validate gift card.');
    }
  };

  const removeGiftCard = () => {
    setAppliedGiftCard(null);
    setGiftCardCode('');
    setGiftCardError(null);
  };

  const idempotencyKey = useRef<string | null>(null);
  const inFlight = useRef(false);

  // The 409 payload is a photograph of the moment the order failed. Once the lines themselves fit what
  // the server reported, the banner has nothing left to say, so it is pruned rather than left to claim
  // a shortage the customer has already corrected.
  useEffect(() => {
    if (shortItems.length === 0) return;
    const stillShort = shortItems.flatMap((item) => {
      const line = cart.lines.find((other) => other.productId === item.productId);
      if (!line) return [];
      const available = Math.min(line.available, item.available);
      return line.quantity > available ? [{ ...item, requested: line.quantity, available }] : [];
    });
    const unchanged =
      stillShort.length === shortItems.length &&
      stillShort.every((item, index) => item.requested === shortItems[index].requested && item.available === shortItems[index].available);
    if (unchanged) return;
    setShortItems(stillShort);
    if (stillShort.length === 0) setInlineError(null);
  }, [cart.lines, shortItems]);

  const refreshStock = async (): Promise<void> => {
    const fresh = await Promise.all(
      cart.lines.map((line) => apiRequest<Product>(`/api/products/${line.productId}`, { token }))
    );
    cart.reconcile(fresh);
    // Fire, do not await: the panel has already told the customer what went short. Awaiting the
    // catalogue refetch here used to hold the submit guard open for seconds after the refusal.
    void queryClient.invalidateQueries({ queryKey: ['products'] });
  };

  const submit = async () => {
    if (inFlight.current || cart.lines.length === 0 || cart.mixedCurrencies) return;

    inFlight.current = true;
    setInlineError(null);
    setShortItems([]);
    setNotice(null);

    if (!idempotencyKey.current) idempotencyKey.current = createIdempotencyKey();

    try {
      const order = await placeOrder.mutateAsync({
        items: cart.lines.map((line) => ({ productId: line.productId, quantity: line.quantity })),
        couponCode: appliedCoupon?.code ?? undefined,
        giftCardCode: appliedGiftCard?.code ?? undefined,
        paymentMethod: finalTotal === 0 ? 'CashOnDelivery' : paymentMethod,
        idempotencyKey: idempotencyKey.current
      });

      if (paymentMethod !== 'CashOnDelivery') {
        try {
          await processPayment.mutateAsync({ orderId: order.id, provider: paymentMethod });
          order.paymentMethod = paymentMethod;
          order.paymentStatus = 'Paid';
          order.status = 'Confirmed';
        } catch (err) {
          console.warn('Payment recording failed:', err);
        }
      }

      idempotencyKey.current = null;
      setNotice(`Order #${order.id} placed.`);
      toast.push('success', `Order #${order.id} placed for ${formatMoney(order.totalAmount, order.currency)}.`);
      cart.clear();
      // The order is already committed. Refresh stock in the background so a slow catalogue
      // request cannot keep the successful checkout trapped inside the cart sheet.
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      onPlaced(order);
    } catch (error) {
      if (error instanceof ApiError && error.isUnauthorized) {
        // The auth layer redirects; nothing useful to show here.
        return;
      }

      if (error instanceof ApiError && error.isInsufficientStock) {
        setShortItems(error.shortItems);
        setInlineError('Some items no longer have enough stock. Your cart was kept so you can adjust it.');
        toast.push('error', 'Not enough stock for one or more items.');
        // Deliberately not awaited. Awaiting it held the double-submit guard open for as long as the
        // stock re-check took, so the customer's corrected "Place order" click was swallowed without
        // any feedback at all. The server is the authority: a retry that races the re-check is refused
        // again on its merits.
        refreshStock().catch(() => {
          // The re-check is a courtesy: the refusal above already stands whatever this does.
        });
        return;
      }

      if (error instanceof ApiError && (error.status === 400 || error.status === 404)) {
        // A client-side problem will not succeed on retry, so start a fresh attempt next time.
        idempotencyKey.current = null;
        setInlineError(error.message);
        toast.push('error', error.message);
        return;
      }

      // Network or server error: keep the same idempotency key so a retry is safe.
      const message =
        error instanceof ApiError
          ? `${error.message} You can safely press "Place order" again.`
          : 'The order could not be placed. You can safely press "Place order" again.';

      setInlineError(message);
      toast.pushError(error);
    } finally {
      inFlight.current = false;
    }
  };

  const busy = placeOrder.isPending;

  return (
    <section className="card-glass cart-panel" aria-labelledby="cart-heading">
      <div className="row-between">
        <h2 id="cart-heading" style={{ fontSize: 'var(--text-lg)' }}>
          {t("Your cart")}</h2>
        <span className="badge badge--neutral" data-testid="cart-count">
          {t(cart.itemCount)} {t(" item")}{t(cart.itemCount === 1 ? '' : 's')}
        </span>
      </div>

      {cart.lines.length === 0 ? (
        <p className="muted" data-testid="cart-empty">
          {t("Your cart is empty. Add products from the catalogue to build an order.")}</p>
      ) : (
        <ul className="cart-lines">
          {cart.lines.map((line) => (
            <li className="cart-line" key={line.productId} data-testid={`cart-line-${line.productId}`}>
              <div>
                <div className="cart-line__name">{t(line.name)}</div>
                <div className="cart-line__meta mono">{t(line.sku)}</div>
                <div className="cart-line__meta">
                  {t(formatMoney(line.unitPrice, line.currency))} {t(" each · ")}{t(line.available)} {t(" available")}</div>
              </div>
              <div className="stack" style={{ alignItems: 'flex-end' }}>
                <div className="stepper" role="group" aria-label={t(`Quantity for ${line.name}`)}>
                  <button
                    type="button"
                    className="btn btn--sm"
                    aria-label={t(`Decrease quantity for ${line.name}`)}
                    onClick={() => cart.setQuantity(line.productId, line.quantity - 1)}
                    disabled={line.quantity <= 1}
                  >
                    {t("−")}</button>
                  <span className="stepper__value">{t(line.quantity)}</span>
                  <button
                    type="button"
                    className="btn btn--sm"
                    aria-label={t(`Increase quantity for ${line.name}`)}
                    onClick={() => cart.setQuantity(line.productId, line.quantity + 1)}
                    disabled={line.quantity >= Math.min(line.available, 1000)}
                  >
                    {t("+")}</button>
                </div>
                <span className="nowrap">{t(formatMoney(line.unitPrice * line.quantity, line.currency))}</span>
                <button
                  type="button"
                  className="link-button"
                  onClick={() => cart.remove(line.productId)}
                  aria-label={t(`Remove ${line.name} from the cart`)}
                >
                  {t("Remove")}</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {cart.lines.length > 0 && (
        <div className="cart-checkout-extras stack" style={{ gap: 'var(--space-3)', margin: 'var(--space-3) 0', padding: 'var(--space-3)', background: 'var(--surface-muted, rgba(255,255,255,0.05))', borderRadius: 'var(--radius-md, 8px)' }}>
          {/* Address selection */}
          <div className="cart-address-block">
            <div className="row-between" style={{ marginBottom: 'var(--space-1)' }}>
              <span style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>{t("Delivery address")}</span>
              <Link to="/account/profile" className="link-button" style={{ fontSize: 'var(--text-xs)' }}>{t("Manage addresses")}</Link>
            </div>
            {profile?.addresses && profile.addresses.length > 0 ? (
              <select
                aria-label={t("Select delivery address")}
                value={selectedAddressId ?? ''}
                onChange={e => setSelectedAddressId(Number(e.target.value))}
                style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)' }}
              >
                {profile.addresses.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.label} ({a.division}, {a.district} - {a.addressLine})
                  </option>
                ))}
              </select>
            ) : (
              <p className="muted" style={{ fontSize: 'var(--text-xs)', margin: 0 }}>
                {t("No address saved.")} <Link to="/account/profile" className="link-button">{t("Add delivery address")}</Link>
              </p>
            )}
          </div>

          {/* Coupon Code */}
          <div className="cart-coupon-block">
            <span style={{ fontWeight: 600, fontSize: 'var(--text-sm)', display: 'block', marginBottom: 'var(--space-1)' }}>{t("Promotional coupon")}</span>
            {appliedCoupon?.isValid ? (
              <div className="row-between" style={{ padding: '6px 10px', background: 'var(--surface-ok, rgba(16,185,129,0.1))', borderRadius: '6px', border: '1px solid var(--ok, #10b981)' }}>
                <span style={{ color: 'var(--ok, #10b981)', fontWeight: 600, fontSize: 'var(--text-sm)' }}>
                  ✓ {appliedCoupon.code} (-{formatMoney(appliedCoupon.discountAmount, cart.currency)})
                </span>
                <button type="button" className="link-button" onClick={removeCoupon} style={{ color: 'var(--danger)', fontSize: 'var(--text-xs)' }}>
                  {t("Remove")}
                </button>
              </div>
            ) : (
              <div className="row" style={{ gap: 'var(--space-2)' }}>
                <input
                  type="text"
                  placeholder={t("Enter coupon code")}
                  value={couponCode}
                  onChange={e => setCouponCode(e.target.value.toUpperCase())}
                  aria-label={t("Coupon code")}
                  style={{ flex: 1, padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', textTransform: 'uppercase' }}
                />
                <button
                  type="button"
                  className="btn btn--sm"
                  onClick={applyCoupon}
                  disabled={validateCoupon.isPending || !couponCode.trim()}
                >
                  {t(validateCoupon.isPending ? 'Checking…' : 'Apply')}
                </button>
              </div>
            )}
            {couponError && <p style={{ color: 'var(--danger)', fontSize: 'var(--text-xs)', margin: '4px 0 0 0' }}>{t(couponError)}</p>}
          </div>

          {/* Gift Card Code */}
          <div className="cart-giftcard-block">
            <span style={{ fontWeight: 600, fontSize: 'var(--text-sm)', display: 'block', marginBottom: 'var(--space-1)' }}>🎁 {t("Gift card")}</span>
            {appliedGiftCard?.isValid ? (
              <div className="stack" style={{ gap: '4px', padding: '8px 10px', background: 'rgba(99, 102, 241, 0.1)', borderRadius: '6px', border: '1px solid rgba(99, 102, 241, 0.4)' }}>
                <div className="row-between">
                  <span style={{ color: 'var(--accent, #a78bfa)', fontWeight: 700, fontSize: 'var(--text-sm)', fontFamily: 'monospace' }}>
                    🎁 {appliedGiftCard.code}
                  </span>
                  <button type="button" className="link-button" onClick={removeGiftCard} style={{ color: 'var(--danger)', fontSize: 'var(--text-xs)' }}>
                    {t("Remove")}
                  </button>
                </div>
                <div className="row-between" style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)' }}>
                  <span>{t("Applied to order:")} -{formatMoney(giftCardDeduction, cart.currency)}</span>
                  <span>{t("Remaining balance:")} {formatMoney(remainingGiftCardBalance, cart.currency)}</span>
                </div>
              </div>
            ) : (
              <div className="row" style={{ gap: 'var(--space-2)' }}>
                <input
                  type="text"
                  placeholder={t("Enter gift card code (e.g. GC-...)")}
                  value={giftCardCode}
                  onChange={e => setGiftCardCode(e.target.value.toUpperCase())}
                  aria-label={t("Gift card code")}
                  style={{ flex: 1, padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', textTransform: 'uppercase', fontFamily: 'monospace' }}
                />
                <button
                  type="button"
                  className="btn btn--sm"
                  onClick={applyGiftCard}
                  disabled={validateGiftCard.isPending || !giftCardCode.trim()}
                >
                  {t(validateGiftCard.isPending ? 'Checking…' : 'Apply')}
                </button>
              </div>
            )}
            {giftCardError && <p style={{ color: 'var(--danger)', fontSize: 'var(--text-xs)', margin: '4px 0 0 0' }}>{t(giftCardError)}</p>}
          </div>

          {/* Payment Method */}
          <div className="cart-payment-block">
            <span style={{ fontWeight: 600, fontSize: 'var(--text-sm)', display: 'block', marginBottom: 'var(--space-1)' }}>{t("Payment method")}</span>
            <div className="row" style={{ gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: 'var(--text-xs)', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="paymentMethod"
                  value="CashOnDelivery"
                  checked={paymentMethod === 'CashOnDelivery'}
                  onChange={() => setPaymentMethod('CashOnDelivery')}
                />
                <span>💵 {t("Cash on Delivery")}</span>
              </label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: 'var(--text-xs)', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="paymentMethod"
                  value="Card"
                  checked={paymentMethod === 'Card'}
                  onChange={() => setPaymentMethod('Card')}
                />
                <span>💳 {t("Card (Visa/Mastercard)")}</span>
              </label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: 'var(--text-xs)', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="paymentMethod"
                  value="MobileFinancialService"
                  checked={paymentMethod === 'MobileFinancialService'}
                  onChange={() => setPaymentMethod('MobileFinancialService')}
                />
                <span>📱 {t("Mobile Banking (bKash/Nagad)")}</span>
              </label>
            </div>
          </div>
        </div>
      )}

      {discountAmount > 0 && (
        <div className="row-between" style={{ fontSize: 'var(--text-sm)', color: 'var(--muted)', marginBottom: 'var(--space-1)' }}>
          <span>{t("Subtotal")}</span>
          <span>{t(formatMoney(cart.total, cart.currency))}</span>
        </div>
      )}
      {discountAmount > 0 && (
        <div className="row-between" style={{ fontSize: 'var(--text-sm)', color: 'var(--ok, #10b981)', marginBottom: 'var(--space-2)' }}>
          <span>{t("Discount")}</span>
          <span>-{t(formatMoney(discountAmount, cart.currency))}</span>
        </div>
      )}
      {giftCardDeduction > 0 && (
        <div className="row-between" style={{ fontSize: 'var(--text-sm)', color: 'var(--accent, #a78bfa)', marginBottom: 'var(--space-2)' }}>
          <span>{t("Gift Card Applied")}</span>
          <span>-{t(formatMoney(giftCardDeduction, cart.currency))}</span>
        </div>
      )}
      {finalTotal === 0 && giftCardDeduction > 0 && (
        <div style={{ padding: '6px 10px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid var(--ok, #10b981)', borderRadius: '6px', fontSize: 'var(--text-xs)', color: 'var(--ok, #10b981)', marginBottom: 'var(--space-2)' }}>
          ✓ {t("Your entire order is covered by this Gift Card!")}
        </div>
      )}

      <div className="cart-total">
        <span>{t("Total")}</span>
        <strong data-testid="cart-total">{t(cart.mixedCurrencies ? 'Separate currencies' : formatMoney(finalTotal, cart.currency))}</strong>
      </div>

      {shortItems.length > 0 ? (
        <div role="alert" data-testid="short-items" className="inline-banner">
          <span aria-hidden="true">{t("⚠")}</span>
          <span>
            <strong>{t("Stock changed in your cart.")}</strong> {t(" Not enough stock for ")}{t(shortItems.length)} {t(" item")}{t(shortItems.length === 1 ? '' : 's')}{t(":")}</span>
          <ul className="short-items">
            {shortItems.map((item) => (
              <li key={item.productId}>
                <span>
                  {t(item.name)} <span className="mono">{t(item.sku)}</span>
                </span>
                <span className="nowrap">
                  {t("requested ")}{t(item.requested)} {t(" · available ")}{t(item.available)}
                </span>
              </li>
            ))}
          </ul>
          <span>{t("Update the quantities and try again. This banner stays until resolved.")}</span>
        </div>
      ) : null}

      {cart.mixedCurrencies ? <p role="alert">{t("Place BDT and legacy-currency products in separate orders. Remove one currency to continue.")}</p> : null}
      {inlineError ? (
        <p role="alert" data-testid="cart-error" style={{ color: 'var(--danger)', fontWeight: 600 }}>
          {t(inlineError)}
        </p>
      ) : null}

      {notice ? (
        <p role="status" data-testid="cart-notice" style={{ color: 'var(--ok)', fontWeight: 600 }}>
          {t(notice)}
        </p>
      ) : null}

      <button
        type="button"
        className="btn btn--primary"
        onClick={submit}
        disabled={busy || cart.lines.length === 0 || cart.mixedCurrencies}
        data-testid="place-order"
      >
        {busy ? (
          <>
            <span className="spinner" aria-hidden="true" /> {t(" Placing order…")}</>
        ) : (
          'Place order'
        )}
      </button>

      <span className="visually-hidden" role="status" aria-live="polite">
        {t(busy ? 'Placing your order' : '')}
      </span>
    </section>
  );
}

/**
 * Responsive cart dialog: a bottom sheet on mobile and centered panel on desktop.
 * Opened from the shared navbar or mobile bottom bar.
 */
export function CartSheet({ onPlaced, onOpenChange }: CartPanelProps & { onOpenChange?: (open: boolean) => void }) {
  useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { onOpenChange?.(open); }, [open, onOpenChange]);
  const touchY = useRef<number | null>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const show = (event: Event) => {
      const trigger = (event as CustomEvent<{ trigger?: HTMLElement }>).detail?.trigger;
      returnTo.current = trigger ?? (document.activeElement as HTMLElement | null);
      setOpen(true);
    };
    document.addEventListener('ninecube:open-cart-sheet', show);
    return () => {
      document.removeEventListener('ninecube:open-cart-sheet', show);
    };
  }, []);

  useEffect(() => {
    if (open) {
      document.documentElement.setAttribute('data-overlay-open', 'true');
      ref.current?.querySelector<HTMLElement>('button, [href], input')?.focus();
    } else {
      document.documentElement.removeAttribute('data-overlay-open');
      returnTo.current?.focus?.();
    }
  }, [open ]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setOpen(false); return; }
      if (event.key !== 'Tab') return;
      const node = ref.current;
      if (!node) return;
      const items = Array.from(node.querySelectorAll<HTMLElement>('button, [href], input')).filter((el) => !el.hasAttribute('disabled'));
      const first = items[0]; const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open ]);

  if (!open) return null;

  return createPortal(
    <div className="sheet-backdrop" onClick={() => setOpen(false)} role="presentation">
      <div ref={ref} className="sheet" role="dialog" aria-modal="true" aria-label={t("Your cart")} data-overlay-open="true"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => { touchY.current = e.touches[0]?.clientY ?? null; }}
        onTouchEnd={(e) => {
          const start = touchY.current; const end = e.changedTouches[0]?.clientY ?? null;
          if (start !== null && end !== null && end - start > 80) setOpen(false);
        }}>
        <div className="sheet__handle" aria-hidden="true" />
        <button type="button" className="btn cart-sheet__close" aria-label={t("Close cart")} onClick={() => setOpen(false)}>{t("Close")}</button>
        <CartPanel onPlaced={(order) => { setOpen(false); onPlaced(order); }} />
      </div>
    </div>,
    document.body
  );
}
