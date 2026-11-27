// =============================================================
// src/pages/branchSettings/printPrefsApi.ts
// تخزين تفضيلات الطباعة على الخادم (shops.print_prefs jsonb). يرث صلاحيات جدول shops (التعديل لمالك الفرع أو مدير النظام).
// إن لم يكن العمود موجودًا (لم تُطبَّق الـ Migration بعد) تعود الدوال بـ missing ويستمر الحفظ المحلي كما كان.
// =============================================================
import { supabase } from "../lib/supabase";
import { clearRemoteCache, setRemotePrefs, validPrefs, type PrintPrefs } from "./printPrefs";

export type SaveRes = { ok: true } | { ok: false; missing?: boolean; denied?: boolean; error: string };
const isMissingCol = (m?: string): boolean => !!m && /print_prefs/.test(m) && /(column|schema cache|does not exist)/i.test(m);
let loading: Promise<boolean> | null = null;

/** يحمّل تفضيلات كل الفروع المتاحة للمستخدم إلى الذاكرة. يعيد false إن تعذّر (عمود غير موجود/لا اتصال). */
export function prefetchRemotePrefs(force = false): Promise<boolean> {
  if (loading && !force) return loading;
  loading = (async () => {
    try {
      const { data, error } = await supabase.from("shops").select("id, print_prefs").not("print_prefs", "is", null);
      if (error) return false;
      clearRemoteCache();
      for (const r of (data as { id: number; print_prefs: unknown }[] | null) || []) { const p = validPrefs(r.print_prefs); if (p) setRemotePrefs(r.id, p); }
      return true;
    } catch { return false; }
  })();
  return loading;
}

/** يحفظ تفضيلات فرع (null = حذف/افتراضي). يتحقق من عدد الصفوف المتأثرة لكشف رفض الصلاحية. */
export async function saveRemotePrefs(shopId: number, p: PrintPrefs | null): Promise<SaveRes> {
  const { data, error } = await supabase.from("shops").update({ print_prefs: p }).eq("id", shopId).select("id");
  if (error) return { ok: false, missing: isMissingCol(error.message), error: error.message };
  if (!(data as unknown[] | null)?.length) return { ok: false, denied: true, error: "denied" };
  setRemotePrefs(shopId, p); return { ok: true };
}
