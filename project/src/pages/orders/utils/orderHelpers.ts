// =============================================================
// src/pages/orders/utils/orderHelpers.ts
// Pure helper functions shared across the orders module.
// No React, no Supabase — safe to unit test in isolation.
// =============================================================

import type { OrderItem } from "../types";

/** Escapes HTML special characters. Falls back to an em-dash for empty values. */
export function escapeHTML(str: string | null | undefined): string {
  if (!str) return "—";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Returns the effective approved qty for an item.
 * Uses the DB value when meaningful (> 0), otherwise falls back to requested qty.
 */
export function effectiveApproved(item: OrderItem): number {
  return (item.approved_quantity != null && item.approved_quantity > 0)
    ? item.approved_quantity
    : item.quantity;
}

/** Remaining (unfulfilled) quantity for a partially-approved item. */
export function remainingQty(item: OrderItem): number {
  const approved = (item.approved_quantity != null && item.approved_quantity > 0) ? item.approved_quantity : 0;
  return Math.max(0, item.quantity - approved);
}

/** True when ALL items are fully approved (approved_quantity >= requested). */
export function isFullyApproved(items: OrderItem[]): boolean {
  if (items.length === 0) return false;
  return items.every(i => {
    const appr = (i.approved_quantity != null && i.approved_quantity > 0) ? i.approved_quantity : 0;
    return appr >= i.quantity;
  });
}

/** True when there are still remaining quantities on a partially-approved order. */
export function hasRemaining(items: OrderItem[]): boolean {
  return items.some(i => remainingQty(i) > 0);
}

/** Clamp a candidate approved qty between 0 and min(requested, stock). */
export function clampApprovedQty(value: number, maxRequested: number, stockQty: number): number {
  return Math.max(0, Math.min(value, maxRequested, stockQty));
}
