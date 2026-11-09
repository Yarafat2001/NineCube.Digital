import type { Product, ProductImage } from '../api/types';

export interface ResolvedProductImages {
  primaryUrl: string | null;
  primaryAlt: string;
  secondaryUrl: string | null;
  secondaryAlt: string | null;
}

/**
 * The catalogue shipped a stopgap art set under /products/bd/ - flat vector "packet" and "open"
 * illustrations drawn to stand in for a photo, every canonical_* file among them. They are not
 * photographs of the product, so they must never be presented as one: a card that cannot show a
 * real photo shows the honest placeholder instead, and a gallery never gains a fake second angle.
 *
 * Real photography lives at /products/BD-<SKU>.jpg (the download run), /products/sourced/ and
 * /products/laptops/; merchant uploads live at /uploads/.
 */
export function isGeneratedPlaceholderImage(url?: string | null): boolean {
  if (!url || typeof url !== 'string') return true;
  const trimmed = url.trim().toLowerCase();
  if (!trimmed) return true;
  return (
    trimmed.includes('/products/bd/') ||
    trimmed.includes('canonical_') ||
    trimmed.includes('dummy') ||
    trimmed.includes('ai-generated') ||
    trimmed.includes('missing-image') ||
    trimmed.includes('no-image') ||
    trimmed.includes('demo-product') ||
    trimmed.includes('demo.')
  );
}

/**
 * The download run stored some real stock photography under a "<SKU>.placeholder.jpg" name:
 * a photo of the category rather than of that exact variant. It is still a photograph, so it is
 * shown - but it is captioned "Representative image" so nobody mistakes it for the product itself.
 */
export function isRepresentativeImage(url?: string | null): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim().toLowerCase();
  return trimmed.includes('.placeholder.') || trimmed.includes('/placeholder');
}

/** The first candidate that is a real image, or null when none of them is. */
function firstRealUrl(...candidates: Array<string | null | undefined>): string | null {
  for (const candidate of candidates) {
    if (candidate && !isGeneratedPlaceholderImage(candidate)) return candidate;
  }
  return null;
}

/**
 * Resolves the primary photo and a genuine second angle from the gallery the API returned.
 *
 * It only ever returns URLs that exist in the product's own media: no slug-derived guesses, no
 * category-derived stand-ins. Older versions fabricated /products/bd/<slug>.jpg paths here, which
 * is how a dummy illustration could appear as the "second image" on a product whose real photo
 * was the first one.
 */
export function resolveDualProductImages(
  product: Product,
  imagesOverride?: ProductImage[] | null
): ResolvedProductImages {
  const gallery = (imagesOverride ?? product.images ?? []).filter(
    image => !isGeneratedPlaceholderImage(image.url)
  );

  // A gallery often arrives without isPrimary set on any row. Falling back to "the first image
  // that is not primary" would then pick image 0 twice and hide a genuine second angle.
  const primaryIndex = Math.max(0, gallery.findIndex(image => image.isPrimary));
  const primaryFromGallery = gallery[primaryIndex] ?? null;
  const secondaryFromGallery =
    gallery.find((_, index) => index !== primaryIndex) ?? null;

  // The stored imageUrl is only a candidate when it is not itself generated art.
  const primaryUrl = firstRealUrl(primaryFromGallery?.url, product.imageUrl);
  const secondaryUrl = firstRealUrl(secondaryFromGallery?.url);

  return {
    primaryUrl,
    primaryAlt: primaryFromGallery?.altText ?? product.name,
    secondaryUrl: secondaryUrl && secondaryUrl !== primaryUrl ? secondaryUrl : null,
    secondaryAlt:
      secondaryUrl && secondaryUrl !== primaryUrl
        ? secondaryFromGallery?.altText ?? `${product.name} (Detail)`
        : null
  };
}
