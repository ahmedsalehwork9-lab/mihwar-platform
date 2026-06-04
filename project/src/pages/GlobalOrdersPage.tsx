import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  RefreshCw, ShoppingCart, CheckCircle, Clock, XCircle,
  Store, ArrowLeftRight, TrendingUp,
} from 'lucide-react';

// Task 1: extended Order type with shop relations
type Order = {
  id: number;
  from_shop_id: number;
  to_shop_id: number;
  status: string;
  total_amount: number;
  created_at: string;
  from_shop: { shop_name: string } | null;
  to_shop:   { shop_name: string } | null;
};

// Task 2: safe money formatter — no floating-point noise
function formatMoney(amount: number): string {
  return amount.toLocaleString('en-SA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// Task 4: status badge component
type StatusKey = 'pending' | 'approved' | 'completed' | 'rejected';

const STATUS_CFG: Record<StatusKey, {
  label: string; icon: React.ReactNode;
  cls: string; dot: string;
}> = {
  pending:   { label: 'معلق',   icon: <Clock size={13} />,         cls: 'bg-amber-500/10 text-amber-400 border-amber-500/25',    dot: 'bg-amber-400'   },
  approved:  { label: 'معتمد',  icon: <ShoppingCart size={13} />,  cls: 'bg-blue-500/10 text-blue-400 border-blue-500/25',       dot: 'bg-blue-400'    },
  completed: { label: 'مكتمل',  icon: <CheckCircle size={13} />,   cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25', dot: 'bg-emerald-400' },
  rejected:  { label: 'مرفوض', icon: <XCircle size={13} />,       cls: 'bg-red-500/10 text-red-400 border-red-500/25',          dot: 'bg-red-400'     },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CFG[status as StatusKey] ?? {
    label: status, icon: null,
    cls: 'bg-slate-700 text-slate-400 border-slate-600', dot: 'bg-slate-400',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border whitespace-nowrap ${cfg.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

export default function GlobalOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const loadOrders = async () => {
    setLoading(true);

    // Task 1: select with shop relations
    const { data } = await supabase
      .from('orders')
      .select(`
        *,
        from_shop:shops!orders_from_shop_id_fkey(shop_name),
        to_shop:shops!orders_to_shop_id_fkey(shop_name)
      `)
      .order('created_at', { ascending: false });

    setOrders((data as Order[]) || []);
    setLoading(false);
  };

  useEffect(() => { loadOrders(); }, []);

  // Stats — unchanged calculations
  const totalOrders     = orders.length;
  const completedOrders = orders.filter(o => o.status === 'completed').length;
  const pendingOrders   = orders.filter(o => o.status === 'pending').length;
  const approvedOrders  = orders.filter(o => o.status === 'approved').length;
  const totalValue      = orders.reduce((s, o) => s + (o.total_amount || 0), 0);

  return (
    <div className="space-y-6 animate-in fade-in duration-500 text-right" dir="rtl">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl lg:text-4xl font-black text-white mb-1">الطلبات العامة</h1>
          <p className="text-slate-400 text-sm">جميع الطلبات بين المحلات</p>
        </div>
        <button
          onClick={loadOrders}
          className="p-3 rounded-2xl bg-slate-800 border border-slate-700 hover:bg-slate-700 transition text-slate-300"
          aria-label="تحديث"
        >
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* KPI Cards — Task 5: responsive grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        {[
          { label: 'إجمالي الطلبات', value: totalOrders,     color: 'text-white',         icon: <ArrowLeftRight size={18} className="text-slate-400" />,  border: 'border-slate-800'           },
          { label: 'مكتملة',          value: completedOrders, color: 'text-emerald-400',    icon: <CheckCircle size={18} className="text-emerald-400" />,   border: 'border-emerald-500/20'      },
          { label: 'قيد الانتظار',    value: pendingOrders,   color: 'text-amber-400',      icon: <Clock size={18} className="text-amber-400" />,           border: 'border-amber-500/20'        },
          { label: 'معتمدة',          value: approvedOrders,  color: 'text-blue-400',       icon: <ShoppingCart size={18} className="text-blue-400" />,     border: 'border-blue-500/20'         },
        ].map((card, i) => (
          <div key={i} className={`bg-slate-900 rounded-3xl p-4 lg:p-6 border ${card.border}`}>
            <div className="flex items-center justify-between mb-2">
              {card.icon}
              <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">KPI</span>
            </div>
            <p className="text-slate-400 text-xs mb-1">{card.label}</p>
            <h2 className={`text-3xl font-black ${card.color}`}>{card.value}</h2>
          </div>
        ))}
      </div>

      {/* Total value strip */}
      <div className="flex items-center gap-3 bg-slate-900 border border-slate-800 rounded-2xl px-5 py-3">
        <TrendingUp size={16} className="text-emerald-400 shrink-0" />
        <span className="text-slate-400 text-sm">إجمالي قيمة الطلبات</span>
        <span className="text-white font-black text-lg mr-auto tabular-nums">
          {formatMoney(totalValue)} <span className="text-xs font-normal text-slate-500">ر.س</span>
        </span>
      </div>

      {/* Table — Task 5: horizontal scroll on mobile */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead className="bg-slate-950">
              <tr className="text-slate-500 text-xs font-bold uppercase tracking-wider">
                <th className="p-4 text-right">رقم الطلب</th>
                {/* Task 1: shop name headers */}
                <th className="p-4 text-right">المحل المرسل</th>
                <th className="p-4 text-right">المحل المورد</th>
                {/* Task 2: formatted amount */}
                <th className="p-4 text-right">القيمة</th>
                {/* Task 4: status badge */}
                <th className="p-4 text-right">الحالة</th>
                <th className="p-4 text-right">التاريخ</th>
              </tr>
            </thead>
            <tbody>
              {orders.map(order => (
                <tr key={order.id} className="border-t border-slate-800 hover:bg-slate-800/30 transition-colors">

                  <td className="p-4 font-mono font-bold text-slate-400 text-sm">
                    #{String(order.id).padStart(5, '0')}
                  </td>

                  {/* Task 1: from_shop name with ID fallback */}
                  <td className="p-4">
                    <div className="flex items-center gap-1.5">
                      <Store size={13} className="text-blue-400 shrink-0" />
                      <span className="text-slate-200 text-sm font-medium truncate max-w-[140px]">
                        {order.from_shop?.shop_name ?? `#${order.from_shop_id}`}
                      </span>
                    </div>
                  </td>

                  {/* Task 1: to_shop name with ID fallback */}
                  <td className="p-4">
                    <div className="flex items-center gap-1.5">
                      <Store size={13} className="text-emerald-400 shrink-0" />
                      <span className="text-slate-200 text-sm font-medium truncate max-w-[140px]">
                        {order.to_shop?.shop_name ?? `#${order.to_shop_id}`}
                      </span>
                    </div>
                  </td>

                  {/* Task 2: formatted money */}
                  <td className="p-4 tabular-nums font-bold text-white text-sm">
                    {formatMoney(order.total_amount)}
                    <span className="text-[10px] font-normal text-slate-500 mr-1">ر.س</span>
                  </td>

                  {/* Task 4: status badge */}
                  <td className="p-4">
                    <StatusBadge status={order.status} />
                  </td>

                  <td className="p-4 text-slate-500 text-xs">
                    {new Date(order.created_at).toLocaleDateString('ar-SA')}
                  </td>

                </tr>
              ))}

              {!loading && orders.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-slate-600 italic text-sm">
                    لا توجد طلبات حتى الآن
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {loading && (
          <div className="p-8 text-center text-slate-500 flex items-center justify-center gap-2">
            <RefreshCw size={16} className="animate-spin" />
            جاري التحميل...
          </div>
        )}
      </div>
    </div>
  );
}
