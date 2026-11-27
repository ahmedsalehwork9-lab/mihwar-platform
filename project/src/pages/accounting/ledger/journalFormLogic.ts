// =============================================================
// src/pages/accounting/ledger/journalFormLogic.ts
// منطق نقي لنموذج إدخال القيد (بدون React/DB) — قابل للاختبار.
// كل الحسابات بالهللات (أعداد صحيحة) لتفادي أخطاء الفاصلة العائمة.
// هذه الطبقة للواجهة فقط؛ التحقق النهائي يكون في الخادم (RPC) عند تفعيله.
// =============================================================
import { toCents, fromCents, hasValidScale } from "../journal/money";

export type JLine = { account_id: number | ""; debit: string; credit: string; branch_id: number | ""; note: string; party_id: number | null };

export const n2 = (v: unknown): number => fromCents(toCents(v));
export const r2 = (x: number): number => Math.round(x * 100) / 100;

export type JTotals = { debit: number; credit: number; diff: number; balanced: boolean };
export function totals(lines: JLine[]): JTotals {
  let d = 0, c = 0; for (const l of lines) { d += toCents(l.debit); c += toCents(l.credit); }
  return { debit: fromCents(d), credit: fromCents(c), diff: fromCents(d - c), balanced: d === c && d > 0 };
}

export type JIssueCode = "need_lines" | "no_account" | "both_sides" | "unbalanced" | "no_amount" | "bad_amount" | "parent_account";
export type JIssue = { line: number | null; code: JIssueCode };
/** كل ما يمنع الترحيل. isPostable اختياري: يمنع الحسابات الأب (is_group). */
export function validate(lines: JLine[], isPostable?: (id: number) => boolean): JIssue[] {
  const out: JIssue[] = []; let used = 0;
  lines.forEach((l, i) => {
    const d = toCents(l.debit), c = toCents(l.credit);
    if (!hasValidScale(l.debit) || !hasValidScale(l.credit)) out.push({ line: i + 1, code: "bad_amount" });
    if (d > 0 && c > 0) out.push({ line: i + 1, code: "both_sides" });
    if ((d > 0 || c > 0) && !l.account_id) out.push({ line: i + 1, code: "no_account" });
    if (l.account_id && isPostable && !isPostable(Number(l.account_id))) out.push({ line: i + 1, code: "parent_account" });
    if (l.account_id && d === 0 && c === 0) out.push({ line: i + 1, code: "no_amount" });
    if (l.account_id && (d > 0 || c > 0)) used++;
  });
  if (used < 2) out.push({ line: null, code: "need_lines" });
  if (!totals(lines).balanced) out.push({ line: null, code: "unbalanced" });
  return out;
}

/** ملء الفرق في السطر i في الجهة المعاكسة (أو null إن كان متوازنًا). */
export function balancePatch(lines: JLine[], i: number): { debit: string; credit: string } | null {
  let d = 0, c = 0; lines.forEach((l, k) => { if (k !== i) { d += toCents(l.debit); c += toCents(l.credit); } });
  const diff = d - c; if (diff === 0) return null;
  return diff > 0 ? { debit: "", credit: fromCents(diff).toFixed(2).replace(/\.00$/, "") } : { debit: fromCents(-diff).toFixed(2).replace(/\.00$/, ""), credit: "" };
}
export function duplicateLine(lines: JLine[], i: number): JLine[] { const copy = { ...lines[i], debit: "", credit: "" }; return [...lines.slice(0, i + 1), copy, ...lines.slice(i + 1)]; }
export function moveLine(lines: JLine[], i: number, dir: -1 | 1): JLine[] {
  const j = i + dir; if (j < 0 || j >= lines.length) return lines; const a = [...lines]; [a[i], a[j]] = [a[j], a[i]]; return a;
}
export function shiftDate(iso: string, days: number): string { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
