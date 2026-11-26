// =============================================================
// src/components/landing/subscriptionLogic.ts
// منطق نموذج طلب الاشتراك (دوال نقية): التحقق، تطبيع الجوال، بناء الحمولة، منع التكرار.
// =============================================================
export type PlanId = "trial" | "monthly" | "annual" | "enterprise";
export const PLANS: { id: PlanId; en: string; ar: string }[] = [
  { id: "trial", en: "Free trial (3 months)", ar: "تجربة مجانية (3 أشهر)" },
  { id: "monthly", en: "Monthly subscription", ar: "اشتراك شهري" },
  { id: "annual", en: "Annual subscription", ar: "اشتراك سنوي" },
  { id: "enterprise", en: "Enterprise / custom", ar: "مؤسسات / باقة مخصصة" },
];
export const ACTIVITIES: { id: string; en: string; ar: string }[] = [
  { id: "spare_parts", en: "Auto spare parts", ar: "قطع غيار السيارات" },
  { id: "retail", en: "Retail / wholesale", ar: "تجزئة / جملة" },
  { id: "grocery", en: "Grocery / supermarket", ar: "تموينات / سوبرماركت" },
  { id: "restaurant", en: "Restaurants / cafés", ar: "مطاعم / مقاهي" },
  { id: "services", en: "Services", ar: "خدمات" },
  { id: "contracting", en: "Contracting / trading", ar: "مقاولات / تجارة عامة" },
  { id: "other", en: "Other", ar: "أخرى" },
];
export type SubForm = { business_name: string; contact_name: string; phone: string; email: string; activity: string; activity_other: string; branches_count: string; plan: PlanId; notes: string; website: string };
export const EMPTY_FORM: SubForm = { business_name: "", contact_name: "", phone: "", email: "", activity: "", activity_other: "", branches_count: "1", plan: "trial", notes: "", website: "" };
export type SubErr = "business_name" | "contact_name" | "phone" | "email" | "activity" | "activity_other" | "branches_count" | "notes";

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩"; const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
export const latinDigits = (s: string): string => s.replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d))).replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)));
/** يُرجع الجوال بصيغة دولية (+9665xxxxxxxx للسعودية) أو null إن كان غير صالح. */
export function normalizePhone(raw: string): string | null {
  const s = latinDigits(raw).replace(/[\s\-().]/g, ""); if (!s) return null;
  let d = s.startsWith("+") ? s.slice(1) : s.startsWith("00") ? s.slice(2) : s;
  if (!/^[0-9]+$/.test(d)) return null;
  if (/^05[0-9]{8}$/.test(d)) return `+966${d.slice(1)}`;
  if (/^5[0-9]{8}$/.test(d)) return `+966${d}`;
  if (/^9665[0-9]{8}$/.test(d)) return `+${d}`;
  if (s.startsWith("+") || s.startsWith("00")) return d.length >= 8 && d.length <= 15 && !d.startsWith("0") ? `+${d}` : null;
  return null;
}
export function validateSub(f: SubForm): Partial<Record<SubErr, true>> {
  const e: Partial<Record<SubErr, true>> = {};
  if (f.business_name.trim().length < 2 || f.business_name.trim().length > 120) e.business_name = true;
  if (f.contact_name.trim().length < 2 || f.contact_name.trim().length > 120) e.contact_name = true;
  if (!normalizePhone(f.phone)) e.phone = true;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.trim()) || f.email.trim().length > 160) e.email = true;
  if (!ACTIVITIES.some((a) => a.id === f.activity)) e.activity = true;
  if (f.activity === "other" && (f.activity_other.trim().length < 2 || f.activity_other.trim().length > 80)) e.activity_other = true;
  const n = Number(latinDigits(f.branches_count)); if (!Number.isInteger(n) || n < 1 || n > 500) e.branches_count = true;
  if (f.notes.length > 1000) e.notes = true;
  return e;
}
export type SubPayload = { business_name: string; contact_name: string; phone: string; email: string; activity: string; branches_count: number; plan: PlanId; notes: string | null; lang: "ar" | "en"; idempotency_key: string; source: string };
export function buildPayload(f: SubForm, lang: "ar" | "en", key: string, source = "landing"): SubPayload {
  const act = f.activity === "other" ? `other:${f.activity_other.trim()}` : f.activity;
  return { business_name: f.business_name.trim(), contact_name: f.contact_name.trim(), phone: normalizePhone(f.phone) as string, email: f.email.trim().toLowerCase(), activity: act, branches_count: Number(latinDigits(f.branches_count)), plan: f.plan, notes: f.notes.trim() || null, lang, idempotency_key: key, source };
}
/** حماية من الإرسال المتكرر: نفس الجوال/البريد خلال نافذة زمنية. */
export const COOLDOWN_MS = 60_000;
export const cooldownKey = "mihwar.sub.last.v1";
export function inCooldown(raw: string | null, now: number, phone: string): boolean {
  try { if (!raw) return false; const o = JSON.parse(raw) as { at?: number; phone?: string }; return typeof o.at === "number" && o.phone === phone && now - o.at < COOLDOWN_MS; } catch { return false; }
}
export const newKey = (): string => { try { const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto; if (c?.randomUUID) return c.randomUUID(); } catch { /* fall through */ } return `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`; };
