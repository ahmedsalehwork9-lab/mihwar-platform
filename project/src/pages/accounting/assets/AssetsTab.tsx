// =============================================================
// src/pages/accounting/assets/AssetsTab.tsx
// الأصول الثابتة والإهلاك: ثنائي اللغة + بحث متقدم + مؤشرات + رسوم + جدول إهلاك سنوي +
// ترحيل قيد الإهلاك + مطابقة السجل مع دفتر الأستاذ + تصدير Excel وطباعة.
// =============================================================
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { ArrowDownUp, Check, Download, Keyboard, ListOrdered, Pencil, Plus, Printer, RotateCcw, Save, Scale, Search, Trash2, TrendingDown, X } from "lucide-react";
import * as DB from "../../lib/accountingDb";
import type { GLAccount, GLAsset } from "../../lib/accountingDb";
import { useLang } from "../../../context/LanguageContext";
import { splitHighlight, queryTokens } from "../chart/chartLogic";
import AccountCombo from "../ledger/AccountCombo";
import StatementCharts, { type ChartSpec } from "../statements/StatementCharts";
import { topShares } from "../statements/statementsLogic";
import { buildReportHTML, openPrint, type ReportCol } from "../shared/printReport";
import {
  DEFAULT_FILTERS, byCategory, buildRows, categoriesOf, filterRows, glBalances, postRowsFor, r2, reconcile, scheduleFor, sortRows, suggestDeprAccounts, totalsOf, calcDep,
  type AssetFilters, type AssetLike, type AssetRow, type SortKey, type StateFilter, type StatusFilter,
} from "./assetsLogic";

type Branch = { id: number; name: string };
type Shop = { shop_name?: string; logo_url?: string; tax_number?: string; address?: string } | null | undefined;
type Props = { org: { id: number; name: string }; accounts: GLAccount[]; postable: GLAccount[]; branches: Branch[] | undefined; shop: Shop };

const CARD = "bg-slate-900 border border-slate-800 rounded-2xl";
const INPUT = "w-full bg-slate-950 border border-slate-700 rounded-xl text-white px-3 py-2 text-sm outline-none focus:border-blue-500 transition-colors";
const DATE = INPUT + " [color-scheme:dark]";
const LABEL = "text-[10px] text-slate-500 font-bold mb-1 block";
const BTN_SOFT = "inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 hover:text-white font-bold text-xs transition-colors disabled:opacity-50";
const BTN_EM = "inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold text-xs transition-colors disabled:opacity-50";
const BTN_AMBER = "inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 font-bold text-xs transition-colors disabled:opacity-50";
const BTN_BLUE = "inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-300 font-bold text-xs transition-colors disabled:opacity-50";
const BTN_SUCCESS = "inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-emerald-950 font-extrabold text-sm transition-colors disabled:opacity-50";
const KBD = "px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] font-mono text-slate-300";
const fmt = (n: number): string => (Math.round(n * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const todayStr = (): string => new Date().toISOString().slice(0, 10);
const numOf = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const PREF_KEY = "mihwar.assets.prefs.v1";
const loadPrefs = (): { sort: SortKey; dir: "asc" | "desc" } => { try { const j = JSON.parse(localStorage.getItem(PREF_KEY) || "{}"); return { sort: ["name", "acquire", "cost", "book", "due", "pct"].includes(j.sort) ? j.sort : "acquire", dir: j.dir === "asc" ? "asc" : "desc" }; } catch { return { sort: "acquire", dir: "desc" }; } };

type Form = { id?: number; name: string; category: string; acquire_date: string; cost: string; salvage_value: string; useful_life_years: string; account_id: number | null; expense_account_id: number | null; accum_account_id: number | null; branch_id: number | null; notes: string; is_active: boolean; depr_posted: number };
const blankForm = (): Form => ({ name: "", category: "", acquire_date: todayStr(), cost: "", salvage_value: "0", useful_life_years: "5", account_id: null, expense_account_id: null, accum_account_id: null, branch_id: null, notes: "", is_active: true, depr_posted: 0 });
const toForm = (a: AssetLike): Form => ({ id: a.id, name: a.name, category: a.category || "", acquire_date: a.acquire_date, cost: String(a.cost ?? ""), salvage_value: String(a.salvage_value ?? 0), useful_life_years: String(a.useful_life_years ?? ""), account_id: a.account_id, expense_account_id: a.expense_account_id, accum_account_id: a.accum_account_id, branch_id: a.branch_id, notes: a.notes || "", is_active: a.is_active !== false, depr_posted: Number(a.depr_posted) || 0 });

export default function AssetsTab({ org, accounts, postable, branches, shop }: Props) {
  const { t, lang, isRTL } = useLang();
  const multiBranch = !!branches && branches.length > 1;
  const nameOf = useCallback((a: GLAccount): string => (lang === "en" && a.name_en ? a.name_en : a.name), [lang]);
  const accById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const branchName = (id: number | null): string => (id != null ? branches?.find((b) => b.id === id)?.name || `#${id}` : "—");

  const [assets, setAssets] = useState<GLAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [asOf, setAsOf] = useState(todayStr());
  const [fBranch, setFBranch] = useState("");
  const [filters, setFilters] = useState<AssetFilters>(DEFAULT_FILTERS);
  const [prefs, setPrefs] = useState(loadPrefs);
  const [sel, setSel] = useState<number | null>(null);
  const [edit, setEdit] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [schedFor, setSchedFor] = useState<number | null>(null);
  const [postOpen, setPostOpen] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  const [recon, setRecon] = useState<ReturnType<typeof reconcile> | null>(null);
  const [reconLoading, setReconLoading] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch { /* التخزين غير متاح */ } }, [prefs]);

  const reload = useCallback(async () => {
    setLoading(true);
    try { setAssets(await DB.fetchAssets(org.id, fBranch ? Number(fBranch) : null)); } finally { setLoading(false); }
  }, [org.id, fBranch]);
  useEffect(() => { void reload(); }, [reload]);

  // ── مطابقة السجل مع الدفتر (قيود مرحَّلة حتى تاريخ الإهلاك) ──
  const loadRecon = useCallback(async () => {
    setReconLoading(true);
    try {
      const es = await DB.fetchEntries(org.id, "2000-01-01", asOf, null);
      const all = await DB.fetchAssets(org.id, null);
      setRecon(reconcile(all, accounts, glBalances(es)));
    } catch { setRecon(null); } finally { setReconLoading(false); }
  }, [org.id, asOf, accounts]);
  useEffect(() => { void loadRecon(); }, [loadRecon, assets]);

  // ── الصفوف ──
  const allRows = useMemo(() => buildRows(assets, asOf), [assets, asOf]);
  const cats = useMemo(() => categoriesOf(assets), [assets]);
  const shown = useMemo(() => sortRows(filterRows(allRows, filters, accById), prefs.sort, prefs.dir), [allRows, filters, accById, prefs]);
  const tot = useMemo(() => totalsOf(shown), [shown]);
  const tokens = useMemo(() => queryTokens(filters.q), [filters.q]);
  const filtering = filters.q !== "" || filters.category !== "" || filters.status !== "all" || filters.state !== "all";
  const hl = (txt: string) => (tokens.length ? splitHighlight(txt, tokens).map((p, i) => (p.hit ? <mark key={i} className="bg-amber-400/30 text-amber-100 rounded px-0.5">{p.s}</mark> : <span key={i}>{p.s}</span>)) : txt);

  useEffect(() => { if (!shown.length) { setSel(null); return; } if (sel == null || !shown.some((r) => r.a.id === sel)) setSel(shown[0].a.id); }, [shown, sel]);
  useEffect(() => { listRef.current?.querySelector<HTMLElement>('[data-sel="1"]')?.scrollIntoView({ block: "nearest" }); }, [sel]);

  const setSort = (k: SortKey) => setPrefs((p) => (p.sort === k ? { ...p, dir: p.dir === "asc" ? "desc" : "asc" } : { sort: k, dir: k === "name" ? "asc" : "desc" }));
  const stateLabel: Record<StateFilter, string> = { all: t("All states", "كل الحالات"), inservice: t("In service", "قيد الإهلاك"), fully: t("Fully depreciated", "مُهلك بالكامل"), future: t("Not yet in service", "لم يبدأ بعد"), due: t("Due to post", "مستحق الترحيل"), noacct: t("Missing accounts", "بلا حسابات إهلاك") };

  // ── رسوم ──
  const chartSpec: ChartSpec = useMemo(() => {
    const g = byCategory(shown, t("Uncategorized", "بلا فئة"));
    return {
      bars: { title: t("Book value by category", "القيمة الدفترية حسب الفئة"), rows: g.map((x) => ({ label: x.category, value: r2(x.book), tone: "info" as const })) },
      donut: { title: t("Cost share by category", "نسبة التكلفة حسب الفئة"), slices: topShares(g.map((x) => ({ label: x.category, value: x.cost })), 5, t("Other", "أخرى")), center: fmt(tot.cost) },
    };
  }, [shown, tot.cost, t]);

  // ── الحفظ/الحذف ──
  const save = async () => {
    if (!edit) return;
    const cost = numOf(edit.cost); const salv = numOf(edit.salvage_value); const life = numOf(edit.useful_life_years);
    if (!edit.name.trim()) { alert(t("Enter the asset name.", "أدخل اسم الأصل.")); return; }
    if (!edit.acquire_date) { alert(t("Enter the acquisition date.", "أدخل تاريخ الاقتناء.")); return; }
    if (!(cost > 0)) { alert(t("Cost must be greater than zero.", "يجب أن تكون التكلفة أكبر من صفر.")); return; }
    if (salv < 0 || salv > cost) { alert(t("Salvage value must be between 0 and the cost.", "القيمة التخريدية يجب أن تكون بين صفر والتكلفة.")); return; }
    if (!(life >= 1)) { alert(t("Useful life must be at least 1 year.", "العمر الإنتاجي سنة واحدة على الأقل.")); return; }
    const payload: Partial<GLAsset> = {
      organization_id: org.id, branch_id: edit.branch_id ?? (fBranch ? Number(fBranch) : null), name: edit.name.trim(), category: edit.category.trim() || null, acquire_date: edit.acquire_date,
      cost, salvage_value: salv, useful_life_years: life, account_id: edit.account_id, expense_account_id: edit.expense_account_id, accum_account_id: edit.accum_account_id,
      depr_posted: edit.depr_posted, notes: edit.notes.trim() || null, is_active: edit.is_active,
    };
    if (edit.id) payload.id = edit.id;
    setBusy(true); const r = await DB.upsertAsset(payload); setBusy(false);
    if (!r.ok) { alert(t("Save failed: ", "تعذّر الحفظ: ") + (r.error || "")); return; }
    setEdit(null); await reload();
  };
  const del = async (a: { id: number; name: string }) => {
    if (!window.confirm(t(`Delete asset "${a.name}"?`, `حذف الأصل «${a.name}»؟`))) return;
    const r = await DB.deleteAsset(a.id);
    if (!r.ok) { alert(t("Delete failed: ", "تعذّر الحذف: ") + (r.error || "")); return; }
    await reload();
  };

  // ── تصدير / طباعة ──
  const headLabels = [t("Asset", "الأصل"), t("Category", "الفئة"), t("Acquired", "تاريخ الاقتناء"), t("Cost", "التكلفة"), t("Salvage", "التخريدية"), t("Life (yrs)", "العمر (سنوات)"), t("Annual dep.", "إهلاك سنوي"), t("Accumulated", "مجمع الإهلاك"), t("Posted", "مُرحَّل"), t("Due to post", "مستحق الترحيل"), t("Book value", "القيمة الدفترية"), ...(multiBranch ? [t("Branch", "الفرع")] : [])];
  const rowCells = (r: AssetRow): (string | number)[] => [r.a.name, r.a.category || "", r.a.acquire_date, Number(r.a.cost) || 0, Number(r.a.salvage_value) || 0, Number(r.a.useful_life_years) || 0, r2(r.dep.annual), r2(r.dep.accumulated), r2(r.posted), r.due, r2(r.dep.bookValue), ...(multiBranch ? [branchName(r.a.branch_id)] : [])];
  const totalCells = (): (string | number)[] => [t("Totals", "الإجماليات"), "", "", r2(tot.cost), "", "", "", r2(tot.accumulated), r2(tot.posted), r2(tot.due), r2(tot.book), ...(multiBranch ? [""] : [])];
  const titleTxt = t("Fixed assets register", "سجل الأصول الثابتة");
  const subTxt = `${t("Depreciation as of", "الإهلاك حتى")} ${asOf} · ${shown.length} ${t("assets", "أصل")}`;
  const exportX = () => {
    const ws = XLSX.utils.aoa_to_sheet([[titleTxt, subTxt], [], headLabels, ...shown.map(rowCells), [], totalCells()]);
    ws["!cols"] = headLabels.map((_, i) => ({ wch: i === 0 ? 28 : 14 }));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Assets"); XLSX.writeFile(wb, `fixed_assets_${asOf}.xlsx`);
  };
  const printX = () => {
    const cols: ReportCol[] = headLabels.map((l, i) => (i === 2 ? { label: l, mono: true } : i >= 3 && i <= 10 ? { label: l, mono: true, align: "end" as const } : { label: l }));
    const ok = openPrint(buildReportHTML({ title: titleTxt, subtitle: subTxt, orgName: shop?.shop_name || org.name, taxNumber: shop?.tax_number, logoUrl: shop?.logo_url, address: shop?.address, dir: isRTL ? "rtl" : "ltr", lang: lang === "en" ? "en" : "ar", cols, rows: shown.map(rowCells), totals: totalCells() }));
    if (!ok) alert(t("Allow pop-ups to print.", "فعّل النوافذ المنبثقة للطباعة."));
  };

  // ── لوحة المفاتيح ──
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName; const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      if (edit || postOpen || schedFor != null) { if (e.key === "Escape" && schedFor != null && !edit && !postOpen) { e.preventDefault(); setSchedFor(null); } return; }
      if (e.key === "/" && !typing) { e.preventDefault(); searchRef.current?.focus(); return; }
      if (e.key === "Escape") { if (typing && e.target === searchRef.current && filters.q) { e.preventDefault(); setFilters((f) => ({ ...f, q: "" })); } return; }
      if (typing && e.target !== searchRef.current) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (!shown.length) return; e.preventDefault();
        const i = Math.max(0, shown.findIndex((r) => r.a.id === sel)); const n = Math.min(shown.length - 1, Math.max(0, i + (e.key === "ArrowDown" ? 1 : -1))); setSel(shown[n].a.id);
      } else if (e.key === "Enter" && sel != null && (!typing || e.target === searchRef.current)) { e.preventDefault(); setSchedFor(sel); }
    };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [edit, postOpen, schedFor, shown, sel, filters.q]);

  const th = "text-[10px] px-2 py-2.5 bg-slate-950 text-slate-400 whitespace-nowrap border-b border-slate-700 font-bold sticky top-0 z-10";
  const td = "px-2 py-2 text-xs border-b border-slate-800";
  const SortTH = ({ k, label, num }: { k: SortKey; label: string; num?: boolean }) => (
    <th dir={num ? "ltr" : undefined} className={`${th} ${num ? "text-end" : "text-start"}`}>
      <button type="button" onClick={() => setSort(k)} data-testid={`sort-${k}`} className={`inline-flex items-center gap-1 hover:text-white ${prefs.sort === k ? "text-blue-300" : ""}`}>{label}{prefs.sort === k ? <span>{prefs.dir === "asc" ? "▲" : "▼"}</span> : <ArrowDownUp size={10} className="opacity-40" />}</button>
    </th>
  );
  const kpi = (id: string, label: string, val: string, sub: string, tone: string) => (
    <div className={`${CARD} p-3`}><div className="text-[10px] text-slate-500 font-bold">{label}</div><div className={`text-lg font-extrabold font-mono mt-0.5 ${tone}`} dir="ltr" data-testid={id}>{val}</div><div className="text-[10px] text-slate-500 mt-0.5">{sub}</div></div>
  );
  const sched = schedFor != null ? allRows.find((r) => r.a.id === schedFor) : undefined;

  return (
    <div dir={isRTL ? "rtl" : "ltr"} data-testid="assets-tab">
      {/* المؤشرات */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-4">
        {kpi("k-count", t("Assets", "الأصول"), String(tot.count), `${tot.active} ${t("active", "فعّال")} · ${tot.fully} ${t("fully depreciated", "مُهلك بالكامل")}`, "text-white")}
        {kpi("k-cost", t("Total cost", "إجمالي التكلفة"), fmt(tot.cost), t("at acquisition", "عند الاقتناء"), "text-slate-100")}
        {kpi("k-accum", t("Accumulated dep.", "مجمع الإهلاك"), fmt(tot.accumulated), `${t("as of", "حتى")} ${asOf}`, "text-amber-300")}
        {kpi("k-book", t("Book value", "القيمة الدفترية"), fmt(tot.book), tot.cost > 0 ? `${fmt((tot.book / tot.cost) * 100)}% ${t("of cost", "من التكلفة")}` : "—", "text-emerald-400")}
        {kpi("k-due", t("Due to post", "مستحق الترحيل"), fmt(tot.due), `${tot.dueCount} ${t("assets", "أصل")}`, tot.due > 0.009 ? "text-red-300" : "text-slate-400")}
        {kpi("k-annual", t("Annual depreciation", "الإهلاك السنوي"), fmt(tot.annual), t("active, in service", "الفعّالة غير المُهلكة"), "text-sky-300")}
      </div>

      {/* الأدوات */}
      <div className={`${CARD} p-3 mb-4`}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="grow basis-56 relative">
            <label className={LABEL}>{t("Search", "بحث")}</label>
            <Search size={14} className="absolute start-3 bottom-3 text-slate-500 pointer-events-none" />
            <input ref={searchRef} value={filters.q} onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))} data-testid="a-search" placeholder={t("Name, category, notes, account…   ( / )", "الاسم، الفئة، الملاحظات، الحساب…   ( / )")} className={`${INPUT} ps-9`} />
          </div>
          <div><label className={LABEL}>{t("Depreciation as of", "الإهلاك حتى تاريخ")}</label><input type="date" value={asOf} onChange={(e) => e.target.value && setAsOf(e.target.value)} className={DATE} data-testid="a-asof" /></div>
          <div><label className={LABEL}>{t("Category", "الفئة")}</label>
            <select value={filters.category} onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))} className={INPUT} data-testid="a-cat"><option value="">{t("All categories", "كل الفئات")}</option>{cats.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
          <div><label className={LABEL}>{t("State", "الحالة")}</label>
            <select value={filters.state} onChange={(e) => setFilters((f) => ({ ...f, state: e.target.value as StateFilter }))} className={INPUT} data-testid="a-state">{(Object.keys(stateLabel) as StateFilter[]).map((k) => <option key={k} value={k}>{stateLabel[k]}</option>)}</select></div>
          <div><label className={LABEL}>{t("Status", "التفعيل")}</label>
            <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value as StatusFilter }))} className={INPUT} data-testid="a-status"><option value="all">{t("All", "الكل")}</option><option value="active">{t("Active", "فعّال")}</option><option value="inactive">{t("Inactive", "موقوف")}</option></select></div>
          {multiBranch && <div><label className={LABEL}>{t("Branch", "الفرع")}</label>
            <select value={fBranch} onChange={(e) => setFBranch(e.target.value)} className={INPUT} data-testid="a-branch"><option value="">{t("All branches", "كل الفروع")}</option>{branches!.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>}
          {filtering && <button type="button" onClick={() => setFilters(DEFAULT_FILTERS)} className={BTN_SOFT} data-testid="a-reset"><RotateCcw size={13} /> {t("Reset", "إعادة ضبط")}</button>}
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <button type="button" onClick={() => setEdit({ ...blankForm(), branch_id: fBranch ? Number(fBranch) : null })} className={BTN_EM} data-testid="new-asset"><Plus size={14} /> {t("New asset", "أصل جديد")}</button>
          <button type="button" onClick={() => setPostOpen(true)} disabled={!assets.length} className={BTN_AMBER} data-testid="open-post"><TrendingDown size={14} /> {t("Post depreciation", "ترحيل الإهلاك")}</button>
          <button type="button" onClick={exportX} disabled={!shown.length} className={BTN_BLUE} data-testid="a-export"><Download size={14} /> Excel</button>
          <button type="button" onClick={printX} disabled={!shown.length} className={BTN_BLUE} data-testid="a-print"><Printer size={14} /> {t("Print", "طباعة")}</button>
          <span className="text-[11px] text-slate-500 ms-2" data-testid="a-count">{shown.length} / {assets.length} {t("assets", "أصل")}{loading ? " …" : ""}</span>
          <button type="button" onClick={() => setShowKeys((v) => !v)} className={`${BTN_SOFT} ms-auto`} data-testid="a-keys-toggle"><Keyboard size={14} /> {t("Shortcuts", "الاختصارات")}</button>
        </div>
        {showKeys && (
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[11px] text-slate-400" data-testid="a-keys">
            <span><kbd className={KBD}>/</kbd> {t("search", "بحث")}</span><span><kbd className={KBD}>↑</kbd><kbd className={KBD}>↓</kbd> {t("select", "تحديد")}</span>
            <span><kbd className={KBD}>Enter</kbd> {t("depreciation schedule", "جدول الإهلاك")}</span><span><kbd className={KBD}>Esc</kbd> {t("clear / close", "مسح / إغلاق")}</span>
          </div>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px] items-start">
        <div className="min-w-0 space-y-4">
          <div className={`${CARD} overflow-hidden`}>
            <div ref={listRef} className="overflow-x-auto">
              <table className="w-full border-collapse" style={{ minWidth: 1000 }} data-testid="assets-table">
                <thead><tr>
                  <SortTH k="name" label={t("Asset", "الأصل")} /><SortTH k="acquire" label={t("Acquired", "الاقتناء")} />
                  <SortTH k="cost" label={t("Cost", "التكلفة")} num />
                  <th dir="ltr" className={`${th} text-end`}>{t("Life", "العمر")}</th><th dir="ltr" className={`${th} text-end`}>{t("Annual", "سنوي")}</th>
                  <SortTH k="pct" label={t("Accumulated", "المجمع")} num />
                  <th dir="ltr" className={`${th} text-end`}>{t("Posted", "مُرحَّل")}</th><SortTH k="due" label={t("Due", "مستحق")} num /><SortTH k="book" label={t("Book value", "الدفترية")} num />
                  {multiBranch && <th className={`${th} text-start`}>{t("Branch", "الفرع")}</th>}<th className={th} />
                </tr></thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.a.id} data-sel={r.a.id === sel ? "1" : undefined} data-testid="asset-row" onClick={() => setSel(r.a.id)} onDoubleClick={() => setSchedFor(r.a.id)}
                      className={`cursor-pointer hover:bg-white/[0.03] ${r.a.id === sel ? "bg-blue-500/10" : ""} ${r.a.is_active === false ? "opacity-60" : ""}`}>
                      <td className={`${td} text-start`}>
                        <div className="text-slate-100 font-bold" data-testid="asset-name">{hl(r.a.name)}{r.a.is_active === false && <span className="text-[9px] text-red-400 ms-1">({t("inactive", "موقوف")})</span>}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5 flex flex-wrap gap-x-2">{r.a.category && <span>{hl(r.a.category)}</span>}{r.state === "fully" && <span className="text-emerald-400">{t("fully depreciated", "مُهلك بالكامل")}</span>}{r.state === "future" && <span className="text-sky-400">{t("not yet in service", "لم يبدأ بعد")}</span>}{r.noAccounts && <span className="text-amber-400" data-testid="no-accts">{t("no dep. accounts", "بلا حسابات إهلاك")}</span>}</div>
                      </td>
                      <td className={`${td} font-mono text-slate-400`} dir="ltr"><span className="block text-start">{r.a.acquire_date}</span></td>
                      <td className={`${td} text-end font-mono text-slate-200`} dir="ltr">{fmt(Number(r.a.cost) || 0)}</td>
                      <td className={`${td} text-end font-mono text-slate-400`} dir="ltr">{r.a.useful_life_years}</td>
                      <td className={`${td} text-end font-mono text-amber-400`} dir="ltr">{fmt(r.dep.annual)}</td>
                      <td className={`${td} text-end`} dir="ltr"><div className="font-mono text-amber-300">{fmt(r.dep.accumulated)}</div><div className="h-1 rounded bg-slate-800 mt-1 w-20 ms-auto overflow-hidden" title={`${fmt(r.pct)}%`}><div className="h-full bg-amber-400" style={{ width: `${r.pct}%` }} data-testid="asset-pct" data-pct={r.pct.toFixed(1)} /></div></td>
                      <td className={`${td} text-end font-mono text-slate-400`} dir="ltr">{fmt(r.posted)}</td>
                      <td className={`${td} text-end font-mono ${r.due > 0.009 ? "text-red-300 font-bold" : "text-slate-600"}`} dir="ltr" data-testid="asset-due">{fmt(r.due)}</td>
                      <td className={`${td} text-end font-mono font-bold text-emerald-400`} dir="ltr">{fmt(r.dep.bookValue)}</td>
                      {multiBranch && <td className={`${td} text-slate-400`}>{branchName(r.a.branch_id)}</td>}
                      <td className={td}><div className="flex items-center gap-1 justify-center">
                        <button type="button" onClick={(e) => { e.stopPropagation(); setSchedFor(r.a.id); }} title={t("Depreciation schedule", "جدول الإهلاك")} data-testid="asset-sched" className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-300 flex items-center justify-center hover:bg-amber-500/20"><ListOrdered size={13} /></button>
                        <button type="button" onClick={(e) => { e.stopPropagation(); setEdit(toForm(r.a)); }} title={t("Edit", "تعديل")} data-testid="asset-edit" className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-300 flex items-center justify-center hover:bg-blue-500/20"><Pencil size={13} /></button>
                        <button type="button" onClick={(e) => { e.stopPropagation(); void del(r.a); }} title={t("Delete", "حذف")} data-testid="asset-del" className="w-7 h-7 rounded-lg bg-red-500/10 text-red-400 flex items-center justify-center hover:bg-red-500/20"><Trash2 size={13} /></button>
                      </div></td>
                    </tr>
                  ))}
                  {shown.length === 0 && <tr><td colSpan={multiBranch ? 11 : 10} className="p-8 text-center text-slate-500 text-sm" data-testid="assets-empty">{loading ? t("Loading…", "جارٍ التحميل…") : assets.length ? t("No assets match the filters.", "لا توجد أصول مطابقة للتصفية.") : t("No assets yet. Press “New asset”.", "لا توجد أصول بعد. اضغط «أصل جديد».")}</td></tr>}
                </tbody>
                {shown.length > 0 && (
                  <tfoot><tr className="bg-slate-950 font-bold">
                    <td colSpan={2} className="px-2 py-2.5 text-xs text-slate-200 border-t border-slate-600 text-start">{t("Totals", "الإجماليات")}</td>
                    <td className="px-2 py-2.5 text-end font-mono text-xs text-slate-100 border-t border-slate-600" dir="ltr" data-testid="tot-cost">{fmt(tot.cost)}</td>
                    <td colSpan={2} className="border-t border-slate-600" />
                    <td className="px-2 py-2.5 text-end font-mono text-xs text-amber-300 border-t border-slate-600" dir="ltr" data-testid="tot-accum">{fmt(tot.accumulated)}</td>
                    <td className="px-2 py-2.5 text-end font-mono text-xs text-slate-300 border-t border-slate-600" dir="ltr">{fmt(tot.posted)}</td>
                    <td className="px-2 py-2.5 text-end font-mono text-xs text-red-300 border-t border-slate-600" dir="ltr" data-testid="tot-due">{fmt(tot.due)}</td>
                    <td className="px-2 py-2.5 text-end font-mono text-xs text-emerald-400 border-t border-slate-600" dir="ltr" data-testid="tot-book">{fmt(tot.book)}</td>
                    <td colSpan={multiBranch ? 2 : 1} className="border-t border-slate-600" />
                  </tr></tfoot>
                )}
              </table>
            </div>
          </div>

          {/* المطابقة مع الدفتر */}
          <div className={`${CARD} p-4`} data-testid="recon">
            <div className="flex items-center gap-2 mb-3"><Scale size={15} className="text-sky-400" /><h3 className="text-sm font-bold text-white">{t("Register vs general ledger", "مطابقة السجل مع دفتر الأستاذ")}</h3>
              <span className="text-[10px] text-slate-500">{t("posted entries up to", "القيود المرحَّلة حتى")} {asOf}</span>
              {recon && <span className={`ms-auto text-[11px] font-bold ${recon.ok ? "text-emerald-400" : "text-amber-400"}`} data-testid="recon-status">{recon.ok ? t("Matches ✓", "مطابق ✓") : t("Differences found", "توجد فروق")}</span>}</div>
            {reconLoading && !recon ? <div className="text-xs text-slate-500">{t("Loading…", "جارٍ التحميل…")}</div> : !recon ? <div className="text-xs text-slate-500">{t("Could not load ledger balances.", "تعذّر تحميل أرصدة الدفتر.")}</div> : (
              <table className="w-full text-xs"><thead><tr className="text-[10px] text-slate-500"><th className="text-start py-1"></th><th className="text-end py-1" dir="ltr">{t("Register", "السجل")}</th><th className="text-end py-1" dir="ltr">{t("Ledger", "الدفتر")}</th><th className="text-end py-1" dir="ltr">{t("Difference", "الفرق")}</th></tr></thead>
                <tbody>
                  <tr><td className="py-1 text-slate-300">{t("Fixed assets at cost (12xx)", "الأصول الثابتة بالتكلفة (12xx)")}</td><td className="text-end font-mono text-slate-200" dir="ltr" data-testid="rc-reg-cost">{fmt(recon.regCost)}</td><td className="text-end font-mono text-slate-200" dir="ltr" data-testid="rc-gl-cost">{fmt(recon.glCost)}</td><td className={`text-end font-mono font-bold ${Math.abs(recon.costDiff) < 0.01 ? "text-emerald-400" : "text-amber-400"}`} dir="ltr" data-testid="rc-cost-diff">{fmt(recon.costDiff)}</td></tr>
                  <tr><td className="py-1 text-slate-300">{t("Posted accumulated depreciation (1209)", "مجمع الإهلاك المُرحَّل (1209)")}</td><td className="text-end font-mono text-slate-200" dir="ltr" data-testid="rc-reg-accum">{fmt(recon.regAccum)}</td><td className="text-end font-mono text-slate-200" dir="ltr" data-testid="rc-gl-accum">{fmt(recon.glAccum)}</td><td className={`text-end font-mono font-bold ${Math.abs(recon.accumDiff) < 0.01 ? "text-emerald-400" : "text-amber-400"}`} dir="ltr" data-testid="rc-accum-diff">{fmt(recon.accumDiff)}</td></tr>
                </tbody></table>
            )}
            {recon && !recon.ok && <p className="text-[10px] text-slate-500 mt-2">{t("A cost difference usually means the acquisition was never journaled (the register is not posted automatically). The depreciation difference means posted depreciation in the register differs from account 1209.", "فرق التكلفة يعني غالبًا أن قيد الاقتناء لم يُسجَّل (السجل لا يُرحَّل تلقائيًا). وفرق الإهلاك يعني أن المُرحَّل في السجل يختلف عن رصيد الحساب 1209.")}</p>}
          </div>
        </div>
        <StatementCharts spec={chartSpec} />
      </div>

      {sched && <ScheduleDialog row={sched} asOf={asOf} onClose={() => setSchedFor(null)} onEdit={() => { setEdit(toForm(sched.a)); }} />}

      {edit && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" dir={isRTL ? "rtl" : "ltr"} data-testid="asset-form">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-xl p-5 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-white font-bold text-base mb-4">{edit.id ? t("Edit asset", "تعديل أصل") : t("New asset", "أصل جديد")}</h3>
            <div className="space-y-3">
              <div><label className={LABEL}>{t("Asset name", "اسم الأصل")}</label><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} className={INPUT} data-testid="f-name" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={LABEL}>{t("Category", "الفئة")}</label><input list="asset-cats" value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })} placeholder={t("Furniture / Equipment / Vehicles…", "أثاث / أجهزة / سيارات…")} className={INPUT} data-testid="f-cat" /><datalist id="asset-cats">{cats.map((c) => <option key={c} value={c} />)}</datalist></div>
                <div><label className={LABEL}>{t("Acquisition date", "تاريخ الاقتناء")}</label><input type="date" value={edit.acquire_date} onChange={(e) => setEdit({ ...edit, acquire_date: e.target.value })} className={DATE} data-testid="f-date" /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className={LABEL}>{t("Cost", "التكلفة")}</label><input type="number" step="0.01" value={edit.cost} onChange={(e) => setEdit({ ...edit, cost: e.target.value })} className={`${INPUT} text-center`} dir="ltr" data-testid="f-cost" /></div>
                <div><label className={LABEL}>{t("Salvage value", "القيمة التخريدية")}</label><input type="number" step="0.01" value={edit.salvage_value} onChange={(e) => setEdit({ ...edit, salvage_value: e.target.value })} className={`${INPUT} text-center`} dir="ltr" data-testid="f-salvage" /></div>
                <div><label className={LABEL}>{t("Life (years)", "العمر (سنوات)")}</label><input type="number" step="1" value={edit.useful_life_years} onChange={(e) => setEdit({ ...edit, useful_life_years: e.target.value })} className={`${INPUT} text-center`} dir="ltr" data-testid="f-life" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={LABEL}>{t("Asset account (optional)", "حساب الأصل (اختياري)")}</label><AccountCombo accounts={postable} value={edit.account_id} onChange={(id) => setEdit({ ...edit, account_id: id })} storageKey={`mihwar.assets.recent.${org.id}`} testId="f-acct" placeholder={t("— none", "— بدون")} /></div>
                {multiBranch && <div><label className={LABEL}>{t("Cost center (branch)", "مركز التكلفة (فرع)")}</label><select value={edit.branch_id ?? ""} onChange={(e) => setEdit({ ...edit, branch_id: e.target.value ? Number(e.target.value) : null })} className={INPUT} data-testid="f-branch"><option value="">{t("— none", "— بدون")}</option>{branches!.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={LABEL}>{t("Depreciation expense account", "حساب مصروف الإهلاك")}</label><AccountCombo accounts={postable} value={edit.expense_account_id} onChange={(id) => setEdit({ ...edit, expense_account_id: id })} storageKey={`mihwar.assets.recent.${org.id}`} testId="f-exp" placeholder={t("— use default", "— الافتراضي")} /></div>
                <div><label className={LABEL}>{t("Accumulated depreciation account", "حساب مجمع الإهلاك")}</label><AccountCombo accounts={postable} value={edit.accum_account_id} onChange={(id) => setEdit({ ...edit, accum_account_id: id })} storageKey={`mihwar.assets.recent.${org.id}`} testId="f-accum" placeholder={t("— use default", "— الافتراضي")} /></div>
              </div>
              <p className="text-[10px] text-slate-500 -mt-1">{t("If left empty, the default accounts chosen in “Post depreciation” are used.", "إن تُركا فارغين، يُستخدم الحسابان الافتراضيان المختاران في نافذة «ترحيل الإهلاك».")}</p>
              <div><label className={LABEL}>{t("Notes", "ملاحظات")}</label><input value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} className={INPUT} data-testid="f-notes" /></div>
              {numOf(edit.cost) > 0 && numOf(edit.useful_life_years) > 0 && (() => {
                const d = calcDep({ cost: numOf(edit.cost), salvage_value: numOf(edit.salvage_value), useful_life_years: numOf(edit.useful_life_years), acquire_date: edit.acquire_date || todayStr() }, asOf);
                return (
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-400 flex flex-wrap gap-x-4 gap-y-1" data-testid="f-preview">
                    <span>{t("Annual", "سنوي")}: <span className="font-mono text-amber-400" dir="ltr">{fmt(d.annual)}</span></span>
                    <span>{t("Monthly", "شهري")}: <span className="font-mono text-amber-400" dir="ltr">{fmt(d.monthly)}</span></span>
                    <span>{t("Accumulated to", "المجمع حتى")} {asOf}: <span className="font-mono text-amber-300" dir="ltr">{fmt(d.accumulated)}</span></span>
                    <span>{t("Book value", "الدفترية")}: <span className="font-mono text-emerald-400" dir="ltr">{fmt(d.bookValue)}</span></span>
                  </div>
                );
              })()}
              <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={edit.is_active} onChange={(e) => setEdit({ ...edit, is_active: e.target.checked })} className="w-4 h-4 accent-blue-500" data-testid="f-active" /> {t("Active (included in depreciation posting)", "نشط (يدخل في ترحيل الإهلاك)")}</label>
            </div>
            <div className="flex gap-2 justify-end mt-5">
              <button type="button" onClick={() => setEdit(null)} className={BTN_SOFT} data-testid="f-cancel"><X size={14} /> {t("Cancel", "إلغاء")}</button>
              <button type="button" onClick={() => void save()} disabled={busy} className={BTN_SUCCESS} data-testid="f-save"><Save size={15} /> {busy ? t("Saving…", "جارٍ…") : t("Save", "حفظ")}</button>
            </div>
          </div>
        </div>
      )}

      {postOpen && <PostDialog org={org} assets={assets} accounts={accounts} postable={postable} nameOf={nameOf} branches={branches} multiBranch={multiBranch} fBranch={fBranch} initialDate={asOf} onClose={() => setPostOpen(false)} onDone={async () => { setPostOpen(false); await reload(); }} />}
    </div>
  );
}

// ── جدول الإهلاك السنوي ──
function ScheduleDialog({ row, asOf, onClose, onEdit }: { row: AssetRow; asOf: string; onClose: () => void; onEdit: () => void }) {
  const { t, isRTL } = useLang();
  const rows = useMemo(() => scheduleFor(row.a), [row.a]);
  const curYear = Number(asOf.slice(0, 4));
  const th = "text-[10px] px-2 py-2 bg-slate-950 text-slate-400 border-b border-slate-700 font-bold whitespace-nowrap";
  const td = "px-2 py-1.5 text-xs border-b border-slate-800 font-mono text-end";
  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" dir={isRTL ? "rtl" : "ltr"} onClick={onClose} data-testid="sched">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-800">
          <ListOrdered size={17} className="text-amber-400" />
          <div className="min-w-0"><div className="text-sm font-bold text-white truncate" data-testid="sched-title">{row.a.name}</div>
            <div className="text-[10px] text-slate-500" dir="ltr">{t("Cost", "التكلفة")} {fmt(Number(row.a.cost) || 0)} · {t("Salvage", "التخريدية")} {fmt(Number(row.a.salvage_value) || 0)} · {row.a.useful_life_years} {t("yrs", "سنة")} · {row.a.acquire_date}</div></div>
          <button type="button" onClick={onEdit} className={`${BTN_SOFT} ms-auto`} data-testid="sched-edit"><Pencil size={13} /> {t("Edit", "تعديل")}</button>
          <button type="button" onClick={onClose} aria-label={t("Close", "إغلاق")} data-testid="sched-close" className="w-8 h-8 rounded-lg bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center"><X size={15} /></button>
        </div>
        <div className="overflow-auto">
          {rows.length === 0 ? <div className="p-8 text-center text-slate-500 text-sm" data-testid="sched-empty">{t("No depreciation (no depreciable base or life).", "لا يوجد إهلاك (لا أساس قابل للإهلاك أو العمر صفر).")}</div> : (
            <table className="w-full border-collapse" data-testid="sched-table">
              <thead><tr><th className={`${th} text-start`}>{t("Year", "السنة")}</th><th className={`${th} text-end`} dir="ltr">{t("Months", "الأشهر")}</th><th className={`${th} text-end`} dir="ltr">{t("Opening", "افتتاحي")}</th><th className={`${th} text-end`} dir="ltr">{t("Expense", "مصروف السنة")}</th><th className={`${th} text-end`} dir="ltr">{t("Accumulated", "المجمع")}</th><th className={`${th} text-end`} dir="ltr">{t("Book value", "الدفترية")}</th><th className={`${th} text-center`}>{t("Posted", "مُرحَّل")}</th></tr></thead>
              <tbody>{rows.map((s) => (
                <tr key={s.year} data-testid="sched-row" className={s.year === curYear ? "bg-blue-500/10" : ""}>
                  <td className="px-2 py-1.5 text-xs border-b border-slate-800 font-mono text-slate-300 text-start" dir="ltr">{s.year}</td>
                  <td className={`${td} text-slate-400`} dir="ltr">{s.months}</td><td className={`${td} text-slate-400`} dir="ltr">{fmt(s.opening)}</td>
                  <td className={`${td} text-amber-300`} dir="ltr" data-testid="sched-exp">{fmt(s.expense)}</td><td className={`${td} text-amber-200`} dir="ltr">{fmt(s.accumulated)}</td><td className={`${td} text-emerald-400 font-bold`} dir="ltr">{fmt(s.book)}</td>
                  <td className="px-2 py-1.5 text-xs border-b border-slate-800 text-center">{s.posted ? <Check size={13} className="inline text-emerald-400" /> : <span className="text-slate-600">—</span>}</td>
                </tr>))}</tbody>
              <tfoot><tr className="bg-slate-950 font-bold"><td colSpan={3} className="px-2 py-2 text-xs text-slate-200 text-start border-t border-slate-600">{t("Total", "الإجمالي")}</td><td className="px-2 py-2 text-xs font-mono text-end text-amber-300 border-t border-slate-600" dir="ltr" data-testid="sched-total">{fmt(rows.reduce((s, x) => s + x.expense, 0))}</td><td colSpan={3} className="border-t border-slate-600" /></tr></tfoot>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ── ترحيل قيد الإهلاك ──
type PostProps = { org: { id: number; name: string }; assets: GLAsset[]; accounts: GLAccount[]; postable: GLAccount[]; nameOf: (a: GLAccount) => string; branches: Branch[] | undefined; multiBranch: boolean; fBranch: string; initialDate: string; onClose: () => void; onDone: () => Promise<void> };
function PostDialog({ org, assets, accounts, postable, nameOf, branches, multiBranch, fBranch, initialDate, onClose, onDone }: PostProps) {
  const { t, isRTL } = useLang();
  const sug = useMemo(() => suggestDeprAccounts(accounts), [accounts]);
  const [date, setDate] = useState(initialDate);
  const [defExp, setDefExp] = useState<number | null>(sug.exp);
  const [defAcc, setDefAcc] = useState<number | null>(sug.acc);
  const [pBranch, setPBranch] = useState("");
  const [posting, setPosting] = useState(false);
  const rows = useMemo(() => postRowsFor(assets, date, defExp, defAcc), [assets, date, defExp, defAcc]);
  const total = rows.reduce((s, r) => s + r.due, 0);
  const missing = rows.some((r) => !r.expAcc || !r.accAcc);
  const accName = (id: number | null): string => { if (id == null) return ""; const a = accounts.find((x) => x.id === id); return a ? `${a.code} ${nameOf(a)}` : `#${id}`; };
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); onClose(); } }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [onClose]);
  const doPost = async () => {
    if (!rows.length) { alert(t("No depreciation is due up to this date.", "لا يوجد إهلاك مستحق للترحيل حتى هذا التاريخ.")); return; }
    if (missing) { alert(t("Some assets have no expense/accumulated account. Pick the defaults above or set them on the asset.", "بعض الأصول بلا حساب مصروف/مجمع. حدّد الحسابين الافتراضيين أو على الأصل نفسه.")); return; }
    setPosting(true);
    const items = rows.map((r) => ({ assetId: r.a.id, name: r.a.name, amount: r.due, expAcc: r.expAcc as number, accAcc: r.accAcc as number, branch: r.a.branch_id ?? null, priorPosted: r.prior }));
    const res = await DB.postDepreciation(org.id, { date, branch_id: pBranch ? Number(pBranch) : fBranch ? Number(fBranch) : null, notes: null }, items);
    setPosting(false);
    if (!res.ok) { alert(t("Posting failed: ", "تعذّر الترحيل: ") + (res.error || "")); return; }
    alert(t(`Depreciation entry posted: ${fmt(res.total || 0)} (internal id ${res.id}).`, `تم ترحيل قيد إهلاك بإجمالي ${fmt(res.total || 0)} — رقم القيد الداخلي ${res.id}.`));
    await onDone();
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" dir={isRTL ? "rtl" : "ltr"} data-testid="post-dialog">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl p-5 shadow-2xl max-h-[90vh] overflow-y-auto">
        <h3 className="text-white font-bold text-base mb-1 flex items-center gap-2"><TrendingDown size={18} className="text-amber-400" /> {t("Post depreciation entry", "ترحيل قيد الإهلاك")}</h3>
        <p className="text-[11px] text-slate-500 mb-4">{t("Creates one entry: Dr depreciation expense / Cr accumulated depreciation for each asset's unposted amount up to the date.", "يُنشئ قيدًا واحدًا: مدين «مصروف الإهلاك» / دائن «مجمع الإهلاك» بقيمة المستحق غير المُرحَّل لكل أصل حتى التاريخ.")}</p>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div><label className={LABEL}>{t("Depreciation as of", "الإهلاك حتى تاريخ")}</label><input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className={DATE} data-testid="p-date" /></div>
          {multiBranch && <div><label className={LABEL}>{t("Entry cost center", "مركز تكلفة القيد")}</label><select value={pBranch} onChange={(e) => setPBranch(e.target.value)} className={INPUT} data-testid="p-branch"><option value="">{t("— per asset branch", "— حسب فرع كل أصل")}</option>{branches!.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>}
        </div>
        <div className="grid grid-cols-2 gap-3 mb-1">
          <div><label className={LABEL}>{t("Default expense account", "حساب مصروف الإهلاك (افتراضي)")}</label><AccountCombo accounts={postable} value={defExp} onChange={setDefExp} storageKey={`mihwar.assets.recent.${org.id}`} testId="p-exp" placeholder={t("— choose", "— اختر")} /></div>
          <div><label className={LABEL}>{t("Default accumulated account", "حساب مجمع الإهلاك (افتراضي)")}</label><AccountCombo accounts={postable} value={defAcc} onChange={setDefAcc} storageKey={`mihwar.assets.recent.${org.id}`} testId="p-acc" placeholder={t("— choose", "— اختر")} /></div>
        </div>
        <p className="text-[10px] text-slate-500 mb-3">{t("Defaults apply to assets without their own accounts.", "يُستخدم الحسابان الافتراضيان لأي أصل لم تُحدَّد له حساباته.")}</p>
        <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden mb-3">
          <div className="px-3 py-2 text-[11px] text-slate-400 border-b border-slate-800 flex items-center justify-between"><span>{t("Assets due", "الأصول المستحقة")}</span><span>{rows.length} {t("assets", "أصل")} · {t("total", "إجمالي")}: <span className="font-mono text-amber-300 font-bold" dir="ltr" data-testid="p-total">{fmt(total)}</span></span></div>
          <div className="max-h-56 overflow-y-auto">
            {rows.length === 0 ? <div className="p-6 text-center text-slate-500 text-xs" data-testid="p-empty">{t("No depreciation is due up to this date.", "لا يوجد إهلاك مستحق للترحيل حتى هذا التاريخ.")}</div> : (
              <table className="w-full border-collapse"><thead><tr><th className="text-[10px] px-2 py-1.5 text-slate-500 text-start">{t("Asset", "الأصل")}</th><th className="text-[10px] px-2 py-1.5 text-slate-500 text-end" dir="ltr">{t("Due", "المستحق")}</th><th className="text-[10px] px-2 py-1.5 text-slate-500 text-start">{t("Expense a/c", "حساب المصروف")}</th><th className="text-[10px] px-2 py-1.5 text-slate-500 text-start">{t("Accumulated a/c", "حساب المجمع")}</th></tr></thead>
                <tbody>{rows.map((r) => (
                  <tr key={r.a.id} data-testid="p-row"><td className="px-2 py-1.5 text-xs text-slate-200 border-b border-slate-800/60">{r.a.name}</td><td className="px-2 py-1.5 text-xs font-mono text-amber-300 text-end border-b border-slate-800/60" dir="ltr">{fmt(r.due)}</td>
                    <td className={`px-2 py-1.5 text-[11px] border-b border-slate-800/60 ${r.expAcc ? "text-slate-400" : "text-red-400"}`}>{r.expAcc ? accName(r.expAcc) : t("not set", "غير محدد")}</td>
                    <td className={`px-2 py-1.5 text-[11px] border-b border-slate-800/60 ${r.accAcc ? "text-slate-400" : "text-red-400"}`}>{r.accAcc ? accName(r.accAcc) : t("not set", "غير محدد")}</td></tr>))}</tbody></table>
            )}
          </div>
        </div>
        {missing && <p className="text-[11px] text-red-400 mb-3" data-testid="p-missing">{t("⚠ Some assets have no expense/accumulated account — choose the defaults above or set them on the asset.", "⚠ بعض الأصول بلا حساب مصروف/مجمع — حدّد الحسابين الافتراضيين أعلاه أو على الأصل نفسه.")}</p>}
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className={BTN_SOFT} data-testid="p-cancel"><X size={14} /> {t("Cancel", "إلغاء")}</button>
          <button type="button" onClick={() => void doPost()} disabled={posting || !rows.length || missing} className={BTN_SUCCESS} data-testid="p-post"><Check size={15} /> {posting ? t("Posting…", "جارٍ الترحيل…") : `${t("Post", "ترحيل")} ${fmt(total)}`}</button>
        </div>
      </div>
    </div>
  );
}
