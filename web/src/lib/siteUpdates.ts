declare const __APP_VERSION__: string;

/** Refresh the public home when a newer deployment is available, without interrupting forms. */
export function watchSiteUpdates() {
  if (!import.meta.env.PROD) return;
  let checking = false;
  const check = async () => {
    if (checking || document.visibilityState !== 'visible') return;
    // Preserve active checkout, forms and other workflows. Their next full visit loads new assets.
    const route = window.location.hash.split('?')[0];
    if (route && route !== '#/' && route !== '#') return;
    if (document.querySelector('[data-overlay-open="true"]')
      || document.activeElement?.matches('input, textarea, select, [contenteditable="true"]')) return;
    checking = true;
    try {
      const endpoint = new URL(`${import.meta.env.BASE_URL}version.json`, document.baseURI);
      endpoint.searchParams.set('check', `${Date.now()}`);
      const response = await fetch(endpoint, { cache: 'no-store' });
      if (!response.ok) return;
      const { version } = await response.json() as { version?: string };
      if (!version || version === __APP_VERSION__) return;
      // A cache-busting document URL ensures that the reload also gets the new entry bundle.
      if (sessionStorage.getItem('ninecube:updated-version') === version) return;
      sessionStorage.setItem('ninecube:updated-version', version);
      const next = new URL(window.location.href);
      next.searchParams.set('v', version);
      window.location.replace(next.href);
    } catch (error) {
      // Offline or temporarily unavailable deployment: leave the working page intact.
      if (import.meta.env.DEV) console.warn('[siteUpdates] version check failed:', error);
    }
    finally { checking = false; }
  };
  // First check sooner so a fresh deployment is picked up quickly.
  window.setTimeout(() => void check(), 5_000);
  window.setInterval(() => void check(), 60_000);
  document.addEventListener('visibilitychange', () => void check());
}
