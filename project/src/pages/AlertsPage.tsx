import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../context/LanguageContext";
import { useNavigate } from "react-router-dom";
import { 
  Bell, 
  PackageX, 
  AlertTriangle, 
  ShoppingCart, 
  ChevronRight,
  RefreshCw,
  Info,
  ArrowRightLeft,
  Package,
  ExternalLink,
  ShieldAlert,
  Clock
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
  to_shop?: { shop_name: string };
};

// ─── Sub-Components ───────────────────────────────────────────────────────────

const AlertSummaryCard = ({ 
  label, 
  count, 
  icon: Icon, 
  colorClass, 
  onClick 
}: { 
  label: string; 
  count: number; 
  icon: any; 
  colorClass: string;
  onClick: () => void;
}) => (
  <button 
    onClick={onClick}
    className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex flex-col items-start gap-2 active:scale-95 transition-all text-right w-full"
  >
    <div className={`p-2 rounded-lg ${colorClass} bg-opacity-10`}>
      <Icon size={20} className={colorClass.replace('bg-', 'text-')} />
    </div>
    <div className="mt-1">
      <p className="text-2xl font-black text-white leading-none">{count}</p>
      <p className="text-slate-500 text-[11px] font-bold uppercase tracking-wider mt-1">{label}</p>
    </div>
  </button>
);

const EmptyState = ({ message, icon: Icon }: { message: string, icon: any }) => (
  <div className="flex flex-col items-center justify-center py-8 px-4 bg-slate-900/30 border border-dashed border-slate-800 rounded-3xl opacity-60">
    <Icon size={32} className="text-slate-600 mb-2" />
    <p className="text-slate-500 text-sm font-medium">{message}</p>
  </div>
);

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AlertsPage() {
  const { ownedShopId, loading: authLoading } = useAuth();
  const { t, isRTL } = useLang();
  const navigate = useNavigate();

  const [outOfStock, setOutOfStock]       = useState<ProductAlert[]>([]);
  const [lowStock, setLowStock]           = useState<ProductAlert[]>([]);
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [loading, setLoading]             = useState(true);

  // Deriving global notification counts for potential Context/Store integration
  const alertCounts = useMemo(() => ({
    critical: outOfStock.length,
    warning: lowStock.length,
    action: pendingOrders.length,
    total: outOfStock.length + lowStock.length + pendingOrders.length
  }), [outOfStock, lowStock, pendingOrders]);

  const loadAlerts = useCallback(async (currentShopId: number) => {
    setLoading(true);
    try {
      // 1. Critical: Out of Stock (Live Database Query)
      const { data: outData } = await supabase
        .from("products")
        .select("id, part_name, part_number, quantity")
        .eq("shop_id", currentShopId)
        .eq("quantity", 0);

      // 2. Warning: Low Stock (LTE 3 units)
      const { data: lowData } = await supabase
        .from("products")
        .select("id, part_name, part_number, quantity")
        .eq("shop_id", currentShopId)
        .lte("quantity", 3)
        .gt("quantity", 0);

      // 3. Action Required: Pending Orders
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
  }, []);

  useEffect(() => {
    if (!authLoading && ownedShopId) {
      loadAlerts(ownedShopId);
    } else if (!authLoading && !ownedShopId) {
      setLoading(false);
    }
  }, [ownedShopId, authLoading, loadAlerts]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <RefreshCw className="w-8 h-8 text-emerald-500 animate-spin" />
        <p className="text-slate-500 text-sm animate-pulse">{t('Syncing Alerts...', 'جاري مزامنة التنبيهات...')}</p>
      </div>
    );
  }

  if (!ownedShopId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
        <div className="w-16 h-16 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-center mb-4">
          <ShieldAlert className="text-slate-600" size={32} />
        </div>
        <h2 className="text-white font-bold text-lg mb-2">{t('No Shop Found', 'لم يتم العثور على متجر')}</h2>
        <p className="text-slate-500 text-sm">{t('Please connect your account to a shop to receive alerts.', 'يرجى ربط الحساب بمتجر لتلقي التنبيهات.')}</p>
      </div>
    );
  }

  return (
    <div className="pb-24 max-w-lg mx-auto" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="flex items-center justify-between mb-8 px-1">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-2">
            <Bell className="text-emerald-500" size={24} />
            {t('Notification Center', 'مركز التنبيهات')}
          </h1>
          <p className="text-slate-500 text-xs font-medium mt-1 uppercase tracking-tight">
            {alertCounts.total} {t('Active Alerts', 'تنبيهات نشطة')}
          </p>
        </div>
        <button 
          onClick={() => loadAlerts(ownedShopId)}
          className="p-2.5 rounded-xl border border-slate-800 bg-slate-900 text-slate-400 hover:text-white transition-all active:scale-90"
        >
          <RefreshCw size={18} />
        </button>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-3 gap-3 mb-8 px-1">
        <AlertSummaryCard 
          label={t('Stockout', 'نافد')} 
          count={alertCounts.critical} 
          icon={PackageX} 
          colorClass="bg-red-500" 
          onClick={() => {}} // Could implement scroll-to
        />
        <AlertSummaryCard 
          label={t('Low Stock', 'منخفض')} 
          count={alertCounts.warning} 
          icon={AlertTriangle} 
          colorClass="bg-amber-500" 
          onClick={() => {}}
        />
        <AlertSummaryCard 
          label={t('Orders', 'طلبات')} 
          count={alertCounts.action} 
          icon={ShoppingCart} 
          colorClass="bg-blue-500" 
          onClick={() => {}}
        />
      </div>

      {/* Priority 1: Critical (Out of Stock) */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-4 px-2">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
          <h3 className="text-xs font-black text-red-500 uppercase tracking-widest">{t('Critical: Stockout', 'حرج: نفد المخزون')}</h3>
        </div>
        <div className="space-y-3">
          {outOfStock.length === 0 ? (
            <EmptyState message={t('No stockout items', 'لا توجد قطع نافدة')} icon={Package} />
          ) : (
            outOfStock.map(item => (
              <div 
                key={item.id} 
                onClick={() => navigate('/inventory')}
                className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex items-center justify-between group active:bg-slate-800 transition-all"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center justify-center text-red-500 shrink-0 font-black text-xs">
                    0
                  </div>
                  <div className="min-w-0">
                    <p className="text-white font-bold text-sm truncate">{item.part_name}</p>
                    <p className="text-slate-500 text-[10px] font-mono mt-0.5">{item.part_number || '—'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-slate-600 group-hover:text-slate-400">
                  <span className="text-[10px] font-bold hidden sm:block uppercase tracking-tighter">{t('Inventory', 'المخزون')}</span>
                  <ChevronRight size={16} />
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Priority 2: Warning (Low Stock) */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-4 px-2">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          <h3 className="text-xs font-black text-amber-500 uppercase tracking-widest">{t('Warning: Low Levels', 'تحذير: مستويات منخفضة')}</h3>
        </div>
        <div className="space-y-3">
          {lowStock.length === 0 ? (
            <EmptyState message={t('All items well stocked', 'جميع القطع متوفرة')} icon={Package} />
          ) : (
            lowStock.map(item => (
              <div 
                key={item.id} 
                onClick={() => navigate('/inventory')}
                className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex items-center justify-between group active:bg-slate-800 transition-all"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center justify-center text-amber-500 shrink-0 font-black text-sm">
                    {item.quantity}
                  </div>
                  <div className="min-w-0">
                    <p className="text-white font-bold text-sm truncate">{item.part_name}</p>
                    <p className="text-slate-500 text-[10px] font-mono mt-0.5">{item.part_number || '—'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-slate-600 group-hover:text-slate-400">
                   <ChevronRight size={16} />
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Priority 3: Action Required (Pending Orders) */}
      <section>
        <div className="flex items-center gap-2 mb-4 px-2">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
          <h3 className="text-xs font-black text-blue-500 uppercase tracking-widest">{t('Action: Pending Orders', 'إجراء: طلبات معلقة')}</h3>
        </div>
        <div className="space-y-3">
          {pendingOrders.length === 0 ? (
            <EmptyState message={t('No pending orders', 'لا توجد طلبات معلقة')} icon={ShoppingCart} />
          ) : (
            pendingOrders.map(order => (
              <div 
                key={order.id} 
                onClick={() => navigate('/orders')}
                className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex items-center justify-between group active:bg-slate-800 transition-all"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-center justify-center text-blue-500 shrink-0">
                    <ShoppingCart size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-white font-bold text-sm truncate">{t('Order', 'طلب')} #{order.id}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-blue-400 font-bold bg-blue-500/10 px-1.5 py-0.5 rounded uppercase">{t('Pending', 'معلق')}</span>
                      <span className="text-slate-600 text-[10px]">•</span>
                      <span className="text-slate-500 text-[10px] font-mono">{new Date(order.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <p className="text-white font-black text-sm">{order.total_amount?.toLocaleString()} <span className="text-[9px] font-normal opacity-50">ر.س</span></p>
                  <ChevronRight size={16} className="text-slate-700" />
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Quick Access Footer */}
      {alertCounts.total > 0 && (
        <div className="mt-12 p-6 bg-slate-900/50 border border-slate-800 rounded-3xl">
          <div className="flex items-start gap-3">
            <Info size={18} className="text-blue-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-white font-bold text-sm">{t('Attention Needed', 'انتباه مطلوب')}</p>
              <p className="text-slate-500 text-xs mt-1 leading-relaxed">
                {t('You have critical alerts regarding your inventory and pending orders. Click on any alert to resolve it immediately.', 'لديك تنبيهات عاجلة تتعلق بمخزونك وطلباتك. اضغط على أي تنبيه للمعالجة الفورية.')}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}