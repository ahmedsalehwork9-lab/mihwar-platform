import { useEffect, useMemo, useState, useCallback, memo, useRef } from 'react';
import { supabase } from './lib/supabase';
import { useAuth } from '../context/AuthContext';
import {
  Search,
  Store,
  RefreshCw,
  Tag,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  X,
  PackageSearch,
  Copy,
  Check,
  MessageCircle,
  Navigation,
  Globe,
  Users,
  Lock,
  AlertCircle,
  ShieldCheck,
  ShieldOff,
  ImageOff,
} from 'lucide-react';
import { useLang } from '../context/LanguageContext';
import {
  canViewProductByScope,
  getVisibilityScopeLabel,
  filterVisibleProducts,
  type ProductVisibilityScope,
  type ProductVisibilityContext,
} from './lib/visibility';
import {
  determineProcurementEligibility,
  type ProcurementContext,
} from './lib/procurementEngine';

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

type Product = {
  id: number;
  product_name: string;
  product_code: string;
  brand: string;
  model: string;
  quantity: number;
  price: number;
  shop_id: number;
  visibility_scope?: ProductVisibilityScope | null;
  organization_id?: number | null;
  group_id?: number | null;
  product_image_url?: string | null;
  // Optional per-product margin override (%). null/undefined → use the
  // supplier shop's default_margin_percent instead. This is the SUPPLIER's
  // cost-price margin setting, not anything the buyer chooses.
  margin_percent?: number | null;
};

type Shop = {
  id: number;
  shop_name: string;
  phone: string;
  whatsapp: string | null;
  google_maps_url: string | null;
  logo_url: string | null;
  group_id?: number | null;
  organization_id?: number | null;
  visibility_mode?: string | null;
  // Phase 1: marketplace access control
  can_view_public_market?: boolean | null;
  // Default profit margin (%) applied to this shop's products when
  // viewed by a buyer from a DIFFERENT shop ("purchase" relationship).
  default_margin_percent?: number | null;
};

type StockStatus = 'in-stock' | 'low-stock' | 'out-of-stock';

type EnrichedProduct = Product & {
  shop_name: string;
  shop_phone: string;
  shop_whatsapp: string | null;
  shop_location: string | null;
  shop_logo: string | null;
  shop_group_id: number | null;
  shop_organization_id: number | null;
  // ─────────────────────────────────────────────────────────────
  // PRICING NOTE:
  // `price` above is always the supplier's raw COST price, exactly as
  // stored in the products table — it is never mutated.
  // `display_price` is the price this specific viewer should see and
  // be charged: for a TRANSFER relationship (same group/org — see
  // determineProcurementEligibility's requestType) it equals `price`
  // unchanged; for a PURCHASE relationship (different shop, not a
  // same-group transfer) it is `price` marked up by the effective
  // margin (this product's own margin_percent if set, otherwise the
  // supplier shop's default_margin_percent). Every place that bills
  // the buyer (cards, cart, order totals) must use `display_price`,
  // never the raw `price` — see addToCart/createOrder.
  // ─────────────────────────────────────────────────────────────
  display_price: number;
};

// Cart item = an EnrichedProduct snapshot whose `quantity` field has been
// repurposed to mean "quantity in cart" (see addToCart). No stock ceiling
// is tracked or referenced on cart items: the quantity-input UI accepts
// any positive integer, and real availability is verified later at the
// actual business checkpoints (see SECURITY NOTE above sanitizeQty).
type CartItem = EnrichedProduct;

// ─────────────────────────────────────────────────────────────
// TOAST SYSTEM
// ─────────────────────────────────────────────────────────────

type ToastType = 'success' | 'error' | 'warning' | 'info';

type Toast = {
  id: number;
  message: string;
  type: ToastType;
};

let _toastId = 0;

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] flex flex-col gap-2 pointer-events-none w-full max-w-sm px-4">
      {toasts.map(toast => {
        const cfg: Record<ToastType, string> = {
          success: 'bg-emerald-600 text-white',
          error:   'bg-red-600 text-white',
          warning: 'bg-amber-500 text-white',
          info:    'bg-blue-600 text-white',
        };
        return (
          <div
            key={toast.id}
            role="alert"
            aria-live="assertive"
            className={`flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-2xl text-sm font-bold pointer-events-auto ${cfg[toast.type]}`}
          >
            <span className="flex-1">{toast.message}</span>
            <button
              onClick={() => onDismiss(toast.id)}
              className="opacity-70 hover:opacity-100 transition-opacity shrink-0"
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const show = useCallback((message: string, type: ToastType = 'info', duration = 3500) => {
    const id = ++_toastId;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return { toasts, show, dismiss };
}

// ─────────────────────────────────────────────────────────────
// SCOPE HIERARCHY
//
// FIX 1: Valid platform visibility_mode values are:
//   null | 'public' | 'group' | 'private'
// 'hidden' is not a valid platform value — shops with unknown
// modes are excluded at source (see fetchData allowlist filter).
// effectiveScope() only handles the three valid scope values.
// ─────────────────────────────────────────────────────────────

// FIX 1: Explicit allowlist of valid shop visibility_mode values.
// Shops whose mode is not in this set are excluded before products
// are fetched — preventing unknown modes from leaking as 'public'.
const VALID_SHOP_VISIBILITY_MODES = new Set<string | null | undefined>([
  null, undefined, 'public', 'group', 'private',
]);

function effectiveScope(
  productScope: ProductVisibilityScope | null | undefined,
  shopMode: string | null | undefined,
): ProductVisibilityScope {
  const rank: Record<string, number> = { private: 2, group: 1, public: 0 };
  const pScope = productScope ?? 'public';
  const sScope: ProductVisibilityScope =
    shopMode === 'private' ? 'private'
    : shopMode === 'group'  ? 'group'
    : 'public';
  return rank[pScope] >= rank[sScope] ? pScope : sScope;
}

// ─────────────────────────────────────────────────────────────
// VISIBILITY SCOPE BADGE CONFIG
// ─────────────────────────────────────────────────────────────

const SCOPE_ICON: Record<ProductVisibilityScope, React.ElementType> = {
  public:  Globe,
  group:   Users,
  private: Lock,
};

const SCOPE_COLOR: Record<ProductVisibilityScope, string> = {
  public:  'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  group:   'bg-amber-500/10 text-amber-400 border-amber-500/20',
  private: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
};

// ─────────────────────────────────────────────────────────────
// PURE HELPERS
// ─────────────────────────────────────────────────────────────

function getStockStatus(qty: number): StockStatus {
  if (qty === 0) return 'out-of-stock';
  if (qty <= 10) return 'low-stock';
  return 'in-stock';
}

function toWaLink(num: string): string {
  const clean = num.replace(/\D/g, '');
  if (clean.startsWith('966')) return `https://wa.me/${clean}`;
  if (clean.startsWith('05'))  return `https://wa.me/966${clean.slice(1)}`;
  if (clean.startsWith('5'))   return `https://wa.me/966${clean}`;
  return `https://wa.me/${clean}`;
}

// ─────────────────────────────────────────────────────────────
// PRICING — cost price vs. marked-up display price.
//
// `price` on a product is always the supplier's cost price, stored and
// read unmodified everywhere. The price a given viewer actually SEES
// and is CHARGED depends entirely on the relationship between the
// viewer's shop and the supplier shop, exactly as already classified by
// determineProcurementEligibility()'s requestType:
//
//   - requestType === 'TRANSFER' (same organization, per
//     classifyRequest in procurementEngine.ts) → cost price, unmodified.
//     This covers transfers between branches of the same org/group —
//     never marked up, regardless of any margin settings.
//
//   - requestType === 'PURCHASE' (different organization) → cost price
//     marked up by the effective margin: the product's own
//     margin_percent if set, otherwise the supplier shop's
//     default_margin_percent, otherwise 0 (no markup configured yet).
//
// This single helper is the only place markup math happens, so the
// card display, the cart, and the order total can never disagree.
// ─────────────────────────────────────────────────────────────

function effectiveMarginPercent(product: Product, supplierShop: Shop | undefined): number {
  const productOverride = product.margin_percent;
  if (productOverride != null && Number.isFinite(productOverride)) {
    return Math.max(0, productOverride);
  }
  const shopDefault = supplierShop?.default_margin_percent;
  if (shopDefault != null && Number.isFinite(shopDefault)) {
    return Math.max(0, shopDefault);
  }
  return 0;
}

function computeDisplayPrice(
  costPrice: number,
  requestType: 'TRANSFER' | 'PURCHASE',
  marginPercent: number
): number {
  if (requestType === 'TRANSFER') return costPrice;
  return costPrice * (1 + marginPercent / 100);
}

// ─────────────────────────────────────────────────────────────
// SECURITY NOTE — quantity input no longer clamps to stock.
//
// Previously this helper accepted a `max` (= supplier stock) and
// silently clamped any typed value down to it. That let a user
// infer the supplier's exact stock count by typing a large number
// and reading back what the field snapped to — an indirect stock
// disclosure via the UI. Stock is now never read or referenced
// anywhere in the quantity-input path (this function, the input
// component, the +/- buttons). The ONLY constraint enforced here
// is the minimum (1); any positive integer above that is accepted
// as-is. Real availability is verified later, server-side / at the
// actual business checkpoints (canViewProductByScope +
// determineProcurementEligibility inside addToCart / createOrder,
// and supplier-side approval / partial-approval) — never inside
// this input.
// ─────────────────────────────────────────────────────────────

// Sanitize a raw quantity input down to a valid integer:
// - non-numeric / empty → null (caller decides fallback, e.g. keep previous)
// - negative or 0 → 1 (minimum allowed quantity)
// - any other positive integer is accepted unchanged (no upper bound here)
function sanitizeQty(raw: string): number | null {
  if (raw.trim() === '') return null;
  if (!/^\d+$/.test(raw.trim())) return null;
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return null;
  if (parsed <= 0) return 1;
  return parsed;
}

// ─────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────

const StockBadge = memo(({ quantity, t }: { quantity: number; t: any }) => {
  const status = getStockStatus(quantity);
  const config = {
    'in-stock':     { label: t('In Stock', 'متوفر'),         dot: 'bg-emerald-400', cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
    'low-stock':    { label: t('Limited', 'كمية محدودة'),    dot: 'bg-amber-400',   cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20'       },
    'out-of-stock': { label: t('Unavailable', 'غير متوفر'),  dot: 'bg-red-400',     cls: 'bg-red-500/10 text-red-400 border-red-500/20'             },
  }[status];

  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap ${config.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${config.dot}`} />
      {config.label}
    </span>
  );
});

const VisibilityBadge = memo(({
  scope,
  lang,
}: {
  scope: ProductVisibilityScope | null | undefined;
  lang: 'ar' | 'en';
}) => {
  const resolved  = scope ?? 'public';
  const label     = getVisibilityScopeLabel(scope, lang);
  const Icon      = SCOPE_ICON[resolved];
  const colorCls  = SCOPE_COLOR[resolved];
  return (
    <span
      className={`inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full border ${colorCls}`}
      title={label}
    >
      <Icon size={9} className="shrink-0" />
      <span className="truncate max-w-[80px]">{label}</span>
    </span>
  );
});

const CopyButton = memo(({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      className="p-1 rounded-md bg-slate-800 text-slate-500 hover:text-emerald-400 active:scale-90 transition-all"
      aria-label="Copy product code"
    >
      {copied ? <Check size={11} /> : <Copy size={11} />}
    </button>
  );
});

// ─────────────────────────────────────────────────────────────
// PRODUCT IMAGE THUMBNAIL
// ─────────────────────────────────────────────────────────────
// Lightweight image-or-placeholder renderer for the product card.
// Mirrors the same fallback behaviour used on the shop-side inventory
// page: render the image if a URL is present and it loads correctly;
// otherwise (no URL, or the URL fails to load) fall back to a neutral
// placeholder so the card layout never breaks or shows a broken-image
// icon from the browser.
// ─────────────────────────────────────────────────────────────

const ProductThumb = memo(({ src, alt }: { src?: string | null; alt: string }) => {
  const [errored, setErrored] = useState(false);
  const showPlaceholder = !src || errored;

  if (showPlaceholder) {
    return (
      <div
        className="w-full aspect-[16/9] rounded-xl bg-slate-800 border border-slate-700/60 flex items-center justify-center shrink-0"
        aria-hidden="true"
      >
        <ImageOff size={22} className="text-slate-600" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setErrored(true)}
      className="w-full aspect-[16/9] rounded-xl object-cover border border-slate-800 shrink-0"
    />
  );
});

// ─────────────────────────────────────────────────────────────
// QTY NUMBER FIELD
// ─────────────────────────────────────────────────────────────
// Shared editable numeric quantity field used inside both QtyControl
// (product card) and CartItemRow (cart list).
//
// Behaviour:
//  - type="number" + inputMode="numeric" + pattern="[0-9]*" so mobile
//    devices open the numeric keypad directly.
//  - Local draft state lets the user type freely (including transient
//    states like an empty field while editing) without fighting the
//    parent's committed value on every keystroke.
//  - Non-digit characters are stripped as they're typed.
//  - On blur (or Enter), the draft is sanitized: empty/invalid → 1,
//    <= 0 → 1. Any other positive integer is accepted as typed — there
//    is intentionally no upper bound here (see SECURITY NOTE above
//    sanitizeQty): this field never receives, stores, or reasons about
//    supplier stock, so the UI cannot be used to probe it.
//  - The sanitized value is the only thing ever propagated to the
//    parent via onCommit — existing business logic (addToCart /
//    changeCartQty / removeFromCart) is untouched.
//  - Focusing the field selects all text for fast overwrite typing.
// ─────────────────────────────────────────────────────────────

const QtyNumberField = memo(({
  value, disabled, onCommit, ariaLabel, size = 'md',
}: {
  value: number;
  disabled?: boolean;
  onCommit: (qty: number) => void;
  ariaLabel: string;
  size?: 'md' | 'sm';
}) => {
  const [draft, setDraft] = useState<string>(String(value));
  const isEditingRef = useRef(false);

  // Keep the draft in sync with the committed value when it changes
  // externally (e.g. +/- buttons), but never stomp on an in-progress edit.
  useEffect(() => {
    if (!isEditingRef.current) {
      setDraft(String(value));
    }
  }, [value]);

  const handleFocus = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
    isEditingRef.current = true;
    e.target.select();
  }, []);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    // Strip anything that isn't a digit while typing, so letters / symbols
    // / minus signs can never land in the field even on platforms whose
    // type="number" input is permissive.
    const digitsOnly = e.target.value.replace(/[^\d]/g, '');
    setDraft(digitsOnly);
  }, []);

  const commitDraft = useCallback(() => {
    isEditingRef.current = false;
    const sanitized = sanitizeQty(draft);
    const finalQty = sanitized ?? 1;
    setDraft(String(finalQty));
    if (finalQty !== value) onCommit(finalQty);
  }, [draft, value, onCommit]);

  const handleBlur = useCallback(() => {
    commitDraft();
  }, [commitDraft]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    }
  }, []);

  const sizeCls = size === 'sm'
    ? 'w-10 h-7 text-xs'
    : 'w-11 h-8 text-xs';

  return (
    <input
      type="number"
      inputMode="numeric"
      pattern="[0-9]*"
      min={1}
      step={1}
      value={draft}
      disabled={disabled}
      onFocus={handleFocus}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      aria-label={ariaLabel}
      className={`${sizeCls} text-center bg-slate-900 text-white font-black tabular-nums select-none outline-none border-0 focus:bg-slate-700/60 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none disabled:opacity-50`}
    />
  );
});

const QtyControl = memo(({
  inCart, cartQty, isOutOfStock, isBlocked, onAdd, onRemoveOne, onSetQty, t,
}: {
  inCart: boolean; cartQty: number; isOutOfStock: boolean; isBlocked: boolean;
  onAdd: () => void; onRemoveOne: () => void; onSetQty: (qty: number) => void; t: any;
}) => {
  if (!inCart) {
    return (
      <button
        onClick={onAdd}
        disabled={isOutOfStock || isBlocked}
        aria-label={t('Add to cart', 'إضافة إلى السلة')}
        className="h-9 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 active:scale-95 disabled:bg-slate-800 disabled:text-slate-600 font-bold text-xs text-white transition-all flex items-center gap-1.5 shrink-0"
      >
        <Plus size={13} /> {t('Add', 'إضافة')}
      </button>
    );
  }
  return (
    <div className="flex items-center bg-slate-800 rounded-xl border border-slate-700 overflow-hidden shrink-0">
      <button
        onClick={onRemoveOne}
        aria-label={t('Remove one', 'إزالة واحد')}
        className="w-8 h-8 flex items-center justify-center text-slate-300 hover:bg-slate-700 active:bg-slate-600 transition-colors"
      >
        {cartQty === 1 ? <Trash2 size={12} className="text-red-400" /> : <Minus size={12} />}
      </button>
      <QtyNumberField
        value={cartQty}
        onCommit={onSetQty}
        ariaLabel={t('Quantity', 'الكمية')}
      />
      <button
        onClick={onAdd}
        aria-label={t('Add one more', 'إضافة واحد')}
        className="w-8 h-8 flex items-center justify-center text-white hover:bg-blue-600 active:bg-blue-700 bg-blue-700/50 transition-colors"
      >
        <Plus size={12} />
      </button>
    </div>
  );
});

// ─────────────────────────────────────────────────────────────
// PRODUCT CARD
// ─────────────────────────────────────────────────────────────

const ProductCard = memo(({
  product: p, inCart, cartQty, isBlocked, onAdd, onRemoveOne, onSetQty, t, lang,
}: {
  product: EnrichedProduct;
  inCart: boolean; cartQty: number; isBlocked: boolean;
  onAdd: () => void; onRemoveOne: () => void; onSetQty: (qty: number) => void; t: any; lang: 'ar' | 'en';
}) => {
  const isOutOfStock = p.quantity === 0;

  return (
    <div
      className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col gap-3 active:scale-[0.99] transition-transform"
      aria-label={t(`Product ${p.product_name}`, `منتج ${p.product_name}`)}
    >
      {/* Product image */}
      <ProductThumb src={p.product_image_url} alt={p.product_name} />

      {/* Name + stock */}
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-white font-bold text-base leading-snug flex-1 min-w-0 line-clamp-2">{p.product_name}</h3>
        <StockBadge quantity={p.quantity} t={t} />
      </div>

      {/* Part number + copy */}
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-[12px] text-slate-400 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800 truncate max-w-[10rem]">
          {p.product_code}
        </span>
        <CopyButton text={p.product_code} />
      </div>

      {/* Meta: brand/model + shop */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] text-slate-400">
        {(p.brand || p.model) && (
          <div className="flex items-center gap-1">
            <Tag size={11} className="text-blue-500 shrink-0" />
            <span className="truncate max-w-[8rem]">{[p.brand, p.model].filter(Boolean).join(' · ')}</span>
          </div>
        )}
        <div className="flex items-center gap-1">
          <Store size={11} className="text-emerald-500 shrink-0" />
          <span className="truncate max-w-[8rem]">{p.shop_name}</span>
        </div>
      </div>

      {/* Visibility badge */}
      <VisibilityBadge scope={p.visibility_scope} lang={lang} />

      {/* Supplier contact action buttons */}
      {(p.shop_whatsapp || p.shop_location) && (
        <div className="flex items-center gap-2">
          {p.shop_whatsapp && (
            <a
              href={toWaLink(p.shop_whatsapp)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              aria-label={t('Contact via WhatsApp', 'التواصل عبر واتساب')}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 text-[11px] font-bold transition-all active:scale-95"
            >
              <MessageCircle size={11} />
              {t('WhatsApp', 'واتساب')}
            </a>
          )}
          {p.shop_location && (
            <a
              href={p.shop_location}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              aria-label={t('View location on map', 'عرض الموقع على الخريطة')}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 text-blue-400 text-[11px] font-bold transition-all active:scale-95"
            >
              <Navigation size={11} />
              {t('Location', 'الموقع')}
            </a>
          )}
        </div>
      )}

      {/* Price + add/qty control */}
      <div className="flex items-center justify-between pt-2.5 border-t border-slate-800/60">
        <div>
          <span className="text-[10px] text-slate-500 block leading-none mb-1">{t('Unit Price', 'سعر الوحدة')}</span>
          <span className="text-xl font-black text-white tabular-nums leading-none">
            {p.display_price.toLocaleString()} <span className="text-[11px] font-medium text-slate-500">ر.س</span>
          </span>
        </div>
        <QtyControl
          inCart={inCart}
          cartQty={cartQty}
          isOutOfStock={isOutOfStock}
          isBlocked={isBlocked}
          onAdd={onAdd}
          onRemoveOne={onRemoveOne}
          onSetQty={onSetQty}
          t={t}
        />
      </div>

      {/* Blocked warning */}
      {isBlocked && !isOutOfStock && (
        <p className="text-[10px] text-amber-400 bg-amber-500/5 border border-amber-500/10 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
          <AlertCircle size={10} className="shrink-0" />
          {t('Not available for your shop', 'غير متاح لمحلك')}
        </p>
      )}
    </div>
  );
});

// ─────────────────────────────────────────────────────────────
// CART ITEM ROW
// ─────────────────────────────────────────────────────────────

const CartItemRow = memo(({
  item, onRemove, onChangeQty, t,
}: {
  item: CartItem; onRemove: () => void; onChangeQty: (qty: number) => void; t: any;
}) => (
  <div className="border-b border-slate-800/60 py-3 last:border-0">
    <div className="flex items-start justify-between gap-2 mb-2">
      <div className="flex-1 min-w-0">
        <p className="text-white font-semibold text-xs leading-snug line-clamp-2">{item.product_name}</p>
        <p className="text-[10px] text-slate-500 font-mono mt-0.5 truncate">{item.product_code}</p>
      </div>
      <button
        onClick={onRemove}
        aria-label={t('Remove from cart', 'إزالة من السلة')}
        className="p-1 rounded-lg text-slate-600 hover:text-red-400 active:scale-90 transition-all shrink-0"
      >
        <Trash2 size={13} />
      </button>
    </div>
    <div className="flex items-center justify-between">
      <div className="flex items-center bg-slate-800 rounded-lg border border-slate-700/60 overflow-hidden">
        <button
          onClick={() => onChangeQty(item.quantity - 1)}
          aria-label={t('Decrease quantity', 'تقليل الكمية')}
          className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
        >
          <Minus size={11} />
        </button>
        <QtyNumberField
          value={item.quantity}
          onCommit={onChangeQty}
          ariaLabel={t('Quantity', 'الكمية')}
          size="sm"
        />
        <button
          onClick={() => onChangeQty(item.quantity + 1)}
          aria-label={t('Increase quantity', 'زيادة الكمية')}
          className="w-7 h-7 flex items-center justify-center text-white bg-blue-700/40 hover:bg-blue-600 transition-colors"
        >
          <Plus size={11} />
        </button>
      </div>
      <p className="text-emerald-400 text-sm font-black tabular-nums">
        {(item.display_price * item.quantity).toLocaleString()} <span className="text-[10px] font-normal text-slate-500">ر.س</span>
      </p>
    </div>
  </div>
));

// ─────────────────────────────────────────────────────────────
// CART SUMMARY STRIP
// ─────────────────────────────────────────────────────────────

const CartSummary = memo(({
  cartTotal, cart, cartItemCount, cartShopCount, t,
}: {
  cartTotal: number; cart: any[]; cartItemCount: number; cartShopCount: number; t: any;
}) => (
  <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl px-3 py-2.5 mb-3">
    <div className="grid grid-cols-3 gap-1 mb-2.5 text-center">
      <div className="bg-slate-900/60 rounded-lg py-1.5 px-1">
        <p className="text-lg font-black text-white tabular-nums leading-none">{cart.length}</p>
        <p className="text-[9px] text-slate-500 mt-0.5">{t('Products', 'منتج')}</p>
      </div>
      <div className="bg-slate-900/60 rounded-lg py-1.5 px-1">
        <p className="text-lg font-black text-white tabular-nums leading-none">{cartItemCount}</p>
        <p className="text-[9px] text-slate-500 mt-0.5">{t('Units', 'وحدة')}</p>
      </div>
      <div className="bg-slate-900/60 rounded-lg py-1.5 px-1">
        <p className="text-lg font-black text-white tabular-nums leading-none">{cartShopCount}</p>
        <p className="text-[9px] text-slate-500 mt-0.5">{t('Sellers', 'مورد')}</p>
      </div>
    </div>
    <div className="flex items-center justify-between">
      <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wide">{t('Grand Total', 'الإجمالي')}</p>
      <p className="text-xl font-black text-white tabular-nums">
        {cartTotal.toLocaleString()} <span className="text-xs font-normal text-slate-400">SAR</span>
      </p>
    </div>
  </div>
));

// ─────────────────────────────────────────────────────────────
// DESKTOP CART SIDEBAR
// ─────────────────────────────────────────────────────────────

const CartSidebar = memo(({
  cart, cartTotal, cartItemCount, cartShopCount,
  onRemove, onChangeQty, onCreateOrder, t, isRTL,
}: {
  cart: CartItem[]; cartTotal: number; cartItemCount: number; cartShopCount: number;
  onRemove: (id: number) => void; onChangeQty: (id: number, qty: number) => void;
  onCreateOrder: () => void; t: any; isRTL: boolean;
}) => (
  <aside
    className="hidden lg:flex flex-col w-72 shrink-0 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden h-fit sticky top-4"
    aria-label={t('Shopping cart', 'سلة التسوق')}
  >
    <div className="flex items-center gap-2 px-4 py-3.5 border-b border-slate-800">
      <ShoppingCart size={16} className="text-emerald-400 shrink-0" />
      <h2 className="text-white font-black text-sm">{t('Cart', 'السلة')}</h2>
      {cart.length > 0 && (
        <span className="mr-auto bg-emerald-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full tabular-nums">
          {cartItemCount}
        </span>
      )}
    </div>

    {cart.length === 0 ? (
      <div className="flex flex-col items-center justify-center py-12 px-4 gap-3 opacity-40">
        <ShoppingCart size={36} className="text-slate-500" />
        <p className="text-slate-400 text-xs text-center">{t('Cart is empty', 'السلة فارغة')}</p>
      </div>
    ) : (
      <>
        <div
          className="flex-1 overflow-y-auto overscroll-contain px-4 max-h-[50vh]"
          style={{ WebkitOverflowScrolling: 'touch' } as any}
        >
          {cart.map(item => (
            <CartItemRow
              key={item.id}
              item={item}
              onRemove={() => onRemove(item.id)}
              onChangeQty={qty => onChangeQty(item.id, qty)}
              t={t}
            />
          ))}
        </div>
        <div className="px-4 py-4 border-t border-slate-800">
          <CartSummary
            cartTotal={cartTotal}
            cart={cart}
            cartItemCount={cartItemCount}
            cartShopCount={cartShopCount}
            t={t}
          />
          <button
            onClick={onCreateOrder}
            aria-label={t('Place order', 'إرسال الطلب')}
            className="w-full bg-blue-600 hover:bg-blue-500 active:bg-blue-700 active:scale-[0.99] text-white font-black rounded-xl shadow-lg shadow-blue-900/30 flex items-center justify-center gap-2 transition-all"
            style={{ height: '48px' }}
          >
            <ShoppingCart size={16} />
            {t('Place Order', 'إرسال الطلب')}
          </button>
        </div>
      </>
    )}
  </aside>
));

// ─────────────────────────────────────────────────────────────
// MOBILE CART BOTTOM SHEET
// ─────────────────────────────────────────────────────────────

const CartSheet = memo(({
  cart, cartTotal, cartItemCount, cartShopCount,
  onClose, onRemove, onChangeQty, onCreateOrder, t, isRTL,
}: {
  cart: CartItem[]; cartTotal: number; cartItemCount: number; cartShopCount: number;
  onClose: () => void; onRemove: (id: number) => void;
  onChangeQty: (id: number, qty: number) => void;
  onCreateOrder: () => void; t: any; isRTL: boolean;
}) => (
  <div
    className="fixed inset-0 z-50 flex items-end lg:hidden"
    dir={isRTL ? 'rtl' : 'ltr'}
    role="dialog"
    aria-modal="true"
    aria-label={t('Cart', 'السلة')}
  >
    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />

    <div
      className="relative w-full bg-slate-900 rounded-t-[1.75rem] border-t border-slate-800 shadow-2xl flex flex-col overflow-hidden"
      style={{ maxHeight: 'calc(90vh - env(safe-area-inset-top, 0px))' }}
    >
      {/* Drag handle */}
      <div className="flex justify-center pt-3 pb-1 shrink-0">
        <div className="w-12 h-1.5 rounded-full bg-slate-700" aria-hidden="true" />
      </div>

      {/* Sheet header */}
      <div className="px-5 py-3 flex justify-between items-center border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-2">
          <ShoppingCart size={17} className="text-emerald-400" aria-hidden="true" />
          <h3 className="text-base font-black text-white">{t('Cart', 'السلة')}</h3>
        </div>
        <button
          onClick={onClose}
          aria-label={t('Close cart', 'إغلاق السلة')}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-800 text-slate-400 hover:text-white active:scale-90 transition-all"
        >
          <X size={16} />
        </button>
      </div>

      {/* Scrollable items */}
      <div
        className="flex-1 overflow-y-auto overscroll-contain px-4 py-1"
        style={{
          WebkitOverflowScrolling: 'touch',
          paddingBottom: '1rem',
        } as any}
      >
        {cart.map(item => (
          <CartItemRow
            key={item.id}
            item={item}
            onRemove={() => onRemove(item.id)}
            onChangeQty={qty => onChangeQty(item.id, qty)}
            t={t}
          />
        ))}
      </div>

      {/* Fixed footer inside sheet: summary + order button */}
      {/* paddingBottom must clear the mobile bottom nav (h-16 = 4rem) + safe area */}
      <div
        className="shrink-0 bg-slate-950 border-t border-slate-800 px-4 pt-3"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 5rem)' }}
      >
        <CartSummary
          cartTotal={cartTotal}
          cart={cart}
          cartItemCount={cartItemCount}
          cartShopCount={cartShopCount}
          t={t}
        />
        <button
          onClick={onCreateOrder}
          aria-label={t('Place order now', 'إرسال الطلب الآن')}
          className="w-full bg-blue-600 hover:bg-blue-500 active:bg-blue-700 active:scale-[0.99] text-white font-black rounded-2xl shadow-2xl shadow-blue-900/60 flex items-center justify-center gap-2.5 transition-all"
          style={{ height: '52px' }}
        >
          <ShoppingCart size={18} />
          <span className="text-base">{t('Place Order', 'إرسال الطلب الآن')}</span>
        </button>
      </div>
    </div>
  </div>
));

// ─────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────

export default function SearchPage() {
  const { isRTL, t } = useLang();
  const { ownedShopId } = useAuth();
  const lang: 'ar' | 'en' = isRTL ? 'ar' : 'en';

  const { toasts, show: showToast, dismiss: dismissToast } = useToast();

  const [products, setProducts]       = useState<Product[]>([]);
  const [shops, setShops]             = useState<Shop[]>([]);
  const [loading, setLoading]         = useState(false);
  const [fetchError, setFetchError]   = useState<string | null>(null);

  // Phase 4: debounced search — raw input vs committed query
  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery]             = useState('');
  const debounceRef                   = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [brandFilter, setBrandFilter] = useState('all');
  const [cart, setCart]               = useState<CartItem[]>([]);
  const [showCart, setShowCart]       = useState(false);

  const [requesterShop, setRequesterShop] = useState<Shop | null>(null);

  // ─────────────────────────────────────────────────────────────
  // PHASE 4 — DEBOUNCED SEARCH INPUT
  // ─────────────────────────────────────────────────────────────

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchInput(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setQuery(val), 300);
  }, []);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  // ─────────────────────────────────────────────────────────────
  // DATA FETCHING
  // ─────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setFetchError(null);

      // Stage 1: active shops — include can_view_public_market
      let shopsQuery = supabase
        .from('shops')
        .select('id, shop_name, phone, whatsapp, google_maps_url, logo_url, group_id, organization_id, visibility_mode, can_view_public_market, default_margin_percent')
        .eq('is_active', true);

      if (ownedShopId) shopsQuery = shopsQuery.neq('id', ownedShopId);

      const { data: shopsData, error: shopsError } = await shopsQuery;
      if (shopsError) throw shopsError;

      const fetchedShops: Shop[] = shopsData || [];

      // ── FIX 1: Allowlist filter — only include shops with known valid
      // visibility_mode values (null | 'public' | 'group' | 'private').
      // Previously used `!== 'hidden'` denylist; replaced with explicit
      // allowlist so any future unknown mode values are also excluded,
      // preventing accidental exposure as 'public' via effectiveScope().
      const visibleShops = fetchedShops.filter(s =>
        VALID_SHOP_VISIBILITY_MODES.has(s.visibility_mode)
      );
      const activeShopIds = visibleShops.map(s => s.id);

      if (activeShopIds.length === 0) {
        setProducts([]);
        setShops([]);
        setRequesterShop(null);
        return;
      }

      // Stage 2: products from valid-mode active shops
      // NOTE: product-level group_id is intentionally excluded —
      // group matching uses SHOP group_id (via shopMap), not product group_id.
      const { data: productsData, error: productsError } = await supabase
        .from('products')
        .select('id, product_name, product_code, brand, model, quantity, price, shop_id, visibility_scope, organization_id, product_image_url, margin_percent')
        .in('shop_id', activeShopIds)
        .gt('quantity', 0)
        .order('created_at', { ascending: false });

      if (productsError) throw productsError;

      // Stage 3: resolve requester shop (with can_view_public_market)
      if (ownedShopId) {
        const { data: ownData } = await supabase
          .from('shops')
          .select('id, shop_name, phone, whatsapp, google_maps_url, logo_url, group_id, organization_id, visibility_mode, can_view_public_market, default_margin_percent')
          .eq('id', ownedShopId)
          .single();
        setRequesterShop((ownData as Shop) ?? null);
      }

      setProducts((productsData as Product[]) || []);
      setShops(visibleShops);
    } catch (err: any) {
      console.error('[SearchPage] fetchData error:', err);
      const msg = err?.message ?? t('Failed to load products', 'فشل تحميل المنتجات');
      setFetchError(msg);
    } finally {
      setLoading(false);
    }
  }, [ownedShopId, t]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ─────────────────────────────────────────────────────────────
  // SHOP MAP
  // ─────────────────────────────────────────────────────────────

  const shopMap = useMemo(() => {
    const m: Record<number, Shop> = {};
    shops.forEach(s => { m[s.id] = s; });
    return m;
  }, [shops]);

  // ─────────────────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════
  // MARKETPLACE ACCESS LAYER  (Phase 1)
  // ══════════════════════════════════════════════════════════════
  // Controls whether the requester can see public-scope products.
  //
  // can_view_public_market:
  //   true  → full access: public + group + private (per other rules)
  //   false → restricted: group + private only (public products hidden)
  //   null/undefined → treated as TRUE (default open for existing shops)
  //
  // FIX 5 — GUEST SAFETY DECISION:
  //   When ownedShopId is null the user has no registered shop.
  //   Decision: ALLOW guest access (canViewPublicMarket = true).
  //   Rationale: The Supabase RLS layer is the primary security
  //   boundary. Guests browsing without a shop can see public
  //   products but cannot place orders (createOrder() guards this).
  //   If this platform evolves to require shop registration before
  //   browsing, change this default to `false` here.
  // ══════════════════════════════════════════════════════════════

  const canViewPublicMarket = useMemo<boolean>(() => {
    // Guest (no owned shop) → allow by design (see comment above)
    if (!requesterShop) return true;
    // Explicit false → restricted marketplace access
    return requesterShop.can_view_public_market !== false;
  }, [requesterShop]);

  // ─────────────────────────────────────────────────────────────
  // VISIBILITY CONTEXT BUILDER
  // ─────────────────────────────────────────────────────────────

  const buildVisibilityContext = useCallback(
    (product: Product): ProductVisibilityContext => {
      const supplierShop = shopMap[product.shop_id];
      const reqGroupId   = requesterShop?.group_id ?? null;
      const supGroupId   = supplierShop?.group_id  ?? null;
      const reqOrgId     = requesterShop?.organization_id ?? null;
      const supOrgId     = supplierShop?.organization_id  ?? null;

      const sameOrg = reqOrgId != null && supOrgId != null && reqOrgId === supOrgId;
      const effectiveRequesterGroupId = reqGroupId ?? (sameOrg ? supGroupId : null);

      return {
        requesterShopId:         ownedShopId ?? null,
        supplierShopId:          product.shop_id,
        requesterGroupId:        effectiveRequesterGroupId,
        supplierGroupId:         supGroupId,
        visibilityScope:         product.visibility_scope ?? null,
        requesterOrganizationId: reqOrgId,
        supplierOrganizationId:  supOrgId,
      };
    },
    [ownedShopId, requesterShop, shopMap]
  );

  // ─────────────────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════
  // PROCUREMENT LAYER  (Phase 2 / procurementEngine)
  // ══════════════════════════════════════════════════════════════
  // Separate from visibility. Determines order eligibility between
  // requester and supplier based on org/group relationships.
  // DO NOT merge with Visibility Layer or Marketplace Access Layer.
  // ══════════════════════════════════════════════════════════════

  const buildProcurementContext = useCallback(
    (product: Product): ProcurementContext => ({
      requesterOrganizationId: requesterShop?.organization_id ?? null,
      supplierOrganizationId:  shopMap[product.shop_id]?.organization_id ?? null,
      requesterGroupId:        requesterShop?.group_id ?? null,
      supplierGroupId:         shopMap[product.shop_id]?.group_id ?? null,
      requesterShopId:         ownedShopId ?? null,
      supplierShopId:          product.shop_id,
    }),
    [ownedShopId, requesterShop, shopMap]
  );

  // ─────────────────────────────────────────────────────────────
  // ENRICHED PRODUCTS
  // ─────────────────────────────────────────────────────────────

  const enrichedProducts = useMemo<EnrichedProduct[]>(() => {
    return products.map(p => {
      const shop        = shopMap[p.shop_id];
      const scope       = effectiveScope(p.visibility_scope, shop?.visibility_mode);
      const procCtx     = buildProcurementContext(p);
      const elig        = determineProcurementEligibility(procCtx);
      const margin      = effectiveMarginPercent(p, shop);
      const display_price = computeDisplayPrice(p.price, elig.requestType, margin);
      return {
        ...p,
        visibility_scope:     scope,
        shop_name:            shop?.shop_name       ?? '—',
        shop_phone:           shop?.phone           ?? '—',
        shop_whatsapp:        shop?.whatsapp || shop?.phone || null,
        shop_location:        shop?.google_maps_url ?? null,
        shop_logo:            shop?.logo_url        ?? null,
        shop_group_id:        shop?.group_id        ?? null,
        shop_organization_id: shop?.organization_id ?? null,
        display_price,
      };
    });
  }, [products, shopMap, buildProcurementContext]);

  // ─────────────────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════
  // VISIBILITY LAYER  (Phase 2 + 11)
  // ══════════════════════════════════════════════════════════════
  // Two-layer security filter. Both run before any product reaches
  // the render list. The UI cannot bypass either layer.
  //
  // Layer 1 — Scope filter (filterVisibleProducts):
  //   Enforces public / group / private access rules per
  //   visibility.ts canViewProductByScope() logic.
  //   - public  → visible to all (subject to Layer 2)
  //   - group   → visible only if requester shares same group
  //   - private → visible only per existing platform rules
  //
  // Layer 2 — Marketplace access (canViewPublicMarket):
  //   If requester has can_view_public_market = false,
  //   strips ALL remaining public-scope products.
  //   Group and private products pass through unchanged.
  //
  // FIX 3 — HARDENING:
  //   An extra guard ensures products whose resolved scope is not
  //   one of the three valid values are excluded defensively,
  //   preventing any unknown scope from leaking through.
  //
  // DO NOT merge with Marketplace Access Layer or Procurement Layer.
  // ══════════════════════════════════════════════════════════════

  const VALID_SCOPES = new Set<string>(['public', 'group', 'private']);

  const visibleProducts = useMemo<EnrichedProduct[]>(() => {
    // FIX 3 belt-and-suspenders: exclude any product whose resolved
    // scope is not a recognised platform value before further filtering.
    const scopeGuarded = enrichedProducts.filter(
      p => VALID_SCOPES.has(p.visibility_scope ?? 'public')
    );

    // Layer 1: scope-based visibility filter (group / private rules)
    const scopeFiltered = filterVisibleProducts(
      scopeGuarded,
      (p) => buildVisibilityContext(p)
    );

    // Layer 2: marketplace access control
    if (canViewPublicMarket) {
      // Full marketplace access: public + group both allowed
      return scopeFiltered;
    }

    // Restricted access: strip public-scope products entirely
    return scopeFiltered.filter(
      (p) => (p.visibility_scope ?? 'public') !== 'public'
    );
  }, [enrichedProducts, buildVisibilityContext, canViewPublicMarket]);

  // ─────────────────────────────────────────────────────────────
  // Phase 7: KPI COUNTS — include unique visible suppliers
  // ─────────────────────────────────────────────────────────────

  const kpi = useMemo(() => {
    let pub = 0, grp = 0, prv = 0;
    const supplierIds = new Set<number>();
    for (const p of visibleProducts) {
      const s = p.visibility_scope ?? 'public';
      if (s === 'public')       pub++;
      else if (s === 'group')   grp++;
      else                      prv++;
      supplierIds.add(p.shop_id);
    }
    return { total: visibleProducts.length, pub, grp, prv, suppliers: supplierIds.size };
  }, [visibleProducts]);

  // ─────────────────────────────────────────────────────────────
  // SEARCH — Phase 4 uses debounced `query`
  // ─────────────────────────────────────────────────────────────

  const filtered = useMemo<EnrichedProduct[]>(() => {
    const q = query.trim().toLowerCase();
    const brandOk = (p: EnrichedProduct) => brandFilter === 'all' || p.brand === brandFilter;
    if (!q) return visibleProducts.filter(brandOk);

    return visibleProducts.filter(p => {
      if (!brandOk(p)) return false;
      return (
        p.product_name.toLowerCase().includes(q)   ||
        p.product_code.toLowerCase().includes(q) ||
        p.model.toLowerCase().includes(q)        ||
        (p.brand?.toLowerCase().includes(q) ?? false) ||
        p.shop_name.toLowerCase().includes(q)
      );
    });
  }, [visibleProducts, query, brandFilter]);

  const brands = useMemo(
    () => ['all', ...new Set(visibleProducts.map(p => p.brand).filter(Boolean))],
    [visibleProducts]
  );

  // ─────────────────────────────────────────────────────────────
  // CART METRICS
  // ─────────────────────────────────────────────────────────────

  const cartItemCount = useMemo(() => cart.reduce((s, i) => s + i.quantity, 0), [cart]);
  const cartTotal     = useMemo(() => cart.reduce((s, i) => s + i.display_price * i.quantity, 0), [cart]);
  const cartShopCount = useMemo(() => new Set(cart.map(i => i.shop_id)).size, [cart]);

  // ─────────────────────────────────────────────────────────────
  // Phase 6: CART ACTIONS — toast instead of alert()
  // ─────────────────────────────────────────────────────────────

  const addToCart = useCallback((product: EnrichedProduct) => {
    const visCtx = buildVisibilityContext(product);
    if (!canViewProductByScope(visCtx)) {
      showToast(t('This product is not available to your shop.', 'هذا المنتج غير متاح لمحلك.'), 'warning');
      return;
    }

    const procCtx = buildProcurementContext(product);
    const elig    = determineProcurementEligibility(procCtx, visCtx);
    if (!elig.canView) {
      showToast(t('This product is not eligible for your shop.', 'هذا المنتج غير مؤهل لمحلك.'), 'warning');
      return;
    }

    setCart(prev => {
      const exists = prev.find(item => item.id === product.id);
      if (exists) {
        // No stock ceiling enforced here — see SECURITY NOTE above
        // sanitizeQty for why the quantity UI never clamps to stock.
        return prev.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, { ...product, quantity: 1 }];
    });
  }, [buildVisibilityContext, buildProcurementContext, showToast, t]);

  const removeFromCart = useCallback((id: number) => {
    setCart(prev => prev.filter(item => item.id !== id));
  }, []);

  const changeCartQty = useCallback((id: number, qty: number) => {
    if (qty <= 0) { removeFromCart(id); return; }
    // No stock ceiling enforced here — see SECURITY NOTE above
    // sanitizeQty for why the quantity UI never clamps to stock.
    setCart(prev => prev.map(item => item.id === id ? { ...item, quantity: qty } : item));
  }, [removeFromCart]);

  // ─────────────────────────────────────────────────────────────
  // ORDER CREATION — Phase 6: toast instead of alert()
  //
  // FIX (request_type bug):
  //   Previously the `orders` insert never set `request_type`,
  //   so it was stored as NULL for every order regardless of
  //   whether the transaction was a same-group TRANSFER or a
  //   cross-organization PURCHASE. OrderDetailsDrawer/buildPrintHTML
  //   then defaulted a NULL request_type to "Purchase Order", which
  //   made transfer orders between branches of the same group
  //   render and print as purchase orders.
  //
  //   Fix: for each supplier group in `grouped`, build the
  //   visibility/procurement context using a representative item
  //   for that supplier (items[shopId][0] — all items in that
  //   bucket share the same shop_id, so org/group identity is
  //   identical for all of them), run determineProcurementEligibility()
  //   exactly as addToCart()/the eligibility pre-check above already
  //   does, and persist elig.requestType on the order row. This is
  //   computed independently per supplier inside the loop — it does
  //   NOT reuse state left over from a previously checked product.
  // ─────────────────────────────────────────────────────────────

  const createOrder = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        showToast(t('Please login first', 'يرجى تسجيل الدخول أولاً'), 'error');
        return;
      }

      const { data: myShop, error: shopError } = await supabase
        .from('shops').select('*').eq('owner_id', user.id).single();
      if (shopError || !myShop) {
        showToast(t('Shop not found', 'المحل غير موجود'), 'error');
        return;
      }

      for (const item of cart) {
        const enrichedItem = enrichedProducts.find(p => p.id === item.id);
        if (!enrichedItem) continue;

        const visCtx  = buildVisibilityContext(enrichedItem);
        const procCtx = buildProcurementContext(enrichedItem);

        if (!canViewProductByScope(visCtx)) {
          showToast(`${t('Product not available:', 'المنتج غير متاح:')} ${item.product_name}`, 'error');
          return;
        }

        const elig = determineProcurementEligibility(procCtx, visCtx);
        if (!elig.canView) {
          showToast(`${t('Product not eligible:', 'المنتج غير مؤهل:')} ${item.product_name}`, 'error');
          return;
        }
      }

      const grouped: Record<number, any[]> = {};
      cart.forEach(item => {
        if (!grouped[item.shop_id]) grouped[item.shop_id] = [];
        grouped[item.shop_id].push(item);
      });

      for (const shopId in grouped) {
        const items      = grouped[shopId];
        const orderTotal = items.reduce((sum: number, item: any) => sum + item.display_price * item.quantity, 0);

        // ── request_type fix: compute eligibility per-supplier, not
        // reused from a prior iteration or from the pre-check loop above.
        // `items[0]` is a safe representative of this supplier bucket
        // because every item in `items` shares the same shop_id, and
        // therefore the same org/group identity used by the contexts.
        const representativeItem = items[0];
        const enrichedRepresentative =
          enrichedProducts.find(p => p.id === representativeItem.id) ?? representativeItem;

        const supplierVisCtx  = buildVisibilityContext(enrichedRepresentative);
        const supplierProcCtx = buildProcurementContext(enrichedRepresentative);
        const elig             = determineProcurementEligibility(supplierProcCtx, supplierVisCtx);

        // Temporary diagnostic log — remove once request_type is verified in production.
        console.log('[CREATE ORDER]', {
          supplier: shopId,
          requestType: elig.requestType,
        });

        const { data: order, error: orderError } = await supabase
          .from('orders')
          .insert({
            from_shop_id: myShop.id,
            to_shop_id: Number(shopId),
            status: 'pending',
            total_amount: orderTotal,
            request_type: elig.requestType,
          })
          .select().single();
        if (orderError) throw orderError;

        const { error: itemsError } = await supabase.from('order_items').insert(
          items.map((item: any) => ({
            order_id:   order.id,
            product_id: item.id,
            quantity:   item.quantity,
            price:      item.display_price,
          }))
        );
        if (itemsError) throw itemsError;

        await supabase.from('notifications').insert({
          shop_id: Number(order.to_shop_id),
          title:   t('New Order', 'طلب جديد'),
          message: `${t('New order', 'طلب جديد')} #${order.id}`,
          type:    'new_order',
        });
      }

      setCart([]);
      setShowCart(false);
      showToast(t('Order placed successfully!', 'تم إرسال الطلب بنجاح!'), 'success');
    } catch (err: any) {
      console.error('[SearchPage] createOrder error:', err);
      showToast(err.message || t('Error creating order', 'خطأ في إنشاء الطلب'), 'error');
    }
  }, [cart, enrichedProducts, buildVisibilityContext, buildProcurementContext, showToast, t]);

  // ─────────────────────────────────────────────────────────────
  // PER-PRODUCT ELIGIBILITY
  // ─────────────────────────────────────────────────────────────

  const isProductBlocked = useCallback(
    (p: EnrichedProduct): boolean => {
      try {
        const visCtx  = buildVisibilityContext(p);
        const procCtx = buildProcurementContext(p);
        const elig    = determineProcurementEligibility(procCtx, visCtx);
        return !elig.canView;
      } catch {
        return false;
      }
    },
    [buildVisibilityContext, buildProcurementContext]
  );

  // ─────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────

  return (
    <div
      className="max-w-full px-3 pt-3 min-h-screen"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 5rem)' }}
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      {/* ── Toast Notifications ──────────────────────────────────────── */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* ── Sticky Search + Brand Filter ────────────────────────────── */}
      <div className="sticky top-0 z-30 pb-3 bg-slate-950/90 backdrop-blur-md">

        {/* ── FIX 4: Marketplace Access Badge — improved with secondary text ── */}
        <div className="flex items-center justify-end pt-1 pb-1.5">
          <div className="flex flex-col items-end gap-0.5">
            <span
              className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full border ${
                canViewPublicMarket
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  : 'bg-red-500/10 text-red-400 border-red-500/20'
              }`}
              aria-label={canViewPublicMarket
                ? t('Marketplace access enabled', 'الوصول للسوق العام مفعّل')
                : t('Marketplace access disabled — group products only', 'الوصول للسوق العام معطّل — يتم عرض منتجات المجموعة فقط')
              }
              title={canViewPublicMarket
                ? t('You can view all public and group products', 'يمكنك مشاهدة منتجات السوق العام ومنتجات المجموعة')
                : t('Your shop is restricted to group products only', 'محلك مقيّد بمنتجات المجموعة فقط')
              }
            >
              {canViewPublicMarket
                ? <><ShieldCheck size={10} />{t('Marketplace Enabled', 'السوق العام مفعّل')}</>
                : <><ShieldOff  size={10} />{t('Marketplace Disabled', 'السوق العام معطّل')}</>
              }
            </span>
            {/* FIX 4: Secondary explanatory text when marketplace is disabled */}
            {!canViewPublicMarket && (
              <span className="text-[9px] text-slate-500 font-medium px-1">
                {t('Group Products Only', 'يتم عرض منتجات المجموعة فقط')}
              </span>
            )}
          </div>
        </div>

        {/* Search input */}
        <div className="relative">
          <Search
            className={`absolute top-1/2 -translate-y-1/2 ${isRTL ? 'right-4' : 'left-4'} text-slate-500 pointer-events-none`}
            size={17}
            aria-hidden="true"
          />
          <input
            type="search"
            value={searchInput}
            onChange={handleSearchChange}
            placeholder={t('Product name, code, brand, shop...', 'اسم المنتج أو كوده أو الماركة أو المحل...')}
            aria-label={t('Search products', 'البحث في المنتجات')}
            className={`w-full bg-slate-900 border border-slate-800 rounded-2xl ${isRTL ? 'pr-11 pl-4' : 'pl-11 pr-4'} text-white focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition-all outline-none text-sm shadow-lg`}
            style={{ height: '50px' }}
          />
          {loading && (
            <RefreshCw
              size={14}
              className={`absolute top-1/2 -translate-y-1/2 ${isRTL ? 'left-4' : 'right-4'} text-blue-500 animate-spin`}
              aria-label={t('Loading', 'جاري التحميل')}
            />
          )}
        </div>

        {/* Brand filter pills */}
        <div
          className="flex gap-2 overflow-x-auto py-2.5 no-scrollbar"
          role="group"
          aria-label={t('Filter by brand', 'تصفية حسب الماركة')}
        >
          {brands.map(b => (
            <button
              key={b}
              onClick={() => setBrandFilter(b)}
              aria-pressed={brandFilter === b}
              aria-label={b === 'all' ? t('All brands', 'جميع الماركات') : b}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold border transition-all whitespace-nowrap active:scale-95 ${
                brandFilter === b
                  ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              {b === 'all' ? t('All', 'الكل') : b}
            </button>
          ))}
        </div>

        {!loading && query && (
          <p className="text-[11px] text-slate-500 px-1 pb-1">
            {filtered.length} {t('results', 'نتيجة')}
          </p>
        )}
      </div>

      {/* ── Fetch Error Banner ───────────────────────────────────────── */}
      {fetchError && !loading && (
        <div className="mb-4 bg-red-500/10 border border-red-500/20 rounded-2xl p-4 flex items-center gap-3" role="alert">
          <AlertCircle size={18} className="text-red-400 shrink-0" aria-hidden="true" />
          <p className="text-red-400 text-sm flex-1">{fetchError}</p>
          <button
            onClick={fetchData}
            aria-label={t('Retry', 'إعادة المحاولة')}
            className="px-3 py-1.5 rounded-xl bg-red-500/20 text-red-400 text-xs font-bold hover:bg-red-500/30 transition-all active:scale-95"
          >
            {t('Retry', 'إعادة المحاولة')}
          </button>
        </div>
      )}

      {/* ── Phase 7: KPI Strip — with Visible Suppliers ─────────────── */}
      {!loading && !fetchError && visibleProducts.length > 0 && (
        <div className="grid grid-cols-5 gap-2 mb-4">
          {[
            { label: t('Visible', 'المرئية'),     val: kpi.total,     color: 'text-white'       },
            { label: t('Public', 'السوق العام'),  val: kpi.pub,       color: 'text-emerald-400' },
            { label: t('Group', 'مجموعة'),        val: kpi.grp,       color: 'text-amber-400'   },
            { label: t('Shop Only', 'فرع'),       val: kpi.prv,       color: 'text-blue-400'    },
            { label: t('Suppliers', 'موردون'),    val: kpi.suppliers, color: 'text-slate-300'   },
          ].map((kp, i) => (
            <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-center">
              <p className={`text-lg font-black tabular-nums leading-none ${kp.color}`}>{kp.val}</p>
              <p className="text-[9px] text-slate-600 mt-0.5 font-bold uppercase tracking-wide truncate">{kp.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Main layout ─────────────────────────────────────────────── */}
      <div className={`flex gap-4 items-start ${isRTL ? 'flex-row-reverse' : 'flex-row'}`}>

        <div className="flex-1 min-w-0 overflow-hidden">
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 animate-pulse">
                  <div className="flex justify-between">
                    <div className="h-5 w-2/3 bg-slate-800 rounded" />
                    <div className="h-5 w-1/5 bg-slate-800 rounded-full" />
                  </div>
                  <div className="h-4 w-1/3 bg-slate-800 rounded-lg" />
                  <div className="h-4 w-1/2 bg-slate-800 rounded" />
                  <div className="h-6 w-1/4 bg-slate-800 rounded-full" />
                  <div className="flex justify-between pt-2 border-t border-slate-800">
                    <div className="h-7 w-1/4 bg-slate-800 rounded" />
                    <div className="h-9 w-20 bg-slate-800 rounded-xl" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-24 text-center flex flex-col items-center gap-4 opacity-40">
              <PackageSearch size={52} className="text-slate-500" aria-hidden="true" />
              <p className="text-sm font-medium text-slate-400">{t('No parts found', 'لا توجد نتائج مطابقة')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {filtered.map(p => (
                <ProductCard
                  key={p.id}
                  product={p}
                  inCart={cart.some(c => c.id === p.id)}
                  cartQty={cart.find(c => c.id === p.id)?.quantity ?? 0}
                  isBlocked={isProductBlocked(p)}
                  onAdd={() => addToCart(p)}
                  onRemoveOne={() => changeCartQty(p.id, (cart.find(c => c.id === p.id)?.quantity ?? 0) - 1)}
                  onSetQty={qty => changeCartQty(p.id, qty)}
                  t={t}
                  lang={lang}
                />
              ))}
            </div>
          )}
        </div>

        <CartSidebar
          cart={cart}
          cartTotal={cartTotal}
          cartItemCount={cartItemCount}
          cartShopCount={cartShopCount}
          onRemove={removeFromCart}
          onChangeQty={changeCartQty}
          onCreateOrder={createOrder}
          t={t}
          isRTL={isRTL}
        />
      </div>

      {/* ── Mobile Floating Cart Button ──────────────────────────────── */}
      {cart.length > 0 && (
        <div
          className="fixed z-40 lg:hidden"
          style={{
            bottom: 'calc(env(safe-area-inset-bottom, 0px) + 5.5rem)',
            [isRTL ? 'left' : 'right']: '1rem',
          }}
        >
          <button
            onClick={() => setShowCart(true)}
            aria-label={t('Open cart', 'فتح السلة')}
            className="relative bg-blue-600 hover:bg-blue-500 active:bg-blue-700 active:scale-95 text-white rounded-2xl shadow-2xl shadow-blue-900/50 flex items-center gap-2.5 px-4 transition-all"
            style={{ height: '52px' }}
          >
            <span className="absolute -top-2 -right-2 bg-emerald-500 text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center tabular-nums shadow">
              {cartItemCount}
            </span>
            <ShoppingCart size={20} aria-hidden="true" />
            <div className={isRTL ? 'text-right' : 'text-left'}>
              <p className="text-sm font-black leading-tight tabular-nums">{cartTotal.toLocaleString()}</p>
              <p className="text-[9px] opacity-75 font-bold">SAR</p>
            </div>
          </button>
        </div>
      )}

      {/* ── Mobile Cart Bottom Sheet ─────────────────────────────────── */}
      {showCart && (
        <CartSheet
          cart={cart}
          cartTotal={cartTotal}
          cartItemCount={cartItemCount}
          cartShopCount={cartShopCount}
          onClose={() => setShowCart(false)}
          onRemove={removeFromCart}
          onChangeQty={changeCartQty}
          onCreateOrder={createOrder}
          t={t}
          isRTL={isRTL}
        />
      )}
    </div>
  );
}
