/**
 * A colour in a stylesheet is not a colour on screen: a translucent fill has to be blended over
 * whatever is painted behind it before a contrast ratio means anything. This runs in the page and
 * answers with the ratios the pixels actually resolve to.
 *
 * Shared by the coupon workflow and cart sheet specs so both ask the same question the same way.
 */
export type Edge = {
  /** The element's own text, so a failure names the control rather than the index. */
  text: string;
  /** Resolved font size in px, which is what a person actually reads. */
  px: number;
  width: number;
  edge: string;
  own: string;
  vsOwn: number;
  vsParent: number;
};

declare global {
  interface Window {
    __edge: (selector: string) => Edge | null;
    __edges: (selector: string) => Edge[];
  }
}

export const COLOUR_PROBE = `
  const lum = (c) => { const [r,g,b] = c.map(v => { const s = v/255; return s <= 0.03928 ? s/12.92 : Math.pow((s+0.055)/1.055, 2.4); }); return 0.2126*r + 0.7152*g + 0.0722*b; };
  const parse = (c) => (c.match(/[\\d.]+/g) || [0,0,0,0]).slice(0,4).map(Number);
  const alpha = (c) => { const p = parse(c); return p.length > 3 ? p[3] : 1; };
  const over = (fg, bg, a) => fg.slice(0,3).map((v, i) => Math.round(v*a + bg[i]*(1-a)));
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return Math.round(((Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05))*100)/100; };
  const measure = (el) => {
    const cs = getComputedStyle(el);
    let node = el.parentElement; let parent = [255,255,255];
    while (node) {
      const pc = getComputedStyle(node); const a = alpha(pc.backgroundColor);
      if (a > 0) { parent = over(parse(pc.backgroundColor), parent, a); if (a > 0.99) break; }
      node = node.parentElement;
    }
    const ownAlpha = alpha(cs.backgroundColor);
    const own = ownAlpha > 0 ? over(parse(cs.backgroundColor), parent, ownAlpha) : parent;
    const edge = over(parse(cs.borderTopColor), own, alpha(cs.borderTopColor));
    return {
      text: (el.textContent || el.className || el.tagName).trim().slice(0, 30),
      px: Math.round(parseFloat(cs.fontSize) * 10) / 10,
      width: parseFloat(cs.borderTopWidth),
      edge: 'rgb(' + edge.join(',') + ')',
      own: 'rgb(' + own.join(',') + ')',
      vsOwn: ratio(edge, own),
      vsParent: ratio(edge, parent)
    };
  };
  window.__edge = (selector) => { const el = document.querySelector(selector); return el ? measure(el) : null; };
  window.__edges = (selector) => [...document.querySelectorAll(selector)].filter(el => el.getBoundingClientRect().height > 0).map(measure);
`;
