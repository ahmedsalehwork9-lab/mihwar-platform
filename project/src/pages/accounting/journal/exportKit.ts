// =============================================================
// src/pages/accounting/journal/exportKit.ts — تصدير Excel (RTL حسب اللغة) وطباعة موحّدة لجداول مركز القيود.
// =============================================================
import * as XLSX from "xlsx";
import { buildReportHTML, openPrint, type Cell, type ReportCol } from "../shared/printReport";

export type TableSpec = { title: string; subtitle?: string; cols: { label: string; num?: boolean }[]; rows: Cell[][]; totals?: Cell[] | null };
export function exportXlsx(fileName: string, spec: TableSpec, rtl: boolean): void {
  const aoa: Cell[][] = [spec.cols.map((c) => c.label), ...spec.rows]; if (spec.totals) aoa.push(spec.totals);
  const ws = XLSX.utils.aoa_to_sheet(aoa as (string | number | null)[][]); ws["!cols"] = spec.cols.map((c, i) => ({ wch: Math.min(48, Math.max(c.label.length + 2, ...spec.rows.slice(0, 200).map((r) => String(r[i] ?? "").length + 2), 10)) }));
  const wb = XLSX.utils.book_new(); (wb as unknown as { Workbook: unknown }).Workbook = { Views: [{ RTL: rtl }] };
  XLSX.utils.book_append_sheet(wb, ws, spec.title.slice(0, 31).replace(/[\\/?*[\]:]/g, " ")); XLSX.writeFile(wb, fileName.endsWith(".xlsx") ? fileName : fileName + ".xlsx");
}
export function printTable(spec: TableSpec, o: { orgName: string; taxNumber?: string | null; logoUrl?: string | null; address?: string | null; dir: "rtl" | "ltr"; lang: "ar" | "en" }): boolean {
  const cols: ReportCol[] = spec.cols.map((c) => ({ label: c.label, align: c.num ? "end" : "start", ltr: c.num }));
  return openPrint(buildReportHTML({ title: spec.title, subtitle: spec.subtitle, orgName: o.orgName, taxNumber: o.taxNumber, logoUrl: o.logoUrl, address: o.address, dir: o.dir, lang: o.lang, cols, rows: spec.rows, totals: spec.totals ?? null }));
}

// ─────────────────────────────────────────────────────────────
// تحويل جداول HTML (نفس محتوى تقرير الطباعة) إلى ملف .xlsx حقيقي:
// كل جدول → ورقة، الأرقام المنسّقة («1,234.50») تتحوّل لأرقام فعلية، والنسب والنصوص تبقى نصوصًا.
// ─────────────────────────────────────────────────────────────
const AR_DIGITS = /[٠-٩۰-۹]/g;
const toLatinDigits = (s: string): string => s.replace(AR_DIGITS, (d) => String(d.charCodeAt(0) >= 0x06f0 ? d.charCodeAt(0) - 0x06f0 : d.charCodeAt(0) - 0x0660)).replace(/\u066c/g, ",").replace(/\u066b/g, ".");
const NUM_RE = /^[+-]?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?$/;
export function parseCellText(raw: string): string | number {
  const s = toLatinDigits(raw.replace(/\s+/g, " ").trim());
  return NUM_RE.test(s) ? Number(s.replace(/,/g, "")) : s;
}
const safeSheetName = (s: string, used: Set<string>, i: number): string => {
  let n = (s || `Sheet ${i + 1}`).replace(/[\\/?*[\]:]/g, " ").replace(/\s+/g, " ").trim().slice(0, 31) || `Sheet ${i + 1}`;
  let k = 2; const base = n;
  while (used.has(n.toLowerCase())) { n = `${base.slice(0, 28)} ${k++}`; }
  used.add(n.toLowerCase()); return n;
};
/** يصدّر كل <table> في html كورقة. meta = أسطر عنوان فوق كل ورقة (العنوان/الفترة/الفرع). يعيد عدد الأوراق (0 = لا جداول). */
export function exportHtmlTablesXlsx(fileName: string, html: string, o: { rtl: boolean; meta?: string[]; sheetNames?: string[] }): number {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const tables = Array.from(doc.querySelectorAll("table"));
  if (!tables.length) return 0;
  const wb = XLSX.utils.book_new(); (wb as unknown as { Workbook: unknown }).Workbook = { Views: [{ RTL: o.rtl }] };
  const used = new Set<string>();
  tables.forEach((tb, ti) => {
    const aoa: (string | number)[][] = (o.meta || []).map((m) => [m]); if (aoa.length) aoa.push([]);
    let width = 1;
    tb.querySelectorAll("tr").forEach((tr) => {
      const row: (string | number)[] = [];
      tr.querySelectorAll("th,td").forEach((c) => { row.push(parseCellText(c.textContent || "")); const span = Number(c.getAttribute("colspan")) || 1; for (let k = 1; k < span; k++) row.push(""); });
      if (row.some((v) => v !== "")) { aoa.push(row); width = Math.max(width, row.length); }
    });
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = Array.from({ length: width }, (_, ci) => ({ wch: Math.min(48, Math.max(10, ...aoa.slice(0, 200).map((r) => String(r[ci] ?? "").length + 2))) }));
    const prev = (tb.previousElementSibling?.textContent || "").replace(/\s+/g, " ").trim();
    XLSX.utils.book_append_sheet(wb, ws, safeSheetName(prev && prev.length <= 40 ? prev : (o.sheetNames?.[ti] ?? ""), used, ti));
  });
  XLSX.writeFile(wb, fileName.endsWith(".xlsx") ? fileName : fileName + ".xlsx");
  return tables.length;
}
