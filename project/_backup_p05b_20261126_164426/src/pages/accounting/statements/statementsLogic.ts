// =============================================================
// src/pages/accounting/statements/statementsLogic.ts
// منطق القوائم المالية (دوال نقية قابلة للاختبار):
//  • قائمة الدخل (مع مقارنة فترة سابقة، مجمل الربح، الهوامش)
//  • الميزانية العمومية (متداول/غير متداول)
//  • قائمة التدفقات النقدية بالطريقة المباشرة (تشغيل/استثمار/تمويل)
// القيود المرحّلة فقط ما لم يُطلب تضمين المسودات.
// =============================================================
import type { AccType, EntryWithLines, GLAccount } from "../../lib/accountingDb";

const r2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;
const EPS = 0.005;

export type StmtEntry = Pick<EntryWithLines, "id" | "date" | "status"> & { lines: { account_id: number; debit: number; credit: number; branch_id?: number | null }[] };

export const entryCounts = (e: Pick<StmtEntry, "status">, includeDrafts: boolean): boolean => includeDrafts || (e.status ?? "posted") === "posted";

/** الحركة الموقّعة بحسب طبيعة الحساب (أصل/مصروف: مدين−دائن، غير ذلك: دائن−مدين). */
export const signedOf = (type: AccType, debit: number, credit: number): number =>
  type === "asset" || type === "expense" ? (Number(debit) || 0) - (Number(credit) || 0) : (Number(credit) || 0) - (Number(debit) || 0);

/** يجمع حركة كل حساب بين تاريخين (شاملين). from=null يعني من البداية. */
export function sumByAccount(entries: StmtEntry[], accById: Map<number, GLAccount>, from: string | null, to: string, includeDrafts: boolean, branchId: number | null): Map<number, number> {
  const m = new Map<number, number>();
  for (const e of entries) {
    if (!entryCounts(e, includeDrafts)) continue;
    if ((from && e.date < from) || e.date > to) continue;
    for (const l of e.lines || []) {
      if (branchId != null && l.branch_id != null && Number(l.branch_id) !== branchId) continue;
      const a = accById.get(l.account_id); if (!a) continue;
      m.set(a.id, r2((m.get(a.id) || 0) + signedOf(a.type, l.debit, l.credit)));
    }
  }
  return m;
}

// ── التواريخ ──
const addDays = (d: string, k: number): string => new Date(Date.parse(d + "T00:00:00Z") + k * 864e5).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string): number => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 864e5);
/** الفترة السابقة المماثلة في الطول وتنتهي قبل بداية الفترة بيوم. */
export function previousPeriod(from: string, to: string): { from: string; to: string } {
  const len = daysBetween(from, to) + 1;
  const pTo = addDays(from, -1);
  return { from: addDays(pTo, -(len - 1)), to: pTo };
}

// ═══════════ قائمة الدخل ═══════════
export type IncomeLine = { account: GLAccount; value: number; prev: number | null };
export type IncomeSection = { lines: IncomeLine[]; total: number; prevTotal: number | null };
export type Income = {
  revenue: IncomeSection; cogs: IncomeSection; opex: IncomeSection;
  grossProfit: number; net: number; prevGross: number | null; prevNet: number | null;
  grossMargin: number | null; netMargin: number | null;
};

/** تكلفة المبيعات: حسابات المصروفات التي يبدأ كودها بـ 51 (تكلفة المشتريات + مردوداتها). */
export const isCogsAccount = (a: GLAccount): boolean => a.type === "expense" && a.code.startsWith("51");

export function buildIncome(accounts: GLAccount[], cur: Map<number, number>, prev: Map<number, number> | null): Income {
  const leaf = accounts.filter((a) => !a.is_group);
  const pick = (pred: (a: GLAccount) => boolean): IncomeSection => {
    const lines = leaf.filter(pred).map((a) => ({ account: a, value: r2(cur.get(a.id) || 0), prev: prev ? r2(prev.get(a.id) || 0) : null }))
      .filter((l) => Math.abs(l.value) > EPS || (l.prev != null && Math.abs(l.prev) > EPS))
      .sort((x, y) => x.account.code.localeCompare(y.account.code, "en", { numeric: true }));
    return { lines, total: r2(lines.reduce((s, l) => s + l.value, 0)), prevTotal: prev ? r2(lines.reduce((s, l) => s + (l.prev || 0), 0)) : null };
  };
  const revenue = pick((a) => a.type === "revenue");
  const cogs = pick(isCogsAccount);
  const opex = pick((a) => a.type === "expense" && !isCogsAccount(a));
  const grossProfit = r2(revenue.total - cogs.total);
  const net = r2(grossProfit - opex.total);
  const prevGross = prev ? r2((revenue.prevTotal || 0) - (cogs.prevTotal || 0)) : null;
  const prevNet = prev && prevGross != null ? r2(prevGross - (opex.prevTotal || 0)) : null;
  return { revenue, cogs, opex, grossProfit, net, prevGross, prevNet, grossMargin: revenue.total > EPS ? r2((grossProfit / revenue.total) * 100) : null, netMargin: revenue.total > EPS ? r2((net / revenue.total) * 100) : null };
}

/** نسبة التغير مقابل الفترة السابقة؛ null إن لم تكن النسبة معرّفة. */
export function changePct(cur: number, prev: number | null): number | null {
  if (prev == null || Math.abs(prev) < EPS) return null;
  return r2(((cur - prev) / Math.abs(prev)) * 100);
}

// ═══════════ الميزانية ═══════════
export type BalanceLine = { account: GLAccount; value: number };
export type Balance = {
  currentAssets: BalanceLine[]; fixedAssets: BalanceLine[]; currentLiab: BalanceLine[]; longLiab: BalanceLine[]; equity: BalanceLine[];
  retained: number; totCurrentAssets: number; totFixedAssets: number; totAssets: number; totCurrentLiab: number; totLongLiab: number; totLiab: number;
  totEquity: number; totEquityWithRetained: number; right: number; diff: number; balanced: boolean;
};

export function buildBalance(accounts: GLAccount[], toDate: Map<number, number>): Balance {
  const leaf = accounts.filter((a) => !a.is_group);
  const lines = (pred: (a: GLAccount) => boolean): BalanceLine[] => leaf.filter(pred).map((a) => ({ account: a, value: r2(toDate.get(a.id) || 0) }))
    .filter((l) => Math.abs(l.value) > EPS).sort((x, y) => x.account.code.localeCompare(y.account.code, "en", { numeric: true }));
  const sum = (ls: BalanceLine[]): number => r2(ls.reduce((s, l) => s + l.value, 0));
  const fixedAssets = lines((a) => a.type === "asset" && a.code.startsWith("12"));
  const currentAssets = lines((a) => a.type === "asset" && !a.code.startsWith("12"));
  const longLiab = lines((a) => a.type === "liability" && a.code.startsWith("22"));
  const currentLiab = lines((a) => a.type === "liability" && !a.code.startsWith("22"));
  const equity = lines((a) => a.type === "equity");
  let rev = 0; let exp = 0;
  for (const a of leaf) { if (a.type === "revenue") rev += toDate.get(a.id) || 0; else if (a.type === "expense") exp += toDate.get(a.id) || 0; }
  const retained = r2(rev - exp);
  const totAssets = r2(sum(currentAssets) + sum(fixedAssets));
  const totLiab = r2(sum(currentLiab) + sum(longLiab));
  const totEquity = sum(equity);
  const right = r2(totLiab + totEquity + retained);
  const diff = r2(totAssets - right);
  return { currentAssets, fixedAssets, currentLiab, longLiab, equity, retained, totCurrentAssets: sum(currentAssets), totFixedAssets: sum(fixedAssets), totAssets,
    totCurrentLiab: sum(currentLiab), totLongLiab: sum(longLiab), totLiab, totEquity, totEquityWithRetained: r2(totEquity + retained), right, diff, balanced: Math.abs(diff) < 0.5 };
}

// ═══════════ التدفقات النقدية (الطريقة المباشرة) ═══════════
export type CashActivity = "operating" | "investing" | "financing";
export type CashLine = { account: GLAccount; amount: number };
export type CashFlow = {
  opening: number; closing: number; net: number; expectedClosing: number; reconciled: boolean;
  sections: Record<CashActivity, { lines: CashLine[]; total: number }>;
  inflows: number; outflows: number; cashAccountIds: number[];
};

/** نشاط الحساب المقابل: حقوق ملكية/قروض طويلة = تمويل، أصول ثابتة = استثمار، وغير ذلك = تشغيل. */
export function activityOf(a: GLAccount): CashActivity {
  if (a.type === "equity" || (a.type === "liability" && a.code.startsWith("22"))) return "financing";
  if (a.type === "asset" && a.code.startsWith("12")) return "investing";
  return "operating";
}

/** النقدية الافتراضية: حسابات الخزن/البنوك المعرّفة + حسابات 1101x و1102 غير الرئيسية. */
export function detectCashAccounts(accounts: GLAccount[], treasuryAccountIds: number[]): number[] {
  const ids = new Set<number>(treasuryAccountIds.filter((x) => accounts.some((a) => a.id === x && !a.is_group)));
  for (const a of accounts) if (!a.is_group && a.type === "asset" && (a.code.startsWith("1101") || a.code === "1102")) ids.add(a.id);
  return [...ids];
}

/**
 * مبدأ الحساب: لكل قيد يمس حسابًا نقديًا، تأثير كل سطر غير نقدي على النقدية = (دائن − مدين) لذلك السطر.
 * مجموعها = صافي حركة النقدية للقيد، والتحويل بين حسابين نقديين يُلغي نفسه لأنه لا سطر غير نقدي فيه.
 */
export function buildCashFlow(entries: StmtEntry[], accounts: GLAccount[], accById: Map<number, GLAccount>, cashIds: number[], from: string, to: string, includeDrafts: boolean, branchId: number | null): CashFlow {
  const cash = new Set(cashIds);
  let opening = 0; let closing = 0;
  const acc = new Map<number, number>();
  for (const e of entries) {
    if (!entryCounts(e, includeDrafts) || e.date > to) continue;
    const ls = (e.lines || []).filter((l) => branchId == null || l.branch_id == null || Number(l.branch_id) === branchId);
    let touchesCash = false; let net = 0;
    for (const l of ls) if (cash.has(l.account_id)) { touchesCash = true; net += (Number(l.debit) || 0) - (Number(l.credit) || 0); }
    if (!touchesCash) continue;
    closing += net;
    if (e.date < from) { opening += net; continue; }
    for (const l of ls) { if (cash.has(l.account_id) || !accById.has(l.account_id)) continue; acc.set(l.account_id, r2((acc.get(l.account_id) || 0) + (Number(l.credit) || 0) - (Number(l.debit) || 0))); }
  }
  const sections: CashFlow["sections"] = { operating: { lines: [], total: 0 }, investing: { lines: [], total: 0 }, financing: { lines: [], total: 0 } };
  for (const [id, amount] of acc) {
    if (Math.abs(amount) < EPS) continue;
    const a = accById.get(id)!; const s = sections[activityOf(a)];
    s.lines.push({ account: a, amount });
  }
  let inflows = 0; let outflows = 0;
  for (const k of Object.keys(sections) as CashActivity[]) {
    const s = sections[k];
    s.lines.sort((x, y) => x.account.code.localeCompare(y.account.code, "en", { numeric: true }));
    s.total = r2(s.lines.reduce((t, l) => t + l.amount, 0));
    for (const l of s.lines) { if (l.amount > 0) inflows += l.amount; else outflows += -l.amount; }
  }
  opening = r2(opening); closing = r2(closing);
  const net = r2(sections.operating.total + sections.investing.total + sections.financing.total);
  const expectedClosing = r2(opening + net);
  return { opening, closing, net, expectedClosing, reconciled: Math.abs(expectedClosing - closing) < 0.01, sections, inflows: r2(inflows), outflows: r2(outflows), cashAccountIds: [...cash].filter((id) => accounts.some((a) => a.id === id)) };
}

/** مرشّح نصي لصفوف الحسابات (كود/اسم عربي/إنجليزي)، كل الكلمات AND، يعتمد على normalize خارجي. */
export function rowMatches(account: GLAccount, tokens: string[], normalize: (s: string) => string): boolean {
  if (!tokens.length) return true;
  const hay = normalize(`${account.code} ${account.name} ${account.name_en ?? ""}`);
  return tokens.every((t) => hay.includes(t));
}
