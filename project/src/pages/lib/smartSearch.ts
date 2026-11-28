// =============================================================
// src/pages/lib/smartSearch.ts
// بحث ذكي موحّد (عربي/إنجليزي): تطبيع الهمزات (أ/إ/آ→ا) والياء (ى→ي) والتاء المربوطة (ة→ه)،
// حذف التشكيل والتطويل، توحيد الأرقام الهندية/الفارسية، والمطابقة بالكلمات بأي ترتيب.
// Shared smart search: Arabic letter/digit normalisation + every-token matching in any order.
// دوال نقية بلا اعتماد على React أو قاعدة البيانات.
// =============================================================
const mapChar = (ch: string): string => {
  const c = ch.charCodeAt(0);
  if ((c >= 0x064b && c <= 0x065f) || c === 0x0670 || c === 0x0640) return ""; // تشكيل/تطويل
  if (ch === "أ" || ch === "إ" || ch === "آ" || ch === "ٱ") return "ا";
  if (ch === "ى" || ch === "ئ") return "ي";
  if (ch === "ة") return "ه";
  if (ch === "ؤ") return "و";
  if (c >= 0x0660 && c <= 0x0669) return String(c - 0x0660);
  if (c >= 0x06f0 && c <= 0x06f9) return String(c - 0x06f0);
  return ch.toLowerCase();
};

/** يطبّع نصًا للمقارنة (null/undefined تصبح نصًا فارغًا). */
export function normalizeText(input: unknown): string {
  const s = String(input ?? "");
  let out = "";
  for (let i = 0; i < s.length; i++) out += mapChar(s[i]);
  return out;
}

/** كلمات البحث بعد التطبيع. */
export const searchTokens = (q: unknown): string[] => normalizeText(q).split(/\s+/).filter(Boolean);

/** صحيح إذا وُجدت كل كلمات البحث (بأي ترتيب) داخل أحد الحقول. بحث فارغ = مطابقة. */
export function smartMatch(query: unknown, ...fields: unknown[]): boolean {
  const tokens = searchTokens(query);
  if (!tokens.length) return true;
  const hay = normalizeText(fields.map((f) => String(f ?? "")).join(" "));
  return tokens.every((tk) => hay.includes(tk));
}
