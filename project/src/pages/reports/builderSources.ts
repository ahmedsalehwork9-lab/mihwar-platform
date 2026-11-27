// =============================================================
// src/pages/reports/builderSources.ts — مصادر بيانات مُنشئ التقارير (موثّقة، قراءة فقط، بصفحات).
// لا SQL حر. كل مصدر يُرجع { rows, truncated, error } لتحذير المستخدم عند القصّ بدل أرقام ناقصة.
// =============================================================
import * as DB from "../lib/accountingDb";
import { supabase } from "../lib/supabase";
import { fetchEntriesPaged } from "../accounting/journal/journalApi";
import { accName } from "./reportsLogic";
import { isLiveInvoice } from "./reportsLogic";
import { fetchProductsPaged, fetchPurchasesPaged, fetchSalesPaged, pageAll } from "./reportsApi";
import type { Field, Row } from "./builderLogic";

export type LoadCtx = { orgId: number; from: string; to: string; branchId: number | null; shopIds: number[]; branchName: (id: number | null) => string; lang: "ar" | "en" };
export type LoadRes = { rows: Row[]; truncated: boolean; error: string | null };
export type Src = { id: string; en: string; ar: string; fields: Field[]; load: (ctx: LoadCtx) => Promise<LoadRes> };

const ENTRY_EN: Record<string, string> = { general: "General entry", purchases: "Purchases", sales: "Sales", settlement: "Settlement", receipt: "Receipt voucher", payment: "Payment voucher", depreciation: "Depreciation", opening: "Opening balance", accrual: "Accrual", prepaid: "Prepaid", payroll: "Payroll", bank: "Bank", closing: "Closing" };
const TYPE_LABEL: Record<string, [string, string]> = { asset: ["Asset", "أصل"], liability: ["Liability", "خصم"], equity: ["Equity", "حقوق ملكية"], revenue: ["Revenue", "إيراد"], expense: ["Expense", "مصروف"] };
export const entryTypeLabel = (k: string | undefined, lang: "ar" | "en"): string => { const key = k || "general"; return lang === "ar" ? (DB.ENTRY_TYPE_LABEL[key] || key) : (ENTRY_EN[key] || key); };
const typeLabel = (k: string | undefined, lang: "ar" | "en"): string => (k && TYPE_LABEL[k] ? TYPE_LABEL[k][lang === "ar" ? 1 : 0] : k || "—");

const F = (key: string, en: string, ar: string, type: Field["type"], measure = false): Field => ({ key, en, ar, type, measure });
const ok = (rows: Row[], truncated = false, error: string | null = null): LoadRes => ({ rows, truncated, error });

export const SOURCES: Src[] = [
  {
    id: "sales", en: "Sales Invoices", ar: "فواتير المبيعات",
    fields: [F("date", "Date", "التاريخ", "date"), F("branch", "Branch", "الفرع", "category"), F("customer", "Customer", "العميل", "text"), F("payment", "Payment type", "نوع الدفع", "category"), F("total", "Total", "الإجمالي", "currency", true), F("subtotal", "Net (excl. VAT)", "الصافي", "currency", true), F("tax", "VAT", "الضريبة", "currency", true)],
    load: async ({ orgId, from, to, branchId, branchName }) => {
      const r = await fetchSalesPaged(orgId, from, to, branchId);
      return ok(r.rows.filter((s) => isLiveInvoice(s.status)).map((s) => ({ date: s.date, branch: branchName(s.branch_id), customer: s.customer_name || "—", payment: s.payment_type, total: Number(s.total) || 0, subtotal: Number(s.subtotal) || 0, tax: Number(s.tax_amount) || 0 })), r.truncated, r.error);
    },
  },
  {
    id: "sales_items", en: "Sales Items", ar: "أصناف المبيعات",
    fields: [F("date", "Date", "التاريخ", "date"), F("branch", "Branch", "الفرع", "category"), F("customer", "Customer", "العميل", "text"), F("product", "Product", "الصنف", "category"), F("qty", "Quantity", "الكمية", "number", true), F("net", "Line total", "إجمالي السطر", "currency", true)],
    load: async ({ orgId, from, to, branchId, branchName }) => {
      const r = await fetchSalesPaged(orgId, from, to, branchId); const out: Row[] = [];
      for (const s of r.rows) { if (!isLiveInvoice(s.status)) continue; for (const it of s.items || []) out.push({ date: s.date, branch: branchName(s.branch_id), customer: s.customer_name || "—", product: (it.description || "—").trim() || "—", qty: Number(it.qty) || 0, net: Number(it.line_total) || 0 }); }
      return ok(out, r.truncated, r.error);
    },
  },
  {
    id: "purchases", en: "Purchase Invoices", ar: "فواتير المشتريات",
    fields: [F("date", "Date", "التاريخ", "date"), F("branch", "Branch", "الفرع", "category"), F("supplier", "Supplier", "المورد", "text"), F("kind", "Kind", "النوع", "category"), F("total", "Total", "الإجمالي", "currency", true), F("subtotal", "Net (excl. VAT)", "الصافي", "currency", true), F("tax", "VAT", "الضريبة", "currency", true)],
    load: async ({ orgId, from, to, branchId, branchName }) => {
      const r = await fetchPurchasesPaged(orgId, from, to, branchId);
      return ok(r.rows.filter((p) => isLiveInvoice(p.status)).map((p) => ({ date: p.date, branch: branchName(p.branch_id), supplier: p.supplier_name || "—", kind: p.purchase_kind, total: Number(p.total) || 0, subtotal: Number(p.subtotal) || 0, tax: Number(p.tax_amount) || 0 })), r.truncated, r.error);
    },
  },
  {
    id: "inventory", en: "Inventory", ar: "المخزون",
    fields: [F("name", "Product", "الصنف", "text"), F("category", "Category", "التصنيف", "category"), F("brand", "Brand", "العلامة", "category"), F("quantity", "Quantity", "الكمية", "number", true), F("cost", "Unit cost", "التكلفة", "currency", true), F("value", "Stock value", "قيمة المخزون", "currency", true)],
    load: async ({ shopIds }) => {
      const r = await fetchProductsPaged(shopIds);
      return ok(r.rows.map((p) => ({ name: p.name, category: p.category || "—", brand: p.brand || "—", quantity: p.qty, cost: p.cost, value: Math.round(Math.max(p.qty, 0) * p.cost * 100) / 100 })), r.truncated, r.error);
    },
  },
  {
    id: "stock_moves", en: "Stock Movements", ar: "حركات المخزون",
    fields: [F("date", "Date", "التاريخ", "date"), F("move_type", "Movement", "نوع الحركة", "category"), F("qty", "Quantity", "الكمية", "number", true), F("cost", "Unit cost", "التكلفة", "currency", true), F("value", "Value", "القيمة", "currency", true)],
    load: async ({ orgId, from, to, branchId }) => {
      const r = await pageAll<{ created_at: string; move_type: string; qty: number; unit_cost: number }>((a, b) => {
        let q = supabase.from("gl_stock_moves").select("created_at, move_type, qty, unit_cost").eq("organization_id", orgId).gte("created_at", from).lte("created_at", `${to}T23:59:59`).order("created_at", { ascending: false }).order("id", { ascending: false }).range(a, b);
        if (branchId != null) q = q.eq("branch_id", branchId); return q;
      });
      return ok(r.rows.map((m) => { const q = Math.abs(Number(m.qty) || 0), c = Number(m.unit_cost) || 0; return { date: String(m.created_at).slice(0, 10), move_type: m.move_type, qty: q, cost: c, value: Math.round(q * c * 100) / 100 }; }), r.truncated, r.error);
    },
  },
  {
    id: "journal", en: "Journal Lines", ar: "سطور القيود",
    fields: [F("date", "Date", "التاريخ", "date"), F("branch", "Branch", "الفرع", "category"), F("account", "Account", "الحساب", "category"), F("type", "Account type", "نوع الحساب", "category"), F("entry_type", "Source", "المصدر", "category"), F("debit", "Debit", "مدين", "currency", true), F("credit", "Credit", "دائن", "currency", true)],
    load: async (c) => {
      const [es, accounts] = await Promise.all([fetchEntriesPaged(c.orgId, c.from, c.to, c.branchId), DB.fetchAccounts(c.orgId)]); const by = new Map(accounts.map((a) => [a.id, a] as const)); const out: Row[] = [];
      for (const e of es.rows) { if ((e.status || "posted") !== "posted") continue; for (const l of e.lines || []) { const a = by.get(l.account_id); out.push({ date: e.date, branch: c.branchName(((l as { branch_id?: number | null }).branch_id ?? e.branch_id ?? null) as number | null), account: a ? accName(a, c.lang) : String(l.account_id), type: typeLabel(a?.type, c.lang), entry_type: entryTypeLabel(e.entry_type, c.lang), debit: Number(l.debit) || 0, credit: Number(l.credit) || 0 }); } }
      return ok(out, es.truncated, es.error);
    },
  },
  {
    id: "expenses", en: "Expenses (ledger)", ar: "المصروفات (الدفتر)",
    fields: [F("date", "Date", "التاريخ", "date"), F("branch", "Branch", "الفرع", "category"), F("account", "Account", "الحساب", "category"), F("entry_type", "Source", "المصدر", "category"), F("amount", "Amount", "المبلغ", "currency", true)],
    load: async (c) => {
      const [es, accounts] = await Promise.all([fetchEntriesPaged(c.orgId, c.from, c.to, c.branchId), DB.fetchAccounts(c.orgId)]); const by = new Map(accounts.map((a) => [a.id, a] as const)); const out: Row[] = [];
      for (const e of es.rows) { if ((e.status || "posted") !== "posted") continue; for (const l of e.lines || []) { const a = by.get(l.account_id); if (!a || a.type !== "expense") continue; const v = (Number(l.debit) || 0) - (Number(l.credit) || 0); if (!v) continue; out.push({ date: e.date, branch: c.branchName(((l as { branch_id?: number | null }).branch_id ?? e.branch_id ?? null) as number | null), account: accName(a, c.lang), entry_type: entryTypeLabel(e.entry_type, c.lang), amount: Math.round(v * 100) / 100 }); } }
      return ok(out, es.truncated, es.error);
    },
  },
];
export const srcById = (id: string): Src => SOURCES.find((s) => s.id === id) ?? SOURCES[0];

// كاش تحميل المصادر لنفس (المؤسسة/الفترة/الفرع/اللغة)
const CACHE = new Map<string, Promise<LoadRes>>();
export const clearSourceCache = (): void => CACHE.clear();
export function loadSource(src: Src, ctx: LoadCtx): Promise<LoadRes> {
  const key = `${ctx.orgId}|${src.id}|${ctx.from}|${ctx.to}|${ctx.branchId}|${ctx.shopIds.join(",")}|${ctx.lang}`;
  let p = CACHE.get(key); if (!p) { p = src.load(ctx).catch((e: unknown) => ({ rows: [], truncated: false, error: e instanceof Error ? e.message : String(e) })); CACHE.set(key, p); }
  return p;
}
