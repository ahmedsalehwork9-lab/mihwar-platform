// =============================================================
// src/pages/accounting/journal/journalApi.ts
// طبقة وصول مركز القيود. تعيد استخدام accountingDb، وتستعمل دوال الخادم (RPC) فقط إذا كانت
// الـ Migration مطبّقة (كشف تلقائي)؛ وإلا تعود للمسار الحالي دون كسر أي وظيفة.
// لا مفاتيح خدمة في الواجهة. كل الصلاحيات النهائية تُفرض في الخادم (RLS + دوال SECURITY DEFINER).
// =============================================================
import { supabase } from "../../lib/supabase";
import * as DB from "../../lib/accountingDb";
import type { GLLine } from "../../lib/accountingDb";

export type Caps = { applied: boolean; settings: boolean; audit: boolean; templates: boolean; recurring: boolean };
export const NO_CAPS: Caps = { applied: false, settings: false, audit: false, templates: false, recurring: false };
const ok = async (table: string, cols = "*"): Promise<boolean> => { try { const { error } = await supabase.from(table).select(cols).limit(1); return !error; } catch { return false; } };
export async function probeCaps(): Promise<Caps> {
  const [settings, audit, templates, recurring, cols] = await Promise.all([ok("gl_journal_settings"), ok("gl_journal_audit"), ok("gl_journal_templates"), ok("gl_journal_recurring"), ok("gl_journal_entries", "id,approval_state,posted_at,reversed_by")]);
  return { applied: audit && cols && settings, settings, audit, templates, recurring };
}

export type Res<T = unknown> = { ok: boolean; error?: string; data?: T };
const humanize = (m: string, ar: boolean): string => {
  const map: [RegExp, string, string][] = [
    [/not balanced/i, "القيد غير متوازن: مجموع المدين لا يساوي مجموع الدائن", "Entry is not balanced: total debit differs from total credit"],
    [/two valid lines/i, "القيد يحتاج سطرين صالحين على الأقل", "An entry needs at least two valid lines"],
    [/parent group|inactive|another organization|missing/i, "حساب غير صالح للترحيل (أب/موقوف/من مؤسسة أخرى)", "An account is not postable (parent, inactive or from another organization)"],
    [/already posted/i, "القيد مُرحّل مسبقًا", "The entry is already posted"],
    [/already reversed/i, "القيد معكوس مسبقًا", "The entry is already reversed"],
    [/reversal entry cannot be reversed/i, "لا يمكن عكس قيد عكسي", "A reversal entry cannot be reversed"],
    [/reason is required/i, "سبب العكس مطلوب", "A reversal reason is required"],
    [/period is closed/i, "الفترة المحاسبية مغلقة لهذا التاريخ", "The accounting period is closed for this date"],
    [/approval is required/i, "الاعتماد مطلوب قبل الترحيل", "Approval is required before posting"],
    [/creator cannot approve/i, "لا يمكن لمنشئ القيد اعتماده", "The creator cannot approve their own entry"],
    [/not awaiting approval/i, "القيد ليس بانتظار الاعتماد", "The entry is not awaiting approval"],
    [/only drafts/i, "التعديل للمسودات فقط؛ صحّح المرحّل بقيد عكسي", "Only drafts can be edited; correct posted entries with a reversal"],
    [/cannot be deleted/i, "لا يمكن حذف قيد مُرحّل", "Posted entries cannot be deleted"],
    [/branch not permitted|access denied|not authenticated/i, "غير مصرّح لك بهذه العملية", "You are not permitted to do this"],
    [/decimals|negative|both debit/i, "مبلغ غير صالح (سالب/أكثر من منزلتين/مدين ودائن معًا)", "Invalid amount (negative, more than 2 decimals, or debit and credit together)"],
  ];
  for (const [re, a, e] of map) if (re.test(m)) return ar ? a : e;
  return m;
};
const fail = <T = unknown,>(e: { message: string } | string | null | undefined, ar: boolean): Res<T> => ({ ok: false, error: humanize(typeof e === "string" ? e : e?.message || "error", ar) });

export type HeaderX = DB.EntryHeader & { currency_code?: string; fx_rate?: number; external_ref?: string | null; project?: string | null; cost_center?: string | null };
const hdrJson = (h: HeaderX) => ({ date: h.date, description: h.description, branch_id: h.branch_id, entry_type: h.entry_type, notes: h.notes, currency_code: h.currency_code, fx_rate: h.fx_rate, external_ref: h.external_ref, project: h.project, cost_center: h.cost_center });
const linesJson = (ls: GLLine[]) => ls.filter((l) => l.account_id && (Number(l.debit) || Number(l.credit))).map((l) => ({ account_id: l.account_id, debit: Number(l.debit) || 0, credit: Number(l.credit) || 0, branch_id: l.branch_id ?? null, note: l.note ?? null, party_id: l.party_id ?? null }));

/** حفظ قيد (جديد/تعديل مسودة). status = draft | posted. يعيد معرّف القيد. */
export async function saveEntry(caps: Caps, orgId: number, editingId: number | null, header: HeaderX, lines: GLLine[], status: "draft" | "posted", ar = true): Promise<Res<number>> {
  if (!caps.applied) {
    const h = { ...header, status };
    const r = editingId != null ? await DB.updateEntry(editingId, h, lines) : await DB.createEntry(orgId, h, lines);
    return r.ok ? { ok: true, data: editingId ?? (r as { id?: number }).id } : { ok: false, error: r.error };
  }
  if (editingId == null) { const { data, error } = await supabase.rpc("gl_journal_create", { p_org: orgId, p_header: hdrJson(header), p_lines: linesJson(lines), p_post: status === "posted" }); return error ? fail(error, ar) : { ok: true, data: Number(data) }; }
  const u = await supabase.rpc("gl_journal_update_draft", { p_id: editingId, p_header: hdrJson(header), p_lines: linesJson(lines) }); if (u.error) return fail(u.error, ar);
  if (status === "posted") { const p = await supabase.rpc("gl_journal_post", { p_id: editingId }); if (p.error) return fail(p.error, ar); }
  return { ok: true, data: editingId };
}
export async function postEntry(caps: Caps, id: number, ar = true): Promise<Res> {
  if (!caps.applied) { const r = await DB.setEntryStatus(id, "posted"); return { ok: r.ok, error: r.error }; }
  const { error } = await supabase.rpc("gl_journal_post", { p_id: id }); return error ? fail(error, ar) : { ok: true };
}
export async function reverseEntryX(caps: Caps, id: number, date: string, reason: string, ar = true): Promise<Res<number>> {
  if (!caps.applied) { const r = await DB.reverseEntry(id, { date }); return r.ok ? { ok: true, data: r.id } : { ok: false, error: r.error }; }
  const { data, error } = await supabase.rpc("gl_journal_reverse", { p_id: id, p_date: date, p_reason: reason }); return error ? fail(error, ar) : { ok: true, data: Number(data) };
}
export async function deleteDraft(caps: Caps, id: number, ar = true): Promise<Res> {
  if (!caps.applied) { const r = await DB.deleteEntry(id); return { ok: r.ok, error: r.error }; }
  const { error } = await supabase.rpc("gl_journal_delete_draft", { p_id: id }); return error ? fail(error, ar) : { ok: true };
}
export async function requestApproval(id: number, ar = true): Promise<Res> { const { error } = await supabase.rpc("gl_journal_request_approval", { p_id: id }); return error ? fail(error, ar) : { ok: true }; }
export async function approveEntry(id: number, ar = true): Promise<Res> { const { error } = await supabase.rpc("gl_journal_approve", { p_id: id }); return error ? fail(error, ar) : { ok: true }; }

// ── المستخدمون (أسماء المنشئ/المعتمد) ──
export async function fetchUserNames(ids: string[]): Promise<Record<string, string>> {
  const u = [...new Set(ids.filter(Boolean))]; if (!u.length) return {};
  const { data } = await supabase.from("profiles").select("id, full_name, email").in("id", u);
  const out: Record<string, string> = {}; for (const r of (data as { id: string; full_name: string | null; email: string | null }[]) || []) out[r.id] = r.full_name || r.email || r.id.slice(0, 8);
  return out;
}
// ── سجل التدقيق ──
export type AuditRow = { id: number; entry_id: number | null; action: string; actor: string | null; at: string; before_data: unknown; after_data: unknown; reason: string | null };
export async function fetchAudit(orgId: number, entryId: number | null, limit = 200): Promise<AuditRow[]> {
  let q = supabase.from("gl_journal_audit").select("*").eq("organization_id", orgId).order("at", { ascending: false }).limit(limit); if (entryId != null) q = q.eq("entry_id", entryId);
  const { data } = await q; return (data as AuditRow[]) || [];
}
// ── الإعدادات ──
export type JSettings = { organization_id: number; require_approval: boolean; lock_through: string | null; attachment_required_over: number | null; high_amount_threshold: number | null };
export async function getSettings(orgId: number): Promise<JSettings | null> { const { data } = await supabase.from("gl_journal_settings").select("*").eq("organization_id", orgId).maybeSingle(); return (data as JSettings) || null; }
export async function saveSettings(s: JSettings): Promise<Res> { const { error } = await supabase.from("gl_journal_settings").upsert({ ...s, updated_at: new Date().toISOString() }); return { ok: !error, error: error?.message }; }
// ── القوالب ──
export type TplLine = { account_id: number; side: "debit" | "credit"; amount?: number | null; note?: string | null };
export type Template = { id?: number; organization_id: number; name: string; name_en?: string | null; entry_type: string; description?: string | null; lines: TplLine[]; keep_amounts: boolean; is_active: boolean };
export async function listTemplates(orgId: number): Promise<Template[]> { const { data } = await supabase.from("gl_journal_templates").select("*").eq("organization_id", orgId).order("name"); return (data as Template[]) || []; }
export async function saveTemplate(t: Template): Promise<Res> { const row = { ...t, updated_at: new Date().toISOString() }; const { error } = t.id ? await supabase.from("gl_journal_templates").update(row).eq("id", t.id) : await supabase.from("gl_journal_templates").insert(row); return { ok: !error, error: error?.message }; }
export async function deleteTemplate(id: number): Promise<Res> { const { error } = await supabase.from("gl_journal_templates").delete().eq("id", id); return { ok: !error, error: error?.message }; }
// ── القيود المتكررة ──
export type RecLine = { account_id: number; debit: number; credit: number; note?: string | null };
export type Recurring = { id?: number; organization_id: number; name: string; description?: string | null; entry_type: string; branch_id: number | null; lines: RecLine[]; frequency: "daily" | "weekly" | "monthly" | "yearly" | "custom"; interval_n: number; start_date: string; end_date: string | null; next_run: string; last_run?: string | null; is_active: boolean };
export async function listRecurring(orgId: number): Promise<Recurring[]> { const { data } = await supabase.from("gl_journal_recurring").select("*").eq("organization_id", orgId).order("next_run"); return (data as Recurring[]) || []; }
export async function saveRecurring(r: Recurring): Promise<Res> { const { id, last_run, ...row } = r; void last_run; const { error } = id ? await supabase.from("gl_journal_recurring").update(row).eq("id", id) : await supabase.from("gl_journal_recurring").insert(row); return { ok: !error, error: error?.message }; }
export async function deleteRecurring(id: number): Promise<Res> { const { error } = await supabase.from("gl_journal_recurring").delete().eq("id", id); return { ok: !error, error: error?.message }; }
export async function generateRecurring(orgId: number, until: string, ar = true): Promise<Res<number>> { const { data, error } = await supabase.rpc("gl_generate_recurring", { p_org: orgId, p_until: until }); return error ? fail(error, ar) : { ok: true, data: Number(data) }; }

/** جلب القيود بصفحات 500 (بدل جلب غير محدود) مع سقف 5000 وعلامة truncated. */
export async function fetchEntriesPaged(orgId: number, from: string, to: string, branchId: number | null, cap = 5000): Promise<{ rows: DB.EntryWithLines[]; truncated: boolean; error: string | null }> {
  const PAGE = 500; const rows: DB.EntryWithLines[] = [];
  for (let a = 0; a < cap; a += PAGE) {
    let q = supabase.from("gl_journal_entries").select("*, lines:gl_journal_lines(*)").eq("organization_id", orgId).gte("date", from).lte("date", to).order("date", { ascending: false }).order("entry_no", { ascending: false }).range(a, a + PAGE - 1);
    if (branchId != null) q = q.eq("branch_id", branchId);
    const { data, error } = await q; if (error) return { rows, truncated: false, error: error.message };
    const b = (data as DB.EntryWithLines[]) || []; rows.push(...b); if (b.length < PAGE) return { rows, truncated: false, error: null };
  }
  return { rows, truncated: true, error: null };
}
