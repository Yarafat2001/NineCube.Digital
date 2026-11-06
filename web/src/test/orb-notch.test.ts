import { describe, expect, it } from 'vitest';
import { ORB_NOTCH, orbNotchPath } from '../lib/orbNotch';

// The engine is pure geometry, so it can be checked against the silhouette it is meant to draw
// without a layout. Both surfaces depend on these numbers staying the shape of one path.
describe('orbNotchPath', () => {
  const bar = { edge: 'top' as const, length: 366, thickness: 60, centre: 183 };

  it('cuts the dip out of the notched edge and closes the bar with four rounded ends', () => {
    const { d, centre } = orbNotchPath(bar);
    expect(centre).toBe(183);
    expect(d.startsWith(`M${ORB_NOTCH.endRadius} 0L${183 - ORB_NOTCH.half} 0`)).toBe(true);
    // The two curve halves meet at the bottom of the dip, exactly under the orb.
    expect(d).toContain(` ${183} ${ORB_NOTCH.depth}C`);
    expect(d.endsWith(`A${ORB_NOTCH.endRadius} ${ORB_NOTCH.endRadius} 0 0 1 ${ORB_NOTCH.endRadius} 0Z`)).toBe(true);
    expect((d.match(/A/g) ?? [])).toHaveLength(4);
    expect(d).not.toContain('NaN');
  });

  it('keeps the notch inside the bar so it can never fall off an end', () => {
    const margin = ORB_NOTCH.endRadius + ORB_NOTCH.half;
    expect(orbNotchPath({ ...bar, centre: 0 }).centre).toBe(margin);
    expect(orbNotchPath({ ...bar, centre: bar.length }).centre).toBe(bar.length - margin);
    // A bar too short to carry the notch at all still gets one shape, parked at its start.
    expect(orbNotchPath({ ...bar, length: 40 }).centre).toBe(margin);
  });

  it('turns the same silhouette onto a rail and flips the corner arcs with it', () => {
    const rail = orbNotchPath({ edge: 'left', length: 480, thickness: 72, centre: 240 });
    // Swapped axes: the notched edge is the rail's own left side, so the dip runs inward on x.
    expect(rail.d.startsWith(`M0 ${ORB_NOTCH.endRadius}L0 ${240 - ORB_NOTCH.half}`)).toBe(true);
    expect(rail.d).toContain(`${ORB_NOTCH.depth} 240C`);
    const arc = `A${ORB_NOTCH.endRadius} ${ORB_NOTCH.endRadius} 0 0 `;
    expect(rail.d.split(arc + '0')).toHaveLength(5);
    expect(rail.d.split(arc + '1')).toHaveLength(1);
    expect(orbNotchPath(bar).d.split(arc + '1')).toHaveLength(5);
    expect(rail.centre).toBe(240);
  });

  it('gives the clip and the stroke one path, not two shapes that drift apart', () => {
    const horizontal = orbNotchPath(bar);
    const narrow = orbNotchPath({ ...bar, length: 320, centre: 40 });
    // Every command set has to be usable as path("...") and as an SVG d, so no commas or newlines.
    expect([horizontal.d, narrow.d].every((d) => !/[,;\n]/.test(d))).toBe(true);
    expect(narrow.d).not.toContain('NaN');
  });
});
