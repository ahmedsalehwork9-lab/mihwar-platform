// =============================================================
// src/pages/orders/utils/buildPrintHTML.ts
// =============================================================

import type { Order, OrderItem } from "../types";
import { buildPurchaseOrderPrintHTML } from "../print/PurchaseOrderPrint";
import { buildTransferOrderPrintHTML } from "../print/TransferOrderPrint";

export function buildPrintHTML(
  order: Order,
  items: OrderItem[],
  printLang: "ar" | "en" = "ar",
  qrDataUrl?: string,
): string {
  if (order.request_type === "TRANSFER") {
    return buildTransferOrderPrintHTML(order, items, printLang, qrDataUrl);
  }
  return buildPurchaseOrderPrintHTML(order, items, printLang, qrDataUrl);
}
