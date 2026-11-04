import type { Product } from '../api/types';

const STORAGE_KEY = 'ninecube:recent_views';
const MAX_RECENT = 8;

export function recordRecentView(product: Product): void {
  if (typeof window === 'undefined' || !product || !product.id) return;
  try {
    const existing = getRecentViews();
    const filtered = existing.filter((p) => p.id !== product.id);
    const updated = [product, ...filtered].slice(0, MAX_RECENT);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('ninecube:recent-views-updated'));
  } catch {
    // Graceful fallback if storage quota exceeded or disabled
  }
}

export function getRecentViews(): Product[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((p): p is Product => p && Number.isSafeInteger(p.id) && p.id > 0
      && typeof p.name === 'string' && typeof p.sku === 'string' && typeof p.isActive === 'boolean'
      && Number.isFinite(p.price) && p.price >= 0 && Number.isInteger(p.stockQuantity) && p.stockQuantity >= 0)
      .filter((p, index, all) => all.findIndex(item => item.id === p.id) === index).slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

export function clearRecentViews(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent('ninecube:recent-views-updated'));
  } catch {
    // Ignore
  }
}
