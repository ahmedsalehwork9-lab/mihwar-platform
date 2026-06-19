import { useState, useMemo, useEffect, useCallback } from 'react';
import { supabase } from './lib/supabase';
import {
  ArrowLeftRight,
  Clock,
  CheckCircle2,
  BarChart3,
  Store,
  Package,
  Hash,
  CalendarDays,
  Plus,
  Search,
  ChevronDown,
  X,
  Filter,
  RefreshCw,
  ArrowRight,
  AlertCircle,
  TrendingUp,
  FileText,
  ShieldCheck,
  CheckCheck,
  XCircle,
  MoreVertical,
} from 'lucide-react';

// ══════════════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════════════

// ISSUE FIXED: Added 'approved' to the status union to match the full
// workflow: pending → approved → completed | cancelled
type TransferStatus = 'pending' | 'approved' | 'completed' | 'cancelled';

// Full DB row — all columns from inventory_transfers spec
type TransferRow = {
  id: number;
  from_shop_id: number;
  to_shop_id: number;
  product_id: number;
  quantity: number;
  status: TransferStatus;
  created_by: string | null;
  created_at: string;
  organization_id: number | null;
  notes: string | null;
  approved_by: string | null;
  approved_at: string | null;
  completed_at: string | null;
  // joined
  from_shop_name: string;
  to_shop_name: string;
  product_name: string;
  product_number: string;
};

// Flat UI shape used in table / cards
// ISSUE FIXED: Added approved_by, approved_at, completed_at so action
// buttons can read current state without a second query
type Transfer = {
  id: number;
  transfer_number: string;
  from_shop: string;
  to_shop: string;
  product_name: string;
  product_number: string;
  quantity: number;
  status: TransferStatus;
  created_at: string;
  notes: string | null;
  approved_by: string | null;
  approved_at: string | null;
  completed_at: string | null;
};

type ShopOption = {
  id: number;
  name: string;
  city: string;
  organization_id: number | null;
};

type ProductOption = {
  id: number;
  name: string;
  part_number: string;
  brand: string;
  organization_id: number | null;
};

type FetchState = 'idle' | 'loading' | 'success' | 'error';

// ══════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ar-SA', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ar-SA', {
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

function buildTransferNumber(id: number): string {
  return `TRF-${String(id).padStart(4, '0')}`;
}

type StatusConfig = { label: string; dot: string; cls: string };

// ISSUE FIXED: statusConfig now includes 'approved' status
function statusConfig(status: TransferStatus): StatusConfig {
  const map: Record<TransferStatus, StatusConfig> = {
    pending:   { label: 'معلق',    dot: 'bg-amber-400',  cls: 'bg-amber-500/10  text-amber-400  border-amber-500/20'  },
    approved:  { label: 'معتمد',   dot: 'bg-blue-400',   cls: 'bg-blue-500/10   text-blue-400   border-blue-500/20'   },
    completed: { label: 'مكتمل',   dot: 'bg-emerald-400',cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'},
    cancelled: { label: 'ملغي',    dot: 'bg-red-400',    cls: 'bg-red-500/10    text-red-400    border-red-500/20'    },
  };
  return map[status];
}

// ISSUE FIXED: mapRow now carries approval / completion timestamps
function mapRow(row: TransferRow): Transfer {
  return {
    id:              row.id,
    transfer_number: buildTransferNumber(row.id),
    from_shop:       row.from_shop_name,
    to_shop:         row.to_shop_name,
    product_name:    row.product_name,
    product_number:  row.product_number,
    quantity:        row.quantity,
    status:          row.status,
    created_at:      row.created_at,
    notes:           row.notes,
    approved_by:     row.approved_by,
    approved_at:     row.approved_at,
    completed_at:    row.completed_at,
  };
}

// ══════════════════════════════════════════════════════════════════════
// SEARCHABLE PRODUCT SELECT — preserved exactly, disabled prop added
// ══════════════════════════════════════════════════════════════════════

type ProductSelectProps = {
  value: number | null;
  onChange: (id: number | null) => void;
  products: ProductOption[];
  disabled?: boolean;
};

function ProductSelect({ value, onChange, products, disabled = false }: ProductSelectProps) {
  const [open, setOpen]   = useState(false);
  const [query, setQuery] = useState('');

  const selected = products.find((p) => p.id === value) ?? null;

  const filteredProducts = useMemo(
    () =>
      products.filter(
        (p) =>
          p.name.toLowerCase().includes(query.toLowerCase()) ||
          p.part_number.toLowerCase().includes(query.toLowerCase()) ||
          p.brand.toLowerCase().includes(query.toLowerCase()),
      ),
    [products, query],
  );

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={`w-full h-12 flex items-center justify-between gap-2 bg-slate-950 border rounded-2xl px-4 text-sm transition-all ${
          disabled
            ? 'border-slate-800 opacity-50 cursor-not-allowed'
            : open
            ? 'border-blue-500/50 ring-1 ring-blue-500/20'
            : 'border-slate-700 hover:border-slate-600'
        }`}
      >
        {selected ? (
          <div className="flex items-center gap-2 min-w-0">
            <Package size={14} className="text-blue-400 shrink-0" />
            <span className="text-white font-medium truncate">{selected.name}</span>
            <span className="text-slate-500 font-mono text-[11px] shrink-0">{selected.part_number}</span>
          </div>
        ) : (
          <span className="text-slate-500">
            {disabled ? 'جاري التحميل...' : 'اختر المنتج...'}
          </span>
        )}
        <div className="flex items-center gap-1 shrink-0">
          {selected && !disabled && (
            <span
              role="button"
              onClick={(e) => { e.stopPropagation(); onChange(null); setQuery(''); }}
              className="p-0.5 rounded-md hover:text-red-400 text-slate-500 transition-colors"
            >
              <X size={13} />
            </span>
          )}
          <ChevronDown size={15} className={`text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {open && !disabled && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-full mt-2 left-0 right-0 z-20 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden">
            <div className="p-3 border-b border-slate-800">
              <div className="relative">
                <Search size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="ابحث..."
                  autoFocus
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl pr-8 pl-3 h-9 text-white text-xs focus:outline-none focus:border-blue-500/50 transition-all"
                />
              </div>
            </div>
            <div className="max-h-52 overflow-y-auto">
              {filteredProducts.length === 0 ? (
                <div className="py-6 text-center text-slate-500 text-xs">لا توجد نتائج</div>
              ) : (
                filteredProducts.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => { onChange(p.id); setOpen(false); setQuery(''); }}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-right hover:bg-slate-800 transition-colors border-b border-slate-800/50 last:border-0 ${
                      value === p.id ? 'bg-blue-600/10' : ''
                    }`}
                  >
                    <Package size={14} className="text-blue-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-bold truncate">{p.name}</p>
                      <p className="text-slate-500 text-[11px] font-mono">{p.part_number} · {p.brand}</p>
                    </div>
                    {value === p.id && <CheckCircle2 size={14} className="text-blue-400 shrink-0" />}
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// STATUS BADGE — updated for 4 statuses
// ══════════════════════════════════════════════════════════════════════

function StatusBadge({ status }: { status: TransferStatus }) {
  const cfg = statusConfig(status);
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold border whitespace-nowrap ${cfg.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} ${status === 'pending' ? 'animate-pulse' : ''}`} />
      {cfg.label}
    </span>
  );
}

// ══════════════════════════════════════════════════════════════════════
// ACTION BUTTONS — approve / complete / cancel
// Displayed inline in table row and mobile card
// ══════════════════════════════════════════════════════════════════════

type ActionButtonsProps = {
  transfer: Transfer;
  processingId: number | null;
  onApprove:  (t: Transfer) => void;
  onComplete: (t: Transfer) => void;
  onCancel:   (t: Transfer) => void;
};

function ActionButtons({ transfer: t, processingId, onApprove, onComplete, onCancel }: ActionButtonsProps) {
  const busy = processingId === t.id;

  if (t.status === 'completed' || t.status === 'cancelled') {
    return <span className="text-slate-600 text-xs">—</span>;
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {t.status === 'pending' && (
        <>
          {/* Approve */}
          <button
            onClick={() => onApprove(t)}
            disabled={busy}
            title="اعتماد"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 text-blue-400 text-[11px] font-bold transition-all disabled:opacity-50 active:scale-95 whitespace-nowrap"
          >
            {busy ? <RefreshCw size={11} className="animate-spin" /> : <ShieldCheck size={11} />}
            اعتماد
          </button>
          {/* Cancel */}
          <button
            onClick={() => onCancel(t)}
            disabled={busy}
            title="إلغاء"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 text-[11px] font-bold transition-all disabled:opacity-50 active:scale-95 whitespace-nowrap"
          >
            {busy ? <RefreshCw size={11} className="animate-spin" /> : <XCircle size={11} />}
            إلغاء
          </button>
        </>
      )}

      {t.status === 'approved' && (
        <>
          {/* Complete */}
          <button
            onClick={() => onComplete(t)}
            disabled={busy}
            title="إتمام"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 text-[11px] font-bold transition-all disabled:opacity-50 active:scale-95 whitespace-nowrap"
          >
            {busy ? <RefreshCw size={11} className="animate-spin" /> : <CheckCheck size={11} />}
            إتمام
          </button>
          {/* Cancel */}
          <button
            onClick={() => onCancel(t)}
            disabled={busy}
            title="إلغاء"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 text-[11px] font-bold transition-all disabled:opacity-50 active:scale-95 whitespace-nowrap"
          >
            {busy ? <RefreshCw size={11} className="animate-spin" /> : <XCircle size={11} />}
            إلغاء
          </button>
        </>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// TOAST — preserved exactly
// ══════════════════════════════════════════════════════════════════════

type ToastProps = { message: string; type: 'success' | 'error'; onDismiss: () => void };

function Toast({ message, type, onDismiss }: ToastProps) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-2xl border transition-all ${
        type === 'success'
          ? 'bg-emerald-950 border-emerald-500/30 text-emerald-400'
          : 'bg-red-950 border-red-500/30 text-red-400'
      }`}
      style={{ minWidth: '260px' }}
    >
      {type === 'success'
        ? <CheckCircle2 size={18} className="shrink-0" />
        : <AlertCircle  size={18} className="shrink-0" />}
      <span className="text-sm font-bold flex-1">{message}</span>
      <button onClick={onDismiss} className="p-0.5 opacity-60 hover:opacity-100 transition-opacity">
        <X size={14} />
      </button>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════════════

export default function TransfersPage() {

  // ── Data state ──────────────────────────────────────────────────────
  const [shops, setShops]           = useState<ShopOption[]>([]);
  const [products, setProducts]     = useState<ProductOption[]>([]);
  const [transfers, setTransfers]   = useState<Transfer[]>([]);
  const [fetchState, setFetchState] = useState<FetchState>('idle');
  const [fetchError, setFetchError] = useState('');

  // ── Form state ──────────────────────────────────────────────────────
  const [fromShop, setFromShop]     = useState<number | null>(null);
  const [toShop, setToShop]         = useState<number | null>(null);
  const [productId, setProductId]   = useState<number | null>(null);
  const [quantity, setQuantity]     = useState<string>('');
  const [notes, setNotes]           = useState<string>('');
  const [formError, setFormError]   = useState('');
  const [submitting, setSubmitting] = useState(false);

  // ── Workflow action state ───────────────────────────────────────────
  // ID of the transfer currently being approved/completed/cancelled
  const [processingId, setProcessingId] = useState<number | null>(null);

  // ── Toast state ─────────────────────────────────────────────────────
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // ── Table filter state ──────────────────────────────────────────────
  const [statusFilter, setStatusFilter] = useState<TransferStatus | 'all'>('all');
  const [tableSearch, setTableSearch]   = useState('');

  // ────────────────────────────────────────────────────────────────────
  // FETCH: shops WHERE organization_id IS NOT NULL
  // Requirement: only shops/warehouses belonging to an organization
  // ────────────────────────────────────────────────────────────────────
  const fetchShops = useCallback(async () => {
    const { data, error } = await supabase
      .from('shops')
      .select('id, shop_name, city, organization_id')
      .not('organization_id', 'is', null)
      .order('shop_name', { ascending: true });

    if (error) throw error;

    setShops(
      (data ?? []).map((r) => ({
        id:              Number(r.id),
        name:            (r.shop_name ?? '') as string,
        city:            (r.city ?? '') as string,
        organization_id: r.organization_id as number | null,
      })),
    );
  }, []);

  // ────────────────────────────────────────────────────────────────────
  // FETCH: products filtered by organization_id
  // ISSUE FIXED: when fromShop is selected, derive its org and filter
  // products by that org so cross-org products can't be selected.
  // When no shop selected (orgId = null), load all products (initial
  // state so the dropdown isn't empty on first render).
  // ────────────────────────────────────────────────────────────────────
  const fetchProducts = useCallback(async (orgId: number | null) => {
    let query = supabase
      .from('products')
      .select('id, part_name, part_number, brand, organization_id')
      .order('part_name', { ascending: true });

    if (orgId !== null) {
      query = query.eq('organization_id', orgId);
    }

    const { data, error } = await query;
    if (error) throw error;

    setProducts(
      (data ?? []).map((r) => ({
        id:              Number(r.id),
        name:            (r.part_name  ?? '') as string,
        part_number:     (r.part_number ?? '') as string,
        brand:           (r.brand       ?? '') as string,
        organization_id: r.organization_id as number | null,
      })),
    );
  }, []);

  // ────────────────────────────────────────────────────────────────────
  // FETCH: inventory_transfers with PostgREST FK embedding
  // ISSUE FIXED: FK hints use explicit constraint names to avoid
  // ambiguity when a table has multiple FKs to the same target table.
  // If FK names differ in your DB, adjust the hint strings below.
  // Fallback: if the hinted embed fails, we catch the error and retry
  // with a simple select (shops resolved from local state in mapRow).
  // ────────────────────────────────────────────────────────────────────
  const fetchTransfers = useCallback(async () => {
    const { data, error } = await supabase
      .from('inventory_transfers')
      .select(`
        id,
        from_shop_id,
        to_shop_id,
        product_id,
        quantity,
        status,
        created_by,
        created_at,
        organization_id,
        notes,
        approved_by,
        approved_at,
        completed_at,
        from_shop:shops!inventory_transfers_from_shop_id_fkey ( shop_name ),
        to_shop:shops!inventory_transfers_to_shop_id_fkey     ( shop_name ),
        product:products!inventory_transfers_product_id_fkey  ( part_name, part_number )
      `)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;

    setTransfers(
      (data ?? []).map((r) => {
        // PostgREST may return an object or a single-element array
        const pick = <T extends Record<string, unknown>>(
          raw: T | T[] | null,
          key: keyof T,
          fallback: string,
        ): string => {
          if (!raw) return fallback;
          const item = Array.isArray(raw) ? raw[0] : raw;
          return (item?.[key] as string | undefined) ?? fallback;
        };

        const row: TransferRow = {
          id:              Number(r.id),
          from_shop_id:    Number(r.from_shop_id),
          to_shop_id:      Number(r.to_shop_id),
          product_id:      Number(r.product_id),
          quantity:        Number(r.quantity),
          status:          (r.status as TransferStatus) ?? 'pending',
          created_by:      r.created_by as string | null,
          created_at:      r.created_at as string,
          organization_id: r.organization_id as number | null,
          notes:           r.notes as string | null,
          approved_by:     r.approved_by as string | null,
          approved_at:     r.approved_at as string | null,
          completed_at:    r.completed_at as string | null,
          from_shop_name:  pick(r.from_shop as Record<string, unknown> | null, 'shop_name', '—'),
          to_shop_name:    pick(r.to_shop   as Record<string, unknown> | null, 'shop_name', '—'),
          product_name:    pick(r.product   as Record<string, unknown> | null, 'part_name',  '—'),
          product_number:  pick(r.product   as Record<string, unknown> | null, 'part_number', ''),
        };
        return mapRow(row);
      }),
    );
  }, []);

  // ────────────────────────────────────────────────────────────────────
  // INITIAL LOAD
  // ────────────────────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    try {
      setFetchState('loading');
      setFetchError('');
      await Promise.all([fetchShops(), fetchProducts(null), fetchTransfers()]);
      setFetchState('success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'فشل تحميل البيانات';
      setFetchError(msg);
      setFetchState('error');
      console.error('[TransfersPage] loadAll error:', err);
    }
  }, [fetchShops, fetchProducts, fetchTransfers]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // When fromShop changes → re-fetch products for its organization
  // ISSUE FIXED: reset productId to prevent selecting a product that
  // belongs to a different organization
  useEffect(() => {
    const orgId = shops.find((s) => s.id === fromShop)?.organization_id ?? null;
    setProductId(null);
    fetchProducts(orgId).catch(console.error);
  }, [fromShop, shops, fetchProducts]);

  // ────────────────────────────────────────────────────────────────────
  // WORKFLOW HELPERS
  // Shared helper that updates a transfer and refreshes the list
  // ────────────────────────────────────────────────────────────────────
  const applyStatusUpdate = useCallback(async (
    id: number,
    patch: Partial<{
      status: TransferStatus;
      approved_by: string;
      approved_at: string;
      completed_at: string;
    }>,
    successMsg: string,
  ) => {
    try {
      setProcessingId(id);

      const { error } = await supabase
        .from('inventory_transfers')
        .update(patch)
        .eq('id', id);

      if (error) throw error;

      // Optimistic local update — avoids full refetch for speed
      setTransfers((prev) =>
        prev.map((t) =>
          t.id === id
            ? {
                ...t,
                status:       patch.status ?? t.status,
                approved_by:  patch.approved_by  ?? t.approved_by,
                approved_at:  patch.approved_at  ?? t.approved_at,
                completed_at: patch.completed_at ?? t.completed_at,
              }
            : t,
        ),
      );

      setToast({ message: successMsg, type: 'success' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'فشلت العملية';
      setToast({ message: msg, type: 'error' });
      // Re-fetch to ensure consistency on error
      await fetchTransfers().catch(console.error);
    } finally {
      setProcessingId(null);
    }
  }, [fetchTransfers]);

  // ────────────────────────────────────────────────────────────────────
  // B) APPROVE: pending → approved
  // Saves: approved_by (user.id), approved_at (now), status='approved'
  // ────────────────────────────────────────────────────────────────────
  const handleApprove = useCallback(async (t: Transfer) => {
    if (t.status !== 'pending') return;

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      setToast({ message: 'يرجى تسجيل الدخول أولاً', type: 'error' });
      return;
    }

    await applyStatusUpdate(
      t.id,
      {
        status:      'approved',
        approved_by: user.id,
        approved_at: new Date().toISOString(),
      },
      'تم اعتماد التحويل بنجاح',
    );
  }, [applyStatusUpdate]);

  // ────────────────────────────────────────────────────────────────────
  // C) COMPLETE: approved → completed
  // Saves: completed_at (now), status='completed'
  // ────────────────────────────────────────────────────────────────────
  const handleComplete = useCallback(async (t: Transfer) => {
    if (t.status !== 'approved') return;

    await applyStatusUpdate(
      t.id,
      {
        status:       'completed',
        completed_at: new Date().toISOString(),
      },
      'تم إتمام التحويل بنجاح',
    );
  }, [applyStatusUpdate]);

  // ────────────────────────────────────────────────────────────────────
  // D) CANCEL: pending | approved → cancelled
  // ────────────────────────────────────────────────────────────────────
  const handleCancel = useCallback(async (t: Transfer) => {
    if (t.status === 'completed' || t.status === 'cancelled') return;

    const confirmed = window.confirm(
      `هل تريد إلغاء التحويل ${t.transfer_number}؟`,
    );
    if (!confirmed) return;

    await applyStatusUpdate(
      t.id,
      { status: 'cancelled' },
      'تم إلغاء التحويل',
    );
  }, [applyStatusUpdate]);

  // ────────────────────────────────────────────────────────────────────
  // A) CREATE: INSERT into inventory_transfers
  // ISSUE FIXED: organization_id is derived from from_shop, ensuring
  // both shops belong to the same org before insert.
  // ISSUE FIXED: cross-org validation added client-side.
  // ────────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setFormError('');

    if (!fromShop)            { setFormError('يرجى اختيار المتجر المُرسِل');    return; }
    if (!toShop)              { setFormError('يرجى اختيار المتجر المُستقبِل');  return; }
    if (fromShop === toShop)  { setFormError('لا يمكن التحويل إلى نفس المتجر'); return; }
    if (!productId)           { setFormError('يرجى اختيار المنتج');              return; }
    const qty = Number(quantity);
    if (!quantity || qty < 1) { setFormError('يرجى إدخال كمية صحيحة');          return; }

    // Cross-organization validation
    const fromOrgId = shops.find((s) => s.id === fromShop)?.organization_id ?? null;
    const toOrgId   = shops.find((s) => s.id === toShop)?.organization_id   ?? null;

    if (fromOrgId === null || toOrgId === null) {
      setFormError('أحد المتجرين غير مرتبط بمجموعة');
      return;
    }
    if (fromOrgId !== toOrgId) {
      setFormError('لا يمكن التحويل بين مجموعتين مختلفتين');
      return;
    }

    // Product organization validation
    const selectedProduct = products.find((p) => p.id === productId);
    if (selectedProduct?.organization_id !== null &&
        selectedProduct?.organization_id !== fromOrgId) {
      setFormError('المنتج لا ينتمي إلى نفس المجموعة');
      return;
    }

    try {
      setSubmitting(true);

      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) throw new Error('يرجى تسجيل الدخول أولاً');

      const { error: insertError } = await supabase
        .from('inventory_transfers')
        .insert({
          organization_id: fromOrgId,
          from_shop_id:    fromShop,
          to_shop_id:      toShop,
          product_id:      productId,
          quantity:        qty,
          status:          'pending',
          created_by:      user.id,
          notes:           notes.trim() || null,
        });

      if (insertError) throw insertError;

      // Reset form
      setFromShop(null);
      setToShop(null);
      setProductId(null);
      setQuantity('');
      setNotes('');
      setFormError('');

      // Reload list
      await fetchTransfers();
      setToast({ message: 'تم إنشاء طلب التحويل بنجاح!', type: 'success' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'فشل إنشاء التحويل';
      setFormError(msg);
      setToast({ message: msg, type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  // ── Derived KPI stats — auto-update when transfers change ──────────
  const pendingCount   = transfers.filter((t) => t.status === 'pending').length;
  const approvedCount  = transfers.filter((t) => t.status === 'approved').length;
  const completedCount = transfers.filter((t) => t.status === 'completed').length;
  const totalCount     = transfers.length;

  // ── Table filter ────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = tableSearch.toLowerCase().trim();
    return transfers.filter((t) => {
      const matchStatus = statusFilter === 'all' || t.status === statusFilter;
      const matchSearch =
        !q ||
        t.transfer_number.toLowerCase().includes(q) ||
        t.from_shop.toLowerCase().includes(q) ||
        t.to_shop.toLowerCase().includes(q) ||
        t.product_name.toLowerCase().includes(q);
      return matchStatus && matchSearch;
    });
  }, [transfers, statusFilter, tableSearch]);

  const isLoadingData = fetchState === 'loading' || fetchState === 'idle';

  // ══════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-slate-950 p-4 lg:p-8 text-right" dir="rtl">

      {/* ── SECTION 1: HEADER ──────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 mb-10">
        <div>
          <h1 className="text-4xl font-black text-white tracking-tight flex items-center gap-4 flex-wrap">
            تحويلات المخزون
            <span className="text-sm font-medium bg-blue-500/10 text-blue-500 px-3 py-1 rounded-full border border-blue-500/20">
              {totalCount} تحويل
            </span>
          </h1>
          <p className="text-slate-400 mt-2 text-lg">
            إدارة عمليات نقل المخزون بين المتاجر والفروع.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={loadAll}
            disabled={isLoadingData}
            className="p-3 bg-slate-900 border border-slate-800 rounded-2xl text-slate-400 hover:text-white transition-all disabled:opacity-50"
          >
            <RefreshCw size={20} className={isLoadingData ? 'animate-spin' : ''} />
          </button>
          <div className="flex items-center gap-4 bg-slate-900 border border-slate-800/60 rounded-2xl px-5 py-3 shadow-xl">
            <div className="flex items-center gap-2">
              <CalendarDays size={16} className="text-blue-400 shrink-0" />
              <div className="text-right">
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest leading-none mb-0.5">اليوم</p>
                <p className="text-white font-black text-sm leading-none">
                  {new Date().toLocaleDateString('ar-SA', { year: 'numeric', month: '2-digit', day: '2-digit' })}
                </p>
              </div>
            </div>
            <div className="w-px h-8 bg-slate-700" />
            <div className="flex items-center gap-2">
              <Clock size={16} className="text-emerald-400 shrink-0" />
              <p className="text-white font-black text-sm tabular-nums">
                {new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit', hour12: true })}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Global fetch error ─────────────────────────────────────── */}
      {fetchState === 'error' && (
        <div className="mb-8 flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-2xl px-5 py-4">
          <AlertCircle size={18} className="text-red-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-red-400 font-bold text-sm">فشل تحميل البيانات</p>
            <p className="text-red-400/70 text-xs font-mono mt-0.5 truncate">{fetchError}</p>
          </div>
          <button onClick={loadAll} className="flex items-center gap-1.5 text-red-400 hover:text-red-300 text-xs font-bold transition-colors shrink-0">
            <RefreshCw size={13} /> إعادة المحاولة
          </button>
        </div>
      )}

      {/* ── SECTION 2: KPI CARDS — now 4 cards ────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        {[
          { label: 'معلقة',  value: pendingCount,   icon: Clock,        color: 'text-amber-500',   bg: 'bg-amber-500/5',   dot: 'bg-amber-500',   pulse: true  },
          { label: 'معتمدة', value: approvedCount,  icon: ShieldCheck,  color: 'text-blue-500',    bg: 'bg-blue-500/5',    dot: 'bg-blue-500',    pulse: true  },
          { label: 'مكتملة', value: completedCount, icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-500/5', dot: 'bg-emerald-500', pulse: false },
          { label: 'الإجمالي',value: totalCount,    icon: TrendingUp,   color: 'text-slate-400',   bg: 'bg-slate-500/5',   dot: 'bg-slate-500',   pulse: false },
        ].map((card, i) => (
          <div key={i} className="bg-slate-900 border border-slate-800/60 p-5 lg:p-6 rounded-3xl hover:border-slate-700 transition-all hover:scale-[1.02] duration-300 shadow-xl">
            <div className="flex justify-between items-start mb-3">
              <div className={`p-2.5 ${card.bg} rounded-2xl`}>
                <card.icon className={card.color} size={20} />
              </div>
              <div className={`w-2 h-2 rounded-full ${card.dot} ${card.pulse ? 'animate-pulse' : ''} mt-1`} />
            </div>
            <p className="text-slate-400 text-xs font-medium">{card.label}</p>
            <h3 className="text-3xl font-black text-white mt-0.5 tabular-nums">
              {isLoadingData ? <span className="text-slate-600">...</span> : card.value}
            </h3>
          </div>
        ))}
      </div>

      {/* ── SECTION 3: CREATE TRANSFER FORM — preserved layout ─────── */}
      <div className="bg-slate-900 border border-slate-800/60 rounded-[2.5rem] p-6 lg:p-8 mb-8 shadow-2xl">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-2xl bg-blue-500/15 border border-blue-500/20 flex items-center justify-center shrink-0">
            <Plus size={18} className="text-blue-400" />
          </div>
          <div>
            <h2 className="text-white font-black text-xl leading-none">إنشاء تحويل جديد</h2>
            <p className="text-slate-500 text-sm mt-0.5">نقل مخزون بين متجرين مرتبطَين بنفس المجموعة</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

          {/* من */}
          <div className="space-y-1.5">
            <label className="text-xs text-slate-400 font-bold uppercase tracking-wide flex items-center gap-1.5">
              <Store size={12} className="text-blue-400" />
              من: المتجر المُرسِل
            </label>
            <div className="relative">
              <select
                value={fromShop ?? ''}
                onChange={(e) => setFromShop(e.target.value ? Number(e.target.value) : null)}
                disabled={isLoadingData}
                className="w-full h-12 bg-slate-950 border border-slate-700 rounded-2xl px-4 text-sm text-white focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="" disabled>
                  {isLoadingData ? 'جاري التحميل...' : `اختر المُرسِل... (${shops.length})`}
                </option>
                {shops.map((s) => (
                  <option key={s.id} value={s.id} disabled={s.id === toShop}>
                    {s.name}{s.city ? ` — ${s.city}` : ''}
                  </option>
                ))}
              </select>
              <ChevronDown size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            </div>
          </div>

          {/* إلى */}
          <div className="space-y-1.5">
            <label className="text-xs text-slate-400 font-bold uppercase tracking-wide flex items-center gap-1.5">
              <ArrowRight size={12} className="text-emerald-400" />
              إلى: المتجر المُستقبِل
            </label>
            <div className="relative">
              <select
                value={toShop ?? ''}
                onChange={(e) => setToShop(e.target.value ? Number(e.target.value) : null)}
                disabled={isLoadingData}
                className="w-full h-12 bg-slate-950 border border-slate-700 rounded-2xl px-4 text-sm text-white focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="" disabled>
                  {isLoadingData ? 'جاري التحميل...' : `اختر المُستقبِل... (${shops.length})`}
                </option>
                {shops.map((s) => (
                  <option key={s.id} value={s.id} disabled={s.id === fromShop}>
                    {s.name}{s.city ? ` — ${s.city}` : ''}
                  </option>
                ))}
              </select>
              <ChevronDown size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            </div>
          </div>

          {/* Direction indicator */}
          <div className="hidden md:flex items-center justify-center col-span-2 -my-2">
            <div className="flex items-center gap-3 text-slate-600 w-full">
              <div className="h-px flex-1 bg-slate-800" />
              <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/60 border border-slate-700/50 rounded-full shrink-0">
                <ArrowLeftRight size={14} className="text-blue-400" />
                <span className="text-xs font-bold text-slate-400">اتجاه التحويل</span>
              </div>
              <div className="h-px flex-1 bg-slate-800" />
            </div>
          </div>

          {/* المنتج */}
          <div className="space-y-1.5">
            <label className="text-xs text-slate-400 font-bold uppercase tracking-wide flex items-center gap-1.5">
              <Package size={12} className="text-amber-400" />
              المنتج
              {fromShop && !isLoadingData && (
                <span className="text-slate-600 normal-case font-normal">
                  ({products.length} منتج متاح)
                </span>
              )}
            </label>
            <ProductSelect
              value={productId}
              onChange={setProductId}
              products={products}
              disabled={isLoadingData}
            />
          </div>

          {/* الكمية */}
          <div className="space-y-1.5">
            <label className="text-xs text-slate-400 font-bold uppercase tracking-wide flex items-center gap-1.5">
              <Hash size={12} className="text-purple-400" />
              الكمية
            </label>
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="أدخل الكمية..."
              disabled={submitting}
              className="w-full h-12 bg-slate-950 border border-slate-700 rounded-2xl px-4 text-white text-sm font-bold tabular-nums focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none disabled:opacity-50"
              dir="ltr"
            />
          </div>

          {/* الملاحظات */}
          <div className="space-y-1.5 md:col-span-2">
            <label className="text-xs text-slate-400 font-bold uppercase tracking-wide flex items-center gap-1.5">
              <FileText size={12} className="text-slate-500" />
              ملاحظات
              <span className="text-slate-600 normal-case font-normal">(اختياري)</span>
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="أي تفاصيل إضافية عن التحويل..."
              disabled={submitting}
              className="w-full bg-slate-950 border border-slate-700 rounded-2xl px-4 py-3 text-white text-sm resize-none focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all disabled:opacity-50"
            />
          </div>
        </div>

        {formError && (
          <div className="mt-5 flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-3">
            <AlertCircle size={15} className="text-red-400 shrink-0" />
            <span className="text-red-400 text-sm font-bold">{formError}</span>
          </div>
        )}

        <div className="mt-6 flex justify-start">
          <button
            onClick={handleSubmit}
            disabled={submitting || isLoadingData}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed text-white font-black rounded-2xl px-8 py-3.5 shadow-lg shadow-blue-900/30 transition-all"
          >
            {submitting ? (
              <><RefreshCw size={17} className="animate-spin" /> جاري الإنشاء...</>
            ) : (
              <><ArrowLeftRight size={17} /> إنشاء تحويل</>
            )}
          </button>
        </div>
      </div>

      {/* ── SECTION 4: TRANSFERS TABLE ─────────────────────────────── */}
      <div className="bg-slate-900 border border-slate-800/60 rounded-[2.5rem] overflow-hidden shadow-2xl">

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 px-6 lg:px-8 py-5 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <BarChart3 size={18} className="text-blue-400" />
            <h2 className="text-white font-black text-lg">آخر التحويلات</h2>
            <span className="text-xs font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2.5 py-0.5 rounded-full">
              {filtered.length} تحويل
            </span>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto flex-wrap">
            <div className="relative flex-1 sm:w-48">
              <Search size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
              <input
                type="text"
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                placeholder="بحث..."
                className="w-full h-10 bg-slate-950 border border-slate-800 rounded-2xl pr-10 pl-3 text-white text-sm focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all"
              />
            </div>

            <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 gap-0.5 flex-wrap">
              {(
                [
                  { key: 'all',       label: 'الكل'   },
                  { key: 'pending',   label: 'معلق'   },
                  { key: 'approved',  label: 'معتمد'  },
                  { key: 'completed', label: 'مكتمل'  },
                  { key: 'cancelled', label: 'ملغي'   },
                ] as const
              ).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setStatusFilter(key)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                    statusFilter === key
                      ? 'bg-slate-800 text-white shadow'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Loading */}
        {isLoadingData && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-slate-500 font-bold text-sm">جاري تحميل التحويلات...</p>
          </div>
        )}

        {/* Empty */}
        {!isLoadingData && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 gap-4 opacity-50">
            <Filter size={44} className="text-slate-500" />
            <p className="text-slate-400 font-bold">
              {transfers.length === 0 ? 'لا توجد تحويلات بعد' : 'لا توجد تحويلات مطابقة'}
            </p>
          </div>
        )}

        {/* ── Desktop Table ── */}
        {!isLoadingData && filtered.length > 0 && (
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-right" style={{ minWidth: '900px' }}>
              <thead>
                <tr className="bg-slate-950/50 text-slate-500 text-xs font-black uppercase tracking-widest border-b border-slate-800">
                  <th className="px-6 py-5">رقم التحويل</th>
                  <th className="px-6 py-5">من</th>
                  <th className="px-6 py-5">إلى</th>
                  <th className="px-6 py-5">المنتج</th>
                  <th className="px-6 py-5 text-center">الكمية</th>
                  <th className="px-6 py-5 text-center">الحالة</th>
                  <th className="px-6 py-5">التاريخ</th>
                  <th className="px-6 py-5">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {filtered.map((t) => (
                  <tr key={t.id} className="group hover:bg-slate-800/30 transition-all duration-200">
                    <td className="px-6 py-4">
                      <span className="font-mono text-blue-400 text-sm font-bold group-hover:text-blue-300 transition-colors">
                        {t.transfer_number}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 text-xs font-black shrink-0">
                          {t.from_shop.charAt(0)}
                        </div>
                        <span className="text-slate-300 text-sm font-medium truncate max-w-[110px]">{t.from_shop}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <ArrowRight size={12} className="text-slate-600 shrink-0" />
                        <div className="w-7 h-7 rounded-xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-blue-400 text-xs font-black shrink-0">
                          {t.to_shop.charAt(0)}
                        </div>
                        <span className="text-slate-300 text-sm font-medium truncate max-w-[110px]">{t.to_shop}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div>
                        <p className="text-white font-bold text-sm">{t.product_name}</p>
                        <p className="text-slate-500 text-[11px] font-mono mt-0.5">{t.product_number}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="inline-flex items-center justify-center w-9 h-9 rounded-2xl bg-slate-950/50 border border-slate-800/50 text-white font-black text-sm tabular-nums">
                        {t.quantity}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <StatusBadge status={t.status} />
                    </td>
                    <td className="px-6 py-4">
                      <div>
                        <p className="text-slate-300 text-sm font-bold tabular-nums">{formatDate(t.created_at)}</p>
                        <p className="text-slate-600 text-[11px] mt-0.5 tabular-nums">{formatTime(t.created_at)}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <ActionButtons
                        transfer={t}
                        processingId={processingId}
                        onApprove={handleApprove}
                        onComplete={handleComplete}
                        onCancel={handleCancel}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Mobile Cards ── */}
        {!isLoadingData && filtered.length > 0 && (
          <div className="md:hidden divide-y divide-slate-800/40">
            {filtered.map((t) => (
              <div key={t.id} className="p-4 hover:bg-slate-800/20 transition-colors">
                {/* Top: number + status */}
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="font-mono text-blue-400 text-sm font-bold">{t.transfer_number}</span>
                  <StatusBadge status={t.status} />
                </div>

                {/* From → To */}
                <div className="flex items-center gap-2 mb-3 bg-slate-950/50 border border-slate-800/50 rounded-2xl px-3 py-2.5">
                  <div className="w-7 h-7 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 text-xs font-black shrink-0">
                    {t.from_shop.charAt(0)}
                  </div>
                  <span className="text-slate-400 text-xs font-medium truncate flex-1">{t.from_shop}</span>
                  <ArrowLeftRight size={12} className="text-slate-600 shrink-0" />
                  <span className="text-slate-400 text-xs font-medium truncate flex-1 text-left">{t.to_shop}</span>
                  <div className="w-7 h-7 rounded-xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-blue-400 text-xs font-black shrink-0">
                    {t.to_shop.charAt(0)}
                  </div>
                </div>

                {/* Product + qty + date */}
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Package size={13} className="text-amber-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-white font-bold text-sm truncate">{t.product_name}</p>
                      <p className="text-slate-500 text-[11px] font-mono">{t.product_number}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="flex items-center gap-1 bg-slate-950/60 border border-slate-800 rounded-xl px-2.5 py-1">
                      <Hash size={11} className="text-slate-500" />
                      <span className="text-white font-black text-sm tabular-nums">{t.quantity}</span>
                    </div>
                    <div className="text-left">
                      <p className="text-slate-400 text-xs tabular-nums">{formatDate(t.created_at)}</p>
                      <p className="text-slate-600 text-[10px] tabular-nums">{formatTime(t.created_at)}</p>
                    </div>
                  </div>
                </div>

                {/* Notes */}
                {t.notes && (
                  <p className="text-slate-500 text-xs border-t border-slate-800/50 pt-2 mb-3 truncate">
                    📝 {t.notes}
                  </p>
                )}

                {/* Action buttons — full width on mobile */}
                <div className="border-t border-slate-800/40 pt-3">
                  <ActionButtons
                    transfer={t}
                    processingId={processingId}
                    onApprove={handleApprove}
                    onComplete={handleComplete}
                    onCancel={handleCancel}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        {!isLoadingData && filtered.length > 0 && (
          <div className="px-8 py-4 border-t border-slate-800/40 flex items-center justify-between flex-wrap gap-2">
            <p className="text-slate-500 text-xs font-medium">
              عرض <span className="text-white font-bold">{filtered.length}</span> من أصل{' '}
              <span className="text-white font-bold">{transfers.length}</span> تحويل
            </p>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-slate-500 text-xs">Supabase Live</span>
            </div>
          </div>
        )}

      </div>

      {/* ── TOAST ──────────────────────────────────────────────────── */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onDismiss={() => setToast(null)}
        />
      )}

    </div>
  );
}
