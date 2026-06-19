// =============================================================
// src/pages/orders/hooks/useOrderApproval.ts
//
// Owns all order-mutating actions:
//   - canActOnOrder: centralized gate (pending OR partially_approved
//     + authorized) — single source of truth for whether the
//     approval panel shows action buttons or a read-only banner.
//   - handleApprove: full approval (approves every requested qty)
//   - handlePartialApprove: saves editor map, sets partially_approved
//   - handleApproveRemaining: approves remaining qty, marks completed
//   - handleRejectRemaining: closes order without approving remainder
//   - handleReject: rejects a pending order outright
//   - handleCreateMissingOrder: spins off a new order for leftovers
//
// Order lifecycle:
//   pending → partially_approved → (more approvals allowed) → completed
//   completed only when approved_quantity === quantity for ALL items.
// =============================================================

import { useState, useCallback } from "react";
import { supabase } from "../../lib/supabase";
import type { ApprovedQtyMap, Order, OrderItem } from "../types";
import { remainingQty } from "../utils/orderHelpers";

type UseOrderApprovalArgs = {
  isAdmin: boolean;
  ownedShopId: number | null | undefined;
  detailItems: OrderItem[];
  approvedQtyMap: ApprovedQtyMap;
  setDetailOrder: React.Dispatch<React.SetStateAction<Order | null>>;
  setShowPartialEditor: (v: boolean) => void;
  refreshDetailItems: (orderId: number) => Promise<void>;
  fetchOrders: () => Promise<void>;
  showToast: (msg: string) => void;
  setGlobalError: (msg: string | null) => void;
  isRTL: boolean;
  t: (en: string, ar: string) => string;
};

export function useOrderApproval({
  isAdmin, ownedShopId, detailItems, approvedQtyMap, setDetailOrder, setShowPartialEditor,
  refreshDetailItems, fetchOrders, showToast, setGlobalError, isRTL, t,
}: UseOrderApprovalArgs) {
  const [actionId, setActionId] = useState<number | null>(null);
  const [partialSaving, setPartialSaving] = useState(false);
  const [creatingMissingOrder, setCreatingMissingOrder] = useState(false);

  // ── CENTRALIZED ACTION GATE ──
  // true  → supplier can still act: status is "pending" (initial approval)
  //         or "partially_approved" (continue remaining qty)
  // false → completed / approved / rejected, or not this user's order
  const canActOnOrder = useCallback((order: Order): boolean => {
    if (order.status !== "pending" && order.status !== "partially_approved") return false;
    if (isAdmin) return true;
    return order.to_shop_id === ownedShopId;
  }, [isAdmin, ownedShopId]);

  /**
   * Writes approved_quantity per item to DB.
   * fullApproval=true  → use requested qty for every item
   * fullApproval=false → use editor map (partial)
   * remainingOnly=true → only update items that still have remaining qty,
   *                      adding the editor value on top of what's already approved
   */
  const saveApprovedQtys = useCallback(async (
    fullApproval = false,
    remainingOnly = false,
  ): Promise<boolean> => {
    try {
      const itemsToUpdate = remainingOnly
        ? detailItems.filter(i => remainingQty(i) > 0)
        : detailItems;

      const updates = itemsToUpdate.map(i => {
        if (fullApproval) {
          return { id: i.id, approved_quantity: i.quantity };
        }
        if (remainingOnly) {
          const alreadyApproved = (i.approved_quantity != null && i.approved_quantity > 0) ? i.approved_quantity : 0;
          const addl = Math.min(approvedQtyMap[i.id] ?? remainingQty(i), remainingQty(i));
          return { id: i.id, approved_quantity: alreadyApproved + addl };
        }
        return { id: i.id, approved_quantity: approvedQtyMap[i.id] ?? i.quantity };
      });

      for (const u of updates) {
        const { data: upData, error: upErr } = await supabase
          .from("order_items")
          // approval_reviewed=true marks this as a real saved decision
          // (including a deliberate 0), so the next time this order is
          // opened, the editor shows the saved value instead of falling
          // back to min(requested, stock).
          .update({ approved_quantity: u.approved_quantity, approval_reviewed: true })
          .eq("id", u.id)
          .select("id, approved_quantity, approval_reviewed");

        if (upErr) throw upErr;
        // Supabase/PostgREST returns an empty array (not an error) when RLS
        // silently blocks the write or the row didn't match — this is the
        // exact failure mode that was masking the bug, so treat it as fatal.
        if (!upData || upData.length === 0) {
          throw new Error(
            `Update to order_items.id=${u.id} affected 0 rows (likely blocked by RLS policy).`
          );
        }
      }
      return true;
    } catch (e: any) {
      setGlobalError(e?.message ?? t("Failed to save approved quantities", "فشل حفظ الكميات المعتمدة"));
      return false;
    }
  }, [detailItems, approvedQtyMap, setGlobalError, t]);

  /** Full approval: approve all requested quantities, then run the approve_order RPC. */
  const handleApprove = useCallback(async (orderId: number) => {
    setActionId(orderId);
    setShowPartialEditor(false);
    try {
      const saved = await saveApprovedQtys(true);
      if (!saved) { setActionId(null); return; }

      const { error: rpcError } = await supabase.rpc("approve_order", { p_order_id: orderId });
      if (rpcError) { setGlobalError(rpcError.message); }
      else {
        setDetailOrder(prev => prev ? { ...prev, status: "completed" } : null);
        await fetchOrders();
        await refreshDetailItems(orderId);
        showToast(t("Order approved successfully ✓", "تم اعتماد الطلب وتحديث المخزون ✓"));
      }
    } catch (e: any) { setGlobalError(e?.message ?? t("Approval failed", "فشل اعتماد الطلب")); }
    finally { setActionId(null); }
  }, [saveApprovedQtys, fetchOrders, refreshDetailItems, showToast, setGlobalError, setDetailOrder, setShowPartialEditor, t]);

  /**
   * Partial approval: save editor values, mark order partially_approved.
   * Order stays open — supplier can continue processing remaining quantities later.
   */
  const handlePartialApprove = useCallback(async (orderId: number) => {
    const totalApproved = detailItems.reduce((s, i) => s + (approvedQtyMap[i.id] ?? i.quantity), 0);
    if (totalApproved === 0) {
      setGlobalError(isRTL
        ? "يجب اعتماد صنف واحد على الأقل."
        : "At least one item must be approved."
      );
      setShowPartialEditor(true);
      return;
    }

    setPartialSaving(true);
    setShowPartialEditor(false);
    try {
      const saved = await saveApprovedQtys(false);
      if (!saved) { setPartialSaving(false); return; }

      const { error: updateError } = await supabase
        .from("orders")
        .update({ status: "partially_approved" })
        .eq("id", orderId);
      if (updateError) { setGlobalError(updateError.message); setPartialSaving(false); return; }

      const totalRequested = detailItems.reduce((s, i) => s + i.quantity, 0);

      // Order stays "partially_approved" — not locked, supplier can act again.
      setDetailOrder(prev => prev ? { ...prev, status: "partially_approved" } : null);

      await fetchOrders();
      await refreshDetailItems(orderId);

      showToast(isRTL
        ? `تم الاعتماد الجزئي — ${totalApproved} من أصل ${totalRequested}`
        : `Partially approved — ${totalApproved} of ${totalRequested}`
      );
    } catch (e: any) { setGlobalError(e?.message ?? t("Partial approval failed", "فشل الاعتماد الجزئي")); }
    finally { setPartialSaving(false); }
  }, [saveApprovedQtys, detailItems, approvedQtyMap, isRTL, fetchOrders, refreshDetailItems, showToast, setGlobalError, setDetailOrder, setShowPartialEditor, t]);

  /**
   * Approve Remaining: approve all remaining (unfulfilled) quantities on top
   * of what's already approved, then mark the order completed.
   * Only relevant when status === "partially_approved".
   */
  const handleApproveRemaining = useCallback(async (orderId: number) => {
    setActionId(orderId);
    setShowPartialEditor(false);
    try {
      const saved = await saveApprovedQtys(false, true);
      if (!saved) { setActionId(null); return; }

      const { error: rpcError } = await supabase.rpc("approve_order", { p_order_id: orderId });
      if (rpcError) { setGlobalError(rpcError.message); }
      else {
        setDetailOrder(prev => prev ? { ...prev, status: "completed" } : null);
        await fetchOrders();
        await refreshDetailItems(orderId);
        showToast(t("Remaining quantities approved ✓", "تم اعتماد الكميات المتبقية ✓"));
      }
    } catch (e: any) { setGlobalError(e?.message ?? t("Approval failed", "فشل الاعتماد")); }
    finally { setActionId(null); }
  }, [saveApprovedQtys, fetchOrders, refreshDetailItems, showToast, setGlobalError, setDetailOrder, setShowPartialEditor, t]);

  /**
   * Reject Remaining: close the order without approving the unfulfilled quantities.
   * Already-approved quantities stand, so the order is COMPLETED (not rejected) —
   * the order was already partially fulfilled, so marking it "rejected" would
   * incorrectly discard the approved portion. Only relevant when
   * status === "partially_approved".
   */
  const handleRejectRemaining = useCallback(async (orderId: number) => {
    if (!confirm(t(
      "Reject remaining quantities and close this order?",
      "هل تريد رفض الكميات المتبقية وإغلاق الطلب؟"
    ))) return;
    setActionId(orderId);
    try {
      const { error: updateError } = await supabase
        .from("orders")
        .update({ status: "completed" })
        .eq("id", orderId);
      if (updateError) setGlobalError(updateError.message);
      else {
        setDetailOrder(prev => prev ? { ...prev, status: "completed" } : null);
        setShowPartialEditor(false);
        await fetchOrders();
        showToast(t("Remaining quantities rejected and order completed", "تم رفض الكميات المتبقية وإغلاق الطلب"));
      }
    } catch (e: any) { setGlobalError(e?.message ?? t("Rejection failed", "فشل الرفض")); }
    finally { setActionId(null); }
  }, [fetchOrders, showToast, setGlobalError, setDetailOrder, setShowPartialEditor, t]);

  /** Standard reject for a pending order. */
  const handleReject = useCallback(async (orderId: number) => {
    if (!confirm(t("Are you sure you want to reject this order?", "هل أنت متأكد من رفض هذا الطلب؟"))) return;
    setActionId(orderId);
    try {
      const { error: updateError } = await supabase
        .from("orders")
        .update({ status: "rejected" })
        .eq("id", orderId);
      if (updateError) setGlobalError(updateError.message);
      else {
        showToast(t("Order Rejected", "تم رفض الطلب"));
        setDetailOrder(prev => prev ? { ...prev, status: "rejected" } : null);
        setShowPartialEditor(false);
        await fetchOrders();
      }
    } catch (e: any) { setGlobalError(e?.message ?? t("Rejection failed", "فشل رفض الطلب")); }
    finally { setActionId(null); }
  }, [fetchOrders, showToast, setGlobalError, setDetailOrder, setShowPartialEditor, t]);

  /** Spins off a brand-new order pre-filled with the unfulfilled (remaining) items. */
  const handleCreateMissingOrder = useCallback(async (detailOrder: Order | null) => {
    if (!detailOrder) return;
    const missingItems = detailItems.filter(i => remainingQty(i) > 0);
    if (missingItems.length === 0) return;
    setCreatingMissingOrder(true);
    try {
      const missingTotal = missingItems.reduce((s, i) => s + i.price * remainingQty(i), 0);
      const { data: newOrder, error: orderErr } = await supabase
        .from("orders")
        .insert({
          from_shop_id: detailOrder.from_shop_id,
          to_shop_id:   detailOrder.to_shop_id,
          status:       "pending",
          total_amount: missingTotal,
          notes:        isRTL
            ? `طلب متابعة للأصناف الناقصة من الطلب #${detailOrder.id}`
            : `Follow-up order for missing items from order #${detailOrder.id}`,
          request_type: detailOrder.request_type ?? null,
        })
        .select()
        .single();
      if (orderErr) throw orderErr;
      const { error: itemsErr } = await supabase.from("order_items").insert(
        missingItems.map(i => ({
          order_id:   newOrder.id,
          product_id: i.product_id,
          quantity:   remainingQty(i),
          price:      i.price,
        }))
      );
      if (itemsErr) throw itemsErr;
      await fetchOrders();
      showToast(isRTL ? "تم إنشاء طلب الأصناف الناقصة بنجاح ✓" : "Missing items order created ✓");
    } catch (e: any) {
      setGlobalError(e?.message ?? (isRTL ? "فشل إنشاء الطلب" : "Failed to create order"));
    } finally {
      setCreatingMissingOrder(false);
    }
  }, [detailItems, isRTL, fetchOrders, showToast, setGlobalError]);

  return {
    actionId, partialSaving, creatingMissingOrder,
    canActOnOrder,
    handleApprove, handlePartialApprove, handleApproveRemaining,
    handleRejectRemaining, handleReject, handleCreateMissingOrder,
  };
}
