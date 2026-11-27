// =============================================================
// src/pages/accounting/journal/reviewLogic.ts
// منطق نقي: حالة القيد، مؤشرات الأداء، تقرير المراجعة والرقابة، تجميعات التقارير، الترقيم.
// كل المبالغ بالهللات. يعتمد على بيانات القيود الحقيقية فقط.
// =============================================================
import { toCents } from "./money";

export type JLineRow = { account_id: number; debit: number | string; credit: number | string; branch_id?: number | null; note?: string | null; party_id?: number | null };
export type JEntry = {
  id: number; entry_no: number; entry_year: number; date: string; description: string | null; branch_id: number | null; status: string; entry_type?: string | null; notes?: string | null;
  created_by?: string | null; created_at?: string | null; approval_state?: string | null; approved_by?: string | null; approved_at?: string | null; posted_by?: string | null; posted_at?: string | null;
  reversed_of?: number | null; reversed_by?: number | null; currency_code?: string | null; external_ref?: string | null; project?: string | null; cost_center?: string | null;
  lines: JLineRow[];
};
export type EState = "draft" | "pending" | "approved" | "posted" | "reversed";

export const isReversed = (e: JEntry): boolean => e.reversed_by != null || (e.notes || "").includes("[REVERSED]");
export const isReversal = (e: JEntry): boolean => e.reversed_of != null || (e.notes || "").includes("[REVERSAL]");
export function stateOf(e: JEntry): EState {
  if ((e.status || "posted") === "posted") return isReversed(e) ? "reversed" : "posted";
  if (e.approval_state === "pending") return "pending";
  if (e.approval_state === "approved") return "approved";
  return "draft";
}
export const sumCents = (e: JEntry): { d: number; c: number } => { let d = 0, c = 0; for (const l of e.lines || []) { d += toCents(l.debit); c += toCents(l.credit); } return { d, c }; };

export type Kpis = { total: number; posted: number; draft: number; pending: number; reversed: number; debitC: number; creditC: number };
export function computeKpis(es: JEntry[]): Kpis {
  const k: Kpis = { total: es.length, posted: 0, draft: 0, pending: 0, reversed: 0, debitC: 0, creditC: 0 };
  for (const e of es) {
    const s = stateOf(e); if (s === "posted" || s === "reversed") k.posted++; if (s === "draft" || s === "approved" || s === "pending") k.draft++; if (s === "pending") k.pending++; if (s === "reversed") k.reversed++;
    const { d, c } = sumCents(e); k.debitC += d; k.creditC += c;
  }
  return k;
}

export type StatusFilter = "" | EState | "unposted" | "postedall";
export type EntryFilters = { text: string; type: string; status: StatusFilter; account: string; user: string; amountFromC: number | null; amountToC: number | null; accountText: string };
export const matchStatus = (e: JEntry, f: StatusFilter): boolean => { if (!f) return true; const s = stateOf(e); if (f === "unposted") return s === "draft" || s === "pending" || s === "approved"; if (f === "postedall") return s === "posted" || s === "reversed"; return s === f; };
export function filterEntries(es: JEntry[], f: EntryFilters, accName: (id: number) => string, jv: (e: JEntry) => string): JEntry[] {
  const q = f.text.trim().toLowerCase(), aq = f.accountText.trim().toLowerCase();
  return es.filter((e) => {
    if (f.type && (e.entry_type || "general") !== f.type) return false;
    if (!matchStatus(e, f.status)) return false;
    if (f.account && !(e.lines || []).some((l) => String(l.account_id) === f.account)) return false;
    if (f.user && (e.created_by || "") !== f.user) return false;
    const { d } = sumCents(e);
    if (f.amountFromC != null && d < f.amountFromC) return false;
    if (f.amountToC != null && d > f.amountToC) return false;
    if (aq && !(e.lines || []).some((l) => accName(l.account_id).toLowerCase().includes(aq))) return false;
    if (q) { const hay = `${e.entry_no} ${e.description || ""} ${e.notes || ""} ${e.external_ref || ""} ${jv(e)}`.toLowerCase(); if (!hay.includes(q)) return false; }
    return true;
  });
}

export type FindingCode = "unbalanced" | "incomplete" | "duplicate" | "unposted" | "pending" | "high_amount" | "odd_date" | "no_attachment";
export type Finding = { code: FindingCode; severity: "high" | "medium" | "low"; entryId: number; detail?: string };
export type ReviewOpts = { today: string; highThresholdC?: number | null; attachmentOverC?: number | null; backdateDays?: number; attCount: Record<number, number> };
const SYSTEM_TYPES = new Set(["sales", "purchases", "sales_return", "purchase_return", "adjustment", "opening", "depreciation", "payment", "receipt"]);
const daysBetween = (a: string, b: string): number => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);

/** حد إحصائي متين للمبالغ الشاذة: Q3 + 3×IQR (لا يتأثر بالقيمة الشاذة نفسها). يحتاج 5 قيود على الأقل. */
export function highThreshold(es: JEntry[]): number | null {
  const t = es.map((e) => sumCents(e).d).filter((x) => x > 0).sort((a, b) => a - b); if (t.length < 5) return null;
  const q = (p: number): number => { const i = (t.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return t[lo] + (t[hi] - t[lo]) * (i - lo); };
  const q1 = q(0.25), q3 = q(0.75); return Math.round(q3 + 3 * (q3 - q1));
}
export function reviewEntries(es: JEntry[], o: ReviewOpts): Finding[] {
  const out: Finding[] = []; const explicit = o.highThresholdC != null; const high = o.highThresholdC ?? highThreshold(es); const dupMap = new Map<string, number[]>();
  for (const e of es) {
    const { d, c } = sumCents(e); const live = (e.lines || []).filter((l) => toCents(l.debit) > 0 || toCents(l.credit) > 0);
    if (d !== c) out.push({ code: "unbalanced", severity: "high", entryId: e.id, detail: String(Math.abs(d - c)) });
    if (live.length < 2 || live.some((l) => !l.account_id)) out.push({ code: "incomplete", severity: "high", entryId: e.id });
    const st = stateOf(e);
    if (st === "draft" || st === "approved") out.push({ code: "unposted", severity: "low", entryId: e.id });
    if (st === "pending") out.push({ code: "pending", severity: "medium", entryId: e.id });
    if (high != null && d > 0 && (explicit ? d >= high : d > high)) out.push({ code: "high_amount", severity: "medium", entryId: e.id, detail: String(d) });
    const created = (e.created_at || "").slice(0, 10);
    if (e.date > o.today) out.push({ code: "odd_date", severity: "medium", entryId: e.id, detail: "future" });
    else if (created && daysBetween(e.date, created) > (o.backdateDays ?? 90)) out.push({ code: "odd_date", severity: "low", entryId: e.id, detail: "backdated" });
    if (o.attachmentOverC != null && d >= o.attachmentOverC && !SYSTEM_TYPES.has(e.entry_type || "general") && !(o.attCount[e.id] > 0) && !isReversal(e)) out.push({ code: "no_attachment", severity: "low", entryId: e.id });
    if (!isReversal(e) && !isReversed(e) && d > 0) { const k = `${e.date}|${d}|${(e.description || "").trim().toLowerCase()}`; (dupMap.get(k) ?? dupMap.set(k, []).get(k)!).push(e.id); }
  }
  for (const ids of dupMap.values()) if (ids.length > 1) for (const id of ids) out.push({ code: "duplicate", severity: "medium", entryId: id, detail: ids.filter((x) => x !== id).join(",") });
  const rank = { high: 0, medium: 1, low: 2 } as const; return out.sort((a, b) => rank[a.severity] - rank[b.severity] || a.entryId - b.entryId);
}

export type GroupRow = { key: string; count: number; debitC: number; creditC: number };
export function groupEntries(es: JEntry[], keyOf: (e: JEntry) => string): GroupRow[] {
  const m = new Map<string, GroupRow>();
  for (const e of es) { const k = keyOf(e) || "—"; const g = m.get(k) ?? { key: k, count: 0, debitC: 0, creditC: 0 }; const { d, c } = sumCents(e); g.count++; g.debitC += d; g.creditC += c; m.set(k, g); }
  return [...m.values()].sort((a, b) => b.debitC - a.debitC);
}
export function paginate<T>(rows: T[], page: number, size: number): { slice: T[]; pages: number; page: number } {
  const pages = Math.max(1, Math.ceil(rows.length / size)); const p = Math.min(Math.max(0, page), pages - 1); return { slice: rows.slice(p * size, p * size + size), pages, page: p };
}
export function nextRunDate(d: string, freq: string, n: number): string {
  const dt = new Date(d + "T00:00:00Z"); const day = dt.getUTCDate();
  if (freq === "daily" || freq === "custom") dt.setUTCDate(dt.getUTCDate() + n);
  else if (freq === "weekly") dt.setUTCDate(dt.getUTCDate() + 7 * n);
  else { const months = freq === "yearly" ? 12 * n : n; dt.setUTCDate(1); dt.setUTCMonth(dt.getUTCMonth() + months); const last = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate(); dt.setUTCDate(Math.min(day, last)); }
  return dt.toISOString().slice(0, 10);
}
