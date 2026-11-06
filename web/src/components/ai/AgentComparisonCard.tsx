import { Link } from 'react-router-dom';
import type { ProductComparisonData } from '../../ai/commerceAgent';
import { formatMoney } from '../../lib/helpers';
import { useCart } from '../../state/CartContext';
import { t, useLanguage } from '../../i18n/language';
import { ProductThumbnail } from '../ProductImage';
import { Icon } from '../Icon';

export function AgentComparisonCard({ data }: { data: ProductComparisonData }) {
  const { add } = useCart();
  useLanguage();

  return (
    <div className="agent-comparison-card card-glass">
      <div className="agent-comparison-card__header">
        <span className="agent-comparison-card__badge">
          <Icon name="grid" width={14} height={14} /> {t("Side-by-Side Comparison")}
        </span>
      </div>

      <div className="agent-comparison-card__table-wrap">
        <table className="agent-comparison-table">
          <thead>
            <tr>
              <th className="agent-comparison-table__spec-col">{t("Feature")}</th>
              {data.products.map(p => {
                const isWinner = data.recommendedProductId === p.id;
                return (
                  <th key={p.id} className={`agent-comparison-table__prod-col ${isWinner ? 'agent-comparison-table__prod-col--winner' : ''}`}>
                    {isWinner && (
                      <span className="agent-comparison-badge-pick">{t("★ Best Pick")}</span>
                    )}
                    <ProductThumbnail
                      product={p}
                      url={p.imageUrl}
                      alt={p.name}
                      className="agent-comparison-table__thumb"
                      iconSize={20}
                    />
                    <Link to={`/products/${p.id}`} className="agent-comparison-table__prod-name">
                      {p.name}
                    </Link>
                    <span className="agent-comparison-table__prod-price">
                      {formatMoney(p.price, p.currency)}
                    </span>
                    <button
                      type="button"
                      className="btn btn--primary btn--sm agent-comparison-table__add-btn"
                      disabled={p.stockQuantity < 1}
                      onClick={() => add(p, 1)}
                    >
                      {p.stockQuantity > 0 ? t("+ Add to cart") : t("Out of stock")}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {data.specs.map(spec => (
              <tr key={spec.feature}>
                <td className="agent-comparison-table__feature-label">{spec.feature}</td>
                {data.products.map(p => {
                  const val = spec.values[p.id] ?? '—';
                  const isFeatureWinner = spec.winnerProductId === p.id;
                  return (
                    <td
                      key={p.id}
                      className={`agent-comparison-table__spec-val ${isFeatureWinner ? 'agent-comparison-table__spec-val--highlight' : ''}`}
                    >
                      {val}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.summary && (
        <div className="agent-comparison-card__summary">
          <p>{data.summary}</p>
        </div>
      )}
    </div>
  );
}
