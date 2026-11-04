declare const __APP_VERSION__: string;

/** Refresh when a newer deployment is available, without interrupting forms or active checkout. */
export function watchSiteUpdates() {
  if (!import.meta.env.PROD) return;
  let checking = false;
  const check = async () => {
    if (checking || document.visibilityState !== 'visible') return;
    // Preserve active checkout, payments and open modal dialogs.
    const route = window.location.hash.split('?')[0];
    if (route.startsWith('#/checkout') || route.startsWith('#/payment') || route.startsWith('#/admin')) return;
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
      // If we already refreshed with this version, avoid loop
      if (sessionStorage.getItem('ninecube:updated-version') === version) return;
      sessionStorage.setItem('ninecube:updated-version', version);
      const next = new URL(window.location.href);
      next.searchParams.set('v', version);
      window.location.replace(next.href);
    } catch (error) {
      if (import.meta.env.DEV) console.warn('[siteUpdates] version check failed:', error);
    }
    finally { checking = false; }
  };
  // Initial check after 2 seconds so fresh deployments are loaded quickly
  window.setTimeout(() => void check(), 2_000);
  window.setInterval(() => void check(), 30_000);
  document.addEventListener('visibilitychange', () => void check());
}
