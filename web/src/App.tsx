import { t, useLanguage } from './i18n/language';
import { Suspense, lazy } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './state/AuthContext';
import { CampaignBanner } from './components/CampaignBanner';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { MobileNav } from './components/MobileNav';
import { ChatWidget } from './components/ChatWidget';
import { AssistantDock } from './components/home/AssistantDock';
import { RequireAuth, RequireRole } from './components/guards';
import { LoadingBlock } from './components/ui';
import { AuthPage } from './pages/AuthPages';
import { NotFoundPage } from './pages/NotFoundPage';

// Routes are code-split: the admin console is never downloaded by a customer, and the showcase -
// the only route that pulls in Three.js - is never downloaded by anyone who does not open it.
const ShowcasePage = lazy(() => import('./pages/ShowcasePage').then((module) => ({ default: module.ShowcasePage })));
const ProductsPage = lazy(() => import('./pages/ProductsPage').then((module) => ({ default: module.ProductsPage })));
const ProductDetailPage = lazy(() => import('./pages/ProductDetailPage').then((module) => ({ default: module.ProductDetailPage })));
const MyOrdersPage = lazy(() => import('./pages/OrdersPages').then((module) => ({ default: module.MyOrdersPage })));
const WishlistPage = lazy(() => import('./pages/WishlistPage').then((module) => ({ default: module.WishlistPage })));
const OrderDetailRoute = lazy(() => import('./pages/OrdersPages').then((module) => ({ default: module.OrderDetailRoute })));
const StaffPage = lazy(() => import('./pages/StaffPage').then((module) => ({ default: module.StaffPage })));
const SalesSummaryPage = lazy(() => import('./pages/StaffPage').then((module) => ({ default: module.SalesSummaryPage })));
const InvoicePage = lazy(() => import('./pages/StaffPage').then((module) => ({ default: module.InvoicePage })));
const InventoryPage = lazy(() => import('./pages/InventoryPage').then((module) => ({ default: module.InventoryPage })));
const AdminPage = lazy(() => import('./pages/AdminPage').then((module) => ({ default: module.AdminPage })));
const AccountDashboardPage = lazy(() => import('./pages/AccountPages').then((module) => ({ default: module.AccountDashboardPage })));
const ProfilePage = lazy(() => import('./pages/AccountPages').then((module) => ({ default: module.ProfilePage })));
const NotificationsPage = lazy(() => import('./pages/AccountPages').then((module) => ({ default: module.NotificationsPage })));
const GiftCardsPage = lazy(() => import('./pages/GiftCardsPage').then((module) => ({ default: module.GiftCardsPage })));
const GuestOrderPage = lazy(() => import('./pages/GuestOrderPage').then(module => ({ default: module.GuestOrderPage })));
const CustomerCarePage = lazy(() => import('./pages/CustomerCarePage').then(module => ({ default: module.CustomerCarePage })));
const StorePolicyPage = lazy(() => import('./pages/CustomerCarePage').then(module => ({ default: module.StorePolicyPage })));

const GuestRecoveryPage = lazy(() => import('./pages/GuestRecoveryPage').then(m => ({ default: m.GuestRecoveryPage })));
const OperationsPage = lazy(() => import('./pages/OperationsPage').then(m => ({ default: m.OperationsPage })));
const SecurityPage = lazy(() => import('./pages/SecurityPage').then(m => ({ default: m.SecurityPage })));

function RouteFallback() {
  useLanguage();
  return (
    <div className="page container">
      <LoadingBlock label={t("Loading this section")} variant="tile" count={3} />
    </div>
  );
}

function PublicHome() {
  useLanguage();
  const { initialising } = useAuth();
  if (initialising) return <RouteFallback />;
  // The home is the shop window for everyone. Bouncing signed-in customers to the catalogue
  // made every home feature (offers, deals, categories, pulse, recents) unreachable for them.
  return <ShowcasePage />;
}

export function App() {
  useLanguage();
  const { pathname } = useLocation();
  const { initialising } = useAuth();

  // The showcase ends on its own dark footer blend, so the shell footer would break that section.
  const isShowcase = pathname === '/' && !initialising;
  const isAuth = pathname === '/login' || pathname === '/register';

  return (
    <div className="app-shell">
      <CampaignBanner />
      <Navbar />

      <main id="main">
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/login" element={<AuthPage />} />
            <Route path="/register" element={<AuthPage />} />

            {/* The showcase is the public landing page; the catalogue is one click behind it. */}
            <Route path="/" element={<PublicHome />} />

            <Route
              path="/products"
              element={
                <ProductsPage />
              }
            />

            <Route
              path="/products/:id"
              element={
                <ProductDetailPage />
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
              path="/wishlist"
              element={
                <RequireRole roles={['Customer']}>
                  <WishlistPage />
                </RequireRole>
              }
            />

            <Route
              path="/orders/:id"
              element={<OrderDetailRoute />}
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

            <Route path="/gift-cards" element={<GiftCardsPage />} />
            <Route path="/operations" element={<RequireRole roles={['Staff', 'InventoryManager', 'Administrator']}><OperationsPage /></RequireRole>} />
            <Route path="/guest/recover" element={<GuestRecoveryPage />} />
            <Route path="/account/security" element={<RequireAuth><SecurityPage /></RequireAuth>} />
            <Route path="/guest/orders/:id" element={<GuestOrderPage />} />
            <Route path="/help" element={<CustomerCarePage />} />
            <Route path="/policies/:section" element={<StorePolicyPage />} />

            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </main>

      {isShowcase || isAuth ? null : <Footer />}
      <MobileNav />
      {isAuth ? null : <ChatWidget />}
      {isShowcase ? <AssistantDock /> : null}
    </div>
  );
}
