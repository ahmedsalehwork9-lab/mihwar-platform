// =============================================================
// src/pages/accounting/shared/printReport.ts
// طباعة تقارير جدولية موحّدة (نفس مظهر القوائم المالية): ترويسة المؤسسة + عنوان + جدول + إجماليات.
// buildReportHTML دالة نقية قابلة للاختبار؛ openPrint تفتح نافذة الطباعة.
// =============================================================
export type ReportCol = { label: string; align?: "start" | "end" | "center"; mono?: boolean; ltr?: boolean };
export type Cell = string | number | null | undefined;
export type ReportOpts = {
  title: string; subtitle?: string; orgName: string; taxNumber?: string | null; logoUrl?: string | null; address?: string | null;
  dir: "rtl" | "ltr"; cols: ReportCol[]; rows: Cell[][]; totals?: Cell[] | null; note?: string | null; lang?: "ar" | "en";
  /** فهارس صفوف تُعرض كعناوين أقسام تمتد على كل الأعمدة (الخلية الأولى فقط). */
  sectionRows?: number[];
};

export const esc = (s: unknown): string => String(s ?? "").replace(/[&<>"]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&quot;"));
export const fmtNum = (n: number): string => (Math.round(n * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cellText = (c: Cell): string => (typeof c === "number" ? fmtNum(c) : esc(c ?? ""));

export function buildReportHTML(o: ReportOpts): string {
  const sec = new Set(o.sectionRows || []);
  const th = (c: ReportCol) => `<th style="background:#14304d;color:#fff;padding:6px 8px;font-size:11px;text-align:${c.align === "end" ? "end" : c.align === "center" ? "center" : "start"}">${esc(c.label)}</th>`;
  const td = (v: Cell, c: ReportCol, strong = false) => {
    const isNum = typeof v === "number"; const align = c.align ?? (isNum ? "end" : "start");
    const ltr = c.ltr || isNum || c.mono;
    return `<td style="border:1px solid #e5e7eb;padding:5px 8px;font-size:11px;text-align:${align === "end" ? "end" : align === "center" ? "center" : "start"};${ltr ? "direction:ltr;unicode-bidi:plaintext;" : ""}${isNum || c.mono ? "font-variant-numeric:tabular-nums;" : ""}${strong ? "font-weight:800;background:#f8fafc;" : ""}">${cellText(v)}</td>`;
  };
  const body = o.rows.map((r, i) => sec.has(i)
    ? `<tr><td colspan="${o.cols.length}" style="background:#e8eef5;padding:6px 8px;font-weight:800;font-size:12px">${cellText(r[0])}</td></tr>`
    : `<tr>${o.cols.map((c, k) => td(r[k], c)).join("")}</tr>`).join("");
  const foot = o.totals ? `<tr>${o.cols.map((c, k) => td(o.totals![k], c, true)).join("")}</tr>` : "";
  const logo = o.logoUrl ? `<img src="${esc(o.logoUrl)}" style="height:54px;object-fit:contain"/>` : "";
  const vat = o.taxNumber ? `<div style="font-size:12px">${o.lang === "en" ? "VAT no." : "الرقم الضريبي"}: ${esc(o.taxNumber)}</div>` : "";
  return `<html dir="${o.dir}"><head><meta charset="UTF-8"><title>${esc(o.title)}</title><style>@page{size:A4 landscape;margin:12mm}body{font-family:'Segoe UI',Tahoma,sans-serif;padding:20px;color:#0f172a}table{border-collapse:collapse;width:100%}thead{display:table-header-group}tr{page-break-inside:avoid}</style></head><body>
<div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #14304d;padding-bottom:10px;margin-bottom:14px"><div><div style="font-size:19px;font-weight:800">${esc(o.orgName)}</div>${vat}${o.address ? `<div style="font-size:12px;color:#475569">${esc(o.address)}</div>` : ""}</div>${logo}</div>
<h2 style="font-size:15px;margin:0 0 4px">${esc(o.title)}</h2>${o.subtitle ? `<div style="font-size:12px;color:#475569;margin-bottom:10px">${esc(o.subtitle)}</div>` : ""}
<table><thead><tr>${o.cols.map(th).join("")}</tr></thead><tbody>${body}${foot}</tbody></table>${o.note ? `<div style="margin-top:12px;font-size:11px;color:#64748b">${esc(o.note)}</div>` : ""}</body></html>`;
}

/** تفتح نافذة الطباعة. تُرجع false عند حجب النوافذ المنبثقة. */
export function openPrint(html: string): boolean {
  const w = window.open("", "_blank"); if (!w) return false;
  w.document.write(html); w.document.close(); w.focus(); setTimeout(() => w.print(), 300); return true;
}
