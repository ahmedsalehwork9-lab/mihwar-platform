import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
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
  // ── New icons for enhanced profile ──
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
// INTERFACES
// ══════════════════════════════════════════════════════════════════════

/**
 * Extended Shop interface.
 * New optional fields: logo_url, commercial_registration, address, email, website
 * All existing fields preserved unchanged.
 *
 * INVOICE INTEGRATION NOTE:
 *   Future invoice templates can destructure from this type:
 *     const { shop_name, phone, whatsapp, address, logo_url } = shop;
 *
 * VERIFY PAGE NOTE:
 *   VerifyInvoicePage can use: logo_url, shop_name, whatsapp, city
 */
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
  // Existing contact/location fields
  whatsapp: string | null;
  google_maps_url: string | null;
  // ── New business identity fields ──
  logo_url: string | null;
  commercial_registration: string | null;
  address: string | null;
  email: string | null;
  website: string | null;
}

/** Reusable flat profile type for invoice/verify page consumption */
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

/** Extract a ShopProfile from a full Shop object */
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
// HELPERS
// ══════════════════════════════════════════════════════════════════════

/** Format local Saudi number to wa.me link — unchanged */
const waLink = (num: string) => {
  const clean = num.replace(/\D/g, '');
  const international = clean.startsWith('0') ? '966' + clean.slice(1) : clean;
  return `https://wa.me/${international}`;
};

/** Ensure website has a protocol */
const normalizeUrl = (url: string) =>
  url.startsWith('http://') || url.startsWith('https://') ? url : `https://${url}`;

/** Upload logo to Supabase Storage and return public URL */
async function uploadLogo(file: File, shopId: number): Promise<string | null> {
  const ext = file.name.split('.').pop();
  const path = `shop-${shopId}-${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from('shop-logos')
    .upload(path, file, { upsert: true, contentType: file.type });

  if (error) {
    console.error('Logo upload error:', error);
    return null;
  }

  const { data } = supabase.storage.from('shop-logos').getPublicUrl(path);
  return data.publicUrl;
}

// ══════════════════════════════════════════════════════════════════════
// LOGO AVATAR — shows logo image or letter fallback
// ══════════════════════════════════════════════════════════════════════
function ShopAvatar({
  shop,
  size = 'md',
}: {
  shop: Pick<Shop, 'shop_name' | 'logo_url' | 'is_active'>;
  size?: 'sm' | 'md' | 'lg';
}) {
  const dims = { sm: 'w-10 h-10 text-base', md: 'w-14 h-14 text-2xl', lg: 'w-24 h-24 text-4xl' };
  const radii = { sm: 'rounded-xl', md: 'rounded-2xl', lg: 'rounded-[2rem]' };

  if (shop.logo_url) {
    return (
      <img
        src={shop.logo_url}
        alt={shop.shop_name}
        className={`${dims[size]} ${radii[size]} object-cover border border-slate-700/60 shadow-inner transition-transform group-hover:scale-110`}
      />
    );
  }

  return (
    <div
      className={`${dims[size]} ${radii[size]} flex items-center justify-center font-black shadow-inner transition-transform group-hover:scale-110 ${
        shop.is_active ? 'bg-blue-600/10 text-blue-500' : 'bg-slate-800 text-slate-600'
      }`}
    >
      {(shop.shop_name || 'M').charAt(0)}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// LOGO UPLOAD WIDGET
// ══════════════════════════════════════════════════════════════════════
function LogoUploadWidget({
  currentUrl,
  onUploaded,
  uploading,
  setUploading,
}: {
  currentUrl: string;
  onUploaded: (url: string) => void;
  uploading: boolean;
  setUploading: (v: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string>(currentUrl);
  const [error, setError] = useState('');

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate type & size
    if (!file.type.startsWith('image/')) {
      setError('الرجاء اختيار صورة');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('الصورة يجب أن تكون أقل من 2MB');
      return;
    }

    setError('');

    // Show local preview immediately
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);

    // Upload to Supabase Storage
    setUploading(true);
    const ext = file.name.split('.').pop();
    const path = `shop-logo-${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('shop-logos')
      .upload(path, file, { upsert: true, contentType: file.type });

    if (uploadError) {
      setError('فشل رفع الصورة، حاول مرة أخرى');
      setPreview(currentUrl);
      setUploading(false);
      return;
    }

    const { data } = supabase.storage.from('shop-logos').getPublicUrl(path);
    onUploaded(data.publicUrl);
    setUploading(false);
  };

  return (
    <div className="space-y-2">
      <label className="text-xs text-slate-400 font-bold uppercase tracking-wide flex items-center gap-1.5">
        <ImageIcon size={12} className="text-violet-400" />
        شعار المحل
      </label>

      <div className="flex items-center gap-4">
        {/* Preview */}
        <div className="relative w-16 h-16 rounded-2xl overflow-hidden bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
          {preview ? (
            <img src={preview} alt="logo" className="w-full h-full object-cover" />
          ) : (
            <ImageIcon size={22} className="text-slate-600" />
          )}
          {uploading && (
            <div className="absolute inset-0 bg-slate-900/70 flex items-center justify-center">
              <Loader2 size={18} className="text-violet-400 animate-spin" />
            </div>
          )}
        </div>

        {/* Upload button */}
        <div className="flex-1">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="w-full h-10 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-sm font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {uploading ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                جاري الرفع...
              </>
            ) : (
              <>
                <Upload size={14} className="text-violet-400" />
                {preview ? 'تغيير الشعار' : 'رفع شعار'}
              </>
            )}
          </button>
          <p className="text-[11px] text-slate-600 mt-1.5 text-center">PNG · JPG · WebP · حد 2MB</p>
          {error && <p className="text-[11px] text-red-400 mt-1 text-center">{error}</p>}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={handleFile}
      />
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
    shop_name: '',
    city: '',
    phone: '',
    is_active: true,
    whatsapp: '',
    google_maps_url: '',
    // ── New fields ──
    logo_url: '',
    commercial_registration: '',
    address: '',
    email: '',
    website: '',
  });
  const [editLoading, setEditLoading] = useState(false);
  const [editSuccess, setEditSuccess] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [now, setNow] = useState(new Date());

  const stats = {
    total: shops.length,
    active: shops.filter((s) => s.is_active).length,
    inactive: shops.filter((s) => !s.is_active).length,
    trial: shops.filter((s) => s.subscription_status === 'trial').length,
  };

  useEffect(() => {
    fetchShops();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // ── FETCH — unchanged query logic, new fields spread in ──────────
  const fetchShops = async () => {
    try {
      setLoading(true);

      const { data: shopsData, error: shopsError } = await supabase
        .from('shops')
        .select('*')
        .order('created_at', { ascending: false });

      if (shopsError) throw shopsError;
      if (!shopsData || shopsData.length === 0) {
        setShops([]);
        return;
      }

      const shopIds = shopsData.map((s: any) => s.id);

      const { data: productsData } = await supabase
        .from('products')
        .select('shop_id, quantity')
        .in('shop_id', shopIds);

      const productsSummary: Record<number, { total_quantity: number; products_count: number }> = {};
      for (const row of productsData || []) {
        if (row.shop_id != null) {
          if (!productsSummary[row.shop_id]) {
            productsSummary[row.shop_id] = { total_quantity: 0, products_count: 0 };
          }
          productsSummary[row.shop_id].total_quantity += Number(row.quantity || 0);
          productsSummary[row.shop_id].products_count += 1;
        }
      }

      const { data: outgoingData } = await supabase
        .from('orders')
        .select('from_shop_id')
        .in('from_shop_id', shopIds);

      const { data: incomingData } = await supabase
        .from('orders')
        .select('to_shop_id')
        .in('to_shop_id', shopIds);

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
      }));

      setShops(merged);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  // ── TOGGLE STATUS — unchanged ────────────────────────────────────
  const toggleStatus = async (shop: Shop) => {
    const confirmMsg = shop.is_active
      ? `هل تريد فعلاً إيقاف محل "${shop.shop_name}"؟ سيؤدي ذلك لمنعه من تنفيذ الطلبات.`
      : `هل تريد تفعيل محل "${shop.shop_name}"؟`;

    if (!window.confirm(confirmMsg)) return;

    try {
      const { error } = await supabase.from('shops').update({ is_active: !shop.is_active }).eq('id', shop.id);
      if (error) throw error;
      setShops(shops.map((s) => (s.id === shop.id ? { ...s, is_active: !s.is_active } : s)));
    } catch {
      alert('فشل في تحديث الحالة');
    }
  };

  // ── OPEN EDIT MODAL — pre-fills all fields ───────────────────────
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
    });
    setEditSuccess(false);
    setEditModalOpen(true);
  };

  // ── SAVE EDIT — persists all fields ─────────────────────────────
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
        })
        .eq('id', selectedShop.id);

      if (error) throw error;

      await fetchShops();
      setEditSuccess(true);

      setTimeout(() => {
        setEditModalOpen(false);
        setEditSuccess(false);
      }, 1200);
    } catch {
      alert('فشل في حفظ التعديلات');
    } finally {
      setEditLoading(false);
    }
  };

  // ── FILTER — unchanged logic ─────────────────────────────────────
  const filteredShops = shops.filter((shop) => {
    const matchesSearch =
      (shop.shop_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (shop.city || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (shop.phone || '').includes(searchTerm);

    const matchesTab =
      activeTab === 'all'
        ? true
        : activeTab === 'active'
        ? shop.is_active
        : activeTab === 'inactive'
        ? !shop.is_active
        : shop.subscription_status === 'trial';

    return matchesSearch && matchesTab;
  });

  // ════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-slate-950 p-4 lg:p-8 text-right" dir="rtl">

      {/* ── SECTION 1: HEADER ── */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 mb-10">
        <div>
          <h1 className="text-4xl font-black text-white tracking-tight flex items-center gap-4">
            إدارة المحلات
            <span className="text-sm font-medium bg-blue-500/10 text-blue-500 px-3 py-1 rounded-full border border-blue-500/20">
              {stats.total} محل
            </span>
          </h1>
          <p className="text-slate-400 mt-2 text-lg">
            إدارة جميع المحلات والعملاء داخل المنصة والتحكم في صلاحياتهم.
          </p>
        </div>

        <div className="flex items-center gap-3 w-full lg:w-auto">
          <button
            onClick={fetchShops}
            className="p-3 bg-slate-900 border border-slate-800 rounded-2xl text-slate-400 hover:text-white transition-all"
          >
            <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
          </button>

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
        </div>
      </div>

      {/* ── SECTION 2: KPI CARDS — unchanged ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        {[
          { label: 'إجمالي المحلات', value: stats.total, icon: Store, color: 'text-blue-500', bg: 'bg-blue-500/5' },
          { label: 'المحلات النشطة', value: stats.active, icon: CheckCircle, color: 'text-emerald-500', bg: 'bg-emerald-500/5' },
          { label: 'المحلات الموقوفة', value: stats.inactive, icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-500/5' },
          { label: 'المحلات التجريبية', value: stats.trial, icon: Activity, color: 'text-amber-500', bg: 'bg-amber-500/5' },
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

      {/* ── SECTION 3: FILTERS & SEARCH — unchanged ── */}
      <div className="bg-slate-900 border border-slate-800/60 rounded-[2.5rem] p-4 lg:p-6 mb-8 shadow-2xl">
        <div className="flex flex-col lg:flex-row justify-between items-center gap-6">
          <div className="flex bg-slate-950 p-1.5 rounded-2xl border border-slate-800 w-full lg:w-auto overflow-x-auto">
            {['all', 'active', 'inactive', 'trial'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-6 py-2 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${
                  activeTab === tab ? 'bg-slate-800 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {tab === 'all' ? 'جميع المحلات' : tab === 'active' ? 'نشط' : tab === 'inactive' ? 'موقوف' : 'تجريبي'}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-4 w-full lg:w-1/2">
            <div className="relative flex-1">
              <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
              <input
                type="text"
                placeholder="البحث باسم المحل أو المدينة..."
                className="w-full bg-slate-950 border border-slate-800 rounded-2xl py-3.5 pr-12 pl-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all font-medium"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <button className="p-3.5 bg-slate-950 border border-slate-800 rounded-2xl text-slate-400 hover:text-white">
              <Filter size={20} />
            </button>
          </div>
        </div>
      </div>

      {/* ── SECTION 4: TABLE ── */}
      <div className="bg-slate-900 border border-slate-800/60 rounded-[2.5rem] overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-right" style={{ minWidth: '700px' }}>
            <thead>
              <tr className="bg-slate-950/50 text-slate-500 text-xs font-black uppercase tracking-widest border-b border-slate-800">
                <th className="px-8 py-6">المحل والمعلومات</th>
                <th className="px-8 py-6">الموقع</th>
                <th className="px-8 py-6">المالك</th>
                <th className="px-8 py-6 text-center">المخزون</th>
                <th className="px-8 py-6 text-center">الحالة</th>
                <th className="px-8 py-6 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-8 py-20 text-center">
                    <div className="flex flex-col items-center gap-4">
                      <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                      <p className="text-slate-500 font-bold">جاري تحميل البيانات...</p>
                    </div>
                  </td>
                </tr>
              ) : filteredShops.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-8 py-20 text-center">
                    <p className="text-slate-500 font-bold">لا توجد محلات مطابقة للبحث</p>
                  </td>
                </tr>
              ) : (
                filteredShops.map((shop) => (
                  <tr key={shop.id} className="group hover:bg-slate-800/30 transition-all duration-300">
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-4">
                        <ShopAvatar shop={shop} size="md" />
                        <div>
                          <p className="text-white font-black text-lg group-hover:text-blue-400 transition-colors">
                            {shop.shop_name}
                          </p>
                          <p className="text-slate-500 text-sm font-medium mt-0.5">{shop.phone || '---'}</p>
                          {shop.commercial_registration && (
                            <p className="text-slate-600 text-xs font-mono mt-0.5">
                              CR: {shop.commercial_registration}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center gap-2 text-slate-300 font-bold bg-slate-950/50 w-fit px-3 py-1.5 rounded-xl border border-slate-800/50">
                          <MapPin size={14} className="text-slate-500" />
                          {shop.city || '---'}
                        </div>
                        {shop.address && (
                          <p className="text-slate-600 text-xs max-w-[180px] truncate">{shop.address}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center">
                          <User size={14} className="text-slate-500" />
                        </div>
                        <div>
                          <p className="text-slate-400 text-sm font-medium">مدير المحل</p>
                          {shop.email && (
                            <p className="text-slate-600 text-xs truncate max-w-[130px]">{shop.email}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-6 text-center font-black text-white">
                      <div className="flex flex-col items-center bg-slate-950/50 p-2 rounded-2xl border border-slate-800/50">
                        <span className="text-blue-500 text-lg">{shop.total_quantity || 0}</span>
                        <span className="text-[10px] text-slate-500">قطعة</span>
                        <span className="text-[10px] text-slate-400 mt-1">{shop.products_count || 0} صنف</span>
                      </div>
                    </td>
                    <td className="px-8 py-6 text-center">
                      <span
                        className={`inline-flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-black border transition-all ${
                          shop.is_active
                            ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 shadow-lg shadow-emerald-500/5'
                            : 'bg-red-500/10 text-red-500 border-red-500/20 shadow-lg shadow-red-500/5'
                        }`}
                      >
                        <div
                          className={`w-2 h-2 rounded-full ${
                            shop.is_active ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'
                          }`}
                        />
                        {shop.is_active ? 'نشط' : 'موقف'}
                      </span>
                    </td>
                    <td className="px-8 py-6 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => setSelectedShop(shop)}
                          className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-400 hover:text-white hover:border-slate-600 transition-all"
                          title="عرض التفاصيل"
                        >
                          <Eye size={18} />
                        </button>
                        <button
                          onClick={() => openEditModal(shop)}
                          className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-400 hover:text-blue-400 hover:border-blue-500/50 transition-all"
                          title="تعديل"
                        >
                          <Edit2 size={18} />
                        </button>
                        <button
                          onClick={() => toggleStatus(shop)}
                          className={`p-2.5 bg-slate-950 border border-slate-800 rounded-xl transition-all ${
                            shop.is_active
                              ? 'text-red-400 hover:bg-red-500/10 hover:border-red-500/50'
                              : 'text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500/50'
                          }`}
                          title={shop.is_active ? 'إيقاف' : 'تفعيل'}
                        >
                          <Activity size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════
          SECTION 5: EDIT MODAL — extended with new profile fields
      ══════════════════════════════════════════════════════════════ */}
      {editModalOpen && selectedShop && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
            onClick={() => setEditModalOpen(false)}
          />
          <div className="relative w-full max-w-lg bg-slate-900 border border-slate-700 rounded-[2rem] shadow-2xl overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-500/50 to-transparent" />

            {/* Modal header */}
            <div className="flex items-center justify-between px-7 pt-7 pb-5 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-500/15 border border-blue-500/20 flex items-center justify-center">
                  <Edit2 size={16} className="text-blue-400" />
                </div>
                <div>
                  <h3 className="text-white font-black text-lg leading-none">تعديل المحل</h3>
                  <p className="text-slate-500 text-xs mt-0.5">{selectedShop.shop_name}</p>
                </div>
              </div>
              <button
                onClick={() => setEditModalOpen(false)}
                className="p-2 hover:bg-slate-800 rounded-xl transition-all text-slate-400 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            {/* Form body */}
            <div className="px-7 py-6 space-y-5 max-h-[68vh] overflow-y-auto">

              {/* ── Logo Upload ── */}
              <LogoUploadWidget
                currentUrl={editForm.logo_url}
                uploading={logoUploading}
                setUploading={setLogoUploading}
                onUploaded={(url) => setEditForm({ ...editForm, logo_url: url })}
              />

              <div className="border-t border-slate-800/60 pt-1" />

              {/* ── Section label: Basic Info ── */}
              <p className="text-[10px] text-slate-600 font-black uppercase tracking-widest">المعلومات الأساسية</p>

              {/* Shop name */}
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 font-bold uppercase tracking-wide">اسم المحل</label>
                <input
                  type="text"
                  value={editForm.shop_name}
                  onChange={(e) => setEditForm({ ...editForm, shop_name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-2xl px-4 h-12 text-white text-sm focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all"
                  placeholder="اسم المحل"
                />
              </div>

              {/* City */}
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 font-bold uppercase tracking-wide">المدينة</label>
                <input
                  type="text"
                  value={editForm.city}
                  onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-2xl px-4 h-12 text-white text-sm focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all"
                  placeholder="المدينة"
                />
              </div>

              {/* Full Address */}
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 font-bold uppercase tracking-wide flex items-center gap-1.5">
                  <Home size={12} className="text-slate-500" />
                  العنوان الكامل
                </label>
                <textarea
                  value={editForm.address}
                  onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                  rows={2}
                  className="w-full bg-slate-950 border border-slate-700 rounded-2xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all resize-none"
                  placeholder="الحي، الشارع، المبنى..."
                />
              </div>

              <div className="border-t border-slate-800/60 pt-1" />
              <p className="text-[10px] text-slate-600 font-black uppercase tracking-widest">معلومات الاتصال</p>

              {/* Phone */}
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 font-bold uppercase tracking-wide">رقم الجوال</label>
                <input
                  type="text"
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-2xl px-4 h-12 text-white text-sm focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all"
                  placeholder="05xxxxxxxx"
                />
              </div>

              {/* WhatsApp — unchanged */}
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 font-bold uppercase tracking-wide flex items-center gap-1.5">
                  <MessageCircle size={12} className="text-emerald-500" />
                  واتساب
                </label>
                <input
                  type="text"
                  value={editForm.whatsapp}
                  onChange={(e) => setEditForm({ ...editForm, whatsapp: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-2xl px-4 h-12 text-white text-sm focus:outline-none focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/20 transition-all"
                  placeholder="0500000000"
                  dir="ltr"
                />
              </div>

              {/* Email */}
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 font-bold uppercase tracking-wide flex items-center gap-1.5">
                  <Mail size={12} className="text-sky-400" />
                  البريد الإلكتروني
                </label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-2xl px-4 h-12 text-white text-sm focus:outline-none focus:border-sky-500/40 focus:ring-1 focus:ring-sky-500/20 transition-all"
                  placeholder="info@shop.com"
                  dir="ltr"
                />
              </div>

              {/* Website */}
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 font-bold uppercase tracking-wide flex items-center gap-1.5">
                  <Globe size={12} className="text-purple-400" />
                  الموقع الإلكتروني
                </label>
                <input
                  type="text"
                  value={editForm.website}
                  onChange={(e) => setEditForm({ ...editForm, website: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-2xl px-4 h-12 text-white text-sm focus:outline-none focus:border-purple-500/40 focus:ring-1 focus:ring-purple-500/20 transition-all"
                  placeholder="https://www.myshop.com"
                  dir="ltr"
                />
              </div>

              <div className="border-t border-slate-800/60 pt-1" />
              <p className="text-[10px] text-slate-600 font-black uppercase tracking-widest">البيانات التجارية</p>

              {/* Commercial Registration */}
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 font-bold uppercase tracking-wide flex items-center gap-1.5">
                  <FileText size={12} className="text-amber-400" />
                  رقم السجل التجاري
                </label>
                <input
                  type="text"
                  value={editForm.commercial_registration}
                  onChange={(e) => setEditForm({ ...editForm, commercial_registration: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-2xl px-4 h-12 text-white text-sm font-mono focus:outline-none focus:border-amber-500/40 focus:ring-1 focus:ring-amber-500/20 transition-all"
                  placeholder="1010XXXXXX"
                  dir="ltr"
                />
              </div>

              {/* Google Maps URL — unchanged */}
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 font-bold uppercase tracking-wide flex items-center gap-1.5">
                  <Navigation size={12} className="text-blue-400" />
                  رابط الموقع
                </label>
                <input
                  type="text"
                  value={editForm.google_maps_url}
                  onChange={(e) => setEditForm({ ...editForm, google_maps_url: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-2xl px-4 h-12 text-white text-sm focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all"
                  placeholder="https://maps.google.com/..."
                  dir="ltr"
                />
              </div>

              <div className="border-t border-slate-800/60 pt-1" />

              {/* is_active toggle — unchanged */}
              <div className="flex items-center justify-between bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3">
                <span className="text-sm text-slate-300 font-bold">حالة المحل</span>
                <button
                  type="button"
                  onClick={() => setEditForm({ ...editForm, is_active: !editForm.is_active })}
                  className={`relative w-12 h-6 rounded-full transition-all duration-300 focus:outline-none ${
                    editForm.is_active ? 'bg-emerald-500' : 'bg-slate-700'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all duration-300 ${
                      editForm.is_active ? 'right-0.5' : 'left-0.5'
                    }`}
                  />
                </button>
                <span className={`text-xs font-bold ${editForm.is_active ? 'text-emerald-400' : 'text-red-400'}`}>
                  {editForm.is_active ? 'نشط' : 'موقوف'}
                </span>
              </div>

              {/* Success banner */}
              {editSuccess && (
                <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl px-4 py-3">
                  <CheckSquare size={16} className="text-emerald-400 shrink-0" />
                  <span className="text-emerald-400 text-sm font-bold">تم تحديث بيانات المحل بنجاح</span>
                </div>
              )}
            </div>

            {/* Footer buttons */}
            <div className="flex gap-3 px-7 pb-7 pt-2 border-t border-slate-800/60">
              <button
                onClick={() => setEditModalOpen(false)}
                className="flex-1 h-12 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-sm transition-all"
              >
                إلغاء
              </button>
              <button
                onClick={saveEdit}
                disabled={editLoading || editSuccess || logoUploading}
                className="flex-1 h-12 rounded-2xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold text-sm transition-all flex items-center justify-center gap-2"
              >
                {logoUploading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    جاري رفع الشعار...
                  </>
                ) : editLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    جاري الحفظ...
                  </>
                ) : editSuccess ? (
                  <>
                    <CheckCircle size={16} />
                    تم الحفظ
                  </>
                ) : (
                  <>
                    <Save size={16} />
                    حفظ التعديلات
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          SECTION 6: SHOP DETAILS DRAWER — enhanced with full profile
      ══════════════════════════════════════════════════════════════ */}
      {selectedShop && !editModalOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity"
            onClick={() => setSelectedShop(null)}
          />
          <div className="relative w-full max-w-lg bg-slate-900 border-r border-slate-800 h-full shadow-2xl animate-in slide-in-from-left duration-300">
            <div className="p-8 h-full overflow-y-auto">

              {/* Drawer header */}
              <div className="flex justify-between items-center mb-10">
                <button onClick={() => setSelectedShop(null)} className="p-2 hover:bg-slate-800 rounded-xl transition-all">
                  <X size={24} className="text-slate-400" />
                </button>
                <h2 className="text-2xl font-black text-white">تفاصيل المحل</h2>
              </div>

              {/* ── Hero: Logo / Letter avatar + name + actions ── */}
              <div className="flex flex-col items-center mb-10 text-center">
                {/* Logo or letter avatar — large */}
                {selectedShop.logo_url ? (
                  <div className="relative mb-4">
                    <img
                      src={selectedShop.logo_url}
                      alt={selectedShop.shop_name}
                      className="w-28 h-28 rounded-[2rem] object-cover border-2 border-slate-700/60 shadow-2xl"
                    />
                    {selectedShop.is_active && (
                      <span className="absolute -bottom-1 -left-1 w-5 h-5 bg-emerald-500 rounded-full border-2 border-slate-900" />
                    )}
                  </div>
                ) : (
                  <div className="relative mb-4">
                    <div className="w-28 h-28 bg-blue-600/10 border border-blue-500/20 rounded-[2rem] flex items-center justify-center text-blue-500 text-4xl font-black">
                      {(selectedShop.shop_name || 'M').charAt(0)}
                    </div>
                    {selectedShop.is_active && (
                      <span className="absolute -bottom-1 -left-1 w-5 h-5 bg-emerald-500 rounded-full border-2 border-slate-900" />
                    )}
                  </div>
                )}

                <h3 className="text-2xl font-black text-white">{selectedShop.shop_name}</h3>

                {selectedShop.commercial_registration && (
                  <p className="text-slate-600 text-xs font-mono mt-1">
                    CR: {selectedShop.commercial_registration}
                  </p>
                )}

                <p className="text-slate-500 mt-1">{selectedShop.phone || '---'}</p>

                {/* Action buttons */}
                <div className="mt-4 flex gap-2 flex-wrap justify-center">
                  <button className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-bold flex items-center gap-2 transition-all">
                    <Key size={14} /> إعادة تعيين كلمة المرور
                  </button>

                  {/* WhatsApp — unchanged */}
                  {selectedShop.whatsapp && (
                    <a
                      href={waLink(selectedShop.whatsapp)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 bg-emerald-600/10 hover:bg-emerald-600/20 border border-emerald-500/20 text-emerald-400 rounded-xl text-sm font-bold flex items-center gap-2 transition-all"
                    >
                      <MessageCircle size={14} /> واتساب
                    </a>
                  )}

                  {/* Google Maps — unchanged */}
                  {selectedShop.google_maps_url && (
                    <a
                      href={selectedShop.google_maps_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 bg-blue-600/10 hover:bg-blue-600/20 border border-blue-500/20 text-blue-400 rounded-xl text-sm font-bold flex items-center gap-2 transition-all"
                    >
                      <Navigation size={14} /> الموقع
                    </a>
                  )}

                  {/* Website — new */}
                  {selectedShop.website && (
                    <a
                      href={normalizeUrl(selectedShop.website)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 bg-purple-600/10 hover:bg-purple-600/20 border border-purple-500/20 text-purple-400 rounded-xl text-sm font-bold flex items-center gap-2 transition-all"
                    >
                      <Globe size={14} /> الموقع الإلكتروني
                    </a>
                  )}
                </div>
              </div>

              {/* ── KPI Stats — unchanged ── */}
              <div className="grid grid-cols-2 gap-4 mb-10">
                {[
                  { label: 'المنتجات', val: selectedShop.total_quantity || 0, icon: Package, color: 'text-blue-500' },
                  { label: 'الطلبات الصادرة', val: selectedShop.outgoing_orders[0]?.count || 0, icon: ArrowUpRight, color: 'text-amber-500' },
                  { label: 'الطلبات الواردة', val: selectedShop.incoming_orders[0]?.count || 0, icon: ArrowDownLeft, color: 'text-indigo-500' },
                  { label: 'المستخدمين', val: 1, icon: User, color: 'text-emerald-500' },
                ].map((stat, i) => (
                  <div key={i} className="bg-slate-950 border border-slate-800/60 p-4 rounded-3xl">
                    <div className="flex items-center gap-3 mb-2">
                      <stat.icon size={16} className={stat.color} />
                      <span className="text-slate-500 text-xs font-bold">{stat.label}</span>
                    </div>
                    <p className="text-2xl font-black text-white">{stat.val}</p>
                  </div>
                ))}
              </div>

              {/* ── المعلومات الأساسية — extended ── */}
              <div className="space-y-6">
                <h4 className="text-white font-black text-lg border-b border-slate-800 pb-2">المعلومات الأساسية</h4>

                <div className="grid grid-cols-2 gap-y-6">

                  {/* City — unchanged */}
                  <div>
                    <p className="text-slate-500 text-xs font-bold uppercase mb-1">المدينة</p>
                    <p className="text-white font-bold">{selectedShop.city || '---'}</p>
                  </div>

                  {/* Created at — unchanged */}
                  <div>
                    <p className="text-slate-500 text-xs font-bold uppercase mb-1">تاريخ الإنشاء</p>
                    <p className="text-white font-bold">
                      {new Date(selectedShop.created_at).toLocaleDateString('ar-SA')}
                    </p>
                  </div>

                  {/* Status — unchanged */}
                  <div>
                    <p className="text-slate-500 text-xs font-bold uppercase mb-1">حالة النظام</p>
                    <span className="text-emerald-500 font-bold">متصل</span>
                  </div>

                  {/* Subscription — unchanged */}
                  <div>
                    <p className="text-slate-500 text-xs font-bold uppercase mb-1">الاشتراك</p>
                    <span className="text-blue-500 font-bold underline cursor-pointer flex items-center gap-1">
                      {selectedShop.subscription_status === 'trial' ? 'فترة تجريبية' : 'خطة المؤسسات'}
                      <ExternalLink size={12} />
                    </span>
                  </div>

                  {/* WhatsApp — unchanged */}
                  <div>
                    <p className="text-slate-500 text-xs font-bold uppercase mb-1 flex items-center gap-1">
                      <MessageCircle size={11} className="text-emerald-500" /> واتساب
                    </p>
                    {selectedShop.whatsapp ? (
                      <a
                        href={waLink(selectedShop.whatsapp)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-emerald-400 font-bold hover:text-emerald-300 transition-colors flex items-center gap-1"
                        dir="ltr"
                      >
                        {selectedShop.whatsapp} <ExternalLink size={11} />
                      </a>
                    ) : (
                      <p className="text-slate-600 font-bold">---</p>
                    )}
                  </div>

                  {/* Google Maps — unchanged */}
                  <div>
                    <p className="text-slate-500 text-xs font-bold uppercase mb-1 flex items-center gap-1">
                      <Navigation size={11} className="text-blue-400" /> الموقع
                    </p>
                    {selectedShop.google_maps_url ? (
                      <a
                        href={selectedShop.google_maps_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 font-bold hover:text-blue-300 transition-colors flex items-center gap-1"
                      >
                        فتح الموقع <ExternalLink size={11} />
                      </a>
                    ) : (
                      <p className="text-slate-600 font-bold">---</p>
                    )}
                  </div>

                  {/* ── Email — new ── */}
                  <div>
                    <p className="text-slate-500 text-xs font-bold uppercase mb-1 flex items-center gap-1">
                      <Mail size={11} className="text-sky-400" /> البريد الإلكتروني
                    </p>
                    {selectedShop.email ? (
                      <a
                        href={`mailto:${selectedShop.email}`}
                        className="text-sky-400 font-bold hover:text-sky-300 transition-colors flex items-center gap-1 break-all"
                        dir="ltr"
                      >
                        {selectedShop.email} <ExternalLink size={11} className="shrink-0" />
                      </a>
                    ) : (
                      <p className="text-slate-600 font-bold">---</p>
                    )}
                  </div>

                  {/* ── Website — new ── */}
                  <div>
                    <p className="text-slate-500 text-xs font-bold uppercase mb-1 flex items-center gap-1">
                      <Globe size={11} className="text-purple-400" /> الموقع الإلكتروني
                    </p>
                    {selectedShop.website ? (
                      <a
                        href={normalizeUrl(selectedShop.website)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-purple-400 font-bold hover:text-purple-300 transition-colors flex items-center gap-1 break-all"
                        dir="ltr"
                      >
                        {selectedShop.website} <ExternalLink size={11} className="shrink-0" />
                      </a>
                    ) : (
                      <p className="text-slate-600 font-bold">---</p>
                    )}
                  </div>

                </div>

                {/* ── Full Address — new, full width ── */}
                {selectedShop.address && (
                  <div>
                    <p className="text-slate-500 text-xs font-bold uppercase mb-1 flex items-center gap-1">
                      <Home size={11} className="text-slate-400" /> العنوان الكامل
                    </p>
                    <p className="text-white font-bold leading-relaxed">{selectedShop.address}</p>
                  </div>
                )}

                {/* ── Commercial Registration — new, full width ── */}
                {selectedShop.commercial_registration && (
                  <div className="bg-slate-950/60 border border-slate-800/60 rounded-2xl px-4 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-slate-500 text-xs font-bold uppercase mb-0.5 flex items-center gap-1">
                        <FileText size={11} className="text-amber-400" /> السجل التجاري
                      </p>
                      <p className="text-white font-black font-mono tracking-widest">
                        {selectedShop.commercial_registration}
                      </p>
                    </div>
                    <ShieldCheck size={20} className="text-amber-400/60" />
                  </div>
                )}

              </div>

              {/* ── Bottom actions — unchanged ── */}
              <div className="mt-12 flex gap-4">
                <button
                  onClick={() => {
                    toggleStatus(selectedShop);
                    setSelectedShop(null);
                  }}
                  className={`flex-1 py-4 rounded-2xl font-black transition-all ${
                    selectedShop.is_active
                      ? 'bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500 hover:text-white'
                      : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 hover:bg-emerald-500 hover:text-white'
                  }`}
                >
                  {selectedShop.is_active ? 'إيقاف المحل' : 'تفعيل المحل'}
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  );
}
