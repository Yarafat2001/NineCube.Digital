import { t, useLanguage } from '../../i18n/language';
import { Icon } from '../Icon';

export function HomeTrustBar() {
  useLanguage();

  const trustItems = [
    {
      icon: 'truck' as const,
      title: t("Nationwide Express Delivery"),
      desc: t("Inside Dhaka within 24-48h · Standard nationwide courier dispatch")
    },
    {
      icon: 'bolt' as const,
      title: t("7-Day Easy Returns"),
      desc: t("Hassle-free replacement guarantee on eligible defective or damaged items")
    },
    {
      icon: 'shield' as const,
      title: t("100% Genuine & Authentic"),
      desc: t("Direct manufacturer sourcing with official warranty coverage")
    },
    {
      icon: 'card' as const,
      title: t("Secure & Flexible Payments"),
      desc: t("Cash on Delivery, bKash, Nagad, Visa, Mastercard, and Gift Cards")
    }
  ];

  return (
    <section className="home-trust-section" aria-label={t("Why choose NineCube")}>
      <div className="home-trust-grid">
        {trustItems.map((item, idx) => (
          <div key={idx} className="home-trust-card">
            <div className="home-trust-icon">
              <Icon name={item.icon} width={22} height={22} />
            </div>
            <div className="home-trust-content">
              <strong className="home-trust-title">{item.title}</strong>
              <p className="home-trust-desc">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
