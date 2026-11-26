// =============================================================
// src/pages/purchases/list/PurchaseListView.tsx
// عرض قائمة فواتير المشتريات: مؤشرات مع مقارنة الفترة السابقة، فلاتر متقدمة، ترتيب،
// لوحة «الأصناف التي تغيّر سعرها»، اتجاه المشتريات الشهري وحصص الموردين، تفاصيل الفاتورة، Excel + طباعة.
// قراءة فقط؛ إنشاء الفاتورة يبقى في نموذج PurchaseInvoicesPage.
// =============================================================
import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { AlertTriangle, ArrowDown, ArrowUp, Building2, Calendar, ChevronsUpDown, Download, FileText, Package, Plus, Printer, RotateCcw, Search, TrendingDown, TrendingUp, Wallet, X } from "lucide-react";
import { useLang } from "../../../context/LanguageContext";
import * as DB from "../../lib/accountingDb";
import { buildReportHTML, openPrint, type ReportCol } from "../../accounting/shared/printReport";
import StatementCharts, { type ChartSpec } from "../../accounting/statements/StatementCharts";
import { topShares } from "../../accounting/statements/statementsLogic";
import { fetchPrintOrg, type PrintOrg } from "../../sales/salesInvoiceApi";
import { printHTML } from "../../sales/salesInvoicePrint";
import { buildPurchaseInvoiceHTML } from "../print/purchasePrint";
import { ACTIVE } from "../../lib/orgConfig";
import {
  DEFAULT_PFILTER, addDaysStr, delta, enrich, filterRows, kpis, monthly, prevPeriod, priceChanges, sortRows, supplierTotals,
  type PFilter, type PInv, type PRow, type PayState, type SortKey,
} from "./purchasesLogic";

const CARD = "bg-slate-900 border border-slate-800 rounded-2xl";
const INPUT = "w-full bg-slate-950 border border-slate-700 rounded-xl text-white px-3 py-2 text-sm outline-none focus:border-blue-500 transition-colors";
const DATE = INPUT + " [color-scheme:dark]";
const LABEL = "text-[10px] text-slate-500 font-bold mb-1 block";
const BTN_SOFT = "inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 hover:text-white font-bold text-xs transition-colors disabled:opacity-50";
const BTN_BLUE = "inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm transition-colors";
const fmt = (n: number): string => (Math.round(n * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pad = (n: number): string => String(n).padStart(2, "0");
const ymd = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const PAGE = 25;
const KIND: Record<string, { en: string; ar: string }> = { inventory: { en: "Inventory", ar: "مخزون" }, expense: { en: "Expense", ar: "مصروف" }, asset: { en: "Fixed asset", ar: "أصل ثابت" } };
const PAY: Record<string, { en: string; ar: string; tone: string }> = {
  cash: { en: "Cash", ar: "نقدي", tone: "bg-emerald-500/15 text-emerald-300" }, credit: { en: "Credit", ar: "آجل", tone: "bg-amber-500/15 text-amber-300" },
  partial: { en: "Partial", ar: "جزئي", tone: "bg-sky-500/15 text-sky-300" }, card: { en: "Card", ar: "شبكة", tone: "bg-violet-500/15 text-violet-300" },
};
const STATE: Record<PayState, { en: string; ar: string; tone: string }> = {
  paid: { en: "Paid", ar: "مسدّدة", tone: "bg-emerald-500/15 text-emerald-300" }, unpaid: { en: "Unpaid", ar: "غير مسدّدة", tone: "bg-amber-500/15 text-amber-300" },
  partial: { en: "Partly paid", ar: "مسدّدة جزئيًا", tone: "bg-sky-500/15 text-sky-300" }, overdue: { en: "Overdue", ar: "متأخرة", tone: "bg-red-500/15 text-red-300" },
};

export type PurchaseListProps = {
  orgId: number | null; orgName: string; shopId: number | null; branchId: number | null;
  list: DB.GLPurchaseInvoice[]; retByInv: Record<number, number>;
  from: string; to: string; setFrom: (v: string) => void; setTo: (v: string) => void;
  onReload: () => void; onNew: () => void; notice: string | null;
};

export default function PurchaseListView(p: PurchaseListProps) {
  const { t, lang, isRTL } = useLang(); const l2 = lang === "en" ? "en" : "ar";
  const [f, setF] = useState<PFilter>(DEFAULT_PFILTER);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "date", dir: "desc" });
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<PRow | null>(null);
  const [hist, setHist] = useState<PInv[]>([]); const [prev, setPrev] = useState<PInv[]>([]); const [shop, setShop] = useState<PrintOrg | null>(null);
  const today = ymd(new Date());

  useEffect(() => { let a = true; if (p.orgId) void fetchPrintOrg(p.orgId, p.shopId).then((s) => { if (a) setShop(s); }).catch(() => undefined); return () => { a = false; }; }, [p.orgId, p.shopId]);
  useEffect(() => {
    if (p.orgId == null) return; let a = true; const pp = prevPeriod(p.from, p.to); const hs = ymd(new Date(Number(p.to.slice(0, 4)), Number(p.to.slice(5, 7)) - 12, 1));
    void Promise.all([DB.fetchPurchaseInvoices(p.orgId, hs, p.to, p.branchId), DB.fetchPurchaseInvoices(p.orgId, pp.from, pp.to, p.branchId)]).then(([h, pv]) => { if (a) { setHist(h as unknown as PInv[]); setPrev(pv as unknown as PInv[]); } });
    return () => { a = false; };
  }, [p.orgId, p.branchId, p.from, p.to, p.list]);
  useEffect(() => { if (!open) return; const h = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(null); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [open]);

  const all = useMemo(() => enrich(p.list as unknown as PInv[], p.retByInv, today), [p.list, p.retByInv, today]);
  const rows = useMemo(() => sortRows(filterRows(all, f), sort.key, sort.dir), [all, f, sort]);
  const k = useMemo(() => kpis(all), [all]); const kf = useMemo(() => kpis(rows), [rows]);
  const kp = useMemo(() => kpis(enrich(prev, {}, today)), [prev, today]);
  const suppliers = useMemo(() => [...new Set(all.map((r) => r.inv.supplier_name ?? "").filter((x) => x !== ""))].sort(), [all]);
  const changes = useMemo(() => priceChanges(hist, p.from, p.to), [hist, p.from, p.to]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE)); const pageRows = rows.slice(page * PAGE, page * PAGE + PAGE);
  useEffect(() => { if (page >= pages) setPage(0); }, [pages, page]);
  const filtered = JSON.stringify(f) !== JSON.stringify(DEFAULT_PFILTER);

  const chart: ChartSpec = useMemo(() => {
    const loc = lang === "en" ? "en-US" : "ar-SA-u-nu-latn";
    const m = monthly(hist, p.to, 12);
    return {
      bars: { title: t("Purchases trend — last 12 months", "اتجاه المشتريات — آخر 12 شهرًا"), rows: m.map((x) => ({ label: new Date(Number(x.key.slice(0, 4)), Number(x.key.slice(5)) - 1, 1).toLocaleDateString(loc, { month: "short", year: "2-digit" }), value: x.total, tone: "info" as const })) },
      donut: { title: t("Share by supplier (period)", "حصة الموردين (الفترة)"), slices: topShares(supplierTotals(rows).map((s) => ({ label: s.label || t("(no supplier)", "(بدون مورد)"), value: s.value })), 5, t("Other", "أخرى")), center: fmt(kf.total) },
    };
  }, [hist, p.to, rows, kf.total, lang, t]);

  const preset = (key: "month" | "last" | "30" | "year") => {
    const d = new Date();
    if (key === "month") { p.setFrom(ymd(new Date(d.getFullYear(), d.getMonth(), 1))); p.setTo(today); }
    else if (key === "last") { p.setFrom(ymd(new Date(d.getFullYear(), d.getMonth() - 1, 1))); p.setTo(ymd(new Date(d.getFullYear(), d.getMonth(), 0))); }
    else if (key === "30") { p.setFrom(addDaysStr(today, -29)); p.setTo(today); } else { p.setFrom(`${d.getFullYear()}-01-01`); p.setTo(today); }
  };
  const toggleSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "supplier" ? "asc" : "desc" }));
  const sortIcon = (key: SortKey) => (sort.key !== key ? <ChevronsUpDown size={11} className="opacity-40" /> : sort.dir === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />);

  // ── Excel / طباعة (الصفوف المصفّاة كلها) ──
  const heads = [t("Invoice", "الفاتورة"), t("Date", "التاريخ"), t("Supplier", "المورد"), t("Supplier inv.", "فاتورة المورد"), t("Type", "النوع"), t("Payment", "الدفع"), t("Total", "الإجمالي"), t("VAT", "الضريبة"), t("Paid", "المدفوع"), t("Due", "المستحق"), t("Due date", "الاستحقاق"), t("Status", "الحالة"), t("Returned", "المرتجع")];
  const cell = (r: PRow): (string | number)[] => [r.label, r.inv.date, r.inv.supplier_name ?? "", r.inv.supplier_invoice_no ?? "", KIND[r.inv.purchase_kind]?.[l2] ?? r.inv.purchase_kind, PAY[r.inv.payment_type]?.[l2] ?? r.inv.payment_type, r.total, r.tax, r.paid, r.due, r.inv.due_date ?? "", r.active ? STATE[r.state][l2] : t("Cancelled", "ملغاة"), r.returned || ""];
  const title = t("Purchase invoices", "فواتير المشتريات"); const sub = `${p.from} → ${p.to} · ${t("Total", "الإجمالي")} ${fmt(kf.total)} · ${t("Due", "المستحق")} ${fmt(kf.due)}`;
  const exportX = () => {
    const ws = XLSX.utils.aoa_to_sheet([[title, sub], [], heads, ...rows.map(cell), [], [t("Totals", "الإجماليات"), "", "", "", "", "", kf.total, kf.tax, kf.paid, kf.due]]);
    ws["!cols"] = heads.map((_, i) => ({ wch: i === 2 ? 26 : 14 })); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Purchases"); XLSX.writeFile(wb, `purchase_invoices_${p.from}_${p.to}.xlsx`);
  };
  const printRow = (r: PRow) => {
    const org2: PrintOrg = shop ?? { name: p.orgName, tax_number: null, commercial_registration: null, phone: null, address: null, logo_url: null };
    printHTML(buildPurchaseInvoiceHTML({ ...r.inv, items: r.inv.items ?? [], tax_amount: r.tax, total: r.total, paid_amount: r.paid }, { ...org2, name: org2.name || p.orgName }, { paymentLabel: PAY[r.inv.payment_type]?.[l2] ?? r.inv.payment_type, currency: ACTIVE.symbol }, l2));
  };
  const printX = () => {
    const cols: ReportCol[] = heads.map((h, i) => ({ label: h, mono: i === 0 || i === 1 || i === 3 || i >= 6 && i <= 10, align: i >= 6 && i <= 9 || i === 12 ? ("end" as const) : undefined }));
    const ok = openPrint(buildReportHTML({ title, subtitle: sub, orgName: shop?.name || p.orgName, taxNumber: shop?.tax_number, logoUrl: shop?.logo_url, address: shop?.address, dir: isRTL ? "rtl" : "ltr", lang: l2, cols, rows: rows.map(cell), totals: [t("Totals", "الإجماليات"), "", "", "", "", "", kf.total, kf.tax, kf.paid, kf.due, "", "", ""] }));
    if (!ok) alert(t("Allow pop-ups to print.", "فعّل النوافذ المنبثقة للطباعة."));
  };

  const th = "text-[10px] px-2 py-2.5 bg-slate-950 text-slate-400 whitespace-nowrap border-b border-slate-700 font-bold sticky top-0 z-10 text-start";
  const td = "px-2 py-2 text-xs border-b border-slate-800";
  const sortTh = (key: SortKey, label: string, end = false) => <th className={th + (end ? " text-end" : "")}><button type="button" onClick={() => toggleSort(key)} data-testid={`pl-sort-${key}`} className="inline-flex items-center gap-1 hover:text-white">{label}{sortIcon(key)}</button></th>;
  const chipDelta = (cur: number, pv: number, tid: string, invert = false) => {
    const d = delta(cur, pv); if (d == null) return <span className="text-[10px] text-slate-600" data-testid={tid}>—</span>;
    const good = invert ? d <= 0 : d >= 0; return <span className={`text-[10px] font-mono font-bold ${d === 0 ? "text-slate-400" : good ? "text-emerald-400" : "text-red-300"}`} dir="ltr" data-testid={tid}>{d > 0 ? "▲" : d < 0 ? "▼" : ""} {fmt(Math.abs(d))}% </span>;
  };
  const kpi = (tid: string, icon: React.ReactNode, label: string, val: string, tone: string, extra?: React.ReactNode) => (
    <div className={`${CARD} p-3`}><div className="flex items-center justify-between text-slate-500">{icon}{extra}</div><div className="text-[10px] text-slate-500 font-bold mt-2">{label}</div><div className={`text-lg font-extrabold font-mono mt-0.5 ${tone}`} dir="ltr" data-testid={tid}>{val}</div></div>
  );
  const sel = (id: string, label: string, val: string, on: (v: string) => void, opts: [string, string][]) => (
    <div><label className={LABEL}>{label}</label><select value={val} onChange={(e) => { on(e.target.value); setPage(0); }} className={INPUT} data-testid={id}>{opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
  );

  return (
    <div className="p-4 lg:p-6 min-h-screen" dir={isRTL ? "rtl" : "ltr"} data-testid="purchase-list">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3"><div className="w-11 h-11 rounded-2xl bg-blue-500/15 text-blue-400 flex items-center justify-center"><FileText size={22} /></div>
          <div><h1 className="text-xl font-black text-white">{title}</h1><p className="text-xs text-slate-500">{p.orgName || "—"} · {t("recorded with accounting posting and stock receipt", "تسجيل مشتريات بالترحيل المحاسبي وإدخال المخزون")}</p></div></div>
        <div className="flex flex-wrap gap-2"><button type="button" onClick={exportX} disabled={rows.length === 0} className={BTN_SOFT} data-testid="pl-export"><Download size={14} /> Excel</button>
          <button type="button" onClick={printX} disabled={rows.length === 0} className={BTN_SOFT} data-testid="pl-print"><Printer size={14} /> {t("Print", "طباعة")}</button>
          <button type="button" onClick={p.onNew} className={BTN_BLUE} data-testid="pl-new"><Plus size={18} /> {t("New purchase invoice", "فاتورة شراء جديدة")}</button></div>
      </div>
      {p.notice && <div className="mb-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl px-4 py-3 text-sm" data-testid="pl-notice">{p.notice}</div>}

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 mb-4">
        {kpi("pl-kpi-count", <FileText size={16} />, t("Invoices", "عدد الفواتير"), String(k.count), "text-sky-300", chipDelta(k.count, kp.count, "pl-delta-count"))}
        {kpi("pl-kpi-total", <TrendingUp size={16} />, t("Total purchases", "إجمالي المشتريات"), fmt(k.total), "text-white", chipDelta(k.total, kp.total, "pl-delta-total"))}
        {kpi("pl-kpi-tax", <Package size={16} />, t("Input VAT", "ضريبة المدخلات"), fmt(k.tax), "text-violet-300", chipDelta(k.tax, kp.tax, "pl-delta-tax"))}
        {kpi("pl-kpi-paid", <Wallet size={16} />, t("Paid", "المدفوع"), fmt(k.paid), "text-emerald-400")}
        {kpi("pl-kpi-due", <Building2 size={16} />, t("Due to suppliers", "مستحق للموردين"), fmt(k.due), "text-amber-300", chipDelta(k.due, kp.due, "pl-delta-due", true))}
        {kpi("pl-kpi-overdue", <AlertTriangle size={16} />, t("Overdue", "متأخر السداد"), fmt(k.overdue), k.overdue > 0 ? "text-red-300" : "text-slate-400", <span className="text-[10px] font-mono text-slate-500" dir="ltr" data-testid="pl-overdue-count">{k.overdueCount}</span>)}
      </div>
      <div className="text-[10px] text-slate-500 mb-3" data-testid="pl-prev-note">{t("Change vs the previous period of equal length", "التغيّر مقابل الفترة السابقة بنفس الطول")}: {prevPeriod(p.from, p.to).from} → {prevPeriod(p.from, p.to).to}</div>

      <div className={`${CARD} p-3 mb-4`}>
        <div className="flex flex-wrap items-end gap-3">
          <div><label className={LABEL}><Calendar size={11} className="inline" /> {t("From", "من")}</label><input type="date" value={p.from} onChange={(e) => p.setFrom(e.target.value)} className={DATE} data-testid="pl-from" /></div>
          <div><label className={LABEL}>{t("To", "إلى")}</label><input type="date" value={p.to} onChange={(e) => p.setTo(e.target.value)} className={DATE} data-testid="pl-to" /></div>
          <div className="flex flex-wrap gap-1.5">{([["month", t("This month", "هذا الشهر")], ["last", t("Last month", "الشهر الماضي")], ["30", t("30 days", "30 يومًا")], ["year", t("This year", "هذا العام")]] as const).map(([key, l]) => <button type="button" key={key} onClick={() => preset(key)} className={BTN_SOFT} data-testid={`pl-preset-${key}`}>{l}</button>)}</div>
          <button type="button" onClick={p.onReload} className={BTN_SOFT} data-testid="pl-reload"><RotateCcw size={13} /> {t("Refresh", "تحديث")}</button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-7 gap-3 mt-3">
          <div className="col-span-2 xl:col-span-2"><label className={LABEL}>{t("Search", "بحث")}</label><div className="relative"><Search size={14} className="absolute top-1/2 -translate-y-1/2 start-3 text-slate-500" /><input value={f.q} onChange={(e) => { setF({ ...f, q: e.target.value }); setPage(0); }} className={INPUT + " ps-9"} data-testid="pl-q" placeholder={t("number, supplier, supplier invoice, note…", "رقم، مورد، فاتورة المورد، ملاحظة…")} /></div></div>
          {sel("pl-supplier", t("Supplier", "المورد"), f.supplier, (v) => setF({ ...f, supplier: v }), [["all", t("All", "الكل")], ...suppliers.map((s): [string, string] => [s, s])])}
          {sel("pl-pay", t("Payment", "طريقة الدفع"), f.pay, (v) => setF({ ...f, pay: v }), [["all", t("All", "الكل")], ...Object.entries(PAY).map(([v, o]): [string, string] => [v, o[l2]])])}
          {sel("pl-kind", t("Type", "نوع الشراء"), f.kind, (v) => setF({ ...f, kind: v }), [["all", t("All", "الكل")], ...Object.entries(KIND).map(([v, o]): [string, string] => [v, o[l2]])])}
          {sel("pl-state", t("Settlement", "السداد"), f.state, (v) => setF({ ...f, state: v as PFilter["state"] }), [["all", t("All", "الكل")], ...(Object.keys(STATE) as PayState[]).map((v): [string, string] => [v, STATE[v][l2]])])}
          {sel("pl-returned", t("Returns", "المرتجعات"), f.returned, (v) => setF({ ...f, returned: v as PFilter["returned"] }), [["all", t("All", "الكل")], ["any", t("With returns", "بها مرتجع")]])}
        </div>
        {filtered && <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-400"><span data-testid="pl-filtered-count">{rows.length} / {all.length}</span><button type="button" onClick={() => { setF(DEFAULT_PFILTER); setPage(0); }} className={BTN_SOFT} data-testid="pl-reset"><RotateCcw size={12} /> {t("Reset filters", "إعادة ضبط")}</button></div>}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px] items-start">
        <div className="min-w-0">
          <div className={`${CARD} overflow-x-auto`}>
            <table className="w-full border-collapse" style={{ minWidth: 980 }} data-testid="pl-table"><thead><tr>
              {sortTh("no", t("Invoice", "الفاتورة"))}{sortTh("date", t("Date", "التاريخ"))}{sortTh("supplier", t("Supplier", "المورد"))}<th className={th}>{t("Type", "النوع")}</th><th className={th}>{t("Payment", "الدفع")}</th>
              {sortTh("total", t("Total", "الإجمالي"), true)}<th className={th + " text-end"}>{t("Paid", "المدفوع")}</th>{sortTh("due", t("Due", "المستحق"), true)}<th className={th}>{t("Status", "الحالة")}</th><th className={th}>{t("Returns", "المرتجع")}</th><th className={th} /></tr></thead>
              <tbody>{pageRows.map((r) => (
                <tr key={r.inv.id} onClick={() => printRow(r)} title={t("Click to open the invoice for printing", "اضغط لفتح الفاتورة للطباعة")} className={`cursor-pointer hover:bg-white/[0.03] ${r.active ? "" : "opacity-50"}`} data-testid="pl-row" data-state={r.state} data-active={r.active ? "1" : "0"}>
                  <td className={`${td} font-mono text-blue-300`} dir="ltr" data-testid="pl-no">{r.label}</td><td className={`${td} font-mono text-slate-400`} dir="ltr">{r.inv.date}</td>
                  <td className={`${td} text-slate-100`}>{r.inv.supplier_name || "—"}{r.inv.supplier_invoice_no && <span className="text-slate-500 font-mono text-[10px]" dir="ltr"> · {r.inv.supplier_invoice_no}</span>}</td>
                  <td className={`${td} text-slate-400`}>{KIND[r.inv.purchase_kind]?.[l2] ?? r.inv.purchase_kind}</td>
                  <td className={td}><span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${PAY[r.inv.payment_type]?.tone ?? "bg-slate-700 text-slate-300"}`}>{PAY[r.inv.payment_type]?.[l2] ?? r.inv.payment_type}</span></td>
                  <td className={`${td} text-end font-mono text-white font-bold`} dir="ltr">{fmt(r.total)}</td><td className={`${td} text-end font-mono text-emerald-400`} dir="ltr">{fmt(r.paid)}</td>
                  <td className={`${td} text-end font-mono ${r.due > 0 ? "text-amber-300" : "text-slate-600"}`} dir="ltr">{fmt(r.due)}</td>
                  <td className={td}>{r.active ? <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${STATE[r.state].tone}`} data-testid="pl-state-badge">{STATE[r.state][l2]}{r.state === "overdue" ? ` · ${r.overdueDays}${t("d", "ي")}` : ""}</span> : <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-slate-700 text-slate-300">{t("Cancelled", "ملغاة")}</span>}</td>
                  <td className={td}>{r.retStatus === "none" ? <span className="text-slate-600">—</span> : <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${r.retStatus === "full" ? "bg-rose-500/15 text-rose-300" : "bg-orange-500/15 text-orange-300"}`} title={fmt(r.returned)}>{r.retStatus === "full" ? t("Fully returned", "مرتجعة بالكامل") : t("Partly returned", "مرتجعة جزئيًا")}</span>}</td>
                  <td className={td}><button type="button" onClick={(e) => { e.stopPropagation(); setOpen(r); }} className="text-[11px] px-2 py-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:text-white" data-testid="pl-detail">{t("Details", "تفاصيل")}</button></td></tr>))}</tbody>
              {rows.length > 0 && <tfoot><tr className="bg-slate-950/60 font-bold"><td className="px-2 py-2.5 text-xs text-slate-400 border-t border-slate-600" colSpan={5}>{t("Totals (filtered, active)", "الإجماليات (المصفّاة، الفعّالة)")}</td>
                <td className="px-2 py-2.5 text-end font-mono text-xs text-white border-t border-slate-600" dir="ltr" data-testid="pl-tot-total">{fmt(kf.total)}</td><td className="px-2 py-2.5 text-end font-mono text-xs text-emerald-400 border-t border-slate-600" dir="ltr" data-testid="pl-tot-paid">{fmt(kf.paid)}</td>
                <td className="px-2 py-2.5 text-end font-mono text-xs text-amber-300 border-t border-slate-600" dir="ltr" data-testid="pl-tot-due">{fmt(kf.due)}</td><td colSpan={2} className="border-t border-slate-600" /></tr></tfoot>}
            </table>
            {rows.length === 0 && <div className="p-10 text-center text-slate-500 text-sm" data-testid="pl-none"><Package size={30} className="mx-auto mb-2 opacity-40" />{all.length === 0 ? t("No purchase invoices in this period.", "لا توجد فواتير مشتريات في هذه الفترة.") : t("No invoices match the filters.", "لا فواتير تطابق الفلاتر.")}</div>}
          </div>
          {pages > 1 && <div className="mt-2 flex items-center justify-center gap-2 text-[11px] text-slate-400"><button type="button" disabled={page === 0} onClick={() => setPage(page - 1)} className={BTN_SOFT} data-testid="pl-prev">‹</button><span className="font-mono" dir="ltr" data-testid="pl-page">{page + 1} / {pages}</span><button type="button" disabled={page >= pages - 1} onClick={() => setPage(page + 1)} className={BTN_SOFT} data-testid="pl-next">›</button></div>}
        </div>

        <div className="space-y-3">
          <div className={`${CARD} p-4`} data-testid="pl-prices">
            <div className="flex items-center justify-between mb-3"><div className="text-xs font-bold text-slate-300">{t("Items whose purchase price changed", "الأصناف التي تغيّر سعر شرائها")}</div><span className="text-[10px] font-mono text-slate-500" dir="ltr" data-testid="pl-prices-count">{changes.length}</span></div>
            {changes.length === 0 ? <div className="text-[11px] text-slate-500 py-3 text-center" data-testid="pl-prices-none">{t("No price changes in this period.", "لا تغيّرات في الأسعار خلال هذه الفترة.")}</div> : (
              <ul className="divide-y divide-slate-800">{changes.slice(0, 8).map((c) => (
                <li key={c.key} className="py-2 flex items-center justify-between gap-2" data-testid="pl-price-row" data-dir={c.pct > 0 ? "up" : "down"}>
                  <div className="min-w-0"><div className="text-xs text-slate-100 truncate">{c.name}</div><div className="text-[10px] text-slate-500 font-mono" dir="ltr">{fmt(c.prev)} → {fmt(c.last)} · {c.invoice}{c.supplier ? ` · ${c.supplier}` : ""}</div></div>
                  <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold ${c.pct > 0 ? "bg-red-500/15 text-red-300" : "bg-emerald-500/15 text-emerald-300"}`} dir="ltr" data-testid="pl-price-pct">{c.pct > 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}{c.pct > 0 ? "+" : ""}{fmt(c.pct)}%</span></li>))}</ul>)}
            {changes.length > 8 && <div className="text-[10px] text-slate-500 mt-2">{t(`Showing 8 of ${changes.length} (largest change first).`, `عرض 8 من ${changes.length} (الأكبر تغيّرًا أولًا).`)}</div>}
            <div className="text-[10px] text-slate-600 mt-2">{t("Compared with the previous purchase of the same item, excluding VAT.", "مقارنة بآخر شراء سابق للصنف نفسه بدون الضريبة.")}</div>
          </div>
          <StatementCharts spec={chart} />
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={() => setOpen(null)} data-testid="pl-drawer-bg">
          <aside onClick={(e) => e.stopPropagation()} className="w-full max-w-md h-full overflow-y-auto bg-slate-900 border-s border-slate-800 p-5" dir={isRTL ? "rtl" : "ltr"} data-testid="pl-drawer" role="dialog" aria-label={open.label}>
            <div className="flex items-start justify-between mb-4"><div><div className="font-mono text-blue-300 font-bold" dir="ltr" data-testid="pl-d-no">{open.label}</div><div className="text-sm text-white font-bold mt-0.5">{open.inv.supplier_name || "—"}</div><div className="text-[11px] text-slate-500 font-mono" dir="ltr">{open.inv.date}{open.inv.supplier_invoice_no ? ` · ${open.inv.supplier_invoice_no}` : ""}</div></div>
              <div className="flex items-center gap-2"><button type="button" onClick={() => printRow(open)} className={BTN_SOFT} data-testid="pl-d-print"><Printer size={13} /> {t("Print", "طباعة")}</button><button type="button" onClick={() => setOpen(null)} aria-label={t("Close", "إغلاق")} data-testid="pl-d-close" className="text-slate-400 hover:text-white"><X size={18} /></button></div></div>
            <dl className="grid grid-cols-2 gap-y-1.5 text-[11px] mb-4">
              <dt className="text-slate-500">{t("Subtotal", "قبل الضريبة")}</dt><dd className="font-mono text-end text-slate-200" dir="ltr">{fmt(open.inv.subtotal)}</dd>
              <dt className="text-slate-500">{t("VAT", "الضريبة")} {open.inv.tax_rate}%{open.inv.tax_inclusive ? ` (${t("inclusive", "شاملة")})` : ""}</dt><dd className="font-mono text-end text-slate-200" dir="ltr">{fmt(open.tax)}</dd>
              <dt className="text-slate-300 font-bold">{t("Total", "الإجمالي")}</dt><dd className="font-mono text-end text-white font-bold" dir="ltr" data-testid="pl-d-total">{fmt(open.total)}</dd>
              <dt className="text-slate-500">{t("Paid", "المدفوع")}</dt><dd className="font-mono text-end text-emerald-400" dir="ltr">{fmt(open.paid)}</dd>
              <dt className="text-slate-500">{t("Due", "المستحق")}</dt><dd className="font-mono text-end text-amber-300" dir="ltr" data-testid="pl-d-due">{fmt(open.due)}</dd>
              {open.inv.due_date && <><dt className="text-slate-500">{t("Due date", "تاريخ الاستحقاق")}</dt><dd className="font-mono text-end text-slate-200" dir="ltr">{open.inv.due_date}</dd></>}
              {open.returned > 0 && <><dt className="text-slate-500">{t("Returned", "المرتجع")}</dt><dd className="font-mono text-end text-rose-300" dir="ltr" data-testid="pl-d-returned">{fmt(open.returned)}</dd></>}
              {open.inv.entry_id != null && <><dt className="text-slate-500">{t("Journal entry", "القيد")}</dt><dd className="font-mono text-end text-violet-300" dir="ltr">#{open.inv.entry_id}</dd></>}
            </dl>
            <div className="text-[11px] font-bold text-slate-400 mb-1">{t("Items", "الأصناف")}</div>
            <table className="w-full text-xs"><thead><tr className="text-[10px] text-slate-500"><th className="text-start py-1">{t("Description", "الوصف")}</th><th className="text-end" dir="ltr">{t("Qty", "الكمية")}</th><th className="text-end" dir="ltr">{t("Unit cost", "التكلفة")}</th><th className="text-end" dir="ltr">{t("Total", "الإجمالي")}</th></tr></thead>
              <tbody>{(open.inv.items ?? []).map((it, i) => <tr key={i} className="border-t border-slate-800" data-testid="pl-d-item"><td className="py-1.5 text-slate-200">{it.description || "—"}{it.product_id == null && <span className="text-[9px] text-slate-500"> ({t("no stock link", "بلا ربط مخزون")})</span>}</td><td className="text-end font-mono text-slate-300" dir="ltr">{it.qty}</td><td className="text-end font-mono text-slate-400" dir="ltr">{fmt(it.unit_cost)}</td><td className="text-end font-mono text-white" dir="ltr">{fmt(it.line_total)}</td></tr>)}</tbody></table>
            {(open.inv.items ?? []).length === 0 && <div className="text-[11px] text-slate-500 py-3 text-center">{t("No item lines.", "لا أسطر أصناف.")}</div>}
            {open.inv.notes && <div className="mt-4 text-[11px] text-slate-400" data-testid="pl-d-notes"><span className="text-slate-500">{t("Notes", "ملاحظات")}: </span>{open.inv.notes}</div>}
          </aside>
        </div>
      )}
    </div>
  );
}
