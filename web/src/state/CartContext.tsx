import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { useSavedCart } from './useSavedCart';
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
  syncStatus?: string;
  reloadSavedCart?: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export const MAX_QUANTITY_PER_LINE = 1000;

const CART_STORAGE_KEY = 'ninecube.cart.v1';

export function CartProvider({ children }: { children: ReactNode }) {
  const { user, token, initialising } = useAuth();
  const owner = user?.role === 'Customer' ? user.id : null;
  const keyFor = (id: number | null) => id === null ? CART_STORAGE_KEY : `${CART_STORAGE_KEY}.account.${id}`;
  const read = (id: number | null): CartLine[] => {
    try {
      const raw = localStorage.getItem(keyFor(id)) ?? (id !== null ? localStorage.getItem(CART_STORAGE_KEY) : null);
      const value: unknown = JSON.parse(raw ?? '[]');
      return Array.isArray(value) ? value.filter(l => l && Number.isSafeInteger(l.productId) && Number.isInteger(l.quantity) && l.quantity > 0 && l.quantity <= 1000).slice(0, 200) : [];
    } catch { return []; }
  };
  const [cart, setCart] = useState(() => ({ owner, lines: read(owner) }));
  const lines = cart.owner === owner ? cart.lines : [];
  const setLines = useCallback<React.Dispatch<React.SetStateAction<CartLine[]>>>(update => setCart(current => ({ owner,
    lines: typeof update === 'function' ? update(current.owner === owner ? current.lines : []) : update })), [owner]);
  useEffect(() => { if (cart.owner !== owner) setCart({ owner, lines: read(owner) }); }, [owner, cart.owner]);
  useEffect(() => {
    if (cart.owner !== owner) return;
    try { localStorage.setItem(keyFor(owner), JSON.stringify(lines)); } catch { /* Cart remains usable without local storage. */ }
  }, [lines, owner, cart.owner]);
  const { syncStatus, reloadSavedCart } = useSavedCart(owner, token, initialising, lines, setLines);
  useEffect(() => {
    if (owner && syncStatus === 'synced') { try { localStorage.removeItem(CART_STORAGE_KEY); } catch { /* Storage can be unavailable. */ } }
  }, [owner, syncStatus]);

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
    return { syncStatus, reloadSavedCart, currency: lines[0]?.currency ?? 'BDT', mixedCurrencies: currencies.size > 1, lines, total: Math.round(total * 100) / 100, itemCount, add, setQuantity, remove, clear, reconcile };
  }, [lines, add, setQuantity, remove, clear, reconcile, syncStatus, reloadSavedCart]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used inside <CartProvider>');
  return context;
}
