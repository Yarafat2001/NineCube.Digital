import { useEffect, type ReactNode } from 'react';
import { t } from '../../i18n/language';
import { Icon } from '../Icon';

export interface TimelineStep {
  id: string;
  label: string;
  timestamp?: string;
}

export interface DrawerLineItem {
  id: string;
  title: string;
  quantity: number;
  price: number;
  variant?: string;
  image?: string;
}

export interface SlideOverDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  badge?: {
    text: string;
    variant?: 'pending' | 'active' | 'success' | 'danger';
  };
  steps?: TimelineStep[];
  currentStepIndex?: number;
  customer?: {
    name: string;
    email: string;
    phone?: string;
    city?: string;
  };
  items?: DrawerLineItem[];
  totals?: {
    subtotal: number;
    discount?: number;
    shipping?: number;
    tax?: number;
    total: number;
  };
  actions?: ReactNode;
  children?: ReactNode;
}

const DEFAULT_STEPS: TimelineStep[] = [
  { id: 'placed', label: 'Placed' },
  { id: 'paid', label: 'Paid' },
  { id: 'packed', label: 'Packed' },
  { id: 'shipped', label: 'Shipped' },
  { id: 'delivered', label: 'Delivered' }
];

export function SlideOverDrawer({
  isOpen,
  onClose,
  title,
  subtitle,
  badge,
  steps = DEFAULT_STEPS,
  currentStepIndex = 1,
  customer,
  items,
  totals,
  actions,
  children
}: SlideOverDrawerProps) {
  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const badgeClass = {
    pending: 'b w',
    active: 'b a',
    success: 'b o',
    danger: 'b bad'
  }[badge?.variant || 'active'];

  const customerInitials = customer?.name
    ? customer.name
        .split(' ')
        .map((w) => w[0]?.toUpperCase())
        .join('')
        .slice(0, 2)
    : 'CU';

  return (
    <>
      {/* Blurred Backdrop */}
      <div
        className="ov"
        onClick={onClose}
        aria-label={t('Close drawer')}
        role="button"
        tabIndex={0}
      />

      {/* Slide-over Drawer Panel */}
      <aside
        className="dr glass2 on"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {/* Drawer Header */}
        <div className="dr-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              {badge && <span className={badgeClass}>{badge.text}</span>}
              {subtitle && <small style={{ color: 'var(--dim)', fontSize: '12px' }}>{subtitle}</small>}
            </div>
            <h3>{title}</h3>
          </div>
          <button
            type="button"
            className="rb glass"
            onClick={onClose}
            aria-label={t('Close')}
            style={{ width: '36px', height: '36px' }}
          >
            <Icon name="x" width={16} height={16} />
          </button>
        </div>

        {/* Fulfillment Stepper */}
        {steps && steps.length > 0 && (
          <div className="tl" aria-label={t('Order timeline')}>
            {steps.map((st, idx) => {
              const isDone = idx < currentStepIndex;
              const isCurrent = idx === currentStepIndex;
              return (
                <div
                  key={st.id}
                  className={`step ${isDone ? 'd' : ''} ${isCurrent ? 'curr' : ''}`}
                >
                  <span>{t(st.label)}</span>
                  {st.timestamp ? (
                    <small style={{ display: 'block', fontSize: '9.5px', color: 'var(--dim)' }}>
                      {st.timestamp}
                    </small>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}

        {/* Customer Card */}
        {customer && (
          <div
            className="glass"
            style={{
              padding: '14px',
              borderRadius: '16px',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}
          >
            <div className="av on" style={{ width: '38px', height: '38px', fontSize: '13px' }}>
              {customerInitials}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <b style={{ fontSize: '13.5px', color: 'var(--ink)' }}>{customer.name}</b>
              <small style={{ display: 'block', color: 'var(--dim)', fontSize: '12px' }}>
                {customer.email} {customer.phone ? `· ${customer.phone}` : ''}
              </small>
              {customer.city ? (
                <small style={{ display: 'block', color: 'var(--dim)', fontSize: '11px', marginTop: '2px' }}>
                  {customer.city}
                </small>
              ) : null}
            </div>
          </div>
        )}

        {/* Order Line Items */}
        {items && items.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <div className="mh" style={{ paddingLeft: '0', marginBottom: '6px' }}>
              {t('ORDER ITEMS')}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {items.map((it) => (
                <div
                  key={it.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '10px 12px',
                    borderRadius: '14px',
                    background: 'var(--glass)',
                    border: '1px solid var(--bd)'
                  }}
                >
                  {it.image ? (
                    <img
                      src={it.image}
                      alt={it.title}
                      style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '10px',
                        objectFit: 'cover'
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '10px',
                        background: 'var(--bd)',
                        display: 'grid',
                        placeItems: 'center',
                        color: 'var(--dim)'
                      }}
                    >
                      <Icon name="box" width={18} height={18} />
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b style={{ fontSize: '13px', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {it.title}
                    </b>
                    <small style={{ color: 'var(--dim)' }}>
                      {t('Qty')}: {it.quantity} {it.variant ? `· ${it.variant}` : ''}
                    </small>
                  </div>
                  <div style={{ textAlign: 'right', fontWeight: 600, fontSize: '13.5px', fontVariantNumeric: 'tabular-nums' }}>
                    ${(it.price * it.quantity).toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Totals Breakdown */}
        {totals && (
          <div
            className="glass"
            style={{
              padding: '14px',
              borderRadius: '16px',
              marginBottom: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              fontSize: '13px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--dim)' }}>
              <span>{t('Subtotal')}</span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>${totals.subtotal.toFixed(2)}</span>
            </div>
            {totals.discount ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--ok)' }}>
                <span>{t('Discount')}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>-${totals.discount.toFixed(2)}</span>
              </div>
            ) : null}
            {totals.shipping !== undefined ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--dim)' }}>
                <span>{t('Shipping')}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>${totals.shipping.toFixed(2)}</span>
              </div>
            ) : null}
            {totals.tax !== undefined ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--dim)' }}>
                <span>{t('Tax')}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>${totals.tax.toFixed(2)}</span>
              </div>
            ) : null}
            <hr style={{ border: 0, borderTop: '1px solid var(--bd)', margin: '4px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, fontSize: '15px', color: 'var(--ink)' }}>
              <span>{t('Total')}</span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>${totals.total.toFixed(2)}</span>
            </div>
          </div>
        )}

        {/* Custom Body Children */}
        {children}

        {/* Actions Footer */}
        {actions && (
          <div
            style={{
              marginTop: 'auto',
              paddingTop: '14px',
              borderTop: '1px solid var(--bd)',
              display: 'flex',
              gap: '10px',
              justifyContent: 'flex-end',
              flexWrap: 'wrap'
            }}
          >
            {actions}
          </div>
        )}
      </aside>
    </>
  );
}
