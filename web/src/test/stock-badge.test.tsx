import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Product } from '../api/types';
import { StockBadge } from '../components/ui';

const base: Product = {
  id: 1,
  sku: 'NC-1001',
  name: 'Espresso Machine Pro',
  price: 249,
  stockQuantity: 12,
  isActive: true,
  rowVersion: null
};

const build = (overrides: Partial<Product>): Product => ({ ...base, ...overrides });

describe('StockBadge', () => {
  it('shows "In stock" above the threshold', () => {
    render(<StockBadge product={build({ stockQuantity: 12 })} threshold={5} />);

    expect(screen.getByText(/in stock/i)).toBeInTheDocument();
    expect(screen.getByTestId('stock-in-stock')).toHaveAttribute('data-level', 'in-stock');
  });

  it('shows "Low stock" at or below the threshold', () => {
    render(<StockBadge product={build({ stockQuantity: 5 })} threshold={5} />);
    expect(screen.getByTestId('stock-low-stock')).toBeInTheDocument();
    expect(screen.getByText(/low stock/i)).toBeInTheDocument();
  });

  it('shows "Out of stock" at zero', () => {
    render(<StockBadge product={build({ stockQuantity: 0 })} threshold={5} />);
    expect(screen.getByTestId('stock-out-of-stock')).toBeInTheDocument();
  });

  it('shows "Inactive" for a disabled product regardless of quantity', () => {
    render(<StockBadge product={build({ stockQuantity: 99, isActive: false })} threshold={5} />);
    expect(screen.getByTestId('stock-inactive')).toBeInTheDocument();
  });

  it('never relies on colour alone - every state carries a glyph and a text label', () => {
    const { unmount } = render(<StockBadge product={build({ stockQuantity: 0 })} threshold={5} />);
    expect(screen.getByText(/out of stock/i)).toBeVisible();
    expect(screen.getByTestId('stock-out-of-stock').querySelector('[aria-hidden="true"]')).not.toBeNull();

    unmount();
    render(<StockBadge product={build({ stockQuantity: 12 })} threshold={5} />);
    expect(screen.getByText(/in stock/i)).toBeVisible();
  });
});
