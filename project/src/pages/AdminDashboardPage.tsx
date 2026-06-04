import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useLang } from '../context/LanguageContext';
import {
  Store,
  Package,
  ShoppingCart,
  CheckCircle,
  Plus,
  Clock,
  XCircle,
  DollarSign,
  Users,
  TrendingUp,
  ArrowLeftRight,
  Shield,
  Globe,
  LayoutGrid,
  Activity,
  ChevronRight,
  Zap,
  MessageCircle,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

type OrderStatus = 'pending' | 'approved' | 'completed' | 'rejected';

type RichOrder = {
  id: number;
  status: OrderStatus;
  total_amount: number;
  created_at: string;
  from_shop: { shop_name: string } | null;
  to_shop: { shop_name: string } | null;
};

type TopShop = {
  id: number;
  shop_name: string;
  order_count: number;
};

type Stats = {
  shops: number;
  active: number;
  products: number;
  orders: number;
  users: number;
  pending: number;
  approved: number;
  completed: number;
  rejected: number;
  totalAmount: number;
};

// ─────────────────────────────────────────────────────────────
// CONSTANTS — status colors (language-agnostic)
// ─────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<OrderStatus, string> = {
  pending:   'bg-amber-500/10 text-amber-400 border border-amber-500/20',
  approved:  'bg-blue-500/10 text-blue-400 border border-blue-500/20',
  completed: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
  rejected:  'bg-red-500/10 text-red-400 border border-red-500/20',
};

const STATUS_DOT: Record<OrderStatus, string> = {
  pending:   'bg-amber-400',
  approved:  'bg-blue-400',
  completed: 'bg-emerald-400',
  rejected:  'bg-red-400',
};

// ─────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────

export default function AdminDashboardPage() {

  // Task 1: connect LanguageContext
  const { t, isRTL } = useLang();

  const [stats, setStats] = useState<Stats>({
    shops: 0, active: 0, products: 0, orders: 0, users: 0,
    pending: 0, approved: 0, completed: 0, rejected: 0, totalAmount: 0,
  });

  const [recentOrders, setRecentOrders] = useState<RichOrder[]>([]);
  const [recentShops,  setRecentShops]  = useState<{ id: number; shop_name: string; is_active: boolean }[]>([]);
  const [topShops,     setTopShops]     = useState<TopShop[]>([]);

  // Task 3: added whatsapp to newShop state
  const [newShop, setNewShop] = useState({
    shop_name: '',
    phone: '',
    city: '',
    whatsapp: '',
  });

  const [loading, setLoading] = useState(false);

  useEffect(() => { loadDashboard(); }, []);

  const loadDashboard = async () => {
    try {
      const [
        { count: shopsCount },
        { count: activeCount },
        { count: productsCount },
        { count: ordersCount },
        { count: usersCount },
        { data: ordersData,   error: ordersError },
        { data: latestOrders, error: recentOrdersError },
        { data: latestShops },
        { data: allShops },
      ] = await Promise.all([
        supabase.from('shops').select('*',    { count: 'exact', head: true }),
        supabase.from('shops').select('*',    { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('products').select('*', { count: 'exact', head: true }),
        supabase.from('orders').select('*',   { count: 'exact', head: true }),
        supabase.from('profiles').select('*', { count: 'exact', head: true }),
        supabase.from('orders').select('*'),
        supabase
          .from('orders')
          .select(`
            id, status, total_amount, created_at,
            from_shop:shops!orders_from_shop_id_fkey(shop_name),
            to_shop:shops!orders_to_shop_id_fkey(shop_name)
          `)
          .order('created_at', { ascending: false })
          .limit(10),
        supabase.from('shops').select('*').order('created_at', { ascending: false }).limit(10),
        supabase.from('shops').select('id, shop_name'),
      ]);

      console.log('ORDERS DATA:', ordersData);
      console.log('ORDERS ERROR:', ordersError);
      console.log('RECENT ORDERS ERROR:', recentOrdersError);

      const pending     = ordersData?.filter(o => o.status === 'pending').length   || 0;
      const approved    = ordersData?.filter(o => o.status === 'approved').length  || 0;
      const completed   = ordersData?.filter(o => o.status === 'completed').length || 0;
      const rejected    = ordersData?.filter(o => o.status === 'rejected').length  || 0;
      const totalAmount = ordersData?.reduce((sum, o) => sum + Number(o.total_amount || 0), 0) || 0;

      setStats({
        shops: shopsCount || 0, active: activeCount || 0, products: productsCount || 0,
        orders: ordersCount || 0, users: usersCount || 0,
        pending, approved, completed, rejected, totalAmount,
      });

      setRecentOrders((latestOrders as RichOrder[]) || []);
      setRecentShops(latestShops || []);

      if (ordersData && allShops) {
        const shopMap = new Map<number, string>(
          (allShops as { id: number; shop_name: string }[]).map(s => [s.id, s.shop_name])
        );
        const countMap = new Map<number, number>();
        for (const order of ordersData) {
          if (order.from_shop_id) countMap.set(order.from_shop_id, (countMap.get(order.from_shop_id) || 0) + 1);
          if (order.to_shop_id)   countMap.set(order.to_shop_id,   (countMap.get(order.to_shop_id)   || 0) + 1);
        }
        const ranked: TopShop[] = Array.from(countMap.entries())
          .map(([id, order_count]) => ({ id, shop_name: shopMap.get(id) || `#${id}`, order_count }))
          .sort((a, b) => b.order_count - a.order_count)
          .slice(0, 5);
        setTopShops(ranked);
      }
    } catch (error) {
      console.error(error);
    }
  };

  // Task 3: createShop now saves whatsapp
  const createShop = async () => {
    if (!newShop.shop_name || !newShop.phone) {
      alert(t('Please enter the required data', 'أدخل البيانات'));
      return;
    }
    try {
      setLoading(true);
      const { error } = await supabase
        .from('shops')
        .insert({
          shop_name: newShop.shop_name,
          phone:     newShop.phone,
          city:      newShop.city,
          whatsapp:  newShop.whatsapp || null,
          is_active: true,
        });
      if (error) {
        console.error(error);
        alert(t('An error occurred', 'حدث خطأ'));
        return;
      }
      alert(t('Shop created successfully', 'تم إنشاء المحل'));
      setNewShop({ shop_name: '', phone: '', city: '', whatsapp: '' });
      loadDashboard();
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const currentDate = new Date().toLocaleDateString(isRTL ? 'ar-SA' : 'en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  // ─────────────────────────────────────────────────────────────
  // SUB-COMPONENTS (defined inside to access t())
  // ─────────────────────────────────────────────────────────────

  const StatCard = ({
    title, value, icon, accent, sub,
  }: {
    title: string; value: number | string;
    icon: React.ReactNode; accent: string; sub?: string;
  }) => (
    <div className="group relative bg-slate-900 border border-slate-800 rounded-3xl p-6 overflow-hidden hover:border-slate-700 hover:scale-[1.02] transition-all duration-300 cursor-default">
      <div className={`absolute -top-6 -right-6 w-24 h-24 rounded-full opacity-10 blur-2xl ${accent}`} />
      <div className="relative flex items-start justify-between mb-5">
        <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${accent} bg-opacity-15 border border-white/5`}>
          {icon}
        </div>
        <span className="text-xs text-slate-500 font-medium tracking-wide">{sub ?? ''}</span>
      </div>
      <div className="relative">
        <div className="text-3xl font-bold text-white tabular-nums">
          {typeof value === 'number' ? value.toLocaleString(isRTL ? 'ar-SA' : 'en-US') : value}
        </div>
        <div className="text-sm text-slate-400 mt-1">{title}</div>
      </div>
    </div>
  );

  const StatusPill = ({
    label, value, color, icon,
  }: {
    label: string; value: number; color: string; icon: React.ReactNode;
  }) => (
    <div className={`flex items-center justify-between rounded-2xl px-4 py-3 border ${color} hover:scale-[1.01] transition-all duration-200`}>
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-sm font-medium">{label}</span>
      </div>
      <span className="text-lg font-bold tabular-nums">{value.toLocaleString(isRTL ? 'ar-SA' : 'en-US')}</span>
    </div>
  );

  const QuickAction = ({
    label, desc, icon, accent, onClick,
  }: {
    label: string; desc: string; icon: React.ReactNode; accent: string; onClick?: () => void;
  }) => (
    <button
      onClick={onClick}
      className="group text-start w-full bg-slate-900 border border-slate-800 rounded-3xl p-5 hover:border-slate-600 hover:scale-[1.03] hover:bg-slate-800/70 transition-all duration-300"
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${accent} bg-opacity-15 border border-white/5 mb-3`}>
        {icon}
      </div>
      <div className="text-sm font-semibold text-white">{label}</div>
      <div className="text-xs text-slate-500 mt-0.5 leading-relaxed">{desc}</div>
      <div className="flex justify-end mt-3">
        <ChevronRight size={14} className={`text-slate-600 group-hover:text-slate-400 transition-colors ${isRTL ? 'rotate-180' : ''}`} />
      </div>
    </button>
  );

  // ─────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────

  return (
    <div
      dir={isRTL ? 'rtl' : 'ltr'}
      className="min-h-screen bg-slate-950 text-white"
      style={{ fontFamily: "'Tajawal', 'IBM Plex Sans Arabic', sans-serif" }}
    >
      {/* Noise texture overlay */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.025] z-0"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E\")",
        }}
      />

      {/* Task 2: max-w-[1800px] instead of max-w-screen-xl */}
      <div className="relative z-10 max-w-[1800px] mx-auto p-6 lg:p-8 space-y-8">

        {/* ══════ SECTION 1 — HEADER ══════ */}
        <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs text-emerald-400 font-semibold tracking-widest uppercase">
                {t('Auto Parts Platform', 'منصة قطع الغيار')}
              </span>
            </div>
            <h1 className="text-4xl font-black tracking-tight leading-none">
              {t('Platform Control Panel', 'لوحة تحكم المنصة')}
            </h1>
            <p className="text-slate-400 mt-2 text-sm leading-relaxed max-w-md">
              {t('Manage shops, users, inventory, and orders from one place', 'إدارة المحلات والمستخدمين والمخزون والطلبات من مكان واحد')}
            </p>
          </div>

          <div className="flex flex-col items-start sm:items-end gap-1">
            <div className="flex items-center gap-2 text-slate-400 text-sm">
              <Clock size={13} />
              <span>{currentDate}</span>
            </div>
            <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-3 py-1">
              <Activity size={11} className="text-emerald-400" />
              <span className="text-emerald-400 text-xs font-medium">
                {t('System operating normally', 'النظام يعمل بشكل طبيعي')}
              </span>
            </div>
          </div>
        </header>

        {/* ══════ SECTION 2 — MAIN KPI CARDS ══════ */}
        <section>
          <div className="flex items-center gap-2 mb-5">
            <Zap size={16} className="text-amber-400" />
            <h2 className="text-sm font-semibold text-slate-400 tracking-wide uppercase">
              {t('Key Indicators', 'المؤشرات الرئيسية')}
            </h2>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
            <StatCard
              title={t('Total Shops', 'إجمالي المحلات')}
              value={stats.shops}
              accent="bg-blue-500"
              icon={<Store size={18} className="text-blue-400" />}
            />
            <StatCard
              title={t('Active Shops', 'المحلات النشطة')}
              value={stats.active}
              accent="bg-emerald-500"
              icon={<CheckCircle size={18} className="text-emerald-400" />}
              sub={stats.shops > 0 ? `${Math.round((stats.active / stats.shops) * 100)}%` : ''}
            />
            <StatCard
              title={t('Total Users', 'إجمالي المستخدمين')}
              value={stats.users}
              accent="bg-violet-500"
              icon={<Users size={18} className="text-violet-400" />}
            />
            <StatCard
              title={t('Total Products', 'إجمالي المنتجات')}
              value={stats.products}
              accent="bg-amber-500"
              icon={<Package size={18} className="text-amber-400" />}
            />
            <StatCard
              title={t('Total Orders', 'إجمالي الطلبات')}
              value={stats.orders}
              accent="bg-pink-500"
              icon={<ShoppingCart size={18} className="text-pink-400" />}
            />
          </div>
        </section>

        {/* ══════ ORDER STATUS BREAKDOWN + REVENUE ══════ */}
        <section className="grid md:grid-cols-2 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">
            <h3 className="text-base font-bold mb-4 flex items-center gap-2">
              <ShoppingCart size={16} className="text-slate-400" />
              {t('Order Status Distribution', 'توزيع حالات الطلبات')}
            </h3>
            <div className="space-y-3">
              <StatusPill
                label={t('Pending', 'معلق')}
                value={stats.pending}
                color="bg-amber-500/5 text-amber-300 border-amber-500/15"
                icon={<Clock size={14} className="text-amber-400" />}
              />
              <StatusPill
                label={t('Approved', 'مقبول')}
                value={stats.approved}
                color="bg-blue-500/5 text-blue-300 border-blue-500/15"
                icon={<CheckCircle size={14} className="text-blue-400" />}
              />
              <StatusPill
                label={t('Completed', 'مكتمل')}
                value={stats.completed}
                color="bg-emerald-500/5 text-emerald-300 border-emerald-500/15"
                icon={<CheckCircle size={14} className="text-emerald-400" />}
              />
              <StatusPill
                label={t('Rejected', 'مرفوض')}
                value={stats.rejected}
                color="bg-red-500/5 text-red-300 border-red-500/15"
                icon={<XCircle size={14} className="text-red-400" />}
              />
            </div>
          </div>

          <div className="relative bg-slate-900 border border-slate-800 rounded-3xl p-6 overflow-hidden flex flex-col justify-between">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-900/20 via-transparent to-transparent pointer-events-none" />
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent" />

            <div className="relative">
              <div className="flex items-center gap-2 mb-6">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center">
                  <DollarSign size={16} className="text-emerald-400" />
                </div>
                <span className="text-sm font-semibold text-slate-400">
                  {t('Total Order Value', 'إجمالي قيمة الطلبات')}
                </span>
              </div>

              <div className="text-5xl font-black text-emerald-400 tabular-nums leading-none">
                {stats.totalAmount.toLocaleString(isRTL ? 'ar-SA' : 'en-US')}
              </div>
              <div className="text-slate-500 text-sm mt-2">{t('Saudi Riyal', 'ريال سعودي')}</div>
            </div>

            <div className="relative mt-6 pt-4 border-t border-slate-800 grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-slate-500 mb-0.5">{t('Completion Rate', 'معدل الإكمال')}</div>
                <div className="text-lg font-bold text-white">
                  {stats.orders > 0 ? `${Math.round((stats.completed / stats.orders) * 100)}%` : '—'}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-0.5">{t('Rejection Rate', 'معدل الرفض')}</div>
                <div className="text-lg font-bold text-white">
                  {stats.orders > 0 ? `${Math.round((stats.rejected / stats.orders) * 100)}%` : '—'}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ══════ SECTION 3 — QUICK ACTIONS ══════ */}
        <section>
          <div className="flex items-center gap-2 mb-5">
            <LayoutGrid size={16} className="text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-400 tracking-wide uppercase">
              {t('Quick Actions', 'الإجراءات السريعة')}
            </h2>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <QuickAction
              label={t('Add Shop', 'إضافة محل')}
              desc={t('Register a new shop on the platform', 'تسجيل محل جديد في المنصة')}
              accent="bg-blue-500"
              icon={<Plus size={18} className="text-blue-400" />}
              onClick={() => document.getElementById('create-shop-section')?.scrollIntoView({ behavior: 'smooth' })}
            />
            <QuickAction
              label={t('Manage Shops', 'إدارة المحلات')}
              desc={t('View and edit all shops', 'عرض وتعديل جميع المحلات')}
              accent="bg-emerald-500"
              icon={<Store size={18} className="text-emerald-400" />}
            />
            <QuickAction
              label={t('Manage Users', 'إدارة المستخدمين')}
              desc={t('Manage user accounts', 'إدارة حسابات المستخدمين')}
              accent="bg-violet-500"
              icon={<Users size={18} className="text-violet-400" />}
            />
            <QuickAction
              label={t('Manage Permissions', 'إدارة الصلاحيات')}
              desc={t('Configure user roles', 'ضبط أدوار المستخدمين')}
              accent="bg-rose-500"
              icon={<Shield size={18} className="text-rose-400" />}
            />
            <QuickAction
              label={t('Global Inventory', 'المخزون العالمي')}
              desc={t('Track products across all shops', 'متابعة منتجات جميع المحلات')}
              accent="bg-amber-500"
              icon={<Globe size={18} className="text-amber-400" />}
            />
            <QuickAction
              label={t('Global Orders', 'الطلبات العالمية')}
              desc={t('View all platform orders', 'عرض جميع طلبات المنصة')}
              accent="bg-pink-500"
              icon={<ShoppingCart size={18} className="text-pink-400" />}
            />
          </div>
        </section>

        {/* ══════ SECTION 4 — RECENT ACTIVITY + RECENT SHOPS ══════ */}
        <section className="grid lg:grid-cols-2 gap-6">

          {/* Activity Timeline */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Activity size={16} className="text-slate-400" />
                <h3 className="font-bold text-base">{t('Recent Activity', 'آخر النشاطات')}</h3>
              </div>
              <span className="text-xs text-slate-500 border border-slate-700 rounded-full px-2.5 py-1">
                {t('Last 10', 'آخر ١٠')}
              </span>
            </div>

            {recentOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-600">
                <ShoppingCart size={32} className="mb-3 opacity-40" />
                <p className="text-sm">{t('No orders yet', 'لا توجد طلبات حتى الآن')}</p>
              </div>
            ) : (
              <div className="relative">
                <div className="absolute start-[18px] top-2 bottom-2 w-px bg-slate-800" />
                <div className="space-y-4">
                  {recentOrders.map((order) => {
                    const status = (order.status || 'pending') as OrderStatus;
                    // Task 4: show "Unknown Shop" instead of —
                    const unknownLabel = t('Unknown Shop', 'محل غير معروف');
                    return (
                      <div key={order.id} className="flex gap-4 items-start">
                        <div className="relative z-10 shrink-0 mt-1">
                          <div className={`w-3 h-3 rounded-full ${STATUS_DOT[status]} ring-2 ring-slate-900`} />
                        </div>
                        <div className="flex-1 bg-slate-950/60 rounded-2xl px-4 py-3 border border-slate-800/60 hover:border-slate-700/60 transition-colors">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="font-mono text-slate-500 text-xs">
                              #{String(order.id).padStart(5, '0')}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLOR[status]}`}>
                                {status === 'pending'   ? t('Pending',   'معلق')   :
                                 status === 'approved'  ? t('Approved',  'مقبول')  :
                                 status === 'completed' ? t('Completed', 'مكتمل')  :
                                                          t('Rejected',  'مرفوض')}
                              </span>
                              <span className="text-white text-xs font-bold">
                                {Number(order.total_amount).toLocaleString(isRTL ? 'ar-SA' : 'en-US')} {t('SAR', 'ر.س')}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs">
                            <span className="text-blue-400 font-medium truncate max-w-[100px]">
                              {order.from_shop?.shop_name || unknownLabel}
                            </span>
                            <ArrowLeftRight size={10} className="shrink-0 text-slate-600" />
                            <span className="text-emerald-400 font-medium truncate max-w-[100px]">
                              {order.to_shop?.shop_name || unknownLabel}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Recent shops */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Store size={16} className="text-slate-400" />
                <h3 className="font-bold text-base">{t('Latest Added Shops', 'آخر المحلات المضافة')}</h3>
              </div>
              <span className="text-xs text-slate-500 border border-slate-700 rounded-full px-2.5 py-1">
                {t('Last 10', 'آخر ١٠')}
              </span>
            </div>

            {recentShops.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-600">
                <Store size={32} className="mb-3 opacity-40" />
                <p className="text-sm">{t('No shops yet', 'لا توجد محلات حتى الآن')}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {recentShops.map((shop, index) => (
                  <div
                    key={shop.id}
                    className="flex items-center justify-between bg-slate-950/60 rounded-2xl px-4 py-3 border border-slate-800/60 hover:border-slate-700/60 transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs text-slate-500 shrink-0 font-mono">
                        {index + 1}
                      </span>
                      <span className="text-sm font-medium text-white">{shop.shop_name}</span>
                    </div>
                    <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${
                      shop.is_active
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                        : 'bg-slate-700/30 text-slate-500 border-slate-700'
                    }`}>
                      {shop.is_active ? t('Active', 'نشط') : t('Stopped', 'متوقف')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ══════ SECTION 5 — TOP SHOPS TABLE ══════ */}
        <section className="bg-slate-900 border border-slate-800 rounded-3xl p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <TrendingUp size={16} className="text-amber-400" />
              <h3 className="font-bold text-base">{t('Most Active Shops', 'أكثر المحلات نشاطاً')}</h3>
            </div>
            <span className="text-xs text-slate-500 border border-slate-700 rounded-full px-2.5 py-1">
              {t('Top 5', 'أفضل ٥')}
            </span>
          </div>

          {topShops.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-600">
              <TrendingUp size={32} className="mb-3 opacity-40" />
              <p className="text-sm">{t('Insufficient data', 'لا توجد بيانات كافية')}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800">
                    <th className="text-start text-xs text-slate-500 font-semibold tracking-wide pb-3 w-12">{t('Rank', 'رتبة')}</th>
                    <th className="text-start text-xs text-slate-500 font-semibold tracking-wide pb-3">{t('Shop Name', 'اسم المحل')}</th>
                    <th className="text-end text-xs text-slate-500 font-semibold tracking-wide pb-3 w-32">{t('Orders', 'الطلبات')}</th>
                    <th className="text-end text-xs text-slate-500 font-semibold tracking-wide pb-3 w-40">{t('Activity', 'النشاط')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {topShops.map((shop, index) => {
                    const pct = Math.round((shop.order_count / (topShops[0]?.order_count || 1)) * 100);
                    const rankColors = [
                      'bg-amber-500/20 text-amber-300 border-amber-500/30',
                      'bg-slate-400/20 text-slate-300 border-slate-400/30',
                      'bg-orange-700/20 text-orange-400 border-orange-700/30',
                      'bg-slate-800 text-slate-500 border-slate-700',
                      'bg-slate-800 text-slate-500 border-slate-700',
                    ];
                    return (
                      <tr key={shop.id} className="hover:bg-slate-800/30 transition-colors group">
                        <td className="py-3.5 pe-1">
                          <span className={`inline-flex w-7 h-7 items-center justify-center rounded-full text-xs font-bold border ${rankColors[index]}`}>
                            {index + 1}
                          </span>
                        </td>
                        <td className="py-3.5">
                          <span className="font-medium text-white">{shop.shop_name}</span>
                        </td>
                        <td className="py-3.5 text-end">
                          <div className="flex items-center gap-1.5 justify-end">
                            <span className="font-bold text-white">{shop.order_count}</span>
                            <span className="text-slate-500 text-xs">{t('orders', 'طلب')}</span>
                          </div>
                        </td>
                        <td className="py-3.5 text-end">
                          <div className="flex items-center gap-2 justify-end">
                            <span className="text-xs text-slate-500 w-8 text-end">{pct}%</span>
                            <div className="w-24 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full bg-amber-400/70 transition-all duration-700"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ══════ CREATE SHOP SECTION ══════ */}
        <section
          id="create-shop-section"
          className="relative bg-slate-900 border border-slate-800 rounded-3xl p-6 overflow-hidden"
        >
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-500/40 to-transparent" />

          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-2xl bg-blue-500/15 border border-blue-500/20 flex items-center justify-center">
              <Plus size={18} className="text-blue-400" />
            </div>
            <div>
              <h3 className="font-bold text-base">{t('Add New Shop', 'إضافة محل جديد')}</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {t('Enter shop data to add it to the platform', 'أدخل بيانات المحل لإضافته إلى المنصة')}
              </p>
            </div>
          </div>

          {/* Task 3: 4-column grid with WhatsApp field */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 font-medium">{t('Shop Name', 'اسم المحل')} *</label>
              <input
                type="text"
                placeholder={isRTL ? 'مثال: محل أبو أحمد' : 'e.g. Ahmed Auto Parts'}
                value={newShop.shop_name}
                onChange={(e) => setNewShop({ ...newShop, shop_name: e.target.value })}
                className="w-full h-12 rounded-2xl bg-slate-950 border border-slate-700 px-4 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 font-medium">{t('Mobile Number', 'رقم الجوال')} *</label>
              <input
                type="text"
                placeholder="05xxxxxxxx"
                value={newShop.phone}
                onChange={(e) => setNewShop({ ...newShop, phone: e.target.value })}
                className="w-full h-12 rounded-2xl bg-slate-950 border border-slate-700 px-4 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all"
                dir="ltr"
              />
            </div>

            {/* Task 3: WhatsApp field */}
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 font-medium flex items-center gap-1.5">
                <MessageCircle size={12} className="text-emerald-500" />
                {t('WhatsApp', 'واتساب')}
              </label>
              <input
                type="text"
                placeholder="05xxxxxxxx"
                value={newShop.whatsapp}
                onChange={(e) => setNewShop({ ...newShop, whatsapp: e.target.value })}
                className="w-full h-12 rounded-2xl bg-slate-950 border border-slate-700 px-4 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/20 transition-all"
                dir="ltr"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 font-medium">{t('City', 'المدينة')}</label>
              <input
                type="text"
                placeholder={isRTL ? 'مثال: الرياض' : 'e.g. Riyadh'}
                value={newShop.city}
                onChange={(e) => setNewShop({ ...newShop, city: e.target.value })}
                className="w-full h-12 rounded-2xl bg-slate-950 border border-slate-700 px-4 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all"
              />
            </div>
          </div>

          <button
            onClick={createShop}
            disabled={loading}
            className="h-12 px-8 rounded-2xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-sm transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] flex items-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                {t('Creating...', 'جاري الإنشاء...')}
              </>
            ) : (
              <>
                <Plus size={16} />
                {t('Create Shop', 'إنشاء محل')}
              </>
            )}
          </button>
        </section>

        {/* Footer */}
        <footer className="text-center text-xs text-slate-700 pb-4">
          {t('Auto Parts Platform — Admin Dashboard', 'منصة قطع الغيار — لوحة تحكم الإدارة')}
        </footer>

      </div>
    </div>
  );
}
