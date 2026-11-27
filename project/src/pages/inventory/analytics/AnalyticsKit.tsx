// =============================================================
// src/pages/inventory/analytics/AnalyticsKit.tsx
// مكوّنات مشتركة لمركز تقارير المخزون: منسّق أرقام (عربي/إنجليزي)، جدول بيانات (فرز/ترقيم/إخفاء أعمدة/تحديد/تصدير/طباعة)،
// اختيار متعدد، رسوم SVG تتبع الثيم (currentColor + ألوان وسيطة تقرأ في الفاتح والداكن).
// =============================================================
import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { ArrowDown, ArrowUp, ChevronDown, ChevronLeft, ChevronRight, Columns3, Download, Printer, Search, X } from "lucide-react";
import { buildReportHTML, openPrint } from "../../accounting/shared/printReport";

// ── منسّق الأرقام ───────────────────────────────────────────
export type Digits = "en" | "ar";
export type Fmt = { int: (n: number) => string; qty: (n: number) => string; money: (n: number) => string; pct: (n: number) => string; date: (s: string | null | undefined) => string; digits: Digits };
export function makeFmt(d: Digits): Fmt {
  const loc = d === "ar" ? "ar-SA-u-nu-arab" : "en-US";
  const nf = (min: number, max: number) => new Intl.NumberFormat(loc, { minimumFractionDigits: min, maximumFractionDigits: max });
  const i = nf(0, 0), q = nf(0, 3), m = nf(2, 2), p = nf(0, 1);
  const toAr = (s: string): string => (d === "ar" ? s.replace(/[0-9]/g, (c) => "٠١٢٣٤٥٦٧٨٩"[Number(c)]) : s);
  return {
    digits: d, int: (n) => i.format(Math.round(Number(n) || 0)), qty: (n) => q.format(Number(n) || 0), money: (n) => m.format(Number(n) || 0), pct: (n) => `${p.format(Number(n) || 0)}%`,
    date: (s) => (s ? toAr(s.replace(/-/g, "/")) : "—"),
  };
}

// ── أزرار/حقول موحّدة (تتبع تجاوزات الثيم الفاتح الموجودة) ──
export const CARD = "bg-slate-900 border border-slate-800 rounded-2xl";
export const INPUT = "w-full bg-slate-950 border border-slate-700 rounded-xl text-white px-3 py-2 text-xs outline-none focus:border-blue-500 transition-colors [color-scheme:light_dark]";
export const LABEL = "text-[11px] text-slate-400 font-bold mb-1 block";
export const BTN_SOFT = "inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 hover:text-white font-bold text-xs transition-colors disabled:opacity-50";
export const BTN_BLUE = "inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-[#0a58ca] border border-[#0a58ca] text-[#fff] hover:bg-[#084298] font-bold text-xs transition-colors disabled:opacity-50";

// ── اختيار متعدد ────────────────────────────────────────────
export type Opt = { value: string; label: string };
export function MultiSelect({ label, allLabel, options, selected, onChange, testId }: { label: string; allLabel: string; options: Opt[]; selected: Set<string> | null; onChange: (s: Set<string> | null) => void; testId?: string }) {
  const [open, setOpen] = useState(false); const [q, setQ] = useState(""); const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }; document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, []);
  const shown = options.filter((o) => o.label.toLowerCase().includes(q.trim().toLowerCase()));
  const text = !selected ? allLabel : selected.size === 1 ? options.find((o) => o.value === [...selected][0])?.label || "…" : `${selected.size} / ${options.length}`;
  const toggle = (v: string) => { const s = new Set(selected ?? options.map((o) => o.value)); if (s.has(v)) s.delete(v); else s.add(v); onChange(s.size === 0 || s.size === options.length ? null : s); };
  return (
    <div className="relative min-w-[150px] flex-1" ref={ref}>
      <span className={LABEL}>{label}</span>
      <button type="button" onClick={() => setOpen((o) => !o)} data-testid={testId} aria-haspopup="listbox" aria-expanded={open} className={`${INPUT} flex items-center justify-between gap-2 text-start`}>
        <span className="truncate">{text}</span><ChevronDown size={14} className="shrink-0 text-slate-400" />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full min-w-[220px] max-h-72 overflow-auto bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-2" role="listbox">
          <div className="relative mb-2"><Search size={13} className="absolute top-1/2 -translate-y-1/2 start-2 text-slate-500" /><input className={`${INPUT} ps-7`} value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <button type="button" onClick={() => { onChange(null); setOpen(false); }} className={`w-full text-start px-2 py-1.5 rounded-lg text-xs font-bold ${!selected ? "bg-blue-500/15 text-blue-300" : "text-slate-300 hover:bg-slate-800"}`}>{allLabel}</button>
          {shown.map((o) => (
            <label key={o.value} className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-slate-200 hover:bg-slate-800 cursor-pointer">
              <input type="checkbox" checked={!selected || selected.has(o.value)} onChange={() => toggle(o.value)} className="accent-blue-500" /><span className="truncate">{o.label}</span>
            </label>
          ))}
          {shown.length === 0 && <div className="px-2 py-3 text-xs text-slate-500">—</div>}
        </div>
      )}
    </div>
  );
}

// ── جدول بيانات ─────────────────────────────────────────────
export type GCol<T> = { id: string; label: string; get: (r: T) => string | number | null; kind?: "text" | "int" | "qty" | "money" | "pct" | "date"; render?: (r: T) => ReactNode; hidden?: boolean; w?: string };
export type ReportSpec = { title: string; cols: { label: string; num: boolean }[]; rows: (string | number | null)[][]; textRows: string[][] };
type GridLabels = { columns: string; excel: string; print: string; page: string; of: string; rows: string; selected: string; empty: string; excelSel: string; clear: string };

export function DataGrid<T>({ rows, cols, rowKey, fmt, labels, title, fileName, orgName, orgMeta, dir, lang, selectable = false, onRow, pageSizes = [25, 50, 100], defaultSort, onReport, testId, extraTools, totals }: {
  rows: T[]; cols: GCol<T>[]; rowKey: (r: T) => string; fmt: Fmt; labels: GridLabels; title: string; fileName: string; orgName: string; orgMeta?: { taxNumber?: string | null; logoUrl?: string | null; address?: string | null };
  dir: "rtl" | "ltr"; lang: "ar" | "en"; selectable?: boolean; onRow?: (r: T) => void; pageSizes?: number[]; defaultSort?: { id: string; desc: boolean }; onReport?: (s: ReportSpec | null) => void; testId?: string; extraTools?: ReactNode; totals?: (string | number | null)[] | null;
}) {
  const [sort, setSort] = useState<{ id: string; desc: boolean } | null>(defaultSort ?? null);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set(cols.filter((c) => c.hidden).map((c) => c.id)));
  const [page, setPage] = useState(0); const [size, setSize] = useState(pageSizes[0]); const [menu, setMenu] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const vis = useMemo(() => cols.filter((c) => !hidden.has(c.id)), [cols, hidden]);
  const sorted = useMemo(() => {
    if (!sort) return rows; const c = cols.find((x) => x.id === sort.id); if (!c) return rows; const sg = sort.desc ? -1 : 1;
    return [...rows].sort((a, b) => { const x = c.get(a), y = c.get(b); if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1; return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), lang)) * sg; });
  }, [rows, sort, cols, lang]);
  useEffect(() => { setPage(0); }, [rows.length, size, sort]);
  const pages = Math.max(1, Math.ceil(sorted.length / size)); const pg = Math.min(page, pages - 1);
  const slice = sorted.slice(pg * size, pg * size + size);
  const text = (c: GCol<T>, r: T): string => { const v = c.get(r); if (v == null || v === "") return "—"; if (typeof v === "string") return c.kind === "date" ? fmt.date(v) : v; return c.kind === "money" ? fmt.money(v) : c.kind === "qty" ? fmt.qty(v) : c.kind === "pct" ? fmt.pct(v) : fmt.int(v); };
  const exportRows = sel.size > 0 ? sorted.filter((r) => sel.has(rowKey(r))) : sorted;
  const spec = useMemo<ReportSpec>(() => ({ title, cols: vis.map((c) => ({ label: c.label, num: c.kind === "int" || c.kind === "qty" || c.kind === "money" || c.kind === "pct" })), rows: exportRows.map((r) => vis.map((c) => c.get(r))), textRows: exportRows.map((r) => vis.map((c) => text(c, r))) }), // eslint-disable-line react-hooks/exhaustive-deps
  [exportRows, vis, title, fmt]);
  useEffect(() => { onReport?.(spec); return () => onReport?.(null); }, [spec]); // eslint-disable-line react-hooks/exhaustive-deps
  const doExcel = () => exportXlsx(fileName, [{ name: title, spec }], dir === "rtl");
  const doPrint = () => printSpec(spec, { orgName, ...orgMeta, dir, lang, totals: totals ?? null });
  const allOnPage = slice.length > 0 && slice.every((r) => sel.has(rowKey(r)));
  return (
    <div data-testid={testId}>
      <div className="flex items-center gap-2 flex-wrap px-3 py-2 border-b border-slate-800">
        <span className="text-[11px] text-slate-400 font-bold">{fmt.int(sorted.length)} {labels.rows}{sel.size > 0 && <> · <span className="text-blue-400">{fmt.int(sel.size)} {labels.selected}</span> <button type="button" className="text-slate-400 underline ms-1" onClick={() => setSel(new Set())}>{labels.clear}</button></>}</span>
        <span className="flex-1" />
        {extraTools}
        <div className="relative">
          <button type="button" className={BTN_SOFT} onClick={() => setMenu((m) => !m)} aria-expanded={menu}><Columns3 size={14} /> {labels.columns}</button>
          {menu && (
            <div className="absolute z-30 end-0 mt-1 w-52 bg-slate-900 border border-slate-700 rounded-xl p-2 shadow-2xl max-h-72 overflow-auto">
              {cols.map((c) => <label key={c.id} className="flex items-center gap-2 px-2 py-1.5 text-xs text-slate-200 hover:bg-slate-800 rounded-lg cursor-pointer"><input type="checkbox" className="accent-blue-500" checked={!hidden.has(c.id)} onChange={() => setHidden((h) => { const n = new Set(h); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; })} />{c.label}</label>)}
            </div>
          )}
        </div>
        <button type="button" className={BTN_SOFT} onClick={doExcel} disabled={!sorted.length} data-testid="grid-excel"><Download size={14} /> {sel.size > 0 ? labels.excelSel : labels.excel}</button>
        <button type="button" className={BTN_SOFT} onClick={doPrint} disabled={!sorted.length} data-testid="grid-print"><Printer size={14} /> {labels.print}</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-xs">
          <thead className="bg-slate-950/60"><tr className="border-b border-slate-800 text-[11px] text-slate-400">
            {selectable && <th className="w-9 px-2 py-2.5"><input type="checkbox" aria-label="select page" className="accent-blue-500" checked={allOnPage} onChange={() => setSel((s) => { const n = new Set(s); slice.forEach((r) => { if (allOnPage) n.delete(rowKey(r)); else n.add(rowKey(r)); }); return n; })} /></th>}
            {vis.map((c) => {
              const num = c.kind === "int" || c.kind === "qty" || c.kind === "money" || c.kind === "pct"; const on = sort?.id === c.id;
              return <th key={c.id} className={`px-3 py-2.5 font-bold whitespace-nowrap ${num ? "text-end" : "text-start"}`} aria-sort={on ? (sort!.desc ? "descending" : "ascending") : "none"}>
                <button type="button" className="inline-flex items-center gap-1 hover:text-white" onClick={() => setSort((s) => (s?.id === c.id ? { id: c.id, desc: !s.desc } : { id: c.id, desc: num }))}>{c.label}{on && (sort!.desc ? <ArrowDown size={11} /> : <ArrowUp size={11} />)}</button>
              </th>;
            })}
          </tr></thead>
          <tbody className="divide-y divide-slate-800/60">
            {slice.map((r) => {
              const k = rowKey(r);
              return <tr key={k} onClick={() => onRow?.(r)} className={`${onRow ? "cursor-pointer" : ""} hover:bg-slate-800/40 transition-colors`}>
                {selectable && <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}><input type="checkbox" className="accent-blue-500" aria-label="select" checked={sel.has(k)} onChange={() => setSel((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; })} /></td>}
                {vis.map((c) => {
                  const num = c.kind === "int" || c.kind === "qty" || c.kind === "money" || c.kind === "pct";
                  return <td key={c.id} className={`px-3 py-2 text-slate-200 ${num ? "text-end tabular-nums [direction:ltr] font-semibold" : "text-start"}`}>{c.render ? c.render(r) : text(c, r)}</td>;
                })}
              </tr>;
            })}
            {slice.length === 0 && <tr><td colSpan={vis.length + (selectable ? 1 : 0)} className="p-10 text-center text-slate-500">{labels.empty}</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between gap-2 flex-wrap px-3 py-2 border-t border-slate-800 text-[11px] text-slate-400">
        <div className="flex items-center gap-2">
          <select aria-label="page size" className={`${INPUT} !w-auto !py-1`} value={size} onChange={(e) => setSize(Number(e.target.value))}>{pageSizes.map((n) => <option key={n} value={n}>{fmt.int(n)}</option>)}</select>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className={BTN_SOFT} disabled={pg <= 0} onClick={() => setPage(pg - 1)} aria-label="prev">{dir === "rtl" ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}</button>
          <span className="tabular-nums">{labels.page} {fmt.int(pg + 1)} {labels.of} {fmt.int(pages)}</span>
          <button type="button" className={BTN_SOFT} disabled={pg >= pages - 1} onClick={() => setPage(pg + 1)} aria-label="next">{dir === "rtl" ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}</button>
        </div>
      </div>
    </div>
  );
}

// ── التصدير والطباعة ────────────────────────────────────────
export function exportXlsx(file: string, sheets: { name: string; spec: ReportSpec }[], rtl: boolean): void {
  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: rtl }] }; // اتجاه الورقة: يمين-يسار عند العربية
  for (const s of sheets) {
    const aoa: (string | number | null)[][] = [s.spec.cols.map((c) => c.label), ...s.spec.rows];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = s.spec.cols.map((c, i) => ({ wch: Math.min(48, Math.max(10, c.label.length + 4, ...s.spec.rows.slice(0, 200).map((r) => String(r[i] ?? "").length + 2))) }));
    XLSX.utils.book_append_sheet(wb, ws, s.name.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Sheet");
  }
  XLSX.writeFile(wb, `${file}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
export function printSpec(spec: ReportSpec, o: { orgName: string; taxNumber?: string | null; logoUrl?: string | null; address?: string | null; dir: "rtl" | "ltr"; lang: "ar" | "en"; totals: (string | number | null)[] | null; note?: string }): boolean {
  const html = buildReportHTML({
    title: spec.title, subtitle: new Date().toISOString().slice(0, 10), orgName: o.orgName, taxNumber: o.taxNumber, logoUrl: o.logoUrl, address: o.address, dir: o.dir, lang: o.lang,
    cols: spec.cols.map((c) => ({ label: c.label, ltr: c.num, align: c.num ? ("end" as const) : ("start" as const) })), rows: spec.textRows, totals: o.totals as (string | number | null)[] | null, note: o.note ?? null,
  });
  return openPrint(html);
}

// ── رسوم ────────────────────────────────────────────────────
export const PALETTE = ["#3b82f6", "#10b981", "#f59e0b", "#a855f7", "#ef4444", "#06b6d4", "#ec4899", "#84cc16"];
export function DonutChart({ data, center, size = 170, empty }: { data: { label: string; value: number; color?: string; text?: string }[]; center?: ReactNode; size?: number; empty: string }) {
  const clean = data.filter((d) => d.value > 0); const total = clean.reduce((s, d) => s + d.value, 0);
  if (!total) return <div className="p-8 text-center text-xs text-slate-500">{empty}</div>;
  const R = size / 2 - 14, C = 2 * Math.PI * R; let off = 0;
  return (
    <div className="flex items-center gap-4 flex-wrap justify-center">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg viewBox={`0 0 ${size} ${size}`} style={{ width: size, height: size, direction: "ltr" }} role="img">
          <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
            <circle cx={size / 2} cy={size / 2} r={R} fill="none" stroke="currentColor" className="text-slate-800" strokeWidth="16" />
            {clean.map((d, i) => { const len = (d.value / total) * C; const el = <circle key={i} cx={size / 2} cy={size / 2} r={R} fill="none" stroke={d.color || PALETTE[i % PALETTE.length]} strokeWidth="16" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-off} />; off += len; return el; })}
          </g>
        </svg>
        {center && <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">{center}</div>}
      </div>
      <ul className="space-y-1.5 text-xs min-w-[140px]">
        {clean.map((d, i) => <li key={i} className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color || PALETTE[i % PALETTE.length] }} /><span className="text-slate-300 truncate max-w-[130px]">{d.label}</span><span className="text-slate-100 font-bold tabular-nums [direction:ltr] ms-auto">{d.text ?? `${Math.round((d.value / total) * 100)}%`}</span></li>)}
      </ul>
    </div>
  );
}
export function HBars({ data, fmt, color = "#3b82f6", empty }: { data: { label: string; value: number; color?: string; right?: string }[]; fmt: (n: number) => string; color?: string; empty: string }) {
  if (!data.length) return <div className="p-8 text-center text-xs text-slate-500">{empty}</div>;
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="space-y-2.5">
      {data.map((d, i) => (
        <div key={i}>
          <div className="flex justify-between gap-2 text-xs mb-1"><span className="text-slate-300 truncate">{d.label}</span><span className="text-slate-100 font-bold tabular-nums [direction:ltr] shrink-0">{d.right ?? fmt(d.value)}</span></div>
          <div className="h-2.5 rounded-full bg-slate-800 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.max(2, (d.value / max) * 100)}%`, background: d.color || color }} /></div>
        </div>
      ))}
    </div>
  );
}
export function FlowChart({ labels, a, b, aName, bName, empty }: { labels: string[]; a: number[]; b: number[]; aName: string; bName: string; empty: string }) {
  if (!labels.length) return <div className="p-8 text-center text-xs text-slate-500">{empty}</div>;
  const W = Math.max(labels.length * 64, 340), H = 200, P = 28; const max = Math.max(...a, ...b, 1);
  const x = (i: number) => (labels.length === 1 ? W / 2 : P + (i * (W - P * 2)) / (labels.length - 1)); const y = (v: number) => H - P - (v / max) * (H - P * 2);
  const path = (arr: number[]) => arr.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} style={{ minWidth: W, direction: "ltr" }} className="w-full text-slate-500" role="img">
        {[0, 0.5, 1].map((g, i) => <line key={i} x1={P} x2={W - P} y1={P + g * (H - P * 2)} y2={P + g * (H - P * 2)} stroke="currentColor" opacity="0.25" />)}
        <path d={path(a)} fill="none" stroke="#10b981" strokeWidth="2.5" /><path d={path(b)} fill="none" stroke="#a855f7" strokeWidth="2.5" />
        {a.map((v, i) => <circle key={`a${i}`} cx={x(i)} cy={y(v)} r="3.5" fill="#10b981"><title>{`${labels[i]} ▲ ${v}`}</title></circle>)}
        {b.map((v, i) => <circle key={`b${i}`} cx={x(i)} cy={y(v)} r="3.5" fill="#a855f7"><title>{`${labels[i]} ▼ ${v}`}</title></circle>)}
        {labels.map((l, i) => <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="currentColor">{l}</text>)}
      </svg>
      <div className="flex items-center gap-4 justify-center text-xs mt-1">
        <span className="flex items-center gap-1.5 text-slate-300"><span className="w-2.5 h-2.5 rounded-full" style={{ background: "#10b981" }} />{aName}</span>
        <span className="flex items-center gap-1.5 text-slate-300"><span className="w-2.5 h-2.5 rounded-full" style={{ background: "#a855f7" }} />{bName}</span>
      </div>
    </div>
  );
}
export function Panel({ title, icon, extra, children, pad = true }: { title: string; icon?: ReactNode; extra?: ReactNode; children: ReactNode; pad?: boolean }) {
  return (
    <section className={`${CARD} overflow-hidden`}>
      <header className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-800"><h3 className="flex items-center gap-2 text-sm font-bold text-slate-100">{icon}{title}</h3>{extra}</header>
      <div className={pad ? "p-4" : ""}>{children}</div>
    </section>
  );
}
export function Chip({ tone, children }: { tone: "red" | "amber" | "orange" | "emerald" | "slate" | "blue"; children: ReactNode }) {
  const c = { red: "bg-red-500/15 text-red-300 border-red-500/30", amber: "bg-amber-500/15 text-amber-300 border-amber-500/30", orange: "bg-orange-500/15 text-orange-300 border-orange-500/30", emerald: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", slate: "bg-slate-700/60 text-slate-200 border-slate-600", blue: "bg-blue-500/15 text-blue-300 border-blue-500/30" }[tone];
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-lg border text-[11px] font-bold whitespace-nowrap ${c}`}>{children}</span>;
}
export { X as CloseIcon };

/** تباين الوضع الفاتح للألوان التي لا يغطيها theme.css (نطاقها مركز التقارير فقط). */
export const IA_CSS = `
html.light [data-testid=inv-analytics] .text-slate-50,html.light [data-testid=inv-analytics] .text-slate-100{color:#0f172a !important}
html.light [data-testid=inv-analytics] .text-orange-400,html.light [data-testid=inv-analytics] .text-orange-300{color:#9a3412 !important}
html.light [data-testid=inv-analytics] .text-sky-400{color:#0369a1 !important}
html.light [data-testid=inv-analytics] .text-red-300{color:#b91c1c !important}
html.light [data-testid=inv-analytics] .text-amber-300{color:#92400e !important}
html.light [data-testid=inv-analytics] .text-emerald-300{color:#047857 !important}
html.light [data-testid=inv-analytics] .text-blue-300{color:#1d4ed8 !important}
html.light [data-testid=inv-analytics] .bg-red-500\\/10{background:#fef2f2 !important}
html.light [data-testid=inv-analytics] .bg-amber-500\\/10{background:#fffbeb !important}
`;
