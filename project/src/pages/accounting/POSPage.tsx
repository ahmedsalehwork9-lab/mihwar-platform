import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, Barcode, Trash2, Plus, Minus, ShoppingCart, X, Printer, Wallet, Clock, RotateCcw } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import * as DB from "../lib/accountingDb";
import type { GLAccount, GLParty, GLTreasury, POSProduct, SalesItem, ShopInfo } from "../lib/accountingDb";

const today = () => new Date().toISOString().slice(0, 10);
const fmt = (n: number) => (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type CartLine = { product: POSProduct; qty: number };

export default function POSPage() {
  const { ownedShopId, branches } = (useAuth() as any) ?? {};
  const [org, setOrg] = useState<{ id: number; name: string } | null>(null);
  const [products, setProducts] = useState<POSProduct[]>([]);
  const [accounts, setAccounts] = useState<GLAccount[]>([]);
  const [treasuries, setTreasuries] = useState<GLTreasury[]>([]);
  const [parties, setParties] = useState<GLParty[]>([]);
  const [shop, setShop] = useState<ShopInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [brand, setBrand] = useState<string>("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [discount, setDiscount] = useState("0");
  const [payType, setPayType] = useState<"cash" | "card" | "credit">("cash");
  const [custId, setCustId] = useState<number | "">("");
  const [revAcc, setRevAcc] = useState<number | "">("");
  const [vatAcc, setVatAcc] = useState<number | "">("");
  const [cashTreas, setCashTreas] = useState<number | "">("");  // خزنة النقد
  const [cardTreas, setCardTreas] = useState<number | "">("");  // حساب الشبكة/البنك
  const [saving, setSaving] = useState(false);
  const [showToday, setShowToday] = useState(false);
  const [todayList, setTodayList] = useState<DB.GLSalesInvoice[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);

  const branchName = useMemo(() => (branches || []).find((b: any) => b.id === ownedShopId)?.name || "الفرع", [branches, ownedShopId]);

  // تحميل بيانات الفرع النشط
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const o = await DB.getOrgForBranch(ownedShopId ?? null);
      if (!alive) return;
      setOrg(o);
      if (o && ownedShopId) {
        const [prods, accs, treas, pps, sh] = await Promise.all([
          DB.fetchProducts(Number(ownedShopId)),
          DB.fetchAccounts(o.id),
          DB.fetchTreasuries(o.id),   // كل خزن المؤسسة (الصناديق + البنوك المشتركة)
          DB.fetchParties(o.id, "customer"),
          DB.fetchShopInfo(Number(ownedShopId)),
        ]);
        if (!alive) return;
        setProducts(prods); setAccounts(accs); setTreasuries(treas); setParties(pps); setShop(sh);
        // حسابات افتراضية
        const rev = accs.find((a) => a.type === "revenue" && !a.is_group);
        const vat = accs.find((a) => a.type === "liability" && !a.is_group && /ضريبة|مخرجات|vat|tax/i.test(a.name));
        const withAcc = treas.filter((t) => t.account_id);
        const branchCash = withAcc.filter((t) => t.kind === "cash" && (t.branch_id == null || t.branch_id === Number(ownedShopId)));
        const bankT = withAcc.filter((t) => t.kind === "bank" || /شبكة|مدى|mada|visa|بنك|card/i.test(t.name));
        setRevAcc(rev?.id ?? "");
        setVatAcc(vat?.id ?? "");
        setCashTreas((branchCash[0] ?? withAcc.find((t) => t.kind === "cash"))?.id ?? "");
        setCardTreas(bankT[0]?.id ?? "");
      } else {
        setProducts([]); setAccounts([]); setTreasuries([]); setParties([]);
      }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [ownedShopId]);

  const reloadProducts = useCallback(async () => {
    if (ownedShopId) setProducts(await DB.fetchProducts(Number(ownedShopId)));
  }, [ownedShopId]);

  const loadToday = useCallback(async () => {
    if (!org) return;
    setTodayList(await DB.fetchSalesInvoices(org.id, today(), today(), ownedShopId ? Number(ownedShopId) : null));
  }, [org, ownedShopId]);

  const brandList = useMemo(() => {
    const s = new Set<string>();
    products.forEach((p) => { if (p.brand) s.add(p.brand); });
    return [...s].sort();
  }, [products]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (brand && p.brand !== brand) return false;
      if (!q) return true;
      return (p.product_name || "").toLowerCase().includes(q)
        || (p.product_code || "").toLowerCase().includes(q)
        || (p.barcode || "").toLowerCase().includes(q);
    });
  }, [products, search, brand]);

  const addToCart = (p: POSProduct) => {
    setCart((c) => {
      const i = c.findIndex((l) => l.product.id === p.id);
      if (i >= 0) { const n = [...c]; n[i] = { ...n[i], qty: n[i].qty + 1 }; return n; }
      return [...c, { product: p, qty: 1 }];
    });
  };
  const setQty = (id: number, qty: number) => setCart((c) => c.map((l) => (l.product.id === id ? { ...l, qty: Math.max(1, qty) } : l)));
  const removeLine = (id: number) => setCart((c) => c.filter((l) => l.product.id !== id));
  const clearCart = () => { setCart([]); setDiscount("0"); setCustId(""); setPayType("cash"); };

  // بحث/باركود: Enter يضيف المنتج المطابِق للباركود/الكود مباشرة
  const onSearchEnter = (e: React.KeyboardEvent) => {
    if (e.key !== "Enter") return;
    const q = search.trim().toLowerCase();
    if (!q) return;
    const hit = products.find((p) => (p.barcode || "").toLowerCase() === q || (p.product_code || "").toLowerCase() === q)
      || (filtered.length === 1 ? filtered[0] : null);
    if (hit) { addToCart(hit); setSearch(""); }
  };

  const subtotal = useMemo(() => Math.round(cart.reduce((s, l) => s + DB.posPrice(l.product) * l.qty, 0) * 100) / 100, [cart]);
  const disc = Math.min(Math.max(Number(discount) || 0, 0), subtotal);
  const net = Math.round((subtotal - disc) * 100) / 100;
  const vat = Math.round(net * 0.15 * 100) / 100;
  const total = Math.round((net + vat) * 100) / 100;

  const custAccountOf = (p: GLParty | undefined) => (!p ? null : (p.account_id ?? (p.parent_id ? parties.find((x) => x.id === p.parent_id)?.account_id ?? null : null)));

  const withAccT = useMemo(() => treasuries.filter((t) => t.account_id), [treasuries]);
  // النقدي: صناديق هذا الفرع (أو العامة). الشبكة: حسابات بنك فقط — بلا تراجع للصندوق
  const cashOptions = useMemo(() => {
    const bc = withAccT.filter((t) => t.kind === "cash" && (t.branch_id == null || t.branch_id === Number(ownedShopId)));
    return bc.length ? bc : withAccT.filter((t) => t.kind === "cash");
  }, [withAccT, ownedShopId]);
  const cardOptions = useMemo(() => withAccT.filter((t) => t.kind === "bank" || /شبكة|مدى|mada|visa|بنك|card/i.test(t.name)), [withAccT]);

  const treasAccOf = (id: number | "") => (id === "" ? null : treasuries.find((t) => t.id === Number(id))?.account_id ?? null);

  const checkout = async () => {
    if (!org || !cart.length) return;
    if (revAcc === "") { alert("حساب إيراد المبيعات غير محدد — اضبطه من دليل الحسابات."); return; }
    if (vat > 0 && vatAcc === "") { alert("حساب الضريبة المستحقة (المخرجات) غير محدد."); return; }
    let collectAcc: number | null = null;
    if (payType === "cash") { collectAcc = treasAccOf(cashTreas); if (!collectAcc) { alert("خزنة النقد غير محددة لهذا الفرع."); return; } }
    if (payType === "card") { collectAcc = treasAccOf(cardTreas); if (!collectAcc) { alert("حساب الشبكة/البنك غير محدد — أنشئ خزنة بنك في «الخزن والبنوك»."); return; } }
    let custAcc: number | null = null; let custName: string | null = null;
    if (payType === "credit") {
      const p = custId === "" ? undefined : parties.find((x) => x.id === Number(custId));
      custAcc = custAccountOf(p);
      custName = p?.name ?? null;
      if (!custAcc) { alert("اختر عميلًا مرتبطًا بحساب ذمة للبيع الآجل."); return; }
    }
    const items: SalesItem[] = cart.map((l) => ({
      description: l.product.product_name + (l.product.product_code ? ` (${l.product.product_code})` : ""),
      qty: l.qty, unit_price: DB.posPrice(l.product), line_total: Math.round(DB.posPrice(l.product) * l.qty * 100) / 100,
    }));
    if (disc > 0) items.push({ description: "خصم", qty: 1, unit_price: -disc, line_total: -disc });

    setSaving(true);
    const res = await DB.createSalesInvoice(org.id, {
      branch_id: ownedShopId ? Number(ownedShopId) : null, date: today(),
      party_id: payType === "credit" ? Number(custId) : null, customer_name: custName,
      payment_type: payType, treasury_account_id: collectAcc,
      customer_account_id: custAcc, revenue_account_id: Number(revAcc), tax_account_id: vatAcc === "" ? null : Number(vatAcc),
      tax_rate: 15, tax_inclusive: false, items, paid_amount: payType === "credit" ? 0 : total, notes: null,
    });
    if (!res.ok) { setSaving(false); alert("تعذّر إصدار الفاتورة: " + (res.error || "")); return; }
    // خصم المخزون
    for (const l of cart) await DB.adjustProductStock(l.product.id, -l.qty);
    setSaving(false);
    printReceipt(res.invoiceNo || 0, items);
    clearCart();
    await reloadProducts();
    if (showToday) await loadToday();
  };

  // فاتورة ضريبية مبسّطة (إيصال حراري ~ 280px)
  const receiptHTML = (no: number, when: string, items: SalesItem[], sub: number, tax: number, tot: number, method: string) => {
    const rows = items.map((it) => `<tr><td style="text-align:right;padding:2px 4px">${it.description}</td><td style="text-align:center;padding:2px 4px;direction:ltr">${it.qty}</td><td style="text-align:left;padding:2px 4px;direction:ltr">${fmt(it.line_total)}</td></tr>`).join("");
    const when2 = (() => { try { return new Date(when.length <= 10 ? when + "T00:00:00" : when).toLocaleString("ar-SA"); } catch { return when; } })();
    const logo = shop?.logo_url ? `<div style="text-align:center"><img src="${shop.logo_url}" style="max-height:46px;object-fit:contain"/></div>` : "";
    const vatNo = shop?.tax_number ? `<div style="text-align:center;font-size:11px">الرقم الضريبي: ${shop.tax_number}</div>` : "";
    const cr = shop?.commercial_registration ? `<div style="text-align:center;font-size:10px;color:#555">س.ت: ${shop.commercial_registration}</div>` : "";
    return `<html dir="rtl"><head><meta charset="UTF-8"><title>فاتورة ${no}</title></head>
      <body style="font-family:'Segoe UI',Tahoma,sans-serif;width:280px;margin:0 auto;color:#111">
      ${logo}
      <h3 style="text-align:center;margin:6px 0 2px">${shop?.shop_name || org?.name || ""}</h3>
      ${vatNo}${cr}
      <div style="text-align:center;font-size:12px;font-weight:700;margin-top:4px">فاتورة ضريبية مبسّطة</div>
      <div style="text-align:center;font-size:11px">${branchName} · رقم #${no}</div>
      <div style="text-align:center;font-size:11px;color:#555">${when2}</div>
      <hr/>
      <table style="width:100%;font-size:12px;border-collapse:collapse">
        <tr style="border-bottom:1px solid #ccc"><td style="text-align:right">الصنف</td><td style="text-align:center">كمية</td><td style="text-align:left">إجمالي</td></tr>
        ${rows}
      </table>
      <hr/>
      <table style="width:100%;font-size:12px">
        <tr><td style="text-align:right">الإجمالي قبل الضريبة</td><td style="text-align:left;direction:ltr">${fmt(sub)}</td></tr>
        <tr><td style="text-align:right">ضريبة القيمة المضافة 15%</td><td style="text-align:left;direction:ltr">${fmt(tax)}</td></tr>
        <tr style="font-weight:800;font-size:14px"><td style="text-align:right">الإجمالي شامل الضريبة</td><td style="text-align:left;direction:ltr">${fmt(tot)}</td></tr>
      </table>
      <hr/>
      <div style="text-align:center;font-size:11px">طريقة الدفع: ${method}</div>
      <div style="text-align:center;font-size:11px;margin-top:4px">شكرًا لزيارتكم</div>
      </body></html>`;
  };
  const printHTML = (html: string) => { const w = window.open("", "_blank", "width=320,height=640"); if (!w) { alert("فعّل النوافذ المنبثقة للطباعة."); return; } w.document.write(html); w.document.close(); w.focus(); setTimeout(() => w.print(), 250); };
  const printReceipt = (no: number, items: SalesItem[]) => printHTML(receiptHTML(no, new Date().toISOString(), items, net, vat, total, DB.PAYTYPE_LABEL[payType]));
  const reprint = (inv: DB.GLSalesInvoice) => printHTML(receiptHTML(inv.invoice_no, inv.date, inv.items || [], inv.subtotal, inv.tax_amount, inv.total, DB.PAYTYPE_LABEL[inv.payment_type]));

  // اختصارات: F9 تحصيل · F2 بحث
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "F9") { e.preventDefault(); if (cart.length && !saving) checkout(); }
      else if (e.key === "F2") { e.preventDefault(); searchRef.current?.focus(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }); // eslint-disable-line

  if (!ownedShopId) return <div className="p-10 text-center text-slate-400" dir="rtl">اختر فرعًا من الأعلى لبدء البيع.</div>;

  return (
    <div dir="rtl" className="flex flex-col lg:flex-row gap-4 p-4 min-h-screen">
      {/* السلة */}
      <div className="lg:w-[360px] shrink-0 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col max-h-[calc(100vh-2rem)]">
        <div className="p-3 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2"><span className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center"><ShoppingCart size={18} /></span>
            <div><div className="text-sm font-bold text-white">نقطة بيع — {branchName}</div><div className="text-[10px] text-slate-500">{cart.length} صنف في السلة</div></div>
          </div>
          <div className="flex gap-1">
            <button onClick={() => { setShowToday((v) => !v); if (!showToday) loadToday(); }} title="فواتير اليوم" className="w-8 h-8 rounded-lg bg-slate-800 text-slate-300 flex items-center justify-center hover:bg-slate-700"><Clock size={15} /></button>
            <button onClick={clearCart} title="إفراغ" disabled={!cart.length} className="w-8 h-8 rounded-lg bg-red-500/10 text-red-400 flex items-center justify-center hover:bg-red-500/20 disabled:opacity-40"><RotateCcw size={15} /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {cart.length === 0 ? (
            <div className="p-8 text-center text-slate-600 text-sm">السلة فارغة — اضغط منتجًا لإضافته.</div>
          ) : cart.map((l) => (
            <div key={l.product.id} className="flex items-center gap-2 px-3 py-2 border-b border-slate-800/60">
              <button onClick={() => removeLine(l.product.id)} className="w-6 h-6 rounded-md bg-red-500/10 text-red-400 flex items-center justify-center shrink-0"><Trash2 size={12} /></button>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-slate-200 truncate">{l.product.product_name}</div>
                <div className="text-[10px] text-slate-500 [direction:ltr] text-right">{fmt(DB.posPrice(l.product))} × {l.qty}</div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => setQty(l.product.id, l.qty - 1)} className="w-6 h-6 rounded-md bg-slate-800 text-slate-300 flex items-center justify-center"><Minus size={12} /></button>
                <span className="w-7 text-center text-xs font-bold text-white">{l.qty}</span>
                <button onClick={() => setQty(l.product.id, l.qty + 1)} className="w-6 h-6 rounded-md bg-slate-800 text-slate-300 flex items-center justify-center"><Plus size={12} /></button>
              </div>
              <div className="w-16 text-left text-xs font-mono text-emerald-300 [direction:ltr] shrink-0">{fmt(DB.posPrice(l.product) * l.qty)}</div>
            </div>
          ))}
        </div>

        {/* الملخّص */}
        <div className="p-3 border-t border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400"><span>الإجمالي الفرعي</span><span className="font-mono text-slate-200 [direction:ltr]">{fmt(subtotal)}</span></div>
          <div className="flex items-center justify-between text-xs text-slate-400"><span>الخصم</span>
            <input type="number" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} className="w-24 bg-slate-950 border border-slate-700 rounded-lg text-white px-2 py-1 text-xs text-left [direction:ltr] outline-none focus:border-blue-500" />
          </div>
          <div className="flex items-center justify-between text-xs text-slate-400"><span>ضريبة 15%</span><span className="font-mono text-amber-300 [direction:ltr]">{fmt(vat)}</span></div>
          <div className="flex items-center justify-between text-base font-black text-white border-t border-slate-800 pt-2"><span>الإجمالي</span><span className="font-mono text-emerald-400 [direction:ltr]">{fmt(total)}</span></div>

          <div className="inline-flex gap-1 bg-slate-950 border border-slate-800 rounded-xl p-1 w-full">
            {([["cash", "نقدي"], ["card", "شبكة"], ["credit", "آجل"]] as const).map(([pt, label]) => (
              <button key={pt} onClick={() => setPayType(pt)} className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-bold ${payType === pt ? "bg-blue-600 text-[#fff]" : "text-slate-400"}`}>{label}</button>
            ))}
          </div>
          {payType === "cash" && (cashOptions.length > 1 ? (
            <div><div className="text-[10px] text-slate-500 mb-1">الخزنة النقدية (الصندوق)</div>
              <select value={cashTreas} onChange={(e) => setCashTreas(e.target.value ? Number(e.target.value) : "")} className="w-full bg-slate-950 border border-slate-700 rounded-lg text-white px-2 py-2 text-xs outline-none focus:border-blue-500">
                {cashOptions.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          ) : cashOptions.length === 0 ? (
            <div className="text-[11px] text-amber-400 text-center">لا يوجد صندوق نقدي لهذا الفرع — أنشئ خزنة نوعها «نقدي».</div>
          ) : null)}
          {payType === "card" && (
            cardOptions.length ? (
              <div><div className="text-[10px] text-slate-500 mb-1">حساب الشبكة / البنك (مدى، بطاقة…)</div>
                <select value={cardTreas} onChange={(e) => setCardTreas(e.target.value ? Number(e.target.value) : "")} className="w-full bg-slate-950 border border-slate-700 rounded-lg text-white px-2 py-2 text-xs outline-none focus:border-blue-500">
                  {cardOptions.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            ) : <div className="text-[11px] text-amber-400 text-center leading-5">لا يوجد حساب بنك/شبكة.<br/>أنشئ خزنة نوعها «بنك» (مثل «مدى دلة») في «الخزن والبنوك».</div>
          )}
          {payType === "credit" && (
            <select value={custId} onChange={(e) => setCustId(e.target.value ? Number(e.target.value) : "")} className="w-full bg-slate-950 border border-slate-700 rounded-lg text-white px-2 py-2 text-xs outline-none focus:border-blue-500">
              <option value="">— اختر العميل الآجل</option>
              {parties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          <button onClick={checkout} disabled={saving || !cart.length} className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-[#fff] font-black text-sm flex items-center justify-center gap-2 disabled:opacity-40">
            <Wallet size={16} /> {saving ? "جارٍ…" : `تحصيل وإصدار فاتورة (F9) · ${fmt(total)}`}
          </button>
        </div>
      </div>

      {/* المنتجات */}
      <div className="flex-1 min-w-0">
        <div className="relative mb-3">
          <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input ref={searchRef} value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={onSearchEnter} placeholder="ابحث بالاسم أو الكود أو امسح الباركود… (F2)" className="w-full bg-slate-900 border border-slate-700 rounded-xl text-white pr-10 pl-3 py-2.5 text-sm outline-none focus:border-blue-500" />
          <Barcode size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
        </div>
        {brandList.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-2 mb-3">
            <button onClick={() => setBrand("")} className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap ${brand === "" ? "bg-blue-600 text-[#fff]" : "bg-slate-800 text-slate-300"}`}>الكل</button>
            {brandList.map((b) => <button key={b} onClick={() => setBrand(b)} className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap ${brand === b ? "bg-blue-600 text-[#fff]" : "bg-slate-800 text-slate-300"}`}>{b}</button>)}
          </div>
        )}

        {loading ? (
          <div className="p-10 text-center text-slate-500">جارٍ تحميل المنتجات…</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-slate-500">{products.length === 0 ? "لا منتجات لهذا الفرع في المخزون." : "لا نتائج مطابِقة."}</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {filtered.map((p) => {
              const out = p.quantity <= 0;
              return (
                <button key={p.id} onClick={() => !out && addToCart(p)} disabled={out} className={`text-right bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden hover:border-blue-500/60 transition-colors ${out ? "opacity-50 cursor-not-allowed" : ""}`}>
                  <div className="h-24 bg-slate-950 flex items-center justify-center overflow-hidden">
                    {p.product_image_url ? <img src={p.product_image_url} alt="" className="w-full h-full object-cover" /> : <ShoppingCart size={26} className="text-slate-700" />}
                  </div>
                  <div className="p-2.5">
                    <div className="text-xs font-bold text-slate-100 line-clamp-2 min-h-[2rem]">{p.product_name}</div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-sm font-black text-blue-400 font-mono [direction:ltr]">{fmt(DB.posPrice(p))}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${out ? "bg-red-500/15 text-red-300" : "bg-emerald-500/15 text-emerald-300"}`}>{out ? "نفد" : `متاح ${p.quantity}`}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* فواتير اليوم */}
      {showToday && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" dir="rtl" onClick={() => setShowToday(false)}>
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-3 border-b border-slate-800 flex items-center justify-between">
              <span className="text-sm font-bold text-white">فواتير اليوم — {branchName}</span>
              <button onClick={() => setShowToday(false)} className="w-7 h-7 rounded-lg bg-slate-800 text-slate-300 flex items-center justify-center"><X size={14} /></button>
            </div>
            <div className="overflow-y-auto">
              {todayList.length === 0 ? <div className="p-6 text-center text-slate-500 text-sm">لا فواتير اليوم.</div> : todayList.map((inv) => (
                <div key={inv.id} className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-800/60 text-xs">
                  <span className="font-mono text-slate-300 [direction:ltr] w-10">#{inv.invoice_no}</span>
                  <span className="text-slate-400 flex-1 truncate">{inv.customer_name || "نقدي"}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] ${inv.payment_type === "cash" ? "bg-emerald-500/15 text-emerald-300" : inv.payment_type === "card" ? "bg-sky-500/15 text-sky-300" : "bg-amber-500/15 text-amber-300"}`}>{DB.PAYTYPE_LABEL[inv.payment_type]}</span>
                  <span className="font-mono text-emerald-300 font-bold [direction:ltr] w-16 text-left">{fmt(inv.total)}</span>
                  <button onClick={() => reprint(inv)} title="إعادة طباعة" className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-300 flex items-center justify-center hover:bg-blue-500/20 shrink-0"><Printer size={13} /></button>
                </div>
              ))}
            </div>
            {todayList.length > 0 && (
              <div className="p-3 border-t border-slate-800 flex items-center justify-between text-sm font-bold">
                <span className="text-slate-300">إجمالي اليوم</span>
                <span className="font-mono text-emerald-400 [direction:ltr]">{fmt(todayList.reduce((s, i) => s + (Number(i.total) || 0), 0))}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
