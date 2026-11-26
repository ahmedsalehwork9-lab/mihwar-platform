// =============================================================
// src/pages/accounting/treasury/searchUtils.ts
// تطبيع النصوص العربية/الإنجليزية للبحث الذكي (حروف/تشكيل/أرقام/IBAN).
// Text normalisation + ranking used by SmartSelect and the transaction search.
// =============================================================

const DIACRITICS = /[\u064B-\u065F\u0670\u0640]/g; // tashkeel + tatweel

/** Normalise a single character (char-wise so highlight index maps stay valid). */
function normChar(ch: string): string {
  if (DIACRITICS.test(ch)) { DIACRITICS.lastIndex = 0; return ""; }
  DIACRITICS.lastIndex = 0;
  const c = ch.toLowerCase();
  switch (c) {
    case "أ": case "إ": case "آ": case "ٱ": return "ا";
    case "ى": return "ي";
    case "ئ": return "ي";
    case "ؤ": return "و";
    case "ة": return "ه";
    default: break;
  }
  const code = c.charCodeAt(0);
  if (code >= 0x0660 && code <= 0x0669) return String(code - 0x0660);  // Arabic-Indic digits
  if (code >= 0x06f0 && code <= 0x06f9) return String(code - 0x06f0);  // Persian digits
  return c;
}

export function normalize(input: unknown): string {
  const s = String(input ?? "");
  let out = "";
  for (const ch of s) out += normChar(ch);
  return out.replace(/\s+/g, " ").trim();
}

/** Same as normalize but also returns, for each output char, its index in the original string. */
export function normalizeWithMap(input: string): { text: string; map: number[] } {
  let text = ""; const map: number[] = [];
  let i = 0;
  for (const ch of input) {
    const n = normChar(ch);
    for (const nc of n) { text += nc; map.push(i); }
    i += ch.length;
  }
  return { text, map };
}

/** Remove spaces/dashes: lets "SA12 1000 0000" match "SA1210000000". */
export const compact = (s: unknown) => normalize(s).replace(/[\s\-_.]/g, "");

export type Searchable = {
  label: string;                 // primary name
  labelAlt?: string[];           // other-language names / configured aliases
  code?: string;                 // account code / number
  numbers?: string[];            // account no., IBAN …
  other?: string[];              // bank, branch, type …
};

/**
 * Rank an item against a query. Every whitespace-separated token must match somewhere (AND).
 * Returns 0 when it does not match. Higher is better:
 *   exact number/code > exact name > name prefix > code prefix > name contains > other fields.
 */
export function scoreMatch(item: Searchable, query: string): number {
  const q = normalize(query);
  if (!q) return 1;
  const qc = compact(query);
  const label = normalize(item.label);
  const alts = (item.labelAlt || []).map(normalize).filter(Boolean);
  const code = compact(item.code || "");
  const nums = (item.numbers || []).map(compact).filter(Boolean);
  const other = (item.other || []).map(normalize).filter(Boolean);
  const names = [label, ...alts];

  let total = 0;
  const tokens = q.split(" ");
  for (const tk of tokens) {
    const tc = compact(tk);
    let best = 0;
    if (tc && (code === tc || nums.includes(tc))) best = Math.max(best, 100);
    if (names.some((n) => n === tk)) best = Math.max(best, 90);
    if (names.some((n) => n.startsWith(tk))) best = Math.max(best, 70);
    if (tc && code.startsWith(tc)) best = Math.max(best, 60);
    if (names.some((n) => n.split(" ").some((w) => w.startsWith(tk)))) best = Math.max(best, 55);
    if (names.some((n) => n.includes(tk))) best = Math.max(best, 50);
    if (tc && (code.includes(tc) || nums.some((n) => n.includes(tc)))) best = Math.max(best, 40);
    if (other.some((o) => o.includes(tk))) best = Math.max(best, 30);
    if (best === 0) return 0;
    total += best;
  }
  // whole-phrase bonus (e.g. "فرع التقية" appearing contiguously)
  if (names.some((n) => n.includes(q))) total += 20;
  if (qc && (code === qc || nums.includes(qc))) total += 30;
  return total;
}

/** Split `text` into [segment, isMatch] pieces for highlighting query tokens (diacritic-safe). */
export function highlightParts(text: string, query: string): { s: string; hit: boolean }[] {
  const q = normalize(query);
  if (!q || !text) return [{ s: text, hit: false }];
  const { text: nt, map } = normalizeWithMap(text);
  const hits = new Array<boolean>(nt.length).fill(false);
  for (const tk of q.split(" ")) {
    if (!tk) continue;
    let from = 0;
    for (;;) {
      const idx = nt.indexOf(tk, from);
      if (idx < 0) break;
      for (let k = idx; k < idx + tk.length; k++) hits[k] = true;
      from = idx + tk.length;
    }
  }
  if (!hits.some(Boolean)) return [{ s: text, hit: false }];
  const origHit = new Array<boolean>(text.length).fill(false);
  hits.forEach((h, k) => { if (h) origHit[map[k]] = true; });
  const parts: { s: string; hit: boolean }[] = [];
  let cur = ""; let curHit = origHit[0];
  for (let i = 0; i < text.length; i++) {
    if (origHit[i] !== curHit) { parts.push({ s: cur, hit: curHit }); cur = ""; curHit = origHit[i]; }
    cur += text[i];
  }
  if (cur) parts.push({ s: cur, hit: curHit });
  return parts;
}

/** Mask all but the last 4 characters (IBAN / account numbers). */
export function maskTail(v: string | null | undefined, keep = 4): string {
  const s = String(v ?? "").replace(/\s+/g, "");
  if (!s) return "";
  if (s.length <= keep) return s;
  return "•".repeat(Math.max(0, s.length - keep)) + s.slice(-keep);
}
