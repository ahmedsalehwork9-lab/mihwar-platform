// =============================================================
// src/pages/orders/components/OrderProgressPanel.tsx
// =============================================================

import { memo, useCallback, useId } from "react";
import { Package } from "lucide-react";
import type { ApprovedQtyMap, Order, OrderItem } from "../types";
import { effectiveApproved, remainingQty } from "../utils/orderHelpers";

type OrderProgressPanelProps = {
  detailOrder: Order;
  detailItems: OrderItem[];
  detailLoading: boolean;
  showPartialEditor: boolean;
  approvedQtyMap: ApprovedQtyMap;
  onSetApprovedQty: (itemId: number, value: number, maxRequested: number, stockQty: number) => void;
  t: (en: string, ar: string) => string;
};

function sanitizeQty(raw: number, max: number): number {
  if (!Number.isFinite(raw)) return 0;
  const intVal = Math.trunc(raw);
  if (intVal < 0) return 0;
  if (intVal > max) return max;
  return intVal;
}

function OrderProgressPanelBase({
  detailOrder, detailItems, detailLoading, showPartialEditor, approvedQtyMap, onSetApprovedQty, t,
}: OrderProgressPanelProps) {
  const idPrefix = useId();

  const handleApprovedChange = useCallback(
    (itemId: number, rawValue: number, maxRequested: number, stockQty: number) => {
      const max = Math.min(maxRequested, stockQty);
      const clamped = sanitizeQty(rawValue, max);
      onSetApprovedQty(itemId, clamped, maxRequested, stockQty);
    },
    [onSetApprovedQty]
  );

  // ── Helper: resolve product name with fallback ─────────────────
  // After the DB migration, columns are product_name / product_code.
  // Old rows or cached data may still have part_name / part_number.
  // This helper tries both so the drawer never shows an empty name.
  const getProductName = (item: OrderItem): string =>
    (item.product as any)?.product_name ??
    (item.product as any)?.part_name ??
    t("Unknown Product", "منتج غير معروف");

  const getProductCode = (item: OrderItem): string =>
    (item.product as any)?.product_code ??
    (item.product as any)?.part_number ??
    "—";

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
          <Package size={13} /> {t("Items", "الأصناف")}
        </h3>
        {showPartialEditor && (
          <span className="text-[9px] font-bold text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-full">
            {t("Edit Mode", "وضع التعديل")}
          </span>
        )}
      </div>

      {detailLoading ? (
        <div className="py-10 text-center">
          <svg className="animate-spin mx-auto text-blue-500" width="24" height="24" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.2" />
            <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
        </div>
      ) : (
        <div className="space-y-2">
          {detailItems.map(item => {
            const dbApproved     = (item.approved_quantity != null && item.approved_quantity > 0) ? item.approved_quantity : 0;
            const remaining      = remainingQty(item);
            const stockQty       = item.product?.quantity ?? item.quantity;
            const isPartialOrder = detailOrder.status === "partially_approved";
            const maxApprovable  = Math.min(item.quantity, stockQty);
            const editorVal      = approvedQtyMap[item.id] ?? maxApprovable;
            const dispQty        = showPartialEditor ? editorVal : effectiveApproved(item);
            const lineTotal      = item.price * dispQty;
            const isOverMax      = editorVal > maxApprovable;
            const isOutOfStock   = stockQty === 0;
            const isShortStock   = stockQty > 0 && stockQty < item.quantity;
            const inputId        = `${idPrefix}-approved-${item.id}`;

            // ── Resolved name/code (migration-safe) ───────────────
            const productName = getProductName(item);
            const productCode = getProductCode(item);

            const stockBadgeClasses = isOutOfStock
              ? "bg-red-500/10 border-red-500/20 text-red-400"
              : isShortStock
                ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
                : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400";

            const stockValueClasses = isOutOfStock
              ? "text-red-300"
              : isShortStock
                ? "text-amber-300"
                : "text-emerald-300";

            return (
              <div key={item.id} className="bg-slate-800/30 border border-slate-800/50 rounded-2xl overflow-hidden hover:border-slate-700 transition-colors">
                <div className="px-4 pt-3 pb-2">
                  <div className="flex justify-between items-start gap-3">
                    <div className="flex-1 min-w-0">
                      {/* ── FIX: use migration-safe name/code ── */}
                      <p className="text-white font-bold text-sm leading-snug">{productName}</p>
                      <p className="text-slate-500 text-[10px] font-mono mt-0.5 tracking-wide">{productCode}</p>
                    </div>
                    <div className="text-left shrink-0 pl-2">
                      <p className="text-white font-black text-sm tabular-nums">{lineTotal.toLocaleString()}<span className="text-[9px] font-normal text-slate-500"> {t("SAR", "ر.س")}</span></p>
                      <p className="text-slate-500 text-[10px] font-bold tabular-nums">{dispQty} × {item.price.toLocaleString()}</p>
                    </div>
                  </div>
                </div>

                <div className="px-3 pb-3 flex items-center gap-2 flex-wrap border-t border-slate-800/40 pt-2">
                  <span className="inline-flex items-center gap-1 bg-slate-800/60 border border-slate-700/50 rounded-lg px-2 py-1 text-[10px]">
                    <span className="text-slate-400 font-bold">{t("Req:", "مطلوب:")}</span>
                    <span className="font-black text-white">{item.quantity}</span>
                  </span>

                  {(isPartialOrder || showPartialEditor) && (
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] border transition-colors ${
                        showPartialEditor
                          ? "bg-purple-500/15 border-purple-500/40"
                          : "bg-purple-500/10 border-purple-500/20"
                      }`}
                    >
                      <label htmlFor={inputId} className="text-purple-400 font-bold whitespace-nowrap">
                        {t("Appr:", "معتمد:")}
                      </label>
                      {showPartialEditor ? (
                        <span className="flex items-center gap-1.5 flex-wrap">
                          <input
                            id={inputId}
                            type="number"
                            inputMode="numeric"
                            step={1}
                            min={0}
                            max={maxApprovable}
                            value={editorVal}
                            aria-label={t(
                              `Approved quantity for ${productName}`,
                              `الكمية المعتمدة لـ ${productName}`
                            )}
                            aria-invalid={isOverMax}
                            onChange={e => handleApprovedChange(item.id, e.target.valueAsNumber, item.quantity, stockQty)}
                            onKeyDown={e => {
                              if (e.key === "." || e.key === "-" || e.key === "e" || e.key === "+") {
                                e.preventDefault();
                              }
                            }}
                            className="w-16 min-w-0 bg-slate-900 border border-purple-500/40 rounded-md px-2 py-1.5 text-purple-300 font-bold text-xs leading-none outline-none focus-visible:ring-2 focus-visible:ring-purple-400 focus-visible:border-purple-400 text-center tabular-nums touch-manipulation"
                          />
                          {isOverMax && (
                            <span role="status" className="text-[9px] text-red-400 font-bold whitespace-nowrap">
                              {t("Max exceeded", "تجاوز الحد")}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="font-black text-purple-300">{dbApproved}</span>
                      )}
                    </span>
                  )}

                  {isPartialOrder && remaining > 0 && !showPartialEditor && (
                    <span className="inline-flex items-center gap-1 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2 py-1 text-[10px]">
                      <span className="text-amber-400 font-bold">{t("Rem:", "متبقي:")}</span>
                      <span className="font-black text-amber-300">{remaining}</span>
                    </span>
                  )}

                  {showPartialEditor && (
                    <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] border ${stockBadgeClasses}`}>
                      <span className="font-bold">{t("Stock:", "متوفر:")}</span>
                      <span className={`font-black ${stockValueClasses}`}>{stockQty}</span>
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export const OrderProgressPanel = memo(OrderProgressPanelBase);
