import React, { createContext, useContext, useState } from "react";
// ---- contexts ----
const LangCtx = createContext<any>(null);
export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<"ar" | "en">("ar");
  (window as any).__setLang = setLang;
  const isRTL = lang === "ar";
  const t = (en: string, ar: string) => (isRTL ? ar : en);
  return <LangCtx.Provider value={{ lang, setLang, t, isRTL }}><div dir={isRTL ? "rtl" : "ltr"}>{children}</div></LangCtx.Provider>;
}
export const useLang = () => useContext(LangCtx);
export const useAuth = () => ({ ownedShopId: 1, branches: [{ id: 1, name: "الفرع الرئيسي" }, { id: 2, name: "Branch 2" }], user: { email: "t@t" } });
export const useOrgConfig = () => ({ cfg: { default_tax_rate: 15, currency_symbol: "SAR" } });
// ---- DB mock ----
export const getOrgForBranch = async () => ({ id: 1, name: "Org" });
export const fetchAccounts = async () => [
  { id: 3, code: "4100", name: "إيراد المبيعات", type: "revenue", is_group: false, is_active: true },
  { id: 4, code: "2200", name: "ضريبة المخرجات", type: "liability", is_group: false, is_active: true },
  { id: 5, code: "1200", name: "ذمم العملاء", type: "asset", is_group: false, is_active: true },
];
export const fetchTreasuries = async () => [{ id: 1, name: "الصندوق", kind: "cash", account_id: 1, branch_id: 1, is_active: true }, { id: 3, name: "صندوق 2", kind: "cash", account_id: 9, branch_id: 1, is_active: true }, { id: 2, name: "البنك", kind: "bank", account_id: 2, branch_id: 1, is_active: true }];
export const fetchParties = async () => [
  { id: 1, name: "شركة النور", name_en: "Al Noor Co", phone: "0500000001", tax_number: "300111", credit_days: 30, account_id: 5, type: "customer" },
  { id: 2, name: "Gulf Traders", phone: "0500000002", tax_number: "300222", credit_days: 0, account_id: 5, type: "customer" },
];
export const fetchWarehouses = async () => [];
// ---- API mock ----
const w = window as any;
w.__stock = { 1: 100, 2: 5, 3: 0 };
w.__posted = []; w.__idem = {}; w.__delay = 0; w.__rpc = true; w.__nextNo = 1;
const PRODUCTS = [
  { id: 1, product_code: "BRK-001", product_name: "فحمات فرامل أمامية", brand: "Toyota", model: null, barcode: "6281000000011", cost: 10, selling_price: 20, unit: "قطعة", warehouse_id: null, image: null },
  { id: 2, product_code: "OIL-5W30", product_name: "Engine Oil 5W-30", brand: "Mobil", model: null, barcode: null, cost: 40, selling_price: 60, unit: "pc", warehouse_id: null, image: null },
  { id: 3, product_code: "FLT-009", product_name: "فلتر هواء", brand: null, model: null, barcode: null, cost: 5, selling_price: 9, unit: "pc", warehouse_id: null, image: null },
];
const withQty = (p: any) => ({ ...p, quantity: w.__stock[p.id] });
const norm = (s: string) => s.toLowerCase().replace(/[أإآ]/g, "ا");
export const searchProducts = async (_s: number, q: string) => PRODUCTS.filter((p) => [p.product_code, p.product_name, p.barcode, p.brand].some((f) => f && norm(f).includes(norm(q.trim())))).map(withQty);
export const findProductExact = async (_s: number, c: string) => { const p = PRODUCTS.find((x) => x.product_code?.toLowerCase() === c.toLowerCase() || x.barcode === c); return p ? withQty(p) : null; };
export const sellPrice = (p: any) => (p.selling_price ? { price: p.selling_price, fromCost: false } : { price: p.cost, fromCost: true });
export const receivableAccountOf = (p: any) => (p ? p.account_id : null);
export const filterCustomers = (all: any[], q: string) => { const n = norm(q.trim()); return !n ? all : all.filter((c) => [c.name, c.name_en, c.phone, c.tax_number, String(c.id)].some((f) => f && norm(String(f)).includes(n))); };
export const customerBalance = async () => 1250;
export const postSalesInvoice = async (_o: number, p: any) => {
  await new Promise((r) => setTimeout(r, w.__delay));
  if (!w.__rpc) return { ok: false, code: "not_installed", error: "missing" };
  if (w.__idem[p.idempotency_key]) return { ...w.__idem[p.idempotency_key], duplicate: true };
  for (const it of p.items) if (it.qty > w.__stock[it.product_id]) return { ok: false, code: "stock", error: "insufficient" };
  for (const it of p.items) w.__stock[it.product_id] -= it.qty;
  const r = { ok: true, id: w.__nextNo, invoiceNo: w.__nextNo++, invoiceYear: 2026, entryId: 1, duplicate: false };
  w.__idem[p.idempotency_key] = r; w.__posted.push(p); return r;
};
export const probeSalesRpc = async () => w.__rpc;
const drafts: any[] = [];
export const listDrafts = async () => ({ rows: drafts, missing: false });
export const saveDraft = async (_o: number, _b: number | null, id: number | null, title: string, payload: unknown) => { const nid = id ?? drafts.length + 1; const row = { id: nid, organization_id: 1, branch_id: 1, title, payload, updated_at: new Date().toISOString() }; const i = drafts.findIndex((d) => d.id === nid); if (i >= 0) drafts[i] = row; else drafts.push(row); return { ok: true, id: nid }; };
export const deleteDraft = async (_o: number, id: number) => { const i = drafts.findIndex((d) => d.id === id); if (i >= 0) drafts.splice(i, 1); };
export const fetchHistory = async () => w.__posted.map((p: any, i: number) => ({ id: i + 1, invoice_no: i + 1, invoice_year: 2026, date: p.date, customer_name: p.customer_name, payment_type: p.tenders.length > 1 ? "partial" : p.tenders[0].method, total: p.expected_total, paid_amount: p.tenders.filter((t: any) => t.method !== "credit").reduce((a: number, t: any) => a + t.amount, 0), items: [] }));
export const fetchPrintOrg = async () => ({ name: "Org", tax_number: "300", commercial_registration: null, phone: null, address: null, logo_url: null });
let k = 0; export const newIdempotencyKey = () => `key-${++k}`;
