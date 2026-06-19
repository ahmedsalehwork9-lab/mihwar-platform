// =============================================================
// src/pages/orders/utils/buildPrintHTML.ts
//
// Thin dispatcher: picks the correct print template (Purchase vs
// Transfer) based on the order's request_type. The actual heavy
// HTML templates live in ../print/PurchaseOrderPrint.tsx and
// ../print/TransferOrderPrint.tsx so this file stays tiny.
// =============================================================

import type { Order, OrderItem } from "../types";
import { buildPurchaseOrderPrintHTML } from "../print/PurchaseOrderPrint";
import { buildTransferOrderPrintHTML } from "../print/TransferOrderPrint";

export function buildPrintHTML(order: Order, items: OrderItem[], printLang: "ar" | "en" = "ar"): string {
  if (order.request_type === "TRANSFER") {
    return buildTransferOrderPrintHTML(order, items, printLang);
  }
  return buildPurchaseOrderPrintHTML(order, items, printLang);
}
