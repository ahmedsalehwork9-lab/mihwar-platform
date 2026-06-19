// =============================================================
// src/pages/orders/components/OrderSummaryCards.tsx
// Top-of-page KPI cards: Total Value, Pending, Approved, Rejected.
// =============================================================

import { memo } from "react";
import { DollarSign, Clock, CheckCircle, XCircle } from "lucide-react";
import type { OrderCounts } from "../types";

type OrderSummaryCardsProps = {
  counts: OrderCounts;
  t: (en: string, ar: string) => string;
};

function OrderSummaryCardsBase({ counts, t }: OrderSummaryCardsProps) {
  const kpis = [
    { label: t("Total Value", "إجمالي القيمة"), val: `${counts.totalValue.toLocaleString()} ر.س`, icon: DollarSign, color: "text-emerald-400", bg: "bg-emerald-500/5" },
    { label: t("Pending", "معلقة"),             val: counts.pending,                               icon: Clock,       color: "text-amber-400",  bg: "bg-amber-500/5"  },
    { label: t("Approved", "مكتملة"),           val: counts.approved,                              icon: CheckCircle, color: "text-emerald-400", bg: "bg-emerald-500/5" },
    { label: t("Rejected", "مرفوضة"),           val: counts.rejected,                              icon: XCircle,     color: "text-red-400",    bg: "bg-red-500/5"    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
      {kpis.map((kpi, i) => (
        <div key={i} className={`${kpi.bg} border border-slate-800 p-4 rounded-2xl flex flex-col justify-between min-h-[76px]`}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-slate-500 text-[10px] font-bold uppercase tracking-widest truncate mr-1">{kpi.label}</span>
            <kpi.icon size={13} className={`${kpi.color} shrink-0`} />
          </div>
          <p className={`text-xl font-black ${kpi.color} leading-tight truncate`}>{kpi.val}</p>
        </div>
      ))}
    </div>
  );
}

export const OrderSummaryCards = memo(OrderSummaryCardsBase);
