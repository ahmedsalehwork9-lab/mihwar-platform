import { useEffect, useMemo, useState, useCallback } from "react";
import {
  RotateCcw, Plus, Package, Calendar, ArrowRight, Save, Search, Undo2, Wallet,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import * as DB from "../lib/accountingDb";
import type {
  GLAccount, GLTreasury, GLPurchaseInvoice, GLPurchaseReturn,
  PurchaseReturnItem, PurchaseKind,
} from "../lib/accountingDb";

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const fmt = (n: number) => (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const KIND_LABEL: Record<PurchaseKind, string> = { inventory: "مخزون", expense: "مصروف", asset: "أصل ثابت" };

type RetLine = { qty: string; max: number };

export default function PurchaseReturnsPage() {
  const { ownedShopId } = (useAuth() as any) ?? {};
  const [org, setOrg] = useState<{ id: number; name: string } | null>(null);
  const [accounts, setAccounts] = useState<GLAccount[]>([]);
  const [treasuries, setTreasuries] = useState<GLTreasury[]>([]);
  const [list, setList] = useState<GLPurchaseReturn[]>([]);
  const [invoices, setInvoices] = useState<GLPurchaseInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(today());

  const [mode, setMode] = useState<"list" | "new">("list");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  // ── form ──
  const [invSearch, setInvSearch] = useState("");
  const [sel, setSel] = useState<GLPurchaseInvoice | null>(null);
  const [retDate, setRetDate] = useState(today());
  const [retLines, setRetLines] = useState<RetLine[]>([]);
  const [refundMode, setRefundMode] = useState<"credit" | "cash">("credit");
  const [refundAcc, setRefundAcc] = useState<number | "">("");
  const [notes, setNotes] = useState("");

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
    setList(await DB.fetchPurchaseReturns(org.id, from, to, ownedShopId ? Number(ownedShopId) : null));
  }, [org, from, to, ownedShopId]);
  useEffect(() => { loadList(); }, [loadList]);

  const cashTreasuries = useMemo(() => treasuries.filter((t) => t.account_id && t.kind === "cash"), [treasuries]);
  const bankTreasuries = useMemo(() => treasuries.filter((t) => t.account_id && (t.kind === "bank" || /شبكة|مدى|mada|visa|بنك|card/i.test(t.name))), [treasuries]);
  useEffect(() => { if (refundMode === "cash") setRefundAcc(cashTreasuries[0]?.id ?? bankTreasuries[0]?.id ?? ""); }, [refundMode, cashTreasuries, bankTreasuries]);

  // open new → load recent invoices
  const openNew = async () => {
    if (!org) return;
    setErr(null); setSel(null); setRetLines([]); setNotes(""); setRetDate(today()); setRefundMode("credit"); setInvSearch("");
    const invs = await DB.fetchPurchaseInvoices(org.id, daysAgo(120), today(), ownedShopId ? Number(ownedShopId) : null);
    setInvoices(invs);
    setMode("new"); window.scrollTo(0, 0);
  };
  const closeNew = () => { if (!saving) { setMode("list"); setErr(null); } };

  // pick an invoice → build return lines with max = origQty - alreadyReturned
  const pickInvoice = async (inv: GLPurchaseInvoice) => {
    setSel(inv);
    setRefundMode(inv.payment_type === "cash" || inv.payment_type === "card" ? "cash" : "credit");
    const returned = await DB.fetchReturnedQtyByInvoice(inv.id);
    setRetLines(inv.items.map((it, i) => {
      const max = r2((Number(it.qty) || 0) - (Number(returned[i]) || 0));
      return { qty: "", max: Math.max(0, max) };
    }));
  };

  const filteredInvoices = useMemo(() => {
    const s = invSearch.trim().toLowerCase();
    if (!s) return invoices.slice(0, 30);
    return invoices.filter((i) =>
      String(i.invoice_no).includes(s) ||
      (i.supplier_name || "").toLowerCase().includes(s) ||
      (i.supplier_invoice_no || "").toLowerCase().includes(s)
    ).slice(0, 30);
  }, [invSearch, invoices]);

  // return totals (preview) — uses original tax method
  const preview = useMemo(() => {
    if (!sel) return { subtotal: 0, tax: 0, total: 0 };
    const items = sel.items.map((it, i) => ({ qty: Number(retLines[i]?.qty) || 0, unit_price: Number(it.unit_cost) || 0 }));
    return DB.invoiceTotals(items, sel.tax_rate, sel.tax_inclusive);
  }, [sel, retLines]);

  const setQty = (i: number, v: string) => setRetLines((ls) => ls.map((l, idx) => idx === i ? { ...l, qty: v } : l));

  const save = async () => {
    if (!org || !sel) return;
    setErr(null); setOk(null);
    const items: PurchaseReturnItem[] = sel.items.map((it, i) => {
      const qty = Math.min(Number(retLines[i]?.qty) || 0, retLines[i]?.max ?? 0);
      return { original_item_index: i, product_id: it.product_id, description: it.description, qty, unit_cost: Number(it.unit_cost) || 0, line_total: r2(qty * (Number(it.unit_cost) || 0)) };
    }).filter((it) => it.qty > 0);
    if (!items.length) { setErr("حدّد كمية مرتجعة لصنف واحد على الأقل (ضمن المتاح)."); return; }
    if (refundMode === "cash" && !refundAcc) { setErr("اختر خزنة/بنك الاسترداد."); return; }
    setSaving(true);
    const res = await DB.createPurchaseReturn(org.id, {
      original_invoice: sel, date: retDate, items,
      refund_mode: refundMode, refund_account_id: refundMode === "cash" ? Number(refundAcc) : null,
      notes: notes.trim() || null,
    });
    setSaving(false);
    if (!res.ok) { setErr(res.error || "تعذّر حفظ المرتجع."); return; }
    setOk(`تم حفظ مرتجع المشتريات ${res.returnLabel}.`);
    setMode("list"); loadList();
    setTimeout(() => setOk(null), 4000);
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" dir="rtl">
      <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  // ══════════════ NEW RETURN (full page) ══════════════
  if (mode === "new") {
    return (
      <div className="min-h-screen" dir="rtl">
        <div className="sticky top-0 z-20 bg-slate-950/95 backdrop-blur border-b border-slate-800">
          <div className="max-w-5xl mx-auto px-4 lg:px-6 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button onClick={closeNew} className="flex items-center gap-1.5 text-slate-400 hover:text-white text-sm shrink-0"><ArrowRight size={18} /> رجوع</button>
              <div className="h-5 w-px bg-slate-700" />
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-orange-500/15 text-orange-400 flex items-center justify-center shrink-0"><Undo2 size={16} /></div>
                <h1 className="text-base font-black text-white truncate">مرتجع مشتريات جديد</h1>
              </div>
            </div>
            {sel && (
              <button onClick={save} disabled={saving} className="flex items-center gap-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-[#fff] font-bold px-5 py-2 rounded-xl text-sm shrink-0">
                <Save size={16} /> {saving ? "جارٍ الحفظ…" : "حفظ المرتجع"}
              </button>
            )}
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-4 lg:px-6 py-5 space-y-4">
          {err && <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl px-4 py-3 text-sm">{err}</div>}

          {!sel ? (
            <Section title="اختر فاتورة الشراء الأصلية">
              <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 mb-3">
                <Search size={15} className="text-slate-500" />
                <input value={invSearch} onChange={(e) => setInvSearch(e.target.value)} placeholder="بحث برقم الفاتورة أو اسم المورد…" className="bg-transparent text-sm text-white outline-none w-full" />
              </div>
              <div className="divide-y divide-slate-800 max-h-[55vh] overflow-y-auto">
                {filteredInvoices.length === 0 && <div className="text-center text-slate-600 py-8 text-sm">لا توجد فواتير مشتريات في آخر 120 يومًا.</div>}
                {filteredInvoices.map((inv) => (
                  <button key={inv.id} onClick={() => pickInvoice(inv)} className="w-full text-right px-2 py-3 hover:bg-slate-800/40 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm text-white font-semibold truncate">{inv.supplier_name || "مورد نقدي"} <span className="text-slate-500 font-mono text-xs">#{inv.invoice_no}/{inv.invoice_year}</span></div>
                      <div className="text-xs text-slate-500">{inv.date} · {KIND_LABEL[inv.purchase_kind as PurchaseKind]} · {inv.items.length} صنف</div>
                    </div>
                    <div className="text-left shrink-0"><div className="text-sm text-white font-bold">{fmt(inv.total)}</div><div className="text-[11px] text-slate-500">{inv.payment_type === "cash" || inv.payment_type === "card" ? "مدفوعة" : "آجلة"}</div></div>
                  </button>
                ))}
              </div>
            </Section>
          ) : (
            <>
              <Section title="الفاتورة الأصلية" action={<button onClick={() => { setSel(null); setRetLines([]); }} className="text-xs text-slate-400 hover:text-white">تغيير</button>}>
                <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
                  <span className="text-white font-bold">{sel.supplier_name || "مورد نقدي"}</span>
                  <span className="text-slate-400 font-mono text-xs">#{sel.invoice_no}/{sel.invoice_year}</span>
                  <span className="text-slate-400">{sel.date}</span>
                  <span className="text-slate-400">{KIND_LABEL[sel.purchase_kind as PurchaseKind]}</span>
                  <span className="text-slate-400">الإجمالي: <span className="text-white">{fmt(sel.total)}</span></span>
                </div>
              </Section>

              <Section title="الأصناف المرتجعة">
                <div className="hidden md:flex items-center gap-2 px-1 pb-2 text-[11px] text-slate-500 font-semibold">
                  <div className="flex-1">الصنف</div>
                  <div className="w-24 text-center">تكلفة الوحدة</div>
                  <div className="w-20 text-center">الأصلية</div>
                  <div className="w-20 text-center">المتاح</div>
                  <div className="w-24 text-center">كمية الإرجاع</div>
                </div>
                <div className="space-y-2">
                  {sel.items.map((it, i) => {
                    const max = retLines[i]?.max ?? 0;
                    return (
                      <div key={i} className="flex items-center gap-2 bg-slate-800/30 rounded-xl p-2">
                        <div className="flex-1 min-w-0 text-sm text-white truncate">{it.description || "—"}</div>
                        <div className="w-24 text-center text-sm text-slate-400">{fmt(it.unit_cost)}</div>
                        <div className="w-20 text-center text-sm text-slate-400">{fmt(it.qty)}</div>
                        <div className={`w-20 text-center text-sm ${max > 0 ? "text-emerald-400" : "text-slate-600"}`}>{fmt(max)}</div>
                        <input
                          value={retLines[i]?.qty ?? ""} onChange={(e) => setQty(i, e.target.value)}
                          inputMode="decimal" placeholder="0" disabled={max <= 0}
                          className="w-24 bg-slate-800 border border-slate-700 rounded-lg px-2 py-2 text-sm text-white text-center outline-none focus:border-orange-500 disabled:opacity-40"
                        />
                      </div>
                    );
                  })}
                </div>
              </Section>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <Section title="التاريخ">
                  <input type="date" value={retDate} onChange={(e) => setRetDate(e.target.value)} className={inp} />
                </Section>
                <Section title="طريقة الاسترداد">
                  <div className="flex gap-1.5">
                    <button type="button" onClick={() => setRefundMode("credit")} className={`flex-1 py-2 rounded-lg text-xs font-bold border ${refundMode === "credit" ? "bg-orange-600 border-orange-500 text-[#fff]" : "bg-slate-800 border-slate-700 text-slate-400"}`}>خصم من المورد</button>
                    <button type="button" onClick={() => setRefundMode("cash")} className={`flex-1 py-2 rounded-lg text-xs font-bold border ${refundMode === "cash" ? "bg-orange-600 border-orange-500 text-[#fff]" : "bg-slate-800 border-slate-700 text-slate-400"}`}>استرداد نقدي</button>
                  </div>
                  {refundMode === "cash" && (
                    <div className="mt-3"><label className="block"><span className="block text-xs text-slate-400 mb-1 flex items-center gap-1"><Wallet size={12} /> خزنة الاسترداد</span>
                      <select value={refundAcc} onChange={(e) => setRefundAcc(e.target.value ? Number(e.target.value) : "")} className={inp}>
                        <option value="">— اختر —</option>
                        {[...cashTreasuries, ...bankTreasuries].map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </label></div>
                  )}
                </Section>
                <Section title="قيمة المرتجع">
                  <div className="space-y-2">
                    <Row label="الصافي" value={fmt(preview.subtotal)} />
                    <Row label="الضريبة" value={fmt(preview.tax)} />
                    <div className="h-px bg-slate-800" />
                    <Row label="الإجمالي" value={fmt(preview.total)} big />
                  </div>
                </Section>
              </div>

              <Section title="ملاحظات"><input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="سبب الإرجاع (اختياري)" className={inp} /></Section>

              <div className="flex items-center justify-end gap-2 pb-6">
                <button onClick={closeNew} disabled={saving} className="px-4 py-2.5 rounded-xl text-sm text-slate-400 hover:text-white">إلغاء</button>
                <button onClick={save} disabled={saving} className="flex items-center gap-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-[#fff] font-bold px-6 py-2.5 rounded-xl text-sm">
                  <Save size={16} /> {saving ? "جارٍ الحفظ…" : "حفظ المرتجع"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // ══════════════ LIST ══════════════
  return (
    <div className="p-4 lg:p-6 min-h-screen" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-orange-500/15 text-orange-400 flex items-center justify-center"><Undo2 size={22} /></div>
          <div>
            <h1 className="text-xl font-black text-white">مرتجعات المشتريات</h1>
            <p className="text-xs text-slate-500">{org?.name ?? "—"} · إرجاع بضاعة للمورد بعكس القيد وإخراج المخزون</p>
          </div>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 bg-orange-600 hover:bg-orange-500 text-[#fff] font-bold px-4 py-2.5 rounded-xl text-sm">
          <Plus size={18} /> مرتجع جديد
        </button>
      </div>

      {ok && <div className="mb-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl px-4 py-3 text-sm">{ok}</div>}

      <div className="flex flex-wrap items-center gap-2 mb-3 bg-slate-900/60 border border-slate-800 rounded-xl p-2.5">
        <Calendar size={16} className="text-slate-500" />
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-sm text-white" />
        <span className="text-slate-600 text-sm">←</span>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-sm text-white" />
        <button onClick={loadList} className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg text-sm"><RotateCcw size={14} /> تحديث</button>
      </div>

      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-400 text-xs border-b border-slate-800 bg-slate-900">
                <th className="text-right font-semibold px-3 py-2.5">المرتجع</th>
                <th className="text-right font-semibold px-3 py-2.5">التاريخ</th>
                <th className="text-right font-semibold px-3 py-2.5">المورد</th>
                <th className="text-right font-semibold px-3 py-2.5">الفاتورة</th>
                <th className="text-center font-semibold px-3 py-2.5">الاسترداد</th>
                <th className="text-left font-semibold px-3 py-2.5">الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 && (
                <tr><td colSpan={6} className="text-center text-slate-600 py-10"><Package size={30} className="mx-auto mb-2 opacity-40" />لا توجد مرتجعات في هذه الفترة.</td></tr>
              )}
              {list.map((r) => (
                <tr key={r.id} className="border-b border-slate-800/60 hover:bg-slate-800/30">
                  <td className="px-3 py-2.5 text-slate-300 font-mono">PR-{r.return_year}-{String(r.return_no).padStart(4, "0")}</td>
                  <td className="px-3 py-2.5 text-slate-400">{r.date}</td>
                  <td className="px-3 py-2.5 text-white">{r.supplier_name || "—"}</td>
                  <td className="px-3 py-2.5 text-slate-400 font-mono text-xs">#{r.original_invoice_no}/{r.original_invoice_year}</td>
                  <td className="px-3 py-2.5 text-center"><span className={`inline-block px-2 py-0.5 rounded-lg text-xs font-bold ${r.refund_mode === "cash" ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"}`}>{r.refund_mode === "cash" ? "نقدي" : "خصم مورد"}</span></td>
                  <td className="px-3 py-2.5 text-left text-white font-semibold">{fmt(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const inp = "w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-orange-500 outline-none";

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3"><h3 className="text-sm font-bold text-slate-200">{title}</h3>{action}</div>
      {children}
    </div>
  );
}

function Row({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-slate-500">{label}</span>
      <span className={`${big ? "text-lg" : "text-sm"} font-black text-white`}>{value}</span>
    </div>
  );
}
