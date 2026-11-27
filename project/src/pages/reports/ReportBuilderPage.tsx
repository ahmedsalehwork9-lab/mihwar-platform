// =============================================================
// src/pages/reports/ReportBuilderPage.tsx
// مُنشئ التقارير التفاعلي — مستكشف بيانات · منشئ رسوم (9 أنواع) · خيارات · لوحات محفوظة.
// محرك تجميع حقيقي من بيانات فعلية (بلا SQL حر وبلا بيانات تجريبية). ثنائي اللغة · الثيمان.
// اللوحات تُحفظ في هذا المتصفح (لكل مؤسسة) مع تصدير/استيراد JSON للنقل بين الأجهزة — دون أي تغيير في قاعدة البيانات.
// لا نوافذ المتصفح المنبثقة (prompt/confirm): الإدخال والتأكيد داخل الصفحة.
// =============================================================
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Database, Search, BarChart3, BarChart2, LineChart as LineIcn, AreaChart, PieChart, CircleDashed, ScatterChart, Hash, Table as TableIcn, Settings2,
  Plus, Trash2, Save, Copy, FolderOpen, X, GripVertical, Maximize2, ArrowUp, ArrowDown, Upload, Download, Sparkles,
} from "lucide-react";
import { useLang } from "../../context/LanguageContext";
import { useAuth } from "../../context/AuthContext";
import * as DB from "../lib/accountingDb";
import { ymd } from "../alerts/alertsLogic";
import { CARD, EmptyState, INP, Loading, PageHead, PeriodBar, Warn, fmtInt } from "./reportingKit";
import { rangeFor, type RangeKey } from "./reportsLogic";
import { exportBook, stamp } from "./reportsOut";
import { SOURCES, clearSourceCache, loadSource, srcById, type LoadCtx, type LoadRes } from "./builderSources";
import {
  AGGS, COUNT_KEY, PRESETS, aggregate, dashboardsFromJson, dashboardsToJson, defaultCfg, normalizeCfg, normalizeDashboards, uniqueName,
  type Agg, type ChartType, type Cfg, type Dashboards, type Row, type Widget,
} from "./builderLogic";
import { ChartView, PALETTES } from "./BuilderChart";

const CHART_TYPES: { k: ChartType; en: string; ar: string; icon: typeof Hash }[] = [
  { k: "kpi", en: "KPI", ar: "مؤشر", icon: Hash }, { k: "table", en: "Table", ar: "جدول", icon: TableIcn }, { k: "bar", en: "Bar", ar: "أعمدة أفقية", icon: BarChart3 },
  { k: "column", en: "Column", ar: "أعمدة", icon: BarChart2 }, { k: "line", en: "Line", ar: "خط", icon: LineIcn }, { k: "area", en: "Area", ar: "مساحة", icon: AreaChart },
  { k: "pie", en: "Pie", ar: "دائري", icon: PieChart }, { k: "donut", en: "Donut", ar: "دونت", icon: CircleDashed }, { k: "scatter", en: "Scatter", ar: "مبعثر", icon: ScatterChart },
];
const KEYS: RangeKey[] = ["month", "prev_month", "quarter", "year", "last_year", "custom"];
const LEGACY_KEY = "mihwar_rb_dash";
const lsGet = (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k: string, v: string): void => { try { localStorage.setItem(k, v); } catch { /* التخزين المحلي غير متاح */ } };
const newId = (): string => Math.random().toString(36).slice(2, 10);
const lbl = "text-[10px] text-slate-500 font-bold block mb-1";
const sInp = "bg-slate-950 border border-slate-700 rounded-lg text-white px-2.5 py-1.5 text-xs outline-none focus:border-blue-500";

export default function ReportBuilderPage() {
  const { t, lang } = useLang();
  const { ownedShopId, branches } = (useAuth() as unknown as { ownedShopId: number | null; branches: { id: number; name: string }[] }) ?? { ownedShopId: null, branches: [] };
  const branchList = useMemo(() => (Array.isArray(branches) ? branches : []), [branches]);
  const branchName = useCallback((id: number | null) => (id == null ? t("General", "عام") : branchList.find((b) => b.id === id)?.name || "—"), [branchList, t]);

  const today = ymd(new Date());
  const [org, setOrg] = useState<{ id: number; name: string } | null | undefined>(undefined);
  const [range, setRange] = useState<RangeKey>("month");
  const [cFrom, setCFrom] = useState(today.slice(0, 8) + "01");
  const [cTo, setCTo] = useState(today);
  const [fBranch, setFBranch] = useState("");
  const [cfg, setCfg] = useState<Cfg>(() => defaultCfg("sales", srcById("sales").fields));
  const [res, setRes] = useState<LoadRes | null>(null);
  const [loading, setLoading] = useState(false);
  const [fieldQ, setFieldQ] = useState("");
  const [dashboards, setDashboards] = useState<Dashboards>({});
  const [curDash, setCurDash] = useState("");
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [dirty, setDirty] = useState(false);
  const [naming, setNaming] = useState<null | "save" | "copy">(null);
  const [nameVal, setNameVal] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; msg: string } | null>(null);
  const dragIx = useRef<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  const { from, to } = useMemo(() => rangeFor(range, today, { from: cFrom, to: cTo }), [range, today, cFrom, cTo]);
  const branchId = fBranch ? Number(fBranch) : null;
  const shopIds = useMemo(() => (branchId ? [branchId] : branchList.length ? branchList.map((b) => b.id) : ownedShopId ? [ownedShopId] : []), [branchId, branchList, ownedShopId]);
  const src = srcById(cfg.srcId);
  const dimField = src.fields.find((f) => f.key === cfg.dim);
  const measField = src.fields.find((f) => f.key === cfg.meas);
  const ctx: LoadCtx = useMemo(() => ({ orgId: org?.id || 0, from, to, branchId, shopIds, branchName, lang }), [org, from, to, branchId, shopIds, branchName, lang]);
  const storeKey = org ? `${LEGACY_KEY}:${org.id}` : "";

  useEffect(() => { let a = true; (async () => { const o = await DB.getOrgForBranch(ownedShopId ?? null); if (a) setOrg(o); })(); return () => { a = false; }; }, [ownedShopId]);
  // تحميل اللوحات المحفوظة لهذه المؤسسة (مع ترحيل المفتاح القديم مرة واحدة)
  useEffect(() => {
    if (!org) return; let raw = lsGet(storeKey); let migrated = false; if (raw == null) { raw = lsGet(LEGACY_KEY); migrated = raw != null; }
    let parsed: unknown = {}; try { parsed = raw ? JSON.parse(raw) : {}; } catch { parsed = {}; }
    const d = normalizeDashboards(parsed, SOURCES); setDashboards(d); if (migrated) lsSet(storeKey, JSON.stringify(d));
  }, [org, storeKey]);

  const run = useCallback(async () => {
    if (!org) return; const my = ++seq.current; setLoading(true); const r = await loadSource(src, ctx); if (my === seq.current) { setRes(r); setLoading(false); }
  }, [org, src, ctx]);
  useEffect(() => { void run(); }, [run]);
  const refresh = () => { clearSourceCache(); void run(); setWidgets((w) => [...w]); };

  const rows: Row[] = res?.rows ?? [];
  const data = useMemo(() => aggregate(rows, cfg, dimField), [rows, cfg, dimField]);
  const set = (p: Partial<Cfg>) => setCfg((c) => ({ ...c, ...p }));
  const dimLabel = dimField ? t(dimField.en, dimField.ar) : "";

  const persist = (n: Dashboards) => { setDashboards(n); if (storeKey) lsSet(storeKey, JSON.stringify(n)); };
  const touch = (fn: (w: Widget[]) => Widget[]) => { setWidgets(fn); setDirty(true); };
  const addWidget = () => touch((w) => [...w, { id: newId(), cfg: { ...cfg }, w: 1 }]);
  const doSaveAs = (name: string) => { const n = name.trim().slice(0, 60); if (!n) return; persist({ ...dashboards, [n]: widgets }); setCurDash(n); setDirty(false); setNaming(null); setNotice({ ok: true, msg: t("Dashboard saved in this browser.", "تم حفظ اللوحة في هذا المتصفح.") }); };
  const doSave = () => { if (curDash) { persist({ ...dashboards, [curDash]: widgets }); setDirty(false); setNotice({ ok: true, msg: t("Dashboard saved in this browser.", "تم حفظ اللوحة في هذا المتصفح.") }); } else { setNameVal(""); setNaming("save"); } };
  const doLoad = (name: string) => { setWidgets(dashboards[name] || []); setCurDash(name); setDirty(false); setConfirmDel(false); setNaming(null); };
  const doCopy = (name: string) => { const n = uniqueName(name.trim().slice(0, 60) || `${curDash} (${t("copy", "نسخة")})`, Object.keys(dashboards)); persist({ ...dashboards, [n]: widgets }); setCurDash(n); setDirty(false); setNaming(null); };
  const doDelete = () => { const n = { ...dashboards }; delete n[curDash]; persist(n); setCurDash(""); setWidgets([]); setDirty(false); setConfirmDel(false); };
  const move = (i: number, d: -1 | 1) => touch((w) => { const j = i + d; if (j < 0 || j >= w.length) return w; const n = [...w]; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const onDrop = (i: number) => { const f = dragIx.current; dragIx.current = null; if (f == null || f === i) return; touch((w) => { const n = [...w]; const [m] = n.splice(f, 1); n.splice(i, 0, m); return n; }); };
  const applyPreset = (id: string) => { const p = PRESETS.find((x) => x.id === id); if (!p) return; const s = srcById(p.cfg.srcId); const c = normalizeCfg({ ...defaultCfg(s.id, s.fields), ...p.cfg }, SOURCES); if (c) setCfg(c); };

  const exportData = () => {
    const meas = measField ? t(measField.en, measField.ar) : t("Count", "العدد");
    exportBook(`report-builder-${src.id}-${stamp()}`, [
      { name: t("Chart data", "بيانات الرسم"), cols: [dimLabel || t("Group", "المجموعة"), `${meas} (${cfg.meas === COUNT_KEY ? "COUNT" : cfg.agg})`], rows: data.map((d) => [d.label, d.value]) },
      { name: t("Source rows", "سجلات المصدر"), cols: src.fields.map((f) => t(f.en, f.ar)), rows: rows.slice(0, 20000).map((r) => src.fields.map((f) => { const v = r[f.key]; return v == null ? null : v; })) },
    ], lang === "ar");
  };
  const exportDash = () => {
    const blob = new Blob([dashboardsToJson(dashboards)], { type: "application/json" }); const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = `report-builder-dashboards-${stamp()}.json`; document.body.appendChild(a); a.click(); a.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const importDash = async (f: File | undefined) => {
    if (!f) return; const text = await f.text(); const inc = dashboardsFromJson(text, SOURCES);
    if (!inc || !Object.keys(inc).length) { setNotice({ ok: false, msg: t("Invalid or empty dashboards file.", "ملف اللوحات غير صالح أو فارغ.") }); return; }
    const merged = { ...dashboards }; for (const [n, w] of Object.entries(inc)) merged[uniqueName(n, Object.keys(merged))] = w;
    persist(merged); setNotice({ ok: true, msg: t(`Imported ${Object.keys(inc).length} dashboard(s).`, `تم استيراد ${Object.keys(inc).length} لوحة.`) });
    if (fileRef.current) fileRef.current.value = "";
  };

  const fields = src.fields.filter((f) => !fieldQ || `${f.en} ${f.ar}`.toLowerCase().includes(fieldQ.toLowerCase()));
  const dims = fields.filter((f) => !f.measure), meas = fields.filter((f) => f.measure);
  const chip = (on: boolean, tone: "blue" | "emerald") => `w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs text-start ${on ? (tone === "blue" ? "bg-blue-600/20 text-blue-200 border border-blue-500/40" : "bg-emerald-600/20 text-emerald-200 border border-emerald-500/40") : "bg-slate-800/40 text-slate-300 hover:bg-slate-800 border border-transparent"}`;
  const titleOf = (c: Cfg) => c.title || `${t(srcById(c.srcId).en, srcById(c.srcId).ar)}${c.dim ? " — " + (() => { const f = srcById(c.srcId).fields.find((x) => x.key === c.dim); return f ? t(f.en, f.ar) : ""; })() : ""}`;

  return (
    <div className="p-4 lg:p-6 min-h-screen" dir={lang === "ar" ? "rtl" : "ltr"} data-rpt data-testid="builder-page">
      <PageHead icon={Settings2} title={t("Report Builder", "مُنشئ التقارير")} sub={t("Explore your data, build a chart, and pin it to a dashboard.", "استكشف بياناتك، ابنِ رسمًا، وثبّته في لوحة.")}>
        <PeriodBar range={range} onRange={setRange} from={cFrom} to={cTo} onFrom={setCFrom} onTo={setCTo} branches={branchList} branch={fBranch} onBranch={setFBranch} loading={loading} onRefresh={refresh} keys={KEYS} />
      </PageHead>

      {org === undefined ? <Loading /> : org === null ? <div className={`${CARD} p-10 text-center text-amber-400 text-sm`}>{t("The current branch is not linked to an organization.", "الفرع الحالي غير مرتبط بمؤسسة.")}</div> : (
        <>
          <div className="flex flex-wrap items-center gap-1.5 mb-3" data-testid="presets">
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-400 me-1"><Sparkles size={13} className="text-amber-400" /> {t("Quick reports", "تقارير جاهزة")}</span>
            {PRESETS.map((p) => <button key={p.id} data-testid={`preset-${p.id}`} onClick={() => applyPreset(p.id)} className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold border border-slate-700 bg-slate-900 text-slate-300 hover:text-white hover:border-blue-500/50">{t(p.en, p.ar)}</button>)}
          </div>
          {res?.error && <div className="mb-3" data-testid="warn-error"><Warn>{t("Could not load this source: ", "تعذّر تحميل هذا المصدر: ")}{res.error}</Warn></div>}
          {res?.truncated && <div className="mb-3" data-testid="warn-truncated"><Warn>{t("This source exceeds the loading limit — the chart may be incomplete. Narrow the period or branch.", "هذا المصدر يتجاوز حدّ التحميل — قد يكون الرسم ناقصًا. ضيّق الفترة أو الفرع.")}</Warn></div>}

          <div className="grid grid-cols-1 lg:grid-cols-[230px_1fr_260px] gap-3">
            <div className={`${CARD} p-3 h-fit`} data-testid="explorer">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-300 mb-2"><Database size={14} className="text-blue-400" /> {t("Data Explorer", "مستكشف البيانات")}</div>
              <select data-testid="b-source" value={cfg.srcId} onChange={(e) => { const s = srcById(e.target.value); setCfg(defaultCfg(s.id, s.fields)); }} className={sInp + " w-full mb-2"}>{SOURCES.map((s) => <option key={s.id} value={s.id}>{t(s.en, s.ar)}</option>)}</select>
              <div className="relative mb-2"><Search size={13} className="absolute top-1/2 -translate-y-1/2 start-2 text-slate-500" /><input value={fieldQ} onChange={(e) => setFieldQ(e.target.value)} placeholder={t("Search fields…", "ابحث عن حقل…")} className={sInp + " w-full ps-7"} /></div>
              <div className="text-[10px] font-bold text-slate-500 mb-1">{t("Dimensions", "الأبعاد")}</div>
              <div className="space-y-1 mb-2">{dims.map((f) => <button key={f.key} data-testid={`dim-${f.key}`} aria-pressed={cfg.dim === f.key} onClick={() => set({ dim: f.key })} className={chip(cfg.dim === f.key, "blue")}><GripVertical size={11} className="text-slate-500" /> {t(f.en, f.ar)}</button>)}</div>
              <div className="text-[10px] font-bold text-slate-500 mb-1">{t("Measures", "القياسات")}</div>
              <div className="space-y-1">
                {meas.map((f) => <button key={f.key} data-testid={`meas-${f.key}`} aria-pressed={cfg.meas === f.key} onClick={() => set({ meas: f.key, agg: cfg.agg === "COUNT" ? "SUM" : cfg.agg })} className={chip(cfg.meas === f.key, "emerald")}><Hash size={11} className="text-slate-500" /> {t(f.en, f.ar)}</button>)}
                <button data-testid="meas-count" aria-pressed={cfg.meas === COUNT_KEY} onClick={() => set({ meas: COUNT_KEY, agg: "COUNT" })} className={chip(cfg.meas === COUNT_KEY, "emerald")}><Hash size={11} className="text-slate-500" /> {t("Count of rows", "عدد السجلات")}</button>
              </div>
            </div>

            <div className={`${CARD} p-3`}>
              <div className="flex items-center gap-1.5 flex-wrap mb-3">{CHART_TYPES.map((c) => { const CI = c.icon; return <button key={c.k} data-testid={`ct-${c.k}`} aria-pressed={cfg.chart === c.k} onClick={() => set({ chart: c.k })} title={t(c.en, c.ar)} className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border ${cfg.chart === c.k ? "bg-blue-600 text-white border-blue-500" : "bg-slate-800/40 text-slate-400 border-slate-700 hover:text-white"}`}><CI size={13} /> {t(c.en, c.ar)}</button>; })}</div>
              <div className="min-h-[300px] flex flex-col" data-testid="preview">
                <div className="text-sm font-bold text-slate-200 mb-2">{titleOf(cfg)}</div>
                {loading ? <Loading /> : <ChartView data={data} cfg={cfg} rows={rows} measField={measField} dimLabel={dimLabel} t={t} />}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 mt-3 pt-3 border-t border-slate-800">
                <span className="text-[11px] text-slate-500">{t("Rows", "سجلات")}: <b data-testid="row-count">{fmtInt(rows.length)}</b></span>
                <div className="flex items-center gap-2">
                  <button data-testid="b-excel" onClick={exportData} disabled={!rows.length} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-700 bg-slate-900 text-slate-300 text-xs font-bold hover:text-white disabled:opacity-40"><Download size={14} /> Excel</button>
                  <button data-testid="b-add" onClick={addWidget} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-500"><Plus size={14} /> {t("Add to dashboard", "أضف إلى اللوحة")}</button>
                </div>
              </div>
            </div>

            <div className={`${CARD} p-3 h-fit space-y-2.5`} data-testid="options">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-300"><Settings2 size={14} className="text-blue-400" /> {t("Options", "الخيارات")}</div>
              <div><label className={lbl} htmlFor="b-title">{t("Title", "العنوان")}</label><input id="b-title" value={cfg.title} maxLength={80} onChange={(e) => set({ title: e.target.value })} placeholder={t("Chart title", "عنوان الرسم")} className={sInp + " w-full"} /></div>
              {cfg.chart === "scatter" ? (
                <>
                  <div><label className={lbl}>{t("X measure", "قياس X")}</label><select value={cfg.xMeas || cfg.meas} onChange={(e) => set({ xMeas: e.target.value })} className={sInp + " w-full"}>{src.fields.filter((f) => f.measure).map((f) => <option key={f.key} value={f.key}>{t(f.en, f.ar)}</option>)}</select></div>
                  <div><label className={lbl}>{t("Y measure", "قياس Y")}</label><select value={cfg.yMeas || cfg.meas} onChange={(e) => set({ yMeas: e.target.value })} className={sInp + " w-full"}>{src.fields.filter((f) => f.measure).map((f) => <option key={f.key} value={f.key}>{t(f.en, f.ar)}</option>)}</select></div>
                </>
              ) : (
                <>
                  {cfg.chart !== "kpi" && <div><label className={lbl}>{t("Group by", "التجميع حسب")}</label><select data-testid="b-group" value={cfg.dim} onChange={(e) => set({ dim: e.target.value })} className={sInp + " w-full"}>{src.fields.filter((f) => !f.measure).map((f) => <option key={f.key} value={f.key}>{t(f.en, f.ar)}</option>)}</select></div>}
                  <div><label className={lbl}>{t("Aggregation", "الدالة")}</label><select data-testid="b-agg" value={cfg.meas === COUNT_KEY ? "COUNT" : cfg.agg} disabled={cfg.meas === COUNT_KEY} onChange={(e) => set({ agg: e.target.value as Agg })} className={sInp + " w-full disabled:opacity-60"}>{AGGS.map((a) => <option key={a} value={a}>{a}</option>)}</select></div>
                  {dimField?.type === "date" && cfg.chart !== "kpi" && <div><label className={lbl}>{t("Date grouping", "تجميع التاريخ")}</label><select data-testid="b-dategroup" value={cfg.dateGroup} onChange={(e) => set({ dateGroup: e.target.value as Cfg["dateGroup"] })} className={sInp + " w-full"}><option value="day">{t("Day", "يوم")}</option><option value="month">{t("Month", "شهر")}</option><option value="year">{t("Year", "سنة")}</option></select></div>}
                  {cfg.chart !== "kpi" && <div className="grid grid-cols-2 gap-2"><div><label className={lbl}>{t("Top N", "أعلى N")}</label><input type="number" min={0} max={500} value={cfg.topN} onChange={(e) => set({ topN: Math.max(0, Math.min(500, Number(e.target.value) || 0)) })} className={sInp + " w-full"} /></div><div><label className={lbl}>{t("Sort", "الترتيب")}</label><select value={cfg.sortDir} onChange={(e) => set({ sortDir: e.target.value as Cfg["sortDir"] })} className={sInp + " w-full"}><option value="desc">{t("High→Low", "تنازلي")}</option><option value="asc">{t("Low→High", "تصاعدي")}</option></select></div></div>}
                </>
              )}
              <div><label className={lbl}>{t("Palette", "لوحة الألوان")}</label><div className="flex gap-1.5">{PALETTES.map((p, i) => <button key={i} aria-label={`${t("Palette", "لوحة الألوان")} ${i + 1}`} aria-pressed={cfg.palette === i} onClick={() => set({ palette: i })} className={`flex-1 h-7 rounded-lg border-2 ${cfg.palette === i ? "border-white" : "border-transparent"}`} style={{ background: `linear-gradient(90deg,${p[0]},${p[1]},${p[2]})` }} />)}</div></div>
              <div className="flex gap-3 pt-1">
                <label className="flex items-center gap-1.5 text-xs text-slate-400"><input type="checkbox" checked={cfg.legend} onChange={(e) => set({ legend: e.target.checked })} className="accent-blue-500" /> {t("Legend", "مفتاح")}</label>
                <label className="flex items-center gap-1.5 text-xs text-slate-400"><input type="checkbox" checked={cfg.values} onChange={(e) => set({ values: e.target.checked })} className="accent-blue-500" /> {t("Values", "القيم")}</label>
              </div>
            </div>
          </div>

          <div className={`${CARD} p-3 mt-3`} data-testid="canvas">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-1.5 text-sm font-bold text-slate-200"><FolderOpen size={15} className="text-blue-400" /> {t("Dashboard", "اللوحة")} {curDash && <span className="text-blue-400" data-testid="cur-dash">· {curDash}</span>}{dirty && <span data-testid="dirty" className="text-[10px] font-bold text-amber-400">● {t("unsaved", "غير محفوظة")}</span>}</div>
              <div className="flex flex-wrap items-center gap-1.5">
                <select data-testid="d-open" value={curDash} onChange={(e) => e.target.value && doLoad(e.target.value)} className={sInp}><option value="">{t("— open saved —", "— افتح لوحة —")}</option>{Object.keys(dashboards).map((n) => <option key={n} value={n}>{n}</option>)}</select>
                <button data-testid="d-save" onClick={doSave} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] font-bold hover:bg-emerald-500"><Save size={13} /> {t("Save", "حفظ")}</button>
                <button data-testid="d-copy" onClick={() => { setNameVal(`${curDash} (${t("copy", "نسخة")})`); setNaming("copy"); }} disabled={!curDash} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-[11px] font-bold disabled:opacity-40"><Copy size={13} /> {t("Duplicate", "نسخ")}</button>
                {!confirmDel ? <button data-testid="d-delete" onClick={() => setConfirmDel(true)} disabled={!curDash} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-500/10 text-red-400 text-[11px] font-bold disabled:opacity-40"><Trash2 size={13} /> {t("Delete", "حذف")}</button> : (
                  <span className="inline-flex items-center gap-1" data-testid="d-confirm"><span className="text-[11px] font-bold text-red-400">{t("Delete this dashboard?", "حذف هذه اللوحة؟")}</span><button data-testid="d-confirm-yes" onClick={doDelete} className="px-2 py-1.5 rounded-lg bg-red-600 text-white text-[11px] font-bold">{t("Yes", "نعم")}</button><button onClick={() => setConfirmDel(false)} className="px-2 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-[11px] font-bold">{t("No", "لا")}</button></span>
                )}
                <button data-testid="d-export" onClick={exportDash} disabled={!Object.keys(dashboards).length} title={t("Export all dashboards as a file", "تصدير كل اللوحات كملف")} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-[11px] font-bold disabled:opacity-40"><Download size={13} /> JSON</button>
                <button data-testid="d-import" onClick={() => fileRef.current?.click()} title={t("Import dashboards from a file", "استيراد لوحات من ملف")} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-[11px] font-bold"><Upload size={13} /> {t("Import", "استيراد")}</button>
                <input ref={fileRef} data-testid="d-file" type="file" accept="application/json,.json" className="hidden" onChange={(e) => void importDash(e.target.files?.[0])} />
              </div>
            </div>
            {naming && (
              <form data-testid="d-name-form" className="flex flex-wrap items-center gap-2 mb-3" onSubmit={(e) => { e.preventDefault(); if (naming === "copy") doCopy(nameVal); else doSaveAs(nameVal); }}>
                <label className="text-[11px] font-bold text-slate-400" htmlFor="d-name">{t("Dashboard name", "اسم اللوحة")}</label>
                <input id="d-name" data-testid="d-name" autoFocus value={nameVal} maxLength={60} onChange={(e) => setNameVal(e.target.value)} className={INP + " py-1.5"} />
                <button type="submit" data-testid="d-name-ok" disabled={!nameVal.trim()} className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold disabled:opacity-40">{t("OK", "موافق")}</button>
                <button type="button" onClick={() => setNaming(null)} className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-bold">{t("Cancel", "إلغاء")}</button>
              </form>
            )}
            {notice && <div role="status" data-testid="d-notice" className={`mb-3 rounded-xl px-3 py-2 text-xs font-bold border ${notice.ok ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-amber-500/10 border-amber-500/20 text-amber-400"}`}>{notice.msg}</div>}
            {widgets.length === 0 ? <EmptyState label={t("No widgets yet — build a chart and click “Add to dashboard”.", "لا عناصر بعد — ابنِ رسمًا واضغط «أضف إلى اللوحة».")} /> : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {widgets.map((w, i) => (
                  <div key={w.id} data-testid="widget" draggable onDragStart={() => (dragIx.current = i)} onDragOver={(e) => e.preventDefault()} onDrop={() => onDrop(i)} className={`${CARD} p-3 ${w.w === 2 ? "lg:col-span-2" : ""}`}>
                    <div className="flex items-center justify-between mb-2 gap-2">
                      <span className="text-xs font-bold text-slate-200 truncate">{titleOf(w.cfg)}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => move(i, -1)} disabled={i === 0} title={t("Move up", "تحريك لأعلى")} aria-label={t("Move up", "تحريك لأعلى")} className="w-6 h-6 rounded bg-slate-800 text-slate-400 flex items-center justify-center hover:text-white disabled:opacity-30"><ArrowUp size={12} /></button>
                        <button onClick={() => move(i, 1)} disabled={i === widgets.length - 1} title={t("Move down", "تحريك لأسفل")} aria-label={t("Move down", "تحريك لأسفل")} className="w-6 h-6 rounded bg-slate-800 text-slate-400 flex items-center justify-center hover:text-white disabled:opacity-30"><ArrowDown size={12} /></button>
                        <button onClick={() => touch((ws) => ws.map((x) => (x.id === w.id ? { ...x, w: x.w === 1 ? 2 : 1 } : x)))} title={t("Resize", "تحجيم")} aria-label={t("Resize", "تحجيم")} className="w-6 h-6 rounded bg-slate-800 text-slate-400 flex items-center justify-center hover:text-white"><Maximize2 size={12} /></button>
                        <button data-testid="w-remove" onClick={() => touch((ws) => ws.filter((x) => x.id !== w.id))} title={t("Remove", "إزالة")} aria-label={t("Remove", "إزالة")} className="w-6 h-6 rounded bg-red-500/10 text-red-400 flex items-center justify-center"><X size={12} /></button>
                      </div>
                    </div>
                    <WidgetView cfg={w.cfg} ctx={ctx} t={t} />
                  </div>
                ))}
              </div>
            )}
            <p className="text-[11px] text-slate-500 mt-3">{t("Dashboards are saved in this browser for this organization. Use JSON export/import to move them between devices.", "اللوحات محفوظة في هذا المتصفح لهذه المؤسسة. استخدم تصدير/استيراد JSON لنقلها بين الأجهزة.")}</p>
          </div>
        </>
      )}
    </div>
  );
}

// عنصر اللوحة — يعيد تشغيل استعلامه (مع كاش المصدر) ويعرض الخطأ/القصّ بدل الفراغ.
function WidgetView({ cfg, ctx, t }: { cfg: Cfg; ctx: LoadCtx; t: (e: string, a: string) => string }) {
  const [res, setRes] = useState<LoadRes | null>(null);
  const src = srcById(cfg.srcId); const dimField = src.fields.find((f) => f.key === cfg.dim); const measField = src.fields.find((f) => f.key === cfg.meas);
  useEffect(() => { let a = true; setRes(null); (async () => { if (!ctx.orgId) return; const d = await loadSource(src, ctx); if (a) setRes(d); })(); return () => { a = false; }; }, [src, ctx]);
  const data = useMemo(() => (res ? aggregate(res.rows, cfg, dimField) : []), [res, cfg, dimField]);
  if (res === null) return <Loading label={t("Loading…", "جارٍ التحميل…")} />;
  return (
    <>
      {res.error && <Warn>{res.error}</Warn>}
      {res.truncated && <div className="mb-2"><Warn>{t("Incomplete: data exceeds the loading limit.", "ناقص: البيانات تتجاوز حدّ التحميل.")}</Warn></div>}
      <ChartView data={data} cfg={cfg} rows={res.rows} measField={measField} dimLabel={dimField ? t(dimField.en, dimField.ar) : ""} t={t} />
    </>
  );
}
