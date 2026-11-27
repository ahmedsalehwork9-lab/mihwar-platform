// =============================================================
// src/pages/sales/SalesInvoicePage.tsx
// شاشة فاتورة المبيعات (إدخال + مسودات + سجل + طباعة).
// - نوع البيع (نقدي/آجل/آجل مع دفعة جزئية) مستقل عن طريقة الدفع (صندوق/تحويل بنكي/شبكة).
// - المستودع إلزامي من الفرع نفسه؛ الحسابات من جدول الربط gl_account_map (لا تخمين).
// - الترحيل عبر RPC ذرّية post_sales_invoice. لا تعديل مباشر لـ products.quantity.
// - اختصارات لوحة المفاتيح: F1 صنف · F2 عميل · F3 نوع البيع · F4 هامش الربح · F6 مستودع
//   F8 مسودة · F9 معاينة · F10 / Ctrl+Enter ترحيل · Esc إغلاق · ↑↓←→ تنقل بين الكمية والسعر والخصم · Enter التالي (Shift+Enter السابق).
// =============================================================
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, Trash2, Printer, Save, X, Check, ScanLine, FileText, History, RotateCcw, Wallet, AlertTriangle, User, ChevronDown, Keyboard, TrendingUp } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useOrgConfig } from "../../context/OrgConfigContext";
import { useLang } from "../../context/LanguageContext";
import * as DB from "../lib/accountingDb";
import type { GLAccount, GLParty, GLSalesInvoice, GLTreasury } from "../lib/accountingDb";
import { cashBankOptions } from "../lib/cashAccounts";
import { channelAssigned, limitToChannel } from "../lib/channelTreasury";
import * as API from "./salesInvoiceApi";
import type { DraftRow, MapRow, SaleProduct, WarehouseRow } from "./salesInvoiceApi";
import { addDays, buildTenders, computeInvoice, computeMargin, clampPct, daysBetween, r2, validateLines } from "./salesInvoiceCalc";
import type { InvoiceLine, PayMethod, SaleType } from "./salesInvoiceCalc";
import { buildInvoiceHTML, printHTML } from "./salesInvoicePrint";

const today = (): string => new Date().toISOString().slice(0, 10);
const monthStart = (): string => `${today().slice(0, 8)}01`;
const fmt = (n: number): string => (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Props = { onNavigate?: (p: string) => void; onSection?: (s: string) => void };

type DraftPayload = {
  v: 2; branchId: number | null; date: string; dueDate: string; saleType: SaleType; payMethod: PayMethod; treasuryId: number | ""; paidNow: string;
  partyId: number | ""; customerRef: string; salesperson: string; warehouseId: number | ""; notes: string; taxInclusive: boolean;
  lines: InvoiceLine[];
};

const inputCls = "w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500 disabled:opacity-50";
const labelCls = "block text-xs font-semibold text-slate-400 mb-1";
const cardCls = "bg-slate-900 border border-slate-800 rounded-2xl";
const kbd = "px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] font-mono text-slate-300";

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
  const [accMap, setAccMap] = useState<MapRow[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseRow[]>([]);
  const [whMissing, setWhMissing] = useState(false);

  // ── حالة النموذج ──
  const [branchId, setBranchId] = useState<number | null>(ownedShopId ?? null);
  const [date, setDate] = useState(today());
  const [dueDate, setDueDate] = useState("");
  const [dueTouched, setDueTouched] = useState(false);
  const [saleType, setSaleType] = useState<SaleType>("cash");
  const [payMethod, setPayMethod] = useState<PayMethod>("cash");
  const [treasuryId, setTreasuryId] = useState<number | "">("");
  const [paidNow, setPaidNow] = useState("");
  const [partyId, setPartyId] = useState<number | "">("");
  const [customerRef, setCustomerRef] = useState("");
  const [salesperson, setSalesperson] = useState("");
  const [warehouseId, setWarehouseId] = useState<number | "">("");
  const [notes, setNotes] = useState("");
  const [taxInclusive, setTaxInclusive] = useState(false);
  const [lines, setLines] = useState<InvoiceLine[]>([]);
  const [draftId, setDraftId] = useState<number | null>(null);
  const [showMargin, setShowMargin] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
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
  const [hi, setHi] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => { listRef.current?.querySelector<HTMLElement>('[data-hi="1"]')?.scrollIntoView({ block: "nearest" }); }, [hi, prodRes]);
  const searchSeq = useRef(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const custRef = useRef<HTMLInputElement>(null);
  const saleTypeRef = useRef<HTMLButtonElement>(null);
  const whRef = useRef<HTMLSelectElement>(null);
  const focusAfterAdd = useRef<number | null>(null);

  // ── العميل ──
  const [custQ, setCustQ] = useState("");
  const [custOpen, setCustOpen] = useState(false);
  const [custHi, setCustHi] = useState(0);
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
        const [accs, treas, pps, map, ready] = await Promise.all([
          DB.fetchAccounts(o.id), DB.fetchTreasuries(o.id), DB.fetchParties(o.id, "customer"), API.fetchAccountMap(o.id), API.probeSalesRpc(),
        ]);
        if (!alive) return;
        setAccounts(accs); setTreasuries(treas); setParties(pps); setAccMap(map.rows); setRpcReady(ready);
      }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [ownedShopId]);

  useEffect(() => { if (ownedShopId != null) setBranchId((b) => b ?? ownedShopId); }, [ownedShopId]);

  // مستودعات الفرع المحدد؛ الافتراضي يُختار تلقائيًا (والمستخدم يغيّره).
  useEffect(() => {
    let alive = true;
    if (!org || branchId == null) return;
    API.fetchBranchWarehouses(org.id, branchId).then((r) => {
      if (!alive) return;
      setWarehouses(r.rows); setWhMissing(r.missing);
      setWarehouseId((cur) => (cur !== "" && r.rows.some((w) => w.id === cur) ? cur : (r.rows.find((w) => w.is_default) ?? r.rows[0])?.id ?? ""));
    });
    return () => { alive = false; };
  }, [org, branchId]);

  const wh = useMemo(() => (warehouseId === "" ? null : warehouses.find((w) => w.id === warehouseId) ?? null), [warehouseId, warehouses]);

  // نفس منطق فاتورة المشتريات: أزرار (آجل/نقدي/جزئي/شبكة) + قائمة واحدة «الخزنة/البنك»
  // الحساب التجميعي لا يظهر، والصندوق/البنك غير التجميعي يظهر — القيمة = رقم الحساب في الدليل.
  const payMode: "credit" | "cash" | "partial" | "card" = saleType === "credit" ? "credit" : saleType === "partial_credit" ? "partial" : payMethod === "pos" ? "card" : "cash";
  const branchTreasuries = useMemo(() => treasuries.filter((x) => x.branch_id == null || x.branch_id === branchId), [treasuries, branchId]);
  const cashBank = useMemo(() => cashBankOptions(accounts, branchTreasuries), [accounts, branchTreasuries]);
  const payOptions = useMemo(() => {
    if (branchId == null) return payMode === "card" ? cashBank.filter((o) => o.kind === "bank") : cashBank;
    const cash = limitToChannel(cashBank, "cash", channelAssigned(accMap, branchId, "sales_cash"));
    const bank = limitToChannel(cashBank, "bank", channelAssigned(accMap, branchId, "sales_bank"));
    return payMode === "card" ? bank : [...cash, ...bank];
  }, [cashBank, payMode, accMap, branchId]);
  useEffect(() => {
    if (treasuryId !== "" && !payOptions.some((o) => o.id === treasuryId)) { setTreasuryId(""); return; }
    if (treasuryId === "" && saleType !== "credit" && payOptions.length) setTreasuryId(payOptions[0].id);
  }, [payOptions, treasuryId, saleType]);
  const payOpt = useMemo(() => (treasuryId === "" ? null : payOptions.find((o) => o.id === treasuryId) ?? null), [treasuryId, payOptions]);
  // طريقة الدفع الفعلية تُستنتج: شبكة → pos، وإلا بنك → تحويل، وإلا نقدي
  // الخادم يطابق الطريقة بنوع الخزنة المسجَّلة: pos ↔ kind=pos، bank_transfer ↔ kind=bank، cash ↔ kind=cash
  const effMethod: PayMethod = payOpt?.rawKind === "pos" ? "pos" : payOpt?.kind === "bank" ? "bank_transfer" : "cash";
  const payUnbacked = saleType !== "credit" && payOpt != null && !payOpt.backed;
  const setPayMode = (m: "credit" | "cash" | "partial" | "card"): void => {
    setSaleType(m === "credit" ? "credit" : m === "partial" ? "partial_credit" : "cash");
    setPayMethod(m === "card" ? "pos" : "cash"); setPaidNow("");
  };

  const revAcc = useMemo(() => API.resolveMapped(accMap, branchId, "revenue"), [accMap, branchId]);
  const taxAcc = useMemo(() => API.resolveMapped(accMap, branchId, "output_vat"), [accMap, branchId]);
  const accName = (id: number | null): string => { const a = accounts.find((x) => x.id === id); return a ? `${a.code} — ${a.name}` : id == null ? t("Not configured", "غير مهيأ") : `#${id}`; };

  const customer = useMemo(() => (partyId === "" ? null : parties.find((p) => p.id === partyId) ?? null), [partyId, parties]);
  const receivableAcc = useMemo(() => API.receivableAccountOf(customer, parties), [customer, parties]);
  const creditDays = Number(customer?.credit_days) || 0;
  const isCredit = saleType !== "cash";

  useEffect(() => {
    let alive = true;
    setBalance(null);
    if (!org || !receivableAcc) return;
    API.customerBalance(org.id, receivableAcc).then((n) => { if (alive) setBalance(n); }).catch(() => { if (alive) setBalance(null); });
    return () => { alive = false; };
  }, [org, receivableAcc, lastPosted]);

  useEffect(() => {
    if (isCredit && !dueTouched) setDueDate(creditDays > 0 ? addDays(date, creditDays) : "");
    if (!isCredit) { setDueDate(""); setDueTouched(false); }
  }, [isCredit, creditDays, date, dueTouched]);

  // ── الحسابات ──
  const totals = useMemo(() => computeInvoice(lines, taxRate, taxInclusive), [lines, taxRate, taxInclusive]);
  const margin = useMemo(() => computeMargin(totals, taxRate, taxInclusive), [totals, taxRate, taxInclusive]);
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

  const paidValue = saleType === "cash" ? totals.total : saleType === "partial_credit" ? r2(Number(paidNow) || 0) : 0;
  const remaining = r2(totals.total - paidValue);

  // ── بحث الأصناف (مؤجّل 200ms، يتجاهل الردود القديمة) ──
  useEffect(() => {
    const q = prodQ.trim();
    if (!q || branchId == null || warehouseId === "") { setProdRes([]); return; }
    const seq = ++searchSeq.current;
    const h = window.setTimeout(async () => {
      setProdBusy(true);
      const res = await API.searchProducts(branchId, q, warehouseId, Boolean(wh?.is_default));
      if (seq === searchSeq.current) { setProdRes(res); setProdBusy(false); setHi(0); }
    }, 200);
    return () => window.clearTimeout(h);
  }, [prodQ, branchId, warehouseId, wh]);

  const addProduct = (p: SaleProduct): void => {
    if (p.quantity <= 0) return;
    setMsg(null);
    focusAfterAdd.current = p.id;
    setLines((cur) => {
      const ex = cur.find((l) => l.productId === p.id);
      if (ex) return cur.map((l) => (l.productId === p.id ? { ...l, qty: Math.min((Number(l.qty) || 0) + 1, Math.max(p.quantity, 1)), stock: p.quantity } : l));
      const sp = API.sellPrice(p);
      return [...cur, { key: `${p.id}-${Date.now()}`, productId: p.id, code: p.product_code, name: p.product_name, barcode: p.barcode, unit: p.unit, stock: p.quantity, cost: p.cost, qty: 1, unitPrice: sp.price, discountPct: 0 }];
    });
    setProdQ(""); setProdRes([]); setProdOpen(false);
  };

  // بعد إضافة صنف: ننقل المؤشر إلى خانة كميته ونحدّد القيمة لتُكتب فورًا
  useEffect(() => {
    const id = focusAfterAdd.current;
    if (id == null) return;
    const l = lines.find((x) => x.productId === id);
    if (!l) return;
    focusAfterAdd.current = null;
    const el = document.querySelector<HTMLInputElement>(`[data-cell="qty"][data-row="${l.key}"]`);
    el?.focus(); el?.select();
  }, [lines]);

  const onSearchKey = async (e: React.KeyboardEvent<HTMLInputElement>): Promise<void> => {
    if (e.key === "ArrowDown") { e.preventDefault(); setProdOpen(true); setHi((h) => Math.min(h + 1, Math.max(prodRes.length - 1, 0))); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    else if (e.key === "Escape") { setProdOpen(false); }
    else if (e.key === "Enter") {
      e.preventDefault();
      const q = prodQ.trim();
      if (!q || branchId == null || warehouseId === "") return;
      const exact = await API.findProductExact(branchId, q, warehouseId, Boolean(wh?.is_default));
      if (exact) { addProduct(exact); return; }
      const pick = prodRes[hi] ?? prodRes[0];
      if (pick) addProduct(pick);
    }
  };

  const patchLine = (key: string, patch: Partial<InvoiceLine>): void => setLines((cur) => cur.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const removeLine = (key: string): void => setLines((cur) => cur.filter((l) => l.key !== key));

  // تنقل الشبكة: Enter يتقدّم (كمية → سعر → خصم → بحث)، الأسهم تتحرك بين الصفوف والأعمدة
  const COLS = ["qty", "price", "disc"] as const;
  const onCellKey = (e: React.KeyboardEvent<HTMLInputElement>, rowIdx: number, col: (typeof COLS)[number]): void => {
    const go = (r: number, c: number): void => {
      const row = totals.lines[r]; if (!row) return;
      const el = document.querySelector<HTMLInputElement>(`[data-cell="${COLS[c]}"][data-row="${row.key}"]`);
      if (el) { el.focus(); el.select(); }
    };
    const c = COLS.indexOf(col);
    // اتجاه الصفحة: في العربية (RTL) اليسار = العمود التالي (كمية → سعر → خصم)، وفي الإنجليزية اليمين.
    const rtl = getComputedStyle(e.currentTarget.closest("tr") ?? e.currentTarget).direction === "rtl";
    const nextKey = rtl ? "ArrowLeft" : "ArrowRight", prevKey = rtl ? "ArrowRight" : "ArrowLeft";
    if (e.key === "Enter" && e.shiftKey) { e.preventDefault(); if (c > 0) go(rowIdx, c - 1); else go(rowIdx - 1, COLS.length - 1); }
    else if (e.key === "Enter") { e.preventDefault(); if (c < COLS.length - 1) go(rowIdx, c + 1); else { searchRef.current?.focus(); } }
    else if (e.key === nextKey) { e.preventDefault(); if (c < COLS.length - 1) go(rowIdx, c + 1); }
    else if (e.key === prevKey) { e.preventDefault(); if (c > 0) go(rowIdx, c - 1); }
    else if (e.key === "ArrowDown") { e.preventDefault(); go(rowIdx + 1, c); }
    else if (e.key === "ArrowUp") { e.preventDefault(); go(rowIdx - 1, c); }
    else if (e.key === "Delete" && e.ctrlKey) { e.preventDefault(); removeLine(totals.lines[rowIdx].key); searchRef.current?.focus(); }
  };

  const changeBranch = (id: number): void => {
    if (id === branchId) return;
    if (lines.length && !window.confirm(t("Changing the branch clears the lines (stock is per branch). Continue?", "تغيير الفرع يمسح الأصناف (المخزون لكل فرع). متابعة؟"))) return;
    setLines([]); setBranchId(id); setTreasuryId(""); setWarehouseId("");
  };
  const changeWarehouse = (id: number | ""): void => {
    if (id === warehouseId) return;
    if (lines.length && !window.confirm(t("Changing the warehouse clears the lines. Continue?", "تغيير المستودع يمسح الأصناف. متابعة؟"))) return;
    setLines([]); setWarehouseId(id);
  };

  const resetForm = (): void => {
    setLines([]); setPartyId(""); setCustQ(""); setCustomerRef(""); setSalesperson(""); setNotes(""); setPaidNow("");
    setDate(today()); setDueDate(""); setDueTouched(false); setSaleType("cash"); setDraftId(null); setTaxInclusive(false);
    idemKey.current = API.newIdempotencyKey(); setMsg(null);
  };

  // ── المسودات ──
  const refreshDrafts = useCallback(async () => {
    if (!org) return;
    const r = await API.listDrafts(org.id, null);
    setDrafts(r.rows); setDraftsMissing(r.missing);
  }, [org]);
  useEffect(() => { void refreshDrafts(); }, [refreshDrafts]);

  const snapshot = (): DraftPayload => ({ v: 2, branchId, date, dueDate, saleType, payMethod, treasuryId, paidNow, partyId, customerRef, salesperson, warehouseId, notes, taxInclusive, lines });

  const saveDraftClick = async (): Promise<void> => {
    if (!org) return;
    if (!lines.length) { setMsg({ kind: "err", text: t("Add at least one item before saving a draft.", "أضف صنفًا واحدًا على الأقل قبل حفظ المسودة.") }); return; }
    const title = `${customer?.name ?? t("Cash customer", "عميل نقدي")} — ${fmt(totals.total)}`;
    const r = await API.saveDraft(org.id, branchId, draftId, title, snapshot());
    if (!r.ok) { setMsg({ kind: "err", text: draftsMissing || /does not exist|schema cache/i.test(r.error || "") ? t("Drafts table is not installed yet.", "جدول المسودات غير مُركَّب بعد.") : (r.error || "") }); return; }
    setDraftId(r.id ?? null);
    setMsg({ kind: "ok", text: t("Draft saved. No stock or ledger impact.", "تم حفظ المسودة. لا أثر على المخزون أو الدفتر.") });
    void refreshDrafts();
  };

  const openDraft = (d: DraftRow): void => {
    const p = d.payload as Partial<DraftPayload> | null;
    if (!p || p.v !== 2) { setMsg({ kind: "err", text: t("Unsupported draft format (saved by an older version).", "صيغة مسودة غير مدعومة (محفوظة بإصدار أقدم).") }); return; }
    setBranchId(p.branchId ?? ownedShopId ?? null); setDate(p.date || today()); setDueDate(p.dueDate || ""); setDueTouched(Boolean(p.dueDate));
    setSaleType(p.saleType ?? "cash"); setPayMethod(p.payMethod ?? "cash"); setTreasuryId(p.treasuryId ?? ""); setPaidNow(p.paidNow || "");
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
    if (warehouseId === "") { setMsg({ kind: "err", text: t("Select the warehouse.", "اختر المستودع.") }); return; }
    if (revAcc == null) { setMsg({ kind: "err", text: t("Sales revenue account is not mapped for this branch/organization. Posting is blocked.", "حساب إيراد المبيعات غير مربوط لهذا الفرع/المؤسسة. الترحيل ممنوع.") }); return; }
    if (totals.tax > 0 && taxAcc == null) { setMsg({ kind: "err", text: t("Output VAT account is not mapped. Posting is blocked.", "حساب ضريبة المخرجات غير مربوط. الترحيل ممنوع.") }); return; }
    if (payUnbacked) { setMsg({ kind: "err", text: t("The selected cash/bank account is not registered as a treasury for this branch. Open Company & Branch Settings → Accounting link → Cash drawer & bank account and save it, then retry.", "حساب الخزنة/البنك المختار غير مسجَّل كخزنة لهذا الفرع. افتح «إعدادات الشركة والفروع» ← «الربط المحاسبي» ← «الخزنة والحساب البنكي» واحفظه ثم أعد المحاولة.") }); return; }
    if (isCredit) {
      if (!customer) { setMsg({ kind: "err", text: t("Select a customer for credit sales.", "اختر العميل للبيع الآجل.") }); return; }
      if (!receivableAcc) { setMsg({ kind: "err", text: t("This customer has no receivable account.", "هذا العميل بلا حساب ذمة.") }); return; }
      if (creditDays <= 0 && !dueDate) { setMsg({ kind: "err", text: t("Set the customer's credit days or a due date.", "حدّد مدة ائتمان العميل أو تاريخ استحقاق.") }); return; }
      if (dueDate && daysBetween(date, dueDate) < 0) { setMsg({ kind: "err", text: t("Due date is before the invoice date.", "تاريخ الاستحقاق قبل تاريخ الفاتورة.") }); return; }
    }
    const tn = buildTenders({ saleType, total: totals.total, paidNow: paidValue, method: effMethod, paymentAccountId: payOpt?.id ?? null, receivableAccountId: receivableAcc });
    if (!tn.ok) {
      const text = tn.error === "treasury" ? t("Select the payment treasury/bank/POS account.", "اختر حساب الدفع (خزنة/بنك/شبكة).") : tn.error === "receivable" ? t("Customer receivable account is missing.", "حساب ذمة العميل غير موجود.") : t("Partial payment must be greater than 0 and less than the invoice total.", "الدفعة الجزئية يجب أن تكون أكبر من صفر وأقل من إجمالي الفاتورة.");
      setMsg({ kind: "err", text }); return;
    }
    postingRef.current = true; setSaving(true);
    const res = await API.postSalesInvoice(org.id, {
      idempotency_key: idemKey.current, branch_id: branchId, date, due_date: isCredit && dueDate ? dueDate : null,
      party_id: customer?.id ?? null, customer_name: customer?.name ?? null, customer_ref: customerRef.trim() || null, salesperson: salesperson.trim() || null,
      warehouse_id: warehouseId, notes: notes.trim() || null, tax_rate: taxRate, tax_inclusive: taxInclusive, sale_type: saleType,
      revenue_account_id: revAcc, tax_account_id: taxAcc, expected_total: totals.total, source: "sales_entry",
      items: totals.lines.map((l) => ({ product_id: l.productId, qty: l.qty, unit_price: l.unitPrice, discount_pct: clampPct(l.discountPct) })),
      tenders: tn.tenders,
    });
    postingRef.current = false; setSaving(false);
    if (!res.ok) {
      const text = res.code === "not_installed" ? t("The posting function is not installed in the database. Nothing was saved.", "دالة الترحيل غير مُركَّبة في قاعدة البيانات. لم يُحفظ شيء.")
        : res.code === "stock" ? t("Insufficient stock — refresh and adjust quantities. Nothing was saved.", "المخزون غير كافٍ — حدّث وعدّل الكميات. لم يُحفظ شيء.") + ` (${res.error})`
        : res.code === "mapping" ? t("Account mapping is missing or different. Nothing was saved: ", "ربط الحسابات ناقص أو مختلف. لم يُحفظ شيء: ") + res.error
        : res.code === "warehouse" ? t("Invalid warehouse for this branch. Nothing was saved: ", "مستودع غير صالح لهذا الفرع. لم يُحفظ شيء: ") + res.error
        : res.code === "payment" ? t("Payment method/account mismatch. Nothing was saved: ", "عدم تطابق طريقة الدفع والحساب. لم يُحفظ شيء: ") + res.error
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

  const payLabel = (pt: string): string => pt === "cash" ? t("Cash", "نقدي") : pt === "bank_transfer" ? t("Bank transfer", "تحويل بنكي") : pt === "pos" ? t("POS / Card", "شبكة") : pt === "card" ? t("Card/Bank", "شبكة/بنك") : pt === "credit" ? t("Credit", "آجل") : pt === "partial" ? t("Partial", "جزئي") : t("Split", "مقسّم");

  const printInvoice = async (inv: GLSalesInvoice): Promise<void> => {
    if (!org) return;
    const info = await API.fetchPrintOrg(org.id, inv.branch_id ?? branchId);
    const ext = inv as GLSalesInvoice & { due_date?: string | null; customer_ref?: string | null; salesperson?: string | null; discount_total?: number | null };
    printHTML(buildInvoiceHTML(inv, info, { dueDate: ext.due_date ?? null, customerRef: ext.customer_ref ?? null, salesperson: ext.salesperson ?? null, discountTotal: Number(ext.discount_total) || 0, paymentLabel: payLabel(inv.payment_type), currency }, lang === "ar" ? "ar" : "en"));
  };

  const previewDraft = async (): Promise<void> => {
    if (!org || !lines.length) return;
    const info = await API.fetchPrintOrg(org.id, branchId);
    const pseudo = {
      id: 0, organization_id: org.id, branch_id: branchId, invoice_no: 0, invoice_year: Number(date.slice(0, 4)), date, party_id: customer?.id ?? null,
      customer_name: customer?.name ?? null, payment_type: saleType === "cash" ? effMethod : saleType === "credit" ? "credit" : "partial", treasury_account_id: null, paid_amount: paidValue, subtotal: totals.subtotal, tax_rate: taxRate,
      tax_amount: totals.tax, tax_inclusive: taxInclusive, total: totals.total, notes: notes || null, entry_id: null, status: "draft",
      items: totals.lines.map((l) => ({ description: l.name, product_code: l.code, qty: l.qty, unit_price: l.unitPrice, line_total: l.net, discount_pct: l.discountPct, discount_amount: l.discount, list_price: l.unitPrice })),
    } as unknown as GLSalesInvoice;
    printHTML(buildInvoiceHTML(pseudo, info, { dueDate: dueDate || null, customerRef: customerRef || null, salesperson: salesperson || null, discountTotal: totals.discount, paymentLabel: payLabel(saleType === "cash" ? effMethod : saleType === "credit" ? "credit" : "partial"), currency }, lang === "ar" ? "ar" : "en"));
  };

  const goReturns = (): void => { onSection?.("sales-returns"); onNavigate?.("accounting"); };
  const goReceipts = (): void => { onSection?.("treasury"); onNavigate?.("accounting"); };

  const shownHistory = useMemo(() => {
    const q = hQ.trim().toLowerCase();
    if (!q) return history;
    return history.filter((i) => String(i.invoice_no).includes(q) || (i.customer_name || "").toLowerCase().includes(q));
  }, [history, hQ]);

  const custList = useMemo(() => API.filterCustomers(parties, custQ), [parties, custQ]);
  const pickCustomer = (id: number | ""): void => { setPartyId(id); setCustOpen(false); setCustQ(""); };

  // ── اختصارات لوحة المفاتيح العامة ──
  const postRef = useRef(post); postRef.current = post;
  const draftRef = useRef(saveDraftClick); draftRef.current = saveDraftClick;
  const previewRef = useRef(previewDraft); previewRef.current = previewDraft;
  useEffect(() => {
    if (tab !== "new") return;
    const h = (e: KeyboardEvent): void => {
      const k = e.key;
      if (k === "F1") { e.preventDefault(); searchRef.current?.focus(); setProdOpen(true); }
      else if (k === "F2") { e.preventDefault(); custRef.current?.focus(); }
      else if (k === "F3") { e.preventDefault(); saleTypeRef.current?.focus(); }
      else if (k === "F4") { e.preventDefault(); setShowMargin((v) => !v); }
      else if (k === "F6") { e.preventDefault(); whRef.current?.focus(); }
      else if (k === "F8") { e.preventDefault(); void draftRef.current(); }
      else if (k === "F9") { e.preventDefault(); void previewRef.current(); }
      else if (k === "F10" || (k === "Enter" && e.ctrlKey)) { e.preventDefault(); void postRef.current(); }
      else if (k === "Escape") { setProdOpen(false); setCustOpen(false); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [tab]);

  const canPost = !saving && lines.length > 0 && rpcReady !== false && !loading && warehouseId !== "";

  if (loading) return <div className="p-10 text-center text-slate-400" dir={dir}>{t("Loading…", "جارٍ التحميل…")}</div>;
  if (!org) return <div className="p-10 text-center text-slate-400" dir={dir}>{t("No organization is linked to this branch.", "لا توجد مؤسسة مرتبطة بهذا الفرع.")}</div>;

  const showPicker = prodOpen && prodQ.trim().length > 0;

  return (
    <div className="p-4 lg:p-6 min-h-screen text-slate-100 space-y-4" dir={dir} data-testid="sales-invoice-page">
      {/* العنوان */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs text-slate-500">{t("Sales", "المبيعات")} / {t("New sales invoice", "فاتورة مبيعات جديدة")}</div>
          <h1 className="text-xl font-bold flex items-center gap-2"><FileText size={22} className="text-blue-400" />{t("New Sales Invoice", "فاتورة مبيعات جديدة")}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setTab("new")} className={`px-4 py-2 rounded-lg text-sm font-semibold border ${tab === "new" ? "bg-blue-600 border-blue-500 text-white" : "bg-slate-800 border-slate-700 text-slate-300"}`}>{t("New invoice", "فاتورة جديدة")}</button>
          <button onClick={() => setTab("history")} data-testid="tab-history" className={`px-4 py-2 rounded-lg text-sm font-semibold border flex items-center gap-1 ${tab === "history" ? "bg-blue-600 border-blue-500 text-white" : "bg-slate-800 border-slate-700 text-slate-300"}`}><History size={15} />{t("Invoices list", "قائمة الفواتير")}</button>
          <button onClick={goReturns} className="px-3 py-2 rounded-lg text-sm bg-slate-800 border border-slate-700 text-slate-300 flex items-center gap-1"><RotateCcw size={15} />{t("Returns", "المرتجعات")}</button>
          <button onClick={goReceipts} className="px-3 py-2 rounded-lg text-sm bg-slate-800 border border-slate-700 text-slate-300 flex items-center gap-1"><Wallet size={15} />{t("Receipts", "التحصيلات")}</button>
          <button onClick={() => setShowKeys((v) => !v)} data-testid="keys-toggle" className="px-3 py-2 rounded-lg text-sm bg-slate-800 border border-slate-700 text-slate-300 flex items-center gap-1"><Keyboard size={15} />{t("Shortcuts", "الاختصارات")}</button>
        </div>
      </div>

      {showKeys && (
        <div className="rounded-xl border border-slate-700 bg-slate-900 p-3 text-xs text-slate-300 grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-4" data-testid="keys-help">
          <span><span className={kbd}>F1</span> {t("Search item", "بحث صنف")}</span><span><span className={kbd}>F2</span> {t("Customer", "العميل")}</span>
          <span><span className={kbd}>F3</span> {t("Sale type", "نوع البيع")}</span><span><span className={kbd}>F4</span> {t("Profit margin", "هامش الربح")}</span>
          <span><span className={kbd}>F6</span> {t("Warehouse", "المستودع")}</span><span><span className={kbd}>F8</span> {t("Save draft", "حفظ مسودة")}</span>
          <span><span className={kbd}>F9</span> {t("Print preview", "معاينة الطباعة")}</span><span><span className={kbd}>F10</span> / <span className={kbd}>Ctrl+Enter</span> {t("Post", "ترحيل")}</span>
          <span><span className={kbd}>↑ ↓</span> {t("Move in list / grid", "تنقل في القائمة/الجدول")}</span><span><span className={kbd}>Enter</span> {t("Add / next field", "إضافة / الحقل التالي")}</span>
          <span><span className={kbd}>Ctrl+Del</span> {t("Delete row", "حذف السطر")}</span><span><span className={kbd}>Esc</span> {t("Close list", "إغلاق القائمة")}</span>
        </div>
      )}

      {rpcReady === false && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-200 text-sm p-3 flex gap-2" data-testid="rpc-missing">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <span>{t("Posting is disabled: the database function post_sales_invoice is not installed.", "الترحيل معطّل: دالة قاعدة البيانات post_sales_invoice غير مُركَّبة.")}</span>
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
            <div className="md:col-span-2">
              <label className={labelCls}>{t("Payment type", "نوع البيع / الدفع")} * <span className={kbd}>F3</span></label>
              <div className="grid grid-cols-4 gap-1.5" role="group" data-testid="sale-type">
                {([["credit", "Credit", "آجل"], ["cash", "Cash", "نقدي"], ["partial", "Partial", "جزئي"], ["card", "Card", "شبكة"]] as const).map(([k, en, ar]) => (
                  <button key={k} type="button" ref={k === "cash" ? saleTypeRef : undefined} onClick={() => setPayMode(k)} aria-pressed={payMode === k} data-testid={`pay-mode-${k}`}
                    className={`rounded-lg px-2 py-2 text-sm font-bold border transition-colors ${payMode === k ? "bg-blue-600 border-blue-500 text-white" : "bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-500"}`}>{t(en, ar)}</button>
                ))}
              </div>
            </div>
            <div className="md:col-span-2 relative">
              <label className={labelCls}>{t("Customer", "العميل")} {isCredit ? "*" : ""} <span className={kbd}>F2</span></label>
              <div className="relative">
                <User size={15} className="absolute top-1/2 -translate-y-1/2 start-3 text-slate-500" />
                <input ref={custRef} className={`${inputCls} ps-9`} data-testid="cust-input" placeholder={t("Name, phone, tax no. or id…", "الاسم أو الجوال أو الرقم الضريبي أو الرقم…")}
                  value={custOpen ? custQ : (customer?.name ?? custQ)} onFocus={() => { setCustOpen(true); setCustQ(""); setCustHi(0); }}
                  onChange={(e) => { setCustQ(e.target.value); setCustOpen(true); setCustHi(0); }} onBlur={() => window.setTimeout(() => setCustOpen(false), 150)}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown") { e.preventDefault(); setCustHi((h) => Math.min(h + 1, custList.length)); }
                    else if (e.key === "ArrowUp") { e.preventDefault(); setCustHi((h) => Math.max(h - 1, 0)); }
                    else if (e.key === "Enter") { e.preventDefault(); if (custHi === 0) pickCustomer(""); else if (custList[custHi - 1]) pickCustomer(custList[custHi - 1].id); searchRef.current?.focus(); }
                  }} />
                <ChevronDown size={15} className="absolute top-1/2 -translate-y-1/2 end-3 text-slate-500" />
              </div>
              {custOpen && (
                <div className="absolute z-30 mt-1 w-full max-h-64 overflow-auto bg-slate-900 border border-slate-700 rounded-xl shadow-xl" data-testid="cust-list">
                  <button type="button" className={`w-full text-start px-3 py-2 text-sm hover:bg-slate-800 text-slate-300 ${custHi === 0 ? "bg-slate-800" : ""}`} onMouseDown={(e) => { e.preventDefault(); pickCustomer(""); }}>{t("Cash customer (no account)", "عميل نقدي (بدون حساب)")}</button>
                  {custList.map((c, i) => (
                    <button type="button" key={c.id} className={`w-full text-start px-3 py-2 text-sm hover:bg-slate-800 border-t border-slate-800 ${custHi === i + 1 ? "bg-slate-800" : ""}`} onMouseDown={(e) => { e.preventDefault(); pickCustomer(c.id); }}>
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
              <label className={labelCls}>{t("Warehouse", "المستودع")} * <span className={kbd}>F6</span></label>
              <select ref={whRef} className={inputCls} value={warehouseId} onChange={(e) => changeWarehouse(e.target.value === "" ? "" : Number(e.target.value))} data-testid="warehouse">
                {!warehouses.length && <option value="">{whMissing ? t("Warehouses not installed", "المستودعات غير مُركَّبة") : t("No active warehouse in this branch", "لا يوجد مستودع نشط في هذا الفرع")}</option>}
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}{w.code ? ` (${w.code})` : ""}</option>)}
              </select>
            </div>
            <div><label className={labelCls}>{t("Due date", "تاريخ الاستحقاق")}</label><input type="date" className={inputCls} value={dueDate} disabled={!isCredit} onChange={(e) => { setDueDate(e.target.value); setDueTouched(true); }} data-testid="due-date" /></div>
            <div><label className={labelCls}>{t("Credit period (days)", "مدة الائتمان (يوم)")}</label><input className={inputCls} disabled dir="ltr" value={isCredit ? (customer ? String(creditDays) : "—") : "—"} /></div>
            <div>
              <label className={labelCls}>{payMode === "card" ? t("Bank / terminal", "البنك/الشبكة") : t("Treasury / bank", "الخزنة/البنك")} {saleType !== "credit" ? "*" : ""}</label>
              <select className={inputCls} value={treasuryId} disabled={saleType === "credit"} onChange={(e) => setTreasuryId(e.target.value === "" ? "" : Number(e.target.value))} data-testid="treasury">
                <option value="">{t("— choose —", "— اختر —")}</option>
                {payOptions.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
              {payUnbacked && <div className="mt-1 text-[11px] text-amber-300" data-testid="pay-unbacked">{t("Not registered as a treasury for this branch — save it in Branch Settings → Accounting link.", "غير مسجَّل كخزنة لهذا الفرع — احفظه من إعدادات الفرع ← الربط المحاسبي.")}</div>}
            </div>
            {!warehouses.length && !whMissing && <div className="md:col-span-6 text-xs text-amber-300" data-testid="wh-link-hint">{t("No warehouse is linked to this branch. Open Company & Branch Settings → Warehouses and link one to this branch.", "لا يوجد مستودع مرتبط بهذا الفرع. افتح «إعدادات الشركة والفروع» ← «المخازن» واربط مستودعًا بهذا الفرع.")}</div>}
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

          {/* الأصناف — مساحة كبيرة للاختيار */}
          <div className={`${cardCls} p-4 space-y-3`}>
            <div className="relative">
              <Search size={18} className="absolute top-1/2 -translate-y-1/2 start-3 text-slate-500" />
              <ScanLine size={18} className="absolute top-1/2 -translate-y-1/2 end-3 text-slate-500" />
              <input ref={searchRef} className={`${inputCls} ps-10 pe-10 py-3 text-base`} data-testid="prod-search" placeholder={t("F1 · Search by code, name (Arabic/English) or barcode…", "F1 · ابحث بالكود أو الاسم (عربي/إنجليزي) أو الباركود…")}
                value={prodQ} onFocus={() => setProdOpen(true)} onChange={(e) => { setProdQ(e.target.value); setProdOpen(true); }} onKeyDown={(e) => void onSearchKey(e)} />
            </div>

            {showPicker && (
              <div className="rounded-xl border border-blue-500/40 bg-slate-950/60 overflow-hidden" data-testid="prod-list">
                <div className="flex items-center justify-between px-3 py-1.5 text-[11px] text-slate-400 bg-slate-800/60">
                  <span>{prodBusy ? t("Searching…", "جارٍ البحث…") : t(`${prodRes.length} result(s) · ${wh?.name ?? ""}`, `${prodRes.length} نتيجة · ${wh?.name ?? ""}`)}</span>
                  <span><span className={kbd}>↑↓</span> {t("move", "تنقل")} · <span className={kbd}>Enter</span> {t("add", "إضافة")} · <span className={kbd}>Esc</span> {t("close", "إغلاق")}</span>
                </div>
                <div className="max-h-[46vh] overflow-auto" ref={listRef}>
                  {!prodBusy && !prodRes.length && <div className="px-4 py-6 text-center text-sm text-slate-500">{t("No matching products in this warehouse", "لا أصناف مطابقة في هذا المستودع")}</div>}
                  {prodRes.map((p, i) => {
                    const out = p.quantity <= 0;
                    return (
                      <button type="button" key={p.id} disabled={out} onClick={() => addProduct(p)} onMouseEnter={() => setHi(i)} data-testid="prod-item" data-hi={hi === i ? "1" : undefined} aria-selected={hi === i}
                        className={`w-full text-start px-4 py-1.5 text-sm border-t border-slate-800 first:border-t-0 disabled:opacity-40 grid grid-cols-[11rem_1fr] gap-4 items-center ${hi === i ? "bg-blue-600/25" : "hover:bg-slate-800"}`}>
                        <span className="text-xs text-slate-400 truncate" dir="ltr">{p.product_code ?? "—"}</span>
                        <span className="font-semibold truncate">{p.product_name}</span>
                      </button>
                    );
                  })}
                </div>
                {(() => {
                  const cur = prodRes[hi];
                  if (!cur) return null;
                  const sp = API.sellPrice(cur); const out = cur.quantity <= 0;
                  const mp = sp.price > 0 ? r2(((sp.price - cur.cost) / sp.price) * 100) : null;
                  return (
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2 text-sm bg-slate-800/70 border-t border-slate-700" data-testid="prod-detail">
                      <span className="text-slate-400 truncate max-w-[40%]">{cur.product_name}</span>
                      <span className={`font-bold ${out ? "text-red-400" : cur.quantity <= 2 ? "text-amber-300" : "text-emerald-400"}`} data-testid="pd-stock">{out ? t("Out of stock", "نفد") : `${t("Stock", "المتاح")}: ${cur.quantity}`}</span>
                      <span className="font-bold text-slate-100" dir="ltr" data-testid="pd-price">{t("Price", "السعر")}: {fmt(sp.price)} {currency}{sp.fromCost ? ` (${t("cost", "تكلفة")})` : ""}</span>
                      {showMargin && <span className={mp != null && mp < 0 ? "text-red-400" : "text-sky-300"} dir="ltr" data-testid="pd-margin">{t("Margin", "الهامش")}: {mp == null ? "—" : `${mp}%`}</span>}
                      {(cur.brand || cur.unit) && <span className="text-slate-500 text-xs">{[cur.brand, cur.unit].filter(Boolean).join(" · ")}</span>}
                    </div>
                  );
                })()}
              </div>
            )}

            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="w-full text-sm min-w-[860px]" data-testid="lines-table">
                <thead className="bg-slate-800/70 text-slate-300 text-xs">
                  <tr>
                    <th className="p-2 w-10">#</th><th className="p-2 text-start">{t("Code", "الكود")}</th><th className="p-2 text-start">{t("Item", "اسم الصنف")}</th><th className="p-2">{t("Unit", "الوحدة")}</th>
                    <th className="p-2 w-24">{t("Qty", "الكمية")}</th><th className="p-2 w-28">{t("Unit price", "سعر الوحدة")}</th><th className="p-2 w-24">{t("Disc. %", "الخصم %")}</th>
                    <th className="p-2 w-24">{t("VAT", "الضريبة")}</th><th className="p-2 w-28">{t("Total", "الإجمالي")}</th>
                    {showMargin && <th className="p-2 w-32 text-sky-300">{t("Profit / margin", "الربح / الهامش")}</th>}
                    <th className="p-2 w-10" />
                  </tr>
                </thead>
                <tbody>
                  {totals.lines.map((l, i) => {
                    const err = issueOf(l.key); const m = margin.lines[i];
                    return (
                      <tr key={l.key} className={`border-t border-slate-800 ${err ? "bg-red-500/5" : ""}`} data-testid="line-row">
                        <td className="p-2 text-center text-slate-500">{i + 1}</td>
                        <td className="p-2" dir="ltr">{l.code ?? "—"}</td>
                        <td className="p-2"><div className="font-semibold">{l.name}</div><div className="text-[11px] text-slate-500">{t("Stock", "المتاح")}: {l.stock}{l.unitPrice < l.cost ? <span className="text-amber-400"> · {t("below cost", "أقل من التكلفة")}</span> : null}</div>{err && <div className="text-[11px] text-red-400" data-testid="line-error">{err}</div>}</td>
                        <td className="p-2 text-center text-slate-400">{l.unit ?? "—"}</td>
                        <td className="p-2"><input type="number" min={1} step={1} dir="ltr" data-cell="qty" data-row={l.key} onKeyDown={(e) => onCellKey(e, i, "qty")} className={`${inputCls} text-center`} data-testid="qty" value={Number.isFinite(l.qty) ? l.qty : ""} onChange={(e) => patchLine(l.key, { qty: e.target.value === "" ? NaN : Number(e.target.value) })} /></td>
                        <td className="p-2"><input type="number" min={0} step="0.01" dir="ltr" data-cell="price" data-row={l.key} onKeyDown={(e) => onCellKey(e, i, "price")} className={`${inputCls} text-center`} data-testid="price" value={Number.isFinite(l.unitPrice) ? l.unitPrice : ""} onChange={(e) => patchLine(l.key, { unitPrice: e.target.value === "" ? NaN : Number(e.target.value) })} /></td>
                        <td className="p-2"><input type="number" min={0} max={100} step="0.01" dir="ltr" data-cell="disc" data-row={l.key} onKeyDown={(e) => onCellKey(e, i, "disc")} className={`${inputCls} text-center`} data-testid="disc" value={Number.isFinite(l.discountPct) ? l.discountPct : ""} onChange={(e) => patchLine(l.key, { discountPct: e.target.value === "" ? NaN : Number(e.target.value) })} /></td>
                        <td className="p-2 text-center" dir="ltr">{fmt(l.vat)}</td>
                        <td className="p-2 text-center font-bold" dir="ltr" data-testid="line-total">{fmt(l.total)}</td>
                        {showMargin && <td className={`p-2 text-center text-xs ${m.profit < 0 ? "text-red-400" : "text-sky-300"}`} dir="ltr" data-testid="line-margin">{fmt(m.profit)} · {m.pct == null ? "—" : `${m.pct}%`}<div className="text-slate-500">{t("cost", "تكلفة")} {fmt(m.cost)}</div></td>}
                        <td className="p-2 text-center"><button className="text-red-400 hover:text-red-300" onClick={() => removeLine(l.key)} aria-label={t("Remove", "حذف")} data-testid="remove-line"><Trash2 size={16} /></button></td>
                      </tr>
                    );
                  })}
                  {!lines.length && <tr><td colSpan={showMargin ? 11 : 10} className="p-8 text-center text-slate-500">{t("Press F1 and search to add items.", "اضغط F1 وابحث لإضافة الأصناف.")}</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          {/* هامش الربح (F4) */}
          {showMargin && (
            <div className={`${cardCls} p-4 border-sky-500/40`} data-testid="margin-panel">
              <h3 className="font-bold mb-3 flex items-center gap-2"><TrendingUp size={16} className="text-sky-300" />{t("Profit margin", "هامش الربح")} <span className={kbd}>F4</span></h3>
              <div className="grid gap-3 sm:grid-cols-4 text-sm">
                <div className="rounded-lg bg-slate-800/60 p-3"><div className="text-xs text-slate-400">{t("Sales (before VAT)", "المبيعات (قبل الضريبة)")}</div><b dir="ltr" data-testid="m-sales">{fmt(margin.sales)}</b></div>
                <div className="rounded-lg bg-slate-800/60 p-3"><div className="text-xs text-slate-400">{t("Cost of items", "تكلفة الأصناف")}</div><b dir="ltr" data-testid="m-cost">{fmt(margin.cost)}</b></div>
                <div className="rounded-lg bg-slate-800/60 p-3"><div className="text-xs text-slate-400">{t("Invoice profit", "ربح الفاتورة")}</div><b dir="ltr" className={margin.profit < 0 ? "text-red-400" : "text-emerald-300"} data-testid="m-profit">{fmt(margin.profit)}</b></div>
                <div className="rounded-lg bg-slate-800/60 p-3"><div className="text-xs text-slate-400">{t("Invoice margin %", "هامش الفاتورة %")}</div><b dir="ltr" className={margin.profit < 0 ? "text-red-400" : "text-emerald-300"} data-testid="m-pct">{margin.pct == null ? "—" : `${margin.pct}%`}</b></div>
              </div>
              <p className="text-[11px] text-slate-500 mt-2">{t("Cost = current weighted-average cost of each item (products.price); stock account: ", "التكلفة = متوسط التكلفة المرجّح الحالي لكل صنف؛ حساب المخزون: ")}{accName(wh?.inventory_account_id ?? null)}{". "}{t(" Margin = (sales after discount − cost) ÷ sales, before VAT. Internal view — do not print.", "الهامش = (المبيعات بعد الخصم − التكلفة) ÷ المبيعات، قبل الضريبة. عرض داخلي — لا يُطبع.")}</p>
            </div>
          )}

          {/* الملخص والتحصيل والملاحظات */}
          <div className="grid gap-4 lg:grid-cols-3">
            <div className={`${cardCls} p-4`}>
              <h3 className="font-bold mb-3">{t("Notes", "ملاحظات")}</h3>
              <textarea className={`${inputCls} h-24`} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("Invoice notes…", "ملاحظات على الفاتورة…")} />
              <details className="mt-3 text-sm" open={revAcc == null || (totals.tax > 0 && taxAcc == null)}>
                <summary className="cursor-pointer text-slate-400">{t("Accounting accounts (from account mapping)", "الحسابات المحاسبية (من جدول الربط)")}</summary>
                <div className="mt-2 space-y-1 text-xs" data-testid="acc-map">
                  <div className={revAcc == null ? "text-red-300" : "text-slate-300"}>{t("Sales revenue", "إيراد المبيعات")}: <b>{accName(revAcc)}</b></div>
                  <div className={totals.tax > 0 && taxAcc == null ? "text-red-300" : "text-slate-300"}>{t("Output VAT", "ضريبة المخرجات")}: <b>{accName(taxAcc)}</b></div>
                  <div className={wh?.inventory_account_id == null ? "text-amber-300" : "text-slate-300"} data-testid="inv-acc">{t("Warehouse inventory account", "حساب مخزون المستودع")}: <b>{accName(wh?.inventory_account_id ?? null)}</b></div>
                  <div className="text-slate-300">{t("Receivable", "الذمم")}: <b>{isCredit ? accName(receivableAcc) : "—"}</b></div>
                  <div className="text-slate-300">{t("Payment account", "حساب الدفع")}: <b>{saleType === "credit" ? "—" : accName(payOpt?.id ?? null)}</b></div>
                </div>
              </details>
            </div>

            <div className={`${cardCls} p-4`}>
              <h3 className="font-bold mb-3 flex items-center gap-2"><Wallet size={16} className="text-blue-400" />{t("Collection", "التحصيل")}</h3>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={labelCls}>{t("Paid amount", "المبلغ المدفوع")}</label>
                  <input type="number" min={0} step="0.01" dir="ltr" className={inputCls} data-testid="paid" disabled={saleType !== "partial_credit"} value={saleType === "cash" ? fmt(totals.total).replace(/,/g, "") : saleType === "credit" ? "0" : paidNow} onChange={(e) => setPaidNow(e.target.value)} /></div>
                <div><label className={labelCls}>{t("Remaining", "المتبقي")}</label>
                  <div className="px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 font-bold text-sm" dir="ltr" data-testid="remaining">{fmt(remaining)} {currency}</div></div>
              </div>
              {saleType === "partial_credit" && (Number(paidNow) >= totals.total && totals.total > 0) && <div className="text-xs text-red-400 mt-2">{t("Partial payment must be less than the total.", "الدفعة الجزئية يجب أن تكون أقل من الإجمالي.")}</div>}
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
            <div className="flex flex-wrap gap-2">
              <button className="px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm flex items-center gap-2" onClick={() => void previewDraft()} disabled={!lines.length} data-testid="preview"><Printer size={15} />{t("Print preview", "معاينة الطباعة")} <span className={kbd}>F9</span></button>
              <button className="px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm flex items-center gap-2" onClick={() => void saveDraftClick()} data-testid="save-draft"><Save size={15} />{t("Save draft", "حفظ كمسودة")} <span className={kbd}>F8</span></button>
              <button className={`px-4 py-2 rounded-lg border text-sm flex items-center gap-2 ${showMargin ? "bg-sky-600/20 border-sky-500 text-sky-200" : "bg-slate-800 border-slate-700"}`} onClick={() => setShowMargin((v) => !v)} data-testid="margin-toggle"><TrendingUp size={15} />{t("Profit margin", "هامش الربح")} <span className={kbd}>F4</span></button>
            </div>
            <div className="flex gap-2">
              <button className="px-4 py-2 rounded-lg border border-red-500/40 text-red-300 text-sm flex items-center gap-2" onClick={() => { if (!lines.length || window.confirm(t("Discard this invoice?", "إلغاء هذه الفاتورة؟"))) resetForm(); }} data-testid="cancel"><X size={15} />{t("Cancel", "إلغاء")}</button>
              <button className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-bold flex items-center gap-2" onClick={() => void post()} disabled={!canPost} data-testid="post"><Check size={16} />{saving ? t("Posting…", "جارٍ الترحيل…") : t("Post invoice", "ترحيل الفاتورة")} <span className={kbd}>F10</span></button>
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
          {draftsMissing && <div className="text-xs text-amber-300">{t("Drafts table is not installed.", "جدول المسودات غير مُركَّب.")}</div>}
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
                    <tr key={i.id} className="border-t border-slate-800 cursor-pointer hover:bg-white/[0.03]" onClick={() => void printInvoice(i)} title={t("Click to open the invoice for printing", "اضغط لفتح الفاتورة للطباعة")} data-testid="history-row">
                      <td className="p-2" dir="ltr">{i.invoice_no}/{i.invoice_year}</td><td className="p-2" dir="ltr">{i.date}</td><td className="p-2">{i.customer_name || t("Cash customer", "عميل نقدي")}</td>
                      <td className="p-2 text-center">{payLabel(i.payment_type)}</td><td className="p-2 text-center" dir="ltr">{fmt(i.total)}</td><td className="p-2 text-center" dir="ltr">{fmt(i.paid_amount)}</td>
                      <td className="p-2 text-center" dir="ltr">{fmt(r2(i.total - i.paid_amount))}</td>
                      <td className="p-2 text-center"><button className="text-blue-400" onClick={(e) => { e.stopPropagation(); void printInvoice(i); }}><Printer size={15} /></button></td>
                    </tr>
                  ))}
                  {!hLoading && !shownHistory.length && <tr><td colSpan={8} className="p-6 text-center text-slate-500">{t("No invoices in this period.", "لا فواتير في هذه الفترة.")}</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      <div className="text-[11px] text-slate-600">{user?.email ? user.email : ""}{" · "}{branchName(branchId)}</div>
    </div>
  );
}
