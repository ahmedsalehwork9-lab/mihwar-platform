// =============================================================
// src/pages/accounting/journal/JournalPanels.tsx
// لوحات مركز القيود: مراجعة القيود، التقارير المحاسبية، القوالب، القيود المتكررة، سجل التدقيق، الإعدادات.
// كلها من بيانات حقيقية (قيود المؤسسة/جداول الـ Migration المقترحة). ثنائية اللغة ومتوافقة مع الثيمين.
// =============================================================
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, BarChart3, BookOpen, Download, Printer, Plus, Trash2, Pencil, Play, Save, X, Copy, ShieldCheck, Scale, Lock } from "lucide-react";
import { type JEntry, type Finding, type FindingCode, reviewEntries, highThreshold, groupEntries, stateOf, sumCents } from "./reviewLogic";
import { fmtCents, toCents, normalizeDigits } from "./money";
import * as API from "./journalApi";
import { exportXlsx, printTable, type TableSpec } from "./exportKit";

export type Tr = (en: string, ar: string) => string;
export const PCARD = "bg-slate-900 border border-slate-800 rounded-2xl";
export const PIN = "w-full bg-slate-950 border border-slate-700 rounded-xl text-white px-3 py-2 text-sm outline-none focus:border-blue-500 transition-colors";
export const PLBL = "text-[10px] text-slate-400 font-bold mb-1 block";
export const PBTN = "inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 hover:text-white font-bold text-xs transition-colors disabled:opacity-50";
export const PBTN_BLUE = "inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-[#0a58ca] hover:bg-[#084298] text-[#fff] font-bold text-xs transition-colors disabled:opacity-50";
export const PBTN_PURPLE = "inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-[#fff] font-bold text-xs transition-colors disabled:opacity-50";

export type PrintInfo = { orgName: string; taxNumber?: string | null; logoUrl?: string | null; address?: string | null; dir: "rtl" | "ltr"; lang: "ar" | "en" };
type Common = { tr: Tr; lang: "ar" | "en"; entries: JEntry[]; jv: (e: JEntry) => string; userName: (id?: string | null) => string; branchName: (id: number) => string; printInfo: PrintInfo };

export const ToolBar = ({ spec, file, info, tr }: { spec: TableSpec; file: string; info: PrintInfo; tr: Tr }) => (
  <div className="flex items-center gap-2">
    <button type="button" className={PBTN} data-testid="exp-excel" disabled={!spec.rows.length} onClick={() => exportXlsx(file, spec, info.dir === "rtl")}><Download size={14} /> Excel</button>
    <button type="button" className={PBTN} data-testid="exp-print" disabled={!spec.rows.length} onClick={() => { if (!printTable(spec, info)) alert(tr("Allow pop-ups to print", "اسمح بالنوافذ المنبثقة للطباعة")); }}><Printer size={14} /> {tr("Print / PDF", "طباعة / PDF")}</button>
  </div>
);
const Empty = ({ children }: { children: ReactNode }) => <div className="p-8 text-center text-sm text-slate-400">{children}</div>;
export const Needs = ({ tr, what }: { tr: Tr; what: string }) => (
  <div className={`${PCARD} p-6 text-center`} data-testid="needs-migration">
    <Lock size={22} className="mx-auto text-amber-400 mb-2" />
    <div className="text-sm font-bold text-white mb-1">{tr(`${what} needs the journal-center database migration`, `${what} يتطلب تطبيق Migration مركز القيود على قاعدة البيانات`)}</div>
    <div className="text-xs text-slate-400">{tr("The SQL is in supabase/proposals/20261127_journal_center.sql — review it, then approve it to be applied.", "ملف SQL في supabase/proposals/20261127_journal_center.sql — راجعه ثم وافق على تطبيقه.")}</div>
  </div>
);

// ── مراجعة القيود والرقابة ───────────────────────────────
const FIND_LABEL: Record<FindingCode, [string, string]> = {
  unbalanced: ["Unbalanced entries", "قيود غير متوازنة"], incomplete: ["Incomplete entries", "قيود غير مكتملة"], duplicate: ["Possible duplicates", "قيود مكررة محتملة"],
  unposted: ["Unposted entries", "قيود غير مرحّلة"], pending: ["Awaiting approval", "قيود تنتظر الاعتماد"], high_amount: ["High-value entries", "قيود بمبالغ مرتفعة"],
  odd_date: ["Unusual dates", "قيود بتاريخ غير معتاد"], no_attachment: ["Missing attachments", "قيود بلا مرفقات"],
};
export function ReviewPanel(p: Common & { attMap: Record<number, number>; settings: API.JSettings | null; onOpen: (id: number) => void }) {
  const { tr, entries } = p; const today = new Date().toISOString().slice(0, 10);
  const [sel, setSel] = useState<FindingCode | "">("");
  const hi = p.settings?.high_amount_threshold != null ? toCents(p.settings.high_amount_threshold) : null;
  const att = p.settings?.attachment_required_over != null ? toCents(p.settings.attachment_required_over) : null;
  const findings = useMemo(() => reviewEntries(entries, { today, attCount: p.attMap, highThresholdC: hi, attachmentOverC: att }), [entries, p.attMap, hi, att, today]);
  const counts = useMemo(() => { const m = new Map<FindingCode, number>(); for (const f of findings) m.set(f.code, (m.get(f.code) ?? 0) + 1); return m; }, [findings]);
  const byId = useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries]);
  const shown = findings.filter((f) => !sel || f.code === sel);
  const detail = (f: Finding): string => f.code === "unbalanced" ? tr(`Difference ${fmtCents(Number(f.detail))}`, `الفرق ${fmtCents(Number(f.detail))}`) : f.code === "high_amount" ? fmtCents(Number(f.detail)) : f.code === "odd_date" ? (f.detail === "future" ? tr("Future date", "تاريخ مستقبلي") : tr("Back-dated > 90 days", "تاريخ سابق للإدخال بأكثر من 90 يومًا")) : f.code === "duplicate" ? tr("Same date, amount and description as", "نفس التاريخ والمبلغ والبيان مع") + " " + (f.detail || "").split(",").map((id) => { const x = byId.get(Number(id)); return x ? p.jv(x) : id; }).join(", ") : "";
  const sevCls = { high: "bg-red-500/15 text-red-400", medium: "bg-amber-500/15 text-amber-400", low: "bg-slate-700/60 text-slate-300" } as const;
  const sevLbl = { high: tr("High", "عالية"), medium: tr("Medium", "متوسطة"), low: tr("Low", "منخفضة") } as const;
  const spec: TableSpec = { title: tr("Journal Entries Audit & Review", "مراجعة القيود والرقابة"), subtitle: sel ? tr(...FIND_LABEL[sel]) : undefined, cols: [{ label: tr("Entry", "القيد") }, { label: tr("Date", "التاريخ") }, { label: tr("Description", "البيان") }, { label: tr("Finding", "الملاحظة") }, { label: tr("Severity", "الخطورة") }, { label: tr("Details", "تفاصيل") }], rows: shown.map((f) => { const e = byId.get(f.entryId)!; return [p.jv(e), e.date, e.description || "", tr(...FIND_LABEL[f.code]), sevLbl[f.severity], detail(f)]; }) };
  const thrNote = hi != null ? fmtCents(hi) : (highThreshold(entries) != null ? fmtCents(highThreshold(entries)!) : null);
  return (
    <div className="space-y-3" data-testid="review-panel">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(Object.keys(FIND_LABEL) as FindingCode[]).map((c) => (
          <button key={c} type="button" data-testid={`rv-${c}`} onClick={() => setSel(sel === c ? "" : c)} className={`${PCARD} p-3 text-start hover:border-blue-500/60 transition-colors ${sel === c ? "!border-blue-500" : ""}`}>
            <div className="text-[11px] text-slate-400 font-bold">{tr(...FIND_LABEL[c])}</div>
            <div className={`text-2xl font-black tabular-nums ${(counts.get(c) ?? 0) > 0 ? (c === "unbalanced" || c === "incomplete" ? "text-red-400" : "text-amber-400") : "text-emerald-400"}`}>{counts.get(c) ?? 0}</div>
          </button>
        ))}
      </div>
      <div className={`${PCARD} overflow-hidden`}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800"><ShieldCheck size={16} className="text-blue-400" /><h3 className="text-sm font-bold text-white">{tr("Journal Entries Audit & Review", "مراجعة القيود والرقابة")}</h3><span className="text-[11px] text-slate-400">{shown.length}</span>
          <span className="flex-1" />{thrNote && <span className="text-[10px] text-slate-400">{tr("High-value threshold", "حد المبالغ المرتفعة")}: <b className="font-mono [direction:ltr] inline-block">{thrNote}</b></span>}<ToolBar spec={spec} file="journal-review" info={p.printInfo} tr={tr} /></div>
        {shown.length === 0 ? <Empty>{entries.length ? tr("No findings in this period — everything looks consistent.", "لا توجد ملاحظات ضمن هذه الفترة.") : tr("No entries in this period.", "لا توجد قيود ضمن هذه الفترة.")}</Empty> : (
          <div className="overflow-x-auto"><table className="w-full text-xs min-w-[720px]"><thead><tr className="bg-slate-950/40 text-[10px] text-slate-400"><th className="px-3 py-2 text-start">{tr("Entry", "القيد")}</th><th className="px-3 py-2 text-start">{tr("Date", "التاريخ")}</th><th className="px-3 py-2 text-start">{tr("Description", "البيان")}</th><th className="px-3 py-2 text-start">{tr("Finding", "الملاحظة")}</th><th className="px-3 py-2 text-start">{tr("Severity", "الخطورة")}</th><th className="px-3 py-2 text-start">{tr("Details", "تفاصيل")}</th></tr></thead>
            <tbody className="divide-y divide-slate-800/60">{shown.slice(0, 500).map((f, i) => { const e = byId.get(f.entryId)!; return (
              <tr key={i} data-testid="rv-row" onClick={() => p.onOpen(e.id)} className="hover:bg-slate-800/30 cursor-pointer"><td className="px-3 py-2 font-mono font-bold text-blue-400 [direction:ltr] whitespace-nowrap">{p.jv(e)}</td><td className="px-3 py-2 font-mono text-slate-400 [direction:ltr]">{e.date}</td><td className="px-3 py-2 text-slate-200 max-w-[240px] truncate">{e.description || "—"}</td><td className="px-3 py-2 text-slate-200">{tr(...FIND_LABEL[f.code])}</td><td className="px-3 py-2"><span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${sevCls[f.severity]}`}>{sevLbl[f.severity]}</span></td><td className="px-3 py-2 text-slate-400">{detail(f)}</td></tr>); })}</tbody></table></div>)}
      </div>
    </div>
  );
}

// ── التقارير المحاسبية (تحليل القيود) ───────────────────────
type GKey = "branch" | "type" | "user" | "month" | "project" | "state";
export function ReportsPanel(p: Common & { typeLabel: (t: string) => string; links: { key: string; label: string; icon: ReactNode }[]; onLink: (k: string) => void }) {
  const { tr, entries } = p; const [g, setG] = useState<GKey>("branch");
  const stateLbl = { draft: tr("Draft", "مسودة"), pending: tr("Awaiting approval", "بانتظار الاعتماد"), approved: tr("Approved", "معتمد"), posted: tr("Posted", "مرحّل"), reversed: tr("Reversed", "معكوس") } as const;
  const keyOf = (e: JEntry): string => g === "branch" ? (e.branch_id != null ? p.branchName(e.branch_id) : tr("No branch", "بدون فرع")) : g === "type" ? p.typeLabel(e.entry_type || "general") : g === "user" ? p.userName(e.created_by) : g === "month" ? (e.date || "").slice(0, 7) : g === "project" ? (e.project || e.cost_center || tr("None", "بدون")) : stateLbl[stateOf(e)];
  const rows = useMemo(() => groupEntries(entries, keyOf), [entries, g]); // eslint-disable-line react-hooks/exhaustive-deps
  const tot = rows.reduce((s, r) => ({ n: s.n + r.count, d: s.d + r.debitC, c: s.c + r.creditC }), { n: 0, d: 0, c: 0 });
  const GL: [GKey, string, string][] = [["branch", "By branch / cost center", "حسب الفرع / مركز التكلفة"], ["type", "By entry type", "حسب نوع العملية"], ["user", "By user", "حسب المستخدم"], ["month", "By month", "حسب الشهر"], ["state", "By status", "حسب الحالة"], ["project", "By project", "حسب المشروع"]];
  const spec: TableSpec = { title: tr("Journal analysis", "تحليل القيود"), subtitle: tr(...(GL.find((x) => x[0] === g)!.slice(1) as [string, string])), cols: [{ label: tr("Group", "المجموعة") }, { label: tr("Entries", "عدد القيود"), num: true }, { label: tr("Debit", "مدين"), num: true }, { label: tr("Credit", "دائن"), num: true }], rows: rows.map((r) => [r.key, r.count, r.debitC / 100, r.creditC / 100]), totals: [tr("Total", "الإجمالي"), tot.n, tot.d / 100, tot.c / 100] };
  const max = Math.max(1, ...rows.map((r) => r.debitC));
  return (
    <div className="space-y-3" data-testid="reports-panel">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{p.links.map((l) => (
        <button key={l.key} type="button" data-testid={`rp-link-${l.key}`} onClick={() => p.onLink(l.key)} className={`${PCARD} p-3 flex items-center gap-2.5 text-start hover:border-blue-500/60 transition-colors`}><span className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center">{l.icon}</span><span className="text-xs font-bold text-white">{l.label}</span></button>))}</div>
      <div className={`${PCARD} overflow-hidden`}>
        <div className="flex items-center gap-2 flex-wrap px-4 py-3 border-b border-slate-800"><BarChart3 size={16} className="text-blue-400" /><h3 className="text-sm font-bold text-white">{tr("Journal analysis", "تحليل القيود")}</h3><span className="flex-1" />
          <select value={g} onChange={(e) => setG(e.target.value as GKey)} data-testid="rp-group" className={PIN + " !w-auto !py-1.5 !text-xs"}>{GL.map(([k, en, ar]) => <option key={k} value={k}>{tr(en, ar)}</option>)}</select><ToolBar spec={spec} file="journal-analysis" info={p.printInfo} tr={tr} /></div>
        {rows.length === 0 ? <Empty>{tr("No entries in this period.", "لا توجد قيود ضمن هذه الفترة.")}</Empty> : (
          <div className="overflow-x-auto"><table className="w-full text-xs min-w-[560px]"><thead><tr className="bg-slate-950/40 text-[10px] text-slate-400"><th className="px-3 py-2 text-start">{tr("Group", "المجموعة")}</th><th className="px-3 py-2 text-center">{tr("Entries", "عدد القيود")}</th><th className="px-3 py-2 text-center">{tr("Debit", "مدين")}</th><th className="px-3 py-2 text-center">{tr("Credit", "دائن")}</th><th className="px-3 py-2 w-40" /></tr></thead>
            <tbody className="divide-y divide-slate-800/60">{rows.map((r) => (<tr key={r.key} data-testid="rp-row"><td className="px-3 py-2 text-slate-200">{r.key}</td><td className="px-3 py-2 text-center font-mono tabular-nums text-slate-300">{r.count}</td><td className="px-3 py-2 text-center font-mono tabular-nums text-emerald-400 [direction:ltr]">{fmtCents(r.debitC)}</td><td className="px-3 py-2 text-center font-mono tabular-nums text-amber-400 [direction:ltr]">{fmtCents(r.creditC)}</td><td className="px-3 py-2"><div className="h-2 rounded-full bg-slate-800 overflow-hidden"><div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.max(2, (r.debitC / max) * 100)}%` }} /></div></td></tr>))}</tbody>
            <tfoot><tr className="bg-slate-950/40 font-bold border-t border-slate-800"><td className="px-3 py-2 text-slate-400">{tr("Total", "الإجمالي")}</td><td className="px-3 py-2 text-center font-mono">{tot.n}</td><td className="px-3 py-2 text-center font-mono text-emerald-400 [direction:ltr]">{fmtCents(tot.d)}</td><td className="px-3 py-2 text-center font-mono text-amber-400 [direction:ltr]">{fmtCents(tot.c)}</td><td /></tr></tfoot></table></div>)}
      </div>
    </div>
  );
}

// ── سجل التدقيق (يُعرض داخل لوحة تفاصيل القيد وفي تبويب المراجعة) ──
export function AuditList({ orgId, entryId, tr, lang, userName }: { orgId: number; entryId: number | null; tr: Tr; lang: "ar" | "en"; userName: (id?: string | null) => string }) {
  const [rows, setRows] = useState<API.AuditRow[] | null>(null);
  useEffect(() => { let a = true; API.fetchAudit(orgId, entryId, 100).then((r) => { if (a) setRows(r); }); return () => { a = false; }; }, [orgId, entryId]);
  const L: Record<string, [string, string]> = { create: ["Created", "إنشاء"], update: ["Edited", "تعديل"], request_approval: ["Sent for approval", "إرسال للاعتماد"], approve: ["Approved", "اعتماد"], post: ["Posted", "ترحيل"], reverse: ["Reversed", "عكس"], delete_draft: ["Draft deleted", "حذف مسودة"], recurring_generate: ["Recurring draft", "مسودة متكررة"] };
  if (!rows) return <div className="text-xs text-slate-400 p-2">…</div>;
  if (!rows.length) return <div className="text-xs text-slate-400 p-2" data-testid="audit-empty">{tr("No audit records.", "لا توجد سجلات تدقيق.")}</div>;
  return (<ul className="space-y-1.5" data-testid="audit-list">{rows.map((r) => (<li key={r.id} className="rounded-lg border border-slate-800 bg-slate-950/40 px-2.5 py-1.5 text-xs"><div className="flex items-center gap-2"><b className="text-slate-100">{tr(...(L[r.action] || [r.action, r.action]))}</b><span className="text-slate-400">{userName(r.actor)}</span><span className="ms-auto font-mono text-[10px] text-slate-400 [direction:ltr]">{String(r.at).slice(0, 16).replace("T", " ")}</span></div>{r.reason && <div className="text-[11px] text-slate-400 mt-0.5">{tr("Reason", "السبب")}: {r.reason}</div>}</li>))}{lang && null}</ul>);
}

// ── محرر سطور بسيط (للقوالب والقيود المتكررة) ──
type LineDraft = { account_id: number | ""; debit: string; credit: string; note: string };
const emptyL = (): LineDraft => ({ account_id: "", debit: "", credit: "", note: "" });
export function LinesEditor({ lines, setLines, renderAccount, tr, withAmounts }: { lines: LineDraft[]; setLines: (l: LineDraft[]) => void; renderAccount: (v: number | "", on: (v: number | "") => void) => ReactNode; tr: Tr; withAmounts: boolean }) {
  const set = (i: number, patch: Partial<LineDraft>) => setLines(lines.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  const d = lines.reduce((s, l) => s + toCents(l.debit), 0), c = lines.reduce((s, l) => s + toCents(l.credit), 0);
  return (
    <div className="space-y-1.5" data-testid="lines-editor">
      {lines.map((l, i) => (
        <div key={i} className="grid grid-cols-12 gap-1.5 items-center" data-testid="le-row">
          <div className="col-span-12 md:col-span-5">{renderAccount(l.account_id, (v) => set(i, { account_id: v }))}</div>
          <input inputMode="decimal" aria-label={tr("Debit", "مدين")} placeholder={tr("Debit", "مدين")} value={l.debit} onChange={(e) => set(i, { debit: normalizeDigits(e.target.value), credit: e.target.value ? "" : l.credit })} className={PIN + " col-span-4 md:col-span-2 !px-2 !py-1.5 text-center font-mono [direction:ltr]"} data-testid="le-debit" disabled={!withAmounts && false} />
          <input inputMode="decimal" aria-label={tr("Credit", "دائن")} placeholder={tr("Credit", "دائن")} value={l.credit} onChange={(e) => set(i, { credit: normalizeDigits(e.target.value), debit: e.target.value ? "" : l.debit })} className={PIN + " col-span-4 md:col-span-2 !px-2 !py-1.5 text-center font-mono [direction:ltr]"} data-testid="le-credit" />
          <input placeholder={tr("Note", "ملاحظة")} value={l.note} onChange={(e) => set(i, { note: e.target.value })} className={PIN + " col-span-3 md:col-span-2 !px-2 !py-1.5 !text-xs"} />
          <button type="button" aria-label={tr("Remove line", "حذف السطر")} onClick={() => lines.length > 2 && setLines(lines.filter((_, k) => k !== i))} className="col-span-1 w-7 h-7 rounded-lg bg-red-500/10 text-red-400 flex items-center justify-center hover:bg-red-500/20"><X size={13} /></button>
        </div>))}
      <div className="flex items-center gap-3 text-xs"><button type="button" onClick={() => setLines([...lines, emptyL()])} className={PBTN}><Plus size={13} /> {tr("Line", "سطر")}</button>
        {withAmounts && <span className={d === c && d > 0 ? "text-emerald-400 font-bold" : "text-amber-400 font-bold"} data-testid="le-balance">{d === c && d > 0 ? tr("Balanced", "متوازن") : tr(`Difference ${fmtCents(Math.abs(d - c))}`, `الفرق ${fmtCents(Math.abs(d - c))}`)}</span>}</div>
    </div>
  );
}

// ── القوالب ──
type AccRender = (v: number | "", on: (v: number | "") => void) => ReactNode;
export function TemplatesPanel(p: { tr: Tr; lang: "ar" | "en"; orgId: number; caps: API.Caps; renderAccount: AccRender; accName: (id: number) => string; typeOpts: { value: string; label: string }[]; onUse: (t: API.Template) => void; reloadKey: number }) {
  const { tr } = p; const [rows, setRows] = useState<API.Template[]>([]); const [edit, setEdit] = useState<API.Template | null>(null); const [lines, setLines] = useState<LineDraft[]>([emptyL(), emptyL()]); const [msg, setMsg] = useState("");
  const load = async () => setRows(await API.listTemplates(p.orgId));
  useEffect(() => { if (p.caps.templates) void load(); }, [p.orgId, p.caps.templates, p.reloadKey]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!p.caps.templates) return <Needs tr={tr} what={tr("Entry templates", "قوالب القيود")} />;
  const open = (t: API.Template | null) => { const base: API.Template = t ?? { organization_id: p.orgId, name: "", entry_type: "general", lines: [], keep_amounts: false, is_active: true }; setEdit(base); setMsg(""); setLines(base.lines.length ? base.lines.map((l) => ({ account_id: l.account_id, debit: l.side === "debit" && l.amount ? String(l.amount) : "", credit: l.side === "credit" && l.amount ? String(l.amount) : "", note: l.note || "" })) : [emptyL(), emptyL()]); };
  const save = async () => {
    if (!edit) return; if (!edit.name.trim()) { setMsg(tr("Template name is required", "اسم القالب مطلوب")); return; }
    const used = lines.filter((l) => l.account_id && (toCents(l.debit) > 0 || toCents(l.credit) > 0 || (!edit.keep_amounts)));
    const valid = lines.filter((l) => l.account_id); if (valid.length < 2) { setMsg(tr("Pick at least two accounts", "اختر حسابين على الأقل")); return; }
    void used; const tl: API.TplLine[] = valid.map((l) => { const side: "debit" | "credit" = toCents(l.credit) > 0 && toCents(l.debit) === 0 ? "credit" : "debit"; const amt = edit.keep_amounts ? (side === "debit" ? toCents(l.debit) : toCents(l.credit)) / 100 : null; return { account_id: Number(l.account_id), side, amount: amt, note: l.note || null }; });
    const r = await API.saveTemplate({ ...edit, lines: tl }); if (!r.ok) { setMsg(r.error || "error"); return; } setEdit(null); await load();
  };
  return (
    <div className="space-y-3" data-testid="templates-panel">
      <div className={`${PCARD} overflow-hidden`}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800"><Copy size={16} className="text-purple-400" /><h3 className="text-sm font-bold text-white">{tr("Entry templates", "قوالب القيود")}</h3><span className="flex-1" /><button type="button" className={PBTN_PURPLE} onClick={() => open(null)} data-testid="tpl-new"><Plus size={14} /> {tr("New template", "قالب جديد")}</button></div>
        {rows.length === 0 ? <Empty>{tr("No templates yet. Save any entry as a template from the entry form.", "لا توجد قوالب بعد. احفظ أي قيد كقالب من نموذج الإدخال.")}</Empty> : (
          <div className="divide-y divide-slate-800/60">{rows.map((t) => (
            <div key={t.id} className="flex items-center gap-3 px-4 py-2.5 text-xs" data-testid="tpl-row"><div className="min-w-0 flex-1"><div className="font-bold text-slate-100 truncate">{p.lang === "en" && t.name_en ? t.name_en : t.name}</div><div className="text-[11px] text-slate-400 truncate">{p.typeOpts.find((o) => o.value === t.entry_type)?.label} · {t.lines.map((l) => p.accName(l.account_id)).join(" / ")}{t.keep_amounts ? " · " + tr("with amounts", "بمبالغ ثابتة") : ""}</div></div>
              <button type="button" className={PBTN_BLUE} onClick={() => p.onUse(t)} data-testid="tpl-use"><Play size={13} /> {tr("Use", "استخدام")}</button>
              <button type="button" className={PBTN} aria-label={tr("Edit", "تعديل")} onClick={() => open(t)}><Pencil size={13} /></button>
              <button type="button" className={PBTN + " !text-red-400"} aria-label={tr("Delete", "حذف")} data-testid="tpl-del" onClick={async () => { if (!window.confirm(tr("Delete this template?", "حذف هذا القالب؟"))) return; const r = await API.deleteTemplate(t.id!); if (!r.ok) alert(r.error); await load(); }}><Trash2 size={13} /></button></div>))}</div>)}
      </div>
      {edit && (
        <div className={`${PCARD} p-4 space-y-3`} data-testid="tpl-form">
          <div className="flex items-center"><b className="text-sm text-white">{edit.id ? tr("Edit template", "تعديل القالب") : tr("New template", "قالب جديد")}</b><button type="button" className="ms-auto w-8 h-8 rounded-lg bg-slate-800 text-slate-400" aria-label={tr("Close", "إغلاق")} onClick={() => setEdit(null)}><X size={15} className="mx-auto" /></button></div>
          <div className="grid md:grid-cols-3 gap-3"><div><label className={PLBL}>{tr("Name (Arabic)", "الاسم (عربي)")}</label><input className={PIN} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} data-testid="tpl-name" /></div>
            <div><label className={PLBL}>{tr("Name (English)", "الاسم (إنجليزي)")}</label><input className={PIN} value={edit.name_en || ""} onChange={(e) => setEdit({ ...edit, name_en: e.target.value })} /></div>
            <div><label className={PLBL}>{tr("Entry type", "نوع القيد")}</label><select className={PIN} value={edit.entry_type} onChange={(e) => setEdit({ ...edit, entry_type: e.target.value })}>{p.typeOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
            <div className="md:col-span-3"><label className={PLBL}>{tr("Default description", "البيان الافتراضي")}</label><input className={PIN} value={edit.description || ""} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></div></div>
          <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={edit.keep_amounts} onChange={(e) => setEdit({ ...edit, keep_amounts: e.target.checked })} className="accent-purple-500" data-testid="tpl-keep" /> {tr("Keep fixed amounts (off by default — amounts are entered each time)", "تثبيت المبالغ (افتراضيًا لا تُحفظ المبالغ وتُدخل في كل مرة)")}</label>
          <LinesEditor lines={lines} setLines={setLines} renderAccount={p.renderAccount} tr={tr} withAmounts={edit.keep_amounts} />
          {msg && <div className="text-xs text-red-400" data-testid="tpl-msg">{msg}</div>}
          <div className="flex gap-2"><button type="button" className={PBTN_PURPLE} onClick={save} data-testid="tpl-save"><Save size={14} /> {tr("Save template", "حفظ القالب")}</button><button type="button" className={PBTN} onClick={() => setEdit(null)}>{tr("Cancel", "إلغاء")}</button></div>
        </div>)}{msg && !edit && null}
    </div>
  );
}

// ── القيود المتكررة ──
export function RecurringPanel(p: { tr: Tr; lang: "ar" | "en"; orgId: number; caps: API.Caps; renderAccount: AccRender; accName: (id: number) => string; typeOpts: { value: string; label: string }[]; branches: { id: number; name: string }[]; onGenerated: () => void }) {
  const { tr } = p; const today = new Date().toISOString().slice(0, 10);
  const [rows, setRows] = useState<API.Recurring[]>([]); const [edit, setEdit] = useState<API.Recurring | null>(null); const [lines, setLines] = useState<LineDraft[]>([emptyL(), emptyL()]); const [msg, setMsg] = useState(""); const [info, setInfo] = useState(""); const [busy, setBusy] = useState(false);
  const load = async () => setRows(await API.listRecurring(p.orgId));
  useEffect(() => { if (p.caps.recurring) void load(); }, [p.orgId, p.caps.recurring]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!p.caps.recurring) return <Needs tr={tr} what={tr("Recurring entries", "القيود المتكررة")} />;
  const FREQ: [API.Recurring["frequency"], string, string][] = [["daily", "Daily", "يوميًا"], ["weekly", "Weekly", "أسبوعيًا"], ["monthly", "Monthly", "شهريًا"], ["yearly", "Yearly", "سنويًا"], ["custom", "Custom (every N days)", "مخصص (كل N يوم)"]];
  const open = (r: API.Recurring | null) => { const b: API.Recurring = r ?? { organization_id: p.orgId, name: "", entry_type: "general", branch_id: null, lines: [], frequency: "monthly", interval_n: 1, start_date: today, end_date: null, next_run: today, is_active: true }; setEdit(b); setMsg(""); setLines(b.lines.length ? b.lines.map((l) => ({ account_id: l.account_id, debit: l.debit ? String(l.debit) : "", credit: l.credit ? String(l.credit) : "", note: l.note || "" })) : [emptyL(), emptyL()]); };
  const save = async () => {
    if (!edit) return; if (!edit.name.trim()) { setMsg(tr("Name is required", "الاسم مطلوب")); return; }
    const valid = lines.filter((l) => l.account_id && (toCents(l.debit) > 0 || toCents(l.credit) > 0)); const d = valid.reduce((s, l) => s + toCents(l.debit), 0), c = valid.reduce((s, l) => s + toCents(l.credit), 0);
    if (valid.length < 2) { setMsg(tr("Add at least two lines with account and amount", "أضف سطرين على الأقل بحساب ومبلغ")); return; } if (d !== c) { setMsg(tr("The template entry must be balanced", "القيد المتكرر يجب أن يكون متوازنًا")); return; }
    if (edit.end_date && edit.end_date < edit.start_date) { setMsg(tr("End date is before start date", "تاريخ النهاية قبل البداية")); return; }
    const rl: API.RecLine[] = valid.map((l) => ({ account_id: Number(l.account_id), debit: toCents(l.debit) / 100, credit: toCents(l.credit) / 100, note: l.note || null }));
    const r = await API.saveRecurring({ ...edit, lines: rl, next_run: edit.id ? edit.next_run : edit.start_date }); if (!r.ok) { setMsg(r.error || "error"); return; } setEdit(null); await load();
  };
  const generate = async () => { setBusy(true); setInfo(""); const r = await API.generateRecurring(p.orgId, today, p.lang === "ar"); setBusy(false); if (!r.ok) { setInfo(r.error || "error"); return; } setInfo(tr(`${r.data} draft entr${r.data === 1 ? "y" : "ies"} generated for review (nothing was posted).`, `تم توليد ${r.data} مسودة للمراجعة (لم يُرحَّل شيء).`)); await load(); p.onGenerated(); };
  return (
    <div className="space-y-3" data-testid="recurring-panel">
      <div className={`${PCARD} overflow-hidden`}>
        <div className="flex items-center gap-2 flex-wrap px-4 py-3 border-b border-slate-800"><BookOpen size={16} className="text-purple-400" /><h3 className="text-sm font-bold text-white">{tr("Recurring entries", "القيود المتكررة")}</h3><span className="flex-1" />
          <button type="button" className={PBTN} onClick={generate} disabled={busy} data-testid="rec-generate"><Play size={14} /> {tr("Generate due drafts", "توليد المسودات المستحقة")}</button>
          <button type="button" className={PBTN_PURPLE} onClick={() => open(null)} data-testid="rec-new"><Plus size={14} /> {tr("New recurring entry", "قيد متكرر جديد")}</button></div>
        <div className="px-4 py-2 text-[11px] text-slate-400 border-b border-slate-800">{tr("Recurring entries are created as drafts for review. They are never posted automatically.", "تُنشأ القيود المتكررة كمسودات للمراجعة ولا تُرحَّل تلقائيًا.")}</div>
        {info && <div className="px-4 py-2 text-xs text-emerald-400" data-testid="rec-info">{info}</div>}
        {rows.length === 0 ? <Empty>{tr("No recurring entries.", "لا توجد قيود متكررة.")}</Empty> : (
          <div className="divide-y divide-slate-800/60">{rows.map((r) => (<div key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-xs" data-testid="rec-row"><div className="min-w-0 flex-1"><div className="font-bold text-slate-100 truncate">{r.name} {!r.is_active && <span className="text-[10px] text-slate-400">({tr("inactive", "موقوف")})</span>}</div>
            <div className="text-[11px] text-slate-400">{tr(...(FREQ.find((f) => f[0] === r.frequency)!.slice(1) as [string, string]))} ×{r.interval_n} · {tr("next", "التالي")} <span className="font-mono [direction:ltr] inline-block">{r.next_run}</span>{r.last_run ? <> · {tr("last", "آخر")} <span className="font-mono [direction:ltr] inline-block">{r.last_run}</span></> : null}</div></div>
            <button type="button" className={PBTN} aria-label={tr("Edit", "تعديل")} onClick={() => open(r)}><Pencil size={13} /></button>
            <button type="button" className={PBTN + " !text-red-400"} aria-label={tr("Delete", "حذف")} onClick={async () => { if (!window.confirm(tr("Delete this recurring entry? Generated drafts are kept.", "حذف هذا القيد المتكرر؟ المسودات المولّدة تبقى."))) return; const x = await API.deleteRecurring(r.id!); if (!x.ok) alert(x.error); await load(); }}><Trash2 size={13} /></button></div>))}</div>)}
      </div>
      {edit && (
        <div className={`${PCARD} p-4 space-y-3`} data-testid="rec-form">
          <div className="flex items-center"><b className="text-sm text-white">{edit.id ? tr("Edit recurring entry", "تعديل القيد المتكرر") : tr("New recurring entry", "قيد متكرر جديد")}</b><button type="button" className="ms-auto w-8 h-8 rounded-lg bg-slate-800 text-slate-400" aria-label={tr("Close", "إغلاق")} onClick={() => setEdit(null)}><X size={15} className="mx-auto" /></button></div>
          <div className="grid md:grid-cols-4 gap-3">
            <div className="md:col-span-2"><label className={PLBL}>{tr("Name", "اسم القيد المتكرر")}</label><input className={PIN} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} data-testid="rec-name" /></div>
            <div><label className={PLBL}>{tr("Entry type", "نوع القيد")}</label><select className={PIN} value={edit.entry_type} onChange={(e) => setEdit({ ...edit, entry_type: e.target.value })}>{p.typeOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
            <div><label className={PLBL}>{tr("Branch", "الفرع")}</label><select className={PIN} value={edit.branch_id ?? ""} onChange={(e) => setEdit({ ...edit, branch_id: e.target.value ? Number(e.target.value) : null })}><option value="">—</option>{p.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
            <div className="md:col-span-4"><label className={PLBL}>{tr("Description", "البيان")}</label><input className={PIN} value={edit.description || ""} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></div>
            <div><label className={PLBL}>{tr("Frequency", "دورية التكرار")}</label><select className={PIN} value={edit.frequency} onChange={(e) => setEdit({ ...edit, frequency: e.target.value as API.Recurring["frequency"] })} data-testid="rec-freq">{FREQ.map(([k, en, ar]) => <option key={k} value={k}>{tr(en, ar)}</option>)}</select></div>
            <div><label className={PLBL}>{tr("Every N", "كل (N)")}</label><input type="number" min={1} className={PIN} value={edit.interval_n} onChange={(e) => setEdit({ ...edit, interval_n: Math.max(1, Number(e.target.value) || 1) })} /></div>
            <div><label className={PLBL}>{tr("Start date", "تاريخ البداية")}</label><input type="date" className={PIN} value={edit.start_date} onChange={(e) => setEdit({ ...edit, start_date: e.target.value, next_run: edit.id ? edit.next_run : e.target.value })} data-testid="rec-start" /></div>
            <div><label className={PLBL}>{tr("End date (optional)", "تاريخ النهاية (اختياري)")}</label><input type="date" className={PIN} value={edit.end_date || ""} onChange={(e) => setEdit({ ...edit, end_date: e.target.value || null })} /></div></div>
          <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={edit.is_active} onChange={(e) => setEdit({ ...edit, is_active: e.target.checked })} className="accent-purple-500" /> {tr("Active", "مفعّل")}</label>
          <LinesEditor lines={lines} setLines={setLines} renderAccount={p.renderAccount} tr={tr} withAmounts />
          {msg && <div className="text-xs text-red-400" data-testid="rec-msg">{msg}</div>}
          <div className="flex gap-2"><button type="button" className={PBTN_PURPLE} onClick={save} data-testid="rec-save"><Save size={14} /> {tr("Save", "حفظ")}</button><button type="button" className={PBTN} onClick={() => setEdit(null)}>{tr("Cancel", "إلغاء")}</button></div>
        </div>)}
    </div>
  );
}

// ── إعدادات المركز (إقفال الفترة/الاعتماد/الحدود) — للمدير فقط في الواجهة، والخادم يفرضها ──
export function SettingsPanel(p: { tr: Tr; orgId: number; caps: API.Caps; canEdit: boolean; settings: API.JSettings | null; onSaved: (s: API.JSettings) => void }) {
  const { tr } = p; const base: API.JSettings = p.settings ?? { organization_id: p.orgId, require_approval: false, lock_through: null, attachment_required_over: null, high_amount_threshold: null };
  const [s, setS] = useState(base); const [msg, setMsg] = useState(""); useEffect(() => setS(base), [p.settings]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!p.caps.settings) return <Needs tr={tr} what={tr("Closing periods & approval", "إقفال الفترات والاعتماد")} />;
  const num = (v: string): number | null => { const c = toCents(v); return v.trim() === "" ? null : c / 100; };
  return (
    <div className={`${PCARD} p-4 space-y-3`} data-testid="settings-panel">
      <div className="flex items-center gap-2"><Scale size={16} className="text-blue-400" /><b className="text-sm text-white">{tr("Control settings", "إعدادات الرقابة")}</b>{!p.canEdit && <span className="text-[11px] text-amber-400">{tr("Read only — admins only", "للقراءة فقط — للمدير")}</span>}</div>
      <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" disabled={!p.canEdit} checked={s.require_approval} onChange={(e) => setS({ ...s, require_approval: e.target.checked })} className="accent-blue-500" data-testid="st-approval" /> {tr("Require approval before posting (creator cannot approve their own entry)", "اشتراط الاعتماد قبل الترحيل (لا يعتمد المنشئ قيده بنفسه)")}</label>
      <div className="grid md:grid-cols-3 gap-3">
        <div><label className={PLBL}>{tr("Closed through (inclusive)", "مغلقة حتى تاريخ (شاملًا)")}</label><input type="date" disabled={!p.canEdit} className={PIN} value={s.lock_through || ""} onChange={(e) => setS({ ...s, lock_through: e.target.value || null })} data-testid="st-lock" /></div>
        <div><label className={PLBL}>{tr("High-value threshold", "حد المبالغ المرتفعة")}</label><input inputMode="decimal" disabled={!p.canEdit} className={PIN + " [direction:ltr] text-center"} value={s.high_amount_threshold ?? ""} onChange={(e) => setS({ ...s, high_amount_threshold: num(normalizeDigits(e.target.value)) })} placeholder={tr("auto", "تلقائي")} /></div>
        <div><label className={PLBL}>{tr("Attachment required over", "اشتراط مرفق فوق مبلغ")}</label><input inputMode="decimal" disabled={!p.canEdit} className={PIN + " [direction:ltr] text-center"} value={s.attachment_required_over ?? ""} onChange={(e) => setS({ ...s, attachment_required_over: num(normalizeDigits(e.target.value)) })} placeholder="—" /></div></div>
      {msg && <div className="text-xs text-emerald-400" data-testid="st-msg">{msg}</div>}
      {p.canEdit && <button type="button" className={PBTN_BLUE} data-testid="st-save" onClick={async () => { const r = await API.saveSettings(s); setMsg(r.ok ? tr("Saved", "تم الحفظ") : r.error || "error"); if (r.ok) p.onSaved(s); }}><Save size={14} /> {tr("Save settings", "حفظ الإعدادات")}</button>}
    </div>
  );
}
export { AlertTriangle, sumCents };
