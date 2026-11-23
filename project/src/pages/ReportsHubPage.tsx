// =============================================================
// src/pages/ReportsHubPage.tsx
// مركز التقارير (Reporting Center) — ثنائي اللغة (ar/en) عبر LanguageContext.
// تصنيفات · مفضلة · المستخدَمة مؤخرًا · بحث · فترة/فروع · تصدير مباشر.
// كل بطاقة تفتح وجهة حقيقية (صفحة/قسم) أو تصدّر PDF/Excel، أو تُعلَّم «قريبًا».
// =============================================================

import { useEffect, useMemo, useState } from "react";
import {
  Search, RefreshCw, Star, Clock, FolderOpen, FileText, Scale, BookOpen,
  TrendingUp, ShoppingCart, Package, Users, Activity, BarChart3, Wallet,
  FileBarChart, ArrowLeft, ArrowRight, Download, LayoutDashboard, Settings2,
} from "lucide-react";
import { Page } from "../components/Layout";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../context/LanguageContext";
import { EXPORTERS, exportConsolidated, ExportMode, BranchRef } from "./lib/cafeExports";
import { BrandMark } from "./reports/brand";
import { CARD } from "./reports/reportingKit";

type Props = { setPage: (p: Page) => void; setAccSection?: (s: string) => void };

type Cat = "analytics" | "financial" | "sales" | "purchases" | "inventory" | "parties" | "operational";
const CATS: { k: Cat; en: string; ar: string; icon: any; color: string }[] = [
  { k: "analytics", en: "Business Analytics", ar: "تحليلات الأعمال", icon: BarChart3, color: "text-purple-400" },
  { k: "financial", en: "Financial Reports", ar: "التقارير المالية", icon: Scale, color: "text-blue-400" },
  { k: "sales", en: "Sales Reports", ar: "تقارير المبيعات", icon: TrendingUp, color: "text-emerald-400" },
  { k: "purchases", en: "Purchase Reports", ar: "تقارير المشتريات", icon: ShoppingCart, color: "text-sky-400" },
  { k: "inventory", en: "Inventory Reports", ar: "تقارير المخزون", icon: Package, color: "text-amber-400" },
  { k: "parties", en: "Customers & Suppliers", ar: "العملاء والموردون", icon: Users, color: "text-indigo-400" },
  { k: "operational", en: "Operational", ar: "تقارير تشغيلية", icon: Activity, color: "text-rose-400" },
];

type Rpt = { id: string; en: string; ar: string; dEn: string; dAr: string; cat: Cat; icon: any; page?: Page; section?: string; exportId?: string; soon?: boolean; permKey?: Page };

const REPORTS: Rpt[] = [
  // Analytics
  { id: "report-builder", en: "Report Builder", ar: "مُنشئ التقارير", dEn: "Explore data and build custom charts & dashboards", dAr: "استكشف البيانات وابنِ رسومًا ولوحات مخصّصة", cat: "analytics", icon: Settings2, page: "report-builder", permKey: "report-builder" },
  { id: "biz-performance", en: "Business Performance", ar: "أداء الأعمال", dEn: "Overall KPIs with period comparison", dAr: "مؤشرات الأداء العامة مع مقارنة الفترات", cat: "analytics", icon: LayoutDashboard, page: "business-analytics", permKey: "business-analytics" },
  { id: "branch-performance", en: "Branch Performance", ar: "أداء الفروع", dEn: "Compare sales, profit and expenses across branches", dAr: "مقارنة المبيعات والربح والمصروفات بين الفروع", cat: "analytics", icon: BarChart3, page: "business-analytics", permKey: "business-analytics" },
  { id: "revenue-analysis", en: "Revenue Analysis", ar: "تحليل الإيرادات", dEn: "Revenue trend over time", dAr: "اتجاه الإيرادات عبر الزمن", cat: "analytics", icon: TrendingUp, page: "business-analytics", permKey: "business-analytics" },
  { id: "profitability", en: "Profitability", ar: "تحليل الربحية", dEn: "Gross profit and margins", dAr: "مجمل الربح وهامش الربح", cat: "analytics", icon: Activity, page: "business-analytics", permKey: "business-analytics" },

  // Financial
  { id: "pnl", en: "Income Statement (P&L)", ar: "قائمة الدخل (ربح/خسارة)", dEn: "Accounting P&L from posted entries with comparison", dAr: "قائمة دخل محاسبية من القيود المُرحّلة مع مقارنة الفترات", cat: "financial", icon: FileText, page: "monthly-financial", permKey: "monthly-financial" },
  { id: "balance-sheet", en: "Balance Sheet", ar: "الميزانية العمومية", dEn: "Assets, liabilities and equity", dAr: "الأصول والخصوم وحقوق الملكية", cat: "financial", icon: Scale, page: "accounting", section: "statements", permKey: "accounting" },
  { id: "trial", en: "Trial Balance", ar: "ميزان المراجعة", dEn: "Debit/credit balances of all accounts", dAr: "أرصدة كل الحسابات مدين/دائن", cat: "financial", icon: Scale, page: "accounting", section: "trial", permKey: "accounting" },
  { id: "ledger", en: "General Ledger", ar: "دفتر الأستاذ العام", dEn: "Movement of any account over a period", dAr: "حركة أي حساب خلال فترة", cat: "financial", icon: BookOpen, page: "accounting", section: "ledger", permKey: "accounting" },
  { id: "ar", en: "Accounts Receivable", ar: "الذمم المدينة (العملاء)", dEn: "Customer balances and aging", dAr: "أرصدة العملاء وأعمار الديون", cat: "financial", icon: Users, page: "accounting", section: "parties", permKey: "accounting" },
  { id: "ap", en: "Accounts Payable", ar: "الذمم الدائنة (الموردون)", dEn: "Outstanding supplier balances", dAr: "أرصدة الموردين المستحقة", cat: "financial", icon: Users, page: "accounting", section: "parties", permKey: "accounting" },
  { id: "monthly-fin", en: "Monthly Financial (Accounting)", ar: "التقرير المالي الشهري (محاسبي)", dEn: "P&L and margins from posted entries + print/PDF", dAr: "قائمة الدخل وهوامش الربح من القيود المُرحّلة + طباعة/PDF", cat: "financial", icon: FileBarChart, page: "monthly-financial", permKey: "monthly-financial" },
  { id: "ops-fin", en: "Operational Report (Delivery)", ar: "التقرير التشغيلي (التوصيل)", dEn: "Operational P&L + delivery channels & commissions + export", dAr: "ربح/خسارة تشغيلي + قنوات التوصيل والعمولات + تصدير", cat: "financial", icon: FileBarChart, page: "financial-report", exportId: "financial-report", permKey: "financial-report" },
  { id: "cashflow", en: "Cash Flow Statement", ar: "قائمة التدفقات النقدية", dEn: "Operating / investing / financing flows", dAr: "التدفقات التشغيلية/الاستثمارية/التمويلية", cat: "financial", icon: Wallet, soon: true },

  // Sales
  { id: "sales-recon", en: "Sales Reconciliation", ar: "تسوية المبيعات", dEn: "System vs collection + VAT and channel shares", dAr: "مطابقة السيستم بالتحصيل + الضريبة ونِسَب القنوات", cat: "sales", icon: BarChart3, page: "sales-reconciliation", exportId: "sales-reconciliation", permKey: "sales-reconciliation" },
  { id: "sales-summary", en: "Sales Summary", ar: "ملخص المبيعات", dEn: "Sales and order totals", dAr: "إجماليات المبيعات والطلبات", cat: "sales", icon: TrendingUp, page: "reports", permKey: "reports" },
  { id: "sales-by-branch", en: "Sales by Branch", ar: "المبيعات حسب الفرع", dEn: "Sales distribution across branches", dAr: "توزيع المبيعات على الفروع", cat: "sales", icon: BarChart3, page: "business-analytics", permKey: "business-analytics" },
  { id: "sales-returns", en: "Sales Returns", ar: "مرتجعات المبيعات", dEn: "Returns and their revenue impact", dAr: "المرتجعات وأثرها على الإيراد", cat: "sales", icon: ShoppingCart, page: "accounting", section: "sales", permKey: "accounting" },

  // Purchases
  { id: "purchase-invoices", en: "Purchase Invoices", ar: "فواتير المشتريات", dEn: "All purchase invoices in the period", dAr: "كل فواتير الشراء خلال الفترة", cat: "purchases", icon: FileText, page: "purchase-invoices", permKey: "purchase-invoices" },
  { id: "purchase-returns", en: "Purchase Returns", ar: "مرتجعات المشتريات", dEn: "Supplier returns", dAr: "مرتجعات الموردين", cat: "purchases", icon: ShoppingCart, page: "purchase-returns", permKey: "purchase-returns" },
  { id: "supplier-payments", en: "Supplier Payments", ar: "مدفوعات الموردين", dEn: "Payment vouchers and invoice settlement", dAr: "سندات الصرف وتسوية الفواتير", cat: "purchases", icon: Wallet, page: "supplier-payments", permKey: "supplier-payments" },
  { id: "supplier-balances", en: "Supplier Balances", ar: "أرصدة الموردين", dEn: "Outstanding per supplier", dAr: "المستحق لكل مورد", cat: "purchases", icon: Users, page: "accounting", section: "parties", permKey: "accounting" },
  { id: "purchases-report", en: "Purchases Report", ar: "تقرير المشتريات", dEn: "Purchase analysis + price changes + categories", dAr: "تحليل الشراء + تغيّر الأسعار + التصنيفات", cat: "purchases", icon: FileBarChart, page: "purchases", exportId: "purchases", permKey: "purchases" },

  // Inventory
  { id: "inv-valuation", en: "Inventory Valuation", ar: "تقييم المخزون", dEn: "Stock value at cost per item", dAr: "قيمة المخزون بالتكلفة لكل صنف", cat: "inventory", icon: Package, page: "inventory", permKey: "inventory" },
  { id: "stock-movement", en: "Stock Movement", ar: "حركة المخزون", dEn: "Items in/out", dAr: "دخول/خروج الأصناف", cat: "inventory", icon: Activity, page: "inventory", permKey: "inventory" },
  { id: "low-stock", en: "Low Stock", ar: "أصناف منخفضة المخزون", dEn: "Items needing reorder", dAr: "ما يحتاج إعادة طلب", cat: "inventory", icon: Package, page: "inventory", permKey: "inventory" },
  { id: "out-stock", en: "Out of Stock", ar: "أصناف نافدة", dEn: "Items that reached zero", dAr: "الأصناف التي بلغ رصيدها صفرًا", cat: "inventory", icon: Package, page: "inventory", permKey: "inventory" },
  { id: "stock-adjust", en: "Stock Adjustments", ar: "تسويات المخزون", dEn: "Counts and documented adjustments", dAr: "الجرد والتسويات الموثّقة", cat: "inventory", icon: Activity, page: "stock-adjustments", permKey: "stock-adjustments" },

  // Parties
  { id: "customers", en: "Customers", ar: "العملاء", dEn: "Customer list and balances", dAr: "قائمة العملاء وأرصدتهم", cat: "parties", icon: Users, page: "accounting", section: "parties", permKey: "accounting" },
  { id: "suppliers", en: "Suppliers", ar: "الموردون", dEn: "Supplier list and balances", dAr: "قائمة الموردين وأرصدتهم", cat: "parties", icon: Users, page: "accounting", section: "parties", permKey: "accounting" },
  { id: "statement", en: "Account Statement", ar: "كشف حساب", dEn: "Customer/supplier movement over a period", dAr: "حركة عميل/مورد خلال فترة", cat: "parties", icon: BookOpen, page: "accounting", section: "ledger", permKey: "accounting" },

  // Operational
  { id: "fixed-exp", en: "Fixed Expenses", ar: "المصروفات الثابتة", dEn: "Salaries, expenses and break-even", dAr: "الرواتب والمصروفات ونقطة التعادل", cat: "operational", icon: Wallet, page: "fixed-expenses", exportId: "fixed-expenses", permKey: "fixed-expenses" },
  { id: "branch-compare", en: "Branch Comparison", ar: "مقارنة الفروع", dEn: "Branch performance side by side", dAr: "أداء الفروع جنبًا إلى جنب", cat: "operational", icon: BarChart3, page: "business-analytics", permKey: "business-analytics" },
  { id: "daily-ops", en: "Daily Operations", ar: "العمليات اليومية", dEn: "Today's activity across modules", dAr: "نشاط اليوم عبر الوحدات", cat: "operational", icon: Activity, page: "reports", permKey: "reports" },
];

function monthBounds(ym: string): { from: string; to: string } {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, "0")}` };
}
const loadLS = (k: string): string[] => { try { return JSON.parse(localStorage.getItem(k) || "[]"); } catch { return []; } };
const saveLS = (k: string, v: string[]) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* noop */ } };

export default function ReportsHubPage({ setPage, setAccSection }: Props) {
  const { t, lang, isRTL } = useLang();
  const { permissions, ownedShopId, branches } = (useAuth() as any) ?? {};
  const allowed = (p?: Page) => !p || !permissions || permissions.includes(p);
  const Arrow = isRTL ? ArrowLeft : ArrowRight;
  const rT = (r: Rpt) => (lang === "ar" ? r.ar : r.en);
  const rD = (r: Rpt) => (lang === "ar" ? r.dAr : r.dEn);

  const allBranches: BranchRef[] = Array.isArray(branches) ? branches : [];
  const multiBranch = allBranches.length > 1;

  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [custom, setCustom] = useState(false);
  const b = useMemo(() => monthBounds(month), [month]);
  const [from, setFrom] = useState(b.from);
  const [to, setTo] = useState(b.to);
  const onMonth = (ym: string) => { setMonth(ym); const nb = monthBounds(ym); setFrom(nb.from); setTo(nb.to); };
  const rangeFrom = custom ? from : b.from;
  const rangeTo = custom ? to : b.to;

  const [selected, setSelected] = useState<Set<number>>(new Set());
  useEffect(() => { setSelected(new Set(allBranches.map((x) => x.id))); /* eslint-disable-next-line */ }, [branches]);
  const chosen: BranchRef[] = useMemo(() => (multiBranch ? allBranches.filter((x) => selected.has(x.id)) : allBranches), [multiBranch, allBranches, selected]);

  const [q, setQ] = useState("");
  const [cat, setCat] = useState<Cat | "all">("all");
  const [fav, setFav] = useState<string[]>(() => loadLS("mihwar_rpt_fav"));
  const [recent, setRecent] = useState<string[]>(() => loadLS("mihwar_rpt_recent"));
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ t: "ok" | "err"; x: string } | null>(null);

  const toggleFav = (id: string) => setFav((p) => { const n = p.includes(id) ? p.filter((x) => x !== id) : [...p, id]; saveLS("mihwar_rpt_fav", n); return n; });
  const addRecent = (id: string) => setRecent((p) => { const n = [id, ...p.filter((x) => x !== id)].slice(0, 6); saveLS("mihwar_rpt_recent", n); return n; });

  const open = (r: Rpt) => {
    if (r.soon) { setMsg({ t: "err", x: t("This report is under development — coming soon.", "هذا التقرير قيد التطوير — قريبًا بإذن الله.") }); return; }
    addRecent(r.id);
    if (r.section) { setAccSection?.(r.section); setPage("accounting"); }
    else if (r.page) { try { sessionStorage.setItem("mihwar_open_tab", r.page); } catch { /* noop */ } setPage(r.page); }
  };

  const runExport = async (r: Rpt, mode: ExportMode) => {
    const fn = r.exportId ? EXPORTERS[r.exportId] : undefined;
    if (!fn) return;
    setBusy(`${r.id}-${mode}`); setMsg(null);
    try {
      const picks = chosen.length ? chosen : (ownedShopId ? [{ id: ownedShopId, name: "" }] : []);
      let res;
      if (picks.length === 0) res = { ok: false, rows: 0, msg: t("Select at least one branch.", "اختر فرعًا واحدًا على الأقل.") };
      else if (picks.length === 1) res = await fn(picks[0].id, rangeFrom, rangeTo, mode);
      else res = await exportConsolidated(r.exportId!, picks, rangeFrom, rangeTo, mode);
      if (!res.ok) setMsg({ t: "err", x: res.msg || t("Could not generate the report.", "تعذّر إنشاء التقرير.") });
      else setMsg({ t: "ok", x: `${t("Report generated", "تم إنشاء التقرير")} (${res.rows}) ${rangeFrom} → ${rangeTo}.` });
    } catch (e: any) { setMsg({ t: "err", x: t("Export error: ", "خطأ أثناء التصدير: ") + (e?.message || e) }); }
    finally { setBusy(""); }
  };

  const visible = useMemo(() => REPORTS.filter((r) => {
    if (!allowed(r.permKey)) return false;
    if (cat !== "all" && r.cat !== cat) return false;
    if (q.trim()) { const s = q.trim().toLowerCase(); if (!(`${r.en} ${r.ar} ${r.dEn} ${r.dAr}`.toLowerCase().includes(s))) return false; }
    return true;
  }), [q, cat, permissions]);

  const byId = (id: string) => REPORTS.find((r) => r.id === id);
  const favReports = fav.map(byId).filter((r): r is Rpt => !!r && allowed(r.permKey));
  const recentReports = recent.map(byId).filter((r): r is Rpt => !!r && allowed(r.permKey));

  const Card = ({ r }: { r: Rpt }) => {
    const Icon = r.icon; const isFav = fav.includes(r.id);
    const hasExport = !!(r.exportId && EXPORTERS[r.exportId]);
    return (
      <div className={`${CARD} p-4 flex flex-col gap-2 group ${r.soon ? "opacity-70" : "hover:border-blue-500/40"} transition-all`}>
        <div className="flex items-start gap-2.5">
          <span className="w-10 h-10 rounded-xl bg-slate-800/60 border border-slate-700 flex items-center justify-center text-blue-400 shrink-0"><Icon size={18} /></span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-bold text-white truncate">{rT(r)}</h3>
              {r.soon && <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 font-bold shrink-0">{t("Soon", "قريبًا")}</span>}
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed mt-0.5 line-clamp-2">{rD(r)}</p>
          </div>
          <button onClick={() => toggleFav(r.id)} title={t("Favorite", "مفضّلة")} className={`shrink-0 ${isFav ? "text-amber-400" : "text-slate-600 hover:text-slate-400"}`}><Star size={16} fill={isFav ? "currentColor" : "none"} /></button>
        </div>
        <div className="flex items-center gap-2 mt-auto pt-1">
          <button onClick={() => open(r)} disabled={r.soon} className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600/90 text-white text-xs font-bold hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed">
            {t("Open report", "فتح التقرير")} <Arrow size={13} />
          </button>
          {hasExport && (
            <>
              <button onClick={() => runExport(r, "pdf")} disabled={!!busy} title="PDF" className="px-2.5 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-[11px] font-bold disabled:opacity-40">{busy === `${r.id}-pdf` ? "…" : "PDF"}</button>
              <button onClick={() => runExport(r, "excel")} disabled={!!busy} title="Excel" className="px-2 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[11px] font-bold disabled:opacity-40"><Download size={13} /></button>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="p-4 lg:p-6 min-h-screen" dir={isRTL ? "rtl" : "ltr"}>
      <header className="flex flex-wrap items-center justify-between gap-4 mb-5">
        <div className="flex items-center gap-3 min-w-0">
          <BrandMark size={40} />
          <div className="min-w-0">
            <h1 className="text-2xl font-black text-white leading-tight">{t("Reporting Center", "مركز التقارير")}</h1>
            <p className="text-slate-500 text-xs mt-0.5">{t("View and export all your reports from one place.", "اعرض وصدّر كل تقارير المؤسسة من مكان واحد.")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={15} className="absolute end-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search reports…", "ابحث عن تقرير…")} className="bg-slate-900 border border-slate-800 rounded-xl text-white text-sm pe-9 ps-3 py-2 w-56 outline-none focus:border-blue-500" />
          </div>
          <button onClick={() => { setQ(""); setCat("all"); setMsg(null); }} title={t("Reset", "تحديث")} className="p-2.5 rounded-xl border border-slate-800 bg-slate-900 text-slate-400 hover:text-white"><RefreshCw size={16} /></button>
        </div>
      </header>

      <div className={`${CARD} p-3 mb-4 flex flex-wrap items-end gap-3`}>
        <div className="flex flex-col gap-1"><label className="text-[10px] text-slate-500 font-bold">{t("Month", "الشهر")}</label>
          <input type="month" value={month} onChange={(e) => onMonth(e.target.value)} disabled={custom} className="bg-slate-950 border border-slate-700 rounded-xl text-white px-3 py-2 text-sm [color-scheme:dark] disabled:opacity-40" /></div>
        <label className="flex items-center gap-2 text-xs text-slate-400 font-bold cursor-pointer pb-2.5"><input type="checkbox" checked={custom} onChange={(e) => setCustom(e.target.checked)} className="accent-blue-500 w-4 h-4" /> {t("Custom range", "نطاق مخصّص")}</label>
        <div className="flex flex-col gap-1"><label className="text-[10px] text-slate-500 font-bold">{t("From", "من")}</label><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} disabled={!custom} className="bg-slate-950 border border-slate-700 rounded-xl text-white px-3 py-2 text-sm [color-scheme:dark] disabled:opacity-40" /></div>
        <div className="flex flex-col gap-1"><label className="text-[10px] text-slate-500 font-bold">{t("To", "إلى")}</label><input type="date" value={to} onChange={(e) => setTo(e.target.value)} disabled={!custom} className="bg-slate-950 border border-slate-700 rounded-xl text-white px-3 py-2 text-sm [color-scheme:dark] disabled:opacity-40" /></div>
        <div className="ms-auto text-[11px] text-slate-500 pb-2.5">{t("Period", "الفترة")}: <b className="text-slate-300 [direction:ltr] inline-block">{rangeFrom} → {rangeTo}</b>{multiBranch && <span className="ms-3">· {chosen.length}/{allBranches.length} {t("branch", "فرع")}</span>}</div>
      </div>

      {msg && <div className={`mb-4 rounded-xl px-4 py-2.5 text-sm font-bold border ${msg.t === "ok" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300" : "bg-amber-500/10 border-amber-500/20 text-amber-300"}`}>{msg.t === "ok" ? "✓ " : "⚠️ "}{msg.x}</div>}

      {(favReports.length > 0 || recentReports.length > 0) && !q && cat === "all" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
          {favReports.length > 0 && (
            <div><div className="flex items-center gap-2 text-xs font-bold text-slate-400 mb-2"><Star size={14} className="text-amber-400" /> {t("Favorites", "المفضّلة")}</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">{favReports.slice(0, 4).map((r) => <Card key={r.id} r={r} />)}</div></div>
          )}
          {recentReports.length > 0 && (
            <div><div className="flex items-center gap-2 text-xs font-bold text-slate-400 mb-2"><Clock size={14} className="text-blue-400" /> {t("Recently used", "المستخدَمة مؤخرًا")}</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">{recentReports.slice(0, 4).map((r) => <Card key={r.id} r={r} />)}</div></div>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-4">
        <button onClick={() => setCat("all")} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border ${cat === "all" ? "bg-blue-600 text-white border-blue-500" : "bg-slate-900 text-slate-400 border-slate-800 hover:text-white"}`}><FolderOpen size={13} /> {t("All", "الكل")}</button>
        {CATS.map((c) => { const CI = c.icon; return (
          <button key={c.k} onClick={() => setCat(c.k)} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border ${cat === c.k ? "bg-blue-600 text-white border-blue-500" : "bg-slate-900 text-slate-400 border-slate-800 hover:text-white"}`}><CI size={13} className={cat === c.k ? "" : c.color} /> {lang === "ar" ? c.ar : c.en}</button>
        ); })}
      </div>

      {visible.length === 0 ? (
        <div className={`${CARD} p-10 text-center text-slate-500 text-sm`}>{t("No matching reports.", "لا توجد تقارير مطابقة.")}</div>
      ) : (
        <div className="space-y-6">
          {CATS.filter((c) => cat === "all" || cat === c.k).map((c) => {
            const list = visible.filter((r) => r.cat === c.k);
            if (!list.length) return null;
            const CI = c.icon;
            return (
              <section key={c.k}>
                <div className="flex items-center gap-2 mb-2.5"><CI size={16} className={c.color} /><h2 className="text-sm font-black text-white">{lang === "ar" ? c.ar : c.en}</h2><span className="text-[11px] text-slate-600">({list.length})</span></div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">{list.map((r) => <Card key={r.id} r={r} />)}</div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
