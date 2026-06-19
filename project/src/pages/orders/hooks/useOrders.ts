
// =============================================================
// src/pages/orders/hooks/useOrders.ts
//
// Owns: orders list, shops list, requester shop, tab/status/search
// filters, pagination, and the derived counts used by KPI cards.
// =============================================================
 
import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../../lib/supabase";
import type { Order, Shop, OrderTab, OrderStatusFilter, OrderCounts } from "../types";
import { PAGE_SIZE } from "../types";
 
type UseOrdersArgs = {
  isAdmin: boolean;
  ownedShopId: number | null | undefined;
  t: (en: string, ar: string) => string;
};
 
export function useOrders({ isAdmin, ownedShopId, t }: UseOrdersArgs) {
  const [orders, setOrders]               = useState<Order[]>([]);
  const [shops, setShops]                 = useState<Shop[]>([]);
  const [requesterShop, setRequesterShop] = useState<Shop | null>(null);
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState<string | null>(null);
 
  const [tab, setTab]                   = useState<OrderTab>("all");
  const [statusFilter, setStatusFilter] = useState<OrderStatusFilter>("all");
  const [search, setSearch]             = useState("");
  const [page, setPage]                 = useState(1);
 
  const fetchOrders = useCallback(async () => {
    if (!isAdmin && !ownedShopId) return;
    setLoading(true);
    try {
      let query = supabase
        .from("orders")
        .select(`
          *,
          from_shop:shops!orders_from_shop_id_fkey(
            shop_name, phone, whatsapp, email,
            website, commercial_registration, address, logo_url
          ),
          to_shop:shops!orders_to_shop_id_fkey(
            shop_name, phone, whatsapp, email,
            website, commercial_registration, address, logo_url
          ),
          order_items(id)
        `);
      if (!isAdmin) query = query.or(`from_shop_id.eq.${ownedShopId},to_shop_id.eq.${ownedShopId}`);
      const { data, error: fetchError } = await query.order("created_at", { ascending: false });
      if (fetchError) setError(fetchError.message);
      else setOrders((data as Order[]) || []);
    } catch (e: any) {
      setError(e?.message ?? t("Failed to load orders", "فشل تحميل الطلبات"));
    } finally {
      setLoading(false);
    }
  }, [isAdmin, ownedShopId, t]);
 
  const fetchShops = useCallback(async () => {
    try {
      const { data } = await supabase
        .from("shops")
        .select("id, shop_name, group_id, organization_id")
        .order("shop_name");
      const list = (data as Shop[]) || [];
      setShops(list);
      if (ownedShopId) setRequesterShop(list.find(s => s.id === ownedShopId) ?? null);
    } catch {
      // Non-critical
    }
  }, [ownedShopId]);
 
  useEffect(() => { fetchOrders(); fetchShops(); }, [fetchOrders, fetchShops]);
 
  const { filtered, counts } = useMemo(() => {
    const q = search.trim().toLowerCase();
    let pendingCount = 0, approvedCount = 0, rejectedCount = 0, completedCount = 0, partialCount = 0;
    let totalValue = 0, incomingCount = 0, outgoingCount = 0;
    const result: Order[] = [];
    for (const o of orders) {
      if (o.status === "pending")                 pendingCount++;
      else if (o.status === "approved")           approvedCount++;
      else if (o.status === "rejected")           rejectedCount++;
      else if (o.status === "completed")          completedCount++;
      else if (o.status === "partially_approved") partialCount++;
      totalValue += o.total_amount;
      if (!isAdmin) {
        if (o.to_shop_id === ownedShopId)   incomingCount++;
        if (o.from_shop_id === ownedShopId) outgoingCount++;
      }
      const matchesTab    = isAdmin ? true : tab === "incoming" ? o.to_shop_id === ownedShopId : tab === "outgoing" ? o.from_shop_id === ownedShopId : true;
      const matchesStatus = statusFilter === "all" || o.status === statusFilter;
      const matchesSearch = !q || String(o.id).includes(q) || o.from_shop?.shop_name?.toLowerCase().includes(q) || o.to_shop?.shop_name?.toLowerCase().includes(q);
      if (matchesTab && matchesStatus && matchesSearch) result.push(o);
    }
    const counts: OrderCounts = {
      all: orders.length,
      incoming: isAdmin ? orders.length : incomingCount,
      outgoing: isAdmin ? orders.length : outgoingCount,
      pending: pendingCount,
      approved: approvedCount + completedCount,
      rejected: rejectedCount,
      partial: partialCount,
      totalValue,
    };
    return { filtered: result, counts };
  }, [orders, tab, statusFilter, search, ownedShopId, isAdmin]);
 
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageItems   = useMemo(() => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filtered, page]);
 
  const handleTabChange    = useCallback((v: OrderTab) => { setTab(v); setPage(1); }, []);
  const handleStatusFilter = useCallback((v: OrderStatusFilter) => { setStatusFilter(v); setPage(1); }, []);
  const handleSearchChange = useCallback((v: string) => { setSearch(v); setPage(1); }, []);
 
  return {
    orders, shops, requesterShop, loading, error, setError,
    fetchOrders,
    tab, statusFilter, search, page,
    handleTabChange, handleStatusFilter, handleSearchChange, setPage,
    filtered, counts, totalPages, pageItems,
  };
}