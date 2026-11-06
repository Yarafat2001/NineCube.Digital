import { useState, useEffect } from 'react';
import { AccountSection } from '../components/AccountNav';
import { Icon } from '../components/Icon';
import { t, useLanguage, setLanguage } from '../i18n/language';

type Theme = 'light' | 'dark';

export function SettingsPage() {
  const language = useLanguage();

  const [theme, setThemeState] = useState<Theme>(() => {
    try {
      return localStorage.getItem('ninecube-theme') === 'dark' ? 'dark' : 'light';
    } catch {
      return 'dark';
    }
  });

  const [orderAlerts, setOrderAlerts] = useState(true);
  const [promoEmails, setPromoEmails] = useState(false);
  const [smsDelivery, setSmsDelivery] = useState(true);
  const [savedMessage, setSavedMessage] = useState('');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('ninecube-theme', theme);
    } catch {
      // Ignore private browsing error
    }
  }, [theme]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSavedMessage(t('Settings saved successfully!'));
    setTimeout(() => setSavedMessage(''), 3000);
  };

  const clearCopilotMemory = () => {
    try {
      localStorage.removeItem('ninecube_commerce_memory');
      setSavedMessage(t('AI shopping copilot memory reset.'));
      setTimeout(() => setSavedMessage(''), 3000);
    } catch {
      // Ignore
    }
  };

  return (
    <AccountSection>
      <div className="account-settings-page stack">
        <header className="page-header">
          <div>
            <h1>{t("App settings")}</h1>
            <p className="muted">{t("Manage display theme, language, notifications, and shopping copilot preferences.")}</p>
          </div>
        </header>

        {savedMessage ? (
          <div className="badge badge--ok" role="status" style={{ padding: '10px 16px', fontSize: '14px' }}>
            <span className="badge__glyph" aria-hidden="true">✓</span> {savedMessage}
          </div>
        ) : null}

        <form onSubmit={handleSave} className="stack" style={{ gap: '24px' }}>
          {/* Appearance Section */}
          <section className="card-glass" style={{ padding: '24px', borderRadius: '16px' }} aria-labelledby="settings-appearance-title">
            <h2 id="settings-appearance-title" style={{ fontSize: '18px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Icon name="moon" width={20} height={20} />
              {t("Appearance & Theme")}
            </h2>
            <p className="muted" style={{ marginBottom: '16px' }}>{t("Choose how NineCube looks for your shopping experience.")}</p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px' }}>
              <button
                type="button"
                className={`btn ${theme === 'dark' ? 'btn--primary' : 'btn--ghost'}`}
                style={{ justifyContent: 'center', gap: '10px', height: '48px' }}
                onClick={() => setThemeState('dark')}
              >
                <Icon name="moon" width={18} height={18} />
                <span>{t("Dark glass (Recommended)")}</span>
              </button>
              <button
                type="button"
                className={`btn ${theme === 'light' ? 'btn--primary' : 'btn--ghost'}`}
                style={{ justifyContent: 'center', gap: '10px', height: '48px' }}
                onClick={() => setThemeState('light')}
              >
                <Icon name="spark" width={18} height={18} />
                <span>{t("Light glass")}</span>
              </button>
            </div>
          </section>

          {/* Language & Regional */}
          <section className="card-glass" style={{ padding: '24px', borderRadius: '16px' }} aria-labelledby="settings-language-title">
            <h2 id="settings-language-title" style={{ fontSize: '18px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Icon name="shuffle" width={20} height={20} />
              {t("Language & Region")}
            </h2>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className={`btn ${language === 'en' ? 'btn--primary' : 'btn--ghost'}`}
                onClick={() => setLanguage('en')}
              >
                English (US)
              </button>
              <button
                type="button"
                className={`btn ${language === 'bn' ? 'btn--primary' : 'btn--ghost'}`}
                onClick={() => setLanguage('bn')}
              >
                বাংলা (Bengali)
              </button>
            </div>
          </section>

          {/* Notifications Section */}
          <section className="card-glass" style={{ padding: '24px', borderRadius: '16px' }} aria-labelledby="settings-notifications-title">
            <h2 id="settings-notifications-title" style={{ fontSize: '18px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Icon name="bell" width={20} height={20} />
              {t("Notification Preferences")}
            </h2>

            <div className="stack" style={{ gap: '12px' }}>
              <label className="checkbox" style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={orderAlerts}
                  onChange={(e) => setOrderAlerts(e.target.checked)}
                />
                <div>
                  <strong>{t("Order & Delivery Updates")}</strong>
                  <p className="muted" style={{ margin: 0, fontSize: '12px' }}>{t("Get real-time alerts when your order is confirmed, shipped, or delivered.")}</p>
                </div>
              </label>

              <label className="checkbox" style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={smsDelivery}
                  onChange={(e) => setSmsDelivery(e.target.checked)}
                />
                <div>
                  <strong>{t("SMS Alerts")}</strong>
                  <p className="muted" style={{ margin: 0, fontSize: '12px' }}>{t("Receive dispatch and courier tracking links by SMS.")}</p>
                </div>
              </label>

              <label className="checkbox" style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={promoEmails}
                  onChange={(e) => setPromoEmails(e.target.checked)}
                />
                <div>
                  <strong>{t("Deals & Flash Sale Newsletters")}</strong>
                  <p className="muted" style={{ margin: 0, fontSize: '12px' }}>{t("Be the first to hear about seasonal discounts and coupon drops.")}</p>
                </div>
              </label>
            </div>
          </section>

          {/* AI Shopping Copilot Personalization */}
          <section className="card-glass" style={{ padding: '24px', borderRadius: '16px' }} aria-labelledby="settings-copilot-title">
            <h2 id="settings-copilot-title" style={{ fontSize: '18px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Icon name="spark" width={20} height={20} />
              {t("AI Commerce Copilot Memory")}
            </h2>
            <p className="muted" style={{ marginBottom: '16px' }}>
              {t("The AI copilot remembers your preferred brands, budget, and recent inquiries locally on this device.")}
            </p>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={clearCopilotMemory}
              style={{ color: 'var(--danger, #ef4444)' }}
            >
              <Icon name="trash" width={16} height={16} />
              {t("Reset AI Copilot Memory")}
            </button>
          </section>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-start' }}>
            <button type="submit" className="btn btn--primary" style={{ padding: '10px 24px' }}>
              {t("Save settings")}
            </button>
          </div>
        </form>
      </div>
    </AccountSection>
  );
}
export default SettingsPage;
