// =============================================================
// src/pages/print/docTemplates.ts
// قوالب طباعة الدورة المستندية — محرك واحد بتسع أنواع مستندات، ثنائي اللغة (عربي/English/ثنائي) RTL/LTR.
// المبيعات: عرض سعر → فاتورة مبيعات → سند قبض → مرتجع مبيعات.  المشتريات: أمر شراء → فاتورة مشتريات → سند صرف → مرتجع مشتريات.  + قيد يومية.
// =============================================================
import type { PrintOrg } from "../sales/salesInvoiceApi";
import { loadPrintPrefs, browserStore, makeT, pageCss, resolveDocLang, type PrintPrefs } from "../branchSettings/printPrefs";
import { esc, money, printFooterHTML, printHeaderHTML } from "./brandPrint";

export type DocKind = "quotation" | "sales_invoice" | "sales_return" | "receipt_voucher" | "purchase_order" | "purchase_invoice" | "purchase_return" | "payment_voucher" | "journal_voucher";
export type DocLayout = "items" | "voucher" | "journal";
export type DocMeta = { kind: DocKind; layout: DocLayout; en: string; ar: string; stage: "sales" | "purchases" | "accounting"; step: number; accent: string; partyEn: string; partyAr: string; numberEn: string; numberAr: string; sigs: [string, string][] };
const S = (en: string, ar: string): [string, string] => [en, ar];
export const DOC_KINDS: DocMeta[] = [
  { kind: "quotation", layout: "items", en: "Quotation", ar: "عرض سعر", stage: "sales", step: 1, accent: "#007BFF", partyEn: "Customer", partyAr: "العميل", numberEn: "Quotation No", numberAr: "رقم العرض", sigs: [S("Prepared by", "أعدّه"), S("Customer acceptance", "موافقة العميل")] },
  { kind: "sales_invoice", layout: "items", en: "Tax Invoice — Sales", ar: "فاتورة ضريبية — مبيعات", stage: "sales", step: 2, accent: "#0B1F44", partyEn: "Customer", partyAr: "العميل", numberEn: "Invoice No", numberAr: "رقم الفاتورة", sigs: [S("Salesperson", "المندوب"), S("Receiver signature", "توقيع المستلم")] },
  { kind: "receipt_voucher", layout: "voucher", en: "Receipt Voucher", ar: "سند قبض", stage: "sales", step: 3, accent: "#059669", partyEn: "Received from", partyAr: "استلمنا من", numberEn: "Voucher No", numberAr: "رقم السند", sigs: [S("Accountant", "المحاسب"), S("Payer signature", "توقيع الدافع"), S("Cashier", "أمين الصندوق")] },
  { kind: "sales_return", layout: "items", en: "Credit Note — Sales Return", ar: "إشعار دائن — مرتجع مبيعات", stage: "sales", step: 4, accent: "#d97706", partyEn: "Customer", partyAr: "العميل", numberEn: "Note No", numberAr: "رقم الإشعار", sigs: [S("Prepared by", "أعدّه"), S("Customer signature", "توقيع العميل")] },
  { kind: "purchase_order", layout: "items", en: "Purchase Order", ar: "أمر شراء", stage: "purchases", step: 1, accent: "#007BFF", partyEn: "Supplier", partyAr: "المورد", numberEn: "Order No", numberAr: "رقم الأمر", sigs: [S("Purchasing", "المشتريات"), S("Approved by", "اعتماد")] },
  { kind: "purchase_invoice", layout: "items", en: "Tax Invoice — Purchases", ar: "فاتورة ضريبية — مشتريات", stage: "purchases", step: 2, accent: "#0B1F44", partyEn: "Supplier", partyAr: "المورد", numberEn: "Invoice No", numberAr: "رقم الفاتورة", sigs: [S("Prepared by", "أعدّه"), S("Storekeeper", "أمين المستودع")] },
  { kind: "payment_voucher", layout: "voucher", en: "Payment Voucher", ar: "سند صرف", stage: "purchases", step: 3, accent: "#dc2626", partyEn: "Paid to", partyAr: "صرفنا إلى", numberEn: "Voucher No", numberAr: "رقم السند", sigs: [S("Accountant", "المحاسب"), S("Receiver signature", "توقيع المستلم"), S("Approved by", "اعتماد")] },
  { kind: "purchase_return", layout: "items", en: "Debit Note — Purchase Return", ar: "إشعار مدين — مرتجع مشتريات", stage: "purchases", step: 4, accent: "#d97706", partyEn: "Supplier", partyAr: "المورد", numberEn: "Note No", numberAr: "رقم الإشعار", sigs: [S("Prepared by", "أعدّه"), S("Approved by", "اعتماد")] },
  { kind: "journal_voucher", layout: "journal", en: "Journal Voucher", ar: "قيد يومية", stage: "accounting", step: 1, accent: "#7c3aed", partyEn: "Reference", partyAr: "المرجع", numberEn: "Entry No", numberAr: "رقم القيد", sigs: [S("Prepared by", "أعدّه"), S("Reviewed by", "راجعه"), S("Approved by", "اعتماد")] },
];
export const metaOf = (k: DocKind): DocMeta => DOC_KINDS.find((m) => m.kind === k) as DocMeta;

export type DocItem = { description: string; code?: string | null; qty: number; price: number; total: number; discount?: number };
export type DocJLine = { account: string; debit: number; credit: number; note?: string | null };
export type DocData = {
  kind: DocKind; number: string | null; date: string; dueDate?: string | null; partyName?: string | null; partyTax?: string | null; partyPhone?: string | null;
  refs?: [string, string][]; items?: DocItem[]; lines?: DocJLine[];
  subtotal?: number; discount?: number; taxRate?: number; tax?: number; total: number; paid?: number; remaining?: number;
  method?: string | null; description?: string | null; notes?: string | null; currency: string; branchId?: number | null; draft?: boolean;
};

export function buildDocHTML(d: DocData, org: PrintOrg, ui: "ar" | "en", ppIn?: PrintPrefs): string {
  const pp = ppIn ?? loadPrintPrefs(browserStore(), d.branchId ?? null);
  const m = metaOf(d.kind); const { ar, bi, lang } = resolveDocLang(pp, ui); const T = makeT(pp, ui);
  const A = ar ? "right" : "left"; const Z = ar ? "left" : "right"; const dir = ar ? "rtl" : "ltr";
  const title = T(m.en, m.ar); const no = d.number ? esc(d.number) : esc(T("Preview — unposted", "معاينة — غير مرحّلة"));
  const th = (h: string): string => `<th style="border:1px solid #cbd5e1;padding:6px 8px;background:${m.accent};color:#fff;font-size:11px">${esc(h)}</th>`;
  const td = (v: string, al = "center", ltr = false): string => `<td style="border:1px solid #e5e7eb;padding:5px 8px;text-align:${al};font-size:12px;${ltr ? "direction:ltr;" : ""}">${v}</td>`;
  const trow = (label: string, val: string, bold = false): string => `<tr><td style="padding:3px 8px;text-align:${A};${bold ? "font-weight:800" : ""}">${esc(label)}</td><td style="padding:3px 8px;text-align:${Z};direction:ltr;${bold ? "font-weight:800" : ""}">${val}</td></tr>`;
  const meta = [`${esc(T(m.numberEn, m.numberAr))}: <b dir="ltr">${no}</b>`, `${esc(T("Date", "التاريخ"))}: <b dir="ltr">${esc(d.date)}</b>`, d.dueDate ? `${esc(T(d.kind === "quotation" ? "Valid until" : "Due date", d.kind === "quotation" ? "صالح حتى" : "تاريخ الاستحقاق"))}: <b dir="ltr">${esc(d.dueDate)}</b>` : "", ...(d.refs ?? []).map(([k, v]) => `${esc(k)}: <b>${esc(v)}</b>`)].filter(Boolean).join(" · ");
  const party = d.partyName ? `<div style="font-size:12px;margin:2px 0 8px">${esc(T(m.partyEn, m.partyAr))}: <b>${esc(d.partyName)}</b>${d.partyTax ? ` · ${esc(T("VAT No", "الرقم الضريبي"))}: <span dir="ltr">${esc(d.partyTax)}</span>` : ""}${d.partyPhone ? ` · <span dir="ltr">${esc(d.partyPhone)}</span>` : ""}</div>` : "";
  let body = "";
  if (m.layout === "items") {
    const items = d.items ?? []; const hasDisc = items.some((i) => (i.discount ?? 0) > 0);
    const rows = items.map((it, i) => `<tr>${td(String(i + 1))}${td(`${esc(it.description || "—")}${it.code ? `<div style="font-size:10px;color:#64748b;direction:ltr;text-align:${A}">${esc(it.code)}</div>` : ""}`, A)}${td(esc(it.qty), "center", true)}${td(money(it.price), "center", true)}${hasDisc ? td((it.discount ?? 0) > 0 ? money(it.discount ?? 0) : "—", "center", true) : ""}${td(money(it.total), "center", true)}</tr>`).join("");
    const heads = ["#", T("Item", "الصنف"), T("Qty", "الكمية"), T("Price", "السعر"), ...(hasDisc ? [T("Discount", "الخصم")] : []), T("Total", "الإجمالي")].map(th).join("");
    const rem = d.remaining ?? (d.paid != null ? Math.max(0, Math.round((d.total - d.paid) * 100) / 100) : null);
    body = `<table style="border-collapse:collapse;width:100%;margin-bottom:10px"><tr>${heads}</tr>${rows}</table>
    <table style="margin-${ar ? "right" : "left"}:auto;font-size:12px;min-width:250px">
      ${d.subtotal != null ? trow(T("Total before VAT", "الإجمالي قبل الضريبة"), money(d.subtotal)) : ""}
      ${(d.discount ?? 0) > 0 ? trow(T("Total discount", "إجمالي الخصم"), money(d.discount ?? 0)) : ""}
      ${d.tax != null ? trow(`${T("VAT", "الضريبة")}${d.taxRate != null ? ` (${d.taxRate}%)` : ""}`, money(d.tax)) : ""}
      ${trow(T("Total", "الإجمالي"), `${money(d.total)} ${esc(d.currency)}`, true)}
      ${d.paid != null ? trow(T("Paid", "المدفوع"), money(d.paid)) : ""}${rem != null ? trow(T("Remaining", "المتبقي"), money(rem), true) : ""}
    </table>`;
  } else if (m.layout === "voucher") {
    const rows: [string, string][] = [[T(m.partyEn, m.partyAr), esc(d.partyName || "—")], [T("Payment method", "طريقة الدفع"), esc(d.method || "—")], [T("Description", "البيان"), esc(d.description || "—")]];
    body = `<div style="border:2px solid ${m.accent};border-radius:10px;padding:14px 18px;margin:8px 0 14px;display:flex;justify-content:space-between;align-items:center"><span style="font-size:13px;color:#475569">${esc(T("Amount", "المبلغ"))}</span><b dir="ltr" style="font-size:26px;color:${m.accent}">${money(d.total)} ${esc(d.currency)}</b></div>
    <table style="width:100%;border-collapse:collapse">${rows.map(([k, v]) => `<tr><th style="width:30%;text-align:${A};background:#f1f5f9;border:1px solid #e2e8f0;padding:8px;font-size:12px">${esc(k)}</th><td style="border:1px solid #e2e8f0;padding:8px;font-size:12px;text-align:${A}">${v}</td></tr>`).join("")}</table>`;
  } else {
    const ls = d.lines ?? []; const dr = ls.reduce((a, l) => a + (Number(l.debit) || 0), 0); const cr = ls.reduce((a, l) => a + (Number(l.credit) || 0), 0);
    const rows = ls.map((l, i) => `<tr>${td(String(i + 1))}${td(`${esc(l.account)}${l.note ? `<div style="font-size:10px;color:#64748b">${esc(l.note)}</div>` : ""}`, A)}${td(l.debit ? money(l.debit) : "—", "center", true)}${td(l.credit ? money(l.credit) : "—", "center", true)}</tr>`).join("");
    body = `<table style="border-collapse:collapse;width:100%"><tr>${["#", T("Account", "الحساب"), T("Debit", "مدين"), T("Credit", "دائن")].map(th).join("")}</tr>${rows}
    <tr><td colspan="2" style="border:1px solid #e5e7eb;padding:6px 8px;font-weight:800;text-align:${A};font-size:12px">${esc(T("Total", "الإجمالي"))}${Math.abs(dr - cr) < 0.005 ? "" : ` — ${esc(T("UNBALANCED", "غير متوازن"))}`}</td>${td(`<b>${money(dr)}</b>`, "center", true)}${td(`<b>${money(cr)}</b>`, "center", true)}</tr></table>
    ${d.description ? `<p style="font-size:12px"><b>${esc(T("Description", "البيان"))}:</b> ${esc(d.description)}</p>` : ""}`;
  }
  const sigs = pp.showSignature || m.layout !== "items" ? `<div style="margin-top:40px;display:flex;justify-content:space-between;gap:16px">${m.sigs.map(([en, a]) => `<div style="flex:1;border-top:1px solid #64748b;padding-top:4px;font-size:11px;text-align:center">${esc(T(en, a))}</div>`).join("")}</div>` : "";
  return `<!doctype html><html lang="${lang}" dir="${dir}"><head><meta charset="utf-8"><title>${esc(title)} ${no}</title><style>${pageCss(pp)}</style></head>
<body style="font-family:'IBM Plex Sans Arabic','Montserrat','Segoe UI',Tahoma,sans-serif;padding:24px;color:#0f172a" data-doc="${d.kind}" data-bi="${bi ? "1" : "0"}">
${printHeaderHTML({ org, pp, ar, T })}
<div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:6px"><h2 style="font-size:17px;margin:0;color:${m.accent}">${esc(title)}</h2>${d.draft ? `<span style="font-size:11px;border:1px solid #f59e0b;color:#b45309;padding:2px 8px;border-radius:6px">${esc(T("DRAFT", "مسودة"))}</span>` : ""}</div>
<div style="font-size:12px;margin-bottom:6px">${meta}</div>${party}${body}
${d.notes ? `<p style="font-size:12px"><b>${esc(T("Notes", "ملاحظات"))}:</b> ${esc(d.notes)}</p>` : ""}${sigs}${printFooterHTML({ pp, T })}
</body></html>`;
}

/** بيانات تجريبية لمعاينة كل قالب. */
export function sampleDoc(kind: DocKind, ar: boolean, currency: string): DocData {
  const T = (en: string, a: string): string => (ar ? a : en);
  const items: DocItem[] = [{ description: T("Front brake pads", "فحمات فرامل أمامية"), code: "BRK-001", qty: 4, price: 120, total: 480 }, { description: T("Engine oil 5W-30", "زيت محرك 5W-30"), code: "OIL-530", qty: 6, price: 65, total: 390 }];
  const base = { kind, number: "2026-0001", date: new Date().toISOString().slice(0, 10), currency, partyName: T("Sample party", "جهة تجريبية"), partyTax: "300000000000003" };
  const m = metaOf(kind);
  if (m.layout === "items") { const sub = 870; const tax = 130.5; return { ...base, items, subtotal: sub, taxRate: 15, tax, total: sub + tax, ...(kind === "sales_invoice" || kind === "purchase_invoice" ? { paid: 500 } : {}), dueDate: kind === "quotation" ? new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10) : null, notes: T("Sample document for preview only.", "مستند تجريبي للمعاينة فقط.") }; }
  if (m.layout === "voucher") return { ...base, total: 1500, method: T("Bank transfer", "تحويل بنكي"), description: T("Payment against invoice 2026-0001", "دفعة مقابل فاتورة 2026-0001") };
  return { ...base, total: 1000, description: T("Sample journal entry", "قيد يومية تجريبي"), lines: [{ account: "1101 · " + T("Cash", "الصندوق"), debit: 1000, credit: 0 }, { account: "4100 · " + T("Sales revenue", "إيراد المبيعات"), debit: 0, credit: 1000 }] };
}
