// =============================================================
// src/pages/purchases/PurchasesPage.tsx
//
// صفحة المشتريات — تسجيل فواتير الشراء للمقهى/الفرع.
// التخزين الآن على Supabase (cafeDb) فيتزامن بين كل المتصفحات.
// • إضافة صنف صنف أو دفعة إكسيل · ضريبة 15% · منع تكرار رقم الفاتورة.
// • تقرير PDF/Excel + نسبة كل تصنيف + تنبيه تغيّر أسعار الأصناف.
// =============================================================

import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../lib/supabase";
import { fetchPurchasesWithMigration, upsertPurchase, deletePurchase } from "../lib/cafeDb";
import { logoBox, contactFooter, waQrDataUrl, SUPPORT_WA } from "../lib/reportChrome";

type PItem = { id: number; name: string; category: string; qty: string; unit: string; price: string };
type Purchase = {
  id: string; branchId: number | null; branch: string; date: string;
  supplier: string; invoiceNo: string; payment: string; note: string;
  taxable: boolean; vatRate: number; subtotal: number; vat: number;
  items: PItem[]; total: number;
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

export default function PurchasesPage() {
  const { ownedShopId } = (useAuth() as any) ?? {};
  const [branch, setBranch] = useState<string>("");
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
    ]);
    ws["!cols"] = [{ wch: 16 }, { wch: 13 }, { wch: 12 }, { wch: 13 }, { wch: 14 }, { wch: 20 }, { wch: 15 }, { wch: 9 }, { wch: 9 }, { wch: 11 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "المشتريات");
    XLSX.writeFile(wb, "نموذج_مشتريات_محور.xlsx");
  };

  // ── استيراد من إكسيل ──
  const pick = (r: any, keys: string[]) => { for (const k of keys) if (r[k] !== undefined && r[k] !== "") return r[k]; return ""; };
  const toISO = (v: any) => {
    if (v instanceof Date) return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, "0")}-${String(v.getUTCDate()).padStart(2, "0")}`;
    const s = String(v || "").trim(); if (!s) return "";
    const d = new Date(s); if (isNaN(d.getTime())) return "";
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const matchPay = (s: string) => PAY_OPTS.find((p) => p === s) || PAY_OPTS.find((p) => p.includes(s)) || PAY_OPTS.find((p) => s.includes(p.split(" ")[0])) || "";
  const importExcel = (file: File) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array", cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<any>(ws, { defval: "" });

        const info = rows.find((r) => pick(r, ["المورّد", "المورد", "Supplier"]) || pick(r, ["رقم الفاتورة", "Invoice", "Invoice No"]) || pick(r, ["نوع الفاتورة", "Type"]) || pick(r, ["طريقة الدفع", "الدفع", "Payment"])) || rows[0] || {};
        const impSupplier = String(pick(info, ["المورّد", "المورد", "Supplier"])).trim();
        const impInvoice = String(pick(info, ["رقم الفاتورة", "Invoice", "Invoice No"])).trim();
        const impDate = toISO(pick(info, ["التاريخ", "Date"]));
        const impType = String(pick(info, ["نوع الفاتورة", "Type"])).trim();
        const impPay = String(pick(info, ["طريقة الدفع", "الدفع", "Payment"])).trim();

        if (impInvoice && invoiceExists(impInvoice)) {
          alert(`رقم الفاتورة «${impInvoice}» مسجّل من قبل لنفس الفرع — لن يتم الاستيراد.`); return;
        }

        const mapped: PItem[] = rows.map((r) => ({
          id: Date.now() + Math.random(),
          name: String(pick(r, ["الصنف", "اسم الصنف", "Item", "Name"])).trim(),
          category: String(pick(r, ["التصنيف", "الفئة", "Category"]) || CAT_OPTS[0]).trim(),
          qty: String(pick(r, ["الكمية", "Qty", "Quantity"])),
          unit: String(pick(r, ["الوحدة", "Unit"]) || UNIT_OPTS[0]).trim(),
          price: String(pick(r, ["سعر الوحدة", "السعر", "Price", "Unit Price"])),
        })).filter((x) => x.name);
        if (!mapped.length) { alert("لم يتم العثور على أصناف صالحة في الملف. تأكد من أسماء الأعمدة في النموذج."); return; }

        if (impSupplier) setSupplier(impSupplier);
        if (impInvoice) setInvoiceNo(impInvoice);
        if (impDate) setDate(impDate);
        if (impType) setTaxable(!/غير/.test(impType));
        if (impPay) { const m = matchPay(impPay); if (m) setPayment(m); }
        setItems((p) => [...p.filter((r) => r.name.trim() || num(r.qty) > 0), ...mapped]);

        const typeLbl = impType ? (/غير/.test(impType) ? " · غير ضريبية" : " · ضريبية") : "";
        alert(`✓ تم استيراد ${mapped.length} صنف${impInvoice ? ` (فاتورة ${impInvoice})` : ""}${typeLbl}`);
      } catch {
        alert("تعذّر قراءة الملف. استخدم نموذج الإكسيل المرفق.");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const canSave = supplier.trim() !== "" && filledItems.length > 0;
  const save = async () => {
    if (!supplier.trim()) { alert("اكتب اسم المورّد أولًا"); return; }
    if (filledItems.length === 0) { alert("أضف صنفًا واحدًا على الأقل (اسم الصنف + الكمية)"); return; }
    if (invoiceExists(invoiceNo)) { alert(`رقم الفاتورة «${invoiceNo.trim()}» مسجّل من قبل لنفس الفرع. غيّر الرقم أو احذف الفاتورة القديمة.`); return; }
    const sub = filledItems.reduce((s, r) => s + lineTotal(r), 0);
    const v = taxable ? sub * (VAT_RATE / 100) : 0;
    const entry: Purchase = {
      id: "p-" + Date.now(), branchId: ownedShopId ?? null, branch, date,
      supplier: supplier.trim(), invoiceNo: invoiceNo.trim(), payment, note: note.trim(),
      taxable, vatRate: taxable ? VAT_RATE : 0, subtotal: sub, vat: v,
      items: filledItems, total: sub + v,
    };
    setSaving(true);
    const ok = await upsertPurchase(ownedShopId ?? null, entry);
    setSaving(false);
    if (!ok) { alert("تعذّر حفظ الفاتورة — تأكد من اتصالك بالإنترنت وصلاحيتك على الفرع."); return; }
    await reloadPurchases();
    clearForm();
    alert("✓ تم حفظ الفاتورة");
  };
  const clearForm = () => { setSupplier(""); setInvoiceNo(""); setNote(""); setPayment(PAY_OPTS[0]); setTaxable(true); setItems([newItem()]); };

  // ── التقرير ──
  const monthStart = new Date().toISOString().slice(0, 8) + "01";
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));

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

    return { rows: all, total, totalVat, count, avg, cats, priceChanges };
  }, [from, to, allPurchases]);

  const delPurchaseRow = async (id: string) => {
    if (!window.confirm("حذف هذه الفاتورة؟")) return;
    const ok = await deletePurchase(id);
    if (ok) await reloadPurchases();
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
        ${card("إجمالي الضريبة", fmt(report.totalVat) + " ر.س")}
        ${card("الإجمالي شامل الضريبة", fmt(report.total) + " ر.س", true)}
        ${card("متوسط الفاتورة", fmt(report.avg) + " ر.س")}
      </div>`;
    const ths = ["التاريخ", "المورّد", "رقم الفاتورة", "النوع", "عدد الأصناف", "الضريبة", "الإجمالي (ر.س)", "طريقة الدفع", "ملاحظات"];
    const thead = `<tr>${ths.map((h) => `<th style="border:1px solid #d1d5db;padding:7px 8px;background:#14304d;color:#fff;font-size:11px;font-weight:700;white-space:nowrap;">${h}</th>`).join("")}</tr>`;
    const body = report.rows.map((e, idx) => {
      const bg = idx % 2 ? "#fff" : "#f9fafb";
      const cells = [e.date, e.supplier, e.invoiceNo || "—", e.taxable ? "ضريبية" : "غير ضريبية", String((e.items || []).length),
        fmt(e.vat || 0), `<b style="color:#15a06a;">${fmt(e.total)}</b>`, e.payment, (e.note || "").replace(/</g, "&lt;")];
      return `<tr style="background:${bg};">${cells.map((v, i) =>
        `<td style="border:1px solid #e5e7eb;padding:5px 8px;font-size:11px;text-align:${i === 1 || i === 8 ? "right" : "center"};">${v}</td>`).join("")}</tr>`;
    }).join("");
    const totalRow = `<tr>
        <td colspan="5" style="border:1px solid #cbd5e1;padding:6px 8px;font-size:11px;font-weight:800;text-align:right;background:#eef2f7;color:#0f1b2b;">الإجمالي العام</td>
        <td style="border:1px solid #cbd5e1;padding:6px 8px;font-size:11px;font-weight:800;text-align:center;background:#eef2f7;color:#b45309;">${fmt(report.totalVat)}</td>
        <td style="border:1px solid #cbd5e1;padding:6px 8px;font-size:12px;font-weight:800;text-align:center;background:#eef2f7;color:#15a06a;">${fmt(report.total)}</td>
        <td colspan="2" style="border:1px solid #cbd5e1;background:#eef2f7;"></td>
      </tr>`;
    const catBlock = report.cats.length ? `
      <div style="padding:4px 20px 14px;">
        <div style="font-size:13px;font-weight:800;color:#0f1b2b;margin:6px 0;">نسبة كل تصنيف من إجمالي المشتريات</div>
        <table style="border-collapse:collapse;width:100%;max-width:520px;">
          <tr>${["التصنيف", "القيمة (ر.س)", "النسبة %"].map((h) => `<th style="border:1px solid #d1d5db;padding:6px 8px;background:#14304d;color:#fff;font-size:11px;">${h}</th>`).join("")}</tr>
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
  const exportPDF = () => {
    const w = window.open("", "_blank", "width=1000,height=900"); if (!w) return;
    w.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>تقرير المشتريات — ${branch}</title></head><body>${buildExportHTML()}<script>window.onload=function(){window.print();}<\/script></body></html>`);
    w.document.close();
  };
  const exportExcel = () => {
    const html = `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"></head><body>${buildExportHTML()}</body></html>`;
    const blob = new Blob(["﻿" + html], { type: "application/vnd.ms-excel;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `مشتريات_${branch || "فرع"}_${from}_${to}.xls`; a.click(); URL.revokeObjectURL(a.href);
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
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-slate-500 font-bold">التاريخ</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-xl text-white px-3 py-2 text-sm [color-scheme:dark]" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-slate-500 font-bold">المورّد</label>
              <input list="supList" value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="اسم المورّد" className="bg-slate-900 border border-slate-700 rounded-xl text-white px-3 py-2 text-sm" />
              <datalist id="supList">{supplierSuggest.map((s) => <option key={s} value={s} />)}</datalist>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-slate-500 font-bold">رقم الفاتورة</label>
              <input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} placeholder="اختياري" className={`bg-slate-900 border rounded-xl text-white px-3 py-2 text-sm ${dupInvoice ? "border-red-500" : "border-slate-700"}`} />
              {dupInvoice && <span className="text-[10px] text-red-400">⚠️ رقم مستخدم من قبل لنفس الفرع</span>}
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
            <span className="text-[11px] text-slate-500">بيانات الفاتورة (المورّد · الرقم · التاريخ · نوع الفاتورة · الدفع) في الصف الأول، ثم الأصناف. الأسعار بدون ضريبة = صافي التكلفة.</span>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden mb-4">
            <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2"><span className="w-1 h-4 rounded bg-blue-500" /><h2 className="text-sm font-bold text-white">أصناف الفاتورة</h2><span className="text-[11px] text-slate-500 mr-auto">{filledItems.length} صنف</span></div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse" style={{ minWidth: 760 }}>
                <thead>
                  <tr className="bg-[#0b1220]">
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
                      <td className="px-2 py-1.5"><input list="itemList" value={r.name} onChange={(e) => editItem(r.id, { name: e.target.value })} placeholder="اسم الصنف" className="w-full min-w-[150px] bg-[#0b1220] border border-slate-700 rounded-lg text-white px-2 py-1.5 text-xs" /></td>
                      <td className="px-2 py-1.5"><input list="catList" value={r.category} onChange={(e) => editItem(r.id, { category: e.target.value })} className="w-full min-w-[110px] bg-[#0b1220] border border-slate-700 rounded-lg text-white px-2 py-1.5 text-xs" /></td>
                      <td className="px-2 py-1.5"><input type="number" step="0.01" value={r.qty} onChange={(e) => editItem(r.id, { qty: e.target.value })} placeholder="0" className="w-20 bg-[#0b1220] border border-slate-700 rounded-lg text-white px-2 py-1.5 text-center font-mono text-xs [direction:ltr]" /></td>
                      <td className="px-2 py-1.5"><input list="unitList" value={r.unit} onChange={(e) => editItem(r.id, { unit: e.target.value })} className="w-20 bg-[#0b1220] border border-slate-700 rounded-lg text-white px-2 py-1.5 text-center text-xs" /></td>
                      <td className="px-2 py-1.5"><input type="number" step="0.01" value={r.price} onChange={(e) => editItem(r.id, { price: e.target.value })} placeholder="0" className="w-24 bg-[#0b1220] border border-slate-700 rounded-lg text-white px-2 py-1.5 text-center font-mono text-xs [direction:ltr]" /></td>
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
              <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="ملاحظات الفاتورة…" className="w-full bg-[#0b1220] border border-slate-700 rounded-xl text-white p-2.5 text-sm resize-y min-h-[72px]" />
            </div>
            <div className="bg-gradient-to-br from-blue-600/20 to-slate-900 border border-blue-500/20 rounded-2xl p-4 flex flex-col justify-center gap-1">
              <div className="flex justify-between text-xs"><span className="text-slate-400 font-semibold">المجموع قبل الضريبة</span><span className="font-mono text-slate-200 [direction:ltr]">{fmt(subtotal)}</span></div>
              <div className="flex justify-between text-xs"><span className="text-slate-400 font-semibold">ضريبة القيمة المضافة {taxable ? `(${VAT_RATE}%)` : "(معفاة)"}</span><span className="font-mono text-slate-200 [direction:ltr]">{fmt(vat)}</span></div>
              <div className="flex justify-between items-center border-t border-slate-700/60 mt-1 pt-1.5"><span className="text-slate-300 font-bold text-sm">الإجمالي</span><span className="text-2xl font-black font-mono text-white [direction:ltr]">{fmt(grandTotal)} <span className="text-xs text-slate-400">ر.س</span></span></div>
            </div>
          </div>

          <div className="flex items-center gap-3 justify-end flex-wrap">
            {!canSave && <span className="text-[11px] text-amber-400/80 mr-auto">لإتمام الحفظ: اكتب اسم المورّد وأضف صنفًا واحدًا على الأقل (اسم + كمية)</span>}
            <button onClick={clearForm} className="px-6 py-3 rounded-xl bg-slate-900 border border-slate-700 text-slate-400 font-bold text-sm">تفريغ</button>
            <button onClick={save} disabled={saving} className={`px-6 py-3 rounded-xl font-extrabold text-sm transition-all ${canSave && !saving ? "bg-emerald-500 text-emerald-950" : "bg-emerald-500/40 text-emerald-100"}`}>{saving ? "جاري الحفظ…" : "💾 حفظ الفاتورة"}</button>
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
              <button onClick={exportPDF} disabled={!report.rows.length} className="px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 font-bold text-xs disabled:opacity-40">⬇ PDF</button>
              <button onClick={exportExcel} disabled={!report.rows.length} className="px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold text-xs disabled:opacity-40">⬇ Excel</button>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5"><div className="text-[10px] text-slate-500 font-bold">عدد الفواتير</div><div className="text-xl font-black font-mono mt-1 text-white">{report.count}</div></div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5"><div className="text-[10px] text-slate-500 font-bold">الإجمالي (شامل الضريبة)</div><div className="text-xl font-black font-mono mt-1 text-emerald-400 [direction:ltr]">{fmt(report.total)}</div></div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5"><div className="text-[10px] text-slate-500 font-bold">إجمالي الضريبة</div><div className="text-xl font-black font-mono mt-1 text-amber-400 [direction:ltr]">{fmt(report.totalVat)}</div></div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5"><div className="text-[10px] text-slate-500 font-bold">متوسط الفاتورة</div><div className="text-xl font-black font-mono mt-1 text-white [direction:ltr]">{fmt(report.avg)}</div></div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden mb-4">
            <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2"><span className="w-1 h-4 rounded bg-blue-500" /><h2 className="text-sm font-bold text-white">سجل الفواتير</h2><span className="text-[11px] text-slate-500 mr-auto">{branch || "—"} · {report.count} فاتورة</span></div>
            {report.rows.length === 0 ? (
              <div className="p-10 text-center text-slate-500 text-sm">لا توجد فواتير ضمن هذا النطاق. أضف فاتورة من تبويب «فاتورة جديدة».</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse" style={{ minWidth: 760 }}>
                  <thead><tr>{["التاريخ", "المورّد", "رقم الفاتورة", "النوع", "عدد الأصناف", "الضريبة", "الإجمالي", "الدفع", "ملاحظات", ""].map((h) => <th key={h} className="text-[10px] px-2 py-2.5 bg-[#0b1220] text-slate-500 uppercase whitespace-nowrap border-b border-slate-700">{h}</th>)}</tr></thead>
                  <tbody>
                    {report.rows.map((e) => (
                      <tr key={e.id} className="hover:bg-white/[0.02]">
                        <td className="px-2 py-2 text-xs text-center font-mono [direction:ltr] whitespace-nowrap border-b border-slate-800">{e.date.slice(5)}</td>
                        <td className="px-2 py-2 text-xs text-right text-slate-200 border-b border-slate-800">{e.supplier}</td>
                        <td className="px-2 py-2 text-xs text-center text-slate-400 border-b border-slate-800">{e.invoiceNo || "—"}</td>
                        <td className="px-2 py-2 text-center border-b border-slate-800"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${e.taxable ? "bg-blue-500/15 text-blue-300" : "bg-slate-500/15 text-slate-400"}`}>{e.taxable ? "ضريبية" : "غير ضريبية"}</span></td>
                        <td className="px-2 py-2 text-xs text-center text-slate-300 border-b border-slate-800">{(e.items || []).length}</td>
                        <td className="px-2 py-2 text-xs text-center font-mono text-amber-400 [direction:ltr] border-b border-slate-800">{e.vat ? fmt(e.vat) : "—"}</td>
                        <td className="px-2 py-2 text-xs text-center font-mono font-bold text-emerald-400 [direction:ltr] border-b border-slate-800">{fmt(e.total)}</td>
                        <td className="px-2 py-2 text-[11px] text-center text-slate-400 border-b border-slate-800 whitespace-nowrap">{e.payment}</td>
                        <td className="px-2 py-2 text-[11px] text-right text-slate-400 max-w-[200px] border-b border-slate-800">{e.note || ""}</td>
                        <td className="px-2 py-2 text-center border-b border-slate-800"><button onClick={() => delPurchaseRow(e.id)} className="w-7 h-7 rounded-lg bg-red-500/10 text-red-400">✕</button></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-[#0b1220] font-bold">
                      <td colSpan={5} className="px-2 py-2.5 text-xs text-right text-slate-200 border-t border-slate-600">الإجمالي العام</td>
                      <td className="px-2 py-2.5 text-xs text-center font-mono text-amber-400 [direction:ltr] border-t border-slate-600">{fmt(report.totalVat)}</td>
                      <td className="px-2 py-2.5 text-xs text-center font-mono text-emerald-400 [direction:ltr] border-t border-slate-600">{fmt(report.total)}</td>
                      <td colSpan={3} className="border-t border-slate-600" />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {report.priceChanges.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden mb-4">
              <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2">
                <span className="w-1 h-4 rounded bg-amber-500" />
                <h2 className="text-sm font-bold text-white">تنبيه تغيّر أسعار الأصناف</h2>
                <span className="text-[11px] text-amber-400 font-bold mr-auto">{report.priceChanges.length} صنف تغيّر سعره</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse" style={{ minWidth: 640 }}>
                  <thead><tr>{["الصنف", "تسلسل الأسعار", "أول سعر", "آخر سعر", "أعلى سعر", "% التغيّر"].map((h) => <th key={h} className="text-[10px] px-2 py-2.5 bg-[#0b1220] text-slate-500 uppercase whitespace-nowrap border-b border-slate-700">{h}</th>)}</tr></thead>
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
    </div>
  );
}
