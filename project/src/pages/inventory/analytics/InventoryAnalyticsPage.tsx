// =============================================================
// src/pages/inventory/analytics/InventoryAnalyticsPage.tsx
// مركز تقارير المخزون والأصناف — قراءة فقط، بيانات فعلية، ثنائي اللغة، فاتح/داكن، RTL/LTR.
// 7 تبويبات: حركة الأصناف، الراكدة، الأعمار، الأكثر/الأقل مبيعًا، التقييم، الموردون، التحليلات والتوصيات.
// =============================================================
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, ArrowLeftRight, BarChart3, Boxes, Clock, Download, Layers, Lightbulb, Package, Percent, Printer, RefreshCw, Save, Star, Trash2, Truck, Wallet, ArrowRight, ExternalLink,
} from "lucide-react";
import { useAuth } from "../../../context/AuthContext";
import { useLang } from "../../../context/LanguageContext";
import * as DB from "../../lib/accountingDb";
import { fetchShopHead, type ShopHead } from "../itemMovement/movementApi";
import { typeLabel } from "../itemMovement/movementLogic";
import type { Page } from "../../../components/Layout";
import * as API from "./analyticsApi";
import {
  AGE_BUCKETS, ALL_SCOPE, UNCLASSIFIED, addDays, ageProduct, agingSummary, aggregate, buildActivity, buildInsights, classifyStale, computeKpis, daysBetween, filterProds, flowRows, groupOf, isLow, isStagnant,
  lastSupplierByProduct, matchLine, buildIndex, monthlyFlow, r2, rankSales, salesByProduct, supplierAnalysis, valueOf,
  type Activity, type AgeBucket, type GroupBy, type Mv, type Prod, type PurchDoc, type Rec, type SaleDoc, type Scope, type StaleInfo, type StaleStatus, type Thresholds, type FlowRow,
} from "./analyticsLogic";
import { BTN_BLUE, BTN_SOFT, CARD, Chip, DataGrid, DonutChart, FlowChart, HBars, INPUT, LABEL, MultiSelect, Panel, PALETTE, IA_CSS, exportXlsx, makeFmt, printSpec, type Digits, type GCol, type Opt, type ReportSpec } from "./AnalyticsKit";

type Tab = "movement" | "stagnant" | "aging" | "sales" | "valuation" | "suppliers" | "insights";
const KEY = "mihwar.invanalytics.v1"; const KEY_VIEWS = "mihwar.invanalytics.views"; const LAST_ITEM = "mihwar.itemmove.last";
type Persist = { br: string[] | null; wh: string[] | null; gr: string[] | null; su: string[] | null; q: string; from: string; to: string; slow: number; dead: number; severe: number; groupBy: GroupBy; useCreated: boolean; digits: Digits; tab: Tab };
const todayStr = (): string => new Date().toISOString().slice(0, 10);
const DEFAULTS = (): Persist => ({ br: null, wh: null, gr: null, su: null, q: "", from: addDays(todayStr(), -90), to: todayStr(), slow: 90, dead: 180, severe: 365, groupBy: "category", useCreated: false, digits: "en", tab: "stagnant" });
const readLS = <T,>(k: string, d: T): T => { try { const s = localStorage.getItem(k); return s ? ({ ...d, ...JSON.parse(s) } as T) : d; } catch { return d; } };
const readViews = (): { name: string; s: Persist }[] => { try { const v = JSON.parse(localStorage.getItem(KEY_VIEWS) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };
const toSet = (a: string[] | null): Set<string> | null => (a ? new Set(a) : null);
const toNumSet = (a: string[] | null): Set<number> | null => (a ? new Set(a.map(Number)) : null);

type Row = { p: Prod; st: StaleInfo; a: Activity | undefined; value: number; supplier: string; group: string };
const STATUS_TONE: Record<StaleStatus, "emerald" | "amber" | "orange" | "red" | "slate"> = { active: "emerald", slow: "amber", dead: "orange", severe: "red", nohistory: "slate", nostock: "slate" };

export default function InventoryAnalyticsPage({ onNavigate, onSection }: { onNavigate?: (p: Page) => void; onSection?: (s: string) => void }) {
  const { t, lang, isRTL } = useLang();
  const { ownedShopId, branches } = (useAuth() as unknown as { ownedShopId: number | null; branches?: { id: number; name: string }[] }) ?? { ownedShopId: null };
  const dir: "rtl" | "ltr" = isRTL ? "rtl" : "ltr"; const l2: "ar" | "en" = lang === "en" ? "en" : "ar";
  const [org, setOrg] = useState<{ id: number; name: string } | null>(null); const [head, setHead] = useState<ShopHead>(null);
  const [whs, setWhs] = useState<DB.GLWarehouse[]>([]);
  const [prods, setProds] = useState<Prod[]>([]); const [moves, setMoves] = useState<Mv[]>([]); const [saleDocs, setSaleDocs] = useState<SaleDoc[]>([]); const [purchDocs, setPurchDocs] = useState<PurchDoc[]>([]);
  const [loading, setLoading] = useState(true); const [errs, setErrs] = useState<string[]>([]); const [trunc, setTrunc] = useState(false); const [nonce, setNonce] = useState(0);
  const [S, setS] = useState<Persist>(() => readLS(KEY, DEFAULTS()));
  const [views, setViews] = useState(readViews); const [viewName, setViewName] = useState("");
  const set = useCallback((patch: Partial<Persist>) => setS((s) => ({ ...s, ...patch })), []);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* التخزين غير متاح */ } }, [S]);
  const fmt = useMemo(() => makeFmt(S.digits), [S.digits]);
  const report = useRef<ReportSpec | null>(null); const [hasReport, setHasReport] = useState(false);
  const onReport = useCallback((s: ReportSpec | null) => { report.current = s; setHasReport(s != null); }, []);

  // ── تحميل البيانات ──
  useEffect(() => {
    let alive = true; setLoading(true);
    void (async () => {
      const o = await DB.getOrgForBranch(ownedShopId ?? null); if (!alive) return;
      if (!o) { setErrs([t("No organization found for this user.", "تعذّر تحديد المؤسسة لهذا المستخدم.")]); setLoading(false); return; }
      setOrg(o);
      const [w, p, m, s, pu, h] = await Promise.all([DB.fetchWarehouses(o.id), API.fetchProducts(o.id), API.fetchMoves(o.id), API.fetchSaleDocs(o.id), API.fetchPurchaseDocs(o.id), ownedShopId ? fetchShopHead(Number(ownedShopId)) : Promise.resolve(null)]);
      if (!alive) return;
      setWhs(w); setProds(p.rows); setMoves(m.rows); setSaleDocs(s.rows); setPurchDocs(pu.rows); setHead(h);
      setTrunc(p.truncated || m.truncated || s.truncated || pu.truncated);
      setErrs([p.error, m.error, s.error, pu.error].filter((x): x is string => !!x)); setLoading(false);
    })();
    return () => { alive = false; };
  }, [ownedShopId, nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  const today = todayStr(); const th: Thresholds = useMemo(() => ({ slow: S.slow, dead: Math.max(S.dead, S.slow + 1), severe: Math.max(S.severe, S.dead + 2) }), [S.slow, S.dead, S.severe]);
  const bn = useCallback((id: number | null): string => (id == null ? "—" : branches?.find((b) => b.id === id)?.name || `#${id}`), [branches]);
  const wn = useCallback((id: number | null): string => (id == null ? t("Unassigned", "بلا مخزن") : whs.find((w) => w.id === id)?.name || `#${id}`), [whs, t]);
  const gl = useCallback((k: string): string => (k === UNCLASSIFIED ? t("Unclassified", "غير مصنّف") : k), [t]);
  const sl = useCallback((k: string): string => (k === UNCLASSIFIED ? t("No recorded supplier", "بدون مورد مسجَّل") : k), [t]);

  // ── مشتقات البيانات ──
  const supRef = useMemo(() => lastSupplierByProduct(prods, purchDocs), [prods, purchDocs]);
  const supOf = useMemo(() => { const m = new Map<number, string>(); supRef.forEach((v, k) => m.set(k, v.name)); return m; }, [supRef]);
  const scope: Scope = useMemo(() => ({ ...ALL_SCOPE, branches: toNumSet(S.br), warehouses: toNumSet(S.wh), groups: toSet(S.gr), suppliers: toSet(S.su), q: S.q }), [S.br, S.wh, S.gr, S.su, S.q]);
  const defWh = useMemo(() => { const m = new Map<number, number>(); whs.forEach((w) => { if (w.is_default && w.branch_id != null) m.set(w.branch_id, w.id); }); return m; }, [whs]);
  const scoped = useMemo(() => filterProds(prods, scope, S.groupBy, supOf, defWh), [prods, scope, S.groupBy, supOf, defWh]);
  const act = useMemo(() => buildActivity(moves, prods, saleDocs), [moves, prods, saleDocs]);
  const stale = useMemo(() => { const m = new Map<number, StaleInfo>(); for (const p of scoped) m.set(p.id, classifyStale(p, act.get(p.id), today, th, S.useCreated)); return m; }, [scoped, act, today, th, S.useCreated]);
  const periodLen = Math.max(1, daysBetween(S.from, S.to) + 1); const prevTo = addDays(S.from, -1); const prevFrom = addDays(prevTo, -(periodLen - 1));
  const salesCur = useMemo(() => salesByProduct(prods, saleDocs, S.from, S.to), [prods, saleDocs, S.from, S.to]);
  const salesPrev = useMemo(() => salesByProduct(prods, saleDocs, prevFrom, prevTo), [prods, saleDocs, prevFrom, prevTo]);
  const kpis = useMemo(() => computeKpis(scoped, stale, salesCur, salesPrev), [scoped, stale, salesCur, salesPrev]);
  const rows: Row[] = useMemo(() => scoped.map((p) => ({ p, st: stale.get(p.id)!, a: act.get(p.id), value: valueOf(p), supplier: supOf.get(p.id) || UNCLASSIFIED, group: groupOf(p, S.groupBy) })), [scoped, stale, act, supOf, S.groupBy]);

  const brOpts: Opt[] = useMemo(() => (branches || []).map((b) => ({ value: String(b.id), label: b.name })), [branches]);
  const whOpts: Opt[] = useMemo(() => whs.filter((w) => !S.br || (w.branch_id != null && S.br.includes(String(w.branch_id)))).map((w) => ({ value: String(w.id), label: `${w.name}${w.branch_id != null ? ` — ${bn(w.branch_id)}` : ""}` })), [whs, S.br, bn]);
  const grOpts: Opt[] = useMemo(() => [...new Set(prods.map((p) => groupOf(p, S.groupBy)))].sort().map((g) => ({ value: g, label: gl(g) })), [prods, S.groupBy, gl]);
  const suOpts: Opt[] = useMemo(() => [...new Set([...purchDocs.map((d) => d.supplier).filter(Boolean), UNCLASSIFIED])].sort().map((s) => ({ value: s, label: sl(s) })), [purchDocs, sl]);

  const L = useMemo(() => ({
    columns: t("Columns", "الأعمدة"), excel: "Excel", excelSel: t("Excel (selected)", "Excel (المحدد)"), print: t("Print / PDF", "طباعة / PDF"), page: t("Page", "صفحة"), of: t("of", "من"), rows: t("rows", "صف"),
    selected: t("selected", "محدد"), empty: t("No data for the current filters.", "لا توجد بيانات ضمن الفلاتر الحالية."), clear: t("clear", "مسح"),
  }), [t]);
  const orgName = org?.name || ""; const meta = { taxNumber: head?.tax_number, logoUrl: head?.logo_url, address: head?.address };
  const grid = { fmt, labels: L, orgName, orgMeta: meta, dir, lang: l2 } as const;
  const openItem = (p: Prod): void => { try { localStorage.setItem(LAST_ITEM, String(p.id)); } catch { /* */ } onNavigate?.("item-movement"); };
  const clearAll = (): void => setS((s) => ({ ...DEFAULTS(), digits: s.digits, tab: s.tab }));
  const saveView = (): void => { const n = viewName.trim(); if (!n) return; const v = [...views.filter((x) => x.name !== n), { name: n, s: S }]; setViews(v); setViewName(""); try { localStorage.setItem(KEY_VIEWS, JSON.stringify(v)); } catch { /* */ } };
  const delView = (n: string): void => { const v = views.filter((x) => x.name !== n); setViews(v); try { localStorage.setItem(KEY_VIEWS, JSON.stringify(v)); } catch { /* */ } };

  const tabs: { id: Tab; icon: React.ReactNode; en: string; ar: string }[] = [
    { id: "movement", icon: <ArrowLeftRight size={15} />, en: "Item Movement", ar: "حركة الأصناف" }, { id: "stagnant", icon: <Package size={15} />, en: "Slow & Dead Stock", ar: "الأصناف الراكدة" },
    { id: "aging", icon: <Clock size={15} />, en: "Inventory Aging", ar: "أعمار المخزون" }, { id: "sales", icon: <BarChart3 size={15} />, en: "Best & Worst Sellers", ar: "الأكثر والأقل مبيعًا" },
    { id: "valuation", icon: <Layers size={15} />, en: "Valuation", ar: "تقييم المخزون" }, { id: "suppliers", icon: <Truck size={15} />, en: "Supplier Analysis", ar: "تحليل الموردين" },
    { id: "insights", icon: <Lightbulb size={15} />, en: "Insights & Charts", ar: "تحليلات وتوصيات" },
  ];
  const tabTitle = (tb: Tab): string => { const x = tabs.find((y) => y.id === tb)!; return t(x.en, x.ar); };

  // ── بطاقات المؤشرات ──
  const Kpi = ({ label, value, sub, icon, tone, tab, testId }: { label: string; value: string; sub?: React.ReactNode; icon: React.ReactNode; tone: string; tab?: Tab; testId: string }) => (
    <button type="button" data-testid={testId} onClick={() => tab && set({ tab })} className={`${CARD} p-4 text-start min-h-[104px] flex flex-col justify-between hover:border-blue-500/60 transition-colors`}>
      <div className="flex items-center justify-between gap-2"><span className="text-xs font-bold text-slate-300">{label}</span><span className={`w-8 h-8 rounded-xl bg-slate-800 flex items-center justify-center ${tone}`}>{icon}</span></div>
      <div className={`text-2xl font-black tabular-nums [direction:ltr] ${isRTL ? "text-end" : "text-start"} ${tone}`}>{value}</div>
      <div className="text-[11px] text-slate-400 min-h-[16px]">{sub}</div>
    </button>
  );
  const delta = (cur: number | null, prev: number | null): React.ReactNode => {
    if (cur == null || prev == null || prev === 0) return <span>{t("No prior-period data", "لا بيانات للفترة السابقة")}</span>;
    const d = ((cur - prev) / Math.abs(prev)) * 100; return <span className={d >= 0 ? "text-emerald-400 font-bold" : "text-red-400 font-bold"}>{d >= 0 ? "▲" : "▼"} {fmt.pct(Math.abs(d))} {t("vs prev. period", "عن الفترة السابقة")}</span>;
  };
  const snap = <span>{t("Snapshot — no history to compare", "لقطة حالية — لا سجل تاريخي للمقارنة")}</span>;
  const cur = (n: number): string => `${fmt.money(n)} ${t("SAR", "ر.س")}`;

  // ── تبويب: الأصناف الراكدة ──
  const [stFilter, setStFilter] = useState<"stagnant" | "slow" | "dead" | "severe" | "nohistory">("stagnant");
  const [vMin, setVMin] = useState(""); const [vMax, setVMax] = useState(""); const [qMin, setQMin] = useState(""); const [soldBefore, setSoldBefore] = useState("");
  const [periodSel, setPeriodSel] = useState<string>("90");
  const stagRows = useMemo(() => rows.filter((r) => {
    if (r.p.qty <= 0) return false;
    const s = r.st.status; if (stFilter === "stagnant" ? !isStagnant(s) : s !== stFilter) return false;
    if (vMin !== "" && r.value < Number(vMin)) return false; if (vMax !== "" && r.value > Number(vMax)) return false; if (qMin !== "" && r.p.qty < Number(qMin)) return false;
    if (soldBefore && r.a?.lastSale && r.a.lastSale > soldBefore) return false; return true;
  }), [rows, stFilter, vMin, vMax, qMin, soldBefore]);
  const statusText = (s: StaleStatus): string => ({ active: t("Active", "نشط"), slow: t("Slow-moving", "بطيء الحركة"), dead: t("Dead", "راكد"), severe: t("Severely dead", "شديد الركود"), nohistory: t("No movement history", "بلا سجل حركة"), nostock: t("No stock", "بلا رصيد") })[s];
  const basisText = (b: StaleInfo["basis"]): string => ({ sale: t("last sale", "آخر بيع"), receipt: t("last receipt (never sold)", "آخر استلام (لم يُبَع)"), move: t("last movement", "آخر حركة"), created: t("creation date (estimate)", "تاريخ الإنشاء (تقدير)"), none: "" })[b];
  const setPeriod = (v: string): void => { setPeriodSel(v); if (v !== "custom") { const n = Number(v); set({ slow: n, dead: Math.max(180, n * 2), severe: Math.max(365, n * 4) }); } };
  const common = (r: Row) => ({ code: r.p.code, name: r.p.name });
  const stagCols: GCol<Row>[] = [
    { id: "code", label: t("Code", "الكود"), get: (r) => common(r).code }, { id: "name", label: t("Item", "اسم الصنف"), get: (r) => r.p.name, render: (r) => <span className="font-semibold text-slate-100">{r.p.name}</span> },
    { id: "group", label: t("Group", "المجموعة"), get: (r) => gl(r.group) }, { id: "supplier", label: t("Supplier", "المورد"), get: (r) => sl(r.supplier) },
    { id: "branch", label: t("Branch", "الفرع"), get: (r) => bn(r.p.branchId) }, { id: "wh", label: t("Warehouse", "المخزن"), get: (r) => wn(r.p.whId) },
    { id: "qty", label: t("Qty", "الكمية"), kind: "qty", get: (r) => r.p.qty }, { id: "cost", label: t("Avg cost", "متوسط التكلفة"), kind: "money", get: (r) => r.p.cost },
    { id: "value", label: t("Stock value", "قيمة المخزون"), kind: "money", get: (r) => r.value },
    { id: "lastSale", label: t("Last sale", "آخر بيع"), kind: "date", get: (r) => r.a?.lastSale ?? null }, { id: "lastIssue", label: t("Last issue", "آخر صرف"), kind: "date", get: (r) => r.a?.lastIssue ?? null },
    { id: "lastMove", label: t("Last movement", "آخر حركة"), kind: "date", get: (r) => r.a?.lastMove ?? null },
    { id: "days", label: t("Idle days", "أيام الركود"), kind: "int", get: (r) => r.st.days, render: (r) => (r.st.days == null ? "—" : <span title={basisText(r.st.basis)}>{fmt.int(r.st.days)}</span>) },
    { id: "status", label: t("Class", "التصنيف"), get: (r) => statusText(r.st.status), render: (r) => <Chip tone={STATUS_TONE[r.st.status]}>{statusText(r.st.status)}</Chip> },
  ];
  const stagByGroup = useMemo(() => aggregate(stagRows.map((r) => r.p), (p) => groupOf(p, S.groupBy), gl), [stagRows, S.groupBy, gl]);
  const stagValue = r2(stagRows.reduce((s, r) => s + r.value, 0)); const totalValue = kpis.value;
  const daysBuckets = useMemo(() => { const b = [0, 0, 0, 0, 0]; for (const r of rows) { if (r.p.qty <= 0 || r.st.days == null) continue; const d = r.st.days; b[d > 180 ? 0 : d > 90 ? 1 : d > 60 ? 2 : d > 30 ? 3 : 4]++; } return b; }, [rows]);

  // ── تبويب: الأعمار ──
  const ageSum = useMemo(() => agingSummary(rows.map((r) => r.p), act, today), [rows, act, today]);
  const ageLabel = (b: AgeBucket): string => (b === "unknown" ? t("No receipt date", "بلا تاريخ استلام") : b === "180+" ? t("Over 180 days", "أكثر من 180 يوم") : `${b.replace("-", "–")} ${t("days", "يوم")}`);
  type AgeRow = Row & { per: Record<AgeBucket, number> };
  const ageRows: AgeRow[] = useMemo(() => rows.filter((r) => r.p.qty > 0).map((r) => ({ ...r, per: ageProduct(r.p, r.a, today) })), [rows, today]);
  const ageCols: GCol<AgeRow>[] = [
    { id: "code", label: t("Code", "الكود"), get: (r) => r.p.code }, { id: "name", label: t("Item", "اسم الصنف"), get: (r) => r.p.name }, { id: "branch", label: t("Branch", "الفرع"), get: (r) => bn(r.p.branchId) },
    { id: "wh", label: t("Warehouse", "المخزن"), get: (r) => wn(r.p.whId) }, { id: "group", label: t("Group", "المجموعة"), get: (r) => gl(r.group), hidden: true }, { id: "supplier", label: t("Supplier", "المورد"), get: (r) => sl(r.supplier), hidden: true },
    { id: "qty", label: t("Qty", "الكمية"), kind: "qty", get: (r) => r.p.qty }, { id: "value", label: t("Value", "القيمة"), kind: "money", get: (r) => r.value },
    ...AGE_BUCKETS.map((b): GCol<AgeRow> => ({ id: `b${b}`, label: ageLabel(b), kind: "qty", get: (r) => r.per[b] })),
  ];

  // ── تبويب: المبيعات ──
  const [sMode, setSMode] = useState<"best" | "worst" | "none">("best"); const [sMetric, setSMetric] = useState<"net" | "qty">("net");
  const ranks = useMemo(() => rankSales(scoped, salesCur, salesPrev), [scoped, salesCur, salesPrev]);
  const rankRows = useMemo(() => {
    const m = (r: (typeof ranks)[number]): number => (sMetric === "net" ? r.net : r.qty);
    if (sMode === "none") return ranks.filter((r) => r.p.qty > 0 && r.qty <= 0 && r.net <= 0).sort((a, b) => valueOf(b.p) - valueOf(a.p));
    const sold = ranks.filter((r) => m(r) > 0); return sMode === "best" ? sold.sort((a, b) => m(b) - m(a)) : sold.sort((a, b) => m(a) - m(b));
  }, [ranks, sMode, sMetric]);
  const salesTot = useMemo(() => ({ net: r2(ranks.reduce((s, r) => s + r.net, 0)), prev: r2(ranks.reduce((s, r) => s + r.prevNet, 0)), qty: ranks.reduce((s, r) => s + r.qty, 0), unsold: ranks.filter((r) => r.p.qty > 0 && r.qty <= 0 && r.net <= 0).length }), [ranks]);
  const matchInfo = useMemo(() => { const ix = buildIndex(prods); let ok = 0, all = 0; for (const d of saleDocs) { if (d.kind !== "sale" || d.date < S.from || d.date > S.to) continue; for (const l of d.lines) { all++; if (matchLine(l, d.branchId, ix)) ok++; } } return { ok, all }; }, [prods, saleDocs, S.from, S.to]);
  type RankRow = (typeof ranks)[number];
  const rankCols: GCol<RankRow>[] = [
    { id: "code", label: t("Code", "الكود"), get: (r) => r.p.code }, { id: "name", label: t("Item", "اسم الصنف"), get: (r) => r.p.name }, { id: "branch", label: t("Branch", "الفرع"), get: (r) => bn(r.p.branchId) },
    { id: "wh", label: t("Warehouse", "المخزن"), get: (r) => wn(r.p.whId), hidden: true }, { id: "qty", label: t("Qty sold", "الكمية المباعة"), kind: "qty", get: (r) => r.qty },
    { id: "net", label: t("Net sales", "صافي المبيعات"), kind: "money", get: (r) => r.net }, { id: "inv", label: t("Invoices", "عدد الفواتير"), kind: "int", get: (r) => r.invoices },
    { id: "ret", label: t("Returned qty", "كمية المرتجع"), kind: "qty", get: (r) => r.retQty, hidden: true },
    { id: "margin", label: t("Margin (avg cost)", "الهامش (متوسط التكلفة)"), kind: "money", get: (r) => r.margin }, { id: "prevNet", label: t("Prev. net", "صافي الفترة السابقة"), kind: "money", get: (r) => r.prevNet },
    { id: "chg", label: t("Change", "التغيّر"), kind: "pct", get: (r) => r.changePct, render: (r) => (r.changePct == null ? "—" : <span className={r.changePct >= 0 ? "text-emerald-400 font-bold" : "text-red-400 font-bold"}>{r.changePct >= 0 ? "▲" : "▼"} {fmt.pct(Math.abs(r.changePct))}</span>) },
    { id: "stock", label: t("Stock", "الرصيد"), kind: "qty", get: (r) => r.p.qty },
  ];

  // ── تبويب: التقييم ──
  const [drill, setDrill] = useState<{ branch: number | null; wh: number | null | undefined }>({ branch: null, wh: undefined });
  const valRows = useMemo(() => rows.filter((r) => r.p.qty > 0), [rows]);
  const byBranch = useMemo(() => aggregate(valRows.map((r) => r.p), (p) => String(p.branchId ?? ""), (k) => bn(k === "" ? null : Number(k))), [valRows, bn]);
  const byWh = useMemo(() => aggregate(valRows.filter((r) => drill.branch == null || r.p.branchId === drill.branch).map((r) => r.p), (p) => String(p.whId ?? ""), (k) => wn(k === "" ? null : Number(k))), [valRows, drill.branch, wn]);
  const byGroup = useMemo(() => aggregate(valRows.map((r) => r.p), (p) => groupOf(p, S.groupBy), gl), [valRows, S.groupBy, gl]);
  const bySupplier = useMemo(() => aggregate(valRows.map((r) => r.p), (p) => supOf.get(p.id) || UNCLASSIFIED, sl), [valRows, supOf, sl]);
  const valItems = useMemo(() => valRows.filter((r) => (drill.branch == null || r.p.branchId === drill.branch) && (drill.wh === undefined || (r.p.whId ?? null) === drill.wh)).sort((a, b) => b.value - a.value), [valRows, drill]);
  const hiLow = useMemo(() => { const v = valRows.map((r) => r.value).sort((a, b) => a - b); const p90 = v.length ? v[Math.min(v.length - 1, Math.floor(v.length * 0.9))] : 0; return valRows.filter((r) => isStagnant(r.st.status) && r.value >= p90 && p90 > 0).sort((a, b) => b.value - a.value).slice(0, 10); }, [valRows]);
  type Agg2 = { key: string; label: string; qty: number; value: number; items: number };
  const aggCols = (what: string): GCol<Agg2>[] => [
    { id: "label", label: what, get: (r) => r.label }, { id: "items", label: t("Items", "الأصناف"), kind: "int", get: (r) => r.items }, { id: "qty", label: t("Qty", "الكمية"), kind: "qty", get: (r) => r.qty },
    { id: "value", label: t("Value", "القيمة"), kind: "money", get: (r) => r.value }, { id: "share", label: t("Share", "النسبة"), kind: "pct", get: (r) => (totalValue > 0 ? (r.value / totalValue) * 100 : 0) },
  ];
  const itemCols: GCol<Row>[] = [
    { id: "code", label: t("Code", "الكود"), get: (r) => r.p.code }, { id: "name", label: t("Item", "اسم الصنف"), get: (r) => r.p.name }, { id: "branch", label: t("Branch", "الفرع"), get: (r) => bn(r.p.branchId) }, { id: "wh", label: t("Warehouse", "المخزن"), get: (r) => wn(r.p.whId) },
    { id: "qty", label: t("Qty", "الكمية"), kind: "qty", get: (r) => r.p.qty }, { id: "cost", label: t("Avg cost", "متوسط التكلفة"), kind: "money", get: (r) => r.p.cost }, { id: "value", label: t("Value", "القيمة"), kind: "money", get: (r) => r.value },
    { id: "status", label: t("Class", "التصنيف"), get: (r) => statusText(r.st.status), render: (r) => <Chip tone={STATUS_TONE[r.st.status]}>{statusText(r.st.status)}</Chip> },
  ];

  // ── تبويب: الموردون ──
  const supRows = useMemo(() => supplierAnalysis(scoped, purchDocs, S.from, S.to, supRef, stale, prods).filter((r) => !S.su || S.su.includes(r.supplier)), [scoped, purchDocs, S.from, S.to, supRef, stale, prods, S.su]);
  type SupRow = (typeof supRows)[number];
  const supCols: GCol<SupRow>[] = [
    { id: "s", label: t("Supplier", "المورد"), get: (r) => r.supplier }, { id: "p", label: t("Purchases (period)", "المشتريات (الفترة)"), kind: "money", get: (r) => r.purchases }, { id: "d", label: t("Invoices", "الفواتير"), kind: "int", get: (r) => r.docs },
    { id: "i", label: t("Items in stock", "أصناف بالمخزون"), kind: "int", get: (r) => r.items }, { id: "q", label: t("Current qty", "الكمية الحالية"), kind: "qty", get: (r) => r.qty }, { id: "v", label: t("Stock value", "قيمة المخزون"), kind: "money", get: (r) => r.value },
    { id: "sv", label: t("Stagnant value", "قيمة الراكد"), kind: "money", get: (r) => r.stagnantValue }, { id: "sp", label: t("Slow items %", "نسبة بطيء الحركة"), kind: "pct", get: (r) => r.slowPct }, { id: "lp", label: t("Last purchase", "آخر شراء"), kind: "date", get: (r) => r.lastPurchase },
  ];

  // ── تبويب: حركة الأصناف ──
  const [mvTypes, setMvTypes] = useState<Set<string> | null>(null); const [mvKind, setMvKind] = useState<"all" | "in" | "out">("all");
  const idSet = useMemo(() => new Set(scoped.map((p) => p.id)), [scoped]);
  const mvScoped = useMemo(() => moves.filter((m) => idSet.has(m.product_id)), [moves, idSet]);
  const flow = useMemo(() => flowRows(scoped, mvScoped), [scoped, mvScoped]);
  const flowShown = useMemo(() => flow.filter((f) => { const d = f.m.created_at.slice(0, 10); if (d < S.from || d > S.to) return false; if (mvTypes && !mvTypes.has(f.m.move_type)) return false; if (mvKind === "in" && f.inQty <= 0) return false; if (mvKind === "out" && f.outQty <= 0) return false; return true; }), [flow, S.from, S.to, mvTypes, mvKind]);
  const mvTypeOpts: Opt[] = useMemo(() => [...new Set(mvScoped.map((m) => m.move_type))].sort().map((x) => ({ value: x, label: typeLabel(x, l2) })), [mvScoped, l2]);
  const mvSum = useMemo(() => {
    let cur = 0, afterFrom = 0, afterTo = 0, inQ = 0, outQ = 0;
    for (const p of scoped) cur += p.qty;
    for (const m of mvScoped) { const d = m.created_at.slice(0, 10); const q = Number(m.qty) || 0; if (d >= S.from) afterFrom += q; if (d > S.to) afterTo += q; }
    for (const f of flowShown) { inQ += f.inQty; outQ += f.outQty; }
    return { cur, opening: cur - afterFrom, closing: cur - afterTo, inQ, outQ };
  }, [scoped, mvScoped, S.from, S.to, flowShown]);
  const openDoc = (m: Mv): void => {
    const rt = m.ref_type; if (rt === "gl_purchase_invoices" || rt === "gl_purchase_returns") onNavigate?.("purchases"); else if (rt === "gl_sales_invoices") onNavigate?.("sales-invoice");
    else if (rt === "gl_sales_returns") { onSection?.("sales-returns"); onNavigate?.("accounting"); } else if (rt === "pos_sale") onNavigate?.("pos");
  };
  const refText = (m: Mv): string => { if (m.ref_id == null) return "—"; const p = m.ref_type === "gl_purchase_invoices" ? "PI" : m.ref_type === "gl_purchase_returns" ? "PR" : m.ref_type === "gl_sales_invoices" ? "SI" : m.ref_type === "pos_sale" ? "POS" : m.ref_type === "gl_sales_returns" ? "SR" : "#"; return `${p}-${m.ref_id}`; };
  const flowCols: GCol<FlowRow>[] = [
    { id: "date", label: t("Date", "التاريخ"), kind: "date", get: (r) => r.m.created_at.slice(0, 10) }, { id: "name", label: t("Item", "اسم الصنف"), get: (r) => r.p.name }, { id: "code", label: t("Code", "الكود"), get: (r) => r.p.code },
    { id: "branch", label: t("Branch", "الفرع"), get: (r) => bn(r.m.branch_id ?? r.p.branchId) }, { id: "wh", label: t("Warehouse", "المخزن"), get: (r) => wn(r.m.warehouse_id ?? r.p.whId) },
    { id: "type", label: t("Type", "نوع الحركة"), get: (r) => typeLabel(r.m.move_type, l2), render: (r) => <Chip tone={r.inQty > 0 ? "emerald" : "orange"}>{typeLabel(r.m.move_type, l2)}</Chip> },
    { id: "doc", label: t("Document", "المستند"), get: (r) => refText(r.m), render: (r) => (r.m.ref_id == null ? "—" : <button type="button" className="text-blue-400 underline font-semibold [direction:ltr]" onClick={(e) => { e.stopPropagation(); openDoc(r.m); }}>{refText(r.m)}</button>) },
    { id: "in", label: t("In", "الوارد"), kind: "qty", get: (r) => r.inQty || null }, { id: "out", label: t("Out", "الصادر"), kind: "qty", get: (r) => r.outQty || null }, { id: "bal", label: t("Balance after", "الرصيد بعد الحركة"), kind: "qty", get: (r) => r.balance },
    { id: "notes", label: t("Notes", "ملاحظات"), get: (r) => r.m.notes, hidden: true },
  ];
  const flowMonthly = useMemo(() => monthlyFlow(mvScoped), [mvScoped]);

  // ── التوصيات ──
  const recs = useMemo(() => buildInsights(scoped, stale, salesCur), [scoped, stale, salesCur]);
  const recText = (r: Rec): { title: string; reason: string; action: string } => {
    const d = r.days != null ? fmt.int(r.days) : "—";
    switch (r.kind) {
      case "stop_purchase": return { title: t("Pause purchasing", "إيقاف الشراء مؤقتًا"), reason: t(`Dead stock: no sale for ${d} days`, `راكد: بلا بيع منذ ${d} يوم`), action: t("Do not reorder; consider clearance", "لا تعد الطلب؛ فكّر في تصفية") };
      case "reduce_purchase": return { title: t("Reduce purchase quantity", "خفض كمية الشراء"), reason: t(`Slow-moving: ${d} days since last sale`, `بطيء الحركة: ${d} يوم منذ آخر بيع`), action: t("Lower next order quantity", "خفّض كمية الطلب القادم") };
      case "high_value_slow": return { title: t("High value, weak movement", "قيمة مرتفعة وحركة ضعيفة"), reason: t(`Top-decile stock value; idle ${d} days`, `ضمن أعلى 10% قيمة؛ راكد ${d} يوم`), action: t("Review pricing/promotion or return to supplier", "راجع التسعير/العرض أو أعده للمورد") };
      case "transfer": return { title: t("Inter-branch transfer opportunity", "فرصة تحويل بين الفروع"), reason: t(`Idle here; ${fmt.qty(r.sold)} sold at ${bn(r.toBranchId ?? null)} in period with low stock`, `راكد هنا؛ بِيع ${fmt.qty(r.sold)} في ${bn(r.toBranchId ?? null)} خلال الفترة برصيد غير كافٍ`), action: t(`Transfer ${fmt.qty(r.qty)} to ${bn(r.toBranchId ?? null)} before a new PO`, `حوّل ${fmt.qty(r.qty)} إلى ${bn(r.toBranchId ?? null)} قبل أمر شراء جديد`) };
      case "restock": return { title: t("Low stock, strong sales", "رصيد منخفض ومبيعات قوية"), reason: t(`${fmt.qty(r.p.qty)} left vs ${fmt.qty(r.sold)} sold in period`, `المتبقي ${fmt.qty(r.p.qty)} مقابل ${fmt.qty(r.sold)} مبيع بالفترة`), action: t("Create a purchase request", "أنشئ طلب شراء") };
    }
  };
  const recSpec = useMemo<ReportSpec>(() => {
    const cols = [t("Recommendation", "التوصية"), t("Item", "الصنف"), t("Code", "الكود"), t("Branch", "الفرع"), t("Warehouse", "المخزن"), t("Reason", "السبب"), t("Qty", "الكمية"), t("Value", "القيمة"), t("Suggested action", "الإجراء المقترح")];
    const txt = recs.map((r) => { const x = recText(r); return [x.title, r.p.name, r.p.code || "—", bn(r.p.branchId), wn(r.p.whId), x.reason, fmt.qty(r.qty), fmt.money(r.value), x.action]; });
    return { title: t("Inventory recommendations", "توصيات المخزون"), cols: cols.map((label, i) => ({ label, num: i === 6 || i === 7 })), rows: recs.map((r) => { const x = recText(r); return [x.title, r.p.name, r.p.code, bn(r.p.branchId), wn(r.p.whId), x.reason, r.qty, r.value, x.action]; }), textRows: txt };
  }, [recs, t, fmt, bn, wn]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (S.tab !== "insights") return; onReport(recSpec); return () => onReport(null); }, [S.tab, recSpec, onReport]);
  const recGroups: Rec["kind"][] = ["stop_purchase", "reduce_purchase", "high_value_slow", "transfer", "restock"];

  // ── طباعة/تصدير التبويب الحالي ──
  const doPrint = (): void => { if (report.current) printSpec(report.current, { orgName, ...meta, dir, lang: l2, totals: null, note: t("Basis: weighted-average cost (products.price). Snapshot as of today.", "الأساس: متوسط التكلفة المرجّح (products.price). لقطة حتى اليوم.") }); else window.print(); };
  const doExcel = (): void => { if (report.current) exportXlsx(`inventory_${S.tab}`, [{ name: tabTitle(S.tab), spec: report.current }], dir === "rtl"); };
  const noData = !loading && prods.length === 0;

  return (
    <div dir={dir} className="p-3 sm:p-4 max-w-[1600px] mx-auto space-y-3" data-testid="inv-analytics">
      <style>{IA_CSS}</style>
      {/* العنوان */}
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <nav className="text-xs text-slate-400 mb-1" aria-label="breadcrumb">{t("Home", "الرئيسية")} / {t("Reports", "التقارير")} / <span className="text-slate-200">{t("Inventory & Products Analytics", "مركز تقارير المخزون والأصناف")}</span></nav>
          <h1 className="text-xl sm:text-2xl font-black text-slate-50 flex items-center gap-2"><Boxes className="text-blue-400" size={24} />{t("Inventory & Products Analytics", "مركز تقارير المخزون والأصناف")}</h1>
          <p className="text-xs text-slate-300 mt-1">{t("Analysis of inventory and item movement across all branches and warehouses to support better decisions.", "تحليل شامل لحركة المخزون والأصناف عبر جميع الفروع والمخازن لاتخاذ قرارات أفضل.")}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button type="button" className={BTN_SOFT} onClick={() => onNavigate?.("item-movement")} data-testid="open-item-card"><ExternalLink size={14} />{t("Item movement card", "بطاقة حركة الصنف")}</button>
          <button type="button" className={BTN_SOFT} onClick={() => set({ digits: S.digits === "en" ? "ar" : "en" })} data-testid="digits-toggle" title={t("Digit style", "شكل الأرقام")}>{S.digits === "en" ? "123" : "١٢٣"}</button>
          <button type="button" className={BTN_SOFT} onClick={() => setNonce((n) => n + 1)} disabled={loading}><RefreshCw size={14} className={loading ? "animate-spin" : ""} />{t("Refresh", "تحديث")}</button>
          <button type="button" className={BTN_SOFT} onClick={doExcel} disabled={!hasReport} data-testid="head-excel"><Download size={14} />Excel</button>
          <button type="button" className={BTN_BLUE} onClick={doPrint} data-testid="head-print"><Printer size={14} />{t("Print / PDF", "طباعة / PDF")}</button>
        </div>
      </header>

      {errs.length > 0 && <div role="alert" className="flex gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs"><AlertTriangle size={15} className="shrink-0" /><div>{errs.join(" | ")}</div></div>}
      {trunc && <div className="flex gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs"><AlertTriangle size={15} className="shrink-0" />{t("Data volume exceeded the client-side limit; results may be partial. A server-side aggregation (see SQL proposal) is recommended.", "حجم البيانات تجاوز حد المتصفح؛ قد تكون النتائج جزئية. يُنصح بالتجميع في الخادم (راجع مقترح SQL).")}</div>}

      {/* المؤشرات */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3" data-testid="kpis">
        <Kpi testId="kpi-branches" label={t("Branches", "عدد الفروع")} value={fmt.int(kpis.branches)} icon={<Boxes size={16} />} tone="text-sky-400" tab="valuation" sub={snap} />
        <Kpi testId="kpi-items" label={t("Items in stock", "عدد الأصناف")} value={fmt.int(kpis.items)} icon={<Package size={16} />} tone="text-purple-400" tab="valuation" sub={snap} />
        <Kpi testId="kpi-value" label={t("Inventory value", "قيمة المخزون")} value={fmt.money(kpis.value)} icon={<Wallet size={16} />} tone="text-blue-400" tab="valuation" sub={<span>{t("SAR · avg cost", "ر.س · متوسط التكلفة")}</span>} />
        <Kpi testId="kpi-stagnant" label={t("Stagnant items", "الأصناف الراكدة")} value={fmt.int(kpis.stagnantItems)} icon={<Package size={16} />} tone="text-orange-400" tab="stagnant" sub={kpis.noHistory > 0 ? <span>{fmt.int(kpis.noHistory)} {t("items have no history", "صنف بلا سجل حركة")}</span> : snap} />
        <Kpi testId="kpi-stagnant-value" label={t("Stagnant value", "قيمة الراكد")} value={fmt.money(kpis.stagnantValue)} icon={<Layers size={16} />} tone="text-red-400" tab="stagnant" sub={<span>{kpis.value > 0 ? fmt.pct((kpis.stagnantValue / kpis.value) * 100) : "—"} {t("of total", "من الإجمالي")}</span>} />
        <Kpi testId="kpi-low" label={t("Low-stock items", "أصناف تحت الطلب")} value={fmt.int(kpis.lowItems)} icon={<AlertTriangle size={16} />} tone="text-amber-400" tab="insights" sub={snap} />
        <Kpi testId="kpi-turnover" label={t("Inventory turnover", "معدل دوران المخزون")} value={kpis.turnover == null ? "—" : `${fmt.qty(kpis.turnover)}×`} icon={<Percent size={16} />} tone="text-emerald-400" tab="sales" sub={delta(kpis.turnover, kpis.turnoverPrev)} />
      </div>

      {/* التبويبات */}
      <nav className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="reports">
        {tabs.map((x) => <button key={x.id} role="tab" aria-selected={S.tab === x.id} data-testid={`tab-${x.id}`} onClick={() => set({ tab: x.id })} className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border text-xs font-bold whitespace-nowrap transition-colors ${S.tab === x.id ? "bg-[#0a58ca] border-[#0a58ca] text-[#fff]" : "bg-slate-900 border-slate-700 text-slate-300 hover:text-white"}`}>{x.icon}{t(x.en, x.ar)}</button>)}
      </nav>

      {/* الفلاتر */}
      <section className={`${CARD} p-3`} aria-label="filters" data-testid="filters">
        <div className="flex flex-wrap gap-3 items-end">
          <MultiSelect testId="f-branch" label={t("Branch", "الفرع")} allLabel={t("All branches", "جميع الفروع")} options={brOpts} selected={toSet(S.br)} onChange={(s) => set({ br: s ? [...s] : null, wh: null })} />
          <MultiSelect testId="f-wh" label={t("Warehouse", "المخزن")} allLabel={t("All warehouses", "جميع المخازن")} options={whOpts} selected={toSet(S.wh)} onChange={(s) => set({ wh: s ? [...s] : null })} />
          <MultiSelect testId="f-group" label={S.groupBy === "brand" ? t("Brand", "العلامة") : t("Group", "المجموعة")} allLabel={t("All groups", "جميع المجموعات")} options={grOpts} selected={toSet(S.gr)} onChange={(s) => set({ gr: s ? [...s] : null })} />
          <MultiSelect testId="f-supplier" label={t("Supplier (last purchase)", "المورد (آخر شراء)")} allLabel={t("All suppliers", "جميع الموردين")} options={suOpts} selected={toSet(S.su)} onChange={(s) => set({ su: s ? [...s] : null })} />
          <div className="min-w-[170px] flex-1"><span className={LABEL}>{t("Search item / code", "بحث بالاسم أو الكود")}</span><input className={INPUT} value={S.q} onChange={(e) => set({ q: e.target.value })} data-testid="f-q" placeholder={t("Partial name or code…", "جزء من الاسم أو الكود…")} /></div>
          <div><span className={LABEL}>{t("From", "من")}</span><input type="date" className={INPUT} value={S.from} max={S.to} onChange={(e) => set({ from: e.target.value })} data-testid="f-from" /></div>
          <div><span className={LABEL}>{t("To", "إلى")}</span><input type="date" className={INPUT} value={S.to} min={S.from} onChange={(e) => set({ to: e.target.value })} data-testid="f-to" /></div>
          <div><span className={LABEL}>{t("Group by", "التجميع حسب")}</span><select className={INPUT} value={S.groupBy} onChange={(e) => set({ groupBy: e.target.value as GroupBy, gr: null })} data-testid="f-groupby"><option value="category">{t("Category", "التصنيف")}</option><option value="brand">{t("Brand", "العلامة التجارية")}</option></select></div>
          <button type="button" className={BTN_SOFT} onClick={clearAll} data-testid="f-clear">{t("Reset", "مسح")}</button>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-slate-800">
          <Star size={14} className="text-amber-400" /><span className="text-[11px] font-bold text-slate-300">{t("Saved views", "التقارير المفضلة")}</span>
          {views.map((v) => <span key={v.name} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800 border border-slate-700 text-xs"><button type="button" className="text-slate-200 font-bold" onClick={() => setS(v.s)}>{v.name}</button><button type="button" aria-label="delete view" onClick={() => delView(v.name)} className="text-slate-500 hover:text-red-400"><Trash2 size={12} /></button></span>)}
          <input className={`${INPUT} !w-40`} value={viewName} onChange={(e) => setViewName(e.target.value)} placeholder={t("View name…", "اسم التقرير…")} data-testid="view-name" />
          <button type="button" className={BTN_SOFT} onClick={saveView} disabled={!viewName.trim()} data-testid="view-save"><Save size={14} />{t("Save filters", "حفظ الفلاتر")}</button>
          <span className="text-[11px] text-slate-400 ms-auto">{t("Filters are remembered automatically.", "يتم تذكّر آخر فلاتر تلقائيًا.")}</span>
        </div>
      </section>

      {loading && <div className={`${CARD} p-10 text-center text-sm text-slate-300`} role="status"><RefreshCw className="inline animate-spin text-blue-400 me-2" size={16} />{t("Loading inventory data…", "جارٍ تحميل بيانات المخزون…")}</div>}
      {noData && <div className={`${CARD} p-10 text-center text-sm text-slate-300`}>{t("No products found for your organization.", "لا توجد أصناف لهذه المؤسسة.")}</div>}

      {!loading && !noData && S.tab === "stagnant" && (
        <div className="space-y-3" data-testid="pane-stagnant">
          <div className={`${CARD} p-3`}>
            <div className="flex flex-wrap gap-3 items-end">
              <div><span className={LABEL}>{t("Idle period", "فترة الركود")}</span>
                <select className={INPUT} value={["30", "60", "90", "180", "365"].includes(periodSel) ? periodSel : "custom"} onChange={(e) => setPeriod(e.target.value)} data-testid="f-period">
                  {[30, 60, 90, 180, 365].map((n) => <option key={n} value={n}>{t(`More than ${n} days`, `أكثر من ${n} يوم`)}</option>)}<option value="custom">{t("Custom", "فترة مخصصة")}</option>
                </select></div>
              {periodSel === "custom" && (<>
                <div><span className={LABEL}>{t("Slow ≥ days", "بطيء ≥ يوم")}</span><input type="number" min={1} className={`${INPUT} !w-24`} value={S.slow} onChange={(e) => set({ slow: Math.max(1, Number(e.target.value) || 1) })} data-testid="f-slow" /></div>
                <div><span className={LABEL}>{t("Dead ≥ days", "راكد ≥ يوم")}</span><input type="number" min={2} className={`${INPUT} !w-24`} value={S.dead} onChange={(e) => set({ dead: Math.max(2, Number(e.target.value) || 2) })} /></div>
                <div><span className={LABEL}>{t("Severe ≥ days", "شديد ≥ يوم")}</span><input type="number" min={3} className={`${INPUT} !w-24`} value={S.severe} onChange={(e) => set({ severe: Math.max(3, Number(e.target.value) || 3) })} /></div>
              </>)}
              <div><span className={LABEL}>{t("Class", "التصنيف")}</span><select className={INPUT} value={stFilter} onChange={(e) => setStFilter(e.target.value as typeof stFilter)} data-testid="f-class">
                <option value="stagnant">{t("All stagnant", "كل الراكد")}</option><option value="slow">{t("Slow-moving", "بطيء الحركة")}</option><option value="dead">{t("Dead", "راكد")}</option><option value="severe">{t("Severely dead", "شديد الركود")}</option><option value="nohistory">{t("No movement history", "بلا سجل حركة")}</option></select></div>
              <div><span className={LABEL}>{t("Min value", "أدنى قيمة")}</span><input type="number" className={`${INPUT} !w-28`} value={vMin} onChange={(e) => setVMin(e.target.value)} data-testid="f-vmin" /></div>
              <div><span className={LABEL}>{t("Max value", "أقصى قيمة")}</span><input type="number" className={`${INPUT} !w-28`} value={vMax} onChange={(e) => setVMax(e.target.value)} /></div>
              <div><span className={LABEL}>{t("Min qty", "أدنى كمية")}</span><input type="number" className={`${INPUT} !w-24`} value={qMin} onChange={(e) => setQMin(e.target.value)} /></div>
              <div><span className={LABEL}>{t("Last sale before", "آخر بيع قبل")}</span><input type="date" className={INPUT} value={soldBefore} onChange={(e) => setSoldBefore(e.target.value)} /></div>
              <label className="flex items-center gap-2 text-xs text-slate-300 pb-2 cursor-pointer"><input type="checkbox" className="accent-blue-500" checked={S.useCreated} onChange={(e) => set({ useCreated: e.target.checked })} data-testid="f-usecreated" />{t("Use creation date when no history (estimate)", "اعتماد تاريخ الإنشاء عند غياب السجل (تقدير)")}</label>
            </div>
            <p className="text-[11px] text-slate-400 mt-2">{t(`Idle days = days since the last sale (sales invoice or sale movement). Transfers, adjustments, counts and sales returns are not sales. Items never sold are measured from their last receipt. Items with no recorded history are not classified unless you enable the estimate. Slow ≥ ${th.slow}, Dead ≥ ${th.dead}, Severe ≥ ${th.severe} days.`, `أيام الركود = الأيام منذ آخر بيع (فاتورة مبيعات أو حركة بيع). التحويل والتسوية والجرد ومرتجع المبيعات ليست بيعًا. الصنف الذي لم يُبَع يُقاس من آخر استلام. الصنف بلا سجل حركة لا يُصنَّف إلا إذا فعّلت التقدير. بطيء ≥ ${th.slow}، راكد ≥ ${th.dead}، شديد ≥ ${th.severe} يوم.`)}</p>
          </div>
          <div className="grid lg:grid-cols-3 gap-3 items-start">
            <div className="lg:col-span-2"><Panel title={`${t("Stagnant items list", "قائمة الأصناف الراكدة")} (${fmt.int(stagRows.length)})`} icon={<Package size={16} className="text-blue-400" />} pad={false}>
              <DataGrid<Row> {...grid} rows={stagRows} cols={stagCols} rowKey={(r) => String(r.p.id)} title={t("Stagnant items", "الأصناف الراكدة")} fileName="stagnant_items" selectable onRow={(r) => openItem(r.p)} defaultSort={{ id: "days", desc: true }} onReport={onReport} testId="grid-stagnant" />
            </Panel></div>
            <div className="space-y-4">
              <Panel title={t("Stagnant items by group", "توزيع الأصناف الراكدة حسب المجموعة")} icon={<Layers size={16} className="text-blue-400" />}>
                <DonutChart empty={L.empty} data={stagByGroup.slice(0, 7).map((g) => ({ label: g.label, value: g.items }))} center={<><span className="text-2xl font-black text-slate-50 tabular-nums">{fmt.int(stagRows.length)}</span><span className="text-[11px] text-slate-300">{t("idle items", "صنف راكد")}</span></>} />
              </Panel>
              <div className={`${CARD} p-4`} data-testid="stag-value"><div className="text-xs text-slate-300 font-bold">{t("Stagnant inventory value", "قيمة المخزون الراكد")}</div><div className="text-2xl font-black text-red-400 tabular-nums [direction:ltr]">{cur(stagValue)}</div>
                <div className="h-2 rounded-full bg-slate-800 mt-2 overflow-hidden"><div className="h-full bg-red-500" style={{ width: `${totalValue > 0 ? Math.min(100, (stagValue / totalValue) * 100) : 0}%` }} /></div>
                <div className="text-[11px] text-slate-400 mt-1">{totalValue > 0 ? fmt.pct((stagValue / totalValue) * 100) : "—"} {t("of total inventory", "من إجمالي المخزون")}</div></div>
              <Panel title={t("Items by idle duration", "تصنيف الأصناف حسب مدة الركود")}><HBars fmt={fmt.int} empty={L.empty} data={[{ label: t("Over 180 days", "أكثر من 180 يوم"), value: daysBuckets[0], color: "#ef4444" }, { label: "91 – 180", value: daysBuckets[1], color: "#f97316" }, { label: "61 – 90", value: daysBuckets[2], color: "#eab308" }, { label: "31 – 60", value: daysBuckets[3], color: "#3b82f6" }, { label: t("Up to 30 days", "حتى 30 يوم"), value: daysBuckets[4], color: "#10b981" }]} /></Panel>
            </div>
          </div>
        </div>
      )}

      {!loading && !noData && S.tab === "movement" && (
        <div className="space-y-3" data-testid="pane-movement">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3" data-testid="mv-sum">
            {[[t("Opening balance", "الرصيد الافتتاحي"), mvSum.opening, "text-slate-100"], [t("Total in", "إجمالي الوارد"), mvSum.inQ, "text-emerald-400"], [t("Total out", "إجمالي الصادر"), mvSum.outQ, "text-orange-400"], [t("Closing balance", "الرصيد الختامي"), mvSum.closing, "text-slate-100"], [t("Current balance", "الرصيد الحالي"), mvSum.cur, "text-blue-400"]].map(([l, v, c], i) => (
              <div key={i} className={`${CARD} p-3`}><div className="text-xs text-slate-300 font-bold">{l as string}</div><div className={`text-xl font-black tabular-nums [direction:ltr] ${c as string}`}>{fmt.qty(v as number)}</div></div>))}
          </div>
          <Panel title={t("Item movements", "حركات الأصناف")} icon={<ArrowLeftRight size={16} className="text-blue-400" />} pad={false}
            extra={<div className="flex items-center gap-2 flex-wrap"><div className="w-44"><MultiSelect label="" allLabel={t("All movement types", "كل أنواع الحركة")} options={mvTypeOpts} selected={mvTypes} onChange={setMvTypes} testId="f-mvtype" /></div>
              <select className={`${INPUT} !w-auto`} value={mvKind} onChange={(e) => setMvKind(e.target.value as typeof mvKind)} aria-label="in/out"><option value="all">{t("In & out", "وارد وصادر")}</option><option value="in">{t("In only", "وارد فقط")}</option><option value="out">{t("Out only", "صادر فقط")}</option></select></div>}>
            <DataGrid<FlowRow> {...grid} rows={flowShown} cols={flowCols} rowKey={(r) => String(r.m.id)} title={t("Item movements", "حركات الأصناف")} fileName="item_movements" onRow={(r) => openItem(r.p)} defaultSort={{ id: "date", desc: true }} onReport={onReport} testId="grid-movement" pageSizes={[50, 100, 250]} />
          </Panel>
          <Panel title={t("Monthly in / out", "حركة الوارد والصادر شهريًا")}><FlowChart labels={flowMonthly.map((m) => m.month)} a={flowMonthly.map((m) => m.inQty)} b={flowMonthly.map((m) => m.outQty)} aName={t("In", "الوارد")} bName={t("Out", "الصادر")} empty={L.empty} /></Panel>
          <p className="text-[11px] text-slate-400">{t("Balance after each movement is computed sequentially per item from its current balance minus all recorded movements (implied opening). Only movements recorded in the system appear; transfers and adjustments will show when they are used.", "الرصيد بعد كل حركة يُحسب تسلسليًا لكل صنف من رصيده الحالي مطروحًا منه كل الحركات المسجلة (الافتتاحي المُستنتج). تظهر الحركات المسجلة فقط؛ والتحويلات والتسويات ستظهر عند استخدامها.")}</p>
        </div>
      )}

      {!loading && !noData && S.tab === "aging" && (
        <div className="space-y-3" data-testid="pane-aging">
          <div className="flex gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs" data-testid="aging-basis"><AlertTriangle size={15} className="shrink-0 mt-0.5" /><div>{t("Basis: estimate, not an accounting-grade age. No cost layers exist, so current quantity is matched to the most recent receipts (oldest sold first, FIFO assumption). Quantity not covered by any recorded receipt is shown as “no receipt date” (opening stock).", "الأساس: تقدير وليس عمرًا محاسبيًا دقيقًا. لا توجد طبقات تكلفة، لذا تُطابَق الكمية الحالية بأحدث الاستلامات (الأقدم يُصرف أولًا — افتراض FIFO). الكمية التي لا يغطيها استلام مسجَّل تظهر «بلا تاريخ استلام» (رصيد افتتاحي).")}</div></div>
          <div className="grid lg:grid-cols-3 gap-3 items-start">
            <Panel title={t("Aging distribution (value)", "توزيع أعمار المخزون (القيمة)")} icon={<Clock size={16} className="text-blue-400" />}>
              <DonutChart empty={L.empty} data={ageSum.map((a, i) => ({ label: ageLabel(a.bucket), value: a.value, color: a.bucket === "unknown" ? "#64748b" : PALETTE[i % PALETTE.length], text: fmt.pct(a.pct) }))} />
            </Panel>
            <div className="lg:col-span-2"><Panel title={t("Aging summary", "ملخص الأعمار")} pad={false}>
              <DataGrid<(typeof ageSum)[number]> {...grid} rows={ageSum} cols={[
                { id: "b", label: t("Age", "العمر"), get: (r) => ageLabel(r.bucket) }, { id: "i", label: t("Items", "الأصناف"), kind: "int", get: (r) => r.items }, { id: "q", label: t("Qty", "الكمية"), kind: "qty", get: (r) => r.qty },
                { id: "v", label: t("Value", "القيمة"), kind: "money", get: (r) => r.value }, { id: "p", label: t("Share", "النسبة"), kind: "pct", get: (r) => r.pct }]} rowKey={(r) => r.bucket} title={t("Aging summary", "ملخص أعمار المخزون")} fileName="inventory_aging_summary" pageSizes={[10]} testId="grid-aging-sum" />
            </Panel></div>
          </div>
          <Panel title={t("Aging by item", "الأعمار حسب الصنف")} pad={false}>
            <DataGrid<AgeRow> {...grid} rows={ageRows} cols={ageCols} rowKey={(r) => String(r.p.id)} title={t("Aging by item", "أعمار المخزون حسب الصنف")} fileName="inventory_aging" selectable onRow={(r) => openItem(r.p)} defaultSort={{ id: "value", desc: true }} onReport={onReport} testId="grid-aging" />
          </Panel>
        </div>
      )}

      {!loading && !noData && S.tab === "sales" && (
        <div className="space-y-3" data-testid="pane-sales">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[[t("Net sales (period)", "صافي المبيعات (الفترة)"), cur(salesTot.net), "text-blue-400"], [t("Previous period", "الفترة السابقة"), cur(salesTot.prev), "text-slate-100"], [t("Qty sold (net)", "الكمية المباعة (صافي)"), fmt.qty(salesTot.qty), "text-emerald-400"], [t("In-stock items with no sales", "أصناف بالمخزون بلا مبيعات"), fmt.int(salesTot.unsold), "text-orange-400"]].map(([l, v, c], i) => (
              <div key={i} className={`${CARD} p-3`}><div className="text-xs text-slate-300 font-bold">{l}</div><div className={`text-xl font-black tabular-nums [direction:ltr] ${c}`}>{v}</div>{i === 0 && <div className="text-[11px] mt-0.5">{delta(salesTot.net, salesTot.prev)}</div>}</div>))}
          </div>
          {matchInfo.all > 0 && matchInfo.ok < matchInfo.all && <div className="flex gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs" data-testid="match-warn"><AlertTriangle size={15} className="shrink-0" />{t(`${fmt.int(matchInfo.all - matchInfo.ok)} of ${fmt.int(matchInfo.all)} sales lines could not be matched to an item (older invoices lack product_id) and are excluded from item rankings.`, `تعذّرت مطابقة ${fmt.int(matchInfo.all - matchInfo.ok)} من ${fmt.int(matchInfo.all)} بند مبيعات بصنف (الفواتير الأقدم بلا product_id) وهي مستبعدة من ترتيب الأصناف.`)}</div>}
          <div className="flex flex-wrap gap-2">
            {(["best", "worst", "none"] as const).map((m) => <button key={m} type="button" data-testid={`sm-${m}`} onClick={() => setSMode(m)} className={`px-4 py-2 rounded-xl border text-xs font-bold ${sMode === m ? "bg-[#0a58ca] border-[#0a58ca] text-[#fff]" : "bg-slate-900 border-slate-700 text-slate-300"}`}>{m === "best" ? t("Top sellers", "الأعلى مبيعًا") : m === "worst" ? t("Lowest sellers", "الأقل مبيعًا") : t("No sales in period", "بلا مبيعات في الفترة")}</button>)}
            <select className={`${INPUT} !w-auto`} value={sMetric} onChange={(e) => setSMetric(e.target.value as "net" | "qty")} aria-label="metric" disabled={sMode === "none"}><option value="net">{t("Rank by net sales", "الترتيب بصافي المبيعات")}</option><option value="qty">{t("Rank by quantity", "الترتيب بالكمية")}</option></select>
          </div>
          <div className="grid lg:grid-cols-3 gap-3 items-start">
            <div className="lg:col-span-2"><Panel title={sMode === "best" ? t("Top selling items", "أعلى الأصناف مبيعًا") : sMode === "worst" ? t("Lowest selling items", "أقل الأصناف مبيعًا") : t("Items with no sales", "أصناف بلا مبيعات")} icon={<BarChart3 size={16} className="text-blue-400" />} pad={false}>
              <DataGrid<RankRow> key={`${sMode}${sMetric}`} {...grid} rows={rankRows} cols={rankCols} rowKey={(r) => String(r.p.id)} title={t("Sales ranking", "ترتيب المبيعات")} fileName="sales_ranking" selectable onRow={(r) => openItem(r.p)} onReport={onReport} testId="grid-sales" />
            </Panel></div>
            <div className="space-y-4">
              <Panel title={t("Period comparison", "مقارنة المبيعات بين الفترات")}><HBars fmt={cur} empty={L.empty} data={[{ label: `${fmt.date(S.from)} → ${fmt.date(S.to)}`, value: salesTot.net, color: "#3b82f6" }, { label: `${fmt.date(prevFrom)} → ${fmt.date(prevTo)}`, value: salesTot.prev, color: "#a855f7" }]} /></Panel>
              <Panel title={t("Top 8 by selected metric", "أعلى 8 حسب المقياس")}><HBars fmt={sMetric === "net" ? cur : fmt.qty} empty={L.empty} data={ranks.filter((r) => (sMetric === "net" ? r.net : r.qty) > 0).sort((a, b) => (sMetric === "net" ? b.net - a.net : b.qty - a.qty)).slice(0, 8).map((r) => ({ label: r.p.name, value: sMetric === "net" ? r.net : r.qty }))} /></Panel>
            </div>
          </div>
          <p className="text-[11px] text-slate-400">{t("Net = sales minus sales returns (returns are never counted as positive sales). Margin uses the current weighted-average cost, so it is indicative, not historical. Each row is an item in a specific branch/warehouse.", "الصافي = المبيعات ناقص مرتجعات المبيعات (المرتجع لا يُحسب مبيعًا إيجابيًا). الهامش بمتوسط التكلفة الحالي فهو استرشادي وليس تاريخيًا. كل صف هو صنف في فرع/مخزن محدد.")}</p>
        </div>
      )}

      {!loading && !noData && S.tab === "valuation" && (
        <div className="space-y-3" data-testid="pane-valuation">
          <div className="grid grid-cols-3 gap-3">
            <div className={`${CARD} p-3`}><div className="text-xs text-slate-300 font-bold">{t("Total inventory value", "إجمالي قيمة المخزون")}</div><div className="text-xl font-black text-blue-400 tabular-nums [direction:ltr]" data-testid="val-total">{cur(kpis.value)}</div></div>
            <div className={`${CARD} p-3`}><div className="text-xs text-slate-300 font-bold">{t("Total quantity", "إجمالي الكميات")}</div><div className="text-xl font-black text-slate-100 tabular-nums [direction:ltr]">{fmt.qty(valRows.reduce((s, r) => s + r.p.qty, 0))}</div></div>
            <div className={`${CARD} p-3`}><div className="text-xs text-slate-300 font-bold">{t("Items", "عدد الأصناف")}</div><div className="text-xl font-black text-purple-400 tabular-nums [direction:ltr]">{fmt.int(valRows.length)}</div></div>
          </div>
          <nav className="flex items-center gap-2 text-xs flex-wrap" aria-label="drill" data-testid="drill-crumbs">
            <button type="button" className="text-blue-400 font-bold underline" onClick={() => setDrill({ branch: null, wh: undefined })}>{t("All branches", "جميع الفروع")}</button>
            {drill.branch != null && <><ArrowRight size={12} className={isRTL ? "rotate-180 text-slate-500" : "text-slate-500"} /><button type="button" className="text-blue-400 font-bold underline" onClick={() => setDrill({ branch: drill.branch, wh: undefined })}>{bn(drill.branch)}</button></>}
            {drill.wh !== undefined && <><ArrowRight size={12} className={isRTL ? "rotate-180 text-slate-500" : "text-slate-500"} /><span className="text-slate-200 font-bold">{wn(drill.wh)}</span></>}
          </nav>
          <Panel title={drill.branch == null ? t("Value by branch", "القيمة حسب الفرع") : drill.wh === undefined ? t("Value by warehouse", "القيمة حسب المخزن") : t("Items", "الأصناف")} icon={<Layers size={16} className="text-blue-400" />} pad={false}>
            {drill.wh !== undefined
              ? <DataGrid<Row> {...grid} rows={valItems} cols={itemCols} rowKey={(r) => String(r.p.id)} title={t("Inventory valuation", "تقييم المخزون")} fileName="inventory_valuation_items" onRow={(r) => openItem(r.p)} defaultSort={{ id: "value", desc: true }} onReport={onReport} testId="grid-val-items" />
              : <DataGrid<Agg2> {...grid} rows={drill.branch == null ? byBranch : byWh} cols={aggCols(drill.branch == null ? t("Branch", "الفرع") : t("Warehouse", "المخزن"))} rowKey={(r) => r.key} title={drill.branch == null ? t("Value by branch", "القيمة حسب الفرع") : t("Value by warehouse", "القيمة حسب المخزن")} fileName="inventory_valuation" onRow={(r) => (drill.branch == null ? setDrill({ branch: r.key === "" ? null : Number(r.key), wh: undefined }) : setDrill({ branch: drill.branch, wh: r.key === "" ? null : Number(r.key) }))} defaultSort={{ id: "value", desc: true }} onReport={onReport} testId="grid-val" />}
          </Panel>
          <div className="grid lg:grid-cols-3 gap-3 items-start">
            <Panel title={t("Value by group", "القيمة حسب المجموعة")}><HBars fmt={cur} empty={L.empty} data={byGroup.slice(0, 8).map((g) => ({ label: g.label, value: g.value }))} /></Panel>
            <Panel title={t("Value by supplier (last purchase)", "القيمة حسب المورد (آخر شراء)")}><HBars fmt={cur} empty={L.empty} color="#a855f7" data={bySupplier.slice(0, 8).map((g) => ({ label: g.label, value: g.value }))} /></Panel>
            <Panel title={t("Highest-value items", "الأصناف الأعلى قيمة")}><HBars fmt={cur} empty={L.empty} color="#10b981" data={[...valRows].sort((a, b) => b.value - a.value).slice(0, 8).map((r) => ({ label: r.p.name, value: r.value }))} /></Panel>
          </div>
          <Panel title={t("High value & weak movement", "أصناف عالية القيمة وحركتها ضعيفة")} icon={<AlertTriangle size={16} className="text-amber-400" />} pad={false}>
            <DataGrid<Row> {...grid} rows={hiLow} cols={itemCols} rowKey={(r) => String(r.p.id)} title={t("High value & weak movement", "عالية القيمة وضعيفة الحركة")} fileName="high_value_slow" onRow={(r) => openItem(r.p)} pageSizes={[10]} testId="grid-hilow" />
          </Panel>
          <p className="text-[11px] text-slate-400">{t("Valuation = quantity × products.price (the weighted-average cost the system maintains). No other costing method is assumed.", "التقييم = الكمية × products.price (متوسط التكلفة المرجّح الذي يحافظ عليه النظام). لم يُفترض أي أسلوب تكلفة آخر.")}</p>
        </div>
      )}

      {!loading && !noData && S.tab === "suppliers" && (
        <div className="space-y-3" data-testid="pane-suppliers">
          <div className="flex gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs" data-testid="sup-basis"><AlertTriangle size={15} className="shrink-0 mt-0.5" />{t("There is no item↔supplier master link in the database. An item is attributed to the supplier of its most recent posted purchase invoice (document-based). Items never purchased through an invoice have no supplier.", "لا توجد علاقة رئيسية صنف↔مورد في قاعدة البيانات. يُنسَب الصنف لمورد آخر فاتورة شراء مرحّلة تحتويه (أساس مستندي). الأصناف التي لم تُشترَ بفاتورة بلا مورد.")}</div>
          <Panel title={t("Supplier inventory analysis", "تحليل مخزون الموردين")} icon={<Truck size={16} className="text-blue-400" />} pad={false}>
            <DataGrid<SupRow> {...grid} rows={supRows} cols={supCols} rowKey={(r) => r.supplier} title={t("Supplier analysis", "تحليل الموردين")} fileName="supplier_analysis" defaultSort={{ id: "p", desc: true }} onReport={onReport} testId="grid-suppliers" />
          </Panel>
          <div className="grid md:grid-cols-2 gap-3 items-start">
            <Panel title={t("Stock value by supplier", "قيمة المخزون حسب المورد")}><HBars fmt={cur} empty={L.empty} data={supRows.filter((r) => r.value > 0).slice(0, 8).map((r) => ({ label: r.supplier, value: r.value }))} /></Panel>
            <Panel title={t("Stagnant value by supplier", "قيمة الراكد حسب المورد")}><HBars fmt={cur} empty={L.empty} color="#ef4444" data={[...supRows].filter((r) => r.stagnantValue > 0).sort((a, b) => b.stagnantValue - a.stagnantValue).slice(0, 8).map((r) => ({ label: r.supplier, value: r.stagnantValue }))} /></Panel>
          </div>
        </div>
      )}

      {!loading && !noData && S.tab === "insights" && (
        <div className="space-y-3" data-testid="pane-insights">
          <Panel title={t("Inventory Insights & Recommendations", "التوصيات وقرارات المخزون")} icon={<Lightbulb size={16} className="text-amber-400" />}>
            <p className="text-[11px] text-slate-400 mb-3">{t("Recommendations are computed from actual data and are advisory only — nothing is executed automatically.", "التوصيات مبنية على البيانات الفعلية وهي استشارية فقط — لا يُنفَّذ أي إجراء تلقائيًا.")}</p>
            {recs.length === 0 && <div className="p-6 text-center text-xs text-slate-400">{t("No recommendations for the current data.", "لا توصيات للبيانات الحالية.")}</div>}
            {recGroups.map((k) => { const list = recs.filter((r) => r.kind === k); if (!list.length) return null; return (
              <div key={k} className="mb-4" data-testid={`rec-${k}`}>
                <h4 className="text-xs font-black text-slate-100 mb-2">{recText(list[0]).title} <span className="text-slate-400 font-bold">({fmt.int(list.length)})</span></h4>
                <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-xs border-collapse"><thead><tr className="text-[11px] text-slate-400 border-b border-slate-800">
                  <th className="text-start p-2">{t("Item", "الصنف")}</th><th className="text-start p-2">{t("Branch / Warehouse", "الفرع / المخزن")}</th><th className="text-start p-2">{t("Reason", "السبب")}</th><th className="text-end p-2">{t("Qty", "الكمية")}</th><th className="text-end p-2">{t("Value", "القيمة")}</th><th className="text-start p-2">{t("Suggested action", "الإجراء المقترح")}</th></tr></thead>
                  <tbody className="divide-y divide-slate-800/60">{list.map((r) => { const x = recText(r); return (
                    <tr key={`${k}${r.p.id}`} className="hover:bg-slate-800/40 cursor-pointer" onClick={() => openItem(r.p)}>
                      <td className="p-2 text-slate-100 font-semibold">{r.p.name}<div className="text-[11px] text-slate-400 [direction:ltr] text-start">{r.p.code}</div></td>
                      <td className="p-2 text-slate-200">{bn(r.p.branchId)} / {wn(r.p.whId)}</td><td className="p-2 text-slate-300">{x.reason}</td>
                      <td className="p-2 text-end tabular-nums [direction:ltr] font-semibold text-slate-100">{fmt.qty(r.qty)}</td><td className="p-2 text-end tabular-nums [direction:ltr] font-semibold text-slate-100">{fmt.money(r.value)}</td><td className="p-2 text-slate-200">{x.action}</td></tr>); })}</tbody></table></div>
              </div>); })}
          </Panel>
          <div className="grid lg:grid-cols-3 gap-3 items-start" data-testid="insight-charts">
            <Panel title={t("Stagnant items by group", "توزيع الراكد حسب المجموعة")}><DonutChart empty={L.empty} size={150} data={aggregate(rows.filter((r) => isStagnant(r.st.status)).map((r) => r.p), (p) => groupOf(p, S.groupBy), gl).slice(0, 6).map((g) => ({ label: g.label, value: g.items }))} /></Panel>
            <Panel title={t("Stock value by branch", "قيمة المخزون حسب الفرع")}><HBars fmt={cur} empty={L.empty} data={byBranch.slice(0, 8).map((g) => ({ label: g.label, value: g.value }))} /></Panel>
            <Panel title={t("Stock value by supplier", "قيمة المخزون حسب المورد")}><HBars fmt={cur} empty={L.empty} color="#a855f7" data={bySupplier.slice(0, 8).map((g) => ({ label: g.label, value: g.value }))} /></Panel>
            <Panel title={t("Monthly in / out", "الوارد والصادر شهريًا")}><FlowChart labels={flowMonthly.map((m) => m.month)} a={flowMonthly.map((m) => m.inQty)} b={flowMonthly.map((m) => m.outQty)} aName={t("In", "الوارد")} bName={t("Out", "الصادر")} empty={L.empty} /></Panel>
            <Panel title={t("Aging distribution", "توزيع أعمار المخزون")}><DonutChart empty={L.empty} size={150} data={ageSum.map((a, i) => ({ label: ageLabel(a.bucket), value: a.value, color: a.bucket === "unknown" ? "#64748b" : PALETTE[i % PALETTE.length], text: fmt.pct(a.pct) }))} /></Panel>
            <Panel title={t("Sales: period vs previous", "مقارنة المبيعات بين الفترات")}><HBars fmt={cur} empty={L.empty} data={[{ label: t("This period", "هذه الفترة"), value: salesTot.net, color: "#3b82f6" }, { label: t("Previous period", "الفترة السابقة"), value: salesTot.prev, color: "#a855f7" }]} /></Panel>
          </div>
        </div>
      )}
      {/* مراجع للتحقق في الاختبارات */}
      <span className="sr-only" data-testid="meta" data-rows={rows.length} data-low={rows.filter((r) => isLow(r.p)).length} data-supplied={supRef.size} />
    </div>
  );
}
