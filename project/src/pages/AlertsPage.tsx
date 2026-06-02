import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../context/LanguageContext";

// ─── Types ────────────────────────────────────────────────────────────────────

type ProductAlert = {
  id: number;
  part_name: string;
  quantity: number;
};

type PendingOrder = {
  id: number;
  status: string;
};

type FilterTab = "all" | "outOfStock" | "lowStock" | "pending";

// ─── Translations ─────────────────────────────────────────────────────────────

const translations = {
  ar: {
    pageTitle: "مركز التنبيهات",
    pageSubtitle: "متابعة المخزون والطلبات المهمة",
    loading: "جاري تحميل التنبيهات...",
    noShop: "لم يتم العثور على محل مرتبط بهذا الحساب",
    outOfStockItems: "منتجات نافدة",
    lowStockItems: "منخفضة المخزون",
    pendingOrdersLabel: "طلبات معلقة",
    totalAlerts: "إجمالي التنبيهات",
    allAlerts: "كل التنبيهات",
    outOfStock: "نفد المخزون",
    lowStock: "منخفض المخزون",
    pendingOrders: "طلبات معلقة",
    outOfStockTitle: "منتجات نفد مخزونها",
    lowStockTitle: "منتجات منخفضة المخزون",
    pendingOrdersTitle: "طلبات تحتاج متابعة",
    actionCenterTitle: "يحتاج انتباهاً فورياً",
    actionCenterSubtitle: "أعلى العناصر التي تستوجب التدخل العاجل",
    currentQty: "الكمية الحالية",
    orderNumber: "طلب",
    statusOutOfStock: "نفد المخزون",
    statusLowStock: "منخفض",
    orderStatus: {
      pending: "معلق",
      approved: "معتمد",
      rejected: "مرفوض",
      completed: "مكتمل",
    } as Record<string, string>,
    emptyOutOfStock: "لا توجد منتجات نافدة حالياً",
    emptyOutOfStockSub: "جميع المنتجات متوفرة في المخزون",
    emptyLowStock: "لا توجد منتجات منخفضة المخزون",
    emptyLowStockSub: "مستويات المخزون ضمن النطاق الطبيعي",
    emptyPending: "لا توجد طلبات معلقة",
    emptyPendingSub: "جميع الطلبات تمت معالجتها",
    emptyAll: "لا توجد تنبيهات نشطة",
    emptyAllSub: "كل شيء يسير بشكل طبيعي",
    summaryTitle: "ملخص التنبيهات",
    inventoryAlerts: "تنبيهات المخزون",
    orderAlerts: "تنبيهات الطلبات",
    totalAlertsLabel: "إجمالي التنبيهات",
    items: "عنصر",
    orders: "طلب",
    alerts: "تنبيه",
  },
  en: {
    pageTitle: "Alert Center",
    pageSubtitle: "Monitor inventory and critical orders",
    loading: "Loading alerts...",
    noShop: "No shop linked to this account",
    outOfStockItems: "Out of Stock",
    lowStockItems: "Low Stock",
    pendingOrdersLabel: "Pending Orders",
    totalAlerts: "Total Alerts",
    allAlerts: "All Alerts",
    outOfStock: "Out of Stock",
    lowStock: "Low Stock",
    pendingOrders: "Pending Orders",
    outOfStockTitle: "Out of Stock Products",
    lowStockTitle: "Low Stock Products",
    pendingOrdersTitle: "Orders Needing Attention",
    actionCenterTitle: "Needs Immediate Attention",
    actionCenterSubtitle: "Top items requiring urgent action",
    currentQty: "Current Qty",
    orderNumber: "Order",
    statusOutOfStock: "Out of Stock",
    statusLowStock: "Low Stock",
    orderStatus: {
      pending: "Pending",
      approved: "Approved",
      rejected: "Rejected",
      completed: "Completed",
    } as Record<string, string>,
    emptyOutOfStock: "No out of stock products",
    emptyOutOfStockSub: "All products are available in inventory",
    emptyLowStock: "No low stock products",
    emptyLowStockSub: "Stock levels are within normal range",
    emptyPending: "No pending orders",
    emptyPendingSub: "All orders have been processed",
    emptyAll: "No active alerts",
    emptyAllSub: "Everything is running smoothly",
    summaryTitle: "Alert Summary",
    inventoryAlerts: "Inventory Alerts",
    orderAlerts: "Order Alerts",
    totalAlertsLabel: "Total Alerts",
    items: "items",
    orders: "orders",
    alerts: "alerts",
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function localizeOrderStatus(
  status: string,
  map: Record<string, string>
): string {
  return map[status.toLowerCase()] ?? status;
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
  value: number;
  color: "red" | "amber" | "blue" | "slate";
}) {
  const colorMap = {
    red:   { bg: "bg-red-500/10",   border: "border-red-500/20",   text: "text-red-400",   iconBg: "bg-red-500/15"   },
    amber: { bg: "bg-amber-500/10", border: "border-amber-500/20", text: "text-amber-400", iconBg: "bg-amber-500/15" },
    blue:  { bg: "bg-blue-500/10",  border: "border-blue-500/20",  text: "text-blue-400",  iconBg: "bg-blue-500/15"  },
    slate: { bg: "bg-slate-700/40", border: "border-slate-600/30", text: "text-slate-300", iconBg: "bg-slate-600/40" },
  };
  const c = colorMap[color];

  return (
    <div
      className={`${c.bg} ${c.border} border rounded-2xl p-4 flex flex-col gap-3 min-w-0`}
      role="region"
      aria-label={`${label}: ${value}`}
    >
      <div className={`${c.iconBg} w-10 h-10 rounded-xl flex items-center justify-center text-lg`} aria-hidden="true">
        {icon}
      </div>
      <div>
        <div className={`text-2xl font-bold ${c.text} leading-none`} aria-hidden="true">{value}</div>
        <div className="text-slate-400 text-xs mt-1 leading-snug">{label}</div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
  count,
  color,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  color: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      aria-label={`${label} (${count})`}
      className={`
        flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap
        transition-all duration-200 border
        focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950
        ${
          active
            ? `${color} border-current/30 shadow-sm`
            : "text-slate-400 border-slate-700/50 hover:text-slate-200 hover:border-slate-600"
        }
      `}
    >
      {label}
      <span
        className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${active ? "bg-white/15" : "bg-slate-700"}`}
        aria-hidden="true"
      >
        {count}
      </span>
    </button>
  );
}

function EmptyState({
  icon,
  title,
  subtitle,
  color,
}: {
  icon: string;
  title: string;
  subtitle: string;
  color: "red" | "amber" | "blue" | "slate";
}) {
  const colorMap = {
    red:   "text-red-400/40",
    amber: "text-amber-400/40",
    blue:  "text-blue-400/40",
    slate: "text-slate-500",
  };

  return (
    <div className="flex flex-col items-center justify-center py-10 gap-3" role="status" aria-label={title}>
      <div className={`text-4xl ${colorMap[color]}`} aria-hidden="true">{icon}</div>
      <div className="text-slate-300 font-medium text-sm text-center">{title}</div>
      <div className="text-slate-500 text-xs text-center max-w-xs">{subtitle}</div>
    </div>
  );
}

function ProductCard({
  item,
  type,
  t,
}: {
  item: ProductAlert;
  type: "outOfStock" | "lowStock";
  t: typeof translations.ar;
}) {
  const isOut = type === "outOfStock";
  const statusLabel = isOut ? t.statusOutOfStock : t.statusLowStock;

  return (
    <div
      className={`
        rounded-xl p-4 border flex items-center justify-between gap-3
        ${isOut
          ? "bg-red-500/5 border-red-500/20 ring-1 ring-red-500/10"
          : "bg-amber-500/5 border-amber-500/15"
        }
      `}
      role="listitem"
      aria-label={`${item.part_name} — ${statusLabel} — ${t.currentQty}: ${item.quantity}`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div
          className={`w-9 h-9 rounded-lg flex items-center justify-center text-base shrink-0 ${isOut ? "bg-red-500/15" : "bg-amber-500/15"}`}
          aria-hidden="true"
        >
          {isOut ? "📦" : "⚠️"}
        </div>
        <div className="min-w-0">
          <div className="text-white font-medium text-sm truncate">{item.part_name}</div>
          <div className={`text-xs mt-0.5 ${isOut ? "text-red-400" : "text-amber-400"}`}>
            {t.currentQty}: {item.quantity}
          </div>
        </div>
      </div>
      <span
        className={`
          shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full border
          ${isOut
            ? "text-red-400 bg-red-500/10 border-red-500/20"
            : "text-amber-400 bg-amber-500/10 border-amber-500/20"
          }
        `}
        aria-hidden="true"
      >
        {statusLabel}
      </span>
    </div>
  );
}

function OrderCard({
  order,
  t,
}: {
  order: PendingOrder;
  t: typeof translations.ar;
}) {
  const localizedStatus = localizeOrderStatus(order.status, t.orderStatus);

  return (
    <div
      className="bg-blue-500/5 border border-blue-500/15 rounded-xl p-4 flex items-center justify-between gap-3"
      role="listitem"
      aria-label={`${t.orderNumber} #${order.id} — ${localizedStatus}`}
    >
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-blue-500/15 flex items-center justify-center text-base shrink-0" aria-hidden="true">
          🛒
        </div>
        <div>
          <div className="text-white font-medium text-sm">{t.orderNumber} #{order.id}</div>
          <div className="text-slate-400 text-xs mt-0.5">{localizedStatus}</div>
        </div>
      </div>
      <span className="shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full text-amber-400 bg-amber-500/10 border border-amber-500/20">
        {localizedStatus}
      </span>
    </div>
  );
}

function SectionCard({
  title,
  icon,
  count,
  color,
  children,
}: {
  title: string;
  icon: string;
  count: number;
  color: "red" | "amber" | "blue";
  children: React.ReactNode;
}) {
  const borderMap = { red: "border-red-500/20",   amber: "border-amber-500/20", blue: "border-blue-500/20"  };
  const textMap   = { red: "text-red-400",         amber: "text-amber-400",      blue: "text-blue-400"       };
  const badgeMap  = { red: "bg-red-500/15 text-red-400", amber: "bg-amber-500/15 text-amber-400", blue: "bg-blue-500/15 text-blue-400" };

  return (
    <section
      className={`bg-slate-900 border ${borderMap[color]} rounded-2xl overflow-hidden`}
      aria-label={`${title} (${count})`}
    >
      <div className="px-5 py-4 flex items-center justify-between border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <span className="text-xl" aria-hidden="true">{icon}</span>
          <span className={`font-bold text-base ${textMap[color]}`}>{title}</span>
        </div>
        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${badgeMap[color]}`} aria-hidden="true">
          {count}
        </span>
      </div>
      <div className="p-4 space-y-3" role="list">{children}</div>
    </section>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AlertsPage() {
  const { ownedShopId, loading: authLoading } = useAuth();
  const { isRTL } = useLang();

  const t = (isRTL ? translations.ar : translations.en) as typeof translations.ar;

  const [outOfStock, setOutOfStock]       = useState<ProductAlert[]>([]);
  const [lowStock, setLowStock]           = useState<ProductAlert[]>([]);
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [loading, setLoading]             = useState(true);
  const [activeTab, setActiveTab]         = useState<FilterTab>("all");

  useEffect(() => {
    if (authLoading) return;
    if (!ownedShopId) {
      setLoading(false);
      return;
    }
    loadAlerts(ownedShopId);
  }, [ownedShopId, authLoading]);

  // ── EXACT original queries, untouched ────────────────────────────────────

  async function loadAlerts(currentShopId: number) {
    setLoading(true);

    const { data: outData } = await supabase
      .from("products")
      .select("id, part_name, quantity")
      .eq("shop_id", currentShopId)
      .eq("quantity", 0);

    const { data: lowData } = await supabase
      .from("products")
      .select("id, part_name, quantity")
      .eq("shop_id", currentShopId)
      .lte("quantity", 3)
      .gt("quantity", 0);

    const { data: ordersData } = await supabase
      .from("orders")
      .select("id, status")
      .eq("from_shop_id", currentShopId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    setOutOfStock(outData || []);
    setLowStock(lowData || []);
    setPendingOrders(ordersData || []);
    setLoading(false);
  }

  // ── Phase 2: Smart sorting (memoized) ─────────────────────────────────────

  const sortedOutOfStock = useMemo(
    () => [...outOfStock].sort((a, b) => a.part_name.localeCompare(b.part_name)),
    [outOfStock]
  );

  const sortedLowStock = useMemo(
    () => [...lowStock].sort((a, b) => a.quantity - b.quantity),
    [lowStock]
  );

  // pendingOrders already arrive newest-first (order by created_at desc in query)

  // ── Phase 3: Action Center — out-of-stock first, then low-stock by qty ───

  const actionItems = useMemo(
    () => [
      ...sortedOutOfStock.slice(0, 5).map((item) => ({ item, type: "outOfStock" as const })),
      ...sortedLowStock.slice(0, 5).map((item) => ({ item, type: "lowStock" as const })),
    ],
    [sortedOutOfStock, sortedLowStock]
  );

  // ── Derived counts (memoized) ─────────────────────────────────────────────

  const totalAlerts = useMemo(
    () => outOfStock.length + lowStock.length + pendingOrders.length,
    [outOfStock.length, lowStock.length, pendingOrders.length]
  );

  const inventoryAlerts = useMemo(
    () => outOfStock.length + lowStock.length,
    [outOfStock.length, lowStock.length]
  );

  // ── Loading ───────────────────────────────────────────────────────────────

  if (authLoading || loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4" role="status" aria-live="polite">
        <div className="w-10 h-10 border-2 border-slate-600 border-t-blue-500 rounded-full animate-spin" aria-hidden="true" />
        <div className="text-slate-400 text-sm">{t.loading}</div>
      </div>
    );
  }

  if (!ownedShopId) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3" role="alert">
        <div className="text-4xl" aria-hidden="true">🔒</div>
        <div className="text-red-400 text-sm font-medium">{t.noShop}</div>
      </div>
    );
  }

  // ── Tab visibility flags ──────────────────────────────────────────────────

  const showOutOfStock = activeTab === "all" || activeTab === "outOfStock";
  const showLowStock   = activeTab === "all" || activeTab === "lowStock";
  const showPending    = activeTab === "all" || activeTab === "pending";

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 pb-8" dir={isRTL ? "rtl" : "ltr"}>

      {/* ── Page Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white leading-tight">{t.pageTitle}</h1>
          <p className="text-slate-400 text-sm mt-1">{t.pageSubtitle}</p>
        </div>
        {totalAlerts > 0 && (
          <div
            className="shrink-0 flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2"
            aria-label={`${totalAlerts} ${t.alerts}`}
            role="status"
          >
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" aria-hidden="true" />
            <span className="text-red-400 text-xs font-semibold">{totalAlerts}</span>
          </div>
        )}
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" role="region" aria-label={t.totalAlerts}>
        <KpiCard icon="🚨" label={t.outOfStockItems}    value={outOfStock.length}    color="red"   />
        <KpiCard icon="⚠️" label={t.lowStockItems}      value={lowStock.length}      color="amber" />
        <KpiCard icon="📦" label={t.pendingOrdersLabel} value={pendingOrders.length} color="blue"  />
        <KpiCard icon="🔔" label={t.totalAlerts}        value={totalAlerts}          color="slate" />
      </div>

      {/* ── Filter Tabs ── */}
      <nav
        className="flex gap-2 overflow-x-auto pb-1 scrollbar-none -mx-1 px-1"
        aria-label={t.allAlerts}
        role="tablist"
      >
        <TabButton active={activeTab === "all"}        onClick={() => setActiveTab("all")}        label={t.allAlerts}     count={totalAlerts}          color="text-slate-200" />
        <TabButton active={activeTab === "outOfStock"} onClick={() => setActiveTab("outOfStock")} label={t.outOfStock}    count={outOfStock.length}    color="text-red-400"   />
        <TabButton active={activeTab === "lowStock"}   onClick={() => setActiveTab("lowStock")}   label={t.lowStock}      count={lowStock.length}      color="text-amber-400" />
        <TabButton active={activeTab === "pending"}    onClick={() => setActiveTab("pending")}    label={t.pendingOrders} count={pendingOrders.length} color="text-blue-400"  />
      </nav>

      {/* ── Action Center (all tab only) ── */}
      {activeTab === "all" && actionItems.length > 0 && (
        <section
          className="bg-slate-900 border border-slate-700/50 rounded-2xl overflow-hidden"
          aria-label={t.actionCenterTitle}
        >
          <div className="px-5 py-4 border-b border-slate-800 flex items-center gap-2.5">
            <span className="text-xl" aria-hidden="true">⚡</span>
            <div>
              <div className="text-white font-bold text-sm">{t.actionCenterTitle}</div>
              <div className="text-slate-500 text-xs mt-0.5">{t.actionCenterSubtitle}</div>
            </div>
          </div>
          <div className="p-4 space-y-3" role="list">
            {actionItems.map(({ item, type }) => (
              <ProductCard key={`action-${type}-${item.id}`} item={item} type={type} t={t} />
            ))}
          </div>
        </section>
      )}

      {/* ── Priority 1: Out of Stock ── */}
      {showOutOfStock && (
        <SectionCard title={t.outOfStockTitle} icon="🚨" count={outOfStock.length} color="red">
          {sortedOutOfStock.length === 0 ? (
            <EmptyState icon="✅" title={t.emptyOutOfStock} subtitle={t.emptyOutOfStockSub} color="red" />
          ) : (
            sortedOutOfStock.map((item) => (
              <ProductCard key={item.id} item={item} type="outOfStock" t={t} />
            ))
          )}
        </SectionCard>
      )}

      {/* ── Priority 2: Low Stock ── */}
      {showLowStock && (
        <SectionCard title={t.lowStockTitle} icon="⚠️" count={lowStock.length} color="amber">
          {sortedLowStock.length === 0 ? (
            <EmptyState icon="📊" title={t.emptyLowStock} subtitle={t.emptyLowStockSub} color="amber" />
          ) : (
            sortedLowStock.map((item) => (
              <ProductCard key={item.id} item={item} type="lowStock" t={t} />
            ))
          )}
        </SectionCard>
      )}

      {/* ── Priority 3: Pending Orders ── */}
      {showPending && (
        <SectionCard title={t.pendingOrdersTitle} icon="📦" count={pendingOrders.length} color="blue">
          {pendingOrders.length === 0 ? (
            <EmptyState icon="🎉" title={t.emptyPending} subtitle={t.emptyPendingSub} color="blue" />
          ) : (
            pendingOrders.map((order) => (
              <OrderCard key={order.id} order={order} t={t} />
            ))
          )}
        </SectionCard>
      )}

      {/* ── Global empty state (all tab, zero alerts) ── */}
      {activeTab === "all" && totalAlerts === 0 && (
        <div className="bg-slate-900 border border-slate-700/30 rounded-2xl">
          <EmptyState icon="🎯" title={t.emptyAll} subtitle={t.emptyAllSub} color="slate" />
        </div>
      )}

      {/* ── Alert Summary (all tab only) ── */}
      {activeTab === "all" && (
        <section
          className="bg-slate-900 border border-slate-700/30 rounded-2xl overflow-hidden"
          aria-label={t.summaryTitle}
        >
          <div className="px-5 py-4 border-b border-slate-800">
            <div className="text-white font-bold text-sm">{t.summaryTitle}</div>
          </div>
          <dl className="divide-y divide-slate-800">
            <div className="px-5 py-4 flex items-center justify-between">
              <dt className="flex items-center gap-2.5">
                <span aria-hidden="true">📦</span>
                <span className="text-slate-300 text-sm">{t.inventoryAlerts}</span>
              </dt>
              <dd className="flex items-center gap-2">
                <span className="text-white font-bold text-sm">{inventoryAlerts}</span>
                <span className="text-slate-500 text-xs">{t.items}</span>
              </dd>
            </div>
            <div className="px-5 py-4 flex items-center justify-between">
              <dt className="flex items-center gap-2.5">
                <span aria-hidden="true">🛒</span>
                <span className="text-slate-300 text-sm">{t.orderAlerts}</span>
              </dt>
              <dd className="flex items-center gap-2">
                <span className="text-white font-bold text-sm">{pendingOrders.length}</span>
                <span className="text-slate-500 text-xs">{t.orders}</span>
              </dd>
            </div>
            <div className="px-5 py-4 flex items-center justify-between">
              <dt className="flex items-center gap-2.5">
                <span aria-hidden="true">🔔</span>
                <span className="text-slate-300 text-sm font-medium">{t.totalAlertsLabel}</span>
              </dt>
              <dd className="flex items-center gap-2">
                <span className="text-white font-bold">{totalAlerts}</span>
                <span className="text-slate-500 text-xs">{t.alerts}</span>
              </dd>
            </div>
          </dl>
        </section>
      )}

    </div>
  );
}
