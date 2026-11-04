import { t, useLanguage } from '../../i18n/language';
import { Link } from 'react-router-dom';
import { Icon } from '../Icon';

export function HomeTrustBar() {
  useLanguage();

  const trustItems = [
    { icon: 'truck' as const, title: t("Delivery information"), desc: t("Check destination availability, fees and delivery estimates at checkout."), to: '/policies/delivery' },
    { icon: 'box' as const, title: t("Returns & support"), desc: t("Read eligibility and request help from your order details."), to: '/policies/returns' },
    { icon: 'shield' as const, title: t("Product information"), desc: t("Check specifications and product-specific warranty details before ordering."), to: '/products' },
    { icon: 'card' as const, title: t("Payment options"), desc: t("Available payment methods are shown at checkout."), to: '/help' }
  ];

  return (
    <section className="home-trust-section" aria-label={t("Why choose NineCube")}>
      <div className="home-trust-grid">
        {trustItems.map((item, idx) => (
          <Link key={idx} to={item.to} className="home-trust-card">
            <div className="home-trust-icon">
              <Icon name={item.icon} width={22} height={22} />
            </div>
            <div className="home-trust-content">
              <strong className="home-trust-title">{item.title}</strong>
              <p className="home-trust-desc">{item.desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
