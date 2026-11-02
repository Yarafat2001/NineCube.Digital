import { t, useLanguage } from '../i18n/language';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { Product } from '../api/types';
import { useAuth } from '../state/AuthContext';
import { useToast } from './ui';
import { Icon } from './Icon';

export interface StockAlertModalProps {
  product: Product;
  onClose: () => void;
  onSubscribed: () => void;
}

export function isStockAlertSubscribed(productId: number): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = localStorage.getItem('ninecube:stock_alerts');
    const ids: number[] = raw ? JSON.parse(raw) : [];
    return ids.includes(productId);
  } catch {
    return false;
  }
}

export function addStockAlert(productId: number): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem('ninecube:stock_alerts');
    const ids: number[] = raw ? JSON.parse(raw) : [];
    if (!ids.includes(productId)) {
      localStorage.setItem('ninecube:stock_alerts', JSON.stringify([...ids, productId]));
    }
  } catch {
    // Ignore
  }
}

export function StockAlertModal({ product, onClose, onSubscribed }: StockAlertModalProps) {
  useLanguage();
  const { user } = useAuth();
  const toast = useToast();
  const [email, setEmail] = useState(user?.email ?? '');
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setTimeout(() => {
      addStockAlert(product.id);
      toast.push('success', `${t("We'll email you at")} ${email} ${t("when this item restocks!")}`);
      onSubscribed();
      onClose();
    }, 400);
  };

  return createPortal(
    <div className="sheet-backdrop" onClick={onClose} role="presentation">
      <div
        className="stock-alert-modal card-glass"
        role="dialog"
        aria-modal="true"
        aria-label={t("Restock notification")}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="stock-alert-modal__header">
          <div className="stock-alert-modal__title-row">
            <span className="stock-alert-modal__glyph" aria-hidden="true">🔔</span>
            <h3 className="stock-alert-modal__title">{t("Notify Me When Available")}</h3>
          </div>
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            onClick={onClose}
            aria-label={t("Close dialog")}
          >
            <Icon name="x" width={16} height={16} />
          </button>
        </div>

        <p className="stock-alert-modal__desc">
          <strong>{product.name}</strong> {t("is currently out of stock. Leave your email and we'll notify you the moment fresh inventory arrives.")}
        </p>

        <form onSubmit={handleSubmit} className="stack" style={{ gap: '12px' }}>
          <div className="field">
            <label htmlFor="stock-alert-email" className="field__label">
              {t("Email address")}
            </label>
            <input
              id="stock-alert-email"
              type="email"
              required
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("you@example.com")}
            />
          </div>

          <div className="row" style={{ justifyContent: 'flex-end', gap: '8px' }}>
            <button type="button" className="btn btn--sm btn--ghost" onClick={onClose}>
              {t("Cancel")}
            </button>
            <button type="submit" className="btn btn--sm btn--primary" disabled={loading}>
              {loading ? t("Saving…") : t("Notify Me")}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
