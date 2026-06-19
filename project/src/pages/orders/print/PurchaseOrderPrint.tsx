// =============================================================
// src/pages/orders/print/PurchaseOrderPrint.tsx
//
// Purchase Order print template — blue ERP theme.
// Exports a plain string builder (not a React component) because
// the output is injected into a raw print window via
// document.write, not rendered through React's reconciler.
// =============================================================

import type { Order, OrderItem, ShopInfo } from "../types";
import { escapeHTML, effectiveApproved } from "../utils/orderHelpers";
import { calculateApprovedTotal } from "../utils/calculateApprovedTotal";
import { buildDocumentNumber } from "../utils/buildDocumentNumber";
import { buildVerifyUrl } from "../utils/generateVerificationQR";
import { buildPurchaseVerificationCard } from "./DocumentVerificationCard";
import { buildPurchaseSignatureGrid, PURCHASE_SIGS_AR, PURCHASE_SIGS_EN } from "./DocumentSignatures";

type PrintLabels = {
  docNo: string; issueDate: string; issueTime2: string;
  buyer: string; supplier: string;
  shopName: string; phone: string; email: string;
  address: string; website: string; commercialReg: string;
  orderStatus: string; itemCount: string; printDate2: string;
  items: string; partName: string; partNo: string;
  brand: string; reqQty: string; apprQty: string;
  unitPrice: string; total: string;
  subtotal: string; vat: string; grandTotal: string;
  notes: string; verifyTitle: string; scanPrompt: string;
  verified: string; officialDoc: string;
  issued: string; printed: string; itemsLbl: string;
  sigName: string; sigSign: string; sigDate: string;
  preparedBy: string; approvedBy: string;
  supplierSig: string; buyerSig: string;
  verifiedBy: string; verifiedDesc: string; docAuth: string;
  itemUnit: string;
};

const LABELS: Record<"ar" | "en", PrintLabels> = {
  ar: {
    docNo: "رقم الأمر", issueDate: "تاريخ الإصدار", issueTime2: "وقت الإصدار",
    buyer: "بيانات المشتري", supplier: "بيانات المورد",
    shopName: "اسم المحل", phone: "رقم الجوال", email: "البريد الإلكتروني",
    address: "العنوان", website: "الموقع", commercialReg: "السجل التجاري",
    orderStatus: "حالة الأمر", itemCount: "عدد الأصناف", printDate2: "تاريخ الطباعة",
    items: "الأصناف", partName: "اسم القطعة", partNo: "رقم القطعة",
    brand: "العلامة", reqQty: "الكمية المطلوبة", apprQty: "الكمية المعتمدة",
    unitPrice: "سعر الوحدة", total: "الإجمالي",
    subtotal: "المجموع الفرعي", vat: "ضريبة القيمة المضافة", grandTotal: "الإجمالي الكلي",
    notes: "ملاحظات", verifyTitle: "التحقق", scanPrompt: "امسح للتحقق",
    verified: "✓ تم التحقق من صحة المستند", officialDoc: "مستند رسمي",
    issued: "صدر", printed: "طُبع", itemsLbl: "الأصناف",
    sigName: "الاسم · Name", sigSign: "التوقيع · Signature", sigDate: "التاريخ · Date",
    preparedBy: "إعداد الطلب", approvedBy: "اعتماد الإدارة",
    supplierSig: "توقيع المورد", buyerSig: "توقيع المشتري",
    verifiedBy: "موثق عبر منصة محور · Verified by MIHWAR",
    verifiedDesc: "تم إصدار هذا المستند والتحقق من صحته إلكترونياً عبر منصة محور.",
    docAuth: "Document Authenticity · موثق إلكترونياً عبر منصة محور",
    itemUnit: "صنف",
  },
  en: {
    docNo: "Document No.", issueDate: "Issue Date", issueTime2: "Issue Time",
    buyer: "Buyer Information", supplier: "Supplier Information",
    shopName: "Shop Name", phone: "Phone", email: "Email",
    address: "Address", website: "Website", commercialReg: "Commercial Reg.",
    orderStatus: "Order Status", itemCount: "Item Count", printDate2: "Print Date",
    items: "Order Items", partName: "Part Name", partNo: "Part No.",
    brand: "Brand", reqQty: "Req. Qty", apprQty: "Appr. Qty",
    unitPrice: "Unit Price", total: "Total",
    subtotal: "Subtotal", vat: "VAT", grandTotal: "Grand Total",
    notes: "Notes", verifyTitle: "Verification", scanPrompt: "Scan to verify",
    verified: "✓ Document verified successfully", officialDoc: "Official Document",
    issued: "Issued", printed: "Printed", itemsLbl: "Items",
    sigName: "Name", sigSign: "Signature", sigDate: "Date",
    preparedBy: "Prepared By", approvedBy: "Approved By",
    supplierSig: "Supplier Signature", buyerSig: "Buyer Signature",
    verifiedBy: "Verified by MIHWAR · موثق عبر منصة محور",
    verifiedDesc: "This document has been digitally issued and verified via the MIHWAR platform.",
    docAuth: "Document Authenticity · موثق إلكترونياً عبر منصة محور",
    itemUnit: "items",
  },
};

const STATUS_CFG: Record<string, { ar: string; en: string; bg: string; color: string; dot: string }> = {
  pending:            { ar: "معلق",         en: "Pending",            bg: "#FEF3C7", color: "#92400E", dot: "#D97706" },
  approved:           { ar: "معتمد",        en: "Approved",           bg: "#DCFCE7", color: "#166534", dot: "#16A34A" },
  partially_approved: { ar: "موافقة جزئية", en: "Partially Approved", bg: "#F3E8FF", color: "#6B21A8", dot: "#9333EA" },
  rejected:           { ar: "مرفوض",       en: "Rejected",           bg: "#FEE2E2", color: "#991B1B", dot: "#DC2626" },
  completed:          { ar: "مكتمل",        en: "Completed",          bg: "#DCFCE7", color: "#166534", dot: "#16A34A" },
};

function buildShopRows(shop: ShopInfo | undefined, fields: { key: keyof ShopInfo; label: string }[]): string {
  if (!shop) return "";
  return fields
    .filter(({ key }) => { const v = shop[key]; return v != null && String(v).trim() !== ""; })
    .map(({ key, label }) => `<div style="display:flex;justify-content:space-between;align-items:baseline;padding:4px 0;border-bottom:1px solid #F1F5F9;gap:8px;"><span style="font-size:10px;color:#64748B;font-weight:600;white-space:nowrap;flex-shrink:0;">${label}</span><span style="font-size:11px;color:#1E3A5F;font-weight:700;word-break:break-all;text-align:left;">${escapeHTML(String(shop[key]))}</span></div>`)
    .join("");
}

function buildItemRows(items: OrderItem[], hasBrand: boolean, hasAnyApproved: boolean): string {
  return items.map((item, i) => {
    const dispQty   = hasAnyApproved ? effectiveApproved(item) : item.quantity;
    const lineTotal = item.price * dispQty;
    return `<tr style="background:${i % 2 === 0 ? "#fff" : "#F8FAFC"}">
      <td style="padding:9px 10px;font-size:11px;color:#64748B;font-weight:700;text-align:center;width:28px;">${i + 1}</td>
      <td style="padding:9px 10px;font-size:12.5px;font-weight:700;color:#1E3A5F;">${escapeHTML(item.product?.part_name)}</td>
      <td style="padding:9px 10px;font-family:'JetBrains Mono',monospace;font-size:11px;color:#64748B;">${escapeHTML(item.product?.part_number)}</td>
      ${hasBrand ? `<td style="padding:9px 10px;font-size:11px;color:#64748B;">${escapeHTML(item.product?.brand)}</td>` : ""}
      <td style="padding:9px 10px;font-size:13px;font-weight:700;color:#1E3A5F;text-align:center;">${item.quantity}</td>
      ${hasAnyApproved ? `<td style="padding:9px 10px;font-size:13px;font-weight:800;color:#7C3AED;text-align:center;">${dispQty}</td>` : ""}
      <td style="padding:9px 10px;font-size:12px;text-align:left;">${item.price.toLocaleString("en-SA")}<span style="font-size:9px;color:#94A3B8;"> ر.س</span></td>
      <td style="padding:9px 10px;font-size:13px;font-weight:700;color:#1E3A5F;text-align:left;">${lineTotal.toLocaleString("en-SA")}<span style="font-size:9px;color:#94A3B8;"> ر.س</span></td>
    </tr>`;
  }).join("");
}

export function buildPurchaseOrderPrintHTML(order: Order, items: OrderItem[], printLang: "ar" | "en" = "ar"): string {
  const now        = new Date();
  const dateLocale = printLang === "en" ? "en-SA" : "ar-SA";
  const date       = new Date(order.created_at).toLocaleDateString(dateLocale, { year: "numeric", month: "long", day: "numeric" });
  const issueTime  = new Date(order.created_at).toLocaleTimeString(dateLocale, { hour: "2-digit", minute: "2-digit" });
  const printDate  = now.toLocaleDateString(dateLocale, { year: "numeric", month: "long", day: "numeric" });
  const printTime  = now.toLocaleTimeString(dateLocale, { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  const docNumber         = buildDocumentNumber(order.id, "PURCHASE");
  const docTitlePrimary   = printLang === "en" ? "Purchase Order" : "أمر شراء";
  const docTitleSecondary = printLang === "en" ? "أمر شراء" : "Purchase Order";

  const sc = STATUS_CFG[order.status] || STATUS_CFG.pending;
  const hasBrand       = items.some(i => i.product?.brand);
  const hasAnyApproved = items.some(i => i.approved_quantity != null && i.approved_quantity > 0);
  const PL = LABELS[printLang];

  const subtotal  = calculateApprovedTotal(items);
  const verifyUrl = buildVerifyUrl(order.id);
  const rows      = buildItemRows(items, hasBrand, hasAnyApproved);

  const sigBlocks = printLang === "ar"
    ? [[PL.preparedBy, "Prepared By"], [PL.approvedBy, "Approved By"], [PL.supplierSig, "Supplier Signature"], [PL.buyerSig, "Buyer Signature"]] as [string, string][]
    : PURCHASE_SIGS_EN;
  const verificationCard = buildPurchaseVerificationCard(docNumber, verifyUrl, {
    title: PL.verifyTitle,
    subtitle: "MIHWAR Verification",
    scanPrompt: PL.scanPrompt,
    verifiedTag: "✓ Verified by MIHWAR",
  });
  const signatureGrid = buildPurchaseSignatureGrid(sigBlocks);

  const buyerFields  = [{ key: "shop_name" as keyof ShopInfo, label: PL.shopName }, { key: "phone" as keyof ShopInfo, label: PL.phone }, { key: "email" as keyof ShopInfo, label: PL.email }, { key: "address" as keyof ShopInfo, label: PL.address }];
  const supFields    = [{ key: "shop_name" as keyof ShopInfo, label: PL.shopName }, { key: "phone" as keyof ShopInfo, label: PL.phone }, { key: "email" as keyof ShopInfo, label: PL.email }, { key: "website" as keyof ShopInfo, label: PL.website }, { key: "commercial_registration" as keyof ShopInfo, label: PL.commercialReg }, { key: "address" as keyof ShopInfo, label: PL.address }];

  return `<!DOCTYPE html><html lang="${printLang === "ar" ? "ar" : "en"}" dir="${printLang === "ar" ? "rtl" : "ltr"}">
<head><meta charset="UTF-8"><title>${docNumber} — Purchase Order MIHWAR</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap');
@page{size:A4 portrait;margin:8mm 10mm;}
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'IBM Plex Sans Arabic',Tahoma,Arial,sans-serif;font-size:12px;color:#1E3A5F;background:#fff;line-height:1.5;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.wm{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-30deg);font-size:90px;font-weight:800;color:rgba(30,58,95,0.025);white-space:nowrap;pointer-events:none;z-index:0;user-select:none;}
.page{width:100%;max-width:794px;margin:0 auto;position:relative;z-index:1;}
@media print{.page{page-break-after:always;}table{page-break-inside:auto;}tr{page-break-inside:avoid;page-break-after:auto;}}
</style>
</head><body>
<div class="wm">محور MIHWAR</div>
<div class="page">

<!-- HEADER -->
<div style="background:#fff;border:2px solid #CBD5E1;border-radius:12px 12px 0 0;border-bottom:4px solid #1E40AF;padding:18px 24px 16px;display:flex;align-items:center;justify-content:space-between;gap:16px;">
  <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-start;">
    <div style="font-weight:800;font-size:34px;color:#0A2A6B;line-height:1;letter-spacing:-1px;">محور</div>
    <div style="font-size:9px;font-weight:700;color:#1E40AF;letter-spacing:1px;text-transform:uppercase;">MIHWAR Verification Center</div>
    <div style="font-size:9px;color:#10B981;font-weight:600;">${PL.verified}</div>
  </div>
  <div style="text-align:center;flex:1;">
    <div style="font-size:28px;font-weight:800;color:#1E3A5F;line-height:1;">${docTitlePrimary}</div>
    <div style="font-size:11px;font-weight:600;color:#94A3B8;letter-spacing:3px;text-transform:uppercase;margin-top:4px;">${docTitleSecondary}</div>
    <div style="width:48px;height:3px;background:#2563EB;margin:8px auto 0;border-radius:2px;"></div>
  </div>
  <div style="background:#1E40AF;border-radius:10px;padding:12px 18px;min-width:148px;text-align:right;">
    <span style="font-size:8px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#93C5FD;display:block;">${PL.docNo}</span>
    <span style="font-family:'JetBrains Mono',monospace;font-size:22px;font-weight:600;color:#fff;display:block;letter-spacing:0.5px;margin-top:3px;">${docNumber}</span>
    <span style="font-size:10px;color:#BFDBFE;display:block;margin-top:3px;">${date}</span>
  </div>
</div>

<!-- STATUS BAR -->
<div style="background:#1E3A5F;border-right:2px solid #CBD5E1;border-left:2px solid #CBD5E1;padding:8px 24px;display:flex;align-items:center;justify-content:space-between;gap:8px;">
  <div style="display:flex;align-items:center;gap:14px;">
    <div style="display:flex;align-items:center;gap:5px;"><span style="font-size:8px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#475569;">${PL.issued}</span><span style="font-family:'JetBrains Mono',monospace;font-size:9.5px;color:#94A3B8;">${issueTime}</span></div>
    <div style="width:1px;height:13px;background:#2D4A6A;"></div>
    <div style="display:flex;align-items:center;gap:5px;"><span style="font-size:8px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#475569;">${PL.printed}</span><span style="font-family:'JetBrains Mono',monospace;font-size:9.5px;color:#94A3B8;">${printTime}</span></div>
    <div style="width:1px;height:13px;background:#2D4A6A;"></div>
    <div style="display:flex;align-items:center;gap:5px;"><span style="font-size:8px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#475569;">${PL.itemsLbl}</span><span style="font-family:'JetBrains Mono',monospace;font-size:9.5px;color:#94A3B8;">${items.length}</span></div>
  </div>
  <div style="display:flex;align-items:center;gap:8px;">
    <span style="display:inline-flex;align-items:center;gap:5px;padding:4px 14px 4px 10px;border-radius:20px;background:${sc.bg};color:${sc.color};font-size:11px;font-weight:700;"><span style="width:7px;height:7px;border-radius:50%;background:${sc.dot};flex-shrink:0;"></span>${sc.ar} <span style="font-size:9px;font-weight:500;opacity:0.7;margin-right:3px;">${sc.en}</span></span>
    <span style="font-size:8px;font-weight:700;letter-spacing:1px;color:#475569;text-transform:uppercase;border:1px solid #2D4A6A;padding:2px 8px;border-radius:4px;">${PL.officialDoc}</span>
  </div>
</div>

<!-- PARTY CARDS -->
<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px;">
  <div style="border:1.5px solid #CBD5E1;border-radius:10px;overflow:hidden;">
    <div style="background:#1E40AF;padding:9px 14px;display:flex;align-items:center;justify-content:space-between;">
      <div><div style="font-size:12px;font-weight:700;color:#fff;">${PL.buyer}</div><div style="font-size:9px;font-weight:500;color:#93C5FD;">Buyer Information</div></div>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#93C5FD" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
    </div>
    <div style="padding:10px 14px;background:#fff;">
      ${buildShopRows(order.from_shop, buyerFields)}
      <div style="display:flex;justify-content:space-between;align-items:baseline;padding:4px 0;border-bottom:1px solid #F1F5F9;gap:8px;"><span style="font-size:10px;color:#64748B;font-weight:600;">${PL.docNo}</span><span style="font-family:'JetBrains Mono',monospace;font-size:11px;color:#1E3A5F;font-weight:700;">${docNumber}</span></div>
      <div style="display:flex;justify-content:space-between;align-items:baseline;padding:4px 0;gap:8px;"><span style="font-size:10px;color:#64748B;font-weight:600;">${PL.issueDate}</span><span style="font-size:11px;color:#1E3A5F;font-weight:700;">${date}</span></div>
    </div>
  </div>
  <div style="border:1.5px solid #CBD5E1;border-radius:10px;overflow:hidden;">
    <div style="background:#1E40AF;padding:9px 14px;display:flex;align-items:center;justify-content:space-between;">
      <div><div style="font-size:12px;font-weight:700;color:#fff;">${PL.supplier}</div><div style="font-size:9px;font-weight:500;color:#93C5FD;">Supplier Information</div></div>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#93C5FD" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
    </div>
    <div style="padding:10px 14px;background:#fff;">
      ${buildShopRows(order.to_shop, supFields)}
      <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;gap:8px;"><span style="font-size:10px;color:#64748B;font-weight:600;">${PL.orderStatus}</span><span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:20px;background:${sc.bg};color:${sc.color};font-size:10px;font-weight:700;"><span style="width:5px;height:5px;border-radius:50%;background:${sc.dot};"></span>${sc.ar}</span></div>
    </div>
  </div>
</div>

<!-- ITEMS TABLE -->
<div style="margin-top:13px;">
  <div style="display:flex;align-items:center;gap:8px;margin-bottom:7px;">
    <div style="width:4px;height:18px;background:#2563EB;border-radius:3px;"></div>
    <div><div style="font-size:13px;font-weight:700;color:#1E3A5F;">${PL.items}</div><div style="font-size:9px;font-weight:600;color:#94A3B8;letter-spacing:1px;text-transform:uppercase;">Order Items</div></div>
  </div>
  <div style="border:1.5px solid #CBD5E1;border-radius:10px;overflow:hidden;">
    <table style="width:100%;border-collapse:collapse;table-layout:auto;">
      <thead>
        <tr style="background:#1E40AF;">
          <th style="padding:9px 10px;font-size:8.5px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;color:#93C5FD;text-align:center;width:28px;">#</th>
          <th style="padding:9px 10px;font-size:8.5px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;color:#93C5FD;text-align:right;">${PL.partName}<br/><span style="font-size:7.5px;color:#60A5FA;font-weight:500;text-transform:none;">Part Name</span></th>
          <th style="padding:9px 10px;font-size:8.5px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;color:#93C5FD;text-align:right;width:100px;">${PL.partNo}<br/><span style="font-size:7.5px;color:#60A5FA;font-weight:500;text-transform:none;">Part No.</span></th>
          ${hasBrand ? `<th style="padding:9px 10px;font-size:8.5px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;color:#93C5FD;text-align:right;width:72px;">${PL.brand}</th>` : ""}
          <th style="padding:9px 10px;font-size:8.5px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;color:#93C5FD;text-align:center;width:52px;">${PL.reqQty}<br/><span style="font-size:7.5px;color:#60A5FA;font-weight:500;text-transform:none;">Req.</span></th>
          ${hasAnyApproved ? `<th style="padding:9px 10px;font-size:8.5px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;color:#C4B5FD;text-align:center;width:52px;">${PL.apprQty}<br/><span style="font-size:7.5px;color:#A78BFA;font-weight:500;text-transform:none;">Appr.</span></th>` : ""}
          <th style="padding:9px 10px;font-size:8.5px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;color:#93C5FD;text-align:left;width:88px;">${PL.unitPrice}</th>
          <th style="padding:9px 10px;font-size:8.5px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;color:#93C5FD;text-align:left;width:90px;">${PL.total}</th>
        </tr>
      </thead>
      <tbody style="border:1.5px solid #E2E8F0;">${rows}</tbody>
    </table>
  </div>
</div>

<!-- BOTTOM ROW -->
<div style="display:flex;border:1.5px solid #CBD5E1;border-top:none;border-radius:0 0 10px 10px;overflow:hidden;">
  ${order.notes ? `<div style="flex:1;background:#FFFBEB;border-left:1.5px solid #E2E8F0;padding:12px 14px;"><div style="font-size:9px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#B45309;margin-bottom:5px;">${PL.notes}</div><div style="font-size:11.5px;color:#78350F;line-height:1.7;">${escapeHTML(order.notes)}</div></div>` : `<div style="flex:1;background:#F8FAFC;"></div>`}
  <div style="width:260px;flex-shrink:0;background:#F8FAFC;">
    <div style="display:flex;justify-content:space-between;align-items:center;padding:9px 14px;border-bottom:1px solid #CBD5E1;font-size:12px;"><span style="color:#64748B;font-weight:600;">${PL.subtotal}</span><span style="font-weight:700;color:#1E3A5F;font-family:'JetBrains Mono',monospace;">${subtotal.toLocaleString("en-SA")} ر.س</span></div>
    <div style="display:flex;justify-content:space-between;align-items:center;padding:9px 14px;border-bottom:1px solid #CBD5E1;font-size:12px;"><span style="color:#64748B;font-weight:600;">${PL.vat}</span><span style="color:#94A3B8;font-weight:700;">—</span></div>
    <div style="background:#1E40AF;padding:14px;display:flex;justify-content:space-between;align-items:center;"><span style="font-size:11.5px;font-weight:700;color:#BFDBFE;">${PL.grandTotal}</span><span style="font-size:22px;font-weight:800;color:#34D399;font-family:'JetBrains Mono',monospace;">${subtotal.toLocaleString("en-SA")}<span style="font-size:11px;font-weight:600;color:#64A07A;margin-right:4px;">ر.س</span></span></div>
  </div>
</div>

<!-- QR + SIGNATURES -->
<div style="display:flex;gap:12px;margin-top:16px;align-items:stretch;">
  ${verificationCard}
  ${signatureGrid}
</div>

<!-- VERIFICATION STRIP -->
<div style="margin-top:12px;border:1.5px solid #BBF7D0;border-radius:10px;overflow:hidden;">
  <div style="background:#DCFCE7;padding:9px 16px;display:flex;align-items:center;gap:8px;"><span style="font-size:14px;">✓</span><span style="font-weight:700;font-size:11.5px;color:#166534;">${PL.verifiedBy}</span></div>
  <div style="background:#F0FDF4;padding:9px 16px;display:flex;justify-content:space-between;align-items:center;gap:12px;">
    <div style="font-size:9.5px;color:#15803D;line-height:1.7;">${PL.verifiedDesc}</div>
    <div style="font-size:9px;color:#16A34A;white-space:nowrap;font-style:italic;">Digitally verified · MIHWAR Marketplace</div>
  </div>
</div>

<!-- DOC AUTHENTICITY -->
<div style="margin-top:8px;border:1.5px solid #CBD5E1;border-radius:10px;overflow:hidden;">
  <div style="background:#1E3A5F;padding:7px 16px;"><span style="font-weight:700;font-size:10px;color:#fff;">${PL.docAuth}</span></div>
  <div style="background:#F8FAFC;padding:9px 16px;display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:5px 16px;">
    <div><span style="font-weight:700;color:#94A3B8;display:block;font-size:8px;text-transform:uppercase;margin-bottom:2px;">Document ID</span><span style="font-family:'JetBrains Mono',monospace;color:#1E3A5F;font-weight:700;font-size:9px;">${docNumber}</span></div>
    <div><span style="font-weight:700;color:#94A3B8;display:block;font-size:8px;text-transform:uppercase;margin-bottom:2px;">Document Type</span><span style="color:#1D4ED8;font-weight:700;font-size:9px;">${docTitlePrimary}</span></div>
    <div><span style="font-weight:700;color:#94A3B8;display:block;font-size:8px;text-transform:uppercase;margin-bottom:2px;">Verification</span><span style="color:#16A34A;font-weight:700;font-size:9px;">✓ Verified</span></div>
    <div><span style="font-weight:700;color:#94A3B8;display:block;font-size:8px;text-transform:uppercase;margin-bottom:2px;">Print Time</span><span style="font-family:'JetBrains Mono',monospace;color:#1E3A5F;font-weight:600;font-size:9px;">${printDate} ${printTime}</span></div>
  </div>
</div>

<!-- FOOTER -->
<div style="margin-top:10px;background:#1E40AF;border-radius:0 0 12px 12px;border-top:3px solid #2563EB;padding:12px 24px;text-align:center;">
  <div style="font-weight:800;font-size:17px;color:#fff;letter-spacing:0.5px;">محور · MIHWAR</div>
  <div style="font-size:9px;color:#93C5FD;letter-spacing:2px;text-transform:uppercase;margin-top:2px;">MIHWAR Verification Center</div>
  <div style="font-size:8.5px;color:#60A5FA;margin-top:2px;">Powered by MIHWAR Marketplace · منصة محور لقطع غيار المركبات</div>
  <div style="font-family:'JetBrains Mono',monospace;font-size:8px;color:#BFDBFE;margin-top:4px;">www.mihwarb2b.com · ${docNumber} · ${printDate}</div>
</div>

</div></body></html>`;
}
