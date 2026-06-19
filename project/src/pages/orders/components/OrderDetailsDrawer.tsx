// =============================================================
// src/pages/orders/components/OrderDetailsDrawer.tsx
//
// The order detail modal. Composes:
//   - Header (doc title/number, status badge, print/close buttons)
//   - Party cards (requester / supplier)
//   - OrderProgressPanel (item list with qty badges)
//   - Notes
//   - Live total
//   - OrderApprovalPanel (status-driven footer actions)
// =============================================================

import { memo } from "react";
import { RefreshCw, X, Printer } from "lucide-react";
import type { ApprovedQtyMap, Order, OrderItem } from "../types";
import { calculateApprovedTotal } from "../utils/calculateApprovedTotal";
import { buildDocumentNumber } from "../utils/buildDocumentNumber";
import { StatusBadge } from "./StatusBadge";
import { OrderProgressPanel } from "./OrderProgressPanel";
import { OrderApprovalPanel } from "./OrderApprovalPanel";

type OrderDetailsDrawerProps = {
  detailOrder: Order;
  detailItems: OrderItem[];
  detailLoading: boolean;
  approvedQtyMap: ApprovedQtyMap;
  showPartialEditor: boolean;
  partialSaving: boolean;
  actionId: number | null;
  creatingMissingOrder: boolean;
  canAct: boolean;
  onClose: () => void;
  onPrint: () => void;
  onSetApprovedQty: (itemId: number, value: number, maxRequested: number, stockQty: number) => void;
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

function OrderDetailsDrawerBase({
  detailOrder, detailItems, detailLoading, approvedQtyMap, showPartialEditor, partialSaving,
  actionId, creatingMissingOrder, canAct, onClose, onPrint, onSetApprovedQty, onReject,
  onOpenPartialEditor, onCancelPartialEditor, onConfirmPartialApprove, onApproveAll,
  onApproveRemaining, onRejectRemaining, onCreateMissingOrder, isRTL, t,
}: OrderDetailsDrawerProps) {
  console.log("================================");
  console.log("ORDER ID:", detailOrder.id);
  console.log("REQUEST TYPE:", detailOrder.request_type);
  console.log("FULL ORDER:", detailOrder);
  console.log("================================");

  const detailDocTitle = detailOrder.request_type === "TRANSFER"
    ? t("Transfer Order", "طلب تحويل")
    : t("Purchase Order", "أمر شراء");
  const detailDocNumber = buildDocumentNumber(detailOrder.id, detailOrder.request_type);

  const liveTotal = showPartialEditor
    ? detailItems.reduce((s, i) => s + i.price * (approvedQtyMap[i.id] ?? i.quantity), 0)
    : calculateApprovedTotal(detailItems);
  const showOriginal = liveTotal !== detailOrder.total_amount && detailItems.length > 0;

  const isProcessing = partialSaving || actionId === detailOrder.id;

  return (
    <div className="fixed inset-0 z-[110] flex items-end lg:items-center justify-center lg:p-4 animate-in fade-in duration-200" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-slate-900 border border-slate-800 w-full max-w-2xl lg:rounded-3xl rounded-t-[2rem] shadow-2xl flex flex-col max-h-[94vh] overflow-hidden">

        {isProcessing && (
          <div className="absolute inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3 rounded-t-[2rem] lg:rounded-3xl">
            <RefreshCw size={32} className="text-blue-400 animate-spin" />
            <p className="text-blue-300 font-bold text-sm">{t("Processing...", "جاري المعالجة...")}</p>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0 bg-slate-900/80 backdrop-blur-md">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-lg font-black text-white">
                {detailDocTitle}
                <span className="font-mono text-slate-400 text-base mx-2">#{detailDocNumber}</span>
              </h2>
              <StatusBadge status={detailOrder.status} isRTL={isRTL} />
            </div>
            <p className="text-slate-500 text-[11px] mt-0.5">{new Date(detailOrder.created_at).toLocaleString()}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-3">
            <button onClick={onPrint} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white text-xs font-bold transition-all active:scale-95">
              <Printer size={15} /><span className="hidden sm:inline">{t("Print", "طباعة")}</span>
            </button>
            <button onClick={onClose} className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition-all active:scale-95"><X size={18} /></button>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto overscroll-contain flex-1 p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-3">
              <p className="text-[9px] font-bold text-slate-600 uppercase tracking-wider mb-1">{t("Requester", "الطالب")}</p>
              <p className="text-sm font-bold text-white truncate">{detailOrder.from_shop?.shop_name}</p>
            </div>
            <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-3">
              <p className="text-[9px] font-bold text-slate-600 uppercase tracking-wider mb-1">{t("Supplier", "المورد")}</p>
              <p className="text-sm font-bold text-white truncate">{detailOrder.to_shop?.shop_name}</p>
            </div>
          </div>

          <OrderProgressPanel
            detailOrder={detailOrder}
            detailItems={detailItems}
            detailLoading={detailLoading}
            showPartialEditor={showPartialEditor}
            approvedQtyMap={approvedQtyMap}
            onSetApprovedQty={onSetApprovedQty}
            t={t}
          />

          {detailOrder.notes && (
            <div className="bg-amber-500/5 border border-amber-500/10 p-4 rounded-xl">
              <p className="text-[9px] font-bold text-amber-500 uppercase mb-1 tracking-wider">{t("Notes", "ملاحظات")}</p>
              <p className="text-slate-300 text-sm italic leading-relaxed">"{detailOrder.notes}"</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-800 bg-slate-900 shrink-0 pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <div className="flex items-center justify-between mb-4">
            <div>
              <span className="text-slate-500 font-bold text-xs uppercase tracking-widest">{t("Total", "الإجمالي")}</span>
              {showOriginal && (
                <span className="block text-[9px] text-slate-600 mt-0.5 font-mono">
                  {t("Requested:", "مطلوب:")} {detailOrder.total_amount.toLocaleString()}
                </span>
              )}
            </div>
            <span className="text-2xl font-black text-emerald-400">{liveTotal.toLocaleString()}<span className="text-sm font-normal text-slate-400"> ر.س</span></span>
          </div>

          <OrderApprovalPanel
            detailOrder={detailOrder}
            detailItems={detailItems}
            approvedQtyMap={approvedQtyMap}
            canAct={canAct}
            showPartialEditor={showPartialEditor}
            partialSaving={partialSaving}
            actionId={actionId}
            creatingMissingOrder={creatingMissingOrder}
            onReject={onReject}
            onOpenPartialEditor={onOpenPartialEditor}
            onCancelPartialEditor={onCancelPartialEditor}
            onConfirmPartialApprove={onConfirmPartialApprove}
            onApproveAll={onApproveAll}
            onApproveRemaining={onApproveRemaining}
            onRejectRemaining={onRejectRemaining}
            onCreateMissingOrder={onCreateMissingOrder}
            isRTL={isRTL}
            t={t}
          />
        </div>
      </div>
    </div>
  );
}

export const OrderDetailsDrawer = memo(OrderDetailsDrawerBase);