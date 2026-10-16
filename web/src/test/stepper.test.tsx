import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { QuantityStepper } from '../components/ui';

function Harness({ max, initial = 1 }: { max: number; initial?: number }) {
  const [value, setValue] = useState(initial);
  return <QuantityStepper value={value} onChange={setValue} max={max} label="Milk Frother" />;
}

describe('QuantityStepper', () => {
  it('cannot be increased past the available stock', async () => {
    const user = userEvent.setup();
    render(<Harness max={3} />);

    const increase = screen.getByRole('button', { name: /increase quantity/i });

    await user.click(increase);
    await user.click(increase);

    expect(screen.getByTestId('stepper-value')).toHaveTextContent('3');
    expect(increase).toBeDisabled();

    // Clicking a disabled control must not push the value beyond stock.
    await user.click(increase);
    expect(screen.getByTestId('stepper-value')).toHaveTextContent('3');
  });

  it('cannot go below one', async () => {
    const user = userEvent.setup();
    render(<Harness max={10} />);

    const decrease = screen.getByRole('button', { name: /decrease quantity/i });
    expect(decrease).toBeDisabled();

    await user.click(screen.getByRole('button', { name: /increase quantity/i }));
    expect(screen.getByTestId('stepper-value')).toHaveTextContent('2');
    expect(decrease).toBeEnabled();
  });

  it('is keyboard operable', async () => {
    const user = userEvent.setup();
    render(<Harness max={4} />);

    const decrease = screen.getByRole('button', { name: /decrease quantity/i });
    const increase = screen.getByRole('button', { name: /increase quantity/i });

    // At the minimum the decrease button is disabled, so tab order skips it.
    await user.tab();
    expect(increase).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(screen.getByTestId('stepper-value')).toHaveTextContent('2');

    // Once above the minimum, shift-tab reaches the now-enabled decrease button.
    expect(decrease).toBeEnabled();
    increase.focus();
    await user.tab({ shift: true });
    expect(decrease).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(screen.getByTestId('stepper-value')).toHaveTextContent('1');
  });

  it('exposes the quantity through an aria-live region so changes are announced', () => {
    render(<Harness max={4} />);
    expect(screen.getByTestId('stepper-value')).toHaveAttribute('aria-live', 'polite');
  });
});
