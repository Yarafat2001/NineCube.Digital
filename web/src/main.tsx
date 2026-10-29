import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { App } from './App';
import { ApiError } from './api/client';
import { ToastProvider } from './components/ui';
import { AuthProvider } from './state/AuthContext';
import { CartProvider } from './state/CartContext';
import { watchSiteUpdates } from './lib/siteUpdates';
import { startBackgroundRefresh } from './lib/backgroundRefresh';

import './styles/tokens.css';
import './styles/base.css';
import './styles/app.css';
import './components/Navbar.css';
import './styles/modern.css';
import './styles/responsive.css';
import './styles/language.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Fresh enough to feel live, cached enough to avoid a request per keystroke.
      staleTime: 15_000,
      refetchOnWindowFocus: true,
      retry: (failureCount, error) => {
        // Never retry a client error: 400/403/404/409 will not fix themselves.
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
        return failureCount < 2;
      }
    },
    mutations: { retry: 0 }
  }
});

const container = document.getElementById('root');
watchSiteUpdates();
startBackgroundRefresh(queryClient);
if (!container) throw new Error('Root element #root was not found in index.html');

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <AuthProvider>
          <CartProvider>
            <ToastProvider>
              <App />
            </ToastProvider>
          </CartProvider>
        </AuthProvider>
      </HashRouter>
    </QueryClientProvider>
  </StrictMode>
);
