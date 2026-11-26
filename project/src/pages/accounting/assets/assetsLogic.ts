// =============================================================
// src/pages/accounting/assets/assetsLogic.ts
// منطق نقي لصفحة الأصول الثابتة: الإهلاك (قسط ثابت بالأشهر المكتملة)، الجدول السنوي،
// البحث/التصفية/الفرز، الملخصات، التجميع بالفئة، ومطابقة السجل مع دفتر الأستاذ.
// calcDep مطابقة لـ DB.depreciation (يثبت ذلك اختبار خصائص).
// =============================================================
import type { GLAccount } from "../../lib/accountingDb";
import { queryTokens, normalizeText } from "../chart/chartLogic";

export type AssetLike = {
  id: number; name: string; category: string | null; acquire_date: string; cost: number; salvage_value: number; useful_life_years: number;
  account_id: number | null; expense_account_id: number | null; accum_account_id: number | null; depr_posted: number; notes: string | null; is_active: boolean; branch_id: number | null;
};
export type Dep = { depreciable: number; annual: number; monthly: number; months: number; accumulated: number; bookValue: number };
export const EPS = 0.005;
export const r2 = (n: number): number => Math.round(n * 100) / 100;

export function calcDep(a: Pick<AssetLike, "cost" | "salvage_value" | "useful_life_years" | "acquire_date">, asOf: string): Dep {
  const cost = Number(a.cost) || 0; const salvage = Number(a.salvage_value) || 0; const life = Number(a.useful_life_years) || 0;
  const depreciable = Math.max(0, cost - salvage);
  const annual = life > 0 ? depreciable / life : 0; const monthly = annual / 12;
  const [ay, am, ad] = (a.acquire_date || "").split("-").map(Number); const [oy, om, od] = (asOf || "").split("-").map(Number);
  let months = 0;
  if (ay && oy) { months = (oy - ay) * 12 + (om - am); if (od < ad) months -= 1; months = Math.max(0, months); }
  const accumulated = Math.min(depreciable, monthly * months);
  return { depreciable, annual, monthly, months, accumulated, bookValue: cost - accumulated };
}

export type AssetState = "future" | "inservice" | "fully";
export type AssetRow = { a: AssetLike; dep: Dep; posted: number; due: number; pct: number; state: AssetState; noAccounts: boolean };

export function buildRow(a: AssetLike, asOf: string): AssetRow {
  const dep = calcDep(a, asOf); const posted = Number(a.depr_posted) || 0;
  const due = Math.max(0, r2(dep.accumulated - posted));
  const pct = dep.depreciable > EPS ? Math.min(100, (dep.accumulated / dep.depreciable) * 100) : (Number(a.cost) > 0 ? 100 : 0);
  const state: AssetState = (a.acquire_date || "") > asOf ? "future" : dep.depreciable > EPS && dep.accumulated >= dep.depreciable - EPS ? "fully" : "inservice";
  return { a, dep, posted, due, pct, state, noAccounts: !a.expense_account_id || !a.accum_account_id };
}
export const buildRows = (assets: AssetLike[], asOf: string): AssetRow[] => assets.map((a) => buildRow(a, asOf));

export type StateFilter = "all" | "inservice" | "fully" | "future" | "due" | "noacct";
export type StatusFilter = "all" | "active" | "inactive";
export type SortKey = "name" | "acquire" | "cost" | "book" | "due" | "pct";
export type AssetFilters = { q: string; category: string; status: StatusFilter; state: StateFilter };
export const DEFAULT_FILTERS: AssetFilters = { q: "", category: "", status: "all", state: "all" };

export function haystack(r: AssetRow, accById: Map<number, Pick<GLAccount, "code" | "name" | "name_en">>): string {
  const parts: string[] = [r.a.name, r.a.category || "", r.a.notes || "", r.a.acquire_date];
  for (const id of [r.a.account_id, r.a.expense_account_id, r.a.accum_account_id]) { const x = id != null ? accById.get(id) : undefined; if (x) parts.push(x.code, x.name, x.name_en || ""); }
  return normalizeText(parts.join(" "));
}
export function filterRows(rows: AssetRow[], f: AssetFilters, accById: Map<number, Pick<GLAccount, "code" | "name" | "name_en">>): AssetRow[] {
  const tokens = queryTokens(f.q);
  return rows.filter((r) => {
    if (f.category && (r.a.category || "") !== f.category) return false;
    if (f.status === "active" && r.a.is_active === false) return false;
    if (f.status === "inactive" && r.a.is_active !== false) return false;
    if (f.state === "due" ? r.due <= EPS : f.state === "noacct" ? !r.noAccounts : f.state !== "all" && r.state !== f.state) return false;
    if (tokens.length) { const h = haystack(r, accById); if (!tokens.every((k) => h.includes(k))) return false; }
    return true;
  });
}
export function sortRows(rows: AssetRow[], key: SortKey, dir: "asc" | "desc"): AssetRow[] {
  const v = (r: AssetRow): number | string => key === "name" ? normalizeText(r.a.name) : key === "acquire" ? r.a.acquire_date : key === "cost" ? Number(r.a.cost) || 0 : key === "book" ? r.dep.bookValue : key === "due" ? r.due : r.pct;
  const m = dir === "asc" ? 1 : -1;
  return [...rows].sort((x, y) => { const a = v(x), b = v(y); const c = typeof a === "string" ? a.localeCompare(b as string, "en", { numeric: true }) : (a as number) - (b as number); return c !== 0 ? c * m : x.a.id - y.a.id; });
}

export type Totals = { count: number; active: number; cost: number; accumulated: number; book: number; posted: number; due: number; annual: number; fully: number; dueCount: number; noAcct: number };
export function totalsOf(rows: AssetRow[]): Totals {
  const t: Totals = { count: rows.length, active: 0, cost: 0, accumulated: 0, book: 0, posted: 0, due: 0, annual: 0, fully: 0, dueCount: 0, noAcct: 0 };
  for (const r of rows) {
    t.cost += Number(r.a.cost) || 0; t.accumulated += r.dep.accumulated; t.book += r.dep.bookValue; t.posted += r.posted; t.due += r.due;
    if (r.a.is_active !== false) { t.active++; if (r.state !== "fully") t.annual += r.dep.annual; }
    if (r.state === "fully") t.fully++; if (r.due > EPS) t.dueCount++; if (r.noAccounts) t.noAcct++;
  }
  return t;
}
export function categoriesOf(assets: AssetLike[]): string[] {
  return [...new Set(assets.map((a) => (a.category || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ar"));
}
export type CatGroup = { category: string; cost: number; accumulated: number; book: number; count: number };
export function byCategory(rows: AssetRow[], noneLabel: string): CatGroup[] {
  const m = new Map<string, CatGroup>();
  for (const r of rows) { const k = (r.a.category || "").trim() || noneLabel; const g = m.get(k) || { category: k, cost: 0, accumulated: 0, book: 0, count: 0 };
    g.cost += Number(r.a.cost) || 0; g.accumulated += r.dep.accumulated; g.book += r.dep.bookValue; g.count++; m.set(k, g); }
  return [...m.values()].sort((a, b) => b.cost - a.cost);
}

/** الجدول السنوي (نهاية كل سنة ميلادية) حتى استهلاك الأساس القابل للإهلاك. */
export type SchedRow = { year: number; months: number; opening: number; expense: number; accumulated: number; book: number; posted: boolean };
export function scheduleFor(a: Pick<AssetLike, "cost" | "salvage_value" | "useful_life_years" | "acquire_date" | "depr_posted">): SchedRow[] {
  const d0 = calcDep(a, a.acquire_date); const ay = Number((a.acquire_date || "").split("-")[0]);
  if (!ay || d0.depreciable <= EPS || d0.annual <= 0) return [];
  const posted = Number(a.depr_posted) || 0; const out: SchedRow[] = []; let prev = 0;
  for (let y = ay; y <= ay + 200; y++) {
    const d = calcDep(a, `${y}-12-31`); const expense = r2(d.accumulated - prev);
    out.push({ year: y, months: d.months, opening: r2(prev), expense, accumulated: r2(d.accumulated), book: r2(d.bookValue), posted: d.accumulated <= posted + EPS });
    prev = d.accumulated; if (d.accumulated >= d.depreciable - EPS) break;
  }
  return out;
}

/** أرصدة دفتر الأستاذ (مدين − دائن) لكل حساب من قيود مرحَّلة (والمسودات اختياريًا). */
export type EntryLite = { status: string; lines: { account_id: number; debit: number; credit: number }[] };
export function glBalances(entries: EntryLite[], includeDraft = false): Map<number, number> {
  const m = new Map<number, number>();
  for (const e of entries) { if (e.status !== "posted" && !(includeDraft && e.status === "draft")) continue;
    for (const l of e.lines || []) m.set(l.account_id, (m.get(l.account_id) || 0) + (Number(l.debit) || 0) - (Number(l.credit) || 0)); }
  return m;
}
export const isAccumAccount = (a: Pick<GLAccount, "code">): boolean => a.code.startsWith("1209");
export const isFixedAssetAccount = (a: Pick<GLAccount, "code" | "type" | "is_group">): boolean => a.type === "asset" && !a.is_group && a.code.startsWith("12") && !a.code.startsWith("1209");

export type Recon = { regCost: number; glCost: number; costDiff: number; regAccum: number; glAccum: number; accumDiff: number; ok: boolean };
/** يقارن سجل الأصول (الفعّالة) بحسابات 12xx (دون 1209) وبمجمع الإهلاك 1209 في الدفتر. */
export function reconcile(assets: AssetLike[], accounts: GLAccount[], bal: Map<number, number>): Recon {
  const regCost = r2(assets.filter((a) => a.is_active !== false).reduce((s, a) => s + (Number(a.cost) || 0), 0));
  const regAccum = r2(assets.filter((a) => a.is_active !== false).reduce((s, a) => s + (Number(a.depr_posted) || 0), 0));
  const glCost = r2(accounts.filter(isFixedAssetAccount).reduce((s, a) => s + (bal.get(a.id) || 0), 0));
  const glAccum = r2(accounts.filter((a) => a.type === "asset" && !a.is_group && isAccumAccount(a)).reduce((s, a) => s - (bal.get(a.id) || 0), 0));
  const costDiff = r2(regCost - glCost); const accumDiff = r2(regAccum - glAccum);
  return { regCost, glCost, costDiff, regAccum, glAccum, accumDiff, ok: Math.abs(costDiff) < 0.01 && Math.abs(accumDiff) < 0.01 };
}

/** حسابات افتراضية مقترحة: مصروف الإهلاك (5211 أو أول حساب إهلاك مصروف) والمجمع (1209*). */
export function suggestDeprAccounts(accounts: GLAccount[]): { exp: number | null; acc: number | null } {
  const post = accounts.filter((a) => !a.is_group);
  const exp = post.find((a) => a.type === "expense" && a.code === "5211") ?? post.find((a) => a.type === "expense" && /إهلاك|depreciation/i.test(`${a.name} ${a.name_en || ""}`)) ?? null;
  const acc = post.find((a) => a.type === "asset" && a.code === "1209") ?? post.find((a) => a.type === "asset" && isAccumAccount(a)) ?? null;
  return { exp: exp?.id ?? null, acc: acc?.id ?? null };
}

/** صفوف الترحيل حتى تاريخ: المستحق غير المُرحَّل للأصول الفعّالة، بالحسابات الخاصة أو الافتراضية. */
export type PostRow = { a: AssetLike; due: number; prior: number; expAcc: number | null; accAcc: number | null };
export function postRowsFor(assets: AssetLike[], date: string, defExp: number | null, defAcc: number | null): PostRow[] {
  return assets.filter((a) => a.is_active !== false).map((a) => {
    const d = calcDep(a, date); const prior = Number(a.depr_posted) || 0;
    return { a, due: r2(d.accumulated - prior), prior, expAcc: a.expense_account_id ?? defExp, accAcc: a.accum_account_id ?? defAcc };
  }).filter((r) => r.due > 0.009);
}
