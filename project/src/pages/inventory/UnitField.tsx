// =============================================================
// src/pages/inventory/UnitField.tsx
// حقل «وحدة القياس» لنافذة إضافة/تعديل الصنف: قائمة وحدات شائعة + «أخرى» لكتابة وحدة حرة.
// القيمة تُخزَّن نصًّا في products.attributes.unit (ما تقرؤه فاتورة المبيعات أصلًا) — بلا تغيير في قاعدة البيانات.
// Unit-of-measure picker: common units + free text. Stored in products.attributes.unit.
// =============================================================
import { useMemo } from "react";

export const UNIT_PRESETS: { ar: string; en: string }[] = [
  { ar: "قطعة", en: "Piece" }, { ar: "علبة", en: "Box" }, { ar: "كرتون", en: "Carton" }, { ar: "عبوة", en: "Pack" },
  { ar: "طقم", en: "Set" }, { ar: "زوج", en: "Pair" }, { ar: "دزينة", en: "Dozen" }, { ar: "رول", en: "Roll" },
  { ar: "لتر", en: "Liter" }, { ar: "جالون", en: "Gallon" }, { ar: "كيلو", en: "Kg" }, { ar: "جرام", en: "Gram" }, { ar: "متر", en: "Meter" },
];

const OTHER = "__other__";

type Props = {
  value: string; onChange: (v: string) => void; lang: "ar" | "en";
  t: (en: string, ar: string) => string; inputClass: string; id?: string;
};

/** القيمة المخزَّنة قد تكون بالعربية أو الإنجليزية: نطابقها مع أي لغة ونعرضها بلغة الواجهة. */
export function matchUnit(v: string): { ar: string; en: string } | null {
  const x = v.trim().toLowerCase();
  if (!x) return null;
  return UNIT_PRESETS.find((u) => u.ar === v.trim() || u.en.toLowerCase() === x) ?? null;
}

export default function UnitField({ value, onChange, lang, t, inputClass, id }: Props) {
  const matched = useMemo(() => matchUnit(value), [value]);
  const custom = value.trim() !== "" && !matched;
  const selectVal = custom ? OTHER : matched ? matched[lang] : value === OTHER ? OTHER : "";
  return (
    <div data-testid="unit-field">
      <select id={id} data-testid="unit-select" className={inputClass} value={selectVal}
        onChange={(e) => { const v = e.target.value; onChange(v === OTHER ? " " : v); }}>
        <option value="">{t("— None —", "— بدون —")}</option>
        {UNIT_PRESETS.map((u) => <option key={u.ar} value={u[lang]}>{u[lang]}</option>)}
        <option value={OTHER}>{t("Other…", "أخرى…")}</option>
      </select>
      {(custom || value === " ") && (
        <input data-testid="unit-custom" type="text" autoFocus className={inputClass + " mt-2"} value={value.trimStart()} maxLength={30}
          onChange={(e) => onChange(e.target.value)} placeholder={t("Type the unit", "اكتب وحدة القياس")} />
      )}
    </div>
  );
}
