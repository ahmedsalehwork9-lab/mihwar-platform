// =============================================================
// src/pages/accounting/ledger/ledgerLogic.ts
// منطق كشف الحساب (دوال نقية قابلة للاختبار): الرصيد الجاري، الإجماليات،
// استبعاد المسودات، التصفية داخل الحركات، فترات سريعة، رقم القيد JV.
// الاتجاه المحاسبي: الرصيد = مدين − دائن (موجب = مدين، سالب = دائن).
// =============================================================
import type { LedgerLine } from "../../lib/accountingDb";
import { normalizeText } from "../chart/chartLogic";

export type SideFilter = "all" | "debit" | "credit";
export type SortDir = "asc" | "desc";

export type StmtRow = LedgerLine & { running: number; seq: number };
export type Statement = { opening: number; rows: StmtRow[]; totalDebit: number; totalCredit: number; closing: number };

const r2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;

/** القيد المسودة يُستبعد ما لم يُطلب تضمينه. السطر بلا حالة يُعدّ مرحّلًا (توافق مع البيانات القديمة). */
export const isPosted = (r: Pick<LedgerLine, "status">): boolean => (r.status ?? "posted") === "posted";

export function netOf(rows: LedgerLine[], includeDrafts: boolean): number {
  let n = 0;
  for (const r of rows) if (includeDrafts || isPosted(r)) n += (Number(r.debit) || 0) - (Number(r.credit) || 0);
  return r2(n);
}

export function buildStatement(openingRows: LedgerLine[], periodRows: LedgerLine[], includeDrafts: boolean): Statement {
  const opening = netOf(openingRows, includeDrafts);
  const sorted = periodRows
    .filter((r) => includeDrafts || isPosted(r))
    .map((r, i) => ({ r, i }))
    .sort((a, b) => (a.r.date || "").localeCompare(b.r.date || "") || (a.r.entry_year ?? 0) - (b.r.entry_year ?? 0) || (a.r.entry_no ?? 0) - (b.r.entry_no ?? 0) || a.i - b.i);
  let run = opening; let td = 0; let tc = 0;
  const rows: StmtRow[] = sorted.map(({ r }, seq) => {
    const d = Number(r.debit) || 0; const c = Number(r.credit) || 0;
    td += d; tc += c; run = r2(run + d - c);
    return { ...r, debit: d, credit: c, running: run, seq };
  });
  return { opening, rows, totalDebit: r2(td), totalCredit: r2(tc), closing: r2(opening + td - tc) };
}

export type BalanceSide = "dr" | "cr" | "zero";
export function balanceLabel(n: number): { abs: number; side: BalanceSide } {
  const v = r2(n);
  return { abs: Math.abs(v), side: v > 0.004 ? "dr" : v < -0.004 ? "cr" : "zero" };
}

export const jvLabel = (year: number | null | undefined, no: number): string =>
  year ? `JV-${year}-${String(no).padStart(4, "0")}` : String(no).padStart(4, "0");

export type MoveFilter = { q: string; side: SideFilter; type: string };
export const DEFAULT_MOVE_FILTER: MoveFilter = { q: "", side: "all", type: "all" };
export const isMoveFiltering = (f: MoveFilter): boolean => f.q.trim() !== "" || f.side !== "all" || f.type !== "all";

export type Resolvers = { accountText: (id: number) => string; partyName: (id: number | null) => string };

/** مرشّح الحركات: كل كلمات البحث (AND) تُطابق رقم القيد/JV/البيان/الملاحظة/الحساب/الطرف/المبلغ. */
export function filterRows(rows: StmtRow[], f: MoveFilter, res: Resolvers): StmtRow[] {
  const toks = normalizeText(f.q).split(/\s+/).filter(Boolean);
  return rows.filter((r) => {
    if (f.side === "debit" && !(r.debit > 0)) return false;
    if (f.side === "credit" && !(r.credit > 0)) return false;
    if (f.type !== "all" && (r.entry_type || "general") !== f.type) return false;
    if (!toks.length) return true;
    const hay = normalizeText([
      jvLabel(r.entry_year, r.entry_no), String(r.entry_no), r.description || "", r.note || "", res.accountText(r.account_id), res.partyName(r.party_id),
      r.debit ? r.debit.toFixed(2) : "", r.credit ? r.credit.toFixed(2) : "", r.debit ? String(r.debit) : "", r.credit ? String(r.credit) : "", r.date,
    ].join(" "));
    return toks.every((t) => hay.includes(t));
  });
}

export function sumRows(rows: StmtRow[]): { debit: number; credit: number } {
  let d = 0; let c = 0; for (const r of rows) { d += r.debit; c += r.credit; }
  return { debit: r2(d), credit: r2(c) };
}

// ── تواريخ (نصوص YYYY-MM-DD، بلا اعتماد على المنطقة الزمنية) ──
const z = (n: number): string => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number): string => `${y}-${z(m)}-${z(d)}`;
const lastDay = (y: number, m: number): number => new Date(Date.UTC(y, m, 0)).getUTCDate();

export function dayBefore(d: string): string {
  const [y, m, dd] = d.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, dd - 1));
  return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

export type PresetKey = "thisMonth" | "lastMonth" | "thisQuarter" | "thisYear" | "lastYear" | "all";
export function datePreset(key: PresetKey, today: string): { from: string; to: string } {
  const [y, m] = today.split("-").map(Number);
  switch (key) {
    case "thisMonth": return { from: ymd(y, m, 1), to: today };
    case "lastMonth": { const pm = m === 1 ? 12 : m - 1; const py = m === 1 ? y - 1 : y; return { from: ymd(py, pm, 1), to: ymd(py, pm, lastDay(py, pm)) }; }
    case "thisQuarter": { const qs = Math.floor((m - 1) / 3) * 3 + 1; return { from: ymd(y, qs, 1), to: today }; }
    case "thisYear": return { from: ymd(y, 1, 1), to: today };
    case "lastYear": return { from: ymd(y - 1, 1, 1), to: ymd(y - 1, 12, 31) };
    default: return { from: "2000-01-01", to: today };
  }
}
export const PRESET_KEYS: PresetKey[] = ["thisMonth", "lastMonth", "thisQuarter", "thisYear", "lastYear", "all"];

/** أي فترة محددة تطابق مفتاحًا سريعًا (لتمييز الزر الفعّال). */
export function presetOf(from: string, to: string, today: string): PresetKey | null {
  for (const k of PRESET_KEYS) { const p = datePreset(k, today); if (p.from === from && p.to === to) return k; }
  return null;
}

export const ENTRY_TYPE_EN: Record<string, string> = {
  general: "General", purchases: "Purchases", purchase_return: "Purchase return", adjustment: "Stock adjustment", sales: "Sales", sales_return: "Sales return",
  settlement: "Settlement", receipt: "Receipt voucher", payment: "Payment voucher", depreciation: "Depreciation", opening: "Opening balance",
};
