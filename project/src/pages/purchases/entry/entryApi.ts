// =============================================================
// src/pages/purchases/entry/entryApi.ts
// قراءة فقط: بحث أصناف الفرع من الخادم (لا يتقيّد بحد 1000 صف) + فحص تكرار رقم فاتورة المورد.
// =============================================================
import { supabase } from "../../lib/supabase";
import type { DupInv, PickedProduct } from "./entryLogic";

const COLS = "id, product_code, product_name, barcode, price, quantity";
const clean = (s: string): string => s.replace(/[%,()*\\]/g, " ").trim();
type Row = { id: number; product_code: string | null; product_name: string | null; barcode: string | null; price: number | null; quantity: number | null };
const map = (r: Row): PickedProduct & { barcode: string | null } => ({ id: Number(r.id), product_code: r.product_code ?? null, product_name: r.product_name || "—", price: Number(r.price) || 0, quantity: Number(r.quantity) || 0, barcode: r.barcode ?? null });

export async function searchProducts(shopId: number, query: string, limit = 15): Promise<(PickedProduct & { barcode: string | null })[]> {
  const q = clean(query);
  let b = supabase.from("products").select(COLS).eq("shop_id", shopId);
  if (q) b = b.or(`product_name.ilike.%${q}%,product_code.ilike.%${q}%,barcode.ilike.%${q}%,brand.ilike.%${q}%`);
  const { data, error } = await b.order("product_name", { ascending: true }).limit(limit);
  if (error) { console.error("searchProducts", error); return []; }
  return ((data as Row[]) || []).map(map);
}

/** مطابقة تامة لباركود أو كود صنف (للمسح السريع). */
export async function findByCode(shopId: number, code: string): Promise<(PickedProduct & { barcode: string | null }) | null> {
  const c = clean(code); if (!c) return null;
  const { data, error } = await supabase.from("products").select(COLS).eq("shop_id", shopId).or(`barcode.eq.${c},product_code.eq.${c}`).limit(1);
  if (error) { console.error("findByCode", error); return null; }
  const r = ((data as Row[]) || [])[0]; return r ? map(r) : null;
}

export async function findSupplierInvoiceNo(orgId: number, no: string): Promise<DupInv[]> {
  const n = no.trim(); if (!n) return [];
  const { data, error } = await supabase.from("gl_purchase_invoices").select("id, invoice_no, invoice_year, supplier_invoice_no, supplier_name, date, status")
    .eq("organization_id", orgId).ilike("supplier_invoice_no", n.replace(/[%_]/g, (m) => `\\${m}`)).limit(20);
  if (error) { console.error("findSupplierInvoiceNo", error); return []; }
  return ((data as (DupInv & { status: string })[]) || []).filter((x) => !["cancelled", "void", "voided", "deleted"].includes((x.status || "").toLowerCase()));
}
