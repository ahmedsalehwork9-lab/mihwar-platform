import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  ReactNode,
} from 'react';
import { supabase } from '../pages/lib/supabase';
import { useAuth } from './AuthContext';

// ─── Constants ────────────────────────────────────────────────────────────────

const EMPTY_SHOP_NAME = '—';
const LOW_STOCK_THRESHOLD = 5;
const REFRESH_INTERVAL_MS = 60_000;

// ─── Types ────────────────────────────────────────────────────────────────────

export type StockAlert = {
  id: number;
  part_name: string;
  part_number: string;
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

export type NotificationContextValue = {
  lowStockItems: StockAlert[];
  outOfStockItems: StockAlert[];
  pendingOrders: PendingOrderAlert[];
  totalCount: number;
  loading: boolean;
  refresh: () => void;
};

type ShopLookup = {
  id: number;
  shop_name: string;
};

type ProductRow = {
  id: number;
  part_name: string;
  part_number: string;
  quantity: number;
  shop_id: number;
};

type OrderRow = {
  id: number;
  total_amount: number;
  created_at: string;
  from_shop: {
    shop_name: string;
  } | null;
  to_shop: {
    shop_name: string;
  } | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildShopNameMap(data: ShopLookup[]): Record<number, string> {
  const map: Record<number, string> = {};
  data.forEach((s) => {
    map[s.id] = s.shop_name;
  });
  return map;
}

function mapPendingOrders(data: OrderRow[]): PendingOrderAlert[] {
  return data.map((o) => ({
    id: o.id,
    from_shop_name: o.from_shop?.shop_name ?? EMPTY_SHOP_NAME,
    to_shop_name: o.to_shop?.shop_name ?? EMPTY_SHOP_NAME,
    total_amount: o.total_amount,
    created_at: o.created_at,
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

  const [lowStockItems, setLowStockItems] = useState<StockAlert[]>([]);
  const [outOfStockItems, setOutOfStockItems] = useState<StockAlert[]>([]);
  const [pendingOrders, setPendingOrders] = useState<PendingOrderAlert[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchAlerts = useCallback(async () => {
    if (!isAdmin && !ownedShopId) return;

    setLoading(true);
    try {
      // ── Stock alerts ─────────────────────────────────────────────────────
      let stockQuery = supabase
        .from('products')
        .select('id, part_name, part_number, quantity, shop_id')
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
        
        const shops: ShopLookup[] = shopsData ?? [];
        shopNameMap = buildShopNameMap(shops);
      }

      const enriched: StockAlert[] = products.map((p) => ({
        ...p,
        shop_name: shopNameMap[p.shop_id] ?? EMPTY_SHOP_NAME,
      }));

      setOutOfStockItems(enriched.filter((s) => s.quantity === 0));
      setLowStockItems(enriched.filter((s) => s.quantity > 0 && s.quantity <= LOW_STOCK_THRESHOLD));

      // ── Pending orders ─────────────────────────────────────────────────────
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

      const orders: OrderRow[] = ordersData ?? [];
      setPendingOrders(mapPendingOrders(orders));
      
    } catch (err) {
      console.error('[NotificationContext] fetchAlerts error:', err);
    } finally {
      setLoading(false);
    }
  }, [ownedShopId, isAdmin]);

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchAlerts]);

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
      refresh: fetchAlerts,
    }),
    [lowStockItems, outOfStockItems, pendingOrders, totalCount, loading, fetchAlerts]
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}