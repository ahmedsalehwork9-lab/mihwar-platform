// =============================================================
// src/pages/orders/components/CreateOrderModal.tsx
//
// "New Order" creation modal: supplier select, product catalog
// with visibility/eligibility filtering, cart, notes, submit.
// Extracted out of OrdersPage.tsx (not in the originally requested
// file list, but required to keep the coordinator within the
// 300-500 line target — this modal alone was ~250 lines of JSX).
// =============================================================

import { memo } from "react";
import { X, Plus, Check, Search, RefreshCw, Save, AlertCircle, Trash2 } from "lucide-react";
import type { CartItem, Product, Shop } from "../types";
import { VisibilityBadge } from "./VisibilityBadge";

type ProductEligibility = { canView: boolean; canTransfer: boolean; canPurchase: boolean; requestType: "PURCHASE" | "TRANSFER" };

type CreateOrderModalProps = {
  shops: Shop[];
  ownedShopId: number | null | undefined;
  supplierShopId: number | "";
  onSupplierChange: (id: number | "") => void;
  requestTypeLabel: string;
  modalError: string | null;
  productSearch: string;
  onProductSearchChange: (v: string) => void;
  loadingProducts: boolean;
  filteredSupplierProducts: Product[];
  visibleSupplierProductsCount: number;
  getProductEligibility: (product: Product) => ProductEligibility;
  cart: CartItem[];
  cartTotal: number;
  onAddToCart: (product: Product) => void;
  onUpdateQty: (productId: number, qty: number) => void;
  onRemoveFromCart: (productId: number) => void;
  orderNotes: string;
  onOrderNotesChange: (v: string) => void;
  saving: boolean;
  onClose: () => void;
  onSubmit: () => void;
  isRTL: boolean;
  t: (en: string, ar: string) => string;
};

function CreateOrderModalBase({
  shops, ownedShopId, supplierShopId, onSupplierChange, requestTypeLabel, modalError,
  productSearch, onProductSearchChange, loadingProducts, filteredSupplierProducts,
  visibleSupplierProductsCount, getProductEligibility, cart, cartTotal, onAddToCart,
  onUpdateQty, onRemoveFromCart, orderNotes, onOrderNotesChange, saving, onClose, onSubmit, isRTL, t,
}: CreateOrderModalProps) {
  return (
    <div className="fixed inset-0 z-[110] flex items-end lg:items-center justify-center lg:p-4 animate-in fade-in duration-200" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-slate-900 border border-slate-800 w-full max-w-3xl lg:rounded-3xl rounded-t-[2rem] shadow-2xl flex flex-col max-h-[96vh] overflow-hidden">

        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 shrink-0">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-black text-white flex items-center gap-2">
              <Plus className="text-blue-400 shrink-0" size={20} />
              {t("Create Purchase Order", "إنشاء طلب شراء جديد")}
            </h2>
            {supplierShopId && (
              <p className="text-[10px] text-slate-500 mt-0.5 font-bold tracking-wide">
                {t("Type", "نوع الطلب")}: <span className="text-blue-400 mx-1">{requestTypeLabel}</span>
              </p>
            )}
          </div>
          <button onClick={onClose} className="p-2 text-slate-500 hover:text-white active:scale-90 transition-all shrink-0"><X size={22} /></button>
        </div>

        <div className="p-5 overflow-y-auto overscroll-contain space-y-5 flex-1">
          {modalError && (
            <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-2xl text-red-400 text-sm font-bold flex items-center gap-2" role="alert">
              <AlertCircle size={16} className="shrink-0" /> {modalError}
            </div>
          )}

          <div className="space-y-2">
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest">{t("Select Supplier", "اختر المحل المورد")}</label>
            <select
              value={supplierShopId}
              onChange={e => onSupplierChange(Number(e.target.value) || "")}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3.5 text-white focus:border-blue-500 outline-none transition-all cursor-pointer text-sm"
            >
              <option value="">{t("-- Select Supplier --", "-- اختر المورد --")}</option>
              {shops.filter(s => s.id !== ownedShopId).map(s => <option key={s.id} value={s.id}>{s.shop_name}</option>)}
            </select>
          </div>

          {supplierShopId && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest shrink-0">
                  {t("Available Catalog", "المنتجات المتوفرة")}
                  {visibleSupplierProductsCount > 0 && <span className="text-slate-600 font-normal normal-case ml-1">({visibleSupplierProductsCount})</span>}
                </h3>
                <div className="relative flex-1 max-w-[180px]">
                  <Search size={13} className={`absolute ${isRTL ? "right-2.5" : "left-2.5"} top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none`} />
                  <input
                    value={productSearch}
                    onChange={e => onProductSearchChange(e.target.value)}
                    placeholder={t("Search...", "بحث...")}
                    className={`w-full bg-slate-950 border border-slate-800 rounded-lg py-2 ${isRTL ? "pr-8 pl-3" : "pl-8 pr-3"} text-xs text-white outline-none focus:border-blue-500`}
                  />
                </div>
              </div>

              {loadingProducts ? (
                <div className="py-8 text-center"><RefreshCw className="animate-spin mx-auto text-blue-500" size={20} /></div>
              ) : filteredSupplierProducts.length === 0 ? (
                <div className="py-8 text-center text-slate-600 text-sm">{t("No available products from this supplier.", "لا توجد منتجات متاحة من هذا المورد.")}</div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto overscroll-contain">
                  {filteredSupplierProducts.map(p => {
                    const elig      = getProductEligibility(p);
                    const alreadyIn = cart.some(c => c.product.id === p.id);
                    return (
                      <div key={p.id} className="bg-slate-800/40 border border-slate-800 p-3 rounded-xl hover:border-blue-500/30 transition-all">
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <p className="text-white font-bold text-xs leading-snug flex-1 min-w-0 line-clamp-2">{p.part_name}</p>
                          <VisibilityBadge scope={p.visibility_scope} isRTL={isRTL} />
                        </div>
                        <p className="text-slate-500 text-[10px] font-mono mb-2.5">{p.part_number}</p>
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <span className="text-emerald-400 font-bold text-sm">{p.price.toLocaleString()}</span>
                            <span className="text-slate-600 text-[10px] mr-1">ر.س</span>
                            <span className="text-slate-600 text-[9px]">· {p.quantity} {t("in stock", "متوفر")}</span>
                          </div>
                          <button
                            onClick={() => onAddToCart(p)}
                            disabled={!elig.canView || alreadyIn}
                            className={`p-1.5 rounded-lg text-white transition-all active:scale-90 shrink-0 ${alreadyIn ? "bg-slate-700 cursor-default opacity-60" : elig.canView ? "bg-blue-600 hover:bg-blue-500" : "bg-slate-700 opacity-40 cursor-not-allowed"}`}
                          >
                            {alreadyIn ? <Check size={14} /> : <Plus size={14} />}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {cart.length > 0 && (
            <div className="space-y-3 pt-3 border-t border-slate-800">
              <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center justify-between">
                {t("Order Summary", "سلة الطلب")}
                <span className="text-emerald-400 font-black text-sm normal-case">{cartTotal.toLocaleString()} ر.س</span>
              </h3>
              <div className="space-y-2">
                {cart.map(c => (
                  <div key={c.product.id} className="bg-slate-950/40 px-3 py-2.5 rounded-xl flex items-center justify-between border border-slate-800/50">
                    <div className="flex-1 min-w-0 mr-3">
                      <p className="text-white font-bold text-xs truncate">{c.product.part_name}</p>
                      <p className="text-[10px] text-slate-500">{c.product.price.toLocaleString()} ر.س</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="flex items-center bg-slate-800 rounded-lg p-0.5 border border-slate-700">
                        <button onClick={() => onUpdateQty(c.product.id, c.quantity - 1)} className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-white text-sm font-bold transition-colors rounded-md active:bg-slate-700">−</button>
                        <span className="w-7 text-center font-black text-white text-sm">{c.quantity}</span>
                        <button onClick={() => onUpdateQty(c.product.id, c.quantity + 1)} className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-white text-sm font-bold transition-colors rounded-md active:bg-slate-700">+</button>
                      </div>
                      <button onClick={() => onRemoveFromCart(c.product.id)} className="text-slate-700 hover:text-red-400 p-1.5 active:scale-90 transition-all"><Trash2 size={15} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest">{t("Notes", "ملاحظات")}</label>
            <textarea
              value={orderNotes}
              onChange={e => onOrderNotesChange(e.target.value)}
              placeholder={t("Any special instructions...", "تعليمات خاصة...")}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3.5 text-white outline-none focus:border-blue-500 min-h-[80px] text-sm leading-relaxed transition-colors resize-none"
            />
          </div>
        </div>

        <div className="px-5 py-4 border-t border-slate-800 bg-slate-900 shrink-0 pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <button
            onClick={onSubmit}
            disabled={saving || cart.length === 0}
            className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white font-black rounded-2xl shadow-xl shadow-blue-900/20 active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-50 text-sm"
          >
            {saving ? <RefreshCw className="animate-spin" size={18} /> : <Save size={18} />}
            {t("Confirm & Send", "تأكيد وإرسال")}
            {cart.length > 0 && <span className="bg-white/20 px-2 py-0.5 rounded-lg text-xs font-bold">{cartTotal.toLocaleString()} ر.س</span>}
          </button>
        </div>
      </div>
    </div>
  );
}

export const CreateOrderModal = memo(CreateOrderModalBase);
