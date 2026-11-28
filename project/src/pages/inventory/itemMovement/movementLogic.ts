// =============================================================
import { smartMatch } from "../../lib/smartSearch";
// src/pages/inventory/itemMovement/movementLogic.ts
// منطق نقي لتقرير حركة الصنف: دفتر الحركة بالرصيد الجاري، الرصيد الافتتاحي المُستنتج،
// الملخصات (حسب النوع/المخزن)، متوسط التكلفة، وتغيّر أسعار الشراء.
// المصدر: gl_stock_moves (qty بإشارة: + وارد / − صادر).
// =============================================================
export type Move = { id: number; created_at: string; move_type: string; qty: number; unit_cost: number | null; ref_type: string | null; ref_id: number | null; notes: string | null; warehouse_id: number | null; branch_id: number | null };
export const r2 = (n: number): number => Math.round(n * 100) / 100;
export const r3 = (n: number): number => Math.round(n * 1000) / 1000;
export const EPS = 0.0005;
export const dayOf = (iso: string): string => (iso || "").slice(0, 10);

export type MoveKind = "in" | "out";
export const kindOf = (m: Pick<Move, "qty">): MoveKind => (Number(m.qty) >= 0 ? "in" : "out");

export const TYPE_LABEL: Record<string, { en: string; ar: string }> = {
  purchase_in: { en: "Purchase", ar: "شراء" }, purchase_return: { en: "Purchase return", ar: "مرتجع شراء" },
  sale_out: { en: "Sale", ar: "مبيعات" }, sale_return: { en: "Sales return", ar: "مرتجع مبيعات" }, sales_return: { en: "Sales return", ar: "مرتجع مبيعات" },
  adjust: { en: "Stock adjustment", ar: "تسوية مخزون" }, transfer_in: { en: "Transfer in", ar: "تحويل وارد" }, transfer_out: { en: "Transfer out", ar: "تحويل صادر" },
  opening: { en: "Opening balance", ar: "رصيد افتتاحي" },
};
export const typeLabel = (type: string, lang: "ar" | "en"): string => { const l = TYPE_LABEL[type]; return l ? l[lang] : type; };

/** نص مرجع الحركة: PO/SO... من ref_type + ref_id (إن وُجد). */
export function refLabel(m: Pick<Move, "ref_type" | "ref_id">): string {
  if (m.ref_id == null) return "";
  const p = m.ref_type === "gl_purchase_invoices" ? "PI" : m.ref_type === "gl_purchase_returns" ? "PR" : m.ref_type === "gl_sales_invoices" ? "SI" : m.ref_type === "pos_sale" ? "POS" : m.ref_type === "gl_sales_returns" ? "SR" : "#";
  return `${p}-${m.ref_id}`;
}

export type LedgerRow = { m: Move; date: string; kind: MoveKind; inQty: number; outQty: number; balance: number; value: number };
export type Ledger = {
  impliedOpening: number;       // الرصيد الافتتاحي غير المسجّل = الكمية الحالية − مجموع كل الحركات
  periodOpening: number;        // الرصيد قبل بداية الفترة
  rows: LedgerRow[];            // حركات الفترة بعد الفلاتر
  totalIn: number; totalOut: number; closing: number;
  allCount: number; periodCount: number;
  valueIn: number; valueOut: number;
};

export type LedgerFilter = { from: string; to: string; types: Set<string> | null; warehouse: "all" | "none" | number; kind: "all" | MoveKind; q: string };
export const DEFAULT_LEDGER_FILTER: LedgerFilter = { from: "", to: "", types: null, warehouse: "all", kind: "all", q: "" };

const sortMoves = (ms: Move[]): Move[] => [...ms].sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id - b.id));

export function buildLedger(moves: Move[], currentQty: number, f: LedgerFilter, refText: (m: Move) => string = refLabel): Ledger {
  const all = sortMoves(moves);
  const sum = all.reduce((s, m) => s + (Number(m.qty) || 0), 0);
  const impliedOpening = r3((Number(currentQty) || 0) - sum);
  let bal = impliedOpening; let periodOpening = impliedOpening;
  const rows: LedgerRow[] = []; let totalIn = 0, totalOut = 0, valueIn = 0, valueOut = 0;
  const q = f.q.trim().toLowerCase();
  for (const m of all) {
    const qty = Number(m.qty) || 0; const d = dayOf(m.created_at);
    if (f.from && d < f.from) { bal = r3(bal + qty); periodOpening = bal; continue; }
    bal = r3(bal + qty);
    if (f.to && d > f.to) continue;
    if (f.types && !f.types.has(m.move_type)) continue;
    if (f.kind !== "all" && kindOf(m) !== f.kind) continue;
    if (f.warehouse === "none" ? m.warehouse_id != null : typeof f.warehouse === "number" && m.warehouse_id !== f.warehouse) continue;
    if (q && !smartMatch(q, m.move_type, m.notes, refText(m), d)) continue;
    const value = r2(Math.abs(qty) * (Number(m.unit_cost) || 0));
    if (qty >= 0) { totalIn += qty; valueIn += value; } else { totalOut += -qty; valueOut += value; }
    rows.push({ m, date: d, kind: kindOf(m), inQty: qty > 0 ? qty : 0, outQty: qty < 0 ? -qty : 0, balance: bal, value });
  }
  const periodRows = rows.length;
  const closing = rows.length ? rows[rows.length - 1].balance : periodOpening;
  return { impliedOpening, periodOpening, rows, totalIn: r3(totalIn), totalOut: r3(totalOut), closing, allCount: all.length, periodCount: periodRows, valueIn: r2(valueIn), valueOut: r2(valueOut) };
}

/** متوسط تكلفة الوارد المرجّح (الحركات الواردة ذات التكلفة فقط). */
export function avgInboundCost(moves: Move[]): number | null {
  let q = 0, v = 0;
  for (const m of moves) { const n = Number(m.qty) || 0; const c = Number(m.unit_cost); if (n > 0 && Number.isFinite(c) && m.unit_cost != null) { q += n; v += n * c; } }
  return q > EPS ? v / q : null;
}

export type TypeSummary = { type: string; count: number; inQty: number; outQty: number; net: number; value: number };
export function summaryByType(rows: LedgerRow[]): TypeSummary[] {
  const m = new Map<string, TypeSummary>();
  for (const r of rows) { const s = m.get(r.m.move_type) || { type: r.m.move_type, count: 0, inQty: 0, outQty: 0, net: 0, value: 0 };
    s.count++; s.inQty += r.inQty; s.outQty += r.outQty; s.net = r3(s.net + r.inQty - r.outQty); s.value += r.value; m.set(r.m.move_type, s); }
  return [...m.values()].sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
}

export type WhBalance = { warehouseId: number | null; qty: number; count: number };
/** رصيد كل مخزن من الحركات المسجّلة (null = بلا مخزن). الافتتاحي غير المسجّل لا يُنسب لمخزن. */
export function balanceByWarehouse(moves: Move[]): WhBalance[] {
  const m = new Map<number | null, WhBalance>();
  for (const x of moves) { const k = x.warehouse_id ?? null; const b = m.get(k) || { warehouseId: k, qty: 0, count: 0 }; b.qty = r3(b.qty + (Number(x.qty) || 0)); b.count++; m.set(k, b); }
  return [...m.values()].sort((a, b) => (a.warehouseId ?? 1e15) - (b.warehouseId ?? 1e15));
}

export type PricePoint = { date: string; unitCost: number; prev: number | null; diff: number | null; pct: number | null; qty: number; ref: string };
/** تغيّر سعر الشراء: كل حركة شراء بتكلفة، مقارنة بسابقتها. */
export function priceChanges(moves: Move[], refText: (m: Move) => string = refLabel): PricePoint[] {
  const out: PricePoint[] = []; let prev: number | null = null;
  for (const m of sortMoves(moves)) {
    if (m.move_type !== "purchase_in" || m.unit_cost == null) continue;
    const c = Number(m.unit_cost); const diff = prev == null ? null : r2(c - prev); const pct = prev != null && prev > 0 ? ((c - prev) / prev) * 100 : null;
    out.push({ date: dayOf(m.created_at), unitCost: c, prev, diff, pct, qty: Number(m.qty) || 0, ref: refText(m) }); prev = c;
  }
  return out;
}

export type LinePt = { label: string; value: number };
/** نقاط تطور الرصيد: آخر رصيد في كل يوم (يبدأ بالافتتاحي عند وجوده). */
export function balanceSeries(l: Ledger): LinePt[] {
  const pts: LinePt[] = []; if (Math.abs(l.periodOpening) > EPS || !l.rows.length) pts.push({ label: "0", value: l.periodOpening });
  for (const r of l.rows) { const last = pts[pts.length - 1]; if (last && last.label === r.date) last.value = r.balance; else pts.push({ label: r.date, value: r.balance }); }
  return pts;
}
export function typesPresent(moves: Move[]): string[] { return [...new Set(moves.map((m) => m.move_type))].sort(); }

// ───────────── المستندات المرتبطة بالصنف + الركود ─────────────
export type DocKind = "purchase" | "purchase_return" | "sale" | "sale_return";
export type RawDoc = { kind: DocKind; id: number; no: number; year: number; date: string; party: string | null; status: string | null; items: unknown };
export type DocRow = { kind: DocKind; id: number; no: number; year: number; label: string; date: string; party: string; qty: number; unit: number; total: number; status: string; approx: boolean };
export const DOC_PREFIX: Record<DocKind, string> = { purchase: "PI", purchase_return: "PR", sale: "SI", sale_return: "SR" };
export const DOC_LABEL: Record<DocKind, { en: string; ar: string }> = {
  purchase: { en: "Purchase invoice", ar: "فاتورة شراء" }, purchase_return: { en: "Purchase return", ar: "مرتجع شراء" },
  sale: { en: "Sales invoice", ar: "فاتورة بيع" }, sale_return: { en: "Sales return", ar: "مرتجع بيع" },
};
export const docNumber = (kind: DocKind, year: number, no: number): string => `${DOC_PREFIX[kind]}-${year}-${String(no).padStart(4, "0")}`;
const num = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, " ").trim();

/** هل وصف سطر قديم (بلا product_id) يخصّ الصنف؟ مطابقة محافظة: الكود بين قوسين أو الاسم كاملًا. */
export function descMatches(desc: string, name: string, code: string | null): boolean {
  const d = norm(desc || ""); if (!d) return false;
  if (code && d.includes(`(${norm(code)})`)) return true;
  return norm(name) !== "" && (d === norm(name) || d.startsWith(norm(name) + " ("));
}

/** يستخرج سطر/أسطر الصنف من كل مستند (مطابقة product_id، وللمبيعات القديمة مطابقة وصفية تُعلَّم approx). */
export function docRowsFor(raw: RawDoc[], product: { id: number; name: string; code: string | null }): DocRow[] {
  const out: DocRow[] = [];
  for (const d of raw) {
    const items = Array.isArray(d.items) ? (d.items as Record<string, unknown>[]) : [];
    let qty = 0, total = 0, approx = false, hit = false;
    for (const it of items) {
      const pid = it.product_id != null ? Number(it.product_id) : null;
      const exact = pid === product.id;
      const legacy = pid == null && (d.kind === "sale" || d.kind === "sale_return") && descMatches(String(it.description ?? ""), product.name, product.code);
      if (!exact && !legacy) continue;
      const q = num(it.qty); const u = d.kind === "purchase" || d.kind === "purchase_return" ? num(it.unit_cost) : num(it.unit_price);
      qty += q; total += it.line_total != null ? num(it.line_total) : q * u; hit = true; if (legacy) approx = true;
    }
    if (!hit) continue;
    out.push({ kind: d.kind, id: d.id, no: d.no, year: d.year, label: docNumber(d.kind, d.year, d.no), date: (d.date || "").slice(0, 10), party: d.party || "", qty: r3(qty), unit: qty > 0 ? r2(total / qty) : 0, total: r2(total), status: d.status || "", approx });
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id));
}

export type Staleness = "unknown" | "nostock" | "new" | "active" | "slow" | "dead" | "never";
export type StaleInfo = { status: Staleness; lastSale: string | null; lastPurchase: string | null; lastMove: string | null; daysSinceSale: number | null; daysSinceIn: number | null; tiedValue: number | null; threshold: number };
export const daysBetween = (a: string, b: string): number => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
const maxDate = (xs: (string | null)[]): string | null => xs.filter((x): x is string => !!x).sort().pop() ?? null;

/** تصنيف الركود: آخر بيع/آخر وارد من الحركات والمستندات معًا. active ≤30 يومًا، slow ≤ threshold، dead أكثر. */
export function staleness(moves: Move[], docs: DocRow[], qty: number, costFallback: number | null, today: string, threshold = 90): StaleInfo {
  const saleD = [...moves.filter((m) => m.move_type === "sale_out").map((m) => dayOf(m.created_at)), ...docs.filter((d) => d.kind === "sale").map((d) => d.date)];
  const inD = [...moves.filter((m) => Number(m.qty) > 0 && m.move_type !== "sale_return").map((m) => dayOf(m.created_at)), ...docs.filter((d) => d.kind === "purchase").map((d) => d.date)];
  const lastSale = maxDate(saleD), lastPurchase = maxDate(docs.filter((d) => d.kind === "purchase").map((d) => d.date).concat(moves.filter((m) => m.move_type === "purchase_in").map((m) => dayOf(m.created_at))));
  const lastIn = maxDate(inD), lastMove = maxDate(moves.map((m) => dayOf(m.created_at)).concat(docs.map((d) => d.date)));
  const avg = avgInboundCost(moves); const unit = avg ?? costFallback; const tiedValue = unit != null && qty > 0 ? r2(qty * unit) : null;
  const daysSinceSale = lastSale ? Math.max(0, daysBetween(lastSale, today)) : null; const daysSinceIn = lastIn ? Math.max(0, daysBetween(lastIn, today)) : null;
  const base = { lastSale, lastPurchase, lastMove, daysSinceSale, daysSinceIn, tiedValue, threshold };
  if (qty <= 0) return { ...base, status: "nostock" };
  if (!lastMove) return { ...base, status: "unknown" };
  if (daysSinceSale == null) return { ...base, status: daysSinceIn != null && daysSinceIn > threshold ? "never" : "new" };
  return { ...base, status: daysSinceSale <= 30 ? "active" : daysSinceSale <= threshold ? "slow" : "dead" };
}
