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
// =============================================================

import { useState, useCallback } from "react";
import { supabase } from "../../lib/supabase";
import type { ApprovedQtyMap, Order, OrderItem } from "../types";
import { buildPrintHTML } from "../utils/buildPrintHTML";

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

  // -----------------------------------------------------------
  // Print-timing fix:
  //
  // Previously `win.print()` was called immediately after
  // `win.document.close()`. This raced against two async resources
  // inside the generated print HTML: the Google Fonts @import and,
  // critically, the QR verification <img>. Chrome would sometimes
  // print before either finished loading, producing two symptoms
  // reported in testing — a blank QR code box, and the page layout
  // intermittently reverting to an unstyled/un-centered state
  // (because the fallback font has different metrics than the
  // webfont, so content reflows once the font *does* arrive, but
  // by then the page was already sent to the printer).
  //
  // Fix, part 1 (images): wait for the print window's `load` event
  // (covers stylesheet application) and then explicitly wait for
  // every <img> in that window to finish loading (covers the QR
  // code specifically — a window `load` event does not reliably
  // guarantee every image decoded from a document.write'd document
  // has finished across browsers). A 2s safety timeout still calls
  // print() even if an image never resolves (e.g. network failure),
  // so a broken QR source can never block printing entirely — it
  // would just print without that one image, the same failure mode
  // as before, but bounded instead of indefinite.
  //
  // Fix, part 2 (webfont — closes a gap the image-only fix above
  // left open): the printed document's @import'd Google Font is a
  // separate network resource that is NOT an <img>, so the image
  // wait above never accounted for it. Testing confirmed the blank
  // QR box was resolved by part 1, but the centering/layout still
  // intermittently reverted — exactly the signature of a race with
  // webfont loading (fallback font has different character metrics,
  // so the page reflows once the real font swaps in; if that swap
  // happens after print() was already called, the printed output
  // reflects the pre-swap layout). `document.fonts.ready` is the
  // correct, purpose-built API for this: it resolves once all fonts
  // requested by the document have finished loading (or failed). It
  // is awaited first, before the image wait, with its own 2s safety
  // timeout for the same reason as the image timeout — a slow/blocked
  // font request must never block printing indefinitely.
  // -----------------------------------------------------------
  const handlePrint = useCallback(async () => {
    if (!detailOrder) return;

    // ── Pre-fetch QR as base64 data URL ──────────────────────────
    // Fetching the QR image in the React app (same origin context,
    // full network stack) is far more reliable than loading it inside
    // a document.write'd print window where script/image loading
    // timing is unpredictable across browsers. The resulting data URL
    // is embedded directly in the HTML string — the print window needs
    // zero additional network requests to display the QR.
    let qrDataUrl: string | null = null;
    try {
      const verifyUrl = `${window.location.origin}/verify/${detailOrder.id}`;
      const qrApiUrl  = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&ecc=H&data=${encodeURIComponent(verifyUrl)}&color=1E3A5F&bgcolor=ffffff&qzone=3&margin=0`;
      const res       = await fetch(qrApiUrl);
      if (res.ok) {
        const blob   = await res.blob();
        qrDataUrl    = await new Promise<string>((resolve, reject) => {
          const reader  = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      }
    } catch {
      // QR pre-fetch failed — print will continue without QR image
      qrDataUrl = null;
    }

    const win = window.open("", "_blank");
    if (!win) return;

    const itemsWithApproved = detailItems.map(i => ({
      ...i,
      approved_quantity:
        approvedQtyMap[i.id] ??
        i.approved_quantity ??
        null,
    }));

    win.document.write(
      buildPrintHTML(detailOrder, itemsWithApproved, lang, qrDataUrl ?? undefined)
    );

    win.document.close();

    const triggerPrint = () => {
      win.focus();
      win.print();
    };

    const waitForImagesThenPrint = () => {
      const images = Array.from(win.document.images);
      const pending = images.filter(img => !img.complete);

      if (pending.length === 0) {
        triggerPrint();
        return;
      }

      let settled = 0;
      let printed = false;
      const finish = () => {
        if (printed) return;
        printed = true;
        triggerPrint();
      };

      pending.forEach(img => {
        const onSettle = () => {
          settled += 1;
          if (settled === pending.length) finish();
        };
        img.addEventListener("load", onSettle, { once: true });
        img.addEventListener("error", onSettle, { once: true });
      });

      // Safety net: never let a stalled/failed image (e.g. network
      // issue loading the QR code) block printing indefinitely.
      setTimeout(finish, 2000);
    };

    const waitForFontsThenImagesThenPrint = () => {
      const fontsReady = (win.document as Document & { fonts?: FontFaceSet }).fonts?.ready;

      if (!fontsReady) {
        // Environment has no FontFaceSet API support — fall back to
        // the image-only wait rather than skipping straight to print.
        waitForImagesThenPrint();
        return;
      }

      let proceeded = false;
      const proceed = () => {
        if (proceeded) return;
        proceeded = true;
        waitForImagesThenPrint();
      };

      fontsReady.then(proceed).catch(proceed);

      // Safety net: a slow/blocked webfont request (e.g. Google
      // Fonts unreachable) must never block printing indefinitely.
      setTimeout(proceed, 2000);
    };

    // QR is now a base64 data URL embedded directly in the HTML —
    // no external requests needed in the print window. Proceed with
    // the original fonts-then-images-then-print sequence directly.
    if (win.document.readyState === "complete") {
      waitForFontsThenImagesThenPrint();
    } else {
      win.addEventListener("load", waitForFontsThenImagesThenPrint, { once: true });
    }
  }, [detailOrder, detailItems, approvedQtyMap, lang]);

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
    refreshDetailItems,
    setApprovedQty,
    resetEditorToCurrent,
  };
}
