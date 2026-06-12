import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import {
  Building2,
  RefreshCw,
  Plus,
  Eye,
  GitBranch,
  CalendarDays,
  AlertCircle,
  PackageSearch,
  Clock,
  X,
} from 'lucide-react';

// ══════════════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════════════

/**
 * Shape returned by the `organizations_summary` VIEW.
 * READ ONLY — never insert/update against this view.
 *
 * Assumed view definition (adjust column aliases if your view differs):
 *   SELECT
 *     o.id,
 *     o.name,
 *     COUNT(b.id)   AS branches_count,
 *     o.created_at
 *   FROM organizations o
 *   LEFT JOIN branches b ON b.organization_id = o.id
 *   GROUP BY o.id
 */
type OrganizationSummary = {
  id: number;
  name: string;
  branches_count: number;
  created_at: string;
};

/**
 * Shape of a row in the `organizations` TABLE.
 * This is what we INSERT into when creating a new organization.
 *
 * Assumed table columns: id (serial), name (text), owner_id (uuid), created_at (timestamptz)
 */
type OrganizationInsert = {
  name: string;
  owner_id: string;
};

type FetchState = 'idle' | 'loading' | 'success' | 'error';

// ══════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ar-SA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function formatDateRelative(iso: string): string {
  return new Date(iso).toLocaleDateString('ar-SA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// ══════════════════════════════════════════════════════════════════════
// ORGANIZATION CARD
// ══════════════════════════════════════════════════════════════════════

type OrganizationCardProps = {
  org: OrganizationSummary;
  onViewDetails: (org: OrganizationSummary) => void;
};

function OrganizationCard({ org, onViewDetails }: OrganizationCardProps) {
  const initial = (org.name || 'O').charAt(0).toUpperCase();

  return (
    <div className="bg-slate-900 border border-slate-800/60 rounded-3xl p-6 flex flex-col gap-5 hover:border-slate-700 hover:scale-[1.01] transition-all duration-300 group shadow-xl">

      {/* ── Top: Avatar + Name ── */}
      <div className="flex items-start gap-4">
        <div className="w-14 h-14 rounded-2xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-blue-500 text-2xl font-black shrink-0 transition-transform group-hover:scale-110">
          {initial}
        </div>
        <div className="flex-1 min-w-0 pt-1">
          <h3 className="text-white font-black text-lg leading-snug truncate group-hover:text-blue-400 transition-colors">
            {org.name}
          </h3>
          <p className="text-slate-500 text-xs font-medium mt-0.5">
            #{org.id}
          </p>
        </div>
      </div>

      {/* ── Stats Row ── */}
      <div className="grid grid-cols-2 gap-3">
        {/* Branches count */}
        <div className="bg-slate-950/50 border border-slate-800/50 rounded-2xl p-3 flex flex-col items-center justify-center gap-1">
          <GitBranch size={16} className="text-emerald-500" />
          <span className="text-white font-black text-xl tabular-nums leading-none">
            {org.branches_count}
          </span>
          <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wide">
            فرع
          </span>
        </div>

        {/* Created at */}
        <div className="bg-slate-950/50 border border-slate-800/50 rounded-2xl p-3 flex flex-col items-center justify-center gap-1">
          <CalendarDays size={16} className="text-blue-400" />
          <span className="text-white font-bold text-sm leading-none text-center tabular-nums">
            {formatDate(org.created_at)}
          </span>
          <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wide">
            تاريخ الإنشاء
          </span>
        </div>
      </div>

      {/* ── Footer: View Details Button ── */}
      <button
        onClick={() => onViewDetails(org)}
        className="w-full h-10 rounded-2xl bg-slate-800 hover:bg-blue-600 border border-slate-700 hover:border-blue-500 text-slate-300 hover:text-white font-bold text-sm transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
      >
        <Eye size={15} />
        عرض التفاصيل
      </button>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// ADD ORGANIZATION MODAL
//
// BUG FIX:
//   The previous version inserted into `organizations_summary` which is
//   a VIEW — Postgres/PostgREST rejects writes to views by default.
//
// CORRECT APPROACH:
//   1. Fetch the current authenticated user via supabase.auth.getUser().
//   2. INSERT into the base TABLE `organizations` with { name, owner_id }.
//   3. After a successful insert, call onSuccess() which re-fetches the
//      VIEW (`organizations_summary`) so the new row appears in the list.
// ══════════════════════════════════════════════════════════════════════

type AddModalProps = {
  onClose: () => void;
  onSuccess: () => void;
};

function AddOrganizationModal({ onClose, onSuccess }: AddModalProps) {
  const [name, setName]     = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('يرجى إدخال اسم المجموعة');
      return;
    }

    try {
      setSaving(true);
      setError('');

      // ── Step 1: Get the current authenticated user ─────────────────
      // We must pass owner_id to satisfy NOT NULL / RLS constraints on
      // the `organizations` table.
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        throw new Error('يرجى تسجيل الدخول أولاً');
      }

      // ── Step 2: INSERT into the TABLE `organizations` ──────────────
      // NOT `organizations_summary` — that is a read-only VIEW.
      const payload: OrganizationInsert = {
        name: trimmedName,
        owner_id: user.id,
      };

      const { error: insertError } = await supabase
        .from('organizations')
        .insert(payload);

      if (insertError) throw insertError;

      // ── Step 3: Refresh the view data in the parent ────────────────
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'حدث خطأ أثناء الحفظ';
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-700 rounded-[2rem] shadow-2xl overflow-hidden">
        {/* Top accent line */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-500/50 to-transparent" />

        {/* Header */}
        <div className="flex items-center justify-between px-7 pt-7 pb-5 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/15 border border-blue-500/20 flex items-center justify-center">
              <Plus size={16} className="text-blue-400" />
            </div>
            <div>
              <h3 className="text-white font-black text-lg leading-none">إضافة مجموعة</h3>
              <p className="text-slate-500 text-xs mt-0.5">مجموعة جديدة للمنصة</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-800 rounded-xl transition-all text-slate-400 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-7 py-6 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs text-slate-400 font-bold uppercase tracking-wide">
              اسم المجموعة
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !saving && handleSave()}
              placeholder="مثال: مجموعة الخليج التجارية"
              className="w-full bg-slate-950 border border-slate-700 rounded-2xl px-4 h-12 text-white text-sm focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all"
              autoFocus
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-3">
              <AlertCircle size={15} className="text-red-400 shrink-0" />
              <span className="text-red-400 text-sm font-bold">{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-7 pb-7 pt-2 border-t border-slate-800/60">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 h-12 rounded-2xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 font-bold text-sm transition-all"
          >
            إلغاء
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 h-12 rounded-2xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold text-sm transition-all flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <RefreshCw size={14} className="animate-spin" />
                جاري الحفظ...
              </>
            ) : (
              <>
                <Plus size={14} />
                إضافة المجموعة
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// DETAILS DRAWER
// ══════════════════════════════════════════════════════════════════════

type DetailsDrawerProps = {
  org: OrganizationSummary;
  onClose: () => void;
};

function DetailsDrawer({ org, onClose }: DetailsDrawerProps) {
  const initial = (org.name || 'O').charAt(0).toUpperCase();

  return (
    <div className="fixed inset-0 z-50 flex justify-end" dir="rtl">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div className="relative w-full max-w-md bg-slate-900 border-r border-slate-800 h-full shadow-2xl overflow-y-auto">
        <div className="p-8">

          {/* Header */}
          <div className="flex justify-between items-center mb-10">
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-800 rounded-xl transition-all text-slate-400 hover:text-white"
            >
              <X size={22} />
            </button>
            <h2 className="text-2xl font-black text-white">تفاصيل المجموعة</h2>
          </div>

          {/* Hero */}
          <div className="flex flex-col items-center mb-10 text-center">
            <div className="w-28 h-28 bg-blue-600/10 border border-blue-500/20 rounded-[2rem] flex items-center justify-center text-blue-500 text-4xl font-black mb-4">
              {initial}
            </div>
            <h3 className="text-2xl font-black text-white">{org.name}</h3>
            <p className="text-slate-500 mt-1 font-mono text-sm">ID: {org.id}</p>
          </div>

          {/* KPI Grid */}
          <div className="grid grid-cols-2 gap-4 mb-10">
            <div className="bg-slate-950 border border-slate-800/60 p-5 rounded-3xl flex flex-col items-center gap-2">
              <GitBranch size={20} className="text-emerald-500" />
              <span className="text-3xl font-black text-white tabular-nums">
                {org.branches_count}
              </span>
              <span className="text-slate-500 text-xs font-bold uppercase tracking-wide">
                إجمالي الفروع
              </span>
            </div>
            <div className="bg-slate-950 border border-slate-800/60 p-5 rounded-3xl flex flex-col items-center gap-2">
              <Clock size={20} className="text-blue-400" />
              <span className="text-lg font-black text-white text-center leading-snug">
                {formatDate(org.created_at)}
              </span>
              <span className="text-slate-500 text-xs font-bold uppercase tracking-wide">
                تاريخ الإنشاء
              </span>
            </div>
          </div>

          {/* Info section */}
          <div className="space-y-5">
            <h4 className="text-white font-black text-lg border-b border-slate-800 pb-2">
              المعلومات الأساسية
            </h4>

            <div className="grid grid-cols-2 gap-y-6">
              <div>
                <p className="text-slate-500 text-xs font-bold uppercase mb-1">اسم المجموعة</p>
                <p className="text-white font-bold">{org.name}</p>
              </div>
              <div>
                <p className="text-slate-500 text-xs font-bold uppercase mb-1">المعرّف</p>
                <p className="text-white font-bold font-mono">#{org.id}</p>
              </div>
              <div>
                <p className="text-slate-500 text-xs font-bold uppercase mb-1">عدد الفروع</p>
                <p className="text-emerald-400 font-black text-xl">{org.branches_count}</p>
              </div>
              <div>
                <p className="text-slate-500 text-xs font-bold uppercase mb-1">تاريخ الإنشاء</p>
                <p className="text-white font-bold">{formatDateRelative(org.created_at)}</p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// MAIN PAGE COMPONENT
// ══════════════════════════════════════════════════════════════════════

export default function OrganizationsPage() {
  const [organizations, setOrganizations] = useState<OrganizationSummary[]>([]);
  const [fetchState, setFetchState]       = useState<FetchState>('idle');
  const [errorMessage, setErrorMessage]   = useState('');
  const [selectedOrg, setSelectedOrg]     = useState<OrganizationSummary | null>(null);
  const [showAddModal, setShowAddModal]   = useState(false);
  const [now, setNow]                     = useState(new Date());

  // Live clock — identical to ShopsPage
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  // ── Fetch from the VIEW (read-only) ─────────────────────────────────
  // organizations_summary is a Postgres VIEW that joins `organizations`
  // with `branches` to compute branches_count. We only SELECT from it.
  const fetchOrganizations = useCallback(async () => {
    try {
      setFetchState('loading');
      setErrorMessage('');

      const { data, error } = await supabase
        .from('organizations_summary')
        .select('id, name, branches_count, created_at')
        .order('created_at', { ascending: false });

      if (error) throw error;

      setOrganizations((data as OrganizationSummary[]) ?? []);
      setFetchState('success');
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'حدث خطأ أثناء جلب البيانات';
      setErrorMessage(message);
      setFetchState('error');
      console.error('[OrganizationsPage] fetchOrganizations error:', err);
    }
  }, []);

  useEffect(() => {
    fetchOrganizations();
  }, [fetchOrganizations]);

  // ── Derived stats ────────────────────────────────────────────────────
  const totalBranches = organizations.reduce(
    (sum, o) => sum + (o.branches_count ?? 0),
    0,
  );

  // ════════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-slate-950 p-4 lg:p-8 text-right" dir="rtl">

      {/* ── SECTION 1: HEADER ── */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 mb-10">
        <div>
          <h1 className="text-4xl font-black text-white tracking-tight flex items-center gap-4">
            المجموعات
            <span className="text-sm font-medium bg-blue-500/10 text-blue-500 px-3 py-1 rounded-full border border-blue-500/20">
              {organizations.length} مجموعة
            </span>
          </h1>
          <p className="text-slate-400 mt-2 text-lg">
            إدارة جميع المجموعات والتنظيمات المسجلة داخل المنصة.
          </p>
        </div>

        <div className="flex items-center gap-3 w-full lg:w-auto">
          {/* Refresh */}
          <button
            onClick={fetchOrganizations}
            disabled={fetchState === 'loading'}
            className="p-3 bg-slate-900 border border-slate-800 rounded-2xl text-slate-400 hover:text-white transition-all disabled:opacity-50"
          >
            <RefreshCw
              size={20}
              className={fetchState === 'loading' ? 'animate-spin' : ''}
            />
          </button>

          {/* Date + Time — identical widget to ShopsPage */}
          <div className="flex items-center gap-4 bg-slate-900 border border-slate-800/60 rounded-2xl px-5 py-3 shadow-xl">
            <div className="flex items-center gap-2">
              <CalendarDays size={16} className="text-blue-400 shrink-0" />
              <div className="text-right">
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest leading-none mb-0.5">
                  {now.toLocaleDateString('ar-SA', { weekday: 'long' })}
                </p>
                <p className="text-white font-black text-sm leading-none">
                  {now.toLocaleDateString('ar-SA', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                  })}
                </p>
              </div>
            </div>
            <div className="w-px h-8 bg-slate-700" />
            <div className="flex items-center gap-2">
              <Clock size={16} className="text-emerald-400 shrink-0" />
              <p className="text-white font-black text-sm tabular-nums">
                {now.toLocaleTimeString('ar-SA', {
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: true,
                })}
              </p>
            </div>
          </div>

          {/* Add Organization */}
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 active:scale-[0.98] text-white font-black rounded-2xl px-5 py-3 shadow-lg shadow-blue-900/30 transition-all"
          >
            <Plus size={18} />
            <span className="hidden sm:inline">إضافة مجموعة</span>
          </button>
        </div>
      </div>

      {/* ── SECTION 2: KPI CARDS ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-10">
        {[
          {
            label: 'إجمالي المجموعات',
            value: organizations.length,
            icon: Building2,
            color: 'text-blue-500',
            bg: 'bg-blue-500/5',
          },
          {
            label: 'إجمالي الفروع',
            value: totalBranches,
            icon: GitBranch,
            color: 'text-emerald-500',
            bg: 'bg-emerald-500/5',
          },
          {
            label: 'متوسط الفروع للمجموعة',
            value:
              organizations.length > 0
                ? (totalBranches / organizations.length).toFixed(1)
                : '0',
            icon: CalendarDays,
            color: 'text-amber-500',
            bg: 'bg-amber-500/5',
          },
        ].map((card, i) => (
          <div
            key={i}
            className="bg-slate-900 border border-slate-800/60 p-6 rounded-3xl hover:border-slate-700 transition-all group hover:scale-[1.02] duration-300 shadow-xl"
          >
            <div className="flex justify-between items-start mb-4">
              <div className={`p-3 ${card.bg} rounded-2xl`}>
                <card.icon className={card.color} size={24} />
              </div>
              <span className="text-slate-500 text-xs font-black uppercase tracking-widest">
                Global Stat
              </span>
            </div>
            <p className="text-slate-400 font-medium">{card.label}</p>
            <h3 className="text-3xl font-black text-white mt-1">{card.value}</h3>
          </div>
        ))}
      </div>

      {/* ── SECTION 3: LOADING STATE ── */}
      {fetchState === 'loading' && (
        <div className="flex flex-col items-center justify-center py-32 gap-4">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-500 font-bold">جاري تحميل المجموعات...</p>
        </div>
      )}

      {/* ── SECTION 4: ERROR STATE ── */}
      {fetchState === 'error' && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-3xl p-10 text-center max-w-lg mx-auto">
          <AlertCircle size={44} className="text-red-400 mx-auto mb-4" />
          <h3 className="text-red-400 font-black text-xl mb-2">حدث خطأ في جلب البيانات</h3>
          <p className="text-slate-400 text-sm mb-6 font-mono">{errorMessage}</p>
          <button
            onClick={fetchOrganizations}
            className="inline-flex items-center gap-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-400 font-bold rounded-2xl px-6 py-3 transition-all"
          >
            <RefreshCw size={16} />
            إعادة المحاولة
          </button>
        </div>
      )}

      {/* ── SECTION 5: EMPTY STATE ── */}
      {fetchState === 'success' && organizations.length === 0 && (
        <div className="flex flex-col items-center justify-center py-32 gap-4 opacity-50">
          <PackageSearch size={56} className="text-slate-500" />
          <p className="text-slate-400 font-bold text-lg">لا توجد مجموعات مسجلة بعد</p>
          <p className="text-slate-600 text-sm">ابدأ بإضافة أول مجموعة للمنصة</p>
          <button
            onClick={() => setShowAddModal(true)}
            className="mt-2 flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-2xl px-6 py-3 transition-all opacity-100"
          >
            <Plus size={16} />
            إضافة مجموعة
          </button>
        </div>
      )}

      {/* ── SECTION 6: ORGANIZATIONS GRID ── */}
      {fetchState === 'success' && organizations.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
          {organizations.map((org) => (
            <OrganizationCard
              key={org.id}
              org={org}
              onViewDetails={(o) => setSelectedOrg(o)}
            />
          ))}
        </div>
      )}

      {/* ── SECTION 7: ADD MODAL ── */}
      {showAddModal && (
        <AddOrganizationModal
          onClose={() => setShowAddModal(false)}
          onSuccess={fetchOrganizations}
        />
      )}

      {/* ── SECTION 8: DETAILS DRAWER ── */}
      {selectedOrg && (
        <DetailsDrawer
          org={selectedOrg}
          onClose={() => setSelectedOrg(null)}
        />
      )}

    </div>
  );
}
