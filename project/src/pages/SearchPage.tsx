import { useEffect, useMemo, useState, useCallback, memo } from 'react';
import { supabase } from '../lib/supabase';
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
  Package,
  ChevronDown,
  ChevronUp,
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

type StockStatus = 'in-stock' | 'low-stock' | 'out-of-stock';

// ─── Pure Helpers ─────────────────────────────────────────────────────────────

function getStockStatus(qty: number): StockStatus {
  if (qty === 0) return 'out-of-stock';
  if (qty <= 5) return 'low-stock';
  return 'in-stock';
}

// ─── Memoized Sub-components ──────────────────────────────────────────────────

const StockBadge = memo(({ quantity, t }: { quantity: number; t: any }) => {
  const status = getStockStatus(quantity);
  const config = {
    'in-stock': {
      label: t('In Stock', 'متوفر'),
      dot: 'bg-emerald-400',
      cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    },
    'low-stock': {
      label: t('Low', 'منخفض'),
      dot: 'bg-amber-400',
      cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    },
    'out-of-stock': {
      label: t('Out', 'نفد'),
      dot: 'bg-red-400',
      cls: 'bg-red-500/10 text-red-400 border-red-500/20',
    },
  }[status];

  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap ${config.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${config.dot}`} />
      {config.label}
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
      aria-label="Copy part number"
    >
      {copied ? <Check size={11} /> : <Copy size={11} />}
    </button>
  );
});

const QtyControl = memo(({
  inCart,
  cartQty,
  isOutOfStock,
  onAdd,
  onRemoveOne,
  t,
}: {
  inCart: boolean;
  cartQty: number;
  isOutOfStock: boolean;
  onAdd: () => void;
  onRemoveOne: () => void;
  t: any;
}) => {
  if (!inCart) {
    return (
      <button
        onClick={onAdd}
        disabled={isOutOfStock}
        className="h-9 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 active:scale-95 disabled:bg-slate-800 disabled:text-slate-600 font-bold text-xs text-white transition-all flex items-center gap-1.5"
      >
        <Plus size={13} /> {t('Add', 'إضافة')}
      </button>
    );
  }

  return (
    <div className="flex items-center bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
      <button
        onClick={onRemoveOne}
        className="w-8 h-8 flex items-center justify-center text-slate-300 hover:bg-slate-700 active:bg-slate-600 transition-colors"
      >
        {cartQty === 1 ? <Trash2 size={13} className="text-red-400" /> : <Minus size={13} />}
      </button>
      <span className="w-8 text-center text-xs font-black text-white tabular-nums select-none">{cartQty}</span>
      <button
        onClick={onAdd}
        className="w-8 h-8 flex items-center justify-center text-white hover:bg-blue-600 active:bg-blue-700 bg-blue-700/50 transition-colors"
      >
        <Plus size={13} />
      </button>
    </div>
  );
});

const ProductCard = memo(({
  product: p,
  inCart,
  cartQty,
  onAdd,
  onRemoveOne,
  t,
}: {
  product: Product & { shop_name: string; shop_phone: string };
  inCart: boolean;
  cartQty: number;
  onAdd: () => void;
  onRemoveOne: () => void;
  t: any;
}) => {
  const isOutOfStock = p.quantity === 0;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 flex flex-col gap-2.5 shadow-sm active:scale-[0.99] transition-transform">

      {/* Row 1: Name + stock badge */}
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-white font-bold text-sm leading-snug flex-1 min-w-0 line-clamp-2">
          {p.part_name}
        </h3>
        <StockBadge quantity={p.quantity} t={t} />
      </div>

      {/* Row 2: Part number */}
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-[11px] text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800 truncate max-w-[10rem]">
          {p.part_number}
        </span>
        <CopyButton text={p.part_number} />
      </div>

      {/* Row 3: meta */}
      <div className="flex items-center gap-x-3 gap-y-1 flex-wrap text-[11px] text-slate-400">
        {(p.brand || p.model) && (
          <div className="flex items-center gap-1">
            <Tag size={11} className="text-blue-500 shrink-0" />
            <span className="truncate">{[p.brand, p.model].filter(Boolean).join(' · ')}</span>
          </div>
        )}
        <div className="flex items-center gap-1">
          <Store size={11} className="text-emerald-500 shrink-0" />
          <span className="truncate max-w-[8rem]">{p.shop_name}</span>
        </div>
        <div className="flex items-center gap-1">
          <Package size={11} className="text-slate-500 shrink-0" />
          <span className="tabular-nums">
            {t('Qty', 'الكمية')}: <strong className={p.quantity <= 5 ? 'text-amber-400' : 'text-slate-200'}>{p.quantity}</strong>
          </span>
        </div>
      </div>

      {/* Row 4: price + action */}
      <div className="flex items-center justify-between pt-2.5 border-t border-slate-800/60 mt-0.5">
        <div>
          <span className="text-[10px] text-slate-500 block leading-none mb-1">
            {t('Unit Price', 'سعر الوحدة')}
          </span>
          <span className="text-lg font-black text-white tabular-nums leading-none">
            {p.price.toLocaleString()}
            <span className="text-[11px] font-medium text-slate-500 mr-0.5">ر.س</span>
          </span>
        </div>
        <QtyControl
          inCart={inCart}
          cartQty={cartQty}
          isOutOfStock={isOutOfStock}
          onAdd={onAdd}
          onRemoveOne={onRemoveOne}
          t={t}
        />
      </div>
    </div>
  );
});

// ─── Cart Item ────────────────────────────────────────────────────────────────

const CartItem = memo(({
  item,
  onRemove,
  onChangeQty,
  t,
}: {
  item: any;
  onRemove: () => void;
  onChangeQty: (qty: number) => void;
  t: any;
}) => (
  <div className="bg-slate-800/50 border border-slate-800 rounded-2xl p-3.5">
    <div className="flex items-start justify-between gap-2 mb-2.5">
      <div className="flex-1 min-w-0">
        <p className="text-white font-bold text-sm leading-snug line-clamp-2">{item.part_name}</p>
        <p className="text-[10px] text-slate-500 font-mono mt-0.5 truncate">{item.part_number}</p>
      </div>
      <button
        onClick={onRemove}
        className="p-1.5 rounded-lg bg-slate-800 text-slate-500 hover:text-red-400 hover:bg-red-500/10 active:scale-90 transition-all shrink-0"
      >
        <Trash2 size={14} />
      </button>
    </div>

    <div className="flex items-center justify-between">
      {/* qty control */}
      <div className="flex items-center bg-slate-900 rounded-xl border border-slate-700 overflow-hidden">
        <button
          onClick={() => onChangeQty(item.quantity - 1)}
          className="w-9 h-9 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 active:bg-slate-700 transition-colors"
        >
          <Minus size={13} />
        </button>
        <span className="w-10 text-center text-sm font-black text-white tabular-nums select-none">
          {item.quantity}
        </span>
        <button
          onClick={() => onChangeQty(item.quantity + 1)}
          className="w-9 h-9 flex items-center justify-center text-white bg-blue-700/40 hover:bg-blue-600 active:bg-blue-700 transition-colors"
        >
          <Plus size={13} />
        </button>
      </div>

      {/* line total */}
      <div className="text-end">
        <p className="text-[10px] text-slate-500 leading-none mb-1">{t('Total', 'الإجمالي')}</p>
        <p className="text-base font-black text-emerald-400 tabular-nums leading-none">
          {(item.price * item.quantity).toLocaleString()}
          <span className="text-[10px] font-normal text-slate-500 mr-0.5">ر.س</span>
        </p>
      </div>
    </div>
  </div>
));

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SearchPage() {
  const { isRTL, t } = useLang();
  const { ownedShopId } = useAuth();

  const [products, setProducts]   = useState<Product[]>([]);
  const [shops, setShops]         = useState<Shop[]>([]);
  const [loading, setLoading]     = useState(false);
  const [query, setQuery]         = useState('');
  const [brandFilter, setBrandFilter] = useState('all');
  const [cart, setCart]           = useState<any[]>([]);
  const [showCart, setShowCart]   = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      let productsQuery = supabase
        .from('products')
        .select('*')
        .gt('quantity', 0)
        .order('created_at', { ascending: false });

      if (ownedShopId) productsQuery = productsQuery.neq('shop_id', ownedShopId);

      const { data: productsData, error: productsError } = await productsQuery;
      if (productsError) throw productsError;

      const fetchedProducts: Product[] = productsData || [];
      const shopIds = [...new Set(fetchedProducts.map(p => p.shop_id))];

      let fetchedShops: Shop[] = [];
      if (shopIds.length > 0) {
        const { data: shopsData, error: shopsError } = await supabase
          .from('shops')
          .select('id, shop_name, phone')
          .in('id', shopIds);
        if (shopsError) throw shopsError;
        fetchedShops = shopsData || [];
      }

      setProducts(fetchedProducts);
      setShops(fetchedShops);
    } catch (error) {
      console.error('[SearchPage] fetchData error:', error);
    } finally {
      setLoading(false);
    }
  }, [ownedShopId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Cart helpers ───────────────────────────────────────────────────────────

  const addToCart = useCallback((product: any) => {
    setCart(prev => {
      const exists = prev.find(item => item.id === product.id);
      if (exists) return prev.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      return [...prev, { ...product, quantity: 1 }];
    });
  }, []);

  const removeFromCart = useCallback((id: number) => {
    setCart(prev => prev.filter(item => item.id !== id));
  }, []);

  const changeCartQty = useCallback((id: number, qty: number) => {
    if (qty <= 0) { removeFromCart(id); return; }
    setCart(prev => prev.map(item => item.id === id ? { ...item, quantity: qty } : item));
  }, [removeFromCart]);

  // ── Order creation — unchanged logic ──────────────────────────────────────

  const createOrder = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return alert(t('Please login first', 'يرجى تسجيل الدخول أولاً'));

      const { data: myShop, error: shopError } = await supabase
        .from('shops')
        .select('*')
        .eq('owner_id', user.id)
        .single();
      if (shopError || !myShop) throw new Error('Shop not found');

      const grouped: Record<number, any[]> = {};
      cart.forEach(item => {
        if (!grouped[item.shop_id]) grouped[item.shop_id] = [];
        grouped[item.shop_id].push(item);
      });

      for (const shopId in grouped) {
        const items = grouped[shopId];
        const orderTotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

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
        if (orderError) throw orderError;

        const { error: itemsError } = await supabase
          .from('order_items')
          .insert(
            items.map(item => ({
              order_id: order.id,
              product_id: item.id,
              quantity: item.quantity,
              price: item.price,
            }))
          );
        if (itemsError) throw itemsError;

        await supabase.from('notifications').insert({
          shop_id: Number(order.to_shop_id),
          title: 'طلب جديد',
          message: `طلب جديد #${order.id}`,
          type: 'new_order',
        });
      }

      setCart([]);
      setShowCart(false);
      alert(t('Order placed successfully!', 'تم إرسال الطلب بنجاح!'));
    } catch (error: any) {
      alert(error.message || t('Error creating order', 'خطأ في إنشاء الطلب'));
    }
  };

  // ── Derived data ───────────────────────────────────────────────────────────

  // Build a shop map once to avoid re-finding on every render
  const shopMap = useMemo(() => {
    const m: Record<number, Shop> = {};
    shops.forEach(s => { m[s.id] = s; });
    return m;
  }, [shops]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return products
      .map(p => ({
        ...p,
        shop_name: shopMap[p.shop_id]?.shop_name ?? '—',
        shop_phone: shopMap[p.shop_id]?.phone ?? '—',
      }))
      .filter(p => {
        const matchesQuery =
          !q ||
          p.part_name.toLowerCase().includes(q) ||
          p.part_number.toLowerCase().includes(q) ||
          p.model.toLowerCase().includes(q);
        const matchesBrand = brandFilter === 'all' || p.brand === brandFilter;
        return matchesQuery && matchesBrand;
      });
  }, [products, shopMap, query, brandFilter]);

  const brands = useMemo(
    () => ['all', ...new Set(products.map(p => p.brand).filter(Boolean))],
    [products]
  );

  const cartItemCount  = useMemo(() => cart.reduce((s, i) => s + i.quantity, 0), [cart]);
  const cartTotal      = useMemo(() => cart.reduce((s, i) => s + i.price * i.quantity, 0), [cart]);
  const cartShopCount  = useMemo(() => new Set(cart.map(i => i.shop_id)).size, [cart]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      className="max-w-4xl mx-auto px-3 pt-3 min-h-screen"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 5.5rem)' }}
      dir={isRTL ? 'rtl' : 'ltr'}
    >

      {/* ── Sticky Search + Brand Filter ──────────────────────────────────── */}
      <div className="sticky top-0 z-30 pb-3 bg-slate-950/90 backdrop-blur-md">
        {/* Search input */}
        <div className="relative pt-1">
          <Search
            className={`absolute top-1/2 -translate-y-1/2 ${isRTL ? 'right-4' : 'left-4'} text-slate-500 pointer-events-none`}
            size={17}
          />
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={t('Part name or number...', 'اسم القطعة أو رقمها...')}
            className={`w-full h-13 bg-slate-900 border border-slate-800 rounded-2xl ${isRTL ? 'pr-11 pl-12' : 'pl-11 pr-12'} text-white focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition-all outline-none text-sm shadow-lg`}
            style={{ height: '52px' }}
          />
          {loading && (
            <RefreshCw
              size={15}
              className={`absolute top-1/2 -translate-y-1/2 ${isRTL ? 'left-4' : 'right-4'} text-blue-500 animate-spin`}
            />
          )}
        </div>

        {/* Brand chips */}
        <div className="flex gap-2 overflow-x-auto py-2.5 no-scrollbar">
          {brands.map(b => (
            <button
              key={b}
              onClick={() => setBrandFilter(b)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold border transition-all whitespace-nowrap active:scale-95 ${
                brandFilter === b
                  ? 'bg-blue-600 border-blue-600 text-white shadow-sm shadow-blue-900/40'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
              }`}
            >
              {b === 'all' ? t('All', 'الكل') : b}
            </button>
          ))}
        </div>

        {/* Result count */}
        {!loading && query && (
          <p className="text-[11px] text-slate-500 px-1 pb-1">
            {filtered.length} {t('results', 'نتيجة')}
          </p>
        )}
      </div>

      {/* ── Products Grid ──────────────────────────────────────────────────── */}
      {filtered.length === 0 && !loading ? (
        <div className="py-24 text-center flex flex-col items-center gap-4 opacity-40">
          <PackageSearch size={56} className="text-slate-500" />
          <p className="text-sm font-medium text-slate-400">
            {t('No parts found', 'لا توجد نتائج مطابقة')}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {filtered.map(p => (
            <ProductCard
              key={p.id}
              product={p as any}
              inCart={cart.some(c => c.id === p.id)}
              cartQty={cart.find(c => c.id === p.id)?.quantity ?? 0}
              onAdd={() => addToCart(p)}
              onRemoveOne={() => changeCartQty(p.id, (cart.find(c => c.id === p.id)?.quantity ?? 0) - 1)}
              t={t}
            />
          ))}
        </div>
      )}

      {/* ── Floating Cart Bar ─────────────────────────────────────────────── */}
      {cart.length > 0 && !showCart && (
        <div
          className="fixed left-0 right-0 z-40 px-3"
          style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 4.75rem)' }}
        >
          <button
            onClick={() => setShowCart(true)}
            className="w-full bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 active:scale-[0.99] text-white rounded-2xl flex items-center justify-between px-5 shadow-2xl shadow-emerald-950/60 transition-all"
            style={{ height: '60px' }}
          >
            <div className="flex items-center gap-3.5">
              <div className="relative shrink-0">
                <ShoppingCart size={22} />
                <span className="absolute -top-2 -right-2 bg-white text-emerald-700 text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center tabular-nums shadow-sm">
                  {cartItemCount}
                </span>
              </div>
              <div className={isRTL ? 'text-right' : 'text-left'}>
                <p className="text-sm font-black leading-tight">{t('View Cart', 'عرض السلة')}</p>
                <p className="text-[10px] opacity-75 font-semibold">
                  {cartShopCount} {t('Sellers', 'موردين')}
                </p>
              </div>
            </div>
            <div className={isRTL ? 'text-left' : 'text-right'}>
              <p className="text-lg font-black leading-tight tabular-nums">{cartTotal.toLocaleString()}</p>
              <p className="text-[10px] opacity-75 font-semibold">SAR</p>
            </div>
          </button>
        </div>
      )}

      {/* ── Cart Bottom Sheet ─────────────────────────────────────────────── */}
      {showCart && (
        <div className="fixed inset-0 z-50 flex items-end" dir={isRTL ? 'rtl' : 'ltr'}>
          {/* backdrop */}
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => setShowCart(false)}
          />

          {/* sheet */}
          <div
            className="relative w-full bg-slate-900 rounded-t-[1.75rem] border-t border-slate-800 shadow-2xl flex flex-col"
            style={{ maxHeight: 'calc(94vh - env(safe-area-inset-top, 0px))' }}
          >
            {/* drag handle */}
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-12 h-1.5 rounded-full bg-slate-700" />
            </div>

            {/* sheet header */}
            <div className="px-5 py-3 flex justify-between items-center border-b border-slate-800 shrink-0">
              <div className="flex items-center gap-2">
                <ShoppingCart size={18} className="text-emerald-400" />
                <h3 className="text-lg font-black text-white">{t('Cart', 'السلة')}</h3>
              </div>
              <button
                onClick={() => setShowCart(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-800 text-slate-400 hover:text-white active:scale-90 transition-all"
              >
                <X size={16} />
              </button>
            </div>

            {/* ── Order Summary Banner ──────────────────────────────────── */}
            <div className="px-4 pt-3 pb-2 shrink-0">
              <button
                onClick={() => setSummaryOpen(v => !v)}
                className="w-full bg-slate-800/70 border border-slate-700/60 rounded-2xl px-4 py-3 flex items-center justify-between transition-colors hover:border-slate-600 active:bg-slate-800"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                    <Package size={14} className="text-emerald-400" />
                  </div>
                  <div className={isRTL ? 'text-right' : 'text-left'}>
                    <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider leading-none mb-0.5">
                      {t('Order Summary', 'ملخص الطلب')}
                    </p>
                    <p className="text-white font-black text-base tabular-nums leading-none">
                      {cartTotal.toLocaleString()}
                      <span className="text-slate-400 text-xs font-normal mr-1">SAR</span>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="flex items-center gap-2 text-[11px] text-slate-400">
                    <span className="bg-slate-900 px-2 py-1 rounded-lg tabular-nums">
                      {cart.length} {t('items', 'صنف')}
                    </span>
                    <span className="bg-slate-900 px-2 py-1 rounded-lg tabular-nums">
                      {cartItemCount} {t('units', 'وحدة')}
                    </span>
                    <span className="bg-slate-900 px-2 py-1 rounded-lg tabular-nums">
                      {cartShopCount} {t('sellers', 'مورد')}
                    </span>
                  </div>
                  {summaryOpen ? <ChevronUp size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
                </div>
              </button>

              {/* Expanded summary details */}
              {summaryOpen && (
                <div className="mt-2 bg-slate-800/40 border border-slate-800 rounded-2xl divide-y divide-slate-800/60 overflow-hidden">
                  {cart.map(item => (
                    <div key={`sum-${item.id}`} className="flex items-center justify-between px-4 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-slate-200 text-xs font-medium truncate">{item.part_name}</p>
                        <p className="text-slate-500 text-[10px] tabular-nums">
                          {item.price.toLocaleString()} × {item.quantity}
                        </p>
                      </div>
                      <p className="text-emerald-400 text-xs font-bold tabular-nums shrink-0 mr-3">
                        {(item.price * item.quantity).toLocaleString()} ر.س
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Cart Items ────────────────────────────────────────────── */}
            <div
              className="flex-1 overflow-y-auto overscroll-contain px-4 py-2 space-y-2.5"
              style={{ WebkitOverflowScrolling: 'touch' } as any}
            >
              {cart.map(item => (
                <CartItem
                  key={item.id}
                  item={item}
                  onRemove={() => removeFromCart(item.id)}
                  onChangeQty={qty => changeCartQty(item.id, qty)}
                  t={t}
                />
              ))}
            </div>

            {/* ── Sticky Checkout Footer ────────────────────────────────── */}
            <div
              className="shrink-0 bg-slate-950 border-t border-slate-800 px-4 pt-4"
              style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 1.25rem)' }}
            >
              {/* Grand total row */}
              <div className="flex items-end justify-between mb-4">
                <div>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest leading-none mb-1.5">
                    {t('Total Payable', 'إجمالي السعر')}
                  </p>
                  <p className="text-3xl font-black text-white tabular-nums leading-none">
                    {cartTotal.toLocaleString()}
                    <span className="text-sm font-normal text-slate-500 mr-1">SAR</span>
                  </p>
                </div>
                <div className={`flex flex-col gap-1 ${isRTL ? 'items-start' : 'items-end'}`}>
                  <span className="text-[10px] font-bold text-slate-500 bg-slate-800 px-2.5 py-1 rounded-full tabular-nums">
                    {cartItemCount} {t('units', 'وحدة')}
                  </span>
                  <span className="text-[10px] font-bold text-slate-500 bg-slate-800 px-2.5 py-1 rounded-full tabular-nums">
                    {cart.length} {t('products', 'منتج')}
                  </span>
                </div>
              </div>

              {/* Place order button */}
              <button
                onClick={createOrder}
                className="w-full bg-blue-600 hover:bg-blue-500 active:bg-blue-700 active:scale-[0.99] text-white font-black rounded-2xl shadow-xl shadow-blue-900/30 flex items-center justify-center gap-2.5 transition-all"
                style={{ height: '58px' }}
              >
                <ShoppingCart size={19} />
                <span className="text-base">{t('Place Order', 'إرسال الطلب الآن')}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
