import { useEffect, useState, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../context/LanguageContext";
import {
  ShoppingCart, RefreshCw, Package, Plus, X,
  Check, XCircle, PackageCheck,
  Eye, Trash2, AlertCircle, ChevronLeft, ChevronRight,
  ArrowLeftRight, Search, Save, ChevronDown,
  Printer, FileText, ArrowRightLeft,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

type OrderStatus = "pending" | "approved" | "rejected" | "completed";

type Order = {
  id: number;
  from_shop_id: number;
  to_shop_id: number;
  status: OrderStatus;
  total_amount: number;
  notes: string | null;
  created_at: string;
  from_shop?: { shop_name: string };
  to_shop?:   { shop_name: string };
  order_items?: { id: number }[];
};

type OrderItem = {
  id: number;
  order_id: number;
  product_id: number;
  quantity: number;
  price: number;
  product?: Product;
};

type Shop = {
  id: number;
  shop_name: string;
};

type Product = {
  id: number;
  part_name: string;
  part_number: string;
  brand: string;
  model: string;
  quantity: number;
  price: number;
  shop_id: number;
};

type CartItem = {
  product: Product;
  quantity: number;
};

// ─────────────────────────────────────────────────────────────
// CONSTANTS & HELPERS
// ─────────────────────────────────────────────────────────────

const PAGE_SIZE = 12;

const STATUS_META: Record<OrderStatus, { label: { ar: string; en: string }; color: string; dot: string }> = {
  pending:   { label: { ar: "معلق", en: "Pending" },   color: "bg-amber-500/10 text-amber-500 border-amber-500/20",      dot: "bg-amber-500"   },
  approved:  { label: { ar: "مقبول", en: "Approved" },  color: "bg-blue-500/10 text-blue-400 border-blue-500/20",         dot: "bg-blue-400"    },
  rejected:  { label: { ar: "مرفوض", en: "Rejected" }, color: "bg-red-500/10 text-red-400 border-red-500/20",             dot: "bg-red-400"     },
  completed: { label: { ar: "مكتمل", en: "Completed" }, color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", dot: "bg-emerald-400" },
};

function buildPrintHTML(order: Order, items: OrderItem[]): string {
  const date = new Date(order.created_at).toLocaleDateString("ar-SA", {
    year: "numeric", month: "long", day: "numeric",
  });
  const rows = items.map((item, i) => `
    <tr style="border-bottom: 1px solid #f3f4f6;">
      <td style="padding: 16px 8px;">${i + 1}</td>
      <td style="padding: 16px 8px; font-weight: 600;">${item.product?.part_name ?? "—"}</td>
      <td style="padding: 16px 8px;">${item.product?.part_number ?? "—"}</td>
      <td style="padding: 16px 8px; text-align: center;">${item.quantity}</td>
      <td style="padding: 16px 8px; text-align: left;">${item.price.toLocaleString()}</td>
      <td style="padding: 16px 8px; text-align: left; font-weight: 700;">${(item.price * item.quantity).toLocaleString()}</td>
    </tr>
  `).join("");

  return `
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: system-ui, sans-serif; padding: 40px; color: #1e293b; }
        .header { display: flex; justify-content: space-between; border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 30px; }
        table { width: 100%; border-collapse: collapse; }
        th { text-align: right; background: #f8fafc; padding: 12px 8px; font-size: 13px; }
        .total { margin-top: 30px; padding: 20px; background: #f1f5f9; border-radius: 8px; text-align: left; font-size: 24px; font-weight: 800; }
      </style>
    </head>
    <body>
      <div class="header">
        <div><h1>طلب شراء PO</h1><p>رقم: PO-${order.id}</p></div>
        <div><p>التاريخ: ${date}</p><p>من: ${order.from_shop?.shop_name}</p><p>إلى: ${order.to_shop?.shop_name}</p></div>
      </div>
      <table>
        <thead><tr><th>#</th><th>الصنف</th><th>رقم القطعة</th><th style="text-align:center">الكمية</th><th style="text-align:left">السعر</th><th style="text-align:left">الإجمالي</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="total">الإجمالي: ${order.total_amount.toLocaleString()} ر.س</div>
    </body>
    </html>
  `;
}

export default function OrdersPage() {
  const { ownedShopId, isAdmin } = useAuth() as any;
  const { t, isRTL } = useLang();

  const [orders, setOrders] = useState<Order[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [tab, setTab] = useState<"all" | "incoming" | "outgoing">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | OrderStatus>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [detailOrder, setDetailOrder] = useState<Order | null>(null);
  const [detailItems, setDetailItems] = useState<OrderItem[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [supplierShopId, setSupplierShopId] = useState<number | "">("");
  const [supplierProducts, setSupplierProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orderNotes, setOrderNotes] = useState("");
  const [modalError, setModalError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionId, setActionId] = useState<number | null>(null);

  useEffect(() => { fetchOrders(); fetchShops(); }, [ownedShopId, isAdmin]);

  const fetchOrders = async () => {
    if (!isAdmin && !ownedShopId) return;
    setLoading(true);
    let query = supabase.from("orders").select(`*, from_shop:shops!orders_from_shop_id_fkey(shop_name), to_shop:shops!orders_to_shop_id_fkey(shop_name), order_items(id)`);
    if (!isAdmin) query = query.or(`from_shop_id.eq.${ownedShopId},to_shop_id.eq.${ownedShopId}`);
    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) setError(error.message); else setOrders((data as Order[]) || []);
    setLoading(false);
  };

  const fetchShops = async () => {
    const { data } = await supabase.from("shops").select("id, shop_name").order("shop_name");
    setShops((data as Shop[]) || []);
  };

  useEffect(() => {
    if (!supplierShopId) { setSupplierProducts([]); return; }
    setLoadingProducts(true);
    supabase.from("products").select("*").eq("shop_id", supplierShopId).gt("quantity", 0).order("part_name")
      .then(({ data }) => { setSupplierProducts((data as Product[]) || []); setLoadingProducts(false); });
  }, [supplierShopId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders
      .filter(o => {
        if (isAdmin) return true;
        if (tab === "incoming") return o.to_shop_id === ownedShopId;
        if (tab === "outgoing") return o.from_shop_id === ownedShopId;
        return true;
      })
      .filter(o => statusFilter === "all" || o.status === statusFilter)
      .filter(o => !q || String(o.id).includes(q) || o.from_shop?.shop_name?.toLowerCase().includes(q) || o.to_shop?.shop_name?.toLowerCase().includes(q));
  }, [orders, tab, statusFilter, search, ownedShopId, isAdmin]);

  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  const counts = useMemo(() => ({
    all: orders.length,
    incoming: isAdmin ? orders.length : orders.filter(o => o.to_shop_id === ownedShopId).length,
    outgoing: isAdmin ? orders.length : orders.filter(o => o.from_shop_id === ownedShopId).length,
    pending: orders.filter(o => o.status === "pending").length,
  }), [orders, ownedShopId, isAdmin]);

  const openDetail = async (order: Order) => {
    setDetailOrder(order);
    setDetailLoading(true);
    const { data } = await supabase.from("order_items").select("*, product:products(*)").eq("order_id", order.id);
    setDetailItems((data as OrderItem[]) || []);
    setDetailLoading(false);
  };

  const handlePrint = () => {
    if (!detailOrder) return;
    const html = buildPrintHTML(detailOrder, detailItems);
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.print();
  };

  const handleApprove = async (orderId: number) => {
    setActionId(orderId);
    const { error } = await supabase.rpc("approve_order", { p_order_id: orderId });
    if (error) setError(error.message); else { 
        setToast(t('Order approved and stock updated ✓', 'تم اعتماد الطلب وتحديث المخزون ✓'));
        fetchOrders(); 
        if(detailOrder?.id === orderId) setDetailOrder({...detailOrder, status: 'completed'});
    }
    setActionId(null);
  };

  const handleReject = async (orderId: number) => {
    if (!confirm(t('Are you sure you want to reject this order?', "هل أنت متأكد من رفض هذا الطلب؟"))) return;
    setActionId(orderId);
    const { error } = await supabase.from("orders").update({ status: "rejected" }).eq("id", orderId);
    if (error) setError(error.message); else { 
        setToast(t('Order Rejected', "تم رفض الطلب"));
        fetchOrders(); 
        if(detailOrder?.id === orderId) setDetailOrder({...detailOrder, status: 'rejected'});
    }
    setActionId(null);
  };

  const addToCart = (product: Product) => {
    setCart(prev => prev.find(c => c.product.id === product.id) ? prev : [...prev, { product, quantity: 1 }]);
  };

  const updateQty = (productId: number, qty: number) => {
    const max = supplierProducts.find(p => p.id === productId)?.quantity ?? 1;
    setCart(prev => prev.map(c => c.product.id === productId ? { ...c, quantity: Math.max(1, Math.min(qty, max)) } : c));
  };

  const handleSubmit = async () => {
    setModalError(null);
    if (!supplierShopId || cart.length === 0) { setModalError(t('Please select a supplier and add items', "اختر المورد وأضف أصنافاً")); return; }
    setSaving(true);
    try {
      const { data: oData, error: oErr } = await supabase.from("orders").insert({
        from_shop_id: ownedShopId, to_shop_id: supplierShopId, status: "pending", total_amount: cart.reduce((s, c) => s + c.product.price * c.quantity, 0), notes: orderNotes || null
      }).select().single();
      if (oErr) throw oErr;
      const { error: iErr } = await supabase.from("order_items").insert(cart.map(c => ({ order_id: oData.id, product_id: c.product.id, quantity: c.quantity, price: c.product.price })));
      if (iErr) throw iErr;
      setShowModal(false); setCart([]); setSupplierShopId(""); fetchOrders();
      setToast(t('Order sent successfully ✓', "تم إرسال الطلب بنجاح ✓"));
    } catch (e: any) { setModalError(e.message); } finally { setSaving(false); }
  };

  const canActOnOrder = (order: Order): boolean => {
    if (isAdmin) return order.status === "pending";
    return order.to_shop_id === ownedShopId && order.status === "pending";
  };

  return (
    <div className="p-4 lg:p-8 min-h-screen pb-24 md:pb-8" dir={isRTL ? "rtl" : "ltr"}>
      {toast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] bg-emerald-600 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4">
          <Check size={18} /> <span className="font-bold">{toast}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-3">
            <ShoppingCart className="text-blue-500" /> {t('Orders', 'الطلبات')}
          </h1>
          <p className="text-slate-500 text-sm mt-1">{counts.all} {t('total orders', 'طلب إجمالي')} · {counts.pending} {t('pending', 'معلق')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchOrders} className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-all">
            <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
          </button>
          {!isAdmin && (
            <button onClick={() => setShowModal(true)} className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-blue-900/20 active:scale-95 transition-all">
              <Plus size={18} /> {t('New Order', 'طلب جديد')}
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        {[
          { label: t('All', 'الكل'), val: counts.all, color: 'text-white' },
          { label: t('Incoming', 'واردة'), val: counts.incoming, color: 'text-blue-400' },
          { label: t('Outgoing', 'صادرة'), val: counts.outgoing, color: 'text-emerald-400' },
          { label: t('Pending', 'معلقة'), val: counts.pending, color: 'text-amber-500' },
        ].map(s => (
          <div key={s.label} className="bg-slate-900/50 border border-slate-800 p-4 rounded-2xl shadow-sm">
            <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-1">{s.label}</p>
            <p className={`text-2xl font-black ${s.color}`}>{s.val}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col lg:flex-row gap-4 mb-6">
        <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800 overflow-x-auto no-scrollbar">
          {["all", "incoming", "outgoing"].map((k) => (
            <button key={k} onClick={() => {setTab(k as any); setPage(1);}} className={`px-5 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${tab === k ? "bg-slate-800 text-white shadow-sm" : "text-slate-500 hover:text-slate-300"}`}>
              {t(k, k === 'all' ? 'الكل' : k === 'incoming' ? 'واردة' : 'صادرة')}
            </button>
          ))}
        </div>
        <div className="flex-1 flex gap-2">
          <div className="relative flex-1">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('Search orders...', 'ابحث في الطلبات...')} className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2.5 pl-10 pr-4 text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all" />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)} className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-2 text-sm text-slate-300 outline-none focus:border-blue-500">
            <option value="all">{t('All Status', 'كل الحالات')}</option>
            {Object.keys(STATUS_META).map(s => <option key={s} value={s}>{STATUS_META[s as OrderStatus].label[isRTL ? 'ar' : 'en']}</option>)}
          </select>
        </div>
      </div>

      {/* Orders List (Mobile) */}
      <div className="lg:hidden space-y-4">
        {pageItems.length === 0 ? (
          <div className="py-20 text-center text-slate-600 bg-slate-900/30 rounded-3xl border border-dashed border-slate-800">{t('No orders found', 'لا توجد طلبات')}</div>
        ) : pageItems.map(o => {
          const meta = STATUS_META[o.status];
          return (
            <div key={o.id} onClick={() => openDetail(o)} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm active:scale-[0.98] transition-all">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Order ID</span>
                  <span className="text-white font-mono font-bold">#{o.id.toString().padStart(5, '0')}</span>
                </div>
                <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-tighter border ${meta.color}`}>{meta.label[isRTL ? 'ar' : 'en']}</div>
              </div>
              
              <div className="flex items-center gap-3 bg-slate-950/30 p-3 rounded-xl border border-slate-800/50 mb-4">
                <div className="flex-1 truncate"><p className="text-[9px] text-slate-500 uppercase font-bold mb-0.5">{t('From', 'من')}</p><p className="text-xs text-white font-bold truncate">{o.from_shop?.shop_name}</p></div>
                <ArrowRightLeft size={14} className="text-slate-700" />
                <div className="flex-1 truncate text-left"><p className="text-[9px] text-slate-500 uppercase font-bold mb-0.5">{t('To', 'إلى')}</p><p className="text-xs text-white font-bold truncate">{o.to_shop?.shop_name}</p></div>
              </div>

              <div className="flex justify-between items-center pt-2">
                <span className="text-slate-500 text-xs">{new Date(o.created_at).toLocaleDateString()}</span>
                <span className="text-emerald-500 font-black text-lg">{o.total_amount.toLocaleString()} <span className="text-[10px] font-normal">ر.س</span></span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop Table */}
      <div className="hidden lg:block bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <table className="w-full text-right">
          <thead>
            <tr className="bg-slate-950/50 border-b border-slate-800 text-[11px] font-bold text-slate-500 uppercase tracking-widest">
              <th className="p-4">{t('Order ID', 'رقم الطلب')}</th>
              <th className="p-4">{t('From', 'من')}</th>
              <th className="p-4">{t('To', 'إلى')}</th>
              <th className="p-4">{t('Amount', 'المبلغ')}</th>
              <th className="p-4">{t('Status', 'الحالة')}</th>
              <th className="p-4">{t('Date', 'التاريخ')}</th>
              <th className="p-4 text-center">{t('Action', 'إجراء')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50 text-sm">
            {pageItems.map(o => (
              <tr key={o.id} className="hover:bg-slate-800/20 transition-colors">
                <td className="p-4 font-mono font-bold text-slate-400">#{o.id.toString().padStart(5, '0')}</td>
                <td className={`p-4 font-bold ${o.from_shop_id === ownedShopId ? 'text-blue-400' : 'text-white'}`}>{o.from_shop?.shop_name} {o.from_shop_id === ownedShopId && <span className="text-[10px] opacity-50">(أنت)</span>}</td>
                <td className={`p-4 font-bold ${o.to_shop_id === ownedShopId ? 'text-emerald-400' : 'text-white'}`}>{o.to_shop?.shop_name} {o.to_shop_id === ownedShopId && <span className="text-[10px] opacity-50">(أنت)</span>}</td>
                <td className="p-4 font-black text-white">{o.total_amount.toLocaleString()} <span className="text-[10px] font-normal text-slate-500">ر.س</span></td>
                <td className="p-4">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-bold border ${STATUS_META[o.status].color}`}>
                        {STATUS_META[o.status].label[isRTL ? 'ar' : 'en']}
                    </span>
                </td>
                <td className="p-4 text-slate-500">{new Date(o.created_at).toLocaleDateString()}</td>
                <td className="p-4 text-center">
                  <button onClick={() => openDetail(o)} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all"><Eye size={18} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-8 flex justify-center gap-2">
          {Array.from({length: totalPages}).map((_, i) => (
            <button key={i} onClick={() => setPage(i+1)} className={`w-10 h-10 rounded-xl font-bold transition-all ${page === i+1 ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/30' : 'bg-slate-900 text-slate-500 border border-slate-800 hover:text-white'}`}>{i+1}</button>
          ))}
        </div>
      )}

      {/* Detail Drawer */}
      {detailOrder && (
        <div className="fixed inset-0 z-[110] flex items-end lg:items-center justify-center lg:p-4 animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setDetailOrder(null)} />
          <div className="relative bg-slate-900 border border-slate-800 w-full max-w-2xl lg:rounded-3xl rounded-t-[2.5rem] shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-slate-800 shrink-0">
              <div>
                <h2 className="text-xl font-black text-white">{t('Order Detail', 'تفاصيل الطلب')} <span className="text-slate-500 font-mono ml-2">#{detailOrder.id}</span></h2>
                <div className={`mt-2 inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-bold border ${STATUS_META[detailOrder.status].color}`}>
                  <div className={`w-1.5 h-1.5 rounded-full ${STATUS_META[detailOrder.status].dot}`} />
                  {STATUS_META[detailOrder.status].label[isRTL ? 'ar' : 'en']}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={handlePrint} className="p-2.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition-all"><Printer size={20} /></button>
                <button onClick={() => setDetailOrder(null)} className="p-2.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition-all"><X size={20} /></button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto no-scrollbar flex-1 space-y-6">
              {/* Order Flow */}
              <div className="flex items-center justify-center gap-4 bg-slate-950/40 p-5 rounded-2xl border border-slate-800">
                <div className="text-center flex-1">
                  <p className="text-[10px] font-bold text-slate-600 uppercase mb-1">{t('Requester', 'المحل الطالب')}</p>
                  <p className="text-sm font-bold text-white">{detailOrder.from_shop?.shop_name}</p>
                </div>
                <ArrowRightLeft size={24} className="text-slate-700" />
                <div className="text-center flex-1">
                  <p className="text-[10px] font-bold text-slate-600 uppercase mb-1">{t('Supplier', 'المحل المورد')}</p>
                  <p className="text-sm font-bold text-white">{detailOrder.to_shop?.shop_name}</p>
                </div>
              </div>

              {/* Items */}
              <div>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <Package size={14} /> {t('Order Items', 'الأصناف المطلوبة')}
                </h3>
                <div className="space-y-2">
                  {detailLoading ? (
                    <div className="py-10 text-center"><RefreshCw className="animate-spin mx-auto text-blue-500" /></div>
                  ) : detailItems.map(item => (
                    <div key={item.id} className="bg-slate-800/40 border border-slate-800/50 p-4 rounded-2xl flex justify-between items-center group">
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-bold text-sm truncate">{item.product?.part_name}</p>
                        <p className="text-slate-500 text-[11px] font-mono mt-0.5">{item.product?.part_number}</p>
                      </div>
                      <div className="text-right ml-4">
                        <p className="text-white font-black text-sm">{ (item.price * item.quantity).toLocaleString() } <span className="text-[9px] font-normal text-slate-500">ر.س</span></p>
                        <p className="text-slate-500 text-[10px]">{item.quantity} × {item.price.toLocaleString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {detailOrder.notes && (
                <div className="bg-amber-500/5 border border-amber-500/10 p-4 rounded-2xl">
                  <p className="text-[10px] font-bold text-amber-500 uppercase tracking-widest mb-1">{t('Notes', 'ملاحظات')}</p>
                  <p className="text-slate-300 text-sm italic">"{detailOrder.notes}"</p>
                </div>
              )}
            </div>

            {/* Total & Bottom Actions */}
            <div className="p-6 border-t border-slate-800 bg-slate-950/50 shrink-0">
              <div className="flex justify-between items-center mb-6">
                <span className="text-slate-400 font-bold">{t('Total Amount', 'الإجمالي الكلي')}</span>
                <span className="text-3xl font-black text-emerald-500">{detailOrder.total_amount.toLocaleString()} <span className="text-sm font-normal">ر.س</span></span>
              </div>
              
              {canActOnOrder(detailOrder) && (
                <div className="flex gap-3">
                  <button onClick={() => handleReject(detailOrder.id)} disabled={actionId === detailOrder.id} className="flex-1 py-4 rounded-2xl border border-red-500/20 text-red-500 font-bold hover:bg-red-500/10 transition-all flex items-center justify-center gap-2">
                    <XCircle size={20} /> {t('Reject', 'رفض')}
                  </button>
                  <button onClick={() => handleApprove(detailOrder.id)} disabled={actionId === detailOrder.id} className="flex-[2] py-4 rounded-2xl bg-emerald-600 text-white font-black hover:bg-emerald-500 shadow-xl shadow-emerald-900/20 transition-all flex items-center justify-center gap-2">
                    {actionId === detailOrder.id ? <RefreshCw className="animate-spin" size={20} /> : <PackageCheck size={20} />}
                    {t('Approve Order', 'اعتماد الطلب')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* New Order Modal */}
      {showModal && (
        <div className="fixed inset-0 z-[110] flex items-end lg:items-center justify-center lg:p-4 animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setShowModal(false)} />
          <div className="relative bg-slate-900 border border-slate-800 w-full max-w-3xl lg:rounded-3xl rounded-t-[2.5rem] shadow-2xl flex flex-col max-h-[95vh] overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-slate-800">
              <h2 className="text-xl font-black text-white">{t('Create New Order', 'إنشاء طلب جديد')}</h2>
              <button onClick={() => setShowModal(false)} className="p-2 text-slate-500 hover:text-white"><X size={24} /></button>
            </div>

            <div className="p-6 overflow-y-auto no-scrollbar space-y-6 flex-1">
              {modalError && <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-2xl text-red-500 text-sm font-bold flex items-center gap-2"><AlertCircle size={18}/> {modalError}</div>}
              
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-3">{t('Select Supplier', 'اختر المحل المورد')}</label>
                <select value={supplierShopId} onChange={e => {setSupplierShopId(Number(e.target.value) || ""); setCart([]);}} className="w-full bg-slate-800 border border-slate-700 rounded-2xl p-4 text-white focus:border-blue-500 outline-none transition-all">
                  <option value="">{t('-- Select Shop --', '-- اختر المورد --')}</option>
                  {shops.filter(s => s.id !== ownedShopId).map(s => <option key={s.id} value={s.id}>{s.shop_name}</option>)}
                </select>
              </div>

              {supplierShopId && (
                <div className="space-y-4">
                   <div className="flex items-center justify-between">
                    <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest">{t('Available Products', 'المنتجات المتوفرة')}</h3>
                    <div className="relative w-48">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
                      <input value={productSearch} onChange={e => setProductSearch(e.target.value)} placeholder={t('Search...', 'بحث...')} className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 pl-9 pr-4 text-xs text-white outline-none focus:border-blue-500" />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-64 overflow-y-auto no-scrollbar pr-1">
                    {supplierProducts.filter(p => !productSearch || p.part_name.toLowerCase().includes(productSearch.toLowerCase()) || p.part_number.includes(productSearch)).map(p => (
                      <div key={p.id} className="bg-slate-800/40 border border-slate-800 p-3 rounded-xl flex justify-between items-center group hover:border-blue-500/30 transition-all">
                        <div className="min-w-0">
                          <p className="text-white font-bold text-xs truncate">{p.part_name}</p>
                          <p className="text-slate-500 text-[10px] font-mono">{p.part_number}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-emerald-500 font-bold text-xs">{p.price.toLocaleString()}</span>
                          <button onClick={() => addToCart(p)} className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 active:scale-90 transition-all"><Plus size={16} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {cart.length > 0 && (
                <div className="space-y-4 pt-4 border-t border-slate-800">
                  <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest">{t('Current Cart', 'سلة الطلب')}</h3>
                  <div className="space-y-2">
                    {cart.map(c => (
                      <div key={c.product.id} className="bg-slate-950/40 p-4 rounded-2xl flex items-center justify-between border border-slate-800/50">
                        <div className="flex-1 truncate mr-4">
                          <p className="text-white font-bold text-sm truncate">{c.product.part_name}</p>
                          <p className="text-[10px] text-slate-500">{c.product.price.toLocaleString()} ر.س</p>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="flex items-center bg-slate-800 rounded-xl p-1">
                            <button onClick={() => updateQty(c.product.id, c.quantity - 1)} className="w-8 h-8 flex items-center justify-center text-white hover:text-blue-400 transition-colors"> - </button>
                            <span className="w-8 text-center font-bold text-white text-sm">{c.quantity}</span>
                            <button onClick={() => updateQty(c.product.id, c.quantity + 1)} className="w-8 h-8 flex items-center justify-center text-white hover:text-blue-400 transition-colors"> + </button>
                          </div>
                          <button onClick={() => setCart(prev => prev.filter(i => i.product.id !== c.product.id))} className="text-slate-600 hover:text-red-500 p-1"><Trash2 size={18} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">{t('Order Notes', 'ملاحظات إضافية')}</label>
                <textarea value={orderNotes} onChange={e => setOrderNotes(e.target.value)} placeholder={t('Any special instructions...', 'أي تعليمات خاصة للطلب...')} className="w-full bg-slate-800 border border-slate-700 rounded-2xl p-4 text-white outline-none focus:border-blue-500 min-h-[80px]" />
              </div>
            </div>

            <div className="p-6 border-t border-slate-800 bg-slate-950/50">
              <button onClick={handleSubmit} disabled={saving || cart.length === 0} className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white font-black rounded-2xl shadow-xl shadow-blue-900/20 active:scale-95 transition-all flex items-center justify-center gap-2">
                {saving ? <RefreshCw className="animate-spin" /> : <Save size={20} />}
                {t('Confirm and Send Order', 'تأكيد وإرسال الطلب')} ({cart.reduce((s, c) => s + c.product.price * c.quantity, 0).toLocaleString()} ر.س)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}