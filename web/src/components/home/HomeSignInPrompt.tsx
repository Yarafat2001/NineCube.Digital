import { useState } from 'react';
import { Link } from 'react-router-dom';
import { t, useLanguage } from '../../i18n/language';
import { useAuth } from '../../state/AuthContext';
import { Icon } from '../Icon';

const DISMISS_KEY = 'ninecube-home-signin-dismissed';

/**
 * The guest sign-in prompt on the home page, in the reference sites' style: a compact,
 * dismissible strip with one pill CTA and only real benefits of an account. Dismissal
 * lasts for the browser session, the way the reference stores do it.
 */
export function HomeSignInPrompt() {
  useLanguage();
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return window.sessionStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });

  if (user || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      window.sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // Session storage can be blocked; the banner simply returns on the next visit.
    }
  };

  return (
    <section className="home-signin-prompt" data-testid="home-signin-prompt" aria-label={t('Sign in prompt')}>
      <span className="home-signin-prompt__icon"><Icon name="user" width={18} height={18} /></span>
      <p>{t('Sign in to track your orders, keep your wishlist and use gift cards.')}</p>
      <Link className="btn btn--primary home-signin-prompt__cta" to="/login">{t('Sign in or Register')}</Link>
      <button type="button" className="home-signin-prompt__dismiss" onClick={dismiss} aria-label={t('Dismiss')}>
        <Icon name="x" width={14} height={14} />
      </button>
    </section>
  );
}
