// =============================================================
// src/pages/lib/chartCountries.ts — دليل الحسابات حسب دولة الشركة.
// الأساس = STANDARD_CHART (الأكواد ثابتة لأن أجزاء من النظام تعتمد عليها: 1101/1104/1209/5211/1106/2103…).
// لكل دولة: إعادة تسمية بنود + إضافة حسابات خاصة بالنظام الضريبي والعمالي (تأمينات، نهاية الخدمة، ضريبة الدخل/الزكاة…) بأكواد جديدة غير مستعملة.
// دالة نقية بلا اعتماد على Supabase لتُختبر منفردة. المحاسب المختص يراجع الأسماء قبل الاعتماد.
// =============================================================
export type ChartAccType = "asset" | "liability" | "equity" | "revenue" | "expense";
export type ChartSeedRow = { code: string; name: string; type: ChartAccType; is_group: boolean; parent: string | null };
type Add = [code: string, name: string, type: ChartAccType, parent: string];

export type ChartCountryInfo = { code: string; ar: string; en: string; supported: boolean };
const L = (code: string, name: string, parent: string): Add => [code, name, "liability", parent];
const E = (code: string, name: string): Add => [code, name, "expense", "52"];
const Q = (code: string, name: string): Add => [code, name, "equity", "3"];

type Overlay = { ar: string; en: string; rename: Record<string, string>; add: Add[] };

const OVERLAYS: Record<string, Overlay> = {
  SA: {
    ar: "السعودية", en: "Saudi Arabia", rename: {},
    add: [
      L("2106", "مخصص مكافأة نهاية الخدمة", "21"), L("2107", "التأمينات الاجتماعية (GOSI) المستحقة", "21"),
      L("2108", "الزكاة وضريبة الدخل المستحقة", "21"), L("2109", "ضريبة الاستقطاع المستحقة", "21"),
      Q("3105", "الاحتياطي النظامي"),
      E("5213", "اشتراكات التأمينات الاجتماعية (GOSI) - حصة صاحب العمل"), E("5214", "مكافأة نهاية الخدمة"),
      E("5215", "الزكاة وضريبة الدخل"), E("5216", "رسوم التأشيرات والإقامات ورخص العمل"),
    ],
  },
  EG: {
    ar: "مصر", en: "Egypt", rename: {},
    add: [
      L("2106", "مخصص مكافأة نهاية الخدمة", "21"), L("2107", "التأمينات الاجتماعية المستحقة", "21"),
      L("2108", "ضريبة الدخل (أرباح الأشخاص الاعتبارية) المستحقة", "21"), L("2109", "ضريبة الخصم والتحصيل تحت حساب الضريبة", "21"),
      L("2110", "ضريبة كسب العمل (المرتبات) المستحقة", "21"),
      Q("3105", "الاحتياطي القانوني"),
      E("5213", "اشتراكات التأمينات الاجتماعية - حصة صاحب العمل"), E("5214", "مكافأة نهاية الخدمة"),
      E("5215", "ضريبة الدخل"), E("5216", "ضريبة الدمغة وضرائب ورسوم أخرى"),
    ],
  },
  AE: {
    ar: "الإمارات", en: "UAE", rename: {},
    add: [
      L("2106", "مخصص مكافأة نهاية الخدمة (Gratuity)", "21"), L("2107", "مستحقات هيئة المعاشات (للعاملين المواطنين)", "21"),
      L("2108", "ضريبة الشركات المستحقة", "21"),
      Q("3105", "الاحتياطي القانوني"),
      E("5213", "اشتراكات المعاشات - حصة صاحب العمل (للمواطنين)"), E("5214", "مكافأة نهاية الخدمة"),
      E("5215", "ضريبة الشركات"), E("5216", "رسوم الرخصة التجارية وتصاريح العمل والتأشيرات"),
    ],
  },
  KW: {
    ar: "الكويت", en: "Kuwait",
    // لا ضريبة قيمة مضافة مطبّقة حالياً؛ تبقى الأكواد (تعتمد عليها أجزاء من النظام) بأسماء محايدة
    rename: { "1106": "ضرائب مدفوعة مقدمًا / مدخلات (إن وُجدت)", "2103": "ضرائب مستحقة على المبيعات (إن وُجدت)" },
    add: [
      L("2106", "مخصص مكافأة نهاية الخدمة", "21"), L("2107", "المؤسسة العامة للتأمينات الاجتماعية (PIFSS) المستحقة", "21"),
      L("2108", "ضريبة دعم العمالة الوطنية والزكاة المستحقة", "21"),
      Q("3105", "الاحتياطي الإجباري (القانوني)"),
      E("5213", "اشتراكات PIFSS - حصة صاحب العمل"), E("5214", "مكافأة نهاية الخدمة"),
      E("5215", "ضريبة دعم العمالة الوطنية والزكاة"), E("5216", "رسوم حكومية وتراخيص وإقامات"),
    ],
  },
};

// دولة غير مدعومة: دليل عام (نفس الأساس + أبرز الحسابات المشتركة)
const GENERIC: Overlay = {
  ar: "عام", en: "General", rename: {},
  add: [L("2106", "مخصص مكافأة نهاية الخدمة", "21"), Q("3105", "الاحتياطي القانوني"), E("5214", "مكافأة نهاية الخدمة"), E("5215", "ضرائب الدخل / الشركات")],
};

export const SUPPORTED_CHART_COUNTRIES = Object.keys(OVERLAYS);
export function normalizeCountry(c: string | null | undefined): string { return (c || "").trim().toUpperCase(); }
export function chartCountryInfo(country: string | null | undefined): ChartCountryInfo {
  const k = normalizeCountry(country); const o = OVERLAYS[k];
  return o ? { code: k, ar: o.ar, en: o.en, supported: true } : { code: k || "—", ar: GENERIC.ar, en: GENERIC.en, supported: false };
}

/** الدليل الكامل للدولة = الأساس بعد إعادة التسمية + الحسابات المضافة (لا يغيّر أي كود موجود في الأساس). */
export function buildCountryChart(base: ChartSeedRow[], country: string | null | undefined): ChartSeedRow[] {
  const o = OVERLAYS[normalizeCountry(country)] ?? GENERIC;
  const baseCodes = new Set(base.map((r) => r.code));
  const out: ChartSeedRow[] = base.map((r) => (o.rename[r.code] ? { ...r, name: o.rename[r.code] } : { ...r }));
  for (const [code, name, type, parent] of o.add) {
    if (baseCodes.has(code)) continue; // لا يستبدل كوداً أساسياً أبداً
    out.push({ code, name, type, is_group: false, parent });
  }
  return out;
}
