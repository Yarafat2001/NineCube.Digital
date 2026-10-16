import { useQuery } from '@tanstack/react-query';
import { useAuthedRequest } from '../api/hooks';
import type { Category, ProductFilters, PagedResult, Product, Tag } from '../api/types';

/** Reuse the unchanged product-search API; category counts exclude only their own selection. */
function useFacetProducts(filters: Partial<ProductFilters>, facet: 'category' | 'tag') {
  const request = useAuthedRequest();
  const other = { ...filters };
  delete other.sort;
  if (facet === 'category') delete other.categorySlug;
  if (facet === 'tag') delete other.tag;
  if (!other.categorySlug) delete other.includeDescendants;
  const enabled = Object.values(other).some(v => Array.isArray(v) ? v.length > 0 : v !== undefined && v !== '');
  const query = useQuery({
    queryKey: ['products', 'facets', other], enabled, refetchInterval: 15000,
    queryFn: async () => {
      const search = new URLSearchParams();
      Object.entries(other).forEach(([key, value]) => {
        if (value === undefined || value === '') return;
        if (Array.isArray(value)) value.forEach(item => search.append(key === 'brands' ? 'brand' : 'line', item));
        else search.set(key, String(value));
      });
      const products: Product[] = [];
      for (let page = 1; ; page++) {
        search.set('page', String(page)); search.set('pageSize', '100');
        const result = await request<PagedResult<Product>>(`/api/products?${search}`);
        products.push(...result.items);
        if (!result.hasNext || result.items.length === 0 || page >= result.totalPages) break;
      }
      return products;
    }
  });
  return { query, enabled };
}

export function useTagFacets(tags: Tag[], filters: Partial<ProductFilters>) {
  const { query, enabled } = useFacetProducts(filters, 'tag');
  if (!enabled || !query.data) return { tags, pending: enabled && query.isPending, error: query.error };
  return { tags: tags.map(tag => {
    const matching = query.data.filter(p => p.tags?.includes(tag.name));
    return { ...tag, productCount: matching.length, inStockCount: matching.filter(p => p.isActive && p.stockQuantity > 0).length };
  }), pending: query.isPending, error: query.error };
}

export function useCategoryFacets(tree: Category[], filters: Partial<ProductFilters>) {
  const { query, enabled } = useFacetProducts(filters, 'category');
  if (!enabled || !query.data) return { tree, pending: enabled && query.isPending, error: query.error };
  const count = (nodes: Category[]): Category[] => nodes.map(node => {
    const descendantIds = new Set<number>();
    const collect = (n: Category) => { descendantIds.add(n.id); n.children.forEach(collect); }; collect(node);
    const direct = query.data.filter(p => p.categories?.some(c => c.id === node.id));
    const branch = query.data.filter(p => p.categories?.some(c => descendantIds.has(c.id)));
    return { ...node, productCount: branch.length, directProductCount: direct.length,
      inStockCount: branch.filter(p => p.isActive && p.stockQuantity > 0).length,
      directInStockCount: direct.filter(p => p.isActive && p.stockQuantity > 0).length,
      children: count(node.children) };
  });
  return { tree: count(tree), pending: query.isPending, error: query.error };
}
