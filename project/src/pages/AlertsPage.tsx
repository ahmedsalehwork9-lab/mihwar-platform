import { useMemo, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../context/LanguageContext";
import { useNotifications } from "../context/NotificationContext";
import { type Page } from "../components/Layout";
import {
  Bell,
  PackageX,
  AlertTriangle,
  ShoppingCart,
  ChevronRight,
  RefreshCw,
  Info,
  Package,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type ProductAlert = {
  id: number;
  part_name: string;
  part_number?: string;
  quantity: number;
};

type PendingOrder = {
  id: number;
  status: string;
  total_amount?: number;
  created_at: string;
  to_shop?: { shop_name: string };
};

type AlertCounts = {
  critical: number;
  warning: number;
  action: number;
  total: number;
};

type AlertsPageProps = {
  setPage: (p: Page) => void;
};

// ─── Sub-Components ───────────────────────────────────────────────────────────

const AlertSummaryCard = ({
  label,
  count,
  icon: Icon,
  colorClass,
  onClick,
  isRTL,
}: {
  label: string;
  count: number;
  icon: LucideIcon;
  colorClass: string;
  onClick: () => void;
  isRTL: boolean;
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    className={`bg-slate-900 border border-slate-800 p-6 rounded-2xl flex flex-col items-start gap-4 active:scale-[0.98] transition-all w-full hover:border-slate-700 hover:bg-slate-800/50 ${
      isRTL ? "text-right" : "text-left"
    }`}
  >
    <div className={`p-3 rounded-xl ${colorClass} bg-opacity-10`}>
      <Icon size={24} className={colorClass.replace("bg-", "text-")} />
    </div>
    <div>
      <p className="text-3xl font-black text-white leading-none">{count}</p>
      <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-2">
        {label}
      </p>
    </div>
  </button>
);

const EmptyState = ({
  message,
  icon: Icon,
}: {
  message: string;
  icon: LucideIcon;
}) => (
  <div className="flex flex-col items-center justify-center py-12 px-4 bg-slate-900/20 border border-dashed border-slate-800 rounded-3xl opacity-60 w-full">
    <Icon size={40} className="text-slate-700 mb-3" />
    <p className="text-slate-500 text-sm font-medium tracking-wide">{message}</p>
  </div>
);

const SectionTitle = ({
  label,
  colorClass,
  pulse = false,
}: {
  label: string;
  colorClass: string;
  pulse?: boolean;
}) => (
  <div className="flex items-center gap-3 mb-5 px-1">
    <span className={`w-2 h-2 rounded-full ${colorClass} ${pulse ? "animate-pulse" : ""}`} />
    <h3 className={`text-sm font-black ${colorClass.replace("bg-", "text-")} uppercase tracking-[0.2em]`}>
      {label}
    </h3>
  </div>
);

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AlertsPage({ setPage }: AlertsPageProps) {
  const { ownedShopId, loading: authLoading } = useAuth();
  const { t, isRTL } = useLang();
  const locale = isRTL ? "ar-SA" : "en-US";

  const {
    lowStockItems,
    outOfStockItems,
    pendingOrders,
    totalCount,
    loading,
    refresh,
  } = useNotifications();

  const handleKpiAction = useCallback(() => {
    // KPI Cards serve as summary indicators
  }, []);

  const alertCounts = useMemo<AlertCounts>(
    () => ({
      critical: outOfStockItems.length,
      warning: lowStockItems.length,
      action: pendingOrders.length,
      total: totalCount,
    }),
    [outOfStockItems, lowStockItems, pendingOrders, totalCount]
  );

  const emptyStates = useMemo(() => ({
    stockout: {
      message: t("No stockout items", "لا توجد قطع نافدة"),
      icon: Package,
    },
    lowStock: {
      message: t("All items well stocked", "جميع القطع متوفرة"),
      icon: Package,
    },
    orders: {
      message: t("No pending orders", "لا توجد طلبات معلقة"),
      icon: ShoppingCart,
    },
  }), [t]);

  if (loading || authLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <RefreshCw className="w-8 h-8 text-emerald-500 animate-spin" />
        <p className="text-slate-500 text-sm animate-pulse">
          {t("Syncing Alerts...", "جاري مزامنة التنبيهات...")}
        </p>
      </div>
    );
  }

  if (!ownedShopId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
        <div className="w-20 h-20 bg-slate-900 border border-slate-800 rounded-3xl flex items-center justify-center mb-6">
          <ShieldAlert className="text-slate-600" size={40} />
        </div>
        <h2 className="text-white font-bold text-xl mb-3">
          {t("No Shop Found", "لم يتم العثور على متجر")}
        </h2>
        <p className="text-slate-500 text-base max-w-sm mx-auto">
          {t(
            "Please connect your account to a shop to receive alerts.",
            "يرجى ربط الحساب بمتجر لتلقي التنبيهات."
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="pb-24 w-full max-w-7xl mx-auto space-y-10" dir={isRTL ? "rtl" : "ltr"}>
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-2">
        <div>
          <h1 className="text-3xl font-black text-white flex items-center gap-3">
            <Bell className="text-emerald-500" size={32} />
            {t("Notification Center", "مركز التنبيهات")}
          </h1>
          <p className="text-slate-500 text-sm font-bold mt-2 uppercase tracking-widest opacity-80">
            {alertCounts.total} {t("Active Alerts", "تنبيهات نشطة")}
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          className="self-start sm:self-center flex items-center gap-2 px-5 py-2.5 rounded-xl border border-slate-800 bg-slate-900 text-slate-400 hover:text-white hover:border-slate-700 transition-all active:scale-95 font-bold text-sm"
        >
          <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
          {t("Refresh", "تحديث")}
        </button>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 px-2">
        <AlertSummaryCard
          label={t("Stockout", "نافد")}
          count={alertCounts.critical}
          icon={PackageX}
          colorClass="bg-red-500"
          onClick={handleKpiAction}
          isRTL={isRTL}
        />
        <AlertSummaryCard
          label={t("Low Stock", "منخفض")}
          count={alertCounts.warning}
          icon={AlertTriangle}
          colorClass="bg-amber-500"
          onClick={handleKpiAction}
          isRTL={isRTL}
        />
        <AlertSummaryCard
          label={t("Orders", "طلبات")}
          count={alertCounts.action}
          icon={ShoppingCart}
          colorClass="bg-blue-500"
          onClick={handleKpiAction}
          isRTL={isRTL}
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 px-2">
        
        {/* Left Column: Inventory Alerts */}
        <div className="space-y-8">
          {/* Priority 1: Critical (Out of Stock) */}
          <section>
            <SectionTitle 
              label={t("Critical: Stockout", "حرج: نفد المخزون")} 
              colorClass="bg-red-500" 
              pulse 
            />
            <div className="grid grid-cols-1 gap-3">
              {outOfStockItems.length === 0 ? (
                <EmptyState
                  message={emptyStates.stockout.message}
                  icon={emptyStates.stockout.icon}
                />
              ) : (
                outOfStockItems.map((item: ProductAlert) => (
                  <div
                    key={item.id}
                    onClick={() => setPage("inventory")}
                    className="bg-slate-900/50 border border-slate-800 p-5 rounded-2xl flex items-center justify-between group hover:bg-slate-800 hover:border-slate-700 transition-all cursor-pointer"
                  >
                    <div className="flex items-center gap-5">
                      <div className="w-12 h-12 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center justify-center text-red-500 shrink-0 font-black text-sm">
                        0
                      </div>
                      <div className="min-w-0">
                        <p className="text-white font-bold text-base truncate mb-1">
                          {item.part_name}
                        </p>
                        <p className="text-slate-500 text-xs font-mono tracking-tighter opacity-70">
                          {item.part_number || "—"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-slate-600 group-hover:text-emerald-500 transition-colors">
                      <span className="text-[10px] font-black hidden sm:block uppercase tracking-widest">
                        {t("View", "عرض")}
                      </span>
                      <ChevronRight size={20} className={isRTL ? "rotate-180" : ""} />
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Priority 2: Warning (Low Stock) */}
          <section>
            <SectionTitle 
              label={t("Warning: Low Levels", "تحذير: مستويات منخفضة")} 
              colorClass="bg-amber-500" 
            />
            <div className="grid grid-cols-1 gap-3">
              {lowStockItems.length === 0 ? (
                <EmptyState
                  message={emptyStates.lowStock.message}
                  icon={emptyStates.lowStock.icon}
                />
              ) : (
                lowStockItems.map((item: ProductAlert) => (
                  <div
                    key={item.id}
                    onClick={() => setPage("inventory")}
                    className="bg-slate-900/50 border border-slate-800 p-5 rounded-2xl flex items-center justify-between group hover:bg-slate-800 hover:border-slate-700 transition-all cursor-pointer"
                  >
                    <div className="flex items-center gap-5">
                      <div className="w-12 h-12 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center justify-center text-amber-500 shrink-0 font-black text-base">
                        {item.quantity}
                      </div>
                      <div className="min-w-0">
                        <p className="text-white font-bold text-base truncate mb-1">
                          {item.part_name}
                        </p>
                        <p className="text-slate-500 text-xs font-mono tracking-tighter opacity-70">
                          {item.part_number || "—"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-slate-600 group-hover:text-emerald-500 transition-colors">
                      <ChevronRight size={20} className={isRTL ? "rotate-180" : ""} />
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        {/* Right Column: Order Alerts */}
        <div className="space-y-8">
          <section>
            <SectionTitle 
              label={t("Action: Pending Orders", "إجراء: طلبات معلقة")} 
              colorClass="bg-blue-500" 
            />
            <div className="grid grid-cols-1 gap-3">
              {pendingOrders.length === 0 ? (
                <EmptyState
                  message={emptyStates.orders.message}
                  icon={emptyStates.orders.icon}
                />
              ) : (
                pendingOrders.map((order: PendingOrder) => (
                  <div
                    key={order.id}
                    onClick={() => setPage("orders")}
                    className="bg-slate-900/50 border border-slate-800 p-5 rounded-2xl flex items-center justify-between group hover:bg-slate-800 hover:border-slate-700 transition-all cursor-pointer"
                  >
                    <div className="flex items-center gap-5">
                      <div className="w-12 h-12 bg-blue-500/10 border border-blue-500/20 rounded-2xl flex items-center justify-center text-blue-500 shrink-0">
                        <ShoppingCart size={22} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-white font-bold text-base truncate mb-2">
                          {t("Order", "طلب")} #{order.id}
                        </p>
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] text-blue-400 font-black bg-blue-500/10 px-2 py-1 rounded-md uppercase tracking-wider">
                            {t("Pending", "معلق")}
                          </span>
                          <span className="text-slate-700 text-xs">•</span>
                          <span className="text-slate-500 text-xs font-mono font-bold">
                            {new Date(order.created_at).toLocaleDateString(locale)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <p className="text-white font-black text-lg">
                        {order.total_amount?.toLocaleString()}{" "}
                        <span className="text-[10px] font-medium opacity-50 uppercase">{t("SAR", "ر.س")}</span>
                      </p>
                      <ChevronRight size={20} className="text-slate-700 group-hover:text-blue-500 transition-colors" />
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Attention Info Card */}
          {alertCounts.total > 0 && (
            <div className="p-8 bg-emerald-500/5 border border-emerald-500/10 rounded-[2rem] relative overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-5">
                <Bell size={120} className="text-emerald-500" />
              </div>
              <div className="relative z-10">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 bg-emerald-500/20 rounded-lg flex items-center justify-center">
                    <Info size={18} className="text-emerald-500" />
                  </div>
                  <p className="text-white font-black text-lg">
                    {t("Attention Needed", "انتباه مطلوب")}
                  </p>
                </div>
                <p className="text-slate-400 text-sm md:text-base leading-relaxed font-medium">
                  {t(
                    "You have critical alerts regarding your inventory and pending orders. Resolving these ensures smooth business operations and customer satisfaction.",
                    "لديك تنبيهات عاجلة تتعلق بمخزونك وطلباتك. معالجة هذه التنبيهات تضمن استمرارية العمليات ورضا العملاء."
                  )}
                </p>
                <div className="mt-6 flex gap-3">
                  <button 
                    type="button"
                    onClick={() => setPage("inventory")}
                    className="px-6 py-2.5 bg-emerald-500 text-slate-950 rounded-xl font-black text-sm hover:bg-emerald-400 transition-colors"
                  >
                    {t("Update Inventory", "تحديث المخزون")}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}