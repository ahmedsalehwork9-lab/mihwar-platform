import { useState, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LanguageProvider } from './context/LanguageContext';
import { NotificationProvider } from './context/NotificationContext';
import LoginPage from './pages/LoginPage';
import LandingPage from './pages/LandingPage';
import Layout, { Page } from './components/Layout';

// â”€â”€ Public pages â€” loaded immediately (no auth, on critical path) â”€â”€â”€â”€â”€â”€â”€â”€â”€
const VerifyInvoicePage = lazy(() => import('./pages/VerifyInvoicePage'));
const ShopPublicPage    = lazy(() => import('./pages/ShopPublicPage'));

// â”€â”€ Shop user pages â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const DashboardPage     = lazy(() => import('./pages/DashboardPage'));
const SearchPage        = lazy(() => import('./pages/SearchPage'));
const InventoryPage     = lazy(() => import('./pages/InventoryPage'));
const OrdersPage        = lazy(() => import('./pages/orders/OrdersPage'));
const ReportsPage       = lazy(() => import('./pages/ReportsPage'));
const AlertsPage        = lazy(() => import('./pages/AlertsPage'));
const ShopSettingsPage  = lazy(() => import('./pages/ShopSettingsPage'));

// â”€â”€ Admin pages â€” only downloaded when an admin logs in â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const AdminDashboardPage  = lazy(() => import('./pages/AdminDashboardPage'));
const ShopsPage           = lazy(() => import('./pages/ShopsPage'));
const CreateShopPage      = lazy(() => import('./pages/CreateShopPage'));
const UsersPage           = lazy(() => import('./pages/UsersPage'));
const PermissionsPage     = lazy(() => import('./pages/PermissionsPage'));
const GlobalInventoryPage = lazy(() => import('./pages/GlobalInventoryPage'));
const GlobalOrdersPage    = lazy(() => import('./pages/GlobalOrdersPage'));
const OrganizationsPage   = lazy(() => import('./pages/OrganizationsPage'));

// â”€â”€ Shared loading fallback â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function PageLoader() {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    </div>
  );
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ACCESS DENIED
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

function AccessDenied() {
  return (
    <div className="flex items-center justify-center h-[70vh]">
      <div className="bg-red-500/10 border border-red-500/20 rounded-3xl p-10 text-center max-w-md">
        <h2 className="text-2xl font-bold text-red-400 mb-3">ØºÙŠØ± Ù…ØµØ±Ø­</h2>
        <p className="text-slate-400">Ù„ÙŠØ³ Ù„Ø¯ÙŠÙƒ ØµÙ„Ø§Ø­ÙŠØ© Ø§Ù„ÙˆØµÙˆÙ„ Ø¥Ù„Ù‰ Ù‡Ø°Ù‡ Ø§Ù„Ù…Ù†Ø·Ù‚Ø© Ø§Ù„Ø¥Ø¯Ø§Ø±ÙŠØ©</p>
      </div>
    </div>
  );
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// APP CONTENT
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

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
        <p className="text-slate-400">Ù‡Ø°Ù‡ Ø§Ù„ØµÙØ­Ø© ØªØ­Øª Ø§Ù„ØªØ·ÙˆÙŠØ±</p>
      </div>
    </div>
  );

  return (
    <NotificationProvider>
      <Layout page={page} setPage={setPage}>
        <Suspense fallback={<PageLoader />}>

          {/* â•â• USER PAGES â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
          {page === 'dashboard'     && <DashboardPage />}
          {page === 'search'        && <SearchPage />}
          {page === 'inventory'     && <InventoryPage />}
          {page === 'orders'        && <OrdersPage />}
          {page === 'reports'       && <ReportsPage />}
          {page === 'alerts'        && <AlertsPage />}
          {page === 'shop-settings' && <ShopSettingsPage />}

          {/* â•â• ADMIN â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
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
              ? renderAdminPlaceholder('Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª Ø§Ù„Ù†Ø¸Ø§Ù…')
              : <AccessDenied />)}

          {page === 'organizations' &&
            (isAdmin ? <OrganizationsPage /> : <AccessDenied />)}

        </Suspense>
      </Layout>
    </NotificationProvider>
  );
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
type ActivityType = "spare-parts" | "grocery" | "cafe" | "restaurant" | "retail" | "general";

function ActivityLanding({ activity }: { activity: ActivityType }) {
  const [showLanding, setShowLanding] = useState(true);

  if (!showLanding) {
    return (
      <LanguageProvider>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </LanguageProvider>
    );
  }

  return (
    <LanguageProvider>
      <LandingPage
        activity={activity}
        onLogin={() => setShowLanding(false)}
      />
    </LanguageProvider>
  );
}

// ROOT APP
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* â”€â”€ Public routes â€” no auth required â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <Route
          path="/verify/:orderId"
          element={
            <Suspense fallback={<PageLoader />}>
              <VerifyInvoicePage />
            </Suspense>
          }
        />

        {/* â”€â”€ Shop public page â€” numeric ID â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
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

        {/* â”€â”€ Shop public page â€” custom slug â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <Route
          path="/s/:slug"
          element={
            <LanguageProvider>
              <Suspense fallback={<PageLoader />}>
                <ShopPublicPage />
              </Suspense>
            </LanguageProvider>
          }
        />

        {/* â”€â”€ Main app â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <Route path="/spare-parts" element={<ActivityLanding activity="spare-parts" />} />
        <Route path="/grocery" element={<ActivityLanding activity="grocery" />} />
        <Route path="/cafe" element={<ActivityLanding activity="cafe" />} />
        <Route path="/restaurant" element={<ActivityLanding activity="restaurant" />} />
        <Route path="/retail" element={<ActivityLanding activity="retail" />} />
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



