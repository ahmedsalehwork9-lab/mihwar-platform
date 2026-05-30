import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { RefreshCw, ShoppingCart, CheckCircle, Clock, XCircle } from 'lucide-react';

type Order = {
  id: number;
  from_shop_id: number;
  to_shop_id: number;
  status: string;
  total_amount: number;
  created_at: string;
};

export default function GlobalOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const loadOrders = async () => {
    setLoading(true);

    const { data } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });

    setOrders(data || []);
    setLoading(false);
  };

  useEffect(() => {
    loadOrders();
  }, []);

  const totalOrders = orders.length;

  const completedOrders = orders.filter(
    o => o.status === 'completed'
  ).length;

  const pendingOrders = orders.filter(
    o => o.status === 'pending'
  ).length;

  const approvedOrders = orders.filter(
    o => o.status === 'approved'
  ).length;

  return (
    <div className="space-y-6 animate-in fade-in duration-500 text-right" dir="rtl">

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-black text-white mb-2">
            الطلبات العامة
          </h1>

          <p className="text-slate-400">
            جميع الطلبات بين المحلات
          </p>
        </div>

        <button
          onClick={loadOrders}
          className="px-5 py-3 rounded-2xl bg-slate-800 border border-slate-700 hover:bg-slate-700 transition"
        >
          <RefreshCw size={18} />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">

        <div className="bg-slate-900 rounded-3xl p-6 border border-slate-800">
          <p className="text-slate-400">إجمالي الطلبات</p>
          <h2 className="text-4xl font-black mt-2">
            {totalOrders}
          </h2>
        </div>

        <div className="bg-slate-900 rounded-3xl p-6 border border-slate-800">
          <p className="text-slate-400">مكتملة</p>
          <h2 className="text-4xl font-black text-green-400 mt-2">
            {completedOrders}
          </h2>
        </div>

        <div className="bg-slate-900 rounded-3xl p-6 border border-slate-800">
          <p className="text-slate-400">قيد الانتظار</p>
          <h2 className="text-4xl font-black text-yellow-400 mt-2">
            {pendingOrders}
          </h2>
        </div>

        <div className="bg-slate-900 rounded-3xl p-6 border border-slate-800">
          <p className="text-slate-400">معتمدة</p>
          <h2 className="text-4xl font-black text-blue-400 mt-2">
            {approvedOrders}
          </h2>
        </div>

      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden">

        <table className="w-full">
          <thead className="bg-slate-950">
            <tr>

              <th className="p-4">رقم الطلب</th>
              <th className="p-4">من محل</th>
              <th className="p-4">إلى محل</th>
              <th className="p-4">القيمة</th>
              <th className="p-4">الحالة</th>
              <th className="p-4">التاريخ</th>

            </tr>
          </thead>

          <tbody>

            {orders.map(order => (
              <tr
                key={order.id}
                className="border-t border-slate-800"
              >

                <td className="p-4 font-bold">
                  #{order.id}
                </td>

                <td className="p-4">
                  {order.from_shop_id}
                </td>

                <td className="p-4">
                  {order.to_shop_id}
                </td>

                <td className="p-4">
                  {order.total_amount} ر.س
                </td>

                <td className="p-4">

                  {order.status === 'completed' && (
                    <span className="text-green-400 flex items-center gap-2">
                      <CheckCircle size={16} />
                      مكتمل
                    </span>
                  )}

                  {order.status === 'pending' && (
                    <span className="text-yellow-400 flex items-center gap-2">
                      <Clock size={16} />
                      انتظار
                    </span>
                  )}

                  {order.status === 'approved' && (
                    <span className="text-blue-400 flex items-center gap-2">
                      <ShoppingCart size={16} />
                      معتمد
                    </span>
                  )}

                  {order.status === 'rejected' && (
                    <span className="text-red-400 flex items-center gap-2">
                      <XCircle size={16} />
                      مرفوض
                    </span>
                  )}

                </td>

                <td className="p-4">
                  {new Date(order.created_at).toLocaleDateString('ar-SA')}
                </td>

              </tr>
            ))}

          </tbody>
        </table>

        {loading && (
          <div className="p-8 text-center">
            جاري التحميل...
          </div>
        )}

      </div>
    </div>
  );
}