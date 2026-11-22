import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, Barcode, Trash2, Plus, Minus, ShoppingCart, X, Printer, Wallet, Clock, RotateCcw, LayoutGrid, List, PauseCircle, User, Store, Tag, Percent, PlayCircle, Power, Banknote } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import * as DB from "../lib/accountingDb";
import type { GLAccount, GLParty, GLTreasury, POSProduct, SalesItem, ShopInfo } from "../lib/accountingDb";

const today = () => new Date().toISOString().slice(0, 10);
const fmt = (n: number) => (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

type CartLine = { product: POSProduct; qty: number; disc: number };
const PAGE = 60;

export default function POSPage() {
  const { ownedShopId, branches, user } = (useAuth() as any) ?? {};
  const [org, setOrg] = useState<{ id: number; name: string } | null>(null);
  const [products, setProducts] = useState<POSProduct[]>([]);
  const [accounts, setAccounts] = useState<GLAccount[]>([]);
  const [treasuries, setTreasuries] = useState<GLTreasury[]>([]);
  const [parties, setParties] = useState<GLParty[]>([]);
  const [shop, setShop] = useState<ShopInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const [rawSearch, setRawSearch] = useState("");
  const [search, setSearch] = useState("");
  const [brand, setBrand] = useState<string>("");
  const [view, setView] = useState<"grid" | "table">("grid");
  const [visible, setVisible] = useState(PAGE);

  const [cart, setCart] = useState<CartLine[]>([]);
  const [discount, setDiscount] = useState("0");
  const [payType, setPayType] = useState<"cash" | "card" | "credit" | "split">("cash");
  const [splCash, setSplCash] = useState("");
  const [splCard, setSplCard] = useState("");
  const [splCredit, setSplCredit] = useState("");
  const [custId, setCustId] = useState<number | "">("");
  const [revAcc, setRevAcc] = useState<number | "">("");
  const [vatAcc, setVatAcc] = useState<number | "">("");
  const [cashTreas, setCashTreas] = useState<number | "">("");
  const [cardTreas, setCardTreas] = useState<number | "">("");
  const [saving, setSaving] = useState(false);
  const [showToday, setShowToday] = useState(false);
  const [todayList, setTodayList] = useState<DB.GLSalesInvoice[]>([]);
  const [held, setHeld] = useState<DB.GLParked[]>([]);
  const [showHeld, setShowHeld] = useState(false);

  // الورديات
  const [shift, setShift] = useState<DB.GLShift | null>(null);
  const [shiftModal, setShiftModal] = useState<null | "open" | "expense" | "close">(null);
  const [openCash, setOpenCash] = useState("");
  const [expAmount, setExpAmount] = useState("");
  const [expReason, setExpReason] = useState("");
  const [expAcc, setExpAcc] = useState<number | "">("");
  const [closeCash, setCloseCash] = useState("");
  const [summary, setSummary] = useState<DB.ShiftSummary | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);
  const custRef = useRef<HTMLSelectElement>(null);
  const discRef = useRef<HTMLInputElement>(null);

  const branchName = useMemo(() => (branches || []).find((b: any) => b.id === ownedShopId)?.name || "الفرع", [branches, ownedShopId]);

  // debounce للبحث (الباركود يعمل فورًا عبر Enter بلا انتظار)
  useEffect(() => { const t = setTimeout(() => setSearch(rawSearch), 140); return () => clearTimeout(t); }, [rawSearch]);
  useEffect(() => { setVisible(PAGE); }, [search, brand]);

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
          DB.fetchTreasuries(o.id),
          DB.fetchParties(o.id, "customer"),
          DB.fetchShopInfo(Number(ownedShopId)),
        ]);
        if (!alive) return;
        setProducts(prods); setAccounts(accs); setTreasuries(treas); setParties(pps); setShop(sh);
        const rev = accs.find((a) => a.type === "revenue" && !a.is_group);
        const vat = accs.find((a) => a.type === "liability" && !a.is_group && /ضريبة|مخرجات|vat|tax/i.test(a.name));
        const withAcc = treas.filter((t) => t.account_id);
        const branchCash = withAcc.filter((t) => t.kind === "cash" && (t.branch_id == null || t.branch_id === Number(ownedShopId)));
        const bankT = withAcc.filter((t) => t.kind === "bank" || /شبكة|مدى|mada|visa|بنك|card/i.test(t.name));
        setRevAcc(rev?.id ?? "");
        setVatAcc(vat?.id ?? "");
        setCashTreas((branchCash[0] ?? withAcc.find((t) => t.kind === "cash"))?.id ?? "");
        setCardTreas(bankT[0]?.id ?? "");
      } else { setProducts([]); setAccounts([]); setTreasuries([]); setParties([]); }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [ownedShopId]);

  useEffect(() => { if (org && ownedShopId) DB.fetchOpenShift(org.id, Number(ownedShopId)).then(setShift); else setShift(null); }, [org, ownedShopId]);

  const expenseAccounts = useMemo(() => accounts.filter((a) => a.type === "expense" && !a.is_group), [accounts]);

  const reloadProducts = useCallback(async () => { if (ownedShopId) setProducts(await DB.fetchProducts(Number(ownedShopId))); }, [ownedShopId]);
  const loadToday = useCallback(async () => { if (org) setTodayList(await DB.fetchSalesInvoices(org.id, today(), today(), ownedShopId ? Number(ownedShopId) : null)); }, [org, ownedShopId]);

  const brandList = useMemo(() => { const s = new Set<string>(); products.forEach((p) => { if (p.brand) s.add(p.brand); }); return [...s].sort(); }, [products]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (brand && p.brand !== brand) return false;
      if (!q) return true;
      return (p.product_name || "").toLowerCase().includes(q)
        || (p.product_code || "").toLowerCase().includes(q)
        || (p.barcode || "").toLowerCase().includes(q)
        || (p.brand || "").toLowerCase().includes(q);
    });
  }, [products, search, brand]);
  const shown = useMemo(() => filtered.slice(0, visible), [filtered, visible]);

  const stockInCart = (id: number) => cart.find((l) => l.product.id === id)?.qty ?? 0;
  const addToCart = (p: POSProduct) => {
    setCart((c) => {
      const i = c.findIndex((l) => l.product.id === p.id);
      if (i >= 0) {
        if (c[i].qty >= p.quantity) return c;               // لا تتجاوز المتاح
        const n = [...c]; n[i] = { ...n[i], qty: n[i].qty + 1 }; return n;
      }
      if (p.quantity <= 0) return c;
      return [...c, { product: p, qty: 1, disc: 0 }];
    });
  };
  const setQty = (id: number, qty: number) => setCart((c) => c.map((l) => (l.product.id === id ? { ...l, qty: Math.min(Math.max(1, qty), l.product.quantity || 1) } : l)));
  const setLineDisc = (id: number, d: number) => setCart((c) => c.map((l) => (l.product.id === id ? { ...l, disc: Math.max(0, d) } : l)));
  const removeLine = (id: number) => setCart((c) => c.filter((l) => l.product.id !== id));
  const clearCart = () => { setCart([]); setDiscount("0"); setCustId(""); setPayType("cash"); setSplCash(""); setSplCard(""); setSplCredit(""); };

  // تعليق الفاتورة (محفوظ في قاعدة البيانات — يبقى بعد إغلاق المتصفّح)
  const loadParked = useCallback(async () => { if (org) setHeld(await DB.fetchParked(org.id, ownedShopId ? Number(ownedShopId) : null)); }, [org, ownedShopId]);
  useEffect(() => { loadParked(); }, [loadParked]);
  const holdCart = async () => {
    if (!org || !cart.length) return;
    const custName = custId === "" ? "" : parties.find((p) => p.id === Number(custId))?.name || "";
    const data: DB.ParkedData = { items: cart.map((l) => ({ productId: l.product.id, qty: l.qty, disc: l.disc })), discount, custId, payType: payType === "split" ? "cash" : payType };
    const res = await DB.parkInvoice(org.id, { branch_id: ownedShopId ? Number(ownedShopId) : null, cashier: user?.email ?? null, label: custName || `${cart.length} صنف`, data });
    if (!res.ok) { alert("تعذّر التعليق: " + (res.error || "")); return; }
    clearCart(); await loadParked();
  };
  const restoreHeld = async (h: DB.GLParked) => {
    const d = h.data || ({} as DB.ParkedData);
    const lines: CartLine[] = (d.items || []).map((it) => { const p = products.find((x) => x.id === it.productId); return p ? { product: p, qty: Math.max(1, Math.min(it.qty, p.quantity || it.qty)), disc: it.disc || 0 } : null; }).filter(Boolean) as CartLine[];
    setCart(lines); setDiscount(d.discount || "0"); setCustId(d.custId ?? ""); setPayType((d.payType as any) || "cash");
    await DB.deleteParked(h.id); setShowHeld(false); await loadParked();
  };

  const onSearchEnter = (e: React.KeyboardEvent) => {
    if (e.key !== "Enter") return;
    const q = rawSearch.trim().toLowerCase();
    if (!q) return;
    const hit = products.find((p) => (p.barcode || "").toLowerCase() === q || (p.product_code || "").toLowerCase() === q)
      || (filtered.length === 1 ? filtered[0] : null);
    if (hit) { addToCart(hit); setRawSearch(""); }
  };

  // الإجماليات (مع خصم الصنف وخصم الفاتورة)
  const t = useMemo(() => {
    const gross = cart.reduce((s, l) => s + DB.posPrice(l.product) * l.qty, 0);
    const lineDisc = cart.reduce((s, l) => s + Math.min(Math.max(l.disc, 0), DB.posPrice(l.product) * l.qty), 0);
    const invDisc = Math.min(Math.max(Number(discount) || 0, 0), Math.max(0, gross - lineDisc));
    const net = r2(gross - lineDisc - invDisc);
    const vat = r2(net * 0.15);
    return { gross: r2(gross), lineDisc: r2(lineDisc), invDisc: r2(invDisc), net, vat, total: r2(net + vat) };
  }, [cart, discount]);

  const custAccountOf = (p: GLParty | undefined) => (!p ? null : (p.account_id ?? (p.parent_id ? parties.find((x) => x.id === p.parent_id)?.account_id ?? null : null)));
  const withAccT = useMemo(() => treasuries.filter((x) => x.account_id), [treasuries]);
  const cashOptions = useMemo(() => { const bc = withAccT.filter((x) => x.kind === "cash" && (x.branch_id == null || x.branch_id === Number(ownedShopId))); return bc.length ? bc : withAccT.filter((x) => x.kind === "cash"); }, [withAccT, ownedShopId]);
  const cardOptions = useMemo(() => withAccT.filter((x) => x.kind === "bank" || /شبكة|مدى|mada|visa|بنك|card/i.test(x.name)), [withAccT]);
  const treasAccOf = (id: number | "") => (id === "" ? null : treasuries.find((x) => x.id === Number(id))?.account_id ?? null);

  const checkout = async () => {
    if (!org || !cart.length || saving) return;
    if (revAcc === "") { alert("حساب إيراد المبيعات غير محدد — اضبطه من دليل الحسابات."); return; }
    if (t.vat > 0 && vatAcc === "") { alert("حساب الضريبة المستحقة (المخرجات) غير محدد."); return; }
    // تحقّق المخزون قبل البيع
    for (const l of cart) { const live = products.find((p) => p.id === l.product.id); if (live && l.qty > live.quantity) { alert(`الكمية المطلوبة من «${l.product.product_name}» تتجاوز المتاح (${live.quantity}).`); return; } }
    const custParty = custId === "" ? undefined : parties.find((x) => x.id === Number(custId));
    const custAccResolved = custAccountOf(custParty);

    const items: SalesItem[] = cart.map((l) => {
      const gross = DB.posPrice(l.product) * l.qty;
      const d = Math.min(Math.max(l.disc, 0), gross);
      const netLine = r2(gross - d);
      return { description: l.product.product_name + (l.product.product_code ? ` (${l.product.product_code})` : ""), qty: l.qty, unit_price: l.qty ? r2(netLine / l.qty) : 0, line_total: netLine };
    });
    if (t.invDisc > 0) items.push({ description: "خصم على الفاتورة", qty: 1, unit_price: -t.invDisc, line_total: -t.invDisc });

    const finish = async (res: { ok: boolean; error?: string; invoiceNo?: number }) => {
      if (!res.ok) { setSaving(false); alert("تعذّر إصدار الفاتورة: " + (res.error || "")); return; }
      for (const l of cart) await DB.adjustProductStock(l.product.id, -l.qty);
      setSaving(false);
      printReceipt(res.invoiceNo || 0, items);
      clearCart(); await reloadProducts(); if (showToday) await loadToday();
    };

    // ── تقسيم الدفع ──
    if (payType === "split") {
      const cashAcc = treasAccOf(cashTreas), cardAcc = treasAccOf(cardTreas);
      const nC = Number(splCash) || 0, nK = Number(splCard) || 0, nR = Number(splCredit) || 0;
      if (nC > 0 && !cashAcc) { alert("خزنة النقد غير محددة لهذا الفرع."); return; }
      if (nK > 0 && !cardAcc) { alert("حساب الشبكة/البنك غير محدد."); return; }
      if (nR > 0 && !custAccResolved) { alert("اختر عميلًا بحساب ذمة للجزء الآجل (F3)."); return; }
      if (Math.abs(r2(nC + nK + nR) - t.total) > 0.05) { alert(`مجموع المدفوعات ${fmt(r2(nC + nK + nR))} لا يساوي الإجمالي ${fmt(t.total)}.`); return; }
      const tenders: DB.SalesTender[] = [];
      if (nC > 0) tenders.push({ method: "cash", account_id: cashAcc as number, amount: nC });
      if (nK > 0) tenders.push({ method: "card", account_id: cardAcc as number, amount: nK });
      if (nR > 0) tenders.push({ method: "credit", account_id: custAccResolved as number, party_id: custId === "" ? null : Number(custId), amount: nR });
      setSaving(true);
      await finish(await DB.createSalesInvoiceMulti(org.id, {
        branch_id: ownedShopId ? Number(ownedShopId) : null, date: today(),
        party_id: custId === "" ? null : Number(custId), customer_name: custParty?.name ?? null,
        revenue_account_id: Number(revAcc), tax_account_id: vatAcc === "" ? null : Number(vatAcc),
        tax_rate: 15, tax_inclusive: false, items, notes: null, shift_id: shift?.id ?? null, source: "pos",
      }, tenders));
      return;
    }

    // ── دفع مفرد ──
    let collectAcc: number | null = null; let custAcc: number | null = null;
    if (payType === "cash") { collectAcc = treasAccOf(cashTreas); if (!collectAcc) { alert("خزنة النقد غير محددة لهذا الفرع."); return; } }
    if (payType === "card") { collectAcc = treasAccOf(cardTreas); if (!collectAcc) { alert("حساب الشبكة/البنك غير محدد — أنشئ خزنة بنك في «الخزن والبنوك»."); return; } }
    if (payType === "credit") { custAcc = custAccResolved; if (!custAcc) { alert("اختر عميلًا مرتبطًا بحساب ذمة للبيع الآجل."); return; } }
    setSaving(true);
    await finish(await DB.createSalesInvoice(org.id, {
      branch_id: ownedShopId ? Number(ownedShopId) : null, date: today(),
      party_id: custId === "" ? null : Number(custId), customer_name: custParty?.name ?? null,
      payment_type: payType, treasury_account_id: collectAcc,
      customer_account_id: custAcc, revenue_account_id: Number(revAcc), tax_account_id: vatAcc === "" ? null : Number(vatAcc),
      tax_rate: 15, tax_inclusive: false, items, paid_amount: payType === "credit" ? 0 : t.total, notes: null, shift_id: shift?.id ?? null, source: "pos",
    }));
  };

  // ── إجراءات الوردية ──
  const doOpenShift = async () => {
    if (!org) return;
    const res = await DB.openShift(org.id, { branch_id: ownedShopId ? Number(ownedShopId) : null, cashier: user?.email ?? null, opening_cash: Number(openCash) || 0 });
    if (!res.ok) { alert(res.error || ""); return; }
    setShift(res.shift ?? null); setShiftModal(null); setOpenCash("");
  };
  const doExpense = async () => {
    if (!org || !shift) return;
    const cashAcc = treasAccOf(cashTreas);
    if (!cashAcc) { alert("حساب الصندوق غير محدد لهذا الفرع."); return; }
    if (expAcc === "") { alert("اختر حساب المصروف."); return; }
    const res = await DB.addShiftExpense(org.id, { shift_id: shift.id, branch_id: ownedShopId ? Number(ownedShopId) : null, date: today(), amount: Number(expAmount) || 0, reason: expReason || null, expense_account_id: Number(expAcc), cash_account_id: cashAcc });
    if (!res.ok) { alert(res.error || ""); return; }
    alert("تم تسجيل المصروف وخصمه من الصندوق."); setShiftModal(null); setExpAmount(""); setExpReason("");
  };
  const openClose = async () => { if (!org || !shift) return; setSummary(await DB.shiftSummary(org.id, shift)); setCloseCash(""); setShiftModal("close"); };
  const doClose = async () => {
    if (!org || !shift || !summary) return;
    const actual = Number(closeCash) || 0;
    const res = await DB.closeShift(org.id, shift.id, actual, summary.expected);
    if (!res.ok) { alert(res.error || ""); return; }
    printZ(shift, summary, actual);
    setShift(null); setShiftModal(null); setSummary(null);
  };
  const printZ = (sh: DB.GLShift, sm: DB.ShiftSummary, actual: number) => {
    const diff = r2(actual - sm.expected);
    const line = (k: string, v: string, b = false) => `<tr><td style="text-align:right;padding:3px 6px;${b ? "font-weight:800" : ""}">${k}</td><td style="text-align:left;padding:3px 6px;direction:ltr;${b ? "font-weight:800" : ""}">${v}</td></tr>`;
    const html = `<html dir="rtl"><head><meta charset="UTF-8"><title>تقرير وردية</title></head><body style="font-family:'Segoe UI',Tahoma,sans-serif;width:300px;margin:0 auto;color:#111">
      <h3 style="text-align:center;margin:6px 0 2px">${shop?.shop_name || org?.name || ""}</h3>
      <div style="text-align:center;font-size:12px;font-weight:700">تقرير إغلاق وردية (Z)</div>
      <div style="text-align:center;font-size:11px">${branchName} · الكاشير: ${sh.cashier || "—"}</div>
      <div style="text-align:center;font-size:11px;color:#555">فتح: ${new Date(sh.opened_at).toLocaleString("ar-SA")}<br/>إغلاق: ${new Date().toLocaleString("ar-SA")}</div>
      <hr/><table style="width:100%;font-size:12px">
        ${line("عدد الفواتير", String(sm.count))}
        ${line("إجمالي المبيعات", fmt(sm.salesTotal))}
        ${line("نقدي", fmt(sm.cashCollected))}
        ${line("شبكة", fmt(sm.cardCollected))}
        ${line("آجل", fmt(sm.creditTotal))}
      </table><hr/><table style="width:100%;font-size:12px">
        ${line("رصيد افتتاحي", fmt(sh.opening_cash))}
        ${line("+ مبيعات نقدية", fmt(sm.cashCollected))}
        ${line("− مصروفات نقدية", fmt(sm.expenses))}
        ${line("النقد المتوقّع", fmt(sm.expected), true)}
        ${line("النقد الفعلي (الجرد)", fmt(actual), true)}
        ${line(diff === 0 ? "مطابق" : diff > 0 ? "زيادة" : "عجز", fmt(Math.abs(diff)), true)}
      </table><hr/>
      <div style="text-align:center;font-size:11px">إعداد: المحاسب أحمد صالح</div>
      </body></html>`;
    printHTML(html);
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
  // الطباعة عبر iframe مخفي — لا تعتمد على نوافذ منبثقة (تعمل بعد الحفظ غير المتزامن)
  const printHTML = (html: string) => {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("style", "position:fixed;right:0;bottom:0;width:0;height:0;border:0;");
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow?.document;
    if (!doc) { try { document.body.removeChild(iframe); } catch {} return; }
    doc.open(); doc.write(html); doc.close();
    setTimeout(() => {
      try { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); } catch {}
      setTimeout(() => { try { document.body.removeChild(iframe); } catch {} }, 1500);
    }, 350);
  };
  const printReceipt = (no: number, items: SalesItem[]) => printHTML(receiptHTML(no, new Date().toISOString(), items, t.net, t.vat, t.total, DB.PAYTYPE_LABEL[payType]));
  const reprint = (inv: DB.GLSalesInvoice) => printHTML(receiptHTML(inv.invoice_no, inv.date, inv.items || [], inv.subtotal, inv.tax_amount, inv.total, DB.PAYTYPE_LABEL[inv.payment_type]));

  // اختصارات لوحة المفاتيح
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "F9") { e.preventDefault(); checkout(); }
      else if (e.key === "F2") { e.preventDefault(); searchRef.current?.focus(); }
      else if (e.key === "F3") { e.preventDefault(); custRef.current?.focus(); }
      else if (e.key === "F6") { e.preventDefault(); discRef.current?.focus(); discRef.current?.select(); }
      else if (e.key === "F8") { e.preventDefault(); holdCart(); }
      else if (e.key === "Escape") { if (showToday) setShowToday(false); else if (showHeld) setShowHeld(false); else if (rawSearch) setRawSearch(""); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }); // eslint-disable-line

  if (!ownedShopId) return <div className="p-10 text-center text-slate-400" dir="rtl">اختر فرعًا من الأعلى لبدء البيع.</div>;

  const PayPanel = (
    <>
      <div className="inline-flex gap-1 bg-slate-950 border border-slate-800 rounded-xl p-1 w-full">
        {([["cash", "نقدي"], ["card", "شبكة"], ["credit", "آجل"], ["split", "تقسيم"]] as const).map(([pt, label]) => (
          <button key={pt} onClick={() => setPayType(pt)} className={`flex-1 px-2 py-1.5 rounded-lg text-[11px] font-bold ${payType === pt ? "bg-blue-600 text-[#fff]" : "text-slate-400"}`}>{label}</button>
        ))}
      </div>
      {payType === "split" && (() => {
        const nC = Number(splCash) || 0, nK = Number(splCard) || 0, nR = Number(splCredit) || 0;
        const paid = r2(nC + nK + nR); const remain = r2(t.total - paid);
        const row = (label: string, val: string, set: (v: string) => void, hint?: string) => (
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400 w-10">{label}</span>
            <input type="number" step="0.01" value={val} onChange={(e) => set(e.target.value)} placeholder="0.00" className="flex-1 bg-slate-950 border border-slate-700 rounded-lg text-white px-2 py-1.5 text-xs text-center [direction:ltr] outline-none focus:border-blue-500" />
            {hint && <span className="text-[9px] text-amber-400 w-16 truncate">{hint}</span>}
          </div>
        );
        return (
          <div className="space-y-1.5 bg-slate-950 border border-slate-800 rounded-xl p-2">
            {row("نقدي", splCash, setSplCash)}
            {row("شبكة", splCard, setSplCard, cardOptions.length ? "" : "لا حساب بنك")}
            {row("آجل", splCredit, setSplCredit, custId === "" ? "اختر عميلًا" : "")}
            <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-800">
              <button onClick={() => { if (remain > 0) setSplCash(String(r2((Number(splCash) || 0) + remain))); }} className="text-blue-300 font-bold">الباقي نقدي</button>
              <span className={remain === 0 ? "text-emerald-400 font-bold" : "text-amber-400"}>{remain === 0 ? "✓ مكتمل" : `متبقٍّ: ${fmt(remain)}`}</span>
            </div>
          </div>
        );
      })()}
      {payType === "cash" && (cashOptions.length > 1 ? (
        <select value={cashTreas} onChange={(e) => setCashTreas(e.target.value ? Number(e.target.value) : "")} className="w-full bg-slate-950 border border-slate-700 rounded-lg text-white px-2 py-2 text-xs outline-none focus:border-blue-500">
          {cashOptions.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      ) : cashOptions.length === 0 ? <div className="text-[11px] text-amber-400 text-center">لا يوجد صندوق نقدي لهذا الفرع.</div> : null)}
      {payType === "card" && (cardOptions.length ? (
        <select value={cardTreas} onChange={(e) => setCardTreas(e.target.value ? Number(e.target.value) : "")} className="w-full bg-slate-950 border border-slate-700 rounded-lg text-white px-2 py-2 text-xs outline-none focus:border-blue-500">
          {cardOptions.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      ) : <div className="text-[11px] text-amber-400 text-center leading-5">لا يوجد حساب بنك/شبكة. أنشئ خزنة نوعها «بنك» في «الخزن والبنوك».</div>)}
    </>
  );

  return (
    <div dir="rtl" className="flex flex-col lg:flex-row gap-3 p-3 min-h-screen">
      {/* ملف الكاتالوج 65% */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* رأس الشاشة */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-2.5 mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
          <span className="flex items-center gap-1.5 text-slate-200 font-bold"><Store size={14} className="text-blue-400" /> {shop?.shop_name || org?.name} — {branchName}</span>
          <span className="text-slate-500">المستودع: {branchName}</span>
          {user?.email && <span className="flex items-center gap-1 text-slate-400"><User size={12} /> {user.email}</span>}
          <span className="flex items-center gap-1 text-slate-400"><Tag size={12} /> قائمة الأسعار: قطاعي</span>
          {shift ? (
            <span className="flex items-center gap-2">
              <span className="flex items-center gap-1 text-emerald-300"><PlayCircle size={13} /> وردية مفتوحة · افتتاحي {fmt(shift.opening_cash)}</span>
              <button onClick={() => { setExpAcc(expenseAccounts[0]?.id ?? ""); setShiftModal("expense"); }} className="px-2 py-1 rounded-lg bg-slate-800 text-slate-300 text-[11px] font-bold hover:bg-slate-700 flex items-center gap-1"><Banknote size={12} /> مصروف</button>
              <button onClick={openClose} className="px-2 py-1 rounded-lg bg-red-500/10 text-red-300 text-[11px] font-bold hover:bg-red-500/20 flex items-center gap-1"><Power size={12} /> إغلاق الوردية</button>
            </span>
          ) : (
            <button onClick={() => setShiftModal("open")} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-[#fff] text-[11px] font-bold flex items-center gap-1"><PlayCircle size={13} /> فتح وردية</button>
          )}
          <select ref={custRef} value={custId} onChange={(e) => setCustId(e.target.value ? Number(e.target.value) : "")} className="mr-auto bg-slate-950 border border-slate-700 rounded-lg text-white px-2 py-1.5 text-xs outline-none focus:border-blue-500 max-w-[220px]">
            <option value="">عميل نقدي/عابر (F3)</option>
            {parties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        {/* بحث + أدوات العرض */}
        <div className="flex gap-2 mb-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input ref={searchRef} value={rawSearch} onChange={(e) => setRawSearch(e.target.value)} onKeyDown={onSearchEnter} placeholder="ابحث بالاسم أو الكود أو العلامة أو امسح الباركود… (F2)" className="w-full bg-slate-900 border border-slate-700 rounded-xl text-white pr-10 pl-9 py-2.5 text-sm outline-none focus:border-blue-500" />
            <Barcode size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
          </div>
          <div className="inline-flex bg-slate-900 border border-slate-700 rounded-xl p-1">
            <button onClick={() => setView("grid")} className={`w-9 h-9 rounded-lg flex items-center justify-center ${view === "grid" ? "bg-blue-600 text-[#fff]" : "text-slate-400"}`}><LayoutGrid size={16} /></button>
            <button onClick={() => setView("table")} className={`w-9 h-9 rounded-lg flex items-center justify-center ${view === "table" ? "bg-blue-600 text-[#fff]" : "text-slate-400"}`}><List size={16} /></button>
          </div>
        </div>
        {brandList.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-2 mb-3">
            <button onClick={() => setBrand("")} className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap ${brand === "" ? "bg-blue-600 text-[#fff]" : "bg-slate-800 text-slate-300"}`}>الكل</button>
            {brandList.map((b) => <button key={b} onClick={() => setBrand(b)} className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap ${brand === b ? "bg-blue-600 text-[#fff]" : "bg-slate-800 text-slate-300"}`}>{b}</button>)}
          </div>
        )}

        <div className="flex-1">
          {loading ? <div className="p-10 text-center text-slate-500">جارٍ تحميل المنتجات…</div>
          : filtered.length === 0 ? <div className="p-10 text-center text-slate-500">{products.length === 0 ? "لا منتجات لهذا الفرع في المخزون." : "لا نتائج مطابِقة."}</div>
          : view === "grid" ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-2.5">
              {shown.map((p) => {
                const out = p.quantity <= 0; const inCart = stockInCart(p.id); const maxed = inCart >= p.quantity;
                return (
                  <button key={p.id} onClick={() => !out && !maxed && addToCart(p)} disabled={out || maxed} className={`text-right bg-slate-900 border rounded-xl overflow-hidden transition-colors ${out || maxed ? "opacity-50 cursor-not-allowed border-slate-800" : "border-slate-800 hover:border-blue-500/60 active:scale-[0.98]"}`}>
                    <div className="flex">
                      <div className="w-14 h-14 bg-slate-950 flex items-center justify-center shrink-0 overflow-hidden">
                        {p.product_image_url ? <img src={p.product_image_url} alt="" className="w-full h-full object-cover" /> : <ShoppingCart size={18} className="text-slate-700" />}
                      </div>
                      <div className="p-2 min-w-0 flex-1">
                        <div className="text-[11px] font-bold text-slate-100 line-clamp-2 leading-tight">{p.product_name}</div>
                        <div className="text-[9px] text-slate-500 truncate [direction:ltr] text-right">{p.product_code || p.barcode || ""}{p.brand ? ` · ${p.brand}` : ""}</div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between px-2 pb-1.5">
                      <span className="text-sm font-black text-blue-400 font-mono [direction:ltr]">{fmt(DB.posPrice(p))}</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${out ? "bg-red-500/15 text-red-300" : "bg-emerald-500/15 text-emerald-300"}`}>{out ? "نفد" : `متاح ${p.quantity}`}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full text-xs">
                <thead><tr className="bg-slate-950 text-slate-500">{["الصنف", "الكود/العلامة", "السعر", "المتاح", ""].map((h, i) => <th key={i} className="px-3 py-2 text-[10px] whitespace-nowrap border-b border-slate-800">{h}</th>)}</tr></thead>
                <tbody>
                  {shown.map((p) => { const out = p.quantity <= 0; const maxed = stockInCart(p.id) >= p.quantity; return (
                    <tr key={p.id} className="border-b border-slate-800/60 hover:bg-white/[0.02]">
                      <td className="px-3 py-2 text-slate-200">{p.product_name}</td>
                      <td className="px-3 py-2 text-slate-500 [direction:ltr] text-right">{p.product_code || "—"}{p.brand ? ` · ${p.brand}` : ""}</td>
                      <td className="px-3 py-2 text-center font-mono text-blue-400 [direction:ltr]">{fmt(DB.posPrice(p))}</td>
                      <td className="px-3 py-2 text-center"><span className={`text-[10px] px-1.5 py-0.5 rounded-full ${out ? "bg-red-500/15 text-red-300" : "bg-emerald-500/15 text-emerald-300"}`}>{out ? "نفد" : p.quantity}</span></td>
                      <td className="px-3 py-2 text-center"><button onClick={() => addToCart(p)} disabled={out || maxed} className="px-3 py-1 rounded-lg bg-blue-600 text-[#fff] text-[11px] font-bold disabled:opacity-40">إضافة</button></td>
                    </tr>
                  ); })}
                </tbody>
              </table>
            </div>
          )}
          {!loading && filtered.length > visible && (
            <button onClick={() => setVisible((v) => v + PAGE)} className="w-full mt-3 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold hover:bg-slate-700">عرض المزيد ({filtered.length - visible})</button>
          )}
        </div>

        {/* شريط الاختصارات */}
        <div className="hidden lg:flex items-center gap-4 mt-3 px-2 text-[10px] text-slate-600">
          {[["F2", "بحث"], ["F3", "عميل"], ["F6", "خصم"], ["F8", "تعليق"], ["F9", "تحصيل"], ["Esc", "مسح"]].map(([k, v]) => (
            <span key={k}><kbd className="px-1.5 py-0.5 bg-slate-800 rounded text-slate-400 font-mono">{k}</kbd> {v}</span>
          ))}
        </div>
      </div>

      {/* السلة 35% */}
      <div className="lg:w-[380px] shrink-0 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col lg:max-h-[calc(100vh-1.5rem)] lg:sticky lg:top-3">
        <div className="p-3 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2"><span className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center"><ShoppingCart size={18} /></span>
            <div><div className="text-sm font-bold text-white">سلة البيع</div><div className="text-[10px] text-slate-500">{cart.length} صنف</div></div>
          </div>
          <div className="flex gap-1">
            <button onClick={() => setShowHeld(true)} title="المعلّقة" className="relative w-8 h-8 rounded-lg bg-slate-800 text-slate-300 flex items-center justify-center hover:bg-slate-700"><PauseCircle size={15} />{held.length > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 text-[9px] text-black rounded-full flex items-center justify-center font-bold">{held.length}</span>}</button>
            <button onClick={() => { setShowToday(true); loadToday(); }} title="فواتير اليوم" className="w-8 h-8 rounded-lg bg-slate-800 text-slate-300 flex items-center justify-center hover:bg-slate-700"><Clock size={15} /></button>
            <button onClick={clearCart} title="إفراغ" disabled={!cart.length} className="w-8 h-8 rounded-lg bg-red-500/10 text-red-400 flex items-center justify-center hover:bg-red-500/20 disabled:opacity-40"><RotateCcw size={15} /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto min-h-[120px]">
          {cart.length === 0 ? <div className="p-8 text-center text-slate-600 text-sm">السلة فارغة — اضغط منتجًا لإضافته.</div>
          : cart.map((l) => {
            const price = DB.posPrice(l.product); const lineNet = r2(price * l.qty - Math.min(l.disc, price * l.qty));
            return (
              <div key={l.product.id} className="px-3 py-2 border-b border-slate-800/60">
                <div className="flex items-center gap-2">
                  <button onClick={() => removeLine(l.product.id)} className="w-6 h-6 rounded-md bg-red-500/10 text-red-400 flex items-center justify-center shrink-0"><Trash2 size={12} /></button>
                  <div className="flex-1 min-w-0 text-xs text-slate-200 truncate">{l.product.product_name}</div>
                  <div className="text-xs font-mono text-emerald-300 [direction:ltr] shrink-0">{fmt(lineNet)}</div>
                </div>
                <div className="flex items-center gap-2 mt-1.5 pr-8">
                  <div className="flex items-center gap-1">
                    <button onClick={() => setQty(l.product.id, l.qty - 1)} className="w-6 h-6 rounded-md bg-slate-800 text-slate-300 flex items-center justify-center"><Minus size={11} /></button>
                    <span className="w-7 text-center text-xs font-bold text-white">{l.qty}</span>
                    <button onClick={() => setQty(l.product.id, l.qty + 1)} disabled={l.qty >= l.product.quantity} className="w-6 h-6 rounded-md bg-slate-800 text-slate-300 flex items-center justify-center disabled:opacity-30"><Plus size={11} /></button>
                  </div>
                  <span className="text-[10px] text-slate-500 [direction:ltr]">× {fmt(price)}</span>
                  <div className="flex items-center gap-1 mr-auto">
                    <Percent size={11} className="text-slate-500" />
                    <input type="number" step="0.01" value={l.disc || ""} onChange={(e) => setLineDisc(l.product.id, Number(e.target.value) || 0)} placeholder="خصم" className="w-16 bg-slate-950 border border-slate-700 rounded-md text-white px-1.5 py-0.5 text-[11px] text-center [direction:ltr] outline-none focus:border-blue-500" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="p-3 border-t border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400"><span>الإجمالي الفرعي</span><span className="font-mono text-slate-200 [direction:ltr]">{fmt(t.gross)}</span></div>
          {t.lineDisc > 0 && <div className="flex items-center justify-between text-xs text-slate-400"><span>خصم الأصناف</span><span className="font-mono text-red-300 [direction:ltr]">-{fmt(t.lineDisc)}</span></div>}
          <div className="flex items-center justify-between text-xs text-slate-400"><span>خصم الفاتورة (F6)</span>
            <input ref={discRef} type="number" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} className="w-24 bg-slate-950 border border-slate-700 rounded-lg text-white px-2 py-1 text-xs text-left [direction:ltr] outline-none focus:border-blue-500" />
          </div>
          <div className="flex items-center justify-between text-xs text-slate-400"><span>ضريبة 15%</span><span className="font-mono text-amber-300 [direction:ltr]">{fmt(t.vat)}</span></div>
          <div className="flex items-center justify-between text-lg font-black text-white border-t border-slate-800 pt-2"><span>الإجمالي</span><span className="font-mono text-emerald-400 [direction:ltr]">{fmt(t.total)}</span></div>

          {PayPanel}
          {payType === "credit" && custId === "" && <div className="text-[11px] text-amber-400 text-center">اختر العميل الآجل من الأعلى (F3).</div>}

          <div className="flex gap-2">
            <button onClick={holdCart} disabled={!cart.length} title="تعليق (F8)" className="px-3 py-3 rounded-xl bg-amber-500/10 text-amber-300 font-bold text-sm hover:bg-amber-500/20 disabled:opacity-40"><PauseCircle size={16} /></button>
            <button onClick={checkout} disabled={saving || !cart.length} className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-[#fff] font-black text-sm flex items-center justify-center gap-2 disabled:opacity-40">
              <Wallet size={16} /> {saving ? "جارٍ…" : `تحصيل (F9) · ${fmt(t.total)}`}
            </button>
          </div>
        </div>
      </div>

      {/* المعلّقة */}
      {showHeld && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" dir="rtl" onClick={() => setShowHeld(false)}>
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-3 border-b border-slate-800 flex items-center justify-between"><span className="text-sm font-bold text-white">فواتير معلّقة</span><button onClick={() => setShowHeld(false)} className="w-7 h-7 rounded-lg bg-slate-800 text-slate-300 flex items-center justify-center"><X size={14} /></button></div>
            <div className="overflow-y-auto">
              {held.length === 0 ? <div className="p-6 text-center text-slate-500 text-sm">لا فواتير معلّقة.</div> : held.map((h) => (
                <div key={h.id} className="flex items-center gap-2 px-4 py-3 border-b border-slate-800/60 hover:bg-white/[0.03]">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-slate-200 truncate">{h.label || `${h.data?.items?.length ?? 0} صنف`}</div>
                    <div className="text-[10px] text-slate-500">{(h.data?.items?.length ?? 0)} صنف{h.created_at ? ` · ${new Date(h.created_at).toLocaleTimeString("ar-SA")}` : ""}</div>
                  </div>
                  <button onClick={() => restoreHeld(h)} className="px-3 py-1.5 rounded-lg bg-blue-600 text-[#fff] text-[11px] font-bold">استعادة</button>
                  <button onClick={async () => { await DB.deleteParked(h.id); await loadParked(); }} title="حذف" className="w-7 h-7 rounded-lg bg-red-500/10 text-red-400 flex items-center justify-center"><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
            <div className="p-2 text-[10px] text-slate-500 text-center border-t border-slate-800">محفوظة على مستوى الفرع — تبقى بعد إغلاق المتصفّح.</div>
          </div>
        </div>
      )}

      {/* فتح وردية */}
      {shiftModal === "open" && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" dir="rtl" onClick={() => setShiftModal(null)}>
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-white font-bold text-sm mb-3 flex items-center gap-2"><PlayCircle size={16} className="text-emerald-400" /> فتح وردية — {branchName}</h3>
            <label className="text-[11px] text-slate-500">الرصيد الافتتاحي للصندوق</label>
            <input type="number" step="0.01" value={openCash} onChange={(e) => setOpenCash(e.target.value)} placeholder="0.00" autoFocus className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-lg text-white px-3 py-2 text-sm text-center [direction:ltr] outline-none focus:border-blue-500" />
            <div className="flex gap-2 justify-end mt-4">
              <button onClick={() => setShiftModal(null)} className="px-3 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-bold">إلغاء</button>
              <button onClick={doOpenShift} className="px-4 py-2 rounded-lg bg-emerald-600 text-[#fff] text-xs font-bold">فتح الوردية</button>
            </div>
          </div>
        </div>
      )}

      {/* مصروف نقدي */}
      {shiftModal === "expense" && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" dir="rtl" onClick={() => setShiftModal(null)}>
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-white font-bold text-sm flex items-center gap-2"><Banknote size={16} className="text-amber-400" /> مصروف نقدي من الصندوق</h3>
            <div><label className="text-[11px] text-slate-500">المبلغ</label><input type="number" step="0.01" value={expAmount} onChange={(e) => setExpAmount(e.target.value)} placeholder="0.00" autoFocus className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-lg text-white px-3 py-2 text-sm text-center [direction:ltr] outline-none focus:border-blue-500" /></div>
            <div><label className="text-[11px] text-slate-500">حساب المصروف</label>
              <select value={expAcc} onChange={(e) => setExpAcc(e.target.value ? Number(e.target.value) : "")} className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-lg text-white px-2 py-2 text-xs outline-none focus:border-blue-500">
                <option value="">— اختر حساب المصروف</option>
                {expenseAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div><label className="text-[11px] text-slate-500">البيان</label><input value={expReason} onChange={(e) => setExpReason(e.target.value)} placeholder="سبب المصروف" className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-lg text-white px-3 py-2 text-xs outline-none focus:border-blue-500" /></div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShiftModal(null)} className="px-3 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-bold">إلغاء</button>
              <button onClick={doExpense} className="px-4 py-2 rounded-lg bg-amber-600 text-[#fff] text-xs font-bold">تسجيل وخصم</button>
            </div>
          </div>
        </div>
      )}

      {/* إغلاق الوردية */}
      {shiftModal === "close" && summary && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" dir="rtl" onClick={() => setShiftModal(null)}>
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm p-5 space-y-2" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-white font-bold text-sm flex items-center gap-2"><Power size={16} className="text-red-400" /> إغلاق الوردية</h3>
            {[["عدد الفواتير", String(summary.count)], ["إجمالي المبيعات", fmt(summary.salesTotal)], ["نقدي", fmt(summary.cashCollected)], ["شبكة", fmt(summary.cardCollected)], ["آجل", fmt(summary.creditTotal)]].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between text-xs text-slate-400"><span>{k}</span><span className="font-mono text-slate-200 [direction:ltr]">{v}</span></div>
            ))}
            <div className="border-t border-slate-800 pt-2 space-y-1">
              <div className="flex items-center justify-between text-xs text-slate-400"><span>رصيد افتتاحي + نقدي − مصروفات</span><span className="font-mono text-slate-300 [direction:ltr]">{fmt(summary.expenses)} −</span></div>
              <div className="flex items-center justify-between text-sm font-bold text-white"><span>النقد المتوقّع</span><span className="font-mono text-emerald-400 [direction:ltr]">{fmt(summary.expected)}</span></div>
            </div>
            <div><label className="text-[11px] text-slate-500">النقد الفعلي (الجرد)</label><input type="number" step="0.01" value={closeCash} onChange={(e) => setCloseCash(e.target.value)} placeholder="0.00" autoFocus className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-lg text-white px-3 py-2 text-sm text-center [direction:ltr] outline-none focus:border-blue-500" /></div>
            {closeCash !== "" && (() => { const d = r2((Number(closeCash) || 0) - summary.expected); return <div className={`text-center text-xs font-bold ${d === 0 ? "text-emerald-400" : d > 0 ? "text-sky-400" : "text-red-400"}`}>{d === 0 ? "مطابق ✓" : d > 0 ? `زيادة: ${fmt(d)}` : `عجز: ${fmt(Math.abs(d))}`}</div>; })()}
            <div className="flex gap-2 justify-end pt-1">
              <button onClick={() => setShiftModal(null)} className="px-3 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-bold">إلغاء</button>
              <button onClick={doClose} className="px-4 py-2 rounded-lg bg-red-600 text-[#fff] text-xs font-bold">إغلاق وطباعة Z</button>
            </div>
          </div>
        </div>
      )}

      {/* فواتير اليوم */}
      {showToday && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" dir="rtl" onClick={() => setShowToday(false)}>
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-3 border-b border-slate-800 flex items-center justify-between"><span className="text-sm font-bold text-white">فواتير اليوم — {branchName}</span><button onClick={() => setShowToday(false)} className="w-7 h-7 rounded-lg bg-slate-800 text-slate-300 flex items-center justify-center"><X size={14} /></button></div>
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
            {todayList.length > 0 && <div className="p-3 border-t border-slate-800 flex items-center justify-between text-sm font-bold"><span className="text-slate-300">إجمالي اليوم</span><span className="font-mono text-emerald-400 [direction:ltr]">{fmt(todayList.reduce((s, i) => s + (Number(i.total) || 0), 0))}</span></div>}
          </div>
        </div>
      )}
    </div>
  );
}
