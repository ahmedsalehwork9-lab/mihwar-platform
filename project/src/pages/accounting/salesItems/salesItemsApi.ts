// =============================================================
// src/pages/accounting/salesItems/salesItemsApi.ts
// قراءة فقط: فواتير المبيعات المرحَّلة + المرتجعات + تكلفة الوحدة من حركات المخزون. صفحات 1000 صف.
// =============================================================
import { supabase } from "../../lib/supabase";
import type { MoveCosts, ProductInfo, RawInvoice, RawReturn } from "./salesItemsLogic";

const PAGE = 1000;
type Row = Record<string, unknown>;
async function paged(build: (a: number, b: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<{ rows: Row[]; error: string | null; truncated: boolean }> {
  const rows: Row[] = [];
  for (let from = 0; from < 50000; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) return { rows, error: error.message, truncated: false };
    const b = (data as Row[] | null) || []; rows.push(...b);
    if (b.length < PAGE) return { rows, error: null, truncated: false };
  }
  return { rows, error: null, truncated: true };
}
const INV_COLS = "id, invoice_no, invoice_year, date, branch_id, customer_name, payment_type, items";

export type SalesData = { invoices: RawInvoice[]; returns: RawReturn[]; originals: Map<number, RawInvoice>; moves: MoveCosts; prods: Map<number, ProductInfo>; error: string | null; truncated: boolean };

export async function fetchSalesData(orgId: number, from: string, to: string, branchId: number | null): Promise<SalesData> {
  const empty = { invoices: [], returns: [], originals: new Map<number, RawInvoice>(), moves: new Map<string, number>(), prods: new Map<number, ProductInfo>() };
  const inv = await paged((a, b) => { let q = supabase.from("gl_sales_invoices").select(INV_COLS).eq("organization_id", orgId).eq("status", "posted").gte("date", from).lte("date", to); if (branchId != null) q = q.eq("branch_id", branchId); return q.order("date", { ascending: true }).order("id", { ascending: true }).range(a, b); });
  if (inv.error) return { ...empty, error: inv.error, truncated: false };
  const ret = await paged((a, b) => { let q = supabase.from("gl_sales_returns").select("id, return_no, return_year, date, branch_id, customer_name, original_invoice_id, items").eq("organization_id", orgId).eq("status", "posted").gte("date", from).lte("date", to); if (branchId != null) q = q.eq("branch_id", branchId); return q.order("id", { ascending: true }).range(a, b); });
  const invoices = inv.rows as unknown as RawInvoice[]; const returns = ret.error ? [] : (ret.rows as unknown as RawReturn[]);
  const originals = new Map<number, RawInvoice>(invoices.map((i) => [i.id, i] as const));
  const missing = [...new Set(returns.map((r) => r.original_invoice_id))].filter((id) => !originals.has(id));
  for (let i = 0; i < missing.length; i += 200) {
    const { data } = await supabase.from("gl_sales_invoices").select(INV_COLS).eq("organization_id", orgId).in("id", missing.slice(i, i + 200));
    for (const o of ((data as unknown as RawInvoice[] | null) || [])) originals.set(o.id, o);
  }
  const ids = [...originals.keys()]; const moves: MoveCosts = new Map();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabase.from("gl_stock_moves").select("product_id, ref_id, unit_cost").eq("organization_id", orgId).eq("move_type", "sale_out").eq("ref_type", "gl_sales_invoices").in("ref_id", ids.slice(i, i + 200));
    for (const m of ((data as { product_id: number; ref_id: number; unit_cost: unknown }[] | null) || [])) { const c = Number(m.unit_cost); if (Number.isFinite(c)) moves.set(`${m.ref_id}:${m.product_id}`, c); }
  }
  // بطاقات الأصناف (المجموعة/الماركة/سعر البيع) — اختيارية: أي فشل لا يمنع التقرير
  const prods = new Map<number, ProductInfo>();
  const pids = new Set<number>();
  for (const o of originals.values()) for (const it of (Array.isArray(o.items) ? (o.items as Record<string, unknown>[]) : [])) { const pid = Number(it.product_id); if (Number.isFinite(pid) && it.product_id != null) pids.add(pid); }
  const plist = [...pids];
  for (let i = 0; i < plist.length; i += 200) {
    const { data, error } = await supabase.from("products").select("id, category, brand, selling_price").in("id", plist.slice(i, i + 200));
    if (error) break;
    for (const p of ((data as { id: number; category: string | null; brand: string | null; selling_price: unknown }[] | null) || [])) { const sp = Number(p.selling_price); prods.set(Number(p.id), { category: p.category, brand: p.brand, selling_price: p.selling_price != null && Number.isFinite(sp) ? sp : null }); }
  }
  return { invoices, returns, originals, moves, prods, error: ret.error, truncated: inv.truncated };
}
