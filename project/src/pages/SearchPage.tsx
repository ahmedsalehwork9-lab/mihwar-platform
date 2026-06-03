import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

import {
  Search,
  Phone,
  Store,
  RefreshCw,
  Filter,
  Tag,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  X,
  PackageSearch,
  ChevronDown,
  Copy,
  Check,
} from 'lucide-react';

import { useLang } from '../context/LanguageContext';

// ─── Types ────────────────────────────────────────────────────────────────────

type Product = {
  id: number;
  part_name: string;
  part_number: string;
  brand: string;
  model: string;
  quantity: number;
  price: number;
  shop_id: number;
};

type Shop = {
  id: number;
  shop_name: string;
  phone: string;
};

// ─── Stock helpers ────────────────────────────────────────────────────────────

type StockStatus = 'in-stock' | 'low-stock' | 'out-of-stock';

function getStockStatus(qty: number): StockStatus {
  if (qty === 0) return 'out-of-stock';
  if (qty <= 5) return 'low-stock';
  return 'in-stock';
}

// ─── StockBadge ───────────────────────────────────────────────────────────────

function StockBadge({
  quantity,
  t,
}: {
  quantity: number;
  t: (en: string, ar: string) => string;
}) {
  const status = getStockStatus(quantity);

  const config = {
    'in-stock': {
      label: t('In Stock', 'متوفر'),
      cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    },
    'low-stock': {
      label: t('Low Stock', 'كمية منخفضة'),
      cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    },
    'out-of-stock': {
      label: t('Out of Stock', 'نفد المخزون'),
      cls: 'bg-red-500/10 text-red-400 border-red-500/20',
    },
  } as const;

  const { label, cls } = config[status];

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border ${cls}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}

// ─── CopyButton ───────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <button
      onClick={handleCopy}
      className="p-1.5 rounded-md text-slate-600 hover:text-slate-300 hover:bg-slate-800 transition-all active:scale-90"
      title="Copy"
    >
      {copied ? (
        <Check size={12} className="text-emerald-400" />
      ) : (
        <Copy size={12} />
      )}
    </button>
  );
}

// ─── ProductCard ──────────────────────────────────────────────────────────────

interface ProductCardProps {
  product: Product & { shop_name: string; shop_phone: string };
  inCart: boolean;
  cartQty: number;
  onAdd: () => void;
  onRemoveOne: () => void;
  t: (en: string, ar: string) => string;
}

function ProductCard({
  product: p,
  inCart,
  cartQty,
  onAdd,
  onRemoveOne,
  t,
}: ProductCardProps) {
  const status = getStockStatus(p.quantity);

  return (
    <div className="bg-slate-900 border border-slate-700/60 hover:border-slate-600 rounded-2xl overflow-hidden transition-colors duration-200 flex flex-col">

      {/* ── Card Header ── */}
      <div className="p-4 pb-3 flex-1">

        {/* Badges row */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <StockBadge quantity={p.quantity} t={t} />
          {inCart && (
            <span className="text-[10px] font-bold bg-blue-500/15 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full whitespace-nowrap">
              ×{cartQty} {t('in cart', 'في السلة')}
            </span>
          )}
        </div>

        {/* Part name — prominent */}
        <h2 className="text-[15px] font-bold text-white leading-snug mb-2">
          {p.part_name}
        </h2>

        {/* Part number chip + copy */}
        <div className="flex items-center gap-1 mb-3">
          <span className="font-mono text-[11px] text-slate-400 tracking-wide bg-slate-800/80 border border-slate-700/60 rounded-md px-2 py-0.5 select-all">
            {p.part_number}
          </span>
          <CopyButton text={p.part_number} />
        </div>

        {/* Meta rows */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-slate-400 text-xs min-w-0">
            <Tag size={12} className="text-blue-400 shrink-0" />
            <span className="font-semibold text-slate-300 truncate">{p.brand}</span>
            {p.model && (
              <>
                <span className="text-slate-700 shrink-0">·</span>
                <span className="truncate">{p.model}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2 text-slate-400 text-xs min-w-0">
            <Store size={12} className="text-emerald-400 shrink-0" />
            <span className="truncate">{p.shop_name}</span>
          </div>
          {p.shop_phone && p.shop_phone !== '-' && (
            <a
              href={`tel:${p.shop_phone}`}
              className="flex items-center gap-2 text-slate-400 text-xs hover:text-amber-400 transition-colors min-w-0"
            >
              <Phone size={12} className="text-amber-400 shrink-0" />
              <span dir="ltr" className="truncate">{p.shop_phone}</span>
            </a>
          )}
        </div>
      </div>

      {/* ── Divider ── */}
      <div className="mx-4 h-px bg-slate-800" />

      {/* ── Price / Qty / CTA ── */}
      <div className="p-4 pt-3">

        {/* Price + Quantity tiles */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="bg-slate-800/60 rounded-xl px-3 py-2.5 border border-slate-700/50">
            <p className="text-[10px] font-medium text-slate-500 mb-1 uppercase tracking-wide">
              {t('Unit Price', 'سعر الوحدة')}
            </p>
            <p className="text-[18px] font-black text-emerald-400 leading-none">
              {p.price.toLocaleString()}
            </p>
            <p className="text-[10px] font-semibold text-slate-500 mt-0.5">
              {t('SAR', 'ر.س')}
            </p>
          </div>
          <div className="bg-slate-800/60 rounded-xl px-3 py-2.5 border border-slate-700/50">
            <p className="text-[10px] font-medium text-slate-500 mb-1 uppercase tracking-wide">
              {t('Available', 'المتوفر')}
            </p>
            <p
              className={`text-[18px] font-black leading-none ${
                status === 'in-stock'
                  ? 'text-blue-400'
                  : status === 'low-stock'
                  ? 'text-amber-400'
                  : 'text-red-400'
              }`}
            >
              {p.quantity}
            </p>
            <p className="text-[10px] font-semibold text-slate-500 mt-0.5">
              {t('units', 'وحدة')}
            </p>
          </div>
        </div>

        {/* CTA */}
        {!inCart ? (
          <button
            onClick={onAdd}
            disabled={status === 'out-of-stock'}
            className="w-full h-12 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-600 disabled:cursor-not-allowed
                       active:scale-[0.97] transition-all font-bold text-sm flex items-center justify-center gap-2 text-white shadow-lg shadow-blue-900/20"
          >
            <ShoppingCart size={16} />
            {status === 'out-of-stock'
              ? t('Unavailable', 'غير متوفر')
              : t('Add to Cart', 'أضف للسلة')}
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={onRemoveOne}
              className="w-12 h-12 rounded-xl bg-slate-800 hover:bg-red-500/20 hover:text-red-400 border border-slate-700 active:scale-95
                         transition-all flex items-center justify-center text-slate-400 shrink-0"
            >
              {cartQty === 1 ? <Trash2 size={15} /> : <Minus size={15} />}
            </button>
            <div className="flex-1 h-12 rounded-xl bg-blue-600/10 border border-blue-500/30 flex items-center justify-center">
              <span className="text-sm font-bold text-blue-400">
                {cartQty} {t('in cart', 'في السلة')}
              </span>
            </div>
            <button
              onClick={onAdd}
              className="w-12 h-12 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-95 transition-all flex items-center justify-center text-white shadow-lg shadow-blue-900/20 shrink-0"
            >
              <Plus size={15} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── CartSheet ────────────────────────────────────────────────────────────────

interface CartSheetProps {
  cart: any[];
  total: number;
  onRemove: (id: number) => void;
  onChangeQty: (id: number, qty: number) => void;
  onCreateOrder: () => void;
  onClose: () => void;
  t: (en: string, ar: string) => string;
  isRTL: boolean;
}

function CartSheet({
  cart,
  total,
  onRemove,
  onChangeQty,
  onCreateOrder,
  onClose,
  t,
  isRTL,
}: CartSheetProps) {
  const sellerCount = new Set(cart.map((i) => i.shop_id)).size;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 z-40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sheet — sits above bottom-nav (bottom-[env(safe-area-inset-bottom)]) */}
      <div
        dir={isRTL ? 'rtl' : 'ltr'}
        className="fixed bottom-0 left-0 right-0 z-50 bg-slate-900 border-t border-slate-700/80 rounded-t-3xl shadow-2xl flex flex-col"
        style={{
          maxHeight: 'calc(100dvh - 64px)',        // never cover bottom nav
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-slate-700" />
        </div>

        {/* Sheet header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
              <ShoppingCart size={15} className="text-blue-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">
                {t('Order Cart', 'سلة الطلب')}
              </h3>
              <p className="text-[11px] text-slate-500">
                {cart.length} {t('items', 'أصناف')} ·{' '}
                {sellerCount}{' '}
                {t(
                  sellerCount === 1 ? 'seller' : 'sellers',
                  sellerCount === 1 ? 'مورد' : 'موردين'
                )}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-all"
          >
            <X size={17} />
          </button>
        </div>

        {/* Scrollable items list */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-3 space-y-2.5">
          {cart.map((item) => (
            <div
              key={item.id}
              className="bg-slate-800/50 border border-slate-700/60 rounded-xl p-3.5"
            >
              {/* Item header */}
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white leading-snug line-clamp-2">
                    {item.part_name}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5 font-mono">
                    {item.part_number}
                  </p>
                </div>
                <button
                  onClick={() => onRemove(item.id)}
                  className="text-slate-600 hover:text-red-400 transition-colors p-1.5 rounded-lg hover:bg-red-500/10 shrink-0"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              {/* Qty + line total */}
              <div className="flex items-center justify-between gap-3">
                {/* Stepper */}
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => onChangeQty(item.id, item.quantity - 1)}
                    className="w-9 h-9 rounded-xl bg-slate-700 hover:bg-slate-600 flex items-center justify-center text-slate-300 transition-colors active:scale-95 shrink-0"
                  >
                    <Minus size={13} />
                  </button>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="1"
                    value={item.quantity}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      onChangeQty(item.id, v > 0 ? v : 1);
                    }}
                    className="w-12 h-9 rounded-xl bg-slate-700 border border-slate-600 text-center text-white text-sm font-bold focus:outline-none focus:border-blue-500 transition-colors"
                  />
                  <button
                    onClick={() => onChangeQty(item.id, item.quantity + 1)}
                    className="w-9 h-9 rounded-xl bg-slate-700 hover:bg-slate-600 flex items-center justify-center text-slate-300 transition-colors active:scale-95 shrink-0"
                  >
                    <Plus size={13} />
                  </button>
                </div>

                {/* Line total */}
                <div className="text-right shrink-0">
                  <p className="text-[10px] text-slate-500">
                    {item.price.toLocaleString()} {t('× qty', '× الكمية')}
                  </p>
                  <p className="text-base font-black text-emerald-400">
                    {(item.price * item.quantity).toLocaleString()}{' '}
                    <span className="text-[11px] font-semibold text-slate-400">
                      {t('SAR', 'ر.س')}
                    </span>
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* ── Sticky footer: total + CTA — always visible ── */}
        <div className="shrink-0 px-4 pt-3 pb-4 border-t border-slate-800 bg-slate-900 space-y-3">
          {/* Total row */}
          <div className="flex items-center justify-between px-1">
            <span className="text-sm font-semibold text-slate-400">
              {t('Order Total', 'إجمالي الطلب')}
            </span>
            <div className="text-right">
              <span className="text-2xl font-black text-emerald-400">
                {total.toLocaleString()}
              </span>
              <span className="text-[13px] font-semibold text-slate-400 ms-1">
                {t('SAR', 'ر.س')}
              </span>
            </div>
          </div>

          {/* Create Order button */}
          <button
            onClick={onCreateOrder}
            className="w-full h-14 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98]
                       transition-all font-bold text-base text-white flex items-center justify-center gap-2.5 shadow-lg shadow-emerald-900/30"
          >
            <ShoppingCart size={18} />
            {t('Confirm & Place Order', 'تأكيد وإنشاء الطلب')}
          </button>
        </div>
      </div>
    </>
  );
}

// ─── SearchPage ───────────────────────────────────────────────────────────────

export default function SearchPage() {
  const { lang, isRTL, t } = useLang();
  const { ownedShopId } = useAuth();

  const [products, setProducts] = useState<Product[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [brandFilter, setBrandFilter] = useState('all');
  const [cart, setCart] = useState<any[]>([]);
  const [showCart, setShowCart] = useState(false);

  useEffect(() => {
    fetchData();
  }, [ownedShopId]);

  // ── Supabase queries — UNCHANGED ──────────────────────────────────────────
  const fetchData = async () => {
    try {
      setLoading(true);

      let productsQuery = supabase
        .from('products')
        .select('*')
        .gt('quantity', 0)
        .order('created_at', { ascending: false });

      if (ownedShopId) {
        productsQuery = productsQuery.neq('shop_id', ownedShopId);
      }

      const { data: productsData, error: productsError } = await productsQuery;
      if (productsError) console.error('خطأ في جلب المنتجات:', productsError);

      const fetchedProducts: Product[] = productsData || [];
      const shopIds = [...new Set(fetchedProducts.map((p) => p.shop_id))];

      let fetchedShops: Shop[] = [];
      if (shopIds.length > 0) {
        const { data: shopsData, error: shopsError } = await supabase
          .from('shops')
          .select('id, shop_name, phone')
          .in('id', shopIds);
        if (shopsError) console.error('خطأ في جلب المحلات:', shopsError);
        fetchedShops = shopsData || [];
      }

      setProducts(fetchedProducts);
      setShops(fetchedShops);
    } catch (error) {
      console.error('[SearchPage] fetchData exception:', error);
    } finally {
      setLoading(false);
    }
  };

  // ── Cart logic — UNCHANGED ────────────────────────────────────────────────
  const addToCart = (product: any) => {
    const exists = cart.find((item) => item.id === product.id);
    if (exists) {
      setCart(
        cart.map((item) =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      );
    } else {
      setCart([...cart, { ...product, quantity: 1 }]);
    }
  };

  const removeFromCart = (id: number) => {
    setCart(cart.filter((item) => item.id !== id));
  };

  const changeCartQty = (id: number, qty: number) => {
    if (qty <= 0) {
      removeFromCart(id);
      return;
    }
    setCart(
      cart.map((item) => (item.id === id ? { ...item, quantity: qty } : item))
    );
  };

  const total = cart.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  // ── createOrder — UNCHANGED ───────────────────────────────────────────────
  const createOrder = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        alert(t('You must be logged in', 'يجب تسجيل الدخول'));
        return;
      }

      const { data: myShop, error: shopError } = await supabase
        .from('shops')
        .select('*')
        .eq('owner_id', user.id)
        .single();
      if (shopError || !myShop) {
        console.error(shopError);
        alert(t('Shop not found', 'المحل غير موجود'));
        return;
      }

      const grouped: any = {};
      cart.forEach((item) => {
        if (!grouped[item.shop_id]) grouped[item.shop_id] = [];
        grouped[item.shop_id].push(item);
      });

      for (const shopId in grouped) {
        const items = grouped[shopId];
        const orderTotal = items.reduce(
          (sum: number, item: any) => sum + item.price * item.quantity,
          0
        );

        const { data: order, error: orderError } = await supabase
          .from('orders')
          .insert({
            from_shop_id: myShop.id,
            to_shop_id: Number(shopId),
            status: 'pending',
            total_amount: orderTotal,
          })
          .select()
          .single();
        if (orderError || !order) {
          console.error('ORDER ERROR:', orderError);
          continue;
        }

        const orderItems = items.map((item: any) => ({
          order_id: order.id,
          product_id: item.id,
          quantity: item.quantity,
          price: item.price,
        }));
        const { error: itemsError } = await supabase
          .from('order_items')
          .insert(orderItems);
        if (itemsError) console.error('ITEMS ERROR:', itemsError);

        const { error: notificationError } = await supabase
          .from('notifications')
          .insert({
            shop_id: Number(order.to_shop_id),
            title: 'طلب جديد',
            message: `تم استلام طلب جديد رقم #${order.id}`,
            type: 'new_order',
          });
        if (notificationError)
          console.error('NOTIFICATION ERROR:', notificationError);
      }

      setCart([]);
      setShowCart(false);
      alert(t('Order created successfully', 'تم إنشاء الطلب بنجاح'));
    } catch (error: any) {
      console.error('CREATE ORDER ERROR:', error);
      alert(
        error?.message ||
          t(
            'An error occurred while creating the order',
            'حدث خطأ أثناء إنشاء الطلب'
          )
      );
    }
  };

  // ── Merged products (memoized) ────────────────────────────────────────────
  const mergedProducts = useMemo(() => {
    return products.map((p) => {
      const shop = shops.find((s) => String(s.id) === String(p.shop_id));
      return {
        ...p,
        shop_name: shop?.shop_name ?? t('Unknown Shop', 'محل غير معروف'),
        shop_phone: shop?.phone ?? '-',
      };
    });
  }, [products, shops, lang]);

  // ── Filter ────────────────────────────────────────────────────────────────
  const brands = [
    'all',
    ...new Set(mergedProducts.map((p) => p.brand).filter(Boolean)),
  ];

  const filtered = mergedProducts.filter((p) => {
    const matchesQuery =
      query === '' ||
      p.part_name?.toLowerCase().includes(query.toLowerCase()) ||
      p.part_number?.toLowerCase().includes(query.toLowerCase()) ||
      p.model?.toLowerCase().includes(query.toLowerCase());
    const matchesBrand = brandFilter === 'all' || p.brand === brandFilter;
    return matchesQuery && matchesBrand;
  });

  // ── Stats ─────────────────────────────────────────────────────────────────
  const statsFiltered = {
    products: filtered.length,
    brands: new Set(filtered.map((p) => p.brand).filter(Boolean)).size,
    shops: new Set(filtered.map((p) => p.shop_id)).size,
  };

  const cartTotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const cartItemCount = cart.reduce((s, i) => s + i.quantity, 0);

  // ── Bottom padding: leaves room for cart bar + bottom nav ─────────────────
  // Bottom nav is typically ~56–64 px; cart bar is 64 px; add safe-area.
  const bottomPad = cart.length > 0 && !showCart
    ? 'pb-[calc(64px+64px+env(safe-area-inset-bottom,16px))]'
    : 'pb-[calc(64px+env(safe-area-inset-bottom,16px))]';

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div
      className={`max-w-7xl mx-auto px-3 sm:px-4 ${bottomPad}`}
      dir={isRTL ? 'rtl' : 'ltr'}
    >

      {/* ── Search header card ──────────────────────────────────────── */}
      <div className="bg-slate-900 border border-slate-700/60 rounded-2xl p-4 mb-3 mt-2">

        {/* Title row */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-center justify-center shrink-0">
              <Search size={16} className="text-blue-400" />
            </div>
            <div className="min-w-0">
              <h1 className="text-[15px] font-bold text-white truncate">
                {t('Spare Parts Search', 'بحث قطع الغيار')}
              </h1>
              <p className="text-[11px] text-slate-500">
                {loading
                  ? t('Loading…', 'جاري التحميل…')
                  : t(`${filtered.length} results`, `${filtered.length} نتيجة`)}
              </p>
            </div>
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            className="h-9 px-3 rounded-xl border border-slate-700 hover:border-slate-500 text-slate-400
                       flex items-center gap-1.5 transition-all text-xs font-medium disabled:opacity-50 shrink-0 ms-2"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            <span className="hidden xs:inline">{t('Refresh', 'تحديث')}</span>
          </button>
        </div>

        {/* Search input */}
        <div className="relative mb-3">
          {/* Icon flips based on direction */}
          <Search
            size={15}
            className={`absolute top-1/2 -translate-y-1/2 ${
              isRTL ? 'right-3.5' : 'left-3.5'
            } text-slate-500 pointer-events-none`}
          />
          <input
            type="search"
            inputMode="search"
            autoComplete="off"
            placeholder={t(
              'Search by part name or number…',
              'ابحث باسم القطعة أو رقمها…'
            )}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className={`w-full bg-slate-950 border border-slate-700 rounded-xl h-12 text-sm text-white
                       ${isRTL ? 'pr-10 pl-10' : 'pl-10 pr-10'}
                       placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors`}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className={`absolute top-1/2 -translate-y-1/2 ${
                isRTL ? 'left-3' : 'right-3'
              } text-slate-500 hover:text-slate-300 transition-colors p-1`}
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Brand filter chips */}
        {brands.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1">
            {brands.map((brand) => (
              <button
                key={brand}
                onClick={() => setBrandFilter(brand)}
                className={`flex-shrink-0 h-8 px-3.5 rounded-full text-xs font-semibold border transition-all ${
                  brandFilter === brand
                    ? 'bg-blue-600 border-blue-500 text-white'
                    : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200'
                }`}
              >
                {brand === 'all' ? t('All Brands', 'كل الماركات') : brand}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Stats bar ──────────────────────────────────────────────── */}
      {!loading && filtered.length > 0 && (
        <div className="grid grid-cols-3 gap-2 mb-3">
          {[
            {
              value: statsFiltered.products,
              label: t('Parts', 'قطع'),
              color: 'text-blue-400',
            },
            {
              value: statsFiltered.brands,
              label: t('Brands', 'ماركات'),
              color: 'text-violet-400',
            },
            {
              value: statsFiltered.shops,
              label: t('Shops', 'محلات'),
              color: 'text-emerald-400',
            },
          ].map(({ value, label, color }) => (
            <div
              key={label}
              className="bg-slate-900 border border-slate-700/60 rounded-xl p-3 text-center"
            >
              <p className={`text-[22px] font-black leading-none ${color}`}>
                {value}
              </p>
              <p className="text-[10px] text-slate-500 mt-0.5 leading-tight">
                {label}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* ── Loading state ───────────────────────────────────────────── */}
      {loading && (
        <div className="bg-slate-900 border border-slate-700/60 rounded-2xl py-16 flex flex-col items-center gap-3">
          <RefreshCw size={24} className="animate-spin text-blue-500" />
          <p className="text-sm text-slate-400">
            {t('Loading spare parts…', 'جاري تحميل قطع الغيار…')}
          </p>
        </div>
      )}

      {/* ── Empty state ─────────────────────────────────────────────── */}
      {!loading && filtered.length === 0 && (
        <div className="bg-slate-900 border border-slate-700/60 rounded-2xl py-16 flex flex-col items-center gap-3 text-center px-6">
          <div className="w-14 h-14 rounded-2xl bg-slate-800 flex items-center justify-center">
            <PackageSearch size={26} className="text-slate-500" />
          </div>
          <div>
            <p className="text-base font-bold text-white mb-1">
              {query
                ? t(
                    'No matching spare parts found',
                    'لا توجد قطع تطابق بحثك'
                  )
                : t('No spare parts available', 'لا توجد قطع غيار متاحة')}
            </p>
            <p className="text-sm text-slate-500">
              {query
                ? t(
                    'Try a different part name or number',
                    'جرب اسماً أو رقماً مختلفاً'
                  )
                : t(
                    'Check back later or try refreshing',
                    'حاول مجدداً أو اضغط تحديث'
                  )}
            </p>
          </div>
          {query && (
            <button
              onClick={() => setQuery('')}
              className="mt-1 h-9 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sm text-slate-300 transition-colors"
            >
              {t('Clear search', 'مسح البحث')}
            </button>
          )}
        </div>
      )}

      {/* ── Products grid ───────────────────────────────────────────── */}
      {!loading && filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((p) => {
            const cartItem = cart.find((c) => c.id === p.id);
            return (
              <ProductCard
                key={p.id}
                product={p}
                inCart={!!cartItem}
                cartQty={cartItem?.quantity ?? 0}
                onAdd={() => addToCart(p)}
                onRemoveOne={() =>
                  changeCartQty(p.id, (cartItem?.quantity ?? 1) - 1)
                }
                t={t}
              />
            );
          })}
        </div>
      )}

      {/* ── Floating cart bar — above bottom nav ────────────────────── */}
      {cart.length > 0 && !showCart && (
        <div
          className="fixed left-0 right-0 z-40 px-3"
          style={{
            bottom: 'calc(64px + env(safe-area-inset-bottom, 0px))',
          }}
        >
          <button
            onClick={() => setShowCart(true)}
            className="w-full h-16 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98]
                       transition-all shadow-2xl shadow-emerald-900/50 flex items-center justify-between px-5 font-bold text-white"
          >
            {/* Left: icon + labels */}
            <div className="flex items-center gap-3">
              <div className="relative shrink-0">
                <ShoppingCart size={21} />
                <span className="absolute -top-2 -right-2 w-5 h-5 bg-white text-emerald-700 rounded-full text-[10px] font-black flex items-center justify-center leading-none">
                  {cart.length}
                </span>
              </div>
              <div className={isRTL ? 'text-right' : 'text-left'}>
                <p className="text-sm font-bold leading-none">
                  {t('View Cart', 'عرض السلة')}
                </p>
                <p className="text-[11px] text-emerald-200 mt-0.5">
                  {cartItemCount} {t('items', 'قطعة')}
                </p>
              </div>
            </div>

            {/* Right: total */}
            <div className={isRTL ? 'text-left' : 'text-right'}>
              <p className="text-lg font-black leading-none">
                {cartTotal.toLocaleString()}
              </p>
              <p className="text-[11px] text-emerald-200 mt-0.5">
                {t('SAR', 'ر.س')}
              </p>
            </div>
          </button>
        </div>
      )}

      {/* ── Cart sheet ──────────────────────────────────────────────── */}
      {showCart && (
        <CartSheet
          cart={cart}
          total={total}
          onRemove={removeFromCart}
          onChangeQty={changeCartQty}
          onCreateOrder={createOrder}
          onClose={() => setShowCart(false)}
          t={t}
          isRTL={isRTL}
        />
      )}
    </div>
  );
}
