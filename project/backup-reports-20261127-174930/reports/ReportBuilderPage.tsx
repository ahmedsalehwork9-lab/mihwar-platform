// =============================================================
// src/pages/reports/ReportBuilderPage.tsx
// مُنشئ التقارير التفاعلي (Report Builder) — ثلاث لوحات + Canvas.
// مستكشف بيانات (مصادر ERP موثّقة) · منشئ رسوم (9 أنواع) · خيارات · لوحات محفوظة.
// محرك تجميع حقيقي من بيانات فعلية (بلا SQL حر، بلا بيانات تجريبية).
// ثنائي اللغة عبر t() من LanguageContext · الحفظ على localStorage (مزامنة سحابية لاحقًا).
// =============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Database, Search, BarChart3, BarChart2, LineChart as LineIcn, AreaChart,
  PieChart, CircleDashed, ScatterChart, Hash, Table as TableIcn, Settings2,
  Plus, Trash2, Save, Copy, FolderOpen, X, RefreshCw, GripVertical, Maximize2, Hash as HashIcn,
} from "lucide-react";
import { useLang } from "../../context/LanguageContext";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../lib/supabase";
import * as DB from "../lib/accountingDb";
import { money, fmtInt, CARD, EmptyState, Loading } from "./reportingKit";

// ── أنواع ──────────────────────────────────────────────────────────────────
type FType = "text" | "number" | "currency" | "date" | "category";
type Field = { key: string; en: string; ar: string; type: FType; measure?: boolean };
type Row = Record<string, any>;
type Src = { id: string; en: string; ar: string; fields: Field[]; load: (ctx: LoadCtx) => Promise<Row[]> };
type LoadCtx = { orgId: number; from: string; to: string; branchId: number | null; shopIds: number[]; branchName: (id: number | null) => string };
type ChartType = "kpi" | "table" | "bar" | "column" | "line" | "area" | "pie" | "donut" | "scatter";
type Agg = "SUM" | "COUNT" | "AVG" | "MIN" | "MAX";
type Cfg = {
  srcId: string; chart: ChartType; dim: string; meas: string; agg: Agg;
  dateGroup: "day" | "month" | "year"; topN: number; sortDir: "desc" | "asc";
  xMeas: string; yMeas: string; title: string; palette: number; legend: boolean; values: boolean;
};
type Widget = { id: string; cfg: Cfg; w: 1 | 2 };

const PALETTES = [
  ["#3b82f6", "#10b981", "#f59e0b", "#a855f7", "#ef4444", "#06b6d4", "#ec4899", "#64748b"],
  ["#6366f1", "#14b8a6", "#f97316", "#8b5cf6", "#e11d48", "#0ea5e9", "#db2777", "#475569"],
  ["#10b981", "#059669", "#34d399", "#6ee7b7", "#a7f3d0", "#047857", "#065f46", "#064e3b"],
];
const COUNT_KEY = "__count";

// ── مصادر البيانات الموثّقة ──────────────────────────────────────────────────
const SOURCES: Src[] = [
  {
    id: "sales", en: "Sales Invoices", ar: "فواتير المبيعات",
    fields: [
      { key: "date", en: "Date", ar: "التاريخ", type: "date" },
      { key: "branch", en: "Branch", ar: "الفرع", type: "category" },
      { key: "customer", en: "Customer", ar: "العميل", type: "text" },
      { key: "payment", en: "Payment type", ar: "نوع الدفع", type: "category" },
      { key: "total", en: "Total", ar: "الإجمالي", type: "currency", measure: true },
      { key: "subtotal", en: "Net (excl. VAT)", ar: "الصافي", type: "currency", measure: true },
      { key: "tax", en: "VAT", ar: "الضريبة", type: "currency", measure: true },
    ],
    load: async ({ orgId, from, to, branchId, branchName }) => {
      const inv = await DB.fetchSalesInvoices(orgId, from, to, branchId);
      return inv.filter((s) => (s.status || "") !== "cancelled").map((s) => ({
        date: s.date, branch: branchName(s.branch_id), customer: s.customer_name || "—",
        payment: s.payment_type, total: Number(s.total) || 0, subtotal: Number(s.subtotal) || 0, tax: Number(s.tax_amount) || 0,
      }));
    },
  },
  {
    id: "purchases", en: "Purchase Invoices", ar: "فواتير المشتريات",
    fields: [
      { key: "date", en: "Date", ar: "التاريخ", type: "date" },
      { key: "branch", en: "Branch", ar: "الفرع", type: "category" },
      { key: "supplier", en: "Supplier", ar: "المورد", type: "text" },
      { key: "kind", en: "Kind", ar: "النوع", type: "category" },
      { key: "total", en: "Total", ar: "الإجمالي", type: "currency", measure: true },
      { key: "subtotal", en: "Net (excl. VAT)", ar: "الصافي", type: "currency", measure: true },
      { key: "tax", en: "VAT", ar: "الضريبة", type: "currency", measure: true },
    ],
    load: async ({ orgId, from, to, branchId, branchName }) => {
      const inv = await DB.fetchPurchaseInvoices(orgId, from, to, branchId);
      return inv.filter((p) => (p.status || "") !== "cancelled").map((p) => ({
        date: p.date, branch: branchName(p.branch_id), supplier: p.supplier_name || "—",
        kind: p.purchase_kind, total: Number(p.total) || 0, subtotal: Number(p.subtotal) || 0, tax: Number(p.tax_amount) || 0,
      }));
    },
  },
  {
    id: "inventory", en: "Inventory", ar: "المخزون",
    fields: [
      { key: "name", en: "Product", ar: "الصنف", type: "text" },
      { key: "category", en: "Category", ar: "التصنيف", type: "category" },
      { key: "brand", en: "Brand", ar: "العلامة", type: "category" },
      { key: "quantity", en: "Quantity", ar: "الكمية", type: "number", measure: true },
      { key: "cost", en: "Unit cost", ar: "التكلفة", type: "currency", measure: true },
      { key: "value", en: "Stock value", ar: "قيمة المخزون", type: "currency", measure: true },
    ],
    load: async ({ shopIds }) => {
      if (!shopIds.length) return [];
      const { data } = await supabase.from("products").select("product_name, category, brand, quantity, price, shop_id").in("shop_id", shopIds);
      return ((data || []) as any[]).map((p) => ({
        name: p.product_name, category: p.category || "—", brand: p.brand || "—",
        quantity: Number(p.quantity) || 0, cost: Number(p.price) || 0, value: (Number(p.quantity) || 0) * (Number(p.price) || 0),
      }));
    },
  },
  {
    id: "stock_moves", en: "Stock Movements", ar: "حركات المخزون",
    fields: [
      { key: "date", en: "Date", ar: "التاريخ", type: "date" },
      { key: "move_type", en: "Movement", ar: "نوع الحركة", type: "category" },
      { key: "qty", en: "Quantity", ar: "الكمية", type: "number", measure: true },
      { key: "cost", en: "Unit cost", ar: "التكلفة", type: "currency", measure: true },
    ],
    load: async ({ orgId, from, to, branchId }) => {
      let q = supabase.from("gl_stock_moves").select("created_at, move_type, qty, unit_cost").eq("organization_id", orgId)
        .gte("created_at", from).lte("created_at", to + "T23:59:59");
      if (branchId != null) q = q.eq("branch_id", branchId);
      const { data } = await q.limit(5000);
      return ((data || []) as any[]).map((m) => ({ date: String(m.created_at).slice(0, 10), move_type: m.move_type, qty: Math.abs(Number(m.qty) || 0), cost: Number(m.unit_cost) || 0 }));
    },
  },
  {
    id: "journal", en: "Journal Lines", ar: "سطور القيود",
    fields: [
      { key: "date", en: "Date", ar: "التاريخ", type: "date" },
      { key: "account", en: "Account", ar: "الحساب", type: "category" },
      { key: "type", en: "Account type", ar: "نوع الحساب", type: "category" },
      { key: "entry_type", en: "Source", ar: "المصدر", type: "category" },
      { key: "debit", en: "Debit", ar: "مدين", type: "currency", measure: true },
      { key: "credit", en: "Credit", ar: "دائن", type: "currency", measure: true },
    ],
    load: async ({ orgId, from, to, branchId }) => {
      const [entries, accounts] = await Promise.all([DB.fetchEntries(orgId, from, to, branchId), DB.fetchAccounts(orgId)]);
      const accById = new Map(accounts.map((a) => [a.id, a] as const));
      const out: Row[] = [];
      for (const e of entries) {
        if ((e.status || "posted") !== "posted") continue;
        for (const l of e.lines || []) {
          const a = accById.get(l.account_id);
          out.push({ date: e.date, account: a?.name || String(l.account_id), type: a?.type || "—", entry_type: DB.ENTRY_TYPE_LABEL[e.entry_type || "general"] || e.entry_type, debit: Number(l.debit) || 0, credit: Number(l.credit) || 0 });
        }
      }
      return out;
    },
  },
];
const srcById = (id: string) => SOURCES.find((s) => s.id === id)!;

// ── محرك التجميع ─────────────────────────────────────────────────────────────
const bucketDate = (v: string, g: string) => (g === "year" ? v.slice(0, 4) : g === "month" ? v.slice(0, 7) : v.slice(0, 10));
function aggregate(rows: Row[], cfg: Cfg, dimField?: Field): { label: string; value: number }[] {
  const groups = new Map<string, number[]>();
  for (const r of rows) {
    let key: any = cfg.dim ? r[cfg.dim] : "—";
    if (dimField?.type === "date" && key) key = bucketDate(String(key), cfg.dateGroup);
    key = key == null || key === "" ? "—" : String(key);
    const arr = groups.get(key) || [];
    arr.push(cfg.meas === COUNT_KEY ? 1 : Number(r[cfg.meas]) || 0);
    groups.set(key, arr);
  }
  let out = Array.from(groups.entries()).map(([label, vals]) => {
    let value = 0;
    if (cfg.agg === "COUNT" || cfg.meas === COUNT_KEY) value = vals.length;
    else if (cfg.agg === "SUM") value = vals.reduce((s, v) => s + v, 0);
    else if (cfg.agg === "AVG") value = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
    else if (cfg.agg === "MIN") value = Math.min(...vals);
    else if (cfg.agg === "MAX") value = Math.max(...vals);
    return { label, value };
  });
  const isDate = dimField?.type === "date";
  out.sort((a, b) => (isDate ? a.label.localeCompare(b.label) : cfg.sortDir === "asc" ? a.value - b.value : b.value - a.value));
  if (cfg.topN > 0 && !isDate) out = out.slice(0, cfg.topN);
  return out;
}

// ── كاش تحميل المصادر (يمنع تكرار الطلبات لنفس الفترة) ───────────────────────
const SRC_CACHE = new Map<string, Promise<Row[]>>();
const loadSource = (src: Src, ctx: LoadCtx) => {
  const key = `${src.id}|${ctx.from}|${ctx.to}|${ctx.branchId}|${ctx.shopIds.join(",")}`;
  if (!SRC_CACHE.has(key)) SRC_CACHE.set(key, src.load(ctx));
  return SRC_CACHE.get(key)!;
};

// ── عرض الرسم ────────────────────────────────────────────────────────────────
function ChartView({ data, cfg, rows, dimField, t }: { data: { label: string; value: number }[]; cfg: Cfg; rows: Row[]; dimField?: Field; t: (e: string, a: string) => string }) {
  const pal = PALETTES[cfg.palette % PALETTES.length];
  const fmtV = (n: number) => (srcById(cfg.srcId).fields.find((f) => f.key === cfg.meas)?.type === "currency" ? money(n) : fmtInt(Math.round(n * 100) / 100));
  if (cfg.chart !== "kpi" && cfg.chart !== "scatter" && cfg.chart !== "table" && !data.length) return <EmptyState label={t("No data for this selection.", "لا توجد بيانات لهذا الاختيار.")} />;

  // KPI
  if (cfg.chart === "kpi") {
    const total = cfg.meas === COUNT_KEY ? rows.length : rows.reduce((s, r) => s + (Number(r[cfg.meas]) || 0), 0);
    const val = cfg.agg === "AVG" && rows.length ? total / rows.length : cfg.agg === "COUNT" || cfg.meas === COUNT_KEY ? rows.length : total;
    return <div className="flex flex-col items-center justify-center py-8"><div className="text-4xl font-black [direction:ltr]" style={{ color: pal[0] }}>{fmtV(val)}</div><div className="text-xs text-slate-500 mt-1">{cfg.title || t("KPI", "مؤشر")}</div></div>;
  }
  // Table
  if (cfg.chart === "table") {
    const cols = cfg.dim ? [{ k: "label", l: dimField ? t(dimField.en, dimField.ar) : "—" }, { k: "value", l: t("Value", "القيمة") }] : [];
    return (
      <div className="overflow-auto max-h-[320px]"><table className="w-full text-xs text-right border-collapse">
        <thead><tr className="bg-slate-950/50 text-slate-500 text-[10px] sticky top-0">{cols.map((c) => <th key={c.k} className="px-3 py-2 font-bold">{c.l}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-800/60">{data.map((d, i) => <tr key={i}><td className="px-3 py-2 text-slate-200">{d.label}</td><td className="px-3 py-2 font-mono [direction:ltr] text-slate-300">{fmtV(d.value)}</td></tr>)}</tbody>
      </table></div>
    );
  }
  // Pie / Donut
  if (cfg.chart === "pie" || cfg.chart === "donut") {
    const total = data.reduce((s, d) => s + d.value, 0); if (!total) return <EmptyState />;
    const size = 190, R = size / 2 - 10, C = 2 * Math.PI * R, sw = cfg.chart === "donut" ? 24 : R; let off = 0;
    return (
      <div className="flex items-center gap-4 flex-wrap justify-center py-2">
        <svg viewBox={`0 0 ${size} ${size}`} style={{ width: size, height: size }}>
          <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>{data.map((d, i) => { const len = C * (d.value / total); const r = cfg.chart === "donut" ? R : R / 2; const cc = cfg.chart === "donut" ? C : 2 * Math.PI * r; const l2 = cc * (d.value / total); const el = <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={pal[i % pal.length]} strokeWidth={sw} strokeDasharray={`${cfg.chart === "donut" ? len : l2} ${(cfg.chart === "donut" ? C : cc) - (cfg.chart === "donut" ? len : l2)}`} strokeDashoffset={-off} />; off += cfg.chart === "donut" ? len : l2; return el; })}</g>
        </svg>
        {cfg.legend && <div className="space-y-1 text-xs">{data.map((d, i) => <div key={i} className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: pal[i % pal.length] }} /><span className="text-slate-400">{d.label}</span><span className="text-slate-300 font-mono [direction:ltr] mr-1">{fmtV(d.value)}</span></div>)}</div>}
      </div>
    );
  }
  // Scatter
  if (cfg.chart === "scatter") {
    const xf = cfg.xMeas || cfg.meas, yf = cfg.yMeas || cfg.meas;
    const pts = rows.slice(0, 400).map((r) => ({ x: Number(r[xf]) || 0, y: Number(r[yf]) || 0 }));
    if (!pts.length) return <EmptyState />;
    const maxX = Math.max(...pts.map((p) => p.x), 1), maxY = Math.max(...pts.map((p) => p.y), 1);
    const W = 420, H = 240, pad = 30;
    return <svg viewBox={`0 0 ${W} ${H}`} className="w-full">{[0, .5, 1].map((g, i) => <line key={i} x1={pad} x2={W - pad} y1={pad + g * (H - 2 * pad)} y2={pad + g * (H - 2 * pad)} stroke="#1e293b" />)}{pts.map((p, i) => <circle key={i} cx={pad + (p.x / maxX) * (W - 2 * pad)} cy={H - pad - (p.y / maxY) * (H - 2 * pad)} r="3.5" fill={pal[0]} fillOpacity="0.6" />)}</svg>;
  }
  // Bar (horizontal) / Column (vertical) / Line / Area
  const max = Math.max(...data.map((d) => d.value), 1);
  if (cfg.chart === "bar") {
    return <div className="space-y-2.5 py-1">{data.map((d, i) => <div key={i}><div className="flex justify-between text-xs mb-1 gap-2"><span className="text-slate-300 truncate">{d.label}</span>{cfg.values && <span className="text-slate-200 font-bold font-mono [direction:ltr] shrink-0">{fmtV(d.value)}</span>}</div><div className="h-2.5 rounded-full bg-slate-800 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.max(2, (d.value / max) * 100)}%`, background: pal[i % pal.length] }} /></div></div>)}</div>;
  }
  // column / line / area → SVG
  const W = Math.max(data.length * 46, 320), H = 230, pad = 30;
  const x = (i: number) => pad + (i * (W - 2 * pad)) / Math.max(1, data.length - 1);
  const y = (v: number) => H - pad - (v / max) * (H - 2 * pad);
  return (
    <div className="overflow-x-auto"><svg viewBox={`0 0 ${W} ${H}`} style={{ minWidth: W }} className="w-full">
      {[0, .25, .5, .75, 1].map((g, i) => <line key={i} x1={pad} x2={W - pad} y1={pad + g * (H - 2 * pad)} y2={pad + g * (H - 2 * pad)} stroke="#1e293b" />)}
      {cfg.chart === "column" && data.map((d, i) => { const bw = Math.min(28, (W - 2 * pad) / data.length - 6); return <rect key={i} x={x(i) - bw / 2} y={y(d.value)} width={bw} height={H - pad - y(d.value)} rx="3" fill={pal[i % pal.length]} />; })}
      {cfg.chart === "area" && <path d={`M${x(0)},${H - pad} ` + data.map((d, i) => `L${x(i)},${y(d.value)}`).join(" ") + ` L${x(data.length - 1)},${H - pad} Z`} fill={pal[0]} fillOpacity="0.18" />}
      {(cfg.chart === "line" || cfg.chart === "area") && <path d={data.map((d, i) => `${i ? "L" : "M"}${x(i)},${y(d.value)}`).join(" ")} fill="none" stroke={pal[0]} strokeWidth="2.5" />}
      {(cfg.chart === "line" || cfg.chart === "area") && data.map((d, i) => <circle key={i} cx={x(i)} cy={y(d.value)} r="3" fill={pal[0]} />)}
      {data.map((d, i) => <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="8" fill="#64748b">{d.label.length > 7 ? d.label.slice(0, 7) : d.label}</text>)}
    </svg></div>
  );
}

const CHART_TYPES: { k: ChartType; en: string; ar: string; icon: any }[] = [
  { k: "kpi", en: "KPI", ar: "مؤشر", icon: Hash },
  { k: "table", en: "Table", ar: "جدول", icon: TableIcn },
  { k: "bar", en: "Bar", ar: "أعمدة أفقية", icon: BarChart3 },
  { k: "column", en: "Column", ar: "أعمدة", icon: BarChart2 },
  { k: "line", en: "Line", ar: "خط", icon: LineIcn },
  { k: "area", en: "Area", ar: "مساحة", icon: AreaChart },
  { k: "pie", en: "Pie", ar: "دائري", icon: PieChart },
  { k: "donut", en: "Donut", ar: "دونت", icon: CircleDashed },
  { k: "scatter", en: "Scatter", ar: "مبعثر", icon: ScatterChart },
];

const defaultCfg = (srcId: string): Cfg => {
  const s = srcById(srcId); const dim = s.fields.find((f) => !f.measure)?.key || ""; const meas = s.fields.find((f) => f.measure)?.key || COUNT_KEY;
  return { srcId, chart: "bar", dim, meas, agg: "SUM", dateGroup: "month", topN: 10, sortDir: "desc", xMeas: "", yMeas: "", title: "", palette: 0, legend: true, values: true };
};

export default function ReportBuilderPage() {
  const { t, isRTL } = useLang();
  const { ownedShopId, branches } = (useAuth() as any) ?? {};
  const branchList: { id: number; name: string }[] = Array.isArray(branches) ? branches : [];
  const branchName = useCallback((id: number | null) => (id == null ? t("General", "عام") : branchList.find((b) => b.id === id)?.name || "—"), [branches, t]);

  const [org, setOrg] = useState<{ id: number; name: string } | null>(null);
  const [from, setFrom] = useState(new Date().toISOString().slice(0, 8) + "01");
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [fBranch, setFBranch] = useState<string>("");
  const [cfg, setCfg] = useState<Cfg>(defaultCfg("sales"));
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [fieldQ, setFieldQ] = useState("");
  const [dashboards, setDashboards] = useState<Record<string, Widget[]>>(() => { try { return JSON.parse(localStorage.getItem("mihwar_rb_dash") || "{}"); } catch { return {}; } });
  const [curDash, setCurDash] = useState<string>("");
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const dragIx = useRef<number | null>(null);

  const branchId = fBranch ? Number(fBranch) : null;
  const shopIds = useMemo(() => (branchId ? [branchId] : branchList.map((b) => b.id)), [branchId, branchList]);
  const src = srcById(cfg.srcId);
  const dimField = src.fields.find((f) => f.key === cfg.dim);
  const ctx: LoadCtx = useMemo(() => ({ orgId: org?.id || 0, from, to, branchId, shopIds, branchName }), [org, from, to, branchId, shopIds, branchName]);

  useEffect(() => { let a = true; (async () => { const o = await DB.getOrgForBranch(ownedShopId ?? null); if (a) setOrg(o); })(); return () => { a = false; }; }, [ownedShopId]);
  // مسح الكاش عند تغيّر الفترة/الفرع
  useEffect(() => { SRC_CACHE.clear(); }, [from, to, fBranch]);

  const run = useCallback(async () => {
    if (!org) return; setLoading(true);
    try { const data = await loadSource(src, ctx); setRows(data); } finally { setLoading(false); }
  }, [org, src, ctx]);
  useEffect(() => { run(); }, [run]);

  const data = useMemo(() => aggregate(rows, cfg, dimField), [rows, cfg, dimField]);
  const set = (p: Partial<Cfg>) => setCfg((c) => ({ ...c, ...p }));
  const saveDash = (name: string, ws: Widget[]) => setDashboards((d) => { const n = { ...d, [name]: ws }; try { localStorage.setItem("mihwar_rb_dash", JSON.stringify(n)); } catch { /* */ } return n; });

  const addWidget = () => setWidgets((w) => [...w, { id: Math.random().toString(36).slice(2), cfg: { ...cfg }, w: 1 }]);
  const removeWidget = (id: string) => setWidgets((w) => w.filter((x) => x.id !== id));
  const resizeWidget = (id: string) => setWidgets((w) => w.map((x) => (x.id === id ? { ...x, w: x.w === 1 ? 2 : 1 } : x)));
  const onDrop = (i: number) => { const from2 = dragIx.current; if (from2 == null || from2 === i) return; setWidgets((w) => { const n = [...w]; const [m] = n.splice(from2, 1); n.splice(i, 0, m); return n; }); dragIx.current = null; };

  const doSave = () => { const name = curDash || window.prompt(t("Dashboard name", "اسم اللوحة") || "") || ""; if (!name.trim()) return; saveDash(name.trim(), widgets); setCurDash(name.trim()); };
  const doLoad = (name: string) => { setWidgets(dashboards[name] || []); setCurDash(name); };
  const doDuplicate = () => { if (!curDash) return; const nn = `${curDash} (${t("copy", "نسخة")})`; saveDash(nn, widgets); setCurDash(nn); };
  const doDelete = () => { if (!curDash) return; if (!window.confirm(t("Delete this dashboard?", "حذف هذه اللوحة؟"))) return; setDashboards((d) => { const n = { ...d }; delete n[curDash]; try { localStorage.setItem("mihwar_rb_dash", JSON.stringify(n)); } catch { /* */ } return n; }); setCurDash(""); setWidgets([]); };

  const fields = src.fields.filter((f) => !fieldQ || `${f.en} ${f.ar}`.toLowerCase().includes(fieldQ.toLowerCase()));
  const dims = fields.filter((f) => !f.measure), meas = fields.filter((f) => f.measure);
  const inp = "bg-slate-950 border border-slate-700 rounded-lg text-white px-2.5 py-1.5 text-xs outline-none focus:border-blue-500";
  const lbl = "text-[10px] text-slate-500 font-bold block mb-1";

  return (
    <div className="p-4 lg:p-6 min-h-screen" dir={isRTL ? "rtl" : "ltr"}>
      <header className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <span className="w-11 h-11 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-400"><Settings2 size={22} /></span>
          <div><h1 className="text-2xl font-black text-white leading-tight">{t("Report Builder", "مُنشئ التقارير")}</h1>
            <p className="text-slate-500 text-xs mt-0.5">{t("Explore your data, build a chart, and pin it to a dashboard.", "استكشف بياناتك، ابنِ رسمًا، وثبّته في لوحة.")}</p></div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div><label className={lbl}>{t("From", "من")}</label><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inp + " [color-scheme:dark]"} /></div>
          <div><label className={lbl}>{t("To", "إلى")}</label><input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inp + " [color-scheme:dark]"} /></div>
          {branchList.length > 1 && <div><label className={lbl}>{t("Branch", "الفرع")}</label><select value={fBranch} onChange={(e) => setFBranch(e.target.value)} className={inp}><option value="">{t("All branches", "كل الفروع")}</option>{branchList.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>}
          <button onClick={run} className="p-2 rounded-lg border border-slate-800 bg-slate-900 text-slate-400 hover:text-white"><RefreshCw size={15} className={loading ? "animate-spin text-blue-500" : ""} /></button>
        </div>
      </header>

      {!org ? <div className={`${CARD} p-10 text-center text-amber-400 text-sm`}>{t("Current branch is not linked to an organization.", "الفرع الحالي غير مرتبط بمؤسسة.")}</div> : (
        <>
          {/* 3 لوحات */}
          <div className="grid grid-cols-1 lg:grid-cols-[230px_1fr_260px] gap-3">
            {/* يسار: مستكشف البيانات */}
            <div className={`${CARD} p-3 h-fit`}>
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-300 mb-2"><Database size={14} className="text-blue-400" /> {t("Data Explorer", "مستكشف البيانات")}</div>
              <select value={cfg.srcId} onChange={(e) => setCfg(defaultCfg(e.target.value))} className={inp + " w-full mb-2"}>{SOURCES.map((s) => <option key={s.id} value={s.id}>{t(s.en, s.ar)}</option>)}</select>
              <div className="relative mb-2"><Search size={13} className="absolute top-1/2 -translate-y-1/2 start-2 text-slate-500" /><input value={fieldQ} onChange={(e) => setFieldQ(e.target.value)} placeholder={t("Search fields…", "ابحث عن حقل…")} className={inp + " w-full ps-7"} /></div>
              <div className="text-[10px] font-bold text-slate-500 mb-1">{t("Dimensions", "الأبعاد")}</div>
              <div className="space-y-1 mb-2">{dims.map((f) => <button key={f.key} onClick={() => set({ dim: f.key })} className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs text-right ${cfg.dim === f.key ? "bg-blue-600/20 text-blue-200 border border-blue-500/40" : "bg-slate-800/40 text-slate-300 hover:bg-slate-800"}`}><GripVertical size={11} className="text-slate-600" /> {t(f.en, f.ar)}</button>)}</div>
              <div className="text-[10px] font-bold text-slate-500 mb-1">{t("Measures", "القياسات")}</div>
              <div className="space-y-1">
                {meas.map((f) => <button key={f.key} onClick={() => set({ meas: f.key })} className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs text-right ${cfg.meas === f.key ? "bg-emerald-600/20 text-emerald-200 border border-emerald-500/40" : "bg-slate-800/40 text-slate-300 hover:bg-slate-800"}`}><HashIcn size={11} className="text-slate-600" /> {t(f.en, f.ar)}</button>)}
                <button onClick={() => set({ meas: COUNT_KEY, agg: "COUNT" })} className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs text-right ${cfg.meas === COUNT_KEY ? "bg-emerald-600/20 text-emerald-200 border border-emerald-500/40" : "bg-slate-800/40 text-slate-300 hover:bg-slate-800"}`}><HashIcn size={11} className="text-slate-600" /> {t("Count of rows", "عدد السجلات")}</button>
              </div>
            </div>

            {/* وسط: منشئ الرسم + معاينة حية */}
            <div className={`${CARD} p-3`}>
              <div className="flex items-center gap-1.5 flex-wrap mb-3">{CHART_TYPES.map((c) => { const CI = c.icon; return <button key={c.k} onClick={() => set({ chart: c.k })} title={t(c.en, c.ar)} className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border ${cfg.chart === c.k ? "bg-blue-600 text-white border-blue-500" : "bg-slate-800/40 text-slate-400 border-slate-700 hover:text-white"}`}><CI size={13} /> {t(c.en, c.ar)}</button>; })}</div>
              <div className="min-h-[300px] flex flex-col">
                <div className="text-sm font-bold text-slate-200 mb-2">{cfg.title || `${t(src.en, src.ar)} — ${dimField ? t(dimField.en, dimField.ar) : ""}`}</div>
                {loading ? <Loading /> : <ChartView data={data} cfg={cfg} rows={rows} dimField={dimField} t={t} />}
              </div>
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-800">
                <span className="text-[11px] text-slate-500">{t("Rows", "سجلات")}: {fmtInt(rows.length)}</span>
                <button onClick={addWidget} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-500"><Plus size={14} /> {t("Add to dashboard", "أضف إلى اللوحة")}</button>
              </div>
            </div>

            {/* يمين: الخيارات */}
            <div className={`${CARD} p-3 h-fit space-y-2.5`}>
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-300"><Settings2 size={14} className="text-blue-400" /> {t("Options", "الخيارات")}</div>
              <div><label className={lbl}>{t("Title", "العنوان")}</label><input value={cfg.title} onChange={(e) => set({ title: e.target.value })} placeholder={t("Chart title", "عنوان الرسم")} className={inp + " w-full"} /></div>
              {cfg.chart === "scatter" ? (
                <>
                  <div><label className={lbl}>{t("X measure", "قياس X")}</label><select value={cfg.xMeas || cfg.meas} onChange={(e) => set({ xMeas: e.target.value })} className={inp + " w-full"}>{src.fields.filter((f) => f.measure).map((f) => <option key={f.key} value={f.key}>{t(f.en, f.ar)}</option>)}</select></div>
                  <div><label className={lbl}>{t("Y measure", "قياس Y")}</label><select value={cfg.yMeas || cfg.meas} onChange={(e) => set({ yMeas: e.target.value })} className={inp + " w-full"}>{src.fields.filter((f) => f.measure).map((f) => <option key={f.key} value={f.key}>{t(f.en, f.ar)}</option>)}</select></div>
                </>
              ) : (
                <>
                  {cfg.chart !== "kpi" && <div><label className={lbl}>{t("Group by", "التجميع حسب")}</label><select value={cfg.dim} onChange={(e) => set({ dim: e.target.value })} className={inp + " w-full"}>{src.fields.filter((f) => !f.measure).map((f) => <option key={f.key} value={f.key}>{t(f.en, f.ar)}</option>)}</select></div>}
                  <div><label className={lbl}>{t("Aggregation", "الدالة")}</label><select value={cfg.agg} onChange={(e) => set({ agg: e.target.value as Agg })} className={inp + " w-full"}>{(["SUM", "COUNT", "AVG", "MIN", "MAX"] as Agg[]).map((a) => <option key={a} value={a}>{a}</option>)}</select></div>
                  {dimField?.type === "date" && <div><label className={lbl}>{t("Date grouping", "تجميع التاريخ")}</label><select value={cfg.dateGroup} onChange={(e) => set({ dateGroup: e.target.value as any })} className={inp + " w-full"}><option value="day">{t("Day", "يوم")}</option><option value="month">{t("Month", "شهر")}</option><option value="year">{t("Year", "سنة")}</option></select></div>}
                  {cfg.chart !== "kpi" && <div className="grid grid-cols-2 gap-2"><div><label className={lbl}>{t("Top N", "أعلى N")}</label><input type="number" min={0} value={cfg.topN} onChange={(e) => set({ topN: Number(e.target.value) || 0 })} className={inp + " w-full"} /></div><div><label className={lbl}>{t("Sort", "الترتيب")}</label><select value={cfg.sortDir} onChange={(e) => set({ sortDir: e.target.value as any })} className={inp + " w-full"}><option value="desc">{t("High→Low", "تنازلي")}</option><option value="asc">{t("Low→High", "تصاعدي")}</option></select></div></div>}
                </>
              )}
              <div><label className={lbl}>{t("Palette", "لوحة الألوان")}</label><div className="flex gap-1.5">{PALETTES.map((p, i) => <button key={i} onClick={() => set({ palette: i })} className={`flex-1 h-7 rounded-lg border-2 ${cfg.palette === i ? "border-white" : "border-transparent"}`} style={{ background: `linear-gradient(90deg,${p[0]},${p[1]},${p[2]})` }} />)}</div></div>
              <div className="flex gap-3 pt-1">
                <label className="flex items-center gap-1.5 text-xs text-slate-400"><input type="checkbox" checked={cfg.legend} onChange={(e) => set({ legend: e.target.checked })} className="accent-blue-500" /> {t("Legend", "مفتاح")}</label>
                <label className="flex items-center gap-1.5 text-xs text-slate-400"><input type="checkbox" checked={cfg.values} onChange={(e) => set({ values: e.target.checked })} className="accent-blue-500" /> {t("Values", "القيم")}</label>
              </div>
            </div>
          </div>

          {/* Canvas اللوحة */}
          <div className={`${CARD} p-3 mt-3`}>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-1.5 text-sm font-bold text-slate-200"><FolderOpen size={15} className="text-blue-400" /> {t("Dashboard", "اللوحة")} {curDash && <span className="text-blue-300">· {curDash}</span>}</div>
              <div className="flex flex-wrap items-center gap-1.5">
                <select value={curDash} onChange={(e) => e.target.value && doLoad(e.target.value)} className={inp}><option value="">{t("— open saved —", "— افتح لوحة —")}</option>{Object.keys(dashboards).map((n) => <option key={n} value={n}>{n}</option>)}</select>
                <button onClick={doSave} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] font-bold hover:bg-emerald-500"><Save size={13} /> {t("Save", "حفظ")}</button>
                <button onClick={doDuplicate} disabled={!curDash} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-[11px] font-bold disabled:opacity-40"><Copy size={13} /> {t("Duplicate", "نسخ")}</button>
                <button onClick={doDelete} disabled={!curDash} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-500/10 text-red-400 text-[11px] font-bold disabled:opacity-40"><Trash2 size={13} /> {t("Delete", "حذف")}</button>
              </div>
            </div>
            {widgets.length === 0 ? <EmptyState label={t("No widgets yet — build a chart and click “Add to dashboard”.", "لا عناصر بعد — ابنِ رسمًا واضغط «أضف إلى اللوحة».")} /> : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {widgets.map((w, i) => (
                  <div key={w.id} draggable onDragStart={() => (dragIx.current = i)} onDragOver={(e) => e.preventDefault()} onDrop={() => onDrop(i)}
                    className={`${CARD} p-3 ${w.w === 2 ? "lg:col-span-2" : ""}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-slate-200 truncate">{w.cfg.title || `${t(srcById(w.cfg.srcId).en, srcById(w.cfg.srcId).ar)}`}</span>
                      <div className="flex items-center gap-1">
                        <button onClick={() => resizeWidget(w.id)} title={t("Resize", "تحجيم")} className="w-6 h-6 rounded bg-slate-800 text-slate-400 flex items-center justify-center hover:text-white"><Maximize2 size={12} /></button>
                        <button onClick={() => removeWidget(w.id)} title={t("Remove", "إزالة")} className="w-6 h-6 rounded bg-red-500/10 text-red-400 flex items-center justify-center"><X size={12} /></button>
                      </div>
                    </div>
                    <WidgetView cfg={w.cfg} ctx={ctx} t={t} />
                  </div>
                ))}
              </div>
            )}
            <p className="text-[11px] text-slate-600 mt-3">{t("Dashboards are saved in this browser. Cross-device sync comes with the optional database table.", "اللوحات محفوظة في هذا المتصفح. المزامنة بين الأجهزة تأتي مع جدول قاعدة بيانات اختياري.")}</p>
          </div>
        </>
      )}
    </div>
  );
}

// عنصر اللوحة — يعيد تشغيل استعلامه عند التحميل (مع كاش المصدر)
function WidgetView({ cfg, ctx, t }: { cfg: Cfg; ctx: LoadCtx; t: (e: string, a: string) => string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const src = srcById(cfg.srcId);
  const dimField = src.fields.find((f) => f.key === cfg.dim);
  useEffect(() => { let a = true; (async () => { if (!ctx.orgId) return; const d = await loadSource(src, ctx); if (a) setRows(d); })(); return () => { a = false; }; }, [cfg.srcId, ctx]);
  const data = useMemo(() => (rows ? aggregate(rows, cfg, dimField) : []), [rows, cfg, dimField]);
  if (rows === null) return <Loading label={t("Loading…", "جارٍ التحميل…")} />;
  return <ChartView data={data} cfg={cfg} rows={rows} dimField={dimField} t={t} />;
}
