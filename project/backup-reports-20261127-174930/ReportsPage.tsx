import { useEffect, useState, useMemo } from "react";
import { supabase } from "./lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../context/LanguageContext";
import {
  TrendingUp, Package, DollarSign, AlertTriangle, Activity,
  CheckCircle2, RefreshCcw, BarChart3, Archive, ArrowUpRight,
  LayoutDashboard, ShoppingCart, Star,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type ProductReport = {
  id: number;
  product_name: string;
  quantity: number;
  price: number;
};

type TopProduct = {
  product_id: number;
  product_name: string;
  product_code: string;
  total_ordered: number;
};

type MonthlyBar = {
  label: string;
  count: number;
};

// ─── Translations ─────────────────────────────────────────────────────────────

const translations = {
  ar: {
    pageTitle: "تقارير الأعمال",
    pageSubtitle: "تحليل ذكاء المخزون وأداء المتجر",
    loading: "جاري تحليل البيانات...",
    noShop: "لم يتم العثور على محل مرتبط بهذا الحساب",
    totalProducts: "إجمالي الأصناف",
    totalQuantity: "إجمالي القطع",
    inventoryValue: "قيمة المخزون",
    lowStockProducts: "تنبيهات المنخفض",
    currency: "ر.س",
    healthTitle: "مؤشر صحة المخزون",
    healthyProducts: "مخزون سليم",
    lowStockItems: "مخزون منخفض",
    reorderNeeded: "بحاجة لإعادة طلب",
    topProductsTitle: "المنتجات الأكثر توفراً",
    colProduct: "اسم المنتج",
    colQuantity: "الكمية",
    colStatus: "الحالة",
    statusHealthy: "سليم",
    statusLow: "منخفض",
    statusCritical: "حرج",
    reorderTitle: "مركز التوريد",
    reorderSubtitle: "الأصناف التي قاربت على النفاذ",
    qtyLabel: "الكمية",
    urgencyHigh: "فوري",
    urgencyMedium: "عاجل",
    urgencyLow: "قريباً",
    summaryTitle: "الملخص التنفيذي",
    summaryValue: "القيمة الإجمالية",
    summaryQty: "إجمالي الوحدات",
    summaryAttention: "أصناف للمتابعة",
    pieces: "وحدة",
    products: "صنف",
    emptyProducts: "لا توجد بيانات",
    emptyProductsSub: "ابدأ بإضافة المنتجات للمخزون لعرض التقارير",
    emptyReorder: "المخزون مثالي",
    emptyReorderSub: "لا توجد أصناف تحتاج لإعادة طلب حالياً",
    // Orders
    ordersTitle: "إحصائيات الطلبات",
    ordersSub: "ملخص جميع الطلبات المستلمة",
    ordersReceived: "طلبات مستلمة",
    ordersCompleted: "مكتملة",
    ordersPending: "معلقة",
    ordersRejected: "مرفوضة",
    ordersTotalSales: "إجمالي المبيعات",
    // Monthly chart
    monthlyTitle: "الطلبات الشهرية",
    monthlySub: "آخر 6 أشهر",
    orders: "طلب",
    // Top ordered
    topOrderedTitle: "الأكثر طلباً",
    topOrderedSub: "المنتجات الأكثر طلباً من الزبائن",
    units: "وحدة",
    noOrders: "لا توجد طلبات بعد",
  },
  en: {
    pageTitle: "Business Reports",
    pageSubtitle: "Inventory intelligence and shop performance",
    loading: "Analyzing data...",
    noShop: "No shop linked to this account",
    totalProducts: "Total Items",
    totalQuantity: "Total Units",
    inventoryValue: "Inventory Value",
    lowStockProducts: "Low Stock Alerts",
    currency: "SAR",
    healthTitle: "Inventory Health Index",
    healthyProducts: "Healthy Stock",
    lowStockItems: "Low Stock",
    reorderNeeded: "Reorder Needed",
    topProductsTitle: "Top Inventory Holdings",
    colProduct: "Product Name",
    colQuantity: "Qty",
    colStatus: "Status",
    statusHealthy: "Healthy",
    statusLow: "Low",
    statusCritical: "Critical",
    reorderTitle: "Procurement Center",
    reorderSubtitle: "Items reaching critical levels",
    qtyLabel: "Qty",
    urgencyHigh: "Immediate",
    urgencyMedium: "Urgent",
    urgencyLow: "Soon",
    summaryTitle: "Executive Summary",
    summaryValue: "Total Value",
    summaryQty: "Total Units",
    summaryAttention: "Items to Watch",
    pieces: "pcs",
    products: "items",
    emptyProducts: "No Data Found",
    emptyProductsSub: "Start adding products to see your reports",
    emptyReorder: "Optimal Levels",
    emptyReorderSub: "No items currently require reordering",
    // Orders
    ordersTitle: "Order Statistics",
    ordersSub: "Summary of all received orders",
    ordersReceived: "Received",
    ordersCompleted: "Completed",
    ordersPending: "Pending",
    ordersRejected: "Rejected",
    ordersTotalSales: "Total Sales",
    // Monthly chart
    monthlyTitle: "Monthly Orders",
    monthlySub: "Last 6 months",
    orders: "orders",
    // Top ordered
    topOrderedTitle: "Most Ordered",
    topOrderedSub: "Top products ordered by customers",
    units: "units",
    noOrders: "No orders yet",
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getStockStatus(qty: number): "healthy" | "low" | "critical" {
  if (qty === 0) return "critical";
  if (qty <= 3) return "low";
  return "healthy";
}

function getUrgency(qty: number): "high" | "medium" | "low" {
  if (qty <= 1) return "high";
  if (qty === 2) return "medium";
  return "low";
}

function getMonthLabel(date: Date, lang: 'ar' | 'en'): string {
  return date.toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US', { month: 'short' });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({ icon: Icon, label, value, color }: {
  icon: any; label: string; value: React.ReactNode; color: string;
}) {
  const colorVariants: Record<string, string> = {
    emerald: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    blue:    "text-blue-400 bg-blue-500/10 border-blue-500/20",
    amber:   "text-amber-400 bg-amber-500/10 border-amber-500/20",
    slate:   "text-slate-100 bg-slate-800 border-slate-700",
    purple:  "text-purple-400 bg-purple-500/10 border-purple-500/20",
    red:     "text-red-400 bg-red-500/10 border-red-500/20",
  };
  return (
    <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition-all group">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 transition-transform group-hover:scale-110 ${colorVariants[color]}`}>
        <Icon size={20} />
      </div>
      <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-1">{label}</p>
      <div className="text-2xl font-black text-white tracking-tight">{value}</div>
    </div>
  );
}

function HealthBar({ label, count, total, color, icon: Icon }: {
  label: string; count: number; total: number; color: string; icon: any;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="bg-slate-800/30 p-4 rounded-xl border border-slate-800/50">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <Icon size={16} className={color.replace('bg-', 'text-')} />
          <span className="text-slate-300 text-sm font-medium">{label}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-white font-black text-sm">{count}</span>
          <span className="text-slate-600 text-[10px] font-bold">/ {total}</span>
        </div>
      </div>
      <div className="h-2 bg-slate-950 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ease-out ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-end mt-1">
        <span className="text-[10px] font-bold text-slate-500">{pct}%</span>
      </div>
    </div>
  );
}

// ─── Monthly Bar Chart ─────────────────────────────────────────────────────────

function MonthlyChart({ bars, lang, t }: { bars: MonthlyBar[]; lang: 'ar' | 'en'; t: typeof translations.ar }) {
  const maxCount = Math.max(...bars.map(b => b.count), 1);
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <BarChart3 size={18} className="text-blue-400" />
          <div>
            <h3 className="text-white font-black text-sm">{t.monthlyTitle}</h3>
            <p className="text-slate-500 text-[10px]">{t.monthlySub}</p>
          </div>
        </div>
      </div>
      <div className="flex items-end gap-2 h-32">
        {bars.map((bar, i) => {
          const pct = (bar.count / maxCount) * 100;
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
              <span className="text-[10px] text-slate-500 font-bold tabular-nums">{bar.count > 0 ? bar.count : ''}</span>
              <div className="w-full rounded-t-lg transition-all duration-700 relative group" style={{ height: `${Math.max(pct, 4)}%`, background: 'linear-gradient(180deg,#3b82f6,#1d4ed8)' }}>
                <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 rounded-t-lg transition-opacity" />
              </div>
              <span className="text-[9px] text-slate-600 font-bold truncate w-full text-center">{bar.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ReportsPage() {
  const { ownedShopId, loading: authLoading } = useAuth();
  const { isRTL } = useLang();
  const lang: 'ar' | 'en' = isRTL ? 'ar' : 'en';
  const t = translations[lang];

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    totalProducts:  0,
    totalQuantity:  0,
    inventoryValue: 0,
    lowStockCount:  0,
    topProducts:    [] as ProductReport[],
    reorderProducts:[] as ProductReport[],
  });

  const [orderStats, setOrderStats] = useState({
    received:   0,
    completed:  0,
    pending:    0,
    rejected:   0,
    totalSales: 0,
  });

  const [topOrdered,  setTopOrdered]  = useState<TopProduct[]>([]);
  const [monthlyBars, setMonthlyBars] = useState<MonthlyBar[]>([]);

  async function loadReport(shopId: number) {
    setLoading(true);
    try {
      // ── Products ──────────────────────────────────────────────────
      const { data: rawData } = await supabase
        .from("products")
        .select("id, product_name, quantity, price")
        .eq("shop_id", shopId);

      const products: ProductReport[] = (rawData ?? []).map((p: any) => ({
        id:           p.id,
        product_name: p.product_name ?? p.part_name ?? '—',
        quantity:     p.quantity || 0,
        price:        p.price    || 0,
      }));

      const val = products.reduce((s, p) => s + p.quantity * p.price, 0);
      const qty = products.reduce((s, p) => s + p.quantity, 0);
      const low = products.filter(p => p.quantity > 0 && p.quantity <= 3);
      const top = [...products].sort((a, b) => b.quantity - a.quantity).slice(0, 6);

      setData({
        totalProducts:   products.length,
        totalQuantity:   qty,
        inventoryValue:  val,
        lowStockCount:   low.length,
        topProducts:     top,
        reorderProducts: low,
      });

      // ── Orders stats ──────────────────────────────────────────────
      const { data: ordersData } = await supabase
        .from("orders")
        .select("id, status, total_amount, created_at")
        .eq("to_shop_id", shopId);

      const orders = ordersData ?? [];
      const completed = orders.filter((o: any) => o.status === 'approved' || o.status === 'completed');
      setOrderStats({
        received:   orders.length,
        completed:  completed.length,
        pending:    orders.filter((o: any) => o.status === 'pending').length,
        rejected:   orders.filter((o: any) => o.status === 'rejected').length,
        totalSales: completed.reduce((s: number, o: any) => s + (o.total_amount ?? 0), 0),
      });

      // ── Monthly bars (last 6 months) ──────────────────────────────
      const now = new Date();
      const bars: MonthlyBar[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const nextD = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
        const count = orders.filter((o: any) => {
          const created = new Date(o.created_at);
          return created >= d && created < nextD;
        }).length;
        bars.push({ label: getMonthLabel(d, lang), count });
      }
      setMonthlyBars(bars);

      // ── Top ordered products ──────────────────────────────────────
      const { data: itemsData } = await supabase
        .from("order_items")
        .select("product_id, quantity, products!inner(product_name, product_code, shop_id)")
        .eq("products.shop_id", shopId)
        .limit(500);

      const totals: Record<number, { name: string; code: string; total: number }> = {};
      (itemsData ?? []).forEach((item: any) => {
        const pid  = item.product_id;
        const prod = item.products;
        if (!pid || !prod) return;
        if (!totals[pid]) totals[pid] = { name: prod.product_name ?? prod.part_name ?? '—', code: prod.product_code ?? prod.part_number ?? '—', total: 0 };
        totals[pid].total += item.quantity ?? 0;
      });

      const sorted = Object.entries(totals)
        .map(([id, v]) => ({ product_id: Number(id), product_name: v.name, product_code: v.code, total_ordered: v.total }))
        .sort((a, b) => b.total_ordered - a.total_ordered)
        .slice(0, 5);
      setTopOrdered(sorted);

    } catch (e) {
      console.error('[ReportsPage]', e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (authLoading) return;
    if (!ownedShopId) { setLoading(false); return; }
    loadReport(ownedShopId);
  }, [ownedShopId, authLoading]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <RefreshCcw className="w-8 h-8 text-blue-500 animate-spin" />
        <p className="text-slate-400 text-sm font-bold animate-pulse uppercase tracking-widest">{t.loading}</p>
      </div>
    );
  }

  if (!ownedShopId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center px-4">
        <div className="bg-red-500/10 p-6 rounded-full mb-4"><Archive size={48} className="text-red-500" /></div>
        <h2 className="text-white text-xl font-black mb-2">{t.noShop}</h2>
      </div>
    );
  }

  const healthyCount = data.totalProducts - data.lowStockCount;
  const BRAND_COLORS = ['#00A86B', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444'];

  return (
    <div className="pb-20 space-y-6 animate-in fade-in duration-500" dir={isRTL ? "rtl" : "ltr"}>

      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <LayoutDashboard className="text-blue-500" size={24} />
            <h1 className="text-2xl font-black text-white tracking-tight">{t.pageTitle}</h1>
          </div>
          <p className="text-slate-500 text-sm">{t.pageSubtitle}</p>
        </div>
        <button
          onClick={() => loadReport(ownedShopId!)}
          className="flex items-center gap-2 bg-slate-900 border border-slate-800 text-slate-400 hover:text-white px-4 py-2 rounded-xl transition-all active:scale-95 self-start md:self-auto"
        >
          <RefreshCcw size={14} />
          <span className="text-xs font-bold uppercase tracking-wider">
            {lang === 'ar' ? 'تحديث' : 'Refresh'}
          </span>
        </button>
      </header>

      {/* Inventory KPIs */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon={BarChart3}    label={t.totalProducts}    value={data.totalProducts}                                                                             color="slate"   />
        <KpiCard icon={Package}      label={t.totalQuantity}    value={data.totalQuantity.toLocaleString()}                                                            color="blue"    />
        <KpiCard icon={DollarSign}   label={t.inventoryValue}   value={<span className="flex items-baseline gap-1">{data.inventoryValue.toLocaleString()}<span className="text-xs font-normal text-slate-500">{t.currency}</span></span>} color="emerald" />
        <KpiCard icon={AlertTriangle}label={t.lowStockProducts} value={data.lowStockCount}                                                                             color="amber"   />
      </section>

      {/* ══════════════════════════════════════════════════════
          ORDER STATISTICS
      ══════════════════════════════════════════════════════ */}
      <section className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center gap-2">
          <ShoppingCart size={16} className="text-blue-400" />
          <div>
            <h2 className="text-white font-black text-sm">{t.ordersTitle}</h2>
            <p className="text-slate-500 text-[10px]">{t.ordersSub}</p>
          </div>
        </div>
        <div className="p-4 grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: t.ordersReceived,   value: orderStats.received,   color: 'text-white',         bg: 'bg-slate-800/60 border-slate-700'         },
            { label: t.ordersCompleted,  value: orderStats.completed,  color: 'text-emerald-400',   bg: 'bg-emerald-500/10 border-emerald-500/20'  },
            { label: t.ordersPending,    value: orderStats.pending,    color: 'text-amber-400',     bg: 'bg-amber-500/10 border-amber-500/20'      },
            { label: t.ordersRejected,   value: orderStats.rejected,   color: 'text-red-400',       bg: 'bg-red-500/10 border-red-500/20'          },
            { label: t.ordersTotalSales, value: `${orderStats.totalSales.toLocaleString()} ${t.currency}`, color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
          ].map((s, i) => (
            <div key={i} className={`rounded-2xl p-4 border ${s.bg} text-center`}>
              <p className={`text-2xl font-black tabular-nums ${s.color}`}>{s.value}</p>
              <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wide mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Monthly chart + Top ordered */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Monthly chart */}
        <MonthlyChart bars={monthlyBars} lang={lang} t={t} />

        {/* Top ordered products */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800 flex items-center gap-2">
            <Star size={16} className="text-amber-400" />
            <div>
              <h3 className="text-white font-black text-sm">{t.topOrderedTitle}</h3>
              <p className="text-slate-500 text-[10px]">{t.topOrderedSub}</p>
            </div>
          </div>
          <div className="p-4 space-y-3">
            {topOrdered.length === 0 ? (
              <div className="py-12 text-center opacity-40">
                <ShoppingCart size={32} className="text-slate-500 mx-auto mb-2" />
                <p className="text-slate-500 text-xs">{t.noOrders}</p>
              </div>
            ) : (
              topOrdered.map((p, i) => {
                const maxTotal = topOrdered[0]?.total_ordered || 1;
                const pct = Math.round((p.total_ordered / maxTotal) * 100);
                return (
                  <div key={p.product_id} className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black shrink-0"
                      style={{ background: BRAND_COLORS[i % 5] + '1a', color: BRAND_COLORS[i % 5], border: `1px solid ${BRAND_COLORS[i % 5]}33` }}>
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-white text-xs font-bold truncate">{p.product_name}</span>
                        <span className="text-xs font-black tabular-nums ms-2 shrink-0" style={{ color: BRAND_COLORS[i % 5] }}>
                          {p.total_ordered} {t.units}
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${pct}%`, backgroundColor: BRAND_COLORS[i % 5] }} />
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Inventory Health + Top Holdings */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* Health Index */}
        <section className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-2xl p-6 h-fit">
          <div className="flex items-center gap-3 mb-6">
            <Activity className="text-emerald-500" size={20} />
            <h3 className="text-white font-black text-lg">{t.healthTitle}</h3>
          </div>
          <div className="space-y-4">
            <HealthBar label={t.healthyProducts} count={healthyCount}              total={data.totalProducts} color="bg-emerald-500" icon={CheckCircle2} />
            <HealthBar label={t.lowStockItems}   count={data.lowStockCount}        total={data.totalProducts} color="bg-amber-500"  icon={AlertTriangle} />
            <HealthBar label={t.reorderNeeded}   count={data.reorderProducts.length} total={data.totalProducts} color="bg-red-500"    icon={RefreshCcw} />
          </div>
          <div className="mt-6 p-4 bg-blue-500/5 rounded-2xl border border-blue-500/10 text-center">
            <p className="text-[10px] font-black text-slate-500 uppercase mb-1 tracking-widest">{t.summaryQty}</p>
            <p className="text-2xl font-black text-blue-400">{data.totalQuantity}</p>
            <p className="text-[10px] text-slate-600 font-bold">{t.pieces}</p>
          </div>
        </section>

        {/* Top Holdings Table */}
        <section className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden flex flex-col">
          <div className="p-6 border-b border-slate-800 flex items-center gap-3">
            <TrendingUp className="text-blue-500" size={20} />
            <h3 className="text-white font-black text-lg">{t.topProductsTitle}</h3>
          </div>
          <div className="flex-1 overflow-x-auto">
            {data.topProducts.length === 0 ? (
              <div className="py-20 flex flex-col items-center opacity-40">
                <Package size={48} /><p className="mt-2 text-sm">{t.emptyProducts}</p>
              </div>
            ) : (
              <>
                {/* Desktop table */}
                <table className="w-full hidden sm:table">
                  <thead>
                    <tr className="text-slate-500 text-[10px] font-black uppercase tracking-widest border-b border-slate-800">
                      <th className="px-6 py-4 text-start">{t.colProduct}</th>
                      <th className="px-6 py-4 text-center">{t.colQuantity}</th>
                      <th className="px-6 py-4 text-center">{t.colStatus}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {data.topProducts.map((p) => {
                      const status = getStockStatus(p.quantity);
                      const statusColors = { healthy: "text-emerald-500 bg-emerald-500/10", low: "text-amber-500 bg-amber-500/10", critical: "text-red-500 bg-red-500/10" };
                      const statusLabels = { healthy: t.statusHealthy, low: t.statusLow, critical: t.statusCritical };
                      return (
                        <tr key={p.id} className="hover:bg-slate-800/20 transition-colors">
                          <td className="px-6 py-4 text-white font-bold text-sm truncate max-w-[240px]">{p.product_name}</td>
                          <td className="px-6 py-4 text-center text-blue-400 font-mono font-black">{p.quantity}</td>
                          <td className="px-6 py-4 text-center">
                            <span className={`px-2 py-1 rounded-md text-[10px] font-black uppercase ${statusColors[status]}`}>
                              {statusLabels[status]}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {/* Mobile cards */}
                <div className="sm:hidden p-3 space-y-2">
                  {data.topProducts.map((p) => {
                    const status = getStockStatus(p.quantity);
                    const statusColors = { healthy: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20", low: "text-amber-400 bg-amber-500/10 border-amber-500/20", critical: "text-red-400 bg-red-500/10 border-red-500/20" };
                    const statusLabels = { healthy: t.statusHealthy, low: t.statusLow, critical: t.statusCritical };
                    return (
                      <div key={p.id} className="flex items-center justify-between p-3 bg-slate-800/30 rounded-xl border border-slate-800/50">
                        <div className="min-w-0 flex-1">
                          <p className="text-white text-xs font-bold truncate">{p.product_name}</p>
                          <p className="text-blue-400 font-mono font-black text-sm">{p.quantity} {t.pieces}</p>
                        </div>
                        <span className={`px-2 py-1 rounded-md text-[10px] font-black uppercase border ms-2 shrink-0 ${statusColors[status]}`}>
                          {statusLabels[status]}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </section>
      </div>

      {/* Reorder + Executive Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Reorder */}
        <section className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="p-6 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <RefreshCcw className="text-red-500" size={20} />
              <div>
                <h3 className="text-white font-black text-lg">{t.reorderTitle}</h3>
                <p className="text-slate-500 text-xs">{t.reorderSubtitle}</p>
              </div>
            </div>
            {data.reorderProducts.length > 0 && (
              <span className="bg-red-500 text-white text-[10px] font-black px-2 py-1 rounded-lg animate-pulse">
                {data.reorderProducts.length}
              </span>
            )}
          </div>
          <div className="p-4 max-h-[400px] overflow-y-auto no-scrollbar">
            {data.reorderProducts.length === 0 ? (
              <div className="py-16 text-center">
                <CheckCircle2 className="mx-auto text-emerald-500/20 mb-3" size={48} />
                <p className="text-slate-500 text-sm">{t.emptyReorderSub}</p>
              </div>
            ) : (
              <div className="grid gap-3">
                {[...data.reorderProducts].sort((a, b) => a.quantity - b.quantity).map((p) => {
                  const urgency = getUrgency(p.quantity);
                  const urgencyStyles = { high: "border-red-500/20 bg-red-500/5", medium: "border-amber-500/20 bg-amber-500/5", low: "border-slate-800 bg-slate-800/30" };
                  const urgencyLabels = { high: t.urgencyHigh, medium: t.urgencyMedium, low: t.urgencyLow };
                  return (
                    <div key={p.id} className={`flex items-center justify-between p-4 rounded-xl border transition-all ${urgencyStyles[urgency]}`}>
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-mono font-black text-lg ${urgency === 'high' ? 'bg-red-500 text-white' : 'bg-slate-800 text-slate-400'}`}>
                          {p.quantity}
                        </div>
                        <div className="min-w-0">
                          <p className="text-white font-bold text-sm truncate max-w-[180px]">{p.product_name}</p>
                          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">{t.qtyLabel}: {p.quantity}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-[10px] font-black px-2 py-1 rounded-md uppercase border ${urgency === 'high' ? 'border-red-500/30 text-red-500 bg-red-500/10' : 'border-slate-700 text-slate-500 bg-slate-900'}`}>
                          {urgencyLabels[urgency]}
                        </span>
                        <ArrowUpRight size={14} className="text-slate-700" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* Executive Summary */}
        <section className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="p-6 border-b border-slate-800">
            <h3 className="text-white font-black text-lg flex items-center gap-3">
              <BarChart3 className="text-emerald-500" size={20} /> {t.summaryTitle}
            </h3>
          </div>
          <div className="divide-y divide-slate-800/50">
            {[
              { icon: DollarSign,    label: t.summaryValue,    val: data.inventoryValue.toLocaleString(), unit: t.currency,  color: 'text-emerald-500' },
              { icon: Package,       label: t.summaryQty,      val: data.totalQuantity.toLocaleString(),  unit: t.pieces,    color: 'text-blue-500'    },
              { icon: AlertTriangle, label: t.summaryAttention,val: data.lowStockCount,                   unit: t.products,  color: 'text-amber-500'   },
              { icon: ShoppingCart,  label: t.ordersTotalSales,val: orderStats.totalSales.toLocaleString(), unit: t.currency, color: 'text-purple-400'  },
            ].map((row, i) => (
              <div key={i} className="flex items-center justify-between p-5 hover:bg-slate-800/10 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400">
                    <row.icon size={16} />
                  </div>
                  <span className="text-slate-400 text-sm font-medium">{row.label}</span>
                </div>
                <div className="text-end">
                  <p className={`text-xl font-black ${row.color}`}>{row.val}</p>
                  <p className="text-[10px] text-slate-600 font-black uppercase tracking-widest">{row.unit}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

    </div>
  );
}
