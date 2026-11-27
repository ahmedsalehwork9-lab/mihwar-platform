// =============================================================
// src/pages/reports/reportsOut.ts
// مخرجات التقارير: تصدير Excel متعدد الأوراق (RTL حسب اللغة) + طباعة موحّدة بترويسة المؤسسة
// عبر نفس مولّد «القوائم المالية» (buildReportHTML) وإطار الطباعة الصامت (بلا نوافذ منبثقة).
// =============================================================
import * as XLSX from "xlsx";
import { buildReportHTML, type Cell } from "../accounting/shared/printReport";
import { fetchPrintOrg } from "../sales/salesInvoiceApi";
import { printHTML } from "../sales/salesInvoicePrint";

export type Sheet = { name: string; cols: string[]; rows: (string | number | null)[][] };
const safeSheet = (n: string, used: Set<string>): string => {
  let base = (n || "Sheet").replace(/[\\/?*[\]:]/g, " ").trim().slice(0, 28) || "Sheet"; let k = base, i = 2;
  while (used.has(k.toLowerCase())) k = `${base.slice(0, 26)} ${i++}`; used.add(k.toLowerCase()); return k;
};
/** تصدير مصنّف Excel من أوراق عدة؛ الأرقام تبقى أرقامًا قابلة للحساب. */
export function exportBook(fileName: string, sheets: Sheet[], rtl: boolean): void {
  const wb = XLSX.utils.book_new(); (wb as unknown as { Workbook: unknown }).Workbook = { Views: [{ RTL: rtl }] };
  const used = new Set<string>();
  for (const s of sheets) {
    const ws = XLSX.utils.aoa_to_sheet([s.cols, ...s.rows] as (string | number | null)[][]);
    ws["!cols"] = s.cols.map((c, i) => ({ wch: Math.min(48, Math.max(String(c).length + 2, ...s.rows.slice(0, 200).map((r) => String(r[i] ?? "").length + 2), 10)) }));
    XLSX.utils.book_append_sheet(wb, ws, safeSheet(s.name, used));
  }
  XLSX.writeFile(wb, fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`);
}

export type PrintSpec = { title: string; subtitle?: string; cols: { label: string; num?: boolean }[]; rows: Cell[][]; note?: string | null; sectionRows?: number[] };
export type PrintCtx = { orgId: number; shopId: number | null; orgName: string; lang: "ar" | "en" };
/** يبني HTML التقرير بترويسة المؤسسة (الاسم/الرقم الضريبي/الشعار/العنوان) — دالة قابلة للاختبار. */
export function buildReportDoc(spec: PrintSpec, org: { name?: string | null; tax_number?: string | null; logo_url?: string | null; address?: string | null } | null, ctx: PrintCtx): string {
  return buildReportHTML({
    title: spec.title, subtitle: spec.subtitle, orgName: org?.name || ctx.orgName, taxNumber: org?.tax_number ?? null, logoUrl: org?.logo_url ?? null, address: org?.address ?? null,
    dir: ctx.lang === "ar" ? "rtl" : "ltr", lang: ctx.lang, note: spec.note ?? null, sectionRows: spec.sectionRows,
    cols: spec.cols.map((c) => ({ label: c.label, align: c.num ? "end" : "start", ltr: c.num })), rows: spec.rows,
  });
}
export async function printReportDoc(spec: PrintSpec, ctx: PrintCtx): Promise<void> {
  const org = await fetchPrintOrg(ctx.orgId, ctx.shopId).catch(() => null);
  printHTML(buildReportDoc(spec, org, ctx));
}
export const stamp = (): string => new Date().toISOString().slice(0, 10);
