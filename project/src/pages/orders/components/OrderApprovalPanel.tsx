// =============================================================
// src/pages/orders/components/OrderApprovalPanel.tsx
//
// The footer action area inside the Order Details Drawer.
// Single source of truth for whether actions are shown:
// canActOnOrder(order) — true for "pending" and "partially_approved"
// (when the current user is authorized), false otherwise.
//
//   pending              → Reject / Partial / Approve All
//   pending + editor     → PartialApprovalEditor (Cancel / Confirm)
//   partially_approved   → Reject Remaining / Approve Remaining
//                           + FollowUpOrderCard (optional new order)
//   completed/approved   → read-only "Order Completed" banner
//   rejected             → read-only "Order Rejected" banner
//   pending (not yours)  → read-only "Awaiting supplier response"
// =============================================================

import { memo } from "react";
import { RefreshCw, XCircle, PackageCheck, SplitSquareHorizontal, Clock, ArrowRight } from "lucide-react";
import type { ApprovedQtyMap, Order, OrderItem } from "../types";
import { remainingQty } from "../utils/orderHelpers";
import { PartialApprovalEditor } from "./PartialApprovalEditor";
import { FollowUpOrderCard } from "./FollowUpOrderCard";

type OrderApprovalPanelProps = {
  detailOrder: Order;
  detailItems: OrderItem[];
  approvedQtyMap: ApprovedQtyMap;
  canAct: boolean;
  showPartialEditor: boolean;
  partialSaving: boolean;
  actionId: number | null;
  creatingMissingOrder: boolean;
  onReject: () => void;
  onOpenPartialEditor: () => void;
  onCancelPartialEditor: () => void;
  onConfirmPartialApprove: () => void;
  onApproveAll: () => void;
  onApproveRemaining: () => void;
  onRejectRemaining: () => void;
  onCreateMissingOrder: () => void;
  isRTL: boolean;
  t: (en: string, ar: string) => string;
};

function OrderApprovalPanelBase({
  detailOrder, detailItems, approvedQtyMap, canAct, showPartialEditor, partialSaving, actionId,
  creatingMissingOrder, onReject, onOpenPartialEditor, onCancelPartialEditor, onConfirmPartialApprove,
  onApproveAll, onApproveRemaining, onRejectRemaining, onCreateMissingOrder, isRTL, t,
}: OrderApprovalPanelProps) {
  const isBusy = actionId === detailOrder.id;

  // ── CASE A: Can act (pending OR partially_approved + authorized) ──
  if (canAct) {
    // PENDING: standard 3-button row
    if (detailOrder.status === "pending" && !showPartialEditor) {
      return (
        <div className="flex gap-2 flex-wrap">
          <button onClick={onReject} disabled={isBusy}
            className="flex-1 py-3 rounded-2xl border border-red-500/20 text-red-400 font-bold hover:bg-red-500/10 transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 text-sm min-w-[80px]">
            <XCircle size={16} /> {t("Reject", "رفض")}
          </button>
          <button onClick={onOpenPartialEditor} disabled={isBusy}
            className="flex-1 py-3 rounded-2xl border border-purple-500/30 text-purple-400 font-bold hover:bg-purple-500/10 transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 text-sm min-w-[80px]">
            <SplitSquareHorizontal size={16} /> {t("Partial", "جزئي")}
          </button>
          <button onClick={onApproveAll} disabled={isBusy}
            className="flex-[2] py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black shadow-lg shadow-emerald-900/20 transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 text-sm">
            {isBusy ? <RefreshCw className="animate-spin" size={16} /> : <PackageCheck size={16} />}
            {t("Approve All", "اعتماد الكل")}
          </button>
        </div>
      );
    }

    // PENDING + EDITOR OPEN: cancel / confirm partial
    if (detailOrder.status === "pending" && showPartialEditor) {
      return (
        <PartialApprovalEditor
          detailItems={detailItems}
          approvedQtyMap={approvedQtyMap}
          partialSaving={partialSaving}
          onCancel={onCancelPartialEditor}
          onConfirm={onConfirmPartialApprove}
          t={t}
        />
      );
    }

    // PARTIALLY_APPROVED: continue processing remaining quantities
    if (detailOrder.status === "partially_approved" && !showPartialEditor) {
      const approvedCount  = detailItems.filter(i => (i.approved_quantity ?? 0) > 0).length;
      const totalCount     = detailItems.length;
      const remainingItems = detailItems.filter(i => remainingQty(i) > 0);
      const totalApproved  = detailItems.reduce((s, i) => s + (i.approved_quantity != null && i.approved_quantity > 0 ? i.approved_quantity : 0), 0);
      const totalRequested = detailItems.reduce((s, i) => s + i.quantity, 0);
      const totalRemaining = totalRequested - totalApproved;
      const summaryText = isRTL
        ? `تم اعتماد ${totalApproved} من أصل ${totalRequested} وحدة (${approvedCount} من ${totalCount} صنف)`
        : `${totalApproved} of ${totalRequested} units approved (${approvedCount} of ${totalCount} items)`;
      const remainingSummaryText = isRTL
        ? `تم رفض ${totalRemaining} وحدة متبقية`
        : `${totalRemaining} remaining units were rejected`;

      return (
        <div className="space-y-3">
          <div className="bg-purple-500/10 border border-purple-500/20 rounded-2xl px-4 py-3 flex items-start gap-3">
            <SplitSquareHorizontal size={18} className="text-purple-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-purple-300 font-bold text-sm">{t("Partially Approved", "اعتماد جزئي")}</p>
              <p className="text-slate-400 text-xs mt-1">{summaryText}</p>
              {totalRemaining > 0 && (
                <p className="text-slate-400 text-xs mt-1">{remainingSummaryText}</p>
              )}
            </div>
          </div>

          {remainingItems.length > 0 && (
            <div className="bg-amber-500/5 border border-amber-500/15 rounded-2xl overflow-hidden">
              <div className="px-3 py-2 border-b border-amber-500/10 flex items-center justify-between">
                <p className="text-[10px] font-bold text-amber-400 uppercase tracking-widest">
                  {t("Remaining", "المتبقي")} ({remainingItems.reduce((s, i) => s + remainingQty(i), 0)} {t("units", "وحدة")})
                </p>
              </div>
              <div className="divide-y divide-amber-500/10">
                {remainingItems.map(i => (
                  <div key={i.id} className="px-3 py-2 flex items-center justify-between gap-2 text-xs">
                    <span className="text-white font-bold truncate flex-1">{i.product?.part_name}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-slate-500">{t("Req", "مطلوب")} <span className="text-white font-bold">{i.quantity}</span></span>
                      <ArrowRight size={10} className="text-slate-600" />
                      <span className="text-purple-400">{t("Appr", "معتمد")} <span className="text-purple-300 font-bold">{i.approved_quantity ?? 0}</span></span>
                      <ArrowRight size={10} className="text-slate-600" />
                      <span className="text-amber-400">{t("Rem", "متبقي")} <span className="text-amber-300 font-bold">{remainingQty(i)}</span></span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2 flex-wrap">
            <button onClick={onRejectRemaining} disabled={isBusy}
              className="flex-1 py-3 rounded-2xl border border-red-500/20 text-red-400 font-bold hover:bg-red-500/10 transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 text-sm min-w-[100px]">
              <XCircle size={15} /> {t("Reject Remaining", "رفض المتبقي")}
            </button>
            <button onClick={onApproveRemaining} disabled={isBusy}
              className="flex-[2] py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black shadow-lg shadow-emerald-900/20 transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 text-sm">
              {isBusy ? <RefreshCw className="animate-spin" size={16} /> : <PackageCheck size={16} />}
              {t("Approve Remaining", "اعتماد المتبقي")}
            </button>
          </div>

          {/* Optional: spin off a brand-new order for the remaining items instead of continuing this one */}
          <FollowUpOrderCard
            remainingItems={remainingItems}
            creating={creatingMissingOrder}
            onCreate={onCreateMissingOrder}
            isRTL={isRTL}
            t={t}
          />
        </div>
      );
    }

    // PARTIALLY_APPROVED + EDITOR (re-entered editor on a partial order)
    if (detailOrder.status === "partially_approved" && showPartialEditor) {
      return (
        <PartialApprovalEditor
          detailItems={detailItems}
          approvedQtyMap={approvedQtyMap}
          partialSaving={partialSaving}
          onCancel={onCancelPartialEditor}
          onConfirm={onConfirmPartialApprove}
          t={t}
        />
      );
    }
  }

  // ── CASE B: Read-only — completed / approved / rejected / not-your-pending ──
  return (
    <div>
      {(detailOrder.status === "completed" || detailOrder.status === "approved") && (
        <div className="flex items-center justify-center gap-2 py-3 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-emerald-400 font-bold text-sm">
          <PackageCheck size={18} />
          {t("Order Completed", "تم تنفيذ الطلب بالكامل")}
        </div>
      )}
      {detailOrder.status === "rejected" && (
        <div className="flex items-center justify-center gap-2 py-3 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 font-bold text-sm">
          <XCircle size={18} />
          {t("Order Rejected", "تم رفض الطلب")}
        </div>
      )}
      {detailOrder.status === "pending" && (
        <div className="flex items-center justify-center gap-2 py-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-amber-400 font-bold text-sm">
          <Clock size={18} />
          {t("Awaiting supplier response", "في انتظار رد المورد")}
        </div>
      )}
    </div>
  );
}

export const OrderApprovalPanel = memo(OrderApprovalPanelBase);
