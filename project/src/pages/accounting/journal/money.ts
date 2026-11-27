// =============================================================
// src/pages/accounting/journal/money.ts
// حساب مالي بالأعداد الصحيحة (هللات) — لا أخطاء فاصلة عائمة، ويقبل الأرقام العربية/الإنجليزية.
// =============================================================
const AR = "٠١٢٣٤٥٦٧٨٩", FA = "۰۱۲۳۴۵۶۷۸۹";
/** يحوّل الأرقام العربية/الفارسية وفواصلها إلى صيغة إنجليزية قياسية («٣٬٥٠٠٫٥٠» → «3500.50»). */
export function normalizeDigits(s: string): string {
  let out = "";
  for (const ch of String(s ?? "")) {
    const a = AR.indexOf(ch), f = FA.indexOf(ch);
    if (a >= 0) out += String(a); else if (f >= 0) out += String(f);
    else if (ch === "٫" || ch === "،") out += ".";
    else if (ch === "٬" || ch === "," || ch === " " || ch === " ") continue;
    else out += ch;
  }
  return out;
}
/** نص → هللات (عدد صحيح) بتقريب نصف لأعلى عند المنزلة الثالثة؛ غير الصالح = 0. السالب يُرفض (0). */
export function toCents(v: unknown): number {
  const s = normalizeDigits(String(v ?? "")).trim();
  if (!/^\d*\.?\d*$/.test(s) || s === "" || s === ".") return 0;
  const [i, d = ""] = s.split(".");
  const d3 = (d + "000").slice(0, 3);
  let c = parseInt(i || "0", 10) * 100 + parseInt(d3.slice(0, 2), 10);
  if (parseInt(d3[2], 10) >= 5) c += 1;
  return Number.isSafeInteger(c) ? c : 0;
}
export const fromCents = (c: number): number => c / 100;
export const fmtCents = (c: number, locale = "en-US"): string => (c / 100).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** هل النص رقم مالي صالح (حتى منزلتين عشريتين)؟ يُستخدم للتحقق قبل الحفظ. */
export function hasValidScale(v: unknown): boolean {
  const s = normalizeDigits(String(v ?? "")).trim(); if (s === "") return true;
  return /^\d+(\.\d{1,2})?$|^\.\d{1,2}$/.test(s);
}
