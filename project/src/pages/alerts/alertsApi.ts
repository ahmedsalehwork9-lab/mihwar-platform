// =============================================================
// src/pages/alerts/alertsApi.ts — قراءة فقط. بحث المخزون من الخادم (حدّ 1000 صف للاستعلام الواحد → تصفح بالصفحات).
// =============================================================
import { supabase } from "../lib/supabase";
import type { DraftEntry, StockRow } from "./alertsLogic";

const PAGE = 1000; const MAX_PAGES = 5;
const COLS = "id, product_name, product_code, quantity, min_quantity, reorder_level";

async function paged(build: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<{ rows: StockRow[]; truncated: boolean }> {
  const all: StockRow[] = [];
  for (let p = 0; p < MAX_PAGES; p++) {
    const { data, error } = await build(p * PAGE, p * PAGE + PAGE - 1); if (error) throw error;
    const rows = (data as StockRow[]) || []; all.push(...rows); if (rows.length < PAGE) return { rows: all, truncated: false };
  }
  return { rows: all, truncated: true };
}
/** أصناف الفرع التي كميتها ≤ الحد الافتراضي + كل صنف له حد خاص (لمقارنته محليًا). */
export async function fetchStockRows(shopId: number, def: number): Promise<{ rows: StockRow[]; truncated: boolean }> {
  const [a, b] = await Promise.all([
    paged((f, t) => supabase.from("products").select(COLS).eq("shop_id", shopId).lte("quantity", def).order("id").range(f, t)),
    paged((f, t) => supabase.from("products").select(COLS).eq("shop_id", shopId).or("min_quantity.gt.0,reorder_level.gt.0").order("id").range(f, t)),
  ]);
  const m = new Map<number, StockRow>(); for (const r of [...a.rows, ...b.rows]) m.set(r.id, r);
  return { rows: [...m.values()], truncated: a.truncated || b.truncated };
}
export async function fetchDraftEntries(orgId: number, branchId: number | null): Promise<DraftEntry[]> {
  let q = supabase.from("gl_journal_entries").select("id, entry_no, entry_year, date, description, status").eq("organization_id", orgId).eq("status", "draft").order("date", { ascending: true }).limit(500);
  if (branchId != null) q = q.eq("branch_id", branchId);
  const { data, error } = await q; if (error) throw error; return (data as DraftEntry[]) || [];
}
