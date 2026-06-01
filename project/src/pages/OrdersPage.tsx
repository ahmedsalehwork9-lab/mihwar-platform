import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import {
  FileText,
  Download,
  Share2,
  Phone,
  MessageCircle,
  Clock,
  CheckCircle2,
  Printer,
  ChevronRight,
  ArrowRight,
  Store,
  User,
  MoreVertical,
  X,
  AlertCircle
} from 'lucide-react';
import QRCode from 'react-qr-code';

type Order = {
  id: number;
  created_at: string;
  status: string;
  total_amount: number;
  from_shop_id: number;
  to_shop_id: number;
  notes?: string;
  from_shop?: { shop_name: string; city: string; phone: string };
  to_shop?: { shop_name: string; city: string; phone: string };
};

export default function OrdersPage() {
  const { ownedShopId } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'details'>('list');

  useEffect(() => {
    if (ownedShopId) fetchOrders();
  }, [ownedShopId]);

  const fetchOrders = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        from_shop:from_shop_id(shop_name, city, phone),
        to_shop:to_shop_id(shop_name, city, phone)
      `)
      .or(`from_shop_id.eq.${ownedShopId},to_shop_id.eq.${ownedShopId}`)
      .order('created_at', { ascending: false });

    if (!error && data) setOrders(data);
    setLoading(false);
  };

  const openOrderDetails = async (order: Order) => {
    const { data, error } = await supabase
      .from('order_items')
      .select(`*, product:product_id(part_name, part_number)`)
      .eq('order_id', order.id);

    if (!error && data) {
      setSelectedOrder({ ...order, items: data });
      setView('details');
    }
  };

  const getStatusBadge = (status: string) => {
    const styles: any = {
      completed: { label: 'مكتمل', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
      pending: { label: 'قيد الانتظار', color: 'bg-amber-100 text-amber-700 border-amber-200' },
      approved: { label: 'تم الاعتماد', color: 'bg-blue-100 text-blue-700 border-blue-200' },
    };
    const current = styles[status] || { label: status, color: 'bg-slate-100 text-slate-700 border-slate-200' };
    return <span className={`px-4 py-1 rounded-full text-xs font-bold border ${current.color}`}>{current.label}</span>;
  };

  // --- شاشة تفاصيل الطلب (تصميم الفاتورة) ---
  if (view === 'details' && selectedOrder) {
    const vat = selectedOrder.total_amount * 0.15;
    const subtotal = selectedOrder.total_amount;

    return (
      <div className="min-h-screen bg-slate-100 pb-20 font-sans" dir="rtl">
        {/* Navigation Header */}
        <div className="bg-white border-b border-slate-200 px-4 py-3 sticky top-0 z-30 shadow-sm">
          <div className="max-w-5xl mx-auto flex justify-between items-center">
            <button onClick={() => setView('list')} className="flex items-center gap-2 text-slate-600 hover:text-blue-600 font-bold">
              <ArrowRight size={20} /> العودة للطلبات
            </button>
            <div className="flex gap-2">
              <button className="p-2 text-slate-400 hover:text-blue-600"><Printer size={20} /></button>
              <button className="p-2 text-slate-400 hover:text-blue-600"><Share2 size={20} /></button>
            </div>
          </div>
        </div>

        {/* The Invoice Sheet */}
        <div className="max-w-5xl mx-auto mt-6 bg-white shadow-2xl rounded-lg overflow-hidden border border-slate-200">
          {/* Invoice Header */}
          <div className="p-8 border-b-4 border-blue-600 flex flex-col md:flex-row justify-between gap-6">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="bg-blue-600 p-2 rounded-lg text-white">
                  <FileText size={32} />
                </div>
                <h1 className="text-3xl font-black text-slate-900 tracking-tight">طلب شراء</h1>
              </div>
              <div className="space-y-1">
                <p className="text-slate-500 text-sm font-bold">رقم الطلب: <span className="text-slate-900">#000{selectedOrder.id}</span></p>
                <p className="text-slate-500 text-sm font-bold">تاريخ الطلب: <span className="text-slate-900">{new Date(selectedOrder.created_at).toLocaleDateString('ar-SA')}</span></p>
                <p className="text-slate-500 text-sm font-bold">الحالة: {getStatusBadge(selectedOrder.status)}</p>
              </div>
            </div>
            
            <div className="flex flex-col items-center md:items-end gap-3">
              <div className="bg-white p-2 border border-slate-200 rounded-lg shadow-sm">
                <QRCode value={`ORD-${selectedOrder.id}`} size={90} />
              </div>
              <p className="text-[10px] font-mono text-slate-400">Scan to verify order</p>
            </div>
          </div>

          {/* Parties Section */}
          <div className="grid grid-cols-1 md:grid-cols-2">
            <div className="p-8 border-l border-slate-100 bg-slate-50/50">
              <h3 className="flex items-center gap-2 text-blue-600 font-black mb-4 pb-2 border-b border-blue-100">
                <Store size={18} /> المورد (البائع)
              </h3>
              <div className="space-y-2 text-sm">
                <p className="flex justify-between font-bold text-slate-700"><span>اسم المحل:</span> <span>{selectedOrder.to_shop?.shop_name}</span></p>
                <p className="flex justify-between text-slate-500"><span>رقم الجوال:</span> <span className="font-mono">{selectedOrder.to_shop?.phone}</span></p>
                <p className="flex justify-between text-slate-500"><span>المدينة:</span> <span>{selectedOrder.to_shop?.city}</span></p>
              </div>
            </div>
            <div className="p-8 bg-slate-50/50">
              <h3 className="flex items-center gap-2 text-slate-600 font-black mb-4 pb-2 border-b border-slate-200">
                <User size={18} /> الطالب (المشتري)
              </h3>
              <div className="space-y-2 text-sm">
                <p className="flex justify-between font-bold text-slate-700"><span>اسم المحل:</span> <span>{selectedOrder.from_shop?.shop_name}</span></p>
                <p className="flex justify-between text-slate-500"><span>رقم الجوال:</span> <span className="font-mono">{selectedOrder.from_shop?.phone}</span></p>
                <p className="flex justify-between text-slate-500"><span>المدينة:</span> <span>{selectedOrder.from_shop?.city}</span></p>
              </div>
            </div>
          </div>

          {/* Items Table */}
          <div className="p-8">
            <h3 className="font-black text-slate-800 mb-4 flex items-center gap-2">الأصناف المطلوبة</h3>
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-right">
                <thead>
                  <tr className="bg-slate-900 text-white text-xs uppercase">
                    <th className="p-4 w-12">م</th>
                    <th className="p-4">رقم القطعة</th>
                    <th className="p-4">اسم القطعة</th>
                    <th className="p-4 text-center">الكمية</th>
                    <th className="p-4">سعر الوحدة</th>
                    <th className="p-4">الإجمالي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selectedOrder.items?.map((item: any, idx: number) => (
                    <tr key={idx} className="text-sm text-slate-700 hover:bg-slate-50 transition-colors">
                      <td className="p-4 text-slate-400 font-bold">{idx + 1}</td>
                      <td className="p-4 font-mono text-blue-600 font-bold">{item.product?.part_number}</td>
                      <td className="p-4 font-bold">{item.product?.part_name}</td>
                      <td className="p-4 text-center font-black">{item.quantity}</td>
                      <td className="p-4">{item.price} ر.س</td>
                      <td className="p-4 font-black">{item.price * item.quantity} ر.س</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Footer Grid: Timeline and Summary */}
          <div className="grid grid-cols-1 md:grid-cols-2 p-8 pt-0 gap-8">
            {/* Timeline */}
            <div className="border border-slate-200 rounded-xl p-6 bg-slate-50/30">
               <h4 className="font-black text-xs uppercase tracking-widest text-slate-400 mb-6 flex items-center gap-2">
                 <Clock size={14} /> سجل الطلب
               </h4>
               <div className="space-y-6 relative">
                 <div className="absolute top-2 bottom-2 right-3 w-0.5 bg-slate-200" />
                 <TimelineStep label="تم إنشاء الطلب" time="09:30 ص" active />
                 <TimelineStep label="تم إرسال الطلب للمورد" time="09:31 ص" active />
                 <TimelineStep label="تم اعتماد الطلب" time="--" active={selectedOrder.status !== 'pending'} />
                 <TimelineStep label="تم إغلاق الطلب (مكتمل)" time="--" active={selectedOrder.status === 'completed'} last />
               </div>
            </div>

            {/* Total Summary */}
            <div className="bg-blue-50 border-2 border-blue-100 rounded-2xl p-6 space-y-4">
              <div className="flex justify-between text-slate-600 font-bold">
                <span>الإجمالي الفرعي</span>
                <span>{subtotal.toLocaleString()} ر.س</span>
              </div>
              <div className="flex justify-between text-slate-500 text-sm font-bold border-b border-blue-100 pb-4">
                <span>ضريبة القيمة المضافة (15%)</span>
                <span>{vat.toLocaleString()} ر.س</span>
              </div>
              <div className="flex justify-between items-center pt-2">
                <span className="text-blue-900 font-black text-xl uppercase tracking-tighter italic">الإجمالي النهائي</span>
                <span className="text-3xl font-black text-blue-600 tracking-tighter italic">
                  {(subtotal + vat).toLocaleString()} <span className="text-xs not-italic">ر.س</span>
                </span>
              </div>
            </div>
          </div>

          {/* Notes */}
          {selectedOrder.notes && (
            <div className="p-8 pt-0">
               <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
                  <AlertCircle className="text-amber-600 shrink-0" size={20} />
                  <div>
                    <h5 className="font-black text-amber-900 text-xs mb-1">ملاحظات الطلب:</h5>
                    <p className="text-amber-800 text-sm leading-relaxed">{selectedOrder.notes}</p>
                  </div>
               </div>
            </div>
          )}
        </div>

        {/* Action Buttons for Details View */}
        <div className="max-w-5xl mx-auto mt-6 flex flex-wrap gap-3 px-4">
          <button className="flex-1 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black flex items-center justify-center gap-3 shadow-lg shadow-blue-200">
            <Download size={20} /> تحميل الطلب PDF
          </button>
          <button className="flex-1 h-14 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black flex items-center justify-center gap-3 shadow-lg shadow-emerald-200">
            <MessageCircle size={20} /> واتساب المورد
          </button>
          <button className="w-14 h-14 bg-white border border-slate-200 text-slate-400 rounded-xl flex items-center justify-center hover:text-blue-600">
            <Phone size={20} />
          </button>
        </div>
      </div>
    );
  }

  // --- شاشة قائمة الطلبات الرئيسية ---
  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 dir-rtl" dir="rtl">
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tighter italic">طلبات الشراء <span className="text-blue-600">ORDERS</span></h1>
            <p className="text-slate-500 font-bold mt-1 text-sm">إدارة كافة عمليات التوريد والشراء الخاصة بمحلك</p>
          </div>
          <button onClick={fetchOrders} className="p-3 bg-white border border-slate-200 rounded-xl text-blue-600 hover:shadow-md transition-all">
            <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {loading ? (
          <div className="py-20 text-center animate-pulse text-slate-400 font-black italic uppercase tracking-widest text-sm">
             جاري جلب قائمة الطلبات...
          </div>
        ) : orders.length === 0 ? (
          <div className="bg-white border-2 border-dashed border-slate-200 rounded-[2.5rem] py-24 text-center">
            <FileText size={48} className="text-slate-200 mx-auto mb-4" />
            <p className="text-slate-400 font-bold italic">لا توجد طلبات مسجلة حالياً</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {orders.map((order) => (
              <button
                key={order.id}
                onClick={() => openOrderDetails(order)}
                className="bg-white border border-slate-200 hover:border-blue-300 p-5 rounded-2xl flex items-center justify-between transition-all group text-right shadow-sm hover:shadow-md"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
                    <FileText size={24} />
                  </div>
                  <div>
                    <h3 className="font-black italic text-slate-900 text-lg mb-1 tracking-tighter">طلب #{order.id}</h3>
                    <p className="text-slate-400 text-xs font-bold flex items-center gap-1">
                       <Store size={10} /> {order.to_shop?.shop_name}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-left hidden sm:block">
                     <div className="text-blue-600 font-black italic text-xl tracking-tighter">{order.total_amount.toLocaleString()} ر.س</div>
                     <div className="text-[10px] text-slate-400 font-bold uppercase italic">{new Date(order.created_at).toLocaleDateString('ar-SA')}</div>
                  </div>
                  <ChevronRight size={20} className="text-slate-300 group-hover:text-blue-600 transition-all" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// مكون فرعي للسجل الزمني
const TimelineStep = ({ label, time, active, last }: any) => (
  <div className="flex items-start gap-4 relative">
    <div className={`w-7 h-7 rounded-lg flex items-center justify-center border-4 border-white z-10 transition-all shadow-sm ${active ? 'bg-blue-600 scale-110' : 'bg-slate-200'}`}>
       {active && <CheckCircle2 size={12} strokeWidth={3} className="text-white" />}
    </div>
    <div className="pt-0.5 text-right flex-1">
      <p className={`text-xs font-black italic ${active ? 'text-slate-900' : 'text-slate-400'}`}>{label}</p>
      <p className="text-[10px] text-slate-400 font-bold mt-0.5">{time}</p>
    </div>
  </div>
);

const RefreshCw = ({ size, className }: { size: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
    <path d="M21 3v5h-5" />
    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
    <path d="M3 21v-5h5" />
  </svg>
);