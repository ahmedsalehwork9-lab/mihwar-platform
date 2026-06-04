import { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import {
  Package, Boxes, DollarSign, RefreshCw,
  Store, TrendingUp, AlertTriangle,
  Activity, ShieldAlert, XCircle,
  Search, BarChart3, FileText, ChevronRight,
  ArrowUpRight
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LanguageContext';
import { useNotifications } from '../context/NotificationContext';

type Product = {
  id: number;
  part_name: string;
  part_number: string;
  brand: string;
  quantity: number;
  price: number;
};

const BRAND_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444'] as const;

export default function DashboardPage() {
  const { user } = useAuth();
  const { t, isRTL } = useLang();
  const { 
    lowStockItems, 
    outOfStockItems, 
    pendingOrders, 
    totalCount 
  } = useNotifications();

  const [loading, setLoading] = useState(true);
  const [shop, setShop] = useState<any>(null);
  const [products, setProducts] = useState<Product[]>([]);
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

      const { data: productsData } = await supabase
        .from('products')
        .select('*')
        .eq('shop_id', shopData.id)
        .order('created_at', { ascending: false });

      const items: Product[] = productsData || [];
      setProducts(items);

      const totalInventory = items.reduce((a, i) => a + (i.quantity || 0), 0);
      const totalValue = items.reduce((a, i) => a + (i.quantity || 0) * (i.price || 0), 0);

      setStats({ 
        totalProducts: items.length, 
        totalInventory, 
        totalValue 
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  // Use Notifications Context for Alerts
  const lowStockCount = lowStockItems.length;
  const outOfStockCount = outOfStockItems.length;
  const pendingOrdersCount = pendingOrders.length;
  const criticalAlerts = outOfStockCount + pendingOrdersCount;

  const brandCounts = useMemo(() =>
    products.reduce((acc, p) => {
      if (p.brand) acc[p.brand] = (acc[p.brand] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
    [products]
  );

  const topBrands = useMemo(() =>
    Object.entries(brandCounts).sort((a, b) => b[1] - a[1]).slice(0, 5),
    [brandCounts]
  );

  const totalBrands = useMemo(() =>
    topBrands.reduce((a, b) => a + b[1], 0),
    [topBrands]
  );

  const recentProducts = useMemo(() => products.slice(0, 5), [products]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-9 h-9 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-500 text-xs">{t('Loading Dashboard...', 'جارٍ تحميل لوحة التحكم...')}</p>
        </div>
      </div>
    );
  }

  return (
    <div dir={isRTL ? 'rtl' : 'ltr'} className="min-h-screen bg-slate-950 text-white pb-10">
      <div className="w-full max-w-none space-y-4 p-4 lg:p-8">

        {/* ── ERP HEADER ── */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 border-b border-slate-800/50 pb-6">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600/20 to-blue-400/5 border border-blue-500/20 flex items-center justify-center shrink-0 shadow-lg shadow-blue-500/5">
              <Store size={24} className="text-blue-400" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-black text-white tracking-tight truncate">
                {shop?.shop_name || t('My Store', 'متجري')}
              </h1>
              <div className="flex items-center gap-2 mt-1">
                <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <p className="text-slate-400 text-xs font-medium uppercase tracking-wider">
                  {t('Operational Overview', 'النظرة التشغيلية')}
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
             <button
              onClick={loadDashboard}
              className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 border border-slate-700/50 rounded-xl px-4 py-2.5 transition-all active:scale-95 group"
            >
              <RefreshCw size={16} className="text-slate-400 group-hover:rotate-180 transition-transform duration-500" />
              <span className="text-slate-300 text-sm font-semibold">{t('Sync Data', 'تزامن البيانات')}</span>
            </button>
          </div>
        </div>

        {/* ── KPI CARDS (ERP GRADE) ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[
            { 
              label: t('Total Products', 'إجمالي المنتجات'), 
              value: stats.totalProducts, 
              sub: t('Active SKUs', 'الأصناف النشطة'), 
              icon: Package, 
              color: 'text-blue-400', 
              bg: 'bg-blue-500/5', 
              border: 'border-blue-500/15' 
            },
            { 
              label: t('Inventory Units', 'وحدات المخزون'), 
              value: stats.totalInventory.toLocaleString(), 
              sub: t('In Stock', 'متوفر بالمخزن'), 
              icon: Boxes, 
              color: 'text-emerald-400', 
              bg: 'bg-emerald-500/5', 
              border: 'border-emerald-500/15' 
            },
            { 
              label: t('Total Value', 'إجمالي القيمة'), 
              value: stats.totalValue >= 100000 ? `${(stats.totalValue / 1000).toFixed(1)}k` : stats.totalValue.toLocaleString(), 
              sub: t('Currency: SAR', 'العملة: ر.س'), 
              icon: DollarSign, 
              color: 'text-amber-400', 
              bg: 'bg-amber-500/5', 
              border: 'border-amber-500/15' 
            },
            { 
              label: t('System Alerts', 'تنبيهات النظام'), 
              value: totalCount, 
              sub: t('Needs Attention', 'تحتاج إجراء'), 
              icon: ShieldAlert, 
              color: 'text-red-400', 
              bg: 'bg-red-500/5', 
              border: 'border-red-500/15' 
            },
          ].map((card, i) => (
            <div key={i} className={`relative overflow-hidden min-h-[140px] bg-slate-900/50 backdrop-blur-sm rounded-2xl p-5 border ${card.border} transition-all hover:border-white/10 group`}>
              <div className="flex justify-between items-start mb-4">
                <div className={`p-2.5 rounded-xl ${card.bg} ${card.color}`}>
                  <card.icon size={20} />
                </div>
                <ArrowUpRight size={14} className="text-slate-700 group-hover:text-slate-400 transition-colors" />
              </div>
              <div>
                <div className="text-3xl font-black text-white tabular-nums mb-1 tracking-tight">
                  {card.value}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 text-xs font-bold uppercase tracking-wide">{card.label}</span>
                  <span className="text-slate-600 text-[10px] font-medium">{card.sub}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* ── ALERT CENTER (SOURCE: CONTEXT) ── */}
        <div className="bg-slate-900/40 border border-slate-800/50 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="font-bold text-white text-base tracking-tight">{t('Operational Alerts', 'تنبيهات التشغيل')}</span>
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
                icon: <XCircle size={18} />,
                bg: 'bg-red-500/10 hover:bg-red-500/15',
                border: 'border-red-500/20',
                text: 'text-red-400',
              },
              {
                label: t('Low Stock', 'مخزون منخفض'),
                value: lowStockCount,
                icon: <AlertTriangle size={18} />,
                bg: 'bg-amber-500/10 hover:bg-amber-500/15',
                border: 'border-amber-500/20',
                text: 'text-amber-400',
              },
              {
                label: t('Out of Stock', 'نفد المخزون'),
                value: outOfStockCount,
                icon: <ShieldAlert size={18} />,
                bg: 'bg-red-500/10 hover:bg-red-500/15',
                border: 'border-red-500/20',
                text: 'text-red-400',
              },
              {
                label: t('Pending Orders', 'طلبات معلقة'),
                value: pendingOrdersCount,
                icon: <Package size={18} />,
                bg: 'bg-blue-500/10 hover:bg-blue-500/15',
                border: 'border-blue-500/20',
                text: 'text-blue-400',
              },
            ].map((card, i) => (
              <button
                key={i}
                className={`flex items-center gap-4 rounded-xl p-4 border transition-all active:scale-[0.98] cursor-pointer ${card.bg} ${card.border}`}
              >
                <div className={`${card.text} shrink-0`}>{card.icon}</div>
                <div className="text-left rtl:text-right min-w-0">
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
            { icon: <Search size={20} />, label: t('Search', 'بحث'), color: 'text-blue-400', bg: 'bg-blue-500/5 hover:bg-blue-500/10', border: 'border-blue-500/10' },
            { icon: <Boxes size={20} />, label: t('Inventory', 'المخزون'), color: 'text-emerald-400', bg: 'bg-emerald-500/5 hover:bg-emerald-500/10', border: 'border-emerald-500/10' },
            { icon: <Package size={20} />, label: t('Orders', 'الطلبات'), color: 'text-amber-400', bg: 'bg-amber-500/5 hover:bg-amber-500/10', border: 'border-amber-500/10' },
            { icon: <FileText size={20} />, label: t('Reports', 'التقارير'), color: 'text-purple-400', bg: 'bg-purple-500/5 hover:bg-purple-500/10', border: 'border-purple-500/10' },
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Low Stock Detailed */}
          <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <AlertTriangle size={18} className="text-amber-400" />
                <h3 className="font-bold text-white text-sm uppercase tracking-wider">{t('Stock Depletion Risk', 'مخاطر نفاذ المخزون')}</h3>
              </div>
              <span className="text-[10px] font-mono text-slate-500 uppercase">{lowStockCount} items</span>
            </div>

            <div className="space-y-3">
              {lowStockItems.length === 0 ? (
                <div className="h-32 flex items-center justify-center text-slate-600 text-xs italic border border-dashed border-slate-800 rounded-xl">
                  {t('No inventory risks detected', 'لا توجد مخاطر على المخزون')}
                </div>
              ) : (
                lowStockItems.slice(0, 5).map(p => (
                  <div key={p.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-800/30 border border-slate-800/50">
                    <div className="min-w-0">
                      <div className="text-white text-xs font-bold truncate">{p.part_name}</div>
                      <div className="text-slate-500 text-[10px] font-mono mt-0.5">{p.part_number}</div>
                    </div>
                    <div className="flex items-center gap-3">
                       <span className="text-[11px] px-2 py-1 rounded-lg bg-amber-500/10 text-amber-500 font-black tabular-nums border border-amber-500/20">
                        {p.quantity} {t('left', 'تبقي')}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Recently Added */}
          <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Activity size={18} className="text-blue-400" />
                <h3 className="font-bold text-white text-sm uppercase tracking-wider">{t('Recent Activity', 'النشاط الأخير')}</h3>
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
                      style={{ background: BRAND_COLORS[i % 5] + '1a', color: BRAND_COLORS[i % 5], border: `1px solid ${BRAND_COLORS[i % 5]}33` }}
                    >
                      {p.brand?.charAt(0) || 'P'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-white text-xs font-bold truncate">{p.part_name}</div>
                      <div className="text-slate-600 text-[10px] font-mono mt-0.5">{p.brand}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-emerald-400 text-xs font-black tabular-nums">
                        {p.price} <span className="text-[10px] opacity-70 font-normal">SAR</span>
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

        {/* ── BRAND DISTRIBUTION CHART ── */}
        <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-6">
           <div className="flex items-center gap-2 mb-8">
            <TrendingUp size={18} className="text-purple-400" />
            <h3 className="font-bold text-white text-sm uppercase tracking-wider">{t('Inventory Distribution by Brand', 'توزيع المخزون حسب العلامة التجارية')}</h3>
          </div>

          <div className="flex flex-col md:flex-row items-center gap-12">
            <div className="relative shrink-0">
              <svg width="180" height="180" viewBox="0 0 120 120">
                {topBrands.length > 0 ? (
                  (() => {
                    let offset = 0;
                    const r = 48, cx = 60, cy = 60;
                    const circ = 2 * Math.PI * r;
                    return topBrands.map(([brand, count], i) => {
                      const pct = count / totalBrands;
                      const dash = pct * circ;
                      const gap = circ - dash;
                      const el = (
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 flex-1 w-full">
              {topBrands.map(([brand, count], i) => (
                <div key={brand} className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: BRAND_COLORS[i % 5] }} />
                      <span className="text-slate-300 text-sm font-bold truncate">{brand}</span>
                    </div>
                    <span className="text-white text-xs font-black tabular-nums">
                      {Math.round((count / totalBrands) * 100)}%
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div 
                      className="h-full transition-all duration-1000" 
                      style={{ 
                        width: `${(count / totalBrands) * 100}%`,
                        backgroundColor: BRAND_COLORS[i % 5]
                      }} 
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}