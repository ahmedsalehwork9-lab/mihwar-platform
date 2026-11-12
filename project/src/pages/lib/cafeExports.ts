// =============================================================
// src/pages/lib/cafeExports.ts
// موديول تصدير مستقل (بدون React) — يُستدعى من «مركز التقارير» لسحب أي
// تقرير بفترة محددة وتصديره PDF/Excel بنفس شكل صفحة التقرير الأصلية.
// لا يُعدّل أي صفحة قائمة — يعيد استخدام نفس منطق البناء فقط.
// =============================================================

import { supabase } from "./supabase";
import {
  fetchSalesWithMigration, fetchPurchasesWithMigration,
  getSettingWithMigration, SETTING_KEYS, LOCAL_KEYS,
} from "./cafeDb";
import { logoBox, contactFooter, waQrDataUrl, SUPPORT_WA } from "./reportChrome";

export type ExportMode = "pdf" | "excel";
export type ExportResult = { ok: boolean; rows: number; msg?: string };

const VAT_RATE = 15;
const VAT_DIV = 1.15;
const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 });
const fmt2 = (n: number) => (Math.round(n * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt0 = (n: number) => Math.round(n).toLocaleString("en-US");
const num = (v: any) => parseFloat(v) || 0;
const netOf = (gross: number) => gross / (1 + VAT_RATE / 100);
const normName = (s: string) => (s || "").trim().replace(/\s+/g, " ").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/[ً-ْ]/g, "").toLowerCase();

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

// ── جلب بيانات الفرع (الاسم + اللوجو) ──
async function shopInfo(branchId: number | null): Promise<{ branch: string; logoUrl: string | null }> {
  if (!branchId) return { branch: "", logoUrl: null };
  const { data } = await supabase.from("shops").select("shop_name, logo_url").eq("id", branchId).single();
  return { branch: (data as any)?.shop_name ?? "", logoUrl: (data as any)?.logo_url ?? null };
}
async function fetchOrders(branchId: number | null): Promise<any[]> {
  if (!branchId) return [];
  const { data } = await supabase.from("orders")
    .select("id, from_shop_id, to_shop_id, status, total_amount, created_at")
    .or(`from_shop_id.eq.${branchId},to_shop_id.eq.${branchId}`);
  return data || [];
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
const SHELL = (header: string, body: string) =>
  `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;color:#1f2937;background:#fff;">${header}${body}</div>`;

// ========================= 1) تسوية المبيعات =========================
type SalesEntry = { date: string; channels?: string[]; customChannels?: Channel[]; gSys: number; gAct: number; net: number; err: number; perChannelActual: Record<string, number>; note?: string };

function buildSalesHTML(rows: SalesEntry[], ctx: { branch: string; logoUrl: string | null; qr: string; from: string; to: string }): string {
  const { branch, logoUrl, qr, from, to } = ctx;
  const n = rows.length;
  const used = new Set<string>(); rows.forEach((e) => (e.channels || []).forEach((c) => used.add(c)));
  const customMap = new Map<string, Channel>(); rows.forEach((e) => (e.customChannels ?? []).forEach((c) => customMap.set(c.id, c)));
  const cols = [...CHANNEL_CATALOG, ...customMap.values()].filter((c) => used.has(c.id));
  const acts = rows.map((e) => e.gAct);
  const max = acts.length ? Math.max(...acts) : 0, min = acts.length ? Math.min(...acts) : 0, avg = acts.length ? acts.reduce((s, v) => s + v, 0) / acts.length : 0;
  const grandActual = rows.reduce((s, e) => s + e.gAct, 0);
  const grandSystem = rows.reduce((s, e) => s + e.gSys, 0);
  const grandDiff = grandActual - grandSystem;
  const grandErr = grandSystem !== 0 ? (grandDiff / grandSystem) * 100 : 0;
  const grandBefore = netOf(grandActual), grandVat = grandActual - grandBefore;
  const colTotals: Record<string, number> = {}; cols.forEach((c) => { colTotals[c.id] = rows.reduce((s, e) => s + (e.perChannelActual[c.id] || 0), 0); });
  const pct = (v: number) => (grandActual > 0 ? (v / grandActual) * 100 : 0);
  const now = new Date().toLocaleString("ar-SA");

  const card = (label: string, value: string, green = false) =>
    `<div style="flex:1;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:10px 14px;"><div style="font-size:10px;color:#6b7280;font-weight:700;">${label}</div><div style="font-size:17px;font-weight:800;margin-top:3px;color:${green ? "#15a06a" : "#111827"};">${value}</div></div>`;
  const header = `<div style="background:#0f1b2b;padding:16px 20px;display:flex;justify-content:space-between;align-items:center;"><div style="text-align:left;"><div style="font-size:20px;font-weight:800;color:#34d399;">تقرير تسوية المبيعات</div><div style="font-size:12px;color:#9fb3c8;">الفترة: ${from} إلى ${to} — ${now}</div></div><div style="display:flex;align-items:center;gap:10px;"><div style="text-align:right;"><div style="font-size:18px;font-weight:800;color:#ffffff;">محور</div><div style="font-size:9px;letter-spacing:3px;color:#9fb3c8;">MIHWAR PLATFORM</div></div>${logoBox(logoUrl)}</div></div>`;
  const cards = `<div style="display:flex;gap:10px;padding:14px 20px;background:#f8fafc;">${card("الفرع", branch || "—")}${card("عدد الأيام", String(n))}${card("الإجمالي قبل الضريبة", fmt(grandBefore) + " ر.س")}${card("ضريبة القيمة المضافة", fmt(grandVat) + " ر.س")}${card("شامل الضريبة", fmt(grandActual) + " ر.س", true)}</div>`;
  const ths = ["التاريخ", ...cols.map((c) => c.nm), "الفعلي", "السيستم", "الفرق", "قبل الضريبة", "الضريبة", "شامل الضريبة", "الخطأ %", "الحالة", "ملاحظات"];
  const thead = `<tr>${ths.map((h) => `<th style="border:1px solid #d1d5db;padding:7px 8px;background:#14304d;color:#fff;font-size:11px;font-weight:700;white-space:nowrap;">${h}</th>`).join("")}</tr>`;
  const body = rows.map((e, idx) => {
    const warn = Math.abs(e.err) > 5, bg = idx % 2 ? "#ffffff" : "#f9fafb", before = netOf(e.gAct), vat = e.gAct - before;
    const cells = [e.date, ...cols.map((c) => (e.perChannelActual[c.id] ? fmt(e.perChannelActual[c.id]) : "—")), `<b style="color:#15a06a;">${fmt(e.gAct)}</b>`, fmt(e.gSys), (e.net > 0 ? "+" : "") + fmt(e.net), fmt(before), `<span style="color:#b45309;">${fmt(vat)}</span>`, `<b style="color:#0f1b2b;">${fmt(e.gAct)}</b>`, (e.err > 0 ? "+" : "") + e.err.toFixed(1) + "%", warn ? "⚠️ مراجعة" : "OK", (e.note || "").replace(/</g, "&lt;")];
    return `<tr style="background:${bg};">${cells.map((v, i) => `<td style="border:1px solid #e5e7eb;padding:5px 8px;font-size:11px;text-align:${i === cells.length - 1 ? "right" : "center"};">${v}</td>`).join("")}</tr>`;
  }).join("");
  const totalCells = ["الإجمالي", ...cols.map((c) => fmt(colTotals[c.id])), fmt(grandActual), fmt(grandSystem), (grandDiff > 0 ? "+" : "") + fmt(grandDiff), fmt(grandBefore), fmt(grandVat), fmt(grandActual), (grandErr > 0 ? "+" : "") + grandErr.toFixed(1) + "%", "", ""];
  const totalRow = `<tr>${totalCells.map((v, i) => `<td style="border:1px solid #cbd5e1;padding:6px 8px;font-size:11px;font-weight:800;text-align:${i === 0 ? "right" : "center"};background:#eef2f7;color:#0f1b2b;">${v}</td>`).join("")}</tr>`;
  const pctCells = ["نسبة القناة %", ...cols.map((c) => pct(colTotals[c.id]).toFixed(1) + "%"), "100%", "", "", "", "", "", "", ""];
  const pctRow = `<tr>${pctCells.map((v, i) => `<td style="border:1px solid #cbd5e1;padding:6px 8px;font-size:11px;font-weight:800;text-align:${i === 0 ? "right" : "center"};background:#15a06a;color:#ffffff;">${v}</td>`).join("")}</tr>`;
  const table = `<div style="padding:6px 20px 14px;"><table style="border-collapse:collapse;width:100%;"><thead>${thead}</thead><tbody>${body}${totalRow}${pctRow}</tbody></table><div style="margin-top:10px;font-size:11px;color:#374151;">أعلى يوم: <b style="color:#15a06a;">${fmt(max)}</b> · المتوسط: <b>${fmt(avg)}</b> · أقل يوم: <b style="color:#dc2626;">${fmt(min)}</b> · عدد الأيام: <b>${n}</b></div><div style="margin-top:4px;font-size:10px;color:#9ca3af;">«شامل الضريبة» = التحصيل الفعلي · «قبل الضريبة» = الفعلي ÷ ${(1 + VAT_RATE / 100).toFixed(2)} · الضريبة ${VAT_RATE}%</div></div>`;
  const footer = `<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 20px;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:10px;gap:12px;"><div><div>تم إنشاء هذا التقرير آليًا من مركز التقارير</div><div>منصة محور — MIHWAR B2B Marketplace</div></div>${contactFooter(SUPPORT_WA, qr)}</div>`;
  return SHELL(header, `${cards}${table}${footer}`);
}

export async function exportSalesReport(branchId: number | null, from: string, to: string, mode: ExportMode): Promise<ExportResult> {
  const allRows = (await fetchSalesWithMigration(branchId)) as SalesEntry[];
  const rows = allRows.filter((e) => e.date >= from && e.date <= to).sort((a, b) => a.date.localeCompare(b.date));
  if (!rows.length) return { ok: false, rows: 0, msg: "لا توجد تسويات محفوظة ضمن هذه الفترة." };
  const { branch, logoUrl } = await shopInfo(branchId);
  const qr = await waQrDataUrl(SUPPORT_WA);
  emit(mode, `تقرير تسوية — ${branch}`, `تسوية_${branch || "فرع"}_${from}_${to}`, buildSalesHTML(rows, { branch, logoUrl, qr, from, to }));
  return { ok: true, rows: rows.length };
}

// ========================= 2) المشتريات =========================
type PItem = { name: string; category: string; qty: string; unit: string; price: string };
type Purchase = { id: string; date: string; supplier: string; invoiceNo: string; payment: string; note: string; taxable: boolean; vat: number; items: PItem[]; total: number };

function buildPurchasesHTML(all: Purchase[], ctx: { branch: string; logoUrl: string | null; qr: string; from: string; to: string }): string {
  const { branch, logoUrl, qr, from, to } = ctx;
  const total = all.reduce((s, e) => s + e.total, 0);
  const totalVat = all.reduce((s, e) => s + (e.vat || 0), 0);
  const count = all.length, avg = count ? total / count : 0;
  const catTotals: Record<string, number> = {};
  all.forEach((e) => (e.items || []).forEach((it) => { const t = num(it.qty) * num(it.price); catTotals[it.category || "أخرى"] = (catTotals[it.category || "أخرى"] || 0) + t; }));
  const cats = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);
  const itemMap: Record<string, { name: string; unit: string; hist: { date: string; price: number }[] }> = {};
  all.forEach((e) => (e.items || []).forEach((it) => { const nm = (it.name || "").trim(); const price = num(it.price); if (!nm || price <= 0) return; const key = normName(nm); if (!key) return; if (!itemMap[key]) itemMap[key] = { name: nm, unit: it.unit || "", hist: [] }; itemMap[key].hist.push({ date: e.date, price }); }));
  const priceChanges = Object.values(itemMap).map((g) => {
    const history = g.hist.slice().sort((a, b) => a.date.localeCompare(b.date));
    const prices = history.map((x) => x.price);
    const seq: number[] = []; history.forEach((x) => { const r = Math.round(x.price * 100) / 100; if (seq[seq.length - 1] !== r) seq.push(r); });
    const first = prices[0], last = prices[prices.length - 1], maxP = Math.max(...prices);
    const change = first > 0 ? ((last - first) / first) * 100 : 0;
    return { name: g.name, unit: g.unit, seq, first, last, maxP, change };
  }).filter((x) => x.seq.length > 1).sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
  const now = new Date().toLocaleString("ar-SA");

  const card = (label: string, value: string, green = false) => `<div style="flex:1;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:10px 14px;"><div style="font-size:10px;color:#6b7280;font-weight:700;">${label}</div><div style="font-size:17px;font-weight:800;margin-top:3px;color:${green ? "#15a06a" : "#111827"};">${value}</div></div>`;
  const header = `<div style="background:#0f1b2b;padding:16px 20px;display:flex;justify-content:space-between;align-items:center;"><div style="text-align:left;"><div style="font-size:20px;font-weight:800;color:#34d399;">تقرير المشتريات</div><div style="font-size:12px;color:#9fb3c8;">الفترة: ${from} إلى ${to} — ${now}</div></div><div style="display:flex;align-items:center;gap:10px;"><div style="text-align:right;"><div style="font-size:18px;font-weight:800;color:#fff;">محور</div><div style="font-size:9px;letter-spacing:3px;color:#9fb3c8;">MIHWAR PLATFORM</div></div>${logoBox(logoUrl)}</div></div>`;
  const cards = `<div style="display:flex;gap:10px;padding:14px 20px;background:#f8fafc;">${card("الفرع", branch || "—")}${card("عدد الفواتير", String(count))}${card("إجمالي الضريبة", fmt(totalVat) + " ر.س")}${card("الإجمالي شامل الضريبة", fmt(total) + " ر.س", true)}${card("متوسط الفاتورة", fmt(avg) + " ر.س")}</div>`;
  const ths = ["التاريخ", "المورّد", "رقم الفاتورة", "النوع", "عدد الأصناف", "الضريبة", "الإجمالي (ر.س)", "طريقة الدفع", "ملاحظات"];
  const thead = `<tr>${ths.map((h) => `<th style="border:1px solid #d1d5db;padding:7px 8px;background:#14304d;color:#fff;font-size:11px;font-weight:700;white-space:nowrap;">${h}</th>`).join("")}</tr>`;
  const body = all.map((e, idx) => {
    const bg = idx % 2 ? "#fff" : "#f9fafb";
    const cells = [e.date, e.supplier, e.invoiceNo || "—", e.taxable ? "ضريبية" : "غير ضريبية", String((e.items || []).length), fmt(e.vat || 0), `<b style="color:#15a06a;">${fmt(e.total)}</b>`, e.payment, (e.note || "").replace(/</g, "&lt;")];
    return `<tr style="background:${bg};">${cells.map((v, i) => `<td style="border:1px solid #e5e7eb;padding:5px 8px;font-size:11px;text-align:${i === 1 || i === 8 ? "right" : "center"};">${v}</td>`).join("")}</tr>`;
  }).join("");
  const totalRow = `<tr><td colspan="5" style="border:1px solid #cbd5e1;padding:6px 8px;font-size:11px;font-weight:800;text-align:right;background:#eef2f7;color:#0f1b2b;">الإجمالي العام</td><td style="border:1px solid #cbd5e1;padding:6px 8px;font-size:11px;font-weight:800;text-align:center;background:#eef2f7;color:#b45309;">${fmt(totalVat)}</td><td style="border:1px solid #cbd5e1;padding:6px 8px;font-size:12px;font-weight:800;text-align:center;background:#eef2f7;color:#15a06a;">${fmt(total)}</td><td colspan="2" style="border:1px solid #cbd5e1;background:#eef2f7;"></td></tr>`;
  const catBlock = cats.length ? `<div style="padding:4px 20px 14px;"><div style="font-size:13px;font-weight:800;color:#0f1b2b;margin:6px 0;">نسبة كل تصنيف من إجمالي المشتريات</div><table style="border-collapse:collapse;width:100%;max-width:520px;"><tr>${["التصنيف", "القيمة (ر.س)", "النسبة %"].map((h) => `<th style="border:1px solid #d1d5db;padding:6px 8px;background:#14304d;color:#fff;font-size:11px;">${h}</th>`).join("")}</tr>${cats.map(([c, v]) => `<tr><td style="border:1px solid #e5e7eb;padding:5px 8px;font-size:11px;text-align:right;">${c}</td><td style="border:1px solid #e5e7eb;padding:5px 8px;font-size:11px;text-align:center;">${fmt(v)}</td><td style="border:1px solid #e5e7eb;padding:5px 8px;font-size:11px;text-align:center;font-weight:800;color:#15a06a;">${total > 0 ? ((v / total) * 100).toFixed(1) : "0"}%</td></tr>`).join("")}</table></div>` : "";
  const priceBlock = priceChanges.length ? `<div style="padding:4px 20px 14px;"><div style="font-size:13px;font-weight:800;color:#0f1b2b;margin:6px 0;">تنبيه تغيّر أسعار الأصناف (${priceChanges.length} صنف)</div><table style="border-collapse:collapse;width:100%;"><tr>${["الصنف", "تسلسل الأسعار", "أول سعر", "آخر سعر", "أعلى سعر", "% التغيّر"].map((h) => `<th style="border:1px solid #d1d5db;padding:6px 8px;background:#14304d;color:#fff;font-size:11px;">${h}</th>`).join("")}</tr>${priceChanges.map((pc) => { const up = pc.change > 0; return `<tr><td style="border:1px solid #e5e7eb;padding:5px 8px;font-size:11px;text-align:right;">${pc.name}${pc.unit ? ` <span style="color:#9ca3af;">(${pc.unit})</span>` : ""}</td><td style="border:1px solid #e5e7eb;padding:5px 8px;font-size:11px;text-align:center;direction:ltr;">${pc.seq.map(fmt).join(" → ")}</td><td style="border:1px solid #e5e7eb;padding:5px 8px;font-size:11px;text-align:center;">${fmt(pc.first)}</td><td style="border:1px solid #e5e7eb;padding:5px 8px;font-size:11px;text-align:center;font-weight:800;">${fmt(pc.last)}</td><td style="border:1px solid #e5e7eb;padding:5px 8px;font-size:11px;text-align:center;">${fmt(pc.maxP)}</td><td style="border:1px solid #e5e7eb;padding:5px 8px;font-size:11px;text-align:center;font-weight:800;color:${up ? "#dc2626" : "#15a06a"};">${(up ? "+" : "") + pc.change.toFixed(1)}%</td></tr>`; }).join("")}</table><div style="margin-top:4px;font-size:10px;color:#9ca3af;">يعرض فقط الأصناف التي اشتُريت بأكثر من سعر خلال الفترة (السعر بدون ضريبة = صافي التكلفة).</div></div>` : "";
  const table = `<div style="padding:6px 20px 4px;"><table style="border-collapse:collapse;width:100%;"><thead>${thead}</thead><tbody>${body}${totalRow}</tbody></table></div>`;
  const footer = `<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 20px;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:10px;gap:12px;"><div><div>تم إنشاء هذا التقرير آليًا من مركز التقارير</div><div>منصة محور — MIHWAR B2B Marketplace</div></div>${contactFooter(SUPPORT_WA, qr)}</div>`;
  return SHELL(header, `${cards}${table}${catBlock}${priceBlock}${footer}`);
}

export async function exportPurchasesReport(branchId: number | null, from: string, to: string, mode: ExportMode): Promise<ExportResult> {
  const allRows = (await fetchPurchasesWithMigration(branchId)) as Purchase[];
  const rows = allRows.filter((e) => e.date >= from && e.date <= to).sort((a, b) => a.date.localeCompare(b.date));
  if (!rows.length) return { ok: false, rows: 0, msg: "لا توجد فواتير شراء ضمن هذه الفترة." };
  const { branch, logoUrl } = await shopInfo(branchId);
  const qr = await waQrDataUrl(SUPPORT_WA);
  emit(mode, `تقرير المشتريات — ${branch}`, `مشتريات_${branch || "فرع"}_${from}_${to}`, buildPurchasesHTML(rows, { branch, logoUrl, qr, from, to }));
  return { ok: true, rows: rows.length };
}

// ========================= 3) نقطة التعادل (المصروفات الثابتة) =========================
const salaryMonthly = (s: any) => { const amt = num(s.amount); const def = s.type === "daily" ? 30 : s.type === "weekly" ? 4 : 1; const c = (s.count != null && String(s.count).trim()) ? num(s.count) : def; return s.type === "monthly" ? amt : amt * c; };

function buildBEHTML(ctx: { branch: string; logoUrl: string | null; qr: string; month: string; actualSales: number; variableCosts: number; fixedForBE: number; transfers: { transIn: number; transOut: number }; targetUplift: string; be: any }): string {
  const { branch, logoUrl, qr, month, actualSales, variableCosts, fixedForBE, transfers, targetUplift, be } = ctx;
  const now = new Date().toLocaleString("ar-SA");
  const card = (l: string, v: string, green = false) => `<div style="flex:1;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:10px 14px;"><div style="font-size:10px;color:#6b7280;font-weight:700;">${l}</div><div style="font-size:16px;font-weight:800;margin-top:3px;color:${green ? "#15a06a" : "#111827"};">${v}</div></div>`;
  const header = `<div style="background:#0f1b2b;padding:16px 20px;display:flex;justify-content:space-between;align-items:center;"><div style="text-align:left;"><div style="font-size:20px;font-weight:800;color:#34d399;">نقطة التعادل والمستهدف</div><div style="font-size:12px;color:#9fb3c8;">الشهر: ${month} — ${now}</div></div><div style="display:flex;align-items:center;gap:10px;"><div style="text-align:right;"><div style="font-size:18px;font-weight:800;color:#fff;">محور</div><div style="font-size:9px;letter-spacing:3px;color:#9fb3c8;">MIHWAR PLATFORM</div></div>${logoBox(logoUrl)}</div></div>`;
  const cards = `<div style="display:flex;gap:10px;padding:14px 20px;background:#f8fafc;">${card("الفرع", branch || "—")}${card("المبيعات الفعلية", fmt(actualSales) + " ر.س")}${card("نقطة التعادل", fmt(be.breakEven) + " ر.س", true)}${card("المستهدف", fmt(be.target) + " ر.س", true)}</div>`;
  const row = (l: string, v: string, note = "") => `<tr><td style="border:1px solid #e5e7eb;padding:6px 10px;font-size:12px;text-align:right;font-weight:600;color:#374151;">${l}</td><td style="border:1px solid #e5e7eb;padding:6px 10px;font-size:12px;text-align:center;font-weight:800;color:#0f1b2b;">${v}</td><td style="border:1px solid #e5e7eb;padding:6px 10px;font-size:11px;text-align:right;color:#6b7280;">${note}</td></tr>`;
  const metrics = `<div style="padding:8px 20px;"><table style="border-collapse:collapse;width:100%;max-width:640px;">${row("المبيعات الشهرية الفعلية", fmt(actualSales) + " ر.س", "من بيانات تسوية المبيعات")}${row("التكاليف الثابتة الشهرية", fmt(fixedForBE) + " ر.س", "من صفحة المصروفات الثابتة")}${row("التكاليف المتغيرة", fmt(variableCosts) + " ر.س", "مشتريات + تحويل وارد − تحويل صادر")}${row("— تحويل وارد (مكتمل/جزئي)", "+" + fmt(transfers.transIn) + " ر.س", "طلبات واردة للفرع")}${row("— تحويل صادر (مكتمل/جزئي)", "−" + fmt(transfers.transOut) + " ر.س", "طلبات صادرة من الفرع")}${row("نسبة التكلفة المتغيرة", (be.varPct * 100).toFixed(1) + "%", "متغيرة ÷ مبيعات")}${row("هامش المساهمة", (be.cm * 100).toFixed(1) + "%", "1 − نسبة المتغيرة")}${row("نقطة التعادل الشهرية", fmt(be.breakEven) + " ر.س", "ثابتة ÷ هامش المساهمة")}${row("نقطة التعادل اليومية", fmt(be.dailyBE) + " ر.س", "شهري ÷ 30")}${row("المستهدف (Target)", fmt(be.target) + " ر.س", `تعادل × (1 + ${targetUplift}%)`)}${row("تحقيق المستهدف", be.achievement.toFixed(1) + "%", "مبيعات ÷ المستهدف")}${row("صافي الربح التقديري", fmt(be.profit) + " ر.س", "مبيعات − متغيرة − ثابتة")}</table></div>`;
  const scen = `<div style="padding:4px 20px 14px;"><div style="font-size:13px;font-weight:800;color:#0f1b2b;margin:6px 0;">سيناريوهات المستهدف فوق نقطة التعادل</div><table style="border-collapse:collapse;width:100%;max-width:640px;"><tr>${["السيناريو", "الزيادة", "Target", "الفرق عن التعادل"].map((h) => `<th style="border:1px solid #d1d5db;padding:6px 8px;background:#14304d;color:#fff;font-size:11px;">${h}</th>`).join("")}</tr>${be.scenarios.map((s: any) => `<tr><td style="border:1px solid #e5e7eb;padding:5px 8px;font-size:11px;text-align:right;">${s.l}</td><td style="border:1px solid #e5e7eb;padding:5px 8px;font-size:11px;text-align:center;">${s.up}%</td><td style="border:1px solid #e5e7eb;padding:5px 8px;font-size:11px;text-align:center;font-weight:800;color:#15a06a;">${fmt(s.target)}</td><td style="border:1px solid #e5e7eb;padding:5px 8px;font-size:11px;text-align:center;">${fmt(s.diff)}</td></tr>`).join("")}</table></div>`;
  const footer = `<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 20px;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:10px;gap:12px;"><div><div>تم إنشاء هذا التقرير آليًا من مركز التقارير</div><div>منصة محور — MIHWAR B2B Marketplace</div></div>${contactFooter(SUPPORT_WA, qr)}</div>`;
  return SHELL(header, `${cards}${metrics}${scen}${footer}`);
}

export async function exportBreakevenReport(branchId: number | null, from: string, _to: string, mode: ExportMode): Promise<ExportResult> {
  const month = from.slice(0, 7);
  const [salesRows, purchRows, cfg, orders] = await Promise.all([
    fetchSalesWithMigration(branchId),
    fetchPurchasesWithMigration(branchId),
    getSettingWithMigration(branchId, SETTING_KEYS.fixedExpenses, LOCAL_KEYS.FE_LKEY, { salaries: [], items: [], targetUplift: "40" }),
    fetchOrders(branchId),
  ]);
  const salaries = Array.isArray(cfg?.salaries) ? cfg.salaries : [];
  const items = Array.isArray(cfg?.items) ? cfg.items : [];
  const targetUplift = cfg?.targetUplift || "40";
  const salariesTotal = salaries.reduce((s: number, r: any) => s + salaryMonthly(r), 0);
  const fixedForBE = salariesTotal + items.filter((r: any) => r.inBE).reduce((s: number, r: any) => s + num(r.amount), 0);

  const suggSales = (salesRows as any[]).filter((e) => (e.date || "").slice(0, 7) === month).reduce((s, e) => s + (e.gAct || 0), 0);
  const suggPurch = (purchRows as any[]).filter((e) => (e.date || "").slice(0, 7) === month).reduce((s, e) => s + ((e.subtotal ?? e.total) || 0), 0);
  const inMonth = orders.filter((o) => (o.created_at || "").slice(0, 7) === month && (o.status === "completed" || o.status === "partially_approved"));
  const transIn = inMonth.filter((o) => o.to_shop_id === branchId).reduce((s, o) => s + (o.total_amount || 0), 0);
  const transOut = inMonth.filter((o) => o.from_shop_id === branchId).reduce((s, o) => s + (o.total_amount || 0), 0);
  const transfers = { transIn, transOut };
  const variableCosts = suggPurch + transIn - transOut;
  const actualSales = suggSales;

  const varPct = actualSales > 0 ? variableCosts / actualSales : 0;
  const cm = 1 - varPct;
  const breakEven = cm > 0 ? fixedForBE / cm : 0;
  const dailyBE = breakEven / 30;
  const uplift = num(targetUplift) / 100;
  const target = breakEven * (1 + uplift);
  const achievement = target > 0 ? (actualSales / target) * 100 : 0;
  const profit = actualSales - variableCosts - fixedForBE;
  const scenarios = [{ l: "حد أدنى", up: 35 }, { l: "أساسي", up: num(targetUplift) }, { l: "حد أعلى", up: 50 }].map((s) => ({ ...s, target: breakEven * (1 + s.up / 100), diff: breakEven * (s.up / 100) }));
  const be = { varPct, cm, breakEven, dailyBE, target, achievement, profit, scenarios };

  if (actualSales <= 0 && fixedForBE <= 0) return { ok: false, rows: 0, msg: "لا توجد بيانات كافية لهذا الشهر (مبيعات/مصروفات)." };
  const { branch, logoUrl } = await shopInfo(branchId);
  const qr = await waQrDataUrl(SUPPORT_WA);
  emit(mode, `نقطة التعادل — ${branch}`, `التعادل_${branch || "فرع"}_${month}`, buildBEHTML({ branch, logoUrl, qr, month, actualSales, variableCosts, fixedForBE, transfers, targetUplift, be }));
  return { ok: true, rows: 1 };
}

// ========================= 4) التقرير المالي الشهري =========================
const BASE_CH: Record<string, string> = { cash: "نقدي", net: "شبكة (مدى)", keeta: "كيتا", hunger: "هنقرستيشن", jahez: "جاهز", trans: "تحويل بنكي", refund: "مرتجع" };
const DEFAULT_RATE: Record<string, string> = { keeta: "25", hunger: "25", jahez: "25" };
const NON_COMM = new Set(["cash", "net", "trans", "refund"]);
function prevMonth(ym: string) { const [y, m] = ym.split("-").map(Number); const d = new Date(y, m - 2, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; }
const monthLabel = (ym: string) => { const names = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"]; const [y, m] = ym.split("-").map(Number); return `${names[m - 1]} ${y}`; };
const changeNote = (cur: number, prev: number) => { const d = cur - prev; if (Math.abs(d) < 0.01) return "بلا تغيير"; const pct = prev !== 0 ? Math.abs((d / prev) * 100) : 0; return `${d > 0 ? "ارتفع" : "انخفض"} ${fmt2(Math.abs(d))} بنسبة ${pct.toFixed(1)}%`; };
function salesMonthFrom(rows: any[], ym: string) { const r = rows.filter((e: any) => (e.date || "").slice(0, 7) === ym); const gross = r.reduce((s: number, e: any) => s + (e.gAct || 0), 0); const perCh: Record<string, number> = {}; r.forEach((e: any) => Object.entries(e.perChannelActual || {}).forEach(([k, v]) => { perCh[k] = (perCh[k] || 0) + (v as number); })); return { gross, perCh }; }
function purchMonthFrom(rows: any[], ym: string) { return rows.filter((e: any) => (e.date || "").slice(0, 7) === ym).reduce((s: number, e: any) => s + ((e.subtotal ?? e.total) || 0), 0); }
function channelNameFrom(salesRows: any[], id: string) { if (BASE_CH[id]) return BASE_CH[id]; for (const e of salesRows) { const c = (e.customChannels || []).find((x: any) => x.id === id); if (c) return c.nm; } return id; }
type Comm = Record<string, string>;
function buildFin(branchId: number | null, ym: string, orders: any[], comm: Comm, fe: { salaries: any[]; items: any[] }, salesRows: any[], purchRows: any[]) {
  const s = salesMonthFrom(salesRows, ym); const gross = s.gross; const net = gross / VAT_DIV; const purchases = purchMonthFrom(purchRows, ym);
  const inMonth = orders.filter((o) => (o.created_at || "").slice(0, 7) === ym && (o.status === "completed" || o.status === "partially_approved"));
  const transIn = inMonth.filter((o) => o.to_shop_id === branchId).reduce((a, o) => a + (o.total_amount || 0), 0);
  const transOut = inMonth.filter((o) => o.from_shop_id === branchId).reduce((a, o) => a + (o.total_amount || 0), 0);
  const cogs = purchases + transIn - transOut;
  const commByCh: { id: string; name: string; sales: number; rate: number; amount: number }[] = [];
  Object.entries(s.perCh).forEach(([id, v]) => { if (NON_COMM.has(id) || (v as number) <= 0) return; const rate = num(comm[id] ?? DEFAULT_RATE[id] ?? "0"); if (rate <= 0) return; commByCh.push({ id, name: channelNameFrom(salesRows, id), sales: v as number, rate, amount: (v as number) * rate / 100 }); });
  const commission = commByCh.reduce((a, c) => a + c.amount, 0);
  const appSales = commByCh.reduce((a, c) => a + c.sales, 0);
  const salaries = fe.salaries.reduce((a, x) => a + salaryMonthly(x), 0);
  const items = fe.items.map((x: any) => ({ name: x.name, amount: num(x.amount) }));
  const itemsTotal = items.reduce((a: number, x: any) => a + x.amount, 0);
  const totalFixed = salaries + itemsTotal;
  const totalCosts = cogs + commission + totalFixed;
  const netProfit = net - totalCosts;
  const margin = gross > 0 ? (netProfit / gross) * 100 : 0;
  const variable = cogs + commission;
  const varPct = net > 0 ? (variable / net) * 100 : 0;
  const cm = 100 - varPct;
  const breakEven = cm > 0 ? totalFixed / (cm / 100) : 0;
  const dailyBE = breakEven / 30;
  return { gross, net, purchases, transIn, transOut, cogs, commission, appSales, perCh: s.perCh, commByCh, salaries, items, itemsTotal, totalFixed, totalCosts, netProfit, margin, variable, varPct, cm, breakEven, dailyBE };
}
type Fin = ReturnType<typeof buildFin>;

function buildFinancialHTML(ctx: { branch: string; logoUrl: string | null; qr: string; month: string; pm: string; compare: boolean; cur: Fin; prev: Fin; fe: { salaries: any[]; items: any[] }; comm: Comm; salesRows: any[] }): string {
  const { branch, logoUrl, qr, month, pm, compare, cur, prev, fe, comm, salesRows } = ctx;
  const chName = (id: string) => channelNameFrom(salesRows, id);
  const now = new Date().toLocaleString("ar-SA");
  const th = (t: string, bg = "#14304d") => `<th style="border:1px solid #cbd5e1;padding:7px 10px;background:${bg};color:#fff;font-size:12px;font-weight:700;">${t}</th>`;
  const tdL = (t: string, b = false) => `<td style="border:1px solid #e5e7eb;padding:6px 10px;font-size:12px;text-align:right;font-weight:${b ? 800 : 600};color:#1f2937;">${t}</td>`;
  const tdN = (t: string, color = "#15803d", b = false) => `<td style="border:1px solid #e5e7eb;padding:6px 10px;font-size:12px;text-align:center;font-weight:${b ? 800 : 600};color:${color};">${t}</td>`;
  const tdNote = (t: string) => `<td style="border:1px solid #e5e7eb;padding:6px 10px;font-size:10px;text-align:right;color:#6b7280;">${t}</td>`;

  const plRows: { label: string; c: number; p: number; bold?: boolean; hl?: "green" | "gray" }[] = [
    { label: "إجمالي المبيعات", c: cur.gross, p: prev.gross, bold: true },
    { label: "صافي المبيعات بعد خصم الضريبة 15%", c: cur.net, p: prev.net },
    { label: "تكلفة المواد / المشتريات (صافي)", c: cur.purchases, p: prev.purchases },
    { label: "تكلفة الطلبات الواردة (المعمل)", c: cur.transIn, p: prev.transIn },
    ...(cur.transOut || prev.transOut ? [{ label: "تحويل صادر (−)", c: -cur.transOut, p: -prev.transOut }] : []),
    { label: "إجمالي التكلفة / المشتريات والمعمل", c: cur.cogs, p: prev.cogs, bold: true },
    { label: "عمولات تطبيقات التوصيل", c: cur.commission, p: prev.commission },
    { label: "الرواتب", c: cur.salaries, p: prev.salaries },
    ...cur.items.map((it, i) => ({ label: it.name, c: it.amount, p: prev.items[i]?.amount ?? it.amount })),
    { label: "إجمالي التكاليف", c: cur.totalCosts, p: prev.totalCosts, bold: true, hl: "gray" as const },
    { label: "صافي الربح / (الخسارة)", c: cur.netProfit, p: prev.netProfit, bold: true, hl: "green" as const },
  ];
  const plBody = plRows.map((r) => { const rowBg = r.hl === "green" ? "background:#dcfce7;" : r.hl === "gray" ? "background:#f1f5f9;" : ""; const cv = fmt2(r.c) + " SAR"; const pv = fmt2(r.p) + " SAR"; return `<tr style="${rowBg}">${tdL(r.label, r.bold)}${tdN(cv, "#15803d", r.bold)}${compare ? tdN(pv, "#334155", r.bold) + tdNote(changeNote(r.c, r.p)) : ""}</tr>`; }).join("");
  const marginRow = `<tr style="background:#dcfce7;">${tdL("هامش الربح", true)}${tdN(cur.margin.toFixed(1) + "%", "#15803d", true)}${compare ? tdN(prev.margin.toFixed(1) + "%", "#334155", true) + tdNote((cur.margin - prev.margin >= 0 ? "تحسّن " : "تراجع ") + Math.abs(cur.margin - prev.margin).toFixed(1) + " نقطة") : ""}</tr>`;
  const plHeadCols = [th("البند"), th(monthLabel(month)), ...(compare ? [th(monthLabel(pm)), th("ملاحظات")] : [])].join("");
  const plHead = `<table style="border-collapse:collapse;width:100%;"><tr>${plHeadCols}</tr>${plBody}${marginRow}</table>`;

  const commIds = [...new Set([...cur.commByCh.map((c) => c.id), ...prev.commByCh.map((c) => c.id)])];
  const appRows = commIds.map((id) => { const cc = cur.commByCh.find((c) => c.id === id); const pc = prev.commByCh.find((c) => c.id === id); const rate = cc ? cc.rate : (pc ? pc.rate : num(comm[id] || "0")); return `<tr>${tdL(chName(id))}${tdN(fmt2(cc ? cc.sales : 0), "#334155")}${compare ? tdN(fmt2(pc ? pc.sales : 0), "#334155") : ""}${tdNote("نسبة العمولة " + rate + "%")}</tr>`; }).join("");
  const appTable = commIds.length ? `<table style="border-collapse:collapse;width:100%;margin-top:6px;"><tr>${th("مدخلات عمولة التطبيقات", "#14304d")}${th(monthLabel(month), "#14304d")}${compare ? th(monthLabel(pm), "#14304d") : ""}${th("ملاحظة", "#14304d")}</tr>${appRows}<tr style="background:#eff6ff;">${tdL("إجمالي مبيعات التطبيقات", true)}${tdN(fmt2(cur.appSales), "#14304d", true)}${compare ? tdN(fmt2(prev.appSales), "#14304d", true) : ""}${tdNote("إجمالي العمولة: " + fmt2(cur.commission) + " SAR")}</tr></table>` : "";

  const beRow = (l: string, cv: string, pv: string) => `<tr>${tdL(l)}${tdN(cv, "#334155")}${compare ? tdN(pv, "#334155") : ""}</tr>`;
  const beTable = `<table style="border-collapse:collapse;width:100%;"><tr>${th("المؤشر")}${th(monthLabel(month))}${compare ? th(monthLabel(pm)) : ""}</tr>${beRow("المبيعات الشهرية الفعلية (صافي)", fmt2(cur.net) + " SAR", fmt2(prev.net) + " SAR")}${beRow("التكاليف الثابتة الشهرية", fmt2(cur.totalFixed) + " SAR", fmt2(prev.totalFixed) + " SAR")}${beRow("التكاليف المتغيرة", fmt2(cur.variable) + " SAR", fmt2(prev.variable) + " SAR")}${beRow("نسبة التكاليف المتغيرة", cur.varPct.toFixed(1) + "%", prev.varPct.toFixed(1) + "%")}${beRow("هامش المساهمة", cur.cm.toFixed(1) + "%", prev.cm.toFixed(1) + "%")}${beRow("نقطة التعادل الشهرية", fmt2(cur.breakEven) + " SAR", fmt2(prev.breakEven) + " SAR")}${beRow("نقطة التعادل اليومية", fmt2(cur.dailyBE) + " SAR", fmt2(prev.dailyBE) + " SAR")}</table>`;

  const feBody = [`<tr>${tdL("الرواتب")}${tdN(fmt2(cur.salaries), "#334155")}</tr>`, ...cur.items.map((it) => `<tr>${tdL(it.name)}${tdN(fmt2(it.amount), "#334155")}</tr>`), `<tr style="background:#f1f5f9;">${tdL("إجمالي المصروفات الثابتة", true)}${tdN(fmt2(cur.totalFixed), "#0f1b2b", true)}</tr>`].join("");
  const feTable = `<table style="border-collapse:collapse;width:100%;max-width:520px;"><tr>${th("البند")}${th("القيمة الشهرية")}</tr>${feBody}</table>`;
  const salBody = fe.salaries.filter((s: any) => s.name).map((s: any) => `<tr>${tdL(s.name, true)}${tdN(fmt0(salaryMonthly(s)), "#334155")}${tdNote(s.title || "")}${tdNote(s.note || "")}</tr>`).join("");
  const salTable = fe.salaries.some((s: any) => s.name) ? `<table style="border-collapse:collapse;width:100%;"><tr>${th("الموظف")}${th("الراتب الشهري")}${th("الوظيفة")}${th("ملاحظات")}</tr>${salBody}<tr style="background:#f1f5f9;">${tdL("الإجمالي", true)}${tdN(fmt0(cur.salaries), "#0f1b2b", true)}<td colspan="2" style="border:1px solid #e5e7eb;"></td></tr></table>` : "";

  const header = `<div style="background:#0f1b2b;padding:18px 22px;display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #34d399;"><div style="display:flex;align-items:center;gap:10px;">${logoBox(logoUrl)}<div style="text-align:right;"><div style="font-size:18px;font-weight:800;color:#fff;">محور</div><div style="font-size:9px;letter-spacing:3px;color:#9fb3c8;">MIHWAR PLATFORM</div></div></div><div style="text-align:left;"><div style="font-size:22px;font-weight:800;color:#34d399;">التقرير المالي الشهري — ${branch || "الفرع"}</div><div style="font-size:12px;color:#9fb3c8;">${compare ? monthLabel(pm) + " و " + monthLabel(month) : monthLabel(month)} — ${now}</div></div></div>`;
  const card = (l: string, v: string, green = false) => `<div style="flex:1;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:10px 14px;"><div style="font-size:10px;color:#6b7280;font-weight:700;">${l}</div><div style="font-size:16px;font-weight:800;margin-top:3px;color:${green ? "#15a06a" : "#111827"};">${v}</div></div>`;
  const cards = `<div style="display:flex;gap:10px;padding:14px 22px;background:#f8fafc;border-bottom:1px solid #e5e7eb;">${card("الفرع", branch || "—")}${card("صافي المبيعات (" + monthLabel(month) + ")", fmt2(cur.net) + " SAR")}${card("صافي الربح", fmt2(cur.netProfit) + " SAR", true)}${card("هامش الربح", cur.margin.toFixed(1) + "%")}</div>`;
  const sec = (t: string) => `<div style="font-size:16px;font-weight:800;color:#0f1b2b;border-bottom:2px solid #14304d;padding-bottom:4px;margin:18px 0 10px;">${t}</div>`;
  const footer = `<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 22px;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:10px;margin-top:16px;gap:12px;"><div><div>تم إنشاء هذا التقرير آليًا من مركز التقارير</div><div>MIHWAR B2B Marketplace</div></div>${contactFooter(SUPPORT_WA, qr)}</div>`;
  const body = `${cards}<div style="padding:8px 22px;">${sec("أولاً: قائمة الربح والخسارة")}${plHead}${appTable}${sec("ثانياً: نقطة التعادل")}${beTable}${sec("ثالثاً: المصروفات الثابتة الشهرية")}${feTable}${salTable ? sec("رابعاً: بيانات الموظفين والرواتب") + salTable : ""}</div>${footer}`;
  return SHELL(header, body);
}

export async function exportFinancialReport(branchId: number | null, from: string, _to: string, mode: ExportMode): Promise<ExportResult> {
  const month = from.slice(0, 7);
  const [salesRows, purchRows, feCfg, commCfg, orders] = await Promise.all([
    fetchSalesWithMigration(branchId),
    fetchPurchasesWithMigration(branchId),
    getSettingWithMigration(branchId, SETTING_KEYS.fixedExpenses, LOCAL_KEYS.FE_LKEY, { salaries: [], items: [] }),
    getSettingWithMigration(branchId, SETTING_KEYS.appCommissions, LOCAL_KEYS.COMM_LKEY, { ...DEFAULT_RATE }),
    fetchOrders(branchId),
  ]);
  const fe = feCfg && Array.isArray(feCfg.salaries) ? { salaries: feCfg.salaries, items: feCfg.items || [] } : { salaries: [], items: [] };
  const comm = { ...DEFAULT_RATE, ...(commCfg || {}) };
  const pm = prevMonth(month);
  const cur = buildFin(branchId, month, orders, comm, fe, salesRows as any[], purchRows as any[]);
  const prev = buildFin(branchId, pm, orders, comm, fe, salesRows as any[], purchRows as any[]);
  if (cur.gross <= 0 && cur.totalFixed <= 0) return { ok: false, rows: 0, msg: "لا توجد بيانات كافية لهذا الشهر (مبيعات/مشتريات/مصروفات)." };
  const { branch, logoUrl } = await shopInfo(branchId);
  const qr = await waQrDataUrl(SUPPORT_WA);
  emit(mode, `التقرير المالي — ${branch}`, `التقرير_المالي_${branch || "فرع"}_${month}`, buildFinancialHTML({ branch, logoUrl, qr, month, pm, compare: false, cur, prev, fe, comm, salesRows: salesRows as any[] }));
  return { ok: true, rows: 1 };
}

// ── سجلّ المصدّرات المتاحة ──
export const EXPORTERS: Record<string, (b: number | null, f: string, t: string, m: ExportMode) => Promise<ExportResult>> = {
  "sales-reconciliation": exportSalesReport,
  "purchases": exportPurchasesReport,
  "fixed-expenses": exportBreakevenReport,
  "financial-report": exportFinancialReport,
};

// ========================= تقارير مجمّعة (عدة فروع) =========================
export type BranchRef = { id: number; name: string };

async function salesSummary(bid: number, from: string, to: string) {
  const rows = ((await fetchSalesWithMigration(bid)) as SalesEntry[]).filter((e) => e.date >= from && e.date <= to);
  const gAct = rows.reduce((s, e) => s + e.gAct, 0);
  const gSys = rows.reduce((s, e) => s + e.gSys, 0);
  const before = netOf(gAct);
  return { count: rows.length, gAct, gSys, diff: gAct - gSys, before, vat: gAct - before, err: gSys ? ((gAct - gSys) / gSys) * 100 : 0 };
}
async function purchasesSummary(bid: number, from: string, to: string) {
  const rows = ((await fetchPurchasesWithMigration(bid)) as Purchase[]).filter((e) => e.date >= from && e.date <= to);
  const total = rows.reduce((s, e) => s + e.total, 0);
  const vat = rows.reduce((s, e) => s + (e.vat || 0), 0);
  return { count: rows.length, total, vat, avg: rows.length ? total / rows.length : 0 };
}
async function breakevenSummary(bid: number, month: string) {
  const [salesRows, purchRows, cfg, orders] = await Promise.all([
    fetchSalesWithMigration(bid), fetchPurchasesWithMigration(bid),
    getSettingWithMigration(bid, SETTING_KEYS.fixedExpenses, LOCAL_KEYS.FE_LKEY, { salaries: [], items: [], targetUplift: "40" }),
    fetchOrders(bid),
  ]);
  const salaries = Array.isArray(cfg?.salaries) ? cfg.salaries : [];
  const items = Array.isArray(cfg?.items) ? cfg.items : [];
  const uplift = num(cfg?.targetUplift || "40") / 100;
  const fixedForBE = salaries.reduce((s: number, r: any) => s + salaryMonthly(r), 0) + items.filter((r: any) => r.inBE).reduce((s: number, r: any) => s + num(r.amount), 0);
  const sales = (salesRows as any[]).filter((e) => (e.date || "").slice(0, 7) === month).reduce((s, e) => s + (e.gAct || 0), 0);
  const purch = (purchRows as any[]).filter((e) => (e.date || "").slice(0, 7) === month).reduce((s, e) => s + ((e.subtotal ?? e.total) || 0), 0);
  const inM = orders.filter((o) => (o.created_at || "").slice(0, 7) === month && (o.status === "completed" || o.status === "partially_approved"));
  const tIn = inM.filter((o) => o.to_shop_id === bid).reduce((s, o) => s + (o.total_amount || 0), 0);
  const tOut = inM.filter((o) => o.from_shop_id === bid).reduce((s, o) => s + (o.total_amount || 0), 0);
  const variable = purch + tIn - tOut;
  const cm = sales > 0 ? 1 - variable / sales : 0;
  const be = cm > 0 ? fixedForBE / cm : 0;
  return { sales, fixed: fixedForBE, variable, be, target: be * (1 + uplift), profit: sales - variable - fixedForBE };
}
async function financialSummary(bid: number, month: string) {
  const [salesRows, purchRows, feCfg, commCfg, orders] = await Promise.all([
    fetchSalesWithMigration(bid), fetchPurchasesWithMigration(bid),
    getSettingWithMigration(bid, SETTING_KEYS.fixedExpenses, LOCAL_KEYS.FE_LKEY, { salaries: [], items: [] }),
    getSettingWithMigration(bid, SETTING_KEYS.appCommissions, LOCAL_KEYS.COMM_LKEY, { ...DEFAULT_RATE }),
    fetchOrders(bid),
  ]);
  const fe = feCfg && Array.isArray(feCfg.salaries) ? { salaries: feCfg.salaries, items: feCfg.items || [] } : { salaries: [], items: [] };
  const comm = { ...DEFAULT_RATE, ...(commCfg || {}) };
  const cur = buildFin(bid, month, orders, comm, fe, salesRows as any[], purchRows as any[]);
  return { gross: cur.gross, net: cur.net, costs: cur.totalCosts, profit: cur.netProfit, margin: cur.margin };
}

type ConsCard = { label: string; value: string; green?: boolean };
const col = (v: string, c: string) => `<span style="color:${c};font-weight:800;">${v}</span>`;
const diffCol = (d: number) => col((d > 0 ? "+" : "") + fmt(d), d > 0.009 ? "#15a06a" : d < -0.009 ? "#dc2626" : "#6b7280");
const errCol = (e: number) => col((e > 0 ? "+" : "") + e.toFixed(1) + "%", Math.abs(e) <= 5 ? "#15a06a" : "#b45309");
const prCol = (p: number) => col(fmt(p), p >= 0 ? "#15a06a" : "#dc2626");

function consolidatedHTML(title: string, periodLabel: string, cards: ConsCard[], headers: string[], bodyRows: string[][], totalRow: string[], qr: string): string {
  const now = new Date().toLocaleString("ar-SA");
  const header = `<div style="background:#0f1b2b;padding:16px 20px;display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #34d399;"><div style="text-align:left;"><div style="font-size:20px;font-weight:800;color:#34d399;">${title}</div><div style="font-size:12px;color:#9fb3c8;">${periodLabel} — ${now}</div></div><div style="text-align:right;"><div style="font-size:18px;font-weight:800;color:#fff;">محور</div><div style="font-size:9px;letter-spacing:3px;color:#9fb3c8;">MIHWAR PLATFORM</div></div></div>`;
  const card = (c: ConsCard) => `<div style="flex:1;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:11px 14px;box-shadow:0 1px 2px rgba(15,27,43,0.04);"><div style="font-size:10px;color:#6b7280;font-weight:700;">${c.label}</div><div style="font-size:17px;font-weight:800;margin-top:4px;color:${c.green ? "#15a06a" : "#0f1b2b"};">${c.value}</div></div>`;
  const cardsBand = `<div style="display:flex;gap:10px;padding:16px 20px;background:#f8fafc;border-bottom:1px solid #eef2f7;">${cards.map(card).join("")}</div>`;
  const thead = `<tr>${headers.map((h, i) => `<th style="border:1px solid #1f3a5a;padding:9px 10px;background:#14304d;color:#fff;font-size:11px;font-weight:700;white-space:nowrap;text-align:${i === 0 ? "right" : "center"};">${h}</th>`).join("")}</tr>`;
  const body = bodyRows.map((cells, idx) => {
    const bg = idx % 2 ? "#ffffff" : "#f6f9fc";
    return `<tr style="background:${bg};">${cells.map((v, i) => `<td style="border:1px solid #e5e7eb;padding:8px 10px;font-size:12px;text-align:${i === 0 ? "right" : "center"};font-weight:${i === 0 ? 700 : 600};color:${i === 0 ? "#0f1b2b" : "#1f2937"};">${v}</td>`).join("")}</tr>`;
  }).join("");
  const total = `<tr>${totalRow.map((v, i) => `<td style="border:1px solid #bbf7d0;padding:10px;font-size:12.5px;font-weight:800;text-align:${i === 0 ? "right" : "center"};background:#dcfce7;color:#14532d;">${i === 0 ? "🧮 " + v : v}</td>`).join("")}</tr>`;
  const table = `<div style="padding:16px 20px 14px;"><div style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;"><table style="border-collapse:collapse;width:100%;"><thead>${thead}</thead><tbody>${body}${total}</tbody></table></div><div style="margin-top:9px;font-size:10px;color:#9ca3af;">تقرير مجمّع — صف لكل فرع + إجمالي عام للفروع المختارة (${bodyRows.length} فرع). المبالغ بالريال السعودي.</div></div>`;
  const footer = `<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 20px;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:10px;gap:12px;"><div><div>تم إنشاء هذا التقرير آليًا من مركز التقارير</div><div>منصة محور — MIHWAR B2B Marketplace</div></div>${contactFooter(SUPPORT_WA, qr)}</div>`;
  return SHELL(header, `${cardsBand}${table}${footer}`);
}

export async function exportConsolidated(reportId: string, branches: BranchRef[], from: string, to: string, mode: ExportMode): Promise<ExportResult> {
  if (!branches.length) return { ok: false, rows: 0, msg: "اختر فرعًا واحدًا على الأقل." };
  const qr = await waQrDataUrl(SUPPORT_WA);
  const month = from.slice(0, 7);
  const n = branches.length;
  let title = "", periodLabel = "", filename = "", headers: string[] = [], cards: ConsCard[] = [];
  const body: string[][] = [];
  let total: string[] = [];

  if (reportId === "sales-reconciliation") {
    title = "تقرير تسوية المبيعات — عدة فروع"; periodLabel = `الفترة: ${from} إلى ${to}`; filename = `تسوية_عدة_فروع_${from}_${to}`;
    headers = ["الفرع", "عدد الأيام", "شامل الضريبة", "قبل الضريبة", "الضريبة", "السيستم", "الفرق", "الخطأ %"];
    let c = 0, act = 0, bef = 0, vat = 0, sys = 0;
    for (const b of branches) { const s = await salesSummary(b.id, from, to); c += s.count; act += s.gAct; bef += s.before; vat += s.vat; sys += s.gSys;
      body.push([b.name, String(s.count), `<b style="color:#15a06a;">${fmt(s.gAct)}</b>`, fmt(s.before), col(fmt(s.vat), "#b45309"), fmt(s.gSys), diffCol(s.diff), errCol(s.err)]); }
    const d = act - sys, er = sys ? (d / sys) * 100 : 0;
    total = ["الإجمالي", String(c), fmt(act), fmt(bef), fmt(vat), fmt(sys), (d > 0 ? "+" : "") + fmt(d), (er > 0 ? "+" : "") + er.toFixed(1) + "%"];
    cards = [{ label: "عدد الفروع", value: String(n) }, { label: "الإجمالي قبل الضريبة", value: fmt(bef) + " ر.س" }, { label: "ضريبة القيمة المضافة", value: fmt(vat) + " ر.س" }, { label: "شامل الضريبة", value: fmt(act) + " ر.س", green: true }];
  } else if (reportId === "purchases") {
    title = "تقرير المشتريات — عدة فروع"; periodLabel = `الفترة: ${from} إلى ${to}`; filename = `مشتريات_عدة_فروع_${from}_${to}`;
    headers = ["الفرع", "عدد الفواتير", "شامل الضريبة", "الضريبة", "متوسط الفاتورة"];
    let c = 0, tot = 0, vat = 0;
    for (const b of branches) { const s = await purchasesSummary(b.id, from, to); c += s.count; tot += s.total; vat += s.vat;
      body.push([b.name, String(s.count), `<b style="color:#15a06a;">${fmt(s.total)}</b>`, col(fmt(s.vat), "#b45309"), fmt(s.avg)]); }
    total = ["الإجمالي", String(c), fmt(tot), fmt(vat), fmt(c ? tot / c : 0)];
    cards = [{ label: "عدد الفروع", value: String(n) }, { label: "عدد الفواتير", value: String(c) }, { label: "إجمالي الضريبة", value: fmt(vat) + " ر.س" }, { label: "الإجمالي شامل الضريبة", value: fmt(tot) + " ر.س", green: true }];
  } else if (reportId === "fixed-expenses") {
    title = "نقطة التعادل — عدة فروع"; periodLabel = `الشهر: ${month}`; filename = `التعادل_عدة_فروع_${month}`;
    headers = ["الفرع", "المبيعات", "تكاليف ثابتة", "تكاليف متغيرة", "نقطة التعادل", "المستهدف", "صافي الربح"];
    let sa = 0, fx = 0, vr = 0, be = 0, tg = 0, pr = 0;
    for (const b of branches) { const s = await breakevenSummary(b.id, month); sa += s.sales; fx += s.fixed; vr += s.variable; be += s.be; tg += s.target; pr += s.profit;
      body.push([b.name, fmt(s.sales), fmt(s.fixed), fmt(s.variable), `<b style="color:#b45309;">${fmt(s.be)}</b>`, fmt(s.target), prCol(s.profit)]); }
    total = ["الإجمالي", fmt(sa), fmt(fx), fmt(vr), fmt(be), fmt(tg), fmt(pr)];
    cards = [{ label: "عدد الفروع", value: String(n) }, { label: "إجمالي المبيعات", value: fmt(sa) + " ر.س" }, { label: "إجمالي نقطة التعادل", value: fmt(be) + " ر.س" }, { label: "إجمالي صافي الربح", value: fmt(pr) + " ر.س", green: true }];
  } else if (reportId === "financial-report") {
    title = "التقرير المالي — عدة فروع"; periodLabel = `الشهر: ${month}`; filename = `التقرير_المالي_عدة_فروع_${month}`;
    headers = ["الفرع", "إجمالي المبيعات", "صافي المبيعات", "إجمالي التكاليف", "صافي الربح", "هامش %"];
    let gr = 0, nt = 0, co = 0, pr = 0;
    for (const b of branches) { const s = await financialSummary(b.id, month); gr += s.gross; nt += s.net; co += s.costs; pr += s.profit;
      body.push([b.name, `<b style="color:#15a06a;">${fmt(s.gross)}</b>`, fmt(s.net), col(fmt(s.costs), "#b45309"), prCol(s.profit), (s.gross > 0 ? s.margin : 0).toFixed(1) + "%"]); }
    total = ["الإجمالي", fmt(gr), fmt(nt), fmt(co), fmt(pr), (gr > 0 ? (pr / gr) * 100 : 0).toFixed(1) + "%"];
    cards = [{ label: "عدد الفروع", value: String(n) }, { label: "إجمالي المبيعات", value: fmt(gr) + " ر.س" }, { label: "إجمالي التكاليف", value: fmt(co) + " ر.س" }, { label: "إجمالي صافي الربح", value: fmt(pr) + " ر.س", green: true }];
  } else {
    return { ok: false, rows: 0, msg: "نوع تقرير غير معروف." };
  }

  emit(mode, title, filename, consolidatedHTML(title, periodLabel, cards, headers, body, total, qr));
  return { ok: true, rows: branches.length };
}
