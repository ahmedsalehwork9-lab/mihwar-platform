import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

type ProductAlert = {
  id: number;
  part_name: string;
  quantity: number;
};

type PendingOrder = {
  id: number;
  status: string;
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function AlertsPage() {
  const [outOfStock, setOutOfStock] = useState<ProductAlert[]>([]);
  const [lowStock, setLowStock] = useState<ProductAlert[]>([]);
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [shopId, setShopId] = useState<number | null>(null);

  useEffect(() => {
    initAlerts();
  }, []);

  // ── Step 1: تحديد shop_id للمستخدم الحالي ────────────────────────────────

  async function initAlerts() {
    try {
      setLoading(true);

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session) {
        console.error("[AlertsPage] No active session");
        return;
      }

      const userId = session.user.id;
      console.log("[AlertsPage] userId:", userId);

      const { data: shopData, error: shopError } = await supabase
        .from("shops")
        .select("id")
        .eq("owner_id", userId)
        .single();

      if (shopError || !shopData) {
        console.error("[AlertsPage] Could not find shop for user:", shopError?.message);
        return;
      }

      const currentShopId = shopData.id;
      console.log("[AlertsPage] shopId:", currentShopId);
      setShopId(currentShopId);

      await loadAlerts(currentShopId);
    } catch (err) {
      console.error("[AlertsPage] initAlerts error:", err);
    } finally {
      setLoading(false);
    }
  }

  // ── Step 2: جلب التنبيهات مع فلترة shop_id ────────────────────────────────

  async function loadAlerts(currentShopId: number) {

    // ── نفد المخزون (quantity = 0) ────────────────────────────────────────
    const { data: outData, error: outError } = await supabase
      .from("inventory")
      .select(`
        id,
        quantity,
        products (
          id,
          part_name
        )
      `)
      .eq("shop_id", currentShopId)
      .eq("quantity", 0);

    if (outError) {
      console.error("[AlertsPage] outOfStock query error:", outError.message);
    }

    // ── منخفض المخزون (1 <= quantity <= 3) ───────────────────────────────
    const { data: lowData, error: lowError } = await supabase
      .from("inventory")
      .select(`
        id,
        quantity,
        products (
          id,
          part_name
        )
      `)
      .eq("shop_id", currentShopId)
      .lte("quantity", 3)
      .gt("quantity", 0);

    if (lowError) {
      console.error("[AlertsPage] lowStock query error:", lowError.message);
    }

    // ── الطلبات المعلقة الخاصة بهذا المحل ───────────────────────────────
    const { data: ordersData, error: ordersError } = await supabase
      .from("orders")
      .select("id, status")
      .eq("from_shop_id", currentShopId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (ordersError) {
      console.error("[AlertsPage] orders query error:", ordersError.message);
    }

    // ── تحويل النتائج ─────────────────────────────────────────────────────

    const mapToAlert = (rows: any[]): ProductAlert[] =>
      (rows || [])
        .filter((r) => r.products !== null)
        .map((r) => ({
          id: r.products.id,
          part_name: r.products.part_name,
          quantity: r.quantity,
        }));

    setOutOfStock(mapToAlert(outData || []));
    setLowStock(mapToAlert(lowData || []));
    setPendingOrders(ordersData || []);

    console.log("[AlertsPage] outOfStock:", (outData || []).length);
    console.log("[AlertsPage] lowStock:", (lowData || []).length);
    console.log("[AlertsPage] pendingOrders:", (ordersData || []).length);
  }

  // ── Loading ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-400 text-lg">جاري تحميل التنبيهات...</div>
      </div>
    );
  }

  if (!shopId) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-red-400 text-lg">
          لم يتم العثور على محل مرتبط بهذا الحساب
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      <div>
        <h1 className="text-3xl font-bold text-white">التنبيهات</h1>
        <p className="text-slate-400 mt-2">متابعة المخزون والطلبات المهمة</p>
      </div>

      {/* نفد المخزون */}
      <div className="bg-slate-900 border border-red-500/20 rounded-2xl p-6">
        <h2 className="text-red-400 font-bold text-xl mb-4">
          🚨 منتجات نفد مخزونها ({outOfStock.length})
        </h2>

        <div className="space-y-3">
          {outOfStock.length === 0 ? (
            <div className="text-slate-400">لا توجد منتجات نافدة حالياً</div>
          ) : (
            outOfStock.map((item) => (
              <div key={item.id} className="bg-slate-950 rounded-xl p-4">
                <div className="text-white font-medium">{item.part_name}</div>
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
            <div className="text-slate-400">لا توجد منتجات منخفضة المخزون</div>
          ) : (
            lowStock.map((item) => (
              <div key={item.id} className="bg-slate-950 rounded-xl p-4">
                <div className="text-white font-medium">{item.part_name}</div>
                <div className="text-yellow-400 text-sm mt-1">
                  الكمية الحالية: {item.quantity}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* الطلبات المعلقة */}
      <div className="bg-slate-900 border border-blue-500/20 rounded-2xl p-6">
        <h2 className="text-blue-400 font-bold text-xl mb-4">
          📦 طلبات تحتاج متابعة ({pendingOrders.length})
        </h2>

        <div className="space-y-3">
          {pendingOrders.length === 0 ? (
            <div className="text-slate-400">لا توجد طلبات معلقة</div>
          ) : (
            pendingOrders.map((order) => (
              <div
                key={order.id}
                className="bg-slate-950 rounded-xl p-4 flex justify-between items-center"
              >
                <span className="text-white">طلب #{order.id}</span>
                <span className="text-yellow-400">معلق</span>
              </div>
            ))
          )}
        </div>
      </div>

    </div>
  );
}
