// =============================================================
// src/pages/lib/cashAccounts.ts
// قوائم «الخزنة/البنك» لفواتير المشتريات والتحصيل والسداد.
// القاعدة: الحساب التجميعي (is_group) لا يظهر أبدًا، والحساب غير التجميعي النشط يظهر.
// تُدمج الخزن المربوطة بحساب مع حسابات الصندوق/البنك غير التجميعية في الدليل (1101/1102 أو بالاسم)،
// والقيمة دائمًا رقم الحساب في الدليل (وليس رقم صف الخزنة).
// Cash/bank pick-lists: group accounts never appear; active leaf accounts do.
// =============================================================
import type { GLAccount, GLTreasury } from "./accountingDb";

/** backed = الحساب مسجَّل كخزنة/بنك فعلية في «الخزن والبنوك» (بعض الدوال في الخادم تشترطه). rawKind = نوع صف الخزنة الأصلي إن وُجد. */
export type CashOption = { id: number; name: string; kind: "cash" | "bank"; backed: boolean; rawKind?: string };

const BANK_RE = /شبكة|مدى|mada|visa|بنك|bank|card/i;
const CASH_RE = /صندوق|خزنة|خزينة|نقد|cash/i;

export const isBankLike = (name: string): boolean => BANK_RE.test(name);

export function cashBankOptions(accounts: GLAccount[], treasuries: GLTreasury[], want: "all" | "bank" = "all"): CashOption[] {
  const byId = new Map(accounts.map((a) => [a.id, a] as const));
  const out = new Map<number, CashOption>();
  // 1) الخزن المربوطة بحساب غير تجميعي ونشط
  for (const t of treasuries) {
    if (!t.account_id || t.is_active === false) continue;
    const acc = byId.get(t.account_id);
    if (!acc || acc.is_group || acc.is_active === false) continue;
    const kind: "cash" | "bank" = t.kind === "bank" || (t.kind as string) === "pos" || isBankLike(t.name) ? "bank" : "cash";
    if (!out.has(acc.id)) out.set(acc.id, { id: acc.id, name: `${t.name} — ${acc.code} ${acc.name}`, kind, backed: true, rawKind: t.kind });
  }
  // 2) حسابات الصندوق/البنك غير التجميعية في الدليل (حتى لو لم تُنشأ لها خزنة)
  for (const a of accounts) {
    if (a.type !== "asset" || a.is_group || a.is_active === false || out.has(a.id)) continue;
    const bank = a.code.startsWith("1102") || isBankLike(a.name);
    const cash = a.code.startsWith("1101") || CASH_RE.test(a.name);
    if (!bank && !cash) continue;
    out.set(a.id, { id: a.id, name: `${a.code} · ${a.name}`, kind: bank ? "bank" : "cash", backed: false });
  }
  const all = Array.from(out.values());
  const rank = (o: CashOption) => (o.kind === "cash" ? 0 : 1);
  const sorted = all.sort((x, y) => rank(x) - rank(y));
  return want === "bank" ? sorted.filter((o) => o.kind === "bank") : sorted;
}
