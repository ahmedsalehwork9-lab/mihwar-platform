import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './lib/supabase';
import {
  Store, User, Mail, Phone, MapPin, Lock, CheckCircle,
  Building2, FileText, ShieldCheck, Zap, Crown, Users,
  ToggleLeft, ToggleRight, X, ArrowRight, Plus,
  MessageCircle, Navigation, Camera, Upload, ImageIcon,
  Layers, LayoutGrid, Globe, Shield, Lock as LockIcon,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────
// TRANSLATIONS SYSTEM
// ─────────────────────────────────────────────────────────────

const TRANSLATIONS = {
  ar: {
    create_new_client: 'إنشاء عميل جديد',
    create_client_desc: 'إنشاء محل جديد وربطه بصاحبه من لوحة الأدمن',
    total_shops: 'إجمالي المحلات',
    active_shops: 'المحلات النشطة',
    trial_accounts: 'حسابات تجريبية',
    business_structure: 'هيكلية العمل',
    business_structure_desc: 'ربط المحل بالمؤسسات والمجموعات',
    organization: 'المؤسسة',
    select_org: 'اختر المؤسسة',
    group: 'المجموعة',
    select_group: 'اختر المجموعة',
    shop_type: 'نوع المحل',
    branch: 'فرع',
    warehouse: 'مخزن مركزي',
    visibility: 'نوع الظهور',
    vis_public: 'السوق العام',
    vis_group: 'داخل المجموعة',
    vis_private: 'مخفي',
    shop_info: 'بيانات المحل',
    shop_info_desc: 'المعلومات الأساسية للمحل',
    shop_logo: 'شعار المحل',
    optional: 'اختياري',
    uploading: 'جارٍ الرفع...',
    choose_image: 'اختر صورة',
    shop_name: 'اسم المحل',
    shop_name_placeholder: 'مثال: محل الخليج لقطع الغيار',
    phone: 'الجوال',
    city: 'المدينة',
    city_placeholder: 'الرياض',
    address: 'العنوان',
    address_placeholder: 'الحي، الشارع، رقم المبنى',
    whatsapp: 'واتساب',
    google_maps: 'رابط الموقع على الخريطة',
    owner_info: 'بيانات المالك',
    owner_info_desc: 'بيانات الدخول وصاحب المحل',
    owner_name: 'اسم المالك',
    full_name: 'الاسم الكامل',
    email: 'البريد الإلكتروني',
    password: 'كلمة المرور',
    confirm_password: 'تأكيد كلمة المرور',
    account_settings: 'إعدادات الحساب',
    account_settings_desc: 'نوع الحساب والحالة الابتدائية',
    account_status: 'حالة الحساب',
    active: 'نشط',
    suspended: 'موقوف',
    account_type: 'نوع الحساب',
    basic: 'أساسي',
    pro: 'احترافي',
    enterprise: 'مؤسسي',
    creating_client: 'جاري إنشاء العميل...',
    create_client_btn: 'إنشاء العميل',
    process_summary: 'ملخص العملية',
    step_shop: 'إنشاء محل جديد',
    step_owner: 'إنشاء حساب مالك المحل',
    step_structure: 'تحديد هيكلية العمل',
    step_visibility: 'ضبط نوع الظهور',
    step_logo: 'شعار المحل',
    form_completion: 'اكتمال النموذج',
    notes: 'ملاحظات',
    note_1: 'سيتلقى المالك بريداً إلكترونياً بمعلومات الدخول',
    note_2: 'لا يمكن إنشاء فرع بدون ربطه بمؤسسة',
    note_3: 'المخازن المركزية يمكن أن تكون مستقلة',
    note_4: 'تأكد من صحة البريد الإلكتروني قبل الإرسال',
    client_created_success: 'تم إنشاء العميل بنجاح',
    client_success_desc: 'تم إنشاء المحل والحساب وربطهما بنجاح',
    new_client: 'إنشاء عميل جديد',
    view_shops: 'المحلات',
    password_mismatch: 'كلمة المرور وتأكيدها غير متطابقتين',
    org_required_for_branch: 'يجب اختيار مؤسسة عند إنشاء فرع',
    error_creating_client: 'حدث خطأ أثناء إنشاء العميل',
  },
  en: {
    create_new_client: 'Create New Client',
    create_client_desc: 'Create a new shop and link it to an owner from the admin panel',
    total_shops: 'Total Shops',
    active_shops: 'Active Shops',
    trial_accounts: 'Trial Accounts',
    business_structure: 'Business Structure',
    business_structure_desc: 'Link shop to organizations and groups',
    organization: 'Organization',
    select_org: 'Select Organization',
    group: 'Group',
    select_group: 'Select Group',
    shop_type: 'Shop Type',
    branch: 'Branch',
    warehouse: 'Central Warehouse',
    visibility: 'Visibility Mode',
    vis_public: 'Public Marketplace',
    vis_group: 'Group Only',
    vis_private: 'Hidden',
    shop_info: 'Shop Information',
    shop_info_desc: 'Basic information of the shop',
    shop_logo: 'Shop Logo',
    optional: 'Optional',
    uploading: 'Uploading...',
    choose_image: 'Choose Image',
    shop_name: 'Shop Name',
    shop_name_placeholder: 'Ex: Gulf Auto Parts',
    phone: 'Phone',
    city: 'City',
    city_placeholder: 'Riyadh',
    address: 'Address',
    address_placeholder: 'District, Street, Building No',
    whatsapp: 'WhatsApp',
    google_maps: 'Google Maps URL',
    owner_info: 'Owner Information',
    owner_info_desc: 'Login credentials and owner details',
    owner_name: 'Owner Name',
    full_name: 'Full Name',
    email: 'Email Address',
    password: 'Password',
    confirm_password: 'Confirm Password',
    account_settings: 'Account Settings',
    account_settings_desc: 'Account type and initial status',
    account_status: 'Account Status',
    active: 'Active',
    suspended: 'Suspended',
    account_type: 'Account Type',
    basic: 'Basic',
    pro: 'Pro',
    enterprise: 'Enterprise',
    creating_client: 'Creating Client...',
    create_client_btn: 'Create Client',
    process_summary: 'Process Summary',
    step_shop: 'Create new shop',
    step_owner: 'Create owner account',
    step_structure: 'Define business structure',
    step_visibility: 'Set visibility mode',
    step_logo: 'Shop logo',
    form_completion: 'Form Completion',
    notes: 'Notes',
    note_1: 'Owner will receive an email with login details',
    note_2: 'Cannot create a branch without an organization',
    note_3: 'Warehouses can be independent',
    note_4: 'Verify email address before submission',
    client_created_success: 'Client Created Successfully',
    client_success_desc: 'The shop and account have been linked successfully',
    new_client: 'Create New Client',
    view_shops: 'View Shops',
    password_mismatch: 'Passwords do not match',
    org_required_for_branch: 'Organization is required for branches',
    error_creating_client: 'Error creating client',
  },
};

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

type AccountStatus  = 'active' | 'suspended';
type AccountType    = 'basic' | 'pro' | 'enterprise';
type ShopType       = 'warehouse' | 'branch';

// FIX: lowercase to match shops.visibility_mode column constraint
type VisibilityMode = 'public' | 'group' | 'private';

type Organization = {
  id: number;
  name: string;
};

type OrganizationGroup = {
  id: number;
  organization_id: number;
  name: string;
};

type ShopStats = { total: number; active: number; trial: number };

type SuccessInfo = {
  shop_name: string;
  email: string;
  city: string;
  organization_name?: string;
};

// ─────────────────────────────────────────────────────────────
// COMPONENTS
// ─────────────────────────────────────────────────────────────

const InputField = ({
  label, icon, required = false, optional = false, error, isRtl, ...props
}: {
  label: string; icon: React.ReactNode;
  required?: boolean; optional?: boolean; error?: string; isRtl: boolean;
} & React.InputHTMLAttributes<HTMLInputElement>) => (
  <div>
    <label className="text-slate-300 text-sm mb-1.5 flex items-center gap-1.5 block">
      {label}
      {optional && <span className="text-slate-500 text-xs font-normal">({isRtl ? 'اختياري' : 'Optional'})</span>}
    </label>
    <div className="relative">
      <span className={`absolute ${isRtl ? 'right-4' : 'left-4'} top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none`}>
        {icon}
      </span>
      <input
        {...props}
        required={required}
        className={`w-full bg-slate-950 border ${
          error ? 'border-red-500/60' : 'border-slate-700'
        } hover:border-slate-600 focus:border-blue-500 rounded-2xl py-3 ${isRtl ? 'pr-12 pl-4' : 'pl-12 pr-4'} text-white text-sm placeholder-slate-600 transition-colors outline-none`}
      />
    </div>
    {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
  </div>
);

const SelectField = ({
  label, icon, required = false, optional = false, error, isRtl, children, ...props
}: {
  label: string; icon: React.ReactNode;
  required?: boolean; optional?: boolean; error?: string; isRtl: boolean;
  children: React.ReactNode;
} & React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <div>
    <label className="text-slate-300 text-sm mb-1.5 flex items-center gap-1.5 block">
      {label}
      {optional && <span className="text-slate-500 text-xs font-normal">({isRtl ? 'اختياري' : 'Optional'})</span>}
    </label>
    <div className="relative">
      <span className={`absolute ${isRtl ? 'right-4' : 'left-4'} top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none`}>
        {icon}
      </span>
      <select
        {...props}
        required={required}
        className={`w-full bg-slate-950 border ${
          error ? 'border-red-500/60' : 'border-slate-700'
        } hover:border-slate-600 focus:border-blue-500 rounded-2xl py-3 ${isRtl ? 'pr-12 pl-4' : 'pl-12 pr-4'} text-white text-sm appearance-none outline-none transition-colors`}
      >
        {children}
      </select>
    </div>
    {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
  </div>
);

const CardHeader = ({ icon, title, subtitle }: {
  icon: React.ReactNode; title: string; subtitle?: string;
}) => (
  <div className="flex items-center gap-3 mb-6">
    <div className="p-2.5 bg-blue-600/15 rounded-xl">{icon}</div>
    <div>
      <h2 className="text-white font-bold text-base">{title}</h2>
      {subtitle && <p className="text-slate-500 text-xs mt-0.5">{subtitle}</p>}
    </div>
  </div>
);

function LogoUploader({
  preview, onChange, uploading, t, isRtl,
}: {
  preview: string | null;
  onChange: (file: File) => void;
  uploading: boolean;
  t: (k: keyof typeof TRANSLATIONS.ar) => string;
  isRtl: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div>
      <label className="text-slate-300 text-sm mb-1.5 flex items-center gap-1.5 block">
        {t('shop_logo')}
        <span className="text-slate-500 text-xs font-normal">({t('optional')})</span>
      </label>

      <div className="flex items-center gap-4">
        <div
          onClick={() => inputRef.current?.click()}
          className="w-20 h-20 rounded-2xl border-2 border-dashed border-slate-700 hover:border-blue-500 bg-slate-950 flex items-center justify-center overflow-hidden cursor-pointer transition-colors group shrink-0"
        >
          {preview ? (
            <img src={preview} alt="logo" className="w-full h-full object-cover" />
          ) : (
            <div className="flex flex-col items-center gap-1 text-slate-600 group-hover:text-blue-400 transition-colors">
              <ImageIcon size={22} />
              <span className="text-[9px] font-bold uppercase tracking-wide">Logo</span>
            </div>
          )}
        </div>

        <div className="flex-1">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-700 hover:border-blue-500 bg-slate-950 text-slate-400 hover:text-white text-sm font-medium transition-all disabled:opacity-50"
          >
            {uploading ? (
              <><Upload size={15} className="animate-bounce" /> {t('uploading')}</>
            ) : (
              <><Camera size={15} /> {t('choose_image')}</>
            )}
          </button>
          <p className="text-slate-600 text-[11px] mt-1.5">PNG, JPG, WEBP · Max 2MB</p>
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) onChange(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}

const SuccessModal = ({ info, onNewClient, onGoToShops, t, isRtl }: {
  info: SuccessInfo; onNewClient: () => void; onGoToShops: () => void; t: any; isRtl: boolean;
}) => (
  <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
    <div className="bg-slate-900 border border-slate-700 rounded-3xl p-8 w-full max-w-md shadow-2xl">
      <div className="flex justify-center mb-5">
        <div className="w-16 h-16 bg-emerald-500/15 border border-emerald-500/25 rounded-full flex items-center justify-center">
          <CheckCircle size={32} className="text-emerald-400" />
        </div>
      </div>
      <h3 className="text-white font-bold text-xl text-center mb-1">{t('client_created_success')}</h3>
      <p className="text-slate-500 text-sm text-center mb-6">{t('client_success_desc')}</p>
      <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4 space-y-3 mb-6">
        {[
          { label: t('shop_name'),    value: info.shop_name },
          { label: t('email'),        value: info.email },
          { label: t('city'),         value: info.city },
          { label: t('organization'), value: info.organization_name || '—' },
        ].map(({ label, value }) => (
          <div key={label} className="flex items-center justify-between">
            <span className="text-slate-400 text-sm">{label}</span>
            <span className="text-white text-sm font-medium">{value}</span>
          </div>
        ))}
      </div>
      <div className="flex gap-3">
        <button
          onClick={onNewClient}
          className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl py-3 text-sm font-semibold transition-colors"
        >
          <Plus size={16} /> {t('new_client')}
        </button>
        <button
          onClick={onGoToShops}
          className="flex-1 flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-2xl py-3 text-sm font-medium transition-colors border border-slate-700"
        >
          {t('view_shops')} <ArrowRight size={14} className={isRtl ? 'rotate-180' : ''} />
        </button>
      </div>
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────
// BLANK FORM STATE — single source of truth
// ─────────────────────────────────────────────────────────────

const BLANK_FORM = {
  shop_name:               '',
  owner_name:              '',
  email:                   '',
  password:                '',
  confirm_password:        '',
  phone:                   '',
  city:                    '',
  address:                 '',
  // FIX: field name matches shops.commercial_registration column
  commercial_registration: '',
  whatsapp:                '',
  google_maps_url:         '',
  organization_id:         '',
  group_id:                '',
  shop_type:               'branch'  as ShopType,
  // FIX: lowercase values to match shops.visibility_mode column constraint
  visibility_mode:         'public'  as VisibilityMode,
};

// ─────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────

export default function CreateShopPage() {
  const navigate = useNavigate();

  const currentDir = document.documentElement.dir || 'rtl';
  const isRtl      = currentDir === 'rtl';
  const lang       = isRtl ? 'ar' : 'en';

  const t = (key: keyof typeof TRANSLATIONS.ar): string =>
    (TRANSLATIONS[lang] as any)[key] || key;

  const [loading, setLoading]             = useState(false);
  const [stats, setStats]                 = useState<ShopStats>({ total: 0, active: 0, trial: 0 });
  const [successInfo, setSuccessInfo]     = useState<SuccessInfo | null>(null);
  const [passwordError, setPasswordError] = useState('');
  const [submitError, setSubmitError]     = useState('');

  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [groups, setGroups]               = useState<OrganizationGroup[]>([]);

  const [logoFile, setLogoFile]           = useState<File | null>(null);
  const [logoPreview, setLogoPreview]     = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);

  const [accountStatus, setAccountStatus] = useState<AccountStatus>('active');
  const [accountType, setAccountType]     = useState<AccountType>('basic');

  const [form, setForm] = useState({ ...BLANK_FORM });

  const updateField = useCallback((field: string, value: any) => {
    setForm(prev => {
      const updated = { ...prev, [field]: value };
      if (field === 'organization_id') updated.group_id = '';
      return updated;
    });
    if (field === 'password' || field === 'confirm_password') setPasswordError('');
    setSubmitError('');
  }, []);

  const handleLogoSelect = (file: File) => {
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const uploadLogo = async (shopId: number): Promise<string | null> => {
    if (!logoFile) return null;
    setLogoUploading(true);
    try {
      const ext      = logoFile.name.split('.').pop();
      const filePath = `shop-${shopId}/logo.${ext}`;
      const { error } = await supabase.storage
        .from('shop-logos')
        .upload(filePath, logoFile, { upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from('shop-logos').getPublicUrl(filePath);
      return data.publicUrl;
    } catch (err) {
      console.error('[CreateShopPage] Logo upload error:', err);
      return null;
    } finally {
      setLogoUploading(false);
    }
  };

  // ── Init: stats + organizations ────────────────────────────

  useEffect(() => {
    const initData = async () => {
      const [statsRes, orgRes] = await Promise.all([
        Promise.all([
          supabase.from('shops').select('id', { count: 'exact', head: true }),
          supabase.from('shops').select('id', { count: 'exact', head: true }).eq('is_active', true),
          supabase.from('shops').select('id', { count: 'exact', head: true }).eq('subscription_status', 'trial'),
        ]),
        supabase.from('organizations').select('id, name').order('name'),
      ]);

      setStats({
        total:  statsRes[0].count ?? 0,
        active: statsRes[1].count ?? 0,
        trial:  statsRes[2].count ?? 0,
      });

      if (orgRes.data) setOrganizations(orgRes.data);
    };
    initData();
  }, []);

  // ── Groups: re-fetch when org changes ──────────────────────

  useEffect(() => {
    const fetchGroups = async () => {
      if (!form.organization_id) {
        setGroups([]);
        return;
      }
      const { data } = await supabase
        .from('organization_groups')
        .select('id, name')
        .eq('organization_id', form.organization_id)
        .order('name');
      if (data) setGroups(data as OrganizationGroup[]);
    };
    fetchGroups();
  }, [form.organization_id]);

  // ── Submit ──────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');

    if (form.password !== form.confirm_password) {
      setPasswordError(t('password_mismatch'));
      return;
    }

    if (form.shop_type === 'branch' && !form.organization_id) {
      alert(t('org_required_for_branch'));
      return;
    }

    try {
      setLoading(true);

      // Build the payload — field names must match what create-shop expects.
      // visibility_mode is lowercase ('public' | 'group' | 'private') to
      // match the shops.visibility_mode column constraint.
      const payload = {
        shop_name:               form.shop_name,
        owner_name:              form.owner_name,
        email:                   form.email,
        password:                form.password,
        phone:                   form.phone,
        city:                    form.city,
        address:                 form.address || null,
        commercial_registration: form.commercial_registration || null,
        whatsapp:                form.whatsapp || null,
        google_maps_url:         form.google_maps_url || null,
        organization_id:         form.organization_id ? Number(form.organization_id) : null,
        group_id:                form.group_id ? Number(form.group_id) : null,
        shop_type:               form.shop_type,
        visibility_mode:         form.visibility_mode,   // lowercase: 'public' | 'group' | 'private'
        account_type:            accountType,
        is_active:               accountStatus === 'active',
      };

      console.log('[CreateShopPage] Invoking create-shop with payload:', payload);

      const { data, error } = await supabase.functions.invoke('create-shop', {
        body: payload,
      });

      if (error) {
        // Extract the actual response body from the edge function.
        // FunctionsHttpError.context is the raw Response object —
        // read its JSON to get the specific error message from the function.
        console.error('[CreateShopPage] create-shop raw error object:', error);
        let detailedMsg = t('error_creating_client');
        try {
          const ctx = (error as any)?.context;
          if (ctx && typeof ctx.json === 'function') {
            const body = await ctx.json();
            console.error('[CreateShopPage] create-shop error body:', body);
            detailedMsg = body?.error || body?.message || body?.details || JSON.stringify(body);
          } else if (ctx && typeof ctx.text === 'function') {
            const text = await ctx.text();
            console.error('[CreateShopPage] create-shop error text:', text);
            detailedMsg = text;
          } else {
            detailedMsg = (error as any)?.message || detailedMsg;
          }
        } catch (parseErr) {
          console.error('[CreateShopPage] Failed to parse error body:', parseErr);
          detailedMsg = (error as any)?.message || detailedMsg;
        }
        throw new Error(detailedMsg);
      }

      console.log('[CreateShopPage] create-shop success:', data);

      if (logoFile && data?.shop_id) {
        const logoUrl = await uploadLogo(data.shop_id);
        if (logoUrl) {
          await supabase.from('shops').update({ logo_url: logoUrl }).eq('id', data.shop_id);
        }
      }

      const selectedOrg = organizations.find(o => o.id === Number(form.organization_id));
      setSuccessInfo({
        shop_name:         form.shop_name,
        email:             form.email,
        city:              form.city,
        organization_name: selectedOrg?.name,
      });

      setForm({ ...BLANK_FORM });
      setLogoFile(null);
      setLogoPreview(null);
    } catch (err: any) {
      console.error('[CreateShopPage] handleSubmit error:', err);
      const raw = err?.message || t('error_creating_client');

      // Provide a clear Arabic message for the most common errors
      let msg = raw;
      if (
        raw.includes('already been registered') ||
        raw.includes('EMAIL_ALREADY_REGISTERED') ||
        raw.includes('البريد الإلكتروني مسجل مسبقاً')
      ) {
        msg = 'البريد الإلكتروني مسجل مسبقاً — يرجى استخدام بريد إلكتروني مختلف';
      }

      setSubmitError(msg);
      // Scroll to error banner instead of blocking alert
      setTimeout(() => {
        document.getElementById('submit-error-banner')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);
    } finally {
      setLoading(false);
    }
  };

  // ── Config objects ──────────────────────────────────────────

  const accountTypeConfig: Record<AccountType, {
    label: string; icon: React.ReactNode; color: string; active: string;
  }> = {
    basic:      { label: t('basic'),      icon: <Zap size={15} />,        color: 'border-slate-600 text-slate-400', active: 'border-blue-500 bg-blue-500/10 text-blue-400'     },
    pro:        { label: t('pro'),        icon: <ShieldCheck size={15} />, color: 'border-slate-600 text-slate-400', active: 'border-purple-500 bg-purple-500/10 text-purple-400' },
    enterprise: { label: t('enterprise'), icon: <Crown size={15} />,       color: 'border-slate-600 text-slate-400', active: 'border-amber-500 bg-amber-500/10 text-amber-400'   },
  };

  // FIX: keys are lowercase to match VisibilityMode type
  const visibilityConfig: Record<VisibilityMode, {
    label: string; icon: React.ReactNode; color: string; bg: string; border: string;
  }> = useMemo(() => ({
    public:  { label: t('vis_public'), icon: <Globe size={16} />,   color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/50' },
    group:   { label: t('vis_group'),  icon: <Shield size={16} />,  color: 'text-blue-400',    bg: 'bg-blue-500/10',    border: 'border-blue-500/50'    },
    private: { label: t('vis_private'),icon: <LockIcon size={16} />,color: 'text-slate-400',   bg: 'bg-slate-500/10',   border: 'border-slate-500/50'   },
  }), [lang]);

  // ── Render ──────────────────────────────────────────────────

  return (
    <div className={`max-w-5xl mx-auto space-y-8 pb-12 ${isRtl ? 'font-arabic' : ''}`} dir={isRtl ? 'rtl' : 'ltr'}>

      {/* STATS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: t('total_shops'),   value: stats.total,  icon: <Store size={20} className="text-blue-400" />,          bg: 'bg-blue-500/10',    border: 'border-blue-500/20'    },
          { label: t('active_shops'),  value: stats.active, icon: <CheckCircle size={20} className="text-emerald-400" />, bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
          { label: t('trial_accounts'),value: stats.trial,  icon: <Users size={20} className="text-amber-400" />,         bg: 'bg-amber-500/10',   border: 'border-amber-500/20'   },
        ].map(s => (
          <div key={s.label} className={`bg-slate-900 border ${s.border} rounded-3xl p-5 flex items-center gap-4`}>
            <div className={`p-3 rounded-2xl ${s.bg} flex-shrink-0`}>{s.icon}</div>
            <div>
              <p className="text-slate-400 text-xs mb-1">{s.label}</p>
              <p className="text-white text-2xl font-black">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div>
        <h1 className="text-white text-2xl font-black">{t('create_new_client')}</h1>
        <p className="text-slate-500 text-sm mt-1">{t('create_client_desc')}</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* ══ LEFT: Form ══ */}
        <form onSubmit={handleSubmit} className="xl:col-span-2 space-y-6">

          {/* BUSINESS STRUCTURE */}
          <div className="bg-slate-900 border border-slate-700/60 rounded-3xl p-6 shadow-xl">
            <CardHeader
              icon={<Layers size={18} className="text-indigo-400" />}
              title={t('business_structure')}
              subtitle={t('business_structure_desc')}
            />

            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <SelectField
                  label={t('organization')}
                  icon={<Building2 size={17} />}
                  isRtl={isRtl}
                  value={form.organization_id}
                  onChange={e => updateField('organization_id', e.target.value)}
                  required={form.shop_type === 'branch'}
                >
                  <option value="">{t('select_org')}</option>
                  {organizations.map(org => (
                    <option key={org.id} value={org.id}>{org.name}</option>
                  ))}
                </SelectField>

                <SelectField
                  label={t('group')}
                  icon={<LayoutGrid size={17} />}
                  isRtl={isRtl}
                  value={form.group_id}
                  onChange={e => updateField('group_id', e.target.value)}
                  disabled={!form.organization_id}
                >
                  <option value="">{t('select_group')}</option>
                  {groups.map(g => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </SelectField>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Shop type */}
                <div>
                  <p className="text-slate-400 text-xs font-medium mb-3 uppercase tracking-wider">{t('shop_type')}</p>
                  <div className="flex gap-3">
                    {(['branch', 'warehouse'] as const).map(type => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => updateField('shop_type', type)}
                        className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border text-sm font-bold transition-all ${
                          form.shop_type === type
                            ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                            : 'border-slate-700 text-slate-500 hover:border-slate-600'
                        }`}
                      >
                        {type === 'branch' ? <Store size={16} /> : <Building2 size={16} />}
                        {type === 'branch' ? t('branch') : t('warehouse')}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Visibility — FIX: iterates lowercase keys */}
                <div>
                  <p className="text-slate-400 text-xs font-medium mb-3 uppercase tracking-wider">{t('visibility')}</p>
                  <div className="grid grid-cols-3 gap-2">
                    {(Object.keys(visibilityConfig) as VisibilityMode[]).map(mode => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => updateField('visibility_mode', mode)}
                        className={`flex flex-col items-center gap-1.5 p-2.5 rounded-xl border transition-all ${
                          form.visibility_mode === mode
                            ? `${visibilityConfig[mode].border} ${visibilityConfig[mode].bg} ${visibilityConfig[mode].color}`
                            : 'border-slate-700 text-slate-600 hover:border-slate-600'
                        }`}
                      >
                        {visibilityConfig[mode].icon}
                        <span className="text-[10px] font-bold">{visibilityConfig[mode].label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* SHOP INFO */}
          <div className="bg-slate-900 border border-slate-700/60 rounded-3xl p-6 shadow-xl">
            <CardHeader
              icon={<Store size={18} className="text-blue-400" />}
              title={t('shop_info')}
              subtitle={t('shop_info_desc')}
            />
            <div className="space-y-5">
              <LogoUploader
                preview={logoPreview}
                onChange={handleLogoSelect}
                uploading={logoUploading}
                t={t}
                isRtl={isRtl}
              />
              <InputField
                label={t('shop_name')}
                icon={<Store size={17} />}
                isRtl={isRtl}
                value={form.shop_name}
                onChange={e => updateField('shop_name', e.target.value)}
                placeholder={t('shop_name_placeholder')}
                required
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <InputField
                  label={t('phone')}
                  icon={<Phone size={17} />}
                  isRtl={isRtl}
                  value={form.phone}
                  onChange={e => updateField('phone', e.target.value)}
                  placeholder="05xxxxxxxx"
                  required
                />
                <InputField
                  label={t('city')}
                  icon={<MapPin size={17} />}
                  isRtl={isRtl}
                  value={form.city}
                  onChange={e => updateField('city', e.target.value)}
                  placeholder={t('city_placeholder')}
                  required
                />
              </div>
            </div>
          </div>

          {/* OWNER INFO */}
          <div className="bg-slate-900 border border-slate-700/60 rounded-3xl p-6 shadow-xl">
            <CardHeader
              icon={<User size={18} className="text-purple-400" />}
              title={t('owner_info')}
              subtitle={t('owner_info_desc')}
            />
            <div className="space-y-5">
              <InputField
                label={t('owner_name')}
                icon={<User size={17} />}
                isRtl={isRtl}
                value={form.owner_name}
                onChange={e => updateField('owner_name', e.target.value)}
                placeholder={t('full_name')}
                required
              />
              <InputField
                label={t('email')}
                icon={<Mail size={17} />}
                isRtl={isRtl}
                type="email"
                value={form.email}
                onChange={e => updateField('email', e.target.value)}
                placeholder="owner@example.com"
                required
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <InputField
                  label={t('password')}
                  icon={<Lock size={17} />}
                  isRtl={isRtl}
                  type="password"
                  value={form.password}
                  onChange={e => updateField('password', e.target.value)}
                  placeholder="••••••••"
                  required
                  error={passwordError ? ' ' : undefined}
                />
                <InputField
                  label={t('confirm_password')}
                  icon={<Lock size={17} />}
                  isRtl={isRtl}
                  type="password"
                  value={form.confirm_password}
                  onChange={e => updateField('confirm_password', e.target.value)}
                  placeholder="••••••••"
                  required
                  error={passwordError}
                />
              </div>
            </div>
          </div>

          {/* Submit error banner */}
          {submitError && (
            <div id="submit-error-banner" className="bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-3 flex items-center gap-3">
              <X size={16} className="text-red-400 shrink-0" />
              <p className="text-red-400 text-sm">{submitError}</p>
            </div>
          )}

          {/* SUBMIT */}
          <button
            type="submit"
            disabled={loading || logoUploading}
            className="w-full relative overflow-hidden bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white py-4 rounded-2xl font-bold text-base shadow-lg shadow-blue-500/20 transition-all duration-200"
          >
            <span className="flex items-center justify-center gap-2">
              {loading ? (
                <>
                  <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  {t('creating_client')}
                </>
              ) : (
                <><Plus size={18} />{t('create_client_btn')}</>
              )}
            </span>
          </button>
        </form>

        {/* ══ RIGHT: Summary ══ */}
        <div className="space-y-5">
          <div className="bg-slate-900 border border-slate-700/60 rounded-3xl p-6 shadow-xl sticky top-6">
            <div className="flex items-center gap-2.5 mb-5">
              <div className="p-2 bg-blue-500/10 rounded-xl">
                <CheckCircle size={17} className="text-blue-400" />
              </div>
              <h2 className="text-white font-bold text-sm">{t('process_summary')}</h2>
            </div>

            <div className="flex flex-wrap gap-2 mb-6">
              <div className="px-2.5 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[10px] font-bold uppercase">
                {form.shop_type === 'branch' ? t('branch') : t('warehouse')}
              </div>
              <div className={`px-2.5 py-1 rounded-lg border text-[10px] font-bold uppercase ${visibilityConfig[form.visibility_mode].bg} ${visibilityConfig[form.visibility_mode].border} ${visibilityConfig[form.visibility_mode].color}`}>
                {visibilityConfig[form.visibility_mode].label}
              </div>
            </div>

            <div className="space-y-3 mb-6">
              {[
                { label: t('organization'), value: organizations.find(o => o.id === Number(form.organization_id))?.name, icon: <Building2 size={13} /> },
                { label: t('group'),        value: groups.find(g => g.id === Number(form.group_id))?.name,              icon: <LayoutGrid size={13} /> },
              ].map((item, idx) => item.value && (
                <div key={idx} className="flex items-center justify-between p-2 rounded-xl bg-slate-800/40 border border-slate-700/50">
                  <div className="flex items-center gap-2 text-slate-400 text-xs">
                    {item.icon}
                    <span>{item.label}</span>
                  </div>
                  <span className="text-white text-xs font-bold">{item.value}</span>
                </div>
              ))}
            </div>

            <div className="space-y-3">
              {[
                { label: t('step_shop'),      done: !!form.shop_name                                                },
                { label: t('step_owner'),     done: !!form.email && !!form.password                                },
                { label: t('step_structure'), done: !!form.organization_id || form.shop_type === 'warehouse'       },
                { label: t('step_logo'),      done: !!logoFile                                                     },
              ].map(({ label, done }) => (
                <div key={label} className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-300 ${
                    done ? 'bg-emerald-500/20 border border-emerald-500/40' : 'bg-slate-800 border border-slate-700'
                  }`}>
                    {done ? <CheckCircle size={12} className="text-emerald-400" /> : <X size={10} className="text-slate-600" />}
                  </div>
                  <span className={`text-sm transition-colors ${done ? 'text-slate-200' : 'text-slate-500'}`}>
                    {label}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-5">
              {(() => {
                const steps = [!!form.shop_name, !!form.email, (!!form.organization_id || form.shop_type === 'warehouse'), !!logoFile];
                const pct = Math.round((steps.filter(Boolean).length / steps.length) * 100);
                return (
                  <>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-slate-500 text-xs">{t('form_completion')}</span>
                      <span className="text-slate-300 text-xs font-semibold">{pct}%</span>
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

          <div className="bg-slate-900 border border-slate-700/60 rounded-3xl p-5">
            <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-3">{t('notes')}</p>
            <ul className="space-y-2 text-slate-400 text-xs leading-relaxed">
              <li>• {t('note_1')}</li>
              <li>• {t('note_2')}</li>
              <li>• {t('note_3')}</li>
              <li>• {t('note_4')}</li>
            </ul>
          </div>
        </div>

      </div>

      {successInfo && (
        <SuccessModal
          info={successInfo}
          onNewClient={() => setSuccessInfo(null)}
          onGoToShops={() => { setSuccessInfo(null); navigate('/shops'); }}
          t={t}
          isRtl={isRtl}
        />
      )}
    </div>
  );
}
