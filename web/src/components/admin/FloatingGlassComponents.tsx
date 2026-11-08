import { type ReactNode } from 'react';
import { t } from '../../i18n/language';
import { Icon, type IconName } from '../Icon';

/**
 * KPI Stat Card Primitive
 */
export interface KpiCardProps {
  label: string;
  value: string | number;
  delta?: {
    value: string | number;
    direction: 'up' | 'down';
    caption?: string;
  };
  icon?: IconName;
}

export function KpiCard({ label, value, delta, icon }: KpiCardProps) {
  return (
    <div className="kpi-card glass2">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="l">{label}</div>
        {icon && (
          <span style={{ color: 'var(--dim)' }}>
            <Icon name={icon} width={16} height={16} />
          </span>
        )}
      </div>
      <div className="big">{value}</div>
      {delta && (
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span className={`delta ${delta.direction}`}>
            {delta.direction === 'up' ? '▲' : '▼'} {delta.value}
          </span>
          {delta.caption ? <span className="sub">{delta.caption}</span> : null}
        </div>
      )}
    </div>
  );
}

/**
 * Segmented Control Primitive
 */
export interface SegmentItem<T extends string = string> {
  id: T;
  label: string;
}

export interface SegmentedControlProps<T extends string = string> {
  items: SegmentItem<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
}

export function SegmentedControl<T extends string = string>({
  items,
  value,
  onChange,
  ariaLabel
}: SegmentedControlProps<T>) {
  return (
    <div className="seg" role="group" aria-label={ariaLabel || t('Segment selection')}>
      {items.map((item) => {
        const isSelected = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onChange(item.id)}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Filter Chips Group Primitive
 */
export interface FilterChipItem<T extends string = string> {
  id: T;
  label: string;
  count?: number;
}

export interface FilterChipsProps<T extends string = string> {
  chips: FilterChipItem<T>[];
  activeId: T;
  onSelect: (id: T) => void;
}

export function FilterChips<T extends string = string>({
  chips,
  activeId,
  onSelect
}: FilterChipsProps<T>) {
  return (
    <div className="chips" role="radiogroup" aria-label={t('Filters')}>
      {chips.map((chip) => {
        const isPressed = chip.id === activeId;
        return (
          <button
            key={chip.id}
            type="button"
            className="chip"
            aria-pressed={isPressed}
            onClick={() => onSelect(chip.id)}
          >
            <span>{chip.label}</span>
            {chip.count !== undefined && <span className="cnt">{chip.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Status Pill Primitive
 */
export interface StatusPillProps {
  variant: 'pending' | 'active' | 'success' | 'danger';
  label: string;
}

export function StatusPill({ variant, label }: StatusPillProps) {
  const cls = {
    pending: 'b w',
    active: 'b a',
    success: 'b o',
    danger: 'b bad'
  }[variant];

  return <span className={cls}>{label}</span>;
}

/**
 * Empty State Primitive
 */
export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: IconName;
  action?: ReactNode;
}

export function EmptyState({ title, description, icon = 'box', action }: EmptyStateProps) {
  return (
    <div className="es">
      <div
        style={{
          width: '52px',
          height: '52px',
          borderRadius: '16px',
          background: 'var(--glass2)',
          border: '1px solid var(--bd)',
          display: 'grid',
          placeItems: 'center',
          color: 'var(--dim)',
          marginBottom: '4px'
        }}
      >
        <Icon name={icon} width={26} height={26} />
      </div>
      <b style={{ color: 'var(--ink)', fontSize: '15px' }}>{title}</b>
      {description ? <p style={{ margin: 0, maxWidth: '340px' }}>{description}</p> : null}
      {action ? <div style={{ marginTop: '8px' }}>{action}</div> : null}
    </div>
  );
}

/**
 * Glass Modal Primitive with blurred backdrop
 */
export interface GlassModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  maxWidth?: string;
}

export function GlassModal({
  isOpen,
  onClose,
  title,
  children,
  actions,
  maxWidth = '520px'
}: GlassModalProps) {
  if (!isOpen) return null;

  return (
    <>
      <div
        className="ov"
        onClick={onClose}
        aria-label={t('Close modal')}
        role="button"
        tabIndex={0}
      />
      <div
        className="glass-modal glass2"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          position: 'fixed',
          zIndex: 95,
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: `min(${maxWidth}, calc(100% - 32px))`,
          maxHeight: '85vh',
          borderRadius: '24px',
          padding: '24px',
          border: '1px solid var(--bd)',
          backdropFilter: 'blur(28px)',
          WebkitBackdropFilter: 'blur(28px)',
          boxShadow: '0 24px 60px var(--shadow)',
          overflowY: 'auto'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
          <h3 style={{ margin: 0, fontSize: '19px', fontWeight: 600, color: 'var(--ink)' }}>{title}</h3>
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
        <div>{children}</div>
        {actions && (
          <div
            style={{
              marginTop: '20px',
              paddingTop: '16px',
              borderTop: '1px solid var(--bd)',
              display: 'flex',
              gap: '10px',
              justifyContent: 'flex-end'
            }}
          >
            {actions}
          </div>
        )}
      </div>
    </>
  );
}
