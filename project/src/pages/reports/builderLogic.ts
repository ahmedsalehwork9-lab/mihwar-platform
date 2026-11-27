// =============================================================
// src/pages/reports/builderLogic.ts
// منطق نقي لمُنشئ التقارير: التجميع، قيمة المؤشر، تطبيع الإعدادات المحفوظة، قوالب جاهزة، استيراد/تصدير اللوحات.
// =============================================================
export type FType = "text" | "number" | "currency" | "date" | "category";
export type Field = { key: string; en: string; ar: string; type: FType; measure?: boolean };
export type Row = Record<string, string | number | null | undefined>;
export type ChartType = "kpi" | "table" | "bar" | "column" | "line" | "area" | "pie" | "donut" | "scatter";
export type Agg = "SUM" | "COUNT" | "AVG" | "MIN" | "MAX";
export type DateGroup = "day" | "month" | "year";
export type Cfg = {
  srcId: string; chart: ChartType; dim: string; meas: string; agg: Agg; dateGroup: DateGroup; topN: number; sortDir: "desc" | "asc";
  xMeas: string; yMeas: string; title: string; palette: number; legend: boolean; values: boolean;
};
export type Widget = { id: string; cfg: Cfg; w: 1 | 2 };
export const COUNT_KEY = "__count";
export const CHARTS: ChartType[] = ["kpi", "table", "bar", "column", "line", "area", "pie", "donut", "scatter"];
export const AGGS: Agg[] = ["SUM", "COUNT", "AVG", "MIN", "MAX"];

export const bucketDate = (v: string, g: DateGroup): string => (g === "year" ? v.slice(0, 4) : g === "month" ? v.slice(0, 7) : v.slice(0, 10));
const num = (v: unknown): number => Number(v) || 0;
const r2 = (n: number): number => Math.round(n * 100) / 100;

export function reduceAgg(vals: number[], agg: Agg): number {
  if (!vals.length) return 0;
  if (agg === "COUNT") return vals.length;
  if (agg === "SUM") return r2(vals.reduce((s, v) => s + v, 0));
  if (agg === "AVG") return r2(vals.reduce((s, v) => s + v, 0) / vals.length);
  if (agg === "MIN") return vals.reduce((m, v) => (v < m ? v : m), vals[0]);
  return vals.reduce((m, v) => (v > m ? v : m), vals[0]);
}

export type Point = { label: string; value: number };
export function aggregate(rows: Row[], cfg: Cfg, dimField?: Field): Point[] {
  const groups = new Map<string, number[]>();
  const isDate = dimField?.type === "date";
  for (const r of rows) {
    let key: unknown = cfg.dim ? r[cfg.dim] : "—";
    if (isDate && key) key = bucketDate(String(key), cfg.dateGroup);
    const k = key == null || key === "" ? "—" : String(key);
    const arr = groups.get(k) ?? []; arr.push(cfg.meas === COUNT_KEY ? 1 : num(r[cfg.meas])); groups.set(k, arr);
  }
  const agg: Agg = cfg.meas === COUNT_KEY ? "COUNT" : cfg.agg;
  let out = Array.from(groups.entries()).map(([label, vals]) => ({ label, value: reduceAgg(vals, agg) }));
  out.sort((a, b) => (isDate ? a.label.localeCompare(b.label) : cfg.sortDir === "asc" ? a.value - b.value : b.value - a.value));
  if (cfg.topN > 0 && !isDate) out = out.slice(0, cfg.topN);
  return out;
}

/** قيمة بطاقة المؤشر على كل السجلات (تحترم الدالة المختارة، بما فيها MIN/MAX). */
export function kpiValue(rows: Row[], cfg: Cfg): number {
  if (cfg.meas === COUNT_KEY) return rows.length;
  return reduceAgg(rows.map((r) => num(r[cfg.meas])), cfg.agg);
}

export const defaultCfg = (srcId: string, fields: Field[]): Cfg => ({
  srcId, chart: "bar", dim: fields.find((f) => !f.measure)?.key || "", meas: fields.find((f) => f.measure)?.key || COUNT_KEY, agg: "SUM",
  dateGroup: "month", topN: 10, sortDir: "desc", xMeas: "", yMeas: "", title: "", palette: 0, legend: true, values: true,
});

/** يُصلح إعدادًا محفوظًا قديمًا/تالفًا (حقل لم يعد موجودًا، نوع غير معروف…) بدل انهيار الصفحة. */
export function normalizeCfg(raw: unknown, srcs: { id: string; fields: Field[] }[]): Cfg | null {
  if (!raw || typeof raw !== "object") return null; const c = raw as Partial<Cfg>;
  const src = srcs.find((s) => s.id === c.srcId); if (!src) return null;
  const d = defaultCfg(src.id, src.fields); const has = (k: string | undefined, measure: boolean): boolean => !!k && src.fields.some((f) => f.key === k && !!f.measure === measure);
  return {
    srcId: src.id, chart: CHARTS.includes(c.chart as ChartType) ? (c.chart as ChartType) : d.chart,
    dim: c.dim === "" || has(c.dim, false) ? (c.dim as string) : d.dim, meas: c.meas === COUNT_KEY || has(c.meas, true) ? (c.meas as string) : d.meas,
    agg: AGGS.includes(c.agg as Agg) ? (c.agg as Agg) : "SUM", dateGroup: c.dateGroup === "day" || c.dateGroup === "year" ? c.dateGroup : "month",
    topN: Math.max(0, Math.min(500, Math.floor(num(c.topN)))), sortDir: c.sortDir === "asc" ? "asc" : "desc",
    xMeas: has(c.xMeas, true) ? (c.xMeas as string) : "", yMeas: has(c.yMeas, true) ? (c.yMeas as string) : "",
    title: typeof c.title === "string" ? c.title.slice(0, 80) : "", palette: Math.max(0, Math.min(2, Math.floor(num(c.palette)))), legend: c.legend !== false, values: c.values !== false,
  };
}

// ── لوحات محفوظة ──
export type Dashboards = Record<string, Widget[]>;
export function normalizeDashboards(raw: unknown, srcs: { id: string; fields: Field[] }[]): Dashboards {
  const out: Dashboards = {}; if (!raw || typeof raw !== "object") return out;
  for (const [name, ws] of Object.entries(raw as Record<string, unknown>)) {
    if (!name.trim() || !Array.isArray(ws)) continue;
    const list: Widget[] = [];
    for (const w of ws as { id?: unknown; cfg?: unknown; w?: unknown }[]) { const cfg = normalizeCfg(w?.cfg, srcs); if (cfg) list.push({ id: typeof w.id === "string" && w.id ? w.id : Math.random().toString(36).slice(2), cfg, w: w.w === 2 ? 2 : 1 }); }
    out[name.slice(0, 60)] = list;
  }
  return out;
}
export const dashboardsToJson = (d: Dashboards): string => JSON.stringify({ app: "mihwar-report-builder", version: 1, dashboards: d }, null, 2);
export function dashboardsFromJson(text: string, srcs: { id: string; fields: Field[] }[]): Dashboards | null {
  try { const j = JSON.parse(text) as { app?: string; dashboards?: unknown }; if (j?.app !== "mihwar-report-builder") return null; return normalizeDashboards(j.dashboards, srcs); } catch { return null; }
}
/** اسم فريد عند الاستيراد/النسخ: «اسم (2)». */
export function uniqueName(name: string, taken: string[]): string {
  if (!taken.includes(name)) return name; let i = 2; while (taken.includes(`${name} (${i})`)) i++; return `${name} (${i})`;
}

// ── قوالب جاهزة بنقرة واحدة ──
export type Preset = { id: string; en: string; ar: string; cfg: Partial<Cfg> & { srcId: string } };
export const PRESETS: Preset[] = [
  { id: "sales-month", en: "Sales by month", ar: "المبيعات شهريًا", cfg: { srcId: "sales", chart: "column", dim: "date", meas: "total", agg: "SUM", dateGroup: "month" } },
  { id: "sales-branch", en: "Sales by branch", ar: "المبيعات حسب الفرع", cfg: { srcId: "sales", chart: "bar", dim: "branch", meas: "total", agg: "SUM", topN: 10 } },
  { id: "sales-pay", en: "Payment methods", ar: "طرق الدفع", cfg: { srcId: "sales", chart: "donut", dim: "payment", meas: "total", agg: "SUM" } },
  { id: "top-products", en: "Top products", ar: "أعلى المنتجات", cfg: { srcId: "sales_items", chart: "bar", dim: "product", meas: "net", agg: "SUM", topN: 10 } },
  { id: "purch-supplier", en: "Purchases by supplier", ar: "المشتريات حسب المورد", cfg: { srcId: "purchases", chart: "bar", dim: "supplier", meas: "total", agg: "SUM", topN: 10 } },
  { id: "expenses", en: "Expenses by account", ar: "المصروفات حسب الحساب", cfg: { srcId: "expenses", chart: "bar", dim: "account", meas: "amount", agg: "SUM", topN: 10 } },
  { id: "stock-cat", en: "Stock value by category", ar: "قيمة المخزون حسب التصنيف", cfg: { srcId: "inventory", chart: "donut", dim: "category", meas: "value", agg: "SUM" } },
];
