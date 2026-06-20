import { useEffect, useState, useMemo, useCallback, memo } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from './lib/supabase';
import {
  Search, ShoppingCart, Plus, Minus, Trash2, X,
  MessageCircle, MapPin, Store, Tag,
  PackageSearch, AlertCircle, Check, Copy,
  Globe, ImageOff,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

type Shop = {
  id: number;
  shop_name: string;
  phone: string;
  whatsapp: string | null;
  google_maps_url: string | null;
  logo_url: string | null;
  visibility_mode?: string | null;
  default_margin_percent?: number | null;
};

type Product = {
  id: number;
  product_name: string;
  product_code: string;
  brand: string;
  model: string;
  quantity: number;
  price: number;
  product_image_url?: string | null;
  visibility_scope?: string | null;
};

type CartItem = Product & { cartQty: number; displayPrice: number };

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function toWaLink(num: string): string {
  const clean = num.replace(/\D/g, '');
  if (clean.startsWith('966')) return `https://wa.me/${clean}`;
  if (clean.startsWith('05'))  return `https://wa.me/966${clean.slice(1)}`;
  if (clean.startsWith('5'))   return `https://wa.me/966${clean}`;
  return `https://wa.me/${clean}`;
}

function buildWaMessage(shop: Shop, cart: CartItem[]): string {
  const lines = [
    `مرحباً، أود الاستفسار عن الطلب التالي من ${shop.shop_name}:`,
    '',
    ...cart.map((item, i) =>
      `${i + 1}. ${item.product_name} (${item.product_code})\n   الكمية: ${item.cartQty} × ${item.displayPrice.toLocaleString()} ر.س = ${(item.displayPrice * item.cartQty).toLocaleString()} ر.س`
    ),
    '',
    `الإجمالي: ${cart.reduce((s, i) => s + i.displayPrice * i.cartQty, 0).toLocaleString()} ر.س`,
    '',
    `تم الطلب عبر منصة محور`,
  ];
  return encodeURIComponent(lines.join('\n'));
}

// ─────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────

const ProductThumb = memo(({ src, alt }: { src?: string | null; alt: string }) => {
  const [errored, setErrored] = useState(false);
  if (!src || errored) {
    return (
      <div className="w-full aspect-[16/9] rounded-xl bg-slate-800 border border-slate-700/60 flex items-center justify-center">
        <ImageOff size={20} className="text-slate-600" />
      </div>
    );
  }
  return (
    <img
      src={src} alt={alt} loading="lazy"
      onError={() => setErrored(true)}
      className="w-full aspect-[16/9] rounded-xl object-cover border border-slate-800"
    />
  );
});

const CopyBtn = memo(({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}
      className="p-1 rounded-md bg-slate-800 text-slate-500 hover:text-emerald-400 transition-all active:scale-90"
    >
      {copied ? <Check size={11} /> : <Copy size={11} />}
    </button>
  );
});

// ─────────────────────────────────────────────────────────────
// CART ITEM ROW
// ─────────────────────────────────────────────────────────────

const CartRow = memo(({ item, onRemove, onQty }: {
  item: CartItem; onRemove: () => void; onQty: (q: number) => void;
}) => (
  <div className="border-b border-slate-800/60 py-3 last:border-0">
    <div className="flex items-start justify-between gap-2 mb-2">
      <div className="flex-1 min-w-0">
        <p className="text-white font-semibold text-xs leading-snug line-clamp-2">{item.product_name}</p>
        <p className="text-[10px] text-slate-500 font-mono mt-0.5 truncate">{item.product_code}</p>
      </div>
      <button onClick={onRemove} className="p-1 rounded-lg text-slate-600 hover:text-red-400 transition-all active:scale-90">
        <Trash2 size={13} />
      </button>
    </div>
    <div className="flex items-center justify-between">
      <div className="flex items-center bg-slate-800 rounded-lg border border-slate-700/60 overflow-hidden">
        <button onClick={() => onQty(item.cartQty - 1)} className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 transition-colors">
          <Minus size={11} />
        </button>
        <span className="w-8 text-center text-sm font-black text-white tabular-nums">{item.cartQty}</span>
        <button onClick={() => onQty(item.cartQty + 1)} className="w-7 h-7 flex items-center justify-center text-white bg-blue-700/40 hover:bg-blue-600 transition-colors">
          <Plus size={11} />
        </button>
      </div>
      <p className="text-emerald-400 text-sm font-black tabular-nums">
        {(item.displayPrice * item.cartQty).toLocaleString()} <span className="text-[10px] font-normal text-slate-500">ر.س</span>
      </p>
    </div>
  </div>
));

// ─────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────


// ─────────────────────────────────────────────────────────────
// SCAN TRACKING — يُسجَّل عند فتح الصفحة لأول مرة في كل جلسة
// ─────────────────────────────────────────────────────────────

function detectDeviceType(): 'mobile' | 'desktop' | 'tablet' {
  const ua = navigator.userAgent.toLowerCase();
  if (/tablet|ipad|playbook|silk|(android(?!.*mobi))/.test(ua)) return 'tablet';
  if (/mobile|android|iphone|ipod|blackberry|opera mini|iemobile/.test(ua)) return 'mobile';
  return 'desktop';
}

async function recordQRScan(shopId: number): Promise<void> {
  // نمنع التسجيل المكرر في نفس الجلسة
  const sessionKey = `qr_scanned_${shopId}`;
  if (sessionStorage.getItem(sessionKey)) return;
  try {
    await supabase.from('shop_qr_scans').insert({
      shop_id:    shopId,
      device_type: detectDeviceType(),
    });
    sessionStorage.setItem(sessionKey, '1');
  } catch {
    // صامت — لا نُظهر خطأ للزبون لو فشل التسجيل
  }
}

export default function ShopPublicPage() {
  const { shopId, slug } = useParams<{ shopId?: string; slug?: string }>();
  const id = shopId ? Number(shopId) : null;

  const [shop, setShop]         = useState<Shop | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [search, setSearch]     = useState('');
  const [cart, setCart]         = useState<CartItem[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [lang, setLang]         = useState<'ar' | 'en'>('ar');

  const isRTL = lang === 'ar';
  const t = useCallback((en: string, ar: string) => lang === 'ar' ? ar : en, [lang]);

  // ── Fetch shop + products ─────────────────────────────────

  useEffect(() => {
    if (!id && !slug) { setError('رابط المحل غير صحيح'); setLoading(false); return; }
    if (id !== null && isNaN(id)) { setError('رابط المحل غير صحيح'); setLoading(false); return; }

    (async () => {
      try {
        // Support both /shop/:shopId and /s/:slug
        let shopQuery = supabase
          .from('shops')
          .select('id, shop_name, phone, whatsapp, google_maps_url, logo_url, visibility_mode, default_margin_percent, slug')
          .eq('is_active', true);

        if (slug) {
          shopQuery = shopQuery.eq('slug', slug);
        } else {
          shopQuery = shopQuery.eq('id', id!);
        }

        const { data: shopData, error: shopErr } = await shopQuery.single();

        if (shopErr || !shopData) throw new Error('المحل غير موجود أو غير نشط');
        setShop(shopData as Shop);

        // تسجيل المسحة بعد التحقق من وجود المحل
        void recordQRScan((shopData as any).id);

        const resolvedShopId = (shopData as any).id;
        const { data: prodsData, error: prodsErr } = await supabase
          .from('products')
          .select('id, product_name, product_code, brand, model, quantity, price, product_image_url, visibility_scope')
          .eq('shop_id', resolvedShopId)
          .eq('visibility_scope', 'public')
          .gt('quantity', 0)
          .order('created_at', { ascending: false });

        if (prodsErr) throw prodsErr;
        setProducts((prodsData as Product[]) || []);
      } catch (e: any) {
        setError(e?.message ?? 'حدث خطأ في تحميل بيانات المحل');
      } finally {
        setLoading(false);
      }
    })();
  }, [id, slug]);

  // ── Display price (public viewers always see margin-adjusted price) ──

  const effectiveDisplayPrice = useCallback((p: Product): number => {
    const margin = shop?.default_margin_percent ?? 0;
    return p.price * (1 + Math.max(0, margin) / 100);
  }, [shop]);

  // ── Filtered products ─────────────────────────────────────

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(p =>
      p.product_name.toLowerCase().includes(q) ||
      p.product_code.toLowerCase().includes(q) ||
      (p.brand?.toLowerCase().includes(q)) ||
      (p.model?.toLowerCase().includes(q))
    );
  }, [products, search]);

  const brands = useMemo(() =>
    ['all', ...new Set(products.map(p => p.brand).filter(Boolean))],
    [products]
  );
  const [brandFilter, setBrandFilter] = useState('all');

  const displayed = useMemo(() =>
    brandFilter === 'all' ? filtered : filtered.filter(p => p.brand === brandFilter),
    [filtered, brandFilter]
  );

  // ── Cart actions ──────────────────────────────────────────

  const addToCart = useCallback((p: Product) => {
    const dp = effectiveDisplayPrice(p);
    setCart(prev => {
      const ex = prev.find(i => i.id === p.id);
      if (ex) return prev.map(i => i.id === p.id ? { ...i, cartQty: i.cartQty + 1 } : i);
      return [...prev, { ...p, cartQty: 1, displayPrice: dp }];
    });
  }, [effectiveDisplayPrice]);

  const setQty = useCallback((id: number, qty: number) => {
    if (qty <= 0) setCart(prev => prev.filter(i => i.id !== id));
    else setCart(prev => prev.map(i => i.id === id ? { ...i, cartQty: qty } : i));
  }, []);

  const removeFromCart = useCallback((id: number) => {
    setCart(prev => prev.filter(i => i.id !== id));
  }, []);

  const cartTotal     = useMemo(() => cart.reduce((s, i) => s + i.displayPrice * i.cartQty, 0), [cart]);
  const cartItemCount = useMemo(() => cart.reduce((s, i) => s + i.cartQty, 0), [cart]);

  // ── WhatsApp order ────────────────────────────────────────

  const sendWhatsApp = useCallback(() => {
    if (!shop || cart.length === 0) return;
    const num = shop.whatsapp || shop.phone;
    if (!num) return;
    const msg = buildWaMessage(shop, cart);
    window.open(`${toWaLink(num)}?text=${msg}`, '_blank');
  }, [shop, cart]);

  // ── Loading / Error ───────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !shop) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <div className="text-center space-y-4 max-w-sm">
          <Store size={52} className="text-slate-600 mx-auto" />
          <h2 className="text-xl font-black text-white">{error ?? 'المحل غير موجود'}</h2>
          <p className="text-slate-500 text-sm">تحقق من الرابط أو تواصل مع صاحب المحل</p>
        </div>
      </div>
    );
  }

  const waNum = shop.whatsapp || shop.phone;

  return (
    <div className="min-h-screen bg-slate-950" dir={isRTL ? 'rtl' : 'ltr'}>

      {/* ── Header ── */}
      <header className="sticky top-0 z-40 bg-slate-950/95 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-6xl mx-auto px-4 py-3">

          {/* Shop identity */}
          <div className="flex items-center gap-3 mb-3">
            {shop.logo_url ? (
              <img src={shop.logo_url} alt={shop.shop_name} className="w-11 h-11 rounded-xl object-cover border border-slate-700 shrink-0" />
            ) : (
              <div className="w-11 h-11 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
                <Store size={20} className="text-slate-500" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h1 className="text-white font-black text-base leading-tight truncate">{shop.shop_name}</h1>
              <div className="flex items-center gap-3 mt-0.5">
                {waNum && (
                  <a href={toWaLink(waNum)} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[11px] text-emerald-400 font-bold">
                    <MessageCircle size={11} /> {t('WhatsApp', 'واتساب')}
                  </a>
                )}
                {shop.google_maps_url && (
                  <a href={shop.google_maps_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[11px] text-blue-400 font-bold">
                    <MapPin size={11} /> {t('Location', 'الموقع')}
                  </a>
                )}
              </div>
            </div>
            {/* Lang toggle */}
            <button onClick={() => setLang(l => l === 'ar' ? 'en' : 'ar')}
              className="px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 text-[11px] font-bold shrink-0 hover:bg-slate-700 transition-colors">
              {lang === 'ar' ? 'EN' : 'ع'}
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className={`absolute top-1/2 -translate-y-1/2 ${isRTL ? 'right-3' : 'left-3'} text-slate-500 pointer-events-none`} size={15} />
            <input
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('Search products...', 'ابحث في المنتجات...')}
              className={`w-full bg-slate-900 border border-slate-800 rounded-xl ${isRTL ? 'pr-9 pl-3' : 'pl-9 pr-3'} py-2.5 text-white text-sm focus:border-blue-600 focus:outline-none transition-colors`}
            />
          </div>

          {/* Brand filter */}
          {brands.length > 2 && (
            <div className="flex gap-2 overflow-x-auto pt-2.5 no-scrollbar">
              {brands.map(b => (
                <button key={b} onClick={() => setBrandFilter(b)}
                  className={`px-3 py-1 rounded-full text-xs font-bold border whitespace-nowrap transition-all active:scale-95 ${
                    brandFilter === b ? 'bg-blue-600 border-blue-600 text-white' : 'bg-slate-900 border-slate-800 text-slate-400'
                  }`}>
                  {b === 'all' ? t('All', 'الكل') : b}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      {/* ── Main layout: products + desktop cart sidebar ── */}
      <div className="max-w-6xl mx-auto px-4 py-4 flex gap-6 items-start">

      {/* Products column */}
      <main className="flex-1 min-w-0" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 8rem)' }}>

        {/* Stats strip */}
        {!loading && products.length > 0 && (
          <div className="flex items-center gap-4 mb-4 text-[11px] text-slate-500 font-bold px-1">
            <Globe size={11} className="text-emerald-500" />
            <span>{products.length} {t('products available', 'منتج متاح')}</span>
            {search && <span className="text-blue-400">← {displayed.length} {t('results', 'نتيجة')}</span>}
          </div>
        )}

        {displayed.length === 0 ? (
          <div className="py-24 text-center flex flex-col items-center gap-4 opacity-40">
            <PackageSearch size={48} className="text-slate-500" />
            <p className="text-sm text-slate-400">{t('No products found', 'لا توجد منتجات مطابقة')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {displayed.map(p => {
              const dp = effectiveDisplayPrice(p);
              const inCart = cart.some(c => c.id === p.id);
              const cartQty = cart.find(c => c.id === p.id)?.cartQty ?? 0;

              return (
                <div key={p.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col gap-3">

                  <ProductThumb src={p.product_image_url} alt={p.product_name} />

                  {/* Name + stock */}
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-white font-bold text-sm leading-snug flex-1 min-w-0 line-clamp-2">{p.product_name}</h3>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap ${
                      p.quantity > 10 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                      p.quantity > 0  ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'   :
                                        'bg-red-500/10 text-red-400 border-red-500/20'
                    }`}>
                      {p.quantity > 10 ? t('In Stock', 'متوفر') : p.quantity > 0 ? t('Limited', 'كمية محدودة') : t('Out of Stock', 'غير متوفر')}
                    </span>
                  </div>

                  {/* Code */}
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[11px] text-slate-400 bg-slate-950 px-2 py-1 rounded-lg border border-slate-800 truncate max-w-[9rem]">
                      {p.product_code}
                    </span>
                    <CopyBtn text={p.product_code} />
                  </div>

                  {/* Brand / model */}
                  {(p.brand || p.model) && (
                    <div className="flex items-center gap-1 text-[11px] text-slate-400">
                      <Tag size={10} className="text-blue-500 shrink-0" />
                      <span className="truncate">{[p.brand, p.model].filter(Boolean).join(' · ')}</span>
                    </div>
                  )}

                  {/* Price + add/qty */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-800/60">
                    <div>
                      <span className="text-[10px] text-slate-500 block leading-none mb-1">{t('Unit Price', 'سعر الوحدة')}</span>
                      <span className="text-xl font-black text-white tabular-nums">
                        {dp.toLocaleString()} <span className="text-[11px] font-medium text-slate-500">ر.س</span>
                      </span>
                    </div>

                    {!inCart ? (
                      <button onClick={() => addToCart(p)} disabled={p.quantity === 0}
                        className="h-9 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 active:scale-95 disabled:bg-slate-800 disabled:text-slate-600 font-bold text-xs text-white transition-all flex items-center gap-1.5 shrink-0">
                        <Plus size={13} /> {t('Add', 'إضافة')}
                      </button>
                    ) : (
                      <div className="flex items-center bg-slate-800 rounded-xl border border-slate-700 overflow-hidden shrink-0">
                        <button onClick={() => setQty(p.id, cartQty - 1)} className="w-8 h-8 flex items-center justify-center text-slate-300 hover:bg-slate-700 transition-colors">
                          {cartQty === 1 ? <Trash2 size={12} className="text-red-400" /> : <Minus size={12} />}
                        </button>
                        <span className="w-9 text-center text-sm font-black text-white tabular-nums">{cartQty}</span>
                        <button onClick={() => addToCart(p)} className="w-8 h-8 flex items-center justify-center text-white hover:bg-blue-600 bg-blue-700/50 transition-colors">
                          <Plus size={12} />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* WhatsApp single product */}
                  {waNum && (
                    <a
                      href={`${toWaLink(waNum)}?text=${encodeURIComponent(`مرحباً، أريد الاستفسار عن:\n${p.product_name} (${p.product_code})\nالسعر: ${dp.toLocaleString()} ر.س\n\nمن منصة محور`)}`}
                      target="_blank" rel="noopener noreferrer"
                      className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold hover:bg-emerald-500/20 transition-all active:scale-[0.98]"
                    >
                      <MessageCircle size={12} /> {t('Ask on WhatsApp', 'استفسار عبر واتساب')}
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* ── Desktop Cart Sidebar ── */}
      {cart.length > 0 && (
        <aside className="hidden md:flex flex-col w-80 shrink-0 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden sticky top-4 h-fit" dir={isRTL ? 'rtl' : 'ltr'}>
          {/* Header */}
          <div className="flex items-center gap-2 px-4 py-3.5 border-b border-slate-800">
            <ShoppingCart size={16} className="text-emerald-400 shrink-0" />
            <h2 className="text-white font-black text-sm">{t('Your Order', 'طلبك')}</h2>
            <span className="mr-auto bg-emerald-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full tabular-nums">
              {cartItemCount}
            </span>
          </div>
          {/* Items */}
          <div className="flex-1 overflow-y-auto overscroll-contain px-4 max-h-[50vh]">
            {cart.map(item => (
              <CartRow key={item.id} item={item}
                onRemove={() => removeFromCart(item.id)}
                onQty={qty => setQty(item.id, qty)}
              />
            ))}
          </div>
          {/* Footer */}
          <div className="px-4 py-4 border-t border-slate-800 space-y-3">
            <div className="flex items-center justify-between bg-slate-800/60 border border-slate-700/50 rounded-xl px-4 py-3">
              <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wide">{t('Total', 'الإجمالي')}</span>
              <span className="text-xl font-black text-white tabular-nums">
                {cartTotal.toLocaleString()} <span className="text-xs font-normal text-slate-400">SAR</span>
              </span>
            </div>
            {waNum && (
              <button onClick={sendWhatsApp}
                className="w-full bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] text-white font-black rounded-xl shadow-lg shadow-emerald-900/30 flex items-center justify-center gap-2 transition-all h-12 text-sm">
                <MessageCircle size={16} />
                {t('Send Order via WhatsApp', 'إرسال الطلب عبر واتساب')}
              </button>
            )}
            <p className="text-center text-[10px] text-slate-600">
              {t('Powered by', 'مشغّل بواسطة')} <span className="text-slate-500 font-bold">MIHWAR</span>
            </p>
          </div>
        </aside>
      )}

      </div>{/* end main layout flex */}

      {/* ── Floating cart button — mobile only ── */}
      {cart.length > 0 && (
        <div className={`fixed z-40 md:hidden ${isRTL ? 'left-4' : 'right-4'}`} style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.5rem)' }}>
          <button onClick={() => setShowCart(true)}
            className="relative bg-blue-600 hover:bg-blue-500 active:scale-95 text-white rounded-2xl shadow-2xl shadow-blue-900/50 flex items-center gap-2.5 px-4 transition-all h-14">
            <span className="absolute -top-2 -right-2 bg-emerald-500 text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center tabular-nums shadow">
              {cartItemCount}
            </span>
            <ShoppingCart size={20} />
            <div className={isRTL ? 'text-right' : 'text-left'}>
              <p className="text-sm font-black leading-tight tabular-nums">{cartTotal.toLocaleString()}</p>
              <p className="text-[9px] opacity-75 font-bold">SAR</p>
            </div>
          </button>
        </div>
      )}

      {/* ── Cart Sheet ── */}
      {showCart && (
        <div className="fixed inset-0 z-50 flex items-end md:hidden" dir={isRTL ? 'rtl' : 'ltr'}>
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowCart(false)} />
          <div className="relative w-full bg-slate-900 rounded-t-3xl border-t border-slate-800 shadow-2xl flex flex-col overflow-hidden" style={{ maxHeight: '90vh' }}>

            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-12 h-1.5 rounded-full bg-slate-700" />
            </div>

            {/* Header */}
            <div className="px-5 py-3 flex justify-between items-center border-b border-slate-800 shrink-0">
              <div className="flex items-center gap-2">
                <ShoppingCart size={17} className="text-emerald-400" />
                <h3 className="text-base font-black text-white">{t('Your Order', 'طلبك')}</h3>
              </div>
              <button onClick={() => setShowCart(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-800 text-slate-400 hover:text-white transition-all">
                <X size={16} />
              </button>
            </div>

            {/* Items */}
            <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-1">
              {cart.map(item => (
                <CartRow key={item.id} item={item}
                  onRemove={() => removeFromCart(item.id)}
                  onQty={qty => setQty(item.id, qty)}
                />
              ))}
            </div>

            {/* Footer */}
            <div className="shrink-0 bg-slate-950 border-t border-slate-800 px-4 pt-3 space-y-3" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.25rem)' }}>
              {/* Total */}
              <div className="flex items-center justify-between bg-slate-800/60 border border-slate-700/50 rounded-xl px-4 py-3">
                <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wide">{t('Total', 'الإجمالي')}</span>
                <span className="text-xl font-black text-white tabular-nums">
                  {cartTotal.toLocaleString()} <span className="text-xs font-normal text-slate-400">SAR</span>
                </span>
              </div>

              {/* WhatsApp CTA — primary */}
              {waNum && (
                <button onClick={sendWhatsApp}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] text-white font-black rounded-2xl shadow-2xl shadow-emerald-900/60 flex items-center justify-center gap-2.5 transition-all h-14 text-base">
                  <MessageCircle size={20} />
                  {t('Send Order via WhatsApp', 'إرسال الطلب عبر واتساب')}
                </button>
              )}

              {/* Platform note */}
              <p className="text-center text-[10px] text-slate-600">
                {t('Powered by', 'مشغّل بواسطة')} <span className="text-slate-500 font-bold">MIHWAR</span>
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
