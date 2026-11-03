import { t } from '../i18n/language';

export function BuyingGuide({ category }: { category?: { name: string; slug: string; path: string } }) {
  const key = `${category?.name} ${category?.slug} ${category?.path}`.toLowerCase();
  const advice = /shoe|sneaker|footwear|sandal|boot/.test(key)
    ? 'Check the brand size chart and measure both feet. Compare fit, material and intended use before choosing a size.'
    : /laptop|computer|electronics|phone|mobile|audio/.test(key)
      ? 'Compare the listed processor, memory, storage and connectivity. Check warranty coverage and included accessories on the product page.'
      : /shirt|cloth|fashion|apparel|pant|wear/.test(key)
        ? 'Compare garment measurements with clothing you already own. Check fabric, fit and care instructions rather than relying on size letters alone.'
        : null;
  if (!advice) return null;
  return <details className="card-glass" style={{ padding: 'var(--space-3)' }}><summary>{t('Buying guide')}</summary><p>{t(advice)}</p></details>;
}
