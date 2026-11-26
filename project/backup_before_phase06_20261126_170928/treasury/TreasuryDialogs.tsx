// =============================================================
// src/pages/accounting/treasury/TreasuryDialogs.tsx
// نوافذ: سند قبض/صرف · تحويل بين الحسابات · إعداد خزنة/بنك · الإعدادات · تفاصيل حركة.
// كل العمليات تمرّ عبر accountingDb (createVoucher/createEntry/reverseEntry) — لا منطق محاسبي موازٍ.
// =============================================================

import { useMemo, useRef, useState } from "react";
import { ArrowDownCircle, ArrowUpCircle, ArrowLeftRight, Paperclip, X, Check, Save, Plus, Pencil, Trash2, Settings, Eye, Printer, Undo2 } from "lucide-react";
import { useLang } from "../../../context/LanguageContext";
import * as DB from "../../lib/accountingDb";
import SmartSelect from "./SmartSelect";
import { Modal, Field, INPUT, DATE_INPUT, BTN_SOFT, BTN_BLUE, BTN_GREEN, BTN_RED, fmt, todayLocal } from "./ui";
import type { Tr } from "./i18n";
import { type Ctx, type Row, resolvePartyAccount } from "./types";
import { treasuryOptions, ledgerAccountOptions, partyOptions, branchOptions } from "./options";
import { createTransfer, type Treasury, type EntryLine } from "./treasuryDb";
import { openPrint, esc } from "./print";

// طرق الدفع تُخزَّن كما كانت (عربي) للحفاظ على اتساق بيانات الملاحظات القائمة
const METHODS: { v: string; k: "methodCash" | "methodTransfer" | "methodCheque" | "methodCard" | "methodOther" }[] = [
  { v: "نقدًا", k: "methodCash" }, { v: "تحويل بنكي", k: "methodTransfer" }, { v: "شيك", k: "methodCheque" }, { v: "بطاقة", k: "methodCard" }, { v: "أخرى", k: "methodOther" },
];

type Common = { ctx: Ctx; T: Tr; onClose: () => void };

// ───────────────────────── سند قبض / صرف ─────────────────────────
export function VoucherDialog({ ctx, T, treasuries, allTreasuries, balances, initialKind, onClose, onSaved }: Common & {
  treasuries: Treasury[]; allTreasuries: Treasury[]; balances: Map<number, number>; initialKind: "receipt" | "payment"; onSaved: () => void;
}) {
  const [kind, setKind] = useState<"receipt" | "payment">(initialKind);
  const [trId, setTrId] = useState<number | "">("");
  const [partyId, setPartyId] = useState<number | "">("");
  const [counterId, setCounterId] = useState<number | "">("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayLocal());
  const [method, setMethod] = useState(METHODS[0].v);
  const [ref, setRef] = useState("");
  const [desc, setDesc] = useState("");
  const [costBranch, setCostBranch] = useState<number | "">("");
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const tOpts = useMemo(() => treasuryOptions(treasuries, ctx.accById, ctx.branches, T, balances), [treasuries, ctx.accById, ctx.branches, T, balances]);
  const treasuryAccIds = useMemo(() => new Set(allTreasuries.map((x) => x.account_id).filter(Boolean) as number[]), [allTreasuries]);
  const counterOpts = useMemo(() => ledgerAccountOptions(ctx.postable.filter((a) => !treasuryAccIds.has(a.id)), T), [ctx.postable, treasuryAccIds, T]);
  const pOpts = useMemo(() => partyOptions(ctx.parties, T), [ctx.parties, T]);
  const tr = treasuries.find((x) => x.id === trId);

  const addFiles = (fl: FileList | null) => {
    if (!fl?.length) return;
    const arr = Array.from(fl);
    const big = arr.find((f) => f.size > 10 * 1024 * 1024);
    if (big) { ctx.notify(T.fileTooBig + big.name, "err"); return; }
    setFiles((p) => [...p, ...arr]);
  };

  const submit = async () => {
    const e: Record<string, string> = {};
    if (!tr) e.tr = T.pickAccount; else if (!tr.account_id) e.tr = T.unlinkedAcc;
    if (counterId === "") e.counter = T.pickCounter;
    const amt = parseFloat(amount) || 0;
    if (amt <= 0) e.amount = T.amountPositive;
    setErr(e);
    if (Object.keys(e).length || !tr) return;
    const party = ctx.parties.find((p) => p.id === partyId);
    const desc2 = desc.trim() || ((kind === "receipt" ? "سند قبض" : "سند صرف") + (party ? ` — ${party.name}` : ""));
    const notes = [method, party ? `الطرف: ${party.name}` : "", ref.trim() ? `ref: ${ref.trim()}` : ""].filter(Boolean).join(" · ") || null;
    setSaving(true);
    const r = await DB.createVoucher(ctx.org.id, {
      kind, date, treasury_account_id: tr.account_id!, counter_account_id: Number(counterId), amount: amt,
      description: desc2, notes, branch_id: (costBranch !== "" ? Number(costBranch) : tr.branch_id) ?? null,
      party_id: partyId === "" ? null : Number(partyId),
    });
    if (!r.ok) { setSaving(false); ctx.notify(T.saveFailed + (r.error || ""), "err"); return; }
    if (r.id) for (const f of files) { const up = await DB.uploadAttachment(ctx.org.id, r.id, f); if (!up.ok) ctx.notify(`${T.uploadFailed}${f.name} ${up.error || ""}`, "err"); }
    setSaving(false);
    ctx.notify(T.voucherSaved, "ok");
    onSaved(); onClose();
  };

  const isR = kind === "receipt";
  return (
    <Modal title={isR ? T.receiptVoucher : T.paymentVoucher} icon={isR ? <ArrowDownCircle size={16} /> : <ArrowUpCircle size={16} />} onClose={onClose}
      footer={<>
        <p className="text-[11px] text-slate-400 flex-1 min-w-[160px]">{isR ? T.journalHintReceipt : T.journalHintPayment}</p>
        <button type="button" onClick={onClose} className={BTN_SOFT}><X size={14} /> {T.cancel}</button>
        <button type="button" onClick={submit} disabled={saving} className={isR ? BTN_GREEN : BTN_RED}><Check size={16} /> {saving ? T.saving : T.saveVoucher}</button>
      </>}>
      <div className="inline-flex gap-1 bg-slate-950 border border-slate-800 rounded-xl p-1 mb-4">
        <button type="button" onClick={() => setKind("receipt")} className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold ${isR ? "bg-emerald-500 text-emerald-950" : "text-slate-300 hover:text-slate-200"}`}><ArrowDownCircle size={15} /> {T.receiptVoucher}</button>
        <button type="button" onClick={() => setKind("payment")} className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold ${!isR ? "bg-red-500 text-[#fff]" : "text-slate-300 hover:text-slate-200"}`}><ArrowUpCircle size={15} /> {T.paymentVoucher}</button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label={T.voucherNo}><input disabled value={T.autoNo} className={INPUT + " text-slate-400"} /></Field>
        <Field label={T.date}><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={DATE_INPUT} /></Field>
        <Field label={T.cashOrBank} className="sm:col-span-2">
          <SmartSelect options={tOpts} value={trId} onChange={(v) => { setTrId(v === "" ? "" : Number(v)); setErr((x) => ({ ...x, tr: "" })); }} placeholder={T.select} searchPlaceholder={T.searchPh} />
          {err.tr && <p className="text-[11px] text-red-300 mt-1">{err.tr}</p>}
        </Field>
        <Field label={T.partyOpt} className="sm:col-span-2">
          <SmartSelect options={pOpts} value={partyId} placeholder={T.none} searchPlaceholder={T.searchParty}
            onChange={(v) => {
              if (v === "") { setPartyId(""); return; }
              const p = ctx.parties.find((x) => x.id === Number(v));
              const acc = p ? resolvePartyAccount(p, ctx.parties) : null;
              if (!p || !acc) { ctx.notify(T.partyNoAcc, "err"); return; }
              setPartyId(p.id); setCounterId(acc);
            }} />
        </Field>
        <Field label={isR ? T.counterSource : T.counterTarget} className="sm:col-span-2">
          <SmartSelect options={counterOpts} value={counterId} placeholder={T.select} searchPlaceholder={T.searchPh}
            onChange={(v) => { setCounterId(v === "" ? "" : Number(v)); setPartyId(""); setErr((x) => ({ ...x, counter: "" })); }} />
          {err.counter && <p className="text-[11px] text-red-300 mt-1">{err.counter}</p>}
        </Field>
        <Field label={T.amount}>
          <input type="number" inputMode="decimal" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className={INPUT + " [direction:ltr] text-center font-mono"} />
          {err.amount && <p className="text-[11px] text-red-300 mt-1">{err.amount}</p>}
        </Field>
        <Field label={T.payMethod}>
          <select value={method} onChange={(e) => setMethod(e.target.value)} className={INPUT}>{METHODS.map((m) => <option key={m.v} value={m.v}>{T[m.k]}</option>)}</select>
        </Field>
        <Field label={T.reference}><input value={ref} onChange={(e) => setRef(e.target.value)} className={INPUT + " [direction:ltr]"} /></Field>
        {ctx.branches.length > 1 && (
          <Field label={T.costCenter}><SmartSelect options={branchOptions(ctx.branches)} value={costBranch} onChange={(v) => setCostBranch(v === "" ? "" : Number(v))} placeholder={T.costDefault} /></Field>
        )}
        <Field label={T.descriptionOpt} className="sm:col-span-2"><input value={desc} onChange={(e) => setDesc(e.target.value)} className={INPUT} /></Field>
      </div>
      <div className="mt-3">
        <label className="text-[11px] text-slate-400 font-bold mb-1 block">{T.attachments}</label>
        <button type="button" onClick={() => fileRef.current?.click()} className={BTN_SOFT}><Paperclip size={14} /> {T.attach}</button>
        <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
        {files.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {files.map((f, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs">
                <Paperclip size={13} className="text-blue-300" /><span className="text-blue-200 max-w-[170px] truncate">{f.name}</span>
                <span className="text-[10px] px-1.5 rounded-full bg-blue-500/15 text-blue-300">{T.willUpload}</span>
                <button type="button" aria-label={T.cancel} onClick={() => setFiles((p) => p.filter((_, k) => k !== i))} className="text-red-300"><X size={13} /></button>
              </span>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

// ───────────────────────── تحويل بين الخزن والبنوك ─────────────────────────
export function TransferDialog({ ctx, T, treasuries, balances, onClose, onSaved }: Common & { treasuries: Treasury[]; balances: Map<number, number>; onSaved: () => void }) {
  const [fromId, setFromId] = useState<number | "">("");
  const [toId, setToId] = useState<number | "">("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayLocal());
  const [ref, setRef] = useState("");
  const [desc, setDesc] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<Record<string, string>>({});
  const linked = useMemo(() => treasuries.filter((x) => x.account_id), [treasuries]);
  const opts = useMemo(() => treasuryOptions(linked, ctx.accById, ctx.branches, T, balances), [linked, ctx.accById, ctx.branches, T, balances]);
  const from = linked.find((x) => x.id === fromId); const to = linked.find((x) => x.id === toId);
  const amt = parseFloat(amount) || 0;
  const fromBal = from ? balances.get(from.id) ?? 0 : 0;

  const submit = async () => {
    const e: Record<string, string> = {};
    if (!from) e.from = T.required;
    if (!to) e.to = T.required;
    if (from && to && from.id === to.id) e.to = T.sameAccount;
    if (amt <= 0) e.amount = T.amountPositive;
    setErr(e);
    if (Object.keys(e).length || !from || !to) return;
    setSaving(true);
    const r = await createTransfer(ctx.org.id, {
      date, from, to, amount: amt, reference: ref.trim() || null,
      description: desc.trim() || `تحويل من ${from.name} إلى ${to.name}`,
    });
    setSaving(false);
    if (!r.ok) { ctx.notify(r.error === "SAME" ? T.sameAccount : r.error === "AMOUNT" ? T.amountPositive : r.error === "UNLINKED" ? T.unlinkedAcc : T.saveFailed + (r.error || ""), "err"); return; }
    ctx.notify(T.transferSaved, "ok");
    onSaved(); onClose();
  };

  return (
    <Modal title={T.transfer} icon={<ArrowLeftRight size={16} />} onClose={onClose}
      footer={<>
        <p className="text-[11px] text-slate-400 flex-1 min-w-[160px]">{T.transferHint}</p>
        <button type="button" onClick={onClose} className={BTN_SOFT}><X size={14} /> {T.cancel}</button>
        <button type="button" onClick={submit} disabled={saving} className={BTN_BLUE}><Check size={15} /> {saving ? T.saving : T.save}</button>
      </>}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label={T.transferNo}><input disabled value={T.autoNo} className={INPUT + " text-slate-400"} /></Field>
        <Field label={T.date}><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={DATE_INPUT} /></Field>
        <Field label={T.fromAccount}>
          <SmartSelect options={opts} value={fromId} onChange={(v) => setFromId(v === "" ? "" : Number(v))} placeholder={T.select} searchPlaceholder={T.searchPh} />
          {err.from && <p className="text-[11px] text-red-300 mt-1">{err.from}</p>}
        </Field>
        <Field label={T.toAccount}>
          <SmartSelect options={opts.filter((o) => o.value !== fromId)} value={toId} onChange={(v) => setToId(v === "" ? "" : Number(v))} placeholder={T.select} searchPlaceholder={T.searchPh} />
          {err.to && <p className="text-[11px] text-red-300 mt-1">{err.to}</p>}
        </Field>
        <Field label={T.transferAmount}>
          <input type="number" inputMode="decimal" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className={INPUT + " [direction:ltr] text-center font-mono"} />
          {err.amount && <p className="text-[11px] text-red-300 mt-1">{err.amount}</p>}
          {from && amt > fromBal && <p className="text-[11px] text-amber-300 mt-1">{T.lowBalance} ({T.available}: {fmt(fromBal)})</p>}
        </Field>
        <Field label={T.reference}><input value={ref} onChange={(e) => setRef(e.target.value)} className={INPUT + " [direction:ltr]"} /></Field>
        <Field label={T.descriptionOpt} className="sm:col-span-2"><input value={desc} onChange={(e) => setDesc(e.target.value)} className={INPUT} /></Field>
      </div>
    </Modal>
  );
}

// ───────────────────────── إعداد خزنة / بنك ─────────────────────────
export function TreasuryEditDialog({ ctx, T, initial, hasBankCols, defaultBranch, onClose, onSaved }: Common & {
  initial: Partial<Treasury>; hasBankCols: boolean; defaultBranch: number | null; onSaved: () => void;
}) {
  const [f, setF] = useState<Partial<Treasury>>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const accOpts = useMemo(() => ledgerAccountOptions(ctx.postable, T), [ctx.postable, T]);

  const submit = async () => {
    if (!f.name || !String(f.name).trim()) { setErr(T.nameRequired); return; }
    const payload: Partial<Treasury> & Record<string, unknown> = {
      organization_id: ctx.org.id, branch_id: f.branch_id ?? defaultBranch ?? null, name: String(f.name).trim(),
      kind: f.kind || "cash", account_id: f.account_id ?? null, opening_balance: parseFloat(String(f.opening_balance ?? 0)) || 0, is_active: f.is_active !== false,
    };
    if (hasBankCols) { payload.bank_name = (f.bank_name || "").trim() || null; payload.iban = (f.iban || "").replace(/\s+/g, "").toUpperCase() || null; payload.account_number = (f.account_number || "").trim() || null; }
    if (f.id) payload.id = f.id;
    setBusy(true);
    const r = await DB.upsertTreasury(payload);
    setBusy(false);
    if (!r.ok) { ctx.notify(T.saveFailed + (r.error || ""), "err"); return; }
    ctx.notify(T.saved, "ok"); onSaved(); onClose();
  };

  return (
    <Modal title={f.id ? T.editAccount : T.newAccount} icon={<Settings size={16} />} onClose={onClose}
      footer={<>
        <button type="button" onClick={onClose} className={BTN_SOFT}><X size={14} /> {T.cancel}</button>
        <button type="button" onClick={submit} disabled={busy} className={BTN_GREEN}><Save size={15} /> {busy ? T.saving : T.save}</button>
      </>}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label={T.name} className="sm:col-span-2"><input value={f.name || ""} onChange={(e) => { setF({ ...f, name: e.target.value }); setErr(""); }} className={INPUT} />{err && <p className="text-[11px] text-red-300 mt-1">{err}</p>}</Field>
        <Field label={T.kind}><select value={f.kind || "cash"} onChange={(e) => setF({ ...f, kind: e.target.value })} className={INPUT}><option value="cash">{T.cash}</option><option value="bank">{T.bank}</option></select></Field>
        <Field label={T.openingBal} hint={T.openingNote}><input type="number" step="0.01" value={(f.opening_balance as unknown as string) ?? ""} onChange={(e) => setF({ ...f, opening_balance: e.target.value as unknown as number })} className={INPUT + " [direction:ltr] text-center"} /></Field>
        <Field label={T.linkedAccount} hint={T.linkHint} className="sm:col-span-2"><SmartSelect options={accOpts} value={f.account_id ?? ""} onChange={(v) => setF({ ...f, account_id: v === "" ? null : Number(v) })} placeholder={T.noLink} searchPlaceholder={T.searchPh} /></Field>
        {ctx.branches.length > 1 && <Field label={T.branch}><SmartSelect options={branchOptions(ctx.branches)} value={f.branch_id ?? ""} onChange={(v) => setF({ ...f, branch_id: v === "" ? null : Number(v) })} placeholder={T.none} /></Field>}
        {hasBankCols && f.kind === "bank" && (<>
          <Field label={T.bankName}><input value={f.bank_name || ""} onChange={(e) => setF({ ...f, bank_name: e.target.value })} className={INPUT} /></Field>
          <Field label={T.accountNumber}><input value={f.account_number || ""} onChange={(e) => setF({ ...f, account_number: e.target.value })} className={INPUT + " [direction:ltr]"} /></Field>
          <Field label={T.iban} className="sm:col-span-2"><input value={f.iban || ""} onChange={(e) => setF({ ...f, iban: e.target.value })} className={INPUT + " [direction:ltr] font-mono"} /></Field>
        </>)}
        <label className="flex items-center gap-2 text-sm text-slate-300 sm:col-span-2"><input type="checkbox" checked={f.is_active !== false} onChange={(e) => setF({ ...f, is_active: e.target.checked })} className="w-4 h-4 accent-blue-500" /> {T.active}</label>
      </div>
    </Modal>
  );
}

// ───────────────────────── إعدادات الحسابات (قائمة) ─────────────────────────
export function ManageDialog({ ctx, T, treasuries, onNew, onEdit, onDelete, onClose }: Common & {
  treasuries: Treasury[]; onNew: () => void; onEdit: (t: Treasury) => void; onDelete: (t: Treasury) => void;
}) {
  return (
    <Modal title={T.manageTitle} icon={<Settings size={16} />} onClose={onClose}
      footer={<><button type="button" onClick={onNew} className={BTN_GREEN}><Plus size={15} /> {T.newAccount}</button><button type="button" onClick={onClose} className={BTN_SOFT + " ms-auto"}>{T.close}</button></>}>
      {treasuries.length === 0 ? <p className="text-center text-slate-400 text-sm py-6">{T.noAccounts}</p> : (
        <div className="divide-y divide-slate-800">
          {treasuries.map((x) => {
            const acc = x.account_id ? ctx.accById.get(x.account_id) : undefined;
            return (
              <div key={x.id} className="flex items-center gap-3 py-2.5 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-white truncate">{x.name} <span className={`text-[11px] font-normal ${x.is_active ? "text-emerald-300" : "text-slate-400"}`}>({x.is_active ? T.active : T.inactive})</span></div>
                  <div className="text-[11px] text-slate-400 truncate">{x.kind === "bank" ? T.bank : T.cash} · {acc ? `${acc.code} ${acc.name}` : T.notLinked}</div>
                </div>
                <button type="button" onClick={() => onEdit(x)} aria-label={T.edit} title={T.edit} className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-300 flex items-center justify-center hover:bg-blue-500/20"><Pencil size={14} /></button>
                <button type="button" onClick={() => onDelete(x)} aria-label={T.del} title={T.del} className="w-8 h-8 rounded-lg bg-red-500/10 text-red-300 flex items-center justify-center hover:bg-red-500/20"><Trash2 size={14} /></button>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}


// طباعة سند/حركة (HTML مُهرَّب) — تُستخدم من التفاصيل ومن زر الطباعة في الجدول
export function printTransaction({ ctx, T, row, lines, rtl }: { ctx: Ctx; T: Tr; row: Row; lines: EntryLine[]; rtl: boolean }) {
  const kindLabel = row.isTransfer ? T.kindTransfer : row.entryType === "receipt" ? T.kindReceipt : row.entryType === "payment" ? T.kindPayment : row.entryType === "sales" ? T.kindSales : row.entryType === "purchases" ? T.kindPurchases : T.kindOther;
  const amount = row.debit || row.credit;
  const accName = (id: number) => { const a = ctx.accById.get(id); return a ? `${a.code} ${a.name}` : String(id); };
  const body = `<h1>${esc(kindLabel)} — ${esc(row.jvLabel)}</h1><div class="muted">${esc(ctx.shop?.shop_name || ctx.org.name)}</div>
<table><tbody>
<tr><th>${esc(T.txDate)}</th><td class="n">${esc(row.date)}</td></tr>
<tr><th>${esc(T.colAccount)}</th><td>${esc(row.treasuryName)}</td></tr>
<tr><th>${esc(T.amount)}</th><td class="n">${fmt(amount)} ${esc(T.currency)} (${esc(row.debit ? T.colReceipt : T.colPayment)})</td></tr>
<tr><th>${esc(T.relatedParty)}</th><td>${esc(row.partyName || "—")}</td></tr>
<tr><th>${esc(T.colDesc)}</th><td>${esc(row.description)}</td></tr>
<tr><th>${esc(T.notes)}</th><td>${esc(row.notes)}</td></tr></tbody></table>
<table><thead><tr><th>${esc(T.colAccount)}</th><th>${esc(T.debit)}</th><th>${esc(T.credit)}</th></tr></thead><tbody>
${lines.map((l) => `<tr><td>${esc(accName(l.account_id))}</td><td class="n">${l.debit ? fmt(l.debit) : "-"}</td><td class="n">${l.credit ? fmt(l.credit) : "-"}</td></tr>`).join("")}</tbody></table>`;
  if (!openPrint({ title: row.jvLabel, rtl, body })) ctx.notify("Pop-ups blocked", "err");
}

// ───────────────────────── تفاصيل حركة ─────────────────────────
export function DetailsDialog({ ctx, T, row, lines, onClose, onChanged }: Common & { row: Row; lines: EntryLine[]; onChanged: () => void }) {
  const { isRTL } = useLang();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const kindLabel = row.isTransfer ? T.kindTransfer : row.entryType === "receipt" ? T.kindReceipt : row.entryType === "payment" ? T.kindPayment : row.entryType === "sales" ? T.kindSales : row.entryType === "purchases" ? T.kindPurchases : T.kindOther;
  const amount = row.debit || row.credit;
  const canReverse = row.state === "posted" && (row.isTransfer || row.entryType === "receipt" || row.entryType === "payment");
  const accName = (id: number) => { const a = ctx.accById.get(id); return a ? `${a.code} ${a.name}` : String(id); };
  const partyName = (id: number | null) => (id == null ? "" : ctx.parties.find((p) => p.id === id)?.name || "");

  const openAtts = async () => {
    const atts = await DB.fetchAttachments(row.entryId);
    if (!atts.length) { ctx.notify(T.noAttachments, "info"); return; }
    for (const a of atts) { const url = await DB.signedUrl(a.file_path); if (url) window.open(url, "_blank"); }
  };
  const reverse = async () => {
    setBusy(true);
    const r = await DB.reverseEntry(row.entryId);
    setBusy(false); setConfirming(false);
    if (!r.ok) { ctx.notify(T.saveFailed + (r.error || ""), "err"); return; }
    ctx.notify(T.reversed, "ok"); onChanged(); onClose();
  };
  const print = () => printTransaction({ ctx, T, row, lines, rtl: isRTL });

  const kv = (k: string, v: React.ReactNode) => (<div><div className="text-[11px] text-slate-400 font-bold">{k}</div><div className="text-sm text-slate-200 break-words">{v || "—"}</div></div>);
  return (
    <Modal title={`${T.txDetails} — ${row.jvLabel}`} icon={<Eye size={16} />} onClose={onClose}
      footer={<>
        {canReverse && !confirming && <button type="button" onClick={() => setConfirming(true)} className={BTN_SOFT + " text-red-300"}><Undo2 size={14} /> {T.reverse}</button>}
        {confirming && <><span className="text-[11px] text-amber-300">{T.reverseConfirm}</span><button type="button" disabled={busy} onClick={reverse} className={BTN_RED + " !py-2 !text-xs"}>{T.confirm}</button><button type="button" onClick={() => setConfirming(false)} className={BTN_SOFT}>{T.cancel}</button></>}
        <button type="button" onClick={openAtts} className={BTN_SOFT + " ms-auto"}><Paperclip size={14} /> {T.attachmentsView}</button>
        <button type="button" onClick={print} className={BTN_BLUE}><Printer size={14} /> {T.print}</button>
      </>}>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {kv(T.txNumber, <span className="font-mono [direction:ltr] inline-block text-slate-100 font-semibold">{row.jvLabel}</span>)}
        {kv(T.txDate, <span className="font-mono text-slate-300">{row.date}</span>)}
        {kv(T.txKind, kindLabel)}
        {kv(T.colAccount, row.treasuryName)}
        {kv(T.relatedParty, row.partyName)}
        {kv(T.amount, <span className={`font-mono font-bold [direction:ltr] inline-block ${row.debit ? "text-emerald-300" : "text-red-300"}`}>{row.debit ? "+" : "−"}{fmt(amount)} {T.currency}</span>)}
        {kv(T.colStatus, row.state === "posted" ? T.statusPosted : row.state === "draft" ? T.statusDraft : row.state === "reversed" ? T.statusReversed : T.statusReversal)}
        {kv(T.colRef, <span className="font-mono [direction:ltr] inline-block text-slate-100 font-semibold">{row.notes.match(/ref:\s*([^·]+)/)?.[1]?.trim() || ""}</span>)}
        {kv(T.createdAt, row.createdAt ? <span className="font-mono text-slate-300">{row.createdAt.slice(0, 16).replace("T", " ")}</span> : "")}
        {kv(T.createdBy, <span className="text-slate-400">{T.createdByNA}</span>)}
        <div className="col-span-2 sm:col-span-3">{kv(T.colDesc, row.description)}</div>
        {row.notes && <div className="col-span-2 sm:col-span-3">{kv(T.notes, row.notes)}</div>}
      </div>
      <h4 className="text-xs font-bold text-slate-300 mt-5 mb-2">{T.journalLines}</h4>
      <div className="overflow-x-auto border border-slate-800 rounded-xl">
        <table className="w-full text-xs">
          <thead><tr className="bg-slate-800/50 text-slate-300"><th className="px-3 py-2 text-start">{T.colAccount}</th><th className="px-3 py-2 text-start">{T.relatedParty}</th><th className="px-3 py-2 text-end">{T.debit}</th><th className="px-3 py-2 text-end">{T.credit}</th></tr></thead>
          <tbody className="divide-y divide-slate-800">
            {lines.map((l, i) => (<tr key={i}><td className="px-3 py-1.5 text-slate-200">{accName(l.account_id)}</td><td className="px-3 py-1.5 text-slate-300">{partyName(l.party_id)}</td><td className="px-3 py-1.5 text-end font-mono [direction:ltr] text-slate-100 font-semibold">{l.debit ? fmt(l.debit) : "-"}</td><td className="px-3 py-1.5 text-end font-mono [direction:ltr] text-slate-100 font-semibold">{l.credit ? fmt(l.credit) : "-"}</td></tr>))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
