import type { Product } from '../api/types';

const STORAGE_KEY = 'ninecube:recent_views';
const MAX_RECENT = 8;

export function recordRecentView(product: Product): void {
  if (typeof window === 'undefined' || !product || !product.id) return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const existing: Product[] = raw ? JSON.parse(raw) : [];
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
    return raw ? JSON.parse(raw) : [];
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
