// =============================================================
// src/pages/accounting/treasury/ReconcileDialog.tsx
// معاينة تسوية بنكية (بدون حفظ وبدون إنشاء قيود): مقارنة كشف البنك CSV بالدفتر المُرحّل.
// لا يوجد جدول تسويات في النظام الحالي، لذا هذه الأداة للقراءة فقط.
// Read-only reconciliation preview (no persistence; no entries are created).
// =============================================================

import { useMemo, useRef, useState } from "react";
import { Scale, Upload, Loader2 } from "lucide-react";
import SmartSelect from "./SmartSelect";
import { Modal, Field, INPUT, DATE_INPUT, BTN_SOFT, fmt, jv, monthStartLocal, todayLocal } from "./ui";
import type { Tr } from "./i18n";
import type { Ctx } from "./types";
import { treasuryOptions } from "./options";
import { fetchNets, fetchMovements, treasuryBalance, type Treasury } from "./treasuryDb";
import { normalize } from "./searchUtils";

export type BankLine = { date: string; desc: string; amount: number };   // + deposit (ledger debit), − withdrawal

/** Minimal CSV parser (quotes, commas/semicolons/tabs). */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^\ufeff/, "");
  const first = clean.split(/\r?\n/, 1)[0] || "";
  const delim = (first.match(/\t/g) || []).length > (first.match(/;/g) || []).length && (first.match(/\t/g) || []).length > (first.match(/,/g) || []).length ? "\t" : (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ";" : ",";
  const rows: string[][] = []; let row: string[] = []; let cur = ""; let q = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (q) { if (c === '"' && clean[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true;
    else if (c === delim) { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && clean[i + 1] === "\n") i++; row.push(cur); cur = ""; if (row.some((x) => x.trim())) rows.push(row); row = []; }
    else cur += c;
  }
  row.push(cur); if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

const toNum = (s: string): number => {
  const v = normalize(s).replace(/[^\d.,\-()]/g, "");
  if (!v) return 0;
  const neg = /^\(.*\)$/.test(v) || v.startsWith("-");
  const n = parseFloat(v.replace(/[(),\-]/g, "")) || 0;
  return neg ? -Math.abs(n) : n;
};
const toDate = (s: string): string => {
  const v = normalize(s).trim();
  let m = v.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = v.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return "";
};

export function parseBankCsv(text: string): BankLine[] | null {
  const rows = parseCsv(text);
  if (rows.length < 2) return null;
  const head = rows[0].map(normalize);
  const find = (re: RegExp) => head.findIndex((h) => re.test(h));
  const iDate = find(/date|تاريخ/); const iDesc = find(/desc|narr|detail|بيان|وصف|تفاصيل/);
  const iAmt = find(/^amount|مبلغ/); const iDr = find(/debit|withdraw|مدين|سحب|صرف/); const iCr = find(/credit|deposit|دائن|ايداع|قبض/);
  if (iDate < 0 || (iAmt < 0 && iDr < 0 && iCr < 0)) return null;
  const out: BankLine[] = [];
  for (const r of rows.slice(1)) {
    const date = toDate(r[iDate] || "");
    if (!date) continue;
    const amount = iAmt >= 0 ? toNum(r[iAmt] || "") : Math.abs(toNum(r[iCr] || "")) - Math.abs(toNum(r[iDr] || ""));
    if (!amount) continue;
    out.push({ date, desc: iDesc >= 0 ? (r[iDesc] || "").trim() : "", amount: Math.round(amount * 100) / 100 });
  }
  return out;
}

const dayDiff = (a: string, b: string) => Math.abs((Date.parse(a) - Date.parse(b)) / 86400000);

export function matchLines(bank: BankLine[], book: { id: number; date: string; amount: number; label: string }[], tol: number) {
  const usedBook = new Set<number>(); const matched: { b: BankLine; k: (typeof book)[number]; exactDate: boolean }[] = []; const bankOnly: BankLine[] = [];
  const pass = (maxDays: number, pending: BankLine[]) => {
    const rest: BankLine[] = [];
    for (const b of pending) {
      let best: (typeof book)[number] | null = null; let bd = Infinity;
      for (const k of book) { if (usedBook.has(k.id) || Math.abs(k.amount - b.amount) > 0.004) continue; const d = dayDiff(k.date, b.date); if (d <= maxDays && d < bd) { best = k; bd = d; } }
      if (best) { usedBook.add(best.id); matched.push({ b, k: best, exactDate: bd === 0 }); } else rest.push(b);
    }
    return rest;
  };
  let pending = pass(0, bank);
  if (tol > 0) pending = pass(tol, pending);
  bankOnly.push(...pending);
  return { matched, bankOnly, bookOnly: book.filter((k) => !usedBook.has(k.id)) };
}

export default function ReconcileDialog({ ctx, T, treasuries, onClose }: { ctx: Ctx; T: Tr; treasuries: Treasury[]; onClose: () => void }) {
  const banks = useMemo(() => treasuries.filter((x) => x.kind === "bank" && x.account_id), [treasuries]);
  const opts = useMemo(() => treasuryOptions(banks, ctx.accById, ctx.branches, T), [banks, ctx.accById, ctx.branches, T]);
  const [id, setId] = useState<number | "">("");
  const [from, setFrom] = useState(monthStartLocal());
  const [to, setTo] = useState(todayLocal());
  const [closing, setClosing] = useState("");
  const [tol, setTol] = useState("2");
  const [bank, setBank] = useState<BankLine[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ book: number; matched: number; dateDiff: number; bankOnly: BankLine[]; bookOnly: { id: number; date: string; amount: number; label: string }[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const tr = banks.find((x) => x.id === id);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    const parsed = parseBankCsv(await f.text());
    if (!parsed) { ctx.notify(T.csvParseFail, "err"); return; }
    setBank(parsed); setRes(null);
  };

  const run = async () => {
    if (!tr || !tr.account_id || !bank) return;
    setBusy(true);
    const [nets, mv] = await Promise.all([fetchNets(ctx.org.id, [tr.account_id], { lte: to }), fetchMovements(ctx.org.id, [tr.account_id], from, to, "posted")]);
    if (nets.error || mv.error) { setBusy(false); ctx.notify(T.loadError, "err"); return; }
    const book = mv.rows.filter((l) => tr.branch_id == null || l.branch_id === tr.branch_id)
      .map((l) => ({ id: l.id, date: l.entry.date, amount: Math.round((l.debit - l.credit) * 100) / 100, label: `${jv(l.entry.entry_year, l.entry.entry_no)} ${l.entry.description || ""}` }));
    const inRange = bank.filter((b) => b.date >= from && b.date <= to);
    const m = matchLines(inRange, book, Math.max(0, parseInt(tol) || 0));
    setRes({ book: treasuryBalance(tr, nets.nets), matched: m.matched.length, dateDiff: m.matched.filter((x) => !x.exactDate).length, bankOnly: m.bankOnly, bookOnly: m.bookOnly });
    setBusy(false);
  };

  const diff = res ? Math.round(((parseFloat(closing) || 0) - res.book) * 100) / 100 : 0;
  const clean = !!res && res.bankOnly.length === 0 && res.bookOnly.length === 0 && Math.abs(diff) < 0.005;
  const list = (rows: { date: string; label: string; amount: number }[]) => (
    <div className="border border-slate-800 rounded-xl overflow-hidden max-h-56 overflow-y-auto">
      {rows.length === 0 ? <p className="p-3 text-center text-slate-500 text-xs">—</p> : rows.map((r, i) => (
        <div key={i} className="flex items-center gap-2 px-3 py-1.5 text-xs border-b border-slate-800 last:border-0"><span className="font-mono text-slate-400 [direction:ltr]">{r.date}</span><span className="flex-1 truncate text-slate-300">{r.label}</span><span className={`font-mono [direction:ltr] ${r.amount < 0 ? "text-red-400" : "text-emerald-400"}`}>{fmt(r.amount)}</span></div>
      ))}
    </div>
  );

  return (
    <Modal wide title={T.reconTitle} icon={<Scale size={16} />} onClose={onClose} footer={<><p className="text-[11px] text-amber-300/80 flex-1 min-w-[180px]">{T.reconNoAdjust}</p><button type="button" onClick={onClose} className={BTN_SOFT}>{T.close}</button></>}>
      <p className="text-xs text-slate-400 mb-4">{T.reconIntro}</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-3">
        <Field label={T.chooseBankAcc} className="sm:col-span-3 lg:col-span-2"><SmartSelect options={opts} value={id} onChange={(v) => { setId(v === "" ? "" : Number(v)); setRes(null); }} placeholder={T.select} searchPlaceholder={T.searchPh} /></Field>
        <Field label={T.stmtFrom}><input type="date" value={from} max={to} onChange={(e) => { setFrom(e.target.value); setRes(null); }} className={DATE_INPUT} /></Field>
        <Field label={T.stmtDate}><input type="date" value={to} min={from} onChange={(e) => { setTo(e.target.value); setRes(null); }} className={DATE_INPUT} /></Field>
        <Field label={T.bankClosing}><input type="number" step="0.01" value={closing} onChange={(e) => setClosing(e.target.value)} className={INPUT + " [direction:ltr] text-center font-mono"} /></Field>
        <Field label={T.toleranceDays}><input type="number" min="0" max="10" value={tol} onChange={(e) => { setTol(e.target.value); setRes(null); }} className={INPUT + " text-center"} /></Field>
      </div>
      <div className="flex items-center gap-2 flex-wrap mb-4">
        <button type="button" onClick={() => fileRef.current?.click()} className={BTN_SOFT}><Upload size={14} /> {T.uploadCsv}</button>
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
        {bank && <span className="text-xs text-slate-400">{T.bankStmtLines}: {bank.length}</span>}
        <button type="button" onClick={run} disabled={!tr || !bank || busy} className="ms-auto inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-[#fff] font-bold text-xs disabled:opacity-50">{busy ? <Loader2 size={14} className="animate-spin" /> : <Scale size={14} />} {T.reconciliation}</button>
      </div>
      {res && (<>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
          {[[T.bookBalance, fmt(res.book), "text-white"], [T.bankClosing, fmt(parseFloat(closing) || 0), "text-white"], [T.difference, fmt(diff), Math.abs(diff) < 0.005 ? "text-emerald-400" : "text-red-400"], [T.matched, `${res.matched} (${T.dateDiff}: ${res.dateDiff})`, "text-cyan-300"], [T.reconStatus, clean ? T.reconDone : T.reconDiff, clean ? "text-emerald-400" : "text-amber-400"]].map(([k, v, c], i) => (
            <div key={i} className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2"><div className="text-[10px] text-slate-500 font-bold">{k}</div><div className={`font-mono font-bold text-sm [direction:ltr] ${c}`}>{v}</div></div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div><h4 className="text-xs font-bold text-slate-400 mb-2">{T.unmatchedBank} ({res.bankOnly.length})</h4>{list(res.bankOnly.map((b) => ({ date: b.date, label: b.desc, amount: b.amount })))}</div>
          <div><h4 className="text-xs font-bold text-slate-400 mb-2">{T.unmatchedBook} ({res.bookOnly.length})</h4>{list(res.bookOnly)}</div>
        </div>
      </>)}
    </Modal>
  );
}
