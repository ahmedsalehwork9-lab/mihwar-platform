import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "./lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../context/LanguageContext";
import {
  ShoppingCart, RefreshCw, Package, Plus, X,
  Check, XCircle, PackageCheck,
  Eye, Trash2, AlertCircle, ChevronLeft, ChevronRight,
  Search, Save, ChevronDown,
  Printer, ArrowRightLeft, DollarSign,
  Clock, CheckCircle, Globe, Users, Lock,
  SplitSquareHorizontal,
} from "lucide-react";
import {
  filterVisibleProducts,
  type ProductVisibilityContext,
} from "./lib/visibility";
import {
  determineProcurementEligibility,
  canRequestProduct,
  getRequestLabel,
  getProcurementScopeLabel,
  type ProcurementContext,
} from "./lib/procurementEngine";

// =============================================================
// TYPES
// =============================================================

// Phase 2: expanded status enum — backward-compatible (pending/approved/rejected/completed preserved)
type OrderStatus = "pending" | "approved" | "partially_approved" | "rejected" | "completed";

// Phase 5: document type derived from orders.request_type
type RequestType = "PURCHASE" | "TRANSFER";

type ShopInfo = {
  shop_name:                string;
  phone?:                   string | null;
  whatsapp?:                string | null;
  email?:                   string | null;
  website?:                 string | null;
  commercial_registration?: string | null;
  address?:                 string | null;
  logo_url?:                string | null;
};

type Order = {
  id: number;
  from_shop_id: number;
  to_shop_id: number;
  status: OrderStatus;
  total_amount: number;
  notes: string | null;
  created_at: string;
  // Phase 5: document type field — optional for backward compat
  request_type?: RequestType | null;
  from_shop?: ShopInfo;
  to_shop?:   ShopInfo;
  order_items?: { id: number }[];
};

type OrderItem = {
  id: number;
  order_id: number;
  product_id: number;
  quantity: number;              // requested quantity
  approved_quantity?: number | null; // Phase 1: approved quantity (null = not yet set)
  price: number;
  product?: Product;
};

// Phase 1: mutable approved quantity state per item
type ApprovedQtyMap = Record<number, number>;

type Shop = {
  id: number;
  shop_name: string;
  group_id?: number | null;
  organization_id?: number | null;
};

type Product = {
  id: number;
  part_name: string;
  part_number: string;
  brand: string;
  model: string;
  quantity: number;
  price: number;
  shop_id: number;
  visibility_scope?: "public" | "group" | "private" | null;
};

type CartItem = {
  product: Product;
  quantity: number;
};

// =============================================================
// CONSTANTS
// =============================================================

const PAGE_SIZE = 10;

// Phase 2: STATUS_META extended with partially_approved
const STATUS_META: Record<OrderStatus, { label: { ar: string; en: string }; color: string; dot: string }> = {
  pending:            { label: { ar: "معلق",           en: "Pending"            }, color: "bg-amber-500/10 text-amber-400 border-amber-500/30",        dot: "bg-amber-400"    },
  approved:           { label: { ar: "مقبول",          en: "Approved"           }, color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",  dot: "bg-emerald-400"  },
  partially_approved: { label: { ar: "موافقة جزئية",   en: "Partially Approved" }, color: "bg-amber-500/10 text-amber-400 border-amber-500/30",       dot: "bg-amber-400"    },
  rejected:           { label: { ar: "مرفوض",         en: "Rejected"           }, color: "bg-red-500/10 text-red-400 border-red-500/30",               dot: "bg-red-400"      },
  completed:          { label: { ar: "مكتمل",          en: "Completed"          }, color: "bg-blue-500/10 text-blue-400 border-blue-500/30",            dot: "bg-blue-400"     },
};

const SCOPE_META = {
  public:  { color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", Icon: Globe  },
  group:   { color: "bg-blue-500/10 text-blue-400 border-blue-500/20",          Icon: Users  },
  private: { color: "bg-slate-700/60 text-slate-400 border-slate-600/40",       Icon: Lock   },
} as const;

// Phase 7: document number prefix map — backward-compatible (falls back to PO/TR)
// Future format: CAI-PO-000001, DMM-TR-000001
// Currently uses legacy PO-000001 format; extend BRANCH_PREFIX to enable new format.
const BRANCH_PREFIX: Record<string, string> = {
  // "riyadh": "RYD", "dammam": "DMM", "cairo": "CAI"
  // Uncomment and populate when branch codes are assigned in DB.
};

/**
 * Phase 5 — Document Number Architecture
 * Current: PO-000001 / TR-000001 (backward-compatible, always produced)
 * Future:  BRANCHCODE-PO-000001 when BRANCH_PREFIX is populated.
 * Adding branch codes: populate BRANCH_PREFIX and pass branchCode from shop data.
 * Existing documents are unaffected — their stored IDs remain valid.
 */
function buildDocNumber(orderId: number, requestType: RequestType | null | undefined, branchCode?: string): string {
  const typeCode = requestType === "TRANSFER" ? "TR" : "PO";
  const seq      = String(orderId).padStart(6, "0");
  if (branchCode && BRANCH_PREFIX[branchCode]) {
    return `${BRANCH_PREFIX[branchCode]}-${typeCode}-${seq}`;
  }
  return `${typeCode}-${seq}`;
}

// =============================================================
// HELPERS
// =============================================================

function escapeHTML(str: string | null | undefined): string {
  if (!str) return "—";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


// =============================================================
// PHASE 2 — calculateApprovedTotal
// Safe total calculation using approved_quantity when available.
// Used in: Order Details footer, Print preview, Approval screen.
// Never uses requested quantity for financial totals on approved orders.
// =============================================================

function calculateApprovedTotal(items: OrderItem[]): number {
  // approved_quantity > 0 → use it; null/0 → fall back to requested quantity
  return items.reduce((sum, item) => {
    const qty = (item.approved_quantity != null && item.approved_quantity > 0)
      ? item.approved_quantity
      : item.quantity;
    return sum + item.price * qty;
  }, 0);
}

// =============================================================
// PHASE 4 — generateVerificationQR
// Centralized QR URL generator. Abstracts the external QR service
// so a local generator can be swapped in without touching call sites.
// =============================================================

function generateVerificationQR(verifyUrl: string): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&ecc=H&data=${encodeURIComponent(verifyUrl)}&color=1E3A5F&bgcolor=ffffff&qzone=2&margin=0`;
}

// =============================================================
// BUILD PRINT HTML  (Phase 5, 6, 7, 8, 11)
// =============================================================

function buildPrintHTML(order: Order, items: OrderItem[], printLang: "ar" | "en" = "ar"): string {
  const now       = new Date();
  const dateLocale = printLang === "en" ? "en-SA" : "ar-SA";
  const date      = new Date(order.created_at).toLocaleDateString(dateLocale, { year: "numeric", month: "long", day: "numeric" });
  const issueTime = new Date(order.created_at).toLocaleTimeString(dateLocale, { hour: "2-digit", minute: "2-digit" });
  const printDate = now.toLocaleDateString(dateLocale, { year: "numeric", month: "long", day: "numeric" });
  const printTime = now.toLocaleTimeString(dateLocale, { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  // Phase 5: document type-aware title and number
  const requestType = order.request_type ?? "PURCHASE";
  const docNumber   = buildDocNumber(order.id, requestType);
  const docTitleAr  = requestType === "TRANSFER" ? "طلب تحويل"    : "أمر شراء";
  const docTitleEn  = requestType === "TRANSFER" ? "Transfer Order" : "Purchase Order";
  // Phase 3: resolve print-language title
  const docTitlePrimary   = printLang === "en" ? docTitleEn : docTitleAr;
  const docTitleSecondary = printLang === "en" ? docTitleAr : docTitleEn;

  const statusCfg: Record<string, { ar: string; en: string; bg: string; color: string; dot: string }> = {
    pending:            { ar: "معلق",         en: "Pending",            bg: "#FEF3C7", color: "#92400E", dot: "#D97706" },
    approved:           { ar: "معتمد",        en: "Approved",           bg: "#DCFCE7", color: "#166534", dot: "#16A34A" },
    partially_approved: { ar: "موافقة جزئية", en: "Partially Approved", bg: "#F3E8FF", color: "#6B21A8", dot: "#9333EA" },
    rejected:           { ar: "مرفوض",        en: "Rejected",           bg: "#FEE2E2", color: "#991B1B", dot: "#DC2626" },
    completed:          { ar: "مكتمل",        en: "Completed",          bg: "#DBEAFE", color: "#1D4ED8", dot: "#2563EB" },
  };
  const sc = statusCfg[order.status] || statusCfg.pending;

  const hasBrand = items.some(i => i.product?.brand);
  // Phase 11: show approved qty column only when at least one item has approved_quantity set
  // approved_quantity meaningful only when > 0
  const hasApprovedQty = items.some(i => i.approved_quantity != null && i.approved_quantity > 0);

  const rows = items.map((item, i) => {
    const approvedQty = (item.approved_quantity != null && item.approved_quantity > 0)
      ? item.approved_quantity
      : item.quantity;
    const lineTotal   = item.price * approvedQty;
    return `
    <tr class="${i % 2 === 0 ? "re" : "ro"}">
      <td class="tc ts">${i + 1}</td>
      <td class="tn"><span class="pn">${escapeHTML(item.product?.part_name)}</span></td>
      <td class="tm">${escapeHTML(item.product?.part_number)}</td>
      ${hasBrand ? `<td class="tbr">${escapeHTML(item.product?.brand)}</td>` : ""}
      <td class="tc tq">${item.quantity}</td>
      ${hasApprovedQty ? `<td class="tc tq" style="color:#9333EA;font-weight:800;">${approvedQty > 0 ? approvedQty : item.quantity}</td>` : ""}
      <td class="tl">${item.price.toLocaleString("en-SA")}<span class="cur"> ر.س</span></td>
      <td class="tl tf">${lineTotal.toLocaleString("en-SA")}<span class="cur"> ر.س</span></td>
    </tr>`;
  }).join("");

  // Phase 2: approved-quantity-aware total
  // Phase 3: PRINT_LABELS defined first — must precede any template literal that uses PL
  const PRINT_LABELS = {
    ar: {
      shopName: "اسم المحل", phone: "رقم الجوال", whatsapp: "واتساب",
      email: "البريد الإلكتروني", website: "الموقع الإلكتروني",
      commercialReg: "السجل التجاري", address: "العنوان",
      docNumber: "رقم الأمر", issueDate: "تاريخ الإصدار", issueTime2: "وقت الإصدار",
      orderStatus: "حالة الأمر", itemCount: "عدد الأصناف", printDate2: "تاريخ الطباعة",
      buyerInfo: "بيانات المشتري", supplierInfo: "بيانات المورد",
      itemsSection: "الأصناف المطلوبة", itemsSectionEn: "Order Items",
      notes: "ملاحظات", subtotal: "المجموع الفرعي", vat: "ضريبة القيمة المضافة",
      grandTotal: "الإجمالي الكلي", itemUnit: "صنف",
      reqQtyLabel: "الكمية المطلوبة", reqQtyEn: "Req. Qty",
      apprQtyLabel: "الكمية المعتمدة", apprQtyEn: "Appr. Qty",
      unitPriceLabel: "سعر الوحدة", unitPriceEn: "Unit Price",
      totalLabel: "الإجمالي", totalEn: "Total",
      partNameLabel: "اسم القطعة", partNameEn: "Part Name",
      partNoLabel: "رقم القطعة", partNoEn: "Part No.",
      brandLabel: "العلامة", brandEn: "Brand",
      verifyTitle: "التحقق من المستند", scanPrompt: "امسح للتحقق من صحة المستند",
      verified: "✓ تم التحقق من صحة المستند بنجاح", officialDoc: "مستند رسمي",
      issuedLabel: "صدر", printedLabel: "طُبع", itemsLabel: "الأصناف",
      verifiedBy: "Verified by MIHWAR · موثق عبر منصة محور",
      verifiedDesc: "تم إصدار هذا المستند والتحقق من صحته إلكترونياً عبر منصة محور.",
      docAuthenticity: "Document Authenticity · موثق إلكترونياً عبر منصة محور",
      sigName: "الاسم · Name", sigSign: "التوقيع · Signature", sigDate: "التاريخ · Date",
    },
    en: {
      shopName: "Shop Name", phone: "Phone", whatsapp: "WhatsApp",
      email: "Email", website: "Website",
      commercialReg: "Commercial Reg.", address: "Address",
      docNumber: "Document No.", issueDate: "Issue Date", issueTime2: "Issue Time",
      orderStatus: "Order Status", itemCount: "Item Count", printDate2: "Print Date",
      buyerInfo: "Buyer Information", supplierInfo: "Supplier Information",
      itemsSection: "Order Items", itemsSectionEn: "Order Items",
      notes: "Notes", subtotal: "Subtotal", vat: "VAT",
      grandTotal: "Grand Total", itemUnit: "items",
      reqQtyLabel: "Req. Qty", reqQtyEn: "Req. Qty",
      apprQtyLabel: "Appr. Qty", apprQtyEn: "Appr. Qty",
      unitPriceLabel: "Unit Price", unitPriceEn: "Unit Price",
      totalLabel: "Total", totalEn: "Total",
      partNameLabel: "Part Name", partNameEn: "Part Name",
      partNoLabel: "Part No.", partNoEn: "Part No.",
      brandLabel: "Brand", brandEn: "Brand",
      verifyTitle: "Document Verification", scanPrompt: "Scan to verify this document",
      verified: "✓ Document verified successfully", officialDoc: "Official Document",
      issuedLabel: "Issued", printedLabel: "Printed", itemsLabel: "Items",
      verifiedBy: "Verified by MIHWAR · موثق عبر منصة محور",
      verifiedDesc: "This document has been digitally issued and verified via the MIHWAR platform.",
      docAuthenticity: "Document Authenticity · موثق إلكترونياً عبر منصة محور",
      sigName: "Name", sigSign: "Signature", sigDate: "Date",
    },
  };
  const PL = PRINT_LABELS[printLang];

  // These must come AFTER PL is defined because logoSVG uses PL.verified
  const subtotal  = calculateApprovedTotal(items);
  const verifyUrl = `${window.location.origin}/verify/${order.id}`;
  const qrUrl     = generateVerificationQR(verifyUrl);

  const logoSVG = `<div style="display:flex;flex-direction:column;gap:5px;align-items:flex-start;">
    <div style="font-family:'IBM Plex Sans Arabic',Tahoma,Arial;font-weight:800;font-size:32px;color:#0A2A6B;line-height:1;letter-spacing:-0.5px;">محور</div>
    <div style="font-family:'IBM Plex Sans Arabic',Tahoma,Arial;font-weight:700;font-size:9px;color:#1E40AF;letter-spacing:0.5px;text-transform:uppercase;">MIHWAR Verification Center</div>
    <div style="font-family:'IBM Plex Sans Arabic',Tahoma,Arial;font-weight:400;font-size:9px;color:#10B981;letter-spacing:0.2px;">${PL.verified}</div>
    <div style="font-family:'IBM Plex Sans Arabic',Tahoma,Arial;font-weight:400;font-size:8px;color:#94A3B8;letter-spacing:0.3px;">Verified Digital Document</div>
  </div>`;

  function shopInfoRows(shop: ShopInfo | undefined, fields: { key: keyof ShopInfo; label: string }[]): string {
    if (!shop) return "";
    return fields
      .filter(({ key }) => { const v = shop[key]; return v !== null && v !== undefined && String(v).trim() !== ""; })
      .map(({ key, label }) => `<div class="icr"><span class="ick">${label}</span><span class="icv">${escapeHTML(String(shop[key]))}</span></div>`)
      .join("");
  }

  function shopLogoImg(shop: ShopInfo | undefined): string {
    if (!shop?.logo_url) return "";
    return `<div style="width:60px;height:60px;border-radius:10px;background:#fff;box-shadow:0 1px 6px rgba(0,0,0,0.12);overflow:hidden;flex-shrink:0;margin-left:10px;display:flex;align-items:center;justify-content:center;"><img src="${escapeHTML(shop.logo_url)}" alt="logo" style="width:100%;height:100%;object-fit:contain;display:block;" onerror="this.parentElement.style.display='none'" /></div>`;
  }

  const buyerFields:    { key: keyof ShopInfo; label: string }[] = [
    { key: "shop_name", label: PL.shopName }, { key: "phone", label: PL.phone },
    { key: "whatsapp", label: PL.whatsapp }, { key: "email", label: PL.email },
    { key: "address", label: PL.address },
  ];
  const supplierFields: { key: keyof ShopInfo; label: string }[] = [
    { key: "shop_name", label: PL.shopName }, { key: "phone", label: PL.phone },
    { key: "whatsapp", label: PL.whatsapp }, { key: "email", label: PL.email },
    { key: "website", label: PL.website },
    { key: "commercial_registration", label: PL.commercialReg },
    { key: "address", label: PL.address },
  ];

  // Phase 8: dynamic signature blocks by document type — Phase 3: bilingual
  const purchaseSigsAr = [["إعداد الطلب","Prepared By"],["اعتماد الإدارة","Approved By"],["توقيع المورد","Supplier Signature"],["توقيع المشتري","Buyer Signature"]];
  const transferSigsAr = [["مدير الفرع المرسل","Sending Branch Mgr"],["مدير الفرع المستلم","Receiving Branch Mgr"],["اعتماد الإدارة","Approved By"]];
  const purchaseSigsEn = [["Prepared By","إعداد الطلب"],["Approved By","اعتماد الإدارة"],["Supplier Signature","توقيع المورد"],["Buyer Signature","توقيع المشتري"]];
  const transferSigsEn = [["Sending Branch Mgr","مدير الفرع المرسل"],["Receiving Branch Mgr","مدير الفرع المستلم"],["Approved By","اعتماد الإدارة"]];
  const sigBlocks = printLang === "en"
    ? (requestType === "TRANSFER" ? transferSigsEn : purchaseSigsEn)
    : (requestType === "TRANSFER" ? transferSigsAr : purchaseSigsAr);
  const sigColCount  = sigBlocks.length;

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<title>${docNumber} — ${docTitleAr} MIHWAR</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap');
:root{--navy:#1E3A5F;--blue1:#1E40AF;--blue2:#2563EB;--bg:#F8FAFC;--border:#CBD5E1;--border2:#E2E8F0;--text:#1E3A5F;--muted:#64748B;--muted2:#94A3B8;}
@page{size:A4 portrait;margin:9mm 11mm;}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'IBM Plex Sans Arabic',Tahoma,'Arial Unicode MS',Arial,sans-serif;font-size:12px;color:var(--text);background:#fff;line-height:1.6;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.wm{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-30deg);font-size:80px;font-weight:800;letter-spacing:0.12em;color:rgba(30,58,95,0.02);white-space:nowrap;pointer-events:none;z-index:0;user-select:none;}
.page{width:100%;max-width:794px;margin:0 auto;position:relative;z-index:1;}
.hdr{background:#fff;border:1.5px solid var(--border);border-radius:10px 10px 0 0;border-bottom:3px solid var(--blue1);padding:16px 22px 14px;display:flex;align-items:center;justify-content:space-between;gap:16px;page-break-inside:avoid;}
.logo-wrap{flex-shrink:0;min-width:160px;}.hdr-title{flex:1;text-align:center;}
.title-ar{font-size:26px;font-weight:800;color:var(--navy);line-height:1;}.title-en{font-size:11px;font-weight:600;color:var(--muted);letter-spacing:3px;text-transform:uppercase;margin-top:4px;display:block;}
.title-rule{width:40px;height:2.5px;background:var(--blue2);margin:8px auto 0;border-radius:2px;}
.po-box{background:var(--blue1);border-radius:8px;padding:10px 16px;min-width:138px;flex-shrink:0;}
.po-lbl{font-size:8px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#93C5FD;display:block;text-align:right;}
.po-num{font-family:'JetBrains Mono',monospace;font-size:20px;font-weight:600;color:#fff;display:block;text-align:right;letter-spacing:0.5px;line-height:1.2;margin-top:3px;}
.po-date{font-size:10px;color:#BFDBFE;display:block;text-align:right;margin-top:3px;}
.sbar{background:var(--navy);border-right:1.5px solid var(--border);border-left:1.5px solid var(--border);padding:7px 22px;display:flex;align-items:center;justify-content:space-between;gap:8px;}
.meta-grp{display:flex;align-items:center;gap:14px;}.mi{display:flex;align-items:center;gap:5px;}
.mk{font-size:8px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#475569;}
.mv{font-size:9.5px;color:#94A3B8;font-family:'JetBrains Mono',monospace;}
.msep{width:1px;height:13px;background:#2D4A6A;}
.sbadge{display:inline-flex;align-items:center;gap:5px;padding:4px 12px 4px 10px;border-radius:20px;border:none;font-size:11px;font-weight:700;}
.sdot{width:7px;height:7px;border-radius:50%;flex-shrink:0;}
.off-tag{font-size:8px;font-weight:700;letter-spacing:1px;color:#475569;text-transform:uppercase;border:1px solid #2D4A6A;padding:2px 8px;border-radius:4px;}
.icard-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px;page-break-inside:avoid;}
.icard{border:1.5px solid var(--border);border-radius:9px;overflow:hidden;}
.ich{background:var(--blue1);padding:8px 14px;display:flex;align-items:center;justify-content:space-between;gap:8px;}
.ich-left{display:flex;align-items:center;flex:1;min-width:0;}
.ich-ar{font-size:12px;font-weight:700;color:#fff;}.ich-en{font-size:9px;font-weight:600;color:#93C5FD;letter-spacing:0.5px;}
.icb{padding:10px 14px;background:#fff;}
.icr{display:flex;align-items:baseline;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border2);gap:8px;}
.icr:last-child{border-bottom:none;}
.ick{font-size:10px;color:var(--muted);font-weight:600;white-space:nowrap;flex-shrink:0;}
.icv{font-size:11px;color:var(--text);font-weight:700;text-align:left;word-break:break-all;}
.icv.mono{font-family:'JetBrains Mono',monospace;}
.slbl{display:flex;align-items:center;gap:8px;margin:13px 0 7px;}
.sbar2{width:4px;height:17px;background:var(--blue2);border-radius:3px;}
.sar{font-size:13px;font-weight:700;color:var(--navy);}.sen{font-size:9px;font-weight:600;color:var(--muted2);letter-spacing:1px;text-transform:uppercase;margin-top:1px;}
.twrap{border:1.5px solid var(--border);border-radius:9px;overflow:hidden;}
table.items{width:100%;border-collapse:collapse;table-layout:auto;}
table.items thead tr{background:var(--blue1);}
table.items thead th{padding:8px 10px;font-size:8.5px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;color:#93C5FD;text-align:right;white-space:normal;word-break:break-word;border-bottom:1px solid #1E3A8A;}
th.th-en{font-size:8px;display:block;color:#60A5FA;font-weight:500;margin-top:1px;}
th.tc{text-align:center;}th.tl{text-align:left;}
tr.re{background:#fff;}tr.ro{background:var(--bg);}
table.items tbody tr{border-bottom:1px solid var(--border2);page-break-inside:avoid;}
table.items tbody tr:last-child{border-bottom:none;}
table.items tbody td{padding:8px 10px;font-size:11.5px;color:var(--text);vertical-align:middle;}
td.tc{text-align:center;}td.ts{font-weight:700;color:var(--muted2);font-size:10px;width:28px;}
.pn{font-weight:700;font-size:12.5px;color:var(--navy);}
td.tm{font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--muted);}
td.tbr{font-size:11px;color:var(--muted);}td.tq{font-weight:700;font-size:13px;color:var(--navy);}
td.tl{text-align:left;}td.tf{font-weight:700;font-size:13px;color:var(--navy);}
.cur{font-size:9px;font-weight:500;color:var(--muted2);}
.brow{display:flex;border:1.5px solid var(--border);border-top:none;border-radius:0 0 9px 9px;overflow:hidden;page-break-inside:avoid;}
.npane{flex:1;background:#FFFBEB;border-left:1.5px solid var(--border2);padding:12px 14px;}
.nlbl{font-size:9px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#B45309;margin-bottom:5px;}
.ntxt{font-size:11.5px;color:#78350F;line-height:1.7;}
.spane{width:256px;flex-shrink:0;background:var(--bg);}
.sr{display:flex;justify-content:space-between;align-items:center;padding:8px 14px;border-bottom:1px solid var(--border);font-size:12px;}
.sk{color:var(--muted);font-weight:600;}.sv{font-weight:700;color:var(--text);font-family:'JetBrains Mono',monospace;}
.stot{background:var(--blue1);padding:14px;display:flex;justify-content:space-between;align-items:center;}
.stk{font-size:11.5px;font-weight:700;color:#BFDBFE;}.stv{font-size:22px;font-weight:800;color:#34D399;font-family:'JetBrains Mono',monospace;}
.stc{font-size:11px;font-weight:600;color:#64A07A;margin-right:4px;}
.qsrow{display:flex;gap:12px;margin-top:16px;page-break-inside:avoid;align-items:stretch;}
.qrcard{width:190px;flex-shrink:0;border:1.5px solid var(--border);border-radius:12px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 2px 8px rgba(30,58,95,0.08);}
.qrch{background:var(--blue1);padding:10px 12px;}
.qrcar{font-size:12px;font-weight:700;color:#fff;display:block;text-align:center;}
.qrcen{font-size:8px;font-weight:500;color:#93C5FD;display:block;text-align:center;margin-top:2px;}
.qrcb{flex:1;background:#F8FAFC;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:14px 12px 12px;}
.qrpo{font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:700;color:var(--navy);display:block;text-align:center;}
.siggrid{flex:1;display:grid;grid-template-columns:repeat(${sigColCount},1fr);gap:10px;}
.sigcard{border:1.5px solid var(--border);border-radius:9px;overflow:hidden;display:flex;flex-direction:column;page-break-inside:avoid;}
.sigch{background:var(--blue1);padding:9px 10px;text-align:center;}
.sigar{font-size:11px;font-weight:700;color:#fff;display:block;}.sigen{font-size:8px;font-weight:500;color:#93C5FD;display:block;margin-top:2px;}
.sigcb{flex:1;background:#fff;padding:11px 12px;display:flex;flex-direction:column;gap:9px;}
.sigf{display:flex;flex-direction:column;gap:2px;}
.sigfl{font-size:7.5px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;color:var(--muted2);}
.sigl{border-bottom:1px solid var(--border);height:22px;}.siglg{border-bottom:1px solid var(--border);height:34px;}
.ftr{margin-top:14px;background:var(--blue1);border-radius:0 0 10px 10px;border-top:3px solid var(--blue2);padding:11px 22px;display:flex;align-items:center;justify-content:space-between;gap:12px;page-break-inside:avoid;}
@media print{body{background:#fff !important;}.wm{position:fixed;}.page{page-break-after:always;}.icard-grid,.brow,.qsrow,.sigcard,.ftr{page-break-inside:avoid;}table.items{page-break-inside:auto;}table.items thead{display:table-header-group;}table.items tbody tr{page-break-inside:avoid;page-break-after:auto;}}
</style>
</head>
<body>
<div class="wm">محور MIHWAR</div>
<div class="page">
<div class="hdr">
  <div class="logo-wrap">${logoSVG}</div>
  <div class="hdr-title"><div class="title-ar">${docTitlePrimary}</div><span class="title-en">${docTitleSecondary}</span><div class="title-rule"></div></div>
  <div class="po-box"><span class="po-lbl">${PL.docNumber}</span><span class="po-num">${docNumber}</span><span class="po-date">${date}</span></div>
</div>
<div class="sbar">
  <div class="meta-grp">
    <div class="mi"><span class="mk">${PL.issuedLabel}</span><span class="mv">${issueTime}</span></div>
    <div class="msep"></div>
    <div class="mi"><span class="mk">${PL.printedLabel}</span><span class="mv">${printTime}</span></div>
    <div class="msep"></div>
    <div class="mi"><span class="mk">${PL.itemsLabel}</span><span class="mv">${items.length}</span></div>
  </div>
  <div style="display:flex;align-items:center;gap:8px;">
    <span class="sbadge" style="background:${sc.bg};color:${sc.color};"><span class="sdot" style="background:${sc.dot};"></span>${sc.ar}<span style="font-size:9px;font-weight:500;opacity:0.7;margin-right:3px;">${sc.en}</span></span>
    <span class="off-tag">${PL.officialDoc}</span>
  </div>
</div>
<div class="icard-grid">
  <div class="icard">
    <div class="ich">
      <div class="ich-left">${shopLogoImg(order.from_shop)}<div><div class="ich-ar">${PL.buyerInfo}</div><div class="ich-en">Buyer Information</div></div></div>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#93C5FD" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
    </div>
    <div class="icb">
      ${shopInfoRows(order.from_shop, buyerFields)}
      <div class="icr"><span class="ick">${PL.docNumber}</span><span class="icv mono">${docNumber}</span></div>
      <div class="icr"><span class="ick">${PL.issueDate}</span><span class="icv">${date}</span></div>
      <div class="icr"><span class="ick">${PL.issueTime2}</span><span class="icv mono">${issueTime}</span></div>
    </div>
  </div>
  <div class="icard">
    <div class="ich">
      <div class="ich-left">${shopLogoImg(order.to_shop)}<div><div class="ich-ar">${PL.supplierInfo}</div><div class="ich-en">Supplier Information</div></div></div>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#93C5FD" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
    </div>
    <div class="icb">
      ${shopInfoRows(order.to_shop, supplierFields)}
      <div class="icr"><span class="ick">${PL.orderStatus}</span><span class="sbadge" style="background:${sc.bg};color:${sc.color};padding:2px 8px;font-size:10px;"><span class="sdot" style="background:${sc.dot};width:5px;height:5px;"></span>${sc.ar}</span></div>
      <div class="icr"><span class="ick">${PL.itemCount}</span><span class="icv">${items.length} ${PL.itemUnit}</span></div>
      <div class="icr"><span class="ick">${PL.printDate2}</span><span class="icv">${printDate}</span></div>
    </div>
  </div>
</div>
<div class="slbl"><div class="sbar2"></div><div><div class="sar">${PL.itemsSection}</div><div class="sen">${PL.itemsSectionEn}</div></div></div>
<div class="twrap">
  <table class="items">
    <thead><tr>
      <th style="width:28px" class="tc">#</th>
      <th>${PL.partNameLabel}<span class="th-en">${PL.partNameEn}</span></th>
      <th style="width:100px">${PL.partNoLabel}<span class="th-en">${PL.partNoEn}</span></th>
      ${hasBrand ? `<th style="width:72px">${PL.brandLabel}<span class="th-en">${PL.brandEn}</span></th>` : ""}
      <th style="width:48px" class="tc">${PL.reqQtyLabel}<span class="th-en">${PL.reqQtyEn}</span></th>
      ${hasApprovedQty ? `<th style="width:48px" class="tc">${PL.apprQtyLabel}<span class="th-en">${PL.apprQtyEn}</span></th>` : ""}
      <th style="width:88px" class="tl">${PL.unitPriceLabel}<span class="th-en">${PL.unitPriceEn}</span></th>
      <th style="width:90px" class="tl">${PL.totalLabel}<span class="th-en">${PL.totalEn}</span></th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
</div>
<div class="brow">
  ${order.notes ? `<div class="npane"><div class="nlbl">${PL.notes}</div><div class="ntxt">${escapeHTML(order.notes)}</div></div>` : `<div style="flex:1;background:var(--bg);"></div>`}
  <div class="spane">
    <div class="sr"><span class="sk">${PL.subtotal}</span><span class="sv">${subtotal.toLocaleString("en-SA")} ر.س</span></div>
    <div class="sr"><span class="sk">${PL.vat}</span><span class="sv" style="color:var(--muted2);">—</span></div>
    <div class="stot"><span class="stk">${PL.grandTotal}</span><span class="stv">${subtotal.toLocaleString("en-SA")}<span class="stc">ر.س</span></span></div>
  </div>
</div>
<div class="qsrow">
  <div class="qrcard">
    <div class="qrch"><span class="qrcar">${PL.verifyTitle}</span><span class="qrcen">MIHWAR Verification Center</span></div>
    <div class="qrcb">
      <div style="background:#fff;border:2px solid #E2E8F0;border-radius:10px;padding:8px;display:inline-block;box-shadow:0 1px 4px rgba(0,0,0,0.08);"><img src="${qrUrl}" alt="QR" style="width:140px;height:140px;display:block;" /></div>
      <div style="text-align:center;margin-top:8px;">
        <span class="qrpo">${docNumber}</span>
        <span style="display:block;margin-top:4px;font-size:8.5px;color:#475569;line-height:1.5;">${PL.scanPrompt}</span>
        <span style="display:block;margin-top:3px;font-size:8px;color:#10B981;font-weight:700;">✓ Verified by MIHWAR</span>
        <span style="display:block;margin-top:6px;font-family:'JetBrains Mono',monospace;font-size:6.5px;color:#94A3B8;word-break:break-all;line-height:1.5;border-top:1px solid #E2E8F0;padding-top:5px;">${verifyUrl}</span>
      </div>
    </div>
  </div>
  <div class="siggrid">
    ${sigBlocks.map(([primary, secondary]) => `
    <div class="sigcard">
      <div class="sigch"><span class="sigar">${primary}</span><span class="sigen">${secondary}</span></div>
      <div class="sigcb">
        <div class="sigf"><span class="sigfl">${PL.sigName}</span><div class="sigl"></div></div>
        <div class="sigf"><span class="sigfl">${PL.sigSign}</span><div class="siglg"></div></div>
        <div class="sigf"><span class="sigfl">${PL.sigDate}</span><div class="sigl"></div></div>
      </div>
    </div>`).join("")}
  </div>
</div>
<div style="margin-top:12px;border:1.5px solid #BBF7D0;border-radius:10px;overflow:hidden;page-break-inside:avoid;">
  <div style="background:#DCFCE7;padding:9px 16px;display:flex;align-items:center;gap:8px;"><span style="font-size:14px;">✓</span><div style="font-family:'IBM Plex Sans Arabic',Tahoma;font-weight:700;font-size:11.5px;color:#166534;">${PL.verifiedBy}</div></div>
  <div style="background:#F0FDF4;padding:9px 16px;display:flex;justify-content:space-between;align-items:center;gap:12px;">
    <div style="font-size:9.5px;color:#15803D;line-height:1.7;">${PL.verifiedDesc}</div>
    <div style="font-size:9px;color:#16A34A;white-space:nowrap;font-style:italic;">This document has been digitally verified through MIHWAR Marketplace.</div>
  </div>
</div>
<div style="margin-top:8px;border:1.5px solid var(--border);border-radius:10px;overflow:hidden;page-break-inside:avoid;">
  <div style="background:var(--navy);padding:7px 16px;"><span style="font-weight:700;font-size:10px;color:#fff;">${PL.docAuthenticity}</span></div>
  <div style="background:var(--bg);padding:9px 16px;display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:5px 16px;">
    <div style="font-size:9px;color:var(--muted);"><span style="font-weight:700;color:var(--muted2);display:block;font-size:8px;text-transform:uppercase;">Document ID</span><span style="font-family:'JetBrains Mono',monospace;color:var(--navy);font-weight:700;">${docNumber}</span></div>
    <div style="font-size:9px;color:var(--muted);"><span style="font-weight:700;color:var(--muted2);display:block;font-size:8px;text-transform:uppercase;">Document Type</span><span style="color:#1D4ED8;font-weight:700;">${docTitleEn}</span></div>
    <div style="font-size:9px;color:var(--muted);"><span style="font-weight:700;color:var(--muted2);display:block;font-size:8px;text-transform:uppercase;">Verification Status</span><span style="color:#16A34A;font-weight:700;">✓ Verified</span></div>
    <div style="font-size:9px;color:var(--muted);"><span style="font-weight:700;color:var(--muted2);display:block;font-size:8px;text-transform:uppercase;">Verification Time</span><span style="font-family:'JetBrains Mono',monospace;color:var(--navy);font-weight:600;">${printDate} ${printTime}</span></div>
  </div>
</div>
<div class="ftr" style="text-align:center;justify-content:center;flex-direction:column;gap:5px;padding:12px 22px;">
  <div style="font-weight:800;font-size:16px;color:#fff;letter-spacing:0.5px;">محور · MIHWAR</div>
  <div style="font-size:9px;color:#93C5FD;letter-spacing:2px;text-transform:uppercase;">MIHWAR Verification Center</div>
  <div style="font-size:8.5px;color:#60A5FA;">Powered by MIHWAR Marketplace · منصة محور لقطع غيار المركبات</div>
  <div style="font-family:'JetBrains Mono',monospace;font-size:8px;color:#BFDBFE;margin-top:2px;">www.mihwarb2b.com · ${docNumber} · ${printDate}</div>
</div>
</div></body></html>`;
}

// =============================================================
// SUB-COMPONENTS
// =============================================================

function StatusBadge({ status, isRTL }: { status: OrderStatus; isRTL: boolean }) {
  const meta = STATUS_META[status] ?? STATUS_META.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border ${meta.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${meta.dot}`} />
      {meta.label[isRTL ? "ar" : "en"]}
    </span>
  );
}

function VisibilityBadge({ scope, isRTL }: { scope: "public" | "group" | "private" | null | undefined; isRTL: boolean }) {
  const resolved = scope ?? "public";
  const meta     = SCOPE_META[resolved];
  const label    = getProcurementScopeLabel(resolved, isRTL ? "ar" : "en");
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold border shrink-0 ${meta.color}`} title={label}>
      <meta.Icon size={9} className="shrink-0" />
      <span className="truncate max-w-[72px]">{label}</span>
    </span>
  );
}

// =============================================================
// MAIN COMPONENT
// =============================================================

export default function OrdersPage() {
  const { ownedShopId, isAdmin } = useAuth() as any;
  const { t, isRTL } = useLang();
  const lang = isRTL ? "ar" : "en";

  const [orders, setOrders]                     = useState<Order[]>([]);
  const [shops, setShops]                       = useState<Shop[]>([]);
  const [loading, setLoading]                   = useState(false);
  const [error, setError]                       = useState<string | null>(null);
  const [toast, setToast]                       = useState<string | null>(null);
  const [tab, setTab]                           = useState<"all" | "incoming" | "outgoing">("all");
  const [statusFilter, setStatusFilter]         = useState<"all" | OrderStatus>("all");
  const [search, setSearch]                     = useState("");
  const [page, setPage]                         = useState(1);
  const [detailOrder, setDetailOrder]           = useState<Order | null>(null);
  const [detailItems, setDetailItems]           = useState<OrderItem[]>([]);
  const [detailLoading, setDetailLoading]       = useState(false);
  const [showModal, setShowModal]               = useState(false);
  const [supplierShopId, setSupplierShopId]     = useState<number | "">("");
  const [supplierProducts, setSupplierProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts]   = useState(false);
  const [productSearch, setProductSearch]       = useState("");
  const [cart, setCart]                         = useState<CartItem[]>([]);
  const [orderNotes, setOrderNotes]             = useState("");
  const [modalError, setModalError]             = useState<string | null>(null);
  const [saving, setSaving]                     = useState(false);
  const [actionId, setActionId]                 = useState<number | null>(null);
  const [requesterShop, setRequesterShop]       = useState<Shop | null>(null);

  // Phase 1+3: partial approval state
  const [showPartialEditor, setShowPartialEditor] = useState(false);
  const [approvedQtyMap, setApprovedQtyMap]       = useState<ApprovedQtyMap>({});
  const [partialSaving, setPartialSaving]         = useState(false);

  // -----------------------------------------------------------
  // CONTEXT BUILDERS
  // -----------------------------------------------------------

  const buildVisibilityContext = useCallback(
    (product: Product, supplierShopData: Shop | null): ProductVisibilityContext => ({
      requesterShopId:         ownedShopId ?? null,
      supplierShopId:          product.shop_id,
      requesterGroupId:        requesterShop?.group_id ?? null,
      supplierGroupId:         supplierShopData?.group_id ?? null,
      visibilityScope:         product.visibility_scope ?? null,
      requesterOrganizationId: requesterShop?.organization_id ?? null,
      supplierOrganizationId:  supplierShopData?.organization_id ?? null,
    }),
    [ownedShopId, requesterShop]
  );

  const buildProcurementContext = useCallback(
    (supplierShopData: Shop | null): ProcurementContext => ({
      requesterOrganizationId: requesterShop?.organization_id ?? null,
      supplierOrganizationId:  supplierShopData?.organization_id ?? null,
      requesterGroupId:        requesterShop?.group_id ?? null,
      supplierGroupId:         supplierShopData?.group_id ?? null,
      requesterShopId:         ownedShopId ?? null,
      supplierShopId:          supplierShopData?.id ?? null,
    }),
    [ownedShopId, requesterShop]
  );

  const getProductEligibility = useCallback(
    (product: Product, supplierShopData: Shop | null) => {
      if (isAdmin) return { canView: true, canTransfer: true, canPurchase: true, requestType: "PURCHASE" as const };
      return determineProcurementEligibility(
        buildProcurementContext(supplierShopData),
        buildVisibilityContext(product, supplierShopData)
      );
    },
    [isAdmin, buildProcurementContext, buildVisibilityContext]
  );

  // -----------------------------------------------------------
  // DATA FETCHING
  // -----------------------------------------------------------

  const fetchOrders = useCallback(async () => {
    if (!isAdmin && !ownedShopId) return;
    setLoading(true);
    try {
      let query = supabase
        .from("orders")
        .select(`
          *,
          from_shop:shops!orders_from_shop_id_fkey(
            shop_name, phone, whatsapp, email,
            website, commercial_registration, address, logo_url
          ),
          to_shop:shops!orders_to_shop_id_fkey(
            shop_name, phone, whatsapp, email,
            website, commercial_registration, address, logo_url
          ),
          order_items(id)
        `);
      if (!isAdmin) query = query.or(`from_shop_id.eq.${ownedShopId},to_shop_id.eq.${ownedShopId}`);
      const { data, error: fetchError } = await query.order("created_at", { ascending: false });
      if (fetchError) setError(fetchError.message);
      else setOrders((data as Order[]) || []);
    } catch (e: any) {
      setError(e?.message ?? t("Failed to load orders", "فشل تحميل الطلبات"));
    } finally {
      setLoading(false);
    }
  }, [isAdmin, ownedShopId, t]);

  const fetchShops = useCallback(async () => {
    try {
      const { data } = await supabase
        .from("shops")
        .select("id, shop_name, group_id, organization_id")
        .order("shop_name");
      const list = (data as Shop[]) || [];
      setShops(list);
      if (ownedShopId) setRequesterShop(list.find(s => s.id === ownedShopId) ?? null);
    } catch {
      // Non-critical
    }
  }, [ownedShopId]);

  useEffect(() => { fetchOrders(); fetchShops(); }, [fetchOrders, fetchShops]);

  useEffect(() => {
    if (!supplierShopId) { setSupplierProducts([]); return; }
    setLoadingProducts(true);
    supabase
      .from("products")
      .select("*, visibility_scope")
      .eq("shop_id", supplierShopId)
      .gt("quantity", 0)
      .order("part_name")
      .then(({ data, error: fetchError }) => {
        if (fetchError) { setModalError(fetchError.message); setSupplierProducts([]); }
        else setSupplierProducts((data as Product[]) || []);
        setLoadingProducts(false);
      });
  }, [supplierShopId]);

  // -----------------------------------------------------------
  // DERIVED STATE
  // -----------------------------------------------------------

  const resolvedSupplierShop = useMemo<Shop | null>(
    () => supplierShopId ? (shops.find(s => s.id === supplierShopId) ?? null) : null,
    [supplierShopId, shops]
  );

  const currentProcurementCtx = useMemo<ProcurementContext>(
    () => buildProcurementContext(resolvedSupplierShop),
    [buildProcurementContext, resolvedSupplierShop]
  );

  const requestTypeLabel = useMemo(() => {
    const elig = determineProcurementEligibility(currentProcurementCtx);
    return getRequestLabel(elig.requestType, lang);
  }, [currentProcurementCtx, lang]);

  const visibleSupplierProducts = useMemo<Product[]>(() => {
    if (isAdmin) return supplierProducts;
    const scopeFiltered = filterVisibleProducts(
      supplierProducts,
      (p) => buildVisibilityContext(p, resolvedSupplierShop)
    );
    return scopeFiltered.filter(p => {
      try {
        return determineProcurementEligibility(
          buildProcurementContext(resolvedSupplierShop),
          buildVisibilityContext(p, resolvedSupplierShop)
        ).canView;
      } catch { return false; }
    });
  }, [isAdmin, supplierProducts, resolvedSupplierShop, buildVisibilityContext, buildProcurementContext]);

  const { filtered, counts } = useMemo(() => {
    const q = search.trim().toLowerCase();
    let pendingCount = 0, approvedCount = 0, rejectedCount = 0, completedCount = 0, partialCount = 0;
    let totalValue = 0, incomingCount = 0, outgoingCount = 0;
    const result: Order[] = [];
    for (const o of orders) {
      if (o.status === "pending")            pendingCount++;
      else if (o.status === "approved")      approvedCount++;
      else if (o.status === "rejected")      rejectedCount++;
      else if (o.status === "completed")     completedCount++;
      else if (o.status === "partially_approved") partialCount++;
      totalValue += o.total_amount;
      if (!isAdmin) {
        if (o.to_shop_id === ownedShopId)   incomingCount++;
        if (o.from_shop_id === ownedShopId) outgoingCount++;
      }
      const matchesTab    = isAdmin ? true : tab === "incoming" ? o.to_shop_id === ownedShopId : tab === "outgoing" ? o.from_shop_id === ownedShopId : true;
      const matchesStatus = statusFilter === "all" || o.status === statusFilter;
      const matchesSearch = !q || String(o.id).includes(q) || o.from_shop?.shop_name?.toLowerCase().includes(q) || o.to_shop?.shop_name?.toLowerCase().includes(q);
      if (matchesTab && matchesStatus && matchesSearch) result.push(o);
    }
    return { filtered: result, counts: { all: orders.length, incoming: isAdmin ? orders.length : incomingCount, outgoing: isAdmin ? orders.length : outgoingCount, pending: pendingCount, approved: approvedCount + completedCount, rejected: rejectedCount, partial: partialCount, totalValue } };
  }, [orders, tab, statusFilter, search, ownedShopId, isAdmin]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageItems  = useMemo(() => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filtered, page]);

  const filteredSupplierProducts = useMemo(() => {
    if (!productSearch.trim()) return visibleSupplierProducts;
    const q = productSearch.toLowerCase();
    return visibleSupplierProducts.filter(p => p.part_name.toLowerCase().includes(q) || p.part_number.toLowerCase().includes(q));
  }, [visibleSupplierProducts, productSearch]);

  // Phase 5: document title for the current detail order
  const detailDocTitle = useMemo(() => {
    if (!detailOrder) return "";
    return detailOrder.request_type === "TRANSFER"
      ? t("Transfer Order", "طلب تحويل")
      : t("Purchase Order", "أمر شراء");
  }, [detailOrder, t]);

  const detailDocNumber = useMemo(() => {
    if (!detailOrder) return "";
    return buildDocNumber(detailOrder.id, detailOrder.request_type);
  }, [detailOrder]);

  // -----------------------------------------------------------
  // ACTIONS
  // -----------------------------------------------------------

  const showToast = useCallback((msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3500); }, []);

  // Re-fetch order items after an approval action, then sync the approved-qty map
  const refreshDetailItems = useCallback(async (orderId: number) => {
    try {
      const { data, error: fetchError } = await supabase
        .from("order_items")
        .select("*, product:products(*)")
        .eq("order_id", orderId);
      if (fetchError) { setError(fetchError.message); return; }
      const items = (data as OrderItem[]) || [];
      setDetailItems(items);
      const map: ApprovedQtyMap = {};
      items.forEach(i => {
        map[i.id] = (i.approved_quantity != null && i.approved_quantity > 0)
          ? i.approved_quantity
          : i.quantity;
      });
      setApprovedQtyMap(map);
    } catch (e: any) {
      setError(e?.message ?? "Failed to refresh order items");
    }
  }, []);

  const openDetail = useCallback(async (order: Order) => {
    setDetailOrder(order);
    setDetailItems([]);
    setDetailLoading(true);
    setShowPartialEditor(false);
    setApprovedQtyMap({});
    try {
      const { data, error: fetchError } = await supabase
        .from("order_items")
        .select("*, product:products(*)")
        .eq("order_id", order.id);
      if (fetchError) setError(fetchError.message);
      else {
        const items = (data as OrderItem[]) || [];
        setDetailItems(items);
        // Initialize approved qty map:
        // - If approved_quantity is already set in DB → use it (re-approval / partial continuation)
        // - If null (fresh pending order) → default to requested quantity so supplier edits exceptions down
        const initMap: ApprovedQtyMap = {};
        // Phase 1: initialize to requested quantity when no meaningful approval exists.
        // approved_quantity > 0  → use DB value (partial continuation)
        // approved_quantity null/undefined/0 → use requested quantity (editor starts full, supplier edits down)
        items.forEach(i => {
          initMap[i.id] = (i.approved_quantity != null && i.approved_quantity > 0)
            ? i.approved_quantity
            : i.quantity;
        });
        setApprovedQtyMap(initMap);
      }
    } catch (e: any) {
      setError(e?.message ?? t("Failed to load order items", "فشل تحميل بنود الطلب"));
    } finally { setDetailLoading(false); }
  }, [t]);

  const handlePrint = useCallback(() => {
    if (!detailOrder) return;
    const win = window.open("", "_blank");
    if (!win) return;
    // Pass approved quantities into items for print
    const itemsWithApproved = detailItems.map(i => ({
      ...i,
      approved_quantity: approvedQtyMap[i.id] ?? i.approved_quantity ?? null,
    }));
    win.document.write(buildPrintHTML(detailOrder, itemsWithApproved, lang));
    win.document.close(); win.print();
  }, [detailOrder, detailItems, approvedQtyMap]);

  // Phase 1: saveApprovedQtys — writes approved_quantity per item to DB.
  // fullApproval=true  → writes requested quantity for every item (full transfer)
  // fullApproval=false → writes the editor map value (partial transfer)
  const saveApprovedQtys = useCallback(async (fullApproval = false): Promise<boolean> => {
    try {
      const updates = detailItems.map(i => ({
        id: i.id,
        approved_quantity: fullApproval
          ? i.quantity                           // full approval: approve everything requested
          : (approvedQtyMap[i.id] ?? i.quantity), // partial: use editor value
      }));
      for (const u of updates) {
        const { error: upErr } = await supabase
          .from("order_items")
          .update({ approved_quantity: u.approved_quantity })
          .eq("id", u.id);
        if (upErr) throw upErr;
      }
      return true;
    } catch (e: any) {
      setError(e?.message ?? t("Failed to save approved quantities", "فشل حفظ الكميات المعتمدة"));
      return false;
    }
  }, [detailItems, approvedQtyMap, t]);

  const handleApprove = useCallback(async (orderId: number) => {
    setActionId(orderId);
    // Close editor immediately so UI doesn't linger in edit mode
    setShowPartialEditor(false);
    try {
      // Full approval: save requested quantities as approved (fullApproval=true)
      const saved = await saveApprovedQtys(true);
      if (!saved) { setActionId(null); return; }

      const { error: rpcError } = await supabase.rpc("approve_order", { p_order_id: orderId });
      if (rpcError) { setError(rpcError.message); }
      else {
        // Update status optimistically
        setDetailOrder(prev => prev ? { ...prev, status: "completed" } : null);
        // Refresh order list, items, and approved totals — no page reload needed
        await fetchOrders();
        await refreshDetailItems(orderId);
        showToast(t("Order approved successfully ✓", "تم اعتماد الطلب وتحديث المخزون ✓"));
      }
    } catch (e: any) { setError(e?.message ?? t("Approval failed", "فشل اعتماد الطلب")); }
    finally { setActionId(null); }
  }, [saveApprovedQtys, fetchOrders, refreshDetailItems, showToast, t]);

  // Phase 3: partial approval — saves qty map then sets status to partially_approved
  const handlePartialApprove = useCallback(async (orderId: number) => {
    // Guard: at least one item must have approved_quantity > 0
    const totalApproved = detailItems.reduce((s, i) => s + (approvedQtyMap[i.id] ?? i.quantity), 0);
    if (totalApproved === 0) {
      setError(isRTL
        ? "يجب اعتماد صنف واحد على الأقل. لا يمكن اعتماد طلب بكمية معتمدة = 0."
        : "At least one item must be approved. Cannot partially approve with all quantities set to 0."
      );
      // Re-open editor so supplier can fix quantities
      setShowPartialEditor(true);
      return;
    }

    setPartialSaving(true);
    // Close editor immediately so the UI doesn't stay in edit mode during async work
    setShowPartialEditor(false);
    try {
      const saved = await saveApprovedQtys();
      if (!saved) { setPartialSaving(false); return; }

      const { error: updateError } = await supabase
        .from("orders")
        .update({ status: "partially_approved" })
        .eq("id", orderId);
      if (updateError) { setError(updateError.message); setPartialSaving(false); return; }

      // Capture totals before refresh (uses the map which reflects what was just saved)
      const totalRequested = detailItems.reduce((s, i) => s + i.quantity, 0);

      // Update status optimistically so buttons switch immediately
      setDetailOrder(prev => prev ? { ...prev, status: "partially_approved" } : null);

      // Refresh order list + items in background
      await fetchOrders();
      await refreshDetailItems(orderId);

      // Show toast after all state updates
      const msg = isRTL
        ? `تم اعتماد الطلب جزئياً بنجاح — ${totalApproved} من أصل ${totalRequested}`
        : `Order partially approved successfully — ${totalApproved} of ${totalRequested}`;
      showToast(msg);
    } catch (e: any) { setError(e?.message ?? t("Partial approval failed", "فشل الاعتماد الجزئي")); }
    finally { setPartialSaving(false); }
  }, [saveApprovedQtys, detailItems, approvedQtyMap, isRTL, fetchOrders, refreshDetailItems, showToast, t]);

  const handleReject = useCallback(async (orderId: number) => {
    if (!confirm(t("Are you sure you want to reject this order?", "هل أنت متأكد من رفض هذا الطلب؟"))) return;
    setActionId(orderId);
    try {
      const { error: updateError } = await supabase.from("orders").update({ status: "rejected" }).eq("id", orderId);
      if (updateError) setError(updateError.message);
      else {
        showToast(t("Order Rejected", "تم رفض الطلب"));
        await fetchOrders();
        setDetailOrder(prev => prev ? { ...prev, status: "rejected" } : null);
        setShowPartialEditor(false);
      }
    } catch (e: any) { setError(e?.message ?? t("Rejection failed", "فشل رفض الطلب")); }
    finally { setActionId(null); }
  }, [fetchOrders, showToast, t]);

  const addToCart = useCallback((product: Product) => {
    if (!isAdmin) {
      const visCtx = buildVisibilityContext(product, resolvedSupplierShop);
      if (!canRequestProduct(visCtx)) {
        setModalError(t("This product is not available to your shop.", "هذا المنتج غير متاح لمحلك.")); return;
      }
      if (!determineProcurementEligibility(buildProcurementContext(resolvedSupplierShop), visCtx).canView) {
        setModalError(t("This product is not eligible for your shop.", "هذا المنتج غير مؤهل لمحلك.")); return;
      }
    }
    setCart(prev => prev.find(c => c.product.id === product.id) ? prev : [...prev, { product, quantity: 1 }]);
  }, [isAdmin, buildVisibilityContext, buildProcurementContext, resolvedSupplierShop, t]);

  const updateQty = useCallback((productId: number, qty: number) => {
    const max = visibleSupplierProducts.find(p => p.id === productId)?.quantity ?? 1;
    setCart(prev => prev.map(c => c.product.id === productId ? { ...c, quantity: Math.max(1, Math.min(qty, max)) } : c));
  }, [visibleSupplierProducts]);

  const removeFromCart = useCallback((productId: number) => {
    setCart(prev => prev.filter(i => i.product.id !== productId));
  }, []);

  const cartTotal = useMemo(() => cart.reduce((s, c) => s + c.product.price * c.quantity, 0), [cart]);

  const handleSubmit = useCallback(async () => {
    setModalError(null);
    if (!supplierShopId || cart.length === 0) { setModalError(t("Please select a supplier and add items", "اختر المورد وأضف أصنافاً")); return; }
    if (!isAdmin) {
      const procCtx = buildProcurementContext(resolvedSupplierShop);
      const invalid = cart.filter(c => {
        try { return !determineProcurementEligibility(procCtx, buildVisibilityContext(c.product, resolvedSupplierShop)).canView; }
        catch { return true; }
      });
      if (invalid.length > 0) {
        setModalError(t(
          "Some products in your cart are no longer available to your shop. Please remove them and try again.",
          "بعض المنتجات في سلتك لم تعد متاحة لمحلك. يرجى إزالتها والمحاولة مجدداً."
        )); return;
      }
    }
    setSaving(true);
    try {
      const { data: oData, error: oErr } = await supabase
        .from("orders")
        .insert({ from_shop_id: ownedShopId, to_shop_id: supplierShopId, status: "pending", total_amount: cartTotal, notes: orderNotes || null })
        .select().single();
      if (oErr) throw oErr;
      const { error: iErr } = await supabase.from("order_items").insert(
        cart.map(c => ({ order_id: oData.id, product_id: c.product.id, quantity: c.quantity, price: c.product.price }))
      );
      if (iErr) throw iErr;
      setShowModal(false); setCart([]); setSupplierShopId(""); setOrderNotes("");
      fetchOrders(); showToast(t("Order sent successfully ✓", "تم إرسال الطلب بنجاح ✓"));
    } catch (e: any) { setModalError(e?.message ?? t("Failed to create order", "فشل إنشاء الطلب")); }
    finally { setSaving(false); }
  }, [supplierShopId, cart, cartTotal, orderNotes, ownedShopId, isAdmin, buildVisibilityContext, buildProcurementContext, resolvedSupplierShop, fetchOrders, showToast, t]);

  // Partial approval is now FINAL — only pending orders can have approval actions
  const canActOnOrder = useCallback((order: Order) => {
    if (isAdmin) return order.status === "pending";
    return order.to_shop_id === ownedShopId && order.status === "pending";
  }, [isAdmin, ownedShopId]);

  const handleTabChange    = useCallback((v: "all" | "incoming" | "outgoing") => { setTab(v); setPage(1); }, []);
  const handleStatusFilter = useCallback((v: "all" | OrderStatus)             => { setStatusFilter(v); setPage(1); }, []);

  // Phase 1: validated approved qty update
  const setApprovedQty = useCallback((itemId: number, value: number, maxRequested: number, stockQty: number) => {
    const clamped = Math.max(0, Math.min(value, maxRequested, stockQty));
    setApprovedQtyMap(prev => ({ ...prev, [itemId]: clamped }));
  }, []);

  // Create a new order pre-filled with unfulfilled items (requested - approved)
  const [creatingMissingOrder, setCreatingMissingOrder] = useState(false);
  const handleCreateMissingOrder = useCallback(async () => {
    if (!detailOrder) return;
    const missingItems = detailItems.filter(i => {
      const appr = (i.approved_quantity != null && i.approved_quantity > 0) ? i.approved_quantity : i.quantity;
      return appr < i.quantity;
    });
    if (missingItems.length === 0) return;
    setCreatingMissingOrder(true);
    try {
      const missingTotal = missingItems.reduce((s, i) => {
        const appr = (i.approved_quantity != null && i.approved_quantity > 0) ? i.approved_quantity : 0;
        return s + i.price * (i.quantity - appr);
      }, 0);
      const { data: newOrder, error: orderErr } = await supabase
        .from("orders")
        .insert({
          from_shop_id: detailOrder.from_shop_id,
          to_shop_id:   detailOrder.to_shop_id,
          status:       "pending",
          total_amount: missingTotal,
          notes:        isRTL
            ? `طلب متابعة للأصناف الناقصة من الطلب #${detailOrder.id}`
            : `Follow-up order for missing items from order #${detailOrder.id}`,
          request_type: detailOrder.request_type ?? null,
        })
        .select()
        .single();
      if (orderErr) throw orderErr;
      const { error: itemsErr } = await supabase.from("order_items").insert(
        missingItems.map(i => {
          const appr = (i.approved_quantity != null && i.approved_quantity > 0) ? i.approved_quantity : 0;
          return {
            order_id:   newOrder.id,
            product_id: i.product_id,
            quantity:   i.quantity - appr,
            price:      i.price,
          };
        })
      );
      if (itemsErr) throw itemsErr;
      await fetchOrders();
      showToast(isRTL ? "تم إنشاء طلب الأصناف الناقصة بنجاح ✓" : "Missing items order created ✓");
    } catch (e: any) {
      setError(e?.message ?? (isRTL ? "فشل إنشاء الطلب" : "Failed to create order"));
    } finally {
      setCreatingMissingOrder(false);
    }
  }, [detailOrder, detailItems, isRTL, fetchOrders, showToast]);

  // =============================================================
  // RENDER
  // =============================================================

  return (
    <div className="p-4 lg:p-8 min-h-screen pb-24 md:pb-10" dir={isRTL ? "rtl" : "ltr"}>

      {/* Toast — Phase 10 in-app notifications */}
      {toast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[150] bg-emerald-600 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 pointer-events-none">
          <Check size={18} /> <span className="font-bold">{toast}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 rounded-lg shrink-0"><ShoppingCart size={22} className="text-blue-400" /></div>
            {t("Orders Management", "إدارة الطلبات")}
          </h1>
          <p className="text-slate-500 text-sm mt-1">{counts.all} {t("total", "طلب إجمالي")} · {counts.pending} {t("pending", "معلق")}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchOrders} className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-all active:scale-95" aria-label={t("Refresh orders", "تحديث الطلبات")}>
            <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
          </button>
          {!isAdmin && (
            <button onClick={() => setShowModal(true)} className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-blue-900/20 active:scale-95 transition-all" aria-label={t("Create new purchase order", "إنشاء طلب شراء جديد")}>
              <Plus size={18} /> {t("New Order", "طلب جديد")}
            </button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {[
          { label: t("Total Value", "إجمالي القيمة"), val: `${counts.totalValue.toLocaleString()} ر.س`, icon: DollarSign, color: "text-emerald-400", bg: "bg-emerald-500/5" },
          { label: t("Pending", "معلقة"),             val: counts.pending,                               icon: Clock,       color: "text-amber-400",  bg: "bg-amber-500/5"  },
          { label: t("Approved", "مقبولة"),           val: counts.approved,                              icon: CheckCircle, color: "text-blue-400",   bg: "bg-blue-500/5"   },
          { label: t("Rejected", "مرفوضة"),           val: counts.rejected,                              icon: XCircle,     color: "text-red-400",    bg: "bg-red-500/5"    },
        ].map((kpi, i) => (
          <div key={i} className={`${kpi.bg} border border-slate-800 p-4 rounded-2xl flex flex-col justify-between min-h-[76px]`}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-slate-500 text-[10px] font-bold uppercase tracking-widest truncate mr-1">{kpi.label}</span>
              <kpi.icon size={13} className={`${kpi.color} shrink-0`} />
            </div>
            <p className={`text-xl font-black ${kpi.color} leading-tight truncate`}>{kpi.val}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col lg:flex-row gap-3 mb-5">
        <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800 overflow-x-auto no-scrollbar shrink-0" role="tablist" aria-label={t("Order direction filter", "تصفية اتجاه الطلب")}>
          {(["all", "incoming", "outgoing"] as const).map(k => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => handleTabChange(k)} className={`px-5 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${tab === k ? "bg-slate-800 text-white shadow-sm" : "text-slate-500 hover:text-slate-300"}`}>
              {t(k, k === "all" ? "الكل" : k === "incoming" ? "واردة" : "صادرة")}
            </button>
          ))}
        </div>
        <div className="flex-1 flex gap-2">
          <div className="relative flex-1">
            <Search size={16} className={`absolute ${isRTL ? "right-3" : "left-3"} top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none`} />
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder={t("Search by ID or Shop...", "بحث برقم الطلب أو المحل...")} aria-label={t("Search orders", "بحث في الطلبات")} className={`w-full bg-slate-900 border border-slate-800 rounded-xl py-2.5 ${isRTL ? "pr-10 pl-4" : "pl-10 pr-4"} text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all placeholder:text-slate-600 text-sm`} />
          </div>
          <div className="relative shrink-0">
            <select value={statusFilter} onChange={e => handleStatusFilter(e.target.value as any)} aria-label={t("Filter by status", "تصفية حسب الحالة")} className="appearance-none bg-slate-900 border border-slate-800 rounded-xl px-5 py-2.5 text-sm text-slate-300 outline-none focus:border-blue-500 cursor-pointer min-w-[120px]">
              <option value="all">{t("Status", "الحالة")}</option>
              {(Object.keys(STATUS_META) as OrderStatus[]).map(s => (
                <option key={s} value={s}>{STATUS_META[s].label[isRTL ? "ar" : "en"]}</option>
              ))}
            </select>
            <ChevronDown size={13} className={`absolute ${isRTL ? "left-3" : "right-3"} top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none`} />
          </div>
        </div>
      </div>

      {/* Mobile cards — Phase 9 */}
      <div className="lg:hidden space-y-2.5">
        {pageItems.length === 0 ? (
          <div className="py-16 text-center text-slate-600 bg-slate-900/30 rounded-3xl border border-dashed border-slate-800">
            <Package size={36} className="mx-auto mb-3 opacity-20" />
            <p className="text-sm">{t("No orders matching your criteria", "لا توجد طلبات مطابقة")}</p>
          </div>
        ) : pageItems.map(o => (
          <button key={o.id} onClick={() => openDetail(o)} aria-label={t(`View order #${o.id}`, `عرض الطلب رقم ${o.id}`)} className="w-full text-right bg-slate-900 border border-slate-800 rounded-2xl p-4 active:scale-[0.98] hover:border-slate-700 transition-all block">
            <div className="flex items-center justify-between mb-3">
              <span className="text-white font-mono font-black text-sm">#{o.id.toString().padStart(5, "0")}</span>
              <StatusBadge status={o.status} isRTL={isRTL} />
            </div>
            <div className="flex items-center gap-2 bg-slate-950/40 rounded-xl px-3 py-2 border border-slate-800/50 mb-3">
              <div className="flex-1 min-w-0">
                <p className="text-[9px] text-slate-600 uppercase font-bold leading-none mb-0.5">{t("From", "من")}</p>
                <p className="text-xs text-white font-bold truncate">{o.from_shop?.shop_name}</p>
              </div>
              <ArrowRightLeft size={12} className="text-slate-700 shrink-0" />
              <div className="flex-1 min-w-0 text-left">
                <p className="text-[9px] text-slate-600 uppercase font-bold leading-none mb-0.5">{t("To", "إلى")}</p>
                <p className="text-xs text-white font-bold truncate">{o.to_shop?.shop_name}</p>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="text-slate-500 text-[11px] space-y-0.5">
                <p className="flex items-center gap-1"><Package size={11} />{o.order_items?.length || 0} {t("items", "أصناف")}</p>
                <p>{new Date(o.created_at).toLocaleDateString()}</p>
              </div>
              <span className="text-emerald-400 font-black text-lg leading-none">{o.total_amount.toLocaleString()}<span className="text-[10px] font-normal text-slate-500"> ر.س</span></span>
            </div>
          </button>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden lg:block bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <table className="w-full text-right border-collapse" role="grid">
          <thead>
            <tr className="bg-slate-950/50 border-b border-slate-800 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              <th scope="col" className="p-4">{t("Order ID", "رقم الطلب")}</th>
              <th scope="col" className="p-4">{t("From", "من")}</th>
              <th scope="col" className="p-4">{t("To", "إلى")}</th>
              <th scope="col" className="p-4">{t("Amount", "المبلغ")}</th>
              <th scope="col" className="p-4">{t("Status", "الحالة")}</th>
              <th scope="col" className="p-4">{t("Date", "التاريخ")}</th>
              <th scope="col" className="p-4 text-center">{t("Action", "إجراء")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50 text-sm">
            {pageItems.length === 0 ? (
              <tr><td colSpan={7} className="p-16 text-center text-slate-600 italic">{t("No orders matching your criteria", "لا توجد طلبات مطابقة")}</td></tr>
            ) : pageItems.map(o => (
              <tr key={o.id} className="hover:bg-slate-800/20 transition-colors">
                <td className="p-4 font-mono font-bold text-slate-400">#{o.id.toString().padStart(5, "0")}</td>
                <td className={`p-4 font-bold ${o.from_shop_id === ownedShopId ? "text-blue-400" : "text-white"}`}>
                  {o.from_shop?.shop_name}
                  {o.from_shop_id === ownedShopId && <span className="text-[9px] opacity-50 font-medium px-1 bg-blue-500/10 rounded ml-1">{t("You", "أنت")}</span>}
                </td>
                <td className={`p-4 font-bold ${o.to_shop_id === ownedShopId ? "text-emerald-400" : "text-white"}`}>
                  {o.to_shop?.shop_name}
                  {o.to_shop_id === ownedShopId && <span className="text-[9px] opacity-50 font-medium px-1 bg-emerald-500/10 rounded ml-1">{t("You", "أنت")}</span>}
                </td>
                <td className="p-4 font-black text-white">{o.total_amount.toLocaleString()} <span className="text-[10px] font-normal text-slate-500">ر.س</span></td>
                <td className="p-4"><StatusBadge status={o.status} isRTL={isRTL} /></td>
                <td className="p-4 text-slate-500 text-xs">{new Date(o.created_at).toLocaleDateString()}</td>
                <td className="p-4 text-center">
                  <button onClick={() => openDetail(o)} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all" aria-label={t(`View order #${o.id} details`, `عرض تفاصيل الطلب رقم ${o.id}`)}>
                    <Eye size={18} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6 flex justify-center items-center gap-2" role="navigation" aria-label={t("Pagination", "التنقل بين الصفحات")}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} aria-label={t("Previous page", "الصفحة السابقة")} className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-500 disabled:opacity-20 hover:text-white transition-colors"><ChevronRight size={20} /></button>
          <span className="text-slate-500 text-xs font-bold mx-2">{page} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} aria-label={t("Next page", "الصفحة التالية")} className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-500 disabled:opacity-20 hover:text-white transition-colors"><ChevronLeft size={20} /></button>
        </div>
      )}

      {/* Global error */}
      {error && (
        <div className="mt-4 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-3" role="alert">
          <AlertCircle size={18} className="shrink-0" />
          <p className="flex-1">{error}</p>
          <button onClick={() => setError(null)} className="text-slate-500 hover:text-white" aria-label={t("Dismiss error", "إغلاق رسالة الخطأ")}><X size={16} /></button>
        </div>
      )}

      {/* ── Order Detail Drawer ── */}
      {detailOrder && (
        <div className="fixed inset-0 z-[110] flex items-end lg:items-center justify-center lg:p-4 animate-in fade-in duration-200" role="dialog" aria-modal="true" aria-label={t("Order Details", "تفاصيل الطلب")}>
          <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm" onClick={() => setDetailOrder(null)} />
          <div className="relative bg-slate-900 border border-slate-800 w-full max-w-2xl lg:rounded-3xl rounded-t-[2rem] shadow-2xl flex flex-col max-h-[94vh] overflow-hidden">

            {/* Saving overlay — blocks all interactions while approval is in progress */}
            {partialSaving && (
              <div className="absolute inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3 rounded-t-[2rem] lg:rounded-3xl">
                <RefreshCw size={32} className="text-purple-400 animate-spin" />
                <p className="text-purple-300 font-bold text-sm">{t("Saving approval...", "جاري حفظ الاعتماد...")}</p>
              </div>
            )}

            {/* Drawer header — Phase 5: document type title */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0 bg-slate-900/80 backdrop-blur-md">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-3 flex-wrap">
                  <h2 className="text-lg font-black text-white">
                    {detailDocTitle}
                    <span className="font-mono text-slate-400 text-base mx-2">#{detailDocNumber}</span>
                  </h2>
                  <StatusBadge status={detailOrder.status} isRTL={isRTL} />
                </div>
                <p className="text-slate-500 text-[11px] mt-0.5">{new Date(detailOrder.created_at).toLocaleString()}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-3">
                <button onClick={handlePrint} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white text-xs font-bold transition-all active:scale-95" aria-label={t("Print document", "طباعة المستند")}>
                  <Printer size={15} /><span className="hidden sm:inline">{t("Print", "طباعة")}</span>
                </button>
                <button onClick={() => setDetailOrder(null)} className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition-all active:scale-95" aria-label={t("Close order details", "إغلاق تفاصيل الطلب")}><X size={18} /></button>
              </div>
            </div>

            {/* Body — Phase 9: better mobile scrolling */}
            <div className="overflow-y-auto overscroll-contain flex-1 p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-3">
                  <p className="text-[9px] font-bold text-slate-600 uppercase tracking-wider mb-1">{t("Requester", "الطالب")}</p>
                  <p className="text-sm font-bold text-white truncate">{detailOrder.from_shop?.shop_name}</p>
                </div>
                <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-3">
                  <p className="text-[9px] font-bold text-slate-600 uppercase tracking-wider mb-1">{t("Supplier", "المورد")}</p>
                  <p className="text-sm font-bold text-white truncate">{detailOrder.to_shop?.shop_name}</p>
                </div>
              </div>

              {/* Order items — Phase 1+3: show requested/approved qty; editable in partial mode */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <Package size={13} /> {t("Requested Items", "الأصناف المطلوبة")}
                  </h3>
                  {showPartialEditor && (
                    <span className="text-[9px] font-bold text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-full">
                      {t("Edit Mode — Approved Quantities", "وضع التعديل — الكميات المعتمدة")}
                    </span>
                  )}
                </div>

                {detailLoading ? (
                  <div className="py-10 text-center"><RefreshCw className="animate-spin mx-auto text-blue-500" size={24} /></div>
                ) : (
                  <div className="space-y-2">
                    {detailItems.map(item => {
                      // Use map value when in editor; otherwise use DB approved_qty if meaningful, else requested
                      const approvedQty = showPartialEditor
                        ? (approvedQtyMap[item.id] ?? item.quantity)
                        : ((item.approved_quantity != null && item.approved_quantity > 0)
                            ? item.approved_quantity
                            : item.quantity);
                      const stockQty    = item.product?.quantity ?? item.quantity;
                      // Show approved qty badge when: order is partially approved, OR when approved != requested
                      const hasApproved = (detailOrder.status === "partially_approved")
                        ? (item.approved_quantity != null)
                        : (item.approved_quantity != null && item.approved_quantity > 0 && item.approved_quantity !== item.quantity);
                      // Phase 6: improved item row — clearer qty distinction, stock badge
                      return (
                        <div key={item.id} className="bg-slate-800/30 border border-slate-800/50 rounded-2xl overflow-hidden hover:border-slate-700 transition-colors">
                          <div className="px-4 pt-3 pb-2">
                            <div className="flex justify-between items-start gap-3">
                              <div className="flex-1 min-w-0">
                                <p className="text-white font-bold text-sm leading-snug">{item.product?.part_name}</p>
                                <p className="text-slate-500 text-[10px] font-mono mt-0.5 tracking-wide">{item.product?.part_number}</p>
                              </div>
                              {/* Phase 6: Phase 2 financial total uses approved qty */}
                              <div className="text-left shrink-0 pl-2">
                                {(() => {
                                  const dispQty = showPartialEditor ? (approvedQtyMap[item.id] ?? item.quantity) : approvedQty;
                                  return (<>
                                    <p className="text-white font-black text-sm tabular-nums">{(item.price * dispQty).toLocaleString()}<span className="text-[9px] font-normal text-slate-500"> ر.س</span></p>
                                    <p className="text-slate-500 text-[10px] font-bold tabular-nums">{dispQty} × {item.price.toLocaleString()}</p>
                                  </>);
                                })()}
                              </div>
                            </div>
                          </div>
                          {/* Phase 6+8: quantity row — requested / approved / stock always visible */}
                          <div className="px-3 pb-3 flex items-center gap-3 flex-wrap border-t border-slate-800/40 pt-2 overflow-x-hidden">
                            <span className="text-[10px] text-slate-500 flex items-center gap-1 whitespace-nowrap">
                              <span className="font-bold text-slate-400">{t("Req:", "مطلوب:")}</span>
                              <span className="font-black text-slate-300">{item.quantity}</span>
                            </span>
                            {/* Phase 8: always show stock in partial editor */}
                            {showPartialEditor && (
                              <span className="text-[10px] text-slate-500 flex items-center gap-1 whitespace-nowrap">
                                <span className="font-bold text-slate-400">{t("Stock:", "متوفر:")}</span>
                                <span className={`font-black ${stockQty < item.quantity ? "text-amber-400" : "text-slate-300"}`}>{stockQty}</span>
                              </span>
                            )}
                            {(hasApproved || showPartialEditor) && (
                              <span className="text-[10px] text-purple-400 flex items-center gap-1 whitespace-nowrap">
                                <span className="font-bold">{t("Appr:", "معتمد:")}</span>
                                {showPartialEditor ? (
                                  <span className="flex items-center gap-1">
                                    <input
                                      type="number"
                                      min={0}
                                      max={Math.min(item.quantity, stockQty)}
                                      value={approvedQtyMap[item.id] ?? item.quantity}
                                      onChange={e => setApprovedQty(item.id, Number(e.target.value), item.quantity, stockQty)}
                                      className="w-16 bg-slate-900 border border-purple-500/40 rounded-lg px-2 py-1 text-purple-300 font-bold text-xs outline-none focus:border-purple-400 text-center"
                                      aria-label={t(`Approved quantity for ${item.product?.part_name}`, `الكمية المعتمدة لـ ${item.product?.part_name}`)}
                                    />
                                    {/* Phase 8: inline validation */}
                                    {(approvedQtyMap[item.id] ?? item.quantity) > Math.min(item.quantity, stockQty) && (
                                      <span className="text-[9px] text-red-400 font-bold">{t("Exceeds limit", "تجاوز الحد")}</span>
                                    )}
                                  </span>
                                ) : (
                                  <span className="font-black text-purple-300">{approvedQty}</span>
                                )}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {detailOrder.notes && (
                <div className="bg-amber-500/5 border border-amber-500/10 p-4 rounded-xl">
                  <p className="text-[9px] font-bold text-amber-500 uppercase mb-1 tracking-wider">{t("Special Instructions", "ملاحظات إضافية")}</p>
                  <p className="text-slate-300 text-sm italic leading-relaxed">"{detailOrder.notes}"</p>
                </div>
              )}
            </div>

            {/* Footer — Phase 3+9: sticky action buttons with full approval workflow */}
            <div className="px-5 py-4 border-t border-slate-800 bg-slate-900 shrink-0 pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:pb-[calc(1rem+env(safe-area-inset-bottom))]">
              {/* Phase 2+13: live approved total — uses approvedQtyMap when editor open */}
              {(() => {
                // When editor is open: sum from the live map for real-time feedback
                const liveTotal = showPartialEditor
                  ? detailItems.reduce((s, i) => s + i.price * (approvedQtyMap[i.id] ?? i.quantity), 0)
                  : calculateApprovedTotal(detailItems);
                const showOriginal = liveTotal !== detailOrder.total_amount && detailItems.length > 0;
                return (
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <span className="text-slate-500 font-bold text-xs uppercase tracking-widest">{t("Total Amount", "الإجمالي الكلي")}</span>
                      {showOriginal && (
                        <span className="block text-[9px] text-slate-600 mt-0.5 font-mono">
                          {t("Requested:", "مطلوب:")} {detailOrder.total_amount.toLocaleString()}
                        </span>
                      )}
                    </div>
                    <span className="text-2xl font-black text-emerald-400">{liveTotal.toLocaleString()}<span className="text-sm font-normal text-slate-400"> ر.س</span></span>
                  </div>
                );
              })()}

              {/* ── STATUS-DRIVEN ACTION AREA ── */}

              {/* completed / approved: read-only banner */}
              {(detailOrder.status === "completed" || detailOrder.status === "approved") && (
                <div className="flex items-center justify-center gap-2 py-3 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-emerald-400 font-bold text-sm">
                  <PackageCheck size={18} />
                  {t("Order Completed", "تم تنفيذ الطلب بالكامل")}
                </div>
              )}

              {/* rejected: read-only banner */}
              {detailOrder.status === "rejected" && (
                <div className="flex items-center justify-center gap-2 py-3 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 font-bold text-sm">
                  <XCircle size={18} />
                  {t("Order Rejected", "تم رفض الطلب")}
                </div>
              )}

              {/* partially_approved: guard — if all approved=0, show pending actions; otherwise show read-only summary */}
              {detailOrder.status === "partially_approved" && (() => {
                const approvedCount = detailItems.filter(i =>
                  i.approved_quantity != null && i.approved_quantity > 0
                ).length;
                const totalCount = detailItems.length;
                const hasRealApproval = approvedCount > 0;

                if (!hasRealApproval) {
                  // Bad-data guard: DB says partially_approved but all qty=0 — let supplier act
                  return (
                    <div className="space-y-3">
                      <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl px-4 py-3 text-center">
                        <p className="text-slate-400 font-bold text-xs">
                          {t("Not Yet Approved", "لم يتم الاعتماد بعد")}
                        </p>
                        <p className="text-slate-600 text-[10px] mt-1">
                          {t("Please approve at least one item.", "يرجى اعتماد صنف واحد على الأقل.")}
                        </p>
                      </div>
                      {!showPartialEditor && (
                        <div className="flex gap-2 flex-wrap">
                          <button onClick={() => handleReject(detailOrder.id)} disabled={actionId === detailOrder.id} aria-label={t("Reject order","رفض الطلب")} className="flex-1 py-3 rounded-2xl border border-red-500/20 text-red-400 font-bold hover:bg-red-500/10 transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 text-sm min-w-[80px]">
                            <XCircle size={16}/> {t("Reject","رفض")}
                          </button>
                          <button onClick={() => setShowPartialEditor(true)} aria-label={t("Partial approval","موافقة جزئية")} className="flex-1 py-3 rounded-2xl border border-amber-500/30 text-amber-400 font-bold hover:bg-amber-500/10 transition-all flex items-center justify-center gap-2 active:scale-95 text-sm min-w-[80px]">
                            <SplitSquareHorizontal size={16}/> {t("Partial","جزئي")}
                          </button>
                          <button onClick={() => handleApprove(detailOrder.id)} disabled={actionId === detailOrder.id} aria-label={t("Approve all","اعتماد الكل")} className="flex-[2] py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black shadow-lg shadow-emerald-900/20 transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 text-sm">
                            {actionId === detailOrder.id ? <RefreshCw className="animate-spin" size={16}/> : <PackageCheck size={16}/>}
                            {t("Approve","اعتماد")}
                          </button>
                        </div>
                      )}
                      {showPartialEditor && (() => {
                        const isPartiallySet = detailItems.some(i => (approvedQtyMap[i.id] ?? i.quantity) < i.quantity);
                        return (
                          <div className="space-y-3">
                            <p className={`text-[10px] text-center font-bold ${isPartiallySet ? "text-amber-400" : "text-emerald-400"}`}>
                              {isPartiallySet ? t("This order will be partially approved","سيتم اعتماد الطلب جزئياً") : t("All quantities approved — full approval","جميع الكميات معتمدة — اعتماد كامل")}
                            </p>
                            <div className="flex gap-2">
                              <button onClick={() => { setShowPartialEditor(false); const m: ApprovedQtyMap = {}; detailItems.forEach(i => { m[i.id] = (i.approved_quantity != null && i.approved_quantity > 0) ? i.approved_quantity : i.quantity; }); setApprovedQtyMap(m); }} className="flex-1 py-3 rounded-2xl border border-slate-700 text-slate-400 font-bold hover:bg-slate-800 transition-all text-sm flex items-center justify-center gap-2 active:scale-95" aria-label={t("Cancel","إلغاء")}>
                                <X size={15}/> {t("Cancel","إلغاء")}
                              </button>
                              <button onClick={() => handlePartialApprove(detailOrder.id)} disabled={partialSaving} className="flex-[2] py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-white font-black transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 text-sm" aria-label={t("Confirm partial","تأكيد جزئي")}>
                                {partialSaving ? <RefreshCw className="animate-spin" size={15}/> : <Check size={15}/>}
                                {t("Confirm Partial","تأكيد جزئي")}
                              </button>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  );
                }

                // Real partial approval — show read-only summary
                const hasUnfulfilled = detailItems.some(i => {
                  const appr = (i.approved_quantity != null && i.approved_quantity > 0) ? i.approved_quantity : i.quantity;
                  return appr < i.quantity;
                });
                return (
                  <div className="space-y-3">
                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl px-4 py-3">
                      <p className="text-amber-400 font-bold text-xs mb-1 flex items-center gap-1.5">
                        <SplitSquareHorizontal size={13}/>
                        {t("Partially Approved","اعتماد جزئي")}
                      </p>
                      <p className="text-slate-300 text-xs">
                        {isRTL ? `تم اعتماد ${approvedCount} من أصل ${totalCount} صنف` : `${approvedCount} of ${totalCount} items approved`}
                      </p>
                    </div>
                    {hasUnfulfilled && (
                      <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl overflow-hidden">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-3 py-2 border-b border-slate-700/40">
                          {t("Unfulfilled Items","الأصناف غير المنفذة")}
                        </p>
                        <div className="divide-y divide-slate-700/30">
                          {detailItems
                            .filter(i => { const appr = (i.approved_quantity != null && i.approved_quantity > 0) ? i.approved_quantity : i.quantity; return appr < i.quantity; })
                            .map(i => {
                              const appr = (i.approved_quantity != null && i.approved_quantity > 0) ? i.approved_quantity : 0;
                              return (
                                <div key={i.id} className="px-3 py-2 flex items-center justify-between gap-2 text-xs">
                                  <span className="text-white font-bold truncate flex-1">{i.product?.part_name}</span>
                                  <span className="text-slate-500 shrink-0">
                                    {isRTL ? `مطلوب ${i.quantity} · معتمد ${appr} · ناقص ${i.quantity - appr}` : `Req ${i.quantity} · Appr ${appr} · Missing ${i.quantity - appr}`}
                                  </span>
                                </div>
                              );
                            })}
                        </div>
                        <div className="px-3 pb-3 pt-2">
                          <button onClick={handleCreateMissingOrder} disabled={creatingMissingOrder} className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50" aria-label={t("Create new order for missing items","إنشاء طلب جديد للأصناف الناقصة")}>
                            {creatingMissingOrder ? <RefreshCw size={13} className="animate-spin"/> : <Plus size={13}/>}
                            {t("Create New Order For Missing Items","إنشاء طلب جديد للأصناف الناقصة")}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* pending: Reject + Partial + Approve */}
              {detailOrder.status === "pending" && canActOnOrder(detailOrder) && !showPartialEditor && (
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => handleReject(detailOrder.id)}
                    disabled={actionId === detailOrder.id}
                    aria-label={t("Reject order", "رفض الطلب")}
                    className="flex-1 py-3 rounded-2xl border border-red-500/20 text-red-400 font-bold hover:bg-red-500/10 transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 text-sm min-w-[80px]"
                  >
                    <XCircle size={16} /> {t("Reject", "رفض")}
                  </button>
                  <button
                    onClick={() => setShowPartialEditor(true)}
                    disabled={actionId === detailOrder.id}
                    aria-label={t("Partial approval", "موافقة جزئية")}
                    className="flex-1 py-3 rounded-2xl border border-amber-500/30 text-amber-400 font-bold hover:bg-amber-500/10 transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 text-sm min-w-[80px]"
                  >
                    <SplitSquareHorizontal size={16} /> {t("Partial", "جزئي")}
                  </button>
                  <button
                    onClick={() => handleApprove(detailOrder.id)}
                    disabled={actionId === detailOrder.id}
                    aria-label={t("Approve and process order", "اعتماد الطلب ومعالجته")}
                    className="flex-[2] py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black shadow-lg shadow-emerald-900/20 transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 text-sm"
                  >
                    {actionId === detailOrder.id ? <RefreshCw className="animate-spin" size={16} /> : <PackageCheck size={16} />}
                    {t("Approve", "اعتماد")}
                  </button>
                </div>
              )}

              {/* pending + editor open: smart-hint + Cancel + Confirm */}
              {detailOrder.status === "pending" && canActOnOrder(detailOrder) && showPartialEditor && (() => {
                const isPartiallySet = detailItems.some(i => (approvedQtyMap[i.id] ?? i.quantity) < i.quantity);
                return (
                <div className="space-y-3">
                  <p className={`text-[10px] text-center font-bold ${isPartiallySet ? "text-amber-400" : "text-emerald-400"}`}>
                    {isPartiallySet
                      ? t("This order will be partially approved", "سيتم اعتماد الطلب جزئياً")
                      : t("All quantities approved — full approval", "جميع الكميات معتمدة — اعتماد كامل")}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setShowPartialEditor(false);
                        const m: ApprovedQtyMap = {};
                        detailItems.forEach(i => {
                          m[i.id] = (i.approved_quantity != null && i.approved_quantity > 0)
                            ? i.approved_quantity
                            : i.quantity;
                        });
                        setApprovedQtyMap(m);
                      }}
                      className="flex-1 py-3 rounded-2xl border border-slate-700 text-slate-400 font-bold hover:bg-slate-800 transition-all text-sm flex items-center justify-center gap-2 active:scale-95"
                      aria-label={t("Cancel partial approval", "إلغاء الموافقة الجزئية")}
                    >
                      <X size={15} /> {t("Cancel", "إلغاء")}
                    </button>
                    <button
                      onClick={() => handlePartialApprove(detailOrder.id)}
                      disabled={partialSaving}
                      className="flex-[2] py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-white font-black transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 text-sm"
                      aria-label={t("Confirm partial approval", "تأكيد الموافقة الجزئية")}
                    >
                      {partialSaving ? <RefreshCw className="animate-spin" size={15} /> : <Check size={15} />}
                      {t("Confirm Partial", "تأكيد جزئي")}
                    </button>
                  </div>
                </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ── New Order Modal ── */}
      {showModal && (
        <div className="fixed inset-0 z-[110] flex items-end lg:items-center justify-center lg:p-4 animate-in fade-in duration-200" role="dialog" aria-modal="true" aria-label={t("Create Purchase Order", "إنشاء طلب شراء")}>
          <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm" onClick={() => setShowModal(false)} />
          <div className="relative bg-slate-900 border border-slate-800 w-full max-w-3xl lg:rounded-3xl rounded-t-[2rem] shadow-2xl flex flex-col max-h-[96vh] overflow-hidden">

            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 shrink-0">
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-black text-white flex items-center gap-2">
                  <Plus className="text-blue-400 shrink-0" size={20} />
                  {t("Create Purchase Order", "إنشاء طلب شراء جديد")}
                </h2>
                {supplierShopId && (
                  <p className="text-[10px] text-slate-500 mt-0.5 font-bold tracking-wide">
                    {t("Type", "نوع الطلب")}: <span className="text-blue-400 mx-1">{requestTypeLabel}</span>
                  </p>
                )}
              </div>
              <button onClick={() => setShowModal(false)} className="p-2 text-slate-500 hover:text-white active:scale-90 transition-all shrink-0" aria-label={t("Close modal", "إغلاق النافذة")}><X size={22} /></button>
            </div>

            <div className="p-5 overflow-y-auto overscroll-contain space-y-5 flex-1">
              {modalError && (
                <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-2xl text-red-400 text-sm font-bold flex items-center gap-2" role="alert">
                  <AlertCircle size={16} className="shrink-0" /> {modalError}
                </div>
              )}

              <div className="space-y-2">
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest">{t("Select Supplier", "اختر المحل المورد")}</label>
                <select value={supplierShopId} onChange={e => { setSupplierShopId(Number(e.target.value) || ""); setCart([]); setModalError(null); }} aria-label={t("Select supplier shop", "اختر محل المورد")} className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3.5 text-white focus:border-blue-500 outline-none transition-all cursor-pointer text-sm">
                  <option value="">{t("-- Select Supplier --", "-- اختر المورد --")}</option>
                  {shops.filter(s => s.id !== ownedShopId).map(s => <option key={s.id} value={s.id}>{s.shop_name}</option>)}
                </select>
              </div>

              {supplierShopId && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest shrink-0">
                      {t("Available Catalog", "المنتجات المتوفرة")}
                      {visibleSupplierProducts.length > 0 && <span className="text-slate-600 font-normal normal-case ml-1">({visibleSupplierProducts.length})</span>}
                    </h3>
                    <div className="relative flex-1 max-w-[180px]">
                      <Search size={13} className={`absolute ${isRTL ? "right-2.5" : "left-2.5"} top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none`} />
                      <input value={productSearch} onChange={e => setProductSearch(e.target.value)} placeholder={t("Search...", "بحث...")} aria-label={t("Search products", "بحث في المنتجات")} className={`w-full bg-slate-950 border border-slate-800 rounded-lg py-2 ${isRTL ? "pr-8 pl-3" : "pl-8 pr-3"} text-xs text-white outline-none focus:border-blue-500`} />
                    </div>
                  </div>

                  {loadingProducts ? (
                    <div className="py-8 text-center"><RefreshCw className="animate-spin mx-auto text-blue-500" size={20} /></div>
                  ) : filteredSupplierProducts.length === 0 ? (
                    <div className="py-8 text-center text-slate-600 text-sm">{t("No available products from this supplier.", "لا توجد منتجات متاحة من هذا المورد.")}</div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto overscroll-contain">
                      {filteredSupplierProducts.map(p => {
                        const elig      = getProductEligibility(p, resolvedSupplierShop);
                        const alreadyIn = cart.some(c => c.product.id === p.id);
                        return (
                          <div key={p.id} className="bg-slate-800/40 border border-slate-800 p-3 rounded-xl hover:border-blue-500/30 transition-all">
                            <div className="flex items-start justify-between gap-2 mb-1.5">
                              <p className="text-white font-bold text-xs leading-snug flex-1 min-w-0 line-clamp-2">{p.part_name}</p>
                              <VisibilityBadge scope={p.visibility_scope} isRTL={isRTL} />
                            </div>
                            <p className="text-slate-500 text-[10px] font-mono mb-2.5">{p.part_number}</p>
                            <div className="flex items-center justify-between gap-2">
                              <div>
                                <span className="text-emerald-400 font-bold text-sm">{p.price.toLocaleString()}</span>
                                <span className="text-slate-600 text-[10px] mr-1">ر.س</span>
                                <span className="text-slate-600 text-[9px]">· {p.quantity} {t("in stock", "متوفر")}</span>
                              </div>
                              <button
                                onClick={() => addToCart(p)}
                                disabled={!elig.canView || alreadyIn}
                                aria-label={alreadyIn ? t(`${p.part_name} already in cart`, `${p.part_name} موجود في السلة`) : t(`Add ${p.part_name} to cart`, `إضافة ${p.part_name} إلى السلة`)}
                                className={`p-1.5 rounded-lg text-white transition-all active:scale-90 shrink-0 ${alreadyIn ? "bg-slate-700 cursor-default opacity-60" : elig.canView ? "bg-blue-600 hover:bg-blue-500" : "bg-slate-700 opacity-40 cursor-not-allowed"}`}
                              >
                                {alreadyIn ? <Check size={14} /> : <Plus size={14} />}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {cart.length > 0 && (
                <div className="space-y-3 pt-3 border-t border-slate-800">
                  <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center justify-between">
                    {t("Order Summary", "سلة الطلب")}
                    <span className="text-emerald-400 font-black text-sm normal-case">{cartTotal.toLocaleString()} ر.س</span>
                  </h3>
                  <div className="space-y-2">
                    {cart.map(c => (
                      <div key={c.product.id} className="bg-slate-950/40 px-3 py-2.5 rounded-xl flex items-center justify-between border border-slate-800/50">
                        <div className="flex-1 min-w-0 mr-3">
                          <p className="text-white font-bold text-xs truncate">{c.product.part_name}</p>
                          <p className="text-[10px] text-slate-500">{c.product.price.toLocaleString()} ر.س</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="flex items-center bg-slate-800 rounded-lg p-0.5 border border-slate-700">
                            <button onClick={() => updateQty(c.product.id, c.quantity - 1)} aria-label={t("Decrease quantity", "تقليل الكمية")} className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-white text-sm font-bold transition-colors rounded-md active:bg-slate-700">−</button>
                            <span className="w-7 text-center font-black text-white text-sm">{c.quantity}</span>
                            <button onClick={() => updateQty(c.product.id, c.quantity + 1)} aria-label={t("Increase quantity", "زيادة الكمية")} className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-white text-sm font-bold transition-colors rounded-md active:bg-slate-700">+</button>
                          </div>
                          <button onClick={() => removeFromCart(c.product.id)} aria-label={t(`Remove ${c.product.part_name} from cart`, `إزالة ${c.product.part_name} من السلة`)} className="text-slate-700 hover:text-red-400 p-1.5 active:scale-90 transition-all"><Trash2 size={15} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest">{t("Internal Notes", "ملاحظات الطلب")}</label>
                <textarea value={orderNotes} onChange={e => setOrderNotes(e.target.value)} placeholder={t("Any special delivery or order instructions...", "تعليمات خاصة بالتوصيل أو التجهيز...")} aria-label={t("Order notes and special instructions", "ملاحظات الطلب والتعليمات الخاصة")} className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3.5 text-white outline-none focus:border-blue-500 min-h-[80px] text-sm leading-relaxed transition-colors resize-none" />
              </div>
            </div>

            <div className="px-5 py-4 border-t border-slate-800 bg-slate-900 shrink-0 pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:pb-[calc(1rem+env(safe-area-inset-bottom))]">
              <button onClick={handleSubmit} disabled={saving || cart.length === 0} aria-label={t("Confirm and send purchase order", "تأكيد وإرسال طلب الشراء")} className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white font-black rounded-2xl shadow-xl shadow-blue-900/30 active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-50 text-sm">
                {saving ? <RefreshCw className="animate-spin" size={18} /> : <Save size={18} />}
                {t("Confirm & Send PO", "تأكيد وإرسال الطلب")}
                {cart.length > 0 && <span className="bg-white/20 px-2 py-0.5 rounded-lg text-xs font-bold">{cartTotal.toLocaleString()} ر.س</span>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
