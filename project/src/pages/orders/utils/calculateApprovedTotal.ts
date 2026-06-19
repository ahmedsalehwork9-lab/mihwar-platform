// =============================================================
// src/pages/orders/utils/calculateApprovedTotal.ts
// Calculates total using approved quantities only.
// If nothing has been approved yet, total = 0.
// =============================================================

import type { OrderItem } from "../types";

export function calculateApprovedTotal(items: OrderItem[]): number {
  return items.reduce((sum, item) => {
    const approvedQty =
      item.approved_quantity != null
        ? item.approved_quantity
        : 0;

    return sum + (item.price * approvedQty);
  }, 0);
}