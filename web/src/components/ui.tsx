import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react';
import { ApiError, describeError } from '../api/client';
import type { OrderStatus, Product } from '../api/types';
import { orderStatusMeta, stockLevel, type StockLevel } from '../lib/helpers';

// ------------------------------------------------------------------ live region

/**
 * Polite live region for results ("20 of 42 products", "Order #12 placed"). It is rendered
 * visibly rather than screen-reader-only so sighted users get the same confirmation.
 */
export function LiveRegion({ message, className = 'muted' }: { message: string; className?: string }) {
  return (
    <p className={className} role="status" aria-live="polite" data-testid="live-region">
      {message}
    </p>
  );
}

// ------------------------------------------------------------------ badges

export function StatusBadge({ status }: { status: OrderStatus }) {
  const meta = orderStatusMeta[status];

  return (
    <span className={`badge badge--${meta.tone}`} title={meta.description} data-testid={`status-${status}`}>
      <span className="badge__glyph" aria-hidden="true">
        {meta.glyph}
      </span>
      {meta.label}
    </span>
  );
}

export function StockBadge({ product, threshold }: { product: Product; threshold: number }) {
  const meta = stockLevel(product, threshold);

  return (
    <span className={`badge badge--${meta.tone}`} data-testid={`stock-${meta.level}`} data-level={meta.level}>
      <span className="badge__glyph" aria-hidden="true">
        {meta.glyph}
      </span>
      {meta.label}
    </span>
  );
}

export function toneForStock(level: StockLevel) {
  return level;
}

// ------------------------------------------------------------------ stepper

export interface QuantityStepperProps {
  value: number;
  onChange: (next: number) => void;
  max: number;
  min?: number;
  label: string;
  disabled?: boolean;
}

/** Keyboard operable stepper. The maximum is enforced by disabling "+" at the cap. */
export function QuantityStepper({ value, onChange, max, min = 1, label, disabled = false }: QuantityStepperProps) {
  const effectiveMax = Math.max(min, Math.min(max, 1000));
  const atMax = value >= effectiveMax;

  return (
    <div className="stepper" role="group" aria-label={`Quantity for ${label}`}>
      <button
        type="button"
        className="btn btn--sm"
        aria-label={`Decrease quantity for ${label}`}
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={disabled || value <= min}
      >
        −
      </button>
      <span className="stepper__value" aria-live="polite" data-testid="stepper-value">
        {value}
      </span>
      <button
        type="button"
        className="btn btn--sm"
        aria-label={`Increase quantity for ${label}`}
        onClick={() => onChange(Math.min(effectiveMax, value + 1))}
        disabled={disabled || atMax}
      >
        +
      </button>
    </div>
  );
}

// ------------------------------------------------------------------ states

export function Skeleton({ variant = 'line', count = 1 }: { variant?: 'line' | 'card' | 'tile'; count?: number }) {
  const className = variant === 'card' ? 'skeleton skeleton--card' : variant === 'tile' ? 'skeleton skeleton--tile' : 'skeleton skeleton--line';

  return (
    <div aria-hidden="true" data-testid={`skeleton-${variant}`}>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className={className} />
      ))}
    </div>
  );
}

export function LoadingBlock({ label, variant = 'line', count = 3 }: { label: string; variant?: 'line' | 'card' | 'tile'; count?: number }) {
  return (
    <div className="stack" role="status" aria-busy="true">
      <span className="visually-hidden">{label}</span>
      <Skeleton variant={variant} count={count} />
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="state" data-testid="empty-state">
      <h2 className="state__title">{title}</h2>
      {description ? <p className="muted">{description}</p> : null}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = describeError(error);
  const correlationId = error instanceof ApiError ? error.correlationId : undefined;

  return (
    <div className="state state--error" role="alert" data-testid="error-state">
      <p className="state__title">{error instanceof ApiError && error.isNetwork ? 'Cannot reach the server' : 'Something went wrong'}</p>
      <p>{message}</p>
      {correlationId ? <p className="mono muted">Reference: {correlationId}</p> : null}
      {onRetry ? (
        <button type="button" className="btn" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------ pager

export interface PagerProps {
  page: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

export function Pager({ page, totalPages, totalCount, pageSize, onPageChange }: PagerProps) {
  const first = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, totalCount);

  return (
    <div className="pager">
      <span>
        Showing {first}–{last} of {totalCount}
      </span>
      <div className="row">
        <button type="button" className="btn btn--sm" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
          Previous
        </button>
        <span>
          Page {totalPages === 0 ? 0 : page} of {totalPages === 0 ? 0 : totalPages}
        </span>
        <button type="button" className="btn btn--sm" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}>
          Next
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ modal

export interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export function Modal({ open, title, onClose, children }: ModalProps) {
  const titleId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    document.documentElement.setAttribute('data-overlay-open', 'true');

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current();
      if (event.key === 'Tab') {
        const nodes = Array.from(containerRef.current?.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex="0"]') ?? []).filter(el => !el.hasAttribute('disabled') && el.getClientRects().length > 0);
        const first = nodes[0]; const last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };

    const previousFocus = document.activeElement as HTMLElement | null;
    document.addEventListener('keydown', onKeyDown);
    containerRef.current?.querySelector<HTMLElement>('input, button, select, textarea, [tabindex]')?.focus();

    return () => { document.removeEventListener('keydown', onKeyDown); previousFocus?.focus(); document.documentElement.removeAttribute('data-overlay-open'); };
  }, [open]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={containerRef}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="row-between">
          <h3 id={titleId}>{title}</h3>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onClose} aria-label="Close dialog">
            ✕
          </button>
        </div>
        <div className="stack" style={{ marginTop: 'var(--space-4)' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ toasts

export interface Toast {
  id: number;
  tone: 'info' | 'success' | 'error';
  message: string;
  duration: number;
  /** Optional undo action (e.g. cart line removed, notification deleted). */
  undo?: () => void;
}

export interface PushOptions {
  undo?: () => void;
  /** Milliseconds before auto-dismiss; default 4500. Errors persist slightly longer. */
  duration?: number;
}

interface ToastContextValue {
  push: (tone: Toast['tone'], message: string, options?: PushOptions) => void;
  pushError: (error: unknown) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const MAX_TOASTS = 3;

function ToastItem({ toast, duration, onDismiss }: { toast: Toast; duration: number; onDismiss: (id: number) => void }) {
  const [paused, setPaused] = useState(false);
  const remaining = useRef(duration);
  const startedAt = useRef(Date.now());
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (paused) {
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = null;
      return;
    }
    startedAt.current = Date.now();
    timer.current = window.setTimeout(() => onDismiss(toast.id), remaining.current);
    return () => { if (timer.current) window.clearTimeout(timer.current); };
  }, [paused, toast.id, onDismiss]);

  const pause = () => {
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = null;
      remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt.current));
    }
    setPaused(true);
  };
  const resume = () => setPaused(false);

  return (
    <div className={`toast toast--${toast.tone}`} role={toast.tone === 'error' ? 'alert' : 'status'}
      onMouseEnter={pause} onMouseLeave={resume} onFocus={pause} onBlur={resume}>
      <span aria-hidden="true">{toast.tone === 'error' ? '⚠' : toast.tone === 'success' ? '✓' : 'ℹ'}</span>
      <span>{toast.message}</span>
      {toast.undo ? (
        <button type="button" className="btn btn--sm btn--ghost" onClick={() => { toast.undo?.(); onDismiss(toast.id); }}>
          Undo
        </button>
      ) : null}
      <button type="button" className="btn btn--sm btn--ghost" aria-label="Dismiss notification" onClick={() => onDismiss(toast.id)}>
        ✕
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback((tone: Toast['tone'], message: string, options?: PushOptions) => {
    const id = nextId.current++;
    const duration = options?.duration ?? (tone === 'error' ? 5000 : 4500);
    setToasts((current) => [...current.slice(-(MAX_TOASTS - 1)), { id, tone, message, duration, undo: options?.undo }]);
  }, []);

  const pushError = useCallback((error: unknown) => push('error', describeError(error)), [push]);

  const value = useMemo<ToastContextValue>(() => ({ push, pushError, dismiss }), [push, pushError, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts" data-testid="toasts">
        <div aria-live="polite" aria-atomic="false" className="toasts__polite">
          {toasts.filter((toast) => toast.tone !== 'error').map((toast) => (
            <ToastItem key={toast.id} toast={toast} duration={toast.duration} onDismiss={dismiss} />
          ))}
        </div>
        <div aria-live="assertive" aria-atomic="true" className="toasts__assertive">
          {toasts.filter((toast) => toast.tone === 'error').map((toast) => (
            <ToastItem key={toast.id} toast={toast} duration={toast.duration} onDismiss={dismiss} />
          ))}
        </div>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>');
  return context;
}
