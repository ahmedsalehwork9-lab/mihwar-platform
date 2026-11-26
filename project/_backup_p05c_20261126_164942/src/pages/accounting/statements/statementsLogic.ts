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

export type StmtEntry = Pick<EntryWithLines, "id" | "date" | "status"> & {
  entry_no?: number; entry_year?: number | null; entry_type?: string | null; description?: string | null;
  lines: { account_id: number; debit: number; credit: number; branch_id?: number | null; note?: string | null }[];
};

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

// ═══════════ مستويات العرض (شجرة الحسابات) ═══════════
export type TreeRow = { account: GLAccount; depth: number; indent: number; value: number; prev: number | null; isGroup: boolean; expandable: boolean; leafIds: number[] };

/** عمق الحساب في الدليل (الجذر = 1). */
export function depthOf(a: GLAccount, byId: Map<number, GLAccount>): number {
  let d = 1; let cur: GLAccount | undefined = a; const seen = new Set<number>();
  while (cur && cur.parent_id != null && !seen.has(cur.id)) { seen.add(cur.id); cur = byId.get(cur.parent_id); if (cur) d++; }
  return d;
}
export function maxDepth(accounts: GLAccount[]): number {
  const by = new Map(accounts.map((a) => [a.id, a])); let m = 1;
  for (const a of accounts) if (!a.is_group) m = Math.max(m, depthOf(a, by));
  return m;
}

export type TreeOpts = { pred: (a: GLAccount) => boolean; minDepth: number; level: number | null; collapsed: Set<number>; showZero?: boolean };
/**
 * يبني صفوف الشجرة من القيم على الحسابات الورقية. المجموعات تُجمَّع من أبنائها (المطابقين لـ pred فقط).
 * minDepth: المجموعات الأقل عمقًا تُخفى (عناوين الأقسام تغني عنها)، والأوراق تظهر دائمًا.
 * level: أقصى عمق معروض؛ الأعمق يُجمَّع في أقرب مجموعة ظاهرة. null = تفصيلي.
 */
export function buildTreeRows(accounts: GLAccount[], cur: (id: number) => number, prev: ((id: number) => number) | null, o: TreeOpts): { rows: TreeRow[]; total: number; prevTotal: number | null } {
  const by = new Map(accounts.map((a) => [a.id, a]));
  const depth = new Map<number, number>(); for (const a of accounts) depth.set(a.id, depthOf(a, by));
  const leaves = accounts.filter((a) => !a.is_group && o.pred(a)).map((a) => ({ a, v: r2(cur(a.id)), p: prev ? r2(prev(a.id)) : null }))
    .filter((l) => o.showZero || Math.abs(l.v) > EPS || (l.p != null && Math.abs(l.p) > EPS));
  const total = r2(leaves.reduce((s, l) => s + l.v, 0));
  const prevTotal = prev ? r2(leaves.reduce((s, l) => s + (l.p || 0), 0)) : null;
  const val = new Map<number, { v: number; p: number; leaves: number[] }>();
  const kids = new Map<number | null, Set<number>>();
  const addKid = (pid: number | null, id: number) => { if (!kids.has(pid)) kids.set(pid, new Set()); kids.get(pid)!.add(id); };
  for (const l of leaves) {
    let n: GLAccount | undefined = l.a; const seen = new Set<number>();
    while (n && !seen.has(n.id)) {
      seen.add(n.id);
      const e = val.get(n.id) || { v: 0, p: 0, leaves: [] }; e.v += l.v; e.p += l.p || 0; e.leaves.push(l.a.id); val.set(n.id, e);
      const pn: GLAccount | undefined = n.parent_id != null ? by.get(n.parent_id) : undefined; addKid(pn ? pn.id : null, n.id); n = pn;
    }
  }
  const lvl = o.level == null ? Infinity : Math.max(o.level, o.minDepth);
  const isVisible = (a: GLAccount): boolean => { const d = depth.get(a.id)!; return (!a.is_group || d >= o.minDepth) && d <= lvl; };
  const byCode = (x: number, y: number) => by.get(x)!.code.localeCompare(by.get(y)!.code, "en", { numeric: true });
  const out: TreeRow[] = [];
  const walk = (id: number, hiddenByCollapse: boolean) => {
    const a = by.get(id)!; const vis = isVisible(a); const ch = [...(kids.get(id) || [])].sort(byCode);
    const visibleKids = ch.some((c) => anyVisible(c));
    if (vis && !hiddenByCollapse) { const e = val.get(id)!; out.push({ account: a, depth: depth.get(id)!, indent: 0, value: r2(e.v), prev: prev ? r2(e.p) : null, isGroup: ch.length > 0, expandable: visibleKids, leafIds: e.leaves }); }
    const stop = hiddenByCollapse || (vis && o.collapsed.has(id));
    for (const c of ch) walk(c, stop);
  };
  const anyVisible = (id: number): boolean => { const a = by.get(id)!; if (isVisible(a)) return true; for (const c of kids.get(id) || []) if (anyVisible(c)) return true; return false; };
  for (const r of [...(kids.get(null) || [])].sort(byCode)) walk(r, false);
  const base = out.reduce((m, r) => Math.min(m, r.depth), Infinity);
  for (const r of out) r.indent = Number.isFinite(base) ? Math.max(0, r.depth - base) : 0;
  return { rows: out, total, prevTotal };
}

/** صفوف الشجرة المطابقة للبحث (الكود/الاسم) مع إلغاء أثر الطي. */
export function filterTreeRows(rows: TreeRow[], tokens: string[], normalize: (s: string) => string): TreeRow[] {
  if (!tokens.length) return rows;
  return rows.filter((r) => rowMatches(r.account, tokens, normalize));
}

// ═══════════ حركة الحساب (التفاصيل من الذاكرة) ═══════════
export type DrillRow = { accountId: number; date: string; entryNo: number | null; entryYear: number | null; type: string | null; description: string; note: string | null; debit: number; credit: number; running: number; status: string };
export type DrillOpts = { from: string | null; to: string; includeDrafts: boolean; branchId: number | null; onlyCashEntries?: Set<number> | null };
/**
 * حركات مجموعة حسابات. onlyCashEntries: عند تحديدها تُحصر الحركات في القيود التي تمس النقدية
 * وتُعرض بأثرها النقدي (دائن − مدين). الرصيد الجاري بطبيعة الحساب (أو الأثر النقدي).
 */
export function accountMovements(entries: StmtEntry[], ids: Set<number>, accById: Map<number, GLAccount>, o: DrillOpts): { rows: DrillRow[]; totalDebit: number; totalCredit: number; net: number } {
  const raw: { e: StmtEntry; debit: number; credit: number; type: AccType; i: number; accountId: number }[] = []; let i = 0;
  for (const e of entries) {
    if (!entryCounts(e, o.includeDrafts)) continue;
    if ((o.from && e.date < o.from) || e.date > o.to) continue;
    if (o.onlyCashEntries && !o.onlyCashEntries.has(e.id)) continue;
    for (const l of e.lines || []) {
      if (!ids.has(l.account_id)) continue;
      if (o.branchId != null && l.branch_id != null && Number(l.branch_id) !== o.branchId) continue;
      const a = accById.get(l.account_id); if (!a) continue;
      raw.push({ e, debit: Number(l.debit) || 0, credit: Number(l.credit) || 0, type: a.type, i: i++, accountId: a.id });
    }
  }
  raw.sort((a, b) => a.e.date.localeCompare(b.e.date) || (a.e.entry_year ?? 0) - (b.e.entry_year ?? 0) || (a.e.entry_no ?? 0) - (b.e.entry_no ?? 0) || a.i - b.i);
  let run = 0; let td = 0; let tc = 0;
  const rows = raw.map((x) => {
    td += x.debit; tc += x.credit;
    run = r2(run + (o.onlyCashEntries ? x.credit - x.debit : signedOf(x.type, x.debit, x.credit)));
    return { accountId: x.accountId, date: x.e.date, entryNo: x.e.entry_no ?? null, entryYear: x.e.entry_year ?? null, type: x.e.entry_type ?? null, description: x.e.description || "", note: null, debit: x.debit, credit: x.credit, running: run, status: x.e.status };
  });
  return { rows, totalDebit: r2(td), totalCredit: r2(tc), net: run };
}
/** معرّفات القيود التي تمس حسابًا نقديًا. */
export function cashEntryIds(entries: StmtEntry[], cashIds: number[], includeDrafts: boolean): Set<number> {
  const c = new Set(cashIds); const out = new Set<number>();
  for (const e of entries) if (entryCounts(e, includeDrafts) && (e.lines || []).some((l) => c.has(l.account_id))) out.add(e.id);
  return out;
}

// ═══════════ التدفقات النقدية — الطريقة غير المباشرة ═══════════
export type IndirectFlow = {
  netIncome: number; depreciation: number;
  workingCapital: { account: GLAccount; amount: number }[];
  investing: { account: GLAccount; amount: number }[]; financing: { account: GLAccount; amount: number }[];
  operatingTotal: number; investingTotal: number; financingTotal: number; net: number; opening: number; closing: number; reconciled: boolean;
};
const isContraDep = (a: GLAccount): boolean => a.type === "asset" && a.code.startsWith("1209");
/**
 * المتطابقة المحاسبية: Δالنقدية = صافي الدخل + Δالخصوم + Δحقوق الملكية − Δالأصول غير النقدية.
 * التشغيل = صافي الدخل + الإهلاك (−Δ مجمع الإهلاك) + (−Δ أصول متداولة غير نقدية) + Δ خصوم متداولة.
 * الاستثمار = −Δ الأصول غير المتداولة (بدون مجمع الإهلاك). التمويل = Δ خصوم طويلة + Δ حقوق الملكية.
 */
export function buildIndirectFlow(accounts: GLAccount[], beforeFrom: Map<number, number>, toDate: Map<number, number>, period: Map<number, number>, cashIds: number[]): IndirectFlow {
  const cash = new Set(cashIds); const leaf = accounts.filter((a) => !a.is_group);
  const delta = (a: GLAccount): number => r2((toDate.get(a.id) || 0) - (beforeFrom.get(a.id) || 0));
  let rev = 0; let exp = 0;
  for (const a of leaf) { if (a.type === "revenue") rev += period.get(a.id) || 0; else if (a.type === "expense") exp += period.get(a.id) || 0; }
  const netIncome = r2(rev - exp);
  const depreciation = r2(-leaf.filter(isContraDep).reduce((s, a) => s + delta(a), 0));
  const mk = (pred: (a: GLAccount) => boolean, sign: 1 | -1) => leaf.filter((a) => pred(a) && !cash.has(a.id)).map((a) => ({ account: a, amount: r2(sign * delta(a)) })).filter((x) => Math.abs(x.amount) > EPS).sort((x, y) => x.account.code.localeCompare(y.account.code, "en", { numeric: true }));
  const wcAssets = mk((a) => a.type === "asset" && !a.code.startsWith("12"), -1);
  const wcLiab = mk((a) => a.type === "liability" && !a.code.startsWith("22"), 1);
  const workingCapital = [...wcAssets, ...wcLiab];
  const investing = mk((a) => a.type === "asset" && a.code.startsWith("12") && !isContraDep(a), -1);
  const financing = [...mk((a) => a.type === "liability" && a.code.startsWith("22"), 1), ...mk((a) => a.type === "equity", 1)];
  const sum = (ls: { amount: number }[]) => r2(ls.reduce((s, l) => s + l.amount, 0));
  const operatingTotal = r2(netIncome + depreciation + sum(workingCapital));
  const investingTotal = sum(investing); const financingTotal = sum(financing);
  const net = r2(operatingTotal + investingTotal + financingTotal);
  const bal = (m: Map<number, number>) => r2(leaf.filter((a) => cash.has(a.id)).reduce((s, a) => s + (m.get(a.id) || 0), 0));
  const opening = bal(beforeFrom); const closing = bal(toDate);
  return { netIncome, depreciation, workingCapital, investing, financing, operatingTotal, investingTotal, financingTotal, net, opening, closing, reconciled: Math.abs(opening + net - closing) < 0.01 };
}
