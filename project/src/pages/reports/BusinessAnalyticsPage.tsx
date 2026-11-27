// =============================================================
// src/pages/reports/BusinessAnalyticsPage.tsx
// لوحة تحليلات الأعمال — للإدارة واتخاذ القرار. بيانات حقيقية فقط (بلا أرقام تجريبية).
// مؤشرات الربح من قائمة الدخل المحاسبية (القيود المُرحّلة، نفس منطق «الحسابات») فلا يحدث ازدواج في التكلفة؛
// ومؤشرات المبيعات/المشتريات من الفواتير، مع بطاقة مطابقة تكشف أي فرق بين الفواتير والدفتر.
// ثنائي اللغة · الثيمان · فترات جاهزة · تحميل بصفحات مع تحذير القصّ · تصدير Excel وطباعة.
// =============================================================
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DollarSign, TrendingUp, TrendingDown, ShoppingCart, Receipt, Package, Layers, Users, BarChart3, Building2, Boxes, Scale, Percent, CheckCircle2, AlertTriangle,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useLang } from "../../context/LanguageContext";
import * as DB from "../lib/accountingDb";
import { fetchEntriesPaged } from "../accounting/journal/journalApi";
import { previousPeriod, changePct } from "../accounting/statements/statementsLogic";
import type { Page } from "../../components/Layout";
import { ymd } from "../alerts/alertsLogic";
import { money, fmtInt, CARD, Loading, Warn, SectionCard, Kpi, LineDual, Donut, DataTable, PeriodBar, OutBtns, PageHead } from "./reportingKit";
import { aggregateAnalytics, inventoryHealth, periodIncome, reconcileRevenue, rangeFor, type RangeKey } from "./reportsLogic";
import { fetchProductsPaged, fetchPurchasesPaged, fetchSalesPaged, type Paged } from "./reportsApi";
import { exportBook, printReportDoc, stamp } from "./reportsOut";

type Props = { onNavigate?: (p: Page) => void; onSection?: (s: string) => void };
const KEYS: RangeKey[] = ["month", "prev_month", "quarter", "year", "last_year", "custom"];
const PAY: Record<string, [string, string]> = { cash: ["Cash", "نقدي"], credit: ["Credit", "آجل"], partial: ["Partial", "جزئي"], card: ["Card", "بطاقة"], split: ["Split", "مقسّم"] };
const PAY_COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#a855f7", "#ef4444", "#06b6d4"];

export default function BusinessAnalyticsPage({ onNavigate, onSection }: Props) {
  const { t, lang } = useLang();
  const { ownedShopId, branches } = (useAuth() as unknown as { ownedShopId: number | null; branches: { id: number; name: string }[] }) ?? { ownedShopId: null, branches: [] };
  const branchList = useMemo(() => (Array.isArray(branches) ? branches : []), [branches]);
  const branchName = useCallback((id: number | null) => (id == null ? "—" : branchList.find((b) => b.id === id)?.name || `${t("Branch", "فرع")} ${id}`), [branchList, t]);

  const today = ymd(new Date());
  const [org, setOrg] = useState<{ id: number; name: string } | null | undefined>(undefined);
  const [range, setRange] = useState<RangeKey>("month");
  const [cFrom, setCFrom] = useState(today.slice(0, 8) + "01");
  const [cTo, setCTo] = useState(today);
  const [fBranch, setFBranch] = useState("");
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const [data, setData] = useState<{ sales: Paged<DB.GLSalesInvoice>; purch: Paged<DB.GLPurchaseInvoice>; pSales: Paged<DB.GLSalesInvoice>; pPurch: Paged<DB.GLPurchaseInvoice>; ent: { rows: DB.EntryWithLines[]; truncated: boolean; error: string | null }; accounts: DB.GLAccount[]; stock: Paged<import("./reportsLogic").StockProd> } | null>(null);

  const { from, to } = useMemo(() => rangeFor(range, today, { from: cFrom, to: cTo }), [range, today, cFrom, cTo]);
  const branchId = fBranch ? Number(fBranch) : null;
  const scopeShops = useMemo(() => (branchId ? [branchId] : branchList.length ? branchList.map((b) => b.id) : ownedShopId ? [ownedShopId] : []), [branchId, branchList, ownedShopId]);

  useEffect(() => { let al = true; (async () => { const o = await DB.getOrgForBranch(ownedShopId ?? null); if (al) setOrg(o); })(); return () => { al = false; }; }, [ownedShopId]);

  const reload = useCallback(async () => {
    if (!org) return; const my = ++seq.current; setLoading(true);
    const pp = previousPeriod(from, to);
    const [sales, purch, pSales, pPurch, ent, accounts, stock] = await Promise.all([
      fetchSalesPaged(org.id, from, to, branchId), fetchPurchasesPaged(org.id, from, to, branchId),
      fetchSalesPaged(org.id, pp.from, pp.to, branchId), fetchPurchasesPaged(org.id, pp.from, pp.to, branchId),
      fetchEntriesPaged(org.id, pp.from, to, branchId), DB.fetchAccounts(org.id), fetchProductsPaged(scopeShops),
    ]);
    if (my !== seq.current) return;
    setData({ sales, purch, pSales, pPurch, ent, accounts, stock }); setLoading(false);
  }, [org, from, to, branchId, scopeShops]);
  useEffect(() => { void reload(); }, [reload]);

  const calc = useMemo(() => {
    if (!data) return null;
    const agg = aggregateAnalytics(data.sales.rows, data.purch.rows, from, to);
    const pp = previousPeriod(from, to);
    const prev = aggregateAnalytics(data.pSales.rows, data.pPurch.rows, pp.from, pp.to);
    const inc = periodIncome(data.ent.rows, data.accounts, from, to, branchId, true);
    return { agg, prev, inc, recon: reconcileRevenue(agg.salesNet, inc.revenue.total), health: inventoryHealth(data.stock.rows, undefined, t("Uncategorized", "غير مصنّف")) };
  }, [data, from, to, branchId, t]);

  const payLabel = (k: string) => (PAY[k] ? t(PAY[k][0], PAY[k][1]) : k);
  const dayFmt = (k: string) => (k.length === 10 ? k.slice(8) : new Intl.DateTimeFormat(lang === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-US", { month: "short", timeZone: "UTC" }).format(new Date(`${k}-15T00:00:00Z`)));
  const scope = `${from} → ${to} · ${branchId ? branchName(branchId) : t("All branches", "كل الفروع")}`;
  const go = (p: Page, sec?: string) => { if (sec) onSection?.(sec); onNavigate?.(p); };

  const summaryRows = (): (string | number | null)[][] => {
    if (!calc) return []; const { agg, prev, inc } = calc; const g = (c: number, p: number) => { const x = changePct(c, p); return x == null ? "—" : `${x >= 0 ? "+" : ""}${(Math.round(x * 10) / 10).toFixed(1)}%`; };
    return [
      [t("Total sales (incl. VAT)", "إجمالي المبيعات (شامل الضريبة)"), agg.salesTotal, prev.salesTotal, g(agg.salesTotal, prev.salesTotal)],
      [t("Net sales (excl. VAT)", "صافي المبيعات (بدون ضريبة)"), agg.salesNet, prev.salesNet, g(agg.salesNet, prev.salesNet)],
      [t("Total purchases", "إجمالي المشتريات"), agg.purchasesTotal, prev.purchasesTotal, g(agg.purchasesTotal, prev.purchasesTotal)],
      [t("Revenue per ledger", "الإيراد حسب الدفتر"), inc.revenue.total, inc.revenue.prevTotal, g(inc.revenue.total, inc.revenue.prevTotal ?? 0)],
      [t("Gross profit (ledger)", "مجمل الربح (الدفتر)"), inc.grossProfit, inc.prevGross, g(inc.grossProfit, inc.prevGross ?? 0)],
      [t("Operating expenses (ledger)", "المصروفات التشغيلية (الدفتر)"), inc.opex.total, inc.opex.prevTotal, g(inc.opex.total, inc.opex.prevTotal ?? 0)],
      [t("Net profit (ledger)", "صافي الربح (الدفتر)"), inc.net, inc.prevNet, g(inc.net, inc.prevNet ?? 0)],
      [t("Invoices count", "عدد الفواتير"), agg.tx, prev.tx, g(agg.tx, prev.tx)],
      [t("Average invoice", "متوسط الفاتورة"), agg.avgTicket, prev.avgTicket, g(agg.avgTicket, prev.avgTicket)],
      [t("Net VAT payable", "صافي الضريبة المستحقة"), agg.vatPayable, prev.vatPayable, g(agg.vatPayable, prev.vatPayable)],
    ];
  };
  const doPrint = () => { if (!calc || !org) return; void printReportDoc({ title: t("Business Analytics Summary", "ملخص تحليلات الأعمال"), subtitle: scope, cols: [{ label: t("Indicator", "المؤشر") }, { label: t("Current", "الحالي"), num: true }, { label: t("Previous period", "الفترة السابقة"), num: true }, { label: t("Change", "التغيّر") }], rows: summaryRows(), note: t("Profit figures come from posted journal entries; sales and purchases from invoices (cancelled/draft excluded).", "مؤشرات الربح من القيود المُرحّلة، والمبيعات والمشتريات من الفواتير (الملغاة والمسودات مستبعدة).") }, { orgId: org.id, shopId: ownedShopId ?? null, orgName: org.name, lang }); };
  const doExcel = () => {
    if (!calc) return; const { agg, health } = calc; const total = agg.salesTotal || 1;
    exportBook(`business-analytics-${stamp()}`, [
      { name: t("Summary", "الملخص"), cols: [t("Indicator", "المؤشر"), t("Current", "الحالي"), t("Previous period", "الفترة السابقة"), t("Change", "التغيّر")], rows: summaryRows() },
      { name: t("Trend", "الاتجاه"), cols: [agg.grain === "day" ? t("Day", "اليوم") : t("Month", "الشهر"), t("Sales", "المبيعات"), t("Purchases", "المشتريات")], rows: agg.series.map((p) => [p.key, p.sales, p.purchases]) },
      { name: t("Branches", "الفروع"), cols: [t("Branch", "الفرع"), t("Sales", "المبيعات"), t("Purchases", "المشتريات"), t("Invoices", "الفواتير"), t("Share %", "النسبة %")], rows: agg.branchRows.map((b) => [branchName(b.branch_id), b.sales, b.purchases, b.tx, Math.round((b.sales / total) * 1000) / 10]) },
      { name: t("Payment mix", "طرق الدفع"), cols: [t("Method", "الطريقة"), t("Amount", "المبلغ")], rows: agg.payMix.map((p) => [payLabel(p.k), p.value]) },
      { name: t("Top products", "أعلى المنتجات"), cols: [t("Product", "المنتج"), t("Qty", "الكمية"), t("Sales", "المبيعات")], rows: agg.topProducts.map((p) => [p.name, p.qty, p.net]) },
      { name: t("Top customers", "أعلى العملاء"), cols: [t("Customer", "العميل"), t("Sales", "المبيعات")], rows: agg.customers.map((c) => [c.name, c.total]) },
      { name: t("Top suppliers", "أعلى الموردين"), cols: [t("Supplier", "المورد"), t("Purchases", "المشتريات")], rows: agg.suppliers.map((c) => [c.name, c.total]) },
      { name: t("Inventory", "المخزون"), cols: [t("Indicator", "المؤشر"), t("Value", "القيمة")], rows: [[t("Stock value", "قيمة المخزون"), health.value], [t("Items", "الأصناف"), health.items], [t("Low stock", "منخفض"), health.low.length], [t("Out of stock", "نافد"), health.out.length]] },
    ], lang === "ar");
  };

  const truncated = !!data && (data.sales.truncated || data.purch.truncated || data.pSales.truncated || data.pPurch.truncated || data.ent.truncated || data.stock.truncated);
  const errors = data ? [data.sales.error, data.purch.error, data.ent.error, data.stock.error].filter(Boolean) as string[] : [];
  const A = calc?.agg, P = calc?.prev, I = calc?.inc, H = calc?.health, R = calc?.recon;

  return (
    <div className="p-4 lg:p-6 min-h-screen" dir={lang === "ar" ? "rtl" : "ltr"} data-rpt data-testid="analytics-page">
      <PageHead icon={BarChart3} tone="purple" title={t("Business Analytics", "لوحة تحليلات الأعمال")} sub={`${t("Management indicators from sales, purchases, the ledger and stock", "مؤشرات الإدارة من المبيعات والمشتريات والدفتر والمخزون")} — ${scope}`}>
        <PeriodBar range={range} onRange={setRange} from={cFrom} to={cTo} onFrom={setCFrom} onTo={setCTo} branches={branchList} branch={fBranch} onBranch={setFBranch} loading={loading} onRefresh={() => void reload()} keys={KEYS} />
        <OutBtns onExcel={doExcel} onPrint={doPrint} disabled={!calc || loading} />
      </PageHead>

      {org === undefined ? <Loading /> : org === null ? (
        <div className={`${CARD} p-10 text-center text-amber-400 text-sm`}>{t("The current branch is not linked to an organization — link it to enable analytics.", "الفرع الحالي غير مرتبط بمؤسسة — اربطه بمؤسسة لتفعيل التحليلات.")}</div>
      ) : loading || !calc || !A || !P || !I || !H || !R ? (
        <Loading label={t("Compiling analytics…", "جارٍ تجميع التحليلات…")} />
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            {errors.length > 0 && <div data-testid="warn-error"><Warn>{t("Some data could not be loaded: ", "تعذّر تحميل بعض البيانات: ")}{errors[0]}</Warn></div>}
            {truncated && <div data-testid="warn-truncated"><Warn>{t("Data volume exceeds the loading limit — figures may be incomplete. Narrow the period or branch.", "حجم البيانات يتجاوز حدّ التحميل — قد تكون الأرقام ناقصة. ضيّق الفترة أو الفرع.")}</Warn></div>}
            {I.revenue.total > 0.005 && I.cogs.lines.length === 0 && <div data-testid="warn-cogs"><Warn>{t("No cost-of-sales movement (accounts 51…) in this period, so gross profit equals revenue and profit is overstated.", "لا توجد حركة تكلفة مبيعات (حسابات 51…) في هذه الفترة، لذا مجمل الربح يساوي الإيراد والربح مُبالَغ فيه.")}</Warn></div>}
            {R.level === "warn" && <div data-testid="warn-recon"><Warn>{t(`Invoiced net sales differ from ledger revenue by ${money(Math.abs(R.diff))} (${R.diffPct}%). Review the sales reconciliation.`, `صافي مبيعات الفواتير يختلف عن إيراد الدفتر بمقدار ${money(Math.abs(R.diff))} (${R.diffPct}%). راجع تسوية المبيعات.`)}</Warn></div>}
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
            <Kpi id="k-sales" label={t("Total sales (incl. VAT)", "إجمالي المبيعات (شامل الضريبة)")} value={money(A.salesTotal)} tone="emerald" icon={DollarSign} deltaPct={changePct(A.salesTotal, P.salesTotal) ?? undefined} prev={money(P.salesTotal)} onClick={() => go("sales-reconciliation")} />
            <Kpi id="k-snet" label={t("Net sales (excl. VAT)", "صافي المبيعات (بدون ضريبة)")} value={money(A.salesNet)} tone="emerald" icon={TrendingUp} deltaPct={changePct(A.salesNet, P.salesNet) ?? undefined} />
            <Kpi id="k-gross" label={t("Gross profit (ledger)", "مجمل الربح (الدفتر)")} value={money(I.grossProfit)} tone="blue" icon={BarChart3} deltaPct={changePct(I.grossProfit, I.prevGross) ?? undefined} hint={I.grossMargin != null ? `${I.grossMargin}%` : undefined} onClick={() => go("monthly-financial")} />
            <Kpi id="k-net" label={t("Net profit (ledger)", "صافي الربح (الدفتر)")} value={money(I.net)} tone={I.net >= 0 ? "emerald" : "red"} icon={I.net >= 0 ? TrendingUp : TrendingDown} deltaPct={changePct(I.net, I.prevNet) ?? undefined} hint={I.netMargin != null ? `${I.netMargin}%` : undefined} onClick={() => go("monthly-financial")} />
            <Kpi id="k-purch" label={t("Total purchases", "إجمالي المشتريات")} value={money(A.purchasesTotal)} tone="sky" icon={ShoppingCart} deltaPct={changePct(A.purchasesTotal, P.purchasesTotal) ?? undefined} prev={money(P.purchasesTotal)} onClick={() => go("purchase-invoices")} />
            <Kpi id="k-opex" label={t("Operating expenses (ledger)", "المصروفات التشغيلية (الدفتر)")} value={money(I.opex.total)} tone="amber" icon={Receipt} deltaPct={changePct(I.opex.total, I.opex.prevTotal) ?? undefined} onClick={() => go("fixed-expenses")} />
            <Kpi id="k-tx" label={t("Invoices · average", "الفواتير · المتوسط")} value={`${fmtInt(A.tx)} · ${money(A.avgTicket)}`} tone="slate" icon={Receipt} deltaPct={changePct(A.tx, P.tx) ?? undefined} />
            <Kpi id="k-vat" label={t("Net VAT payable", "صافي الضريبة المستحقة")} value={money(A.vatPayable)} tone="purple" icon={Percent} hint={t("sales VAT − purchase VAT", "ضريبة المبيعات − ضريبة المشتريات")} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="lg:col-span-2" data-testid="a-trend">
              <SectionCard title={A.grain === "day" ? t("Sales & purchases — daily", "المبيعات والمشتريات — يوميًا") : t("Sales & purchases — monthly", "المبيعات والمشتريات — شهريًا")} icon={TrendingUp}>
                <LineDual step={A.grain === "day" ? 30 : 52} labels={A.series.map((p) => dayFmt(p.key))} a={A.series.map((p) => p.sales)} b={A.series.map((p) => p.purchases)} aName={t("Sales", "المبيعات")} bName={t("Purchases", "المشتريات")} aColor="#10b981" bColor="#3b82f6" />
              </SectionCard>
            </div>
            <SectionCard title={t("Payment methods", "طرق الدفع")} icon={Layers}>
              <Donut data={A.payMix.map((p, i) => ({ label: payLabel(p.k), value: p.value, color: PAY_COLORS[i % PAY_COLORS.length] }))} />
            </SectionCard>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="lg:col-span-2" data-testid="a-branches">
              <SectionCard title={t("Branch performance", "أداء الفروع")} icon={Building2} pad={false}>
                <DataTable onRow={() => go("sales-reconciliation")}
                  cols={[
                    { k: "name", label: t("Branch", "الفرع") },
                    { k: "tx", label: t("Invoices", "الفواتير"), align: "c", fmt: (v) => fmtInt(v) },
                    { k: "sales", label: t("Sales", "المبيعات"), align: "l", fmt: (v) => money(v) },
                    { k: "share", label: t("Share", "النسبة"), align: "l", fmt: (v) => `${v}%` },
                    { k: "purchases", label: t("Purchases", "المشتريات"), align: "l", fmt: (v) => money(v) },
                    { k: "net", label: t("Sales − purchases", "مبيعات − مشتريات"), align: "l", fmt: (v) => <span className={v >= 0 ? "text-emerald-400" : "text-red-400"}>{money(v)}</span> },
                  ]}
                  rows={A.branchRows.map((b) => ({ name: branchName(b.branch_id), tx: b.tx, sales: b.sales, share: A.salesTotal ? Math.round((b.sales / A.salesTotal) * 1000) / 10 : 0, purchases: b.purchases, net: Math.round((b.sales - b.purchases) * 100) / 100 }))} />
              </SectionCard>
            </div>
            <div className="space-y-3">
              <div data-testid="a-recon"><SectionCard title={t("Invoices vs ledger", "الفواتير مقابل الدفتر")} icon={Scale}
                extra={<span data-testid="recon-badge" className={`inline-flex items-center gap-1 text-[11px] font-bold ${R.level === "ok" ? "text-emerald-400" : "text-amber-400"}`}>{R.level === "ok" ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}{R.level === "ok" ? t("Matches", "متطابق") : t("Review", "للمراجعة")}</span>}>
                <dl className="space-y-2 text-xs">
                  <div className="flex justify-between gap-2"><dt className="text-slate-400">{t("Net sales per invoices", "صافي المبيعات حسب الفواتير")}</dt><dd className="font-mono text-slate-200"><bdi dir="ltr">{money(R.invoiceNet)}</bdi></dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-slate-400">{t("Revenue per ledger", "الإيراد حسب الدفتر")}</dt><dd className="font-mono text-slate-200"><bdi dir="ltr">{money(R.glRevenue)}</bdi></dd></div>
                  <div className="flex justify-between gap-2 pt-2 border-t border-slate-800"><dt className="font-bold text-slate-300">{t("Difference", "الفرق")}</dt><dd className={`font-mono font-bold ${R.level === "ok" ? "text-emerald-400" : "text-amber-400"}`}><bdi dir="ltr">{money(R.diff)}</bdi></dd></div>
                </dl>
                <p className="text-[10px] text-slate-500 mt-2">{t("Differences may come from returns, other revenue accounts or entries not yet posted.", "قد ينشأ الفرق من المرتجعات أو حسابات إيراد أخرى أو قيود لم تُرحَّل بعد.")}</p>
                <button data-testid="go-recon" onClick={() => go("sales-reconciliation")} className="w-full mt-2.5 px-3 py-2 rounded-xl bg-slate-800/60 border border-slate-700 text-slate-300 text-xs font-bold hover:text-white">{t("Open sales reconciliation", "فتح تسوية المبيعات")}</button>
              </SectionCard></div>
              <div data-testid="a-inventory"><SectionCard title={t("Inventory health", "صحة المخزون")} icon={Package}>
                <div className="grid grid-cols-2 gap-2">
                  <div className={`${CARD} p-3`}><div className="text-[10px] text-slate-500 font-bold">{t("Stock value", "قيمة المخزون")}</div><div className="text-base font-black text-emerald-400 mt-1"><bdi dir="ltr">{money(H.value)}</bdi></div></div>
                  <div className={`${CARD} p-3`}><div className="text-[10px] text-slate-500 font-bold">{t("Items", "الأصناف")}</div><div className="text-base font-black text-blue-400 mt-1">{fmtInt(H.items)}</div></div>
                  <div className={`${CARD} p-3`}><div className="text-[10px] text-slate-500 font-bold">{t("Low stock", "منخفض")}</div><div data-testid="inv-low" className="text-base font-black text-amber-400 mt-1">{fmtInt(H.low.length)}</div></div>
                  <div className={`${CARD} p-3`}><div className="text-[10px] text-slate-500 font-bold">{t("Out of stock", "نافد")}</div><div data-testid="inv-out" className="text-base font-black text-red-400 mt-1">{fmtInt(H.out.length)}</div></div>
                </div>
                <button onClick={() => go("inventory")} className="w-full mt-2.5 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800/60 border border-slate-700 text-slate-300 text-xs font-bold hover:text-white"><Boxes size={14} /> {t("Open inventory", "فتح المخزون")}</button>
              </SectionCard></div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <SectionCard title={t("Top products by sales", "أعلى المنتجات مبيعًا")} icon={Package} pad={false}>
              <DataTable cols={[{ k: "name", label: t("Product", "المنتج") }, { k: "qty", label: t("Qty", "الكمية"), align: "c", fmt: (v) => fmtInt(v) }, { k: "net", label: t("Sales", "المبيعات"), align: "l", fmt: (v) => money(v) }]} rows={A.topProducts} maxH={320} />
            </SectionCard>
            <SectionCard title={t("Top customers", "أعلى العملاء")} icon={Users} pad={false}>
              <DataTable cols={[{ k: "name", label: t("Customer", "العميل") }, { k: "total", label: t("Sales", "المبيعات"), align: "l", fmt: (v) => money(v) }]} rows={A.customers} maxH={320} />
            </SectionCard>
            <SectionCard title={t("Top suppliers", "أعلى الموردين")} icon={Users} pad={false}>
              <DataTable cols={[{ k: "name", label: t("Supplier", "المورد") }, { k: "total", label: t("Purchases", "المشتريات"), align: "l", fmt: (v) => money(v) }]} rows={A.suppliers} maxH={320} />
            </SectionCard>
          </div>

          <p className="text-[11px] text-slate-500 text-center pt-1">{t("Sales and purchases = invoice values (not collections), cancelled and draft invoices excluded. Profit figures come from posted journal entries. Stock is a current snapshot at weighted-average cost.", "المبيعات والمشتريات = قيمة الفواتير (ليست التحصيل) مع استبعاد الملغاة والمسودات. مؤشرات الربح من القيود المُرحّلة. المخزون لقطة حالية بالمتوسط المرجّح.")}</p>
        </div>
      )}
    </div>
  );
}
