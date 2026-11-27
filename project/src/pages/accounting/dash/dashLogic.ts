// =============================================================
// src/pages/accounting/dash/dashLogic.ts
// منطق لوحة تحكم الحسابات (دوال نقية قابلة للاختبار). كل الأرقام من قيود الدفتر المرحّلة بنفس منطق القوائم المالية
// (sumByAccount / buildIncome) فتتطابق مع ميزان المراجعة والقوائم. لا بيانات وهمية.
// =============================================================
import type { GLAccount, GLParty, GLTreasury } from "../../lib/accountingDb";
import { buildIncome, previousPeriod, sumByAccount, type Income, type StmtEntry } from "../statements/statementsLogic";
import { buildRows, totalsOf as assetTotals, glBalances, reconcile, type AssetLike, type Totals as AssetTotals, type Recon } from "../assets/assetsLogic";
import { holderAccountOf } from "../parties/partiesLogic";
import { stateOf, type JEntry } from "../journal/reviewLogic";
import { toCents } from "../journal/money";

const r2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;
export type PeriodKey = "month" | "quarter" | "year" | "last_year" | "custom";

/** نطاق التواريخ للفترة المختارة (بالتوقيت المحلي المُمرَّر today). */
export function periodRange(key: PeriodKey, today: string, custom?: { from: string; to: string }): { from: string; to: string } {
  const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7));
  const iso = (yy: number, mm: number, dd: number): string => new Date(Date.UTC(yy, mm - 1, dd)).toISOString().slice(0, 10);
  if (key === "custom" && custom?.from && custom?.to && custom.from <= custom.to) return custom;
  if (key === "month") return { from: iso(y, m, 1), to: today };
  if (key === "quarter") { const q0 = Math.floor((m - 1) / 3) * 3 + 1; return { from: iso(y, q0, 1), to: today }; }
  if (key === "last_year") return { from: iso(y - 1, 1, 1), to: iso(y - 1, 12, 31) };
  return { from: iso(y, 1, 1), to: today };
}

export function descendantLeafIds(accounts: GLAccount[], rootId: number): number[] {
  const kids = new Map<number, GLAccount[]>(); for (const a of accounts) if (a.parent_id != null) { const l = kids.get(a.parent_id) || []; l.push(a); kids.set(a.parent_id, l); }
  const out: number[] = []; const seen = new Set<number>(); const walk = (id: number): void => { if (seen.has(id)) return; seen.add(id); const a = accounts.find((x) => x.id === id); if (a && !a.is_group) out.push(id); for (const k of kids.get(id) || []) walk(k.id); };
  walk(rootId); return out;
}

export type AlertCode = "pending" | "drafts" | "unbalanced" | "neg_cash" | "dep_due" | "assets_recon" | "future_dated" | "truncated";
export type DashAlert = { code: AlertCode; severity: "high" | "medium" | "low"; count: number; target: "journal" | "treasury" | "assets" | "statements"; detail?: string };
export type PartyBal = { id: number; name: string; accountId: number; balance: number };
export type TreasuryBal = { id: number; name: string; kind: string; balance: number; accountId: number };
export type MonthPoint = { month: number; revenue: number; expense: number };
export type RecentEntry = { id: number; entry_year: number; entry_no: number; date: string; description: string | null; entry_type: string | null; debitC: number; state: string };
export type DashData = {
  period: { from: string; to: string }; prevPeriod: { from: string; to: string };
  income: Income; liquidity: { total: number; byKind: Record<string, number>; treasuries: TreasuryBal[] };
  receivables: { total: number; holders: number; top: PartyBal[] }; payables: { total: number; holders: number; top: PartyBal[] };
  assets: AssetTotals | null; recon: Recon | null;
  journal: { draft: number; pending: number; approved: number; posted: number; reversed: number; unbalancedPosted: number; periodCount: number };
  monthly: MonthPoint[]; expenseTop: { label: string; value: number }[]; byType: { type: string; count: number; debitC: number }[]; recent: RecentEntry[];
  alerts: DashAlert[];
};
export type DashInput = { entries: JEntry[]; accounts: GLAccount[]; parties: GLParty[]; treasuries: GLTreasury[]; assets: AssetLike[]; from: string; to: string; branchId: number | null; truncated?: boolean; today: string; accName?: (a: GLAccount) => string };

const isPosted = (e: { status?: string | null }): boolean => (e.status ?? "posted") === "posted";
const inBranch = (e: JEntry, b: number | null): boolean => b == null || e.branch_id == null || Number(e.branch_id) === b;

export function computeDash(inp: DashInput): DashData {
  const { accounts, parties, treasuries, from, to, branchId } = inp;
  const accById = new Map(accounts.map((a) => [a.id, a] as const));
  const entries = inp.entries.filter((e) => inBranch(e, branchId));
  const stmt = entries as unknown as StmtEntry[];
  const prevP = previousPeriod(from, to);
  const cur = sumByAccount(stmt, accById, from, to, false, branchId), prev = sumByAccount(stmt, accById, prevP.from, prevP.to, false, branchId);
  const income = buildIncome(accounts, cur, prev);
  const bal = sumByAccount(stmt, accById, null, to, false, branchId);
  const balOf = (rootId: number): number => r2(descendantLeafIds(accounts, rootId).reduce((s, id) => s + (bal.get(id) || 0), 0));

  // السيولة (الخزن/البنوك/نقاط البيع)
  const tb: TreasuryBal[] = treasuries.filter((t) => t.is_active !== false && t.account_id != null && (branchId == null || t.branch_id == null || t.branch_id === branchId)).map((t) => ({ id: t.id, name: t.name, kind: t.kind || "cash", accountId: t.account_id as number, balance: balOf(t.account_id as number) }));
  const byKind: Record<string, number> = {}; for (const t of tb) byKind[t.kind] = r2((byKind[t.kind] || 0) + t.balance);
  const liquidity = { total: r2(tb.reduce((s, t) => s + t.balance, 0)), byKind, treasuries: tb.sort((a, b) => b.balance - a.balance) };

  // الذمم: حساب الطرف (الرئيسي) — العملاء أصل (مدين+)، الموردون التزام (دائن+)
  const holders = (pred: (p: GLParty) => boolean): PartyBal[] => {
    const seen = new Set<number>(); const out: PartyBal[] = [];
    for (const p of parties) { if (!pred(p) || p.parent_id) continue; const acc = holderAccountOf(p, parties); if (!acc || seen.has(acc)) continue; seen.add(acc); out.push({ id: p.id, name: p.name, accountId: acc, balance: balOf(acc) }); }
    return out;
  };
  const cust = holders((p) => p.type === "customer"), supp = holders((p) => String(p.type || "").startsWith("supplier"));
  const top = (a: PartyBal[]): PartyBal[] => [...a].filter((x) => Math.abs(x.balance) > 0.004).sort((x, y) => y.balance - x.balance).slice(0, 5);
  const receivables = { total: r2(cust.reduce((s, x) => s + x.balance, 0)), holders: cust.length, top: top(cust) };
  const payables = { total: r2(supp.reduce((s, x) => s + x.balance, 0)), holders: supp.length, top: top(supp) };

  // الأصول الثابتة
  const rows = inp.assets.length ? buildRows(inp.assets, to) : [];
  const assets = inp.assets.length ? assetTotals(rows) : null;
  const recon = inp.assets.length ? reconcile(inp.assets, accounts, glBalances(entries as unknown as { status: string; lines: { account_id: number; debit: number; credit: number }[] }[])) : null;

  // صحة القيود
  const j = { draft: 0, pending: 0, approved: 0, posted: 0, reversed: 0, unbalancedPosted: 0, periodCount: 0 };
  const typeAgg = new Map<string, { count: number; debitC: number }>(); let futureDated = 0;
  for (const e of entries) {
    const s = stateOf(e); j[s]++;
    let d = 0, c = 0; for (const l of e.lines || []) { d += toCents(l.debit); c += toCents(l.credit); }
    if (isPosted(e) && d !== c) j.unbalancedPosted++;
    if (isPosted(e) && e.date > inp.today) futureDated++;
    if (isPosted(e) && e.date >= from && e.date <= to) { j.periodCount++; const k = e.entry_type || "general"; const a = typeAgg.get(k) || { count: 0, debitC: 0 }; a.count++; a.debitC += d; typeAgg.set(k, a); }
  }
  const byType = [...typeAgg.entries()].map(([type, v]) => ({ type, ...v })).sort((a, b) => b.debitC - a.debitC);

  // الأشهر (لسنة تاريخ النهاية)
  const year = to.slice(0, 4); const months: MonthPoint[] = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, revenue: 0, expense: 0 }));
  for (const e of entries) { if (!isPosted(e) || e.date.slice(0, 4) !== year) continue; const mi = Number(e.date.slice(5, 7)) - 1;
    for (const l of e.lines || []) { if (branchId != null && l.branch_id != null && Number(l.branch_id) !== branchId) continue; const a = accById.get(l.account_id); if (!a) continue;
      if (a.type === "revenue") months[mi].revenue = r2(months[mi].revenue + (Number(l.credit) || 0) - (Number(l.debit) || 0)); else if (a.type === "expense") months[mi].expense = r2(months[mi].expense + (Number(l.debit) || 0) - (Number(l.credit) || 0)); } }
  const nameOf = inp.accName || ((a: GLAccount) => a.name);
  const expenseTop = [...income.cogs.lines, ...income.opex.lines].filter((l) => l.value > 0.004).sort((a, b) => b.value - a.value).slice(0, 6).map((l) => ({ label: nameOf(l.account), value: l.value }));

  const recent: RecentEntry[] = [...entries].sort((a, b) => b.date.localeCompare(a.date) || (b.entry_year * 1e6 + b.entry_no) - (a.entry_year * 1e6 + a.entry_no)).slice(0, 8)
    .map((e) => { let d = 0; for (const l of e.lines || []) d += toCents(l.debit); return { id: e.id, entry_year: e.entry_year, entry_no: e.entry_no, date: e.date, description: e.description, entry_type: e.entry_type ?? null, debitC: d, state: stateOf(e) }; });

  // التنبيهات
  const alerts: DashAlert[] = [];
  if (j.unbalancedPosted > 0) alerts.push({ code: "unbalanced", severity: "high", count: j.unbalancedPosted, target: "journal" });
  const neg = tb.filter((t) => t.balance < -0.004); if (neg.length) alerts.push({ code: "neg_cash", severity: "high", count: neg.length, target: "treasury", detail: neg.map((t) => t.name).join("، ") });
  if (recon && !recon.ok) alerts.push({ code: "assets_recon", severity: "medium", count: 1, target: "assets" });
  if (j.pending > 0) alerts.push({ code: "pending", severity: "medium", count: j.pending, target: "journal" });
  if (assets && assets.dueCount > 0) alerts.push({ code: "dep_due", severity: "medium", count: assets.dueCount, target: "assets" });
  if (futureDated > 0) alerts.push({ code: "future_dated", severity: "low", count: futureDated, target: "journal" });
  if (j.draft + j.approved > 0) alerts.push({ code: "drafts", severity: "low", count: j.draft + j.approved, target: "journal" });
  if (inp.truncated) alerts.push({ code: "truncated", severity: "medium", count: 1, target: "statements" });
  const rank = { high: 0, medium: 1, low: 2 } as const; alerts.sort((a, b) => rank[a.severity] - rank[b.severity]);

  return { period: { from, to }, prevPeriod: prevP, income, liquidity, receivables, payables, assets, recon, journal: j, monthly: months, expenseTop, byType, recent, alerts };
}
