// =============================================================
// src/pages/inventory/stocktake/stocktakeLogic.ts
// منطق الجرد (نقي، بلا واجهة): نطاق الجرد، الفروقات، الإجماليات، قيد التسوية، المسودات.
// =============================================================
export type CountItem = { id: number; code: string | null; name: string; brand: string | null; category: string | null; barcode: string | null; book: number; cost: number };
export type ScopeMode = "all" | "category" | "brand" | "pick";
export type CountScope = { mode: ScopeMode; values: string[]; ids: number[]; includeZero: boolean };
export type Uncounted = "keep" | "zero";
export type Step = 1 | 2 | 3 | 4;
export type Draft = {
  v: 1; id: string; no: string; name: string; date: string; shopId: number | null; scope: CountScope;
  counts: Record<string, number>; uncounted: Uncounted; reason: string; step: Step; updatedAt: string;
};
export type DiffKind = "surplus" | "shortage" | "match" | "uncounted";
export type DiffRow = { item: CountItem; counted: number | null; actual: number | null; diff: number; kind: DiffKind; value: number };
export type Totals = { total: number; counted: number; uncounted: number; surplus: number; shortage: number; match: number; surplusValue: number; shortageValue: number; netValue: number; netQty: number };

export const r2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;
export const r3 = (n: number): number => Math.round((Number(n) || 0) * 1000) / 1000;
export const DEFAULT_SCOPE: CountScope = { mode: "all", values: [], ids: [], includeZero: true };

/** يقرأ كمية مكتوبة (يقبل الأرقام العربية-الهندية والفاصلة العربية). null إن لم تكن رقمًا صالحًا ≥ 0. */
export function parseQty(s: string): number | null {
  const t = (s ?? "").trim().replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٫,]/g, ".");
  if (t === "" || !/^\d*\.?\d+$|^\d+\.$/.test(t)) return null;
  const n = Number(t); return Number.isFinite(n) && n >= 0 ? r3(n) : null;
}

/** أصناف الجرد حسب النطاق. */
export function scopeItems(items: CountItem[], sc: CountScope): CountItem[] {
  let out = items;
  if (sc.mode === "category") { const s = new Set(sc.values); out = out.filter((i) => s.has(i.category ?? "")); }
  else if (sc.mode === "brand") { const s = new Set(sc.values); out = out.filter((i) => s.has(i.brand ?? "")); }
  else if (sc.mode === "pick") { const s = new Set(sc.ids); out = out.filter((i) => s.has(i.id)); }
  if (!sc.includeZero) out = out.filter((i) => i.book !== 0);
  return out;
}

/** الفروقات: المحسوب = counts[id]؛ غير المعدود يبقى كما هو (keep) أو يُعامل صفرًا (zero). */
export function diffRows(items: CountItem[], counts: Record<string, number>, uncounted: Uncounted): DiffRow[] {
  return items.map((item) => {
    const c = Object.prototype.hasOwnProperty.call(counts, String(item.id)) ? counts[String(item.id)] : null;
    if (c == null && uncounted === "keep") return { item, counted: null, actual: null, diff: 0, kind: "uncounted" as const, value: 0 };
    const actual = c ?? 0; const diff = r3(actual - item.book);
    const kind: DiffKind = diff > 0 ? "surplus" : diff < 0 ? "shortage" : "match";
    return { item, counted: c, actual, diff, kind, value: r2(diff * item.cost) };
  });
}

export function totals(rows: DiffRow[]): Totals {
  const t: Totals = { total: rows.length, counted: 0, uncounted: 0, surplus: 0, shortage: 0, match: 0, surplusValue: 0, shortageValue: 0, netValue: 0, netQty: 0 };
  for (const r of rows) {
    if (r.kind === "uncounted") { t.uncounted++; continue; }
    t.counted++; t.netQty = r3(t.netQty + r.diff);
    if (r.kind === "surplus") { t.surplus++; t.surplusValue = r2(t.surplusValue + r.value); }
    else if (r.kind === "shortage") { t.shortage++; t.shortageValue = r2(t.shortageValue + Math.abs(r.value)); }
    else t.match++;
  }
  t.netValue = r2(t.surplusValue - t.shortageValue); return t;
}

/** الأصناف التي تحتاج تسوية فعلًا (فائض/عجز). */
export const adjustable = (rows: DiffRow[]): DiffRow[] => rows.filter((r) => r.kind === "surplus" || r.kind === "shortage");

/** سطور القيد المجمّع: فائض (م المخزون / د التسوية) وعجز (م التسوية / د المخزون)؛ لا سطور بقيمة صفر. */
export function glPlan(rows: DiffRow[]): { inventoryDebit: number; inventoryCredit: number; counterDebit: number; counterCredit: number; balanced: boolean } {
  const s = r2(rows.filter((r) => r.kind === "surplus").reduce((a, r) => a + r.value, 0));
  const d = r2(rows.filter((r) => r.kind === "shortage").reduce((a, r) => a + Math.abs(r.value), 0));
  return { inventoryDebit: s, counterCredit: s, counterDebit: d, inventoryCredit: d, balanced: true };
}

/** الأصناف التي تغيّر رصيدها الدفتري منذ بدء الجرد (لتحذير الاعتماد). */
export function drifted(items: CountItem[], fresh: Map<number, number>): { item: CountItem; was: number; now: number }[] {
  const out: { item: CountItem; was: number; now: number }[] = [];
  for (const i of items) { const n = fresh.get(i.id); if (n != null && r3(n) !== r3(i.book)) out.push({ item: i, was: i.book, now: r3(n) }); }
  return out;
}

/** مسح باركود/كود: تطابق تام للباركود أولًا ثم الكود. */
export function scanFind(items: CountItem[], code: string): CountItem | null {
  const c = code.trim().toLowerCase(); if (!c) return null;
  return items.find((i) => (i.barcode ?? "").toLowerCase() === c) ?? items.find((i) => (i.code ?? "").toLowerCase() === c) ?? null;
}

export const groupValues = (items: CountItem[], key: "category" | "brand"): { value: string; count: number }[] => {
  const m = new Map<string, number>(); for (const i of items) { const v = (i[key] ?? "").trim(); m.set(v, (m.get(v) ?? 0) + 1); }
  return [...m.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
};

// ── المسودات (localStorage؛ كل استدعاء داخل try/catch) ──
export const DRAFTS_KEY = "mihwar.stocktake.drafts.v1";
export const countNo = (date: string, existing: string[]): string => {
  const y = date.slice(0, 4); const used = existing.filter((n) => n.startsWith(`CNT-${y}-`)).map((n) => Number(n.slice(9))).filter((n) => Number.isFinite(n));
  return `CNT-${y}-${String((used.length ? Math.max(...used) : 0) + 1).padStart(3, "0")}`;
};
export function validDraft(x: unknown): x is Draft {
  const d = x as Draft; return !!d && d.v === 1 && typeof d.id === "string" && typeof d.no === "string" && typeof d.date === "string" && !!d.scope && Array.isArray(d.scope.values) && Array.isArray(d.scope.ids)
    && !!d.counts && typeof d.counts === "object" && (d.uncounted === "keep" || d.uncounted === "zero") && [1, 2, 3, 4].includes(d.step);
}
export function loadDrafts(storage: Pick<Storage, "getItem"> | null): Draft[] {
  try { const raw = storage?.getItem(DRAFTS_KEY); if (!raw) return []; const a = JSON.parse(raw); return Array.isArray(a) ? a.filter(validDraft).sort((p, q) => (p.updatedAt < q.updatedAt ? 1 : -1)) : []; } catch { return []; }
}
export function saveDrafts(storage: Pick<Storage, "setItem"> | null, drafts: Draft[]): boolean {
  try { storage?.setItem(DRAFTS_KEY, JSON.stringify(drafts)); return !!storage; } catch { return false; }
}
export const upsertDraft = (drafts: Draft[], d: Draft): Draft[] => [d, ...drafts.filter((x) => x.id !== d.id)];

// ── سجل الجرود المعتمدة (من حركات ref_type='stocktake'؛ الرقم في بداية الملاحظة "CNT-2026-001: السبب") ──
export type HistMove = { id: number; created_at: string; product_id: number; qty: number; unit_cost: number | null; notes: string | null };
export type HistGroup = { no: string; date: string; reason: string; items: number; surplus: number; shortage: number; netQty: number; netValue: number };
export function groupHistory(moves: HistMove[]): HistGroup[] {
  const m = new Map<string, HistGroup>();
  for (const x of moves) {
    const mt = /^(CNT-\d{4}-\d+):\s*(.*)$/.exec(x.notes ?? ""); const no = mt ? mt[1] : "—"; const reason = mt ? mt[2] : (x.notes ?? "");
    const g = m.get(no) ?? { no, date: x.created_at.slice(0, 10), reason, items: 0, surplus: 0, shortage: 0, netQty: 0, netValue: 0 };
    const q = Number(x.qty) || 0; g.items++; if (q > 0) g.surplus++; else if (q < 0) g.shortage++;
    g.netQty = r3(g.netQty + q); g.netValue = r2(g.netValue + q * (Number(x.unit_cost) || 0)); if (x.created_at.slice(0, 10) > g.date) g.date = x.created_at.slice(0, 10);
    m.set(no, g);
  }
  return [...m.values()].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.no.localeCompare(a.no)));
}
