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

  // ── لا تعديل على أي منطق أعمال ──────────────────────────────
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

  const brandCounts = products.reduce((acc, p) => {
    if (p.brand) acc[p.brand] = (acc[p.brand] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const topBrands = Object.entries(brandCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const totalBrands = topBrands.reduce((a, b) => a + b[1], 0);

  const brandColors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444'];

  const lowStockProducts = products
    .filter(p => p.quantity <= 5)
    .sort((a, b) => a.quantity - b.quantity)
    .slice(0, 5);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-500 text-sm">{isArabic ? 'جارٍ التحميل...' : 'Loading...'}</p>
        </div>
      </div>
    );
  }

  return (
    <div dir={isRTL ? 'rtl' : 'ltr'} className="space-y-4 p-4 lg:p-6 text-white">

      {/* ── HEADER ─────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-900/80 border border-slate-800 rounded-2xl p-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">

          {/* Greeting */}
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
              <Store size={20} className="text-blue-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white leading-tight">
                {isArabic ? 'مرحباً،' : 'Welcome,'}{' '}
                <span className="text-blue-400">{shop?.shop_name || user?.email?.split('@')[0]}</span>
              </h1>
              <p className="text-slate-500 text-xs mt-0.5">
                {isArabic ? 'أداء متجرك اليوم' : "Today's store performance"}
              </p>
            </div>
          </div>

          {/* Account info pills */}
          <div className="flex flex-wrap gap-2">
            {[
              { icon: <User size={13} />, label: user?.email?.split('@')[0], color: 'text-blue-400' },
              { icon: <Mail size={13} />, label: user?.email, color: 'text-purple-400' },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-1.5 bg-slate-800/80 border border-slate-700 rounded-lg px-3 py-1.5">
                <span className={item.color}>{item.icon}</span>
                <span className="text-slate-300 text-xs font-medium truncate max-w-[160px]">{item.label}</span>
              </div>
            ))}
            <button
              onClick={loadDashboard}
              className="flex items-center gap-1.5 bg-slate-800/80 border border-slate-700 hover:border-slate-500 rounded-lg px-3 py-1.5 transition-colors"
            >
              <RefreshCw size={12} className="text-slate-400" />
              <span className="text-slate-400 text-xs">{isArabic ? 'تحديث' : 'Refresh'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── STATS CARDS ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">

        {[
          {
            icon: <Package size={16} className="text-blue-400" />,
            bg: 'bg-blue-500/10 border-blue-500/20',
            value: stats.totalProducts,
            label: isArabic ? 'المنتجات' : 'Products',
            sub: isArabic ? 'إجمالي الأصناف' : 'Total SKUs',
            badge: '↑ 12%',
            badgeColor: 'text-emerald-400 bg-emerald-500/10',
          },
          {
            icon: <Boxes size={16} className="text-emerald-400" />,
            bg: 'bg-emerald-500/10 border-emerald-500/20',
            value: stats.totalInventory.toLocaleString(),
            label: isArabic ? 'الوحدات' : 'Units',
            sub: isArabic ? 'إجمالي الكميات' : 'Total quantities',
            badge: '↑ 8%',
            badgeColor: 'text-emerald-400 bg-emerald-500/10',
          },
          {
            icon: <DollarSign size={16} className="text-amber-400" />,
            bg: 'bg-amber-500/10 border-amber-500/20',
            value: stats.totalValue.toLocaleString(),
            label: isArabic ? 'القيمة' : 'Value',
            sub: isArabic ? 'ريال سعودي' : 'Saudi Riyal',
            badge: '↑ 15%',
            badgeColor: 'text-emerald-400 bg-emerald-500/10',
          },
          {
            icon: <ShieldAlert size={16} className="text-red-400" />,
            bg: 'bg-red-500/10 border-red-500/20',
            value: stats.lowStock,
            label: isArabic ? 'تنبيهات' : 'Alerts',
            sub: isArabic ? 'تحتاج تجديد' : 'Need restocking',
            badge: stats.lowStock > 0 ? `${stats.lowStock}` : '✓',
            badgeColor: stats.lowStock > 0 ? 'text-red-400 bg-red-500/10' : 'text-emerald-400 bg-emerald-500/10',
          },
        ].map((card, i) => (
          <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className={`p-2 rounded-lg border ${card.bg}`}>{card.icon}</div>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${card.badgeColor}`}>
                {card.badge}
              </span>
            </div>
            <div>
              <div className="text-2xl font-black text-white leading-none">{card.value}</div>
              <div className="text-slate-400 text-xs mt-1">{card.label}</div>
              <div className="text-slate-600 text-[10px] mt-0.5">{card.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── CHARTS ROW ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Bar Chart */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <Activity size={14} className="text-blue-400" />
            </div>
            <h2 className="font-semibold text-white text-sm">
              {isArabic ? 'حركة المخزون الأسبوعية' : 'Weekly Stock Movement'}
            </h2>
          </div>

          <div className="flex items-end gap-1.5 h-36">
            {['السبت','الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة'].map((day, i) => {
              const inventory = [180, 220, 160, 200, 240, 190, 210][i];
              const sales = [80, 120, 60, 140, 100, 90, 130][i];
              const maxVal = 300;
              return (
                <div key={day} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full flex items-end gap-px h-28">
                    <div
                      className="flex-1 bg-blue-500/50 hover:bg-blue-500 rounded-t transition-all"
                      style={{ height: `${(inventory / maxVal) * 100}%` }}
                    />
                    <div
                      className="flex-1 bg-emerald-500/50 hover:bg-emerald-500 rounded-t transition-all"
                      style={{ height: `${(sales / maxVal) * 100}%` }}
                    />
                  </div>
                  <div className="text-slate-600 text-[9px] text-center leading-none">{day.slice(0, 3)}</div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-slate-800">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm bg-blue-500/50" />
              <span className="text-slate-500 text-xs">{isArabic ? 'وارد' : 'Stock In'}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm bg-emerald-500/50" />
              <span className="text-slate-500 text-xs">{isArabic ? 'مبيعات' : 'Sales'}</span>
            </div>
          </div>
        </div>

        {/* Donut Chart */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20">
              <TrendingUp size={14} className="text-purple-400" />
            </div>
            <h2 className="font-semibold text-white text-sm">
              {isArabic ? 'توزيع المنتجات حسب الفئة' : 'Products by Brand'}
            </h2>
          </div>

          {topBrands.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-slate-600 text-sm">
              {isArabic ? 'لا توجد بيانات' : 'No data'}
            </div>
          ) : (
            <div className="flex items-center gap-5">
              <div className="relative shrink-0">
                <svg width="120" height="120" viewBox="0 0 120 120">
                  {(() => {
                    let offset = 0;
                    const r = 44, cx = 60, cy = 60;
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
                          strokeWidth="18"
                          strokeDasharray={`${dash} ${gap}`}
                          strokeDashoffset={-offset}
                          style={{ transform: 'rotate(-90deg)', transformOrigin: '60px 60px' }}
                        />
                      );
                      offset += dash;
                      return el;
                    });
                  })()}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className="text-xl font-black text-white">{stats.totalProducts}</div>
                  <div className="text-slate-500 text-[10px]">{isArabic ? 'صنف' : 'items'}</div>
                </div>
              </div>

              <div className="space-y-2 flex-1 min-w-0">
                {topBrands.map(([brand, count], i) => (
                  <div key={brand} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: brandColors[i] }} />
                      <span className="text-slate-400 text-xs truncate">{brand}</span>
                    </div>
                    <span className="text-white text-xs font-bold shrink-0">
                      {Math.round((count / totalBrands) * 100)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── BOTTOM ROW ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Low Stock */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <AlertTriangle size={14} className="text-amber-400" />
            </div>
            <h2 className="font-semibold text-white text-sm">
              {isArabic ? 'منتجات تحتاج تجديد' : 'Low Stock Products'}
            </h2>
            {lowStockProducts.length > 0 && (
              <span className="mr-auto text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full">
                {lowStockProducts.length}
              </span>
            )}
          </div>

          {lowStockProducts.length === 0 ? (
            <div className="flex items-center justify-center h-24 text-slate-600 text-sm">
              ✅ {isArabic ? 'المخزون بحالة جيدة' : 'All products well stocked'}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-4 text-[10px] text-slate-600 pb-2 border-b border-slate-800 uppercase tracking-wide">
                <div className="col-span-2">{isArabic ? 'المنتج' : 'Product'}</div>
                <div className="text-center">{isArabic ? 'الكمية' : 'Qty'}</div>
                <div className="text-center">{isArabic ? 'الحالة' : 'Status'}</div>
              </div>
              {lowStockProducts.map(p => (
                <div key={p.id} className="grid grid-cols-4 items-center gap-1">
                  <div className="col-span-2 text-white text-xs truncate">{p.part_name}</div>
                  <div className="text-center font-bold text-sm text-white">{p.quantity}</div>
                  <div className="flex justify-center">
                    {p.quantity === 0 ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 whitespace-nowrap">
                        {isArabic ? 'نفد' : 'Out'}
                      </span>
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 whitespace-nowrap">
                        {isArabic ? 'منخفض' : 'Low'}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recently Added */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <Activity size={14} className="text-blue-400" />
            </div>
            <h2 className="font-semibold text-white text-sm">
              {isArabic ? 'آخر المنتجات المضافة' : 'Recently Added'}
            </h2>
          </div>

          {products.length === 0 ? (
            <div className="flex items-center justify-center h-24 text-slate-600 text-sm">
              {isArabic ? 'لا توجد منتجات بعد' : 'No products yet'}
            </div>
          ) : (
            <div className="space-y-2.5">
              {products.slice(0, 5).map((p, i) => (
                <div key={p.id} className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0"
                    style={{ background: brandColors[i % 5] + '18', color: brandColors[i % 5] }}
                  >
                    {p.brand?.charAt(0) || 'P'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-white text-xs font-medium truncate">{p.part_name}</div>
                    <div className="text-slate-600 text-[10px] font-mono mt-0.5">{p.part_number}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-emerald-400 text-xs font-bold">
                      {p.price} {isArabic ? 'ر.س' : 'SAR'}
                    </div>
                    <div className="text-slate-600 text-[10px]">
                      {isArabic ? 'كمية:' : 'Qty:'} {p.quantity}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
