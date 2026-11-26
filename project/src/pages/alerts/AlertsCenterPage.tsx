// =============================================================
// src/pages/alerts/AlertsCenterPage.tsx
// مركز التنبيهات: مخزون، استحقاقات الموردين، تأخر العملاء، قيود غير مرحّلة، الأصول، الطلبات المعلّقة.
// مؤشرات بالأولوية والحالة، تبويبات، جدول بإجراءات (فتح / تم الاطلاع / تأجيل)، Excel وطباعة. ثنائي اللغة RTL/LTR.
// قراءة فقط من قاعدة البيانات؛ حالة الاطلاع/التأجيل محفوظة في هذا المتصفح.
// =============================================================
import { useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { AlertTriangle, Bell, BellOff, Check, Clock, Download, ExternalLink, Package, Printer, RefreshCw, RotateCcw, Search, ShieldAlert, Wallet } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useLang } from "../../context/LanguageContext";
import { useNotifications } from "../../context/NotificationContext";
import * as DB from "../lib/accountingDb";
import { ACTIVE } from "../lib/orgConfig";
import { fetchPrintOrg } from "../sales/salesInvoiceApi";
import { buildReportHTML, openPrint, type ReportCol } from "../accounting/shared/printReport";
import type { AssetLike } from "../accounting/assets/assetsLogic";
import type { PInv } from "../purchases/list/purchasesLogic";
import * as API from "./alertsApi";
import {
  CATS, DEFAULT_AFILTER, acknowledge, addDays, assetAlerts, customerAlerts, filterViews, journalAlerts, kpisOf, loadState, loadThreshold, orderAlerts, prune, restore, saveState, snooze,
  sortViews, stateKey, stockAlerts, supplierAlerts, thresholdKey, withStatus, ymd,
  type AFilter, type Alert, type AlertState, type Cat, type Prio, type SalesInv, type Status, type View,
} from "./alertsLogic";

const CARD = "bg-slate-900 border border-slate-800 rounded-2xl";
const INP = "w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500";
const BTN = "inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:text-white text-xs font-bold disabled:opacity-40";
const fmt = (n: number): string => (Math.round(n * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const PAGE = 50;
const CAT_L: Record<Cat, { en: string; ar: string }> = {
  stock: { en: "Stock", ar: "المخزون" }, suppliers: { en: "Supplier dues", ar: "استحقاقات الموردين" }, customers: { en: "Customer collection", ar: "تحصيل العملاء" },
  journal: { en: "Unposted entries", ar: "قيود غير مرحّلة" }, assets: { en: "Fixed assets", ar: "الأصول الثابتة" }, orders: { en: "Pending orders", ar: "طلبات معلّقة" },
};
const PRIO_L: Record<Prio, { en: string; ar: string; tone: string }> = {
  critical: { en: "Critical", ar: "حرج", tone: "bg-red-500/15 text-red-300 border-red-500/30" }, warning: { en: "Warning", ar: "تحذير", tone: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  info: { en: "Info", ar: "للعلم", tone: "bg-sky-500/15 text-sky-300 border-sky-500/30" },
};
const STATUS_L: Record<Status, { en: string; ar: string }> = { open: { en: "Open", ar: "مفتوح" }, ack: { en: "Acknowledged", ar: "تم الاطلاع" }, snoozed: { en: "Snoozed", ar: "مؤجَّل" } };
type SourceKey = "stock" | "suppliers" | "customers" | "journal" | "assets";
const SRC_L: Record<SourceKey, { en: string; ar: string }> = { stock: CAT_L.stock, suppliers: CAT_L.suppliers, customers: CAT_L.customers, journal: CAT_L.journal, assets: CAT_L.assets };

export type AlertsCenterProps = { onNavigate?: (page: string) => void; onSection?: (s: string) => void };

export default function AlertsCenterPage({ onNavigate, onSection }: AlertsCenterProps) {
  const { t, lang, isRTL } = useLang(); const l2 = lang === "en" ? "en" : "ar";
  const { ownedShopId } = (useAuth() as { ownedShopId?: number | string | null } | undefined) ?? {};
  const { pendingOrders, refresh: refreshNotifs } = useNotifications();
  const shopId = ownedShopId ? Number(ownedShopId) : null;
  const today = ymd(new Date());
  const store = (): Storage | null => { try { return window.localStorage; } catch { return null; } };

  const [org, setOrg] = useState<{ id: number; name: string } | null>(null);
  const [loading, setLoading] = useState(true); const [loadedAt, setLoadedAt] = useState<string | null>(null);
  const [src, setSrc] = useState<{ stock: Alert[]; suppliers: Alert[]; customers: Alert[]; journal: Alert[]; assets: Alert[] }>({ stock: [], suppliers: [], customers: [], journal: [], assets: [] });
  const [errs, setErrs] = useState<SourceKey[]>([]); const [truncated, setTruncated] = useState(false);
  const [threshold, setThreshold] = useState<number>(() => loadThreshold(store(), thresholdKey(shopId))); const [thInput, setThInput] = useState<string>(String(threshold));
  const [st, setSt] = useState<AlertState>(() => loadState(store(), stateKey(null, shopId)));
  const [f, setF] = useState<AFilter>(DEFAULT_AFILTER); const [shown, setShown] = useState(PAGE);

  useEffect(() => { let a = true; void DB.getOrgForBranch(shopId).then((o) => { if (a) setOrg(o); }).catch(() => undefined); return () => { a = false; }; }, [shopId]);
  useEffect(() => { if (org) setSt(loadState(store(), stateKey(org.id, shopId))); }, [org, shopId]);

  const load = useCallback(async () => {
    if (!org) return; setLoading(true);
    const yearAgo = addDays(today, -365); const twoYears = addDays(today, -730); const bad: SourceKey[] = [];
    const guard = async <T,>(k: SourceKey, p: Promise<T>, empty: T): Promise<T> => { try { return await p; } catch (e) { console.error("alerts", k, e); bad.push(k); return empty; } };
    const [stock, pinv, pret, sinv, drafts, assets] = await Promise.all([
      guard("stock", shopId != null ? API.fetchStockRows(shopId, Math.max(threshold, 0)) : Promise.resolve({ rows: [], truncated: false }), { rows: [], truncated: false }),
      guard("suppliers", DB.fetchPurchaseInvoices(org.id, twoYears, today, shopId), [] as Awaited<ReturnType<typeof DB.fetchPurchaseInvoices>>),
      guard("suppliers", DB.fetchPurchaseReturns(org.id, undefined, undefined, shopId), [] as Awaited<ReturnType<typeof DB.fetchPurchaseReturns>>),
      guard("customers", DB.fetchSalesInvoices(org.id, yearAgo, today, shopId), [] as Awaited<ReturnType<typeof DB.fetchSalesInvoices>>),
      guard("journal", API.fetchDraftEntries(org.id, shopId), [] as Awaited<ReturnType<typeof API.fetchDraftEntries>>),
      guard("assets", DB.fetchAssets(org.id, shopId), [] as Awaited<ReturnType<typeof DB.fetchAssets>>),
    ]);
    const retBy: Record<number, number> = {}; for (const r of pret) retBy[r.original_invoice_id] = (retBy[r.original_invoice_id] || 0) + (Number(r.total) || 0);
    setTruncated(stock.truncated);
    setSrc({
      stock: stockAlerts(stock.rows, threshold), suppliers: supplierAlerts(pinv as unknown as PInv[], retBy, today), customers: customerAlerts(sinv as unknown as SalesInv[], today),
      journal: journalAlerts(drafts, today), assets: assetAlerts(assets as unknown as AssetLike[], today),
    });
    setErrs([...new Set(bad)]); setLoadedAt(new Date().toISOString()); setLoading(false);
  }, [org, shopId, today, threshold]);
  useEffect(() => { void load(); }, [load]);

  const alerts = useMemo<Alert[]>(() => [...src.stock, ...src.suppliers, ...src.customers, ...src.journal, ...src.assets, ...orderAlerts(pendingOrders ?? [], today)], [src, pendingOrders, today]);
  useEffect(() => { // تنظيف الحالات القديمة بعد كل تحميل ناجح
    if (loading || !org || errs.length) return; const next = prune(st, new Set(alerts.map((a) => a.id)), today);
    if (Object.keys(next.ack).length !== Object.keys(st.ack).length || Object.keys(next.snooze).length !== Object.keys(st.snooze).length) { setSt(next); saveState(store(), stateKey(org.id, shopId), next); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alerts, loading]);
  const views = useMemo(() => sortViews(withStatus(alerts, st, today)), [alerts, st, today]);
  const kp = useMemo(() => kpisOf(views), [views]);
  const rows = useMemo(() => filterViews(views, f), [views, f]);
  useEffect(() => { setShown(PAGE); }, [f]);

  const mutate = (fn: (s: AlertState) => AlertState) => { const n = fn(st); setSt(n); saveState(store(), stateKey(org?.id ?? null, shopId), n); };
  const go = (a: View) => { if (a.go.section) onSection?.(a.go.section); onNavigate?.(a.go.page); };
  const applyThreshold = () => { const n = Number(thInput.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))); if (!Number.isFinite(n) || n < 0) return; setThreshold(n); try { store()?.setItem(thresholdKey(shopId), String(n)); } catch { /* ignore */ } };

  const title = (a: View): string => a.name;
  const detail = (a: View): string => {
    const d = a.days ?? 0;
    switch (a.kind) {
      case "out": return t(`Out of stock${a.ref ? ` · ${a.ref}` : ""}`, `نفد من المخزون${a.ref ? ` · ${a.ref}` : ""}`);
      case "low": return t(`Qty ${a.qty} · limit ${a.threshold}${a.ref ? ` · ${a.ref}` : ""}`, `الكمية ${a.qty} · الحد ${a.threshold}${a.ref ? ` · ${a.ref}` : ""}`);
      case "sup_overdue": return t(`Invoice ${a.ref} overdue by ${d} day(s)`, `فاتورة ${a.ref} متأخرة ${d} يوم`);
      case "sup_soon": return t(`Invoice ${a.ref} due ${d === 0 ? "today" : `in ${d} day(s)`}`, `فاتورة ${a.ref} تستحق ${d === 0 ? "اليوم" : `بعد ${d} يوم`}`);
      case "sup_open": return t(`Invoice ${a.ref} open for ${d} days with no due date`, `فاتورة ${a.ref} مفتوحة منذ ${d} يوم بدون تاريخ استحقاق`);
      case "cus_overdue": return t(`Invoice ${a.ref} overdue by ${d} day(s)`, `فاتورة ${a.ref} متأخرة ${d} يوم`);
      case "cus_soon": return t(`Invoice ${a.ref} due ${d === 0 ? "today" : `in ${d} day(s)`}`, `فاتورة ${a.ref} تستحق ${d === 0 ? "اليوم" : `بعد ${d} يوم`}`);
      case "cus_open": return t(`Invoice ${a.ref} unpaid for ${d} days (no due date)`, `فاتورة ${a.ref} غير محصّلة منذ ${d} يوم (بدون تاريخ استحقاق)`);
      case "je_draft": return t(`Draft entry ${a.ref} · ${d} day(s) old`, `قيد مسودة ${a.ref} · عمره ${d} يوم`);
      case "asset_due": return t(`Depreciation due (${d} month(s) since acquisition)`, `إهلاك مستحق غير مرحّل (${d} شهر منذ الاقتناء)`);
      case "asset_noacct": return t("No depreciation accounts set", "لا توجد حسابات إهلاك معرّفة");
      case "asset_full": return t("Fully depreciated but still active", "مهلك بالكامل وما زال نشطًا");
      case "order": return d === 0 ? t(`Order ${a.ref} received today`, `طلب ${a.ref} وارد اليوم`) : t(`Order ${a.ref} pending ${d} day(s)`, `طلب ${a.ref} معلّق منذ ${d} يوم`);
    }
  };
  const catIcon = (c: Cat) => c === "stock" ? <Package size={13} /> : c === "suppliers" || c === "customers" ? <Wallet size={13} /> : c === "journal" ? <ShieldAlert size={13} /> : <AlertTriangle size={13} />;

  const cols = (): ReportCol[] => [{ label: t("Priority", "الأولوية") }, { label: t("Category", "القسم") }, { label: t("Alert", "التنبيه") }, { label: t("Details", "التفاصيل") }, { label: t("Amount", "المبلغ"), align: "end", mono: true }, { label: t("Status", "الحالة") }];
  const toRows = (v: View[]) => v.map((a) => [PRIO_L[a.prio][l2], CAT_L[a.cat][l2], title(a), detail(a), a.amount ?? "", STATUS_L[a.status][l2]]);
  const exportX = () => { const ws = XLSX.utils.aoa_to_sheet([cols().map((c) => c.label), ...toRows(rows)]); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, t("Alerts", "التنبيهات")); XLSX.writeFile(wb, `alerts-${today}.xlsx`); };
  const printX = async () => {
    const o = org ? await fetchPrintOrg(org.id, shopId).catch(() => null) : null;
    const ok = openPrint(buildReportHTML({ title: t("Alerts center", "مركز التنبيهات"), subtitle: `${today} · ${rows.length}`, orgName: o?.name || org?.name || "", taxNumber: o?.tax_number, logoUrl: o?.logo_url, address: o?.address, dir: isRTL ? "rtl" : "ltr", lang: l2, cols: cols(), rows: toRows(rows) }));
    if (!ok) alert(t("Allow pop-ups to print.", "فعّل النوافذ المنبثقة للطباعة."));
  };

  const kpi = (id: string, label: string, n: number, tone: string, onClick?: () => void, active = false) => (
    <button type="button" onClick={onClick} data-testid={id} aria-pressed={active} className={`${CARD} p-4 text-start transition-colors hover:border-slate-600 ${active ? "ring-2 ring-blue-500/60" : ""}`}>
      <div className={`text-3xl font-black leading-none ${tone}`} dir="ltr">{n}</div><div className="mt-2 text-xs font-bold text-slate-400">{label}</div></button>);
  const money = (id: string, label: string, v: number) => <div className={`${CARD} p-4`}><div className="text-xl font-black text-white font-mono" dir="ltr" data-testid={id}>{fmt(v)} <span className="text-xs text-slate-500">{ACTIVE.symbol}</span></div><div className="mt-2 text-xs font-bold text-slate-400">{label}</div></div>;

  return (
    <div className="p-4 lg:p-6 min-h-screen text-slate-100 space-y-4" dir={isRTL ? "rtl" : "ltr"} data-testid="alerts-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><div className="text-xs text-slate-500">{t("Control", "المتابعة")} / {t("Alerts center", "مركز التنبيهات")}</div>
          <h1 className="text-xl font-bold flex items-center gap-2"><Bell size={22} className="text-blue-400" />{t("Alerts Center", "مركز التنبيهات")}</h1></div>
        <div className="flex flex-wrap items-center gap-2">
          {loadedAt && <span className="text-[11px] text-slate-500" data-testid="al-updated">{t("Updated", "آخر تحديث")} {new Date(loadedAt).toLocaleTimeString(lang === "en" ? "en-US" : "ar-SA-u-nu-latn", { hour: "2-digit", minute: "2-digit" })}</span>}
          <button type="button" onClick={() => { refreshNotifs?.(); void load(); }} disabled={loading} className={BTN} data-testid="al-refresh"><RefreshCw size={14} className={loading ? "animate-spin" : ""} />{t("Refresh", "تحديث")}</button>
          <button type="button" onClick={exportX} disabled={!rows.length} className={BTN} data-testid="al-export"><Download size={14} />Excel</button>
          <button type="button" onClick={() => void printX()} disabled={!rows.length} className={BTN} data-testid="al-print"><Printer size={14} />{t("Print", "طباعة")}</button>
        </div>
      </div>

      {errs.length > 0 && <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-200 text-sm p-3" data-testid="al-src-err">{t("Could not load: ", "تعذّر تحميل: ")}{errs.map((k) => SRC_L[k][l2]).join(isRTL ? "، " : ", ")} — {t("these sections may be incomplete.", "قد تكون هذه الأقسام ناقصة.")}</div>}
      {truncated && <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-200 text-xs p-3" data-testid="al-trunc">{t("Stock list was cut at 5,000 items — raise the stock limit or fix stock first.", "قائمة المخزون قُطعت عند 5,000 صنف — ارفع حدّ المخزون أو عالج المخزون أولًا.")}</div>}
      {shopId == null && <div className="rounded-xl border border-slate-700 bg-slate-900 text-slate-300 text-xs p-3">{t("No branch selected: stock alerts are unavailable.", "لا يوجد فرع محدد: تنبيهات المخزون غير متاحة.")}</div>}

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-6">
        {kpi("al-kpi-critical", t("Critical (open)", "حرجة (مفتوحة)"), kp.critical, "text-red-400", () => setF({ ...f, prio: f.prio === "critical" ? "all" : "critical", status: "open" }), f.prio === "critical")}
        {kpi("al-kpi-warning", t("Warnings (open)", "تحذيرات (مفتوحة)"), kp.warning, "text-amber-300", () => setF({ ...f, prio: f.prio === "warning" ? "all" : "warning", status: "open" }), f.prio === "warning")}
        {kpi("al-kpi-info", t("For info (open)", "للعلم (مفتوحة)"), kp.info, "text-sky-300", () => setF({ ...f, prio: f.prio === "info" ? "all" : "info", status: "open" }), f.prio === "info")}
        {kpi("al-kpi-ack", t("Acknowledged", "تم الاطلاع"), kp.ack, "text-emerald-300", () => setF({ ...f, prio: "all", status: f.status === "ack" ? "open" : "ack" }), f.status === "ack")}
        {money("al-kpi-sup-amt", t("Overdue to suppliers", "متأخر للموردين"), kp.supOverdueAmt)}
        {money("al-kpi-cus-amt", t("Overdue from customers", "متأخر من العملاء"), kp.cusOverdueAmt)}
      </div>

      <div className={`${CARD} p-3 flex flex-wrap gap-2`} role="tablist">
        <button type="button" role="tab" aria-selected={f.cat === "all"} onClick={() => setF({ ...f, cat: "all" })} data-testid="al-tab-all" className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${f.cat === "all" ? "bg-blue-600 border-blue-500 text-white" : "bg-slate-800 border-slate-700 text-slate-300"}`}>{t("All", "الكل")} <span className="font-mono" dir="ltr">{kp.open}</span></button>
        {CATS.map((c) => <button key={c} type="button" role="tab" aria-selected={f.cat === c} onClick={() => setF({ ...f, cat: c })} data-testid={`al-tab-${c}`} className={`px-3 py-1.5 rounded-lg text-xs font-bold border inline-flex items-center gap-1.5 ${f.cat === c ? "bg-blue-600 border-blue-500 text-white" : "bg-slate-800 border-slate-700 text-slate-300"}`}>{catIcon(c)}{CAT_L[c][l2]} <span className="font-mono" dir="ltr">{kp.byCat[c]}</span></button>)}
      </div>

      <div className={`${CARD} p-4`}>
        <div className="grid gap-3 md:grid-cols-4 mb-3">
          <div className="md:col-span-2 relative"><Search size={15} className="absolute top-1/2 -translate-y-1/2 start-3 text-slate-500" /><input value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder={t("Search name, invoice or code…", "ابحث بالاسم أو رقم الفاتورة أو الكود…")} className={`${INP} ps-9`} data-testid="al-q" /></div>
          <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as AFilter["status"] })} className={INP} data-testid="al-status"><option value="open">{t("Open", "مفتوح")}</option><option value="ack">{t("Acknowledged", "تم الاطلاع")}</option><option value="snoozed">{t("Snoozed", "مؤجَّل")}</option><option value="all">{t("All statuses", "كل الحالات")}</option></select>
          <div className="flex gap-1.5 items-center"><label className="text-[11px] text-slate-400 shrink-0">{t("Low-stock limit", "حد نقص المخزون")}</label>
            <input value={thInput} onChange={(e) => setThInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") applyThreshold(); }} inputMode="numeric" dir="ltr" className={INP + " w-16 text-center"} data-testid="al-threshold" />
            <button type="button" onClick={applyThreshold} className={BTN} data-testid="al-th-apply">{t("Apply", "تطبيق")}</button></div>
        </div>
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-sm min-w-[1040px]" data-testid="al-table">
            <thead className="bg-slate-800/70 text-slate-300 text-xs"><tr><th className="p-2 text-start w-24">{t("Priority", "الأولوية")}</th><th className="p-2 text-start w-40">{t("Category", "القسم")}</th><th className="p-2 text-start">{t("Alert", "التنبيه")}</th><th className="p-2 text-end w-32">{t("Amount", "المبلغ")}</th><th className="p-2 w-[22rem]">{t("Actions", "الإجراءات")}</th></tr></thead>
            <tbody>
              {loading && <tr><td colSpan={5} className="p-8 text-center text-slate-500" data-testid="al-loading">{t("Loading…", "جارٍ التحميل…")}</td></tr>}
              {!loading && rows.slice(0, shown).map((a) => (
                <tr key={a.id} className={`border-t border-slate-800 ${a.status === "open" ? "" : "opacity-60"}`} data-testid="al-row" data-prio={a.prio} data-cat={a.cat} data-status={a.status} data-kind={a.kind}>
                  <td className="p-2"><span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border ${PRIO_L[a.prio].tone}`} data-testid="al-prio">{PRIO_L[a.prio][l2]}</span></td>
                  <td className="p-2 text-xs text-slate-400"><span className="inline-flex items-center gap-1.5">{catIcon(a.cat)}{CAT_L[a.cat][l2]}</span></td>
                  <td className="p-2"><div className="font-semibold" data-testid="al-title">{title(a)}</div><div className="text-[11px] text-slate-400" data-testid="al-detail">{detail(a)}{a.status === "snoozed" && a.until ? ` · ${t("snoozed until", "مؤجَّل حتى")} ${a.until}` : ""}</div></td>
                  <td className="p-2 text-end font-mono" dir="ltr" data-testid="al-amount">{a.amount != null && a.amount !== 0 ? fmt(a.amount) : "—"}</td>
                  <td className="p-2"><div className="flex items-center justify-center gap-1.5 whitespace-nowrap">
                    <button type="button" onClick={() => go(a)} className={BTN} data-testid="al-open"><ExternalLink size={13} />{t("Open", "فتح")}</button>
                    {a.status === "open" ? (<>
                      <button type="button" onClick={() => mutate((s) => acknowledge(s, a, today))} className={BTN} data-testid="al-ack"><Check size={13} />{t("Seen", "تم الاطلاع")}</button>
                      <button type="button" onClick={() => mutate((s) => snooze(s, a.id, addDays(today, 1)))} className={BTN} data-testid="al-snooze1" title={t("Hide until tomorrow", "إخفاء حتى الغد")}><Clock size={13} />{t("1d", "يوم")}</button>
                      <button type="button" onClick={() => mutate((s) => snooze(s, a.id, addDays(today, 7)))} className={BTN} data-testid="al-snooze7" title={t("Hide for 7 days", "إخفاء 7 أيام")}><BellOff size={13} />{t("7d", "7 أيام")}</button>
                    </>) : <button type="button" onClick={() => mutate((s) => restore(s, a.id))} className={BTN} data-testid="al-restore"><RotateCcw size={13} />{t("Reopen", "إعادة فتح")}</button>}
                  </div></td>
                </tr>))}
              {!loading && rows.length === 0 && <tr><td colSpan={5} className="p-10 text-center" data-testid="al-empty"><Check className="mx-auto mb-2 text-emerald-400" size={28} /><div className="text-slate-300 font-bold">{f.status === "open" && f.cat === "all" && !f.q && f.prio === "all" ? t("No open alerts — everything is on track.", "لا توجد تنبيهات مفتوحة — كل شيء على ما يرام.") : t("No alerts match the filters.", "لا تنبيهات مطابقة للفلاتر.")}</div></td></tr>}
            </tbody>
          </table>
        </div>
        {!loading && rows.length > shown && <div className="mt-3 text-center"><button type="button" onClick={() => setShown(shown + PAGE)} className={BTN} data-testid="al-more">{t(`Show more (${rows.length - shown})`, `عرض المزيد (${rows.length - shown})`)}</button></div>}
        <div className="mt-2 text-[11px] text-slate-500" data-testid="al-count">{rows.length} / {views.length} · {kp.snoozed > 0 ? `${t("snoozed", "مؤجَّل")}: ${kp.snoozed}` : ""}</div>
      </div>
    </div>
  );
}
