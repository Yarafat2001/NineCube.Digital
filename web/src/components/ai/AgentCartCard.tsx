import { Link } from 'react-router-dom';
import type { CartCardData } from '../../ai/commerceAgent';
import { formatMoney } from '../../lib/helpers';
import { useCart } from '../../state/CartContext';
import { t, useLanguage } from '../../i18n/language';
import { Icon } from '../Icon';

export function AgentCartCard({ data }: { data: CartCardData }) {
  const { setQuantity, remove, clear } = useCart();
  useLanguage();

  const handleOpenCartDrawer = () => {
    document.dispatchEvent(new CustomEvent('ninecube:open-cart-sheet'));
  };

  return (
    <div className="agent-cart-card card-glass">
      <div className="agent-cart-card__header">
        <div className="agent-cart-card__title">
          <Icon name="cart" width={16} height={16} />
          <strong>{t("Your Shopping Cart")}</strong>
        </div>
        <span className="agent-cart-card__count">{data.itemCount} {t("items")}</span>
      </div>

      <div className="agent-cart-card__list">
        {data.items.map(item => (
          <div key={item.productId} className="agent-cart-card__row">
            <div className="agent-cart-card__info">
              <Link to={`/products/${item.productId}`} className="agent-cart-card__name">
                {item.name}
              </Link>
              <span className="agent-cart-card__unit-price">
                {formatMoney(item.price, data.currency)} {t("each")}
              </span>
            </div>

            <div className="agent-cart-card__controls">
              <div className="agent-cart-card__stepper">
                <button
                  type="button"
                  className="agent-cart-card__step-btn"
                  onClick={() => setQuantity(item.productId, item.quantity - 1)}
                  aria-label={t("Decrease quantity")}
                >
                  −
                </button>
                <span className="agent-cart-card__qty">{item.quantity}</span>
                <button
                  type="button"
                  className="agent-cart-card__step-btn"
                  onClick={() => setQuantity(item.productId, item.quantity + 1)}
                  aria-label={t("Increase quantity")}
                >
                  +
                </button>
              </div>

              <span className="agent-cart-card__line-total">
                {formatMoney(item.price * item.quantity, data.currency)}
              </span>

              <button
                type="button"
                className="agent-cart-card__remove-btn"
                onClick={() => remove(item.productId)}
                aria-label={t("Remove item")}
                title={t("Remove item")}
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="agent-cart-card__footer">
        <div className="agent-cart-card__total-row">
          <span>{t("Subtotal")}</span>
          <strong>{formatMoney(data.total, data.currency)}</strong>
        </div>

        <div className="agent-cart-card__actions">
          <button
            type="button"
            className="btn btn--primary agent-cart-card__checkout-btn"
            onClick={handleOpenCartDrawer}
          >
            <span>{t("Proceed to Checkout")}</span>
            <span aria-hidden="true">→</span>
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--sm agent-cart-card__clear-btn"
            onClick={clear}
          >
            {t("Clear cart")}
          </button>
        </div>
      </div>
    </div>
  );
}
