import { useEffect, useMemo, useState, useCallback, memo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import {
  Search,
  Phone,
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
  }[status];

  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${config.cls}`}>
      <span className="w-1 h-1 rounded-full bg-current" />
      {config.label}
    </span>
  );
});

const CopyButton = memo(({ text }: { text: string }) => {
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
      className="p-1 rounded bg-slate-800 text-slate-500 hover:text-emerald-400 transition-colors"
      aria-label="Copy part number"
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
    </button>
  );
});

const ProductCard = memo(({ product: p, inCart, cartQty, onAdd, onRemoveOne, t }: any) => {
  const status = getStockStatus(p.quantity);
  const isOutOfStock = status === 'out-of-stock';

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col gap-3 shadow-sm active:scale-[0.99] transition-transform">
      <div className="flex justify-between items-start gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="text-white font-bold text-sm leading-tight truncate">{p.part_name}</h3>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="font-mono text-[10px] text-slate-400 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800 truncate">
              {p.part_number}
            </span>
            <CopyButton text={p.part_number} />
          </div>
        </div>
        <StockBadge quantity={p.quantity} t={t} />
      </div>

      <div className="grid grid-cols-2 gap-y-2 text-[11px]">
        <div className="flex items-center gap-1.5 text-slate-400">
          <Tag size={12} className="text-blue-500" />
          <span className="truncate">{p.brand} {p.model && `· ${p.model}`}</span>
        </div>
        <div className="flex items-center gap-1.5 text-slate-400">
          <Store size={12} className="text-emerald-500" />
          <span className="truncate">{p.shop_name}</span>
        </div>
      </div>

      <div className="flex items-center justify-between mt-1 pt-3 border-t border-slate-800/50">
        <div>
          <span className="text-xs text-slate-500 block leading-none mb-1">{t('Unit Price', 'سعر الوحدة')}</span>
          <span className="text-lg font-black text-white">
            {p.price.toLocaleString()} <span className="text-[10px] font-medium text-slate-500">ر.س</span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          {!inCart ? (
            <button
              onClick={onAdd}
              disabled={isOutOfStock}
              className="h-10 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-600 font-bold text-xs text-white transition-all flex items-center gap-2"
            >
              <Plus size={14} /> {t('Add', 'إضافة')}
            </button>
          ) : (
            <div className="flex items-center bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
              <button onClick={onRemoveOne} className="w-9 h-9 flex items-center justify-center text-slate-300 hover:bg-slate-700">
                {cartQty === 1 ? <Trash2 size={14} className="text-red-400" /> : <Minus size={14} />}
              </button>
              <span className="w-8 text-center text-xs font-black text-white">{cartQty}</span>
              <button onClick={onAdd} className="w-9 h-9 flex items-center justify-center text-white hover:bg-blue-600 bg-blue-700/50">
                <Plus size={14} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SearchPage() {
  const { isRTL, t } = useLang();
  const { ownedShopId } = useAuth();

  const [products, setProducts] = useState<Product[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [brandFilter, setBrandFilter] = useState('all');
  const [cart, setCart] = useState<any[]>([]);
  const [showCart, setShowCart] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      let productsQuery = supabase.from('products').select('*').gt('quantity', 0).order('created_at', { ascending: false });
      if (ownedShopId) productsQuery = productsQuery.neq('shop_id', ownedShopId);
      
      const { data: productsData, error: productsError } = await productsQuery;
      if (productsError) throw productsError;

      const fetchedProducts: Product[] = productsData || [];
      const shopIds = [...new Set(fetchedProducts.map((p) => p.shop_id))];

      let fetchedShops: Shop[] = [];
      if (shopIds.length > 0) {
        const { data: shopsData, error: shopsError } = await supabase.from('shops').select('id, shop_name, phone').in('id', shopIds);
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
      const exists = prev.find((item) => item.id === product.id);
      if (exists) return prev.map((item) => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      return [...prev, { ...product, quantity: 1 }];
    });
  }, []);

  const removeFromCart = useCallback((id: number) => {
    setCart(prev => prev.filter((item) => item.id !== id));
  }, []);

  const changeCartQty = useCallback((id: number, qty: number) => {
    if (qty <= 0) { removeFromCart(id); return; }
    setCart(prev => prev.map((item) => item.id === id ? { ...item, quantity: qty } : item));
  }, [removeFromCart]);

  const createOrder = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return alert(t('Please login first', 'يرجى تسجيل الدخول أولاً'));

      const { data: myShop, error: shopError } = await supabase.from('shops').select('*').eq('owner_id', user.id).single();
      if (shopError || !myShop) throw new Error('Shop not found');

      const grouped: Record<number, any[]> = {};
      cart.forEach((item) => {
        if (!grouped[item.shop_id]) grouped[item.shop_id] = [];
        grouped[item.shop_id].push(item);
      });

      for (const shopId in grouped) {
        const items = grouped[shopId];
        const orderTotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

        const { data: order, error: orderError } = await supabase.from('orders').insert({
          from_shop_id: myShop.id,
          to_shop_id: Number(shopId),
          status: 'pending',
          total_amount: orderTotal,
        }).select().single();

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

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return products
      .map(p => ({
        ...p,
        shop_name: shops.find(s => s.id === p.shop_id)?.shop_name ?? '—',
        shop_phone: shops.find(s => s.id === p.shop_id)?.phone ?? '—'
      }))
      .filter(p => {
        const matchesQuery = !q || p.part_name.toLowerCase().includes(q) || p.part_number.toLowerCase().includes(q) || p.model.toLowerCase().includes(q);
        const matchesBrand = brandFilter === 'all' || p.brand === brandFilter;
        return matchesQuery && matchesBrand;
      });
  }, [products, shops, query, brandFilter]);

  const brands = useMemo(() => ['all', ...new Set(products.map(p => p.brand).filter(Boolean))], [products]);
  const cartItemCount = useMemo(() => cart.reduce((s, i) => s + i.quantity, 0), [cart]);
  const cartTotal = useMemo(() => cart.reduce((s, i) => s + i.price * i.quantity, 0), [cart]);

  return (
    <div className={`max-w-4xl mx-auto px-4 pt-4 pb-32 min-h-screen`} dir={isRTL ? 'rtl' : 'ltr'}>
      {/* ── Search Bar ── */}
      <div className="sticky top-0 z-30 pt-1 pb-4 bg-slate-950/80 backdrop-blur-md">
        <div className="relative">
          <Search className={`absolute top-1/2 -translate-y-1/2 ${isRTL ? 'right-4' : 'left-4'} text-slate-500`} size={18} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('Part name or number...', 'اسم القطعة أو رقمها...')}
            className={`w-full h-14 bg-slate-900 border border-slate-800 rounded-2xl ${isRTL ? 'pr-12 pl-12' : 'pl-12 pr-12'} text-white focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition-all outline-none text-sm shadow-xl`}
          />
          {loading && <RefreshCw size={16} className={`absolute top-1/2 -translate-y-1/2 ${isRTL ? 'left-4' : 'right-4'} text-blue-500 animate-spin`} />}
        </div>

        {/* ── Brands Filter ── */}
        <div className="flex gap-2 overflow-x-auto py-3 no-scrollbar">
          {brands.map((b) => (
            <button
              key={b}
              onClick={() => setBrandFilter(b)}
              className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-all whitespace-nowrap ${
                brandFilter === b ? 'bg-blue-600 border-blue-600 text-white' : 'bg-slate-900 border-slate-800 text-slate-400'
              }`}
            >
              {b === 'all' ? t('All', 'الكل') : b}
            </button>
          ))}
        </div>
      </div>

      {/* ── Products Grid ── */}
      {filtered.length === 0 && !loading ? (
        <div className="py-20 text-center flex flex-col items-center gap-4 opacity-40">
          <PackageSearch size={64} className="text-slate-500" />
          <p className="text-sm font-medium">{t('No parts found', 'لا توجد نتائج مطابقة')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filtered.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              inCart={cart.some(c => c.id === p.id)}
              cartQty={cart.find(c => c.id === p.id)?.quantity ?? 0}
              onAdd={() => addToCart(p)}
              onRemoveOne={() => changeCartQty(p.id, (cart.find(c => c.id === p.id)?.quantity ?? 0) - 1)}
              t={t}
            />
          ))}
        </div>
      )}

      {/* ── Floating Cart Bar ── */}
      {cart.length > 0 && !showCart && (
        <div className="fixed bottom-[72px] left-4 right-4 z-40 animate-in slide-in-from-bottom-4 duration-300">
          <button
            onClick={() => setShowCart(true)}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white h-16 rounded-2xl flex items-center justify-between px-6 shadow-2xl shadow-emerald-950/50"
          >
            <div className="flex items-center gap-4">
              <div className="relative">
                <ShoppingCart size={24} />
                <span className="absolute -top-2 -right-2 bg-white text-emerald-700 text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center">
                  {cartItemCount}
                </span>
              </div>
              <div className="text-start">
                <p className="text-sm font-black leading-tight">{t('View Cart', 'عرض السلة')}</p>
                <p className="text-[10px] opacity-80 uppercase font-bold tracking-tighter">{cart.length} {t('Sellers', 'موردين')}</p>
              </div>
            </div>
            <div className="text-end">
              <p className="text-lg font-black leading-tight">{cartTotal.toLocaleString()}</p>
              <p className="text-[10px] opacity-80 uppercase font-bold">SAR</p>
            </div>
          </button>
        </div>
      )}

      {/* ── Cart Sheet ── */}
      {showCart && (
        <div className="fixed inset-0 z-50 flex items-end">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowCart(false)} />
          <div className="relative w-full bg-slate-900 rounded-t-[2rem] border-t border-slate-800 shadow-2xl max-h-[85vh] flex flex-col animate-in slide-in-from-bottom-full duration-300">
            <div className="flex justify-center p-3">
              <div className="w-12 h-1.5 rounded-full bg-slate-800" />
            </div>
            
            <div className="px-6 pb-4 flex justify-between items-center border-b border-slate-800">
              <h3 className="text-xl font-black text-white">{t('Cart', 'السلة')}</h3>
              <button onClick={() => setShowCart(false)} className="p-2 rounded-full bg-slate-800 text-slate-400"><X size={20} /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 no-scrollbar">
              {cart.map(item => (
                <div key={item.id} className="bg-slate-800/40 border border-slate-800 rounded-2xl p-4 flex flex-col gap-3">
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex-1">
                      <p className="text-white font-bold text-sm leading-tight">{item.part_name}</p>
                      <p className="text-[10px] text-slate-500 font-mono mt-1">{item.part_number}</p>
                    </div>
                    <button onClick={() => removeFromCart(item.id)} className="p-2 text-slate-500 hover:text-red-400"><Trash2 size={16} /></button>
                  </div>
                  
                  <div className="flex items-center justify-between pt-2 border-t border-slate-800/50">
                    <div className="flex items-center bg-slate-800 rounded-xl p-1 border border-slate-700">
                      <button onClick={() => changeCartQty(item.id, item.quantity - 1)} className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-white"><Minus size={14} /></button>
                      <span className="w-10 text-center text-sm font-bold text-white">{item.quantity}</span>
                      <button onClick={() => changeCartQty(item.id, item.quantity + 1)} className="w-8 h-8 flex items-center justify-center text-white"><Plus size={14} /></button>
                    </div>
                    <div className="text-end">
                      <p className="text-xs text-slate-500 leading-none mb-1">{t('Total', 'الإجمالي')}</p>
                      <p className="text-base font-black text-emerald-400">{(item.price * item.quantity).toLocaleString()} <span className="text-[10px] font-normal">ر.س</span></p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-6 bg-slate-950 border-t border-slate-800 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
              <div className="flex justify-between items-end mb-6">
                <div>
                  <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mb-1">{t('Total Payable', 'إجمالي السعر')}</p>
                  <p className="text-3xl font-black text-white">{cartTotal.toLocaleString()} <span className="text-xs font-normal text-slate-500">SAR</span></p>
                </div>
                <p className="text-[10px] font-bold text-slate-500 uppercase">{cart.length} {t('Items', 'أصناف')}</p>
              </div>
              <button
                onClick={createOrder}
                className="w-full h-16 bg-blue-600 hover:bg-blue-500 text-white font-black rounded-2xl shadow-xl shadow-blue-900/30 flex items-center justify-center gap-3 transition-all active:scale-95"
              >
                <ShoppingCart size={20} />
                {t('Place Order', 'إرسال الطلب الآن')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}