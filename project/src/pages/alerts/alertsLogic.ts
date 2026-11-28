// =============================================================
// src/pages/alerts/alertsLogic.ts
// منطق مركز التنبيهات (دوال نقية): توليد التنبيهات من البيانات، الترتيب، الحالة (اطلاع/تأجيل)، المؤشرات، الفلاتر.
// =============================================================
import { buildRows, EPS, type AssetLike } from "../accounting/assets/assetsLogic";
import { enrich, daysBetween, type PInv } from "../purchases/list/purchasesLogic";
import { smartMatch } from "../lib/smartSearch";

export type Cat = "stock" | "suppliers" | "customers" | "journal" | "assets" | "orders";
export type Prio = "critical" | "warning" | "info";
export type Kind =
  | "out" | "low" | "sup_overdue" | "sup_soon" | "sup_open" | "cus_overdue" | "cus_soon" | "cus_open"
  | "je_draft" | "asset_due" | "asset_noacct" | "asset_full" | "order";
export type Go = { page: string; section?: string };
export type Alert = {
  id: string; cat: Cat; prio: Prio; kind: Kind;
  name: string;          // الصنف / المورد / العميل / الأصل / الوصف
  ref: string;           // كود أو رقم مستند
  amount: number | null; qty: number | null; threshold: number | null;
  days: number | null;   // أيام التأخر (موجب) أو المتبقي لحين الاستحقاق (kind *_soon) أو عمر المستند
  date: string | null; go: Go;
};

export const CATS: Cat[] = ["stock", "suppliers", "customers", "journal", "assets", "orders"];
export const PRIO_RANK: Record<Prio, number> = { critical: 0, warning: 1, info: 2 };
export const SOON_DAYS = 7;
export const OLD_OPEN_DAYS = 30;
export const DEFAULT_THRESHOLD = 2;
export const r2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;
export const ymd = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const addDays = (s: string, n: number): string => { const [y, m, d] = s.split("-").map(Number); return ymd(new Date(y, m - 1, d + n)); };

// ── المخزون ──
export type StockRow = { id: number; product_name: string; product_code: string | null; quantity: number; min_quantity: number | null; reorder_level: number | null };
export function thresholdOf(r: Pick<StockRow, "min_quantity" | "reorder_level">, def: number): number {
  const re = Number(r.reorder_level) || 0; if (re > 0) return re; const mn = Number(r.min_quantity) || 0; return mn > 0 ? mn : def;
}
export function stockAlerts(rows: StockRow[], def: number): Alert[] {
  const out: Alert[] = [];
  for (const r of rows) {
    const q = Number(r.quantity) || 0; const th = thresholdOf(r, def);
    if (q <= 0) out.push({ id: `stock:${r.id}`, cat: "stock", prio: "critical", kind: "out", name: r.product_name, ref: r.product_code ?? "", amount: null, qty: q, threshold: th, days: null, date: null, go: { page: "stock-adjustments" } });
    else if (q <= th) out.push({ id: `stock:${r.id}`, cat: "stock", prio: "warning", kind: "low", name: r.product_name, ref: r.product_code ?? "", amount: null, qty: q, threshold: th, days: null, date: null, go: { page: "stock-adjustments" } });
  }
  return out;
}

// ── استحقاقات (موردون / عملاء) بنفس المنطق ──
function dueKind(due: number, dueDate: string | null, invDate: string, today: string): { prio: Prio; k: "overdue" | "soon" | "open"; days: number } | null {
  if (due <= EPS) return null;
  if (dueDate) {
    if (dueDate < today) return { prio: "critical", k: "overdue", days: daysBetween(dueDate, today) };
    const left = daysBetween(today, dueDate); if (left <= SOON_DAYS) return { prio: "warning", k: "soon", days: left };
    return null;
  }
  const age = daysBetween(invDate, today); return age > OLD_OPEN_DAYS ? { prio: "info", k: "open", days: age } : null;
}
export function supplierAlerts(list: PInv[], retByInv: Record<number, number>, today: string): Alert[] {
  const out: Alert[] = [];
  for (const r of enrich(list, retByInv, today)) {
    if (!r.active || r.retStatus === "full") continue;
    const d = dueKind(r.due, r.inv.due_date, r.inv.date, today); if (!d) continue;
    out.push({ id: `sup:${r.inv.id}`, cat: "suppliers", prio: d.prio, kind: (`sup_${d.k}` as Kind), name: r.inv.supplier_name || "—", ref: r.label, amount: r.due, qty: null, threshold: null, days: d.days, date: r.inv.due_date ?? r.inv.date, go: { page: "purchase-invoices" } });
  }
  return out;
}
export type SalesInv = { id: number; invoice_no: number; invoice_year: number; date: string; due_date: string | null; customer_name: string | null; total: number; paid_amount: number; status: string };
const INACTIVE = new Set(["cancelled", "canceled", "void", "voided", "draft"]);
export function customerAlerts(list: SalesInv[], today: string): Alert[] {
  const out: Alert[] = [];
  for (const i of list) {
    if (INACTIVE.has((i.status ?? "").toLowerCase())) continue;
    const due = r2(Math.max(0, (Number(i.total) || 0) - (Number(i.paid_amount) || 0)));
    const d = dueKind(due, i.due_date, i.date, today); if (!d) continue;
    out.push({ id: `cus:${i.id}`, cat: "customers", prio: d.prio, kind: (`cus_${d.k}` as Kind), name: i.customer_name || "—", ref: `${i.invoice_no}/${i.invoice_year}`, amount: due, qty: null, threshold: null, days: d.days, date: i.due_date ?? i.date, go: { page: "sales-invoice" } });
  }
  return out;
}

// ── القيود غير المرحّلة ──
export type DraftEntry = { id: number; entry_no: number; entry_year: number; date: string; description: string | null; status: string };
export function journalAlerts(list: DraftEntry[], today: string): Alert[] {
  return list.filter((e) => (e.status ?? "").toLowerCase() !== "posted").map((e) => {
    const age = Math.max(0, daysBetween(e.date, today));
    return { id: `je:${e.id}`, cat: "journal" as Cat, prio: (age > OLD_OPEN_DAYS ? "critical" : "warning") as Prio, kind: "je_draft" as Kind, name: e.description || "—", ref: `${e.entry_year}-${e.entry_no}`, amount: null, qty: null, threshold: null, days: age, date: e.date, go: { page: "accounting", section: "journal" } };
  });
}

// ── الأصول ──
export function assetAlerts(assets: AssetLike[], today: string): Alert[] {
  const out: Alert[] = [];
  for (const r of buildRows(assets.filter((a) => a.is_active), today)) {
    const base = { cat: "assets" as Cat, name: r.a.name, ref: r.a.category ?? "", qty: null, threshold: null, date: r.a.acquire_date, go: { page: "accounting", section: "assets" } };
    if (r.state === "future") continue;
    if (r.noAccounts && r.dep.depreciable > EPS) out.push({ ...base, id: `asset:${r.a.id}:noacct`, prio: "info", kind: "asset_noacct", amount: null, days: null });
    else if (r.due > EPS) out.push({ ...base, id: `asset:${r.a.id}:due`, prio: "warning", kind: "asset_due", amount: r.due, days: r.dep.months });
    if (r.state === "fully") out.push({ ...base, id: `asset:${r.a.id}:full`, prio: "info", kind: "asset_full", amount: r.dep.bookValue, days: null });
  }
  return out;
}

// ── الطلبات المعلّقة ──
export type PendingOrder = { id: number; from_shop_name: string; to_shop_name: string; total_amount: number; created_at: string };
export function orderAlerts(list: PendingOrder[], today: string): Alert[] {
  return list.map((o) => {
    const day = (o.created_at || "").slice(0, 10); const age = day ? Math.max(0, daysBetween(day, today)) : 0;
    return { id: `order:${o.id}`, cat: "orders" as Cat, prio: (age >= 2 ? "warning" : "info") as Prio, kind: "order" as Kind, name: o.from_shop_name || "—", ref: `#${o.id}`, amount: Number(o.total_amount) || 0, qty: null, threshold: null, days: age, date: day || null, go: { page: "orders" } };
  });
}

// ── الحالة: اطلاع / تأجيل ──
export type AckInfo = { prio: Prio; at: string };
export type AlertState = { ack: Record<string, AckInfo>; snooze: Record<string, string> };
export const EMPTY_STATE: AlertState = { ack: {}, snooze: {} };
export type Status = "open" | "ack" | "snoozed";
export type View = Alert & { status: Status; until: string | null };

/** الاطلاع يُعاد فتحه إن ازدادت خطورة التنبيه؛ التأجيل ينتهي بتاريخه. */
export function statusOf(a: Alert, st: AlertState, today: string): { status: Status; until: string | null } {
  const sn = st.snooze[a.id]; if (sn && sn >= today) return { status: "snoozed", until: sn };
  const ak = st.ack[a.id]; if (ak && PRIO_RANK[a.prio] >= PRIO_RANK[ak.prio]) return { status: "ack", until: null };
  return { status: "open", until: null };
}
export function withStatus(alerts: Alert[], st: AlertState, today: string): View[] {
  return alerts.map((a) => ({ ...a, ...statusOf(a, st, today) }));
}
export function sortViews(v: View[]): View[] {
  return [...v].sort((a, b) => PRIO_RANK[a.prio] - PRIO_RANK[b.prio] || (b.days ?? 0) - (a.days ?? 0) || (b.amount ?? 0) - (a.amount ?? 0) || a.id.localeCompare(b.id));
}
export const acknowledge = (st: AlertState, a: Alert, today: string): AlertState => ({ ack: { ...st.ack, [a.id]: { prio: a.prio, at: today } }, snooze: omit(st.snooze, a.id) });
export const snooze = (st: AlertState, id: string, until: string): AlertState => ({ ack: st.ack, snooze: { ...st.snooze, [id]: until } });
export const restore = (st: AlertState, id: string): AlertState => ({ ack: omit(st.ack, id), snooze: omit(st.snooze, id) });
function omit<T>(o: Record<string, T>, k: string): Record<string, T> { const c = { ...o }; delete c[k]; return c; }
/** يحذف حالات تنبيهات لم تعد موجودة أو انتهى تأجيلها (لمنع تضخم التخزين). */
export function prune(st: AlertState, liveIds: Set<string>, today: string): AlertState {
  const ack: Record<string, AckInfo> = {}; const sn: Record<string, string> = {};
  for (const [k, v] of Object.entries(st.ack)) if (liveIds.has(k)) ack[k] = v;
  for (const [k, v] of Object.entries(st.snooze)) if (liveIds.has(k) && v >= today) sn[k] = v;
  return { ack, snooze: sn };
}
const KEY = "mihwar.alerts.state.v1";
export const stateKey = (orgId: number | null, shopId: number | null): string => `${KEY}:${orgId ?? 0}:${shopId ?? 0}`;
export function loadState(s: Storage | null, key: string): AlertState {
  try {
    const raw = s?.getItem(key); if (!raw) return EMPTY_STATE; const o = JSON.parse(raw) as Partial<AlertState>;
    return { ack: o.ack && typeof o.ack === "object" ? o.ack : {}, snooze: o.snooze && typeof o.snooze === "object" ? o.snooze : {} };
  } catch { return EMPTY_STATE; }
}
export function saveState(s: Storage | null, key: string, st: AlertState): boolean { try { if (!s) return false; s.setItem(key, JSON.stringify(st)); return true; } catch { return false; } }
export const thresholdKey = (shopId: number | null): string => `mihwar.alerts.threshold.v1:${shopId ?? 0}`;
export function loadThreshold(s: Storage | null, key: string): number { try { const n = Number(s?.getItem(key)); return Number.isFinite(n) && n >= 0 && s?.getItem(key) != null ? n : DEFAULT_THRESHOLD; } catch { return DEFAULT_THRESHOLD; } }

// ── المؤشرات والفلاتر ──
export type Kpis = { critical: number; warning: number; info: number; open: number; ack: number; snoozed: number; supOverdueAmt: number; cusOverdueAmt: number; byCat: Record<Cat, number> };
export function kpisOf(v: View[]): Kpis {
  const k: Kpis = { critical: 0, warning: 0, info: 0, open: 0, ack: 0, snoozed: 0, supOverdueAmt: 0, cusOverdueAmt: 0, byCat: { stock: 0, suppliers: 0, customers: 0, journal: 0, assets: 0, orders: 0 } };
  for (const a of v) {
    if (a.status === "ack") { k.ack++; continue; } if (a.status === "snoozed") { k.snoozed++; continue; }
    k.open++; k[a.prio]++; k.byCat[a.cat]++;
    if (a.kind === "sup_overdue") k.supOverdueAmt = r2(k.supOverdueAmt + (a.amount ?? 0));
    if (a.kind === "cus_overdue") k.cusOverdueAmt = r2(k.cusOverdueAmt + (a.amount ?? 0));
  }
  return k;
}
export type AFilter = { cat: Cat | "all"; prio: Prio | "all"; status: Status | "all"; q: string };
export const DEFAULT_AFILTER: AFilter = { cat: "all", prio: "all", status: "open", q: "" };
export function filterViews(v: View[], f: AFilter): View[] {
  const s = f.q.trim().toLowerCase();
  return v.filter((a) => (f.cat === "all" || a.cat === f.cat) && (f.prio === "all" || a.prio === f.prio) && (f.status === "all" || a.status === f.status)
    && (!s || smartMatch(s, a.name, a.ref)));
}
