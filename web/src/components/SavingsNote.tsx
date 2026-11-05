import { t, useLanguage } from '../i18n/language';
import { formatMoneyWhole } from '../lib/helpers';
import { Icon } from './Icon';

/** What the list price gives up on this product right now. Zero when there is no comparison price.
 *  Deliberately blind to stock, because the struck price and the -% chip next to it are too. */
export function productSavings(product: { price: number; compareAtPrice?: number | null }): number {
  if (!product.compareAtPrice || product.compareAtPrice <= product.price) return 0;
  return product.compareAtPrice - product.price;
}

export interface SavingsNoteProps {
  /** Amount already worked out by the caller from server prices or the server quote - never guessed here. */
  amount: number;
  /** Omitted when the API gives no code for this product; formatMoneyWhole owns the store default. */
  currency?: string;
  className?: string;
}

export function SavingsNote({ amount, currency, className = '' }: SavingsNoteProps) {
  useLanguage();
  if (!(amount > 0)) return null;
  const money = t(formatMoneyWhole(amount, currency));

  return (
    <span className={`savings-note badge badge--ok ${className}`.trim()} data-testid="savings-note">
      <span className="savings-note__icon" aria-hidden="true"><Icon name="tag" width={12} height={12} /></span>
      {/* The separator lives inside the label: a bare JSX space between two elements never reaches
          the DOM, and the accessible name came out as "You saveBDT 7,000". */}
      <span className="savings-note__label">{`${t('You save')} `}</span>
      <strong className="savings-note__amount">{money}</strong>
    </span>
  );
}
