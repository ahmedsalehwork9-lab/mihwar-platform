import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from './lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LanguageContext';
import {
  Store, QrCode, Download, Copy, Check, ExternalLink,
  RefreshCw, AlertCircle, Phone, MapPin, Save,
  MessageCircle, Link, CheckCircle, XCircle, Loader,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function getShopPublicUrl(shop: { slug?: string | null; id: number }): string {
  const base = window.location.origin;
  return shop.slug ? `${base}/s/${shop.slug}` : `${base}/shop/${shop.id}`;
}

function getQRImageUrl(shop: { slug?: string | null; id: number }, size = 300): string {
  const url = encodeURIComponent(getShopPublicUrl(shop));
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${url}&color=ffffff&bgcolor=0f172a&margin=10&qzone=1`;
}

function sanitizeSlug(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
}

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

type ShopProfile = {
  id: number;
  shop_name: string;
  phone: string;
  whatsapp: string | null;
  google_maps_url: string | null;
  logo_url: string | null;
  visibility_mode: string | null;
  default_margin_percent: number | null;
  is_active: boolean;
  slug: string | null;
};

type SlugStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

// ─────────────────────────────────────────────────────────────
// COPY BUTTON
// ─────────────────────────────────────────────────────────────

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      })}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white text-xs font-bold transition-all active:scale-95"
    >
      {copied
        ? <><Check size={12} className="text-emerald-400" /> {label}</>
        : <><Copy size={12} /> {label}</>}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────

export default function ShopSettingsPage() {
  const { ownedShopId } = useAuth();
  const { t, isRTL }    = useLang();

  const [shop, setShop]         = useState<ShopProfile | null>(null);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [success, setSuccess]   = useState<string | null>(null);
  const [qrLoaded, setQrLoaded] = useState(false);
  const [qrError, setQrError]   = useState(false);

  // Form state
  const [form, setForm] = useState({
    shop_name:       '',
    phone:           '',
    whatsapp:        '',
    google_maps_url: '',
  });

  // Slug state
  const [slugInput, setSlugInput]   = useState('');
  const [slugStatus, setSlugStatus] = useState<SlugStatus>('idle');
  const [slugSaving, setSlugSaving] = useState(false);
  const [slugError, setSlugError]   = useState<string | null>(null);
  const slugDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Fetch shop ────────────────────────────────────────────

  const fetchShop = useCallback(async () => {
    if (!ownedShopId) return;
    setLoading(true);
    const { data, error: err } = await supabase
      .from('shops')
      .select('id, shop_name, phone, whatsapp, google_maps_url, logo_url, visibility_mode, default_margin_percent, is_active, slug')
      .eq('id', ownedShopId)
      .single();
    if (err || !data) {
      setError(t('Failed to load shop data', 'تعذّر تحميل بيانات المحل'));
    } else {
      setShop(data as ShopProfile);
      setForm({
        shop_name:       data.shop_name        ?? '',
        phone:           data.phone            ?? '',
        whatsapp:        data.whatsapp         ?? '',
        google_maps_url: data.google_maps_url  ?? '',
      });
      setSlugInput(data.slug ?? '');
    }
    setLoading(false);
  }, [ownedShopId, t]);

  useEffect(() => { fetchShop(); }, [fetchShop]);

  // ── Save shop info ────────────────────────────────────────

  const handleSave = async () => {
    if (!ownedShopId || !form.shop_name.trim()) return;
    setSaving(true);
    setError(null);
    const { error: err } = await supabase
      .from('shops')
      .update({
        shop_name:       form.shop_name.trim(),
        phone:           form.phone.trim(),
        whatsapp:        form.whatsapp.trim() || null,
        google_maps_url: form.google_maps_url.trim() || null,
      })
      .eq('id', ownedShopId);
    if (err) setError(err.message);
    else {
      setSuccess(t('Saved successfully ✓', 'تم الحفظ بنجاح ✓'));
      setTimeout(() => setSuccess(null), 3000);
      fetchShop();
    }
    setSaving(false);
  };

  // ── Slug check ────────────────────────────────────────────

  const checkSlug = useCallback(async (value: string) => {
    if (!value) { setSlugStatus('idle'); return; }
    if (value.length < 3) { setSlugStatus('invalid'); return; }
    if (!/^[a-z0-9-]+$/.test(value)) { setSlugStatus('invalid'); return; }
    if (value === shop?.slug) { setSlugStatus('available'); return; }

    setSlugStatus('checking');
    const { data } = await supabase
      .from('shops')
      .select('id')
      .eq('slug', value)
      .maybeSingle();

    setSlugStatus(data ? 'taken' : 'available');
  }, [shop?.slug]);

  const handleSlugChange = (raw: string) => {
    const clean = sanitizeSlug(raw);
    setSlugInput(clean);
    setSlugStatus('idle');
    setSlugError(null);
    if (slugDebounceRef.current) clearTimeout(slugDebounceRef.current);
    slugDebounceRef.current = setTimeout(() => checkSlug(clean), 500);
  };

  // ── Save slug ─────────────────────────────────────────────

  const handleSaveSlug = async () => {
    if (!ownedShopId || slugStatus !== 'available') return;
    setSlugSaving(true);
    setSlugError(null);
    const { error: err } = await supabase
      .from('shops')
      .update({ slug: slugInput || null })
      .eq('id', ownedShopId);
    if (err) setSlugError(err.message);
    else {
      setSuccess(t('Link saved ✓', 'تم حفظ الرابط ✓'));
      setTimeout(() => setSuccess(null), 3000);
      fetchShop();
    }
    setSlugSaving(false);
  };

  // ── Download QR ───────────────────────────────────────────

  const downloadQR = useCallback(async () => {
    if (!shop) return;
    const url = getQRImageUrl(shop, 600);
    try {
      const res  = await fetch(url);
      const blob = await res.blob();
      const a    = document.createElement('a');
      a.href     = URL.createObjectURL(blob);
      a.download = `QR-${shop.shop_name.replace(/\s+/g, '-')}.png`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      window.open(url, '_blank');
    }
  }, [shop]);

  // ── Slug status icon ──────────────────────────────────────

  const SlugIcon = () => {
    if (slugStatus === 'checking') return <Loader size={14} className="text-slate-400 animate-spin" />;
    if (slugStatus === 'available') return <CheckCircle size={14} className="text-emerald-400" />;
    if (slugStatus === 'taken')    return <XCircle size={14} className="text-red-400" />;
    if (slugStatus === 'invalid')  return <XCircle size={14} className="text-amber-400" />;
    return <Link size={14} className="text-slate-500" />;
  };

  const slugStatusText = () => {
    if (slugStatus === 'checking')  return t('Checking...', 'جاري التحقق...');
    if (slugStatus === 'available' && slugInput !== shop?.slug) return t('Available ✓', 'متاح ✓');
    if (slugStatus === 'available' && slugInput === shop?.slug) return t('Current link', 'الرابط الحالي');
    if (slugStatus === 'taken')     return t('Already taken', 'مستخدم بالفعل');
    if (slugStatus === 'invalid')   return t('Letters, numbers and hyphens only (min 3)', 'أحرف إنجليزية وأرقام وشرطة فقط (3 أحرف على الأقل)');
    return '';
  };

  const slugStatusColor = () => {
    if (slugStatus === 'available') return 'text-emerald-400';
    if (slugStatus === 'taken')     return 'text-red-400';
    if (slugStatus === 'invalid')   return 'text-amber-400';
    return 'text-slate-500';
  };

  // ── Loading / Error ───────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <RefreshCw size={28} className="text-blue-500 animate-spin" />
      </div>
    );
  }

  if (!shop) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center space-y-2">
          <AlertCircle size={32} className="text-red-400 mx-auto" />
          <p className="text-red-400 text-sm">{error ?? t('Shop not found', 'لم يتم العثور على المحل')}</p>
        </div>
      </div>
    );
  }

  const publicUrl = getShopPublicUrl(shop);
  const qrUrl     = getQRImageUrl(shop);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>

      {/* ── Page title ── */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
          <Store size={18} className="text-blue-400" />
        </div>
        <div>
          <h1 className="text-white font-black text-lg">{t('Shop Settings', 'إعدادات المحل')}</h1>
          <p className="text-slate-500 text-xs">{shop.shop_name}</p>
        </div>
      </div>

      {/* ── Success / Error global ── */}
      {success && (
        <div className="text-emerald-400 text-xs bg-emerald-500/10 p-3 rounded-xl border border-emerald-500/20 flex items-center gap-2">
          <Check size={14} /> {success}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          QR CODE SECTION
      ══════════════════════════════════════════════════════ */}
      <section className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center gap-2">
          <QrCode size={16} className="text-emerald-400" />
          <h2 className="text-white font-black text-sm">{t('Shop QR Code', 'رمز QR للمحل')}</h2>
        </div>

        <div className="p-5 flex flex-col sm:flex-row gap-6 items-center">
          {/* QR image */}
          <div className="shrink-0 relative">
            <div className="w-48 h-48 rounded-2xl overflow-hidden bg-slate-800 border border-slate-700 flex items-center justify-center">
              {!qrLoaded && !qrError && (
                <RefreshCw size={20} className="text-slate-600 animate-spin absolute" />
              )}
              {qrError ? (
                <div className="text-center p-4">
                  <AlertCircle size={24} className="text-red-400 mx-auto mb-2" />
                  <p className="text-[10px] text-slate-500">{t('Failed to load QR', 'تعذّر تحميل QR')}</p>
                </div>
              ) : (
                <img
                  key={qrUrl}
                  src={qrUrl}
                  alt={`QR Code for ${shop.shop_name}`}
                  className={`w-full h-full object-contain transition-opacity duration-300 ${qrLoaded ? 'opacity-100' : 'opacity-0'}`}
                  onLoad={() => { setQrLoaded(true); setQrError(false); }}
                  onError={() => setQrError(true)}
                />
              )}
            </div>
            <p className="text-center text-[9px] text-slate-600 font-bold mt-2 uppercase tracking-widest">MIHWAR PLATFORM</p>
          </div>

          {/* Info + actions */}
          <div className="flex-1 min-w-0 space-y-4">
            <p className="text-xs text-slate-400 leading-relaxed">
              {t(
                'Share this QR code with your customers. When scanned, it opens your shop page showing all your public products with prices — no login needed.',
                'شارك هذا الرمز مع عملائك. عند مسحه يفتح صفحة محلك مباشرةً وتظهر جميع منتجاتك العامة مع الأسعار — بدون تسجيل دخول.'
              )}
            </p>

            {/* Public URL */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5">
              <p className="text-[9px] text-slate-600 font-bold uppercase tracking-widest mb-1">{t('Public Link', 'رابط المحل العام')}</p>
              <p className="text-[11px] text-blue-400 font-mono truncate">{publicUrl}</p>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2">
              <button onClick={downloadQR}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black transition-all active:scale-95 shadow-lg shadow-emerald-900/30">
                <Download size={14} /> {t('Download QR', 'تحميل QR')}
              </button>
              <CopyButton text={publicUrl} label={t('Copy Link', 'نسخ الرابط')} />
              <a href={publicUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-700 bg-slate-800 text-slate-400 hover:text-white text-xs font-bold transition-all active:scale-95">
                <ExternalLink size={13} /> {t('Preview', 'معاينة')}
              </a>
            </div>
          </div>
        </div>

        {/* Tips */}
        <div className="px-5 pb-4 grid grid-cols-1 sm:grid-cols-3 gap-2">
          {[
            { icon: '🖨️', text: t('Print it and place it at your shop entrance', 'اطبعه وضعه على مدخل محلك') },
            { icon: '📲', text: t('Share it on WhatsApp or social media', 'شاركه عبر واتساب أو السوشيال ميديا') },
            { icon: '🏷️', text: t('Stick it on products or catalogs', 'الصقه على منتجاتك أو الكتالوج') },
          ].map((tip, i) => (
            <div key={i} className="bg-slate-800/60 rounded-xl px-3 py-2.5 flex items-start gap-2">
              <span className="text-base shrink-0">{tip.icon}</span>
              <p className="text-[10px] text-slate-400 leading-snug">{tip.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          CUSTOM SLUG SECTION
      ══════════════════════════════════════════════════════ */}
      <section className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center gap-2">
          <Link size={16} className="text-blue-400" />
          <h2 className="text-white font-black text-sm">{t('Custom Link', 'رابط مخصص')}</h2>
          {shop.slug && (
            <span className="mr-auto px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold">
              {t('Active', 'مفعّل')}
            </span>
          )}
        </div>

        <div className="p-5 space-y-4">
          <p className="text-xs text-slate-400 leading-relaxed">
            {t(
              'Choose a short custom link for your shop instead of a numeric ID. Example: /s/my-shop-name',
              'اختر رابطاً مخصصاً وسهل التذكر لمحلك بدل الرقم التلقائي. مثال: /s/اسم-محلك'
            )}
          </p>

          {/* Current slug display */}
          {shop.slug && (
            <div className="bg-slate-950 border border-emerald-500/20 rounded-xl px-3 py-2.5 flex items-center justify-between gap-2">
              <div>
                <p className="text-[9px] text-slate-600 font-bold uppercase tracking-widest mb-0.5">{t('Current Custom Link', 'رابطك المخصص الحالي')}</p>
                <p className="text-[12px] text-emerald-400 font-mono">{window.location.origin}/s/{shop.slug}</p>
              </div>
              <CopyButton text={`${window.location.origin}/s/${shop.slug}`} label={t('Copy', 'نسخ')} />
            </div>
          )}

          {/* Slug input */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
              {t('Custom Link', 'الرابط المخصص')}
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                <SlugIcon />
              </div>
              <div className={`absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-500 text-xs font-mono`}>
                /s/
              </div>
              <input
                type="text"
                value={slugInput}
                onChange={e => handleSlugChange(e.target.value)}
                placeholder={t('my-shop-name', 'اسم-محلك')}
                dir="ltr"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-9 py-3 text-white text-sm font-mono focus:border-blue-500 focus:outline-none transition-colors placeholder:text-slate-600"
              />
            </div>
            {slugStatusText() && (
              <p className={`text-[10px] mt-1.5 font-medium ${slugStatusColor()}`}>
                {slugStatusText()}
              </p>
            )}
          </div>

          {slugError && (
            <p className="text-red-400 text-xs bg-red-500/10 p-3 rounded-xl border border-red-500/20">{slugError}</p>
          )}

          <button
            onClick={handleSaveSlug}
            disabled={slugSaving || slugStatus !== 'available' || slugInput === shop.slug}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-black text-sm transition-all active:scale-[0.99] disabled:opacity-40 shadow-lg shadow-blue-900/30"
          >
            {slugSaving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
            {t('Save Custom Link', 'حفظ الرابط المخصص')}
          </button>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          SHOP INFO EDIT
      ══════════════════════════════════════════════════════ */}
      <section className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center gap-2">
          <Store size={16} className="text-blue-400" />
          <h2 className="text-white font-black text-sm">{t('Shop Info', 'بيانات المحل')}</h2>
        </div>

        <div className="p-5 space-y-4">
          {[
            { label: t('Shop Name', 'اسم المحل'),       key: 'shop_name',       placeholder: t('My Shop', 'اسم محلك'),                                          icon: Store,          inputType: 'text', inputMode: 'text' },
            { label: t('Phone', 'رقم الجوال'),           key: 'phone',           placeholder: '05xxxxxxxx',                                                       icon: Phone,          inputType: 'tel',  inputMode: 'tel'  },
            { label: t('WhatsApp', 'واتساب'),            key: 'whatsapp',        placeholder: t('WhatsApp number (if different)', 'واتساب (لو مختلف عن الجوال)'), icon: MessageCircle,  inputType: 'tel',  inputMode: 'tel'  },
            { label: t('Google Maps URL', 'رابط الخريطة'), key: 'google_maps_url', placeholder: 'https://maps.google.com/...',                                    icon: MapPin,         inputType: 'url',  inputMode: 'url'  },
          ].map(({ label, key, placeholder, icon: Icon, inputType, inputMode }) => (
            <div key={key}>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                <Icon size={10} className="inline ml-1 opacity-60" />{label}
              </label>
              <input
                type={inputType}
                inputMode={inputMode as React.HTMLAttributes<HTMLInputElement>['inputMode']}
                value={form[key as keyof typeof form]}
                onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                placeholder={placeholder}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:border-blue-500 focus:outline-none transition-colors placeholder:text-slate-600"
              />
            </div>
          ))}

          {error && <p className="text-red-400 text-xs bg-red-500/10 p-3 rounded-xl border border-red-500/20">{error}</p>}

          <button onClick={handleSave} disabled={saving || !form.shop_name.trim()}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-black text-sm transition-all active:scale-[0.99] disabled:opacity-50 shadow-lg shadow-blue-900/30">
            {saving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
            {t('Save Changes', 'حفظ التغييرات')}
          </button>
        </div>
      </section>

      {/* Status */}
      <div className="flex items-center justify-center gap-2 py-2">
        <span className={`w-2 h-2 rounded-full ${shop.is_active ? 'bg-emerald-400' : 'bg-red-400'}`} />
        <span className="text-xs text-slate-500">
          {shop.is_active ? t('Shop is active', 'المحل نشط') : t('Shop is inactive', 'المحل غير نشط')}
        </span>
      </div>

    </div>
  );
}
