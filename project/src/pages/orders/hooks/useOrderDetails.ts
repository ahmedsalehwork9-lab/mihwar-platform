// =============================================================
// src/pages/orders/hooks/useOrderDetails.ts
// (unchanged header comments preserved)
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

function defaultApprovedQty(item: OrderItem): number {
  if (item.approval_reviewed && item.approved_quantity != null) {
    return item.approved_quantity;
  }
  const stockQty = item.product?.quantity ?? item.quantity;
  return Math.min(item.quantity, stockQty);
}

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
 * iOS Safari fix: window.open() must be called SYNCHRONOUSLY, inside
 * the original click handler's call stack, with no `await` before it —
 * otherwise Safari treats it as an untrusted popup and blocks it
 * (Chrome/Android tolerate the async gap; Safari does not).
 *
 * So we now open the (blank) window FIRST, before any async work,
 * and only fill in its content once the QR/data is ready. A small
 * neutral loading placeholder is written immediately so the popup
 * doesn't sit as a blank white tab while the QR loads.
 */
function openBlankPrintWindow(t: (en: string, ar: string) => string): Window | null {
  const win = window.open("", "_blank");
  if (!win) return null;

  try {
    win.document.write(
      `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${t("Preparing document…", "جارِ تجهيز المستند…")}</title></head>` +
      `<body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;` +
      `font-family:system-ui,-apple-system,sans-serif;color:#64748B;background:#f1f5f9;">` +
      `<p>${t("Preparing document…", "جارِ تجهيز المستند…")}</p></body></html>`
    );
    win.document.close();
  } catch {
    /* non-fatal: placeholder is cosmetic only, final write() still runs later */
  }

  return win;
}

/**
 * Writes the actual transfer/purchase document into an ALREADY-OPEN
 * window (see openBlankPrintWindow), waits for its Arabic webfont and
 * QR image to finish loading, then triggers window.print().
 * document.write() on an already-loaded document implicitly re-opens
 * it, so this safely replaces the loading placeholder.
 */
function writeIntoPrintWindow(
  win: Window,
  order: Order,
  items: OrderItem[],
  lang: "ar" | "en",
  qrDataUrl: string | null,
  filenameTitle?: string,
): void {
  win.document.write(buildPrintHTML(order, items, lang, qrDataUrl ?? undefined));
  win.document.close();

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

    setTimeout(finish, 2000);
  };

  const waitForFontsThenImagesThenPrint = () => {
    const fontsReady = (win.document as Document & { fonts?: FontFaceSet }).fonts?.ready;
    if (!fontsReady) { waitForImagesThenPrint(); return; }

    let proceeded = false;
    const proceed = () => { if (proceeded) return; proceeded = true; waitForImagesThenPrint(); };
    fontsReady.then(proceed).catch(proceed);

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
      items.forEach(i => { map[i.id] = defaultApprovedQty(i); });
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
        items.forEach(i => { initMap[i.id] = defaultApprovedQty(i); });
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
   * Print: opens the print window SYNCHRONOUSLY (iOS Safari requirement),
   * then fills it in once the QR is ready and fires window.print().
   */
  const handlePrint = useCallback(async () => {
    if (!detailOrder) return;

    const win = openBlankPrintWindow(t);
    if (!win) {
      setGlobalError(
        t(
          "Your browser blocked the print window. Please allow pop-ups for this site and try again.",
          "قام المتصفح بحظر نافذة الطباعة. يرجى السماح بالنوافذ المنبثقة لهذا الموقع والمحاولة مرة أخرى."
        )
      );
      return;
    }

    try {
      const qrDataUrl = await renderVerifyQrDataUrl(detailOrder.id);

      const itemsWithApproved = detailItems.map(i => ({
        ...i,
        approved_quantity: approvedQtyMap[i.id] ?? i.approved_quantity ?? null,
      }));

      writeIntoPrintWindow(win, detailOrder, itemsWithApproved, lang, qrDataUrl);
    } catch (e: any) {
      try { win.close(); } catch { /* noop */ }
      setGlobalError(e?.message ?? t("Failed to prepare print document", "فشل تجهيز مستند الطباعة"));
    }
  }, [detailOrder, detailItems, approvedQtyMap, lang, t, setGlobalError]);

  /**
   * Download PDF: same iOS-safe pattern as handlePrint. On Desktop/
   * Android the user still lands on the native print dialog and
   * chooses "Save as PDF" (unchanged behavior); the window title is
   * preset to Transfer-<docNumber> so that suggested filename is used.
   */
  const handleDownloadPdf = useCallback(async () => {
    if (!detailOrder) return;

    const win = openBlankPrintWindow(t);
    if (!win) {
      setGlobalError(
        t(
          "Your browser blocked the PDF window. Please allow pop-ups for this site and try again.",
          "قام المتصفح بحظر نافذة PDF. يرجى السماح بالنوافذ المنبثقة لهذا الموقع والمحاولة مرة أخرى."
        )
      );
      return;
    }

    try {
      const docNumber = buildDocumentNumber(detailOrder.id, detailOrder.request_type);
      const qrDataUrl = await renderVerifyQrDataUrl(detailOrder.id);

      const itemsWithApproved = detailItems.map(i => ({
        ...i,
        approved_quantity: approvedQtyMap[i.id] ?? i.approved_quantity ?? null,
      }));

      writeIntoPrintWindow(win, detailOrder, itemsWithApproved, lang, qrDataUrl, `Transfer-${docNumber}`);
    } catch (e: any) {
      try { win.close(); } catch { /* noop */ }
      setGlobalError(e?.message ?? t("Failed to generate PDF", "فشل إنشاء ملف PDF"));
    }
  }, [detailOrder, detailItems, approvedQtyMap, lang, t, setGlobalError]);

  const setApprovedQty = useCallback(
    (itemId: number, value: number, maxRequested: number, stockQty: number) => {
      const clamped = Math.max(0, Math.min(value, maxRequested, stockQty));
      setApprovedQtyMap(prev => ({ ...prev, [itemId]: clamped }));
    },
    []
  );

  const resetEditorToCurrent = useCallback(() => {
    setShowPartialEditor(false);
    const m: ApprovedQtyMap = {};
    detailItems.forEach(i => { m[i.id] = defaultApprovedQty(i); });
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