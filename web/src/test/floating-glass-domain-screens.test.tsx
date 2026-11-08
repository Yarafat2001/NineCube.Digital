import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { API, order, staffUser, adminUser } from './handlers';
import { server } from './server';
import { renderApp, seedSession } from './utils';

describe('Floating Glass Domain Screens Integration', () => {
  beforeEach(() => {
    localStorage.clear();
    seedSession('Staff');
    server.use(
      http.get(`${API}/api/auth/me`, () => HttpResponse.json(staffUser)),
      http.get(`${API}/api/orders`, () =>
        HttpResponse.json({
          items: [
            { ...order, id: 601, status: 'Pending', totalAmount: 450, customerName: 'Rahim Ahmed' },
            { ...order, id: 602, status: 'Confirmed', totalAmount: 820, customerName: 'Karim Ullah' }
          ],
          page: 1,
          pageSize: 10,
          totalCount: 2,
          totalPages: 1,
          hasNext: false,
          hasPrevious: false
        })
      )
    );
  });

  it('renders StaffPage inside FloatingGlassAdminShell with KPI cards and SlideOverDrawer', async () => {
    const user = userEvent.setup();
    renderApp('/staff');

    // Page title and floating shell brand
    expect(await screen.findByRole('heading', { level: 1, name: 'Order console' })).toBeInTheDocument();
    expect(screen.getByText('NineCube.Digital')).toBeInTheDocument();

    // Floating Glass KPI cards
    expect(screen.getByText('Total orders')).toBeInTheDocument();
    expect(screen.getByText('Ready to ship')).toBeInTheDocument();

    // Inspect button should be visible in order actions
    const inspectButtons = await screen.findAllByRole('button', { name: 'Inspect' });
    expect(inspectButtons.length).toBeGreaterThan(0);

    // Clicking Inspect opens the SlideOverDrawer
    await user.click(inspectButtons[0]!);

    const drawer = await screen.findByRole('dialog', { name: /order #601/i });
    expect(drawer).toBeInTheDocument();
    expect(within(drawer).getByText('Rahim Ahmed')).toBeInTheDocument();

    // Fulfillment Stepper is visible inside drawer
    expect(within(drawer).getByText('Placed')).toBeInTheDocument();
    expect(within(drawer).getByText('Delivered')).toBeInTheDocument();
  });

  it('renders SalesSummaryPage inside FloatingGlassAdminShell', async () => {
    server.use(
      http.get(`${API}/api/reports/sales`, () =>
        HttpResponse.json({
          from: '2026-11-01',
          to: '2026-11-08',
          currency: 'BDT',
          totalOrders: 14,
          grossSales: 15400,
          discounts: 500,
          netSales: 14900,
          shippingCollected: 1200,
          taxes: 0,
          refunds: 0,
          netCollected: 16100,
          giftCardRedemptions: 0,
          giftCreditRestored: 0,
          byStatus: []
        })
      )
    );

    renderApp('/staff/sales');

    expect(await screen.findByRole('heading', { level: 1, name: 'Sales summary' })).toBeInTheDocument();
    expect(screen.getByText('NineCube.Digital')).toBeInTheDocument();
    expect(screen.getByText('From')).toBeInTheDocument();
  });

  it('renders AdminPage inside FloatingGlassAdminShell with tabs', async () => {
    seedSession('Administrator');
    server.use(
      http.get(`${API}/api/auth/me`, () => HttpResponse.json(adminUser)),
      http.get(`${API}/api/admin/users`, () =>
        HttpResponse.json({
          items: [
            { id: 1, email: 'admin@ninecube.digital', role: 'Administrator', isActive: true, createdAt: '2026-11-01' }
          ],
          totalCount: 1,
          page: 1,
          pageSize: 20
        })
      )
    );

    renderApp('/admin');

    expect(await screen.findByRole('heading', { level: 1, name: 'Administration' })).toBeInTheDocument();
    expect(screen.getByText('NineCube.Digital')).toBeInTheDocument();

    // Tab navigation is present
    expect(screen.getByRole('tab', { name: 'Users' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Audit log' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Settings' })).toBeInTheDocument();
  });

  it('renders InventoryPage inside FloatingGlassAdminShell', async () => {
    seedSession('InventoryManager');
    server.use(
      http.get(`${API}/api/auth/me`, () => HttpResponse.json({ ...staffUser, role: 'InventoryManager' })),
      http.get(`${API}/api/products`, () =>
        HttpResponse.json({
          items: [
            { id: 101, name: 'Test Product', sku: 'TP-101', price: 99, stock: 15, isActive: true, brand: 'NineCube', categoryId: 1 }
          ],
          totalCount: 1,
          page: 1,
          pageSize: 20
        })
      ),
      http.get(`${API}/api/categories`, () => HttpResponse.json([])),
      http.get(`${API}/api/brands`, () => HttpResponse.json([])),
      http.get(`${API}/api/tags`, () => HttpResponse.json([]))
    );

    renderApp('/inventory');

    expect(await screen.findByRole('heading', { level: 1, name: 'Inventory' })).toBeInTheDocument();
    expect(screen.getByText('NineCube.Digital')).toBeInTheDocument();
  });
});
