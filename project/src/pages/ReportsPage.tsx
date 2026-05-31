import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";

// ─── Types ────────────────────────────────────────────────────────────────────

type ProductReport = {
  id: number;
  part_name: string;
  quantity: number;
  price: number;
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const { ownedShopId, loading: authLoading } = useAuth();

  const [loading, setLoading] = useState(true);

  const [totalProducts, setTotalProducts]   = useState(0);
  const [totalQuantity, setTotalQuantity]   = useState(0);
  const [inventoryValue, setInventoryValue] = useState(0);
  const [lowStockCount, setLowStockCount]   = useState(0);

  const [topProducts, setTopProducts]         = useState<ProductReport[]>([]);
  const [reorderProducts, setReorderProducts] = useState<ProductReport[]>([]);

  useEffect(() => {
    // انتظر حتى ينتهي AuthContext من التحميل
    if (authLoading) {
      console.log("REPORTS PAGE: auth still loading — waiting...");
      return;
    }

    if (!ownedShopId) {
      console.warn("REPORTS PAGE: ownedShopId is null after auth loaded");
      setLoading(false);
      return;
    }

    loadReport(ownedShopId);
  }, [ownedShopId, authLoading]); // ← يعيد التشغيل عند تغيّر أي منهما

  async function loadReport(currentShopId: number) {
    console.log("REPORTS PAGE LOADED");

    const { data: sessionData } = await supabase.auth.getSession();
    console.log("CURRENT USER:", sessionData?.session?.user?.id);
    console.log("EMAIL:", sessionData?.session?.user?.email);
    console.log("STORE ID:", currentShopId);

    setLoading(true);

    const { data, error } = await supabase
      .from("products")
      .select("id, part_name, quantity, price, shop_id")
      .eq("shop_id", currentShopId);

    if (error) {
      console.error("[ReportsPage] products query error:", error.message);
      setLoading(false);
      return;
    }

    console.log("PRODUCTS COUNT:", data?.length);
    console.log("PRODUCTS:", data?.slice(0, 5));

    const uniqueShops = [...new Set((data || []).map((p: any) => p.shop_id))];
    console.log("SHOP IDS IN RESULT:", uniqueShops);

    const products: ProductReport[] = (data || []).map((p: any) => ({
      id:        p.id,
      part_name: p.part_name,
      quantity:  p.quantity || 0,
      price:     p.price    || 0,
    }));

    // ── الإحصاءات ─────────────────────────────────────────────────────────

    const totalProductsCount = products.length;

    const quantitySum = products.reduce(
      (sum, item) => sum + item.quantity,
      0
    );

    const stockValue = products.reduce(
      (sum, item) => sum + item.quantity * item.price,
      0
    );

    const lowStock = products.filter(
      (item) => item.quantity > 0 && item.quantity <= 3
    );

    const topMoving = [...products]
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    setTotalProducts(totalProductsCount);
    setTotalQuantity(quantitySum);
    setInventoryValue(stockValue);
    setLowStockCount(lowStock.length);
    setTopProducts(topMoving);
    setReorderProducts(lowStock);
    setLoading(false);
  }

  // ── Loading — ينتظر AuthContext أولاً ────────────────────────────────────

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-400 text-lg">جاري تحميل التقارير...</div>
      </div>
    );
  }

  if (!ownedShopId) {
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
        <h1 className="text-3xl font-bold text-white">التقارير</h1>
        <p className="text-slate-400 mt-2">ملخص أداء المحل والمخزون</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <p className="text-slate-400 text-sm">إجمالي المنتجات</p>
          <h2 className="text-3xl font-bold text-white mt-3">{totalProducts}</h2>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <p className="text-slate-400 text-sm">إجمالي الكمية</p>
          <h2 className="text-3xl font-bold text-white mt-3">{totalQuantity}</h2>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <p className="text-slate-400 text-sm">قيمة المخزون</p>
          <h2 className="text-3xl font-bold text-green-400 mt-3">
            {inventoryValue.toLocaleString("ar-SA")} ر.س
          </h2>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <p className="text-slate-400 text-sm">منخفض المخزون</p>
          <h2 className="text-3xl font-bold text-yellow-400 mt-3">{lowStockCount}</h2>
        </div>

      </div>

      {/* Tables */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <h3 className="text-xl font-bold text-white mb-4">أعلى المنتجات كمية</h3>

          {topProducts.length === 0 ? (
            <div className="text-slate-400">لا توجد منتجات</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="text-slate-400 text-right border-b border-slate-800">
                  <th className="pb-3">المنتج</th>
                  <th className="pb-3">الكمية</th>
                </tr>
              </thead>
              <tbody>
                {topProducts.map((item) => (
                  <tr key={item.id} className="border-b border-slate-800">
                    <td className="py-3 text-white">{item.part_name}</td>
                    <td className="py-3 text-blue-400">{item.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <h3 className="text-xl font-bold text-white mb-4">
            منتجات تحتاج إعادة طلب
          </h3>

          <div className="space-y-4">
            {reorderProducts.length === 0 ? (
              <div className="text-slate-400">
                لا توجد منتجات تحتاج إعادة طلب
              </div>
            ) : (
              reorderProducts.map((item) => (
                <div key={item.id} className="bg-slate-950 rounded-xl p-4">
                  <p className="text-white">{item.part_name}</p>
                  <p className="text-yellow-400 text-sm">الكمية: {item.quantity}</p>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
