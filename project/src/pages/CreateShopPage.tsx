import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  Store,
  User,
  Mail,
  Phone,
  MapPin,
  Lock,
  CheckCircle,
  Building2,
  FileText,
  ShieldCheck,
  Zap,
  Crown,
  Users,
  ToggleLeft,
  ToggleRight,
  X,
  ArrowRight,
  Plus,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

type AccountStatus = 'active' | 'suspended';
type AccountType = 'basic' | 'pro' | 'enterprise';

type ShopStats = {
  total: number;
  active: number;
  trial: number;
};

type SuccessInfo = {
  shop_name: string;
  email: string;
  city: string;
};

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

const InputField = ({
  label,
  icon,
  required = false,
  optional = false,
  error,
  ...props
}: {
  label: string;
  icon: React.ReactNode;
  required?: boolean;
  optional?: boolean;
  error?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) => (
  <div>
    <label className="text-slate-300 text-sm mb-1.5 flex items-center gap-1.5 block">
      {label}
      {optional && (
        <span className="text-slate-500 text-xs font-normal">(اختياري)</span>
      )}
    </label>
    <div className="relative">
      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none">
        {icon}
      </span>
      <input
        {...props}
        required={required}
        className={`w-full bg-slate-950 border ${
          error ? 'border-red-500/60' : 'border-slate-700'
        } hover:border-slate-600 focus:border-blue-500 rounded-2xl py-3 pr-12 pl-4 text-white text-sm placeholder-slate-600 transition-colors outline-none`}
      />
    </div>
    {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
  </div>
);

const CardHeader = ({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
}) => (
  <div className="flex items-center gap-3 mb-6">
    <div className="p-2.5 bg-blue-600/15 rounded-xl">{icon}</div>
    <div>
      <h2 className="text-white font-bold text-base">{title}</h2>
      {subtitle && <p className="text-slate-500 text-xs mt-0.5">{subtitle}</p>}
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────
// SUCCESS MODAL
// ─────────────────────────────────────────────────────────────

const SuccessModal = ({
  info,
  onNewClient,
  onGoToShops,
}: {
  info: SuccessInfo;
  onNewClient: () => void;
  onGoToShops: () => void;
}) => (
  <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
    <div className="bg-slate-900 border border-slate-700 rounded-3xl p-8 w-full max-w-md shadow-2xl">
      {/* Icon */}
      <div className="flex justify-center mb-5">
        <div className="w-16 h-16 bg-emerald-500/15 border border-emerald-500/25 rounded-full flex items-center justify-center">
          <CheckCircle size={32} className="text-emerald-400" />
        </div>
      </div>

      <h3 className="text-white font-bold text-xl text-center mb-1">
        تم إنشاء العميل بنجاح
      </h3>
      <p className="text-slate-500 text-sm text-center mb-6">
        تم إنشاء المحل والحساب وربطهما بنجاح
      </p>

      {/* Info */}
      <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4 space-y-3 mb-6">
        {[
          { label: 'اسم المحل', value: info.shop_name },
          { label: 'البريد الإلكتروني', value: info.email },
          { label: 'المدينة', value: info.city },
        ].map(({ label, value }) => (
          <div key={label} className="flex items-center justify-between">
            <span className="text-slate-400 text-sm">{label}</span>
            <span className="text-white text-sm font-medium">{value || '—'}</span>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={onNewClient}
          className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl py-3 text-sm font-semibold transition-colors"
        >
          <Plus size={16} />
          إنشاء عميل جديد
        </button>
        <button
          onClick={onGoToShops}
          className="flex-1 flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-2xl py-3 text-sm font-medium transition-colors border border-slate-700"
        >
          المحلات
          <ArrowRight size={14} />
        </button>
      </div>
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────

export default function CreateShopPage() {
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<ShopStats>({ total: 0, active: 0, trial: 0 });
  const [successInfo, setSuccessInfo] = useState<SuccessInfo | null>(null);
  const [passwordError, setPasswordError] = useState('');

  // ── Account settings (UI-only, no backend yet) ──
  const [accountStatus, setAccountStatus] = useState<AccountStatus>('active');
  const [accountType, setAccountType] = useState<AccountType>('basic');

  // ── Form state (original fields + new UI fields) ──
  const [form, setForm] = useState({
    shop_name: '',
    owner_name: '',
    email: '',
    password: '',
    confirm_password: '',
    phone: '',
    city: '',
    address: '',
    commercial_reg: '',
  });

  const updateField = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (field === 'password' || field === 'confirm_password') {
      setPasswordError('');
    }
  };

  // ── Load stats on mount ──
  useEffect(() => {
    const loadStats = async () => {
      const [totalRes, activeRes, trialRes] = await Promise.all([
        supabase.from('shops').select('id', { count: 'exact', head: true }),
        supabase
          .from('shops')
          .select('id', { count: 'exact', head: true })
          .eq('is_active', true),
        supabase
          .from('shops')
          .select('id', { count: 'exact', head: true })
          .eq('is_trial', true),
      ]);
      setStats({
        total: totalRes.count ?? 0,
        active: activeRes.count ?? 0,
        trial: trialRes.count ?? 0,
      });
    };
    loadStats();
  }, []);

  // ── Original handleSubmit — unchanged business logic ──
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate passwords match
    if (form.password !== form.confirm_password) {
      setPasswordError('كلمة المرور وتأكيدها غير متطابقتين');
      return;
    }

    try {
      setLoading(true);

      // Pass only original fields to the Edge Function
      const { data, error } = await supabase.functions.invoke('create-shop', {
        body: {
          shop_name: form.shop_name,
          owner_name: form.owner_name,
          email: form.email,
          password: form.password,
          phone: form.phone,
          city: form.city,
        },
      });

      if (error) throw error;

      console.log(data);

      // Show success modal instead of alert
      setSuccessInfo({
        shop_name: form.shop_name,
        email: form.email,
        city: form.city,
      });

      // Reset form
      setForm({
        shop_name: '',
        owner_name: '',
        email: '',
        password: '',
        confirm_password: '',
        phone: '',
        city: '',
        address: '',
        commercial_reg: '',
      });
      setAccountStatus('active');
      setAccountType('basic');

      // Refresh stats
      const [totalRes, activeRes] = await Promise.all([
        supabase.from('shops').select('id', { count: 'exact', head: true }),
        supabase
          .from('shops')
          .select('id', { count: 'exact', head: true })
          .eq('is_active', true),
      ]);
      setStats((prev) => ({
        ...prev,
        total: totalRes.count ?? prev.total,
        active: activeRes.count ?? prev.active,
      }));
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'حدث خطأ أثناء إنشاء المحل');
    } finally {
      setLoading(false);
    }
  };

  const accountTypeConfig: Record<
    AccountType,
    { label: string; icon: React.ReactNode; color: string; active: string }
  > = {
    basic: {
      label: 'Basic',
      icon: <Zap size={15} />,
      color: 'border-slate-600 text-slate-400',
      active: 'border-blue-500 bg-blue-500/10 text-blue-400',
    },
    pro: {
      label: 'Pro',
      icon: <ShieldCheck size={15} />,
      color: 'border-slate-600 text-slate-400',
      active: 'border-purple-500 bg-purple-500/10 text-purple-400',
    },
    enterprise: {
      label: 'Enterprise',
      icon: <Crown size={15} />,
      color: 'border-slate-600 text-slate-400',
      active: 'border-amber-500 bg-amber-500/10 text-amber-400',
    },
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-12">

      {/* ══════════════════════════════════════════
          SECTION 1 — STATS
      ══════════════════════════════════════════ */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          {
            label: 'إجمالي المحلات',
            value: stats.total,
            icon: <Store size={20} className="text-blue-400" />,
            bg: 'bg-blue-500/10',
            border: 'border-blue-500/20',
          },
          {
            label: 'المحلات النشطة',
            value: stats.active,
            icon: <CheckCircle size={20} className="text-emerald-400" />,
            bg: 'bg-emerald-500/10',
            border: 'border-emerald-500/20',
          },
          {
            label: 'حسابات تجريبية',
            value: stats.trial,
            icon: <Users size={20} className="text-amber-400" />,
            bg: 'bg-amber-500/10',
            border: 'border-amber-500/20',
          },
        ].map((s) => (
          <div
            key={s.label}
            className={`bg-slate-900 border ${s.border} rounded-3xl p-5 flex items-center gap-4`}
          >
            <div className={`p-3 rounded-2xl ${s.bg} flex-shrink-0`}>
              {s.icon}
            </div>
            <div>
              <p className="text-slate-400 text-xs mb-1">{s.label}</p>
              <p className="text-white text-2xl font-black">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Page title */}
      <div>
        <h1 className="text-white text-2xl font-black">إنشاء عميل جديد</h1>
        <p className="text-slate-500 text-sm mt-1">
          إنشاء محل جديد وربطه بصاحبه من لوحة الأدمن
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* ══ LEFT: Forms ══ */}
        <form
          onSubmit={handleSubmit}
          className="xl:col-span-2 space-y-6"
        >

          {/* ──────────────────────────────────────
              SECTION 3 — SHOP INFO
          ────────────────────────────────────── */}
          <div className="bg-slate-900 border border-slate-700/60 rounded-3xl p-6 shadow-xl">
            <CardHeader
              icon={<Store size={18} className="text-blue-400" />}
              title="بيانات المحل"
              subtitle="المعلومات الأساسية للمحل"
            />
            <div className="space-y-5">
              <InputField
                label="اسم المحل"
                icon={<Store size={17} />}
                value={form.shop_name}
                onChange={(e) => updateField('shop_name', e.target.value)}
                placeholder="مثال: محل الخليج لقطع الغيار"
                required
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <InputField
                  label="الجوال"
                  icon={<Phone size={17} />}
                  value={form.phone}
                  onChange={(e) => updateField('phone', e.target.value)}
                  placeholder="05xxxxxxxx"
                  required
                />
                <InputField
                  label="المدينة"
                  icon={<MapPin size={17} />}
                  value={form.city}
                  onChange={(e) => updateField('city', e.target.value)}
                  placeholder="الرياض"
                  required
                />
              </div>
              <InputField
                label="العنوان"
                icon={<Building2 size={17} />}
                value={form.address}
                onChange={(e) => updateField('address', e.target.value)}
                placeholder="الحي، الشارع، رقم المبنى"
              />
              <InputField
                label="السجل التجاري"
                icon={<FileText size={17} />}
                optional
                value={form.commercial_reg}
                onChange={(e) => updateField('commercial_reg', e.target.value)}
                placeholder="10xxxxxxxx"
              />
            </div>
          </div>

          {/* ──────────────────────────────────────
              SECTION 4 — OWNER INFO
          ────────────────────────────────────── */}
          <div className="bg-slate-900 border border-slate-700/60 rounded-3xl p-6 shadow-xl">
            <CardHeader
              icon={<User size={18} className="text-purple-400" />}
              title="بيانات المالك"
              subtitle="بيانات الدخول وصاحب المحل"
            />
            <div className="space-y-5">
              <InputField
                label="اسم المالك"
                icon={<User size={17} />}
                value={form.owner_name}
                onChange={(e) => updateField('owner_name', e.target.value)}
                placeholder="الاسم الكامل"
                required
              />
              <InputField
                label="البريد الإلكتروني"
                icon={<Mail size={17} />}
                type="email"
                value={form.email}
                onChange={(e) => updateField('email', e.target.value)}
                placeholder="owner@example.com"
                required
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <InputField
                  label="كلمة المرور"
                  icon={<Lock size={17} />}
                  type="password"
                  value={form.password}
                  onChange={(e) => updateField('password', e.target.value)}
                  placeholder="••••••••"
                  required
                  error={passwordError ? ' ' : undefined}
                />
                <InputField
                  label="تأكيد كلمة المرور"
                  icon={<Lock size={17} />}
                  type="password"
                  value={form.confirm_password}
                  onChange={(e) => updateField('confirm_password', e.target.value)}
                  placeholder="••••••••"
                  required
                  error={passwordError}
                />
              </div>
            </div>
          </div>

          {/* ──────────────────────────────────────
              SECTION 5 — ACCOUNT SETTINGS
          ────────────────────────────────────── */}
          <div className="bg-slate-900 border border-slate-700/60 rounded-3xl p-6 shadow-xl">
            <CardHeader
              icon={<ShieldCheck size={18} className="text-teal-400" />}
              title="إعدادات الحساب"
              subtitle="نوع الحساب والحالة الابتدائية"
            />

            {/* Status toggle */}
            <div className="mb-6">
              <p className="text-slate-400 text-xs font-medium mb-3 uppercase tracking-wider">
                حالة الحساب
              </p>
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => setAccountStatus('active')}
                  className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                    accountStatus === 'active'
                      ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                      : 'border-slate-700 text-slate-500 hover:border-slate-600'
                  }`}
                >
                  <ToggleRight
                    size={18}
                    className={
                      accountStatus === 'active'
                        ? 'text-emerald-400'
                        : 'text-slate-600'
                    }
                  />
                  نشط
                </button>
                <button
                  type="button"
                  onClick={() => setAccountStatus('suspended')}
                  className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                    accountStatus === 'suspended'
                      ? 'border-red-500 bg-red-500/10 text-red-400'
                      : 'border-slate-700 text-slate-500 hover:border-slate-600'
                  }`}
                >
                  <ToggleLeft
                    size={18}
                    className={
                      accountStatus === 'suspended'
                        ? 'text-red-400'
                        : 'text-slate-600'
                    }
                  />
                  موقوف
                </button>
              </div>
            </div>

            {/* Account type */}
            <div>
              <p className="text-slate-400 text-xs font-medium mb-3 uppercase tracking-wider">
                نوع الحساب
              </p>
              <div className="grid grid-cols-3 gap-3">
                {(Object.keys(accountTypeConfig) as AccountType[]).map(
                  (type) => {
                    const cfg = accountTypeConfig[type];
                    const isActive = accountType === type;
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setAccountType(type)}
                        className={`flex flex-col items-center gap-2 p-4 rounded-2xl border text-sm font-medium transition-all ${
                          isActive ? cfg.active : cfg.color + ' hover:border-slate-500'
                        }`}
                      >
                        {cfg.icon}
                        <span>{cfg.label}</span>
                        {isActive && (
                          <span className="w-1.5 h-1.5 rounded-full bg-current" />
                        )}
                      </button>
                    );
                  }
                )}
              </div>
            </div>
          </div>

          {/* ──────────────────────────────────────
              SECTION 6 — SUBMIT
          ────────────────────────────────────── */}
          <button
            type="submit"
            disabled={loading}
            className="w-full relative overflow-hidden bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white py-4 rounded-2xl font-bold text-base shadow-lg shadow-blue-500/20 transition-all duration-200 group"
          >
            <span className="flex items-center justify-center gap-2">
              {loading ? (
                <>
                  <svg
                    className="animate-spin h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v8H4z"
                    />
                  </svg>
                  جاري إنشاء العميل...
                </>
              ) : (
                <>
                  <Plus size={18} />
                  إنشاء العميل
                </>
              )}
            </span>
          </button>
        </form>

        {/* ══ RIGHT: Summary Card ══ */}
        <div className="space-y-5">

          {/* ──────────────────────────────────────
              SECTION 2 — QUICK SUMMARY
          ────────────────────────────────────── */}
          <div className="bg-slate-900 border border-slate-700/60 rounded-3xl p-6 shadow-xl sticky top-6">
            <div className="flex items-center gap-2.5 mb-5">
              <div className="p-2 bg-blue-500/10 rounded-xl">
                <CheckCircle size={17} className="text-blue-400" />
              </div>
              <h2 className="text-white font-bold text-sm">ملخص العملية</h2>
            </div>

            <div className="space-y-3">
              {[
                { label: 'إنشاء محل جديد', done: !!form.shop_name },
                { label: 'إنشاء حساب مالك المحل', done: !!form.email && !!form.password },
                { label: 'إنشاء ملف شخصي', done: !!form.owner_name },
                { label: 'ربط المحل بالمالك', done: !!form.shop_name && !!form.owner_name },
                { label: 'تفعيل الحساب', done: accountStatus === 'active' },
              ].map(({ label, done }) => (
                <div key={label} className="flex items-center gap-3">
                  <div
                    className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-300 ${
                      done
                        ? 'bg-emerald-500/20 border border-emerald-500/40'
                        : 'bg-slate-800 border border-slate-700'
                    }`}
                  >
                    {done ? (
                      <CheckCircle size={12} className="text-emerald-400" />
                    ) : (
                      <X size={10} className="text-slate-600" />
                    )}
                  </div>
                  <span
                    className={`text-sm transition-colors ${
                      done ? 'text-slate-200' : 'text-slate-500'
                    }`}
                  >
                    {label}
                  </span>
                </div>
              ))}
            </div>

            {/* Progress bar */}
            <div className="mt-5">
              {(() => {
                const steps = [
                  !!form.shop_name,
                  !!form.email && !!form.password,
                  !!form.owner_name,
                  !!form.shop_name && !!form.owner_name,
                  accountStatus === 'active',
                ];
                const pct = Math.round(
                  (steps.filter(Boolean).length / steps.length) * 100
                );
                return (
                  <>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-slate-500 text-xs">اكتمال النموذج</span>
                      <span className="text-slate-300 text-xs font-semibold">
                        {pct}%
                      </span>
                    </div>
                    <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-blue-600 to-emerald-500 rounded-full transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </>
                );
              })()}
            </div>
          </div>

          {/* Tips card */}
          <div className="bg-slate-900 border border-slate-700/60 rounded-3xl p-5">
            <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-3">
              ملاحظات
            </p>
            <ul className="space-y-2 text-slate-400 text-xs leading-relaxed">
              <li>• سيتلقى المالك بريداً إلكترونياً بمعلومات الدخول</li>
              <li>• يمكن تعديل البيانات لاحقاً من صفحة المحلات</li>
              <li>• السجل التجاري اختياري ويمكن إضافته لاحقاً</li>
              <li>• تأكد من صحة البريد الإلكتروني قبل الإرسال</li>
            </ul>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════
          SECTION 7 — SUCCESS MODAL
      ══════════════════════════════════════════ */}
      {successInfo && (
        <SuccessModal
          info={successInfo}
          onNewClient={() => setSuccessInfo(null)}
          onGoToShops={() => {
            setSuccessInfo(null);
            // Navigation handled by parent if needed
          }}
        />
      )}
    </div>
  );
}
