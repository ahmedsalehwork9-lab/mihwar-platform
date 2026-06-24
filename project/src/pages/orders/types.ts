// =============================================================
// src/pages/orders/types.ts
// Shared types for the Orders module.
// =============================================================

export type OrderStatus =
  | "pending"
  | "approved"
  | "partially_approved"
  | "rejected"
  | "completed";

export type RequestType = "PURCHASE" | "TRANSFER";

export type ShopInfo = {
  shop_name: string;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  website?: string | null;
  commercial_registration?: string | null;
  address?: string | null;
  logo_url?: string | null;
};

export type Order = {
  id: number;
  from_shop_id: number;
  to_shop_id: number;
  status: OrderStatus;
  total_amount: number;
  notes: string | null;
  created_at: string;
  request_type?: RequestType | null;

  from_shop?: ShopInfo;
  to_shop?: ShopInfo;

  order_items?: { id: number }[];
};

export type Product = {
  id: number;
  // ── Migration-safe: new column names (DB migrated from part_name/part_number)
  product_name: string;
  product_code: string;
  // ── Fallback aliases for any cached/old rows still using old column names
  part_name?: string;
  part_number?: string;
  brand: string;
  model: string;
  quantity: number;
  price: number;
  shop_id: number;
  visibility_scope?: "public" | "group" | "private" | null;
};

export type OrderItem = {
  id: number;
  order_id: number;
  product_id: number;

  quantity: number;
  approved_quantity?: number | null;
  approval_reviewed?: boolean | null;

  price: number;

  product?: Product;
};

export type ApprovedQtyMap = Record<number, number>;

export type Shop = {
  id: number;
  shop_name: string;
  group_id?: number | null;
  organization_id?: number | null;
};

export type CartItem = {
  product: Product;
  quantity: number;
};

export type OrderTab = "all" | "incoming" | "outgoing";

export type OrderStatusFilter = "all" | OrderStatus;

export type OrderCounts = {
  all: number;
  incoming: number;
  outgoing: number;
  pending: number;
  approved: number;
  rejected: number;
  partial: number;
  totalValue: number;
};

/* ============================================================
   Rich Order
============================================================ */

export type RichOrder = Order & {
  items?: OrderItem[];

  supplier_name?: string;
  buyer_name?: string;

  total_requested_qty?: number;
  total_approved_qty?: number;
  remaining_qty?: number;
};

/* ============================================================
   Follow Up Orders
============================================================ */

export type FollowUpOrder = {
  id: number;
  original_order_id: number;
  status: OrderStatus;
  created_at: string;
};

/* ============================================================
   Approval Result
============================================================ */

export type ApprovalResult = {
  success: boolean;
  message?: string;
  follow_up_order_id?: number | null;
};

/* ============================================================
   Printing
============================================================ */

export type PrintData = {
  order: Order;
  items: OrderItem[];

  qrCode?: string;
  verificationUrl?: string;
};

/* ============================================================
   Constants
============================================================ */

export const PAGE_SIZE = 10;

export const STATUS_META: Record<
  OrderStatus,
  {
    label: {
      ar: string;
      en: string;
    };
    color: string;
    dot: string;
  }
> = {
  pending: {
    label: { ar: "معلق", en: "Pending" },
    color: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    dot: "bg-amber-400",
  },

  approved: {
    label: { ar: "مقبول", en: "Approved" },
    color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    dot: "bg-emerald-400",
  },

  partially_approved: {
    label: { ar: "موافقة جزئية", en: "Partially Approved" },
    color: "bg-purple-500/10 text-purple-400 border-purple-500/30",
    dot: "bg-purple-400",
  },

  rejected: {
    label: { ar: "مرفوض", en: "Rejected" },
    color: "bg-red-500/10 text-red-400 border-red-500/30",
    dot: "bg-red-400",
  },

  completed: {
    label: { ar: "مكتمل", en: "Completed" },
    color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    dot: "bg-emerald-400",
  },
};

export const SCOPE_META = {
  public: {
    color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  },
  group: {
    color: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  },
  private: {
    color: "bg-slate-700/60 text-slate-400 border-slate-600/40",
  },
} as const;
