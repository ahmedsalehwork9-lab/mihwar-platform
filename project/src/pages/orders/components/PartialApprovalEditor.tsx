// =============================================================
// src/pages/orders/components/PartialApprovalEditor.tsx
//
// Footer UI shown while the approved-qty editor is open (entered
// via the "Partial" button on a pending order, or re-entered on a
// partially_approved order). Shows a live hint of whether this
// will result in a full or partial approval, plus Cancel/Confirm.
// =============================================================

import { memo } from "react";
import { RefreshCw, X, Check } from "lucide-react";
import type { ApprovedQtyMap, OrderItem } from "../types";

type PartialApprovalEditorProps = {
  detailItems: OrderItem[];
  approvedQtyMap: ApprovedQtyMap;
  partialSaving: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  t: (en: string, ar: string) => string;
};

function PartialApprovalEditorBase({
  detailItems, approvedQtyMap, partialSaving, onCancel, onConfirm, t,
}: PartialApprovalEditorProps) {
  const isPartiallySet = detailItems.some(i => (approvedQtyMap[i.id] ?? i.quantity) < i.quantity);

  return (
    <div className="space-y-3">
      <p className={`text-[10px] text-center font-bold ${isPartiallySet ? "text-purple-400" : "text-emerald-400"}`}>
        {isPartiallySet
          ? t("This order will be partially approved", "سيتم اعتماد الطلب جزئياً")
          : t("All quantities full — will fully approve", "جميع الكميات كاملة — سيتم الاعتماد الكامل")}
      </p>
      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 py-3 rounded-2xl border border-slate-700 text-slate-400 font-bold hover:bg-slate-800 transition-all text-sm flex items-center justify-center gap-2 active:scale-95"
        >
          <X size={15} /> {t("Cancel", "إلغاء")}
        </button>
        <button
          onClick={onConfirm}
          disabled={partialSaving}
          className="flex-[2] py-3 rounded-2xl bg-purple-600 hover:bg-purple-500 text-white font-black transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 text-sm"
        >
          {partialSaving ? <RefreshCw className="animate-spin" size={15} /> : <Check size={15} />}
          {t("Confirm Partial", "تأكيد جزئي")}
        </button>
      </div>
    </div>
  );
}

export const PartialApprovalEditor = memo(PartialApprovalEditorBase);
