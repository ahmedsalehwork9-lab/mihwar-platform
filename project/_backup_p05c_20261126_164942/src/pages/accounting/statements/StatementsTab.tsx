// =============================================================
// src/pages/accounting/statements/StatementsTab.tsx
// القوائم المالية: قائمة الدخل (مقارنة فترة سابقة) · الميزانية · التدفقات النقدية (مباشرة / غير مباشرة).
// مستويات العرض (تجميع حسب مستوى الحساب + طي/فتح) وفتح حركة أي حساب بالضغط عليه.
// ثنائية اللغة (RTL/LTR)، تحديث تلقائي، المسودات مستبعدة افتراضيًا.
// =============================================================
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { ChevronDown, ChevronLeft, ChevronRight, Download, Keyboard, Plus, Printer, RotateCcw, Scale, Search, TrendingUp, Wallet, X } from "lucide-react";
import * as DB from "../../lib/accountingDb";
import type { GLAccount } from "../../lib/accountingDb";
import { useLang } from "../../../context/LanguageContext";
import { normalizeText, splitHighlight } from "../chart/chartLogic";
import AccountCombo from "../ledger/AccountCombo";
import { ENTRY_TYPE_EN, PRESET_KEYS, datePreset, presetOf, type PresetKey } from "../ledger/ledgerLogic";
import AccountDrill, { type DrillData } from "./AccountDrill";
import {
  accountMovements, activityOf, buildBalance, buildCashFlow, buildIncome, buildIndirectFlow, buildTreeRows, cashEntryIds, changePct, detectCashAccounts, filterTreeRows,
  isCogsAccount, maxDepth, previousPeriod, sumByAccount, type CashActivity, type StmtEntry, type TreeRow,
} from "./statementsLogic";

const CARD = "bg-slate-900 border border-slate-800 rounded-2xl";
const INPUT = "w-full bg-slate-950 border border-slate-700 rounded-xl text-white px-3 py-2 text-sm outline-none focus:border-blue-500 transition-colors";
const DATE = INPUT + " [color-scheme:dark]";
const LABEL = "text-[10px] text-slate-500 font-bold mb-1 block";
const BTN_SOFT = "inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 hover:text-white font-bold text-xs transition-colors disabled:opacity-50";
const BTN_GHOST_EM = "inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold text-xs transition-colors disabled:opacity-50";
const KBD = "px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] font-mono text-slate-300";

const todayStr = (): string => new Date().toISOString().slice(0, 10);
const fmt = (n: number): string => (Math.round(n * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pctTxt = (n: number | null): string => (n == null ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(1)}%`);

type Branch = { id: number; name: string };
type Props = { org: { id: number; name: string }; accounts: GLAccount[]; branches: Branch[] | undefined; shop: { shop_name?: string; logo_url?: string; tax_number?: string; address?: string } | null | undefined };
type View = "income" | "balance" | "cash";
type Method = "direct" | "indirect";
type Prefs = { drafts: boolean; compare: boolean; method: Method };

const PREF_KEY = "mihwar.statements.prefs.v1";
const loadPrefs = (): Prefs => { try { const j = JSON.parse(localStorage.getItem(PREF_KEY) || "{}"); return { drafts: j.drafts === true, compare: j.compare !== false, method: j.method === "indirect" ? "indirect" : "direct" }; } catch { return { drafts: false, compare: true, method: "direct" }; } };
const savePrefs = (p: Prefs): void => { try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch { /* تجاهل */ } };
const cashKey = (orgId: number): string => `mihwar.statements.cash.${orgId}`;
const loadCash = (orgId: number): number[] | null => { try { const j = JSON.parse(localStorage.getItem(cashKey(orgId)) || "null"); return Array.isArray(j) ? j.filter((x) => typeof x === "number") : null; } catch { return null; } };
const saveCash = (orgId: number, ids: number[] | null): void => { try { if (ids) localStorage.setItem(cashKey(orgId), JSON.stringify(ids)); else localStorage.removeItem(cashKey(orgId)); } catch { /* تجاهل */ } };

/** نموذج عرض موحّد: يُرسم في الجدول ويُصدَّر منه Excel والطباعة. */
type Drill = { mode: "plain" | "cash"; from: string | null; sign: 1 | -1 };
type Block =
  | { k: "sec"; title: string }
  | { k: "rows"; rows: TreeRow[]; drill: Drill }
  | { k: "line"; label: string; v: number; tone?: string }
  | { k: "total"; label: string; v: number; p?: number | null; strong?: boolean; tone?: string }
  | { k: "warn"; text: string; id: string };

export default function StatementsTab({ org, accounts, branches, shop }: Props) {
  const { t, lang, isRTL } = useLang();
  const dir = isRTL ? "rtl" : "ltr";
  const multiBranch = !!branches && branches.length > 1;
  const today = todayStr();
  const [view, setView] = useState<View>("income");
  const [from, setFrom] = useState(`${today.slice(0, 4)}-01-01`);
  const [to, setTo] = useState(today);
  const [fBranch, setFBranch] = useState("");
  const [drafts, setDrafts] = useState(() => loadPrefs().drafts);
  const [compare, setCompare] = useState(() => loadPrefs().compare);
  const [method, setMethod] = useState<Method>(() => loadPrefs().method);
  const [level, setLevel] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [q, setQ] = useState("");
  const [entries, setEntries] = useState<StmtEntry[]>([]);
  const [treasuryIds, setTreasuryIds] = useState<number[]>([]);
  const [manualCash, setManualCash] = useState<number[] | null>(() => loadCash(org.id));
  const [loading, setLoading] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  const [adding, setAdding] = useState<number | null>(null);
  const [drill, setDrill] = useState<DrillData | null>(null);
  const seq = useRef(0);
  const searchRef = useRef<HTMLInputElement>(null);

  const accById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const nameOf = useCallback((a: GLAccount): string => (lang === "en" && a.name_en ? a.name_en : a.name), [lang]);
  const typeLabel = useCallback((k: string | null): string => { const key = k || "general"; return lang === "ar" ? DB.ENTRY_TYPE_LABEL[key] || key : ENTRY_TYPE_EN[key] || key; }, [lang]);
  const leafAccounts = useMemo(() => accounts.filter((a) => !a.is_group), [accounts]);
  const branchId = fBranch ? Number(fBranch) : null;
  const tokens = useMemo(() => normalizeText(q).split(/\s+/).filter(Boolean), [q]);
  const deepest = useMemo(() => maxDepth(accounts), [accounts]);

  useEffect(() => { savePrefs({ drafts, compare, method }); }, [drafts, compare, method]);
  useEffect(() => {
    const my = ++seq.current; setLoading(true);
    (async () => {
      try {
        const [es, tr] = await Promise.all([DB.fetchEntries(org.id, "2000-01-01", to, branchId), DB.fetchTreasuries(org.id)]);
        if (my !== seq.current) return;
        setEntries(es as unknown as StmtEntry[]); setTreasuryIds(tr.map((x) => x.account_id).filter((x): x is number => !!x));
      } finally { if (my === seq.current) setLoading(false); }
    })();
  }, [org.id, to, branchId]);

  const valid = view === "balance" || from <= to;
  const prevP = useMemo(() => previousPeriod(from, to), [from, to]);
  const dayBeforeFrom = prevP.to;
  const cur = useMemo(() => sumByAccount(entries, accById, from, to, drafts, branchId), [entries, accById, from, to, drafts, branchId]);
  const prev = useMemo(() => (compare ? sumByAccount(entries, accById, prevP.from, prevP.to, drafts, branchId) : null), [compare, entries, accById, prevP, drafts, branchId]);
  const toDate = useMemo(() => sumByAccount(entries, accById, null, to, drafts, branchId), [entries, accById, to, drafts, branchId]);
  const beforeFrom = useMemo(() => sumByAccount(entries, accById, null, dayBeforeFrom, drafts, branchId), [entries, accById, dayBeforeFrom, drafts, branchId]);
  const income = useMemo(() => buildIncome(accounts, cur, prev), [accounts, cur, prev]);
  const balance = useMemo(() => buildBalance(accounts, toDate), [accounts, toDate]);
  const autoCash = useMemo(() => detectCashAccounts(accounts, treasuryIds), [accounts, treasuryIds]);
  const cashIds = manualCash ?? autoCash;
  const flow = useMemo(() => buildCashFlow(entries, accounts, accById, cashIds, from, to, drafts, branchId), [entries, accounts, accById, cashIds, from, to, drafts, branchId]);
  const indirect = useMemo(() => buildIndirectFlow(accounts, beforeFrom, toDate, cur, cashIds), [accounts, beforeFrom, toDate, cur, cashIds]);

  const setCashIds = (ids: number[] | null) => { setManualCash(ids); saveCash(org.id, ids); };
  const orgName = shop?.shop_name || org.name;
  const preset = presetOf(from, to, today);
  const presetLabel: Record<PresetKey, string> = { thisMonth: t("This month", "هذا الشهر"), lastMonth: t("Last month", "الشهر الماضي"), thisQuarter: t("This quarter", "هذا الربع"), thisYear: t("This year", "هذه السنة"), lastYear: t("Last year", "السنة الماضية"), all: t("All time", "كل الفترات") };
  const actLabel: Record<CashActivity, string> = { operating: t("Operating activities", "الأنشطة التشغيلية"), investing: t("Investing activities", "الأنشطة الاستثمارية"), financing: t("Financing activities", "الأنشطة التمويلية") };
  const periodTxt = view === "balance" ? `${t("As of", "كما في")} ${to}` : `${from} → ${to}`;
  const viewTitle = view === "income" ? t("Income statement", "قائمة الدخل") : view === "balance" ? t("Balance sheet", "الميزانية العمومية") : view === "cash" && method === "indirect" ? t("Cash flow statement (indirect)", "قائمة التدفقات النقدية (غير مباشرة)") : t("Cash flow statement (direct)", "قائمة التدفقات النقدية (مباشرة)");
  const showCmp = view === "income" && compare;
  const changeLevel = (l: number | null) => { setLevel(l); setCollapsed(new Set()); };

  // ── كتل العرض ──
  const blocks = useMemo<Block[]>(() => {
    const B: Block[] = [];
    const open = { collapsed, level };
    const tree = (pred: (a: GLAccount) => boolean, minDepth: number, c: (id: number) => number, p: ((id: number) => number) | null) => buildTreeRows(accounts, c, p, { pred, minDepth, ...open });
    const rows = (rs: TreeRow[], d: Drill): Block => ({ k: "rows", rows: filterTreeRows(rs, tokens, normalizeText), drill: d });
    if (view === "income") {
      const cf = (id: number) => cur.get(id) || 0; const pf = prev ? (id: number) => prev.get(id) || 0 : null;
      const pl: Drill = { mode: "plain", from, sign: 1 };
      const rev = tree((a) => a.type === "revenue", 2, cf, pf); const cg = tree(isCogsAccount, 2, cf, pf); const ox = tree((a) => a.type === "expense" && !isCogsAccount(a), 2, cf, pf);
      B.push({ k: "sec", title: t("Revenue", "الإيرادات") }, rows(rev.rows, pl), { k: "total", label: t("Total revenue", "إجمالي الإيرادات"), v: income.revenue.total, p: income.revenue.prevTotal });
      B.push({ k: "sec", title: t("Cost of sales", "تكلفة المبيعات") }, rows(cg.rows, pl), { k: "total", label: t("Total cost of sales", "إجمالي تكلفة المبيعات"), v: income.cogs.total, p: income.cogs.prevTotal });
      B.push({ k: "total", label: t("Gross profit", "مجمل الربح"), v: income.grossProfit, p: income.prevGross, strong: true, tone: income.grossProfit >= 0 ? "text-sky-300" : "text-red-300" });
      B.push({ k: "sec", title: t("Operating expenses", "المصروفات التشغيلية") }, rows(ox.rows, pl), { k: "total", label: t("Total operating expenses", "إجمالي المصروفات التشغيلية"), v: income.opex.total, p: income.opex.prevTotal });
      B.push({ k: "total", label: income.net >= 0 ? t("Net profit", "صافي الربح") : t("Net loss", "صافي الخسارة"), v: income.net, p: income.prevNet, strong: true, tone: income.net >= 0 ? "text-emerald-300" : "text-red-300" });
    } else if (view === "balance") {
      const cf = (id: number) => toDate.get(id) || 0; const pl: Drill = { mode: "plain", from: null, sign: 1 };
      const sec = (title: string, pred: (a: GLAccount) => boolean, md: number, totLabel: string, tot: number) => { B.push({ k: "sec", title }, rows(tree(pred, md, cf, null).rows, pl), { k: "total", label: totLabel, v: tot }); };
      sec(t("Current assets", "الأصول المتداولة"), (a) => a.type === "asset" && !a.code.startsWith("12"), 3, t("Total current assets", "إجمالي الأصول المتداولة"), balance.totCurrentAssets);
      sec(t("Non-current assets", "الأصول غير المتداولة"), (a) => a.type === "asset" && a.code.startsWith("12"), 3, t("Total non-current assets", "إجمالي الأصول غير المتداولة"), balance.totFixedAssets);
      B.push({ k: "total", label: t("Total assets", "إجمالي الأصول"), v: balance.totAssets, strong: true, tone: "text-sky-300" });
      sec(t("Current liabilities", "الخصوم المتداولة"), (a) => a.type === "liability" && !a.code.startsWith("22"), 3, t("Total current liabilities", "إجمالي الخصوم المتداولة"), balance.totCurrentLiab);
      sec(t("Non-current liabilities", "الخصوم غير المتداولة"), (a) => a.type === "liability" && a.code.startsWith("22"), 3, t("Total non-current liabilities", "إجمالي الخصوم غير المتداولة"), balance.totLongLiab);
      B.push({ k: "sec", title: t("Equity", "حقوق الملكية") }, rows(tree((a) => a.type === "equity", 2, cf, null).rows, pl));
      B.push({ k: "line", label: balance.retained >= 0 ? t("Retained earnings (net income)", "الأرباح المحتجزة (صافي الدخل)") : t("Accumulated loss", "الخسائر المتراكمة"), v: balance.retained, tone: balance.retained < 0 ? "text-red-300" : undefined });
      B.push({ k: "total", label: t("Total equity", "إجمالي حقوق الملكية"), v: balance.totEquityWithRetained });
      B.push({ k: "total", label: t("Total liabilities & equity", "إجمالي الخصوم وحقوق الملكية"), v: balance.right, strong: true, tone: balance.balanced ? "text-emerald-300" : "text-amber-300" });
      if (!balance.balanced) B.push({ k: "warn", id: "unbalanced", text: t(`⚠ Out of balance by ${fmt(balance.diff)} — check opening balances and one-sided entries.`, `⚠ الميزانية غير متوازنة بفارق ${fmt(balance.diff)} — راجع الأرصدة الافتتاحية والقيود غير المتوازنة.`) });
    } else if (method === "direct") {
      const amt = new Map<number, number>(); for (const k of ["operating", "investing", "financing"] as CashActivity[]) for (const l of flow.sections[k].lines) amt.set(l.account.id, l.amount);
      const cd: Drill = { mode: "cash", from, sign: 1 };
      B.push({ k: "total", label: t("Opening cash", "رصيد النقدية أول الفترة"), v: flow.opening, tone: "text-slate-100" });
      for (const k of ["operating", "investing", "financing"] as CashActivity[]) {
        B.push({ k: "sec", title: actLabel[k] });
        const tr = tree((a) => activityOf(a) === k, 3, (id) => amt.get(id) || 0, null);
        if (flow.sections[k].lines.length === 0) B.push({ k: "line", label: t("No cash movements", "لا حركات نقدية"), v: 0, tone: "text-slate-600" }); else B.push(rows(tr.rows, cd));
        B.push({ k: "total", label: `${t("Net cash from", "صافي النقدية من")} ${actLabel[k]}`, v: flow.sections[k].total });
      }
      B.push({ k: "total", label: t("Net change in cash", "صافي التغير في النقدية"), v: flow.net, strong: true, tone: flow.net >= 0 ? "text-emerald-300" : "text-red-300" });
      B.push({ k: "total", label: t("Closing cash", "رصيد النقدية آخر الفترة"), v: flow.closing, strong: true, tone: "text-sky-300" });
      if (!flow.reconciled) B.push({ k: "warn", id: "unreconciled", text: t("⚠ The statement does not reconcile with cash balances.", "⚠ القائمة لا تطابق أرصدة النقدية.") });
    } else {
      const ind = indirect; const pl = (sign: 1 | -1): Drill => ({ mode: "plain", from, sign });
      const mapOf = (ls: { account: GLAccount; amount: number }[]) => { const m = new Map<number, number>(); ls.forEach((l) => m.set(l.account.id, l.amount)); return m; };
      const wcM = mapOf(ind.workingCapital); const invM = mapOf(ind.investing); const finM = mapOf(ind.financing);
      const sub = (m: Map<number, number>, md: number) => tree((a) => m.has(a.id), md, (id) => m.get(id) || 0, null).rows;
      B.push({ k: "total", label: t("Opening cash", "رصيد النقدية أول الفترة"), v: ind.opening, tone: "text-slate-100" });
      B.push({ k: "sec", title: actLabel.operating });
      B.push({ k: "line", label: ind.netIncome >= 0 ? t("Net profit for the period", "صافي ربح الفترة") : t("Net loss for the period", "صافي خسارة الفترة"), v: ind.netIncome });
      if (Math.abs(ind.depreciation) > 0.004) B.push({ k: "line", label: t("Add: depreciation (non-cash)", "يضاف: الإهلاك (بند غير نقدي)"), v: ind.depreciation });
      if (ind.workingCapital.length) { B.push({ k: "sec", title: t("Changes in working capital", "التغير في رأس المال العامل") }); B.push(rows(sub(wcM, 3), { mode: "plain", from, sign: -1 })); }
      B.push({ k: "total", label: `${t("Net cash from", "صافي النقدية من")} ${actLabel.operating}`, v: ind.operatingTotal });
      B.push({ k: "sec", title: actLabel.investing });
      if (ind.investing.length) B.push(rows(sub(invM, 3), pl(-1))); else B.push({ k: "line", label: t("No cash movements", "لا حركات نقدية"), v: 0, tone: "text-slate-600" });
      B.push({ k: "total", label: `${t("Net cash from", "صافي النقدية من")} ${actLabel.investing}`, v: ind.investingTotal });
      B.push({ k: "sec", title: actLabel.financing });
      if (ind.financing.length) B.push(rows(sub(finM, 2), pl(1))); else B.push({ k: "line", label: t("No cash movements", "لا حركات نقدية"), v: 0, tone: "text-slate-600" });
      B.push({ k: "total", label: `${t("Net cash from", "صافي النقدية من")} ${actLabel.financing}`, v: ind.financingTotal });
      B.push({ k: "total", label: t("Net change in cash", "صافي التغير في النقدية"), v: ind.net, strong: true, tone: ind.net >= 0 ? "text-emerald-300" : "text-red-300" });
      B.push({ k: "total", label: t("Closing cash", "رصيد النقدية آخر الفترة"), v: ind.closing, strong: true, tone: "text-sky-300" });
      if (!ind.reconciled) B.push({ k: "warn", id: "unreconciled", text: t("⚠ The statement does not reconcile with cash balances.", "⚠ القائمة لا تطابق أرصدة النقدية.") });
    }
    return B;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, method, accounts, cur, prev, toDate, income, balance, flow, indirect, collapsed, level, tokens, from, lang]);

  // ── فتح حركة الحساب ──
  const openDrill = (r: TreeRow, d: Drill) => {
    const ids = new Set(r.leafIds); const mode = d.mode;
    const mv = accountMovements(entries, ids, accById, { from: d.from, to, includeDrafts: drafts, branchId, onlyCashEntries: mode === "cash" ? cashEntryIds(entries, cashIds, drafts) : null });
    const single = r.leafIds.length === 1 && r.account.id === r.leafIds[0];
    // في غير المباشرة تقاس حركة الأصل بإشارة معكوسة مقابل رقم السطر
    const expected = mode === "plain" && d.sign === -1 ? -r.value : r.value;
    setDrill({ title: nameOf(r.account), code: r.account.code, rows: mv.rows, totalDebit: mv.totalDebit, totalCredit: mv.totalCredit, net: mv.net, expected, periodTxt: d.from ? `${d.from} → ${to}` : `${t("up to", "حتى")} ${to}`, cash: mode === "cash", multi: !single });
  };

  // ── التصدير والطباعة ──
  const sheetRows = (): (string | number)[][] => {
    const R: (string | number)[][] = []; const c = showCmp;
    if (view === "income") { const h: (string | number)[] = [t("Account", "الحساب"), t("Amount", "المبلغ")]; if (c) h.push(t("Previous", "السابق"), t("Change %", "التغير %")); R.push(h); }
    for (const b of blocks) {
      if (b.k === "sec") R.push([b.title, ""]);
      else if (b.k === "rows") for (const r of b.rows) R.push([`${"    ".repeat(r.indent)}${r.account.code} ${nameOf(r.account)}`, r.value, ...(c ? [r.prev ?? 0, changePct(r.value, r.prev) ?? ""] : [])]);
      else if (b.k === "line") R.push([b.label, b.v]);
      else if (b.k === "total") R.push([b.label, b.v, ...(c ? [b.p ?? 0, changePct(b.v, b.p ?? null) ?? ""] : [])]);
    }
    return R;
  };
  const exportExcel = () => {
    const ws = XLSX.utils.aoa_to_sheet([[orgName, `${viewTitle} — ${periodTxt}`], [], ...sheetRows()]); ws["!cols"] = [{ wch: 52 }, { wch: 16 }, { wch: 16 }, { wch: 12 }];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, view); XLSX.writeFile(wb, `${view}${view === "cash" ? `_${method}` : ""}_${view === "balance" ? to : `${from}_${to}`}.xlsx`);
  };
  const esc = (s: string): string => s.replace(/[&<>]/g, (ch) => (ch === "&" ? "&amp;" : ch === "<" ? "&lt;" : "&gt;"));
  const printIt = () => {
    const rows = sheetRows(); const cols = view === "income" ? (showCmp ? 4 : 2) : 2;
    const body = rows.map((r, i) => {
      if (i === 0 && view === "income") return `<tr>${r.map((cc) => `<th style="background:#14304d;color:#fff;padding:6px 10px;font-size:11px;text-align:start">${esc(String(cc))}</th>`).join("")}</tr>`;
      if (r.length >= 2 && r[1] === "" && typeof r[0] === "string") return `<tr><td colspan="${cols}" style="background:#e8eef5;padding:6px 10px;font-weight:800;font-size:12px">${esc(String(r[0]))}</td></tr>`;
      const strong = typeof r[0] === "string" && /^(Total|إجمالي|Gross|مجمل|Net|صافي|Closing|رصيد النقدية)/.test(r[0].trim());
      return `<tr>${r.map((cc, k) => `<td style="border:1px solid #e5e7eb;padding:5px 10px;${k === 0 ? "white-space:pre" : "text-align:end;direction:ltr;font-variant-numeric:tabular-nums;"}${strong ? "font-weight:800;background:#f8fafc" : ""}">${typeof cc === "number" ? fmt(cc) : esc(String(cc))}</td>`).join("")}</tr>`;
    }).join("");
    const logo = shop?.logo_url ? `<img src="${esc(shop.logo_url)}" style="height:54px;object-fit:contain"/>` : "";
    const html = `<html dir="${dir}"><head><meta charset="UTF-8"><title>${esc(viewTitle)}</title></head><body style="font-family:'Segoe UI',Tahoma,sans-serif;padding:24px;color:#0f172a">
      <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #14304d;padding-bottom:10px;margin-bottom:14px"><div><div style="font-size:19px;font-weight:800">${esc(orgName)}</div>${shop?.tax_number ? `<div>${esc(t("VAT no.", "الرقم الضريبي"))}: ${esc(shop.tax_number)}</div>` : ""}</div>${logo}</div>
      <h2 style="font-size:15px;margin:0 0 4px">${esc(viewTitle)}</h2><div style="font-size:12px;color:#475569;margin-bottom:10px">${esc(periodTxt)}${drafts ? ` — ${esc(t("includes drafts", "تشمل المسودات"))}` : ""}</div>
      <table style="border-collapse:collapse;width:100%;font-size:12px">${body}</table></body></html>`;
    const w = window.open("", "_blank"); if (!w) { alert(t("Allow pop-ups to print.", "فعّل النوافذ المنبثقة للطباعة.")); return; }
    w.document.write(html); w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName; const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      if (drill) return;
      if (e.key === "/" && !typing) { e.preventDefault(); searchRef.current?.focus(); searchRef.current?.select(); }
      else if (e.key === "Escape" && e.target === searchRef.current) { e.preventDefault(); setQ(""); searchRef.current?.blur(); }
    };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [drill]);

  // ── مكوّنات العرض ──
  const Hl = ({ text }: { text: string }) => (<>{splitHighlight(text, tokens).map((p, i) => (p.hit ? <mark key={i} className="bg-amber-400/30 text-inherit rounded px-0.5">{p.s}</mark> : <span key={i}>{p.s}</span>))}</>);
  const CollapsedIcon = isRTL ? ChevronLeft : ChevronRight;
  const cmpCells = (v: number, p: number | null | undefined, strong?: boolean) => {
    const ch = p != null ? changePct(v, p) : null;
    return (<><td className={`px-3 py-2 text-xs font-mono text-end ${strong ? "text-slate-400" : "text-slate-400"}`} dir="ltr">{p != null ? fmt(p) : ""}</td><td className={`px-3 py-2 text-[11px] font-mono text-end ${ch == null ? "text-slate-600" : ch >= 0 ? "text-emerald-400" : "text-red-400"}`} dir="ltr">{pctTxt(ch)}</td></>);
  };
  const revBase = income.revenue.total;
  const shareCell = (v: number, strong?: boolean) => <td className={`px-3 py-2 text-[11px] font-mono text-end ${strong ? "text-slate-400" : "text-slate-500"}`} dir="ltr">{revBase > 0 ? `${((v / revBase) * 100).toFixed(1)}%` : strong ? "" : "—"}</td>;
  const renderRow = (r: TreeRow, d: Drill) => {
    const isOpen = !collapsed.has(r.account.id);
    return (
      <tr key={r.account.id} className={`border-b border-slate-800/60 hover:bg-white/[0.03] ${r.isGroup ? "bg-slate-950/40" : ""}`} data-testid="stmt-line" data-code={r.account.code} data-group={r.isGroup ? "1" : undefined}>
        <td className="py-2 pe-3 text-xs text-start" style={{ paddingInlineStart: 12 + r.indent * 18 }}>
          <span className="inline-flex items-center gap-1.5">
            {r.expandable ? <button type="button" aria-label={isOpen ? t("Collapse", "طيّ") : t("Expand", "فتح")} aria-expanded={isOpen} data-testid="row-toggle" onClick={() => setCollapsed((s) => { const n = new Set(s); if (n.has(r.account.id)) n.delete(r.account.id); else n.add(r.account.id); return n; })} className="w-5 h-5 rounded text-slate-400 hover:text-white hover:bg-slate-700 flex items-center justify-center">{isOpen ? <ChevronDown size={13} /> : <CollapsedIcon size={13} />}</button> : <span className="w-5" />}
            <button type="button" onClick={() => openDrill(r, d)} data-testid="acct-open" title={t("Open account movements", "فتح حركة الحساب")} className={`text-start hover:text-blue-300 hover:underline underline-offset-2 ${r.isGroup ? "font-bold text-slate-100" : "text-slate-300"}`}>
              <span className="font-mono text-[10px] text-slate-500 me-2" dir="ltr"><Hl text={r.account.code} /></span><Hl text={nameOf(r.account)} />
            </button>
          </span>
        </td>
        <td className={`px-3 py-2 text-xs font-mono text-end ${r.isGroup ? "font-bold" : ""} ${r.value < 0 ? "text-red-300" : "text-slate-200"}`} dir="ltr" data-testid="line-amount">{fmt(r.value)}</td>
        {showCmp && cmpCells(r.value, r.prev)}
        {view === "income" && shareCell(r.value)}
      </tr>
    );
  };
  const renderBlock = (b: Block, i: number) => {
    if (b.k === "sec") return <tr key={i}><td colSpan={5} className="px-3 py-2 bg-blue-500/10 text-blue-300 text-[11px] font-bold border-b border-slate-800 text-start">{b.title}</td></tr>;
    if (b.k === "rows") return b.rows.map((r) => renderRow(r, b.drill));
    if (b.k === "line") return (<tr key={i} className="border-b border-slate-800/60"><td className={`px-3 py-2 text-xs text-start ${b.tone || "text-slate-300"}`} style={{ paddingInlineStart: 12 + 24 }}>{b.label}</td><td className={`px-3 py-2 text-xs font-mono text-end ${b.tone || "text-slate-200"}`} dir="ltr" data-testid="line-amount">{b.v === 0 && b.tone === "text-slate-600" ? "" : fmt(b.v)}</td></tr>);
    if (b.k === "warn") return <tr key={i}><td colSpan={5} className="px-3 py-2 text-[11px] text-amber-400 bg-amber-500/5" data-testid={b.id}>{b.text}</td></tr>;
    return (
      <tr key={i} className={`${b.strong ? "bg-slate-950" : "bg-slate-950/50"} border-b border-slate-700`} data-testid="stmt-total">
        <td className={`px-3 py-2.5 text-xs font-bold text-start ${b.tone || "text-slate-100"}`}>{b.label}</td>
        <td className={`px-3 py-2.5 text-xs font-mono font-bold text-end ${b.tone || "text-emerald-300"}`} dir="ltr">{fmt(b.v)}</td>
        {showCmp && cmpCells(b.v, b.p, true)}
        {view === "income" && shareCell(b.v, true)}
      </tr>
    );
  };

  const Kpi = ({ label, value, tone, sub, id }: { label: string; value: string; tone: string; sub?: string; id: string }) => (
    <div className={`${CARD} p-3`}><div className="text-[11px] font-bold text-slate-500">{label}</div><div className={`text-lg font-black mt-1 font-mono ${tone}`} dir="ltr" data-testid={id}>{value}</div>{sub && <div className="text-[10px] text-slate-500 mt-0.5" dir="ltr">{sub}</div>}</div>
  );
  const dChange = (c: number, p: number | null): string | undefined => (compare && p != null ? `${pctTxt(changePct(c, p))} ${t("vs previous", "عن السابق")}` : undefined);
  const hasAny = entries.length > 0;
  const tabBtn = (k: View, icon: React.ReactNode, label: string) => (
    <button key={k} type="button" role="tab" aria-selected={view === k} data-testid={`view-${k}`} onClick={() => setView(k)} className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors inline-flex items-center gap-1.5 ${view === k ? "bg-blue-600 text-[#fff]" : "text-slate-400 hover:text-slate-200"}`}>{icon}{label}</button>
  );
  const segBtn = (active: boolean, id: string, label: string, onClick: () => void) => (
    <button key={id} type="button" data-testid={id} aria-pressed={active} onClick={onClick} className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors ${active ? "bg-blue-600/25 border-blue-500/50 text-blue-200" : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"}`}>{label}</button>
  );
  const levelOptions = useMemo(() => { const o: number[] = []; for (let l = 2; l <= deepest; l++) o.push(l); return o; }, [deepest]);
  const cashFlowKpi = view === "cash" && method === "indirect" ? { opening: indirect.opening, closing: indirect.closing, rec: indirect.reconciled } : { opening: flow.opening, closing: flow.closing, rec: flow.reconciled };

  return (
    <div dir={dir} data-testid="statements-tab">
      <div className={`${CARD} p-3 mb-3`}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="inline-flex gap-1 bg-slate-950 border border-slate-800 rounded-xl p-1" role="tablist">
            {tabBtn("income", <TrendingUp size={14} />, t("Income statement", "قائمة الدخل"))}{tabBtn("balance", <Scale size={14} />, t("Balance sheet", "الميزانية"))}{tabBtn("cash", <Wallet size={14} />, t("Cash flow", "التدفقات النقدية"))}
          </div>
          {view !== "balance" && <div><label className={LABEL}>{t("From", "من")}</label><input type="date" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} className={DATE} data-testid="date-from" /></div>}
          <div><label className={LABEL}>{view === "balance" ? t("As of", "كما في تاريخ") : t("To", "إلى")}</label><input type="date" value={to} onChange={(e) => e.target.value && setTo(e.target.value)} className={DATE} data-testid="date-to" /></div>
          {multiBranch && <div><label className={LABEL}>{t("Branch", "الفرع")}</label><select value={fBranch} onChange={(e) => setFBranch(e.target.value)} className={INPUT} data-testid="branch"><option value="">{t("All branches", "كل الفروع")}</option>{branches!.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>}
          <button type="button" onClick={exportExcel} disabled={!valid} className={BTN_SOFT} data-testid="export"><Download size={14} /> Excel</button>
          <button type="button" onClick={printIt} disabled={!valid} className={BTN_GHOST_EM} data-testid="print"><Printer size={14} /> {t("Print", "طباعة")}</button>
          <button type="button" onClick={() => setShowKeys((v) => !v)} className={`${BTN_SOFT} ms-auto`} data-testid="keys-toggle"><Keyboard size={14} /> {t("Shortcuts", "الاختصارات")}</button>
        </div>
        {view !== "balance" && (
          <div className="flex flex-wrap gap-1.5 mt-2.5" data-testid="presets">
            {PRESET_KEYS.map((k) => segBtn(preset === k, `preset-${k}`, presetLabel[k], () => { const p = datePreset(k, today); setFrom(p.from); setTo(p.to); }))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 mt-2.5" data-testid="levels">
          <span className="text-[11px] font-bold text-slate-500 me-1">{t("Display level", "مستوى العرض")}</span>
          {segBtn(level == null, "level-all", t("Detailed", "تفصيلي"), () => changeLevel(null))}
          {levelOptions.map((l) => segBtn(level === l, `level-${l}`, `${t("Level", "المستوى")} ${l}`, () => changeLevel(l)))}
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-2.5">
          <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer"><input type="checkbox" checked={drafts} onChange={(e) => setDrafts(e.target.checked)} className="w-4 h-4 accent-blue-500" data-testid="drafts" /> {t("Include draft entries", "تضمين القيود المسودة")}</label>
          {view === "income" && <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer"><input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} className="w-4 h-4 accent-blue-500" data-testid="compare" /> {t("Compare with previous period", "مقارنة بالفترة السابقة")}{compare && valid && <span className="text-slate-500 font-mono text-[10px]" dir="ltr" data-testid="prev-range">({prevP.from} → {prevP.to})</span>}</label>}
          {view === "cash" && (
            <div className="inline-flex items-center gap-1.5" data-testid="methods"><span className="text-[11px] font-bold text-slate-500 me-1">{t("Method", "الطريقة")}</span>
              {segBtn(method === "direct", "method-direct", t("Direct", "مباشرة"), () => setMethod("direct"))}{segBtn(method === "indirect", "method-indirect", t("Indirect", "غير مباشرة"), () => setMethod("indirect"))}</div>
          )}
          <div className="relative flex-1 min-w-[220px] max-w-md ms-auto">
            <Search size={14} className="absolute top-1/2 -translate-y-1/2 start-3 text-slate-500" />
            <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} data-testid="stmt-search" className={`${INPUT} ps-9 pe-8`} placeholder={t("/ · Filter accounts by code or name…", "/ · صفّ الحسابات بالكود أو الاسم…")} />
            {q && <button type="button" aria-label={t("Clear", "مسح")} onClick={() => setQ("")} className="absolute top-1/2 -translate-y-1/2 end-2 text-slate-500 hover:text-white"><X size={13} /></button>}
          </div>
        </div>
        {showKeys && <div className="mt-2 text-xs text-slate-300 flex flex-wrap gap-x-5 gap-y-1" data-testid="keys-help"><span><span className={KBD}>/</span> {t("filter accounts", "تصفية الحسابات")}</span><span><span className={KBD}>Esc</span> {t("clear filter / close movements", "مسح التصفية / إغلاق الحركة")}</span><span>{t("Click an account to open its movements", "اضغط على الحساب لفتح حركته")}</span></div>}
      </div>

      {!valid && <div className={`${CARD} p-6 text-center text-amber-400 text-sm`} data-testid="range-error">{t("The start date is after the end date.", "تاريخ البداية بعد تاريخ النهاية.")}</div>}

      {valid && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-3" data-testid="kpis">
            {view === "income" && <>
              <Kpi id="kpi-a" label={t("Revenue", "الإيرادات")} value={fmt(income.revenue.total)} tone="text-emerald-300" sub={dChange(income.revenue.total, income.revenue.prevTotal)} />
              <Kpi id="kpi-b" label={t("Gross profit", "مجمل الربح")} value={fmt(income.grossProfit)} tone="text-sky-300" sub={income.grossMargin != null ? `${income.grossMargin.toFixed(1)}% ${t("margin", "هامش")}` : undefined} />
              <Kpi id="kpi-c" label={t("Operating expenses", "المصروفات التشغيلية")} value={fmt(income.opex.total)} tone="text-amber-300" sub={dChange(income.opex.total, income.opex.prevTotal)} />
              <Kpi id="kpi-d" label={income.net >= 0 ? t("Net profit", "صافي الربح") : t("Net loss", "صافي الخسارة")} value={fmt(income.net)} tone={income.net >= 0 ? "text-emerald-300" : "text-red-400"} sub={income.netMargin != null ? `${income.netMargin.toFixed(1)}% ${t("margin", "هامش")}` : undefined} />
            </>}
            {view === "balance" && <>
              <Kpi id="kpi-a" label={t("Total assets", "إجمالي الأصول")} value={fmt(balance.totAssets)} tone="text-sky-300" />
              <Kpi id="kpi-b" label={t("Total liabilities", "إجمالي الخصوم")} value={fmt(balance.totLiab)} tone="text-amber-300" />
              <Kpi id="kpi-c" label={t("Equity (incl. earnings)", "حقوق الملكية (مع الأرباح)")} value={fmt(balance.totEquityWithRetained)} tone="text-emerald-300" />
              <Kpi id="kpi-d" label={t("Difference", "الفرق")} value={fmt(balance.diff)} tone={balance.balanced ? "text-emerald-300" : "text-red-400"} sub={balance.balanced ? t("Balanced", "متوازنة") : t("Not balanced", "غير متوازنة")} />
            </>}
            {view === "cash" && <>
              <Kpi id="kpi-a" label={t("Opening cash", "نقدية أول الفترة")} value={fmt(cashFlowKpi.opening)} tone="text-slate-200" />
              <Kpi id="kpi-b" label={t("Cash in", "المقبوضات")} value={fmt(flow.inflows)} tone="text-emerald-300" />
              <Kpi id="kpi-c" label={t("Cash out", "المدفوعات")} value={fmt(flow.outflows)} tone="text-amber-300" />
              <Kpi id="kpi-d" label={t("Closing cash", "نقدية آخر الفترة")} value={fmt(cashFlowKpi.closing)} tone="text-sky-300" sub={cashFlowKpi.rec ? t("Reconciled ✓", "مطابقة ✓") : t("Not reconciled", "غير مطابقة")} />
            </>}
          </div>

          {view === "cash" && (
            <div className={`${CARD} p-3 mb-3`} data-testid="cash-accounts">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="text-[11px] font-bold text-slate-400">{t("Accounts counted as cash", "الحسابات المعدودة نقدية")}</span>
                <span className="text-[10px] text-slate-500">{manualCash ? t("(custom)", "(مخصّصة)") : t("(auto: treasuries, cash boxes and bank)", "(تلقائي: الخزن والصناديق والبنك)")}</span>
                {manualCash && <button type="button" onClick={() => setCashIds(null)} className={`${BTN_SOFT} ms-auto`} data-testid="cash-reset"><RotateCcw size={12} /> {t("Back to auto", "العودة للتلقائي")}</button>}
              </div>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {cashIds.map((id) => { const a = accById.get(id); if (!a) return null; return (
                  <span key={id} className="inline-flex items-center gap-1.5 ps-2.5 pe-1.5 py-1 rounded-lg bg-slate-950 border border-slate-700 text-[11px] text-slate-200" data-testid="cash-chip"><span className="font-mono text-slate-500" dir="ltr">{a.code}</span>{nameOf(a)}
                    <button type="button" aria-label={t("Remove", "إزالة")} onClick={() => setCashIds(cashIds.filter((x) => x !== id))} className="text-slate-500 hover:text-red-400"><X size={12} /></button></span>); })}
                {cashIds.length === 0 && <span className="text-[11px] text-amber-400" data-testid="cash-none">{t("No cash accounts selected — add one below.", "لا توجد حسابات نقدية — أضف حسابًا من الأسفل.")}</span>}
              </div>
              <div className="max-w-md flex items-center gap-2"><div className="flex-1"><AccountCombo accounts={leafAccounts.filter((a) => a.type === "asset" && !cashIds.includes(a.id))} value={adding} onChange={(id) => { if (id != null) { setCashIds([...cashIds, id]); setAdding(null); } else setAdding(null); }} storageKey={`mihwar.statements.cashrecent.${org.id}`} testId="cash-add" placeholder={t("Add a cash/bank account…", "أضف حساب نقدية/بنك…")} /></div><Plus size={14} className="text-slate-500" /></div>
            </div>
          )}

          <div className={`${CARD} overflow-hidden max-w-4xl`}>
            <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2"><span className="text-sm font-bold text-white" data-testid="stmt-title">{viewTitle}</span><span className="text-[11px] text-slate-500 font-mono" dir="ltr">{periodTxt}</span>
              {loading && <span className="text-[11px] text-slate-500 ms-auto">{t("Loading…", "جارٍ التحميل…")}</span>}{!loading && !hasAny && <span className="text-[11px] text-slate-500 ms-auto" data-testid="no-data">{t("No journal entries yet", "لا توجد قيود بعد")}</span>}
            </div>
            <div className="overflow-auto">
              <table className="w-full border-collapse" data-testid="stmt-table" style={{ minWidth: showCmp ? 640 : 420 }}>
                {view === "income" && <thead><tr className="bg-slate-950"><th className="px-3 py-2 text-[10px] text-slate-400 text-start">{t("Account", "الحساب")}</th><th className="px-3 py-2 text-[10px] text-slate-400 text-end" dir="ltr">{t("Amount", "المبلغ")}</th>{showCmp && <><th className="px-3 py-2 text-[10px] text-slate-400 text-end" dir="ltr">{t("Previous", "السابق")}</th><th className="px-3 py-2 text-[10px] text-slate-400 text-end" dir="ltr">{t("Change", "التغير")}</th></>}<th className="px-3 py-2 text-[10px] text-slate-400 text-end" dir="ltr">{t("% of revenue", "% من الإيراد")}</th></tr></thead>}
                <tbody>{blocks.map((b, i) => renderBlock(b, i))}</tbody>
              </table>
            </div>
          </div>
          {view === "cash" && <div className="mt-2 text-[11px] text-slate-500" data-testid="cash-note">{method === "direct"
            ? t("Direct method: each line is the cash effect of entries touching the cash accounts above, grouped by the counter account. Transfers between cash accounts cancel out.", "الطريقة المباشرة: كل سطر هو الأثر النقدي للقيود التي تمس الحسابات النقدية أعلاه مجمّعًا حسب الحساب المقابل، والتحويل بين الحسابات النقدية يلغي نفسه.")
            : t("Indirect method: starts from net profit, adds back non-cash items (depreciation) and adjusts for changes in working capital, investing and financing balances. Result equals the direct method.", "الطريقة غير المباشرة: تبدأ من صافي الربح وتضيف البنود غير النقدية (الإهلاك) وتعدّل بتغيّر رأس المال العامل وأرصدة الاستثمار والتمويل. نتيجتها تساوي الطريقة المباشرة.")}</div>}
        </>
      )}
      {drill && <AccountDrill data={drill} accById={accById} typeLabel={typeLabel} nameOf={nameOf} onClose={() => setDrill(null)} />}
    </div>
  );
}
