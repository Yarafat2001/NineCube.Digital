import { t, useLanguage } from '../i18n/language';
import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { loadCardAssets } from '../helix/cardAssets';
import { ShowcaseFallback } from '../helix/ShowcaseFallback';
import { showcaseCopy } from '../helix/showcaseCopy';
import { detectShowcaseFallback, type ShowcaseFallbackReason } from '../helix/support';

// Three.js only ever downloads when this route is visited and the browser can actually run the
// scene: the scene lives in its own chunk, behind the dynamic import below.
const HelixCanvas = lazy(() => import('../helix/HelixCanvas'));

/**
 * Shown while the scene chunk and the asset list are in flight.
 *
 * It is the hero itself - same dark treatment, same heading, same position - so the first paint on a
 * slow connection matches what replaces it instead of flashing the app's light gradient and then
 * jumping to a dark full-viewport scene.
 */
function ShowcaseLoading() {
  useLanguage();
  return (
    <div className="showcase showcase--loading" data-testid="showcase-loading">
      <div className="showcase__hero-content" role="status" aria-busy="true">
        <p className="kicker">{t(showcaseCopy.kicker)}</p>
        <h1>
          {t(showcaseCopy.brand.line1)}
          <br />
          {t(showcaseCopy.brand.line2)}
        </h1>
        <p className="showcase__hero-copy">{t(showcaseCopy.intro)}</p>
        <span className="visually-hidden">{t("Preparing the showcase")}</span>
      </div>
    </div>
  );
}

/**
 * The public landing page.
 *
 * Scroll-driven, and deliberately additive: it renders the same nine cards and the same copy as a
 * static grid whenever the animation cannot or should not run (no WebGL, reduced motion, or a
 * scene failure). Ordering never depends on this route - the catalogue is a separate screen.
 */
export function ShowcasePage() {
  useLanguage();
  // Resolved once per mount, because the answers are properties of the browser, not the render.
  const [fallback] = useState<ShowcaseFallbackReason | null>(() => detectShowcaseFallback());
  const [sceneFailed, setSceneFailed] = useState(false);
  const [cardAssets, setCardAssets] = useState<readonly string[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    loadCardAssets().then((assets) => {
      if (!cancelled) setCardAssets(assets);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // The experience starts at the hero, so scroll position is taken over while this route is
  // mounted: arriving from another screen - or reloading a deep link into a 690vh scroll track -
  // would otherwise open halfway down the story. Browser scroll restoration is switched to
  // `manual` and put back on unmount, and the reset is repeated on the next frame because a
  // restoration can land after the first paint.
  useLayoutEffect(() => {
    const previousRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';

    document.body.classList.add('showcase-active');

    const toTop = () => window.scrollTo(0, 0);
    toTop();
    const frame = window.requestAnimationFrame(toTop);

    return () => {
      window.cancelAnimationFrame(frame);
      window.history.scrollRestoration = previousRestoration;
      document.body.classList.remove('showcase-active');
    };
  }, []);

  const onSceneFailure = useCallback(() => setSceneFailed(true), []);

  if (!cardAssets) return <ShowcaseLoading />;

  const reason = fallback ?? (sceneFailed ? 'error' : null);

  if (reason) return <ShowcaseFallback cardAssets={cardAssets} reason={reason} />;

  return (
    <ErrorBoundary
      fallback={<ShowcaseFallback cardAssets={cardAssets} reason="error" />}
      onError={onSceneFailure}
    >
      <Suspense fallback={<ShowcaseLoading />}>
        <HelixCanvas cardAssets={cardAssets} onFailure={onSceneFailure} />
      </Suspense>
    </ErrorBoundary>
  );
}
