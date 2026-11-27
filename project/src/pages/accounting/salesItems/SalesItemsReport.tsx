// =============================================================
// src/pages/accounting/salesItems/SalesItemsReport.tsx
// تقرير «المبيعات بالأصناف»: تفصيلي (سطر لكل بند) أو مجمَّع حسب: الصنف / العميل / المجموعة / الماركة /
// العميل+الصنف / المجموعة+الصنف / اليوم / الشهر / الفرع / طريقة الدفع — مع أعمدة قابلة للاختيار في الوضعين
// (التاريخ، سعر البيع، السعر بعد الخصم، التكلفة، الربح…) وبحث ذكي وتصدير Excel وطباعة.
// يُستخدم كصفحة (تبويب في الحسابات) وكتفاصيل داخل نافذة «تكلفة المبيعات».
// =============================================================
import { useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Download, Printer, RefreshCw } from "lucide-react";
import { useLang } from "../../../context/LanguageContext";
import { buildReportHTML, openPrint, type ReportCol } from "../shared/printReport";
import { fetchSalesData } from "./salesItemsApi";
import { buildLines, enrichLines, filterLines, groupLines, totalsOf, type GroupDim, type GroupRow, type SaleLine } from "./salesItemsLogic";

type Branch = { id: number; name: string };
type Props = {
  org: { id: number; name: string }; branches?: Branch[]; head?: { taxNumber?: string | null; logoUrl?: string | null; address?: string | null };
  from?: string; to?: string; branchId?: number | null; embedded?: boolean;
};
const fmt = (n: number): string => (Math.round(n * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qf = (n: number): string => (Math.round(n * 1000) / 1000).toLocaleString("en-US", { maximumFractionDigits: 3 });
const isoDay = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const INPUT = "bg-slate-950 border border-slate-700 rounded-lg text-slate-100 px-2.5 py-2 text-xs outline-none focus:border-blue-500";
const BTN = "inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 hover:text-white font-bold text-xs transition-colors disabled:opacity-50";

// ── أعمدة الوضع التفصيلي ──
type ColKey = "doc" | "kind" | "date" | "customer" | "branch" | "pay" | "code" | "name" | "category" | "brand" | "qty" | "list" | "price" | "disc" | "net" | "ucost" | "cost" | "profit" | "margin";
const DETAIL_COLS: { k: ColKey; ar: string; en: string; num?: boolean }[] = [
  { k: "doc", ar: "رقم الفاتورة", en: "Invoice no." }, { k: "kind", ar: "نوع المستند", en: "Doc type" }, { k: "date", ar: "التاريخ", en: "Date" }, { k: "customer", ar: "العميل", en: "Customer" },
  { k: "branch", ar: "الفرع", en: "Branch" }, { k: "pay", ar: "طريقة الدفع", en: "Payment" }, { k: "code", ar: "كود الصنف", en: "Item code" }, { k: "name", ar: "الصنف", en: "Item" },
  { k: "category", ar: "المجموعة", en: "Group" }, { k: "brand", ar: "الماركة", en: "Brand" }, { k: "qty", ar: "الكمية", en: "Qty", num: true },
  { k: "list", ar: "سعر البيع (قبل الخصم)", en: "List price", num: true }, { k: "price", ar: "سعر الوحدة بعد الخصم", en: "Unit price", num: true },
  { k: "disc", ar: "الخصم", en: "Discount", num: true }, { k: "net", ar: "صافي المبيعات", en: "Net sales", num: true }, { k: "ucost", ar: "تكلفة الوحدة", en: "Unit cost", num: true },
  { k: "cost", ar: "إجمالي التكلفة", en: "Total cost", num: true }, { k: "profit", ar: "الربح", en: "Profit", num: true }, { k: "margin", ar: "الهامش %", en: "Margin %", num: true },
];
const DEFAULT_COLS: ColKey[] = ["doc", "date", "customer", "code", "name", "qty", "price", "net", "ucost", "cost", "profit", "margin"];

// ── أعمدة القياس في الوضع المجمَّع ──
type MKey = "qty" | "avgList" | "avgPrice" | "disc" | "net" | "avgCost" | "cost" | "profit" | "margin" | "docs" | "first" | "last";
const MEASURES: { k: MKey; ar: string; en: string; num: boolean }[] = [
  { k: "qty", ar: "الكمية", en: "Qty", num: true }, { k: "avgList", ar: "متوسط سعر البيع", en: "Avg list price", num: true }, { k: "avgPrice", ar: "متوسط السعر بعد الخصم", en: "Avg unit price", num: true },
  { k: "disc", ar: "الخصم", en: "Discount", num: true }, { k: "net", ar: "صافي المبيعات", en: "Net sales", num: true }, { k: "avgCost", ar: "متوسط تكلفة الوحدة", en: "Avg unit cost", num: true },
  { k: "cost", ar: "إجمالي التكلفة", en: "Total cost", num: true }, { k: "profit", ar: "الربح", en: "Profit", num: true }, { k: "margin", ar: "الهامش %", en: "Margin %", num: true },
  { k: "docs", ar: "عدد المستندات", en: "Documents", num: true }, { k: "first", ar: "أول تاريخ", en: "First date", num: false }, { k: "last", ar: "آخر تاريخ", en: "Last date", num: false },
];
const DEFAULT_M: MKey[] = ["qty", "avgPrice", "net", "cost", "profit", "margin", "docs"];

type View = "lines" | GroupDim;
const VIEWS: { k: View; ar: string; en: string }[] = [
  { k: "lines", ar: "تفصيلي (سطر لكل بند)", en: "Detailed (line per item)" }, { k: "item", ar: "بالصنف", en: "By item" }, { k: "customer", ar: "بالعميل", en: "By customer" },
  { k: "category", ar: "بالمجموعة", en: "By group" }, { k: "brand", ar: "بالماركة", en: "By brand" }, { k: "customer_item", ar: "بالعميل ثم الصنف", en: "By customer & item" },
  { k: "category_item", ar: "بالمجموعة ثم الصنف", en: "By group & item" }, { k: "month", ar: "بالشهر", en: "By month" }, { k: "day", ar: "باليوم", en: "By day" },
  { k: "branch", ar: "بالفرع", en: "By branch" }, { k: "pay", ar: "بطريقة الدفع", en: "By payment type" },
];
const LS = "mihwar.salesItems.cols", LSM = "mihwar.salesItems.mcols", LSV = "mihwar.salesItems.view";
function loadList<T extends string>(key: string, valid: readonly T[], def: T[]): T[] { try { const v = JSON.parse(localStorage.getItem(key) || "null") as unknown; if (Array.isArray(v)) { const ok = v.filter((k): k is T => valid.includes(k as T)); if (ok.length) return ok; } } catch { /* storage unavailable */ } return def; }
function saveLS(key: string, v: unknown): void { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage unavailable */ } }
function loadView(): View { try { const v = JSON.parse(localStorage.getItem(LSV) || "null") as unknown; if (typeof v === "string" && VIEWS.some((x) => x.k === v)) return v as View; } catch { /* storage unavailable */ } return "lines"; }

export default function SalesItemsReport({ org, branches, head, from: pFrom, to: pTo, branchId: pBranch, embedded }: Props) {
  const { t, lang, isRTL } = useLang();
  const L = (ar: string, en: string): string => (lang === "ar" ? ar : en);
  const today = isoDay(new Date());
  const [from, setFrom] = useState(pFrom || `${today.slice(0, 4)}-01-01`); const [to, setTo] = useState(pTo || today);
  const [branch, setBranch] = useState<string>(pBranch != null ? String(pBranch) : "");
  const [view, setView] = useState<View>(loadView); const [withReturns, setWithReturns] = useState(true);
  const [q, setQ] = useState("");
  const [cols, setCols] = useState<ColKey[]>(() => loadList(LS, DETAIL_COLS.map((c) => c.k), DEFAULT_COLS));
  const [mcols, setMcols] = useState<MKey[]>(() => loadList(LSM, MEASURES.map((c) => c.k), DEFAULT_M));
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null); const [trunc, setTrunc] = useState(false);
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchSalesData>> | null>(null);
  useEffect(() => { if (pFrom) setFrom(pFrom); if (pTo) setTo(pTo); setBranch(pBranch != null ? String(pBranch) : ""); }, [pFrom, pTo, pBranch]);
  const bName = useCallback((id: number | null): string => (id == null ? "" : branches?.find((b) => b.id === id)?.name ?? String(id)), [branches]);

  const load = useCallback(async () => {
    setBusy(true); setErr(null);
    const d = await fetchSalesData(org.id, from, to, branch ? Number(branch) : null);
    setData(d); setErr(d.error); setTrunc(d.truncated); setBusy(false);
  }, [org.id, from, to, branch]);
  useEffect(() => { void load(); }, [load]);

  const lines = useMemo<SaleLine[]>(() => (data ? enrichLines(buildLines(data.invoices, data.returns, data.originals, data.moves, withReturns), data.prods) : []), [data, withReturns]);
  const shown = useMemo(() => filterLines(lines, q), [lines, q]);
  const tot = useMemo(() => totalsOf(shown), [shown]);
  const groups = useMemo<GroupRow[]>(() => (view === "lines" ? [] : groupLines(shown, view, bName, "—")), [shown, view, bName]);
  const changeView = (v: View): void => { setView(v); saveLS(LSV, v); };
  const toggleCol = (k: ColKey): void => setCols((c) => { const n = c.includes(k) ? c.filter((x) => x !== k) : DETAIL_COLS.map((d) => d.k).filter((x) => x === k || c.includes(x)); saveLS(LS, n); return n; });
  const toggleM = (k: MKey): void => setMcols((c) => { const n = c.includes(k) ? c.filter((x) => x !== k) : MEASURES.map((d) => d.k).filter((x) => x === k || c.includes(x)); saveLS(LSM, n); return n; });
  const active = useMemo(() => DETAIL_COLS.filter((c) => cols.includes(c.k)), [cols]);
  const activeM = useMemo(() => MEASURES.filter((c) => mcols.includes(c.k)), [mcols]);

  const cell = (l: SaleLine, k: ColKey): string | number => {
    switch (k) {
      case "doc": return l.docNo; case "kind": return l.kind === "sale" ? L("بيع", "Sale") : L("مرتجع", "Return"); case "date": return l.date; case "customer": return l.customer || "—";
      case "branch": return bName(l.branchId) || "—"; case "pay": return l.payType || "—"; case "code": return l.code ?? "—"; case "name": return l.name || "—";
      case "category": return l.category || "—"; case "brand": return l.brand || "—"; case "qty": return l.qty; case "list": return l.listPrice ?? "—"; case "price": return l.unitPrice;
      case "disc": return l.discount; case "net": return l.net; case "ucost": return l.unitCost ?? "—"; case "cost": return l.cost ?? "—"; case "profit": return l.profit ?? "—";
      case "margin": return l.margin == null ? "—" : `${l.margin}%`;
    }
  };
  const mCell = (g: GroupRow, k: MKey): string | number => {
    switch (k) {
      case "qty": return g.qty; case "avgList": return g.avgList ?? "—"; case "avgPrice": return g.avgPrice; case "disc": return g.discount; case "net": return g.net;
      case "avgCost": return g.avgCost ?? "—"; case "cost": return g.cost; case "profit": return g.profit; case "margin": return g.margin == null ? "—" : `${g.margin}%`;
      case "docs": return g.docs; case "first": return g.first; case "last": return g.last;
    }
  };
  // أعمدة التعريف (الأبعاد) لكل تجميع
  const dimHeads = useMemo<string[]>(() => {
    switch (view) {
      case "item": return [L("كود الصنف", "Item code"), L("الصنف", "Item")];
      case "customer": return [L("العميل", "Customer")]; case "category": return [L("المجموعة", "Group")]; case "brand": return [L("الماركة", "Brand")];
      case "customer_item": return [L("العميل", "Customer"), L("كود الصنف", "Item code"), L("الصنف", "Item")];
      case "category_item": return [L("المجموعة", "Group"), L("كود الصنف", "Item code"), L("الصنف", "Item")];
      case "day": return [L("التاريخ", "Date")]; case "month": return [L("الشهر", "Month")]; case "branch": return [L("الفرع", "Branch")]; case "pay": return [L("طريقة الدفع", "Payment")];
      default: return [];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, lang]);
  const dimCells = (g: GroupRow): string[] => (view === "item" ? [g.code ?? "—", g.label] : view === "customer_item" || view === "category_item" ? [g.sub, g.code ?? "—", g.label] : [g.label]);

  const lineHeads = active.map((c) => L(c.ar, c.en));
  const lineRows = (): (string | number)[][] => shown.map((l) => active.map((c) => cell(l, c.k)));
  const groupHeads = [...dimHeads, ...activeM.map((m) => L(m.ar, m.en))];
  const groupRows = (): (string | number)[][] => groups.map((g) => [...dimCells(g), ...activeM.map((m) => mCell(g, m.k))]);
  const totalCell = (k: MKey): string | number => (k === "qty" ? tot.qty : k === "net" ? tot.net : k === "cost" ? tot.cost : k === "profit" ? tot.profit : k === "margin" ? (tot.margin == null ? "" : `${tot.margin}%`) : "");
  const period = `${from} → ${to}`;
  const viewLabel = VIEWS.find((v) => v.k === view);
  const title = L("المبيعات بالأصناف", "Sales by items") + (view === "lines" ? "" : ` — ${L(viewLabel?.ar ?? "", viewLabel?.en ?? "")}`);

  const exportX = (): void => {
    const heads = view === "lines" ? lineHeads : groupHeads; const rows = view === "lines" ? lineRows() : groupRows();
    const ws = XLSX.utils.aoa_to_sheet([[title, period], [], heads, ...rows]);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Sales"); XLSX.writeFile(wb, `sales_by_items_${view}_${from}_${to}.xlsx`);
  };
  const printX = (): void => {
    const isL = view === "lines";
    const rc: ReportCol[] = isL ? active.map((c) => ({ label: L(c.ar, c.en), mono: c.k === "doc" || c.k === "date" || c.k === "code", align: c.num ? "end" : "start" }))
      : [...dimHeads.map((h): ReportCol => ({ label: h, align: "start" })), ...activeM.map((m): ReportCol => ({ label: L(m.ar, m.en), mono: !m.num, align: m.num ? "end" : "start" }))];
    const rows = isL ? lineRows() : groupRows();
    const lt = L("الإجماليات", "Totals");
    const totals = isL ? active.map((c, i) => (i === 0 ? lt : c.k === "qty" ? tot.qty : c.k === "net" ? tot.net : c.k === "cost" ? tot.cost : c.k === "profit" ? tot.profit : c.k === "margin" ? (tot.margin == null ? "" : `${tot.margin}%`) : ""))
      : [lt, ...dimHeads.slice(1).map(() => ""), ...activeM.map((m) => totalCell(m.k))];
    const ok = openPrint(buildReportHTML({ title, subtitle: `${period}${branch ? ` · ${bName(Number(branch))}` : ""}`, orgName: org.name, taxNumber: head?.taxNumber, logoUrl: head?.logoUrl, address: head?.address, dir: isRTL ? "rtl" : "ltr", lang: lang === "ar" ? "ar" : "en", cols: rc, rows, totals,
      note: tot.uncostedLines ? L(`${tot.uncostedLines} سطر بلا تكلفة مسجّلة (فواتير أقدم) ولا تدخل في التكلفة والربح.`, `${tot.uncostedLines} line(s) have no recorded cost (older invoices) and are excluded from cost/profit.`) : null }));
    if (!ok) alert(L("فعّل النوافذ المنبثقة للطباعة.", "Allow pop-ups to print."));
  };

  const th = "text-[10px] px-2 py-2.5 bg-slate-950 text-slate-300 whitespace-nowrap border-b border-slate-700 font-bold sticky top-0 z-10";
  const td = "px-2 py-2 text-xs border-b border-slate-800";
  const kpi = (l: string, v: string, c: string, id: string) => <div className="rounded-xl bg-slate-900 border border-slate-800 p-3"><div className="text-[11px] text-slate-300 font-bold">{l}</div><div className={`text-lg font-black tabular-nums ${c}`} dir="ltr" data-testid={id}>{v}</div></div>;
  const numCls = (k: string, v: string | number, neg: boolean): string => `${td} text-end font-mono ${neg ? "text-red-400" : k === "profit" ? "text-emerald-400" : k === "cost" || k === "avgCost" ? "text-amber-400" : "text-slate-200"} ${typeof v === "number" ? "" : "text-slate-400"}`;

  return (
    <div className={embedded ? "space-y-3" : "space-y-3 p-1"} dir={isRTL ? "rtl" : "ltr"} data-testid="sales-items">
      {!embedded && <div><h2 className="text-lg font-black text-white">{t("Sales by items", "تقرير المبيعات بالأصناف")}</h2><p className="text-[11px] text-slate-400">{t("Detailed or grouped by item, customer, group, brand, month… Choose the fields you need.", "تفصيلي أو مجمَّع حسب الصنف أو العميل أو المجموعة أو الماركة أو الشهر… اختر الحقول التي تريدها.")}</p></div>}
      <div className="flex flex-wrap items-end gap-2">
        <div><label className="block text-[10px] text-slate-400 mb-1">{t("From", "من")}</label><input type="date" className={INPUT} value={from} onChange={(e) => setFrom(e.target.value)} data-testid="si-from" /></div>
        <div><label className="block text-[10px] text-slate-400 mb-1">{t("To", "إلى")}</label><input type="date" className={INPUT} value={to} onChange={(e) => setTo(e.target.value)} data-testid="si-to" /></div>
        {branches && branches.length > 1 && <div><label className="block text-[10px] text-slate-400 mb-1">{t("Branch", "الفرع")}</label><select className={INPUT} value={branch} onChange={(e) => setBranch(e.target.value)} data-testid="si-branch"><option value="">{t("All branches", "كل الفروع")}</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>}
        <div><label className="block text-[10px] text-slate-400 mb-1">{t("Group by", "التجميع")}</label><select className={INPUT} value={view} onChange={(e) => changeView(e.target.value as View)} data-testid="si-group">{VIEWS.map((v) => <option key={v.k} value={v.k}>{L(v.ar, v.en)}</option>)}</select></div>
        <div className="flex-1 min-w-[160px]"><label className="block text-[10px] text-slate-400 mb-1">{t("Search", "بحث")}</label><input className={`${INPUT} w-full placeholder:text-slate-500`} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Invoice, item, code, customer, group…", "فاتورة، صنف، كود، عميل، مجموعة…")} data-testid="si-search" /></div>
        <label className="flex items-center gap-1.5 text-xs text-slate-200"><input type="checkbox" checked={withReturns} onChange={(e) => setWithReturns(e.target.checked)} data-testid="si-returns" />{t("Include returns", "تضمين المرتجعات")}</label>
        <button type="button" className={BTN} onClick={() => void load()} disabled={busy}><RefreshCw size={13} className={busy ? "animate-spin" : ""} /> {t("Refresh", "تحديث")}</button>
        <button type="button" className={BTN} onClick={exportX} disabled={!shown.length} data-testid="si-export"><Download size={13} /> Excel</button>
        <button type="button" className={BTN} onClick={printX} disabled={!shown.length} data-testid="si-print"><Printer size={13} /> {t("Print", "طباعة")}</button>
      </div>
      <details className="rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2" data-testid="si-cols"><summary className="text-xs font-bold text-slate-200 cursor-pointer">{t("Fields to show", "الحقول المعروضة")} ({view === "lines" ? active.length : activeM.length})</summary>
        <div className="flex flex-wrap gap-x-4 gap-y-2 mt-2">{view === "lines"
          ? DETAIL_COLS.map((c) => <label key={c.k} className="flex items-center gap-1.5 text-xs text-slate-200"><input type="checkbox" checked={cols.includes(c.k)} onChange={() => toggleCol(c.k)} data-testid={`si-col-${c.k}`} />{L(c.ar, c.en)}</label>)
          : MEASURES.map((c) => <label key={c.k} className="flex items-center gap-1.5 text-xs text-slate-200"><input type="checkbox" checked={mcols.includes(c.k)} onChange={() => toggleM(c.k)} data-testid={`si-mcol-${c.k}`} />{L(c.ar, c.en)}</label>)}</div></details>
      {err && <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs" data-testid="si-error">{err}</div>}
      {trunc && <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs">{t("Showing the first 50,000 invoices only; narrow the period.", "عُرض أول 50,000 فاتورة فقط؛ ضيّق الفترة.")}</div>}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {kpi(t("Net sales", "صافي المبيعات"), fmt(tot.net), "text-blue-400", "si-k-net")}{kpi(t("Qty", "الكمية"), qf(tot.qty), "text-slate-200", "si-k-qty")}
        {kpi(t("Cost of goods sold", "تكلفة البضاعة المباعة"), fmt(tot.cost), "text-amber-400", "si-k-cost")}{kpi(t("Profit", "الربح"), fmt(tot.profit), tot.profit < 0 ? "text-red-400" : "text-emerald-400", "si-k-profit")}
        {kpi(t("Margin", "الهامش"), tot.margin == null ? "—" : `${tot.margin}%`, "text-purple-400", "si-k-margin")}
      </div>
      {tot.uncostedLines > 0 && <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px]" data-testid="si-uncosted">{t(`${tot.uncostedLines} line(s) have no recorded cost (invoices issued before perpetual inventory). They are shown with “—” and excluded from cost and profit.`, `${tot.uncostedLines} سطر بلا تكلفة مسجّلة (فواتير صدرت قبل الجرد المستمر). تظهر بـ «—» ولا تدخل في التكلفة والربح.`)}</div>}
      <div className="overflow-auto rounded-xl border border-slate-800 max-h-[60vh]">
        {view === "lines" ? (
          <table className="w-full border-collapse" style={{ minWidth: 640 }}>
            <thead><tr>{active.map((c) => <th key={c.k} className={`${th} ${c.num ? "text-end" : "text-start"}`}>{L(c.ar, c.en)}</th>)}</tr></thead>
            <tbody>{shown.map((l, i) => <tr key={`${l.kind}${l.docId}-${i}`} className={`hover:bg-white/[0.03] ${l.kind === "return" ? "bg-red-500/5" : ""}`} data-testid="si-row">
              {active.map((c) => { const v = cell(l, c.k); const isN = typeof v === "number"; return <td key={c.k} className={`${td} ${c.k === "doc" ? "font-mono text-blue-400" : c.num ? "text-end font-mono text-slate-200" : "text-slate-200"} ${c.k === "profit" && l.profit != null && l.profit < 0 ? "!text-red-400" : ""}`} dir={c.num || c.k === "doc" || c.k === "date" || c.k === "code" ? "ltr" : undefined}>{isN ? (c.k === "qty" ? qf(v as number) : fmt(v as number)) : v}</td>; })}</tr>)}
              {!shown.length && <tr><td colSpan={active.length} className="p-8 text-center text-slate-400 text-sm" data-testid="si-empty">{busy ? "…" : t("No sales in this period.", "لا توجد مبيعات في هذه الفترة.")}</td></tr>}</tbody>
            {shown.length > 0 && <tfoot><tr className="bg-slate-950 font-bold">{active.map((c, i) => <td key={c.k} className="px-2 py-2.5 text-xs border-t border-slate-600 text-end font-mono text-white" dir="ltr">{i === 0 ? <span className="block text-start">{t("Totals", "الإجماليات")}</span> : c.k === "qty" ? qf(tot.qty) : c.k === "net" ? fmt(tot.net) : c.k === "cost" ? fmt(tot.cost) : c.k === "profit" ? fmt(tot.profit) : c.k === "margin" ? (tot.margin == null ? "" : `${tot.margin}%`) : ""}</td>)}</tr></tfoot>}
          </table>
        ) : (
          <table className="w-full border-collapse" style={{ minWidth: 640 }} data-testid="si-grouped">
            <thead><tr>{dimHeads.map((h, i) => <th key={`d${i}`} className={`${th} text-start`}>{h}</th>)}{activeM.map((m) => <th key={m.k} className={`${th} ${m.num ? "text-end" : "text-start"}`}>{L(m.ar, m.en)}</th>)}</tr></thead>
            <tbody>{groups.map((g) => <tr key={g.key} className="hover:bg-white/[0.03]" data-testid="si-item-row">
              {dimCells(g).map((c, i) => <td key={`d${i}`} className={`${td} ${view === "item" && i === 0 || (view.endsWith("_item") && i === 1) ? "font-mono text-slate-300" : "text-slate-100"}`} dir={view === "day" || view === "month" ? "ltr" : undefined}>{c}{i === dimCells(g).length - 1 && g.uncosted && <span className="text-[9px] text-amber-400 ms-1">{t("partial cost", "تكلفة جزئية")}</span>}</td>)}
              {activeM.map((m) => { const v = mCell(g, m.k); return <td key={m.k} className={m.num ? numCls(m.k, v, (m.k === "profit" && g.profit < 0) || (m.k === "net" && g.net < 0)) : `${td} font-mono text-slate-300`} dir="ltr">{typeof v === "number" ? (m.k === "qty" || m.k === "docs" ? qf(v) : fmt(v)) : v}</td>; })}</tr>)}
              {!groups.length && <tr><td colSpan={dimHeads.length + activeM.length} className="p-8 text-center text-slate-400 text-sm" data-testid="si-empty">{busy ? "…" : t("No sales in this period.", "لا توجد مبيعات في هذه الفترة.")}</td></tr>}</tbody>
            {groups.length > 0 && <tfoot><tr className="bg-slate-950 font-bold"><td className="px-2 py-2.5 text-xs border-t border-slate-600 text-slate-100" colSpan={Math.max(1, dimHeads.length)}>{t("Totals", "الإجماليات")}</td>{activeM.map((m) => { const v = totalCell(m.k); return <td key={m.k} className="px-2 py-2.5 text-xs border-t border-slate-600 text-end font-mono text-white" dir="ltr">{typeof v === "number" ? (m.k === "qty" ? qf(v) : fmt(v)) : v}</td>; })}</tr></tfoot>}
          </table>
        )}
      </div>
    </div>
  );
}
