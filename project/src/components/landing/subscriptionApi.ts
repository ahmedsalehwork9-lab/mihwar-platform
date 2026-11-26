// =============================================================
// src/components/landing/subscriptionApi.ts — إرسال طلب اشتراك (للزائر) + قراءة/تحديث (للأدمن).
// الجدول: public.subscription_requests (انظر supabase/migrations/…_subscription_requests.sql).
// =============================================================
import { supabase } from "../../pages/lib/supabase";
import type { SubPayload } from "./subscriptionLogic";

export type SubmitRes = { ok: true; duplicate?: boolean } | { ok: false; error: string; missingTable?: boolean };
export async function submitSubscription(p: SubPayload): Promise<SubmitRes> {
  const { error } = await supabase.from("subscription_requests").insert(p);
  if (!error) return { ok: true };
  const e = error as { code?: string; message?: string };
  if (e.code === "23505") return { ok: true, duplicate: true };
  const missing = e.code === "42P01" || e.code === "PGRST205" || /does not exist|schema cache/i.test(e.message ?? "");
  return { ok: false, error: e.message || "failed", missingTable: missing };
}

export type SubStatus = "new" | "contacted" | "converted" | "rejected";
export const STATUSES: SubStatus[] = ["new", "contacted", "converted", "rejected"];
export type SubRequest = { id: number; created_at: string; business_name: string; contact_name: string; phone: string; email: string; activity: string; branches_count: number; plan: string; notes: string | null; lang: string | null; status: SubStatus; admin_note: string | null; handled_at: string | null };
const COLS = "id, created_at, business_name, contact_name, phone, email, activity, branches_count, plan, notes, lang, status, admin_note, handled_at";
export async function fetchRequests(): Promise<{ rows: SubRequest[]; error: string | null }> {
  const { data, error } = await supabase.from("subscription_requests").select(COLS).order("created_at", { ascending: false }).limit(500);
  return { rows: (data ?? []) as SubRequest[], error: error ? error.message : null };
}
export async function countNew(): Promise<number> {
  const { count, error } = await supabase.from("subscription_requests").select("id", { count: "exact", head: true }).eq("status", "new");
  return error ? 0 : count ?? 0;
}
export async function updateRequest(id: number, patch: { status?: SubStatus; admin_note?: string | null }): Promise<{ ok: boolean; error?: string }> {
  const body: Record<string, unknown> = { ...patch }; if (patch.status && patch.status !== "new") body.handled_at = new Date().toISOString();
  const { data, error } = await supabase.from("subscription_requests").update(body).eq("id", id).select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "لا تملك صلاحية التعديل أو الطلب غير موجود." };
  return { ok: true };
}
