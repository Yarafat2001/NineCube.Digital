import { AddressFields } from './AddressBook';
import type { AddressInput } from '../api/hooks';
import { addressLines } from '../lib/addresses';
import { t, useLanguage } from '../i18n/language';
import { useQueryClient } from '@tanstack/react-query';
import { useCheckoutQuote, useCheckoutOptions } from '../api/hooks';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ApiError, apiRequest } from '../api/client';
import { usePlaceOrder, useValidateCoupon, useValidateGiftCard, useEvaluateCartPromotions, useAvailableCoupons, useProcessPayment, useProfile, useProducts } from '../api/hooks';
import type { Order, Product, ShortItem, CouponValidationResult, ValidateGiftCardResult, PaymentMethod } from '../api/types';
import { Link, useNavigate } from 'react-router-dom';
import { createIdempotencyKey, formatMoney } from '../lib/helpers';
import { Icon } from './Icon';
import { useAuth } from '../state/AuthContext';
import { useCart } from '../state/CartContext';
import { useToast } from './ui';

export interface CartPanelProps {
  onPlaced: (order: Order) => void;
  onClose?: () => void;
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
export function CartPanel({ onPlaced, onClose }: CartPanelProps) {
  useLanguage();
  const cart = useCart();
  const navigate = useNavigate();
  const { token, user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const placeOrder = usePlaceOrder();

  const [shortItems, setShortItems] = useState<ShortItem[]>([]);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const { data: profile } = useProfile(!!user);
  const [guestDetails, setGuestDetails] = useState({ name: '', email: '' });
  const [guestAddress, setGuestAddress] = useState<AddressInput>({ label: 'Delivery', countryCode: 'BD', phone: '', division: '', district: '', upazila: '', addressLine: '', isDefault: true });
  const [guestErrors, setGuestErrors] = useState<Record<string, string[]>>({});
  const [guestSession, setGuestSession] = useState<{ token: string; addressId: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const validateCoupon = useValidateCoupon();
  const validateGiftCard = useValidateGiftCard();
  const evaluatePromotions = useEvaluateCartPromotions();
  const processPayment = useProcessPayment();
  const checkoutOptions = useCheckoutOptions();
  const productsQuery = useProducts({ q: '', page: 1, pageSize: 6 });
  const upsellProducts = (productsQuery.data?.items ?? [])
    .filter((p) => p.isActive && p.stockQuantity > 0 && !cart.lines.some((l) => l.productId === p.id))
    .slice(0, 3);

  const [autoPromo, setAutoPromo] = useState<CouponValidationResult | null>(null);
  const [showCouponsDrawer, setShowCouponsDrawer] = useState<boolean>(false);
  const availableCouponsQuery = useAvailableCoupons();


  const availableCoupons = (availableCouponsQuery.data && availableCouponsQuery.data.length > 0)
    ? availableCouponsQuery.data.map(c => ({
        code: c.code,
        title: c.campaignTitle || (c.discountType === 'Percentage' ? `${c.discountValue}% OFF` : `BDT ${c.discountValue} OFF`),
        discountText: c.discountType === 'Percentage' ? `${c.discountValue}% OFF` : `BDT ${c.discountValue} OFF`,
        minOrder: c.minOrderAmount,
        type: c.discountType === 'Percentage' ? ('percent' as const) : ('fixed' as const)
      }))
    : [];
  const [freeShippingThreshold, setFreeShippingThreshold] = useState<number>(2500);

  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<CouponValidationResult | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);

  const [giftCardCode, setGiftCardCode] = useState('');
  const [appliedGiftCard, setAppliedGiftCard] = useState<ValidateGiftCardResult | null>(null);
  const [giftCardError, setGiftCardError] = useState<string | null>(null);

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CashOnDelivery');
  const [selectedAddressId, setSelectedAddressId] = useState<number | null>(null);
  const [deliveryInstructions, setDeliveryInstructions] = useState('');

  useEffect(() => {
    if (profile?.addresses && profile.addresses.length > 0 && selectedAddressId === null) {
      const available = profile.addresses;
      const def = available.find(a => a.isDefault) ?? available[0] ?? profile.addresses[0];
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

  const destination = user ? profile?.addresses.find(a => a.id === selectedAddressId) : guestAddress;
  const quote = useCheckoutQuote(cart.lines.map(l => ({ productId: l.productId, quantity: l.quantity })),
    appliedCoupon?.isValid ? appliedCoupon.code ?? undefined : undefined, appliedGiftCard?.isValid ? appliedGiftCard.code ?? undefined : undefined,
    { deliveryCountryCode: destination?.countryCode ?? 'BD', deliveryDivision: destination?.division, deliveryDistrict: destination?.district });
  const discountAmount = quote.data?.discountAmount ?? (effectiveDiscount?.isValid ? effectiveDiscount.discountAmount : 0);
  const shippingAmount = quote.data?.shippingAmount ?? (cart.currency === 'BDT' && cart.total < freeShippingThreshold ? 60 : 0);
  const amountAfterCoupon = Math.max(0, cart.total - discountAmount) + shippingAmount;
  const giftCardDeduction = appliedGiftCard?.isValid ? Math.min(amountAfterCoupon, appliedGiftCard.currentBalance) : 0;
  const remainingGiftCardBalance = appliedGiftCard?.isValid ? appliedGiftCard.currentBalance - giftCardDeduction : 0;
  const finalTotal = quote.data?.totalAmount ?? Math.max(0, amountAfterCoupon - giftCardDeduction);
  const onlineAvailable = checkoutOptions.data?.onlinePaymentsEnabled && cart.currency === 'BDT' && finalTotal >= 10 && finalTotal <= 500000;
  useEffect(() => {
    if (!onlineAvailable && paymentMethod !== 'CashOnDelivery') setPaymentMethod('CashOnDelivery');
  }, [onlineAvailable, paymentMethod]);

  const qualifiesForFreeShipping = quote.data ? quote.data.shippingAmount === 0 : cart.total >= freeShippingThreshold;
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
    if (inFlight.current || cart.lines.length === 0 || cart.mixedCurrencies || quote.isFetching || quote.isError) return;

    inFlight.current = true;
    setSubmitting(true);
    setInlineError(null);
    setShortItems([]);
    setNotice(null);

    if (!idempotencyKey.current) idempotencyKey.current = createIdempotencyKey();

    try {
      let session = guestSession;
      if (!user && !session) {
        session = await apiRequest<{ token: string; addressId: number }>('/api/guest/session', { method: 'POST', body: { ...guestAddress, ...guestDetails } });
        setGuestSession(session);
        sessionStorage.setItem('ninecube.guest.token', session.token);
      }
      const order = await placeOrder.mutateAsync({
        expectedTotal: quote.data?.totalAmount ?? finalTotal,
        guestToken: !user ? session?.token : undefined,
        addressId: !user ? session?.addressId : selectedAddressId ?? undefined,
        deliveryInstructions: deliveryInstructions.trim() || undefined,
        items: cart.lines.map((line) => ({ productId: line.productId, quantity: line.quantity })),
        couponCode: appliedCoupon?.isValid ? appliedCoupon.code ?? undefined : undefined,
        giftCardCode: appliedGiftCard?.code ?? undefined,
        paymentMethod: finalTotal === 0 ? 'CashOnDelivery' : paymentMethod,
        idempotencyKey: idempotencyKey.current
      });

      let redirectUrl: string | null | undefined;
      if (paymentMethod !== 'CashOnDelivery' && order.totalAmount > 0) {
        try {
          const payment = !user && session
            ? await apiRequest<import('../api/types').PaymentTransaction>('/api/guest/payments', { method: 'POST', guestToken: session.token, body: { orderId: order.id, provider: paymentMethod } })
            : await processPayment.mutateAsync({ orderId: order.id, provider: paymentMethod });
          redirectUrl = payment.redirectUrl;
        } catch (err) {
          toast.push('error', `Order #${order.id} was saved; payment is still unpaid. ${err instanceof Error ? err.message : 'Please retry from your order.'}`);
        }
      }

      idempotencyKey.current = null;
      if (!user && session) sessionStorage.setItem(`ninecube.guest.order.${order.id}`, session.token);
      setNotice(`Order #${order.id} placed.`);
      toast.push('success', `Order #${order.id} placed for ${formatMoney(order.totalAmount, order.currency)}.`);
      cart.clear();
      // The order is already committed. Refresh stock in the background so a slow catalogue
      // request cannot keep the successful checkout trapped inside the cart sheet.
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      onPlaced(order);
      if (redirectUrl) window.location.assign(redirectUrl);
    } catch (error) {
      if (!user && error instanceof ApiError) setGuestErrors(error.fieldErrors);
      if (error instanceof ApiError && error.code === 'checkout_quote_changed') {
        await quote.refetch();
        setInlineError(error.message);
        return;
      }
      if (error instanceof ApiError && error.isUnauthorized) {
        navigate('/login');
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
      setSubmitting(false);
    }
  };

  const busy = submitting || placeOrder.isPending;

  return (
    <section className="cart-panel" aria-labelledby="cart-heading">
      <div className="cart-panel__head">
        <h2 id="cart-heading">{t("Your cart")}</h2>
        <span className="badge badge--neutral" data-testid="cart-count">
          {t(cart.itemCount)} {t(" item")}{t(cart.itemCount === 1 ? '' : 's')}
        </span>
        {onClose ? (
          <button type="button" className="cart-sheet__close" aria-label={t("Close cart")} onClick={onClose}>
            <span aria-hidden="true">✕</span> {t("Close")}
          </button>
        ) : null}
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
              <div className="cart-line__side">
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
                <span className="cart-line__price">{t(formatMoney(line.unitPrice * line.quantity, line.currency))}</span>
                <button
                  type="button"
                  className="link-button cart-line-remove"
                  onClick={() => cart.remove(line.productId)}
                  aria-label={t(`Remove ${line.name} from the cart`)}
                >
                  <Icon name="trash" /> {t("Remove")}</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {cart.lines.length > 0 && (
        <div className={`cart-ship ${qualifiesForFreeShipping ? 'cart-ship--locked' : ''}`}>
          <div className="cart-ship__row">
            <span>
              {qualifiesForFreeShipping ? (
                <><Icon name="check" /> {t("You've unlocked FREE Delivery!")}</>
              ) : (
                <><Icon name="truck" /> {t("Add")} <strong>{formatMoney(amountNeededForFreeShipping, cart.currency)}</strong> {t("more for FREE Delivery!")}</>
              )}
            </span>
            <span className="cart-ship__pct">{freeShippingPercent}%</span>
          </div>
          <div className="cart-ship__track">
            <div className="cart-ship__bar" style={{ width: `${freeShippingPercent}%` }} />
          </div>
        </div>
      )}

      {cart.lines.length > 0 && upsellProducts.length > 0 && (
        <div className="cart-upsell">
          <div className="cart-upsell__title">
            <Icon name="spark" />
            <span>{t("Frequently added together")}</span>
          </div>
          <div className="cart-upsell__items">
            {upsellProducts.map((p) => (
              <div key={p.id} className="cart-upsell__item">
                <div className="cart-upsell__info">
                  <div className="cart-upsell__name">{p.name}</div>
                  <div className="cart-upsell__price">{formatMoney(p.price, p.currency)}</div>
                </div>
                <button
                  type="button"
                  className="btn btn--sm btn--outline cart-upsell__btn"
                  onClick={() => {
                    cart.add(p, 1);
                    toast.push('success', `${t("Added")} ${p.name} ${t("to your cart.")}`);
                  }}
                  aria-label={`${t("Add")} ${p.name}`}
                >
                  + {t("Add")}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {cart.lines.length > 0 && (
        <div className="cart-checkout-extras">
          {!user ? <fieldset className="stack" disabled={!!guestSession}>
            <legend>{t('Guest checkout')}</legend>
            <p>{t('No account needed. Recover your order by email on any device.')}</p>
            {Object.entries(guestDetails).map(([key, value]) => <label key={key} className="field">
              <span>{t(({ name: 'Full name', email: 'Email', phone: 'Phone', division: 'Division', district: 'District', upazila: 'Upazila', addressLine: 'Street address' } as Record<string, string>)[key])}</span>
              <input className="cart-input" type={key === 'email' ? 'email' : key === 'phone' ? 'tel' : 'text'}
                value={value} required maxLength={key === 'addressLine' ? 500 : key === 'email' ? 256 : key === 'phone' ? 32 : 100}
                onChange={e => setGuestDetails(current => ({ ...current, [key]: e.target.value }))} />
            </label>)}
            <AddressFields draft={guestAddress} setDraft={value => { setGuestAddress(value); setGuestErrors({}); }} errors={guestErrors} checkout />
          </fieldset> : null}
          {/* Address selection */}
          {user ? <div className="cart-field">
            <div className="cart-field__label">
              <span>{t("Delivery address")}</span>
              <Link to="/account/profile" className="link-button">{t("Manage addresses")}</Link>
            </div>
            {profile?.addresses && profile.addresses.length > 0 ? (
              <select
                className="cart-select"
                aria-label={t("Select delivery address")}
                value={selectedAddressId ?? ''}
                onChange={e => setSelectedAddressId(Number(e.target.value))}
              >
                {profile.addresses.map(a => (
                  <option key={a.id} value={a.id} >
                    {a.label}: {addressLines(a).join(', ')}
                  </option>
                ))}
              </select>
            ) : (
              <p className="cart-field__hint">
                {t("No address saved.")} <Link to="/account/profile" className="link-button">{t("Add delivery address")}</Link>
              </p>
            )}
          </div> : null}

          {quote.data?.minDeliveryDays != null && quote.data?.maxDeliveryDays != null && <p className="cart-field__hint">{t('Estimated delivery days')}: {quote.data.minDeliveryDays}?{quote.data.maxDeliveryDays}</p>}

          {(cart.syncStatus === 'error' || cart.syncStatus === 'conflict') && <div role="status"><p>{t('Your cart could not sync. Reload the saved cart to resolve changes from another device.')}</p><button type="button" className="btn" onClick={cart.reloadSavedCart}>{t('Reload saved cart')}</button></div>}
          {/* Customer Delivery Instructions / Order Notes */}
          <div className="cart-field">
            <label htmlFor="cart-delivery-instructions" className="cart-field__label">
              <span>{t("Delivery instructions / Order notes (optional)")}</span>
            </label>
            <textarea
              id="cart-delivery-instructions"
              className="cart-input cart-input--notes"
              rows={2}
              placeholder={t("e.g. Leave with security guard, call before delivery…")}
              value={deliveryInstructions}
              onChange={(e) => setDeliveryInstructions(e.target.value)}
              style={{ width: '100%', resize: 'vertical' }}
            />
          </div>

          {/* Coupon Code & Auto-Applied Promotions */}
          <div className="cart-field">
            <span className="cart-field__label"><span>{t("Promotions & Discounts")}</span></span>

            {/* Auto-applied promotion chip when active without typing code */}
            {isAutoApplied && autoPromo && (
              <div className="cart-note cart-note--promo">
                <div className="cart-note__head">
                  <span>{t("Auto-Applied Promotion:")} {autoPromo.campaignTitle || autoPromo.code}</span>
                  <strong>-{formatMoney(autoPromo.discountAmount, cart.currency)}</strong>
                </div>
                <span className="cart-note__body">
                  {t("No code needed. Automatically applied to your basket.")}
                </span>
              </div>
            )}
            {appliedCoupon?.isValid ? (
              <div className="cart-note cart-note--ok">
                <div className="cart-note__head">
                  <span>✓ {appliedCoupon.code} (-{formatMoney(appliedCoupon.discountAmount, cart.currency)})</span>
                  <button type="button" className="link-button" onClick={removeCoupon}>{t("Remove")}</button>
                </div>
                <span className="cart-note__body">{t("Coupon applied to this basket")}</span>
              </div>
            ) : (
              <div className="cart-field__row">
                <input
                  type="text"
                  className="cart-input cart-input--code"
                  placeholder={t("Enter coupon code")}
                  value={couponCode}
                  onChange={e => setCouponCode(e.target.value.toUpperCase())}
                  aria-label={t("Coupon code")}
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
            {couponError && <p className="cart-field__error">{t(couponError)}</p>}

            {/* Interactive Available Coupons & Offers Accordion */}
            <div className="cart-coupons-container">
              <button
                type="button"
                className="cart-toggle-coupons-btn"
                onClick={() => setShowCouponsDrawer(!showCouponsDrawer)}
                aria-expanded={showCouponsDrawer}
              >
                <span><Icon name="ticket" /> {t("Available Coupons & Offers")} ({availableCoupons.length})</span>
                <span className="cart-toggle-coupons-btn__state">{showCouponsDrawer ? t("Hide") : t("View")}</span>
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
                          <div className="cart-coupon-line">
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
                            <span className="cart-coupon-applied">✓ {t("Applied")}</span>
                          ) : (
                            <button
                              type="button"
                              className="btn btn--sm"
                              disabled={!isEligible || validateCoupon.isPending}
                              onClick={() => applyCoupon(c.code)}
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
          <div className="cart-field">
            <span className="cart-field__label"><span><Icon name="gift" /> {t("Gift card")}</span></span>
            {appliedGiftCard?.isValid ? (
              <div className="cart-note cart-note--gift">
                <div className="cart-note__head">
                  <span className="mono">{appliedGiftCard.code}</span>
                  <button type="button" className="link-button" onClick={removeGiftCard}>{t("Remove")}</button>
                </div>
                <div className="cart-note__body row-between">
                  <span>{t("Applied to order:")} -{formatMoney(giftCardDeduction, cart.currency)}</span>
                  <span>{t("Remaining balance:")} {formatMoney(remainingGiftCardBalance, cart.currency)}</span>
                </div>
              </div>
            ) : (
              <div>
                <div className="cart-field__row">
                  <input
                    type="text"
                    className="cart-input cart-input--code"
                    placeholder={t("Enter gift card code (e.g. GC-...)")}
                    value={giftCardCode}
                    onChange={e => setGiftCardCode(e.target.value.toUpperCase())}
                    aria-label={t("Gift card code")}
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
                  <span className="cart-field__hint">{t("Try test gift card:")}</span>
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
                  <Link to="/gift-cards" className="link-button cart-quick-chips__hub">
                    {t("Gift Cards Hub")} →
                  </Link>
                </div>
              </div>
            )}
            {giftCardError && <p className="cart-field__error">{t(giftCardError)}</p>}
          </div>

          {/* Payment Method */}
          <div className="cart-field">
            <span className="cart-field__label"><span>{t("Payment method")}</span></span>
            <div className="cart-pay-grid">
              <label className="cart-pay">
                <input
                  type="radio"
                  name="paymentMethod"
                  value="CashOnDelivery"
                  checked={paymentMethod === 'CashOnDelivery'}
                  onChange={() => setPaymentMethod('CashOnDelivery')}
                />
                <span><span className="cart-pay__glyph" aria-hidden="true"><Icon name="wallet" /></span> {t("Cash on Delivery")}</span>
              </label>
              <label className="cart-pay">
                <input
                  type="radio"
                  name="paymentMethod"
                  value="Card"
                  checked={paymentMethod === 'Card'}
                  disabled={!onlineAvailable}
                  onChange={() => setPaymentMethod('Card')}
                />
                <span><span className="cart-pay__glyph" aria-hidden="true"><Icon name="card" /></span> {t("Card (Visa/Mastercard)")}</span>
              </label>
              <label className="cart-pay">
                <input
                  type="radio"
                  name="paymentMethod"
                  value="MobileFinancialService"
                  checked={paymentMethod === 'MobileFinancialService'}
                  disabled={!onlineAvailable}
                  onChange={() => setPaymentMethod('MobileFinancialService')}
                />
                <span><span className="cart-pay__glyph" aria-hidden="true"><Icon name="phone" /></span> {t("Mobile Banking (bKash/Nagad)")}</span>
              </label>
            </div>
          </div>
        </div>
      )}

      {cart.lines.length > 0 && (
        <div className="cart-summary-box">
          <div className="cart-summary-box__head">
            <span>{t("Order Summary")}</span>
            {qualifiesForFreeShipping && (
              <span className="cart-summary-box__free">✓ {t("Free Delivery")}</span>
            )}
          </div>

          <div className="cart-summary-row">
            <span>{t("Subtotal")}</span>
            <span>{t(formatMoney(cart.total, cart.currency))}</span>
          </div>

          <div className="cart-summary-row">
            <span>{t("Delivery Fee")}</span>
            <span className={qualifiesForFreeShipping ? 'cart-summary-row--highlight' : undefined}>
              {shippingAmount === 0 ? t("Free Delivery") : t(formatMoney(shippingAmount, cart.currency))}
            </span>
          </div>

          {discountAmount > 0 && (
            <div className="cart-summary-row cart-summary-row--highlight">
              <span>
                {isAutoApplied ? <><Icon name="bolt" /> {t("Auto-Discount")}</> : t("Coupon Discount")}
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

          {finalTotal === 0 && giftCardDeduction > 0 && (
            <div className="cart-note cart-note--ok" style={{ marginTop: '8px' }}>
              <span className="cart-note__body">✓ {t("Your entire order is covered by this Gift Card!")}</span>
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

      {cart.mixedCurrencies ? <p className="cart-field__error" role="alert">{t("Place BDT and legacy-currency products in separate orders. Remove one currency to continue.")}</p> : null}
      {quote.isError ? <p className="cart-field__error" role="alert">{quote.error.message} <button type="button" className="link-button" onClick={() => void quote.refetch()}>{t('Retry')}</button></p> : null}
      {inlineError ? (
        <p role="alert" data-testid="cart-error" className="cart-field__error">
          {t(inlineError)}
        </p>
      ) : null}

      {notice ? (
        <p role="status" data-testid="cart-notice" className="cart-note cart-note--ok">
          {t(notice)}
        </p>
      ) : null}

      {cart.lines.length > 0 && (
        <div className="cart-sticky-dock">
          <div className="cart-summary-row cart-summary-row--total">
            <span>{t("Total")}</span>
            <strong className="cart-sticky-dock__total" data-testid="cart-total">
              {t(cart.mixedCurrencies ? 'Separate currencies' : formatMoney(finalTotal, cart.currency))}
            </strong>
          </div>

          <button
            type="button"
            className="btn btn--primary cart-sticky-dock__cta"
            onClick={submit}
            disabled={busy || cart.syncStatus === 'loading' || cart.lines.length === 0 || cart.mixedCurrencies || quote.isFetching || quote.isError}
            data-testid="place-order"
          >
            {busy ? (
              <>
                <span className="spinner" aria-hidden="true" /> {t(" Placing order…")}</>
            ) : (
              t("Place order")
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
        <CartPanel onClose={() => setOpen(false)} onPlaced={(order) => { setOpen(false); onPlaced(order); }} />
      </div>
    </div>,
    document.body
  );
}
