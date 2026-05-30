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
} from 'lucide-react';

import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LanguageContext';

// توحيد الـ Type ليتطابق مع App.tsx
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
  | 'global-orders';
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

const navSections: NavSection[] = [
  {
    titleEn: 'Platform Management',
    titleAr: 'إدارة المنصة',
    adminOnly: true,
    items: [
      { id: 'admin', icon: <Shield size={17} />, label: 'Admin Dashboard', labelAr: 'لوحة الأدمن', adminOnly: true },
      { id: 'shops', icon: <Store size={17} />, label: 'Shops', labelAr: 'المحلات', adminOnly: true },
      {
        id: 'create-shop',
        icon: <Store size={17} />,
        label: 'Create Shop',
        labelAr: 'إضافة محل',
        adminOnly: true,
      },
      { id: 'users', icon: <Users size={17} />, label: 'Users', labelAr: 'المستخدمون', adminOnly: true },
      { id: 'permissions', icon: <KeyRound size={17} />, label: 'Permissions', labelAr: 'إدارة الصلاحيات', adminOnly: true },
      {
        id: 'global-inventory',
        icon: <Package size={17} />,
        label: 'Global Inventory',
        labelAr: 'المخزون العام',
        adminOnly: true,
      },
      {
        id: 'global-orders',
        icon: <ShoppingCart size={17} />,
        label: 'Global Orders',
        labelAr: 'الطلبات العامة',
        adminOnly: true,
      },
      { id: 'system-settings', icon: <Settings size={17} />, label: 'System Settings', labelAr: 'إعدادات النظام', adminOnly: true },
    ],
  },
  {
    titleEn: 'Operations',
    titleAr: 'العمليات',
    adminOnly: false,
    items: [
      { id: 'dashboard', icon: <LayoutDashboard size={17} />, label: 'Dashboard', labelAr: 'الرئيسية', adminOnly: false },
      { id: 'search', icon: <Search size={17} />, label: 'Products', labelAr: 'المنتجات', adminOnly: false },
      { id: 'inventory', icon: <Package size={17} />, label: 'Inventory', labelAr: 'المخزون', adminOnly: false },
      { id: 'orders', icon: <ShoppingCart size={17} />, label: 'Orders', labelAr: 'الطلبات', adminOnly: false },
      { id: 'reports', icon: <TrendingUp size={17} />, label: 'Reports', labelAr: 'التقارير', adminOnly: false },
      { id: 'alerts', icon: <Bell size={17} />, label: 'Alerts', labelAr: 'التنبيهات', adminOnly: false },
    ],
  },
];

const SidebarDivider = () => <div className="mx-3 my-2 border-t border-slate-700/40" />;

const SectionLabel = ({ label }: { label: string }) => (
  <p className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-500 select-none">
    {label}
  </p>
);

const NavButton = ({ item, isActive, label, onClick }: { item: NavItem; isActive: boolean; label: string; onClick: () => void }) => (
  <button
    onClick={onClick}
    className={`group w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 relative ${
      isActive ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25' : 'text-slate-400 hover:bg-slate-800/70 hover:text-slate-100'
    }`}
  >
    {isActive && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-blue-300 rounded-r-full" />}
    <span className={`flex-shrink-0 transition-all duration-200 ${isActive ? 'text-white' : 'text-slate-500 group-hover:text-slate-300'}`}>
      {item.icon}
    </span>
    <span className="flex-1 text-left">{label}</span>
    {!isActive && <ChevronRight size={13} className="opacity-0 group-hover:opacity-40 transition-opacity duration-200 flex-shrink-0" />}
  </button>
);

export default function Layout({ page, setPage, children }: LayoutProps) {
  const { user, signOut, isAdmin, role, ownedShopId } = useAuth();
  const { lang, setLang, t, isRTL } = useLang();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);

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

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const Sidebar = () => {
    const visibleSections = isAdmin
  ? navSections.filter(section => section.adminOnly)
  : navSections.filter(section => !section.adminOnly);

    return (
      <div className="flex flex-col h-full">
        <div className="px-5 py-5 border-b border-slate-700/50">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-xl shadow-lg shadow-blue-500/20">
              <Truck size={20} className="text-white" />
            </div>
            <div>
              <div className="text-white font-bold text-sm">{t('IsuzuParts', 'إيسوزو بارتس')}</div>
              <div className="text-slate-500 text-[10px]">PLATFORM OWNER</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-2 py-3 overflow-y-auto space-y-0.5">
          {visibleSections.map((section, idx) => {
            const visibleItems = isAdmin
            ? section.items.filter(item => item.adminOnly)
            : section.items.filter(item => !item.adminOnly);
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

        <div className="px-3 py-4 border-t border-slate-700/50 space-y-2">
          <button onClick={() => setLang(lang === 'en' ? 'ar' : 'en')} className="w-full flex items-center justify-center gap-2 bg-slate-800 text-slate-300 py-2 rounded-xl text-sm">
            <Globe size={15} /> <span>{lang === 'en' ? 'العربية' : 'English'}</span>
          </button>
          <button onClick={signOut} className="w-full flex items-center justify-center gap-2 bg-red-500/10 text-red-400 py-2 rounded-xl text-sm">
            <LogOut size={15} /> <span>{t('Logout', 'تسجيل الخروج')}</span>
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-screen bg-slate-950 overflow-hidden">
      {sidebarOpen && <div onClick={() => setSidebarOpen(false)} className="fixed inset-0 bg-black/50 z-40 lg:hidden" />}
      <aside className={`fixed top-0 ${isRTL ? 'right-0' : 'left-0'} z-50 h-full w-72 bg-slate-900 border-r border-slate-700/60 transition-transform lg:static lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : (isRTL ? 'translate-x-full' : '-translate-x-full')}`}>
        <Sidebar />
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 border-b border-slate-800 bg-slate-950/90 backdrop-blur-xl flex items-center justify-between px-4 lg:px-6">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-slate-400"><Menu size={22} /></button>
          <h1 className="text-white font-bold text-lg capitalize">{t(page, page)}</h1>
          <div className="flex items-center gap-3">
             <div className="hidden md:flex items-center gap-2 bg-slate-800 border border-slate-700 px-3 py-1.5 rounded-xl text-xs text-slate-300">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              {isAdmin ? 'System Admin' : 'Shop User'}
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}