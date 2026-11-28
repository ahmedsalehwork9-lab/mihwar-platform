import { useEffect, useMemo, useState, useCallback } from "react";
import {
  Plus, Package, Calendar, ArrowRight, Save, RotateCcw, HandCoins, Search, X, Download, Printer,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useLang } from "../../context/LanguageContext";
import * as DB from "../lib/accountingDb";
import { cashBankOptions } from "../lib/cashAccounts";
import type { GLAccount, GLTreasury, GLPurchaseInvoice, GLSupplierPayment, SupplierPaymentAlloc } from "../lib/accountingDb";
import { smartMatch } from "../lib/smartSearch";
import { exportXlsx, printTable, type TableSpec } from "../accounting/journal/exportKit";
import { fetchPrintOrg } from "../sales/salesInvoiceApi";

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const fmt = (n: number) => (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export default function SupplierPaymentsPage() {
  const { ownedShopId } = (useAuth() as any) ?? {};
  const { t, isRTL } = useLang();
  const dir = isRTL ? "rtl" : "ltr";
  const [org, setOrg] = useState<{ id: number; name: string } | null>(null);
  const [accounts, setAccounts] = useState<GLAccount[]>([]);
  const [treasuries, setTreasuries] = useState<GLTreasury[]>([]);
  const [list, setList] = useState<GLSupplierPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(today());
  const [q, setQ] = useState("");

  const [mode, setMode] = useState<"list" | "new">("list");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  // form
  const [pDate, setPDate] = useState(today());
  const [pSupplier, setPSupplier] = useState<number | "">("");
  const [pTreasury, setPTreasury] = useState<number | "">("");
  const [pNotes, setPNotes] = useState("");
  const [openInvs, setOpenInvs] = useState<GLPurchaseInvoice[]>([]);
  const [alloc, setAlloc] = useState<Record<number, string>>({}); // invoice_id -> amount

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const o = await DB.getOrgForBranch(ownedShopId ?? null);
      if (!alive) return;
      setOrg(o);
      if (o) {
        const [accs, treas] = await Promise.all([DB.fetchAccounts(o.id), DB.fetchTreasuries(o.id)]);
        if (!alive) return;
        setAccounts(accs); setTreasuries(treas);
      }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [ownedShopId]);

  const loadList = useCallback(async () => {
    if (!org) return;
    setList(await DB.fetchSupplierPayments(org.id, from, to, ownedShopId ? Number(ownedShopId) : null));
  }, [org, from, to, ownedShopId]);
  useEffect(() => { loadList(); }, [loadList]);

  const voucherNo = (p: GLSupplierPayment) => `PV-${p.payment_year}-${String(p.payment_no).padStart(4, "0")}`;
  const shown = useMemo(() => list.filter((p) => smartMatch(q, voucherNo(p), p.payment_no, p.date, p.supplier_name, p.notes, p.amount)), [list, q]);
  const shownTotal = useMemo(() => shown.reduce((s, p) => s + (Number(p.amount) || 0), 0), [shown]);
  const tableSpec = (): TableSpec => ({
    title: t("Supplier payments", "سداد الموردين"),
    subtitle: `${org?.name ?? ""} — ${from} ${t("To", "إلى")} ${to}`,
    cols: [{ label: t("Voucher", "السند") }, { label: t("Date", "التاريخ") }, { label: t("Supplier", "المورد") }, { label: t("Invoices", "عدد الفواتير"), num: true }, { label: t("Amount", "المبلغ"), num: true }, { label: t("Notes", "ملاحظات") }],
    rows: shown.map((p) => [voucherNo(p), p.date, p.supplier_name || "—", (p.allocations || []).length, r2(p.amount), p.notes || ""]),
    totals: [t("Total", "الإجمالي"), "", "", "", r2(shownTotal), ""],
  });
  const doExcel = () => exportXlsx(`supplier_payments_${from}_${to}.xlsx`, tableSpec(), isRTL);
  const doPrint = async () => {
    if (!org) return;
    const po = await fetchPrintOrg(org.id, ownedShopId ? Number(ownedShopId) : null).catch(() => null);
    const ok = printTable(tableSpec(), { orgName: po?.name || org.name, taxNumber: po?.tax_number ?? null, logoUrl: po?.logo_url ?? null, address: po?.address ?? null, dir, lang: isRTL ? "ar" : "en" });
    if (!ok) alert(t("Allow pop-ups to print", "اسمح بالنوافذ المنبثقة للطباعة"));
  };

  const byCode = useCallback((c: string) => accounts.find((a) => a.code === c && !a.is_group), [accounts]);
  const supplierParent = useMemo(() => byCode("2101") ?? accounts.find((a) => a.type === "liability" && /مورد/.test(a.name)), [accounts, byCode]);
  const supplierAccounts = useMemo(() => {
    if (!supplierParent) return [];
    const pc = supplierParent.code;
    return accounts.filter((a) => !a.is_group && a.id !== supplierParent.id
      && (a.parent_id === supplierParent.id || (a.code.length > pc.length && a.code.startsWith(pc))));
  }, [accounts, supplierParent]);

  // الحساب التجميعي لا يظهر؛ الصندوق/البنك غير التجميعي يظهر — القيمة = رقم الحساب.
  const treasuryOptions = useMemo(() => cashBankOptions(accounts, treasuries), [accounts, treasuries]);
  useEffect(() => { if (!pTreasury && treasuryOptions[0]) setPTreasury(treasuryOptions[0].id); }, [treasuryOptions, pTreasury]);

  // load supplier's open invoices when selected
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!org || !pSupplier) { setOpenInvs([]); setAlloc({}); return; }
      const invs = await DB.fetchSupplierOpenInvoices(org.id, Number(pSupplier), ownedShopId ? Number(ownedShopId) : null);
      if (!alive) return;
      setOpenInvs(invs); setAlloc({});
    })();
    return () => { alive = false; };
  }, [org, pSupplier, ownedShopId]);

  const outstanding = (i: GLPurchaseInvoice) => r2((Number(i.total) || 0) - (Number(i.paid_amount) || 0));
  const allocTotal = useMemo(() => r2(Object.values(alloc).reduce((s, v) => s + (Number(v) || 0), 0)), [alloc]);
  const totalOutstanding = useMemo(() => r2(openInvs.reduce((s, i) => s + outstanding(i), 0)), [openInvs]);

  const setA = (id: number, v: string) => setAlloc((m) => ({ ...m, [id]: v }));
  const payFull = (i: GLPurchaseInvoice) => setA(i.id, String(outstanding(i)));
  const payAll = () => { const m: Record<number, string> = {}; openInvs.forEach((i) => { m[i.id] = String(outstanding(i)); }); setAlloc(m); };
  const clearAll = () => setAlloc({});

  const openNew = () => {
    setPDate(today()); setPSupplier(""); setPNotes(""); setOpenInvs([]); setAlloc({});
    setPTreasury(treasuryOptions[0]?.id ?? ""); setErr(null); setMode("new"); window.scrollTo(0, 0);
  };
  const closeNew = () => { if (!saving) { setMode("list"); setErr(null); } };

  const save = async () => {
    if (!org) return;
    setErr(null); setOk(null);
    if (!pSupplier) { setErr(t("Select a supplier.", "اختر المورد.")); return; }
    if (!pTreasury) { setErr(t("Select a cash/bank account.", "اختر الخزنة/البنك.")); return; }
    const allocations: SupplierPaymentAlloc[] = openInvs
      .map((i) => {
        const amt = Math.min(Number(alloc[i.id]) || 0, outstanding(i));
        return { invoice_id: i.id, invoice_no: i.invoice_no, invoice_year: i.invoice_year, amount: r2(amt) };
      })
      .filter((a) => a.amount > 0);
    if (!allocations.length) { setErr(t("Allocate an amount to at least one invoice (or use “Pay all”).", "خصّص مبلغًا لفاتورة واحدة على الأقل (أو استخدم «سداد الكل»).")); return; }
    const amount = r2(allocations.reduce((s, a) => s + a.amount, 0));
    const supName = supplierAccounts.find((a) => a.id === pSupplier)?.name ?? null;
    setSaving(true);
    const res = await DB.createSupplierPayment(org.id, {
      branch_id: ownedShopId ? Number(ownedShopId) : null, date: pDate,
      supplier_account_id: Number(pSupplier), supplier_name: supName,
      treasury_account_id: Number(pTreasury), amount, allocations, notes: pNotes.trim() || null,
    });
    setSaving(false);
    if (!res.ok) { setErr(res.error || t("Could not save the payment.", "تعذّر حفظ الدفعة.")); return; }
    setOk(t(`Payment voucher No. ${res.paymentNo} saved, amount ${fmt(amount)}.`, `تم حفظ سند صرف رقم ${res.paymentNo} بمبلغ ${fmt(amount)}.`));
    setMode("list"); loadList();
    setTimeout(() => setOk(null), 4000);
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" dir={dir}>
      <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  // ══════════════ NEW PAYMENT (full page) ══════════════
  if (mode === "new") {
    const supName = supplierAccounts.find((a) => a.id === pSupplier)?.name;
    return (
      <div className="min-h-screen" dir={dir}>
        <div className="sticky top-0 z-20 bg-slate-950/95 backdrop-blur border-b border-slate-800">
          <div className="max-w-5xl mx-auto px-4 lg:px-6 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button onClick={closeNew} className="flex items-center gap-1.5 text-slate-400 hover:text-white text-sm shrink-0"><ArrowRight size={18} /> {t("Back", "رجوع")}</button>
              <div className="h-5 w-px bg-slate-700" />
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0"><HandCoins size={16} /></div>
                <h1 className="text-base font-black text-white truncate">{t("Supplier payment voucher", "سند صرف لمورد")}</h1>
              </div>
            </div>
            <button onClick={save} disabled={saving} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-[#fff] font-bold px-5 py-2 rounded-xl text-sm shrink-0">
              <Save size={16} /> {saving ? t("Saving…", "جارٍ الحفظ…") : t("Save payment", "حفظ الدفعة")}
            </button>
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-4 lg:px-6 py-5 space-y-4">
          {err && <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl px-4 py-3 text-sm">{err}</div>}

          <Section title={t("Payment details", "بيانات الدفعة")}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Field label={t("Date", "التاريخ")}><input type="date" value={pDate} onChange={(e) => setPDate(e.target.value)} className={inp} /></Field>
              <Field label={t("Supplier", "المورد")}>
                <select value={pSupplier} onChange={(e) => setPSupplier(e.target.value ? Number(e.target.value) : "")} className={inp}>
                  <option value="">{t("— Select a supplier —", "— اختر موردًا —")}</option>
                  {supplierParent && (
                    <optgroup label={`${supplierParent.code} · ${supplierParent.name}`}>
                      {supplierAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
                    </optgroup>
                  )}
                </select>
              </Field>
              <Field label={t("Cash/Bank", "الخزنة/البنك")}>
                <select value={pTreasury} onChange={(e) => setPTreasury(e.target.value ? Number(e.target.value) : "")} className={inp}>
                  <option value="">{t("— Select —", "— اختر —")}</option>
                  {treasuryOptions.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </Field>
            </div>
          </Section>

          {pSupplier ? (
            <Section
              title={t(`Open invoices of ${supName ?? "the supplier"}`, `فواتير ${supName ?? "المورد"} المفتوحة`)}
              action={openInvs.length > 0 ? (
                <div className="flex items-center gap-2">
                  <button type="button" onClick={payAll} className="text-xs font-bold text-emerald-400 hover:text-emerald-300">{t("Pay all", "سداد الكل")}</button>
                  <span className="text-slate-700">·</span>
                  <button type="button" onClick={clearAll} className="text-xs text-slate-400 hover:text-white">{t("Clear", "تفريغ")}</button>
                </div>
              ) : null}
            >
              {openInvs.length === 0 ? (
                <div className="text-center text-slate-600 py-8 text-sm">{t("No outstanding credit invoices for this supplier.", "لا توجد فواتير آجلة مستحقة لهذا المورد.")}</div>
              ) : (
                <>
                  <div className="hidden md:flex items-center gap-2 px-1 pb-2 text-[11px] text-slate-500 font-semibold">
                    <div className="w-24">{t("Invoice", "الفاتورة")}</div>
                    <div className="w-24 text-center">{t("Date", "التاريخ")}</div>
                    <div className="w-24 text-center">{t("Due date", "الاستحقاق")}</div>
                    <div className="flex-1 text-left">{t("Outstanding", "المتبقّي")}</div>
                    <div className="w-32 text-center">{t("Allocated", "المخصّص")}</div>
                    <div className="w-16" />
                  </div>
                  <div className="space-y-2">
                    {openInvs.map((i) => {
                      const out = outstanding(i);
                      return (
                        <div key={i.id} className="flex items-center gap-2 bg-slate-800/30 rounded-xl p-2">
                          <div className="w-24 text-sm text-slate-300 font-mono">{i.invoice_no}/{i.invoice_year}</div>
                          <div className="w-24 text-center text-xs text-slate-400">{i.date}</div>
                          <div className="w-24 text-center text-xs text-amber-400">{i.due_date || "—"}</div>
                          <div className="flex-1 text-left text-sm text-white font-semibold">{fmt(out)}</div>
                          <input value={alloc[i.id] ?? ""} onChange={(e) => setA(i.id, e.target.value)} inputMode="decimal" placeholder="0.00"
                            className="w-32 bg-slate-800 border border-slate-700 rounded-lg px-2 py-2 text-sm text-white text-center outline-none focus:border-emerald-500" />
                          <button type="button" onClick={() => payFull(i)} className="w-16 text-[11px] text-emerald-400 hover:text-emerald-300 font-bold">{t("Full", "كامل")}</button>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </Section>
          ) : (
            <Section title={t("Invoices", "الفواتير")}><div className="text-center text-slate-600 py-6 text-sm">{t("Select a supplier to see their outstanding invoices.", "اختر موردًا لعرض فواتيره المستحقة.")}</div></Section>
          )}

          <Section title={t("Notes", "ملاحظات")}><input value={pNotes} onChange={(e) => setPNotes(e.target.value)} placeholder={t("Optional", "اختياري")} className={inp} /></Section>

          <div className="bg-slate-800/60 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-6">
              <div><div className="text-[11px] text-slate-500">{t("Total owed to supplier", "إجمالي مستحق المورد")}</div><div className="text-base font-black text-amber-400">{fmt(totalOutstanding)}</div></div>
              <div><div className="text-[11px] text-slate-500">{t("Payment total", "إجمالي الدفعة")}</div><div className="text-lg font-black text-emerald-400">{fmt(allocTotal)}</div></div>
            </div>
            <button onClick={save} disabled={saving} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-[#fff] font-bold px-6 py-2.5 rounded-xl text-sm">
              <Save size={16} /> {saving ? t("Saving…", "جارٍ الحفظ…") : t("Save payment", "حفظ الدفعة")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ══════════════ LIST ══════════════
  return (
    <div className="p-4 lg:p-6 min-h-screen" dir={dir}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center"><HandCoins size={22} /></div>
          <div>
            <h1 className="text-xl font-black text-white">{t("Supplier payments", "سداد الموردين")}</h1>
            <p className="text-xs text-slate-500">{org?.name ?? "—"} {t("· Payment vouchers and allocation to supplier invoices", "· سندات صرف وتخصيص الدفعات على فواتير الموردين")}</p>
          </div>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-[#fff] font-bold px-4 py-2.5 rounded-xl text-sm">
          <Plus size={18} /> {t("New payment voucher", "سند صرف جديد")}
        </button>
      </div>

      {ok && <div className="mb-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl px-4 py-3 text-sm">{ok}</div>}

      <div className="flex flex-wrap items-center gap-2 mb-3 bg-slate-900/60 border border-slate-800 rounded-xl p-2.5">
        <Calendar size={16} className="text-slate-500" />
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-sm text-white" />
        <span className="text-slate-600 text-sm">←</span>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-sm text-white" />
        <button onClick={loadList} className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg text-sm"><RotateCcw size={14} /> {t("Refresh", "تحديث")}</button>
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute top-1/2 -translate-y-1/2 start-3 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search voucher, supplier, notes or amount…", "بحث برقم السند أو المورد أو الملاحظات أو المبلغ…")} aria-label={t("Search", "بحث")}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg ps-9 pe-8 py-1.5 text-sm text-white placeholder:text-slate-500 outline-none focus:border-emerald-500" />
          {q && <button type="button" onClick={() => setQ("")} aria-label={t("Clear", "مسح")} className="absolute top-1/2 -translate-y-1/2 end-2 text-slate-400 hover:text-white"><X size={14} /></button>}
        </div>
        <button type="button" onClick={doExcel} disabled={!shown.length} className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-3 py-1.5 rounded-lg text-sm font-bold disabled:opacity-40"><Download size={14} /> Excel</button>
        <button type="button" onClick={doPrint} disabled={!shown.length} className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 px-3 py-1.5 rounded-lg text-sm font-bold disabled:opacity-40"><Printer size={14} /> {t("Print / PDF", "طباعة / PDF")}</button>
      </div>

      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-400 text-xs border-b border-slate-800 bg-slate-900">
                <th className="text-start font-semibold px-3 py-2.5">{t("Voucher", "السند")}</th>
                <th className="text-start font-semibold px-3 py-2.5">{t("Date", "التاريخ")}</th>
                <th className="text-start font-semibold px-3 py-2.5">{t("Supplier", "المورد")}</th>
                <th className="text-center font-semibold px-3 py-2.5">{t("Invoices", "عدد الفواتير")}</th>
                <th className="text-end font-semibold px-3 py-2.5">{t("Amount", "المبلغ")}</th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && (
                <tr><td colSpan={5} className="text-center text-slate-600 py-10"><Package size={30} className="mx-auto mb-2 opacity-40" />{list.length === 0 ? t("No payment vouchers in this period.", "لا توجد سندات صرف في هذه الفترة.") : t("No vouchers match your search.", "لا توجد سندات مطابقة للبحث.")}</td></tr>
              )}
              {shown.map((p) => (
                <tr key={p.id} className="border-b border-slate-800/60 hover:bg-slate-800/30">
                  <td className="px-3 py-2.5 text-slate-300 font-mono">{voucherNo(p)}</td>
                  <td className="px-3 py-2.5 text-slate-400">{p.date}</td>
                  <td className="px-3 py-2.5 text-white">{p.supplier_name || "—"}</td>
                  <td className="px-3 py-2.5 text-center text-slate-400">{(p.allocations || []).length}</td>
                  <td className="px-3 py-2.5 text-end text-emerald-400 font-semibold">{fmt(p.amount)}</td>
                </tr>
              ))}
            </tbody>
            {shown.length > 0 && (
              <tfoot><tr className="border-t border-slate-700 bg-slate-900 font-bold">
                <td className="px-3 py-2.5 text-slate-300" colSpan={4}>{t("Total", "الإجمالي")} ({shown.length})</td>
                <td className="px-3 py-2.5 text-end text-emerald-400 font-semibold">{fmt(shownTotal)}</td>
              </tr></tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}

const inp = "w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-emerald-500 outline-none";

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3"><h3 className="text-sm font-bold text-slate-200">{title}</h3>{action}</div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="block text-xs text-slate-400 mb-1">{label}</span>{children}</label>;
}
