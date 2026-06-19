import { useEffect, useState, useMemo } from "react";
import { supabase } from "./lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../context/LanguageContext";
import { 
  TrendingUp, 
  Package, 
  DollarSign, 
  AlertTriangle, 
  Activity, 
  CheckCircle2, 
  RefreshCcw,
  BarChart3,
  Archive,
  ArrowUpRight,
  LayoutDashboard
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type ProductReport = {
  id: number;
  part_name: string;
  quantity: number;
  price: number;
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

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({ icon: Icon, label, value, color }: { icon: any, label: string, value: React.ReactNode, color: string }) {
  const colorVariants: Record<string, string> = {
    emerald: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    blue: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    amber: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    slate: "text-slate-100 bg-slate-800 border-slate-700",
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

function HealthBar({ label, count, total, color, icon: Icon }: { label: string, count: number, total: number, color: string, icon: any }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="bg-slate-800/30 p-4 rounded-xl border border-slate-800/50 group">
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
      <div className="h-2 bg-slate-950 rounded-full overflow-hidden flex">
        <div 
          className={`h-full rounded-full transition-all duration-700 ease-out ${color} shadow-[0_0_8px_rgba(0,0,0,0.5)]`} 
          style={{ width: `${pct}%` }} 
        />
      </div>
      <div className="flex justify-end mt-1">
        <span className="text-[10px] font-bold text-slate-500">{pct}%</span>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ReportsPage() {
  const { ownedShopId, loading: authLoading } = useAuth();
  const { isRTL, t: langT } = useLang();
  const t = (isRTL ? translations.ar : translations.en) as typeof translations.ar;

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    totalProducts: 0,
    totalQuantity: 0,
    inventoryValue: 0,
    lowStockCount: 0,
    topProducts: [] as ProductReport[],
    reorderProducts: [] as ProductReport[],
  });

  useEffect(() => {
    if (authLoading) return;
    if (!ownedShopId) { setLoading(false); return; }
    loadReport(ownedShopId);
  }, [ownedShopId, authLoading]);

  async function loadReport(currentShopId: number) {
    setLoading(true);
    const { data: rawData, error } = await supabase
      .from("products")
      .select("id, part_name, quantity, price")
      .eq("shop_id", currentShopId);

    if (error || !rawData) { setLoading(false); return; }

    const products: ProductReport[] = rawData.map((p: any) => ({
      id: p.id,
      part_name: p.part_name,
      quantity: p.quantity || 0,
      price: p.price || 0,
    }));

    const val = products.reduce((sum, p) => sum + p.quantity * p.price, 0);
    const qty = products.reduce((sum, p) => sum + p.quantity, 0);
    const low = products.filter(p => p.quantity > 0 && p.quantity <= 3);
    const top = [...products].sort((a, b) => b.quantity - a.quantity).slice(0, 6);

    setData({
      totalProducts: products.length,
      totalQuantity: qty,
      inventoryValue: val,
      lowStockCount: low.length,
      topProducts: top,
      reorderProducts: low,
    });
    setLoading(false);
  }

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

  return (
    <div className="pb-20 space-y-8 animate-in fade-in duration-500" dir={isRTL ? "rtl" : "ltr"}>
      
      {/* Header Area */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <LayoutDashboard className="text-blue-500" size={28} />
            <h1 className="text-3xl font-black text-white tracking-tight">{t.pageTitle}</h1>
          </div>
          <p className="text-slate-500 text-sm font-medium">{t.pageSubtitle}</p>
        </div>
        <button 
          onClick={() => loadReport(ownedShopId!)}
          className="flex items-center gap-2 bg-slate-900 border border-slate-800 text-slate-400 hover:text-white px-4 py-2 rounded-xl transition-all"
        >
          <RefreshCcw size={16} />
          <span className="text-xs font-bold uppercase tracking-wider">{langT('Refresh', 'تحديث')}</span>
        </button>
      </header>

      {/* Primary KPIs */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={BarChart3} label={t.totalProducts} value={data.totalProducts} color="slate" />
        <KpiCard icon={Package} label={t.totalQuantity} value={data.totalQuantity.toLocaleString()} color="blue" />
        <KpiCard icon={DollarSign} label={t.inventoryValue} value={
          <span className="flex items-baseline gap-1.5">
            {data.inventoryValue.toLocaleString(isRTL ? "ar-SA" : "en-US")}
            <span className="text-xs font-normal text-slate-500">{t.currency}</span>
          </span>
        } color="emerald" />
        <KpiCard icon={AlertTriangle} label={t.lowStockProducts} value={data.lowStockCount} color="amber" />
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Inventory Health Index */}
        <section className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-2xl p-6 h-fit">
          <div className="flex items-center gap-3 mb-6">
            <Activity className="text-emerald-500" size={20} />
            <h3 className="text-white font-black text-lg">{t.healthTitle}</h3>
          </div>
          <div className="space-y-4">
            <HealthBar label={t.healthyProducts} count={healthyCount} total={data.totalProducts} color="bg-emerald-500" icon={CheckCircle2} />
            <HealthBar label={t.lowStockItems} count={data.lowStockCount} total={data.totalProducts} color="bg-amber-500" icon={AlertTriangle} />
            <HealthBar label={t.reorderNeeded} count={data.reorderProducts.length} total={data.totalProducts} color="bg-red-500" icon={RefreshCcw} />
          </div>
          
          <div className="mt-8 p-4 bg-blue-500/5 rounded-2xl border border-blue-500/10">
             <div className="text-center">
                <p className="text-[10px] font-black text-slate-500 uppercase mb-1 tracking-widest">{t.summaryQty}</p>
                <p className="text-2xl font-black text-blue-400">{data.totalQuantity}</p>
                <p className="text-[10px] text-slate-600 font-bold">{t.pieces}</p>
             </div>
          </div>
        </section>

        {/* Top Products Holding */}
        <section className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden flex flex-col">
          <div className="p-6 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <TrendingUp className="text-blue-500" size={20} />
              <h3 className="text-white font-black text-lg">{t.topProductsTitle}</h3>
            </div>
          </div>
          
          <div className="flex-1 overflow-x-auto">
            {data.topProducts.length === 0 ? (
              <div className="py-20 flex flex-col items-center opacity-40"><Package size={48} /><p className="mt-2 text-sm">{t.emptyProducts}</p></div>
            ) : (
              <table className="w-full text-right">
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
                    return (
                      <tr key={p.id} className="hover:bg-slate-800/20 transition-colors">
                        <td className="px-6 py-4 text-white font-bold text-sm truncate max-w-[240px]">{p.part_name}</td>
                        <td className="px-6 py-4 text-center text-blue-400 font-mono font-black">{p.quantity}</td>
                        <td className="px-6 py-4 text-center">
                          <span className={`px-2 py-1 rounded-md text-[10px] font-black uppercase ${statusColors[status]}`}>
                            {t[`status${status.charAt(0).toUpperCase() + status.slice(1)}` as any] || status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Reorder Procurement Center */}
        <section className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl shadow-black/20">
          <div className="p-6 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <RefreshCcw className="text-red-500" size={20} />
              <div>
                <h3 className="text-white font-black text-lg">{t.reorderTitle}</h3>
                <p className="text-slate-500 text-xs font-medium">{t.reorderSubtitle}</p>
              </div>
            </div>
            {data.reorderProducts.length > 0 && (
              <span className="bg-red-500 text-white text-[10px] font-black px-2 py-1 rounded-lg animate-pulse">{data.reorderProducts.length}</span>
            )}
          </div>
          
          <div className="p-4 max-h-[400px] overflow-y-auto no-scrollbar">
            {data.reorderProducts.length === 0 ? (
              <div className="py-16 text-center"><CheckCircle2 className="mx-auto text-emerald-500/20 mb-3" size={48} /><p className="text-slate-500 text-sm">{t.emptyReorderSub}</p></div>
            ) : (
              <div className="grid gap-3">
                {[...data.reorderProducts].sort((a,b) => a.quantity - b.quantity).map((p) => {
                  const urgency = getUrgency(p.quantity);
                  const urgencyStyles = { high: "border-red-500/20 bg-red-500/5", medium: "border-amber-500/20 bg-amber-500/5", low: "border-slate-800 bg-slate-800/30" };
                  const urgencyLabels = { high: t.urgencyHigh, medium: t.urgencyMedium, low: t.urgencyLow };
                  return (
                    <div key={p.id} className={`flex items-center justify-between p-4 rounded-xl border transition-all ${urgencyStyles[urgency]}`}>
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-mono font-black text-lg shadow-inner ${urgency === 'high' ? 'bg-red-500 text-white' : 'bg-slate-800 text-slate-400'}`}>{p.quantity}</div>
                        <div className="min-w-0">
                          <p className="text-white font-bold text-sm truncate max-w-[180px]">{p.part_name}</p>
                          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">{t.qtyLabel}: {p.quantity}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-[10px] font-black px-2 py-1 rounded-md uppercase border ${urgency === 'high' ? 'border-red-500/30 text-red-500 bg-red-500/10' : 'border-slate-700 text-slate-500 bg-slate-900'}`}>{urgencyLabels[urgency]}</span>
                        <ArrowUpRight size={14} className="text-slate-700" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* Executive Summary List */}
        <section className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="p-6 border-b border-slate-800">
            <h3 className="text-white font-black text-lg flex items-center gap-3"><BarChart3 className="text-emerald-500" size={20} /> {t.summaryTitle}</h3>
          </div>
          <div className="divide-y divide-slate-800/50">
            {[
              { icon: DollarSign, label: t.summaryValue, val: data.inventoryValue.toLocaleString(), unit: t.currency, color: 'text-emerald-500' },
              { icon: Package, label: t.summaryQty, val: data.totalQuantity.toLocaleString(), unit: t.pieces, color: 'text-blue-500' },
              { icon: AlertTriangle, label: t.summaryAttention, val: data.lowStockCount, unit: t.products, color: 'text-amber-500' }
            ].map((row, i) => (
              <div key={i} className="flex items-center justify-between p-6 hover:bg-slate-800/10 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400"><row.icon size={16} /></div>
                  <span className="text-slate-400 text-sm font-medium">{row.label}</span>
                </div>
                <div className="text-right">
                  <p className={`text-xl font-black ${row.color}`}>{row.val}</p>
                  <p className="text-[10px] text-slate-600 font-black uppercase tracking-widest">{row.unit}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="p-6 bg-slate-950/30 border-t border-slate-800/50">
             <div className="flex items-center gap-3 text-slate-500 text-xs italic">
                <Activity size={14} />
                <span>{t.pageSubtitle}</span>
             </div>
          </div>
        </section>
      </div>

    </div>
  );
}