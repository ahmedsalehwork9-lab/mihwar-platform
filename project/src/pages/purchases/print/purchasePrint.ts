// =============================================================
// src/pages/purchases/print/purchasePrint.ts
// طباعة فاتورة المشتريات (A4) بنفس قالب فاتورة المبيعات: ترويسة المنشأة، جدول الأصناف،
// ثم إجمالي قبل الضريبة / الضريبة (٪) / الإجمالي / المدفوع / المتبقي. ثنائي اللغة RTL/LTR.
// =============================================================
import type { PrintOrg } from "../../sales/salesInvoiceApi";
import { browserStore, loadPrintPrefs, makeT, pageCss, resolveDocLang, signatureHTML } from "../../branchSettings/printPrefs";
import { printFooterHTML, printHeaderHTML } from "../../print/brandPrint";

export type PurchasePrintItem = { description?: string; qty?: number; unit_cost?: number; line_total?: number };
export type PurchasePrintInv = {
  branch_id?: number | null; invoice_no: number | null; invoice_year: number; date: string; due_date?: string | null; supplier_name: string | null; supplier_invoice_no?: string | null;
  items: PurchasePrintItem[]; subtotal: number; tax_rate: number; tax_amount: number; tax_inclusive?: boolean; total: number; paid_amount: number; notes?: string | null;
};
export type PurchasePrintExtra = { paymentLabel: string; currency: string };

const esc = (s: unknown): string => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
const money = (n: number): string => (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const purchaseLabel = (year: number, no: number): string => `PI-${year}-${String(no).padStart(4, "0")}`;

export function buildPurchaseInvoiceHTML(inv: PurchasePrintInv, org: PrintOrg, ex: PurchasePrintExtra, lang: "ar" | "en"): string {
  const pp = loadPrintPrefs(browserStore(), inv.branch_id ?? null);
  const { ar, lang: dl } = resolveDocLang(pp, lang); const T = makeT(pp, lang);
  const dir = ar ? "rtl" : "ltr"; const A = ar ? "right" : "left"; const Z = ar ? "left" : "right";
  const paid = Number(inv.paid_amount) || 0; const remaining = Math.max(0, Math.round(((Number(inv.total) || 0) - paid) * 100) / 100);
  const cell = "border:1px solid #e5e7eb;padding:5px 8px;text-align:center";
  const rows = (inv.items || []).map((it, i) => `<tr><td style="${cell}">${i + 1}</td><td style="border:1px solid #e5e7eb;padding:5px 8px;text-align:${A}">${esc(it.description || "—")}</td>
    <td style="${cell}">${esc(it.qty)}</td><td style="${cell}">${money(Number(it.unit_cost) || 0)}</td><td style="${cell}">${money(Number(it.line_total) || 0)}</td></tr>`).join("");
  const heads = ["#", T("Item", "الصنف"), T("Qty", "الكمية"), T("Unit cost", "التكلفة"), T("Total", "الإجمالي")].map((h) => `<th style="border:1px solid #d1d5db;padding:6px 8px;background:#14304d;color:#fff">${esc(h)}</th>`).join("");
  const trow = (label: string, val: string, bold = false): string => `<tr><td style="padding:3px 8px;text-align:${A};${bold ? "font-weight:800" : ""}">${esc(label)}</td><td style="padding:3px 8px;text-align:${Z};direction:ltr;${bold ? "font-weight:800" : ""}">${val}</td></tr>`;
  const no = inv.invoice_no ? purchaseLabel(inv.invoice_year, inv.invoice_no) : T("Draft preview", "معاينة — غير مرحّلة");
  const extra = [inv.supplier_invoice_no ? `${esc(T("Supplier invoice no.", "رقم فاتورة المورد"))}: ${esc(inv.supplier_invoice_no)}` : "", inv.due_date ? `${esc(T("Due date", "تاريخ الاستحقاق"))}: ${esc(inv.due_date)}` : "",
    inv.tax_inclusive ? esc(T("Prices include VAT", "الأسعار شاملة الضريبة")) : ""].filter(Boolean).join(" · ");
  return `<!doctype html><html lang="${dl}" dir="${dir}"><head><meta charset="utf-8"><title>${esc(T("Purchase invoice", "فاتورة مشتريات"))} ${esc(no)}</title><style>${pageCss(pp)}</style></head>
<body style="font-family:'Segoe UI',Tahoma,sans-serif;padding:24px;color:#0f172a">
  ${printHeaderHTML({ org, pp, ar, T })}
  <h2 style="font-size:16px;margin:0 0 4px">${esc(T("Tax Invoice — Purchases", "فاتورة ضريبية — مشتريات"))}</h2>
  <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:10px">
    <div>${esc(T("Invoice No", "رقم الفاتورة"))}: <b>${esc(no)}</b> · ${esc(T("Date", "التاريخ"))}: ${esc(inv.date)}</div>
    <div>${esc(T("Supplier", "المورد"))}: <b>${esc(inv.supplier_name || T("Cash supplier", "مورد نقدي"))}</b> · ${esc(ex.paymentLabel)}</div></div>
  ${extra ? `<div style="font-size:11px;color:#475569;margin-bottom:8px">${extra}</div>` : ""}
  <table style="border-collapse:collapse;width:100%;font-size:12px;margin-bottom:10px"><tr>${heads}</tr>${rows}</table>
  <table style="margin-${ar ? "right" : "left"}:auto;font-size:12px;min-width:240px">
    ${trow(T("Total before VAT", "الإجمالي قبل الضريبة"), money(inv.subtotal))}
    ${trow(`${T("VAT", "الضريبة")} (${inv.tax_rate}%)`, money(inv.tax_amount))}
    ${trow(T("Total", "الإجمالي"), `${money(inv.total)} ${esc(ex.currency)}`, true)}
    ${trow(T("Paid", "المدفوع"), money(paid))}
    ${trow(T("Remaining", "المتبقي"), money(remaining), true)}
  </table>
  ${inv.notes ? `<p style="font-size:12px"><b>${esc(T("Notes", "ملاحظات"))}:</b> ${esc(inv.notes)}</p>` : ""}
  ${signatureHTML(pp, esc(T("Receiver signature", "توقيع المستلم")))}
  ${printFooterHTML({ pp, T })}
</body></html>`;
}
