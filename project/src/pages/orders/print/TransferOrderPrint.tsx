import type { Order, OrderItem, OrderStatus } from "../types";
import { escapeHTML } from "../utils/orderHelpers";
import { calculateApprovedTotal } from "../utils/calculateApprovedTotal";
import { buildDocumentNumber } from "../utils/buildDocumentNumber";
import { buildVerifyUrl } from "../utils/generateVerificationQR";

const C128_PATTERNS = [
  "11011001100","11001101100","11001100110","10010011000","10010001100",
  "10001001100","10011001000","10011000100","10001100100","11001001000",
  "11001000100","11000100100","10110011100","10011011100","10011001110",
  "10111001100","10011101100","10011100110","11001110010","11001011100",
  "11001001110","11011100100","11001110100","11101101110","11101001100",
  "11100101100","11100100110","11101100100","11100110100","11100110010",
  "11011011000","11011000110","11000110110","10100011000","10001011000",
  "10001000110","10110001000","10001101000","10001100010","11010001000",
  "11000101000","11000100010","10110111000","10110001110","10001101110",
  "10111011000","10111000110","10001110110","11101110110","11010001110",
  "11000101110","11011101000","11011100010","11011101110","11101011000",
  "11101000110","11100010110","11101101000","11101100010","11100011010",
  "11101111010","11001000010","11110001010","10100110000","10100001100",
  "10010110000","10010000110","10000101100","10000100110","10110010000",
  "10110000100","10011010000","10011000010","10000110100","10000110010",
  "11000010010","11001010000","11110111010","11000010100","10001111010",
  "10100111100","10010111100","10010011110","10111100100","10011110100",
  "10011110010","11110100100","11110010100","11110010010","11011011110",
  "11011110110","11110110110","10101111000","10100011110","10001011110",
  "10111101000","10111100010","11110101000","11110100010","10111011110",
  "10111101110","11101011110","11110101110","11010000100","11010010000",
  "11010011100","1100011101011",
];

function code128Bits(value: string): string {
  if (!value) return "";
  const codes: number[] = [104]; // Start B
  for (const ch of value) {
    const v = ch.charCodeAt(0) - 32;
    if (v < 0 || v > 94) continue;
    codes.push(v);
  }
  let sum = 104;
  for (let i = 1; i < codes.length; i++) sum += codes[i] * i;
  codes.push(sum % 103); // checksum
  codes.push(106);       // Stop
  return codes.map((c) => C128_PATTERNS[c]).join("");
}

function code128SvgString(value: string, moduleWidth = 1.5, height = 40): string {
  const bits = code128Bits(value);
  if (!bits) return "";
  const QZ = 10; // quiet zone
  const width = (bits.length + QZ * 2) * moduleWidth;
  let rects = "";
  let i = 0;
  while (i < bits.length) {
    if (bits[i] === "1") {
      let run = 1;
      while (bits[i + run] === "1") run++;
      const x = (QZ + i) * moduleWidth;
      rects += `<rect x="${x.toFixed(2)}" y="0" width="${(run * moduleWidth).toFixed(2)}" height="${height}" fill="#111"/>`;
      i += run;
    } else {
      i++;
    }
  }
  return `<svg width="${width.toFixed(1)}" height="${height + 15}" viewBox="0 0 ${width.toFixed(1)} ${height + 15}" xmlns="http://www.w3.org/2000/svg"><rect width="${width.toFixed(1)}" height="${height}" fill="#fff"/>${rects}<text x="${(width / 2).toFixed(1)}" y="${height + 11}" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="11" letter-spacing="2" fill="#111">${escapeHTML(value)}</text></svg>`;
}

const ACCENT = "#1f3a5f";
const LINE   = "#b9bec4";
const LINE_S = "#dde1e5";
const FILL2  = "#f7f9fa";
const INK    = "#151515";
const SOFT   = "#4a4f55";
const FAINT  = "#7c828a";

type TransferStatusCfg = { label: string; bg: string; color: string; dot: string };

function getTransferStatusCfg(status: OrderStatus, printLang: "ar" | "en"): TransferStatusCfg {
  const map: Record<OrderStatus, { ar: string; en: string; bg: string; color: string; dot: string }> = {
    pending:            { ar: "قيد الانتظار",  en: "Pending",            bg: "#FEF3C7", color: "#92400E", dot: "#D97706" },
    partially_approved: { ar: "تحويل جزئي",     en: "Partially Approved", bg: "#DBEAFE", color: "#1E40AF", dot: "#2563EB" },
    approved:           { ar: "معتمد",          en: "Approved",           bg: "#DCFCE7", color: "#166534", dot: "#16A34A" },
    completed:          { ar: "معتمد",          en: "Approved",           bg: "#DCFCE7", color: "#166534", dot: "#16A34A" },
    rejected:           { ar: "ملغى",           en: "Cancelled",          bg: "#FEE2E2", color: "#991B1B", dot: "#DC2626" },
  };
  const m = map[status] ?? map.pending;
  return { label: printLang === "ar" ? m.ar : m.en, bg: m.bg, color: m.color, dot: m.dot };
}

function displayRemainingQty(item: OrderItem): number {
  const approvedQty = item.approved_quantity != null ? item.approved_quantity : 0;
  return Math.max(0, item.quantity - approvedQty);
}

function buildItemRows(items: OrderItem[], hasAnyApproved: boolean, hasAnyRemaining: boolean): string {
  return items.map((item, i) => {
    const approvedQty = item.approved_quantity != null ? item.approved_quantity : 0;
    const dispQty     = hasAnyApproved ? approvedQty : item.quantity;
    const remaining   = displayRemainingQty(item);
    const lineTotal   = item.price * dispQty;
    const zebra       = i % 2 === 0 ? "#fff" : FILL2;
    return `<tr style="background:${zebra}">
      <td style="padding:8px 9px;border:1px solid ${LINE};font-family:'JetBrains Mono',monospace;font-size:11px;color:${SOFT};text-align:center;">${i + 1}</td>
      <td style="padding:8px 9px;border:1px solid ${LINE};font-size:12px;font-weight:600;color:${INK};text-align:center;">${escapeHTML(item.product?.product_name)}</td>
      <td style="padding:8px 9px;border:1px solid ${LINE};font-family:'JetBrains Mono',monospace;font-size:12px;color:${INK};text-align:center;">${item.quantity}</td>
      ${hasAnyApproved ? `<td style="padding:8px 9px;border:1px solid ${LINE};font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:700;color:${ACCENT};text-align:center;">${dispQty}</td>` : ""}
      ${hasAnyRemaining ? `<td style="padding:8px 9px;border:1px solid ${LINE};font-family:'JetBrains Mono',monospace;font-size:12px;color:${remaining > 0 ? "#B45309" : SOFT};text-align:center;">${remaining}</td>` : ""}
      <td style="padding:8px 9px;border:1px solid ${LINE};font-family:'JetBrains Mono',monospace;font-size:11.5px;color:${INK};text-align:left;">${item.price.toLocaleString("en-SA")}<span style="font-size:9px;color:${FAINT};"> ر.س</span></td>
      <td style="padding:8px 9px;border:1px solid ${LINE};font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:700;color:${INK};text-align:left;">${lineTotal.toLocaleString("en-SA")}<span style="font-size:9px;color:${FAINT};"> ر.س</span></td>
    </tr>`;
  }).join("");
}

export function buildTransferOrderPrintHTML(order: Order, items: OrderItem[], printLang: "ar" | "en" = "ar", qrDataUrl?: string): string {
  const now        = new Date();
  const dateLocale = printLang === "en" ? "en-SA" : "ar-SA";
  const date       = new Date(order.created_at).toLocaleDateString(dateLocale, { year: "numeric", month: "long", day: "numeric" });
  const issueTime  = new Date(order.created_at).toLocaleTimeString(dateLocale, { hour: "2-digit", minute: "2-digit" });
  const printDate  = now.toLocaleDateString(dateLocale, { year: "numeric", month: "long", day: "numeric" });
  const printTime  = now.toLocaleTimeString(dateLocale, { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  const docNumber       = buildDocumentNumber(order.id, "TRANSFER");
  const subtotal        = calculateApprovedTotal(items);
  const verifyUrl       = buildVerifyUrl(order.id);
  const hasAnyApproved  = items.some(i => i.approved_quantity != null && i.approved_quantity > 0);
  const hasAnyRemaining = items.some(i => displayRemainingQty(i) > 0);
  const rows            = buildItemRows(items, hasAnyApproved, hasAnyRemaining);
  const statusCfg       = getTransferStatusCfg(order.status, printLang);
  const barcodeSvg      = code128SvgString(docNumber);

  const totalItems        = items.length;
  const totalQuantity     = items.reduce((s, i) => s + i.quantity, 0);
  const approvedQuantity  = items.reduce((s, i) => s + (i.approved_quantity != null && i.approved_quantity > 0 ? i.approved_quantity : 0), 0);
  const remainingQuantity = Math.max(0, totalQuantity - approvedQuantity);
  const completionPct     = totalQuantity > 0 ? Math.round((approvedQuantity / totalQuantity) * 100) : 0;

  const isPartial   = order.status === "partially_approved";
  const isCompleted = order.status === "approved" || order.status === "completed";
  const isRejected  = order.status === "rejected";

  const displayVerifyUrl = verifyUrl.includes("localhost") || verifyUrl.includes("127.0.0.1")
    ? `https://mihwarb2b.com/verify/${order.id}`
    : verifyUrl;

  // Read the group activity from the requesting branch. Cast locally so this
  // file does not depend on a ShopInfo type change.
  const fromActivity = (order.from_shop as { activity_type?: string | null } | undefined)?.activity_type;

  const L = printLang === "ar" ? {
    brandLine1: "منصة محور للتجارة بين الشركات", brandLine2: fromActivity ? `شبكة محور لـ${fromActivity}` : "شبكة محور التجارية",
    headerTitle: "طلب تحويل", headerSub: "TRANSFER ORDER",
    sendingBranch: "الفرع الطالب", receivingBranch: "الفرع المورّد",
    sendingSub: "يستلم البضاعة", receivingSub: "يرسل البضاعة",
    sumType: "نوع التحويل", sumTypeVal: "تحويل بين الفروع",
    sumDate: "تاريخ التحويل", sumDocNo: "رقم المستند",
    sumTotalItems: "عدد الأصناف", sumTotalQty: "إجمالي الكمية",
    execTitle: "ملخص التنفيذ",
    execTotalItems: "عدد الأصناف", execTotalQty: "إجمالي الكمية",
    execApprovedQty: "الكمية المعتمدة", execRemainingQty: "الكمية المتبقية", execCompletion: "نسبة الإنجاز",
    auditTitle: "سجل تتبع المستند", auditSub: "Document Audit Trail",
    auditCreated: "تم الإنشاء", auditPartial: "اعتماد جزئي", auditCompleted: "اكتمال الاعتماد", auditCancelled: "إلغاء الطلب",
    auditPending: "قيد الانتظار",
    itemsSectionAr: "الأصناف المحوّلة", itemsSectionSub: "بنود التحويل",
    colPartName: "اسم المنتج", colPartNo: "رقم القطعة", colReq: "المطلوب",
    colTransferred: "المعتمد", colRemaining: "المتبقي", colUnitPrice: "سعر الوحدة", colTotal: "الإجمالي",
    notes: "ملاحظات", grandTotal: "الإجمالي الكلي",
    verifyTitle: "التحقق من المستند", verifySub: "بوابة التحقق الرسمية",
    verifyBadge: "✓ مستند موثّق", verifyStatusLabel: "حالة المستند",
    scanPrompt: "امسح الرمز للتحقق",
    docBarcodeLabel: "باركود المستند",
    footerWebsite: "الموقع", footerEmail: "البريد", footerVersion: "إصدار المستند", footerPrinted: "وقت الطباعة",
    sysGenerated: "أُنشئ إلكترونيًا بواسطة نظام محور — لا يتطلب توقيعًا يدويًا للصلاحية",
    sigSender: "استلام الفرع الطالب", sigReceiver: "تسليم الفرع المورّد", sigManager: "مدير الفرع", sigSystem: "اعتماد النظام",
    page: "صفحة",
  } : {
    brandLine1: "MIHWAR B2B Marketplace", brandLine2: fromActivity ? `MIHWAR ${fromActivity} Network` : "MIHWAR Trading Network",
    headerTitle: "Transfer Order", headerSub: "BRANCH TRANSFER",
    sendingBranch: "Requesting Branch", receivingBranch: "Supplying Branch",
    sendingSub: "Receives goods", receivingSub: "Sends goods",
    sumType: "Transfer Type", sumTypeVal: "Branch to Branch",
    sumDate: "Transfer Date", sumDocNo: "Document Number",
    sumTotalItems: "Total Items", sumTotalQty: "Total Quantity",
    execTitle: "Execution Summary",
    execTotalItems: "Total Items", execTotalQty: "Total Quantity",
    execApprovedQty: "Approved Quantity", execRemainingQty: "Remaining Quantity", execCompletion: "Completion",
    auditTitle: "Document Audit Trail", auditSub: "سجل تتبع المستند",
    auditCreated: "Created", auditPartial: "Partially Approved", auditCompleted: "Approval Completed", auditCancelled: "Order Cancelled",
    auditPending: "Pending",
    itemsSectionAr: "Transferred Items", itemsSectionSub: "Transfer Line Items",
    colPartName: "Product Name", colPartNo: "Part No.", colReq: "Req. Qty",
    colTransferred: "Approved Qty", colRemaining: "Remaining Qty", colUnitPrice: "Unit Price", colTotal: "Total",
    notes: "Notes", grandTotal: "Grand Total",
    verifyTitle: "Document Verification", verifySub: "Official Verification Portal",
    verifyBadge: "✓ Verified Document", verifyStatusLabel: "Document Status",
    scanPrompt: "Scan to verify",
    docBarcodeLabel: "Document Barcode",
    footerWebsite: "Website", footerEmail: "Email", footerVersion: "Document Version", footerPrinted: "Print Time",
    sysGenerated: "Generated electronically by MIHWAR — no handwritten signature required for validity",
    sigSender: "Requesting Branch", sigReceiver: "Supplying Branch", sigManager: "Branch Manager", sigSystem: "System Approval",
    page: "Page",
  };

  type AuditState = "done" | "current" | "upcoming" | "cancelled";
  type AuditStage  = { icon: string; label: string; time: string; state: AuditState };

  const auditStages: AuditStage[] = isRejected
    ? [
        { icon: "file-plus", label: L.auditCreated,   time: `${date} · ${issueTime}`, state: "done" },
        { icon: "x",         label: L.auditCancelled, time: `${printDate}`,           state: "cancelled" },
      ]
    : [
        { icon: "file-plus",    label: L.auditCreated,   time: `${date} · ${issueTime}`, state: "done" },
        { icon: "checkbox",     label: L.auditPartial,   time: isPartial || isCompleted ? `${printDate}` : L.auditPending, state: isPartial ? "current" : (isCompleted ? "done" : "upcoming") },
        { icon: "circle-check", label: L.auditCompleted, time: isCompleted ? `${printDate}` : L.auditPending, state: isCompleted ? "current" : "upcoming" },
      ];

  function auditStageColors(state: AuditState): { circleBg: string; circleBorder: string; iconColor: string; textColor: string; timeColor: string } {
    if (state === "done" || state === "current") {
      return { circleBg: ACCENT, circleBorder: ACCENT, iconColor: "#fff", textColor: INK, timeColor: SOFT };
    }
    if (state === "cancelled") {
      return { circleBg: "#FEE2E2", circleBorder: "#DC2626", iconColor: "#991B1B", textColor: "#991B1B", timeColor: "#B91C1C" };
    }
    return { circleBg: "#fff", circleBorder: LINE, iconColor: FAINT, textColor: SOFT, timeColor: FAINT };
  }

  function auditIconSvg(icon: string, color: string): string {
    if (icon === "file-plus") {
      return `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>`;
    }
    if (icon === "checkbox") {
      return `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.2"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="m9 12 2 2 4-4"/></svg>`;
    }
    if (icon === "x") {
      return `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    }
    return `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.2"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>`;
  }

  const auditStrip = auditStages.map((stage, i) => {
    const c = auditStageColors(stage.state);
    const isDashed = stage.state === "upcoming";
    const opacity = stage.state === "upcoming" ? "0.65" : "1";
    const connector = i < auditStages.length - 1
      ? `<div style="flex:1;height:2px;background:${stage.state === "done" ? ACCENT : LINE_S};margin:14px -6px 0;"></div>`
      : "";
    return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:5px;position:relative;z-index:1;opacity:${opacity};">
      <div style="width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:${c.circleBg};border:2px ${isDashed ? "dashed" : "solid"} ${c.circleBorder};">
        ${auditIconSvg(stage.icon, c.iconColor)}
      </div>
      <span style="font-size:10.5px;font-weight:700;color:${c.textColor};text-align:center;">${stage.label}</span>
      <span style="font-size:8.5px;color:${c.timeColor};text-align:center;line-height:1.4;">${stage.time}</span>
    </div>${connector}`;
  }).join("");

  const sigRoles: string[] = [L.sigSender, L.sigReceiver, L.sigManager, L.sigSystem];

  const signatureCards = sigRoles.map(role => `
    <div style="flex:1;border:1px solid ${LINE};border-radius:6px;overflow:hidden;min-width:0;">
      <div style="background:${ACCENT};padding:6px 4px;text-align:center;">
        <span style="font-size:9px;font-weight:600;color:#fff;line-height:1.2;display:block;">${role}</span>
      </div>
      <div style="background:#fff;padding:8px 7px;display:flex;flex-direction:column;gap:8px;">
        <div><span style="font-size:6.5px;font-weight:700;color:${FAINT};letter-spacing:0.3px;">NAME</span><div style="border-bottom:1px solid ${LINE_S};height:12px;"></div></div>
        <div><span style="font-size:6.5px;font-weight:700;color:${FAINT};letter-spacing:0.3px;">SIGNATURE</span><div style="border-bottom:1px solid ${LINE_S};height:12px;"></div></div>
        <div><span style="font-size:6.5px;font-weight:700;color:${FAINT};letter-spacing:0.3px;">DATE</span><div style="border-bottom:1px solid ${LINE_S};height:12px;"></div></div>
      </div>
    </div>`).join("");

  const execCell = (val: string, label: string, color: string, withBorder: boolean) =>
    `<div style="text-align:center;${withBorder ? `border-left:1px solid ${LINE_S};` : ""}">
      <span style="font-size:20px;font-weight:700;color:${color};display:block;font-family:'JetBrains Mono',monospace;">${val}</span>
      <span style="font-size:8px;font-weight:600;letter-spacing:.4px;text-transform:uppercase;color:${FAINT};">${label}</span>
    </div>`;

  return `<!DOCTYPE html><html lang="${printLang === "ar" ? "ar" : "en"}" dir="${printLang === "ar" ? "rtl" : "ltr"}">
<head><meta charset="UTF-8"><title>${docNumber} — ${L.headerTitle} MIHWAR B2B</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap');
@page{size:A4 portrait;margin:10mm 0;}
*{box-sizing:border-box;margin:0;padding:0;}
html,body{width:100%;}
body{font-family:'IBM Plex Sans Arabic',Tahoma,Arial,sans-serif;font-size:12px;color:${INK};background:#e7eaed;line-height:1.55;-webkit-print-color-adjust:exact;print-color-adjust:exact;display:flex;justify-content:center;}
.mono{font-family:'JetBrains Mono',monospace;direction:ltr;unicode-bidi:embed;}
.toolbar{position:fixed;top:0;left:0;right:0;z-index:9;display:flex;align-items:center;justify-content:space-between;gap:16px;background:#0f172a;color:#e2e8f0;padding:11px 22px;font-size:13px;font-weight:600;}
.toolbar button{background:#f8fafc;color:#0f172a;border:0;border-radius:8px;padding:9px 20px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;}
.page{width:100%;max-width:744px;flex-shrink:0;position:relative;z-index:1;background:#fff;margin:56px 10mm 20px;padding:14mm 12mm;box-shadow:0 8px 30px rgba(2,6,23,.12);}
.no-break{page-break-inside:avoid;}
@media print{
  html,body{background:#fff;}
  .toolbar{display:none;}
  .page{max-width:100%;margin:0;padding:0;box-shadow:none;}
  tr,thead{page-break-inside:avoid;}
  .no-break{page-break-inside:avoid;}
}
@media screen and (max-width:768px){
  body{display:block;}
  .page{max-width:100%;margin:56px 0 0;padding:14px 10px;}
  .branch-row{flex-direction:column;gap:10px;}
  .exec-grid{grid-template-columns:repeat(2,1fr) !important;}
  .verify-row{flex-direction:column;}
  .verify-card{width:100% !important;}
  .sig-row{flex-wrap:wrap !important;}
  table{display:block;overflow-x:auto;white-space:nowrap;}
}
</style>
</head><body>
<div class="toolbar">
  <span>${printLang === "ar" ? "معاينة سند التحويل — اختر «طباعة» ثم «حفظ كـPDF»" : "Transfer document preview — choose Print then Save as PDF"}</span>
  <button onclick="window.print()">🖨 ${printLang === "ar" ? "طباعة / حفظ PDF" : "Print / Save PDF"}</button>
</div>
<div class="page">

<div class="no-break" style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding-bottom:13px;border-bottom:2px solid ${ACCENT};">
  <div>
    <div style="font-weight:800;font-size:26px;color:${ACCENT};line-height:1;letter-spacing:-.5px;">محور <span style="font-size:10px;font-weight:400;letter-spacing:1.5px;color:${FAINT};">MIHWAR B2B</span></div>
    <div style="font-size:9.5px;color:${SOFT};margin-top:6px;line-height:1.7;">${L.brandLine1}</div>
    <div style="font-size:9.5px;color:${SOFT};line-height:1.7;">${L.brandLine2}</div>
  </div>
  <div style="text-align:${printLang === "ar" ? "left" : "right"};">
    <div style="font-size:19px;font-weight:700;color:${ACCENT};">${L.headerTitle}</div>
    <div style="font-size:8.5px;font-weight:600;color:${FAINT};letter-spacing:2px;text-transform:uppercase;margin-bottom:7px;">${L.headerSub}</div>
    <span style="display:inline-flex;align-items:center;gap:5px;padding:4px 13px;border-radius:20px;background:${statusCfg.bg};color:${statusCfg.color};font-size:11px;font-weight:700;">
      <span style="width:6px;height:6px;border-radius:50%;background:${statusCfg.dot};"></span>${statusCfg.label}
    </span>
  </div>
</div>

<div class="no-break" style="display:flex;background:#eef1f4;margin-top:14px;border:1px solid ${LINE_S};">
  <div style="flex:1;padding:9px 12px;border-left:1px solid ${LINE_S};"><span style="font-size:9px;color:${FAINT};display:block;margin-bottom:3px;">${L.sumDocNo}</span><span class="mono" style="font-size:12px;font-weight:700;">${docNumber}</span></div>
  <div style="flex:1;padding:9px 12px;border-left:1px solid ${LINE_S};"><span style="font-size:9px;color:${FAINT};display:block;margin-bottom:3px;">${L.sumDate}</span><span style="font-size:12px;font-weight:600;">${date}</span></div>
  <div style="flex:1;padding:9px 12px;border-left:1px solid ${LINE_S};"><span style="font-size:9px;color:${FAINT};display:block;margin-bottom:3px;">${L.sumType}</span><span style="font-size:12px;font-weight:600;">${L.sumTypeVal}</span></div>
  <div style="flex:1;padding:9px 12px;border-left:1px solid ${LINE_S};"><span style="font-size:9px;color:${FAINT};display:block;margin-bottom:3px;">${L.sumTotalItems}</span><span class="mono" style="font-size:12px;font-weight:700;">${totalItems}</span></div>
  <div style="flex:1;padding:9px 12px;"><span style="font-size:9px;color:${FAINT};display:block;margin-bottom:3px;">${L.sumTotalQty}</span><span class="mono" style="font-size:12px;font-weight:700;">${totalQuantity}</span></div>
</div>

<div class="branch-row no-break" style="display:flex;gap:14px;margin-top:16px;align-items:stretch;">
  <div style="flex:1;border:1px solid ${LINE};border-radius:8px;padding:12px 14px;">
    <div style="font-size:10px;font-weight:600;color:${ACCENT};border-bottom:1.5px solid ${ACCENT};padding-bottom:5px;margin-bottom:7px;">${L.sendingBranch} <span style="font-weight:500;color:${FAINT};font-size:8.5px;">· ${L.sendingSub}</span></div>
    <div style="font-size:15px;font-weight:700;color:${INK};">${escapeHTML(order.from_shop?.shop_name)}</div>
    ${order.from_shop?.phone ? `<div style="font-size:10px;color:${SOFT};margin-top:4px;">${escapeHTML(order.from_shop.phone)}</div>` : ""}
    ${order.from_shop?.address ? `<div style="font-size:10px;color:${SOFT};margin-top:2px;">${escapeHTML(order.from_shop.address)}</div>` : ""}
  </div>
  <div style="display:flex;align-items:center;flex-shrink:0;">
    <div style="width:34px;height:34px;border-radius:50%;background:${ACCENT};display:flex;align-items:center;justify-content:center;">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
    </div>
  </div>
  <div style="flex:1;border:1px solid ${LINE};border-radius:8px;padding:12px 14px;">
    <div style="font-size:10px;font-weight:600;color:${ACCENT};border-bottom:1.5px solid ${ACCENT};padding-bottom:5px;margin-bottom:7px;">${L.receivingBranch} <span style="font-weight:500;color:${FAINT};font-size:8.5px;">· ${L.receivingSub}</span></div>
    <div style="font-size:15px;font-weight:700;color:${INK};">${escapeHTML(order.to_shop?.shop_name)}</div>
    ${order.to_shop?.phone ? `<div style="font-size:10px;color:${SOFT};margin-top:4px;">${escapeHTML(order.to_shop.phone)}</div>` : ""}
    ${order.to_shop?.address ? `<div style="font-size:10px;color:${SOFT};margin-top:2px;">${escapeHTML(order.to_shop.address)}</div>` : ""}
  </div>
</div>

<div class="no-break" style="margin-top:16px;border:1px solid ${LINE};border-radius:8px;overflow:hidden;">
  <div style="background:#eef1f4;padding:9px 16px;border-bottom:1px solid ${LINE_S};"><span style="font-size:12px;font-weight:700;color:${ACCENT};">${L.execTitle}</span></div>
  <div class="exec-grid" style="background:#fff;padding:13px 16px;display:grid;grid-template-columns:repeat(5,1fr);gap:0;">
    ${execCell(String(totalItems), L.execTotalItems, INK, false)}
    ${execCell(String(totalQuantity), L.execTotalQty, INK, true)}
    ${execCell(String(approvedQuantity), L.execApprovedQty, "#16A34A", true)}
    ${execCell(String(remainingQuantity), L.execRemainingQty, remainingQuantity > 0 ? "#B45309" : SOFT, true)}
    ${execCell(completionPct + "%", L.execCompletion, ACCENT, true)}
  </div>
  <div style="background:#fff;padding:0 16px 13px;">
    <div style="background:#eef1f4;border-radius:20px;height:7px;overflow:hidden;">
      <div style="background:${ACCENT};height:100%;width:${completionPct}%;border-radius:20px;"></div>
    </div>
  </div>
</div>

<div style="margin-top:16px;">
  <div class="no-break" style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
    <div style="width:4px;height:18px;background:${ACCENT};border-radius:3px;"></div>
    <div>
      <div style="font-size:13px;font-weight:700;color:${INK};">${L.itemsSectionAr}</div>
      <div style="font-size:8.5px;font-weight:600;color:${FAINT};letter-spacing:1px;text-transform:uppercase;">${L.itemsSectionSub}</div>
    </div>
  </div>
  <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
    <thead class="no-break">
      <tr style="background:${ACCENT};">
        <th style="padding:8px 9px;border:1px solid ${ACCENT};font-size:8.5px;font-weight:600;text-transform:uppercase;color:#fff;text-align:center;width:26px;">#</th>
        <th style="padding:8px 9px;border:1px solid ${ACCENT};font-size:8.5px;font-weight:600;text-transform:uppercase;color:#fff;text-align:center;">${L.colPartName}</th>
        <th style="padding:8px 9px;border:1px solid ${ACCENT};font-size:8.5px;font-weight:600;text-transform:uppercase;color:#fff;text-align:center;width:46px;">${L.colReq}</th>
        ${hasAnyApproved ? `<th style="padding:8px 9px;border:1px solid ${ACCENT};font-size:8.5px;font-weight:600;text-transform:uppercase;color:#fff;text-align:center;width:50px;">${L.colTransferred}</th>` : ""}
        ${hasAnyRemaining ? `<th style="padding:8px 9px;border:1px solid ${ACCENT};font-size:8.5px;font-weight:600;text-transform:uppercase;color:#fff;text-align:center;width:50px;">${L.colRemaining}</th>` : ""}
        <th style="padding:8px 9px;border:1px solid ${ACCENT};font-size:8.5px;font-weight:600;text-transform:uppercase;color:#fff;text-align:left;width:80px;">${L.colUnitPrice}</th>
        <th style="padding:8px 9px;border:1px solid ${ACCENT};font-size:8.5px;font-weight:600;text-transform:uppercase;color:#fff;text-align:left;width:82px;">${L.colTotal}</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="no-break" style="display:flex;gap:0;margin-top:12px;align-items:stretch;">
    ${order.notes ? `<div style="flex:1;border:1px solid ${LINE};border-radius:8px;padding:11px 14px;background:${FILL2};"><div style="font-size:9px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:${FAINT};margin-bottom:5px;">${L.notes}</div><div style="font-size:11px;color:${SOFT};line-height:1.7;">${escapeHTML(order.notes)}</div></div>` : `<div style="flex:1;"></div>`}
    <div style="width:250px;flex-shrink:0;margin-right:${order.notes ? "12px" : "0"};background:${ACCENT};border-radius:8px;padding:14px 18px;display:flex;justify-content:space-between;align-items:center;">
      <span style="font-size:12px;font-weight:600;color:#fff;">${L.grandTotal}</span>
      <span class="mono" style="font-size:20px;font-weight:700;color:#fff;">${subtotal.toLocaleString("en-SA")}<span style="font-size:10px;font-weight:600;color:#cbd5e1;margin-right:4px;">ر.س</span></span>
    </div>
  </div>
</div>

<div class="verify-row" style="display:flex;gap:13px;margin-top:16px;align-items:stretch;">
  <div class="verify-card no-break" style="width:172px;flex-shrink:0;border:1px solid ${LINE};border-radius:10px;overflow:hidden;display:flex;flex-direction:column;">
    <div style="background:${ACCENT};padding:9px 10px;text-align:center;">
      <span style="font-size:10.5px;font-weight:700;color:#fff;display:block;">${L.verifyTitle}</span>
      <span style="font-size:7px;font-weight:500;color:#cbd5e1;display:block;margin-top:1px;">${L.verifySub}</span>
    </div>
    <div style="background:#fff;padding:11px 10px;display:flex;flex-direction:column;align-items:center;flex:1;">
      <div style="background:#fff;border:1px solid ${LINE_S};border-radius:8px;padding:7px;">
        ${qrDataUrl
          ? `<img src="${qrDataUrl}" alt="QR" style="width:104px;height:104px;display:block;"/>`
          : `<div style="width:104px;height:104px;display:flex;align-items:center;justify-content:center;background:${FILL2};"><span style="font-size:8px;color:${FAINT};text-align:center;">${L.scanPrompt}</span></div>`
        }
      </div>
      <span style="display:inline-flex;align-items:center;gap:3px;margin-top:8px;padding:2px 9px;border-radius:20px;background:#DCFCE7;color:#166534;font-size:7.5px;font-weight:700;">${L.verifyBadge}</span>
      <div style="width:100%;margin-top:8px;border-top:1px solid ${LINE_S};padding-top:7px;">
        <div style="display:flex;justify-content:space-between;gap:4px;margin-bottom:5px;">
          <span style="font-size:6.5px;font-weight:700;color:${FAINT};text-transform:uppercase;">${L.verifyStatusLabel}</span>
          <span style="display:inline-flex;align-items:center;gap:2px;padding:1px 7px;border-radius:20px;background:${statusCfg.bg};color:${statusCfg.color};font-size:7px;font-weight:700;"><span style="width:3px;height:3px;border-radius:50%;background:${statusCfg.dot};"></span>${statusCfg.label}</span>
        </div>
        <span class="mono" style="display:block;font-size:6px;color:${SOFT};word-break:break-all;line-height:1.4;text-align:center;">${escapeHTML(displayVerifyUrl)}</span>
      </div>
    </div>
  </div>

  <div class="audit-card" style="flex:1;border:1px solid ${LINE};border-radius:10px;overflow:hidden;display:flex;flex-direction:column;">
    <div class="no-break" style="background:#eef1f4;padding:9px 16px;display:flex;align-items:baseline;gap:8px;border-bottom:1px solid ${LINE_S};">
      <span style="font-size:12px;font-weight:700;color:${ACCENT};">${L.auditTitle}</span>
      <span style="font-size:8px;font-weight:600;color:${FAINT};letter-spacing:.5px;text-transform:uppercase;">${L.auditSub}</span>
    </div>
    <div class="no-break" style="background:#fff;padding:16px 22px 12px;display:flex;align-items:flex-start;">
      ${auditStrip}
    </div>
    <div class="sig-row no-break" style="background:${FILL2};border-top:1px solid ${LINE_S};padding:9px 12px;display:flex;gap:7px;flex:1;align-items:stretch;">
      ${signatureCards}
    </div>
  </div>
</div>

<div class="no-break" style="margin-top:16px;padding-top:12px;border-top:1px solid ${LINE};display:flex;align-items:flex-end;justify-content:space-between;gap:20px;">
  <div style="font-size:9px;color:${FAINT};line-height:1.9;">
    <div style="font-weight:700;color:${ACCENT};font-size:11px;">محور · MIHWAR B2B</div>
    ${L.sysGenerated}<br>
    <span style="color:${SOFT};">${L.footerWebsite}:</span> www.mihwarb2b.com · <span style="color:${SOFT};">${L.footerEmail}:</span> support@mihwarb2b.com<br>
    <span class="mono">${L.footerVersion} 2.0 · ${docNumber} · ${L.footerPrinted}: ${printDate} ${printTime} · ${L.page} 1/1</span>
  </div>
  <div style="text-align:center;flex-shrink:0;">
    <div style="font-size:7.5px;color:${FAINT};margin-bottom:3px;letter-spacing:.5px;text-transform:uppercase;">${L.docBarcodeLabel}</div>
    ${barcodeSvg}
  </div>
</div>

</div></body></html>`;
}
