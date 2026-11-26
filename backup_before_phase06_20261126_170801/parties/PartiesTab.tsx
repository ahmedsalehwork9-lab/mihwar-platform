// =============================================================
// src/pages/accounting/parties/PartiesTab.tsx
// العملاء والموردون — مؤشرات + توزيع أعمار الدين + بحث متقدم وترتيب + كشف الطرف،
// ثنائي اللغة (RTL/LTR) وتنقّل بلوحة المفاتيح. الأرصدة من القيود المرحّلة فقط.
// يحافظ على: إضافة/تعديل/حذف الأطراف، الأطراف الفرعية، مدة السداد، كشف الطرف والطباعة.
// =============================================================
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { ArrowDownUp, Download, FileText, Keyboard, Pencil, Plus, Printer, RotateCcw, Save, Search, Trash2, Users, X } from "lucide-react";
import * as DB from "../../lib/accountingDb";
import type { GLAccount, GLParty, LedgerLine } from "../../lib/accountingDb";
import { useLang } from "../../../context/LanguageContext";
import { normalizeText, splitHighlight } from "../chart/chartLogic";
import AccountCombo from "../ledger/AccountCombo";
import { ENTRY_TYPE_EN, jvLabel } from "../ledger/ledgerLogic";
import {
  BUCKETS, DEFAULT_PARTY_FILTERS, agingShares, buildPartyRows, filterParties, isPartyFiltering, partyStatement, totalsOf,
  type Bucket, type PartyFilters, type SortKey,
} from "./partiesLogic";
import type { PrintStatementFn } from "../ledger/LedgerTab";

const CARD = "bg-slate-900 border border-slate-800 rounded-2xl";
const INPUT = "w-full bg-slate-950 border border-slate-700 rounded-xl text-white px-3 py-2 text-sm outline-none focus:border-blue-500 transition-colors";
const DATE = INPUT + " [color-scheme:dark]";
const LABEL = "text-[10px] text-slate-500 font-bold mb-1 block";
const BTN_SOFT = "inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 hover:text-white font-bold text-xs transition-colors disabled:opacity-50";
const BTN_GHOST_EM = "inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold text-xs transition-colors disabled:opacity-50";
const BTN_SUCCESS = "inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-emerald-950 font-extrabold text-sm transition-colors disabled:opacity-50";
const KBD = "px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] font-mono text-slate-300";
const BUCKET_TONE: Record<Bucket, string> = { current: "bg-emerald-500", d30: "bg-sky-500", d60: "bg-amber-400", d90: "bg-orange-500", d90p: "bg-red-500" };

const todayStr = (): string => new Date().toISOString().slice(0, 10);
const fmt = (n: number): string => (Math.round(n * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Branch = { id: number; name: string };
type Props = {
  org: { id: number; name: string }; accounts: GLAccount[]; postable: GLAccount[]; accById: Map<number, GLAccount>;
  branches: Branch[] | undefined; shop: unknown; printStatement: PrintStatementFn;
};
type Stmt = { party: GLParty; lines: LedgerLine[]; loading: boolean };

export default function PartiesTab({ org, postable, accById, branches, shop, printStatement }: Props) {
  const { t, lang, isRTL } = useLang();
  const dir = isRTL ? "rtl" : "ltr";
  const multiBranch = !!branches && branches.length > 1;

  const [ptype, setPtype] = useState<"customer" | "supplier">("customer");
  const [asOf, setAsOf] = useState(todayStr);
  const [fBranch, setFBranch] = useState("");
  const [parties, setParties] = useState<GLParty[]>([]);
  const [lines, setLines] = useState<LedgerLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<PartyFilters>(DEFAULT_PARTY_FILTERS);
  const [sel, setSel] = useState<number | null>(null);
  const [edit, setEdit] = useState<Partial<GLParty> | null>(null);
  const [busy, setBusy] = useState(false);
  const [stmt, setStmt] = useState<Stmt | null>(null);
  const [showKeys, setShowKeys] = useState(false);
  const seq = useRef(0);
  const stmtSeq = useRef(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const setF = (p: Partial<PartyFilters>) => setFilters((c) => ({ ...c, ...p }));

  const nameOf = useCallback((a: GLAccount | undefined): string => (!a ? "" : lang === "en" && a.name_en ? a.name_en : a.name), [lang]);
  const typeLabel = useCallback((k: string | null | undefined): string => { const key = k || "general"; return lang === "ar" ? DB.ENTRY_TYPE_LABEL[key] || key : ENTRY_TYPE_EN[key] || key; }, [lang]);
  const noun = ptype === "customer" ? t("customer", "عميل") : t("supplier", "مورد");

  const reload = useCallback(async () => {
    const my = ++seq.current;
    setLoading(true);
    try {
      const br = fBranch ? Number(fBranch) : null;
      const ps = await DB.fetchParties(org.id, ptype, br);
      const accIds = Array.from(new Set(ps.map((p) => p.account_id).filter((x): x is number => !!x)));
      const ls = accIds.length ? await DB.fetchLedgerMulti(org.id, accIds, "2000-01-01", asOf, br) : [];
      if (my !== seq.current) return;
      setParties(ps); setLines(ls);
    } finally { if (my === seq.current) setLoading(false); }
  }, [org.id, ptype, asOf, fBranch]);
  useEffect(() => { void reload(); }, [reload]);

  const rows = useMemo(() => buildPartyRows(parties, lines, asOf, DB.partyAging), [parties, lines, asOf]);
  const filtered = useMemo(() => filterParties(rows, filters, accById), [rows, filters, accById]);
  const all = useMemo(() => totalsOf(rows), [rows]);
  const shownTot = useMemo(() => totalsOf(filtered), [filtered]);
  const filtering = isPartyFiltering(filters);
  const shares = useMemo(() => agingShares(all), [all]);
  const tokens = useMemo(() => normalizeText(filters.q).split(/\s+/).filter(Boolean), [filters.q]);
  const parentName = (id: number | null): string => (id == null ? "" : parties.find((p) => p.id === id)?.name || "");
  const Hl = ({ text }: { text: string }) => (<>{splitHighlight(text, tokens).map((p, i) => (p.hit ? <mark key={i} className="bg-amber-400/30 text-inherit rounded px-0.5">{p.s}</mark> : <span key={i}>{p.s}</span>))}</>);
  const bucketLabel: Record<Bucket, string> = { current: t("Current", "جاري"), d30: "1-30", d60: "31-60", d90: "61-90", d90p: "+90" };

  useEffect(() => { if (!filtered.length) setSel(null); else if (sel == null || !filtered.some((r) => r.party.id === sel)) setSel(filtered[0].party.id); }, [filtered, sel]);
  useEffect(() => { bodyRef.current?.querySelector<HTMLElement>('[data-sel="1"]')?.scrollIntoView({ block: "nearest" }); }, [sel]);

  // ── العمليات ──
  const openStmt = useCallback(async (p: GLParty) => {
    const row = rows.find((r) => r.party.id === p.id);
    const acc = row?.holderAccId ?? null;
    if (!acc) { alert(t("This party has no receivable/payable account, and neither does its parent. Link an account or give it a parent that has one.", "هذا الطرف غير مرتبط بحساب ذمة، ولا مركزه. اربطه بحساب أو اجعل له أباً صاحب حساب.")); return; }
    const my = ++stmtSeq.current;
    setStmt({ party: p, lines: [], loading: true });
    const ls = await DB.fetchLedgerMulti(org.id, [acc], "2000-01-01", asOf, fBranch ? Number(fBranch) : null, p.account_id ? null : p.id);
    if (my === stmtSeq.current) setStmt({ party: p, lines: ls, loading: false });
  }, [rows, org.id, asOf, fBranch, t]);

  const saveP = async () => {
    if (!edit) return;
    const name = String(edit.name || "").trim();
    if (!name) { alert(t("Enter the party name", "أدخل اسم الطرف")); return; }
    const days = Number(edit.credit_days) || 0;
    if (days < 0) { alert(t("Credit days cannot be negative", "مدة السداد لا تكون سالبة")); return; }
    const type = edit.type || ptype;
    const dup = parties.find((p) => p.id !== edit.id && p.type === type && normalizeText(p.name) === normalizeText(name));
    if (dup) { alert(t(`A ${type === "customer" ? "customer" : "supplier"} named "${dup.name}" already exists`, `يوجد ${type === "customer" ? "عميل" : "مورد"} بنفس الاسم «${dup.name}»`)); return; }
    const payload: Partial<GLParty> = {
      organization_id: org.id, branch_id: edit.branch_id ?? (fBranch ? Number(fBranch) : null), type, name, account_id: edit.account_id ?? null,
      credit_days: days, phone: (edit.phone || "").trim() || null, address: (edit.address || "").trim() || null, tax_number: (edit.tax_number || "").trim() || null,
      parent_id: edit.parent_id ?? null, notes: (edit.notes || "").trim() || null, is_active: edit.is_active !== false,
    };
    if (edit.id) payload.id = edit.id;
    setBusy(true); const r = await DB.upsertParty(payload); setBusy(false);
    if (!r.ok) { alert(t("Save failed: ", "تعذّر الحفظ: ") + (r.error || "")); return; }
    setEdit(null); await reload();
  };
  const delP = async (p: GLParty) => {
    if (parties.some((x) => x.parent_id === p.id)) { alert(t("This party has sub-parties; delete or re-assign them first.", "لهذا الطرف أطراف فرعية؛ احذفها أو انقلها أولًا.")); return; }
    if (!window.confirm(t(`Delete "${p.name}"?`, `حذف «${p.name}»؟`))) return;
    const r = await DB.deleteParty(p.id);
    if (!r.ok) { alert(t("Delete failed: ", "تعذّر الحذف: ") + (r.error || "")); return; }
    await reload();
  };
  const closeStmt = useCallback(() => { stmtSeq.current++; setStmt(null); }, []);
  const newParty = () => setEdit({ type: ptype, credit_days: 0, is_active: true, name: "" });

  const exportList = () => {
    const head = [t("Party", "الطرف"), t("Phone", "الهاتف"), t("Tax no.", "الرقم الضريبي"), t("Account", "الحساب"), t("Credit days", "مدة السداد"), t("Balance", "الرصيد"), t("Current", "جاري"), "1-30", "31-60", "61-90", "+90", t("Last movement", "آخر حركة")];
    const body = filtered.map((r) => { const a = r.party.account_id ? accById.get(r.party.account_id) : undefined; const g = r.aging;
      return [r.party.name, r.party.phone || "", r.party.tax_number || "", a ? `${a.code} ${nameOf(a)}` : "", r.party.credit_days || 0, r.holderAccId != null ? r.balance : "", g?.current ?? "", g?.d30 ?? "", g?.d60 ?? "", g?.d90 ?? "", g?.d90p ?? "", r.lastDate || ""]; });
    const ws = XLSX.utils.aoa_to_sheet([[ptype === "customer" ? t("Customers", "العملاء") : t("Suppliers", "الموردون"), `${t("As of", "حتى")} ${asOf}`], [], head, ...body, [], [t("Totals", "الإجماليات"), "", "", "", "", shownTot.balance, shownTot.current, shownTot.d30, shownTot.d60, shownTot.d90, shownTot.d90p]]);
    ws["!cols"] = head.map((_, i) => ({ wch: i === 0 ? 30 : 14 }));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, ptype === "customer" ? "Customers" : "Suppliers");
    XLSX.writeFile(wb, `${ptype === "customer" ? "customers" : "suppliers"}_aging_${asOf}.xlsx`);
  };

  // ── لوحة المفاتيح ──
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      if (edit) { if (e.key === "Escape") { e.preventDefault(); setEdit(null); } return; }
      if (stmt) { if (e.key === "Escape") { e.preventDefault(); closeStmt(); } return; }
      if (e.key === "/" && !typing) { e.preventDefault(); searchRef.current?.focus(); searchRef.current?.select(); return; }
      if (e.key === "Escape" && e.target === searchRef.current) { e.preventDefault(); setF({ q: "" }); searchRef.current?.blur(); return; }
      if (typing && e.target !== searchRef.current) return;
      const i = filtered.findIndex((r) => r.party.id === sel);
      if (e.key === "ArrowDown") { e.preventDefault(); if (filtered.length) setSel(filtered[Math.min(i + 1, filtered.length - 1)].party.id); }
      else if (e.key === "ArrowUp") { e.preventDefault(); if (filtered.length) setSel(filtered[Math.max(i - 1, 0)].party.id); }
      else if (e.key === "Enter" && sel != null) { const r = filtered.find((x) => x.party.id === sel); if (r) { e.preventDefault(); void openStmt(r.party); } }
    };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [edit, stmt, filtered, sel, openStmt, closeStmt]);

  const th = "text-[10px] px-2 py-2.5 bg-slate-950 text-slate-400 whitespace-nowrap border-b border-slate-700 font-bold sticky top-0 z-10";
  const td = "px-2 py-2 text-xs border-b border-slate-800";
  const numCell = `${td} text-end font-mono`;
  const sortOptions: { k: SortKey; label: string }[] = [
    { k: "name", label: t("Name", "الاسم") }, { k: "balance", label: t("Balance", "الرصيد") }, { k: "overdue", label: t("Overdue", "المتأخر") },
    { k: "over90", label: t("Over 90 days", "أكثر من 90 يومًا") }, { k: "credit_days", label: t("Credit days", "مدة السداد") }, { k: "lastDate", label: t("Last movement", "آخر حركة") },
  ];
  const holdersList = parties.filter((p) => p.account_id && p.id !== edit?.id);

  return (
    <div dir={dir} data-testid="parties-tab">
      {/* الشريط العلوي */}
      <div className={`${CARD} p-3 mb-3`}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="inline-flex gap-1 bg-slate-950 border border-slate-800 rounded-xl p-1" role="tablist">
            {(["customer", "supplier"] as const).map((k) => (
              <button key={k} type="button" role="tab" aria-selected={ptype === k} data-testid={`ptype-${k}`} onClick={() => { setPtype(k); setFilters(DEFAULT_PARTY_FILTERS); }}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${ptype === k ? "bg-blue-600 text-[#fff]" : "text-slate-400 hover:text-slate-200"}`}>{k === "customer" ? t("Customers", "العملاء") : t("Suppliers", "الموردون")}</button>
            ))}
          </div>
          <div><label className={LABEL}>{t("Aging as of", "أعمار الدين حتى")}</label><input type="date" value={asOf} onChange={(e) => e.target.value && setAsOf(e.target.value)} className={DATE} data-testid="as-of" /></div>
          {multiBranch && <div><label className={LABEL}>{t("Branch", "الفرع")}</label>
            <select value={fBranch} onChange={(e) => setFBranch(e.target.value)} className={INPUT} data-testid="branch"><option value="">{t("All branches", "كل الفروع")}</option>{branches!.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>}
          <button type="button" onClick={newParty} className={BTN_GHOST_EM} data-testid="new-party"><Plus size={14} /> {t(`New ${noun}`, `${noun} جديد`)}</button>
          <button type="button" onClick={exportList} disabled={!filtered.length} className={BTN_SOFT} data-testid="export-list"><Download size={14} /> Excel</button>
          <button type="button" onClick={() => setShowKeys((v) => !v)} className={`${BTN_SOFT} ms-auto`} data-testid="parties-keys-toggle"><Keyboard size={14} /> {t("Shortcuts", "الاختصارات")}</button>
        </div>
        {showKeys && (
          <div className="mt-2 text-xs text-slate-300 flex flex-wrap gap-x-5 gap-y-1" data-testid="parties-keys-help">
            <span><span className={KBD}>/</span> {t("search", "بحث")}</span><span><span className={KBD}>↑ ↓</span> {t("move", "تنقل")}</span>
            <span><span className={KBD}>Enter</span> {t("open statement", "فتح الكشف")}</span><span><span className={KBD}>Esc</span> {t("clear / close", "مسح / إغلاق")}</span>
          </div>
        )}
      </div>

      {/* المؤشرات */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5 mb-3" data-testid="parties-kpis">
        <div className={`${CARD} p-3`}><div className="text-[11px] font-bold text-slate-500">{ptype === "customer" ? t("Customers", "عدد العملاء") : t("Suppliers", "عدد الموردين")}</div><div className="text-2xl font-black mt-1 text-blue-300" data-testid="kpi-count">{all.count}</div></div>
        <div className={`${CARD} p-3`}><div className="text-[11px] font-bold text-slate-500">{ptype === "customer" ? t("Total receivables", "إجمالي المستحق لنا") : t("Total payables", "إجمالي المستحق علينا")}</div><div className="text-lg font-black mt-1 font-mono text-emerald-300" dir="ltr" data-testid="kpi-balance">{fmt(all.balance)}</div></div>
        <div className={`${CARD} p-3`}><div className="text-[11px] font-bold text-slate-500">{t("Overdue", "المتأخر")}</div><div className="text-lg font-black mt-1 font-mono text-amber-300" dir="ltr" data-testid="kpi-overdue">{fmt(all.overdue)}</div></div>
        <div className={`${CARD} p-3`}><div className="text-[11px] font-bold text-slate-500">{t("Over 90 days", "أكثر من 90 يومًا")}</div><div className="text-lg font-black mt-1 font-mono text-red-400" dir="ltr" data-testid="kpi-over90">{fmt(all.d90p)}</div></div>
        <div className={`${CARD} p-3`}><div className="text-[11px] font-bold text-slate-500">{ptype === "customer" ? t("Customers in debt", "عملاء عليهم رصيد") : t("Suppliers owed", "موردون لهم رصيد")}</div><div className="text-2xl font-black mt-1 text-indigo-300" data-testid="kpi-indebt">{all.inDebt}</div>
          {all.noAccount > 0 && <div className="text-[10px] text-amber-400 mt-0.5" data-testid="kpi-noacc">{t(`${all.noAccount} without account`, `${all.noAccount} بدون حساب`)}</div>}</div>
      </div>

      {/* توزيع أعمار الدين */}
      <div className={`${CARD} p-3 mb-3`} data-testid="aging-bar">
        <div className="text-[11px] font-bold text-slate-500 mb-2">{t("Aging distribution", "توزيع أعمار الدين")}</div>
        <div className="flex h-3 rounded-full overflow-hidden bg-slate-800" role="img" aria-label={t("Aging distribution", "توزيع أعمار الدين")}>
          {shares.filter((s) => s.pct > 0).map((s) => <div key={s.key} className={BUCKET_TONE[s.key]} style={{ width: `${s.pct}%` }} data-testid={`bar-${s.key}`} />)}
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-[11px] text-slate-300">
          {BUCKETS.map((k) => (<span key={k} className="inline-flex items-center gap-1.5"><span className={`w-2.5 h-2.5 rounded-sm ${BUCKET_TONE[k]}`} />{bucketLabel[k]} <span className="font-mono text-slate-400" dir="ltr" data-testid={`ag-${k}`}>{fmt(all[k])}</span></span>))}
        </div>
      </div>

      {/* البحث والمرشحات */}
      <div className={`${CARD} p-3 mb-3`} data-testid="parties-filters">
        <div className="relative mb-2.5">
          <Search size={15} className="absolute top-1/2 -translate-y-1/2 start-3 text-slate-500" />
          <input ref={searchRef} value={filters.q} onChange={(e) => setF({ q: e.target.value })} data-testid="party-search" className={`${INPUT} ps-9 pe-9`}
            placeholder={t("/ · Search by name, phone, tax no., address, notes or account…", "/ · ابحث بالاسم أو الهاتف أو الرقم الضريبي أو العنوان أو الملاحظات أو الحساب…")} />
          {filters.q && <button type="button" aria-label={t("Clear", "مسح")} onClick={() => setF({ q: "" })} className="absolute top-1/2 -translate-y-1/2 end-2 text-slate-500 hover:text-white"><X size={14} /></button>}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5 items-end">
          <div><label className={LABEL}>{t("Balance", "الرصيد")}</label>
            <select value={filters.balance} onChange={(e) => setF({ balance: e.target.value as PartyFilters["balance"] })} className={INPUT} data-testid="f-balance">
              <option value="all">{t("All", "الكل")}</option><option value="due">{t("Has due balance", "عليه رصيد مستحق")}</option><option value="zero">{t("Zero balance", "رصيد صفري")}</option>
              <option value="advance">{t("Advance / credit", "رصيد مقدّم/دائن")}</option><option value="overdue">{t("Overdue", "متأخر")}</option><option value="over90">{t("Over 90 days", "أكثر من 90 يومًا")}</option>
            </select></div>
          <div><label className={LABEL}>{t("Kind", "النوع")}</label>
            <select value={filters.kind} onChange={(e) => setF({ kind: e.target.value as PartyFilters["kind"] })} className={INPUT} data-testid="f-kind">
              <option value="all">{t("All", "الكل")}</option><option value="main">{t("With own account", "بحساب مستقل")}</option><option value="sub">{t("Sub-parties", "أطراف فرعية")}</option><option value="noaccount">{t("No account", "بدون حساب")}</option>
            </select></div>
          <div><label className={LABEL}>{t("Status", "الحالة")}</label>
            <select value={filters.status} onChange={(e) => setF({ status: e.target.value as PartyFilters["status"] })} className={INPUT} data-testid="f-status">
              <option value="all">{t("All", "الكل")}</option><option value="active">{t("Active", "نشط")}</option><option value="inactive">{t("Inactive", "موقوف")}</option>
            </select></div>
          <div><label className={LABEL}>{t("Sort by", "ترتيب حسب")}</label>
            <select value={filters.sort} onChange={(e) => setF({ sort: e.target.value as SortKey })} className={INPUT} data-testid="f-sort">{sortOptions.map((o) => <option key={o.k} value={o.k}>{o.label}</option>)}</select></div>
          <div><button type="button" onClick={() => setF({ dir: filters.dir === "asc" ? "desc" : "asc" })} className={`${BTN_SOFT} w-full`} data-testid="sort-dir"><ArrowDownUp size={13} /> {filters.dir === "asc" ? t("Ascending", "تصاعدي") : t("Descending", "تنازلي")}</button></div>
          <div><button type="button" onClick={() => setFilters(DEFAULT_PARTY_FILTERS)} disabled={!filtering && filters.sort === "name" && filters.dir === "asc"} className={`${BTN_SOFT} w-full`} data-testid="f-reset"><RotateCcw size={13} /> {t("Reset", "إعادة ضبط")}</button></div>
        </div>
        <div className="mt-2 text-[11px] text-slate-500" data-testid="result-count">{filtering ? t(`${filtered.length} of ${rows.length}`, `${filtered.length} من ${rows.length}`) : t(`${rows.length} ${ptype === "customer" ? "customers" : "suppliers"}`, `${rows.length} ${ptype === "customer" ? "عميل" : "مورد"}`)}</div>
      </div>

      {/* الجدول */}
      <div className={`${CARD} overflow-hidden`}>
        <div ref={bodyRef} className="overflow-auto max-h-[60vh]">
          <table className="w-full border-collapse" style={{ minWidth: 980 }} data-testid="parties-table">
            <thead><tr>
              <th className={`${th} text-start`}>{t("Party", "الطرف")}</th><th className={th}>{t("Phone", "الهاتف")}</th><th className={th}>{t("Credit days", "مدة السداد")}</th>
              <th dir="ltr" className={`${th} text-end`}>{t("Balance", "الرصيد")}</th>{BUCKETS.map((k) => <th key={k} dir="ltr" className={`${th} text-end`}>{bucketLabel[k]}</th>)}<th className={th} />
            </tr></thead>
            <tbody>
              {filtered.map((r) => {
                const p = r.party; const g = r.aging; const isSel = sel === p.id; const acc = p.account_id ? accById.get(p.account_id) : undefined;
                return (
                  <tr key={p.id} data-testid="party-row" data-sel={isSel ? "1" : undefined} aria-selected={isSel} data-name={p.name} onClick={() => setSel(p.id)} onDoubleClick={() => void openStmt(p)}
                    className={`cursor-default ${isSel ? "bg-blue-600/15" : "hover:bg-white/[0.03]"} ${p.is_active ? "" : "opacity-60"}`}>
                    <td className={`${td} text-start`}>
                      <button type="button" onClick={(e) => { e.stopPropagation(); void openStmt(p); }} className="text-slate-100 hover:text-blue-400 font-medium text-start"><Hl text={p.name} /></button>
                      {!p.is_active && <span className="text-[9px] text-red-400 ms-1">({t("inactive", "موقوف")})</span>}
                      {r.isSub && <span className="text-[9px] text-blue-300/70 ms-1">· {t("sub of", "فرعي تحت")} {parentName(p.parent_id)}</span>}
                      {acc ? <span className="text-[9px] text-slate-500 font-mono ms-1" dir="ltr">· {acc.code}</span> : r.holderAccId == null ? <span className="text-[9px] text-amber-400 ms-1" data-testid="no-account">· {t("no account", "بدون حساب")}</span> : null}
                      {p.tax_number && <div className="text-[10px] text-slate-500" dir="ltr"><Hl text={p.tax_number} /></div>}
                    </td>
                    <td className={`${td} text-center text-slate-400`} dir="ltr"><Hl text={p.phone || "—"} /></td>
                    <td className={`${td} text-center text-slate-400`}>{p.credit_days || 0} {t("d", "يوم")}</td>
                    <td className={`${numCell} font-bold ${r.balance < 0 ? "text-red-400" : "text-emerald-400"}`} dir="ltr" data-testid="row-balance">{r.holderAccId != null ? fmt(r.balance) : "—"}</td>
                    {BUCKETS.map((k) => <td key={k} className={`${numCell} ${k === "d90p" ? "text-red-400" : k === "d90" ? "text-amber-400" : k === "d60" ? "text-amber-300" : "text-slate-300"}`} dir="ltr">{g && g[k] ? fmt(g[k]) : ""}</td>)}
                    <td className={td}><div className="flex items-center gap-1 justify-center">
                      <button type="button" onClick={(e) => { e.stopPropagation(); void openStmt(p); }} title={t("Statement", "كشف حساب")} data-testid="open-stmt" className="w-7 h-7 rounded-lg bg-slate-800 text-slate-300 flex items-center justify-center hover:text-white"><FileText size={13} /></button>
                      <button type="button" onClick={(e) => { e.stopPropagation(); setEdit({ ...p }); }} title={t("Edit", "تعديل")} data-testid="edit-party" className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-300 flex items-center justify-center hover:bg-blue-500/20"><Pencil size={13} /></button>
                      <button type="button" onClick={(e) => { e.stopPropagation(); void delP(p); }} title={t("Delete", "حذف")} data-testid="del-party" className="w-7 h-7 rounded-lg bg-red-500/10 text-red-400 flex items-center justify-center hover:bg-red-500/20"><Trash2 size={13} /></button>
                    </div></td>
                  </tr>
                );
              })}
              {filtered.length === 0 && <tr><td colSpan={10} className="p-8 text-center text-slate-500 text-sm" data-testid="parties-empty">
                {loading ? t("Loading…", "جارٍ التحميل…") : filtering ? t("No parties match the search or filters", "لا توجد أطراف مطابقة للبحث أو المرشحات") : t(`No ${ptype === "customer" ? "customers" : "suppliers"} yet. Press “New ${noun}”.`, `لا يوجد ${ptype === "customer" ? "عملاء" : "موردون"} بعد. اضغط «${noun} جديد».`)}</td></tr>}
            </tbody>
            {filtered.length > 0 && (
              <tfoot><tr className="bg-slate-950 font-bold" data-testid="parties-total">
                <td colSpan={3} className="px-2 py-2.5 text-xs text-slate-200 border-t border-slate-600 text-start">{filtering ? t("Totals of filtered parties", "إجمالي الأطراف المصفّاة") : t("Totals", "الإجمالي")}</td>
                <td className="px-2 py-2.5 text-end font-mono text-xs text-emerald-400 border-t border-slate-600" dir="ltr" data-testid="tot-balance">{fmt(shownTot.balance)}</td>
                {BUCKETS.map((k) => <td key={k} className="px-2 py-2.5 text-end font-mono text-xs text-slate-300 border-t border-slate-600" dir="ltr" data-testid={`tot-${k}`}>{fmt(shownTot[k])}</td>)}
                <td className="border-t border-slate-600" />
              </tr></tfoot>
            )}
          </table>
        </div>
      </div>

      {/* نموذج الطرف */}
      {edit && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" dir={dir} data-testid="party-modal">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg p-5 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-white font-bold text-base mb-4">{edit.id ? t("Edit party", "تعديل طرف") : t(`New ${noun}`, `${noun} جديد`)}</h3>
            <div className="space-y-3">
              <div><label className={LABEL}>{t("Name", "الاسم")}</label><input value={edit.name || ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} className={INPUT} data-testid="p-name" autoFocus /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={LABEL}>{t("Type", "النوع")}</label>
                  <select value={edit.type || ptype} onChange={(e) => setEdit({ ...edit, type: e.target.value })} className={INPUT} data-testid="p-type"><option value="customer">{t("Customer", "عميل")}</option><option value="supplier">{t("Supplier", "مورد")}</option></select></div>
                <div><label className={LABEL}>{t("Phone", "الهاتف")}</label><input value={edit.phone || ""} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} className={INPUT} dir="ltr" data-testid="p-phone" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={LABEL}>{t("Tax number", "الرقم الضريبي")}</label><input value={edit.tax_number || ""} onChange={(e) => setEdit({ ...edit, tax_number: e.target.value })} className={INPUT} dir="ltr" data-testid="p-tax" /></div>
                <div><label className={LABEL}>{t("Credit days", "مدة السداد (أيام)")}</label><input type="number" min={0} step={1} value={edit.credit_days ?? ""} onChange={(e) => setEdit({ ...edit, credit_days: e.target.value === "" ? 0 : Number(e.target.value) })} className={INPUT} dir="ltr" data-testid="p-days" /></div>
              </div>
              <div><label className={LABEL}>{t("Address", "العنوان")}</label><input value={edit.address || ""} onChange={(e) => setEdit({ ...edit, address: e.target.value })} className={INPUT} data-testid="p-address" /></div>
              <div><label className={LABEL}>{t("Receivable / payable account", "حساب الذمة")}</label>
                <AccountCombo accounts={postable} value={edit.account_id ?? null} onChange={(id) => setEdit({ ...edit, account_id: id })} storageKey={`mihwar.parties.recent.${org.id}`} testId="p-acct" placeholder={t("— No account (sub-party)", "— بدون حساب (طرف فرعي)")} /></div>
              <div><label className={LABEL}>{t("Parent party (optional — for sub-parties without their own account)", "طرف أب / مركز (اختياري — للطرف الفرعي بلا حساب)")}</label>
                <select value={edit.parent_id ?? ""} onChange={(e) => setEdit({ ...edit, parent_id: e.target.value ? Number(e.target.value) : null })} className={INPUT} data-testid="p-parent">
                  <option value="">{t("— None —", "— بدون —")}</option>{holdersList.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select></div>
              <div><label className={LABEL}>{t("Notes", "ملاحظات")}</label><input value={edit.notes || ""} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} className={INPUT} data-testid="p-notes" /></div>
              <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={edit.is_active !== false} onChange={(e) => setEdit({ ...edit, is_active: e.target.checked })} className="w-4 h-4 accent-blue-500" data-testid="p-active" /> {t("Active", "نشط")}</label>
            </div>
            <div className="flex gap-2 justify-end mt-5">
              <button type="button" onClick={() => setEdit(null)} className={BTN_SOFT}><X size={14} /> {t("Cancel", "إلغاء")}</button>
              <button type="button" onClick={() => void saveP()} disabled={busy} className={BTN_SUCCESS} data-testid="p-save"><Save size={15} /> {busy ? "…" : t("Save", "حفظ")}</button>
            </div>
          </div>
        </div>
      )}

      {/* كشف الطرف */}
      {stmt && (() => {
        const st = partyStatement(stmt.lines, stmt.party.type);
        const ag = DB.partyAging(stmt.lines.filter((l) => (l.status ?? "posted") === "posted"), stmt.party.type, stmt.party.credit_days, asOf);
        const acc = stmt.party.account_id ? accById.get(stmt.party.account_id) : undefined;
        const doPrint = () => printStatement(shop, {
          heading: "كشف حساب", account: stmt.party.name, to: asOf, showAccountCol: false, opening: null,
          rows: st.rows.map((l) => ({ date: l.date, no: jvLabel(l.entry_year, l.entry_no), desc: (l.description || "") + (l.note ? ` · ${l.note}` : ""), debit: l.debit, credit: l.credit, running: l.running })),
          totalDebit: st.totalDebit, totalCredit: st.totalCredit, finalBalance: st.closing,
        });
        return (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" dir={dir} onClick={() => closeStmt()} data-testid="party-stmt">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-800">
                <Users size={17} className="text-blue-400" />
                <div className="min-w-0"><div className="text-sm font-bold text-white truncate" data-testid="stmt-title">{t("Statement —", "كشف حساب —")} {stmt.party.name}</div>
                  <div className="text-[10px] text-slate-500">{stmt.party.phone && <span dir="ltr">{stmt.party.phone} · </span>}{acc ? `${acc.code} ${nameOf(acc)}` : stmt.party.parent_id ? `${t("via", "عبر")} ${parentName(stmt.party.parent_id)}` : ""} · {t("as of", "حتى")} {asOf}</div></div>
                <button type="button" onClick={doPrint} disabled={st.rows.length === 0} className={`${BTN_SOFT} ms-auto`} data-testid="stmt-print"><Printer size={13} /> {t("Print", "طباعة")}</button>
                <button type="button" onClick={() => closeStmt()} aria-label={t("Close", "إغلاق")} data-testid="stmt-close" className="w-8 h-8 rounded-lg bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center"><X size={15} /></button>
              </div>
              <div className="px-4 py-3 border-b border-slate-800 grid grid-cols-3 sm:grid-cols-6 gap-2 text-center">
                {([[t("Balance", "الرصيد"), ag.total], ...BUCKETS.map((k) => [bucketLabel[k], ag[k]] as [string, number])] as [string, number][]).map(([lbl, v], i) => (
                  <div key={i} className="bg-slate-950 border border-slate-800 rounded-lg py-2"><div className="text-[9px] text-slate-500 font-bold">{lbl}</div><div className={`font-mono text-xs font-bold ${i === 0 ? "text-emerald-400" : "text-slate-200"}`} dir="ltr" data-testid={i === 0 ? "stmt-balance" : undefined}>{fmt(v)}</div></div>
                ))}
              </div>
              <div className="overflow-auto">
                <table className="w-full border-collapse" style={{ minWidth: 600 }}>
                  <thead><tr>{[t("Date", "التاريخ"), t("Entry", "القيد"), t("Type", "النوع"), t("Description", "البيان"), t("Debit", "مدين"), t("Credit", "دائن"), t("Balance", "الرصيد")].map((h, i) => <th key={i} dir={i >= 4 ? "ltr" : undefined} className={`${th} ${i >= 4 ? "text-end" : "text-start"}`}>{h}</th>)}</tr></thead>
                  <tbody>
                    {st.rows.map((r, i) => (
                      <tr key={i} className="hover:bg-white/[0.03]" data-testid="stmt-row">
                        <td className={`${td} font-mono text-slate-400`} dir="ltr"><span className="block text-start">{r.date}</span></td>
                        <td className={`${td} font-mono text-blue-300`} dir="ltr"><span className="block text-start">{jvLabel(r.entry_year, r.entry_no)}</span></td>
                        <td className={td}><span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-700/40 text-slate-300 whitespace-nowrap">{typeLabel(r.entry_type)}</span></td>
                        <td className={`${td} text-slate-300`}>{r.description || "—"}{r.note && <span className="text-slate-500"> · {r.note}</span>}</td>
                        <td className={`${numCell} text-emerald-400`} dir="ltr">{r.debit ? fmt(r.debit) : ""}</td>
                        <td className={`${numCell} text-amber-400`} dir="ltr">{r.credit ? fmt(r.credit) : ""}</td>
                        <td className={`${numCell} font-bold text-white`} dir="ltr">{fmt(r.running)}</td>
                      </tr>
                    ))}
                    {st.rows.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-slate-500 text-sm" data-testid="stmt-empty">{stmt.loading ? t("Loading…", "جارٍ التحميل…") : t("No movements on this party.", "لا توجد حركة على هذا الطرف.")}</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
