import { t, useLanguage } from '../i18n/language';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ApiError, apiRequest } from '../api/client';
import { usePlaceOrder, useValidateCoupon, useValidateGiftCard, useEvaluateCartPromotions, useAvailableCoupons, useProcessPayment, useProfile } from '../api/hooks';
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
  const evaluatePromotions = useEvaluateCartPromotions();
  const processPayment = useProcessPayment();

  const [autoPromo, setAutoPromo] = useState<CouponValidationResult | null>(null);
  const [showCouponsDrawer, setShowCouponsDrawer] = useState<boolean>(false);
  const availableCouponsQuery = useAvailableCoupons();

  const defaultCoupons: { code: string; title: string; discountText: string; minOrder: number; type: 'percent' | 'fixed' }[] = [
    { code: 'SAVE10', title: '10% OFF Storewide', discountText: '10% OFF', minOrder: 0, type: 'percent' },
    { code: 'NINECUBE', title: 'BDT 500 OFF Big Basket', discountText: 'BDT 500 OFF', minOrder: 2000, type: 'fixed' },
    { code: 'WELCOME50', title: 'BDT 50 Welcome Discount', discountText: 'BDT 50 OFF', minOrder: 0, type: 'fixed' }
  ];

  const availableCoupons = (availableCouponsQuery.data && availableCouponsQuery.data.length > 0)
    ? availableCouponsQuery.data.map(c => ({
        code: c.code,
        title: c.campaignTitle || (c.discountType === 'Percentage' ? `${c.discountValue}% OFF` : `BDT ${c.discountValue} OFF`),
        discountText: c.discountType === 'Percentage' ? `${c.discountValue}% OFF` : `BDT ${c.discountValue} OFF`,
        minOrder: c.minOrderAmount,
        type: c.discountType === 'Percentage' ? ('percent' as const) : ('fixed' as const)
      }))
    : defaultCoupons;
  const [freeShippingThreshold, setFreeShippingThreshold] = useState<number>(2500);

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

  // Auto-evaluate cart promotions dynamically without typing coupon codes
  useEffect(() => {
    if (cart.lines.length === 0 || cart.total <= 0) {
      setAutoPromo(null);
      return;
    }

    const payload = {
      subTotal: cart.total,
      items: cart.lines.map(l => ({ productId: l.productId, quantity: l.quantity, unitPrice: l.unitPrice })),
      manualCouponCode: couponCode.trim() || undefined
    };

    evaluatePromotions.mutateAsync(payload)
      .then(res => {
        if (res.automaticDiscount && res.automaticDiscount.isValid) {
          setAutoPromo(res.automaticDiscount);
        } else {
          setAutoPromo(null);
        }
        if (res.freeShippingThreshold) {
          setFreeShippingThreshold(res.freeShippingThreshold);
        }
      })
      .catch(() => {
        // Fallback gracefully if evaluation endpoint is offline
      });
  }, [cart.total, cart.lines.length, couponCode]);

  // Promotional discount resolution: manual coupon takes precedence if applied, else auto-promo
  const effectiveDiscount = appliedCoupon?.isValid ? appliedCoupon : autoPromo;
  const isAutoApplied = !appliedCoupon?.isValid && !!autoPromo?.isValid;
  const discountAmount = effectiveDiscount?.isValid ? effectiveDiscount.discountAmount : 0;

  const amountAfterCoupon = Math.max(0, cart.total - discountAmount);
  const giftCardDeduction = appliedGiftCard?.isValid ? Math.min(amountAfterCoupon, appliedGiftCard.currentBalance) : 0;
  const remainingGiftCardBalance = appliedGiftCard?.isValid ? appliedGiftCard.currentBalance - giftCardDeduction : 0;
  const finalTotal = Math.max(0, amountAfterCoupon - giftCardDeduction);

  const qualifiesForFreeShipping = cart.total >= freeShippingThreshold;
  const amountNeededForFreeShipping = Math.max(0, freeShippingThreshold - cart.total);
  const freeShippingPercent = Math.min(100, Math.round((cart.total / (freeShippingThreshold || 1)) * 100));

  const applyCoupon = async (override?: string) => {
    const code = (override ?? couponCode).trim().toUpperCase();
    if (!code) return;
    setCouponCode(code);
    setCouponError(null);
    try {
      const res = await validateCoupon.mutateAsync({
        code,
        subTotal: cart.total,
        items: cart.lines.map(l => ({ productId: l.productId, quantity: l.quantity, unitPrice: l.unitPrice }))
      });
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

  const applyGiftCard = async (override?: string) => {
    const code = (override ?? giftCardCode).trim().toUpperCase();
    if (!code) return;
    setGiftCardCode(code);
    setGiftCardError(null);
    try {
      const res = await validateGiftCard.mutateAsync(code);
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
        couponCode: effectiveDiscount?.code ?? undefined,
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
                  className="link-button cart-line-remove-btn"
                  onClick={() => cart.remove(line.productId)}
                  aria-label={t(`Remove ${line.name} from the cart`)}
                  style={{ color: 'var(--danger)', fontSize: 'var(--text-xs)', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                >
                  🗑️ {t("Remove")}</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {cart.lines.length > 0 && (
        <div style={{ padding: '10px 14px', background: 'var(--surface-muted, rgba(255,255,255,0.04))', borderRadius: '8px', border: '1px solid var(--border)', margin: 'var(--space-2) 0' }}>
          <div className="row-between" style={{ fontSize: 'var(--text-xs)', marginBottom: '6px' }}>
            <span style={{ fontWeight: 650, display: 'flex', alignItems: 'center', gap: '6px' }}>
              {qualifiesForFreeShipping ? (
                <span style={{ color: 'var(--ok, #10b981)' }}>🎉 {t("You've unlocked FREE Delivery!")}</span>
              ) : (
                <span>🚚 {t("Add")} <strong style={{ color: 'var(--accent, #6366f1)' }}>{formatMoney(amountNeededForFreeShipping, cart.currency)}</strong> {t("more for FREE Delivery!")}</span>
              )}
            </span>
            <span style={{ color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
              {freeShippingPercent}%
            </span>
          </div>
          <div style={{ height: '6px', background: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
            <div
              style={{
                width: `${freeShippingPercent}%`,
                height: '100%',
                background: qualifiesForFreeShipping ? 'var(--ok, #10b981)' : 'linear-gradient(90deg, #6366f1, #10b981)',
                transition: 'width 0.4s ease'
              }}
            />
          </div>
        </div>
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

          {/* Coupon Code & Auto-Applied Promotions */}
          <div className="cart-coupon-block">
            <span style={{ fontWeight: 600, fontSize: 'var(--text-sm)', display: 'block', marginBottom: 'var(--space-1)' }}>{t("Promotions & Discounts")}</span>

            {/* Auto-applied promotion chip when active without typing code */}
            {isAutoApplied && autoPromo && (
              <div style={{ padding: '8px 12px', background: 'var(--warn-bg, rgba(245, 158, 11, 0.12))', border: '1px solid var(--warn-border, rgba(245, 158, 11, 0.4))', borderRadius: '6px', marginBottom: 'var(--space-2)' }}>
                <div className="row-between">
                  <span style={{ fontWeight: 700, fontSize: 'var(--text-xs)', color: 'var(--warn-text, #f59e0b)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    ⚡ {t("Auto-Applied Promotion:")} {autoPromo.campaignTitle || autoPromo.code}
                  </span>
                  <strong style={{ fontSize: 'var(--text-xs)', color: 'var(--ok, #10b981)' }}>
                    -{formatMoney(autoPromo.discountAmount, cart.currency)}
                  </strong>
                </div>
                <span style={{ display: 'block', fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  {t("No code needed. Automatically applied to your basket.")}
                </span>
              </div>
            )}
            {appliedCoupon?.isValid ? (
              <div className="row-between" style={{ padding: '8px 12px', background: 'var(--surface-ok, rgba(16,185,129,0.1))', borderRadius: '6px', border: '1px solid var(--ok, #10b981)' }}>
                <div>
                  <span style={{ color: 'var(--ok, #10b981)', fontWeight: 700, fontSize: 'var(--text-sm)', display: 'block' }}>
                    ✓ {appliedCoupon.code} (-{formatMoney(appliedCoupon.discountAmount, cart.currency)})
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {t("Coupon applied to this basket")}
                  </span>
                </div>
                <button type="button" className="link-button" onClick={removeCoupon} style={{ color: 'var(--danger)', fontSize: 'var(--text-xs)', fontWeight: 600 }}>
                  {t("Remove")}
                </button>
              </div>
            ) : (
              <div className="row" style={{ gap: 'var(--space-2)' }}>
                <input
                  type="text"
                  className="cart-input"
                  placeholder={t("Enter coupon code")}
                  value={couponCode}
                  onChange={e => setCouponCode(e.target.value.toUpperCase())}
                  aria-label={t("Coupon code")}
                  style={{ textTransform: 'uppercase' }}
                />
                <button
                  type="button"
                  className="btn btn--sm"
                  onClick={() => applyCoupon()}
                  disabled={validateCoupon.isPending || !couponCode.trim()}
                >
                  {t(validateCoupon.isPending ? 'Checking…' : 'Apply')}
                </button>
              </div>
            )}
            {couponError && <p style={{ color: 'var(--danger)', fontSize: 'var(--text-xs)', margin: '4px 0 0 0' }}>{t(couponError)}</p>}

            {/* Interactive Available Coupons & Offers Accordion */}
            <div className="cart-coupons-container">
              <button
                type="button"
                className="cart-toggle-coupons-btn"
                onClick={() => setShowCouponsDrawer(!showCouponsDrawer)}
                aria-expanded={showCouponsDrawer}
              >
                <span>🏷️ {t("Available Coupons & Offers")} ({availableCoupons.length})</span>
                <span>{showCouponsDrawer ? '▲ ' + t("Hide Available Coupons") : '▼ ' + t("View Available Coupons")}</span>
              </button>

              {showCouponsDrawer && (
                <div className="cart-coupon-list">
                  {availableCoupons.map((c) => {
                    const isEligible = cart.total >= c.minOrder;
                    const shortfall = Math.max(0, c.minOrder - cart.total);
                    const isCurrentlyApplied = appliedCoupon?.isValid && appliedCoupon.code === c.code;

                    return (
                      <div key={c.code} className={`cart-coupon-card ${isCurrentlyApplied ? 'cart-coupon-card--active' : ''}`}>
                        <div className="cart-coupon-info">
                          <div className="row" style={{ alignItems: 'center', gap: '8px' }}>
                            <span className="cart-coupon-badge">{c.code}</span>
                            <span className="cart-coupon-title">{c.title}</span>
                          </div>
                          <span className="cart-coupon-desc">
                            {c.minOrder > 0
                              ? `${t("Min order")}: ${formatMoney(c.minOrder, cart.currency)}`
                              : t("Storewide")}
                            {shortfall > 0
                              ? ` · ${t("Add")} ${formatMoney(shortfall, cart.currency)} ${t("more")}`
                              : ` · ${t("Eligible")}`}
                          </span>
                        </div>

                        <div>
                          {isCurrentlyApplied ? (
                            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ok, #10b981)', fontWeight: 700 }}>
                              ✓ {t("Applied")}
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="btn btn--sm"
                              disabled={!isEligible || validateCoupon.isPending}
                              onClick={() => applyCoupon(c.code)}
                              style={{ padding: '4px 10px', fontSize: '11px' }}
                            >
                              {t("Apply")}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Gift Card Code */}
          <div className="cart-giftcard-block">
            <span style={{ fontWeight: 600, fontSize: 'var(--text-sm)', display: 'block', marginBottom: 'var(--space-1)' }}>🎁 {t("Gift card")}</span>
            {appliedGiftCard?.isValid ? (
              <div className="stack" style={{ gap: '4px', padding: '8px 12px', background: 'var(--surface-raised, rgba(99, 102, 241, 0.1))', borderRadius: '6px', border: '1px solid var(--accent, #6366f1)' }}>
                <div className="row-between">
                  <span style={{ color: 'var(--accent-text, var(--accent))', fontWeight: 700, fontSize: 'var(--text-sm)', fontFamily: 'monospace' }}>
                    🎁 {appliedGiftCard.code}
                  </span>
                  <button type="button" className="link-button" onClick={removeGiftCard} style={{ color: 'var(--danger)', fontSize: 'var(--text-xs)', fontWeight: 600 }}>
                    {t("Remove")}
                  </button>
                </div>
                <div className="row-between" style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                  <span>{t("Applied to order:")} -{formatMoney(giftCardDeduction, cart.currency)}</span>
                  <span>{t("Remaining balance:")} {formatMoney(remainingGiftCardBalance, cart.currency)}</span>
                </div>
              </div>
            ) : (
              <div>
                <div className="row" style={{ gap: 'var(--space-2)' }}>
                  <input
                    type="text"
                    className="cart-input"
                    placeholder={t("Enter gift card code (e.g. GC-...)")}
                    value={giftCardCode}
                    onChange={e => setGiftCardCode(e.target.value.toUpperCase())}
                    aria-label={t("Gift card code")}
                    style={{ textTransform: 'uppercase', fontFamily: 'monospace' }}
                  />
                  <button
                    type="button"
                    className="btn btn--sm"
                    onClick={() => applyGiftCard(giftCardCode)}
                    disabled={validateGiftCard.isPending || !giftCardCode.trim()}
                  >
                    {t(validateGiftCard.isPending ? 'Checking…' : 'Apply')}
                  </button>
                </div>

                {/* Quick Test Demo Chips for Gift Cards */}
                <div className="cart-quick-chips">
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{t("Try test gift card:")}</span>
                  {['GC-WELCOME-1000', 'GC-EID2026-2500', 'GC-VIP-5000'].map((code) => (
                    <button
                      key={code}
                      type="button"
                      className="cart-quick-chip"
                      onClick={() => applyGiftCard(code)}
                    >
                      {code}
                    </button>
                  ))}
                  <Link to="/gift-cards" className="link-button" style={{ fontSize: '11px', marginLeft: 'auto' }}>
                    {t("Gift Cards Hub")} →
                  </Link>
                </div>
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

      {cart.lines.length > 0 && (
        <div className="cart-summary-box">
          <div className="row-between" style={{ marginBottom: '8px' }}>
            <span style={{ fontWeight: 700, fontSize: 'var(--text-sm)' }}>{t("Order Summary")}</span>
            {qualifiesForFreeShipping && (
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ok, #10b981)', fontWeight: 600 }}>
                ✓ {t("Free Delivery")}
              </span>
            )}
          </div>

          <div className="cart-summary-row">
            <span>{t("Subtotal")}</span>
            <span>{t(formatMoney(cart.total, cart.currency))}</span>
          </div>

          <div className="cart-summary-row">
            <span>{t("Delivery Fee")}</span>
            <span style={{ color: qualifiesForFreeShipping ? 'var(--ok, #10b981)' : undefined, fontWeight: qualifiesForFreeShipping ? 600 : undefined }}>
              {qualifiesForFreeShipping ? t("Free Delivery") : t(formatMoney(60, cart.currency))}
            </span>
          </div>

          {discountAmount > 0 && (
            <div className="cart-summary-row cart-summary-row--highlight">
              <span>
                {isAutoApplied ? `⚡ ${t("Auto-Discount")}` : t("Coupon Discount")}
                {effectiveDiscount?.code ? ` (${effectiveDiscount.code})` : ''}
                {effectiveDiscount?.scopeSummary
                  ? ` · ${t("applies to")} ${effectiveDiscount.scopeSummary}`
                  : ''}
              </span>
              <span>-{formatMoney(discountAmount, cart.currency)}</span>
            </div>
          )}

          {giftCardDeduction > 0 && (
            <div className="cart-summary-row cart-summary-row--accent">
              <span>{t("Gift Card Applied")}</span>
              <span>-{t(formatMoney(giftCardDeduction, cart.currency))}</span>
            </div>
          )}

          <div className="cart-summary-row cart-summary-row--total">
            <span>{t("Order Total")}</span>
            <strong style={{ fontSize: 'var(--text-md)', color: 'var(--text)' }}>
              {t(cart.mixedCurrencies ? 'Separate currencies' : formatMoney(finalTotal, cart.currency))}
            </strong>
          </div>

          {finalTotal === 0 && giftCardDeduction > 0 && (
            <div style={{ marginTop: '8px', padding: '6px 10px', background: 'var(--surface-ok, rgba(16, 185, 129, 0.1))', border: '1px solid var(--ok, #10b981)', borderRadius: '6px', fontSize: 'var(--text-xs)', color: 'var(--ok, #10b981)' }}>
              ✓ {t("Your entire order is covered by this Gift Card!")}
            </div>
          )}
        </div>
      )}

      {cart.lines.length === 0 ? (
        <div className="cart-total">
          <span>{t("Total")}</span>
          <strong data-testid="cart-total">{t(formatMoney(0, cart.currency))}</strong>
        </div>
      ) : null}

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

      {cart.lines.length > 0 && (
        <div className="cart-sticky-dock stack" style={{ gap: 'var(--space-2)' }}>
          <div className="cart-summary-row cart-summary-row--total">
            <span>{t("Total")}</span>
            <strong data-testid="cart-total" style={{ fontSize: 'var(--text-lg)', color: 'var(--text)' }}>
              {t(cart.mixedCurrencies ? 'Separate currencies' : formatMoney(finalTotal, cart.currency))}
            </strong>
          </div>

          <button
            type="button"
            className="btn btn--primary"
            onClick={submit}
            disabled={busy || cart.lines.length === 0 || cart.mixedCurrencies}
            data-testid="place-order"
            style={{ width: '100%', padding: '12px', fontSize: 'var(--text-md)', fontWeight: 700 }}
          >
            {busy ? (
              <>
                <span className="spinner" aria-hidden="true" /> {t(" Placing order…")}</>
            ) : (
              'Place order'
            )}
          </button>
        </div>
      )}

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
