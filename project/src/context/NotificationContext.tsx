import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
  ReactNode,
} from 'react';
import { supabase } from '../pages/lib/supabase';
import { useAuth } from './AuthContext';
import { useLang } from './LanguageContext';

// ─── Constants ────────────────────────────────────────────────────────────────

const EMPTY_SHOP_NAME       = '—';
const LOW_STOCK_THRESHOLD   = 5;
const REFRESH_INTERVAL_MS   = 60_000;   // fallback polling — kept as backup
const TOAST_DURATION_MS     = 5_000;

// ─── Types ────────────────────────────────────────────────────────────────────

export type StockAlert = {
  id: number;
  product_name: string;   // renamed from part_name
  product_code: string;   // renamed from part_number
  quantity: number;
  shop_id: number;
  shop_name?: string;
};

export type PendingOrderAlert = {
  id: number;
  from_shop_name: string;
  to_shop_name: string;
  total_amount: number;
  created_at: string;
};

// Toast shown when a new order arrives via Realtime
export type NewOrderToast = {
  id: number;
  from_shop_name: string;
  total_amount: number;
};

export type NotificationContextValue = {
  lowStockItems: StockAlert[];
  outOfStockItems: StockAlert[];
  pendingOrders: PendingOrderAlert[];
  totalCount: number;
  loading: boolean;
  refresh: () => void;
  // New order toast — null when no toast is visible
  newOrderToast: NewOrderToast | null;
  dismissToast: () => void;
};

type ShopLookup = {
  id: number;
  shop_name: string;
};

type ProductRow = {
  id: number;
  product_name: string;
  product_code: string;
  quantity: number;
  shop_id: number;
};

type OrderRow = {
  id: number;
  total_amount: number;
  created_at: string;
  from_shop: { shop_name: string } | null;
  to_shop:   { shop_name: string } | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildShopNameMap(data: ShopLookup[]): Record<number, string> {
  const map: Record<number, string> = {};
  data.forEach((s) => { map[s.id] = s.shop_name; });
  return map;
}

function mapPendingOrders(data: OrderRow[]): PendingOrderAlert[] {
  return data.map((o) => ({
    id:             o.id,
    from_shop_name: o.from_shop?.shop_name ?? EMPTY_SHOP_NAME,
    to_shop_name:   o.to_shop?.shop_name   ?? EMPTY_SHOP_NAME,
    total_amount:   o.total_amount,
    created_at:     o.created_at,
  }));
}

// ─── Context ──────────────────────────────────────────────────────────────────

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function useNotifications(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider');
  return ctx;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { ownedShopId, isAdmin } = useAuth();
  const { t } = useLang();

  const [lowStockItems,  setLowStockItems]  = useState<StockAlert[]>([]);
  const [outOfStockItems,setOutOfStockItems] = useState<StockAlert[]>([]);
  const [pendingOrders,  setPendingOrders]   = useState<PendingOrderAlert[]>([]);
  const [loading,        setLoading]         = useState(false);
  const [newOrderToast,  setNewOrderToast]   = useState<NewOrderToast | null>(null);

  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Dismiss toast ────────────────────────────────────────────────────────
  const dismissToast = useCallback(() => {
    setNewOrderToast(null);
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
  }, []);

  // ── Show toast for a new incoming order ──────────────────────────────────
  const showNewOrderToast = useCallback((toast: NewOrderToast) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setNewOrderToast(toast);
    toastTimerRef.current = setTimeout(() => {
      setNewOrderToast(null);
      toastTimerRef.current = null;
    }, TOAST_DURATION_MS);
  }, []);

  // ── Fetch all alerts (polling fallback + initial load) ───────────────────
  const fetchAlerts = useCallback(async () => {
    if (!isAdmin && !ownedShopId) return;

    setLoading(true);
    try {
      // ── Stock alerts ─────────────────────────────────────────────────────
      let stockQuery = supabase
        .from('products')
        .select('id, product_name, product_code, quantity, shop_id')
        .lte('quantity', LOW_STOCK_THRESHOLD);

      if (!isAdmin && ownedShopId) {
        stockQuery = stockQuery.eq('shop_id', ownedShopId);
      }

      const { data: stockData } = await stockQuery
        .order('quantity', { ascending: true })
        .returns<ProductRow[]>();

      const products: ProductRow[] = stockData ?? [];

      // Enrich with shop names
      const shopIds = [...new Set(products.map((s) => s.shop_id))];
      let shopNameMap: Record<number, string> = {};

      if (shopIds.length > 0) {
        const { data: shopsData } = await supabase
          .from('shops')
          .select('id, shop_name')
          .in('id', shopIds)
          .returns<ShopLookup[]>();

        shopNameMap = buildShopNameMap(shopsData ?? []);
      }

      const enriched: StockAlert[] = products.map((p) => ({
        ...p,
        shop_name: shopNameMap[p.shop_id] ?? EMPTY_SHOP_NAME,
      }));

      setOutOfStockItems(enriched.filter((s) => s.quantity === 0));
      setLowStockItems(enriched.filter((s) => s.quantity > 0 && s.quantity <= LOW_STOCK_THRESHOLD));

      // ── Pending orders ────────────────────────────────────────────────────
      let ordersQuery = supabase
        .from('orders')
        .select(`
          id,
          total_amount,
          created_at,
          from_shop:shops!orders_from_shop_id_fkey(shop_name),
          to_shop:shops!orders_to_shop_id_fkey(shop_name)
        `)
        .eq('status', 'pending');

      if (!isAdmin && ownedShopId) {
        ordersQuery = ordersQuery.eq('to_shop_id', ownedShopId);
      }

      const { data: ordersData } = await ordersQuery
        .order('created_at', { ascending: false })
        .returns<OrderRow[]>();

      setPendingOrders(mapPendingOrders(ordersData ?? []));

    } catch (err) {
      console.error('[NotificationContext] fetchAlerts error:', err);
    } finally {
      setLoading(false);
    }
  }, [ownedShopId, isAdmin]);

  // ── Initial load + polling fallback (60s) ────────────────────────────────
  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchAlerts]);

  // ── Realtime: new orders ──────────────────────────────────────────────────
  // Subscribes to INSERT events on the orders table filtered to this shop.
  // When a new order arrives: refresh the pending list + show a toast.
  // Falls back gracefully if the subscription fails — polling still runs.
  useEffect(() => {
    if (!ownedShopId || isAdmin) return;

    const channel = supabase
      .channel(`orders_realtime_${ownedShopId}`)
      .on(
        'postgres_changes',
        {
          event:  'INSERT',
          schema: 'public',
          table:  'orders',
          filter: `to_shop_id=eq.${ownedShopId}`,
        },
        async (payload) => {
          // Re-fetch to get full order with shop names
          const { data } = await supabase
            .from('orders')
            .select(`
              id,
              total_amount,
              created_at,
              from_shop:shops!orders_from_shop_id_fkey(shop_name),
              to_shop:shops!orders_to_shop_id_fkey(shop_name)
            `)
            .eq('id', payload.new.id)
            .eq('status', 'pending')
            .returns<OrderRow[]>()
            .maybeSingle();

          if (data) {
            const newOrder = data as unknown as OrderRow;
            // Add to pending list
            setPendingOrders(prev => [
              {
                id:             newOrder.id,
                from_shop_name: newOrder.from_shop?.shop_name ?? EMPTY_SHOP_NAME,
                to_shop_name:   newOrder.to_shop?.shop_name   ?? EMPTY_SHOP_NAME,
                total_amount:   newOrder.total_amount,
                created_at:     newOrder.created_at,
              },
              ...prev,
            ]);
            // Show toast
            showNewOrderToast({
              id:             newOrder.id,
              from_shop_name: newOrder.from_shop?.shop_name ?? EMPTY_SHOP_NAME,
              total_amount:   newOrder.total_amount,
            });
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`[Realtime] orders channel subscribed for shop ${ownedShopId}`);
        }
      });

    return () => { supabase.removeChannel(channel); };
  }, [ownedShopId, isAdmin, showNewOrderToast]);

  // ── Realtime: stock changes ───────────────────────────────────────────────
  // Re-fetches stock alerts whenever a product quantity changes in this shop.
  // Uses UPDATE events on the products table filtered to this shop_id.
  useEffect(() => {
    if (!ownedShopId || isAdmin) return;

    const channel = supabase
      .channel(`products_stock_${ownedShopId}`)
      .on(
        'postgres_changes',
        {
          event:  'UPDATE',
          schema: 'public',
          table:  'products',
          filter: `shop_id=eq.${ownedShopId}`,
        },
        () => {
          // Re-fetch all stock alerts on any product update
          fetchAlerts();
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [ownedShopId, isAdmin, fetchAlerts]);

  // ── Cleanup toast timer on unmount ───────────────────────────────────────
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const totalCount = useMemo(
    () => lowStockItems.length + outOfStockItems.length + pendingOrders.length,
    [lowStockItems, outOfStockItems, pendingOrders]
  );

  const value = useMemo<NotificationContextValue>(
    () => ({
      lowStockItems,
      outOfStockItems,
      pendingOrders,
      totalCount,
      loading,
      refresh:       fetchAlerts,
      newOrderToast,
      dismissToast,
    }),
    [lowStockItems, outOfStockItems, pendingOrders, totalCount, loading,
     fetchAlerts, newOrderToast, dismissToast]
  );

  // ── Toast UI — rendered at context level so it appears on every page ─────
  const ToastUI = newOrderToast ? (
    <div
      dir="rtl"
      style={{ position: 'fixed', top: '1rem', left: '50%', transform: 'translateX(-50%)', zIndex: 9999, width: '100%', maxWidth: '360px', padding: '0 1rem' }}
    >
      <div
        role="alert"
        aria-live="assertive"
        style={{
          background: 'linear-gradient(135deg, #065f46, #047857)',
          border: '1px solid #10b981',
          borderRadius: '16px',
          padding: '14px 16px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '12px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          color: '#fff',
        }}
      >
        {/* Bell icon */}
        <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: '10px', padding: '8px', flexShrink: 0 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
        </div>
        {/* Text */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontWeight: 800, fontSize: '13px', marginBottom: '3px' }}>
            {t('New Order Received!', 'طلب جديد وصل!')}
          </p>
          <p style={{ fontSize: '11px', opacity: 0.85, lineHeight: 1.5 }}>
            {t('From', 'من')} <strong>{newOrderToast.from_shop_name}</strong>
            {' · '}
            {newOrderToast.total_amount.toLocaleString()} {t('SAR', 'ر.س')}
          </p>
        </div>
        {/* Dismiss */}
        <button
          onClick={dismissToast}
          aria-label={t('Dismiss', 'إغلاق')}
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', padding: '2px', flexShrink: 0, lineHeight: 1 }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    </div>
  ) : null;

  return (
    <NotificationContext.Provider value={value}>
      {ToastUI}
      {children}
    </NotificationContext.Provider>
  );
}
