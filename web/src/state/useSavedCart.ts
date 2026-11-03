import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { apiRequest, ApiError } from '../api/client';
import type { CartLine } from './CartContext';

type Saved = { version: number; lines: CartLine[] };
const signature = (lines: CartLine[]) => JSON.stringify(lines.map(l => [l.productId, l.quantity]).sort((a, b) => a[0] - b[0]));

export function useSavedCart(owner: number | null, token: string | null, initialising: boolean, lines: CartLine[], setLines: Dispatch<SetStateAction<CartLine[]>>) {
  const [status, setStatus] = useState<'loading' | 'local' | 'synced' | 'error' | 'conflict'>(owner ? 'loading' : 'local');
  const latest = useRef(lines); latest.current = lines;
  const version = useRef(0); const sent = useRef(''); const saving = useRef(false); const generation = useRef(0);
  const [revision, setRevision] = useState(0);
  const [reload, setReload] = useState(0);
  const reloadSavedCart = useCallback(() => setReload(n => n + 1), []);
  useEffect(() => {
    const current = ++generation.current; let cancelled = false;
    if (!owner || !token) { setStatus('local'); return; }
    if (initialising) return;
    setStatus('loading');
    void (async () => {
      try {
        const options = await apiRequest<{ cartSyncEnabled?: boolean }>('/api/checkout/options');
        if (cancelled) return;
        if (!options.cartSyncEnabled) { setStatus('local'); return; }
        const remote = await apiRequest<Saved>('/api/me/cart', { token });
        if (cancelled || generation.current !== current) return;
        version.current = remote.version;
        const merged = new Map(remote.lines.map(l => [l.productId, l]));
        // Initial sign-in merges guest quantities without duplicating an already saved line.
        if (!reload) for (const line of latest.current) {
          const existing = merged.get(line.productId);
          merged.set(line.productId, existing ? { ...existing, quantity: Math.max(existing.quantity, line.quantity) } : line);
        }
        const next = [...merged.values()].slice(0, 200);
        sent.current = signature(remote.lines); setLines(next); setStatus('synced');
      } catch { if (!cancelled) setStatus('error'); }
    })();
    return () => { cancelled = true; };
  }, [owner, token, initialising, reload, setLines]);
  useEffect(() => {
    if (!owner || !token || status !== 'synced' || signature(lines) === sent.current || saving.current) return;
    const current = generation.current;
    const timer = window.setTimeout(() => {
      if (saving.current) return;
      const snapshot = latest.current;
      saving.current = true;
      void apiRequest<{ version: number }>('/api/me/cart', { method: 'PUT', token,
        body: { items: snapshot.map(l => ({ productId: l.productId, quantity: l.quantity })), version: version.current } })
        .then(result => {
          if (generation.current !== current) return;
          version.current = result.version; sent.current = signature(snapshot);
        }).catch(error => {
          if (generation.current === current) setStatus(error instanceof ApiError && error.isConflict ? 'conflict' : 'error');
        }).finally(() => { saving.current = false; setRevision(n => n + 1); });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [lines, owner, token, status, revision]);
  return { syncStatus: status, reloadSavedCart };
}
