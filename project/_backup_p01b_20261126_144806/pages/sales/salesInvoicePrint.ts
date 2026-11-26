// =============================================================
// src/pages/sales/salesInvoicePrint.ts
// طباعة فاتورة المبيعات (A4) ثنائية اللغة RTL/LTR. تستعمل بيانات الفاتورة المحفوظة فقط.
// =============================================================
import type { GLSalesInvoice } from "../lib/accountingDb";
import type { PrintOrg } from "./salesInvoiceApi";

type Item = { description?: string; product_code?: string | null; qty?: number; unit_price?: number; line_total?: number; discount_pct?: number; discount_amount?: number; list_price?: number };

const esc = (s: unknown): string => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
const money = (n: number): string => (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export type PrintExtra = { dueDate?: string | null; customerRef?: string | null; salesperson?: string | null; discountTotal?: number; paymentLabel: string; currency: string };

export function buildInvoiceHTML(inv: GLSalesInvoice, org: PrintOrg, ex: PrintExtra, lang: "ar" | "en"): string {
  const ar = lang === "ar";
  const T = (en: string, a: string): string => (ar ? a : en);
  const dir = ar ? "rtl" : "ltr";
  const items = ((inv.items as unknown) as Item[]) || [];
  const paid = Number(inv.paid_amount) || 0;
  const remaining = Math.max(0, Math.round(((Number(inv.total) || 0) - paid) * 100) / 100);
  const rows = items.map((it, i) => {
    const disc = Number(it.discount_amount) || 0;
    return `<tr><td>${i + 1}</td><td>${esc(it.product_code ?? "")}</td><td class="n">${esc(it.description)}</td>
      <td>${esc(it.qty)}</td><td>${money(Number(it.list_price ?? it.unit_price) || 0)}</td>
      <td>${disc > 0 ? `${money(disc)}${it.discount_pct ? ` (${esc(it.discount_pct)}%)` : ""}` : "—"}</td>
      <td>${money(Number(it.line_total) || 0)}</td></tr>`;
  }).join("");
  const meta = (k: string, v: string | null | undefined): string => (v ? `<div><b>${esc(k)}:</b> ${esc(v)}</div>` : "");
  const invNo = inv.invoice_no ? `${esc(inv.invoice_no)}/${esc(inv.invoice_year)}` : esc(T("Draft preview", "معاينة — غير مرحّلة"));
  return `<!doctype html><html lang="${lang}" dir="${dir}"><head><meta charset="utf-8"><title>${esc(T("Tax Invoice", "فاتورة ضريبية"))} ${invNo}</title>
<style>
@page{size:A4;margin:12mm}*{box-sizing:border-box}body{font-family:Tahoma,Arial,sans-serif;font-size:12px;color:#111;margin:0}
.hd{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #1d4ed8;padding-bottom:8px;margin-bottom:10px}
.hd h1{margin:0;font-size:20px;color:#1d4ed8}.hd img{max-height:60px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:4px 18px;margin-bottom:10px}
table{width:100%;border-collapse:collapse}th{background:#1d4ed8;color:#fff;padding:6px;font-size:11px}td{border-bottom:1px solid #ddd;padding:6px;text-align:center}td.n{text-align:${ar ? "right" : "left"}}
.tot{margin-top:12px;margin-${ar ? "right" : "left"}:auto;width:55%}.tot div{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #eee}
.tot .g{font-weight:700;font-size:14px;background:#eef2ff;padding:6px}.ft{margin-top:24px;display:flex;justify-content:space-between;color:#555;font-size:11px}
</style></head><body>
<div class="hd"><div><h1>${esc(T("Tax Invoice", "فاتورة ضريبية"))}</h1>
<div>${esc(T("Invoice No", "رقم الفاتورة"))}: <b>${invNo}</b></div>
<div>${esc(T("Date", "التاريخ"))}: ${esc(inv.date)}</div></div>
<div style="text-align:${ar ? "left" : "right"}">${org.logo_url ? `<img src="${esc(org.logo_url)}" alt="">` : ""}
<div><b>${esc(org.name ?? "")}</b></div>${org.tax_number ? `<div>${esc(T("VAT No", "الرقم الضريبي"))}: ${esc(org.tax_number)}</div>` : ""}
${org.commercial_registration ? `<div>${esc(T("CR", "السجل التجاري"))}: ${esc(org.commercial_registration)}</div>` : ""}
${org.phone ? `<div>${esc(org.phone)}</div>` : ""}${org.address ? `<div>${esc(org.address)}</div>` : ""}</div></div>
<div class="grid">${meta(T("Customer", "العميل"), inv.customer_name || T("Cash customer", "عميل نقدي"))}${meta(T("Payment", "طريقة الدفع"), ex.paymentLabel)}
${meta(T("Due date", "تاريخ الاستحقاق"), ex.dueDate)}${meta(T("Customer ref", "مرجع العميل"), ex.customerRef)}${meta(T("Salesperson", "مندوب المبيعات"), ex.salesperson)}</div>
<table><thead><tr><th>#</th><th>${esc(T("Code", "الكود"))}</th><th>${esc(T("Item", "الصنف"))}</th><th>${esc(T("Qty", "الكمية"))}</th><th>${esc(T("Price", "السعر"))}</th><th>${esc(T("Discount", "الخصم"))}</th><th>${esc(T("Net", "الصافي"))}</th></tr></thead><tbody>${rows}</tbody></table>
<div class="tot"><div><span>${esc(T("Subtotal (before VAT)", "الإجمالي قبل الضريبة"))}</span><span>${money(inv.subtotal)}</span></div>
${(ex.discountTotal ?? 0) > 0 ? `<div><span>${esc(T("Total discount", "إجمالي الخصم"))}</span><span>${money(ex.discountTotal ?? 0)}</span></div>` : ""}
<div><span>${esc(T("VAT", "ضريبة القيمة المضافة"))} (${esc(inv.tax_rate)}%)</span><span>${money(inv.tax_amount)}</span></div>
<div class="g"><span>${esc(T("Invoice total", "إجمالي الفاتورة"))}</span><span>${money(inv.total)} ${esc(ex.currency)}</span></div>
<div><span>${esc(T("Paid", "المدفوع"))}</span><span>${money(paid)}</span></div><div><span>${esc(T("Remaining", "المتبقي"))}</span><span>${money(remaining)}</span></div></div>
${inv.notes ? `<p><b>${esc(T("Notes", "ملاحظات"))}:</b> ${esc(inv.notes)}</p>` : ""}
<div class="ft"><span>${esc(T("Prepared by MIHWAR Cloud ERP", "صادرة من محور"))}</span><span>${esc(T("Signature", "التوقيع"))}: ______________</span></div>
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
