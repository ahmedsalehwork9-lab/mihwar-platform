// =============================================================
// src/pages/accounting/journal/JournalTab.tsx
// دفتر القيود + نموذج إدخال القيد المطوّر. ثنائي اللغة (RTL/LTR فوري)، حساب بالهللات،
// تحقق قبل الإرسال (والتحقق النهائي في الخادم عند تطبيق الـ Migration).
// يعيد استخدام accountingDb ولا يكرّر منطق المحاسبة. الحقول الجديدة تظهر فقط إن كانت أعمدتها موجودة.
// =============================================================
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { Plus, Pencil, Trash2, Save, X, Check, Search, FileCheck2, Send, Paperclip, ExternalLink, RotateCcw, Eye, ArrowUpDown, Printer, Copy, ArrowUp, ArrowDown, Scale, CheckCircle2, AlertTriangle, ShieldCheck, FileText, BookOpen, ChevronLeft, ChevronRight } from "lucide-react";
import { useLang } from "../../../context/LanguageContext";
import * as DB from "../../lib/accountingDb";
import type { GLAccount, GLLine } from "../../lib/accountingDb";
import { type JLine, totals as jTotals, validate as jValidate, balancePatch, duplicateLine, moveLine, shiftDate } from "../ledger/journalFormLogic";
import { type JEntry, type EntryFilters, type StatusFilter, filterEntries, stateOf, sumCents, paginate, isReversal } from "./reviewLogic";
import { fmtCents, normalizeDigits, toCents } from "./money";
import * as API from "./journalApi";
import { JournalDrawer, ReasonDialog, printEntryDoc, stateBadge } from "./JournalDrawer";
import { PBTN, PBTN_BLUE, PIN, PLBL, PCARD, type PrintInfo } from "./JournalPanels";

import { curAr, curEn } from "../../lib/orgConfig";
export type JUi = { AccountPicker: ComponentType<{ value: number | ""; onChange: (v: number | "") => void; options: GLAccount[]; placeholder?: string; size?: "sm" | "md" }>; PartyPicker: ComponentType<{ parties: DB.GLParty[]; onPick: (p: DB.GLParty) => void; compact?: boolean }>; resolvePartyAccount: (p: DB.GLParty, all: DB.GLParty[]) => number | null };
export type Period = { from: string; to: string; branch: string; setFrom: (v: string) => void; setTo: (v: string) => void; setBranch: (v: string) => void };
export type JCmd = { nonce: number; kind: "new" | "copy" | "reverse" | "status" | "template" | "open"; id?: number; status?: StatusFilter; template?: API.Template } | null;
type Draft = { account_id: number | ""; debit: string; credit: string; branch_id: number | ""; note: string; party_id: number | null };
const emptyLine = (): Draft => ({ account_id: "", debit: "", credit: "", branch_id: "", note: "", party_id: null });
const today = (): string => new Date().toISOString().slice(0, 10);
const yearOf = (d: string): number => Number((d || "").slice(0, 4)) || new Date().getFullYear();
export const jvLabel = (y: number, n: number): string => `JV-${y}-${String(n).padStart(4, "0")}`;
const jvOf = (e: { entry_year: number; entry_no: number }): string => jvLabel(e.entry_year, e.entry_no);
const CARD = PCARD, INPUT = PIN, LABEL = PLBL;
const DATE = INPUT + " [color-scheme:dark]";
const AMT = "w-28 bg-slate-950 border rounded-lg text-white px-2 py-1.5 text-center font-mono text-xs [direction:ltr] outline-none focus:border-blue-500";
const SUCCESS = "inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-emerald-950 font-extrabold text-sm transition-colors disabled:opacity-50";
const GHOST_EM = "inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold text-xs transition-colors disabled:opacity-50 hover:bg-emerald-500/20";

type Props = { org: { id: number; name: string }; postable: GLAccount[]; accById: Map<number, GLAccount>; branches: { id: number; name: string }[]; branchName: (id: number) => string; parties: DB.GLParty[]; ui: JUi; period: Period; cmd: JCmd; caps: API.Caps; settings: API.JSettings | null; userName: (id?: string | null) => string; printInfo: PrintInfo; onData: (rows: JEntry[], attMap: Record<number, number>, truncated: boolean, loading: boolean) => void; onTemplatesChanged: () => void; reloadKey: number };

export default function JournalTab(P: Props) {
  const { org, postable, accById, branches, branchName, parties, ui, period, caps, settings, userName } = P;
  const { lang } = useLang(); const ar = lang === "ar"; const T = useCallback((en: string, arb: string) => (ar ? arb : en), [ar]); const dir: "rtl" | "ltr" = ar ? "rtl" : "ltr";
  const multiBranch = !!branches && branches.length > 1;
  const typeLabel = useCallback((t: string): string => { const m: Record<string, string> = { general: "General journal", purchases: "Purchases", purchase_return: "Purchase return", sales: "Sales", sales_return: "Sales return", adjustment: "Stock adjustment", settlement: "Settlement", receipt: "Receipt voucher", payment: "Payment voucher", depreciation: "Depreciation", opening: "Opening balance", accrual: "Accrual", prepaid: "Prepaid expense", payroll: "Payroll", bank: "Bank entry", closing: "Closing entry", reversal: "Reversal" }; return ar ? (DB.ENTRY_TYPE_LABEL[t] || t) : (m[t] || t); }, [ar]);
  const typeOpts = useMemo(() => DB.ENTRY_TYPE_OPTS.map((t) => ({ value: t as string, label: typeLabel(t) })), [typeLabel]);
  const { from, to, branch: fBranch } = period;

  // ── بيانات الدفتر ──
  const [entries, setEntries] = useState<JEntry[]>([]); const [attMap, setAttMap] = useState<Record<number, number>>({}); const [loading, setLoading] = useState(true); const [truncated, setTruncated] = useState(false); const [loadErr, setLoadErr] = useState("");
  const reload = useCallback(async () => {
    setLoading(true); const r = await API.fetchEntriesPaged(org.id, from, to, fBranch ? Number(fBranch) : null);
    setEntries(r.rows as unknown as JEntry[]); setTruncated(r.truncated); setLoadErr(r.error || ""); const am = await DB.countAttachments(r.rows.map((e) => e.id)); setAttMap(am); setLoading(false);
  }, [org.id, from, to, fBranch]);
  useEffect(() => { void reload(); }, [reload, P.reloadKey]);
  useEffect(() => { P.onData(entries as unknown as JEntry[], attMap, truncated, loading); }, [entries, attMap, truncated, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── الفلاتر ──
  const [flt, setFlt] = useState<EntryFilters>({ text: "", type: "", status: "", account: "", user: "", amountFromC: null, amountToC: null, accountText: "" });
  const [amtFrom, setAmtFrom] = useState(""); const [amtTo, setAmtTo] = useState(""); const [sortKey, setSortKey] = useState<"no" | "date" | "debit">("date"); const [sortDir, setSortDir] = useState<"asc" | "desc">("desc"); const [page, setPage] = useState(0); const [size, setSize] = useState(20);
  const accName = useCallback((id: number): string => { const a = accById.get(id); return a ? `${a.code} ${a.name} ${a.name_en || ""}` : String(id); }, [accById]);
  const filtered = useMemo(() => filterEntries(entries as unknown as JEntry[], { ...flt, amountFromC: amtFrom.trim() ? toCents(amtFrom) : null, amountToC: amtTo.trim() ? toCents(amtTo) : null }, accName, jvOf), [entries, flt, amtFrom, amtTo, accName]);
  const sorted = useMemo(() => { const dd = sortDir === "asc" ? 1 : -1; return [...filtered].sort((a, b) => sortKey === "no" ? ((a.entry_year * 1e6 + a.entry_no) - (b.entry_year * 1e6 + b.entry_no)) * dd : sortKey === "debit" ? (sumCents(a).d - sumCents(b).d) * dd : ((a.date || "").localeCompare(b.date || "") || (a.entry_no - b.entry_no)) * dd); }, [filtered, sortKey, sortDir]);
  const pg = paginate(sorted, page, size); useEffect(() => setPage(0), [flt, amtFrom, amtTo, size, from, to, fBranch]);
  const toggleSort = (k: "no" | "date" | "debit") => { if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc")); else { setSortKey(k); setSortDir("desc"); } };
  const creators = useMemo(() => [...new Set(entries.map((e) => e.created_by).filter(Boolean) as string[])], [entries]);

  // ── نموذج الإدخال ──
  const [showForm, setShowForm] = useState(false); const [editingId, setEditingId] = useState<number | null>(null); const [editingNo, setEditingNo] = useState(""); const [nextNo, setNextNo] = useState(0); const [saving, setSaving] = useState(false); const [saveTick, setSaveTick] = useState(0);
  const [date, setDate] = useState(today()); const [eType, setEType] = useState("general"); const [desc, setDesc] = useState(""); const [notes, setNotes] = useState(""); const [eBranch, setEBranch] = useState(""); const [lines, setLines] = useState<Draft[]>([emptyLine(), emptyLine()]);
  const [currency, setCurrency] = useState(curEn()); const [fx, setFx] = useState("1"); const [extRef, setExtRef] = useState(""); const [project, setProject] = useState(""); const [costCenter, setCostCenter] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]); const [existingAtts, setExistingAtts] = useState<DB.GLAttachment[]>([]); const attRef = useRef<HTMLInputElement>(null);
  const [formErr, setFormErr] = useState(""); const [tplName, setTplName] = useState<string | null>(null); const [tplKeep, setTplKeep] = useState(false); const [tplMsg, setTplMsg] = useState(""); const [tpls, setTpls] = useState<API.Template[]>([]);
  const [drawer, setDrawer] = useState<JEntry | null>(null); const [busy, setBusy] = useState(false); const [revTarget, setRevTarget] = useState<JEntry | null>(null); const [toast, setToast] = useState("");
  const formRef = useRef<HTMLDivElement>(null);
  const note = (m: string) => { setToast(m); window.setTimeout(() => setToast(""), 4000); };

  useEffect(() => { if (!showForm || editingId != null) return; let a = true; (async () => { const n = await DB.nextEntryNo(org.id, yearOf(date)); if (a) setNextNo(n); })(); return () => { a = false; }; }, [showForm, editingId, date, org.id, saveTick]);
  useEffect(() => { if (caps.templates) void API.listTemplates(org.id).then(setTpls); }, [caps.templates, org.id, P.reloadKey]);

  const isPostable = useCallback((id: number) => postable.some((a) => a.id === id), [postable]);
  const tot = useMemo(() => jTotals(lines as JLine[]), [lines]); const sumD = tot.debit, sumC = tot.credit, balanced = tot.balanced;
  const issues = useMemo(() => jValidate(lines as JLine[], isPostable), [lines, isPostable]);
  const lineIssue = (i: number) => issues.find((x) => x.line === i + 1 && x.code !== "unbalanced" && x.code !== "need_lines");
  const ISSUE: Record<string, string> = { need_lines: T("Add at least two lines with an account and an amount", "أضف سطرين على الأقل بحساب ومبلغ"), no_account: T("Choose the account", "اختر الحساب"), both_sides: T("A line cannot have both debit and credit", "السطر فيه مدين ودائن معًا"), no_amount: T("Enter an amount", "أدخل مبلغًا"), unbalanced: T("The entry is not balanced", "القيد غير متوازن"), bad_amount: T("Amount allows up to 2 decimals", "المبلغ بحد أقصى منزلتين عشريتين"), parent_account: T("Parent accounts cannot be posted to", "لا يمكن الترحيل على حساب أب") };
  const blocking = issues.filter((x) => x.code !== "no_amount"); const firstBlock = blocking.find((x) => x.line != null) || blocking[0];
  const blockMsg = firstBlock ? (firstBlock.line != null ? `${T("Line", "السطر")} ${firstBlock.line}: ` : "") + ISSUE[firstBlock.code] : (!desc.trim() ? T("Enter the main description", "أدخل البيان الرئيسي") : "");
  const formState = blocking.some((x) => x.code === "need_lines" || x.code === "no_account" || x.code === "bad_amount" || x.code === "parent_account" || x.code === "both_sides") ? "incomplete" : !balanced ? "unbalanced" : (!desc.trim() ? "balanced" : "ready");
  const FS: Record<string, { l: string; c: string }> = { incomplete: { l: T("Incomplete", "قيد غير مكتمل"), c: "bg-slate-700/60 text-slate-200" }, unbalanced: { l: T("Unbalanced", "قيد غير متوازن"), c: "bg-amber-500/15 text-amber-400" }, balanced: { l: T("Balanced", "قيد متوازن"), c: "bg-emerald-500/15 text-emerald-400" }, ready: { l: T("Ready for review", "قيد جاهز للمراجعة"), c: "bg-blue-500/15 text-blue-400" } };
  const canPost = !saving && balanced && blocking.length === 0 && !!desc.trim();
  const needApproval = !!settings?.require_approval && caps.applied;
  const setLine = (i: number, patch: Partial<Draft>) => setLines((p) => p.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  const resetForm = () => { setDate(today()); setEType("general"); setDesc(""); setNotes(""); setEBranch(""); setLines([emptyLine(), emptyLine()]); setPendingFiles([]); setExistingAtts([]); setCurrency(curEn()); setFx("1"); setExtRef(""); setProject(""); setCostCenter(""); setFormErr(""); setTplName(null); setTplMsg(""); };
  const scrollForm = () => window.setTimeout(() => { try { formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); } catch { /* noop */ } }, 50);
  const openNew = () => { setEditingId(null); setEditingNo(""); resetForm(); setShowForm(true); scrollForm(); };
  const closeForm = () => { setShowForm(false); setEditingId(null); setEditingNo(""); resetForm(); };
  const fillFrom = (e: JEntry, copy: boolean) => {
    setDate(copy ? today() : e.date); setEType(e.entry_type || "general"); setDesc(e.description || ""); setNotes(copy ? "" : (e.notes || "")); setEBranch(e.branch_id != null ? String(e.branch_id) : "");
    setCurrency(e.currency_code || curEn()); setExtRef(copy ? "" : e.external_ref || ""); setProject(e.project || ""); setCostCenter(e.cost_center || "");
    const ls: Draft[] = (e.lines || []).map((l) => ({ account_id: l.account_id, debit: Number(l.debit) ? String(l.debit) : "", credit: Number(l.credit) ? String(l.credit) : "", branch_id: l.branch_id != null ? Number(l.branch_id) : "", note: l.note || "", party_id: l.party_id ?? null }));
    setLines(ls.length >= 2 ? ls : [...ls, emptyLine(), emptyLine()].slice(0, Math.max(2, ls.length))); setPendingFiles([]); setExistingAtts([]);
  };
  const startEdit = (e: JEntry) => { setEditingId(e.id); setEditingNo(jvOf(e)); fillFrom(e, false); DB.fetchAttachments(e.id).then(setExistingAtts); setShowForm(true); setDrawer(null); scrollForm(); };
  const startCopy = (e: JEntry) => { setEditingId(null); setEditingNo(""); fillFrom(e, true); setShowForm(true); setDrawer(null); scrollForm(); note(T("Entry copied — review and save", "تم نسخ القيد — راجع ثم احفظ")); };
  const applyTemplate = (t: API.Template) => {
    setEditingId(null); setEditingNo(""); resetForm(); setEType(t.entry_type || "general"); setDesc(t.description || "");
    const ls: Draft[] = t.lines.map((l) => ({ ...emptyLine(), account_id: l.account_id, note: l.note || "", debit: t.keep_amounts && l.side === "debit" && l.amount ? String(l.amount) : "", credit: t.keep_amounts && l.side === "credit" && l.amount ? String(l.amount) : "" }));
    setLines(ls.length >= 2 ? ls : [...ls, emptyLine(), emptyLine()].slice(0, Math.max(2, ls.length))); setShowForm(true); scrollForm();
  };

  // أوامر من المركز (KPI / الإجراءات السريعة / القوالب)
  const lastCmd = useRef(0);
  useEffect(() => {
    const c = P.cmd; if (!c || c.nonce === lastCmd.current) return; lastCmd.current = c.nonce;
    if (c.kind === "new") openNew();
    else if (c.kind === "status") setFlt((f) => ({ ...f, status: c.status || "" }));
    else if (c.kind === "template" && c.template) applyTemplate(c.template);
    else { const e = (entries as unknown as JEntry[]).find((x) => x.id === c.id); if (!e) return; if (c.kind === "copy") startCopy(e); else if (c.kind === "reverse") setRevTarget(e); else if (c.kind === "open") setDrawer(e); }
  }, [P.cmd, entries]); // eslint-disable-line react-hooks/exhaustive-deps

  // مرفقات
  const addFiles = (files: FileList | null) => { if (!files?.length) return; const arr = Array.from(files); const big = arr.find((f) => f.size > 10 * 1024 * 1024); if (big) { alert(T("File is larger than 10 MB: ", "حجم الملف أكبر من 10 ميجابايت: ") + big.name); return; } const bad = arr.find((f) => !(f.type.startsWith("image/") || f.type === "application/pdf")); if (bad) { alert(T("Only PDF or images are allowed: ", "المسموح PDF أو صور فقط: ") + bad.name); return; } setPendingFiles((p) => [...p, ...arr]); };
  const openAtt = async (att: DB.GLAttachment) => { const url = await DB.signedUrl(att.file_path); if (url) window.open(url, "_blank"); else alert(T("Could not open the attachment", "تعذّر فتح المرفق")); };
  const delExisting = async (att: DB.GLAttachment) => { if (!window.confirm(T(`Delete attachment "${att.file_name}"?`, `حذف المرفق «${att.file_name}»؟`))) return; const r = await DB.deleteAttachment(att); if (!r.ok) { alert(T("Delete failed: ", "تعذّر الحذف: ") + (r.error || "")); return; } setExistingAtts((p) => p.filter((a) => a.id !== att.id)); await reload(); };
  const kb = (n?: number) => (n ? (n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB") : "");

  // ── الحفظ ──
  const buildHeader = (status: "draft" | "posted"): API.HeaderX => ({ date, description: desc.trim() || null, branch_id: eBranch ? Number(eBranch) : null, entry_type: eType, notes: notes || null, status, ...(caps.applied ? { currency_code: currency || curEn(), fx_rate: Number(fx) > 0 ? Number(fx) : 1, external_ref: extRef.trim() || null, project: project.trim() || null, cost_center: costCenter.trim() || null } : {}) });
  const glLines = (): GLLine[] => lines.filter((l) => l.account_id && (toCents(l.debit) || toCents(l.credit))).map((l) => ({ account_id: Number(l.account_id), debit: toCents(l.debit) / 100, credit: toCents(l.credit) / 100, branch_id: l.branch_id === "" ? null : Number(l.branch_id), note: l.note || null, party_id: l.party_id ?? null }));
  const persist = async (status: "posted" | "draft", opt?: { andNew?: boolean; sendApproval?: boolean }) => {
    setFormErr("");
    if (status === "posted" && (!balanced || blocking.length || !desc.trim())) { setFormErr(blockMsg || ISSUE.unbalanced); return; }
    if (status === "draft" && (issues.some((x) => x.code === "bad_amount" || x.code === "both_sides" || x.code === "parent_account") || glLines().length < 1)) { setFormErr(blockMsg || T("Add at least one line to save a draft", "أضف سطرًا واحدًا على الأقل لحفظ المسودة")); return; }
    setSaving(true); const r = await API.saveEntry(caps, org.id, editingId, buildHeader(status), glLines(), status, ar);
    if (!r.ok) { setSaving(false); setFormErr(T("Could not save the entry: ", "تعذّر حفظ القيد: ") + (r.error || "")); return; }
    const id = r.data!; if (opt?.sendApproval) { const a = await API.requestApproval(id, ar); if (!a.ok) setFormErr(a.error || ""); }
    if (id && pendingFiles.length) for (const f of pendingFiles) { const up = await DB.uploadAttachment(org.id, id, f); if (!up.ok) alert(T(`Could not upload "${f.name}": `, `تعذّر رفع «${f.name}»: `) + (up.error || "")); }
    setSaving(false);
    if (opt?.andNew) { const k = { d: date, t: eType, b: eBranch }; closeForm(); setShowForm(true); setDate(k.d); setEType(k.t); setEBranch(k.b); setSaveTick((x) => x + 1); } else closeForm();
    note(status === "posted" ? T("Entry posted", "تم ترحيل القيد") : opt?.sendApproval ? T("Draft saved and sent for approval", "حُفظت المسودة وأُرسلت للاعتماد") : T("Draft saved", "تم حفظ المسودة")); await reload();
  };
  const saveAsTemplate = async () => {
    if (!tplName?.trim()) { setTplMsg(T("Template name is required", "اسم القالب مطلوب")); return; }
    const used = lines.filter((l) => l.account_id); if (used.length < 2) { setTplMsg(T("Pick at least two accounts", "اختر حسابين على الأقل")); return; }
    const tl: API.TplLine[] = used.map((l) => { const side: "debit" | "credit" = toCents(l.credit) > 0 && toCents(l.debit) === 0 ? "credit" : "debit"; return { account_id: Number(l.account_id), side, amount: tplKeep ? (side === "debit" ? toCents(l.debit) : toCents(l.credit)) / 100 : null, note: l.note || null }; });
    const r = await API.saveTemplate({ organization_id: org.id, name: tplName.trim(), entry_type: eType, description: desc || null, lines: tl, keep_amounts: tplKeep, is_active: true });
    if (!r.ok) { setTplMsg(r.error || "error"); return; } setTplName(null); setTplMsg(""); note(T("Template saved", "تم حفظ القالب")); P.onTemplatesChanged();
  };
  const previewForm = () => { printEntryDoc({ jv: editingId != null ? editingNo : jvLabel(yearOf(date), nextNo), date, description: desc, typeLabel: typeLabel(eType), stateLabel: T("Preview", "معاينة"), branch: eBranch ? branchName(Number(eBranch)) : "", branchId: eBranch ? Number(eBranch) : null, draft: true, lines: lines.filter((l) => l.account_id).map((l) => { const a = accById.get(Number(l.account_id)); return { code: a?.code || "", name: (ar ? a?.name : a?.name_en || a?.name) || "", note: l.note, debit: toCents(l.debit) / 100, credit: toCents(l.credit) / 100 }; }) }, T, P.printInfo); };

  // ── إجراءات على القيود ──
  const run = async (fn: () => Promise<API.Res>, okMsg: string) => { setBusy(true); const r = await fn(); setBusy(false); if (!r.ok) { alert(r.error || "error"); return false; } note(okMsg); setDrawer(null); await reload(); return true; };
  const post = (id: number) => run(() => API.postEntry(caps, id, ar), T("Entry posted", "تم ترحيل القيد"));
  const del = async (id: number) => { if (!window.confirm(T("Delete this draft?", "حذف هذه المسودة؟"))) return; await run(() => API.deleteDraft(caps, id, ar), T("Draft deleted", "تم حذف المسودة")); };
  const reverse = async (e: JEntry, reason: string, d: string) => { setRevTarget(null); await run(() => API.reverseEntryX(caps, e.id, d, reason, ar), T("Reversal entry created", "تم إنشاء القيد العكسي")); };
  const accInfo = useCallback((id: number) => { const a = accById.get(id); let lv = 1, cur = a; const seen = new Set<number>(); while (cur?.parent_id && !seen.has(cur.id)) { seen.add(cur.id); cur = accById.get(cur.parent_id); lv++; } return { code: a?.code || "", name: (ar ? a?.name : a?.name_en || a?.name) || String(id), level: lv }; }, [accById, ar]);
  const printSaved = (e: JEntry) => { printEntryDoc({ jv: jvOf(e), date: e.date, description: e.description, typeLabel: typeLabel(e.entry_type || "general"), stateLabel: stateBadge(T)[stateOf(e)].label, branch: e.branch_id != null ? branchName(e.branch_id) : "", branchId: e.branch_id, notes: e.notes, draft: stateOf(e) !== "posted" && stateOf(e) !== "reversed", lines: (e.lines || []).map((l) => { const a = accInfo(l.account_id); return { code: a.code, name: a.name, note: l.note || "", debit: Number(l.debit) || 0, credit: Number(l.credit) || 0 }; }) }, T, P.printInfo); };

  // رصيد الحساب (مخزّن مؤقتًا)
  const balCache = useRef(new Map<number, number>()); const [, bump] = useState(0);
  const ensureBal = useCallback((id: number) => { if (balCache.current.has(id)) return; balCache.current.set(id, NaN); DB.fetchAccountNet(org.id, id).then((v) => { balCache.current.set(id, v); bump((x) => x + 1); }).catch(() => undefined); }, [org.id]);
  const hint = (id: number | "") => { if (!id) return null; const a = accById.get(Number(id)); if (!a) return null; ensureBal(Number(id)); const b = balCache.current.get(Number(id)); const info = accInfo(Number(id));
    return (<div className="text-[10px] text-slate-400 mt-0.5 flex gap-2 flex-wrap" data-testid="acc-hint"><span>{T("Level", "المستوى")} {info.level}</span><span>{ar ? ({ asset: "أصول", liability: "خصوم", equity: "حقوق ملكية", revenue: "إيرادات", expense: "مصروفات" } as Record<string, string>)[a.type] : a.type}</span>{b != null && !Number.isNaN(b) && <span>{T("Balance", "الرصيد")}: <b className="font-mono [direction:ltr] inline-block">{fmtCents(Math.round(Math.abs(b) * 100))}</b> {b > 0 ? T("Dr", "مدين") : b < 0 ? T("Cr", "دائن") : ""}</span>}</div>); };

  // تنقل لوحة المفاتيح
  const focusId = (id: string) => window.setTimeout(() => (document.querySelector(`[data-nav="${id}"]`) as HTMLElement | null)?.focus(), 30);
  const onAmtKey = (i: number, field: "debit" | "credit" | "note") => (ev: React.KeyboardEvent) => {
    if (ev.key !== "Enter" || ev.ctrlKey || ev.metaKey) return; ev.preventDefault();
    if (field === "debit") focusId(`${i}-credit`); else if (field === "credit") focusId(`${i}-note`);
    else if (i === lines.length - 1) { setLines((p) => [...p, emptyLine()]); focusId(`${i + 1}-debit`); } else focusId(`${i + 1}-debit`);
  };
  const Th = ({ k, label, center }: { k: "no" | "date" | "debit"; label: string; center?: boolean }) => (<th className={`px-3 py-2.5 font-bold cursor-pointer select-none hover:text-slate-300 ${center ? "text-center" : "text-start"}`} onClick={() => toggleSort(k)} aria-sort={sortKey === k ? (sortDir === "asc" ? "ascending" : "descending") : "none"}><span className="inline-flex items-center gap-1">{label}<ArrowUpDown size={11} className={sortKey === k ? "text-blue-400" : "text-slate-600"} /></span></th>);
  const sel = (v: string, on: (v: string) => void, opts: [string, string][], testId?: string) => <select value={v} onChange={(e) => on(e.target.value)} className={INPUT} data-testid={testId}>{opts.map(([a, b]) => <option key={a} value={a}>{b}</option>)}</select>;

  return (
    <div dir={dir} data-testid="journal-tab">
      {toast && <div className="fixed bottom-4 start-1/2 -translate-x-1/2 z-[70] px-4 py-2 rounded-xl bg-emerald-600 text-[#fff] text-xs font-bold shadow-xl" role="status" data-testid="toast">{toast}</div>}
      {/* الفلاتر */}
      <div className={`${CARD} p-3 mb-3`} data-testid="filters">
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3 items-end">
          <div><label className={LABEL}>{T("From", "من")}</label><input type="date" value={from} onChange={(e) => period.setFrom(e.target.value)} className={DATE} data-testid="f-from" /></div>
          <div><label className={LABEL}>{T("To", "إلى")}</label><input type="date" value={to} onChange={(e) => period.setTo(e.target.value)} className={DATE} data-testid="f-to" /></div>
          {multiBranch && <div><label className={LABEL}>{T("Branch", "الفرع")}</label>{sel(fBranch, period.setBranch, [["", T("All branches", "كل الفروع")], ...branches.map((b): [string, string] => [String(b.id), b.name])], "f-branch")}</div>}
          <div><label className={LABEL}>{T("Type", "النوع")}</label>{sel(flt.type, (v) => setFlt({ ...flt, type: v }), [["", T("All types", "كل الأنواع")], ...typeOpts.map((o): [string, string] => [o.value, o.label])], "f-type")}</div>
          <div><label className={LABEL}>{T("Status", "الحالة")}</label>{sel(flt.status, (v) => setFlt({ ...flt, status: v as StatusFilter }), [["", T("All", "الكل")], ["draft", T("Draft", "مسودة")], ["pending", T("Awaiting approval", "بانتظار الاعتماد")], ["approved", T("Approved", "معتمد")], ["unposted", T("All unposted", "كل غير المرحّل")], ["posted", T("Posted", "مرحّل")], ["postedall", T("Posted incl. reversed", "مرحّل شامل المعكوس")], ["reversed", T("Reversed", "معكوس")]], "f-status")}</div>
          <div><label className={LABEL}>{T("Account", "الحساب")}</label>{sel(flt.account, (v) => setFlt({ ...flt, account: v }), [["", T("All accounts", "كل الحسابات")], ...postable.map((a): [string, string] => [String(a.id), `${a.code} — ${ar ? a.name : a.name_en || a.name}`])], "f-account")}</div>
          <div><label className={LABEL}>{T("Account name / no.", "اسم/رقم الحساب")}</label><input value={flt.accountText} onChange={(e) => setFlt({ ...flt, accountText: e.target.value })} className={INPUT} placeholder={T("part of name or code", "جزء من الاسم أو الرقم")} data-testid="f-acctext" /></div>
          {creators.length > 0 && <div><label className={LABEL}>{T("User", "المستخدم")}</label>{sel(flt.user, (v) => setFlt({ ...flt, user: v }), [["", T("All users", "كل المستخدمين")], ...creators.map((u): [string, string] => [u, userName(u)])], "f-user")}</div>}
          <div><label className={LABEL}>{T("Amount from", "المبلغ من")}</label><input inputMode="decimal" value={amtFrom} onChange={(e) => setAmtFrom(normalizeDigits(e.target.value))} className={INPUT + " [direction:ltr] text-center"} data-testid="f-amt-from" /></div>
          <div><label className={LABEL}>{T("Amount to", "المبلغ إلى")}</label><input inputMode="decimal" value={amtTo} onChange={(e) => setAmtTo(normalizeDigits(e.target.value))} className={INPUT + " [direction:ltr] text-center"} data-testid="f-amt-to" /></div>
          <div className="col-span-2"><label className={LABEL}>{T("Search (number / description / note / reference)", "بحث (رقم / بيان / ملاحظة / مرجع)")}</label><div className="relative"><Search size={14} className="absolute top-1/2 -translate-y-1/2 start-3 text-slate-400" /><input value={flt.text} onChange={(e) => setFlt({ ...flt, text: e.target.value })} className={INPUT + " ps-9"} data-testid="f-text" /></div></div>
          <button onClick={() => { setFlt({ text: "", type: "", status: "", account: "", user: "", amountFromC: null, amountToC: null, accountText: "" }); setAmtFrom(""); setAmtTo(""); }} className={PBTN} data-testid="f-clear"><X size={13} /> {T("Clear filters", "مسح الفلاتر")}</button>
          <button onClick={openNew} className={PBTN_BLUE} data-testid="btn-new"><Plus size={14} /> {T("New entry", "قيد جديد")}</button>
        </div>
      </div>

      {/* نموذج الإدخال */}
      {showForm && (
        <div ref={formRef} className={`${CARD} p-4 mb-3`} data-testid="je-form" onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && canPost && !needApproval) { e.preventDefault(); void persist("posted"); } }}>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="inline-flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-blue-500/10 border border-blue-500/20"><FileCheck2 size={18} className="text-blue-400" /><div><div className="text-[10px] text-blue-400/70 font-bold leading-none mb-1">{T("Entry no.", "رقم القيد")}</div><div className="font-mono font-black text-blue-400 text-sm [direction:ltr] leading-none" data-testid="je-no">{editingId != null ? editingNo : jvLabel(yearOf(date), nextNo)}</div></div></div>
            <span className="text-sm font-bold text-white">{editingId != null ? T("Edit journal entry", "تعديل قيد يومية") : T("New journal entry", "إدخال قيد يومية جديد")}</span>
            <span className={`text-[11px] px-2.5 py-1 rounded-full font-bold ${FS[formState].c}`} data-testid="je-formstate">{FS[formState].l}</span>
            {caps.templates && tpls.length > 0 && <select aria-label={T("Use a template", "استخدام قالب")} data-testid="je-tpl-select" className={INPUT + " !w-auto !py-1.5 !text-xs"} value="" onChange={(e) => { const t = tpls.find((x) => String(x.id) === e.target.value); if (t) applyTemplate(t); }}><option value="">{T("Use a template…", "اختر قالبًا…")}</option>{tpls.filter((t) => t.is_active).map((t) => <option key={t.id} value={t.id}>{ar || !t.name_en ? t.name : t.name_en}</option>)}</select>}
            <button onClick={closeForm} aria-label={T("Close", "إغلاق")} className="ms-auto w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white flex items-center justify-center"><X size={15} /></button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
            <div><label className={LABEL}>{T("Entry date", "تاريخ القيد")} *</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={DATE} data-testid="je-date" />
              <div className="flex gap-1 mt-1"><button type="button" data-testid="d-today" onClick={() => setDate(today())} className="text-[10px] px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-slate-300 hover:text-white">{T("Today", "اليوم")}</button><button type="button" data-testid="d-yest" onClick={() => setDate(shiftDate(today(), -1))} className="text-[10px] px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-slate-300 hover:text-white">{T("Yesterday", "أمس")}</button></div>
              {settings?.lock_through && date <= settings.lock_through && <div className="text-[10px] text-red-400 mt-1" data-testid="je-locked">{T("This period is closed", "هذه الفترة مغلقة")}</div>}</div>
            <div><label className={LABEL}>{T("Entry type", "نوع القيد")} *</label><select value={eType} onChange={(e) => setEType(e.target.value)} className={INPUT} data-testid="je-type">{typeOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
            {multiBranch && <div><label className={LABEL}>{T("Branch / default cost center", "الفرع / مركز التكلفة الافتراضي")}</label><select value={eBranch} onChange={(e) => setEBranch(e.target.value)} className={INPUT} data-testid="je-branch"><option value="">{T("— None", "— بدون")}</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>}
            <div className={multiBranch ? "" : "lg:col-span-2"}><label className={LABEL}>{T("Main description", "البيان الرئيسي")} *</label><input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={T("Describe the entry", "وصف القيد")} className={INPUT} data-testid="je-desc" /></div>
            {caps.applied && <>
              <div><label className={LABEL}>{T("Currency", "العملة")}</label><select value={currency} onChange={(e) => { setCurrency(e.target.value); if (e.target.value === curEn()) setFx("1"); }} className={INPUT} data-testid="je-cur"><option value={curEn()}>{curEn()} — {T("company currency", "عملة الشركة")}</option>{["USD", "EUR", "SAR", "AED", "EGP"].filter((c) => c !== curEn()).map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
              {currency !== curEn() && <div><label className={LABEL}>{T(`Exchange rate to ${curEn()}`, `سعر الصرف إلى ${curAr()}`)}</label><input inputMode="decimal" value={fx} onChange={(e) => setFx(normalizeDigits(e.target.value))} className={INPUT + " [direction:ltr] text-center"} data-testid="je-fx" /></div>}
              <div><label className={LABEL}>{T("External reference", "المرجع الخارجي")}</label><input value={extRef} onChange={(e) => setExtRef(e.target.value)} placeholder={T("Invoice / document no.", "رقم فاتورة أو مستند")} className={INPUT} data-testid="je-ref" /></div>
              <div><label className={LABEL}>{T("Project", "المشروع")}</label><input value={project} onChange={(e) => setProject(e.target.value)} className={INPUT} /></div>
              <div><label className={LABEL}>{T("Cost center", "مركز التكلفة")}</label><input value={costCenter} onChange={(e) => setCostCenter(e.target.value)} className={INPUT} /></div></>}
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full border-collapse" style={{ minWidth: multiBranch ? 980 : 820 }}>
              <thead><tr className="bg-slate-950">{["#", T("Account", "الحساب"), T("Line description / party", "البيان التفصيلي / الطرف"), ...(multiBranch ? [T("Cost center", "مركز التكلفة")] : []), T("Debit", "مدين"), T("Credit", "دائن"), T("Actions", "إجراءات")].map((h, i) => <th key={i} className="text-start text-[10px] font-bold text-slate-400 px-2 py-2.5">{h}</th>)}</tr></thead>
              <tbody>
                {lines.map((l, i) => { const iss = lineIssue(i); const sideBad = iss?.code === "both_sides" || iss?.code === "bad_amount"; const others = jTotals((lines as JLine[]).filter((_, k) => k !== i)); const canBal = Math.abs(others.debit - others.credit) >= 0.005;
                  return (
                    <tr key={i} data-testid={`je-row-${i}`} className={`border-t border-slate-800 align-top ${iss ? "bg-red-500/5" : ""}`}>
                      <td className="px-2 py-2 text-center text-[11px] text-slate-600 font-mono">{i + 1}</td>
                      <td className="px-2 py-1.5" style={{ minWidth: 250 }}><div className={iss && (iss.code === "no_account" || iss.code === "parent_account") ? "rounded-xl ring-1 ring-red-500/60" : ""}><ui.AccountPicker value={l.account_id} onChange={(v) => setLine(i, { account_id: v })} options={postable} size="sm" placeholder={T("— Select account", "— اختر حساب")} /></div>{hint(l.account_id)}{iss && <div className="text-[10px] text-red-400 mt-0.5" data-testid="je-row-issue">{ISSUE[iss.code]}</div>}</td>
                      <td className="px-2 py-1.5"><div className="flex items-center gap-1"><ui.PartyPicker parties={parties} compact onPick={(p) => { const acc = ui.resolvePartyAccount(p, parties); if (!acc) { alert(T("This party has no receivable/payable account. Set it in Customers & Suppliers first.", "هذا الطرف غير مرتبط بحساب ذمة (ولا مركزه). حدّد حساب الذمة في «العملاء والموردين» أولًا.")); return; } setLine(i, { account_id: acc, note: p.name, party_id: p.id }); }} /><input data-nav={`${i}-note`} value={l.note} onChange={(e) => setLine(i, { note: e.target.value })} onKeyDown={onAmtKey(i, "note")} placeholder={T("Line description", "بيان السطر")} aria-label={T("Line description", "بيان السطر")} className="w-full min-w-[140px] bg-slate-950 border border-slate-700 rounded-lg text-white px-2 py-1.5 text-xs outline-none focus:border-blue-500" /></div></td>
                      {multiBranch && <td className="px-2 py-1.5"><select value={l.branch_id} onChange={(e) => setLine(i, { branch_id: e.target.value ? Number(e.target.value) : "" })} aria-label={T("Cost center", "مركز التكلفة")} className="w-full min-w-[120px] bg-slate-950 border border-slate-700 rounded-lg text-white px-2 py-1.5 text-xs outline-none focus:border-blue-500"><option value="">{T("Default", "افتراضي")}</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></td>}
                      <td className="px-2 py-1.5"><input data-nav={`${i}-debit`} data-testid="je-debit" inputMode="decimal" value={l.debit} onChange={(e) => { const v = normalizeDigits(e.target.value); setLine(i, { debit: v, credit: v ? "" : l.credit }); }} onKeyDown={onAmtKey(i, "debit")} placeholder="0.00" aria-label={`${T("Debit", "مدين")} ${i + 1}`} className={`${AMT} ${sideBad ? "border-red-500" : "border-slate-700"}`} /></td>
                      <td className="px-2 py-1.5"><input data-nav={`${i}-credit`} data-testid="je-credit" inputMode="decimal" value={l.credit} onChange={(e) => { const v = normalizeDigits(e.target.value); setLine(i, { credit: v, debit: v ? "" : l.debit }); }} onKeyDown={onAmtKey(i, "credit")} placeholder="0.00" aria-label={`${T("Credit", "دائن")} ${i + 1}`} className={`${AMT} ${sideBad ? "border-red-500" : "border-slate-700"}`} /></td>
                      <td className="px-2 py-1.5"><div className="flex items-center justify-center gap-1">
                        <button type="button" data-testid={`je-up-${i}`} disabled={i === 0} onClick={() => setLines((p) => moveLine(p as JLine[], i, -1) as Draft[])} aria-label={T("Move up", "تحريك لأعلى")} className="w-7 h-7 rounded-lg bg-slate-700/40 text-slate-300 flex items-center justify-center hover:bg-slate-700 disabled:opacity-30"><ArrowUp size={13} /></button>
                        <button type="button" data-testid={`je-down-${i}`} disabled={i === lines.length - 1} onClick={() => setLines((p) => moveLine(p as JLine[], i, 1) as Draft[])} aria-label={T("Move down", "تحريك لأسفل")} className="w-7 h-7 rounded-lg bg-slate-700/40 text-slate-300 flex items-center justify-center hover:bg-slate-700 disabled:opacity-30"><ArrowDown size={13} /></button>
                        <button type="button" data-testid={`je-bal-${i}`} disabled={!canBal} onClick={() => { const pt = balancePatch(lines as JLine[], i); if (pt) setLine(i, pt); }} title={T("Balance: put the difference on this line", "موازنة: ضع الفرق في هذا السطر")} aria-label={T("Balance", "موازنة")} className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center hover:bg-emerald-500/20 disabled:opacity-30"><Scale size={13} /></button>
                        <button type="button" data-testid={`je-dup-${i}`} onClick={() => setLines((p) => duplicateLine(p as JLine[], i) as Draft[])} title={T("Copy line (same account, no amount)", "نسخ السطر (نفس الحساب بدون مبلغ)")} aria-label={T("Copy line", "نسخ السطر")} className="w-7 h-7 rounded-lg bg-slate-700/40 text-slate-300 flex items-center justify-center hover:bg-slate-700"><Copy size={13} /></button>
                        <button type="button" data-testid={`je-del-${i}`} onClick={() => setLines((p) => (p.length > 2 ? p.filter((_, k) => k !== i) : p))} title={T("Delete line", "حذف السطر")} aria-label={T("Delete line", "حذف السطر")} className="w-7 h-7 rounded-lg bg-red-500/10 text-red-400 flex items-center justify-center hover:bg-red-500/20"><X size={13} /></button></div></td>
                    </tr>); })}
              </tbody>
            </table>
          </div>

          <div className="mt-3"><label className={LABEL}>{T("General notes (optional)", "ملاحظات عامة (اختياري)")}</label><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder={T("Additional notes on the entry…", "ملاحظات إضافية على القيد…")} className={INPUT + " resize-y"} /></div>

          <div className="mt-3">
            <label className={LABEL}>{T("Attachments (PDF or image, up to 10 MB)", "المرفقات (PDF أو صورة، حتى 10 ميجابايت)")}</label>
            <div className="flex flex-wrap items-center gap-2"><button type="button" onClick={() => attRef.current?.click()} className={PBTN} data-testid="je-attach"><Paperclip size={14} /> {T("Add attachment", "إضافة مرفق")}</button>
              <input ref={attRef} type="file" accept="image/*,application/pdf" multiple className="hidden" data-testid="je-file" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} /></div>
            {(existingAtts.length > 0 || pendingFiles.length > 0) && (
              <div className="mt-2 flex flex-wrap gap-2">
                {existingAtts.map((a) => (<div key={a.id} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs"><FileText size={13} className="text-blue-400 shrink-0" /><button type="button" onClick={() => openAtt(a)} className="text-slate-200 hover:text-blue-400 max-w-[170px] truncate inline-flex items-center gap-1">{a.file_name}<ExternalLink size={11} className="opacity-60" /></button><span className="text-[10px] text-slate-400">{kb((a as unknown as { size_bytes?: number }).size_bytes)} {a.mime_type ? "· " + a.mime_type.split("/")[1] : ""}</span><button type="button" onClick={() => delExisting(a)} aria-label={T("Delete attachment", "حذف المرفق")} className="text-red-400 hover:text-red-400 shrink-0"><X size={13} /></button></div>))}
                {pendingFiles.map((f, i) => (<div key={i} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs" data-testid="je-pending-file"><Paperclip size={13} className="text-blue-400 shrink-0" /><span className="text-blue-200 max-w-[170px] truncate">{f.name}</span><span className="text-[10px] text-slate-400">{kb(f.size)} · {f.type.split("/")[1]}</span><span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-400 shrink-0">{T("will upload", "سيُرفع")}</span><button type="button" onClick={() => setPendingFiles((p) => p.filter((_, k) => k !== i))} aria-label={T("Remove", "إزالة")} className="text-red-400 hover:text-red-400 shrink-0"><X size={13} /></button></div>))}
              </div>)}
          </div>

          {caps.templates && tplName !== null && (
            <div className="mt-3 rounded-xl border border-purple-500/30 bg-purple-500/5 p-3 space-y-2" data-testid="je-tpl-box">
              <div className="flex flex-wrap gap-2 items-end"><div className="flex-1 min-w-[180px]"><label className={LABEL}>{T("Template name", "اسم القالب")}</label><input value={tplName} onChange={(e) => setTplName(e.target.value)} className={INPUT} data-testid="je-tpl-name" /></div>
                <label className="flex items-center gap-2 text-xs text-slate-300 pb-2"><input type="checkbox" checked={tplKeep} onChange={(e) => setTplKeep(e.target.checked)} className="accent-purple-500" /> {T("Keep amounts", "تثبيت المبالغ")}</label>
                <button type="button" className={PBTN_BLUE} onClick={saveAsTemplate} data-testid="je-tpl-save"><Save size={13} /> {T("Save", "حفظ")}</button><button type="button" className={PBTN} onClick={() => setTplName(null)}>{T("Cancel", "إلغاء")}</button></div>
              {tplMsg && <div className="text-xs text-red-400">{tplMsg}</div>}</div>)}

          {/* شريط الإجماليات والحفظ */}
          <div className="sticky bottom-0 -mx-4 -mb-4 mt-4 px-4 py-3 rounded-b-2xl border-t border-slate-800 bg-slate-900/95 backdrop-blur z-10" data-testid="je-bar">
            <div className="flex items-center gap-3 flex-wrap">
              <button type="button" onClick={() => setLines((p) => [...p, emptyLine()])} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600/10 border border-dashed border-blue-500 text-blue-400 font-bold text-xs hover:bg-blue-600/20" data-testid="je-addline"><Plus size={13} /> {T("Line", "سطر")}</button>
              <div className="flex items-center gap-4 text-xs" data-testid="je-totals">
                <span className="text-slate-400">{T("Debit", "مدين")} <b className="font-mono text-emerald-400 [direction:ltr] inline-block" data-testid="je-sum-d">{fmtCents(Math.round(sumD * 100))}</b></span>
                <span className="text-slate-400">{T("Credit", "دائن")} <b className="font-mono text-amber-400 [direction:ltr] inline-block" data-testid="je-sum-c">{fmtCents(Math.round(sumC * 100))}</b></span>
                <span className="text-slate-400">{T("Difference", "الفرق")} <b className={`font-mono [direction:ltr] inline-block ${balanced ? "text-emerald-400" : "text-amber-400"}`} data-testid="je-diff">{fmtCents(Math.abs(Math.round((sumD - sumC) * 100)))}</b></span>
                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full font-bold ${balanced ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"}`} data-testid="je-state">{balanced ? <><CheckCircle2 size={12} /> {T("Balanced", "متوازن")}</> : <><AlertTriangle size={12} /> {T("Not balanced", "غير متوازن")}</>}</span>
              </div>
              <div className="ms-auto flex items-center gap-2 flex-wrap">
                <button onClick={closeForm} className={PBTN} data-testid="je-cancel"><X size={14} /> {T("Cancel", "إلغاء")}</button>
                <button onClick={previewForm} className={PBTN} data-testid="je-preview" disabled={!lines.some((l) => l.account_id)}><Eye size={14} /> {T("Preview", "معاينة")}</button>
                {caps.templates && <button onClick={() => setTplName(tplName === null ? "" : null)} className={PBTN} data-testid="je-tpl-open"><Copy size={14} /> {T("Save as template", "حفظ كقالب")}</button>}
                <button onClick={() => persist("draft")} disabled={saving} className={PBTN} data-testid="je-draft"><Save size={14} /> {T("Save as draft", "حفظ كمسودة")}</button>
                {needApproval ? <button onClick={() => persist("draft", { sendApproval: true })} disabled={!canPost} className={GHOST_EM} data-testid="je-send"><ShieldCheck size={14} /> {T("Save & send for approval", "حفظ وإرسال للاعتماد")}</button> : <>
                  {editingId == null && <button onClick={() => persist("posted", { andNew: true })} disabled={!canPost} className={GHOST_EM} data-testid="je-post-new" title={T("Post, then open a new entry with the same date and type", "ترحيل ثم فتح قيد جديد بنفس التاريخ والنوع")}><Check size={14} /> {T("Post & new", "ترحيل وقيد جديد")}</button>}
                  <button onClick={() => persist("posted")} disabled={!canPost} className={SUCCESS} data-testid="je-post" title="Ctrl + Enter"><Check size={16} /> {saving ? T("Saving…", "جارٍ…") : editingId != null ? T("Save & post", "حفظ وترحيل") : T("Post entry", "ترحيل القيد")}</button></>}
              </div>
            </div>
            {(formErr || (!saving && blockMsg && (sumD > 0 || sumC > 0 || desc.trim()))) && <div className={`text-[11px] mt-1.5 ${formErr ? "text-red-400" : "text-amber-400"}`} data-testid="je-block-msg">{formErr || blockMsg}</div>}
          </div>
        </div>
      )}

      {/* دفتر القيود */}
      <div className={`${CARD} overflow-hidden`} data-testid="journal-ledger">
        <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2.5"><span className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400"><BookOpen size={16} /></span><h2 className="text-sm font-bold text-white">{T("Daily journal", "دفتر القيود اليومية")}</h2><span className="ms-auto text-[11px] text-slate-400" data-testid="ledger-count">{sorted.length} {T("entries", "قيد")}</span></div>
        {truncated && <div className="px-4 py-2 text-xs text-amber-400 bg-amber-500/5 border-b border-slate-800" data-testid="trunc-warn">{T("Showing the first 5,000 entries of the period — narrow the date range for the full picture.", "يعرض أول 5000 قيد من الفترة — ضيّق نطاق التاريخ لرؤية الباقي.")}</div>}
        {loadErr && <div className="px-4 py-2 text-xs text-red-400 border-b border-slate-800" data-testid="load-err">{loadErr}</div>}
        {loading ? <div className="p-10 text-center text-slate-400 text-sm">…</div> : sorted.length === 0 ? <div className="p-10 text-center text-slate-400 text-sm" data-testid="ledger-empty">{T("No entries match this period / filters.", "لا توجد قيود مطابقة ضمن هذه الفترة/الفلاتر.")}</div> : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse" style={{ minWidth: 1180 }} data-testid="ledger-table">
                <thead><tr className="bg-slate-950/40 border-b border-slate-800 text-[10px] text-slate-400">
                  <Th k="no" label={T("Entry no.", "رقم القيد")} /><Th k="date" label={T("Date", "التاريخ")} />
                  <th className="px-3 py-2.5 font-bold text-start">{T("Description", "البيان")}</th><th className="px-3 py-2.5 font-bold text-start">{T("Type", "نوع القيد")}</th>
                  {multiBranch && <th className="px-3 py-2.5 font-bold text-start">{T("Branch", "الفرع")}</th>}
                  {caps.applied && <th className="px-3 py-2.5 font-bold text-start">{T("Currency", "العملة")}</th>}
                  <Th k="debit" label={T("Total debit", "إجمالي المدين")} center /><th className="px-3 py-2.5 font-bold text-center">{T("Total credit", "إجمالي الدائن")}</th>
                  <th className="px-3 py-2.5 font-bold text-start">{T("Created by", "المنشئ")}</th>{caps.applied && <th className="px-3 py-2.5 font-bold text-start">{T("Approved by", "المعتمد")}</th>}
                  <th className="px-3 py-2.5 font-bold text-center">{T("Status", "الحالة")}</th>{caps.applied && <th className="px-3 py-2.5 font-bold text-start">{T("Posted at", "تاريخ الترحيل")}</th>}
                  <th className="px-3 py-2.5 font-bold text-center">{T("Actions", "إجراءات")}</th></tr></thead>
                <tbody className="divide-y divide-slate-800/60">
                  {pg.slice.map((e) => { const { d, c } = sumCents(e); const st = stateOf(e); const b = stateBadge(T)[st];
                    return (
                      <tr key={e.id} data-testid="ledger-row" data-state={st} onClick={() => setDrawer(e)} className="text-xs hover:bg-slate-800/30 cursor-pointer transition-colors">
                        <td className="px-3 py-2.5 font-mono font-bold text-blue-400 [direction:ltr] whitespace-nowrap">{jvOf(e)}{attMap[e.id] ? <Paperclip size={10} className="inline ms-1 text-slate-400" /> : null}</td>
                        <td className="px-3 py-2.5 font-mono text-slate-400 [direction:ltr] whitespace-nowrap">{e.date}</td>
                        <td className="px-3 py-2.5 text-slate-200 max-w-[260px] truncate">{e.description || "—"}{isReversal(e) && <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 ms-1">{T("Reversal", "قيد عكسي")}</span>}</td>
                        <td className="px-3 py-2.5"><span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-700/40 text-slate-300 whitespace-nowrap">{typeLabel(e.entry_type || "general")}</span></td>
                        {multiBranch && <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap">{e.branch_id != null ? branchName(e.branch_id) : "—"}</td>}
                        {caps.applied && <td className="px-3 py-2.5 text-slate-400 font-mono">{e.currency_code || curEn()}</td>}
                        <td className="px-3 py-2.5 text-center font-mono text-emerald-400 [direction:ltr] whitespace-nowrap">{fmtCents(d)}</td><td className="px-3 py-2.5 text-center font-mono text-amber-400 [direction:ltr] whitespace-nowrap">{fmtCents(c)}</td>
                        <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap">{userName(e.created_by)}</td>{caps.applied && <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap">{e.approved_by ? userName(e.approved_by) : "—"}</td>}
                        <td className="px-3 py-2.5 text-center"><span className={`text-[10px] px-2 py-0.5 rounded-full font-bold whitespace-nowrap ${b.cls}`}>{b.label}</span></td>
                        {caps.applied && <td className="px-3 py-2.5 font-mono text-slate-400 [direction:ltr] whitespace-nowrap text-[11px]">{e.posted_at ? String(e.posted_at).slice(0, 16).replace("T", " ") : "—"}</td>}
                        <td className="px-3 py-2.5" onClick={(ev) => ev.stopPropagation()}>
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => setDrawer(e)} title={T("View details", "عرض التفاصيل")} aria-label={T("View details", "عرض التفاصيل")} className="w-7 h-7 rounded-lg bg-slate-700/40 text-slate-300 flex items-center justify-center hover:bg-slate-700"><Eye size={13} /></button>
                            <button onClick={() => printSaved(e)} title={T("Print", "طباعة")} aria-label={T("Print", "طباعة")} data-testid="row-print" className="w-7 h-7 rounded-lg bg-slate-700/40 text-slate-300 flex items-center justify-center hover:bg-slate-700"><Printer size={13} /></button>
                            <button onClick={() => startCopy(e)} title={T("Copy entry", "نسخ القيد")} aria-label={T("Copy entry", "نسخ القيد")} data-testid="row-copy" className="w-7 h-7 rounded-lg bg-slate-700/40 text-slate-300 flex items-center justify-center hover:bg-slate-700"><Copy size={13} /></button>
                            {(st === "draft" || st === "approved") && <button onClick={() => post(e.id)} disabled={busy || (needApproval && st !== "approved")} title={T("Post", "ترحيل")} aria-label={T("Post", "ترحيل")} data-testid="row-post" className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center hover:bg-emerald-500/20 disabled:opacity-30"><Send size={13} /></button>}
                            {st !== "posted" && st !== "reversed" && <><button onClick={() => startEdit(e)} title={T("Edit", "تعديل")} aria-label={T("Edit", "تعديل")} data-testid="row-edit" className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center hover:bg-blue-500/20"><Pencil size={13} /></button><button onClick={() => del(e.id)} title={T("Delete", "حذف")} aria-label={T("Delete", "حذف")} data-testid="row-delete" className="w-7 h-7 rounded-lg bg-red-500/10 text-red-400 flex items-center justify-center hover:bg-red-500/20"><Trash2 size={13} /></button></>}
                            {st === "posted" && !isReversal(e) && <button onClick={() => setRevTarget(e)} disabled={busy} title={T("Reversal entry (correction)", "قيد عكسي (تصحيح)")} aria-label={T("Reverse", "عكس")} data-testid="row-reverse" className="w-7 h-7 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center hover:bg-purple-500/20 disabled:opacity-50"><RotateCcw size={13} /></button>}
                          </div></td>
                      </tr>); })}
                </tbody>
              </table>
            </div>
            <div className="flex items-center gap-3 flex-wrap px-4 py-3 border-t border-slate-800 text-xs text-slate-400" data-testid="pager">
              <span>{T("Show", "عرض")}</span><select value={size} onChange={(e) => setSize(Number(e.target.value))} className={INPUT + " !w-auto !py-1 !text-xs"} data-testid="pg-size">{[20, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}</select>
              <span data-testid="pg-info">{T(`${pg.page * size + 1}–${Math.min(sorted.length, pg.page * size + size)} of ${sorted.length}`, `${pg.page * size + 1}–${Math.min(sorted.length, pg.page * size + size)} من ${sorted.length}`)}</span>
              <span className="flex-1" /><button className={PBTN} disabled={pg.page === 0} onClick={() => setPage(pg.page - 1)} aria-label={T("Previous page", "الصفحة السابقة")} data-testid="pg-prev">{ar ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}</button>
              <span className="font-mono">{pg.page + 1} / {pg.pages}</span><button className={PBTN} disabled={pg.page >= pg.pages - 1} onClick={() => setPage(pg.page + 1)} aria-label={T("Next page", "الصفحة التالية")} data-testid="pg-next">{ar ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}</button>
            </div></>)}
      </div>

      {drawer && (() => { const e = (entries as unknown as JEntry[]).find((x) => x.id === drawer.id) || drawer; const st = stateOf(e); return (
        <JournalDrawer entry={e} tr={T} dir={dir} caps={caps} orgId={org.id} lang={lang} jv={jvOf(e)} typeLabel={typeLabel(e.entry_type || "general")} branchName={branchName} userName={userName} accInfo={accInfo} requireApproval={needApproval} busy={busy}
          jvOf={(id) => { const x = (entries as unknown as JEntry[]).find((y) => y.id === id); return x ? jvOf(x) : `#${id}`; }}
          onClose={() => setDrawer(null)} onPrint={() => printSaved(e)} onCopy={() => startCopy(e)}
          onPost={(st === "draft" && !needApproval) || st === "approved" ? () => post(e.id) : undefined}
          onEdit={st === "draft" || st === "pending" || st === "approved" ? () => startEdit(e) : undefined} onDelete={st === "draft" || st === "pending" || st === "approved" ? () => del(e.id) : undefined}
          onRequestApproval={caps.applied && needApproval && st === "draft" ? () => { void run(() => API.requestApproval(e.id, ar), T("Sent for approval", "أُرسل للاعتماد")); } : undefined}
          onApprove={caps.applied && st === "pending" ? () => { void run(() => API.approveEntry(e.id, ar), T("Entry approved", "تم اعتماد القيد")); } : undefined}
          onReverse={st === "posted" && !isReversal(e) ? () => setRevTarget(e) : undefined} />); })()}
      {revTarget && <ReasonDialog tr={T} withDate title={`${T("Reverse entry", "قيد عكسي للقيد")} ${jvOf(revTarget)}`} hint={T("A new posted reversal entry is created and linked; the original stays unchanged. This cannot be done twice.", "سيُنشأ قيد عكسي مُرحّل ومرتبط، ويبقى القيد الأصلي كما هو. لا يمكن العكس مرتين.")} confirmLabel={T("Create reversal", "إنشاء القيد العكسي")} onCancel={() => setRevTarget(null)} onConfirm={(r, d) => reverse(revTarget, r, d)} />}
    </div>
  );
}
