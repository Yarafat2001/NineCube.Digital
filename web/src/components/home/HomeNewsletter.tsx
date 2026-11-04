import { useState } from 'react';
import { t, useLanguage } from '../../i18n/language';
import { Icon } from '../Icon';

const VIP_PROMO_CODE = 'WELCOME10';

export function HomeNewsletter() {
  useLanguage();
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(() => {
    try {
      return localStorage.getItem('ninecube_vip_claimed') === 'true';
    } catch {
      return false;
    }
  });
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setErrorMsg(t("Please enter a valid email address"));
      return;
    }
    setErrorMsg('');
    try {
      localStorage.setItem('ninecube_vip_claimed', 'true');
      localStorage.setItem('ninecube_vip_email', cleanEmail);
    } catch {
      // ignore storage failure
    }
    setSubmitted(true);
  };

  const handleCopyCode = async () => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(VIP_PROMO_CODE);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <section className="home-newsletter-section" aria-label={t("NineCube VIP Club")}>
      <div className="home-newsletter-card">
        <div className="home-newsletter-content">
          <span className="home-section-kicker">✨ {t("NineCube VIP Member Club")}</span>
          <h2 className="home-newsletter-title">{t("Unlock 10% Off Your First Order")}</h2>
          <p className="home-newsletter-desc">
            {t("Subscribe to get instant access to member-only flash sales, early product drops, and restock alerts.")}
          </p>

          {!submitted ? (
            <form className="home-newsletter-form" onSubmit={handleSubmit}>
              <div className="home-newsletter-input-group">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (errorMsg) setErrorMsg('');
                  }}
                  placeholder={t("Enter your email address")}
                  aria-label={t("Email address for discount")}
                  className="home-newsletter-input"
                  required
                />
                <button type="submit" className="btn btn--primary home-newsletter-btn">
                  <span>{t("Claim 10% Off")}</span>
                  <span aria-hidden="true">→</span>
                </button>
              </div>
              {errorMsg && <p className="home-newsletter-error">{errorMsg}</p>}
            </form>
          ) : (
            <div className="home-newsletter-success" role="status">
              <div className="home-newsletter-voucher">
                <span className="home-newsletter-voucher-badge">🎉 {t("VIP Code Unlocked:")}</span>
                <strong className="home-newsletter-code">{VIP_PROMO_CODE}</strong>
                <button
                  type="button"
                  className="btn btn--sm btn--primary home-newsletter-copy-btn"
                  onClick={handleCopyCode}
                  aria-label={`${t("Copy voucher code")} ${VIP_PROMO_CODE}`}
                >
                  <Icon name={copied ? "check" : "copy"} width={14} height={14} />
                  <span>{copied ? t("Copied!") : t("Copy Code")}</span>
                </button>
              </div>
              <p className="home-newsletter-voucher-note">
                {t("Apply code")} <strong>{VIP_PROMO_CODE}</strong> {t("at checkout to save 10% on your order.")}
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
