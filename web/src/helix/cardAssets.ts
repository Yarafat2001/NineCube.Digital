/**
 * Card artwork for the helix.
 *
 * The reference maps the nine cards to `assets/work-01.svg … work-09.svg` in filename order. Here
 * the list is discovered from `web/public/assets` through a generated manifest, so adding artwork
 * is a file-drop rather than a code change. Fewer than nine images are repeated in order, which is
 * the behaviour the brief asks for.
 */
export const CARD_COUNT = 9;

export const CARD_DIRECTORY = '/assets';

const photoDescriptions = [
  'Coffee and handcrafted ceramic cups', 'Wireless headphones on a yellow background',
  'White sneakers with peach detailing', 'Skincare bottles on a marble tray',
  'A wristwatch and backpack ready for travel', 'A jade houseplant in a terracotta pot',
  'A woven lounge chair with indoor greenery', 'A notebook and writing supplies on a wooden desk',
  'A ceramic bowl of fresh seasonal fruit'
];

export const cardCategories = ['Coffee', 'Technology', 'Footwear', 'Beauty', 'Accessories', 'Plants', 'Living', 'Stationery', 'Fresh food'];

export function describeCardArtwork(src: string, index: number): string {
  const photo = /\/photo-(\d+)\.jpg$/.exec(src);
  return (photo ? photoDescriptions[Number(photo[1]) - 1] : null) ?? `Showcase card ${index + 1} of ${CARD_COUNT}`;
}

/** The reference demo artwork, shipped in `public/assets`, used when the manifest is unavailable. */
export const DEFAULT_CARD_ASSETS: readonly string[] = Array.from(
  { length: CARD_COUNT },
  (_, index) => `${CARD_DIRECTORY}/work-${String(index + 1).padStart(2, '0')}.svg`
);

interface AssetManifest {
  files?: unknown;
}

/**
 * Turns a list of filenames into exactly {@link CARD_COUNT} absolute paths: filename order, then
 * repeated from the start until the helix is full. An empty list falls back to the shipped artwork.
 */
export function normaliseCardAssets(files: readonly unknown[]): string[] {
  const usable = files
    .filter((name): name is string => typeof name === 'string' && name.trim().length > 0)
    .map((name) => name.trim());

  if (usable.length === 0) return [...DEFAULT_CARD_ASSETS];

  return Array.from(
    { length: CARD_COUNT },
    (_, index) => `${CARD_DIRECTORY}/${usable[index % usable.length]}`
  );
}

/**
 * Reads the manifest written by `scripts/asset-manifest.mjs`. Any failure (missing manifest, a
 * static host that does not serve it, a parse error) is non-fatal: the shipped artwork is used so
 * the showcase still renders.
 */
export async function loadCardAssets(request: typeof fetch = fetch): Promise<string[]> {
  try {
    // Absolute rather than root-relative: `fetch` in the test environment (jsdom + Node) needs a
    // full URL, and the resolved value is identical to the path the browser would have used.
    const manifestUrl =
      typeof window === 'undefined' ? `${CARD_DIRECTORY}/assets.json` : new URL(`${CARD_DIRECTORY}/assets.json`, window.location.origin).toString();

    const response = await request(manifestUrl);

    if (!response.ok) return [...DEFAULT_CARD_ASSETS];

    const manifest = (await response.json()) as AssetManifest;
    return normaliseCardAssets(Array.isArray(manifest.files) ? manifest.files : []);
  } catch {
    return [...DEFAULT_CARD_ASSETS];
  }
}
