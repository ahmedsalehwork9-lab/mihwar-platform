import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from './lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LanguageContext';
import {
  Store, QrCode, Download, Copy, Check, ExternalLink,
  RefreshCw, AlertCircle, Phone, MapPin, Globe, Save,
  MessageCircle, Image as ImageIcon,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────
// QR generator using qrcode library (loaded via CDN in index.html)
// Falls back to api.qrserver.com if library isn't available.
// ─────────────────────────────────────────────────────────────

function getShopPublicUrl(shopId: number): string {
  return `${window.location.origin}/shop/${shopId}`;
}

function getQRImageUrl(shopId: number, size = 300): string {
  const url = encodeURIComponent(getShopPublicUrl(shopId));
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${url}&color=ffffff&bgcolor=0f172a&margin=10&qzone=1`;
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
};

// ─────────────────────────────────────────────────────────────
// COPY BUTTON
// ─────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); })}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white text-xs font-bold transition-all active:scale-95"
    >
      {copied ? <><Check size={12} className="text-emerald-400" /> نُسخ</> : <><Copy size={12} /> نسخ الرابط</>}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────

export default function ShopSettingsPage() {
  const { ownedShopId } = useAuth();
  const { t, isRTL } = useLang();

  const [shop, setShop]         = useState<ShopProfile | null>(null);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [success, setSuccess]   = useState<string | null>(null);
  const [qrLoaded, setQrLoaded] = useState(false);
  const [qrError, setQrError]   = useState(false);
  const qrRef = useRef<HTMLImageElement>(null);

  // Form state
  const [form, setForm] = useState({
    shop_name:    '',
    phone:        '',
    whatsapp:     '',
    google_maps_url: '',
  });

  // ── Fetch shop ────────────────────────────────────────────

  const fetchShop = useCallback(async () => {
    if (!ownedShopId) return;
    setLoading(true);
    const { data, error: err } = await supabase
      .from('shops')
      .select('id, shop_name, phone, whatsapp, google_maps_url, logo_url, visibility_mode, default_margin_percent, is_active')
      .eq('id', ownedShopId)
      .single();
    if (err || !data) { setError('تعذّر تحميل بيانات المحل'); }
    else {
      setShop(data as ShopProfile);
      setForm({
        shop_name:       data.shop_name        ?? '',
        phone:           data.phone            ?? '',
        whatsapp:        data.whatsapp         ?? '',
        google_maps_url: data.google_maps_url  ?? '',
      });
    }
    setLoading(false);
  }, [ownedShopId]);

  useEffect(() => { fetchShop(); }, [fetchShop]);

  // ── Save ──────────────────────────────────────────────────

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
    else { setSuccess('تم حفظ البيانات بنجاح ✓'); setTimeout(() => setSuccess(null), 3000); fetchShop(); }
    setSaving(false);
  };

  // ── Download QR as PNG ────────────────────────────────────

  const downloadQR = useCallback(async () => {
    if (!shop) return;
    const url = getQRImageUrl(shop.id, 600);
    try {
      const res  = await fetch(url);
      const blob = await res.blob();
      const a    = document.createElement('a');
      a.href     = URL.createObjectURL(blob);
      a.download = `QR-${shop.shop_name.replace(/\s+/g, '-')}.png`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      // Fallback: open in new tab
      window.open(url, '_blank');
    }
  }, [shop]);

  // ── Render ────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <RefreshCw size={28} className="text-blue-500 animate-spin" />
      </div>
    );
  }

  if (!shop && !loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center space-y-2">
          <AlertCircle size={32} className="text-red-400 mx-auto" />
          <p className="text-red-400 text-sm">{error ?? 'لم يتم العثور على المحل'}</p>
        </div>
      </div>
    );
  }

  const publicUrl = shop ? getShopPublicUrl(shop.id) : '';
  const qrUrl     = shop ? getQRImageUrl(shop.id)    : '';

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>

      {/* ── Page title ── */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
          <Store size={18} className="text-blue-400" />
        </div>
        <div>
          <h1 className="text-white font-black text-lg">{t('Shop Settings', 'إعدادات المحل')}</h1>
          <p className="text-slate-500 text-xs">{shop?.shop_name}</p>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          QR CODE SECTION — the main feature
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
                  <p className="text-[10px] text-slate-500">تعذّر تحميل QR</p>
                </div>
              ) : (
                <img
                  ref={qrRef}
                  src={qrUrl}
                  alt={`QR Code for ${shop?.shop_name}`}
                  className={`w-full h-full object-contain transition-opacity duration-300 ${qrLoaded ? 'opacity-100' : 'opacity-0'}`}
                  onLoad={() => setQrLoaded(true)}
                  onError={() => setQrError(true)}
                />
              )}
            </div>
            {/* MIHWAR label under QR */}
            <p className="text-center text-[9px] text-slate-600 font-bold mt-2 uppercase tracking-widest">MIHWAR PLATFORM</p>
          </div>

          {/* Info + actions */}
          <div className="flex-1 min-w-0 space-y-4">
            <div>
              <p className="text-xs text-slate-400 leading-relaxed">
                {t(
                  'Share this QR code with your customers. When scanned, it opens your shop page showing all your public products with prices — no login needed.',
                  'شارك هذا الرمز مع عملائك. عند مسحه يفتح صفحة محلك مباشرةً وتظهر جميع منتجاتك العامة مع الأسعار — بدون تسجيل دخول.'
                )}
              </p>
            </div>

            {/* Public URL display */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5">
              <p className="text-[9px] text-slate-600 font-bold uppercase tracking-widest mb-1">{t('Public Link', 'رابط المحل العام')}</p>
              <p className="text-[11px] text-blue-400 font-mono truncate">{publicUrl}</p>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2">
              <button onClick={downloadQR}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black transition-all active:scale-95 shadow-lg shadow-emerald-900/30">
                <Download size={14} /> {t('Download QR (PNG)', 'تحميل QR')}
              </button>
              <CopyButton text={publicUrl} />
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
          SHOP PROFILE EDIT
      ══════════════════════════════════════════════════════ */}
      <section className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center gap-2">
          <Store size={16} className="text-blue-400" />
          <h2 className="text-white font-black text-sm">{t('Shop Info', 'بيانات المحل')}</h2>
        </div>

        <div className="p-5 space-y-4">
          {[
            { label: t('Shop Name', 'اسم المحل'), key: 'shop_name', placeholder: t('My Shop', 'اسم محلك'), icon: Store, inputType: 'text', inputMode: 'text' },
            { label: t('Phone', 'رقم الجوال'), key: 'phone', placeholder: '05xxxxxxxx', icon: Phone, inputType: 'tel', inputMode: 'tel' },
            { label: t('WhatsApp', 'واتساب'), key: 'whatsapp', placeholder: t('WhatsApp number (if different)', 'واتساب (لو مختلف عن الجوال)'), icon: MessageCircle, inputType: 'tel', inputMode: 'tel' },
            { label: t('Google Maps URL', 'رابط الخريطة'), key: 'google_maps_url', placeholder: 'https://maps.google.com/...', icon: MapPin, inputType: 'url', inputMode: 'url' },
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

          {error  && <p className="text-red-400 text-xs bg-red-500/10 p-3 rounded-xl border border-red-500/20">{error}</p>}
          {success && <p className="text-emerald-400 text-xs bg-emerald-500/10 p-3 rounded-xl border border-emerald-500/20">{success}</p>}

          <button onClick={handleSave} disabled={saving || !form.shop_name.trim()}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-black text-sm transition-all active:scale-[0.99] disabled:opacity-50 shadow-lg shadow-blue-900/30">
            {saving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
            {t('Save Changes', 'حفظ التغييرات')}
          </button>
        </div>
      </section>

      {/* ── Status badge ── */}
      <div className="flex items-center justify-center gap-2 py-2">
        <span className={`w-2 h-2 rounded-full ${shop?.is_active ? 'bg-emerald-400' : 'bg-red-400'}`} />
        <span className="text-xs text-slate-500">
          {shop?.is_active ? t('Shop is active', 'المحل نشط') : t('Shop is inactive', 'المحل غير نشط')}
        </span>
      </div>

    </div>
  );
}
