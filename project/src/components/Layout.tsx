import { useEffect, useState, useMemo, useRef } from 'react';
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
  ShoppingBag,
  Landmark,
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
  QrCode,
  FileBarChart,
  FolderOpen,
  Calculator,
  ClipboardCheck,
} from 'lucide-react';

import { supabase } from '../pages/lib/supabase';
import NotificationBell from '../context/NotificationBell';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LanguageContext';
import { ThemeToggle } from './ThemeToggle';
import BranchSwitcher from './BranchSwitcher';

// ══════════════════════════════════════════════════════════════════════
// PAGE TYPE
// ══════════════════════════════════════════════════════════════════════

export type Page =
  | 'dashboard'
  | 'search'
  | 'inventory'
  | 'stock-adjustments'
  | 'orders'
  | 'reports'
  | 'sales'
  | 'pos'
  | 'sales-reconciliation'
  | 'quotation'
  | 'purchases'
  | 'purchase-invoices'
  | 'purchase-orders'
  | 'purchase-reconciliation'
  | 'purchase-returns'
  | 'supplier-payments'
  | 'fixed-expenses'
  | 'financial-report'
  | 'reports-center'
  | 'business-analytics'
  | 'monthly-financial'
  | 'accounting'
  | 'alerts'
  | 'shop-settings'       // ← إعدادات المحل + QR
  | 'admin'
  | 'shops'
  | 'create-shop'
  | 'users'
  | 'permissions'
  | 'system-settings'
  | 'global-inventory'
  | 'global-orders'
  | 'organizations';

// ══════════════════════════════════════════════════════════════════════
// PAGE TITLES — عناوين الصفحات بالعربي والإنجليزي
// ══════════════════════════════════════════════════════════════════════

const pageTitles: Record<Page, { en: string; ar: string }> = {
  'dashboard':       { en: 'Dashboard',       ar: 'الرئيسية'        },
  'search':          { en: 'Store',         ar: 'المتجر'        },
  'inventory':       { en: 'Inventory',        ar: 'المخزون'         },
  'stock-adjustments': { en: 'Stock Adjustments', ar: 'الجرد والتسويات' },
  'orders':          { en: 'Orders',           ar: 'الطلبات'         },
  'reports':         { en: 'Reports',          ar: 'التقارير'        },
  'sales':           { en: 'Sales',            ar: 'المبيعات'        },
  'pos':             { en: 'POS',              ar: 'نقاط البيع'      },
  'sales-reconciliation': { en: 'Sales Reconciliation', ar: 'تسوية المبيعات' },
  'quotation':       { en: 'Quotation',        ar: 'عرض سعر'         },
  purchases: { en: 'Purchases', ar: 'المشتريات' },
  'purchase-invoices': { en: 'Purchase Invoices', ar: 'فواتير المشتريات' },
  'purchase-orders': { en: 'Purchase Orders',  ar: 'أوامر الشراء'    },
  'purchase-reconciliation': { en: 'Purchase Reconciliation', ar: 'تسوية المشتريات' },
  'purchase-returns':{ en: 'Purchase Returns',  ar: 'مرتجعات المشتريات' },
  'supplier-payments': { en: 'Supplier Payments', ar: 'سداد الموردين' },
  'fixed-expenses': { en: 'Fixed Expenses', ar: 'المصروفات الثابتة' },
  'financial-report': { en: 'Financial Report', ar: 'التقرير المالي' },
  'reports-center':  { en: 'Reports Center',   ar: 'مركز التقارير'   },
  'business-analytics': { en: 'Business Analytics', ar: 'تحليلات الأعمال' },
  'monthly-financial': { en: 'Monthly Financial', ar: 'التقرير المالي الشهري' },
  'accounting':      { en: 'Accounting',       ar: 'الحسابات'        },
  'alerts':          { en: 'Alerts',           ar: 'التنبيهات'       },
  'shop-settings':   { en: 'Shop Settings',    ar: 'إعدادات المحل'   },
  'admin':           { en: 'Admin Dashboard',  ar: 'لوحة الأدمن'     },
  'shops':           { en: 'Shops',            ar: 'المحلات'         },
  'create-shop':     { en: 'Create Shop',      ar: 'إضافة محل'       },
  'users':           { en: 'Users',            ar: 'المستخدمون'      },
  'permissions':     { en: 'Permissions',      ar: 'إدارة الصلاحيات' },
  'system-settings': { en: 'System Settings',  ar: 'إعدادات النظام'  },
  'global-inventory':{ en: 'Global Inventory', ar: 'المخزون العام'   },
  'global-orders':   { en: 'Global Orders',    ar: 'الطلبات العامة'  },
  'organizations':   { en: 'Organizations',    ar: 'المجموعات'       },
};

// ══════════════════════════════════════════════════════════════════════
// TYPES
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
  accSection?: string;                       // القسم النشط داخل الحسابات
  setAccSection?: (s: string) => void;
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
// ══════════════════════════════════════════════════════════════════════

const navSections: NavSection[] = [
  {
    titleEn: 'Platform Management',
    titleAr: 'إدارة المنصة',
    adminOnly: true,
    items: [
      { id: 'admin',             icon: <Shield size={17} />,       label: 'Admin Dashboard',  labelAr: 'لوحة الأدمن',     adminOnly: true },
      { id: 'shops',             icon: <Store size={17} />,        label: 'Shops',            labelAr: 'المحلات',         adminOnly: true },
      { id: 'create-shop',       icon: <Store size={17} />,        label: 'Create Shop',      labelAr: 'إضافة محل',       adminOnly: true },
      { id: 'users',             icon: <Users size={17} />,        label: 'Users',            labelAr: 'المستخدمون',      adminOnly: true },
      { id: 'permissions',       icon: <KeyRound size={17} />,     label: 'Permissions',      labelAr: 'إدارة الصلاحيات', adminOnly: true },
      { id: 'global-inventory',  icon: <Package size={17} />,      label: 'Global Inventory', labelAr: 'المخزون العام',   adminOnly: true },
      { id: 'global-orders',     icon: <ShoppingCart size={17} />, label: 'Global Orders',    labelAr: 'الطلبات العامة',  adminOnly: true },
      { id: 'organizations',     icon: <Building2 size={17} />,    label: 'Organizations',    labelAr: 'المجموعات',       adminOnly: true },
      { id: 'system-settings',   icon: <Settings size={17} />,     label: 'System Settings',  labelAr: 'إعدادات النظام',  adminOnly: true },
    ],
  },
  {
    titleEn: 'Operations',
    titleAr: 'العمليات',
    adminOnly: false,
    items: [
      { id: 'dashboard',     icon: <LayoutDashboard size={17} />, label: 'Dashboard',      labelAr: 'الرئيسية',       adminOnly: false },
      { id: 'search',        icon: <Search size={17} />,          label: 'Store',       labelAr: 'المتجر',       adminOnly: false },
      { id: 'inventory',     icon: <Package size={17} />,         label: 'Inventory',      labelAr: 'المخزون',        adminOnly: false },
      { id: 'orders',        icon: <ShoppingCart size={17} />,    label: 'Orders',         labelAr: 'الطلبات',        adminOnly: false },
      { id: 'reports',       icon: <TrendingUp size={17} />,      label: 'Reports',        labelAr: 'التقارير',       adminOnly: false },
      { id: 'sales-reconciliation', icon: <TrendingUp size={17} />, label: 'Sales Reconciliation', labelAr: 'تسوية المبيعات', adminOnly: false },
      { id: 'purchases', icon: <ShoppingBag size={17} />, label: 'Purchases', labelAr: 'المشتريات', adminOnly: false },
      { id: 'fixed-expenses', icon: <Landmark size={17} />, label: 'Fixed Expenses', labelAr: 'المصروفات الثابتة', adminOnly: false },
      { id: 'financial-report', icon: <FileBarChart size={17} />, label: 'Financial Report', labelAr: 'التقرير المالي', adminOnly: false },
      { id: 'reports-center', icon: <FolderOpen size={17} />, label: 'Reports Center', labelAr: 'مركز التقارير', adminOnly: false },
      { id: 'accounting', icon: <Calculator size={17} />, label: 'Accounting', labelAr: 'الحسابات', adminOnly: false },
      { id: 'alerts',        icon: <Bell size={17} />,            label: 'Alerts',         labelAr: 'التنبيهات',      adminOnly: false },
      { id: 'shop-settings', icon: <QrCode size={17} />,          label: 'Shop Settings',  labelAr: 'إعدادات المحل',  adminOnly: false },
    ],
  },
];

// ══════════════════════════════════════════════════════════════════════
// OPERATIONS NAV (مجموعات قابلة للتوسّع لغير الأدمن)
// ══════════════════════════════════════════════════════════════════════
type OpChild = { labelEn: string; labelAr: string; page?: Page; section?: string; placeholder?: boolean };
type OpEntry =
  | { type: 'item'; id: Page; icon: React.ReactNode; labelEn: string; labelAr: string }
  | { type: 'group'; key: string; icon: React.ReactNode; labelEn: string; labelAr: string; homePage?: Page; homeSection?: string; children: OpChild[] };

const OPERATIONS: OpEntry[] = [
  { type: 'item', id: 'dashboard', icon: <LayoutDashboard size={17} />, labelEn: 'Dashboard', labelAr: 'الرئيسية' },
  { type: 'item', id: 'search',    icon: <Search size={17} />,          labelEn: 'Store',     labelAr: 'المتجر' },
  { type: 'item', id: 'inventory', icon: <Package size={17} />,         labelEn: 'Inventory', labelAr: 'المخزون' },
  { type: 'item', id: 'stock-adjustments', icon: <ClipboardCheck size={17} />, labelEn: 'Stock Count', labelAr: 'الجرد والتسويات' },
  { type: 'item', id: 'orders',    icon: <ShoppingCart size={17} />,    labelEn: 'Orders',    labelAr: 'الطلبات' },

  { type: 'group', key: 'sales', icon: <TrendingUp size={17} />, labelEn: 'Sales', labelAr: 'المبيعات', homePage: 'sales-reconciliation', children: [
    { labelEn: 'Sales',                labelAr: 'المبيعات',       section: 'sales' },
    { labelEn: 'POS',                  labelAr: 'نقاط البيع',     page: 'pos' },
    { labelEn: 'Sales Reconciliation', labelAr: 'تسوية المبيعات', page: 'sales-reconciliation' },
    { labelEn: 'Quotation',            labelAr: 'عرض سعر',        page: 'quotation' },
  ] },

  { type: 'group', key: 'purchases', icon: <ShoppingBag size={17} />, labelEn: 'Purchases', labelAr: 'المشتريات', homePage: 'purchase-invoices', children: [
    { labelEn: 'Purchase Invoices',       labelAr: 'فواتير المشتريات', page: 'purchase-invoices' },
    { labelEn: 'Marketplace',             labelAr: 'سوق التوريد',      page: 'purchases' },
    { labelEn: 'Purchase Orders',         labelAr: 'أوامر الشراء',    page: 'purchase-orders',         placeholder: true },
    { labelEn: 'Purchase Reconciliation', labelAr: 'تسوية المشتريات', page: 'purchase-reconciliation', placeholder: true },
    { labelEn: 'Purchase Returns',        labelAr: 'مرتجعات المشتريات', page: 'purchase-returns' },
    { labelEn: 'Supplier Payments',       labelAr: 'سداد الموردين',     page: 'supplier-payments' },
  ] },

  { type: 'group', key: 'reports', icon: <FileBarChart size={17} />, labelEn: 'Reports', labelAr: 'التقارير', homePage: 'reports-center', children: [
    { labelEn: 'Reports Center',   labelAr: 'مركز التقارير',  page: 'reports-center' },
    { labelEn: 'Business Analytics', labelAr: 'تحليلات الأعمال', page: 'business-analytics' },
    { labelEn: 'Monthly Financial', labelAr: 'التقرير المالي الشهري', page: 'monthly-financial' },
    { labelEn: 'Reports',          labelAr: 'التقارير',       page: 'reports' },
    { labelEn: 'Financial Report (Ops)', labelAr: 'التقرير التشغيلي (التوصيل)', page: 'financial-report' },
  ] },

  { type: 'group', key: 'accounting', icon: <Calculator size={17} />, labelEn: 'Accounting', labelAr: 'الحسابات', homePage: 'accounting', homeSection: 'dashboard', children: [
    { labelEn: 'Dashboard',      labelAr: 'لوحة التحكم',      section: 'dashboard' },
    { labelEn: 'Journal',        labelAr: 'القيود اليومية',   section: 'journal' },
    { labelEn: 'Treasury',       labelAr: 'الخزن والبنوك',    section: 'treasury' },
    { labelEn: 'Parties',        labelAr: 'العملاء والموردين', section: 'parties' },
    { labelEn: 'Chart',          labelAr: 'دليل الحسابات',    section: 'chart' },
    { labelEn: 'Opening Balances', labelAr: 'الأرصدة الافتتاحية', section: 'opening' },
    { labelEn: 'Ledger',         labelAr: 'كشف حساب',         section: 'ledger' },
    { labelEn: 'Trial Balance',  labelAr: 'ميزان المراجعة',   section: 'trial' },
    { labelEn: 'Statements',     labelAr: 'القوائم المالية',   section: 'statements' },
    { labelEn: 'Assets',         labelAr: 'الأصول',           section: 'assets' },
    { labelEn: 'Fixed Expenses', labelAr: 'المصروفات الثابتة', page: 'fixed-expenses' },
  ] },

  { type: 'item', id: 'alerts',        icon: <Bell size={17} />,   labelEn: 'Alerts',        labelAr: 'التنبيهات' },
  { type: 'item', id: 'shop-settings', icon: <QrCode size={17} />, labelEn: 'Shop Settings', labelAr: 'إعدادات الفرع' },
];

// صفحات «قريبًا» — مسموح بها للجميع دون صلاحية خاصة (حتى لا يعيد التوجيه طردها)
const PLACEHOLDER_PAGES: Page[] = ['sales', 'purchase-orders', 'purchase-reconciliation'];

// ══════════════════════════════════════════════════════════════════════
// BOTTOM NAV
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
// SMALL COMPONENTS
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
// COMMAND PALETTE (بحث عام Ctrl+K)
// ══════════════════════════════════════════════════════════════════════
type Cmd = { id: string; labelAr: string; labelEn: string; group: string; run: () => void };

function CommandPalette({ commands, onClose, lang }: { commands: Cmd[]; onClose: () => void; lang: 'ar' | 'en' }) {
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return commands;
    return commands.filter((c) => (c.labelAr + ' ' + c.labelEn + ' ' + c.group).toLowerCase().includes(s));
  }, [q, commands]);

  useEffect(() => { setIdx(0); }, [q]);
  useEffect(() => { activeRef.current?.scrollIntoView({ block: 'nearest' }); }, [idx]);

  const run = (c?: Cmd) => { if (c) { c.run(); onClose(); } };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); run(filtered[idx]); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-start justify-center pt-[12vh] px-4" dir="rtl" onClick={onClose}>
      <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800">
          <Search size={16} className="text-slate-500 flex-shrink-0" />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder="ابحث عن صفحة أو قسم…" className="flex-1 bg-transparent text-white text-sm outline-none placeholder:text-slate-600" />
          <kbd className="text-[10px] text-slate-500 border border-slate-700 rounded px-1.5 py-0.5 flex-shrink-0">Esc</kbd>
        </div>
        <div className="max-h-[52vh] overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-4 py-6 text-center text-slate-500 text-sm">لا توجد نتائج</div>
          ) : (
            filtered.map((c, i) => (
              <button
                key={c.id}
                ref={i === idx ? activeRef : null}
                onMouseEnter={() => setIdx(i)}
                onClick={() => run(c)}
                className={`w-full flex items-center gap-2 px-4 py-2.5 text-right transition-colors ${i === idx ? 'bg-blue-600 text-[#fff]' : 'text-slate-300 hover:bg-slate-800/60'}`}
              >
                <span className="flex-1 text-sm font-medium">{lang === 'ar' ? c.labelAr : c.labelEn}</span>
                <span className={`text-[10px] ${i === idx ? 'text-blue-100' : 'text-slate-500'}`}>{c.group}</span>
              </button>
            ))
          )}
        </div>
        <div className="px-4 py-2 border-t border-slate-800 flex items-center gap-3 text-[10px] text-slate-500">
          <span>↑↓ للتنقّل</span><span>↵ للفتح</span><span>Ctrl/⌘ + K</span>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// MAIN LAYOUT
// ══════════════════════════════════════════════════════════════════════

export default function Layout({ page, setPage, accSection, setAccSection, children }: LayoutProps) {
  const { signOut, isAdmin, ownedShopId, permissions, branches } = useAuth();
  const { lang, setLang, t, isRTL }       = useLang();
  const [sidebarOpen, setSidebarOpen]     = useState(false);
  const [showMore,    setShowMore]         = useState(false);
  const [cmdOpen,     setCmdOpen]          = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // فتح/إغلاق البحث العام بـ Ctrl/⌘ + K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); setCmdOpen((v) => !v); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // قائمة وجهات البحث العام (صفحات + أقسام الحسابات) حسب الصلاحيات
  const commands: Cmd[] = useMemo(() => {
    const out: Cmd[] = [];
    const canP = (id: Page) => isAdmin || !permissions || permissions.includes(id);
    if (isAdmin) {
      navSections.filter((s) => s.adminOnly).forEach((s) => s.items.filter((i) => i.adminOnly).forEach((i) => {
        out.push({ id: i.id, labelAr: i.labelAr, labelEn: i.label, group: 'الإدارة', run: () => { setPage(i.id); setSidebarOpen(false); } });
      }));
    } else {
      OPERATIONS.forEach((entry) => {
        if (entry.type === 'item') {
          if (!canP(entry.id)) return;
          out.push({ id: entry.id, labelAr: entry.labelAr, labelEn: entry.labelEn, group: 'العمليات', run: () => { setPage(entry.id); setSidebarOpen(false); } });
        } else {
          const accOk = !permissions || permissions.includes('accounting');
          entry.children.forEach((c) => {
            if (c.section) {
              if (!accOk) return;
              out.push({ id: `${entry.key}:${c.section}`, labelAr: c.labelAr, labelEn: c.labelEn, group: entry.labelAr, run: () => { setAccSection?.(c.section!); setPage('accounting'); setSidebarOpen(false); } });
            } else {
              const ok = c.placeholder || !permissions || permissions.includes(c.page!);
              if (!ok) return;
              out.push({ id: c.page!, labelAr: c.labelAr, labelEn: c.labelEn, group: entry.labelAr, run: () => { setPage(c.page!); setSidebarOpen(false); } });
            }
          });
        }
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, permissions]);

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

  useEffect(() => {
    if (!isAdmin && permissions && !permissions.includes(page) && !PLACEHOLDER_PAGES.includes(page)) {
      if (permissions[0]) setPage(permissions[0] as Page);
    }
  }, [permissions, isAdmin, page]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;
  const bottomItems = isAdmin ? adminBottomItems : shopBottomItems;

  // عنوان الصفحة الحالية بحسب اللغة
  const currentPageTitle = pageTitles[page]
    ? (lang === 'ar' ? pageTitles[page].ar : pageTitles[page].en)
    : page;

  // ─── Sidebar ──────────────────────────────────────────────
  const Sidebar = () => {
    const visibleSections = isAdmin
      ? navSections.filter((s) => s.adminOnly)
      : navSections.filter((s) => !s.adminOnly);

    return (
      <div className="flex flex-col h-full overflow-hidden">

        {/* Logo */}
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

        {/* Nav */}
        <nav className="flex-1 min-h-0 px-2 py-3 overflow-y-auto space-y-0.5">
          {isAdmin ? (
            visibleSections.map((section, idx) => {
              const visibleItems = section.items.filter((item) => item.adminOnly);
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
            })
          ) : (
            <div>
              <SectionLabel label={t('Operations', 'العمليات')} />
              <div className="space-y-0.5 px-1">
                {OPERATIONS.map((entry) => {
                  // عنصر مفرد
                  if (entry.type === 'item') {
                    if (permissions && !permissions.includes(entry.id)) return null;
                    return (
                      <NavButton
                        key={entry.id}
                        item={{ id: entry.id, icon: entry.icon, label: entry.labelEn, labelAr: entry.labelAr, adminOnly: false }}
                        isActive={page === entry.id}
                        label={t(entry.labelEn, entry.labelAr)}
                        onClick={() => { setPage(entry.id); setSidebarOpen(false); }}
                      />
                    );
                  }
                  // مجموعة قابلة للتوسّع
                  const isAcc = !!entry.homeSection;
                  const accOk = !permissions || permissions.includes('accounting');     // صلاحية الوصول للأقسام الداخلية للحسابات
                  const anyRealChild = entry.children.some((c) => c.page && !c.placeholder && (!permissions || permissions.includes(c.page)));
                  const groupVisible = isAcc ? (accOk || anyRealChild) : anyRealChild;
                  if (!groupVisible) return null;

                  const childActive = (c: OpChild) =>
                    c.section ? (page === 'accounting' && (accSection || 'journal') === c.section) : (page === c.page);
                  const groupActive = entry.children.some(childActive);
                  const childVisible = (c: OpChild) =>
                    c.section ? accOk : (c.placeholder ? true : (!permissions || permissions.includes(c.page!)));
                  const onParent = () => {
                    if (entry.homeSection) { setAccSection?.(entry.homeSection); setPage('accounting'); }
                    else if (entry.homePage) { setPage(entry.homePage); }
                    setSidebarOpen(false);
                  };

                  return (
                    <div key={entry.key} className="space-y-0.5">
                      <NavButton
                        item={{ id: (entry.homePage || 'accounting') as Page, icon: entry.icon, label: entry.labelEn, labelAr: entry.labelAr, adminOnly: false }}
                        isActive={groupActive}
                        label={t(entry.labelEn, entry.labelAr)}
                        onClick={onParent}
                      />
                      {groupActive && (
                        <div className="mr-4 pr-2 border-r-2 border-slate-700/50 space-y-0.5">
                          {entry.children.filter(childVisible).map((c, i) => {
                            const active = childActive(c);
                            return (
                              <button
                                key={i}
                                onClick={() => { if (c.section) { setAccSection?.(c.section); setPage('accounting'); } else { setPage(c.page!); } setSidebarOpen(false); }}
                                className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${active ? 'bg-blue-500/15 text-blue-300' : 'text-slate-500 hover:text-slate-200 hover:bg-slate-800/50'}`}
                              >
                                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${active ? 'bg-blue-400' : 'bg-slate-600'}`} />
                                <span className="flex-1 text-right">{t(c.labelEn, c.labelAr)}</span>
                                {c.placeholder && <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-slate-700/50 text-slate-400 flex-shrink-0">قريبًا</span>}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </nav>

        {/* Footer */}
        <div
          className="flex-shrink-0 px-3 py-4 border-t border-slate-700/50 space-y-2"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          {/* تبديل الثيم (فاتح | داكن) */}
          <div className="flex items-center justify-between gap-2 bg-slate-800 rounded-xl px-3 py-2">
            <span className="text-slate-400 text-xs font-medium">{t('Theme', 'المظهر')}</span>
            <ThemeToggle />
          </div>

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

    // العناصر الثابتة غير القابلة للتنقل
    const infoItems = [
      { icon: <User size={18} />,           labelEn: 'Profile',          labelAr: 'الملف الشخصي',   onPress: null },
      { icon: <Bell size={18} />,           labelEn: 'Notifications',    labelAr: 'الإشعارات',      onPress: null,
        badge: unreadCount > 0 ? unreadCount : null },
      { icon: <HeadphonesIcon size={18} />, labelEn: 'Support Center',   labelAr: 'مركز الدعم',     onPress: null },
      { icon: <Lock size={18} />,           labelEn: 'Privacy Policy',   labelAr: 'سياسة الخصوصية', onPress: null },
      { icon: <Info size={18} />,           labelEn: 'About MIHWAR',     labelAr: 'عن محور',         onPress: null },
    ];

    const navigableItems = !isAdmin ? [
      {
        icon: <QrCode size={18} />,
        labelEn: 'Shop Settings & QR',
        labelAr: 'إعدادات المحل والـ QR',
        onPress: () => { setShowMore(false); setPage('shop-settings'); },
      },
    ] : [];

    const label = (en: string, ar: string) => lang === 'ar' ? ar : en;

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
          dir={isRTL ? 'rtl' : 'ltr'}
        >
          {/* Handle */}
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 rounded-full bg-slate-700" />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700/50">
            <span className="text-white font-semibold text-base">
              {label('More', 'المزيد')}
            </span>
            <button
              onClick={() => setShowMore(false)}
              className="text-slate-400 hover:text-white p-1 active:scale-90 transition-transform"
            >
              <X size={18} />
            </button>
          </div>

          {/* Navigable items (مثل إعدادات المحل) */}
          {navigableItems.length > 0 && (
            <div className="px-4 pt-3 pb-1 space-y-1">
              {navigableItems.map((item) => (
                <button
                  key={item.labelEn}
                  onClick={item.onPress ?? undefined}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl bg-blue-600/10 border border-blue-500/20 text-blue-400 hover:bg-blue-600/20 active:bg-blue-600/30 transition-colors text-sm font-bold"
                >
                  <span>{item.icon}</span>
                  <span className="flex-1 text-start">{label(item.labelEn, item.labelAr)}</span>
                  <ChevronRight size={14} className={isRTL ? 'rotate-180' : ''} />
                </button>
              ))}
            </div>
          )}

          {/* Info items */}
          <div className="px-4 py-2 space-y-1">
            {infoItems.map((item) => (
              <button
                key={item.labelEn}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-slate-300 hover:bg-slate-800 active:bg-slate-700 transition-colors text-sm font-medium relative"
                onClick={() => setShowMore(false)}
              >
                <span className="text-slate-500">{item.icon}</span>
                <span className="flex-1 text-start">{label(item.labelEn, item.labelAr)}</span>
                {'badge' in item && item.badge && (
                  <span className="w-5 h-5 bg-red-500 rounded-full text-[10px] text-white flex items-center justify-center font-bold">
                    {item.badge > 9 ? '9+' : item.badge}
                  </span>
                )}
                <ChevronRight size={14} className={`text-slate-600 ${isRTL ? 'rotate-180' : ''}`} />
              </button>
            ))}
          </div>

          {/* Divider */}
          <div className="mx-4 border-t border-slate-700/40 my-1" />

          {/* Theme + Language + Logout */}
          <div className="px-4 pb-2 space-y-1">
            {/* تبديل الثيم داخل قائمة المزيد (للجوال) */}
            <div className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-slate-300 text-sm font-medium">
              <span className="flex-1 text-start">{label('Theme', 'المظهر')}</span>
              <ThemeToggle />
            </div>
            <button
              onClick={() => { setLang(lang === 'en' ? 'ar' : 'en'); setShowMore(false); }}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-slate-300 hover:bg-slate-800 active:bg-slate-700 transition-colors text-sm font-medium"
            >
              <Globe size={18} className="text-slate-500" />
              <span className="flex-1 text-start">{lang === 'en' ? 'العربية' : 'English'}</span>
              <ChevronRight size={14} className={`text-slate-600 ${isRTL ? 'rotate-180' : ''}`} />
            </button>
            <button
              onClick={() => { setShowMore(false); signOut(); }}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-red-400 hover:bg-red-500/10 active:bg-red-500/20 transition-colors text-sm font-medium"
            >
              <LogOut size={18} />
              <span className="flex-1 text-start">{label('Logout', 'تسجيل الخروج')}</span>
            </button>
          </div>

        </div>
      </>
    );
  };

  // ─── Mobile Bottom Navigation Bar ────────────────────────
  const BottomNav = () => {
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

      {/* البحث العام Ctrl+K */}
      {cmdOpen && <CommandPalette commands={commands} onClose={() => setCmdOpen(false)} lang={lang} />}

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
            className="lg:hidden text-slate-400 active:scale-90 transition-transform"
          >
            <Menu size={22} />
          </button>

          {/* عنوان الصفحة الحالية — عربي أو إنجليزي بحسب اللغة المختارة */}
          <h1 className="text-white font-bold text-lg">
            {currentPageTitle}
          </h1>

          <div className="flex items-center gap-3">
            {/* بحث عام (Ctrl/⌘ + K) */}
            <button
              onClick={() => setCmdOpen(true)}
              title="بحث سريع (Ctrl/⌘ + K)"
              className="flex items-center gap-2 bg-slate-800 border border-slate-700 hover:border-slate-600 px-3 py-1.5 rounded-xl text-xs text-slate-400 hover:text-slate-200 transition-colors"
            >
              <Search size={15} />
              <span className="hidden sm:inline">بحث</span>
              <kbd className="hidden md:inline text-[10px] text-slate-500 border border-slate-700 rounded px-1 py-0.5">Ctrl K</kbd>
            </button>
            {/* Notification Bell */}
            <BranchSwitcher />
            <NotificationBell />
            <div className="hidden md:flex items-center gap-2 bg-slate-800 border border-slate-700 px-3 py-1.5 rounded-xl text-xs text-slate-300">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              {isAdmin
                ? t('System Admin', 'مدير النظام')
                : ((branches && branches.length > 1) ? t('Group Manager', 'مدير المجموعة') : t('Shop User', 'مستخدم الفرع'))}
            </div>
          </div>
        </header>

        {/* Main content */}
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
