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
  alt
}: {
  product: Product;
  images?: ProductImageType[] | null;
  frame?: 'card' | 'detail';
  alt?: string;
}) {
  useLanguage();
  const stored = primaryImage(product, images);
  const gallery = images ?? product.images ?? [];
  const primary = gallery.find(image => image.isPrimary) ?? gallery[0];
  const imageDescription = primary?.altText ?? product.name;
  const representative = imageDescription.startsWith('Representative image:');
  const src = resolveAssetUrl(stored);
  const [broken, setBroken] = useState(false);

  useEffect(() => { setBroken(false); }, [src]);

  // The seeded coffee shots are full scenes; they read better cropped than letterboxed.
  const isPhoto = /^\/products\/nc-10\d{2}\.jpg$/.test(stored ?? '');

  return (
    <span className={frame === 'detail' ? 'product-detail__media' : 'product-card__media'}>
      {!src || broken ? (
        <Placeholder name={product.name} tall={frame === 'detail'} category={product.categories?.find(c => c.isPrimary)?.slug ?? ''} />
      ) : (
        <img
          className={`product-card__image${isPhoto ? ' product-card__image--photo' : ''}`}
          src={src}
          alt={t(alt ?? imageDescription)}
          loading="lazy"
          decoding="async"
          onError={() => setBroken(true)}
        />
      )}
      {src && !broken && representative ? <span className="product-image-caption">{t("Representative image")}</span> : null}
    </span>
  );
}
