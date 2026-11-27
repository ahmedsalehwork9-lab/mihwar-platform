// =============================================================
// src/pages/reports/reportingKit.tsx
// مكوّنات التقارير المشتركة (Phase 2 — Shared Components)
// تُستخدم عبر «مركز التقارير» و«لوحة تحليلات الأعمال».
// رسوم SVG يدوية (بلا مكتبات)، تدعم الثيمين الداكن/الفاتح و RTL/LTR.
// =============================================================
import { ReactNode } from "react";
import { TrendingUp, TrendingDown, AlertTriangle, Inbox, Loader2, RefreshCw, Download, Printer } from "lucide-react";
import { ACTIVE } from "../lib/orgConfig";
import { useLang } from "../../context/LanguageContext";
import type { RangeKey } from "./reportsLogic";

// ── تنسيق ──────────────────────────────────────────────────────────────────
// العملة تتبع إعداد الشركة النشطة (ACTIVE.symbol) — طبقة عرض فقط.
export const money = (n: number, cur?: string) =>
  `${(Math.round((Number(n) || 0) * 100) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })} ${cur ?? ACTIVE.symbol}`;
export const fmtInt = (n: number) => (Number(n) || 0).toLocaleString("en-US");
export const pctLabel = (n: number) => `${n >= 0 ? "+" : ""}${Math.round((Number(n) || 0) * 10) / 10}%`;
export const growth = (cur: number, prev: number) => (prev === 0 ? (cur === 0 ? 0 : 100) : ((cur - prev) / Math.abs(prev)) * 100);

export const CARD = "bg-slate-900 border border-slate-800 rounded-2xl";

// ── حالات ──────────────────────────────────────────────────────────────────
export function Loading({ label }: { label?: string }) {
  const { t } = useLang();
  return <div data-testid="rpt-loading" className="p-10 flex flex-col items-center justify-center gap-3 text-slate-500 text-sm"><Loader2 className="animate-spin text-blue-500" /> {label ?? t("Loading…", "جارٍ التحميل…")}</div>;
}
export function EmptyState({ label }: { label?: string }) {
  const { t } = useLang();
  return <div data-testid="rpt-empty" className="p-10 flex flex-col items-center justify-center gap-2 text-slate-500 text-xs text-center"><Inbox size={22} className="opacity-60" /> {label ?? t("No data for this period/filters.", "لا توجد بيانات ضمن هذه الفترة/الفلاتر.")}</div>;
}
export function Warn({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 px-4 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs">
      <AlertTriangle size={15} className="shrink-0 mt-0.5" /> <div>{children}</div>
    </div>
  );
}

// ── بطاقة قسم ──────────────────────────────────────────────────────────────
export function SectionCard({ title, icon: Icon, extra, children, pad = true }: { title: string; icon?: any; extra?: ReactNode; children: ReactNode; pad?: boolean }) {
  return (
    <div className={CARD}>
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-800">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-200">{Icon && <Icon size={16} className="text-blue-400" />} {title}</div>
        {extra}
      </div>
      <div className={pad ? "p-4" : ""}>{children}</div>
    </div>
  );
}

const TONE: Record<string, string> = { emerald: "text-emerald-400", blue: "text-blue-400", amber: "text-amber-400", red: "text-red-400", purple: "text-purple-400", sky: "text-sky-400", slate: "text-slate-200" };

// ── بطاقة مؤشر KPI (بمقارنة فترة سابقة + تنقّل drill-down) ──────────────────
export function Kpi({ id, label, value, prev, deltaPct, tone = "slate", icon: Icon, onClick, hint }: {
  id?: string; label: string; value: string; prev?: string; deltaPct?: number; tone?: string; icon?: any; onClick?: () => void; hint?: string;
}) {
  const up = (deltaPct ?? 0) >= 0; const { t } = useLang();
  return (
    <button type="button" data-testid={id} onClick={onClick} disabled={!onClick}
      className={`${CARD} p-4 text-start flex flex-col justify-between min-h-[112px] transition-all ${onClick ? "hover:border-blue-500/50 active:scale-[0.99] cursor-pointer" : "cursor-default"}`}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold text-slate-500">{label}</span>
        {Icon && <span className={`w-8 h-8 rounded-xl bg-slate-800/60 flex items-center justify-center ${TONE[tone] || TONE.slate}`}><Icon size={15} /></span>}
      </div>
      <div data-testid={id ? `${id}-v` : undefined} className={`text-xl font-black mt-1 text-start ${TONE[tone] || TONE.slate}`}><bdi dir="ltr">{value}</bdi></div>
      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
        {deltaPct != null && (
          <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold ${up ? "text-emerald-400" : "text-red-400"}`}>
            {up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}{pctLabel(deltaPct)}
          </span>
        )}
        {prev != null && <span className="text-[10px] text-slate-500">{t("Prev", "السابق")}: <bdi dir="ltr">{prev}</bdi></span>}
        {hint && <span className="text-[10px] text-slate-500">{hint}</span>}
      </div>
    </button>
  );
}

// ── أعمدة أفقية ────────────────────────────────────────────────────────────
export function BarsH({ data, color = "#3b82f6", fmt = money }: { data: { label: string; value: number }[]; color?: string; fmt?: (n: number) => string }) {
  if (!data.length) return <EmptyState />;
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="space-y-2.5">
      {data.map((d, i) => (
        <div key={i}>
          <div className="flex justify-between text-xs mb-1 gap-2">
            <span className="text-slate-300 truncate">{d.label}</span>
            <bdi dir="ltr" className="text-slate-200 font-bold font-mono shrink-0">{fmt(d.value)}</bdi>
          </div>
          <div className="h-2.5 rounded-full bg-slate-800 overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${Math.max(2, (d.value / max) * 100)}%`, background: color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── خط مزدوج (سلسلتان) ─────────────────────────────────────────────────────
export function LineDual({ a, b, labels, aName, bName, aColor = "#3b82f6", bColor = "#10b981", height = 200, step = 52 }: {
  a: number[]; b?: number[]; labels: string[]; aName?: string; bName?: string; aColor?: string; bColor?: string; height?: number; step?: number;
}) {
  if (!labels.length) return <EmptyState />;
  const all = [...a, ...(b || [])];
  const max = Math.max(...all, 1);
  const W = Math.max(labels.length * step, 320), H = height, pad = 26;
  const x = (i: number) => pad + (i * (W - pad * 2)) / Math.max(1, labels.length - 1);
  const y = (v: number) => H - pad - (v / max) * (H - pad * 2);
  const path = (arr: number[]) => arr.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} style={{ minWidth: W }} className="w-full">
        {[0, 0.25, 0.5, 0.75, 1].map((g, i) => (<line key={i} x1={pad} x2={W - pad} y1={pad + g * (H - pad * 2)} y2={pad + g * (H - pad * 2)} stroke="currentColor" strokeOpacity="0.14" className="text-slate-400" strokeWidth="1" />))}
        <path d={path(a)} fill="none" stroke={aColor} strokeWidth="2.5" />
        {a.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r="3" fill={aColor}><title>{`${aName ? aName + " · " : ""}${labels[i]}: ${money(v)}`}</title></circle>)}
        {b && <path d={path(b)} fill="none" stroke={bColor} strokeWidth="2.5" />}
        {b && b.map((v, i) => <circle key={`b${i}`} cx={x(i)} cy={y(v)} r="3" fill={bColor}><title>{`${bName ? bName + " · " : ""}${labels[i]}: ${money(v)}`}</title></circle>)}
        {labels.map((l, i) => <text key={`l${i}`} x={x(i)} y={H - 6} textAnchor="middle" fontSize="9" fill="#64748b">{l}</text>)}
      </svg>
      {(aName || bName) && (
        <div className="flex items-center gap-4 justify-center text-[11px] mt-1" data-testid="legend">
          {aName && <span className="flex items-center gap-1 text-slate-400"><span className="w-2.5 h-2.5 rounded-full" style={{ background: aColor }} /> {aName}</span>}
          {bName && <span className="flex items-center gap-1 text-slate-400"><span className="w-2.5 h-2.5 rounded-full" style={{ background: bColor }} /> {bName}</span>}
        </div>
      )}
    </div>
  );
}

// ── دونت + مفتاح ───────────────────────────────────────────────────────────
export function Donut({ data, size = 150 }: { data: { label: string; value: number; color: string }[]; size?: number }) {
  const clean = data.filter((d) => d.value > 0);
  const total = clean.reduce((s, d) => s + d.value, 0);
  if (!total) return <EmptyState />;
  const R = size / 2 - 14, C = 2 * Math.PI * R;
  let off = 0;
  return (
    <div className="flex items-center gap-4 flex-wrap justify-center">
      <svg viewBox={`0 0 ${size} ${size}`} style={{ width: size, height: size }} className="shrink-0">
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle cx={size / 2} cy={size / 2} r={R} fill="none" stroke="currentColor" strokeOpacity="0.14" className="text-slate-400" strokeWidth="14" />
          {clean.map((d, i) => { const len = C * (d.value / total); const el = (<circle key={i} cx={size / 2} cy={size / 2} r={R} fill="none" stroke={d.color} strokeWidth="14" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-off} />); off += len; return el; })}
        </g>
      </svg>
      <div className="space-y-1.5 text-xs">
        {clean.map((d, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
            <span className="text-slate-400">{d.label}</span>
            <bdi dir="ltr" className="text-slate-200 font-mono ms-1">{money(d.value)}</bdi>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── جدول بيانات ────────────────────────────────────────────────────────────
export type Col = { k: string; label: string; align?: "r" | "c" | "l"; fmt?: (v: any, row: any) => ReactNode };
export function DataTable({ cols, rows, onRow, maxH }: { cols: Col[]; rows: any[]; onRow?: (row: any) => void; maxH?: number }) {
  if (!rows.length) return <EmptyState />;
  return (
    <div className="overflow-x-auto" style={maxH ? { maxHeight: maxH, overflowY: "auto" } : undefined}>
      <table className="w-full text-start border-collapse text-xs">
        <thead className="sticky top-0"><tr className="bg-slate-950/60 border-b border-slate-800 text-[10px] text-slate-500">
          {cols.map((c) => <th key={c.k} scope="col" className={`px-3 py-2.5 font-bold ${c.align === "c" ? "text-center" : c.align === "l" ? "text-end" : "text-start"}`}>{c.label}</th>)}
        </tr></thead>
        <tbody className="divide-y divide-slate-800/60">
          {rows.map((r, i) => (
            <tr key={i} onClick={() => onRow?.(r)} className={`${onRow ? "cursor-pointer hover:bg-slate-800/30" : ""} transition-colors`}>
              {cols.map((c) => <td key={c.k} className={`px-3 py-2.5 text-slate-200 ${c.align === "c" ? "text-center" : c.align === "l" ? "text-end" : "text-start"}`}>{c.align === "l" ? <bdi dir="ltr">{c.fmt ? c.fmt(r[c.k], r) : r[c.k]}</bdi> : (c.fmt ? c.fmt(r[c.k], r) : r[c.k])}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── شريط الفترة/الفرع المشترك ──────────────────────────────────────────────
export const INP = "bg-slate-950 border border-slate-700 rounded-xl text-white px-3 py-2 text-sm outline-none focus:border-blue-500";
const RANGE_LABEL: Record<RangeKey, [string, string]> = {
  month: ["This month", "هذا الشهر"], prev_month: ["Last month", "الشهر الماضي"], quarter: ["This quarter", "هذا الربع"],
  year: ["This year", "هذه السنة"], last_year: ["Last year", "السنة الماضية"], custom: ["Custom", "مخصّص"],
};
export function PeriodBar({ range, onRange, from, to, onFrom, onTo, branches, branch, onBranch, loading, onRefresh, keys, extra }: {
  range: RangeKey; onRange: (k: RangeKey) => void; from: string; to: string; onFrom: (v: string) => void; onTo: (v: string) => void;
  branches: { id: number; name: string }[]; branch: string; onBranch: (v: string) => void; loading: boolean; onRefresh: () => void; keys: RangeKey[]; extra?: ReactNode;
}) {
  const { t } = useLang();
  return (
    <div data-testid="period-bar" className="flex flex-wrap items-end gap-2">
      <div className="flex flex-wrap gap-1 p-1 rounded-xl bg-slate-900 border border-slate-800">
        {keys.map((k) => (
          <button key={k} data-testid={`rng-${k}`} aria-pressed={range === k} onClick={() => onRange(k)}
            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold ${range === k ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"}`}>{t(RANGE_LABEL[k][0], RANGE_LABEL[k][1])}</button>
        ))}
      </div>
      {range === "custom" && (
        <>
          <div className="flex flex-col gap-1"><label className="text-[10px] text-slate-500 font-bold">{t("From", "من")}</label><input data-testid="rng-from" type="date" value={from} max={to || undefined} onChange={(e) => onFrom(e.target.value)} className={INP} /></div>
          <div className="flex flex-col gap-1"><label className="text-[10px] text-slate-500 font-bold">{t("To", "إلى")}</label><input data-testid="rng-to" type="date" value={to} min={from || undefined} onChange={(e) => onTo(e.target.value)} className={INP} /></div>
        </>
      )}
      {branches.length > 1 && (
        <div className="flex flex-col gap-1"><label className="text-[10px] text-slate-500 font-bold">{t("Branch", "الفرع")}</label>
          <select data-testid="rpt-branch" value={branch} onChange={(e) => onBranch(e.target.value)} className={INP}><option value="">{t("All branches", "كل الفروع")}</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
      )}
      {extra}
      <button data-testid="rpt-refresh" onClick={onRefresh} title={t("Refresh", "تحديث")} aria-label={t("Refresh", "تحديث")} className="p-2.5 rounded-xl border border-slate-800 bg-slate-900 text-slate-400 hover:text-white"><RefreshCw size={16} className={loading ? "animate-spin text-blue-500" : ""} /></button>
    </div>
  );
}

// ── أزرار التصدير/الطباعة ──────────────────────────────────────────────────
export function OutBtns({ onExcel, onPrint, disabled, printLabel }: { onExcel?: () => void; onPrint?: () => void; disabled?: boolean; printLabel?: string }) {
  const { t } = useLang();
  const cls = "inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-slate-800 bg-slate-900 text-slate-300 hover:text-white text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed";
  return (
    <>
      {onExcel && <button data-testid="rpt-excel" onClick={onExcel} disabled={disabled} className={cls}><Download size={15} /> Excel</button>}
      {onPrint && <button data-testid="rpt-print" onClick={onPrint} disabled={disabled} className={cls}><Printer size={15} /> {printLabel ?? t("Print / PDF", "طباعة / PDF")}</button>}
    </>
  );
}

// ── ترويسة صفحة ───────────────────────────────────────────────────────────
export function PageHead({ icon: Icon, tone = "blue", title, sub, children }: { icon: any; tone?: "blue" | "purple" | "emerald" | "amber"; title: string; sub?: string; children?: ReactNode }) {
  const bg = { blue: "bg-blue-500/10 text-blue-400", purple: "bg-purple-500/10 text-purple-400", emerald: "bg-emerald-500/10 text-emerald-400", amber: "bg-amber-500/10 text-amber-400" }[tone];
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 mb-4">
      <div className="flex items-center gap-3 min-w-0">
        <span className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${bg}`}><Icon size={22} /></span>
        <div className="min-w-0"><h1 className="text-2xl font-black text-white leading-tight">{title}</h1>{sub && <p className="text-slate-500 text-xs mt-0.5">{sub}</p>}</div>
      </div>
      <div className="flex flex-wrap items-end gap-2">{children}</div>
    </header>
  );
}
