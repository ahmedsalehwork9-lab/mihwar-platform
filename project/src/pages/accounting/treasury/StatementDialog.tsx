// =============================================================
// src/pages/accounting/treasury/StatementDialog.tsx
// كشف حساب خزنة/بنك: رصيد افتتاحي + حركات مُرحّلة + رصيد ختامي، طباعة وتصدير CSV.
// =============================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileText, Printer, Download, Loader2 } from "lucide-react";
import { useLang } from "../../../context/LanguageContext";
import SmartSelect from "./SmartSelect";
import { Modal, Field, DATE_INPUT, BTN_SOFT, BTN_BLUE, fmt, jv, monthStartLocal, todayLocal } from "./ui";
import type { Tr } from "./i18n";
import type { Ctx } from "./types";
import { treasuryOptions } from "./options";
import { fetchNets, fetchMovements, fetchEntryLines, treasuryMovementNet, downloadCsv, type Treasury } from "./treasuryDb";
import { openPrint, statementHtml, type StatementRow } from "./print";

export default function StatementDialog({ ctx, T, treasuries, initialId, initialFrom, initialTo, onClose }: {
  ctx: Ctx; T: Tr; treasuries: Treasury[]; initialId?: number | ""; initialFrom?: string; initialTo?: string; onClose: () => void;
}) {
  const { isRTL, lang } = useLang();
  const linked = useMemo(() => treasuries.filter((x) => x.account_id), [treasuries]);
  const [id, setId] = useState<number | "">(initialId ?? "");
  const [from, setFrom] = useState(initialFrom || monthStartLocal());
  const [to, setTo] = useState(initialTo || todayLocal());
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [data, setData] = useState<{ opening: number; rows: StatementRow[]; totalIn: number; totalOut: number; closing: number } | null>(null);
  const tr = linked.find((x) => x.id === id);
  const opts = useMemo(() => treasuryOptions(linked, ctx.accById, ctx.branches, T), [linked, ctx.accById, ctx.branches, T]);

  const run = useCallback(async () => {
    if (!tr || !tr.account_id) { setData(null); return; }
    setLoading(true); setErr("");
    const [pre, mv] = await Promise.all([
      fetchNets(ctx.org.id, [tr.account_id], { lt: from }),
      fetchMovements(ctx.org.id, [tr.account_id], from, to, "posted"),
    ]);
    if (pre.error || mv.error) { setErr(pre.error || mv.error || ""); setLoading(false); return; }
    const mine = mv.rows.filter((l) => tr.branch_id == null || l.branch_id === tr.branch_id);
    mine.sort((a, b) => a.entry.date.localeCompare(b.entry.date) || a.entry.entry_no - b.entry.entry_no || a.id - b.id);
    const el = await fetchEntryLines(mine.map((l) => l.entry_id));
    const counterOf = (entryId: number) => el.rows
      .filter((x) => x.entry_id === entryId && x.account_id !== tr.account_id)
      .map((x) => ctx.accById.get(x.account_id)?.name || "").filter(Boolean).join("، ");
    const opening = (Number(tr.opening_balance) || 0) + treasuryMovementNet(tr, pre.nets);
    let run = opening, tin = 0, tout = 0;
    const rows: StatementRow[] = mine.map((l) => {
      run += l.debit - l.credit; tin += l.debit; tout += l.credit;
      return { date: l.entry.date, ref: jv(l.entry.entry_year, l.entry.entry_no), desc: l.entry.description || "", counter: counterOf(l.entry_id), receipt: l.debit, payment: l.credit, balance: run };
    });
    setData({ opening, rows, totalIn: tin, totalOut: tout, closing: run });
    setLoading(false);
  }, [tr, from, to, ctx.org.id, ctx.accById]);

  useEffect(() => { run(); }, [run]);

  const labels = { title: T.statementTitle, account: T.colAccount, period: T.period, opening: T.openingBalance, closing: T.closingBalance, totalIn: T.totalReceipts, totalOut: T.totalPayments, date: T.colDate, ref: T.colRef, desc: T.colDesc, counter: T.counterAccount, receipt: T.colReceipt, payment: T.colPayment, balance: T.colBalance, note: T.statementNote, generated: T.generatedOn };
  const print = () => {
    if (!tr || !data) return;
    const acc = tr.account_id ? ctx.accById.get(tr.account_id) : undefined;
    const ok = openPrint({ title: `${T.statementTitle} — ${tr.name}`, rtl: isRTL, body: statementHtml({ rtl: isRTL, org: ctx.org.name, shop: ctx.shop?.shop_name, tax: ctx.shop?.tax_number, account: tr.name, code: acc?.code, from, to, ...data, generated: new Date().toLocaleString(lang === "ar" ? "ar-SA-u-nu-latn" : "en-GB"), L: labels }) });
    if (!ok) ctx.notify("Pop-ups blocked", "err");
  };
  const csv = () => {
    if (!tr || !data) return;
    downloadCsv(`statement_${tr.name}_${from}_${to}.csv`, [
      [T.statementTitle, tr.name, from, to], [],
      [T.colDate, T.colRef, T.colDesc, T.counterAccount, T.colReceipt, T.colPayment, T.colBalance],
      ["", "", T.openingBalance, "", "", "", data.opening.toFixed(2)],
      ...data.rows.map((r) => [r.date, r.ref, r.desc, r.counter, r.receipt ? r.receipt.toFixed(2) : "", r.payment ? r.payment.toFixed(2) : "", r.balance.toFixed(2)]),
      ["", "", T.closingBalance, "", data.totalIn.toFixed(2), data.totalOut.toFixed(2), data.closing.toFixed(2)],
    ]);
  };

  const box = (k: string, v: number, tone = "text-white") => (<div className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2"><div className="text-[11px] text-slate-400 font-bold">{k}</div><div className={`font-mono font-black text-base [direction:ltr] ${tone}`}>{fmt(v)}</div></div>);
  return (
    <Modal wide title={T.statementTitle} icon={<FileText size={16} />} onClose={onClose}
      footer={<>
        <p className="text-[11px] text-slate-400 flex-1 min-w-[160px]">{T.statementNote}</p>
        <button type="button" onClick={csv} disabled={!data} className={BTN_SOFT}><Download size={14} /> {T.exportCsv}</button>
        <button type="button" onClick={print} disabled={!data} className={BTN_BLUE}><Printer size={14} /> {T.print}</button>
      </>}>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <Field label={T.account}><SmartSelect options={opts} value={id} onChange={(v) => setId(v === "" ? "" : Number(v))} placeholder={T.select} searchPlaceholder={T.searchPh} /></Field>
        <Field label={T.dateFrom}><input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={DATE_INPUT} /></Field>
        <Field label={T.dateTo}><input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={DATE_INPUT} /></Field>
      </div>
      {!tr ? <p className="text-center text-slate-400 text-sm py-8">{T.pickAccount}</p>
        : loading ? <div className="py-10 flex items-center justify-center gap-2 text-slate-400 text-sm"><Loader2 size={16} className="animate-spin" /> {T.loading}</div>
        : err ? <p className="text-center text-red-300 text-sm py-8">{T.loadError}: {err}</p>
        : data && (<>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            {box(T.openingBalance, data.opening)}{box(T.totalReceipts, data.totalIn, "text-emerald-300")}{box(T.totalPayments, data.totalOut, "text-red-300")}{box(T.closingBalance, data.closing, data.closing < 0 ? "text-red-300" : "text-cyan-300")}
          </div>
          <div className="overflow-x-auto border border-slate-800 rounded-xl">
            <table className="w-full text-xs min-w-[640px]">
              <thead><tr className="bg-slate-800/50 text-slate-300"><th className="px-3 py-2 text-start">{T.colDate}</th><th className="px-3 py-2 text-start">{T.colRef}</th><th className="px-3 py-2 text-start">{T.colDesc}</th><th className="px-3 py-2 text-start">{T.counterAccount}</th><th className="px-3 py-2 text-end">{T.colReceipt}</th><th className="px-3 py-2 text-end">{T.colPayment}</th><th className="px-3 py-2 text-end">{T.colBalance}</th></tr></thead>
              <tbody className="divide-y divide-slate-800">
                <tr className="bg-slate-950/50"><td className="px-3 py-2 text-slate-400" colSpan={6}>{T.openingBalance}</td><td className="px-3 py-2 text-end font-mono [direction:ltr] text-slate-100 font-semibold">{fmt(data.opening)}</td></tr>
                {data.rows.length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-400">{T.noTx}</td></tr>}
                {data.rows.map((r, i) => (
                  <tr key={i}><td className="px-3 py-1.5 font-mono [direction:ltr] text-slate-300">{r.date}</td><td className="px-3 py-1.5 font-mono [direction:ltr] text-slate-300">{r.ref}</td><td className="px-3 py-1.5 text-slate-200">{r.desc}</td><td className="px-3 py-1.5 text-slate-300">{r.counter}</td>
                    <td className="px-3 py-1.5 text-end font-mono font-semibold [direction:ltr] text-emerald-300">{r.receipt ? fmt(r.receipt) : "-"}</td><td className="px-3 py-1.5 text-end font-mono font-semibold [direction:ltr] text-red-300">{r.payment ? fmt(r.payment) : "-"}</td><td className={`px-3 py-1.5 text-end font-mono font-semibold [direction:ltr] ${r.balance < 0 ? "text-red-300" : "text-slate-100"}`}>{fmt(r.balance)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </>)}
    </Modal>
  );
}
