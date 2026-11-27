// =============================================================
// src/pages/DashboardPage.tsx
// الصفحة الرئيسية — نقطة انطلاق للعمل، وليست تقريرًا.
// لا تكرّر أي مؤشر/رسم موجود في المبيعات أو المشتريات أو التقارير أو الحسابات
// (تلك الأرقام صارت في مركز التقارير وتحليلات الأعمال والتقرير المالي الشهري).
// تعرض: إجراءات سريعة حسب الصلاحيات · ما يحتاج انتباهك (عدّادات فقط مع رابط) ·
//        آخر الصفحات التي فتحتها · قائمة إعداد المنشأة (تختفي عند الاكتمال).
// ثنائي اللغة · RTL · الثيمان · بيانات حقيقية فقط (لا أرقام تجريبية).
// =============================================================
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Store, RefreshCw, Receipt, ShoppingCart, BookOpen, ClipboardCheck, Search, CreditCard, History, BellRing, CheckCircle2, Circle, ArrowUpLeft, Inbox, FileEdit, Sparkles, AlertTriangle,
} from "lucide-react";
import { supabase } from "./lib/supabase";
import * as DB from "./lib/accountingDb";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../context/LanguageContext";
import type { Page } from "../components/Layout";
import { readRecent, greetingKey } from "./home/recentPages";

type Props = { onNavigate?: (p: Page) => void; onSection?: (s: string) => void };
type Org = { id: number; name: string } | null;
type Go = { page: Page; section?: string };
const CARD = "bg-slate-900 border border-slate-800 rounded-2xl";

const PAGE_LABEL: Partial<Record<Page, [string, string]>> = {
  search: ["Store", "المتجر"], inventory: ["Inventory", "المخزون"], "stock-adjustments": ["Stock adjustments", "الجرد والتسويات"], "item-movement": ["Item movement", "حركة الصنف"],
  "inventory-analytics": ["Inventory analytics", "مركز تقارير المخزون"], orders: ["Orders", "الطلبات"], reports: ["Reports", "التقارير"], pos: ["POS", "نقاط البيع"],
  "sales-invoice": ["New sales invoice", "فاتورة مبيعات جديدة"], "sales-reconciliation": ["Sales reconciliation", "تسوية المبيعات"], quotation: ["Quotation", "عرض سعر"],
  purchases: ["Purchases", "المشتريات"], "purchase-invoices": ["Purchase invoices", "فواتير المشتريات"], "purchase-returns": ["Purchase returns", "مرتجعات المشتريات"],
  "supplier-payments": ["Supplier payments", "مدفوعات الموردين"], "fixed-expenses": ["Fixed expenses", "المصروفات الثابتة"], "reports-center": ["Reports center", "مركز التقارير"],
  "business-analytics": ["Business analytics", "تحليلات الأعمال"], "monthly-financial": ["Monthly financial", "التقرير المالي الشهري"], "report-builder": ["Report builder", "مُنشئ التقارير"],
  accounting: ["Accounting", "الحسابات"], alerts: ["Alerts", "التنبيهات"], "shop-settings": ["Company settings", "إعدادات الشركة والفروع"],
};
const labelOf = (p: string, t: (e: string, a: string) => string): string => { const l = PAGE_LABEL[p as Page]; return l ? t(l[0], l[1]) : p; };



type Counts = { orders: number | null; drafts: number | null };
type Setup = { accounts: number; products: number; invoices: number; entries: number };

export default function DashboardPage({ onNavigate, onSection }: Props) {
  const { user, ownedShopId, isAdmin, permissions } = (useAuth() as unknown as { user: { email?: string; user_metadata?: { full_name?: string } } | null; ownedShopId: number | null; isAdmin: boolean; permissions: string[] | null }) ?? ({} as never);
  const { t, lang, isRTL } = useLang();
  const [shopName, setShopName] = useState<string>("");
  const [org, setOrg] = useState<Org | undefined>(undefined);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [recent, setRecent] = useState<string[]>(() => readRecent());

  const can = useCallback((id: string) => !!isAdmin || !permissions || permissions.includes(id), [isAdmin, permissions]);
  const go = useCallback((g: Go) => { if (g.section) onSection?.(g.section); onNavigate?.(g.page); }, [onNavigate, onSection]);

  const load = useCallback(async () => {
    setLoading(true); setErr(null); setRecent(readRecent());
    try {
      if (ownedShopId == null) { setOrg(null); setLoading(false); return; }
      const [shopRes, o] = await Promise.all([supabase.from("shops").select("shop_name").eq("id", ownedShopId).maybeSingle(), DB.getOrgForBranch(ownedShopId)]);
      setShopName(((shopRes.data as { shop_name?: string } | null)?.shop_name) || ""); setOrg(o);
      if (!o) { setLoading(false); return; }
      const cnt = async (q: PromiseLike<{ count: number | null; error: { message: string } | null }>): Promise<number> => { const r = await q; if (r.error) throw new Error(r.error.message); return r.count ?? 0; };
      const [orders, drafts, accounts, products, invoices, entries] = await Promise.all([
        cnt(supabase.from("orders").select("id", { count: "exact", head: true }).eq("to_shop_id", ownedShopId).eq("status", "pending")),
        cnt(supabase.from("gl_journal_entries").select("id", { count: "exact", head: true }).eq("organization_id", o.id).eq("status", "draft")),
        cnt(supabase.from("gl_accounts").select("id", { count: "exact", head: true }).eq("organization_id", o.id)),
        cnt(supabase.from("products").select("id", { count: "exact", head: true }).eq("shop_id", ownedShopId)),
        cnt(supabase.from("gl_sales_invoices").select("id", { count: "exact", head: true }).eq("organization_id", o.id)),
        cnt(supabase.from("gl_journal_entries").select("id", { count: "exact", head: true }).eq("organization_id", o.id).eq("status", "posted")),
      ]);
      setCounts({ orders, drafts }); setSetup({ accounts, products, invoices, entries });
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setCounts(null); setSetup(null); }
    setLoading(false);
  }, [ownedShopId]);
  useEffect(() => { void load(); }, [load]);

  const now = new Date();
  const g = greetingKey(now.getHours());
  const greet = g === "morning" ? t("Good morning", "صباح الخير") : g === "afternoon" ? t("Good afternoon", "طاب يومك") : t("Good evening", "مساء الخير");
  const person = user?.user_metadata?.full_name || (user?.email ? user.email.split("@")[0] : "");
  const dateTxt = new Intl.DateTimeFormat(lang === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(now);

  const ACTIONS = useMemo(() => ([
    { id: "sales-invoice", icon: Receipt, en: "New sales invoice", ar: "فاتورة مبيعات جديدة", go: { page: "sales-invoice" } as Go, tone: "text-emerald-400" },
    { id: "pos", icon: CreditCard, en: "Point of sale", ar: "نقطة بيع", go: { page: "pos" } as Go, tone: "text-blue-400" },
    { id: "purchase-invoices", icon: ShoppingCart, en: "Purchase invoice", ar: "فاتورة مشتريات", go: { page: "purchase-invoices" } as Go, tone: "text-amber-400" },
    { id: "accounting", icon: BookOpen, en: "Journal entry", ar: "قيد يومية", go: { page: "accounting", section: "journal" } as Go, tone: "text-purple-400" },
    { id: "stock-adjustments", icon: ClipboardCheck, en: "Stock count", ar: "جرد المخزون", go: { page: "stock-adjustments" } as Go, tone: "text-sky-400" },
    { id: "search", icon: Search, en: "Browse the store", ar: "تصفّح المتجر", go: { page: "search" } as Go, tone: "text-indigo-400" },
  ].filter((a) => can(a.id))), [can]);

  const attention = useMemo(() => {
    if (!counts) return [];
    const list: { id: string; icon: typeof Inbox; en: string; ar: string; n: number; go: Go }[] = [];
    if (can("orders")) list.push({ id: "orders", icon: Inbox, en: "Incoming orders awaiting your decision", ar: "طلبات واردة بانتظار قرارك", n: counts.orders ?? 0, go: { page: "orders" } });
    if (can("accounting")) list.push({ id: "drafts", icon: FileEdit, en: "Draft journal entries not yet posted", ar: "قيود مسودة لم تُرحَّل بعد", n: counts.drafts ?? 0, go: { page: "accounting", section: "journal" } });
    return list;
  }, [counts, can]);
  const attentionTotal = attention.reduce((s, a) => s + a.n, 0);

  const steps = useMemo(() => {
    if (!setup) return [];
    return [
      { id: "accounts", done: setup.accounts > 0, en: "Set up the chart of accounts", ar: "تجهيز دليل الحسابات", go: { page: "accounting", section: "chart" } as Go, perm: "accounting" },
      { id: "products", done: setup.products > 0, en: "Add your first products", ar: "إضافة أول المنتجات", go: { page: "inventory" } as Go, perm: "inventory" },
      { id: "invoice", done: setup.invoices > 0, en: "Issue your first sales invoice", ar: "إصدار أول فاتورة مبيعات", go: { page: "sales-invoice" } as Go, perm: "sales-invoice" },
      { id: "entry", done: setup.entries > 0, en: "Post your first journal entry", ar: "ترحيل أول قيد يومية", go: { page: "accounting", section: "journal" } as Go, perm: "accounting" },
    ].filter((s) => can(s.perm));
  }, [setup, can]);
  const stepsDone = steps.filter((s) => s.done).length;
  const showSetup = steps.length > 0 && stepsDone < steps.length;
  const recentItems = recent.filter((p) => p in PAGE_LABEL && can(p)).slice(0, 6);

  return (
    <div data-rpt data-testid="home-page" dir={isRTL ? "rtl" : "ltr"} className="min-h-screen bg-slate-950 text-white pb-12">
      <div className="w-full max-w-none space-y-5 p-4 lg:p-8">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/50 pb-6">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-12 h-12 rounded-2xl bg-[#002B5B]/40 border border-[#002B5B]/60 flex items-center justify-center shrink-0"><Store size={24} className="text-[#00A86B]" /></div>
            <div className="min-w-0">
              <h1 data-testid="home-greeting" className="text-2xl lg:text-3xl font-black text-white tracking-tight truncate">{greet}{person ? `${lang === "ar" ? "،" : ","} ${person}` : ""}</h1>
              <p className="text-slate-500 text-xs font-medium mt-1 truncate"><span data-testid="home-shop">{shopName || t("My store", "متجري")}</span> · <span data-testid="home-date">{dateTxt}</span></p>
            </div>
          </div>
          <button data-testid="home-refresh" onClick={() => void load()} disabled={loading} className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 border border-slate-700/50 rounded-xl px-4 py-2.5 active:scale-95 group self-start md:self-auto disabled:opacity-50">
            <RefreshCw size={16} className={`text-slate-400 ${loading ? "animate-spin" : "group-hover:rotate-180 transition-transform duration-500"}`} /><span className="text-slate-300 text-sm font-semibold">{t("Refresh", "تحديث")}</span>
          </button>
        </header>

        {err && <div data-testid="home-error" role="alert" className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-300"><AlertTriangle size={15} className="mt-0.5 shrink-0" /><span>{t("Could not load your work summary: ", "تعذّر تحميل ملخّص العمل: ")}{err}</span></div>}
        {org === null && !loading && <div data-testid="home-noorg" className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-300">{t("This account is not linked to a company yet, so the work summary is unavailable. Quick actions still work.", "هذا الحساب غير مرتبط بمنشأة بعد، لذا لا يتوفر ملخّص العمل. الإجراءات السريعة تعمل كالمعتاد.")}</div>}

        {/* إجراءات سريعة */}
        <section aria-labelledby="h-actions">
          <h2 id="h-actions" className="text-sm font-black text-white mb-3 flex items-center gap-2"><Sparkles size={15} className="text-blue-400" />{t("Start something", "ابدأ عملًا")}</h2>
          {ACTIONS.length === 0 ? <p data-testid="home-no-actions" className="text-xs text-slate-500">{t("No quick actions are available for your permissions.", "لا توجد إجراءات سريعة ضمن صلاحياتك.")}</p> : (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
              {ACTIONS.map((a) => { const I = a.icon; return (
                <button key={a.id} data-testid={`act-${a.id}`} onClick={() => go(a.go)} className={`${CARD} p-4 text-start hover:border-blue-500/50 active:scale-[0.98] transition-all flex flex-col gap-3 min-h-[96px]`}>
                  <span className={`w-9 h-9 rounded-xl bg-slate-800/60 flex items-center justify-center ${a.tone}`}><I size={18} /></span>
                  <span className="text-sm font-bold text-slate-200">{t(a.en, a.ar)}</span>
                </button>); })}
            </div>)}
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* ما يحتاج انتباهك */}
          <section aria-labelledby="h-attn" className={`${CARD} p-5 lg:col-span-7`}>
            <div className="flex items-center justify-between mb-3 gap-2">
              <h2 id="h-attn" className="text-sm font-black text-white flex items-center gap-2"><BellRing size={15} className="text-amber-400" />{t("Needs your attention", "تحتاج انتباهك")}</h2>
              {can("alerts") && <button data-testid="go-alerts" onClick={() => go({ page: "alerts" })} className="text-xs font-bold text-blue-400 hover:underline inline-flex items-center gap-1">{t("Alerts center", "مركز التنبيهات")}<ArrowUpLeft size={12} className="rtl:rotate-0 ltr:rotate-90" /></button>}
            </div>
            {loading && !counts ? <p data-testid="home-loading" className="text-xs text-slate-500">{t("Loading…", "جارٍ التحميل…")}</p>
              : !counts ? <p className="text-xs text-slate-500">{t("Unavailable right now.", "غير متاح حاليًا.")}</p>
              : attention.length === 0 ? <p className="text-xs text-slate-500">{t("Nothing to show for your permissions.", "لا يوجد ما يُعرض ضمن صلاحياتك.")}</p>
              : attentionTotal === 0 ? <div data-testid="attn-clear" className="flex items-center gap-2 text-sm text-emerald-400 py-4"><CheckCircle2 size={18} />{t("All clear — nothing is waiting on you.", "كل شيء على ما يرام — لا شيء ينتظرك.")}</div>
              : <ul className="space-y-2">{attention.map((a) => { const I = a.icon; return (
                  <li key={a.id}><button data-testid={`attn-${a.id}`} onClick={() => go(a.go)} disabled={a.n === 0} className="w-full flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3 text-start hover:border-blue-500/50 disabled:opacity-60 disabled:hover:border-slate-800">
                    <I size={16} className="text-slate-400 shrink-0" /><span className="flex-1 text-sm text-slate-200">{t(a.en, a.ar)}</span>
                    <bdi dir="ltr" data-testid={`attn-${a.id}-n`} className={`font-mono font-black text-sm ${a.n > 0 ? "text-amber-400" : "text-slate-500"}`}>{a.n}</bdi></button></li>); })}</ul>}
          </section>

          {/* آخر الصفحات */}
          <section aria-labelledby="h-recent" className={`${CARD} p-5 lg:col-span-5`}>
            <h2 id="h-recent" className="text-sm font-black text-white mb-3 flex items-center gap-2"><History size={15} className="text-sky-400" />{t("Continue where you left off", "أكمل من حيث توقفت")}</h2>
            {recentItems.length === 0 ? <p data-testid="recent-empty" className="text-xs text-slate-500">{t("Pages you open will appear here.", "ستظهر هنا الصفحات التي تفتحها.")}</p>
              : <ul className="space-y-1.5">{recentItems.map((p) => (<li key={p}><button data-testid="recent-item" onClick={() => go({ page: p as Page })} className="w-full text-start rounded-xl px-3 py-2.5 text-sm text-slate-200 bg-slate-950/40 border border-slate-800 hover:border-blue-500/50">{labelOf(p, t)}</button></li>))}</ul>}
          </section>
        </div>

        {/* إعداد المنشأة */}
        {showSetup && (
          <section data-testid="home-setup" aria-labelledby="h-setup" className={`${CARD} p-5`}>
            <div className="flex items-center justify-between mb-3 gap-2"><h2 id="h-setup" className="text-sm font-black text-white">{t("Get your company ready", "جهّز منشأتك")}</h2><bdi dir="ltr" data-testid="setup-progress" className="text-xs font-mono text-slate-400">{stepsDone}/{steps.length}</bdi></div>
            <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden mb-4"><div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(stepsDone / steps.length) * 100}%` }} /></div>
            <ul className="grid sm:grid-cols-2 gap-2">{steps.map((s) => (
              <li key={s.id}><button data-testid={`step-${s.id}`} data-done={s.done} onClick={() => go(s.go)} className="w-full flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3 text-start hover:border-blue-500/50">
                {s.done ? <CheckCircle2 size={17} className="text-emerald-400 shrink-0" /> : <Circle size={17} className="text-slate-500 shrink-0" />}
                <span className={`text-sm ${s.done ? "text-slate-500 line-through" : "text-slate-200"}`}>{t(s.en, s.ar)}</span></button></li>))}</ul>
          </section>)}
      </div>
    </div>
  );
}
