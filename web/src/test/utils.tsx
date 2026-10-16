import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router-dom';
import { App } from '../App';
import type { UserRole, UserSummary } from '../api/types';
import { ToastProvider } from '../components/ui';
import { AuthProvider } from '../state/AuthContext';
import { CartProvider } from '../state/CartContext';
import { adminUser, customerUser, inventoryUser, staffUser } from './handlers';

export const usersByRole: Record<UserRole, UserSummary> = {
  Customer: customerUser,
  Staff: staffUser,
  InventoryManager: inventoryUser,
  Administrator: adminUser
};

export const SESSION_KEY = 'ninecube.auth.session';

/**
 * Writes a session into sessionStorage exactly the way AuthProvider does, so the tests
 * exercise the real restore-and-revalidate path.
 */
export function seedSession(role: UserRole, overrides: Partial<UserSummary> = {}): UserSummary {
  const user = { ...usersByRole[role], ...overrides };

  sessionStorage.setItem(
    SESSION_KEY,
    JSON.stringify({
      accessToken: 'test-token',
      expiresAtUtc: new Date(Date.now() + 3_600_000).toISOString(),
      user
    })
  );

  return user;
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false }
    }
  });
}

export function AppProviders({ children }: { children: ReactElement }) {
  return (
    <QueryClientProvider client={createQueryClient()}>
      <AuthProvider>
        <CartProvider>
          <ToastProvider>{children}</ToastProvider>
        </CartProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

/** Renders the whole application (with routing) at the given path. */
export function renderApp(route = '/'): RenderResult {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[route]}>
        <AuthProvider>
          <CartProvider>
            <ToastProvider>
              <App />
            </ToastProvider>
          </CartProvider>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

/** Renders a single component with the shared providers (no router). */
export function renderWithProviders(ui: ReactElement): RenderResult {
  return render(<AppProviders>{ui}</AppProviders>);
}

/**
 * Same whole-app render, but through a router object the test can drive backwards and forwards,
 * which is how the catalogue's URL-as-state contract is checked.
 */
export function renderAppWithHistory(route: string): { router: ReturnType<typeof createMemoryRouter> } & RenderResult {
  const router = createMemoryRouter(
    [{
      path: '*',
      element: (
        <QueryClientProvider client={createQueryClient()}>
          <AuthProvider>
            <CartProvider>
              <ToastProvider>
                <App />
              </ToastProvider>
            </CartProvider>
          </AuthProvider>
        </QueryClientProvider>
      )
    }],
    { initialEntries: [route] }
  );

  return { router, ...render(<RouterProvider router={router} />) };
}
