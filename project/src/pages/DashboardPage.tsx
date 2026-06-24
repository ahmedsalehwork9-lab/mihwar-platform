import { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from './lib/supabase';
import {
  Package, Boxes, DollarSign, RefreshCw,
  Store, TrendingUp, AlertTriangle,
  Activity, ShieldAlert, XCircle,
  Search, BarChart3, FileText, ChevronRight,
  ArrowUpRight, QrCode, Smartphone, Monitor, Star,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LanguageContext';
import { useNotifications } from '../context/NotificationContext';

type Product = {
  id: number;
  product_name: string;
  product_code: string;
  // fallback aliases for old rows
  part_name?: string;
  part_number?: string;
  brand: string;
  quantity: number;
  price: number;
};

type TopProduct = {
  product_id: number;
  product_name: string;
  product_code: string;
  total_ordered: number;
};

type QRStats = {
  total: number;
  thisMonth: number;
  today: number;
  mobileCount: number;
  desktopCount: number;
};

const BRAND_COLORS = ['#00A86B', '#0A4D68', '#f59e0b', '#8b5cf6', '#ef4444'] as const;

export default function DashboardPage() {
  const { user } = useAuth();
  const { t, isRTL } = useLang();
  const {
    lowStockItems,
    outOfStockItems,
    pendingOrders,
    totalCount,
  } = useNotifications();

  const [loading, setLoading]       = useState(true);
  const [shop, setShop]             = useState<any>(null);
  const [products, setProducts]     = useState<Product[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [qrStats, setQrStats]       = useState<QRStats>({
    total: 0, thisMonth: 0, today: 0, mobileCount: 0, desktopCount: 0,
  });
  const [stats, setStats] = useState({
    totalProducts: 0,
    totalInventory: 0,
    totalValue: 0,
  });

  const loadDashboard = useCallback(async () => {
    try {
      setLoading(true);
      if (!user) return;

      const { data: shopData } = await supabase
        .from('shops').select('*').eq('owner_id', user.id).maybeSingle();
      setShop(shopData);
      if (!shopData) return;

      const now       = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

      // ── جلب كل البيانات بالتوازي ──────────────────────────────────
      const [
        countResult,
        productsResult,
        qrTotalResult,
        qrMonthResult,
        qrTodayResult,
        qrDevicesResult,
        topProductsResult,
      ] = await Promise.all([

        // COUNT(*) حقيقي من قاعدة البيانات
        supabase
          .from('products')
          .select('*', { count: 'exact', head: true })
          .eq('shop_id', shopData.id),

        // بيانات المنتجات للعرض
        supabase
          .from('products')
          .select('id, product_name, product_code, brand, quantity, price')
          .eq('shop_id', shopData.id)
          .order('created_at', { ascending: false })
          .limit(1000),

        // إجمالي المسحات
        supabase
          .from('shop_qr_scans')
          .select('*', { count: 'exact', head: true })
          .eq('shop_id', shopData.id),

        // مسحات هذا الشهر
        supabase
          .from('shop_qr_scans')
          .select('*', { count: 'exact', head: true })
          .eq('shop_id', shopData.id)
          .gte('scanned_at', monthStart),

        // مسحات اليوم
        supabase
          .from('shop_qr_scans')
          .select('*', { count: 'exact', head: true })
          .eq('shop_id', shopData.id)
          .gte('scanned_at', todayStart),

        // أجهزة الزوار
        supabase
          .from('shop_qr_scans')
          .select('device_type')
          .eq('shop_id', shopData.id),

        // المنتجات الأكثر طلباً
        supabase
          .from('order_items')
          .select(`
            product_id,
            quantity,
            products!inner(product_name, product_code, shop_id)
          `)
          .eq('products.shop_id', shopData.id)
          .limit(200),
      ]);

      const exactCount = countResult.count ?? 0;
      const items: Product[] = productsResult.data || [];
      setProducts(items);

      const totalInventory = items.reduce((a, i) => a + (i.quantity || 0), 0);
      const totalValue     = items.reduce((a, i) => a + (i.quantity || 0) * (i.price || 0), 0);
      setStats({ totalProducts: exactCount, totalInventory, totalValue });

      // ── إحصائيات QR ───────────────────────────────────────────────
      const devices: { device_type: string }[] = qrDevicesResult.data || [];
      const mobileCount  = devices.filter(d => d.device_type === 'mobile').length;
      const desktopCount = devices.filter(d => d.device_type === 'desktop').length;

      setQrStats({
        total:        qrTotalResult.count  ?? 0,
        thisMonth:    qrMonthResult.count  ?? 0,
        today:        qrTodayResult.count  ?? 0,
        mobileCount,
        desktopCount,
      });

      // ── المنتجات الأكثر طلباً ──────────────────────────────────────
      const rawItems: any[] = topProductsResult.data || [];
      const productTotals: Record<number, { name: string; code: string; total: number }> = {};
      rawItems.forEach(item => {
        const pid  = item.product_id;
        const prod = item.products;
        if (!pid || !prod) return;
        if (!productTotals[pid]) {
          productTotals[pid] = {
            name:  prod.product_name ?? prod.part_name ?? '—',
            code:  prod.product_code ?? prod.part_number ?? '—',
            total: 0,
          };
        }
        productTotals[pid].total += item.quantity ?? 0;
      });
      const sorted = Object.entries(productTotals)
        .map(([id, v]) => ({ product_id: Number(id), product_name: v.name, product_code: v.code, total_ordered: v.total }))
        .sort((a, b) => b.total_ordered - a.total_ordered)
        .slice(0, 5);
      setTopProducts(sorted);

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  const lowStockCount      = lowStockItems.length;
  const outOfStockCount    = outOfStockItems.length;
  const pendingOrdersCount = pendingOrders.length;
  const criticalAlerts     = outOfStockCount + pendingOrdersCount;

  const brandCounts = useMemo(() =>
    products.reduce((acc, p) => {
      if (p.brand) acc[p.brand] = (acc[p.brand] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
    [products]
  );

  const topBrands    = useMemo(() => Object.entries(brandCounts).sort((a, b) => b[1] - a[1]).slice(0, 5), [brandCounts]);
  const totalBrands  = useMemo(() => topBrands.reduce((a, b) => a + b[1], 0), [topBrands]);
  const recentProducts = useMemo(() => products.slice(0, 5), [products]);

  // نسبة الجوال
  const totalDevices   = qrStats.mobileCount + qrStats.desktopCount;
  const mobilePct      = totalDevices > 0 ? Math.round((qrStats.mobileCount / totalDevices) * 100) : 0;
  const desktopPct     = totalDevices > 0 ? 100 - mobilePct : 0;

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-2 border-[#00A86B] border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-500 text-xs tracking-widest uppercase">
            {t('Loading Dashboard...', 'جارٍ تحميل لوحة التحكم...')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div dir={isRTL ? 'rtl' : 'ltr'} className="min-h-screen bg-slate-950 text-white pb-12">
      <div className="w-full max-w-none space-y-5 p-4 lg:p-8">

        {/* ── HEADER ── */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/50 pb-6">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-13 h-13 w-12 h-12 rounded-2xl bg-[#002B5B]/40 border border-[#002B5B]/60 flex items-center justify-center shrink-0 shadow-lg shadow-[#002B5B]/10">
              <Store size={24} className="text-[#00A86B]" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl lg:text-3xl font-black text-white tracking-tight truncate">
                {shop?.shop_name || t('My Store', 'متجري')}
              </h1>
              <div className="flex items-center gap-2 mt-1">
                <span className="flex h-2 w-2 rounded-full bg-[#00A86B] animate-pulse" />
                <p className="text-slate-400 text-xs font-medium uppercase tracking-wider">
                  {t('Operational Overview', 'النظرة التشغيلية')}
                </p>
              </div>
            </div>
          </div>
          <button
            onClick={loadDashboard}
            className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 border border-slate-700/50 rounded-xl px-4 py-2.5 transition-all active:scale-95 group self-start md:self-auto"
          >
            <RefreshCw size={16} className="text-slate-400 group-hover:rotate-180 transition-transform duration-500" />
            <span className="text-slate-300 text-sm font-semibold">{t('Sync Data', 'تزامن البيانات')}</span>
          </button>
        </div>

        {/* ── KPI CARDS ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[
            {
              label: t('Total Products', 'إجمالي المنتجات'),
              value: stats.totalProducts,
              sub:   t('Active SKUs', 'الأصناف النشطة'),
              icon:  Package,
              color: 'text-[#00A86B]',
              bg:    'bg-[#00A86B]/8',
              border:'border-[#00A86B]/20',
            },
            {
              label: t('Inventory Units', 'وحدات المخزون'),
              value: stats.totalInventory.toLocaleString(),
              sub:   t('In Stock', 'متوفر بالمخزن'),
              icon:  Boxes,
              color: 'text-[#0A4D68]',
              bg:    'bg-[#0A4D68]/20',
              border:'border-[#0A4D68]/30',
            },
            {
              label: t('Total Value', 'إجمالي القيمة'),
              value: stats.totalValue >= 100000
                ? `${(stats.totalValue / 1000).toFixed(1)}k`
                : stats.totalValue.toLocaleString(),
              sub:   t('Currency: SAR', 'العملة: ر.س'),
              icon:  DollarSign,
              color: 'text-amber-400',
              bg:    'bg-amber-500/8',
              border:'border-amber-500/20',
            },
            {
              label: t('System Alerts', 'تنبيهات النظام'),
              value: totalCount,
              sub:   t('Needs Attention', 'تحتاج إجراء'),
              icon:  ShieldAlert,
              color: 'text-red-400',
              bg:    'bg-red-500/8',
              border:'border-red-500/20',
            },
          ].map((card, i) => (
            <div
              key={i}
              className={`relative overflow-hidden min-h-[150px] bg-slate-900/60 backdrop-blur-sm rounded-2xl p-5 lg:p-6 border ${card.border} transition-all hover:border-white/10 hover:-translate-y-0.5 group`}
            >
              <div className="flex justify-between items-start mb-5">
                <div className={`p-3 rounded-xl ${card.bg} ${card.color}`}>
                  <card.icon size={22} />
                </div>
                <ArrowUpRight size={14} className="text-slate-700 group-hover:text-slate-400 transition-colors" />
              </div>
              <div className="text-3xl lg:text-4xl font-black text-white tabular-nums tracking-tight mb-2">
                {card.value}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-xs font-bold uppercase tracking-wide">{card.label}</span>
                <span className="text-slate-600 text-[10px] font-medium">{card.sub}</span>
              </div>
            </div>
          ))}
        </div>

        {/* ══════════════════════════════════════════════════════════════
            QR ANALYTICS — إحصائيات مسح الباركود
        ══════════════════════════════════════════════════════════════ */}
        <div className="bg-slate-900/40 border border-slate-800/50 rounded-2xl p-5 lg:p-6">

          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <QrCode size={16} className="text-emerald-400" />
              </div>
              <div>
                <span className="font-black text-white text-base">
                  {t('QR Code Analytics', 'إحصائيات باركود المحل')}
                </span>
                <p className="text-slate-500 text-[11px] mt-0.5">
                  {t('Visitors who scanned your shop QR code', 'الزوار الذين مسحوا باركود محلك')}
                </p>
              </div>
            </div>
            {qrStats.total > 0 && (
              <div className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-[10px] font-black text-emerald-400 uppercase tracking-widest">
                {t('Live', 'مباشر')}
              </div>
            )}
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            {[
              {
                label: t('Total Scans', 'إجمالي المسحات'),
                value: qrStats.total,
                icon:  <QrCode size={16} />,
                color: 'text-emerald-400',
                bg:    'bg-emerald-500/10 border-emerald-500/20',
              },
              {
                label: t('This Month', 'هذا الشهر'),
                value: qrStats.thisMonth,
                icon:  <TrendingUp size={16} />,
                color: 'text-blue-400',
                bg:    'bg-blue-500/10 border-blue-500/20',
              },
              {
                label: t('Today', 'اليوم'),
                value: qrStats.today,
                icon:  <Activity size={16} />,
                color: 'text-amber-400',
                bg:    'bg-amber-500/10 border-amber-500/20',
              },
              {
                label: t('Mobile Visitors', 'زوار الجوال'),
                value: totalDevices > 0 ? `${mobilePct}%` : '—',
                icon:  <Smartphone size={16} />,
                color: 'text-purple-400',
                bg:    'bg-purple-500/10 border-purple-500/20',
              },
            ].map((s, i) => (
              <div key={i} className={`rounded-2xl p-4 border ${s.bg} flex flex-col gap-2`}>
                <div className={`${s.color}`}>{s.icon}</div>
                <div className={`text-2xl font-black tabular-nums ${s.color}`}>{s.value}</div>
                <div className="text-slate-500 text-[10px] font-bold uppercase tracking-wider leading-tight">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Device breakdown */}
          {totalDevices > 0 && (
            <div className="bg-slate-800/40 rounded-2xl p-4 border border-slate-700/40">
              <p className="text-slate-400 text-[11px] font-bold uppercase tracking-widest mb-3">
                {t('Device Distribution', 'توزيع الأجهزة')}
              </p>
              <div className="flex items-center gap-4">
                {/* Bar */}
                <div className="flex-1 h-3 rounded-full bg-slate-700 overflow-hidden flex">
                  <div
                    className="h-full bg-purple-500 rounded-full transition-all duration-1000"
                    style={{ width: `${mobilePct}%` }}
                  />
                  <div
                    className="h-full bg-blue-500 transition-all duration-1000"
                    style={{ width: `${desktopPct}%` }}
                  />
                </div>
                {/* Labels */}
                <div className="flex items-center gap-4 shrink-0">
                  <div className="flex items-center gap-1.5">
                    <Smartphone size={12} className="text-purple-400" />
                    <span className="text-purple-400 text-xs font-black tabular-nums">{mobilePct}%</span>
                    <span className="text-slate-600 text-[10px]">{t('Mobile', 'جوال')}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Monitor size={12} className="text-blue-400" />
                    <span className="text-blue-400 text-xs font-black tabular-nums">{desktopPct}%</span>
                    <span className="text-slate-600 text-[10px]">{t('Desktop', 'دسكتوب')}</span>
                  </div>
                </div>
              </div>
              <p className="text-slate-600 text-[10px] mt-2 font-mono">
                {qrStats.mobileCount} {t('mobile', 'جوال')} · {qrStats.desktopCount} {t('desktop', 'دسكتوب')} · {totalDevices} {t('total', 'إجمالي')}
              </p>
            </div>
          )}

          {/* Empty state */}
          {qrStats.total === 0 && (
            <div className="h-24 flex flex-col items-center justify-center gap-2 border border-dashed border-slate-800 rounded-2xl">
              <QrCode size={20} className="text-slate-700" />
              <p className="text-slate-600 text-xs text-center">
                {t('No scans yet — share your QR code to start tracking', 'لا توجد مسحات بعد — شارك باركود محلك لتبدأ التتبع')}
              </p>
            </div>
          )}
        </div>

        {/* ── ALERT CENTER ── */}
        <div className="bg-slate-900/40 border border-slate-800/50 rounded-2xl p-5 lg:p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="font-bold text-white text-base tracking-tight">
                {t('Operational Alerts', 'تنبيهات التشغيل')}
              </span>
            </div>
            <div className="px-3 py-1 bg-slate-800 rounded-full text-[10px] font-bold text-slate-400 uppercase tracking-widest border border-slate-700">
              {totalCount} {t('Active Issues', 'مشاكل نشطة')}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              {
                label: t('Critical Action', 'إجراء حرج'),
                value: criticalAlerts,
                icon:  <XCircle size={18} />,
                bg:    'bg-red-500/10 hover:bg-red-500/15',
                border:'border-red-500/20',
                text:  'text-red-400',
              },
              {
                label: t('Low Stock', 'مخزون منخفض'),
                value: lowStockCount,
                icon:  <AlertTriangle size={18} />,
                bg:    'bg-amber-500/10 hover:bg-amber-500/15',
                border:'border-amber-500/20',
                text:  'text-amber-400',
              },
              {
                label: t('Out of Stock', 'نفد المخزون'),
                value: outOfStockCount,
                icon:  <ShieldAlert size={18} />,
                bg:    'bg-red-500/10 hover:bg-red-500/15',
                border:'border-red-500/20',
                text:  'text-red-400',
              },
              {
                label: t('Pending Orders', 'طلبات معلقة'),
                value: pendingOrdersCount,
                icon:  <Package size={18} />,
                bg:    'bg-[#002B5B]/30 hover:bg-[#002B5B]/40',
                border:'border-[#002B5B]/50',
                text:  'text-[#00A86B]',
              },
            ].map((card, i) => (
              <button
                key={i}
                className={`flex items-center gap-4 rounded-xl p-4 border transition-all active:scale-[0.98] cursor-pointer ${card.bg} ${card.border}`}
              >
                <div className={`${card.text} shrink-0`}>{card.icon}</div>
                <div className="text-start rtl:text-end min-w-0">
                  <div className={`text-2xl font-black ${card.text} tabular-nums leading-none`}>{card.value}</div>
                  <div className="text-slate-500 text-[11px] font-bold mt-1 uppercase tracking-tighter truncate">{card.label}</div>
                </div>
                <ChevronRight size={16} className={`${card.text} opacity-30 ms-auto shrink-0 rtl:rotate-180`} />
              </button>
            ))}
          </div>
        </div>

        {/* ── QUICK ACTIONS ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { icon: <Search size={20} />,   label: t('Search', 'بحث'),       color: 'text-[#00A86B]', bg: 'bg-[#00A86B]/5 hover:bg-[#00A86B]/10',   border: 'border-[#00A86B]/15'   },
            { icon: <Boxes size={20} />,    label: t('Inventory', 'المخزون'), color: 'text-[#0A4D68]', bg: 'bg-[#0A4D68]/15 hover:bg-[#0A4D68]/25',  border: 'border-[#0A4D68]/30'   },
            { icon: <Package size={20} />,  label: t('Orders', 'الطلبات'),    color: 'text-amber-400', bg: 'bg-amber-500/5 hover:bg-amber-500/10',     border: 'border-amber-500/10'   },
            { icon: <FileText size={20} />, label: t('Reports', 'التقارير'),  color: 'text-purple-400',bg: 'bg-purple-500/5 hover:bg-purple-500/10',   border: 'border-purple-500/10'  },
          ].map((action, i) => (
            <button
              key={i}
              className={`flex items-center gap-3 rounded-2xl p-4 border transition-all active:scale-95 ${action.bg} ${action.border}`}
            >
              <span className={action.color}>{action.icon}</span>
              <span className={`text-sm font-bold tracking-tight ${action.color}`}>{action.label}</span>
            </button>
          ))}
        </div>

        {/* ── LOW STOCK + RECENT ACTIVITY ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* Stock Depletion Risk */}
          <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-5 lg:p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <AlertTriangle size={18} className="text-amber-400" />
                <h3 className="font-bold text-white text-sm uppercase tracking-wider">
                  {t('Stock Depletion Risk', 'مخاطر نفاذ المخزون')}
                </h3>
              </div>
              <span className="text-[10px] font-mono text-slate-500 uppercase border border-slate-800 px-2 py-0.5 rounded-full">
                {lowStockCount} {t('items', 'صنف')}
              </span>
            </div>
            <div className="space-y-3">
              {lowStockItems.length === 0 ? (
                <div className="h-32 flex items-center justify-center text-slate-600 text-xs italic border border-dashed border-slate-800 rounded-xl">
                  {t('No inventory risks detected', 'لا توجد مخاطر على المخزون')}
                </div>
              ) : (
                lowStockItems.slice(0, 5).map(p => (
                  <div key={p.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-800/30 border border-slate-800/50 hover:border-slate-700/50 transition-colors">
                    <div className="min-w-0 flex-1">
                      <div className="text-white text-xs font-bold truncate">{(p as any).product_name ?? (p as any).part_name}</div>
                      <div className="text-slate-500 text-[10px] font-mono mt-0.5">{(p as any).product_code ?? (p as any).part_number ?? '—'}</div>
                    </div>
                    <span className="text-[11px] px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-400 font-black tabular-nums border border-amber-500/20 ms-3 shrink-0">
                      {p.quantity} {t('left', 'تبقي')}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Recent Activity */}
          <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-5 lg:p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Activity size={18} className="text-[#00A86B]" />
                <h3 className="font-bold text-white text-sm uppercase tracking-wider">
                  {t('Recent Activity', 'النشاط الأخير')}
                </h3>
              </div>
              <BarChart3 size={16} className="text-slate-700" />
            </div>
            <div className="space-y-4">
              {recentProducts.length === 0 ? (
                <div className="h-32 flex items-center justify-center text-slate-600 text-xs italic border border-dashed border-slate-800 rounded-xl">
                  {t('No recent data', 'لا توجد بيانات حديثة')}
                </div>
              ) : (
                recentProducts.map((p, i) => (
                  <div key={p.id} className="flex items-center gap-4 group">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black shrink-0 transition-transform group-hover:scale-110"
                      style={{
                        background: BRAND_COLORS[i % 5] + '1a',
                        color:      BRAND_COLORS[i % 5],
                        border:     `1px solid ${BRAND_COLORS[i % 5]}33`,
                      }}
                    >
                      {p.brand?.charAt(0) || 'P'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-white text-xs font-bold truncate">{(p as any).product_name ?? (p as any).part_name}</div>
                      <div className="text-slate-600 text-[10px] font-mono mt-0.5">{p.brand || '—'}</div>
                    </div>
                    <div className="text-end shrink-0">
                      <div className="text-[#00A86B] text-xs font-black tabular-nums">
                        {p.price} <span className="text-[10px] opacity-70 font-normal">{t('SAR', 'ر.س')}</span>
                      </div>
                      <div className="text-slate-600 text-[10px] font-medium mt-0.5">
                        {t('In stock:', 'بالمخزن:')} {p.quantity}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════
            TOP ORDERED PRODUCTS — المنتجات الأكثر طلباً
        ══════════════════════════════════════════════════════════════ */}
        <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-5 lg:p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <Star size={18} className="text-amber-400" />
              <h3 className="font-bold text-white text-sm uppercase tracking-wider">
                {t('Most Ordered Products', 'المنتجات الأكثر طلباً')}
              </h3>
            </div>
            <span className="text-[10px] font-mono text-slate-500 uppercase border border-slate-800 px-2 py-0.5 rounded-full">
              {t('Top 5', 'أفضل 5')}
            </span>
          </div>

          {topProducts.length === 0 ? (
            <div className="h-32 flex items-center justify-center text-slate-600 text-xs italic border border-dashed border-slate-800 rounded-xl">
              {t('No orders received yet', 'لم تصلك أي طلبات بعد')}
            </div>
          ) : (
            <div className="space-y-3">
              {topProducts.map((p, i) => {
                const maxTotal = topProducts[0]?.total_ordered || 1;
                const pct = Math.round((p.total_ordered / maxTotal) * 100);
                return (
                  <div key={p.product_id} className="flex items-center gap-4 p-3 rounded-xl bg-slate-800/30 border border-slate-800/50 hover:border-slate-700/50 transition-colors group">
                    {/* Rank badge */}
                    <div
                      className="w-8 h-8 rounded-xl flex items-center justify-center text-sm font-black shrink-0"
                      style={{
                        background: BRAND_COLORS[i % 5] + '1a',
                        color:      BRAND_COLORS[i % 5],
                        border:     `1px solid ${BRAND_COLORS[i % 5]}33`,
                      }}
                    >
                      {i + 1}
                    </div>

                    {/* Name + bar */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-white text-xs font-bold truncate">{p.product_name}</span>
                        <span
                          className="text-xs font-black tabular-nums ms-2 shrink-0"
                          style={{ color: BRAND_COLORS[i % 5] }}
                        >
                          {p.total_ordered} {t('units', 'وحدة')}
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-1000"
                          style={{ width: `${pct}%`, backgroundColor: BRAND_COLORS[i % 5] }}
                        />
                      </div>
                      <span className="text-slate-600 text-[10px] font-mono mt-1 block truncate">{p.product_code}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── BRAND DISTRIBUTION CHART ── */}
        <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-6 lg:p-8">
          <div className="flex items-center gap-2 mb-8">
            <TrendingUp size={18} className="text-[#00A86B]" />
            <h3 className="font-bold text-white text-sm uppercase tracking-wider">
              {t('Inventory Distribution by Category', 'توزيع المخزون حسب الصنف')}
            </h3>
          </div>

          <div className="flex flex-col md:flex-row items-center gap-10 lg:gap-16">
            {/* Donut chart */}
            <div className="relative shrink-0">
              <svg width="180" height="180" viewBox="0 0 120 120">
                {topBrands.length > 0 ? (
                  (() => {
                    let offset = 0;
                    const r = 48, cx = 60, cy = 60;
                    const circ = 2 * Math.PI * r;
                    return topBrands.map(([brand, count], i) => {
                      const pct  = count / totalBrands;
                      const dash = pct * circ;
                      const gap  = circ - dash;
                      const el   = (
                        <circle
                          key={brand}
                          cx={cx} cy={cy} r={r}
                          fill="none"
                          stroke={BRAND_COLORS[i % 5]}
                          strokeWidth="12"
                          strokeDasharray={`${dash} ${gap}`}
                          strokeDashoffset={-offset}
                          className="transition-all duration-1000 ease-out"
                          style={{ transform: 'rotate(-90deg)', transformOrigin: '60px 60px' }}
                        />
                      );
                      offset += dash;
                      return el;
                    });
                  })()
                ) : (
                  <circle cx="60" cy="60" r="48" fill="none" stroke="#1e293b" strokeWidth="12" />
                )}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="text-3xl font-black text-white tabular-nums tracking-tighter">{stats.totalProducts}</div>
                <div className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">{t('items', 'صنف')}</div>
              </div>
            </div>

            {/* Brand bars */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-5 flex-1 w-full">
              {topBrands.length === 0 ? (
                <div className="col-span-2 text-slate-600 text-xs italic text-center py-4">
                  {t('No category data available', 'لا توجد بيانات أصناف')}
                </div>
              ) : (
                topBrands.map(([brand, count], i) => (
                  <div key={brand} className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: BRAND_COLORS[i % 5] }} />
                        <span className="text-slate-300 text-sm font-bold truncate">{brand}</span>
                      </div>
                      <span className="text-white text-xs font-black tabular-nums ms-2">
                        {Math.round((count / totalBrands) * 100)}%
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-1000"
                        style={{ width: `${(count / totalBrands) * 100}%`, backgroundColor: BRAND_COLORS[i % 5] }}
                      />
                    </div>
                    <span className="text-slate-600 text-[10px] font-mono">
                      {count} {t('products', 'منتج')}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
