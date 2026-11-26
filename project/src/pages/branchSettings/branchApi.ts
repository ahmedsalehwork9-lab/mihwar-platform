// =============================================================
// src/pages/branchSettings/branchApi.ts
// قراءة/تحديث إعدادات الفروع. لا إنشاء فروع ولا مستخدمين ولا حذف.
// ملاحظة صلاحيات: جدول shops يسمح بالتحديث لمالك الفرع أو مدير النظام فقط (RLS) — نتحقق من عدد الصفوف المتأثرة.
// =============================================================
import { supabase } from "../lib/supabase";
import type { MapOp, MapRow, Shop, Wh } from "./branchLogic";

export type Res = { ok: true } | { ok: false; error: string; denied?: boolean };
const SHOP_COLS = "id, shop_name, phone, whatsapp, city, address, email, website, commercial_registration, google_maps_url, logo_url, is_active, shop_type, activity_type, visibility_mode, default_margin_percent, organization_id";
const fail = (e: { message?: string } | null | undefined, fb: string): Res => ({ ok: false, error: e?.message || fb });
const DENIED = "لا تملك صلاحية التعديل على هذا الفرع (التعديل لمالك الفرع أو مدير النظام فقط).";

export async function fetchShops(orgId: number): Promise<Shop[]> {
  const { data, error } = await supabase.from("shops").select(SHOP_COLS).eq("organization_id", orgId).order("id"); if (error) throw error;
  return ((data as unknown) as Shop[]) || [];
}
export async function fetchItemCounts(shopIds: number[]): Promise<Record<number, number>> {
  const out: Record<number, number> = {};
  await Promise.all(shopIds.map(async (id) => { const { count, error } = await supabase.from("products").select("id", { count: "exact", head: true }).eq("shop_id", id); out[id] = error ? 0 : count ?? 0; }));
  return out;
}
export async function fetchWarehouses(orgId: number): Promise<Wh[]> {
  const { data, error } = await supabase.from("warehouses").select("id, branch_id, name, code, is_default, is_active, inventory_account_id").eq("organization_id", orgId).order("is_default", { ascending: false }).order("id"); if (error) throw error;
  return ((data as unknown) as Wh[]) || [];
}
export async function fetchMap(orgId: number): Promise<MapRow[]> {
  const { data, error } = await supabase.from("gl_account_map").select("branch_id, role, account_id").eq("organization_id", orgId); if (error) throw error;
  return ((data as unknown) as MapRow[]) || [];
}
export async function updateShop(id: number, patch: Record<string, string | number | boolean | null>): Promise<Res> {
  if (!Object.keys(patch).length) return { ok: true };
  const { data, error } = await supabase.from("shops").update(patch).eq("id", id).select("id"); if (error) return fail(error, "update failed");
  return (data as unknown[] | null)?.length ? { ok: true } : { ok: false, error: DENIED, denied: true };
}
export async function updateWarehouse(orgId: number, id: number, patch: Partial<Pick<Wh, "name" | "code" | "is_active" | "is_default" | "inventory_account_id">>): Promise<Res> {
  const { data, error } = await supabase.from("warehouses").update(patch).eq("id", id).eq("organization_id", orgId).select("id"); if (error) return fail(error, "update failed");
  return (data as unknown[] | null)?.length ? { ok: true } : { ok: false, error: DENIED, denied: true };
}
/** يجعل المخزن افتراضيًا: يلغي الافتراضي القديم أولًا ثم يضبط الجديد، ويستعيد القديم إن فشل. */
export async function setDefaultWarehouse(orgId: number, target: number, clear: number[]): Promise<Res> {
  for (const id of clear) { const r = await updateWarehouse(orgId, id, { is_default: false }); if (!r.ok) return r; }
  const r = await updateWarehouse(orgId, target, { is_default: true });
  if (!r.ok) { for (const id of clear) await updateWarehouse(orgId, id, { is_default: true }); return r; }
  return { ok: true };
}
export async function applyMapOps(orgId: number, branchId: number, ops: MapOp[]): Promise<Res> {
  for (const o of ops) {
    if (o.op === "delete") {
      const { error } = await supabase.from("gl_account_map").delete().eq("organization_id", orgId).eq("branch_id", branchId).eq("role", o.role); if (error) return fail(error, "delete failed");
    } else {
      const u = await supabase.from("gl_account_map").update({ account_id: o.account_id }).eq("organization_id", orgId).eq("branch_id", branchId).eq("role", o.role).select("id"); if (u.error) return fail(u.error, "update failed");
      if (!(u.data as unknown[] | null)?.length) { const i = await supabase.from("gl_account_map").insert({ organization_id: orgId, branch_id: branchId, role: o.role, account_id: o.account_id }); if (i.error) return fail(i.error, "insert failed"); }
    }
  }
  return { ok: true };
}
export type BranchUser = { id: string; full_name: string | null; email: string | null; role: string | null; is_active: boolean | null };
/** قراءة فقط: المستخدمون المرتبطون بالفرع (profiles.store_id و user_branches). قد تُظهر الصلاحيات سطرك فقط لغير المدير. */
export async function fetchBranchUsers(branchId: number): Promise<BranchUser[]> {
  const ub = await supabase.from("user_branches").select("user_id").eq("branch_id", branchId);
  const ids = new Set<string>(((ub.data as { user_id: string }[] | null) || []).map((r) => r.user_id));
  const p1 = await supabase.from("profiles").select("id, full_name, email, role, is_active").eq("store_id", branchId);
  const rows = new Map<string, BranchUser>(); for (const r of ((p1.data as unknown) as BranchUser[]) || []) rows.set(r.id, r);
  const missing = [...ids].filter((i) => !rows.has(i));
  if (missing.length) { const p2 = await supabase.from("profiles").select("id, full_name, email, role, is_active").in("id", missing); for (const r of ((p2.data as unknown) as BranchUser[]) || []) rows.set(r.id, r); }
  return [...rows.values()];
}
