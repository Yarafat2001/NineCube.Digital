import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Product } from '../api/types';

/**
 * The cart is deliberately client-side only (documented assumption): there is no server
 * cart table, and stock is only reserved when the order is placed. Duplicate lines for the
 * same product are merged here, and the quantity is capped at the last known availability
 * as a convenience - the server remains the single source of truth.
 */
export interface CartLine {
  productId: number;
  sku: string;
  name: string;
  unitPrice: number;
  currency?: string;
  quantity: number;
  available: number;
}

export interface CartContextValue {
  lines: CartLine[];
  total: number;
  currency: string;
  mixedCurrencies: boolean;
  itemCount: number;
  add: (product: Product, quantity: number) => void;
  setQuantity: (productId: number, quantity: number) => void;
  remove: (productId: number) => void;
  clear: () => void;
  /** Re-checks the lines against fresh product data after a 409. */
  reconcile: (products: Product[]) => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export const MAX_QUANTITY_PER_LINE = 1000;

const CART_STORAGE_KEY = 'ninecube.cart.v1';

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>(() => {
    try {
      const raw = localStorage.getItem(CART_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // LocalStorage unavailable in test or private mode
    }
    return [];
  });

  useEffect(() => {
    try {
      if (lines.length === 0) {
        localStorage.removeItem(CART_STORAGE_KEY);
      } else {
        localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(lines));
      }
    } catch {
      // Ignore storage write issues
    }
  }, [lines]);

  const add = useCallback((product: Product, quantity: number) => {
    setLines((current) => {
      const existing = current.find((line) => line.productId === product.id);
      const cap = Math.min(product.stockQuantity, MAX_QUANTITY_PER_LINE);

      if (existing) {
        // merged duplicate: the quantity accumulates instead of creating a second line
        return current.map((line) =>
          line.productId === product.id
            ? {
                ...line,
                quantity: Math.min(line.quantity + quantity, cap),
                unitPrice: product.price, currency: product.currency ?? 'BDT',
                available: product.stockQuantity,
                name: product.name,
                sku: product.sku
              }
            : line
        );
      }

      return [
        ...current,
        {
          productId: product.id,
          sku: product.sku,
          name: product.name,
          unitPrice: product.price, currency: product.currency ?? 'BDT',
          quantity: Math.min(quantity, cap),
          available: product.stockQuantity
        }
      ];
    });
  }, []);

  const setQuantity = useCallback((productId: number, quantity: number) => {
    setLines((current) =>
      current
        .map((line) =>
          line.productId === productId
            ? { ...line, quantity: Math.max(0, Math.min(quantity, Math.min(line.available, MAX_QUANTITY_PER_LINE))) }
            : line
        )
        .filter((line) => line.quantity > 0)
    );
  }, []);

  const remove = useCallback((productId: number) => {
    setLines((current) => current.filter((line) => line.productId !== productId));
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const reconcile = useCallback((products: Product[]) => {
    setLines((current) =>
      current
        .map((line) => {
          const fresh = products.find((product) => product.id === line.productId);
          if (!fresh) return { ...line, available: 0 };
          return { ...line, available: fresh.stockQuantity, unitPrice: fresh.price, currency: fresh.currency ?? 'BDT', name: fresh.name, sku: fresh.sku };
        })
        // keep the line even when the new availability is zero: the user must see why the
        // order failed rather than have their cart silently emptied
        .filter((line) => line.quantity > 0)
    );
  }, []);

  const value = useMemo<CartContextValue>(() => {
    const total = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
    const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);

    const currencies = new Set(lines.map(line => line.currency ?? 'BDT'));
    return { currency: lines[0]?.currency ?? 'BDT', mixedCurrencies: currencies.size > 1, lines, total: Math.round(total * 100) / 100, itemCount, add, setQuantity, remove, clear, reconcile };
  }, [lines, add, setQuantity, remove, clear, reconcile]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used inside <CartProvider>');
  return context;
}
