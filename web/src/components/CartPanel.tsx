import { t, useLanguage } from '../i18n/language';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ApiError, apiRequest } from '../api/client';
import { usePlaceOrder } from '../api/hooks';
import type { Order, Product, ShortItem } from '../api/types';
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
        idempotencyKey: idempotencyKey.current
      });

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

      <div className="cart-total">
        <span>{t("Total")}</span>
        <strong data-testid="cart-total">{t(cart.mixedCurrencies ? 'Separate currencies' : formatMoney(cart.total, cart.currency))}</strong>
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
