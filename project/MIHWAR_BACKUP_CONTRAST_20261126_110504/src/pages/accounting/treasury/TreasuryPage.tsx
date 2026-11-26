// =============================================================
// src/pages/accounting/treasury/TreasuryPage.tsx
// لوحة «الخزن والبنوك»: فلاتر · 4 مؤشرات · إجراءات · تبويبات · بطاقات الحسابات · جدول الحركات.
// كل الأرقام من القيود المُرحّلة الفعلية (gl_journal_lines/entries) — لا بيانات تجريبية.
// =============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Home, ChevronLeft, ChevronRight, Landmark, Wallet, Layers, ArrowDownCircle, ArrowUpCircle, ArrowLeftRight, Scale, FileText, Settings,
  RefreshCw, Search, X, MoreHorizontal, Eye, Printer, Pencil, Trash2, AlertTriangle, ArrowUpDown, Clock, Building2, Plus, ListChecks, Download,
} from "lucide-react";
import { useLang } from "../../../context/LanguageContext";
import * as DB from "../../lib/accountingDb";
import SmartSelect from "./SmartSelect";
import { CARD, DATE_INPUT, INPUT, BTN_SOFT, BTN_BLUE, LABEL, Skeleton, Toasts, fmt, jv, monthStartLocal, todayLocal, type Toast } from "./ui";
import { useTr } from "./i18n";
import type { Ctx, Row } from "./types";
import { treasuryOptions, branchOptions } from "./options";
import { scoreMatch, normalize, maskTail } from "./searchUtils";
import {
  fetchNets, fetchMovements, fetchEntryLines, treasuryBalance, overlappingTreasuries, entryState, isTransferEntry, downloadCsv,
  type Treasury, type MoveLine, type EntryLine,
} from "./treasuryDb";
import { VoucherDialog, TransferDialog, TreasuryEditDialog, ManageDialog, DetailsDialog, printTransaction } from "./TreasuryDialogs";
import StatementDialog from "./StatementDialog";
import ReconcileDialog from "./ReconcileDialog";

type Tab = "cash" | "bank" | "all";
type Filters = { from: string; to: string; branch: number | ""; account: number | ""; status: "posted" | "draft" | "all" };
type SortKey = "date" | "desc" | "receipt" | "payment" | "balance";
type Dlg =
  | { k: "voucher"; kind: "receipt" | "payment" } | { k: "transfer" } | { k: "statement"; id?: number } | { k: "recon" } | { k: "manage" }
  | { k: "edit"; t: Partial<Treasury> } | { k: "details"; row: Row } | null;

const defaultFilters = (): Filters => ({ from: monthStartLocal(), to: todayLocal(), branch: "", account: "", status: "posted" });
const PAGE_SIZES = [10, 20, 50];

export default function TreasuryPage({ org, postable, accById, branches, parties, shop }: {
  org: { id: number; name: string }; postable: DB.GLAccount[]; accById: Map<number, DB.GLAccount>;
  branches: { id: number; name: string }[]; parties: DB.GLParty[]; shop: Ctx["shop"];
}) {
  const { isRTL } = useLang();
  const T = useTr();
  const Chev = isRTL ? ChevronLeft : ChevronRight;

  // ── إشعارات ──
  const [toasts, setToasts] = useState<Toast[]>([]);
  const notify = useCallback((msg: string, tone: Toast["tone"] = "info") => {
    const id = Date.now() + Math.random();
    setToasts((p) => [...p, { id, msg, tone }]);
    setTimeout(() => setToasts((p) => p.filter((x) => x.id !== id)), 5000);
  }, []);
  const ctx: Ctx = useMemo(() => ({ org, postable, accById, branches, parties, shop, notify }), [org, postable, accById, branches, parties, shop, notify]);

  // ── الفلاتر ──
  const [fd, setFd] = useState<Filters>(defaultFilters());        // قيد التحرير
  const [fa, setFa] = useState<Filters>(defaultFilters());        // المُطبّقة
  const [tab, setTab] = useState<Tab>("all");

  // ── البيانات ──
  const [treasuries, setTreasuries] = useState<Treasury[]>([]);
  const [nets, setNets] = useState<Map<string, number>>(new Map());
  const [openNets, setOpenNets] = useState<Map<string, number>>(new Map());
  const [rangeLines, setRangeLines] = useState<MoveLine[]>([]);
  const [todayLines, setTodayLines] = useState<MoveLine[]>([]);
  const [entryLines, setEntryLines] = useState<Map<number, EntryLine[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const seq = useRef(0);

  const load = useCallback(async () => {
    const my = ++seq.current;
    setLoading(true); setError("");
    const ts = (await DB.fetchTreasuries(org.id)) as Treasury[];
    const ids = Array.from(new Set(ts.map((x) => x.account_id).filter(Boolean) as number[]));
    const today = todayLocal();
    const [cur, pre, mvP, mvD, td] = await Promise.all([
      fetchNets(org.id, ids, { lte: today }),
      fetchNets(org.id, ids, { lt: fa.from }),
      fa.status !== "draft" ? fetchMovements(org.id, ids, fa.from, fa.to, "posted") : Promise.resolve({ rows: [] as MoveLine[] }),
      fa.status !== "posted" ? fetchMovements(org.id, ids, fa.from, fa.to, "draft") : Promise.resolve({ rows: [] as MoveLine[] }),
      fetchMovements(org.id, ids, today, today, "posted"),
    ]);
    const errs = [cur.error, pre.error, (mvP as { error?: string }).error, (mvD as { error?: string }).error, td.error].filter(Boolean);
    const range = [...mvP.rows, ...mvD.rows];
    const el = await fetchEntryLines([...range, ...td.rows].map((l) => l.entry_id));
    if (my !== seq.current) return;                          // طلب أحدث بدأ — تجاهل هذا
    const em = new Map<number, EntryLine[]>();
    el.rows.forEach((x) => { const a = em.get(x.entry_id) || []; a.push(x); em.set(x.entry_id, a); });
    setTreasuries(ts); setNets(cur.nets); setOpenNets(pre.nets); setRangeLines(range); setTodayLines(td.rows); setEntryLines(em);
    setError([...errs, el.error].filter(Boolean).join(" | "));
    setLoading(false);
  }, [org.id, fa.from, fa.to, fa.status]);

  useEffect(() => { load(); }, [load]);

  // ── مشتقات ──
  const hasBankCols = useMemo(() => treasuries.some((x) => "iban" in x || "bank_name" in x), [treasuries]);
  const accIdSet = useMemo(() => new Set(treasuries.map((x) => x.account_id).filter(Boolean) as number[]), [treasuries]);
  const byAcc = useMemo(() => { const m = new Map<number, Treasury[]>(); treasuries.forEach((x) => { if (x.account_id) { const a = m.get(x.account_id) || []; a.push(x); m.set(x.account_id, a); } }); return m; }, [treasuries]);
  const treasuryForLine = useCallback((l: MoveLine) => { const c = byAcc.get(l.account_id) || []; return c.find((x) => x.branch_id != null && x.branch_id === l.branch_id) || c.find((x) => x.branch_id == null) || c[0]; }, [byAcc]);
  const balances = useMemo(() => { const m = new Map<number, number>(); treasuries.forEach((x) => m.set(x.id, treasuryBalance(x, nets))); return m; }, [treasuries, nets]);
  const overlap = useMemo(() => overlappingTreasuries(treasuries), [treasuries]);

  const scope = useMemo(() => treasuries.filter((x) => (fa.branch === "" || x.branch_id === fa.branch) && (fa.account === "" || x.id === fa.account)), [treasuries, fa.branch, fa.account]);
  const shown = useMemo(() => scope.filter((x) => tab === "all" || x.kind === tab), [scope, tab]);
  const counts = useMemo(() => ({ cash: scope.filter((x) => x.kind !== "bank").length, bank: scope.filter((x) => x.kind === "bank").length, all: scope.length }), [scope]);

  const isTransfer = useCallback((l: MoveLine) => {
    if (isTransferEntry(l.entry.notes)) return true;
    const el = entryLines.get(l.entry_id) || [];
    return el.length >= 2 && el.every((x) => accIdSet.has(x.account_id));
  }, [entryLines, accIdSet]);

  // تدفقات اليوم لكل خزنة (بدون التحويلات الداخلية) + التحويلات منفصلة
  const todayFlow = useMemo(() => {
    const m = new Map<number, { rin: number; rout: number; tin: number; tout: number }>();
    todayLines.forEach((l) => {
      const tr = treasuryForLine(l); if (!tr) return;
      const f = m.get(tr.id) || { rin: 0, rout: 0, tin: 0, tout: 0 };
      if (isTransfer(l)) { f.tin += l.debit; f.tout += l.credit; } else { f.rin += l.debit; f.rout += l.credit; }
      m.set(tr.id, f);
    });
    return m;
  }, [todayLines, treasuryForLine, isTransfer]);

  const kpi = useMemo(() => {
    const act = scope.filter((x) => x.is_active);
    const sum = (arr: Treasury[]) => arr.reduce((s, x) => s + (balances.get(x.id) || 0), 0);
    let rin = 0, rout = 0;
    scope.forEach((x) => { const f = todayFlow.get(x.id); if (f) { rin += f.rin; rout += f.rout; } });
    return { cash: sum(act.filter((x) => x.kind !== "bank")), bank: sum(act.filter((x) => x.kind === "bank")), rin, rout };
  }, [scope, balances, todayFlow]);

  // ── صفوف الحركات (مع الرصيد الجاري لكل حساب) ──
  const allRows = useMemo<Row[]>(() => {
    const sorted = [...rangeLines].sort((a, b) => a.entry.date.localeCompare(b.entry.date) || a.entry.entry_no - b.entry.entry_no || a.id - b.id);
    const run = new Map<number, number>();
    const rows: Row[] = [];
    for (const l of sorted) {
      const tr = treasuryForLine(l);
      const el = entryLines.get(l.entry_id) || [];
      const state = entryState(l.entry);
      const pid = el.find((x) => x.party_id != null)?.party_id ?? null;
      const counter = el.filter((x) => x.account_id !== l.account_id || !accIdSet.has(x.account_id)).filter((x) => !(accIdSet.has(x.account_id) && x.account_id === l.account_id))
        .map((x) => accById.get(x.account_id)?.name || "").filter(Boolean);
      let bal: number | null = null;
      if (tr && state !== "draft") {
        const start = run.has(tr.id) ? run.get(tr.id)! : (Number(tr.opening_balance) || 0) + treasuryMovementNetFor(tr, openNets);
        const nb = start + l.debit - l.credit; run.set(tr.id, nb); bal = nb;
      }
      rows.push({
        key: l.id, lineId: l.id, entryId: l.entry_id, date: l.entry.date, entryNo: l.entry.entry_no, entryYear: l.entry.entry_year, jvLabel: jv(l.entry.entry_year, l.entry.entry_no),
        description: l.entry.description || "", notes: l.entry.notes || "", entryType: l.entry.entry_type || "general",
        treasuryId: tr?.id ?? null, treasuryName: tr?.name || String(l.account_id), accountId: l.account_id, debit: l.debit, credit: l.credit, balance: bal,
        state, isTransfer: isTransfer(l), partyName: pid != null ? parties.find((p) => p.id === pid)?.name || "" : "", counter: Array.from(new Set(counter)).join("، "), createdAt: l.entry.created_at,
      });
    }
    return rows;
  }, [rangeLines, treasuryForLine, entryLines, accIdSet, accById, openNets, isTransfer, parties]);

  // ── بحث/فلترة/ترتيب الجدول ──
  const [q, setQ] = useState(""); const [dq, setDq] = useState("");
  useEffect(() => { const h = setTimeout(() => setDq(q), 250); return () => clearTimeout(h); }, [q]);
  const [typeF, setTypeF] = useState<"all" | "receipt" | "payment" | "transfer">("all");
  const [sort, setSort] = useState<{ k: SortKey; dir: 1 | -1 }>({ k: "date", dir: -1 });
  const [page, setPage] = useState(0); const [size, setSize] = useState(10);
  const shownIds = useMemo(() => new Set(shown.map((x) => x.id)), [shown]);

  const filteredRows = useMemo(() => {
    const out = allRows.filter((r) => {
      if (r.treasuryId == null || !shownIds.has(r.treasuryId)) return false;
      if (fa.status === "draft" && r.state !== "draft") return false;
      if (fa.status === "posted" && r.state === "draft") return false;
      if (typeF === "transfer" && !r.isTransfer) return false;
      if (typeF === "receipt" && (r.isTransfer || !r.debit)) return false;
      if (typeF === "payment" && (r.isTransfer || !r.credit)) return false;
      if (fa.branch !== "") { const tr = treasuries.find((x) => x.id === r.treasuryId); if (tr && tr.branch_id !== fa.branch) return false; }
      return true;
    });
    const s = dq.trim();
    const matched = s ? out.filter((r) => scoreMatch({
      label: r.description, labelAlt: [r.treasuryName, r.partyName, r.counter], code: r.jvLabel,
      numbers: [String(r.entryNo), r.jvLabel, ...[r.debit, r.credit].filter(Boolean).flatMap((n) => [String(n), n.toFixed(2)]), accById.get(r.accountId)?.code || ""],
      other: [r.notes],
    }, s) > 0) : out;
    const v = (r: Row) => sort.k === "date" ? r.date : sort.k === "desc" ? normalize(r.description) : sort.k === "receipt" ? r.debit : sort.k === "payment" ? r.credit : (r.balance ?? -Infinity);
    return [...matched].sort((a, b) => {
      const x = v(a), y = v(b);
      const c = typeof x === "string" ? x.localeCompare(y as string) : (x as number) - (y as number);
      return (c || a.entryNo - b.entryNo || a.lineId - b.lineId) * sort.dir;
    });
  }, [allRows, shownIds, fa.status, fa.branch, typeF, dq, sort, treasuries, accById]);

  useEffect(() => { setPage(0); }, [dq, typeF, sort, size, fa, tab]);
  const pages = Math.max(1, Math.ceil(filteredRows.length / size));
  const pageRows = filteredRows.slice(page * size, page * size + size);
  const totals = useMemo(() => filteredRows.reduce((a, r) => ({ i: a.i + r.debit, o: a.o + r.credit }), { i: 0, o: 0 }), [filteredRows]);
  const sortBy = (k: SortKey) => setSort((s) => (s.k === k ? { k, dir: (s.dir * -1) as 1 | -1 } : { k, dir: k === "date" || k === "desc" ? -1 : 1 }));

  // ── إجراءات ──
  const [dlg, setDlg] = useState<Dlg>(null);
  const [menu, setMenu] = useState<number | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const activeT = useMemo(() => treasuries.filter((x) => x.is_active), [treasuries]);
  const closeDlg = useCallback(() => setDlg(null), []);

  const delT = async (x: Treasury) => {
    if (!window.confirm(T.deleteConfirm + `\n«${x.name}»`)) return;
    const r = await DB.deleteTreasury(x.id);
    if (!r.ok) { notify(T.saveFailed + (r.error || ""), "err"); return; }
    notify(T.deleted, "ok"); load();
  };
  const printStatement = (id: number) => setDlg({ k: "statement", id });
  const viewTx = (id: number) => { setFd((f) => ({ ...f, account: id })); setFa((f) => ({ ...f, account: id })); setTimeout(() => tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); };
  const rowLines = (r: Row) => entryLines.get(r.entryId) || [];
  const stateLabel = (s: Row["state"]) => s === "posted" ? T.statusPosted : s === "draft" ? T.statusDraft : s === "reversed" ? T.statusReversed : T.statusReversal;
  const stateCls = (s: Row["state"]) => s === "posted" ? "bg-emerald-500/15 text-emerald-400" : s === "draft" ? "bg-amber-500/15 text-amber-400" : "bg-slate-700/40 text-slate-300";

  const exportCsv = () => downloadCsv(`cash-bank-transactions_${fa.from}_${fa.to}.csv`, [
    [T.colNo, T.colDate, T.colDesc, T.colAccount, T.colReceipt, T.colPayment, T.colBalance, T.colRef, T.colStatus],
    ...filteredRows.map((r, i) => [i + 1, r.date, r.description, r.treasuryName, r.debit ? r.debit.toFixed(2) : "", r.credit ? r.credit.toFixed(2) : "", r.balance == null ? "" : r.balance.toFixed(2), r.jvLabel, stateLabel(r.state)]),
  ]);

  const dirty = JSON.stringify(fd) !== JSON.stringify(fa);
  const apply = () => { setFa(fd); };
  const resetF = () => { const d = defaultFilters(); setFd(d); setFa(d); setTab("all"); setQ(""); setTypeF("all"); };

  // ── مكوّنات صغيرة ──
  const Kpi = ({ icon: I, label, value, tone, grad }: { icon: typeof Wallet; label: string; value: number; tone: string; grad: string }) => (
    <div className={`rounded-2xl border p-4 ${grad} relative overflow-hidden`}>
      <div className="flex items-center gap-3">
        <span className={`w-11 h-11 rounded-full flex items-center justify-center bg-slate-950/40 ${tone}`}><I size={20} /></span>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] text-slate-400 font-bold truncate">{label}</div>
          {loading ? <Skeleton className="h-7 w-32 mt-1" /> : <div className={`font-mono font-black text-xl sm:text-2xl [direction:ltr] ${isRTL ? "text-right" : "text-left"} ${value < 0 ? "text-red-400" : "text-white"}`}>{fmt(value)} <span className="text-xs text-slate-400 font-bold">{T.currency}</span></div>}
        </div>
      </div>
    </div>
  );
  const Th = ({ k, children, end }: { k: SortKey; children: React.ReactNode; end?: boolean }) => (
    <th className={`px-3 py-2.5 ${end ? "text-end" : "text-start"} font-bold`} aria-sort={sort.k === k ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => sortBy(k)} className="inline-flex items-center gap-1 hover:text-white">{children}<ArrowUpDown size={11} className={sort.k === k ? "text-blue-400" : "opacity-40"} /></button>
    </th>
  );
  const TabBtn = ({ k, icon: I, label, n }: { k: Tab; icon: typeof Wallet; label: string; n: number }) => (
    <button type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
      className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-sm font-bold border border-b-0 transition-colors ${tab === k ? "bg-blue-500/10 border-blue-500/40 text-blue-300" : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"}`}>
      <I size={15} /> {label} ({n})
    </button>
  );
  const dateF = (k: "from" | "to", v: string) => setFd((f) => ({ ...f, [k]: v }));

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className="space-y-4">
      {/* مسار التنقّل + الترويسة */}
      <nav className="flex items-center gap-1.5 text-[11px] text-slate-500 flex-wrap" aria-label="breadcrumb">
        <span className="inline-flex items-center gap-1"><Home size={12} /> {T.home}</span><Chev size={12} className="opacity-60" />
        <span className="text-slate-400 font-bold">{T.accounting}</span><Chev size={12} className="opacity-60" />
        <span className="text-blue-400 font-bold">{T.title}</span>
      </nav>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600/40 to-purple-600/30 border border-blue-500/30 flex items-center justify-center text-blue-300"><Landmark size={24} /></span>
          <div><h1 className="text-2xl font-black text-white leading-tight">{T.title}</h1><p className="text-slate-500 text-xs mt-0.5">{T.subtitle}</p></div>
        </div>
        <div className="inline-flex items-center gap-2.5 bg-slate-900 border border-slate-800 rounded-xl px-4 py-2"><Building2 size={16} className="text-slate-500" /><div><div className="text-[10px] text-slate-500 font-bold">{T.organization}</div><div className="text-sm font-bold text-white">{org.name}</div></div></div>
      </div>

      {/* الفلاتر */}
      <div className={`${CARD} p-3`}>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-7 gap-3 items-end">
          <div><label className={LABEL}>{T.dateFrom}</label><input type="date" value={fd.from} max={fd.to} onChange={(e) => dateF("from", e.target.value)} className={DATE_INPUT} /></div>
          <div><label className={LABEL}>{T.dateTo}</label><input type="date" value={fd.to} min={fd.from} onChange={(e) => dateF("to", e.target.value)} className={DATE_INPUT} /></div>
          {branches.length > 1 && <div><label className={LABEL}>{T.branch}</label><SmartSelect options={branchOptions(branches)} value={fd.branch} onChange={(v) => setFd((f) => ({ ...f, branch: v === "" ? "" : Number(v) }))} placeholder={T.allBranches} /></div>}
          <div><label className={LABEL}>{T.accountType}</label>
            <select value={tab} onChange={(e) => setTab(e.target.value as Tab)} className={INPUT}><option value="all">{T.allTypes}</option><option value="cash">{T.tabCash}</option><option value="bank">{T.tabBank}</option></select></div>
          <div><label className={LABEL}>{T.account}</label><SmartSelect options={treasuryOptions(treasuries, accById, branches, T, balances)} value={fd.account} onChange={(v) => setFd((f) => ({ ...f, account: v === "" ? "" : Number(v) }))} placeholder={T.allAccountsOpt} searchPlaceholder={T.searchPh} /></div>
          <div><label className={LABEL}>{T.txStatus}</label>
            <select value={fd.status} onChange={(e) => setFd((f) => ({ ...f, status: e.target.value as Filters["status"] }))} className={INPUT}><option value="posted">{T.statusPosted}</option><option value="draft">{T.statusDraft}</option><option value="all">{T.statusAll}</option></select></div>
          <div className="flex gap-2 col-span-2 md:col-span-1">
            <button type="button" onClick={apply} className={BTN_BLUE + (dirty ? " ring-2 ring-blue-400/40" : "")}>{T.apply}</button>
            <button type="button" onClick={resetF} className={BTN_SOFT}>{T.reset}</button>
            <button type="button" onClick={load} aria-label={T.refresh} title={T.refresh} className={BTN_SOFT}><RefreshCw size={14} className={loading ? "animate-spin" : ""} /></button>
          </div>
        </div>
      </div>

      {error && (
        <div role="alert" className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 text-red-300 text-xs px-3 py-2.5"><AlertTriangle size={14} /> <span className="flex-1">{T.loadError}: {error}</span><button type="button" onClick={load} className="underline font-bold">{T.retry}</button></div>
      )}
      {overlap.length > 0 && (
        <div role="note" className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-300 text-xs px-3 py-2.5"><AlertTriangle size={14} className="mt-px shrink-0" /> <span>{T.overlapWarn}{overlap.join("، ")}</span></div>
      )}

      {/* المؤشرات */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <Kpi icon={Wallet} label={T.kpiCash} value={kpi.cash} tone="text-indigo-300" grad="bg-gradient-to-br from-blue-600/25 via-indigo-600/15 to-slate-900 border-blue-500/30" />
        <Kpi icon={Landmark} label={T.kpiBank} value={kpi.bank} tone="text-cyan-300" grad="bg-gradient-to-br from-sky-600/20 via-blue-600/10 to-slate-900 border-sky-500/30" />
        <Kpi icon={ArrowDownCircle} label={T.kpiReceipts} value={kpi.rin} tone="text-emerald-300" grad="bg-gradient-to-br from-emerald-600/20 via-teal-600/10 to-slate-900 border-emerald-500/30" />
        <Kpi icon={ArrowUpCircle} label={T.kpiPayments} value={kpi.rout} tone="text-pink-300" grad="bg-gradient-to-br from-pink-600/20 via-purple-600/10 to-slate-900 border-pink-500/30" />
      </div>
      <p className="text-[10px] text-slate-500 -mt-2">{T.kpiNote}</p>

      {/* الإجراءات الرئيسية */}
      <div className="flex flex-wrap gap-2.5">
        <button type="button" onClick={() => setDlg({ k: "voucher", kind: "receipt" })} className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-emerald-950 font-extrabold text-sm shadow-lg shadow-emerald-500/10 hover:brightness-110"><Plus size={16} /> {T.receiptVoucher}</button>
        <button type="button" onClick={() => setDlg({ k: "voucher", kind: "payment" })} className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-pink-600 to-purple-600 text-[#fff] font-extrabold text-sm shadow-lg shadow-pink-500/10 hover:brightness-110"><Plus size={16} /> {T.paymentVoucher}</button>
        <button type="button" onClick={() => setDlg({ k: "transfer" })} className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-500 text-[#fff] font-extrabold text-sm shadow-lg shadow-blue-500/10 hover:brightness-110"><ArrowLeftRight size={16} /> {T.transfer}</button>
        <span className="hidden xl:block flex-1" />
        <button type="button" onClick={() => setDlg({ k: "recon" })} className={BTN_SOFT + " !py-3"}><Scale size={15} /> {T.reconciliation}</button>
        <button type="button" onClick={() => setDlg({ k: "statement" })} className={BTN_SOFT + " !py-3"}><FileText size={15} /> {T.statement}</button>
        <button type="button" onClick={() => setDlg({ k: "manage" })} className={BTN_SOFT + " !py-3"}><Settings size={15} /> {T.settings}</button>
      </div>

      {/* التبويبات + البطاقات */}
      <div>
        <div role="tablist" className="flex gap-1 flex-wrap -mb-px relative z-10">
          <TabBtn k="cash" icon={Wallet} label={T.tabCash} n={counts.cash} /><TabBtn k="bank" icon={Landmark} label={T.tabBank} n={counts.bank} /><TabBtn k="all" icon={Layers} label={T.tabAll} n={counts.all} />
        </div>
        <div className={`${CARD} rounded-ss-none p-3`}>
          {loading && treasuries.length === 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-44" />)}</div>
          ) : shown.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-sm">{treasuries.length === 0 ? T.noAccounts : T.noAccountsFiltered}</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
              {shown.map((x) => {
                const acc = x.account_id ? accById.get(x.account_id) : undefined;
                const bal = balances.get(x.id) || 0;
                const f = todayFlow.get(x.id) || { rin: 0, rout: 0, tin: 0, tout: 0 };
                const isBank = x.kind === "bank";
                const br = x.branch_id != null ? branches.find((b) => b.id === x.branch_id)?.name : "";
                return (
                  <div key={x.id} className={`rounded-2xl border p-3.5 relative bg-gradient-to-br ${isBank ? "from-sky-600/10 to-slate-900 border-sky-500/20" : "from-indigo-600/10 to-slate-900 border-indigo-500/20"} ${x.is_active ? "" : "opacity-75"}`}>
                    <div className="flex items-start gap-2.5">
                      <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isBank ? "bg-sky-500/15 text-sky-300" : "bg-indigo-500/15 text-indigo-300"}`}>{isBank ? <Landmark size={19} /> : <Wallet size={19} />}</span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-black text-white truncate">{x.name}</div>
                        <div className="text-[10px] text-slate-500 truncate [direction:ltr] text-start">{acc ? `${acc.code} · ${acc.name}` : T.notLinked}</div>
                        {isBank && (x.bank_name || x.iban) && <div className="text-[10px] text-slate-500 truncate">{x.bank_name}{x.bank_name && x.iban ? " · " : ""}{x.iban ? <span className="font-mono [direction:ltr] inline-block">{maskTail(x.iban)}</span> : null}</div>}
                        {br && <div className="text-[10px] text-slate-500 truncate">{br}</div>}
                      </div>
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold inline-flex items-center gap-1 ${x.is_active ? "bg-emerald-500/15 text-emerald-400" : "bg-slate-700/40 text-slate-400"}`}><span className={`w-1.5 h-1.5 rounded-full ${x.is_active ? "bg-emerald-400" : "bg-slate-500"}`} />{x.is_active ? T.active : T.inactive}</span>
                        <div className="relative">
                          <button type="button" aria-label={T.more} aria-haspopup="menu" aria-expanded={menu === x.id} onClick={() => setMenu(menu === x.id ? null : x.id)} className="w-7 h-7 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center"><MoreHorizontal size={16} /></button>
                          {menu === x.id && (
                            <>
                              <div className="fixed inset-0 z-30" onClick={() => setMenu(null)} />
                              <div role="menu" className={`absolute z-40 top-8 ${isRTL ? "left-0" : "right-0"} w-48 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl py-1 text-xs`}>
                                {[
                                  { l: T.viewTransactions, i: ListChecks, f: () => viewTx(x.id) }, { l: T.viewStatement, i: FileText, f: () => setDlg({ k: "statement", id: x.id }) },
                                  { l: T.printStatement, i: Printer, f: () => printStatement(x.id) }, { l: T.edit, i: Pencil, f: () => setDlg({ k: "edit", t: { ...x } }) },
                                ].map((m) => (<button key={m.l} role="menuitem" type="button" onClick={() => { setMenu(null); m.f(); }} className="w-full flex items-center gap-2 px-3 py-2 text-slate-200 hover:bg-slate-800"><m.i size={13} className="text-slate-400" />{m.l}</button>))}
                                <button role="menuitem" type="button" onClick={() => { setMenu(null); delT(x); }} className="w-full flex items-center gap-2 px-3 py-2 text-red-400 hover:bg-slate-800"><Trash2 size={13} />{T.del}</button>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 text-[10px] text-slate-500 font-bold">{T.balance}</div>
                    {loading ? <Skeleton className="h-7 w-28" /> : <div className={`font-mono font-black text-2xl [direction:ltr] ${isRTL ? "text-right" : "text-left"} ${bal < 0 ? "text-red-400" : "text-emerald-400"}`}>{fmt(bal)} <span className="text-xs text-slate-500">{T.currency}</span></div>}
                    <div className="grid grid-cols-2 gap-px mt-3 rounded-xl overflow-hidden bg-slate-800/60 text-center">
                      <div className="bg-slate-950/60 py-2"><div className="text-[9px] text-slate-500">{T.todayReceipts}</div><div className="font-mono text-sm font-bold text-emerald-400 [direction:ltr]">{fmt(f.rin)}</div></div>
                      <div className="bg-slate-950/60 py-2"><div className="text-[9px] text-slate-500">{T.todayPayments}</div><div className="font-mono text-sm font-bold text-pink-400 [direction:ltr]">{fmt(f.rout)}</div></div>
                    </div>
                    {(f.tin > 0 || f.tout > 0) && <div className="mt-1.5 text-[10px] text-slate-500 flex justify-between"><span>{T.transfersToday}</span><span className="font-mono [direction:ltr]">+{fmt(f.tin)} {T.in} / −{fmt(f.tout)} {T.out}</span></div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* جدول آخر الحركات */}
      <div ref={tableRef} className={`${CARD} overflow-hidden scroll-mt-4`}>
        <div className="flex items-center gap-2 flex-wrap px-4 py-3 border-b border-slate-800">
          <span className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center"><Clock size={16} /></span>
          <h2 className="text-sm font-bold text-white">{T.latestTx}</h2>
          <span className="text-[11px] text-slate-500">({filteredRows.length})</span>
          <div className="relative flex-1 min-w-[200px] sm:max-w-md sm:ms-auto">
            <Search size={14} className="absolute top-1/2 -translate-y-1/2 start-3 text-slate-500" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={T.search} aria-label={T.search} className={INPUT + " !ps-9 !pe-8 !py-2 text-xs"} />
            {q && <button type="button" onClick={() => setQ("")} aria-label={T.cancel} className="absolute top-1/2 -translate-y-1/2 end-2.5 text-slate-500 hover:text-slate-200"><X size={13} /></button>}
          </div>
          <select value={typeF} onChange={(e) => setTypeF(e.target.value as typeof typeF)} aria-label={T.txType} className={INPUT + " !w-auto !py-2 text-xs"}>
            <option value="all">{T.typeAll}</option><option value="receipt">{T.typeReceipts}</option><option value="payment">{T.typePayments}</option><option value="transfer">{T.typeTransfers}</option>
          </select>
          <button type="button" onClick={exportCsv} disabled={!filteredRows.length} className={BTN_SOFT}><Download size={14} /> {T.exportCsv}</button>
        </div>

        {loading && allRows.length === 0 ? (
          <div className="p-4 space-y-2">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-9" />)}</div>
        ) : filteredRows.length === 0 ? (
          <div className="p-10 text-center text-slate-500 text-sm">{dq ? T.noMatch : T.noTx}</div>
        ) : (<>
          {/* جدول للشاشات المتوسطة فأكبر */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="bg-slate-800/50 text-slate-400">
                <th className="px-3 py-2.5 text-start font-bold w-10">{T.colNo}</th><Th k="date">{T.colDate}</Th><Th k="desc">{T.colDesc}</Th>
                <th className="px-3 py-2.5 text-start font-bold">{T.colAccount}</th><Th k="receipt" end>{T.colReceipt} ({T.currency})</Th><Th k="payment" end>{T.colPayment} ({T.currency})</Th>
                <Th k="balance" end>{T.colBalance} ({T.currency})</Th><th className="px-3 py-2.5 text-start font-bold">{T.colRef}</th><th className="px-3 py-2.5 text-start font-bold">{T.colStatus}</th><th className="px-3 py-2.5 text-end font-bold">{T.colActions}</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-800">
                {pageRows.map((r, i) => (
                  <tr key={r.key} className="hover:bg-slate-800/30">
                    <td className="px-3 py-2.5 text-slate-500">{page * size + i + 1}</td>
                    <td className="px-3 py-2.5 font-mono text-slate-300 [direction:ltr] text-start whitespace-nowrap">{r.date}</td>
                    <td className="px-3 py-2.5 text-slate-200 max-w-[260px]"><div className="truncate">{r.description || "—"}</div>{(r.partyName || r.isTransfer) && <div className="text-[10px] text-slate-500 truncate">{r.isTransfer ? (r.debit ? T.transferIn : T.transferOut) : r.partyName}</div>}</td>
                    <td className="px-3 py-2.5 text-slate-300 whitespace-nowrap">{r.treasuryName}</td>
                    <td className="px-3 py-2.5 text-end font-mono font-bold text-emerald-400 [direction:ltr]">{r.debit ? fmt(r.debit) : <span className="text-slate-600">-</span>}</td>
                    <td className="px-3 py-2.5 text-end font-mono font-bold text-pink-400 [direction:ltr]">{r.credit ? fmt(r.credit) : <span className="text-slate-600">-</span>}</td>
                    <td className={`px-3 py-2.5 text-end font-mono [direction:ltr] ${r.balance == null ? "text-slate-600" : r.balance < 0 ? "text-red-400" : "text-slate-200"}`}>{r.balance == null ? "—" : fmt(r.balance)}</td>
                    <td className="px-3 py-2.5 font-mono text-slate-400 [direction:ltr] text-start whitespace-nowrap">{r.jvLabel}</td>
                    <td className="px-3 py-2.5"><span className={`text-[10px] px-2 py-0.5 rounded-full font-bold whitespace-nowrap ${stateCls(r.state)}`}>{stateLabel(r.state)}</span></td>
                    <td className="px-3 py-2.5"><div className="flex items-center justify-end gap-1.5">
                      <button type="button" onClick={() => setDlg({ k: "details", row: r })} aria-label={T.view} title={T.view} className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-300 flex items-center justify-center hover:bg-blue-500/20"><Eye size={14} /></button>
                      <button type="button" onClick={() => printTransaction({ ctx, T, row: r, lines: rowLines(r), rtl: isRTL })} aria-label={T.print} title={T.print} className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-300 flex items-center justify-center hover:bg-purple-500/20"><Printer size={14} /></button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr className="bg-slate-800/30 font-bold"><td colSpan={4} className="px-3 py-2.5 text-slate-400">{T.totals}</td><td className="px-3 py-2.5 text-end font-mono text-emerald-400 [direction:ltr]">{fmt(totals.i)}</td><td className="px-3 py-2.5 text-end font-mono text-pink-400 [direction:ltr]">{fmt(totals.o)}</td><td colSpan={4} className="px-3 py-2.5 text-[10px] text-slate-500 font-normal">{T.balanceAfterNote}</td></tr></tfoot>
            </table>
          </div>
          {/* بطاقات للجوال */}
          <div className="md:hidden divide-y divide-slate-800">
            {pageRows.map((r) => (
              <div key={r.key} className="p-3 flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-slate-200 truncate">{r.description || "—"}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5 flex gap-2 flex-wrap"><span className="font-mono [direction:ltr]">{r.date}</span><span>{r.treasuryName}</span><span className="font-mono [direction:ltr]">{r.jvLabel}</span></div>
                  <span className={`inline-block mt-1 text-[9px] px-2 py-0.5 rounded-full font-bold ${stateCls(r.state)}`}>{stateLabel(r.state)}</span>
                </div>
                <div className="text-end shrink-0">
                  <div className={`font-mono font-bold text-sm [direction:ltr] ${r.debit ? "text-emerald-400" : "text-pink-400"}`}>{r.debit ? "+" : "−"}{fmt(r.debit || r.credit)}</div>
                  {r.balance != null && <div className="font-mono text-[10px] text-slate-500 [direction:ltr]">{fmt(r.balance)}</div>}
                  <div className="flex gap-1.5 justify-end mt-1.5">
                    <button type="button" onClick={() => setDlg({ k: "details", row: r })} aria-label={T.view} className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-300 flex items-center justify-center"><Eye size={14} /></button>
                    <button type="button" onClick={() => printTransaction({ ctx, T, row: r, lines: rowLines(r), rtl: isRTL })} aria-label={T.print} className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-300 flex items-center justify-center"><Printer size={14} /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {/* ترقيم الصفحات */}
          <div className="flex items-center gap-2 flex-wrap px-4 py-3 border-t border-slate-800 text-xs text-slate-400">
            <select value={size} onChange={(e) => setSize(Number(e.target.value))} aria-label={T.rows} className={INPUT + " !w-auto !py-1.5 text-xs"}>{PAGE_SIZES.map((n) => <option key={n} value={n}>{n} {T.rows}</option>)}</select>
            <span className="ms-auto">{T.page} {page + 1} {T.of} {pages}</span>
            <button type="button" disabled={page === 0} onClick={() => setPage((p) => p - 1)} className={BTN_SOFT}>{T.prev}</button>
            <button type="button" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)} className={BTN_SOFT}>{T.next}</button>
          </div>
        </>)}
      </div>

      {/* النوافذ */}
      {dlg?.k === "voucher" && <VoucherDialog ctx={ctx} T={T} treasuries={activeT.filter((x) => x.account_id)} allTreasuries={treasuries} balances={balances} initialKind={dlg.kind} onClose={closeDlg} onSaved={load} />}
      {dlg?.k === "transfer" && <TransferDialog ctx={ctx} T={T} treasuries={activeT} balances={balances} onClose={closeDlg} onSaved={load} />}
      {dlg?.k === "statement" && <StatementDialog ctx={ctx} T={T} treasuries={treasuries} initialId={dlg.id} initialFrom={fa.from} initialTo={fa.to} onClose={closeDlg} />}
      {dlg?.k === "recon" && <ReconcileDialog ctx={ctx} T={T} treasuries={treasuries} onClose={closeDlg} />}
      {dlg?.k === "manage" && <ManageDialog ctx={ctx} T={T} treasuries={treasuries} onClose={closeDlg} onNew={() => setDlg({ k: "edit", t: { kind: "cash", opening_balance: 0, is_active: true } })} onEdit={(x) => setDlg({ k: "edit", t: { ...x } })} onDelete={delT} />}
      {dlg?.k === "edit" && <TreasuryEditDialog ctx={ctx} T={T} initial={dlg.t} hasBankCols={hasBankCols} defaultBranch={fa.branch === "" ? null : fa.branch} onClose={closeDlg} onSaved={load} />}
      {dlg?.k === "details" && <DetailsDialog ctx={ctx} T={T} row={dlg.row} lines={rowLines(dlg.row)} onClose={closeDlg} onChanged={load} />}
      <Toasts items={toasts} onDismiss={(id) => setToasts((p) => p.filter((x) => x.id !== id))} />
    </div>
  );
}

// صافي حركة خزنة قبل بداية الفترة (نفس قاعدة treasuryBalance بدون الرصيد الافتتاحي)
function treasuryMovementNetFor(t: Treasury, nets: Map<string, number>): number {
  return treasuryBalance({ ...t, opening_balance: 0 }, nets);
}
