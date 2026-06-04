import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  ReactNode,
} from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

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

// ─── Context ──────────────────────────────────────────────────────────────────

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function useNotifications(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider');
  return ctx;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { ownedShopId, isAdmin } = useAuth() as any;

  const [lowStockItems, setLowStockItems]   = useState<StockAlert[]>([]);
  const [outOfStockItems, setOutOfStockItems] = useState<StockAlert[]>([]);
  const [pendingOrders, setPendingOrders]   = useState<PendingOrderAlert[]>([]);
  const [loading, setLoading]               = useState(false);

  const fetchAlerts = useCallback(async () => {
    // Need at least a shop or admin access
    if (!isAdmin && !ownedShopId) return;

    setLoading(true);
    try {
      // ── Stock alerts (only for own shop or all shops if admin) ────────────
      let stockQuery = supabase
        .from('products')
        .select('id, part_name, part_number, quantity, shop_id')
        .lte('quantity', 5);

      if (!isAdmin && ownedShopId) {
        stockQuery = stockQuery.eq('shop_id', ownedShopId);
      }

      const { data: stockData } = await stockQuery.order('quantity', { ascending: true });
      const stocks = (stockData || []) as StockAlert[];

      // Enrich with shop names
      const shopIds = [...new Set(stocks.map(s => s.shop_id))];
      let shopNameMap: Record<number, string> = {};
      if (shopIds.length > 0) {
        const { data: shopsData } = await supabase
          .from('shops')
          .select('id, shop_name')
          .in('id', shopIds);
        (shopsData || []).forEach((s: any) => { shopNameMap[s.id] = s.shop_name; });
      }

      const enriched = stocks.map(s => ({ ...s, shop_name: shopNameMap[s.shop_id] ?? '—' }));
      setOutOfStockItems(enriched.filter(s => s.quantity === 0));
      setLowStockItems(enriched.filter(s => s.quantity > 0 && s.quantity <= 5));

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
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (!isAdmin && ownedShopId) {
        // Show pending orders directed TO this shop (need to approve)
        ordersQuery = ordersQuery.eq('to_shop_id', ownedShopId);
      }

      const { data: ordersData } = await ordersQuery;

      setPendingOrders(
        ((ordersData || []) as any[]).map(o => ({
          id: o.id,
          from_shop_name: o.from_shop?.shop_name ?? '—',
          to_shop_name:   o.to_shop?.shop_name ?? '—',
          total_amount:   o.total_amount,
          created_at:     o.created_at,
        }))
      );
    } catch (err) {
      console.error('[NotificationContext] fetchAlerts error:', err);
    } finally {
      setLoading(false);
    }
  }, [ownedShopId, isAdmin]);

  useEffect(() => {
    fetchAlerts();
    // Refresh every 60 seconds
    const interval = setInterval(fetchAlerts, 60_000);
    return () => clearInterval(interval);
  }, [fetchAlerts]);

  const totalCount = useMemo(
    () => lowStockItems.length + outOfStockItems.length + pendingOrders.length,
    [lowStockItems, outOfStockItems, pendingOrders]
  );

  const value = useMemo<NotificationContextValue>(
    () => ({ lowStockItems, outOfStockItems, pendingOrders, totalCount, loading, refresh: fetchAlerts }),
    [lowStockItems, outOfStockItems, pendingOrders, totalCount, loading, fetchAlerts]
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}
