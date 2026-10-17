import { QueryClient } from '@tanstack/react-query';

/**
 * Background content auto-refresh.
 *
 * Re-invalidates the catalogue query keys on a timer so product stock, categories
 * and tags stay fresh without the user having to hit the browser refresh button.
 * Only runs in production, only while the tab is visible, and never blocks user
 * interaction (refetches happen in the background and keep stale data on error).
 */
const REFRESH_INTERVAL_MS = 120_000; // 2 minutes
const REFRESH_KEYS: readonly (readonly unknown[])[] = [
  ['products'],
  ['categories'],
  ['tags'],
];

export function startBackgroundRefresh(queryClient: QueryClient) {
  if (!import.meta.env.PROD) return;

  let timer: ReturnType<typeof setInterval> | null = null;
  let refreshing = false;

  const tick = async () => {
    if (document.visibilityState !== 'visible') return;
    if (refreshing) return;
    refreshing = true;
    try {
      // Invalidate each key; refetchOnWindowFocus/staleTime mean React Query only
      // actually re-fetches when data is stale or the window regains focus.
      await Promise.all(
        REFRESH_KEYS.map((key) =>
          queryClient.invalidateQueries({ queryKey: key })
        )
      );
    } catch {
      // Swallow: a failed background refresh never interrupts the user.
    } finally {
      refreshing = false;
    }
  };

  // First background refresh 30 seconds after load, then every 2 minutes.
  const initial = setTimeout(() => {
    void tick();
    timer = setInterval(tick, REFRESH_INTERVAL_MS);
  }, 30_000);

  // Refresh immediately when the user returns to the tab.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void tick();
  });

  return () => {
    clearTimeout(initial);
    if (timer) clearInterval(timer);
  };
}