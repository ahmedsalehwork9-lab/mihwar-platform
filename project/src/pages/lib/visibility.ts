// src/lib/visibility.ts

// ─────────────────────────────────────────────────────────────────────────────
// DEVELOPER NOTICE — THREE SEPARATE VISIBILITY SYSTEMS
// ─────────────────────────────────────────────────────────────────────────────
//
// This file contains three distinct visibility models. Do NOT conflate them.
//
// 1. LEGACY MARKETPLACE VISIBILITY  (VisibilityType: 'PUBLIC' | 'PRIVATE')
//    ─────────────────────────────────────────────────────────────────────
//    Stored on:   organizations.visibility / shops.visibility
//    Values:      'PUBLIC' | 'PRIVATE'  (uppercase)
//    Purpose:     Controls whether an organization or shop appears in the
//                 public marketplace listing.
//    Used by:     isMarketplacePublic(), getMarketplaceStatus(),
//                 getMarketplaceLabel(), canViewMarketplaceProduct(),
//                 isProductVisible(), getProductSource(),
//                 canShopAppearInMarketplace(),
//                 canOrganizationAppearInMarketplace()
//
// 2. NEW PRODUCT VISIBILITY SCOPE
//    (ProductVisibilityScope: 'public' | 'group' | 'specific' | 'private')
//    ─────────────────────────────────────────────────────────────────────────────
//    Stored on:   products.visibility_scope
//    Values:      'public' | 'group' | 'specific' | 'private'  (lowercase)
//    Purpose:     Controls which audience can see an individual product.
//    Used by:     canViewProductByScope(), getVisibilityScopeLabel(),
//                 filterVisibleProducts(), isSameGroup(), isSameShop()
//
//    Scope meanings:
//      'public'   → visible to everyone in the marketplace
//      'group'    → visible only to shops within the same organization group
//      'specific' → visible only to the originating shop and explicitly
//                   selected shops
//      'private'  → visible only to the exact same shop (internal only)
//
// 3. SHOP MARKETPLACE ACCESS  (MarketplaceAccessMode: 'enabled' | 'disabled')
//    ─────────────────────────────────────────────────────────────────────────
//    Stored on:   shops.marketplace_access (or derived from shop settings)
//    Values:      'enabled' | 'disabled' (lowercase)
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
// Legacy Types
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
 * - `public`   → visible to everyone in the marketplace
 * - `group`    → visible only to shops within the same organization group
 * - `specific` → visible only to the originating shop and explicitly selected shops
 * - `private`  → visible only to the originating shop (internal transfer only)
 */
export type ProductVisibilityScope =
  | 'public'
  | 'group'
  | 'specific'
  | 'private';


/**
 * Context object passed to scope-based visibility functions.
 *
 * Provides all identifiers needed to evaluate whether a requester
 * is permitted to view a product under the new `products.visibility_scope` model.
 */
export interface ProductVisibilityContext {
  requesterShopId: number | null;
  supplierShopId: number | null;
  requesterGroupId: number | null;
  supplierGroupId: number | null;
  visibilityScope: ProductVisibilityScope | null | undefined;

  requesterOrganizationId?: number | null;
  supplierOrganizationId?: number | null;

  /**
   * For `specific` visibility:
   * IDs of shops explicitly selected by the supplier.
   */
  allowedShopIds?: number[] | null;
}


// ─────────────────────────────────────────────
// Shop Marketplace Access Types
// ─────────────────────────────────────────────

export type MarketplaceAccessMode = 'enabled' | 'disabled';

export interface MarketplaceAccessContext {
  canViewPublicMarketplace: boolean | null | undefined;
}


// ─────────────────────────────────────────────
// Legacy Functions
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
 */
export function isSameGroup(
  requesterGroupId: number | null | undefined,
  supplierGroupId: number | null | undefined
): boolean {
  if (
    requesterGroupId == null ||
    supplierGroupId == null
  ) {
    return false;
  }

  return requesterGroupId === supplierGroupId;
}


/**
 * Determines whether the requester and supplier are the same shop.
 */
export function isSameShop(
  requesterShopId: number | null | undefined,
  supplierShopId: number | null | undefined
): boolean {
  if (
    requesterShopId == null ||
    supplierShopId == null
  ) {
    return false;
  }

  return requesterShopId === supplierShopId;
}


/**
 * Evaluates whether a requester can view a product based on
 * the product's `visibility_scope`.
 *
 * Scope rules:
 *
 * - `public`
 *      → visible to everyone.
 *
 * - `group`
 *      → visible to shops within the same organization.
 *
 * - `specific`
 *      → visible to the originating shop AND only to explicitly
 *        selected shops contained in `allowedShopIds`.
 *
 * - `private`
 *      → visible only to the originating shop.
 *
 * - null / undefined
 *      → treated as `public`.
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
    allowedShopIds,
  } = context;

  // null/undefined scope mirrors the database default of 'public'.
  const scope: ProductVisibilityScope =
    visibilityScope ?? 'public';

  switch (scope) {
    // ───────────────────────────────────────
    // PUBLIC
    // ───────────────────────────────────────
    case 'public':
      return true;


    // ───────────────────────────────────────
    // GROUP
    // ───────────────────────────────────────
    case 'group': {
      // Primary check:
      // organization_id is the current source of truth.
      if (
        requesterOrganizationId != null &&
        supplierOrganizationId != null
      ) {
        return (
          requesterOrganizationId ===
          supplierOrganizationId
        );
      }

      // Backward-compatible fallback:
      // use group_id when organization IDs are unavailable.
      return isSameGroup(
        requesterGroupId,
        supplierGroupId
      );
    }


    // ───────────────────────────────────────
    // SPECIFIC SHOPS
    // ───────────────────────────────────────
    case 'specific': {
      // The supplier/owner must always be able to see
      // their own product.
      if (
        isSameShop(
          requesterShopId,
          supplierShopId
        )
      ) {
        return true;
      }

      // No requester shop = no access.
      if (requesterShopId == null) {
        return false;
      }

      // No selected shops = nobody except the owner
      // can see the product.
      if (
        !Array.isArray(allowedShopIds) ||
        allowedShopIds.length === 0
      ) {
        return false;
      }

      // Only explicitly selected shops are allowed.
      return allowedShopIds.includes(
        requesterShopId
      );
    }


    // ───────────────────────────────────────
    // PRIVATE
    // ───────────────────────────────────────
    case 'private':
      return isSameShop(
        requesterShopId,
        supplierShopId
      );


    // ───────────────────────────────────────
    // EXHAUSTIVE GUARD
    // ───────────────────────────────────────
    default: {
      const _exhaustive: never = scope;
      void _exhaustive;
      return false;
    }
  }
}


/**
 * Returns a human-readable label for a given ProductVisibilityScope.
 */
export function getVisibilityScopeLabel(
  scope: ProductVisibilityScope | null | undefined,
  lang: 'ar' | 'en' = 'ar'
): string {
  // null/undefined mirrors DB default.
  const resolvedScope: ProductVisibilityScope =
    scope ?? 'public';

  if (lang === 'en') {
    switch (resolvedScope) {
      case 'public':
        return 'Public Marketplace';

      case 'group':
        return 'Group Only';

      case 'specific':
        return 'Selected Shops';

      case 'private':
        return 'Shop Only';

      default: {
        const _exhaustive: never = resolvedScope;
        void _exhaustive;
        return 'Public Marketplace';
      }
    }
  }

  switch (resolvedScope) {
    case 'public':
      return 'السوق العام';

    case 'group':
      return 'داخل المجموعة';

    case 'specific':
      return 'فروع محددة';

    case 'private':
      return 'داخل الفرع';

    default: {
      const _exhaustive: never = resolvedScope;
      void _exhaustive;
      return 'السوق العام';
    }
  }
}


/**
 * Filters an array of products to only those visible
 * to the requester.
 */
export function filterVisibleProducts<T>(
  products: T[],
  getContext: (
    item: T
  ) => ProductVisibilityContext | null
): T[] {
  return products.filter((item) => {
    try {
      const context = getContext(item);

      if (context === null) {
        return false;
      }

      return canViewProductByScope(context);
    } catch (error) {
      if (
        typeof import.meta !== 'undefined' &&
        import.meta.env?.DEV
      ) {
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
// Shop Marketplace Access Helpers
// ─────────────────────────────────────────────

/**
 * Determines whether a shop has access to view
 * public marketplace products.
 */
export function canViewPublicMarketplace(
  context: MarketplaceAccessContext
): boolean {
  return context.canViewPublicMarketplace === true;
}


/**
 * Evaluates whether a requester can view a marketplace
 * product based on marketplace access mode.
 *
 * Important:
 * Product scope authorization is handled separately by
 * `canViewProductByScope`.
 *
 * Therefore:
 *
 * public   → requires marketplace access
 * group    → not gated by marketplace access
 * specific → not gated by marketplace access
 * private  → not gated by marketplace access
 */
export function canViewMarketplaceProductByAccess(
  shopAccessContext: MarketplaceAccessContext,
  visibilityScope:
    | ProductVisibilityScope
    | null
    | undefined
): boolean {
  const scope: ProductVisibilityScope =
    visibilityScope ?? 'public';

  switch (scope) {
    case 'public':
      // Public products require explicit marketplace access.
      return canViewPublicMarketplace(
        shopAccessContext
      );

    case 'group':
      // Group products are governed by product-scope rules.
      return true;

    case 'specific':
      // Specific products are governed by selected-shop rules.
      return true;

    case 'private':
      // Private products are governed by same-shop rules.
      return true;

    default: {
      const _exhaustive: never = scope;
      void _exhaustive;
      return false;
    }
  }
}


/**
 * Returns a human-readable label for a MarketplaceAccessMode.
 */
export function getMarketplaceAccessLabel(
  mode: MarketplaceAccessMode,
  lang: 'ar' | 'en' = 'ar'
): string {
  if (lang === 'en') {
    switch (mode) {
      case 'enabled':
        return 'Marketplace Access';

      case 'disabled':
        return 'Group Only';

      default: {
        const _exhaustive: never = mode;
        void _exhaustive;
        return 'Group Only';
      }
    }
  }

  switch (mode) {
    case 'enabled':
      return 'رؤية السوق العام';

    case 'disabled':
      return 'المجموعة فقط';

    default: {
      const _exhaustive: never = mode;
      void _exhaustive;
      return 'المجموعة فقط';
    }
  }
}


/**
 * Returns standardized Tailwind CSS color utility classes
 * for MarketplaceAccessMode.
 */
export function getMarketplaceAccessColor(
  mode: MarketplaceAccessMode
): string {
  switch (mode) {
    case 'enabled':
      return 'text-green-700 bg-green-100';

    case 'disabled':
      return 'text-red-700 bg-red-100';

    default: {
      const _exhaustive: never = mode;
      void _exhaustive;
      return 'text-red-700 bg-red-100';
    }
  }
}


/**
 * Filters products based on requester marketplace access.
 *
 * This is an additional filtering layer.
 *
 * Product-scope authorization is still handled by:
 *
 *   filterVisibleProducts()
 */
export function filterMarketplaceProductsByAccess<T>(
  products: T[],
  shopAccessContext: MarketplaceAccessContext,
  getScope: (
    item: T
  ) =>
    | ProductVisibilityScope
    | null
    | undefined
): T[] {
  return products.filter((item) => {
    try {
      const scope = getScope(item);

      return canViewMarketplaceProductByAccess(
        shopAccessContext,
        scope
      );
    } catch (error) {
      if (
        typeof import.meta !== 'undefined' &&
        import.meta.env?.DEV
      ) {
        console.error(
          '[visibility] filterMarketplaceProductsByAccess failed',
          error
        );
      }

      return false;
    }
  });
}