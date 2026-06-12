import { useEffect, useState } from 'react';
import {
  Truck,
  LayoutDashboard,
  Package,
  Search,
  LogOut,
  Menu,
  Globe,
  Shield,
  ShoppingCart,
  Bell,
  Store,
  Users,
  KeyRound,
  Settings,
  TrendingUp,
  ChevronRight,
  MoreHorizontal,
  User,
  Info,
  HeadphonesIcon,
  Lock,
  X,
  Building2,
} from 'lucide-react';

import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LanguageContext';

// ══════════════════════════════════════════════════════════════════════
// PAGE TYPE — 'organizations' added, everything else unchanged
// ══════════════════════════════════════════════════════════════════════

export type Page =
  | 'dashboard'
  | 'search'
  | 'inventory'
  | 'orders'
  | 'reports'
  | 'alerts'
  | 'admin'
  | 'shops'
  | 'create-shop'
  | 'users'
  | 'permissions'
  | 'system-settings'
  | 'global-inventory'
  | 'global-orders'
  | 'organizations';          // ← NEW

// ══════════════════════════════════════════════════════════════════════
// TYPES — unchanged
// ══════════════════════════════════════════════════════════════════════

type Notification = {
  id: string;
  shop_id: number;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
};

type LayoutProps = {
  page: Page;
  setPage: (p: Page) => void;
  children: React.ReactNode;
};

type NavItem = {
  id: Page;
  icon: React.ReactNode;
  label: string;
  labelAr: string;
  adminOnly: boolean;
};

type NavSection = {
  titleEn: string;
  titleAr: string;
  adminOnly: boolean;
  items: NavItem[];
};

// ══════════════════════════════════════════════════════════════════════
// NAV SECTIONS
// Rule: sections with adminOnly:true  → visible to admin users only
//       sections with adminOnly:false → visible to regular shop users only
//
// Change from original:
//   • 'organizations' item added to the existing 'Platform Management'
//     section, right after 'global-orders' and before 'system-settings'.
//   • Everything else is identical to the original file.
// ══════════════════════════════════════════════════════════════════════

const navSections: NavSection[] = [
  {
    titleEn: 'Platform Management',
    titleAr: 'إدارة المنصة',
    adminOnly: true,
    items: [
      { id: 'admin',            icon: <Shield size={17} />,       label: 'Admin Dashboard',  labelAr: 'لوحة الأدمن',     adminOnly: true },
      { id: 'shops',            icon: <Store size={17} />,        label: 'Shops',            labelAr: 'المحلات',         adminOnly: true },
      { id: 'create-shop',      icon: <Store size={17} />,        label: 'Create Shop',      labelAr: 'إضافة محل',       adminOnly: true },
      { id: 'users',            icon: <Users size={17} />,        label: 'Users',            labelAr: 'المستخدمون',      adminOnly: true },
      { id: 'permissions',      icon: <KeyRound size={17} />,     label: 'Permissions',      labelAr: 'إدارة الصلاحيات', adminOnly: true },
      { id: 'global-inventory', icon: <Package size={17} />,      label: 'Global Inventory', labelAr: 'المخزون العام',   adminOnly: true },
      { id: 'global-orders',    icon: <ShoppingCart size={17} />, label: 'Global Orders',    labelAr: 'الطلبات العامة',  adminOnly: true },
      // ── NEW: Organizations — adminOnly, same visibility rules as the items above ──
      { id: 'organizations',    icon: <Building2 size={17} />,    label: 'Organizations',    labelAr: 'المجموعات',       adminOnly: true },
      { id: 'system-settings',  icon: <Settings size={17} />,     label: 'System Settings',  labelAr: 'إعدادات النظام',  adminOnly: true },
    ],
  },
  {
    titleEn: 'Operations',
    titleAr: 'العمليات',
    adminOnly: false,
    items: [
      { id: 'dashboard', icon: <LayoutDashboard size={17} />, label: 'Dashboard', labelAr: 'الرئيسية',  adminOnly: false },
      { id: 'search',    icon: <Search size={17} />,          label: 'Products',  labelAr: 'المنتجات',  adminOnly: false },
      { id: 'inventory', icon: <Package size={17} />,         label: 'Inventory', labelAr: 'المخزون',   adminOnly: false },
      { id: 'orders',    icon: <ShoppingCart size={17} />,    label: 'Orders',    labelAr: 'الطلبات',   adminOnly: false },
      { id: 'reports',   icon: <TrendingUp size={17} />,      label: 'Reports',   labelAr: 'التقارير',  adminOnly: false },
      { id: 'alerts',    icon: <Bell size={17} />,            label: 'Alerts',    labelAr: 'التنبيهات', adminOnly: false },
    ],
  },
];

// ══════════════════════════════════════════════════════════════════════
// BOTTOM NAV — unchanged from original
// ══════════════════════════════════════════════════════════════════════

type BottomNavItem =
  | { type: 'page'; id: Page; icon: React.ReactNode; labelEn: string; labelAr: string }
  | { type: 'more'; icon: React.ReactNode; labelEn: string; labelAr: string };

const shopBottomItems: BottomNavItem[] = [
  { type: 'page', id: 'dashboard', icon: <LayoutDashboard size={22} />, labelEn: 'Home',      labelAr: 'الرئيسية' },
  { type: 'page', id: 'inventory', icon: <Package size={22} />,         labelEn: 'Inventory', labelAr: 'المخزون'  },
  { type: 'page', id: 'search',    icon: <Search size={22} />,          labelEn: 'Search',    labelAr: 'بحث'      },
  { type: 'page', id: 'orders',    icon: <ShoppingCart size={22} />,    labelEn: 'Orders',    labelAr: 'الطلبات'  },
  { type: 'more',                  icon: <MoreHorizontal size={22} />,  labelEn: 'More',      labelAr: 'المزيد'   },
];

const adminBottomItems: BottomNavItem[] = [
  { type: 'page', id: 'admin',         icon: <Shield size={22} />,        labelEn: 'Admin',  labelAr: 'الأدمن'     },
  { type: 'page', id: 'shops',         icon: <Store size={22} />,         labelEn: 'Shops',  labelAr: 'المحلات'    },
  { type: 'page', id: 'global-orders', icon: <ShoppingCart size={22} />,  labelEn: 'Orders', labelAr: 'الطلبات'    },
  { type: 'page', id: 'users',         icon: <Users size={22} />,         labelEn: 'Users',  labelAr: 'المستخدمون' },
  { type: 'more',                       icon: <MoreHorizontal size={22} />,labelEn: 'More',   labelAr: 'المزيد'     },
];

// ══════════════════════════════════════════════════════════════════════
// SMALL COMPONENTS — unchanged
// ══════════════════════════════════════════════════════════════════════

const SidebarDivider = () => (
  <div className="mx-3 my-2 border-t border-slate-700/40" />
);

const SectionLabel = ({ label }: { label: string }) => (
  <p className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-500 select-none">
    {label}
  </p>
);

const NavButton = ({
  item, isActive, label, onClick,
}: {
  item: NavItem; isActive: boolean; label: string; onClick: () => void;
}) => (
  <button
    onClick={onClick}
    className={`group w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 relative ${
      isActive
        ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25'
        : 'text-slate-400 hover:bg-slate-800/70 hover:text-slate-100'
    }`}
  >
    {isActive && (
      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-blue-300 rounded-r-full" />
    )}
    <span className={`flex-shrink-0 transition-all duration-200 ${isActive ? 'text-white' : 'text-slate-500 group-hover:text-slate-300'}`}>
      {item.icon}
    </span>
    <span className="flex-1 text-left">{label}</span>
    {!isActive && (
      <ChevronRight size={13} className="opacity-0 group-hover:opacity-40 transition-opacity duration-200 flex-shrink-0" />
    )}
  </button>
);

// ══════════════════════════════════════════════════════════════════════
// MAIN LAYOUT — body unchanged, only navSections & Page type updated
// ══════════════════════════════════════════════════════════════════════

export default function Layout({ page, setPage, children }: LayoutProps) {
  const { signOut, isAdmin, ownedShopId } = useAuth();
  const { lang, setLang, t, isRTL } = useLang();
  const [sidebarOpen, setSidebarOpen]   = useState(false);
  const [showMore,    setShowMore]       = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    if (!ownedShopId) return;
    const fetchNotifications = async () => {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('shop_id', ownedShopId)
        .order('created_at', { ascending: false })
        .limit(10);
      if (data) setNotifications(data);
    };
    fetchNotifications();
  }, [ownedShopId]);

  const unreadCount  = notifications.filter((n) => !n.is_read).length;
  const bottomItems  = isAdmin ? adminBottomItems : shopBottomItems;

  // ─── Sidebar ──────────────────────────────────────────────
  const Sidebar = () => {
    const visibleSections = isAdmin
      ? navSections.filter((s) => s.adminOnly)
      : navSections.filter((s) => !s.adminOnly);

    return (
      <div className="flex flex-col h-full overflow-hidden">

        {/* Logo — never shrinks */}
        <div className="flex-shrink-0 px-5 py-5 border-b border-slate-700/50">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-xl shadow-lg shadow-blue-500/20">
              <Truck size={20} className="text-white" />
            </div>
            <div>
              <div className="text-white font-bold text-sm">{t('MIHWAR', 'مِحور')}</div>
              <div className="text-slate-500 text-[10px] tracking-widest">MIHWAR PLATFORM</div>
            </div>
          </div>
        </div>

        {/* Nav — scrollable, min-h-0 is critical */}
        <nav className="flex-1 min-h-0 px-2 py-3 overflow-y-auto space-y-0.5">
          {visibleSections.map((section, idx) => {
            const visibleItems = isAdmin
              ? section.items.filter((item) => item.adminOnly)
              : section.items.filter((item) => !item.adminOnly);
            if (visibleItems.length === 0) return null;
            return (
              <div key={section.titleEn}>
                {idx > 0 && <SidebarDivider />}
                <SectionLabel label={t(section.titleEn, section.titleAr)} />
                <div className="space-y-0.5 px-1">
                  {visibleItems.map((item) => (
                    <NavButton
                      key={item.id}
                      item={item}
                      isActive={page === item.id}
                      label={t(item.label, item.labelAr)}
                      onClick={() => { setPage(item.id); setSidebarOpen(false); }}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Footer — never shrinks, safe-area aware */}
        <div
          className="flex-shrink-0 px-3 py-4 border-t border-slate-700/50 space-y-2"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          <button
            onClick={() => setLang(lang === 'en' ? 'ar' : 'en')}
            className="w-full flex items-center justify-center gap-2 bg-slate-800 text-slate-300 py-2 rounded-xl text-sm"
          >
            <Globe size={15} />
            <span>{lang === 'en' ? 'العربية' : 'English'}</span>
          </button>
          <button
            onClick={signOut}
            className="w-full flex items-center justify-center gap-2 bg-red-500/10 text-red-400 py-2 rounded-xl text-sm"
          >
            <LogOut size={15} />
            <span>{t('Logout', 'تسجيل الخروج')}</span>
          </button>
        </div>

      </div>
    );
  };

  // ─── More Sheet ───────────────────────────────────────────
  const MoreSheet = () => {
    if (!showMore) return null;

    const moreItems = [
      { icon: <User size={18} />,           labelEn: 'Profile',          labelAr: 'الملف الشخصي'   },
      { icon: <Store size={18} />,          labelEn: 'Shop Information', labelAr: 'معلومات المحل'  },
      { icon: <Bell size={18} />,           labelEn: 'Notifications',    labelAr: 'الإشعارات',
        badge: unreadCount > 0 ? unreadCount : null },
      { icon: <HeadphonesIcon size={18} />, labelEn: 'Support Center',   labelAr: 'مركز الدعم'     },
      { icon: <Lock size={18} />,           labelEn: 'Privacy Policy',   labelAr: 'سياسة الخصوصية' },
      { icon: <Info size={18} />,           labelEn: 'About MIHWAR',     labelAr: 'عن محور'         },
    ];

    return (
      <>
        {/* Backdrop */}
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setShowMore(false)}
        />
        {/* Sheet */}
        <div
          className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-slate-900 border-t border-slate-700/60 rounded-t-2xl"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          {/* Handle */}
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 rounded-full bg-slate-700" />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700/50">
            <span className="text-white font-semibold text-base">
              {t('More', 'المزيد')}
            </span>
            <button
              onClick={() => setShowMore(false)}
              className="text-slate-400 hover:text-white p-1"
            >
              <X size={18} />
            </button>
          </div>

          {/* Items */}
          <div className="px-4 py-3 space-y-1">
            {moreItems.map((item) => (
              <button
                key={item.labelEn}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-slate-300 hover:bg-slate-800 active:bg-slate-700 transition-colors text-sm font-medium relative"
                onClick={() => setShowMore(false)}
              >
                <span className="text-slate-500">{item.icon}</span>
                <span className="flex-1 text-right">{t(item.labelEn, item.labelAr)}</span>
                {'badge' in item && item.badge && (
                  <span className="w-5 h-5 bg-red-500 rounded-full text-[10px] text-white flex items-center justify-center font-bold">
                    {item.badge > 9 ? '9+' : item.badge}
                  </span>
                )}
                <ChevronRight size={14} className="text-slate-600" />
              </button>
            ))}
          </div>

          {/* Divider */}
          <div className="mx-4 border-t border-slate-700/40 my-1" />

          {/* Language + Logout */}
          <div className="px-4 pb-2 space-y-1">
            <button
              onClick={() => { setLang(lang === 'en' ? 'ar' : 'en'); setShowMore(false); }}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-slate-300 hover:bg-slate-800 active:bg-slate-700 transition-colors text-sm font-medium"
            >
              <Globe size={18} className="text-slate-500" />
              <span className="flex-1 text-right">{lang === 'en' ? 'العربية' : 'English'}</span>
              <ChevronRight size={14} className="text-slate-600" />
            </button>
            <button
              onClick={() => { setShowMore(false); signOut(); }}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-red-400 hover:bg-red-500/10 active:bg-red-500/20 transition-colors text-sm font-medium"
            >
              <LogOut size={18} />
              <span className="flex-1 text-right">{t('Logout', 'تسجيل الخروج')}</span>
            </button>
          </div>

        </div>
      </>
    );
  };

  // ─── Mobile Bottom Navigation Bar ────────────────────────
  const BottomNav = () => {
    // Hide completely when sidebar or more sheet is open
    if (sidebarOpen || showMore) return null;

    return (
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-slate-900 border-t border-slate-700/60"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex items-stretch h-16">
          {bottomItems.map((item) => {
            const isActive = item.type === 'page' && page === item.id;
            const label    = lang === 'ar' ? item.labelAr : item.labelEn;

            if (item.type === 'more') {
              return (
                <button
                  key="more"
                  onClick={() => setShowMore(true)}
                  className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-slate-500 hover:text-slate-300 active:bg-slate-800/60 transition-colors duration-150"
                >
                  <span className="transition-transform duration-150 active:scale-90">
                    {item.icon}
                  </span>
                  <span className="text-[10px] font-medium leading-none tracking-wide">
                    {label}
                  </span>
                </button>
              );
            }

            return (
              <button
                key={item.id}
                onClick={() => setPage(item.id)}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 relative transition-colors duration-150 active:bg-slate-800/60 ${
                  isActive ? 'text-blue-400' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {/* Active top pill */}
                {isActive && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[3px] bg-blue-500 rounded-b-full" />
                )}
                <span className={`transition-all duration-150 ${isActive ? 'scale-110' : 'scale-100'}`}>
                  {item.icon}
                </span>
                <span className={`text-[10px] font-medium leading-none tracking-wide transition-colors duration-150 ${isActive ? 'text-blue-400' : 'text-slate-500'}`}>
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    );
  };
  // ─────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen bg-slate-950 overflow-hidden">

      {/* Sidebar overlay */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 ${isRTL ? 'right-0' : 'left-0'} z-50 h-full w-72 bg-slate-900 border-r border-slate-700/60 transition-transform duration-300 lg:static lg:translate-x-0 ${
          sidebarOpen
            ? 'translate-x-0'
            : isRTL
            ? 'translate-x-full'
            : '-translate-x-full'
        }`}
      >
        <Sidebar />
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Top header */}
        <header className="h-16 border-b border-slate-800 bg-slate-950/90 backdrop-blur-xl flex items-center justify-between px-4 lg:px-6">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden text-slate-400"
          >
            <Menu size={22} />
          </button>
          <h1 className="text-white font-bold text-lg capitalize">
            {t(page, page)}
          </h1>
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-2 bg-slate-800 border border-slate-700 px-3 py-1.5 rounded-xl text-xs text-slate-300">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              {isAdmin ? 'System Admin' : 'Shop User'}
            </div>
          </div>
        </header>

        {/* Main — pb-20 on mobile clears the bottom nav */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6 pb-20 lg:pb-6">
          {children}
        </main>

      </div>

      {/* Mobile more sheet */}
      <MoreSheet />

      {/* Mobile bottom nav */}
      <BottomNav />

    </div>
  );
}
