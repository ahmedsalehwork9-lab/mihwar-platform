// =============================================================
// src/pages/accounting/treasury/treasuryDb.ts
// طبقة بيانات صفحة «الخزن والبنوك» — تُعيد استخدام accountingDb (createEntry / reverseEntry …)
// ولا تُعدّل أي جدول. كل القراءات تُرقَّم صفحات (PostgREST يقطع عند 1000 صف افتراضيًا)
// وتعتمد القيود المُرحّلة فقط في الأرصدة.
// Data helpers for the Cash & Banks page. Reuses accountingDb; no schema changes.
// =============================================================

import { supabase } from "../../lib/supabase";
import * as DB from "../../lib/accountingDb";
import type { GLLine } from "../../lib/accountingDb";

/** gl_treasuries row. bank_name / iban / account_number exist only after the PROPOSED migration. */
export type Treasury = DB.GLTreasury & { bank_name?: string | null; iban?: string | null; account_number?: string | null };

export type MoveLine = {
  id: number; entry_id: number; account_id: number; party_id: number | null;
  debit: number; credit: number; branch_id: number | null; note: string | null;
  entry: DB.GLEntry & { notes?: string | null; entry_type?: string; created_at?: string };
};

export type EntryLine = { entry_id: number; account_id: number; debit: number; credit: number; party_id: number | null; note: string | null };

export type Fetched<T> = { rows: T[]; error?: string };

const PAGE = 1000;

async function paged<T>(make: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<Fetched<T>> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await make(from, from + PAGE - 1);
    if (error) return { rows: out, error: error.message };
    const r = (data as T[]) || [];
    out.push(...r);
    if (r.length < PAGE) break;
  }
  return { rows: out };
}

// ── الأرصدة ─────────────────────────────────────────────────
/** key = `${accountId}|${branchId ?? ""}` → net (debit − credit) of POSTED lines. */
export async function fetchNets(orgId: number, accountIds: number[], when: { lte?: string; lt?: string }): Promise<{ nets: Map<string, number>; error?: string }> {
  const nets = new Map<string, number>();
  if (!accountIds.length) return { nets };
  const r = await paged<{ account_id: number; debit: number; credit: number; branch_id: number | null }>((a, b) => {
    let q = supabase.from("gl_journal_lines")
      .select("id, account_id, debit, credit, branch_id, entry:gl_journal_entries!inner(date, status, organization_id)")
      .in("account_id", accountIds)
      .eq("entry.organization_id", orgId)
      .eq("entry.status", "posted");
    if (when.lte) q = q.lte("entry.date", when.lte);
    if (when.lt) q = q.lt("entry.date", when.lt);
    return q.order("id").range(a, b);
  });
  for (const l of r.rows) {
    const k = `${l.account_id}|${l.branch_id ?? ""}`;
    nets.set(k, (nets.get(k) || 0) + (Number(l.debit) || 0) - (Number(l.credit) || 0));
  }
  return { nets, error: r.error };
}

/**
 * Net posted movement that belongs to ONE treasury.
 * A branch cashbox sees only lines carrying its branch (several cashboxes may share GL account 1101);
 * an organisation-level treasury (branch_id = null) sees every line of its account.
 */
export function treasuryMovementNet(t: Treasury, nets: Map<string, number>): number {
  if (!t.account_id) return 0;
  if (t.branch_id != null) return nets.get(`${t.account_id}|${t.branch_id}`) || 0;
  let s = 0;
  nets.forEach((v, k) => { if (k.startsWith(`${t.account_id}|`)) s += v; });
  return s;
}

export const treasuryBalance = (t: Treasury, nets: Map<string, number>) => (Number(t.opening_balance) || 0) + treasuryMovementNet(t, nets);

/** True when two active treasuries read overlapping ledger lines (same account, one of them org-wide or same branch). */
export function overlappingTreasuries(ts: Treasury[]): string[] {
  const names = new Set<string>();
  const byAcc = new Map<number, Treasury[]>();
  ts.filter((t) => t.account_id && t.is_active).forEach((t) => { const a = byAcc.get(t.account_id!) || []; a.push(t); byAcc.set(t.account_id!, a); });
  byAcc.forEach((arr) => {
    if (arr.length < 2) return;
    for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) {
      if (arr[i].branch_id == null || arr[j].branch_id == null || arr[i].branch_id === arr[j].branch_id) { names.add(arr[i].name); names.add(arr[j].name); }
    }
  });
  return Array.from(names);
}

// ── الحركات ────────────────────────────────────────────────
export async function fetchMovements(orgId: number, accountIds: number[], from: string, to: string, status: "posted" | "draft" = "posted"): Promise<Fetched<MoveLine>> {
  if (!accountIds.length) return { rows: [] };
  const r = await paged<MoveLine>((a, b) => supabase.from("gl_journal_lines")
    .select("id, entry_id, account_id, party_id, debit, credit, branch_id, note, entry:gl_journal_entries!inner(*)")
    .in("account_id", accountIds)
    .eq("entry.organization_id", orgId)
    .eq("entry.status", status)
    .gte("entry.date", from).lte("entry.date", to)
    .order("id").range(a, b));
  return { rows: r.rows.map((x) => ({ ...x, debit: Number(x.debit) || 0, credit: Number(x.credit) || 0 })), error: r.error };
}

/** All lines of the given entries (to see the counter-account / detect internal transfers). */
export async function fetchEntryLines(entryIds: number[]): Promise<Fetched<EntryLine>> {
  const ids = Array.from(new Set(entryIds));
  const out: EntryLine[] = [];
  for (let i = 0; i < ids.length; i += 150) {
    const chunk = ids.slice(i, i + 150);
    const r = await paged<EntryLine>((a, b) => supabase.from("gl_journal_lines").select("id, entry_id, account_id, debit, credit, party_id, note").in("entry_id", chunk).order("id").range(a, b));
    if (r.error) return { rows: out, error: r.error };
    out.push(...r.rows.map((x) => ({ ...x, debit: Number(x.debit) || 0, credit: Number(x.credit) || 0 })));
  }
  return { rows: out };
}

export type EntryState = "posted" | "reversed" | "reversal" | "draft";
export function entryState(e: { status?: string; notes?: string | null }): EntryState {
  if ((e.status || "posted") !== "posted") return "draft";
  const n = e.notes || "";
  if (n.includes("[REVERSAL]")) return "reversal";
  if (n.includes("[REVERSED]")) return "reversed";
  return "posted";
}

export const isTransferEntry = (notes?: string | null) => (notes || "").includes("[TRANSFER]");

// ── التحويل بين الخزن/البنوك ─────────────────────────────────
// قيد واحد متوازن: مدين = الوجهة، دائن = المصدر. لا يُحتسب قبضًا/صرفًا خارجيًا.
export async function createTransfer(orgId: number, a: {
  date: string; from: Treasury; to: Treasury; amount: number; description: string | null; reference: string | null;
}): Promise<{ ok: boolean; error?: string; id?: number }> {
  const amt = Math.round((Number(a.amount) || 0) * 100) / 100;
  if (amt <= 0) return { ok: false, error: "AMOUNT" };
  if (!a.from.account_id || !a.to.account_id) return { ok: false, error: "UNLINKED" };
  if (a.from.id === a.to.id) return { ok: false, error: "SAME" };
  if (a.from.account_id === a.to.account_id && (a.from.branch_id ?? null) === (a.to.branch_id ?? null)) return { ok: false, error: "SAME" };
  const lines: GLLine[] = [
    { account_id: a.to.account_id, debit: amt, credit: 0, branch_id: a.to.branch_id ?? null, note: a.to.name },
    { account_id: a.from.account_id, debit: 0, credit: amt, branch_id: a.from.branch_id ?? null, note: a.from.name },
  ];
  const notes = ["[TRANSFER]", a.reference ? `ref: ${a.reference}` : ""].filter(Boolean).join(" ");
  return DB.createEntry(orgId, {
    date: a.date, description: a.description, branch_id: a.from.branch_id ?? null,
    entry_type: "general", notes, status: "posted",
  }, lines);
}

// ── CSV (UTF-8 مع BOM ليفتح العربي صحيحًا في Excel) ────────────
export function downloadCsv(filename: string, rows: (string | number)[][]) {
  const esc = (v: string | number) => { const s = String(v ?? ""); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const blob = new Blob(["\ufeff" + rows.map((r) => r.map(esc).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
