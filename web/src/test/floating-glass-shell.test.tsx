import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setLanguage } from '../i18n/language';
import { FloatingGlassAdminShell } from '../components/admin/FloatingGlassAdminShell';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../state/AuthContext';

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider>{ui}</AuthProvider>
    </QueryClientProvider>
  );
}

describe('Floating Glass Admin Shell', () => {
  beforeEach(() => {
    localStorage.clear();
    setLanguage('en');
    document.documentElement.dataset.theme = 'dark';
  });

  it('renders the floating glass brand block and navigation groups', () => {
    renderWithProviders(
      <MemoryRouter initialEntries={['/staff']}>
        <FloatingGlassAdminShell title="Orders Management" subtitle="Manage incoming sales">
          <div data-testid="test-content">Orders Table</div>
        </FloatingGlassAdminShell>
      </MemoryRouter>
    );

    // Brand and logo block
    expect(screen.getByText('NineCube.Digital')).toBeInTheDocument();
    expect(screen.getByText('Digital Operations')).toBeInTheDocument();

    // Page title and subtitle
    expect(screen.getByRole('heading', { level: 1, name: 'Orders Management' })).toBeInTheDocument();
    expect(screen.getByText('Manage incoming sales')).toBeInTheDocument();
    expect(screen.getByTestId('test-content')).toBeInTheDocument();

    // Group labels
    expect(screen.getByText('SHOP')).toBeInTheDocument();
    expect(screen.getByText('MONEY')).toBeInTheDocument();
    expect(screen.getByText('TALK')).toBeInTheDocument();
  });

  it('toggles mini rail mode and persists preference', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <MemoryRouter initialEntries={['/account']}>
        <FloatingGlassAdminShell>
          <div>Dashboard</div>
        </FloatingGlassAdminShell>
      </MemoryRouter>
    );

    const toggleBtn = screen.getByRole('button', { name: /collapse sidebar/i });
    expect(toggleBtn).toBeInTheDocument();

    await user.click(toggleBtn);
    expect(localStorage.getItem('ninecube.sidebar-mini')).toBe('1');

    const expandBtn = screen.getByRole('button', { name: /expand sidebar/i });
    expect(expandBtn).toBeInTheDocument();

    await user.click(expandBtn);
    expect(localStorage.getItem('ninecube.sidebar-mini')).toBe('0');
  });

  it('toggles dark and light mode', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <MemoryRouter initialEntries={['/account']}>
        <FloatingGlassAdminShell>
          <div>Dashboard</div>
        </FloatingGlassAdminShell>
      </MemoryRouter>
    );

    const darkToggle = screen.getByRole('button', { name: /toggle dark mode/i });
    expect(darkToggle).toBeInTheDocument();

    await user.click(darkToggle);
    expect(document.documentElement.dataset.theme).toBe('light');

    await user.click(darkToggle);
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('opens and closes the quick-create menu', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <MemoryRouter initialEntries={['/staff']}>
        <FloatingGlassAdminShell>
          <div>Orders</div>
        </FloatingGlassAdminShell>
      </MemoryRouter>
    );

    const createBtn = screen.getByRole('button', { name: /create/i });
    expect(createBtn).toBeInTheDocument();

    await user.click(createBtn);

    // Quick create options should appear
    expect(screen.getByRole('menu', { name: /create menu/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /order/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /product/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /customer/i })).toBeInTheDocument();

    // Clicking create button again closes it
    await user.click(createBtn);
    expect(screen.queryByRole('menu', { name: /create menu/i })).not.toBeInTheDocument();
  });

  it('toggles mobile navigation drawer', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <MemoryRouter initialEntries={['/staff']}>
        <FloatingGlassAdminShell>
          <div>Orders</div>
        </FloatingGlassAdminShell>
      </MemoryRouter>
    );

    const menuBtn = screen.getByRole('button', { name: /toggle navigation/i });
    expect(menuBtn).toBeInTheDocument();

    await user.click(menuBtn);

    const backdrop = screen.getByRole('button', { name: /close sidebar/i });
    expect(backdrop).toBeInTheDocument();

    await user.click(backdrop);
    expect(screen.queryByRole('button', { name: /close sidebar/i })).not.toBeInTheDocument();
  });

  it('renders in Bengali when language is switched', () => {
    setLanguage('bn');
    renderWithProviders(
      <MemoryRouter initialEntries={['/staff']}>
        <FloatingGlassAdminShell>
          <div>কন্টেন্ট</div>
        </FloatingGlassAdminShell>
      </MemoryRouter>
    );

    // Digital Operations in Bengali
    expect(screen.getByText('ডিজিটাল অপারেশনস')).toBeInTheDocument();
    // Dark mode in Bengali
    expect(screen.getByText('ডার্ক মোড')).toBeInTheDocument();
  });
});
