// =============================================================
// src/pages/orders/components/OrderReportExport.tsx
//
// فلتر بالتاريخ (نطاق حر من→إلى + أزرار سريعة: اليوم/أسبوع/شهر)
// + تصدير تقرير الطلبات المفلترة:
//   - PDF بتصميم E2 (كحلي/رمادي بسيط) عبر نافذة طباعة.
//   - Excel حقيقي (.xlsx) عبر مكتبة xlsx (SheetJS).
//
// مكوّن مستقل — يستقبل قائمة الطلبات (بعد فلترة الحالة/البحث من useOrders)
// ويطبّق عليها فلتر التاريخ داخليًا، ثم يصدّر النتيجة.
//
// التركيب في OrdersPage:
//   import { OrderReportExport } from "./components/OrderReportExport";
//   <OrderReportExport orders={filtered} t={t} isRTL={isRTL} />
//   (مرّر `filtered` من useOrders حتى يحترم فلتر الحالة/البحث الحالي)
//
// يتطلب مرة واحدة:  npm install xlsx
// =============================================================

import { useMemo, useState } from "react";
import { CalendarDays, FileDown, FileSpreadsheet, X } from "lucide-react";
import * as XLSX from "xlsx";

// ── الأنواع (متوافقة مع Order في types بدون استيراد صارم) ──
type ShopLite = { shop_name?: string | null } | null | undefined;
type OrderLite = {
  id: number | string;
  from_shop_id?: number;
  to_shop_id?: number;
  from_shop?: ShopLite;
  to_shop?: ShopLite;
  total_amount: number;
  status: string;
  created_at: string;
};

type Props = {
  orders: OrderLite[];
  t: (en: string, ar: string) => string;
  isRTL: boolean;
};

// ── تسميات الحالة بالعربي/الإنجليزي ──
const STATUS_LABELS: Record<string, { ar: string; en: string }> = {
  pending:            { ar: "قيد الانتظار", en: "Pending" },
  partially_approved: { ar: "تحويل جزئي",   en: "Partially Approved" },
  approved:           { ar: "معتمد",        en: "Approved" },
  completed:          { ar: "مكتمل",        en: "Completed" },
  rejected:           { ar: "ملغى",         en: "Cancelled" },
};

const statusLabel = (s: string, lang: "ar" | "en") =>
  STATUS_LABELS[s] ? STATUS_LABELS[s][lang] : s;

// ── أدوات التاريخ ──
const toYMD = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const fmtDate = (iso: string, lang: "ar" | "en") =>
  new Date(iso).toLocaleDateString(lang === "ar" ? "ar-SA" : "en-SA",
    { year: "numeric", month: "2-digit", day: "2-digit" });

export function OrderReportExport({ orders, t, isRTL }: Props) {
  const lang: "ar" | "en" = isRTL ? "ar" : "en";
  const [from, setFrom] = useState<string>("");
  const [to, setTo]     = useState<string>("");

  // أزرار سريعة
  const applyQuick = (kind: "today" | "week" | "month") => {
    const now = new Date();
    const start = new Date();
    if (kind === "today") start.setTime(startOfToday().getTime());
    else if (kind === "week") { start.setDate(now.getDate() - 6); start.setHours(0, 0, 0, 0); }
    else { start.setMonth(now.getMonth() - 1); start.setHours(0, 0, 0, 0); }
    setFrom(toYMD(start));
    setTo(toYMD(now));
  };

  const clearDates = () => { setFrom(""); setTo(""); };

  // تطبيق فلتر التاريخ على الطلبات الواردة (بحد اليوم شامل)
  const filtered = useMemo(() => {
    const fromMs = from ? new Date(from + "T00:00:00").getTime() : -Infinity;
    const toMs   = to   ? new Date(to   + "T23:59:59").getTime() :  Infinity;
    return orders.filter((o) => {
      const ts = new Date(o.created_at).getTime();
      return ts >= fromMs && ts <= toMs;
    });
  }, [orders, from, to]);

  // ملخّص التقرير
  const summary = useMemo(() => {
    let total = 0;
    const byStatus: Record<string, number> = {};
    for (const o of filtered) {
      total += Number(o.total_amount || 0);
      byStatus[o.status] = (byStatus[o.status] || 0) + 1;
    }
    return { count: filtered.length, total, byStatus };
  }, [filtered]);

  const rangeText = () => {
    if (from && to) return `${fmtDate(from + "T00:00:00", lang)} — ${fmtDate(to + "T00:00:00", lang)}`;
    if (from) return `${t("From", "من")} ${fmtDate(from + "T00:00:00", lang)}`;
    if (to)   return `${t("Until", "حتى")} ${fmtDate(to + "T00:00:00", lang)}`;
    return t("All dates", "كل التواريخ");
  };

  const disabled = filtered.length === 0;

  // ── تصدير Excel حقيقي (.xlsx) ──
  const exportExcel = () => {
    const header = [
      t("Order No.", "رقم الطلب"),
      t("From", "من"),
      t("To", "إلى"),
      t("Amount (SAR)", "المبلغ (ر.س)"),
      t("Status", "الحالة"),
      t("Date", "التاريخ"),
    ];
    const rows = filtered.map((o) => [
      `#${String(o.id).padStart(5, "0")}`,
      o.from_shop?.shop_name ?? "—",
      o.to_shop?.shop_name ?? "—",
      Number(o.total_amount || 0),
      statusLabel(o.status, lang),
      fmtDate(o.created_at, lang),
    ]);
    // صف الإجمالي
    rows.push([]);
    rows.push([
      t("Total", "الإجمالي"),
      "", "",
      summary.total,
      `${summary.count} ${t("orders", "طلب")}`,
      rangeText(),
    ]);

    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    ws["!cols"] = [{ wch: 12 }, { wch: 22 }, { wch: 22 }, { wch: 14 }, { wch: 16 }, { wch: 14 }];
    // اتجاه الورقة من اليمين لليسار للعربية
    ws["!views"] = [{ RTL: lang === "ar" }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, t("Orders", "الطلبات"));
    const stamp = toYMD(new Date());
    XLSX.writeFile(wb, `orders-report-${stamp}.xlsx`);
  };

  // ── تصدير PDF بتصميم E2 (نافذة طباعة) ──
  const exportPDF = () => {
    const html = buildReportHTML(filtered, summary, rangeText(), lang, t);
    const w = window.open("", "_blank", "width=1000,height=1100");
    if (!w) return;
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
  };

  return (
    <div className="mb-5 rounded-2xl border border-slate-800 bg-slate-900 p-4" dir={isRTL ? "rtl" : "ltr"}>
      <div className="flex flex-col lg:flex-row lg:items-end gap-4">

        {/* فلتر التاريخ */}
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <CalendarDays size={15} className="text-blue-400" />
            <span className="text-xs font-bold text-slate-300">{t("Filter by date", "فلترة بالتاريخ")}</span>
            <span className="text-[11px] text-slate-500">· {rangeText()}</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* من */}
            <div className="flex items-center gap-1.5">
              <label className="text-[11px] text-slate-500 w-6">{t("From", "من")}</label>
              <input
                type="date"
                value={from}
                max={to || undefined}
                onChange={(e) => setFrom(e.target.value)}
                className="h-9 bg-slate-950 border border-slate-700 rounded-lg px-2 text-xs text-white focus:outline-none focus:border-blue-500/60"
              />
            </div>
            {/* إلى */}
            <div className="flex items-center gap-1.5">
              <label className="text-[11px] text-slate-500 w-6">{t("To", "إلى")}</label>
              <input
                type="date"
                value={to}
                min={from || undefined}
                onChange={(e) => setTo(e.target.value)}
                className="h-9 bg-slate-950 border border-slate-700 rounded-lg px-2 text-xs text-white focus:outline-none focus:border-blue-500/60"
              />
            </div>

            {/* أزرار سريعة */}
            <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-lg p-1">
              <button onClick={() => applyQuick("today")} className="px-2.5 py-1.5 rounded-md text-[11px] font-bold text-slate-400 hover:text-white hover:bg-slate-800 transition-all">{t("Today", "اليوم")}</button>
              <button onClick={() => applyQuick("week")}  className="px-2.5 py-1.5 rounded-md text-[11px] font-bold text-slate-400 hover:text-white hover:bg-slate-800 transition-all">{t("Week", "أسبوع")}</button>
              <button onClick={() => applyQuick("month")} className="px-2.5 py-1.5 rounded-md text-[11px] font-bold text-slate-400 hover:text-white hover:bg-slate-800 transition-all">{t("Month", "شهر")}</button>
            </div>

            {(from || to) && (
              <button onClick={clearDates} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-slate-400 hover:text-red-400 border border-slate-800 hover:border-red-500/30 transition-all">
                <X size={12} /> {t("Clear", "مسح")}
              </button>
            )}
          </div>
        </div>

        {/* أزرار التصدير */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-500 hidden lg:block">
            {summary.count} {t("orders", "طلب")}
          </span>
          <button
            onClick={exportPDF}
            disabled={disabled}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <FileDown size={15} /> {t("Export PDF", "تصدير PDF")}
          </button>
          <button
            onClick={exportExcel}
            disabled={disabled}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <FileSpreadsheet size={15} /> {t("Export Excel", "تصدير Excel")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// PDF (E2 theme) — سلسلة HTML تُفتح في نافذة طباعة
// ============================================================

const ACCENT = "#1f3a5f";
const LINE   = "#b9bec4";
const LINE_S = "#dde1e5";
const FILL   = "#eef1f4";
const FILL2  = "#f7f9fa";
const INK    = "#151515";
const SOFT   = "#4a4f55";
const FAINT  = "#7c828a";

function esc(s: unknown): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildReportHTML(
  orders: OrderLite[],
  summary: { count: number; total: number; byStatus: Record<string, number> },
  rangeText: string,
  lang: "ar" | "en",
  t: (en: string, ar: string) => string,
): string {
  const dir = lang === "ar" ? "rtl" : "ltr";
  const now = new Date();
  const printDate = now.toLocaleDateString(lang === "ar" ? "ar-SA" : "en-SA", { year: "numeric", month: "long", day: "numeric" });
  const printTime = now.toLocaleTimeString(lang === "ar" ? "ar-SA" : "en-SA", { hour: "2-digit", minute: "2-digit" });

  const rows = orders.map((o, i) => {
    const zebra = i % 2 === 0 ? "#fff" : FILL2;
    return `<tr style="background:${zebra}">
      <td style="padding:7px 9px;border:1px solid ${LINE};font-family:monospace;font-size:11px;color:${SOFT};text-align:center;">#${esc(String(o.id).padStart(5, "0"))}</td>
      <td style="padding:7px 9px;border:1px solid ${LINE};font-size:11.5px;font-weight:600;color:${INK};">${esc(o.from_shop?.shop_name ?? "—")}</td>
      <td style="padding:7px 9px;border:1px solid ${LINE};font-size:11.5px;font-weight:600;color:${INK};">${esc(o.to_shop?.shop_name ?? "—")}</td>
      <td style="padding:7px 9px;border:1px solid ${LINE};font-family:monospace;font-size:11.5px;font-weight:700;color:${INK};text-align:left;">${Number(o.total_amount || 0).toLocaleString("en-SA")}<span style="font-size:8px;color:${FAINT};"> ر.س</span></td>
      <td style="padding:7px 9px;border:1px solid ${LINE};font-size:11px;color:${SOFT};text-align:center;">${esc(statusLabel(o.status, lang))}</td>
      <td style="padding:7px 9px;border:1px solid ${LINE};font-size:11px;color:${SOFT};text-align:center;">${esc(fmtDate(o.created_at, lang))}</td>
    </tr>`;
  }).join("");

  const statusChips = Object.entries(summary.byStatus).map(([s, n]) =>
    `<span style="display:inline-block;font-size:10.5px;color:${SOFT};border:1px solid ${LINE_S};border-radius:20px;padding:3px 11px;margin:2px;">${esc(statusLabel(s, lang))}: <b style="color:${INK};">${n}</b></span>`
  ).join("");

  const kpi = (val: string, label: string, color: string, border: boolean) =>
    `<div style="text-align:center;${border ? `border-left:1px solid ${LINE_S};` : ""}">
      <div style="font-size:20px;font-weight:800;color:${color};font-family:monospace;">${val}</div>
      <div style="font-size:9px;font-weight:600;letter-spacing:.4px;text-transform:uppercase;color:${FAINT};">${label}</div>
    </div>`;

  return `<!DOCTYPE html><html lang="${lang}" dir="${dir}">
<head><meta charset="UTF-8"><title>${t("Orders Report", "تقرير الطلبات")}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700;800&display=swap');
@page{size:A4 portrait;margin:10mm 0;}
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'IBM Plex Sans Arabic',Tahoma,Arial,sans-serif;color:${INK};background:#e7eaed;line-height:1.5;-webkit-print-color-adjust:exact;print-color-adjust:exact;display:flex;justify-content:center;}
.toolbar{position:fixed;top:0;left:0;right:0;z-index:9;display:flex;align-items:center;justify-content:space-between;gap:16px;background:#0f172a;color:#e2e8f0;padding:11px 22px;font-size:13px;font-weight:600;}
.toolbar button{background:#f8fafc;color:#0f172a;border:0;border-radius:8px;padding:9px 20px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;}
.page{width:100%;max-width:760px;background:#fff;margin:56px 10mm 20px;padding:14mm 12mm;box-shadow:0 8px 30px rgba(2,6,23,.12);}
@media print{ html,body{background:#fff;} .toolbar{display:none;} .page{max-width:100%;margin:0;padding:0;box-shadow:none;} tr,thead{page-break-inside:avoid;} }
</style></head><body>
<div class="toolbar">
  <span>${lang === "ar" ? "معاينة التقرير — اختر «طباعة» ثم «حفظ كـPDF»" : "Report preview — choose Print then Save as PDF"}</span>
  <button onclick="window.print()">🖨 ${lang === "ar" ? "طباعة / حفظ PDF" : "Print / Save PDF"}</button>
</div>
<div class="page">

  <!-- HEADER -->
  <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding-bottom:12px;border-bottom:2px solid ${ACCENT};">
    <div>
      <div style="font-weight:800;font-size:24px;color:${ACCENT};line-height:1;">محور <span style="font-size:10px;font-weight:400;letter-spacing:1.5px;color:${FAINT};">MIHWAR B2B</span></div>
      <div style="font-size:9.5px;color:${SOFT};margin-top:6px;">${t("Auto Parts Trading Network", "شبكة محور لقطع الغيار")}</div>
    </div>
    <div style="text-align:${lang === "ar" ? "left" : "right"};">
      <div style="font-size:17px;font-weight:700;color:${ACCENT};">${t("Orders Report", "تقرير الطلبات")}</div>
      <div style="font-size:8.5px;font-weight:600;color:${FAINT};letter-spacing:2px;text-transform:uppercase;">ORDERS REPORT</div>
      <div style="font-size:10px;color:${SOFT};margin-top:5px;">${esc(rangeText)}</div>
    </div>
  </div>

  <!-- SUMMARY -->
  <div style="margin-top:14px;border:1px solid ${LINE};border-radius:8px;overflow:hidden;">
    <div style="background:${FILL};padding:8px 14px;border-bottom:1px solid ${LINE_S};"><span style="font-size:12px;font-weight:700;color:${ACCENT};">${t("Summary", "الملخص")}</span></div>
    <div style="display:grid;grid-template-columns:repeat(2,1fr);padding:13px 16px;">
      ${kpi(String(summary.count), t("Total Orders", "عدد الطلبات"), INK, false)}
      ${kpi(summary.total.toLocaleString("en-SA") + " ر.س", t("Total Value", "إجمالي القيمة"), ACCENT, true)}
    </div>
    <div style="padding:0 16px 12px;">${statusChips || ""}</div>
  </div>

  <!-- TABLE -->
  <div style="margin-top:14px;">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
      <div style="width:4px;height:18px;background:${ACCENT};border-radius:3px;"></div>
      <div style="font-size:13px;font-weight:700;color:${INK};">${t("Orders", "الطلبات")}</div>
    </div>
    <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
      <thead>
        <tr style="background:${ACCENT};">
          <th style="padding:8px 9px;border:1px solid ${ACCENT};font-size:9px;font-weight:600;text-transform:uppercase;color:#fff;text-align:center;width:70px;">${t("Order No.", "رقم الطلب")}</th>
          <th style="padding:8px 9px;border:1px solid ${ACCENT};font-size:9px;font-weight:600;text-transform:uppercase;color:#fff;text-align:right;">${t("From", "من")}</th>
          <th style="padding:8px 9px;border:1px solid ${ACCENT};font-size:9px;font-weight:600;text-transform:uppercase;color:#fff;text-align:right;">${t("To", "إلى")}</th>
          <th style="padding:8px 9px;border:1px solid ${ACCENT};font-size:9px;font-weight:600;text-transform:uppercase;color:#fff;text-align:left;width:90px;">${t("Amount", "المبلغ")}</th>
          <th style="padding:8px 9px;border:1px solid ${ACCENT};font-size:9px;font-weight:600;text-transform:uppercase;color:#fff;text-align:center;width:80px;">${t("Status", "الحالة")}</th>
          <th style="padding:8px 9px;border:1px solid ${ACCENT};font-size:9px;font-weight:600;text-transform:uppercase;color:#fff;text-align:center;width:80px;">${t("Date", "التاريخ")}</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr style="background:${FILL};">
          <td colspan="3" style="padding:9px;border:1px solid ${LINE};font-size:12px;font-weight:700;color:${ACCENT};text-align:${lang === "ar" ? "left" : "right"};">${t("Total", "الإجمالي")}</td>
          <td style="padding:9px;border:1px solid ${LINE};font-family:monospace;font-size:13px;font-weight:800;color:${ACCENT};text-align:left;">${summary.total.toLocaleString("en-SA")}<span style="font-size:8px;color:${FAINT};"> ر.س</span></td>
          <td colspan="2" style="padding:9px;border:1px solid ${LINE};font-size:11px;color:${SOFT};text-align:center;">${summary.count} ${t("orders", "طلب")}</td>
        </tr>
      </tfoot>
    </table>
  </div>

  <!-- FOOTER -->
  <div style="margin-top:16px;padding-top:12px;border-top:1px solid ${LINE};display:flex;justify-content:space-between;align-items:center;">
    <div style="font-size:9px;color:${FAINT};">
      <span style="font-weight:700;color:${ACCENT};">محور · MIHWAR B2B</span> · ${t("Generated electronically", "أُنشئ إلكترونيًا")}
    </div>
    <div style="font-size:9px;color:${FAINT};font-family:monospace;">${esc(printDate)} ${esc(printTime)}</div>
  </div>

</div></body></html>`;
}
