// =============================================================
// src/pages/ReportsHubPage.tsx
// مركز التقارير (Reporting Center) — المحور المركزي لكل التقارير.
// تصنيفات · مفضلة · المستخدَمة مؤخرًا · بحث · فترة/فروع · تصدير مباشر.
// كل بطاقة تفتح وجهة حقيقية (صفحة/قسم) أو تصدّر PDF/Excel، أو تُعلَّم «قريبًا».
// =============================================================

import { useEffect, useMemo, useState } from "react";
import {
  Search, RefreshCw, Star, Clock, FolderOpen, FileText, Scale, BookOpen,
  TrendingUp, ShoppingCart, Package, Users, Activity, BarChart3, Wallet,
  FileBarChart, ArrowLeft, Download, LayoutDashboard,
} from "lucide-react";
import { Page } from "../components/Layout";
import { useAuth } from "../context/AuthContext";
import { EXPORTERS, exportConsolidated, ExportMode, BranchRef } from "./lib/cafeExports";
import { BrandMark, BRAND } from "./reports/brand";
import { CARD } from "./reports/reportingKit";

type Props = { setPage: (p: Page) => void; setAccSection?: (s: string) => void };

type Cat = "analytics" | "financial" | "sales" | "purchases" | "inventory" | "parties" | "operational";
const CATS: { k: Cat; label: string; icon: any; color: string }[] = [
  { k: "analytics",   label: "تحليلات الأعمال",     icon: BarChart3,    color: "text-purple-400" },
  { k: "financial",   label: "التقارير المالية",     icon: Scale,        color: "text-blue-400" },
  { k: "sales",       label: "تقارير المبيعات",      icon: TrendingUp,   color: "text-emerald-400" },
  { k: "purchases",   label: "تقارير المشتريات",     icon: ShoppingCart, color: "text-sky-400" },
  { k: "inventory",   label: "تقارير المخزون",       icon: Package,      color: "text-amber-400" },
  { k: "parties",     label: "العملاء والموردون",    icon: Users,        color: "text-indigo-400" },
  { k: "operational", label: "تقارير تشغيلية",       icon: Activity,     color: "text-rose-400" },
];

type Rpt = {
  id: string; title: string; desc: string; cat: Cat; icon: any;
  page?: Page; section?: string; exportId?: string; soon?: boolean; permKey?: Page;
};

const REPORTS: Rpt[] = [
  // تحليلات الأعمال
  { id: "biz-performance", title: "أداء الأعمال", desc: "مؤشرات الأداء العامة مع مقارنة الفترات", cat: "analytics", icon: LayoutDashboard, page: "business-analytics", permKey: "business-analytics" },
  { id: "branch-performance", title: "أداء الفروع", desc: "مقارنة المبيعات والربح والمصروفات بين الفروع", cat: "analytics", icon: BarChart3, page: "business-analytics", permKey: "business-analytics" },
  { id: "revenue-analysis", title: "تحليل الإيرادات", desc: "اتجاه الإيرادات عبر الزمن", cat: "analytics", icon: TrendingUp, page: "business-analytics", permKey: "business-analytics" },
  { id: "profitability", title: "تحليل الربحية", desc: "مجمل الربح وهامش الربح", cat: "analytics", icon: Activity, page: "business-analytics", permKey: "business-analytics" },

  // التقارير المالية
  { id: "pnl", title: "قائمة الدخل (ربح/خسارة)", desc: "الإيرادات والمصروفات وصافي الربح", cat: "financial", icon: FileText, page: "accounting", section: "statements", permKey: "accounting" },
  { id: "balance-sheet", title: "الميزانية العمومية", desc: "الأصول والخصوم وحقوق الملكية", cat: "financial", icon: Scale, page: "accounting", section: "statements", permKey: "accounting" },
  { id: "trial", title: "ميزان المراجعة", desc: "أرصدة كل الحسابات مدين/دائن", cat: "financial", icon: Scale, page: "accounting", section: "trial", permKey: "accounting" },
  { id: "ledger", title: "دفتر الأستاذ العام", desc: "حركة أي حساب خلال فترة", cat: "financial", icon: BookOpen, page: "accounting", section: "ledger", permKey: "accounting" },
  { id: "ar", title: "الذمم المدينة (العملاء)", desc: "أرصدة العملاء وأعمار الديون", cat: "financial", icon: Users, page: "accounting", section: "parties", permKey: "accounting" },
  { id: "ap", title: "الذمم الدائنة (الموردون)", desc: "أرصدة الموردين المستحقة", cat: "financial", icon: Users, page: "accounting", section: "parties", permKey: "accounting" },
  { id: "monthly-fin", title: "التقرير المالي الشهري", desc: "قائمة ربح وخسارة + مقارنة شهرين", cat: "financial", icon: FileBarChart, page: "financial-report", exportId: "financial-report", permKey: "financial-report" },
  { id: "cashflow", title: "قائمة التدفقات النقدية", desc: "التدفقات التشغيلية/الاستثمارية/التمويلية", cat: "financial", icon: Wallet, soon: true },

  // المبيعات
  { id: "sales-recon", title: "تسوية المبيعات", desc: "مطابقة السيستم بالتحصيل + الضريبة ونِسَب القنوات", cat: "sales", icon: BarChart3, page: "sales-reconciliation", exportId: "sales-reconciliation", permKey: "sales-reconciliation" },
  { id: "sales-summary", title: "ملخص المبيعات", desc: "إجماليات المبيعات والطلبات", cat: "sales", icon: TrendingUp, page: "reports", permKey: "reports" },
  { id: "sales-by-branch", title: "المبيعات حسب الفرع", desc: "توزيع المبيعات على الفروع", cat: "sales", icon: BarChart3, page: "business-analytics", permKey: "business-analytics" },
  { id: "sales-returns", title: "مرتجعات المبيعات", desc: "المرتجعات وأثرها على الإيراد", cat: "sales", icon: ShoppingCart, page: "accounting", section: "sales", permKey: "accounting" },

  // المشتريات
  { id: "purchase-invoices", title: "فواتير المشتريات", desc: "كل فواتير الشراء خلال الفترة", cat: "purchases", icon: FileText, page: "purchase-invoices", permKey: "purchase-invoices" },
  { id: "purchase-returns", title: "مرتجعات المشتريات", desc: "مرتجعات الموردين", cat: "purchases", icon: ShoppingCart, page: "purchase-returns", permKey: "purchase-returns" },
  { id: "supplier-payments", title: "مدفوعات الموردين", desc: "سندات الصرف وتسوية الفواتير", cat: "purchases", icon: Wallet, page: "supplier-payments", permKey: "supplier-payments" },
  { id: "supplier-balances", title: "أرصدة الموردين", desc: "المستحق لكل مورد", cat: "purchases", icon: Users, page: "accounting", section: "parties", permKey: "accounting" },
  { id: "purchases-report", title: "تقرير المشتريات", desc: "تحليل الشراء + تغيّر الأسعار + التصنيفات", cat: "purchases", icon: FileBarChart, page: "purchases", exportId: "purchases", permKey: "purchases" },

  // المخزون
  { id: "inv-valuation", title: "تقييم المخزون", desc: "قيمة المخزون بالتكلفة لكل صنف", cat: "inventory", icon: Package, page: "inventory", permKey: "inventory" },
  { id: "stock-movement", title: "حركة المخزون", desc: "دخول/خروج الأصناف", cat: "inventory", icon: Activity, page: "inventory", permKey: "inventory" },
  { id: "low-stock", title: "أصناف منخفضة المخزون", desc: "ما يحتاج إعادة طلب", cat: "inventory", icon: Package, page: "inventory", permKey: "inventory" },
  { id: "out-stock", title: "أصناف نافدة", desc: "الأصناف التي بلغ رصيدها صفرًا", cat: "inventory", icon: Package, page: "inventory", permKey: "inventory" },
  { id: "stock-adjust", title: "تسويات المخزون", desc: "الجرد والتسويات الموثّقة", cat: "inventory", icon: Activity, page: "stock-adjustments", permKey: "stock-adjustments" },

  // العملاء والموردون
  { id: "customers", title: "العملاء", desc: "قائمة العملاء وأرصدتهم", cat: "parties", icon: Users, page: "accounting", section: "parties", permKey: "accounting" },
  { id: "suppliers", title: "الموردون", desc: "قائمة الموردين وأرصدتهم", cat: "parties", icon: Users, page: "accounting", section: "parties", permKey: "accounting" },
  { id: "statement", title: "كشف حساب", desc: "حركة عميل/مورد خلال فترة", cat: "parties", icon: BookOpen, page: "accounting", section: "ledger", permKey: "accounting" },

  // تشغيلية
  { id: "fixed-exp", title: "المصروفات الثابتة", desc: "الرواتب والمصروفات ونقطة التعادل", cat: "operational", icon: Wallet, page: "fixed-expenses", exportId: "fixed-expenses", permKey: "fixed-expenses" },
  { id: "branch-compare", title: "مقارنة الفروع", desc: "أداء الفروع جنبًا إلى جنب", cat: "operational", icon: BarChart3, page: "business-analytics", permKey: "business-analytics" },
  { id: "daily-ops", title: "العمليات اليومية", desc: "نشاط اليوم عبر الوحدات", cat: "operational", icon: Activity, page: "reports", permKey: "reports" },
];

function monthBounds(ym: string): { from: string; to: string } {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, "0")}` };
}
const loadLS = (k: string): string[] => { try { return JSON.parse(localStorage.getItem(k) || "[]"); } catch { return []; } };
const saveLS = (k: string, v: string[]) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* noop */ } };

export default function ReportsHubPage({ setPage, setAccSection }: Props) {
  const { permissions, ownedShopId, branches } = (useAuth() as any) ?? {};
  const allowed = (p?: Page) => !p || !permissions || permissions.includes(p);

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
    if (r.soon) { setMsg({ t: "err", x: "هذا التقرير قيد التطوير — قريبًا بإذن الله." }); return; }
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
      if (picks.length === 0) res = { ok: false, rows: 0, msg: "اختر فرعًا واحدًا على الأقل." };
      else if (picks.length === 1) res = await fn(picks[0].id, rangeFrom, rangeTo, mode);
      else res = await exportConsolidated(r.exportId!, picks, rangeFrom, rangeTo, mode);
      if (!res.ok) setMsg({ t: "err", x: res.msg || "تعذّر إنشاء التقرير." });
      else setMsg({ t: "ok", x: `تم إنشاء التقرير (${res.rows} سجل) للفترة ${rangeFrom} → ${rangeTo}.` });
    } catch (e: any) { setMsg({ t: "err", x: "خطأ أثناء التصدير: " + (e?.message || e) }); }
    finally { setBusy(""); }
  };

  const visible = useMemo(() => REPORTS.filter((r) => {
    if (!allowed(r.permKey)) return false;
    if (cat !== "all" && r.cat !== cat) return false;
    if (q.trim()) { const s = q.trim().toLowerCase(); if (!(`${r.title} ${r.desc}`.toLowerCase().includes(s))) return false; }
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
              <h3 className="text-sm font-bold text-white truncate">{r.title}</h3>
              {r.soon && <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 font-bold shrink-0">قريبًا</span>}
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed mt-0.5 line-clamp-2">{r.desc}</p>
          </div>
          <button onClick={() => toggleFav(r.id)} title="مفضّلة" className={`shrink-0 ${isFav ? "text-amber-400" : "text-slate-600 hover:text-slate-400"}`}><Star size={16} fill={isFav ? "currentColor" : "none"} /></button>
        </div>
        <div className="flex items-center gap-2 mt-auto pt-1">
          <button onClick={() => open(r)} disabled={r.soon} className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600/90 text-white text-xs font-bold hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed">
            فتح التقرير <ArrowLeft size={13} />
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
    <div className="p-4 lg:p-6 min-h-screen" dir="rtl">
      {/* ترويسة */}
      <header className="flex flex-wrap items-center justify-between gap-4 mb-5">
        <div className="flex items-center gap-3 min-w-0">
          <BrandMark size={40} />
          <div className="min-w-0">
            <h1 className="text-2xl font-black text-white leading-tight">مركز التقارير</h1>
            <p className="text-slate-500 text-xs mt-0.5">{BRAND.tagline} — اعرض وصدّر كل تقارير المؤسسة من مكان واحد.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث عن تقرير…" className="bg-slate-900 border border-slate-800 rounded-xl text-white text-sm pr-9 pl-3 py-2 w-56 outline-none focus:border-blue-500" />
          </div>
          <button onClick={() => { setQ(""); setCat("all"); setMsg(null); }} title="تحديث" className="p-2.5 rounded-xl border border-slate-800 bg-slate-900 text-slate-400 hover:text-white"><RefreshCw size={16} /></button>
        </div>
      </header>

      {/* فترة + فروع */}
      <div className={`${CARD} p-3 mb-4 flex flex-wrap items-end gap-3`}>
        <div className="flex flex-col gap-1"><label className="text-[10px] text-slate-500 font-bold">الشهر</label>
          <input type="month" value={month} onChange={(e) => onMonth(e.target.value)} disabled={custom} className="bg-slate-950 border border-slate-700 rounded-xl text-white px-3 py-2 text-sm [color-scheme:dark] disabled:opacity-40" /></div>
        <label className="flex items-center gap-2 text-xs text-slate-400 font-bold cursor-pointer pb-2.5"><input type="checkbox" checked={custom} onChange={(e) => setCustom(e.target.checked)} className="accent-blue-500 w-4 h-4" /> نطاق مخصّص</label>
        <div className="flex flex-col gap-1"><label className="text-[10px] text-slate-500 font-bold">من</label><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} disabled={!custom} className="bg-slate-950 border border-slate-700 rounded-xl text-white px-3 py-2 text-sm [color-scheme:dark] disabled:opacity-40" /></div>
        <div className="flex flex-col gap-1"><label className="text-[10px] text-slate-500 font-bold">إلى</label><input type="date" value={to} onChange={(e) => setTo(e.target.value)} disabled={!custom} className="bg-slate-950 border border-slate-700 rounded-xl text-white px-3 py-2 text-sm [color-scheme:dark] disabled:opacity-40" /></div>
        <div className="mr-auto text-[11px] text-slate-500 pb-2.5">الفترة: <b className="text-slate-300 [direction:ltr] inline-block">{rangeFrom} → {rangeTo}</b>{multiBranch && <span className="mr-3">· {chosen.length}/{allBranches.length} فرع</span>}</div>
      </div>

      {msg && <div className={`mb-4 rounded-xl px-4 py-2.5 text-sm font-bold border ${msg.t === "ok" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300" : "bg-amber-500/10 border-amber-500/20 text-amber-300"}`}>{msg.t === "ok" ? "✓ " : "⚠️ "}{msg.x}</div>}

      {/* مفضلة + مؤخرًا */}
      {(favReports.length > 0 || recentReports.length > 0) && !q && cat === "all" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
          {favReports.length > 0 && (
            <div><div className="flex items-center gap-2 text-xs font-bold text-slate-400 mb-2"><Star size={14} className="text-amber-400" /> المفضّلة</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">{favReports.slice(0, 4).map((r) => <Card key={r.id} r={r} />)}</div></div>
          )}
          {recentReports.length > 0 && (
            <div><div className="flex items-center gap-2 text-xs font-bold text-slate-400 mb-2"><Clock size={14} className="text-blue-400" /> المستخدَمة مؤخرًا</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">{recentReports.slice(0, 4).map((r) => <Card key={r.id} r={r} />)}</div></div>
          )}
        </div>
      )}

      {/* فلاتر التصنيفات */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button onClick={() => setCat("all")} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border ${cat === "all" ? "bg-blue-600 text-white border-blue-500" : "bg-slate-900 text-slate-400 border-slate-800 hover:text-white"}`}><FolderOpen size={13} /> الكل</button>
        {CATS.map((c) => { const CI = c.icon; return (
          <button key={c.k} onClick={() => setCat(c.k)} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border ${cat === c.k ? "bg-blue-600 text-white border-blue-500" : "bg-slate-900 text-slate-400 border-slate-800 hover:text-white"}`}><CI size={13} className={cat === c.k ? "" : c.color} /> {c.label}</button>
        ); })}
      </div>

      {/* شبكة التقارير حسب التصنيف */}
      {visible.length === 0 ? (
        <div className={`${CARD} p-10 text-center text-slate-500 text-sm`}>لا توجد تقارير مطابقة.</div>
      ) : (
        <div className="space-y-6">
          {CATS.filter((c) => cat === "all" || cat === c.k).map((c) => {
            const list = visible.filter((r) => r.cat === c.k);
            if (!list.length) return null;
            const CI = c.icon;
            return (
              <section key={c.k}>
                <div className="flex items-center gap-2 mb-2.5"><CI size={16} className={c.color} /><h2 className="text-sm font-black text-white">{c.label}</h2><span className="text-[11px] text-slate-600">({list.length})</span></div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">{list.map((r) => <Card key={r.id} r={r} />)}</div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
