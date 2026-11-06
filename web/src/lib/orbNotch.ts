import { useLayoutEffect, useRef, type DependencyList, type RefObject } from 'react';

/** Which side of the bar the notch is cut into. */
export type OrbNotchEdge = 'top' | 'left' | 'right';

/**
 * The lifted-orb silhouette: a glass bar whose notched edge dips around a marker orb, drawn as one
 * path that is used both to clip the glass and to stroke the edge, so the two can never disagree.
 *
 * These are the reference's proportions scaled to our controls, and they are shared by both surfaces
 * on purpose. The dip has to be deeper than the orb is wide, otherwise the orb floats outside the
 * glass; the end radius plus the notch half-width have to fit inside the outermost tab, otherwise
 * the clamp below starts moving the notch away from the item it is supposed to be marking.
 */
export const ORB_NOTCH = { half: 22, depth: 22, endRadius: 16 } as const;

// Where the curve leaves the flat edge and how far the dip's walls sit from the centre, in the
// reference's own ratio (22 and 28 of a 46 half-opening).
const CURVE_LEAD = 22 / 46;
const CURVE_WALL = 28 / 46;

export type OrbNotchShape = {
  edge: OrbNotchEdge;
  /** The bar measured along its own axis. */
  length: number;
  /** The bar measured across it. */
  thickness: number;
  /** Where the active item's centre falls along the axis, before clamping. */
  centre: number;
};

const n = (value: number) => Number(value.toFixed(2));

/**
 * Builds the bar outline in the reference's canonical space (u runs along the bar, v sinks in from
 * the notched edge) and emits it already turned for the surface asked for. A rail is that turn:
 * 'left' swaps the axes, which is a reflection, so the four corner arcs need the opposite sweep.
 * 'right' places the notch on the right-hand edge facing the page content.
 */
export function orbNotchPath(shape: OrbNotchShape): { d: string; centre: number } {
  const { edge, length, thickness, centre } = shape;
  const { half, depth, endRadius: r } = ORB_NOTCH;
  const margin = r + half;
  const c = Math.min(Math.max(centre, margin), Math.max(margin, length - margin));
  const lead = half * CURVE_LEAD;
  const wall = half * CURVE_WALL;

  if (edge === 'right') {
    const W = thickness;
    const H = length;
    const d = [
      `M${r} 0`,
      `L${n(W - r)} 0`,
      `A${n(r)} ${n(r)} 0 0 1 ${n(W)} ${n(r)}`,
      `L${n(W)} ${n(c - half)}`,
      `C${n(W)} ${n(c - half + lead)} ${n(W - depth)} ${n(c - wall)} ${n(W - depth)} ${n(c)}`,
      `C${n(W - depth)} ${n(c + wall)} ${n(W)} ${n(c + half - lead)} ${n(W)} ${n(c + half)}`,
      `L${n(W)} ${n(H - r)}`,
      `A${n(r)} ${n(r)} 0 0 1 ${n(W - r)} ${n(H)}`,
      `L${n(r)} ${n(H)}`,
      `A${n(r)} ${n(r)} 0 0 1 0 ${n(H - r)}`,
      `L0 ${n(r)}`,
      `A${n(r)} ${n(r)} 0 0 1 ${n(r)} 0`,
      'Z'
    ].join('');
    return { d, centre: c };
  }

  const point = (u: number, v: number) => (edge === 'top' ? `${n(u)} ${n(v)}` : `${n(v)} ${n(u)}`);
  const sweep = edge === 'top' ? 1 : 0;
  const line = (u: number, v: number) => `L${point(u, v)}`;
  const arc = (u: number, v: number) => `A${n(r)} ${n(r)} 0 0 ${sweep} ${point(u, v)}`;

  const d = [
    `M${point(r, 0)}`,
    line(c - half, 0),
    `C${point(c - half + lead, 0)} ${point(c - wall, depth)} ${point(c, depth)}`,
    `C${point(c + wall, depth)} ${point(c + half - lead, 0)} ${point(c + half, 0)}`,
    line(length - r, 0),
    arc(length, r),
    line(length, thickness - r),
    arc(length - r, thickness),
    line(r, thickness),
    arc(0, thickness - r),
    line(0, r),
    arc(r, 0),
    'Z'
  ].join('');

  return { d, centre: c };
}

export type OrbNotchTargets = {
  /** The bar. It carries --orb-pos and the --orb-glide the engine reads. */
  host: RefObject<HTMLElement | null>;
  /** The glass layer the notch is cut into; its own box is the measured bar. */
  glass: RefObject<HTMLElement | null>;
  /** The stroked edge, given the same path as the clip. */
  path: RefObject<SVGPathElement | null>;
  /** Selector for the item the orb has to follow. */
  active: string;
};

/**
 * Keeps the notch over the active item. Nothing here goes through React state: the glide writes the
 * path and one custom property per frame, so moving between destinations never re-renders the bar and
 * the blur behind it is not recomputed by a layout change.
 *
 * `deps` is what tells the engine the marked item may have changed identity - the route, the rail's
 * expanded state, the language. Resize is picked up by observation, not by a dependency.
 */
export function useOrbNotch(edge: OrbNotchEdge, targets: OrbNotchTargets, deps: DependencyList) {
  const { host, glass, path: pathRef, active } = targets;
  const positionRef = useRef<number | null>(null);
  const frameRef = useRef<number>(0);
  const isFirstMount = useRef(true);

  useLayoutEffect(() => {
    const hostEl = host.current;
    const glassEl = glass.current;
    if (!hostEl || !glassEl) return;

    const glideMs = () => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 0;
      const raw = getComputedStyle(hostEl).getPropertyValue('--orb-glide').trim();
      const value = parseFloat(raw);
      // A missing or unreadable duration means do not animate, which is the safe answer.
      if (!Number.isFinite(value)) return 0;
      return raw.endsWith('ms') ? value : value * 1000;
    };

    const paint = (along: number) => {
      const box = glassEl.getBoundingClientRect();
      const shape = orbNotchPath({
        edge,
        length: edge === 'top' ? box.width : box.height,
        thickness: edge === 'top' ? box.height : box.width,
        centre: along
      });
      const clip = `path("${shape.d}")`;
      hostEl.style.setProperty('--orb-pos', `${shape.centre}px`);
      glassEl.style.setProperty('clip-path', clip);
      glassEl.style.setProperty('-webkit-clip-path', clip);
      pathRef.current?.setAttribute('d', shape.d);
    };

    /** The active item's centre along the axis, or null when there is nothing to mark. */
    const target = () => {
      const box = glassEl.getBoundingClientRect();
      const item = hostEl.querySelector<HTMLElement>(active);
      // A surface that is display:none measures zero, and a notch on a zero-length bar is a lie.
      if (!item || box.width < 1 || box.height < 1) return null;
      const rect = item.getBoundingClientRect();
      return edge === 'top' ? rect.left + rect.width / 2 - box.left : rect.top + rect.height / 2 - box.top;
    };

    const draw = (snap: boolean) => {
      const to = target();
      if (to === null) {
        hostEl.dataset.orbReady = 'false';
        return;
      }
      hostEl.dataset.orbReady = 'true';
      cancelAnimationFrame(frameRef.current);
      const from = snap || positionRef.current === null ? to : positionRef.current;
      positionRef.current = to;
      const duration = snap ? 0 : glideMs();
      if (!duration || Math.abs(to - from) < 0.5) {
        paint(to);
        return;
      }
      const start = performance.now();
      const step = (now: number) => {
        const p = Math.min(1, (now - start) / duration);
        const q = p - 1;
        // The reference's overshoot: the orb lands a hair past the row and settles back into it.
        const eased = 1 + 2.1 * q * q * q + 1.1 * q * q;
        const current = from + (to - from) * eased;
        positionRef.current = current;
        paint(current);
        if (p < 1) frameRef.current = requestAnimationFrame(step);
        else {
          positionRef.current = to;
          paint(to);
        }
      };
      frameRef.current = requestAnimationFrame(step);
    };

    if (isFirstMount.current) {
      isFirstMount.current = false;
      draw(true);
    } else {
      draw(false);
    }

    // Observation carries resize and transition end: the bar's own box changes, so re-snap without gliding.
    const onResize = () => draw(true);
    const onTransitionEnd = (e: TransitionEvent) => {
      if (e.target === hostEl) draw(true);
    };

    const observer = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(onResize);
    observer?.observe(glassEl);
    const item = hostEl.querySelector<HTMLElement>(active);
    if (item) observer?.observe(item);
    window.addEventListener('resize', onResize);
    hostEl.addEventListener('transitionend', onTransitionEnd);

    return () => {
      cancelAnimationFrame(frameRef.current);
      observer?.disconnect();
      window.removeEventListener('resize', onResize);
      hostEl.removeEventListener('transitionend', onTransitionEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
