// =============================================================
// src/pages/reports/reportsApi.ts
// طبقة جلب بيانات التقارير بصفحات (1000/صفحة) — لأن Supabase يقصّ النتائج عند 1000 صف بصمت.
// كل دالة تُرجع { rows, truncated, error } لتعرض الواجهة تحذيرًا صريحًا بدل أرقام ناقصة.
// قراءة فقط: لا كتابة ولا SQL ولا مفاتيح خدمة.
// =============================================================
import { supabase } from "../lib/supabase";
import type { GLSalesInvoice, GLPurchaseInvoice } from "../lib/accountingDb";
import type { OrderLite, StockProd } from "./reportsLogic";

export type Paged<T> = { rows: T[]; truncated: boolean; error: string | null };
const PAGE = 1000;
type PageRes = PromiseLike<{ data: unknown; error: { message: string } | null }>;

export async function pageAll<T>(run: (a: number, b: number) => PageRes, cap = 20000): Promise<Paged<T>> {
  const rows: T[] = [];
  for (let a = 0; a < cap; a += PAGE) {
    const { data, error } = await run(a, a + PAGE - 1);
    if (error) return { rows, truncated: false, error: error.message };
    const b = (data as T[] | null) ?? []; rows.push(...b);
    if (b.length < PAGE) return { rows, truncated: false, error: null };
  }
  return { rows, truncated: true, error: null };
}

export const fetchSalesPaged = (orgId: number, from: string, to: string, branchId: number | null, cap?: number): Promise<Paged<GLSalesInvoice>> =>
  pageAll<GLSalesInvoice>((a, b) => {
    let q = supabase.from("gl_sales_invoices").select("*").eq("organization_id", orgId).gte("date", from).lte("date", to)
      .order("date", { ascending: false }).order("id", { ascending: false }).range(a, b);
    if (branchId != null) q = q.eq("branch_id", branchId);
    return q;
  }, cap);

export const fetchPurchasesPaged = (orgId: number, from: string, to: string, branchId: number | null, cap?: number): Promise<Paged<GLPurchaseInvoice>> =>
  pageAll<GLPurchaseInvoice>((a, b) => {
    let q = supabase.from("gl_purchase_invoices").select("*").eq("organization_id", orgId).gte("date", from).lte("date", to)
      .order("date", { ascending: false }).order("id", { ascending: false }).range(a, b);
    if (branchId != null) q = q.eq("branch_id", branchId);
    return q;
  }, cap);

type ProdRow = { product_name: string | null; category: string | null; brand: string | null; quantity: number | null; price: number | null; min_quantity: number | null; reorder_level: number | null; shop_id: number | null };
/** أصناف الفروع المحددة (التكلفة = حقل price كما في بقية النظام). */
export async function fetchProductsPaged(shopIds: number[], cap = 20000): Promise<Paged<StockProd & { shop_id: number | null }>> {
  if (!shopIds.length) return { rows: [], truncated: false, error: null };
  const r = await pageAll<ProdRow>((a, b) => supabase.from("products").select("id, product_name, category, brand, quantity, price, min_quantity, reorder_level, shop_id")
    .in("shop_id", shopIds).order("id", { ascending: true }).range(a, b), cap);
  return {
    ...r, rows: r.rows.map((p) => ({
      name: p.product_name || "—", category: p.category, brand: p.brand, qty: Number(p.quantity) || 0, cost: Number(p.price) || 0,
      min_quantity: p.min_quantity == null ? null : Number(p.min_quantity), reorder_level: p.reorder_level == null ? null : Number(p.reorder_level), shop_id: p.shop_id,
    })),
  };
}

/** الطلبات المستلمة للفروع المحددة (جدول orders، حقل to_shop_id). */
export async function fetchOrdersPaged(shopIds: number[], cap = 20000): Promise<Paged<OrderLite & { id: number }>> {
  if (!shopIds.length) return { rows: [], truncated: false, error: null };
  return pageAll<OrderLite & { id: number }>((a, b) => supabase.from("orders").select("id, status, total_amount, created_at")
    .in("to_shop_id", shopIds).order("created_at", { ascending: false }).order("id", { ascending: false }).range(a, b), cap);
}

export type TopOrdered = { product_id: number; name: string; code: string; qty: number };
/** أكثر الأصناف طلبًا ضمن طلبات محددة (على دفعات 150 طلبًا لتفادي طول الرابط). */
export async function fetchTopOrdered(orderIds: number[], n = 5): Promise<TopOrdered[]> {
  const tot = new Map<number, TopOrdered>();
  for (let i = 0; i < orderIds.length && i < 3000; i += 150) {
    const { data, error } = await supabase.from("order_items").select("product_id, quantity, product:products(product_name, product_code)").in("order_id", orderIds.slice(i, i + 150));
    if (error) break;
    for (const it of (data as unknown as { product_id: number | null; quantity: number | null; product: { product_name: string | null; product_code: string | null } | { product_name: string | null; product_code: string | null }[] | null }[]) ?? []) {
      if (!it.product_id) continue;
      const pr = Array.isArray(it.product) ? it.product[0] : it.product;
      const cur = tot.get(it.product_id) ?? { product_id: it.product_id, name: pr?.product_name || "—", code: pr?.product_code || "—", qty: 0 };
      cur.qty += Number(it.quantity) || 0; tot.set(it.product_id, cur);
    }
  }
  return Array.from(tot.values()).sort((a, b) => b.qty - a.qty).slice(0, n);
}
