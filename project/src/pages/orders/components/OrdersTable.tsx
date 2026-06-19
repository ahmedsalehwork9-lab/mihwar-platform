// =============================================================
// src/pages/orders/components/OrdersTable.tsx
// Desktop (hidden lg:block) table view of orders, plus pagination.
// =============================================================

import { memo } from "react";
import { Eye, ChevronLeft, ChevronRight } from "lucide-react";
import type { Order } from "../types";
import { StatusBadge } from "./StatusBadge";

type OrdersTableProps = {
  orders: Order[];
  ownedShopId: number | null | undefined;
  onOpenDetail: (order: Order) => void;
  isRTL: boolean;
  t: (en: string, ar: string) => string;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
};

function OrdersTableBase({
  orders, ownedShopId, onOpenDetail, isRTL, t, page, totalPages, onPageChange,
}: OrdersTableProps) {
  return (
    <>
      <div className="hidden lg:block bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse min-w-[640px]" role="grid">
            <thead>
              <tr className="bg-slate-950/50 border-b border-slate-800 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                <th scope="col" className="p-4 whitespace-nowrap">{t("Order ID", "رقم الطلب")}</th>
                <th scope="col" className="p-4">{t("From", "من")}</th>
                <th scope="col" className="p-4">{t("To", "إلى")}</th>
                <th scope="col" className="p-4 whitespace-nowrap">{t("Amount", "المبلغ")}</th>
                <th scope="col" className="p-4">{t("Status", "الحالة")}</th>
                <th scope="col" className="p-4 whitespace-nowrap">{t("Date", "التاريخ")}</th>
                <th scope="col" className="p-4 text-center">{t("Action", "إجراء")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50 text-sm">
              {orders.length === 0 ? (
                <tr><td colSpan={7} className="p-16 text-center text-slate-600 italic">{t("No orders matching your criteria", "لا توجد طلبات مطابقة")}</td></tr>
              ) : orders.map(o => (
                <tr key={o.id} className="hover:bg-slate-800/20 transition-colors">
                  <td className="p-4 font-mono font-bold text-slate-400 whitespace-nowrap">#{o.id.toString().padStart(5, "0")}</td>
                  <td className={`p-4 font-bold ${o.from_shop_id === ownedShopId ? "text-blue-400" : "text-white"}`}>
                    <span className="truncate block max-w-[140px]">{o.from_shop?.shop_name}</span>
                    {o.from_shop_id === ownedShopId && <span className="text-[9px] opacity-50 font-medium px-1 bg-blue-500/10 rounded">{t("You", "أنت")}</span>}
                  </td>
                  <td className={`p-4 font-bold ${o.to_shop_id === ownedShopId ? "text-emerald-400" : "text-white"}`}>
                    <span className="truncate block max-w-[140px]">{o.to_shop?.shop_name}</span>
                    {o.to_shop_id === ownedShopId && <span className="text-[9px] opacity-50 font-medium px-1 bg-emerald-500/10 rounded">{t("You", "أنت")}</span>}
                  </td>
                  <td className="p-4 font-black text-white whitespace-nowrap">{o.total_amount.toLocaleString()} <span className="text-[10px] font-normal text-slate-500">ر.س</span></td>
                  <td className="p-4"><StatusBadge status={o.status} isRTL={isRTL} /></td>
                  <td className="p-4 text-slate-500 text-xs whitespace-nowrap">{new Date(o.created_at).toLocaleDateString()}</td>
                  <td className="p-4 text-center">
                    <button onClick={() => onOpenDetail(o)} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all">
                      <Eye size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="mt-6 flex justify-center items-center gap-2" role="navigation">
          <button onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page === 1} className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-500 disabled:opacity-20 hover:text-white transition-colors"><ChevronRight size={20} /></button>
          <span className="text-slate-500 text-xs font-bold mx-2">{page} / {totalPages}</span>
          <button onClick={() => onPageChange(Math.min(totalPages, page + 1))} disabled={page === totalPages} className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-500 disabled:opacity-20 hover:text-white transition-colors"><ChevronLeft size={20} /></button>
        </div>
      )}
    </>
  );
}

export const OrdersTable = memo(OrdersTableBase);
