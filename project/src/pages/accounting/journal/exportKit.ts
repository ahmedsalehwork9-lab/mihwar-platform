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
