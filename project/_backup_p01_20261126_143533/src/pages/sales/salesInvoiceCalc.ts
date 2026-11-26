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

export type PayMode = "cash" | "credit";

export type Tender = { method: "cash" | "card" | "credit"; account_id: number; amount: number };

// تقسيم التحصيل: نقدي = كامل الإجمالي في الخزنة؛ آجل = (المحصّل الآن إن وُجد) في الخزنة والباقي ذمة.
export function buildTenders(args: {
  mode: PayMode; total: number; paidNow: number;
  treasuryAccountId: number | null; treasuryMethod: "cash" | "card"; receivableAccountId: number | null;
}): { ok: true; tenders: Tender[]; paid: number; due: number } | { ok: false; error: "treasury" | "receivable" | "paid_range" } {
  const total = r2(args.total);
  if (args.mode === "cash") {
    if (!args.treasuryAccountId) return { ok: false, error: "treasury" };
    return { ok: true, tenders: [{ method: args.treasuryMethod, account_id: args.treasuryAccountId, amount: total }], paid: total, due: 0 };
  }
  const paid = r2(args.paidNow);
  if (!Number.isFinite(paid) || paid < 0 || paid > total) return { ok: false, error: "paid_range" };
  const due = r2(total - paid);
  const tenders: Tender[] = [];
  if (paid > 0) {
    if (!args.treasuryAccountId) return { ok: false, error: "treasury" };
    tenders.push({ method: args.treasuryMethod, account_id: args.treasuryAccountId, amount: paid });
  }
  if (due > 0) {
    if (!args.receivableAccountId) return { ok: false, error: "receivable" };
    tenders.push({ method: "credit", account_id: args.receivableAccountId, amount: due });
  }
  return { ok: true, tenders, paid, due };
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
