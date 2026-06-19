// =============================================================
// src/pages/orders/components/OrderFilters.tsx
// Direction tabs (all/incoming/outgoing), search box, status filter.
// =============================================================

import { memo } from "react";
import { Search, ChevronDown } from "lucide-react";
import { STATUS_META, type OrderStatus, type OrderTab, type OrderStatusFilter } from "../types";

type OrderFiltersProps = {
  tab: OrderTab;
  onTabChange: (tab: OrderTab) => void;
  statusFilter: OrderStatusFilter;
  onStatusFilterChange: (status: OrderStatusFilter) => void;
  search: string;
  onSearchChange: (value: string) => void;
  isRTL: boolean;
  t: (en: string, ar: string) => string;
};

function OrderFiltersBase({
  tab, onTabChange, statusFilter, onStatusFilterChange, search, onSearchChange, isRTL, t,
}: OrderFiltersProps) {
  return (
    <div className="flex flex-col lg:flex-row gap-3 mb-5">
      <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800 overflow-x-auto no-scrollbar shrink-0" role="tablist" aria-label={t("Order direction filter", "تصفية اتجاه الطلب")}>
        {(["all", "incoming", "outgoing"] as const).map(k => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => onTabChange(k)}
            className={`px-5 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${tab === k ? "bg-slate-800 text-white shadow-sm" : "text-slate-500 hover:text-slate-300"}`}
          >
            {t(k, k === "all" ? "الكل" : k === "incoming" ? "واردة" : "صادرة")}
          </button>
        ))}
      </div>
      <div className="flex-1 flex gap-2">
        <div className="relative flex-1">
          <Search size={16} className={`absolute ${isRTL ? "right-3" : "left-3"} top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none`} />
          <input
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            placeholder={t("Search by ID or Shop...", "بحث برقم الطلب أو المحل...")}
            aria-label={t("Search orders", "بحث في الطلبات")}
            className={`w-full bg-slate-900 border border-slate-800 rounded-xl py-2.5 ${isRTL ? "pr-10 pl-4" : "pl-10 pr-4"} text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all placeholder:text-slate-600 text-sm`}
          />
        </div>
        <div className="relative shrink-0">
          <select
            value={statusFilter}
            onChange={e => onStatusFilterChange(e.target.value as OrderStatusFilter)}
            aria-label={t("Filter by status", "تصفية حسب الحالة")}
            className="appearance-none bg-slate-900 border border-slate-800 rounded-xl px-5 py-2.5 text-sm text-slate-300 outline-none focus:border-blue-500 cursor-pointer min-w-[120px]"
          >
            <option value="all">{t("All Status", "كل الحالات")}</option>
            {(Object.keys(STATUS_META) as OrderStatus[]).map(s => (
              <option key={s} value={s}>{STATUS_META[s].label[isRTL ? "ar" : "en"]}</option>
            ))}
          </select>
          <ChevronDown size={13} className={`absolute ${isRTL ? "left-3" : "right-3"} top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none`} />
        </div>
      </div>
    </div>
  );
}

export const OrderFilters = memo(OrderFiltersBase);
