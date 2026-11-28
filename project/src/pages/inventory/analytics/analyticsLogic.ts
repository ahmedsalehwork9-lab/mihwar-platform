// =============================================================
import { smartMatch } from "../../lib/smartSearch";
// src/pages/inventory/analytics/analyticsLogic.ts
// منطق نقي (بلا Supabase/React) لمركز تقارير المخزون والأصناف.
// الأساس المحاسبي:
//  • كل صف في products هو رصيد صنف في فرع/مخزن محدد → التجميع عبر الفروع لا يكرر الكميات.
//  • التقييم = الكمية × products.price (متوسط التكلفة المرجّح المعتمد فعليًا في النظام).
//  • الركود يُحسب من آخر بيع (حركة sale_out أو فاتورة مبيعات)؛ التحويل/التسوية/الجرد/مرتجع المبيعات ليست بيعًا.
//  • الصنف بلا أي سجل حركة لا يُصنَّف راكدًا اعتمادًا على تاريخ إنشائه فقط (إلا إذا طلب المستخدم ذلك صراحةً).
// =============================================================

export const r2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;
export const r3 = (n: number): number => Math.round((Number(n) || 0) * 1000) / 1000;
export const dayOf = (iso: string | null | undefined): string => (iso || "").slice(0, 10);
const toUTC = (d: string): number => { const [y, m, dd] = d.split("-").map(Number); return Date.UTC(y, (m || 1) - 1, dd || 1); };
export const daysBetween = (from: string, to: string): number => Math.round((toUTC(to) - toUTC(from)) / 86400000);
export const addDays = (d: string, n: number): string => new Date(toUTC(d) + n * 86400000).toISOString().slice(0, 10);
const maxStr = (a: string | null, b: string | null): string | null => (a && b ? (a > b ? a : b) : a || b);

// ── الأنواع ─────────────────────────────────────────────────
export type Prod = {
  id: number; code: string | null; name: string; brand: string | null; category: string | null;
  qty: number; cost: number; sell: number | null; minQty: number | null; reorder: number | null;
  branchId: number | null; whId: number | null; createdAt: string | null;
};
export type Mv = {
  id: number; product_id: number; created_at: string; move_type: string; qty: number; unit_cost: number | null;
  ref_type: string | null; ref_id: number | null; notes: string | null; warehouse_id: number | null; branch_id: number | null;
};
export type DocLine = { productId: number | null; code: string | null; desc: string; qty: number; total: number };
export type SaleDoc = { id: number; no: number; year: number; date: string; branchId: number | null; warehouseId: number | null; status: string | null; kind: "sale" | "return"; lines: DocLine[] };
export type PurchDoc = { id: number; no: number; year: number; date: string; branchId: number | null; supplier: string; status: string | null; total: number; lines: DocLine[] };

export type Scope = {
  branches: Set<number> | null; warehouses: Set<number> | null; groups: Set<string> | null; suppliers: Set<string> | null; q: string;
};
export const ALL_SCOPE: Scope = { branches: null, warehouses: null, groups: null, suppliers: null, q: "" };
export type GroupBy = "category" | "brand";
export const UNCLASSIFIED = "__none__";
export const groupOf = (p: Prod, by: GroupBy): string => ((by === "brand" ? p.brand : p.category) || "").trim() || UNCLASSIFIED;

// ── مطابقة بنود المستندات بالأصناف ───────────────────────────
export type ProdIndex = { byId: Map<number, Prod>; byBranchCode: Map<string, Prod>; byCode: Map<string, Prod[]> };
export function buildIndex(prods: Prod[]): ProdIndex {
  const byId = new Map<number, Prod>(); const byBranchCode = new Map<string, Prod>(); const byCode = new Map<string, Prod[]>();
  for (const p of prods) {
    byId.set(p.id, p);
    if (p.code) {
      const c = p.code.trim().toLowerCase();
      byBranchCode.set(`${p.branchId ?? ""}|${c}`, p);
      const arr = byCode.get(c); if (arr) arr.push(p); else byCode.set(c, [p]);
    }
  }
  return { byId, byBranchCode, byCode };
}
/** كود الصنف بين قوسين في آخر الوصف: «اسم (CODE)». */
export function codeFromDesc(desc: string): string | null {
  const m = /\(([^()]{2,60})\)\s*$/.exec(desc || ""); return m ? m[1].trim() : null;
}
/** product_id أولًا، ثم الكود ضمن نفس الفرع، ثم الكود إذا كان فريدًا في المؤسسة. بلا تخمين غير ذلك. */
export function matchLine(line: DocLine, branchId: number | null, ix: ProdIndex): Prod | null {
  if (line.productId != null) { const p = ix.byId.get(line.productId); if (p) return p; }
  const code = (line.code || codeFromDesc(line.desc) || "").toLowerCase();
  if (!code) return null;
  const inBranch = ix.byBranchCode.get(`${branchId ?? ""}|${code}`); if (inBranch) return inBranch;
  const all = ix.byCode.get(code); return all && all.length === 1 ? all[0] : null;
}

// ── نشاط الحركة لكل صنف ─────────────────────────────────────
export type Receipt = { date: string; qty: number };
export type Activity = {
  lastSale: string | null; lastIssue: string | null; lastIn: string | null; lastMove: string | null;
  receipts: Receipt[]; inQty: number; outQty: number; moveCount: number;
};
const RECEIPT_TYPES = new Set(["purchase_in", "transfer_in", "opening", "sale_return", "sales_return"]);
const NON_CONSUMPTION = new Set(["transfer_out", "adjust", "stocktake", "count"]);
export const isSaleMove = (t: string): boolean => t === "sale_out";
export function buildActivity(moves: Mv[], prods: Prod[], saleDocs: SaleDoc[]): Map<number, Activity> {
  const out = new Map<number, Activity>();
  const get = (id: number): Activity => { let a = out.get(id); if (!a) { a = { lastSale: null, lastIssue: null, lastIn: null, lastMove: null, receipts: [], inQty: 0, outQty: 0, moveCount: 0 }; out.set(id, a); } return a; };
  for (const m of moves) {
    const a = get(m.product_id); const d = dayOf(m.created_at); const q = Number(m.qty) || 0;
    a.moveCount++; a.lastMove = maxStr(a.lastMove, d);
    if (q > 0) { a.inQty += q; if (RECEIPT_TYPES.has(m.move_type) || m.move_type === "adjust") { a.lastIn = maxStr(a.lastIn, d); a.receipts.push({ date: d, qty: q }); } }
    else if (q < 0) { a.outQty += -q; if (isSaleMove(m.move_type)) a.lastSale = maxStr(a.lastSale, d); if (!NON_CONSUMPTION.has(m.move_type)) a.lastIssue = maxStr(a.lastIssue, d); }
  }
  const ix = buildIndex(prods);
  for (const doc of saleDocs) {
    if (doc.kind !== "sale" || doc.status === "cancelled" || doc.status === "void") continue;
    for (const l of doc.lines) { const p = matchLine(l, doc.branchId, ix); if (p) { const a = get(p.id); a.lastSale = maxStr(a.lastSale, doc.date); a.lastIssue = maxStr(a.lastIssue, doc.date); a.lastMove = maxStr(a.lastMove, doc.date); } }
  }
  return out;
}

// ── الركود ──────────────────────────────────────────────────
export type StaleStatus = "active" | "slow" | "dead" | "severe" | "nohistory" | "nostock";
export type Thresholds = { slow: number; dead: number; severe: number };
export const DEFAULT_TH: Thresholds = { slow: 90, dead: 180, severe: 365 };
export type StaleInfo = { status: StaleStatus; days: number | null; basis: "sale" | "receipt" | "move" | "created" | "none" };
export function classifyStale(p: Prod, a: Activity | undefined, today: string, th: Thresholds, useCreated = false): StaleInfo {
  if (p.qty <= 0) return { status: "nostock", days: null, basis: "none" };
  let ref: string | null = null; let basis: StaleInfo["basis"] = "none";
  if (a?.lastSale) { ref = a.lastSale; basis = "sale"; }
  else if (a?.lastIn) { ref = a.lastIn; basis = "receipt"; }
  else if (a?.lastMove) { ref = a.lastMove; basis = "move"; }
  else if (useCreated && p.createdAt) { ref = dayOf(p.createdAt); basis = "created"; }
  if (!ref) return { status: "nohistory", days: null, basis: "none" };
  const days = Math.max(0, daysBetween(ref, today));
  const status: StaleStatus = days >= th.severe ? "severe" : days >= th.dead ? "dead" : days >= th.slow ? "slow" : "active";
  return { status, days, basis };
}
export const isStagnant = (s: StaleStatus): boolean => s === "slow" || s === "dead" || s === "severe";

// ── الفلاتر ─────────────────────────────────────────────────
/** defaultWhByBranch: الصنف بلا مخزن يتبع المستودع الرئيسي لفرعه (يُحسب ضمن فلتر المخزن). */
export function filterProds(prods: Prod[], sc: Scope, by: GroupBy, supplierOf: Map<number, string>, defaultWhByBranch: Map<number, number> = new Map()): Prod[] {
  const q = sc.q.trim().toLowerCase();
  return prods.filter((p) => {
    if (sc.branches && (p.branchId == null || !sc.branches.has(p.branchId))) return false;
    if (sc.warehouses) { const eff = p.whId ?? (p.branchId != null ? defaultWhByBranch.get(p.branchId) ?? null : null); if (eff == null || !sc.warehouses.has(eff)) return false; }
    if (sc.groups && !sc.groups.has(groupOf(p, by))) return false;
    if (sc.suppliers && !sc.suppliers.has(supplierOf.get(p.id) || UNCLASSIFIED)) return false;
    if (q && !smartMatch(q, p.name, p.code, p.brand)) return false;
    return true;
  });
}

// ── المبيعات ────────────────────────────────────────────────
export type SalesStat = { qty: number; net: number; invoices: number; retQty: number; retNet: number; cogs: number };
export function salesByProduct(prods: Prod[], docs: SaleDoc[], from: string, to: string): Map<number, SalesStat> {
  const ix = buildIndex(prods); const out = new Map<number, SalesStat>(); const seen = new Map<number, Set<number>>();
  for (const d of docs) {
    if (d.date < from || d.date > to || d.status === "cancelled" || d.status === "void" || d.status === "draft") continue;
    for (const l of d.lines) {
      const p = matchLine(l, d.branchId, ix); if (!p) continue;
      let s = out.get(p.id); if (!s) { s = { qty: 0, net: 0, invoices: 0, retQty: 0, retNet: 0, cogs: 0 }; out.set(p.id, s); }
      if (d.kind === "sale") { s.qty += l.qty; s.net += l.total; let set = seen.get(p.id); if (!set) { set = new Set(); seen.set(p.id, set); } if (!set.has(d.id)) { set.add(d.id); s.invoices++; } }
      else { s.retQty += l.qty; s.retNet += l.total; }
    }
  }
  for (const [id, s] of out) { const p = ix.byId.get(id); s.cogs = r2((s.qty - s.retQty) * (p?.cost || 0)); s.qty = r3(s.qty); s.net = r2(s.net); s.retQty = r3(s.retQty); s.retNet = r2(s.retNet); }
  return out;
}
export type RankRow = { p: Prod; qty: number; net: number; invoices: number; retQty: number; margin: number | null; prevQty: number; prevNet: number; changePct: number | null };
/** صافي = مبيعات − مرتجعات (المرتجع لا يُحسب مبيعًا إيجابيًا). الهامش بمتوسط التكلفة الحالي ويُترك null عند غياب التكلفة. */
export function rankSales(rows: Prod[], cur: Map<number, SalesStat>, prev: Map<number, SalesStat>): RankRow[] {
  return rows.map((p) => {
    const c = cur.get(p.id); const v = prev.get(p.id);
    const qty = r3((c?.qty || 0) - (c?.retQty || 0)); const net = r2((c?.net || 0) - (c?.retNet || 0));
    const pq = r3((v?.qty || 0) - (v?.retQty || 0)); const pn = r2((v?.net || 0) - (v?.retNet || 0));
    const margin = p.cost > 0 && qty > 0 ? r2(net - qty * p.cost) : null;
    return { p, qty, net, invoices: c?.invoices || 0, retQty: c?.retQty || 0, margin, prevQty: pq, prevNet: pn, changePct: pn !== 0 ? r2(((net - pn) / Math.abs(pn)) * 100) : null };
  });
}

// ── التقييم ─────────────────────────────────────────────────
export const valueOf = (p: Prod): number => r2(Math.max(0, p.qty) * (p.cost || 0));
export type Agg = { key: string; label: string; qty: number; value: number; items: number };
export function aggregate(rows: Prod[], keyOf: (p: Prod) => string, labelOf: (k: string) => string): Agg[] {
  const m = new Map<string, Agg>();
  for (const p of rows) {
    if (p.qty <= 0) continue; const k = keyOf(p);
    let a = m.get(k); if (!a) { a = { key: k, label: labelOf(k), qty: 0, value: 0, items: 0 }; m.set(k, a); }
    a.qty = r3(a.qty + p.qty); a.value = r2(a.value + valueOf(p)); a.items++;
  }
  return [...m.values()].sort((x, y) => y.value - x.value);
}
export const lowThreshold = (p: Prod): number => Number(p.reorder ?? p.minQty ?? 0) || 0;
export const isLow = (p: Prod): boolean => { const t = lowThreshold(p); return t > 0 && p.qty <= t; };

// ── أعمار المخزون ───────────────────────────────────────────
export const AGE_BUCKETS = ["0-30", "31-60", "61-90", "91-180", "180+", "unknown"] as const;
export type AgeBucket = (typeof AGE_BUCKETS)[number];
export const ageBucketOf = (days: number): AgeBucket => (days <= 30 ? "0-30" : days <= 60 ? "31-60" : days <= 90 ? "61-90" : days <= 180 ? "91-180" : "180+");
/**
 * تقدير العمر بافتراض FIFO: الكمية الحالية تُغطّى بأحدث الاستلامات (الأقدم يُصرف أولًا).
 * ما لا يغطّيه سجل استلام يذهب إلى «unknown» (رصيد افتتاحي بلا تاريخ). هذا تقدير وليس عمرًا محاسبيًا بطبقات تكلفة.
 */
export function ageProduct(p: Prod, a: Activity | undefined, today: string): Record<AgeBucket, number> {
  const out: Record<AgeBucket, number> = { "0-30": 0, "31-60": 0, "61-90": 0, "91-180": 0, "180+": 0, unknown: 0 };
  let left = Math.max(0, p.qty); if (left <= 0) return out;
  const rec = [...(a?.receipts || [])].sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : 0));
  for (const r of rec) { if (left <= 0) break; const take = Math.min(left, r.qty); out[ageBucketOf(Math.max(0, daysBetween(r.date, today)))] += take; left -= take; }
  if (left > 0) out.unknown += left;
  return out;
}
export type AgeRow = { bucket: AgeBucket; qty: number; value: number; items: number; pct: number };
export function agingSummary(rows: Prod[], act: Map<number, Activity>, today: string): AgeRow[] {
  const sums = new Map<AgeBucket, { qty: number; value: number; items: Set<number> }>();
  for (const b of AGE_BUCKETS) sums.set(b, { qty: 0, value: 0, items: new Set() });
  let total = 0;
  for (const p of rows) {
    const per = ageProduct(p, act.get(p.id), today);
    for (const b of AGE_BUCKETS) { const q = per[b]; if (q > 0) { const s = sums.get(b)!; s.qty += q; const v = q * (p.cost || 0); s.value += v; total += v; s.items.add(p.id); } }
  }
  return AGE_BUCKETS.map((b) => { const s = sums.get(b)!; return { bucket: b, qty: r3(s.qty), value: r2(s.value), items: s.items.size, pct: total > 0 ? r2((s.value / total) * 100) : 0 }; });
}

// ── الموردون (من مستندات الشراء) ─────────────────────────────
export type SupplierRef = { name: string; date: string };
/** آخر مورد لكل صنف حسب أحدث فاتورة شراء مرحّلة تحتوي الصنف. الأساس: المستند وليس بيانات رئيسية للصنف. */
export function lastSupplierByProduct(prods: Prod[], docs: PurchDoc[]): Map<number, SupplierRef> {
  const ix = buildIndex(prods); const out = new Map<number, SupplierRef>();
  for (const d of docs) {
    if (d.status === "cancelled" || d.status === "void" || d.status === "draft" || !d.supplier) continue;
    for (const l of d.lines) { const p = matchLine(l, d.branchId, ix); if (!p) continue; const cur = out.get(p.id); if (!cur || d.date > cur.date) out.set(p.id, { name: d.supplier, date: d.date }); }
  }
  return out;
}
export type SupplierRow = { supplier: string; purchases: number; docs: number; items: number; qty: number; value: number; stagnantValue: number; stagnantItems: number; slowPct: number; lastPurchase: string | null };
export function supplierAnalysis(rows: Prod[], docs: PurchDoc[], from: string, to: string, ref: Map<number, SupplierRef>, stale: Map<number, StaleInfo>, allProds: Prod[]): SupplierRow[] {
  const m = new Map<string, SupplierRow & { _items: Set<number> }>();
  const get = (s: string) => { let r = m.get(s); if (!r) { r = { supplier: s, purchases: 0, docs: 0, items: 0, qty: 0, value: 0, stagnantValue: 0, stagnantItems: 0, slowPct: 0, lastPurchase: null, _items: new Set() }; m.set(s, r); } return r; };
  const inScope = new Set(rows.map((p) => p.id)); const ix = buildIndex(allProds);
  for (const d of docs) {
    if (d.status === "cancelled" || d.status === "void" || d.status === "draft" || !d.supplier) continue;
    const r = get(d.supplier); r.lastPurchase = maxStr(r.lastPurchase, d.date);
    if (d.date >= from && d.date <= to) { r.purchases = r2(r.purchases + d.total); r.docs++; }
    for (const l of d.lines) { const p = matchLine(l, d.branchId, ix); if (p) r._items.add(p.id); }
  }
  for (const p of rows) {
    const s = ref.get(p.id); if (!s || p.qty <= 0) continue; const r = get(s.name);
    r.qty = r3(r.qty + p.qty); r.value = r2(r.value + valueOf(p));
    const st = stale.get(p.id); if (st && isStagnant(st.status)) { r.stagnantValue = r2(r.stagnantValue + valueOf(p)); r.stagnantItems++; }
    r.items++;
  }
  return [...m.values()].map(({ _items, ...r }) => { void _items; const tracked = rows.filter((p) => p.qty > 0 && ref.get(p.id)?.name === r.supplier && inScope.has(p.id)).length; return { ...r, slowPct: tracked > 0 ? r2((r.stagnantItems / tracked) * 100) : 0 }; }).sort((a, b) => b.purchases - a.purchases || b.value - a.value);
}

// ── حركة الأصناف بالرصيد الجاري ─────────────────────────────
export type FlowRow = { m: Mv; p: Prod; inQty: number; outQty: number; balance: number };
/** الرصيد الافتتاحي المُستنتَج لكل صنف = الرصيد الحالي − مجموع كل حركاته؛ ثم يُمشى تسلسليًا بترتيب (التاريخ، المعرّف). */
export function flowRows(prods: Prod[], moves: Mv[]): FlowRow[] {
  const byP = new Map<number, Mv[]>(); for (const m of moves) { const a = byP.get(m.product_id); if (a) a.push(m); else byP.set(m.product_id, [m]); }
  const pm = new Map(prods.map((p) => [p.id, p] as const)); const out: FlowRow[] = [];
  for (const [pid, list] of byP) {
    const p = pm.get(pid); if (!p) continue;
    list.sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id - b.id));
    let bal = r3(p.qty - list.reduce((s, m) => s + (Number(m.qty) || 0), 0));
    for (const m of list) { const q = Number(m.qty) || 0; bal = r3(bal + q); out.push({ m, p, inQty: q > 0 ? q : 0, outQty: q < 0 ? -q : 0, balance: bal }); }
  }
  return out.sort((a, b) => (a.m.created_at < b.m.created_at ? 1 : a.m.created_at > b.m.created_at ? -1 : b.m.id - a.m.id));
}
export function monthlyFlow(moves: Mv[]): { month: string; inQty: number; outQty: number }[] {
  const m = new Map<string, { inQty: number; outQty: number }>();
  for (const x of moves) { const k = dayOf(x.created_at).slice(0, 7); const q = Number(x.qty) || 0; const r = m.get(k) || { inQty: 0, outQty: 0 }; if (q > 0) r.inQty += q; else r.outQty += -q; m.set(k, r); }
  return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([month, v]) => ({ month, inQty: r3(v.inQty), outQty: r3(v.outQty) }));
}

// ── المؤشرات ────────────────────────────────────────────────
export type Kpis = { branches: number; items: number; value: number; stagnantItems: number; stagnantValue: number; lowItems: number; turnover: number | null; turnoverPrev: number | null; noHistory: number };
export function computeKpis(rows: Prod[], stale: Map<number, StaleInfo>, cur: Map<number, SalesStat>, prev: Map<number, SalesStat>): Kpis {
  const inStock = rows.filter((p) => p.qty > 0);
  const value = r2(inStock.reduce((s, p) => s + valueOf(p), 0));
  let sv = 0, sc = 0, nh = 0;
  for (const p of inStock) { const st = stale.get(p.id); if (!st) continue; if (isStagnant(st.status)) { sc++; sv += valueOf(p); } else if (st.status === "nohistory") nh++; }
  const cogs = (m: Map<number, SalesStat>): number => { let s = 0; for (const p of rows) s += m.get(p.id)?.cogs || 0; return s; };
  const t = (c: number): number | null => (value > 0 ? r2(c / value) : null);
  const c1 = cogs(cur), c0 = cogs(prev);
  return {
    branches: new Set(rows.map((p) => p.branchId).filter((x): x is number => x != null)).size, items: inStock.length, value, stagnantItems: sc, stagnantValue: r2(sv),
    lowItems: inStock.filter(isLow).length, turnover: c1 > 0 ? t(c1) : null, turnoverPrev: c0 > 0 ? t(c0) : null, noHistory: nh,
  };
}

// ── التوصيات (عرض فقط — لا تنفيذ تلقائي) ───────────────────
export type RecKind = "stop_purchase" | "reduce_purchase" | "high_value_slow" | "transfer" | "restock";
export type Rec = { kind: RecKind; p: Prod; qty: number; value: number; days: number | null; sold: number; toBranchId?: number | null };
export function buildInsights(rows: Prod[], stale: Map<number, StaleInfo>, sales: Map<number, SalesStat>, limit = 15): Rec[] {
  const recs: Rec[] = []; const st = (p: Prod): StaleStatus => stale.get(p.id)?.status ?? "nohistory";
  const sold = (p: Prod): number => { const s = sales.get(p.id); return s ? r3(s.qty - s.retQty) : 0; };
  const mk = (kind: RecKind, p: Prod, extra: Partial<Rec> = {}): Rec => ({ kind, p, qty: p.qty, value: valueOf(p), days: stale.get(p.id)?.days ?? null, sold: sold(p), ...extra });
  const top = (arr: Rec[]): Rec[] => arr.sort((a, b) => b.value - a.value).slice(0, limit);
  const live = rows.filter((p) => p.qty > 0);
  recs.push(...top(live.filter((p) => st(p) === "dead" || st(p) === "severe").map((p) => mk("stop_purchase", p))));
  recs.push(...top(live.filter((p) => st(p) === "slow").map((p) => mk("reduce_purchase", p))));
  const vals = live.map(valueOf).sort((a, b) => a - b); const p90 = vals.length ? vals[Math.min(vals.length - 1, Math.floor(vals.length * 0.9))] : 0;
  recs.push(...top(live.filter((p) => isStagnant(st(p)) && valueOf(p) >= p90 && p90 > 0).map((p) => mk("high_value_slow", p))));
  // تحويل: راكد في فرع، وعليه طلب (مبيعات) ورصيده لا يكفي في فرع آخر (نفس الكود)
  const byCode = new Map<string, Prod[]>(); for (const p of rows) if (p.code) { const k = p.code.trim().toLowerCase(); const a = byCode.get(k); if (a) a.push(p); else byCode.set(k, [p]); }
  const transfers: Rec[] = [];
  for (const g of byCode.values()) {
    if (g.length < 2) continue;
    for (const a of g) {
      if (a.qty <= 0 || !isStagnant(st(a))) continue;
      for (const b of g) {
        if (b.id === a.id || b.branchId === a.branchId) continue;
        const need = r3(sold(b) - Math.max(0, b.qty)); if (sold(b) > 0 && need > 0) { transfers.push(mk("transfer", a, { qty: Math.min(a.qty, need), value: r2(Math.min(a.qty, need) * (a.cost || 0)), toBranchId: b.branchId, sold: sold(b) })); break; }
      }
    }
  }
  recs.push(...top(transfers));
  recs.push(...top(live.filter((p) => isLow(p) && sold(p) > 0).map((p) => mk("restock", p, { value: r2(sold(p) * (p.cost || 0)) }))));
  return recs;
}
