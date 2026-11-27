// =============================================================
// src/pages/sales/salesInvoiceApi.ts
// طبقة بيانات شاشة فاتورة المبيعات. القراءات من الجداول الحالية فقط،
// والترحيل عبر RPC واحدة ذرّية post_sales_invoice (ملف P01 المقترح).
// لا تحديث لـ products.quantity من الواجهة إطلاقًا.
// =============================================================
import { supabase } from "../lib/supabase";
import * as DB from "../lib/accountingDb";
import type { GLParty, GLSalesInvoice } from "../lib/accountingDb";
import type { SaleType, Tender } from "./salesInvoiceCalc";
import { normalizeSearch } from "./salesInvoiceCalc";

export type SaleProduct = {
  id: number; product_code: string | null; product_name: string; brand: string | null; model: string | null;
  barcode: string | null; cost: number; selling_price: number | null; quantity: number;
  unit: string | null; warehouse_id: number | null; image: string | null;
};

type ProductRow = {
  id: number | string; product_code: string | null; product_name: string; brand: string | null; model: string | null;
  barcode: string | null; price: number | string | null; selling_price: number | string | null; quantity: number | string | null;
  attributes: Record<string, unknown> | null; warehouse_id: number | string | null; product_image_url: string | null;
};

const PRODUCT_COLS = "id, product_code, product_name, brand, model, barcode, price, selling_price, quantity, attributes, warehouse_id, product_image_url";

function mapProduct(r: ProductRow): SaleProduct {
  const unitRaw = r.attributes && typeof r.attributes === "object" ? (r.attributes as Record<string, unknown>)["unit"] : null;
  return {
    id: Number(r.id), product_code: r.product_code, product_name: r.product_name, brand: r.brand, model: r.model,
    barcode: r.barcode, cost: Number(r.price) || 0,
    selling_price: r.selling_price != null ? Number(r.selling_price) : null,
    quantity: Number(r.quantity) || 0,
    unit: typeof unitRaw === "string" && unitRaw.trim() ? unitRaw.trim() : null,
    warehouse_id: r.warehouse_id != null ? Number(r.warehouse_id) : null,
    image: r.product_image_url,
  };
}

// يحمي قيمة البحث داخل مرشح PostgREST or() (الفواصل والأقواس والنسبة)
function escapeOr(q: string): string {
  return q.replace(/[,()%*\\"]/g, " ").replace(/\s+/g, " ").trim();
}

// المنتج بلا مستودع يتبع المستودع الافتراضي للفرع (نفس قاعدة دالة الترحيل).
function scopeWarehouse<T extends { eq: (c: string, v: number) => T; or: (f: string) => T }>(req: T, warehouseId: number | null, isDefaultWh: boolean): T {
  if (warehouseId == null) return req;
  return isDefaultWh ? req.or(`warehouse_id.is.null,warehouse_id.eq.${warehouseId}`) : req.eq("warehouse_id", warehouseId);
}

/** بحث جزئي بالكود/الاسم (عربي/إنجليزي)/الباركود/الماركة/الموديل في مخزون الفرع الحالي فقط. */
export async function searchProducts(shopId: number, query: string, warehouseId: number | null, isDefaultWh: boolean, limit = 60): Promise<SaleProduct[]> {
  const q = escapeOr(query);
  if (!q) return [];
  let req = supabase.from("products").select(PRODUCT_COLS).eq("shop_id", shopId)
    .or(["product_code", "product_name", "barcode", "brand", "model"].map((c) => `${c}.ilike.%${q}%`).join(","))
    .order("product_name").limit(limit);
  req = scopeWarehouse(req, warehouseId, isDefaultWh);
  const { data, error } = await req;
  if (error) { console.error("searchProducts", error); return []; }
  const rows = ((data as unknown) as ProductRow[]) || [];
  const needle = q.toLowerCase();
  // الأقرب أولًا: تطابق كامل للكود/الباركود ثم البدء بالنص ثم الباقي
  const rank = (p: SaleProduct): number => {
    const code = (p.product_code || "").toLowerCase(); const bar = (p.barcode || "").toLowerCase();
    if (code === needle || bar === needle) return 0;
    if (code.startsWith(needle) || bar.startsWith(needle)) return 1;
    return 2;
  };
  return rows.map(mapProduct).sort((a, b) => rank(a) - rank(b));
}

/** مطابقة تامة بالباركود أو الكود (قارئ الباركود يرسل Enter). */
export async function findProductExact(shopId: number, code: string, warehouseId: number | null, isDefaultWh: boolean): Promise<SaleProduct | null> {
  const q = escapeOr(code);
  if (!q) return null;
  let req = supabase.from("products").select(PRODUCT_COLS).eq("shop_id", shopId)
    .or(`barcode.eq.${q},product_code.eq.${q}`).limit(2);
  req = scopeWarehouse(req, warehouseId, isDefaultWh);
  const { data, error } = await req;
  if (error) { console.error("findProductExact", error); return null; }
  const rows = ((data as unknown) as ProductRow[]) || [];
  return rows.length === 1 ? mapProduct(rows[0]) : null;
}

export function sellPrice(p: SaleProduct): { price: number; fromCost: boolean } {
  if (p.selling_price != null && p.selling_price > 0) return { price: p.selling_price, fromCost: false };
  return { price: p.cost, fromCost: true };
}

// ── العملاء ──
export function receivableAccountOf(party: GLParty | null, all: GLParty[]): number | null {
  if (!party) return null;
  if (party.account_id) return party.account_id;
  if (party.parent_id) return all.find((x) => x.id === party.parent_id)?.account_id ?? null;
  return null;
}

export function filterCustomers(all: GLParty[], query: string): GLParty[] {
  const q = normalizeSearch(query);
  const list = all.filter((p) => p.is_active);
  if (!q) return list.slice(0, 30);
  return list.filter((p) =>
    normalizeSearch(p.name).includes(q) ||
    (p.phone || "").replace(/\s+/g, "").includes(q.replace(/\s+/g, "")) ||
    (p.tax_number || "").includes(q) ||
    String(p.id) === q
  ).slice(0, 30);
}

/** رصيد العميل = صافي حركة حساب الذمة من القيود المرحّلة (مدين − دائن) */
export async function customerBalance(orgId: number, accountId: number): Promise<number> {
  return Number(await DB.fetchAccountNet(orgId, accountId)) || 0;
}

// ── الترحيل ──
export type InvoicePayload = {
  idempotency_key: string; branch_id: number; date: string; due_date: string | null;
  party_id: number | null; customer_name: string | null; customer_ref: string | null; salesperson: string | null;
  warehouse_id: number; notes: string | null; tax_rate: number; tax_inclusive: boolean; sale_type: SaleType;
  revenue_account_id: number | null; tax_account_id: number | null; expected_total: number; source: string;
  items: { product_id: number; qty: number; unit_price: number; discount_pct: number }[];
  tenders: Tender[];
};

export type PostResult =
  | { ok: true; id: number; invoiceNo: number; invoiceYear: number; entryId: number; duplicate: boolean }
  | { ok: false; error: string; code: "not_installed" | "stock" | "totals" | "mapping" | "warehouse" | "payment" | "other" };

export async function postSalesInvoice(orgId: number, payload: InvoicePayload): Promise<PostResult> {
  const { data, error } = await supabase.rpc("post_sales_invoice", { p_org: orgId, p: payload });
  if (error) {
    const msg = error.message || "";
    const missing = error.code === "PGRST202" || /could not find the function|schema cache/i.test(msg);
    const code = missing ? "not_installed" : /Insufficient stock/i.test(msg) ? "stock" : /Totals mismatch/i.test(msg) ? "totals"
      : /account mapping is missing|configured mapping/i.test(msg) ? "mapping" : /arehouse/i.test(msg) ? "warehouse"
      : /does not match payment method|sale type|Cash sale|Credit sale|Partially paid|payment method per invoice/i.test(msg) ? "payment" : "other";
    return { ok: false, error: msg, code };
  }
  const r = data as { ok?: boolean; id?: number | string; invoice_no?: number | string; invoice_year?: number | string; entry_id?: number | string; duplicate?: boolean } | null;
  if (!r?.ok || r.id == null) return { ok: false, error: "empty response", code: "other" };
  return { ok: true, id: Number(r.id), invoiceNo: Number(r.invoice_no), invoiceYear: Number(r.invoice_year), entryId: Number(r.entry_id), duplicate: Boolean(r.duplicate) };
}

/** هل رُكّبت RPC؟ استدعاء بلا أثر (يفشل بالصلاحية قبل أي كتابة) يميّز «غير موجودة» عن «موجودة». */
export async function probeSalesRpc(): Promise<boolean> {
  const { error } = await supabase.rpc("post_sales_invoice", { p_org: 0, p: {} });
  if (!error) return true;
  return !(error.code === "PGRST202" || /could not find the function|schema cache/i.test(error.message || ""));
}

// ── المسودات (جدول gl_sales_invoice_drafts من P01) ──
export type DraftRow = { id: number; organization_id: number; branch_id: number | null; title: string | null; payload: unknown; updated_at: string };

export async function listDrafts(orgId: number, branchId: number | null): Promise<{ rows: DraftRow[]; missing: boolean }> {
  let q = supabase.from("gl_sales_invoice_drafts").select("id, organization_id, branch_id, title, payload, updated_at").eq("organization_id", orgId).order("updated_at", { ascending: false }).limit(50);
  if (branchId != null) q = q.eq("branch_id", branchId);
  const { data, error } = await q;
  if (error) return { rows: [], missing: /does not exist|schema cache|PGRST205|42P01/i.test(`${error.code} ${error.message}`) };
  return { rows: (data as DraftRow[]) || [], missing: false };
}

export async function saveDraft(orgId: number, branchId: number | null, id: number | null, title: string, payload: unknown): Promise<{ ok: boolean; id?: number; error?: string }> {
  if (id) {
    const { error } = await supabase.from("gl_sales_invoice_drafts").update({ title, payload, branch_id: branchId, updated_at: new Date().toISOString() }).eq("id", id).eq("organization_id", orgId);
    return error ? { ok: false, error: error.message } : { ok: true, id };
  }
  const { data, error } = await supabase.from("gl_sales_invoice_drafts").insert({ organization_id: orgId, branch_id: branchId, title, payload }).select("id").single();
  if (error || !data) return { ok: false, error: error?.message };
  return { ok: true, id: Number((data as { id: number | string }).id) };
}

export async function deleteDraft(orgId: number, id: number): Promise<void> {
  const { error } = await supabase.from("gl_sales_invoice_drafts").delete().eq("id", id).eq("organization_id", orgId);
  if (error) console.error("deleteDraft", error);
}

// ── السجل والطباعة ──
export async function fetchHistory(orgId: number, from: string, to: string, branchId: number | null): Promise<GLSalesInvoice[]> {
  return DB.fetchSalesInvoices(orgId, from, to, branchId);
}

export type PrintOrg = { name: string | null; tax_number: string | null; commercial_registration: string | null; phone: string | null; address: string | null; logo_url: string | null };

// tax_number من organizations (موجود)؛ shops.tax_number غير موجود في القاعدة الحية فلا نطلبه.
export async function fetchPrintOrg(orgId: number, shopId: number | null): Promise<PrintOrg> {
  const [o, s] = await Promise.all([
    supabase.from("organizations").select("name, legal_name, tax_number").eq("id", orgId).maybeSingle(),
    shopId ? supabase.from("shops").select("shop_name, logo_url, commercial_registration, phone, address").eq("id", shopId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const od = (o.data ?? null) as { name?: string | null; legal_name?: string | null; tax_number?: string | null } | null;
  const sd = (s.data ?? null) as { shop_name?: string | null; logo_url?: string | null; commercial_registration?: string | null; phone?: string | null; address?: string | null } | null;
  return {
    name: od?.legal_name || od?.name || sd?.shop_name || null, tax_number: od?.tax_number ?? null,
    commercial_registration: sd?.commercial_registration ?? null, phone: sd?.phone ?? null, address: sd?.address ?? null, logo_url: sd?.logo_url ?? null,
  };
}

export function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  const h = (n: number) => Math.floor(Math.random() * 16 ** n).toString(16).padStart(n, "0");
  return `${h(8)}-${h(4)}-4${h(3)}-a${h(3)}-${h(12)}`;
}


// ── المستودعات وربط الحسابات (جداول P02) ──
export type WarehouseRow = { id: number; branch_id: number | null; name: string; code: string | null; is_default: boolean; is_active: boolean; inventory_account_id: number | null };

// مستودعات الفرع فقط: دالة الترحيل ترفض أي مستودع لا يتبع الفرع («Warehouse does not belong to the selected branch»).
export async function fetchBranchWarehouses(orgId: number, branchId: number): Promise<{ rows: WarehouseRow[]; missing: boolean }> {
  const { data, error } = await supabase.from("warehouses").select("id, branch_id, name, code, is_default, is_active, inventory_account_id")
    .eq("organization_id", orgId).eq("branch_id", branchId).eq("is_active", true).order("is_default", { ascending: false }).order("id");
  if (error) return { rows: [], missing: /column|does not exist|schema cache/i.test(error.message) };
  return { rows: ((data as unknown) as WarehouseRow[]) || [], missing: false };
}

export type MapRow = { branch_id: number | null; role: string; account_id: number };

export async function fetchAccountMap(orgId: number): Promise<{ rows: MapRow[]; missing: boolean }> {
  const { data, error } = await supabase.from("gl_account_map").select("branch_id, role, account_id").eq("organization_id", orgId);
  if (error) return { rows: [], missing: true };
  return { rows: ((data as unknown) as MapRow[]) || [], missing: false };
}

/** فرع يتفوّق على مؤسسة (نفس resolve_account في قاعدة البيانات). */
export function resolveMapped(rows: MapRow[], branchId: number | null, role: string): number | null {
  const b = rows.find((r) => r.role === role && r.branch_id === branchId && branchId != null);
  if (b) return b.account_id;
  return rows.find((r) => r.role === role && r.branch_id == null)?.account_id ?? null;
}
