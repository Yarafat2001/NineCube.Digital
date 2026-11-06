import { Link } from 'react-router-dom';
import type { OrderTrackingData } from '../../ai/commerceAgent';
import { formatMoney } from '../../lib/helpers';
import { t, useLanguage } from '../../i18n/language';
import { Icon } from '../Icon';

export function AgentOrderCard({ data }: { data: OrderTrackingData }) {
  const { order, progressStep, statusLabel, formattedDate } = data;
  useLanguage();

  const steps = [
    { num: 1, label: 'Placed' },
    { num: 2, label: 'Confirmed' },
    { num: 3, label: 'Shipped' },
    { num: 4, label: 'Delivered' },
  ];

  const isFailedOrCancelled = order.status === 'Cancelled' || order.status === 'Rejected';

  return (
    <div className="agent-order-card card-glass">
      <div className="agent-order-card__header">
        <div className="agent-order-card__id-group">
          <Icon name="box" width={16} height={16} />
          <span className="agent-order-card__id">{t("Order #")}{order.id}</span>
        </div>
        <span
          className={`agent-order-card__status-badge agent-order-card__status-badge--${order.status.toLowerCase()}`}
        >
          {statusLabel}
        </span>
      </div>

      <div className="agent-order-card__meta">
        <span>{t("Placed on")} {formattedDate}</span>
        <span>•</span>
        <span>{order.items.length} {t("items")}</span>
        <span>•</span>
        <strong>{formatMoney(order.totalAmount, order.currency)}</strong>
      </div>

      {/* Fulfillment Progress Timeline */}
      {!isFailedOrCancelled && (
        <div className="agent-order-timeline">
          <div className="agent-order-timeline__track">
            <div
              className="agent-order-timeline__fill"
              style={{ width: `${Math.max(0, ((progressStep - 1) / 3) * 100)}%` }}
            />
          </div>
          <div className="agent-order-timeline__steps">
            {steps.map(s => {
              const isPassed = progressStep >= s.num;
              const isCurrent = progressStep === s.num;
              return (
                <div
                  key={s.num}
                  className={`agent-order-timeline__step ${isPassed ? 'agent-order-timeline__step--passed' : ''} ${isCurrent ? 'agent-order-timeline__step--current' : ''}`}
                >
                  <div className="agent-order-timeline__node">
                    {isPassed ? '✓' : s.num}
                  </div>
                  <span className="agent-order-timeline__label">{t(s.label)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Item Previews */}
      <div className="agent-order-card__items-preview">
        {order.items.slice(0, 3).map(item => (
          <div key={item.id} className="agent-order-card__item-row">
            <span className="agent-order-card__item-name">
              {item.quantity} × {item.name}
            </span>
            <span className="agent-order-card__item-total">
              {formatMoney(item.lineTotal, order.currency)}
            </span>
          </div>
        ))}
        {order.items.length > 3 && (
          <span className="agent-order-card__more-items">
            +{order.items.length - 3} {t("more items")}
          </span>
        )}
      </div>

      <div className="agent-order-card__footer">
        <Link to={`/orders/${order.id}`} className="btn btn--primary btn--sm agent-order-card__link">
          <span>{t("View Order Details")}</span>
          <span aria-hidden="true">→</span>
        </Link>
      </div>
    </div>
  );
}
