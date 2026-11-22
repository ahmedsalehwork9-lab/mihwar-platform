import { useEffect, useMemo, useState, useCallback } from "react";
import {
  ShoppingBag, Plus, X, Trash2, Search, Printer, Wallet, Package,
  FileText, Calendar, TrendingUp, Building2, RotateCcw,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import * as DB from "../lib/accountingDb";
import type {
  GLAccount, GLParty, GLTreasury, POSProduct, GLPurchaseInvoice,
  PurchaseItem, PurchaseKind, PurchasePayType,
} from "../lib/accountingDb";

const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10); };
const fmt = (n: number) => (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

type FormLine = { product_id: number | null; description: string; qty: string; unit_cost: string };
const emptyLine = (): FormLine => ({ product_id: null, description: "", qty: "1", unit_cost: "" });

const KIND_LABEL: Record<PurchaseKind, string> = { inventory: "مخزون", expense: "مصروف", asset: "أصل ثابت" };
const PAY_LABEL: Record<PurchasePayType, string> = { cash: "نقدي", credit: "آجل", partial: "جزئي", card: "شبكة" };
const payBadge: Record<PurchasePayType, string> = {
  cash: "bg-emerald-500/15 text-emerald-400",
  credit: "bg-amber-500/15 text-amber-400",
  partial: "bg-sky-500/15 text-sky-400",
  card: "bg-violet-500/15 text-violet-400",
};

export default function PurchaseInvoicesPage() {
  const { ownedShopId } = (useAuth() as any) ?? {};
  const [org, setOrg] = useState<{ id: number; name: string } | null>(null);
  const [accounts, setAccounts] = useState<GLAccount[]>([]);
  const [treasuries, setTreasuries] = useState<GLTreasury[]>([]);
  const [suppliers, setSuppliers] = useState<GLParty[]>([]);
  const [products, setProducts] = useState<POSProduct[]>([]);
  const [list, setList] = useState<GLPurchaseInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  // ── form state ──
  const [fDate, setFDate] = useState(today());
  const [fSupplierId, setFSupplierId] = useState<number | "">("");
  const [fSupplierName, setFSupplierName] = useState("");
  const [fSupplierInvNo, setFSupplierInvNo] = useState("");
  const [fKind, setFKind] = useState<PurchaseKind>("inventory");
  const [fDebitAcc, setFDebitAcc] = useState<number | "">("");
  const [fTaxAcc, setFTaxAcc] = useState<number | "">("");
  const [fRate, setFRate] = useState("15");
  const [fInclusive, setFInclusive] = useState(false);
  const [fPay, setFPay] = useState<PurchasePayType>("credit");
  const [fTreasury, setFTreasury] = useState<number | "">("");
  const [fSupplierAcc, setFSupplierAcc] = useState<number | "">("");
  const [fPaid, setFPaid] = useState("");
  const [fDue, setFDue] = useState("");
  const [fNotes, setFNotes] = useState("");
  const [lines, setLines] = useState<FormLine[]>([emptyLine()]);

  // ── load reference data ──
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const o = await DB.getOrgForBranch(ownedShopId ?? null);
      if (!alive) return;
      setOrg(o);
      if (o) {
        const [accs, treas, sups, prods] = await Promise.all([
          DB.fetchAccounts(o.id),
          DB.fetchTreasuries(o.id),
          DB.fetchParties(o.id, "supplier"),
          ownedShopId ? DB.fetchProducts(Number(ownedShopId)) : Promise.resolve([] as POSProduct[]),
        ]);
        if (!alive) return;
        setAccounts(accs); setTreasuries(treas); setSuppliers(sups); setProducts(prods);
      } else { setAccounts([]); setTreasuries([]); setSuppliers([]); setProducts([]); }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [ownedShopId]);

  const loadList = useCallback(async () => {
    if (!org) return;
    setList(await DB.fetchPurchaseInvoices(org.id, from, to, ownedShopId ? Number(ownedShopId) : null));
  }, [org, from, to, ownedShopId]);
  useEffect(() => { loadList(); }, [loadList]);

  // ── account resolution ──
  const byCode = useCallback((c: string) => accounts.find((a) => a.code === c && !a.is_group), [accounts]);
  const inventoryAcc = useMemo(() => byCode("1104") ?? accounts.find((a) => a.type === "asset" && !a.is_group && /مخزون/.test(a.name)), [accounts, byCode]);
  const purchaseExpAcc = useMemo(() => byCode("5101") ?? accounts.find((a) => a.type === "expense" && !a.is_group), [accounts, byCode]);
  const inputVatAcc = useMemo(() => byCode("1106") ?? accounts.find((a) => !a.is_group && /مدخلات/.test(a.name)), [accounts, byCode]);
  const defaultSupplierAcc = useMemo(() => byCode("2101") ?? accounts.find((a) => a.type === "liability" && !a.is_group && /مورد/.test(a.name)), [accounts, byCode]);

  const debitOptions = useMemo(() => {
    if (fKind === "inventory") return accounts.filter((a) => a.type === "asset" && !a.is_group);
    if (fKind === "asset") return accounts.filter((a) => a.type === "asset" && !a.is_group);
    return accounts.filter((a) => a.type === "expense" && !a.is_group);
  }, [accounts, fKind]);

  const bankTreasuries = useMemo(() => treasuries.filter((t) => t.account_id && (t.kind === "bank" || /شبكة|مدى|mada|visa|بنك|card/i.test(t.name))), [treasuries]);
  const cashTreasuries = useMemo(() => treasuries.filter((t) => t.account_id && t.kind === "cash"), [treasuries]);
  const treasuryOptions = fPay === "card" ? bankTreasuries : [...cashTreasuries, ...bankTreasuries];

  // default debit + tax + supplier accounts when kind/data changes
  useEffect(() => {
    const def = fKind === "inventory" ? inventoryAcc?.id : fKind === "expense" ? purchaseExpAcc?.id : debitOptions[0]?.id;
    setFDebitAcc(def ?? "");
  }, [fKind, inventoryAcc, purchaseExpAcc, debitOptions]);
  useEffect(() => { setFTaxAcc(inputVatAcc?.id ?? ""); }, [inputVatAcc]);
  useEffect(() => {
    const sup = suppliers.find((s) => s.id === fSupplierId);
    setFSupplierAcc((sup?.account_id ?? defaultSupplierAcc?.id) ?? "");
  }, [fSupplierId, suppliers, defaultSupplierAcc]);
  useEffect(() => {
    if (fPay === "card") setFTreasury(bankTreasuries[0]?.id ?? "");
    else if (fPay === "cash" || fPay === "partial") setFTreasury(cashTreasuries[0]?.id ?? bankTreasuries[0]?.id ?? "");
  }, [fPay, bankTreasuries, cashTreasuries]);

  // ── totals ──
  const totals = useMemo(() => {
    const items = lines.map((l) => ({ qty: Number(l.qty) || 0, unit_price: Number(l.unit_cost) || 0 }));
    return DB.invoiceTotals(items, Number(fRate) || 0, fInclusive);
  }, [lines, fRate, fInclusive]);
  const paidNow = fPay === "cash" || fPay === "card" ? totals.total : fPay === "credit" ? 0 : Math.min(Math.max(Number(fPaid) || 0, 0), totals.total);
  const dueNow = r2(totals.total - paidNow);

  // ── KPIs ──
  const kpi = useMemo(() => {
    const count = list.length;
    const total = list.reduce((s, i) => s + (Number(i.total) || 0), 0);
    const paid = list.reduce((s, i) => s + (Number(i.paid_amount) || 0), 0);
    const due = r2(total - paid);
    return { count, total: r2(total), paid: r2(paid), due };
  }, [list]);

  // ── form helpers ──
  const setLine = (i: number, patch: Partial<FormLine>) => setLines((ls) => ls.map((l, idx) => idx === i ? { ...l, ...patch } : l));
  const addLine = () => setLines((ls) => [...ls, emptyLine()]);
  const delLine = (i: number) => setLines((ls) => ls.length > 1 ? ls.filter((_, idx) => idx !== i) : ls);
  const pickProduct = (i: number, p: POSProduct) => setLine(i, { product_id: p.id, description: p.product_name, unit_cost: String(p.price || "") });

  const resetForm = () => {
    setFDate(today()); setFSupplierId(""); setFSupplierName(""); setFSupplierInvNo("");
    setFKind("inventory"); setFRate("15"); setFInclusive(false); setFPay("credit");
    setFPaid(""); setFDue(""); setFNotes(""); setLines([emptyLine()]); setErr(null);
  };

  const save = async () => {
    if (!org) return;
    setErr(null); setOk(null);
    const items: PurchaseItem[] = lines
      .map((l) => {
        const qty = Number(l.qty) || 0, uc = Number(l.unit_cost) || 0;
        return { product_id: l.product_id, description: l.description.trim(), qty, unit_cost: uc, line_total: r2(qty * uc) };
      })
      .filter((it) => it.qty > 0 && it.unit_cost > 0);
    if (!items.length) { setErr("أضف صنفًا واحدًا على الأقل بكمية وتكلفة صحيحة."); return; }
    if (fKind === "inventory" && items.some((it) => !it.product_id)) {
      setErr("مشتريات المخزون: اربط كل سطر بصنف من المخزون (لزيادة الكمية)."); return;
    }
    const supName = fSupplierId ? (suppliers.find((s) => s.id === fSupplierId)?.name ?? null) : (fSupplierName.trim() || null);
    setSaving(true);
    const res = await DB.createPurchaseInvoice(org.id, {
      branch_id: ownedShopId ? Number(ownedShopId) : null,
      date: fDate,
      due_date: (fPay === "credit" || fPay === "partial") ? (fDue || null) : null,
      party_id: fSupplierId || null,
      supplier_name: supName,
      supplier_invoice_no: fSupplierInvNo.trim() || null,
      purchase_kind: fKind,
      debit_account_id: Number(fDebitAcc) || 0,
      tax_account_id: fTaxAcc ? Number(fTaxAcc) : null,
      payment_type: fPay,
      treasury_account_id: fTreasury ? Number(fTreasury) : null,
      supplier_account_id: fSupplierAcc ? Number(fSupplierAcc) : null,
      tax_rate: Number(fRate) || 0,
      tax_inclusive: fInclusive,
      items,
      paid_amount: Number(fPaid) || 0,
      notes: fNotes.trim() || null,
    });
    setSaving(false);
    if (!res.ok) { setErr(res.error || "تعذّر حفظ الفاتورة."); return; }
    setOk(`تم حفظ فاتورة المشتريات رقم ${res.invoiceNo}.`);
    setOpen(false); resetForm();
    if (ownedShopId) setProducts(await DB.fetchProducts(Number(ownedShopId)));
    loadList();
    setTimeout(() => setOk(null), 4000);
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" dir="rtl">
      <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="p-4 lg:p-6 min-h-screen" dir="rtl">
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-blue-500/15 text-blue-400 flex items-center justify-center"><ShoppingBag size={22} /></div>
          <div>
            <h1 className="text-xl font-black text-white">فواتير المشتريات</h1>
            <p className="text-xs text-slate-500">{org?.name ?? "—"} · تسجيل مشتريات بالترحيل المحاسبي وإدخال المخزون</p>
          </div>
        </div>
        <button onClick={() => { resetForm(); setOpen(true); }} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-[#fff] font-bold px-4 py-2.5 rounded-xl text-sm">
          <Plus size={18} /> فاتورة شراء جديدة
        </button>
      </div>

      {ok && <div className="mb-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl px-4 py-3 text-sm">{ok}</div>}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <KpiCard icon={<FileText size={18} />} tone="sky" label="عدد الفواتير" value={String(kpi.count)} />
        <KpiCard icon={<TrendingUp size={18} />} tone="blue" label="إجمالي المشتريات" value={fmt(kpi.total)} />
        <KpiCard icon={<Wallet size={18} />} tone="emerald" label="المدفوع" value={fmt(kpi.paid)} />
        <KpiCard icon={<Building2 size={18} />} tone="amber" label="مستحق للموردين" value={fmt(kpi.due)} />
      </div>

      {/* filters */}
      <div className="flex flex-wrap items-center gap-2 mb-3 bg-slate-900/60 border border-slate-800 rounded-xl p-2.5">
        <Calendar size={16} className="text-slate-500" />
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-sm text-white" />
        <span className="text-slate-600 text-sm">←</span>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-sm text-white" />
        <button onClick={loadList} className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg text-sm"><RotateCcw size={14} /> تحديث</button>
      </div>

      {/* list */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-400 text-xs border-b border-slate-800 bg-slate-900">
                <th className="text-right font-semibold px-3 py-2.5">رقم</th>
                <th className="text-right font-semibold px-3 py-2.5">التاريخ</th>
                <th className="text-right font-semibold px-3 py-2.5">المورد</th>
                <th className="text-right font-semibold px-3 py-2.5">النوع</th>
                <th className="text-left font-semibold px-3 py-2.5">الإجمالي</th>
                <th className="text-left font-semibold px-3 py-2.5">المدفوع</th>
                <th className="text-left font-semibold px-3 py-2.5">المستحق</th>
                <th className="text-center font-semibold px-3 py-2.5">السداد</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 && (
                <tr><td colSpan={8} className="text-center text-slate-600 py-10">
                  <Package size={30} className="mx-auto mb-2 opacity-40" />
                  لا توجد فواتير مشتريات في هذه الفترة.
                </td></tr>
              )}
              {list.map((inv) => {
                const due = r2((Number(inv.total) || 0) - (Number(inv.paid_amount) || 0));
                return (
                  <tr key={inv.id} className="border-b border-slate-800/60 hover:bg-slate-800/30">
                    <td className="px-3 py-2.5 text-slate-300 font-mono">{inv.invoice_no}/{inv.invoice_year}</td>
                    <td className="px-3 py-2.5 text-slate-400">{inv.date}</td>
                    <td className="px-3 py-2.5 text-white">{inv.supplier_name || "—"}{inv.supplier_invoice_no ? <span className="text-slate-500 text-xs"> · {inv.supplier_invoice_no}</span> : null}</td>
                    <td className="px-3 py-2.5 text-slate-400">{KIND_LABEL[inv.purchase_kind as PurchaseKind] ?? inv.purchase_kind}</td>
                    <td className="px-3 py-2.5 text-left text-white font-semibold">{fmt(inv.total)}</td>
                    <td className="px-3 py-2.5 text-left text-emerald-400">{fmt(inv.paid_amount)}</td>
                    <td className={`px-3 py-2.5 text-left ${due > 0 ? "text-amber-400" : "text-slate-600"}`}>{fmt(due)}</td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-lg text-xs font-bold ${payBadge[inv.payment_type as PurchasePayType] ?? "bg-slate-700 text-slate-300"}`}>{PAY_LABEL[inv.payment_type as PurchasePayType] ?? inv.payment_type}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── new invoice modal ── */}
      {open && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center overflow-y-auto p-3" onClick={() => !saving && setOpen(false)}>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl my-4" onClick={(e) => e.stopPropagation()} dir="rtl">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 sticky top-0 bg-slate-900 rounded-t-2xl z-10">
              <h2 className="text-white font-bold flex items-center gap-2"><ShoppingBag size={18} className="text-blue-400" /> فاتورة شراء جديدة</h2>
              <button onClick={() => !saving && setOpen(false)} className="text-slate-500 hover:text-white"><X size={20} /></button>
            </div>

            <div className="p-5 space-y-4">
              {err && <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl px-4 py-2.5 text-sm">{err}</div>}

              {/* top row */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Field label="التاريخ">
                  <input type="date" value={fDate} onChange={(e) => setFDate(e.target.value)} className={inp} />
                </Field>
                <Field label="المورد">
                  <select value={fSupplierId} onChange={(e) => setFSupplierId(e.target.value ? Number(e.target.value) : "")} className={inp}>
                    <option value="">— مورد نقدي / بدون —</option>
                    {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </Field>
                <Field label="رقم فاتورة المورد">
                  <input value={fSupplierInvNo} onChange={(e) => setFSupplierInvNo(e.target.value)} placeholder="اختياري" className={inp} />
                </Field>
              </div>
              {!fSupplierId && (
                <Field label="اسم المورد (نصي)">
                  <input value={fSupplierName} onChange={(e) => setFSupplierName(e.target.value)} placeholder="اتركه فارغًا = مورد نقدي" className={inp} />
                </Field>
              )}

              {/* kind + debit account */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Field label="نوع الشراء">
                  <div className="flex gap-1.5">
                    {(["inventory", "expense", "asset"] as PurchaseKind[]).map((k) => (
                      <button key={k} type="button" onClick={() => setFKind(k)} className={`flex-1 py-2 rounded-lg text-xs font-bold border ${fKind === k ? "bg-blue-600 border-blue-500 text-[#fff]" : "bg-slate-800 border-slate-700 text-slate-400"}`}>{KIND_LABEL[k]}</button>
                    ))}
                  </div>
                </Field>
                <Field label={fKind === "inventory" ? "حساب المخزون (مدين)" : fKind === "asset" ? "حساب الأصل (مدين)" : "حساب المصروف (مدين)"}>
                  <select value={fDebitAcc} onChange={(e) => setFDebitAcc(e.target.value ? Number(e.target.value) : "")} className={inp}>
                    <option value="">— اختر —</option>
                    {debitOptions.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
                  </select>
                </Field>
                <Field label="ضريبة المدخلات">
                  <select value={fTaxAcc} onChange={(e) => setFTaxAcc(e.target.value ? Number(e.target.value) : "")} className={inp}>
                    <option value="">— بدون ضريبة —</option>
                    {accounts.filter((a) => !a.is_group && /ضريبة|مدخلات|vat|tax/i.test(a.name)).map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
                  </select>
                </Field>
              </div>

              {/* items */}
              <div className="border border-slate-800 rounded-xl overflow-hidden">
                <div className="bg-slate-800/60 px-3 py-2 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300">الأصناف</span>
                  <button type="button" onClick={addLine} className="flex items-center gap-1 text-blue-400 hover:text-blue-300 text-xs font-bold"><Plus size={14} /> سطر</button>
                </div>
                <div className="divide-y divide-slate-800">
                  {lines.map((l, i) => (
                    <LineRow
                      key={i} line={l} kind={fKind} products={products}
                      onChange={(patch) => setLine(i, patch)}
                      onPick={(p) => pickProduct(i, p)}
                      onDel={() => delLine(i)}
                      canDel={lines.length > 1}
                    />
                  ))}
                </div>
              </div>

              {/* tax + payment */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="bg-slate-800/40 rounded-xl p-3 space-y-2.5">
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="نسبة الضريبة %">
                      <input value={fRate} onChange={(e) => setFRate(e.target.value)} inputMode="decimal" className={inp} />
                    </Field>
                    <Field label="طريقة الضريبة">
                      <div className="flex gap-1.5">
                        <button type="button" onClick={() => setFInclusive(false)} className={`flex-1 py-2 rounded-lg text-xs font-bold border ${!fInclusive ? "bg-blue-600 border-blue-500 text-[#fff]" : "bg-slate-800 border-slate-700 text-slate-400"}`}>غير شامل</button>
                        <button type="button" onClick={() => setFInclusive(true)} className={`flex-1 py-2 rounded-lg text-xs font-bold border ${fInclusive ? "bg-blue-600 border-blue-500 text-[#fff]" : "bg-slate-800 border-slate-700 text-slate-400"}`}>شامل</button>
                      </div>
                    </Field>
                  </div>
                </div>
                <div className="bg-slate-800/40 rounded-xl p-3 space-y-2.5">
                  <Field label="طريقة السداد">
                    <div className="grid grid-cols-4 gap-1.5">
                      {(["credit", "cash", "partial", "card"] as PurchasePayType[]).map((p) => (
                        <button key={p} type="button" onClick={() => setFPay(p)} className={`py-2 rounded-lg text-xs font-bold border ${fPay === p ? "bg-blue-600 border-blue-500 text-[#fff]" : "bg-slate-800 border-slate-700 text-slate-400"}`}>{PAY_LABEL[p]}</button>
                      ))}
                    </div>
                  </Field>
                  {(fPay === "cash" || fPay === "card" || fPay === "partial") && (
                    <Field label={fPay === "card" ? "البنك/الشبكة" : "الخزنة/البنك"}>
                      <select value={fTreasury} onChange={(e) => setFTreasury(e.target.value ? Number(e.target.value) : "")} className={inp}>
                        <option value="">— اختر —</option>
                        {treasuryOptions.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </Field>
                  )}
                  {fPay === "partial" && (
                    <Field label="المبلغ المدفوع الآن">
                      <input value={fPaid} onChange={(e) => setFPaid(e.target.value)} inputMode="decimal" placeholder="0.00" className={inp} />
                    </Field>
                  )}
                  {(fPay === "credit" || fPay === "partial") && (
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="حساب المورد (ذمة)">
                        <select value={fSupplierAcc} onChange={(e) => setFSupplierAcc(e.target.value ? Number(e.target.value) : "")} className={inp}>
                          <option value="">— اختر —</option>
                          {accounts.filter((a) => a.type === "liability" && !a.is_group).map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
                        </select>
                      </Field>
                      <Field label="تاريخ الاستحقاق">
                        <input type="date" value={fDue} onChange={(e) => setFDue(e.target.value)} className={inp} />
                      </Field>
                    </div>
                  )}
                </div>
              </div>

              <Field label="ملاحظات">
                <input value={fNotes} onChange={(e) => setFNotes(e.target.value)} placeholder="اختياري" className={inp} />
              </Field>

              {/* totals */}
              <div className="bg-slate-800/60 rounded-xl p-4 grid grid-cols-2 md:grid-cols-5 gap-3 text-center">
                <Tot label="الصافي" value={fmt(totals.subtotal)} />
                <Tot label="الضريبة" value={fmt(totals.tax)} />
                <Tot label="الإجمالي" value={fmt(totals.total)} big />
                <Tot label="المدفوع" value={fmt(paidNow)} tone="emerald" />
                <Tot label="المستحق" value={fmt(dueNow)} tone="amber" />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-slate-800 sticky bottom-0 bg-slate-900 rounded-b-2xl">
              <button onClick={() => !saving && setOpen(false)} className="px-4 py-2 rounded-xl text-sm text-slate-400 hover:text-white">إلغاء</button>
              <button onClick={save} disabled={saving} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-[#fff] font-bold px-5 py-2 rounded-xl text-sm">
                {saving ? "جارٍ الحفظ…" : <>حفظ وترحيل</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const inp = "w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 outline-none";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="block text-xs text-slate-400 mb-1">{label}</span>{children}</label>;
}

function Tot({ label, value, big, tone }: { label: string; value: string; big?: boolean; tone?: "emerald" | "amber" }) {
  const c = tone === "emerald" ? "text-emerald-400" : tone === "amber" ? "text-amber-400" : "text-white";
  return (
    <div>
      <div className="text-[11px] text-slate-500 mb-0.5">{label}</div>
      <div className={`${big ? "text-lg" : "text-sm"} font-black ${c}`}>{value}</div>
    </div>
  );
}

function KpiCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: "sky" | "blue" | "emerald" | "amber" }) {
  const tones: Record<string, string> = {
    sky: "bg-sky-500/15 text-sky-400", blue: "bg-blue-500/15 text-blue-400",
    emerald: "bg-emerald-500/15 text-emerald-400", amber: "bg-amber-500/15 text-amber-400",
  };
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2.5 ${tones[tone]}`}>{icon}</div>
      <div className="text-xl font-black text-white">{value}</div>
      <div className="text-xs text-slate-500 mt-0.5">{label}</div>
    </div>
  );
}

function LineRow({ line, kind, products, onChange, onPick, onDel, canDel }: {
  line: FormLine; kind: PurchaseKind; products: POSProduct[];
  onChange: (patch: Partial<FormLine>) => void; onPick: (p: POSProduct) => void;
  onDel: () => void; canDel: boolean;
}) {
  const [q, setQ] = useState("");
  const [showList, setShowList] = useState(false);
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return products.slice(0, 8);
    return products.filter((p) => p.product_name.toLowerCase().includes(s) || (p.barcode || "").includes(s) || (p.product_code || "").toLowerCase().includes(s)).slice(0, 8);
  }, [q, products]);
  const lineTotal = r2((Number(line.qty) || 0) * (Number(line.unit_cost) || 0));
  return (
    <div className="p-2.5">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          {kind === "inventory" ? (
            <div className="relative">
              {line.product_id ? (
                <div className="flex items-center justify-between bg-slate-800 border border-slate-700 rounded-lg px-3 py-2">
                  <span className="text-sm text-white truncate">{line.description}</span>
                  <button type="button" onClick={() => { onChange({ product_id: null, description: "" }); setQ(""); }} className="text-slate-500 hover:text-white shrink-0"><X size={15} /></button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2">
                    <Search size={14} className="text-slate-500 shrink-0" />
                    <input value={q} onChange={(e) => { setQ(e.target.value); setShowList(true); }} onFocus={() => setShowList(true)} placeholder="ابحث عن صنف…" className="bg-transparent text-sm text-white outline-none w-full" />
                  </div>
                  {showList && matches.length > 0 && (
                    <div className="absolute z-20 mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg shadow-xl max-h-52 overflow-y-auto">
                      {matches.map((p) => (
                        <button key={p.id} type="button" onClick={() => { onPick(p); setShowList(false); setQ(""); }} className="w-full text-right px-3 py-2 hover:bg-slate-700 flex items-center justify-between gap-2">
                          <span className="text-sm text-white truncate">{p.product_name}</span>
                          <span className="text-xs text-slate-500 shrink-0">تكلفة {fmt(p.price)} · متاح {p.quantity}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            <input value={line.description} onChange={(e) => onChange({ description: e.target.value })} placeholder="وصف السطر (مصروف/خدمة/أصل)" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500" />
          )}
        </div>
        <input value={line.qty} onChange={(e) => onChange({ qty: e.target.value })} inputMode="decimal" placeholder="كمية" className="w-16 bg-slate-800 border border-slate-700 rounded-lg px-2 py-2 text-sm text-white text-center outline-none focus:border-blue-500" />
        <input value={line.unit_cost} onChange={(e) => onChange({ unit_cost: e.target.value })} inputMode="decimal" placeholder="تكلفة" className="w-24 bg-slate-800 border border-slate-700 rounded-lg px-2 py-2 text-sm text-white text-center outline-none focus:border-blue-500" />
        <div className="w-24 text-left text-sm text-slate-300 font-semibold px-2 py-2 shrink-0">{fmt(lineTotal)}</div>
        {canDel && <button type="button" onClick={onDel} className="text-slate-600 hover:text-red-400 p-2 shrink-0"><Trash2 size={15} /></button>}
      </div>
    </div>
  );
}
