import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
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

type Branch = {
  id: number;
  shop_name: string;
  city: string | null;
  is_active: boolean;
  organization_id: number | null;
  visibility_mode: string | null;
};

// Shops that have no organization yet — candidates for linking
type UnlinkedShop = {
  id: number;
  shop_name: string;
  city: string | null;
  is_active: boolean;
};

type FetchState = 'idle' | 'loading' | 'success' | 'error';

// ══════════════════════════════════════════════════════════════════════
// PROPS
// ══════════════════════════════════════════════════════════════════════

type Props = {
  organizationId: number;
  onBack?: () => void;   // optional: called when "Back" button is pressed
};

// ══════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ar-SA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function visibilityLabel(mode: string | null): { label: string; cls: string; icon: React.ReactNode } {
  switch (mode) {
    case 'public':
      return { label: 'عام',    cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', icon: <Globe size={11} /> };
    case 'private':
      return { label: 'خاص',   cls: 'bg-slate-700/60   text-slate-400  border-slate-600/40',    icon: <EyeOff size={11} /> };
    case 'internal':
      return { label: 'داخلي', cls: 'bg-blue-500/10    text-blue-400   border-blue-500/20',     icon: <Eye size={11} /> };
    default:
      return { label: mode ?? '—', cls: 'bg-slate-700/60 text-slate-500 border-slate-600/40',   icon: <Eye size={11} /> };
  }
}

// ══════════════════════════════════════════════════════════════════════
// ADD BRANCH MODAL
// Fetches shops WHERE organization_id IS NULL, lets admin pick one,
// then UPDATEs shops SET organization_id = organizationId.
// ══════════════════════════════════════════════════════════════════════

type AddBranchModalProps = {
  organizationId: number;
  onClose: () => void;
  onSuccess: () => void;
};

function AddBranchModal({ organizationId, onClose, onSuccess }: AddBranchModalProps) {
  const [shops, setShops]         = useState<UnlinkedShop[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [selected, setSelected]   = useState<number | null>(null);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');

  // Fetch all shops that are not yet linked to any organization
  useEffect(() => {
    const fetchUnlinked = async () => {
      try {
        setLoading(true);
        const { data, error: fetchError } = await supabase
          .from('shops')
          .select('id, shop_name, city, is_active')
          .is('organization_id', null)
          .order('shop_name', { ascending: true });

        if (fetchError) throw fetchError;
        setShops((data as UnlinkedShop[]) ?? []);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'فشل تحميل المحلات');
      } finally {
        setLoading(false);
      }
    };
    fetchUnlinked();
  }, []);

  const filtered = shops.filter((s) =>
    s.shop_name.toLowerCase().includes(search.toLowerCase()) ||
    (s.city ?? '').toLowerCase().includes(search.toLowerCase()),
  );

  const handleLink = async () => {
    if (!selected) {
      setError('يرجى اختيار محل أولاً');
      return;
    }
    try {
      setSaving(true);
      setError('');

      // UPDATE shops SET organization_id = organizationId WHERE id = selected
      const { error: updateError } = await supabase
        .from('shops')
        .update({ organization_id: organizationId })
        .eq('id', selected);

      if (updateError) throw updateError;

      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'فشل ربط الفرع');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-700 rounded-[2rem] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Accent line */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-500/50 to-transparent" />

        {/* Header */}
        <div className="flex items-center justify-between px-7 pt-7 pb-5 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/15 border border-blue-500/20 flex items-center justify-center">
              <Plus size={16} className="text-blue-400" />
            </div>
            <div>
              <h3 className="text-white font-black text-lg leading-none">إضافة فرع للمجموعة</h3>
              <p className="text-slate-500 text-xs mt-0.5">اختر محلاً غير مرتبط بأي مجموعة</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-xl transition-all text-slate-400 hover:text-white">
            <X size={18} />
          </button>
        </div>

        {/* Search */}
        <div className="px-7 pt-5 pb-3 shrink-0">
          <div className="relative">
            <Search size={15} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث باسم المحل أو المدينة..."
              className="w-full bg-slate-950 border border-slate-700 rounded-2xl pr-10 pl-4 h-11 text-white text-sm focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-7 pb-3 min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-12 gap-3">
              <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <span className="text-slate-500 text-sm">جاري التحميل...</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 opacity-50">
              <Store size={36} className="text-slate-500" />
              <p className="text-slate-400 text-sm font-bold">
                {search ? 'لا توجد نتائج' : 'لا توجد محلات غير مرتبطة'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((shop) => (
                <button
                  key={shop.id}
                  onClick={() => setSelected(shop.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all text-right ${
                    selected === shop.id
                      ? 'bg-blue-600/15 border-blue-500/50 shadow-sm'
                      : 'bg-slate-950/50 border-slate-800/50 hover:border-slate-700'
                  }`}
                >
                  {/* Radio indicator */}
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                    selected === shop.id ? 'border-blue-500 bg-blue-600' : 'border-slate-600'
                  }`}>
                    {selected === shop.id && <div className="w-2 h-2 rounded-full bg-white" />}
                  </div>

                  {/* Avatar */}
                  <div className="w-9 h-9 rounded-xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-blue-400 font-black text-sm shrink-0">
                    {(shop.shop_name || 'S').charAt(0)}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-bold text-sm truncate">{shop.shop_name}</p>
                    {shop.city && (
                      <p className="text-slate-500 text-xs flex items-center gap-1 mt-0.5">
                        <MapPin size={10} />
                        {shop.city}
                      </p>
                    )}
                  </div>

                  {/* Status */}
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${
                    shop.is_active
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      : 'bg-red-500/10 text-red-400 border-red-500/20'
                  }`}>
                    {shop.is_active ? 'نشط' : 'موقوف'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="mx-7 mb-3 flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-3 shrink-0">
            <AlertCircle size={14} className="text-red-400 shrink-0" />
            <span className="text-red-400 text-sm font-bold">{error}</span>
          </div>
        )}

        {/* Footer */}
        <div className="flex gap-3 px-7 pb-7 pt-3 border-t border-slate-800/60 shrink-0">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 h-12 rounded-2xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 font-bold text-sm transition-all"
          >
            إلغاء
          </button>
          <button
            onClick={handleLink}
            disabled={saving || !selected}
            className="flex-1 h-12 rounded-2xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm transition-all flex items-center justify-center gap-2"
          >
            {saving ? (
              <><RefreshCw size={14} className="animate-spin" /> جاري الربط...</>
            ) : (
              <><Plus size={14} /> ربط الفرع</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════════════

export default function OrganizationDetailsPage({ organizationId, onBack }: Props) {
  const [org, setOrg]                   = useState<Organization | null>(null);
  const [branches, setBranches]         = useState<Branch[]>([]);
  const [fetchState, setFetchState]     = useState<FetchState>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [removingId, setRemovingId]     = useState<number | null>(null);
  const [now, setNow]                   = useState(new Date());

  // Live clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  // ── Fetch organization + its branches ─────────────────────────────
  const fetchData = useCallback(async () => {
    try {
      setFetchState('loading');
      setErrorMessage('');

      // Fetch the organization row
      const { data: orgData, error: orgError } = await supabase
        .from('organizations')
        .select('id, name, owner_id, is_active, created_at')
        .eq('id', organizationId)
        .single();

      if (orgError) throw orgError;
      setOrg(orgData as Organization);

      // Fetch all shops linked to this organization
      const { data: branchData, error: branchError } = await supabase
        .from('shops')
        .select('id, shop_name, city, is_active, organization_id, visibility_mode')
        .eq('organization_id', organizationId)
        .order('shop_name', { ascending: true });

      if (branchError) throw branchError;
      setBranches((branchData as Branch[]) ?? []);

      setFetchState('success');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'حدث خطأ أثناء جلب البيانات';
      setErrorMessage(message);
      setFetchState('error');
      console.error('[OrganizationDetailsPage] fetchData error:', err);
    }
  }, [organizationId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Remove branch from organization ───────────────────────────────
  // UPDATE shops SET organization_id = NULL WHERE id = branchId
  const handleRemoveBranch = async (branchId: number, branchName: string) => {
    const confirmed = window.confirm(
      `هل تريد إزالة "${branchName}" من هذه المجموعة؟\nلن يتم حذف المحل، فقط إلغاء ارتباطه.`,
    );
    if (!confirmed) return;

    try {
      setRemovingId(branchId);

      const { error } = await supabase
        .from('shops')
        .update({ organization_id: null })
        .eq('id', branchId);

      if (error) throw error;

      // Optimistic update — remove from local state immediately
      setBranches((prev) => prev.filter((b) => b.id !== branchId));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'فشل إزالة الفرع';
      alert(message);
    } finally {
      setRemovingId(null);
    }
  };

  // ── Derived ────────────────────────────────────────────────────────
  const activeBranches   = branches.filter((b) => b.is_active).length;
  const inactiveBranches = branches.filter((b) => !b.is_active).length;

  // ════════════════════════════════════════════════════════════════════
  // LOADING STATE
  // ════════════════════════════════════════════════════════════════════
  if (fetchState === 'loading' || fetchState === 'idle') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center" dir="rtl">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-500 font-bold">جاري تحميل تفاصيل المجموعة...</p>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════
  // ERROR STATE
  // ════════════════════════════════════════════════════════════════════
  if (fetchState === 'error' || !org) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4" dir="rtl">
        <div className="bg-red-500/10 border border-red-500/20 rounded-3xl p-10 text-center max-w-lg w-full">
          <AlertCircle size={44} className="text-red-400 mx-auto mb-4" />
          <h3 className="text-red-400 font-black text-xl mb-2">حدث خطأ في جلب البيانات</h3>
          <p className="text-slate-400 text-sm mb-6 font-mono">{errorMessage}</p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={fetchData}
              className="inline-flex items-center gap-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-400 font-bold rounded-2xl px-6 py-3 transition-all"
            >
              <RefreshCw size={16} /> إعادة المحاولة
            </button>
            {onBack && (
              <button
                onClick={onBack}
                className="inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 font-bold rounded-2xl px-6 py-3 transition-all"
              >
                <ArrowRight size={16} /> رجوع
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════
  // MAIN RENDER
  // ════════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-slate-950 p-4 lg:p-8 text-right" dir="rtl">

      {/* ── SECTION 1: HEADER ─────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 mb-10">

        {/* Left: back + title */}
        <div className="flex items-start gap-4">
          {onBack && (
            <button
              onClick={onBack}
              className="mt-1 p-2.5 bg-slate-900 border border-slate-800 rounded-2xl text-slate-400 hover:text-white transition-all shrink-0"
            >
              <ArrowRight size={18} />
            </button>
          )}
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-4xl font-black text-white tracking-tight">{org.name}</h1>
              <span className={`text-xs font-black px-3 py-1 rounded-full border ${
                org.is_active
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  : 'bg-red-500/10 text-red-400 border-red-500/20'
              }`}>
                {org.is_active ? 'نشطة' : 'موقوفة'}
              </span>
            </div>
            <p className="text-slate-400 mt-1.5 text-base flex items-center gap-2">
              <CalendarDays size={14} className="text-blue-400 shrink-0" />
              تأسست في {formatDate(org.created_at)}
            </p>
          </div>
        </div>

        {/* Right: clock + refresh + add */}
        <div className="flex items-center gap-3 w-full lg:w-auto flex-wrap">
          <button
            onClick={fetchData}
            disabled={fetchState === 'loading'}
            className="p-3 bg-slate-900 border border-slate-800 rounded-2xl text-slate-400 hover:text-white transition-all disabled:opacity-50"
          >
            <RefreshCw size={20} className={fetchState === 'loading' ? 'animate-spin' : ''} />
          </button>

          {/* Date + Time widget */}
          <div className="flex items-center gap-4 bg-slate-900 border border-slate-800/60 rounded-2xl px-5 py-3 shadow-xl">
            <div className="flex items-center gap-2">
              <CalendarDays size={16} className="text-blue-400 shrink-0" />
              <div className="text-right">
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest leading-none mb-0.5">
                  {now.toLocaleDateString('ar-SA', { weekday: 'long' })}
                </p>
                <p className="text-white font-black text-sm leading-none">
                  {now.toLocaleDateString('ar-SA', { year: 'numeric', month: '2-digit', day: '2-digit' })}
                </p>
              </div>
            </div>
            <div className="w-px h-8 bg-slate-700" />
            <div className="flex items-center gap-2">
              <Clock size={16} className="text-emerald-400 shrink-0" />
              <p className="text-white font-black text-sm tabular-nums">
                {now.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit', hour12: true })}
              </p>
            </div>
          </div>

          {/* Add branch */}
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 active:scale-[0.98] text-white font-black rounded-2xl px-5 py-3 shadow-lg shadow-blue-900/30 transition-all"
          >
            <Plus size={18} />
            <span className="hidden sm:inline">إضافة فرع</span>
          </button>
        </div>
      </div>

      {/* ── SECTION 2: KPI CARDS ──────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-10">
        {[
          {
            label: 'إجمالي الفروع',
            value: branches.length,
            icon: GitBranch,
            color: 'text-blue-500',
            bg: 'bg-blue-500/5',
          },
          {
            label: 'الفروع النشطة',
            value: activeBranches,
            icon: CheckCircle,
            color: 'text-emerald-500',
            bg: 'bg-emerald-500/5',
          },
          {
            label: 'الفروع الموقوفة',
            value: inactiveBranches,
            icon: XCircle,
            color: 'text-red-500',
            bg: 'bg-red-500/5',
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
              <span className="text-slate-500 text-xs font-black uppercase tracking-widest">Global Stat</span>
            </div>
            <p className="text-slate-400 font-medium">{card.label}</p>
            <h3 className="text-3xl font-black text-white mt-1">{card.value}</h3>
          </div>
        ))}
      </div>

      {/* ── SECTION 3: BRANCHES TABLE ─────────────────────────────── */}
      <div className="bg-slate-900 border border-slate-800/60 rounded-[2.5rem] overflow-hidden shadow-2xl">

        {/* Table header bar */}
        <div className="flex items-center justify-between px-6 lg:px-8 py-5 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <Building2 size={18} className="text-blue-400" />
            <h2 className="text-white font-black text-lg">الفروع التابعة للمجموعة</h2>
            <span className="text-xs font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2.5 py-0.5 rounded-full">
              {branches.length} فرع
            </span>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="hidden sm:flex items-center gap-2 bg-blue-600/10 hover:bg-blue-600/20 border border-blue-500/20 text-blue-400 font-bold rounded-2xl px-4 py-2 text-sm transition-all"
          >
            <Plus size={14} /> إضافة فرع
          </button>
        </div>

        {/* Empty state */}
        {branches.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 opacity-50">
            <PackageSearch size={52} className="text-slate-500" />
            <p className="text-slate-400 font-bold text-lg">لا توجد فروع مرتبطة بهذه المجموعة</p>
            <p className="text-slate-600 text-sm">اضغط على "إضافة فرع" لربط محل بهذه المجموعة</p>
          </div>
        ) : (
          <>
            {/* ── Desktop Table ── */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-right" style={{ minWidth: '600px' }}>
                <thead>
                  <tr className="bg-slate-950/50 text-slate-500 text-xs font-black uppercase tracking-widest border-b border-slate-800">
                    <th className="px-8 py-5">اسم الفرع</th>
                    <th className="px-8 py-5">المدينة</th>
                    <th className="px-8 py-5 text-center">الحالة</th>
                    <th className="px-8 py-5 text-center">وضع الظهور</th>
                    <th className="px-8 py-5 text-center">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {branches.map((branch) => {
                    const vis = visibilityLabel(branch.visibility_mode);
                    return (
                      <tr key={branch.id} className="group hover:bg-slate-800/30 transition-all duration-200">

                        {/* Name */}
                        <td className="px-8 py-5">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-2xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-blue-400 font-black text-sm shrink-0">
                              {(branch.shop_name || 'S').charAt(0)}
                            </div>
                            <p className="text-white font-black group-hover:text-blue-400 transition-colors">
                              {branch.shop_name}
                            </p>
                          </div>
                        </td>

                        {/* City */}
                        <td className="px-8 py-5">
                          <div className="flex items-center gap-2 text-slate-400">
                            <MapPin size={13} className="text-slate-600 shrink-0" />
                            <span className="font-medium">{branch.city ?? '—'}</span>
                          </div>
                        </td>

                        {/* Status */}
                        <td className="px-8 py-5 text-center">
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-2xl text-xs font-black border ${
                            branch.is_active
                              ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                              : 'bg-red-500/10 text-red-500 border-red-500/20'
                          }`}>
                            <div className={`w-1.5 h-1.5 rounded-full ${branch.is_active ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                            {branch.is_active ? 'نشط' : 'موقوف'}
                          </span>
                        </td>

                        {/* Visibility */}
                        <td className="px-8 py-5 text-center">
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-2xl text-xs font-black border ${vis.cls}`}>
                            {vis.icon}
                            {vis.label}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="px-8 py-5 text-center">
                          <button
                            onClick={() => handleRemoveBranch(branch.id, branch.shop_name)}
                            disabled={removingId === branch.id}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                          >
                            {removingId === branch.id ? (
                              <RefreshCw size={12} className="animate-spin" />
                            ) : (
                              <Trash2 size={12} />
                            )}
                            إزالة
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
              {branches.map((branch) => {
                const vis = visibilityLabel(branch.visibility_mode);
                return (
                  <div key={branch.id} className="p-5 hover:bg-slate-800/20 transition-colors">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      {/* Avatar + name */}
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
                      {/* Remove button */}
                      <button
                        onClick={() => handleRemoveBranch(branch.id, branch.shop_name)}
                        disabled={removingId === branch.id}
                        className="p-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 transition-all disabled:opacity-50 shrink-0"
                      >
                        {removingId === branch.id
                          ? <RefreshCw size={14} className="animate-spin" />
                          : <Trash2 size={14} />}
                      </button>
                    </div>

                    {/* Badges */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-black border ${
                        branch.is_active
                          ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                          : 'bg-red-500/10 text-red-500 border-red-500/20'
                      }`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${branch.is_active ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                        {branch.is_active ? 'نشط' : 'موقوف'}
                      </span>
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-black border ${vis.cls}`}>
                        {vis.icon} {vis.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* ── ADD BRANCH MODAL ──────────────────────────────────────── */}
      {showAddModal && (
        <AddBranchModal
          organizationId={organizationId}
          onClose={() => setShowAddModal(false)}
          onSuccess={fetchData}
        />
      )}

    </div>
  );
}
