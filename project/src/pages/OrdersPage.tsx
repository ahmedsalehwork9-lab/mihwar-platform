import { useEffect, useState, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import {
  ShoppingCart, RefreshCw, Package, Plus, X,
  Check, XCircle, Clock, PackageCheck,
  Eye, Trash2, AlertCircle, ChevronLeft, ChevronRight,
  ArrowLeftRight, Search, Save, ChevronDown,
  Printer, FileText, Download, Share2, Phone, MessageCircle, Calendar, Store, User, CheckCircle2
} from "lucide-react";
import QRCode from "react-qr-code";

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
  from_shop?: { shop_name: string; city?: string; phone?: string };
  to_shop?:   { shop_name: string; city?: string; phone?: string };
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
  phone?: string;
  city?: string;
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
// CONSTANTS & THEME
// ─────────────────────────────────────────────────────────────

const PAGE_SIZE = 10;

const STATUS_META: Record<OrderStatus, { label: string; color: string; bg: string; dot: string; icon: any }> = {
  pending:   { label: "معلق",   color: "text-amber-400", bg: "bg-amber-500/10", dot: "bg-amber-400", icon: Clock },
  approved:  { label: "مقبول",  color: "text-blue-400",  bg: "bg-blue-500/10",  dot: "bg-blue-400",  icon: CheckCircle2 },
  rejected:  { label: "مرفوض", color: "text-red-400",   bg: "bg-red-500/10",   dot: "bg-red-400",   icon: XCircle },
  completed: { label: "مكتمل", color: "text-emerald-400", bg: "bg-emerald-500/10", dot: "bg-emerald-400", icon: PackageCheck },
};

// ─────────────────────────────────────────────────────────────
// PRINT / PDF HELPER (PROFESSIONAL INVOICE)
// ─────────────────────────────────────────────────────────────

function buildPrintHTML(order: Order, items: OrderItem[]): string {
  const date = new Date(order.created_at).toLocaleString("ar-SA", {
    day: "numeric", month: "long", year: "numeric",
  });
  const vat = Number(order.total_amount) * 0.15;
  const subtotal = Number(order.total_amount) - vat;

  const rows = items.map((item, i) => `
    <tr>
      <td style="text-align: center;">${i + 1}</td>
      <td>
        <div style="font-weight: 700; color: #1e293b;">${item.product?.part_name ?? "—"}</div>
        <div style="font-size: 11px; color: #64748b; font-family: monospace;">${item.product?.part_number ?? "—"}</div>
      </td>
      <td style="text-align: center;">${item.quantity}</td>
      <td style="text-align: left;">${item.price.toLocaleString()} ر.س</td>
      <td style="text-align: left; font-weight: 700;">${(item.price * item.quantity).toLocaleString()} ر.س</td>
    </tr>
  `).join("");

  return `
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8" />
      <title>Mehwar Invoice - #${order.id}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'IBM Plex Sans Arabic', sans-serif; }
        body { background: #fff; color: #1e293b; padding: 40px; }
        .invoice-container { max-width: 800px; margin: auto; }
        .header { display: flex; justify-content: space-between; align-items: start; margin-bottom: 40px; border-bottom: 4px solid #1a56db; padding-bottom: 20px; }
        .logo-area h1 { font-size: 32px; font-weight: 900; color: #1a56db; font-style: italic; }
        .meta-area { text-align: left; }
        .meta-area h2 { font-size: 20px; color: #1e293b; margin-bottom: 5px; }
        .meta-area p { font-size: 13px; color: #64748b; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 40px; }
        .info-card { background: #f8fafc; border: 1px solid #e2e8f0; padding: 20px; border-radius: 12px; }
        .info-card h4 { font-size: 11px; color: #94a3b8; text-transform: uppercase; margin-bottom: 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
        .info-card p { font-weight: 700; font-size: 16px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
        thead th { background: #1e293b; color: #fff; padding: 12px; font-size: 12px; text-align: right; }
        tbody td { padding: 15px 12px; border-bottom: 1px solid #f1f5f9; font-size: 13px; }
        .summary-wrapper { display: flex; justify-content: flex-end; }
        .summary-table { width: 300px; }
        .summary-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f1f5f9; font-size: 14px; }
        .total-row { border-bottom: none; padding-top: 15px; }
        .total-row span:last-child { font-size: 24px; font-weight: 900; color: #1a56db; font-style: italic; }
        .footer { margin-top: 50px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #f1f5f9; padding-top: 20px; }
        @media print { body { padding: 0; } .invoice-container { max-width: 100%; } }
      </style>
    </head>
    <body>
      <div class="invoice-container">
        <div class="header">
          <div class="logo-area">
            <h1>محور MEHWAR</h1>
            <p>منصة قطع غيار إيسوزو B2B</p>
          </div>
          <div class="meta-area">
            <h2>طلب شراء #${String(order.id).padStart(5, '0')}</h2>
            <p>تاريخ الإصدار: ${date}</p>
          </div>
        </div>
        <div class="info-grid">
          <div class="info-card">
            <h4>الطالب (المشتري)</h4>
            <p>${order.from_shop?.shop_name ?? "—"}</p>
            <div style="font-size: 12px; color: #64748b; margin-top: 4px;">${order.from_shop?.city ?? ""}</div>
          </div>
          <div class="info-card">
            <h4>المورد (البائع)</h4>
            <p>${order.to_shop?.shop_name ?? "—"}</p>
            <div style="font-size: 12px; color: #64748b; margin-top: 4px;">${order.to_shop?.city ?? ""}</div>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th style="width: 50px; text-align: center;">#</th>
              <th>الصنف / رقم القطعة</th>
              <th style="width: 80px; text-align: center;">الكمية</th>
              <th style="width: 120px; text-align: left;">سعر الوحدة</th>
              <th style="width: 120px; text-align: left;">الإجمالي</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="summary-wrapper">
          <div class="summary-table">
            <div class="summary-row"><span>الإجمالي الفرعي</span><span>${subtotal.toLocaleString()} ر.س</span></div>
            <div class="summary-row"><span>الضريبة (15%)</span><span>${vat.toLocaleString()} ر.س</span></div>
            <div class="summary-row total-row"><span>الإجمالي النهائي</span><span>${Number(order.total_amount).toLocaleString()} ر.س</span></div>
          </div>
        </div>
        <div class="footer">
          تم إنشاء هذا المستند بواسطة منصة محور لقطع غيار إيسوزو - www.mehwar.sa
        </div>
      </div>
    </body>
    </html>
  `;
}

// ─────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────

export default function OrdersPage() {
  const { ownedShopId, isAdmin } = useAuth() as any;

  /* ── data ─────────────────────────────────── */
  const [orders,   setOrders]   = useState<Order[]>([]);
  const [shops,    setShops]    = useState<Shop[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [toast,    setToast]    = useState<string | null>(null);

  /* ── table ────────────────────────────────── */
  const [tab,          setTab]          = useState<"all"|"incoming"|"outgoing">("all");
  const [statusFilter, setStatusFilter] = useState<"all"|OrderStatus>("all");
  const [search,       setSearch]       = useState("");
  const [page,         setPage]         = useState(1);

  /* ── detail drawer ────────────────────────── */
  const [detailOrderId,  setDetailOrderId]  = useState<number | null>(null);
  const [detailItems,    setDetailItems]    = useState<OrderItem[]>([]);
  const [detailLoading,  setDetailLoading]  = useState(false);

  /* ── new order modal ──────────────────────── */
  const [showModal,        setShowModal]        = useState(false);
  const [supplierShopId,   setSupplierShopId]   = useState<number | "">("");
  const [supplierProducts, setSupplierProducts] = useState<Product[]>([]);
  const [loadingProducts,  setLoadingProducts]  = useState(false);
  const [productSearch,    setProductSearch]    = useState("");
  const [cart,             setCart]             = useState<CartItem[]>([]);
  const [orderNotes,       setOrderNotes]       = useState("");
  const [modalError,       setModalError]       = useState<string | null>(null);
  const [saving,           setSaving]           = useState(false);

  /* ── action loading ───────────────────────── */
  const [actionId, setActionId] = useState<number | null>(null);

  const detailOrder = useMemo(
    () => orders.find(o => o.id === detailOrderId) ?? null,
    [orders, detailOrderId]
  );

  const fetchOrders = async (): Promise<Order[]> => {
    if (!isAdmin && !ownedShopId) return [];
    setLoading(true);
    try {
      let query = supabase
        .from("orders")
        .select(`
          *,
          from_shop:shops!orders_from_shop_id_fkey(shop_name, city, phone),
          to_shop:shops!orders_to_shop_id_fkey(shop_name, city, phone),
          order_items(id)
        `);
      if (!isAdmin) {
        query = query.or(`from_shop_id.eq.${ownedShopId},to_shop_id.eq.${ownedShopId}`);
      }
      const { data, error: fetchError } = await query.order("created_at", { ascending: false });
      if (fetchError) throw fetchError;
      const fetched = (data as Order[]) || [];
      setOrders(fetched);
      return fetched;
    } catch (e: any) {
      setError(e.message);
      return [];
    } finally {
      setLoading(false);
    }
  };

  const fetchShops = async () => {
    const { data } = await supabase.from("shops").select("id, shop_name, phone, city").order("shop_name");
    setShops((data as Shop[]) || []);
  };

  useEffect(() => {
    fetchOrders();
    fetchShops();
  }, [ownedShopId, isAdmin]);

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
        if (tab === "incoming") return o.to_shop_id   === ownedShopId;
        if (tab === "outgoing") return o.from_shop_id === ownedShopId;
        return true;
      })
      .filter(o => statusFilter === "all" || o.status === statusFilter)
      .filter(o => !q || String(o.id).includes(q) || o.from_shop?.shop_name?.toLowerCase().includes(q) || o.to_shop?.shop_name?.toLowerCase().includes(q));
  }, [orders, tab, statusFilter, search, ownedShopId, isAdmin]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const counts = useMemo(() => ({
    all:      orders.length,
    incoming: isAdmin ? orders.length : orders.filter(o => o.to_shop_id   === ownedShopId).length,
    outgoing: isAdmin ? orders.length : orders.filter(o => o.from_shop_id === ownedShopId).length,
    pending:  orders.filter(o => o.status === "pending").length,
  }), [orders, ownedShopId, isAdmin]);

  const openDetail = async (order: Order) => {
    setDetailOrderId(order.id);
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
    win.onload = () => { win.focus(); win.print(); };
  };

  const handleApprove = async (orderId: number) => {
    if (actionId !== null) return;
    setActionId(orderId);
    try {
      const { error: rpcError } = await supabase.rpc("approve_order", { p_order_id: orderId });
      if (rpcError) throw rpcError;
      await fetchOrders();
      setToast("تم اعتماد الطلب وتحديث المخزون ✓");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setActionId(null);
    }
  };

  const handleReject = async (orderId: number) => {
    if (!confirm("رفض الطلب؟")) return;
    if (actionId !== null) return;
    setActionId(orderId);
    try {
      const { error: rejectError } = await supabase.from("orders").update({ status: "rejected" }).eq("id", orderId);
      if (rejectError) throw rejectError;
      await fetchOrders();
      setToast("تم رفض الطلب");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setActionId(null);
    }
  };

  const addToCart = (product: Product) => setCart(prev => prev.find(c => c.product.id === product.id) ? prev : [...prev, { product, quantity: 1 }]);
  const updateQty = (productId: number, qty: number) => setCart(prev => prev.map(c => c.product.id === productId ? { ...c, quantity: Math.max(1, qty) } : c));
  const removeFromCart = (productId: number) => setCart(prev => prev.filter(c => c.product.id !== productId));
  const cartTotal = cart.reduce((s, c) => s + c.product.price * c.quantity, 0);

  const handleSubmit = async () => {
    if (!supplierShopId || cart.length === 0) return setModalError("بيانات ناقصة");
    setSaving(true);
    try {
      const { data: orderData, error: oErr } = await supabase.from("orders").insert({ from_shop_id: ownedShopId, to_shop_id: supplierShopId, status: "pending", total_amount: cartTotal, notes: orderNotes || null }).select().single();
      if (oErr) throw oErr;
      await supabase.from("order_items").insert(cart.map(c => ({ order_id: orderData.id, product_id: c.product.id, quantity: c.quantity, price: c.product.price })));
      setShowModal(false);
      setCart([]);
      setToast("تم إرسال الطلب بنجاح ✓");
      await fetchOrders();
    } catch (e: any) {
      setModalError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const canActOnOrder = (order: Order): boolean => isAdmin ? order.status === "pending" : order.to_shop_id === ownedShopId && order.status === "pending";

  return (
    <div className="min-h-screen bg-[#0b0f1a] text-slate-200 pb-20 p-4 md:p-8 dir-rtl" dir="rtl">
      {toast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] bg-emerald-600 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-top-4">
          <CheckCircle2 size={20} /> <span className="font-bold">{toast}</span>
        </div>
      )}

      {/* HEADER SECTION */}
      <div className="max-w-6xl mx-auto mb-10 flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <h1 className="text-4xl font-black italic text-white tracking-tighter mb-2 uppercase">الطلبات <span className="text-blue-500">ORDERS</span></h1>
          <p className="text-slate-500 font-bold italic">إجمالي الأصناف والعمليات التجارية النشطة</p>
        </div>
        <div className="flex gap-3 w-full md:w-auto">
          <button onClick={fetchOrders} className="h-12 w-12 flex items-center justify-center bg-slate-900 border border-slate-800 rounded-2xl text-blue-400 hover:text-white transition-all shadow-xl">
            <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
          </button>
          {!isAdmin && (
            <button onClick={() => setShowModal(true)} className="flex-1 md:flex-none h-12 bg-blue-600 hover:bg-blue-500 text-white px-8 rounded-2xl font-black italic shadow-lg shadow-blue-900/30 transition-all flex items-center justify-center gap-3">
              <Plus size={20} strokeWidth={3} /> طلب جديد
            </button>
          )}
        </div>
      </div>

      {/* STATS STRIP */}
      <div className="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="واردة" value={counts.incoming} color="text-blue-400" icon={<ArrowLeftRight size={16}/>} />
        <StatCard label="صادرة" value={counts.outgoing} color="text-emerald-400" icon={<Package size={16}/>} />
        <StatCard label="معلقة" value={counts.pending} color="text-amber-400" icon={<Clock size={16}/>} />
        <StatCard label="الإجمالي" value={counts.all} color="text-slate-400" icon={<FileText size={16}/>} />
      </div>

      {/* LIST TABLE */}
      <div className="max-w-6xl mx-auto bg-slate-900/50 border border-slate-800 rounded-[2.5rem] overflow-hidden shadow-2xl backdrop-blur-md">
        <div className="p-6 border-b border-slate-800 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex bg-slate-950 p-1 rounded-2xl border border-slate-800 w-full md:w-auto">
            {["all", "incoming", "outgoing"].map((t: any) => (
              <button key={t} onClick={() => setTab(t)} className={`flex-1 md:flex-none px-6 py-2 rounded-xl text-xs font-black italic transition-all ${tab === t ? "bg-blue-600 text-white shadow-lg" : "text-slate-500 hover:text-slate-300"}`}>
                {t === "all" ? "الكل" : t === "incoming" ? "الواردة" : "الصادرة"}
              </button>
            ))}
          </div>
          <div className="relative w-full md:w-64">
            <Search size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="ابحث برقم الطلب..." className="w-full bg-slate-950 border border-slate-800 rounded-2xl py-3 pr-11 pl-4 text-sm focus:outline-none focus:border-blue-500 transition-all" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead>
              <tr className="text-slate-500 text-[10px] font-black uppercase border-b border-slate-800">
                <th className="p-6">رقم الطلب</th>
                <th className="p-6">الأطراف</th>
                <th className="p-6">الحالة</th>
                <th className="p-6">الإجمالي</th>
                <th className="p-6">التاريخ</th>
                <th className="p-6 text-left">التفاصيل</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map(order => {
                const meta = STATUS_META[order.status];
                return (
                  <tr key={order.id} className="border-b border-slate-800/30 hover:bg-blue-600/5 transition-colors group">
                    <td className="p-6"><span className="font-black italic text-slate-400 group-hover:text-blue-400 transition-colors">#ORD-{order.id}</span></td>
                    <td className="p-6">
                      <div className="flex items-center gap-3">
                        <div className="text-xs font-bold text-white">{order.from_shop?.shop_name}</div>
                        <ChevronLeft size={12} className="text-slate-600" />
                        <div className="text-xs font-bold text-blue-400">{order.to_shop?.shop_name}</div>
                      </div>
                    </td>
                    <td className="p-6">
                      <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-black italic uppercase ${meta.bg} ${meta.color}`}>
                        <meta.icon size={12} /> {meta.label}
                      </div>
                    </td>
                    <td className="p-6 font-black italic text-white underline decoration-blue-500 decoration-2 underline-offset-4">{order.total_amount.toLocaleString()} ر.س</td>
                    <td className="p-6 text-[10px] font-bold text-slate-500">{new Date(order.created_at).toLocaleDateString("ar-SA")}</td>
                    <td className="p-6 text-left">
                      <button onClick={() => openDetail(order)} className="p-3 bg-slate-800 rounded-2xl text-slate-400 hover:text-white hover:bg-blue-600 transition-all">
                        <Eye size={18} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          PREMIUM DETAIL VIEW (DRAWER)
      ══════════════════════════════════════════════════════ */}
      {detailOrder && (
        <div className="fixed inset-0 z-[110] flex dir-rtl" dir="rtl">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={() => setDetailOrderId(null)} />
          <div className="relative ml-auto w-full max-w-2xl bg-[#0b0f1a] border-r border-slate-800 shadow-[0_0_100px_rgba(0,0,0,0.5)] flex flex-col animate-in slide-in-from-left duration-300">
            
            {/* Drawer Header */}
            <div className="p-8 border-b border-slate-800 flex justify-between items-center bg-slate-900/30">
               <div className="flex items-center gap-6 text-right">
                  <div className="p-3 bg-white rounded-2xl shadow-xl hidden md:block">
                     <QRCode value={`ORD-${detailOrder.id}`} size={64} />
                  </div>
                  <div>
                    <h2 className="text-3xl font-black italic text-white tracking-tighter mb-1 uppercase">طلب #{detailOrder.id}</h2>
                    <p className="text-slate-500 text-sm font-bold flex items-center gap-2"><Calendar size={14}/> {new Date(detailOrder.created_at).toLocaleString("ar-SA")}</p>
                  </div>
               </div>
               <button onClick={() => setDetailOrderId(null)} className="h-12 w-12 bg-slate-800 hover:bg-rose-600/20 rounded-2xl text-slate-400 hover:text-rose-500 transition-all flex items-center justify-center">
                  <X size={24} strokeWidth={3} />
               </button>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto p-8 space-y-8 scroll-smooth custom-scrollbar">
              
              {/* Top Status & Actions Strip */}
              <div className="flex flex-wrap gap-3">
                 <div className={`inline-flex items-center gap-3 px-6 py-3 rounded-2xl font-black italic uppercase text-xs ${STATUS_META[detailOrder.status].bg} ${STATUS_META[detailOrder.status].color}`}>
                    <CheckCircle2 size={16} /> {STATUS_META[detailOrder.status].label}
                 </div>
                 <button onClick={handlePrint} className="h-10 px-4 bg-slate-800 hover:bg-slate-700 rounded-xl text-white font-bold italic text-xs flex items-center gap-2 transition-all"><Download size={14}/> تحميل PDF</button>
                 <button className="h-10 px-4 bg-slate-800 hover:bg-slate-700 rounded-xl text-white font-bold italic text-xs flex items-center gap-2 transition-all"><Share2 size={14}/> مشاركة</button>
              </div>

              {/* Parties Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-[2rem]">
                    <div className="flex items-center gap-3 mb-4 text-blue-500">
                       <User size={18} /> <span className="font-black italic text-[10px] uppercase tracking-widest text-slate-500">المشتري (الطالب)</span>
                    </div>
                    <p className="text-xl font-black italic text-white mb-1">{detailOrder.from_shop?.shop_name}</p>
                    <p className="text-slate-500 text-xs font-bold">{detailOrder.from_shop?.city || "المنطقة غير محددة"}</p>
                 </div>
                 <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-[2rem]">
                    <div className="flex items-center gap-3 mb-4 text-emerald-500">
                       <Store size={18} /> <span className="font-black italic text-[10px] uppercase tracking-widest text-slate-500">البائع (المورد)</span>
                    </div>
                    <p className="text-xl font-black italic text-white mb-1">{detailOrder.to_shop?.shop_name}</p>
                    <p className="text-slate-500 text-xs font-bold">{detailOrder.to_shop?.city || "المنطقة غير محددة"}</p>
                 </div>
              </div>

              {/* Items Table Section */}
              <div className="bg-slate-900/50 border border-slate-800 rounded-[2.5rem] overflow-hidden">
                <div className="p-6 bg-slate-800/30 border-b border-slate-800 flex items-center gap-3">
                   <Package size={18} className="text-blue-500" /> <h3 className="font-black italic text-white text-sm">الأصناف المطلوبة</h3>
                </div>
                <div className="overflow-x-auto">
                   <table className="w-full text-right">
                      <thead>
                        <tr className="text-slate-600 text-[10px] font-black uppercase border-b border-slate-800">
                          <th className="p-6">الصنف / رقم القطعة</th>
                          <th className="p-6 text-center">الكمية</th>
                          <th className="p-6 text-left">الإجمالي</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailItems.map((item, i) => (
                          <tr key={i} className="border-b border-slate-800/30 last:border-0 hover:bg-blue-600/5">
                            <td className="p-6">
                              <p className="font-bold text-sm text-white mb-1">{item.product?.part_name}</p>
                              <p className="text-[10px] text-blue-500 font-mono italic font-bold">{item.product?.part_number}</p>
                            </td>
                            <td className="p-6 text-center">
                               <span className="bg-slate-800 px-3 py-1 rounded-xl font-black italic text-xs text-white">x{item.quantity}</span>
                            </td>
                            <td className="p-6 text-left">
                               <span className="font-black italic text-lg text-white">{(item.price * item.quantity).toLocaleString()} <span className="text-[10px] not-italic">ر.س</span></span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                   </table>
                </div>
              </div>

              {/* Summary & Timeline Wrapper */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-20">
                 {/* Timeline Section */}
                 <div className="bg-slate-900 border border-slate-800 p-8 rounded-[2.5rem] relative flex flex-col justify-between">
                    <h4 className="text-[10px] font-black italic uppercase tracking-widest text-slate-600 mb-8">سجل تتبع الطلب</h4>
                    <div className="space-y-6 relative">
                       <div className="absolute top-2 bottom-2 right-4 w-px bg-slate-800 -z-0" />
                       <TimelineStep label="تم إنشاء الطلب" time="09:30 ص" active />
                       <TimelineStep label="مرسل للمورد" time="09:31 ص" active />
                       <TimelineStep label="اعتماد الطلب" time="09:35 ص" active={detailOrder.status !== 'pending' && detailOrder.status !== 'rejected'} />
                       <TimelineStep label="مكتمل" time="--" active={detailOrder.status === 'completed'} last />
                    </div>
                 </div>

                 {/* Financials Section */}
                 <div className="bg-slate-900 border border-slate-800 p-8 rounded-[2.5rem] space-y-4">
                    <h4 className="text-[10px] font-black italic uppercase tracking-widest text-slate-600 mb-4">الملخص المالي</h4>
                    <div className="flex justify-between text-slate-400 font-bold italic text-sm">
                      <span>الإجمالي الفرعي</span>
                      <span>{(Number(detailOrder.total_amount) / 1.15).toLocaleString()} ر.س</span>
                    </div>
                    <div className="flex justify-between text-slate-400 font-bold italic text-sm pb-4 border-b border-slate-800">
                      <span>الضريبة (15%)</span>
                      <span>{(Number(detailOrder.total_amount) * 0.15).toLocaleString()} ر.س</span>
                    </div>
                    <div className="flex justify-between items-end pt-2">
                       <span className="text-white font-black italic text-xl uppercase tracking-tighter">الإجمالي النهائي</span>
                       <span className="text-3xl font-black italic tracking-tighter text-blue-400 underline decoration-blue-500 underline-offset-8">
                         {Number(detailOrder.total_amount).toLocaleString()} <span className="text-xs not-italic">ر.س</span>
                       </span>
                    </div>
                 </div>
              </div>
            </div>

            {/* Drawer Actions Footer */}
            <div className="p-8 border-t border-slate-800 bg-slate-900/50 flex flex-wrap gap-3">
              {canActOnOrder(detailOrder) && (
                <>
                  <button onClick={() => handleApprove(detailOrder.id)} className="flex-1 h-14 bg-emerald-600 hover:bg-emerald-500 text-white font-black italic rounded-2xl shadow-lg shadow-emerald-900/30 transition-all flex items-center justify-center gap-3">
                     <CheckCircle2 size={20} strokeWidth={3} /> اعتماد الطلب
                  </button>
                  <button onClick={() => handleReject(detailOrder.id)} className="flex-1 h-14 bg-rose-600/10 hover:bg-rose-600/20 border border-rose-600/30 text-rose-500 font-black italic rounded-2xl transition-all">
                     رفض الطلب
                  </button>
                </>
              )}
              <div className="flex w-full gap-2 mt-2">
                <button className="flex-1 h-12 bg-slate-800 hover:bg-emerald-600 rounded-xl text-white font-bold flex items-center justify-center gap-2 transition-all"><MessageCircle size={18}/> واتساب</button>
                <button className="flex-1 h-12 bg-slate-800 hover:bg-blue-600 rounded-xl text-white font-bold flex items-center justify-center gap-2 transition-all"><Phone size={18}/> اتصال</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* NEW ORDER MODAL */}
      {showModal && (
        <div className="fixed inset-0 bg-[#0b0f1a]/90 backdrop-blur-md z-[120] flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-800 flex justify-between items-center">
              <h2 className="text-2xl font-black italic text-white flex items-center gap-3"><Plus size={24} className="text-blue-500" /> إنشاء طلب جديد</h2>
              <button onClick={() => setShowModal(false)} className="h-10 w-10 flex items-center justify-center bg-slate-800 rounded-xl text-slate-500 hover:text-white transition-all"><X size={20} strokeWidth={3}/></button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-8 space-y-6">
              {modalError && <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-500 text-sm font-bold flex items-center gap-2"><AlertCircle size={18}/> {modalError}</div>}
              
              <div className="space-y-4">
                <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest italic">1. اختر المحل المورد</label>
                <select value={supplierShopId} onChange={e => { setSupplierShopId(Number(e.target.value) || ""); setCart([]); }} className="w-full h-14 bg-slate-950 border border-slate-800 rounded-2xl px-6 text-white font-bold focus:outline-none focus:border-blue-500 transition-all appearance-none cursor-pointer">
                  <option value="">-- اضغط للاختيار من القائمة --</option>
                  {shops.filter(s => s.id !== ownedShopId).map(s => <option key={s.id} value={s.id}>{s.shop_name}</option>)}
                </select>
              </div>

              {supplierShopId && (
                <div className="space-y-4 pt-4 border-t border-slate-800">
                  <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest italic">2. المنتجات المتوفرة</label>
                  <div className="grid grid-cols-1 gap-2 max-h-60 overflow-y-auto pr-1">
                    {loadingProducts ? <div className="py-4 text-center text-slate-600 animate-pulse font-bold italic">جاري جلب القائمة...</div> : supplierProducts.map(p => {
                      const inCart = !!cart.find(c => c.product.id === p.id);
                      return (
                        <div key={p.id} className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${inCart ? 'bg-blue-600/10 border-blue-500' : 'bg-slate-950 border-slate-800 hover:border-slate-700'}`}>
                          <div>
                            <p className="font-bold text-white text-sm">{p.part_name}</p>
                            <p className="text-[10px] text-blue-500 font-mono italic font-bold">{p.part_number}</p>
                          </div>
                          <div className="flex items-center gap-4">
                             <div className="text-left"><p className="text-white font-black italic text-sm">{p.price} ر.س</p><p className="text-[9px] text-slate-600 font-bold uppercase italic">متوفر: {p.quantity}</p></div>
                             <button onClick={() => addToCart(p)} disabled={inCart} className={`h-10 w-10 flex items-center justify-center rounded-xl transition-all ${inCart ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-blue-600'}`}><Plus size={18} strokeWidth={3}/></button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {cart.length > 0 && (
                <div className="pt-4 border-t border-slate-800 space-y-4">
                   <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest italic">3. قائمة الطلب الحالية</label>
                   <div className="space-y-2">
                     {cart.map(c => (
                       <div key={c.product.id} className="flex items-center justify-between bg-slate-900 border border-slate-800/50 p-4 rounded-2xl">
                          <div className="flex-1"><p className="text-xs font-bold text-white">{c.product.part_name}</p><p className="text-[10px] text-slate-500 font-mono italic">{(c.product.price * c.quantity).toLocaleString()} ر.س</p></div>
                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800">
                               <button onClick={() => updateQty(c.product.id, c.quantity - 1)} className="h-8 w-8 bg-slate-800 rounded-lg text-white font-bold">-</button>
                               <span className="w-8 text-center font-black italic text-white">{c.quantity}</span>
                               <button onClick={() => updateQty(c.product.id, c.quantity + 1)} className="h-8 w-8 bg-slate-800 rounded-lg text-white font-bold">+</button>
                            </div>
                            <button onClick={() => removeFromCart(c.product.id)} className="p-2 text-rose-500/50 hover:text-rose-500 transition-colors"><Trash2 size={16}/></button>
                          </div>
                       </div>
                     ))}
                   </div>
                </div>
              )}
            </div>

            <div className="p-8 border-t border-slate-800 bg-slate-900/30 flex justify-between items-center">
               <div className="text-right">
                  <p className="text-[10px] font-black uppercase italic text-slate-500 mb-1">الإجمالي الكلي</p>
                  <p className="text-2xl font-black italic text-blue-400 tracking-tighter">{cartTotal.toLocaleString()} <span className="text-xs not-italic">ر.س</span></p>
               </div>
               <div className="flex gap-2">
                 <button onClick={() => setShowModal(false)} className="px-6 py-3 rounded-2xl font-bold italic text-slate-500 hover:text-white transition-all">إلغاء</button>
                 <button onClick={handleSubmit} disabled={saving || cart.length === 0} className="px-10 h-14 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-black italic shadow-lg shadow-blue-900/40 flex items-center gap-3 disabled:opacity-40 transition-all">
                    {saving ? <RefreshCw size={18} className="animate-spin"/> : <Save size={18}/>} إرسال الطلب
                 </button>
               </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// HELPER COMPONENTS
// ─────────────────────────────────────────────────────────────

const StatCard = ({ label, value, color, icon }: any) => (
  <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-3xl flex items-center justify-between group hover:border-slate-700 transition-all">
    <div>
       <p className="text-[10px] font-black italic uppercase tracking-widest text-slate-600 mb-1">{label}</p>
       <p className={`text-2xl font-black italic tracking-tighter ${color}`}>{value}</p>
    </div>
    <div className={`p-2.5 rounded-xl bg-slate-950 border border-slate-800 group-hover:scale-110 transition-transform ${color} opacity-60`}>
      {icon}
    </div>
  </div>
);

const TimelineStep = ({ label, time, active, last }: any) => (
  <div className="flex items-start gap-4 relative">
    <div className={`w-9 h-9 rounded-2xl flex items-center justify-center border-4 border-[#0b0f1a] z-10 transition-all ${active ? 'bg-blue-600 shadow-lg shadow-blue-500/30' : 'bg-slate-800'}`}>
       {active && <Check size={14} strokeWidth={4} className="text-white" />}
    </div>
    <div className="pt-1 text-right flex-1">
      <p className={`text-xs font-black italic ${active ? 'text-white' : 'text-slate-600'}`}>{label}</p>
      <p className="text-[9px] text-slate-500 font-bold mt-1 font-mono">{time}</p>
    </div>
  </div>
);