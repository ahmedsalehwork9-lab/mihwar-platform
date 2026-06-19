// src/lib/visibility.ts
 
// ─────────────────────────────────────────────────────────────────────────────
// DEVELOPER NOTICE — THREE SEPARATE VISIBILITY SYSTEMS
//
// This file contains three distinct visibility models. Do NOT conflate them.
//
// 1. LEGACY MARKETPLACE VISIBILITY  (VisibilityType: 'PUBLIC' | 'PRIVATE')
//    ─────────────────────────────────────────────────────────────────────
//    Stored on:   organizations.visibility  /  shops.visibility
//    Values:      'PUBLIC' | 'PRIVATE'  (uppercase)
//    Purpose:     Controls whether an organization or shop appears in the
//                 public marketplace listing.
//    Used by:     isMarketplacePublic(), getMarketplaceStatus(),
//                 getMarketplaceLabel(), canViewMarketplaceProduct(),
//                 isProductVisible(), getProductSource(),
//                 canShopAppearInMarketplace(),
//                 canOrganizationAppearInMarketplace()
//
// 2. NEW PRODUCT VISIBILITY SCOPE  (ProductVisibilityScope: 'public' | 'group' | 'private')
//    ───────────────────────────────────────────────────────────────────────────────────────
//    Stored on:   products.visibility_scope
//    Values:      'public' | 'group' | 'private'  (lowercase)
//    DB default:  'public'
//    Purpose:     Controls which audience can see an individual product.
//    Used by:     canViewProductByScope(), getVisibilityScopeLabel(),
//                 filterVisibleProducts(), isSameGroup(), isSameShop()
//
//    Scope meanings:
//      'public'  → visible to everyone in the marketplace
//      'group'   → visible only to shops within the same organization group
//      'private' → visible only to the exact same shop (internal only)
//
// 3. SHOP MARKETPLACE ACCESS  (MarketplaceAccessMode: 'enabled' | 'disabled')
//    ─────────────────────────────────────────────────────────────────────────
//    Stored on:   shops.marketplace_access (or derived from shop settings)
//    Values:      'enabled' | 'disabled'  (lowercase)
//    Purpose:     Controls whether a shop can SEE public marketplace products.
//                 This is requester-side access visibility — NOT product
//                 visibility and NOT organization visibility.
//    Used by:     canViewPublicMarketplace(), canViewMarketplaceProductByAccess(),
//                 getMarketplaceAccessLabel(), getMarketplaceAccessColor(),
//                 filterMarketplaceProductsByAccess()
//
// When editing this file, keep all three systems fully separate and independent.
// ─────────────────────────────────────────────────────────────────────────────
 
// ─────────────────────────────────────────────
// Legacy Types (unchanged)
// ─────────────────────────────────────────────
 
export type VisibilityType = 'PUBLIC' | 'PRIVATE';
 
export interface VisibilityContext {
  organizationVisibility: VisibilityType | null;
  shopVisibility: VisibilityType | null;
  sameOrganization?: boolean;
}
 
// ─────────────────────────────────────────────
// New Product Visibility Scope Types
// ─────────────────────────────────────────────
 
/**
 * Represents the visibility scope of a product,
 * mapped to the `products.visibility_scope` column.
 *
 * Database default: `'public'`
 *
 * - `public`  → visible to everyone in the marketplace
 * - `group`   → visible only to shops within the same organization group
 * - `private` → visible only to the originating shop (internal transfer only)
 */
export type ProductVisibilityScope = 'public' | 'group' | 'private';
 
/**
 * Context object passed to scope-based visibility functions.
 *
 * Provides all identifiers needed to evaluate whether a requester
 * is permitted to view a product under the new `products.visibility_scope` model.
 *
 * Fields:
 * - `requesterShopId`        — The shop ID of the party requesting access.
 * - `supplierShopId`         — The shop ID of the product's owner/supplier.
 * - `requesterGroupId`       — The `organization_groups` group ID of the requester's shop.
 * - `supplierGroupId`        — The `organization_groups` group ID of the supplier's shop.
 * - `visibilityScope`        — The product's `visibility_scope` value; `null`/`undefined` falls back to `'public'`.
 * - `requesterOrganizationId`— (Optional) The organization ID of the requester.
 *                              Used to harden group-scope checks when available.
 * - `supplierOrganizationId` — (Optional) The organization ID of the supplier.
 *                              Used to harden group-scope checks when available.
 *
 * All IDs are optional/nullable — the function will never throw on missing values.
 */
export interface ProductVisibilityContext {
  requesterShopId: number | null;
  supplierShopId: number | null;
  requesterGroupId: number | null;
  supplierGroupId: number | null;
  visibilityScope: ProductVisibilityScope | null | undefined;
  requesterOrganizationId?: number | null;
  supplierOrganizationId?: number | null;
}
 
// ─────────────────────────────────────────────
// Shop Marketplace Access Types (new — system 3)
// ─────────────────────────────────────────────
 
/**
 * Controls whether a shop can see public marketplace products.
 *
 * This is requester-side access visibility. It is entirely independent of:
 * - `VisibilityType`         (system 1 — organization/shop marketplace listing)
 * - `ProductVisibilityScope` (system 2 — per-product audience rules)
 *
 * - `'enabled'`  → the shop has access to view public marketplace products
 * - `'disabled'` → the shop is restricted to its own group; public products are hidden
 */
export type MarketplaceAccessMode = 'enabled' | 'disabled';
 
/**
 * Context object used by shop marketplace access functions.
 *
 * `canViewPublicMarketplace` mirrors the shop-level access flag.
 * `null` and `undefined` are treated as `false` (access denied) for security.
 */
export interface MarketplaceAccessContext {
  canViewPublicMarketplace: boolean | null | undefined;
}
 
// ─────────────────────────────────────────────
// Legacy Functions (unchanged — do NOT modify)
// ─────────────────────────────────────────────
 
export function isMarketplacePublic(
  organizationVisibility: VisibilityType | null,
  shopVisibility: VisibilityType | null
): boolean {
  return (
    organizationVisibility === 'PUBLIC' &&
    shopVisibility === 'PUBLIC'
  );
}
 
export function getMarketplaceStatus(
  organizationVisibility: VisibilityType | null,
  shopVisibility: VisibilityType | null
): 'PUBLIC' | 'PRIVATE' {
  return isMarketplacePublic(
    organizationVisibility,
    shopVisibility
  )
    ? 'PUBLIC'
    : 'PRIVATE';
}
 
export function getMarketplaceLabel(
  organizationVisibility: VisibilityType | null,
  shopVisibility: VisibilityType | null,
  lang: 'ar' | 'en' = 'ar'
): string {
  const isPublic = isMarketplacePublic(
    organizationVisibility,
    shopVisibility
  );
 
  if (lang === 'en') {
    return isPublic
      ? 'Public Marketplace'
      : 'Internal Only';
  }
 
  return isPublic
    ? 'السوق العام'
    : 'داخل المجموعة';
}
 
export function canViewMarketplaceProduct(
  organizationVisibility: VisibilityType | null,
  shopVisibility: VisibilityType | null
): boolean {
  return isMarketplacePublic(
    organizationVisibility,
    shopVisibility
  );
}
 
export function isProductVisible(
  requesterOrganizationId: number | null,
  supplierOrganizationId: number | null,
  organizationVisibility: VisibilityType | null,
  shopVisibility: VisibilityType | null
): boolean {
  // نفس المؤسسة
  if (
    requesterOrganizationId &&
    supplierOrganizationId &&
    requesterOrganizationId === supplierOrganizationId
  ) {
    return true;
  }
 
  // السوق العام
  return canViewMarketplaceProduct(
    organizationVisibility,
    shopVisibility
  );
}
 
export function getProductSource(
  requesterOrganizationId: number | null,
  supplierOrganizationId: number | null,
  organizationVisibility: VisibilityType | null,
  shopVisibility: VisibilityType | null,
  lang: 'ar' | 'en' = 'ar'
): string {
  const sameOrganization =
    requesterOrganizationId &&
    supplierOrganizationId &&
    requesterOrganizationId === supplierOrganizationId;
 
  if (lang === 'en') {
    return sameOrganization
      ? 'Internal Transfer'
      : 'Marketplace';
  }
 
  return sameOrganization
    ? 'داخل المجموعة'
    : getMarketplaceLabel(
        organizationVisibility,
        shopVisibility,
        lang
      );
}
 
export function canShopAppearInMarketplace(
  organizationVisibility: VisibilityType | null,
  shopVisibility: VisibilityType | null
): boolean {
  return isMarketplacePublic(
    organizationVisibility,
    shopVisibility
  );
}
 
export function canOrganizationAppearInMarketplace(
  organizationVisibility: VisibilityType | null
): boolean {
  return organizationVisibility === 'PUBLIC';
}
 
// ─────────────────────────────────────────────
// New Scope-Based Helpers
// ─────────────────────────────────────────────
 
/**
 * Determines whether two shops belong to the same organization group.
 *
 * Safe against `null` and `undefined` — returns `false` instead of throwing
 * when either group ID is absent.
 *
 * @param requesterGroupId - The `organization_groups` group ID of the requesting shop.
 * @param supplierGroupId  - The `organization_groups` group ID of the supplying shop.
 * @returns `true` if both IDs are present and equal; `false` otherwise.
 */
export function isSameGroup(
  requesterGroupId: number | null | undefined,
  supplierGroupId: number | null | undefined
): boolean {
  if (requesterGroupId == null || supplierGroupId == null) {
    return false;
  }
  return requesterGroupId === supplierGroupId;
}
 
/**
 * Determines whether the requester and supplier are the same shop.
 *
 * Safe against `null` and `undefined` — returns `false` instead of throwing
 * when either shop ID is absent.
 *
 * @param requesterShopId - The shop ID of the requester.
 * @param supplierShopId  - The shop ID of the supplier.
 * @returns `true` if both IDs are present and equal; `false` otherwise.
 */
export function isSameShop(
  requesterShopId: number | null | undefined,
  supplierShopId: number | null | undefined
): boolean {
  if (requesterShopId == null || supplierShopId == null) {
    return false;
  }
  return requesterShopId === supplierShopId;
}
 
/**
 * Evaluates whether a requester can view a product based on its
 * `visibility_scope` value (from `products.visibility_scope`).
 *
 * Scope rules:
 * - `'public'`          → visible to everyone; always returns `true`.
 * - `'group'`           → visible only when requester and supplier share the
 *                         same group. If organization IDs are supplied in the
 *                         context, they must also match (hardened check).
 *                         Falls back to group-only comparison when org IDs
 *                         are absent, preserving backward compatibility.
 * - `'private'`         → visible only when requester and supplier are the
 *                         exact same shop.
 * - `null` / `undefined`→ treated as `'public'` (mirrors DB default).
 *
 * This function never throws. All `null`/`undefined` inputs are handled
 * defensively throughout.
 *
 * @param context - A {@link ProductVisibilityContext} object containing shop
 *                  IDs, group IDs, optional organization IDs, and the
 *                  product's visibility scope.
 * @returns `true` if the requester is permitted to view the product; `false` otherwise.
 */
export function canViewProductByScope(
  context: ProductVisibilityContext
): boolean {
  const {
    requesterShopId,
    supplierShopId,
    requesterGroupId,
    supplierGroupId,
    visibilityScope,
    requesterOrganizationId,
    supplierOrganizationId,
  } = context;
 
  // null/undefined scope mirrors the database default of 'public'.
  const scope: ProductVisibilityScope = visibilityScope ?? 'public';
 
  switch (scope) {
    case 'public':
      return true;
 
    case 'group': {
      // Primary check: organization_id is the source of truth in the current
      // data model. When both sides have an organization_id, same-org membership
      // is sufficient — group_id is legacy and often null, so we do NOT require
      // sameGroup when org IDs are present.
      if (
        requesterOrganizationId != null &&
        supplierOrganizationId != null
      ) {
        return requesterOrganizationId === supplierOrganizationId;
      }
 
      // Backward-compatible fallback: org IDs unavailable (legacy installations)
      // → fall back to group_id comparison only.
      return isSameGroup(requesterGroupId, supplierGroupId);
    }
 
    case 'private':
      return isSameShop(requesterShopId, supplierShopId);
 
    default: {
      // Exhaustive guard: TypeScript will surface a compile error here if a
      // new value is ever added to ProductVisibilityScope without a handler.
      const _exhaustive: never = scope;
      void _exhaustive;
      return false;
    }
  }
}
 
/**
 * Returns a human-readable label for a given `ProductVisibilityScope`,
 * in either Arabic (default) or English.
 *
 * `null` and `undefined` fall back to `'public'` — matching the database
 * column default of `products.visibility_scope = 'public'`.
 *
 * Arabic labels:
 * - `'public'`           → السوق العام
 * - `'group'`            → داخل المجموعة
 * - `'private'`          → داخل الفرع
 * - `null` / `undefined` → السوق العام  (fallback to public)
 *
 * English labels:
 * - `'public'`           → Public Marketplace
 * - `'group'`            → Group Only
 * - `'private'`          → Shop Only
 * - `null` / `undefined` → Public Marketplace  (fallback to public)
 *
 * @param scope - The product's visibility scope, or `null`/`undefined`.
 * @param lang  - Display language: `'ar'` (default) or `'en'`.
 * @returns A localized, non-empty label string.
 */
export function getVisibilityScopeLabel(
  scope: ProductVisibilityScope | null | undefined,
  lang: 'ar' | 'en' = 'ar'
): string {
  // null/undefined mirrors the DB default → treat as 'public'.
  const resolvedScope: ProductVisibilityScope = scope ?? 'public';
 
  if (lang === 'en') {
    switch (resolvedScope) {
      case 'public':  return 'Public Marketplace';
      case 'group':   return 'Group Only';
      case 'private': return 'Shop Only';
      default: {
        const _exhaustive: never = resolvedScope;
        void _exhaustive;
        return 'Public Marketplace';
      }
    }
  }
 
  switch (resolvedScope) {
    case 'public':  return 'السوق العام';
    case 'group':   return 'داخل المجموعة';
    case 'private': return 'داخل الفرع';
    default: {
      const _exhaustive: never = resolvedScope;
      void _exhaustive;
      return 'السوق العام';
    }
  }
}
 
/**
 * Filters an array of products to only those visible to the requester,
 * based on a per-product visibility context predicate.
 *
 * This is a pure, generic utility — it has no knowledge of your product
 * shape. You supply a function that extracts a `ProductVisibilityContext`
 * from each item; `filterVisibleProducts` applies `canViewProductByScope`
 * and returns only the items that pass.
 *
 * Designed for use in:
 * - Marketplace search results
 * - Order line-item filtering
 * - Procurement catalog views
 *
 * Never throws. Items that cause errors in `getContext` are excluded
 * defensively rather than crashing the caller.
 *
 * @param products   - The full list of product items to filter.
 * @param getContext - A function that, given a single product item, returns
 *                     the {@link ProductVisibilityContext} needed to evaluate
 *                     its visibility. Return `null` to unconditionally exclude
 *                     an item (e.g. when required IDs cannot be resolved).
 * @returns A new array containing only the items the requester may view.
 *          The original array is never mutated.
 *
 * @example
 * ```ts
 * const visible = filterVisibleProducts(allProducts, (product) => ({
 *   requesterShopId: currentShop.id,
 *   supplierShopId: product.shopId,
 *   requesterGroupId: currentShop.groupId,
 *   supplierGroupId: product.shop.groupId,
 *   visibilityScope: product.visibilityScope,
 *   requesterOrganizationId: currentShop.organizationId,
 *   supplierOrganizationId: product.shop.organizationId,
 * }));
 * ```
 */
export function filterVisibleProducts<T>(
  products: T[],
  getContext: (item: T) => ProductVisibilityContext | null
): T[] {
  return products.filter((item) => {
    try {
      const context = getContext(item);
      if (context === null) {
        return false;
      }
      return canViewProductByScope(context);
    } catch (error) {
      if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
        console.error(
          '[visibility] filterVisibleProducts failed',
          error
        );
      }
 
      return false;
    }
  });
}
 
// ─────────────────────────────────────────────
// Shop Marketplace Access Helpers (new — system 3)
// ─────────────────────────────────────────────
 
/**
 * Determines whether a shop has access to view public marketplace products.
 *
 * This evaluates the requester-side access flag — it is independent of both
 * the legacy marketplace visibility (system 1) and product visibility scope
 * (system 2). It answers the question: "Can this shop see the public
 * marketplace at all?" rather than "Is this product visible to the public?"
 *
 * Security contract: `null` and `undefined` always resolve to `false`.
 * Access is never granted implicitly.
 *
 * @param context - A {@link MarketplaceAccessContext} containing the shop's
 *                  access flag.
 * @returns `true` only when `canViewPublicMarketplace` is strictly `true`;
 *          `false` for `null`, `undefined`, and `false`.
 */
export function canViewPublicMarketplace(
  context: MarketplaceAccessContext
): boolean {
  return context.canViewPublicMarketplace === true;
}
 
/**
 * Evaluates whether a requester can view a specific marketplace product,
 * combining the shop's marketplace access mode (system 3) with the
 * product's visibility scope (system 2).
 *
 * Rules by scope:
 * - `'public'`          → requires `canViewPublicMarketplace === true`.
 *                         Public products are hidden when marketplace access
 *                         is disabled, regardless of any other condition.
 * - `'group'`           → always permitted when group rules pass; marketplace
 *                         access mode does NOT restrict group-scoped products.
 * - `'private'`         → always permitted when the requester is the same
 *                         shop; marketplace access mode does NOT restrict
 *                         private (own-shop) products.
 * - `null` / `undefined`→ treated as `'public'` (mirrors DB default), and
 *                         therefore subject to the `canViewPublicMarketplace`
 *                         gate.
 *
 * This function never throws. All nullable inputs are handled defensively.
 *
 * @param shopAccessContext  - The shop's {@link MarketplaceAccessContext}.
 * @param visibilityScope    - The product's `visibility_scope` value.
 * @returns `true` if the requester may view the product; `false` otherwise.
 */
export function canViewMarketplaceProductByAccess(
  shopAccessContext: MarketplaceAccessContext,
  visibilityScope: ProductVisibilityScope | null | undefined
): boolean {
  const scope: ProductVisibilityScope = visibilityScope ?? 'public';
 
  switch (scope) {
    case 'public':
      // Public products require explicit marketplace access.
      return canViewPublicMarketplace(shopAccessContext);
 
    case 'group':
      // Group-scoped products are not gated by marketplace access.
      // Caller is responsible for applying group membership rules separately
      // (via canViewProductByScope) before or after this check.
      return true;
 
    case 'private':
      // Private products are not gated by marketplace access.
      // Caller is responsible for applying same-shop rules separately
      // (via canViewProductByScope) before or after this check.
      return true;
 
    default: {
      const _exhaustive: never = scope;
      void _exhaustive;
      return false;
    }
  }
}
 
/**
 * Returns a human-readable label for a given `MarketplaceAccessMode`,
 * in either Arabic (default) or English.
 *
 * Arabic labels:
 * - `'enabled'`  → رؤية السوق العام
 * - `'disabled'` → المجموعة فقط
 *
 * English labels:
 * - `'enabled'`  → Marketplace Access
 * - `'disabled'` → Group Only
 *
 * @param mode - The shop's marketplace access mode.
 * @param lang - Display language: `'ar'` (default) or `'en'`.
 * @returns A localized, non-empty label string.
 */
export function getMarketplaceAccessLabel(
  mode: MarketplaceAccessMode,
  lang: 'ar' | 'en' = 'ar'
): string {
  if (lang === 'en') {
    switch (mode) {
      case 'enabled':  return 'Marketplace Access';
      case 'disabled': return 'Group Only';
      default: {
        const _exhaustive: never = mode;
        void _exhaustive;
        return 'Group Only';
      }
    }
  }
 
  switch (mode) {
    case 'enabled':  return 'رؤية السوق العام';
    case 'disabled': return 'المجموعة فقط';
    default: {
      const _exhaustive: never = mode;
      void _exhaustive;
      return 'المجموعة فقط';
    }
  }
}
 
/**
 * Returns standardized Tailwind CSS color utility classes for a given
 * `MarketplaceAccessMode`, suitable for use in badge or status indicator
 * components.
 *
 * Color mapping:
 * - `'enabled'`  → green  (`'text-green-700 bg-green-100'`)
 * - `'disabled'` → red    (`'text-red-700 bg-red-100'`)
 *
 * @param mode - The shop's marketplace access mode.
 * @returns A string of space-separated Tailwind utility classes.
 */
export function getMarketplaceAccessColor(mode: MarketplaceAccessMode): string {
  switch (mode) {
    case 'enabled':  return 'text-green-700 bg-green-100';
    case 'disabled': return 'text-red-700 bg-red-100';
    default: {
      const _exhaustive: never = mode;
      void _exhaustive;
      return 'text-red-700 bg-red-100';
    }
  }
}
 
/**
 * Filters an array of products to only those visible to a requester shop,
 * taking into account the shop's marketplace access mode (system 3).
 *
 * This is an ADDITIONAL filtering layer that runs independently of —
 * and does NOT replace — `filterVisibleProducts` (system 2). In a full
 * pipeline, both filters should be applied: first `filterVisibleProducts`
 * to enforce product-scope rules, then `filterMarketplaceProductsByAccess`
 * to enforce requester-access rules (or vice versa; both are pure).
 *
 * Filtering logic per product scope:
 * - `'public'`          → excluded when `canViewPublicMarketplace !== true`.
 * - `'group'`           → always included (access mode does not restrict group products).
 * - `'private'`         → always included (access mode does not restrict private products).
 * - `null` / `undefined`→ treated as `'public'`; subject to marketplace access gate.
 *
 * Never throws. Items that cause errors in `getScope` are excluded
 * defensively rather than crashing the caller.
 *
 * @param products          - The full list of product items to filter.
 * @param shopAccessContext - The requesting shop's {@link MarketplaceAccessContext}.
 * @param getScope          - A function that, given a single product item, returns
 *                            its `visibility_scope` value. Return `null` or `undefined`
 *                            to have it treated as `'public'`.
 * @returns A new array containing only the items accessible to the requester
 *          under the shop marketplace access rules. The original array is
 *          never mutated.
 *
 * @example
 * ```ts
 * const accessFiltered = filterMarketplaceProductsByAccess(
 *   scopeFiltered,
 *   { canViewPublicMarketplace: currentShop.canViewPublicMarketplace },
 *   (product) => product.visibilityScope,
 * );
 * ```
 */
export function filterMarketplaceProductsByAccess<T>(
  products: T[],
  shopAccessContext: MarketplaceAccessContext,
  getScope: (item: T) => ProductVisibilityScope | null | undefined
): T[] {
  return products.filter((item) => {
    try {
      const scope = getScope(item);
      return canViewMarketplaceProductByAccess(shopAccessContext, scope);
    } catch (error) {
      if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
        console.error(
          '[visibility] filterMarketplaceProductsByAccess failed',
          error
        );
      }
 
      return false;
    }
  });
}