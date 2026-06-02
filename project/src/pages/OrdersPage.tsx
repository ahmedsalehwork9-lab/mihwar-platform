import { useEffect, useState, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import {
  ShoppingCart, RefreshCw, Package, Plus, X,
  Check, XCircle, Clock, PackageCheck,
  Eye, Trash2, AlertCircle, ChevronLeft, ChevronRight,
  ArrowLeftRight, Search, Save, ChevronDown,
  Printer, FileText,
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
// CONSTANTS
// ─────────────────────────────────────────────────────────────

const PAGE_SIZE = 10;

const STATUS_META: Record<OrderStatus, { label: string; color: string; dot: string }> = {
  pending:   { label: "معلق",   color: "bg-amber-500/10 text-amber-400 border border-amber-500/20",      dot: "bg-amber-400"   },
  approved:  { label: "مقبول",  color: "bg-blue-500/10 text-blue-400 border border-blue-500/20",         dot: "bg-blue-400"    },
  rejected:  { label: "مرفوض", color: "bg-red-500/10 text-red-400 border border-red-500/20",             dot: "bg-red-400"     },
  completed: { label: "مكتمل", color: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20", dot: "bg-emerald-400" },
};

const STATUS_LABEL_AR: Record<OrderStatus, string> = {
  pending:   "معلق",
  approved:  "مقبول",
  rejected:  "مرفوض",
  completed: "مكتمل",
};

// ─────────────────────────────────────────────────────────────
// PRINT / PDF HELPER
// ─────────────────────────────────────────────────────────────
function buildPrintHTML(order: Order, items: OrderItem[]): string {
  const date = new Date(order.created_at).toLocaleDateString("ar-SA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const rows = items
    .map(
      (item, i) => `
    <tr style="border-bottom: 1px solid #f3f4f6;">
      <td style="padding: 16px 8px; color: #6b7280; font-size: 14px;">${i + 1}</td>
      <td style="padding: 16px 8px; font-weight: 500;">${item.product?.part_name ?? "—"}</td>
      <td style="padding: 16px 8px; color: #6b7280;">${item.product?.part_number ?? "—"}</td>
      <td style="padding: 16px 8px; text-align: center;">${item.quantity}</td>
      <td style="padding: 16px 8px; text-align: left;">${item.price.toLocaleString()} ر.س</td>
      <td style="padding: 16px 8px; text-align: left; font-weight: 600;">${(item.price * item.quantity).toLocaleString()} ر.س</td>
    </tr>
  `
    )
    .join("");

  const statusLabel = {
    pending: "معلق",
    approved: "مقبول",
    rejected: "مرفوض",
    completed: "مكتمل",
  }[order.status] || "—";

  return `
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&display=swap" rel="stylesheet">
      <style>
        body { font-family: 'Cairo', sans-serif; background: #fff; color: #111827; margin: 0; padding: 40px; line-height: 1.5; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; }
        .brand h2 { margin: 0; font-size: 28px; font-weight: 800; color: #1e293b; }
        .brand p { margin: 4px 0 0; color: #64748b; font-size: 14px; }
        .po-info { text-align: left; }
        .po-info h1 { margin: 0; font-size: 14px; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; }
        .po-info div { font-size: 24px; font-weight: 700; color: #111827; }
        
        .status-badge { display: inline-flex; align-items: center; padding: 6px 16px; border-radius: 999px; font-size: 14px; font-weight: 600; border: 1px solid; }
        .s-pending { background: #fffbeb; color: #d97706; border-color: #fde68a; }
        .s-approved { background: #eff6ff; color: #2563eb; border-color: #bfdbfe; }
        .s-rejected { background: #fef2f2; color: #dc2626; border-color: #fecaca; }
        .s-completed { background: #ecfdf5; color: #059669; border-color: #a7f3d0; }

        .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 40px; }
        .card { background: #f9fafb; border: 1px solid #f3f4f6; padding: 16px; border-radius: 12px; }
        .card .label { font-size: 12px; color: #6b7280; margin-bottom: 4px; }
        .card .value { font-size: 16px; font-weight: 700; }

        table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
        thead { background: #f9fafb; border-bottom: 2px solid #e5e7eb; }
        th { padding: 12px 8px; text-align: right; font-size: 13px; color: #6b7280; font-weight: 600; }
        
        .summary-card { background: #111827; color: #fff; padding: 24px; border-radius: 12px; display: flex; justify-content: space-between; align-items: center; }
        .total-label { font-size: 16px; }
        .total-value { font-size: 32px; font-weight: 800; }

        .notes { background: #fffbeb; padding: 16px; border-radius: 12px; margin-top: 20px; font-size: 14px; color: #92400e; border: 1px solid #fde68a; }
        
        footer { margin-top: 60px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af; text-align: center; }

        @media print { @page { margin: 20mm; } }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="brand">
          <h2>وصلة</h2>
          <p>منصة قطع الغيار B2B</p>
        </div>
        <div class="po-info">
          <h1>Purchase Order</h1>
          <div>PO-${String(order.id).padStart(6, "0")}</div>
        </div>
      </div>

      <div style="margin-bottom: 20px;">
        <span class="status-badge s-${order.status}">${statusLabel}</span>
      </div>

      <div class="grid">
        <div class="card"><div class="label">المحل الطالب</div><div class="value">${order.from_shop?.shop_name ?? "—"}</div></div>
        <div class="card"><div class="label">المحل المورد</div><div class="value">${order.to_shop?.shop_name ?? "—"}</div></div>
        <div class="card"><div class="label">التاريخ</div><div class="value">${date}</div></div>
        <div class="card"><div class="label">عدد الأصناف</div><div class="value">${items.length}</div></div>
      </div>

      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>اسم القطعة</th>
            <th>رقم القطعة</th>
            <th style="text-align: center;">الكمية</th>
            <th style="text-align: left;">سعر الوحدة</th>
            <th style="text-align: left;">الإجمالي</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>

      <div class="summary-card">
        <div class="total-label">الإجمالي الكلي</div>
        <div class="total-value">${order.total_amount.toLocaleString()} ر.س</div>
      </div>

      ${order.notes ? `<div class="notes"><strong>ملاحظات:</strong> ${order.notes}</div>` : ""}

      <footer>
        تم إنشاء هذه الفاتورة بواسطة منصة وصلة - WASLA B2B Platform<br>
        تم الإنشاء في: ${new Date().toLocaleDateString("ar-SA")}
      </footer>
    </body>
    </html>
  `;
}
       
// ─────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────

export default function OrdersPage() {

  // ── تعديل: دعم Admin الذي لا يملك متجر ──────────────────────
  const {
    ownedShopId,
    role,
    isAdmin,
  } = useAuth() as any;

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
  const [detailOrder,   setDetailOrder]   = useState<Order | null>(null);
  const [detailItems,   setDetailItems]   = useState<OrderItem[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

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

  // ── fetch orders ────────────────────────────────────────────
  // تعديل: Admin يرى جميع الطلبات — Shop Owner يرى طلباته فقط
  const fetchOrders = async () => {
    // Admin لا يحتاج ownedShopId — Shop Owner يحتاجه
    if (!isAdmin && !ownedShopId) return;

    setLoading(true);
    setError(null);

    let query = supabase
      .from("orders")
      .select(`
        *,
        from_shop:shops!orders_from_shop_id_fkey(shop_name),
        to_shop:shops!orders_to_shop_id_fkey(shop_name),
        order_items(id)
      `);

    // تعديل: تصفية الطلبات حسب الدور
    if (!isAdmin) {
      query = query.or(
        `from_shop_id.eq.${ownedShopId},to_shop_id.eq.${ownedShopId}`
      );
    }

    const { data, error } = await query.order("created_at", { ascending: false });

    if (error) {
      setError(error.message);
    } else {
      setOrders((data as Order[]) || []);
    }
    setLoading(false);
  };

  // ── fetch all shops ──────────────────────────────────────────
  const fetchShops = async () => {
    const { data } = await supabase
      .from("shops")
      .select("id, shop_name")
      .order("shop_name");
    setShops((data as Shop[]) || []);
  };

  useEffect(() => {
    fetchOrders();
    fetchShops();
  }, [ownedShopId, isAdmin]);

  // ── fetch supplier products when supplier changes ────────────
  useEffect(() => {
    if (!supplierShopId) { setSupplierProducts([]); return; }
    setLoadingProducts(true);
    supabase
      .from("products")
      .select("*")
      .eq("shop_id", supplierShopId)
      .gt("quantity", 0)
      .order("part_name")
      .then(({ data }) => {
        setSupplierProducts((data as Product[]) || []);
        setLoadingProducts(false);
      });
  }, [supplierShopId]);

  // ── filtered & paged orders ──────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders
      .filter(o => {
        // تعديل: Admin يرى الكل في جميع التبويبات
        if (isAdmin) return true;
        if (tab === "incoming") return o.to_shop_id   === ownedShopId;
        if (tab === "outgoing") return o.from_shop_id === ownedShopId;
        return true;
      })
      .filter(o => statusFilter === "all" || o.status === statusFilter)
      .filter(o =>
        !q ||
        String(o.id).includes(q) ||
        o.from_shop?.shop_name?.toLowerCase().includes(q) ||
        o.to_shop?.shop_name?.toLowerCase().includes(q)
      );
  }, [orders, tab, statusFilter, search, ownedShopId, isAdmin]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const counts = useMemo(() => ({
    all:      orders.length,
    // تعديل: Admin يرى عدد الكل في كل تبويب
    incoming: isAdmin ? orders.length : orders.filter(o => o.to_shop_id   === ownedShopId).length,
    outgoing: isAdmin ? orders.length : orders.filter(o => o.from_shop_id === ownedShopId).length,
    pending:  orders.filter(o => o.status === "pending").length,
  }), [orders, ownedShopId, isAdmin]);

  // ── open detail ──────────────────────────────────────────────
  const openDetail = async (order: Order) => {
    setDetailOrder(order);
    setDetailItems([]);
    setDetailLoading(true);
    const { data } = await supabase
      .from("order_items")
      .select("*, product:products(*)")
      .eq("order_id", order.id);
    setDetailItems((data as OrderItem[]) || []);
    setDetailLoading(false);
  };

  // ── PRINT / PDF ──────────────────────────────────────────────
  const handlePrint = (asPDF = false) => {
    if (!detailOrder) return;
    const html = buildPrintHTML(detailOrder, detailItems);
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.onload = () => {
      win.focus();
      win.print();
    };
  };

  // ── approve ──────────────────────────────────────────────────
  const handleApprove = async (orderId: number) => {
    setActionId(orderId);
    const { error } = await supabase.rpc("approve_order", { p_order_id: orderId });
    if (error) {
      showError(error.message);
    } else {
      showToast("تم اعتماد الطلب وتحديث المخزون ✓");
      await fetchOrders();
      setDetailOrder(prev => prev?.id === orderId ? { ...prev, status: "completed" } : prev);
    }
    setActionId(null);
  };

  // ── reject ───────────────────────────────────────────────────
  const handleReject = async (orderId: number) => {
    if (!confirm("هل أنت متأكد من رفض هذا الطلب؟")) return;
    setActionId(orderId);
    const { error } = await supabase
      .from("orders")
      .update({ status: "rejected" })
      .eq("id", orderId);
    if (error) {
      showError(error.message);
    } else {
      showToast("تم رفض الطلب");
      await fetchOrders();
      setDetailOrder(prev => prev?.id === orderId ? { ...prev, status: "rejected" } : prev);
    }
    setActionId(null);
  };

  // ── cart helpers ─────────────────────────────────────────────
  const addToCart = (product: Product) => {
    setCart(prev => {
      if (prev.find(c => c.product.id === product.id)) return prev;
      return [...prev, { product, quantity: 1 }];
    });
  };

  const updateQty = (productId: number, qty: number) => {
    const max = supplierProducts.find(p => p.id === productId)?.quantity ?? 1;
    setCart(prev =>
      prev.map(c =>
        c.product.id === productId
          ? { ...c, quantity: Math.max(1, Math.min(qty, max)) }
          : c
      )
    );
  };

  const removeFromCart = (productId: number) =>
    setCart(prev => prev.filter(c => c.product.id !== productId));

  const cartTotal = cart.reduce((s, c) => s + c.product.price * c.quantity, 0);

  // ── submit new order ─────────────────────────────────────────
  const handleSubmit = async () => {
    setModalError(null);
    if (!supplierShopId)                { setModalError("اختر المحل المورد أولاً"); return; }
    if (supplierShopId === ownedShopId) { setModalError("لا يمكنك الطلب من محلك"); return; }
    if (cart.length === 0)              { setModalError("أضف منتجاً واحداً على الأقل"); return; }

    for (const item of cart) {
      const fresh = supplierProducts.find(p => p.id === item.product.id);
      if (fresh && item.quantity > fresh.quantity) {
        setModalError(`الكمية لـ "${item.product.part_name}" تتجاوز المتوفر (${fresh.quantity})`);
        return;
      }
    }

    setSaving(true);
    try {
      const { data: orderData, error: oErr } = await supabase
        .from("orders")
        .insert({
          from_shop_id: ownedShopId,
          to_shop_id:   supplierShopId,
          status:       "pending",
          total_amount: cartTotal,
          notes:        orderNotes || null,
        })
        .select()
        .single();
      if (oErr) throw oErr;

      const { error: iErr } = await supabase.from("order_items").insert(
        cart.map(c => ({
          order_id:   orderData.id,
          product_id: c.product.id,
          quantity:   c.quantity,
          price:      c.product.price,
        }))
      );
      if (iErr) throw iErr;

      closeModal();
      showToast("تم إرسال الطلب بنجاح ✓");
      await fetchOrders();
    } catch (e: any) {
      setModalError(e?.message ?? "حدث خطأ");
    } finally {
      setSaving(false);
    }
  };

  // ── close modal ──────────────────────────────────────────────
  const closeModal = () => {
    setShowModal(false);
    setSupplierShopId("");
    setSupplierProducts([]);
    setProductSearch("");
    setCart([]);
    setOrderNotes("");
    setModalError(null);
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };
  const showError = (msg: string) => setError(msg);

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return supplierProducts;
    return supplierProducts.filter(
      p => p.part_name?.toLowerCase().includes(q) || p.part_number?.toLowerCase().includes(q)
    );
  }, [supplierProducts, productSearch]);

  const otherShops = shops.filter(s => s.id !== ownedShopId);

  // تعديل: Admin يستطيع الاعتماد/الرفض على أي طلب معلق
  const canActOnOrder = (order: Order): boolean => {
    if (isAdmin) return order.status === "pending";
    return order.to_shop_id === ownedShopId && order.status === "pending";
  };

  // ─────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────
  return (
    <div className="p-3 lg:p-6 min-h-screen" dir="rtl">

      {/* ── TOAST ── */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] bg-emerald-600 text-white text-sm px-5 py-2.5 rounded-xl shadow-xl flex items-center gap-2">
          <Check size={14} /> {toast}
        </div>
      )}

      {/* ══════ HEADER ══════ */}
      <div className="flex items-center justify-between gap-2 mb-4 lg:mb-6">
        <div className="flex items-center gap-2.5">
          <div className="bg-blue-500/10 p-2 rounded-xl border border-blue-500/20 shrink-0">
            <ShoppingCart size={16} className="text-blue-400" />
          </div>
          <div>
            <h1 className="text-white font-semibold text-base lg:text-lg leading-tight">الطلبات</h1>
            <p className="text-slate-500 text-[11px] leading-tight flex flex-wrap items-center gap-x-1">
              <span>{orders.length} طلب إجمالي</span>
              {counts.pending > 0 && (
                <span className="text-amber-400 font-medium">· {counts.pending} معلق</span>
              )}
              {/* تعديل: شارة Admin */}
              {isAdmin && (
                <span className="text-[10px] bg-purple-500/10 text-purple-400 border border-purple-500/20 px-1.5 py-0.5 rounded-full">
                  Admin
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={fetchOrders}
            className="w-9 h-9 flex items-center justify-center rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white transition-colors shrink-0"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
          {/* تعديل: زر طلب جديد يظهر فقط لأصحاب المتاجر وليس للأدمن */}
          {!isAdmin && (
            <button
              onClick={() => setShowModal(true)}
              disabled={!ownedShopId}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs lg:text-sm px-3 lg:px-4 py-2 rounded-lg font-medium transition-colors"
            >
              <Plus size={13} />
              <span>طلب جديد</span>
            </button>
          )}
        </div>
      </div>

      {/* ══════ STATS ══════ */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 lg:gap-3 mb-4 lg:mb-5">
        {[
          { label: "إجمالي الطلبات", value: counts.all,      color: "text-slate-300"   },
          { label: "واردة",          value: counts.incoming,  color: "text-blue-400"    },
          { label: "صادرة",          value: counts.outgoing,  color: "text-emerald-400" },
          { label: "معلقة",          value: counts.pending,   color: "text-amber-400"   },
        ].map(s => (
          <div key={s.label} className="bg-slate-900 border border-slate-700/50 rounded-xl p-2.5 lg:p-3">
            <p className="text-slate-500 text-[11px] mb-0.5">{s.label}</p>
            <p className={`text-xl lg:text-2xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* ══════ ERROR ══════ */}
      {error && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-red-400 mb-4 text-xs lg:text-sm">
          <AlertCircle size={14} /> {error}
          <button onClick={() => setError(null)} className="mr-auto"><X size={13} /></button>
        </div>
      )}

      {/* تعديل: رسالة عدم وجود متجر تظهر فقط لغير الأدمن */}
      {!isAdmin && !ownedShopId && !loading && (
        <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-amber-400 mb-4 text-xs lg:text-sm">
          <AlertCircle size={14} /> لم يتم ربط حسابك بمتجر. تأكد من إعداد المتجر أو تواصل مع الدعم.
        </div>
      )}

      {/* ══════ TABS + FILTERS ══════ */}
      {/* Mobile: stacked. Desktop: single row */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2 mb-3 lg:mb-4">

        {/* Tabs */}
        <div className="flex items-center bg-slate-900 border border-slate-700/50 rounded-xl p-1 gap-1 self-start">
          {([
            { key: "all",      label: "الكل",  count: counts.all      },
            { key: "incoming", label: "واردة", count: counts.incoming },
            { key: "outgoing", label: "صادرة", count: counts.outgoing },
          ] as { key: typeof tab; label: string; count: number }[]).map(t => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setPage(1); }}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                tab === t.key ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              {t.label}
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${tab === t.key ? "bg-white/20" : "bg-slate-700"}`}>
                {t.count}
              </span>
            </button>
          ))}
        </div>

        {/* Search + Status filter */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 lg:flex-none">
            <Search size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="رقم طلب أو محل..."
              className="bg-slate-800 border border-slate-700 text-white placeholder-slate-500 text-xs rounded-lg py-2 pr-8 pl-3 w-full lg:w-44 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="relative shrink-0">
            <select
              value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value as any); setPage(1); }}
              className="appearance-none bg-slate-800 border border-slate-700 text-slate-300 text-xs rounded-lg py-2 pr-3 pl-7 focus:outline-none focus:border-blue-500 cursor-pointer"
            >
              <option value="all">كل الحالات</option>
              <option value="pending">معلق</option>
              <option value="approved">مقبول</option>
              <option value="rejected">مرفوض</option>
              <option value="completed">مكتمل</option>
            </select>
            <ChevronDown size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* ══════ MOBILE CARDS (hidden on lg+) ══════ */}
      <div className="lg:hidden space-y-2 mb-4">
        {loading ? (
          <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-10 text-center text-slate-500">
            <RefreshCw size={18} className="animate-spin mx-auto mb-2 text-blue-500" />
            <p className="text-xs">جاري تحميل الطلبات...</p>
          </div>
        ) : pageItems.length === 0 ? (
          <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-10 text-center text-slate-500">
            <Package size={32} className="mx-auto mb-2 opacity-20" />
            <p className="text-xs">لا توجد طلبات مطابقة</p>
          </div>
        ) : pageItems.map(order => {
          const meta     = STATUS_META[order.status] ?? STATUS_META["pending"];
          const isActing = actionId === order.id;
          const canAct   = canActOnOrder(order);

          return (
            <div
              key={order.id}
              className="bg-slate-900 border border-slate-700/50 rounded-2xl p-3.5 transition-colors"
            >
              {/* Row 1: order number + status badge */}
              <div className="flex items-center justify-between mb-2.5">
                <span className="font-mono text-sm font-bold text-white tracking-wide">
                  #{String(order.id).padStart(5, "0")}
                </span>
                <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full ${meta.color}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                  {meta.label}
                </span>
              </div>

              {/* Row 2: from → to */}
              <div className="flex items-center gap-1.5 mb-2.5">
                <div className="flex-1 min-w-0 bg-slate-800/60 border border-slate-700/40 rounded-lg px-2.5 py-1.5">
                  <p className="text-[10px] text-slate-500 mb-0.5">من</p>
                  <p className={`text-xs font-medium truncate ${order.from_shop_id === ownedShopId ? "text-blue-400" : "text-slate-200"}`}>
                    {order.from_shop?.shop_name ?? "—"}
                    {order.from_shop_id === ownedShopId && <span className="opacity-60"> (أنت)</span>}
                  </p>
                </div>
                <ArrowLeftRight size={12} className="text-slate-600 shrink-0" />
                <div className="flex-1 min-w-0 bg-slate-800/60 border border-slate-700/40 rounded-lg px-2.5 py-1.5">
                  <p className="text-[10px] text-slate-500 mb-0.5">إلى</p>
                  <p className={`text-xs font-medium truncate ${order.to_shop_id === ownedShopId ? "text-emerald-400" : "text-slate-200"}`}>
                    {order.to_shop?.shop_name ?? "—"}
                    {order.to_shop_id === ownedShopId && <span className="opacity-60"> (أنت)</span>}
                  </p>
                </div>
              </div>

              {/* Row 3: items count + total + date */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-slate-500 text-xs">
                  <Package size={11} />
                  <span>{order.order_items?.length ?? 0} صنف</span>
                  <span className="text-slate-700">·</span>
                  <span>{new Date(order.created_at).toLocaleDateString("ar-SA", { day: "numeric", month: "short" })}</span>
                </div>
                <span className="text-white font-bold text-sm">
                  {Number(order.total_amount).toLocaleString()} ر.س
                </span>
              </div>

              {/* Row 4: action buttons */}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => openDetail(order)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-slate-700 text-slate-400 hover:border-blue-500 hover:text-blue-400 transition-colors text-xs"
                >
                  <Eye size={12} /> عرض
                </button>
                {canAct && (
                  <>
                    <button
                      onClick={() => handleApprove(order.id)}
                      disabled={isActing}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-40 transition-colors text-xs"
                    >
                      {isActing
                        ? <RefreshCw size={11} className="animate-spin" />
                        : <><Check size={12} /> اعتماد</>
                      }
                    </button>
                    <button
                      onClick={() => handleReject(order.id)}
                      disabled={isActing}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 disabled:opacity-40 transition-colors text-xs"
                    >
                      <XCircle size={12} /> رفض
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ══════ DESKTOP TABLE (hidden on mobile) ══════ */}
      <div className="hidden lg:block bg-slate-900 border border-slate-700/50 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="border-b border-slate-700/50 bg-slate-800/50">
                {["رقم الطلب","من محل","إلى محل","الأصناف","الإجمالي","الحالة","التاريخ","إجراء"].map(h => (
                  <th key={h} className="p-3 text-right text-slate-400 font-medium text-xs">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="p-14 text-center text-slate-500">
                    <RefreshCw size={20} className="animate-spin mx-auto mb-2 text-blue-500" />
                    جاري تحميل الطلبات...
                  </td>
                </tr>
              ) : pageItems.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-14 text-center text-slate-500">
                    <Package size={36} className="mx-auto mb-3 opacity-20" />
                    لا توجد طلبات مطابقة
                  </td>
                </tr>
              ) : pageItems.map(order => {
                const meta     = STATUS_META[order.status] ?? STATUS_META["pending"];
                const isActing = actionId === order.id;
                // تعديل: Admin يستطيع التصرف على أي طلب معلق
                const canAct   = canActOnOrder(order);

                return (
                  <tr key={order.id} className="border-b border-slate-700/30 hover:bg-slate-800/40 transition-colors">
                    <td className="p-3">
                      <span className="font-mono text-xs text-slate-400">#{String(order.id).padStart(5,"0")}</span>
                    </td>
                    <td className="p-3">
                      <span className={`text-xs font-medium ${order.from_shop_id === ownedShopId ? "text-blue-400" : "text-slate-300"}`}>
                        {order.from_shop?.shop_name ?? "—"}
                        {order.from_shop_id === ownedShopId && <span className="mr-1 text-[10px] opacity-60">(أنت)</span>}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className={`text-xs font-medium ${order.to_shop_id === ownedShopId ? "text-emerald-400" : "text-slate-300"}`}>
                        {order.to_shop?.shop_name ?? "—"}
                        {order.to_shop_id === ownedShopId && <span className="mr-1 text-[10px] opacity-60">(أنت)</span>}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="text-slate-400 text-xs">{order.order_items?.length ?? 0} صنف</span>
                    </td>
                    <td className="p-3">
                      <span className="text-white font-medium text-xs">{Number(order.total_amount).toLocaleString()} ر.س</span>
                    </td>
                    <td className="p-3">
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full ${meta.color}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                        {meta.label}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="text-slate-500 text-xs">
                        {new Date(order.created_at).toLocaleDateString("ar-SA", { day:"numeric", month:"short", year:"numeric" })}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openDetail(order)}
                          className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-700 text-slate-400 hover:border-blue-500 hover:text-blue-400 transition-colors"
                          title="عرض التفاصيل"
                        >
                          <Eye size={12} />
                        </button>
                        {/* تعديل: أزرار الاعتماد والرفض تظهر للأدمن وللمورد */}
                        {canAct && (
                          <>
                            <button
                              onClick={() => handleApprove(order.id)}
                              disabled={isActing}
                              className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-700 text-slate-400 hover:border-emerald-500 hover:text-emerald-400 disabled:opacity-40 transition-colors"
                              title="اعتماد"
                            >
                              {isActing ? <RefreshCw size={11} className="animate-spin" /> : <Check size={12} />}
                            </button>
                            <button
                              onClick={() => handleReject(order.id)}
                              disabled={isActing}
                              className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-700 text-slate-400 hover:border-red-500 hover:text-red-400 disabled:opacity-40 transition-colors"
                              title="رفض"
                            >
                              <XCircle size={12} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* DESKTOP PAGINATION */}
        {!loading && filtered.length > PAGE_SIZE && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700/50 text-xs text-slate-500">
            <span>عرض {(page-1)*PAGE_SIZE+1}–{Math.min(page*PAGE_SIZE, filtered.length)} من {filtered.length}</span>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(p => Math.max(1,p-1))} disabled={page===1}
                className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-700 text-slate-400 hover:border-slate-500 disabled:opacity-30 transition-colors">
                <ChevronRight size={13} />
              </button>
              {Array.from({ length: Math.min(totalPages,5) }, (_,i) => i+1).map(n => (
                <button key={n} onClick={() => setPage(n)}
                  className={`w-7 h-7 flex items-center justify-center rounded-lg border text-xs transition-colors ${
                    page===n ? "bg-blue-600 text-white border-blue-600" : "border-slate-700 text-slate-400 hover:border-slate-500"
                  }`}>{n}</button>
              ))}
              <button onClick={() => setPage(p => Math.min(totalPages,p+1))} disabled={page===totalPages}
                className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-700 text-slate-400 hover:border-slate-500 disabled:opacity-30 transition-colors">
                <ChevronLeft size={13} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* MOBILE PAGINATION */}
      {!loading && filtered.length > PAGE_SIZE && (
        <div className="lg:hidden flex items-center justify-between mt-3 text-xs text-slate-500">
          <span>{(page-1)*PAGE_SIZE+1}–{Math.min(page*PAGE_SIZE, filtered.length)} من {filtered.length}</span>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(p => Math.max(1,p-1))} disabled={page===1}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-700 text-slate-400 disabled:opacity-30 transition-colors">
              <ChevronRight size={13} />
            </button>
            <span className="px-2 text-slate-400">{page} / {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages,p+1))} disabled={page===totalPages}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-700 text-slate-400 disabled:opacity-30 transition-colors">
              <ChevronLeft size={13} />
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          DETAIL DRAWER
          Mobile: full-screen bottom sheet
          Desktop: side panel (max-w-md from right)
      ══════════════════════════════════════════════════════ */}
      {detailOrder && (
        <div className="fixed inset-0 z-50 flex" dir="rtl">
          <div className="flex-1 bg-black/50 backdrop-blur-sm" onClick={() => setDetailOrder(null)} />

          {/* Panel — bottom sheet on mobile, side drawer on desktop */}
          <div className="
            fixed bottom-0 left-0 right-0 max-h-[92vh]
            lg:static lg:max-h-none lg:w-full lg:max-w-md
            bg-slate-900 border-t border-slate-700 lg:border-t-0 lg:border-r
            flex flex-col shadow-2xl
            rounded-t-2xl lg:rounded-none
          ">

            {/* drag handle — mobile only */}
            <div className="lg:hidden flex justify-center pt-2.5 pb-1">
              <div className="w-10 h-1 rounded-full bg-slate-700" />
            </div>

            {/* header */}
            <div className="flex items-center justify-between px-4 py-3 lg:p-5 border-b border-slate-700">
              <div>
                <h2 className="text-white font-semibold text-sm lg:text-base">
                  طلب #{String(detailOrder.id).padStart(5,"0")}
                </h2>
                <p className="text-slate-500 text-[11px] mt-0.5">
                  {new Date(detailOrder.created_at).toLocaleString("ar-SA")}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                {/* PRINT BUTTON */}
                <button
                  onClick={() => handlePrint(false)}
                  disabled={detailLoading}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-700 text-slate-400 hover:border-slate-500 hover:text-white text-xs transition-colors disabled:opacity-40"
                  title="طباعة"
                >
                  <Printer size={12} />
                  <span className="hidden sm:inline">طباعة</span>
                </button>
                {/* PDF BUTTON */}
                <button
                  onClick={() => handlePrint(true)}
                  disabled={detailLoading}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-blue-500/40 text-blue-400 hover:bg-blue-500/10 text-xs transition-colors disabled:opacity-40"
                  title="تصدير PDF"
                >
                  <FileText size={12} />
                  PDF
                </button>
                <button onClick={() => setDetailOrder(null)} className="text-slate-400 hover:text-white p-1">
                  <X size={17} />
                </button>
              </div>
            </div>

            {/* body */}
            <div className="flex-1 overflow-y-auto px-4 py-4 lg:p-5 space-y-4">

              {/* status + order number hero — mobile prominent */}
              <div className="flex items-center justify-between bg-slate-800/60 border border-slate-700/50 rounded-xl px-3 py-2.5">
                <div>
                  <p className="text-[10px] text-slate-500 mb-0.5">رقم الطلب</p>
                  <p className="text-white font-bold font-mono text-base">#{String(detailOrder.id).padStart(5,"0")}</p>
                </div>
                <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full ${STATUS_META[detailOrder.status]?.color}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${STATUS_META[detailOrder.status]?.dot}`} />
                  {STATUS_META[detailOrder.status]?.label}
                </span>
              </div>

              {/* shops */}
              <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-3 space-y-2.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400 text-xs">الطالب</span>
                  <span className="text-white font-medium text-xs">{detailOrder.from_shop?.shop_name}</span>
                </div>
                <div className="flex justify-center">
                  <ArrowLeftRight size={13} className="text-slate-600" />
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400 text-xs">المورد</span>
                  <span className="text-white font-medium text-xs">{detailOrder.to_shop?.shop_name}</span>
                </div>
              </div>

              {/* items */}
              <div>
                <h3 className="text-slate-400 text-[11px] font-medium mb-2 uppercase tracking-wide">الأصناف</h3>
                {detailLoading ? (
                  <div className="text-center py-5 text-slate-500">
                    <RefreshCw size={14} className="animate-spin mx-auto mb-1.5" />
                    <p className="text-xs">جاري التحميل...</p>
                  </div>
                ) : detailItems.length === 0 ? (
                  <p className="text-slate-500 text-xs text-center py-4">لا توجد أصناف</p>
                ) : detailItems.map(item => (
                  <div key={item.id} className="flex items-center justify-between bg-slate-800/60 border border-slate-700/30 rounded-lg px-3 py-2.5 mb-1.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-white text-xs font-medium truncate">{item.product?.part_name}</p>
                      <p className="text-slate-500 text-[11px] font-mono">{item.product?.part_number}</p>
                    </div>
                    <div className="text-left shrink-0 mr-3">
                      <p className="text-white text-xs font-medium">{(item.price * item.quantity).toLocaleString()} ر.س</p>
                      <p className="text-slate-500 text-[11px]">{item.quantity} × {item.price.toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* total */}
              <div className="flex items-center justify-between bg-slate-800 border border-slate-700 rounded-xl px-3 py-3">
                <span className="text-slate-400 text-sm font-medium">الإجمالي</span>
                <span className="text-white text-base lg:text-lg font-bold">{Number(detailOrder.total_amount).toLocaleString()} ر.س</span>
              </div>

              {/* notes */}
              {detailOrder.notes && (
                <div className="bg-slate-800/60 border border-slate-700/30 rounded-xl px-3 py-3">
                  <p className="text-slate-400 text-[11px] mb-1">ملاحظات</p>
                  <p className="text-slate-300 text-xs leading-relaxed">{detailOrder.notes}</p>
                </div>
              )}
            </div>

            {/* تعديل: أزرار الاعتماد/الرفض في الـ Drawer تظهر للأدمن وللمورد */}
            {canActOnOrder(detailOrder) && (
              <div className="flex gap-2 px-4 py-3 lg:p-5 border-t border-slate-700">
                <button
                  onClick={() => handleReject(detailOrder.id)}
                  disabled={actionId === detailOrder.id}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-red-500/30 text-red-400 hover:bg-red-500/10 text-sm font-medium transition-colors disabled:opacity-40"
                >
                  <XCircle size={14} /> رفض
                </button>
                <button
                  onClick={() => handleApprove(detailOrder.id)}
                  disabled={actionId === detailOrder.id}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition-colors disabled:opacity-40"
                >
                  {actionId === detailOrder.id
                    ? <RefreshCw size={13} className="animate-spin" />
                    : <PackageCheck size={14} />
                  }
                  اعتماد الطلب
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          NEW ORDER MODAL — يظهر فقط لأصحاب المتاجر
      ══════════════════════════════════════════════════════ */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end lg:items-center justify-center lg:p-4" dir="rtl">
          <div className="bg-slate-900 border border-slate-700 rounded-t-2xl lg:rounded-2xl w-full lg:max-w-2xl max-h-[92vh] lg:max-h-[90vh] flex flex-col shadow-2xl">

            {/* drag handle — mobile only */}
            <div className="lg:hidden flex justify-center pt-2.5 pb-1">
              <div className="w-10 h-1 rounded-full bg-slate-700" />
            </div>

            {/* header */}
            <div className="flex items-center justify-between px-4 py-3 lg:p-5 border-b border-slate-700">
              <div className="flex items-center gap-2">
                <ShoppingCart size={15} className="text-blue-400" />
                <h2 className="text-white font-semibold text-sm lg:text-base">طلب جديد</h2>
              </div>
              <button onClick={closeModal} className="text-slate-400 hover:text-white p-1"><X size={17} /></button>
            </div>

            {/* body */}
            <div className="flex-1 overflow-y-auto px-4 py-4 lg:p-5 space-y-4">

              {modalError && (
                <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-red-400 text-xs">
                  <AlertCircle size={13} /> {modalError}
                </div>
              )}

              {/* supplier select */}
              <div>
                <label className="block text-slate-400 text-[11px] mb-1.5 font-medium uppercase tracking-wide">المحل المورد *</label>
                <select
                  value={supplierShopId}
                  onChange={e => { setSupplierShopId(Number(e.target.value) || ""); setCart([]); setProductSearch(""); }}
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl p-3 text-sm focus:outline-none focus:border-blue-500"
                >
                  <option value="">-- اختر محل المورد --</option>
                  {otherShops.map(s => (
                    <option key={s.id} value={s.id}>{s.shop_name}</option>
                  ))}
                </select>
              </div>

              {/* products list */}
              {supplierShopId && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-slate-400 text-[11px] font-medium uppercase tracking-wide">منتجات المورد</label>
                    <div className="relative">
                      <Search size={11} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                      <input
                        type="text"
                        value={productSearch}
                        onChange={e => setProductSearch(e.target.value)}
                        placeholder="ابحث..."
                        className="bg-slate-800 border border-slate-700 text-white placeholder-slate-500 text-xs rounded-lg py-1.5 pr-7 pl-3 w-32 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>

                  {loadingProducts ? (
                    <div className="text-center py-6 text-slate-500">
                      <RefreshCw size={14} className="animate-spin mx-auto mb-1.5 text-blue-400" />
                      <p className="text-xs">جاري التحميل...</p>
                    </div>
                  ) : filteredProducts.length === 0 ? (
                    <div className="text-center py-6 text-slate-500 text-xs bg-slate-800/40 rounded-xl border border-slate-700/50">
                      لا توجد منتجات متوفرة
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-44 overflow-y-auto pl-1">
                      {filteredProducts.map(p => {
                        const inCart = !!cart.find(c => c.product.id === p.id);
                        return (
                          <div
                            key={p.id}
                            className={`flex items-center justify-between rounded-xl px-3 py-2.5 border transition-colors ${
                              inCart ? "border-blue-500/40 bg-blue-500/5" : "border-slate-700/30 bg-slate-800/60 hover:border-slate-600"
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-white text-xs font-medium truncate">{p.part_name}</p>
                              <p className="text-slate-500 text-[11px] font-mono">{p.part_number}</p>
                            </div>
                            <div className="flex items-center gap-2.5 mr-2">
                              <div className="text-left">
                                <p className="text-slate-300 text-xs font-medium">{p.price.toLocaleString()} ر.س</p>
                                <p className="text-slate-500 text-[10px]">متوفر: {p.quantity}</p>
                              </div>
                              <button
                                onClick={() => addToCart(p)}
                                disabled={inCart}
                                className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors shrink-0 ${
                                  inCart
                                    ? "bg-blue-600/30 text-blue-400 cursor-default"
                                    : "bg-slate-700 hover:bg-blue-600 text-slate-300 hover:text-white"
                                }`}
                              >
                                {inCart ? <Check size={12} /> : <Plus size={12} />}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* cart */}
              {cart.length > 0 && (
                <div>
                  <h3 className="text-slate-400 text-[11px] font-medium uppercase tracking-wide mb-2">
                    قائمة الطلب ({cart.length} صنف)
                  </h3>
                  <div className="space-y-1.5">
                    {cart.map(item => (
                      <div key={item.product.id} className="flex items-center gap-2 bg-slate-800/60 border border-slate-700/30 rounded-xl px-3 py-2.5">
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-xs font-medium truncate">{item.product.part_name}</p>
                          <p className="text-slate-500 text-[11px]">{item.product.price.toLocaleString()} ر.س / وحدة</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => item.quantity > 1 ? updateQty(item.product.id, item.quantity-1) : removeFromCart(item.product.id)}
                            className="w-6 h-6 flex items-center justify-center rounded-md bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs transition-colors"
                          >−</button>
                          <input
                            type="number" min={1} max={item.product.quantity}
                            value={item.quantity}
                            onChange={e => updateQty(item.product.id, Number(e.target.value))}
                            className="w-10 text-center bg-slate-800 border border-slate-700 text-white rounded-md p-1 text-xs focus:outline-none focus:border-blue-500"
                          />
                          <button
                            onClick={() => updateQty(item.product.id, item.quantity+1)}
                            disabled={item.quantity >= item.product.quantity}
                            className="w-6 h-6 flex items-center justify-center rounded-md bg-slate-700 hover:bg-slate-600 disabled:opacity-30 text-slate-300 text-xs transition-colors"
                          >+</button>
                        </div>
                        <span className="text-white text-xs font-medium w-16 text-left shrink-0">
                          {(item.product.price * item.quantity).toLocaleString()} ر.س
                        </span>
                        <button onClick={() => removeFromCart(item.product.id)} className="text-slate-600 hover:text-red-400 transition-colors shrink-0">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between mt-2 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5">
                    <span className="text-slate-400 text-sm">الإجمالي</span>
                    <span className="text-white font-bold text-sm">{cartTotal.toLocaleString()} ر.س</span>
                  </div>
                </div>
              )}

              {/* notes */}
              <div>
                <label className="block text-slate-400 text-[11px] mb-1.5 font-medium">ملاحظات (اختياري)</label>
                <textarea
                  value={orderNotes}
                  onChange={e => setOrderNotes(e.target.value)}
                  placeholder="أي ملاحظات للمورد..."
                  rows={2}
                  className="w-full bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-xl p-3 text-sm focus:outline-none focus:border-blue-500 resize-none"
                />
              </div>
            </div>

            {/* footer */}
            <div className="flex items-center justify-end gap-2 px-4 py-3 lg:p-5 border-t border-slate-700">
              <button
                onClick={closeModal}
                className="px-4 py-2.5 text-xs lg:text-sm text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 rounded-xl transition-colors"
              >
                إلغاء
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving || cart.length === 0}
                className="flex items-center gap-1.5 px-5 py-2.5 text-xs lg:text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl font-medium transition-colors"
              >
                {saving
                  ? <><RefreshCw size={12} className="animate-spin" /> جاري الإرسال...</>
                  : <><Save size={12} /> إرسال الطلب</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
