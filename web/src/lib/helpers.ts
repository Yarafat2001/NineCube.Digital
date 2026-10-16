import { useEffect, useState } from 'react';
import type { NotificationType, OrderStatus, UserRole } from '../api/types';

// ------------------------------------------------------------------ formatting

// Display currency: BDT is the store default; the API still owns per-product
// currency and formatMoney honours any explicit code it returns.
const bdt = new Intl.NumberFormat('en-BD', { style: 'currency', currency: 'BDT', currencyDisplay: 'code' });
const bdtWhole = new Intl.NumberFormat('en-BD', { style: 'currency', currency: 'BDT', currencyDisplay: 'code', maximumFractionDigits: 0 });
const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', currencyDisplay: 'code' });
const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const dateOnly = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

export const formatMoney = (value: number, code = 'BDT'): string => code === 'BDT' ? bdt.format(value) : code === 'USD' ? currency.format(value) : new Intl.NumberFormat('en-BD', { style: 'currency', currency: code, currencyDisplay: 'code' }).format(value);

/** The same amount without decimals, for places where "BDT 1,000.00" would not fit - slider ranges. */
export const formatMoneyWhole = (value: number, code = 'BDT'): string =>
  code === 'BDT' ? bdtWhole.format(value) : new Intl.NumberFormat('en-BD', { style: 'currency', currency: code, currencyDisplay: 'code', maximumFractionDigits: 0 }).format(value);

export const formatDateTime = (value: string | Date): string => dateTime.format(new Date(value));

export const formatDate = (value: string | Date): string => dateOnly.format(new Date(value));

// ------------------------------------------------------------------ ids

/** UUID v4 per submission attempt, with a fallback for browsers without crypto.randomUUID. */
export function createIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `key-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ------------------------------------------------------------------ debounce

/** Debounced mirror of a value, used to keep search requests off every keystroke. */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

// ------------------------------------------------------------------ domain metadata

export interface StatusMeta {
  label: string;
  /** Icon glyph so status is never communicated by colour alone. */
  glyph: string;
  tone: 'ok' | 'warn' | 'danger' | 'info' | 'neutral';
  description: string;
}

export const orderStatusMeta: Record<OrderStatus, StatusMeta> = {
  Pending: {
    label: 'Pending',
    glyph: '◔',
    tone: 'warn',
    description: 'Received and waiting for a staff member to confirm or reject it.'
  },
  Confirmed: {
    label: 'Confirmed',
    glyph: '✓',
    tone: 'info',
    description: 'Accepted by staff. Stock is still reserved.'
  },
  Shipped: {
    label: 'Shipped',
    glyph: '➜',
    tone: 'ok',
    description: 'Handed over for delivery. It can no longer be cancelled.'
  },
  Rejected: {
    label: 'Rejected',
    glyph: '✕',
    tone: 'danger',
    description: 'Declined by staff. The reserved stock was released.'
  },
  Cancelled: {
    label: 'Cancelled',
    glyph: '⊘',
    tone: 'neutral',
    description: 'Cancelled by the customer or by staff. The reserved stock was released.'
  }
};

/** Glyph + words: an inbox row must never rely on colour alone to say what happened. */
export const notificationTypeMeta: Record<NotificationType, { label: string; glyph: string; tone: StatusMeta['tone'] }> = {
  OrderPlaced: { label: 'Order placed', glyph: '✓', tone: 'ok' },
  OrderStatusChanged: { label: 'Order updated', glyph: '➜', tone: 'info' },
  OrderCancelled: { label: 'Order cancelled', glyph: '⊘', tone: 'neutral' },
  NewOrder: { label: 'New order', glyph: '◔', tone: 'warn' },
  LowStock: { label: 'Low stock', glyph: '⚠', tone: 'danger' }
};

export const roleLabels: Record<UserRole, string> = {  Customer: 'Customer',
  Staff: 'Staff (Sales Manager)',
  InventoryManager: 'Inventory Manager',
  Administrator: 'Administrator'
};

export const roleShortLabels: Record<UserRole, string> = {
  Customer: 'Customer',
  Staff: 'Staff',
  InventoryManager: 'Inventory',
  Administrator: 'Admin'
};

export type StockLevel = 'in-stock' | 'low-stock' | 'out-of-stock' | 'inactive';

export interface StockMeta {
  level: StockLevel;
  label: string;
  glyph: string;
  tone: 'ok' | 'warn' | 'danger' | 'neutral';
}

export function stockLevel(product: { stockQuantity: number; isActive: boolean }, lowStockThreshold: number): StockMeta {
  if (!product.isActive) {
    return { level: 'inactive', label: 'Inactive', glyph: '⏻', tone: 'neutral' };
  }

  if (product.stockQuantity <= 0) {
    return { level: 'out-of-stock', label: 'Out of stock', glyph: '⛔', tone: 'danger' };
  }

  if (product.stockQuantity <= lowStockThreshold) {
    return { level: 'low-stock', label: `Low stock · ${product.stockQuantity} left`, glyph: '⚠', tone: 'warn' };
  }

  return { level: 'in-stock', label: `In stock · ${product.stockQuantity}`, glyph: '●', tone: 'ok' };
}

// ------------------------------------------------------------------ dates for reports

/**
 * An <input type="date"> (and the report range that feeds it) is a *calendar* date in the
 * viewer's own time zone. Slicing an ISO string takes the UTC date, which is the previous day
 * for any viewer east of UTC, so "today" silently fell outside the default range.
 */
export function toDateInput(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function defaultReportRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getTime() - 29 * 24 * 60 * 60 * 1000);
  return { from: toDateInput(from), to: toDateInput(to) };
}

/** Human-readable relative time; the exact timestamp remains in the time element tooltip. */
export function timeAgo(value: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return 'Just now';
  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  if (seconds < 3600) return formatter.format(-Math.floor(seconds / 60), 'minute');
  if (seconds < 86400) return formatter.format(-Math.floor(seconds / 3600), 'hour');
  return formatter.format(-Math.floor(seconds / 86400), 'day');
}
