// =============================================================
// src/pages/accounting/statements/StatementCharts.tsx
// لوحة رسوم خفيفة (HTML/SVG بلا مكتبات) بجانب القوائم المالية.
// أعمدة أفقية (تدعم قيمًا سالبة ومقارنة) + حلقة نسب مع وسيلة إيضاح.
// =============================================================
import { useLang } from "../../../context/LanguageContext";
import type { Slice } from "./statementsLogic";

export type BarRow = { label: string; value: number; prev?: number | null; tone?: "pos" | "neg" | "auto" | "info" | "warn" };
export type ChartSpec = { bars: { title: string; rows: BarRow[] }; donut: { title: string; slices: Slice[]; center?: string } };

const CARD = "bg-slate-900 border border-slate-800 rounded-2xl p-4";
const PALETTE = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#06b6d4", "#94a3b8"];
const TONE: Record<string, string> = { pos: "bg-emerald-500", neg: "bg-red-500", info: "bg-sky-500", warn: "bg-amber-400" };
const fmt = (n: number): string => (Math.round(n * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function StatementCharts({ spec }: { spec: ChartSpec }) {
  const { t } = useLang();
  const rows = spec.bars.rows;
  const max = Math.max(1, ...rows.flatMap((r) => [Math.abs(r.value), Math.abs(r.prev ?? 0)]));
  const hasNeg = rows.some((r) => r.value < 0 || (r.prev ?? 0) < 0);
  const barColor = (r: BarRow): string => (r.tone === "auto" || !r.tone ? (r.value < 0 ? TONE.neg : TONE.pos) : TONE[r.tone]);
  const R = 42; const C = 2 * Math.PI * R; let acc = 0;
  return (
    <div className="space-y-3" data-testid="charts">
      <div className={CARD} data-testid="chart-bars">
        <div className="text-[11px] font-bold text-slate-400 mb-3">{spec.bars.title}</div>
        <div className="space-y-3">
          {rows.map((r, i) => {
            const w = (v: number) => `${(Math.abs(v) / max) * (hasNeg ? 50 : 100)}%`;
            const bar = (v: number, cls: string, id: string) => (
              <div className="relative h-3 rounded bg-slate-800/70" data-testid={id}>
                {hasNeg && <span className="absolute inset-y-0 start-1/2 w-px bg-slate-600" />}
                <div className={`absolute inset-y-0 rounded ${cls}`} style={hasNeg ? (v < 0 ? { insetInlineEnd: "50%", width: w(v) } : { insetInlineStart: "50%", width: w(v) }) : { insetInlineStart: 0, width: w(v) }} />
              </div>);
            return (
              <div key={i} data-testid="bar-row">
                <div className="flex items-baseline justify-between gap-2 mb-1"><span className="text-[11px] text-slate-300 truncate">{r.label}</span><span className={`text-[11px] font-mono font-bold ${r.value < 0 ? "text-red-300" : "text-slate-100"}`} dir="ltr" data-testid="bar-value">{fmt(r.value)}</span></div>
                {bar(r.value, barColor(r), "bar-cur")}
                {r.prev != null && <div className="mt-1 opacity-60">{bar(r.prev, "bg-slate-500", "bar-prev")}<div className="text-[9px] text-slate-500 mt-0.5">{t("previous", "السابق")} <span className="font-mono" dir="ltr">{fmt(r.prev)}</span></div></div>}
              </div>);
          })}
        </div>
      </div>
      <div className={CARD} data-testid="chart-donut">
        <div className="text-[11px] font-bold text-slate-400 mb-3">{spec.donut.title}</div>
        {spec.donut.slices.length === 0 ? <div className="text-xs text-slate-500 py-6 text-center" data-testid="donut-empty">{t("No data to chart", "لا توجد بيانات للرسم")}</div> : (
          <div className="flex items-center gap-4 flex-wrap">
            <svg width="120" height="120" viewBox="0 0 120 120" role="img" aria-label={spec.donut.title}>
              <circle cx="60" cy="60" r={R} fill="none" stroke="#1e293b" strokeWidth="16" />
              {spec.donut.slices.map((s, i) => { const len = (s.pct / 100) * C; const el = <circle key={i} cx="60" cy="60" r={R} fill="none" stroke={PALETTE[i % PALETTE.length]} strokeWidth="16" strokeDasharray={`${Math.max(len - 1, 0)} ${C - Math.max(len - 1, 0)}`} strokeDashoffset={-acc} transform="rotate(-90 60 60)" data-testid="donut-slice" />; acc += len; return el; })}
              {spec.donut.center && <text x="60" y="64" textAnchor="middle" fontSize="11" fontWeight="700" fill="#e2e8f0" style={{ direction: "ltr" }}>{spec.donut.center}</text>}
            </svg>
            <ul className="flex-1 min-w-[140px] space-y-1.5">
              {spec.donut.slices.map((s, i) => (
                <li key={i} className="flex items-center gap-2 text-[11px]" data-testid="donut-legend"><span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: PALETTE[i % PALETTE.length] }} /><span className="text-slate-300 truncate flex-1">{s.label}</span><span className="font-mono text-slate-400" dir="ltr">{s.pct.toFixed(1)}%</span></li>))}
            </ul>
          </div>)}
      </div>
    </div>
  );
}
