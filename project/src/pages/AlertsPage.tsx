import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../context/LanguageContext";
import { 
  Bell, 
  PackageX, 
  AlertTriangle, 
  ShoppingCart, 
  Info, 
  ChevronRight,
  RefreshCw,
  Search,
  Filter,
  ArrowRightLeft
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type ProductAlert = {
  id: number;
  part_name: string;
  part_number?: string;
  quantity: number;
};

type PendingOrder = {
  id: number;
  status: string;
  total_amount?: number;
  created_at: string;
};

type FilterTab = "all" | "inventory" | "orders";

// ─── Component ────────────────────────────────────────────────────────────────

export default function AlertsPage() {
  const { ownedShopId, loading: authLoading } = useAuth();
  const { t, isRTL } = useLang();

  const [outOfStock, setOutOfStock]       = useState<ProductAlert[]>([]);
  const [lowStock, setLowStock]           = useState<ProductAlert[]>([]);
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [loading, setLoading]             = useState(true);
  const [activeTab, setActiveTab]         = useState<FilterTab>("all");

  useEffect(() => {
    if (!authLoading && ownedShopId) {
      loadAlerts(ownedShopId);
    } else if (!authLoading && !ownedShopId) {
      setLoading(false);
    }
  }, [ownedShopId, authLoading]);

  async function loadAlerts(currentShopId: number) {
    setLoading(true);
    try {
      const { data: outData } = await supabase
        .from("products")
        .select("id, part_name, part_number, quantity")
        .eq("shop_id", currentShopId)
        .eq("quantity", 0);

      const { data: lowData } = await supabase
        .from("products")
        .select("id, part_name, part_number, quantity")
        .eq("shop_id", currentShopId)
        .lte("quantity", 3)
        .gt("quantity", 0);

      const { data: ordersData } = await supabase
        .from("orders")
        .select("id, status, total_amount, created_at")
        .eq("from_shop_id", currentShopId)
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      setOutOfStock(outData || []);
      setLowStock(lowData || []);
      setPendingOrders(ordersData || []);
    } finally {
      setLoading(false);
    }
  }

  const counts = useMemo(() => ({
    out: outOfStock.length,
    low: lowStock.length,
    orders: pendingOrders.length,
    total: outOfStock.length + lowStock.length + pendingOrders.length
  }), [outOfStock, lowStock, pendingOrders]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <RefreshCw className="w-8 h-8 text-emerald-500 animate-spin" />
        <p className="text-slate-400 text-sm animate-pulse">{t('Syncing alerts...', 'جاري مزامنة التنبيهات...')}</p>
      </div>
    );
  }

  if (!ownedShopId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center px-6">
        <div className="w-16 h-16 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-center mb-4">
          <Info className="text-slate-500" size={32} />
        </div>
        <h2 className="text-white font-bold text-lg mb-2">{t('No Shop Connected', 'لا يوجد محل مرتبط')}</h2>
        <p className="text-slate-500 text-sm max-w-xs">{t('Please ensure your account is linked to a shop to view alerts.', 'يرجى التأكد من ربط حسابك بمحل لتتمكن من رؤية التنبيهات.')}</p>
      </div>
    );
  }

  return (
    <div className="pb-10 max-w-5xl mx-auto" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 rounded-lg">
              <Bell className="text-emerald-500" size={24} />
            </div>
            {t('Notification Center', 'مركز التنبيهات')}
          </h1>
          <p className="text-slate-500 text-sm mt-1">{t('Review critical inventory levels and pending tasks.', 'راجع مستويات المخزون الحرجة والمهام المعلقة.')}</p>
        </div>
        <button 
          onClick={() => loadAlerts(ownedShopId!)}
          className="p-2.5 rounded-xl border border-slate-800 bg-slate-900 text-slate-400 hover:text-white transition-all"
        >
          <RefreshCw size={18} />
        </button>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-red-500/5 rounded-full -mr-12 -mt-12 transition-transform group-hover:scale-110" />
          <div className="flex items-center gap-4 relative">
            <div className="w-12 h-12 bg-red-500/10 rounded-xl flex items-center justify-center text-red-500">
              <PackageX size={24} />
            </div>
            <div>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">{t('Out of Stock', 'نفد المخزون')}</p>
              <p className="text-2xl font-black text-white">{counts.out}</p>
            </div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full -mr-12 -mt-12 transition-transform group-hover:scale-110" />
          <div className="flex items-center gap-4 relative">
            <div className="w-12 h-12 bg-amber-500/10 rounded-xl flex items-center justify-center text-amber-500">
              <AlertTriangle size={24} />
            </div>
            <div>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">{t('Low Stock', 'مخزون منخفض')}</p>
              <p className="text-2xl font-black text-white">{counts.low}</p>
            </div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full -mr-12 -mt-12 transition-transform group-hover:scale-110" />
          <div className="flex items-center gap-4 relative">
            <div className="w-12 h-12 bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-400">
              <ShoppingCart size={24} />
            </div>
            <div>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">{t('Pending Orders', 'طلبات معلقة')}</p>
              <p className="text-2xl font-black text-white">{counts.orders}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs / Filters */}
      <div className="flex items-center gap-2 mb-6 bg-slate-900/50 p-1 rounded-xl border border-slate-800 w-fit">
        <button 
          onClick={() => setActiveTab('all')}
          className={`px-6 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'all' ? 'bg-slate-800 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
        >
          {t('All Alerts', 'جميع التنبيهات')}
        </button>
        <button 
          onClick={() => setActiveTab('inventory')}
          className={`px-6 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'inventory' ? 'bg-slate-800 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
        >
          {t('Inventory', 'المخزون')}
        </button>
        <button 
          onClick={() => setActiveTab('orders')}
          className={`px-6 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'orders' ? 'bg-slate-800 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
        >
          {t('Orders', 'الطلبات')}
        </button>
      </div>

      {/* Content */}
      <div className="space-y-4">
        {counts.total === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-16 text-center shadow-xl">
            <div className="w-20 h-20 bg-emerald-500/5 rounded-full flex items-center justify-center mx-auto mb-6">
              <Bell className="text-emerald-500/30" size={40} />
            </div>
            <h3 className="text-white font-black text-xl mb-2">{t('All Clear!', 'كل شيء ممتاز!')}</h3>
            <p className="text-slate-500 max-w-sm mx-auto">{t('No critical alerts found. Your inventory and orders are performing well.', 'لا توجد تنبيهات عاجلة. مخزونك وطلباتك تعمل بشكل جيد.')}</p>
          </div>
        ) : (
          <>
            {/* Out of Stock Section */}
            {(activeTab === 'all' || activeTab === 'inventory') && outOfStock.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-xs font-black text-red-500 uppercase tracking-widest flex items-center gap-2 px-2">
                  <PackageX size={14} /> {t('Critical: Out of Stock', 'حرج: نفد المخزون')}
                </h3>
                {outOfStock.map(item => (
                  <div key={item.id} className="bg-slate-900 border-l-4 border-l-red-500 border border-slate-800 p-4 rounded-xl flex items-center justify-between group hover:border-slate-700 transition-all">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-red-500/5 rounded-lg flex items-center justify-center text-red-500 shrink-0">0</div>
                      <div>
                        <p className="text-white font-bold text-sm">{item.part_name}</p>
                        <p className="text-slate-500 text-[10px] font-mono mt-0.5">{item.part_number || '—'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="hidden sm:block text-right">
                        <p className="text-red-500 text-xs font-bold">{t('Action Required', 'مطلوب إجراء')}</p>
                        <p className="text-slate-500 text-[10px]">{t('Zero items remaining', 'لا توجد قطع متبقية')}</p>
                      </div>
                      <ChevronRight className="text-slate-700 group-hover:text-slate-400 group-hover:translate-x-1 transition-all" size={18} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Low Stock Section */}
            {(activeTab === 'all' || activeTab === 'inventory') && lowStock.length > 0 && (
              <div className="space-y-3 mt-8">
                <h3 className="text-xs font-black text-amber-500 uppercase tracking-widest flex items-center gap-2 px-2">
                  <AlertTriangle size={14} /> {t('Warning: Low Stock', 'تحذير: مخزون منخفض')}
                </h3>
                {lowStock.map(item => (
                  <div key={item.id} className="bg-slate-900 border-l-4 border-l-amber-500 border border-slate-800 p-4 rounded-xl flex items-center justify-between group hover:border-slate-700 transition-all">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-amber-500/5 rounded-lg flex items-center justify-center text-amber-500 font-black text-sm shrink-0">{item.quantity}</div>
                      <div>
                        <p className="text-white font-bold text-sm">{item.part_name}</p>
                        <p className="text-slate-500 text-[10px] font-mono mt-0.5">{item.part_number || '—'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="hidden sm:block text-right">
                        <p className="text-amber-500 text-xs font-bold">{t('Restock Soon', 'أعد الطلب قريباً')}</p>
                        <p className="text-slate-500 text-[10px]">{t('Below threshold', 'أقل من الحد الأدنى')}</p>
                      </div>
                      <ChevronRight className="text-slate-700 group-hover:text-slate-400 group-hover:translate-x-1 transition-all" size={18} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Pending Orders Section */}
            {(activeTab === 'all' || activeTab === 'orders') && pendingOrders.length > 0 && (
              <div className="space-y-3 mt-8">
                <h3 className="text-xs font-black text-blue-400 uppercase tracking-widest flex items-center gap-2 px-2">
                  <ShoppingCart size={14} /> {t('Orders: Attention Needed', 'الطلبات: تحتاج متابعة')}
                </h3>
                {pendingOrders.map(order => (
                  <div key={order.id} className="bg-slate-900 border-l-4 border-l-blue-500 border border-slate-800 p-4 rounded-xl flex items-center justify-between group hover:border-slate-700 transition-all">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-blue-500/5 rounded-lg flex items-center justify-center text-blue-400 shrink-0">
                        <ArrowRightLeft size={18} />
                      </div>
                      <div>
                        <p className="text-white font-bold text-sm">{t('Purchase Order', 'طلب شراء')} #{order.id}</p>
                        <p className="text-slate-500 text-[10px] mt-0.5">{new Date(order.created_at).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="hidden sm:block text-right">
                        <p className="text-blue-400 text-xs font-bold">{order.total_amount?.toLocaleString()} ر.س</p>
                        <p className="text-slate-500 text-[10px]">{t('Waiting for approval', 'في انتظار الاعتماد')}</p>
                      </div>
                      <ChevronRight className="text-slate-700 group-hover:text-slate-400 group-hover:translate-x-1 transition-all" size={18} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}