// =============================================================
// src/pages/orders/print/TransferOrderPrint.tsx
//
// Transfer Order print template — orange branch-to-branch theme.
// Exports a plain string builder (not a React component) because
// the output is injected into a raw print window via
// document.write, not rendered through React's reconciler.
//
// B2B Marketplace upgrade (this pass):
//   - Branding upgraded to full B2B marketplace identity:
//     "MIHWAR B2B Marketplace · Auto Parts Trading Network" /
//     "منصة محور للتجارة بين الشركات · شبكة محور لقطع الغيار".
//   - Verification section rebuilt locally (larger card, verified
//     badge, document number + status + verification URL all shown
//     together) because the shared buildTransferVerificationCard()
//     has a fixed smaller layout that can't fit the new fields
//     without changing its signature — which is out of scope.
//     The QR image itself still encodes the REAL verifyUrl via the
//     existing generateVerificationQR() util, so scanning still
//     resolves correctly in every environment; only the *visible
//     printed text* uses a clean production-style placeholder
//     instead of exposing a localhost/dev origin on a B2B document.
//   - New execution summary card: total items, total quantity,
//     approved quantity, remaining quantity, completion percentage.
//   - Stronger sender → receiver visual flow with directional arrow.
//   - New watermark: "MIHWAR B2B" / "TRANSFER ORDER".
//   - Expanded footer: website, email, marketplace branding,
//     document version, print timestamp.
//   - Signature roles updated: Sender Warehouse, Receiver Warehouse,
//     Branch Manager, System Approval (built locally, same pattern
//     as before, so each role renders single-language only).
//   - Fully bilingual-isolated: Arabic mode shows only Arabic,
//     English mode shows only English (brand wordmark "محور" and
//     the ر.س currency unit are not translatable sentences, so they
//     remain as in the original file).
//   - Terminology pass: "Transferred / محوّل" renamed to
//     "Approved / معتمد" across the item-table column header and
//     the order-status badge (both "approved" and "completed"
//     map to this label). This is a label-only change — the
//     underlying status keys, color/dot values, and which items
//     count toward hasAnyApproved/effectiveApproved are untouched.
//   - New audit trail strip ("سجل تتبع المستند" / "Document
//     Audit Trail") placed between the execution summary card and
//     the items table. Purely presentational: built from the same
//     order/items data already in scope (created_at, status,
//     completionPct) — no new fields, no new calculations beyond
//     what execution summary already computes.
//
// Print layout fix (this pass):
//   - Removed the unconditional `.page{page-break-after:always;}`
//     rule. There is exactly one `.page` element in this document;
//     forcing a break-after on it only produced a trailing blank
//     printed page with no content, contributing to the large gap
//     reported between pages.
//   - Replaced the blanket `page-break-inside:avoid` applied to
//     every large card (`.summary-card,.exec-card,.audit-card,
//     .verify-card,.items-wrap`) with avoid-breaks scoped to small,
//     genuinely indivisible elements only (header band, status bar,
//     branch flow row, table rows, total+notes bar, footer band).
//     Forcing "no internal break" on tall multi-section cards left
//     the browser no choice but to push an entire card to the next
//     physical page whenever it didn't fully fit in the remaining
//     space on the current one — visually appearing as a large
//     empty gap at the bottom of a page (exactly what was reported).
//     Letting those taller cards break naturally between their
//     internal blocks (while still protecting individual rows/cells
//     from being split) removes that gap without changing any card's
//     markup, color, or layout.
//   - `.page{max-width:794px}` did not account for the `@page{margin:
//     8mm 10mm}` horizontal margins, so the content box assumed
//     slightly more usable width than the printer actually allocates
//     after margins — clipping the right-most table column (price)
//     at the page edge. Changed to `max-width:100%` (driven by the
//     browser's already-margin-aware print content box) plus an
//     explicit `width:100%` on the items table and `table-layout:
//     fixed` so the fixed-width columns sum correctly within the
//     actually available width instead of overflowing it.
//   These are pure print/layout fixes — no visual styling (colors,
//   fonts, spacing, card design), branding, copy, or business logic
//   changed anywhere else in the file.
//
// Compatibility preserved exactly:
//   - buildTransferOrderPrintHTML(order, items, printLang) signature unchanged.
//   - buildTransferSignatureGrid() is no longer called by this file.
//     Signatures now render as 4 standalone full-width cards in a
//     row below the verification+audit-trail row (matching the
//     reference design), rather than the shared helper's layout.
//   - buildDocumentNumber() / buildVerifyUrl() / generateVerificationQR()
//     called identically — no change to QR generation or verify link.
//   - calculateApprovedTotal() untouched.
//   - effectiveApproved() / remainingQty() (from orderHelpers.ts) are
//     no longer called in this file — see the "Approved/Remaining
//     quantity consistency fix" note above buildItemRows for why.
// =============================================================

import type { Order, OrderItem, OrderStatus } from "../types";
import { escapeHTML } from "../utils/orderHelpers";
import { calculateApprovedTotal } from "../utils/calculateApprovedTotal";
import { buildDocumentNumber } from "../utils/buildDocumentNumber";
import { buildVerifyUrl } from "../utils/generateVerificationQR";

// -----------------------------------------------------------
// Status badge — Pending / Approved / Partially Approved / Cancelled
// Mapped from the underlying OrderStatus without changing that type.
// Label-only rename: "محوّل/Transferred" → "معتمد/Approved".
// -----------------------------------------------------------

type TransferStatusCfg = { label: string; bg: string; color: string; dot: string };

function getTransferStatusCfg(status: OrderStatus, printLang: "ar" | "en"): TransferStatusCfg {
  const map: Record<OrderStatus, { ar: string; en: string; bg: string; color: string; dot: string }> = {
    pending:            { ar: "قيد الانتظار",         en: "Pending",                  bg: "#FEF3C7", color: "#92400E", dot: "#D97706" },
    partially_approved: { ar: "تحويل جزئي",            en: "Partially Approved",       bg: "#FFEDD5", color: "#9A3412", dot: "#EA580C" },
    approved:           { ar: "معتمد",                 en: "Approved",                 bg: "#DCFCE7", color: "#166534", dot: "#16A34A" },
    completed:          { ar: "معتمد",                 en: "Approved",                 bg: "#DCFCE7", color: "#166534", dot: "#16A34A" },
    rejected:           { ar: "ملغى",                  en: "Cancelled",                bg: "#FEE2E2", color: "#991B1B", dot: "#DC2626" },
  };
  const m = map[status] ?? map.pending;
  return { label: printLang === "ar" ? m.ar : m.en, bg: m.bg, color: m.color, dot: m.dot };
}

// -----------------------------------------------------------
// Item rows — Requested / Approved / Remaining columns,
// each shown only when there is meaningful data to display.
//
// dispQty and remaining intentionally compute directly from
// item.approved_quantity ?? 0 (mirroring calculateApprovedTotal's
// logic), rather than going through the imported effectiveApproved
// / remainingQty helpers. Those helpers fall back to item.quantity
// when approved_quantity is null, which previously caused two
// disagreeing numbers on the same printed document: a row could
// show a non-zero "Approved" quantity and line total while the
// grand total (calculateApprovedTotal) silently counted that same
// item as 0 approved. Computing both columns from the same
// approved_quantity ?? 0 baseline keeps every figure on this
// document — row totals, the Remaining column, and the grand
// total — mutually consistent.
//
// This change is scoped to this print document only. The shared
// orderHelpers.ts (effectiveApproved/remainingQty) is left
// untouched, since other parts of the app (e.g. the interactive
// approval drawer) rely on its different "unreviewed defaults to
// requested quantity" semantics for the partial-approval editor.
// -----------------------------------------------------------

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
    return `<tr style="background:${i % 2 === 0 ? "#fff" : "#FFF7ED"}">
      <td style="padding:10px 10px;font-size:11px;color:#92400E;font-weight:700;text-align:center;width:28px;">${i + 1}</td>
      <td style="padding:10px 10px;font-size:12.5px;font-weight:700;color:#7C2D12;">${escapeHTML(item.product?.product_name)}</td>
      <td style="padding:10px 10px;font-family:'JetBrains Mono',monospace;font-size:11px;color:#92400E;">${escapeHTML(item.product?.product_code)}</td>
      <td style="padding:10px 10px;font-size:13px;font-weight:700;color:#7C2D12;text-align:center;">${item.quantity}</td>
      ${hasAnyApproved ? `<td style="padding:10px 10px;font-size:13px;font-weight:800;color:#C2410C;text-align:center;">${dispQty}</td>` : ""}
      ${hasAnyRemaining ? `<td style="padding:10px 10px;font-size:13px;font-weight:700;color:${remaining > 0 ? "#B45309" : "#92400E"};text-align:center;">${remaining}</td>` : ""}
      <td style="padding:10px 10px;font-size:12px;text-align:left;">${item.price.toLocaleString("en-SA")}<span style="font-size:9px;color:#D97706;"> ر.س</span></td>
      <td style="padding:10px 10px;font-size:13px;font-weight:700;color:#7C2D12;text-align:left;">${lineTotal.toLocaleString("en-SA")}<span style="font-size:9px;color:#D97706;"> ر.س</span></td>
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
  // qrUrl removed: QR now generated locally via qrcodejs CDN in the print window
  const hasAnyApproved  = items.some(i => i.approved_quantity != null && i.approved_quantity > 0);
  const hasAnyRemaining = items.some(i => displayRemainingQty(i) > 0);
  const rows            = buildItemRows(items, hasAnyApproved, hasAnyRemaining);
  const statusCfg       = getTransferStatusCfg(order.status, printLang);

  // -----------------------------------------------------------
  // Execution summary figures — total items, total quantity,
  // approved quantity, remaining quantity, completion percentage.
  // Pure calculations layered on existing helpers; nothing here
  // changes how approved/remaining quantities are derived.
  // -----------------------------------------------------------
  const totalItems        = items.length;
  const totalQuantity     = items.reduce((s, i) => s + i.quantity, 0);
  const approvedQuantity  = items.reduce((s, i) => s + (i.approved_quantity != null && i.approved_quantity > 0 ? i.approved_quantity : 0), 0);
  const remainingQuantity = Math.max(0, totalQuantity - approvedQuantity);
  const completionPct     = totalQuantity > 0 ? Math.round((approvedQuantity / totalQuantity) * 100) : 0;

  // -----------------------------------------------------------
  // Audit trail strip — purely presentational timeline built from
  // data already computed above (order.created_at, statusCfg,
  // completionPct). No new fields, no new business logic: this is
  // a different visual arrangement of facts the document already
  // states elsewhere (issue date in the header, status in the
  // status bar, completion % in the execution summary).
  // -----------------------------------------------------------
  const isPartial    = order.status === "partially_approved";
  const isCompleted  = order.status === "approved" || order.status === "completed";
  const isRejected   = order.status === "rejected";

  // -----------------------------------------------------------
  // Display-only verification URL: the QR image and the actual
  // working link always use the real verifyUrl (so scanning never
  // breaks), but a B2B document handed to a partner shouldn't show
  // a dev "localhost" origin in the printed text. This placeholder
  // mirrors the real path shape so it reads as a genuine production
  // link without depending on env-specific window.location values.
  // -----------------------------------------------------------
  const displayVerifyUrl = verifyUrl.includes("localhost") || verifyUrl.includes("127.0.0.1")
    ? `https://mihwarb2b.com/verify/${order.id}`
    : verifyUrl;

  // -----------------------------------------------------------
  // Bilingual label dictionary — fully isolated per language.
  // -----------------------------------------------------------
  const L = printLang === "ar" ? {
    brandLine1: "منصة محور للتجارة بين الشركات", brandLine2: "شبكة محور لقطع الغيار",
    headerTitle: "طلب تحويل", headerSub: "TRANSFER ORDER", headerFlow: "تحويل بين الفروع",
    verifiedDoc: "✓ مستند تحويل موثّق",
    refLabel: "مرجع التحويل",
    sendingBranch: "الفرع المرسل", receivingBranch: "الفرع المستلم", transferLabel: "تحويل",
    summaryTitle: "ملخص التحويل", summarySub: "Transfer Summary",
    sumType: "نوع التحويل", sumTypeVal: "تحويل بين الفروع",
    sumSource: "الفرع المرسل", sumDest: "الفرع المستلم",
    sumDate: "تاريخ التحويل", sumDocNo: "رقم المستند",
    sumTotalItems: "عدد الأصناف", sumTotalQty: "إجمالي الكمية", sumStatus: "الحالة الحالية",
    execTitle: "ملخص التنفيذ", execSub: "Execution Summary",
    execTotalItems: "عدد الأصناف", execTotalQty: "إجمالي الكمية",
    execApprovedQty: "الكمية المعتمدة", execRemainingQty: "الكمية المتبقية", execCompletion: "نسبة الإنجاز",
    auditTitle: "سجل تتبع المستند", auditSub: "Document Audit Trail",
    auditCreated: "تم الإنشاء", auditPartial: "اعتماد جزئي", auditCompleted: "اكتمال الاعتماد", auditCancelled: "إلغاء الطلب",
    auditPending: "قيد الانتظار",
    itemsSectionAr: "الأصناف المحوّلة", itemsSectionSub: "بنود التحويل",
    colPartName: "اسم القطعة", colPartNo: "رقم القطعة", colReq: "المطلوب",
    colTransferred: "المعتمد", colRemaining: "المتبقي", colUnitPrice: "سعر الوحدة", colTotal: "الإجمالي",
    notes: "ملاحظات", grandTotal: "الإجمالي الكلي",
    verifyTitle: "التحقق من المستند", verifySub: "بوابة التحقق الرسمية",
    verifyBadge: "✓ مستند موثّق", verifyDocNoLabel: "رقم المستند", verifyStatusLabel: "حالة المستند",
    verifyUrlLabel: "رابط التحقق", scanPrompt: "امسح رمز الاستجابة السريعة للتحقق من صحة المستند",
    footerDocLabel: "وثيقة تحويل رسمية", footerWebsite: "الموقع الإلكتروني", footerEmail: "البريد الإلكتروني",
    footerVersion: "إصدار المستند", footerPrinted: "وقت الطباعة",
  } : {
    brandLine1: "MIHWAR B2B Marketplace", brandLine2: "Auto Parts Trading Network",
    headerTitle: "Transfer Order", headerSub: "BRANCH TRANSFER", headerFlow: "Branch to Branch",
    verifiedDoc: "✓ Verified Transfer Document",
    refLabel: "Transfer Ref.",
    sendingBranch: "Sending Branch", receivingBranch: "Receiving Branch", transferLabel: "Transfer",
    summaryTitle: "Transfer Summary", summarySub: "ملخص التحويل",
    sumType: "Transfer Type", sumTypeVal: "Branch to Branch",
    sumSource: "Source Branch", sumDest: "Destination Branch",
    sumDate: "Transfer Date", sumDocNo: "Document Number",
    sumTotalItems: "Total Items", sumTotalQty: "Total Quantity", sumStatus: "Current Status",
    execTitle: "Execution Summary", execSub: "ملخص التنفيذ",
    execTotalItems: "Total Items", execTotalQty: "Total Quantity",
    execApprovedQty: "Approved Quantity", execRemainingQty: "Remaining Quantity", execCompletion: "Completion",
    auditTitle: "Document Audit Trail", auditSub: "سجل تتبع المستند",
    auditCreated: "Created", auditPartial: "Partially Approved", auditCompleted: "Approval Completed", auditCancelled: "Order Cancelled",
    auditPending: "Pending",
    itemsSectionAr: "Transferred Items", itemsSectionSub: "Transfer Line Items",
    colPartName: "Part Name", colPartNo: "Part No.", colReq: "Req. Qty",
    colTransferred: "Approved Qty", colRemaining: "Remaining Qty", colUnitPrice: "Unit Price", colTotal: "Total",
    notes: "Notes", grandTotal: "Grand Total",
    verifyTitle: "Document Verification", verifySub: "Official Verification Portal",
    verifyBadge: "✓ Verified Document", verifyDocNoLabel: "Document Number", verifyStatusLabel: "Document Status",
    verifyUrlLabel: "Verification URL", scanPrompt: "Scan the QR code to verify document authenticity",
    footerDocLabel: "Official Transfer Document", footerWebsite: "Website", footerEmail: "Email",
    footerVersion: "Document Version", footerPrinted: "Print Time",
  };

  // -----------------------------------------------------------
  // Audit trail stage config — 3 stages: Created → (Partial) →
  // Completed, or a 2-stage Created → Cancelled path for rejected
  // orders. Built after L so labels can use the dictionary above.
  // Each stage is { label, time, state }, state ∈ "done" | "current" | "upcoming" | "cancelled".
  // -----------------------------------------------------------
  type AuditState = "done" | "current" | "upcoming" | "cancelled";
  type AuditStage  = { icon: string; label: string; time: string; state: AuditState };

  const auditStages: AuditStage[] = isRejected
    ? [
        { icon: "file-plus",   label: L.auditCreated,   time: `${date} · ${issueTime}`, state: "done" },
        { icon: "x",           label: L.auditCancelled, time: `${printDate}`,           state: "cancelled" },
      ]
    : [
        { icon: "file-plus",   label: L.auditCreated,   time: `${date} · ${issueTime}`, state: "done" },
        { icon: "checkbox",    label: L.auditPartial,   time: isPartial || isCompleted ? `${printDate}` : L.auditPending, state: isPartial ? "current" : (isCompleted ? "done" : "upcoming") },
        { icon: "circle-check", label: L.auditCompleted, time: isCompleted ? `${printDate}` : L.auditPending, state: isCompleted ? "current" : "upcoming" },
      ];

  function auditStageColors(state: AuditState): { circleBg: string; circleBorder: string; iconColor: string; textColor: string; timeColor: string } {
    if (state === "done" || state === "current") {
      return { circleBg: "#C2410C", circleBorder: "#C2410C", iconColor: "#fff", textColor: "#7C2D12", timeColor: "#92400E" };
    }
    if (state === "cancelled") {
      return { circleBg: "#FEE2E2", circleBorder: "#DC2626", iconColor: "#991B1B", textColor: "#991B1B", timeColor: "#B91C1C" };
    }
    return { circleBg: "#fff", circleBorder: "#FED7AA", iconColor: "#D97706", textColor: "#B45309", timeColor: "#D97706" };
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
    const opacity = stage.state === "upcoming" ? "0.6" : "1";
    const connector = i < auditStages.length - 1
      ? `<div style="flex:1;height:2px;background:${stage.state === "done" ? "#C2410C" : "#FED7AA"};margin:14px -6px 0;position:relative;"></div>`
      : "";
    return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:5px;position:relative;z-index:1;opacity:${opacity};">
      <div style="width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:${c.circleBg};border:2px ${isDashed ? "dashed" : "solid"} ${c.circleBorder};">
        ${auditIconSvg(stage.icon, c.iconColor)}
      </div>
      <span style="font-size:10.5px;font-weight:700;color:${c.textColor};text-align:center;">${stage.label}</span>
      <span style="font-size:8.5px;color:${c.timeColor};text-align:center;line-height:1.4;">${stage.time}</span>
    </div>${connector}`;
  }).join("");

  // -----------------------------------------------------------
  // Compact mini signature cards — gradient-header card design
  // (matching the reference) scaled down to fit inside the narrow
  // audit-trail card (~280-300px ÷ 4 ≈ 65-70px per card), so the
  // four roles sit in one horizontal row in the leftover space
  // below the audit stages, instead of as a separate full-width
  // row. NAME/SIGNATURE/DATE field labels stay in English in both
  // languages per explicit confirmation — only the role label
  // (header) switches with printLang.
  // -----------------------------------------------------------
  const sigRoles: string[] = printLang === "ar"
    ? ["مستلم المخزن المرسل", "مستلم المخزن المستلم", "مدير الفرع", "اعتماد النظام"]
    : ["Sender Warehouse", "Receiver Warehouse", "Branch Manager", "System Approval"];

  const miniSignatureCards = sigRoles.map(role => `
    <div style="flex:1;border:1px solid #FED7AA;border-radius:6px;overflow:hidden;min-width:0;">
      <div style="background:linear-gradient(135deg,#7C2D12,#C2410C);padding:3px 2px;text-align:center;">
        <span style="font-size:5.5px;font-weight:700;color:#fff;line-height:1.2;display:block;word-break:break-word;">${role}</span>
      </div>
      <div style="background:#fff;padding:4px 3px 5px;display:flex;flex-direction:column;gap:3px;">
        <div>
          <span style="font-size:4.5px;font-weight:700;color:#D97706;letter-spacing:0.2px;">NAME</span>
          <div style="border-bottom:1px solid #FED7AA;height:8px;"></div>
        </div>
        <div>
          <span style="font-size:4.5px;font-weight:700;color:#D97706;letter-spacing:0.2px;">SIGNATURE</span>
          <div style="border-bottom:1px solid #FED7AA;height:8px;"></div>
        </div>
        <div>
          <span style="font-size:4.5px;font-weight:700;color:#D97706;letter-spacing:0.2px;">DATE</span>
          <div style="border-bottom:1px solid #FED7AA;height:8px;"></div>
        </div>
      </div>
    </div>`).join("");

// =============================================================
//   - Chrome RTL print centering — status: NOT YET FULLY RESOLVED.
//     v1 (@page margin) and v2 (body flex + fixed-px .page width)
//     both reduced the symptom but a residual gap was still
//     reported after v2, even with the separate print-timing fix
//     (waiting for fonts/images) already applied — so it isn't a
//     load-timing artifact either. A third approach (.page{position:
//     absolute;left:50%;transform:translateX(-50%)}) was evaluated
//     but deliberately NOT applied here: it pulls .page out of
//     normal flow, which means `body` no longer derives its height
//     from .page's actual content height. Multi-page documents (this
//     one is 2 pages) need the browser's print pagination to see the
//     *real* total content height to decide where to break pages;
//     with absolute positioning that height signal is lost unless
//     faked with an explicit height, and faking it would silently
//     reintroduce the large-blank-page-gap bug this file already
//     fixed once before. Shipping that trade one bug for another
//     was rejected.
//     Reverted to v2's flex-centering approach for this pass (kept
//     in normal flow, page-break math stays correct), and the next
//     diagnostic step needed before another structural change is:
//     confirm whether the residual gap appears in the SAVED PDF file
//     itself (not just Chrome's live print-preview pane, which is
//     known to sometimes render slightly differently from the final
//     output) and whether resetting the browser zoom to exactly 100%
//     before opening print preview changes anything — both are
//     needed to tell a real CSS bug apart from a preview-pane-only
//     rendering quirk.
// =============================================================
  return `<!DOCTYPE html><html lang="${printLang === "ar" ? "ar" : "en"}" dir="${printLang === "ar" ? "rtl" : "ltr"}">
<head><meta charset="UTF-8"><title>${docNumber} — ${L.headerTitle} MIHWAR B2B</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap');
@page{size:A4 portrait;margin:8mm 0;}
*{box-sizing:border-box;margin:0;padding:0;}
html,body{width:100%;}
body{font-family:'IBM Plex Sans Arabic',Tahoma,Arial,sans-serif;font-size:12px;color:#7C2D12;background:#fff;line-height:1.55;-webkit-print-color-adjust:exact;print-color-adjust:exact;display:flex;justify-content:center;padding-left:10mm;padding-right:10mm;}
.wm{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-30deg);font-size:60px;font-weight:800;color:rgba(194,65,12,0.035);white-space:nowrap;pointer-events:none;z-index:0;user-select:none;text-align:center;line-height:1.3;}
.page{width:100%;max-width:744px;flex-shrink:0;position:relative;z-index:1;overflow-x:hidden;}
.no-break{page-break-inside:avoid;}
@media print{
  tr,thead{page-break-inside:avoid;}
  .no-break{page-break-inside:avoid;}
}
@media screen and (max-width:768px){
  body{display:block;}
  .page{max-width:100%;padding:0 6px;}
  .branch-row{flex-direction:column;}
  .branch-row > div{width:100% !important;}
  .summary-grid{grid-template-columns:repeat(2,1fr) !important;}
  .exec-grid{grid-template-columns:repeat(2,1fr) !important;}
  .audit-grid{flex-wrap:wrap !important;}
  .verify-row{flex-direction:column;}
  .verify-card{width:100% !important;}
  table{display:block;overflow-x:auto;white-space:nowrap;}
}
</style>
</head><body>
<div class="wm">MIHWAR B2B<br/>TRANSFER ORDER</div>
<div class="page">

<!-- HEADER — B2B MARKETPLACE BRANDING -->
<div class="no-break" style="background:linear-gradient(135deg,#7C2D12 0%,#C2410C 100%);border-radius:14px 14px 0 0;padding:22px 26px 20px;display:flex;align-items:center;justify-content:space-between;gap:16px;">
  <div style="display:flex;flex-direction:column;gap:5px;">
    <div style="font-weight:800;font-size:34px;color:#fff;line-height:1;letter-spacing:-1px;">محور</div>
    <div style="font-size:9px;font-weight:700;color:#FED7AA;letter-spacing:0.5px;text-transform:uppercase;line-height:1.5;">${L.brandLine1}</div>
    <div style="font-size:9px;font-weight:700;color:#FED7AA;letter-spacing:0.5px;text-transform:uppercase;line-height:1.5;">${L.brandLine2}</div>
    <div style="font-size:9px;color:#FCA5A5;font-weight:600;margin-top:2px;">${L.verifiedDoc}</div>
  </div>
  <div style="text-align:center;flex:1;">
    <div style="font-size:29px;font-weight:800;color:#fff;line-height:1;">${L.headerTitle}</div>
    <div style="font-size:11px;font-weight:700;color:#FED7AA;letter-spacing:3px;text-transform:uppercase;margin-top:5px;">${L.headerSub}</div>
    <div style="display:flex;align-items:center;justify-content:center;gap:8px;margin-top:9px;">
      <span style="display:inline-block;width:26px;height:2px;background:#FED7AA;border-radius:2px;"></span>
      <span style="font-size:8px;color:#FED7AA;letter-spacing:2px;text-transform:uppercase;">${L.headerFlow}</span>
      <span style="display:inline-block;width:26px;height:2px;background:#FED7AA;border-radius:2px;"></span>
    </div>
  </div>
  <div style="background:rgba(0,0,0,0.28);border-radius:12px;padding:13px 19px;min-width:152px;text-align:right;border:1px solid rgba(255,255,255,0.22);">
    <span style="font-size:8px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#FED7AA;display:block;">${L.refLabel}</span>
    <span style="font-family:'JetBrains Mono',monospace;font-size:22px;font-weight:600;color:#fff;display:block;margin-top:4px;">${docNumber}</span>
    <span style="font-size:10px;color:#FED7AA;display:block;margin-top:4px;">${date}</span>
  </div>
</div>

<!-- STATUS BAR -->
<div class="no-break" style="background:#5C1A0B;padding:9px 26px;display:flex;align-items:center;justify-content:space-between;gap:8px;">
  <div style="display:flex;align-items:center;gap:6px;">
    <span style="display:inline-flex;align-items:center;gap:6px;padding:5px 15px 5px 11px;border-radius:20px;background:${statusCfg.bg};color:${statusCfg.color};font-size:11.5px;font-weight:700;">
      <span style="width:7px;height:7px;border-radius:50%;background:${statusCfg.dot};flex-shrink:0;"></span>${statusCfg.label}
    </span>
  </div>
  <div style="font-family:'JetBrains Mono',monospace;font-size:9.5px;color:#FED7AA;">${issueTime} · ${printDate}</div>
</div>

<!-- TRANSFER BRANCH FLOW CARD — stronger sender → receiver visual -->
<div class="branch-row no-break" style="background:#FFF7ED;border:1.5px solid #FED7AA;border-top:none;padding:18px 26px;display:flex;align-items:stretch;justify-content:space-between;gap:0;">
  <div style="flex:1;background:#fff;border:2px solid #C2410C;border-radius:12px 0 0 12px;border-right:none;padding:15px 18px;box-shadow:0 1px 4px rgba(194,65,12,0.06);position:relative;">
    <div style="display:inline-flex;align-items:center;gap:5px;background:#FFEDD5;border-radius:20px;padding:2px 10px;margin-bottom:8px;">
      <span style="width:6px;height:6px;border-radius:50%;background:#EA580C;"></span>
      <span style="font-size:7.5px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#9A3412;">${L.sendingBranch}</span>
    </div>
    <div style="font-size:17px;font-weight:800;color:#7C2D12;">${escapeHTML(order.from_shop?.shop_name)}</div>
    ${order.from_shop?.phone ? `<div style="font-size:10px;color:#92400E;margin-top:5px;">${escapeHTML(order.from_shop.phone)}</div>` : ""}
    ${order.from_shop?.address ? `<div style="font-size:10px;color:#92400E;margin-top:2px;">${escapeHTML(order.from_shop.address)}</div>` : ""}
  </div>
  <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;flex-shrink:0;background:linear-gradient(180deg,#C2410C,#7C2D12);padding:0 16px;position:relative;z-index:2;">
    <div style="background:#fff;border-radius:50%;width:40px;height:40px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.2);">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C2410C" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
    </div>
    <span style="font-size:7.5px;color:#FED7AA;font-weight:800;letter-spacing:1px;text-transform:uppercase;">${L.transferLabel}</span>
  </div>
  <div style="flex:1;background:#fff;border:2px solid #C2410C;border-radius:0 12px 12px 0;border-left:none;padding:15px 18px;box-shadow:0 1px 4px rgba(194,65,12,0.06);">
    <div style="display:inline-flex;align-items:center;gap:5px;background:#DCFCE7;border-radius:20px;padding:2px 10px;margin-bottom:8px;">
      <span style="width:6px;height:6px;border-radius:50%;background:#16A34A;"></span>
      <span style="font-size:7.5px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#166534;">${L.receivingBranch}</span>
    </div>
    <div style="font-size:17px;font-weight:800;color:#7C2D12;">${escapeHTML(order.to_shop?.shop_name)}</div>
    ${order.to_shop?.phone ? `<div style="font-size:10px;color:#92400E;margin-top:5px;">${escapeHTML(order.to_shop.phone)}</div>` : ""}
    ${order.to_shop?.address ? `<div style="font-size:10px;color:#92400E;margin-top:2px;">${escapeHTML(order.to_shop.address)}</div>` : ""}
  </div>
</div>

<!-- TRANSFER SUMMARY CARD -->
<div class="summary-card" style="margin-top:13px;border:1.5px solid #FED7AA;border-radius:12px;overflow:hidden;">
  <div class="no-break" style="background:linear-gradient(90deg,#7C2D12,#C2410C);padding:10px 18px;">
    <span style="font-size:13px;font-weight:700;color:#fff;">${L.summaryTitle}</span>
  </div>
  <div class="summary-grid" style="background:#FFFBF5;padding:14px 18px;display:grid;grid-template-columns:repeat(4,1fr);gap:12px 18px;">
    <div><span style="font-size:8px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#D97706;display:block;margin-bottom:3px;">${L.sumType}</span><span style="font-size:12px;font-weight:700;color:#7C2D12;">${L.sumTypeVal}</span></div>
    <div><span style="font-size:8px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#D97706;display:block;margin-bottom:3px;">${L.sumSource}</span><span style="font-size:12px;font-weight:700;color:#7C2D12;">${escapeHTML(order.from_shop?.shop_name)}</span></div>
    <div><span style="font-size:8px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#D97706;display:block;margin-bottom:3px;">${L.sumDest}</span><span style="font-size:12px;font-weight:700;color:#7C2D12;">${escapeHTML(order.to_shop?.shop_name)}</span></div>
    <div><span style="font-size:8px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#D97706;display:block;margin-bottom:3px;">${L.sumDate}</span><span style="font-size:12px;font-weight:700;color:#7C2D12;">${date}</span></div>
    <div><span style="font-size:8px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#D97706;display:block;margin-bottom:3px;">${L.sumDocNo}</span><span style="font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:700;color:#7C2D12;">${docNumber}</span></div>
    <div><span style="font-size:8px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#D97706;display:block;margin-bottom:3px;">${L.sumTotalItems}</span><span style="font-size:12px;font-weight:700;color:#7C2D12;">${totalItems}</span></div>
    <div><span style="font-size:8px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#D97706;display:block;margin-bottom:3px;">${L.sumTotalQty}</span><span style="font-size:12px;font-weight:700;color:#7C2D12;">${totalQuantity}</span></div>
    <div><span style="font-size:8px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#D97706;display:block;margin-bottom:3px;">${L.sumStatus}</span><span style="display:inline-flex;align-items:center;gap:4px;padding:2px 9px;border-radius:20px;background:${statusCfg.bg};color:${statusCfg.color};font-size:10.5px;font-weight:700;"><span style="width:5px;height:5px;border-radius:50%;background:${statusCfg.dot};"></span>${statusCfg.label}</span></div>
  </div>
</div>

<!-- EXECUTION SUMMARY CARD -->
<div class="exec-card" style="margin-top:11px;border:1.5px solid #FED7AA;border-radius:12px;overflow:hidden;">
  <div class="no-break" style="background:#FFEDD5;padding:10px 18px;display:flex;align-items:baseline;gap:8px;">
    <span style="font-size:13px;font-weight:700;color:#7C2D12;">${L.execTitle}</span>
  </div>
  <div class="exec-grid no-break" style="background:#fff;padding:14px 18px;display:grid;grid-template-columns:repeat(5,1fr);gap:12px 14px;">
    <div style="text-align:center;border-right:1px solid #FED7AA;">
      <span style="font-size:20px;font-weight:800;color:#7C2D12;display:block;">${totalItems}</span>
      <span style="font-size:8px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;color:#D97706;">${L.execTotalItems}</span>
    </div>
    <div style="text-align:center;border-right:1px solid #FED7AA;">
      <span style="font-size:20px;font-weight:800;color:#7C2D12;display:block;">${totalQuantity}</span>
      <span style="font-size:8px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;color:#D97706;">${L.execTotalQty}</span>
    </div>
    <div style="text-align:center;border-right:1px solid #FED7AA;">
      <span style="font-size:20px;font-weight:800;color:#16A34A;display:block;">${approvedQuantity}</span>
      <span style="font-size:8px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;color:#D97706;">${L.execApprovedQty}</span>
    </div>
    <div style="text-align:center;border-right:1px solid #FED7AA;">
      <span style="font-size:20px;font-weight:800;color:${remainingQuantity > 0 ? "#B45309" : "#92400E"};display:block;">${remainingQuantity}</span>
      <span style="font-size:8px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;color:#D97706;">${L.execRemainingQty}</span>
    </div>
    <div style="text-align:center;">
      <span style="font-size:20px;font-weight:800;color:#C2410C;display:block;">${completionPct}%</span>
      <span style="font-size:8px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;color:#D97706;">${L.execCompletion}</span>
    </div>
  </div>
  <div class="no-break" style="background:#fff;padding:0 18px 14px;">
    <div style="background:#FFF7ED;border-radius:20px;height:8px;overflow:hidden;">
      <div style="background:linear-gradient(90deg,#EA580C,#16A34A);height:100%;width:${completionPct}%;border-radius:20px;"></div>
    </div>
  </div>
</div>

<!-- ITEMS TABLE -->
<div class="items-wrap" style="margin-top:14px;">
  <div class="no-break" style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
    <div style="width:4px;height:19px;background:#C2410C;border-radius:3px;"></div>
    <div>
      <div style="font-size:13.5px;font-weight:700;color:#7C2D12;">${L.itemsSectionAr}</div>
      <div style="font-size:9px;font-weight:600;color:#D97706;letter-spacing:1px;text-transform:uppercase;">${L.itemsSectionSub}</div>
    </div>
  </div>
  <div style="border:1.5px solid #FED7AA;border-radius:12px;overflow:hidden;">
    <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
      <thead class="no-break">
        <tr style="background:linear-gradient(90deg,#7C2D12,#C2410C);">
          <th style="padding:10px 10px;font-size:8.5px;font-weight:700;text-transform:uppercase;color:#FED7AA;text-align:center;width:24px;">#</th>
          <th style="padding:10px 10px;font-size:8.5px;font-weight:700;text-transform:uppercase;color:#FED7AA;text-align:right;">${L.colPartName}</th>
          <th style="padding:10px 10px;font-size:8.5px;font-weight:700;text-transform:uppercase;color:#FED7AA;text-align:right;width:88px;">${L.colPartNo}</th>
          <th style="padding:10px 10px;font-size:8.5px;font-weight:700;text-transform:uppercase;color:#FED7AA;text-align:center;width:46px;">${L.colReq}</th>
          ${hasAnyApproved ? `<th style="padding:10px 10px;font-size:8.5px;font-weight:700;text-transform:uppercase;color:#FED7AA;text-align:center;width:50px;">${L.colTransferred}</th>` : ""}
          ${hasAnyRemaining ? `<th style="padding:10px 10px;font-size:8.5px;font-weight:700;text-transform:uppercase;color:#FED7AA;text-align:center;width:50px;">${L.colRemaining}</th>` : ""}
          <th style="padding:10px 10px;font-size:8.5px;font-weight:700;text-transform:uppercase;color:#FED7AA;text-align:left;width:80px;">${L.colUnitPrice}</th>
          <th style="padding:10px 10px;font-size:8.5px;font-weight:700;text-transform:uppercase;color:#FED7AA;text-align:left;width:82px;">${L.colTotal}</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
</div>

<!-- TOTAL + NOTES -->
<div class="no-break" style="display:flex;gap:10px;margin-top:0;border:1.5px solid #FED7AA;border-top:none;border-radius:0 0 12px 12px;overflow:hidden;">
  ${order.notes ? `<div style="flex:1;background:#FFF7ED;border-left:1.5px solid #FED7AA;padding:13px 15px;"><div style="font-size:9px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#B45309;margin-bottom:6px;">${L.notes}</div><div style="font-size:11.5px;color:#78350F;line-height:1.7;">${escapeHTML(order.notes)}</div></div>` : `<div style="flex:1;background:#FFF7ED;"></div>`}
  <div style="background:linear-gradient(135deg,#7C2D12,#C2410C);padding:17px 22px;display:flex;justify-content:space-between;align-items:center;min-width:210px;">
    <span style="font-size:11.5px;font-weight:700;color:#FED7AA;">${L.grandTotal}</span>
    <span style="font-size:23px;font-weight:800;color:#FFF;font-family:'JetBrains Mono',monospace;">${subtotal.toLocaleString("en-SA")}<span style="font-size:11px;font-weight:600;color:#FED7AA;margin-right:4px;">ر.س</span></span>
  </div>
</div>

<!-- VERIFICATION + AUDIT TRAIL -->
<div class="verify-row" style="display:flex;gap:13px;margin-top:18px;align-items:stretch;">

  <!-- Compact verification card: smaller QR, sized to match the audit-trail card's height -->
  <div class="verify-card no-break" style="width:168px;flex-shrink:0;border:1.5px solid #FED7AA;border-radius:14px;overflow:hidden;box-shadow:0 2px 8px rgba(194,65,12,0.08);display:flex;flex-direction:column;">
    <div style="background:linear-gradient(135deg,#7C2D12,#C2410C);padding:9px 10px;text-align:center;">
      <span style="font-size:10.5px;font-weight:700;color:#fff;display:block;">${L.verifyTitle}</span>
      <span style="font-size:7px;font-weight:500;color:#FED7AA;display:block;margin-top:1px;">${L.verifySub}</span>
    </div>
    <div style="background:#FFF7ED;padding:11px 10px;display:flex;flex-direction:column;align-items:center;flex:1;">
      <div style="background:#fff;border:2px solid #FED7AA;border-radius:10px;padding:7px;">
        ${qrDataUrl
          ? `<img src="${qrDataUrl}" alt="QR Code" style="width:108px;height:108px;display:block;"/>`
          : `<div style="width:108px;height:108px;display:flex;align-items:center;justify-content:center;background:#FFF7ED;"><span style="font-size:8px;color:#D97706;text-align:center;">امسح الرابط<br/>للتحقق</span></div>`
        }
      </div>
      <span style="display:inline-flex;align-items:center;gap:3px;margin-top:7px;padding:2px 8px;border-radius:20px;background:#DCFCE7;color:#166534;font-size:7.5px;font-weight:700;">${L.verifyBadge}</span>
      <div style="width:100%;margin-top:8px;border-top:1px solid #FED7AA;padding-top:7px;">
        <div style="display:flex;justify-content:space-between;gap:4px;margin-bottom:4px;">
          <span style="font-size:6.5px;font-weight:700;color:#D97706;text-transform:uppercase;letter-spacing:0.2px;">${L.verifyDocNoLabel}</span>
          <span style="font-family:'JetBrains Mono',monospace;font-size:7.5px;font-weight:700;color:#7C2D12;">${docNumber}</span>
        </div>
        <div style="display:flex;justify-content:space-between;gap:4px;align-items:center;margin-bottom:5px;">
          <span style="font-size:6.5px;font-weight:700;color:#D97706;text-transform:uppercase;letter-spacing:0.2px;">${L.verifyStatusLabel}</span>
          <span style="display:inline-flex;align-items:center;gap:2px;padding:1px 6px;border-radius:20px;background:${statusCfg.bg};color:${statusCfg.color};font-size:7px;font-weight:700;"><span style="width:3px;height:3px;border-radius:50%;background:${statusCfg.dot};"></span>${statusCfg.label}</span>
        </div>
        <span style="display:block;font-family:'JetBrains Mono',monospace;font-size:6px;color:#92400E;word-break:break-all;line-height:1.4;text-align:center;">${escapeHTML(displayVerifyUrl)}</span>
      </div>
    </div>
  </div>

  <!-- Document audit trail — sits alongside the compact verification card.
       Mini signature cards are nested inside this same card (below the
       audit stages + doc number line) to absorb the leftover vertical
       space created by align-items:stretch matching the QR card's height,
       instead of leaving that space blank. -->
  <div class="audit-card" style="flex:1;border:1.5px solid #FED7AA;border-radius:14px;overflow:hidden;display:flex;flex-direction:column;">
    <div class="no-break" style="background:#FFF7ED;padding:10px 18px;display:flex;align-items:baseline;gap:8px;">
      <span style="font-size:13px;font-weight:700;color:#7C2D12;">${L.auditTitle}</span>
      <span style="font-size:8.5px;font-weight:600;color:#D97706;letter-spacing:0.5px;text-transform:uppercase;">${L.auditSub}</span>
    </div>
    <div class="audit-grid no-break" style="background:#fff;padding:16px 22px 10px;display:flex;align-items:flex-start;">
      ${auditStrip}
    </div>
    <div class="no-break" style="background:#fff;padding:0 18px 8px;display:flex;justify-content:space-between;align-items:center;border-top:1px dashed #FED7AA;margin:0 18px;padding-top:7px;">
      <span style="font-size:8px;color:#D97706;">${L.sumDocNo}: ${docNumber}</span>
    </div>
    <div class="mini-sig-strip no-break" style="background:#FFFBF5;border-top:1.5px solid #FED7AA;padding:7px 10px;display:flex;gap:4px;flex:1;align-items:stretch;">
      ${miniSignatureCards}
    </div>
  </div>
</div>

<!-- FOOTER — B2B MARKETPLACE -->
<div class="no-break" style="margin-top:11px;background:linear-gradient(135deg,#7C2D12,#C2410C);border-radius:0 0 14px 14px;border-top:3px solid #F97316;padding:15px 26px;text-align:center;">
  <div style="font-weight:800;font-size:18px;color:#fff;letter-spacing:0.5px;">محور · MIHWAR B2B</div>
  <div style="font-size:9px;color:#FED7AA;letter-spacing:1.5px;text-transform:uppercase;margin-top:3px;">${L.footerDocLabel}</div>
  <div style="display:flex;align-items:center;justify-content:center;gap:14px;flex-wrap:wrap;margin-top:8px;">
    <span style="font-size:8.5px;color:#FED7AA;"><strong style="color:#FBBF24;">${L.footerWebsite}:</strong> www.mihwarb2b.com</span>
    <span style="font-size:8.5px;color:#FED7AA;"><strong style="color:#FBBF24;">${L.footerEmail}:</strong> support@mihwarb2b.com</span>
  </div>
  <div style="font-size:8px;color:#FBBF24;margin-top:6px;">${L.brandLine1} · ${L.brandLine2}</div>
  <div style="font-family:'JetBrains Mono',monospace;font-size:7.5px;color:#FED7AA;margin-top:7px;">
    ${L.footerVersion} 2.0 · ${docNumber} · ${L.footerPrinted}: ${printDate} ${printTime}
  </div>
</div>

</div></body></html>`;
}
