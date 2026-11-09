import { t, useLanguage } from '../i18n/language';
import { useEffect, useState } from 'react';
import { resolveAssetUrl } from '../api/client';
import type { Product, ProductImage as ProductImageType } from '../api/types';
import { isGeneratedPlaceholderImage, isRepresentativeImage, resolveDualProductImages } from '../lib/catalogImages';
import { Icon } from './Icon';

/**
 * Helper to detect placeholder, dummy, or synthetic fallback image URLs. The generated vector
 * art under /products/bd/ is included: it is a stand-in drawing, not a photo of the product.
 */
export function isPlaceholderOrAiImage(url?: string | null): boolean {
  return isGeneratedPlaceholderImage(url);
}

/** The primary image first, then the rest - the same order the API returns. */
export function primaryImage(product: Product, images?: ProductImageType[] | null): string | null {
  const gallery = images ?? product.images ?? [];
  const uploaded = gallery.find(image => image.isPrimary) ?? gallery[0];
  return uploaded?.url ?? product.imageUrl ?? null;
}

function Placeholder({ name, tall, category }: { name: string; tall: boolean; category: string }) {
  useLanguage();
  return (
    <div className="image-placeholder" role="img" aria-label={t(`No image for ${name}`)} data-testid="image-placeholder">
      <Icon name={/phone|tablet/.test(category) ? 'phone' : /coffee|tea|beverage/.test(category) ? 'coffee' : /bag|wallet/.test(category) ? 'wallet' : /shoe|footwear/.test(category) ? 'shoe' : /chair|bed|furniture/.test(category) ? 'chair' : /refriger/.test(category) ? 'fridge' : /lighting|led/.test(category) ? 'spark' : 'box'} className="image-placeholder__icon" />
      <span className="image-placeholder__label">{t("No image")}</span>
      {tall ? <span className="muted">{t(name)}</span> : null}
    </div>
  );
}

/**
 * Uploaded files are served by the API host, so a stored root-relative path must be qualified
 * before it reaches <img src>. A URL that fails to load falls back to the same placeholder an
 * empty gallery uses, which keeps the card height identical either way.
 */
export function ProductImage({
  product,
  images,
  frame = 'card',
  alt
}: {
  product: Product;
  images?: ProductImageType[] | null;
  frame?: 'card' | 'detail';
  alt?: string;
  interactiveToggle?: boolean;
}) {
  useLanguage();
  const gallery = images ?? product.images ?? [];
  const primary = gallery.find(image => image.isPrimary) ?? gallery[0];
  const secondary = gallery.find(image => !image.isPrimary) ?? (gallery.length > 1 ? gallery[1] : null);

  const stored = primaryImage(product, images);
  const dual = resolveDualProductImages(product, images);

  const isMerchantUpload = stored && stored.startsWith('/uploads/');
  const hasSpecificStored = stored && !isPlaceholderOrAiImage(stored);
  // A generated stand-in is never promoted to "the product photo": when the stored URL is art and
  // the resolver has no real photo either, effectivePrimary stays null and the placeholder shows.
  const effectivePrimary = isMerchantUpload ? stored : (hasSpecificStored ? stored : dual.primaryUrl);

  // ONLY allow secondary image if an authentic, distinct, non-dummy second image exists in the
  // product's gallery. The resolver already skipped generated art, so a gallery of
  // [real, drawing, real detail] still offers the real detail as the second angle.
  const rawSecondary = dual.secondaryUrl;
  const isRealSecondary = Boolean(
    rawSecondary &&
    !isPlaceholderOrAiImage(rawSecondary) &&
    rawSecondary !== effectivePrimary
  );
  const effectiveSecondary = isRealSecondary ? rawSecondary : null;
  const hasDistinctSecondary = Boolean(effectiveSecondary);

  const imageDescription = isMerchantUpload ? (primary?.altText ?? product.name) : (dual.primaryAlt ?? primary?.altText ?? product.name);
  const secondaryDescription = dual.secondaryAlt ?? secondary?.altText ?? `${product.name} (Detail)`;

  const representative = isRepresentativeImage(effectivePrimary) || imageDescription.startsWith('Representative image:');
  const isPrimaryPlaceholder = isPlaceholderOrAiImage(effectivePrimary);
  const src = resolveAssetUrl(effectivePrimary);
  const secondarySrc = resolveAssetUrl(effectiveSecondary);

  const [broken, setBroken] = useState(false);
  const [secondaryBroken, setSecondaryBroken] = useState(false);
  const [activeView, setActiveView] = useState<'primary' | 'secondary'>('primary');

  useEffect(() => { setBroken(false); }, [src]);
  useEffect(() => { setSecondaryBroken(false); }, [secondarySrc]);

  // Slideshow: cycle between primary and secondary image one after another at a timed interval ONLY if real secondary image exists
  useEffect(() => {
    if (!hasDistinctSecondary || secondaryBroken || frame !== 'card') {
      setActiveView('primary');
      return;
    }

    // Stagger slightly across cards by product ID so cards don't flip simultaneously
    const stagger = ((product.id || 0) % 5) * 600;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    const timeoutId = setTimeout(() => {
      setActiveView('secondary');
      intervalId = setInterval(() => {
        if (typeof document !== 'undefined' && document.hidden) return;
        setActiveView(v => (v === 'primary' ? 'secondary' : 'primary'));
      }, 3500);
    }, 2800 + stagger);

    return () => {
      clearTimeout(timeoutId);
      if (intervalId) clearInterval(intervalId);
    };
  }, [hasDistinctSecondary, secondaryBroken, frame, product.id]);

  // The seeded coffee shots are full scenes; they read better cropped than letterboxed.
  const isPhoto = /^\/products\/nc-10\d{2}\.jpg$/.test(stored ?? '');

  return (
    <span className={frame === 'detail' ? 'product-detail__media' : 'product-card__media'}>
      {!src || broken || isPrimaryPlaceholder ? (
        <Placeholder name={product.name} tall={frame === 'detail'} category={product.categories?.find(c => c.isPrimary)?.slug ?? ''} />
      ) : (
        <>
          <img
            className={`product-card__image${isPhoto ? ' product-card__image--photo' : ''}${hasDistinctSecondary && !secondaryBroken && frame === 'card' ? ' product-card__image--primary' : ''}${activeView === 'secondary' && hasDistinctSecondary ? ' product-card__image--hidden' : ''}`}
            src={src}
            alt={t(alt ?? imageDescription)}
            loading="lazy"
            decoding="async"
            onError={() => setBroken(true)}
          />
          {hasDistinctSecondary && frame === 'card' && !secondaryBroken ? (
            <img
              className={`product-card__image product-card__image--secondary${activeView === 'secondary' ? ' product-card__image--visible' : ''}`}
              src={secondarySrc}
              alt={t(secondaryDescription)}
              loading="lazy"
              decoding="async"
              onError={() => setSecondaryBroken(true)}
              aria-hidden={activeView !== 'secondary'}
            />
          ) : null}
        </>
      )}
      {src && !broken && !isPrimaryPlaceholder && representative ? <span className="product-image-caption">{t("Representative image")}</span> : null}
    </span>
  );
}

/** Compact product thumbnail with automated asset URL resolution and fallback box icon. */
export function ProductThumbnail({
  product,
  url,
  alt = '',
  className = '',
  style,
  iconSize = 20
}: {
  product?: Partial<Product> | null;
  url?: string | null;
  alt?: string;
  className?: string;
  style?: React.CSSProperties;
  iconSize?: number;
}) {
  const explicitUrl = url && typeof url === 'string' && url.trim().length > 0 ? url.trim() : null;
  const productUrl = product ? primaryImage(product as Product) : null;
  const dual = product ? resolveDualProductImages(product as Product) : null;
  const isMerchant = (explicitUrl && explicitUrl.startsWith('/uploads/')) || (productUrl && productUrl.startsWith('/uploads/'));
  const candidates = isMerchant
    ? [explicitUrl, productUrl]
    : [dual?.primaryUrl, explicitUrl, productUrl];
  const rawUrl = candidates.find(candidate => candidate && !isGeneratedPlaceholderImage(candidate)) ?? null;
  const src = resolveAssetUrl(rawUrl);
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    setBroken(false);
  }, [src]);

  const category = (product?.categories?.find(c => c.isPrimary)?.slug ?? product?.categories?.[0]?.slug ?? '').toLowerCase();
  const iconName = /phone|tablet/.test(category)
    ? 'phone'
    : /coffee|tea|beverage/.test(category)
      ? 'coffee'
      : /bag|wallet/.test(category)
        ? 'wallet'
        : /shoe|footwear/.test(category)
          ? 'shoe'
          : /chair|bed|furniture/.test(category)
            ? 'chair'
            : /refriger/.test(category)
              ? 'fridge'
              : /lighting|led/.test(category)
                ? 'spark'
                : 'box';

  if (!src || broken) {
    return (
      <span
        className={`thumb-placeholder ${className}`}
        style={{ ...style, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
        aria-hidden="true"
        data-testid="thumb-placeholder"
      >
        <Icon name={iconName} width={iconSize} height={iconSize} />
      </span>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      style={style}
      loading="lazy"
      decoding="async"
      onError={() => setBroken(true)}
    />
  );
}
