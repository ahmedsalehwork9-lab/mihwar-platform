// =============================================================
// src/pages/inventory/itemMovement/movementApi.ts
// قراءة فقط: بحث الأصناف + حركات صنف من gl_stock_moves. لا كتابة.
// =============================================================
import { supabase } from "../../lib/supabase";
import type { Move } from "./movementLogic";
import { orgProductsFilter } from "../../lib/orgProducts";

export type ItemRow = {
  id: number; product_code: string | null; product_name: string; brand: string | null; model: string | null; barcode: string | null; category: string | null;
  quantity: number; price: number | null; selling_price: number | null; min_quantity: number | null; reorder_level: number | null; shop_id: number | null; product_image_url: string | null; warehouse_id: number | null;
};
const COLS = "id, product_code, product_name, brand, model, barcode, category, quantity, price, selling_price, min_quantity, reorder_level, shop_id, product_image_url, warehouse_id";
const clean = (s: string): string => s.replace(/[%,()*\\]/g, " ").trim();

export async function searchItems(orgId: number, query: string, limit = 25): Promise<ItemRow[]> {
  const q = clean(query);
  let b = supabase.from("products").select(COLS).or(await orgProductsFilter(orgId));
  if (q) b = b.or(`product_name.ilike.%${q}%,product_code.ilike.%${q}%,barcode.ilike.%${q}%,brand.ilike.%${q}%`);
  const { data, error } = await b.order("product_name", { ascending: true }).limit(limit);
  if (error) { console.error("searchItems", error); return []; }
  return (data as ItemRow[]) || [];
}
export async function fetchItem(orgId: number, id: number): Promise<ItemRow | null> {
  const { data, error } = await supabase.from("products").select(COLS).or(await orgProductsFilter(orgId)).eq("id", id).maybeSingle();
  if (error) { console.error("fetchItem", error); return null; }
  return (data as ItemRow) || null;
}
export async function fetchMoves(orgId: number, productId: number): Promise<{ rows: Move[]; error: string | null }> {
  const { data, error } = await supabase.from("gl_stock_moves")
    .select("id, created_at, move_type, qty, unit_cost, ref_type, ref_id, notes, warehouse_id, branch_id")
    .eq("organization_id", orgId).eq("product_id", productId).order("created_at", { ascending: true }).order("id", { ascending: true }).limit(5000);
  if (error) { console.error("fetchMoves", error); return { rows: [], error: error.message }; }
  return { rows: (data as Move[]) || [], error: null };
}

export type ShopHead = { shop_name?: string; logo_url?: string; tax_number?: string; address?: string } | null;
export async function fetchShopHead(shopId: number): Promise<ShopHead> {
  const { data, error } = await supabase.from("shops").select("shop_name, logo_url, tax_number, address").eq("id", shopId).maybeSingle();
  if (error) { console.error("fetchShopHead", error); return null; }
  return (data as ShopHead) || null;
}

// ── المستندات المرتبطة بالصنف (قراءة فقط) ──
import type { RawDoc, DocKind } from "./movementLogic";
type DocQ = { table: string; kind: DocKind; noCol: string; yearCol: string; partyCol: string; byProduct: boolean };
const DOC_QS: DocQ[] = [
  { table: "gl_purchase_invoices", kind: "purchase", noCol: "invoice_no", yearCol: "invoice_year", partyCol: "supplier_name", byProduct: true },
  { table: "gl_purchase_returns", kind: "purchase_return", noCol: "return_no", yearCol: "return_year", partyCol: "supplier_name", byProduct: true },
  { table: "gl_sales_invoices", kind: "sale", noCol: "invoice_no", yearCol: "invoice_year", partyCol: "customer_name", byProduct: false },
  { table: "gl_sales_returns", kind: "sale_return", noCol: "return_no", yearCol: "return_year", partyCol: "customer_name", byProduct: false },
];
/** المشتريات/مرتجعاتها تُفلتر في الخادم بـ product_id؛ المبيعات تُجلب (آخر 2000) لأن القديمة بلا product_id وتُطابَق وصفيًا. */
export async function fetchItemDocuments(orgId: number, productId: number): Promise<{ docs: RawDoc[]; error: string | null }> {
  const errs: string[] = [];
  const parts = await Promise.all(DOC_QS.map(async (q) => {
    let b = supabase.from(q.table).select(`id, ${q.noCol}, ${q.yearCol}, date, ${q.partyCol}, status, items`).eq("organization_id", orgId);
    if (q.byProduct) b = b.contains("items", [{ product_id: productId }]);
    const { data, error } = await b.order("date", { ascending: false }).limit(2000);
    if (error) { console.error("fetchItemDocuments", q.table, error); errs.push(`${q.table}: ${error.message}`); return [] as RawDoc[]; }
    return ((data as unknown as Record<string, unknown>[]) || []).map((r): RawDoc => ({
      kind: q.kind, id: Number(r.id), no: Number(r[q.noCol]), year: Number(r[q.yearCol]), date: String(r.date ?? ""),
      party: (r[q.partyCol] as string | null) ?? null, status: (r.status as string | null) ?? null, items: r.items,
    }));
  }));
  return { docs: parts.flat(), error: errs.length ? errs.join(" | ") : null };
}
