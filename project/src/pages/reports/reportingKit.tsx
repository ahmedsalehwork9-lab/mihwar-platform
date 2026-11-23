// =============================================================
// src/pages/reports/reportingKit.tsx
// مكوّنات التقارير المشتركة (Phase 2 — Shared Components)
// تُستخدم عبر «مركز التقارير» و«لوحة تحليلات الأعمال».
// رسوم SVG يدوية (بلا مكتبات)، تدعم الثيمين الداكن/الفاتح و RTL/LTR.
// =============================================================
import { ReactNode } from "react";
import { TrendingUp, TrendingDown, AlertTriangle, Inbox, Loader2 } from "lucide-react";
import { ACTIVE } from "../lib/orgConfig";

// ── تنسيق ──────────────────────────────────────────────────────────────────
// العملة تتبع إعداد الشركة النشطة (ACTIVE.symbol) — طبقة عرض فقط.
export const money = (n: number, cur?: string) =>
  `${(Math.round((Number(n) || 0) * 100) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })} ${cur ?? ACTIVE.symbol}`;
export const fmtInt = (n: number) => (Number(n) || 0).toLocaleString("en-US");
export const pctLabel = (n: number) => `${n >= 0 ? "+" : ""}${Math.round((Number(n) || 0) * 10) / 10}%`;
export const growth = (cur: number, prev: number) => (prev === 0 ? (cur === 0 ? 0 : 100) : ((cur - prev) / Math.abs(prev)) * 100);

export const CARD = "bg-slate-900 border border-slate-800 rounded-2xl";

// ── حالات ──────────────────────────────────────────────────────────────────
export function Loading({ label = "جارٍ التحميل…" }: { label?: string }) {
  return <div className="p-10 flex flex-col items-center justify-center gap-3 text-slate-500 text-sm"><Loader2 className="animate-spin text-blue-500" /> {label}</div>;
}
export function EmptyState({ label = "لا توجد بيانات ضمن هذه الفترة/الفلاتر." }: { label?: string }) {
  return <div className="p-10 flex flex-col items-center justify-center gap-2 text-slate-600 text-xs text-center"><Inbox size={22} className="opacity-60" /> {label}</div>;
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
export function Kpi({ label, value, prev, deltaPct, tone = "slate", icon: Icon, onClick, hint }: {
  label: string; value: string; prev?: string; deltaPct?: number; tone?: string; icon?: any; onClick?: () => void; hint?: string;
}) {
  const up = (deltaPct ?? 0) >= 0;
  return (
    <button type="button" onClick={onClick} disabled={!onClick}
      className={`${CARD} p-4 text-right flex flex-col justify-between min-h-[112px] transition-all ${onClick ? "hover:border-blue-500/50 active:scale-[0.99] cursor-pointer" : "cursor-default"}`}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold text-slate-500">{label}</span>
        {Icon && <span className={`w-8 h-8 rounded-xl bg-slate-800/60 flex items-center justify-center ${TONE[tone] || TONE.slate}`}><Icon size={15} /></span>}
      </div>
      <div className={`text-xl font-black mt-1 [direction:ltr] text-right ${TONE[tone] || TONE.slate}`}>{value}</div>
      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
        {deltaPct != null && (
          <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold ${up ? "text-emerald-400" : "text-red-400"}`}>
            {up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}{pctLabel(deltaPct)}
          </span>
        )}
        {prev != null && <span className="text-[10px] text-slate-600 [direction:ltr]">السابق: {prev}</span>}
        {hint && <span className="text-[10px] text-slate-600">{hint}</span>}
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
            <span className="text-slate-200 font-bold font-mono [direction:ltr] shrink-0">{fmt(d.value)}</span>
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
export function LineDual({ a, b, labels, aName, bName, aColor = "#3b82f6", bColor = "#10b981", height = 200 }: {
  a: number[]; b?: number[]; labels: string[]; aName?: string; bName?: string; aColor?: string; bColor?: string; height?: number;
}) {
  if (!labels.length) return <EmptyState />;
  const all = [...a, ...(b || [])];
  const max = Math.max(...all, 1);
  const W = Math.max(labels.length * 52, 320), H = height, pad = 26;
  const x = (i: number) => pad + (i * (W - pad * 2)) / Math.max(1, labels.length - 1);
  const y = (v: number) => H - pad - (v / max) * (H - pad * 2);
  const path = (arr: number[]) => arr.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} style={{ minWidth: W }} className="w-full">
        {[0, 0.25, 0.5, 0.75, 1].map((g, i) => (<line key={i} x1={pad} x2={W - pad} y1={pad + g * (H - pad * 2)} y2={pad + g * (H - pad * 2)} stroke="#1e293b" strokeWidth="1" />))}
        <path d={path(a)} fill="none" stroke={aColor} strokeWidth="2.5" />
        {a.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r="3" fill={aColor} />)}
        {b && <path d={path(b)} fill="none" stroke={bColor} strokeWidth="2.5" />}
        {b && b.map((v, i) => <circle key={`b${i}`} cx={x(i)} cy={y(v)} r="3" fill={bColor} />)}
        {labels.map((l, i) => <text key={`l${i}`} x={x(i)} y={H - 6} textAnchor="middle" fontSize="9" fill="#64748b">{l}</text>)}
      </svg>
      {(aName || bName) && (
        <div className="flex items-center gap-4 justify-center text-[11px] mt-1">
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
          <circle cx={size / 2} cy={size / 2} r={R} fill="none" stroke="#1e293b" strokeWidth="14" />
          {clean.map((d, i) => { const len = C * (d.value / total); const el = (<circle key={i} cx={size / 2} cy={size / 2} r={R} fill="none" stroke={d.color} strokeWidth="14" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-off} />); off += len; return el; })}
        </g>
      </svg>
      <div className="space-y-1.5 text-xs">
        {clean.map((d, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
            <span className="text-slate-400">{d.label}</span>
            <span className="text-slate-200 font-mono [direction:ltr] mr-1">{money(d.value)}</span>
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
      <table className="w-full text-right border-collapse text-xs">
        <thead className="sticky top-0"><tr className="bg-slate-950/60 border-b border-slate-800 text-[10px] text-slate-500">
          {cols.map((c) => <th key={c.k} className={`px-3 py-2.5 font-bold ${c.align === "c" ? "text-center" : c.align === "l" ? "text-left" : ""}`}>{c.label}</th>)}
        </tr></thead>
        <tbody className="divide-y divide-slate-800/60">
          {rows.map((r, i) => (
            <tr key={i} onClick={() => onRow?.(r)} className={`${onRow ? "cursor-pointer hover:bg-slate-800/30" : ""} transition-colors`}>
              {cols.map((c) => <td key={c.k} className={`px-3 py-2.5 text-slate-200 ${c.align === "c" ? "text-center" : c.align === "l" ? "text-left [direction:ltr]" : ""}`}>{c.fmt ? c.fmt(r[c.k], r) : r[c.k]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
