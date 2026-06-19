// =============================================================
// src/pages/orders/hooks/useCreateOrder.ts
//
// Owns the "New Order" creation flow: supplier selection, product
// fetching + visibility/eligibility filtering, cart, notes, submit.
// Extracted into its own hook (not in the originally requested list)
// purely to keep OrdersPage.tsx within the 300-500 line coordinator
// target — this logic alone was ~150 lines in the monolith.
// =============================================================

import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../../lib/supabase";
import {
  filterVisibleProducts,
  type ProductVisibilityContext,
} from "../../lib/visibility";
import {
  determineProcurementEligibility,
  canRequestProduct,
  getRequestLabel,
  type ProcurementContext,
} from "../../lib/procurementEngine";
import type { CartItem, Product, Shop } from "../types";

type UseCreateOrderArgs = {
  isAdmin: boolean;
  ownedShopId: number | null | undefined;
  shops: Shop[];
  requesterShop: Shop | null;
  lang: "ar" | "en";
  fetchOrders: () => Promise<void>;
  showToast: (msg: string) => void;
  t: (en: string, ar: string) => string;
};

export function useCreateOrder({
  isAdmin, ownedShopId, shops, requesterShop, lang, fetchOrders, showToast, t,
}: UseCreateOrderArgs) {
  const [showModal, setShowModal]               = useState(false);
  const [supplierShopId, setSupplierShopId]     = useState<number | "">("");
  const [supplierProducts, setSupplierProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts]   = useState(false);
  const [productSearch, setProductSearch]       = useState("");
  const [cart, setCart]                         = useState<CartItem[]>([]);
  const [orderNotes, setOrderNotes]             = useState("");
  const [modalError, setModalError]             = useState<string | null>(null);
  const [saving, setSaving]                     = useState(false);

  useEffect(() => {
    if (!supplierShopId) { setSupplierProducts([]); return; }
    setLoadingProducts(true);
    supabase
      .from("products")
      .select("*, visibility_scope")
      .eq("shop_id", supplierShopId)
      .gt("quantity", 0)
      .order("part_name")
      .then(({ data, error: fetchError }) => {
        if (fetchError) { setModalError(fetchError.message); setSupplierProducts([]); }
        else setSupplierProducts((data as Product[]) || []);
        setLoadingProducts(false);
      });
  }, [supplierShopId]);

  const resolvedSupplierShop = useMemo<Shop | null>(
    () => supplierShopId ? (shops.find(s => s.id === supplierShopId) ?? null) : null,
    [supplierShopId, shops]
  );

  const buildVisibilityContext = useCallback(
    (product: Product, supplierShopData: Shop | null): ProductVisibilityContext => ({
      requesterShopId:         ownedShopId ?? null,
      supplierShopId:          product.shop_id,
      requesterGroupId:        requesterShop?.group_id ?? null,
      supplierGroupId:         supplierShopData?.group_id ?? null,
      visibilityScope:         product.visibility_scope ?? null,
      requesterOrganizationId: requesterShop?.organization_id ?? null,
      supplierOrganizationId:  supplierShopData?.organization_id ?? null,
    }),
    [ownedShopId, requesterShop]
  );

  const buildProcurementContext = useCallback(
    (supplierShopData: Shop | null): ProcurementContext => ({
      requesterOrganizationId: requesterShop?.organization_id ?? null,
      supplierOrganizationId:  supplierShopData?.organization_id ?? null,
      requesterGroupId:        requesterShop?.group_id ?? null,
      supplierGroupId:         supplierShopData?.group_id ?? null,
      requesterShopId:         ownedShopId ?? null,
      supplierShopId:          supplierShopData?.id ?? null,
    }),
    [ownedShopId, requesterShop]
  );

  const getProductEligibility = useCallback(
    (product: Product) => {
      if (isAdmin) return { canView: true, canTransfer: true, canPurchase: true, requestType: "PURCHASE" as const };
      return determineProcurementEligibility(
        buildProcurementContext(resolvedSupplierShop),
        buildVisibilityContext(product, resolvedSupplierShop)
      );
    },
    [isAdmin, buildProcurementContext, buildVisibilityContext, resolvedSupplierShop]
  );

  const requestTypeLabel = useMemo(() => {
    const elig = determineProcurementEligibility(buildProcurementContext(resolvedSupplierShop));
    return getRequestLabel(elig.requestType, lang);
  }, [buildProcurementContext, resolvedSupplierShop, lang]);

  const visibleSupplierProducts = useMemo<Product[]>(() => {
    if (isAdmin) return supplierProducts;
    const scopeFiltered = filterVisibleProducts(
      supplierProducts,
      (p) => buildVisibilityContext(p, resolvedSupplierShop)
    );
    return scopeFiltered.filter(p => {
      try {
        return determineProcurementEligibility(
          buildProcurementContext(resolvedSupplierShop),
          buildVisibilityContext(p, resolvedSupplierShop)
        ).canView;
      } catch { return false; }
    });
  }, [isAdmin, supplierProducts, resolvedSupplierShop, buildVisibilityContext, buildProcurementContext]);

  const filteredSupplierProducts = useMemo(() => {
    if (!productSearch.trim()) return visibleSupplierProducts;
    const q = productSearch.toLowerCase();
    return visibleSupplierProducts.filter(p =>
      p.part_name.toLowerCase().includes(q) || p.part_number.toLowerCase().includes(q)
    );
  }, [visibleSupplierProducts, productSearch]);

  const addToCart = useCallback((product: Product) => {
    if (!isAdmin) {
      const visCtx = buildVisibilityContext(product, resolvedSupplierShop);
      if (!canRequestProduct(visCtx)) {
        setModalError(t("This product is not available to your shop.", "هذا المنتج غير متاح لمحلك.")); return;
      }
      if (!determineProcurementEligibility(buildProcurementContext(resolvedSupplierShop), visCtx).canView) {
        setModalError(t("This product is not eligible for your shop.", "هذا المنتج غير مؤهل لمحلك.")); return;
      }
    }
    setCart(prev => prev.find(c => c.product.id === product.id) ? prev : [...prev, { product, quantity: 1 }]);
  }, [isAdmin, buildVisibilityContext, buildProcurementContext, resolvedSupplierShop, t]);

  const updateQty = useCallback((productId: number, qty: number) => {
    const max = visibleSupplierProducts.find(p => p.id === productId)?.quantity ?? 1;
    setCart(prev => prev.map(c => c.product.id === productId ? { ...c, quantity: Math.max(1, Math.min(qty, max)) } : c));
  }, [visibleSupplierProducts]);

  const removeFromCart = useCallback((productId: number) => {
    setCart(prev => prev.filter(i => i.product.id !== productId));
  }, []);

  const cartTotal = useMemo(() => cart.reduce((s, c) => s + c.product.price * c.quantity, 0), [cart]);

  const resetModal = useCallback(() => {
    setShowModal(false);
    setCart([]);
    setSupplierShopId("");
    setOrderNotes("");
    setModalError(null);
  }, []);

  const handleSubmit = useCallback(async () => {
    setModalError(null);
    if (!supplierShopId || cart.length === 0) {
      setModalError(t("Please select a supplier and add items", "اختر المورد وأضف أصنافاً")); return;
    }
    if (!isAdmin) {
      const procCtx = buildProcurementContext(resolvedSupplierShop);
      const invalid = cart.filter(c => {
        try { return !determineProcurementEligibility(procCtx, buildVisibilityContext(c.product, resolvedSupplierShop)).canView; }
        catch { return true; }
      });
      if (invalid.length > 0) {
        setModalError(t(
          "Some products in your cart are no longer available to your shop. Please remove them and try again.",
          "بعض المنتجات في سلتك لم تعد متاحة لمحلك. يرجى إزالتها والمحاولة مجدداً."
        )); return;
      }
    }
    setSaving(true);
    try {
      // Defensive readiness check: if a supplier shop id is selected but
      // resolvedSupplierShop hasn't resolved to an actual Shop yet (e.g. the
      // shops list was still loading, or a race between selecting a supplier
      // and the shops state updating), buildProcurementContext(null) would
      // silently produce supplierOrganizationId: null, making
      // isSameOrganization() return false even when the real shops share the
      // same organization/group — causing a Transfer to be miscomputed as a
      // Purchase. Fail loudly here instead of letting that happen silently.
      if (supplierShopId && !resolvedSupplierShop) {
        throw new Error(
          t(
            "Supplier shop data is not ready yet. Please wait a moment and try again.",
            "بيانات المورد لم تُحمَّل بالكامل بعد. يرجى الانتظار لحظة والمحاولة مرة أخرى."
          )
        );
      }

      const eligibility = determineProcurementEligibility(buildProcurementContext(resolvedSupplierShop));

      if (!eligibility?.requestType) {
        throw new Error(
          t(
            "Unable to determine request type",
            "تعذر تحديد نوع الطلب"
          )
        );
      }

      const insertPayload = {
        from_shop_id: ownedShopId,
        to_shop_id: supplierShopId,
        request_type: eligibility.requestType,
        status: "pending",
        total_amount: cartTotal,
        notes: orderNotes || null,
      };

      // TEMP DEBUG
      console.log("REQUEST TYPE:", eligibility.requestType);
      console.log("INSERT PAYLOAD:", insertPayload);

      const { data: oData, error: oErr } = await supabase
        .from("orders")
        .insert(insertPayload)
        .select()
        .single();
      if (oErr) throw oErr;

      // TEMP DEBUG
      console.log("ORDER CREATED:", oData);

      const { error: iErr } = await supabase.from("order_items").insert(
        cart.map(c => ({ order_id: oData.id, product_id: c.product.id, quantity: c.quantity, price: c.product.price }))
      );
      if (iErr) throw iErr;
      resetModal();
      await fetchOrders();
      showToast(t("Order sent successfully ✓", "تم إرسال الطلب بنجاح ✓"));
    } catch (e: any) { setModalError(e?.message ?? t("Failed to create order", "فشل إنشاء الطلب")); }
    finally { setSaving(false); }
  }, [supplierShopId, cart, cartTotal, orderNotes, ownedShopId, isAdmin, buildVisibilityContext, buildProcurementContext, resolvedSupplierShop, fetchOrders, showToast, resetModal, t]);

  return {
    showModal, setShowModal,
    supplierShopId, setSupplierShopId,
    loadingProducts, productSearch, setProductSearch,
    cart, orderNotes, setOrderNotes, modalError, saving,
    requestTypeLabel, filteredSupplierProducts, visibleSupplierProducts,
    getProductEligibility, addToCart, updateQty, removeFromCart, cartTotal,
    handleSubmit, resetModal,
  };
}