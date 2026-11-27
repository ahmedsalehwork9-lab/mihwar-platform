// =============================================================
// src/pages/accounting/chart/ChartTab.tsx
// دليل الحسابات — بحث متقدم + ثنائي اللغة (RTL/LTR) + تنقّل بلوحة المفاتيح.
// يحافظ على كل وظائف الصفحة السابقة: إضافة/تعديل/حذف، التهيئة القياسية، استيراد/تصدير Excel.
// لا يغيّر أي بنية في قاعدة البيانات ولا يُنشئ حسابات تلقائيًا.
// =============================================================
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Plus, Pencil, Trash2, Download, Printer, Upload, Save, X, Search, Layers, ChevronDown, ChevronRight, ChevronLeft, Network, Keyboard, RotateCcw, Scale, ListTree, List } from "lucide-react";
import * as DB from "../../lib/accountingDb";
import { fetchOrgConfig, curAr, curEn } from "../../lib/orgConfig";
import { chartCountryInfo } from "../../lib/chartCountries";
import { buildReportHTML, openPrint, type ReportCol } from "../shared/printReport";
import type { AccType, GLAccount } from "../../lib/accountingDb";
import { useLang } from "../../../context/LanguageContext";
import {
  DEFAULT_FILTERS, TYPE_LABEL_AR, TYPE_LABEL_EN, buildChildren, computeVisibility, depthMap, descendantsOf, flattenFlat, flattenTree,
  isFiltering, nextChildCode, queryTokens, rollupBalances, splitHighlight,
  type ChartFilters, type Row,
} from "./chartLogic";

const CARD = "bg-slate-900 border border-slate-800 rounded-2xl";
const INPUT = "w-full bg-slate-950 border border-slate-700 rounded-xl text-white px-3 py-2 text-sm outline-none focus:border-blue-500 transition-colors";
const SELECT = INPUT;
const LABEL = "text-[10px] text-slate-500 font-bold mb-1 block";
const BTN_SOFT = "inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 hover:text-white font-bold text-xs transition-colors disabled:opacity-50";
const BTN_PRIMARY = "inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-[#fff] font-bold text-xs transition-colors disabled:opacity-50";
const BTN_SUCCESS = "inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-emerald-950 font-extrabold text-sm transition-colors disabled:opacity-50";
const BTN_GHOST_EM = "inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold text-xs transition-colors disabled:opacity-50";
const BTN_GHOST_BL = "inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-300 font-bold text-xs transition-colors disabled:opacity-50";
const KBD = "px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] font-mono text-slate-300";

const TYPE_OPTS: AccType[] = ["asset", "liability", "equity", "revenue", "expense"];
const TYPE_TONE: Record<AccType, string> = {
  asset: "bg-emerald-500/15 text-emerald-300", liability: "bg-amber-500/15 text-amber-300", equity: "bg-violet-500/15 text-violet-300",
  revenue: "bg-sky-500/15 text-sky-300", expense: "bg-rose-500/15 text-rose-300",
};
const money = (n: number): string => (Math.round(n * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const todayStr = (): string => new Date().toISOString().slice(0, 10);

const PREF_KEY = "mihwar.chart.prefs.v1";
type Prefs = { view: "tree" | "flat"; showBal: boolean };
const loadPrefs = (): Prefs => {
  try { const j = JSON.parse(localStorage.getItem(PREF_KEY) || "null"); if (j && (j.view === "tree" || j.view === "flat")) return { view: j.view, showBal: !!j.showBal }; } catch { /* التخزين غير متاح */ }
  return { view: "tree", showBal: false };
};
const savePrefs = (p: Prefs): void => { try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch { /* تجاهل */ } };

type Props = { org: { id: number; name: string }; shop?: { shop_name?: string; logo_url?: string; tax_number?: string; address?: string } | null; accounts: GLAccount[]; reload: () => Promise<void>; busy: boolean; setBusy: (b: boolean) => void };

export default function ChartTab({ org, shop, accounts, reload, busy, setBusy }: Props) {
  const { t, lang, isRTL } = useLang();
  const dir = isRTL ? "rtl" : "ltr";
  const typeLabel = (x: AccType): string => (lang === "ar" ? TYPE_LABEL_AR[x] : TYPE_LABEL_EN[x]);
  const displayName = (a: GLAccount): string => (lang === "en" && a.name_en ? a.name_en : a.name);
  const otherName = (a: GLAccount): string | null => {
    const o = lang === "en" ? (a.name_en ? a.name : null) : a.name_en || null;
    return o && o !== displayName(a) ? o : null;
  };

  const [filters, setFilters] = useState<ChartFilters>(DEFAULT_FILTERS);
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [sel, setSel] = useState<number | null>(null);
  const [edit, setEdit] = useState<Partial<GLAccount> | null>(null);
  const [balances, setBalances] = useState<Map<number, number> | null>(null);
  const [balBusy, setBalBusy] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const setPref = (p: Partial<Prefs>) => setPrefs((cur) => { const n = { ...cur, ...p }; savePrefs(n); return n; });
  const setF = (p: Partial<ChartFilters>) => setFilters((cur) => ({ ...cur, ...p }));

  const byId = useMemo(() => new Map(accounts.map((a) => [a.id, a] as const)), [accounts]);
  const children = useMemo(() => buildChildren(accounts), [accounts]);
  const depth = useMemo(() => depthMap(accounts), [accounts]);
  const maxDepth = useMemo(() => Math.max(1, ...Array.from(depth.values())), [depth]);
  const tokens = useMemo(() => queryTokens(filters.q), [filters.q]);
  const filtering = isFiltering(filters);

  // ── الأرصدة (تُحمَّل عند الطلب فقط: كل القيود المرحّلة حتى اليوم) ──
  const loadBalances = useCallback(async () => {
    setBalBusy(true);
    try {
      const es = await DB.fetchEntries(org.id, "1900-01-01", todayStr());
      const raw = new Map<number, { d: number; c: number }>();
      for (const e of es) {
        if ((e.status || "posted") !== "posted") continue;
        for (const l of e.lines || []) {
          const r = raw.get(l.account_id) ?? { d: 0, c: 0 };
          r.d += Number(l.debit) || 0; r.c += Number(l.credit) || 0; raw.set(l.account_id, r);
        }
      }
      setBalances(rollupBalances(accounts, raw));
    } finally { setBalBusy(false); }
  }, [org.id, accounts]);
  useEffect(() => { if (prefs.showBal) void loadBalances(); }, [prefs.showBal, loadBalances]);
  // دولة الشركة تحدّد دليل الحسابات الذي يُهيَّأ (الضرائب والتأمينات ونهاية الخدمة تختلف بين الدول)
  const [orgCountry, setOrgCountry] = useState<string | null>(null);
  useEffect(() => { let off = false; void fetchOrgConfig(org.id).then((c) => { if (!off) setOrgCountry(c.country || null); }); return () => { off = true; }; }, [org.id]);
  const cInfo = chartCountryInfo(orgCountry);
  const cName = lang === "ar" ? cInfo.ar : cInfo.en;
  const showBal = prefs.showBal && balances != null;

  // ── الصفوف المعروضة ──
  const vis = useMemo(() => (filtering ? computeVisibility(accounts, filters, balances) : null), [accounts, filters, balances, filtering]);
  const rows: Row[] = useMemo(
    () => (prefs.view === "flat" ? flattenFlat(accounts, vis ?? { matches: new Set(accounts.map((a) => a.id)), visible: new Set() }) : flattenTree(children, vis, collapsed)),
    [prefs.view, accounts, vis, children, collapsed],
  );
  const matchCount = vis ? vis.matches.size : accounts.length;

  useEffect(() => { // الصف المحدد يبقى ضمن القائمة
    if (!rows.length) { setSel(null); return; }
    if (sel == null || !rows.some((r) => r.acc.id === sel)) setSel(rows[0].acc.id);
  }, [rows, sel]);
  useEffect(() => { listRef.current?.querySelector<HTMLElement>('[data-sel="1"]')?.scrollIntoView({ block: "nearest" }); }, [sel]);

  // ── مؤشرات ──
  const kpi = useMemo(() => {
    const total = accounts.length; const groups = accounts.filter((a) => a.is_group).length;
    const inactive = accounts.filter((a) => !a.is_active).length;
    const perType = TYPE_OPTS.map((x) => ({ x, n: accounts.filter((a) => a.type === x).length }));
    return { total, groups, posting: total - groups, inactive, perType, types: perType.filter((p) => p.n > 0).length };
  }, [accounts]);

  // ── العمليات ──
  const openNew = (parentId: number | null) => {
    const p = parentId != null ? byId.get(parentId) : undefined;
    setEdit({ parent_id: parentId, type: p?.type ?? "asset", is_group: false, is_active: true, code: nextChildCode(accounts, parentId), name: "", name_en: "" });
  };
  const saveAcc = async () => {
    if (!edit) return;
    const code = (edit.code || "").trim(); const name = (edit.name || "").trim();
    if (!code) { alert(t("Enter the account code", "أدخل كود الحساب")); return; }
    if (!name) { alert(t("Enter the account name", "أدخل اسم الحساب")); return; }
    if (accounts.some((a) => a.code === code && a.id !== edit.id)) { alert(t(`Code ${code} already exists`, `الكود ${code} مستخدم مسبقًا`)); return; }
    const payload: Partial<GLAccount> & { organization_id: number } = {
      organization_id: org.id, code, name, name_en: (edit.name_en || "").trim() || null,
      type: edit.type || "asset", is_group: !!edit.is_group, is_active: edit.is_active !== false, parent_id: edit.parent_id ?? null,
    };
    if (edit.id) payload.id = edit.id;
    setBusy(true);
    const r = await DB.upsertAccount(payload);
    setBusy(false);
    if (!r.ok) { alert(t("Save failed: ", "تعذّر الحفظ: ") + (r.error || "")); return; }
    setEdit(null);
    await reload();
  };
  const del = async (a: GLAccount) => {
    if ((children.get(a.id) || []).length > 0) { alert(t("This account has sub-accounts; delete or move them first.", "هذا الحساب يحتوي على حسابات فرعية؛ احذفها أو انقلها أولًا.")); return; }
    if (!window.confirm(t(`Delete account "${a.code} - ${displayName(a)}"?`, `حذف الحساب «${a.code} - ${a.name}»؟`))) return;
    const r = await DB.deleteAccount(a.id);
    if (!r.ok) { alert(t("Could not delete (the account may have transactions): ", "تعذّر الحذف (قد يحتوي على حركات): ") + (r.error || "")); return; }
    await reload();
  };
  const seed = async () => {
    if (orgCountry == null) return; // لم تُحمَّل دولة الشركة بعد
    const n = DB.chartForCountry(orgCountry).length;
    const msg = cInfo.supported
      ? t(`Initialize the standard chart of accounts for ${cName} (${n} accounts)? Existing codes are kept.`, `تهيئة دليل الحسابات القياسي لدولة ${cName} (${n} حساب)؟ الأكواد الموجودة تبقى كما هي.`)
      : t(`The company country (${cInfo.code}) has no dedicated chart yet. Initialize the general chart (${n} accounts)? Existing codes are kept.`, `دولة الشركة (${cInfo.code}) ليس لها دليل مخصّص بعد. تهيئة الدليل العام (${n} حساب)؟ الأكواد الموجودة تبقى كما هي.`);
    if (!window.confirm(msg)) return;
    setBusy(true); const r = await DB.seedStandardChart(org.id, orgCountry); setBusy(false);
    if (!r.ok) { alert(t("Initialization failed: ", "تعذّرت التهيئة: ") + (r.error || "")); return; }
    await reload(); alert(t(`✓ ${r.added} accounts added`, `✓ تم إضافة ${r.added} حساب`) + (r.linked ? t(` · ${r.linked} account links set automatically`, ` · وتم ربط ${r.linked} إعدادًا تلقائيًا (المبيعات/الضريبة/المخزون/التكلفة)`) : "") + (r.linkError ? t(` · Auto-link incomplete: ${r.linkError} — use Branch settings → Accounting link`, ` · تعذّر إكمال الربط التلقائي: ${r.linkError} — استخدم إعدادات الفرع ← الربط المحاسبي`) : ""));
  };

  // ── Excel ──
  const typeFromLabel = (s: string): AccType | null => {
    const x = (s || "").trim().toLowerCase();
    if (/أصول|اصول|asset/.test(x)) return "asset";
    if (/خصوم|التزام|liab/.test(x)) return "liability";
    if (/ملكية|حقوق|equity/.test(x)) return "equity";
    if (/إيراد|ايراد|revenue|income/.test(x)) return "revenue";
    if (/مصروف|expense/.test(x)) return "expense";
    return null;
  };
  const pick = (r: Record<string, unknown>, keys: string[]): unknown => { for (const k of keys) if (r[k] !== undefined && r[k] !== "") return r[k]; return ""; };
  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["الكود", "اسم الحساب", "النوع", "كود الأب", "تجميعي"],
      ["1", "الأصول", "أصول", "", "نعم"], ["11", "الأصول المتداولة", "أصول", "1", "نعم"], ["1101", "الصندوق", "أصول", "11", "لا"],
      ["4101", "المبيعات", "إيرادات", "", "لا"], ["5201", "الرواتب والأجور", "مصروفات", "", "لا"],
    ]);
    ws["!cols"] = [{ wch: 10 }, { wch: 28 }, { wch: 14 }, { wch: 10 }, { wch: 8 }];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "دليل الحسابات");
    XLSX.writeFile(wb, "نموذج_دليل_الحسابات.xlsx");
  };
  const importFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const wb = XLSX.read(new Uint8Array(ev.target!.result as ArrayBuffer), { type: "array" });
        const rws = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: "" });
        const mapped: DB.ImportAccRow[] = []; const errs: string[] = [];
        rws.forEach((r, i) => {
          const code = String(pick(r, ["الكود", "الكود المحاسبي", "Code", "code"])).trim();
          const name = String(pick(r, ["اسم الحساب", "الاسم", "Name", "name"])).trim();
          if (!code && !name) return;
          const type = typeFromLabel(String(pick(r, ["النوع", "Type", "type"])));
          const parent = String(pick(r, ["كود الأب", "الأب", "Parent", "parent"])).trim();
          const grp = String(pick(r, ["تجميعي", "مجموعة", "Group", "is_group"])).trim().toLowerCase();
          if (!code) { errs.push(t(`Row ${i + 2}: missing code`, `صف ${i + 2}: كود ناقص`)); return; }
          if (!name) { errs.push(t(`Row ${i + 2}: missing name`, `صف ${i + 2}: اسم ناقص`)); return; }
          if (!type) { errs.push(t(`Row ${i + 2}: unknown type`, `صف ${i + 2}: نوع غير معروف`)); return; }
          mapped.push({ code, name, type, parent: parent || null, is_group: /نعم|yes|true|^1$|^y$/.test(grp) });
        });
        if (errs.length) { alert(t("Import failed:\n", "تعذّر الاستيراد:\n") + errs.slice(0, 12).join("\n")); return; }
        if (!mapped.length) { alert(t("No valid accounts found. Check the column names in the template.", "لم يتم العثور على حسابات صالحة. تأكد من أسماء الأعمدة في النموذج.")); return; }
        setBusy(true); const res = await DB.importChart(org.id, mapped); setBusy(false);
        if (!res.ok) { alert(t("Save failed: ", "تعذّر الحفظ: ") + (res.error || "")); return; }
        await reload();
        alert(t(`✓ ${res.added} accounts added${res.skipped ? ` · ${res.skipped} already existed` : ""}`, `✓ تم إضافة ${res.added} حساب${res.skipped ? ` · تخطّي ${res.skipped} موجود مسبقًا` : ""}`));
      } catch { alert(t("Could not read the file. Use the Excel template.", "تعذّر قراءة الملف. استخدم نموذج الإكسيل المرفق.")); }
    };
    reader.readAsArrayBuffer(file);
  };
  const exportChart = () => {
    const aoa: (string | number)[][] = [["الكود", "اسم الحساب", "النوع", "كود الأب", "تجميعي", "الاسم الإنجليزي"]];
    [...accounts].sort((a, b) => a.code.localeCompare(b.code, "en", { numeric: true })).forEach((a) => {
      aoa.push([a.code, a.name, DB.TYPE_LABEL[a.type], a.parent_id ? byId.get(a.parent_id)?.code || "" : "", a.is_group ? "نعم" : "لا", a.name_en || ""]);
    });
    const ws = XLSX.utils.aoa_to_sheet(aoa); ws["!cols"] = [{ wch: 10 }, { wch: 28 }, { wch: 14 }, { wch: 10 }, { wch: 8 }, { wch: 28 }];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "دليل الحسابات");
    XLSX.writeFile(wb, "دليل_الحسابات.xlsx");
  };

  const printChart = () => {
    const sorted = [...accounts].sort((a, b) => a.code.localeCompare(b.code, "en", { numeric: true }));
    const withBal = showBal && balances != null;
    const cols: ReportCol[] = [{ label: t("Code", "الكود"), mono: true }, { label: t("Account", "اسم الحساب") }, { label: t("Type", "النوع") }, { label: t("Parent", "كود الأب"), mono: true }, { label: t("Group", "تجميعي"), align: "center" }];
    if (withBal) cols.push({ label: t("Balance", "الرصيد"), mono: true, align: "end" });
    const rows = sorted.map((a) => {
      const r: (string | number)[] = [a.code, lang === "en" && a.name_en ? a.name_en : a.name, DB.TYPE_LABEL[a.type], a.parent_id ? byId.get(a.parent_id)?.code || "" : "", a.is_group ? t("Yes", "نعم") : t("No", "لا")];
      if (withBal) r.push(balances!.get(a.id) ?? 0);
      return r;
    });
    const ok = openPrint(buildReportHTML({ title: t("Chart of accounts", "دليل الحسابات"), subtitle: `${t("Accounts", "عدد الحسابات")}: ${sorted.length}`, orgName: shop?.shop_name || org.name, taxNumber: shop?.tax_number, logoUrl: shop?.logo_url, address: shop?.address, dir: isRTL ? "rtl" : "ltr", lang: lang === "en" ? "en" : "ar", cols, rows }));
    if (!ok) alert(t("Allow pop-ups to print.", "فعّل النوافذ المنبثقة للطباعة."));
  };

  // ── لوحة المفاتيح ──
  const moveSel = (delta: number) => {
    if (!rows.length) return;
    const i = rows.findIndex((r) => r.acc.id === sel);
    const n = Math.min(Math.max((i < 0 ? 0 : i) + delta, 0), rows.length - 1);
    setSel(rows[n].acc.id);
  };
  const toggleNode = (id: number) => setCollapsed((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const onKey = useCallback((e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement | null)?.tagName;
    const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
    if (edit) { if (e.key === "Escape") { e.preventDefault(); setEdit(null); } return; }
    if (e.key === "/" && !typing) { e.preventDefault(); searchRef.current?.focus(); searchRef.current?.select(); return; }
    if (e.key === "Escape") {
      if (filters.q) { e.preventDefault(); setF({ q: "" }); } else if (document.activeElement === searchRef.current) searchRef.current?.blur();
      return;
    }
    if (typing && e.target !== searchRef.current) return;
    if (e.key === "ArrowDown") { e.preventDefault(); moveSel(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); moveSel(-1); }
    else if (e.key === "Enter" && sel != null) { const a = byId.get(sel); if (a && (!typing || e.target === searchRef.current)) { e.preventDefault(); setEdit({ ...a }); } }
    else if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && !typing && sel != null && !filtering && prefs.view === "tree") {
      const open = isRTL ? "ArrowLeft" : "ArrowRight";
      const hasKids = (children.get(sel) || []).length > 0;
      if (hasKids) { e.preventDefault(); setCollapsed((cur) => { const n = new Set(cur); if (e.key === open) n.delete(sel); else n.add(sel); return n; }); }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edit, filters.q, sel, rows, byId, children, filtering, prefs.view, isRTL]);
  useEffect(() => { window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [onKey]);

  // ── عرض ──
  const Hl = ({ text }: { text: string }) => (
    <>{splitHighlight(text, tokens).map((p, i) => (p.hit ? <mark key={i} className="bg-amber-400/30 text-inherit rounded px-0.5">{p.s}</mark> : <span key={i}>{p.s}</span>))}</>
  );
  const Caret = isRTL ? ChevronLeft : ChevronRight;
  const parentOptions = useMemo(() => {
    const banned = edit?.id ? new Set<number>([edit.id, ...descendantsOf(edit.id, children)]) : new Set<number>();
    return accounts.filter((a) => a.is_group && !banned.has(a.id)).sort((x, y) => x.code.localeCompare(y.code, "en", { numeric: true }));
  }, [accounts, edit?.id, children]);

  const gridCols = showBal ? "grid-cols-[minmax(0,1fr)_7rem_6rem_9rem_auto]" : "grid-cols-[minmax(0,1fr)_7rem_6rem_auto]";

  return (
    <div dir={dir} data-testid="chart-tab">
      {/* المؤشرات */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-3" data-testid="chart-kpis">
        {[
          { k: "total", label: t("Total accounts", "إجمالي الحسابات"), v: kpi.total, tone: "text-blue-300" },
          { k: "posting", label: t("Posting accounts", "حسابات حركة"), v: kpi.posting, tone: "text-emerald-400" },
          { k: "groups", label: t("Group accounts", "حسابات رئيسية"), v: kpi.groups, tone: "text-amber-300" },
          { k: "types", label: t("Account types", "أنواع الحسابات"), v: kpi.types, tone: "text-violet-300" },
        ].map((c) => (
          <div key={c.k} className={`${CARD} p-3`}><div className="text-[11px] font-bold text-slate-500">{c.label}</div><div className={`text-2xl font-black mt-1 ${c.tone}`} data-testid={`kpi-${c.k}`}>{c.v}</div></div>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5 mb-3" data-testid="type-chips">
        {kpi.perType.map(({ x, n }) => (
          <button key={x} type="button" onClick={() => setF({ type: filters.type === x ? "all" : x })} data-testid={`chip-${x}`} aria-pressed={filters.type === x}
            className={`px-3 py-1 rounded-full text-[11px] font-bold border transition-colors ${filters.type === x ? "bg-blue-600 border-blue-500 text-[#fff]" : `${TYPE_TONE[x]} border-transparent hover:border-slate-600`}`}>
            {typeLabel(x)} · {n}
          </button>
        ))}
        {kpi.inactive > 0 && <span className="px-3 py-1 rounded-full text-[11px] font-bold bg-red-500/10 text-red-400">{t("Inactive", "موقوف")} · {kpi.inactive}</span>}
      </div>

      {/* الأدوات */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button onClick={() => openNew(null)} className={BTN_GHOST_EM} data-testid="new-account"><Plus size={14} /> {t("New account", "حساب جديد")}</button>
        <button data-testid="chart-seed" onClick={seed} disabled={busy || orgCountry == null} className={BTN_PRIMARY}><Network size={14} /> {busy ? "…" : accounts.length > 0 ? t("Add missing standard accounts & auto-link", "إضافة المفقود من الدليل القياسي + الربط التلقائي") : cInfo.supported ? t(`Initialize ${cName} standard chart`, `تهيئة دليل ${cName} القياسي`) : t("Initialize general chart", "تهيئة الدليل العام")}</button>
        <button onClick={downloadTemplate} className={BTN_SOFT}><Download size={14} /> {t("Excel template", "نموذج Excel")}</button>
        <button onClick={() => fileRef.current?.click()} disabled={busy} className={BTN_GHOST_BL}><Upload size={14} /> {t("Import chart", "رفع دليل حسابات")}</button>
        {accounts.length > 0 && <button onClick={exportChart} data-testid="export-chart" className={BTN_GHOST_EM}><Download size={14} /> {t("Export chart", "تصدير الدليل")}</button>}
        {accounts.length > 0 && <button onClick={printChart} data-testid="print-chart" className={BTN_GHOST_EM}><Printer size={14} /> {t("Print", "طباعة")}</button>}
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ""; }} />
        <button onClick={() => setShowKeys((v) => !v)} className={`${BTN_SOFT} ms-auto`} data-testid="chart-keys-toggle"><Keyboard size={14} /> {t("Shortcuts", "الاختصارات")}</button>
      </div>
      {showKeys && (
        <div className={`${CARD} p-3 mb-3 text-xs text-slate-300 flex flex-wrap gap-x-5 gap-y-1`} data-testid="chart-keys-help">
          <span><span className={KBD}>/</span> {t("search", "بحث")}</span><span><span className={KBD}>↑ ↓</span> {t("move", "تنقل")}</span>
          <span><span className={KBD}>Enter</span> {t("edit", "تعديل")}</span><span><span className={KBD}>{isRTL ? "←" : "→"}</span> {t("expand", "فتح")} · <span className={KBD}>{isRTL ? "→" : "←"}</span> {t("collapse", "طي")}</span>
          <span><span className={KBD}>Esc</span> {t("clear / close", "مسح / إغلاق")}</span>
        </div>
      )}

      {/* البحث المتقدم */}
      <div className={`${CARD} p-3 mb-3`} data-testid="chart-filters">
        <div className="relative mb-2.5">
          <Search size={16} className="absolute top-1/2 -translate-y-1/2 start-3 text-slate-500" />
          <input ref={searchRef} value={filters.q} onChange={(e) => setF({ q: e.target.value })} data-testid="chart-search"
            placeholder={t("/ · Search by code or name (Arabic/English) — words are combined", "/ · ابحث بالكود أو الاسم (عربي/إنجليزي) — الكلمات تُدمج معًا")} className={`${INPUT} ps-9 pe-9`} />
          {filters.q && <button type="button" onClick={() => setF({ q: "" })} aria-label={t("Clear", "مسح")} className="absolute top-1/2 -translate-y-1/2 end-2 text-slate-500 hover:text-white"><X size={15} /></button>}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5 items-end">
          <div><label className={LABEL}>{t("Type", "النوع")}</label>
            <select value={filters.type} onChange={(e) => setF({ type: e.target.value as ChartFilters["type"] })} className={SELECT} data-testid="f-type">
              <option value="all">{t("All types", "كل الأنواع")}</option>{TYPE_OPTS.map((x) => <option key={x} value={x}>{typeLabel(x)}</option>)}
            </select></div>
          <div><label className={LABEL}>{t("Kind", "الطبيعة")}</label>
            <select value={filters.kind} onChange={(e) => setF({ kind: e.target.value as ChartFilters["kind"] })} className={SELECT} data-testid="f-kind">
              <option value="all">{t("All", "الكل")}</option><option value="group">{t("Group (parent)", "رئيسي (تجميعي)")}</option><option value="posting">{t("Posting (leaf)", "فرعي (حركة)")}</option>
            </select></div>
          <div><label className={LABEL}>{t("Status", "الحالة")}</label>
            <select value={filters.status} onChange={(e) => setF({ status: e.target.value as ChartFilters["status"] })} className={SELECT} data-testid="f-status">
              <option value="all">{t("All", "الكل")}</option><option value="active">{t("Active", "نشط")}</option><option value="inactive">{t("Inactive", "موقوف")}</option>
            </select></div>
          <div><label className={LABEL}>{t("Level", "المستوى")}</label>
            <select value={filters.level} onChange={(e) => setF({ level: Number(e.target.value) })} className={SELECT} data-testid="f-level">
              <option value={0}>{t("All levels", "كل المستويات")}</option>{Array.from({ length: maxDepth }, (_, i) => <option key={i + 1} value={i + 1}>{t(`Level ${i + 1}`, `المستوى ${i + 1}`)}</option>)}
            </select></div>
          <div><label className={LABEL}>{t("Balance", "الرصيد")}</label>
            <select value={filters.balance} onChange={(e) => { const v = e.target.value as ChartFilters["balance"]; setF({ balance: v }); if (v !== "all" && !prefs.showBal) setPref({ showBal: true }); }} className={SELECT} data-testid="f-balance">
              <option value="all">{t("Any", "أي رصيد")}</option><option value="nonzero">{t("Non-zero", "غير صفري")}</option><option value="zero">{t("Zero", "صفري")}</option>
            </select></div>
          <div className="flex gap-1.5">
            <button type="button" onClick={() => setFilters(DEFAULT_FILTERS)} disabled={!filtering} className={`${BTN_SOFT} flex-1`} data-testid="f-reset"><RotateCcw size={13} /> {t("Reset", "إعادة ضبط")}</button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-2.5 text-[11px] text-slate-500">
          <span data-testid="result-count">{filtering ? t(`${matchCount} of ${accounts.length} accounts match`, `${matchCount} من ${accounts.length} حساب مطابق`) : t(`${accounts.length} accounts`, `${accounts.length} حساب`)}</span>
          <span className="ms-auto flex items-center gap-1.5">
            <button type="button" onClick={() => setPref({ view: "tree" })} aria-pressed={prefs.view === "tree"} data-testid="view-tree" className={`${BTN_SOFT} !py-1.5 ${prefs.view === "tree" ? "!bg-blue-600 !text-[#fff]" : ""}`}><ListTree size={13} /> {t("Tree", "شجرة")}</button>
            <button type="button" onClick={() => setPref({ view: "flat" })} aria-pressed={prefs.view === "flat"} data-testid="view-flat" className={`${BTN_SOFT} !py-1.5 ${prefs.view === "flat" ? "!bg-blue-600 !text-[#fff]" : ""}`}><List size={13} /> {t("List", "قائمة")}</button>
            {prefs.view === "tree" && !filtering && (<>
              <button type="button" onClick={() => setCollapsed(new Set())} className={`${BTN_SOFT} !py-1.5`} data-testid="expand-all">{t("Expand all", "فتح الكل")}</button>
              <button type="button" onClick={() => setCollapsed(new Set(accounts.filter((a) => (children.get(a.id) || []).length > 0).map((a) => a.id)))} className={`${BTN_SOFT} !py-1.5`} data-testid="collapse-all">{t("Collapse all", "طي الكل")}</button>
            </>)}
            <button type="button" onClick={() => setPref({ showBal: !prefs.showBal })} aria-pressed={prefs.showBal} data-testid="toggle-balances" className={`${BTN_SOFT} !py-1.5 ${prefs.showBal ? "!bg-blue-600 !text-[#fff]" : ""}`}><Scale size={13} /> {balBusy ? "…" : t("Balances", "الأرصدة")}</button>
          </span>
        </div>
      </div>

      {/* الجدول */}
      {accounts.length === 0 ? (
        <div className={`${CARD} p-10 text-center text-slate-500 text-sm`}>{t("No accounts yet. Start with the “Initialize standard chart” button (matched to your company country), then edit as needed.", "لا توجد حسابات بعد. ابدأ بزر «تهيئة الدليل القياسي» (يُطابق دولة شركتك) ثم عدّله كما تريد.")}</div>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className={`grid ${gridCols} gap-3 px-3 py-2 text-[10px] font-bold text-slate-400 bg-slate-800/60`}>
            <span>{t("Account", "الحساب")}</span><span>{t("Type", "النوع")}</span><span>{t("Kind", "الطبيعة")}</span>
            {showBal && <span className="text-end">{t(`Balance (${curEn()})`, `الرصيد (${curAr()})`)}</span>}<span className="w-24" />
          </div>
          <div ref={listRef} className="max-h-[60vh] overflow-auto" data-testid="chart-rows" role="listbox">
            {rows.length === 0 && <div className="px-4 py-8 text-center text-sm text-slate-500" data-testid="chart-empty">{t("No accounts match the search or filters", "لا توجد حسابات مطابقة للبحث أو المرشحات")}</div>}
            {rows.map(({ acc: a, depth: d, hasKids, match }) => {
              const bal = balances?.get(a.id);
              const isSel = sel === a.id;
              const other = otherName(a);
              return (
                <div key={a.id} role="option" aria-selected={isSel} data-sel={isSel ? "1" : undefined} data-testid="chart-row" data-code={a.code}
                  onClick={() => setSel(a.id)} onDoubleClick={() => setEdit({ ...a })}
                  className={`group grid ${gridCols} gap-3 items-center px-3 py-2 border-b border-slate-800 cursor-default ${isSel ? "bg-blue-600/15" : "hover:bg-white/[0.03]"} ${match ? "" : "opacity-55"}`}>
                  <span className="flex items-center gap-2 min-w-0" style={{ paddingInlineStart: d * 20 }}>
                    {prefs.view === "tree" && hasKids && !filtering
                      ? <button type="button" aria-label={t("Toggle", "طي/فتح")} onClick={(ev) => { ev.stopPropagation(); toggleNode(a.id); }} data-testid="toggle-node" className="text-slate-400 hover:text-white shrink-0">{collapsed.has(a.id) ? <Caret size={14} /> : <ChevronDown size={14} />}</button>
                      : <span className="w-[14px] shrink-0" />}
                    {a.is_group && <Layers size={13} className="text-blue-400/70 shrink-0" />}
                    <span className={`font-mono text-xs shrink-0 ${a.is_group ? "text-blue-300 font-bold" : "text-slate-400"}`} dir="ltr"><Hl text={a.code} /></span>
                    <span className={`text-sm truncate ${a.is_group ? "text-white font-bold" : "text-slate-200"}`}><Hl text={displayName(a)} />
                      {other && <span className="ms-2 text-[11px] font-normal text-slate-500"><Hl text={other} /></span>}</span>
                    {!a.is_active && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400 shrink-0">{t("Inactive", "موقوف")}</span>}
                  </span>
                  <span><span className={`text-[10px] px-2 py-0.5 rounded-full ${TYPE_TONE[a.type]}`}>{typeLabel(a.type)}</span></span>
                  <span><span className={`text-[10px] px-2 py-0.5 rounded-full ${a.is_group ? "bg-blue-500/15 text-blue-300" : "bg-slate-700/40 text-slate-400"}`}>{a.is_group ? t("Group", "رئيسي") : t("Posting", "فرعي")}</span></span>
                  {showBal && <span className={`text-end font-mono text-xs ${bal != null && bal < 0 ? "text-red-400" : "text-slate-200"}`} dir="ltr" data-testid="row-balance">{bal == null ? "—" : money(bal)}</span>}
                  <span className="flex items-center gap-1 w-24 justify-end opacity-60 group-hover:opacity-100 transition-opacity">
                    {a.is_group && <button onClick={(ev) => { ev.stopPropagation(); openNew(a.id); }} title={t("Add sub-account", "إضافة حساب فرعي")} data-testid="add-child" className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center hover:bg-emerald-500/20"><Plus size={13} /></button>}
                    <button onClick={(ev) => { ev.stopPropagation(); setEdit({ ...a }); }} title={t("Edit", "تعديل")} data-testid="edit-row" className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-300 flex items-center justify-center hover:bg-blue-500/20"><Pencil size={13} /></button>
                    <button onClick={(ev) => { ev.stopPropagation(); void del(a); }} title={t("Delete", "حذف")} data-testid="del-row" className="w-7 h-7 rounded-lg bg-red-500/10 text-red-400 flex items-center justify-center hover:bg-red-500/20"><Trash2 size={13} /></button>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* نموذج الحساب */}
      {edit && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" dir={dir} data-testid="account-modal">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-5 shadow-2xl">
            <h3 className="text-white font-bold text-base mb-4">{edit.id ? t("Edit account", "تعديل حساب") : t("New account", "حساب جديد")}</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className={LABEL}>{t("Code", "الكود")}</label><input value={edit.code || ""} onChange={(e) => setEdit({ ...edit, code: e.target.value })} className={`${INPUT} [direction:ltr]`} data-testid="m-code" /></div>
                <div><label className={LABEL}>{t("Type", "النوع")}</label>
                  <select value={edit.type || "asset"} onChange={(e) => setEdit({ ...edit, type: e.target.value as AccType })} className={SELECT} data-testid="m-type">{TYPE_OPTS.map((x) => <option key={x} value={x}>{typeLabel(x)}</option>)}</select></div>
              </div>
              <div><label className={LABEL}>{t("Account name (Arabic)", "اسم الحساب (عربي)")}</label><input value={edit.name || ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} className={INPUT} data-testid="m-name" /></div>
              <div><label className={LABEL}>{t("Account name (English)", "اسم الحساب (إنجليزي)")}</label><input value={edit.name_en || ""} onChange={(e) => setEdit({ ...edit, name_en: e.target.value })} className={INPUT} dir="ltr" data-testid="m-name-en" /></div>
              <div><label className={LABEL}>{t("Parent account", "الحساب الأب")}</label>
                <select value={edit.parent_id ?? ""} data-testid="m-parent" className={SELECT}
                  onChange={(e) => {
                    const pid = e.target.value ? Number(e.target.value) : null;
                    const patch: Partial<GLAccount> = { ...edit, parent_id: pid };
                    if (!edit.id) { patch.code = nextChildCode(accounts, pid); const p = pid != null ? byId.get(pid) : undefined; if (p) patch.type = p.type; }
                    setEdit(patch);
                  }}>
                  <option value="">{t("— Root account —", "— حساب رئيسي (جذر) —")}</option>
                  {parentOptions.map((p) => <option key={p.id} value={p.id}>{p.code} — {displayName(p)}</option>)}
                </select></div>
              <div className="flex items-center gap-4 flex-wrap">
                <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={!!edit.is_group} onChange={(e) => setEdit({ ...edit, is_group: e.target.checked })} className="w-4 h-4 accent-blue-500" data-testid="m-group" /> {t("Group account (no direct postings)", "حساب تجميعي (لا يُرحَّل عليه مباشرة)")}</label>
                <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={edit.is_active !== false} onChange={(e) => setEdit({ ...edit, is_active: e.target.checked })} className="w-4 h-4 accent-blue-500" data-testid="m-active" /> {t("Active", "نشط")}</label>
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-5">
              <button onClick={() => setEdit(null)} className={BTN_SOFT}><X size={14} /> {t("Cancel", "إلغاء")}</button>
              <button onClick={() => void saveAcc()} disabled={busy} className={BTN_SUCCESS} data-testid="m-save"><Save size={15} /> {busy ? "…" : t("Save", "حفظ")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
