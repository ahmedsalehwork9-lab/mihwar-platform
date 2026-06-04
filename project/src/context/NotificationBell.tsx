import { useState, useRef, useEffect, memo } from 'react';
import {
  Bell,
  X,
  Package,
  AlertTriangle,
  ShoppingCart,
  RefreshCw,
  ChevronRight,
} from 'lucide-react';
import { useNotifications } from '../context/NotificationContext';
import { useLang } from '../context/LanguageContext';

// ─── Types ────────────────────────────────────────────────────────────────────

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
      <div className="space-y-0.5 px-2">
        {items}
      </div>
    )}
  </div>
));

// ─── Main Component ───────────────────────────────────────────────────────────

export default function NotificationBell() {
  const { t, isRTL } = useLang() as any;
  const { lowStockItems, outOfStockItems, pendingOrders, totalCount, loading, refresh } = useNotifications();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef   = useRef<HTMLButtonElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const badge = totalCount > 99 ? '99+' : totalCount;

  return (
    <div className="relative" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Bell button */}
      <button
        ref={btnRef}
        onClick={() => { setOpen(v => !v); if (!open) refresh(); }}
        className="relative w-9 h-9 flex items-center justify-center rounded-xl bg-slate-800 border border-slate-700 text-slate-400 hover:text-white hover:border-slate-600 active:scale-95 transition-all"
        aria-label="Notifications"
      >
        <Bell size={16} />
        {totalCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] font-black min-w-[18px] h-[18px] rounded-full flex items-center justify-center px-1 shadow-sm tabular-nums leading-none">
            {badge}
          </span>
        )}
      </button>

      {/* Panel */}
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
              {totalCount > 0 && (
                <span className="bg-red-500/20 text-red-400 border border-red-500/30 text-[10px] font-bold px-1.5 py-0.5 rounded-full tabular-nums">
                  {totalCount}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={refresh}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-500 hover:text-white active:scale-90 transition-all"
                title="Refresh"
              >
                <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              </button>
              <button
                onClick={() => setOpen(false)}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-500 hover:text-white active:scale-90 transition-all"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Scrollable body */}
          <div className="max-h-[380px] overflow-y-auto overscroll-contain py-2"
            style={{ WebkitOverflowScrolling: 'touch' } as any}
          >
            {loading && totalCount === 0 ? (
              <div className="flex items-center justify-center py-8 text-slate-500 gap-2">
                <RefreshCw size={14} className="animate-spin" />
                <span className="text-xs">{t('Loading...', 'جاري التحميل...')}</span>
              </div>
            ) : totalCount === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-3 opacity-40">
                <Bell size={32} className="text-slate-500" />
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
                        <p className="text-white text-xs font-semibold truncate">{item.part_name}</p>
                        <p className="text-slate-500 text-[10px] font-mono">{item.part_number}</p>
                        {item.shop_name && <p className="text-slate-600 text-[10px]">{item.shop_name}</p>}
                      </div>
                      <span className="text-[10px] font-bold text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-full shrink-0 mr-2 tabular-nums">
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
                        <p className="text-white text-xs font-semibold truncate">{item.part_name}</p>
                        <p className="text-slate-500 text-[10px] font-mono">{item.part_number}</p>
                        {item.shop_name && <p className="text-slate-600 text-[10px]">{item.shop_name}</p>}
                      </div>
                      <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full shrink-0 mr-2 tabular-nums">
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
                      <span className="text-[10px] font-bold text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-full shrink-0 mr-2 tabular-nums">
                        {order.total_amount.toLocaleString()}
                      </span>
                    </div>
                  ))}
                />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
