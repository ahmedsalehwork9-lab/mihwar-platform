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
  const date = new Date(order.created_at).toLocaleString("ar-SA", {
    day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  const rows = items.map((item, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${item.product?.part_name ?? "—"}</td>
      <td>${item.product?.part_number ?? "—"}</td>
      <td>${item.quantity}</td>
      <td>${item.price.toLocaleString()} ر.س</td>
      <td>${(item.price * item.quantity).toLocaleString()} ر.س</td>
    </tr>
  `).join("");

  return `
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8" />
      <title>طلب #${String(order.id).padStart(5, "0")}</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
          background: #fff;
          color: #1a1a2e;
          padding: 32px;
          direction: rtl;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          border-bottom: 2px solid #1a56db;
          padding-bottom: 18px;
          margin-bottom: 24px;
        }
        .header-title h1 { font-size: 22px; font-weight: 700; color: #1a56db; }
        .header-title p  { font-size: 13px; color: #6b7280; margin-top: 4px; }
        .badge {
          display: inline-block;
          padding: 4px 14px;
          border-radius: 999px;
          font-size: 13px;
          font-weight: 600;
          border: 1px solid;
        }
        .badge-pending   { background:#fffbeb; color:#92400e; border-color:#fcd34d; }
        .badge-approved  { background:#eff6ff; color:#1e40af; border-color:#93c5fd; }
        .badge-rejected  { background:#fef2f2; color:#991b1b; border-color:#fca5a5; }
        .badge-completed { background:#ecfdf5; color:#065f46; border-color:#6ee7b7; }
        .info-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          margin-bottom: 24px;
        }
        .info-card {
          background: #f9fafb;
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          padding: 14px 18px;
        }
        .info-card .label {
          font-size: 11px; color: #9ca3af;
          text-transform: uppercase; letter-spacing: .05em; margin-bottom: 5px;
        }
        .info-card .value { font-size: 15px; font-weight: 600; color: #111827; }
        .section-title {
          font-size: 13px; font-weight: 700; color: #6b7280;
          text-transform: uppercase; letter-spacing: .06em; margin-bottom: 10px;
        }
        table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 13px; }
        thead tr { background: #1a56db; color: #fff; }
        thead th { padding: 10px 12px; text-align: right; font-weight: 600; }
        tbody tr:nth-child(even) { background: #f9fafb; }
        tbody tr:hover { background: #eff6ff; }
        tbody td { padding: 10px 12px; border-bottom: 1px solid #e5e7eb; color: #374151; }
        .total-box {
          display: flex; justify-content: space-between; align-items: center;
          background: #eff6ff; border: 1px solid #bfdbfe;
          border-radius: 10px; padding: 14px 20px; margin-bottom: 20px;
        }
        .total-box .total-label { font-size: 15px; color: #374151; font-weight: 500; }
        .total-box .total-value { font-size: 22px; font-weight: 700; color: #1a56db; }
        .notes-box {
          background: #fffbeb; border: 1px solid #fcd34d;
          border-radius: 10px; padding: 12px 16px; margin-bottom: 20px;
        }
        .notes-box .label { font-size: 11px; color: #92400e; font-weight: 600; margin-bottom: 4px; }
        .notes-box p { font-size: 13px; color: #78350f; }
        .footer {
          border-top: 1px solid #e5e7eb; padding-top: 14px;
          font-size: 11px; color: #9ca3af;
          display: flex; justify-content: space-between;
        }
        @media print {
          body { padding: 16px; }
          @page { margin: 12mm; size: A4; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="header-title">
          <h1>طلب شراء #${String(order.id).padStart(5, "0")}</h1>
          <p>${date}</p>
        </div>
        <span class="badge badge-${order.status}">${STATUS_LABEL_AR[order.status]}</span>
      </div>
      <div class="info-grid">
        <div class="info-card">
          <div class="label">الطالب</div>
          <div class="value">${order.from_shop?.shop_name ?? "—"}</div>
        </div>
        <div class="info-card">
          <div class="label">المورد</div>
          <div class="value">${order.to_shop?.shop_name ?? "—"}</div>
        </div>
      </div>
      <div class="section-title">الأصناف</div>
      <table>
        <thead>
          <tr>
            <th>#</th><th>اسم القطعة</th><th>رقم القطعة</th>
            <th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th>
          </tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="6" style="text-align:center;color:#9ca3af;padding:20px">لا توجد أصناف</td></tr>'}
        </tbody>
      </table>
      <div class="total-box">
        <span class="total-label">الإجمالي الكلي</span>
        <span class="total-value">${Number(order.total_amount).toLocaleString()} ر.س</span>
      </div>
      ${order.notes ? `
        <div class="notes-box">
          <div class="label">ملاحظات</div>
          <p>${order.notes}</p>
        </div>
      ` : ""}
      <div class="footer">
        <span>IsuzuParts — B2B Spare Parts Platform</span>
        <span>تم الإنشاء: ${new Date().toLocaleString("ar-SA")}</span>
      </div>
    </body>
    </html>
  `;
}

// ─────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────

export default function OrdersPage() {

  const { ownedShopId, role, isAdmin } = useAuth() as any;

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
  // FIX: detailOrderId فقط — نشتق detailOrder من orders لتجنب stale state
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

  // FIX: detailOrder مشتق مباشرة من orders — مصدر حقيقة واحد
  const detailOrder = useMemo(
    () => orders.find(o => o.id === detailOrderId) ?? null,
    [orders, detailOrderId]
  );

  // ── fetch orders ─────────────────────────────────────────────
  const fetchOrders = async (): Promise<Order[]> => {
    if (!isAdmin && !ownedShopId) return [];

    setLoading(true);
    setError(null);

    try {
      let query = supabase
        .from("orders")
        .select(`
          *,
          from_shop:shops!orders_from_shop_id_fkey(shop_name),
          to_shop:shops!orders_to_shop_id_fkey(shop_name),
          order_items(id)
        `);

      if (!isAdmin) {
        query = query.or(
          `from_shop_id.eq.${ownedShopId},to_shop_id.eq.${ownedShopId}`
        );
      }

      const { data, error: fetchError } = await query.order("created_at", { ascending: false });

      if (fetchError) {
        console.error("fetchOrders error:", fetchError);
        setError(fetchError.message);
        return [];
      }

      const fetched = (data as Order[]) || [];
      // FIX: تحديث الـ state مرة واحدة فقط — detailOrder يُشتق تلقائياً
      setOrders(fetched);
      return fetched;

    } finally {
      setLoading(false);
    }
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    incoming: isAdmin ? orders.length : orders.filter(o => o.to_shop_id   === ownedShopId).length,
    outgoing: isAdmin ? orders.length : orders.filter(o => o.from_shop_id === ownedShopId).length,
    pending:  orders.filter(o => o.status === "pending").length,
  }), [orders, ownedShopId, isAdmin]);

  // ── open detail ──────────────────────────────────────────────
  // FIX: نحفظ ID فقط، لا نحفظ الـ object كاملاً
  const openDetail = async (order: Order) => {
    setDetailOrderId(order.id);
    setDetailItems([]);
    setDetailLoading(true);
    const { data } = await supabase
      .from("order_items")
      .select("*, product:products(*)")
      .eq("order_id", order.id);
    setDetailItems((data as OrderItem[]) || []);
    setDetailLoading(false);
  };

  const closeDetail = () => {
    setDetailOrderId(null);
    setDetailItems([]);
  };

  // ── PRINT / PDF ──────────────────────────────────────────────
  const handlePrint = () => {
    if (!detailOrder) return;
    const html = buildPrintHTML(detailOrder, detailItems);
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.onload = () => { win.focus(); win.print(); };
  };

  // ── approve ──────────────────────────────────────────────────
  // FIX:
  //   1. استدعاء RPC مرة واحدة فقط
  //   2. await fetchOrders() — ثم detailOrder يُحدَّث تلقائياً من الـ derived state
  //   3. finally يضمن إزالة actionId دائماً
  const handleApprove = async (orderId: number) => {
    if (actionId !== null) return; // منع الضغط المتزامن
    setActionId(orderId);

    try {
      const { error: rpcError } = await supabase.rpc("approve_order", { p_order_id: orderId });

      if (rpcError) {
        setError(rpcError.message);
        return;
      }

      // FIX: fetchOrders يُحدِّث setOrders → detailOrder يُشتق تلقائياً من الـ useMemo
      // لا يوجد setDetailOrder منفصل — لا race condition
      await fetchOrders();
      showToast("تم اعتماد الطلب وتحديث المخزون ✓");

    } finally {
      setActionId(null);
    }
  };

  // ── reject ───────────────────────────────────────────────────
  // FIX: نفس النمط — finally يضمن إزالة actionId
  const handleReject = async (orderId: number) => {
    if (!confirm("هل أنت متأكد من رفض هذا الطلب؟")) return;
    if (actionId !== null) return;
    setActionId(orderId);

    try {
      const { error: rejectError } = await supabase
        .from("orders")
        .update({ status: "rejected" })
        .eq("id", orderId);

      if (rejectError) {
        setError(rejectError.message);
        return;
      }

      // FIX: نفس النمط — fetchOrders يُحدِّث كل شيء مرة واحدة
      await fetchOrders();
      showToast("تم رفض الطلب");

    } finally {
      setActionId(null);
    }
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

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return supplierProducts;
    return supplierProducts.filter(
      p => p.part_name?.toLowerCase().includes(q) || p.part_number?.toLowerCase().includes(q)
    );
  }, [supplierProducts, productSearch]);

  const otherShops = shops.filter(s => s.id !== ownedShopId);

  const canActOnOrder = (order: Order): boolean => {
    if (isAdmin) return order.status === "pending";
    return order.to_shop_id === ownedShopId && order.status === "pending";
  };

  // ─────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────
  return (
    <div className="p-4 lg:p-6 min-h-screen" dir="rtl">

      {/* ── TOAST ── */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] bg-emerald-600 text-white text-sm px-5 py-2.5 rounded-xl shadow-xl flex items-center gap-2">
          <Check size={14} /> {toast}
        </div>
      )}

      {/* ══════ HEADER ══════ */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="bg-blue-500/10 p-2 rounded-xl border border-blue-500/20">
            <ShoppingCart size={18} className="text-blue-400" />
          </div>
          <div>
            <h1 className="text-white font-semibold text-lg">الطلبات</h1>
            <p className="text-slate-500 text-xs">
              {orders.length} طلب إجمالي
              {counts.pending > 0 && (
                <span className="mr-1 text-amber-400 font-medium">· {counts.pending} معلق</span>
              )}
              {isAdmin && (
                <span className="mr-2 text-xs bg-purple-500/10 text-purple-400 border border-purple-500/20 px-2 py-0.5 rounded-full">
                  Admin — عرض جميع الطلبات
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchOrders}
            className="w-9 h-9 flex items-center justify-center rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white transition-colors"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
          {!isAdmin && (
            <button
              onClick={() => setShowModal(true)}
              disabled={!ownedShopId}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg font-medium transition-colors"
            >
              <Plus size={14} /> طلب جديد
            </button>
          )}
        </div>
      </div>

      {/* ══════ STATS ══════ */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {[
          { label: "إجمالي الطلبات", value: counts.all,     color: "text-slate-300"   },
          { label: "واردة",          value: counts.incoming, color: "text-blue-400"    },
          { label: "صادرة",          value: counts.outgoing, color: "text-emerald-400" },
          { label: "معلقة",          value: counts.pending,  color: "text-amber-400"   },
        ].map(s => (
          <div key={s.label} className="bg-slate-900 border border-slate-700/50 rounded-xl p-3">
            <p className="text-slate-500 text-xs mb-1">{s.label}</p>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* ══════ ERROR ══════ */}
      {error && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-red-400 mb-5 text-sm">
          <AlertCircle size={15} /> {error}
          <button onClick={() => setError(null)} className="mr-auto"><X size={14} /></button>
        </div>
      )}

      {!isAdmin && !ownedShopId && !loading && (
        <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 text-amber-400 mb-5 text-sm">
          <AlertCircle size={15} /> لم يتم ربط حسابك بمتجر. تأكد من إعداد المتجر أو تواصل مع الدعم.
        </div>
      )}

      {/* ══════ TABS + FILTERS ══════ */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center bg-slate-900 border border-slate-700/50 rounded-xl p-1 gap-1">
          {([
            { key: "all",      label: "الكل",  count: counts.all      },
            { key: "incoming", label: "واردة", count: counts.incoming },
            { key: "outgoing", label: "صادرة", count: counts.outgoing },
          ] as { key: typeof tab; label: string; count: number }[]).map(t => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setPage(1); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
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

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="رقم طلب أو محل..."
              className="bg-slate-800 border border-slate-700 text-white placeholder-slate-500 text-xs rounded-lg py-2 pr-8 pl-3 w-44 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="relative">
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

      {/* ══════ TABLE ══════ */}
      <div className="bg-slate-900 border border-slate-700/50 rounded-2xl overflow-hidden">
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

        {/* PAGINATION */}
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

      {/* ══════════════════════════════════════════════════════
          DETAIL DRAWER
      ══════════════════════════════════════════════════════ */}
      {detailOrder && (
        <div className="fixed inset-0 z-50 flex" dir="rtl">
          <div className="flex-1 bg-black/50 backdrop-blur-sm" onClick={closeDetail} />
          <div className="w-full max-w-md bg-slate-900 border-r border-slate-700 flex flex-col shadow-2xl">

            {/* header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-700">
              <div>
                <h2 className="text-white font-semibold">طلب #{String(detailOrder.id).padStart(5,"0")}</h2>
                <p className="text-slate-500 text-xs mt-0.5">{new Date(detailOrder.created_at).toLocaleString("ar-SA")}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePrint}
                  disabled={detailLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 text-slate-400 hover:border-slate-500 hover:text-white text-xs transition-colors disabled:opacity-40"
                  title="طباعة"
                >
                  <Printer size={13} /> طباعة
                </button>
                <button
                  onClick={handlePrint}
                  disabled={detailLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-500/40 text-blue-400 hover:bg-blue-500/10 text-xs transition-colors disabled:opacity-40"
                  title="تصدير PDF"
                >
                  <FileText size={13} /> PDF
                </button>
                <button onClick={closeDetail} className="text-slate-400 hover:text-white">
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">

              {/* status */}
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-sm">الحالة</span>
                <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full ${STATUS_META[detailOrder.status]?.color}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${STATUS_META[detailOrder.status]?.dot}`} />
                  {STATUS_META[detailOrder.status]?.label}
                </span>
              </div>

              {/* shops */}
              <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">الطالب</span>
                  <span className="text-white font-medium">{detailOrder.from_shop?.shop_name}</span>
                </div>
                <div className="flex justify-center"><ArrowLeftRight size={14} className="text-slate-600" /></div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">المورد</span>
                  <span className="text-white font-medium">{detailOrder.to_shop?.shop_name}</span>
                </div>
              </div>

              {/* items */}
              <div>
                <h3 className="text-slate-400 text-xs font-medium mb-3 uppercase tracking-wide">الأصناف</h3>
                {detailLoading ? (
                  <div className="text-center py-6 text-slate-500">
                    <RefreshCw size={15} className="animate-spin mx-auto mb-2" />جاري التحميل...
                  </div>
                ) : detailItems.length === 0 ? (
                  <p className="text-slate-500 text-sm text-center py-4">لا توجد أصناف</p>
                ) : detailItems.map(item => (
                  <div key={item.id} className="flex items-center justify-between bg-slate-800/60 border border-slate-700/30 rounded-lg p-3 mb-2">
                    <div>
                      <p className="text-white text-sm font-medium">{item.product?.part_name}</p>
                      <p className="text-slate-500 text-xs font-mono">{item.product?.part_number}</p>
                    </div>
                    <div className="text-left">
                      <p className="text-white text-sm font-medium">{(item.price * item.quantity).toLocaleString()} ر.س</p>
                      <p className="text-slate-500 text-xs">{item.quantity} × {item.price.toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* total */}
              <div className="flex items-center justify-between bg-slate-800 border border-slate-700 rounded-xl p-4">
                <span className="text-slate-400 font-medium">الإجمالي</span>
                <span className="text-white text-lg font-bold">{Number(detailOrder.total_amount).toLocaleString()} ر.س</span>
              </div>

              {/* notes */}
              {detailOrder.notes && (
                <div className="bg-slate-800/60 border border-slate-700/30 rounded-xl p-4">
                  <p className="text-slate-400 text-xs mb-1">ملاحظات</p>
                  <p className="text-slate-300 text-sm">{detailOrder.notes}</p>
                </div>
              )}
            </div>

            {/* approve / reject buttons */}
            {canActOnOrder(detailOrder) && (
              <div className="flex gap-2 p-5 border-t border-slate-700">
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
          NEW ORDER MODAL
      ══════════════════════════════════════════════════════ */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" dir="rtl">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">

            <div className="flex items-center justify-between p-5 border-b border-slate-700">
              <div className="flex items-center gap-2">
                <ShoppingCart size={16} className="text-blue-400" />
                <h2 className="text-white font-semibold">طلب جديد</h2>
              </div>
              <button onClick={closeModal} className="text-slate-400 hover:text-white"><X size={18} /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">

              {modalError && (
                <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-red-400 text-sm">
                  <AlertCircle size={14} /> {modalError}
                </div>
              )}

              <div>
                <label className="block text-slate-400 text-xs mb-2 font-medium uppercase tracking-wide">المحل المورد *</label>
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

              {supplierShopId && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-slate-400 text-xs font-medium uppercase tracking-wide">منتجات المورد</label>
                    <div className="relative">
                      <Search size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                      <input
                        type="text"
                        value={productSearch}
                        onChange={e => setProductSearch(e.target.value)}
                        placeholder="ابحث..."
                        className="bg-slate-800 border border-slate-700 text-white placeholder-slate-500 text-xs rounded-lg py-1.5 pr-8 pl-3 w-36 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>

                  {loadingProducts ? (
                    <div className="text-center py-8 text-slate-500">
                      <RefreshCw size={15} className="animate-spin mx-auto mb-2 text-blue-400" />
                      جاري التحميل...
                    </div>
                  ) : filteredProducts.length === 0 ? (
                    <div className="text-center py-8 text-slate-500 text-sm bg-slate-800/40 rounded-xl border border-slate-700/50">
                      لا توجد منتجات متوفرة
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto pl-1">
                      {filteredProducts.map(p => {
                        const inCart = !!cart.find(c => c.product.id === p.id);
                        return (
                          <div
                            key={p.id}
                            className={`flex items-center justify-between rounded-xl p-3 border transition-colors ${
                              inCart ? "border-blue-500/40 bg-blue-500/5" : "border-slate-700/30 bg-slate-800/60 hover:border-slate-600"
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-white text-sm font-medium truncate">{p.part_name}</p>
                              <p className="text-slate-500 text-xs font-mono">{p.part_number}</p>
                            </div>
                            <div className="flex items-center gap-3 mr-3">
                              <div className="text-left">
                                <p className="text-slate-300 text-xs font-medium">{p.price.toLocaleString()} ر.س</p>
                                <p className="text-slate-500 text-[10px]">متوفر: {p.quantity}</p>
                              </div>
                              <button
                                onClick={() => addToCart(p)}
                                disabled={inCart}
                                className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${
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

              {cart.length > 0 && (
                <div>
                  <h3 className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-2">
                    قائمة الطلب ({cart.length} صنف)
                  </h3>
                  <div className="space-y-2">
                    {cart.map(item => (
                      <div key={item.product.id} className="flex items-center gap-3 bg-slate-800/60 border border-slate-700/30 rounded-xl p-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm font-medium truncate">{item.product.part_name}</p>
                          <p className="text-slate-500 text-xs">{item.product.price.toLocaleString()} ر.س / وحدة</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => item.quantity > 1 ? updateQty(item.product.id, item.quantity-1) : removeFromCart(item.product.id)}
                            className="w-6 h-6 flex items-center justify-center rounded-md bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs transition-colors"
                          >−</button>
                          <input
                            type="number" min={1} max={item.product.quantity}
                            value={item.quantity}
                            onChange={e => updateQty(item.product.id, Number(e.target.value))}
                            className="w-12 text-center bg-slate-800 border border-slate-700 text-white rounded-md p-1 text-xs focus:outline-none focus:border-blue-500"
                          />
                          <button
                            onClick={() => updateQty(item.product.id, item.quantity+1)}
                            disabled={item.quantity >= item.product.quantity}
                            className="w-6 h-6 flex items-center justify-center rounded-md bg-slate-700 hover:bg-slate-600 disabled:opacity-30 text-slate-300 text-xs transition-colors"
                          >+</button>
                        </div>
                        <span className="text-white text-sm font-medium w-20 text-left">
                          {(item.product.price * item.quantity).toLocaleString()} ر.س
                        </span>
                        <button onClick={() => removeFromCart(item.product.id)} className="text-slate-600 hover:text-red-400 transition-colors">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between mt-3 bg-slate-800 border border-slate-700 rounded-xl p-3">
                    <span className="text-slate-400 text-sm">الإجمالي</span>
                    <span className="text-white font-bold text-base">{cartTotal.toLocaleString()} ر.س</span>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-slate-400 text-xs mb-2 font-medium">ملاحظات (اختياري)</label>
                <textarea
                  value={orderNotes}
                  onChange={e => setOrderNotes(e.target.value)}
                  placeholder="أي ملاحظات للمورد..."
                  rows={2}
                  className="w-full bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-xl p-3 text-sm focus:outline-none focus:border-blue-500 resize-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 p-5 border-t border-slate-700">
              <button
                onClick={closeModal}
                className="px-4 py-2 text-sm text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 rounded-xl transition-colors"
              >
                إلغاء
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving || cart.length === 0}
                className="flex items-center gap-1.5 px-5 py-2 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl font-medium transition-colors"
              >
                {saving
                  ? <><RefreshCw size={13} className="animate-spin" /> جاري الإرسال...</>
                  : <><Save size={13} /> إرسال الطلب</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}