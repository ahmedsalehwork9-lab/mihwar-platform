// =============================================================
// src/components/landing/subscriptionApi.ts — إرسال طلب اشتراك (للزائر) + قراءة/تحديث (للأدمن).
// الجدول: public.subscription_requests (انظر supabase/migrations/…_subscription_requests.sql).
// =============================================================
import { supabase } from "../../pages/lib/supabase";
import type { SubPayload } from "./subscriptionLogic";

export type SubmitRes = { ok: true; duplicate?: boolean } | { ok: false; error: string; missingTable?: boolean };
export async function submitSubscription(p: SubPayload): Promise<SubmitRes> {
  let { error } = await supabase.from("subscription_requests").insert(p);
  // احتياط: إن لم تكن أعمدة country/city موجودة بعد في الجدول، نعيد الإرسال مع دمج الدولة والمدينة في الملاحظات كي لا يضيع الطلب
  if (error && /country|city|PGRST204|column/i.test((error as { message?: string }).message ?? "")) {
    const { country, city, ...rest } = p;
    const tag = `[${country} / ${city}]`;
    ({ error } = await supabase.from("subscription_requests").insert({ ...rest, notes: rest.notes ? `${tag} ${rest.notes}` : tag }));
  }
  if (!error) return { ok: true };
  const e = error as { code?: string; message?: string };
  if (e.code === "23505") return { ok: true, duplicate: true };
  const missing = e.code === "42P01" || e.code === "PGRST205" || /does not exist|schema cache/i.test(e.message ?? "");
  return { ok: false, error: e.message || "failed", missingTable: missing && /subscription_requests/i.test(e.message ?? "relation subscription_requests") };
}
export type SubStatus = "new" | "contacted" | "converted" | "rejected";
export const STATUSES: SubStatus[] = ["new", "contacted", "converted", "rejected"];
export type SubRequest = { country?: string | null; city?: string | null; id: number; created_at: string; business_name: string; contact_name: string; phone: string; email: string; activity: string; branches_count: number; plan: string; notes: string | null; lang: string | null; status: SubStatus; admin_note: string | null; handled_at: string | null };
export async function fetchRequests(): Promise<{ rows: SubRequest[]; error: string | null }> {
  const { data, error } = await supabase.from("subscription_requests").select("*").order("created_at", { ascending: false }).limit(500);
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
