// =============================================================
// src/pages/accounting/dash/AccountingDashboard.tsx
// لوحة تحكم الحسابات (ثنائية اللغة RTL/LTR). كل الأرقام من القيود المرحّلة بنفس منطق القوائم المالية،
// بفلتر فترة وفرع، وتنبيهات تشغيلية قابلة للضغط تفتح الصفحة المعنية. لا بيانات وهمية.
// =============================================================
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, BarChart3, BookOpen, Building2, CheckCircle2, Coins, FileText, FileClock, Landmark, Layers, Network, Package, Plus, RefreshCw, Receipt, Scale, ShieldCheck, TrendingDown, TrendingUp, Users, Wallet, Banknote, Calculator } from "lucide-react";
import { useLang } from "../../../context/LanguageContext";
import * as DB from "../../lib/accountingDb";
import type { GLAccount, GLParty, GLTreasury } from "../../lib/accountingDb";
import type { AssetLike } from "../assets/assetsLogic";
import { changePct } from "../statements/statementsLogic";
import { fetchEntriesPaged } from "../journal/journalApi";
import type { JEntry } from "../journal/reviewLogic";
import { fmtCents } from "../journal/money";
import { computeDash, periodRange, type AlertCode, type DashData, type PeriodKey } from "./dashLogic";

import { curAr, curEn } from "../../lib/orgConfig";
const CARD = "bg-slate-900 border border-slate-800 rounded-2xl";
const INPUT = "bg-slate-950 border border-slate-700 rounded-xl text-white px-3 py-2 text-xs outline-none focus:border-blue-500 transition-colors";
const today = (): string => new Date().toISOString().slice(0, 10);
const nf = (n: number): string => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
type Props = { org: { id: number; name: string }; accounts: GLAccount[]; parties: GLParty[]; branches: { id: number; name: string }[]; onSection?: (s: string) => void; onNavigate?: (p: string) => void };

export default function AccountingDashboard({ org, accounts, parties, branches, onSection, onNavigate }: Props) {
  const { lang } = useLang(); const ar = lang === "ar"; const T = useCallback((en: string, a: string) => (ar ? a : en), [ar]); const dir = ar ? "rtl" : "ltr";
  const cur = (ar ? curAr() : curEn());
  const [pkey, setPkey] = useState<PeriodKey>("month"); const [cFrom, setCFrom] = useState(""); const [cTo, setCTo] = useState(""); const [branch, setBranch] = useState("");
  const [entries, setEntries] = useState<JEntry[]>([]); const [treasuries, setTreasuries] = useState<GLTreasury[]>([]); const [assets, setAssets] = useState<AssetLike[]>([]);
  const [loading, setLoading] = useState(true); const [err, setErr] = useState(""); const [truncated, setTruncated] = useState(false); const [stamp, setStamp] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const [r, tr, as] = await Promise.all([fetchEntriesPaged(org.id, "2000-01-01", "2099-12-31", null), DB.fetchTreasuries(org.id), DB.fetchAssets(org.id, null)]);
      setEntries(r.rows as unknown as JEntry[]); setTruncated(r.truncated); if (r.error) setErr(r.error); setTreasuries(tr || []); setAssets((as || []) as unknown as AssetLike[]); setStamp(new Date().toISOString().slice(11, 16));
    } catch (e) { setErr((e as { message?: string })?.message || "load failed"); }
    setLoading(false);
  }, [org.id]);
  useEffect(() => { void load(); }, [load]);

  const range = useMemo(() => periodRange(pkey, today(), cFrom && cTo ? { from: cFrom, to: cTo } : undefined), [pkey, cFrom, cTo]);
  const nm = useCallback((a: GLAccount): string => (ar ? a.name : a.name_en || a.name), [ar]);
  const d: DashData = useMemo(() => computeDash({ entries, accounts, parties, treasuries, assets, from: range.from, to: range.to, branchId: branch ? Number(branch) : null, truncated, today: today(), accName: nm }), [entries, accounts, parties, treasuries, assets, range, branch, truncated, nm]);
  const multi = branches.length > 1;
  const go = (s: string) => onSection?.(s);

  const ALERT: Record<AlertCode, { t: string; hint: string }> = {
    unbalanced: { t: T("Posted entries that are not balanced", "قيود مرحّلة غير متوازنة"), hint: T("Review them in the journal", "راجعها من القيود اليومية") },
    neg_cash: { t: T("Negative cash / bank balance", "رصيد سالب في خزنة/بنك"), hint: T("Check treasury movements", "راجع حركة الخزن والبنوك") },
    assets_recon: { t: T("Fixed-asset register differs from the ledger", "سجل الأصول الثابتة لا يطابق الدفتر"), hint: T("Open the assets reconciliation", "افتح مطابقة الأصول") },
    pending: { t: T("Entries awaiting approval", "قيود بانتظار الاعتماد"), hint: T("Approve or reject them", "اعتمدها أو أعدها") },
    dep_due: { t: T("Assets with depreciation due", "أصول عليها إهلاك مستحق"), hint: T("Post the due depreciation", "رحّل الإهلاك المستحق") },
    future_dated: { t: T("Posted entries dated in the future", "قيود مرحّلة بتاريخ مستقبلي"), hint: T("Verify the dates", "تحقق من التواريخ") },
    drafts: { t: T("Unposted draft entries", "قيود مسودة غير مرحّلة"), hint: T("Complete and post them", "أكملها ورحّلها") },
    truncated: { t: T("Data is capped at 5,000 entries — figures may be partial", "البيانات محدودة بـ 5000 قيد — قد تكون الأرقام جزئية"), hint: T("Use the financial statements with a narrower range", "استخدم القوائم المالية بنطاق أضيق") },
  };
  const SEV: Record<string, string> = { high: "border-red-500/30 bg-red-500/10 text-red-400", medium: "border-amber-500/30 bg-amber-500/10 text-amber-400", low: "border-slate-700 bg-slate-800/60 text-slate-300" };
  const delta = (c: number, p: number | null, upGood = true): ReactNode => { const pct = changePct(c, p); if (pct == null) return <span className="text-slate-400">{T("no prior data", "لا مقارنة")}</span>; const good = (pct >= 0) === upGood; return <span className={`inline-flex items-center gap-0.5 font-bold ${good ? "text-emerald-400" : "text-red-400"}`} data-testid="delta">{pct >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}<span className="[direction:ltr] inline-block">{Math.abs(pct).toFixed(1)}%</span><span className="text-slate-400 font-normal ms-1">{T("vs previous", "عن السابقة")}</span></span>; };
  const KPI = ({ id, icon: Icon, label, value, neg, sub, tone, onClick }: { id: string; icon: typeof Wallet; label: string; value: string; neg?: boolean; sub?: ReactNode; tone: string; onClick?: () => void }) => (
    <button type="button" onClick={onClick} disabled={!onClick} data-testid={id} className={`${CARD} p-4 text-start flex flex-col gap-1 min-h-[112px] transition-colors ${onClick ? "hover:border-blue-500/50 cursor-pointer" : "cursor-default"}`}>
      <div className="flex items-center justify-between gap-2"><span className="text-[11px] font-bold text-slate-400">{label}</span><span className={`w-8 h-8 rounded-xl bg-slate-800/60 flex items-center justify-center ${tone}`}><Icon size={16} /></span></div>
      <div className={`text-xl font-black font-mono [direction:ltr] text-start ${neg ? "text-red-400" : tone}`} data-testid={id + "-v"}>{loading ? "…" : value}</div>
      {sub && <div className="text-[11px] text-slate-400 mt-auto">{sub}</div>}
    </button>);
  const Head = ({ icon: Icon, title, extra }: { icon: typeof Wallet; title: string; extra?: ReactNode }) => (<div className="flex items-center gap-2 mb-3"><span className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center"><Icon size={15} /></span><h3 className="text-sm font-bold text-white">{title}</h3>{extra && <span className="ms-auto text-[11px] text-slate-400">{extra}</span>}</div>);
  const Empty = ({ children }: { children: ReactNode }) => <div className="py-8 text-center text-xs text-slate-400">{children}</div>;

  // رسم الأعمدة الشهرية
  const maxV = Math.max(1, ...d.monthly.map((m) => Math.max(m.revenue, m.expense, 0)));
  const hasMonthly = d.monthly.some((m) => m.revenue !== 0 || m.expense !== 0);
  const PRESETS: [PeriodKey, string][] = [["month", T("This month", "هذا الشهر")], ["quarter", T("This quarter", "هذا الربع")], ["year", T("This year", "هذه السنة")], ["last_year", T("Last year", "السنة الماضية")], ["custom", T("Custom", "مخصص")]];
  const STATE_LBL: Record<string, string> = { draft: T("Draft", "مسودة"), pending: T("Awaiting approval", "بانتظار الاعتماد"), approved: T("Approved", "معتمد"), posted: T("Posted", "مرحّل"), reversed: T("Reversed", "معكوس") };
  const KIND: Record<string, string> = { cash: T("Cash", "صناديق"), bank: T("Banks", "بنوك"), pos: T("POS / cards", "شبكة/نقاط بيع") };
  const unposted = d.journal.draft + d.journal.pending + d.journal.approved;
  const LINKS: { k: string; label: string; icon: typeof Wallet; nav?: string }[] = [
    { k: "journal", label: T("Journal entries center", "مركز القيود"), icon: BookOpen }, { k: "treasury", label: T("Treasury & banks", "الخزن والبنوك"), icon: Wallet }, { k: "parties", label: T("Customers & suppliers", "العملاء والموردون"), icon: Users },
    { k: "chart", label: T("Chart of accounts", "دليل الحسابات"), icon: Network }, { k: "opening", label: T("Opening balances", "الأرصدة الافتتاحية"), icon: Layers }, { k: "ledger", label: T("General ledger", "كشف حساب"), icon: FileText },
    { k: "trial", label: T("Trial balance", "ميزان المراجعة"), icon: Scale }, { k: "statements", label: T("Financial statements", "القوائم المالية"), icon: BarChart3 }, { k: "assets", label: T("Fixed assets", "الأصول الثابتة"), icon: Building2 },
    { k: "", nav: "fixed-expenses", label: T("Fixed expenses", "المصروفات الثابتة"), icon: Receipt },
  ];

  return (
    <div dir={dir} className="space-y-4" data-testid="acc-dashboard">
      {/* الترويسة + الفلاتر */}
      <div className={`${CARD} p-4`}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-[200px]"><h2 className="text-base font-black text-white">{T("Accounting dashboard", "لوحة تحكم الحسابات")}</h2><p className="text-[11px] text-slate-400">{org.name} · {d.period.from} → {d.period.to}{stamp ? ` · ${T("updated", "حُدّثت")} ${stamp}` : ""}</p></div>
          <div className="ms-auto flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl border border-slate-700 overflow-hidden" role="group" aria-label={T("Period", "الفترة")}>{PRESETS.map(([k, l]) => <button key={k} type="button" onClick={() => setPkey(k)} data-testid={`p-${k}`} aria-pressed={pkey === k} className={`px-3 py-2 text-xs font-bold transition-colors ${pkey === k ? "bg-[#0a58ca] text-[#fff]" : "bg-slate-950 text-slate-300 hover:text-white"}`}>{l}</button>)}</div>
            {pkey === "custom" && <><input type="date" value={cFrom} onChange={(e) => setCFrom(e.target.value)} className={INPUT + " [color-scheme:dark]"} data-testid="c-from" aria-label={T("From", "من")} /><input type="date" value={cTo} onChange={(e) => setCTo(e.target.value)} className={INPUT + " [color-scheme:dark]"} data-testid="c-to" aria-label={T("To", "إلى")} /></>}
            {multi && <select value={branch} onChange={(e) => setBranch(e.target.value)} className={INPUT} data-testid="d-branch" aria-label={T("Branch", "الفرع")}><option value="">{T("All branches", "كل الفروع")}</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>}
            <button type="button" onClick={() => void load()} disabled={loading} data-testid="d-refresh" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 hover:text-white text-xs font-bold disabled:opacity-50"><RefreshCw size={13} className={loading ? "animate-spin" : ""} /> {T("Refresh", "تحديث")}</button>
            <button type="button" onClick={() => go("journal")} data-testid="d-new" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0a58ca] hover:bg-[#084298] text-[#fff] text-xs font-bold"><Plus size={14} /> {T("New journal entry", "قيد جديد")}</button>
          </div>
        </div>
        {pkey === "custom" && !(cFrom && cTo && cFrom <= cTo) && <div className="text-[11px] text-amber-400 mt-2" data-testid="c-hint">{T("Pick a valid from/to range — showing this year meanwhile.", "اختر نطاقًا صحيحًا (من ≤ إلى) — تُعرض هذه السنة مؤقتًا.")}</div>}
        {err && <div className="text-xs text-red-400 mt-2" data-testid="d-err">{err}</div>}
      </div>

      {/* التنبيهات */}
      <div className={`${CARD} p-4`} data-testid="alerts">
        <Head icon={ShieldCheck} title={T("Needs your attention", "يحتاج انتباهك")} extra={d.alerts.length ? `${d.alerts.length}` : undefined} />
        {loading ? <Empty>…</Empty> : d.alerts.length === 0 ? <div className="flex items-center gap-2 text-xs text-emerald-400 font-bold" data-testid="alerts-clear"><CheckCircle2 size={15} /> {T("No open issues — books look healthy.", "لا توجد ملاحظات مفتوحة — الدفاتر سليمة.")}</div> : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">{d.alerts.map((a) => (
            <button key={a.code} type="button" onClick={() => go(a.target)} data-testid={`alert-${a.code}`} className={`flex items-start gap-2.5 text-start px-3 py-2.5 rounded-xl border ${SEV[a.severity]} hover:brightness-110 transition`}>
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              <span className="flex-1 min-w-0"><span className="block text-xs font-bold">{ALERT[a.code].t}{a.code !== "truncated" && a.code !== "assets_recon" && <b className="font-mono ms-1.5 [direction:ltr] inline-block">({a.count})</b>}</span><span className="block text-[11px] opacity-80">{a.detail ? `${a.detail} — ` : ""}{ALERT[a.code].hint}</span></span>
            </button>))}</div>)}
      </div>

      {/* المؤشرات */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="kpis">
        <KPI id="k-revenue" icon={TrendingUp} label={T("Revenue", "الإيرادات")} value={`${nf(d.income.revenue.total)} ${cur}`} tone="text-emerald-400" sub={delta(d.income.revenue.total, d.income.revenue.prevTotal)} onClick={() => go("statements")} />
        <KPI id="k-expense" icon={TrendingDown} label={T("Costs & expenses", "التكاليف والمصروفات")} value={`${nf(d.income.cogs.total + d.income.opex.total)} ${cur}`} tone="text-amber-400" sub={delta(d.income.cogs.total + d.income.opex.total, d.income.cogs.prevTotal != null && d.income.opex.prevTotal != null ? d.income.cogs.prevTotal + d.income.opex.prevTotal : null, false)} onClick={() => go("statements")} />
        <KPI id="k-net" icon={Coins} label={T("Net profit", "صافي الربح")} value={`${nf(d.income.net)} ${cur}`} neg={d.income.net < 0} tone="text-blue-400" sub={d.income.netMargin != null ? <span>{T("Net margin", "هامش الصافي")} <b className="font-mono [direction:ltr] inline-block">{d.income.netMargin.toFixed(1)}%</b> · {delta(d.income.net, d.income.prevNet)}</span> : delta(d.income.net, d.income.prevNet)} onClick={() => go("statements")} />
        <KPI id="k-gross" icon={Calculator} label={T("Gross profit", "مجمل الربح")} value={`${nf(d.income.grossProfit)} ${cur}`} neg={d.income.grossProfit < 0} tone="text-indigo-400" sub={d.income.grossMargin != null ? <span>{T("Gross margin", "هامش المجمل")} <b className="font-mono [direction:ltr] inline-block">{d.income.grossMargin.toFixed(1)}%</b></span> : T("no revenue in period", "لا إيرادات في الفترة")} onClick={() => go("statements")} />
        <KPI id="k-liquidity" icon={Wallet} label={T("Cash & banks", "السيولة (صناديق وبنوك)")} value={`${nf(d.liquidity.total)} ${cur}`} neg={d.liquidity.total < 0} tone="text-emerald-400" sub={Object.entries(d.liquidity.byKind).map(([k, v]) => `${KIND[k] || k}: ${nf(v)}`).join(" · ") || T("no treasuries", "لا توجد خزن")} onClick={() => go("treasury")} />
        <KPI id="k-recv" icon={Users} label={T("Customer receivables", "ذمم العملاء")} value={`${nf(d.receivables.total)} ${cur}`} neg={d.receivables.total < 0} tone="text-sky-400" sub={`${d.receivables.holders} ${T("customer accounts", "حساب عميل")}`} onClick={() => go("parties")} />
        <KPI id="k-pay" icon={Banknote} label={T("Supplier payables", "ذمم الموردين")} value={`${nf(d.payables.total)} ${cur}`} neg={d.payables.total < 0} tone="text-rose-400" sub={`${d.payables.holders} ${T("supplier accounts", "حساب مورد")}`} onClick={() => go("parties")} />
        <KPI id="k-assets" icon={Building2} label={T("Fixed assets (book value)", "الأصول الثابتة (القيمة الدفترية)")} value={d.assets ? `${nf(d.assets.book)} ${cur}` : "—"} tone="text-purple-400" sub={d.assets ? `${d.assets.count} ${T("assets", "أصل")} · ${T("depreciation due", "إهلاك مستحق")} ${nf(d.assets.due)}` : T("no registered assets", "لا أصول مسجلة")} onClick={() => go("assets")} />
      </div>

      {/* الرسوم */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className={`${CARD} p-4 lg:col-span-2`} data-testid="chart-monthly">
          <Head icon={BarChart3} title={`${T("Revenue vs expenses", "الإيرادات مقابل المصروفات")} ${d.period.to.slice(0, 4)}`} extra={<span className="inline-flex gap-3"><span className="inline-flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm" style={{ background: "#10b981" }} />{T("Revenue", "الإيرادات")}</span><span className="inline-flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm" style={{ background: "#f59e0b" }} />{T("Expenses", "المصروفات")}</span></span>} />
          {loading ? <Empty>…</Empty> : !hasMonthly ? <Empty>{T("No revenue or expense movement this year.", "لا توجد حركة إيرادات أو مصروفات هذا العام.")}</Empty> : (
            <svg viewBox="0 0 600 190" className="w-full h-auto" role="img" aria-label={T("Monthly revenue and expenses", "الإيرادات والمصروفات الشهرية")} style={{ direction: "ltr" }}>
              {[0, 0.5, 1].map((g) => <line key={g} x1="8" x2="592" y1={150 - g * 130} y2={150 - g * 130} stroke="currentColor" strokeOpacity="0.12" />)}
              {d.monthly.map((m, i) => { const x = 14 + i * 48.5; const hr = (Math.max(m.revenue, 0) / maxV) * 130, he = (Math.max(m.expense, 0) / maxV) * 130; return (
                <g key={i} data-testid={`bar-${m.month}`}><title>{`${m.month}: ${T("Revenue", "إيراد")} ${nf(m.revenue)} / ${T("Expenses", "مصروف")} ${nf(m.expense)}`}</title>
                  <rect x={x} y={150 - hr} width="18" height={hr} rx="3" fill="#10b981" /><rect x={x + 20} y={150 - he} width="18" height={he} rx="3" fill="#f59e0b" />
                  <text x={x + 19} y="168" textAnchor="middle" fontSize="11" fill="currentColor" className="text-slate-400">{i + 1}</text></g>); })}
            </svg>)}
        </div>
        <div className={`${CARD} p-4`} data-testid="chart-expense">
          <Head icon={Layers} title={T("Top costs & expenses", "أكبر التكاليف والمصروفات")} />
          {loading ? <Empty>…</Empty> : d.expenseTop.length === 0 ? <Empty>{T("No expenses in this period.", "لا مصروفات في هذه الفترة.")}</Empty> : (
            <div className="space-y-2.5">{d.expenseTop.map((x) => { const tot = d.income.cogs.total + d.income.opex.total || 1; return (
              <div key={x.label} data-testid="exp-row"><div className="flex justify-between text-[11px] mb-1 gap-2"><span className="text-slate-300 truncate">{x.label}</span><span className="font-mono text-slate-200 [direction:ltr] shrink-0">{nf(x.value)}</span></div>
                <div className="h-2 rounded-full bg-slate-800 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.min(100, (x.value / tot) * 100)}%`, background: "#f59e0b" }} /></div></div>); })}</div>)}
        </div>
      </div>

      {/* السيولة والذمم */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className={`${CARD} p-4`} data-testid="list-treasury">
          <Head icon={Landmark} title={T("Treasuries & banks", "الخزن والبنوك")} />
          {d.liquidity.treasuries.length === 0 ? <Empty>{T("No treasuries yet.", "لا توجد خزن بعد.")}</Empty> : <ul className="divide-y divide-slate-800">{d.liquidity.treasuries.map((t) => (
            <li key={t.id} className="flex items-center justify-between py-2 text-xs gap-2" data-testid="tr-row"><span className="text-slate-200 truncate">{t.name}<span className="text-[10px] text-slate-400 ms-1.5">{KIND[t.kind] || t.kind}</span></span><b className={`font-mono [direction:ltr] ${t.balance < 0 ? "text-red-400" : "text-slate-200"}`}>{nf(t.balance)}</b></li>))}</ul>}
        </div>
        <div className={`${CARD} p-4`} data-testid="list-recv">
          <Head icon={Users} title={T("Top customer balances", "أكبر أرصدة العملاء")} />
          {d.receivables.top.length === 0 ? <Empty>{T("No customer balances.", "لا أرصدة عملاء.")}</Empty> : <ul className="divide-y divide-slate-800">{d.receivables.top.map((p) => (<li key={p.accountId} className="flex items-center justify-between py-2 text-xs gap-2"><span className="text-slate-200 truncate">{p.name}</span><b className="font-mono [direction:ltr] text-slate-200">{nf(p.balance)}</b></li>))}</ul>}
        </div>
        <div className={`${CARD} p-4`} data-testid="list-pay">
          <Head icon={Banknote} title={T("Top supplier balances", "أكبر أرصدة الموردين")} />
          {d.payables.top.length === 0 ? <Empty>{T("No supplier balances.", "لا أرصدة موردين.")}</Empty> : <ul className="divide-y divide-slate-800">{d.payables.top.map((p) => (<li key={p.accountId} className="flex items-center justify-between py-2 text-xs gap-2"><span className="text-slate-200 truncate">{p.name}</span><b className="font-mono [direction:ltr] text-slate-200">{nf(p.balance)}</b></li>))}</ul>}
        </div>
      </div>

      {/* القيود */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className={`${CARD} p-4`} data-testid="journal-health">
          <Head icon={FileClock} title={T("Journal status", "حالة القيود")} extra={<button type="button" className="underline text-blue-400" onClick={() => go("journal")}>{T("Open center", "فتح المركز")}</button>} />
          <ul className="space-y-2 text-xs">{(["posted", "reversed", "approved", "pending", "draft"] as const).map((k) => (<li key={k} className="flex items-center justify-between" data-testid={`jh-${k}`}><span className="text-slate-300">{STATE_LBL[k]}</span><b className="font-mono [direction:ltr] text-slate-200">{d.journal[k]}</b></li>))}
            <li className="flex items-center justify-between pt-2 border-t border-slate-800"><span className="text-slate-300">{T("Posted in period", "مرحّلة في الفترة")}</span><b className="font-mono [direction:ltr] text-slate-200">{d.journal.periodCount}</b></li>
            <li className="flex items-center justify-between"><span className="text-slate-300">{T("Unposted total", "غير مرحّلة")}</span><b className="font-mono [direction:ltr] text-slate-200" data-testid="jh-unposted">{unposted}</b></li></ul>
          {d.byType.length > 0 && <div className="mt-3 pt-3 border-t border-slate-800 space-y-1.5" data-testid="by-type">{d.byType.slice(0, 5).map((x) => (<div key={x.type} className="flex justify-between text-[11px] gap-2"><span className="text-slate-400 truncate">{ar ? DB.ENTRY_TYPE_LABEL[x.type] || x.type : x.type.replace(/_/g, " ")}</span><span className="font-mono text-slate-300 [direction:ltr] shrink-0">{x.count} · {fmtCents(x.debitC)}</span></div>))}</div>}
        </div>
        <div className={`${CARD} p-4 lg:col-span-2`} data-testid="recent">
          <Head icon={BookOpen} title={T("Latest entries", "آخر القيود")} extra={<button type="button" className="underline text-blue-400" onClick={() => go("journal")}>{T("All entries", "كل القيود")}</button>} />
          {d.recent.length === 0 ? <Empty>{T("No entries yet.", "لا توجد قيود بعد.")}</Empty> : (
            <div className="overflow-x-auto"><table className="w-full text-xs border-collapse"><thead><tr className="text-[10px] text-slate-400 border-b border-slate-800"><th className="text-start py-2 font-bold">{T("No.", "الرقم")}</th><th className="text-start font-bold">{T("Date", "التاريخ")}</th><th className="text-start font-bold">{T("Description", "البيان")}</th><th className="text-end font-bold">{T("Amount", "المبلغ")}</th><th className="text-center font-bold">{T("Status", "الحالة")}</th></tr></thead>
              <tbody className="divide-y divide-slate-800/60">{d.recent.map((e) => (<tr key={e.id} onClick={() => go("journal")} className="hover:bg-slate-800/30 cursor-pointer" data-testid="recent-row"><td className="py-2 font-mono font-bold text-blue-400 [direction:ltr] whitespace-nowrap">{`JV-${e.entry_year}-${String(e.entry_no).padStart(4, "0")}`}</td><td className="font-mono text-slate-300 [direction:ltr] whitespace-nowrap">{e.date}</td><td className="text-slate-200 max-w-[240px] truncate">{e.description || "—"}</td><td className="text-end font-mono text-slate-200 [direction:ltr]">{fmtCents(e.debitC)}</td><td className="text-center"><span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 whitespace-nowrap">{STATE_LBL[e.state]}</span></td></tr>))}</tbody></table></div>)}
        </div>
      </div>

      {/* الاختصارات */}
      <div className={`${CARD} p-4`} data-testid="shortcuts">
        <Head icon={Package} title={T("Quick access", "وصول سريع")} />
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2">{LINKS.map((l) => { const I = l.icon; return (
          <button key={l.label} type="button" onClick={() => (l.nav ? onNavigate?.(l.nav) : go(l.k))} data-testid={`sc-${l.nav || l.k}`} className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-slate-800/60 border border-slate-700 text-slate-200 text-xs font-bold hover:border-blue-500/50 transition-colors text-start"><I size={14} className="text-blue-400 shrink-0" /> <span className="truncate">{l.label}</span></button>); })}</div>
      </div>
    </div>
  );
}
