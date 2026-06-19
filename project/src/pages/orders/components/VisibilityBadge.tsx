// =============================================================
// src/pages/orders/components/VisibilityBadge.tsx
// =============================================================

import { memo } from "react";
import { Globe, Users, Lock } from "lucide-react";
import { getProcurementScopeLabel } from "../../lib/procurementEngine";
import { SCOPE_META } from "../types";

type VisibilityScope = "public" | "group" | "private" | null | undefined;

const SCOPE_ICONS = {
  public:  Globe,
  group:   Users,
  private: Lock,
} as const;

type VisibilityBadgeProps = {
  scope: VisibilityScope;
  isRTL: boolean;
};

function VisibilityBadgeBase({ scope, isRTL }: VisibilityBadgeProps) {
  const resolved = scope ?? "public";
  const meta     = SCOPE_META[resolved];
  const Icon     = SCOPE_ICONS[resolved];
  const label    = getProcurementScopeLabel(resolved, isRTL ? "ar" : "en");
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold border shrink-0 ${meta.color}`} title={label}>
      <Icon size={9} className="shrink-0" />
      <span className="truncate max-w-[72px]">{label}</span>
    </span>
  );
}

export const VisibilityBadge = memo(VisibilityBadgeBase);
