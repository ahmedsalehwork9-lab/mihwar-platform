// =============================================================
// src/pages/sales/salesInvoiceCalc.ts
// حسابات فاتورة المبيعات (دوال نقيّة بلا واجهة/قاعدة بيانات).
// الضريبة تُحسب بالدالة الحالية invoiceTotals من accountingDb (شامل/غير شامل)
// ولا نُعيد اختراع صيغة جديدة؛ نغذّيها بصافي كل سطر بعد الخصم.
// Pure invoice math. VAT reuses the existing invoiceTotals() from accountingDb.
// =============================================================
import { invoiceTotals } from "../lib/accountingDb";

export const r2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;

export type InvoiceLine = {
  key: string;
  productId: number;
  code: string | null;
  name: string;
  barcode: string | null;
  unit: string | null;
  stock: number;          // المتاح من products.quantity وقت الإضافة
  cost: number;           // products.price = متوسط التكلفة المرجّح
  qty: number;
  unitPrice: number;      // سعر القائمة قبل الخصم
  discountPct: number;    // 0..100
};

export type ComputedLine = InvoiceLine & {
  gross: number;          // qty × unitPrice
  discount: number;       // مبلغ الخصم
  net: number;            // بعد الخصم، قبل/بعد الضريبة حسب tax_inclusive
  vat: number;            // ضريبة السطر (للعرض)
  total: number;          // الإجمالي المعروض للسطر
};

export type InvoiceTotals = {
  lines: ComputedLine[];
  gross: number;          // مجموع صافي الأسطر
  discount: number;
  subtotal: number;
  tax: number;
  total: number;
};

export function clampPct(n: number): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.min(100, Math.max(0, v));
}

export function computeInvoice(lines: InvoiceLine[], taxRate: number, taxInclusive: boolean): InvoiceTotals {
  const rate = Number(taxRate) || 0;
  const computed: ComputedLine[] = lines.map((l) => {
    const qty = Number(l.qty) || 0;
    const price = Number(l.unitPrice) || 0;
    const gross = r2(qty * price);
    const discount = r2((gross * clampPct(l.discountPct)) / 100);
    const net = r2(gross - discount);
    const vat = taxInclusive ? r2(net - net / (1 + rate / 100)) : r2((net * rate) / 100);
    const total = taxInclusive ? net : r2(net + vat);
    return { ...l, gross, discount, net, vat, total };
  });
  const t = invoiceTotals(computed.map((c) => ({ qty: 1, unit_price: c.net })), rate, taxInclusive);
  return {
    lines: computed,
    gross: t.gross,
    discount: r2(computed.reduce((s, c) => s + c.discount, 0)),
    subtotal: t.subtotal,
    tax: t.tax,
    total: t.total,
  };
}

export type LineIssue = { key: string; code: "qty" | "qty_int" | "stock" | "price" | "discount"; max?: number };

// تحقق الأسطر قبل الإرسال (القاعدة تعيد الفحص نفسه من جهتها)
export function validateLines(lines: InvoiceLine[]): LineIssue[] {
  const out: LineIssue[] = [];
  for (const l of lines) {
    const qty = Number(l.qty);
    if (!Number.isFinite(qty) || qty <= 0) out.push({ key: l.key, code: "qty" });
    else if (!Number.isInteger(qty)) out.push({ key: l.key, code: "qty_int" });
    else if (qty > l.stock) out.push({ key: l.key, code: "stock", max: l.stock });
    if (!Number.isFinite(Number(l.unitPrice)) || Number(l.unitPrice) < 0) out.push({ key: l.key, code: "price" });
    const d = Number(l.discountPct);
    if (!Number.isFinite(d) || d < 0 || d > 100) out.push({ key: l.key, code: "discount" });
  }
  return out;
}

export type SaleType = "cash" | "credit" | "partial_credit";
export type PayMethod = "cash" | "bank_transfer" | "pos";

export type Tender = { method: PayMethod | "credit"; account_id: number; amount: number };

// نوع البيع مستقل عن طريقة الدفع:
//  cash: كامل الإجمالي بطريقة الدفع المختارة | credit: كله ذمة (بلا دفع) | partial_credit: المدفوع بالطريقة المختارة والباقي ذمة.
export function buildTenders(args: {
  saleType: SaleType; total: number; paidNow: number; method: PayMethod;
  paymentAccountId: number | null; receivableAccountId: number | null;
}): { ok: true; tenders: Tender[]; paid: number; due: number } | { ok: false; error: "treasury" | "receivable" | "paid_range" } {
  const total = r2(args.total);
  if (args.saleType === "cash") {
    if (!args.paymentAccountId) return { ok: false, error: "treasury" };
    return { ok: true, tenders: [{ method: args.method, account_id: args.paymentAccountId, amount: total }], paid: total, due: 0 };
  }
  if (!args.receivableAccountId) return { ok: false, error: "receivable" };
  if (args.saleType === "credit") {
    return { ok: true, tenders: [{ method: "credit", account_id: args.receivableAccountId, amount: total }], paid: 0, due: total };
  }
  const paid = r2(args.paidNow);
  if (!Number.isFinite(paid) || paid <= 0 || paid >= total) return { ok: false, error: "paid_range" };
  if (!args.paymentAccountId) return { ok: false, error: "treasury" };
  return { ok: true, tenders: [
    { method: args.method, account_id: args.paymentAccountId, amount: paid },
    { method: "credit", account_id: args.receivableAccountId, amount: r2(total - paid) },
  ], paid, due: r2(total - paid) };
}

export type MarginLine = { key: string; cost: number; sales: number; profit: number; pct: number | null };
export type MarginResult = { lines: MarginLine[]; sales: number; cost: number; profit: number; pct: number | null };

// هامش الربح على المبيعات بعد الخصم وقبل الضريبة. التكلفة = products.price (متوسط التكلفة المرجّح الحالي).
export function computeMargin(t: InvoiceTotals, taxRate: number, taxInclusive: boolean): MarginResult {
  const rate = Number(taxRate) || 0;
  const lines: MarginLine[] = t.lines.map((l) => {
    const sales = taxInclusive ? r2(l.net / (1 + rate / 100)) : l.net;
    const cost = r2((Number(l.cost) || 0) * (Number(l.qty) || 0));
    const profit = r2(sales - cost);
    return { key: l.key, cost, sales, profit, pct: sales > 0 ? r2((profit / sales) * 100) : null };
  });
  const cost = r2(lines.reduce((s, l) => s + l.cost, 0));
  const sales = t.subtotal;
  const profit = r2(sales - cost);
  return { lines, sales, cost, profit, pct: sales > 0 ? r2((profit / sales) * 100) : null };
}

export function addDays(isoDate: string, days: number): string {
  if (!isoDate) return "";
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Math.max(0, Math.floor(days) || 0));
  return d.toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso}T00:00:00Z`); const b = Date.parse(`${toIso}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86400000);
}

// يبحث بالاسم/الكود/الباركود/جزء منها، مع تطبيع عربي بسيط (همزات/تشكيل/ياء/تاء مربوطة/أرقام هندية)
export function normalizeSearch(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .trim();
}
