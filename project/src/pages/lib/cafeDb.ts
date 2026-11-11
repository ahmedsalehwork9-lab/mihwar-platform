// =============================================================
// src/pages/lib/cafeDb.ts
// طبقة بيانات موحّدة لصفحات المقهى — تقرأ وتكتب من Supabase
// (بدل localStorage) بحيث تتزامن بين كل المتصفحات والأجهزة.
//
// تحافظ على نفس أشكال البيانات المستخدمة في الصفحات (SavedEntry,
// Purchase, …) بتخزينها كاملة في عمود jsonb اسمه data.
//
// تتضمّن ترحيلًا تلقائيًا لمرة واحدة: لو Supabase فاضي للفرع وفيه
// بيانات قديمة في localStorage على هذا الجهاز، تُرفع تلقائيًا.
// =============================================================

import { supabase } from "./supabase";

// مفاتيح localStorage القديمة (للترحيل مرة واحدة)
const SALES_LKEY = "mihwar_sales_reconciliation";
const PURCH_LKEY = "mihwar_purchases";
const CH_LKEY    = "mihwar_sales_channels";      // { [branchId]: { activeIds, customChannels } }
const FE_LKEY    = "mihwar_fixed_expenses";       // { [branchId]: { salaries, items } }
const COMM_LKEY  = "mihwar_app_commissions";      // { [branchId]: {...} } أو {...}

const readLocalArr = (k: string): any[] => { try { return JSON.parse(localStorage.getItem(k) || "[]"); } catch { return []; } };
const readLocalObj = (k: string): any => { try { return JSON.parse(localStorage.getItem(k) || "{}"); } catch { return {}; } };

// ========================= المبيعات =========================
export async function fetchSales(branchId: number | null): Promise<any[]> {
  if (branchId == null) return [];
  const { data, error } = await supabase
    .from("cafe_sales").select("data").eq("branch_id", branchId).order("date", { ascending: true });
  if (error) { console.error("fetchSales", error); return []; }
  return (data || []).map((r: any) => r.data);
}

export async function upsertSale(branchId: number | null, entry: any): Promise<boolean> {
  if (branchId == null) return false;
  const { error } = await supabase.from("cafe_sales").upsert(
    { branch_id: branchId, date: entry.date, data: entry, updated_by: (await supabase.auth.getUser()).data.user?.id, updated_at: new Date().toISOString() },
    { onConflict: "branch_id,date" }
  );
  if (error) { console.error("upsertSale", error); return false; }
  return true;
}

export async function deleteSale(branchId: number | null, date: string): Promise<boolean> {
  if (branchId == null) return false;
  const { error } = await supabase.from("cafe_sales").delete().eq("branch_id", branchId).eq("date", date);
  if (error) { console.error("deleteSale", error); return false; }
  return true;
}

// ترحيل مرة واحدة: لو الجدول فاضي والـ localStorage فيه صفوف لهذا الفرع
export async function fetchSalesWithMigration(branchId: number | null): Promise<any[]> {
  if (branchId == null) return [];
  const existing = await fetchSales(branchId);
  if (existing.length) return existing;
  const mine = readLocalArr(SALES_LKEY).filter((e) => e.branchId === branchId);
  if (!mine.length) return [];
  for (const e of mine) { await upsertSale(branchId, e); }
  return fetchSales(branchId);
}

// ========================= المشتريات =========================
export async function fetchPurchases(branchId: number | null): Promise<any[]> {
  if (branchId == null) return [];
  const { data, error } = await supabase
    .from("cafe_purchases").select("data").eq("branch_id", branchId).order("date", { ascending: true });
  if (error) { console.error("fetchPurchases", error); return []; }
  return (data || []).map((r: any) => r.data);
}

export async function upsertPurchase(branchId: number | null, p: any): Promise<boolean> {
  if (branchId == null) return false;
  const { error } = await supabase.from("cafe_purchases").upsert(
    { id: p.id, branch_id: branchId, date: p.date, invoice_no: p.invoiceNo || null, data: p, updated_by: (await supabase.auth.getUser()).data.user?.id, updated_at: new Date().toISOString() },
    { onConflict: "id" }
  );
  if (error) { console.error("upsertPurchase", error); return false; }
  return true;
}

export async function deletePurchase(id: string): Promise<boolean> {
  const { error } = await supabase.from("cafe_purchases").delete().eq("id", id);
  if (error) { console.error("deletePurchase", error); return false; }
  return true;
}

export async function fetchPurchasesWithMigration(branchId: number | null): Promise<any[]> {
  if (branchId == null) return [];
  const existing = await fetchPurchases(branchId);
  if (existing.length) return existing;
  const mine = readLocalArr(PURCH_LKEY).filter((e) => e.branchId === branchId);
  if (!mine.length) return [];
  for (const p of mine) { await upsertPurchase(branchId, p); }
  return fetchPurchases(branchId);
}

// ========================= الإعدادات =========================
// المفاتيح المستخدمة: "sales_channels" | "fixed_expenses" | "app_commissions"
export async function getSetting(branchId: number | null, key: string): Promise<any | null> {
  if (branchId == null) return null;
  const { data, error } = await supabase
    .from("cafe_settings").select("value").eq("branch_id", branchId).eq("key", key).maybeSingle();
  if (error) { console.error("getSetting", key, error); return null; }
  return data ? (data as any).value : null;
}

export async function setSetting(branchId: number | null, key: string, value: any): Promise<boolean> {
  if (branchId == null) return false;
  const { error } = await supabase.from("cafe_settings").upsert(
    { branch_id: branchId, key, value, updated_by: (await supabase.auth.getUser()).data.user?.id, updated_at: new Date().toISOString() },
    { onConflict: "branch_id,key" }
  );
  if (error) { console.error("setSetting", key, error); return false; }
  return true;
}

// ترحيل إعداد مرة واحدة من كائن localStorage المفهرس بالفرع
export async function getSettingWithMigration(
  branchId: number | null,
  key: string,
  localKey: string,
  fallback: any
): Promise<any> {
  if (branchId == null) return fallback;
  const current = await getSetting(branchId, key);
  if (current != null) return current;
  const localAll = readLocalObj(localKey);
  const localVal = localAll ? localAll[String(branchId)] : null;
  if (localVal != null) { await setSetting(branchId, key, localVal); return localVal; }
  return fallback;
}

// مفاتيح جاهزة للاستخدام من الصفحات
export const SETTING_KEYS = {
  salesChannels: "sales_channels",
  fixedExpenses: "fixed_expenses",
  appCommissions: "app_commissions",
};
export const LOCAL_KEYS = { CH_LKEY, FE_LKEY, COMM_LKEY };
