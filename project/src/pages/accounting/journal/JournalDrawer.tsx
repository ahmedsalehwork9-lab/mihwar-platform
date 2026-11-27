// =============================================================
// src/pages/accounting/journal/JournalDrawer.tsx
// لوحة تفاصيل القيد + حوار العكس بسبب + طباعة القيد. ثنائية اللغة، تعمل في الثيمين.
// =============================================================
import { useEffect, useState } from "react";
import { X, FileCheck2, Paperclip, Send, Pencil, Trash2, RotateCcw, Printer, Copy, ShieldCheck, CheckCircle2, ExternalLink, AlertTriangle } from "lucide-react";
import * as DB from "../../lib/accountingDb";
import { type JEntry, stateOf, sumCents, isReversal } from "./reviewLogic";
import { fmtCents } from "./money";
import { AuditList, type PrintInfo, type Tr, PBTN, PBTN_BLUE, PIN, PLBL } from "./JournalPanels";
import { buildDocHTML } from "../../print/docTemplates";
import { fetchPrintOrg, type PrintOrg } from "../../sales/salesInvoiceApi";
import { printHTML } from "../../sales/salesInvoicePrint";
import type { Caps } from "./journalApi";

import { curEn } from "../../lib/orgConfig";
export const stateBadge = (tr: Tr): Record<string, { label: string; cls: string }> => ({
  draft: { label: tr("Draft", "مسودة"), cls: "bg-amber-500/15 text-amber-400" },
  pending: { label: tr("Awaiting approval", "بانتظار الاعتماد"), cls: "bg-purple-500/15 text-purple-400" },
  approved: { label: tr("Approved", "معتمد"), cls: "bg-blue-500/15 text-blue-400" },
  posted: { label: tr("Posted", "مرحّل"), cls: "bg-emerald-500/15 text-emerald-400" },
  reversed: { label: tr("Reversed", "معكوس"), cls: "bg-red-500/15 text-red-400" },
});

/** طباعة القيد بقالب «قيد يومية» الموحّد (نفس قالب السندات: ترويسة الشركة/الشعار وإعدادات طباعة الفرع: الورق/الاتجاه/اللغة/التوقيع). */
export function printEntryDoc(e: { jv: string; date: string; description: string | null; typeLabel: string; stateLabel: string; branch: string; branchId?: number | null; notes?: string | null; draft?: boolean; lines: { code: string; name: string; note: string; debit: number; credit: number }[] }, tr: Tr, info: PrintInfo): void {
  const d = e.lines.reduce((s, l) => s + l.debit, 0);
  const fallback: PrintOrg = { name: info.orgName, tax_number: info.taxNumber ?? null, commercial_registration: null, phone: null, address: info.address ?? null, logo_url: info.logoUrl ?? null };
  const shopId = e.branchId ?? info.shopId ?? null;
  void fetchPrintOrg(info.orgId ?? 0, info.shopId ?? null).catch(() => fallback).then((org) => printHTML(buildDocHTML({
    kind: "journal_voucher", number: e.jv, date: e.date, partyName: null, total: d, currency: curEn(), description: e.description, notes: e.notes || null, branchId: shopId, draft: e.draft,
    refs: [[tr("Type", "النوع"), e.typeLabel], [tr("Status", "الحالة"), e.stateLabel], ...(e.branch ? [[tr("Branch", "الفرع"), e.branch] as [string, string]] : [])],
    lines: e.lines.map((l) => ({ account: `${l.code} ${l.name}`.trim(), debit: l.debit, credit: l.credit, note: l.note || null })),
  }, org, info.lang)));
}

export function ReasonDialog({ tr, title, hint, confirmLabel, withDate, onCancel, onConfirm }: { tr: Tr; title: string; hint?: string; confirmLabel: string; withDate?: boolean; onCancel: () => void; onConfirm: (reason: string, date: string) => void }) {
  const [reason, setReason] = useState(""); const [date, setDate] = useState(new Date().toISOString().slice(0, 10)); const [err, setErr] = useState("");
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60" role="dialog" aria-modal="true" aria-label={title} data-testid="reason-dialog" onClick={onCancel}>
      <div onClick={(ev) => ev.stopPropagation()} className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 shadow-2xl">
        <div className="flex items-center gap-2"><AlertTriangle size={18} className="text-amber-400" /><b className="text-sm text-white">{title}</b><button type="button" onClick={onCancel} aria-label={tr("Close", "إغلاق")} className="ms-auto w-8 h-8 rounded-lg bg-slate-800 text-slate-400"><X size={15} className="mx-auto" /></button></div>
        {hint && <div className="text-xs text-slate-400">{hint}</div>}
        {withDate && <div><label className={PLBL}>{tr("Reversal date", "تاريخ القيد العكسي")}</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={PIN} data-testid="rd-date" /></div>}
        <div><label className={PLBL}>{tr("Reason (required)", "السبب (مطلوب)")}</label><textarea rows={3} value={reason} onChange={(e) => { setReason(e.target.value); setErr(""); }} className={PIN + " resize-y"} data-testid="rd-reason" autoFocus /></div>
        {err && <div className="text-xs text-red-400" data-testid="rd-err">{err}</div>}
        <div className="flex gap-2 justify-end"><button type="button" className={PBTN} onClick={onCancel}>{tr("Cancel", "إلغاء")}</button><button type="button" className={PBTN_BLUE} data-testid="rd-ok" onClick={() => { if (!reason.trim()) { setErr(tr("A reason is required", "السبب مطلوب")); return; } onConfirm(reason.trim(), date); }}>{confirmLabel}</button></div>
      </div>
    </div>
  );
}

type DrawerProps = {
  entry: JEntry; tr: Tr; dir: "rtl" | "ltr"; caps: Caps; orgId: number; lang: "ar" | "en"; jv: string; typeLabel: string; branchName: (id: number) => string; userName: (id?: string | null) => string;
  accInfo: (id: number) => { code: string; name: string; level: number };
  requireApproval: boolean; onClose: () => void; onPost?: () => void; onEdit?: () => void; onDelete?: () => void; onReverse?: () => void; onCopy: () => void; onRequestApproval?: () => void; onApprove?: () => void; onPrint: () => void; busy: boolean; jvOf: (id: number) => string;
};
export function JournalDrawer(p: DrawerProps) {
  const { tr, entry: e } = p; const st = stateOf(e); const badge = stateBadge(tr)[st]; const { d, c } = sumCents(e);
  const [atts, setAtts] = useState<DB.GLAttachment[]>([]); const [showAudit, setShowAudit] = useState(false);
  useEffect(() => { let a = true; DB.fetchAttachments(e.id).then((r) => { if (a) setAtts(r); }); return () => { a = false; }; }, [e.id]);
  const openAtt = async (att: DB.GLAttachment) => { const url = await DB.signedUrl(att.file_path); if (url) window.open(url, "_blank"); else alert(tr("Could not open the attachment", "تعذّر فتح المرفق")); };
  const Info = ({ label, value }: { label: string; value: React.ReactNode }) => (<div><div className="text-[10px] text-slate-400 font-bold">{label}</div><div className="text-sm text-slate-200 break-words">{value}</div></div>);
  const ts = (v?: string | null) => (v ? <span className="font-mono [direction:ltr] inline-block text-xs">{String(v).slice(0, 16).replace("T", " ")}</span> : "—");
  const kb = (n?: number | null) => (n ? (n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB") : "");
  return (
    <div className="fixed inset-0 z-50 flex" onClick={p.onClose} data-testid="je-drawer">
      <div className="flex-1 bg-black/50" />
      <div dir={p.dir} onClick={(ev) => ev.stopPropagation()} className="w-full max-w-lg bg-slate-900 border-s border-slate-800 h-full overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-slate-900 border-b border-slate-800 px-4 py-3 flex items-center justify-between z-10">
          <div className="flex items-center gap-2"><FileCheck2 size={18} className="text-blue-400" /><div><div className="font-mono font-bold text-blue-400 [direction:ltr]" data-testid="drawer-jv">{p.jv}</div><div className="text-[10px] text-slate-400">{p.typeLabel}</div></div></div>
          <button onClick={p.onClose} aria-label={tr("Close", "إغلاق")} className="w-8 h-8 rounded-lg bg-slate-800 text-slate-400 flex items-center justify-center hover:text-white"><X size={16} /></button>
        </div>
        <div className="p-4 space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[11px] px-2.5 py-1 rounded-full font-bold ${badge.cls}`} data-testid="drawer-state">{badge.label}</span>
            {isReversal(e) && <span className="text-[11px] px-2.5 py-1 rounded-full bg-purple-500/10 text-purple-400">{tr("Reversal entry", "قيد عكسي")}</span>}
            {atts.length > 0 && <span className="text-[11px] px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-400 inline-flex items-center gap-1"><Paperclip size={11} /> {atts.length} {tr("attachments", "مرفق")}</span>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Info label={tr("Date", "التاريخ")} value={<span className="font-mono [direction:ltr]">{e.date}</span>} />
            <Info label={tr("Branch", "الفرع")} value={e.branch_id != null ? p.branchName(e.branch_id) : "—"} />
            <div className="col-span-2"><Info label={tr("Description", "البيان")} value={e.description || "—"} /></div>
            <Info label={tr("Created by", "المنشئ")} value={p.userName(e.created_by)} /><Info label={tr("Created at", "أُنشئ في")} value={ts(e.created_at)} />
            {p.caps.applied && <><Info label={tr("Approved by", "المعتمد")} value={e.approved_by ? p.userName(e.approved_by) : "—"} /><Info label={tr("Approved at", "تاريخ الاعتماد")} value={ts(e.approved_at)} />
              <Info label={tr("Posted by", "المُرحِّل")} value={e.posted_by ? p.userName(e.posted_by) : "—"} /><Info label={tr("Posted at", "تاريخ الترحيل")} value={ts(e.posted_at)} />
              <Info label={tr("Currency", "العملة")} value={e.currency_code || curEn()} /><Info label={tr("External reference", "المرجع الخارجي")} value={e.external_ref || "—"} />
              {(e.project || e.cost_center) && <Info label={tr("Project / cost center", "المشروع / مركز التكلفة")} value={[e.project, e.cost_center].filter(Boolean).join(" / ")} />}
              {e.reversed_of != null && <Info label={tr("Reverses", "يعكس القيد")} value={<span className="font-mono [direction:ltr]">{p.jvOf(e.reversed_of)}</span>} />}
              {e.reversed_by != null && <Info label={tr("Reversed by", "عُكس بالقيد")} value={<span className="font-mono [direction:ltr]">{p.jvOf(e.reversed_by)}</span>} />}</>}
          </div>
          <div className="rounded-xl border border-slate-800 overflow-hidden">
            <table className="w-full text-xs"><thead><tr className="bg-slate-950/50 text-slate-400 text-[10px]"><th className="px-2 py-2 text-start font-bold">{tr("Account", "الحساب")}</th><th className="px-2 py-2 text-center font-bold w-24">{tr("Debit", "مدين")}</th><th className="px-2 py-2 text-center font-bold w-24">{tr("Credit", "دائن")}</th></tr></thead>
              <tbody className="divide-y divide-slate-800/60">{(e.lines || []).map((l, i) => { const a = p.accInfo(l.account_id); return (
                <tr key={i}><td className="px-2 py-2 text-slate-200"><span className="font-mono text-slate-400 [direction:ltr] inline-block text-[10px]">{a.code}</span> {a.name}{l.note ? <div className="text-[10px] text-slate-400">{l.note}</div> : null}{l.branch_id != null && l.branch_id !== e.branch_id ? <div className="text-[10px] text-slate-400">{p.branchName(Number(l.branch_id))}</div> : null}</td>
                  <td className="px-2 py-2 text-center font-mono text-emerald-400 [direction:ltr]">{Number(l.debit) ? fmtCents(Math.round(Number(l.debit) * 100)) : ""}</td><td className="px-2 py-2 text-center font-mono text-amber-400 [direction:ltr]">{Number(l.credit) ? fmtCents(Math.round(Number(l.credit) * 100)) : ""}</td></tr>); })}</tbody>
              <tfoot><tr className="bg-slate-950/40 font-bold border-t border-slate-800"><td className="px-2 py-2 text-slate-400">{tr("Total", "الإجمالي")}</td><td className="px-2 py-2 text-center font-mono text-emerald-400 [direction:ltr]">{fmtCents(d)}</td><td className="px-2 py-2 text-center font-mono text-amber-400 [direction:ltr]">{fmtCents(c)}</td></tr></tfoot></table>
          </div>
          {d !== c && <div className="text-[11px] text-amber-400">⚠ {tr("Entry is not balanced — difference", "القيد غير متوازن — الفرق")} {fmtCents(Math.abs(d - c))}</div>}
          {e.notes ? <div className="text-[11px] text-slate-400 bg-slate-950/40 rounded-lg p-2">📝 {e.notes}</div> : null}
          {atts.length > 0 && (<div><div className="text-[10px] text-slate-400 font-bold mb-1">{tr("Attachments", "المرفقات")}</div><div className="space-y-1">{atts.map((a) => (<button key={a.id} type="button" onClick={() => openAtt(a)} data-testid="drawer-att" className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 hover:text-blue-400"><Paperclip size={12} className="text-blue-400 shrink-0" /><span className="truncate">{a.file_name}</span><span className="ms-auto text-[10px] text-slate-400 shrink-0">{kb((a as unknown as { size_bytes?: number }).size_bytes)} {a.mime_type ? "· " + a.mime_type.split("/")[1] : ""}</span><ExternalLink size={11} className="opacity-60" /></button>))}</div></div>)}
          <div className="flex flex-wrap gap-2 pt-1">
            <button onClick={p.onPrint} className={PBTN} data-testid="drawer-print"><Printer size={13} /> {tr("Print", "طباعة")}</button>
            <button onClick={p.onCopy} className={PBTN} data-testid="drawer-copy"><Copy size={13} /> {tr("Copy entry", "نسخ القيد")}</button>
            {p.onRequestApproval && <button onClick={p.onRequestApproval} className={PBTN} data-testid="drawer-request"><ShieldCheck size={13} /> {tr("Send for approval", "إرسال للاعتماد")}</button>}
            {p.onApprove && <button onClick={p.onApprove} className={PBTN_BLUE} data-testid="drawer-approve"><CheckCircle2 size={13} /> {tr("Approve", "اعتماد")}</button>}
            {p.onPost && <button onClick={p.onPost} disabled={p.busy} className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 text-[#fff] text-xs font-bold hover:bg-emerald-500 disabled:opacity-50" data-testid="drawer-post"><Send size={13} /> {tr("Post entry", "ترحيل القيد")}</button>}
            {p.onEdit && <button onClick={p.onEdit} className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-blue-500/10 text-blue-400 text-xs font-bold hover:bg-blue-500/20" data-testid="drawer-edit"><Pencil size={13} /> {tr("Edit", "تعديل")}</button>}
            {p.onDelete && <button onClick={p.onDelete} className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-red-500/10 text-red-400 text-xs font-bold hover:bg-red-500/20" data-testid="drawer-delete"><Trash2 size={13} /> {tr("Delete", "حذف")}</button>}
            {p.onReverse && <button onClick={p.onReverse} disabled={p.busy} className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-purple-500/10 text-purple-400 text-xs font-bold hover:bg-purple-500/20 disabled:opacity-50" data-testid="drawer-reverse"><RotateCcw size={13} /> {tr("Reverse entry", "قيد عكسي (تصحيح)")}</button>}
          </div>
          {st === "reversed" && <div className="text-[11px] text-slate-400 text-center">{tr("This entry has already been reversed.", "تم عكس هذا القيد مسبقًا.")}</div>}
          {p.caps.audit && (<div><button type="button" onClick={() => setShowAudit((v) => !v)} className="text-xs font-bold text-blue-400 underline" data-testid="drawer-audit-toggle">{showAudit ? tr("Hide audit trail", "إخفاء سجل التدقيق") : tr("Show audit trail", "عرض سجل التدقيق")}</button>{showAudit && <div className="mt-2"><AuditList orgId={p.orgId} entryId={e.id} tr={tr} lang={p.lang} userName={p.userName} /></div>}</div>)}
          {!p.caps.audit && <div className="text-[10px] text-slate-400" data-testid="drawer-no-audit">{tr("Audit trail activates after the journal-center migration is applied.", "سجل التدقيق يعمل بعد تطبيق Migration مركز القيود.")}</div>}
        </div>
      </div>
    </div>
  );
}
