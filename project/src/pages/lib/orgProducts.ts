// =============================================================
// src/pages/lib/orgProducts.ts
// نطاق أصناف المؤسسة: بعض الأصناف محفوظة بلا organization_id (مرتبطة بالفرع فقط) فلا تظهر عند التصفية بالمؤسسة وحدها.
// المرشّح يشمل: organization_id = المؤسسة أو shop_id ضمن فروعها. قراءة فقط.
// Org product scope: includes products whose organization_id is null but belong to one of the org's branches.
// =============================================================
import { supabase } from "./supabase";

const cache = new Map<number, string>();
export async function orgProductsFilter(orgId: number): Promise<string> {
  const hit = cache.get(orgId); if (hit) return hit;
  const { data } = await supabase.from("shops").select("id").eq("organization_id", orgId);
  const ids = ((data as { id: number }[] | null) || []).map((s) => s.id).filter((n) => Number.isFinite(n));
  const f = ids.length ? `organization_id.eq.${orgId},shop_id.in.(${ids.join(",")})` : `organization_id.eq.${orgId}`;
  cache.set(orgId, f); return f;
}
