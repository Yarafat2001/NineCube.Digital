import { type RefObject } from 'react';
import { Icon, type IconName } from './Icon';

/**
 * The three layers an orb bar stacks, in paint order: the glass the notch is cut into, the edge
 * stroked along the very same path, and the orb that rides the notch. They share one box - the
 * wrapper - because the position the engine measures and publishes is relative to the notched
 * glass, and a layer inset differently would put the orb beside its own notch instead of in it.
 *
 * The wrapper's own inset belongs to the surface (a phone dock floats, a rail fills its column), so
 * both surfaces get the shape from the same engine without sharing a stylesheet.
 *
 * An icon goes inside the orb only where the notch sits on the tab's own icon, and that icon is
 * hidden at the same time. The rail's notch clears the icon column, so its orb stays a plain bead
 * rather than showing the same glyph twice.
 */
export function OrbNotchLayers({
  glassRef,
  pathRef,
  icon
}: {
  glassRef: RefObject<HTMLSpanElement>;
  pathRef: RefObject<SVGPathElement>;
  icon?: IconName | null;
}) {
  return (
    <span className="orb-notch" aria-hidden="true">
      <span ref={glassRef} className="orb-notch__glass" />
      <svg className="orb-notch__edge" focusable="false">
        <path ref={pathRef} d="" />
      </svg>
      <span className="orb-notch__orb">{icon ? <Icon name={icon} width={18} height={18} /> : null}</span>
    </span>
  );
}
