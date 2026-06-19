// =============================================================
// src/pages/orders/components/OrdersMobileCards.tsx
// Mobile (lg:hidden) card list of orders.
// =============================================================

import { memo } from "react";
import { Package, ArrowRightLeft } from "lucide-react";
import type { Order } from "../types";
import { StatusBadge } from "./StatusBadge";

type OrdersMobileCardsProps = {
  orders: Order[];
  onOpenDetail: (order: Order) => void;
  isRTL: boolean;
  t: (en: string, ar: string) => string;
};

function OrdersMobileCardsBase({ orders, onOpenDetail, isRTL, t }: OrdersMobileCardsProps) {
  if (orders.length === 0) {
    return (
      <div className="lg:hidden py-16 text-center text-slate-600 bg-slate-900/30 rounded-3xl border border-dashed border-slate-800">
        <Package size={36} className="mx-auto mb-3 opacity-20" />
        <p className="text-sm">{t("No orders matching your criteria", "لا توجد طلبات مطابقة")}</p>
      </div>
    );
  }

  return (
    <div className="lg:hidden space-y-2.5">
      {orders.map(o => (
        <button
          key={o.id}
          onClick={() => onOpenDetail(o)}
          aria-label={t(`View order #${o.id}`, `عرض الطلب رقم ${o.id}`)}
          className="w-full text-right bg-slate-900 border border-slate-800 rounded-2xl p-4 active:scale-[0.98] hover:border-slate-700 transition-all block"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-white font-mono font-black text-sm">#{o.id.toString().padStart(5, "0")}</span>
            <StatusBadge status={o.status} isRTL={isRTL} />
          </div>
          <div className="flex items-center gap-2 bg-slate-950/40 rounded-xl px-3 py-2 border border-slate-800/50 mb-3">
            <div className="flex-1 min-w-0">
              <p className="text-[9px] text-slate-600 uppercase font-bold leading-none mb-0.5">{t("From", "من")}</p>
              <p className="text-xs text-white font-bold truncate">{o.from_shop?.shop_name}</p>
            </div>
            <ArrowRightLeft size={12} className="text-slate-700 shrink-0" />
            <div className="flex-1 min-w-0 text-left">
              <p className="text-[9px] text-slate-600 uppercase font-bold leading-none mb-0.5">{t("To", "إلى")}</p>
              <p className="text-xs text-white font-bold truncate">{o.to_shop?.shop_name}</p>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div className="text-slate-500 text-[11px] space-y-0.5">
              <p className="flex items-center gap-1"><Package size={11} />{o.order_items?.length || 0} {t("items", "أصناف")}</p>
              <p>{new Date(o.created_at).toLocaleDateString()}</p>
            </div>
            <span className="text-emerald-400 font-black text-lg leading-none">
              {o.total_amount.toLocaleString()}<span className="text-[10px] font-normal text-slate-500"> ر.س</span>
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}

export const OrdersMobileCards = memo(OrdersMobileCardsBase);
