import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { CheckCircle, XCircle, RefreshCw, ShoppingCart, Store, Calendar, DollarSign, Hash } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type OrderStatus = "pending" | "approved" | "rejected" | "completed";

type VerifiedOrder = {
  id: number;
  status: OrderStatus;
  total_amount: number;
  created_at: string;
  notes: string | null;
  from_shop: { shop_name: string } | null;
  to_shop:   { shop_name: string } | null;
};

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_META: Record<OrderStatus, { ar: string; color: string; dot: string }> = {
  pending:   { ar: "معلق",   color: "bg-amber-500/10 text-amber-400 border-amber-500/30",       dot: "bg-amber-400"   },
  approved:  { ar: "مقبول",  color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30", dot: "bg-emerald-400" },
  rejected:  { ar: "مرفوض", color: "bg-red-500/10 text-red-400 border-red-500/30",             dot: "bg-red-400"     },
  completed: { ar: "مكتمل",  color: "bg-blue-500/10 text-blue-400 border-blue-500/30",          dot: "bg-blue-400"    },
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function VerifyInvoicePage() {
  const { orderId } = useParams<{ orderId: string }>();
  const [order, setOrder]   = useState<VerifiedOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!orderId) { setNotFound(true); setLoading(false); return; }

    supabase
      .from("orders")
      .select(`
        id, status, total_amount, created_at, notes,
        from_shop:shops!orders_from_shop_id_fkey(shop_name),
        to_shop:shops!orders_to_shop_id_fkey(shop_name)
      `)
      .eq("id", Number(orderId))
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          setNotFound(true);
        } else {
          setOrder(data as VerifiedOrder);
        }
        setLoading(false);
      });
  }, [orderId]);

  const poNumber = order ? `PO-${String(order.id).padStart(6, "0")}` : "";

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center" dir="rtl">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw size={32} className="text-blue-400 animate-spin" />
          <p className="text-slate-400 text-sm font-bold">جارٍ التحقق من الفاتورة...</p>
        </div>
      </div>
    );
  }

  // ── Not Found ────────────────────────────────────────────────────────────────
  if (notFound) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4" dir="rtl">
        <div className="w-full max-w-sm text-center">
          {/* Icon */}
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
              <XCircle size={40} className="text-red-400" />
            </div>
          </div>

          {/* Title */}
          <h1 className="text-2xl font-black text-white mb-1">فاتورة غير موجودة</h1>
          <p className="text-sm font-semibold text-red-400 mb-2">Invalid Invoice</p>
          <p className="text-slate-500 text-sm leading-relaxed">
            لم يتم العثور على فاتورة بهذا الرقم في نظام محور.
            <br />
            تأكد من صحة رابط الفاتورة أو تواصل مع المورد.
          </p>

          {/* Brand footer */}
          <div className="mt-10 pt-6 border-t border-slate-800">
            <p className="text-slate-600 text-xs">منصة محور لقطع الغيار — MIHWAR</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Verified ─────────────────────────────────────────────────────────────────
  const statusMeta = STATUS_META[order!.status];
  const dateFormatted = new Date(order!.created_at).toLocaleDateString("ar-SA", {
    year: "numeric", month: "long", day: "numeric",
  });
  const timeFormatted = new Date(order!.created_at).toLocaleTimeString("ar-SA", {
    hour: "2-digit", minute: "2-digit",
  });

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4 py-10" dir="rtl">
      <div className="w-full max-w-sm">

        {/* ── Header badge ── */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-20 h-20 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-4">
            <CheckCircle size={40} className="text-emerald-400" />
          </div>
          <h1 className="text-2xl font-black text-white mb-1">فاتورة معتمدة</h1>
          <p className="text-sm font-semibold text-emerald-400">Verified Invoice</p>
        </div>

        {/* ── Main card ── */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">

          {/* Card header — PO number */}
          <div className="bg-slate-800/60 border-b border-slate-800 px-5 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Hash size={14} className="text-slate-500" />
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">رقم الأمر</span>
            </div>
            <span className="font-mono font-black text-white text-lg">{poNumber}</span>
          </div>

          {/* Card rows */}
          <div className="px-5 py-2 divide-y divide-slate-800/60">

            {/* Status */}
            <div className="flex items-center justify-between py-3.5">
              <span className="text-slate-500 text-sm font-semibold">الحالة</span>
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border ${statusMeta.color}`}>
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusMeta.dot}`} />
                {statusMeta.ar}
              </span>
            </div>

            {/* Buyer */}
            <div className="flex items-start justify-between py-3.5 gap-3">
              <div className="flex items-center gap-1.5 shrink-0">
                <ShoppingCart size={13} className="text-blue-400" />
                <span className="text-slate-500 text-sm font-semibold">المشتري</span>
              </div>
              <span className="text-white font-bold text-sm text-left truncate max-w-[55%]">
                {order!.from_shop?.shop_name ?? "—"}
              </span>
            </div>

            {/* Supplier */}
            <div className="flex items-start justify-between py-3.5 gap-3">
              <div className="flex items-center gap-1.5 shrink-0">
                <Store size={13} className="text-emerald-400" />
                <span className="text-slate-500 text-sm font-semibold">المورد</span>
              </div>
              <span className="text-white font-bold text-sm text-left truncate max-w-[55%]">
                {order!.to_shop?.shop_name ?? "—"}
              </span>
            </div>

            {/* Date */}
            <div className="flex items-center justify-between py-3.5">
              <div className="flex items-center gap-1.5">
                <Calendar size={13} className="text-slate-500" />
                <span className="text-slate-500 text-sm font-semibold">التاريخ</span>
              </div>
              <div className="text-left">
                <p className="text-white font-bold text-sm">{dateFormatted}</p>
                <p className="text-slate-500 text-[10px] font-mono">{timeFormatted}</p>
              </div>
            </div>

            {/* Total */}
            <div className="flex items-center justify-between py-3.5">
              <div className="flex items-center gap-1.5">
                <DollarSign size={13} className="text-emerald-500" />
                <span className="text-slate-500 text-sm font-semibold">الإجمالي</span>
              </div>
              <span className="text-emerald-400 font-black text-xl">
                {order!.total_amount.toLocaleString()}
                <span className="text-xs font-normal text-slate-500"> ر.س</span>
              </span>
            </div>

          </div>

          {/* Notes (if any) */}
          {order!.notes && (
            <div className="mx-5 mb-4 bg-amber-500/5 border border-amber-500/10 rounded-xl p-3">
              <p className="text-[9px] font-bold text-amber-500 uppercase tracking-wider mb-1">ملاحظات</p>
              <p className="text-slate-300 text-xs leading-relaxed">{order!.notes}</p>
            </div>
          )}
        </div>

        {/* ── Brand footer ── */}
        <div className="mt-8 text-center">
          <p className="text-slate-700 text-[11px] font-bold">محور</p>
          <p className="text-slate-700 text-[10px]">منصة قطع غيار ايسوزو B2B — MIHWAR</p>
        </div>

      </div>
    </div>
  );
}
