// =============================================================
// src/pages/ReportsPage.tsx — «التقارير»: تقرير المخزون والطلبات (تشغيلي).
// عتبة النقص موحّدة مع «مركز التنبيهات» (مستوى إعادة الطلب ← الحد الأدنى ← 2) فلا تختلف الأعداد بين الصفحتين.
// الطلبات حسب الفترة المختارة وللفرع/الفروع المحددة؛ المخزون لقطة حالية. ثنائي اللغة · الثيمان · Excel وطباعة.
// =============================================================
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, AlertTriangle, Archive, BarChart3, CheckCircle2, DollarSign, LayoutDashboard, Package, RefreshCcw, ShoppingCart, Star, TrendingUp, Layers } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../context/LanguageContext";
import * as DB from "./lib/accountingDb";
import type { Page } from "../components/Layout";
import { DEFAULT_THRESHOLD, ymd } from "./alerts/alertsLogic";
import { CARD, Donut, EmptyState, Kpi, Loading, OutBtns, PageHead, PeriodBar, SectionCard, Warn, fmtInt, money } from "./reports/reportingKit";
import { inventoryHealth, orderStats, rangeFor, type RangeKey, type StockFlag } from "./reports/reportsLogic";
import { fetchOrdersPaged, fetchProductsPaged, fetchTopOrdered, type Paged, type TopOrdered } from "./reports/reportsApi";
import { exportBook, printReportDoc, stamp } from "./reports/reportsOut";
import type { OrderLite, StockProd } from "./reports/reportsLogic";

type Props = { onNavigate?: (p: Page) => void };
const KEYS: RangeKey[] = ["month", "prev_month", "quarter", "year", "last_year", "custom"];
const CAT_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#a855f7", "#ef4444", "#06b6d4", "#64748b", "#ec4899"];
const RANK_COLORS = ["#00A86B", "#3b82f6", "#f59e0b", "#8b5cf6", "#ef4444"];

function Health({ label, count, total, color, icon: Icon, tid }: { label: string; count: number; total: number; color: string; icon: typeof CheckCircle2; tid: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div data-testid={tid} className="bg-slate-800/30 p-4 rounded-xl border border-slate-800/50">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5"><Icon size={16} className={color.replace("bg-", "text-")} /><span className="text-slate-300 text-sm font-medium">{label}</span></div>
        <div className="flex items-center gap-2"><span className="text-white font-black text-sm">{count}</span><span className="text-slate-500 text-[10px] font-bold">/ {total}</span></div>
      </div>
      <div className="h-2 bg-slate-950 rounded-full overflow-hidden"><div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} /></div>
      <div className="flex justify-end mt-1"><span className="text-[10px] font-bold text-slate-500">{pct}%</span></div>
    </div>
  );
}

export default function ReportsPage({ onNavigate }: Props) {
  const { t, lang } = useLang();
  const { ownedShopId, branches, loading: authLoading } = (useAuth() as unknown as { ownedShopId: number | null; branches: { id: number; name: string }[]; loading: boolean }) ?? { ownedShopId: null, branches: [], loading: false };
  const branchList = useMemo(() => (Array.isArray(branches) ? branches : []), [branches]);
  const today = ymd(new Date());
  const [range, setRange] = useState<RangeKey>("month");
  const [cFrom, setCFrom] = useState(today.slice(0, 8) + "01");
  const [cTo, setCTo] = useState(today);
  const [fBranch, setFBranch] = useState("");
  const [loading, setLoading] = useState(true);
  const [stock, setStock] = useState<Paged<StockProd> | null>(null);
  const [orders, setOrders] = useState<Paged<OrderLite & { id: number }> | null>(null);
  const [top, setTop] = useState<TopOrdered[]>([]);
  const seq = useRef(0);

  const { from, to } = useMemo(() => rangeFor(range, today, { from: cFrom, to: cTo }), [range, today, cFrom, cTo]);
  const branchId = fBranch ? Number(fBranch) : null;
  const shopIds = useMemo(() => (branchId ? [branchId] : branchList.length ? branchList.map((b) => b.id) : ownedShopId ? [ownedShopId] : []), [branchId, branchList, ownedShopId]);

  const reload = useCallback(async () => {
    if (!shopIds.length) { setLoading(false); return; } const my = ++seq.current; setLoading(true);
    const [s, o] = await Promise.all([fetchProductsPaged(shopIds), fetchOrdersPaged(shopIds)]);
    const ids = o.rows.filter((x) => { const d = (x.created_at || "").slice(0, 10); return d >= from && d <= to; }).map((x) => x.id);
    const tp = ids.length ? await fetchTopOrdered(ids, 5) : [];
    if (my !== seq.current) return; setStock(s); setOrders(o); setTop(tp); setLoading(false);
  }, [shopIds, from, to]);
  useEffect(() => { if (authLoading) return; void reload(); }, [authLoading, reload]);

  const health = useMemo(() => (stock ? inventoryHealth(stock.rows, DEFAULT_THRESHOLD, t("Uncategorized", "غير مصنّف")) : null), [stock, t]);
  const ost = useMemo(() => (orders ? orderStats(orders.rows, from, to) : null), [orders, from, to]);
  const reorder = useMemo<StockFlag[]>(() => (health ? [...health.out, ...health.low] : []), [health]);
  const urgency = (p: StockFlag): "high" | "medium" | "low" => (p.qty <= 0 ? "high" : p.qty <= p.thr / 2 ? "medium" : "low");
  const uLabel = { high: t("Immediate", "فوري"), medium: t("Urgent", "عاجل"), low: t("Soon", "قريبًا") };
  const statusOf = (p: StockFlag): "healthy" | "low" | "critical" => (p.qty <= 0 ? "critical" : p.qty <= p.thr ? "low" : "healthy");
  const sLabel = { healthy: t("Healthy", "سليم"), low: t("Low", "منخفض"), critical: t("Out", "نافد") };
  const sCls = { healthy: "text-emerald-400 bg-emerald-500/10", low: "text-amber-400 bg-amber-500/10", critical: "text-red-400 bg-red-500/10" };
  const ymLabel = (ym: string) => new Intl.DateTimeFormat(lang === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-US", { month: "short", timeZone: "UTC" }).format(new Date(`${ym}-15T00:00:00Z`));
  const scope = `${from} → ${to} · ${branchId ? branchList.find((b) => b.id === branchId)?.name ?? "" : t("All branches", "كل الفروع")}`;
  const thrNote = t(`Low-stock threshold = reorder level, else minimum quantity, else ${DEFAULT_THRESHOLD}.`, `حدّ النقص = مستوى إعادة الطلب، وإلا الحد الأدنى، وإلا ${DEFAULT_THRESHOLD}.`);

  const reorderCols = [{ label: t("Product", "الصنف") }, { label: t("Qty", "الكمية"), num: true }, { label: t("Threshold", "الحدّ"), num: true }, { label: t("Urgency", "الأولوية") }];
  const reorderRows = () => reorder.map((p) => [p.name, p.qty, p.thr, uLabel[urgency(p)]]);
  const doPrint = async () => {
    const org = await DB.getOrgForBranch(ownedShopId ?? null); if (!org) return;
    await printReportDoc({ title: t("Reorder list", "قائمة إعادة الطلب"), subtitle: `${t("Stock snapshot", "لقطة المخزون")} — ${t("All selected branches", "الفروع المحددة")}`, cols: reorderCols, rows: reorderRows(), note: thrNote }, { orgId: org.id, shopId: ownedShopId ?? null, orgName: org.name, lang });
  };
  const doExcel = () => {
    if (!health || !ost) return;
    exportBook(`reports-${stamp()}`, [
      { name: t("Summary", "الملخص"), cols: [t("Indicator", "المؤشر"), t("Value", "القيمة")], rows: [[t("Items", "الأصناف"), health.items], [t("Units", "الوحدات"), health.units], [t("Stock value", "قيمة المخزون"), health.value], [t("Low stock", "منخفض"), health.low.length], [t("Out of stock", "نافد"), health.out.length], [t("Orders received", "طلبات مستلمة"), ost.received], [t("Orders completed", "طلبات مكتملة"), ost.completed], [t("Orders pending", "طلبات معلقة"), ost.pending], [t("Orders rejected", "طلبات مرفوضة"), ost.rejected], [t("Completed orders value", "قيمة الطلبات المكتملة"), ost.sales]] },
      { name: t("Reorder list", "إعادة الطلب"), cols: reorderCols.map((c) => c.label), rows: reorderRows() },
      { name: t("Stock by category", "المخزون حسب التصنيف"), cols: [t("Category", "التصنيف"), t("Items", "الأصناف"), t("Value", "القيمة")], rows: health.byCategory.map((c) => [c.name, c.items, c.value]) },
      { name: t("Monthly orders", "الطلبات شهريًا"), cols: [t("Month", "الشهر"), t("Orders", "الطلبات")], rows: ost.monthly.map((m) => [m.ym, m.count]) },
      { name: t("Most ordered", "الأكثر طلبًا"), cols: [t("Product", "الصنف"), t("Code", "الرمز"), t("Units", "الوحدات")], rows: top.map((p) => [p.name, p.code, p.qty]) },
    ], lang === "ar");
  };

  if (!authLoading && !shopIds.length) {
    return <div className="flex flex-col items-center justify-center min-h-[400px] text-center px-4" data-rpt data-testid="reports-page"><div className="bg-red-500/10 p-6 rounded-full mb-4"><Archive size={48} className="text-red-500" /></div><h2 className="text-white text-xl font-black mb-2">{t("No shop linked to this account", "لم يتم العثور على محل مرتبط بهذا الحساب")}</h2></div>;
  }
  const maxM = Math.max(...(ost?.monthly.map((m) => m.count) ?? [0]), 1);
  const errors = [stock?.error, orders?.error].filter(Boolean) as string[];

  return (
    <div className="pb-20 p-4 lg:p-6 space-y-5" dir={lang === "ar" ? "rtl" : "ltr"} data-rpt data-testid="reports-page">
      <PageHead icon={LayoutDashboard} title={t("Business Reports", "تقارير الأعمال")} sub={`${t("Inventory intelligence and order performance", "ذكاء المخزون وأداء الطلبات")} — ${scope}`}>
        <PeriodBar range={range} onRange={setRange} from={cFrom} to={cTo} onFrom={setCFrom} onTo={setCTo} branches={branchList} branch={fBranch} onBranch={setFBranch} loading={loading} onRefresh={() => void reload()} keys={KEYS} />
        <OutBtns onExcel={doExcel} onPrint={() => void doPrint()} disabled={!health || loading} printLabel={t("Print reorder list", "طباعة قائمة إعادة الطلب")} />
      </PageHead>

      {loading || !health || !ost ? <Loading label={t("Analyzing data…", "جاري تحليل البيانات…")} /> : (
        <>
          {(errors.length > 0 || stock?.truncated || orders?.truncated) && (
            <div className="space-y-2">
              {errors.length > 0 && <div data-testid="warn-error"><Warn>{t("Some data could not be loaded: ", "تعذّر تحميل بعض البيانات: ")}{errors[0]}</Warn></div>}
              {(stock?.truncated || orders?.truncated) && <div data-testid="warn-truncated"><Warn>{t("Data volume exceeds the loading limit — figures may be incomplete.", "حجم البيانات يتجاوز حدّ التحميل — قد تكون الأرقام ناقصة.")}</Warn></div>}
            </div>
          )}
          {health.negative > 0 && <div data-testid="warn-negative"><Warn><b>{health.negative}</b> {t("item(s) have negative quantity — review them in stock adjustments.", "صنف بكمية سالبة — راجعها في تسويات المخزون.")}</Warn></div>}

          <section className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
            <Kpi id="k-items" label={t("Total items", "إجمالي الأصناف")} value={fmtInt(health.items)} tone="slate" icon={BarChart3} onClick={() => onNavigate?.("inventory")} />
            <Kpi id="k-units" label={t("Total units", "إجمالي القطع")} value={fmtInt(health.units)} tone="blue" icon={Package} />
            <Kpi id="k-value" label={t("Stock value", "قيمة المخزون")} value={money(health.value)} tone="emerald" icon={DollarSign} hint={t("at unit cost", "بسعر التكلفة")} />
            <Kpi id="k-low" label={t("Low-stock alerts", "تنبيهات المنخفض")} value={fmtInt(health.low.length + health.out.length)} tone="amber" icon={AlertTriangle} hint={`${health.out.length} ${t("out", "نافد")}`} onClick={() => onNavigate?.("alerts")} />
          </section>

          <SectionCard title={t("Order statistics", "إحصائيات الطلبات")} icon={ShoppingCart} extra={<button data-testid="go-orders" onClick={() => onNavigate?.("orders")} className="text-[11px] font-bold text-blue-400 hover:underline">{t("Open orders", "فتح الطلبات")}</button>}>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {[
                { id: "received", label: t("Received", "مستلمة"), value: fmtInt(ost.received), color: "text-white", bg: "bg-slate-800/60 border-slate-700" },
                { id: "completed", label: t("Completed", "مكتملة"), value: fmtInt(ost.completed), color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
                { id: "pending", label: t("Pending", "معلّقة"), value: fmtInt(ost.pending), color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
                { id: "rejected", label: t("Rejected", "مرفوضة"), value: fmtInt(ost.rejected), color: "text-red-400", bg: "bg-red-500/10 border-red-500/20" },
                { id: "sales", label: t("Completed value", "قيمة المكتملة"), value: money(ost.sales), color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
              ].map((s) => (
                <div key={s.id} data-testid={`ord-${s.id}`} className={`rounded-2xl p-4 border ${s.bg} text-center`}>
                  <p className={`text-xl font-black tabular-nums ${s.color}`}><bdi dir="ltr">{s.value}</bdi></p>
                  <p className="text-slate-500 text-[10px] font-bold mt-1">{s.label}</p>
                </div>
              ))}
            </div>
            <p data-testid="ord-rate" className="text-[11px] text-slate-500 mt-3">{t("Completion rate", "نسبة الإنجاز")}: <b className="text-slate-300"><bdi dir="ltr">{ost.completionRate == null ? "—" : `${ost.completionRate}%`}</bdi></b></p>
          </SectionCard>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SectionCard title={t("Monthly orders", "الطلبات الشهرية")} icon={BarChart3} extra={<span className="text-[10px] text-slate-500">{t("last 6 months to period end", "آخر 6 أشهر حتى نهاية الفترة")}</span>}>
              <div data-testid="monthly-orders" className="flex items-end gap-2 h-36">
                {ost.monthly.map((m) => (
                  <div key={m.ym} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end" title={`${m.ym}: ${m.count}`}>
                    <span className="text-[10px] text-slate-400 font-bold tabular-nums">{m.count > 0 ? m.count : ""}</span>
                    <div className="w-full rounded-t-lg" style={{ height: `${Math.max((m.count / maxM) * 100, 4)}%`, background: "linear-gradient(180deg,#3b82f6,#1d4ed8)" }} />
                    <span className="text-[9px] text-slate-500 font-bold truncate w-full text-center">{ymLabel(m.ym)}</span>
                  </div>
                ))}
              </div>
            </SectionCard>
            <SectionCard title={t("Most ordered", "الأكثر طلبًا")} icon={Star}>
              {top.length === 0 ? <EmptyState label={t("No orders in this period", "لا توجد طلبات في هذه الفترة")} /> : (
                <div data-testid="top-ordered" className="space-y-3">{top.map((p, i) => { const pct = Math.round((p.qty / (top[0]?.qty || 1)) * 100); const c = RANK_COLORS[i % 5]; return (
                  <div key={p.product_id} className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black shrink-0" style={{ background: c + "1a", color: c, border: `1px solid ${c}33` }}>{i + 1}</div>
                    <div className="flex-1 min-w-0"><div className="flex items-center justify-between mb-1 gap-2"><span className="text-slate-200 text-xs font-bold truncate">{p.name}</span><span className="text-xs font-black tabular-nums shrink-0 text-slate-300">{fmtInt(p.qty)} {t("units", "وحدة")}</span></div>
                      <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: c }} /></div></div>
                  </div>); })}</div>
              )}
            </SectionCard>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <section className="lg:col-span-4 space-y-3">
              <div className={`${CARD} p-5`}>
                <div className="flex items-center gap-2.5 mb-4"><Activity className="text-emerald-500" size={18} /><h3 className="text-white font-black text-sm">{t("Inventory health index", "مؤشر صحة المخزون")}</h3></div>
                <div className="space-y-3">
                  <Health tid="h-healthy" label={t("Healthy stock", "مخزون سليم")} count={health.healthy} total={health.items} color="bg-emerald-500" icon={CheckCircle2} />
                  <Health tid="h-low" label={t("Low stock", "مخزون منخفض")} count={health.low.length} total={health.items} color="bg-amber-500" icon={AlertTriangle} />
                  <Health tid="h-out" label={t("Out of stock", "نافد")} count={health.out.length} total={health.items} color="bg-red-500" icon={RefreshCcw} />
                </div>
                <p className="text-[10px] text-slate-500 mt-3">{thrNote}</p>
              </div>
              <SectionCard title={t("Stock value by category", "قيمة المخزون حسب التصنيف")} icon={Layers}>
                <Donut data={health.byCategory.slice(0, 8).map((c, i) => ({ label: c.name, value: c.value, color: CAT_COLORS[i % CAT_COLORS.length] }))} size={130} />
              </SectionCard>
            </section>

            <div className="lg:col-span-8"><SectionCard title={t("Top inventory holdings (by value)", "أعلى الأصناف قيمةً في المخزون")} icon={TrendingUp} pad={false}>
              <div className="overflow-x-auto" data-testid="top-holdings">
                {health.top.length === 0 ? <EmptyState label={t("No data — add products to see reports.", "لا توجد بيانات — أضف أصنافًا لعرض التقارير.")} /> : (
                  <table className="w-full text-xs text-start"><thead><tr className="text-slate-500 text-[10px] font-bold border-b border-slate-800"><th scope="col" className="px-4 py-3 text-start">{t("Product", "الصنف")}</th><th scope="col" className="px-4 py-3 text-center">{t("Qty", "الكمية")}</th><th scope="col" className="px-4 py-3 text-end">{t("Value", "القيمة")}</th><th scope="col" className="px-4 py-3 text-center">{t("Status", "الحالة")}</th></tr></thead>
                    <tbody className="divide-y divide-slate-800/50">{health.top.map((p, i) => { const s = statusOf(p); return (
                      <tr key={i} data-testid="hold-row"><td className="px-4 py-3 text-slate-200 font-bold truncate max-w-[240px]">{p.name}</td><td className="px-4 py-3 text-center text-blue-400 font-mono font-black">{fmtInt(p.qty)}</td><td className="px-4 py-3 text-end font-mono text-slate-300"><bdi dir="ltr">{money(p.value)}</bdi></td><td className="px-4 py-3 text-center"><span className={`px-2 py-1 rounded-md text-[10px] font-black ${sCls[s]}`}>{sLabel[s]}</span></td></tr>); })}</tbody></table>
                )}
              </div>
            </SectionCard></div>
          </div>

          <SectionCard title={t("Procurement center — items to reorder", "مركز التوريد — أصناف تحتاج إعادة طلب")} icon={RefreshCcw} extra={reorder.length > 0 ? <span data-testid="reorder-count" className="bg-red-500 text-white text-[10px] font-black px-2 py-1 rounded-lg">{reorder.length}</span> : undefined}>
            {reorder.length === 0 ? (
              <div data-testid="reorder-empty" className="py-10 text-center"><CheckCircle2 className="mx-auto text-emerald-500/40 mb-3" size={44} /><p className="text-slate-400 text-sm">{t("No items currently require reordering.", "لا توجد أصناف تحتاج لإعادة طلب حالياً.")}</p></div>
            ) : (
              <div className="grid gap-2.5 max-h-[420px] overflow-y-auto sm:grid-cols-2">
                {reorder.slice(0, 60).map((p, i) => { const u = urgency(p); const st = { high: "border-red-500/30 bg-red-500/5", medium: "border-amber-500/30 bg-amber-500/5", low: "border-slate-800 bg-slate-800/30" }[u]; return (
                  <div key={i} data-testid="reorder-row" className={`flex items-center justify-between p-3 rounded-xl border ${st}`}>
                    <div className="flex items-center gap-3 min-w-0"><div className={`w-10 h-10 rounded-lg flex items-center justify-center font-mono font-black ${u === "high" ? "bg-red-500 text-white" : "bg-slate-800 text-slate-300"}`}>{fmtInt(p.qty)}</div>
                      <div className="min-w-0"><p className="text-slate-200 font-bold text-sm truncate">{p.name}</p><p className="text-[10px] text-slate-500 font-bold">{t("Threshold", "الحدّ")}: {fmtInt(p.thr)}</p></div></div>
                    <span className={`text-[10px] font-black px-2 py-1 rounded-md border shrink-0 ${u === "high" ? "border-red-500/30 text-red-400 bg-red-500/10" : u === "medium" ? "border-amber-500/30 text-amber-400 bg-amber-500/10" : "border-slate-700 text-slate-400"}`}>{uLabel[u]}</span>
                  </div>); })}
              </div>
            )}
            {reorder.length > 60 && <p className="text-[11px] text-slate-500 mt-2">{t(`Showing 60 of ${reorder.length} — export for the full list.`, `يُعرض 60 من ${reorder.length} — صدّر القائمة كاملة.`)}</p>}
          </SectionCard>
        </>
      )}
    </div>
  );
}
