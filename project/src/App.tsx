import { useState, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LanguageProvider } from './context/LanguageContext';
import { NotificationProvider } from './context/NotificationContext';
import LoginPage from './pages/LoginPage';
import LandingPage from './pages/LandingPage';
import Layout, { Page } from './components/Layout';

// ── Public pages — loaded immediately (no auth, on critical path) ─────────
const VerifyInvoicePage = lazy(() => import('./pages/VerifyInvoicePage'));
const ShopPublicPage    = lazy(() => import('./pages/ShopPublicPage'));

// ── Shop user pages ───────────────────────────────────────────────────────
const DashboardPage     = lazy(() => import('./pages/DashboardPage'));
const SearchPage        = lazy(() => import('./pages/SearchPage'));
const InventoryPage     = lazy(() => import('./pages/InventoryPage'));
const OrdersPage        = lazy(() => import('./pages/orders/OrdersPage'));
const ReportsPage       = lazy(() => import('./pages/ReportsPage'));
const AlertsPage        = lazy(() => import('./pages/AlertsPage'));
const ShopSettingsPage  = lazy(() => import('./pages/ShopSettingsPage'));

// ── Admin pages — only downloaded when an admin logs in ──────────────────
const AdminDashboardPage  = lazy(() => import('./pages/AdminDashboardPage'));
const ShopsPage           = lazy(() => import('./pages/ShopsPage'));
const CreateShopPage      = lazy(() => import('./pages/CreateShopPage'));
const UsersPage           = lazy(() => import('./pages/UsersPage'));
const PermissionsPage     = lazy(() => import('./pages/PermissionsPage'));
const GlobalInventoryPage = lazy(() => import('./pages/GlobalInventoryPage'));
const GlobalOrdersPage    = lazy(() => import('./pages/GlobalOrdersPage'));
const OrganizationsPage   = lazy(() => import('./pages/OrganizationsPage'));

// ── Shared loading fallback ───────────────────────────────────────────────
function PageLoader() {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// ACCESS DENIED
// ══════════════════════════════════════════════════════════════════════

function AccessDenied() {
  return (
    <div className="flex items-center justify-center h-[70vh]">
      <div className="bg-red-500/10 border border-red-500/20 rounded-3xl p-10 text-center max-w-md">
        <h2 className="text-2xl font-bold text-red-400 mb-3">غير مصرح</h2>
        <p className="text-slate-400">ليس لديك صلاحية الوصول إلى هذه المنطقة الإدارية</p>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// APP CONTENT
// ══════════════════════════════════════════════════════════════════════

function AppContent() {
  const { session, loading, isAdmin } = useAuth();
  const [page, setPage]               = useState<Page>('dashboard');
  const [showLanding, setShowLanding] = useState(true);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-14 h-14 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) {
    if (showLanding) {
      return <LandingPage onLogin={() => setShowLanding(false)} />;
    }
    return <LoginPage />;
  }

  const renderAdminPlaceholder = (title: string) => (
    <div className="flex items-center justify-center h-[70vh]">
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-3xl p-10 text-center">
        <h2 className="text-2xl font-bold text-blue-400 mb-3">{title}</h2>
        <p className="text-slate-400">هذه الصفحة تحت التطوير</p>
      </div>
    </div>
  );

  return (
    <NotificationProvider>
      <Layout page={page} setPage={setPage}>
        <Suspense fallback={<PageLoader />}>

          {/* ══ USER PAGES ══════════════════════════════════════════════ */}
          {page === 'dashboard'     && <DashboardPage />}
          {page === 'search'        && <SearchPage />}
          {page === 'inventory'     && <InventoryPage />}
          {page === 'orders'        && <OrdersPage />}
          {page === 'reports'       && <ReportsPage />}
          {page === 'alerts'        && <AlertsPage />}
          {page === 'shop-settings' && <ShopSettingsPage />}

          {/* ══ ADMIN ════════════════════════════════════════════════════ */}
          {page === 'admin' &&
            (isAdmin ? <AdminDashboardPage /> : <AccessDenied />)}

          {page === 'shops' &&
            (isAdmin ? <ShopsPage /> : <AccessDenied />)}

          {page === 'create-shop' &&
            (isAdmin ? <CreateShopPage /> : <AccessDenied />)}

          {page === 'users' &&
            (isAdmin ? <UsersPage /> : <AccessDenied />)}

          {page === 'permissions' &&
            (isAdmin ? <PermissionsPage /> : <AccessDenied />)}

          {page === 'global-inventory' &&
            (isAdmin ? <GlobalInventoryPage /> : <AccessDenied />)}

          {page === 'global-orders' &&
            (isAdmin ? <GlobalOrdersPage /> : <AccessDenied />)}

          {page === 'system-settings' &&
            (isAdmin
              ? renderAdminPlaceholder('إعدادات النظام')
              : <AccessDenied />)}

          {page === 'organizations' &&
            (isAdmin ? <OrganizationsPage /> : <AccessDenied />)}

        </Suspense>
      </Layout>
    </NotificationProvider>
  );
}

// ══════════════════════════════════════════════════════════════════════
// ROOT APP
// ══════════════════════════════════════════════════════════════════════

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* ── Public routes — no auth required ──────────────────────── */}
        <Route
          path="/verify/:orderId"
          element={
            <Suspense fallback={<PageLoader />}>
              <VerifyInvoicePage />
            </Suspense>
          }
        />

        {/* ── Shop public page — scanned QR lands here ──────────────── */}
        <Route
          path="/shop/:shopId"
          element={
            <LanguageProvider>
              <Suspense fallback={<PageLoader />}>
                <ShopPublicPage />
              </Suspense>
            </LanguageProvider>
          }
        />

        {/* ── Main app ──────────────────────────────────────────────── */}
        <Route
          path="*"
          element={
            <LanguageProvider>
              <AuthProvider>
                <AppContent />
              </AuthProvider>
            </LanguageProvider>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
