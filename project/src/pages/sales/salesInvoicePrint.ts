// =============================================================
// src/pages/sales/salesInvoicePrint.ts
// طباعة فاتورة المبيعات (A4) ثنائية اللغة RTL/LTR. تستعمل بيانات الفاتورة المحفوظة فقط.
// =============================================================
import type { GLSalesInvoice } from "../lib/accountingDb";
import type { PrintOrg } from "./salesInvoiceApi";
import { browserStore, loadPrintPrefs, makeT, pageCss, resolveDocLang, signatureHTML } from "../branchSettings/printPrefs";
import { printFooterHTML, printHeaderHTML } from "../print/brandPrint";

type Item = { description?: string; product_code?: string | null; qty?: number; unit_price?: number; line_total?: number; discount_pct?: number; discount_amount?: number; list_price?: number };

const esc = (s: unknown): string => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
const money = (n: number): string => (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export type PrintExtra = { dueDate?: string | null; customerRef?: string | null; salesperson?: string | null; discountTotal?: number; paymentLabel: string; currency: string };

export function buildInvoiceHTML(inv: GLSalesInvoice, org: PrintOrg, ex: PrintExtra, lang: "ar" | "en"): string {
  // القالب مطابق لقالب طباعة صفحة المبيعات القديمة (printInv): ترويسة المنشأة، جدول داكن الرأس، إجماليات — دون سطر المحاسب/واتساب.
  const pp = loadPrintPrefs(browserStore(), inv.branch_id ?? null);
  const { ar } = resolveDocLang(pp, lang); const T = makeT(pp, lang);
  const dir = ar ? "rtl" : "ltr";
  const A = ar ? "right" : "left"; const Z = ar ? "left" : "right";
  const items = ((inv.items as unknown) as Item[]) || [];
  const paid = Number(inv.paid_amount) || 0;
  const remaining = Math.max(0, Math.round(((Number(inv.total) || 0) - paid) * 100) / 100);
  const hasDisc = items.some((it) => (Number(it.discount_amount) || 0) > 0);
  const cell = `border:1px solid #e5e7eb;padding:5px 8px;text-align:center`;
  const rows = items.map((it, i) => {
    const disc = Number(it.discount_amount) || 0;
    return `<tr><td style="${cell}">${i + 1}</td>
      <td style="border:1px solid #e5e7eb;padding:5px 8px;text-align:${A}">${esc(it.description || "—")}${it.product_code ? `<div style="font-size:10px;color:#64748b;direction:ltr;text-align:${A}">${esc(it.product_code)}</div>` : ""}</td>
      <td style="${cell}">${esc(it.qty)}</td><td style="${cell}">${money(Number(it.list_price ?? it.unit_price) || 0)}</td>
      ${hasDisc ? `<td style="${cell}">${disc > 0 ? `${money(disc)}${it.discount_pct ? ` (${esc(it.discount_pct)}%)` : ""}` : "—"}</td>` : ""}
      <td style="${cell}">${money(Number(it.line_total) || 0)}</td></tr>`;
  }).join("");
  const heads = ["#", T("Item", "الصنف"), T("Qty", "الكمية"), T("Price", "السعر"), ...(hasDisc ? [T("Discount", "الخصم")] : []), T("Total", "الإجمالي")]
    .map((h) => `<th style="border:1px solid #d1d5db;padding:6px 8px;background:#14304d;color:#fff">${esc(h)}</th>`).join("");
  const trow = (label: string, val: string, bold = false): string =>
    `<tr><td style="padding:3px 8px;text-align:${A};${bold ? "font-weight:800" : ""}">${esc(label)}</td><td style="padding:3px 8px;text-align:${Z};direction:ltr;${bold ? "font-weight:800" : ""}">${val}</td></tr>`;
  const invNo = inv.invoice_no ? `${esc(inv.invoice_no)}` : esc(T("Draft preview", "معاينة — غير مرحّلة"));
  const extra = [
    ex.dueDate ? `${esc(T("Due date", "تاريخ الاستحقاق"))}: ${esc(ex.dueDate)}` : "",
    ex.customerRef ? `${esc(T("Customer ref", "مرجع العميل"))}: ${esc(ex.customerRef)}` : "",
    ex.salesperson ? `${esc(T("Salesperson", "مندوب المبيعات"))}: ${esc(ex.salesperson)}` : "",
  ].filter(Boolean).join(" · ");
  return `<!doctype html><html lang="${resolveDocLang(pp, lang).lang}" dir="${dir}"><head><meta charset="utf-8"><title>${esc(T("Invoice", "فاتورة"))} ${invNo}</title>
<style>${pageCss(pp)}</style></head>
<body style="font-family:'Segoe UI',Tahoma,sans-serif;padding:24px;color:#0f172a">
  ${printHeaderHTML({ org, pp, ar, T })}
  <h2 style="font-size:16px;margin:0 0 4px">${esc(T("Tax Invoice — Sales", "فاتورة ضريبية — مبيعات"))}</h2>
  <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:10px">
    <div>${esc(T("Invoice No", "رقم الفاتورة"))}: <b>${invNo}</b> · ${esc(T("Date", "التاريخ"))}: ${esc(inv.date)}</div>
    <div>${esc(T("Customer", "العميل"))}: <b>${esc(inv.customer_name || T("Cash customer", "عميل نقدي"))}</b> · ${esc(ex.paymentLabel)}</div>
  </div>
  ${extra ? `<div style="font-size:11px;color:#475569;margin-bottom:8px">${extra}</div>` : ""}
  <table style="border-collapse:collapse;width:100%;font-size:12px;margin-bottom:10px"><tr>${heads}</tr>${rows}</table>
  <table style="margin-${ar ? "right" : "left"}:auto;font-size:12px;min-width:240px">
    ${trow(T("Total before VAT", "الإجمالي قبل الضريبة"), money(inv.subtotal))}
    ${(ex.discountTotal ?? 0) > 0 ? trow(T("Total discount", "إجمالي الخصم"), money(ex.discountTotal ?? 0)) : ""}
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

export function printHTML(html: string): void {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("style", "position:fixed;right:0;bottom:0;width:0;height:0;border:0;");
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow?.document;
  if (!doc) { document.body.removeChild(iframe); return; }
  doc.open(); doc.write(html); doc.close();
  window.setTimeout(() => {
    try { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); } catch { /* ignore */ }
    window.setTimeout(() => { try { document.body.removeChild(iframe); } catch { /* ignore */ } }, 1500);
  }, 350);
}
