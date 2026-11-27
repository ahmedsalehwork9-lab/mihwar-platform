// =============================================================
// src/pages/inventory/CategoryField.tsx — حقل «التصنيف» مع اقتراحات حسب نشاط الشركة.
// نص حر دائماً (يمكن كتابة أي تصنيف)؛ الاقتراحات أزرار تعبئ الحقل. اختيار النشاط اليدوي يُحفظ محلياً لكل شركة (تفضيل عرض فقط).
// =============================================================
import { useEffect, useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { ACTIVITY_PRESETS, GENERAL_PRESET, suggestCategories, normalizeText } from "./categorySuggestions";

type Props = {
  value: string; onChange: (v: string) => void;
  activityText: string | null; used: string[]; orgKey: string | number | null;
  lang: "ar" | "en"; t: (en: string, ar: string) => string; inputClass: string; placeholder: string; id?: string;
};
const KEY = (k: string | number | null) => `mihwar.catPreset.${k ?? "none"}`;

export default function CategoryField({ value, onChange, activityText, used, orgKey, lang, t, inputClass, placeholder, id }: Props) {
  const [presetId, setPresetId] = useState<string>("");
  useEffect(() => { try { setPresetId(localStorage.getItem(KEY(orgKey)) || ""); } catch { setPresetId(""); } }, [orgKey]);
  const choose = (v: string) => { setPresetId(v); try { if (v) localStorage.setItem(KEY(orgKey), v); else localStorage.removeItem(KEY(orgKey)); } catch { /* تفضيل عرض فقط */ } };

  const res = useMemo(() => suggestCategories({ activityText, presetId: presetId || null, used, query: "", lang, limit: 14 }), [activityText, presetId, used, lang]);
  const q = normalizeText(value);
  // أثناء الكتابة تُفلتر الاقتراحات؛ وإذا طابق الحقل اقتراحاً بالضبط (بعد اختياره) تبقى كل الاقتراحات ظاهرة لتبديلها
  const shown = useMemo(() => (!q || res.items.some((s) => normalizeText(s.label) === q) ? res.items : res.items.filter((s) => normalizeText(s.label).includes(q))), [res.items, q]);
  const caption = res.detected
    ? t(`Suggested for: ${lang === "ar" ? res.preset.ar : res.preset.en}`, `مقترحة لنشاط: ${res.preset.ar}`)
    : t("General suggestions — pick your activity for better ones", "اقتراحات عامة — اختر نشاطك لاقتراحات أدق");

  return (
    <div data-testid="cat-field">
      <input id={id} type="text" data-testid="cat-input" className={inputClass} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoComplete="off" />
      <div className="mt-2 flex items-center justify-between gap-2 flex-wrap">
        <span data-testid="cat-caption" className="text-[11px] text-slate-400 inline-flex items-center gap-1"><Sparkles size={11} className="text-emerald-400" />{caption}</span>
        <select data-testid="cat-preset" aria-label={t("Business activity for suggestions", "نشاط الاقتراحات")} value={presetId} onChange={(e) => choose(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-lg text-[11px] text-slate-300 px-2 py-1">
          <option value="">{t("Auto (from company)", "تلقائي (من الشركة)")}</option>
          {ACTIVITY_PRESETS.map((p) => <option key={p.id} value={p.id}>{lang === "ar" ? p.ar : p.en}</option>)}
          <option value={GENERAL_PRESET.id}>{lang === "ar" ? GENERAL_PRESET.ar : GENERAL_PRESET.en}</option>
        </select>
      </div>
      {shown.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label={t("Category suggestions", "تصنيفات مقترحة")}>
          {shown.map((s) => {
            const on = normalizeText(s.label) === q;
            return (
              <button key={s.source + s.label} type="button" data-testid="cat-chip" data-source={s.source} aria-pressed={on} onClick={() => onChange(s.label)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors ${on ? "bg-emerald-600 text-white border-emerald-500" : s.source === "used" ? "bg-slate-800 text-slate-200 border-slate-600 hover:border-emerald-500" : "bg-slate-900 text-slate-300 border-slate-700 hover:border-emerald-500"}`}>
                {s.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
