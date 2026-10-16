import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './state/AuthContext';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { RequireAuth, RequireRole } from './components/guards';
import { LoadingBlock } from './components/ui';
import { LoginPage, RegisterPage } from './pages/AuthPages';
import { NotFoundPage } from './pages/NotFoundPage';

// Routes are code-split: the admin console is never downloaded by a customer, and the showcase -
// the only route that pulls in Three.js - is never downloaded by anyone who does not open it.
const ShowcasePage = lazy(() => import('./pages/ShowcasePage').then((module) => ({ default: module.ShowcasePage })));
const ProductsPage = lazy(() => import('./pages/ProductsPage').then((module) => ({ default: module.ProductsPage })));
const ProductDetailPage = lazy(() => import('./pages/ProductDetailPage').then((module) => ({ default: module.ProductDetailPage })));
const MyOrdersPage = lazy(() => import('./pages/OrdersPages').then((module) => ({ default: module.MyOrdersPage })));
const OrderDetailPage = lazy(() => import('./pages/OrdersPages').then((module) => ({ default: module.OrderDetailPage })));
const StaffPage = lazy(() => import('./pages/StaffPage').then((module) => ({ default: module.StaffPage })));
const SalesSummaryPage = lazy(() => import('./pages/StaffPage').then((module) => ({ default: module.SalesSummaryPage })));
const InvoicePage = lazy(() => import('./pages/StaffPage').then((module) => ({ default: module.InvoicePage })));
const InventoryPage = lazy(() => import('./pages/InventoryPage').then((module) => ({ default: module.InventoryPage })));
const AdminPage = lazy(() => import('./pages/AdminPage').then((module) => ({ default: module.AdminPage })));
const AccountDashboardPage = lazy(() => import('./pages/AccountPages').then((module) => ({ default: module.AccountDashboardPage })));
const ProfilePage = lazy(() => import('./pages/AccountPages').then((module) => ({ default: module.ProfilePage })));
const NotificationsPage = lazy(() => import('./pages/AccountPages').then((module) => ({ default: module.NotificationsPage })));

function RouteFallback() {
  return (
    <div className="page container">
      <LoadingBlock label="Loading this section" variant="tile" count={3} />
    </div>
  );
}

function PublicHome() {
  const { user, initialising } = useAuth();
  if (initialising) return <RouteFallback />;
  if (user) return <Navigate to="/products" replace />;
  return <ShowcasePage />;
}

export function App() {
  const { pathname } = useLocation();
  const { user, initialising } = useAuth();

  // The showcase ends on its own dark footer blend, so the shell footer would break that section.
  const isShowcase = pathname === '/' && !user && !initialising;

  return (
    <div className="app-shell">
      <Navbar />

      <main id="main">
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />

            {/* The showcase is the public landing page; the catalogue is one click behind it. */}
            <Route path="/" element={<PublicHome />} />

            <Route
              path="/products"
              element={
                <RequireAuth>
                  <ProductsPage />
                </RequireAuth>
              }
            />

            <Route
              path="/products/:id"
              element={
                <RequireAuth>
                  <ProductDetailPage />
                </RequireAuth>
              }
            />

            <Route
              path="/orders"
              element={
                <RequireRole roles={['Customer']}>
                  <MyOrdersPage />
                </RequireRole>
              }
            />

            <Route
              path="/orders/:id"
              element={
                <RequireRole roles={['Customer', 'Staff', 'Administrator']}>
                  <OrderDetailPage />
                </RequireRole>
              }
            />

            <Route
              path="/orders/:id/invoice"
              element={
                <RequireRole roles={['Customer', 'Staff', 'Administrator']}>
                  <InvoicePage />
                </RequireRole>
              }
            />

            <Route
              path="/account"
              element={
                <RequireAuth>
                  <AccountDashboardPage />
                </RequireAuth>
              }
            />

            <Route
              path="/account/profile"
              element={
                <RequireAuth>
                  <ProfilePage />
                </RequireAuth>
              }
            />

            <Route
              path="/notifications"
              element={
                <RequireAuth>
                  <NotificationsPage />
                </RequireAuth>
              }
            />

            <Route
              path="/staff"
              element={
                <RequireRole roles={['Staff', 'Administrator']}>
                  <StaffPage />
                </RequireRole>
              }
            />

            <Route
              path="/staff/sales"
              element={
                <RequireRole roles={['Staff', 'Administrator']}>
                  <SalesSummaryPage />
                </RequireRole>
              }
            />

            <Route
              path="/inventory"
              element={
                <RequireRole roles={['InventoryManager', 'Administrator']}>
                  <InventoryPage />
                </RequireRole>
              }
            />

            <Route
              path="/admin"
              element={
                <RequireRole roles={['Administrator']}>
                  <AdminPage />
                </RequireRole>
              }
            />

            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </main>

      {isShowcase ? null : <Footer />}
    </div>
  );
}
