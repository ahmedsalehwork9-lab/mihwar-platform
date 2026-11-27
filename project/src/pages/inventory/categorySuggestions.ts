// =============================================================
// src/pages/inventory/categorySuggestions.ts — اقتراح تصنيفات المنتجات حسب نوع نشاط الشركة.
// نشاط الشركة نص حر (organizations.business_activity)، لذا يُكتشف بالكلمات المفتاحية بعد تطبيع عربي/إنجليزي.
// دالة نقية بلا اعتماد على React أو Supabase لتُختبر منفردة.
// =============================================================
export type CatLabel = { ar: string; en: string };
export type ActivityPreset = { id: string; ar: string; en: string; keywords: string[]; categories: CatLabel[] };
export type Suggestion = { label: string; source: "used" | "preset" };

const c = (ar: string, en: string): CatLabel => ({ ar, en });

export const ACTIVITY_PRESETS: ActivityPreset[] = [
  { id: "auto_parts", ar: "قطع غيار سيارات", en: "Auto parts", keywords: ["قطع غيار", "سيارات", "سياره", "ورشه", "ايسوزو", "شاحنات", "auto", "parts", "car ", "cars", "vehicle", "truck"],
    categories: [c("فلاتر", "Filters"), c("زيوت وسوائل", "Oils & fluids"), c("فرامل", "Brakes"), c("إطارات وجنوط", "Tires & rims"), c("بطاريات وكهرباء", "Batteries & electrical"), c("تعليق وتوجيه", "Suspension & steering"), c("محرك", "Engine"), c("ناقل الحركة والقير", "Transmission"), c("تكييف وتبريد", "A/C & cooling"), c("إضاءة", "Lighting"), c("عادم", "Exhaust"), c("هيكل وإكسسوارات", "Body & accessories"), c("أدوات ومعدات ورشة", "Workshop tools")] },
  { id: "medical", ar: "مستلزمات طبية", en: "Medical supplies", keywords: ["طبي", "طبيه", "مستشف", "عيادات", "اجهزه طبيه", "medical", "surgical", "hospital", "clinic"],
    categories: [c("مستهلكات طبية", "Medical consumables"), c("قفازات وكمامات", "Gloves & masks"), c("حقن وأدوات حقن", "Syringes & injection"), c("أجهزة طبية", "Medical devices"), c("مستلزمات جراحية", "Surgical supplies"), c("ضمادات وعناية بالجروح", "Dressings & wound care"), c("معقمات ومطهرات", "Disinfectants"), c("مستلزمات المختبر", "Lab supplies"), c("مستلزمات الأسنان", "Dental supplies"), c("عناية شخصية", "Personal care"), c("أثاث ومعدات عيادات", "Clinic equipment")] },
  { id: "pharmacy", ar: "صيدلية", en: "Pharmacy", keywords: ["صيدل", "ادويه", "دواء", "pharm", "drug"],
    categories: [c("أدوية بوصفة", "Prescription drugs"), c("أدوية بدون وصفة", "OTC drugs"), c("فيتامينات ومكملات", "Vitamins & supplements"), c("عناية بالبشرة", "Skin care"), c("أطفال ورضع", "Baby care"), c("مستلزمات طبية", "Medical supplies"), c("عناية شخصية", "Personal care")] },
  { id: "restaurant", ar: "مطعم / كافيه", en: "Restaurant / cafe", keywords: ["مطعم", "مطاعم", "كافيه", "كوفي", "قهوه", "مقهي", "مخبز", "حلويات", "وجبات", "restaurant", "cafe", "coffee", "bakery", "catering"],
    categories: [c("مشروبات ساخنة", "Hot drinks"), c("مشروبات باردة", "Cold drinks"), c("حلويات ومخبوزات", "Desserts & bakery"), c("وجبات رئيسية", "Main meals"), c("وجبات خفيفة", "Snacks"), c("مواد خام ومكونات", "Raw ingredients"), c("تغليف وعبوات", "Packaging"), c("أدوات مطبخ", "Kitchen tools")] },
  { id: "grocery", ar: "سوبر ماركت / تموينات", en: "Grocery / supermarket", keywords: ["سوبر ماركت", "سوبرماركت", "بقاله", "تموينات", "هايبر", "مواد غذائيه", "غذائيه", "grocery", "supermarket", "food"],
    categories: [c("ألبان وأجبان", "Dairy"), c("مخبوزات", "Bakery"), c("لحوم ودواجن", "Meat & poultry"), c("خضار وفواكه", "Fruits & vegetables"), c("معلبات", "Canned goods"), c("مشروبات", "Beverages"), c("حبوب وبقوليات", "Grains & legumes"), c("وجبات خفيفة وحلويات", "Snacks & sweets"), c("منظفات", "Cleaning"), c("عناية شخصية", "Personal care")] },
  { id: "clothing", ar: "ملابس وأزياء", en: "Clothing & fashion", keywords: ["ملابس", "ازياء", "احذيه", "اقمشه", "خياطه", "fashion", "cloth", "apparel", "shoes"],
    categories: [c("رجالي", "Men"), c("نسائي", "Women"), c("أطفال", "Kids"), c("أحذية", "Shoes"), c("حقائب وإكسسوارات", "Bags & accessories"), c("ملابس رياضية", "Sportswear"), c("ملابس داخلية", "Underwear"), c("أقمشة", "Fabrics")] },
  { id: "electronics", ar: "إلكترونيات وجوالات", en: "Electronics & mobiles", keywords: ["الكترون", "جوال", "موبايل", "كمبيوتر", "حاسب", "هواتف", "electronic", "mobile", "computer", "phone", "laptop"],
    categories: [c("جوالات", "Mobiles"), c("حواسيب وملحقاتها", "Computers & accessories"), c("شاشات وتلفزيونات", "Screens & TVs"), c("إكسسوارات جوال", "Mobile accessories"), c("كاميرات ومراقبة", "Cameras & CCTV"), c("شبكات واتصالات", "Networking"), c("أجهزة منزلية", "Home appliances"), c("كابلات وشواحن", "Cables & chargers")] },
  { id: "building", ar: "مواد بناء وأدوات", en: "Building materials & hardware", keywords: ["مواد بناء", "ادوات صحيه", "دهانات", "حديد", "سباكه", "اسمنت", "عدد وادوات", "hardware", "building", "construction", "paint"],
    categories: [c("حديد وتسليح", "Steel & rebar"), c("أسمنت ومواد لاصقة", "Cement & adhesives"), c("دهانات", "Paints"), c("أدوات صحية وسباكة", "Plumbing & sanitary"), c("كهرباء وإنارة", "Electrical & lighting"), c("عدد وأدوات", "Tools"), c("أبواب ونوافذ", "Doors & windows"), c("بلاط وسيراميك", "Tiles & ceramics")] },
  { id: "furniture", ar: "أثاث ومفروشات", en: "Furniture", keywords: ["اثاث", "مفروشات", "ديكور", "furniture", "decor"],
    categories: [c("غرف نوم", "Bedrooms"), c("غرف معيشة وصالات", "Living rooms"), c("مطابخ", "Kitchens"), c("مكاتب", "Office furniture"), c("مفروشات وستائر", "Furnishings & curtains"), c("ديكور وإضاءة", "Decor & lighting")] },
  { id: "cosmetics", ar: "عطور وتجميل", en: "Perfume & cosmetics", keywords: ["عطور", "عطر", "تجميل", "كوزمتيك", "مكياج", "perfume", "cosmetic", "beauty", "makeup"],
    categories: [c("عطور", "Perfumes"), c("مكياج", "Makeup"), c("عناية بالبشرة", "Skin care"), c("عناية بالشعر", "Hair care"), c("بخور وعود", "Incense & oud"), c("أدوات تجميل", "Beauty tools")] },
  { id: "stationery", ar: "قرطاسية ومكتبات", en: "Stationery", keywords: ["قرطاسيه", "مكتبه", "ادوات مكتبيه", "stationery", "office supplies"],
    categories: [c("أقلام وكتابة", "Pens & writing"), c("دفاتر وورق", "Notebooks & paper"), c("أدوات مكتبية", "Office supplies"), c("مستلزمات مدرسية", "School supplies"), c("طباعة وحبر", "Printing & ink"), c("هدايا", "Gifts")] },
];

// عند غياب النشاط أو عدم التعرّف عليه
export const GENERAL_PRESET: ActivityPreset = {
  id: "general", ar: "عام", en: "General", keywords: [],
  categories: [c("منتجات عامة", "General products"), c("مواد خام", "Raw materials"), c("أدوات ومعدات", "Tools & equipment"), c("إكسسوارات", "Accessories"), c("مستلزمات", "Supplies"), c("خدمات", "Services"), c("أخرى", "Other")],
};

/** تطبيع نص عربي/إنجليزي للمطابقة: حروف صغيرة، إزالة التشكيل والتطويل، توحيد الألف والياء والتاء المربوطة، حذف الترقيم. */
export function normalizeText(s: string | null | undefined): string {
  return (s ?? "").toString().toLowerCase()
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/[ةه]/g, "ه").replace(/ؤ/g, "و").replace(/ئ/g, "ي")
    .replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

/** يكتشف النشاط من النص الحر بالكلمات المفتاحية؛ الأعلى مطابقةً يفوز، وعند التعادل الأول في القائمة. */
export function detectPreset(activityText: string | null | undefined): ActivityPreset | null {
  const text = " " + normalizeText(activityText) + " ";
  if (text.trim() === "") return null;
  let best: ActivityPreset | null = null; let bestScore = 0;
  for (const p of ACTIVITY_PRESETS) {
    let score = 0;
    for (const k of p.keywords) { const nk = normalizeText(k); if (nk && text.includes(nk.length <= 3 ? " " + nk : nk)) score += 1 + (nk.length > 5 ? 1 : 0); }
    if (score > bestScore) { best = p; bestScore = score; }
  }
  return best;
}

export function presetById(id: string | null | undefined): ActivityPreset | null {
  return id === GENERAL_PRESET.id ? GENERAL_PRESET : ACTIVITY_PRESETS.find((p) => p.id === id) ?? null;
}

export type SuggestInput = { activityText?: string | null; presetId?: string | null; used?: string[]; query?: string; lang?: "ar" | "en"; limit?: number };
export type SuggestResult = { preset: ActivityPreset; detected: boolean; items: Suggestion[] };

/**
 * ترتيب الاقتراحات: ما استعملته الشركة فعلاً أولاً (حتى 6)، ثم تصنيفات النشاط. بلا تكرار (بعد التطبيع).
 * presetId اختيار يدوي يتقدّم على الاكتشاف التلقائي. query يفلتر بالاحتواء.
 */
export function suggestCategories(inp: SuggestInput): SuggestResult {
  const lang = inp.lang ?? "ar"; const limit = inp.limit ?? 12;
  const manual = presetById(inp.presetId); const auto = manual ? null : detectPreset(inp.activityText);
  const preset = manual ?? auto ?? GENERAL_PRESET;
  const q = normalizeText(inp.query);
  const seen = new Set<string>(); const items: Suggestion[] = [];
  const push = (label: string, source: Suggestion["source"]) => {
    const key = normalizeText(label); if (!key || seen.has(key)) return;
    if (q && !key.includes(q)) return;
    seen.add(key); items.push({ label, source });
  };
  for (const u of (inp.used ?? []).map((x) => x.trim()).filter(Boolean).slice(0, 6)) push(u, "used");
  for (const cat of preset.categories) push(lang === "ar" ? cat.ar : cat.en, "preset");
  return { preset, detected: !!(manual || auto), items: items.slice(0, limit) };
}
