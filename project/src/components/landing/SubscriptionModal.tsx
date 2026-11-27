// نافذة طلب الاشتراك: تحقق، حقل مصيدة (honeypot)، مفتاح تفرد، مهلة تكرار، تعطيل أثناء الإرسال.
import { useEffect, useRef, useState, FormEvent } from "react";
import { X, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { useLang } from "../../context/LanguageContext";
import { ACTIVITIES, PLANS, EMPTY_FORM, SubForm, SubErr, PlanId, validateSub, buildPayload, normalizePhone, inCooldown, cooldownKey, newKey } from "./subscriptionLogic";
import { submitSubscription } from "./subscriptionApi";
import { BRAND_NAME_FALLBACK } from "./constants";
import { COUNTRIES, OTHER_CITY, findCountry } from "./countries";

type Props = { open: boolean; plan?: PlanId; onClose: () => void };
type Phase = "form" | "sending" | "done" | "error";

export default function SubscriptionModal({ open, plan = "trial", onClose }: Props) {
  const { t, lang, isRTL } = useLang();
  const [f, setF] = useState<SubForm>({ ...EMPTY_FORM, plan });
  const [errs, setErrs] = useState<Partial<Record<SubErr, true>>>({});
  const [phase, setPhase] = useState<Phase>("form");
  const [msg, setMsg] = useState("");
  const keyRef = useRef<string>(newKey());
  const sending = useRef(false);
  const firstRef = useRef<HTMLInputElement>(null);

  // الحالة تبدأ نظيفة عند كل فتح لأن الصفحة تعيد تركيب المكوّن بمفتاح جديد؛ هنا نكتفي بالتركيز.
  useEffect(() => { if (open) { keyRef.current = newKey(); const id = setTimeout(() => { const a = document.activeElement; if (!a || a === document.body || a.tagName === 'BUTTON') firstRef.current?.focus(); }, 50); return () => clearTimeout(id); } }, [open]);
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape" && !sending.current) onClose(); };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;

  const set = <K extends keyof SubForm>(k: K, v: SubForm[K]) => { setF((p) => ({ ...p, [k]: v })); setErrs((p) => { const n = { ...p }; delete (n as Record<string, unknown>)[k]; return n; }); };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (sending.current) return;                       // يمنع النقر المزدوج
    if (f.website.trim()) { setPhase("done"); return; } // honeypot: روبوت — نُظهر نجاحًا شكليًا ولا نحفظ
    const v = validateSub(f); setErrs(v);
    if (Object.keys(v).length) { setMsg(t("Please fix the highlighted fields.", "يرجى تصحيح الحقول المظللة.")); return; }
    const phone = normalizePhone(f.phone, findCountry(f.country)?.dial ?? "966") as string;
    let raw: string | null = null; try { raw = localStorage.getItem(cooldownKey); } catch { /* ignore */ }
    if (inCooldown(raw, Date.now(), phone)) { setPhase("done"); return; } // طلب مكرر حديث لنفس الجوال
    sending.current = true; setPhase("sending"); setMsg("");
    const res = await submitSubscription(buildPayload(f, lang, keyRef.current));
    sending.current = false;
    if (res.ok) { try { localStorage.setItem(cooldownKey, JSON.stringify({ at: Date.now(), phone })); } catch { /* ignore */ } setPhase("done"); return; }
    setPhase("error");
    setMsg(res.missingTable
      ? t("The request service is not activated yet. Please contact us directly.", "خدمة استقبال الطلبات لم تُفعَّل بعد. يرجى التواصل معنا مباشرة.")
      : t("We couldn't send your request. Check your connection and try again.", "تعذّر إرسال طلبك. تحقق من الاتصال وأعد المحاولة."));
  };

  const inp = (bad?: boolean) => `w-full rounded-xl border bg-[#ffffff] px-3.5 py-2.5 text-[15px] text-[#0B1F44] outline-none transition placeholder:text-[#9aa7c0] focus:border-[#007BFF] focus:ring-2 focus:ring-[#007BFF]/25 ${bad ? "border-[#e5484d]" : "border-[#d5dae5]"}`;
  const lbl = "mb-1.5 block text-sm font-bold text-[#0B1F44]";
  const Err = ({ k, text }: { k: SubErr; text: string }) => (errs[k] ? <p className="mt-1 text-xs font-semibold text-[#e5484d]" role="alert">{text}</p> : null);

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-[#0B1F44]/70 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={t("Request a subscription", "طلب اشتراك")} onMouseDown={(e) => { if (e.target === e.currentTarget && !sending.current) onClose(); }}>
      <div dir={isRTL ? "rtl" : "ltr"} className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-[#ffffff] shadow-2xl sm:rounded-3xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#E6E8ED] bg-[#ffffff] px-5 py-4">
          <div>
            <h3 className="text-lg font-extrabold text-[#0B1F44]">{t("Request a subscription", "طلب اشتراك")}</h3>
            <p className="text-xs text-[#6b7a99]">{BRAND_NAME_FALLBACK}</p>
          </div>
          <button type="button" onClick={onClose} disabled={phase === "sending"} aria-label={t("Close", "إغلاق")} className="rounded-lg p-2 text-[#4b5b78] hover:bg-[#F4F6FA] disabled:opacity-40"><X size={20} /></button>
        </div>

        {phase === "done" ? (
          <div className="px-6 py-14 text-center" data-testid="sub-success">
            <CheckCircle2 size={56} className="mx-auto mb-4 text-[#16a34a]" />
            <h4 className="mb-2 text-xl font-extrabold text-[#0B1F44]">{t("Your request has been received", "تم استلام طلبك بنجاح")}</h4>
            <p className="mx-auto mb-6 max-w-md text-[#4b5b78]">{t("Thank you. Our team will contact you shortly to set up your account.", "شكرًا لك. سيتواصل معك فريقنا قريبًا لتجهيز حسابك.")}</p>
            <button type="button" onClick={onClose} className="rounded-xl bg-[#007BFF] px-8 py-3 font-bold text-[#ffffff] hover:bg-[#0062CC]">{t("Close", "إغلاق")}</button>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="grid gap-4 px-5 py-5 sm:grid-cols-2">
            <div>
              <label className={lbl} htmlFor="sr-country">{t("Country", "الدولة")} *</label>
              <select id="sr-country" className={inp(errs.country)} value={f.country} onChange={(e) => { set("country", e.target.value); set("city", ""); set("city_other", ""); }}>
                {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.flag} {t(c.en, c.ar)} (+{c.dial})</option>)}
              </select>
            </div>
            <div>
              <label className={lbl} htmlFor="sr-city">{t("City", "المدينة")} *</label>
              <select id="sr-city" className={inp(errs.city)} value={f.city} onChange={(e) => set("city", e.target.value)}>
                <option value="">{t("Select…", "اختر…")}</option>
                {(findCountry(f.country)?.cities ?? []).map((c) => <option key={c.id} value={c.id}>{t(c.en, c.ar)}</option>)}
                <option value={OTHER_CITY}>{t("Other…", "مدينة أخرى…")}</option>
              </select>
              <Err k="city" text={t("Select the city", "اختر المدينة")} />
            </div>
            {f.city === OTHER_CITY && (
              <div className="sm:col-span-2">
                <label className={lbl} htmlFor="sr-city-other">{t("City name", "اسم المدينة")} *</label>
                <input id="sr-city-other" className={inp(errs.city_other)} value={f.city_other} onChange={(e) => set("city_other", e.target.value)} maxLength={80} />
                <Err k="city_other" text={t("Enter the city name", "أدخل اسم المدينة")} />
              </div>
            )}
            <div>
              <label className={lbl} htmlFor="sr-biz">{t("Business name", "اسم المنشأة")} *</label>
              <input id="sr-biz" ref={firstRef} className={inp(errs.business_name)} value={f.business_name} onChange={(e) => set("business_name", e.target.value)} maxLength={120} autoComplete="organization" />
              <Err k="business_name" text={t("Enter the business name (2+ characters)", "أدخل اسم المنشأة (حرفان على الأقل)")} />
            </div>
            <div>
              <label className={lbl} htmlFor="sr-name">{t("Contact person", "اسم المسؤول")} *</label>
              <input id="sr-name" className={inp(errs.contact_name)} value={f.contact_name} onChange={(e) => set("contact_name", e.target.value)} maxLength={120} autoComplete="name" />
              <Err k="contact_name" text={t("Enter the contact name", "أدخل اسم المسؤول")} />
            </div>
            <div>
              <label className={lbl} htmlFor="sr-phone">{t("Mobile number", "رقم الجوال")} *</label>
              <div className="flex" dir="ltr">
                <span className="inline-flex shrink-0 items-center rounded-s-xl border border-e-0 border-[#d5dae5] bg-[#F4F6FA] px-3 text-sm font-bold text-[#0B1F44]" data-testid="dial-code">+{findCountry(f.country)?.dial ?? "966"}</span>
                <input id="sr-phone" dir="ltr" inputMode="tel" placeholder={f.country === "SA" ? "5xxxxxxxx" : t("Mobile number", "رقم الجوال")} className={`${inp(errs.phone)} rounded-s-none`} value={f.phone} onChange={(e) => set("phone", e.target.value)} autoComplete="tel-national" />
              </div>
              <Err k="phone" text={t("Enter a valid mobile number", "أدخل رقم جوال صحيحًا")} />
            </div>
            <div>
              <label className={lbl} htmlFor="sr-email">{t("Email", "البريد الإلكتروني")} *</label>
              <input id="sr-email" dir="ltr" type="email" inputMode="email" className={`${inp(errs.email)} ${isRTL ? "text-right" : ""}`} value={f.email} onChange={(e) => set("email", e.target.value)} maxLength={160} autoComplete="email" />
              <Err k="email" text={t("Enter a valid email", "أدخل بريدًا إلكترونيًا صحيحًا")} />
            </div>
            <div>
              <label className={lbl} htmlFor="sr-act">{t("Business activity", "النشاط التجاري")} *</label>
              <select id="sr-act" className={inp(errs.activity)} value={f.activity} onChange={(e) => set("activity", e.target.value)}>
                <option value="">{t("Select…", "اختر…")}</option>
                {ACTIVITIES.map((a) => <option key={a.id} value={a.id}>{t(a.en, a.ar)}</option>)}
              </select>
              <Err k="activity" text={t("Select the activity", "اختر النشاط التجاري")} />
            </div>
            <div>
              <label className={lbl} htmlFor="sr-br">{t("Number of branches", "عدد الفروع")} *</label>
              <input id="sr-br" dir="ltr" inputMode="numeric" className={`${inp(errs.branches_count)} ${isRTL ? "text-right" : ""}`} value={f.branches_count} onChange={(e) => set("branches_count", e.target.value)} />
              <Err k="branches_count" text={t("Enter a number from 1 to 500", "أدخل رقمًا من 1 إلى 500")} />
            </div>
            {f.activity === "other" && (
              <div className="sm:col-span-2">
                <label className={lbl} htmlFor="sr-other">{t("Describe your activity", "وصف النشاط")} *</label>
                <input id="sr-other" className={inp(errs.activity_other)} value={f.activity_other} onChange={(e) => set("activity_other", e.target.value)} maxLength={80} />
                <Err k="activity_other" text={t("Describe the activity (2+ characters)", "اكتب وصف النشاط (حرفان على الأقل)")} />
              </div>
            )}
            <div className="sm:col-span-2">
              <label className={lbl} htmlFor="sr-plan">{t("Subscription type", "نوع الاشتراك المطلوب")}</label>
              <select id="sr-plan" className={inp()} value={f.plan} onChange={(e) => set("plan", e.target.value as PlanId)}>
                {PLANS.map((p) => <option key={p.id} value={p.id}>{t(p.en, p.ar)}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className={lbl} htmlFor="sr-notes">{t("Additional notes", "ملاحظات إضافية")}</label>
              <textarea id="sr-notes" rows={3} className={inp(errs.notes)} value={f.notes} onChange={(e) => set("notes", e.target.value)} maxLength={1000} />
            </div>
            {/* honeypot: مخفي عن البشر */}
            <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", width: 1, height: 1, overflow: "hidden" }}>
              <label>Website<input tabIndex={-1} autoComplete="off" name="website" value={f.website} onChange={(e) => set("website", e.target.value)} /></label>
            </div>
            {msg && (
              <div className={`sm:col-span-2 flex items-start gap-2 rounded-xl px-4 py-3 text-sm font-semibold ${phase === "error" ? "bg-[#fdecec] text-[#b42318]" : "bg-[#fff6e5] text-[#8a5a00]"}`} role="alert">
                <AlertTriangle size={18} className="mt-0.5 shrink-0" /><span>{msg}</span>
              </div>
            )}
            <div className="sm:col-span-2 flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
              <button type="button" onClick={onClose} disabled={phase === "sending"} className="rounded-xl border border-[#d5dae5] px-6 py-3 font-bold text-[#4b5b78] hover:bg-[#F4F6FA] disabled:opacity-40">{t("Cancel", "إلغاء")}</button>
              <button type="submit" disabled={phase === "sending"} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#007BFF] px-8 py-3 font-bold text-[#ffffff] hover:bg-[#0062CC] disabled:cursor-not-allowed disabled:opacity-60" data-testid="sub-submit">
                {phase === "sending" && <Loader2 size={18} className="animate-spin" />}
                {phase === "sending" ? t("Sending…", "جارٍ الإرسال…") : t("Send request", "إرسال الطلب")}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
