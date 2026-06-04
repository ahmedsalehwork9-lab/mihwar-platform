import { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LanguageProvider } from './context/LanguageContext';
import { NotificationProvider } from './context/NotificationContext';
import LoginPage from './pages/LoginPage';
import LandingPage from './pages/LandingPage';
import Layout, { Page } from './components/Layout';

// Pages
import DashboardPage from './pages/DashboardPage';
import SearchPage from './pages/SearchPage';
import InventoryPage from './pages/InventoryPage';
import OrdersPage from './pages/OrdersPage';
import ReportsPage from './pages/ReportsPage';
import AlertsPage from './pages/AlertsPage';
import AdminDashboardPage from './pages/AdminDashboardPage';

// Admin Pages
import ShopsPage from './pages/ShopsPage';
import CreateShopPage from './pages/CreateShopPage';
import UsersPage from './pages/UsersPage';
import PermissionsPage from './pages/PermissionsPage';
import GlobalInventoryPage from './pages/GlobalInventoryPage';
import GlobalOrdersPage from './pages/GlobalOrdersPage';

function AppContent() {
  const { session, loading, isAdmin } = useAuth();
  const [page, setPage] = useState<Page>('dashboard');
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
        {/* User Pages */}
        {page === 'dashboard' && <DashboardPage />}
        {page === 'search' && <SearchPage />}
        {page === 'inventory' && <InventoryPage />}
        {page === 'orders' && <OrdersPage />}
        {page === 'reports' && <ReportsPage />}
        {page === 'alerts' && <AlertsPage />}

        {/* Admin Pages */}
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
      </Layout>
    </NotificationProvider>
  );
}

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

export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </LanguageProvider>
  );
}