import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from './lib/supabase';
import { useLang } from '../context/LanguageContext';
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
  Search,
  Layers,
  Store,
  MapPin,
  Trash2,
} from 'lucide-react';

// ══════════════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════════════

type OrganizationSummary = {
  id: number;
  name: string;
  branches_count: number;
  created_at: string;
};

// Minimal shape fetched from organization_groups
type OrgGroup = {
  id: number;
  organization_id: number;
  name: string;
};

// Branch linked to an organization (for drawer branch management)
type OrgBranch = {
  id: number;
  shop_name: string;
  city: string | null;
  is_active: boolean;
};

// Unlinked shop that can be added to this org
type AvailableShop = {
  id: number;
  shop_name: string;
  city: string | null;
  is_active: boolean;
  organization_id: number | null;
};

type OrganizationInsert = {
  name: string;
  owner_id: string;
};

type FetchState = 'idle' | 'loading' | 'success' | 'error';

// ══════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════

function formatDate(iso: string, locale: string): string {
  try {
    return new Date(iso).toLocaleDateString(locale, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  } catch {
    return iso;
  }
}

function formatDateRelative(iso: string, locale: string): string {
  try {
    return new Date(iso).toLocaleDateString(locale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

function safeNumber(val: unknown): number {
  const n = Number(val);
  return isFinite(n) ? n : 0;
}

// ══════════════════════════════════════════════════════════════════════
// SKELETON CARD
// ══════════════════════════════════════════════════════════════════════

function SkeletonCard() {
  return (
    <div className="bg-slate-900 border border-slate-800/60 rounded-3xl p-6 flex flex-col gap-5 animate-pulse">
      <div className="flex items-start gap-4">
        <div className="w-14 h-14 rounded-2xl bg-slate-800 shrink-0" />
        <div className="flex-1 pt-1 space-y-2">
          <div className="h-5 bg-slate-800 rounded-xl w-3/4" />
          <div className="h-3 bg-slate-800/60 rounded-xl w-1/4" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-slate-800 rounded-2xl h-20" />
        <div className="bg-slate-800 rounded-2xl h-20" />
        <div className="bg-slate-800 rounded-2xl h-20" />
      </div>
      <div className="h-10 bg-slate-800 rounded-2xl" />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// ORGANIZATION CARD
// Now shows: Name · Branches · Groups · Created Date
// ══════════════════════════════════════════════════════════════════════

type OrganizationCardProps = {
  org: OrganizationSummary;
  groupsCount: number;
  onViewDetails: (org: OrganizationSummary) => void;
  t: (en: string, ar: string) => string;
  locale: string;
};

function OrganizationCard({ org, groupsCount, onViewDetails, t, locale }: OrganizationCardProps) {
  const initial = (org.name || 'O').charAt(0).toUpperCase();

  return (
    <div className="bg-slate-900 border border-slate-800/60 rounded-3xl p-6 flex flex-col gap-5 hover:border-slate-700 hover:scale-[1.01] transition-all duration-300 group shadow-xl">

      {/* ── Top: Avatar + Name ── */}
      <div className="flex items-start gap-4">
        <div
          className="w-14 h-14 rounded-2xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-blue-500 text-2xl font-black shrink-0 transition-transform group-hover:scale-110"
          aria-hidden="true"
        >
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

      {/* ── Stats Row: Branches · Groups · Created ── */}
      <div className="grid grid-cols-3 gap-2">
        {/* Branches */}
        <div className="bg-slate-950/50 border border-slate-800/50 rounded-2xl p-2.5 flex flex-col items-center justify-center gap-1">
          <GitBranch size={14} className="text-emerald-500" aria-hidden="true" />
          <span className="text-white font-black text-lg tabular-nums leading-none">
            {safeNumber(org.branches_count)}
          </span>
          <span className="text-slate-500 text-[9px] font-bold uppercase tracking-wide text-center">
            {t('Branches', 'فروع')}
          </span>
        </div>

        {/* Groups */}
        <div className="bg-slate-950/50 border border-slate-800/50 rounded-2xl p-2.5 flex flex-col items-center justify-center gap-1">
          <Layers size={14} className="text-amber-400" aria-hidden="true" />
          <span className="text-white font-black text-lg tabular-nums leading-none">
            {groupsCount}
          </span>
          <span className="text-slate-500 text-[9px] font-bold uppercase tracking-wide text-center">
            {t('Groups', 'مجموعات')}
          </span>
        </div>

        {/* Created */}
        <div className="bg-slate-950/50 border border-slate-800/50 rounded-2xl p-2.5 flex flex-col items-center justify-center gap-1">
          <CalendarDays size={14} className="text-blue-400" aria-hidden="true" />
          <span className="text-white font-bold text-[11px] leading-none text-center tabular-nums">
            {formatDate(org.created_at, locale)}
          </span>
          <span className="text-slate-500 text-[9px] font-bold uppercase tracking-wide text-center">
            {t('Created', 'إنشاء')}
          </span>
        </div>
      </div>

      {/* ── Footer: View Details Button ── */}
      <button
        onClick={() => onViewDetails(org)}
        aria-label={t(`View details for ${org.name}`, `عرض تفاصيل ${org.name}`)}
        className="w-full h-10 rounded-2xl bg-slate-800 hover:bg-blue-600 border border-slate-700 hover:border-blue-500 text-slate-300 hover:text-white font-bold text-sm transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
      >
        <Eye size={15} aria-hidden="true" />
        {t('View Details', 'عرض التفاصيل')}
      </button>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// ADD ORGANIZATION MODAL  (unchanged)
// ══════════════════════════════════════════════════════════════════════

type AddModalProps = {
  onClose: () => void;
  onSuccess: () => void;
  t: (en: string, ar: string) => string;
  isRTL: boolean;
};

function AddOrganizationModal({ onClose, onSuccess, t, isRTL }: AddModalProps) {
  const [name, setName]     = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError(t('Please enter an organization name', 'يرجى إدخال اسم المجموعة'));
      return;
    }

    try {
      setSaving(true);
      setError('');

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        throw new Error(t('Please sign in first', 'يرجى تسجيل الدخول أولاً'));
      }

      const payload: OrganizationInsert = {
        name: trimmedName,
        owner_id: user.id,
      };

      const { error: insertError } = await supabase
        .from('organizations')
        .insert(payload);

      if (insertError) throw insertError;

      onSuccess();
      onClose();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : t('An error occurred while saving', 'حدث خطأ أثناء الحفظ');
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      dir={isRTL ? 'rtl' : 'ltr'}
      role="dialog"
      aria-modal="true"
      aria-label={t('Add Organization', 'إضافة مجموعة')}
    >
      <div
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-700 rounded-[2rem] shadow-2xl overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-500/50 to-transparent" aria-hidden="true" />

        {/* Header */}
        <div className="flex items-center justify-between px-7 pt-7 pb-5 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/15 border border-blue-500/20 flex items-center justify-center" aria-hidden="true">
              <Plus size={16} className="text-blue-400" />
            </div>
            <div>
              <h3 className="text-white font-black text-lg leading-none">{t('Add Organization', 'إضافة مجموعة')}</h3>
              <p className="text-slate-500 text-xs mt-0.5">{t('New organization for the platform', 'مجموعة جديدة للمنصة')}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label={t('Close modal', 'إغلاق النافذة')}
            className="p-2 hover:bg-slate-800 rounded-xl transition-all text-slate-400 hover:text-white"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className="px-7 py-6 space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="org-name-input"
              className="text-xs text-slate-400 font-bold uppercase tracking-wide"
            >
              {t('Organization Name', 'اسم المجموعة')}
            </label>
            <input
              id="org-name-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !saving && handleSave()}
              placeholder={t('e.g. Gulf Commercial Group', 'مثال: مجموعة الخليج التجارية')}
              aria-label={t('Organization name', 'اسم المجموعة')}
              className="w-full bg-slate-950 border border-slate-700 rounded-2xl px-4 h-12 text-white text-sm focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all"
              autoFocus
            />
          </div>
          {error && (
            <div
              className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-3"
              role="alert"
            >
              <AlertCircle size={15} className="text-red-400 shrink-0" aria-hidden="true" />
              <span className="text-red-400 text-sm font-bold">{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-7 pb-7 pt-2 border-t border-slate-800/60">
          <button
            onClick={onClose}
            disabled={saving}
            aria-label={t('Cancel', 'إلغاء')}
            className="flex-1 h-12 rounded-2xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 font-bold text-sm transition-all"
          >
            {t('Cancel', 'إلغاء')}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            aria-label={t('Add organization', 'إضافة المجموعة')}
            className="flex-1 h-12 rounded-2xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold text-sm transition-all flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <RefreshCw size={14} className="animate-spin" aria-hidden="true" />
                {t('Saving…', 'جاري الحفظ...')}
              </>
            ) : (
              <>
                <Plus size={14} aria-hidden="true" />
                {t('Add Organization', 'إضافة المجموعة')}
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
// Now shows live groups count instead of "Coming Soon"
// ══════════════════════════════════════════════════════════════════════

type DetailsDrawerProps = {
  org: OrganizationSummary;
  /** Full allGroups array — count is derived fresh inside the drawer via
   *  Number() normalisation so stale map keys never cause a mismatch. */
  allGroups: OrgGroup[];
  onClose: () => void;
  /** Called after any mutation so the parent card grid stays in sync */
  onRefresh: () => Promise<void>;
  t: (en: string, ar: string) => string;
  isRTL: boolean;
  locale: string;
};

function DetailsDrawer({ org, allGroups, onClose, onRefresh, t, isRTL, locale }: DetailsDrawerProps) {
  const initial = (org.name || 'O').charAt(0).toUpperCase();

  // Count derived fresh — Number() on both sides prevents type-mismatch zeros
  const organizationGroupsCount = allGroups.filter(
    (g) => Number(g.organization_id) === Number(org.id),
  ).length;

  // ── Branch management state ──────────────────────────────────────────
  const [branches, setBranches]           = useState<OrgBranch[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(true);
  const [branchError, setBranchError]     = useState<string | null>(null);
  const [removingId, setRemovingId]       = useState<number | null>(null);

  // Add-branch sub-panel
  const [showAddBranch, setShowAddBranch]   = useState(false);
  const [availShops, setAvailShops]         = useState<AvailableShop[]>([]);
  const [shopsLoading, setShopsLoading]     = useState(false);
  const [shopSearch, setShopSearch]         = useState('');
  const [selectedShopId, setSelectedShopId] = useState<number | null>(null);
  const [linking, setLinking]               = useState(false);
  const [linkError, setLinkError]           = useState<string | null>(null);

  // ── Load branches for this org ────────────────────────────────────────
  const loadBranches = useCallback(async () => {
    try {
      setBranchesLoading(true);
      setBranchError(null);
      const { data, error } = await supabase
        .from('shops')
        .select('id, shop_name, city, is_active')
        .eq('organization_id', org.id)
        .order('shop_name', { ascending: true });
      if (error) throw error;
      setBranches((data as OrgBranch[]) ?? []);
    } catch (err: unknown) {
      setBranchError(err instanceof Error ? err.message : t('Failed to load branches', 'فشل تحميل الفروع'));
    } finally {
      setBranchesLoading(false);
    }
  }, [org.id, t]);

  useEffect(() => { loadBranches(); }, [loadBranches]);

  // ── Load available shops when add panel opens ─────────────────────────
  const loadAvailShops = useCallback(async () => {
    try {
      setShopsLoading(true);
      setLinkError(null);
      const { data, error } = await supabase
        .from('shops')
        .select('id, shop_name, city, is_active, organization_id')
        .or(`organization_id.is.null,organization_id.eq.${org.id}`)
        .order('shop_name', { ascending: true });
      if (error) throw error;
      setAvailShops((data as AvailableShop[]) ?? []);
    } catch (err: unknown) {
      setLinkError(err instanceof Error ? err.message : t('Failed to load shops', 'فشل تحميل المحلات'));
    } finally {
      setShopsLoading(false);
    }
  }, [org.id, t]);

  useEffect(() => {
    if (showAddBranch) { setSelectedShopId(null); setShopSearch(''); loadAvailShops(); }
  }, [showAddBranch, loadAvailShops]);

  // ── Link shop to org ──────────────────────────────────────────────────
  const handleLink = async () => {
    if (!selectedShopId) return;
    try {
      setLinking(true);
      setLinkError(null);
      const { error } = await supabase
        .from('shops')
        .update({ organization_id: org.id })
        .eq('id', selectedShopId);
      if (error) throw error;
      setShowAddBranch(false);
      await loadBranches();
      await onRefresh();
    } catch (err: unknown) {
      setLinkError(err instanceof Error ? err.message : t('Failed to add branch', 'فشل إضافة الفرع'));
    } finally {
      setLinking(false);
    }
  };

  // ── Remove branch from org ────────────────────────────────────────────
  const handleRemove = async (branchId: number, branchName: string) => {
    if (!window.confirm(`${t('Remove', 'إزالة')} "${branchName}" ${t('from this organization?', 'من هذه المنظمة؟')}`)) return;
    try {
      setRemovingId(branchId);
      const { error } = await supabase
        .from('shops')
        .update({ organization_id: null, group_id: null })
        .eq('id', branchId);
      if (error) throw error;
      // Optimistic remove then re-sync
      setBranches(prev => prev.filter(b => b.id !== branchId));
      await onRefresh();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : t('Failed to remove branch', 'فشل إزالة الفرع'));
    } finally {
      setRemovingId(null);
    }
  };

  // ── Filtered available shops ──────────────────────────────────────────
  const filteredShops = useMemo(() => {
    const q = shopSearch.trim().toLowerCase();
    if (!q) return availShops;
    return availShops.filter(s =>
      s.shop_name.toLowerCase().includes(q) ||
      (s.city ?? '').toLowerCase().includes(q)
    );
  }, [availShops, shopSearch]);

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      dir={isRTL ? 'rtl' : 'ltr'}
      role="dialog"
      aria-modal="true"
      aria-label={t('Organization details', 'تفاصيل المجموعة')}
    >
      <div
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-md bg-slate-900 border-r border-slate-800 h-full shadow-2xl overflow-y-auto">
        <div className="p-6 sm:p-8">

          {/* Header */}
          <div className="flex justify-between items-center mb-8 sm:mb-10">
            <button
              onClick={onClose}
              aria-label={t('Close drawer', 'إغلاق التفاصيل')}
              className="p-2 hover:bg-slate-800 rounded-xl transition-all text-slate-400 hover:text-white"
            >
              <X size={22} aria-hidden="true" />
            </button>
            <h2 className="text-xl sm:text-2xl font-black text-white">{t('Organization Details', 'تفاصيل المجموعة')}</h2>
          </div>

          {/* Hero */}
          <div className="flex flex-col items-center mb-8 sm:mb-10 text-center">
            <div
              className="w-24 h-24 sm:w-28 sm:h-28 bg-blue-600/10 border border-blue-500/20 rounded-[2rem] flex items-center justify-center text-blue-500 text-3xl sm:text-4xl font-black mb-4"
              aria-hidden="true"
            >
              {initial}
            </div>
            <h3 className="text-xl sm:text-2xl font-black text-white">{org.name}</h3>
            <p className="text-slate-500 mt-1 font-mono text-sm">ID: {org.id}</p>
          </div>

          {/* KPI Grid: Branches + Groups + Created */}
          <div className="grid grid-cols-3 gap-3 mb-8 sm:mb-10">
            <div className="bg-slate-950 border border-slate-800/60 p-4 rounded-3xl flex flex-col items-center gap-2">
              <GitBranch size={18} className="text-emerald-500" aria-hidden="true" />
              <span className="text-2xl font-black text-white tabular-nums">
                {safeNumber(org.branches_count)}
              </span>
              <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wide text-center">
                {t('Branches', 'فروع')}
              </span>
            </div>
            <div className="bg-slate-950 border border-slate-800/60 p-4 rounded-3xl flex flex-col items-center gap-2">
              <Layers size={18} className="text-amber-400" aria-hidden="true" />
              <span className="text-2xl font-black text-white tabular-nums">
                {organizationGroupsCount}
              </span>
              <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wide text-center">
                {t('Groups', 'مجموعات')}
              </span>
            </div>
            <div className="bg-slate-950 border border-slate-800/60 p-4 rounded-3xl flex flex-col items-center gap-2">
              <Clock size={18} className="text-blue-400" aria-hidden="true" />
              <span className="text-base font-black text-white text-center leading-snug">
                {formatDate(org.created_at, locale)}
              </span>
              <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wide text-center">
                {t('Created', 'إنشاء')}
              </span>
            </div>
          </div>

          {/* Info section */}
          <div className="space-y-5">
            <h4 className="text-white font-black text-base sm:text-lg border-b border-slate-800 pb-2">
              {t('Basic Information', 'المعلومات الأساسية')}
            </h4>
            <div className="grid grid-cols-2 gap-y-6">
              <div>
                <p className="text-slate-500 text-xs font-bold uppercase mb-1">{t('Organization Name', 'اسم المجموعة')}</p>
                <p className="text-white font-bold text-sm sm:text-base break-words">{org.name || '—'}</p>
              </div>
              <div>
                <p className="text-slate-500 text-xs font-bold uppercase mb-1">{t('Identifier', 'المعرّف')}</p>
                <p className="text-white font-bold font-mono text-sm sm:text-base">#{org.id}</p>
              </div>
              <div>
                <p className="text-slate-500 text-xs font-bold uppercase mb-1">{t('Branch Count', 'عدد الفروع')}</p>
                <p className="text-emerald-400 font-black text-xl">{safeNumber(org.branches_count)}</p>
              </div>
              <div>
                <p className="text-slate-500 text-xs font-bold uppercase mb-1">{t('Group Count', 'عدد المجموعات')}</p>
                <p className="text-amber-400 font-black text-xl">{organizationGroupsCount}</p>
              </div>
              <div className="col-span-2">
                <p className="text-slate-500 text-xs font-bold uppercase mb-1">{t('Created Date', 'تاريخ الإنشاء')}</p>
                <p className="text-white font-bold text-sm sm:text-base">{formatDateRelative(org.created_at, locale)}</p>
              </div>
            </div>
          </div>

          {/* Groups summary */}
          <div className="mt-8 space-y-3">
            <h4 className="text-white font-black text-base sm:text-lg border-b border-slate-800 pb-2 flex items-center gap-2">
              <Layers size={16} className="text-amber-400" aria-hidden="true" />
              {t('Groups', 'المجموعات')}
            </h4>
            <div className="bg-slate-950/60 border border-slate-800/50 rounded-2xl p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                  <Layers size={16} className="text-amber-400" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-white font-black text-sm">
                    {organizationGroupsCount > 0
                      ? `${organizationGroupsCount} ${t('groups configured', 'مجموعة مُضافة')}`
                      : t('No groups yet', 'لا توجد مجموعات بعد')}
                  </p>
                  <p className="text-slate-500 text-xs mt-0.5">
                    {t('Manage groups inside organization details', 'يمكن إدارة المجموعات من تفاصيل المنظمة')}
                  </p>
                </div>
              </div>
              {organizationGroupsCount > 0 && (
                <span className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black border border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
                  {t('Active', 'نشطة')}
                </span>
              )}
            </div>
          </div>

          {/* ── BRANCH MANAGEMENT ─────────────────────────────────────── */}
          <div className="mt-8 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h4 className="text-white font-black text-base sm:text-lg flex items-center gap-2">
                <GitBranch size={16} className="text-emerald-400" aria-hidden="true" />
                {t('Branches', 'الفروع')}
                <span className="text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full tabular-nums">
                  {branches.length}
                </span>
              </h4>
              <button
                onClick={() => setShowAddBranch(v => !v)}
                aria-label={t('Add branch', 'إضافة فرع')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600/10 hover:bg-blue-600/20 border border-blue-500/20 text-blue-400 text-xs font-bold transition-all active:scale-95"
              >
                <Plus size={13} />
                {t('Add Branch', 'إضافة فرع')}
              </button>
            </div>

            {/* ── Add Branch sub-panel ── */}
            {showAddBranch && (
              <div className="bg-slate-950/60 border border-blue-500/20 rounded-2xl p-4 space-y-3">
                <p className="text-blue-400 font-bold text-xs uppercase tracking-wide">
                  {t('Select a shop to link', 'اختر محلاً لإضافته')}
                </p>

                {/* Search */}
                <div className="relative">
                  <Search
                    size={13}
                    className={`absolute ${isRTL ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none`}
                  />
                  <input
                    value={shopSearch}
                    onChange={e => setShopSearch(e.target.value)}
                    placeholder={t('Search shops...', 'بحث في المحلات...')}
                    aria-label={t('Search shops', 'بحث في المحلات')}
                    className={`w-full bg-slate-900 border border-slate-700 rounded-xl ${isRTL ? 'pr-8 pl-3' : 'pl-8 pr-3'} h-9 text-white text-xs focus:outline-none focus:border-blue-500/50 transition-all`}
                  />
                </div>

                {/* Shop list */}
                <div className="max-h-48 overflow-y-auto space-y-1.5">
                  {shopsLoading ? (
                    <div className="flex items-center justify-center py-6 gap-2 text-slate-500 text-xs">
                      <RefreshCw size={13} className="animate-spin" />
                      {t('Loading...', 'جاري التحميل...')}
                    </div>
                  ) : filteredShops.length === 0 ? (
                    <div className="py-6 text-center text-slate-600 text-xs">
                      {t('No shops available', 'لا توجد محلات متاحة')}
                    </div>
                  ) : filteredShops.map(shop => (
                    <button
                      key={shop.id}
                      onClick={() => setSelectedShopId(shop.id)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-right transition-all ${
                        selectedShopId === shop.id
                          ? 'bg-blue-600/15 border-blue-500/50'
                          : 'bg-slate-900/60 border-slate-800/50 hover:border-slate-700'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${selectedShopId === shop.id ? 'border-blue-500 bg-blue-600' : 'border-slate-600'}`}>
                        {selectedShopId === shop.id && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                      <div className="w-7 h-7 rounded-lg bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-blue-400 font-black text-xs shrink-0">
                        {(shop.shop_name || 'S').charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-bold text-xs truncate">{shop.shop_name}</p>
                        {shop.city && (
                          <p className="text-slate-500 text-[10px] flex items-center gap-0.5 mt-0.5">
                            <MapPin size={9} /> {shop.city}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${shop.is_active ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                          {shop.is_active ? t('Active', 'نشط') : t('Inactive', 'موقوف')}
                        </span>
                        {shop.organization_id === org.id && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full border bg-blue-500/10 text-blue-400 border-blue-500/20">
                            {t('In org', 'في المنظمة')}
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>

                {linkError && (
                  <p className="text-red-400 text-xs font-bold flex items-center gap-1.5">
                    <AlertCircle size={12} /> {linkError}
                  </p>
                )}

                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => setShowAddBranch(false)}
                    disabled={linking}
                    className="flex-1 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-all disabled:opacity-50"
                  >
                    {t('Cancel', 'إلغاء')}
                  </button>
                  <button
                    onClick={handleLink}
                    disabled={linking || !selectedShopId}
                    aria-label={t('Confirm link', 'تأكيد الإضافة')}
                    className="flex-1 h-9 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                  >
                    {linking ? <><RefreshCw size={12} className="animate-spin" /> {t('Adding...', 'جاري الإضافة...')}</> : <><Plus size={12} /> {t('Add', 'إضافة')}</>}
                  </button>
                </div>
              </div>
            )}

            {/* ── Branch list ── */}
            {branchError && (
              <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-2xl px-3 py-2.5">
                <AlertCircle size={13} className="text-red-400 shrink-0" />
                <span className="text-red-400 text-xs font-bold">{branchError}</span>
              </div>
            )}

            {branchesLoading ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-14 bg-slate-800/50 rounded-2xl animate-pulse" />
                ))}
              </div>
            ) : branches.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2 opacity-50">
                <Store size={28} className="text-slate-500" aria-hidden="true" />
                <p className="text-slate-400 text-sm font-bold">
                  {t('No branches linked yet', 'لا توجد فروع مرتبطة بعد')}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {branches.map(branch => (
                  <div
                    key={branch.id}
                    className="flex items-center gap-3 bg-slate-950/50 border border-slate-800/50 rounded-2xl px-4 py-3 hover:border-slate-700 transition-colors group"
                  >
                    {/* Avatar */}
                    <div className="w-9 h-9 rounded-xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-blue-400 font-black text-sm shrink-0">
                      {(branch.shop_name || 'S').charAt(0)}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-bold text-sm truncate">{branch.shop_name}</p>
                      {branch.city && (
                        <p className="text-slate-500 text-[11px] flex items-center gap-1 mt-0.5">
                          <MapPin size={9} /> {branch.city}
                        </p>
                      )}
                    </div>

                    {/* Status badge */}
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${branch.is_active ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                      {branch.is_active ? t('Active', 'نشط') : t('Inactive', 'موقوف')}
                    </span>

                    {/* Remove button */}
                    <button
                      onClick={() => handleRemove(branch.id, branch.shop_name)}
                      disabled={removingId === branch.id}
                      aria-label={t('Remove branch', 'إزالة الفرع')}
                      className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 transition-all disabled:opacity-50 shrink-0 opacity-0 group-hover:opacity-100"
                    >
                      {removingId === branch.id
                        ? <RefreshCw size={13} className="animate-spin" />
                        : <Trash2 size={13} />}
                    </button>
                  </div>
                ))}
              </div>
            )}
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
  const { t, isRTL } = useLang();
  const locale = isRTL ? 'ar-SA' : 'en-US';

  const [organizations, setOrganizations] = useState<OrganizationSummary[]>([]);
  // All rows from organization_groups across all orgs
  const [allGroups, setAllGroups]         = useState<OrgGroup[]>([]);
  const [fetchState, setFetchState]       = useState<FetchState>('idle');
  const [errorMessage, setErrorMessage]   = useState('');
  const [selectedOrg, setSelectedOrg]     = useState<OrganizationSummary | null>(null);
  const [showAddModal, setShowAddModal]   = useState(false);
  const [now, setNow]                     = useState(new Date());
  const [search, setSearch]               = useState('');

  // Live clock
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  // ── Fetch organizations + groups in parallel ─────────────────────────
  const fetchOrganizations = useCallback(async () => {
    try {
      setFetchState('loading');
      setErrorMessage('');

      const [orgsResult, groupsResult] = await Promise.all([
        supabase
          .from('organizations_summary')
          .select('id, name, branches_count, created_at')
          .order('created_at', { ascending: false }),
        // Graceful fallback: if table doesn't exist yet, we get an empty array
        supabase
          .from('organization_groups')
          .select('id, organization_id, name'),
      ]);

      if (orgsResult.error) throw orgsResult.error;

      setOrganizations((orgsResult.data as OrganizationSummary[]) ?? []);

      // ── Diagnostic: log the raw result so we can see if RLS/network
      // is blocking the query or if data simply isn't present.
      console.log(
        '[MIHWAR] organization_groups raw result →',
        'data:', groupsResult.data,
        '| count:', groupsResult.data?.length ?? 'n/a',
        '| error:', groupsResult.error ?? 'none',
      );

      // Groups query is non-fatal — table may not exist in all environments.
      // On failure: page continues normally, all group counts default to 0.
      if (!groupsResult.error) {
        const rows = (groupsResult.data as OrgGroup[]) ?? [];
        setAllGroups(rows);
      } else {
        console.warn(
          '[OrganizationsPage] organization_groups fetch failed',
          groupsResult.error,
        );
        setAllGroups([]);
      }

      setFetchState('success');
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : t('An error occurred while fetching data', 'حدث خطأ أثناء جلب البيانات');
      setErrorMessage(message);
      setFetchState('error');
      console.error('[OrganizationsPage] fetchOrganizations error:', err);
    }
  }, [t]);

  useEffect(() => {
    fetchOrganizations();
  }, [fetchOrganizations]);

  // ── Groups count map: organization_id → count ────────────────────────
  // Derived from allGroups — never touches the organizations table.
  // organization_id is normalised to Number() because Supabase can return
  // the value as a string (e.g. "1") which would cause a key-type mismatch
  // against the numeric org.id used in the lookup below.
  const groupsCountByOrg = useMemo(() => {
    // Diagnostic: log what allGroups contains when the memo recalculates
    console.log('[MIHWAR GROUP COUNTS] allGroups in memo:', allGroups);
    const m: Record<number, number> = {};
    for (const g of allGroups) {
      const orgId = Number(g.organization_id);
      if (!isFinite(orgId) || orgId <= 0) {
        console.warn('[MIHWAR GROUP COUNTS] skipping invalid row:', g);
        continue;
      }
      m[orgId] = (m[orgId] ?? 0) + 1;
    }
    console.log('[MIHWAR GROUP COUNTS] final map:', m);
    return m;
  }, [allGroups]);

  // ── Platform-wide derived stats ──────────────────────────────────────
  const totalBranches = useMemo(
    () => organizations.reduce((sum, o) => sum + safeNumber(o.branches_count), 0),
    [organizations],
  );

  const totalGroups = allGroups.length;

  const avgBranches = useMemo(
    () =>
      organizations.length > 0
        ? (totalBranches / organizations.length).toFixed(1)
        : '0',
    [totalBranches, organizations.length],
  );

  // ── Search (client-side) ─────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return organizations;
    return organizations.filter(
      (o) =>
        o.name?.toLowerCase().includes(q) ||
        String(o.id).includes(q),
    );
  }, [organizations, search]);

  // ── Keep selectedOrg in sync after re-fetch ──────────────────────────
  // (So the drawer reflects fresh branch/group counts without closing.)
  const syncedSelectedOrg = useMemo(() => {
    if (!selectedOrg) return null;
    return organizations.find(o => o.id === selectedOrg.id) ?? selectedOrg;
  }, [selectedOrg, organizations]);

  // ════════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════════

  return (
    <div
      className="min-h-screen bg-slate-950 p-4 lg:p-8"
      style={{ textAlign: isRTL ? 'right' : 'left' }}
      dir={isRTL ? 'rtl' : 'ltr'}
    >

      {/* ── SECTION 1: HEADER ── */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 mb-10">
        <div>
          <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight flex items-center gap-4 flex-wrap">
            {t('Organizations', 'المجموعات')}
            <span className="text-sm font-medium bg-blue-500/10 text-blue-500 px-3 py-1 rounded-full border border-blue-500/20">
              {organizations.length} {t('org', 'مجموعة')}
            </span>
          </h1>
          <p className="text-slate-400 mt-2 text-base sm:text-lg">
            {t(
              'Manage all organizations and groups registered on the platform.',
              'إدارة جميع المجموعات والتنظيمات المسجلة داخل المنصة.',
            )}
          </p>
        </div>

        <div className="flex items-center gap-3 w-full lg:w-auto flex-wrap">
          {/* Refresh */}
          <button
            onClick={fetchOrganizations}
            disabled={fetchState === 'loading'}
            aria-label={t('Refresh organizations', 'تحديث المجموعات')}
            className="p-3 bg-slate-900 border border-slate-800 rounded-2xl text-slate-400 hover:text-white transition-all disabled:opacity-50"
          >
            <RefreshCw
              size={20}
              aria-hidden="true"
              className={fetchState === 'loading' ? 'animate-spin' : ''}
            />
          </button>

          {/* Date + Time */}
          <div className="flex items-center gap-4 bg-slate-900 border border-slate-800/60 rounded-2xl px-5 py-3 shadow-xl">
            <div className="flex items-center gap-2">
              <CalendarDays size={16} className="text-blue-400 shrink-0" aria-hidden="true" />
              <div className="text-right">
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest leading-none mb-0.5">
                  {now.toLocaleDateString(locale, { weekday: 'long' })}
                </p>
                <p className="text-white font-black text-sm leading-none">
                  {now.toLocaleDateString(locale, {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                  })}
                </p>
              </div>
            </div>
            <div className="w-px h-8 bg-slate-700" aria-hidden="true" />
            <div className="flex items-center gap-2">
              <Clock size={16} className="text-emerald-400 shrink-0" aria-hidden="true" />
              <p className="text-white font-black text-sm tabular-nums">
                {now.toLocaleTimeString(locale, {
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
            aria-label={t('Add organization', 'إضافة مجموعة')}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 active:scale-[0.98] text-white font-black rounded-2xl px-5 py-3 shadow-lg shadow-blue-900/30 transition-all"
          >
            <Plus size={18} aria-hidden="true" />
            <span className="hidden sm:inline">{t('Add Organization', 'إضافة مجموعة')}</span>
          </button>
        </div>
      </div>

      {/* ── SECTION 2: KPI CARDS ── */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          {
            label: t('Total Organizations', 'إجمالي المجموعات'),
            value: organizations.length,
            icon: Building2,
            color: 'text-blue-500',
            bg: 'bg-blue-500/5',
          },
          {
            label: t('Total Groups', 'إجمالي المجموعات الفرعية'),
            value: totalGroups,
            icon: Layers,
            color: 'text-amber-500',
            bg: 'bg-amber-500/5',
          },
          {
            label: t('Total Branches', 'إجمالي الفروع'),
            value: totalBranches,
            icon: GitBranch,
            color: 'text-emerald-500',
            bg: 'bg-emerald-500/5',
          },
          {
            label: t('Avg. Branches / Org', 'متوسط الفروع للمجموعة'),
            value: avgBranches,
            icon: CalendarDays,
            color: 'text-purple-400',
            bg: 'bg-purple-500/5',
          },
        ].map((card, i) => (
          <div
            key={i}
            className="bg-slate-900 border border-slate-800/60 p-5 rounded-3xl hover:border-slate-700 transition-all hover:scale-[1.02] duration-300 shadow-xl"
          >
            <div className="flex justify-between items-start mb-3">
              <div className={`p-2.5 ${card.bg} rounded-2xl`}>
                <card.icon className={card.color} size={20} aria-hidden="true" />
              </div>
            </div>
            <p className="text-slate-400 font-medium text-sm">{card.label}</p>
            <h3 className="text-3xl font-black text-white mt-0.5 tabular-nums">{card.value}</h3>
          </div>
        ))}
      </div>

      {/* ── PLATFORM STATS BANNER (replaces Coming Soon) ── */}
      <div className="mb-8">
        <div className="bg-slate-900 border border-slate-800/60 rounded-3xl p-5 sm:p-6 shadow-xl">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 bg-blue-500/5 rounded-2xl">
              <Layers size={18} className="text-blue-400" aria-hidden="true" />
            </div>
            <h3 className="text-white font-black text-base">
              {t('Platform Overview', 'نظرة عامة على المنصة')}
            </h3>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              {
                label: t('Organizations', 'منظمات'),
                value: organizations.length,
                color: 'text-blue-400',
                bg: 'bg-blue-500/10 border-blue-500/20',
              },
              {
                label: t('Branch Groups', 'مجموعات فروع'),
                value: totalGroups,
                color: 'text-amber-400',
                bg: 'bg-amber-500/10 border-amber-500/20',
              },
              {
                label: t('Branches', 'فروع'),
                value: totalBranches,
                color: 'text-emerald-400',
                bg: 'bg-emerald-500/10 border-emerald-500/20',
              },
            ].map((stat, i) => (
              <div
                key={i}
                className={`border rounded-2xl p-3 sm:p-4 flex flex-col items-center justify-center gap-1 text-center ${stat.bg}`}
              >
                <span className={`text-2xl sm:text-3xl font-black tabular-nums ${stat.color}`}>
                  {stat.value}
                </span>
                <span className="text-slate-400 text-[10px] sm:text-xs font-bold uppercase tracking-wide">
                  {stat.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── SECTION: SEARCH ── */}
      {fetchState === 'success' && organizations.length > 0 && (
        <div className="relative mb-6">
          <div
            className={`absolute inset-y-0 ${isRTL ? 'right-0 pr-4' : 'left-0 pl-4'} flex items-center pointer-events-none text-slate-500`}
            aria-hidden="true"
          >
            <Search size={18} />
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('Search by name or ID…', 'ابحث بالاسم أو المعرف...')}
            aria-label={t('Search organizations', 'بحث في المجموعات')}
            className={`w-full bg-slate-900 border border-slate-800 rounded-2xl py-3.5 ${isRTL ? 'pr-11 pl-11' : 'pl-11 pr-11'} text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 transition-all placeholder:text-slate-600 shadow-sm text-sm`}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              aria-label={t('Clear search', 'مسح البحث')}
              className={`absolute inset-y-0 ${isRTL ? 'left-0 pl-4' : 'right-0 pr-4'} flex items-center text-slate-500 hover:text-white transition-colors`}
            >
              <X size={16} aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      {/* ── SECTION 3: LOADING ── */}
      {fetchState === 'loading' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )}

      {/* ── SECTION 4: ERROR ── */}
      {fetchState === 'error' && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-3xl p-8 sm:p-10 text-center max-w-lg mx-auto">
          <AlertCircle size={44} className="text-red-400 mx-auto mb-4" aria-hidden="true" />
          <h3 className="text-red-400 font-black text-xl mb-2">
            {t('Failed to load data', 'حدث خطأ في جلب البيانات')}
          </h3>
          <p className="text-slate-400 text-sm mb-6 font-mono break-words">{errorMessage}</p>
          <button
            onClick={fetchOrganizations}
            aria-label={t('Retry loading organizations', 'إعادة محاولة تحميل المجموعات')}
            className="inline-flex items-center gap-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-400 font-bold rounded-2xl px-6 py-3 transition-all"
          >
            <RefreshCw size={16} aria-hidden="true" />
            {t('Retry', 'إعادة المحاولة')}
          </button>
        </div>
      )}

      {/* ── SECTION 5: EMPTY STATE ── */}
      {fetchState === 'success' && organizations.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 sm:py-32 gap-4">
          <div className="w-20 h-20 rounded-3xl bg-slate-900 border border-slate-800 flex items-center justify-center mb-2">
            <PackageSearch size={36} className="text-slate-600" aria-hidden="true" />
          </div>
          <p className="text-slate-400 font-bold text-lg">
            {t('No organizations registered yet', 'لا توجد مجموعات مسجلة بعد')}
          </p>
          <p className="text-slate-600 text-sm">
            {t('Start by adding the first organization to the platform', 'ابدأ بإضافة أول مجموعة للمنصة')}
          </p>
          <button
            onClick={() => setShowAddModal(true)}
            aria-label={t('Add first organization', 'إضافة أول مجموعة')}
            className="mt-2 flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-2xl px-6 py-3 transition-all"
          >
            <Plus size={16} aria-hidden="true" />
            {t('Add Organization', 'إضافة مجموعة')}
          </button>
        </div>
      )}

      {/* ── SEARCH EMPTY STATE ── */}
      {fetchState === 'success' && organizations.length > 0 && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
          <Search size={32} className="text-slate-600" aria-hidden="true" />
          <p className="text-slate-400 font-bold">
            {t('No organizations match your search', 'لا توجد مجموعات تطابق البحث')}
          </p>
          <button
            onClick={() => setSearch('')}
            className="text-blue-400 text-sm font-bold hover:underline"
          >
            {t('Clear search', 'مسح البحث')}
          </button>
        </div>
      )}

      {/* ── SECTION 6: ORGANIZATIONS GRID ── */}
      {fetchState === 'success' && filtered.length > 0 && (
        <>
          {search && (
            <p className="text-slate-500 text-xs font-bold mb-4">
              {t(
                `${filtered.length} result(s) for "${search}"`,
                `${filtered.length} نتيجة للبحث عن "${search}"`,
              )}
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
            {filtered.map((org) => (
              <OrganizationCard
                key={org.id}
                org={org}
                groupsCount={groupsCountByOrg[org.id] ?? 0}
                onViewDetails={(o) => setSelectedOrg(o)}
                t={t}
                locale={locale}
              />
            ))}
          </div>
        </>
      )}

      {/* ── SECTION 7: ADD MODAL ── */}
      {showAddModal && (
        <AddOrganizationModal
          onClose={() => setShowAddModal(false)}
          onSuccess={fetchOrganizations}
          t={t}
          isRTL={isRTL}
        />
      )}

      {/* ── SECTION 8: DETAILS DRAWER ── */}
      {syncedSelectedOrg && (
        <DetailsDrawer
          org={syncedSelectedOrg}
          allGroups={allGroups}
          onClose={() => setSelectedOrg(null)}
          onRefresh={fetchOrganizations}
          t={t}
          isRTL={isRTL}
          locale={locale}
        />
      )}

    </div>
  );
}
