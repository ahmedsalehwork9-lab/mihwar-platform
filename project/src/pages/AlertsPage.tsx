import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type ProductAlert = {
  id: number;
  part_name: string;
  quantity: number;
};

type PendingOrder = {
  id: number;
  status: string;
};

export default function AlertsPage() {
  const [outOfStock, setOutOfStock] = useState<ProductAlert[]>([]);
  const [lowStock, setLowStock] = useState<ProductAlert[]>([]);
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAlerts();
  }, []);

  async function loadAlerts() {
    try {
      setLoading(true);

      const { data: outData, error: outError } = await supabase
        .from("products")
        .select("id, part_name, quantity")
        .eq("quantity", 0);

      if (outError) throw outError;

      const { data: lowData, error: lowError } = await supabase
        .from("products")
        .select("id, part_name, quantity")
        .lte("quantity", 3)
        .gt("quantity", 0);

      if (lowError) throw lowError;

      const { data: ordersData, error: ordersError } = await supabase
        .from("orders")
        .select("id, status")
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (ordersError) throw ordersError;

      setOutOfStock(outData || []);
      setLowStock(lowData || []);
      setPendingOrders(ordersData || []);
    } catch (error) {
      console.error("Alerts Error:", error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-400 text-lg">
          جاري تحميل التنبيهات...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      <div>
        <h1 className="text-3xl font-bold text-white">
          التنبيهات
        </h1>

        <p className="text-slate-400 mt-2">
          متابعة المخزون والطلبات المهمة
        </p>
      </div>

      {/* نفد المخزون */}
      <div className="bg-slate-900 border border-red-500/20 rounded-2xl p-6">

        <h2 className="text-red-400 font-bold text-xl mb-4">
          🚨 منتجات نفد مخزونها ({outOfStock.length})
        </h2>

        <div className="space-y-3">

          {outOfStock.length === 0 ? (
            <div className="text-slate-400">
              لا توجد منتجات نافدة حالياً
            </div>
          ) : (
            outOfStock.map((item) => (
              <div
                key={item.id}
                className="bg-slate-950 rounded-xl p-4"
              >
                <div className="text-white font-medium">
                  {item.part_name}
                </div>

                <div className="text-red-400 text-sm mt-1">
                  الكمية الحالية: {item.quantity}
                </div>
              </div>
            ))
          )}

        </div>

      </div>

      {/* منخفض المخزون */}
      <div className="bg-slate-900 border border-yellow-500/20 rounded-2xl p-6">

        <h2 className="text-yellow-400 font-bold text-xl mb-4">
          ⚠ منتجات منخفضة المخزون ({lowStock.length})
        </h2>

        <div className="space-y-3">

          {lowStock.length === 0 ? (
            <div className="text-slate-400">
              لا توجد منتجات منخفضة المخزون
            </div>
          ) : (
            lowStock.map((item) => (
              <div
                key={item.id}
                className="bg-slate-950 rounded-xl p-4"
              >
                <div className="text-white font-medium">
                  {item.part_name}
                </div>

                <div className="text-yellow-400 text-sm mt-1">
                  الكمية الحالية: {item.quantity}
                </div>
              </div>
            ))
          )}

        </div>

      </div>

      {/* الطلبات */}
      <div className="bg-slate-900 border border-blue-500/20 rounded-2xl p-6">

        <h2 className="text-blue-400 font-bold text-xl mb-4">
          📦 طلبات تحتاج متابعة ({pendingOrders.length})
        </h2>

        <div className="space-y-3">

          {pendingOrders.length === 0 ? (
            <div className="text-slate-400">
              لا توجد طلبات معلقة
            </div>
          ) : (
            pendingOrders.map((order) => (
              <div
                key={order.id}
                className="bg-slate-950 rounded-xl p-4 flex justify-between items-center"
              >
                <span className="text-white">
                  طلب #{order.id}
                </span>

                <span className="text-yellow-400">
                  معلق
                </span>
              </div>
            ))
          )}

        </div>

      </div>

    </div>
  );
}