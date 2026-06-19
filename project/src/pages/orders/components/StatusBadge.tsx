// =============================================================
// src/pages/orders/components/StatusBadge.tsx
// =============================================================

import { memo } from "react";
import { STATUS_META, type OrderStatus } from "../types";

type StatusBadgeProps = {
  status: OrderStatus;
  isRTL: boolean;
};

function StatusBadgeBase({ status, isRTL }: StatusBadgeProps) {
  const meta = STATUS_META[status] ?? STATUS_META.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border ${meta.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${meta.dot}`} />
      {meta.label[isRTL ? "ar" : "en"]}
    </span>
  );
}

export const StatusBadge = memo(StatusBadgeBase);
