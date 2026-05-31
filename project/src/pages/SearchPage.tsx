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

  const isArabic = lang === 'ar';

  const [products, setProducts] = useState<Product[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);   // ← أُعيد كما كان
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [brandFilter, setBrandFilter] = useState('all');
  const [cart, setCart] = useState<any[]>([]);

  useEffect(() => {
    fetchData();
  }, [ownedShopId]);

  const fetchData = async () => {
    try {
      setLoading(true);

      // ── جلب المنتجات أولاً (بدون أي join) ───────────────────────────────
      let productsQuery = supabase
        .from('products')
        .select('*')
        .gt('quantity', 0)
        .order('created_at', { ascending: false });

      if (ownedShopId) {
        productsQuery = productsQuery.neq('shop_id', ownedShopId);
      }

      const { data: productsData, error: productsError } = await productsQuery;

      if (productsError) {
        console.error('خطأ في جلب المنتجات:', productsError);
      }

      // ── جلب المحلات ثانياً (استعلام مستقل) ──────────────────────────────
      const { data: shopsData, error: shopsError } = await supabase
        .from('shops')
        .select('id, shop_name, phone');

      if (shopsError) {
        console.error('خطأ في جلب المحلات:', shopsError);
      }

      // ── console logs للتشخيص ──────────────────────────────────────────────
      const fetchedProducts = productsData || [];
      const fetchedShops    = shopsData    || [];

      console.log(`[SearchPage] عدد المنتجات المُجلَبة: ${fetchedProducts.length}`);
      console.log(`[SearchPage] عدد المحلات المُجلَبة:  ${fetchedShops.length}`);

      // المنتجات التي لا يوجد لها محل مطابق
      const shopIds = new Set(fetchedShops.map((s: Shop) => String(s.id)));
      const orphans = fetchedProducts.filter(
        (p: Product) => !shopIds.has(String(p.shop_id))
      );
      if (orphans.length > 0) {
        console.warn(
          `[SearchPage] منتجات بدون محل مطابق (${orphans.length}):`,
          orphans.map((p: Product) => ({ id: p.id, shop_id: p.shop_id, part_name: p.part_name }))
        );
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

  // ── Mapping يدوي: ربط product.shop_id بـ shop.id داخل React ─────────────
  // لا يعتمد على Foreign Key في قاعدة البيانات.
  // نحوّل كلا الجانبين إلى String لتفادي عدم تطابق number vs string.
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
        <span className="text-xs px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          متوفر
        </span>
      );
    }
    return (
      <span className="text-xs px-3 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
        كمية منخفضة
      </span>
    );
  };

  const createOrder = async () => {

    try {

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        alert('يجب تسجيل الدخول');
        return;
      }

      // جلب متجر المستخدم الحالي
      const { data: myShop, error: shopError } = await supabase
        .from('shops')
        .select('*')
        .eq('owner_id', user.id)
        .single();

      if (shopError || !myShop) {
        console.error(shopError);
        alert('المحل غير موجود');
        return;
      }

      // تجميع المنتجات حسب المتجر
      const grouped: any = {};

      cart.forEach((item) => {
        if (!grouped[item.shop_id]) {
          grouped[item.shop_id] = [];
        }
        grouped[item.shop_id].push(item);
      });

      // إنشاء طلب لكل متجر
      for (const shopId in grouped) {

        const items = grouped[shopId];

        const orderTotal = items.reduce(
          (sum: number, item: any) => sum + item.price * item.quantity,
          0
        );

        // إنشاء الطلب
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

        // إنشاء عناصر الطلب
        const orderItems = items.map((item: any) => ({
          order_id: order.id,
          product_id: item.id,
          quantity: item.quantity,
          price: item.price,
        }));

        const { error: itemsError } = await supabase
          .from('order_items')
          .insert(orderItems);

        if (itemsError) {
          console.error('ITEMS ERROR:', itemsError);
        }

        // إنشاء إشعار
        const { error: notificationError } = await supabase
          .from('notifications')
          .insert({
            shop_id: Number(order.to_shop_id),
            title: 'طلب جديد',
            message: `تم استلام طلب جديد رقم #${order.id}`,
            type: 'new_order',
          });

        if (notificationError) {
          console.error('NOTIFICATION ERROR:', notificationError);
        }

      }

      // تنظيف السلة
      setCart([]);
      alert('تم إنشاء الطلب بنجاح');

    } catch (error: any) {
      console.error('CREATE ORDER ERROR:', error);
      alert(error?.message || 'حدث خطأ أثناء إنشاء الطلب');
    }

  };

  return (
    <div
      className="max-w-7xl mx-auto p-4 lg:p-6 text-white"
      dir={isRTL ? 'rtl' : 'ltr'}
    >

      {/* HEADER */}
      <div className="bg-slate-900 border border-slate-700 rounded-3xl p-5 mb-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">

          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="bg-blue-500/10 p-2 rounded-xl border border-blue-500/20">
                <Search size={18} className="text-blue-400" />
              </div>
              <h1 className="text-2xl font-bold">بحث قطع الغيار</h1>
            </div>
            <p className="text-slate-400 text-sm">
              تم العثور على {filtered.length} منتج
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">

            <div className="relative">
              <Search size={16} className="absolute top-1/2 -translate-y-1/2 right-3 text-slate-500" />
              <input
                type="text"
                placeholder="ابحث باسم القطعة أو رقمها..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-72 bg-slate-950 border border-slate-700 rounded-xl h-11 text-sm text-white pr-10 pl-4 placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="relative">
              <Filter size={15} className="absolute top-1/2 -translate-y-1/2 right-3 text-slate-500" />
              <select
                value={brandFilter}
                onChange={(e) => setBrandFilter(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-xl h-11 text-sm text-white pr-10 pl-8 appearance-none focus:outline-none focus:border-blue-500"
              >
                <option value="all">كل الماركات</option>
                {brands.filter((b) => b !== 'all').map((brand) => (
                  <option key={brand} value={brand}>{brand}</option>
                ))}
              </select>
            </div>

            <button
              onClick={fetchData}
              className="h-11 px-4 rounded-xl border border-slate-700 hover:border-slate-500 text-slate-300 flex items-center gap-2 transition-all"
            >
              <RefreshCw size={15} />
              تحديث
            </button>

          </div>
        </div>
      </div>

      {/* LOADING */}
      {loading && (
        <div className="bg-slate-900 border border-slate-700 rounded-3xl p-10 text-center text-slate-400">
          جاري التحميل...
        </div>
      )}

      {/* PRODUCTS */}
      {!loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map((p) => (
            <div
              key={p.id}
              className="relative bg-slate-900 border border-slate-700 hover:border-slate-500 rounded-3xl p-5 transition-all duration-300"
            >

              <div className="absolute top-4 left-4 z-10">
                {stockBadge(p.quantity)}
              </div>

              <button
                onClick={() => addToCart(p)}
                className="absolute bottom-4 left-4 w-11 h-11 rounded-2xl bg-blue-600 hover:bg-blue-500 transition-all flex items-center justify-center shadow-lg z-20"
              >
                <Plus size={18} />
              </button>

              <div className="pt-10">
                <h2 className="text-lg font-bold text-white mb-1 leading-relaxed">
                  {p.part_name}
                </h2>
                <div className="text-xs text-slate-400 font-mono mb-5">
                  {p.part_number}
                </div>

                <div className="flex items-center gap-2 text-slate-300 text-sm mb-2">
                  <Tag size={14} className="text-blue-400" />
                  {p.brand} • {p.model}
                </div>

                {/* اسم المحل */}
                <div className="flex items-center gap-2 text-slate-300 text-sm mb-2">
                  <Store size={14} className="text-emerald-400" />
                  {p.shop_name}
                </div>

                {/* رقم هاتف المحل */}
                <div className="flex items-center gap-2 text-slate-400 text-sm mb-5">
                  <Phone size={14} className="text-amber-400" />
                  {p.shop_phone}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3">
                    <div className="text-xs text-slate-400 mb-2">الكمية</div>
                    <div className="text-xl font-bold">{p.quantity}</div>
                  </div>
                  <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3">
                    <div className="text-xs text-slate-400 mb-2">السعر</div>
                    <div className="text-xl font-bold text-emerald-400">{p.price} ر.س</div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* CART */}
      {cart.length > 0 && (
        <div className="fixed bottom-5 left-5 right-5 lg:left-auto lg:w-[400px] bg-slate-900 border border-slate-700 rounded-3xl p-5 shadow-2xl z-50">

          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <ShoppingCart size={18} className="text-blue-400" />
              <h3 className="font-bold text-white">سلة الطلب</h3>
            </div>
            <div className="text-sm text-slate-400">{cart.length} أصناف</div>
          </div>

          <div className="space-y-3 max-h-72 overflow-auto pr-1">
            {cart.map((item) => (
              <div key={item.id} className="bg-slate-950 border border-slate-800 rounded-2xl p-3">

                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="text-sm font-medium leading-relaxed">{item.part_name}</div>
                    <div className="text-xs text-slate-400 mt-1">{item.price} ر.س / الوحدة</div>
                  </div>
                  <button
                    onClick={() => removeFromCart(item.id)}
                    className="text-red-400 text-xs hover:text-red-300"
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
                    className="w-24 h-11 rounded-xl bg-slate-800 border border-slate-700 text-center text-white focus:outline-none focus:border-blue-500"
                  />
                  <div className="text-emerald-400 font-bold text-lg">
                    {item.price * item.quantity} ر.س
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 pt-5 border-t border-slate-800">
            <div className="flex items-center justify-between mb-4">
              <span className="text-slate-400">الإجمالي</span>
              <span className="text-3xl font-bold text-emerald-400">{total} ر.س</span>
            </div>
            <button
              onClick={createOrder}
              className="w-full h-14 rounded-2xl bg-emerald-600 hover:bg-emerald-500 transition-all font-bold text-lg"
            >
              إنشاء الطلب
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
