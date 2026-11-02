import { useEffect, useMemo } from 'react';
import { t, formatNumber } from '../i18n/language';
import { Icon } from './Icon';
import { formatMoney, useDebouncedValue } from '../lib/helpers';
import { useReplayCouponAgainstOrders } from '../api/hooks';
import type { CouponOrderReplayRequest, DiscountType } from '../api/types';
import type { ScopeState } from './ScopeRuleEditor';

/** The window the server measures, and the figure the panel is always labelled with. */
export const REPLAY_DAYS = 30;

interface OrderReplayPanelProps {
  scope: ScopeState;
  discountType: DiscountType;
  discountValue: number;
  maxDiscountCap: number | null;
  minOrderAmount: number;
  /** The builder can be half-typed; only ask the server once the rule actually means something. */
  ready: boolean;
}

/**
 * Read-only rehearsal: the coupon run against the shop's own past orders. Nothing stored, nothing
 * invented — when there is no order history the panel says so instead of showing a made-up total.
 */
export function OrderReplayPanel({
  scope,
  discountType,
  discountValue,
  maxDiscountCap,
  minOrderAmount,
  ready
}: OrderReplayPanelProps) {
  const replay = useReplayCouponAgainstOrders();

  const payload = useMemo<CouponOrderReplayRequest>(() => ({
    scopeRules: scope.rules,
    scopeMatch: scope.match,
    discountType,
    discountValue,
    maxDiscountCap,
    minOrderAmount,
    minEligibleAmount: Number(scope.minEligibleAmount) || 0,
    days: REPLAY_DAYS
  }), [scope.rules, scope.match, scope.minEligibleAmount, discountType, discountValue, maxDiscountCap, minOrderAmount]);

  const key = useDebouncedValue(JSON.stringify(payload), 450);

  useEffect(() => {
    if (!ready || !key) return;
    if (payload.scopeRules?.some(r => r.entityIds.length === 0)) return;
    replay.mutate(payload);
    // The debounced `key` is the trigger; the payload is read when it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ready]);

  const data = replay.data;

  if (!ready) return null;

  return (
    <div className="order-replay" data-testid="order-replay">
      <div className="order-replay__head">
        <span className="order-replay__title">
          <Icon name="clock" width={14} height={14} aria-hidden="true" />
          {t("What it would have cost the shop")}
        </span>
        {replay.isPending ? <span className="order-replay__busy">{t("Replaying…")}</span> : null}
      </div>

      {replay.isError ? (
        <p className="order-replay__error">
          <Icon name="ban" width={13} height={13} aria-hidden="true" />
          {t("The order replay is unavailable right now. The discount itself still works.")}
        </p>
      ) : data ? (
        <>
          {data.hasOrders ? (
            <dl className="order-replay__grid">
              <div>
                <dt>{t("Orders it would have hit")}</dt>
                <dd>{formatNumber(data.ordersQualified)} <small>/ {formatNumber(data.ordersInWindow)}</small></dd>
              </div>
              <div>
                <dt>{t("Total giveaway")}</dt>
                <dd>{formatMoney(data.totalGiveaway)}</dd>
              </div>
              <div>
                <dt>{t("Average per order")}</dt>
                <dd>{formatMoney(data.averageGiveawayPerOrder)}</dd>
              </div>
              <div>
                <dt>{t("Share of each order")}</dt>
                <dd>{formatNumber(data.shareOfOrderValuePercent)}%</dd>
              </div>
            </dl>
          ) : (
            <p className="order-replay__empty">
              <Icon name="search" width={13} height={13} aria-hidden="true" />
              {t("No orders in the last 30 days to measure against, so there is no figure to show you.")}
            </p>
          )}

          {data.hasOrders ? (
            <p className="order-replay__against">
              {t("For the same window the shop actually gave away")} {formatMoney(data.actualGiveawayInWindow)}.
            </p>
          ) : null}

          {data.topProducts.length > 0 ? (
            <div className="order-replay__products">
              <span className="order-replay__products-label">{t("Where the money would have gone")}</span>
              <ul>
                {data.topProducts.map(p => (
                  <li key={p.productName}>
                    <span className="order-replay__product">{p.productName}</span>
                    <span className="order-replay__counts">
                      {formatNumber(p.timesDiscounted)} {t("orders")} · {formatNumber(p.units)} {t("units")}
                    </span>
                    <strong className="order-replay__giveaway">{formatMoney(p.giveaway)}</strong>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {data.notes.map(note => (
            <p key={note} className="order-replay__note">{note}</p>
          ))}
        </>
      ) : (
        <p className="order-replay__idle">{t("Fill in the discount to see what it would have cost.")}</p>
      )}
    </div>
  );
}
