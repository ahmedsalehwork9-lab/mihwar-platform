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
};

export default function SearchPage() {

  const { lang, isRTL } = useLang();
  const { ownedShopId } = useAuth();

  const [products, setProducts] = useState<Product[]>([]);
  const [shops, setShops]       = useState<Shop[]>([]);
  const [loading, setLoading]   = useState(false);
  const [query, setQuery]       = useState('');
  const [brandFilter, setBrandFilter] = useState('all');
  const [cart, setCart]         = useState<any[]>([]);

  useEffect(() => { fetchData(); }, [ownedShopId]);

  // ── لا تعديل على أي منطق أعمال ──────────────────────────────
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

  const addToCart = (product: any) => {
    const exists = cart.find((item) => item.id === product.id);
    if (exists) {
      setCart(cart.map((item) =>
        item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
      ));
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
        shop_name:  shop?.shop_name ?? 'محل غير معروف',
        shop_phone: shop?.phone     ?? '-',
      };
    });
  }, [products, shops]);

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

  const stockBadge = (quantity: number) => {
    if (quantity > 5) {
      return (
        <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          متوفر
        </span>
      );
    }
    return (
      <span className="text-xs px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
        كمية منخفضة
      </span>
    );
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

        const { error: notificationError } = await supabase.from('notifications').insert({
          shop_id: Number(order.to_shop_id),
          title: 'طلب جديد',
          message: `تم استلام طلب جديد رقم #${order.id}`,
          type: 'new_order',
        });
        if (notificationError) console.error('NOTIFICATION ERROR:', notificationError);
      }

      setCart([]);
      alert('تم إنشاء الطلب بنجاح');
    } catch (error: any) {
      console.error('CREATE ORDER ERROR:', error);
      alert(error?.message || 'حدث خطأ أثناء إنشاء الطلب');
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-4 lg:p-6 text-white" dir={isRTL ? 'rtl' : 'ltr'}>

      {/* ── HEADER ─────────────────────────────────────────────────── */}
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-4 mb-5">
        <div className="flex flex-col gap-3">

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="bg-blue-500/10 p-2 rounded-xl border border-blue-500/20">
                <Search size={16} className="text-blue-400" />
              </div>
              <div>
                <h1 className="text-lg font-bold">بحث قطع الغيار</h1>
                <p className="text-slate-500 text-xs">تم العثور على {filtered.length} منتج</p>
              </div>
            </div>
            <button
              onClick={fetchData}
              className="h-9 px-3 rounded-xl border border-slate-700 hover:border-slate-500 text-slate-400 flex items-center gap-1.5 transition-all text-sm"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              تحديث
            </button>
          </div>

          {/* Search + Filter في صف واحد */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={14} className="absolute top-1/2 -translate-y-1/2 right-3 text-slate-500" />
              <input
                type="text"
                placeholder="ابحث باسم القطعة أو رقمها..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl h-10 text-sm text-white pr-9 pl-3 placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="relative">
              <Filter size={13} className="absolute top-1/2 -translate-y-1/2 right-3 text-slate-500 pointer-events-none" />
              <select
                value={brandFilter}
                onChange={(e) => setBrandFilter(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-xl h-10 text-sm text-white pr-8 pl-6 appearance-none focus:outline-none focus:border-blue-500"
              >
                <option value="all">كل الماركات</option>
                {brands.filter((b) => b !== 'all').map((brand) => (
                  <option key={brand} value={brand}>{brand}</option>
                ))}
              </select>
            </div>
          </div>

        </div>
      </div>

      {/* ── LOADING ─────────────────────────────────────────────────── */}
      {loading && (
        <div className="bg-slate-900 border border-slate-700 rounded-2xl p-10 text-center text-slate-400 text-sm">
          <RefreshCw size={18} className="animate-spin mx-auto mb-2 text-blue-500" />
          جاري التحميل...
        </div>
      )}

      {/* ── PRODUCTS GRID ───────────────────────────────────────────── */}
      {!loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((p) => (
            <div
              key={p.id}
              className="bg-slate-900 border border-slate-700 hover:border-slate-600 rounded-2xl p-4 transition-all duration-200"
            >
              {/* Badge */}
              <div className="mb-3">{stockBadge(p.quantity)}</div>

              {/* Name + Part number */}
              <h2 className="text-base font-bold text-white mb-1 leading-snug">{p.part_name}</h2>
              <div className="text-xs text-slate-500 font-mono mb-4">{p.part_number}</div>

              {/* Meta info */}
              <div className="space-y-1.5 mb-4">
                <div className="flex items-center gap-2 text-slate-400 text-xs">
                  <Tag size={12} className="text-blue-400 shrink-0" />
                  <span>{p.brand} • {p.model}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-400 text-xs">
                  <Store size={12} className="text-emerald-400 shrink-0" />
                  <span>{p.shop_name}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-400 text-xs">
                  <Phone size={12} className="text-amber-400 shrink-0" />
                  <span>{p.shop_phone}</span>
                </div>
              </div>

              {/* ── الكمية والسعر وزر الإضافة في صف واحد ── */}
              {/* FIX: زر + لم يعد absolute — صار جزء من الـ grid */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5">
                  <div className="text-[10px] text-slate-500 mb-1">الكمية</div>
                  <div className="text-lg font-bold text-white">{p.quantity}</div>
                </div>
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5">
                  <div className="text-[10px] text-slate-500 mb-1">السعر</div>
                  <div className="text-lg font-bold text-emerald-400">{p.price}</div>
                </div>
                <button
                  onClick={() => addToCart(p)}
                  className="bg-blue-600 hover:bg-blue-500 active:scale-95 transition-all rounded-xl flex items-center justify-center gap-1 flex-col"
                  title="إضافة للسلة"
                >
                  <Plus size={18} className="text-white" />
                  <span className="text-[9px] text-blue-200">إضافة</span>
                </button>
              </div>

            </div>
          ))}
        </div>
      )}

      {/* ── CART ────────────────────────────────────────────────────── */}
      {cart.length > 0 && (
        <div className="fixed bottom-4 left-4 right-4 lg:left-auto lg:w-[400px] bg-slate-900 border border-slate-700 rounded-2xl p-4 shadow-2xl z-50">

          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <ShoppingCart size={16} className="text-blue-400" />
              <h3 className="font-bold text-white text-sm">سلة الطلب</h3>
            </div>
            <span className="text-xs text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">{cart.length} أصناف</span>
          </div>

          <div className="space-y-2 max-h-64 overflow-auto">
            {cart.map((item) => (
              <div key={item.id} className="bg-slate-950 border border-slate-800 rounded-xl p-3">

                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium leading-snug truncate">{item.part_name}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{item.price} ر.س / الوحدة</div>
                  </div>
                  <button
                    onClick={() => removeFromCart(item.id)}
                    className="text-slate-600 hover:text-red-400 text-xs mr-2 transition-colors shrink-0"
                  >
                    حذف
                  </button>
                </div>

                <div className="flex items-center justify-between">
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
                    className="w-20 h-9 rounded-lg bg-slate-800 border border-slate-700 text-center text-white text-sm focus:outline-none focus:border-blue-500"
                  />
                  <div className="text-emerald-400 font-bold">
                    {item.price * item.quantity} ر.س
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 pt-3 border-t border-slate-800">
            <div className="flex items-center justify-between mb-3">
              <span className="text-slate-400 text-sm">الإجمالي</span>
              <span className="text-2xl font-bold text-emerald-400">{total} ر.س</span>
            </div>
            <button
              onClick={createOrder}
              className="w-full h-12 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] transition-all font-bold text-base"
            >
              إنشاء الطلب
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
