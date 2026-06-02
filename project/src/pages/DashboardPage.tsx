import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  Package, Boxes, DollarSign, RefreshCw,
  Store, User, Mail, TrendingUp, AlertTriangle,
  Activity, ShieldAlert, XCircle,
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
  const { t, isRTL } = useLang();

  const [loading, setLoading] = useState(true);
  const [shop, setShop] = useState<any>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [pendingOrders, setPendingOrders] = useState(0);
  const [stats, setStats] = useState({
    totalProducts: 0,
    totalInventory: 0,
    totalValue: 0,
    lowStock: 0,
    outOfStock: 0,
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
        lowStock,
        outOfStock,
      });

      const { count: ordersCount } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('seller_shop_id', shopData.id)
        .eq('status', 'pending');

      setPendingOrders(ordersCount || 0);

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
    .filter(p => p.quantity > 0 && p.quantity <= 5)
    .sort((a, b) => a.quantity - b.quantity)
    .slice(0, 10);

  const outOfStockProducts = products
    .filter(p => p.quantity === 0)
    .slice(0, 10);

  const recentProducts = [...products].slice(0, 5);

  const totalAlerts = stats.lowStock + stats.outOfStock + pendingOrders;

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-500 text-sm">{t('Loading...', 'جارٍ التحميل...')}</p>
        </div>
      </div>
    );
  }

  return (
    <div dir={isRTL ? 'rtl' : 'ltr'} className="space-y-3 lg:space-y-4 p-3 lg:p-6 text-white">

      {/* ── HEADER ─────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-900/80 border border-slate-800 rounded-2xl p-4 lg:p-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 lg:gap-4">

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 lg:w-11 lg:h-11 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
              <Store size={20} className="text-blue-400" />
            </div>
            <div>
              <h1 className="text-lg lg:text-xl font-bold text-white leading-tight">
                {t('Welcome,', 'مرحباً،')}{' '}
                <span className="text-blue-400">{shop?.shop_name || user?.email?.split('@')[0]}</span>
              </h1>
              <p className="text-slate-500 text-xs mt-0.5">
                {t("Today's store performance", 'أداء متجرك اليوم')}
              </p>
            </div>
          </div>

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
              <span className="text-slate-400 text-xs">{t('Refresh', 'تحديث')}</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── SECTION 1: BUSINESS SUMMARY ────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 lg:gap-3">

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 lg:p-4 flex flex-col gap-2 lg:gap-3">
          <div className="p-2 rounded-lg border bg-blue-500/10 border-blue-500/20 w-fit">
            <Package size={16} className="text-blue-400" />
          </div>
          <div>
            <div className="text-xl lg:text-2xl font-black text-white leading-none">{stats.totalProducts}</div>
            <div className="text-slate-400 text-xs mt-1">{t('Products', 'المنتجات')}</div>
            <div className="text-slate-600 text-[10px] mt-0.5">{t('Total SKUs', 'إجمالي الأصناف')}</div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 lg:p-4 flex flex-col gap-2 lg:gap-3">
          <div className="p-2 rounded-lg border bg-emerald-500/10 border-emerald-500/20 w-fit">
            <Boxes size={16} className="text-emerald-400" />
          </div>
          <div>
            <div className="text-xl lg:text-2xl font-black text-white leading-none">{stats.totalInventory.toLocaleString()}</div>
            <div className="text-slate-400 text-xs mt-1">{t('Units', 'الوحدات')}</div>
            <div className="text-slate-600 text-[10px] mt-0.5">{t('Total quantities', 'إجمالي الكميات')}</div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 lg:p-4 flex flex-col gap-2 lg:gap-3">
          <div className="p-2 rounded-lg border bg-amber-500/10 border-amber-500/20 w-fit">
            <DollarSign size={16} className="text-amber-400" />
          </div>
          <div>
            <div className="text-xl lg:text-2xl font-black text-white leading-none">{stats.totalValue.toLocaleString()}</div>
            <div className="text-slate-400 text-xs mt-1">{t('Value', 'القيمة')}</div>
            <div className="text-slate-600 text-[10px] mt-0.5">{t('Saudi Riyal', 'ريال سعودي')}</div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 lg:p-4 flex flex-col gap-2 lg:gap-3">
          <div className="p-2 rounded-lg border bg-red-500/10 border-red-500/20 w-fit">
            <ShieldAlert size={16} className="text-red-400" />
          </div>
          <div>
            <div className="text-xl lg:text-2xl font-black text-white leading-none">{stats.lowStock}</div>
            <div className="text-slate-400 text-xs mt-1">{t('Low Stock', 'مخزون منخفض')}</div>
            <div className="text-slate-600 text-[10px] mt-0.5">{t('Need restocking', 'تحتاج تجديد')}</div>
          </div>
        </div>

      </div>

      {/* ── SECTION 2: ACTION CENTER ────────────────────────────────── */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 lg:p-5">
        <div className="flex items-center gap-2 mb-3 lg:mb-4">
          <div className="p-1.5 rounded-lg bg-red-500/10 border border-red-500/20">
            <Activity size={14} className="text-red-400" />
          </div>
          <h2 className="font-semibold text-white text-sm">
            {t('Action Center', 'مركز التنبيهات')}
          </h2>
          {totalAlerts > 0 && (
            <span className="text-xs bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded-full">
              {totalAlerts} {t('alerts', 'تنبيه')}
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 lg:gap-3">

          <div className="flex items-center gap-3 bg-slate-800/50 border border-slate-700 rounded-xl p-3">
            <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20 shrink-0">
              <XCircle size={15} className="text-red-400" />
            </div>
            <div>
              <div className="text-xl font-black text-red-400">{stats.outOfStock}</div>
              <div className="text-slate-500 text-[11px]">{t('Out of Stock', 'نفد المخزون')}</div>
            </div>
          </div>

          <div className="flex items-center gap-3 bg-slate-800/50 border border-slate-700 rounded-xl p-3">
            <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 shrink-0">
              <AlertTriangle size={15} className="text-amber-400" />
            </div>
            <div>
              <div className="text-xl font-black text-amber-400">{stats.lowStock}</div>
              <div className="text-slate-500 text-[11px]">{t('Low Stock', 'مخزون منخفض')}</div>
            </div>
          </div>

          <div className="flex items-center gap-3 bg-slate-800/50 border border-slate-700 rounded-xl p-3">
            <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 shrink-0">
              <Package size={15} className="text-blue-400" />
            </div>
            <div>
              <div className="text-xl font-black text-blue-400">{pendingOrders}</div>
              <div className="text-slate-500 text-[11px]">{t('Pending Orders', 'طلبات معلقة')}</div>
            </div>
          </div>

          <div className="flex items-center gap-3 bg-slate-800/50 border border-slate-700 rounded-xl p-3">
            <div className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/20 shrink-0">
              <ShieldAlert size={15} className="text-purple-400" />
            </div>
            <div>
              <div className="text-xl font-black text-purple-400">{totalAlerts}</div>
              <div className="text-slate-500 text-[11px]">{t('Active Alerts', 'تنبيهات نشطة')}</div>
            </div>
          </div>

        </div>
      </div>

      {/* ── SECTION 3 & 4: LOW STOCK + OUT OF STOCK ─────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-4">

        {/* Low Stock */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 lg:p-5">
          <div className="flex items-center gap-2 mb-3 lg:mb-4">
            <div className="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <AlertTriangle size={14} className="text-amber-400" />
            </div>
            <h2 className="font-semibold text-white text-sm">
              {t('Low Stock Products', 'منتجات تحتاج تجديد')}
            </h2>
            {lowStockProducts.length > 0 && (
              <span className="mr-auto text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full">
                {lowStockProducts.length}
              </span>
            )}
          </div>

          {lowStockProducts.length === 0 ? (
            <div className="flex items-center justify-center h-24 text-slate-600 text-sm">
              ✅ {t('All products well stocked', 'المخزون بحالة جيدة')}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-4 text-[10px] text-slate-600 pb-2 border-b border-slate-800 uppercase tracking-wide">
                <div className="col-span-2">{t('Product', 'المنتج')}</div>
                <div className="text-center">{t('Part No.', 'رقم القطعة')}</div>
                <div className="text-center">{t('Qty', 'الكمية')}</div>
              </div>
              {lowStockProducts.map(p => (
                <div key={p.id} className="grid grid-cols-4 items-center gap-1">
                  <div className="col-span-2 text-white text-xs truncate">{p.part_name}</div>
                  <div className="text-center text-slate-500 text-[10px] font-mono truncate">{p.part_number}</div>
                  <div className="flex justify-center">
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold">
                      {p.quantity}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Out of Stock */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 lg:p-5">
          <div className="flex items-center gap-2 mb-3 lg:mb-4">
            <div className="p-1.5 rounded-lg bg-red-500/10 border border-red-500/20">
              <XCircle size={14} className="text-red-400" />
            </div>
            <h2 className="font-semibold text-white text-sm">
              {t('Out of Stock Products', 'منتجات نفد مخزونها')}
            </h2>
            {outOfStockProducts.length > 0 && (
              <span className="mr-auto text-xs bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded-full">
                {outOfStockProducts.length}
              </span>
            )}
          </div>

          {outOfStockProducts.length === 0 ? (
            <div className="flex items-center justify-center h-24 text-slate-600 text-sm">
              ✅ {t('No out-of-stock products', 'لا توجد منتجات نافدة')}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-3 text-[10px] text-slate-600 pb-2 border-b border-slate-800 uppercase tracking-wide">
                <div className="col-span-2">{t('Product', 'المنتج')}</div>
                <div className="text-center">{t('Status', 'الحالة')}</div>
              </div>
              {outOfStockProducts.map(p => (
                <div key={p.id} className="grid grid-cols-3 items-center gap-1">
                  <div className="col-span-2">
                    <div className="text-white text-xs truncate">{p.part_name}</div>
                    <div className="text-slate-600 text-[10px] font-mono">{p.part_number}</div>
                  </div>
                  <div className="flex justify-center">
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 whitespace-nowrap">
                      {t('Out', 'نفد')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* ── SECTION 5 & 6: RECENT PRODUCTS + BRAND DISTRIBUTION ─────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-4">

        {/* Recent Products */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 lg:p-5">
          <div className="flex items-center gap-2 mb-3 lg:mb-4">
            <div className="p-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <Activity size={14} className="text-blue-400" />
            </div>
            <h2 className="font-semibold text-white text-sm">
              {t('Recently Added', 'آخر المنتجات المضافة')}
            </h2>
          </div>

          {recentProducts.length === 0 ? (
            <div className="flex items-center justify-center h-24 text-slate-600 text-sm">
              {t('No products yet', 'لا توجد منتجات بعد')}
            </div>
          ) : (
            <div className="space-y-2 lg:space-y-2.5">
              {recentProducts.map((p, i) => (
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
                      {p.price} {t('SAR', 'ر.س')}
                    </div>
                    <div className="text-slate-600 text-[10px]">
                      {t('Qty:', 'كمية:')} {p.quantity}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Brand Distribution — real data only */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 lg:p-5">
          <div className="flex items-center gap-2 mb-3 lg:mb-4">
            <div className="p-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20">
              <TrendingUp size={14} className="text-purple-400" />
            </div>
            <h2 className="font-semibold text-white text-sm">
              {t('Products by Brand', 'توزيع المنتجات حسب الفئة')}
            </h2>
          </div>

          {topBrands.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-slate-600 text-sm">
              {t('No data', 'لا توجد بيانات')}
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
                  <div className="text-slate-500 text-[10px]">{t('items', 'صنف')}</div>
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

    </div>
  );
}
