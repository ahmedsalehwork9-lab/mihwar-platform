// =============================================================
// src/pages/admin/permApi.ts — قراءة/كتابة بيانات المستخدمين والصلاحيات (للأدمن فقط).
// لا يستخدم Service Role. الكتابة عبر الدالة admin_set_user_access عند توفرها (حماية آخر أدمن + تدقيق)،
// وإلا يُحفظ ما يدعمه الجدول الحالي (الصفحات + الأعلام) ويُبلَّغ المستخدم بأن الإجراءات/التدقيق يتطلبان تطبيق SQL.
// =============================================================
import { supabase } from "../lib/supabase";
import { sanitize, type Access, type Template } from "../lib/permModel";

export type UserRow = {
  id: string; email: string; full_name: string | null; phone: string | null; role: string | null; is_active: boolean; is_admin: boolean; store_id: number | null;
  shop_name: string | null; created_at: string | null; access: Access; branches: number[];
};
export type ShopLite = { id: number; shop_name: string };
export type AuditRow = { id: number; at: string; actor: string | null; target_user: string | null; action: string; before_data: Record<string, unknown> | null; after_data: Record<string, unknown> | null; note: string | null };

const PAGE = 1000;
async function pageAll<T>(build: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < 20000; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1); if (error) throw new Error(error.message);
    out.push(...((data || []) as T[])); if (!data || data.length < PAGE) break;
  }
  return out;
}

export type Loaded = { users: UserRow[]; shops: ShopLite[]; actionsSupported: boolean };
export async function loadUsers(): Promise<Loaded> {
  // نحاول بالعمود الجديد؛ إن لم يوجد بعد نعيد بدونه
  let actionsSupported = true;
  const base = "id, email, full_name, phone, role, is_active, is_admin, store_id, created_at, page_permissions";
  let rows: Record<string, unknown>[];
  try { rows = await pageAll((f, t) => supabase.from("profiles").select(`${base}, action_permissions`).order("created_at", { ascending: false }).order("id").range(f, t)); }
  catch { actionsSupported = false; rows = await pageAll((f, t) => supabase.from("profiles").select(base).order("created_at", { ascending: false }).order("id").range(f, t)); }
  const shops = await pageAll<ShopLite>((f, t) => supabase.from("shops").select("id, shop_name").order("shop_name").order("id").range(f, t));
  let ub: { user_id: string; branch_id: number }[] = [];
  try { ub = await pageAll((f, t) => supabase.from("user_branches").select("user_id, branch_id").order("user_id").order("branch_id").range(f, t)); } catch { ub = []; }
  const nameOf = new Map(shops.map((s) => [s.id, s.shop_name]));
  const byUser = new Map<string, number[]>(); for (const r of ub) byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), Number(r.branch_id)]);
  const users: UserRow[] = rows.map((r) => ({
    id: String(r.id), email: String(r.email ?? ""), full_name: (r.full_name as string) ?? null, phone: (r.phone as string) ?? null, role: (r.role as string) ?? null,
    is_active: r.is_active !== false, is_admin: r.is_admin === true, store_id: r.store_id == null ? null : Number(r.store_id), created_at: (r.created_at as string) ?? null,
    shop_name: r.store_id == null ? null : nameOf.get(Number(r.store_id)) ?? null,
    access: sanitize(r.page_permissions, r.action_permissions), branches: byUser.get(String(r.id)) ?? [],
  }));
  return { users, shops, actionsSupported };
}

export type SaveInput = { userId: string; access: Access; role?: string; isActive?: boolean; isAdmin?: boolean; branches?: number[]; note?: string };
export type SaveResult = { usedRpc: boolean; actionsSaved: boolean };
const rpcMissing = (e: { code?: string; message?: string }): boolean => e.code === "PGRST202" || e.code === "42883" || /could not find the function|does not exist/i.test(e.message || "");

export async function saveAccess(inp: SaveInput): Promise<SaveResult> {
  const pages = inp.access.pages; const actions = inp.access.actions;
  const { error } = await supabase.rpc("admin_set_user_access", {
    p_user: inp.userId, p_pages: pages, p_actions: actions, p_role: inp.role ?? null, p_is_active: inp.isActive ?? null, p_is_admin: inp.isAdmin ?? null,
    p_branches: inp.branches ?? null, p_note: inp.note ?? null,
  });
  if (!error) return { usedRpc: true, actionsSaved: true };
  if (!rpcMissing(error)) throw new Error(error.message);
  // احتياطي قبل تطبيق SQL: الصفحات + الأعلام فقط (لا إجراءات ولا تدقيق)
  const patch: Record<string, unknown> = { page_permissions: pages };
  if (inp.role !== undefined) patch.role = inp.role; if (inp.isActive !== undefined) patch.is_active = inp.isActive; if (inp.isAdmin !== undefined) patch.is_admin = inp.isAdmin;
  const up = await supabase.from("profiles").update(patch).eq("id", inp.userId); if (up.error) throw new Error(up.error.message);
  if (inp.branches) {
    const del = await supabase.from("user_branches").delete().eq("user_id", inp.userId); if (del.error) throw new Error(del.error.message);
    if (inp.branches.length) { const ins = await supabase.from("user_branches").insert(inp.branches.map((b) => ({ user_id: inp.userId, branch_id: b }))); if (ins.error) throw new Error(ins.error.message); }
  }
  return { usedRpc: false, actionsSaved: actions === null };
}

// ── قوالب مخصّصة ──
type TplRow = { id: number; name: string; name_en: string | null; description: string | null; page_permissions: unknown; action_permissions: unknown };
export async function loadTemplates(): Promise<{ templates: Template[]; supported: boolean }> {
  const { data, error } = await supabase.from("permission_templates").select("id, name, name_en, description, page_permissions, action_permissions").order("name");
  if (error) return { templates: [], supported: false };
  return { supported: true, templates: ((data || []) as TplRow[]).map((r) => ({ id: `c${r.id}`, ar: r.name, en: r.name_en || r.name, descAr: r.description || "", descEn: r.description || "", access: sanitize(r.page_permissions, r.action_permissions) })) };
}
export async function saveTemplate(t: { id?: number; name: string; nameEn?: string; description?: string; access: Access }): Promise<void> {
  const row = { name: t.name.trim(), name_en: t.nameEn?.trim() || null, description: t.description?.trim() || null, page_permissions: t.access.pages, action_permissions: t.access.actions, updated_at: new Date().toISOString() };
  const r = t.id ? await supabase.from("permission_templates").update(row).eq("id", t.id) : await supabase.from("permission_templates").insert(row);
  if (r.error) throw new Error(/duplicate|unique/i.test(r.error.message) ? "DUP" : r.error.message);
}
export async function deleteTemplate(id: number): Promise<void> { const r = await supabase.from("permission_templates").delete().eq("id", id); if (r.error) throw new Error(r.error.message); }

export async function loadAudit(limit = 200): Promise<{ rows: AuditRow[]; supported: boolean }> {
  const { data, error } = await supabase.from("permission_audit").select("id, at, actor, target_user, action, before_data, after_data, note").order("at", { ascending: false }).order("id", { ascending: false }).limit(limit);
  if (error) return { rows: [], supported: false };
  return { rows: (data || []) as AuditRow[], supported: true };
}
