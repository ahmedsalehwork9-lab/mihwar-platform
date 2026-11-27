// =============================================================
// src/pages/lib/accountRoles.ts
// الربط التلقائي لأدوار الحسابات (إيراد المبيعات، ضريبة المخرجات، المخزون، تكلفة المبيعات) من شجرة الحسابات.
// - عند إنشاء الشجرة القياسية: يُنفَّذ تلقائيًا (autoLinkOrg) ولا يستبدل أي ربط موجود.
// - عند شجرة يدوية: زر «اقتراح الربط» في إعدادات الفرع يملأ الاختيارات للمراجعة والحفظ (suggestRoleAccounts).
// Auto-link of account roles from the chart; never overwrites existing mappings.
// =============================================================
import { supabase } from "./supabase";
import type { GLAccount } from "./accountingDb";

export type RoleKey = "revenue" | "output_vat" | "inventory" | "cogs";
export const AUTO_ROLES: RoleKey[] = ["revenue", "output_vat", "inventory", "cogs"];

const norm = (s: string): string => String(s || "").toLowerCase().replace(/[ً-ٰٟـ]/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه");
const leaf = (a: GLAccount): boolean => !a.is_group && a.is_active !== false;

/** اقتراح حساب لكل دور: بالكود القياسي أولًا ثم بالاسم. لا يقترح حسابًا تجميعيًا أو موقوفًا. */
export function suggestRoleAccounts(accounts: GLAccount[]): Partial<Record<RoleKey, number>> {
  const pick = (type: string, codes: string[], nameRe: RegExp, excl?: RegExp): number | undefined => {
    const pool = accounts.filter((a) => a.type === type && leaf(a));
    for (const c of codes) { const hit = pool.find((a) => a.code === c); if (hit) return hit.id; }
    return pool.find((a) => nameRe.test(norm(a.name)) && !(excl && excl.test(norm(a.name))))?.id;
  };
  const out: Partial<Record<RoleKey, number>> = {};
  const rev = pick("revenue", ["4101"], /مبيعات|ايراد.*نشاط/, /مردود|مرتجع|خصم/); if (rev) out.revenue = rev;
  const vat = pick("liability", ["2103"], /ضريبه.*(مخرجات|مستحقه|مضافه)|vat.*output|output.*vat/, /مدخلات/); if (vat) out.output_vat = vat;
  const inv = pick("asset", ["1104"], /^مخزون|المخزون|بضاعه/, /ضريبه/); if (inv) out.inventory = inv;
  const cogs = pick("expense", ["5101"], /تكلفه.*(مبيعات|بضاعه|مشتريات)|cost.*(sales|goods)/, /مردود/); if (cogs) out.cogs = cogs;
  return out;
}

/** يربط على مستوى المؤسسة الأدوار الناقصة فقط، ويضبط حساب المخزون للمستودعات التي بلا حساب. يعيد عدد ما رُبط أو خطأً. */
export async function autoLinkOrg(orgId: number, accounts: GLAccount[]): Promise<{ ok: boolean; linked: number; error?: string }> {
  const sug = suggestRoleAccounts(accounts);
  let linked = 0;
  const { data, error } = await supabase.from("gl_account_map").select("branch_id, role").eq("organization_id", orgId);
  if (error) return { ok: false, linked: 0, error: error.message };
  const have = new Set(((data as { branch_id: number | null; role: string }[] | null) || []).filter((r) => r.branch_id == null).map((r) => r.role));
  for (const role of AUTO_ROLES) {
    const acc = sug[role]; if (!acc || have.has(role)) continue;
    const ins = await supabase.from("gl_account_map").insert({ organization_id: orgId, branch_id: null, role, account_id: acc });
    if (ins.error) return { ok: false, linked, error: ins.error.message };
    linked++;
  }
  if (sug.inventory) {
    const up = await supabase.from("warehouses").update({ inventory_account_id: sug.inventory }).eq("organization_id", orgId).is("inventory_account_id", null).select("id");
    if (up.error) return { ok: false, linked, error: up.error.message };
    linked += (up.data as unknown[] | null)?.length ?? 0;
  }
  return { ok: true, linked };
}
