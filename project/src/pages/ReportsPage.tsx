import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../context/LanguageContext";

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
    pageTitle: "التقارير",
    pageSubtitle: "ملخص أداء المحل والمخزون",
    loading: "جاري تحميل التقارير...",
    noShop: "لم يتم العثور على محل مرتبط بهذا الحساب",

    // KPI
    totalProducts: "إجمالي المنتجات",
    totalQuantity: "إجمالي الكمية",
    inventoryValue: "قيمة المخزون",
    lowStockProducts: "منخفض المخزون",
    currency: "ر.س",

    // Inventory Health
    healthTitle: "صحة المخزون",
    healthyProducts: "منتجات سليمة",
    lowStockItems: "منخفض المخزون",
    reorderNeeded: "تحتاج إعادة طلب",

    // Top Products
    topProductsTitle: "أعلى المنتجات كمية",
    colProduct: "المنتج",
    colQuantity: "الكمية",
    colStatus: "الحالة",
    statusHealthy: "جيد",
    statusLow: "منخفض",
    statusCritical: "حرج",

    // Reorder Center
    reorderTitle: "مركز إعادة الطلب",
    reorderSubtitle: "مرتبة حسب الأولوية",
    qtyLabel: "الكمية",
    urgencyHigh: "عاجل",
    urgencyMedium: "متوسط",
    urgencyLow: "منخفض",

    // Summary
    summaryTitle: "ملخص التقرير",
    summaryValue: "قيمة المخزون",
    summaryQty: "إجمالي الكمية",
    summaryAttention: "تحتاج متابعة",
    pieces: "قطعة",
    products: "منتج",

    // Empty states
    emptyProducts: "لا توجد منتجات",
    emptyProductsSub: "لم يتم إضافة أي منتجات لهذا المحل بعد",
    emptyReorder: "لا توجد منتجات تحتاج إعادة طلب",
    emptyReorderSub: "جميع المنتجات ضمن مستويات المخزون الطبيعية",
  },
  en: {
    pageTitle: "Reports",
    pageSubtitle: "Shop performance and inventory summary",
    loading: "Loading reports...",
    noShop: "No shop linked to this account",

    // KPI
    totalProducts: "Total Products",
    totalQuantity: "Total Quantity",
    inventoryValue: "Inventory Value",
    lowStockProducts: "Low Stock",
    currency: "SAR",

    // Inventory Health
    healthTitle: "Inventory Health",
    healthyProducts: "Healthy Products",
    lowStockItems: "Low Stock",
    reorderNeeded: "Reorder Needed",

    // Top Products
    topProductsTitle: "Top Products by Quantity",
    colProduct: "Product",
    colQuantity: "Qty",
    colStatus: "Status",
    statusHealthy: "Healthy",
    statusLow: "Low",
    statusCritical: "Critical",

    // Reorder Center
    reorderTitle: "Reorder Center",
    reorderSubtitle: "Sorted by priority",
    qtyLabel: "Qty",
    urgencyHigh: "Urgent",
    urgencyMedium: "Medium",
    urgencyLow: "Low",

    // Summary
    summaryTitle: "Report Summary",
    summaryValue: "Inventory Value",
    summaryQty: "Total Quantity",
    summaryAttention: "Needs Attention",
    pieces: "pcs",
    products: "products",

    // Empty states
    emptyProducts: "No products found",
    emptyProductsSub: "No products have been added to this shop yet",
    emptyReorder: "No products need reordering",
    emptyReorderSub: "All products are within normal stock levels",
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getStockStatus(qty: number): "healthy" | "low" | "critical" {
  if (qty === 0) return "critical";
  if (qty <= 3) return "low";
  return "healthy";
}

function getUrgency(qty: number): "high" | "medium" | "low" {
  if (qty === 1) return "high";
  if (qty === 2) return "medium";
  return "low";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({
  icon,
  label,
  value,
  color,
}: {
  icon: string;
  label: string;
  value: React.ReactNode;
  color: "white" | "green" | "amber" | "blue";
}) {
  const textMap = {
    white: "text-white",
    green: "text-emerald-400",
    amber: "text-amber-400",
    blue: "text-blue-400",
  };
  const iconBgMap = {
    white: "bg-slate-700/50",
    green: "bg-emerald-500/15",
    amber: "bg-amber-500/15",
    blue: "bg-blue-500/15",
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 lg:p-5 flex flex-col gap-3">
      <div className={`w-9 h-9 rounded-xl ${iconBgMap[color]} flex items-center justify-center text-base`}>
        {icon}
      </div>
      <div>
        <div className={`text-xl lg:text-2xl font-bold ${textMap[color]} leading-none`}>{value}</div>
        <div className="text-slate-400 text-xs mt-1.5 leading-snug">{label}</div>
      </div>
    </div>
  );
}

function HealthBar({
  label,
  count,
  total,
  color,
  icon,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
  icon: string;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm">{icon}</span>
          <span className="text-slate-300 text-sm">{label}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-white font-bold text-sm">{count}</span>
          <span className="text-slate-500 text-xs">/ {total}</span>
        </div>
      </div>
      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function StatusBadge({ status, t }: { status: "healthy" | "low" | "critical"; t: typeof translations.ar }) {
  const map = {
    healthy: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    low: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    critical: "text-red-400 bg-red-500/10 border-red-500/20",
  };
  const labels = {
    healthy: t.statusHealthy,
    low: t.statusLow,
    critical: t.statusCritical,
  };
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${map[status]}`}>
      {labels[status]}
    </span>
  );
}

function UrgencyBadge({ urgency, t }: { urgency: "high" | "medium" | "low"; t: typeof translations.ar }) {
  const map = {
    high: "text-red-400 bg-red-500/10 border-red-500/20",
    medium: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    low: "text-yellow-400/80 bg-yellow-500/10 border-yellow-500/20",
  };
  const labels = {
    high: t.urgencyHigh,
    medium: t.urgencyMedium,
    low: t.urgencyLow,
  };
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${map[urgency]}`}>
      {labels[urgency]}
    </span>
  );
}

function EmptyState({ icon, title, subtitle }: { icon: string; title: string; subtitle: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-3">
      <div className="text-4xl opacity-30">{icon}</div>
      <div className="text-slate-300 font-medium text-sm text-center">{title}</div>
      <div className="text-slate-500 text-xs text-center max-w-xs">{subtitle}</div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const { ownedShopId, loading: authLoading } = useAuth();
  const { isRTL } = useLang();

  const t = (isRTL ? translations.ar : translations.en) as typeof translations.ar;

  const [loading, setLoading] = useState(true);

  const [totalProducts, setTotalProducts]   = useState(0);
  const [totalQuantity, setTotalQuantity]   = useState(0);
  const [inventoryValue, setInventoryValue] = useState(0);
  const [lowStockCount, setLowStockCount]   = useState(0);

  const [topProducts, setTopProducts]         = useState<ProductReport[]>([]);
  const [reorderProducts, setReorderProducts] = useState<ProductReport[]>([]);

  useEffect(() => {
    if (authLoading) return;
    if (!ownedShopId) {
      setLoading(false);
      return;
    }
    loadReport(ownedShopId);
  }, [ownedShopId, authLoading]);

  // ── EXACT original queries + logic, untouched (Phase 9: console.* removed) ─

  async function loadReport(currentShopId: number) {
    setLoading(true);

    const { data, error } = await supabase
      .from("products")
      .select("id, part_name, quantity, price, shop_id")
      .eq("shop_id", currentShopId);

    if (error) {
      setLoading(false);
      return;
    }

    const products: ProductReport[] = (data || []).map((p: any) => ({
      id:        p.id,
      part_name: p.part_name,
      quantity:  p.quantity || 0,
      price:     p.price    || 0,
    }));

    const totalProductsCount = products.length;

    const quantitySum = products.reduce(
      (sum, item) => sum + item.quantity,
      0
    );

    const stockValue = products.reduce(
      (sum, item) => sum + item.quantity * item.price,
      0
    );

    const lowStock = products.filter(
      (item) => item.quantity > 0 && item.quantity <= 3
    );

    const topMoving = [...products]
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    setTotalProducts(totalProductsCount);
    setTotalQuantity(quantitySum);
    setInventoryValue(stockValue);
    setLowStockCount(lowStock.length);
    setTopProducts(topMoving);
    setReorderProducts(lowStock);
    setLoading(false);
  }

  // ── Loading ───────────────────────────────────────────────────────────────

  if (authLoading || loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <div className="w-10 h-10 border-2 border-slate-600 border-t-blue-500 rounded-full animate-spin" />
        <div className="text-slate-400 text-sm">{t.loading}</div>
      </div>
    );
  }

  if (!ownedShopId) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <div className="text-4xl">🔒</div>
        <div className="text-red-400 text-sm font-medium">{t.noShop}</div>
      </div>
    );
  }

  // ── Derived (real data only) ──────────────────────────────────────────────

  const healthyCount = totalProducts - lowStockCount;
  const reorderSorted = [...reorderProducts].sort((a, b) => a.quantity - b.quantity);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5 pb-8" dir={isRTL ? "rtl" : "ltr"}>

      {/* ── Header ── */}
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold text-white leading-tight">{t.pageTitle}</h1>
        <p className="text-slate-400 text-sm mt-1">{t.pageSubtitle}</p>
      </div>

      {/* ── Phase 2: KPI Cards ── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <KpiCard
          icon="🗂️"
          label={t.totalProducts}
          value={totalProducts}
          color="white"
        />
        <KpiCard
          icon="📦"
          label={t.totalQuantity}
          value={totalQuantity}
          color="blue"
        />
        <KpiCard
          icon="💰"
          label={t.inventoryValue}
          value={
            <span>
              {inventoryValue.toLocaleString(isRTL ? "ar-SA" : "en-US")}{" "}
              <span className="text-sm font-normal text-slate-400">{t.currency}</span>
            </span>
          }
          color="green"
        />
        <KpiCard
          icon="⚠️"
          label={t.lowStockProducts}
          value={lowStockCount}
          color="amber"
        />
      </div>

      {/* ── Phase 3: Inventory Health ── */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-5">
          <span className="text-lg">❤️</span>
          <h3 className="text-white font-bold text-base">{t.healthTitle}</h3>
        </div>
        <div className="space-y-4">
          <HealthBar
            label={t.healthyProducts}
            count={healthyCount}
            total={totalProducts}
            color="bg-emerald-500"
            icon="✅"
          />
          <HealthBar
            label={t.lowStockItems}
            count={lowStockCount}
            total={totalProducts}
            color="bg-amber-500"
            icon="⚠️"
          />
          <HealthBar
            label={t.reorderNeeded}
            count={reorderProducts.length}
            total={totalProducts}
            color="bg-red-500"
            icon="🔄"
          />
        </div>
      </div>

      {/* ── Phase 4 + Phase 5: Tables ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">

        {/* Top Products Table */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800 flex items-center gap-2">
            <span className="text-lg">🏆</span>
            <h3 className="text-white font-bold text-base">{t.topProductsTitle}</h3>
          </div>

          {topProducts.length === 0 ? (
            <EmptyState
              icon="📦"
              title={t.emptyProducts}
              subtitle={t.emptyProductsSub}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-800">
                    <th className="px-5 py-3 text-slate-400 text-xs font-medium text-start">
                      {t.colProduct}
                    </th>
                    <th className="px-5 py-3 text-slate-400 text-xs font-medium text-center">
                      {t.colQuantity}
                    </th>
                    <th className="px-5 py-3 text-slate-400 text-xs font-medium text-end">
                      {t.colStatus}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {topProducts.map((item) => {
                    const status = getStockStatus(item.quantity);
                    return (
                      <tr key={item.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="px-5 py-3 text-white text-sm max-w-[140px] truncate">
                          {item.part_name}
                        </td>
                        <td className="px-5 py-3 text-center">
                          <span className="text-blue-400 font-bold text-sm">{item.quantity}</span>
                        </td>
                        <td className="px-5 py-3 text-end">
                          <StatusBadge status={status} t={t} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Reorder Center */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">🔄</span>
              <div>
                <div className="text-white font-bold text-base">{t.reorderTitle}</div>
                <div className="text-slate-500 text-xs mt-0.5">{t.reorderSubtitle}</div>
              </div>
            </div>
            {reorderProducts.length > 0 && (
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-red-400">
                {reorderProducts.length}
              </span>
            )}
          </div>

          <div className="p-4">
            {reorderSorted.length === 0 ? (
              <EmptyState
                icon="✅"
                title={t.emptyReorder}
                subtitle={t.emptyReorderSub}
              />
            ) : (
              <div className="space-y-2.5">
                {reorderSorted.map((item) => {
                  const urgency = getUrgency(item.quantity);
                  const qtyColor =
                    item.quantity === 1
                      ? "text-red-400"
                      : item.quantity === 2
                      ? "text-amber-400"
                      : "text-yellow-400";

                  return (
                    <div
                      key={item.id}
                      className={`
                        rounded-xl p-3.5 border flex items-center justify-between gap-3
                        ${urgency === "high"
                          ? "bg-red-500/5 border-red-500/15"
                          : urgency === "medium"
                          ? "bg-amber-500/5 border-amber-500/15"
                          : "bg-yellow-500/5 border-yellow-500/15"
                        }
                      `}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`
                            w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0
                            ${urgency === "high" ? "bg-red-500/20 text-red-400" : "bg-amber-500/20 text-amber-400"}
                          `}
                        >
                          {item.quantity}
                        </div>
                        <div className="min-w-0">
                          <div className="text-white text-sm font-medium truncate">{item.part_name}</div>
                          <div className={`text-xs mt-0.5 ${qtyColor}`}>
                            {t.qtyLabel}: {item.quantity}
                          </div>
                        </div>
                      </div>
                      <UrgencyBadge urgency={urgency} t={t} />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Phase 6: Report Summary ── */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800">
          <div className="text-white font-bold text-base">{t.summaryTitle}</div>
        </div>
        <div className="divide-y divide-slate-800">
          <div className="px-5 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span>💰</span>
              <span className="text-slate-300 text-sm">{t.summaryValue}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-emerald-400 font-bold text-sm">
                {inventoryValue.toLocaleString(isRTL ? "ar-SA" : "en-US")}
              </span>
              <span className="text-slate-500 text-xs">{t.currency}</span>
            </div>
          </div>
          <div className="px-5 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span>📦</span>
              <span className="text-slate-300 text-sm">{t.summaryQty}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-blue-400 font-bold text-sm">{totalQuantity}</span>
              <span className="text-slate-500 text-xs">{t.pieces}</span>
            </div>
          </div>
          <div className="px-5 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span>⚠️</span>
              <span className="text-slate-300 text-sm">{t.summaryAttention}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-amber-400 font-bold text-sm">{lowStockCount}</span>
              <span className="text-slate-500 text-xs">{t.products}</span>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
