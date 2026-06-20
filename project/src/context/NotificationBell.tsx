import { useState, useRef, useEffect, useCallback, memo } from 'react';
import {
  Bell, X, Package, AlertTriangle, ShoppingCart,
  RefreshCw, CheckCheck, Circle, CheckCircle2,
} from 'lucide-react';
import { supabase } from '../pages/lib/supabase';
import { useNotifications } from '../context/NotificationContext';
import { useLang } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';

// ─── Types ────────────────────────────────────────────────────────────────────

type DBNotification = {
  id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
};

type SectionProps = {
  title: string;
  icon: React.ReactNode;
  iconBg: string;
  items: React.ReactNode[];
  emptyLabel: string;
};

// ─── Section ──────────────────────────────────────────────────────────────────

const Section = memo(({ title, icon, iconBg, items, emptyLabel }: SectionProps) => (
  <div className="mb-1">
    <div className="flex items-center gap-2 px-4 py-2">
      <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${iconBg}`}>
        {icon}
      </div>
      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">{title}</span>
      <span className="mr-auto text-[10px] bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded-full tabular-nums">
        {items.length}
      </span>
    </div>
    {items.length === 0 ? (
      <p className="text-[11px] text-slate-600 px-4 pb-2">{emptyLabel}</p>
    ) : (
      <div className="space-y-0.5 px-2">{items}</div>
    )}
  </div>
));

// ─── Main Component ───────────────────────────────────────────────────────────

export default function NotificationBell() {
  const { t, isRTL } = useLang() as any;
  const { ownedShopId } = useAuth();
  const { lowStockItems, outOfStockItems, pendingOrders, totalCount, loading, refresh } = useNotifications();

  const [open, setOpen]                   = useState(false);
  const [dbNotifs, setDbNotifs]           = useState<DBNotification[]>([]);
  const [dbLoading, setDbLoading]         = useState(false);
  const [markingAll, setMarkingAll]       = useState(false);
  const [activeTab, setActiveTab]         = useState<'alerts' | 'inbox'>('alerts');
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef   = useRef<HTMLButtonElement>(null);

  // ── Fetch DB notifications ─────────────────────────────────────────────────
  const fetchDbNotifs = useCallback(async () => {
    if (!ownedShopId) return;
    setDbLoading(true);
    const { data } = await supabase
      .from('notifications')
      .select('id, title, message, type, is_read, created_at')
      .eq('shop_id', ownedShopId)
      .order('created_at', { ascending: false })
      .limit(30);
    setDbNotifs((data as DBNotification[]) ?? []);
    setDbLoading(false);
  }, [ownedShopId]);

  // ── Mark single notification as read ──────────────────────────────────────
  const markRead = useCallback(async (id: string) => {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    setDbNotifs(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  }, []);

  // ── Mark all as read ───────────────────────────────────────────────────────
  const markAllRead = useCallback(async () => {
    if (!ownedShopId) return;
    setMarkingAll(true);
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('shop_id', ownedShopId)
      .eq('is_read', false);
    setDbNotifs(prev => prev.map(n => ({ ...n, is_read: true })));
    setMarkingAll(false);
  }, [ownedShopId]);

  const unreadCount    = dbNotifs.filter(n => !n.is_read).length;
  const totalBadge     = totalCount + unreadCount;
  const badgeLabel     = totalBadge > 99 ? '99+' : totalBadge;

  // ── Close on outside click ─────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        btnRef.current   && !btnRef.current.contains(e.target as Node)
      ) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // ── On open: refresh both sources ─────────────────────────────────────────
  const handleOpen = useCallback(() => {
    const next = !open;
    setOpen(next);
    if (next) { refresh(); fetchDbNotifs(); }
  }, [open, refresh, fetchDbNotifs]);

  // ── Relative time ─────────────────────────────────────────────────────────
  function relativeTime(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const mins  = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days  = Math.floor(diff / 86400000);
    if (isRTL) {
      if (mins  < 1)   return 'الآن';
      if (mins  < 60)  return `منذ ${mins} د`;
      if (hours < 24)  return `منذ ${hours} س`;
      return `منذ ${days} يوم`;
    }
    if (mins  < 1)   return 'Just now';
    if (mins  < 60)  return `${mins}m ago`;
    if (hours < 24)  return `${hours}h ago`;
    return `${days}d ago`;
  }

  const typeIcon: Record<string, React.ReactNode> = {
    new_order:  <ShoppingCart size={12} className="text-blue-400" />,
    low_stock:  <AlertTriangle size={12} className="text-amber-400" />,
    out_stock:  <Package size={12} className="text-red-400" />,
    default:    <Bell size={12} className="text-slate-400" />,
  };

  return (
    <div className="relative" dir={isRTL ? 'rtl' : 'ltr'}>

      {/* ── Bell button ── */}
      <button
        ref={btnRef}
        onClick={handleOpen}
        className="relative w-9 h-9 flex items-center justify-center rounded-xl bg-slate-800 border border-slate-700 text-slate-400 hover:text-white hover:border-slate-600 active:scale-95 transition-all"
        aria-label="Notifications"
      >
        <Bell size={16} />
        {totalBadge > 0 && (
          <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] font-black min-w-[18px] h-[18px] rounded-full flex items-center justify-center px-1 shadow-sm tabular-nums leading-none">
            {badgeLabel}
          </span>
        )}
      </button>

      {/* ── Panel ── */}
      {open && (
        <div
          ref={panelRef}
          className={`absolute top-full mt-2 z-[60] w-80 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden ${isRTL ? 'left-0' : 'right-0'}`}
        >
          {/* Panel header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Bell size={15} className="text-slate-400" />
              <h3 className="text-white font-black text-sm">
                {t('Notifications', 'الإشعارات')}
              </h3>
              {totalBadge > 0 && (
                <span className="bg-red-500/20 text-red-400 border border-red-500/30 text-[10px] font-bold px-1.5 py-0.5 rounded-full tabular-nums">
                  {totalBadge}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => { refresh(); fetchDbNotifs(); }}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-500 hover:text-white active:scale-90 transition-all">
                <RefreshCw size={13} className={(loading || dbLoading) ? 'animate-spin' : ''} />
              </button>
              <button onClick={() => setOpen(false)}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-500 hover:text-white active:scale-90 transition-all">
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-slate-800">
            <button
              onClick={() => setActiveTab('alerts')}
              className={`flex-1 py-2.5 text-[11px] font-bold uppercase tracking-wide transition-colors ${activeTab === 'alerts' ? 'text-white border-b-2 border-blue-500' : 'text-slate-500 hover:text-slate-300'}`}
            >
              {t('Alerts', 'التنبيهات')}
              {totalCount > 0 && <span className="mr-1 bg-red-500/20 text-red-400 text-[9px] px-1 py-0.5 rounded-full">{totalCount}</span>}
            </button>
            <button
              onClick={() => setActiveTab('inbox')}
              className={`flex-1 py-2.5 text-[11px] font-bold uppercase tracking-wide transition-colors ${activeTab === 'inbox' ? 'text-white border-b-2 border-blue-500' : 'text-slate-500 hover:text-slate-300'}`}
            >
              {t('Inbox', 'الوارد')}
              {unreadCount > 0 && <span className="mr-1 bg-blue-500/20 text-blue-400 text-[9px] px-1 py-0.5 rounded-full">{unreadCount}</span>}
            </button>
          </div>

          {/* ── ALERTS TAB ── */}
          {activeTab === 'alerts' && (
            <div className="max-h-[360px] overflow-y-auto overscroll-contain py-2" style={{ WebkitOverflowScrolling: 'touch' } as any}>
              {loading && totalCount === 0 ? (
                <div className="flex items-center justify-center py-8 text-slate-500 gap-2">
                  <RefreshCw size={14} className="animate-spin" />
                  <span className="text-xs">{t('Loading...', 'جاري التحميل...')}</span>
                </div>
              ) : totalCount === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 gap-3 opacity-40">
                  <CheckCircle2 size={32} className="text-slate-500" />
                  <p className="text-xs text-slate-400">{t('No alerts', 'لا توجد تنبيهات')}</p>
                </div>
              ) : (
                <>
                  {/* Out of stock */}
                  <Section
                    title={t('Out of Stock', 'نفد المخزون')}
                    icon={<Package size={12} className="text-red-400" />}
                    iconBg="bg-red-500/15 border border-red-500/20"
                    emptyLabel={t('None', 'لا يوجد')}
                    items={outOfStockItems.map(item => (
                      <div key={`oos-${item.id}`} className="flex items-center justify-between rounded-xl px-3 py-2 hover:bg-slate-800/60 transition-colors">
                        <div className="min-w-0 flex-1">
                          <p className="text-white text-xs font-semibold truncate">{item.product_name ?? (item as any).part_name}</p>
                          <p className="text-slate-500 text-[10px] font-mono">{item.product_code ?? (item as any).part_number}</p>
                          {item.shop_name && <p className="text-slate-600 text-[10px]">{item.shop_name}</p>}
                        </div>
                        <span className="text-[10px] font-bold text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-full shrink-0 ms-2 tabular-nums">
                          {t('Out', 'نفد')}
                        </span>
                      </div>
                    ))}
                  />
                  <div className="border-t border-slate-800/60 mx-4 my-1" />
                  {/* Low stock */}
                  <Section
                    title={t('Low Stock', 'مخزون منخفض')}
                    icon={<AlertTriangle size={12} className="text-amber-400" />}
                    iconBg="bg-amber-500/15 border border-amber-500/20"
                    emptyLabel={t('None', 'لا يوجد')}
                    items={lowStockItems.map(item => (
                      <div key={`ls-${item.id}`} className="flex items-center justify-between rounded-xl px-3 py-2 hover:bg-slate-800/60 transition-colors">
                        <div className="min-w-0 flex-1">
                          <p className="text-white text-xs font-semibold truncate">{item.product_name ?? (item as any).part_name}</p>
                          <p className="text-slate-500 text-[10px] font-mono">{item.product_code ?? (item as any).part_number}</p>
                          {item.shop_name && <p className="text-slate-600 text-[10px]">{item.shop_name}</p>}
                        </div>
                        <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full shrink-0 ms-2 tabular-nums">
                          {item.quantity}
                        </span>
                      </div>
                    ))}
                  />
                  <div className="border-t border-slate-800/60 mx-4 my-1" />
                  {/* Pending orders */}
                  <Section
                    title={t('Pending Orders', 'طلبات معلقة')}
                    icon={<ShoppingCart size={12} className="text-blue-400" />}
                    iconBg="bg-blue-500/15 border border-blue-500/20"
                    emptyLabel={t('None', 'لا يوجد')}
                    items={pendingOrders.map(order => (
                      <div key={`po-${order.id}`} className="flex items-center justify-between rounded-xl px-3 py-2 hover:bg-slate-800/60 transition-colors">
                        <div className="min-w-0 flex-1">
                          <p className="text-white text-xs font-semibold">
                            {t('Order', 'طلب')} #{String(order.id).padStart(5, '0')}
                          </p>
                          <p className="text-slate-500 text-[10px] truncate">
                            {order.from_shop_name} → {order.to_shop_name}
                          </p>
                        </div>
                        <span className="text-[10px] font-bold text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-full shrink-0 ms-2 tabular-nums">
                          {order.total_amount.toLocaleString()}
                        </span>
                      </div>
                    ))}
                  />
                </>
              )}
            </div>
          )}

          {/* ── INBOX TAB ── */}
          {activeTab === 'inbox' && (
            <>
              {/* Mark all read button */}
              {unreadCount > 0 && (
                <div className="px-4 py-2 border-b border-slate-800 flex justify-end">
                  <button
                    onClick={markAllRead}
                    disabled={markingAll}
                    className="flex items-center gap-1.5 text-[10px] font-bold text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-50 active:scale-95"
                  >
                    {markingAll
                      ? <RefreshCw size={11} className="animate-spin" />
                      : <CheckCheck size={11} />
                    }
                    {t('Mark all as read', 'تحديد الكل كمقروء')}
                  </button>
                </div>
              )}

              <div className="max-h-[340px] overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' } as any}>
                {dbLoading ? (
                  <div className="flex items-center justify-center py-8 text-slate-500 gap-2">
                    <RefreshCw size={14} className="animate-spin" />
                    <span className="text-xs">{t('Loading...', 'جاري التحميل...')}</span>
                  </div>
                ) : dbNotifs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-3 opacity-40">
                    <Bell size={32} className="text-slate-500" />
                    <p className="text-xs text-slate-400">{t('No notifications', 'لا توجد إشعارات')}</p>
                  </div>
                ) : (
                  <div className="py-1">
                    {dbNotifs.map(n => (
                      <button
                        key={n.id}
                        onClick={() => !n.is_read && markRead(n.id)}
                        className={`w-full text-start flex items-start gap-3 px-4 py-3 hover:bg-slate-800/60 transition-colors ${!n.is_read ? 'bg-blue-500/5' : ''}`}
                      >
                        {/* Type icon */}
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${!n.is_read ? 'bg-blue-500/15 border border-blue-500/20' : 'bg-slate-800 border border-slate-700'}`}>
                          {typeIcon[n.type] ?? typeIcon.default}
                        </div>
                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className={`text-xs font-bold leading-snug ${n.is_read ? 'text-slate-400' : 'text-white'}`}>
                              {n.title}
                            </p>
                            {/* Read indicator */}
                            <span className="shrink-0 mt-0.5">
                              {n.is_read
                                ? <CheckCircle2 size={11} className="text-slate-700" />
                                : <Circle size={11} className="text-blue-400 fill-blue-400" />
                              }
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-2">{n.message}</p>
                          <p className="text-[9px] text-slate-600 mt-1 font-mono">{relativeTime(n.created_at)}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
