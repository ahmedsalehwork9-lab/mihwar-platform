// =============================================================
// src/pages/reports/MonthlyFinancialPage.tsx
// التقرير المالي الشهري — قائمة الدخل من القيود المُرحّلة فقط (المصدر المعتمد).
// يستخدم نفس منطق «القوائم المالية» في الحسابات (statementsLogic): كلا الصفحتين تعطيان نفس الرقم.
// تكلفة المبيعات = حسابات المصروفات التي يبدأ كودها بـ 51 (وليس بالاسم). المسودات مستبعدة وتُعرض كتنبيه.
// ثنائي اللغة · يعمل في الثيمين · طباعة/PDF وExcel بترويسة المؤسسة · القيود تُجلب بصفحات.
// =============================================================
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FileBarChart, TrendingUp, TrendingDown, Layers, Building2, ChevronDown, ChevronLeft, ChevronRight, ExternalLink,
  DollarSign, Receipt, CalendarRange, Scale, Wallet,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useLang } from "../../context/LanguageContext";
import * as DB from "../lib/accountingDb";
import { fetchEntriesPaged } from "../accounting/journal/journalApi";
import type { Page } from "../../components/Layout";
import type { Income, IncomeSection } from "../accounting/statements/statementsLogic";
import { changePct } from "../accounting/statements/statementsLogic";
import { money, CARD, INP, Loading, Warn, SectionCard, Kpi, LineDual, Donut, DataTable, OutBtns, PageHead } from "./reportingKit";
import { accName, buildMonthly, incomeTable, monthRange, shiftYm, type Compare, type MonthlyReport, type StmtLabels } from "./reportsLogic";
import { exportBook, printReportDoc, stamp } from "./reportsOut";

type Props = { onNavigate?: (p: Page) => void; onSection?: (s: string) => void };
const EXP_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#a855f7", "#ef4444", "#06b6d4", "#64748b", "#ec4899"];
const monthLabel = (ym: string, lang: "ar" | "en"): string => new Intl.DateTimeFormat(lang === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${ym}-15T00:00:00Z`));
const shortMonth = (ym: string, lang: "ar" | "en"): string => new Intl.DateTimeFormat(lang === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-US", { month: "short", timeZone: "UTC" }).format(new Date(`${ym}-15T00:00:00Z`));
const fmtPct = (n: number | null): string => (n == null ? "—" : `${(Math.round(n * 10) / 10).toFixed(1)}%`);

type Key = "rev" | "cogs" | "opex";

export default function MonthlyFinancialPage({ onNavigate, onSection }: Props) {
  const { t, lang } = useLang();
  const { ownedShopId, branches } = (useAuth() as unknown as { ownedShopId: number | null; branches: { id: number; name: string }[] }) ?? { ownedShopId: null, branches: [] };
  const branchList = useMemo(() => (Array.isArray(branches) ? branches : []), [branches]);
  const branchName = useCallback((id: number | null) => (id == null ? t("General", "عام") : branchList.find((b) => b.id === id)?.name || `${t("Branch", "فرع")} ${id}`), [branchList, t]);

  const [org, setOrg] = useState<{ id: number; name: string } | null | undefined>(undefined);
  const [accounts, setAccounts] = useState<DB.GLAccount[]>([]);
  const [entries, setEntries] = useState<DB.EntryWithLines[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ym, setYm] = useState(new Date().toISOString().slice(0, 7));
  const [fBranch, setFBranch] = useState("");
  const [compare, setCompare] = useState<Compare>("prev_month");
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Record<Key, boolean>>({ rev: false, cogs: false, opex: true });
  const seq = useRef(0);

  useEffect(() => { let al = true; (async () => { const o = await DB.getOrgForBranch(ownedShopId ?? null); if (al) setOrg(o); })(); return () => { al = false; }; }, [ownedShopId]);
  const branchId = fBranch ? Number(fBranch) : null;

  const reload = useCallback(async () => {
    if (!org) return; const my = ++seq.current; setLoading(true); setErr(null);
    const from = monthRange(shiftYm(ym, -12)).from, to = monthRange(ym).to;
    const [acc, es] = await Promise.all([DB.fetchAccounts(org.id), fetchEntriesPaged(org.id, from, to, branchId)]);
    if (my !== seq.current) return;
    setAccounts(acc); setEntries(es.rows); setTruncated(es.truncated); setErr(es.error); setLoading(false);
  }, [org, ym, branchId]);
  useEffect(() => { void reload(); }, [reload]);

  const rep: MonthlyReport | null = useMemo(() => (accounts.length || entries.length ? buildMonthly(entries, accounts, ym, branchId, compare) : null), [entries, accounts, ym, branchId, compare]);
  const inc: Income | null = rep?.income ?? null;
  const hasPrev = !!rep?.compareYm;
  const nm = useCallback((a: DB.GLAccount) => accName(a, lang), [lang]);
  const cmpLabel = rep?.compareYm ? monthLabel(rep.compareYm, lang) : "";
  const rev = inc?.revenue.total ?? 0;
  const pct = (v: number): string => (rev > 0.005 ? fmtPct((v / rev) * 100) : "—");

  const L: StmtLabels = { item: t("Item", "البند"), amount: t("Amount", "المبلغ"), pct: t("% of revenue", "% من الإيراد"), prev: cmpLabel || t("Previous", "السابق"), change: t("Change", "التغيّر"), revenue: t("Net revenue", "صافي الإيراد"), cogs: t("Cost of sales", "تكلفة المبيعات"), gross: t("Gross profit", "مجمل الربح"), opex: t("Operating expenses", "المصروفات التشغيلية"), net: t("Net profit", "صافي الربح") };
  const scope = `${monthLabel(ym, lang)} · ${branchId ? branchName(branchId) : t("All branches", "كل الفروع")}`;
  const title = t("Monthly Financial Report", "التقرير المالي الشهري");
  const note = `${t("Source: posted journal entries only (drafts excluded). Cost of sales = expense accounts with code 51…", "المصدر: القيود المُرحّلة فقط (المسودات مستبعدة). تكلفة المبيعات = حسابات المصروفات ذات الكود 51…")}`;

  const doPrint = () => { if (!inc || !org) return; const tb = incomeTable(inc, L, nm, hasPrev, true); void printReportDoc({ title, subtitle: scope, cols: tb.cols, rows: tb.rows, note }, { orgId: org.id, shopId: ownedShopId ?? null, orgName: org.name, lang }); };
  const doExcel = () => {
    if (!inc || !rep) return; const tb = incomeTable(inc, L, nm, hasPrev, true);
    exportBook(`monthly-financial-${ym}-${stamp()}`, [
      { name: t("Income statement", "قائمة الدخل"), cols: tb.cols.map((c) => c.label), rows: tb.rows },
      { name: t("12-month trend", "اتجاه 12 شهرًا"), cols: [t("Month", "الشهر"), t("Revenue", "الإيراد"), t("Expenses", "المصروفات"), t("Net", "الصافي")], rows: rep.trend.map((p) => [p.ym, p.revenue, p.expense, p.net]) },
      ...(rep.branches.length ? [{ name: t("Branches", "الفروع"), cols: [t("Branch", "الفرع"), t("Revenue", "الإيراد"), t("Expenses", "المصروفات"), t("Net", "الصافي")], rows: rep.branches.map((b) => [branchName(b.branchId), b.revenue, b.expense, b.net]) }] : []),
    ], lang === "ar");
  };

  const goStatements = () => { onSection?.("statements"); onNavigate?.("accounting"); };
  const sections: { k: Key; label: string; s: IncomeSection; bad: boolean; tone: string }[] = inc ? [
    { k: "rev", label: L.revenue, s: inc.revenue, bad: false, tone: "text-emerald-400" },
    { k: "cogs", label: L.cogs, s: inc.cogs, bad: true, tone: "text-amber-400" },
    { k: "opex", label: L.opex, s: inc.opex, bad: true, tone: "text-amber-400" },
  ] : [];
  const chg = (c: number, p: number | null, bad: boolean) => { const x = changePct(c, p); if (x == null) return <span className="text-slate-500">—</span>; const good = bad ? x <= 0 : x >= 0; return <span className={`text-[11px] font-bold ${good ? "text-emerald-400" : "text-red-400"}`}><bdi dir="ltr">{`${x >= 0 ? "+" : ""}${(Math.round(x * 10) / 10).toFixed(1)}%`}</bdi></span>; };
  const Chev = lang === "ar" ? ChevronLeft : ChevronRight;
  const Prev = lang === "ar" ? ChevronRight : ChevronLeft;
  const Next = lang === "ar" ? ChevronLeft : ChevronRight;
  const th = "px-3 py-2.5 font-bold text-end";
  const dTrend = rep ? rep.trend : [];

  return (
    <div className="p-4 lg:p-6 min-h-screen" dir={lang === "ar" ? "rtl" : "ltr"} data-rpt data-testid="monthly-page">
      <PageHead icon={FileBarChart} title={title} sub={`${t("Income statement from posted entries", "قائمة الدخل من القيود المُرحّلة")} — ${scope}`}>
        <div className="flex flex-col gap-1"><label className="text-[10px] text-slate-500 font-bold">{t("Month", "الشهر")}</label>
          <div className="flex items-center gap-1">
            <button data-testid="m-prev" aria-label={t("Previous month", "الشهر السابق")} onClick={() => setYm(shiftYm(ym, -1))} className="p-2 rounded-xl border border-slate-800 bg-slate-900 text-slate-400 hover:text-white"><Prev size={15} /></button>
            <input data-testid="m-ym" type="month" value={ym} onChange={(e) => e.target.value && setYm(e.target.value)} className={INP} />
            <button data-testid="m-next" aria-label={t("Next month", "الشهر التالي")} onClick={() => setYm(shiftYm(ym, 1))} className="p-2 rounded-xl border border-slate-800 bg-slate-900 text-slate-400 hover:text-white"><Next size={15} /></button>
          </div></div>
        <div className="flex flex-col gap-1"><label className="text-[10px] text-slate-500 font-bold">{t("Compare with", "المقارنة مع")}</label>
          <select data-testid="m-compare" value={compare} onChange={(e) => setCompare(e.target.value as Compare)} className={INP}>
            <option value="prev_month">{t("Previous month", "الشهر السابق")}</option><option value="last_year">{t("Same month last year", "نفس الشهر من العام الماضي")}</option><option value="none">{t("No comparison", "بدون مقارنة")}</option></select></div>
        {branchList.length > 1 && <div className="flex flex-col gap-1"><label className="text-[10px] text-slate-500 font-bold">{t("Branch", "الفرع")}</label>
          <select data-testid="rpt-branch" value={fBranch} onChange={(e) => setFBranch(e.target.value)} className={INP}><option value="">{t("All branches", "كل الفروع")}</option>{branchList.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>}
        <OutBtns onExcel={doExcel} onPrint={doPrint} disabled={!inc || loading} />
        <button data-testid="rpt-refresh" onClick={() => void reload()} title={t("Refresh", "تحديث")} aria-label={t("Refresh", "تحديث")} className="p-2.5 rounded-xl border border-slate-800 bg-slate-900 text-slate-400 hover:text-white"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={loading ? "animate-spin text-blue-500" : ""}><path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5" /></svg></button>
      </PageHead>

      {org === undefined ? <Loading /> : org === null ? (
        <div className={`${CARD} p-10 text-center text-amber-400 text-sm`}>{t("The current branch is not linked to an organization.", "الفرع الحالي غير مرتبط بمؤسسة.")}</div>
      ) : loading || !inc || !rep ? (
        err ? <Warn>{t("Could not load entries: ", "تعذّر تحميل القيود: ")}{err}</Warn> : <Loading label={t("Compiling the statement…", "جارٍ تجميع القائمة المالية…")} />
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            {err && <div data-testid="warn-error"><Warn>{t("Entries could not be fully loaded: ", "تعذّر تحميل القيود كاملة: ")}{err}</Warn></div>}
            {truncated && <div data-testid="warn-truncated"><Warn>{t("The entries volume exceeds the loading limit — figures may be incomplete. Narrow the month or branch.", "حجم القيود يتجاوز حدّ التحميل — قد تكون الأرقام ناقصة. ضيّق الشهر أو الفرع.")}</Warn></div>}
            {rep.counts.posted === 0 && <div data-testid="warn-empty"><Warn>{t(`No posted entries in ${monthLabel(ym, lang)} — all figures are zero.`, `لا توجد قيود مُرحّلة في ${monthLabel(ym, lang)} — الأرقام صفرية.`)}</Warn></div>}
            {rep.counts.draft > 0 && <div data-testid="warn-drafts"><Warn><b>{rep.counts.draft}</b> {t("draft entries in this month are NOT included. Post them to include them in the statement.", "قيد مسودة في هذا الشهر غير محتسَبة. رحّلها لتدخل في القائمة.")}</Warn></div>}
            {rev > 0.005 && inc.cogs.lines.length === 0 && <div data-testid="warn-cogs"><Warn>{t("No movement on cost-of-sales accounts (code 51…), so gross profit equals revenue.", "لا توجد حركة على حسابات تكلفة المبيعات (كود 51…)، لذا مجمل الربح يساوي الإيراد.")}</Warn></div>}
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
            <Kpi id="k-rev" label={L.revenue} value={money(inc.revenue.total)} tone="emerald" icon={DollarSign} deltaPct={hasPrev ? changePct(inc.revenue.total, inc.revenue.prevTotal) ?? undefined : undefined} prev={hasPrev && inc.revenue.prevTotal != null ? money(inc.revenue.prevTotal) : undefined} />
            <Kpi id="k-cogs" label={L.cogs} value={money(inc.cogs.total)} tone="amber" icon={Receipt} />
            <Kpi id="k-gross" label={L.gross} value={money(inc.grossProfit)} tone="blue" icon={TrendingUp} deltaPct={hasPrev ? changePct(inc.grossProfit, inc.prevGross) ?? undefined : undefined} />
            <Kpi id="k-opex" label={L.opex} value={money(inc.opex.total)} tone="amber" icon={Wallet} deltaPct={hasPrev ? changePct(inc.opex.total, inc.opex.prevTotal) ?? undefined : undefined} />
            <Kpi id="k-net" label={L.net} value={money(inc.net)} tone={inc.net >= 0 ? "emerald" : "red"} icon={inc.net >= 0 ? TrendingUp : TrendingDown} deltaPct={hasPrev ? changePct(inc.net, inc.prevNet) ?? undefined : undefined} prev={hasPrev && inc.prevNet != null ? money(inc.prevNet) : undefined} />
            <Kpi id="k-gm" label={t("Gross margin", "هامش مجمل الربح")} value={fmtPct(inc.grossMargin)} tone="purple" icon={Layers} />
            <Kpi id="k-nm" label={t("Net margin", "هامش صافي الربح")} value={fmtPct(inc.netMargin)} tone="purple" icon={Layers} />
            <Kpi id="k-ytd" label={t("Net profit — year to date", "صافي الربح منذ بداية السنة")} value={money(rep.ytd.net)} tone={rep.ytd.net >= 0 ? "emerald" : "red"} icon={CalendarRange} hint={`${t("Revenue", "الإيراد")}: ${money(rep.ytd.revenue)}`} />
          </div>

          <SectionCard title={`${t("Income statement", "قائمة الدخل")} — ${monthLabel(ym, lang)}`} icon={FileBarChart} pad={false}
            extra={<div className="flex items-center gap-3">
              <button data-testid="is-toggle-all" onClick={() => { const all = !(open.rev && open.cogs && open.opex); setOpen({ rev: all, cogs: all, opex: all }); }} className="text-[11px] font-bold text-blue-400 hover:underline">{open.rev && open.cogs && open.opex ? t("Collapse all", "طيّ الكل") : t("Expand all", "فتح الكل")}</button>
              <span data-testid="is-result" className={`text-[11px] font-bold ${inc.net >= 0 ? "text-emerald-400" : "text-red-400"}`}>{inc.net >= 0 ? t("Profit", "ربح") : t("Loss", "خسارة")}: <bdi dir="ltr">{money(inc.net)}</bdi></span></div>}>
            <div className="overflow-x-auto">
              <table className="w-full text-start text-xs border-collapse" style={{ minWidth: 620 }}>
                <thead><tr className="bg-slate-950/40 border-b border-slate-800 text-[10px] text-slate-500">
                  <th scope="col" className="px-3 py-2.5 font-bold text-start">{L.item}</th><th scope="col" className={th}>{L.amount}</th><th scope="col" className={th}>{L.pct}</th>
                  {hasPrev && <><th scope="col" className={th}>{cmpLabel}</th><th scope="col" className={th}>{L.change}</th></>}
                </tr></thead>
                <tbody className="divide-y divide-slate-800/60">
                  {sections.slice(0, 2).map((x) => <Section key={x.k} x={x} open={open[x.k]} toggle={() => setOpen((o) => ({ ...o, [x.k]: !o[x.k] }))} hasPrev={hasPrev} pct={pct} chg={chg} nm={nm} Chev={Chev} />)}
                  <tr data-testid="is-gross" className="bg-slate-950/40 font-bold"><td className="px-3 py-2.5 text-blue-400">{L.gross}</td><td className="px-3 py-2.5 text-end font-mono text-blue-400"><bdi dir="ltr">{money(inc.grossProfit)}</bdi></td><td className="px-3 py-2.5 text-end text-slate-500"><bdi dir="ltr">{pct(inc.grossProfit)}</bdi></td>
                    {hasPrev && <><td className="px-3 py-2.5 text-end font-mono text-slate-500"><bdi dir="ltr">{inc.prevGross != null ? money(inc.prevGross) : "—"}</bdi></td><td className="px-3 py-2.5 text-end">{chg(inc.grossProfit, inc.prevGross, false)}</td></>}</tr>
                  <Section x={sections[2]} open={open.opex} toggle={() => setOpen((o) => ({ ...o, opex: !o.opex }))} hasPrev={hasPrev} pct={pct} chg={chg} nm={nm} Chev={Chev} />
                  <tr data-testid="is-net" className="bg-slate-900 font-black border-t-2 border-slate-700"><td className="px-3 py-3 text-white">{L.net}</td><td className={`px-3 py-3 text-end font-mono ${inc.net >= 0 ? "text-emerald-400" : "text-red-400"}`}><bdi dir="ltr">{money(inc.net)}</bdi></td><td className="px-3 py-3 text-end text-slate-400"><bdi dir="ltr">{pct(inc.net)}</bdi></td>
                    {hasPrev && <><td className="px-3 py-3 text-end font-mono text-slate-500"><bdi dir="ltr">{inc.prevNet != null ? money(inc.prevNet) : "—"}</bdi></td><td className="px-3 py-3 text-end">{chg(inc.net, inc.prevNet, false)}</td></>}</tr>
                </tbody>
              </table>
            </div>
          </SectionCard>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="lg:col-span-2" data-testid="m-trend">
              <SectionCard title={t("Revenue vs expenses — last 12 months", "الإيراد مقابل المصروفات — آخر 12 شهرًا")} icon={TrendingUp}>
                <LineDual labels={dTrend.map((p) => shortMonth(p.ym, lang))} a={dTrend.map((p) => Math.max(p.revenue, 0))} b={dTrend.map((p) => Math.max(p.expense, 0))} aName={t("Revenue", "الإيراد")} bName={t("Expenses", "المصروفات")} aColor="#10b981" bColor="#ef4444" />
              </SectionCard>
            </div>
            <SectionCard title={t("Expense breakdown", "توزيع المصروفات")} icon={Layers}>
              <Donut data={[...inc.cogs.lines, ...inc.opex.lines].filter((l) => l.value > 0).sort((a, b) => b.value - a.value).slice(0, 8).map((l, i) => ({ label: nm(l.account), value: l.value, color: EXP_COLORS[i % EXP_COLORS.length] }))} />
            </SectionCard>
          </div>

          {rep.branches.length > 1 && !branchId && (
            <div data-testid="m-branches"><SectionCard title={t("Branch comparison", "مقارنة الفروع")} icon={Building2} pad={false}>
              <DataTable
                cols={[
                  { k: "name", label: t("Branch", "الفرع") },
                  { k: "revenue", label: t("Revenue", "الإيراد"), align: "l", fmt: (v) => money(v) },
                  { k: "expense", label: t("Expenses", "المصروفات"), align: "l", fmt: (v) => money(v) },
                  { k: "net", label: t("Net profit", "صافي الربح"), align: "l", fmt: (v) => <span className={v >= 0 ? "text-emerald-400" : "text-red-400"}>{money(v)}</span> },
                  { k: "margin", label: t("Margin", "الهامش"), align: "l", fmt: (v) => fmtPct(v) },
                ]}
                rows={rep.branches.map((b) => ({ name: branchName(b.branchId), revenue: b.revenue, expense: b.expense, net: b.net, margin: b.revenue > 0.005 ? (b.net / b.revenue) * 100 : null }))}
              />
            </SectionCard></div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {([["statements", Scale, t("Balance sheet & cash flow", "الميزانية وقائمة التدفقات النقدية")], ["trial", FileBarChart, t("Trial balance", "ميزان المراجعة")], ["ledger", ExternalLink, t("General ledger", "دفتر الأستاذ")]] as const).map(([sec, Ic, label]) => (
              <button key={sec} data-testid={`go-${sec}`} onClick={() => { onSection?.(sec); onNavigate?.("accounting"); }} className={`${CARD} p-3 flex items-center justify-between hover:border-blue-500/40 transition-all`}>
                <span className="flex items-center gap-2 text-sm font-bold text-slate-200"><Ic size={15} className="text-blue-400" /> {label}</span><Chev size={16} className="text-slate-500" />
              </button>
            ))}
          </div>
          <p className="text-[11px] text-slate-500 text-center" onClick={goStatements}>{note}</p>
        </div>
      )}
    </div>
  );
}

function Section({ x, open, toggle, hasPrev, pct, chg, nm, Chev }: {
  x: { k: Key; label: string; s: IncomeSection; bad: boolean; tone: string }; open: boolean; toggle: () => void; hasPrev: boolean;
  pct: (v: number) => string; chg: (c: number, p: number | null, bad: boolean) => JSX.Element; nm: (a: DB.GLAccount) => string; Chev: typeof ChevronLeft;
}) {
  const has = x.s.lines.length > 0;
  return (
    <>
      <tr data-testid={`is-${x.k}`} onClick={has ? toggle : undefined} className={has ? "cursor-pointer hover:bg-slate-800/30" : ""} aria-expanded={has ? open : undefined}>
        <td className="px-3 py-2.5 font-bold text-slate-200"><span className="inline-flex items-center gap-1.5">{has ? (open ? <ChevronDown size={13} className="text-slate-500" /> : <Chev size={13} className="text-slate-500" />) : <span className="w-[13px]" />}{x.label}</span></td>
        <td className={`px-3 py-2.5 text-end font-mono font-bold ${x.tone}`}><bdi dir="ltr">{money(x.s.total)}</bdi></td>
        <td className="px-3 py-2.5 text-end text-slate-500"><bdi dir="ltr">{pct(x.s.total)}</bdi></td>
        {hasPrev && <><td className="px-3 py-2.5 text-end font-mono text-slate-500"><bdi dir="ltr">{x.s.prevTotal != null ? money(x.s.prevTotal) : "—"}</bdi></td><td className="px-3 py-2.5 text-end">{chg(x.s.total, x.s.prevTotal, x.bad)}</td></>}
      </tr>
      {open && x.s.lines.map((l) => (
        <tr key={l.account.id} data-testid={`is-acc-${l.account.code}`} className="bg-slate-950/30 text-[11px]">
          <td className="px-3 py-1.5 text-slate-400 ps-9"><bdi dir="ltr" className="font-mono text-slate-500 me-1.5">{l.account.code}</bdi>{nm(l.account)}</td>
          <td className="px-3 py-1.5 text-end font-mono text-slate-400"><bdi dir="ltr">{money(l.value)}</bdi></td>
          <td className="px-3 py-1.5 text-end text-slate-500"><bdi dir="ltr">{pct(l.value)}</bdi></td>
          {hasPrev && <><td className="px-3 py-1.5 text-end font-mono text-slate-500"><bdi dir="ltr">{l.prev != null ? money(l.prev) : "—"}</bdi></td><td className="px-3 py-1.5 text-end">{chg(l.value, l.prev, x.bad)}</td></>}
        </tr>
      ))}
    </>
  );
}
