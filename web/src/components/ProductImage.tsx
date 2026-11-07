import { t, useLanguage } from '../i18n/language';
import { useEffect, useState } from 'react';
import { resolveAssetUrl } from '../api/client';
import type { Product, ProductImage as ProductImageType } from '../api/types';
import { Icon } from './Icon';

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
  alt,
  interactiveToggle = true
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
  const imageDescription = primary?.altText ?? product.name;
  const representative = imageDescription.startsWith('Representative image:');
  const src = resolveAssetUrl(stored);
  const secondarySrc = secondary ? resolveAssetUrl(secondary.url) : null;

  const [broken, setBroken] = useState(false);
  const [secondaryBroken, setSecondaryBroken] = useState(false);
  const [activeView, setActiveView] = useState<'packet' | 'open'>('packet');

  useEffect(() => { setBroken(false); }, [src]);
  useEffect(() => { setSecondaryBroken(false); }, [secondarySrc]);

  // The seeded coffee shots are full scenes; they read better cropped than letterboxed.
  const isPhoto = /^\/products\/nc-10\d{2}\.jpg$/.test(stored ?? '');

  return (
    <span className={frame === 'detail' ? 'product-detail__media' : 'product-card__media'}>
      {!src || broken ? (
        <Placeholder name={product.name} tall={frame === 'detail'} category={product.categories?.find(c => c.isPrimary)?.slug ?? ''} />
      ) : (
        <>
          <img
            className={`product-card__image${isPhoto ? ' product-card__image--photo' : ''}${secondarySrc && frame === 'card' ? ' product-card__image--primary' : ''}${activeView === 'open' ? ' product-card__image--hidden' : ''}`}
            src={src}
            alt={t(alt ?? imageDescription)}
            loading="lazy"
            decoding="async"
            onError={() => setBroken(true)}
          />
          {secondarySrc && frame === 'card' && !secondaryBroken ? (
            <img
              className={`product-card__image product-card__image--secondary${activeView === 'open' ? ' product-card__image--visible' : ''}`}
              src={secondarySrc}
              alt={t(secondary?.altText ?? `${product.name} (${t("Inside")})`)}
              loading="lazy"
              decoding="async"
              onError={() => setSecondaryBroken(true)}
              aria-hidden={activeView !== 'open'}
            />
          ) : null}
          {secondarySrc && frame === 'card' && !secondaryBroken && interactiveToggle ? (
            <button
              type="button"
              className="product-card__view-toggle"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setActiveView(v => (v === 'packet' ? 'open' : 'packet'));
              }}
              title={activeView === 'packet' ? t("Switch to Inside view") : t("Switch to Packet view")}
              aria-label={activeView === 'packet' ? t("Switch to Inside view") : t("Switch to Packet view")}
            >
              <span className="view-toggle__pill">
                {activeView === 'packet' ? `📦 ${t("Packet")}` : `✨ ${t("Inside")}`}
              </span>
            </button>
          ) : null}
        </>
      )}
      {src && !broken && representative ? <span className="product-image-caption">{t("Representative image")}</span> : null}
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
  const rawUrl = explicitUrl ?? productUrl;
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
