/**
 * Capability checks for the animated showcase.
 *
 * The scene is an enhancement: if the browser cannot render it, or the visitor has asked for
 * reduced motion, the page must still show the same nine cards and the same text as a static grid.
 * Ordering never depends on this module - the catalogue is a separate route.
 */
export type ShowcaseFallbackReason = 'reduced-motion' | 'webgl' | 'error';

/** True when the visitor has asked the operating system to reduce motion. */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

/**
 * Probes for a WebGL context. The interface check comes first because jsdom (the test environment)
 * has no `WebGLRenderingContext` at all, and probing anyway would log a jsdom "not implemented"
 * error for every suite that renders the showcase.
 */
export function supportsWebgl(): boolean {
  if (typeof window === 'undefined') return false;

  const hasInterface =
    typeof window.WebGLRenderingContext !== 'undefined' ||
    typeof window.WebGL2RenderingContext !== 'undefined';

  if (!hasInterface) return false;

  try {
    const probe = document.createElement('canvas');
    const context = (probe.getContext('webgl2') ?? probe.getContext('webgl')) as WebGLRenderingContext | null;

    if (!context) return false;

    // Release the probe context immediately instead of waiting for garbage collection: browsers
    // cap the number of live contexts, and the real renderer needs one.
    context.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

/** Returns the reason to use the static grid, or `null` when the scene can run. */
export function detectShowcaseFallback(): ShowcaseFallbackReason | null {
  if (prefersReducedMotion()) return 'reduced-motion';
  if (!supportsWebgl()) return 'webgl';
  return null;
}
