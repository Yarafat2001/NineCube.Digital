import { useMemo } from 'react';
import { useProducts } from '../../api/hooks';
import type { Product } from '../../api/types';

export interface HomeMerch {
  /** In-stock, active products from the merchandising page, by name order. */
  products: Product[];
  /** The strongest live deal: biggest percentage saving, else the newest arrival. */
  deal: Product | null;
  /** Saving percentage when the deal is a real discount, else 0 (the deal is an arrival). */
  dealPercent: number;
  /** The newest in-stock products by id, newest first. */
  newest: Product[];
  /** First product with a photo per category slug, for the category photo grid. */
  photoByCategory: Map<string, Product>;
}

/**
 * One catalogue page that feeds the hero deal panel, the category photo grid and the
 * featured-card badges. React Query deduplicates the shared request between consumers.
 */
export function useHomeMerch(): HomeMerch {
  const query = useProducts({ q: '', page: 1, pageSize: 48, inStock: true });

  const products = useMemo(
    () => (query.data?.items ?? []).filter((product) => product.isActive && product.stockQuantity > 0),
    [query.data]
  );

  return useMemo(() => {
    let deal: Product | null = null;
    let dealPercent = 0;
    const photoByCategory = new Map<string, Product>();
    const newest = [...products].sort((a, b) => b.id - a.id).slice(0, 3);

    for (const product of products) {
      for (const category of product.categories ?? []) {
        if (category.slug && product.imageUrl && !photoByCategory.has(category.slug)) {
          photoByCategory.set(category.slug, product);
        }
      }
      if (product.compareAtPrice && product.compareAtPrice > product.price) {
        const percent = Math.round(((product.compareAtPrice - product.price) / product.compareAtPrice) * 100);
        if (percent > dealPercent) {
          dealPercent = percent;
          deal = product;
        }
      }
    }

    if (!deal && newest.length > 0) {
      deal = newest[0]!;
    }

    return { products, deal, dealPercent, newest, photoByCategory };
  }, [products]);
}
