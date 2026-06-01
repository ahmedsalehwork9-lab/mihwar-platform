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
  MessageCircle,
  MapPin,
  X,
  ChevronDown,
  Package,
  Layers,
  AlertCircle
} from 'lucide-react';

import { useLang } from '../context/LanguageContext';

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

export default function SearchPage() {
  const { lang, isRTL } = useLang();
  const { ownedShopId } = useAuth();

  const [products, setProducts] = useState<Product[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [brandFilter, setBrandFilter] = useState('all');
  const [cart, setCart] = useState<any[]>([]);

  useEffect(() => {
    fetchData();
  }, [ownedShopId]);

  // ─── EXISTING LOGIC PRESERVED ───
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
          .select('id, shop_name, phone, city')
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

  const addToCart = (product: any) => {
    const exists = cart.find((item) => item.id === product.id);
    if (exists) {
      setCart(
        cart.map((item) =>
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        )
      );
    } else {
      setCart([...cart, { ...product, quantity: 1 }]);
    }
  };

  const removeFromCart = (id: number) => {
    setCart(cart.filter((item) => item.id !== id));
  };

  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const mergedProducts = useMemo(() => {
    return products.map((p) => {
      const shop = shops.find((s) => String(s.id) === String(p.shop_id));
      return {
        ...p,
        shop_name: shop?.shop_name ?? 'محل غير معروف',
        shop_phone: shop?.phone ?? '-',
        shop_city: shop?.city ?? 'المنطقة غير محددة',
      };
    });
  }, [products, shops]);

  const brands = ['all', ...new Set(mergedProducts.map((p) => p.brand).filter(Boolean))];

  const filtered = mergedProducts.filter((p) => {
    const matchesQuery =
      query === '' ||
      p.part_name?.toLowerCase().includes(query.toLowerCase()) ||
      p.part_number?.toLowerCase().includes(query.toLowerCase()) ||
      p.model?.toLowerCase().includes(query.toLowerCase());

    const matchesBrand = brandFilter === 'all' || p.brand === brandFilter;
    return matchesQuery && matchesBrand;
  });

  const getStockStatus = (quantity: number) => {
    if (quantity > 5) {
      return {
        label: isRTL ? 'متوفر' : 'Available',
        color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
        dot: 'bg-emerald-500'
      };
    }
    return {
      label: isRTL ? 'كمية منخفضة' : 'Low Stock',
      color: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
      dot: 'bg-amber-500'
    };
  };

  const createOrder = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { alert('يجب تسجيل الدخول'); return; }

      const { data: myShop, error: shopError } = await supabase
        .from('shops').select('*').eq('owner_id', user.id).single();
      if (shopError || !myShop) { console.error(shopError); alert('المحل غير موجود'); return; }

      const grouped: any = {};
      cart.forEach((item) => {
        if (!grouped[item.shop_id]) grouped[item.shop_id] = [];
        grouped[item.shop_id].push(item);
      });

      for (const shopId in grouped) {
        const items = grouped[shopId];
        const orderTotal = items.reduce((sum: number, item: any) => sum + item.price * item.quantity, 0);

        const { data: order, error: orderError } = await supabase
          .from('orders')
          .insert({ from_shop_id: myShop.id, to_shop_id: Number(shopId), status: 'pending', total_amount: orderTotal })
          .select().single();
        if (orderError || !order) { console.error('ORDER ERROR:', orderError); continue; }

        const orderItems = items.map((item: any) => ({
          order_id: order.id, product_id: item.id, quantity: item.quantity, price: item.price,
        }));
        const { error: itemsError } = await supabase.from('order_items').insert(orderItems);
        if (itemsError) console.error('ITEMS ERROR:', itemsError);

        await supabase.from('notifications').insert({
          shop_id: Number(order.to_shop_id),
          title: 'طلب جديد',
          message: `تم استلام طلب جديد رقم #${order.id}`,
          type: 'new_order',
        });
      }

      setCart([]);
      alert('تم إنشاء الطلب بنجاح');
    } catch (error: any) {
      console.error('CREATE ORDER ERROR:', error);
      alert(error?.message || 'حدث خطأ أثناء إنشاء الطلب');
    }
  };

  return (
    <div className="min-h-screen bg-[#0b0f1a] pb-32" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* ─── HERO SEARCH SECTION ─── */}
      <div className="relative bg-gradient-to-b from-blue-900/20 to-transparent pt-12 pb-8 px-4 md:px-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-black text-white italic tracking-tighter">
                {isRTL ? 'بحث قطع الغيار' : 'Search Spare Parts'}
              </h1>
              <p className="text-slate-400 text-sm mt-1 font-medium">
                {isRTL ? `تم العثور على ${filtered.length} منتج في السوق` : `Found ${filtered.length} products in market`}
              </p>
            </div>
            <button
              onClick={fetchData}
              className="self-start md:self-center h-10 px-4 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-all flex items-center gap-2 text-xs font-bold"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              {isRTL ? 'تحديث البيانات' : 'Sync Data'}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="md:col-span-3 relative group">
              <Search size={20} className="absolute top-1/2 -translate-y-1/2 right-4 text-slate-500 group-focus-within:text-blue-500 transition-colors" />
              <input
                type="text"
                placeholder={isRTL ? "ابحث باسم القطعة أو رقمها..." : "Search by name or part number..."}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full bg-slate-900/80 border border-slate-800 rounded-2xl h-14 text-white pr-12 pl-4 placeholder-slate-600 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all text-base font-medium"
              />
            </div>
            <div className="relative">
              <Filter size={16} className="absolute top-1/2 -translate-y-1/2 right-4 text-slate-500" />
              <select
                value={brandFilter}
                onChange={(e) => setBrandFilter(e.target.value)}
                className="w-full bg-slate-900/80 border border-slate-800 rounded-2xl h-14 text-white pr-11 pl-4 appearance-none focus:outline-none focus:border-blue-500 text-sm font-bold cursor-pointer"
              >
                <option value="all">{isRTL ? 'كل الماركات' : 'All Brands'}</option>
                {brands.filter((b) => b !== 'all').map((brand) => (
                  <option key={brand} value={brand}>{brand}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute top-1/2 -translate-y-1/2 left-4 text-slate-600 pointer-events-none" />
            </div>
          </div>
        </div>
      </div>

      {/* ─── LOADING STATE ─── */}
      {loading && (
        <div className="max-w-7xl mx-auto px-4 py-20 text-center space-y-4">
          <div className="w-12 h-12 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mx-auto" />
          <p className="text-slate-500 font-black italic tracking-widest uppercase text-xs">{isRTL ? 'جاري جلب أفضل الأسعار...' : 'Fetching best prices...'}</p>
        </div>
      )}

      {/* ─── EMPTY STATE ─── */}
      {!loading && filtered.length === 0 && (
        <div className="max-w-7xl mx-auto px-4 py-32 text-center space-y-6">
          <div className="bg-slate-900 w-24 h-24 rounded-[2rem] flex items-center justify-center mx-auto text-slate-700">
            <Package size={48} />
          </div>
          <div>
            <h3 className="text-xl font-bold text-white">{isRTL ? 'لا توجد نتائج' : 'No Results Found'}</h3>
            <p className="text-slate-500 text-sm mt-1">{isRTL ? 'جرب كلمات بحث مختلفة أو تغيير الماركة' : 'Try different keywords or brand filters'}</p>
          </div>
        </div>
      )}

      {/* ─── PRODUCTS GRID ─── */}
      {!loading && (
        <div className="max-w-7xl mx-auto px-4 md:px-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((p) => {
            const status = getStockStatus(p.quantity);
            return (
              <div
                key={p.id}
                className="group bg-slate-900 border border-slate-800 hover:border-blue-500/40 rounded-[2.5rem] p-6 transition-all duration-300 shadow-2xl relative flex flex-col"
              >
                <div className="flex justify-between items-start mb-6">
                  <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-[10px] font-black uppercase italic ${status.color}`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                    {status.label}
                  </div>
                  <div className="text-left">
                    <p className="text-slate-600 text-[10px] font-black uppercase mb-1 tracking-tighter">{isRTL ? 'السعر' : 'Price'}</p>
                    <div className="text-2xl font-black italic text-blue-400 tracking-tighter">
                      {p.price} <span className="text-[10px] not-italic font-bold">ر.س</span>
                    </div>
                  </div>
                </div>

                <div className="flex-1 space-y-1 mb-6">
                  <h2 className="text-xl font-black text-white italic tracking-tight leading-tight">
                    {p.part_name}
                  </h2>
                  <div className="inline-block bg-slate-950 border border-slate-800 px-3 py-1 rounded-xl text-blue-500 font-black italic tracking-widest text-xs font-mono">
                    {p.part_number}
                  </div>
                </div>

                <div className="bg-slate-950/50 rounded-3xl p-4 space-y-3 mb-6 border border-slate-800/50">
                  <div className="flex items-center gap-3 text-slate-400 text-xs font-bold italic">
                    <Tag size={14} className="text-blue-500" />
                    {p.brand} <span className="text-slate-700">|</span> {p.model}
                  </div>
                  <div className="flex items-center gap-3 text-slate-400 text-xs font-bold italic">
                    <Store size={14} className="text-emerald-500" />
                    <span className="truncate text-white">{p.shop_name}</span>
                  </div>
                  <div className="flex items-center gap-3 text-slate-500 text-[10px] font-black italic uppercase">
                    <MapPin size={14} className="text-amber-500" />
                    {p.shop_city}
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2">
                  <a 
                    href={`tel:${p.shop_phone}`}
                    className="h-12 rounded-2xl bg-slate-800 text-blue-400 flex items-center justify-center hover:bg-blue-600 hover:text-white transition-all border border-slate-700"
                  >
                    <Phone size={20} />
                  </a>
                  <a 
                    href={`https://wa.me/${p.shop_phone.replace(/\s+/g, '')}`}
                    target="_blank"
                    className="h-12 rounded-2xl bg-slate-800 text-emerald-400 flex items-center justify-center hover:bg-emerald-600 hover:text-white transition-all border border-slate-700"
                  >
                    <MessageCircle size={20} />
                  </a>
                  <button 
                    className="h-12 rounded-2xl bg-slate-800 text-amber-500 flex items-center justify-center hover:bg-amber-600 hover:text-white transition-all border border-slate-700"
                  >
                    <MapPin size={20} />
                  </button>
                  <button
                    onClick={() => addToCart(p)}
                    className="h-12 rounded-2xl bg-blue-600 text-white flex flex-col items-center justify-center shadow-lg shadow-blue-900/20 active:scale-95 transition-all font-black italic uppercase"
                  >
                    <Plus size={20} strokeWidth={3} />
                    <span className="text-[8px] -mt-0.5 tracking-tighter">{isRTL ? 'إضافة' : 'Add'}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── CART OVERLAY ─── */}
      {cart.length > 0 && (
        <div className="fixed bottom-6 left-4 right-4 md:left-auto md:w-[450px] bg-slate-900 border border-slate-800 rounded-[2.5rem] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.8)] z-50 animate-in slide-in-from-bottom-10">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="relative bg-blue-600 p-2.5 rounded-2xl">
                <ShoppingCart size={22} className="text-white" />
                <span className="absolute -top-2 -right-2 bg-white text-blue-600 text-[10px] font-black h-5 w-5 rounded-full flex items-center justify-center ring-4 ring-slate-900">
                  {cart.length}
                </span>
              </div>
              <h3 className="font-black italic text-xl text-white italic tracking-tight">{isRTL ? 'سلة الطلب' : 'Order Basket'}</h3>
            </div>
            <button onClick={() => setCart([])} className="text-slate-500 hover:text-white p-2 transition-colors">
              <X size={20} />
            </button>
          </div>

          <div className="space-y-3 max-h-56 overflow-auto mb-6 px-1 scrollbar-hide">
            {cart.map((item) => (
              <div key={item.id} className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white truncate italic">{item.part_name}</p>
                  <p className="text-[10px] text-slate-500 mt-1 font-black italic uppercase tracking-tighter">{item.price} ر.س / {isRTL ? 'قطعة' : 'Unit'}</p>
                </div>
                <div className="flex items-center gap-3 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800">
                  <input
                    type="number"
                    min="1"
                    value={item.quantity}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      setCart(cart.map((cartItem) =>
                        cartItem.id === item.id
                          ? { ...cartItem, quantity: value > 0 ? value : 1 }
                          : cartItem
                      ));
                    }}
                    className="w-10 bg-transparent text-center text-white text-sm font-black italic focus:outline-none"
                  />
                </div>
                <button
                  onClick={() => removeFromCart(item.id)}
                  className="text-slate-600 hover:text-rose-500 p-1 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>

          <div className="pt-6 border-t border-slate-800">
            <div className="flex items-center justify-between mb-6">
              <span className="text-slate-500 font-black italic uppercase text-xs tracking-widest">{isRTL ? 'الإجمالي' : 'Subtotal'}</span>
              <span className="text-3xl font-black italic text-blue-400 tracking-tighter">{total} <span className="text-[10px] not-italic font-bold">ر.س</span></span>
            </div>
            <button
              onClick={createOrder}
              className="w-full h-16 rounded-2xl bg-blue-600 text-white font-black italic text-lg shadow-xl shadow-blue-900/30 active:scale-95 transition-all flex items-center justify-center gap-3"
            >
              <ShoppingCart size={20} />
              {isRTL ? 'تأكيد الطلب الآن' : 'Confirm Order Now'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}