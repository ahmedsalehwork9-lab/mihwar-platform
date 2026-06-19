import { useEffect, useState, useRef, useCallback, memo } from 'react';
import { supabase } from './lib/supabase';
import {
  Store,
  CheckCircle,
  XCircle,
  Phone,
  MapPin,
  Activity,
  RefreshCw,
  Search,
  Package,
  ArrowUpRight,
  ArrowDownLeft,
  ShieldCheck,
  AlertCircle,
  Filter,
  MoreVertical,
  Edit2,
  Key,
  Eye,
  User,
  ExternalLink,
  X,
  Save,
  CheckSquare,
  CalendarDays,
  Clock,
  MessageCircle,
  Navigation,
  Mail,
  Globe,
  FileText,
  Home,
  Upload,
  ImageIcon,
  Loader2,
  Building2,
} from 'lucide-react';

// ══════════════════════════════════════════════════════════════════════
// PHASE 1 — I18N: CENTRALIZED TRANSLATION OBJECT
// All UI strings live here. No hardcoded labels anywhere else in the file.
// To flip the UI to English: change LANG below from 'ar' to 'en'.
// ══════════════════════════════════════════════════════════════════════

const TEXT = {
  ar: {
    pageTitle: 'إدارة المحلات',
    pageSubtitle: 'إدارة جميع المحلات والعملاء داخل المنصة والتحكم في صلاحياتهم.',
    shopCount: (n: number) => `${n} محل`,
    globalStat: 'إحصاء عام',
    totalShops: 'إجمالي المحلات',
    activeShops: 'المحلات النشطة',
    inactiveShops: 'المحلات الموقوفة',
    trialShops: 'المحلات التجريبية',
    tabAll: 'جميع المحلات',
    tabActive: 'نشط',
    tabInactive: 'موقوف',
    tabTrial: 'تجريبي',
    searchPlaceholder: 'البحث باسم المحل أو المدينة...',
    colShopInfo: 'المحل والمعلومات',
    colLocation: 'الموقع',
    colOwner: 'المالك',
    colInventory: 'المخزون',
    colStatus: 'الحالة',
    colInventoryVisibility: 'إدارة العرض',
    colMarketplaceAccess: 'رؤية السوق العام',
    colActions: 'الإجراءات',
    shopManager: 'مدير المحل',
    units: 'قطعة',
    items: 'صنف',
    statusActive: 'نشط',
    statusInactive: 'موقف',
    loading: 'جاري تحميل البيانات...',
    noResults: 'لا توجد محلات مطابقة للبحث',
    viewDetails: 'عرض التفاصيل',
    edit: 'تعديل',
    deactivate: 'إيقاف',
    activate: 'تفعيل',
    visPublic: 'عام',
    visGroup: 'المجموعة',
    visPrivate: 'مخفي',
    accessEnabled: 'نعم',
    accessDisabled: 'لا',
    editTitle: 'تعديل المحل',
    cancel: 'إلغاء',
    save: 'حفظ التعديلات',
    saving: 'جاري الحفظ...',
    saved: 'تم الحفظ',
    uploadingLogo: 'جاري رفع الشعار...',
    saveSuccess: 'تم تحديث بيانات المحل بنجاح',
    saveError: 'فشل في حفظ التعديلات',
    logoLabel: 'شعار المحل',
    uploadLogo: 'رفع شعار',
    changeLogo: 'تغيير الشعار',
    uploading: 'جاري الرفع...',
    logoHint: 'PNG · JPG · WebP · حد 2MB',
    logoErrType: 'الرجاء اختيار صورة',
    logoErrSize: 'الصورة يجب أن تكون أقل من 2MB',
    logoErrUpload: 'فشل رفع الصورة، حاول مرة أخرى',
    sectionBasic: 'المعلومات الأساسية',
    shopName: 'اسم المحل',
    shopNamePlaceholder: 'اسم المحل',
    city: 'المدينة',
    cityPlaceholder: 'المدينة',
    fullAddress: 'العنوان الكامل',
    addressPlaceholder: 'الحي، الشارع، المبنى...',
    sectionContact: 'معلومات الاتصال',
    phone: 'رقم الجوال',
    phonePlaceholder: '05xxxxxxxx',
    whatsapp: 'واتساب',
    whatsappPlaceholder: '0500000000',
    email: 'البريد الإلكتروني',
    emailPlaceholder: 'info@shop.com',
    website: 'الموقع الإلكتروني',
    websitePlaceholder: 'https://www.myshop.com',
    sectionBusiness: 'البيانات التجارية',
    commercialReg: 'رقم السجل التجاري',
    commercialRegPlaceholder: '1010XXXXXX',
    mapsUrl: 'رابط الموقع',
    mapsUrlPlaceholder: 'https://maps.google.com/...',
    sectionVisibility: 'إعدادات الرؤية',
    inventoryVisibility: 'عرض المخزون',
    marketplaceAccess: 'رؤية السوق العام',
    marketplaceAccessHint: 'تحديد ما إذا كان المحل يستطيع رؤية منتجات السوق العام',
    shopStatus: 'حالة المحل',
    drawerTitle: 'تفاصيل المحل',
    resetPassword: 'إعادة تعيين كلمة المرور',
    openLocation: 'الموقع',
    goToWebsite: 'الموقع الإلكتروني',
    openChat: 'واتساب',
    statProducts: 'المنتجات',
    statOutgoing: 'الطلبات الصادرة',
    statIncoming: 'الطلبات الواردة',
    statUsers: 'المستخدمين',
    sectionBasicInfo: 'المعلومات الأساسية',
    drawerCity: 'المدينة',
    drawerCreated: 'تاريخ الإنشاء',
    drawerSystemStatus: 'حالة النظام',
    drawerSystemOnline: 'متصل',
    drawerSubscription: 'الاشتراك',
    drawerSubTrial: 'فترة تجريبية',
    drawerSubEnterprise: 'خطة المؤسسات',
    drawerWhatsapp: 'واتساب',
    drawerLocation: 'الموقع',
    drawerOpenLocation: 'فتح الموقع',
    drawerEmail: 'البريد الإلكتروني',
    drawerWebsite: 'الموقع الإلكتروني',
    drawerFullAddress: 'العنوان الكامل',
    drawerCommercialReg: 'السجل التجاري',
    drawerVisibilitySettings: 'إعدادات الرؤية',
    drawerInventoryVis: 'عرض المخزون',
    drawerMarketAccess: 'رؤية السوق العام',
    deactivateShop: 'إيقاف المحل',
    activateShop: 'تفعيل المحل',
    toastVisibilityError: 'فشل تحديث وضع العرض',
    toastMarketAccessError: 'فشل تحديث رؤية السوق العام',
    toastStatusError: 'فشل في تحديث الحالة',
    confirmDeactivate: (name: string) =>
      `هل تريد فعلاً إيقاف محل "${name}"؟ سيؤدي ذلك لمنعه من تنفيذ الطلبات.`,
    confirmActivate: (name: string) => `هل تريد تفعيل محل "${name}"؟`,
    dateLocale: 'ar-SA',
    weekday: 'long' as const,
  },
  en: {
    pageTitle: 'Shop Management',
    pageSubtitle: 'Manage all shops and clients on the platform and control their permissions.',
    shopCount: (n: number) => `${n} shops`,
    globalStat: 'Global Stat',
    totalShops: 'Total Shops',
    activeShops: 'Active Shops',
    inactiveShops: 'Inactive Shops',
    trialShops: 'Trial Shops',
    tabAll: 'All Shops',
    tabActive: 'Active',
    tabInactive: 'Inactive',
    tabTrial: 'Trial',
    searchPlaceholder: 'Search by shop name or city...',
    colShopInfo: 'Shop & Info',
    colLocation: 'Location',
    colOwner: 'Owner',
    colInventory: 'Inventory',
    colStatus: 'Status',
    colInventoryVisibility: 'Inventory Visibility',
    colMarketplaceAccess: 'Marketplace Access',
    colActions: 'Actions',
    shopManager: 'Shop Manager',
    units: 'units',
    items: 'items',
    statusActive: 'Active',
    statusInactive: 'Inactive',
    loading: 'Loading data...',
    noResults: 'No shops match your search',
    viewDetails: 'View Details',
    edit: 'Edit',
    deactivate: 'Deactivate',
    activate: 'Activate',
    visPublic: 'Public',
    visGroup: 'Group',
    visPrivate: 'Private',
    accessEnabled: 'Enabled',
    accessDisabled: 'Disabled',
    editTitle: 'Edit Shop',
    cancel: 'Cancel',
    save: 'Save Changes',
    saving: 'Saving...',
    saved: 'Saved',
    uploadingLogo: 'Uploading logo...',
    saveSuccess: 'Shop updated successfully',
    saveError: 'Failed to save changes',
    logoLabel: 'Shop Logo',
    uploadLogo: 'Upload Logo',
    changeLogo: 'Change Logo',
    uploading: 'Uploading...',
    logoHint: 'PNG · JPG · WebP · Max 2MB',
    logoErrType: 'Please select an image file',
    logoErrSize: 'Image must be smaller than 2MB',
    logoErrUpload: 'Upload failed, please try again',
    sectionBasic: 'Basic Information',
    shopName: 'Shop Name',
    shopNamePlaceholder: 'Shop name',
    city: 'City',
    cityPlaceholder: 'City',
    fullAddress: 'Full Address',
    addressPlaceholder: 'District, street, building...',
    sectionContact: 'Contact Information',
    phone: 'Phone Number',
    phonePlaceholder: '05xxxxxxxx',
    whatsapp: 'WhatsApp',
    whatsappPlaceholder: '0500000000',
    email: 'Email Address',
    emailPlaceholder: 'info@shop.com',
    website: 'Website',
    websitePlaceholder: 'https://www.myshop.com',
    sectionBusiness: 'Business Details',
    commercialReg: 'Commercial Registration Number',
    commercialRegPlaceholder: '1010XXXXXX',
    mapsUrl: 'Maps URL',
    mapsUrlPlaceholder: 'https://maps.google.com/...',
    sectionVisibility: 'Visibility Settings',
    inventoryVisibility: 'Inventory Visibility',
    marketplaceAccess: 'Marketplace Access',
    marketplaceAccessHint: 'Controls whether this shop can view products in the public marketplace',
    shopStatus: 'Shop Status',
    drawerTitle: 'Shop Details',
    resetPassword: 'Reset Password',
    openLocation: 'Location',
    goToWebsite: 'Website',
    openChat: 'WhatsApp',
    statProducts: 'Products',
    statOutgoing: 'Outgoing Orders',
    statIncoming: 'Incoming Orders',
    statUsers: 'Users',
    sectionBasicInfo: 'Basic Information',
    drawerCity: 'City',
    drawerCreated: 'Created',
    drawerSystemStatus: 'System Status',
    drawerSystemOnline: 'Online',
    drawerSubscription: 'Subscription',
    drawerSubTrial: 'Trial Period',
    drawerSubEnterprise: 'Enterprise Plan',
    drawerWhatsapp: 'WhatsApp',
    drawerLocation: 'Location',
    drawerOpenLocation: 'Open Location',
    drawerEmail: 'Email',
    drawerWebsite: 'Website',
    drawerFullAddress: 'Full Address',
    drawerCommercialReg: 'Commercial Registration',
    drawerVisibilitySettings: 'Visibility Settings',
    drawerInventoryVis: 'Inventory Visibility',
    drawerMarketAccess: 'Marketplace Access',
    deactivateShop: 'Deactivate Shop',
    activateShop: 'Activate Shop',
    toastVisibilityError: 'Failed to update visibility mode',
    toastMarketAccessError: 'Failed to update marketplace access',
    toastStatusError: 'Failed to update shop status',
    confirmDeactivate: (name: string) =>
      `Are you sure you want to deactivate "${name}"? This will prevent them from fulfilling orders.`,
    confirmActivate: (name: string) => `Do you want to activate "${name}"?`,
    dateLocale: 'en-US',
    weekday: 'long' as const,
  },
} as const;

// Active language. Change to 'en' to switch entire UI to English.
const LANG: keyof typeof TEXT = 'ar';
const t = TEXT[LANG];

// ══════════════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════════════

type VisibilityMode = 'public' | 'group' | 'private';

// ══════════════════════════════════════════════════════════════════════
// INTERFACES
// ══════════════════════════════════════════════════════════════════════

interface Shop {
  id: number;
  shop_name: string;
  phone: string | null;
  city: string | null;
  is_active: boolean;
  subscription_status?: string;
  created_at: string;
  total_quantity?: number;
  products_count?: number;
  outgoing_orders: { count: number }[];
  incoming_orders: { count: number }[];
  whatsapp: string | null;
  google_maps_url: string | null;
  logo_url: string | null;
  commercial_registration: string | null;
  address: string | null;
  email: string | null;
  website: string | null;
  // ── VISIBILITY LAYER 1: Inventory scope (visibility_mode) ──────────
  // Controls which audience can see this shop's products.
  // 'public' | 'group' | 'private'
  // DB column: shops.visibility_mode
  visibility_mode: VisibilityMode | null;
  // ── VISIBILITY LAYER 2: Marketplace read access (can_view_public_market)
  // Controls whether THIS shop can see other shops' public products.
  // Entirely independent of visibility_mode — do NOT conflate.
  // true | false | null (null defaults to true for backward compatibility)
  // DB column: shops.can_view_public_market
  can_view_public_market: boolean | null;
}

export interface ShopProfile {
  id: number;
  shop_name: string;
  phone: string | null;
  whatsapp: string | null;
  address: string | null;
  logo_url: string | null;
  city: string | null;
  email: string | null;
  website: string | null;
  commercial_registration: string | null;
}

export function toShopProfile(shop: Shop): ShopProfile {
  return {
    id: shop.id,
    shop_name: shop.shop_name,
    phone: shop.phone,
    whatsapp: shop.whatsapp,
    address: shop.address,
    logo_url: shop.logo_url,
    city: shop.city,
    email: shop.email,
    website: shop.website,
    commercial_registration: shop.commercial_registration,
  };
}

// ══════════════════════════════════════════════════════════════════════
// TOAST — Phase 8: no global toast found; keeping local implementation
// ══════════════════════════════════════════════════════════════════════

interface ToastItem {
  id: number;
  message: string;
  type: 'success' | 'error';
}

let _toastId = 0;

function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const addToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    const id = ++_toastId;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(p => p.id !== id)), 3500);
  }, []);
  return { toasts, addToast };
}

function ToastContainer({ toasts }: { toasts: ToastItem[] }) {
  if (toasts.length === 0) return null;
  return (
    <div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 items-center pointer-events-none"
      role="status"
      aria-live="polite"
    >
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`px-5 py-3 rounded-2xl text-sm font-bold shadow-2xl border backdrop-blur-sm animate-in fade-in slide-in-from-bottom-2 duration-300 ${
            toast.type === 'success'
              ? 'bg-emerald-900/80 border-emerald-500/30 text-emerald-300'
              : 'bg-red-900/80 border-red-500/30 text-red-300'
          }`}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// VISIBILITY CONFIG
// ══════════════════════════════════════════════════════════════════════

// Layer 1: inventory scope options
const VISIBILITY_OPTIONS: { value: VisibilityMode; label: string; emoji: string; color: string }[] = [
  { value: 'public',  label: t.visPublic,  emoji: '\uD83C\uDF0D', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  { value: 'group',   label: t.visGroup,   emoji: '\uD83D\uDC65', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20'     },
  { value: 'private', label: t.visPrivate, emoji: '\uD83D\uDD12', color: 'bg-slate-700/60 text-slate-400 border-slate-600/40'      },
];

// Layer 2: marketplace access options
const MARKET_ACCESS_OPTIONS: { value: boolean; label: string; emoji: string; color: string }[] = [
  { value: true,  label: t.accessEnabled,  emoji: '\u2705', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  { value: false, label: t.accessDisabled, emoji: '\u274C', color: 'bg-red-500/10 text-red-400 border-red-500/20'             },
];

// ── PHASE 2: Market access default safety ────────────────────────────
// null/undefined -> true: existing shops keep marketplace access by default.
// Only an explicit false disables it.
function resolveVisibility(mode: string | null | undefined): VisibilityMode {
  if (mode === 'group' || mode === 'private') return mode;
  return 'public';
}

function resolveMarketAccess(value: boolean | null | undefined): boolean {
  return value !== false;
}

// ── PHASE 4: Reusable label helpers ──────────────────────────────────

function getVisibilityCfg(mode: VisibilityMode | null | undefined) {
  const resolved = resolveVisibility(mode);
  return VISIBILITY_OPTIONS.find(o => o.value === resolved) ?? VISIBILITY_OPTIONS[0];
}

function getMarketAccessCfg(value: boolean | null | undefined) {
  const resolved = resolveMarketAccess(value);
  return MARKET_ACCESS_OPTIONS.find(o => o.value === resolved) ?? MARKET_ACCESS_OPTIONS[0];
}

// ── PHASE 9: Reusable badge components ───────────────────────────────

function VisibilityBadge({ mode }: { mode: VisibilityMode | null | undefined }) {
  const cfg = getVisibilityCfg(mode);
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${cfg.color}`}>
      {cfg.emoji} {cfg.label}
    </span>
  );
}

function MarketAccessBadge({ value }: { value: boolean | null | undefined }) {
  const cfg = getMarketAccessCfg(value);
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${cfg.color}`}>
      {cfg.emoji} {cfg.label}
    </span>
  );
}

// ══════════════════════════════════════════════════════════════════════
// VISIBILITY SELECT — Layer 1: controls shops.visibility_mode
// ══════════════════════════════════════════════════════════════════════

const VisibilitySelect = memo(function VisibilitySelect({
  shopId, currentMode, onUpdated, dir, onError,
}: {
  shopId: number;
  currentMode: VisibilityMode | null;
  onUpdated: (shopId: number, mode: VisibilityMode) => void;
  dir?: string;
  onError?: (msg: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const cfg = getVisibilityCfg(currentMode);

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newMode = e.target.value as VisibilityMode;
    try {
      setSaving(true);
      const { error } = await supabase.from('shops').update({ visibility_mode: newMode }).eq('id', shopId);
      if (error) throw error;
      onUpdated(shopId, newMode);
    } catch (err) {
      console.error('[VisibilitySelect]', err);
      onError?.(t.toastVisibilityError);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative inline-flex items-center">
      {saving && <Loader2 size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-blue-400 animate-spin z-10 pointer-events-none" />}
      <select
        value={resolveVisibility(currentMode)}
        onChange={handleChange}
        disabled={saving}
        aria-label={t.colInventoryVisibility}
        className={`appearance-none border text-xs font-bold rounded-xl py-1.5 pl-7 pr-3 focus:outline-none focus:ring-1 focus:ring-blue-500/30 cursor-pointer transition-all disabled:opacity-50 min-h-[36px] ${cfg.color}`}
        style={{ direction: dir === 'rtl' ? 'rtl' : 'ltr' }}
      >
        {VISIBILITY_OPTIONS.map(o => (
          <option key={o.value} value={o.value} className="bg-slate-900 text-white">{o.emoji} {o.label}</option>
        ))}
      </select>
      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] pointer-events-none select-none">{cfg.emoji}</span>
    </div>
  );
});

// ══════════════════════════════════════════════════════════════════════
// MARKETPLACE ACCESS SELECT — Layer 2: controls shops.can_view_public_market
// SEPARATE from VisibilitySelect. Do not merge these two components.
// ══════════════════════════════════════════════════════════════════════

const MarketplaceAccessSelect = memo(function MarketplaceAccessSelect({
  shopId, currentValue, onUpdated, dir, onError,
}: {
  shopId: number;
  currentValue: boolean | null;
  onUpdated: (shopId: number, value: boolean) => void;
  dir?: string;
  onError?: (msg: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const cfg = getMarketAccessCfg(currentValue);

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newVal = e.target.value === 'true';
    try {
      setSaving(true);
      const { error } = await supabase.from('shops').update({ can_view_public_market: newVal }).eq('id', shopId);
      if (error) throw error;
      onUpdated(shopId, newVal);
    } catch (err) {
      console.error('[MarketplaceAccessSelect]', err);
      onError?.(t.toastMarketAccessError);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative inline-flex items-center">
      {saving && <Loader2 size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-blue-400 animate-spin z-10 pointer-events-none" />}
      <select
        value={String(resolveMarketAccess(currentValue))}
        onChange={handleChange}
        disabled={saving}
        aria-label={t.colMarketplaceAccess}
        className={`appearance-none border text-xs font-bold rounded-xl py-1.5 pl-7 pr-3 focus:outline-none focus:ring-1 focus:ring-blue-500/30 cursor-pointer transition-all disabled:opacity-50 min-h-[36px] ${cfg.color}`}
        style={{ direction: dir === 'rtl' ? 'rtl' : 'ltr' }}
      >
        {MARKET_ACCESS_OPTIONS.map(o => (
          <option key={String(o.value)} value={String(o.value)} className="bg-slate-900 text-white">{o.emoji} {o.label}</option>
        ))}
      </select>
      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] pointer-events-none select-none">{cfg.emoji}</span>
    </div>
  );
});

// ══════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════

const waLink = (num: string) => {
  const clean = num.replace(/\D/g, '');
  const international = clean.startsWith('0') ? '966' + clean.slice(1) : clean;
  return `https://wa.me/${international}`;
};

const normalizeUrl = (url: string) =>
  url.startsWith('http://') || url.startsWith('https://') ? url : `https://${url}`;

// ══════════════════════════════════════════════════════════════════════
// LOGO AVATAR
// ══════════════════════════════════════════════════════════════════════

function ShopAvatar({ shop, size = 'md' }: { shop: Pick<Shop, 'shop_name' | 'logo_url' | 'is_active'>; size?: 'sm' | 'md' | 'lg' }) {
  const dims = { sm: 'w-10 h-10 text-base', md: 'w-14 h-14 text-2xl', lg: 'w-24 h-24 text-4xl' };
  const radii = { sm: 'rounded-xl', md: 'rounded-2xl', lg: 'rounded-[2rem]' };
  if (shop.logo_url) {
    return <img src={shop.logo_url} alt={shop.shop_name} className={`${dims[size]} ${radii[size]} object-cover border border-slate-700/60 shadow-inner transition-transform group-hover:scale-110`} />;
  }
  return (
    <div className={`${dims[size]} ${radii[size]} flex items-center justify-center font-black shadow-inner transition-transform group-hover:scale-110 ${shop.is_active ? 'bg-blue-600/10 text-blue-500' : 'bg-slate-800 text-slate-600'}`}>
      {(shop.shop_name || 'M').charAt(0)}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// LOGO UPLOAD WIDGET
// ══════════════════════════════════════════════════════════════════════

function LogoUploadWidget({ currentUrl, onUploaded, uploading, setUploading }: {
  currentUrl: string; onUploaded: (url: string) => void; uploading: boolean; setUploading: (v: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string>(currentUrl);
  const [error, setError] = useState('');

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError(t.logoErrType); return; }
    if (file.size > 2 * 1024 * 1024) { setError(t.logoErrSize); return; }
    setError('');
    setPreview(URL.createObjectURL(file));
    setUploading(true);
    const ext = file.name.split('.').pop();
    const path = `shop-logo-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from('shop-logos').upload(path, file, { upsert: true, contentType: file.type });
    if (uploadError) { setError(t.logoErrUpload); setPreview(currentUrl); setUploading(false); return; }
    const { data } = supabase.storage.from('shop-logos').getPublicUrl(path);
    onUploaded(data.publicUrl);
    setUploading(false);
  };

  return (
    <div className="space-y-2">
      <label className="text-xs text-slate-400 font-bold uppercase tracking-wide flex items-center gap-1.5">
        <ImageIcon size={12} className="text-violet-400" />{t.logoLabel}
      </label>
      <div className="flex items-center gap-4">
        <div className="relative w-16 h-16 rounded-2xl overflow-hidden bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
          {preview ? <img src={preview} alt="logo" className="w-full h-full object-cover" /> : <ImageIcon size={22} className="text-slate-600" />}
          {uploading && <div className="absolute inset-0 bg-slate-900/70 flex items-center justify-center"><Loader2 size={18} className="text-violet-400 animate-spin" /></div>}
        </div>
        <div className="flex-1">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="w-full h-11 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-sm font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-50 touch-manipulation"
          >
            {uploading ? <><Loader2 size={14} className="animate-spin" />{t.uploading}</> : <><Upload size={14} className="text-violet-400" />{preview ? t.changeLogo : t.uploadLogo}</>}
          </button>
          <p className="text-[11px] text-slate-600 mt-1.5 text-center">{t.logoHint}</p>
          {error && <p className="text-[11px] text-red-400 mt-1 text-center">{error}</p>}
        </div>
      </div>
      <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleFile} />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════

export default function ShopsPage() {
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);
  const [activeTab, setActiveTab] = useState('all');
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    shop_name: '', city: '', phone: '', is_active: true,
    whatsapp: '', google_maps_url: '', logo_url: '',
    commercial_registration: '', address: '', email: '', website: '',
    visibility_mode: 'public' as VisibilityMode, // Layer 1
    can_view_public_market: true as boolean,      // Layer 2
  });
  const [editLoading, setEditLoading] = useState(false);
  const [editSuccess, setEditSuccess] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [now, setNow] = useState(new Date());
  const { toasts, addToast } = useToast();

  const dir = LANG === 'ar' ? 'rtl' : 'ltr';
  const textAlign = LANG === 'ar' ? 'text-right' : 'text-left';
  const searchIcon = LANG === 'ar' ? 'right-4' : 'left-4';
  const searchPad  = LANG === 'ar' ? 'pr-12 pl-4' : 'pl-12 pr-4';

  // Phase 5: Escape closes drawer (not when modal is open)
  useEffect(() => {
    if (!selectedShop || editModalOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelectedShop(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [selectedShop, editModalOpen]);

  // Phase 6: Escape closes modal (blocked during active save to prevent data loss)
  useEffect(() => {
    if (!editModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !editLoading && !logoUploading) setEditModalOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [editModalOpen, editLoading, logoUploading]);

  const stats = {
    total: shops.length,
    active: shops.filter(s => s.is_active).length,
    inactive: shops.filter(s => !s.is_active).length,
    trial: shops.filter(s => s.subscription_status === 'trial').length,
  };

  useEffect(() => { fetchShops(); }, []);
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Phase 3: explicit column list — no SELECT *
  const fetchShops = async () => {
    try {
      setLoading(true);
      const { data: shopsData, error: shopsError } = await supabase
        .from('shops')
        .select(
          'id, shop_name, phone, city, is_active, subscription_status, created_at, ' +
          'whatsapp, google_maps_url, logo_url, commercial_registration, address, email, website, ' +
          'visibility_mode, can_view_public_market'
        )
        .order('created_at', { ascending: false });

      if (shopsError) throw shopsError;
      if (!shopsData || shopsData.length === 0) { setShops([]); return; }

      const shopIds = shopsData.map((s: any) => s.id);

      const { data: productsData } = await supabase.from('products').select('shop_id, quantity').in('shop_id', shopIds);
      const productsSummary: Record<number, { total_quantity: number; products_count: number }> = {};
      for (const row of productsData || []) {
        if (row.shop_id != null) {
          if (!productsSummary[row.shop_id]) productsSummary[row.shop_id] = { total_quantity: 0, products_count: 0 };
          productsSummary[row.shop_id].total_quantity += Number(row.quantity || 0);
          productsSummary[row.shop_id].products_count += 1;
        }
      }

      const { data: outgoingData } = await supabase.from('orders').select('from_shop_id').in('from_shop_id', shopIds);
      const { data: incomingData } = await supabase.from('orders').select('to_shop_id').in('to_shop_id', shopIds);

      const merged = shopsData.map((shop: any) => ({
        ...shop,
        total_quantity: productsSummary[shop.id]?.total_quantity ?? 0,
        products_count: productsSummary[shop.id]?.products_count ?? 0,
        outgoing_orders: [{ count: (outgoingData || []).filter((o: any) => o.from_shop_id === shop.id).length }],
        incoming_orders: [{ count: (incomingData || []).filter((o: any) => o.to_shop_id === shop.id).length }],
        whatsapp: shop.whatsapp ?? null,
        google_maps_url: shop.google_maps_url ?? null,
        logo_url: shop.logo_url ?? null,
        commercial_registration: shop.commercial_registration ?? null,
        address: shop.address ?? null,
        email: shop.email ?? null,
        website: shop.website ?? null,
        visibility_mode: resolveVisibility(shop.visibility_mode),
        can_view_public_market: shop.can_view_public_market ?? null,
      }));

      setShops(merged);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleVisibilityUpdated = useCallback((shopId: number, mode: VisibilityMode) => {
    setShops(prev => prev.map(s => s.id === shopId ? { ...s, visibility_mode: mode } : s));
    setSelectedShop(prev => prev && prev.id === shopId ? { ...prev, visibility_mode: mode } : prev);
  }, []);

  const handleMarketAccessUpdated = useCallback((shopId: number, value: boolean) => {
    setShops(prev => prev.map(s => s.id === shopId ? { ...s, can_view_public_market: value } : s));
    setSelectedShop(prev => prev && prev.id === shopId ? { ...prev, can_view_public_market: value } : prev);
  }, []);

  const toggleStatus = async (shop: Shop) => {
    const msg = shop.is_active ? t.confirmDeactivate(shop.shop_name) : t.confirmActivate(shop.shop_name);
    if (!window.confirm(msg)) return;
    try {
      const { error } = await supabase.from('shops').update({ is_active: !shop.is_active }).eq('id', shop.id);
      if (error) throw error;
      setShops(shops.map(s => s.id === shop.id ? { ...s, is_active: !s.is_active } : s));
    } catch {
      alert(t.toastStatusError);
    }
  };

  const openEditModal = (shop: Shop) => {
    setSelectedShop(shop);
    setEditForm({
      shop_name: shop.shop_name || '',
      city: shop.city || '',
      phone: shop.phone || '',
      is_active: shop.is_active,
      whatsapp: shop.whatsapp || '',
      google_maps_url: shop.google_maps_url || '',
      logo_url: shop.logo_url || '',
      commercial_registration: shop.commercial_registration || '',
      address: shop.address || '',
      email: shop.email || '',
      website: shop.website || '',
      visibility_mode: resolveVisibility(shop.visibility_mode),         // Layer 1
      can_view_public_market: resolveMarketAccess(shop.can_view_public_market), // Layer 2
    });
    setEditSuccess(false);
    setEditModalOpen(true);
  };

  const saveEdit = async () => {
    if (!selectedShop) return;
    try {
      setEditLoading(true);
      const { error } = await supabase
        .from('shops')
        .update({
          shop_name: editForm.shop_name,
          city: editForm.city,
          phone: editForm.phone,
          is_active: editForm.is_active,
          whatsapp: editForm.whatsapp || null,
          google_maps_url: editForm.google_maps_url || null,
          logo_url: editForm.logo_url || null,
          commercial_registration: editForm.commercial_registration || null,
          address: editForm.address || null,
          email: editForm.email || null,
          website: editForm.website || null,
          visibility_mode: editForm.visibility_mode,           // Layer 1
          can_view_public_market: editForm.can_view_public_market, // Layer 2
        })
        .eq('id', selectedShop.id);
      if (error) throw error;
      await fetchShops();
      setEditSuccess(true);
      addToast(t.saveSuccess, 'success');
      setTimeout(() => { setEditModalOpen(false); setEditSuccess(false); }, 1200);
    } catch {
      addToast(t.saveError, 'error');
    } finally {
      setEditLoading(false);
    }
  };

  const filteredShops = shops.filter(shop => {
    const matchesSearch =
      (shop.shop_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (shop.city || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (shop.phone || '').includes(searchTerm);
    const matchesTab =
      activeTab === 'all' ? true :
      activeTab === 'active' ? shop.is_active :
      activeTab === 'inactive' ? !shop.is_active :
      shop.subscription_status === 'trial';
    return matchesSearch && matchesTab;
  });

  const tabLabels: Record<string, string> = { all: t.tabAll, active: t.tabActive, inactive: t.tabInactive, trial: t.tabTrial };

  return (
    <div className={`min-h-screen bg-slate-950 p-4 lg:p-8 ${textAlign}`} dir={dir}>
      <ToastContainer toasts={toasts} />

      {/* HEADER */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 mb-10">
        <div>
          <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight flex flex-wrap items-center gap-3">
            {t.pageTitle}
            <span className="text-sm font-medium bg-blue-500/10 text-blue-500 px-3 py-1 rounded-full border border-blue-500/20">
              {t.shopCount(stats.total)}
            </span>
          </h1>
          <p className="text-slate-400 mt-2 text-base lg:text-lg">{t.pageSubtitle}</p>
        </div>
        <div className="flex items-center gap-3 w-full lg:w-auto">
          <button onClick={fetchShops} aria-label="Refresh" className="p-3 bg-slate-900 border border-slate-800 rounded-2xl text-slate-400 hover:text-white transition-all touch-manipulation">
            <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
          </button>
          <div className="flex items-center gap-3 sm:gap-4 bg-slate-900 border border-slate-800/60 rounded-2xl px-4 sm:px-5 py-3 shadow-xl">
            <div className="flex items-center gap-2">
              <CalendarDays size={16} className="text-blue-400 shrink-0" />
              <div className={textAlign}>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest leading-none mb-0.5">
                  {now.toLocaleDateString(t.dateLocale, { weekday: t.weekday })}
                </p>
                <p className="text-white font-black text-sm leading-none">
                  {now.toLocaleDateString(t.dateLocale, { year: 'numeric', month: '2-digit', day: '2-digit' })}
                </p>
              </div>
            </div>
            <div className="w-px h-8 bg-slate-700" />
            <div className="flex items-center gap-2">
              <Clock size={16} className="text-emerald-400 shrink-0" />
              <p className="text-white font-black text-sm tabular-nums">
                {now.toLocaleTimeString(t.dateLocale, { hour: '2-digit', minute: '2-digit', hour12: true })}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* KPI CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        {[
          { label: t.totalShops,    value: stats.total,    icon: Store,       color: 'text-blue-500',    bg: 'bg-blue-500/5'    },
          { label: t.activeShops,   value: stats.active,   icon: CheckCircle, color: 'text-emerald-500', bg: 'bg-emerald-500/5' },
          { label: t.inactiveShops, value: stats.inactive, icon: AlertCircle, color: 'text-red-500',     bg: 'bg-red-500/5'     },
          { label: t.trialShops,    value: stats.trial,    icon: Activity,    color: 'text-amber-500',   bg: 'bg-amber-500/5'   },
        ].map((card, i) => (
          <div key={i} className="bg-slate-900 border border-slate-800/60 p-6 rounded-3xl hover:border-slate-700 transition-all group hover:scale-[1.02] duration-300 shadow-xl">
            <div className="flex justify-between items-start mb-4">
              <div className={`p-3 ${card.bg} rounded-2xl`}><card.icon className={card.color} size={24} /></div>
              <span className="text-slate-500 text-xs font-black uppercase tracking-widest">{t.globalStat}</span>
            </div>
            <p className="text-slate-400 font-medium">{card.label}</p>
            <h3 className="text-3xl font-black text-white mt-1">{card.value}</h3>
          </div>
        ))}
      </div>

      {/* FILTERS */}
      <div className="bg-slate-900 border border-slate-800/60 rounded-[2.5rem] p-4 lg:p-6 mb-8 shadow-2xl">
        <div className="flex flex-col lg:flex-row justify-between items-center gap-6">
          <div className="flex bg-slate-950 p-1.5 rounded-2xl border border-slate-800 w-full lg:w-auto overflow-x-auto">
            {(['all', 'active', 'inactive', 'trial'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-5 sm:px-6 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap touch-manipulation ${activeTab === tab ? 'bg-slate-800 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
              >
                {tabLabels[tab]}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3 w-full lg:w-1/2">
            <div className="relative flex-1">
              <Search className={`absolute ${searchIcon} top-1/2 -translate-y-1/2 text-slate-500`} size={20} />
              <input
                type="text"
                placeholder={t.searchPlaceholder}
                className={`w-full bg-slate-950 border border-slate-800 rounded-2xl py-3.5 ${searchPad} text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all font-medium`}
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
            <button aria-label="Filter" className="p-3.5 bg-slate-950 border border-slate-800 rounded-2xl text-slate-400 hover:text-white touch-manipulation"><Filter size={20} /></button>
          </div>
        </div>
      </div>

      {/* TABLE */}
      <div className="bg-slate-900 border border-slate-800/60 rounded-[2.5rem] overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-right" style={{ minWidth: '960px' }}>
            <thead>
              <tr className="bg-slate-950/50 text-slate-500 text-xs font-black uppercase tracking-widest border-b border-slate-800">
                <th className="px-8 py-6">{t.colShopInfo}</th>
                <th className="px-8 py-6">{t.colLocation}</th>
                <th className="px-8 py-6">{t.colOwner}</th>
                <th className="px-8 py-6 text-center">{t.colInventory}</th>
                <th className="px-8 py-6 text-center">{t.colStatus}</th>
                <th className="px-5 py-6 text-center">{t.colInventoryVisibility}</th>
                <th className="px-5 py-6 text-center">{t.colMarketplaceAccess}</th>
                <th className="px-8 py-6 text-center">{t.colActions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
              {loading ? (
                <tr><td colSpan={8} className="px-8 py-20 text-center">
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    <p className="text-slate-500 font-bold">{t.loading}</p>
                  </div>
                </td></tr>
              ) : filteredShops.length === 0 ? (
                <tr><td colSpan={8} className="px-8 py-20 text-center">
                  <p className="text-slate-500 font-bold">{t.noResults}</p>
                </td></tr>
              ) : filteredShops.map(shop => (
                <tr key={shop.id} className="group hover:bg-slate-800/30 transition-all duration-300">
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-4">
                      <ShopAvatar shop={shop} size="md" />
                      <div>
                        <p className="text-white font-black text-lg group-hover:text-blue-400 transition-colors">{shop.shop_name}</p>
                        <p className="text-slate-500 text-sm font-medium mt-0.5">{shop.phone || '---'}</p>
                        {shop.commercial_registration && <p className="text-slate-600 text-xs font-mono mt-0.5">CR: {shop.commercial_registration}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center gap-2 text-slate-300 font-bold bg-slate-950/50 w-fit px-3 py-1.5 rounded-xl border border-slate-800/50">
                        <MapPin size={14} className="text-slate-500" />{shop.city || '---'}
                      </div>
                      {shop.address && <p className="text-slate-600 text-xs max-w-[180px] truncate">{shop.address}</p>}
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center shrink-0"><User size={14} className="text-slate-500" /></div>
                      <div>
                        <p className="text-slate-400 text-sm font-medium">{t.shopManager}</p>
                        {shop.email && <p className="text-slate-600 text-xs truncate max-w-[130px]">{shop.email}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-6 text-center font-black text-white">
                    <div className="flex flex-col items-center bg-slate-950/50 p-2 rounded-2xl border border-slate-800/50">
                      <span className="text-blue-500 text-lg">{shop.total_quantity || 0}</span>
                      <span className="text-[10px] text-slate-500">{t.units}</span>
                      <span className="text-[10px] text-slate-400 mt-1">{shop.products_count || 0} {t.items}</span>
                    </div>
                  </td>
                  <td className="px-8 py-6 text-center">
                    <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-black border transition-all ${shop.is_active ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 shadow-lg shadow-emerald-500/5' : 'bg-red-500/10 text-red-500 border-red-500/20 shadow-lg shadow-red-500/5'}`}>
                      <div className={`w-2 h-2 rounded-full ${shop.is_active ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                      {shop.is_active ? t.statusActive : t.statusInactive}
                    </span>
                  </td>
                  <td className="px-5 py-6 text-center">
                    <VisibilitySelect shopId={shop.id} currentMode={shop.visibility_mode} onUpdated={handleVisibilityUpdated} onError={msg => addToast(msg, 'error')} dir={dir} />
                  </td>
                  <td className="px-5 py-6 text-center">
                    <MarketplaceAccessSelect shopId={shop.id} currentValue={shop.can_view_public_market} onUpdated={handleMarketAccessUpdated} onError={msg => addToast(msg, 'error')} dir={dir} />
                  </td>
                  <td className="px-8 py-6 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button onClick={() => setSelectedShop(shop)} className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-400 hover:text-white hover:border-slate-600 transition-all touch-manipulation" title={t.viewDetails} aria-label={t.viewDetails}><Eye size={18} /></button>
                      <button onClick={() => openEditModal(shop)} className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-400 hover:text-blue-400 hover:border-blue-500/50 transition-all touch-manipulation" title={t.edit} aria-label={t.edit}><Edit2 size={18} /></button>
                      <button onClick={() => toggleStatus(shop)} className={`p-2.5 bg-slate-950 border border-slate-800 rounded-xl transition-all touch-manipulation ${shop.is_active ? 'text-red-400 hover:bg-red-500/10 hover:border-red-500/50' : 'text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500/50'}`} title={shop.is_active ? t.deactivate : t.activate} aria-label={shop.is_active ? t.deactivate : t.activate}><Activity size={18} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* EDIT MODAL — Phase 6: Escape closes unless saving */}
      {editModalOpen && selectedShop && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={t.editTitle}>
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => { if (!editLoading && !logoUploading) setEditModalOpen(false); }} />
          <div className="relative w-full max-w-lg bg-slate-900 border border-slate-700 rounded-[2rem] shadow-2xl overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-500/50 to-transparent" />
            <div className="flex items-center justify-between px-7 pt-7 pb-5 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-500/15 border border-blue-500/20 flex items-center justify-center"><Edit2 size={16} className="text-blue-400" /></div>
                <div>
                  <h3 className="text-white font-black text-lg leading-none">{t.editTitle}</h3>
                  <p className="text-slate-500 text-xs mt-0.5">{selectedShop.shop_name}</p>
                </div>
              </div>
              <button onClick={() => { if (!editLoading && !logoUploading) setEditModalOpen(false); }} disabled={editLoading || logoUploading} aria-label={t.cancel} className="p-2 hover:bg-slate-800 rounded-xl transition-all text-slate-400 hover:text-white disabled:opacity-40"><X size={20} /></button>
            </div>

            <div className="px-7 py-6 space-y-5 max-h-[68vh] overflow-y-auto" dir={dir}>
              <LogoUploadWidget currentUrl={editForm.logo_url} uploading={logoUploading} setUploading={setLogoUploading} onUploaded={url => setEditForm({ ...editForm, logo_url: url })} />
              <div className="border-t border-slate-800/60 pt-1" />
              <p className="text-[10px] text-slate-600 font-black uppercase tracking-widest">{t.sectionBasic}</p>

              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 font-bold uppercase tracking-wide">{t.shopName}</label>
                <input type="text" value={editForm.shop_name} onChange={e => setEditForm({ ...editForm, shop_name: e.target.value })} className="w-full bg-slate-950 border border-slate-700 rounded-2xl px-4 h-12 text-white text-sm focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all" placeholder={t.shopNamePlaceholder} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 font-bold uppercase tracking-wide">{t.city}</label>
                <input type="text" value={editForm.city} onChange={e => setEditForm({ ...editForm, city: e.target.value })} className="w-full bg-slate-950 border border-slate-700 rounded-2xl px-4 h-12 text-white text-sm focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all" placeholder={t.cityPlaceholder} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 font-bold uppercase tracking-wide flex items-center gap-1.5"><Home size={12} className="text-slate-500" />{t.fullAddress}</label>
                <textarea value={editForm.address} onChange={e => setEditForm({ ...editForm, address: e.target.value })} rows={2} className="w-full bg-slate-950 border border-slate-700 rounded-2xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all resize-none" placeholder={t.addressPlaceholder} />
              </div>

              <div className="border-t border-slate-800/60 pt-1" />
              <p className="text-[10px] text-slate-600 font-black uppercase tracking-widest">{t.sectionContact}</p>

              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 font-bold uppercase tracking-wide">{t.phone}</label>
                <input type="text" value={editForm.phone} onChange={e => setEditForm({ ...editForm, phone: e.target.value })} className="w-full bg-slate-950 border border-slate-700 rounded-2xl px-4 h-12 text-white text-sm focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all" placeholder={t.phonePlaceholder} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 font-bold uppercase tracking-wide flex items-center gap-1.5"><MessageCircle size={12} className="text-emerald-500" />{t.whatsapp}</label>
                <input type="text" value={editForm.whatsapp} onChange={e => setEditForm({ ...editForm, whatsapp: e.target.value })} className="w-full bg-slate-950 border border-slate-700 rounded-2xl px-4 h-12 text-white text-sm focus:outline-none focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/20 transition-all" placeholder={t.whatsappPlaceholder} dir="ltr" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 font-bold uppercase tracking-wide flex items-center gap-1.5"><Mail size={12} className="text-sky-400" />{t.email}</label>
                <input type="email" value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })} className="w-full bg-slate-950 border border-slate-700 rounded-2xl px-4 h-12 text-white text-sm focus:outline-none focus:border-sky-500/40 focus:ring-1 focus:ring-sky-500/20 transition-all" placeholder={t.emailPlaceholder} dir="ltr" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 font-bold uppercase tracking-wide flex items-center gap-1.5"><Globe size={12} className="text-purple-400" />{t.website}</label>
                <input type="text" value={editForm.website} onChange={e => setEditForm({ ...editForm, website: e.target.value })} className="w-full bg-slate-950 border border-slate-700 rounded-2xl px-4 h-12 text-white text-sm focus:outline-none focus:border-purple-500/40 focus:ring-1 focus:ring-purple-500/20 transition-all" placeholder={t.websitePlaceholder} dir="ltr" />
              </div>

              <div className="border-t border-slate-800/60 pt-1" />
              <p className="text-[10px] text-slate-600 font-black uppercase tracking-widest">{t.sectionBusiness}</p>

              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 font-bold uppercase tracking-wide flex items-center gap-1.5"><FileText size={12} className="text-amber-400" />{t.commercialReg}</label>
                <input type="text" value={editForm.commercial_registration} onChange={e => setEditForm({ ...editForm, commercial_registration: e.target.value })} className="w-full bg-slate-950 border border-slate-700 rounded-2xl px-4 h-12 text-white text-sm font-mono focus:outline-none focus:border-amber-500/40 focus:ring-1 focus:ring-amber-500/20 transition-all" placeholder={t.commercialRegPlaceholder} dir="ltr" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 font-bold uppercase tracking-wide flex items-center gap-1.5"><Navigation size={12} className="text-blue-400" />{t.mapsUrl}</label>
                <input type="text" value={editForm.google_maps_url} onChange={e => setEditForm({ ...editForm, google_maps_url: e.target.value })} className="w-full bg-slate-950 border border-slate-700 rounded-2xl px-4 h-12 text-white text-sm focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all" placeholder={t.mapsUrlPlaceholder} dir="ltr" />
              </div>

              {/*
                VISIBILITY SETTINGS — TWO INDEPENDENT LAYERS:
                Layer 1 (visibility_mode):         who can SEE this shop's products
                Layer 2 (can_view_public_market):  can THIS SHOP see others' public products
                Never merge or confuse these two controls.
              */}
              <div className="border-t border-slate-800/60 pt-1" />
              <p className="text-[10px] text-slate-600 font-black uppercase tracking-widest flex items-center gap-1.5"><Eye size={11} className="text-slate-500" />{t.sectionVisibility}</p>

              <div className="space-y-2">
                <label className="text-xs text-slate-400 font-bold uppercase tracking-wide flex items-center gap-1.5"><Store size={12} className="text-slate-400" />{t.inventoryVisibility}</label>
                <div className="flex gap-2 flex-wrap">
                  {VISIBILITY_OPTIONS.map(opt => (
                    <button key={opt.value} type="button" onClick={() => setEditForm({ ...editForm, visibility_mode: opt.value })}
                      className={`flex items-center gap-1.5 px-4 py-2.5 rounded-2xl text-xs font-bold border transition-all touch-manipulation min-h-[40px] ${editForm.visibility_mode === opt.value ? opt.color + ' ring-1 ring-offset-1 ring-offset-slate-900' : 'bg-slate-950 border-slate-700 text-slate-400 hover:border-slate-600'}`}>
                      {opt.emoji} {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-slate-400 font-bold uppercase tracking-wide flex items-center gap-1.5"><Globe size={12} className="text-slate-400" />{t.marketplaceAccess}</label>
                <div className="flex gap-2 flex-wrap">
                  {MARKET_ACCESS_OPTIONS.map(opt => (
                    <button key={String(opt.value)} type="button" onClick={() => setEditForm({ ...editForm, can_view_public_market: opt.value })}
                      className={`flex items-center gap-1.5 px-4 py-2.5 rounded-2xl text-xs font-bold border transition-all touch-manipulation min-h-[40px] ${editForm.can_view_public_market === opt.value ? opt.color + ' ring-1 ring-offset-1 ring-offset-slate-900' : 'bg-slate-950 border-slate-700 text-slate-400 hover:border-slate-600'}`}>
                      {opt.emoji} {opt.label}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-slate-600 mt-1">{t.marketplaceAccessHint}</p>
              </div>

              <div className="border-t border-slate-800/60 pt-1" />
              <div className="flex items-center justify-between bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3">
                <span className="text-sm text-slate-300 font-bold">{t.shopStatus}</span>
                <button type="button" onClick={() => setEditForm({ ...editForm, is_active: !editForm.is_active })} aria-pressed={editForm.is_active}
                  className={`relative w-12 h-6 rounded-full transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-950 ${editForm.is_active ? 'bg-emerald-500 focus:ring-emerald-500' : 'bg-slate-700 focus:ring-slate-500'}`}>
                  <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all duration-300 ${editForm.is_active ? 'right-0.5' : 'left-0.5'}`} />
                </button>
                <span className={`text-xs font-bold ${editForm.is_active ? 'text-emerald-400' : 'text-red-400'}`}>{editForm.is_active ? t.statusActive : t.statusInactive}</span>
              </div>

              {editSuccess && (
                <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl px-4 py-3" role="status">
                  <CheckSquare size={16} className="text-emerald-400 shrink-0" />
                  <span className="text-emerald-400 text-sm font-bold">{t.saveSuccess}</span>
                </div>
              )}
            </div>

            <div className="flex gap-3 px-7 pb-7 pt-2 border-t border-slate-800/60">
              <button onClick={() => { if (!editLoading && !logoUploading) setEditModalOpen(false); }} disabled={editLoading || logoUploading} className="flex-1 h-12 rounded-2xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 font-bold text-sm transition-all touch-manipulation">{t.cancel}</button>
              <button onClick={saveEdit} disabled={editLoading || editSuccess || logoUploading}
                className="flex-1 h-12 rounded-2xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold text-sm transition-all flex items-center justify-center gap-2 touch-manipulation">
                {logoUploading ? <><Loader2 size={16} className="animate-spin" />{t.uploadingLogo}</> :
                 editLoading    ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />{t.saving}</> :
                 editSuccess    ? <><CheckCircle size={16} />{t.saved}</> :
                                  <><Save size={16} />{t.save}</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SHOP DETAILS DRAWER — Phase 5: Escape closes (wired via useEffect) */}
      {selectedShop && !editModalOpen && (
        <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={t.drawerTitle}>
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setSelectedShop(null)} />
          <div className="relative w-full max-w-lg bg-slate-900 border-r border-slate-800 h-full shadow-2xl animate-in slide-in-from-left duration-300">
            <div className="p-6 sm:p-8 h-full overflow-y-auto" dir={dir}>
              <div className="flex justify-between items-center mb-10">
                <button onClick={() => setSelectedShop(null)} aria-label="Close" className="p-2 hover:bg-slate-800 rounded-xl transition-all touch-manipulation"><X size={24} className="text-slate-400" /></button>
                <h2 className="text-2xl font-black text-white">{t.drawerTitle}</h2>
              </div>

              <div className="flex flex-col items-center mb-10 text-center">
                {selectedShop.logo_url ? (
                  <div className="relative mb-4">
                    <img src={selectedShop.logo_url} alt={selectedShop.shop_name} className="w-28 h-28 rounded-[2rem] object-cover border-2 border-slate-700/60 shadow-2xl" />
                    {selectedShop.is_active && <span className="absolute -bottom-1 -left-1 w-5 h-5 bg-emerald-500 rounded-full border-2 border-slate-900" />}
                  </div>
                ) : (
                  <div className="relative mb-4">
                    <div className="w-28 h-28 bg-blue-600/10 border border-blue-500/20 rounded-[2rem] flex items-center justify-center text-blue-500 text-4xl font-black">{(selectedShop.shop_name || 'M').charAt(0)}</div>
                    {selectedShop.is_active && <span className="absolute -bottom-1 -left-1 w-5 h-5 bg-emerald-500 rounded-full border-2 border-slate-900" />}
                  </div>
                )}
                <h3 className="text-2xl font-black text-white">{selectedShop.shop_name}</h3>
                {selectedShop.commercial_registration && <p className="text-slate-600 text-xs font-mono mt-1">CR: {selectedShop.commercial_registration}</p>}
                <p className="text-slate-500 mt-1">{selectedShop.phone || '---'}</p>

                {/* Reusable badge components (Phase 9) */}
                <div className="mt-3 flex flex-wrap gap-2 justify-center">
                  <VisibilityBadge mode={selectedShop.visibility_mode} />
                  <MarketAccessBadge value={selectedShop.can_view_public_market} />
                </div>

                <div className="mt-4 flex gap-2 flex-wrap justify-center">
                  <button className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-bold flex items-center gap-2 transition-all touch-manipulation"><Key size={14} />{t.resetPassword}</button>
                  {selectedShop.whatsapp && (
                    <a href={waLink(selectedShop.whatsapp)} target="_blank" rel="noopener noreferrer" className="px-4 py-2.5 bg-emerald-600/10 hover:bg-emerald-600/20 border border-emerald-500/20 text-emerald-400 rounded-xl text-sm font-bold flex items-center gap-2 transition-all touch-manipulation">
                      <MessageCircle size={14} />{t.openChat}
                    </a>
                  )}
                  {selectedShop.google_maps_url && (
                    <a href={selectedShop.google_maps_url} target="_blank" rel="noopener noreferrer" className="px-4 py-2.5 bg-blue-600/10 hover:bg-blue-600/20 border border-blue-500/20 text-blue-400 rounded-xl text-sm font-bold flex items-center gap-2 transition-all touch-manipulation">
                      <Navigation size={14} />{t.openLocation}
                    </a>
                  )}
                  {selectedShop.website && (
                    <a href={normalizeUrl(selectedShop.website)} target="_blank" rel="noopener noreferrer" className="px-4 py-2.5 bg-purple-600/10 hover:bg-purple-600/20 border border-purple-500/20 text-purple-400 rounded-xl text-sm font-bold flex items-center gap-2 transition-all touch-manipulation">
                      <Globe size={14} />{t.goToWebsite}
                    </a>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-10">
                {[
                  { label: t.statProducts, val: selectedShop.total_quantity || 0,            icon: Package,       color: 'text-blue-500'    },
                  { label: t.statOutgoing, val: selectedShop.outgoing_orders[0]?.count || 0, icon: ArrowUpRight,  color: 'text-amber-500'   },
                  { label: t.statIncoming, val: selectedShop.incoming_orders[0]?.count || 0, icon: ArrowDownLeft, color: 'text-indigo-500'  },
                  { label: t.statUsers,    val: 1,                                            icon: User,          color: 'text-emerald-500' },
                ].map((stat, i) => (
                  <div key={i} className="bg-slate-950 border border-slate-800/60 p-4 rounded-3xl">
                    <div className="flex items-center gap-3 mb-2"><stat.icon size={16} className={stat.color} /><span className="text-slate-500 text-xs font-bold">{stat.label}</span></div>
                    <p className="text-2xl font-black text-white">{stat.val}</p>
                  </div>
                ))}
              </div>

              <div className="space-y-6">
                <h4 className="text-white font-black text-lg border-b border-slate-800 pb-2">{t.sectionBasicInfo}</h4>
                <div className="grid grid-cols-2 gap-y-6">
                  <div><p className="text-slate-500 text-xs font-bold uppercase mb-1">{t.drawerCity}</p><p className="text-white font-bold">{selectedShop.city || '---'}</p></div>
                  <div><p className="text-slate-500 text-xs font-bold uppercase mb-1">{t.drawerCreated}</p><p className="text-white font-bold">{new Date(selectedShop.created_at).toLocaleDateString(t.dateLocale)}</p></div>
                  <div><p className="text-slate-500 text-xs font-bold uppercase mb-1">{t.drawerSystemStatus}</p><span className="text-emerald-500 font-bold">{t.drawerSystemOnline}</span></div>
                  <div>
                    <p className="text-slate-500 text-xs font-bold uppercase mb-1">{t.drawerSubscription}</p>
                    <span className="text-blue-500 font-bold underline cursor-pointer flex items-center gap-1">
                      {selectedShop.subscription_status === 'trial' ? t.drawerSubTrial : t.drawerSubEnterprise}<ExternalLink size={12} />
                    </span>
                  </div>
                  <div>
                    <p className="text-slate-500 text-xs font-bold uppercase mb-1 flex items-center gap-1"><MessageCircle size={11} className="text-emerald-500" />{t.drawerWhatsapp}</p>
                    {selectedShop.whatsapp ? (
                      <a href={waLink(selectedShop.whatsapp)} target="_blank" rel="noopener noreferrer" className="text-emerald-400 font-bold hover:text-emerald-300 transition-colors flex items-center gap-1" dir="ltr">{selectedShop.whatsapp} <ExternalLink size={11} /></a>
                    ) : <p className="text-slate-600 font-bold">---</p>}
                  </div>
                  <div>
                    <p className="text-slate-500 text-xs font-bold uppercase mb-1 flex items-center gap-1"><Navigation size={11} className="text-blue-400" />{t.drawerLocation}</p>
                    {selectedShop.google_maps_url ? (
                      <a href={selectedShop.google_maps_url} target="_blank" rel="noopener noreferrer" className="text-blue-400 font-bold hover:text-blue-300 transition-colors flex items-center gap-1">{t.drawerOpenLocation} <ExternalLink size={11} /></a>
                    ) : <p className="text-slate-600 font-bold">---</p>}
                  </div>
                  <div>
                    <p className="text-slate-500 text-xs font-bold uppercase mb-1 flex items-center gap-1"><Mail size={11} className="text-sky-400" />{t.drawerEmail}</p>
                    {selectedShop.email ? (
                      <a href={`mailto:${selectedShop.email}`} className="text-sky-400 font-bold hover:text-sky-300 transition-colors flex items-center gap-1 break-all" dir="ltr">{selectedShop.email} <ExternalLink size={11} className="shrink-0" /></a>
                    ) : <p className="text-slate-600 font-bold">---</p>}
                  </div>
                  <div>
                    <p className="text-slate-500 text-xs font-bold uppercase mb-1 flex items-center gap-1"><Globe size={11} className="text-purple-400" />{t.drawerWebsite}</p>
                    {selectedShop.website ? (
                      <a href={normalizeUrl(selectedShop.website)} target="_blank" rel="noopener noreferrer" className="text-purple-400 font-bold hover:text-purple-300 transition-colors flex items-center gap-1 break-all" dir="ltr">{selectedShop.website} <ExternalLink size={11} className="shrink-0" /></a>
                    ) : <p className="text-slate-600 font-bold">---</p>}
                  </div>
                </div>

                {selectedShop.address && (
                  <div>
                    <p className="text-slate-500 text-xs font-bold uppercase mb-1 flex items-center gap-1"><Home size={11} className="text-slate-400" />{t.drawerFullAddress}</p>
                    <p className="text-white font-bold leading-relaxed">{selectedShop.address}</p>
                  </div>
                )}

                {selectedShop.commercial_registration && (
                  <div className="bg-slate-950/60 border border-slate-800/60 rounded-2xl px-4 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-slate-500 text-xs font-bold uppercase mb-0.5 flex items-center gap-1"><FileText size={11} className="text-amber-400" />{t.drawerCommercialReg}</p>
                      <p className="text-white font-black font-mono tracking-widest">{selectedShop.commercial_registration}</p>
                    </div>
                    <ShieldCheck size={20} className="text-amber-400/60" />
                  </div>
                )}

                {/*
                  DRAWER: VISIBILITY SETTINGS PANEL — Phase 10
                  Layer 1 (visibility_mode):         who can see this shop's products
                  Layer 2 (can_view_public_market):  can this shop see public products
                  Keep these two rows visually and semantically separate.
                */}
                <div className="bg-slate-950/60 border border-slate-800/60 rounded-2xl px-4 py-4 space-y-4">
                  <p className="text-slate-500 text-xs font-black uppercase tracking-widest flex items-center gap-1.5"><Eye size={11} className="text-slate-500" />{t.drawerVisibilitySettings}</p>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-400 text-xs font-bold flex items-center gap-1.5 shrink-0"><Store size={11} />{t.drawerInventoryVis}</span>
                    <VisibilityBadge mode={selectedShop.visibility_mode} />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-400 text-xs font-bold flex items-center gap-1.5 shrink-0"><Globe size={11} />{t.drawerMarketAccess}</span>
                    <MarketAccessBadge value={selectedShop.can_view_public_market} />
                  </div>
                </div>
              </div>

              <div className="mt-12 flex gap-4">
                <button
                  onClick={() => { toggleStatus(selectedShop); setSelectedShop(null); }}
                  className={`flex-1 py-4 rounded-2xl font-black transition-all touch-manipulation ${selectedShop.is_active ? 'bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500 hover:text-white' : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 hover:bg-emerald-500 hover:text-white'}`}
                >
                  {selectedShop.is_active ? t.deactivateShop : t.activateShop}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
