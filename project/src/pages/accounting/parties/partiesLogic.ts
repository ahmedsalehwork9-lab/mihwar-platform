// =============================================================
// src/pages/accounting/parties/partiesLogic.ts
// منطق العملاء والموردين (دوال نقية قابلة للاختبار): ربط الطرف بحساب الذمة،
// الأرصدة وأعمار الدين، المؤشرات، البحث المتقدم، الترتيب.
// أعمار الدين تُحسب بدالة partyAging الموجودة (FIFO) وتُمرَّر كمعامل.
// =============================================================
import type { Aging, GLAccount, GLParty, LedgerLine } from "../../lib/accountingDb";
import { normalizeText } from "../chart/chartLogic";

export type AgingFn = (lines: { date: string; debit: number; credit: number }[], type: string, creditDays: number, asOf: string) => Aging;

export type PartyRow = {
  party: GLParty;
  holderAccId: number | null; // حساب الذمة (الخاص بالطرف أو حساب مركزه)
  hasOwnAccount: boolean;
  isSub: boolean;
  balance: number;            // الرصيد المستحق: عميل = مدين−دائن، مورد = دائن−مدين
  aging: Aging | null;
  overdue: number;            // المتأخر = 1-30 + 31-60 + 61-90 + +90
  lastDate: string | null;    // تاريخ آخر حركة
};

const r2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;
export const isPostedLine = (l: Pick<LedgerLine, "status">): boolean => (l.status ?? "posted") === "posted";

/** الحساب الذي تُقرأ منه حركة الطرف: حسابه، وإلا حساب مركزه (طرف فرعي). */
export function holderAccountOf(p: GLParty, all: GLParty[]): number | null {
  if (p.account_id) return p.account_id;
  if (p.parent_id) return all.find((x) => x.id === p.parent_id)?.account_id ?? null;
  return null;
}

/** يبني صفوف الأطراف من الحركات (المرحّلة فقط). الطرف الفرعي يُفلتر بوسمه من حساب المركز. */
export function buildPartyRows(parties: GLParty[], lines: LedgerLine[], asOf: string, aging: AgingFn): PartyRow[] {
  const byAcc = new Map<number, LedgerLine[]>();
  for (const l of lines) {
    if (!isPostedLine(l)) continue;
    if (!byAcc.has(l.account_id)) byAcc.set(l.account_id, []);
    byAcc.get(l.account_id)!.push(l);
  }
  return parties.map((p) => {
    const acc = holderAccountOf(p, parties);
    const base: PartyRow = { party: p, holderAccId: acc, hasOwnAccount: !!p.account_id, isSub: p.parent_id != null, balance: 0, aging: null, overdue: 0, lastDate: null };
    if (!acc) return base;
    let ls = byAcc.get(acc) || [];
    if (!p.account_id) ls = ls.filter((l) => l.party_id === p.id);
    const ag = aging(ls, p.type, p.credit_days, asOf);
    const cust = p.type === "customer";
    const bal = ls.reduce((s, l) => s + (cust ? l.debit - l.credit : l.credit - l.debit), 0);
    let last: string | null = null; for (const l of ls) if (!last || l.date > last) last = l.date;
    return { ...base, balance: r2(bal), aging: ag, overdue: r2(ag.d30 + ag.d60 + ag.d90 + ag.d90p), lastDate: last };
  });
}

export type BalanceFilter = "all" | "due" | "zero" | "advance" | "overdue" | "over90";
export type KindFilter = "all" | "main" | "sub" | "noaccount";
export type StatusFilter = "all" | "active" | "inactive";
export type SortKey = "name" | "balance" | "overdue" | "over90" | "credit_days" | "lastDate";
export type SortDir = "asc" | "desc";
export type PartyFilters = { q: string; status: StatusFilter; balance: BalanceFilter; kind: KindFilter; sort: SortKey; dir: SortDir };
export const DEFAULT_PARTY_FILTERS: PartyFilters = { q: "", status: "all", balance: "all", kind: "all", sort: "name", dir: "asc" };
export const isPartyFiltering = (f: PartyFilters): boolean => f.q.trim() !== "" || f.status !== "all" || f.balance !== "all" || f.kind !== "all";

export function filterParties(rows: PartyRow[], f: PartyFilters, accById: Map<number, GLAccount>): PartyRow[] {
  const toks = normalizeText(f.q).split(/\s+/).filter(Boolean);
  const out = rows.filter((r) => {
    const p = r.party;
    if (f.status === "active" && !p.is_active) return false;
    if (f.status === "inactive" && p.is_active) return false;
    if (f.kind === "main" && (r.isSub || !r.hasOwnAccount)) return false;
    if (f.kind === "sub" && !r.isSub) return false;
    if (f.kind === "noaccount" && r.holderAccId != null) return false;
    if (f.balance === "due" && !(r.balance > 0.004)) return false;
    if (f.balance === "zero" && Math.abs(r.balance) >= 0.005) return false;
    if (f.balance === "advance" && !(r.balance < -0.004)) return false;
    if (f.balance === "overdue" && !(r.overdue > 0.004)) return false;
    if (f.balance === "over90" && !((r.aging?.d90p ?? 0) > 0.004)) return false;
    if (toks.length) {
      const acc = p.account_id != null ? accById.get(p.account_id) : undefined;
      const hay = normalizeText([p.name, p.phone ?? "", p.tax_number ?? "", p.address ?? "", p.notes ?? "", acc ? `${acc.code} ${acc.name} ${acc.name_en ?? ""}` : ""].join(" "));
      if (!toks.every((t) => hay.includes(t))) return false;
    }
    return true;
  });
  const sgn = f.dir === "asc" ? 1 : -1;
  const val = (r: PartyRow): number | string => {
    switch (f.sort) {
      case "balance": return r.balance; case "overdue": return r.overdue; case "over90": return r.aging?.d90p ?? 0;
      case "credit_days": return r.party.credit_days || 0; case "lastDate": return r.lastDate ?? "";
      default: return normalizeText(r.party.name);
    }
  };
  return [...out].sort((a, b) => {
    const x = val(a); const y = val(b);
    const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "ar");
    return c !== 0 ? c * sgn : a.party.id - b.party.id;
  });
}

export type PartyTotals = { count: number; holders: number; balance: number; current: number; d30: number; d60: number; d90: number; d90p: number; overdue: number; inDebt: number; noAccount: number };
/** الإجماليات تعدّ أصحاب الحسابات فقط (حركة الأطراف الفرعية مشمولة أصلًا في حساب مركزها). */
export function totalsOf(rows: PartyRow[]): PartyTotals {
  const t: PartyTotals = { count: rows.length, holders: 0, balance: 0, current: 0, d30: 0, d60: 0, d90: 0, d90p: 0, overdue: 0, inDebt: 0, noAccount: 0 };
  for (const r of rows) {
    if (r.holderAccId == null) t.noAccount++;
    if (!r.hasOwnAccount) continue;
    t.holders++; t.balance += r.balance;
    if (r.balance > 0.004) t.inDebt++;
    if (r.aging) { t.current += r.aging.current; t.d30 += r.aging.d30; t.d60 += r.aging.d60; t.d90 += r.aging.d90; t.d90p += r.aging.d90p; }
  }
  for (const k of ["balance", "current", "d30", "d60", "d90", "d90p"] as const) t[k] = r2(t[k]);
  t.overdue = r2(t.d30 + t.d60 + t.d90 + t.d90p);
  return t;
}

export const BUCKETS = ["current", "d30", "d60", "d90", "d90p"] as const;
export type Bucket = (typeof BUCKETS)[number];
/** نسب أعمار الدين لشريط التوزيع (قيم سالبة/صفرية لا تُرسم). */
export function agingShares(t: Pick<PartyTotals, Bucket>): { key: Bucket; value: number; pct: number }[] {
  const pos = BUCKETS.map((k) => ({ key: k, value: Math.max(t[k], 0) }));
  const sum = pos.reduce((s, x) => s + x.value, 0);
  return pos.map((x) => ({ ...x, pct: sum > 0 ? (x.value / sum) * 100 : 0 }));
}

/** كشف الطرف: رصيد جارٍ بالاتجاه الطبيعي للطرف (المستحق موجب). */
export function partyStatement(lines: LedgerLine[], type: string): { rows: (LedgerLine & { running: number })[]; totalDebit: number; totalCredit: number; closing: number } {
  const cust = type === "customer";
  const sorted = lines.filter(isPostedLine).map((l, i) => ({ l, i })).sort((a, b) => (a.l.date || "").localeCompare(b.l.date || "") || (a.l.entry_year ?? 0) - (b.l.entry_year ?? 0) || a.l.entry_no - b.l.entry_no || a.i - b.i);
  let run = 0; let td = 0; let tc = 0;
  const rows = sorted.map(({ l }) => { td += l.debit; tc += l.credit; run = r2(run + (cust ? l.debit - l.credit : l.credit - l.debit)); return { ...l, running: run }; });
  return { rows, totalDebit: r2(td), totalCredit: r2(tc), closing: run };
}
