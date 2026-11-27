// =============================================================
// src/pages/accounting/journal/JournalCenter.tsx
// مركز القيود المحاسبية | Journal Entries Management — الغلاف: ترويسة، 7 مؤشرات، تبويبات، إجراءات سريعة.
// كل الأرقام من قيود المؤسسة الفعلية. لا يغيّر دليل الحسابات/ميزان المراجعة/دفتر الأستاذ (روابط فقط).
// =============================================================
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, BarChart3, Scale, Library, ShieldCheck, Repeat, Copy, Plus, Eye, RotateCcw, Settings, X, Search } from "lucide-react";
import { useLang } from "../../../context/LanguageContext";
import * as DB from "../../lib/accountingDb";
import type { GLAccount } from "../../lib/accountingDb";
import JournalTab, { type JUi, type JCmd, jvLabel } from "./JournalTab";
import { ReviewPanel, ReportsPanel, TemplatesPanel, RecurringPanel, SettingsPanel, PBTN, PBTN_BLUE, PCARD, PIN, type PrintInfo } from "./JournalPanels";
import { computeKpis, stateOf, type JEntry, type StatusFilter } from "./reviewLogic";
import { fmtCents } from "./money";
import * as API from "./journalApi";

type TabKey = "journal" | "reports" | "trial" | "ledger" | "review" | "recurring" | "templates" | "settings";
type Props = { org: { id: number; name: string }; postable: GLAccount[]; accById: Map<number, GLAccount>; branches: { id: number; name: string }[]; branchName: (id: number) => string; parties: DB.GLParty[]; ui: JUi; onSection?: (s: string) => void; shopInfo: { id?: number; shop_name?: string; logo_url?: string; address?: string; commercial_registration?: string } | null; isAdmin: boolean };
const monthStart = (): string => { const d = new Date(); return new Date(Date.UTC(d.getFullYear(), d.getMonth(), 1)).toISOString().slice(0, 10); };
const todayS = (): string => new Date().toISOString().slice(0, 10);

export default function JournalCenter(P: Props) {
  const { org, postable, branches, ui } = P;
  const { lang } = useLang(); const ar = lang === "ar"; const tr = useCallback((en: string, a: string) => (ar ? a : en), [ar]); const dir: "rtl" | "ltr" = ar ? "rtl" : "ltr";
  const [tab, setTab] = useState<TabKey>("journal");
  const [from, setFrom] = useState(monthStart()); const [to, setTo] = useState(todayS()); const [branch, setBranch] = useState("");
  const [caps, setCaps] = useState<API.Caps>(API.NO_CAPS); const [settings, setSettings] = useState<API.JSettings | null>(null);
  const [rows, setRows] = useState<JEntry[]>([]); const [attMap, setAttMap] = useState<Record<number, number>>({}); const [loading, setLoading] = useState(true);
  const [names, setNames] = useState<Record<string, string>>({}); const [cmd, setCmd] = useState<JCmd>(null); const nonce = useRef(0); const [reloadKey, setReloadKey] = useState(0); const [pick, setPick] = useState<null | "reverse" | "copy">(null); const [pickQ, setPickQ] = useState("");

  useEffect(() => { void API.probeCaps().then(setCaps); }, []);
  useEffect(() => { if (caps.settings) void API.getSettings(org.id).then(setSettings); }, [caps.settings, org.id]);
  useEffect(() => { const ids = [...new Set(rows.flatMap((e) => [e.created_by, e.approved_by, e.posted_by]).filter(Boolean) as string[])].filter((i) => !(i in names)); if (!ids.length) return; void API.fetchUserNames(ids).then((m) => setNames((p) => ({ ...p, ...m }))); }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps
  const userName = useCallback((id?: string | null): string => (id ? names[id] || "…" : "—"), [names]);
  const send = (c: Omit<NonNullable<JCmd>, "nonce">) => { nonce.current += 1; setCmd({ ...c, nonce: nonce.current } as JCmd); setTab("journal"); };
  const jv = useCallback((e: JEntry) => jvLabel(e.entry_year, e.entry_no), []);
  const kp = useMemo(() => computeKpis(rows), [rows]);
  const typeLabel = useCallback((t: string): string => (ar ? DB.ENTRY_TYPE_LABEL[t] || t : t.replace(/_/g, " ")), [ar]);
  const typeOpts = useMemo(() => DB.ENTRY_TYPE_OPTS.map((t) => ({ value: t as string, label: typeLabel(t) })), [typeLabel]);
  const accName = useCallback((id: number): string => { const a = P.accById.get(id); return a ? `${a.code} — ${ar ? a.name : a.name_en || a.name}` : String(id); }, [P.accById, ar]);
  const renderAccount = useCallback((v: number | "", on: (v: number | "") => void) => <ui.AccountPicker value={v} onChange={on} options={postable} size="sm" />, [ui, postable]);
  const printInfo: PrintInfo = { orgName: P.shopInfo?.shop_name || org.name, taxNumber: P.shopInfo?.commercial_registration || null, logoUrl: P.shopInfo?.logo_url || null, address: P.shopInfo?.address || null, dir, lang, orgId: org.id, shopId: P.shopInfo?.id ?? null };

  const KPIS: { key: string; label: string; value: string; status?: StatusFilter; tone: string; testid: string }[] = [
    { key: "total", label: tr("Total entries", "إجمالي القيود"), value: String(kp.total), status: "", tone: "text-blue-400", testid: "kpi-total" },
    { key: "posted", label: tr("Posted (incl. reversed)", "قيود مرحّلة (شاملة المعكوسة)"), value: String(kp.posted), status: "postedall", tone: "text-emerald-400", testid: "kpi-posted" },
    { key: "draft", label: tr("Unposted (draft/pending/approved)", "غير مرحّلة (مسودة/اعتماد)"), value: String(kp.draft), status: "unposted", tone: "text-slate-200", testid: "kpi-draft" },
    { key: "pending", label: tr("Awaiting approval", "بانتظار الاعتماد"), value: String(kp.pending), status: "pending", tone: "text-amber-400", testid: "kpi-pending" },
    { key: "reversed", label: tr("Reversed", "قيود معكوسة"), value: String(kp.reversed), status: "reversed", tone: "text-purple-400", testid: "kpi-reversed" },
    { key: "debit", label: tr("Total debit", "إجمالي المدين"), value: fmtCents(kp.debitC), tone: "text-emerald-400", testid: "kpi-debit" },
    { key: "credit", label: tr("Total credit", "إجمالي الدائن"), value: fmtCents(kp.creditC), tone: "text-amber-400", testid: "kpi-credit" },
  ];
  const TABS: { k: TabKey; label: string; icon: JSX.Element }[] = [
    { k: "journal", label: tr("Daily journal", "القيود اليومية"), icon: <BookOpen size={14} /> }, { k: "reports", label: tr("Accounting reports", "التقارير المحاسبية"), icon: <BarChart3 size={14} /> },
    { k: "trial", label: tr("Trial balance", "ميزان المراجعة"), icon: <Scale size={14} /> }, { k: "ledger", label: tr("General ledger", "دفتر الأستاذ"), icon: <Library size={14} /> },
    { k: "review", label: tr("Entry review", "مراجعة القيود"), icon: <ShieldCheck size={14} /> }, { k: "recurring", label: tr("Recurring entries", "القيود المتكررة"), icon: <Repeat size={14} /> },
    { k: "templates", label: tr("Entry templates", "قوالب القيود"), icon: <Copy size={14} /> }, { k: "settings", label: tr("Settings", "الإعدادات"), icon: <Settings size={14} /> },
  ];
  const goTab = (k: TabKey) => { if (k === "trial" || k === "ledger") P.onSection?.(k); else setTab(k); };
  const pickList = useMemo(() => { const q = pickQ.trim().toLowerCase(); return rows.filter((e) => (pick === "reverse" ? stateOf(e) === "posted" && e.reversed_of == null : true)).filter((e) => !q || jv(e).toLowerCase().includes(q) || (e.description || "").toLowerCase().includes(q)).slice(0, 30); }, [rows, pick, pickQ, jv]);
  const common = { tr, lang, entries: rows, jv, userName, branchName: P.branchName, printInfo };

  return (
    <div dir={dir} data-testid="journal-center">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex-1 min-w-[240px]"><h1 className="text-lg font-black text-white" data-testid="jc-title">{tr("Journal Entries Management", "مركز القيود المحاسبية")}</h1><p className="text-xs text-slate-400">{ar ? "Journal Entries Management" : "مركز القيود المحاسبية"}</p></div>
        <div className="flex flex-wrap gap-2" data-testid="quick-actions">
          <button className={PBTN_BLUE} onClick={() => send({ kind: "new" })} data-testid="qa-new"><Plus size={14} /> {tr("New entry", "قيد جديد")}</button>
          <button className={PBTN} onClick={() => setTab("journal")} data-testid="qa-view"><Eye size={14} /> {tr("View entries", "عرض القيود")}</button>
          <button className={PBTN} onClick={() => { setPick("reverse"); setPickQ(""); }} data-testid="qa-reverse"><RotateCcw size={14} /> {tr("Reverse an entry", "عكس قيد")}</button>
          <button className={PBTN} onClick={() => { setPick("copy"); setPickQ(""); }} data-testid="qa-copy"><Copy size={14} /> {tr("Copy an entry", "نسخ قيد")}</button>
          <button className={PBTN} onClick={() => setTab("recurring")} data-testid="qa-recurring"><Repeat size={14} /> {tr("Recurring entry", "قيد متكرر")}</button>
          <button className={PBTN} onClick={() => setTab("templates")} data-testid="qa-templates"><Library size={14} /> {tr("Templates", "القوالب")}</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3 mb-4" data-testid="kpis">
        {KPIS.map((k) => k.status !== undefined ? (
          <button key={k.key} type="button" onClick={() => send({ kind: "status", status: k.status })} data-testid={k.testid} className={`${PCARD} p-3 text-start hover:border-blue-500/50 transition-colors`}>
            <div className="text-[10px] text-slate-400 font-bold mb-1">{k.label}</div><div className={`text-xl font-black font-mono ${k.tone}`}>{loading ? "…" : k.value}</div></button>
        ) : (
          <div key={k.key} data-testid={k.testid} className={`${PCARD} p-3`}><div className="text-[10px] text-slate-400 font-bold mb-1">{k.label}</div><div className={`text-base font-black font-mono [direction:ltr] text-start ${k.tone}`}>{loading ? "…" : k.value}</div></div>))}
      </div>

      <div className="flex gap-1 overflow-x-auto mb-4 border-b border-slate-800" role="tablist" data-testid="jc-tabs">
        {TABS.map((t) => <button key={t.k} role="tab" aria-selected={tab === t.k} onClick={() => goTab(t.k)} data-testid={`tab-${t.k}`} className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-bold whitespace-nowrap border-b-2 -mb-px transition-colors ${tab === t.k ? "border-blue-500 text-blue-400" : "border-transparent text-slate-400 hover:text-slate-300"}`}>{t.icon}{t.label}</button>)}
      </div>

      <div hidden={tab !== "journal"}>
        <JournalTab org={org} postable={postable} accById={P.accById} branches={branches} branchName={P.branchName} parties={P.parties} ui={ui} period={{ from, to, branch, setFrom, setTo, setBranch }} cmd={cmd} caps={caps} settings={settings} userName={userName} printInfo={printInfo} reloadKey={reloadKey} onTemplatesChanged={() => setReloadKey((x) => x + 1)}
          onData={(r, a, _t, l) => { setRows(r); setAttMap(a); setLoading(l); }} />
      </div>
      {tab === "reports" && <ReportsPanel {...common} typeLabel={typeLabel} links={[{ key: "trial", label: tr("Trial balance", "ميزان المراجعة"), icon: <Scale size={14} /> }, { key: "ledger", label: tr("General ledger", "دفتر الأستاذ"), icon: <Library size={14} /> }, { key: "statements", label: tr("Financial statements", "القوائم المالية"), icon: <BarChart3 size={14} /> }]} onLink={(k) => P.onSection?.(k)} />}
      {tab === "review" && <ReviewPanel {...common} attMap={attMap} settings={settings} onOpen={(id) => send({ kind: "open", id })} />}
      {tab === "recurring" && <RecurringPanel tr={tr} lang={lang} orgId={org.id} caps={caps} renderAccount={renderAccount} accName={accName} typeOpts={typeOpts} branches={branches} onGenerated={() => setReloadKey((x) => x + 1)} />}
      {tab === "templates" && <TemplatesPanel tr={tr} lang={lang} orgId={org.id} caps={caps} renderAccount={renderAccount} accName={accName} typeOpts={typeOpts} reloadKey={reloadKey} onUse={(t) => send({ kind: "template", template: t })} />}
      {tab === "settings" && <SettingsPanel tr={tr} orgId={org.id} caps={caps} canEdit={P.isAdmin} settings={settings} onSaved={setSettings} />}

      {pick && (
        <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4" role="dialog" aria-modal="true" data-testid="pick-dialog" onClick={() => setPick(null)}>
          <div className={`${PCARD} w-full max-w-lg p-4`} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center mb-3"><h3 className="text-sm font-bold text-white">{pick === "reverse" ? tr("Choose a posted entry to reverse", "اختر قيدًا مرحّلًا لعكسه") : tr("Choose an entry to copy", "اختر قيدًا لنسخه")}</h3><button className="ms-auto text-slate-400 hover:text-white" onClick={() => setPick(null)} aria-label={tr("Close", "إغلاق")}><X size={16} /></button></div>
            <div className="relative mb-2"><Search size={14} className="absolute top-1/2 -translate-y-1/2 start-3 text-slate-400" /><input autoFocus value={pickQ} onChange={(e) => setPickQ(e.target.value)} placeholder={tr("Number or description", "رقم القيد أو البيان")} className={PIN + " ps-9"} data-testid="pick-q" /></div>
            <div className="max-h-72 overflow-y-auto divide-y divide-slate-800" data-testid="pick-list">
              {pickList.length === 0 ? <div className="p-6 text-center text-xs text-slate-400">{tr("No entries in the current period", "لا توجد قيود في الفترة الحالية")}</div> : pickList.map((e) => (
                <button key={e.id} type="button" data-testid="pick-item" className="w-full text-start px-2 py-2 text-xs hover:bg-slate-800/50 flex gap-3" onClick={() => { setPick(null); send({ kind: pick, id: e.id }); }}><span className="font-mono font-bold text-blue-400 [direction:ltr]">{jv(e)}</span><span className="font-mono text-slate-400 [direction:ltr]">{e.date}</span><span className="text-slate-300 truncate">{e.description || "—"}</span></button>))}
            </div>
            <div className="text-[10px] text-slate-400 mt-2">{tr("Entries of the selected period only (change the period in the daily journal tab).", "قيود الفترة المحددة فقط (غيّر الفترة من تبويب القيود اليومية).")}</div>
          </div>
        </div>)}
    </div>
  );
}
