// =============================================================
// src/pages/orders/hooks/useOrderDetails.ts
//
// Owns: detailOrder/detailItems state, opening/closing the drawer,
// refreshing items after an approval action, and triggering print.
// Approval-qty map (approvedQtyMap) lives here since it's tightly
// coupled to "which order/items are currently open", and is then
// handed to useOrderApproval for the actual save/approve/reject logic.
//
// approved_quantity alone cannot tell us whether a value is a real
// saved decision or just an untouched default (a deliberate 0 looks
// identical to "never reviewed"). The approval_reviewed column on
// order_items disambiguates this:
//   - approval_reviewed === true  → approved_quantity is a real
//     decision (including a deliberate 0) and must be shown as-is.
//   - approval_reviewed === false → approved_quantity is not a real
//     decision yet; default to min(requested, stock) instead.
//
// Both "Print" and "Download PDF" go through the browser's native
// print engine, which is the ONLY renderer that shapes Arabic text
// correctly (letter joining, word spacing, RTL). Image-based PDF
// libraries such as html2canvas mangle Arabic, so they are NOT used.
// "Download PDF" differs from "Print" only in that it presets the
// Save-as-PDF filename to Transfer-<docNumber>.
// =============================================================

import { useState, useCallback } from "react";
import { supabase } from "../../lib/supabase";
import type { ApprovedQtyMap, Order, OrderItem } from "../types";
import { buildPrintHTML } from "../utils/buildPrintHTML";
import { buildDocumentNumber } from "../utils/buildDocumentNumber";

type UseOrderDetailsArgs = {
  t: (en: string, ar: string) => string;
  lang: "ar" | "en";
  setGlobalError: (msg: string | null) => void;
};

/**
 * Single source of truth for the approved-qty editor default.
 * - Reviewed items (a real prior decision, including a deliberate 0)
 *   keep their saved approved_quantity.
 * - Unreviewed items default to min(requested, stock) rather than
 *   the full requested quantity, so the editor never proposes more
 *   than what's actually in stock.
 */
function defaultApprovedQty(item: OrderItem): number {
  if (item.approval_reviewed && item.approved_quantity != null) {
    return item.approved_quantity;
  }
  const stockQty = item.product?.quantity ?? item.quantity;
  return Math.min(item.quantity, stockQty);
}

/**
 * Pre-render the verification QR as a base64 PNG data URL via
 * Image()+Canvas (avoids CORS and any extra network request inside
 * the opened window). Falls back to null on any failure so print/PDF
 * still works without the QR.
 */
async function renderVerifyQrDataUrl(orderId: number): Promise<string | null> {
  try {
    const verifyUrl = `${window.location.origin}/verify/${orderId}`;
    const qrApiUrl  = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&ecc=H&data=${encodeURIComponent(verifyUrl)}&color=1E3A5F&bgcolor=ffffff&qzone=3&margin=0`;
    return await new Promise<string | null>((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const canvas  = document.createElement("canvas");
          canvas.width  = img.naturalWidth  || 300;
          canvas.height = img.naturalHeight || 300;
          const ctx = canvas.getContext("2d");
          if (!ctx) { resolve(null); return; }
          ctx.drawImage(img, 0, 0);
          resolve(canvas.toDataURL("image/png"));
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      setTimeout(() => resolve(null), 5000);
      img.src = qrApiUrl;
    });
  } catch {
    return null;
  }
}

/**
 * Open the transfer template in a new window and, once its Arabic
 * webfont and QR image have loaded, invoke the browser print dialog.
 * The browser renders Arabic correctly and lets the user pick
 * "Save as PDF". An optional filenameTitle presets the suggested
 * PDF filename (browsers use document.title for that).
 */
function openTransferPrintWindow(
  order: Order,
  items: OrderItem[],
  lang: "ar" | "en",
  qrDataUrl: string | null,
  filenameTitle?: string,
): void {
  const win = window.open("", "_blank");
  if (!win) return;

  win.document.write(buildPrintHTML(order, items, lang, qrDataUrl ?? undefined));
  win.document.close();

  // Preset the Save-as-PDF suggested filename when requested.
  if (filenameTitle) {
    try { win.document.title = filenameTitle; } catch { /* noop */ }
  }

  const triggerPrint = () => {
    win.focus();
    win.print();
  };

  const waitForImagesThenPrint = () => {
    const pending = Array.from(win.document.images).filter((img) => !img.complete);
    if (pending.length === 0) { triggerPrint(); return; }

    let settled = 0;
    let done = false;
    const finish = () => { if (done) return; done = true; triggerPrint(); };

    pending.forEach((img) => {
      const onSettle = () => { settled += 1; if (settled === pending.length) finish(); };
      img.addEventListener("load", onSettle, { once: true });
      img.addEventListener("error", onSettle, { once: true });
    });

    // Safety net: a stalled/failed image must never block printing.
    setTimeout(finish, 2000);
  };

  const waitForFontsThenImagesThenPrint = () => {
    const fontsReady = (win.document as Document & { fonts?: FontFaceSet }).fonts?.ready;
    if (!fontsReady) { waitForImagesThenPrint(); return; }

    let proceeded = false;
    const proceed = () => { if (proceeded) return; proceeded = true; waitForImagesThenPrint(); };
    fontsReady.then(proceed).catch(proceed);

    // Safety net: a slow/blocked webfont must never block printing.
    setTimeout(proceed, 2000);
  };

  if (win.document.readyState === "complete") {
    waitForFontsThenImagesThenPrint();
  } else {
    win.addEventListener("load", waitForFontsThenImagesThenPrint, { once: true });
  }
}

export function useOrderDetails({ t, lang, setGlobalError }: UseOrderDetailsArgs) {
  const [detailOrder, setDetailOrder] = useState<Order | null>(null);
  const [detailItems, setDetailItems] = useState<OrderItem[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showPartialEditor, setShowPartialEditor] = useState(false);
  const [approvedQtyMap, setApprovedQtyMap] = useState<ApprovedQtyMap>({});

  /** Re-fetch order items after an approval action, then sync the approved-qty map. */
  const refreshDetailItems = useCallback(async (orderId: number) => {
    try {
      const { data, error: fetchError } = await supabase
        .from("order_items")
        .select("*, product:products(*)")
        .eq("order_id", orderId);

      if (fetchError) {
        setGlobalError(fetchError.message);
        return;
      }

      const items = (data as OrderItem[]) || [];
      setDetailItems(items);

      const map: ApprovedQtyMap = {};

      items.forEach(i => {
        map[i.id] = defaultApprovedQty(i);
      });

      setApprovedQtyMap(map);
    } catch (e: any) {
      setGlobalError(e?.message ?? "Failed to refresh order items");
    }
  }, [setGlobalError]);

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

      // TEMP DEBUG — remove after diagnosis
      console.log('ITEMS RAW:', JSON.stringify(data?.[0], null, 2));

      if (fetchError) {
        setGlobalError(fetchError.message);
      } else {
        const items = (data as OrderItem[]) || [];

        setDetailItems(items);

        const initMap: ApprovedQtyMap = {};

        items.forEach(i => {
          initMap[i.id] = defaultApprovedQty(i);
        });

        setApprovedQtyMap(initMap);
      }
    } catch (e: any) {
      setGlobalError(
        e?.message ?? t("Failed to load order items", "فشل تحميل بنود الطلب")
      );
    } finally {
      setDetailLoading(false);
    }
  }, [t, setGlobalError]);

  const closeDetail = useCallback(() => {
    setDetailOrder(null);
    setShowPartialEditor(false);
  }, []);

  /**
   * Print: opens the transfer document and fires the browser print
   * dialog. Arabic is rendered natively (correct shaping/spacing).
   */
  const handlePrint = useCallback(async () => {
    if (!detailOrder) return;

    const qrDataUrl = await renderVerifyQrDataUrl(detailOrder.id);

    const itemsWithApproved = detailItems.map(i => ({
      ...i,
      approved_quantity:
        approvedQtyMap[i.id] ??
        i.approved_quantity ??
        null,
    }));

    openTransferPrintWindow(detailOrder, itemsWithApproved, lang, qrDataUrl);
  }, [detailOrder, detailItems, approvedQtyMap, lang]);

  /**
   * Download PDF: identical to Print, but presets the Save-as-PDF
   * filename to Transfer-<docNumber>. The user picks "Save as PDF"
   * as the destination in the dialog. This is the only path that
   * produces a PDF with correctly shaped Arabic — image-based PDF
   * generation (html2canvas) mangles Arabic and is intentionally
   * not used.
   */
  const handleDownloadPdf = useCallback(async () => {
    if (!detailOrder) return;

    const docNumber = buildDocumentNumber(detailOrder.id, detailOrder.request_type);
    const qrDataUrl = await renderVerifyQrDataUrl(detailOrder.id);

    const itemsWithApproved = detailItems.map(i => ({
      ...i,
      approved_quantity:
        approvedQtyMap[i.id] ??
        i.approved_quantity ??
        null,
    }));

    try {
      openTransferPrintWindow(detailOrder, itemsWithApproved, lang, qrDataUrl, `Transfer-${docNumber}`);
    } catch (e: any) {
      setGlobalError(
        e?.message ?? t("Failed to generate PDF", "فشل إنشاء ملف PDF")
      );
    }
  }, [detailOrder, detailItems, approvedQtyMap, lang, t, setGlobalError]);

  /** Clamp a candidate approved qty between 0 and min(requested, stock). */
  const setApprovedQty = useCallback(
    (
      itemId: number,
      value: number,
      maxRequested: number,
      stockQty: number
    ) => {
      const clamped = Math.max(
        0,
        Math.min(value, maxRequested, stockQty)
      );

      setApprovedQtyMap(prev => ({
        ...prev,
        [itemId]: clamped,
      }));
    },
    []
  );

  /** Resets the editor map back to current DB value (or the computed default) and closes editor. */
  const resetEditorToCurrent = useCallback(() => {
    setShowPartialEditor(false);

    const m: ApprovedQtyMap = {};

    detailItems.forEach(i => {
      m[i.id] = defaultApprovedQty(i);
    });

    setApprovedQtyMap(m);
  }, [detailItems]);

  return {
    detailOrder,
    setDetailOrder,
    detailItems,
    setDetailItems,
    detailLoading,
    showPartialEditor,
    setShowPartialEditor,
    approvedQtyMap,
    setApprovedQtyMap,
    openDetail,
    closeDetail,
    handlePrint,
    handleDownloadPdf,
    refreshDetailItems,
    setApprovedQty,
    resetEditorToCurrent,
  };
}
