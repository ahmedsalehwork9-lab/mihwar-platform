// =============================================================
// src/pages/purchases/PurchasesPage.tsx
//
// صفحة المشتريات — تسجيل فواتير الشراء للمقهى/الفرع.
// التخزين الآن على Supabase (cafeDb) فيتزامن بين كل المتصفحات.
// • إضافة صنف صنف أو دفعة إكسيل · ضريبة 15% · منع تكرار رقم الفاتورة.
// • استيراد فاتورة واحدة أو ملف فيه عدة فواتير (معاينة وتأكيد قبل الحفظ).
// • تحديد وحذف جماعي للفواتير من سجل التقرير.
// • تقرير PDF/Excel + نسبة كل تصنيف + تنبيه تغيّر أسعار الأصناف.
// =============================================================

import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";
import { useAuth } from "../../context/AuthContext";
import * as DB from "../lib/accountingDb";
import PartyQuickEditor from "../lib/PartyQuickEditor";
import type { GLAccount, GLParty } from "../lib/accountingDb";
import { supabase } from "../lib/supabase";
import { fetchPurchasesWithMigration, upsertPurchase, deletePurchase } from "../lib/cafeDb";
import { logoBox, contactFooter, waQrDataUrl, SUPPORT_WA } from "../lib/reportChrome";

import { curAr } from "../lib/orgConfig";
type PItem = { id: number; name: string; category: string; qty: string; unit: string; price: string };
type Purchase = {
  id: string; internalNo?: string; branchId: number | null; branch: string; date: string;
  supplier: string; invoiceNo: string; payment: string; note: string;
  taxable: boolean; vatRate: number; subtotal: number; vat: number;
  items: PItem[]; total: number;
};

// مجموعة أصناف تمثّل فاتورة واحدة أثناء الاستيراد المتعدد
type ImportGroup = {
  key: string; supplier: string; invoiceNo: string; date: string;
  taxable: boolean; payment: string; items: PItem[];
  dup: boolean; selected: boolean;
};

type PriceChange = {
  name: string; unit: string;
  seq: number[];
  first: number; last: number; minP: number; maxP: number;
  change: number;
  history: { date: string; supplier: string; price: number; qty: number }[];
};

const CAT_OPTS = ["مواد خام", "مشروبات", "مخبوزات", "سلطة", "سندوتشات", "تغليف وتعبئة", "مستهلكات", "صيانة", "أخرى"];
const UNIT_OPTS = ["قطعة", "كجم", "جرام", "لتر", "مل", "كرتون", "علبة", "كيس", "حبة", "باكت", "صينية"];
const PAY_OPTS = ["نقدي", "شبكة (مدى)", "آجل (على الحساب)", "تحويل بنكي"];
const VAT_RATE = 15;

const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 });
const num = (v: string) => parseFloat(v) || 0;
const normName = (s: string) => (s || "").trim().replace(/\s+/g, " ").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/[ً-ْ]/g, "").toLowerCase();
const newItem = (): PItem => ({ id: Date.now() + Math.random(), name: "", category: CAT_OPTS[0], qty: "", unit: UNIT_OPTS[0], price: "" });
const todayISO = () => new Date().toISOString().slice(0, 10);

export default function PurchasesPage() {
  const { ownedShopId } = (useAuth() as any) ?? {};
  const [branch, setBranch] = useState<string>("");
  const [accountingOrg,setAccountingOrg]=useState<{id:number;name:string}|null>(null);
  const [glAccounts,setGlAccounts]=useState<GLAccount[]>([]);
  const [glParties,setGlParties]=useState<GLParty[]>([]);
  const [supplierEditorOpen,setSupplierEditorOpen]=useState(false);
  const [supplierEditorRow,setSupplierEditorRow]=useState<GLParty|null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const waNum = SUPPORT_WA;
  const [qr, setQr] = useState<string>("");

  useEffect(() => {
    let active = true;
    (async () => {
      if (!ownedShopId) { setBranch(""); setLogoUrl(null); return; }
      const { data } = await supabase.from("shops").select("shop_name, logo_url").eq("id", ownedShopId).single();
      if (active && data) {
        setBranch((data as any).shop_name ?? "");
        setLogoUrl((data as any).logo_url ?? null);
      }
    })();
    return () => { active = false; };
  }, [ownedShopId]);
  useEffect(() => { let a = true; (async () => { const d = await waQrDataUrl(waNum); if (a) setQr(d); })(); return () => { a = false; }; }, [waNum]);
  useEffect(()=>{let live=true;(async()=>{const org=await DB.getOrgForBranch(ownedShopId??null);if(!live)return;setAccountingOrg(org);if(org){const [accounts,parties]=await Promise.all([DB.fetchAccounts(org.id),DB.fetchParties(org.id,"supplier")]);if(live){setGlAccounts(accounts);setGlParties(parties);}}else{setGlAccounts([]);setGlParties([]);}})();return()=>{live=false;};},[ownedShopId]);
  const refreshGlParties=useCallback(async()=>{if(accountingOrg)setGlParties(await DB.fetchParties(accountingOrg.id,"supplier"));},[accountingOrg]);
  const matchedSupplier=glParties.find(x=>normName(x.name)===normName(supplier))||null;

  const [tab, setTab] = useState<"entry" | "report">("entry");
  useEffect(() => { try { if (sessionStorage.getItem("mihwar_open_tab") === "purchases") { setTab("report"); sessionStorage.removeItem("mihwar_open_tab"); } } catch (e) {} }, []);

  // ── كل مشتريات الفرع (من Supabase) ──
  const [allPurchases, setAllPurchases] = useState<Purchase[]>([]);
  const reloadPurchases = useCallback(async () => {
    const rows = await fetchPurchasesWithMigration(ownedShopId ?? null);
    setAllPurchases(rows as Purchase[]);
  }, [ownedShopId]);
  useEffect(() => { reloadPurchases(); }, [reloadPurchases]);
  useEffect(() => { if (tab === "report") reloadPurchases(); }, [tab, reloadPurchases]);

  // ── فاتورة جديدة ──
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [supplier, setSupplier] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [payment, setPayment] = useState(PAY_OPTS[0]);
  const [taxable, setTaxable] = useState(true);
  const [note, setNote] = useState("");
  const [items, setItems] = useState<PItem[]>([newItem()]);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── حالة الاستيراد المتعدد ──
  const [importGroups, setImportGroups] = useState<ImportGroup[] | null>(null);
  const [savingImport, setSavingImport] = useState(false);

  // ── حالة التحديد الجماعي في سجل التقرير ──
  const [selIds, setSelIds] = useState<Set<string>>(new Set());

  // ── حالة تعديل فاتورة محفوظة ──
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingInternalNo, setEditingInternalNo] = useState<string | undefined>(undefined);

  const addItem = () => setItems((p) => [...p, newItem()]);
  const delItem = (id: number) => setItems((p) => (p.length > 1 ? p.filter((r) => r.id !== id) : p));
  const editItem = (id: number, patch: Partial<PItem>) => setItems((p) => p.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const lineTotal = (r: PItem) => num(r.qty) * num(r.price);
  const subtotal = useMemo(() => items.reduce((s, r) => s + lineTotal(r), 0), [items]);
  const vat = taxable ? subtotal * (VAT_RATE / 100) : 0;
  const grandTotal = subtotal + vat;
  const filledItems = items.filter((r) => r.name.trim() && num(r.qty) > 0);
  const invoiceExists = (no: string) =>
    no.trim() !== "" && allPurchases.some((p) => (p.invoiceNo || "").trim() === no.trim());
  const dupInvoice = invoiceExists(invoiceNo);

  // ── الترقيم الداخلي التلقائي (P-YYYY-NNNN) لكل فرع/سنة ──
  const maxSeqForYear = (year: string) => {
    const prefix = `P-${year}-`;
    let mx = 0;
    allPurchases.forEach((p) => {
      const n = (p as any).internalNo as string | undefined;
      if (n && n.startsWith(prefix)) { const v = parseInt(n.slice(prefix.length), 10); if (!isNaN(v) && v > mx) mx = v; }
    });
    return mx;
  };
  const makeInternalNo = (year: string, seq: number) => `P-${year}-${String(seq).padStart(4, "0")}`;
  const nextInternalNo = (dateStr: string) => {
    const year = (dateStr || new Date().toISOString().slice(0, 10)).slice(0, 4);
    return makeInternalNo(year, maxSeqForYear(year) + 1);
  };

  const supplierSuggest = useMemo(() => {
    const set = new Set<string>();
    allPurchases.forEach((p) => p.supplier && set.add(p.supplier));
    return [...set];
  }, [allPurchases]);

  const itemSuggest = useMemo(() => {
    const map = new Map<string, string>();
    allPurchases.forEach((p) => (p.items || []).forEach((it) => {
      const n = (it.name || "").trim();
      if (!n) return;
      const k = normName(n);
      if (!map.has(k)) map.set(k, n);
    }));
    return [...map.values()].sort((a, b) => a.localeCompare(b, "ar"));
  }, [allPurchases]);

  // ── تنزيل نموذج إكسيل ──
  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["المورّد", "رقم الفاتورة", "التاريخ", "نوع الفاتورة", "طريقة الدفع", "الصنف", "التصنيف", "الكمية", "الوحدة", "سعر الوحدة"],
      ["شركة الألبان", "INV-1001", "2026-11-11", "ضريبية", "نقدي", "حليب طازج", "مواد خام", 10, "لتر", 6.5],
      ["", "", "", "", "", "أكواب ورقية", "تغليف وتعبئة", 5, "كرتون", 45],
      ["مخبز الحي", "INV-1002", "2026-11-12", "ضريبية مبسطة", "آجل", "خبز", "مخبوزات", 20, "حبة", 1.5],
    ]);
    ws["!cols"] = [{ wch: 16 }, { wch: 13 }, { wch: 12 }, { wch: 13 }, { wch: 14 }, { wch: 20 }, { wch: 15 }, { wch: 9 }, { wch: 9 }, { wch: 11 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "المشتريات");
    XLSX.writeFile(wb, "نموذج_مشتريات_محور.xlsx");
  };

  // ── أدوات الاستيراد ──
  const pick = (r: any, keys: string[]) => { for (const k of keys) if (r[k] !== undefined && r[k] !== "") return r[k]; return ""; };
  const toISO = (v: any) => {
    if (v instanceof Date) return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, "0")}-${String(v.getUTCDate()).padStart(2, "0")}`;
    const s = String(v || "").trim(); if (!s) return "";
    const d = new Date(s); if (isNaN(d.getTime())) return "";
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const matchPay = (s: string) => PAY_OPTS.find((p) => p === s) || PAY_OPTS.find((p) => p.includes(s)) || PAY_OPTS.find((p) => s.includes(p.split(" ")[0])) || "";

  // يجمّع صفوف الملف إلى فواتير: كل (رقم الفاتورة + المورّد) = فاتورة.
  // يملأ تلقائيًا بيانات الرأس للصفوف التي تركت المورّد/الرقم فارغين (نموذج قديم).
  const parseGroups = (rows: any[]): ImportGroup[] => {
    let curSup = "", curInv = "", curDate = "", curType = "", curPay = "";
    const order: string[] = [];
    const map = new Map<string, ImportGroup>();
    for (const r of rows) {
      const sup = String(pick(r, ["المورّد", "المورد", "Supplier"])).trim();
      const inv = String(pick(r, ["رقم الفاتورة", "Invoice", "Invoice No"])).trim();
      const dt = toISO(pick(r, ["التاريخ", "Date"]));
      const ty = String(pick(r, ["نوع الفاتورة", "Type"])).trim();
      const pay = String(pick(r, ["طريقة الدفع", "الدفع", "Payment"])).trim();
      if (sup) curSup = sup;
      if (inv) curInv = inv;
      if (dt) curDate = dt;
      if (ty) curType = ty;
      if (pay) curPay = pay;
      const name = String(pick(r, ["الصنف", "اسم الصنف", "Item", "Name"])).trim();
      if (!name) continue;
      const key = (curInv || "") + "||" + (curSup || "");
      if (!map.has(key)) {
        map.set(key, {
          key, supplier: curSup, invoiceNo: curInv, date: curDate || todayISO(),
          taxable: curType ? !/غير/.test(curType) : true,
          payment: matchPay(curPay) || PAY_OPTS[0],
          items: [], dup: false, selected: true,
        });
        order.push(key);
      }
      const g = map.get(key)!;
      g.items.push({
        id: Date.now() + Math.random(),
        name,
        category: String(pick(r, ["التصنيف", "الفئة", "Category"]) || CAT_OPTS[0]).trim(),
        qty: String(pick(r, ["الكمية", "Qty", "Quantity"])),
        unit: String(pick(r, ["الوحدة", "Unit"]) || UNIT_OPTS[0]).trim(),
        price: String(pick(r, ["سعر الوحدة", "السعر", "Price", "Unit Price"])),
      });
    }
    const groups = order.map((k) => map.get(k)!);
    groups.forEach((g) => { g.dup = !!g.invoiceNo && invoiceExists(g.invoiceNo); if (g.dup) g.selected = false; });
    return groups;
  };

  const importExcel = (file: File) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array", cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<any>(ws, { defval: "" });

        const groups = parseGroups(rows).filter((g) => g.items.length > 0);
        if (!groups.length) { alert("لم يتم العثور على أصناف صالحة في الملف. تأكد من أسماء الأعمدة في النموذج."); return; }

        // فاتورة واحدة فقط → تُعبّأ في الفورم للمراجعة والحفظ اليدوي (السلوك الحالي)
        if (groups.length === 1) {
          const g = groups[0];
          if (g.dup) { alert(`رقم الفاتورة «${g.invoiceNo}» مسجّل من قبل لنفس الفرع — لن يتم الاستيراد.`); return; }
          if (g.supplier) setSupplier(g.supplier);
          if (g.invoiceNo) setInvoiceNo(g.invoiceNo);
          if (g.date) setDate(g.date);
          setTaxable(g.taxable);
          if (g.payment) setPayment(g.payment);
          setItems((p) => [...p.filter((r) => r.name.trim() || num(r.qty) > 0), ...g.items]);
          alert(`✓ تم استيراد ${g.items.length} صنف${g.invoiceNo ? ` (فاتورة ${g.invoiceNo})` : ""}${g.taxable ? " · ضريبية" : " · غير ضريبية"}`);
          return;
        }

        // عدة فواتير → نافذة معاينة وتأكيد
        setImportGroups(groups);
      } catch {
        alert("تعذّر قراءة الملف. استخدم نموذج الإكسيل المرفق.");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const groupTotals = (g: ImportGroup) => {
    const sub = g.items.reduce((s, r) => s + num(r.qty) * num(r.price), 0);
    const v = g.taxable ? sub * (VAT_RATE / 100) : 0;
    return { sub, v, total: sub + v };
  };

  const toggleGroup = (key: string) =>
    setImportGroups((gs) => (gs ? gs.map((g) => (g.key === key ? { ...g, selected: !g.selected } : g)) : gs));
  const selectableGroups = importGroups ? importGroups.filter((g) => !g.dup) : [];
  const allSelectableSelected = selectableGroups.length > 0 && selectableGroups.every((g) => g.selected);
  const toggleAllGroups = () =>
    setImportGroups((gs) => (gs ? gs.map((g) => (g.dup ? g : { ...g, selected: !allSelectableSelected })) : gs));
  const importSelCount = importGroups ? importGroups.filter((g) => g.selected && !g.dup).length : 0;
  const importDupCount = importGroups ? importGroups.filter((g) => g.dup).length : 0;

  const confirmImport = async () => {
    if (!importGroups) return;
    const chosen = importGroups.filter((g) => g.selected && !g.dup && g.items.length > 0);
    if (!chosen.length) { alert("لم تختر أي فاتورة للحفظ."); return; }
    setSavingImport(true);
    let ok = 0, fail = 0;
    const seqByYear: Record<string, number> = {};
    for (let i = 0; i < chosen.length; i++) {
      const g = chosen[i];
      const its = g.items.filter((r) => r.name.trim());
      const sub = its.reduce((s, r) => s + num(r.qty) * num(r.price), 0);
      const v = g.taxable ? sub * (VAT_RATE / 100) : 0;
      const year = (g.date || new Date().toISOString().slice(0, 10)).slice(0, 4);
      if (seqByYear[year] == null) seqByYear[year] = maxSeqForYear(year);
      seqByYear[year] += 1;
      const entry: Purchase = {
        id: "p-" + Date.now() + "-" + i, internalNo: makeInternalNo(year, seqByYear[year]),
        branchId: ownedShopId ?? null, branch, date: g.date,
        supplier: g.supplier.trim(), invoiceNo: g.invoiceNo.trim(), payment: g.payment, note: "",
        taxable: g.taxable, vatRate: g.taxable ? VAT_RATE : 0, subtotal: sub, vat: v,
        items: its, total: sub + v,
      };
      const done = await upsertPurchase(ownedShopId ?? null, entry);
      if (done) ok++; else fail++;
    }
    setSavingImport(false);
    await reloadPurchases();
    setImportGroups(null);
    alert(`✓ تم حفظ ${ok} فاتورة${fail ? ` · فشل ${fail}` : ""}`);
  };

  // تحميل فاتورة محفوظة للتعديل (من سجل التقرير أو البحث)
  const startEditPurchase = (p: Purchase) => {
    setEditingId(p.id);
    setEditingInternalNo((p as any).internalNo);
    setSupplier(p.supplier || "");
    setInvoiceNo(p.invoiceNo || "");
    setDate(p.date || new Date().toISOString().slice(0, 10));
    setPayment(p.payment || PAY_OPTS[0]);
    setTaxable(!!p.taxable);
    setNote(p.note || "");
    setItems((p.items && p.items.length ? p.items.map((it) => ({ ...it, id: Date.now() + Math.random() })) : [newItem()]));
    setTab("entry");
    try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch (e) {}
  };
  const cancelEditPurchase = () => { setEditingId(null); setEditingInternalNo(undefined); clearForm(); };

  const canSave = supplier.trim() !== "" && filledItems.length > 0;
  const save = async () => {
    if (!supplier.trim()) { alert("اكتب اسم المورّد أولًا"); return; }
    if (filledItems.length === 0) { alert("أضف صنفًا واحدًا على الأقل (اسم الصنف + الكمية)"); return; }
    // منع التكرار على مرجع المورد مع استثناء الفاتورة الجاري تعديلها
    const dupOther = invoiceNo.trim() !== "" && allPurchases.some((p) => p.id !== editingId && (p.invoiceNo || "").trim() === invoiceNo.trim());
    if (dupOther) { alert(`مرجع المورد «${invoiceNo.trim()}» مسجّل من قبل لفاتورة أخرى. غيّر المرجع أو احذف الفاتورة القديمة.`); return; }
    const sub = filledItems.reduce((s, r) => s + lineTotal(r), 0);
    const v = taxable ? sub * (VAT_RATE / 100) : 0;
    const entry: Purchase = {
      id: editingId ?? "p-" + Date.now(),
      internalNo: editingId ? editingInternalNo : nextInternalNo(date),
      branchId: ownedShopId ?? null, branch, date,
      supplier: supplier.trim(), invoiceNo: invoiceNo.trim(), payment, note: note.trim(),
      taxable, vatRate: taxable ? VAT_RATE : 0, subtotal: sub, vat: v,
      items: filledItems, total: sub + v,
    };
    setSaving(true);
    const ok = await upsertPurchase(ownedShopId ?? null, entry);
    setSaving(false);
    if (!ok) { alert("تعذّر حفظ الفاتورة — تأكد من اتصالك بالإنترنت وصلاحيتك على الفرع."); return; }
    const wasEditing = !!editingId;
    setEditingId(null); setEditingInternalNo(undefined);
    await reloadPurchases();
    clearForm();
    alert(wasEditing ? "✓ تم تحديث الفاتورة" : "✓ تم حفظ الفاتورة");
  };
  const clearForm = () => { setSupplier(""); setInvoiceNo(""); setNote(""); setPayment(PAY_OPTS[0]); setTaxable(true); setItems([newItem()]); };

  // ── التقرير ──
  const monthStart = new Date().toISOString().slice(0, 8) + "01";
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [reportView, setReportView] = useState<"invoices" | "items">("invoices");
  const [search, setSearch] = useState("");

  const report = useMemo(() => {
    const all = allPurchases.filter((e) => e.date >= from && e.date <= to).slice();
    all.sort((a, b) => a.date.localeCompare(b.date));
    const total = all.reduce((s, e) => s + e.total, 0);
    const totalVat = all.reduce((s, e) => s + (e.vat || 0), 0);
    const count = all.length;
    const avg = count ? total / count : 0;
    const catTotals: Record<string, number> = {};
    all.forEach((e) => (e.items || []).forEach((it) => {
      const t = num(it.qty) * num(it.price);
      catTotals[it.category || "أخرى"] = (catTotals[it.category || "أخرى"] || 0) + t;
    }));
    const cats = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);

    // تتبّع تغيّر أسعار الأصناف (توحيد الاسم)
    const itemMap: Record<string, { name: string; unit: string; hist: { date: string; supplier: string; price: number; qty: number }[] }> = {};
    all.forEach((e) => (e.items || []).forEach((it) => {
      const nm = (it.name || "").trim();
      const price = num(it.price);
      if (!nm || price <= 0) return;
      const key = normName(nm);
      if (!key) return;
      if (!itemMap[key]) itemMap[key] = { name: nm, unit: it.unit || "", hist: [] };
      itemMap[key].hist.push({ date: e.date, supplier: e.supplier, price, qty: num(it.qty) });
    }));
    const priceChanges: PriceChange[] = Object.values(itemMap).map((g) => {
      const history = g.hist.slice().sort((a, b) => a.date.localeCompare(b.date));
      const prices = history.map((x) => x.price);
      const seq: number[] = [];
      history.forEach((x) => { const r = Math.round(x.price * 100) / 100; if (seq[seq.length - 1] !== r) seq.push(r); });
      const first = prices[0];
      const last = prices[prices.length - 1];
      const minP = Math.min(...prices);
      const maxP = Math.max(...prices);
      const change = first > 0 ? ((last - first) / first) * 100 : 0;
      return { name: g.name, unit: g.unit, seq, first, last, minP, maxP, change, history };
    })
      .filter((x) => x.seq.length > 1)
      .sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

    // تجميع كل صنف عبر كل الموردين في الفترة (الكمية والتكلفة الإجمالية)
    const itemAggMap: Record<string, { name: string; category: string; unit: string; qty: number; cost: number; prices: number[]; invoices: Set<string>; suppliers: Set<string> }> = {};
    all.forEach((e) => (e.items || []).forEach((it) => {
      const nm = (it.name || "").trim(); if (!nm) return;
      const key = normName(nm); if (!key) return;
      if (!itemAggMap[key]) itemAggMap[key] = { name: nm, category: it.category || "أخرى", unit: it.unit || "", qty: 0, cost: 0, prices: [], invoices: new Set(), suppliers: new Set() };
      const g = itemAggMap[key]; const q = num(it.qty), p = num(it.price);
      g.qty += q; g.cost += q * p; if (p > 0) g.prices.push(p);
      g.invoices.add(e.id); if (e.supplier) g.suppliers.add(e.supplier);
    }));
    const itemAgg = Object.values(itemAggMap).map((g) => ({
      name: g.name, category: g.category, unit: g.unit, qty: g.qty, cost: g.cost,
      avg: g.prices.length ? g.prices.reduce((s, x) => s + x, 0) / g.prices.length : 0,
      invCount: g.invoices.size, supCount: g.suppliers.size,
    })).sort((a, b) => b.cost - a.cost);

    return { rows: all, total, totalVat, count, avg, cats, priceChanges, itemAgg };
  }, [from, to, allPurchases]);

  // بحث داخل التقرير (بالفواتير أو بالأصناف)
  const q = search.trim().toLowerCase();
  const shownRows = q
    ? report.rows.filter((e) => (e.invoiceNo || "").toLowerCase().includes(q) || ((e as any).internalNo || "").toLowerCase().includes(q) || (e.supplier || "").toLowerCase().includes(q))
    : report.rows;
  const shownItems = q
    ? report.itemAgg.filter((g) => g.name.toLowerCase().includes(q) || (g.category || "").toLowerCase().includes(q))
    : report.itemAgg;
  const shownTotal = shownRows.reduce((s, e) => s + e.total, 0);
  const shownVat = shownRows.reduce((s, e) => s + (e.vat || 0), 0);
  const shownItemsCost = shownItems.reduce((s, g) => s + g.cost, 0);

  // ── تحديد/حذف جماعي ──
  const toggleSel = (id: string) =>
    setSelIds((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allRowsSelected = report.rows.length > 0 && report.rows.every((e) => selIds.has(e.id));
  const toggleSelAll = () =>
    setSelIds(() => (allRowsSelected ? new Set() : new Set(report.rows.map((e) => e.id))));
  const deleteSelected = async () => {
    if (!selIds.size) return;
    if (!window.confirm(`حذف ${selIds.size} فاتورة محددة؟ لا يمكن التراجع.`)) return;
    let ok = 0, fail = 0;
    for (const id of Array.from(selIds)) { const d = await deletePurchase(id); if (d) ok++; else fail++; }
    await reloadPurchases();
    setSelIds(new Set());
    if (fail) alert(`تم حذف ${ok} فاتورة · فشل ${fail}`);
  };

  const delPurchaseRow = async (id: string) => {
    if (!window.confirm("حذف هذه الفاتورة؟")) return;
    const ok = await deletePurchase(id);
    if (ok) { await reloadPurchases(); setSelIds((s) => { const n = new Set(s); n.delete(id); return n; }); }
    else alert("تعذّر حذف الفاتورة.");
  };

  // ── تصدير (بتصميم تقارير محور) ──
  const buildExportHTML = () => {
    const now = new Date().toLocaleString("ar-SA");
    const card = (label: string, value: string, green = false) =>
      `<div style="flex:1;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:10px 14px;">
         <div style="font-size:10px;color:#6b7280;font-weight:700;">${label}</div>
         <div style="font-size:17px;font-weight:800;margin-top:3px;color:${green ? "#15a06a" : "#111827"};">${value}</div>
       </div>`;
    const header = `
      <div style="background:#0f1b2b;padding:16px 20px;display:flex;justify-content:space-between;align-items:center;">
        <div style="text-align:left;">
          <div style="font-size:20px;font-weight:800;color:#34d399;">تقرير المشتريات</div>
          <div style="font-size:12px;color:#9fb3c8;">الفترة: ${from} إلى ${to} — ${now}</div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="text-align:right;">
            <div style="font-size:18px;font-weight:800;color:#fff;">محور</div>
            <div style="font-size:9px;letter-spacing:3px;color:#9fb3c8;">MIHWAR PLATFORM</div>
          </div>
          ${logoBox(logoUrl)}
        </div>
      </div>`;
    const cards = `
      <div style="display:flex;gap:10px;padding:14px 20px;background:#f8fafc;">
        ${card("الفرع", branch || "—")}
        ${card("عدد الفواتير", String(report.count))}
        ${card("إجمالي الضريبة", fmt(report.totalVat) + " " + curAr())}
        ${card("الإجمالي شامل الضريبة", fmt(report.total) + " " + curAr(), true)}
        ${card("متوسط الفاتورة", fmt(report.avg) + " " + curAr())}
      </div>`;
    const ths = ["الرقم الداخلي", "التاريخ", "المورّد", "مرجع المورد", "النوع", "عدد الأصناف", "الضريبة", "الإجمالي (" + curAr() + ")", "طريقة الدفع", "ملاحظات"];
    const thead = `<tr>${ths.map((h) => `<th style="border:1px solid #d1d5db;padding:7px 8px;background:#14304d;color:#fff;font-size:11px;font-weight:700;white-space:nowrap;">${h}</th>`).join("")}</tr>`;
    const body = report.rows.map((e, idx) => {
      const bg = idx % 2 ? "#fff" : "#f9fafb";
      const cells = [e.internalNo || "—", e.date, e.supplier, e.invoiceNo || "—", e.taxable ? "ضريبية" : "غير ضريبية", String((e.items || []).length),
        fmt(e.vat || 0), `<b style="color:#15a06a;">${fmt(e.total)}</b>`, e.payment, (e.note || "").replace(/</g, "&lt;")];
      return `<tr style="background:${bg};">${cells.map((v, i) =>
        `<td style="border:1px solid #e5e7eb;padding:5px 8px;font-size:11px;text-align:${i === 2 || i === 9 ? "right" : "center"};">${v}</td>`).join("")}</tr>`;
    }).join("");
    const totalRow = `<tr>
        <td colspan="6" style="border:1px solid #cbd5e1;padding:6px 8px;font-size:11px;font-weight:800;text-align:right;background:#eef2f7;color:#0f1b2b;">الإجمالي العام</td>
        <td style="border:1px solid #cbd5e1;padding:6px 8px;font-size:11px;font-weight:800;text-align:center;background:#eef2f7;color:#b45309;">${fmt(report.totalVat)}</td>
        <td style="border:1px solid #cbd5e1;padding:6px 8px;font-size:12px;font-weight:800;text-align:center;background:#eef2f7;color:#15a06a;">${fmt(report.total)}</td>
        <td colspan="2" style="border:1px solid #cbd5e1;background:#eef2f7;"></td>
      </tr>`;
    const catBlock = report.cats.length ? `
      <div style="padding:4px 20px 14px;">
        <div style="font-size:13px;font-weight:800;color:#0f1b2b;margin:6px 0;">نسبة كل تصنيف من إجمالي المشتريات</div>
        <table style="border-collapse:collapse;width:100%;max-width:520px;">
          <tr>${["التصنيف", "القيمة (" + curAr() + ")", "النسبة %"].map((h) => `<th style="border:1px solid #d1d5db;padding:6px 8px;background:#14304d;color:#fff;font-size:11px;">${h}</th>`).join("")}</tr>
          ${report.cats.map(([c, v]) => `<tr>
            <td style="border:1px solid #e5e7eb;padding:5px 8px;font-size:11px;text-align:right;">${c}</td>
            <td style="border:1px solid #e5e7eb;padding:5px 8px;font-size:11px;text-align:center;">${fmt(v)}</td>
            <td style="border:1px solid #e5e7eb;padding:5px 8px;font-size:11px;text-align:center;font-weight:800;color:#15a06a;">${report.total > 0 ? ((v / report.total) * 100).toFixed(1) : "0"}%</td>
          </tr>`).join("")}
        </table>
      </div>` : "";
    const priceBlock = report.priceChanges.length ? `
      <div style="padding:4px 20px 14px;">
        <div style="font-size:13px;font-weight:800;color:#0f1b2b;margin:6px 0;">تنبيه تغيّر أسعار الأصناف (${report.priceChanges.length} صنف)</div>
        <table style="border-collapse:collapse;width:100%;">
          <tr>${["الصنف", "تسلسل الأسعار", "أول سعر", "آخر سعر", "أعلى سعر", "% التغيّر"].map((h) => `<th style="border:1px solid #d1d5db;padding:6px 8px;background:#14304d;color:#fff;font-size:11px;">${h}</th>`).join("")}</tr>
          ${report.priceChanges.map((pc) => {
            const up = pc.change > 0;
            return `<tr>
              <td style="border:1px solid #e5e7eb;padding:5px 8px;font-size:11px;text-align:right;">${pc.name}${pc.unit ? ` <span style="color:#9ca3af;">(${pc.unit})</span>` : ""}</td>
              <td style="border:1px solid #e5e7eb;padding:5px 8px;font-size:11px;text-align:center;direction:ltr;">${pc.seq.map(fmt).join(" → ")}</td>
              <td style="border:1px solid #e5e7eb;padding:5px 8px;font-size:11px;text-align:center;">${fmt(pc.first)}</td>
              <td style="border:1px solid #e5e7eb;padding:5px 8px;font-size:11px;text-align:center;font-weight:800;">${fmt(pc.last)}</td>
              <td style="border:1px solid #e5e7eb;padding:5px 8px;font-size:11px;text-align:center;">${fmt(pc.maxP)}</td>
              <td style="border:1px solid #e5e7eb;padding:5px 8px;font-size:11px;text-align:center;font-weight:800;color:${up ? "#dc2626" : "#15a06a"};">${(up ? "+" : "") + pc.change.toFixed(1)}%</td>
            </tr>`;
          }).join("")}
        </table>
        <div style="margin-top:4px;font-size:10px;color:#9ca3af;">يعرض فقط الأصناف التي اشتُريت بأكثر من سعر خلال الفترة (السعر بدون ضريبة = صافي التكلفة).</div>
      </div>` : "";
    const table = `<div style="padding:6px 20px 4px;"><table style="border-collapse:collapse;width:100%;"><thead>${thead}</thead><tbody>${body}${totalRow}</tbody></table></div>`;
    const footer = `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 20px;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:10px;gap:12px;">
        <div><div>تم إنشاء هذا التقرير آليًا من صفحة المشتريات</div><div>منصة محور — MIHWAR B2B Marketplace</div></div>
        ${contactFooter(waNum, qr)}
      </div>`;
    return `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;color:#1f2937;background:#fff;">${header}${cards}${table}${catBlock}${priceBlock}${footer}</div>`;
  };

  // تصدير عرض «بالأصناف» (إجمالي كل صنف عبر الموردين)
  const buildItemsExportHTML = () => {
    const now = new Date().toLocaleString("ar-SA");
    const totalCost = report.itemAgg.reduce((s, g) => s + g.cost, 0);
    const card = (label: string, value: string, green = false) =>
      `<div style="flex:1;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:10px 14px;"><div style="font-size:10px;color:#6b7280;font-weight:700;">${label}</div><div style="font-size:17px;font-weight:800;margin-top:3px;color:${green ? "#15a06a" : "#111827"};">${value}</div></div>`;
    const header = `
      <div style="background:#0f1b2b;padding:16px 20px;display:flex;justify-content:space-between;align-items:center;">
        <div style="text-align:left;"><div style="font-size:20px;font-weight:800;color:#34d399;">تقرير المشتريات — بالأصناف</div><div style="font-size:12px;color:#9fb3c8;">الفترة: ${from} إلى ${to} — ${now}</div></div>
        <div style="display:flex;align-items:center;gap:10px;"><div style="text-align:right;"><div style="font-size:18px;font-weight:800;color:#fff;">محور</div><div style="font-size:9px;letter-spacing:3px;color:#9fb3c8;">MIHWAR PLATFORM</div></div>${logoBox(logoUrl)}</div>
      </div>`;
    const cards = `<div style="display:flex;gap:10px;padding:14px 20px;background:#f8fafc;">${card("الفرع", branch || "—")}${card("عدد الأصناف", String(report.itemAgg.length))}${card("إجمالي التكلفة (صافي)", fmt(totalCost) + " " + curAr(), true)}</div>`;
    const ths = ["الصنف", "التصنيف", "إجمالي الكمية", "الوحدة", "متوسط السعر", "إجمالي التكلفة (" + curAr() + ")", "عدد الموردين", "عدد الفواتير"];
    const thead = `<tr>${ths.map((h) => `<th style="border:1px solid #d1d5db;padding:7px 8px;background:#14304d;color:#fff;font-size:11px;font-weight:700;white-space:nowrap;">${h}</th>`).join("")}</tr>`;
    const body = report.itemAgg.map((g, idx) => {
      const bg = idx % 2 ? "#fff" : "#f9fafb";
      const cells = [g.name, g.category, fmt(g.qty), g.unit || "—", fmt(g.avg), `<b style="color:#15a06a;">${fmt(g.cost)}</b>`, String(g.supCount), String(g.invCount)];
      return `<tr style="background:${bg};">${cells.map((v, i) => `<td style="border:1px solid #e5e7eb;padding:5px 8px;font-size:11px;text-align:${i === 0 || i === 1 ? "right" : "center"};">${v}</td>`).join("")}</tr>`;
    }).join("");
    const totalRow = `<tr><td colspan="5" style="border:1px solid #cbd5e1;padding:6px 8px;font-size:11px;font-weight:800;text-align:right;background:#eef2f7;color:#0f1b2b;">إجمالي التكلفة (صافي)</td><td style="border:1px solid #cbd5e1;padding:6px 8px;font-size:12px;font-weight:800;text-align:center;background:#eef2f7;color:#15a06a;">${fmt(totalCost)}</td><td colspan="2" style="border:1px solid #cbd5e1;background:#eef2f7;"></td></tr>`;
    const table = `<div style="padding:6px 20px 4px;"><table style="border-collapse:collapse;width:100%;"><thead>${thead}</thead><tbody>${body}${totalRow}</tbody></table><div style="margin-top:4px;font-size:10px;color:#9ca3af;">التكلفة = مجموع (الكمية × سعر الوحدة) بدون ضريبة لكل صنف عبر كل الفواتير في الفترة.</div></div>`;
    const footer = `<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 20px;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:10px;gap:12px;"><div><div>تم إنشاء هذا التقرير آليًا من صفحة المشتريات</div><div>منصة محور — MIHWAR B2B Marketplace</div></div>${contactFooter(waNum, qr)}</div>`;
    return `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;color:#1f2937;background:#fff;">${header}${cards}${table}${footer}</div>`;
  };

  const exportHTML = () => (reportView === "items" ? buildItemsExportHTML() : buildExportHTML());
  const exportPDF = () => {
    const w = window.open("", "_blank", "width=1000,height=900"); if (!w) return;
    w.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar" style="color-scheme:light;background:#fff;"><head><meta charset="UTF-8"><meta name="color-scheme" content="light"><style>@page{size:A4 landscape;margin:8mm}@media print{html,body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style><title>تقرير المشتريات — ${branch}</title></head><body style="margin:0;background:#fff;">${exportHTML()}<script>window.onload=function(){window.print();}<\/script></body></html>`);
    w.document.close();
  };
  const exportExcel = () => {
    const html = `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"></head><body style="margin:0;background:#fff;">${exportHTML()}</body></html>`;
    const blob = new Blob(["﻿" + html], { type: "application/vnd.ms-excel;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `مشتريات_${reportView === "items" ? "أصناف" : "فواتير"}_${branch || "فرع"}_${from}_${to}.xls`; a.click(); URL.revokeObjectURL(a.href);
  };

  // ================= UI =================
  return (
    <div className="p-4 lg:p-6 min-h-screen" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-xl">🧾</span>
            المشتريات
          </h1>
          <p className="text-slate-500 text-sm mt-1">تسجيل فواتير الشراء — صنف صنف أو دفعة واحدة من إكسيل</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-2">
          <div className="text-[10px] text-slate-500 font-bold">الفرع</div>
          <div className="text-sm font-bold text-white">{branch || "—"}</div>
        </div>
      </div>

      <div className="inline-flex gap-1 bg-slate-900 border border-slate-800 rounded-2xl p-1 mb-5">
        {([["entry", "🧾 فاتورة جديدة"], ["report", "📊 تقرير المشتريات"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${tab === k ? "bg-blue-600 text-white" : "text-slate-400 hover:text-slate-200"}`}>{label}</button>
        ))}
      </div>

      {/* ENTRY */}
      {tab === "entry" && (
        <>
          {editingId ? (
            <div className="mb-3 flex flex-wrap items-center gap-3 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-2.5">
              <span className="text-amber-300 text-sm font-bold">✏️ تعديل فاتورة {editingInternalNo || ""}</span>
              <button onClick={cancelEditPurchase} className="mr-auto px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 text-xs font-bold">إلغاء التعديل</button>
            </div>
          ) : (
            <div className="mb-3 inline-flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5">
              <span className="text-[10px] text-slate-500 font-bold">الرقم الداخلي التالي</span>
              <span className="text-sm font-black font-mono text-blue-300 [direction:ltr]">{nextInternalNo(date)}</span>
              <span className="text-[10px] text-slate-500">يُخصّص تلقائيًا عند الحفظ</span>
            </div>
          )}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-slate-500 font-bold">التاريخ</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-xl text-white px-3 py-2 text-sm [color-scheme:dark]" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-slate-500 font-bold">المورّد</label>
              <select value={supplier} onChange={(e) => { if(e.target.value === "__create_supplier__"){setSupplierEditorRow(null);setSupplierEditorOpen(true);return;} setSupplier(e.target.value); }} className="bg-slate-900 border border-slate-700 rounded-xl text-white px-3 py-2 text-sm">
                <option value="">اختر المورد</option>
                {[...new Set([...glParties.filter(x=>x.is_active).map(x=>x.name),...supplierSuggest])].sort((a,b)=>a.localeCompare(b,"ar")).map((name) => <option key={name} value={name}>{name}</option>)}
                {accountingOrg&&<option value="__create_supplier__">+ إنشاء مورد جديد</option>}
              </select>
              {accountingOrg&&<div className="mt-1 flex gap-2"><button type="button" onClick={()=>{setSupplierEditorRow(null);setSupplierEditorOpen(true);}} className="text-[11px] font-bold text-emerald-300">+ إنشاء مورد</button>{matchedSupplier&&<button type="button" onClick={()=>{setSupplierEditorRow(matchedSupplier);setSupplierEditorOpen(true);}} className="text-[11px] font-bold text-blue-300">تحرير المورد المحدد</button>}{matchedSupplier&&<span className="text-[10px] text-slate-500">مرتبط بحساب: {glAccounts.find(a=>a.id===matchedSupplier.account_id)?.code||"غير محدد"}</span>}</div>}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-slate-500 font-bold">مرجع المورد</label>
              <input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} placeholder="رقم فاتورة المورّد (اختياري)" className={`bg-slate-900 border rounded-xl text-white px-3 py-2 text-sm ${dupInvoice ? "border-red-500" : "border-slate-700"}`} />
              {dupInvoice && <span className="text-[10px] text-red-400">⚠️ مرجع مستخدم من قبل لنفس الفرع</span>}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-slate-500 font-bold">نوع الفاتورة</label>
              <select value={taxable ? "tax" : "notax"} onChange={(e) => setTaxable(e.target.value === "tax")} className="bg-slate-900 border border-slate-700 rounded-xl text-white px-3 py-2 text-sm">
                <option value="tax">ضريبية ({VAT_RATE}%)</option>
                <option value="notax">غير ضريبية</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-slate-500 font-bold">طريقة الدفع</label>
              <select value={payment} onChange={(e) => setPayment(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-xl text-white px-3 py-2 text-sm">{PAY_OPTS.map((o) => <option key={o}>{o}</option>)}</select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-3 bg-slate-900/60 border border-slate-800 rounded-xl p-2.5">
            <span className="text-xs text-slate-400 font-bold mr-1">إضافة دفعة من إكسيل:</span>
            <button onClick={downloadTemplate} className="px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold text-xs">⬇ تنزيل نموذج إكسيل</button>
            <button onClick={() => fileRef.current?.click()} className="px-3 py-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-300 font-bold text-xs">⬆ استيراد ملف إكسيل</button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importExcel(f); e.target.value = ""; }} />
            <span className="text-[11px] text-slate-500">فاتورة واحدة تُعبّأ بالأسفل، وملف فيه عدة فواتير يفتح نافذة معاينة. الأعمدة لكل صف (المورّد · الرقم · التاريخ · النوع · الدفع · الصنف…). الأسعار بدون ضريبة = صافي التكلفة.</span>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden mb-4">
            <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2"><span className="w-1 h-4 rounded bg-blue-500" /><h2 className="text-sm font-bold text-white">أصناف الفاتورة</h2><span className="text-[11px] text-slate-500 mr-auto">{filledItems.length} صنف</span></div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse" style={{ minWidth: 760 }}>
                <thead>
                  <tr className="bg-slate-950">
                    {["الصنف", "التصنيف", "الكمية", "الوحدة", "سعر الوحدة", "الإجمالي", ""].map((h) => (
                      <th key={h} className="text-right text-[10px] font-bold text-slate-500 uppercase px-3 py-2 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <datalist id="itemList">{itemSuggest.map((n) => <option key={n} value={n} />)}</datalist>
                  <datalist id="catList">{CAT_OPTS.map((c) => <option key={c} value={c} />)}</datalist>
                  <datalist id="unitList">{UNIT_OPTS.map((u) => <option key={u} value={u} />)}</datalist>
                  {items.map((r) => (
                    <tr key={r.id} className="border-t border-slate-800">
                      <td className="px-2 py-1.5"><input list="itemList" value={r.name} onChange={(e) => editItem(r.id, { name: e.target.value })} placeholder="اسم الصنف" className="w-full min-w-[150px] bg-slate-950 border border-slate-700 rounded-lg text-white px-2 py-1.5 text-xs" /></td>
                      <td className="px-2 py-1.5"><input list="catList" value={r.category} onChange={(e) => editItem(r.id, { category: e.target.value })} className="w-full min-w-[110px] bg-slate-950 border border-slate-700 rounded-lg text-white px-2 py-1.5 text-xs" /></td>
                      <td className="px-2 py-1.5"><input type="number" step="0.01" value={r.qty} onChange={(e) => editItem(r.id, { qty: e.target.value })} placeholder="0" className="w-20 bg-slate-950 border border-slate-700 rounded-lg text-white px-2 py-1.5 text-center font-mono text-xs [direction:ltr]" /></td>
                      <td className="px-2 py-1.5"><input list="unitList" value={r.unit} onChange={(e) => editItem(r.id, { unit: e.target.value })} className="w-20 bg-slate-950 border border-slate-700 rounded-lg text-white px-2 py-1.5 text-center text-xs" /></td>
                      <td className="px-2 py-1.5"><input type="number" step="0.01" value={r.price} onChange={(e) => editItem(r.id, { price: e.target.value })} placeholder="0" className="w-24 bg-slate-950 border border-slate-700 rounded-lg text-white px-2 py-1.5 text-center font-mono text-xs [direction:ltr]" /></td>
                      <td className="px-2 py-1.5 text-center font-mono text-emerald-400 text-xs [direction:ltr] whitespace-nowrap">{fmt(lineTotal(r))}</td>
                      <td className="px-2 py-1.5 text-center"><button onClick={() => delItem(r.id)} className="w-7 h-7 rounded-lg bg-red-500/10 text-red-400">✕</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button onClick={addItem} className="m-3.5 bg-blue-600/10 border border-dashed border-blue-500 text-blue-300 py-2.5 rounded-xl w-[calc(100%-28px)] font-bold text-xs">+ إضافة صنف</button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-4">
            <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-3.5">
              <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="ملاحظات الفاتورة…" className="w-full bg-slate-950 border border-slate-700 rounded-xl text-white p-2.5 text-sm resize-y min-h-[72px]" />
            </div>
            <div className="bg-gradient-to-br from-blue-600/20 to-slate-900 border border-blue-500/20 rounded-2xl p-4 flex flex-col justify-center gap-1">
              <div className="flex justify-between text-xs"><span className="text-slate-400 font-semibold">المجموع قبل الضريبة</span><span className="font-mono text-slate-200 [direction:ltr]">{fmt(subtotal)}</span></div>
              <div className="flex justify-between text-xs"><span className="text-slate-400 font-semibold">ضريبة القيمة المضافة {taxable ? `(${VAT_RATE}%)` : "(معفاة)"}</span><span className="font-mono text-slate-200 [direction:ltr]">{fmt(vat)}</span></div>
              <div className="flex justify-between items-center border-t border-slate-700/60 mt-1 pt-1.5"><span className="text-slate-300 font-bold text-sm">الإجمالي</span><span className="text-2xl font-black font-mono text-white [direction:ltr]">{fmt(grandTotal)} <span className="text-xs text-slate-400">{curAr()}</span></span></div>
            </div>
          </div>

          <div className="flex items-center gap-3 justify-end flex-wrap">
            {!canSave && <span className="text-[11px] text-amber-400/80 mr-auto">لإتمام الحفظ: اكتب اسم المورّد وأضف صنفًا واحدًا على الأقل (اسم + كمية)</span>}
            <button onClick={editingId ? cancelEditPurchase : clearForm} className="px-6 py-3 rounded-xl bg-slate-900 border border-slate-700 text-slate-400 font-bold text-sm">{editingId ? "إلغاء التعديل" : "تفريغ"}</button>
            <button onClick={save} disabled={saving} className={`px-6 py-3 rounded-xl font-extrabold text-sm transition-all ${canSave && !saving ? "bg-emerald-500 text-emerald-950" : "bg-emerald-500/40 text-emerald-100"}`}>{saving ? "جاري الحفظ…" : (editingId ? "💾 تحديث الفاتورة" : "💾 حفظ الفاتورة")}</button>
          </div>
        </>
      )}

      {/* REPORT */}
      {tab === "report" && (
        <>
          <div className="flex flex-wrap items-end gap-3 mb-4">
            <div className="flex flex-col gap-1"><label className="text-[10px] text-slate-500 font-bold">من</label><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-xl text-white px-3 py-2 text-sm [color-scheme:dark]" /></div>
            <div className="flex flex-col gap-1"><label className="text-[10px] text-slate-500 font-bold">إلى</label><input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-xl text-white px-3 py-2 text-sm [color-scheme:dark]" /></div>
            <div className="flex gap-2 mr-auto">
              {selIds.size > 0 && <button onClick={deleteSelected} className="px-4 py-2.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 font-bold text-xs">🗑 حذف المحدد ({selIds.size})</button>}
              <button onClick={exportPDF} disabled={!report.rows.length} className="px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 font-bold text-xs disabled:opacity-40">⬇ PDF</button>
              <button onClick={exportExcel} disabled={!report.rows.length} className="px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold text-xs disabled:opacity-40">⬇ Excel</button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="inline-flex gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1">
              {([["invoices", "📄 بالفواتير"], ["items", "📦 بالأصناف"]] as const).map(([k, label]) => (
                <button key={k} onClick={() => setReportView(k)} className={`px-4 py-2 rounded-lg font-bold text-xs transition-all ${reportView === k ? "bg-blue-600 text-white" : "text-slate-400 hover:text-slate-200"}`}>{label}</button>
              ))}
            </div>
            <div className="relative flex-1 min-w-[180px] max-w-[320px]">
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={reportView === "items" ? "بحث باسم الصنف أو التصنيف…" : "بحث برقم داخلي / مرجع المورد / المورّد…"} className="w-full bg-slate-900 border border-slate-700 rounded-xl text-white px-3 py-2 text-sm" />
              {search && <button onClick={() => setSearch("")} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-xs">✕</button>}
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5"><div className="text-[10px] text-slate-500 font-bold">عدد الفواتير</div><div className="text-xl font-black font-mono mt-1 text-white">{report.count}</div></div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5"><div className="text-[10px] text-slate-500 font-bold">الإجمالي (شامل الضريبة)</div><div className="text-xl font-black font-mono mt-1 text-emerald-400 [direction:ltr]">{fmt(report.total)}</div></div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5"><div className="text-[10px] text-slate-500 font-bold">إجمالي الضريبة</div><div className="text-xl font-black font-mono mt-1 text-amber-400 [direction:ltr]">{fmt(report.totalVat)}</div></div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5"><div className="text-[10px] text-slate-500 font-bold">متوسط الفاتورة</div><div className="text-xl font-black font-mono mt-1 text-white [direction:ltr]">{fmt(report.avg)}</div></div>
          </div>

          {reportView === "invoices" && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden mb-4">
            <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2"><span className="w-1 h-4 rounded bg-blue-500" /><h2 className="text-sm font-bold text-white">سجل الفواتير</h2><span className="text-[11px] text-slate-500 mr-auto">{branch || "—"} · {shownRows.length} فاتورة{q ? ` من ${report.count}` : ""}{selIds.size ? ` · محدد ${selIds.size}` : ""}</span></div>
            {shownRows.length === 0 ? (
              <div className="p-10 text-center text-slate-500 text-sm">{q ? "لا توجد فواتير مطابقة للبحث." : "لا توجد فواتير ضمن هذا النطاق. أضف فاتورة من تبويب «فاتورة جديدة»."}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse" style={{ minWidth: 800 }}>
                  <thead><tr>
                    <th className="px-2 py-2.5 bg-slate-950 border-b border-slate-700 w-9"><input type="checkbox" checked={allRowsSelected} onChange={toggleSelAll} className="w-4 h-4 accent-blue-500 cursor-pointer align-middle" title="تحديد الكل" /></th>
                    {["الرقم الداخلي", "التاريخ", "المورّد", "مرجع المورد", "النوع", "عدد الأصناف", "الضريبة", "الإجمالي", "الدفع", "ملاحظات", ""].map((h) => <th key={h} className="text-[10px] px-2 py-2.5 bg-slate-950 text-slate-500 uppercase whitespace-nowrap border-b border-slate-700">{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {shownRows.map((e) => (
                      <tr key={e.id} className={selIds.has(e.id) ? "bg-blue-500/5" : "hover:bg-white/[0.02]"}>
                        <td className="px-2 py-2 text-center border-b border-slate-800"><input type="checkbox" checked={selIds.has(e.id)} onChange={() => toggleSel(e.id)} className="w-4 h-4 accent-blue-500 cursor-pointer align-middle" /></td>
                        <td className="px-2 py-2 text-[11px] text-center font-mono font-bold text-blue-300 [direction:ltr] whitespace-nowrap border-b border-slate-800">{e.internalNo || "—"}</td>
                        <td className="px-2 py-2 text-xs text-center font-mono [direction:ltr] whitespace-nowrap border-b border-slate-800">{e.date.slice(5)}</td>
                        <td className="px-2 py-2 text-xs text-right text-slate-200 border-b border-slate-800">{e.supplier}</td>
                        <td className="px-2 py-2 text-xs text-center text-slate-400 border-b border-slate-800">{e.invoiceNo || "—"}</td>
                        <td className="px-2 py-2 text-center border-b border-slate-800"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${e.taxable ? "bg-blue-500/15 text-blue-300" : "bg-slate-500/15 text-slate-400"}`}>{e.taxable ? "ضريبية" : "غير ضريبية"}</span></td>
                        <td className="px-2 py-2 text-xs text-center text-slate-300 border-b border-slate-800">{(e.items || []).length}</td>
                        <td className="px-2 py-2 text-xs text-center font-mono text-amber-400 [direction:ltr] border-b border-slate-800">{e.vat ? fmt(e.vat) : "—"}</td>
                        <td className="px-2 py-2 text-xs text-center font-mono font-bold text-emerald-400 [direction:ltr] border-b border-slate-800">{fmt(e.total)}</td>
                        <td className="px-2 py-2 text-[11px] text-center text-slate-400 border-b border-slate-800 whitespace-nowrap">{e.payment}</td>
                        <td className="px-2 py-2 text-[11px] text-right text-slate-400 max-w-[200px] border-b border-slate-800">{e.note || ""}</td>
                        <td className="px-2 py-2 text-center border-b border-slate-800 whitespace-nowrap"><button onClick={() => startEditPurchase(e)} title="تعديل الفاتورة" className="w-7 h-7 rounded-lg bg-blue-500/15 text-blue-300 ml-1">✏️</button><button onClick={() => delPurchaseRow(e.id)} title="حذف" className="w-7 h-7 rounded-lg bg-red-500/10 text-red-400">✕</button></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-950 font-bold">
                      <td colSpan={7} className="px-2 py-2.5 text-xs text-right text-slate-200 border-t border-slate-600">{q ? "إجمالي المعروض" : "الإجمالي العام"}</td>
                      <td className="px-2 py-2.5 text-xs text-center font-mono text-amber-400 [direction:ltr] border-t border-slate-600">{fmt(shownVat)}</td>
                      <td className="px-2 py-2.5 text-xs text-center font-mono text-emerald-400 [direction:ltr] border-t border-slate-600">{fmt(shownTotal)}</td>
                      <td colSpan={3} className="border-t border-slate-600" />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
          )}

          {reportView === "items" && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden mb-4">
              <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2"><span className="w-1 h-4 rounded bg-emerald-500" /><h2 className="text-sm font-bold text-white">إجمالي كل صنف عبر كل الموردين</h2><span className="text-[11px] text-slate-500 mr-auto">{shownItems.length} صنف{q ? ` من ${report.itemAgg.length}` : ""}</span></div>
              {shownItems.length === 0 ? (
                <div className="p-10 text-center text-slate-500 text-sm">{q ? "لا توجد أصناف مطابقة للبحث." : "لا توجد أصناف ضمن هذا النطاق."}</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse" style={{ minWidth: 720 }}>
                    <thead><tr>{["الصنف", "التصنيف", "إجمالي الكمية", "الوحدة", "متوسط السعر", "إجمالي التكلفة", "عدد الموردين", "عدد الفواتير"].map((h) => <th key={h} className="text-[10px] px-2 py-2.5 bg-slate-950 text-slate-500 uppercase whitespace-nowrap border-b border-slate-700">{h}</th>)}</tr></thead>
                    <tbody>
                      {shownItems.map((g, i) => (
                        <tr key={g.name + i} className="hover:bg-white/[0.02]">
                          <td className="px-2 py-2 text-xs text-right text-slate-100 font-semibold border-b border-slate-800">{g.name}</td>
                          <td className="px-2 py-2 text-[11px] text-center text-slate-400 border-b border-slate-800">{g.category}</td>
                          <td className="px-2 py-2 text-xs text-center font-mono text-slate-200 [direction:ltr] border-b border-slate-800">{fmt(g.qty)}</td>
                          <td className="px-2 py-2 text-[11px] text-center text-slate-500 border-b border-slate-800">{g.unit || "—"}</td>
                          <td className="px-2 py-2 text-xs text-center font-mono text-slate-300 [direction:ltr] border-b border-slate-800">{fmt(g.avg)}</td>
                          <td className="px-2 py-2 text-xs text-center font-mono font-bold text-emerald-400 [direction:ltr] border-b border-slate-800">{fmt(g.cost)}</td>
                          <td className="px-2 py-2 text-xs text-center text-slate-400 border-b border-slate-800">{g.supCount}</td>
                          <td className="px-2 py-2 text-xs text-center text-slate-400 border-b border-slate-800">{g.invCount}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-950 font-bold">
                        <td colSpan={5} className="px-2 py-2.5 text-xs text-right text-slate-200 border-t border-slate-600">{q ? "إجمالي المعروض (تكلفة صافية)" : "إجمالي التكلفة (صافي)"}</td>
                        <td className="px-2 py-2.5 text-xs text-center font-mono text-emerald-400 [direction:ltr] border-t border-slate-600">{fmt(shownItemsCost)}</td>
                        <td colSpan={2} className="border-t border-slate-600" />
                      </tr>
                    </tfoot>
                  </table>
                  <div className="px-4 py-2 text-[11px] text-slate-500">التكلفة = مجموع (الكمية × سعر الوحدة) بدون ضريبة، لكل صنف عبر كل الفواتير في الفترة.</div>
                </div>
              )}
            </div>
          )}

          {report.priceChanges.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden mb-4">
              <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2">
                <span className="w-1 h-4 rounded bg-amber-500" />
                <h2 className="text-sm font-bold text-white">تنبيه تغيّر أسعار الأصناف</h2>
                <span className="text-[11px] text-amber-400 font-bold mr-auto">{report.priceChanges.length} صنف تغيّر سعره</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse" style={{ minWidth: 640 }}>
                  <thead><tr>{["الصنف", "تسلسل الأسعار", "أول سعر", "آخر سعر", "أعلى سعر", "% التغيّر"].map((h) => <th key={h} className="text-[10px] px-2 py-2.5 bg-slate-950 text-slate-500 uppercase whitespace-nowrap border-b border-slate-700">{h}</th>)}</tr></thead>
                  <tbody>
                    {report.priceChanges.map((pc) => {
                      const up = pc.change > 0;
                      return (
                        <tr key={pc.name} className="hover:bg-white/[0.02]">
                          <td className="px-2 py-2.5 text-[13px] text-right font-semibold text-slate-100 border-b border-slate-800">{pc.name}{pc.unit ? <span className="text-slate-500 text-[11px]"> ({pc.unit})</span> : null}</td>
                          <td className="px-2 py-2.5 text-[12px] text-center font-mono text-slate-300 [direction:ltr] border-b border-slate-800 whitespace-nowrap">{pc.seq.map((x) => fmt(x)).join(" → ")}</td>
                          <td className="px-2 py-2.5 text-[13px] text-center font-mono text-slate-200 [direction:ltr] border-b border-slate-800">{fmt(pc.first)}</td>
                          <td className="px-2 py-2.5 text-[13px] text-center font-mono font-extrabold text-white [direction:ltr] border-b border-slate-800">{fmt(pc.last)}</td>
                          <td className="px-2 py-2.5 text-[13px] text-center font-mono text-slate-200 [direction:ltr] border-b border-slate-800">{fmt(pc.maxP)}</td>
                          <td className={`px-2 py-2.5 text-[13px] text-center font-mono font-extrabold [direction:ltr] border-b border-slate-800 ${up ? "text-red-400" : "text-emerald-400"}`}>{(up ? "+" : "") + pc.change.toFixed(1)}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-2 text-[11px] text-slate-500">يعرض فقط الأصناف التي اشتُريت بأكثر من سعر خلال الفترة. أحمر = زيادة، أخضر = نقص.</div>
            </div>
          )}

          {report.cats.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2"><span className="w-1 h-4 rounded bg-emerald-500" /><h2 className="text-sm font-bold text-white">نسبة كل تصنيف من إجمالي المشتريات</h2></div>
              <div className="p-4 space-y-2.5">
                {report.cats.map(([c, v]) => {
                  const p = report.total > 0 ? (v / report.total) * 100 : 0;
                  return (
                    <div key={c}>
                      <div className="flex justify-between text-xs mb-1"><span className="text-slate-300 font-semibold">{c}</span><span className="font-mono text-slate-400 [direction:ltr]">{fmt(v)} · <b className="text-emerald-400">{p.toFixed(1)}%</b></span></div>
                      <div className="h-2 bg-slate-800 rounded-full overflow-hidden"><div className="h-full bg-gradient-to-l from-emerald-500 to-blue-500 rounded-full" style={{ width: `${p}%` }} /></div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* نافذة معاينة الاستيراد المتعدد */}
      {importGroups && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" dir="rtl">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center gap-3">
              <span className="w-9 h-9 rounded-xl bg-blue-500/15 flex items-center justify-center text-lg">📥</span>
              <div>
                <h3 className="text-white font-bold text-base">مراجعة الفواتير المستوردة</h3>
                <p className="text-slate-500 text-xs mt-0.5">تم العثور على {importGroups.length} فاتورة — اختر ما تريد حفظه</p>
              </div>
              <button onClick={() => setImportGroups(null)} className="mr-auto w-8 h-8 rounded-lg bg-slate-800 text-slate-400 hover:text-white">✕</button>
            </div>
            <div className="overflow-auto p-4">
              <table className="w-full border-collapse" style={{ minWidth: 620 }}>
                <thead><tr>
                  <th className="px-2 py-2 bg-slate-950 border-b border-slate-700 w-9"><input type="checkbox" checked={allSelectableSelected} onChange={toggleAllGroups} className="w-4 h-4 accent-blue-500 cursor-pointer align-middle" title="تحديد الكل" /></th>
                  {["رقم الفاتورة", "المورّد", "التاريخ", "النوع", "عدد البنود", "الإجمالي", "الحالة"].map((h) => <th key={h} className="text-[10px] px-2 py-2 bg-slate-950 text-slate-500 uppercase whitespace-nowrap border-b border-slate-700">{h}</th>)}
                </tr></thead>
                <tbody>
                  {importGroups.map((g) => {
                    const tt = groupTotals(g);
                    return (
                      <tr key={g.key} className={g.dup ? "opacity-50" : "hover:bg-white/[0.02]"}>
                        <td className="px-2 py-2 text-center border-b border-slate-800"><input type="checkbox" disabled={g.dup} checked={g.selected && !g.dup} onChange={() => toggleGroup(g.key)} className="w-4 h-4 accent-blue-500 cursor-pointer align-middle disabled:cursor-not-allowed" /></td>
                        <td className="px-2 py-2 text-xs text-center text-slate-300 border-b border-slate-800 whitespace-nowrap">{g.invoiceNo || "—"}</td>
                        <td className="px-2 py-2 text-xs text-right text-slate-200 border-b border-slate-800">{g.supplier || "—"}</td>
                        <td className="px-2 py-2 text-xs text-center font-mono text-slate-400 [direction:ltr] border-b border-slate-800 whitespace-nowrap">{g.date}</td>
                        <td className="px-2 py-2 text-center border-b border-slate-800"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${g.taxable ? "bg-blue-500/15 text-blue-300" : "bg-slate-500/15 text-slate-400"}`}>{g.taxable ? "ضريبية" : "غير ضريبية"}</span></td>
                        <td className="px-2 py-2 text-xs text-center text-slate-300 border-b border-slate-800">{g.items.length}</td>
                        <td className="px-2 py-2 text-xs text-center font-mono font-bold text-emerald-400 [direction:ltr] border-b border-slate-800">{fmt(tt.total)}</td>
                        <td className="px-2 py-2 text-center border-b border-slate-800">{g.dup ? <span className="text-[10px] text-red-400 font-bold">مكرر</span> : <span className="text-[10px] text-emerald-400 font-bold">جديد</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-5 py-4 border-t border-slate-800 flex items-center gap-3">
              <span className="text-xs text-slate-500">محدد: {importSelCount} فاتورة{importDupCount ? ` · ${importDupCount} مكرر مُستبعد` : ""}</span>
              <button onClick={() => setImportGroups(null)} className="mr-auto px-5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 font-bold text-sm">إلغاء</button>
              <button onClick={confirmImport} disabled={savingImport || importSelCount === 0} className={`px-6 py-2.5 rounded-xl font-extrabold text-sm transition-all ${importSelCount > 0 && !savingImport ? "bg-emerald-500 text-emerald-950" : "bg-emerald-500/40 text-emerald-100"}`}>{savingImport ? "جاري الحفظ…" : `💾 حفظ المحدد (${importSelCount})`}</button>
            </div>
          </div>
        </div>
      )}
      {accountingOrg&&<PartyQuickEditor open={supplierEditorOpen} onClose={()=>setSupplierEditorOpen(false)} orgId={accountingOrg.id} branchId={ownedShopId?Number(ownedShopId):null} type="supplier" accounts={glAccounts} party={supplierEditorRow} onSaved={async(saved)=>{await refreshGlParties();setSupplier(saved.name);}} />}
    </div>
  );
}
