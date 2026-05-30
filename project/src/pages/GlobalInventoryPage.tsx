import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  Package,
  Search,
  RefreshCw,
  Boxes
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

export default function GlobalInventoryPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [filtered, setFiltered] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const loadProducts = async () => {
    setLoading(true);

    const { data } = await supabase
      .from('products')
      .select('*')
      .order('id', { ascending: false });

    const rows = data || [];

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

  const totalQuantity = products.reduce(
    (sum, p) => sum + (p.quantity || 0),
    0
  );

  return (
    <div
      className="space-y-6 animate-in fade-in duration-500 text-right"
      dir="rtl"
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-black text-white mb-2">
            المخزون العام
          </h1>

          <p className="text-slate-400">
            جميع منتجات جميع المحلات
          </p>
        </div>

        <button
          onClick={loadProducts}
          className="px-5 py-3 rounded-2xl bg-slate-800 border border-slate-700 hover:bg-slate-700 transition"
        >
          <RefreshCw size={18} />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        <div className="bg-slate-900 rounded-3xl p-6 border border-slate-800">
          <div className="flex justify-between items-center">
            <Package className="text-blue-400" />
            <h2 className="text-4xl font-black">
              {totalProducts}
            </h2>
          </div>

          <p className="text-slate-400 mt-3">
            إجمالي المنتجات
          </p>
        </div>

        <div className="bg-slate-900 rounded-3xl p-6 border border-slate-800">
          <div className="flex justify-between items-center">
            <Boxes className="text-green-400" />
            <h2 className="text-4xl font-black text-green-400">
              {totalQuantity}
            </h2>
          </div>

          <p className="text-slate-400 mt-3">
            إجمالي الكميات
          </p>
        </div>

      </div>

      <div className="relative">
        <Search
          className="absolute top-4 right-4 text-slate-500"
          size={18}
        />

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ابحث باسم القطعة أو رقم القطعة..."
          className="w-full bg-slate-900 border border-slate-800 rounded-2xl pr-12 pl-4 py-4 outline-none"
        />
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden">

        <table className="w-full">
          <thead className="bg-slate-950">
            <tr>
              <th className="p-4">رقم القطعة</th>
              <th className="p-4">اسم القطعة</th>
              <th className="p-4">الماركة</th>
              <th className="p-4">الموديل</th>
              <th className="p-4">المحل</th>
              <th className="p-4">الكمية</th>
            </tr>
          </thead>

          <tbody>

            {filtered.map(product => (
              <tr
                key={product.id}
                className="border-t border-slate-800"
              >
                <td className="p-4 font-mono">
                  {product.part_number}
                </td>

                <td className="p-4 font-semibold">
                  {product.part_name}
                </td>

                <td className="p-4">
                  {product.brand}
                </td>

                <td className="p-4">
                  {product.model}
                </td>

                <td className="p-4">
                  #{product.shop_id}
                </td>

                <td className="p-4">
                  {product.quantity}
                </td>
              </tr>
            ))}

          </tbody>
        </table>

        {loading && (
          <div className="p-8 text-center">
            جاري تحميل البيانات...
          </div>
        )}

      </div>
    </div>
  );
}