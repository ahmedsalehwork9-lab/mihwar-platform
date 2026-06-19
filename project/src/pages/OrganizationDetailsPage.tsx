import { useEffect, useState, useCallback, useMemo, memo } from 'react';
import { supabase } from './lib/supabase';
import { useLang } from '../context/LanguageContext';
import {
  Building2,
  GitBranch,
  CalendarDays,
  RefreshCw,
  Plus,
  Trash2,
  AlertCircle,
  PackageSearch,
  ArrowRight,
  MapPin,
  CheckCircle,
  XCircle,
  Eye,
  EyeOff,
  Globe,
  X,
  Search,
  Store,
  Clock,
  Layers,
  ChevronDown,
  FolderOpen,
  ShieldCheck,
} from 'lucide-react';

// ══════════════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════════════

type Organization = {
  id: number;
  name: string;
  owner_id: string;
  is_active: boolean;
  created_at: string;
};

type OrganizationGroup = {
  id: number;
  organization_id: number;
  name: string;
  description?: string | null;
  is_active?: boolean;
};

type Branch = {
  id: number;
  shop_name: string;
  city: string | null;
  is_active: boolean;
  organization_id: number | null;
  visibility_mode: string | null;
  group_id?: number | null;
};

// FIX 2: UnlinkedShop now includes organization_id so we can show
// branches from the current org that may need reassignment.
type UnlinkedShop = {
  id: number;
  shop_name: string;
  city: string | null;
  is_active: boolean;
  organization_id: number | null;
};

type FetchState = 'idle' | 'loading' | 'success' | 'error';

type Props = {
  organizationId: number;
  onBack?: () => void;
};

type VisibilityMode = 'public' | 'group' | 'private' | string | null;

// FIX 4: Use a string union for the group filter so 'unassigned' is
// distinguishable from a numeric id and from 'all'.
type GroupFilter = 'all' | 'unassigned' | number;

// ══════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════

function formatDate(iso: string, lang: 'ar' | 'en'): string {
  return new Date(iso).toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function visibilityConfig(
  mode: VisibilityMode,
  t: (en: string, ar: string) => string,
): { label: string; cls: string; icon: React.ReactNode } {
  switch (mode) {
    case 'public':
      return { label: t('Public', 'عام'),    cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', icon: <Globe size={11} /> };
    case 'group':
      return { label: t('Group', 'مجموعة'), cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20',     icon: <Layers size={11} /> };
    case 'private':
      return { label: t('Private', 'خاص'),   cls: 'bg-slate-700/60 text-slate-400 border-slate-600/40',    icon: <EyeOff size={11} /> };
    case 'internal':
      return { label: t('Internal', 'داخلي'),cls: 'bg-blue-500/10 text-blue-400 border-blue-500/20',       icon: <Eye size={11} /> };
    default:
      return { label: mode ?? t('Unknown', '—'), cls: 'bg-slate-700/60 text-slate-500 border-slate-600/40', icon: <Eye size={11} /> };
  }
}

// ══════════════════════════════════════════════════════════════════════
// ADD BRANCH MODAL
// FIX 2: Query now fetches:
//   A) branches with organization_id IS NULL  (fully unlinked)
//   B) branches already in THIS organization  (may need group change)
// Branches from OTHER organizations are never returned.
// ══════════════════════════════════════════════════════════════════════

type AddBranchModalProps = {
  organizationId: number;
  onClose: () => void;
  onSuccess: () => void;
};

const AddBranchModal = memo(function AddBranchModal({
  organizationId,
  onClose,
  onSuccess,
}: AddBranchModalProps) {
  const { t, isRTL } = useLang();
  const [shops, setShops]       = useState<UnlinkedShop[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [selected, setSelected] = useState<number | null>(null);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);

        // FIX 2: Fetch shops that are either unlinked OR already belong
        // to this organization. The `.or()` filter handles both cases and
        // PostgREST never returns rows from a third organization.
        const { data, error: fetchError } = await supabase
          .from('shops')
          .select('id, shop_name, city, is_active, organization_id')
          .or(`organization_id.is.null,organization_id.eq.${organizationId}`)
          .order('shop_name', { ascending: true });

        if (fetchError) throw fetchError;
        setShops((data as UnlinkedShop[]) ?? []);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : t('Failed to load shops', 'فشل تحميل المحلات'));
      } finally {
        setLoading(false);
      }
    })();
  }, [organizationId, t]);

  const filtered = useMemo(
    () =>
      shops.filter(
        s =>
          s.shop_name.toLowerCase().includes(search.toLowerCase()) ||
          (s.city ?? '').toLowerCase().includes(search.toLowerCase()),
      ),
    [shops, search],
  );

  const handleLink = async () => {
    if (!selected) {
      setError(t('Please select a shop first', 'يرجى اختيار محل أولاً'));
      return;
    }
    try {
      setSaving(true);
      setError('');
      const { error: updateError } = await supabase
        .from('shops')
        .update({ organization_id: organizationId })
        .eq('id', selected);
      if (updateError) throw updateError;
      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('Failed to link branch', 'فشل ربط الفرع'));
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
      aria-label={t('Add branch', 'إضافة فرع')}
    >
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-700 rounded-[2rem] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-500/50 to-transparent" />

        {/* Header */}
        <div className="flex items-center justify-between px-7 pt-7 pb-5 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/15 border border-blue-500/20 flex items-center justify-center">
              <Plus size={16} className="text-blue-400" />
            </div>
            <div>
              <h3 className="text-white font-black text-lg leading-none">
                {t('Add Branch to Organization', 'إضافة فرع للمنظمة')}
              </h3>
              <p className="text-slate-500 text-xs mt-0.5">
                {t('Select an unlinked shop or reassign within this organization', 'اختر محلاً غير مرتبط أو أعد تعيينه داخل هذه المنظمة')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label={t('Close', 'إغلاق')}
            className="p-2 hover:bg-slate-800 rounded-xl transition-all text-slate-400 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        {/* Search */}
        <div className="px-7 pt-5 pb-3 shrink-0">
          <div className="relative">
            <Search
              size={15}
              className={`absolute ${isRTL ? 'right-4' : 'left-4'} top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none`}
            />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('Search by shop name or city...', 'ابحث باسم المحل أو المدينة...')}
              aria-label={t('Search shops', 'بحث في المحلات')}
              className={`w-full bg-slate-950 border border-slate-700 rounded-2xl ${isRTL ? 'pr-10 pl-4' : 'pl-10 pr-4'} h-11 text-white text-sm focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all`}
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-7 pb-3 min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-12 gap-3">
              <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <span className="text-slate-500 text-sm">{t('Loading...', 'جاري التحميل...')}</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 opacity-50">
              <Store size={36} className="text-slate-500" />
              <p className="text-slate-400 text-sm font-bold">
                {search ? t('No results', 'لا توجد نتائج') : t('No available shops', 'لا توجد محلات متاحة')}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map(shop => (
                <button
                  key={shop.id}
                  onClick={() => setSelected(shop.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all text-right ${
                    selected === shop.id
                      ? 'bg-blue-600/15 border-blue-500/50 shadow-sm'
                      : 'bg-slate-950/50 border-slate-800/50 hover:border-slate-700'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                      selected === shop.id ? 'border-blue-500 bg-blue-600' : 'border-slate-600'
                    }`}
                  >
                    {selected === shop.id && <div className="w-2 h-2 rounded-full bg-white" />}
                  </div>
                  <div className="w-9 h-9 rounded-xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-blue-400 font-black text-sm shrink-0">
                    {(shop.shop_name || 'S').charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0 text-right">
                    <p className="text-white font-bold text-sm truncate">{shop.shop_name}</p>
                    {shop.city && (
                      <p className="text-slate-500 text-xs flex items-center gap-1 mt-0.5 justify-end">
                        <MapPin size={10} /> {shop.city}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        shop.is_active
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : 'bg-red-500/10 text-red-400 border-red-500/20'
                      }`}
                    >
                      {shop.is_active ? t('Active', 'نشط') : t('Inactive', 'موقوف')}
                    </span>
                    {/* FIX 2: show "In this org" tag so admin knows it's a reassignment */}
                    {shop.organization_id === organizationId && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full border bg-blue-500/10 text-blue-400 border-blue-500/20 whitespace-nowrap">
                        {t('In org', 'داخل المنظمة')}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {error && (
          <div className="mx-7 mb-3 flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-3 shrink-0">
            <AlertCircle size={14} className="text-red-400 shrink-0" />
            <span className="text-red-400 text-sm font-bold">{error}</span>
          </div>
        )}

        <div className="flex gap-3 px-7 pb-7 pt-3 border-t border-slate-800/60 shrink-0">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 h-12 rounded-2xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 font-bold text-sm transition-all"
          >
            {t('Cancel', 'إلغاء')}
          </button>
          <button
            onClick={handleLink}
            disabled={saving || !selected}
            className="flex-1 h-12 rounded-2xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm transition-all flex items-center justify-center gap-2"
          >
            {saving ? (
              <><RefreshCw size={14} className="animate-spin" /> {t('Linking...', 'جاري الربط...')}</>
            ) : (
              <><Plus size={14} /> {t('Link Branch', 'ربط الفرع')}</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
});

// ══════════════════════════════════════════════════════════════════════
// CREATE GROUP MODAL
// ══════════════════════════════════════════════════════════════════════

type CreateGroupModalProps = {
  organizationId: number;
  onClose: () => void;
  onSuccess: () => void;
};

const CreateGroupModal = memo(function CreateGroupModal({
  organizationId,
  onClose,
  onSuccess,
}: CreateGroupModalProps) {
  const { t, isRTL } = useLang();
  const [name, setName]        = useState('');
  const [description, setDesc] = useState('');
  const [saving, setSaving]    = useState(false);
  const [error, setError]      = useState('');

  const handleCreate = async () => {
    if (!name.trim()) {
      setError(t('Group name is required', 'اسم المجموعة مطلوب'));
      return;
    }
    try {
      setSaving(true);
      setError('');
      const { error: insertError } = await supabase
        .from('organization_groups')
        .insert({
          organization_id: organizationId,
          name: name.trim(),
          description: description.trim() || null,
          is_active: true,
        });
      if (insertError) throw insertError;
      // FIX 5: onSuccess triggers full fetchData in the parent so branch
      // counts and group list are always consistent after creation.
      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('Failed to create group', 'فشل إنشاء المجموعة'));
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
      aria-label={t('Create group', 'إنشاء مجموعة')}
    >
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-700 rounded-[2rem] shadow-2xl overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent" />

        {/* Header */}
        <div className="flex items-center justify-between px-7 pt-7 pb-5 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center">
              <Layers size={16} className="text-emerald-400" />
            </div>
            <div>
              <h3 className="text-white font-black text-lg leading-none">
                {t('New Group', 'إنشاء مجموعة جديدة')}
              </h3>
              <p className="text-slate-500 text-xs mt-0.5">
                {t('Add a branch group to this organization', 'أضف مجموعة فروع لهذه المنظمة')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label={t('Close', 'إغلاق')}
            className="p-2 hover:bg-slate-800 rounded-xl transition-all text-slate-400 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        {/* Fields */}
        <div className="px-7 py-5 space-y-4">
          <div>
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">
              {t('Group Name', 'اسم المجموعة')}
            </label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t('e.g. Northern Region', 'مثال: المنطقة الشمالية')}
              aria-label={t('Group name', 'اسم المجموعة')}
              className="w-full bg-slate-950 border border-slate-700 rounded-2xl px-4 h-11 text-white text-sm focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 transition-all"
            />
          </div>
          <div>
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">
              {t('Description', 'الوصف')}{' '}
              <span className="text-slate-700 normal-case font-normal">{t('(optional)', '(اختياري)')}</span>
            </label>
            <textarea
              value={description}
              onChange={e => setDesc(e.target.value)}
              placeholder={t('Brief description...', 'وصف مختصر...')}
              rows={3}
              className="w-full bg-slate-950 border border-slate-700 rounded-2xl px-4 py-3 text-white text-sm focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 transition-all resize-none"
            />
          </div>
          {error && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-3">
              <AlertCircle size={14} className="text-red-400 shrink-0" />
              <span className="text-red-400 text-sm font-bold">{error}</span>
            </div>
          )}
        </div>

        <div className="flex gap-3 px-7 pb-7 pt-0 border-t border-slate-800/60">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 h-12 rounded-2xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 font-bold text-sm transition-all"
          >
            {t('Cancel', 'إلغاء')}
          </button>
          <button
            onClick={handleCreate}
            disabled={saving || !name.trim()}
            className="flex-1 h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm transition-all flex items-center justify-center gap-2"
          >
            {saving ? (
              <><RefreshCw size={14} className="animate-spin" /> {t('Creating...', 'جاري الإنشاء...')}</>
            ) : (
              <><Plus size={14} /> {t('Create Group', 'إنشاء المجموعة')}</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
});

// ══════════════════════════════════════════════════════════════════════
// ASSIGN GROUP INLINE SELECTOR
// FIX 5: calls onAssigned (optimistic local update) then the parent
// also re-fetches to keep group counters accurate.
// ══════════════════════════════════════════════════════════════════════

type AssignGroupProps = {
  branchId: number;
  currentGroupId: number | null | undefined;
  groups: OrganizationGroup[];
  onAssigned: (branchId: number, groupId: number | null) => void;
  /** Called after DB write succeeds — triggers parent fetchData for counters */
  onRefresh: () => Promise<void>;
  t: (en: string, ar: string) => string;
};

const AssignGroupSelect = memo(function AssignGroupSelect({
  branchId,
  currentGroupId,
  groups,
  onAssigned,
  onRefresh,
  t,
}: AssignGroupProps) {
  const [saving, setSaving] = useState(false);

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value === '' ? null : Number(e.target.value);
    try {
      setSaving(true);
      const { error } = await supabase
        .from('shops')
        .update({ group_id: val })
        .eq('id', branchId);
      if (error) throw error;
      // Optimistic update — instant UI response
      onAssigned(branchId, val);
      // Full re-fetch — keeps structure panel, counters and hierarchy in sync
      await onRefresh();
    } catch (err) {
      console.error('[AssignGroup] error:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative inline-flex items-center">
      {saving && (
        <RefreshCw
          size={11}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-blue-400 animate-spin z-10 pointer-events-none"
        />
      )}
      <select
        value={currentGroupId ?? ''}
        onChange={handleChange}
        disabled={saving}
        aria-label={t('Assign group', 'تعيين مجموعة')}
        className="appearance-none bg-slate-800 border border-slate-700 text-slate-300 text-[11px] font-bold rounded-xl pl-6 pr-3 py-1.5 focus:outline-none focus:border-blue-500 transition-all cursor-pointer disabled:opacity-50"
      >
        <option value="">{t('No group', 'بدون مجموعة')}</option>
        {groups.map(g => (
          <option key={g.id} value={g.id}>{g.name}</option>
        ))}
      </select>
      <ChevronDown
        size={10}
        className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
      />
    </div>
  );
});

// ══════════════════════════════════════════════════════════════════════
// VISIBILITY MODE INLINE SELECTOR
// ══════════════════════════════════════════════════════════════════════

type VisibilitySelectProps = {
  branchId: number;
  currentMode: VisibilityMode;
  onUpdated: (branchId: number, mode: string) => void;
  t: (en: string, ar: string) => string;
};

const VisibilitySelect = memo(function VisibilitySelect({
  branchId,
  currentMode,
  onUpdated,
  t,
}: VisibilitySelectProps) {
  const [saving, setSaving] = useState(false);

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    try {
      setSaving(true);
      const { error } = await supabase
        .from('shops')
        .update({ visibility_mode: val })
        .eq('id', branchId);
      if (error) throw error;
      onUpdated(branchId, val);
    } catch (err) {
      console.error('[VisibilitySelect] error:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative inline-flex items-center">
      {saving && (
        <RefreshCw
          size={11}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-emerald-400 animate-spin z-10 pointer-events-none"
        />
      )}
      <select
        value={currentMode ?? 'public'}
        onChange={handleChange}
        disabled={saving}
        aria-label={t('Visibility mode', 'وضع الظهور')}
        className="appearance-none bg-slate-800 border border-slate-700 text-slate-300 text-[11px] font-bold rounded-xl pl-6 pr-3 py-1.5 focus:outline-none focus:border-emerald-500 transition-all cursor-pointer disabled:opacity-50"
      >
        <option value="public">{t('Public', 'عام')}</option>
        <option value="group">{t('Group', 'مجموعة')}</option>
        <option value="private">{t('Private', 'خاص')}</option>
        <option value="internal">{t('Internal', 'داخلي')}</option>
      </select>
      <ChevronDown
        size={10}
        className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
      />
    </div>
  );
});

// ══════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════════════

export default function OrganizationDetailsPage({ organizationId, onBack }: Props) {
  const { t, isRTL } = useLang();
  const lang: 'ar' | 'en' = isRTL ? 'ar' : 'en';

  const [org, setOrg]                         = useState<Organization | null>(null);
  const [branches, setBranches]               = useState<Branch[]>([]);
  const [groups, setGroups]                   = useState<OrganizationGroup[]>([]);
  const [fetchState, setFetchState]           = useState<FetchState>('idle');
  const [errorMessage, setErrorMessage]       = useState('');
  const [showAddModal, setShowAddModal]       = useState(false);
  const [showGroupModal, setShowGroupModal]   = useState(false);
  const [removingId, setRemovingId]           = useState<number | null>(null);
  const [deletingGroupId, setDeletingGroupId] = useState<number | null>(null);
  const [now, setNow]                         = useState(new Date());

  // FIX 4: GroupFilter type ensures 'unassigned' is treated as its own case.
  const [searchQuery, setSearchQuery]               = useState('');
  const [filterGroup, setFilterGroup]               = useState<GroupFilter>('all');
  const [filterVisibility, setFilterVisibility]     = useState<string>('all');

  // Live clock
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  // ── Fetch all data ─────────────────────────────────────────────────
  // FIX 5: This is the single source of truth. Called after every
  // mutation so groups, branches and counters are always in sync.

  const fetchData = useCallback(async () => {
    try {
      setFetchState('loading');
      setErrorMessage('');

      const { data: orgData, error: orgError } = await supabase
        .from('organizations')
        .select('id, name, owner_id, is_active, created_at')
        .eq('id', organizationId)
        .single();
      if (orgError) throw orgError;
      setOrg(orgData as Organization);

      const { data: branchData, error: branchError } = await supabase
        .from('shops')
        .select('id, shop_name, city, is_active, organization_id, visibility_mode, group_id')
        .eq('organization_id', organizationId)
        .order('shop_name', { ascending: true });
      if (branchError) throw branchError;
      setBranches((branchData as Branch[]) ?? []);

      try {
        const { data: groupData, error: groupError } = await supabase
          .from('organization_groups')
          .select('id, organization_id, name, description, is_active')
          .eq('organization_id', organizationId)
          .order('name', { ascending: true });
        if (!groupError) setGroups((groupData as OrganizationGroup[]) ?? []);
      } catch {
        setGroups([]);
      }

      setFetchState('success');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('Failed to load data', 'حدث خطأ أثناء جلب البيانات');
      setErrorMessage(message);
      setFetchState('error');
      console.error('[OrganizationDetailsPage] fetchData error:', err);
    }
  }, [organizationId, t]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Delete group ───────────────────────────────────────────────────
  // FIX 5: calls fetchData() after deletion to refresh branch counters.

  const handleDeleteGroup = useCallback(async (groupId: number, groupName: string) => {
    const confirmed = window.confirm(
      `${t('Remove group', 'هل تريد حذف مجموعة')} "${groupName}"?\n${t('Branches will be unassigned but not deleted.', 'سيتم إلغاء ربط الفروع دون حذفها.')}`,
    );
    if (!confirmed) return;
    try {
      setDeletingGroupId(groupId);
      await supabase.from('shops').update({ group_id: null }).eq('group_id', groupId);
      const { error } = await supabase.from('organization_groups').delete().eq('id', groupId);
      if (error) throw error;
      // FIX 5: full re-fetch keeps branch group_id fields accurate
      await fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : t('Failed to delete group', 'فشل حذف المجموعة'));
    } finally {
      setDeletingGroupId(null);
    }
  }, [t, fetchData]);

  // ── Remove branch ──────────────────────────────────────────────────
  // FIX 1: clears both organization_id AND group_id on removal.
  // FIX 5: optimistic removal from local state; re-fetch for counters.

  const handleRemoveBranch = useCallback(async (branchId: number, branchName: string) => {
    const confirmed = window.confirm(
      `${t('Remove', 'هل تريد إزالة')} "${branchName}" ${t('from this organization?', 'من هذه المنظمة؟')}\n${t('The shop will not be deleted, only unlinked.', 'لن يتم حذف المحل، فقط إلغاء ارتباطه.')}`,
    );
    if (!confirmed) return;
    try {
      setRemovingId(branchId);
      const { error } = await supabase
        .from('shops')
        // FIX 1: null out both columns so branch is fully detached.
        .update({ organization_id: null, group_id: null })
        .eq('id', branchId);
      if (error) throw error;
      // Optimistic: remove from list immediately for snappy UX
      setBranches(prev => prev.filter(b => b.id !== branchId));
      // Full re-fetch: keeps KPI counters and structure panel accurate
      await fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : t('Failed to remove branch', 'فشل إزالة الفرع'));
    } finally {
      setRemovingId(null);
    }
  }, [t, fetchData]);

  // ── Optimistic callbacks ───────────────────────────────────────────
  // FIX 3 / FIX 5: branchCountByGroup derives from branches state which
  // is updated here optimistically. This keeps counters live without a
  // round-trip for every group assignment change.

  const handleGroupAssigned = useCallback((branchId: number, groupId: number | null) => {
    setBranches(prev => prev.map(b => b.id === branchId ? { ...b, group_id: groupId } : b));
  }, []);

  const handleVisibilityUpdated = useCallback((branchId: number, mode: string) => {
    setBranches(prev => prev.map(b => b.id === branchId ? { ...b, visibility_mode: mode } : b));
  }, []);

  // ── KPI derivations ────────────────────────────────────────────────

  const kpi = useMemo(() => ({
    totalBranches:    branches.length,
    activeBranches:   branches.filter(b => b.is_active).length,
    inactiveBranches: branches.filter(b => !b.is_active).length,
    totalGroups:      groups.length,
    activeGroups:     groups.filter(g => g.is_active !== false).length,
  }), [branches, groups]);

  // ── Search + filter ────────────────────────────────────────────────
  // FIX 4: 'unassigned' string sentinel replaces the broken -1 number.
  // null check is now correct: group_id == null catches both null and undefined.

  const filteredBranches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return branches.filter(b => {
      if (q && !b.shop_name.toLowerCase().includes(q) && !(b.city ?? '').toLowerCase().includes(q)) return false;

      if (filterGroup === 'unassigned') {
        // FIX 4: show only branches with no group assigned
        if (b.group_id != null) return false;
      } else if (filterGroup !== 'all') {
        // specific group id selected
        if (b.group_id !== filterGroup) return false;
      }

      if (filterVisibility !== 'all' && (b.visibility_mode ?? 'public') !== filterVisibility) return false;
      return true;
    });
  }, [branches, searchQuery, filterGroup, filterVisibility]);

  // FIX 3: branch counts come from branches state (shops.group_id), not from groups table.
  const groupNameMap = useMemo(() => {
    const m: Record<number, string> = {};
    groups.forEach(g => { m[g.id] = g.name; });
    return m;
  }, [groups]);

  // FIX 3: derived from branches, never from organization_groups.
  const branchCountByGroup = useMemo(() => {
    const m: Record<number, number> = {};
    branches.forEach(b => {
      if (b.group_id != null) m[b.group_id] = (m[b.group_id] ?? 0) + 1;
    });
    return m;
  }, [branches]);

  // ══════════════════════════════════════════════════════════════════════
  // LOADING / ERROR STATES
  // ══════════════════════════════════════════════════════════════════════

  if (fetchState === 'loading' || fetchState === 'idle') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center" dir={isRTL ? 'rtl' : 'ltr'}>
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-500 font-bold">{t('Loading organization details...', 'جاري تحميل تفاصيل المجموعة...')}</p>
        </div>
      </div>
    );
  }

  if (fetchState === 'error' || !org) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4" dir={isRTL ? 'rtl' : 'ltr'}>
        <div className="bg-red-500/10 border border-red-500/20 rounded-3xl p-10 text-center max-w-lg w-full">
          <AlertCircle size={44} className="text-red-400 mx-auto mb-4" />
          <h3 className="text-red-400 font-black text-xl mb-2">{t('Error loading data', 'حدث خطأ في جلب البيانات')}</h3>
          <p className="text-slate-400 text-sm mb-6 font-mono">{errorMessage}</p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={fetchData}
              className="inline-flex items-center gap-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-400 font-bold rounded-2xl px-6 py-3 transition-all"
            >
              <RefreshCw size={16} /> {t('Retry', 'إعادة المحاولة')}
            </button>
            {onBack && (
              <button
                onClick={onBack}
                className="inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 font-bold rounded-2xl px-6 py-3 transition-all"
              >
                <ArrowRight size={16} /> {t('Back', 'رجوع')}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  // MAIN RENDER
  // ══════════════════════════════════════════════════════════════════════

  return (
    <div className="min-h-screen bg-slate-950 p-4 lg:p-8" dir={isRTL ? 'rtl' : 'ltr'}>

      {/* ── SECTION 1: HEADER ─────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 mb-10">
        <div className="flex items-start gap-4">
          {onBack && (
            <button
              onClick={onBack}
              aria-label={t('Go back', 'رجوع')}
              className="mt-1 p-2.5 bg-slate-900 border border-slate-800 rounded-2xl text-slate-400 hover:text-white transition-all shrink-0"
            >
              <ArrowRight size={18} />
            </button>
          )}
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-4xl font-black text-white tracking-tight">{org.name}</h1>
              <span className={`text-xs font-black px-3 py-1 rounded-full border ${org.is_active ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                {org.is_active ? t('Active', 'نشطة') : t('Inactive', 'موقوفة')}
              </span>
            </div>
            <p className="text-slate-400 mt-1.5 text-base flex items-center gap-2">
              <CalendarDays size={14} className="text-blue-400 shrink-0" />
              {t('Founded', 'تأسست في')} {formatDate(org.created_at, lang)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full lg:w-auto flex-wrap">
          <button
            onClick={fetchData}
            disabled={fetchState === 'loading'}
            aria-label={t('Refresh', 'تحديث')}
            className="p-3 bg-slate-900 border border-slate-800 rounded-2xl text-slate-400 hover:text-white transition-all disabled:opacity-50"
          >
            <RefreshCw size={20} className={fetchState === 'loading' ? 'animate-spin' : ''} />
          </button>

          {/* Date/time widget */}
          <div className="flex items-center gap-4 bg-slate-900 border border-slate-800/60 rounded-2xl px-5 py-3 shadow-xl">
            <div className="flex items-center gap-2">
              <CalendarDays size={16} className="text-blue-400 shrink-0" />
              <div className={isRTL ? 'text-right' : 'text-left'}>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest leading-none mb-0.5">
                  {now.toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US', { weekday: 'long' })}
                </p>
                <p className="text-white font-black text-sm leading-none">
                  {now.toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US', { year: 'numeric', month: '2-digit', day: '2-digit' })}
                </p>
              </div>
            </div>
            <div className="w-px h-8 bg-slate-700" />
            <div className="flex items-center gap-2">
              <Clock size={16} className="text-emerald-400 shrink-0" />
              <p className="text-white font-black text-sm tabular-nums">
                {now.toLocaleTimeString(lang === 'ar' ? 'ar-SA' : 'en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowAddModal(true)}
            aria-label={t('Add branch', 'إضافة فرع')}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 active:scale-[0.98] text-white font-black rounded-2xl px-5 py-3 shadow-lg shadow-blue-900/30 transition-all"
          >
            <Plus size={18} />
            <span className="hidden sm:inline">{t('Add Branch', 'إضافة فرع')}</span>
          </button>
        </div>
      </div>

      {/* ── SECTION 2: KPI CARDS ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-10">
        {[
          { label: t('Total Groups',    'إجمالي المجموعات'), value: kpi.totalGroups,     icon: Layers,      color: 'text-purple-400', bg: 'bg-purple-500/5' },
          { label: t('Total Branches',  'إجمالي الفروع'),    value: kpi.totalBranches,   icon: GitBranch,   color: 'text-blue-500',   bg: 'bg-blue-500/5'   },
          { label: t('Active Branches', 'الفروع النشطة'),    value: kpi.activeBranches,  icon: CheckCircle, color: 'text-emerald-500',bg: 'bg-emerald-500/5'},
          { label: t('Inactive',        'الفروع الموقوفة'),  value: kpi.inactiveBranches,icon: XCircle,     color: 'text-red-500',    bg: 'bg-red-500/5'    },
          { label: t('Active Groups',   'المجموعات النشطة'), value: kpi.activeGroups,    icon: ShieldCheck, color: 'text-amber-400',  bg: 'bg-amber-500/5'  },
        ].map((card, i) => (
          <div
            key={i}
            className="bg-slate-900 border border-slate-800/60 p-5 rounded-3xl hover:border-slate-700 transition-all hover:scale-[1.02] duration-300 shadow-xl"
          >
            <div className="flex justify-between items-start mb-3">
              <div className={`p-2.5 ${card.bg} rounded-2xl`}>
                <card.icon className={card.color} size={20} />
              </div>
            </div>
            <p className="text-slate-400 font-medium text-sm">{card.label}</p>
            <h3 className="text-3xl font-black text-white mt-0.5">{card.value}</h3>
          </div>
        ))}
      </div>

      {/* ── SECTION 3: ORGANIZATION STRUCTURE PANEL ───────────────────── */}
      <div className="bg-slate-900 border border-slate-800/60 rounded-3xl p-6 mb-8 shadow-xl">
        <div className="flex items-center gap-3 mb-5">
          <FolderOpen size={18} className="text-amber-400" />
          <h2 className="text-white font-black text-lg">{t('Organization Structure', 'هيكل المنظمة')}</h2>
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-3 px-4 py-3 bg-slate-800/50 rounded-2xl border border-slate-700/50">
            <Building2 size={16} className="text-blue-400 shrink-0" />
            <span className="text-white font-black">{org.name}</span>
            <span className="text-slate-500 text-xs mr-auto">{t('Organization', 'منظمة')}</span>
          </div>
          {groups.length === 0 ? (
            <div className="px-8 py-4 text-slate-600 text-sm italic">
              {t('No groups yet', 'لا توجد مجموعات بعد')}
            </div>
          ) : (
            <div className="px-4 space-y-1.5">
              {groups.map(g => (
                <div key={g.id} className="flex items-center gap-3 px-4 py-2.5 bg-slate-800/30 rounded-xl border border-slate-800/50">
                  <div className="w-3 h-3 rounded-full bg-slate-700 shrink-0" />
                  <Layers size={13} className="text-amber-400 shrink-0" />
                  <span className="text-slate-200 font-bold text-sm">{g.name}</span>
                  <span className="text-slate-500 text-xs">
                    {/* FIX 3: count comes from branches state, not from groups table */}
                    {branchCountByGroup[g.id] ?? 0} {t('branches', 'فرع')}
                  </span>
                  {g.is_active === false && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 mr-auto">
                      {t('Inactive', 'موقوفة')}
                    </span>
                  )}
                </div>
              ))}
              {branches.filter(b => !b.group_id).length > 0 && (
                <div className="flex items-center gap-3 px-4 py-2.5 bg-slate-800/20 rounded-xl border border-dashed border-slate-800">
                  <div className="w-3 h-3 rounded-full bg-slate-700 shrink-0" />
                  <Store size={13} className="text-slate-500 shrink-0" />
                  <span className="text-slate-500 text-sm italic">
                    {branches.filter(b => !b.group_id).length} {t('unassigned branches', 'فروع غير مصنفة')}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── SECTION 4: GROUP MANAGEMENT ───────────────────────────────── */}
      <div className="bg-slate-900 border border-slate-800/60 rounded-[2.5rem] overflow-hidden shadow-2xl mb-8">
        <div className="flex items-center justify-between px-6 lg:px-8 py-5 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <Layers size={18} className="text-amber-400" />
            <h2 className="text-white font-black text-lg">{t('Branch Groups', 'مجموعات الفروع')}</h2>
            <span className="text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2.5 py-0.5 rounded-full">
              {groups.length} {t('groups', 'مجموعة')}
            </span>
          </div>
          <button
            onClick={() => setShowGroupModal(true)}
            aria-label={t('Create new group', 'إنشاء مجموعة جديدة')}
            className="flex items-center gap-2 bg-amber-600/10 hover:bg-amber-600/20 border border-amber-500/20 text-amber-400 font-bold rounded-2xl px-4 py-2 text-sm transition-all active:scale-95"
          >
            <Plus size={14} /> {t('New Group', 'مجموعة جديدة')}
          </button>
        </div>

        {groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4 opacity-50">
            <Layers size={40} className="text-slate-500" />
            <p className="text-slate-400 font-bold">{t('No groups yet', 'لا توجد مجموعات بعد')}</p>
            <p className="text-slate-600 text-sm">{t('Create a group to organize branches', 'أنشئ مجموعة لتصنيف الفروع')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-6">
            {groups.map(g => {
              const count = branchCountByGroup[g.id] ?? 0;
              return (
                <div
                  key={g.id}
                  className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-4 hover:border-slate-600 transition-all group"
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 font-black text-sm shrink-0">
                        {g.name.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-white font-black truncate text-sm">{g.name}</p>
                        {g.description && <p className="text-slate-500 text-xs truncate mt-0.5">{g.description}</p>}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteGroup(g.id, g.name)}
                      disabled={deletingGroupId === g.id}
                      aria-label={t('Delete group', 'حذف المجموعة')}
                      className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 transition-all disabled:opacity-50 shrink-0 opacity-0 group-hover:opacity-100"
                    >
                      {deletingGroupId === g.id ? <RefreshCw size={12} className="animate-spin" /> : <Trash2 size={12} />}
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-slate-400 flex items-center gap-1">
                      <GitBranch size={11} className="text-slate-500" />
                      {count} {t('branches', 'فرع')}
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${g.is_active !== false ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                      {g.is_active !== false ? t('Active', 'نشطة') : t('Inactive', 'موقوفة')}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── SECTION 5: SEARCH + FILTER BAR ───────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search
            size={15}
            className={`absolute ${isRTL ? 'right-4' : 'left-4'} top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none`}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={t('Search branch name or city...', 'ابحث باسم الفرع أو المدينة...')}
            aria-label={t('Search branches', 'بحث في الفروع')}
            className={`w-full bg-slate-900 border border-slate-800 rounded-2xl ${isRTL ? 'pr-10 pl-4' : 'pl-10 pr-4'} h-11 text-white text-sm focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all`}
          />
        </div>

        {/* FIX 4: group filter uses 'unassigned' string, not -1 number */}
        <div className="relative shrink-0">
          <select
            value={filterGroup}
            onChange={e => {
              const v = e.target.value;
              if (v === 'all' || v === 'unassigned') setFilterGroup(v as GroupFilter);
              else setFilterGroup(Number(v));
            }}
            aria-label={t('Filter by group', 'تصفية حسب المجموعة')}
            className="appearance-none bg-slate-900 border border-slate-800 rounded-2xl px-4 pr-8 h-11 text-slate-300 text-sm focus:outline-none focus:border-blue-500 transition-all cursor-pointer min-w-[140px]"
          >
            <option value="all">{t('All Groups', 'جميع المجموعات')}</option>
            {/* FIX 4: sentinel value is the string 'unassigned' */}
            <option value="unassigned">{t('Unassigned', 'غير مصنف')}</option>
            {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <ChevronDown
            size={13}
            className={`absolute ${isRTL ? 'left-3' : 'right-3'} top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none`}
          />
        </div>

        <div className="relative shrink-0">
          <select
            value={filterVisibility}
            onChange={e => setFilterVisibility(e.target.value)}
            aria-label={t('Filter by visibility', 'تصفية حسب الظهور')}
            className="appearance-none bg-slate-900 border border-slate-800 rounded-2xl px-4 pr-8 h-11 text-slate-300 text-sm focus:outline-none focus:border-blue-500 transition-all cursor-pointer min-w-[140px]"
          >
            <option value="all">{t('All Visibility', 'جميع أوضاع الظهور')}</option>
            <option value="public">{t('Public', 'عام')}</option>
            <option value="group">{t('Group', 'مجموعة')}</option>
            <option value="private">{t('Private', 'خاص')}</option>
            <option value="internal">{t('Internal', 'داخلي')}</option>
          </select>
          <ChevronDown
            size={13}
            className={`absolute ${isRTL ? 'left-3' : 'right-3'} top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none`}
          />
        </div>
      </div>

      {/* ── SECTION 6: BRANCHES TABLE ─────────────────────────────────── */}
      <div className="bg-slate-900 border border-slate-800/60 rounded-[2.5rem] overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-6 lg:px-8 py-5 border-b border-slate-800">
          <div className="flex items-center gap-3 flex-wrap">
            <Building2 size={18} className="text-blue-400" />
            <h2 className="text-white font-black text-lg">{t('Branches', 'الفروع التابعة للمجموعة')}</h2>
            <span className="text-xs font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2.5 py-0.5 rounded-full">
              {filteredBranches.length} / {branches.length} {t('branches', 'فرع')}
            </span>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            aria-label={t('Add branch', 'إضافة فرع')}
            className="hidden sm:flex items-center gap-2 bg-blue-600/10 hover:bg-blue-600/20 border border-blue-500/20 text-blue-400 font-bold rounded-2xl px-4 py-2 text-sm transition-all active:scale-95"
          >
            <Plus size={14} /> {t('Add Branch', 'إضافة فرع')}
          </button>
        </div>

        {filteredBranches.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 opacity-50">
            <PackageSearch size={52} className="text-slate-500" />
            <p className="text-slate-400 font-bold text-lg">
              {branches.length === 0
                ? t('No branches linked to this organization', 'لا توجد فروع مرتبطة بهذه المجموعة')
                : t('No branches match your filter', 'لا توجد فروع مطابقة للبحث')}
            </p>
            {branches.length === 0 && (
              <p className="text-slate-600 text-sm">{t('Click "Add Branch" to link a shop', 'اضغط على "إضافة فرع" لربط محل')}</p>
            )}
          </div>
        ) : (
          <>
            {/* ── Desktop Table ── */}
            <div className="hidden md:block overflow-x-auto">
              <table
                className="w-full"
                style={{ minWidth: '780px' }}
                role="grid"
                aria-label={t('Branches table', 'جدول الفروع')}
              >
                <thead>
                  <tr className={`bg-slate-950/50 text-slate-500 text-xs font-black uppercase tracking-widest border-b border-slate-800 ${isRTL ? 'text-right' : 'text-left'}`}>
                    <th scope="col" className="px-8 py-5">{t('Branch Name', 'اسم الفرع')}</th>
                    <th scope="col" className="px-8 py-5">{t('City', 'المدينة')}</th>
                    <th scope="col" className="px-8 py-5 text-center">{t('Status', 'الحالة')}</th>
                    <th scope="col" className="px-8 py-5">{t('Group', 'المجموعة')}</th>
                    <th scope="col" className="px-8 py-5">{t('Visibility', 'وضع الظهور')}</th>
                    <th scope="col" className="px-8 py-5 text-center">{t('Actions', 'الإجراءات')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {filteredBranches.map(branch => {
                    const vis = visibilityConfig(branch.visibility_mode, t);
                    return (
                      <tr key={branch.id} className="group hover:bg-slate-800/30 transition-all duration-200">
                        <td className="px-8 py-5">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-2xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-blue-400 font-black text-sm shrink-0">
                              {(branch.shop_name || 'S').charAt(0)}
                            </div>
                            <p className="text-white font-black group-hover:text-blue-400 transition-colors">{branch.shop_name}</p>
                          </div>
                        </td>
                        <td className="px-8 py-5">
                          <div className="flex items-center gap-2 text-slate-400">
                            <MapPin size={13} className="text-slate-600 shrink-0" />
                            <span className="font-medium">{branch.city ?? '—'}</span>
                          </div>
                        </td>
                        <td className="px-8 py-5 text-center">
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-2xl text-xs font-black border ${branch.is_active ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20'}`}>
                            <div className={`w-1.5 h-1.5 rounded-full ${branch.is_active ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                            {branch.is_active ? t('Active', 'نشط') : t('Inactive', 'موقوف')}
                          </span>
                        </td>
                        <td className="px-8 py-5">
                          {groups.length > 0 ? (
                            <AssignGroupSelect
                              branchId={branch.id}
                              currentGroupId={branch.group_id}
                              groups={groups}
                              onAssigned={handleGroupAssigned}
                              onRefresh={fetchData}
                              t={t}
                            />
                          ) : (
                            <span className="text-slate-600 text-xs italic">
                              {groupNameMap[branch.group_id ?? 0] ?? t('No groups', 'لا توجد مجموعات')}
                            </span>
                          )}
                        </td>
                        <td className="px-8 py-5">
                          <VisibilitySelect
                            branchId={branch.id}
                            currentMode={branch.visibility_mode}
                            onUpdated={handleVisibilityUpdated}
                            t={t}
                          />
                        </td>
                        <td className="px-8 py-5 text-center">
                          <button
                            onClick={() => handleRemoveBranch(branch.id, branch.shop_name)}
                            disabled={removingId === branch.id}
                            aria-label={t('Remove branch', 'إزالة الفرع')}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                          >
                            {removingId === branch.id ? <RefreshCw size={12} className="animate-spin" /> : <Trash2 size={12} />}
                            {t('Remove', 'إزالة')}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* ── Mobile Cards ── */}
            <div className="md:hidden divide-y divide-slate-800/40">
              {filteredBranches.map(branch => {
                const vis = visibilityConfig(branch.visibility_mode, t);
                return (
                  <div key={branch.id} className="p-5 hover:bg-slate-800/20 transition-colors">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-2xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-blue-400 font-black text-sm shrink-0">
                          {(branch.shop_name || 'S').charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-white font-black truncate">{branch.shop_name}</p>
                          {branch.city && (
                            <p className="text-slate-500 text-xs flex items-center gap-1 mt-0.5">
                              <MapPin size={10} /> {branch.city}
                            </p>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveBranch(branch.id, branch.shop_name)}
                        disabled={removingId === branch.id}
                        aria-label={t('Remove branch', 'إزالة الفرع')}
                        className="p-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 transition-all disabled:opacity-50 shrink-0"
                      >
                        {removingId === branch.id ? <RefreshCw size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      </button>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap mb-3">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-black border ${branch.is_active ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20'}`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${branch.is_active ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                        {branch.is_active ? t('Active', 'نشط') : t('Inactive', 'موقوف')}
                      </span>
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-black border ${vis.cls}`}>
                        {vis.icon} {vis.label}
                      </span>
                      {branch.group_id != null && groupNameMap[branch.group_id] && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-black border bg-amber-500/10 text-amber-400 border-amber-500/20">
                          <Layers size={10} /> {groupNameMap[branch.group_id]}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {groups.length > 0 && (
                        <AssignGroupSelect
                          branchId={branch.id}
                          currentGroupId={branch.group_id}
                          groups={groups}
                          onAssigned={handleGroupAssigned}
                          onRefresh={fetchData}
                          t={t}
                        />
                      )}
                      <VisibilitySelect
                        branchId={branch.id}
                        currentMode={branch.visibility_mode}
                        onUpdated={handleVisibilityUpdated}
                        t={t}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* ── MODALS ──────────────────────────────────────────────────────── */}
      {showAddModal && (
        <AddBranchModal
          organizationId={organizationId}
          onClose={() => setShowAddModal(false)}
          onSuccess={fetchData}
        />
      )}
      {showGroupModal && (
        <CreateGroupModal
          organizationId={organizationId}
          onClose={() => setShowGroupModal(false)}
          onSuccess={fetchData}
        />
      )}
    </div>
  );
}
