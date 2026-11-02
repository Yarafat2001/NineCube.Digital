import { type ReactNode } from 'react';
import { Icon } from './Icon';

/**
 * One numbered step of an admin builder. Frequent operators work the same screen many times a day,
 * so a step they have already filled collapses to a single line that still states its value —
 * the registry below the builder comes into view without scrolling past five open panels.
 *
 * The body stays mounted and is hidden, so collapsing a step never discards a half-finished search
 * or re-runs the impact queries behind it.
 */
export function StepCard({ step, title, flag, summary = '', done, open, onToggle, testId, children }: {
  step: number;
  title: string;
  flag: string;
  /** What the folded row states about the step; omit it when the flag already says it. */
  summary?: string;
  done?: boolean;
  open: boolean;
  onToggle: () => void;
  testId: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`discount-config-card ${open ? 'discount-config-card--open' : 'discount-config-card--closed'}`}
      data-testid={testId}
    >
      <div className="discount-card-header">
        <h4 className="discount-card-title">
          <button type="button" className="discount-card-toggle" aria-expanded={open} onClick={onToggle}>
            <span className={`discount-card-step ${done ? 'discount-card-step--done' : ''}`}>
              {done ? <Icon name="check" width={12} height={12} /> : step}
            </span>
            <span className="discount-card-name">{title}</span>
            {open || !summary ? null : <span className="discount-card-summary">{summary}</span>}
            <Icon className="discount-card-chevron" name="chevron" width={14} height={14} />
          </button>
        </h4>
        <span className="discount-card-flag">{flag}</span>
      </div>
      <div className="discount-card-body" hidden={!open}>{children}</div>
    </div>
  );
}
