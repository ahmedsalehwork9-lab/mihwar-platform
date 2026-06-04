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
  MessageCircle,
  Navigation,
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

// STEP 1: Extended Shop type with whatsapp + google_maps_url
type Shop = {
  id: number;
  shop_name: string;
  phone: string;
  whatsapp: string | null;
  google_maps_url: string | null;
};

type StockStatus = 'in-stock' | 'low-stock' | 'out-of-stock';

// ─── Pure Helpers ─────────────────────────────────────────────────────────────

function getStockStatus(qty: number): StockStatus {
  if (qty === 0) return 'out-of-stock';
  if (qty <= 5) return 'low-stock';
  return 'in-stock';
}

// Format Saudi number to international wa.me format
function toWaLink(num: string): string {
  const clean = num.replace(/\D/g, '');
  if (clean.startsWith('966')) return `https://wa.me/${clean}`;
  if (clean.startsWith('05')) return `https://wa.me/966${clean.slice(1)}`;
  if (clean.startsWith('5')) return `https://wa.me/966${clean}`;
  return `https://wa.me/${clean}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const StockBadge = memo(({ quantity, t }: { quantity: number; t: any }) => {
  const status = getStockStatus(quantity);
  const config = {
    'in-stock':     { label: t('In Stock', 'متوفر'),   dot: 'bg-emerald-400', cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
    'low-stock':    { label: t('Low', 'منخفض'),        dot: 'bg-amber-400',   cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20'       },
    'out-of-stock': { label: t('Out', 'نفد'),          dot: 'bg-red-400',     cls: 'bg-red-500/10 text-red-400 border-red-500/20'             },
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
  inCart, cartQty, isOutOfStock, onAdd, onRemoveOne, t,
}: {
  inCart: boolean; cartQty: number; isOutOfStock: boolean;
  onAdd: () => void; onRemoveOne: () => void; t: any;
}) => {
  if (!inCart) {
    return (
      <button
        onClick={onAdd}
        disabled={isOutOfStock}
        className="h-9 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 active:scale-95 disabled:bg-slate-800 disabled:text-slate-600 font-bold text-xs text-white transition-all flex items-center gap-1.5 shrink-0"
      >
        <Plus size={13} /> {t('Add', 'إضافة')}
      </button>
    );
  }
  return (
    <div className="flex items-center bg-slate-800 rounded-xl border border-slate-700 overflow-hidden shrink-0">
      <button onClick={onRemoveOne} className="w-8 h-8 flex items-center justify-center text-slate-300 hover:bg-slate-700 active:bg-slate-600 transition-colors">
        {cartQty === 1 ? <Trash2 size={12} className="text-red-400" /> : <Minus size={12} />}
      </button>
      <span className="w-7 text-center text-xs font-black text-white tabular-nums select-none">{cartQty}</span>
      <button onClick={onAdd} className="w-8 h-8 flex items-center justify-center text-white hover:bg-blue-600 active:bg-blue-700 bg-blue-700/50 transition-colors">
        <Plus size={12} />
      </button>
    </div>
  );
});

// ─── Product Card ─────────────────────────────────────────────────────────────

// STEP 4: Extended ProductCard props with shop_whatsapp + shop_location
const ProductCard = memo(({
  product: p, inCart, cartQty, onAdd, onRemoveOne, t,
}: {
  product: Product & {
    shop_name: string;
    shop_phone: string;
    shop_whatsapp?: string | null;
    shop_location?: string | null;
  };
  inCart: boolean; cartQty: number;
  onAdd: () => void; onRemoveOne: () => void; t: any;
}) => {
  const isOutOfStock = p.quantity === 0;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col gap-3 active:scale-[0.99] transition-transform">
      {/* Name + stock */}
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-white font-bold text-base leading-snug flex-1 min-w-0 line-clamp-2">{p.part_name}</h3>
        <StockBadge quantity={p.quantity} t={t} />
      </div>

      {/* Part number */}
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-[12px] text-slate-400 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800 truncate max-w-[10rem]">
          {p.part_number}
        </span>
        <CopyButton text={p.part_number} />
      </div>

      {/* Meta: brand, shop, qty */}
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
        <div className="flex items-center gap-1">
          <Package size={11} className="text-slate-500 shrink-0" />
          <span className="tabular-nums">
            {t('Qty', 'الكمية')}: <strong className={p.quantity <= 5 ? 'text-amber-400' : 'text-slate-200'}>{p.quantity}</strong>
          </span>
        </div>
      </div>

      {/* STEP 5 + 6: Supplier contact action buttons */}
      {(p.shop_whatsapp || p.shop_location) && (
        <div className="flex items-center gap-2">
          {p.shop_whatsapp && (
            <a
              href={toWaLink(p.shop_whatsapp)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 text-[11px] font-bold transition-all active:scale-95"
            >
              <MessageCircle size={11} />
              واتساب
            </a>
          )}
          {p.shop_location && (
            <a
              href={p.shop_location}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 text-blue-400 text-[11px] font-bold transition-all active:scale-95"
            >
              <Navigation size={11} />
              الموقع
            </a>
          )}
        </div>
      )}

      {/* Price + action */}
      <div className="flex items-center justify-between pt-2.5 border-t border-slate-800/60">
        <div>
          <span className="text-[10px] text-slate-500 block leading-none mb-1">{t('Unit Price', 'سعر الوحدة')}</span>
          <span className="text-xl font-black text-white tabular-nums leading-none">
            {p.price.toLocaleString()} <span className="text-[11px] font-medium text-slate-500">ر.س</span>
          </span>
        </div>
        <QtyControl inCart={inCart} cartQty={cartQty} isOutOfStock={isOutOfStock} onAdd={onAdd} onRemoveOne={onRemoveOne} t={t} />
      </div>
    </div>
  );
});

// ─── Cart Item (used in sidebar + sheet) ─────────────────────────────────────

const CartItemRow = memo(({
  item, onRemove, onChangeQty, t,
}: {
  item: any; onRemove: () => void; onChangeQty: (qty: number) => void; t: any;
}) => (
  <div className="border-b border-slate-800/60 py-3 last:border-0">
    <div className="flex items-start justify-between gap-2 mb-2">
      <div className="flex-1 min-w-0">
        <p className="text-white font-semibold text-xs leading-snug line-clamp-2">{item.part_name}</p>
        <p className="text-[10px] text-slate-500 font-mono mt-0.5 truncate">{item.part_number}</p>
      </div>
      <button
        onClick={onRemove}
        className="p-1 rounded-lg text-slate-600 hover:text-red-400 active:scale-90 transition-all shrink-0"
      >
        <Trash2 size={13} />
      </button>
    </div>
    <div className="flex items-center justify-between">
      <div className="flex items-center bg-slate-800 rounded-lg border border-slate-700/60 overflow-hidden">
        <button
          onClick={() => onChangeQty(item.quantity - 1)}
          className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
        >
          <Minus size={11} />
        </button>
        <span className="w-7 text-center text-xs font-black text-white tabular-nums select-none">{item.quantity}</span>
        <button
          onClick={() => onChangeQty(item.quantity + 1)}
          className="w-7 h-7 flex items-center justify-center text-white bg-blue-700/40 hover:bg-blue-600 transition-colors"
        >
          <Plus size={11} />
        </button>
      </div>
      <p className="text-emerald-400 text-sm font-black tabular-nums">
        {(item.price * item.quantity).toLocaleString()} <span className="text-[10px] font-normal text-slate-500">ر.س</span>
      </p>
    </div>
  </div>
));

// ─── Cart Summary Strip ───────────────────────────────────────────────────────

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

// ─── Desktop Cart Sidebar ─────────────────────────────────────────────────────

const CartSidebar = memo(({
  cart, cartTotal, cartItemCount, cartShopCount,
  onRemove, onChangeQty, onCreateOrder, t, isRTL,
}: {
  cart: any[]; cartTotal: number; cartItemCount: number; cartShopCount: number;
  onRemove: (id: number) => void; onChangeQty: (id: number, qty: number) => void;
  onCreateOrder: () => void; t: any; isRTL: boolean;
}) => (
  <aside className="hidden lg:flex flex-col w-72 shrink-0 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden h-fit sticky top-4">
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
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 max-h-[50vh]"
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

// ─── Mobile Cart Bottom Sheet ─────────────────────────────────────────────────

const CartSheet = memo(({
  cart, cartTotal, cartItemCount, cartShopCount,
  onClose, onRemove, onChangeQty, onCreateOrder, t, isRTL,
}: {
  cart: any[]; cartTotal: number; cartItemCount: number; cartShopCount: number;
  onClose: () => void; onRemove: (id: number) => void;
  onChangeQty: (id: number, qty: number) => void;
  onCreateOrder: () => void; t: any; isRTL: boolean;
}) => (
  <div className="fixed inset-0 z-50 flex items-end lg:hidden" dir={isRTL ? 'rtl' : 'ltr'}>
    {/* Backdrop */}
    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

    {/* Sheet — stops ABOVE the fixed button (pb-32 = 128px clears nav+button) */}
    <div
      className="relative w-full bg-slate-900 rounded-t-[1.75rem] border-t border-slate-800 shadow-2xl flex flex-col"
      style={{ maxHeight: 'calc(92vh - env(safe-area-inset-top, 0px))' }}
    >
      {/* Drag handle */}
      <div className="flex justify-center pt-3 pb-1 shrink-0">
        <div className="w-12 h-1.5 rounded-full bg-slate-700" />
      </div>

      {/* Header */}
      <div className="px-5 py-3 flex justify-between items-center border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-2">
          <ShoppingCart size={17} className="text-emerald-400" />
          <h3 className="text-base font-black text-white">{t('Cart', 'السلة')}</h3>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-800 text-slate-400 hover:text-white active:scale-90 transition-all"
        >
          <X size={16} />
        </button>
      </div>

      {/* Scrollable items */}
      <div
        className="flex-1 overflow-y-auto overscroll-contain px-4 py-1"
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

      {/* Summary — inside sheet, no extra bottom space */}
      <div className="shrink-0 bg-slate-950 border-t border-slate-800 px-4 pt-3 pb-32">
        <CartSummary
          cartTotal={cartTotal}
          cart={cart}
          cartItemCount={cartItemCount}
          cartShopCount={cartShopCount}
          t={t}
        />
      </div>
    </div>

    {/* ── ORDER BUTTON — fixed overlay, always above bottom nav ── */}
    <div
      className="fixed left-0 right-0 z-[60] px-4"
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 5rem)' }}
    >
      <button
        onClick={onCreateOrder}
        className="w-full bg-blue-600 hover:bg-blue-500 active:bg-blue-700 active:scale-[0.99] text-white font-black rounded-2xl shadow-2xl shadow-blue-900/60 flex items-center justify-center gap-2.5 transition-all"
        style={{ height: '56px' }}
      >
        <ShoppingCart size={18} />
        <span className="text-base">{t('Place Order', 'إرسال الطلب الآن')}</span>
      </button>
    </div>
  </div>
));

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SearchPage() {
  const { isRTL, t } = useLang();
  const { ownedShopId } = useAuth();

  const [products, setProducts] = useState<Product[]>([]);
  const [shops, setShops]       = useState<Shop[]>([]);
  const [loading, setLoading]   = useState(false);
  const [query, setQuery]       = useState('');
  const [brandFilter, setBrandFilter] = useState('all');
  const [cart, setCart]         = useState<any[]>([]);
  const [showCart, setShowCart] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      let productsQuery = supabase
        .from('products').select('*').gt('quantity', 0).order('created_at', { ascending: false });
      if (ownedShopId) productsQuery = productsQuery.neq('shop_id', ownedShopId);

      const { data: productsData, error: productsError } = await productsQuery;
      if (productsError) throw productsError;

      const fetchedProducts: Product[] = productsData || [];
      const shopIds = [...new Set(fetchedProducts.map(p => p.shop_id))];

      let fetchedShops: Shop[] = [];
      if (shopIds.length > 0) {
        // STEP 2: fetch whatsapp + google_maps_url alongside existing fields
        const { data: shopsData, error: shopsError } = await supabase
          .from('shops')
          .select('id, shop_name, phone, whatsapp, google_maps_url')
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

  const createOrder = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return alert(t('Please login first', 'يرجى تسجيل الدخول أولاً'));

      const { data: myShop, error: shopError } = await supabase
        .from('shops').select('*').eq('owner_id', user.id).single();
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
          .insert({ from_shop_id: myShop.id, to_shop_id: Number(shopId), status: 'pending', total_amount: orderTotal })
          .select().single();
        if (orderError) throw orderError;

        const { error: itemsError } = await supabase.from('order_items').insert(
          items.map(item => ({ order_id: order.id, product_id: item.id, quantity: item.quantity, price: item.price }))
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

  const shopMap = useMemo(() => {
    const m: Record<number, Shop> = {};
    shops.forEach(s => { m[s.id] = s; });
    return m;
  }, [shops]);

  // STEP 3: filtered includes shop_whatsapp + shop_location
  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return products
      .map(p => ({
        ...p,
        shop_name:      shopMap[p.shop_id]?.shop_name      ?? '—',
        shop_phone:     shopMap[p.shop_id]?.phone          ?? '—',
        shop_whatsapp:  shopMap[p.shop_id]?.whatsapp       ?? null,
        shop_location:  shopMap[p.shop_id]?.google_maps_url ?? null,
      }))
      .filter(p => {
        const matchesQuery = !q || p.part_name.toLowerCase().includes(q) || p.part_number.toLowerCase().includes(q) || p.model.toLowerCase().includes(q);
        const matchesBrand = brandFilter === 'all' || p.brand === brandFilter;
        return matchesQuery && matchesBrand;
      });
  }, [products, shopMap, query, brandFilter]);

  const brands = useMemo(() => ['all', ...new Set(products.map(p => p.brand).filter(Boolean))], [products]);

  const cartItemCount = useMemo(() => cart.reduce((s, i) => s + i.quantity, 0), [cart]);
  const cartTotal     = useMemo(() => cart.reduce((s, i) => s + i.price * i.quantity, 0), [cart]);
  const cartShopCount = useMemo(() => new Set(cart.map(i => i.shop_id)).size, [cart]);

  return (
    <div
      className="max-w-full px-3 pt-3 min-h-screen"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 5rem)' }}
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      {/* ── Sticky Search + Brand Filter ──────────────────────────────────── */}
      <div className="sticky top-0 z-30 pb-3 bg-slate-950/90 backdrop-blur-md">
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
            className={`w-full bg-slate-900 border border-slate-800 rounded-2xl ${isRTL ? 'pr-11 pl-4' : 'pl-11 pr-4'} text-white focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition-all outline-none text-sm shadow-lg`}
            style={{ height: '50px' }}
          />
          {loading && (
            <RefreshCw
              size={14}
              className={`absolute top-1/2 -translate-y-1/2 ${isRTL ? 'left-4' : 'right-4'} text-blue-500 animate-spin`}
            />
          )}
        </div>

        <div className="flex gap-2 overflow-x-auto py-2.5 no-scrollbar">
          {brands.map(b => (
            <button
              key={b}
              onClick={() => setBrandFilter(b)}
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

      {/* ── Main layout: Products + Desktop Sidebar ───────────────────────── */}
      <div className={`flex gap-4 items-start ${isRTL ? 'flex-row-reverse' : 'flex-row'}`}>

        {/* Products Grid */}
        <div className="flex-1 min-w-0">
          {filtered.length === 0 && !loading ? (
            <div className="py-24 text-center flex flex-col items-center gap-4 opacity-40">
              <PackageSearch size={52} className="text-slate-500" />
              <p className="text-sm font-medium text-slate-400">{t('No parts found', 'لا توجد نتائج مطابقة')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
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
        </div>

        {/* Desktop Cart Sidebar */}
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

      {/* ── Mobile: Floating Cart Button ──────────────────────────────────── */}
      {cart.length > 0 && (
        <div
          className="fixed z-40 lg:hidden"
          style={{
            bottom: 'calc(env(safe-area-inset-bottom, 0px) + 5rem)',
            [isRTL ? 'left' : 'right']: '1rem',
          }}
        >
          <button
            onClick={() => setShowCart(true)}
            className="relative bg-blue-600 hover:bg-blue-500 active:bg-blue-700 active:scale-95 text-white rounded-2xl shadow-2xl shadow-blue-900/50 flex items-center gap-2.5 px-4 transition-all"
            style={{ height: '52px' }}
          >
            <span className="absolute -top-2 -right-2 bg-emerald-500 text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center tabular-nums shadow">
              {cartItemCount}
            </span>
            <ShoppingCart size={20} />
            <div className={isRTL ? 'text-right' : 'text-left'}>
              <p className="text-sm font-black leading-tight tabular-nums">{cartTotal.toLocaleString()}</p>
              <p className="text-[9px] opacity-75 font-bold">SAR</p>
            </div>
          </button>
        </div>
      )}

      {/* ── Mobile Cart Bottom Sheet ───────────────────────────────────────── */}
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
