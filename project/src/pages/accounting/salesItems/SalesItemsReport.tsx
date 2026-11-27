// =============================================================
// src/pages/accounting/salesItems/SalesItemsReport.tsx
// تقرير «المبيعات بالأصناف»: سطر لكل بند فاتورة (أو ملخص بالصنف) مع أعمدة قابلة للاختيار —
// رقم الفاتورة، التاريخ، العميل، الفرع، الكود، الصنف، الكمية، سعر الوحدة، الخصم، الصافي، تكلفة الوحدة، التكلفة، الربح، الهامش.
// يُستخدم كصفحة (تبويب في الحسابات) وكتفاصيل داخل نافذة «تكلفة المبيعات».
// =============================================================
import { useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Download, Printer, RefreshCw } from "lucide-react";
import { useLang } from "../../../context/LanguageContext";
import { buildReportHTML, openPrint, type ReportCol } from "../shared/printReport";
import { fetchSalesData } from "./salesItemsApi";
import { buildLines, filterLines, summarizeByItem, totalsOf, type SaleLine } from "./salesItemsLogic";

type Branch = { id: number; name: string };
type Props = {
  org: { id: number; name: string }; branches?: Branch[]; head?: { taxNumber?: string | null; logoUrl?: string | null; address?: string | null };
  from?: string; to?: string; branchId?: number | null; embedded?: boolean;
};
const fmt = (n: number): string => (Math.round(n * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qf = (n: number): string => (Math.round(n * 1000) / 1000).toLocaleString("en-US", { maximumFractionDigits: 3 });
const isoDay = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const INPUT = "bg-slate-950 border border-slate-700 rounded-lg text-white px-2.5 py-2 text-xs outline-none focus:border-blue-500";
const BTN = "inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 hover:text-white font-bold text-xs transition-colors disabled:opacity-50";

type ColKey = "doc" | "date" | "customer" | "branch" | "code" | "name" | "qty" | "price" | "disc" | "net" | "ucost" | "cost" | "profit" | "margin";
const DETAIL_COLS: { k: ColKey; ar: string; en: string; num?: boolean }[] = [
  { k: "doc", ar: "رقم الفاتورة", en: "Invoice no." }, { k: "date", ar: "التاريخ", en: "Date" }, { k: "customer", ar: "العميل", en: "Customer" }, { k: "branch", ar: "الفرع", en: "Branch" },
  { k: "code", ar: "كود الصنف", en: "Item code" }, { k: "name", ar: "الصنف", en: "Item" }, { k: "qty", ar: "الكمية", en: "Qty", num: true }, { k: "price", ar: "سعر الوحدة", en: "Unit price", num: true },
  { k: "disc", ar: "الخصم", en: "Discount", num: true }, { k: "net", ar: "صافي المبيعات", en: "Net sales", num: true }, { k: "ucost", ar: "تكلفة الوحدة", en: "Unit cost", num: true },
  { k: "cost", ar: "إجمالي التكلفة", en: "Total cost", num: true }, { k: "profit", ar: "الربح", en: "Profit", num: true }, { k: "margin", ar: "الهامش %", en: "Margin %", num: true },
];
const DEFAULT_COLS: ColKey[] = ["doc", "date", "customer", "code", "name", "qty", "price", "net", "ucost", "cost", "profit", "margin"];
const LS = "mihwar.salesItems.cols";
function loadCols(): ColKey[] { try { const v = JSON.parse(localStorage.getItem(LS) || "null") as unknown; if (Array.isArray(v)) { const ok = v.filter((k): k is ColKey => DETAIL_COLS.some((c) => c.k === k)); if (ok.length) return ok; } } catch { /* storage unavailable */ } return DEFAULT_COLS; }

export default function SalesItemsReport({ org, branches, head, from: pFrom, to: pTo, branchId: pBranch, embedded }: Props) {
  const { t, lang, isRTL } = useLang();
  const today = isoDay(new Date());
  const [from, setFrom] = useState(pFrom || `${today.slice(0, 4)}-01-01`); const [to, setTo] = useState(pTo || today);
  const [branch, setBranch] = useState<string>(pBranch != null ? String(pBranch) : "");
  const [view, setView] = useState<"lines" | "items">("lines"); const [withReturns, setWithReturns] = useState(true);
  const [q, setQ] = useState(""); const [cols, setCols] = useState<ColKey[]>(loadCols);
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

  const lines = useMemo<SaleLine[]>(() => (data ? buildLines(data.invoices, data.returns, data.originals, data.moves, withReturns) : []), [data, withReturns]);
  const shown = useMemo(() => filterLines(lines, q), [lines, q]);
  const tot = useMemo(() => totalsOf(shown), [shown]);
  const items = useMemo(() => summarizeByItem(shown), [shown]);
  const toggleCol = (k: ColKey): void => setCols((c) => { const n = c.includes(k) ? c.filter((x) => x !== k) : DETAIL_COLS.map((d) => d.k).filter((x) => x === k || c.includes(x)); try { localStorage.setItem(LS, JSON.stringify(n)); } catch { /* storage unavailable */ } return n; });
  const active = useMemo(() => DETAIL_COLS.filter((c) => cols.includes(c.k)), [cols]);

  const cell = (l: SaleLine, k: ColKey): string | number => {
    switch (k) {
      case "doc": return l.docNo; case "date": return l.date; case "customer": return l.customer || "—"; case "branch": return bName(l.branchId) || "—";
      case "code": return l.code ?? "—"; case "name": return l.name || "—"; case "qty": return l.qty; case "price": return l.unitPrice; case "disc": return l.discount; case "net": return l.net;
      case "ucost": return l.unitCost ?? "—"; case "cost": return l.cost ?? "—"; case "profit": return l.profit ?? "—"; case "margin": return l.margin == null ? "—" : `${l.margin}%`;
    }
  };
  const itemRows = items.map((s) => [s.code ?? "—", s.name, s.qty, s.net, s.cost, s.profit, s.margin == null ? "—" : `${s.margin}%`, s.docs]);
  const itemHeads = [t("Item code", "كود الصنف"), t("Item", "الصنف"), t("Qty", "الكمية"), t("Net sales", "صافي المبيعات"), t("Total cost", "إجمالي التكلفة"), t("Profit", "الربح"), t("Margin %", "الهامش %"), t("Documents", "عدد المستندات")];
  const lineHeads = active.map((c) => (lang === "ar" ? c.ar : c.en));
  const lineRows = (): (string | number)[][] => shown.map((l) => active.map((c) => cell(l, c.k)));
  const period = `${from} → ${to}`;

  const exportX = (): void => {
    const heads = view === "lines" ? lineHeads : itemHeads; const rows = view === "lines" ? lineRows() : itemRows;
    const ws = XLSX.utils.aoa_to_sheet([[t("Sales by items", "المبيعات بالأصناف"), period], [], heads, ...rows]);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Sales"); XLSX.writeFile(wb, `sales_by_items_${from}_${to}.xlsx`);
  };
  const printX = (): void => {
    const heads = view === "lines" ? lineHeads : itemHeads; const rows = view === "lines" ? lineRows() : itemRows;
    const rc: ReportCol[] = view === "lines" ? active.map((c) => ({ label: lang === "ar" ? c.ar : c.en, mono: c.k === "doc" || c.k === "date" || c.k === "code", align: c.num ? "end" : "start" })) : heads.map((h, i) => ({ label: h, align: i >= 2 ? "end" : "start" }));
    const totals = view === "lines" ? active.map((c, i) => (i === 0 ? t("Totals", "الإجماليات") : c.k === "qty" ? tot.qty : c.k === "net" ? tot.net : c.k === "cost" ? tot.cost : c.k === "profit" ? tot.profit : c.k === "margin" ? (tot.margin == null ? "" : `${tot.margin}%`) : ""))
      : [t("Totals", "الإجماليات"), "", tot.qty, tot.net, tot.cost, tot.profit, tot.margin == null ? "" : `${tot.margin}%`, ""];
    const ok = openPrint(buildReportHTML({ title: t("Sales by items", "المبيعات بالأصناف"), subtitle: `${period}${branch ? ` · ${bName(Number(branch))}` : ""}`, orgName: org.name, taxNumber: head?.taxNumber, logoUrl: head?.logoUrl, address: head?.address, dir: isRTL ? "rtl" : "ltr", lang: lang === "ar" ? "ar" : "en", cols: rc, rows, totals,
      note: tot.uncostedLines ? t(`${tot.uncostedLines} line(s) have no recorded cost (older invoices) and are excluded from cost/profit.`, `${tot.uncostedLines} سطر بلا تكلفة مسجّلة (فواتير أقدم) ولا تدخل في التكلفة والربح.`) : null }));
    if (!ok) alert(t("Allow pop-ups to print.", "فعّل النوافذ المنبثقة للطباعة."));
  };

  const th = "text-[10px] px-2 py-2.5 bg-slate-950 text-slate-400 whitespace-nowrap border-b border-slate-700 font-bold sticky top-0 z-10";
  const td = "px-2 py-2 text-xs border-b border-slate-800";
  const kpi = (l: string, v: string, c: string, id: string) => <div className="rounded-xl bg-slate-900 border border-slate-800 p-3"><div className="text-[11px] text-slate-400 font-bold">{l}</div><div className={`text-lg font-black tabular-nums ${c}`} dir="ltr" data-testid={id}>{v}</div></div>;

  return (
    <div className={embedded ? "space-y-3" : "space-y-3 p-1"} dir={isRTL ? "rtl" : "ltr"} data-testid="sales-items">
      {!embedded && <div><h2 className="text-lg font-black text-white">{t("Sales by items", "تقرير المبيعات بالأصناف")}</h2><p className="text-[11px] text-slate-500">{t("Every sold item with invoice number, quantity, price, cost and profit. Choose the columns you need.", "كل صنف مباع برقم الفاتورة والكمية والسعر والتكلفة والربح. اختر الأعمدة التي تريدها.")}</p></div>}
      <div className="flex flex-wrap items-end gap-2">
        <div><label className="block text-[10px] text-slate-500 mb-1">{t("From", "من")}</label><input type="date" className={INPUT} value={from} onChange={(e) => setFrom(e.target.value)} data-testid="si-from" /></div>
        <div><label className="block text-[10px] text-slate-500 mb-1">{t("To", "إلى")}</label><input type="date" className={INPUT} value={to} onChange={(e) => setTo(e.target.value)} data-testid="si-to" /></div>
        {branches && branches.length > 1 && <div><label className="block text-[10px] text-slate-500 mb-1">{t("Branch", "الفرع")}</label><select className={INPUT} value={branch} onChange={(e) => setBranch(e.target.value)} data-testid="si-branch"><option value="">{t("All branches", "كل الفروع")}</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>}
        <div className="flex-1 min-w-[160px]"><label className="block text-[10px] text-slate-500 mb-1">{t("Search", "بحث")}</label><input className={`${INPUT} w-full`} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Invoice, item, code, customer…", "فاتورة، صنف، كود، عميل…")} data-testid="si-search" /></div>
        <div className="flex rounded-xl overflow-hidden border border-slate-700">{(["lines", "items"] as const).map((v) => <button key={v} type="button" onClick={() => setView(v)} data-testid={`si-view-${v}`} className={`px-3 py-2 text-xs font-bold ${view === v ? "bg-blue-600 text-white" : "bg-slate-900 text-slate-300"}`}>{v === "lines" ? t("Detailed", "تفصيلي") : t("By item", "ملخص بالصنف")}</button>)}</div>
        <label className="flex items-center gap-1.5 text-xs text-slate-300"><input type="checkbox" checked={withReturns} onChange={(e) => setWithReturns(e.target.checked)} data-testid="si-returns" />{t("Include returns", "تضمين المرتجعات")}</label>
        <button type="button" className={BTN} onClick={() => void load()} disabled={busy}><RefreshCw size={13} className={busy ? "animate-spin" : ""} /> {t("Refresh", "تحديث")}</button>
        <button type="button" className={BTN} onClick={exportX} disabled={!shown.length} data-testid="si-export"><Download size={13} /> Excel</button>
        <button type="button" className={BTN} onClick={printX} disabled={!shown.length} data-testid="si-print"><Printer size={13} /> {t("Print", "طباعة")}</button>
      </div>
      {view === "lines" && <details className="rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2" data-testid="si-cols"><summary className="text-xs font-bold text-slate-300 cursor-pointer">{t("Columns to show", "الأعمدة المعروضة")} ({active.length})</summary>
        <div className="flex flex-wrap gap-x-4 gap-y-2 mt-2">{DETAIL_COLS.map((c) => <label key={c.k} className="flex items-center gap-1.5 text-xs text-slate-300"><input type="checkbox" checked={cols.includes(c.k)} onChange={() => toggleCol(c.k)} data-testid={`si-col-${c.k}`} />{lang === "ar" ? c.ar : c.en}</label>)}</div></details>}
      {err && <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs" data-testid="si-error">{err}</div>}
      {trunc && <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs">{t("Showing the first 50,000 invoices only; narrow the period.", "عُرض أول 50,000 فاتورة فقط؛ ضيّق الفترة.")}</div>}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {kpi(t("Net sales", "صافي المبيعات"), fmt(tot.net), "text-blue-400", "si-k-net")}{kpi(t("Qty", "الكمية"), qf(tot.qty), "text-slate-100", "si-k-qty")}
        {kpi(t("Cost of goods sold", "تكلفة البضاعة المباعة"), fmt(tot.cost), "text-amber-400", "si-k-cost")}{kpi(t("Profit", "الربح"), fmt(tot.profit), tot.profit < 0 ? "text-red-400" : "text-emerald-400", "si-k-profit")}
        {kpi(t("Margin", "الهامش"), tot.margin == null ? "—" : `${tot.margin}%`, "text-purple-400", "si-k-margin")}
      </div>
      {tot.uncostedLines > 0 && <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px]" data-testid="si-uncosted">{t(`${tot.uncostedLines} line(s) have no recorded cost (invoices issued before perpetual inventory). They are shown with “—” and excluded from cost and profit.`, `${tot.uncostedLines} سطر بلا تكلفة مسجّلة (فواتير قبل تفعيل الجرد المستمر). تظهر بـ «—» ولا تدخل في التكلفة والربح.`)}</div>}
      <div className="overflow-auto rounded-xl border border-slate-800 max-h-[60vh]">
        {view === "lines" ? (
          <table className="w-full border-collapse" style={{ minWidth: 640 }}>
            <thead><tr>{active.map((c) => <th key={c.k} className={`${th} ${c.num ? "text-end" : "text-start"}`}>{lang === "ar" ? c.ar : c.en}</th>)}</tr></thead>
            <tbody>{shown.map((l, i) => <tr key={`${l.kind}${l.docId}-${i}`} className={`hover:bg-white/[0.03] ${l.kind === "return" ? "bg-red-500/5" : ""}`} data-testid="si-row">
              {active.map((c) => { const v = cell(l, c.k); const isN = typeof v === "number"; return <td key={c.k} className={`${td} ${c.k === "doc" ? "font-mono text-blue-300" : c.num ? "text-end font-mono text-slate-200" : "text-slate-300"} ${c.k === "profit" && l.profit != null && l.profit < 0 ? "text-red-400" : ""}`} dir={c.num || c.k === "doc" || c.k === "date" ? "ltr" : undefined}>{isN ? (c.k === "qty" ? qf(v as number) : fmt(v as number)) : v}</td>; })}</tr>)}
              {!shown.length && <tr><td colSpan={active.length} className="p-8 text-center text-slate-500 text-sm" data-testid="si-empty">{busy ? "…" : t("No sales in this period.", "لا توجد مبيعات في هذه الفترة.")}</td></tr>}</tbody>
            {shown.length > 0 && <tfoot><tr className="bg-slate-950 font-bold">{active.map((c, i) => <td key={c.k} className="px-2 py-2.5 text-xs border-t border-slate-600 text-end font-mono text-white" dir="ltr">{i === 0 ? <span className="block text-start">{t("Totals", "الإجماليات")}</span> : c.k === "qty" ? qf(tot.qty) : c.k === "net" ? fmt(tot.net) : c.k === "cost" ? fmt(tot.cost) : c.k === "profit" ? fmt(tot.profit) : c.k === "margin" ? (tot.margin == null ? "" : `${tot.margin}%`) : ""}</td>)}</tr></tfoot>}
          </table>
        ) : (
          <table className="w-full border-collapse" style={{ minWidth: 640 }}>
            <thead><tr>{itemHeads.map((h, i) => <th key={i} className={`${th} ${i >= 2 ? "text-end" : "text-start"}`}>{h}</th>)}</tr></thead>
            <tbody>{items.map((s) => <tr key={s.key} className="hover:bg-white/[0.03]" data-testid="si-item-row"><td className={`${td} font-mono text-slate-400`} dir="ltr">{s.code ?? "—"}</td><td className={`${td} text-slate-200`}>{s.name || "—"}{s.uncosted && <span className="text-[9px] text-amber-400 ms-1">{t("partial cost", "تكلفة جزئية")}</span>}</td>
              <td className={`${td} text-end font-mono`} dir="ltr">{qf(s.qty)}</td><td className={`${td} text-end font-mono`} dir="ltr">{fmt(s.net)}</td><td className={`${td} text-end font-mono text-amber-300`} dir="ltr">{fmt(s.cost)}</td>
              <td className={`${td} text-end font-mono ${s.profit < 0 ? "text-red-400" : "text-emerald-300"}`} dir="ltr">{fmt(s.profit)}</td><td className={`${td} text-end font-mono`} dir="ltr">{s.margin == null ? "—" : `${s.margin}%`}</td><td className={`${td} text-end font-mono`} dir="ltr">{s.docs}</td></tr>)}
              {!items.length && <tr><td colSpan={8} className="p-8 text-center text-slate-500 text-sm">{busy ? "…" : t("No sales in this period.", "لا توجد مبيعات في هذه الفترة.")}</td></tr>}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}
