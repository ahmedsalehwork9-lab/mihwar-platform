// =============================================================
// src/pages/purchases/entry/PurchaseEntryForm.tsx
// نموذج فاتورة الشراء: بحث أصناف من الخادم + مسح كود، تحقق لكل سطر، تحذير تغيّر التكلفة،
// منع تكرار رقم فاتورة المورد، مسودة تلقائية، لوحة مفاتيح، طباعة بعد الحفظ. ثنائي اللغة RTL/LTR.
// الحفظ عبر DB.createPurchaseInvoice كما هو (قيد + فاتورة + استلام مخزون).
// =============================================================
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, FileText, History, Keyboard, Plus, Printer, Save, ScanLine, Search, Trash2, UserPlus, X } from "lucide-react";
import { useLang } from "../../../context/LanguageContext";
import * as DB from "../../lib/accountingDb";
import { ACTIVE, cur as curOf, curNow } from "../../lib/orgConfig";
import type { GLAccount, GLTreasury, PurchaseKind, PurchasePayType } from "../../lib/accountingDb";
import { cashBankOptions } from "../../lib/cashAccounts";
import { fetchPrintOrg, type PrintOrg } from "../../sales/salesInvoiceApi";
import { printHTML } from "../../sales/salesInvoicePrint";
import { buildPurchaseInvoiceHTML, type PurchasePrintInv } from "../print/purchasePrint";
import * as API from "./entryApi";
import {
  addDays, addProduct, bumpKey, clearDraft, costDelta, draftKey, duplicates, emptyLine, endOfMonth, isBlank, lineErrors, loadDraft, num, r2, saveDraft, validateLines, ymd,
  type DupInv, type EntryDraft, type FLine, type LineErr, type PickedProduct,
} from "./entryLogic";

const CARD = "bg-slate-900 border border-slate-800 rounded-2xl";
const LBL = "block text-xs font-semibold text-slate-400 mb-1";
const INP = "w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500 disabled:opacity-50";
const KBD = "px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] font-mono text-slate-300";
const fmt = (n: number): string => (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const KIND: Record<PurchaseKind, { en: string; ar: string }> = { inventory: { en: "Inventory", ar: "مخزون" }, expense: { en: "Expense", ar: "مصروف" }, asset: { en: "Fixed asset", ar: "أصل ثابت" } };
const PAYL: Record<PurchasePayType, { en: string; ar: string }> = { credit: { en: "Credit", ar: "آجل" }, cash: { en: "Cash", ar: "نقدي" }, partial: { en: "Partial", ar: "جزئي" }, card: { en: "Card", ar: "شبكة" } };
type Hit = PickedProduct & { barcode: string | null };

export type PurchaseEntryProps = {
  org: { id: number; name: string }; shopId: number | null; accounts: GLAccount[]; treasuries: GLTreasury[];
  reloadAccounts: () => Promise<void>; onChanged: () => void; onClose: () => void;
};

export default function PurchaseEntryForm(p: PurchaseEntryProps) {
  const { t, lang, isRTL } = useLang(); const l2 = lang === "en" ? "en" : "ar";
  const { org, shopId, accounts, treasuries } = p;
  const today = ymd(new Date());
  const [fDate, setFDate] = useState(today); const [fSupplierName, setFSupplierName] = useState(""); const [fSupplierInvNo, setFSupplierInvNo] = useState("");
  const [fKind, setFKind] = useState<PurchaseKind>("inventory"); const [fDebitAcc, setFDebitAcc] = useState<number | "">(""); const [fTaxAcc, setFTaxAcc] = useState<number | "">("");
  const [fRate, setFRate] = useState(String(ACTIVE.taxRate)); const [fInclusive, setFInclusive] = useState(false); const [fPay, setFPay] = useState<PurchasePayType>("credit");
  const [fTreasury, setFTreasury] = useState<number | "">(""); const [fSupplierAcc, setFSupplierAcc] = useState<number | "">(""); const [fPaid, setFPaid] = useState(""); const [fDue, setFDue] = useState(""); const [fNotes, setFNotes] = useState("");
  const [lines, setLines] = useState<FLine[]>([emptyLine()]);
  const [showAddSup, setShowAddSup] = useState(false); const [addingSup, setAddingSup] = useState(false); const [nsName, setNsName] = useState(""); const [nsPhone, setNsPhone] = useState(""); const [nsTax, setNsTax] = useState("");
  const [err, setErr] = useState<string | null>(null); const [showErrs, setShowErrs] = useState(false); const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{ no: number; year: number; total: number; paid: number; due: number; items: DB.PurchaseItem[]; supplier: string; date: string; sub: number; tax: number; rate: number; inclusive: boolean; dueDate: string | null; supInv: string | null; notes: string | null; pay: PurchasePayType } | null>(null);
  const [shop, setShop] = useState<PrintOrg | null>(null); const [showKeys, setShowKeys] = useState(false);
  // بحث الأصناف
  const [q, setQ] = useState(""); const [hits, setHits] = useState<Hit[]>([]); const [hitsQ, setHitsQ] = useState<string | null>(null); const [hi, setHi] = useState(0); const [open, setOpen] = useState(false); const [searching, setSearching] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [dups, setDups] = useState<DupInv[]>([]); const [dupOk, setDupOk] = useState(false);
  const [restore, setRestore] = useState<EntryDraft | null>(null); const [draftAt, setDraftAt] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null); const refs = useRef<Record<string, HTMLInputElement | null>>({}); const seq = useRef(0);
  const dKey = draftKey(org.id, shopId);
  const store = (): Storage | null => { try { return window.localStorage; } catch { return null; } };

  // ── الحسابات ──
  const byCode = useCallback((c: string) => accounts.find((a) => a.code === c && !a.is_group), [accounts]);
  const inventoryAcc = useMemo(() => byCode("1104") ?? accounts.find((a) => a.type === "asset" && !a.is_group && /مخزون/.test(a.name)), [accounts, byCode]);
  const purchaseExpAcc = useMemo(() => byCode("5101") ?? accounts.find((a) => a.type === "expense" && !a.is_group), [accounts, byCode]);
  const inputVatAcc = useMemo(() => byCode("1106") ?? accounts.find((a) => !a.is_group && /مدخلات/.test(a.name)), [accounts, byCode]);
  const defaultSupplierAcc = useMemo(() => byCode("2101") ?? accounts.find((a) => a.type === "liability" && /مورد/.test(a.name)), [accounts, byCode]);
  const supplierAccounts = useMemo(() => {
    if (!defaultSupplierAcc) return [] as GLAccount[]; const pc = defaultSupplierAcc.code;
    return accounts.filter((a) => !a.is_group && a.id !== defaultSupplierAcc.id && (a.parent_id === defaultSupplierAcc.id || (a.code.length > pc.length && a.code.startsWith(pc))));
  }, [accounts, defaultSupplierAcc]);
  const nextChildCode = useCallback((parentId: number): string => {
    const parent = accounts.find((a) => a.id === parentId); if (!parent) return ""; const pc = parent.code;
    const kids = accounts.filter((a) => a.code.length > pc.length && a.code.startsWith(pc));
    if (kids.length) { const sfx = kids.map((k) => k.code.slice(pc.length)); return pc + String(Math.max(...sfx.map((s) => parseInt(s, 10) || 0)) + 1).padStart(sfx[0].length, "0"); }
    return pc + "01";
  }, [accounts]);
  const debitOptions = useMemo(() => (fKind === "expense" ? accounts.filter((a) => a.type === "expense" && !a.is_group) : accounts.filter((a) => a.type === "asset" && !a.is_group)), [accounts, fKind]);
  // الحساب التجميعي لا يظهر، وغير التجميعي (صندوق/بنك) يظهر — القيمة = رقم الحساب في الدليل.
  const cashBank = useMemo(() => cashBankOptions(accounts, treasuries), [accounts, treasuries]);
  const bankT = useMemo(() => cashBank.filter((o) => o.kind === "bank"), [cashBank]);
  const cashT = useMemo(() => cashBank.filter((o) => o.kind === "cash"), [cashBank]);
  const treasuryOptions = fPay === "card" ? bankT : [...cashT, ...bankT];
  useEffect(() => { setFDebitAcc((fKind === "inventory" ? inventoryAcc?.id : fKind === "expense" ? purchaseExpAcc?.id : debitOptions[0]?.id) ?? ""); }, [fKind, inventoryAcc, purchaseExpAcc, debitOptions]);
  useEffect(() => { setFTaxAcc(inputVatAcc?.id ?? ""); }, [inputVatAcc]);
  useEffect(() => { if (fPay === "card") setFTreasury(bankT[0]?.id ?? ""); else if (fPay === "cash" || fPay === "partial") setFTreasury(cashT[0]?.id ?? bankT[0]?.id ?? ""); }, [fPay, bankT, cashT]);
  useEffect(() => { let a = true; void fetchPrintOrg(org.id, shopId).then((s) => { if (a) setShop(s); }).catch(() => undefined); return () => { a = false; }; }, [org.id, shopId]);

  // ── المسودة ──
  useEffect(() => { const d = loadDraft(store(), dKey); if (d) setRestore(d); }, [dKey]);
  const snap = useCallback((): EntryDraft => ({ v: 1, savedAt: new Date().toISOString(), date: fDate, kind: fKind, pay: fPay, supplierAcc: fSupplierAcc, supplierName: fSupplierName, supplierInvNo: fSupplierInvNo, rate: fRate, inclusive: fInclusive, paid: fPaid, due: fDue, notes: fNotes, lines }), [fDate, fKind, fPay, fSupplierAcc, fSupplierName, fSupplierInvNo, fRate, fInclusive, fPaid, fDue, fNotes, lines]);
  useEffect(() => {
    if (saved || restore) return; const h = window.setTimeout(() => { const d = snap(); if (saveDraft(store(), dKey, d)) setDraftAt(d.savedAt); else setDraftAt(null); }, 600);
    return () => window.clearTimeout(h);
  }, [snap, dKey, saved, restore]);
  const applyDraft = (d: EntryDraft) => {
    d.lines.forEach((l) => bumpKey(l.key)); setFDate(d.date); setFKind(d.kind); setFPay(d.pay as PurchasePayType); setFSupplierAcc(d.supplierAcc); setFSupplierName(d.supplierName); setFSupplierInvNo(d.supplierInvNo);
    setFRate(d.rate); setFInclusive(d.inclusive); setFPaid(d.paid); setFDue(d.due); setFNotes(d.notes); setLines(d.lines.length ? d.lines : [emptyLine()]); setRestore(null);
  };
  const discardDraft = () => { clearDraft(store(), dKey); setRestore(null); setDraftAt(null); };

  // ── بحث الأصناف ──
  useEffect(() => {
    if (!open || shopId == null || fKind !== "inventory") return; const my = ++seq.current; setSearching(true);
    const h = window.setTimeout(async () => { const r = await API.searchProducts(shopId, q, 15); if (my === seq.current) { setHits(r); setHitsQ(q); setHi(0); setSearching(false); } }, 180);
    return () => window.clearTimeout(h);
  }, [q, open, shopId, fKind]);
  const focusCell = (key: number, col: "qty" | "cost") => window.setTimeout(() => refs.current[`${key}:${col}`]?.focus(), 30);
  const choose = (pr: PickedProduct, qty = 1) => {
    const r = addProduct(lines, pr, qty); setLines(r.lines); setOpen(false); setQ(""); setMsg({ ok: true, text: r.merged ? t(`${pr.product_name}: quantity increased`, `${pr.product_name}: زادت الكمية`) : t(`${pr.product_name} added`, `أُضيف: ${pr.product_name}`) });
    focusCell(r.lines[r.index].key, r.merged ? "qty" : "cost");
  };
  const onSearchKey = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setHi((i) => Math.min(i + 1, Math.max(0, hits.length - 1))); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((i) => Math.max(0, i - 1)); }
    else if (e.key === "Escape") setOpen(false);
    else if (e.key === "Enter") {
      e.preventDefault(); const typed = q.trim();
      if (typed && shopId != null) { const exact = await API.findByCode(shopId, typed); if (exact) { choose(exact); return; } }
      // لا نعتمد على نتائج قديمة: إن لم تكن النتائج للنص الحالي نبحث من جديد قبل الاختيار
      const list = hitsQ === q && !searching ? hits : shopId != null && typed ? await API.searchProducts(shopId, q, 15) : hits;
      const pickI = hitsQ === q ? hi : 0;
      if (typed && list[pickI]) choose(list[pickI]); else if (!typed && open && hits[hi]) choose(hits[hi]); else if (typed) setMsg({ ok: false, text: t(`No item matches: ${typed}`, `لا صنف مطابق: ${typed}`) });
    }
  };

  // ── تكرار رقم فاتورة المورد ──
  const supplierName = fSupplierAcc ? supplierAccounts.find((a) => a.id === fSupplierAcc)?.name ?? null : fSupplierName.trim() || null;
  useEffect(() => {
    const no = fSupplierInvNo.trim(); if (!no) { setDups([]); setDupOk(false); return; } let a = true;
    const h = window.setTimeout(() => { void API.findSupplierInvoiceNo(org.id, no).then((r) => { if (a) { setDups(r); setDupOk(false); } }); }, 350);
    return () => { a = false; window.clearTimeout(h); };
  }, [fSupplierInvNo, org.id]);
  const dupHits = useMemo(() => duplicates(dups, fSupplierInvNo, supplierName), [dups, fSupplierInvNo, supplierName]);

  // ── الإجماليات ──
  const totals = useMemo(() => DB.invoiceTotals(lines.filter((l) => !(l.product_id == null && l.description.trim() === "" && l.unit_cost.trim() === "")).map((l) => ({ qty: num(l.qty) ?? 0, unit_price: num(l.unit_cost) ?? 0 })), num(fRate) ?? 0, fInclusive), [lines, fRate, fInclusive]);
  const paidNow = fPay === "cash" || fPay === "card" ? totals.total : fPay === "credit" ? 0 : Math.min(Math.max(num(fPaid) ?? 0, 0), totals.total);
  const dueNow = r2(totals.total - paidNow); const supplierRequired = fPay === "credit" || fPay === "partial";
  const unitsN = lines.reduce((s, l) => s + (lineErrors(l, fKind).length === 0 && num(l.qty) ? (num(l.qty) as number) : 0), 0);
  const errMap = useMemo(() => new Map(lines.map((l) => [l.key, lineErrors(l, fKind)] as const)), [lines, fKind]);
  const errText = (e: LineErr): string => ({ no_product: t("Pick an item", "اختر صنفًا"), no_desc: t("Add a description", "أضف وصفًا"), bad_qty: t("Quantity must be > 0", "الكمية يجب أن تكون > 0"), bad_cost: t("Cost must be > 0", "التكلفة يجب أن تكون > 0") })[e];

  const setLine = (key: number, patch: Partial<FLine>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const addLine = () => { const l = emptyLine(); setLines((ls) => [...ls, l]); if (fKind !== "inventory") window.setTimeout(() => refs.current[`${l.key}:desc`]?.focus(), 30); else searchRef.current?.focus(); };
  const delLine = (key: number) => setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== key) : [emptyLine()]));

  const addSupplier = async () => {
    if (!defaultSupplierAcc) { setErr(t("Account 2101 (Suppliers) not found in the chart.", "لا يوجد حساب «الموردون (2101)» في دليل الحسابات.")); return; }
    const nm = nsName.trim(); if (!nm) { setErr(t("Enter the supplier name.", "اكتب اسم المورد.")); return; }
    setAddingSup(true); const parent = defaultSupplierAcc; let accId: number | null = supplierAccounts.find((a) => a.name.trim() === nm)?.id ?? null;
    if (!accId) {
      const ra = await DB.addAccountReturningId({ organization_id: org.id, code: nextChildCode(parent.id), name: nm, type: parent.type, parent_id: parent.id, is_group: false, is_active: true });
      if (!ra.ok || !ra.id) { setAddingSup(false); setErr(ra.error || t("Could not create the supplier account.", "تعذّر إنشاء حساب المورد.")); return; }
      accId = ra.id;
      if (nsPhone.trim() || nsTax.trim()) await DB.addPartyQuick({ organization_id: org.id, type: "supplier", name: nm, phone: nsPhone.trim() || null, tax_number: nsTax.trim() || null, branch_id: shopId, account_id: accId });
    }
    await p.reloadAccounts(); setAddingSup(false); setFSupplierAcc(accId); setShowAddSup(false); setNsName(""); setNsPhone(""); setNsTax(""); setErr(null);
  };

  const save = useCallback(async () => {
    if (saving || saved) return; setErr(null);
    const v = validateLines(lines, fKind); setShowErrs(true);
    if (v.errors.length) { setErr(t(`${v.errors.length} line(s) need fixing (highlighted).`, `${v.errors.length} سطر يحتاج تصحيحًا (مظلّل).`)); return; }
    if (!v.items.length) { setErr(t("Add at least one item with quantity and cost.", "أضف صنفًا واحدًا على الأقل بكمية وتكلفة صحيحة.")); return; }
    if (supplierRequired && !fSupplierAcc) { setErr(t("Credit purchase requires choosing a supplier (use + to add one).", "الشراء الآجل يتطلب اختيار مورد (أضف جديدًا بزر «+»).")); return; }
    if (dupHits.length && !dupOk) { setErr(t("This supplier invoice number already exists — confirm it is a different invoice.", "رقم فاتورة المورد مسجّل سابقًا — أكّد أنها فاتورة مختلفة.")); return; }
    setSaving(true);
    const res = await DB.createPurchaseInvoice(org.id, {
      branch_id: shopId, date: fDate, due_date: supplierRequired ? fDue || null : null, party_id: null, supplier_name: supplierName, supplier_invoice_no: fSupplierInvNo.trim() || null,
      purchase_kind: fKind, debit_account_id: Number(fDebitAcc) || 0, tax_account_id: fTaxAcc ? Number(fTaxAcc) : null, payment_type: fPay, treasury_account_id: fTreasury ? Number(fTreasury) : null,
      supplier_account_id: fSupplierAcc ? Number(fSupplierAcc) : null, tax_rate: num(fRate) ?? 0, tax_inclusive: fInclusive, items: v.items, paid_amount: num(fPaid) ?? 0, notes: fNotes.trim() || null,
    });
    setSaving(false);
    if (!res.ok) { setErr(res.error || t("Could not save the invoice.", "تعذّر حفظ الفاتورة.")); return; }
    clearDraft(store(), dKey); setDraftAt(null);
    setSaved({ no: res.invoiceNo ?? 0, year: Number(fDate.slice(0, 4)), total: totals.total, paid: paidNow, due: dueNow, items: v.items, supplier: supplierName ?? t("Cash supplier", "مورد نقدي"), date: fDate, sub: totals.subtotal, tax: totals.tax, rate: num(fRate) ?? 0, inclusive: fInclusive, dueDate: supplierRequired ? fDue || null : null, supInv: fSupplierInvNo.trim() || null, notes: fNotes.trim() || null, pay: fPay });
    p.onChanged();
  }, [saving, saved, lines, fKind, supplierRequired, fSupplierAcc, dupHits, dupOk, org.id, shopId, fDate, fDue, supplierName, fSupplierInvNo, fDebitAcc, fTaxAcc, fPay, fTreasury, fRate, fInclusive, fPaid, fNotes, dKey, totals, paidNow, dueNow, t, p]);

  const reset = () => {
    setSaved(null); setFDate(ymd(new Date())); setFSupplierAcc(""); setFSupplierName(""); setFSupplierInvNo(""); setFKind("inventory"); setFRate(String(ACTIVE.taxRate)); setFInclusive(false); setFPay("credit");
    setFPaid(""); setFDue(""); setFNotes(""); setLines([emptyLine()]); setErr(null); setShowErrs(false); setDups([]); setDupOk(false); setMsg(null); window.setTimeout(() => searchRef.current?.focus(), 50);
  };
  const doPrint = (inv: PurchasePrintInv, pay: PurchasePayType) => {
    const org2: PrintOrg = shop ?? { name: org.name, tax_number: null, commercial_registration: null, phone: null, address: null, logo_url: null };
    printHTML(buildPurchaseInvoiceHTML(inv, { ...org2, name: org2.name || org.name }, { paymentLabel: PAYL[pay][l2], currency: curOf(l2 === "ar") }, l2));
  };
  const printSaved = () => {
    if (!saved) return;
    doPrint({ branch_id: shopId, invoice_no: saved.no, invoice_year: saved.year, date: saved.date, due_date: saved.dueDate, supplier_name: saved.supplier, supplier_invoice_no: saved.supInv, items: saved.items, subtotal: saved.sub, tax_rate: saved.rate, tax_amount: saved.tax, tax_inclusive: saved.inclusive, total: saved.total, paid_amount: saved.paid, notes: saved.notes }, saved.pay);
  };
  const previewDraft = () => {
    const v = validateLines(lines, fKind);
    if (!v.items.length) { setMsg({ ok: false, text: t("Nothing to preview yet.", "لا توجد أسطر صالحة للمعاينة.") }); return; }
    doPrint({ branch_id: shopId, invoice_no: null, invoice_year: Number(fDate.slice(0, 4)), date: fDate, due_date: supplierRequired ? fDue || null : null, supplier_name: supplierName, supplier_invoice_no: fSupplierInvNo.trim() || null, items: v.items, subtotal: totals.subtotal, tax_rate: num(fRate) ?? 0, tax_amount: totals.tax, tax_inclusive: fInclusive, total: totals.total, paid_amount: paidNow, notes: fNotes.trim() || null }, fPay);
  };
  const saveDraftNow = () => { const d = snap(); if (saveDraft(store(), dKey, d)) { setDraftAt(d.savedAt); setMsg({ ok: true, text: t("Draft saved on this device", "حُفظت المسودة على هذا الجهاز") }); } else setMsg({ ok: false, text: t("Could not save the draft", "تعذّر حفظ المسودة") }); };

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "s" || e.key === "Enter")) { e.preventDefault(); void save(); }
      else if (e.key === "F10") { e.preventDefault(); void save(); }
      else if (e.key === "F1" || e.key === "F2") { e.preventDefault(); searchRef.current?.focus(); setOpen(true); }
      else if (e.key === "F8") { e.preventDefault(); saveDraftNow(); }
      else if (e.key === "F9") { e.preventDefault(); previewDraft(); }
      else if (e.key === "Escape") setOpen(false);
      else if (e.altKey && e.key.toLowerCase() === "n") { e.preventDefault(); addLine(); }
    };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  });

  const seg = (on: boolean) => `flex-1 py-2 rounded-lg text-xs font-bold border ${on ? "bg-blue-600 border-blue-500 text-white" : "bg-slate-800 border-slate-700 text-slate-400"}`;
  const totRow = (label: string, val: string, tid: string, cls = "text-slate-100") => <div className="flex justify-between py-1.5 border-b border-slate-800"><span className="text-slate-400">{label}</span><b dir="ltr" className={cls} data-testid={tid}>{val}</b></div>;
  const real = lines.filter((l) => !isBlank(l)); const cur = hits[hi]; const code = accounts.find((a) => a.id === Number(fDebitAcc));
  const taxRate = num(fRate) ?? 0; const cur$ = curNow();

  return (
    <div className="p-4 lg:p-6 min-h-screen text-slate-100 space-y-4" dir={isRTL ? "rtl" : "ltr"} data-testid="purchase-entry">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs text-slate-500">{t("Purchases", "المشتريات")} / {t("New purchase invoice", "فاتورة شراء جديدة")}{draftAt && !saved && <span className="ms-3 text-emerald-400/80" data-testid="pe-draft-badge">{t("Draft saved", "حُفظت مسودة")} {new Date(draftAt).toLocaleTimeString(lang === "en" ? "en-US" : "ar-SA-u-nu-latn", { hour: "2-digit", minute: "2-digit" })}</span>}</div>
          <h1 className="text-xl font-bold flex items-center gap-2"><FileText size={22} className="text-blue-400" />{t("New Purchase Invoice", "فاتورة شراء جديدة")}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="px-4 py-2 rounded-lg text-sm font-semibold border bg-blue-600 border-blue-500 text-white">{t("New invoice", "فاتورة جديدة")}</button>
          <button type="button" onClick={p.onClose} disabled={saving} data-testid="pe-back" className="px-4 py-2 rounded-lg text-sm font-semibold border flex items-center gap-1 bg-slate-800 border-slate-700 text-slate-300"><History size={15} />{t("Invoices list", "قائمة الفواتير")}</button>
          <button type="button" onClick={() => setShowKeys((v) => !v)} data-testid="pe-keys-toggle" className="px-3 py-2 rounded-lg text-sm bg-slate-800 border border-slate-700 text-slate-300 flex items-center gap-1"><Keyboard size={15} />{t("Shortcuts", "الاختصارات")}</button>
        </div>
      </div>

      {showKeys && (
        <div className="rounded-xl border border-slate-700 bg-slate-900 p-3 text-xs text-slate-300 grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-4" data-testid="pe-keys">
          <span><span className={KBD}>F1</span> / <span className={KBD}>F2</span> {t("Search / scan item", "بحث / مسح صنف")}</span><span><span className={KBD}>↑ ↓</span> {t("Move in list", "تنقل في القائمة")}</span>
          <span><span className={KBD}>F8</span> {t("Save draft", "حفظ مسودة")}</span><span><span className={KBD}>F9</span> {t("Print preview", "معاينة الطباعة")}</span>
          <span><span className={KBD}>F10</span> / <span className={KBD}>Ctrl+S</span> {t("Save & post", "حفظ وترحيل")}</span><span><span className={KBD}>Enter</span> {t("Add / next field", "إضافة / الحقل التالي")}</span>
          <span><span className={KBD}>Alt+N</span> {t("New line", "سطر جديد")}</span><span><span className={KBD}>Esc</span> {t("Close list", "إغلاق القائمة")}</span>
        </div>
      )}

      {saved ? (
        <div className={CARD + " border-emerald-500/30 p-4"} data-testid="pe-saved">
          <div className="flex items-center gap-2 text-base font-black text-white mb-2"><Check className="text-emerald-400" size={20} />{t("Invoice saved and posted", "تم حفظ الفاتورة وترحيلها")} <span className="font-mono text-blue-300 text-sm" dir="ltr" data-testid="pe-saved-no">PI-{saved.year}-{String(saved.no).padStart(4, "0")}</span></div>
          <div className="text-sm text-slate-300 mb-3">{saved.supplier} · <span className="font-mono" dir="ltr">{fmt(saved.total)}</span> · {t("due", "مستحق")} <span className="font-mono" dir="ltr">{fmt(saved.due)}</span></div>
          <div className="flex flex-wrap gap-2"><button type="button" onClick={printSaved} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 text-xs font-bold" data-testid="pe-print"><Printer size={14} /> {t("Print", "طباعة")}</button>
            <button type="button" onClick={reset} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold" data-testid="pe-new"><Plus size={14} /> {t("New invoice", "فاتورة جديدة")}</button>
            <button type="button" onClick={p.onClose} className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white" data-testid="pe-to-list">{t("Back to list", "العودة للقائمة")}</button></div>
        </div>
      ) : (<>
        {restore && <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 px-4 py-3 text-xs text-sky-200 flex flex-wrap items-center gap-3" data-testid="pe-restore"><span>{t("An unsaved draft exists", "توجد مسودة غير محفوظة")} ({new Date(restore.savedAt).toLocaleString(lang === "en" ? "en-US" : "ar-SA-u-nu-latn")}) — {restore.lines.filter((l) => l.product_id != null || l.description).length} {t("line(s)", "سطر")}</span>
          <button type="button" onClick={() => applyDraft(restore)} className="px-3 py-1.5 rounded-lg bg-sky-600 text-white font-bold" data-testid="pe-restore-yes">{t("Restore", "استعادة")}</button><button type="button" onClick={discardDraft} className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300" data-testid="pe-restore-no">{t("Discard", "تجاهل")}</button></div>}
        {err && <div className="rounded-xl border border-red-500/40 bg-red-500/10 text-red-200 text-sm p-3" data-testid="pe-err">{err}</div>}

        <div className={`${CARD} p-4 grid gap-3 md:grid-cols-3 xl:grid-cols-6`}>
          <div><label className={LBL}>{t("Invoice date", "تاريخ الفاتورة")} *</label><input type="date" value={fDate} onChange={(e) => setFDate(e.target.value)} className={INP + " [color-scheme:dark]"} data-testid="pe-date" /></div>
          <div className="xl:col-span-2"><label className={LBL}>{supplierRequired ? t("Supplier (required for credit)", "المورد (مطلوب للآجل)") : t("Supplier", "المورد")} *</label>
            <div className="flex gap-1.5"><select value={fSupplierAcc} onChange={(e) => setFSupplierAcc(e.target.value ? Number(e.target.value) : "")} className={`${INP} ${supplierRequired && !fSupplierAcc && showErrs ? "border-amber-500/60" : ""}`} data-testid="pe-supplier">
              <option value="">{supplierRequired ? t("— choose supplier —", "— اختر موردًا —") : t("— cash supplier / none —", "— مورد نقدي / بدون —")}</option>
              {defaultSupplierAcc && <optgroup label={`${defaultSupplierAcc.code} · ${defaultSupplierAcc.name}`}>{supplierAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</optgroup>}</select>
              <button type="button" onClick={() => setShowAddSup((v) => !v)} title={t("Add supplier", "إضافة مورد")} className="shrink-0 px-2.5 rounded-lg bg-slate-800 border border-slate-700 text-blue-400" data-testid="pe-add-sup"><UserPlus size={16} /></button></div></div>
          <div><label className={LBL}>{t("Supplier invoice no.", "رقم فاتورة المورد")}</label><input value={fSupplierInvNo} onChange={(e) => setFSupplierInvNo(e.target.value)} placeholder={t("optional", "اختياري")} className={INP} dir="ltr" data-testid="pe-sinv" /></div>
          <div className="xl:col-span-2"><label className={LBL}>{t("Purchase type", "نوع الشراء")}</label><div className="flex gap-1.5">{(["inventory", "expense", "asset"] as PurchaseKind[]).map((k) => <button key={k} type="button" onClick={() => setFKind(k)} className={seg(fKind === k)} data-testid={`pe-kind-${k}`}>{KIND[k][l2]}</button>)}</div></div>
          {!supplierRequired && !fSupplierAcc && <div className="md:col-span-2 xl:col-span-3"><label className={LBL}>{t("Supplier name (text)", "اسم المورد (نصي)")}</label><input value={fSupplierName} onChange={(e) => setFSupplierName(e.target.value)} placeholder={t("empty = cash supplier", "فارغ = مورد نقدي")} className={INP} /></div>}
          {dupHits.length > 0 && <div className="md:col-span-3 xl:col-span-6 rounded-xl border border-amber-500/40 bg-amber-500/5 px-4 py-2.5 text-xs text-amber-200" data-testid="pe-dup"><div className="flex items-center gap-2 font-bold"><AlertTriangle size={14} />{t("This supplier invoice number is already recorded:", "رقم فاتورة المورد هذا مسجّل سابقًا:")}</div>
            <ul className="mt-1 font-mono" dir="ltr">{dupHits.map((d) => <li key={d.id}>PI-{d.invoice_year}-{String(d.invoice_no).padStart(4, "0")} · {d.date} · {d.supplier_name ?? "—"}</li>)}</ul>
            <label className="mt-2 flex items-center gap-2 cursor-pointer"><input type="checkbox" className="accent-amber-500" checked={dupOk} onChange={(e) => setDupOk(e.target.checked)} data-testid="pe-dup-ok" />{t("It is a different invoice — save anyway", "فاتورة مختلفة — احفظ رغم ذلك")}</label></div>}
          {showAddSup && <div className="md:col-span-3 xl:col-span-6 bg-slate-800/50 border border-slate-700 rounded-xl p-3" data-testid="pe-sup-box"><div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <input value={nsName} onChange={(e) => setNsName(e.target.value)} placeholder={t("Supplier name *", "اسم المورد *")} className={INP} data-testid="pe-ns-name" /><input value={nsPhone} onChange={(e) => setNsPhone(e.target.value)} placeholder={t("Mobile (optional)", "الجوال (اختياري)")} className={INP} /><input value={nsTax} onChange={(e) => setNsTax(e.target.value)} placeholder={t("VAT number (optional)", "الرقم الضريبي (اختياري)")} className={INP} /></div>
            <div className="flex justify-end gap-2 mt-2"><button type="button" onClick={() => { setShowAddSup(false); setNsName(""); }} className="text-xs text-slate-400 px-2 py-1">{t("Cancel", "إلغاء")}</button><button type="button" onClick={() => void addSupplier()} disabled={addingSup || !nsName.trim()} className="flex items-center gap-1.5 bg-blue-600 disabled:opacity-50 text-white text-xs font-bold px-3 py-1.5 rounded-lg" data-testid="pe-ns-save"><Check size={14} /> {t("Add", "إضافة")}</button></div></div>}
        </div>

        <div className={`${CARD} p-4 space-y-3`}>
          {fKind === "inventory" ? (
            <div className="relative">
              <Search size={18} className="absolute top-1/2 -translate-y-1/2 start-3 text-slate-500" /><ScanLine size={18} className="absolute top-1/2 -translate-y-1/2 end-3 text-slate-500" />
              <input ref={searchRef} value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={(e) => void onSearchKey(e)} className={`${INP} ps-10 pe-10 py-3 text-base`} autoComplete="off" data-testid="pe-search"
                placeholder={t("F1 · Search by code, name (Arabic/English) or barcode…", "F1 · ابحث بالكود أو الاسم (عربي/إنجليزي) أو الباركود…")} />
            </div>
          ) : <div className="flex justify-end"><button type="button" onClick={addLine} className="flex items-center gap-1 text-blue-400 text-xs font-bold" data-testid="pe-add-line"><Plus size={14} /> {t("Add line", "إضافة سطر")}</button></div>}
          {msg && <div className={`text-[11px] ${msg.ok ? "text-emerald-300" : "text-red-300"}`} data-testid="pe-msg">{msg.text}</div>}

          {fKind === "inventory" && open && (
            <div className="rounded-xl border border-blue-500/40 bg-slate-950/60 overflow-hidden" data-testid="pe-hits">
              <div className="flex items-center justify-between px-3 py-1.5 text-[11px] text-slate-400 bg-slate-800/60">
                <span>{searching ? t("Searching…", "جارٍ البحث…") : t(`${hits.length} result(s)`, `${hits.length} نتيجة`)}</span>
                <span><span className={KBD}>↑↓</span> {t("move", "تنقل")} · <span className={KBD}>Enter</span> {t("add", "إضافة")} · <span className={KBD}>Esc</span> {t("close", "إغلاق")}</span>
              </div>
              <div className="max-h-[46vh] overflow-auto">
                {!searching && hits.length === 0 && <div className="px-4 py-6 text-center text-sm text-slate-500" data-testid="pe-nohits">{t("No matching items", "لا أصناف مطابقة")}</div>}
                {hits.map((h, i) => <button type="button" key={h.id} onMouseEnter={() => setHi(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(h)} data-testid="pe-hit" data-hi={hi === i ? "1" : undefined} aria-selected={hi === i}
                  className={`w-full text-start px-4 py-1.5 text-sm border-t border-slate-800 first:border-t-0 grid grid-cols-[11rem_1fr] gap-4 items-center ${hi === i ? "bg-blue-600/25" : "hover:bg-slate-800"}`}>
                  <span className="text-xs text-slate-400 truncate" dir="ltr">{h.product_code ?? "—"}</span><span className="font-semibold truncate">{h.product_name}</span></button>)}
              </div>
              {cur && <div className="flex flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2 text-sm bg-slate-800/70 border-t border-slate-700" data-testid="pe-detail">
                <span className="text-slate-400 truncate max-w-[40%]">{cur.product_name}</span>
                <span className={`font-bold ${cur.quantity <= 0 ? "text-red-400" : cur.quantity <= 2 ? "text-amber-300" : "text-emerald-400"}`}>{t("Stock", "المتاح")}: {cur.quantity}</span>
                <span className="font-bold text-slate-100" dir="ltr">{t("Current cost", "التكلفة الحالية")}: {fmt(cur.price)} {cur$}</span>
              </div>}
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-sm min-w-[760px]" data-testid="pe-lines">
              <thead className="bg-slate-800/70 text-slate-300 text-xs"><tr>
                <th className="p-2 w-10">#</th><th className="p-2 text-start w-40">{t("Code", "الكود")}</th><th className="p-2 text-start">{fKind === "inventory" ? t("Item", "اسم الصنف") : t("Description", "الوصف")}</th>
                <th className="p-2 w-24">{t("Qty", "الكمية")}</th><th className="p-2 w-32">{t("Unit cost", "تكلفة الوحدة")}</th><th className="p-2 w-28">{t("VAT", "الضريبة")}</th><th className="p-2 w-28">{t("Total", "الإجمالي")}</th><th className="p-2 w-10" /></tr></thead>
              <tbody>
                {lines.map((l, i) => { const errs = errMap.get(l.key) ?? []; const bad = showErrs && errs.length > 0; const cd = costDelta(l.unit_cost, l.cur_cost, fInclusive, taxRate); const lt = r2((num(l.qty) ?? 0) * (num(l.unit_cost) ?? 0)); const vat = fInclusive ? r2(lt - lt / (1 + taxRate / 100)) : r2(lt * taxRate / 100); return (
                  <tr key={l.key} data-testid="pe-line" data-bad={bad ? "1" : undefined} className={`border-t border-slate-800 ${bad ? "bg-red-500/5" : ""}`}>
                    <td className="p-2 text-center text-slate-500">{i + 1}</td>
                    <td className="p-2 text-xs text-slate-400" dir="ltr">{l.code || "—"}</td>
                    <td className="p-2">{fKind === "inventory" ? (l.product_id != null ? <div><div className="font-semibold" data-testid="pe-line-name">{l.description}</div>{l.stock != null && <div className="text-[11px] text-slate-500" data-testid="pe-line-stock">{t("Stock", "المتاح")}: {l.stock}</div>}</div> : <div className="text-xs text-slate-500">{t("— pick an item above —", "— اختر صنفًا من البحث أعلاه —")}</div>)
                      : <input ref={(el) => { refs.current[`${l.key}:desc`] = el; }} value={l.description} onChange={(e) => setLine(l.key, { description: e.target.value })} placeholder={t("Line description (expense / service / asset)", "وصف السطر (مصروف/خدمة/أصل)")} className={INP} data-testid="pe-desc" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); refs.current[`${l.key}:qty`]?.focus(); } }} />}
                      {bad && <div className="text-[11px] text-red-400" data-testid="pe-line-err">{errs.map(errText).join(" · ")}</div>}</td>
                    <td className="p-2"><input ref={(el) => { refs.current[`${l.key}:qty`] = el; }} value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })} inputMode="decimal" dir="ltr" aria-label={t("Quantity", "الكمية")} className={`${INP} text-center`} data-testid="pe-qty" onFocus={(e) => e.currentTarget.select()} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); refs.current[`${l.key}:cost`]?.focus(); } }} /></td>
                    <td className="p-2"><input ref={(el) => { refs.current[`${l.key}:cost`] = el; }} value={l.unit_cost} onChange={(e) => setLine(l.key, { unit_cost: e.target.value })} inputMode="decimal" dir="ltr" aria-label={t("Unit cost", "تكلفة الوحدة")} className={`${INP} text-center`} data-testid="pe-cost" onFocus={(e) => e.currentTarget.select()}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (fKind === "inventory") { searchRef.current?.focus(); setOpen(true); } else if (i === lines.length - 1) addLine(); else refs.current[`${lines[i + 1].key}:desc`]?.focus(); } }} />
                      {cd != null && cd !== 0 && <div className={`text-[10px] font-mono text-center mt-0.5 ${cd > 0 ? "text-red-300" : "text-emerald-300"}`} dir="ltr" data-testid="pe-delta" title={t("vs current item cost", "مقارنة بتكلفة الصنف الحالية")}>{cd > 0 ? "▲" : "▼"} {fmt(Math.abs(cd))}%</div>}</td>
                    <td className="p-2 text-center" dir="ltr">{fmt(vat)}</td>
                    <td className="p-2 text-center font-bold" dir="ltr" data-testid="pe-line-total">{fmt(lt)}</td>
                    <td className="p-2 text-center"><button type="button" onClick={() => delLine(l.key)} aria-label={t("Delete line", "حذف السطر")} className="text-red-400 hover:text-red-300" data-testid="pe-del"><Trash2 size={16} /></button></td>
                  </tr>); })}
              </tbody>
            </table>
          </div>
          <div className="text-[11px] text-slate-500" data-testid="pe-count">{t("Lines", "الأسطر")}: {real.length} · {t("Units", "الوحدات")}: {Math.round(unitsN * 1000) / 1000}</div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className={`${CARD} p-4`}>
            <h3 className="font-bold mb-3">{t("Accounts & VAT", "الحسابات والضريبة")}</h3>
            <label className={LBL}>{fKind === "inventory" ? t("Inventory account (debit)", "حساب المخزون (مدين)") : fKind === "asset" ? t("Asset account (debit)", "حساب الأصل (مدين)") : t("Expense account (debit)", "حساب المصروف (مدين)")}</label>
            <select value={fDebitAcc} onChange={(e) => setFDebitAcc(e.target.value ? Number(e.target.value) : "")} className={INP} data-testid="pe-debit"><option value="">{t("— choose —", "— اختر —")}</option>{debitOptions.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select>
            {code && <div className="mt-1 text-[11px] text-slate-500">{code.code} · {code.name}</div>}
            <label className={LBL + " mt-3"}>{t("Input VAT account", "ضريبة المدخلات")}</label>
            <select value={fTaxAcc} onChange={(e) => setFTaxAcc(e.target.value ? Number(e.target.value) : "")} className={INP} data-testid="pe-taxacc"><option value="">{t("— no VAT —", "— بدون ضريبة —")}</option>{accounts.filter((a) => !a.is_group && /ضريبة|مدخلات|vat|tax/i.test(a.name)).map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select>
            <div className="grid grid-cols-2 gap-3 mt-3"><div><label className={LBL}>{t("VAT rate %", "نسبة الضريبة %")}</label><input value={fRate} onChange={(e) => setFRate(e.target.value)} inputMode="decimal" dir="ltr" className={INP} data-testid="pe-rate" /></div>
              <div><label className={LBL}>{t("VAT mode", "طريقة الضريبة")}</label><div className="flex gap-1.5"><button type="button" onClick={() => setFInclusive(false)} className={seg(!fInclusive)} data-testid="pe-excl">{t("Excl.", "غير شامل")}</button><button type="button" onClick={() => setFInclusive(true)} className={seg(fInclusive)} data-testid="pe-incl">{t("Incl.", "شامل")}</button></div></div></div>
          </div>
          <div className={`${CARD} p-4`}>
            <h3 className="font-bold mb-3">{t("Payment", "السداد")}</h3>
            <label className={LBL}>{t("Payment method", "طريقة السداد")}</label><div className="grid grid-cols-4 gap-1.5">{(["credit", "cash", "partial", "card"] as PurchasePayType[]).map((x) => <button key={x} type="button" onClick={() => setFPay(x)} className={seg(fPay === x)} data-testid={`pe-pay-${x}`}>{PAYL[x][l2]}</button>)}</div>
            {(fPay === "cash" || fPay === "card" || fPay === "partial") && <div className="mt-3"><label className={LBL}>{fPay === "card" ? t("Bank / terminal", "البنك/الشبكة") : t("Treasury / bank", "الخزنة/البنك")}</label><select value={fTreasury} onChange={(e) => setFTreasury(e.target.value ? Number(e.target.value) : "")} className={INP} data-testid="pe-treasury"><option value="">{t("— choose —", "— اختر —")}</option>{treasuryOptions.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>}
            {fPay === "partial" && <div className="mt-3"><label className={LBL}>{t("Paid now", "المبلغ المدفوع الآن")}</label><input value={fPaid} onChange={(e) => setFPaid(e.target.value)} inputMode="decimal" dir="ltr" placeholder="0.00" className={INP} data-testid="pe-paid" /></div>}
            {supplierRequired && <div className="mt-3"><label className={LBL}>{t("Due date", "تاريخ الاستحقاق")}</label><input type="date" value={fDue} onChange={(e) => setFDue(e.target.value)} className={INP + " [color-scheme:dark]"} data-testid="pe-due" />
              <div className="flex flex-wrap gap-1 mt-1.5">{([[15, t("15 days", "15 يوم")], [30, t("30 days", "30 يوم")], [45, t("45 days", "45 يوم")]] as const).map(([n, l]) => <button key={n} type="button" onClick={() => setFDue(addDays(fDate, n))} className="text-[11px] px-2 py-1 rounded-md bg-slate-800 border border-slate-700 text-slate-300" data-testid={`pe-term-${n}`}>{l}</button>)}<button type="button" onClick={() => setFDue(endOfMonth(fDate))} className="text-[11px] px-2 py-1 rounded-md bg-slate-800 border border-slate-700 text-slate-300" data-testid="pe-term-eom">{t("End of month", "نهاية الشهر")}</button></div></div>}
            <div className="mt-3"><label className={LBL}>{t("Notes", "ملاحظات")}</label><input value={fNotes} onChange={(e) => setFNotes(e.target.value)} placeholder={t("optional", "اختياري")} className={INP} data-testid="pe-notes" /></div>
          </div>
          <div className={`${CARD} p-4 text-sm`} data-testid="pe-totals">
            {totRow(t("Items total (before VAT)", "إجمالي الأصناف (قبل الضريبة)"), fmt(totals.subtotal), "pe-t-sub")}
            {totRow(t(`VAT (${taxRate}%)`, `ضريبة القيمة المضافة (${taxRate}%)`), fmt(totals.tax), "pe-t-tax")}
            <div className="flex justify-between mt-2 px-3 py-3 rounded-xl bg-blue-600/20 border border-blue-500/40 text-base"><b>{t("Invoice total", "إجمالي الفاتورة")}</b><span dir="ltr" className="font-bold"><span data-testid="pe-t-total">{fmt(totals.total)}</span> {cur$}</span></div>
            <div className="mt-2">{totRow(t("Paid", "المدفوع"), fmt(paidNow), "pe-t-paid", "text-emerald-400")}{totRow(t("Due", "المستحق"), fmt(dueNow), "pe-t-due", "text-amber-300")}</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 sticky bottom-0 bg-slate-950/90 backdrop-blur py-3 border-t border-slate-800">
          <div className="flex flex-wrap gap-2">
            <button type="button" className="px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm flex items-center gap-2" onClick={previewDraft} disabled={!real.length} data-testid="pe-preview"><Printer size={15} />{t("Print preview", "معاينة الطباعة")} <span className={KBD}>F9</span></button>
            <button type="button" className="px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm flex items-center gap-2" onClick={saveDraftNow} data-testid="pe-save-draft"><Save size={15} />{t("Save draft", "حفظ كمسودة")} <span className={KBD}>F8</span></button>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => { if (!real.length || window.confirm(t("Discard this invoice?", "إلغاء هذه الفاتورة؟"))) p.onClose(); }} disabled={saving} className="px-4 py-2 rounded-lg border border-red-500/40 text-red-300 text-sm flex items-center gap-2" data-testid="pe-cancel"><X size={15} />{t("Cancel", "إلغاء")}</button>
            <button type="button" onClick={() => void save()} disabled={saving || !!saved} className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-bold flex items-center gap-2" data-testid="pe-save"><Check size={16} />{saving ? t("Saving…", "جارٍ الحفظ…") : t("Save & post", "حفظ وترحيل")} <span className={KBD}>F10</span></button>
          </div>
        </div>
      </>)}
    </div>
  );
}
