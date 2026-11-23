// =============================================================
// src/pages/AddCustomerWizard.tsx
// معالج إنشاء عميل (Company Tenant) — 4 خطوات · ثنائي اللغة (ar/en) · RTL/LTR.
// يعيد استخدام Edge Function (create-shop) التي تنشئ المستخدم + المؤسسة + المحل
// بأمان من الخادم. لا شركة فعلية تُنشأ إلا عند التأكيد النهائي. مسودة محفوظة بالمتصفح.
// يتدرّج بأمان: لو الدالة لم تُحدَّث بعد، يُنشأ المحل+المدير ويُنبَّه لضبط الإعدادات لاحقًا.
// =============================================================
import { useEffect, useMemo, useState } from "react";
import {
  Building2, Globe, UserCog, CreditCard, Check, ChevronRight, ChevronLeft,
  Save, Loader2, CheckCircle2, AlertTriangle, Eye, Plus,
} from "lucide-react";
import { useLang } from "../context/LanguageContext";
import { supabase } from "./lib/supabase";
import { COUNTRY_PRESETS } from "./lib/orgConfig";

type Form = {
  // Step 1 — Company
  companyName: string; legalName: string; country: string; businessActivity: string; businessType: string;
  crNumber: string; taxNumber: string; address: string; city: string; contactPhone: string; companyEmail: string;
  // Step 2 — Config
  currency: string; currencySymbol: string; timezone: string; defaultLanguage: string;
  numberFormat: string; fiscalYearStart: number; defaultTaxRate: number;
  // Step 3 — Admin
  adminName: string; adminEmail: string; adminPhone: string; password: string; confirmPassword: string;
  // Step 4 — Subscription
  plan: string; subscriptionStatus: string; trialDuration: number; trialStart: string; maxUsers: number; internalNotes: string;
};

const BLANK: Form = {
  companyName: "", legalName: "", country: "SA", businessActivity: "", businessType: "",
  crNumber: "", taxNumber: "", address: "", city: "", contactPhone: "", companyEmail: "",
  currency: "SAR", currencySymbol: "ر.س", timezone: "Asia/Riyadh", defaultLanguage: "ar",
  numberFormat: "en", fiscalYearStart: 1, defaultTaxRate: 15,
  adminName: "", adminEmail: "", adminPhone: "", password: "", confirmPassword: "",
  plan: "trial", subscriptionStatus: "trial", trialDuration: 30, trialStart: new Date().toISOString().slice(0, 10), maxUsers: 5, internalNotes: "",
};

const DRAFT_KEY = "mihwar_customer_wizard_draft";
const BUSINESS_TYPES = ["sole_proprietor", "company", "establishment", "other"];
const TRIAL_OPTS = [15, 30, 45, 60, 90, 120];
const addDays = (d: string, n: number) => { const t = new Date(d + "T00:00:00"); t.setDate(t.getDate() + n); return t.toISOString().slice(0, 10); };

export default function AddCustomerWizard({ onNavigate }: { onNavigate?: (p: any) => void }) {
  const { t, isRTL, lang } = useLang();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<Form>(() => { try { return { ...BLANK, ...JSON.parse(localStorage.getItem(DRAFT_KEY) || "{}") }; } catch { return BLANK; } });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<null | { ok: boolean; companyId: number | null; shopId: number | null; partial: boolean; msg?: string }>(null);

  const set = (p: Partial<Form>) => setForm((f) => ({ ...f, ...p }));
  // حفظ المسودة تلقائيًا (بلا كلمات المرور)
  useEffect(() => {
    const { password, confirmPassword, ...safe } = form;
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(safe)); } catch { /* */ }
  }, [form]);

  const applyCountry = (c: string) => {
    const p = COUNTRY_PRESETS[c];
    if (!p) { set({ country: c }); return; }
    set({ country: c, currency: p.currency!, currencySymbol: p.currency_symbol!, timezone: p.timezone!, defaultTaxRate: p.default_tax_rate! });
  };
  const trialEnd = useMemo(() => addDays(form.trialStart, form.trialDuration), [form.trialStart, form.trialDuration]);

  const STEPS = [
    { n: 1, en: "Company", ar: "الشركة", icon: Building2 },
    { n: 2, en: "Configuration", ar: "الإعدادات", icon: Globe },
    { n: 3, en: "Administrator", ar: "المدير", icon: UserCog },
    { n: 4, en: "Subscription", ar: "الاشتراك", icon: CreditCard },
  ];

  const validate = (s: number): boolean => {
    const e: Record<string, string> = {};
    const req = t("Required", "مطلوب");
    if (s === 1) {
      if (!form.companyName.trim()) e.companyName = req;
      if (!form.country) e.country = req;
      if (!form.businessActivity.trim()) e.businessActivity = req;
    }
    if (s === 2) { if (!form.currency.trim()) e.currency = req; if (!form.timezone.trim()) e.timezone = req; }
    if (s === 3) {
      if (!form.adminName.trim()) e.adminName = req;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.adminEmail)) e.adminEmail = t("Invalid email", "بريد غير صالح");
      if (form.password.length < 6) e.password = t("At least 6 characters", "٦ أحرف على الأقل");
      if (form.password !== form.confirmPassword) e.confirmPassword = t("Passwords do not match", "كلمتا المرور غير متطابقتين");
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };
  const next = () => { if (validate(step)) setStep((s) => Math.min(4, s + 1)); };
  const prev = () => setStep((s) => Math.max(1, s - 1));

  const submit = async () => {
    if (!validate(1) || !validate(3)) { setStep(!validate(1) ? 1 : 3); return; }
    setBusy(true);
    try {
      const company = {
        name: form.companyName.trim(), legal_name: form.legalName || null,
        business_activity: form.businessActivity || null, business_type: form.businessType || null, tax_number: form.taxNumber || null,
        country: form.country, currency: form.currency, currency_symbol: form.currencySymbol, timezone: form.timezone,
        default_language: form.defaultLanguage, number_format: form.numberFormat, fiscal_year_start: form.fiscalYearStart, default_tax_rate: form.defaultTaxRate,
        plan: form.plan, subscription_status: form.subscriptionStatus,
        trial_started_at: form.trialStart, trial_ends_at: trialEnd, max_users: form.maxUsers, internal_notes: form.internalNotes || null, is_internal: false,
      };
      const payload = {
        shop_name: form.companyName.trim(), owner_name: form.adminName.trim(),
        email: form.adminEmail.trim(), password: form.password,
        phone: form.adminPhone || form.contactPhone || null, city: form.city || null,
        address: form.address || null, commercial_registration: form.crNumber || null,
        company,
      };
      const { data, error } = await supabase.functions.invoke("create-shop", { body: payload });
      if (error || !data?.success) {
        const detail = data?.error || error?.message || t("Creation failed", "فشل الإنشاء");
        setDone({ ok: false, companyId: null, shopId: null, partial: false, msg: String(detail) });
        return;
      }
      // رفع الشعار (إن وُجد)
      if (logoFile && data.shop_id) {
        try {
          const ext = logoFile.name.split(".").pop();
          const path = `shop-${data.shop_id}/logo.${ext}`;
          await supabase.storage.from("shop-logos").upload(path, logoFile, { upsert: true });
          const { data: pub } = supabase.storage.from("shop-logos").getPublicUrl(path);
          if (pub?.publicUrl) await supabase.from("shops").update({ logo_url: pub.publicUrl }).eq("id", data.shop_id);
        } catch (_) { /* best-effort */ }
      }
      // تدرّج آمن: لو الدالة القديمة (بلا organization_id) — نجح العميل لكن الإعدادات لم تُطبَّق
      const partial = data.organization_id == null;
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* */ }
      setDone({ ok: true, companyId: data.organization_id ?? null, shopId: data.shop_id ?? null, partial });
    } catch (err: any) {
      setDone({ ok: false, companyId: null, shopId: null, partial: false, msg: String(err?.message || err) });
    } finally { setBusy(false); }
  };

  const resetAll = () => { setForm(BLANK); setLogoFile(null); setErrors({}); setDone(null); setStep(1); try { localStorage.removeItem(DRAFT_KEY); } catch { /* */ } };

  // ── عناصر ──
  const inp = "w-full bg-slate-950 border border-slate-700 rounded-xl text-white px-3 py-2.5 text-sm outline-none focus:border-blue-500";
  const lbl = "text-[11px] text-slate-400 font-bold block mb-1.5";
  const Field = ({ k, label, children, req }: any) => (
    <div><label className={lbl}>{label}{req && <span className="text-red-400"> *</span>}</label>{children}{errors[k] && <p className="text-[11px] text-red-400 mt-1">{errors[k]}</p>}</div>
  );
  const Txt = ({ k, type = "text", ph }: any) => (
    <input type={type} value={(form as any)[k]} onChange={(e) => set({ [k]: e.target.value } as any)} placeholder={ph} className={`${inp} ${errors[k] ? "border-red-500/60" : ""}`} dir={type === "email" || type === "tel" || type === "password" ? "ltr" : undefined} />
  );

  // ── شاشة النجاح ──
  if (done?.ok) {
    return (
      <div className="p-4 lg:p-6 min-h-screen flex items-start justify-center" dir={isRTL ? "rtl" : "ltr"}>
        <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6 mt-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto mb-3"><CheckCircle2 size={34} /></div>
          <h1 className="text-2xl font-black text-white">{t("Customer created", "تم إنشاء العميل")}</h1>
          <p className="text-slate-500 text-sm mt-1">{t("The company and its administrator are ready.", "الشركة ومديرها جاهزان.")}</p>
          {done.partial && (
            <div className="mt-3 flex items-start gap-2 text-right px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" /> {t("The company settings function isn't updated yet — the admin + branch were created; set country/currency from System Settings, or deploy the updated create-shop function for full automation.", "دالة إنشاء الشركة لم تُحدَّث بعد — أُنشئ المدير والفرع؛ اضبط الدولة/العملة من «إعدادات النظام»، أو انشر دالة create-shop المحدّثة للأتمتة الكاملة.")}
            </div>
          )}
          <div className="mt-4 text-start space-y-2 bg-slate-950/40 rounded-xl p-4 text-sm">
            <Row l={t("Company", "الشركة")} v={form.companyName} />
            <Row l={t("Administrator", "المدير")} v={form.adminName} />
            <Row l={t("Email", "البريد")} v={<span className="[direction:ltr]">{form.adminEmail}</span>} />
            <Row l={t("Plan / Status", "الباقة / الحالة")} v={`${form.plan} · ${form.subscriptionStatus}`} />
            <Row l={t("Trial ends", "نهاية التجربة")} v={<span className="[direction:ltr]">{trialEnd}</span>} />
            <Row l={t("Company ID", "معرّف الشركة")} v={<span className="[direction:ltr] font-mono">{done.companyId ?? "—"}</span>} />
          </div>
          <div className="flex gap-2 mt-5">
            <button onClick={() => onNavigate?.("system-settings")} className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-500"><Eye size={15} /> {t("View / Settings", "عرض / الإعدادات")}</button>
            <button onClick={resetAll} className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-800 text-slate-200 text-sm font-bold hover:bg-slate-700"><Plus size={15} /> {t("Create another", "إنشاء عميل آخر")}</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 min-h-screen" dir={isRTL ? "rtl" : "ltr"}>
      <header className="mb-5">
        <h1 className="text-2xl font-black text-white">{t("Add New Customer", "إنشاء عميل جديد")}</h1>
        <p className="text-slate-500 text-xs mt-0.5">{t("Create a company tenant and set up its account.", "أنشئ شركة جديدة وهيّئ حسابها داخل النظام.")}</p>
      </header>

      {/* مؤشر التقدّم */}
      <div className="flex items-center gap-2 mb-5 max-w-3xl">
        {STEPS.map((s, i) => { const SI = s.icon; const active = step === s.n; const doneStep = step > s.n; return (
          <div key={s.n} className="flex items-center gap-2 flex-1">
            <button onClick={() => s.n < step && setStep(s.n)} className={`flex items-center gap-2 ${s.n < step ? "cursor-pointer" : "cursor-default"}`}>
              <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${active ? "bg-blue-600 text-white" : doneStep ? "bg-emerald-500/20 text-emerald-400" : "bg-slate-800 text-slate-500"}`}>{doneStep ? <Check size={16} /> : <SI size={16} />}</span>
              <span className={`text-xs font-bold hidden sm:block ${active ? "text-white" : "text-slate-500"}`}>{lang === "ar" ? s.ar : s.en}</span>
            </button>
            {i < STEPS.length - 1 && <div className={`h-0.5 flex-1 rounded ${doneStep ? "bg-emerald-500/40" : "bg-slate-800"}`} />}
          </div>
        ); })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4 max-w-5xl">
        {/* النموذج */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          {step === 1 && (
            <>
              <h2 className="text-sm font-black text-white flex items-center gap-2"><Building2 size={16} className="text-blue-400" /> {t("Company Information", "بيانات الشركة")}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field k="companyName" label={t("Trade name", "الاسم التجاري")} req><Txt k="companyName" /></Field>
                <Field k="legalName" label={t("Legal name", "الاسم القانوني")}><Txt k="legalName" /></Field>
                <Field k="country" label={t("Country", "الدولة")} req>
                  <div className="flex flex-wrap gap-1.5">{Object.entries(COUNTRY_PRESETS).map(([k, p]) => (
                    <button key={k} type="button" onClick={() => applyCountry(k)} className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border ${form.country === k ? "bg-blue-600 text-white border-blue-500" : "bg-slate-800/40 text-slate-300 border-slate-700"}`}>{lang === "ar" ? p.ar : p.en}</button>
                  ))}</div>
                </Field>
                <Field k="businessActivity" label={t("Business activity", "النشاط التجاري")} req><Txt k="businessActivity" ph={t("e.g. Auto parts", "مثال: قطع غيار")} /></Field>
                <Field k="businessType" label={t("Business type", "نوع المنشأة")}>
                  <select value={form.businessType} onChange={(e) => set({ businessType: e.target.value })} className={inp}>
                    <option value="">—</option>
                    {BUSINESS_TYPES.map((b) => <option key={b} value={b}>{t(b === "sole_proprietor" ? "Sole proprietor" : b === "company" ? "Company" : b === "establishment" ? "Establishment" : "Other", b === "sole_proprietor" ? "مؤسسة فردية" : b === "company" ? "شركة" : b === "establishment" ? "مؤسسة" : "أخرى")}</option>)}
                  </select>
                </Field>
                <Field k="crNumber" label={t("Commercial registration", "السجل التجاري")}><Txt k="crNumber" /></Field>
                <Field k="taxNumber" label={t("Tax number", "الرقم الضريبي")}><Txt k="taxNumber" /></Field>
                <Field k="city" label={t("City", "المدينة")}><Txt k="city" /></Field>
                <Field k="contactPhone" label={t("Contact number", "رقم التواصل")}><Txt k="contactPhone" type="tel" /></Field>
                <Field k="companyEmail" label={t("Company email", "بريد الشركة")}><Txt k="companyEmail" type="email" /></Field>
                <div className="sm:col-span-2"><Field k="address" label={t("Address", "العنوان")}><Txt k="address" /></Field></div>
                <div className="sm:col-span-2"><Field k="logo" label={t("Company logo", "شعار الشركة")}>
                  <input type="file" accept="image/*" onChange={(e) => setLogoFile(e.target.files?.[0] || null)} className="text-xs text-slate-400 file:me-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-slate-800 file:text-slate-200" />
                </Field></div>
              </div>
              <p className="text-[11px] text-slate-600">{t("Tax/CR requirements differ by country — leave blank if not applicable.", "متطلبات الضريبة/السجل تختلف بين الدول — اتركها فارغة إن لم تلزم.")}</p>
            </>
          )}

          {step === 2 && (
            <>
              <h2 className="text-sm font-black text-white flex items-center gap-2"><Globe size={16} className="text-blue-400" /> {t("System Configuration", "إعدادات النظام")}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field k="currency" label={t("Currency code", "رمز العملة")} req><Txt k="currency" /></Field>
                <Field k="currencySymbol" label={t("Currency symbol", "رمز العرض")}><Txt k="currencySymbol" /></Field>
                <Field k="timezone" label={t("Timezone", "المنطقة الزمنية")} req><Txt k="timezone" /></Field>
                <Field k="defaultTaxRate" label={t("Default tax rate %", "الضريبة الافتراضية %")}><input type="number" step="0.01" value={form.defaultTaxRate} onChange={(e) => set({ defaultTaxRate: Number(e.target.value) || 0 })} className={inp} /></Field>
                <Field k="defaultLanguage" label={t("Default language", "اللغة الافتراضية")}><select value={form.defaultLanguage} onChange={(e) => set({ defaultLanguage: e.target.value })} className={inp}><option value="ar">العربية</option><option value="en">English</option></select></Field>
                <Field k="numberFormat" label={t("Digit style", "شكل الأرقام")}><select value={form.numberFormat} onChange={(e) => set({ numberFormat: e.target.value })} className={inp}><option value="en">1234</option><option value="ar">١٢٣٤</option></select></Field>
                <Field k="fiscalYearStart" label={t("Fiscal year start (month)", "بداية السنة المالية (شهر)")}><input type="number" min={1} max={12} value={form.fiscalYearStart} onChange={(e) => set({ fiscalYearStart: Number(e.target.value) || 1 })} className={inp} /></Field>
              </div>
              <p className="text-[11px] text-slate-600">{t("Defaults follow the selected country; adjust as needed. No tax-law compliance is implied.", "القيم تتبع الدولة المختارة؛ عدّلها حسب الحاجة. لا يُقصد أي امتثال ضريبي.")}</p>
            </>
          )}

          {step === 3 && (
            <>
              <h2 className="text-sm font-black text-white flex items-center gap-2"><UserCog size={16} className="text-blue-400" /> {t("Administrator", "مدير الشركة")}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field k="adminName" label={t("Full name", "الاسم الكامل")} req><Txt k="adminName" /></Field>
                <Field k="adminEmail" label={t("Email", "البريد الإلكتروني")} req><Txt k="adminEmail" type="email" /></Field>
                <Field k="adminPhone" label={t("Phone", "رقم الجوال")}><Txt k="adminPhone" type="tel" /></Field>
                <div className="hidden sm:block" />
                <Field k="password" label={t("Password", "كلمة المرور")} req><Txt k="password" type="password" /></Field>
                <Field k="confirmPassword" label={t("Confirm password", "تأكيد كلمة المرور")} req><Txt k="confirmPassword" type="password" /></Field>
              </div>
              <p className="text-[11px] text-slate-600">{t("The admin gets company-owner role (not platform admin). Password is never stored in plain text.", "يُمنح المدير صلاحية مالك الشركة (ليس أدمن المنصة). كلمة المرور لا تُخزَّن كنص صريح.")}</p>
            </>
          )}

          {step === 4 && (
            <>
              <h2 className="text-sm font-black text-white flex items-center gap-2"><CreditCard size={16} className="text-blue-400" /> {t("Subscription & Review", "الاشتراك والمراجعة")}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field k="plan" label={t("Plan", "الباقة")}><select value={form.plan} onChange={(e) => set({ plan: e.target.value })} className={inp}><option value="trial">{t("Trial", "تجريبي")}</option><option value="standard">{t("Standard", "قياسي")}</option><option value="pro">{t("Professional", "احترافي")}</option></select></Field>
                <Field k="subscriptionStatus" label={t("Status", "الحالة")}><select value={form.subscriptionStatus} onChange={(e) => set({ subscriptionStatus: e.target.value })} className={inp}><option value="trial">{t("Trial", "تجريبي")}</option><option value="active">{t("Active", "نشط")}</option></select></Field>
                <Field k="trialDuration" label={t("Trial duration (days)", "مدة التجربة (أيام)")}>
                  <div className="flex flex-wrap gap-1.5">
                    {TRIAL_OPTS.map((d) => <button key={d} type="button" onClick={() => set({ trialDuration: d })} className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border ${form.trialDuration === d ? "bg-blue-600 text-white border-blue-500" : "bg-slate-800/40 text-slate-300 border-slate-700"}`}>{d}</button>)}
                    <input type="number" min={1} value={form.trialDuration} onChange={(e) => set({ trialDuration: Number(e.target.value) || 0 })} className={`${inp} w-20 text-center`} />
                  </div>
                </Field>
                <Field k="trialStart" label={t("Trial start", "بداية التجربة")}><input type="date" value={form.trialStart} onChange={(e) => set({ trialStart: e.target.value })} className={`${inp} [color-scheme:dark]`} /></Field>
                <Field k="maxUsers" label={t("Maximum users", "عدد المستخدمين")}><input type="number" min={1} value={form.maxUsers} onChange={(e) => set({ maxUsers: Number(e.target.value) || 1 })} className={inp} /></Field>
                <Field k="trialEnd" label={t("Trial ends", "نهاية التجربة")}><input value={trialEnd} readOnly className={`${inp} opacity-70 [color-scheme:dark]`} /></Field>
                <div className="sm:col-span-2"><Field k="internalNotes" label={t("Internal notes", "ملاحظات داخلية")}><textarea value={form.internalNotes} onChange={(e) => set({ internalNotes: e.target.value })} rows={2} className={inp} /></Field></div>
              </div>
            </>
          )}

          {/* أزرار */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-800">
            <button onClick={prev} disabled={step === 1} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-sm font-bold disabled:opacity-40">{isRTL ? <ChevronRight size={15} /> : <ChevronLeft size={15} />} {t("Previous", "السابق")}</button>
            <span className="text-[11px] text-slate-600 inline-flex items-center gap-1"><Save size={12} /> {t("Draft auto-saved", "المسودة محفوظة تلقائيًا")}</span>
            {step < 4 ? (
              <button onClick={next} className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-500">{t("Next", "التالي")} {isRTL ? <ChevronLeft size={15} /> : <ChevronRight size={15} />}</button>
            ) : (
              <button onClick={submit} disabled={busy} className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-500 disabled:opacity-60">{busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} {t("Create company", "إنشاء الشركة")}</button>
            )}
          </div>
          {done && !done.ok && <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs"><AlertTriangle size={14} className="shrink-0 mt-0.5" /> {t("Could not create the customer. ", "تعذّر إنشاء العميل. ")}{done.msg}</div>}
        </div>

        {/* الملخص الجانبي */}
        <aside className="bg-slate-900 border border-slate-800 rounded-2xl p-4 h-fit">
          <div className="text-xs font-bold text-slate-400 mb-3">{t("Summary", "الملخص")}</div>
          <div className="space-y-2 text-sm">
            <Row l={t("Company", "الشركة")} v={form.companyName || "—"} />
            <Row l={t("Country", "الدولة")} v={COUNTRY_PRESETS[form.country] ? (lang === "ar" ? COUNTRY_PRESETS[form.country].ar : COUNTRY_PRESETS[form.country].en) : form.country} />
            <Row l={t("Currency", "العملة")} v={<span className="[direction:ltr]">{form.currencySymbol} ({form.currency})</span>} />
            <Row l={t("Tax", "الضريبة")} v={`${form.defaultTaxRate}%`} />
            <Row l={t("Administrator", "المدير")} v={form.adminName || "—"} />
            <Row l={t("Plan", "الباقة")} v={form.plan} />
            <Row l={t("Trial ends", "نهاية التجربة")} v={<span className="[direction:ltr]">{trialEnd}</span>} />
          </div>
        </aside>
      </div>
    </div>
  );
}

function Row({ l, v }: { l: string; v: any }) {
  return <div className="flex items-center justify-between gap-3"><span className="text-[11px] text-slate-500">{l}</span><span className="text-slate-200 text-sm font-bold text-end truncate">{v}</span></div>;
}
