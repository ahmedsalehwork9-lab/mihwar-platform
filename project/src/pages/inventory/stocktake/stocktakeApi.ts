// =============================================================
// src/pages/inventory/stocktake/stocktakeApi.ts
// قراءة أصناف الفرع + تطبيق تسوية الجرد (حركة adjust لكل صنف + قيد مجمّع اختياري).
// لا يعدّل أي دالة قائمة؛ يستعمل createEntry كما هي. التطبيق غير ذرّي (يُذكر في الواجهة).
// =============================================================
import { supabase } from "../../lib/supabase";
import * as DB from "../../lib/accountingDb";
import type { CountItem, DiffRow, HistMove } from "./stocktakeLogic";
import { r2, r3 } from "./stocktakeLogic";

const PAGE = 1000;
export async function fetchCountItems(shopId: number): Promise<{ items: CountItem[]; error: string | null }> {
  const items: CountItem[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from("products").select("id, product_code, product_name, brand, category, barcode, quantity, price")
      .eq("shop_id", shopId).order("product_name", { ascending: true }).order("id", { ascending: true }).range(from, from + PAGE - 1);
    if (error) { console.error("fetchCountItems", error); return { items, error: error.message }; }
    const rows = (data as Record<string, unknown>[]) || [];
    for (const r of rows) items.push({ id: Number(r.id), code: (r.product_code as string | null) ?? null, name: String(r.product_name ?? "—"), brand: (r.brand as string | null) ?? null, category: (r.category as string | null) ?? null, barcode: (r.barcode as string | null) ?? null, book: Number(r.quantity) || 0, cost: Number(r.price) || 0 });
    if (rows.length < PAGE) break;
  }
  return { items, error: null };
}

export async function fetchCurrentQty(ids: number[]): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase.from("products").select("id, quantity").in("id", ids.slice(i, i + 200));
    if (error) { console.error("fetchCurrentQty", error); continue; }
    for (const r of (data as { id: number; quantity: number }[]) || []) out.set(Number(r.id), Number(r.quantity) || 0);
  }
  return out;
}

export type ApplyArgs = { orgId: number; branchId: number | null; no: string; reason: string; date: string; userId: string | null; rows: DiffRow[]; gl: { inventoryAccountId: number; counterAccountId: number } | null };
export type ApplyResult = { applied: { id: number; name: string; delta: number; value: number }[]; skipped: number; failed: { id: number; name: string; error: string }[]; entryId: number | null; glError: string | null };

/** لكل صنف: يقرأ الرصيد الحالي، يسجّل حركة adjust بالفرق إلى الكمية المعدودة، ثم يحدّث الرصيد (ويحذف الحركة إن فشل التحديث). */
export async function applyStocktake(a: ApplyArgs): Promise<ApplyResult> {
  const res: ApplyResult = { applied: [], skipped: 0, failed: [], entryId: null, glError: null };
  for (const r of a.rows) {
    if (r.actual == null) { res.skipped++; continue; }
    const { data: p, error: pe } = await supabase.from("products").select("quantity, price").eq("id", r.item.id).single();
    if (pe || !p) { res.failed.push({ id: r.item.id, name: r.item.name, error: pe?.message || "تعذّر قراءة الصنف" }); continue; }
    const cur = Number((p as { quantity: number }).quantity) || 0; const cost = Number((p as { price: number }).price) || 0; const delta = r3(r.actual - cur);
    if (delta === 0) { res.skipped++; continue; }
    const { data: mv, error: me } = await supabase.from("gl_stock_moves").insert({
      organization_id: a.orgId, branch_id: a.branchId, product_id: r.item.id, move_type: "adjust", qty: delta, unit_cost: cost,
      ref_type: "stocktake", ref_id: null, notes: `${a.no}: ${a.reason}`, created_by: a.userId,
    }).select("id").single();
    if (me || !mv) { res.failed.push({ id: r.item.id, name: r.item.name, error: me?.message || "تعذّر تسجيل الحركة" }); continue; }
    const { error: ue } = await supabase.from("products").update({ quantity: r.actual }).eq("id", r.item.id);
    if (ue) { await supabase.from("gl_stock_moves").delete().eq("id", (mv as { id: number }).id); res.failed.push({ id: r.item.id, name: r.item.name, error: ue.message }); continue; }
    res.applied.push({ id: r.item.id, name: r.item.name, delta, value: r2(delta * cost) });
  }
  if (a.gl && res.applied.length) {
    const s = r2(res.applied.filter((x) => x.delta > 0).reduce((t, x) => t + x.value, 0)); const d = r2(res.applied.filter((x) => x.delta < 0).reduce((t, x) => t + Math.abs(x.value), 0));
    const lines: DB.GLLine[] = [];
    if (s > 0) lines.push({ account_id: a.gl.inventoryAccountId, debit: s, credit: 0, branch_id: a.branchId }, { account_id: a.gl.counterAccountId, debit: 0, credit: s, branch_id: a.branchId });
    if (d > 0) lines.push({ account_id: a.gl.counterAccountId, debit: d, credit: 0, branch_id: a.branchId }, { account_id: a.gl.inventoryAccountId, debit: 0, credit: d, branch_id: a.branchId });
    if (lines.length) {
      const e = await DB.createEntry(a.orgId, { date: a.date, description: `تسوية جرد ${a.no} — ${a.reason}`, branch_id: a.branchId, entry_type: "adjustment", notes: null, status: "posted" }, lines);
      if (e.ok && e.id) res.entryId = e.id; else res.glError = e.error || "تعذّر إنشاء القيد";
    }
  }
  return res;
}

export async function fetchHistory(orgId: number, branchId: number | null): Promise<HistMove[]> {
  let q = supabase.from("gl_stock_moves").select("id, created_at, product_id, qty, unit_cost, notes").eq("organization_id", orgId).eq("ref_type", "stocktake");
  if (branchId != null) q = q.eq("branch_id", branchId);
  const { data, error } = await q.order("created_at", { ascending: false }).limit(3000);
  if (error) { console.error("fetchHistory", error); return []; }
  return (data as HistMove[]) || [];
}
