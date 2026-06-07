import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import {
  CheckCircle, XCircle, RefreshCw, Clock,
  ShoppingCart, Store, Calendar, DollarSign, Hash,
  Shield, Search, Package, FileText, QrCode, ExternalLink,
  MapPin, MessageCircle, Globe, Building2,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type OrderStatus = "pending" | "approved" | "rejected" | "completed";

// Extended shop profile — read-only display
type ShopProfile = {
  shop_name:               string;
  logo_url:                string | null;
  whatsapp:                string | null;
  city:                    string | null;
  commercial_registration: string | null;
  website:                 string | null;
};

type VerifiedOrder = {
  id:           number;
  status:       OrderStatus;
  total_amount: number;
  created_at:   string;
  notes:        string | null;
  from_shop:    ShopProfile | null;
  to_shop:      ShopProfile | null;
};

// ─── Status config (badge inside card) ───────────────────────────────────────

const STATUS_META: Record<OrderStatus, { ar: string; color: string; dot: string }> = {
  pending:   { ar: "معلق",   color: "bg-amber-500/10 text-amber-400 border-amber-500/30",       dot: "bg-amber-400"   },
  approved:  { ar: "مقبول",  color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30", dot: "bg-emerald-400" },
  rejected:  { ar: "مرفوض", color: "bg-red-500/10 text-red-400 border-red-500/30",             dot: "bg-red-400"     },
  completed: { ar: "مكتمل",  color: "bg-blue-500/10 text-blue-400 border-blue-500/30",          dot: "bg-blue-400"    },
};

// ─── Hero config ─────────────────────────────────────────────────────────────

type HeroMeta = {
  Icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  titleAr: string;
  titleEn: string;
  titleColor: string;
  verified: boolean;
};

const HERO_META: Record<OrderStatus, HeroMeta> = {
  completed: {
    Icon: CheckCircle, iconColor: "text-emerald-400",
    iconBg: "bg-emerald-500/10 border-emerald-500/20",
    titleAr: "فاتورة مكتملة ومعتمدة", titleEn: "Completed & Verified",
    titleColor: "text-emerald-400", verified: true,
  },
  approved: {
    Icon: CheckCircle, iconColor: "text-emerald-400",
    iconBg: "bg-emerald-500/10 border-emerald-500/20",
    titleAr: "فاتورة معتمدة", titleEn: "Approved Invoice",
    titleColor: "text-emerald-400", verified: true,
  },
  pending: {
    Icon: Clock, iconColor: "text-amber-400",
    iconBg: "bg-amber-500/10 border-amber-500/20",
    titleAr: "فاتورة قيد المراجعة", titleEn: "Pending Review",
    titleColor: "text-amber-400", verified: false,
  },
  rejected: {
    Icon: XCircle, iconColor: "text-red-400",
    iconBg: "bg-red-500/10 border-red-500/20",
    titleAr: "فاتورة مرفوضة", titleEn: "Rejected Invoice",
    titleColor: "text-red-400", verified: false,
  },
};

const APP_URL = "https://mihwar-app.vercel.app";

// ─── Feature list ─────────────────────────────────────────────────────────────

const FEATURES = [
  { icon: Search,   label: "البحث السريع عن القطع"          },
  { icon: Package,  label: "إدارة المخزون"                  },
  { icon: FileText, label: "أوامر شراء إلكترونية"           },
  { icon: FileText, label: "فواتير احترافية"                },
  { icon: QrCode,   label: "التحقق من المستندات عبر QR"     },
];

// ─── Shop Avatar — logo if available, first-letter fallback ──────────────────

function ShopAvatar({ shop }: { shop: ShopProfile }) {
  if (shop.logo_url) {
    return (
      <img
        src={shop.logo_url}
        alt={shop.shop_name}
        className="w-14 h-14 rounded-2xl object-cover border border-slate-700 shrink-0"
      />
    );
  }
  return (
    <div className="w-14 h-14 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center font-black text-blue-400 text-2xl shrink-0">
      {shop.shop_name.charAt(0)}
    </div>
  );
}

// ─── Shop Profile Card — read-only ───────────────────────────────────────────

function ShopProfileCard({
  shop,
  role,
  roleIcon,
  roleColor,
}: {
  shop: ShopProfile;
  role: string;               // "بيانات المورد" | "بيانات المشتري"
  roleIcon: React.ReactNode;
  roleColor: string;          // tailwind text color for icon
}) {
  // Build the list of fields to display — hide nulls/empty automatically
  const fields: { icon: React.ReactNode; label: string; value: string; href?: string }[] = [];

  if (shop.city) fields.push({
    icon: <MapPin size={13} className="text-slate-400" />,
    label: "المدينة", value: shop.city,
  });

  if (shop.whatsapp) {
    const clean = shop.whatsapp.replace(/\D/g, "");
    const waNum = clean.startsWith("966") ? clean
                : clean.startsWith("05")  ? `966${clean.slice(1)}`
                : clean.startsWith("5")   ? `966${clean}`
                : clean;
    fields.push({
      icon: <MessageCircle size={13} className="text-emerald-400" />,
      label: "واتساب", value: shop.whatsapp,
      href: `https://wa.me/${waNum}`,
    });
  }

  if (shop.commercial_registration) fields.push({
    icon: <Building2 size={13} className="text-slate-400" />,
    label: "السجل التجاري", value: shop.commercial_registration,
  });

  if (shop.website) fields.push({
    icon: <Globe size={13} className="text-blue-400" />,
    label: "الموقع الإلكتروني", value: shop.website,
    href: shop.website,
  });

  // If nothing useful to show beyond the name, still render the card
  return (
    <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl overflow-hidden">

      {/* Card label */}
      <div className="px-4 py-3 border-b border-slate-800/60 flex items-center gap-2">
        <span className={roleColor}>{roleIcon}</span>
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{role}</span>
      </div>

      {/* Logo + name row */}
      <div className="px-4 py-4 flex items-center gap-3 border-b border-slate-800/40">
        <ShopAvatar shop={shop} />
        <div className="min-w-0 flex-1">
          <p className="text-white font-black text-base leading-snug truncate">{shop.shop_name}</p>
          {shop.city && (
            <p className="text-slate-500 text-xs mt-0.5 flex items-center gap-1">
              <MapPin size={10} /> {shop.city}
            </p>
          )}
        </div>
      </div>

      {/* Fields */}
      {fields.length > 0 && (
        <div className="px-4 py-3 divide-y divide-slate-800/40">
          {fields.map(({ icon, label, value, href }) => (
            <div key={label} className="flex items-center justify-between gap-3 py-2.5">
              <div className="flex items-center gap-1.5 shrink-0">
                {icon}
                <span className="text-slate-500 text-xs font-semibold">{label}</span>
              </div>
              {href ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 text-xs font-bold text-left truncate max-w-[55%] hover:text-blue-300 flex items-center gap-1"
                >
                  {value} <ExternalLink size={10} className="shrink-0" />
                </a>
              ) : (
                <span className="text-white text-xs font-bold text-left truncate max-w-[55%]">{value}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function VerifyInvoicePage() {
  const { orderId } = useParams<{ orderId: string }>();
  const [order, setOrder]       = useState<VerifiedOrder | null>(null);
  const [loading, setLoading]   = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!orderId) { setNotFound(true); setLoading(false); return; }
    supabase
      .from("orders")
      .select(`
        id, status, total_amount, created_at, notes,
        from_shop:shops!orders_from_shop_id_fkey(
          shop_name, logo_url, whatsapp, city,
          commercial_registration, website
        ),
        to_shop:shops!orders_to_shop_id_fkey(
          shop_name, logo_url, whatsapp, city,
          commercial_registration, website
        )
      `)
      .eq("id", Number(orderId))
      .single()
      .then(({ data, error }) => {
        if (error || !data) setNotFound(true);
        else setOrder(data as VerifiedOrder);
        setLoading(false);
      });
  }, [orderId]);

  const poNumber = order ? `PO-${String(order.id).padStart(6, "0")}` : "";

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center" dir="rtl">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw size={32} className="text-blue-400 animate-spin" />
          <p className="text-slate-400 text-sm font-bold">جارٍ التحقق من الفاتورة...</p>
        </div>
      </div>
    );
  }

  // ── Not Found ────────────────────────────────────────────────────────────────
  if (notFound) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-4 py-12" dir="rtl">

        {/* Brand header */}
        <div className="mb-10 text-center">
          <p className="text-3xl font-black text-white tracking-tight">محور</p>
          <p className="text-[11px] text-slate-500 mt-1 tracking-widest uppercase">MIHWAR Verification Center</p>
        </div>

        <div className="w-full max-w-sm text-center">
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
              <XCircle size={40} className="text-red-400" />
            </div>
          </div>
          <h1 className="text-2xl font-black text-white mb-1">فاتورة غير موجودة</h1>
          <p className="text-sm font-semibold text-red-400 mb-3">Invalid Invoice</p>
          <p className="text-slate-500 text-sm leading-relaxed">
            لم يتم العثور على فاتورة بهذا الرقم في نظام محور.
            <br />
            تأكد من صحة رابط الفاتورة أو تواصل مع المورد.
          </p>
          <div className="mt-10 pt-6 border-t border-slate-800">
            <p className="text-slate-600 text-xs">منصة محور لقطع الغيار — MIHWAR</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Found ────────────────────────────────────────────────────────────────────
  const statusMeta = STATUS_META[order!.status];
  const { Icon, iconColor, iconBg, titleAr, titleEn, titleColor, verified } = HERO_META[order!.status];

  const dateFormatted = new Date(order!.created_at).toLocaleDateString("ar-SA", {
    year: "numeric", month: "long", day: "numeric",
  });
  const timeFormatted = new Date(order!.created_at).toLocaleTimeString("ar-SA", {
    hour: "2-digit", minute: "2-digit",
  });

  // Decide whether to show shop profile cards
  const showSupplier = !!order!.to_shop;
  const showBuyer    = !!order!.from_shop;

  return (
    <div className="min-h-screen bg-slate-950" dir="rtl">

      {/* ══════════════════════════════════════════════════════
          TOP NAV BAR — UNCHANGED
      ══════════════════════════════════════════════════════ */}
      <div className="border-b border-slate-800/60 bg-slate-900/60 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-5 py-3.5 flex items-center justify-between">
          <div>
            <span className="text-white font-black text-xl tracking-tight">محور</span>
            <span className="text-slate-600 text-[10px] font-bold mr-2 uppercase tracking-widest hidden sm:inline">
              Verification Center
            </span>
          </div>
          <a
            href={APP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 hover:text-white transition-colors"
          >
            زيارة المنصة
            <ExternalLink size={11} />
          </a>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-10 space-y-5">

        {/* ══════════════════════════════════════════════════════
            SECTION 1 — HERO + INVOICE CARD — UNCHANGED
        ══════════════════════════════════════════════════════ */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">

          {/* Hero */}
          <div className="px-6 pt-8 pb-6 text-center border-b border-slate-800/60">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-5">
              MIHWAR Verification Center · منصة محور
            </p>
            <div className="flex justify-center mb-4">
              <div className={`w-20 h-20 rounded-full border-2 flex items-center justify-center ${iconBg}`}>
                <Icon size={38} className={iconColor} />
              </div>
            </div>
            <h1 className="text-2xl font-black text-white mb-1 leading-tight">{titleAr}</h1>
            <p className={`text-sm font-semibold mb-4 ${titleColor}`}>{titleEn}</p>
            <p className="text-[11px] text-slate-500 mb-4">
              تم التحقق من صحة المستند بنجاح
            </p>
            {verified && (
              <span className="inline-flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-bold px-3 py-1.5 rounded-full">
                <CheckCircle size={11} />
                ✓ Verified by MIHWAR
              </span>
            )}
          </div>

          {/* PO number strip */}
          <div className="bg-slate-800/40 border-b border-slate-800/60 px-5 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Hash size={13} className="text-slate-500" />
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">رقم الأمر</span>
            </div>
            <span className="font-mono font-black text-white text-lg tracking-wide">{poNumber}</span>
          </div>

          {/* Invoice rows — UNCHANGED */}
          <div className="px-5 py-1 divide-y divide-slate-800/50">

            <div className="flex items-center justify-between py-3.5">
              <span className="text-slate-500 text-sm font-semibold">الحالة</span>
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border ${statusMeta.color}`}>
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusMeta.dot}`} />
                {statusMeta.ar}
              </span>
            </div>

            <div className="flex items-start justify-between py-3.5 gap-3">
              <div className="flex items-center gap-1.5 shrink-0">
                <ShoppingCart size={13} className="text-blue-400" />
                <span className="text-slate-500 text-sm font-semibold">المشتري</span>
              </div>
              <span className="text-white font-bold text-sm text-left truncate max-w-[55%]">
                {order!.from_shop?.shop_name ?? "—"}
              </span>
            </div>

            <div className="flex items-start justify-between py-3.5 gap-3">
              <div className="flex items-center gap-1.5 shrink-0">
                <Store size={13} className="text-emerald-400" />
                <span className="text-slate-500 text-sm font-semibold">المورد</span>
              </div>
              <span className="text-white font-bold text-sm text-left truncate max-w-[55%]">
                {order!.to_shop?.shop_name ?? "—"}
              </span>
            </div>

            <div className="flex items-center justify-between py-3.5">
              <div className="flex items-center gap-1.5">
                <Calendar size={13} className="text-slate-500" />
                <span className="text-slate-500 text-sm font-semibold">التاريخ</span>
              </div>
              <div className="text-left">
                <p className="text-white font-bold text-sm">{dateFormatted}</p>
                <p className="text-slate-500 text-[10px] font-mono">{timeFormatted}</p>
              </div>
            </div>

            <div className="flex items-center justify-between py-3.5">
              <div className="flex items-center gap-1.5">
                <DollarSign size={13} className="text-emerald-500" />
                <span className="text-slate-500 text-sm font-semibold">الإجمالي</span>
              </div>
              <span className="text-emerald-400 font-black text-xl">
                {order!.total_amount.toLocaleString()}
                <span className="text-xs font-normal text-slate-500"> ر.س</span>
              </span>
            </div>

          </div>

          {order!.notes && (
            <div className="mx-5 mb-5 bg-amber-500/5 border border-amber-500/10 rounded-xl p-3">
              <p className="text-[9px] font-bold text-amber-500 uppercase tracking-wider mb-1">ملاحظات</p>
              <p className="text-slate-300 text-xs leading-relaxed">{order!.notes}</p>
            </div>
          )}
        </div>

        {/* ══════════════════════════════════════════════════════
            NEW — SUPPLIER + BUYER PROFILE CARDS
            Positioned between invoice card and trust section
        ══════════════════════════════════════════════════════ */}

        {showSupplier && order!.to_shop && (
          <ShopProfileCard
            shop={order!.to_shop}
            role="بيانات المورد"
            roleIcon={<Store size={13} />}
            roleColor="text-emerald-400"
          />
        )}

        {showBuyer && order!.from_shop && (
          <ShopProfileCard
            shop={order!.from_shop}
            role="بيانات المشتري"
            roleIcon={<ShoppingCart size={13} />}
            roleColor="text-blue-400"
          />
        )}

        {/* ══════════════════════════════════════════════════════
            SECTION 2 — TRUST SECTION — UNCHANGED
        ══════════════════════════════════════════════════════ */}
        <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl px-5 py-5 flex items-start gap-4">
          <div className="shrink-0 w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mt-0.5">
            <Shield size={16} className="text-blue-400" />
          </div>
          <div>
            <p className="text-white font-bold text-sm mb-1">
              تم إصدار هذا المستند عبر منصة محور
            </p>
            <p className="text-slate-500 text-xs leading-relaxed">
              جميع بيانات الطلب مطابقة للسجل الإلكتروني وتم التحقق من صحتها وقت عرض هذه الصفحة.
            </p>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════
            SECTION 3 — MARKETING CARD — UNCHANGED
        ══════════════════════════════════════════════════════ */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden">

          <div className="px-5 pt-6 pb-4 border-b border-slate-800/60">
            <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-2">منصة محور · MIHWAR</p>
            <h2 className="text-lg font-black text-white leading-snug">
              السوق الرقمي لمحلات قطع الغيار
            </h2>
            <p className="text-slate-400 text-xs mt-2 leading-relaxed">
              منصة محور تربط محلات قطع الغيار والموردين في مكان واحد لإدارة المخزون والطلبات والفواتير بشكل احترافي.
            </p>
          </div>

          <div className="px-5 py-4 grid grid-cols-1 gap-2">
            {FEATURES.map(({ icon: FeatIcon, label }) => (
              <div key={label} className="flex items-center gap-2.5">
                <div className="w-5 h-5 rounded-md bg-emerald-500/10 flex items-center justify-center shrink-0">
                  <FeatIcon size={11} className="text-emerald-400" />
                </div>
                <span className="text-slate-300 text-xs font-semibold">{label}</span>
              </div>
            ))}
          </div>

          <div className="mx-5 mb-5 bg-gradient-to-l from-blue-600/20 to-emerald-600/10 border border-blue-500/20 rounded-xl px-4 py-3 flex items-center gap-3">
            <span className="text-lg">🎁</span>
            <div>
              <p className="text-white font-black text-sm">تجربة مجانية لمدة 3 أشهر</p>
              <p className="text-slate-400 text-[10px]">سجل الآن وابدأ بدون أي تكلفة</p>
            </div>
          </div>

          <div className="px-5 pb-6 flex flex-col gap-2.5">
            <a
              href={APP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full bg-blue-600 hover:bg-blue-500 active:scale-[0.99] text-white font-black text-sm rounded-xl py-3.5 flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-900/30"
            >
              سجل الآن
              <ExternalLink size={14} />
            </a>
            <a
              href={APP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full text-center text-slate-500 hover:text-slate-300 text-xs font-semibold py-1.5 transition-colors"
            >
              زيارة منصة محور
            </a>
          </div>
        </div>

        {/* ── Brand footer — UNCHANGED ── */}
        <div className="pt-2 pb-6 text-center space-y-1">
          <p className="text-slate-700 text-[11px] font-black">محور · MIHWAR</p>
          <p className="text-slate-700 text-[10px]">منصة قطع غيار ايسوزو B2B</p>
        </div>

      </div>
    </div>
  );
}
