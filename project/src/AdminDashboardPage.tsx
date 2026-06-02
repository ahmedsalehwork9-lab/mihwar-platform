import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useLang } from '../hooks/useLang';

import {
  Store,
  Package,
  ShoppingCart,
  CheckCircle,
  Plus,
} from 'lucide-react';

export default function AdminDashboardPage() {

  const { t } = useLang();

  const [stats, setStats] = useState({
    shops: 0,
    active: 0,
    products: 0,
    orders: 0,
  });

  const [newShop, setNewShop] = useState({
    shop_name: '',
    phone: '',
    city: '',
  });

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {

    const { count: shops } = await supabase
      .from('shops')
      .select('*', { count: 'exact', head: true });

    const { count: active } = await supabase
      .from('shops')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true);

    const { count: products } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true });

    const { count: orders } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true });

    setStats({
      shops: shops || 0,
      active: active || 0,
      products: products || 0,
      orders: orders || 0,
    });
  };

  const createShop = async () => {

    if (!newShop.shop_name || !newShop.phone) {
      alert(t('Please enter the required data', 'أدخل البيانات'));
      return;
    }

    try {

      setLoading(true);

      const { error } = await supabase
        .from('shops')
        .insert({
          shop_name: newShop.shop_name,
          phone: newShop.phone,
          city: newShop.city,
          is_active: true,
        });

      if (error) {
        console.error(error);
        alert(t('An error occurred', 'حدث خطأ'));
        return;
      }

      alert(t('Shop created successfully', 'تم إنشاء المحل'));

      setNewShop({
        shop_name: '',
        phone: '',
        city: '',
      });

      loadStats();

    } catch (error) {

      console.error(error);
      alert(t('An error occurred', 'حدث خطأ'));

    } finally {

      setLoading(false);

    }
  };

  return (

    <div className="p-6 text-white">

      <div className="mb-8">
        <h1 className="text-3xl font-bold">
          {t('Admin Dashboard', 'لوحة تحكم الأدمن')}
        </h1>

        <p className="text-slate-400 mt-2">
          {t('Manage the platform and shops', 'إدارة المنصة والمحلات')}
        </p>
      </div>

      {/* STATS */}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 mb-8">

        <div className="bg-slate-900 border border-slate-700 rounded-3xl p-5">
          <div className="flex items-center justify-between mb-4">
            <Store className="text-blue-400" />
            <span className="text-slate-400 text-sm">
              {t('Shops', 'المحلات')}
            </span>
          </div>

          <div className="text-4xl font-bold text-blue-400">
            {stats.shops}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-700 rounded-3xl p-5">
          <div className="flex items-center justify-between mb-4">
            <CheckCircle className="text-emerald-400" />
            <span className="text-slate-400 text-sm">
              {t('Active Shops', 'المحلات الفعالة')}
            </span>
          </div>

          <div className="text-4xl font-bold text-emerald-400">
            {stats.active}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-700 rounded-3xl p-5">
          <div className="flex items-center justify-between mb-4">
            <Package className="text-amber-400" />
            <span className="text-slate-400 text-sm">
              {t('Products', 'المنتجات')}
            </span>
          </div>

          <div className="text-4xl font-bold text-amber-400">
            {stats.products}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-700 rounded-3xl p-5">
          <div className="flex items-center justify-between mb-4">
            <ShoppingCart className="text-pink-400" />
            <span className="text-slate-400 text-sm">
              {t('Orders', 'الطلبات')}
            </span>
          </div>

          <div className="text-4xl font-bold text-pink-400">
            {stats.orders}
          </div>
        </div>

      </div>

      {/* ADD SHOP */}

      <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6">

        <div className="flex items-center gap-2 mb-5">
          <Plus className="text-blue-400" />

          <h2 className="text-xl font-bold">
            {t('Add New Shop', 'إضافة محل جديد')}
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          <input
            type="text"
            placeholder={t('Shop Name', 'اسم المحل')}
            value={newShop.shop_name}
            onChange={(e) =>
              setNewShop({
                ...newShop,
                shop_name: e.target.value,
              })
            }
            className="h-12 rounded-2xl bg-slate-950 border border-slate-700 px-4"
          />

          <input
            type="text"
            placeholder={t('Phone Number', 'رقم الجوال')}
            value={newShop.phone}
            onChange={(e) =>
              setNewShop({
                ...newShop,
                phone: e.target.value,
              })
            }
            className="h-12 rounded-2xl bg-slate-950 border border-slate-700 px-4"
          />

          <input
            type="text"
            placeholder={t('City', 'المدينة')}
            value={newShop.city}
            onChange={(e) =>
              setNewShop({
                ...newShop,
                city: e.target.value,
              })
            }
            className="h-12 rounded-2xl bg-slate-950 border border-slate-700 px-4"
          />

        </div>

        <button
          onClick={createShop}
          disabled={loading}
          className="mt-5 h-12 px-8 rounded-2xl bg-blue-600 hover:bg-blue-500 transition-all font-bold"
        >
          {loading ? t('Creating...', 'جاري الإنشاء...') : t('Create Shop', 'إنشاء محل')}
        </button>

      </div>

    </div>
  );
}
