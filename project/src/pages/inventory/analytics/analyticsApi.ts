// =============================================================
// src/pages/inventory/analytics/analyticsApi.ts
// قراءة فقط (RLS يحدد المؤسسة/الفروع). جلب مُقسَّم بصفحات 1000 صف بأعمدة محددة (لا select *).
// لا كتابة ولا RPC جديد. السقف الأعلى يُعاد كـ truncated لتظهر للمستخدم رسالة واضحة.
// =============================================================
import { supabase } from "../../lib/supabase";
import type { DocLine, Mv, Prod, PurchDoc, SaleDoc } from "./analyticsLogic";

const PAGE = 1000;
type Row = Record<string, unknown>;
const num = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const numOrNull = (v: unknown): number | null => { if (v == null || v === "") return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
const str = (v: unknown): string | null => (v == null || v === "" ? null : String(v));

export type Paged<T> = { rows: T[]; truncated: boolean; error: string | null };

async function paged(build: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>, cap: number): Promise<Paged<Row>> {
  const rows: Row[] = [];
  for (let from = 0; from < cap; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) return { rows, truncated: false, error: error.message };
    const batch = (data as Row[] | null) || []; rows.push(...batch);
    if (batch.length < PAGE) return { rows, truncated: false, error: null };
  }
  return { rows, truncated: true, error: null };
}

export async function fetchProducts(orgId: number): Promise<Paged<Prod>> {
  const r = await paged((a, b) => supabase.from("products")
    .select("id, product_code, product_name, brand, category, quantity, price, selling_price, min_quantity, reorder_level, shop_id, warehouse_id, created_at")
    .eq("organization_id", orgId).order("id", { ascending: true }).range(a, b), 100000);
  return { ...r, rows: r.rows.map((x): Prod => ({
    id: num(x.id), code: str(x.product_code), name: String(x.product_name ?? ""), brand: str(x.brand), category: str(x.category),
    qty: num(x.quantity), cost: num(x.price), sell: numOrNull(x.selling_price), minQty: numOrNull(x.min_quantity), reorder: numOrNull(x.reorder_level),
    branchId: numOrNull(x.shop_id), whId: numOrNull(x.warehouse_id), createdAt: str(x.created_at),
  })) };
}

export async function fetchMoves(orgId: number): Promise<Paged<Mv>> {
  const r = await paged((a, b) => supabase.from("gl_stock_moves")
    .select("id, product_id, created_at, move_type, qty, unit_cost, ref_type, ref_id, notes, warehouse_id, branch_id")
    .eq("organization_id", orgId).order("id", { ascending: true }).range(a, b), 100000);
  return { ...r, rows: r.rows.map((x): Mv => ({
    id: num(x.id), product_id: num(x.product_id), created_at: String(x.created_at ?? ""), move_type: String(x.move_type ?? ""), qty: num(x.qty), unit_cost: numOrNull(x.unit_cost),
    ref_type: str(x.ref_type), ref_id: numOrNull(x.ref_id), notes: str(x.notes), warehouse_id: numOrNull(x.warehouse_id), branch_id: numOrNull(x.branch_id),
  })) };
}

function linesOf(items: unknown, qtyKey: string, totalKeys: string[]): DocLine[] {
  if (!Array.isArray(items)) return [];
  return (items as Row[]).map((l): DocLine => {
    const qty = num(l[qtyKey] ?? l.qty ?? l.quantity);
    let total = 0; for (const k of totalKeys) { if (l[k] != null) { total = num(l[k]); break; } }
    if (!total) total = qty * num(l.unit_price ?? l.unit_cost ?? l.price);
    return { productId: numOrNull(l.product_id), code: str(l.product_code ?? l.code), desc: String(l.description ?? l.name ?? ""), qty, total };
  });
}

export async function fetchSaleDocs(orgId: number): Promise<Paged<SaleDoc>> {
  const [inv, ret] = await Promise.all([
    paged((a, b) => supabase.from("gl_sales_invoices").select("id, invoice_no, invoice_year, date, branch_id, warehouse_id, status, items")
      .eq("organization_id", orgId).order("id", { ascending: true }).range(a, b), 50000),
    paged((a, b) => supabase.from("gl_sales_returns").select("id, return_no, return_year, date, branch_id, status, items")
      .eq("organization_id", orgId).order("id", { ascending: true }).range(a, b), 50000),
  ]);
  const docs: SaleDoc[] = [
    ...inv.rows.map((x): SaleDoc => ({ id: num(x.id), no: num(x.invoice_no), year: num(x.invoice_year), date: String(x.date ?? ""), branchId: numOrNull(x.branch_id), warehouseId: numOrNull(x.warehouse_id), status: str(x.status), kind: "sale", lines: linesOf(x.items, "qty", ["line_total", "total"]) })),
    ...ret.rows.map((x): SaleDoc => ({ id: num(x.id) + 1e9, no: num(x.return_no), year: num(x.return_year), date: String(x.date ?? ""), branchId: numOrNull(x.branch_id), warehouseId: null, status: str(x.status), kind: "return", lines: linesOf(x.items, "qty", ["line_total", "total"]) })),
  ];
  return { rows: docs, truncated: inv.truncated || ret.truncated, error: inv.error || ret.error };
}

export async function fetchPurchaseDocs(orgId: number): Promise<Paged<PurchDoc>> {
  const r = await paged((a, b) => supabase.from("gl_purchase_invoices").select("id, invoice_no, invoice_year, date, branch_id, supplier_name, status, total, items")
    .eq("organization_id", orgId).order("id", { ascending: true }).range(a, b), 50000);
  return { ...r, rows: r.rows.map((x): PurchDoc => ({ id: num(x.id), no: num(x.invoice_no), year: num(x.invoice_year), date: String(x.date ?? ""), branchId: numOrNull(x.branch_id), supplier: String(x.supplier_name ?? "").trim(), status: str(x.status), total: num(x.total), lines: linesOf(x.items, "qty", ["line_total", "total"]) })) };
}
