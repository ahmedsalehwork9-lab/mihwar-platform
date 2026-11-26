// =============================================================
// src/pages/accounting/statements/StatementsTab.tsx
// القوائم المالية: قائمة الدخل (مع مقارنة فترة سابقة) · الميزانية العمومية · التدفقات النقدية.
// ثنائية اللغة (RTL/LTR)، تحديث تلقائي عند تغيير الفترة/الفرع، المسودات مستبعدة افتراضيًا.
// =============================================================
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Download, Keyboard, Plus, Printer, RotateCcw, Scale, Search, TrendingUp, Wallet, X } from "lucide-react";
import * as DB from "../../lib/accountingDb";
import type { GLAccount } from "../../lib/accountingDb";
import { useLang } from "../../../context/LanguageContext";
import { normalizeText, splitHighlight } from "../chart/chartLogic";
import AccountCombo from "../ledger/AccountCombo";
import { PRESET_KEYS, datePreset, presetOf, type PresetKey } from "../ledger/ledgerLogic";
import {
  buildBalance, buildCashFlow, buildIncome, changePct, detectCashAccounts, previousPeriod, rowMatches, sumByAccount,
  type CashActivity, type StmtEntry,
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

const PREF_KEY = "mihwar.statements.prefs.v1";
const loadPrefs = (): { drafts: boolean; compare: boolean } => { try { const j = JSON.parse(localStorage.getItem(PREF_KEY) || "{}"); return { drafts: j.drafts === true, compare: j.compare !== false }; } catch { return { drafts: false, compare: true }; } };
const savePrefs = (p: { drafts: boolean; compare: boolean }): void => { try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch { /* تجاهل */ } };
const cashKey = (orgId: number): string => `mihwar.statements.cash.${orgId}`;
const loadCash = (orgId: number): number[] | null => { try { const j = JSON.parse(localStorage.getItem(cashKey(orgId)) || "null"); return Array.isArray(j) ? j.filter((x) => typeof x === "number") : null; } catch { return null; } };
const saveCash = (orgId: number, ids: number[] | null): void => { try { if (ids) localStorage.setItem(cashKey(orgId), JSON.stringify(ids)); else localStorage.removeItem(cashKey(orgId)); } catch { /* تجاهل */ } };

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
  const [q, setQ] = useState("");
  const [entries, setEntries] = useState<StmtEntry[]>([]);
  const [treasuryIds, setTreasuryIds] = useState<number[]>([]);
  const [manualCash, setManualCash] = useState<number[] | null>(() => loadCash(org.id));
  const [loading, setLoading] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  const [adding, setAdding] = useState<number | null>(null);
  const seq = useRef(0);
  const searchRef = useRef<HTMLInputElement>(null);

  const accById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const nameOf = useCallback((a: GLAccount): string => (lang === "en" && a.name_en ? a.name_en : a.name), [lang]);
  const leafAccounts = useMemo(() => accounts.filter((a) => !a.is_group), [accounts]);
  const branchId = fBranch ? Number(fBranch) : null;
  const tokens = useMemo(() => normalizeText(q).split(/\s+/).filter(Boolean), [q]);

  useEffect(() => { savePrefs({ drafts, compare }); }, [drafts, compare]);
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
  const cur = useMemo(() => sumByAccount(entries, accById, from, to, drafts, branchId), [entries, accById, from, to, drafts, branchId]);
  const prev = useMemo(() => (compare ? sumByAccount(entries, accById, prevP.from, prevP.to, drafts, branchId) : null), [compare, entries, accById, prevP, drafts, branchId]);
  const toDate = useMemo(() => sumByAccount(entries, accById, null, to, drafts, branchId), [entries, accById, to, drafts, branchId]);
  const income = useMemo(() => buildIncome(accounts, cur, prev), [accounts, cur, prev]);
  const balance = useMemo(() => buildBalance(accounts, toDate), [accounts, toDate]);
  const autoCash = useMemo(() => detectCashAccounts(accounts, treasuryIds), [accounts, treasuryIds]);
  const cashIds = manualCash ?? autoCash;
  const flow = useMemo(() => buildCashFlow(entries, accounts, accById, cashIds, from, to, drafts, branchId), [entries, accounts, accById, cashIds, from, to, drafts, branchId]);

  const setCashIds = (ids: number[] | null) => { setManualCash(ids); saveCash(org.id, ids); };
  const orgName = shop?.shop_name || org.name;
  const preset = presetOf(from, to, today);
  const presetLabel: Record<PresetKey, string> = { thisMonth: t("This month", "هذا الشهر"), lastMonth: t("Last month", "الشهر الماضي"), thisQuarter: t("This quarter", "هذا الربع"), thisYear: t("This year", "هذه السنة"), lastYear: t("Last year", "السنة الماضية"), all: t("All time", "كل الفترات") };
  const actLabel: Record<CashActivity, string> = { operating: t("Operating activities", "الأنشطة التشغيلية"), investing: t("Investing activities", "الأنشطة الاستثمارية"), financing: t("Financing activities", "الأنشطة التمويلية") };
  const periodTxt = view === "balance" ? `${t("As of", "كما في")} ${to}` : `${from} → ${to}`;
  const viewTitle = view === "income" ? t("Income statement", "قائمة الدخل") : view === "balance" ? t("Balance sheet", "الميزانية العمومية") : t("Cash flow statement", "قائمة التدفقات النقدية");

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName; const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      if (e.key === "/" && !typing) { e.preventDefault(); searchRef.current?.focus(); searchRef.current?.select(); }
      else if (e.key === "Escape" && e.target === searchRef.current) { e.preventDefault(); setQ(""); searchRef.current?.blur(); }
    };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, []);

  // ── مكوّنات العرض ──
  const Hl = ({ text }: { text: string }) => (<>{splitHighlight(text, tokens).map((p, i) => (p.hit ? <mark key={i} className="bg-amber-400/30 text-inherit rounded px-0.5">{p.s}</mark> : <span key={i}>{p.s}</span>))}</>);
  const showCmp = view === "income" && compare;
  const NumCell = ({ v, tone }: { v: number; tone?: string }) => <td className={`px-3 py-2 text-xs font-mono text-end ${tone || "text-slate-200"}`} dir="ltr">{fmt(v)}</td>;
  const AccRow = ({ a, v, p, rev }: { a: GLAccount; v: number; p?: number | null; rev?: number }) => {
    const ch = p != null ? changePct(v, p) : null;
    return (
      <tr className="border-b border-slate-800/60 hover:bg-white/[0.03]" data-testid="stmt-line" data-code={a.code}>
        <td className="px-3 py-2 text-xs text-slate-300 text-start"><span className="font-mono text-[10px] text-slate-500 me-2" dir="ltr"><Hl text={a.code} /></span><Hl text={nameOf(a)} /></td>
        <NumCell v={v} tone={v < 0 ? "text-red-300" : undefined} />
        {showCmp && <><NumCell v={p ?? 0} tone="text-slate-400" /><td className={`px-3 py-2 text-[11px] font-mono text-end ${ch == null ? "text-slate-600" : ch >= 0 ? "text-emerald-400" : "text-red-400"}`} dir="ltr">{pctTxt(ch)}</td></>}
        {view === "income" && <td className="px-3 py-2 text-[11px] font-mono text-end text-slate-500" dir="ltr">{rev && rev > 0 ? `${((v / rev) * 100).toFixed(1)}%` : "—"}</td>}
      </tr>
    );
  };
  const Total = ({ label, v, p, strong, tone, rev }: { label: string; v: number; p?: number | null; strong?: boolean; tone?: string; rev?: number }) => {
    const ch = p != null ? changePct(v, p) : null;
    return (
      <tr className={`${strong ? "bg-slate-950" : "bg-slate-950/50"} border-b border-slate-700`} data-testid="stmt-total">
        <td className={`px-3 py-2.5 text-xs font-bold text-start ${tone || "text-slate-100"}`}>{label}</td>
        <td className={`px-3 py-2.5 text-xs font-mono font-bold text-end ${tone || "text-emerald-300"}`} dir="ltr">{fmt(v)}</td>
        {showCmp && <><td className="px-3 py-2.5 text-xs font-mono text-end text-slate-400" dir="ltr">{p != null ? fmt(p) : ""}</td><td className={`px-3 py-2.5 text-[11px] font-mono text-end ${ch == null ? "text-slate-600" : ch >= 0 ? "text-emerald-400" : "text-red-400"}`} dir="ltr">{pctTxt(ch)}</td></>}
        {view === "income" && <td className="px-3 py-2.5 text-[11px] font-mono text-end text-slate-500" dir="ltr">{rev && rev > 0 ? `${((v / rev) * 100).toFixed(1)}%` : ""}</td>}
      </tr>
    );
  };
  const Sec = ({ title }: { title: string }) => <tr><td colSpan={5} className="px-3 py-2 bg-blue-500/10 text-blue-300 text-[11px] font-bold border-b border-slate-800 text-start">{title}</td></tr>;
  const Empty = ({ text }: { text: string }) => <tr><td colSpan={5} className="px-3 py-3 text-xs text-slate-500 text-start">{text}</td></tr>;
  const vis = <T extends { account: GLAccount }>(ls: T[]): T[] => ls.filter((l) => rowMatches(l.account, tokens, normalizeText));

  // ── تصدير/طباعة ──
  const sheetRows = (): (string | number)[][] => {
    const R: (string | number)[][] = [];
    const sec = (title: string) => R.push([title, ""]);
    if (view === "income") {
      const c = showCmp; const hdr: (string | number)[] = [t("Account", "الحساب"), t("Amount", "المبلغ")]; if (c) hdr.push(t("Previous", "السابق"), t("Change %", "التغير %")); R.push(hdr);
      const put = (s: typeof income.revenue, label: string) => { sec(label); s.lines.forEach((l) => R.push([`${l.account.code} ${nameOf(l.account)}`, l.value, ...(c ? [l.prev ?? 0, changePct(l.value, l.prev) ?? ""] : [])])); R.push([`${t("Total", "إجمالي")} ${label}`, s.total, ...(c ? [s.prevTotal ?? 0, changePct(s.total, s.prevTotal) ?? ""] : [])]); };
      put(income.revenue, t("Revenue", "الإيرادات")); put(income.cogs, t("Cost of sales", "تكلفة المبيعات"));
      R.push([t("Gross profit", "مجمل الربح"), income.grossProfit, ...(c ? [income.prevGross ?? 0, changePct(income.grossProfit, income.prevGross) ?? ""] : [])]);
      put(income.opex, t("Operating expenses", "المصروفات التشغيلية"));
      R.push([income.net >= 0 ? t("Net profit", "صافي الربح") : t("Net loss", "صافي الخسارة"), income.net, ...(c ? [income.prevNet ?? 0, changePct(income.net, income.prevNet) ?? ""] : [])]);
    } else if (view === "balance") {
      const put = (ls: { account: GLAccount; value: number }[], label: string, tot: number) => { sec(label); ls.forEach((l) => R.push([`${l.account.code} ${nameOf(l.account)}`, l.value])); R.push([`${t("Total", "إجمالي")} ${label}`, tot]); };
      put(balance.currentAssets, t("Current assets", "الأصول المتداولة"), balance.totCurrentAssets); put(balance.fixedAssets, t("Non-current assets", "الأصول غير المتداولة"), balance.totFixedAssets); R.push([t("Total assets", "إجمالي الأصول"), balance.totAssets]);
      put(balance.currentLiab, t("Current liabilities", "الخصوم المتداولة"), balance.totCurrentLiab); put(balance.longLiab, t("Non-current liabilities", "الخصوم غير المتداولة"), balance.totLongLiab);
      put(balance.equity, t("Equity", "حقوق الملكية"), balance.totEquity); R.push([balance.retained >= 0 ? t("Retained earnings (net income)", "الأرباح المحتجزة (صافي الدخل)") : t("Accumulated loss", "الخسائر المتراكمة"), balance.retained]);
      R.push([t("Total liabilities & equity", "إجمالي الخصوم وحقوق الملكية"), balance.right]);
    } else {
      R.push([t("Opening cash", "رصيد النقدية أول الفترة"), flow.opening]);
      (["operating", "investing", "financing"] as CashActivity[]).forEach((k) => { sec(actLabel[k]); flow.sections[k].lines.forEach((l) => R.push([`${l.account.code} ${nameOf(l.account)}`, l.amount])); R.push([`${t("Net", "صافي")} ${actLabel[k]}`, flow.sections[k].total]); });
      R.push([t("Net change in cash", "صافي التغير في النقدية"), flow.net]); R.push([t("Closing cash", "رصيد النقدية آخر الفترة"), flow.closing]);
    }
    return R;
  };
  const exportExcel = () => {
    const ws = XLSX.utils.aoa_to_sheet([[orgName, `${viewTitle} — ${periodTxt}`], [], ...sheetRows()]); ws["!cols"] = [{ wch: 46 }, { wch: 16 }, { wch: 16 }, { wch: 12 }];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, view); XLSX.writeFile(wb, `${view}_${view === "balance" ? to : `${from}_${to}`}.xlsx`);
  };
  const esc = (s: string): string => s.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));
  const printIt = () => {
    const rows = sheetRows(); const hasCols = view === "income" && showCmp;
    const body = rows.map((r, i) => {
      const isHead = i === 0 && view === "income"; if (isHead) return `<tr>${r.map((c) => `<th style="background:#14304d;color:#fff;padding:6px 10px;font-size:11px;text-align:start">${esc(String(c))}</th>`).join("")}</tr>`;
      const sec = r.length >= 2 && r[1] === "" && typeof r[0] === "string"; const strong = typeof r[0] === "string" && /^(Total|إجمالي|Gross|مجمل|Net|صافي|Closing|رصيد النقدية آخر)/.test(r[0]);
      if (sec) return `<tr><td colspan="${hasCols ? 4 : 2}" style="background:#e8eef5;padding:6px 10px;font-weight:800;font-size:12px">${esc(String(r[0]))}</td></tr>`;
      return `<tr>${r.map((c, k) => `<td style="border:1px solid #e5e7eb;padding:5px 10px;${k === 0 ? "" : "text-align:end;direction:ltr;font-variant-numeric:tabular-nums;"}${strong ? "font-weight:800;background:#f8fafc" : ""}">${typeof c === "number" ? fmt(c) : esc(String(c))}</td>`).join("")}</tr>`;
    }).join("");
    const logo = shop?.logo_url ? `<img src="${esc(shop.logo_url)}" style="height:54px;object-fit:contain"/>` : "";
    const html = `<html dir="${dir}"><head><meta charset="UTF-8"><title>${esc(viewTitle)}</title></head><body style="font-family:'Segoe UI',Tahoma,sans-serif;padding:24px;color:#0f172a">
      <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #14304d;padding-bottom:10px;margin-bottom:14px"><div><div style="font-size:19px;font-weight:800">${esc(orgName)}</div>${shop?.tax_number ? `<div>${esc(t("VAT no.", "الرقم الضريبي"))}: ${esc(shop.tax_number)}</div>` : ""}</div>${logo}</div>
      <h2 style="font-size:15px;margin:0 0 4px">${esc(viewTitle)}</h2><div style="font-size:12px;color:#475569;margin-bottom:10px">${esc(periodTxt)}${drafts ? ` — ${esc(t("includes drafts", "تشمل المسودات"))}` : ""}</div>
      <table style="border-collapse:collapse;width:100%;font-size:12px">${body}</table></body></html>`;
    const w = window.open("", "_blank"); if (!w) { alert(t("Allow pop-ups to print.", "فعّل النوافذ المنبثقة للطباعة.")); return; }
    w.document.write(html); w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
  };

  const Kpi = ({ label, value, tone, sub, id }: { label: string; value: string; tone: string; sub?: string; id: string }) => (
    <div className={`${CARD} p-3`}><div className="text-[11px] font-bold text-slate-500">{label}</div><div className={`text-lg font-black mt-1 font-mono ${tone}`} dir="ltr" data-testid={id}>{value}</div>{sub && <div className="text-[10px] text-slate-500 mt-0.5" dir="ltr">{sub}</div>}</div>
  );
  const dChange = (c: number, p: number | null): string | undefined => (compare && p != null ? `${pctTxt(changePct(c, p))} ${t("vs previous", "عن السابق")}` : undefined);
  const hasAny = entries.length > 0;
  const tabBtn = (k: View, icon: React.ReactNode, label: string) => (
    <button key={k} type="button" role="tab" aria-selected={view === k} data-testid={`view-${k}`} onClick={() => setView(k)} className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors inline-flex items-center gap-1.5 ${view === k ? "bg-blue-600 text-[#fff]" : "text-slate-400 hover:text-slate-200"}`}>{icon}{label}</button>
  );

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
            {PRESET_KEYS.map((k) => <button key={k} type="button" data-testid={`preset-${k}`} onClick={() => { const p = datePreset(k, today); setFrom(p.from); setTo(p.to); }} className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors ${preset === k ? "bg-blue-600/25 border-blue-500/50 text-blue-200" : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"}`}>{presetLabel[k]}</button>)}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-2.5">
          <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer"><input type="checkbox" checked={drafts} onChange={(e) => setDrafts(e.target.checked)} className="w-4 h-4 accent-blue-500" data-testid="drafts" /> {t("Include draft entries", "تضمين القيود المسودة")}</label>
          {view === "income" && <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer"><input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} className="w-4 h-4 accent-blue-500" data-testid="compare" /> {t("Compare with previous period", "مقارنة بالفترة السابقة")}{compare && valid && <span className="text-slate-500 font-mono text-[10px]" dir="ltr" data-testid="prev-range">({prevP.from} → {prevP.to})</span>}</label>}
          <div className="relative flex-1 min-w-[220px] max-w-md ms-auto">
            <Search size={14} className="absolute top-1/2 -translate-y-1/2 start-3 text-slate-500" />
            <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} data-testid="stmt-search" className={`${INPUT} ps-9 pe-8`} placeholder={t("/ · Filter accounts by code or name…", "/ · صفّ الحسابات بالكود أو الاسم…")} />
            {q && <button type="button" aria-label={t("Clear", "مسح")} onClick={() => setQ("")} className="absolute top-1/2 -translate-y-1/2 end-2 text-slate-500 hover:text-white"><X size={13} /></button>}
          </div>
        </div>
        {showKeys && <div className="mt-2 text-xs text-slate-300 flex flex-wrap gap-x-5 gap-y-1" data-testid="keys-help"><span><span className={KBD}>/</span> {t("filter accounts", "تصفية الحسابات")}</span><span><span className={KBD}>Esc</span> {t("clear filter", "مسح التصفية")}</span></div>}
      </div>

      {!valid && <div className={`${CARD} p-6 text-center text-amber-400 text-sm`} data-testid="range-error">{t("The start date is after the end date.", "تاريخ البداية بعد تاريخ النهاية.")}</div>}

      {valid && (
        <>
          {/* المؤشرات */}
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
              <Kpi id="kpi-a" label={t("Opening cash", "نقدية أول الفترة")} value={fmt(flow.opening)} tone="text-slate-200" />
              <Kpi id="kpi-b" label={t("Cash in", "المقبوضات")} value={fmt(flow.inflows)} tone="text-emerald-300" />
              <Kpi id="kpi-c" label={t("Cash out", "المدفوعات")} value={fmt(flow.outflows)} tone="text-amber-300" />
              <Kpi id="kpi-d" label={t("Closing cash", "نقدية آخر الفترة")} value={fmt(flow.closing)} tone="text-sky-300" sub={flow.reconciled ? t("Reconciled ✓", "مطابقة ✓") : t("Not reconciled", "غير مطابقة")} />
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
                <tbody>
                  {view === "income" && (<>
                    <Sec title={t("Revenue", "الإيرادات")} />
                    {vis(income.revenue.lines).map((l) => <AccRow key={l.account.id} a={l.account} v={l.value} p={l.prev} rev={income.revenue.total} />)}
                    {income.revenue.lines.length === 0 && <Empty text={t("No revenue in this period", "لا إيرادات في الفترة")} />}
                    <Total label={t("Total revenue", "إجمالي الإيرادات")} v={income.revenue.total} p={income.revenue.prevTotal} rev={income.revenue.total} />
                    <Sec title={t("Cost of sales", "تكلفة المبيعات")} />
                    {vis(income.cogs.lines).map((l) => <AccRow key={l.account.id} a={l.account} v={l.value} p={l.prev} rev={income.revenue.total} />)}
                    {income.cogs.lines.length === 0 && <Empty text={t("No cost of sales in this period", "لا تكلفة مبيعات في الفترة")} />}
                    <Total label={t("Total cost of sales", "إجمالي تكلفة المبيعات")} v={income.cogs.total} p={income.cogs.prevTotal} rev={income.revenue.total} />
                    <Total strong label={t("Gross profit", "مجمل الربح")} v={income.grossProfit} p={income.prevGross} rev={income.revenue.total} tone={income.grossProfit >= 0 ? "text-sky-300" : "text-red-300"} />
                    <Sec title={t("Operating expenses", "المصروفات التشغيلية")} />
                    {vis(income.opex.lines).map((l) => <AccRow key={l.account.id} a={l.account} v={l.value} p={l.prev} rev={income.revenue.total} />)}
                    {income.opex.lines.length === 0 && <Empty text={t("No expenses in this period", "لا مصروفات في الفترة")} />}
                    <Total label={t("Total operating expenses", "إجمالي المصروفات التشغيلية")} v={income.opex.total} p={income.opex.prevTotal} rev={income.revenue.total} />
                    <Total strong label={income.net >= 0 ? t("Net profit", "صافي الربح") : t("Net loss", "صافي الخسارة")} v={income.net} p={income.prevNet} rev={income.revenue.total} tone={income.net >= 0 ? "text-emerald-300" : "text-red-300"} />
                  </>)}
                  {view === "balance" && (<>
                    <Sec title={t("Current assets", "الأصول المتداولة")} />{vis(balance.currentAssets.map((l) => ({ ...l }))).map((l) => <AccRow key={l.account.id} a={l.account} v={l.value} />)}<Total label={t("Total current assets", "إجمالي الأصول المتداولة")} v={balance.totCurrentAssets} />
                    <Sec title={t("Non-current assets", "الأصول غير المتداولة")} />{vis(balance.fixedAssets).map((l) => <AccRow key={l.account.id} a={l.account} v={l.value} />)}<Total label={t("Total non-current assets", "إجمالي الأصول غير المتداولة")} v={balance.totFixedAssets} />
                    <Total strong label={t("Total assets", "إجمالي الأصول")} v={balance.totAssets} tone="text-sky-300" />
                    <Sec title={t("Current liabilities", "الخصوم المتداولة")} />{vis(balance.currentLiab).map((l) => <AccRow key={l.account.id} a={l.account} v={l.value} />)}<Total label={t("Total current liabilities", "إجمالي الخصوم المتداولة")} v={balance.totCurrentLiab} />
                    <Sec title={t("Non-current liabilities", "الخصوم غير المتداولة")} />{vis(balance.longLiab).map((l) => <AccRow key={l.account.id} a={l.account} v={l.value} />)}<Total label={t("Total non-current liabilities", "إجمالي الخصوم غير المتداولة")} v={balance.totLongLiab} />
                    <Sec title={t("Equity", "حقوق الملكية")} />{vis(balance.equity).map((l) => <AccRow key={l.account.id} a={l.account} v={l.value} />)}
                    <tr className="border-b border-slate-800/60"><td className="px-3 py-2 text-xs text-slate-300 text-start">{balance.retained >= 0 ? t("Retained earnings (net income)", "الأرباح المحتجزة (صافي الدخل)") : t("Accumulated loss", "الخسائر المتراكمة")}</td><NumCell v={balance.retained} tone={balance.retained < 0 ? "text-red-300" : undefined} /></tr>
                    <Total label={t("Total equity", "إجمالي حقوق الملكية")} v={balance.totEquityWithRetained} />
                    <Total strong label={t("Total liabilities & equity", "إجمالي الخصوم وحقوق الملكية")} v={balance.right} tone={balance.balanced ? "text-emerald-300" : "text-amber-300"} />
                    {!balance.balanced && <tr><td colSpan={5} className="px-3 py-2 text-[11px] text-amber-400 bg-amber-500/5" data-testid="unbalanced">{t(`⚠ Out of balance by ${fmt(balance.diff)} — check opening balances and one-sided entries.`, `⚠ الميزانية غير متوازنة بفارق ${fmt(balance.diff)} — راجع الأرصدة الافتتاحية والقيود غير المتوازنة.`)}</td></tr>}
                  </>)}
                  {view === "cash" && (<>
                    <Total label={t("Opening cash", "رصيد النقدية أول الفترة")} v={flow.opening} tone="text-slate-100" />
                    {(["operating", "investing", "financing"] as CashActivity[]).map((k) => (
                      <FlowSection key={k} title={actLabel[k]} lines={vis(flow.sections[k].lines)} all={flow.sections[k].lines.length} total={flow.sections[k].total} netLabel={`${t("Net cash from", "صافي النقدية من")} ${actLabel[k]}`} AccRow={AccRow} Sec={Sec} Total={Total} Empty={Empty} emptyText={t("No cash movements", "لا حركات نقدية")} />
                    ))}
                    <Total strong label={t("Net change in cash", "صافي التغير في النقدية")} v={flow.net} tone={flow.net >= 0 ? "text-emerald-300" : "text-red-300"} />
                    <Total strong label={t("Closing cash", "رصيد النقدية آخر الفترة")} v={flow.closing} tone="text-sky-300" />
                    {!flow.reconciled && <tr><td colSpan={5} className="px-3 py-2 text-[11px] text-amber-400 bg-amber-500/5" data-testid="unreconciled">{t("⚠ The statement does not reconcile with cash balances.", "⚠ القائمة لا تطابق أرصدة النقدية.")}</td></tr>}
                  </>)}
                </tbody>
              </table>
            </div>
          </div>
          {view === "cash" && <div className="mt-2 text-[11px] text-slate-500" data-testid="cash-note">{t("Direct method: each line is the cash effect of entries touching the cash accounts above, grouped by the counter account. Transfers between cash accounts cancel out.", "الطريقة المباشرة: كل سطر هو الأثر النقدي للقيود التي تمس الحسابات النقدية أعلاه مجمّعًا حسب الحساب المقابل، والتحويل بين الحسابات النقدية يلغي نفسه.")}</div>}
        </>
      )}
    </div>
  );
}

type FlowProps = {
  title: string; lines: { account: GLAccount; amount: number }[]; all: number; total: number; netLabel: string; emptyText: string;
  AccRow: (p: { a: GLAccount; v: number }) => JSX.Element; Sec: (p: { title: string }) => JSX.Element;
  Total: (p: { label: string; v: number }) => JSX.Element; Empty: (p: { text: string }) => JSX.Element;
};
function FlowSection({ title, lines, all, total, netLabel, emptyText, AccRow, Sec, Total, Empty }: FlowProps) {
  return (<>
    <Sec title={title} />
    {lines.map((l) => <AccRow key={l.account.id} a={l.account} v={l.amount} />)}
    {all === 0 && <Empty text={emptyText} />}
    <Total label={netLabel} v={total} />
  </>);
}
