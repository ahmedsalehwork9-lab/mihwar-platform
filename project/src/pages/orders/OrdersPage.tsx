// =============================================================
// src/pages/orders/OrdersPage.tsx
//
// Coordinator page. Wires useAuth/useLang with useOrders,
// useOrderDetails, useOrderApproval, and useCreateOrder, then
// renders the extracted presentational components. Contains no
// large templates, no print HTML, no approval business logic —
// those all live in hooks/, components/, print/, and utils/.
// =============================================================

import { useState, useCallback } from "react";
import { ShoppingCart, RefreshCw, Plus, Check, AlertCircle, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useLang } from "../../context/LanguageContext";

import { useOrders } from "./hooks/useOrders";
import { useOrderDetails } from "./hooks/useOrderDetails";
import { useOrderApproval } from "./hooks/useOrderApproval";
import { useCreateOrder } from "./hooks/useCreateOrder";

import { OrderSummaryCards } from "./components/OrderSummaryCards";
import { OrderFilters } from "./components/OrderFilters";
import { OrdersMobileCards } from "./components/OrdersMobileCards";
import { OrdersTable } from "./components/OrdersTable";
import { OrderDetailsDrawer } from "./components/OrderDetailsDrawer";
import { CreateOrderModal } from "./components/CreateOrderModal";

export default function OrdersPage() {
  const { ownedShopId, isAdmin } = useAuth() as any;
  const { t, isRTL } = useLang();
  const lang: "ar" | "en" = isRTL ? "ar" : "en";

  const [toast, setToast] = useState<string | null>(null);
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }, []);

  // ── Orders list: fetch, filter, paginate ──
  const {
    shops, requesterShop, loading, error, setError, fetchOrders,
    tab, statusFilter, search, page, setPage,
    handleTabChange, handleStatusFilter, handleSearchChange,
    counts, totalPages, pageItems,
  } = useOrders({ isAdmin, ownedShopId, t });

  // ── Order detail drawer: open/close, item fetch, print ──
  const {
    detailOrder, setDetailOrder, detailItems, detailLoading,
    showPartialEditor, setShowPartialEditor, approvedQtyMap,
    openDetail, closeDetail, handlePrint,
    refreshDetailItems, setApprovedQty, resetEditorToCurrent,
  } = useOrderDetails({ t, lang, setGlobalError: setError });

  // ── Approval actions: approve / partial / approve-remaining / reject ──
  const {
    actionId, partialSaving, creatingMissingOrder, canActOnOrder,
    handleApprove, handlePartialApprove, handleApproveRemaining,
    handleRejectRemaining, handleReject, handleCreateMissingOrder,
  } = useOrderApproval({
    isAdmin, ownedShopId, detailItems, approvedQtyMap,
    setDetailOrder, setShowPartialEditor, refreshDetailItems, fetchOrders,
    showToast, setGlobalError: setError, isRTL, t,
  });

  // ── New Order creation modal ──
  const createOrder = useCreateOrder({
    isAdmin, ownedShopId, shops, requesterShop, lang, fetchOrders, showToast, t,
  });

  return (
    <div className="p-4 lg:p-8 min-h-screen pb-24 md:pb-10" dir={isRTL ? "rtl" : "ltr"}>

      {toast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[150] bg-emerald-600 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 pointer-events-none">
          <Check size={18} /> <span className="font-bold">{toast}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 rounded-lg shrink-0"><ShoppingCart size={22} className="text-blue-400" /></div>
            {t("Orders Management", "إدارة الطلبات")}
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            {counts.all} {t("total", "طلب إجمالي")} · {counts.pending} {t("pending", "معلق")}
            {counts.partial > 0 && ` · ${counts.partial} ${t("partial", "جزئي")}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchOrders} className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-all active:scale-95" aria-label={t("Refresh", "تحديث")}>
            <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
          </button>
          {!isAdmin && (
            <button onClick={() => createOrder.setShowModal(true)} className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-blue-900/20 active:scale-95 transition-all">
              <Plus size={18} /> {t("New Order", "طلب جديد")}
            </button>
          )}
        </div>
      </div>

      <OrderSummaryCards counts={counts} t={t} />

      <OrderFilters
        tab={tab}
        onTabChange={handleTabChange}
        statusFilter={statusFilter}
        onStatusFilterChange={handleStatusFilter}
        search={search}
        onSearchChange={handleSearchChange}
        isRTL={isRTL}
        t={t}
      />

      <OrdersMobileCards orders={pageItems} onOpenDetail={openDetail} isRTL={isRTL} t={t} />

      <OrdersTable
        orders={pageItems}
        ownedShopId={ownedShopId}
        onOpenDetail={openDetail}
        isRTL={isRTL}
        t={t}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
      />

      {error && (
        <div className="mt-4 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-3" role="alert">
          <AlertCircle size={18} className="shrink-0" />
          <p className="flex-1">{error}</p>
          <button onClick={() => setError(null)} className="text-slate-500 hover:text-white"><X size={16} /></button>
        </div>
      )}

      {detailOrder && (
        <OrderDetailsDrawer
          detailOrder={detailOrder}
          detailItems={detailItems}
          detailLoading={detailLoading}
          approvedQtyMap={approvedQtyMap}
          showPartialEditor={showPartialEditor}
          partialSaving={partialSaving}
          actionId={actionId}
          creatingMissingOrder={creatingMissingOrder}
          canAct={canActOnOrder(detailOrder)}
          onClose={closeDetail}
          onPrint={handlePrint}
          onSetApprovedQty={setApprovedQty}
          onReject={() => handleReject(detailOrder.id)}
          onOpenPartialEditor={() => setShowPartialEditor(true)}
          onCancelPartialEditor={resetEditorToCurrent}
          onConfirmPartialApprove={() => handlePartialApprove(detailOrder.id)}
          onApproveAll={() => handleApprove(detailOrder.id)}
          onApproveRemaining={() => handleApproveRemaining(detailOrder.id)}
          onRejectRemaining={() => handleRejectRemaining(detailOrder.id)}
          onCreateMissingOrder={() => handleCreateMissingOrder(detailOrder)}
          isRTL={isRTL}
          t={t}
        />
      )}

      {createOrder.showModal && (
        <CreateOrderModal
          shops={shops}
          ownedShopId={ownedShopId}
          supplierShopId={createOrder.supplierShopId}
          onSupplierChange={(id) => { createOrder.setSupplierShopId(id); }}
          requestTypeLabel={createOrder.requestTypeLabel}
          modalError={createOrder.modalError}
          productSearch={createOrder.productSearch}
          onProductSearchChange={createOrder.setProductSearch}
          loadingProducts={createOrder.loadingProducts}
          filteredSupplierProducts={createOrder.filteredSupplierProducts}
          visibleSupplierProductsCount={createOrder.visibleSupplierProducts.length}
          getProductEligibility={createOrder.getProductEligibility}
          cart={createOrder.cart}
          cartTotal={createOrder.cartTotal}
          onAddToCart={createOrder.addToCart}
          onUpdateQty={createOrder.updateQty}
          onRemoveFromCart={createOrder.removeFromCart}
          orderNotes={createOrder.orderNotes}
          onOrderNotesChange={createOrder.setOrderNotes}
          saving={createOrder.saving}
          onClose={createOrder.resetModal}
          onSubmit={createOrder.handleSubmit}
          isRTL={isRTL}
          t={t}
        />
      )}
    </div>
  );
}