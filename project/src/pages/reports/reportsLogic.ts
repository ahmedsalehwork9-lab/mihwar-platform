// =============================================================
// src/pages/reports/reportsLogic.ts
// منطق نقي (بلا واجهة/قاعدة بيانات) لصفحات مركز التقارير — قابل للاختبار:
//  • فترات + تجميع زمني متصل (يومي/شهري)
//  • التقرير المالي الشهري بنفس منطق قائمة الدخل في «الحسابات» (statementsLogic) فلا تختلف الأرقام
//  • تجميع تحليلات الأعمال من الفواتير + مطابقتها مع الدفتر
//  • صحة المخزون بنفس عتبة «مركز التنبيهات» (thresholdOf)
//  • إحصاءات الطلبات
// المبالغ بالوحدة الأساسية (ريال) وتُقرَّب لمنزلتين.
// =============================================================
import type { GLAccount } from "../lib/accountingDb";
import { buildIncome, changePct, previousPeriod, sumByAccount, type Income, type StmtEntry } from "../accounting/statements/statementsLogic";
import { periodRange as dashRange, type PeriodKey as DashKey } from "../accounting/dash/dashLogic";
import { DEFAULT_THRESHOLD, thresholdOf } from "../alerts/alertsLogic";

export const r2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;
const pad = (n: number): string => String(n).padStart(2, "0");

// ═══════════ الفترات ═══════════
export type RangeKey = DashKey | "prev_month";
export const RANGE_KEYS: RangeKey[] = ["month", "prev_month", "quarter", "year", "last_year", "custom"];

export function monthRange(ym: string): { from: string; to: string } {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${ym}-01`, to: `${ym}-${pad(last)}` };
}
export function shiftYm(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}
/** نطاق الفترة المختارة. «month/quarter/year» من بداية الفترة حتى اليوم، «prev_month» شهر كامل سابق. */
export function rangeFor(key: RangeKey, today: string, custom?: { from: string; to: string }): { from: string; to: string } {
  if (key === "prev_month") return monthRange(shiftYm(today.slice(0, 7), -1));
  return dashRange(key, today, custom);
}
export const addDay = (d: string, n = 1): string => new Date(Date.parse(d + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
export const daysSpan = (a: string, b: string): number => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 864e5) + 1;

export type Grain = "day" | "month";
/** فترة ≤ 62 يومًا تُعرض يوميًا، وأطول تُعرض شهريًا. */
export const grainFor = (from: string, to: string): Grain => (daysSpan(from, to) <= 62 ? "day" : "month");
/** مفاتيح متصلة (تظهر الأيام/الأشهر الصفرية أيضًا). */
export function bucketKeys(from: string, to: string, g: Grain): string[] {
  const out: string[] = []; if (!from || !to || from > to) return out;
  if (g === "day") { for (let d = from; d <= to && out.length < 400; d = addDay(d)) out.push(d); return out; }
  for (let ym = from.slice(0, 7); ym <= to.slice(0, 7) && out.length < 120; ym = shiftYm(ym, 1)) out.push(ym);
  return out;
}
export const bucketOf = (date: string, g: Grain): string => (g === "day" ? date.slice(0, 10) : date.slice(0, 7));

// ═══════════ أسماء الحسابات ═══════════
export const accName = (a: Pick<GLAccount, "name"> & { name_en?: string | null }, lang: "ar" | "en"): string => (lang === "en" && a.name_en ? a.name_en : a.name);

// ═══════════ التقرير المالي الشهري ═══════════
export type Compare = "prev_month" | "last_year" | "none";
export type TrendPoint = { ym: string; revenue: number; expense: number; net: number };
export type BranchPnl = { branchId: number | null; revenue: number; expense: number; net: number };
export type MonthlyReport = {
  ym: string; compareYm: string | null; income: Income; ytd: { revenue: number; net: number };
  trend: TrendPoint[]; branches: BranchPnl[]; counts: { posted: number; draft: number };
};

export function buildMonthly(entries: StmtEntry[], accounts: GLAccount[], ym: string, branchId: number | null, compare: Compare): MonthlyReport {
  const accById = new Map(accounts.map((a) => [a.id, a] as const));
  const cr = monthRange(ym);
  const cmpYm = compare === "prev_month" ? shiftYm(ym, -1) : compare === "last_year" ? shiftYm(ym, -12) : null;
  const cur = sumByAccount(entries, accById, cr.from, cr.to, false, branchId);
  const prev = cmpYm ? sumByAccount(entries, accById, monthRange(cmpYm).from, monthRange(cmpYm).to, false, branchId) : null;
  const income = buildIncome(accounts, cur, prev);
  const ytdI = buildIncome(accounts, sumByAccount(entries, accById, `${ym.slice(0, 4)}-01-01`, cr.to, false, branchId), null);

  // اتجاه 12 شهرًا: تمريرة واحدة بنفس قاعدة الفرع والحالة المعتمدة في sumByAccount
  const first = shiftYm(ym, -11);
  const tm = new Map<string, { revenue: number; expense: number }>();
  for (let i = 0; i < 12; i++) tm.set(shiftYm(first, i), { revenue: 0, expense: 0 });
  const counts = { posted: 0, draft: 0 };
  const bm = new Map<string, BranchPnl>();
  for (const e of entries) {
    const inMonth = e.date >= cr.from && e.date <= cr.to;
    const isPosted = (e.status ?? "posted") === "posted";
    if (inMonth) { if (isPosted) counts.posted++; else counts.draft++; }
    if (!isPosted) continue;
    const slot = tm.get(e.date.slice(0, 7));
    for (const l of e.lines || []) {
      const a = accById.get(l.account_id); if (!a) continue;
      const dr = Number(l.debit) || 0, cd = Number(l.credit) || 0;
      const isRev = a.type === "revenue", isExp = a.type === "expense"; if (!isRev && !isExp) continue;
      const v = isRev ? cd - dr : dr - cd;
      if (slot && !(branchId != null && l.branch_id != null && Number(l.branch_id) !== branchId)) { if (isRev) slot.revenue += v; else slot.expense += v; }
      if (inMonth && branchId == null) {
        const b = (l.branch_id ?? (e as { branch_id?: number | null }).branch_id ?? null) as number | null; const k = String(b);
        const s = bm.get(k) ?? { branchId: b, revenue: 0, expense: 0, net: 0 }; if (isRev) s.revenue += v; else s.expense += v; bm.set(k, s);
      }
    }
  }
  const trend = Array.from(tm.entries()).map(([k, v]) => ({ ym: k, revenue: r2(v.revenue), expense: r2(v.expense), net: r2(v.revenue - v.expense) }));
  const branches = Array.from(bm.values()).map((b) => ({ ...b, revenue: r2(b.revenue), expense: r2(b.expense), net: r2(b.revenue - b.expense) })).sort((x, y) => y.revenue - x.revenue);
  return { ym, compareYm: cmpYm, income, ytd: { revenue: ytdI.revenue.total, net: ytdI.net }, trend, branches, counts };
}

export type StmtLabels = { item: string; amount: string; pct: string; prev: string; change: string; revenue: string; cogs: string; gross: string; opex: string; net: string };
export type TableOut = { cols: { label: string; num?: boolean }[]; rows: (string | number | null)[][] };
const pctTxt = (v: number, base: number): string => (base > 0.005 ? `${(Math.round((v / base) * 1000) / 10).toFixed(1)}%` : "—");
const chgTxt = (c: number, p: number | null): string => { const x = changePct(c, p); return x == null ? "—" : `${x >= 0 ? "+" : ""}${(Math.round(x * 10) / 10).toFixed(1)}%`; };

/** جدول قائمة الدخل (للطباعة والتصدير) — نفس الأرقام المعروضة بالشاشة. */
export function incomeTable(inc: Income, L: StmtLabels, name: (a: GLAccount) => string, withPrev: boolean, withAccounts = true): TableOut {
  const base = inc.revenue.total;
  const cols: TableOut["cols"] = [{ label: L.item }, { label: L.amount, num: true }, { label: L.pct, num: false }];
  if (withPrev) { cols.push({ label: L.prev, num: true }, { label: L.change }); }
  const rows: TableOut["rows"] = [];
  const line = (label: string, v: number, p: number | null) => { const r: (string | number | null)[] = [label, v, pctTxt(v, base)]; if (withPrev) r.push(p, p == null ? "—" : chgTxt(v, p)); rows.push(r); };
  const sec = (label: string, s: Income["revenue"]) => {
    line(label, s.total, s.prevTotal);
    if (withAccounts) for (const l of s.lines) line(`    ${l.account.code}  ${name(l.account)}`, l.value, l.prev);
  };
  sec(L.revenue, inc.revenue); sec(L.cogs, inc.cogs); line(L.gross, inc.grossProfit, inc.prevGross); sec(L.opex, inc.opex); line(L.net, inc.net, inc.prevNet);
  return { cols, rows };
}

// ═══════════ تحليلات الأعمال ═══════════
export type InvItem = { description?: string | null; qty?: number | null; line_total?: number | null };
export type InvLite = {
  date: string; status?: string | null; branch_id: number | null; subtotal?: number | null; total?: number | null; tax_amount?: number | null;
  payment_type?: string | null; customer_name?: string | null; supplier_name?: string | null; items?: InvItem[] | null;
};
export const isLiveInvoice = (s: string | null | undefined): boolean => { const v = (s || "").toLowerCase(); return v !== "cancelled" && v !== "void" && v !== "draft"; };

export type SeriesPoint = { key: string; sales: number; purchases: number };
export type AnalyticsAgg = {
  grain: Grain; salesNet: number; salesTotal: number; salesVat: number; purchasesNet: number; purchasesTotal: number; purchasesVat: number;
  tx: number; avgTicket: number; vatPayable: number; series: SeriesPoint[];
  branchRows: { branch_id: number | null; sales: number; purchases: number; tx: number }[];
  payMix: { k: string; value: number }[]; topProducts: { name: string; qty: number; net: number }[];
  customers: { name: string; total: number }[]; suppliers: { name: string; total: number }[];
};
const topN = <T,>(m: Map<string, T>, val: (t: T) => number, n: number): [string, T][] => Array.from(m.entries()).sort((a, b) => val(b[1]) - val(a[1])).slice(0, n);

export function aggregateAnalytics(sales: InvLite[], purchases: InvLite[], from: string, to: string): AnalyticsAgg {
  const grain = grainFor(from, to);
  const ser = new Map<string, SeriesPoint>(bucketKeys(from, to, grain).map((k) => [k, { key: k, sales: 0, purchases: 0 }]));
  const slot = (d: string): SeriesPoint | null => ser.get(bucketOf(d || "", grain)) ?? null;
  const bm = new Map<string, { branch_id: number | null; sales: number; purchases: number; tx: number }>();
  const bslot = (b: number | null) => { const k = String(b); let s = bm.get(k); if (!s) { s = { branch_id: b, sales: 0, purchases: 0, tx: 0 }; bm.set(k, s); } return s; };
  const pay = new Map<string, number>(), prod = new Map<string, { name: string; qty: number; net: number }>(), cust = new Map<string, number>(), supp = new Map<string, number>();
  let salesNet = 0, salesTotal = 0, salesVat = 0, tx = 0, purchasesNet = 0, purchasesTotal = 0, purchasesVat = 0;
  for (const s of sales) {
    if (!isLiveInvoice(s.status)) continue;
    const tot = Number(s.total) || 0; salesNet += Number(s.subtotal) || 0; salesTotal += tot; salesVat += Number(s.tax_amount) || 0; tx++;
    const sl = slot(s.date); if (sl) sl.sales += tot; const b = bslot(s.branch_id ?? null); b.sales += tot; b.tx++;
    const pk = s.payment_type || "—"; pay.set(pk, (pay.get(pk) || 0) + tot);
    if (s.customer_name) cust.set(s.customer_name, (cust.get(s.customer_name) || 0) + tot);
    for (const it of s.items || []) { const n = (it.description || "—").trim() || "—"; const p = prod.get(n) ?? { name: n, qty: 0, net: 0 }; p.qty += Number(it.qty) || 0; p.net += Number(it.line_total) || 0; prod.set(n, p); }
  }
  for (const p of purchases) {
    if (!isLiveInvoice(p.status)) continue;
    const tot = Number(p.total) || 0; purchasesNet += Number(p.subtotal) || 0; purchasesTotal += tot; purchasesVat += Number(p.tax_amount) || 0;
    const sl = slot(p.date); if (sl) sl.purchases += tot; bslot(p.branch_id ?? null).purchases += tot;
    if (p.supplier_name) supp.set(p.supplier_name, (supp.get(p.supplier_name) || 0) + tot);
  }
  return {
    grain, salesNet: r2(salesNet), salesTotal: r2(salesTotal), salesVat: r2(salesVat), purchasesNet: r2(purchasesNet), purchasesTotal: r2(purchasesTotal), purchasesVat: r2(purchasesVat),
    tx, avgTicket: tx ? r2(salesTotal / tx) : 0, vatPayable: r2(salesVat - purchasesVat),
    series: Array.from(ser.values()).map((p) => ({ key: p.key, sales: r2(p.sales), purchases: r2(p.purchases) })),
    branchRows: Array.from(bm.values()).map((b) => ({ ...b, sales: r2(b.sales), purchases: r2(b.purchases) })).sort((a, b) => b.sales - a.sales),
    payMix: Array.from(pay.entries()).map(([k, value]) => ({ k, value: r2(value) })).sort((a, b) => b.value - a.value),
    topProducts: topN(prod, (p) => p.net, 10).map(([, p]) => ({ name: p.name, qty: r2(p.qty), net: r2(p.net) })),
    customers: topN(cust, (v) => v, 8).map(([name, total]) => ({ name, total: r2(total) })),
    suppliers: topN(supp, (v) => v, 8).map(([name, total]) => ({ name, total: r2(total) })),
  };
}

/** قائمة الدخل المحاسبية لفترة (+ الفترة السابقة المماثلة) — المصدر المعتمد لمؤشرات الربح. */
export function periodIncome(entries: StmtEntry[], accounts: GLAccount[], from: string, to: string, branchId: number | null, withPrev: boolean): Income {
  const accById = new Map(accounts.map((a) => [a.id, a] as const));
  const cur = sumByAccount(entries, accById, from, to, false, branchId);
  const pp = previousPeriod(from, to);
  return buildIncome(accounts, cur, withPrev ? sumByAccount(entries, accById, pp.from, pp.to, false, branchId) : null);
}

export type Recon = { invoiceNet: number; glRevenue: number; diff: number; diffPct: number | null; level: "ok" | "warn" };
/** مطابقة صافي المبيعات حسب الفواتير مع الإيراد حسب القيود المرحّلة. الفرق > 1% يُعلَّم للمراجعة. */
export function reconcileRevenue(invoiceNet: number, glRevenue: number): Recon {
  const diff = r2(invoiceNet - glRevenue); const base = Math.max(Math.abs(invoiceNet), Math.abs(glRevenue));
  const diffPct = base > 0.005 ? r2((Math.abs(diff) / base) * 100) : null;
  return { invoiceNet: r2(invoiceNet), glRevenue: r2(glRevenue), diff, diffPct, level: base < 0.005 || (diffPct != null && diffPct <= 1) ? "ok" : "warn" };
}

// ═══════════ المخزون ═══════════
export type StockProd = { name: string; category: string | null; brand?: string | null; qty: number; cost: number; min_quantity: number | null; reorder_level: number | null };
export type StockFlag = StockProd & { thr: number; value: number };
export type InvHealth = {
  items: number; units: number; value: number; healthy: number; negative: number;
  low: StockFlag[]; out: StockFlag[]; top: StockFlag[]; byCategory: { name: string; value: number; items: number }[];
};
export function inventoryHealth(rows: StockProd[], def = DEFAULT_THRESHOLD, uncategorized = "—"): InvHealth {
  const low: StockFlag[] = [], out: StockFlag[] = [], all: StockFlag[] = []; const cat = new Map<string, { name: string; value: number; items: number }>();
  let units = 0, value = 0, negative = 0;
  for (const p of rows) {
    const q = Number(p.qty) || 0, c = Number(p.cost) || 0, thr = thresholdOf({ min_quantity: p.min_quantity, reorder_level: p.reorder_level }, def);
    const v = r2(Math.max(q, 0) * c); const f: StockFlag = { ...p, qty: q, cost: c, thr, value: v }; all.push(f);
    if (q < 0) negative++; if (q > 0) units += q; value += v;
    if (q <= 0) out.push(f); else if (q <= thr) low.push(f);
    const k = (p.category || "").trim() || uncategorized; const s = cat.get(k) ?? { name: k, value: 0, items: 0 }; s.value += v; s.items++; cat.set(k, s);
  }
  low.sort((a, b) => a.qty / (a.thr || 1) - b.qty / (b.thr || 1)); out.sort((a, b) => a.qty - b.qty);
  return {
    items: rows.length, units: r2(units), value: r2(value), healthy: rows.length - low.length - out.length, negative, low, out,
    top: [...all].sort((a, b) => b.value - a.value).slice(0, 8), byCategory: Array.from(cat.values()).map((c) => ({ ...c, value: r2(c.value) })).sort((a, b) => b.value - a.value),
  };
}

// ═══════════ الطلبات ═══════════
export type OrderLite = { status: string | null; total_amount: number | null; created_at: string };
export type OrderStats = { received: number; completed: number; pending: number; rejected: number; sales: number; completionRate: number | null; monthly: { ym: string; count: number }[] };
/** الطلبات ضمن الفترة [from,to]. «مكتمل» = approved|completed. الأشهر الستة تنتهي بشهر to. */
export function orderStats(orders: OrderLite[], from: string, to: string): OrderStats {
  const inR = orders.filter((o) => { const d = (o.created_at || "").slice(0, 10); return d >= from && d <= to; });
  const done = inR.filter((o) => o.status === "approved" || o.status === "completed");
  const mm = new Map<string, number>(); for (let i = 5; i >= 0; i--) mm.set(shiftYm(to.slice(0, 7), -i), 0);
  for (const o of orders) { const k = (o.created_at || "").slice(0, 7); if (mm.has(k)) mm.set(k, (mm.get(k) || 0) + 1); }
  return {
    received: inR.length, completed: done.length, pending: inR.filter((o) => o.status === "pending").length, rejected: inR.filter((o) => o.status === "rejected").length,
    sales: r2(done.reduce((s, o) => s + (Number(o.total_amount) || 0), 0)), completionRate: inR.length ? r2((done.length / inR.length) * 100) : null,
    monthly: Array.from(mm.entries()).map(([ym, count]) => ({ ym, count })),
  };
}
