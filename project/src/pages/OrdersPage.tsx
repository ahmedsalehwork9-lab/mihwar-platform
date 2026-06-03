import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../context/LanguageContext";
import {
  ShoppingCart, RefreshCw, Package, Plus, X,
  Check, XCircle, PackageCheck,
  Eye, Trash2, AlertCircle, ChevronLeft, ChevronRight,
  Search, Save, ChevronDown,
  Printer, ArrowRightLeft, DollarSign,
  TrendingUp, Clock, CheckCircle,
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

const STATUS_META: Record<OrderStatus, { label: { ar: string; en: string }; color: string; dot: string }> = {
  pending:   { label: { ar: "معلق",   en: "Pending"   }, color: "bg-amber-500/10 text-amber-400 border-amber-500/30",       dot: "bg-amber-400"   },
  approved:  { label: { ar: "مقبول",  en: "Approved"  }, color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30", dot: "bg-emerald-400" },
  rejected:  { label: { ar: "مرفوض", en: "Rejected"  }, color: "bg-red-500/10 text-red-400 border-red-500/30",             dot: "bg-red-400"     },
  completed: { label: { ar: "مكتمل",  en: "Completed" }, color: "bg-blue-500/10 text-blue-400 border-blue-500/30",          dot: "bg-blue-400"    },
};

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function buildPrintHTML(order: Order, items: OrderItem[]): string {
  const date = new Date(order.created_at).toLocaleDateString("ar-SA", {
    year: "numeric", month: "long", day: "numeric",
  });
  const rows = items.map((item, i) => `
    <tr style="border-bottom: 1px solid #f3f4f6;">
      <td style="padding: 12px 8px; font-size: 13px;">${i + 1}</td>
      <td style="padding: 12px 8px; font-weight: 600; font-size: 14px;">${item.product?.part_name ?? "—"}</td>
      <td style="padding: 12px 8px; font-family: monospace; font-size: 12px;">${item.product?.part_number ?? "—"}</td>
      <td style="padding: 12px 8px; text-align: center;">${item.quantity}</td>
      <td style="padding: 12px 8px; text-align: left;">${item.price.toLocaleString()}</td>
      <td style="padding: 12px 8px; text-align: left; font-weight: 700;">${(item.price * item.quantity).toLocaleString()}</td>
    </tr>
  `).join("");

  return `
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: system-ui, -apple-system, sans-serif; padding: 40px; color: #1e293b; line-height: 1.5; }
        .header { display: flex; justify-content: space-between; border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 30px; }
        h1 { margin: 0; color: #0f172a; font-size: 24px; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th { text-align: right; background: #f8fafc; padding: 12px 8px; font-size: 12px; text-transform: uppercase; color: #64748b; }
        .total-box { margin-top: 30px; padding: 20px; background: #0f172a; color: white; border-radius: 12px; display: flex; justify-content: space-between; align-items: center; }
        .total-label { font-size: 14px; opacity: 0.8; }
        .total-amount { font-size: 24px; font-weight: 800; }
      </style>
    </head>
    <body>
      <div class="header">
        <div><h1>طلب شراء PO</h1><p style="color: #64748b;">رقم المرجع: PO-${order.id}</p></div>
        <div style="text-align: left;"><p>التاريخ: ${date}</p><p>من: ${order.from_shop?.shop_name}</p><p>إلى: ${order.to_shop?.shop_name}</p></div>
      </div>
      <table>
        <thead><tr><th>#</th><th>الصنف</th><th>رقم القطعة</th><th style="text-align:center">الكمية</th><th style="text-align:left">السعر</th><th style="text-align:left">الإجمالي</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="total-box"><span class="total-label">الإجمالي الكلي</span><span class="total-amount">${order.total_amount.toLocaleString()} ر.س</span></div>
    </body>
    </html>
  `;
}

// ─────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────

function StatusBadge({ status, isRTL }: { status: OrderStatus; isRTL: boolean }) {
  const meta = STATUS_META[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border ${meta.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${meta.dot}`} />
      {meta.label[isRTL ? "ar" : "en"]}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────

export default function OrdersPage() {
  const { ownedShopId, isAdmin } = useAuth() as any;
  const { t, isRTL } = useLang();

  // ── State ──────────────────────────────────────────────────
  const [orders, setOrders]                   = useState<Order[]>([]);
  const [shops, setShops]                     = useState<Shop[]>([]);
  const [loading, setLoading]                 = useState(false);
  const [error, setError]                     = useState<string | null>(null);
  const [toast, setToast]                     = useState<string | null>(null);

  const [tab, setTab]                         = useState<"all" | "incoming" | "outgoing">("all");
  const [statusFilter, setStatusFilter]       = useState<"all" | OrderStatus>("all");
  const [search, setSearch]                   = useState("");
  const [page, setPage]                       = useState(1);

  const [detailOrder, setDetailOrder]         = useState<Order | null>(null);
  const [detailItems, setDetailItems]         = useState<OrderItem[]>([]);
  const [detailLoading, setDetailLoading]     = useState(false);

  const [showModal, setShowModal]             = useState(false);
  const [supplierShopId, setSupplierShopId]   = useState<number | "">("");
  const [supplierProducts, setSupplierProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [productSearch, setProductSearch]     = useState("");
  const [cart, setCart]                       = useState<CartItem[]>([]);
  const [orderNotes, setOrderNotes]           = useState("");
  const [modalError, setModalError]           = useState<string | null>(null);
  const [saving, setSaving]                   = useState(false);
  const [actionId, setActionId]               = useState<number | null>(null);

  // ── Data Fetching ──────────────────────────────────────────
  const fetchOrders = useCallback(async () => {
    if (!isAdmin && !ownedShopId) return;
    setLoading(true);
    let query = supabase
      .from("orders")
      .select(`*, from_shop:shops!orders_from_shop_id_fkey(shop_name), to_shop:shops!orders_to_shop_id_fkey(shop_name), order_items(id)`);
    if (!isAdmin) query = query.or(`from_shop_id.eq.${ownedShopId},to_shop_id.eq.${ownedShopId}`);
    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) setError(error.message);
    else setOrders((data as Order[]) || []);
    setLoading(false);
  }, [isAdmin, ownedShopId]);

  const fetchShops = useCallback(async () => {
    const { data } = await supabase.from("shops").select("id, shop_name").order("shop_name");
    setShops((data as Shop[]) || []);
  }, []);

  useEffect(() => { fetchOrders(); fetchShops(); }, [fetchOrders, fetchShops]);

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

  // ── Derived Data (single-pass) ─────────────────────────────
  const { filtered, counts } = useMemo(() => {
    const q = search.trim().toLowerCase();
    let pendingCount = 0, approvedCount = 0, rejectedCount = 0, completedCount = 0;
    let totalValue = 0;
    let incomingCount = 0, outgoingCount = 0;

    const result: Order[] = [];

    for (const o of orders) {
      if (o.status === "pending")   pendingCount++;
      else if (o.status === "approved")  approvedCount++;
      else if (o.status === "rejected")  rejectedCount++;
      else if (o.status === "completed") completedCount++;
      totalValue += o.total_amount;

      if (!isAdmin) {
        if (o.to_shop_id === ownedShopId)   incomingCount++;
        if (o.from_shop_id === ownedShopId) outgoingCount++;
      }

      const matchesTab =
        isAdmin
          ? true
          : tab === "incoming" ? o.to_shop_id === ownedShopId
          : tab === "outgoing" ? o.from_shop_id === ownedShopId
          : true;

      const matchesStatus = statusFilter === "all" || o.status === statusFilter;
      const matchesSearch =
        !q ||
        String(o.id).includes(q) ||
        o.from_shop?.shop_name?.toLowerCase().includes(q) ||
        o.to_shop?.shop_name?.toLowerCase().includes(q);

      if (matchesTab && matchesStatus && matchesSearch) result.push(o);
    }

    return {
      filtered: result,
      counts: {
        all: orders.length,
        incoming: isAdmin ? orders.length : incomingCount,
        outgoing: isAdmin ? orders.length : outgoingCount,
        pending: pendingCount,
        approved: approvedCount,
        rejected: rejectedCount,
        completed: completedCount,
        totalValue,
      },
    };
  }, [orders, tab, statusFilter, search, ownedShopId, isAdmin]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageItems  = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page]
  );

  // ── Helpers ────────────────────────────────────────────────
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const openDetail = useCallback(async (order: Order) => {
    setDetailOrder(order);
    setDetailItems([]);
    setDetailLoading(true);
    const { data } = await supabase
      .from("order_items")
      .select("*, product:products(*)")
      .eq("order_id", order.id);
    setDetailItems((data as OrderItem[]) || []);
    setDetailLoading(false);
  }, []);

  const handlePrint = useCallback(() => {
    if (!detailOrder) return;
    const html = buildPrintHTML(detailOrder, detailItems);
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.print();
  }, [detailOrder, detailItems]);

  const handleApprove = useCallback(async (orderId: number) => {
    setActionId(orderId);
    const { error } = await supabase.rpc("approve_order", { p_order_id: orderId });
    if (error) {
      setError(error.message);
    } else {
      showToast(t("Order approved successfully ✓", "تم اعتماد الطلب وتحديث المخزون ✓"));
      fetchOrders();
      setDetailOrder(prev => prev ? { ...prev, status: "completed" } : null);
    }
    setActionId(null);
  }, [fetchOrders, showToast, t]);

  const handleReject = useCallback(async (orderId: number) => {
    if (!confirm(t("Are you sure you want to reject this order?", "هل أنت متأكد من رفض هذا الطلب؟"))) return;
    setActionId(orderId);
    const { error } = await supabase.from("orders").update({ status: "rejected" }).eq("id", orderId);
    if (error) {
      setError(error.message);
    } else {
      showToast(t("Order Rejected", "تم رفض الطلب"));
      fetchOrders();
      setDetailOrder(prev => prev ? { ...prev, status: "rejected" } : null);
    }
    setActionId(null);
  }, [fetchOrders, showToast, t]);

  const addToCart = useCallback((product: Product) => {
    setCart(prev => prev.find(c => c.product.id === product.id) ? prev : [...prev, { product, quantity: 1 }]);
  }, []);

  const updateQty = useCallback((productId: number, qty: number) => {
    const max = supplierProducts.find(p => p.id === productId)?.quantity ?? 1;
    setCart(prev => prev.map(c =>
      c.product.id === productId ? { ...c, quantity: Math.max(1, Math.min(qty, max)) } : c
    ));
  }, [supplierProducts]);

  const removeFromCart = useCallback((productId: number) => {
    setCart(prev => prev.filter(i => i.product.id !== productId));
  }, []);

  const cartTotal = useMemo(
    () => cart.reduce((s, c) => s + c.product.price * c.quantity, 0),
    [cart]
  );

  const handleSubmit = useCallback(async () => {
    setModalError(null);
    if (!supplierShopId || cart.length === 0) {
      setModalError(t("Please select a supplier and add items", "اختر المورد وأضف أصنافاً"));
      return;
    }
    setSaving(true);
    try {
      const { data: oData, error: oErr } = await supabase
        .from("orders")
        .insert({
          from_shop_id: ownedShopId,
          to_shop_id: supplierShopId,
          status: "pending",
          total_amount: cartTotal,
          notes: orderNotes || null,
        })
        .select()
        .single();
      if (oErr) throw oErr;
      const { error: iErr } = await supabase.from("order_items").insert(
        cart.map(c => ({ order_id: oData.id, product_id: c.product.id, quantity: c.quantity, price: c.product.price }))
      );
      if (iErr) throw iErr;
      setShowModal(false);
      setCart([]);
      setSupplierShopId("");
      setOrderNotes("");
      fetchOrders();
      showToast(t("Order sent successfully ✓", "تم إرسال الطلب بنجاح ✓"));
    } catch (e: any) {
      setModalError(e.message);
    } finally {
      setSaving(false);
    }
  }, [supplierShopId, cart, cartTotal, orderNotes, ownedShopId, fetchOrders, showToast, t]);

  const canActOnOrder = useCallback((order: Order): boolean => {
    if (isAdmin) return order.status === "pending";
    return order.to_shop_id === ownedShopId && order.status === "pending";
  }, [isAdmin, ownedShopId]);

  const handleTabChange = useCallback((t: "all" | "incoming" | "outgoing") => {
    setTab(t); setPage(1);
  }, []);

  const handleStatusFilter = useCallback((s: "all" | OrderStatus) => {
    setStatusFilter(s); setPage(1);
  }, []);

  const filteredSupplierProducts = useMemo(() => {
    if (!productSearch.trim()) return supplierProducts;
    const q = productSearch.toLowerCase();
    return supplierProducts.filter(p =>
      p.part_name.toLowerCase().includes(q) || p.part_number.toLowerCase().includes(q)
    );
  }, [supplierProducts, productSearch]);

  // ─────────────────────────────────────────────────────────
  return (
    <div className="p-4 lg:p-8 min-h-screen pb-24 md:pb-10" dir={isRTL ? "rtl" : "ltr"}>

      {/* ── Toast ── */}
      {toast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[150] bg-emerald-600 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 pointer-events-none">
          <Check size={18} /> <span className="font-bold">{toast}</span>
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 rounded-lg shrink-0">
              <ShoppingCart size={22} className="text-blue-400" />
            </div>
            {t("Orders Management", "إدارة الطلبات")}
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            {counts.all} {t("total", "طلب إجمالي")} · {counts.pending} {t("pending", "معلق")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchOrders}
            className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-all active:scale-95"
            aria-label={t("Refresh", "تحديث")}
          >
            <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
          </button>
          {!isAdmin && (
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-blue-900/20 active:scale-95 transition-all"
            >
              <Plus size={18} /> {t("New Order", "طلب جديد")}
            </button>
          )}
        </div>
      </div>

      {/* ── KPI Cards (4 stats with live data) ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {[
          {
            label: t("Total Value", "إجمالي القيمة"),
            val: `${counts.totalValue.toLocaleString()} ر.س`,
            icon: DollarSign,
            color: "text-emerald-400",
            bg: "bg-emerald-500/5",
          },
          {
            label: t("Pending", "معلقة"),
            val: counts.pending,
            icon: Clock,
            color: "text-amber-400",
            bg: "bg-amber-500/5",
          },
          {
            label: t("Approved", "مقبولة"),
            val: counts.approved + counts.completed,
            icon: CheckCircle,
            color: "text-blue-400",
            bg: "bg-blue-500/5",
          },
          {
            label: t("Rejected", "مرفوضة"),
            val: counts.rejected,
            icon: XCircle,
            color: "text-red-400",
            bg: "bg-red-500/5",
          },
        ].map((kpi, i) => (
          <div key={i} className={`${kpi.bg} border border-slate-800 p-4 rounded-2xl flex flex-col justify-between min-h-[76px]`}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-slate-500 text-[10px] font-bold uppercase tracking-widest truncate mr-1">{kpi.label}</span>
              <kpi.icon size={13} className={`${kpi.color} shrink-0`} />
            </div>
            <p className={`text-xl font-black ${kpi.color} leading-tight truncate`}>{kpi.val}</p>
          </div>
        ))}
      </div>

      {/* ── Filters & Tabs ── */}
      <div className="flex flex-col lg:flex-row gap-3 mb-5">
        {/* Tabs */}
        <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800 overflow-x-auto no-scrollbar shrink-0" role="tablist">
          {(["all", "incoming", "outgoing"] as const).map(k => (
            <button
              key={k}
              role="tab"
              aria-selected={tab === k}
              onClick={() => handleTabChange(k)}
              className={`px-5 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${
                tab === k ? "bg-slate-800 text-white shadow-sm" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              {t(k, k === "all" ? "الكل" : k === "incoming" ? "واردة" : "صادرة")}
            </button>
          ))}
        </div>

        {/* Search + Status */}
        <div className="flex-1 flex gap-2">
          <div className="relative flex-1">
            <Search
              size={16}
              className={`absolute ${isRTL ? "right-3" : "left-3"} top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none`}
            />
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder={t("Search by ID or Shop...", "بحث برقم الطلب أو المحل...")}
              className={`w-full bg-slate-900 border border-slate-800 rounded-xl py-2.5 ${
                isRTL ? "pr-10 pl-4" : "pl-10 pr-4"
              } text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all placeholder:text-slate-600 text-sm`}
            />
          </div>
          <div className="relative shrink-0">
            <select
              value={statusFilter}
              onChange={e => handleStatusFilter(e.target.value as any)}
              className="appearance-none bg-slate-900 border border-slate-800 rounded-xl px-5 py-2.5 text-sm text-slate-300 outline-none focus:border-blue-500 cursor-pointer min-w-[120px]"
            >
              <option value="all">{t("Status", "الحالة")}</option>
              {(Object.keys(STATUS_META) as OrderStatus[]).map(s => (
                <option key={s} value={s}>{STATUS_META[s].label[isRTL ? "ar" : "en"]}</option>
              ))}
            </select>
            <ChevronDown size={13} className={`absolute ${isRTL ? "left-3" : "right-3"} top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none`} />
          </div>
        </div>
      </div>

      {/* ── Mobile Order Cards ── */}
      <div className="lg:hidden space-y-2.5">
        {pageItems.length === 0 ? (
          <div className="py-16 text-center text-slate-600 bg-slate-900/30 rounded-3xl border border-dashed border-slate-800">
            <Package size={36} className="mx-auto mb-3 opacity-20" />
            <p className="text-sm">{t("No orders matching your criteria", "لا توجد طلبات مطابقة")}</p>
          </div>
        ) : pageItems.map(o => (
          <button
            key={o.id}
            onClick={() => openDetail(o)}
            className="w-full text-right bg-slate-900 border border-slate-800 rounded-2xl p-4 active:scale-[0.98] hover:border-slate-700 transition-all block"
          >
            {/* Row 1: ID + Status */}
            <div className="flex items-center justify-between mb-3">
              <span className="text-white font-mono font-black text-sm">
                #{o.id.toString().padStart(5, "0")}
              </span>
              <StatusBadge status={o.status} isRTL={isRTL} />
            </div>

            {/* Row 2: From → To */}
            <div className="flex items-center gap-2 bg-slate-950/40 rounded-xl px-3 py-2 border border-slate-800/50 mb-3">
              <div className="flex-1 min-w-0">
                <p className="text-[9px] text-slate-600 uppercase font-bold leading-none mb-0.5">{t("From", "من")}</p>
                <p className="text-xs text-white font-bold truncate">{o.from_shop?.shop_name}</p>
              </div>
              <ArrowRightLeft size={12} className="text-slate-700 shrink-0" />
              <div className="flex-1 min-w-0 text-left">
                <p className="text-[9px] text-slate-600 uppercase font-bold leading-none mb-0.5">{t("To", "إلى")}</p>
                <p className="text-xs text-white font-bold truncate">{o.to_shop?.shop_name}</p>
              </div>
            </div>

            {/* Row 3: Items + Date + Amount */}
            <div className="flex items-center justify-between">
              <div className="text-slate-500 text-[11px] space-y-0.5">
                <p className="flex items-center gap-1">
                  <Package size={11} />
                  {o.order_items?.length || 0} {t("items", "أصناف")}
                </p>
                <p>{new Date(o.created_at).toLocaleDateString()}</p>
              </div>
              <span className="text-emerald-400 font-black text-lg leading-none">
                {o.total_amount.toLocaleString()}
                <span className="text-[10px] font-normal text-slate-500"> ر.س</span>
              </span>
            </div>
          </button>
        ))}
      </div>

      {/* ── Desktop Table ── */}
      <div className="hidden lg:block bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <table className="w-full text-right border-collapse" role="grid">
          <thead>
            <tr className="bg-slate-950/50 border-b border-slate-800 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              <th scope="col" className="p-4">{t("Order ID", "رقم الطلب")}</th>
              <th scope="col" className="p-4">{t("From", "من")}</th>
              <th scope="col" className="p-4">{t("To", "إلى")}</th>
              <th scope="col" className="p-4">{t("Amount", "المبلغ")}</th>
              <th scope="col" className="p-4">{t("Status", "الحالة")}</th>
              <th scope="col" className="p-4">{t("Date", "التاريخ")}</th>
              <th scope="col" className="p-4 text-center">{t("Action", "إجراء")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50 text-sm">
            {pageItems.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-16 text-center text-slate-600 italic">
                  {t("No orders matching your criteria", "لا توجد طلبات مطابقة")}
                </td>
              </tr>
            ) : pageItems.map(o => (
              <tr key={o.id} className="hover:bg-slate-800/20 transition-colors">
                <td className="p-4 font-mono font-bold text-slate-400">#{o.id.toString().padStart(5, "0")}</td>
                <td className={`p-4 font-bold ${o.from_shop_id === ownedShopId ? "text-blue-400" : "text-white"}`}>
                  {o.from_shop?.shop_name}
                  {o.from_shop_id === ownedShopId && (
                    <span className="text-[9px] opacity-50 font-medium px-1 bg-blue-500/10 rounded ml-1">أنت</span>
                  )}
                </td>
                <td className={`p-4 font-bold ${o.to_shop_id === ownedShopId ? "text-emerald-400" : "text-white"}`}>
                  {o.to_shop?.shop_name}
                  {o.to_shop_id === ownedShopId && (
                    <span className="text-[9px] opacity-50 font-medium px-1 bg-emerald-500/10 rounded ml-1">أنت</span>
                  )}
                </td>
                <td className="p-4 font-black text-white">
                  {o.total_amount.toLocaleString()} <span className="text-[10px] font-normal text-slate-500">ر.س</span>
                </td>
                <td className="p-4">
                  <StatusBadge status={o.status} isRTL={isRTL} />
                </td>
                <td className="p-4 text-slate-500 text-xs">{new Date(o.created_at).toLocaleDateString()}</td>
                <td className="p-4 text-center">
                  <button
                    onClick={() => openDetail(o)}
                    className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all"
                    aria-label={t("View order details", "عرض تفاصيل الطلب")}
                  >
                    <Eye size={18} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="mt-6 flex justify-center items-center gap-2" role="navigation" aria-label={t("Pagination", "التنقل")}>
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            aria-label={t("Previous page", "الصفحة السابقة")}
            className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-500 disabled:opacity-20 hover:text-white transition-colors"
          >
            <ChevronRight size={20} />
          </button>
          <span className="text-slate-500 text-xs font-bold mx-2">{page} / {totalPages}</span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            aria-label={t("Next page", "الصفحة التالية")}
            className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-500 disabled:opacity-20 hover:text-white transition-colors"
          >
            <ChevronLeft size={20} />
          </button>
        </div>
      )}

      {/* ── Error Banner ── */}
      {error && (
        <div className="mt-4 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-3" role="alert">
          <AlertCircle size={18} className="shrink-0" />
          <p className="flex-1">{error}</p>
          <button onClick={() => setError(null)} className="text-slate-500 hover:text-white" aria-label="Dismiss"><X size={16} /></button>
        </div>
      )}

      {/* ── Order Detail Drawer ── */}
      {detailOrder && (
        <div
          className="fixed inset-0 z-[110] flex items-end lg:items-center justify-center lg:p-4 animate-in fade-in duration-200"
          role="dialog"
          aria-modal="true"
          aria-label={t("Order Details", "تفاصيل الطلب")}
        >
          <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm" onClick={() => setDetailOrder(null)} />
          <div className="relative bg-slate-900 border border-slate-800 w-full max-w-2xl lg:rounded-3xl rounded-t-[2rem] shadow-2xl flex flex-col max-h-[94vh] overflow-hidden">

            {/* Drawer Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0 bg-slate-900/80 backdrop-blur-md">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-3 flex-wrap">
                  <h2 className="text-lg font-black text-white">
                    {t("Order", "طلب")} <span className="font-mono text-slate-400">#{detailOrder.id}</span>
                  </h2>
                  <StatusBadge status={detailOrder.status} isRTL={isRTL} />
                </div>
                <p className="text-slate-500 text-[11px] mt-0.5">
                  {new Date(detailOrder.created_at).toLocaleString()}
                </p>
              </div>
              {/* Print button in header for easy access on mobile */}
              <div className="flex items-center gap-2 shrink-0 ml-3">
                <button
                  onClick={handlePrint}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white text-xs font-bold transition-all active:scale-95"
                  aria-label={t("Print order", "طباعة الطلب")}
                >
                  <Printer size={15} />
                  <span className="hidden sm:inline">{t("Print", "طباعة")}</span>
                </button>
                <button
                  onClick={() => setDetailOrder(null)}
                  className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition-all active:scale-95"
                  aria-label={t("Close", "إغلاق")}
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Drawer Body */}
            <div className="overflow-y-auto no-scrollbar flex-1 p-5 space-y-4">
              {/* Shop Info */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-3">
                  <p className="text-[9px] font-bold text-slate-600 uppercase tracking-wider mb-1">{t("Requester", "الطالب")}</p>
                  <p className="text-sm font-bold text-white truncate">{detailOrder.from_shop?.shop_name}</p>
                </div>
                <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-3">
                  <p className="text-[9px] font-bold text-slate-600 uppercase tracking-wider mb-1">{t("Supplier", "المورد")}</p>
                  <p className="text-sm font-bold text-white truncate">{detailOrder.to_shop?.shop_name}</p>
                </div>
              </div>

              {/* Items */}
              <div>
                <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <Package size={13} /> {t("Requested Items", "الأصناف المطلوبة")}
                </h3>
                {detailLoading ? (
                  <div className="py-10 text-center">
                    <RefreshCw className="animate-spin mx-auto text-blue-500" size={24} />
                  </div>
                ) : (
                  <div className="space-y-2">
                    {detailItems.map(item => (
                      <div
                        key={item.id}
                        className="bg-slate-800/30 border border-slate-800/50 px-4 py-3 rounded-xl flex justify-between items-center hover:border-slate-700 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-bold text-sm truncate">{item.product?.part_name}</p>
                          <p className="text-slate-500 text-[10px] font-mono mt-0.5">{item.product?.part_number}</p>
                        </div>
                        <div className="text-left ml-4 shrink-0">
                          <p className="text-white font-black text-sm">
                            {(item.price * item.quantity).toLocaleString()}
                            <span className="text-[9px] font-normal text-slate-500"> ر.س</span>
                          </p>
                          <p className="text-slate-500 text-[10px] font-bold">
                            {item.quantity} × {item.price.toLocaleString()}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Notes */}
              {detailOrder.notes && (
                <div className="bg-amber-500/5 border border-amber-500/10 p-4 rounded-xl">
                  <p className="text-[9px] font-bold text-amber-500 uppercase mb-1 tracking-wider">{t("Special Instructions", "ملاحظات إضافية")}</p>
                  <p className="text-slate-300 text-sm italic leading-relaxed">"{detailOrder.notes}"</p>
                </div>
              )}
            </div>

            {/* Drawer Footer: Total + Actions */}
            <div className="px-5 py-4 border-t border-slate-800 bg-slate-900 shrink-0 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              <div className="flex items-center justify-between mb-4">
                <span className="text-slate-500 font-bold text-xs uppercase tracking-widest">{t("Total Amount", "الإجمالي الكلي")}</span>
                <span className="text-2xl font-black text-emerald-400">
                  {detailOrder.total_amount.toLocaleString()}
                  <span className="text-sm font-normal text-slate-400"> ر.س</span>
                </span>
              </div>

              {canActOnOrder(detailOrder) && (
                <div className="flex gap-3">
                  <button
                    onClick={() => handleReject(detailOrder.id)}
                    disabled={actionId === detailOrder.id}
                    className="flex-1 py-3.5 rounded-2xl border border-red-500/20 text-red-400 font-bold hover:bg-red-500/10 transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
                  >
                    <XCircle size={18} /> {t("Reject", "رفض")}
                  </button>
                  <button
                    onClick={() => handleApprove(detailOrder.id)}
                    disabled={actionId === detailOrder.id}
                    className="flex-[2] py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black shadow-lg shadow-emerald-900/20 transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
                  >
                    {actionId === detailOrder.id
                      ? <RefreshCw className="animate-spin" size={18} />
                      : <PackageCheck size={18} />
                    }
                    {t("Approve & Transact", "اعتماد الطلب")}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── New Order Modal ── */}
      {showModal && (
        <div
          className="fixed inset-0 z-[110] flex items-end lg:items-center justify-center lg:p-4 animate-in fade-in duration-200"
          role="dialog"
          aria-modal="true"
          aria-label={t("Create Purchase Order", "إنشاء طلب شراء")}
        >
          <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm" onClick={() => setShowModal(false)} />
          <div className="relative bg-slate-900 border border-slate-800 w-full max-w-3xl lg:rounded-3xl rounded-t-[2rem] shadow-2xl flex flex-col max-h-[96vh] overflow-hidden">

            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 shrink-0">
              <h2 className="text-lg font-black text-white flex items-center gap-2">
                <Plus className="text-blue-400" size={20} />
                {t("Create Purchase Order", "إنشاء طلب شراء جديد")}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 text-slate-500 hover:text-white active:scale-90 transition-all"
                aria-label={t("Close", "إغلاق")}
              >
                <X size={22} />
              </button>
            </div>

            <div className="p-5 overflow-y-auto no-scrollbar space-y-5 flex-1">
              {modalError && (
                <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-2xl text-red-400 text-sm font-bold flex items-center gap-2" role="alert">
                  <AlertCircle size={16} /> {modalError}
                </div>
              )}

              {/* Supplier Select */}
              <div className="space-y-2">
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  {t("Select Supplier", "اختر المحل المورد")}
                </label>
                <select
                  value={supplierShopId}
                  onChange={e => { setSupplierShopId(Number(e.target.value) || ""); setCart([]); }}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3.5 text-white focus:border-blue-500 outline-none transition-all cursor-pointer text-sm"
                >
                  <option value="">{t("-- Select Supplier --", "-- اختر المورد --")}</option>
                  {shops.filter(s => s.id !== ownedShopId).map(s => (
                    <option key={s.id} value={s.id}>{s.shop_name}</option>
                  ))}
                </select>
              </div>

              {/* Product Catalog */}
              {supplierShopId && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest shrink-0">
                      {t("Available Catalog", "المنتجات المتوفرة")}
                    </h3>
                    <div className="relative flex-1 max-w-[180px]">
                      <Search size={13} className={`absolute ${isRTL ? "right-2.5" : "left-2.5"} top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none`} />
                      <input
                        value={productSearch}
                        onChange={e => setProductSearch(e.target.value)}
                        placeholder={t("Search...", "بحث...")}
                        className={`w-full bg-slate-950 border border-slate-800 rounded-lg py-2 ${isRTL ? "pr-8 pl-3" : "pl-8 pr-3"} text-xs text-white outline-none focus:border-blue-500`}
                      />
                    </div>
                  </div>

                  {loadingProducts ? (
                    <div className="py-8 text-center"><RefreshCw className="animate-spin mx-auto text-blue-500" size={20} /></div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-52 overflow-y-auto no-scrollbar">
                      {filteredSupplierProducts.map(p => (
                        <div
                          key={p.id}
                          className="bg-slate-800/40 border border-slate-800 p-3 rounded-xl flex justify-between items-center hover:border-blue-500/30 transition-all"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-white font-bold text-xs truncate">{p.part_name}</p>
                            <p className="text-slate-500 text-[10px] font-mono">{p.part_number}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 ml-2">
                            <span className="text-emerald-400 font-bold text-xs">{p.price.toLocaleString()}</span>
                            <button
                              onClick={() => addToCart(p)}
                              className="p-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-500 active:scale-90 transition-all"
                              aria-label={t(`Add ${p.part_name}`, `إضافة ${p.part_name}`)}
                            >
                              <Plus size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Cart */}
              {cart.length > 0 && (
                <div className="space-y-3 pt-3 border-t border-slate-800">
                  <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center justify-between">
                    {t("Order Summary", "سلة الطلب")}
                    <span className="text-emerald-400 font-black text-sm normal-case">{cartTotal.toLocaleString()} ر.س</span>
                  </h3>
                  <div className="space-y-2">
                    {cart.map(c => (
                      <div
                        key={c.product.id}
                        className="bg-slate-950/40 px-3 py-2.5 rounded-xl flex items-center justify-between border border-slate-800/50"
                      >
                        <div className="flex-1 min-w-0 mr-3">
                          <p className="text-white font-bold text-xs truncate">{c.product.part_name}</p>
                          <p className="text-[10px] text-slate-500">{c.product.price.toLocaleString()} ر.س</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="flex items-center bg-slate-800 rounded-lg p-0.5 border border-slate-700">
                            <button
                              onClick={() => updateQty(c.product.id, c.quantity - 1)}
                              className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-white text-sm font-bold transition-colors rounded-md active:bg-slate-700"
                            >−</button>
                            <span className="w-7 text-center font-black text-white text-sm">{c.quantity}</span>
                            <button
                              onClick={() => updateQty(c.product.id, c.quantity + 1)}
                              className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-white text-sm font-bold transition-colors rounded-md active:bg-slate-700"
                            >+</button>
                          </div>
                          <button
                            onClick={() => removeFromCart(c.product.id)}
                            className="text-slate-700 hover:text-red-400 p-1.5 active:scale-90 transition-all"
                            aria-label={t("Remove", "إزالة")}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes */}
              <div className="space-y-2">
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  {t("Internal Notes", "ملاحظات الطلب")}
                </label>
                <textarea
                  value={orderNotes}
                  onChange={e => setOrderNotes(e.target.value)}
                  placeholder={t("Any special delivery or order instructions...", "تعليمات خاصة بالتوصيل أو التجهيز...")}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3.5 text-white outline-none focus:border-blue-500 min-h-[80px] text-sm leading-relaxed transition-colors resize-none"
                />
              </div>
            </div>

            <div className="px-5 py-4 border-t border-slate-800 bg-slate-900 shrink-0 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              <button
                onClick={handleSubmit}
                disabled={saving || cart.length === 0}
                className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white font-black rounded-2xl shadow-xl shadow-blue-900/30 active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-50 text-sm"
              >
                {saving ? <RefreshCw className="animate-spin" size={18} /> : <Save size={18} />}
                {t("Confirm & Send PO", "تأكيد وإرسال الطلب")}
                {cart.length > 0 && (
                  <span className="bg-white/20 px-2 py-0.5 rounded-lg text-xs font-bold">
                    {cartTotal.toLocaleString()} ر.س
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
