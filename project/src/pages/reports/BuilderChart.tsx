// =============================================================
// src/pages/reports/BuilderChart.tsx — عرض رسوم مُنشئ التقارير (SVG يدوي، ثيمان، RTL/LTR، تلميحات بالتمرير).
// =============================================================
import { EmptyState, money, fmtInt } from "./reportingKit";
import { COUNT_KEY, kpiValue, type Cfg, type Field, type Point, type Row } from "./builderLogic";

export const PALETTES = [
  ["#3b82f6", "#10b981", "#f59e0b", "#a855f7", "#ef4444", "#06b6d4", "#ec4899", "#64748b"],
  ["#6366f1", "#14b8a6", "#f97316", "#8b5cf6", "#e11d48", "#0ea5e9", "#db2777", "#475569"],
  ["#10b981", "#059669", "#34d399", "#6ee7b7", "#a7f3d0", "#047857", "#065f46", "#064e3b"],
];
type TFn = (en: string, ar: string) => string;
const GRID = { stroke: "currentColor", strokeOpacity: 0.14, className: "text-slate-400" } as const;

export function ChartView({ data, cfg, rows, measField, t, dimLabel }: {
  data: Point[]; cfg: Cfg; rows: Row[]; measField?: Field; t: TFn; dimLabel?: string;
}) {
  const pal = PALETTES[cfg.palette % PALETTES.length];
  const cur = measField?.type === "currency" && cfg.agg !== "COUNT" && cfg.meas !== COUNT_KEY;
  const fmtV = (n: number): string => (cur ? money(n) : fmtInt(Math.round(n * 100) / 100));
  const needData = cfg.chart !== "kpi" && cfg.chart !== "scatter";
  if (needData && !data.length) return <EmptyState label={t("No data for this selection.", "لا توجد بيانات لهذا الاختيار.")} />;

  if (cfg.chart === "kpi") {
    return (
      <div data-testid="chart-kpi" className="flex flex-col items-center justify-center py-8">
        <div className="text-4xl font-black" style={{ color: pal[0] }}><bdi dir="ltr">{fmtV(kpiValue(rows, cfg))}</bdi></div>
        <div className="text-xs text-slate-500 mt-1">{cfg.title || t("KPI", "مؤشر")}</div>
      </div>
    );
  }
  if (cfg.chart === "table") {
    return (
      <div data-testid="chart-table" className="overflow-auto max-h-[320px]"><table className="w-full text-xs text-start border-collapse">
        <thead><tr className="bg-slate-950/50 text-slate-500 text-[10px] sticky top-0"><th scope="col" className="px-3 py-2 font-bold text-start">{dimLabel || "—"}</th><th scope="col" className="px-3 py-2 font-bold text-end">{t("Value", "القيمة")}</th></tr></thead>
        <tbody className="divide-y divide-slate-800/60">{data.map((d, i) => <tr key={i}><td className="px-3 py-2 text-slate-200">{d.label}</td><td className="px-3 py-2 font-mono text-slate-300 text-end"><bdi dir="ltr">{fmtV(d.value)}</bdi></td></tr>)}</tbody>
      </table></div>
    );
  }
  if (cfg.chart === "pie" || cfg.chart === "donut") {
    const total = data.reduce((s, d) => s + Math.max(d.value, 0), 0); if (!total) return <EmptyState />;
    const size = 190, R = size / 2 - 10, donut = cfg.chart === "donut"; const r = donut ? R : R / 2, sw = donut ? 24 : R, C = 2 * Math.PI * r; let off = 0;
    return (
      <div data-testid={`chart-${cfg.chart}`} className="flex items-center gap-4 flex-wrap justify-center py-2">
        <svg viewBox={`0 0 ${size} ${size}`} style={{ width: size, height: size }} role="img" aria-label={cfg.title}>
          <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>{data.map((d, i) => { const len = C * (Math.max(d.value, 0) / total); const el = <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={pal[i % pal.length]} strokeWidth={sw} strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-off}><title>{`${d.label}: ${fmtV(d.value)} (${Math.round((d.value / total) * 1000) / 10}%)`}</title></circle>; off += len; return el; })}</g>
        </svg>
        {cfg.legend && <div className="space-y-1 text-xs">{data.map((d, i) => <div key={i} className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: pal[i % pal.length] }} /><span className="text-slate-400">{d.label}</span><bdi dir="ltr" className="text-slate-300 font-mono ms-1">{fmtV(d.value)}</bdi></div>)}</div>}
      </div>
    );
  }
  if (cfg.chart === "scatter") {
    const xf = cfg.xMeas || cfg.meas, yf = cfg.yMeas || cfg.meas;
    const pts = rows.slice(0, 400).map((r) => ({ x: Number(r[xf]) || 0, y: Number(r[yf]) || 0 })); if (!pts.length) return <EmptyState />;
    const maxX = Math.max(...pts.map((p) => p.x), 1), maxY = Math.max(...pts.map((p) => p.y), 1); const W = 420, H = 240, pad = 30;
    return <svg data-testid="chart-scatter" viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={cfg.title}>{[0, 0.5, 1].map((g, i) => <line key={i} x1={pad} x2={W - pad} y1={pad + g * (H - 2 * pad)} y2={pad + g * (H - 2 * pad)} {...GRID} />)}{pts.map((p, i) => <circle key={i} cx={pad + (p.x / maxX) * (W - 2 * pad)} cy={H - pad - (p.y / maxY) * (H - 2 * pad)} r="3.5" fill={pal[0]} fillOpacity="0.6"><title>{`(${p.x}, ${p.y})`}</title></circle>)}</svg>;
  }
  const max = Math.max(...data.map((d) => d.value), 1);
  if (cfg.chart === "bar") {
    return <div data-testid="chart-bar" className="space-y-2.5 py-1">{data.map((d, i) => <div key={i}><div className="flex justify-between text-xs mb-1 gap-2"><span className="text-slate-300 truncate">{d.label}</span>{cfg.values && <bdi dir="ltr" className="text-slate-200 font-bold font-mono shrink-0">{fmtV(d.value)}</bdi>}</div><div className="h-2.5 rounded-full bg-slate-800 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.max(2, (Math.max(d.value, 0) / max) * 100)}%`, background: pal[i % pal.length] }} /></div></div>)}</div>;
  }
  const W = Math.max(data.length * 46, 320), H = 230, pad = 30;
  const x = (i: number) => pad + (i * (W - 2 * pad)) / Math.max(1, data.length - 1);
  const y = (v: number) => H - pad - (Math.max(v, 0) / max) * (H - 2 * pad);
  const short = (s: string) => (s.length > 8 ? `${s.slice(0, 7)}…` : s);
  return (
    <div data-testid={`chart-${cfg.chart}`} className="overflow-x-auto"><svg viewBox={`0 0 ${W} ${H}`} style={{ minWidth: W }} className="w-full" role="img" aria-label={cfg.title}>
      {[0, 0.25, 0.5, 0.75, 1].map((g, i) => <line key={i} x1={pad} x2={W - pad} y1={pad + g * (H - 2 * pad)} y2={pad + g * (H - 2 * pad)} {...GRID} />)}
      {cfg.chart === "column" && data.map((d, i) => { const bw = Math.min(28, (W - 2 * pad) / data.length - 6); return <rect key={i} x={x(i) - bw / 2} y={y(d.value)} width={bw} height={H - pad - y(d.value)} rx="3" fill={pal[i % pal.length]}><title>{`${d.label}: ${fmtV(d.value)}`}</title></rect>; })}
      {cfg.chart === "area" && <path d={`M${x(0)},${H - pad} ` + data.map((d, i) => `L${x(i)},${y(d.value)}`).join(" ") + ` L${x(data.length - 1)},${H - pad} Z`} fill={pal[0]} fillOpacity="0.18" />}
      {(cfg.chart === "line" || cfg.chart === "area") && <path d={data.map((d, i) => `${i ? "L" : "M"}${x(i)},${y(d.value)}`).join(" ")} fill="none" stroke={pal[0]} strokeWidth="2.5" />}
      {(cfg.chart === "line" || cfg.chart === "area") && data.map((d, i) => <circle key={i} cx={x(i)} cy={y(d.value)} r="3" fill={pal[0]}><title>{`${d.label}: ${fmtV(d.value)}`}</title></circle>)}
      {cfg.values && data.length <= 14 && data.map((d, i) => <text key={`v${i}`} x={x(i)} y={Math.max(10, y(d.value) - 6)} textAnchor="middle" fontSize="8" fill="#94a3b8">{fmtV(d.value)}</text>)}
      {data.map((d, i) => <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="8" fill="#64748b">{short(d.label)}</text>)}
    </svg></div>
  );
}
