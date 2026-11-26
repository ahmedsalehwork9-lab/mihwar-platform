// =============================================================
// src/pages/accounting/ledger/LedgerTab.tsx
// كشف الحساب — مؤشرات (افتتاحي/مدين/دائن/ختامي)، اختيار حساب بحث متقدم، فترات سريعة،
// بحث وتصفية داخل الحركات، رقم القيد JV ونوعه، رصيد جارٍ بمدين/دائن، تصدير Excel وطباعة.
// ثنائي اللغة (RTL/LTR) وتنقّل بلوحة المفاتيح. يقرأ فقط ولا يكتب في قاعدة البيانات.
// =============================================================
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { ArrowDownUp, Download, FileText, Keyboard, Printer, RotateCcw, Search, X } from "lucide-react";
import * as DB from "../../lib/accountingDb";
import type { GLAccount, GLParty } from "../../lib/accountingDb";
import { useLang } from "../../../context/LanguageContext";
import { splitHighlight, normalizeText } from "../chart/chartLogic";
import AccountCombo from "./AccountCombo";
import {
  DEFAULT_MOVE_FILTER, ENTRY_TYPE_EN, PRESET_KEYS, balanceLabel, buildStatement, datePreset, dayBefore, filterRows, isMoveFiltering, jvLabel, presetOf, sumRows,
  type MoveFilter, type PresetKey, type SortDir, type Statement, type StmtRow,
} from "./ledgerLogic";

const CARD = "bg-slate-900 border border-slate-800 rounded-2xl";
const INPUT = "w-full bg-slate-950 border border-slate-700 rounded-xl text-white px-3 py-2 text-sm outline-none focus:border-blue-500 transition-colors";
const DATE = INPUT + " [color-scheme:dark]";
const LABEL = "text-[10px] text-slate-500 font-bold mb-1 block";
const BTN_SOFT = "inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 hover:text-white font-bold text-xs transition-colors disabled:opacity-50";
const BTN_PRIMARY = "inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-[#fff] font-bold text-xs transition-colors disabled:opacity-50";
const KBD = "px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] font-mono text-slate-300";
const PAGE = 100;

const todayStr = (): string => new Date().toISOString().slice(0, 10);
const fmt = (n: number): string => (Math.round(n * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type PrintRow = { date: string; no: string; acc?: string; desc: string; debit: number; credit: number; running: number };
export type PrintStatementFn = (shop: unknown, o: {
  heading: string; account: string; from?: string; to?: string; showAccountCol?: boolean; opening?: number | null;
  rows: PrintRow[]; totalDebit: number; totalCredit: number; finalBalance: number;
}) => void;

type Branch = { id: number; name: string };
type Props = {
  org: { id: number; name: string }; accounts: GLAccount[]; branches: Branch[] | undefined; shop: unknown;
  parties: GLParty[]; printStatement: PrintStatementFn;
};
type Result = { acc: GLAccount; stmt: Statement; from: string; to: string; includeDrafts: boolean; ranAt: number };

const PREF_KEY = "mihwar.ledger.prefs.v1";
const loadDrafts = (): boolean => { try { return JSON.parse(localStorage.getItem(PREF_KEY) || "{}").drafts === true; } catch { return false; } };
const saveDrafts = (v: boolean): void => { try { localStorage.setItem(PREF_KEY, JSON.stringify({ drafts: v })); } catch { /* تجاهل */ } };

export default function LedgerTab({ org, accounts, branches, shop, parties, printStatement }: Props) {
  const { t, lang, isRTL } = useLang();
  const dir = isRTL ? "rtl" : "ltr";
  const multiBranch = !!branches && branches.length > 1;
  const today = todayStr();

  const [accId, setAccId] = useState<number | null>(null);
  const [from, setFrom] = useState(() => datePreset("thisMonth", todayStr()).from);
  const [to, setTo] = useState(todayStr);
  const [fBranch, setFBranch] = useState("");
  const [includeDrafts, setIncludeDrafts] = useState(loadDrafts);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [res, setRes] = useState<Result | null>(null);
  const [mf, setMf] = useState<MoveFilter>(DEFAULT_MOVE_FILTER);
  const [sort, setSort] = useState<SortDir>("asc");
  const [limit, setLimit] = useState(PAGE);
  const [sel, setSel] = useState<number | null>(null);
  const [showKeys, setShowKeys] = useState(false);
  const seqRef = useRef(0);
  const acctRef = useRef<HTMLInputElement>(null);
  const moveRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const byId = useMemo(() => new Map(accounts.map((a) => [a.id, a] as const)), [accounts]);
  const partyById = useMemo(() => new Map(parties.map((p) => [p.id, p] as const)), [parties]);
  const nameOf = useCallback((a: GLAccount | undefined): string => (!a ? "" : lang === "en" && a.name_en ? a.name_en : a.name), [lang]);
  const typeLabel = useCallback((k: string | null | undefined): string => { const key = k || "general"; return lang === "ar" ? DB.ENTRY_TYPE_LABEL[key] || key : ENTRY_TYPE_EN[key] || key; }, [lang]);
  const accText = useCallback((id: number): string => { const a = byId.get(id); return a ? `${a.code} ${a.name} ${a.name_en ?? ""}` : ""; }, [byId]);
  const partyName = useCallback((id: number | null): string => (id == null ? "" : partyById.get(id)?.name || ""), [partyById]);

  const run = useCallback(async () => {
    if (accId == null) return;
    const acc = byId.get(accId);
    if (!acc) return;
    if (from > to) { setErr(t("The start date is after the end date", "تاريخ البداية بعد تاريخ النهاية")); return; }
    const ids = acc.is_group ? DB.descendantPostableIds(accounts, accId) : [accId];
    if (!ids.length) { setErr(t("No postable accounts under this account", "لا توجد حسابات قابلة للترحيل تحت هذا الحساب")); return; }
    const seq = ++seqRef.current;
    setErr(null); setLoading(true);
    try {
      const br = fBranch ? Number(fBranch) : null;
      const [before, period] = await Promise.all([
        DB.fetchLedgerMulti(org.id, ids, "2000-01-01", dayBefore(from), br),
        DB.fetchLedgerMulti(org.id, ids, from, to, br),
      ]);
      if (seq !== seqRef.current) return; // طلب أحدث قائم
      setRes({ acc, stmt: buildStatement(before, period, includeDrafts), from, to, includeDrafts, ranAt: Date.now() });
      setLimit(PAGE); setSel(null);
    } catch (e) {
      if (seq === seqRef.current) setErr(t("Could not load the statement: ", "تعذّر تحميل الكشف: ") + (e instanceof Error ? e.message : ""));
    } finally { if (seq === seqRef.current) setLoading(false); }
  }, [accId, byId, accounts, from, to, fBranch, includeDrafts, org.id, t]);

  // يُعاد التحميل تلقائيًا عند تغيّر الحساب/الفترة/الفرع/المسودات
  useEffect(() => { if (accId != null) void run(); else { setRes(null); setErr(null); } }, [accId, from, to, fBranch, includeDrafts]); // eslint-disable-line react-hooks/exhaustive-deps

  const stmt = res?.stmt ?? null;
  const isGroup = !!res?.acc.is_group;
  const hasParty = useMemo(() => !!stmt && stmt.rows.some((r) => r.party_id != null), [stmt]);
  const types = useMemo(() => Array.from(new Set((stmt?.rows ?? []).map((r) => r.entry_type || "general"))).sort(), [stmt]);
  const filtering = isMoveFiltering(mf);
  const filtered: StmtRow[] = useMemo(() => (stmt ? filterRows(stmt.rows, mf, { accountText: accText, partyName }) : []), [stmt, mf, accText, partyName]);
  const shown: StmtRow[] = useMemo(() => (sort === "asc" ? filtered : [...filtered].reverse()), [filtered, sort]);
  const page = shown.slice(0, limit);
  const sub = useMemo(() => sumRows(filtered), [filtered]);
  const tokens = useMemo(() => normalizeText(mf.q).split(/\s+/).filter(Boolean), [mf.q]);
  const Hl = ({ text }: { text: string }) => (<>{splitHighlight(text, tokens).map((p, i) => (p.hit ? <mark key={i} className="bg-amber-400/30 text-inherit rounded px-0.5">{p.s}</mark> : <span key={i}>{p.s}</span>))}</>);
  const activePreset = presetOf(from, to, today);

  const Bal = ({ n, strong = false }: { n: number; strong?: boolean }) => {
    const b = balanceLabel(n);
    const tone = b.side === "dr" ? "text-emerald-300" : b.side === "cr" ? "text-amber-300" : "text-slate-400";
    const tag = b.side === "dr" ? t("Dr", "مدين") : b.side === "cr" ? t("Cr", "دائن") : "";
    return <span className={`font-mono ${strong ? "font-bold" : ""} ${tone}`} dir="ltr">{fmt(b.abs)}{tag && <span className="ms-1 text-[10px] font-sans opacity-80">{tag}</span>}</span>;
  };

  // ── تصدير/طباعة ──
  const rowsForOutput = filtered; // الرصيد الجاري يبقى حسب الكشف الكامل
  const doExcel = () => {
    if (!res || !stmt) return;
    const head: (string | number)[][] = [
      [t("Account statement", "كشف حساب"), `${res.acc.code} — ${nameOf(res.acc)}${isGroup ? t(" (aggregated)", " (مُجمّع)") : ""}`],
      [t("Period", "الفترة"), `${res.from} → ${res.to}`],
      [t("Opening balance", "الرصيد الافتتاحي"), stmt.opening], [],
    ];
    const cols = [t("Date", "التاريخ"), t("Entry", "القيد"), t("Type", "النوع"), ...(isGroup ? [t("Account", "الحساب")] : []), t("Description", "البيان"), ...(hasParty ? [t("Party", "الطرف")] : []), t("Debit", "مدين"), t("Credit", "دائن"), t("Balance (Dr+/Cr−)", "الرصيد (مدين+/دائن−)")];
    const body = rowsForOutput.map((r) => [r.date, jvLabel(r.entry_year, r.entry_no), typeLabel(r.entry_type),
      ...(isGroup ? [`${byId.get(r.account_id)?.code ?? ""} ${nameOf(byId.get(r.account_id))}`] : []),
      `${r.description || ""}${r.note ? ` · ${r.note}` : ""}`, ...(hasParty ? [partyName(r.party_id)] : []), r.debit || "", r.credit || "", r.running]);
    const tot = sumRows(rowsForOutput);
    const foot: (string | number)[][] = [[], [t("Totals", "الإجماليات"), "", "", ...(isGroup ? [""] : []), "", ...(hasParty ? [""] : []), tot.debit, tot.credit, stmt.closing]];
    const ws = XLSX.utils.aoa_to_sheet([...head, cols, ...body, ...foot]);
    ws["!cols"] = cols.map((_, i) => ({ wch: i === 3 || i === 4 ? 36 : 14 }));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, t("Statement", "كشف الحساب").slice(0, 28));
    XLSX.writeFile(wb, `account_statement_${res.acc.code}_${res.from}_${res.to}.xlsx`);
  };
  const doPrint = () => {
    if (!res || !stmt) return;
    const prows: PrintRow[] = rowsForOutput.map((r) => {
      const a = byId.get(r.account_id);
      return { date: r.date, no: jvLabel(r.entry_year, r.entry_no), acc: isGroup ? `${a?.code || ""} ${a?.name || ""}` : undefined, desc: (r.description || "") + (r.note ? ` · ${r.note}` : ""), debit: r.debit, credit: r.credit, running: r.running };
    });
    const tot = sumRows(rowsForOutput);
    printStatement(shop, { heading: "كشف حساب", account: `${res.acc.code} ${res.acc.name}${isGroup ? " (مُجمّع)" : ""}`, from: res.from, to: res.to, showAccountCol: isGroup, opening: stmt.opening, rows: prows, totalDebit: tot.debit, totalCredit: tot.credit, finalBalance: stmt.closing });
  };

  // ── لوحة المفاتيح ──
  const move = useCallback((delta: number) => {
    if (!page.length) return;
    const i = page.findIndex((r) => r.seq === sel);
    const n = Math.min(Math.max((i < 0 ? (delta > 0 ? -1 : page.length) : i) + delta, 0), page.length - 1);
    setSel(page[n].seq);
  }, [page, sel]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); void run(); return; }
      if (e.key === "/" && !typing) { e.preventDefault(); moveRef.current?.focus(); moveRef.current?.select(); return; }
      if (e.key === "Escape" && e.target === moveRef.current) { e.preventDefault(); setMf((c) => ({ ...c, q: "" })); moveRef.current?.blur(); return; }
      if (typing && e.target !== moveRef.current) return;
      if (e.key === "ArrowDown") { e.preventDefault(); move(1); } else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
    };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [run, move]);
  useEffect(() => { bodyRef.current?.querySelector<HTMLElement>('[data-sel="1"]')?.scrollIntoView({ block: "nearest" }); }, [sel]);

  const setPreset = (k: PresetKey) => { const p = datePreset(k, today); setFrom(p.from); setTo(p.to); };
  const presetLabel: Record<PresetKey, string> = {
    thisMonth: t("This month", "هذا الشهر"), lastMonth: t("Last month", "الشهر الماضي"), thisQuarter: t("This quarter", "هذا الربع"),
    thisYear: t("This year", "هذه السنة"), lastYear: t("Last year", "السنة الماضية"), all: t("All time", "كل الفترات"),
  };
  const colCount = 7 + (isGroup ? 1 : 0) + (hasParty ? 1 : 0);
  const th = "text-[10px] px-3 py-2.5 bg-slate-950 text-slate-400 whitespace-nowrap border-b border-slate-700 text-start font-bold sticky top-0 z-10";
  const td = "px-3 py-2 text-xs border-b border-slate-800";

  return (
    <div dir={dir} data-testid="ledger-tab">
      {/* المرشحات */}
      <div className={`${CARD} p-3 mb-3`}>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end">
          <div className="lg:col-span-5"><label className={LABEL}>{t("Account (a group account aggregates its children)", "الحساب (الحساب الرئيسي يجمع فروعه)")}</label>
            <AccountCombo accounts={accounts} value={accId} onChange={setAccId} storageKey={`mihwar.ledger.recent.${org.id}`} testId="acct" inputRef={acctRef} /></div>
          <div className="lg:col-span-2"><label className={LABEL}>{t("From", "من")}</label><input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} className={DATE} data-testid="date-from" /></div>
          <div className="lg:col-span-2"><label className={LABEL}>{t("To", "إلى")}</label><input type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} className={DATE} data-testid="date-to" /></div>
          {multiBranch && <div className="lg:col-span-2"><label className={LABEL}>{t("Branch", "الفرع")}</label>
            <select value={fBranch} onChange={(e) => setFBranch(e.target.value)} className={INPUT} data-testid="branch"><option value="">{t("All branches", "كل الفروع")}</option>{branches!.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>}
          <div className="lg:col-span-1"><button type="button" onClick={() => void run()} disabled={loading || accId == null} className={`${BTN_PRIMARY} w-full`} data-testid="run"><FileText size={14} /> {loading ? "…" : t("Show", "عرض")}</button></div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 mt-3">
          {PRESET_KEYS.map((k) => (
            <button key={k} type="button" onClick={() => setPreset(k)} aria-pressed={activePreset === k} data-testid={`preset-${k}`}
              className={`px-3 py-1 rounded-full text-[11px] font-bold border transition-colors ${activePreset === k ? "bg-blue-600 border-blue-500 text-[#fff]" : "bg-slate-800 border-slate-700 text-slate-300 hover:text-white"}`}>{presetLabel[k]}</button>
          ))}
          <label className="ms-auto flex items-center gap-2 text-xs text-slate-300 cursor-pointer" title={t("Draft entries are not posted to the books", "القيود المسودة غير مرحّلة للدفاتر")}>
            <input type="checkbox" className="w-4 h-4 accent-blue-500" checked={includeDrafts} data-testid="include-drafts" onChange={(e) => { setIncludeDrafts(e.target.checked); saveDrafts(e.target.checked); }} />
            {t("Include draft entries", "تضمين القيود المسودة")}
          </label>
          <button type="button" onClick={() => setShowKeys((v) => !v)} className={BTN_SOFT} data-testid="ledger-keys-toggle"><Keyboard size={14} /> {t("Shortcuts", "الاختصارات")}</button>
        </div>
        {showKeys && (
          <div className="mt-2 text-xs text-slate-300 flex flex-wrap gap-x-5 gap-y-1" data-testid="ledger-keys-help">
            <span><span className={KBD}>/</span> {t("search movements", "بحث في الحركات")}</span><span><span className={KBD}>↑ ↓</span> {t("move", "تنقل")}</span>
            <span><span className={KBD}>Ctrl</span>+<span className={KBD}>Enter</span> {t("refresh", "تحديث")}</span><span><span className={KBD}>Esc</span> {t("clear search", "مسح البحث")}</span>
          </div>
        )}
      </div>

      {err && <div className="mb-3 px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs font-bold" data-testid="ledger-error">{err}</div>}

      {/* المؤشرات */}
      {stmt && res && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5 mb-3" data-testid="ledger-kpis">
          <div className={`${CARD} p-3`}><div className="text-[11px] font-bold text-slate-500">{t("Opening balance", "الرصيد الافتتاحي")}</div><div className="text-lg mt-1" data-testid="kpi-opening"><Bal n={stmt.opening} strong /></div></div>
          <div className={`${CARD} p-3`}><div className="text-[11px] font-bold text-slate-500">{t("Total debit", "إجمالي المدين")}</div><div className="text-lg mt-1 font-mono font-bold text-emerald-300" dir="ltr" data-testid="kpi-debit">{fmt(stmt.totalDebit)}</div></div>
          <div className={`${CARD} p-3`}><div className="text-[11px] font-bold text-slate-500">{t("Total credit", "إجمالي الدائن")}</div><div className="text-lg mt-1 font-mono font-bold text-amber-300" dir="ltr" data-testid="kpi-credit">{fmt(stmt.totalCredit)}</div></div>
          <div className={`${CARD} p-3 border-blue-500/30`}><div className="text-[11px] font-bold text-slate-500">{t("Closing balance", "الرصيد الختامي")}</div><div className="text-lg mt-1" data-testid="kpi-closing"><Bal n={stmt.closing} strong /></div></div>
          <div className={`${CARD} p-3`}><div className="text-[11px] font-bold text-slate-500">{t("Movements", "عدد الحركات")}</div><div className="text-lg mt-1 font-black text-blue-300" data-testid="kpi-count">{stmt.rows.length}</div></div>
        </div>
      )}

      {/* الحركات */}
      <div className={`${CARD} overflow-hidden`}>
        <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 border-b border-slate-800">
          <div className="font-bold text-sm text-white flex-1 min-w-[200px]" data-testid="ledger-title">
            {res ? `${res.acc.code} — ${nameOf(res.acc)}` : t("Account statement", "كشف حساب")}
            {isGroup && <span className="ms-2 text-[10px] px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-300 font-normal">{t("Aggregated", "مُجمّع للفروع")}</span>}
            {res && res.includeDrafts && <span className="ms-2 text-[10px] px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-300 font-normal">{t("Includes drafts", "يشمل المسودات")}</span>}
          </div>
          <button type="button" onClick={() => setSort((s) => (s === "asc" ? "desc" : "asc"))} className={BTN_SOFT} data-testid="sort-toggle" disabled={!stmt}><ArrowDownUp size={14} /> {sort === "asc" ? t("Oldest first", "الأقدم أولًا") : t("Newest first", "الأحدث أولًا")}</button>
          <button type="button" onClick={doExcel} className={BTN_SOFT} disabled={!stmt || !filtered.length} data-testid="export-xlsx"><Download size={14} /> Excel</button>
          <button type="button" onClick={doPrint} className={BTN_SOFT} disabled={!stmt || !filtered.length} data-testid="print"><Printer size={14} /> {t("Print", "طباعة")}</button>
        </div>

        {stmt && (
          <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 border-b border-slate-800 bg-slate-950/40" data-testid="move-filters">
            <div className="relative flex-1 min-w-[220px]">
              <Search size={14} className="absolute top-1/2 -translate-y-1/2 start-3 text-slate-500" />
              <input ref={moveRef} value={mf.q} onChange={(e) => { setMf({ ...mf, q: e.target.value }); setLimit(PAGE); }} data-testid="move-search" className={`${INPUT} ps-8 pe-8 !py-1.5 text-xs`}
                placeholder={t("/ · Search entry no., JV, description, account, party or amount…", "/ · ابحث برقم القيد أو JV أو البيان أو الحساب أو الطرف أو المبلغ…")} />
              {mf.q && <button type="button" aria-label={t("Clear", "مسح")} onClick={() => setMf({ ...mf, q: "" })} className="absolute top-1/2 -translate-y-1/2 end-2 text-slate-500 hover:text-white"><X size={13} /></button>}
            </div>
            <select value={mf.side} onChange={(e) => { setMf({ ...mf, side: e.target.value as MoveFilter["side"] }); setLimit(PAGE); }} className={`${INPUT} !w-auto !py-1.5 text-xs`} data-testid="side-filter">
              <option value="all">{t("Debit & credit", "مدين ودائن")}</option><option value="debit">{t("Debit only", "مدين فقط")}</option><option value="credit">{t("Credit only", "دائن فقط")}</option>
            </select>
            <select value={mf.type} onChange={(e) => { setMf({ ...mf, type: e.target.value }); setLimit(PAGE); }} className={`${INPUT} !w-auto !py-1.5 text-xs`} data-testid="type-filter">
              <option value="all">{t("All entry types", "كل أنواع القيود")}</option>{types.map((k) => <option key={k} value={k}>{typeLabel(k)}</option>)}
            </select>
            <button type="button" onClick={() => setMf(DEFAULT_MOVE_FILTER)} disabled={!filtering} className={BTN_SOFT} data-testid="move-reset"><RotateCcw size={13} /> {t("Reset", "إعادة ضبط")}</button>
            <span className="text-[11px] text-slate-500" data-testid="move-count">{filtering ? t(`${filtered.length} of ${stmt.rows.length}`, `${filtered.length} من ${stmt.rows.length}`) : t(`${stmt.rows.length} movements`, `${stmt.rows.length} حركة`)}</span>
          </div>
        )}

        <div ref={bodyRef} className="overflow-auto max-h-[62vh]">
          <table className="w-full border-collapse" style={{ minWidth: 760 }} data-testid="ledger-table">
            <thead><tr>
              <th className={th}>{t("Date", "التاريخ")}</th><th className={th}>{t("Entry", "القيد")}</th><th className={th}>{t("Type", "النوع")}</th>
              {isGroup && <th className={th}>{t("Account", "الحساب")}</th>}<th className={th}>{t("Description", "البيان")}</th>{hasParty && <th className={th}>{t("Party", "الطرف")}</th>}
              <th className={`${th} text-end`}>{t("Debit", "مدين")}</th><th className={`${th} text-end`}>{t("Credit", "دائن")}</th><th className={`${th} text-end`}>{t("Balance", "الرصيد")}</th>
            </tr></thead>
            <tbody>
              {stmt && sort === "asc" && (
                <tr className="bg-slate-950/50" data-testid="row-opening"><td colSpan={colCount - 1} className={`${td} text-slate-400 font-bold`}>{t("Opening balance", "رصيد افتتاحي")} <span className="text-slate-600 font-normal" dir="ltr">· {res!.from}</span></td><td className={`${td} text-end`}><Bal n={stmt.opening} strong /></td></tr>
              )}
              {page.map((r) => {
                const a = byId.get(r.account_id); const isSel = sel === r.seq; const draft = !isPostedRow(r);
                return (
                  <tr key={r.seq} data-testid="move-row" data-sel={isSel ? "1" : undefined} aria-selected={isSel} onClick={() => setSel(r.seq)}
                    className={`cursor-default ${isSel ? "bg-blue-600/15" : "hover:bg-white/[0.03]"} ${draft ? "opacity-70" : ""}`}>
                    <td className={`${td} font-mono text-slate-400`} dir="ltr"><span className="block text-start">{r.date}</span></td>
                    <td className={`${td} font-mono text-blue-300`} dir="ltr"><span className="block text-start" data-testid="jv"><Hl text={jvLabel(r.entry_year, r.entry_no)} /></span></td>
                    <td className={td}><span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-700/40 text-slate-300 whitespace-nowrap">{typeLabel(r.entry_type)}</span>{draft && <span className="ms-1 text-[9px] px-1.5 py-0.5 rounded-full bg-orange-500/15 text-orange-300">{t("Draft", "مسودة")}</span>}</td>
                    {isGroup && <td className={`${td} text-slate-400`}><span className="font-mono" dir="ltr">{a?.code}</span> <Hl text={nameOf(a)} /></td>}
                    <td className={`${td} text-slate-200`}><Hl text={r.description || "—"} />{r.note && <span className="text-slate-500"> · <Hl text={r.note} /></span>}</td>
                    {hasParty && <td className={`${td} text-slate-400`}><Hl text={partyName(r.party_id) || "—"} /></td>}
                    <td className={`${td} text-end font-mono text-emerald-400`} dir="ltr">{r.debit ? fmt(r.debit) : ""}</td>
                    <td className={`${td} text-end font-mono text-amber-400`} dir="ltr">{r.credit ? fmt(r.credit) : ""}</td>
                    <td className={`${td} text-end`} data-testid="running"><Bal n={r.running} /></td>
                  </tr>
                );
              })}
              {stmt && sort === "desc" && (
                <tr className="bg-slate-950/50" data-testid="row-opening"><td colSpan={colCount - 1} className={`${td} text-slate-400 font-bold`}>{t("Opening balance", "رصيد افتتاحي")} <span className="text-slate-600 font-normal" dir="ltr">· {res!.from}</span></td><td className={`${td} text-end`}><Bal n={stmt.opening} strong /></td></tr>
              )}
              {stmt && filtered.length > 0 && (
                <tr className="bg-slate-800/60 font-bold" data-testid="row-total">
                  <td colSpan={colCount - 3} className={`${td} text-slate-300`}>{filtering ? t("Totals of filtered movements", "إجمالي الحركات المصفّاة") : t("Period totals", "إجماليات الفترة")}</td>
                  <td className={`${td} text-end font-mono text-emerald-300`} dir="ltr" data-testid="tot-debit">{fmt(sub.debit)}</td>
                  <td className={`${td} text-end font-mono text-amber-300`} dir="ltr" data-testid="tot-credit">{fmt(sub.credit)}</td>
                  <td className={`${td} text-end`}><Bal n={stmt.closing} strong /></td>
                </tr>
              )}
              {!stmt && !loading && <tr><td colSpan={colCount} className="p-10 text-center text-slate-500 text-sm" data-testid="ledger-empty">{t("Choose an account to show its statement.", "اختر حسابًا لعرض كشفه.")}</td></tr>}
              {loading && <tr><td colSpan={colCount} className="p-10 text-center text-slate-500 text-sm" data-testid="ledger-loading">{t("Loading…", "جارٍ التحميل…")}</td></tr>}
              {stmt && !loading && filtered.length === 0 && <tr><td colSpan={colCount} className="p-8 text-center text-slate-500 text-sm" data-testid="ledger-norows">{filtering ? t("No movements match the search or filters", "لا توجد حركات مطابقة للبحث أو المرشحات") : t("No movements in this period", "لا توجد حركات في هذه الفترة")}</td></tr>}
            </tbody>
          </table>
          {shown.length > page.length && (
            <div className="p-3 text-center border-t border-slate-800">
              <button type="button" onClick={() => setLimit((l) => l + PAGE)} className={BTN_SOFT} data-testid="load-more">{t(`Show more (${shown.length - page.length} remaining)`, `عرض المزيد (${shown.length - page.length} متبقية)`)}</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function isPostedRow(r: { status?: string | null }): boolean { return (r.status ?? "posted") === "posted"; }
