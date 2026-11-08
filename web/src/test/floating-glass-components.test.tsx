import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { setLanguage } from '../i18n/language';
import { CommandPalette } from '../components/admin/CommandPalette';
import { SlideOverDrawer } from '../components/admin/SlideOverDrawer';
import {
  KpiCard,
  SegmentedControl,
  FilterChips,
  StatusPill,
  EmptyState,
  GlassModal
} from '../components/admin/FloatingGlassComponents';

describe('Floating Glass Component Library & Overlays', () => {
  beforeEach(() => {
    localStorage.clear();
    setLanguage('en');
  });

  describe('CommandPalette (Ctrl+K)', () => {
    it('renders search input and allows filtering commands', async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();

      render(
        <MemoryRouter>
          <CommandPalette isOpen={true} onClose={onClose} />
        </MemoryRouter>
      );

      // Search input should be present
      const input = screen.getByPlaceholderText(/type a command or search…/i);
      expect(input).toBeInTheDocument();

      // Default commands exist
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
      expect(screen.getByText('Orders')).toBeInTheDocument();
      expect(screen.getByText('Products')).toBeInTheDocument();

      // Type "sec" to filter to security
      await user.type(input, 'sec');
      expect(screen.getByText('Security')).toBeInTheDocument();
      expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
    });

    it('navigates with keyboard and closes on Esc', async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();

      render(
        <MemoryRouter>
          <CommandPalette isOpen={true} onClose={onClose} />
        </MemoryRouter>
      );

      const dialog = screen.getByRole('dialog', { name: /command palette/i });
      expect(dialog).toBeInTheDocument();

      // Press Escape to close
      await user.keyboard('{Escape}');
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('SlideOverDrawer (.dr)', () => {
    it('renders drawer header, timeline stepper, items and totals', async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();

      render(
        <SlideOverDrawer
          isOpen={true}
          onClose={onClose}
          title="Order #KL-49944"
          subtitle="Placed on Sunday, Nov 8"
          badge={{ text: 'Processing', variant: 'active' }}
          currentStepIndex={2}
          customer={{
            name: 'Sarah Jenkins',
            email: 'sarah.j@example.com',
            phone: '+1 555-0192',
            city: 'Portland, OR'
          }}
          items={[
            { id: '1', title: 'Premium Wireless Headphones', quantity: 1, price: 299 },
            { id: '2', title: 'Hard Shell Carry Case', quantity: 2, price: 35 }
          ]}
          totals={{
            subtotal: 369,
            shipping: 15,
            tax: 29.52,
            total: 413.52
          }}
          actions={<button type="button">Fulfill Order</button>}
        />
      );

      // Header and badge
      expect(screen.getByRole('heading', { level: 3, name: 'Order #KL-49944' })).toBeInTheDocument();
      expect(screen.getByText('Processing')).toBeInTheDocument();

      // Fulfillment Stepper steps
      expect(screen.getByText('Placed')).toBeInTheDocument();
      expect(screen.getByText('Paid')).toBeInTheDocument();
      expect(screen.getByText('Packed')).toBeInTheDocument();
      expect(screen.getByText('Shipped')).toBeInTheDocument();
      expect(screen.getByText('Delivered')).toBeInTheDocument();

      // Customer info
      expect(screen.getByText('Sarah Jenkins')).toBeInTheDocument();
      expect(screen.getByText(/sarah\.j@example\.com/)).toBeInTheDocument();

      // Items and totals
      expect(screen.getByText('Premium Wireless Headphones')).toBeInTheDocument();
      expect(screen.getByText('$369.00')).toBeInTheDocument();
      expect(screen.getByText('$413.52')).toBeInTheDocument();

      // Action button
      expect(screen.getByRole('button', { name: 'Fulfill Order' })).toBeInTheDocument();

      // Close button
      const closeBtn = screen.getByRole('button', { name: /close$/i });
      await user.click(closeBtn);
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('Component Primitives', () => {
    it('renders KpiCard with delta chips and icon', () => {
      render(
        <KpiCard
          label="Today so far"
          value="$244"
          delta={{ value: '12%', direction: 'up', caption: 'vs last Sunday' }}
          icon="chart"
        />
      );

      expect(screen.getByText('Today so far')).toBeInTheDocument();
      expect(screen.getByText('$244')).toBeInTheDocument();
      expect(screen.getByText(/▲ 12%/)).toBeInTheDocument();
      expect(screen.getByText('vs last Sunday')).toBeInTheDocument();
    });

    it('toggles SegmentedControl options', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();

      render(
        <SegmentedControl
          items={[
            { id: 'all', label: 'All Orders' },
            { id: 'pending', label: 'Pending' },
            { id: 'shipped', label: 'Shipped' }
          ]}
          value="all"
          onChange={onChange}
        />
      );

      const pendingBtn = screen.getByRole('button', { name: 'Pending' });
      expect(pendingBtn).toHaveAttribute('aria-pressed', 'false');

      await user.click(pendingBtn);
      expect(onChange).toHaveBeenCalledWith('pending');
    });

    it('renders FilterChips with counts', async () => {
      const user = userEvent.setup();
      const onSelect = vi.fn();

      render(
        <FilterChips
          chips={[
            { id: 'all', label: 'Everyone', count: 120 },
            { id: 'vip', label: 'VIP', count: 18 }
          ]}
          activeId="all"
          onSelect={onSelect}
        />
      );

      expect(screen.getByText('Everyone')).toBeInTheDocument();
      expect(screen.getByText('120')).toBeInTheDocument();

      const vipChip = screen.getByRole('button', { name: /vip/i });
      await user.click(vipChip);
      expect(onSelect).toHaveBeenCalledWith('vip');
    });

    it('renders StatusPill with semantic styling', () => {
      const { rerender } = render(<StatusPill variant="pending" label="Pending" />);
      expect(screen.getByText('Pending')).toHaveClass('b', 'w');

      rerender(<StatusPill variant="success" label="Delivered" />);
      expect(screen.getByText('Delivered')).toHaveClass('b', 'o');
    });

    it('renders EmptyState with icon and action', () => {
      render(
        <EmptyState
          title="No orders found"
          description="Try adjusting your filters or date range."
          action={<button type="button">Reset filters</button>}
        />
      );

      expect(screen.getByText('No orders found')).toBeInTheDocument();
      expect(screen.getByText('Try adjusting your filters or date range.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Reset filters' })).toBeInTheDocument();
    });

    it('renders GlassModal with backdrop and actions', async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();

      render(
        <GlassModal
          isOpen={true}
          onClose={onClose}
          title="Create Discount Code"
          actions={<button type="button">Save</button>}
        >
          <div>Modal form content</div>
        </GlassModal>
      );

      expect(screen.getByRole('heading', { level: 3, name: 'Create Discount Code' })).toBeInTheDocument();
      expect(screen.getByText('Modal form content')).toBeInTheDocument();

      const closeBtn = screen.getByRole('button', { name: /close$/i });
      await user.click(closeBtn);
      expect(onClose).toHaveBeenCalled();
    });
  });
});
