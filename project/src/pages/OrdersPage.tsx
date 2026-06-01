import { useEffect, useMemo, useState, useCallback } from 'react';
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
  MessageCircle,
  MapPin,
  X,
  ChevronDown,
  Package,
  AlertTriangle,
} from 'lucide-react';

import { useLang } from '../context/LanguageContext';

// ─── TYPES ──────────────────────────────────────────────────────────────────
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
  city?: string;
};

type CartItem = {
  id: number;
  part_name: string;
  part_number: string;
  price: number;
  quantity: number;
  shop_id: number;
};

export default function SearchPage() {
  const { isRTL } = useLang();
  const { ownedShopId } = useAuth();

  // ─── STATE ────────────────────────────────────────────────────────────────
  const [products, setProducts] = useState<Product[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [brandFilter, setBrandFilter] = useState('all');
  const [cart, setCart] = useState<CartItem[]>([]);

  // ─── DATA FETCHING ────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
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
      if (productsError) throw productsError;

      const fetchedProducts: Product[] = productsData || [];
      const shopIds = [...new Set(fetchedProducts.map((p) => p.shop_id))];

      let fetchedShops: Shop[] = [];
      if (shopIds.length > 0) {
        const { data: shopsData, error: shopsError } = await supabase
          .from('shops')
          .select('id, shop_name, phone, city')
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

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ─── CART LOGIC ───────────────────────────────────────────────────────────
  const addToCart = (product: Product) => {
    const exists = cart.find((item) => item.id === product.id);
    if (exists) {
      setCart(
        cart.map((item) =>
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        )
      );
    } else {
      setCart([
        ...cart,
        {
          id: product.id,
          part_name: product.part_name,
          part_number: product.part_number,
          price: product.price,
          quantity: 1,
          shop_id: product.shop_id,
        },
      ]);
    }
  };

  const removeFromCart = (id: number) => {
    setCart(cart.filter((item) => item.id !== id));
  };

  const createOrder = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return alert('يجب تسجيل الدخول');

      const { data: myShop } = await supabase.from('shops').select('*').eq('owner_id', user.id).single();
      if (!myShop) return alert('المحل غير موجود');

      const grouped: Record<number, CartItem[]> = {};
      cart.forEach((item) => {
        if (!grouped[item.shop_id]) grouped[item.shop_id] = [];
        grouped[item.shop_id].push(item);
      });

      for (const shopId in grouped) {
        const items = grouped[Number(shopId)];
        const orderTotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

        const { data: order } = await supabase
          .from('orders')
          .insert({
            from_shop_id: myShop.id,
            to_shop_id: Number(shopId),
            status: 'pending',
            total_amount: orderTotal,
          })
          .select()
          .single();

        if (order) {
          const orderItems = items.map((item) => ({
            order_id: order.id,
            product_id: item.id,
            quantity: item.quantity,
            price: item.price,
          }));
          await supabase.from('order_items').insert(orderItems);
          await supabase.from('notifications').insert({
            shop_id: Number(order.to_shop_id),
            title: 'طلب جديد',
            message: `تم استلام طلب جديد رقم #${order.id}`,
            type: 'new_order',
          });
        }
      }
      setCart([]);
      alert('تم إنشاء الطلب بنجاح');
    } catch (error) {
      console.error('Order Error:', error);
    }
  };

  // ─── SEARCH & STATS LOGIC ─────────────────────────────────────────────────
  const mergedProducts = useMemo(() => {
    return products.map((p) => {
      const shop = shops.find((s) => s.id === p.shop_id);
      return {
        ...p,
        shop_name: shop?.shop_name ?? 'محل غير معروف',
        shop_phone: shop?.phone ?? '-',
        shop_city: shop?.city ?? 'غير محدد',
      };
    });
  }, [products, shops]);

  const stats = useMemo(() => ({
    totalItems: mergedProducts.length,
    shopCount: shops.length,
    lowStock: mergedProducts.filter(p => p.quantity > 0 && p.quantity <= 5).length
  }), [mergedProducts, shops]);

  const brands = useMemo(() => ['all', ...new Set(mergedProducts.map((p) => p.brand).filter(Boolean))], [mergedProducts]);

  const filtered = useMemo(() => {
    return mergedProducts.filter((p) => {
      const matchesQuery =
        query === '' ||
        p.part_name?.toLowerCase().includes(query.toLowerCase()) ||
        p.part_number?.toLowerCase().includes(query.toLowerCase()) ||
        p.model?.toLowerCase().includes(query.toLowerCase());

      const matchesBrand = brandFilter === 'all' || p.brand === brandFilter;
      return matchesQuery && matchesBrand;
    });
  }, [mergedProducts, query, brandFilter]);

  const cartTotal = useMemo(() => cart.reduce((sum, item) => sum + item.price * item.quantity, 0), [cart]);

  return (
    <div className="max-w-7xl mx-auto p-4 lg:p-8 text-white pb-32" dir={isRTL ? 'rtl' : 'ltr'}>
      
      {/* ── STATS CARDS ── */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <StatCard title="القطع المتاحة" value={stats.totalItems} icon={<Package className="text-blue-400" />} />
        <StatCard title="المحلات" value={stats.shopCount} icon={<Store className="text-emerald-400" />} />
        <StatCard title="نقص مخزون" value={stats.lowStock} icon={<AlertTriangle className="text-amber-400" />} />
      </div>

      {/* ── SEARCH BOX ── */}
      <div className="bg-slate-900/50 backdrop-blur-md border border-slate-800 rounded-[2.5rem] p-6 mb-8 sticky top-4 z-30 shadow-2xl">
        <div className="flex flex-col lg:flex-row gap-4 items-center">
          <div className="relative flex-1 w-full group">
            <Search size={22} className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-500 transition-colors" />
            <input
              type="text"
              placeholder="ابحث باسم القطعة، الرقم الأصلي، أو الموديل..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-slate-950/50 border border-slate-800 rounded-[1.5rem] h-14 pr-14 pl-6 text-lg placeholder-slate-600 focus:outline-none focus:border-blue-500/50 transition-all"
            />
          </div>
          <div className="flex gap-2 w-full lg:w-auto">
            <div className="relative flex-1 lg:w-48">
              <Filter size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500" />
              <select
                value={brandFilter}
                onChange={(e) => setBrandFilter(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-[1.2rem] h-14 pr-11 pl-4 appearance-none text-sm font-bold focus:outline-none focus:border-blue-500"
              >
                <option value="all">كل الماركات</option>
                {brands.filter(b => b !== 'all').map(brand => <option key={brand} value={brand}>{brand}</option>)}
              </select>
              <ChevronDown size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none" />
            </div>
            <button 
              onClick={fetchData}
              className="w-14 h-14 bg-slate-800 border border-slate-700 rounded-[1.2rem] flex items-center justify-center hover:bg-slate-700 transition-colors"
            >
              <RefreshCw size={20} className={loading ? 'animate-spin text-blue-400' : 'text-slate-400'} />
            </button>
          </div>
        </div>
      </div>

      {/* ── CONTENT ── */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1,2,3].map(i => <div key={i} className="h-72 bg-slate-900/50 rounded-[2rem] border border-slate-800 animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-24 bg-slate-900/30 rounded-[3rem] border border-dashed border-slate-800">
          <Search className="text-slate-700 mx-auto mb-4" size={50} />
          <h3 className="text-xl font-bold text-white mb-2 italic">لا توجد قطع مطابقة</h3>
          <p className="text-slate-500">حاول البحث بكلمات أخرى أو تغيير الفلتر</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((p) => (
            <div key={p.id} className="bg-slate-900 border border-slate-800 hover:border-blue-500/30 rounded-[2.2rem] p-6 transition-all duration-300 shadow-xl flex flex-col group">
              <div className="flex justify-between items-start mb-5">
                <div className={`px-3 py-1 rounded-full border text-[11px] font-black uppercase tracking-wider ${p.quantity > 5 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}>
                  {p.quantity > 5 ? 'متوفر' : 'كمية منخفضة'}
                </div>
                <div className="text-2xl font-black italic text-blue-400 tracking-tighter">
                  {p.price} <span className="text-xs not-italic font-bold opacity-60">ر.س</span>
                </div>
              </div>

              <div className="mb-6 flex-1">
                <h2 className="text-lg font-black text-white italic leading-tight mb-2 group-hover:text-blue-400 transition-colors">
                  {p.part_name}
                </h2>
                <div className="inline-block bg-slate-800 px-3 py-1 rounded-lg text-xs font-mono font-black text-blue-500 italic border border-slate-700">
                  {p.part_number}
                </div>
                <div className="mt-4 space-y-3">
                  <div className="flex items-center gap-3 text-slate-400 text-xs font-bold">
                    <Tag size={14} className="text-blue-500" />
                    <span>{p.brand} / {p.model}</span>
                  </div>
                  <div className="flex items-center gap-3 text-slate-400 text-xs font-bold">
                    <Store size={14} className="text-emerald-500" />
                    <div className="flex flex-col">
                      <span className="text-white">{p.shop_name}</span>
                      <span className="text-slate-600 text-[10px]"><MapPin size={10} className="inline mr-1" /> {p.shop_city}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2 pt-4 border-t border-slate-800/50">
                <a href={`tel:${p.shop_phone}`} className="h-12 bg-slate-800 hover:bg-blue-600 rounded-2xl flex items-center justify-center text-slate-300 transition-all"><Phone size={18} /></a>
                <a href={`https://wa.me/${p.shop_phone}`} target="_blank" rel="noreferrer" className="h-12 bg-slate-800 hover:bg-emerald-600 rounded-2xl flex items-center justify-center text-slate-300 transition-all"><MessageCircle size={18} /></a>
                <button className="h-12 bg-slate-800 hover:bg-amber-600 rounded-2xl flex items-center justify-center text-slate-300 transition-all"><MapPin size={18} /></button>
                <button
                  onClick={() => addToCart(p)}
                  className="h-12 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-blue-900/40 active:scale-95 transition-all"
                >
                  <Plus size={24} strokeWidth={3} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── CART DRAWER ── */}
      {cart.length > 0 && (
        <div className="fixed bottom-6 left-4 right-4 md:left-auto md:w-[450px] bg-slate-900 border border-slate-700 rounded-[2.5rem] p-6 shadow-2xl z-50 animate-in slide-in-from-bottom-10">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="relative">
                <ShoppingCart size={24} className="text-blue-500" />
                <span className="absolute -top-2 -right-2 w-5 h-5 bg-blue-600 text-[10px] font-black rounded-full flex items-center justify-center ring-4 ring-slate-900">
                  {cart.length}
                </span>
              </div>
              <h3 className="text-xl font-black italic">سلة الطلب</h3>
            </div>
            <button onClick={() => setCart([])} className="text-slate-500 hover:text-white p-2"><X size={20} /></button>
          </div>

          <div className="space-y-3 max-h-60 overflow-y-auto mb-6 px-1">
            {cart.map((item) => (
              <div key={item.id} className="bg-slate-950/50 border border-slate-800/50 rounded-[1.2rem] p-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white truncate italic">{item.part_name}</p>
                  <p className="text-[10px] text-slate-500 mt-1">{item.price} ر.س / الوحدة</p>
                </div>
                <div className="flex items-center gap-3 bg-slate-900 rounded-xl p-1 px-3 border border-slate-800">
                  <span className="font-black italic text-sm text-white">{item.quantity}</span>
                </div>
                <button onClick={() => removeFromCart(item.id)} className="text-rose-500/50 hover:text-rose-500"><X size={16} /></button>
              </div>
            ))}
          </div>

          <div className="pt-6 border-t border-slate-800 flex justify-between items-center mb-6">
            <span className="text-slate-500 font-bold">المجموع</span>
            <span className="text-3xl font-black italic text-emerald-400 tracking-tighter">{cartTotal} <span className="text-sm not-italic">ر.س</span></span>
          </div>
          <button
            onClick={createOrder}
            className="w-full h-16 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-black text-lg italic shadow-xl active:scale-95 transition-all flex items-center justify-center gap-3"
          >
            <ShoppingCart size={20} /> إتمام الطلب الآن
          </button>
        </div>
      )}
    </div>
  );
}

// ── SUBCOMPONENTS ──
const StatCard = ({ title, value, icon }: { title: string, value: number, icon: React.ReactNode }) => (
  <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-[1.5rem] flex flex-col items-center justify-center gap-1 group">
    <div className="mb-1">{icon}</div>
    <div className="text-xl font-black italic text-white leading-none">{value}</div>
    <div className="text-[10px] text-slate-500 font-bold uppercase tracking-tight">{title}</div>
  </div>
);