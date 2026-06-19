import { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from './lib/supabase';
import { useLang } from '../context/LanguageContext';
import {
  Package,
  Search,
  RefreshCw,
  Boxes,
  Store,
  Globe,
  Users,
  Lock,
  AlertCircle,
  ShieldAlert,
  TrendingDown,
  CheckCircle2,
  XCircle,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

type VisibilityScope = 'public' | 'group' | 'private';

type Product = {
  id: number;
  part_number: string;
  part_name: string;
  brand: string;
  model: string;
  quantity: number;
  shop_id: number;
  // Visibility system — safe optional; fallback: 'public'
  visibility_scope?: VisibilityScope | null;
  // Future: org support (M — future readiness)
  organization_id?: number | null;
};

type ShopMap = Record<number, { name: string; visibility_mode: string | null }>;

// ─────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────

// Visibility scope display config — localised labels + Tailwind classes + icon
const SCOPE_CONFIG: Record<
  VisibilityScope,
  {
    labelAr: string;
    labelEn: string;
    color: string;
    dot: string;
    Icon: React.ElementType;
  }
> = {
  public:  { labelAr: 'السوق العام',     labelEn: 'Public Marketplace', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', dot: 'bg-emerald-400', Icon: Globe  },
  group:   { labelAr: 'داخل المجموعة',  labelEn: 'Group Only',          color: 'bg-amber-500/10 text-amber-400 border-amber-500/20',     dot: 'bg-amber-400',   Icon: Users  },
  private: { labelAr: 'داخل الفرع',     labelEn: 'Shop Only',           color: 'bg-blue-500/10 text-blue-400 border-blue-500/20',        dot: 'bg-blue-400',    Icon: Lock   },
};

// Resolved scope with safe fallback
function resolveScope(scope: VisibilityScope | null | undefined): VisibilityScope {
  if (scope === 'group' || scope === 'private') return scope;
  return 'public';
}

/**
 * Returns the stricter of the product's own visibility_scope and the
 * shop-level visibility_mode.  Used so admin inventory reflects the real
 * effective visibility that marketplace users would see.
 * Hierarchy (most → least restrictive): private > group > public
 */
function effectiveScope(
  productScope: VisibilityScope | null | undefined,
  shopMode: string | null | undefined,
): VisibilityScope {
  const rank: Record<string, number> = { private: 2, group: 1, public: 0 };
  const pScope = resolveScope(productScope);
  const sScope: VisibilityScope =
    shopMode === 'private' ? 'private'
    : shopMode === 'group' ? 'group'
    : 'public';
  return rank[pScope] >= rank[sScope] ? pScope : sScope;
}

// ─────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────

/** Localised visibility scope badge */
function ScopeBadge({
  scope,
  isRTL,
}: {
  scope: VisibilityScope | null | undefined;
  isRTL: boolean;
}) {
  const resolved = resolveScope(scope);
  const cfg      = SCOPE_CONFIG[resolved];
  const label    = isRTL ? cfg.labelAr : cfg.labelEn;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${cfg.color}`}
      title={label}
    >
      <cfg.Icon size={9} className="shrink-0" />
      <span className="truncate max-w-[90px]">{label}</span>
    </span>
  );
}

/** Skeleton row — desktop table */
function SkeletonRow() {
  return (
    <tr className="border-t border-slate-800">
      {[...Array(7)].map((_, i) => (
        <td key={i} className="p-4">
          <div className="h-4 bg-slate-800 rounded animate-pulse" style={{ width: `${50 + Math.random() * 40}%` }} />
        </td>
      ))}
    </tr>
  );
}

/** Skeleton card — mobile */
function SkeletonCard() {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 animate-pulse">
      <div className="flex justify-between">
        <div className="h-4 w-1/3 bg-slate-800 rounded" />
        <div className="h-4 w-1/4 bg-slate-800 rounded" />
      </div>
      <div className="h-5 w-2/3 bg-slate-800 rounded" />
      <div className="h-4 w-1/2 bg-slate-800 rounded" />
      <div className="flex justify-between">
        <div className="h-6 w-1/4 bg-slate-800 rounded-full" />
        <div className="h-6 w-12 bg-slate-800 rounded" />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────

export default function GlobalInventoryPage() {
  const { t, isRTL } = useLang();

  const [products, setProducts] = useState<Product[]>([]);
  const [shopMap, setShopMap]   = useState<ShopMap>({});
  const [search, setSearch]     = useState('');
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  // ─────────────────────────────────────────────────────────────
  // DATA LOADING
  // ─────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch products and shops in parallel
      const [productsRes, shopsRes] = await Promise.all([
        supabase
          .from('products')
          .select('id, part_number, part_name, brand, model, quantity, shop_id, visibility_scope, organization_id')
          .order('id', { ascending: false }),
        supabase
          .from('shops')
          .select('id, shop_name, visibility_mode'),
      ]);

      // Products error
      if (productsRes.error) {
        throw new Error(productsRes.error.message);
      }

      // Shops error — non-fatal; fall back to shop_id display
      const map: ShopMap = {};
      if (!shopsRes.error) {
        for (const shop of (shopsRes.data || [])) {
          map[shop.id] = { name: shop.shop_name, visibility_mode: shop.visibility_mode ?? null };
        }
      }

      setShopMap(map);
      setProducts((productsRes.data as Product[]) || []);
    } catch (e: any) {
      setError(e?.message ?? t('Failed to load inventory', 'فشل تحميل المخزون'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { loadData(); }, [loadData]);

  // ─────────────────────────────────────────────────────────────
  // SEARCH — useMemo, case-insensitive, trim-safe
  // Searches: part_name, part_number, brand, model, shop_name, visibility_scope label
  // ─────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(p => {
      const shopEntry = shopMap[p.shop_id];
      const shopName  = shopEntry?.name ?? '';
      const effScope  = effectiveScope(p.visibility_scope, shopEntry?.visibility_mode);
      const scopeLabel = isRTL
        ? SCOPE_CONFIG[effScope].labelAr
        : SCOPE_CONFIG[effScope].labelEn;
      return (
        p.part_name?.toLowerCase().includes(q)    ||
        p.part_number?.toLowerCase().includes(q)  ||
        p.brand?.toLowerCase().includes(q)         ||
        p.model?.toLowerCase().includes(q)         ||
        shopName.toLowerCase().includes(q)         ||
        scopeLabel.toLowerCase().includes(q)
      );
    });
  }, [search, products, shopMap, isRTL]);

  // ─────────────────────────────────────────────────────────────
  // KPI DERIVATIONS — single pass, no extra queries
  // ─────────────────────────────────────────────────────────────

  const kpi = useMemo(() => {
    let totalQty = 0, outOfStock = 0, lowStock = 0, healthy = 0;
    let pub = 0, grp = 0, prv = 0;

    for (const p of products) {
      totalQty += p.quantity || 0;
      if (p.quantity === 0)       outOfStock++;
      else if (p.quantity <= 5)   lowStock++;
      else                        healthy++;

      const s = effectiveScope(p.visibility_scope, shopMap[p.shop_id]?.visibility_mode);
      if (s === 'public')  pub++;
      else if (s === 'group')  grp++;
      else                     prv++;
    }

    return { totalQty, outOfStock, lowStock, healthy, pub, grp, prv };
  }, [products]);

  // ─────────────────────────────────────────────────────────────
  // RENDER HELPERS
  // ─────────────────────────────────────────────────────────────

  function qtyColor(qty: number): string {
    if (qty === 0) return 'text-red-400';
    if (qty <= 5)  return 'text-amber-400';
    return 'text-white';
  }

  // ─────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────

  return (
    <div
      className="space-y-6 animate-in fade-in duration-500"
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl lg:text-4xl font-black text-white mb-1">
            {t('Global Inventory', 'المخزون العام')}
          </h1>
          <p className="text-slate-400 text-sm">
            {t('All products across all shops', 'جميع منتجات جميع المحلات')}
          </p>
        </div>
        <button
          onClick={loadData}
          aria-label={t('Refresh inventory', 'تحديث المخزون')}
          className="p-3 rounded-2xl bg-slate-800 border border-slate-700 hover:bg-slate-700 transition-all active:scale-95"
        >
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* ── Error State ── */}
      {error && !loading && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-5 flex items-start gap-3" role="alert">
          <AlertCircle size={20} className="text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-red-400 font-bold text-sm">{t('Failed to load data', 'فشل تحميل البيانات')}</p>
            <p className="text-red-400/70 text-xs mt-1 break-words">{error}</p>
          </div>
          <button
            onClick={loadData}
            aria-label={t('Retry', 'إعادة المحاولة')}
            className="shrink-0 px-4 py-2 rounded-xl bg-red-500/20 text-red-400 text-xs font-bold hover:bg-red-500/30 transition-all active:scale-95"
          >
            {t('Retry', 'إعادة المحاولة')}
          </button>
        </div>
      )}

      {/* ── KPI Row 1: Volume ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {
            label: t('Total Products', 'إجمالي المنتجات'),
            val: products.length,
            icon: Package,
            color: 'text-blue-400',
            bg: 'bg-blue-500/5',
          },
          {
            label: t('Total Quantity', 'إجمالي الكميات'),
            val: kpi.totalQty.toLocaleString(),
            icon: Boxes,
            color: 'text-emerald-400',
            bg: 'bg-emerald-500/5',
          },
          {
            label: t('Public', 'السوق العام'),
            val: kpi.pub,
            icon: Globe,
            color: 'text-emerald-400',
            bg: 'bg-emerald-500/5',
          },
          {
            label: t('Group / Shop Only', 'مجموعة / فرع'),
            val: kpi.grp + kpi.prv,
            icon: Users,
            color: 'text-amber-400',
            bg: 'bg-amber-500/5',
          },
        ].map((card, i) => (
          <div key={i} className={`${card.bg} border border-slate-800 rounded-2xl p-4 flex flex-col justify-between min-h-[76px]`}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-slate-500 text-[10px] font-bold uppercase tracking-widest truncate mr-1">{card.label}</span>
              <card.icon size={13} className={`${card.color} shrink-0`} />
            </div>
            <p className={`text-2xl font-black ${card.color} leading-tight`}>
              {loading ? <span className="inline-block w-10 h-6 bg-slate-800 rounded animate-pulse" /> : card.val}
            </p>
          </div>
        ))}
      </div>

      {/* ── KPI Row 2: Inventory Health ── */}
      <div className="grid grid-cols-3 gap-3">
        {[
          {
            label: t('Out of Stock', 'نفد المخزون'),
            val: kpi.outOfStock,
            icon: XCircle,
            color: 'text-red-400',
            bg: 'bg-red-500/5',
            border: 'border-red-500/10',
          },
          {
            label: t('Low Stock', 'مخزون منخفض'),
            val: kpi.lowStock,
            icon: TrendingDown,
            color: 'text-amber-400',
            bg: 'bg-amber-500/5',
            border: 'border-amber-500/10',
          },
          {
            label: t('Healthy Stock', 'مخزون جيد'),
            val: kpi.healthy,
            icon: CheckCircle2,
            color: 'text-emerald-400',
            bg: 'bg-emerald-500/5',
            border: 'border-emerald-500/10',
          },
        ].map((card, i) => (
          <div key={i} className={`${card.bg} border ${card.border} rounded-2xl p-4 flex flex-col justify-between min-h-[68px]`}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-slate-500 text-[10px] font-bold uppercase tracking-widest truncate mr-1">{card.label}</span>
              <card.icon size={13} className={`${card.color} shrink-0`} />
            </div>
            <p className={`text-xl font-black ${card.color} leading-tight`}>
              {loading ? <span className="inline-block w-8 h-5 bg-slate-800 rounded animate-pulse" /> : card.val}
            </p>
          </div>
        ))}
      </div>

      {/* ── Search ── */}
      <div className="relative">
        <Search
          className={`absolute top-1/2 -translate-y-1/2 ${isRTL ? 'right-4' : 'left-4'} text-slate-500 pointer-events-none`}
          size={16}
        />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t(
            'Search by part name, number, brand, model, shop, or scope...',
            'ابحث باسم القطعة أو رقمها أو الماركة أو الموديل أو المحل أو نطاق الرؤية...'
          )}
          aria-label={t('Search inventory', 'البحث في المخزون')}
          className={`w-full bg-slate-900 border border-slate-800 rounded-2xl ${isRTL ? 'pr-12 pl-4' : 'pl-12 pr-4'} py-4 outline-none text-white placeholder-slate-600 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm`}
        />
      </div>

      {/* ── Mobile Cards (< lg) ── */}
      <div className="lg:hidden space-y-3">
        {loading ? (
          [...Array(6)].map((_, i) => <SkeletonCard key={i} />)
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center bg-slate-900/40 rounded-3xl border border-dashed border-slate-800">
            <ShieldAlert size={36} className="mx-auto mb-3 text-slate-700" />
            <p className="text-slate-600 text-sm">{t('No matching results', 'لا توجد نتائج مطابقة')}</p>
          </div>
        ) : (
          filtered.map(p => (
            <div
              key={p.id}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 hover:border-slate-700 transition-colors"
              aria-label={t(`Product ${p.part_name}`, `منتج ${p.part_name}`)}
            >
              {/* Row 1: part number + scope badge */}
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-slate-400 text-xs">{p.part_number || '—'}</span>
                <ScopeBadge scope={effectiveScope(p.visibility_scope, shopMap[p.shop_id]?.visibility_mode)} isRTL={isRTL} />
              </div>

              {/* Row 2: product name */}
              <p className="text-white font-bold text-sm leading-snug">{p.part_name}</p>

              {/* Row 3: brand / model */}
              <p className="text-slate-500 text-xs">
                {[p.brand, p.model].filter(Boolean).join(' · ') || '—'}
              </p>

              {/* Row 4: shop + quantity */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Store size={12} className="text-emerald-500 shrink-0" />
                  <span className="text-slate-300 text-xs font-medium truncate">
                    {shopMap[p.shop_id]?.name ?? `#${p.shop_id}`}
                  </span>
                </div>
                <span className={`font-black text-base tabular-nums shrink-0 ${qtyColor(p.quantity)}`}>
                  {p.quantity}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* ── Desktop Table (≥ lg) ── */}
      <div className="hidden lg:block bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden">
        <table
          className="w-full"
          role="grid"
          aria-label={t('Global inventory table', 'جدول المخزون العام')}
        >
          <thead className="bg-slate-950">
            <tr className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">
              <th scope="col" className="p-4 text-right">{t('Part Number', 'رقم القطعة')}</th>
              <th scope="col" className="p-4 text-right">{t('Part Name', 'اسم القطعة')}</th>
              <th scope="col" className="p-4 text-right">{t('Brand', 'الماركة')}</th>
              <th scope="col" className="p-4 text-right">{t('Model', 'الموديل')}</th>
              <th scope="col" className="p-4 text-right">{t('Shop', 'المحل')}</th>
              <th scope="col" className="p-4 text-right">{t('Visibility', 'النطاق')}</th>
              <th scope="col" className="p-4 text-right">{t('Qty', 'الكمية')}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [...Array(8)].map((_, i) => <SkeletonRow key={i} />)
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-16 text-center text-slate-600 italic">
                  {t('No matching results', 'لا توجد نتائج مطابقة')}
                </td>
              </tr>
            ) : (
              filtered.map(p => (
                <tr
                  key={p.id}
                  className="border-t border-slate-800 hover:bg-slate-800/30 transition-colors"
                >
                  <td className="p-4 font-mono text-slate-300 text-sm">{p.part_number || '—'}</td>
                  <td className="p-4 font-semibold text-white">{p.part_name}</td>
                  <td className="p-4 text-slate-400 text-sm">{p.brand || '—'}</td>
                  <td className="p-4 text-slate-400 text-sm">{p.model || '—'}</td>
                  <td className="p-4">
                    <div className="flex items-center gap-1.5">
                      <Store size={13} className="text-emerald-500 shrink-0" />
                      <span className="text-slate-300 text-sm font-medium">
                        {shopMap[p.shop_id]?.name ?? `#${p.shop_id}`}
                      </span>
                    </div>
                  </td>
                  <td className="p-4">
                    <ScopeBadge scope={effectiveScope(p.visibility_scope, shopMap[p.shop_id]?.visibility_mode)} isRTL={isRTL} />
                  </td>
                  <td className="p-4">
                    <span className={`font-black text-base tabular-nums ${qtyColor(p.quantity)}`}>
                      {p.quantity}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── Result count footer ── */}
      {!loading && !error && (
        <p className="text-slate-600 text-xs text-center pb-2">
          {filtered.length === products.length
            ? `${products.length} ${t('products loaded', 'منتج محمّل')}`
            : `${filtered.length} ${t('of', 'من')} ${products.length} ${t('products', 'منتج')}`}
        </p>
      )}
    </div>
  );
}
