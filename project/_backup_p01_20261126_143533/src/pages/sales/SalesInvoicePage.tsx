// =============================================================
// src/pages/sales/SalesInvoicePage.tsx
// شاشة فاتورة المبيعات (إدخال + مسودات + سجل + طباعة).
// - مصدر الأرقام: accountingDb.invoiceTotals (الضريبة) عبر salesInvoiceCalc.
// - الترحيل: RPC ذرّية post_sales_invoice (فاتورة + قيد + مدفوعات + مخزون في معاملة واحدة).
// - لا تعديل مباشر لـ products.quantity من الواجهة، ولا ترحيل مكرر (idempotency_key).
// =============================================================
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Search, Trash2, Printer, Save, X, Check, ScanLine, FileText, History, RotateCcw, Wallet, AlertTriangle, User, ChevronDown } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useOrgConfig } from "../../context/OrgConfigContext";
import { useLang } from "../../context/LanguageContext";
import * as DB from "../lib/accountingDb";
import type { GLAccount, GLParty, GLSalesInvoice, GLTreasury, GLWarehouse } from "../lib/accountingDb";
import * as API from "./salesInvoiceApi";
import type { DraftRow, SaleProduct } from "./salesInvoiceApi";
import { addDays, buildTenders, computeInvoice, clampPct, daysBetween, r2, validateLines } from "./salesInvoiceCalc";
import type { InvoiceLine, PayMode } from "./salesInvoiceCalc";
import { buildInvoiceHTML, printHTML } from "./salesInvoicePrint";

const today = (): string => new Date().toISOString().slice(0, 10);
const monthStart = (): string => `${today().slice(0, 8)}01`;
const fmt = (n: number): string => (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Props = { onNavigate?: (p: string) => void; onSection?: (s: string) => void };

type DraftPayload = {
  v: 1; branchId: number | null; date: string; dueDate: string; payMode: PayMode; treasuryId: number | ""; paidNow: string;
  partyId: number | ""; customerRef: string; salesperson: string; warehouseId: number | ""; notes: string; taxInclusive: boolean;
  lines: InvoiceLine[];
};

const inputCls = "w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500 disabled:opacity-50";
const labelCls = "block text-xs font-semibold text-slate-400 mb-1";
const cardCls = "bg-slate-900 border border-slate-800 rounded-2xl";

export default function SalesInvoicePage({ onNavigate, onSection }: Props) {
  const { ownedShopId, branches, user } = (useAuth() as unknown as { ownedShopId: number | null; branches: { id: number; name: string }[]; user: { email?: string | null } | null }) ?? { ownedShopId: null, branches: [], user: null };
  const { cfg } = useOrgConfig();
  const { t, lang, isRTL } = useLang();
  const dir = isRTL ? "rtl" : "ltr";
  const taxRate = Number(cfg?.default_tax_rate ?? 15);
  const currency = cfg?.currency_symbol || (isRTL ? "ر.س" : "SAR");

  const [tab, setTab] = useState<"new" | "history">("new");
  const [org, setOrg] = useState<{ id: number; name: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [rpcReady, setRpcReady] = useState<boolean | null>(null);
  const [accounts, setAccounts] = useState<GLAccount[]>([]);
  const [treasuries, setTreasuries] = useState<GLTreasury[]>([]);
  const [parties, setParties] = useState<GLParty[]>([]);
  const [warehouses, setWarehouses] = useState<GLWarehouse[]>([]);

  // ── حالة النموذج ──
  const [branchId, setBranchId] = useState<number | null>(ownedShopId ?? null);
  const [date, setDate] = useState(today());
  const [dueDate, setDueDate] = useState("");
  const [dueTouched, setDueTouched] = useState(false);
  const [payMode, setPayMode] = useState<PayMode>("cash");
  const [treasuryId, setTreasuryId] = useState<number | "">("");
  const [paidNow, setPaidNow] = useState("");
  const [collectNow, setCollectNow] = useState(false);
  const [partyId, setPartyId] = useState<number | "">("");
  const [customerRef, setCustomerRef] = useState("");
  const [salesperson, setSalesperson] = useState("");
  const [warehouseId, setWarehouseId] = useState<number | "">("");
  const [notes, setNotes] = useState("");
  const [taxInclusive, setTaxInclusive] = useState(false);
  const [lines, setLines] = useState<InvoiceLine[]>([]);
  const [revAcc, setRevAcc] = useState<number | "">("");
  const [taxAcc, setTaxAcc] = useState<number | "">("");
  const [draftId, setDraftId] = useState<number | null>(null);
  const idemKey = useRef<string>(API.newIdempotencyKey());
  const postingRef = useRef(false);

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err" | "warn"; text: string } | null>(null);
  const [lastPosted, setLastPosted] = useState<{ id: number; no: number; year: number; duplicate: boolean } | null>(null);

  // ── بحث الأصناف ──
  const [prodQ, setProdQ] = useState("");
  const [prodRes, setProdRes] = useState<SaleProduct[]>([]);
  const [prodOpen, setProdOpen] = useState(false);
  const [prodBusy, setProdBusy] = useState(false);
  const searchSeq = useRef(0);
  const searchRef = useRef<HTMLInputElement>(null);

  // ── العميل ──
  const [custQ, setCustQ] = useState("");
  const [custOpen, setCustOpen] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);

  // ── السجل والمسودات ──
  const [hFrom, setHFrom] = useState(monthStart());
  const [hTo, setHTo] = useState(today());
  const [hQ, setHQ] = useState("");
  const [history, setHistory] = useState<GLSalesInvoice[]>([]);
  const [hLoading, setHLoading] = useState(false);
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [draftsMissing, setDraftsMissing] = useState(false);

  const branchName = useCallback((id: number | null): string => (branches || []).find((b) => b.id === id)?.name || t("Branch", "الفرع"), [branches, t]);

  // ── تحميل المراجع ──
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const o = await DB.getOrgForBranch(ownedShopId ?? null);
      if (!alive) return;
      setOrg(o);
      if (o) {
        const [accs, treas, pps, whs, ready] = await Promise.all([
          DB.fetchAccounts(o.id), DB.fetchTreasuries(o.id), DB.fetchParties(o.id, "customer"), DB.fetchWarehouses(o.id), API.probeSalesRpc(),
        ]);
        if (!alive) return;
        setAccounts(accs); setTreasuries(treas); setParties(pps); setWarehouses(whs); setRpcReady(ready);
        // لا نخمّن حسابًا: نختار تلقائيًا فقط إن وُجد مرشح وحيد
        const revs = accs.filter((a) => a.type === "revenue" && !a.is_group && a.is_active);
        const vats = accs.filter((a) => a.type === "liability" && !a.is_group && a.is_active && /ضريبة|مخرجات|vat|tax/i.test(a.name));
        setRevAcc(revs.length === 1 ? revs[0].id : "");
        setTaxAcc(vats.length === 1 ? vats[0].id : "");
      }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [ownedShopId]);

  useEffect(() => { if (ownedShopId != null) setBranchId((b) => b ?? ownedShopId); }, [ownedShopId]);

  const branchTreasuries = useMemo(
    () => treasuries.filter((x) => x.is_active && x.account_id && (x.branch_id == null || x.branch_id === branchId)),
    [treasuries, branchId],
  );
  useEffect(() => {
    if (treasuryId !== "" && !branchTreasuries.some((x) => x.id === treasuryId)) setTreasuryId("");
    if (treasuryId === "") {
      const cash = branchTreasuries.filter((x) => x.kind === "cash");
      if (cash.length === 1) setTreasuryId(cash[0].id);
    }
  }, [branchTreasuries, treasuryId]);

  const revCandidates = useMemo(() => accounts.filter((a) => a.type === "revenue" && !a.is_group && a.is_active), [accounts]);
  const taxCandidates = useMemo(() => accounts.filter((a) => a.type === "liability" && !a.is_group && a.is_active), [accounts]);

  const customer = useMemo(() => (partyId === "" ? null : parties.find((p) => p.id === partyId) ?? null), [partyId, parties]);
  const receivableAcc = useMemo(() => API.receivableAccountOf(customer, parties), [customer, parties]);
  const creditDays = Number(customer?.credit_days) || 0;
  const treasury = useMemo(() => (treasuryId === "" ? null : branchTreasuries.find((x) => x.id === treasuryId) ?? null), [treasuryId, branchTreasuries]);

  // رصيد العميل الفعلي من القيود المرحّلة
  useEffect(() => {
    let alive = true;
    setBalance(null);
    if (!org || !receivableAcc) return;
    API.customerBalance(org.id, receivableAcc).then((n) => { if (alive) setBalance(n); }).catch(() => { if (alive) setBalance(null); });
    return () => { alive = false; };
  }, [org, receivableAcc, lastPosted]);

  // تاريخ الاستحقاق من مدة الائتمان ما لم يعدّله المستخدم
  useEffect(() => {
    if (payMode === "credit" && !dueTouched) setDueDate(creditDays > 0 ? addDays(date, creditDays) : "");
    if (payMode === "cash") { setDueDate(""); setDueTouched(false); }
  }, [payMode, creditDays, date, dueTouched]);

  // ── الحسابات ──
  const totals = useMemo(() => computeInvoice(lines, taxRate, taxInclusive), [lines, taxRate, taxInclusive]);
  const issues = useMemo(() => validateLines(lines), [lines]);
  const issueOf = (key: string): string | null => {
    const i = issues.find((x) => x.key === key);
    if (!i) return null;
    if (i.code === "stock") return t(`Only ${i.max} in stock`, `المتاح ${i.max} فقط`);
    if (i.code === "qty_int") return t("Whole numbers only", "أرقام صحيحة فقط");
    if (i.code === "qty") return t("Quantity must be > 0", "الكمية يجب أن تكون أكبر من صفر");
    if (i.code === "price") return t("Invalid price", "سعر غير صالح");
    return t("Discount 0–100%", "الخصم بين 0 و100%");
  };

  const paidValue = payMode === "cash" ? totals.total : collectNow ? r2(Number(paidNow) || 0) : 0;
  const remaining = r2(totals.total - paidValue);

  // ── بحث الأصناف (مؤجّل 200ms، يتجاهل الردود القديمة) ──
  useEffect(() => {
    const q = prodQ.trim();
    if (!q || branchId == null) { setProdRes([]); return; }
    const seq = ++searchSeq.current;
    const h = window.setTimeout(async () => {
      setProdBusy(true);
      const res = await API.searchProducts(branchId, q, warehouseId === "" ? null : warehouseId);
      if (seq === searchSeq.current) { setProdRes(res); setProdBusy(false); }
    }, 200);
    return () => window.clearTimeout(h);
  }, [prodQ, branchId, warehouseId]);

  const addProduct = (p: SaleProduct): void => {
    setMsg(null);
    setLines((cur) => {
      const ex = cur.find((l) => l.productId === p.id);
      if (ex) { // لا تكرار للأصناف: نزيد الكمية حتى حد المخزون
        return cur.map((l) => (l.productId === p.id ? { ...l, qty: Math.min(l.qty + 1, Math.max(p.quantity, 1)), stock: p.quantity } : l));
      }
      const sp = API.sellPrice(p);
      return [...cur, { key: `${p.id}-${Date.now()}`, productId: p.id, code: p.product_code, name: p.product_name, barcode: p.barcode, unit: p.unit, stock: p.quantity, cost: p.cost, qty: 1, unitPrice: sp.price, discountPct: 0 }];
    });
    setProdQ(""); setProdRes([]); setProdOpen(false);
    searchRef.current?.focus();
  };

  const onSearchEnter = async (): Promise<void> => {
    const q = prodQ.trim();
    if (!q || branchId == null) return;
    const exact = await API.findProductExact(branchId, q, warehouseId === "" ? null : warehouseId);
    if (exact) { addProduct(exact); return; }
    if (prodRes.length >= 1) addProduct(prodRes[0]);
  };

  const patchLine = (key: string, patch: Partial<InvoiceLine>): void => setLines((cur) => cur.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const removeLine = (key: string): void => setLines((cur) => cur.filter((l) => l.key !== key));

  // تغيير الفرع/المخزن يغيّر مصدر المخزون: نفرّغ الأسطر لتجنّب بيع من غير الفرع
  const changeBranch = (id: number): void => {
    if (id === branchId) return;
    if (lines.length && !window.confirm(t("Changing the branch clears the lines (stock is per branch). Continue?", "تغيير الفرع يمسح الأصناف (المخزون لكل فرع). متابعة؟"))) return;
    setLines([]); setBranchId(id); setTreasuryId("");
  };

  const resetForm = (): void => {
    setLines([]); setPartyId(""); setCustQ(""); setCustomerRef(""); setSalesperson(""); setNotes(""); setPaidNow(""); setCollectNow(false);
    setDate(today()); setDueDate(""); setDueTouched(false); setPayMode("cash"); setDraftId(null); setTaxInclusive(false);
    idemKey.current = API.newIdempotencyKey(); setMsg(null);
  };

  // ── المسودات ──
  const refreshDrafts = useCallback(async () => {
    if (!org) return;
    const r = await API.listDrafts(org.id, null);
    setDrafts(r.rows); setDraftsMissing(r.missing);
  }, [org]);
  useEffect(() => { void refreshDrafts(); }, [refreshDrafts]);

  const snapshot = (): DraftPayload => ({ v: 1, branchId, date, dueDate, payMode, treasuryId, paidNow, partyId, customerRef, salesperson, warehouseId, notes, taxInclusive, lines });

  const saveDraftClick = async (): Promise<void> => {
    if (!org) return;
    if (!lines.length) { setMsg({ kind: "err", text: t("Add at least one item before saving a draft.", "أضف صنفًا واحدًا على الأقل قبل حفظ المسودة.") }); return; }
    const title = `${customer?.name ?? t("Cash customer", "عميل نقدي")} — ${fmt(totals.total)}`;
    const r = await API.saveDraft(org.id, branchId, draftId, title, snapshot());
    if (!r.ok) { setMsg({ kind: "err", text: draftsMissing || /does not exist|schema cache/i.test(r.error || "") ? t("Drafts table is not installed yet (migration P01).", "جدول المسودات غير مُركَّب بعد (هجرة P01).") : (r.error || "") }); return; }
    setDraftId(r.id ?? null);
    setMsg({ kind: "ok", text: t("Draft saved. No stock or ledger impact.", "تم حفظ المسودة. لا أثر على المخزون أو الدفتر.") });
    void refreshDrafts();
  };

  const openDraft = (d: DraftRow): void => {
    const p = d.payload as Partial<DraftPayload> | null;
    if (!p || p.v !== 1) { setMsg({ kind: "err", text: t("Unsupported draft format.", "صيغة مسودة غير مدعومة.") }); return; }
    setBranchId(p.branchId ?? ownedShopId ?? null); setDate(p.date || today()); setDueDate(p.dueDate || ""); setDueTouched(Boolean(p.dueDate));
    setPayMode(p.payMode === "credit" ? "credit" : "cash"); setTreasuryId(p.treasuryId ?? ""); setPaidNow(p.paidNow || ""); setCollectNow(Boolean(Number(p.paidNow)));
    setPartyId(p.partyId ?? ""); setCustomerRef(p.customerRef || ""); setSalesperson(p.salesperson || ""); setWarehouseId(p.warehouseId ?? "");
    setNotes(p.notes || ""); setTaxInclusive(Boolean(p.taxInclusive)); setLines(Array.isArray(p.lines) ? p.lines : []);
    setDraftId(d.id); idemKey.current = API.newIdempotencyKey(); setTab("new");
    setMsg({ kind: "warn", text: t("Draft loaded. Stock and prices are re-checked when you post.", "تم تحميل المسودة. يُعاد التحقق من المخزون عند الترحيل.") });
  };

  // ── الترحيل ──
  const post = async (): Promise<void> => {
    if (!org || branchId == null || postingRef.current) return;
    setMsg(null);
    if (!lines.length) { setMsg({ kind: "err", text: t("Add at least one item.", "أضف صنفًا واحدًا على الأقل.") }); return; }
    if (issues.length) { setMsg({ kind: "err", text: t("Fix the highlighted lines first.", "صحّح الأسطر المظلّلة أولًا.") }); return; }
    if (totals.total <= 0) { setMsg({ kind: "err", text: t("Invoice total must be greater than zero.", "إجمالي الفاتورة يجب أن يكون أكبر من صفر.") }); return; }
    if (revAcc === "") { setMsg({ kind: "err", text: t("Select the sales revenue account.", "اختر حساب إيراد المبيعات.") }); return; }
    if (totals.tax > 0 && taxAcc === "") { setMsg({ kind: "err", text: t("Select the output VAT account.", "اختر حساب ضريبة المخرجات.") }); return; }
    if (payMode === "credit") {
      if (!customer) { setMsg({ kind: "err", text: t("Select a customer for credit sales.", "اختر العميل للبيع الآجل.") }); return; }
      if (!receivableAcc) { setMsg({ kind: "err", text: t("This customer has no receivable account.", "هذا العميل بلا حساب ذمة.") }); return; }
      if (creditDays <= 0 && !dueDate) { setMsg({ kind: "err", text: t("Set the customer's credit days or a due date.", "حدّد مدة ائتمان العميل أو تاريخ استحقاق.") }); return; }
      if (dueDate && daysBetween(date, dueDate) < 0) { setMsg({ kind: "err", text: t("Due date is before the invoice date.", "تاريخ الاستحقاق قبل تاريخ الفاتورة.") }); return; }
    }
    const tn = buildTenders({ mode: payMode, total: totals.total, paidNow: paidValue, treasuryAccountId: treasury?.account_id ?? null, treasuryMethod: treasury?.kind === "bank" ? "card" : "cash", receivableAccountId: receivableAcc });
    if (!tn.ok) {
      const text = tn.error === "treasury" ? t("Select the collection treasury/bank.", "اختر خزنة/بنك التحصيل.") : tn.error === "receivable" ? t("Customer receivable account is missing.", "حساب ذمة العميل غير موجود.") : t("Paid amount must be between 0 and the invoice total.", "المبلغ المدفوع يجب أن يكون بين صفر وإجمالي الفاتورة.");
      setMsg({ kind: "err", text }); return;
    }
    postingRef.current = true; setSaving(true);
    const res = await API.postSalesInvoice(org.id, {
      idempotency_key: idemKey.current, branch_id: branchId, date, due_date: payMode === "credit" && dueDate ? dueDate : null,
      party_id: customer?.id ?? null, customer_name: customer?.name ?? null, customer_ref: customerRef.trim() || null, salesperson: salesperson.trim() || null,
      warehouse_id: warehouseId === "" ? null : warehouseId, notes: notes.trim() || null, tax_rate: taxRate, tax_inclusive: taxInclusive,
      revenue_account_id: Number(revAcc), tax_account_id: taxAcc === "" ? null : Number(taxAcc), expected_total: totals.total, source: "sales_entry",
      items: totals.lines.map((l) => ({ product_id: l.productId, qty: l.qty, unit_price: l.unitPrice, discount_pct: clampPct(l.discountPct) })),
      tenders: tn.tenders,
    });
    postingRef.current = false; setSaving(false);
    if (!res.ok) {
      const text = res.code === "not_installed" ? t("The posting function is not installed in the database yet (migration P01). Nothing was saved.", "دالة الترحيل غير مُركَّبة في قاعدة البيانات بعد (هجرة P01). لم يُحفظ شيء.")
        : res.code === "stock" ? t("Insufficient stock — refresh and adjust quantities. Nothing was saved.", "المخزون غير كافٍ — حدّث وعدّل الكميات. لم يُحفظ شيء.") + ` (${res.error})`
        : t("Could not post the invoice. Nothing was saved: ", "تعذّر ترحيل الفاتورة. لم يُحفظ شيء: ") + res.error;
      setMsg({ kind: "err", text }); return;
    }
    if (draftId) await API.deleteDraft(org.id, draftId);
    resetForm();
    setLastPosted({ id: res.id, no: res.invoiceNo, year: res.invoiceYear, duplicate: res.duplicate });
    setMsg({ kind: "ok", text: res.duplicate ? t(`This invoice was already posted as #${res.invoiceNo}. No duplicate was created.`, `هذه الفاتورة رُحّلت سابقًا برقم ${res.invoiceNo}. لم تُنشأ نسخة مكررة.`) : t(`Invoice #${res.invoiceNo}/${res.invoiceYear} posted.`, `تم ترحيل الفاتورة رقم ${res.invoiceNo}/${res.invoiceYear}.`) });
    void refreshDrafts();
    if (tab === "history") void loadHistory();
  };

  // ── السجل ──
  const loadHistory = useCallback(async () => {
    if (!org) return;
    setHLoading(true);
    setHistory(await API.fetchHistory(org.id, hFrom, hTo, branchId));
    setHLoading(false);
  }, [org, hFrom, hTo, branchId]);
  useEffect(() => { if (tab === "history") void loadHistory(); }, [tab, loadHistory]);

  const payLabel = (pt: string): string => pt === "cash" ? t("Cash", "نقدي") : pt === "card" ? t("Card/Bank", "شبكة/بنك") : pt === "credit" ? t("Credit", "آجل") : pt === "partial" ? t("Partial", "جزئي") : t("Split", "مقسّم");

  const printInvoice = async (inv: GLSalesInvoice, preview = false): Promise<void> => {
    if (!org) return;
    const info = await API.fetchPrintOrg(org.id, inv.branch_id ?? branchId);
    const ext = inv as GLSalesInvoice & { due_date?: string | null; customer_ref?: string | null; salesperson?: string | null; discount_total?: number | null };
    printHTML(buildInvoiceHTML(inv, info, { dueDate: ext.due_date ?? null, customerRef: ext.customer_ref ?? null, salesperson: ext.salesperson ?? null, discountTotal: Number(ext.discount_total) || 0, paymentLabel: payLabel(inv.payment_type), currency }, lang === "ar" ? "ar" : "en"));
    void preview;
  };

  const previewDraft = async (): Promise<void> => {
    if (!org || !lines.length) return;
    const info = await API.fetchPrintOrg(org.id, branchId);
    const pseudo = {
      id: 0, organization_id: org.id, branch_id: branchId, invoice_no: 0, invoice_year: Number(date.slice(0, 4)), date, party_id: customer?.id ?? null,
      customer_name: customer?.name ?? null, payment_type: payMode, treasury_account_id: null, paid_amount: paidValue, subtotal: totals.subtotal, tax_rate: taxRate,
      tax_amount: totals.tax, tax_inclusive: taxInclusive, total: totals.total, notes: notes || null, entry_id: null, status: "draft",
      items: totals.lines.map((l) => ({ description: l.name, product_code: l.code, qty: l.qty, unit_price: l.unitPrice, line_total: l.net, discount_pct: l.discountPct, discount_amount: l.discount, list_price: l.unitPrice })),
    } as unknown as GLSalesInvoice;
    printHTML(buildInvoiceHTML(pseudo, info, { dueDate: dueDate || null, customerRef: customerRef || null, salesperson: salesperson || null, discountTotal: totals.discount, paymentLabel: payLabel(payMode), currency }, lang === "ar" ? "ar" : "en"));
  };

  const goReturns = (): void => { onSection?.("sales"); onNavigate?.("accounting"); };
  const goReceipts = (): void => { onSection?.("treasury"); onNavigate?.("accounting"); };

  const shownHistory = useMemo(() => {
    const q = hQ.trim().toLowerCase();
    if (!q) return history;
    return history.filter((i) => String(i.invoice_no).includes(q) || (i.customer_name || "").toLowerCase().includes(q));
  }, [history, hQ]);

  const custList = useMemo(() => API.filterCustomers(parties, custQ), [parties, custQ]);
  const canPost = !saving && lines.length > 0 && rpcReady !== false && !loading;

  if (loading) return <div className="p-10 text-center text-slate-400" dir={dir}>{t("Loading…", "جارٍ التحميل…")}</div>;
  if (!org) return <div className="p-10 text-center text-slate-400" dir={dir}>{t("No organization is linked to this branch.", "لا توجد مؤسسة مرتبطة بهذا الفرع.")}</div>;

  return (
    <div className="p-4 lg:p-6 min-h-screen text-slate-100 space-y-4" dir={dir} data-testid="sales-invoice-page">
      {/* العنوان */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs text-slate-500">{t("Sales", "المبيعات")} / {t("New sales invoice", "فاتورة مبيعات جديدة")}</div>
          <h1 className="text-xl font-bold flex items-center gap-2"><FileText size={22} className="text-blue-400" />{t("New Sales Invoice", "فاتورة مبيعات جديدة")}</h1>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setTab("new")} className={`px-4 py-2 rounded-lg text-sm font-semibold border ${tab === "new" ? "bg-blue-600 border-blue-500 text-white" : "bg-slate-800 border-slate-700 text-slate-300"}`}>{t("New invoice", "فاتورة جديدة")}</button>
          <button onClick={() => setTab("history")} data-testid="tab-history" className={`px-4 py-2 rounded-lg text-sm font-semibold border flex items-center gap-1 ${tab === "history" ? "bg-blue-600 border-blue-500 text-white" : "bg-slate-800 border-slate-700 text-slate-300"}`}><History size={15} />{t("Invoices list", "قائمة الفواتير")}</button>
          <button onClick={goReturns} className="px-3 py-2 rounded-lg text-sm bg-slate-800 border border-slate-700 text-slate-300 flex items-center gap-1"><RotateCcw size={15} />{t("Returns", "المرتجعات")}</button>
          <button onClick={goReceipts} className="px-3 py-2 rounded-lg text-sm bg-slate-800 border border-slate-700 text-slate-300 flex items-center gap-1"><Wallet size={15} />{t("Receipts", "التحصيلات")}</button>
        </div>
      </div>

      {rpcReady === false && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-200 text-sm p-3 flex gap-2" data-testid="rpc-missing">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <span>{t("Posting is disabled: the database function post_sales_invoice (migration P01) is not installed. You can still prepare invoices.", "الترحيل معطّل: دالة قاعدة البيانات post_sales_invoice (هجرة P01) غير مُركَّبة. يمكنك تجهيز الفواتير فقط.")}</span>
        </div>
      )}
      {msg && (
        <div data-testid="msg" className={`rounded-xl border text-sm p-3 flex items-start justify-between gap-2 ${msg.kind === "ok" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" : msg.kind === "warn" ? "border-amber-500/40 bg-amber-500/10 text-amber-200" : "border-red-500/40 bg-red-500/10 text-red-200"}`}>
          <span>{msg.text}</span>
          <span className="flex gap-2 shrink-0">
            {msg.kind === "ok" && lastPosted && (
              <button className="underline" onClick={async () => { const inv = (await API.fetchHistory(org.id, `${lastPosted.year}-01-01`, `${lastPosted.year}-12-31`, null)).find((i) => i.id === lastPosted.id); if (inv) await printInvoice(inv); }}>{t("Print", "طباعة")}</button>
            )}
            <button onClick={() => setMsg(null)} aria-label="close"><X size={14} /></button>
          </span>
        </div>
      )}

      {tab === "new" ? (
        <>
          {/* رأس الفاتورة */}
          <div className={`${cardCls} p-4 grid gap-3 md:grid-cols-3 xl:grid-cols-6`}>
            <div><label className={labelCls}>{t("Invoice no.", "رقم الفاتورة")}</label><input className={inputCls} disabled value={t("Auto on posting", "تلقائي عند الترحيل")} /></div>
            <div><label className={labelCls}>{t("Invoice date", "تاريخ الفاتورة")} *</label><input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} data-testid="inv-date" /></div>
            <div>
              <label className={labelCls}>{t("Sale type", "نوع البيع")} *</label>
              <select className={inputCls} value={payMode} onChange={(e) => { setPayMode(e.target.value as PayMode); setCollectNow(false); setPaidNow(""); }} data-testid="pay-mode">
                <option value="cash">{t("Cash", "نقدي")}</option><option value="credit">{t("Credit", "آجل")}</option>
              </select>
            </div>
            <div className="md:col-span-2 relative">
              <label className={labelCls}>{t("Customer", "العميل")} {payMode === "credit" ? "*" : ""}</label>
              <div className="relative">
                <User size={15} className="absolute top-1/2 -translate-y-1/2 start-3 text-slate-500" />
                <input className={`${inputCls} ps-9`} data-testid="cust-input" placeholder={t("Name, phone, tax no. or id…", "الاسم أو الجوال أو الرقم الضريبي أو الرقم…")}
                  value={custOpen ? custQ : (customer?.name ?? custQ)} onFocus={() => { setCustOpen(true); setCustQ(""); }} onChange={(e) => { setCustQ(e.target.value); setCustOpen(true); }} onBlur={() => window.setTimeout(() => setCustOpen(false), 150)} />
                <ChevronDown size={15} className="absolute top-1/2 -translate-y-1/2 end-3 text-slate-500" />
              </div>
              {custOpen && (
                <div className="absolute z-30 mt-1 w-full max-h-64 overflow-auto bg-slate-900 border border-slate-700 rounded-xl shadow-xl" data-testid="cust-list">
                  <button type="button" className="w-full text-start px-3 py-2 text-sm hover:bg-slate-800 text-slate-300" onMouseDown={(e) => { e.preventDefault(); setPartyId(""); setCustOpen(false); setCustQ(""); }}>{t("Cash customer (no account)", "عميل نقدي (بدون حساب)")}</button>
                  {custList.map((c) => (
                    <button type="button" key={c.id} className="w-full text-start px-3 py-2 text-sm hover:bg-slate-800 border-t border-slate-800" onMouseDown={(e) => { e.preventDefault(); setPartyId(c.id); setCustOpen(false); setCustQ(""); }}>
                      <div className="font-semibold">{c.name}</div>
                      <div className="text-xs text-slate-500" dir="ltr">#{c.id}{c.phone ? ` · ${c.phone}` : ""}{c.tax_number ? ` · VAT ${c.tax_number}` : ""}</div>
                    </button>
                  ))}
                  {!custList.length && <div className="px-3 py-2 text-sm text-slate-500">{t("No matches", "لا نتائج")}</div>}
                </div>
              )}
            </div>
            <div>
              <label className={labelCls}>{t("Branch", "الفرع")} *</label>
              <select className={inputCls} value={branchId ?? ""} onChange={(e) => changeBranch(Number(e.target.value))} data-testid="branch">
                {(branches || []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>{t("Warehouse", "المخزن")}</label>
              <select className={inputCls} value={warehouseId} onChange={(e) => { setWarehouseId(e.target.value === "" ? "" : Number(e.target.value)); setLines([]); }} data-testid="warehouse">
                <option value="">{warehouses.length ? t("All warehouses", "كل المخازن") : t("Branch stock", "مخزون الفرع")}</option>
                {warehouses.filter((w) => w.branch_id == null || w.branch_id === branchId).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            <div><label className={labelCls}>{t("Due date", "تاريخ الاستحقاق")}</label><input type="date" className={inputCls} value={dueDate} disabled={payMode === "cash"} onChange={(e) => { setDueDate(e.target.value); setDueTouched(true); }} data-testid="due-date" /></div>
            <div><label className={labelCls}>{t("Credit period (days)", "مدة الائتمان (يوم)")}</label><input className={inputCls} disabled dir="ltr" value={payMode === "credit" ? (customer ? String(creditDays) : "—") : "—"} /></div>
            <div>
              <label className={labelCls}>{t("Collection method", "طريقة التحصيل")} {payMode === "cash" || collectNow ? "*" : ""}</label>
              <select className={inputCls} value={treasuryId} onChange={(e) => setTreasuryId(e.target.value === "" ? "" : Number(e.target.value))} data-testid="treasury">
                <option value="">{t("Select treasury / bank", "اختر خزنة / بنك")}</option>
                {branchTreasuries.map((x) => <option key={x.id} value={x.id}>{x.name} — {x.kind === "bank" ? t("Bank", "بنك") : t("Cash", "نقدي")}</option>)}
              </select>
            </div>
            <div><label className={labelCls}>{t("Salesperson", "مندوب المبيعات")}</label><input className={inputCls} value={salesperson} onChange={(e) => setSalesperson(e.target.value)} /></div>
            <div><label className={labelCls}>{t("Customer reference", "مرجع العميل")}</label><input className={inputCls} dir="ltr" value={customerRef} onChange={(e) => setCustomerRef(e.target.value)} /></div>
            <div className="flex items-end"><label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={taxInclusive} onChange={(e) => setTaxInclusive(e.target.checked)} data-testid="tax-inclusive" />{t("Prices include VAT", "الأسعار شاملة الضريبة")}</label></div>
            {customer && (
              <div className="md:col-span-3 xl:col-span-6 text-sm rounded-lg bg-slate-800/60 border border-slate-700 px-3 py-2 flex flex-wrap gap-x-6 gap-y-1" data-testid="cust-info">
                <span><b>{customer.name}</b></span>
                <span>{t("Credit days", "مدة الائتمان")}: <b dir="ltr">{creditDays}</b></span>
                <span>{t("Balance", "الرصيد")}: <b dir="ltr" className={balance != null && balance > 0 ? "text-amber-300" : "text-emerald-300"}>{balance == null ? "…" : `${fmt(Math.abs(balance))} ${currency} ${balance > 0 ? t("(owed to us)", "(مدين)") : balance < 0 ? t("(credit)", "(دائن)") : ""}`}</b></span>
                {!receivableAcc && <span className="text-red-300">{t("No receivable account", "بلا حساب ذمة")}</span>}
              </div>
            )}
          </div>

          {/* الأصناف */}
          <div className={`${cardCls} p-4 space-y-3`}>
            <div className="relative">
              <Search size={16} className="absolute top-1/2 -translate-y-1/2 start-3 text-slate-500" />
              <ScanLine size={16} className="absolute top-1/2 -translate-y-1/2 end-3 text-slate-500" />
              <input ref={searchRef} className={`${inputCls} ps-9 pe-9`} data-testid="prod-search" placeholder={t("Search by code, name (Arabic/English) or barcode…", "ابحث بالكود أو الاسم (عربي/إنجليزي) أو الباركود…")}
                value={prodQ} onFocus={() => setProdOpen(true)} onChange={(e) => { setProdQ(e.target.value); setProdOpen(true); }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void onSearchEnter(); } if (e.key === "Escape") setProdOpen(false); }} />
              {prodOpen && prodQ.trim() && (
                <div className="absolute z-30 mt-1 w-full max-h-72 overflow-auto bg-slate-900 border border-slate-700 rounded-xl shadow-xl" data-testid="prod-list">
                  {prodBusy && <div className="px-3 py-2 text-sm text-slate-500">{t("Searching…", "جارٍ البحث…")}</div>}
                  {!prodBusy && !prodRes.length && <div className="px-3 py-2 text-sm text-slate-500">{t("No matching products in this branch", "لا أصناف مطابقة في هذا الفرع")}</div>}
                  {prodRes.map((p) => {
                    const sp = API.sellPrice(p); const out = p.quantity <= 0;
                    return (
                      <button type="button" key={p.id} disabled={out} onClick={() => addProduct(p)} data-testid="prod-item" className="w-full text-start px-3 py-2 text-sm hover:bg-slate-800 border-t border-slate-800 first:border-t-0 disabled:opacity-40 flex items-center justify-between gap-3">
                        <span><span className="font-semibold">{p.product_name}</span><span className="block text-xs text-slate-500" dir="ltr">{p.product_code ?? "—"}{p.barcode ? ` · ${p.barcode}` : ""}{p.brand ? ` · ${p.brand}` : ""}</span></span>
                        <span className="text-xs text-end shrink-0"><span className={out ? "text-red-400" : "text-emerald-400"}>{out ? t("Out of stock", "نفد") : `${t("Stock", "المتاح")} ${p.quantity}`}</span><span className="block text-slate-300" dir="ltr">{fmt(sp.price)} {currency}{sp.fromCost ? ` (${t("cost", "تكلفة")})` : ""}</span></span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="w-full text-sm min-w-[860px]" data-testid="lines-table">
                <thead className="bg-slate-800/70 text-slate-300 text-xs">
                  <tr>
                    <th className="p-2 w-10">#</th><th className="p-2 text-start">{t("Code", "الكود")}</th><th className="p-2 text-start">{t("Item", "اسم الصنف")}</th><th className="p-2">{t("Unit", "الوحدة")}</th>
                    <th className="p-2 w-24">{t("Qty", "الكمية")}</th><th className="p-2 w-28">{t("Unit price", "سعر الوحدة")}</th><th className="p-2 w-24">{t("Disc. %", "الخصم %")}</th>
                    <th className="p-2 w-24">{t("VAT", "الضريبة")}</th><th className="p-2 w-28">{t("Total", "الإجمالي")}</th><th className="p-2 w-10" />
                  </tr>
                </thead>
                <tbody>
                  {totals.lines.map((l, i) => {
                    const err = issueOf(l.key);
                    return (
                      <tr key={l.key} className={`border-t border-slate-800 ${err ? "bg-red-500/5" : ""}`} data-testid="line-row">
                        <td className="p-2 text-center text-slate-500">{i + 1}</td>
                        <td className="p-2" dir="ltr">{l.code ?? "—"}</td>
                        <td className="p-2"><div className="font-semibold">{l.name}</div><div className="text-[11px] text-slate-500">{t("Stock", "المتاح")}: {l.stock}{l.unitPrice < l.cost ? <span className="text-amber-400"> · {t("below cost", "أقل من التكلفة")}</span> : null}</div>{err && <div className="text-[11px] text-red-400" data-testid="line-error">{err}</div>}</td>
                        <td className="p-2 text-center text-slate-400">{l.unit ?? "—"}</td>
                        <td className="p-2"><input type="number" min={1} step={1} dir="ltr" className={`${inputCls} text-center`} data-testid="qty" value={Number.isFinite(l.qty) ? l.qty : ""} onChange={(e) => patchLine(l.key, { qty: e.target.value === "" ? NaN : Number(e.target.value) })} /></td>
                        <td className="p-2"><input type="number" min={0} step="0.01" dir="ltr" className={`${inputCls} text-center`} data-testid="price" value={Number.isFinite(l.unitPrice) ? l.unitPrice : ""} onChange={(e) => patchLine(l.key, { unitPrice: e.target.value === "" ? NaN : Number(e.target.value) })} /></td>
                        <td className="p-2"><input type="number" min={0} max={100} step="0.01" dir="ltr" className={`${inputCls} text-center`} data-testid="disc" value={Number.isFinite(l.discountPct) ? l.discountPct : ""} onChange={(e) => patchLine(l.key, { discountPct: e.target.value === "" ? NaN : Number(e.target.value) })} /></td>
                        <td className="p-2 text-center" dir="ltr">{fmt(l.vat)}</td>
                        <td className="p-2 text-center font-bold" dir="ltr" data-testid="line-total">{fmt(l.total)}</td>
                        <td className="p-2 text-center"><button className="text-red-400 hover:text-red-300" onClick={() => removeLine(l.key)} aria-label={t("Remove", "حذف")} data-testid="remove-line"><Trash2 size={16} /></button></td>
                      </tr>
                    );
                  })}
                  {!lines.length && <tr><td colSpan={10} className="p-8 text-center text-slate-500">{t("Search and add items to start the invoice.", "ابحث عن صنف وأضفه لبدء الفاتورة.")}</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          {/* الملخص والتحصيل والملاحظات */}
          <div className="grid gap-4 lg:grid-cols-3">
            <div className={`${cardCls} p-4`}>
              <h3 className="font-bold mb-3">{t("Notes", "ملاحظات")}</h3>
              <textarea className={`${inputCls} h-28`} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("Invoice notes…", "ملاحظات على الفاتورة…")} />
              <details className="mt-3 text-sm" open={revAcc === "" || (totals.tax > 0 && taxAcc === "")}>
                <summary className="cursor-pointer text-slate-400">{t("Accounting accounts", "الحسابات المحاسبية")}</summary>
                <div className="mt-2 space-y-2">
                  <div><label className={labelCls}>{t("Sales revenue account", "حساب إيراد المبيعات")} *</label>
                    <select className={inputCls} value={revAcc} onChange={(e) => setRevAcc(e.target.value === "" ? "" : Number(e.target.value))} data-testid="rev-acc"><option value="">{t("Select…", "اختر…")}</option>{revCandidates.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}</select></div>
                  <div><label className={labelCls}>{t("Output VAT account", "حساب ضريبة المخرجات")}</label>
                    <select className={inputCls} value={taxAcc} onChange={(e) => setTaxAcc(e.target.value === "" ? "" : Number(e.target.value))} data-testid="tax-acc"><option value="">{t("Select…", "اختر…")}</option>{taxCandidates.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}</select></div>
                </div>
              </details>
            </div>

            <div className={`${cardCls} p-4`}>
              <h3 className="font-bold mb-3 flex items-center gap-2"><Wallet size={16} className="text-blue-400" />{t("Collection", "التحصيل")}</h3>
              {payMode === "credit" && (
                <label className="flex items-center gap-2 text-sm mb-3"><input type="checkbox" checked={collectNow} onChange={(e) => { setCollectNow(e.target.checked); if (!e.target.checked) setPaidNow(""); }} data-testid="collect-now" />{t("Collect part now (partial payment)", "تحصيل جزء الآن (دفعة جزئية)")}</label>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div><label className={labelCls}>{t("Paid amount", "المبلغ المدفوع")}</label>
                  <input type="number" min={0} step="0.01" dir="ltr" className={inputCls} data-testid="paid" disabled={payMode === "cash" || !collectNow} value={payMode === "cash" ? fmt(totals.total).replace(/,/g, "") : paidNow} onChange={(e) => setPaidNow(e.target.value)} /></div>
                <div><label className={labelCls}>{t("Remaining", "المتبقي")}</label>
                  <div className="px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 font-bold text-sm" dir="ltr" data-testid="remaining">{fmt(remaining)} {currency}</div></div>
              </div>
              {payMode === "credit" && collectNow && (Number(paidNow) > totals.total) && <div className="text-xs text-red-400 mt-2">{t("Paid exceeds the invoice total.", "المدفوع أكبر من إجمالي الفاتورة.")}</div>}
            </div>

            <div className={`${cardCls} p-4 text-sm`} data-testid="totals">
              <div className="flex justify-between py-1.5 border-b border-slate-800"><span className="text-slate-400">{t("Items total (before VAT)", "إجمالي الأصناف (قبل الضريبة)")}</span><b dir="ltr" data-testid="t-subtotal">{fmt(totals.subtotal)}</b></div>
              <div className="flex justify-between py-1.5 border-b border-slate-800"><span className="text-slate-400">{t("Total discount", "إجمالي الخصم")}</span><b dir="ltr" className="text-red-300" data-testid="t-discount">({fmt(totals.discount)})</b></div>
              <div className="flex justify-between py-1.5 border-b border-slate-800"><span className="text-slate-400">{t(`VAT (${taxRate}%)`, `ضريبة القيمة المضافة (${taxRate}%)`)}</span><b dir="ltr" data-testid="t-vat">{fmt(totals.tax)}</b></div>
              <div className="flex justify-between mt-2 px-3 py-3 rounded-xl bg-blue-600/20 border border-blue-500/40 text-base"><b>{t("Invoice total", "إجمالي الفاتورة")}</b><b dir="ltr" data-testid="t-total">{fmt(totals.total)} {currency}</b></div>
            </div>
          </div>

          {/* شريط الإجراءات */}
          <div className="flex flex-wrap items-center justify-between gap-3 sticky bottom-0 bg-slate-950/90 backdrop-blur py-3 border-t border-slate-800">
            <div className="flex gap-2">
              <button className="px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm flex items-center gap-2" onClick={() => void previewDraft()} disabled={!lines.length} data-testid="preview"><Printer size={15} />{t("Print preview", "معاينة الطباعة")}</button>
              <button className="px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm flex items-center gap-2" onClick={() => void saveDraftClick()} data-testid="save-draft"><Save size={15} />{t("Save draft", "حفظ كمسودة")}</button>
            </div>
            <div className="flex gap-2">
              <button className="px-4 py-2 rounded-lg border border-red-500/40 text-red-300 text-sm flex items-center gap-2" onClick={() => { if (!lines.length || window.confirm(t("Discard this invoice?", "إلغاء هذه الفاتورة؟"))) resetForm(); }} data-testid="cancel"><X size={15} />{t("Cancel", "إلغاء")}</button>
              <button className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-bold flex items-center gap-2" onClick={() => void post()} disabled={!canPost} data-testid="post"><Check size={16} />{saving ? t("Posting…", "جارٍ الترحيل…") : t("Post invoice", "ترحيل الفاتورة")}</button>
            </div>
          </div>
        </>
      ) : (
        <div className="space-y-4">
          {drafts.length > 0 && (
            <div className={`${cardCls} p-4`}>
              <h3 className="font-bold mb-2">{t("Saved drafts", "المسودات المحفوظة")}</h3>
              <div className="space-y-1">
                {drafts.map((d) => (
                  <div key={d.id} className="flex items-center justify-between text-sm border-t border-slate-800 pt-1" data-testid="draft-row">
                    <span>{d.title || `#${d.id}`} <span className="text-xs text-slate-500" dir="ltr">{d.updated_at.slice(0, 16).replace("T", " ")}</span></span>
                    <span className="flex gap-3"><button className="text-blue-400" onClick={() => openDraft(d)}>{t("Open", "فتح")}</button><button className="text-red-400" onClick={async () => { await API.deleteDraft(org.id, d.id); void refreshDrafts(); }}>{t("Delete", "حذف")}</button></span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {draftsMissing && <div className="text-xs text-amber-300">{t("Drafts need migration P01.", "المسودات تحتاج هجرة P01.")}</div>}
          <div className={`${cardCls} p-4`}>
            <div className="flex flex-wrap gap-3 items-end mb-3">
              <div><label className={labelCls}>{t("From", "من")}</label><input type="date" className={inputCls} value={hFrom} onChange={(e) => setHFrom(e.target.value)} /></div>
              <div><label className={labelCls}>{t("To", "إلى")}</label><input type="date" className={inputCls} value={hTo} onChange={(e) => setHTo(e.target.value)} /></div>
              <div className="grow"><label className={labelCls}>{t("Search", "بحث")}</label><input className={inputCls} placeholder={t("Invoice no. or customer", "رقم الفاتورة أو العميل")} value={hQ} onChange={(e) => setHQ(e.target.value)} /></div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[760px]" data-testid="history-table">
                <thead className="text-xs text-slate-400 bg-slate-800/60"><tr>
                  <th className="p-2 text-start">{t("No.", "الرقم")}</th><th className="p-2 text-start">{t("Date", "التاريخ")}</th><th className="p-2 text-start">{t("Customer", "العميل")}</th><th className="p-2">{t("Payment", "الدفع")}</th>
                  <th className="p-2">{t("Total", "الإجمالي")}</th><th className="p-2">{t("Paid", "المدفوع")}</th><th className="p-2">{t("Remaining", "المتبقي")}</th><th className="p-2" /></tr></thead>
                <tbody>
                  {hLoading && <tr><td colSpan={8} className="p-6 text-center text-slate-500">{t("Loading…", "جارٍ التحميل…")}</td></tr>}
                  {!hLoading && shownHistory.map((i) => (
                    <tr key={i.id} className="border-t border-slate-800" data-testid="history-row">
                      <td className="p-2" dir="ltr">{i.invoice_no}/{i.invoice_year}</td><td className="p-2" dir="ltr">{i.date}</td><td className="p-2">{i.customer_name || t("Cash customer", "عميل نقدي")}</td>
                      <td className="p-2 text-center">{payLabel(i.payment_type)}</td><td className="p-2 text-center" dir="ltr">{fmt(i.total)}</td><td className="p-2 text-center" dir="ltr">{fmt(i.paid_amount)}</td>
                      <td className="p-2 text-center" dir="ltr">{fmt(r2(i.total - i.paid_amount))}</td>
                      <td className="p-2 text-center"><button className="text-blue-400" onClick={() => void printInvoice(i)}><Printer size={15} /></button></td>
                    </tr>
                  ))}
                  {!hLoading && !shownHistory.length && <tr><td colSpan={8} className="p-6 text-center text-slate-500">{t("No invoices in this period.", "لا فواتير في هذه الفترة.")}</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      <div className="text-[11px] text-slate-600">{user?.email ? user.email : ""}{" · "}{branchName(branchId)}{" · "}<Plus size={0} className="inline" /></div>
    </div>
  );
}
