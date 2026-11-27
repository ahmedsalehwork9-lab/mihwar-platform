// =============================================================
// src/components/landing/countries.ts — الدول والمدن ومفاتيح الاتصال لنموذج الاشتراك.
// =============================================================
export type City = { id: string; ar: string; en: string };
export type Country = { code: string; dial: string; ar: string; en: string; flag: string; minLen: number; maxLen: number; cities: City[] };
const c = (id: string, ar: string, en: string): City => ({ id, ar, en });

export const COUNTRIES: Country[] = [
  { code: "SA", dial: "966", ar: "السعودية", en: "Saudi Arabia", flag: "🇸🇦", minLen: 9, maxLen: 9, cities: [c("riyadh", "الرياض", "Riyadh"), c("jeddah", "جدة", "Jeddah"), c("makkah", "مكة المكرمة", "Makkah"), c("madinah", "المدينة المنورة", "Madinah"), c("dammam", "الدمام", "Dammam"), c("khobar", "الخبر", "Khobar"), c("dhahran", "الظهران", "Dhahran"), c("hofuf", "الهفوف", "Hofuf"), c("jubail", "الجبيل", "Jubail"), c("taif", "الطائف", "Taif"), c("tabuk", "تبوك", "Tabuk"), c("buraidah", "بريدة", "Buraidah"), c("abha", "أبها", "Abha"), c("khamis", "خميس مشيط", "Khamis Mushait"), c("hail", "حائل", "Hail"), c("jazan", "جازان", "Jazan"), c("najran", "نجران", "Najran"), c("yanbu", "ينبع", "Yanbu")] },
  { code: "AE", dial: "971", ar: "الإمارات", en: "United Arab Emirates", flag: "🇦🇪", minLen: 8, maxLen: 9, cities: [c("dubai", "دبي", "Dubai"), c("abudhabi", "أبوظبي", "Abu Dhabi"), c("sharjah", "الشارقة", "Sharjah"), c("ajman", "عجمان", "Ajman"), c("rak", "رأس الخيمة", "Ras Al Khaimah"), c("fujairah", "الفجيرة", "Fujairah"), c("alain", "العين", "Al Ain"), c("uaq", "أم القيوين", "Umm Al Quwain")] },
  { code: "KW", dial: "965", ar: "الكويت", en: "Kuwait", flag: "🇰🇼", minLen: 8, maxLen: 8, cities: [c("kuwaitcity", "مدينة الكويت", "Kuwait City"), c("hawalli", "حولي", "Hawalli"), c("salmiya", "السالمية", "Salmiya"), c("farwaniya", "الفروانية", "Farwaniya"), c("ahmadi", "الأحمدي", "Ahmadi"), c("jahra", "الجهراء", "Jahra")] },
  { code: "QA", dial: "974", ar: "قطر", en: "Qatar", flag: "🇶🇦", minLen: 8, maxLen: 8, cities: [c("doha", "الدوحة", "Doha"), c("rayyan", "الريان", "Al Rayyan"), c("wakrah", "الوكرة", "Al Wakrah"), c("khor", "الخور", "Al Khor"), c("shamal", "الشمال", "Al Shamal")] },
  { code: "BH", dial: "973", ar: "البحرين", en: "Bahrain", flag: "🇧🇭", minLen: 8, maxLen: 8, cities: [c("manama", "المنامة", "Manama"), c("muharraq", "المحرق", "Muharraq"), c("riffa", "الرفاع", "Riffa"), c("isatown", "مدينة عيسى", "Isa Town"), c("hamad", "مدينة حمد", "Hamad Town")] },
  { code: "OM", dial: "968", ar: "عُمان", en: "Oman", flag: "🇴🇲", minLen: 8, maxLen: 8, cities: [c("muscat", "مسقط", "Muscat"), c("salalah", "صلالة", "Salalah"), c("sohar", "صحار", "Sohar"), c("nizwa", "نزوى", "Nizwa"), c("sur", "صور", "Sur")] },
  { code: "EG", dial: "20", ar: "مصر", en: "Egypt", flag: "🇪🇬", minLen: 10, maxLen: 10, cities: [c("cairo", "القاهرة", "Cairo"), c("giza", "الجيزة", "Giza"), c("alex", "الإسكندرية", "Alexandria"), c("mansoura", "المنصورة", "Mansoura"), c("tanta", "طنطا", "Tanta"), c("suez", "السويس", "Suez"), c("portsaid", "بورسعيد", "Port Said"), c("aswan", "أسوان", "Aswan")] },
  { code: "JO", dial: "962", ar: "الأردن", en: "Jordan", flag: "🇯🇴", minLen: 8, maxLen: 9, cities: [c("amman", "عمّان", "Amman"), c("zarqa", "الزرقاء", "Zarqa"), c("irbid", "إربد", "Irbid"), c("aqaba", "العقبة", "Aqaba"), c("salt", "السلط", "Salt")] },
  { code: "IQ", dial: "964", ar: "العراق", en: "Iraq", flag: "🇮🇶", minLen: 10, maxLen: 10, cities: [c("baghdad", "بغداد", "Baghdad"), c("basra", "البصرة", "Basra"), c("erbil", "أربيل", "Erbil"), c("mosul", "الموصل", "Mosul"), c("najaf", "النجف", "Najaf")] },
  { code: "LB", dial: "961", ar: "لبنان", en: "Lebanon", flag: "🇱🇧", minLen: 7, maxLen: 8, cities: [c("beirut", "بيروت", "Beirut"), c("tripoli", "طرابلس", "Tripoli"), c("sidon", "صيدا", "Sidon"), c("tyre", "صور", "Tyre")] },
  { code: "YE", dial: "967", ar: "اليمن", en: "Yemen", flag: "🇾🇪", minLen: 9, maxLen: 9, cities: [c("sanaa", "صنعاء", "Sanaa"), c("aden", "عدن", "Aden"), c("taiz", "تعز", "Taiz"), c("hodeidah", "الحديدة", "Hodeidah")] },
  { code: "SD", dial: "249", ar: "السودان", en: "Sudan", flag: "🇸🇩", minLen: 9, maxLen: 9, cities: [c("khartoum", "الخرطوم", "Khartoum"), c("omdurman", "أم درمان", "Omdurman"), c("portsudan", "بورتسودان", "Port Sudan")] },
  { code: "MA", dial: "212", ar: "المغرب", en: "Morocco", flag: "🇲🇦", minLen: 9, maxLen: 9, cities: [c("casablanca", "الدار البيضاء", "Casablanca"), c("rabat", "الرباط", "Rabat"), c("marrakech", "مراكش", "Marrakech"), c("fes", "فاس", "Fes"), c("tangier", "طنجة", "Tangier")] },
];
export const OTHER_CITY = "other";
export const findCountry = (code: string): Country | undefined => COUNTRIES.find((x) => x.code === code);
export const DEFAULT_COUNTRY = "SA";
/** اسم المدينة للعرض (من القيمة المخزنة: id أو other:<نص>). */
export function cityLabel(country: string, city: string | null | undefined, lang: "ar" | "en"): string {
  if (!city) return "";
  if (city.startsWith("other:")) return city.slice(6);
  const k = findCountry(country)?.cities.find((x) => x.id === city);
  return k ? k[lang] : city;
}
