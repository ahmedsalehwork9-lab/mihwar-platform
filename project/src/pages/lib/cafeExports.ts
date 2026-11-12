// =============================================================
// src/pages/lib/cafeExports.ts
// موديول تصدير مستقل (بدون React) — يُستدعى من «مركز التقارير» لسحب أي
// تقرير بفترة محددة وتصديره PDF/Excel بنفس شكل صفحة التقرير الأصلية.
// لا يُعدّل أي صفحة قائمة — يعيد استخدام نفس منطق البناء فقط.
// =============================================================

import { supabase } from "./supabase";
import { fetchSalesWithMigration } from "./cafeDb";
import { logoBox, contactFooter, waQrDataUrl, SUPPORT_WA } from "./reportChrome";

export type ExportMode = "pdf" | "excel";
export type ExportResult = { ok: boolean; rows: number; msg?: string };

const VAT_RATE = 15;
const fmt = (n: number) =>
  (Math.round(n * 100) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 });
const netOf = (gross: number) => gross / (1 + VAT_RATE / 100);

type Channel = { id: string; icon: string; nm: string; base?: boolean; sign?: number };
const CHANNEL_CATALOG: Channel[] = [
  { id: "cash",   icon: "💵", nm: "نقدي", base: true },
  { id: "net",    icon: "💳", nm: "شبكة (مدى)", base: true },
  { id: "keeta",  icon: "🛵", nm: "كيتا" },
  { id: "hunger", icon: "🛵", nm: "هنقرستيشن" },
  { id: "jahez",  icon: "🛵", nm: "جاهز" },
  { id: "trans",  icon: "🏦", nm: "تحويل بنكي" },
  { id: "refund", icon: "↩️", nm: "مرتجع (−)", sign: -1 },
];

type SalesEntry = {
  date: string; channels?: string[]; customChannels?: Channel[];
  gSys: number; gAct: number; net: number; err: number;
  perChannelActual: Record<string, number>; note?: string;
};

// ── جلب بيانات الفرع (الاسم + اللوجو) ──
async function shopInfo(branchId: number | null): Promise<{ branch: string; logoUrl: string | null }> {
  if (!branchId) return { branch: "", logoUrl: null };
  const { data } = await supabase.from("shops").select("shop_name, logo_url").eq("id", branchId).single();
  return { branch: (data as any)?.shop_name ?? "", logoUrl: (data as any)?.logo_url ?? null };
}

// ── فتح نافذة طباعة (PDF) أو تنزيل Excel ──
function emit(mode: ExportMode, title: string, filename: string, html: string) {
  if (mode === "pdf") {
    const w = window.open("", "_blank", "width=1000,height=900");
    if (!w) { alert("فضلًا اسمح بالنوافذ المنبثقة (pop-ups) لتصدير الـ PDF."); return; }
    w.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>${title}</title></head><body>${html}<script>window.onload=function(){window.print();}<\/script></body></html>`);
    w.document.close();
  } else {
    const x = `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"></head><body>${html}</body></html>`;
    const blob = new Blob(["﻿" + x], { type: "application/vnd.ms-excel;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename + ".xls";
    a.click();
    URL.revokeObjectURL(a.href);
  }
}

// ========================= تسوية المبيعات =========================
function buildSalesHTML(
  rows: SalesEntry[],
  ctx: { branch: string; logoUrl: string | null; qr: string; from: string; to: string },
): string {
  const { branch, logoUrl, qr, from, to } = ctx;
  const n = rows.length;
  const used = new Set<string>(); rows.forEach((e) => (e.channels || []).forEach((c) => used.add(c)));
  const customMap = new Map<string, Channel>();
  rows.forEach((e) => (e.customChannels ?? []).forEach((c) => customMap.set(c.id, c)));
  const cols = [...CHANNEL_CATALOG, ...customMap.values()].filter((c) => used.has(c.id));

  const acts = rows.map((e) => e.gAct);
  const max = acts.length ? Math.max(...acts) : 0;
  const min = acts.length ? Math.min(...acts) : 0;
  const avg = acts.length ? acts.reduce((s, v) => s + v, 0) / acts.length : 0;

  const grandActual = rows.reduce((s, e) => s + e.gAct, 0);
  const grandSystem = rows.reduce((s, e) => s + e.gSys, 0);
  const grandDiff = grandActual - grandSystem;
  const grandErr = grandSystem !== 0 ? (grandDiff / grandSystem) * 100 : 0;
  const grandBefore = netOf(grandActual);
  const grandVat = grandActual - grandBefore;
  const colTotals: Record<string, number> = {};
  cols.forEach((c) => { colTotals[c.id] = rows.reduce((s, e) => s + (e.perChannelActual[c.id] || 0), 0); });
  const pct = (v: number) => (grandActual > 0 ? (v / grandActual) * 100 : 0);
  const now = new Date().toLocaleString("ar-SA");

  const card = (label: string, value: string, green = false) =>
    `<div style="flex:1;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:10px 14px;">
       <div style="font-size:10px;color:#6b7280;font-weight:700;">${label}</div>
       <div style="font-size:17px;font-weight:800;margin-top:3px;color:${green ? "#15a06a" : "#111827"};">${value}</div>
     </div>`;

  const header = `
    <div style="background:#0f1b2b;padding:16px 20px;display:flex;justify-content:space-between;align-items:center;">
      <div style="text-align:left;">
        <div style="font-size:20px;font-weight:800;color:#34d399;">تقرير تسوية المبيعات</div>
        <div style="font-size:12px;color:#9fb3c8;">الفترة: ${from} إلى ${to} — ${now}</div>
      </div>
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="text-align:right;">
          <div style="font-size:18px;font-weight:800;color:#ffffff;">محور</div>
          <div style="font-size:9px;letter-spacing:3px;color:#9fb3c8;">MIHWAR PLATFORM</div>
        </div>
        ${logoBox(logoUrl)}
      </div>
    </div>`;

  const cards = `
    <div style="display:flex;gap:10px;padding:14px 20px;background:#f8fafc;">
      ${card("الفرع", branch || "—")}
      ${card("عدد الأيام", String(n))}
      ${card("الإجمالي قبل الضريبة", fmt(grandBefore) + " ر.س")}
      ${card("ضريبة القيمة المضافة", fmt(grandVat) + " ر.س")}
      ${card("شامل الضريبة", fmt(grandActual) + " ر.س", true)}
    </div>`;

  const ths = ["التاريخ", ...cols.map((c) => c.nm), "الفعلي", "السيستم", "الفرق", "قبل الضريبة", "الضريبة", "شامل الضريبة", "الخطأ %", "الحالة", "ملاحظات"];
  const thead = `<tr>${ths.map((h) => `<th style="border:1px solid #d1d5db;padding:7px 8px;background:#14304d;color:#fff;font-size:11px;font-weight:700;white-space:nowrap;">${h}</th>`).join("")}</tr>`;

  const body = rows.map((e, idx) => {
    const warn = Math.abs(e.err) > 5;
    const bg = idx % 2 ? "#ffffff" : "#f9fafb";
    const before = netOf(e.gAct);
    const vat = e.gAct - before;
    const cells = [
      e.date,
      ...cols.map((c) => (e.perChannelActual[c.id] ? fmt(e.perChannelActual[c.id]) : "—")),
      `<b style="color:#15a06a;">${fmt(e.gAct)}</b>`,
      fmt(e.gSys),
      (e.net > 0 ? "+" : "") + fmt(e.net),
      fmt(before),
      `<span style="color:#b45309;">${fmt(vat)}</span>`,
      `<b style="color:#0f1b2b;">${fmt(e.gAct)}</b>`,
      (e.err > 0 ? "+" : "") + e.err.toFixed(1) + "%",
      warn ? "⚠️ مراجعة" : "OK",
      (e.note || "").replace(/</g, "&lt;"),
    ];
    return `<tr style="background:${bg};">${cells.map((v, i) =>
      `<td style="border:1px solid #e5e7eb;padding:5px 8px;font-size:11px;text-align:${i === cells.length - 1 ? "right" : "center"};">${v}</td>`
    ).join("")}</tr>`;
  }).join("");

  const totalCells = ["الإجمالي", ...cols.map((c) => fmt(colTotals[c.id])), fmt(grandActual), fmt(grandSystem),
    (grandDiff > 0 ? "+" : "") + fmt(grandDiff), fmt(grandBefore), fmt(grandVat), fmt(grandActual),
    (grandErr > 0 ? "+" : "") + grandErr.toFixed(1) + "%", "", ""];
  const totalRow = `<tr>${totalCells.map((v, i) =>
    `<td style="border:1px solid #cbd5e1;padding:6px 8px;font-size:11px;font-weight:800;text-align:${i === 0 ? "right" : "center"};background:#eef2f7;color:#0f1b2b;">${v}</td>`
  ).join("")}</tr>`;

  const pctCells = ["نسبة القناة %", ...cols.map((c) => pct(colTotals[c.id]).toFixed(1) + "%"), "100%", "", "", "", "", "", "", ""];
  const pctRow = `<tr>${pctCells.map((v, i) =>
    `<td style="border:1px solid #cbd5e1;padding:6px 8px;font-size:11px;font-weight:800;text-align:${i === 0 ? "right" : "center"};background:#15a06a;color:#ffffff;">${v}</td>`
  ).join("")}</tr>`;

  const table = `
    <div style="padding:6px 20px 14px;">
      <table style="border-collapse:collapse;width:100%;">
        <thead>${thead}</thead>
        <tbody>${body}${totalRow}${pctRow}</tbody>
      </table>
      <div style="margin-top:10px;font-size:11px;color:#374151;">
        أعلى يوم: <b style="color:#15a06a;">${fmt(max)}</b> · المتوسط: <b>${fmt(avg)}</b> · أقل يوم: <b style="color:#dc2626;">${fmt(min)}</b> · عدد الأيام: <b>${n}</b>
      </div>
      <div style="margin-top:4px;font-size:10px;color:#9ca3af;">«شامل الضريبة» = التحصيل الفعلي · «قبل الضريبة» = الفعلي ÷ ${(1 + VAT_RATE / 100).toFixed(2)} · الضريبة ${VAT_RATE}%</div>
    </div>`;

  const footer = `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 20px;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:10px;gap:12px;">
      <div><div>تم إنشاء هذا التقرير آليًا من مركز التقارير</div><div>منصة محور — MIHWAR B2B Marketplace</div></div>
      ${contactFooter(SUPPORT_WA, qr)}
    </div>`;

  return `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;color:#1f2937;background:#fff;">${header}${cards}${table}${footer}</div>`;
}

export async function exportSalesReport(
  branchId: number | null, from: string, to: string, mode: ExportMode,
): Promise<ExportResult> {
  const allRows = (await fetchSalesWithMigration(branchId)) as SalesEntry[];
  const rows = allRows.filter((e) => e.date >= from && e.date <= to).sort((a, b) => a.date.localeCompare(b.date));
  if (!rows.length) return { ok: false, rows: 0, msg: "لا توجد تسويات محفوظة ضمن هذه الفترة." };
  const { branch, logoUrl } = await shopInfo(branchId);
  const qr = await waQrDataUrl(SUPPORT_WA);
  const html = buildSalesHTML(rows, { branch, logoUrl, qr, from, to });
  emit(mode, `تقرير تسوية — ${branch}`, `تسوية_${branch || "فرع"}_${from}_${to}`, html);
  return { ok: true, rows: rows.length };
}

// ── سجلّ المصدّرات المتاحة (يُوسَّع تِباعًا بباقي التقارير) ──
export const EXPORTERS: Record<string, (b: number | null, f: string, t: string, m: ExportMode) => Promise<ExportResult>> = {
  "sales-reconciliation": exportSalesReport,
};
