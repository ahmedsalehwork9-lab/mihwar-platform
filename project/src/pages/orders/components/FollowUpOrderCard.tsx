// =============================================================
// src/pages/orders/components/FollowUpOrderCard.tsx
//
// Shown on partially_approved orders: lists unfulfilled items and
// offers a button to spin off a brand-new follow-up order pre-filled
// with the remaining quantities. This is independent of (and
// complementary to) "Approve Remaining" / "Reject Remaining", which
// continue working the SAME order instead of creating a new one.
// =============================================================

import { memo } from "react";
import { RefreshCw, Plus } from "lucide-react";
import type { OrderItem } from "../types";
import { remainingQty } from "../utils/orderHelpers";

type FollowUpOrderCardProps = {
  remainingItems: OrderItem[];
  creating: boolean;
  onCreate: () => void;
  isRTL: boolean;
  t: (en: string, ar: string) => string;
};

function FollowUpOrderCardBase({ remainingItems, creating, onCreate, isRTL, t }: FollowUpOrderCardProps) {
  if (remainingItems.length === 0) return null;

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl overflow-hidden">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-3 py-2 border-b border-slate-700/40">
        {t("Unfulfilled Items", "الأصناف غير المنفذة")}
      </p>
      <div className="divide-y divide-slate-700/30">
        {remainingItems.map(i => {
          const appr = (i.approved_quantity != null && i.approved_quantity > 0) ? i.approved_quantity : 0;
          return (
            <div key={i.id} className="px-3 py-2 flex items-center justify-between gap-2 text-xs">
              <span className="text-white font-bold truncate flex-1">{i.product?.part_name}</span>
              <span className="text-slate-500 shrink-0">
                {isRTL
                  ? `مطلوب ${i.quantity} · معتمد ${appr} · ناقص ${remainingQty(i)}`
                  : `Req ${i.quantity} · Appr ${appr} · Missing ${remainingQty(i)}`}
              </span>
            </div>
          );
        })}
      </div>
      <div className="px-3 pb-3 pt-2">
        <button
          onClick={onCreate}
          disabled={creating}
          className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
        >
          {creating ? <RefreshCw size={13} className="animate-spin" /> : <Plus size={13} />}
          {t("Create New Order For Missing Items", "إنشاء طلب جديد للأصناف الناقصة")}
        </button>
      </div>
    </div>
  );
}

export const FollowUpOrderCard = memo(FollowUpOrderCardBase);
