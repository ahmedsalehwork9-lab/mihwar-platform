// =============================================================
// src/pages/orders/utils/buildDocumentNumber.ts
//
// Document Number Architecture
// Current: PO-000001 / TR-000001 (backward-compatible, always produced)
// Future:  BRANCHCODE-PO-000001 when BRANCH_PREFIX is populated.
// Adding branch codes: populate BRANCH_PREFIX and pass branchCode from shop data.
// Existing documents are unaffected — their stored IDs remain valid.
// =============================================================

import type { RequestType } from "../types";

// "riyadh": "RYD", "dammam": "DMM", "cairo": "CAI"
// Uncomment and populate when branch codes are assigned in DB.
export const BRANCH_PREFIX: Record<string, string> = {};

export function buildDocumentNumber(
  orderId: number,
  requestType: RequestType | null | undefined,
  branchCode?: string
): string {
  const typeCode = requestType === "TRANSFER" ? "TR" : "PO";
  const seq      = String(orderId).padStart(6, "0");
  if (branchCode && BRANCH_PREFIX[branchCode]) {
    return `${BRANCH_PREFIX[branchCode]}-${typeCode}-${seq}`;
  }
  return `${typeCode}-${seq}`;
}
