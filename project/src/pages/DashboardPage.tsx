import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  Package, Boxes, DollarSign, RefreshCw,
  Store, User, Mail, TrendingUp, AlertTriangle,
  Activity, ShieldAlert,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LanguageContext';

type Product = {
  id: number;
  part_name: string;
  part_number: string;
  brand: string;
  quantity: number;
  price: number;
};

export default function DashboardPage() {
  const { user } = useAuth();
  const { lang, isRTL } = useLang();
  const isArabic = lang === 'ar';

  const [loading, setLoading] = useState(true);
  const [shop, setShop] = useState<any>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [stats, setStats] = useState({
    totalProducts: 0,
    totalInventory: 0,
    totalValue: 0,
    lowStock: 0,
  });

  useEffect(() => { loadDashboard(); }, []);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      if (!user) return;

      const { data: shopData } = await supabase
        .from('shops').select('*').eq('owner_id', user.id).maybeSingle();
      setShop(shopData);
      if (!shopData) return;

      const { data: productsData } = await supabase
        .from('products').select('*').eq('shop_id', shopData.id);

      const items: Product[] = productsData || [];
      setProducts(items);

      const totalInventory = items.reduce((a, i) => a + (i.quantity || 0), 0);
      const totalValue = items.reduce((a, i) => a + (i.quantity || 0) * (i.price || 0), 0);
      const lowStock = items.filter(i => i.quantity > 0 && i.quantity <= 5).length;
      const outOfStock = items.filter(i => i.quantity === 0).length;

      setStats({
        totalProducts: items.length,
        totalInventory,
        totalValue,
        lowStock: lowStock + outOfStock,
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // براندات للشارت
  const brandCounts = products.reduce((acc, p) => {
    if (p.brand) acc[p.brand] = (acc[p.brand] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const topBrands = Object.entries(brandCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const totalBrands = topBrands.reduce((a, b) => a + b[1], 0);

  const brandColors = [
    '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444'
  ];

  // منتجات منخفضة المخزون
  const lowStockProducts = products
    .filter(p => p.quantity <= 5)
    .sort((a, b) => a.quantity - b.quantity)
    .slice(0, 5);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw size={28} className="text-blue-400 animate-spin" />
          <div className="text-slate-400">{isArabic ? 'جارٍ التحميل...' : 'Loading...'}</div>
        </div>
      </div>
    );
  }

  return (
    <div dir={isRTL ? 'rtl' : 'ltr'} className="space-y-5 p-4 lg:p-6 text-white">

      {/* HEADER */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">

          <div>
            <h1 className="text-3xl font-black text-white">
              👋 {isArabic ? 'مرحباً' : 'Welcome'}{' '}
              <span className="text-blue-400">{shop?.shop_name || user?.email?.split('@')[0]}</span>
            </h1>
            <p className="text-slate-400 mt-1 text-sm">
              {isArabic ? 'أداء متجرك اليوم' : "Today's store performance"}
            </p>
            <button
              onClick={loadDashboard}
              className="mt-3 flex items-center gap-2 text-xs text-slate-500 hover:text-slate-300 transition"
            >
              <RefreshCw size={13} />
              {isArabic ? 'آخر تحديث: الآن' : 'Last updated: now'}
            </button>
          </div>

          {/* ACCOUNT INFO */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex flex-wrap gap-5">
            <div className="flex items-center gap-3">
              <div className="bg-emerald-500/10 p-2.5 rounded-xl"><Store size={16} className="text-emerald-400" /></div>
              <div>
                <div className="text-slate-500 text-xs">{isArabic ? 'اسم المحل' : 'Shop'}</div>
                <div className="text-white font-bold text-sm">{shop?.shop_name || '—'}</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="bg-blue-500/10 p-2.5 rounded-xl"><User size={16} className="text-blue-400" /></div>
              <div>
                <div className="text-slate-500 text-xs">{isArabic ? 'المستخدم' : 'User'}</div>
                <div className="text-white font-bold text-sm">{user?.email?.split('@')[0]}</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="bg-purple-500/10 p-2.5 rounded-xl"><Mail size={16} className="text-purple-400" /></div>
              <div>
                <div className="text-slate-500 text-xs">{isArabic ? 'البريد' : 'Email'}</div>
                <div className="text-white font-bold text-sm">{user?.email}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* STATS CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">

        {/* إجمالي المنتجات */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="bg-blue-500/10 p-2.5 rounded-xl"><Package size={18} className="text-blue-400" /></div>
            <span className="text-xs text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-full">↑ 12%</span>
          </div>
          <div className="text-3xl font-black text-white">{stats.totalProducts}</div>
          <div className="text-slate-400 text-xs mt-1">{isArabic ? 'إجمالي المنتجات' : 'Total Products'}</div>
          <div className="text-slate-600 text-xs">{isArabic ? 'عدد الأصناف' : 'Unique SKUs'}</div>
        </div>

        {/* الوحدات */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="bg-emerald-500/10 p-2.5 rounded-xl"><Boxes size={18} className="text-emerald-400" /></div>
            <span className="text-xs text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-full">↑ 8%</span>
          </div>
          <div className="text-3xl font-black text-white">{stats.totalInventory.toLocaleString()}</div>
          <div className="text-slate-400 text-xs mt-1">{isArabic ? 'الوحدات في المخزون' : 'Inventory Units'}</div>
          <div className="text-slate-600 text-xs">{isArabic ? 'إجمالي الكميات' : 'Total quantities'}</div>
        </div>

        {/* القيمة */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="bg-amber-500/10 p-2.5 rounded-xl"><DollarSign size={18} className="text-amber-400" /></div>
            <span className="text-xs text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-full">↑ 15%</span>
          </div>
          <div className="text-3xl font-black text-white">{stats.totalValue.toLocaleString()}</div>
          <div className="text-slate-400 text-xs mt-1">{isArabic ? 'القيمة الإجمالية' : 'Inventory Value'}</div>
          <div className="text-slate-600 text-xs">{isArabic ? 'ريال سعودي' : 'Saudi Riyal'}</div>
        </div>

        {/* منخفضة */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="bg-red-500/10 p-2.5 rounded-xl"><ShieldAlert size={18} className="text-red-400" /></div>
            <span className="text-xs text-red-400 bg-red-500/10 px-2 py-1 rounded-full">
              {stats.lowStock > 0 ? `- ${stats.lowStock}` : '✓'}
            </span>
          </div>
          <div className="text-3xl font-black text-white">{stats.lowStock}</div>
          <div className="text-slate-400 text-xs mt-1">{isArabic ? 'منتجات منخفضة' : 'Low Stock'}</div>
          <div className="text-slate-600 text-xs">{isArabic ? 'تحتاج تجديد' : 'Need restocking'}</div>
        </div>
      </div>

      {/* CHARTS ROW */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* حركة المخزون - Bar Chart */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">
          <div className="flex items-center gap-2 mb-5">
            <Activity size={18} className="text-blue-400" />
            <h2 className="font-bold text-white">{isArabic ? 'حركة المبيعات والمخزون' : 'Sales & Inventory Movement'}</h2>
          </div>

          {/* Bar chart بسيط */}
          <div className="flex items-end gap-2 h-40">
            {['السبت','الأحد','الاثنين','الثلاثاء','الأرب','الخميس','الجمعة'].map((day, i) => {
              const inventory = [180, 220, 160, 200, 240, 190, 210][i];
              const sales = [80, 120, 60, 140, 100, 90, 130][i];
              const maxVal = 300;
              return (
                <div key={day} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full flex items-end gap-0.5 h-32">
                    <div
                      className="flex-1 bg-blue-500/60 rounded-t hover:bg-blue-500 transition-all"
                      style={{ height: `${(inventory / maxVal) * 100}%` }}
                    />
                    <div
                      className="flex-1 bg-emerald-500/60 rounded-t hover:bg-emerald-500 transition-all"
                      style={{ height: `${(sales / maxVal) * 100}%` }}
                    />
                  </div>
                  <div className="text-slate-600 text-[10px]">{day}</div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-4 mt-3">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-blue-500" />
              <span className="text-xs text-slate-400">{isArabic ? 'الوحدات الداخلة' : 'Stock In'}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-emerald-500" />
              <span className="text-xs text-slate-400">{isArabic ? 'المبيعات' : 'Sales'}</span>
            </div>
          </div>
        </div>

        {/* توزيع المنتجات حسب الفئة - Donut */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">
          <div className="flex items-center gap-2 mb-5">
            <TrendingUp size={18} className="text-purple-400" />
            <h2 className="font-bold text-white">{isArabic ? 'توزيع المنتجات حسب الفئة' : 'Products by Brand'}</h2>
          </div>

          {topBrands.length === 0 ? (
            <div className="text-slate-500 text-center py-10">{isArabic ? 'لا توجد بيانات' : 'No data'}</div>
          ) : (
            <div className="flex items-center gap-6">
              {/* Donut SVG */}
              <div className="relative shrink-0">
                <svg width="130" height="130" viewBox="0 0 130 130">
                  {(() => {
                    let offset = 0;
                    const r = 50, cx = 65, cy = 65;
                    const circ = 2 * Math.PI * r;
                    return topBrands.map(([brand, count], i) => {
                      const pct = count / totalBrands;
                      const dash = pct * circ;
                      const gap = circ - dash;
                      const el = (
                        <circle
                          key={brand}
                          cx={cx} cy={cy} r={r}
                          fill="none"
                          stroke={brandColors[i]}
                          strokeWidth="22"
                          strokeDasharray={`${dash} ${gap}`}
                          strokeDashoffset={-offset}
                          style={{ transform: 'rotate(-90deg)', transformOrigin: '65px 65px' }}
                        />
                      );
                      offset += dash;
                      return el;
                    });
                  })()}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className="text-2xl font-black text-white">{stats.totalProducts}</div>
                  <div className="text-slate-500 text-[10px]">{isArabic ? 'إجمالي' : 'Total'}</div>
                </div>
              </div>

              {/* Legend */}
              <div className="space-y-2 flex-1">
                {topBrands.map(([brand, count], i) => (
                  <div key={brand} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: brandColors[i] }} />
                      <span className="text-slate-300 text-xs">{brand}</span>
                    </div>
                    <span className="text-white text-xs font-bold">
                      {Math.round((count / totalBrands) * 100)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* BOTTOM ROW */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* منتجات منخفضة المخزون */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <AlertTriangle size={18} className="text-amber-400" />
              <h2 className="font-bold text-white">{isArabic ? 'المنتجات منخفضة المخزون' : 'Low Stock Products'}</h2>
            </div>
          </div>

          {lowStockProducts.length === 0 ? (
            <div className="text-slate-500 text-center py-8 text-sm">
              {isArabic ? '✅ كل المنتجات بمخزون كافٍ' : '✅ All products well stocked'}
            </div>
          ) : (
            <div className="space-y-3">
              {/* Header */}
              <div className="grid grid-cols-4 text-xs text-slate-500 pb-2 border-b border-slate-800">
                <div>{isArabic ? 'المنتج' : 'Product'}</div>
                <div className="text-center">{isArabic ? 'رقم القطعة' : 'Part No.'}</div>
                <div className="text-center">{isArabic ? 'الكمية' : 'Qty'}</div>
                <div className="text-center">{isArabic ? 'الحالة' : 'Status'}</div>
              </div>
              {lowStockProducts.map(p => (
                <div key={p.id} className="grid grid-cols-4 items-center text-sm">
                  <div className="text-white truncate">{p.part_name}</div>
                  <div className="text-slate-400 text-xs text-center font-mono">{p.part_number}</div>
                  <div className="text-center font-bold text-white">{p.quantity}</div>
                  <div className="flex justify-center">
                    {p.quantity === 0 ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
                        {isArabic ? 'نفد' : 'Out'}
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        {isArabic ? 'منخفض' : 'Low'}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* آخر الأنشطة */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <Activity size={18} className="text-blue-400" />
              <h2 className="font-bold text-white">{isArabic ? 'آخر المنتجات المضافة' : 'Recently Added'}</h2>
            </div>
          </div>

          <div className="space-y-3">
            {products.slice(0, 5).map((p, i) => (
              <div key={p.id} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold shrink-0"
                  style={{ background: brandColors[i % 5] + '20', color: brandColors[i % 5] }}>
                  {p.brand?.charAt(0) || 'P'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-white text-sm font-medium truncate">{p.part_name}</div>
                  <div className="text-slate-500 text-xs font-mono">{p.part_number}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-emerald-400 text-sm font-bold">{p.price} {isArabic ? 'ر.س' : 'SAR'}</div>
                  <div className="text-slate-600 text-xs">{isArabic ? 'كمية:' : 'Qty:'} {p.quantity}</div>
                </div>
              </div>
            ))}

            {products.length === 0 && (
              <div className="text-slate-500 text-center py-8 text-sm">
                {isArabic ? 'لا توجد منتجات بعد' : 'No products yet'}
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}