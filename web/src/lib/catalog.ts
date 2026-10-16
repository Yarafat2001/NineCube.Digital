import type { Product } from '../api/types';

/**
 * The seeded names were built by joining brand + model + attributes + SKU, so the raw value is far
 * too long for a card and repeats information the card already shows. These helpers derive the
 * short display name and move colour/storage/size text into a one-line variant summary. The stored
 * name is never rewritten - the derivation happens on read.
 */

/** "(64010a13)", "(8317004)": a bracketed run with a digit and no spaces is catalogue plumbing, not a name. */
const SKU_PARENTHETICAL = /\(\s*[0-9a-z-]*(?:[0-9][0-9a-z-]*){1,}\s*\)/gi;

const COLOR_WORDS = [
  'black', 'white', 'silver', 'grey', 'gray', 'blue', 'green', 'red', 'yellow', 'gold', 'rose gold',
  'pink', 'purple', 'violet', 'orange', 'brown', 'beige', 'navy', 'crimson', 'matte', ' glossy', 'titanium',
  'sky blue', 'midnight', 'starlight', 'product red'
];

const ATTRIBUTE_PATTERNS: RegExp[] = [
  /\b\d+(?:\.\d+)?\s?(?:gb|tb|mb)\b(?:\s?(?:ram|storage))?\b/gi,
  /\b\d+(?:\.\d+)?\s?(?:kg|g|ml|l|litre|liter|ton|mm|cm|inch|in|ft|feet|va|w|pk)\b/gi,
  /\b(?:size|fit)\s?\d+(?:\.\d+)?\b/gi,
  /\b(?:men|women|kids?|boys?|girls?|unisex|children)\b/gi
];

function colourMatches(name: string): string[] {
  const found: string[] = [];
  for (const colour of COLOR_WORDS) {
    const pattern = new RegExp(`\\b${colour.trim()}\\b`, 'gi');
    const hit = name.match(pattern);
    if (hit) hit.forEach(value => found.push(titleCase(value)));
  }
  return found;
}

function titleCase(value: string): string {
  return value.replace(/\S+/g, word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

/** Strip the leading brand when the card already prints the brand on its own line. */
function withoutBrandPrefix(name: string, brand: string): string {
  if (!brand) return name;
  let remaining = name.trim();
  const words = brand.trim().split(/\s+/);
  for (let guard = 0; guard < 3; guard++) {
    const match = new RegExp(`^${words.map(escapeRegExp).join('\\s+')}\\s+`, 'i').exec(remaining);
    // Keep the name when removing the brand would leave nothing ("Walton").
    if (!match || remaining.slice(match[0].length).trim().length < 3) break;
    remaining = remaining.slice(match[0].length).trim();
  }
  return remaining;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface CardPresentation {
  brand: string;
  /** Short name for the card; always non-empty and safe to line-clamp. */
  displayName: string;
  /** The untouched stored name, for the tooltip and the detail page. */
  fullName: string;
  /** One line of colour/storage/size attributes, or an empty string. */
  variant: string;
}

export function cardPresentation(product: Product): CardPresentation {
  const fullName = product.name ?? '';
  const brand = (product.brandName ?? product.tags?.find(tag => tag.startsWith('Brand: '))?.slice(7) ?? '').trim();

  const cleaned = withoutBrandPrefix(fullName.replace(SKU_PARENTHETICAL, ' '), brand)
    .replace(/[‐-―]/g, '-')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s*[-–,]\s*$/, '')
    .trim();

  const displayName = cleaned.length > 0 ? cleaned : fullName.trim();

  const attributes: string[] = [];
  for (const pattern of ATTRIBUTE_PATTERNS) {
    (displayName.match(pattern) ?? []).forEach(value => attributes.push(value.trim()));
  }
  colourMatches(displayName).forEach(value => attributes.push(value));

  const seen = new Set<string>();
  const variant = attributes.filter(value => {
    const key = value.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).join(', ');

  // The variant line repeats these attributes, so a trailing "…, Black" is dropped from the name
  // once it has been captured there. Names that are nothing but attributes keep their full text.
  const shortName = variant.length > 0 ? withoutTrailingAttributes(displayName) : displayName;

  return { brand, displayName: shortName, fullName, variant };
}

/** Remove trailing comma-separated clauses that are pure colour or measurement text. */
function withoutTrailingAttributes(name: string): string {
  let current = name.trim();
  for (;;) {
    const split = current.lastIndexOf(',');
    if (split < 0) break;
    const head = current.slice(0, split).replace(/[\s,]+$/, '').trim();
    const tail = current.slice(split + 1).trim();
    if (head.length < 3 || !isAttributeClause(tail)) break;
    current = head;
  }
  return current;
}

function isAttributeClause(clause: string): boolean {
  const value = clause.toLowerCase();
  if (!value || value.split(/\s+/).length > 3) return false;
  const colours = COLOR_WORDS.map(colour => escapeRegExp(colour.trim())).join('|');
  if (new RegExp(`^(?:${colours})(?:\\s+(?:${colours}))*$`).test(value)) return true;
  return /^[\d\s.,/x-]+(?:gb|tb|mb|ram|storage|kg|g|ml|l|litre|liter|ton|mm|cm|inch|in|ft|feet|va|w|pk)$/.test(value);
}

/** Chips on a card may not wipe the shopper's other filters, so they merge into the live query. */
export function mergeSearchParams(current: URLSearchParams, values: Record<string, string | null>): string {
  const next = new URLSearchParams(current);
  next.delete('page');
  for (const [key, value] of Object.entries(values)) {
    if (value === null || value === '') next.delete(key);
    else next.set(key, value);
  }
  const query = next.toString();
  return query ? `?${query}` : '';
}

export const CATALOG_FILTER_KEYS = ['q', 'category', 'includeDescendants', 'brand', 'line', 'tag', 'inStock', 'minPrice', 'maxPrice', 'sort'] as const;

/** A filter only counts as active when it changes the default behaviour. */
export function isFilterActive(key: string, value: string | null): boolean {
  if (!value) return false;
  if (key === 'sort') return value !== 'name';
  if (key === 'includeDescendants') return value === 'false';
  return true;
}

export function activeFilterCount(params: URLSearchParams): number {
  return CATALOG_FILTER_KEYS.reduce((total, key) => {
    if (key === 'brand' || key === 'line') return total + params.getAll(key).filter(v => v).length;
    if (key === 'tag') return total + (params.get('tag') ?? '').split(',').filter(v => v.trim()).length;
    return isFilterActive(key, params.get(key)) ? total + 1 : total;
  }, 0);
}

/** Round a ceiling up to 1/2/5 x 10^n so slider ticks stay readable. */
export function niceCeil(value: number): number {
  if (!(value > 0)) return 100;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const scaled = value / magnitude;
  const step = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
  return step * magnitude;
}

export function priceCeiling(prices: number[], currentMax?: string | null): number {
  const typed = Number(currentMax);
  const raw = Math.max(100, ...prices, Number.isFinite(typed) && typed > 0 ? typed : 0);
  return niceCeil(raw);
}
