// =============================================================
// src/pages/purchases/list/purchasesLogic.ts
// منطق قائمة فواتير المشتريات (نقي): الإثراء، الفلترة، الترتيب، المؤشرات، الفترة السابقة،
// السلسلة الشهرية، حصص الموردين، والأصناف التي تغيّر سعرها.
// =============================================================
export type PInvItem = { product_id: number | null; description: string; qty: number; unit_cost: number; line_total: number };
export type PInv = {
  id: number; invoice_no: number; invoice_year: number; supplier_invoice_no: string | null; date: string; due_date: string | null;
  supplier_name: string | null; purchase_kind: string; payment_type: string; paid_amount: number; subtotal: number; tax_rate: number; tax_amount: number;
  tax_inclusive: boolean; total: number; items: PInvItem[] | null; notes: string | null; entry_id: number | null; status: string; branch_id: number | null;
};
export type PayState = "paid" | "unpaid" | "partial" | "overdue";
export type RetStatus = "none" | "partial" | "full";
export type PRow = { inv: PInv; label: string; active: boolean; total: number; tax: number; paid: number; due: number; returned: number; retStatus: RetStatus; state: PayState; overdueDays: number };
export type PFilter = { q: string; supplier: string; pay: string; kind: string; state: "all" | PayState; returned: "all" | "any" };
export type SortKey = "no" | "date" | "supplier" | "total" | "due";
export const DEFAULT_PFILTER: PFilter = { q: "", supplier: "all", pay: "all", kind: "all", state: "all", returned: "all" };

export const r2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;
const r4 = (n: number): number => Math.round((Number(n) || 0) * 10000) / 10000;
const EPS = 0.005;
export const invLabel = (i: { invoice_no: number; invoice_year: number }): string => `PI-${i.invoice_year}-${String(i.invoice_no).padStart(4, "0")}`;
const INACTIVE = new Set(["cancelled", "canceled", "void", "voided", "deleted"]);
export const isActive = (status: string | null | undefined): boolean => !INACTIVE.has((status ?? "").toLowerCase());
const dayNum = (d: string): number => Math.round(Date.parse(d.slice(0, 10) + "T00:00:00Z") / 86400000);
export const addDaysStr = (d: string, n: number): string => new Date((dayNum(d) + n) * 86400000).toISOString().slice(0, 10);
export const daysBetween = (a: string, b: string): number => dayNum(b) - dayNum(a);

export function enrich(list: PInv[], retByInv: Record<number, number>, today: string): PRow[] {
  return list.map((inv) => {
    const total = r2(inv.total), paid = r2(inv.paid_amount), due = r2(Math.max(0, total - paid)), returned = r2(retByInv[inv.id] || 0);
    const retStatus: RetStatus = returned <= EPS ? "none" : returned >= total - EPS ? "full" : "partial";
    const overdueDays = due > EPS && inv.due_date && inv.due_date < today ? daysBetween(inv.due_date, today) : 0;
    const state: PayState = due <= EPS ? "paid" : overdueDays > 0 ? "overdue" : paid > EPS ? "partial" : "unpaid";
    return { inv, label: invLabel(inv), active: isActive(inv.status), total, tax: r2(inv.tax_amount), paid, due, returned, retStatus, state, overdueDays };
  });
}

export function filterRows(rows: PRow[], f: PFilter): PRow[] {
  const s = f.q.trim().toLowerCase();
  return rows.filter((r) => {
    if (f.supplier !== "all" && (r.inv.supplier_name ?? "") !== f.supplier) return false;
    if (f.pay !== "all" && r.inv.payment_type !== f.pay) return false;
    if (f.kind !== "all" && r.inv.purchase_kind !== f.kind) return false;
    if (f.state !== "all" && r.state !== f.state) return false;
    if (f.returned === "any" && r.retStatus === "none") return false;
    if (!s) return true;
    return r.label.toLowerCase().includes(s) || `${r.inv.invoice_no}/${r.inv.invoice_year}`.includes(s) || (r.inv.supplier_name ?? "").toLowerCase().includes(s) || (r.inv.supplier_invoice_no ?? "").toLowerCase().includes(s) || (r.inv.notes ?? "").toLowerCase().includes(s);
  });
}

export function sortRows(rows: PRow[], key: SortKey, dir: "asc" | "desc"): PRow[] {
  const m = dir === "asc" ? 1 : -1;
  const val = (r: PRow): number | string => key === "no" ? r.inv.invoice_year * 1e6 + r.inv.invoice_no : key === "date" ? r.inv.date : key === "supplier" ? (r.inv.supplier_name ?? "") : key === "total" ? r.total : r.due;
  return [...rows].sort((a, b) => { const x = val(a), y = val(b); const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y)); return c !== 0 ? c * m : (a.inv.id - b.inv.id) * m; });
}

export type PKpi = { count: number; subtotal: number; tax: number; total: number; paid: number; due: number; overdue: number; overdueCount: number; avg: number; returned: number; net: number };
/** المؤشرات على الفواتير الفعّالة فقط. */
export function kpis(rows: PRow[]): PKpi {
  const a = rows.filter((r) => r.active); const sum = (f: (r: PRow) => number): number => r2(a.reduce((s, r) => s + f(r), 0));
  const total = sum((r) => r.total), returned = sum((r) => r.returned);
  return { count: a.length, subtotal: sum((r) => r.inv.subtotal), tax: sum((r) => r.tax), total, paid: sum((r) => r.paid), due: sum((r) => r.due),
    overdue: sum((r) => (r.state === "overdue" ? r.due : 0)), overdueCount: a.filter((r) => r.state === "overdue").length, avg: a.length ? r2(total / a.length) : 0, returned, net: r2(total - returned) };
}

/** الفترة السابقة بنفس الطول مباشرة قبل from. */
export function prevPeriod(from: string, to: string): { from: string; to: string } {
  const days = Math.max(1, daysBetween(from, to) + 1); const pt = addDaysStr(from, -1); return { from: addDaysStr(pt, -(days - 1)), to: pt };
}
export const delta = (cur: number, prev: number): number | null => (prev > EPS ? r2(((cur - prev) / prev) * 100) : null);

/** مجاميع آخر n شهرًا تنتهي بشهر toDate (الفعّالة فقط)، بترتيب زمني. */
export function monthly(list: PInv[], toDate: string, n = 12): { key: string; total: number; count: number }[] {
  const [ty, tm] = [Number(toDate.slice(0, 4)), Number(toDate.slice(5, 7))]; const out: { key: string; total: number; count: number }[] = [];
  for (let i = n - 1; i >= 0; i--) { const idx = ty * 12 + (tm - 1) - i; out.push({ key: `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`, total: 0, count: 0 }); }
  const m = new Map(out.map((o) => [o.key, o]));
  for (const i of list) { if (!isActive(i.status)) continue; const o = m.get(i.date.slice(0, 7)); if (o) { o.total = r2(o.total + (Number(i.total) || 0)); o.count++; } }
  return out;
}

export function supplierTotals(rows: PRow[]): { label: string; value: number }[] {
  const m = new Map<string, number>(); for (const r of rows) if (r.active) { const k = r.inv.supplier_name?.trim() || ""; m.set(k, r2((m.get(k) ?? 0) + r.total)); }
  return [...m.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

export type PriceChange = { key: string; name: string; productId: number | null; first: number; prev: number; last: number; min: number; max: number; pct: number; diff: number; points: number; lastDate: string; prevDate: string; supplier: string; invoice: string };
const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, " ").trim();
/** تكلفة الوحدة بلا ضريبة: إن كانت الفاتورة شاملة تُقسم على (1+نسبة). */
export const netUnit = (inv: PInv, it: PInvItem): number => r4((Number(it.unit_cost) || 0) / (inv.tax_inclusive ? 1 + (Number(inv.tax_rate) || 0) / 100 : 1));

/** أصناف تغيّر سعر شرائها: آخر شراء داخل [from,to] بسعر مختلف عن الشراء الذي قبله (من كامل السجل المُمرَّر). */
export function priceChanges(history: PInv[], from: string, to: string): PriceChange[] {
  const g = new Map<string, { name: string; pid: number | null; pts: { date: string; id: number; unit: number; supplier: string; invoice: string }[] }>();
  for (const inv of history) {
    if (!isActive(inv.status)) continue;
    for (const it of inv.items ?? []) {
      const unit = netUnit(inv, it); if (!(unit > 0) || !(Number(it.qty) > 0)) continue;
      const key = it.product_id != null ? `p${it.product_id}` : `d${norm(it.description || "")}`; if (key === "d") continue;
      const e = g.get(key) ?? { name: it.description || "", pid: it.product_id ?? null, pts: [] };
      e.pts.push({ date: inv.date, id: inv.id, unit, supplier: inv.supplier_name ?? "", invoice: invLabel(inv) }); e.name = it.description || e.name; g.set(key, e);
    }
  }
  const out: PriceChange[] = [];
  for (const [key, e] of g) {
    if (e.pts.length < 2) continue; e.pts.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id));
    const last = e.pts[e.pts.length - 1], prev = e.pts[e.pts.length - 2]; if (last.date < from || last.date > to) continue;
    const diff = r4(last.unit - prev.unit); if (Math.abs(diff) < 0.00005) continue;
    const us = e.pts.map((p) => p.unit);
    out.push({ key, name: e.name, productId: e.pid, first: e.pts[0].unit, prev: prev.unit, last: last.unit, min: Math.min(...us), max: Math.max(...us), pct: r2((diff / prev.unit) * 100), diff: r2(diff), points: e.pts.length, lastDate: last.date, prevDate: prev.date, supplier: last.supplier, invoice: last.invoice });
  }
  return out.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct) || a.name.localeCompare(b.name));
}
