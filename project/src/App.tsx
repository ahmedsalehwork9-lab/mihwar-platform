import { useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LanguageProvider } from './context/LanguageContext';
import { NotificationProvider } from './context/NotificationContext';
import LoginPage from './pages/LoginPage';
import LandingPage from './pages/LandingPage';
import Layout, { Page } from './components/Layout';

// ── User Pages ────────────────────────────────────────────────────────
import DashboardPage      from './pages/DashboardPage';
import SearchPage         from './pages/SearchPage';
import InventoryPage      from './pages/InventoryPage';
import OrdersPage         from './pages/OrdersPage';
import ReportsPage        from './pages/ReportsPage';
import AlertsPage         from './pages/AlertsPage';

// ── Admin Pages ───────────────────────────────────────────────────────
import AdminDashboardPage  from './pages/AdminDashboardPage';
import ShopsPage           from './pages/ShopsPage';
import CreateShopPage      from './pages/CreateShopPage';
import UsersPage           from './pages/UsersPage';
import PermissionsPage     from './pages/PermissionsPage';
import GlobalInventoryPage from './pages/GlobalInventoryPage';
import GlobalOrdersPage    from './pages/GlobalOrdersPage';
import OrganizationsPage   from './pages/OrganizationsPage';   // ← إضافة جديدة

// ── Public Pages (لا تحتاج تسجيل دخول) ──────────────────────────────
import VerifyInvoicePage from './pages/VerifyInvoicePage';

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
// APP CONTENT — state-based routing (no React Router for internal pages)
// ══════════════════════════════════════════════════════════════════════

function AppContent() {
  const { session, loading, isAdmin } = useAuth();
  const [page, setPage]               = useState<Page>('dashboard');
  const [showLanding, setShowLanding] = useState(true);

  // ── Loading splash ─────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-14 h-14 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ── Unauthenticated ────────────────────────────────────────────────
  if (!session) {
    if (showLanding) {
      return <LandingPage onLogin={() => setShowLanding(false)} />;
    }
    return <LoginPage />;
  }

  // ── Placeholder for pages still under development ─────────────────
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

        {/* ══════════════════════════════════════════════════════════
            USER PAGES
        ══════════════════════════════════════════════════════════ */}
        {page === 'dashboard' && <DashboardPage />}
        {page === 'search'    && <SearchPage />}
        {page === 'inventory' && <InventoryPage />}
        {page === 'orders'    && <OrdersPage />}
        {page === 'reports'   && <ReportsPage />}
        {page === 'alerts'    && <AlertsPage />}

        {/* ══════════════════════════════════════════════════════════
            ADMIN — Platform Management
        ══════════════════════════════════════════════════════════ */}
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

        {/* ══════════════════════════════════════════════════════════
            ADMIN — Enterprise
            المجموعات: تعرض OrganizationsPage للأدمن فقط.
            التنقل يتم عبر setPage('organizations') من القائمة الجانبية
            في Layout.tsx — بدون React Router أو أي path إضافي.
        ══════════════════════════════════════════════════════════ */}
        {page === 'organizations' &&
          (isAdmin ? <OrganizationsPage /> : <AccessDenied />)}

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
        {/* ── Public route — no auth required ───────────────────── */}
        <Route path="/verify/:orderId" element={<VerifyInvoicePage />} />

        {/* ── Main app — state-based routing, unchanged behaviour ── */}
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
