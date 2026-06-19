
// src/lib/procurementEngine.ts
 
import {
  ProductVisibilityScope,
  ProductVisibilityContext,
  canViewProductByScope,
  isSameGroup,
} from './visibility';
 
// ─────────────────────────────────────────────────────────────────────────────
// PROCUREMENT ENGINE — ARCHITECTURE OVERVIEW
//
// This engine operates across three distinct modes. Each mode is independent.
// Do NOT conflate them when adding new features.
//
// 1. ORGANIZATION MODE (org-only, no groups configured)
//    ──────────────────────────────────────────────────
//    Applies when: requesterGroupId == null && supplierGroupId == null
//    Transfer allowed: same organization
//    Purchase allowed: different organization
//    Group check:  skipped entirely
//
// 2. GROUP MODE (organization uses organization_groups)
//    ──────────────────────────────────────────────────
//    Applies when: at least one party has a non-null group_id
//    Transfer allowed: same organization AND same group
//    Purchase allowed: different organization (group irrelevant for purchases)
//    Group check:  enforced via isSameGroup()
//
// 3. MARKETPLACE MODE (cross-organization product browsing)
//    ──────────────────────────────────────────────────────
//    Applies when: requester views supplier's public products
//    Visibility rules: governed by ProductVisibilityScope in visibility.ts
//      - public  → visible to everyone in the marketplace
//      - group   → visible only within the same organization/group
//      - private → visible only to the originating shop
//    Purchase eligibility: canPurchaseFromMarketplace() delegates to
//                          canViewProductByScope() — no duplication.
//
// TRANSFER RULES SUMMARY:
//   - Org-only mode:   isSameOrganization() → true
//   - Group mode:      isSameOrganization() && isSameGroup() → both true
//   - Fallback safety: if group IDs absent → org-only mode (never deny valid transfers)
//
// PURCHASE RULES SUMMARY:
//   - Allowed when parties are NOT in the same organization
//   - Gated by visibility scope when visibilityContext is supplied
//
// VISIBILITY RULES:
//   - All scope logic lives in visibility.ts — this file delegates, never duplicates
//   - canRequestProduct() and canPurchaseFromMarketplace() are thin wrappers only
// ─────────────────────────────────────────────────────────────────────────────
 
// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────
 
export type RequestType = 'TRANSFER' | 'PURCHASE';
 
/**
 * Procurement context describing both requester and supplier parties.
 *
 * All fields beyond the two organization IDs are optional to maintain
 * full backward compatibility with existing call sites that only pass
 * `requesterOrganizationId` and `supplierOrganizationId`.
 *
 * Field semantics:
 * - requesterOrganizationId / supplierOrganizationId
 *     Required for all modes. Used by isSameOrganization().
 *
 * - requesterGroupId / supplierGroupId
 *     Optional. When present, enables group-aware transfer validation
 *     (Group Mode). When both are null, falls back to Organization Mode.
 *     See hasGroupConfiguration() for the mode selector logic.
 *
 * - requesterShopId / supplierShopId
 *     Optional. Used for private-scope visibility checks in conjunction
 *     with ProductVisibilityContext. Not used directly by this engine.
 *
 * - productVisibilityScope
 *     Optional. The scope value of the product being requested.
 *     Passed through to ProductVisibilityContext when building
 *     canRequestProduct() calls.
 *
 * - canViewPublicMarketplace
 *     Optional. Future field — Phase 5 preparation.
 *     Controls whether the requester shop can access public marketplace
 *     products (Layer 2 access, separate from product scope).
 *     Currently unused by this engine; reserved for future integration
 *     with ShopsPage.tsx's can_view_public_market column.
 *     When this field is wired up, it should gate canPurchaseFromMarketplace()
 *     for public-scope products only. Group and private scope are unaffected.
 */
export interface ProcurementContext {
  requesterOrganizationId: number | null;
  supplierOrganizationId: number | null;
  // Extended: group-aware fields
  requesterGroupId?: number | null;
  supplierGroupId?: number | null;
  // Extended: shop-level fields
  requesterShopId?: number | null;
  supplierShopId?: number | null;
  // Extended: product visibility
  productVisibilityScope?: ProductVisibilityScope | null;
  // Phase 5: future marketplace access layer
  // Mirrors shops.can_view_public_market from ShopsPage.tsx.
  // null/undefined → treated as true (backward-compatible default).
  canViewPublicMarketplace?: boolean | null;
}
 
/**
 * Full eligibility decision returned by determineProcurementEligibility().
 *
 * canView     — whether the requester can see the product at all
 * canTransfer — whether an internal transfer request may be created
 * canPurchase — whether a marketplace purchase request may be created
 * requestType — 'TRANSFER' | 'PURCHASE' based on org relationship
 */
export interface ProcurementEligibility {
  canView: boolean;
  canTransfer: boolean;
  canPurchase: boolean;
  requestType: RequestType;
}
 
// ─────────────────────────────────────────────────────────────
// EXISTING FUNCTIONS — UNTOUCHED (100% backward compatible)
// ─────────────────────────────────────────────────────────────
 
export function isSameOrganization(
  requesterOrganizationId: number | null,
  supplierOrganizationId: number | null
): boolean {
  if (!requesterOrganizationId || !supplierOrganizationId) {
    return false;
  }
 
  return requesterOrganizationId === supplierOrganizationId;
}
 
export function classifyRequest(
  requesterOrganizationId: number | null,
  supplierOrganizationId: number | null
): RequestType {
  return isSameOrganization(
    requesterOrganizationId,
    supplierOrganizationId
  )
    ? 'TRANSFER'
    : 'PURCHASE';
}
 
export function determineProcurementType(
  context: ProcurementContext
): RequestType {
  return classifyRequest(
    context.requesterOrganizationId,
    context.supplierOrganizationId
  );
}
 
export function canCreateTransfer(
  requesterOrganizationId: number | null,
  supplierOrganizationId: number | null
): boolean {
  return isSameOrganization(
    requesterOrganizationId,
    supplierOrganizationId
  );
}
 
export function canCreatePurchase(
  requesterOrganizationId: number | null,
  supplierOrganizationId: number | null
): boolean {
  return !isSameOrganization(
    requesterOrganizationId,
    supplierOrganizationId
  );
}
 
export function getRequestLabel(
  requestType: RequestType,
  lang: 'ar' | 'en' = 'ar'
): string {
  const labels = {
    ar: {
      TRANSFER: 'تحويل داخلي',
      PURCHASE: 'طلب شراء',
    },
    en: {
      TRANSFER: 'Internal Transfer',
      PURCHASE: 'Purchase Request',
    },
  };
 
  return labels[lang][requestType];
}
 
export function buildNotificationMessage(
  requestType: RequestType,
  requestId: number,
  lang: 'ar' | 'en' = 'ar'
): string {
  if (lang === 'en') {
    return requestType === 'TRANSFER'
      ? `Transfer Request #${requestId}`
      : `Purchase Request #${requestId}`;
  }
 
  return requestType === 'TRANSFER'
    ? `طلب تحويل #${requestId}`
    : `طلب شراء #${requestId}`;
}
 
// ─────────────────────────────────────────────────────────────
// GROUP HELPERS
// ─────────────────────────────────────────────────────────────
 
/**
 * Determines whether the requester and supplier belong to the same
 * organization_group. Delegates to isSameGroup() from visibility.ts.
 *
 * Safe against null — never throws.
 *
 * @param requesterGroupId - group_id of the requester's shop
 * @param supplierGroupId  - group_id of the supplier's shop
 * @returns true if both parties share the same non-null group
 */
export function isSameGroupForProcurement(
  requesterGroupId: number | null | undefined,
  supplierGroupId: number | null | undefined
): boolean {
  try {
    return isSameGroup(requesterGroupId ?? null, supplierGroupId ?? null);
  } catch {
    return false;
  }
}
 
/**
 * Phase 2: Determines whether group-aware mode applies to this procurement.
 *
 * Returns true when at least one party has a non-null group_id, meaning
 * the organization has configured organization_groups and group membership
 * should be enforced during transfer validation.
 *
 * Returns false when BOTH group IDs are null or undefined, meaning the
 * organization operates in org-only mode — group checks are skipped
 * and transfers are gated by organization membership alone.
 *
 * Mode selector:
 *   Both null     → Organization Mode (group checks skipped)
 *   One or both not null → Group Mode (group checks enforced)
 *
 * @param requesterGroupId - group_id of the requester's shop (or null/undefined)
 * @param supplierGroupId  - group_id of the supplier's shop (or null/undefined)
 * @returns true when group-aware mode should be applied
 */
export function hasGroupConfiguration(
  requesterGroupId: number | null | undefined,
  supplierGroupId: number | null | undefined
): boolean {
  return requesterGroupId != null || supplierGroupId != null;
}
 
// ─────────────────────────────────────────────────────────────
// VISIBILITY VALIDATION
// ─────────────────────────────────────────────────────────────
 
/**
 * Determines whether a requester shop can request a specific product
 * based on its visibility_scope.
 *
 * Delegates entirely to canViewProductByScope() from visibility.ts.
 * Does NOT duplicate any visibility logic.
 *
 * @param visibilityContext - full visibility context from visibility.ts
 * @returns true if the product is accessible to the requester
 */
export function canRequestProduct(
  visibilityContext: ProductVisibilityContext
): boolean {
  try {
    return canViewProductByScope(visibilityContext);
  } catch {
    return false;
  }
}
 
// ─────────────────────────────────────────────────────────────
// TRANSFER HELPERS
// ─────────────────────────────────────────────────────────────
 
/**
 * Determines whether an internal transfer is allowed between two shops
 * within the same organization AND the same group.
 *
 * Both conditions must be true:
 * - Same organization (uses isSameOrganization)
 * - Same group (uses isSameGroupForProcurement → isSameGroup)
 *
 * Use canTransferWithinGroupOrOrg() for the smart fallback variant that
 * automatically handles null group IDs (Phase 1 requirement).
 *
 * @param requesterOrganizationId
 * @param supplierOrganizationId
 * @param requesterGroupId
 * @param supplierGroupId
 * @returns true only when both org and group match
 */
export function canTransferWithinGroup(
  requesterOrganizationId: number | null,
  supplierOrganizationId: number | null,
  requesterGroupId: number | null | undefined,
  supplierGroupId: number | null | undefined
): boolean {
  return (
    isSameOrganization(requesterOrganizationId, supplierOrganizationId) &&
    isSameGroupForProcurement(requesterGroupId, supplierGroupId)
  );
}
 
/**
 * Phase 1: Smart transfer eligibility with organization fallback.
 *
 * Handles two cases automatically:
 *
 * Case A — Organization Mode (both group IDs are null/undefined):
 *   The organization has not configured groups.
 *   Transfer is allowed when both shops belong to the same organization.
 *   Group check is skipped entirely.
 *
 * Case B — Group Mode (at least one group ID is present):
 *   The organization uses organization_groups.
 *   Transfer is allowed only when both org AND group match.
 *   This delegates to canTransferWithinGroup().
 *
 * Use this function instead of canTransferWithinGroup() when the caller
 * cannot guarantee that group IDs are populated.
 *
 * @param requesterOrganizationId
 * @param supplierOrganizationId
 * @param requesterGroupId  - null/undefined signals org-only mode
 * @param supplierGroupId   - null/undefined signals org-only mode
 * @returns true when the transfer is permitted under the applicable mode
 */
export function canTransferWithinGroupOrOrg(
  requesterOrganizationId: number | null,
  supplierOrganizationId: number | null,
  requesterGroupId: number | null | undefined,
  supplierGroupId: number | null | undefined
): boolean {
  if (!hasGroupConfiguration(requesterGroupId, supplierGroupId)) {
    // Organization Mode: groups not configured — org membership is sufficient.
    return isSameOrganization(requesterOrganizationId, supplierOrganizationId);
  }
 
  // Group Mode: groups configured — both org and group must match.
  return canTransferWithinGroup(
    requesterOrganizationId,
    supplierOrganizationId,
    requesterGroupId,
    supplierGroupId
  );
}
 
// ─────────────────────────────────────────────────────────────
// MARKETPLACE HELPERS
// ─────────────────────────────────────────────────────────────
 
/**
 * Determines whether a requester can purchase a product from the
 * marketplace based on its visibility_scope:
 *
 * - public  → always allowed
 * - group   → allowed only if visibility engine permits
 * - private → allowed only if visibility engine permits
 *
 * Delegates scope logic to canViewProductByScope() from visibility.ts.
 *
 * @param visibilityContext - full visibility context from visibility.ts
 * @returns true if the product can be purchased from the marketplace
 */
export function canPurchaseFromMarketplace(
  visibilityContext: ProductVisibilityContext
): boolean {
  try {
    return canViewProductByScope(visibilityContext);
  } catch {
    return false;
  }
}
 
// ─────────────────────────────────────────────────────────────
// PROCUREMENT DECISION HELPER
// ─────────────────────────────────────────────────────────────
 
/**
 * Phase 3: Computes a full procurement eligibility decision for a given context.
 *
 * Uses existing functions internally — no duplicated logic.
 * Never throws; all errors produce safe false defaults.
 *
 * Transfer decision logic (hardened):
 *   1. If both group IDs are absent → Organization Mode.
 *      Transfer allowed when same organization (group not required).
 *   2. If any group ID is present → Group Mode.
 *      Transfer allowed only when same organization AND same group.
 *
 * This ensures that organizations without group configuration are NEVER
 * accidentally denied a valid internal transfer due to missing group IDs.
 *
 * @param context           - ProcurementContext (extended fields are optional)
 * @param visibilityContext - optional; required for visibility-gated decisions
 * @returns ProcurementEligibility with canView, canTransfer, canPurchase, requestType
 */
export function determineProcurementEligibility(
  context: ProcurementContext,
  visibilityContext?: ProductVisibilityContext
): ProcurementEligibility {
  try {
    const requestType = determineProcurementType(context);
 
    const canView: boolean = visibilityContext != null
      ? canRequestProduct(visibilityContext)
      : true; // no scope restriction when context is not provided
 
    // Phase 3 hardening: use canTransferWithinGroupOrOrg() instead of the
    // raw hasGroupIds branch. This automatically applies Organization Mode
    // when group IDs are absent, preventing false denials for orgs without groups.
    const canTransfer: boolean =
      canTransferWithinGroupOrOrg(
        context.requesterOrganizationId,
        context.supplierOrganizationId,
        context.requesterGroupId,
        context.supplierGroupId
      ) && canView;
 
    const canPurchase: boolean =
      canCreatePurchase(
        context.requesterOrganizationId,
        context.supplierOrganizationId
      ) && canView;
 
    return { canView, canTransfer, canPurchase, requestType };
  } catch {
    return {
      canView: false,
      canTransfer: false,
      canPurchase: false,
      requestType: 'PURCHASE',
    };
  }
}
 
// ─────────────────────────────────────────────────────────────
// SCOPE LABELS
// ─────────────────────────────────────────────────────────────
 
/**
 * Localized label values for product visibility scopes
 * as displayed in procurement UI contexts.
 *
 * Phase 4: Labels updated to match MIHWAR UI conventions.
 * Arabic:  group → المجموعة فقط, private → مخفي
 * English: private → Hidden
 * Scope values (ProductVisibilityScope) are unchanged.
 */
export type ProcurementScopeLabel =
  | 'السوق العام'
  | 'المجموعة فقط'
  | 'مخفي'
  | 'Public Marketplace'
  | 'Group Only'
  | 'Hidden';
 
/**
 * Returns the localized label for a product visibility scope
 * in a procurement context.
 *
 * Arabic:
 * - public  → السوق العام
 * - group   → المجموعة فقط
 * - private → مخفي
 *
 * English:
 * - public  → Public Marketplace
 * - group   → Group Only
 * - private → Hidden
 *
 * @param scope - ProductVisibilityScope value
 * @param lang  - 'ar' (default) | 'en'
 * @returns localized ProcurementScopeLabel string
 */
export function getProcurementScopeLabel(
  scope: ProductVisibilityScope,
  lang: 'ar' | 'en' = 'ar'
): ProcurementScopeLabel {
  const labels: Record<'ar' | 'en', Record<ProductVisibilityScope, ProcurementScopeLabel>> = {
    ar: {
      public:  'السوق العام',
      group:   'المجموعة فقط',
      private: 'مخفي',
    },
    en: {
      public:  'Public Marketplace',
      group:   'Group Only',
      private: 'Hidden',
    },
  };
 
  return labels[lang][scope];
}