// =============================================================
// src/pages/CompanySettingsPage.tsx
// إعدادات الشركة (الدولة/العملة/التوقيت/اللغة/الضريبة) — ثنائية اللغة.
// إعداد على مستوى الشركة (organizations). العملة طبقة عرض فقط.
// =============================================================
import { useEffect, useState } from "react";
import { Globe, Save, Building2, CheckCircle2, Info } from "lucide-react";
import { useLang } from "../context/LanguageContext";
import { useOrgConfig } from "../context/OrgConfigContext";
import { OrgConfig, COUNTRY_PRESETS, saveOrgConfig } from "./lib/orgConfig";

const CARD = "bg-slate-900 border border-slate-800 rounded-2xl";

export default function CompanySettingsPage() {
  const { t, isRTL, lang } = useLang();
  const { cfg, reload } = useOrgConfig();
  const [form, setForm] = useState<OrgConfig>(cfg);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: "ok" | "err"; x: string } | null>(null);

  useEffect(() => { setForm(cfg); }, [cfg]);
  const set = (p: Partial<OrgConfig>) => setForm((f) => ({ ...f, ...p }));

  const applyCountry = (c: string) => {
    const p = COUNTRY_PRESETS[c];
    if (!p) { set({ country: c }); return; }
    set({ country: p.country!, currency: p.currency!, currency_symbol: p.currency_symbol!, timezone: p.timezone!, default_tax_rate: p.default_tax_rate! });
  };

  const save = async () => {
    if (!form.orgId) { setMsg({ t: "err", x: t("Current branch is not linked to a company.", "الفرع الحالي غير مرتبط بشركة.") }); return; }
    setBusy(true); setMsg(null);
    const r = await saveOrgConfig(form.orgId, form);
    setBusy(false);
    if (r.ok) { setMsg({ t: "ok", x: t("Saved. Currency and formats now follow this company.", "تم الحفظ. العملة والتنسيقات تتبع هذه الشركة الآن.") }); reload(); }
    else setMsg({ t: "err", x: (r.error || "").includes("column") ? t("Run the SQL migration first (09_org_country_config).", "شغّل هجرة SQL أولًا (09_org_country_config).") : t("Save failed: ", "فشل الحفظ: ") + r.error });
  };

  const inp = "w-full bg-slate-950 border border-slate-700 rounded-xl text-white px-3 py-2 text-sm outline-none focus:border-blue-500";
  const lbl = "text-[11px] text-slate-500 font-bold block mb-1";
  const Field = ({ label, children }: any) => <div><label className={lbl}>{label}</label>{children}</div>;

  return (
    <div className="p-4 lg:p-6 min-h-screen" dir={isRTL ? "rtl" : "ltr"}>
      <header className="flex items-center gap-3 mb-5">
        <span className="w-11 h-11 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-400"><Globe size={22} /></span>
        <div>
          <h1 className="text-2xl font-black text-white leading-tight">{t("Company Settings", "إعدادات الشركة")}</h1>
          <p className="text-slate-500 text-xs mt-0.5">{t("Country, currency, timezone, language and tax — per company.", "الدولة والعملة والتوقيت واللغة والضريبة — لكل شركة.")}</p>
        </div>
      </header>

      {msg && <div className={`mb-4 rounded-xl px-4 py-2.5 text-sm font-bold border ${msg.t === "ok" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300" : "bg-amber-500/10 border-amber-500/20 text-amber-300"}`}>{msg.t === "ok" ? "✓ " : "⚠️ "}{msg.x}</div>}

      <div className={`${CARD} p-4 max-w-3xl space-y-4`}>
        <div className="flex items-center gap-2 text-sm font-bold text-slate-200 pb-2 border-b border-slate-800"><Building2 size={16} className="text-blue-400" /> {t("Localization", "التوطين")}</div>

        {/* الدولة presets */}
        <Field label={t("Country (applies a preset)", "الدولة (تطبّق إعدادًا جاهزًا)")}>
          <div className="flex flex-wrap gap-2">
            {Object.entries(COUNTRY_PRESETS).map(([k, p]) => (
              <button key={k} onClick={() => applyCountry(k)} className={`px-3 py-1.5 rounded-xl text-xs font-bold border ${form.country === k ? "bg-blue-600 text-white border-blue-500" : "bg-slate-800/40 text-slate-300 border-slate-700 hover:text-white"}`}>{lang === "ar" ? p.ar : p.en}</button>
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label={t("Currency code", "رمز العملة")}><input value={form.currency} onChange={(e) => set({ currency: e.target.value.toUpperCase() })} className={inp} placeholder="SAR / EGP" /></Field>
          <Field label={t("Currency symbol (display)", "رمز العرض للعملة")}><input value={form.currency_symbol} onChange={(e) => set({ currency_symbol: e.target.value })} className={inp} placeholder="ر.س / ج.م" /></Field>
          <Field label={t("Timezone", "المنطقة الزمنية")}><input value={form.timezone} onChange={(e) => set({ timezone: e.target.value })} className={inp} placeholder="Asia/Riyadh" /></Field>
          <Field label={t("Default tax rate %", "نسبة الضريبة الافتراضية %")}><input type="number" step="0.01" value={form.default_tax_rate} onChange={(e) => set({ default_tax_rate: Number(e.target.value) || 0 })} className={inp} /></Field>
          <Field label={t("Default language", "اللغة الافتراضية")}><select value={form.default_language} onChange={(e) => set({ default_language: e.target.value })} className={inp}><option value="ar">العربية</option><option value="en">English</option></select></Field>
          <Field label={t("Digit style", "شكل الأرقام")}><select value={form.number_format} onChange={(e) => set({ number_format: e.target.value as any })} className={inp}><option value="en">1234 (English)</option><option value="ar">١٢٣٤ (عربي)</option></select></Field>
          <Field label={t("Fiscal year start (month)", "بداية السنة المالية (شهر)")}><input type="number" min={1} max={12} value={form.fiscal_year_start} onChange={(e) => set({ fiscal_year_start: Number(e.target.value) || 1 })} className={inp} /></Field>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-300 bg-slate-950/40 rounded-xl p-3 cursor-pointer">
          <input type="checkbox" checked={form.is_internal} onChange={(e) => set({ is_internal: e.target.checked })} className="accent-blue-500 w-4 h-4" />
          <span>{t("Internal pilot company", "شركة تجريبية داخلية")}</span>
          <span className="text-[11px] text-slate-500">— {t("excluded from commercial customer/subscription KPIs", "تُستبعَد من مؤشرات العملاء والاشتراكات التجارية")}</span>
        </label>

        <div className="flex items-center gap-2 text-[11px] text-slate-500 bg-slate-950/40 rounded-xl p-2.5"><Info size={14} className="shrink-0 text-blue-400" /> {t("Currency is display-only — no stored accounting value is changed.", "العملة طبقة عرض فقط — لا تُغيَّر أي قيمة محاسبية مخزّنة.")}</div>

        <div className="flex items-center justify-between pt-2 border-t border-slate-800">
          <span className="text-[11px] text-slate-500">{t("Preview:", "معاينة:")} <b className="text-slate-300 [direction:ltr] inline-block">1,250.00 {form.currency_symbol}</b></span>
          <button onClick={save} disabled={busy} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-500 disabled:opacity-50">{busy ? <CheckCircle2 size={16} className="animate-pulse" /> : <Save size={16} />} {t("Save", "حفظ")}</button>
        </div>
      </div>
    </div>
  );
}
