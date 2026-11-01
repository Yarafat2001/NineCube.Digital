import { useEffect, useMemo } from 'react';
import { t, formatNumber } from '../i18n/language';
import { Icon } from './Icon';
import { formatMoney, useDebouncedValue } from '../lib/helpers';
import { usePreviewCouponScope } from '../api/hooks';
import type { CouponScopePreviewRequest, DiscountType } from '../api/types';
import type { ScopeState } from './ScopeRuleEditor';

interface ScopeImpactPanelProps {
  scope: ScopeState;
  discountType: DiscountType;
  discountValue: number;
  maxDiscountCap: number | null;
  /** The builder can be half-typed; only ask the server once the scope actually means something. */
  ready: boolean;
}

/**
 * Read-only reach report for the scope the operator is building. Nothing here is stored: it is the
 * taka view that makes the difference between "Footwear" and "Footwear except Bata" visible.
 */
export function ScopeImpactPanel({ scope, discountType, discountValue, maxDiscountCap, ready }: ScopeImpactPanelProps) {
  const preview = usePreviewCouponScope();

  const payload = useMemo<CouponScopePreviewRequest>(() => ({
    scopeRules: scope.rules,
    scopeMatch: scope.match,
    discountType,
    discountValue,
    maxDiscountCap,
    minEligibleAmount: Number(scope.minEligibleAmount) || 0
  }), [scope.rules, scope.match, scope.minEligibleAmount, discountType, discountValue, maxDiscountCap]);

  // Debounce the serialised request: the object identity changes on every keystroke, its text does not.
  const key = useDebouncedValue(JSON.stringify(payload), 450);

  useEffect(() => {
    if (!ready || !key) return;
    if (payload.scopeRules.length === 0) {
      // Storewide reaches everything; asking the server for that number is noise.
      preview.mutate({ ...payload, scopeRules: [] });
      return;
    }
    if (payload.scopeRules.some(r => r.entityIds.length === 0)) return;
    preview.mutate(payload);
    // The debounced `key` is the trigger; the payload is read when it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ready]);

  const data = preview.data;

  if (!ready) return null;

  return (
    <div className="scope-impact" data-testid="scope-impact">
      <div className="scope-impact__head">
        <span className="scope-impact__title">
          <Icon name="eye" width={14} height={14} aria-hidden="true" />
          {t("What this scope reaches")}
        </span>
        {preview.isPending ? <span className="scope-impact__busy">{t("Checking…")}</span> : null}
      </div>

      {preview.isError ? (
        <p className="scope-impact__error">
          <Icon name="ban" width={13} height={13} aria-hidden="true" />
          {t("The reach check is unavailable right now. The discount itself still works.")}
        </p>
      ) : data ? (
        <>
          <dl className="scope-impact__grid">
            <div>
              <dt>{t("Products reached")}</dt>
              <dd>{formatNumber(data.matchedProducts)} <small>/ {formatNumber(data.totalActiveProducts)}</small></dd>
            </div>
            <div>
              <dt>{t("Units in stock")}</dt>
              <dd>{formatNumber(data.matchedUnits)}</dd>
            </div>
            <div>
              <dt>{t("Stock value covered")}</dt>
              <dd>{formatMoney(data.exposedStockValue)}</dd>
            </div>
            <div>
              <dt>{t("Typical saving")}</dt>
              <dd>{formatMoney(data.forecastDiscount)}</dd>
            </div>
          </dl>

          <p className="scope-impact__basis">
            {data.valueBasis === 'OrderHistory'
              ? t("Measured on the average order the shop has already taken.")
              : data.valueBasis === 'AverageProductPrice'
              ? t("No order history yet, so this is one average-priced product in the scope.")
              : t("Nothing in the catalogue matches this scope yet.")}
          </p>

          {data.sampleProducts.length > 0 ? (
            <p className="scope-impact__samples">
              {t("For example:")} {data.sampleProducts.join(', ')}
            </p>
          ) : null}

          {data.conflicts.length > 0 ? (
            <div className="scope-impact__conflicts">
              <span className="scope-impact__conflicts-label">
                <Icon name="bolt" width={13} height={13} aria-hidden="true" />
                {t("Live campaigns that already reach these products")}
              </span>
              <ul>
                {data.conflicts.map(c => (
                  <li key={c.code}>
                    <strong className="mono">{c.code}</strong>
                    {c.campaignTitle ? ` — ${t(c.campaignTitle)}` : ''}
                    <span className="scope-impact__overlap">
                      {formatNumber(c.overlappingProducts)} {t("products in this scope")}
                      {c.isAutomatic ? ` · ${t("automatic")}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : (
        <p className="scope-impact__idle">{t("Choose at least one product in every rule to see the reach.")}</p>
      )}
    </div>
  );
}
