import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  Package,
  Search,
  RefreshCw,
  Boxes,
  Store,
} from 'lucide-react';

type Product = {
  id: number;
  part_number: string;
  part_name: string;
  brand: string;
  model: string;
  quantity: number;
  shop_id: number;
};

// Task 3: shop name map type
type ShopMap = Record<number, string>;

export default function GlobalInventoryPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [filtered, setFiltered] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  // Task 3: shop names state
  const [shopMap, setShopMap] = useState<ShopMap>({});

  const loadProducts = async () => {
    setLoading(true);

    // Task 3: fetch products + shops in parallel
    const [productsRes, shopsRes] = await Promise.all([
      supabase.from('products').select('*').order('id', { ascending: false }),
      supabase.from('shops').select('id, shop_name'),
    ]);

    const rows: Product[] = productsRes.data || [];

    // Task 3: build shop_id → shop_name map
    const map: ShopMap = {};
    for (const shop of (shopsRes.data || [])) {
      map[shop.id] = shop.shop_name;
    }

    setShopMap(map);
    setProducts(rows);
    setFiltered(rows);
    setLoading(false);
  };

  useEffect(() => {
    loadProducts();
  }, []);

  useEffect(() => {
    const value = search.toLowerCase();
    setFiltered(
      products.filter(
        p =>
          p.part_name?.toLowerCase().includes(value) ||
          p.part_number?.toLowerCase().includes(value) ||
          p.brand?.toLowerCase().includes(value) ||
          p.model?.toLowerCase().includes(value)
      )
    );
  }, [search, products]);

  const totalProducts = products.length;
  const totalQuantity = products.reduce((sum, p) => sum + (p.quantity || 0), 0);

  return (
    <div className="space-y-6 animate-in fade-in duration-500 text-right" dir="rtl">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-black text-white mb-2">المخزون العام</h1>
          <p className="text-slate-400">جميع منتجات جميع المحلات</p>
        </div>
        <button
          onClick={loadProducts}
          className="px-5 py-3 rounded-2xl bg-slate-800 border border-slate-700 hover:bg-slate-700 transition"
        >
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-slate-900 rounded-3xl p-6 border border-slate-800">
          <div className="flex justify-between items-center">
            <Package className="text-blue-400" />
            <h2 className="text-4xl font-black">{totalProducts}</h2>
          </div>
          <p className="text-slate-400 mt-3">إجمالي المنتجات</p>
        </div>
        <div className="bg-slate-900 rounded-3xl p-6 border border-slate-800">
          <div className="flex justify-between items-center">
            <Boxes className="text-green-400" />
            <h2 className="text-4xl font-black text-green-400">{totalQuantity}</h2>
          </div>
          <p className="text-slate-400 mt-3">إجمالي الكميات</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute top-4 right-4 text-slate-500" size={18} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ابحث باسم القطعة أو رقم القطعة..."
          className="w-full bg-slate-900 border border-slate-800 rounded-2xl pr-12 pl-4 py-4 outline-none text-white placeholder-slate-600"
        />
      </div>

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-950">
            <tr className="text-slate-400 text-sm font-bold">
              <th className="p-4 text-right">رقم القطعة</th>
              <th className="p-4 text-right">اسم القطعة</th>
              <th className="p-4 text-right">الماركة</th>
              <th className="p-4 text-right">الموديل</th>
              {/* Task 3: header updated */}
              <th className="p-4 text-right">اسم المحل</th>
              <th className="p-4 text-right">الكمية</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(product => (
              <tr key={product.id} className="border-t border-slate-800 hover:bg-slate-800/30 transition-colors">
                <td className="p-4 font-mono text-slate-300 text-sm">{product.part_number}</td>
                <td className="p-4 font-semibold text-white">{product.part_name}</td>
                <td className="p-4 text-slate-400">{product.brand || '—'}</td>
                <td className="p-4 text-slate-400">{product.model || '—'}</td>
                {/* Task 3: show shop name instead of #shop_id */}
                <td className="p-4">
                  <div className="flex items-center gap-1.5">
                    <Store size={13} className="text-emerald-500 shrink-0" />
                    <span className="text-slate-300 text-sm font-medium">
                      {shopMap[product.shop_id] ?? `#${product.shop_id}`}
                    </span>
                  </div>
                </td>
                <td className="p-4">
                  <span className={`font-black text-base tabular-nums ${
                    product.quantity === 0 ? 'text-red-400' :
                    product.quantity <= 5 ? 'text-amber-400' : 'text-white'
                  }`}>
                    {product.quantity}
                  </span>
                </td>
              </tr>
            ))}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="p-12 text-center text-slate-600 italic">
                  لا توجد نتائج مطابقة
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {loading && (
          <div className="p-8 text-center text-slate-500 flex items-center justify-center gap-2">
            <RefreshCw size={16} className="animate-spin" />
            جاري تحميل البيانات...
          </div>
        )}
      </div>
    </div>
  );
}
