// =============================================================
// src/pages/finance/FinancialReportPage.tsx
//
// التقرير المالي الشهري — يجمّع تلقائيًا من كل صفحات محور.
// التخزين الآن على Supabase (cafeDb): المبيعات + المشتريات + المصروفات
// الثابتة + عمولات التطبيقات، فيتزامن بين كل المتصفحات.
// يطلع: قائمة الربح والخسارة بمقارنة شهرين، نقطة التعادل، وتصدير PDF/Excel.
// =============================================================

import { useMemo, useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import { useLang, tNow } from "../../context/LanguageContext";
import { supabase } from "../lib/supabase";
import {
  fetchSalesWithMigration, fetchPurchasesWithMigration,
  getSettingWithMigration, setSetting, SETTING_KEYS, LOCAL_KEYS,
} from "../lib/cafeDb";
import { logoBox, contactFooter, waQrDataUrl, SUPPORT_WA } from "../lib/reportChrome";

import { curAr, curEn } from "../lib/orgConfig";
import { exportHtmlTablesXlsx } from "../accounting/journal/exportKit";
const VAT_DIV = 1.15;

const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt0 = (n: number) => Math.round(n).toLocaleString("en-US");
const num = (v: any) => parseFloat(v) || 0;

const salaryMonthly = (s: any) => {
  const amt = num(s.amount);
  const def = s.type === "daily" ? 30 : s.type === "weekly" ? 4 : 1;
  const c = s.count != null && String(s.count).trim() ? num(s.count) : def;
  return s.type === "monthly" ? amt : amt * c;
};

function prevMonth(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
const monthLabel = (ym: string) => {
  const names = tNow("x", "ar") === "ar"
    ? ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"]
    : ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const [y, m] = ym.split("-").map(Number);
  return `${names[m - 1]} ${y}`;
};

const BASE_CH_AR: Record<string, string> = { cash: "نقدي", net: "شبكة (مدى)", keeta: "كيتا", hunger: "هنقرستيشن", jahez: "جاهز", trans: "تحويل بنكي", refund: "مرتجع" };
const BASE_CH_EN: Record<string, string> = { cash: "Cash", net: "Card (Mada)", keeta: "Keeta", hunger: "HungerStation", jahez: "Jahez", trans: "Bank transfer", refund: "Refund" };
const baseCh = (id: string): string | undefined => (tNow("x", "ar") === "ar" ? BASE_CH_AR[id] : BASE_CH_EN[id]);
const DEFAULT_RATE: Record<string, string> = { keeta: "25", hunger: "25", jahez: "25" };
const NON_COMM = new Set(["cash", "net", "trans", "refund"]);

// ── مساعدات تحسب من الصفوف المحمّلة (بدل localStorage) ──
function salesMonthFrom(rows: any[], ym: string) {
  const r = rows.filter((e: any) => (e.date || "").slice(0, 7) === ym);
  const gross = r.reduce((s: number, e: any) => s + (e.gAct || 0), 0);
  const perCh: Record<string, number> = {};
  r.forEach((e: any) => Object.entries(e.perChannelActual || {}).forEach(([k, v]) => { perCh[k] = (perCh[k] || 0) + (v as number); }));
  return { gross, perCh };
}
function purchMonthFrom(rows: any[], ym: string) {
  return rows.filter((e: any) => (e.date || "").slice(0, 7) === ym).reduce((s: number, e: any) => s + ((e.subtotal ?? e.total) || 0), 0);
}
function channelNameFrom(salesRows: any[], id: string) {
  { const b = baseCh(id); if (b) return b; }
  for (const e of salesRows) { const c = (e.customChannels || []).find((x: any) => x.id === id); if (c) return c.nm; }
  return id;
}

type Comm = Record<string, string>;

function buildFin(branchId: number | null, ym: string, orders: any[], comm: Comm, fe: { salaries: any[]; items: any[] }, salesRows: any[], purchRows: any[]) {
  const s = salesMonthFrom(salesRows, ym);
  const gross = s.gross;
  const net = gross / VAT_DIV;
  const purchases = purchMonthFrom(purchRows, ym);
  const inMonth = orders.filter((o) => (o.created_at || "").slice(0, 7) === ym && (o.status === "completed" || o.status === "partially_approved"));
  const transIn = inMonth.filter((o) => o.to_shop_id === branchId).reduce((a, o) => a + (o.total_amount || 0), 0);
  const transOut = inMonth.filter((o) => o.from_shop_id === branchId).reduce((a, o) => a + (o.total_amount || 0), 0);
  const cogs = purchases + transIn - transOut;
  const commByCh: { id: string; name: string; sales: number; rate: number; amount: number }[] = [];
  Object.entries(s.perCh).forEach(([id, v]) => {
    if (NON_COMM.has(id) || (v as number) <= 0) return;
    const rate = num(comm[id] ?? DEFAULT_RATE[id] ?? "0");
    if (rate <= 0) return;
    commByCh.push({ id, name: channelNameFrom(salesRows, id), sales: v as number, rate, amount: (v as number) * rate / 100 });
  });
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

const changeNote = (cur: number, prev: number) => {
  const t = tNow;
  const d = cur - prev;
  if (Math.abs(d) < 0.01) return t("No change", "بلا تغيير");
  const pct = prev !== 0 ? Math.abs((d / prev) * 100) : 0;
  return t(`${d > 0 ? "Up" : "Down"} ${fmt(Math.abs(d))} (${pct.toFixed(1)}%)`, `${d > 0 ? "ارتفع" : "انخفض"} ${fmt(Math.abs(d))} بنسبة ${pct.toFixed(1)}%`);
};

export default function FinancialReportPage() {
  const { t, isRTL } = useLang();
  const dir = isRTL ? "rtl" : "ltr";
  const { ownedShopId } = (useAuth() as any) ?? {};
  const [branch, setBranch] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const waNum = SUPPORT_WA;
  const [qr, setQr] = useState<string>("");
  useEffect(() => {
    let active = true;
    (async () => {
      if (!ownedShopId) { setBranch(""); setLogoUrl(null); return; }
      const { data } = await supabase.from("shops").select("shop_name, logo_url").eq("id", ownedShopId).single();
      if (active && data) {
        setBranch((data as any).shop_name ?? "");
        setLogoUrl((data as any).logo_url ?? null);
      }
    })();
    return () => { active = false; };
  }, [ownedShopId]);
  useEffect(() => { let a = true; (async () => { const d = await waQrDataUrl(waNum); if (a) setQr(d); })(); return () => { a = false; }; }, [waNum]);

  const [orders, setOrders] = useState<any[]>([]);
  useEffect(() => {
    let active = true;
    (async () => {
      if (!ownedShopId) { setOrders([]); return; }
      const { data } = await supabase.from("orders").select("id, from_shop_id, to_shop_id, status, total_amount, created_at").or(`from_shop_id.eq.${ownedShopId},to_shop_id.eq.${ownedShopId}`);
      if (active) setOrders(data || []);
    })();
    return () => { active = false; };
  }, [ownedShopId]);

  // بيانات الفرع من Supabase
  const [salesRows, setSalesRows] = useState<any[]>([]);
  const [purchRows, setPurchRows] = useState<any[]>([]);
  const [fe, setFe] = useState<{ salaries: any[]; items: any[] }>({ salaries: [], items: [] });
  const [comm, setComm] = useState<Comm>({ ...DEFAULT_RATE });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const [s, p, feCfg, commCfg] = await Promise.all([
        fetchSalesWithMigration(ownedShopId ?? null),
        fetchPurchasesWithMigration(ownedShopId ?? null),
        getSettingWithMigration(ownedShopId ?? null, SETTING_KEYS.fixedExpenses, LOCAL_KEYS.FE_LKEY, { salaries: [], items: [] }),
        getSettingWithMigration(ownedShopId ?? null, SETTING_KEYS.appCommissions, LOCAL_KEYS.COMM_LKEY, { ...DEFAULT_RATE }),
      ]);
      if (!active) return;
      setSalesRows(s || []);
      setPurchRows(p || []);
      setFe(feCfg && Array.isArray(feCfg.salaries) ? { salaries: feCfg.salaries, items: feCfg.items || [] } : { salaries: [], items: [] });
      setComm({ ...DEFAULT_RATE, ...(commCfg || {}) });
      setReady(true);
    })();
    return () => { active = false; };
  }, [ownedShopId]);
  useEffect(() => { if (ready) setSetting(ownedShopId ?? null, SETTING_KEYS.appCommissions, comm); }, [comm, ready, ownedShopId]);

  const months = useMemo(() => {
    const set = new Set<string>();
    salesRows.forEach((e) => e.date && set.add(e.date.slice(0, 7)));
    purchRows.forEach((e) => e.date && set.add(e.date.slice(0, 7)));
    const list = [...set].sort().reverse();
    const now = new Date().toISOString().slice(0, 7);
    if (!list.includes(now)) list.unshift(now);
    return list;
  }, [salesRows, purchRows]);

  const [month, setMonth] = useState("");
  const [compare, setCompare] = useState(false);
  const [cmpMonth, setCmpMonth] = useState("");
  useEffect(() => {
    const first = months[0] || new Date().toISOString().slice(0, 7);
    setMonth(first); setCmpMonth(months[1] || prevMonth(first));
  }, [months]);
  const pm = cmpMonth || prevMonth(month || new Date().toISOString().slice(0, 7));

  const chName = (id: string) => channelNameFrom(salesRows, id);

  const cur: Fin = useMemo(() => buildFin(ownedShopId ?? null, month, orders, comm, fe, salesRows, purchRows), [ownedShopId, month, orders, comm, fe, salesRows, purchRows]);
  const prev: Fin = useMemo(() => buildFin(ownedShopId ?? null, pm, orders, comm, fe, salesRows, purchRows), [ownedShopId, pm, orders, comm, fe, salesRows, purchRows]);
  const commChannels = useMemo(() => {
    const ids = new Set<string>([...Object.keys(cur.perCh), ...Object.keys(prev.perCh)]);
    ["keeta", "hunger", "jahez"].forEach((x) => ids.add(x));
    return [...ids].filter((id) => !NON_COMM.has(id));
  }, [cur, prev]);

  // صفوف قائمة الربح والخسارة
  const plRows: { label: string; c: number; p: number; bold?: boolean; hl?: "green" | "gray" }[] = [
    { label: t("Total sales", "إجمالي المبيعات"), c: cur.gross, p: prev.gross, bold: true },
    { label: t("Net sales after 15% tax", "صافي المبيعات بعد خصم الضريبة 15%"), c: cur.net, p: prev.net },
    { label: t("Materials / purchases cost (net)", "تكلفة المواد / المشتريات (صافي)"), c: cur.purchases, p: prev.purchases },
    { label: t("Incoming orders cost (workshop)", "تكلفة الطلبات الواردة (المعمل)"), c: cur.transIn, p: prev.transIn },
    ...(cur.transOut || prev.transOut ? [{ label: t("Outgoing transfer (−)", "تحويل صادر (−)"), c: -cur.transOut, p: -prev.transOut }] : []),
    { label: t("Total cost / purchases & workshop", "إجمالي التكلفة / المشتريات والمعمل"), c: cur.cogs, p: prev.cogs, bold: true },
    { label: t("Delivery app commissions", "عمولات تطبيقات التوصيل"), c: cur.commission, p: prev.commission },
    { label: t("Salaries", "الرواتب"), c: cur.salaries, p: prev.salaries },
    ...cur.items.map((it, i) => ({ label: it.name, c: it.amount, p: prev.items[i]?.amount ?? it.amount })),
    { label: t("Total costs", "إجمالي التكاليف"), c: cur.totalCosts, p: prev.totalCosts, bold: true, hl: "gray" as const },
    { label: t("Net profit / (loss)", "صافي الربح / (الخسارة)"), c: cur.netProfit, p: prev.netProfit, bold: true, hl: "green" as const },
  ];

  // ── تصدير PDF ──
  const buildHTML = () => {
    const now = new Date().toLocaleString("ar-SA");
    const th = (t: string, bg = "#14304d") => `<th style="border:1px solid #cbd5e1;padding:7px 10px;background:${bg};color:#fff;font-size:12px;font-weight:700;">${t}</th>`;
    const tdL = (t: string, b = false) => `<td style="border:1px solid #e5e7eb;padding:6px 10px;font-size:12px;text-align:start;font-weight:${b ? 800 : 600};color:#1f2937;">${t}</td>`;
    const tdN = (t: string, color = "#15803d", b = false) => `<td style="border:1px solid #e5e7eb;padding:6px 10px;font-size:12px;text-align:center;font-weight:${b ? 800 : 600};color:${color};">${t}</td>`;
    const tdNote = (t: string) => `<td style="border:1px solid #e5e7eb;padding:6px 10px;font-size:10px;text-align:start;color:#6b7280;">${t}</td>`;

    const plBody = plRows.map((r) => {
      const rowBg = r.hl === "green" ? "background:#dcfce7;" : r.hl === "gray" ? "background:#f1f5f9;" : "";
      const cv = fmt(r.c) + " " + curEn();
      const pv = fmt(r.p) + " " + curEn();
      return `<tr style="${rowBg}">${tdL(r.label, r.bold)}${tdN(cv, "#15803d", r.bold)}${compare ? tdN(pv, "#334155", r.bold) + tdNote(changeNote(r.c, r.p)) : ""}</tr>`;
    }).join("");
    const marginRow = `<tr style="background:#dcfce7;">${tdL(t("Profit margin", "هامش الربح"), true)}${tdN(cur.margin.toFixed(1) + "%", "#15803d", true)}${compare ? tdN(prev.margin.toFixed(1) + "%", "#334155", true) + tdNote((cur.margin - prev.margin >= 0 ? t("Improved ", "تحسّن ") : t("Declined ", "تراجع ")) + Math.abs(cur.margin - prev.margin).toFixed(1) + t(" pts", " نقطة")) : ""}</tr>`;

    const commIds = [...new Set([...cur.commByCh.map((c) => c.id), ...prev.commByCh.map((c) => c.id)])];
    const appRows = commIds.map((id) => {
      const cc = cur.commByCh.find((c) => c.id === id); const pc = prev.commByCh.find((c) => c.id === id);
      const rate = cc ? cc.rate : (pc ? pc.rate : num(comm[id] || "0"));
      return `<tr>${tdL(chName(id))}${tdN(fmt(cc ? cc.sales : 0), "#334155")}${compare ? tdN(fmt(pc ? pc.sales : 0), "#334155") : ""}${tdNote(t("Commission rate ", "نسبة العمولة ") + rate + "%")}</tr>`;
    }).join("");
    const appTable = commIds.length ? `<table style="border-collapse:collapse;width:100%;margin-top:6px;">
      <tr>${th(t("App commission inputs", "مدخلات عمولة التطبيقات"), "#14304d")}${th(monthLabel(month), "#14304d")}${compare ? th(monthLabel(pm), "#14304d") : ""}${th(t("Note", "ملاحظة"), "#14304d")}</tr>
      ${appRows}
      <tr style="background:#eff6ff;">${tdL(t("Total app sales", "إجمالي مبيعات التطبيقات"), true)}${tdN(fmt(cur.appSales), "#14304d", true)}${compare ? tdN(fmt(prev.appSales), "#14304d", true) : ""}${tdNote(t("Total commission: ", "إجمالي العمولة: ") + fmt(cur.commission) + " " + curEn())}</tr>
    </table>` : "";

    const beRow = (l: string, cv: string, pv: string) => `<tr>${tdL(l)}${tdN(cv, "#334155")}${compare ? tdN(pv, "#334155") : ""}</tr>`;
    const beTable = `<table style="border-collapse:collapse;width:100%;">
      <tr>${th(t("Indicator", "المؤشر"))}${th(monthLabel(month))}${compare ? th(monthLabel(pm)) : ""}</tr>
      ${beRow(t("Actual monthly sales (net)", "المبيعات الشهرية الفعلية (صافي)"), fmt(cur.net) + " " + curEn(), fmt(prev.net) + " " + curEn())}
      ${beRow(t("Monthly fixed costs", "التكاليف الثابتة الشهرية"), fmt(cur.totalFixed) + " " + curEn(), fmt(prev.totalFixed) + " " + curEn())}
      ${beRow(t("Variable costs", "التكاليف المتغيرة"), fmt(cur.variable) + " " + curEn(), fmt(prev.variable) + " " + curEn())}
      ${beRow(t("Variable cost ratio", "نسبة التكاليف المتغيرة"), cur.varPct.toFixed(1) + "%", prev.varPct.toFixed(1) + "%")}
      ${beRow(t("Contribution margin", "هامش المساهمة"), cur.cm.toFixed(1) + "%", prev.cm.toFixed(1) + "%")}
      ${beRow(t("Monthly break-even", "نقطة التعادل الشهرية"), fmt(cur.breakEven) + " " + curEn(), fmt(prev.breakEven) + " " + curEn())}
      ${beRow(t("Daily break-even", "نقطة التعادل اليومية"), fmt(cur.dailyBE) + " " + curEn(), fmt(prev.dailyBE) + " " + curEn())}
    </table>`;

    const feBody = [
      `<tr>${tdL(t("Salaries", "الرواتب"))}${tdN(fmt(cur.salaries), "#334155")}</tr>`,
      ...cur.items.map((it) => `<tr>${tdL(it.name)}${tdN(fmt(it.amount), "#334155")}</tr>`),
      `<tr style="background:#f1f5f9;">${tdL(t("Total fixed expenses", "إجمالي المصروفات الثابتة"), true)}${tdN(fmt(cur.totalFixed), "#0f1b2b", true)}</tr>`,
    ].join("");
    const feTable = `<table style="border-collapse:collapse;width:100%;max-width:520px;"><tr>${th(t("Item", "البند"))}${th(t("Monthly amount", "القيمة الشهرية"))}</tr>${feBody}</table>`;

    const salBody = fe.salaries.filter((s: any) => s.name).map((s: any) => `<tr>${tdL(s.name, true)}${tdN(fmt0(salaryMonthly(s)), "#334155")}${tdNote(s.title || "")}${tdNote(s.note || "")}</tr>`).join("");
    const salTable = fe.salaries.some((s: any) => s.name) ? `<table style="border-collapse:collapse;width:100%;"><tr>${th(t("Employee", "الموظف"))}${th(t("Monthly salary", "الراتب الشهري"))}${th(t("Job title", "الوظيفة"))}${th(t("Notes", "ملاحظات"))}</tr>${salBody}<tr style="background:#f1f5f9;">${tdL(t("Total", "الإجمالي"), true)}${tdN(fmt0(cur.salaries), "#0f1b2b", true)}<td colspan="2" style="border:1px solid #e5e7eb;"></td></tr></table>` : "";

    const header = `<div style="background:#0f1b2b;padding:18px 22px;display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #34d399;"><div style="display:flex;align-items:center;gap:10px;">${logoBox(logoUrl)}<div style="text-align:start;"><div style="font-size:18px;font-weight:800;color:#fff;">${t("MIHWAR", "محور")}</div><div style="font-size:9px;letter-spacing:3px;color:#9fb3c8;">MIHWAR PLATFORM</div></div></div><div style="text-align:end;"><div style="font-size:22px;font-weight:800;color:#34d399;">${t("Monthly financial report —", "التقرير المالي الشهري —")} ${branch || t("Branch", "الفرع")}</div><div style="font-size:12px;color:#9fb3c8;">${compare ? monthLabel(pm) + t(" and ", " و ") + monthLabel(month) : monthLabel(month)} — ${now}</div></div></div>`;
    const card = (l: string, v: string, green = false) => `<div style="flex:1;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:10px 14px;"><div style="font-size:10px;color:#6b7280;font-weight:700;">${l}</div><div style="font-size:16px;font-weight:800;margin-top:3px;color:${green ? "#15a06a" : "#111827"};">${v}</div></div>`;
    const cards = `<div style="display:flex;gap:10px;padding:14px 22px;background:#f8fafc;border-bottom:1px solid #e5e7eb;">${card(t("Branch", "الفرع"), branch || "—")}${card(t("Net sales (", "صافي المبيعات (") + monthLabel(month) + ")", fmt(cur.net) + " " + curEn())}${card(t("Net profit", "صافي الربح"), fmt(cur.netProfit) + " " + curEn(), true)}${card(t("Profit margin", "هامش الربح"), cur.margin.toFixed(1) + "%")}</div>`;
    const sec = (t: string) => `<div style="font-size:16px;font-weight:800;color:#0f1b2b;border-bottom:2px solid #14304d;padding-bottom:4px;margin:18px 0 10px;">${t}</div>`;
    const plHead = `<table style="border-collapse:collapse;width:100%;"><tr>${th(t("Item", "البند"))}${th(monthLabel(pm))}${th(monthLabel(month))}${th(t("Notes", "ملاحظات"))}</tr>${plBody}${marginRow}</table>`;
    const footer = `<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 22px;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:10px;margin-top:16px;gap:12px;"><div><div>${t("This report was generated automatically by the MIHWAR platform", "تم إنشاء هذا التقرير آليًا من منصة محور")}</div><div>MIHWAR B2B Marketplace</div></div>${contactFooter(waNum, qr)}</div>`;
    return `<div dir="${dir}" style="font-family:Tahoma,Arial,sans-serif;color:#1f2937;background:#fff;">${header}${cards}<div style="padding:8px 22px;">${sec(t("1. Profit & loss statement", "أولاً: قائمة الربح والخسارة"))}${plHead}${appTable}${sec(t("2. Break-even point", "ثانياً: نقطة التعادل"))}${beTable}${sec(t("3. Monthly fixed expenses", "ثالثاً: المصروفات الثابتة الشهرية"))}${feTable}${salTable ? sec(t("4. Employees & salaries", "رابعاً: بيانات الموظفين والرواتب")) + salTable : ""}</div>${footer}</div>`;
  };
  const exportPDF = () => {
    const w = window.open("", "_blank", "width=1100,height=900"); if (!w) return;
    w.document.write(`<!DOCTYPE html><html dir="${dir}" lang="${isRTL ? 'ar' : 'en'}" style="color-scheme:light;background:#fff;"><head><meta charset="UTF-8"><meta name="color-scheme" content="light"><style>@page{size:A4 landscape;margin:8mm}@media print{html,body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style><title>${t("Financial report —", "التقرير المالي —")} ${branch}</title></head><body style="margin:0;background:#fff;">${buildHTML()}<script>window.onload=function(){window.print();}<\/script></body></html>`);
    w.document.close();
  };
  const exportExcel = () => {
    exportHtmlTablesXlsx(`${t("Financial_report", "التقرير_المالي")}_${branch || t("branch", "فرع")}_${month}.xlsx`, buildHTML(), {
      rtl: isRTL, sheetNames: [t("Financial report", "التقرير المالي")],
      meta: [t("Financial report", "التقرير المالي"), `${t("Branch", "الفرع")}: ${branch || "—"} | ${month}`],
    });
  };

  const hasData = cur.gross > 0 || prev.gross > 0 || cur.totalFixed > 0;

  // ================= UI =================
  return (
    <div className="p-4 lg:p-6 min-h-screen" dir={dir}>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-3"><span className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-xl">📑</span>{t("Monthly financial report", "التقرير المالي الشهري")}</h1>
          <p className="text-slate-500 text-sm mt-1">{t("Automatic P&L comparing two months + break-even point", "قائمة ربح وخسارة تلقائية بمقارنة شهرين + نقطة التعادل")}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-2"><div className="text-[10px] text-slate-500 font-bold">{t("Branch", "الفرع")}</div><div className="text-sm font-bold text-white">{branch || "—"}</div></div>
      </div>

      {/* أدوات */}
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div className="flex flex-col gap-1"><label className="text-[10px] text-slate-500 font-bold">{t("Month", "الشهر")}</label>
          <select value={month} onChange={(e) => setMonth(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-xl text-white px-3 py-2 text-sm min-w-[150px]">
            {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-300 font-bold pb-2.5"><input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} className="w-4 h-4 accent-blue-500" />{t("Compare with another month", "مقارنة بشهر آخر")}</label>
        {compare && <div className="flex flex-col gap-1"><label className="text-[10px] text-slate-500 font-bold">{t("Comparison month", "شهر المقارنة")}</label>
          <select value={cmpMonth} onChange={(e) => setCmpMonth(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-xl text-white px-3 py-2 text-sm min-w-[150px]">
            {months.filter((m) => m !== month).map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
        </div>}
        <div className="flex gap-2 mr-auto">
          <button onClick={exportPDF} className="px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 font-bold text-xs">⬇ PDF</button>
          <button onClick={exportExcel} className="px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold text-xs">⬇ Excel</button>
        </div>
      </div>

      {/* نسب عمولة التطبيقات */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 mb-4">
        <div className="text-xs font-bold text-white mb-2">{t("Delivery channel commission rates", "نسب عمولة قنوات التوصيل")} <span className="text-slate-500 font-normal">{t("(any delivery channel you add in Sales Reconciliation appears here)", "(أي قناة توصيل تضيفها في تسوية المبيعات تظهر هنا)")}</span></div>
        <div className="flex flex-wrap gap-3">
          {commChannels.map((id) => (
            <div key={id} className="flex items-center gap-2 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2">
              <span className="text-xs text-slate-300 font-bold">{chName(id)}</span>
              <input type="number" value={comm[id] ?? ""} placeholder="0" onChange={(e) => setComm((p) => ({ ...p, [id]: e.target.value }))} className="w-16 bg-slate-900 border border-slate-700 rounded-lg text-white px-2 py-1 text-center font-mono text-xs [direction:ltr]" />
              <span className="text-xs text-slate-500">%</span>
            </div>
          ))}
        </div>
      </div>

      {!hasData ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center text-slate-500 text-sm">{t("Not enough data for this month. Enter sales/purchases/expenses first to see them here.", "لا توجد بيانات كافية لهذا الشهر. أدخل مبيعات/مشتريات/مصروفات أولًا لتظهر هنا.")}</div>
      ) : (
        <>
          {/* بطاقات سريعة */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4"><div className="text-[10px] text-slate-500 font-bold">{t("Total sales", "إجمالي المبيعات")}</div><div className="text-xl font-black font-mono mt-1 text-white [direction:ltr]">{fmt0(cur.gross)}</div></div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4"><div className="text-[10px] text-slate-500 font-bold">{t("Total costs", "إجمالي التكاليف")}</div><div className="text-xl font-black font-mono mt-1 text-amber-400 [direction:ltr]">{fmt0(cur.totalCosts)}</div></div>
            <div className="bg-gradient-to-br from-emerald-600/20 to-slate-900 border border-emerald-500/20 rounded-2xl p-4"><div className="text-[10px] text-slate-400 font-bold">{t("Net profit", "صافي الربح")}</div><div className={`text-2xl font-black font-mono mt-1 [direction:ltr] ${cur.netProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmt0(cur.netProfit)}</div></div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4"><div className="text-[10px] text-slate-500 font-bold">{t("Profit margin", "هامش الربح")}</div><div className="text-xl font-black font-mono mt-1 text-white [direction:ltr]">{cur.margin.toFixed(1)}%</div></div>
          </div>

          {/* قائمة الربح والخسارة */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden mb-4">
            <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2"><span className="w-1 h-4 rounded bg-blue-500" /><h2 className="text-sm font-bold text-white">{t("Profit & loss statement", "قائمة الربح والخسارة")}</h2></div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse" style={{ minWidth: compare ? 640 : 380 }}>
                <thead><tr>{[t("Item", "البند"), monthLabel(month), ...(compare ? [monthLabel(pm), t("Notes", "ملاحظات")] : [])].map((h) => <th key={h} className="text-[10px] px-3 py-2.5 bg-slate-950 text-slate-500 whitespace-nowrap border-b border-slate-700">{h}</th>)}</tr></thead>
                <tbody>
                  {plRows.map((r, i) => (
                    <tr key={i} className={r.hl === "green" ? "bg-emerald-500/[0.07]" : r.hl === "gray" ? "bg-white/[0.02]" : ""}>
                      <td className={`px-3 py-2 text-xs text-right border-b border-slate-800 ${r.bold ? "font-bold text-white" : "text-slate-300"}`}>{r.label}</td>
                      <td className={`px-3 py-2 text-xs text-center font-mono [direction:ltr] border-b border-slate-800 ${r.hl === "green" ? (r.c >= 0 ? "text-emerald-400 font-bold" : "text-red-400 font-bold") : "text-slate-200 font-semibold"}`}>{fmt0(r.c)}</td>
                      {compare && <td className="px-3 py-2 text-xs text-center font-mono text-slate-400 [direction:ltr] border-b border-slate-800">{fmt0(r.p)}</td>}
                      {compare && <td className="px-3 py-2 text-[10px] text-right text-slate-500 border-b border-slate-800">{changeNote(r.c, r.p)}</td>}
                    </tr>
                  ))}
                  <tr className="bg-emerald-500/[0.07]">
                    <td className="px-3 py-2 text-xs text-right font-bold text-white border-b border-slate-800">{t("Profit margin", "هامش الربح")}</td>
                    <td className="px-3 py-2 text-xs text-center font-mono font-bold text-emerald-400 [direction:ltr] border-b border-slate-800">{cur.margin.toFixed(1)}%</td>
                    {compare && <td className="px-3 py-2 text-xs text-center font-mono text-slate-400 [direction:ltr] border-b border-slate-800">{prev.margin.toFixed(1)}%</td>}
                    {compare && <td className="px-3 py-2 text-[10px] text-right text-slate-500 border-b border-slate-800">{(cur.margin - prev.margin >= 0 ? t("Improved ", "تحسّن ") : t("Declined ", "تراجع ")) + Math.abs(cur.margin - prev.margin).toFixed(1) + t(" pts", " نقطة")}</td>}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* عمولات التطبيقات + نقطة التعادل */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2"><span className="w-1 h-4 rounded bg-blue-500" /><h2 className="text-sm font-bold text-white">{t("App commission inputs", "مدخلات عمولة التطبيقات")}</h2></div>
              <div className="p-4 space-y-2">
                {cur.commByCh.length === 0 ? <div className="text-xs text-slate-500">{t("No delivery-app sales this month.", "لا توجد مبيعات تطبيقات توصيل في هذا الشهر.")}</div> : cur.commByCh.map((c) => (
                  <div key={c.id} className="flex justify-between text-xs"><span className="text-slate-300">{c.name} <span className="text-slate-600">({c.rate}%)</span></span><span className="font-mono text-slate-200 [direction:ltr]">{fmt(c.sales)} {t("→ commission", "→ عمولة")} {fmt(c.amount)}</span></div>
                ))}
                <div className="flex justify-between text-xs border-t border-slate-800 pt-2 mt-1"><span className="text-white font-bold">{t("Total commission", "إجمالي العمولة")}</span><span className="font-mono font-bold text-amber-400 [direction:ltr]">{fmt(cur.commission)} {curAr()}</span></div>
              </div>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2"><span className="w-1 h-4 rounded bg-emerald-500" /><h2 className="text-sm font-bold text-white">{t("Break-even (", "نقطة التعادل (")}{monthLabel(month)})</h2></div>
              <div className="p-4 space-y-2 text-xs">
                <div className="flex justify-between"><span className="text-slate-400">{t("Contribution margin", "هامش المساهمة")}</span><span className="font-mono text-white [direction:ltr]">{cur.cm.toFixed(1)}%</span></div>
                <div className="flex justify-between"><span className="text-slate-400">{t("Monthly break-even", "نقطة التعادل الشهرية")}</span><span className="font-mono text-amber-400 font-bold [direction:ltr]">{fmt(cur.breakEven)}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">{t("Daily break-even", "نقطة التعادل اليومية")}</span><span className="font-mono text-slate-200 [direction:ltr]">{fmt(cur.dailyBE)}</span></div>
                <div className="flex justify-between border-t border-slate-800 pt-2"><span className="text-slate-400">{t("Status", "الوضع")}</span><span className={`font-bold ${cur.net >= cur.breakEven ? "text-emerald-400" : "text-amber-400"}`}>{cur.net >= cur.breakEven ? t("✅ Above break-even", "✅ فوق التعادل") : t("⚠️ Below break-even", "⚠️ تحت التعادل")}</span></div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
