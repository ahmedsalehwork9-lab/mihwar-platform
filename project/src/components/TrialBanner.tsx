// =============================================================
// src/components/TrialBanner.tsx
// لافتة الفترة التجريبية — تظهر للعميل أعلى كل صفحة طالما اشتراكه trial.
// تقرأ الإعداد النشط من OrgConfigProvider (بلا استعلام إضافي).
// تختفي تلقائيًا لغير التجريبي (active/suspended/…) أو لو لا يوجد تاريخ انتهاء.
// ثنائية اللغة + RTL. الألوان تتدرّج حسب قُرب الانتهاء.
// =============================================================
import { useOrgConfig } from "../context/OrgConfigContext";
import { useLang } from "../context/LanguageContext";

export default function TrialBanner() {
  const { cfg } = useOrgConfig();
  const { t, isRTL } = useLang();

  if (!cfg || cfg.subscription_status !== "trial" || !cfg.trial_ends_at) return null;

  const endStr = String(cfg.trial_ends_at).slice(0, 10);              // yyyy-mm-dd
  const end = new Date(endStr + "T00:00:00");
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysLeft = Math.round((end.getTime() - startOfToday.getTime()) / 86400000);

  const expired = daysLeft <= 0;
  const urgent = daysLeft > 0 && daysLeft <= 7;

  const tone = expired
    ? "bg-red-500/10 border-red-500/30 text-red-300"
    : urgent
    ? "bg-orange-500/10 border-orange-500/30 text-orange-300"
    : "bg-amber-500/10 border-amber-500/30 text-amber-300";

  const icon = expired ? "⛔" : urgent ? "⚠️" : "⏳";

  const msg = expired
    ? t("Trial period ended", "انتهت الفترة التجريبية")
    : t(`Trial — ${daysLeft} day${daysLeft === 1 ? "" : "s"} left`, `فترة تجريبية — متبقّي ${daysLeft} يوم`);

  return (
    <div
      dir={isRTL ? "rtl" : "ltr"}
      className={`mb-4 rounded-xl border px-4 py-2.5 text-sm font-bold flex items-center gap-2 ${tone}`}
    >
      <span className="text-base leading-none shrink-0">{icon}</span>
      <span>{msg}</span>
      <span className="ms-auto text-[11px] font-semibold opacity-80 [direction:ltr] shrink-0">
        {t("ends", "تنتهي")}: {endStr}
      </span>
    </div>
  );
}
