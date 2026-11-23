// =============================================================
// src/pages/lib/orgConfig.ts
// طبقة إعدادات الشركة (الدولة/العملة/التوقيت/اللغة/الضريبة) + مُنسّقات مركزية.
// العملة طبقة عرض فقط — لا تُغيَّر أي قيمة مخزّنة.
// حامل عملة عالمي (ACTIVE) يقرأه reportingKit.money ليتبع عملة الشركة النشطة.
// =============================================================
import { supabase } from "./supabase";

export type OrgConfig = {
  orgId: number;
  country: string;          // SA | EG | ...
  currency: string;         // SAR | EGP
  currency_symbol: string;  // ر.س | ج.م
  timezone: string;         // Asia/Riyadh | Africa/Cairo
  default_language: string; // ar | en
  default_tax_rate: number; // 15 | 14
  number_format: "en" | "ar";
  fiscal_year_start: number;
  is_internal: boolean;
};

export const COUNTRY_PRESETS: Record<string, Partial<OrgConfig> & { en: string; ar: string }> = {
  SA: { en: "Saudi Arabia", ar: "السعودية", country: "SA", currency: "SAR", currency_symbol: "ر.س", timezone: "Asia/Riyadh", default_tax_rate: 15 },
  EG: { en: "Egypt", ar: "مصر", country: "EG", currency: "EGP", currency_symbol: "ج.م", timezone: "Africa/Cairo", default_tax_rate: 14 },
  AE: { en: "UAE", ar: "الإمارات", country: "AE", currency: "AED", currency_symbol: "د.إ", timezone: "Asia/Dubai", default_tax_rate: 5 },
  KW: { en: "Kuwait", ar: "الكويت", country: "KW", currency: "KWD", currency_symbol: "د.ك", timezone: "Asia/Kuwait", default_tax_rate: 0 },
};

export const DEFAULT_CONFIG: OrgConfig = {
  orgId: 0, country: "SA", currency: "SAR", currency_symbol: "ر.س", timezone: "Asia/Riyadh",
  default_language: "ar", default_tax_rate: 15, number_format: "en", fiscal_year_start: 1, is_internal: false,
};

// ── حامل العملة النشطة (عالمي) ───────────────────────────────────────────────
// يُحدّثه OrgConfigProvider عند تحميل الشركة؛ تقرأه المُنسّقات أدناه و reportingKit.
export const ACTIVE = { symbol: "ر.س", code: "SAR", numberFormat: "en" as "en" | "ar", timezone: "Asia/Riyadh" };
export function setActiveFromConfig(cfg: OrgConfig) {
  ACTIVE.symbol = cfg.currency_symbol || "ر.س";
  ACTIVE.code = cfg.currency || "SAR";
  ACTIVE.numberFormat = (cfg.number_format as any) || "en";
  ACTIVE.timezone = cfg.timezone || "Asia/Riyadh";
}

// ── جلب إعداد الشركة (بأمان: يرجع الافتراضات لو الأعمدة غير موجودة بعد) ──────────
export async function fetchOrgConfig(orgId: number): Promise<OrgConfig> {
  if (!orgId) return DEFAULT_CONFIG;
  try {
    const { data, error } = await supabase
      .from("organizations")
      .select("id, country, currency, currency_symbol, timezone, default_language, default_tax_rate, number_format, fiscal_year_start, is_internal")
      .eq("id", orgId).maybeSingle();
    if (error || !data) return { ...DEFAULT_CONFIG, orgId };
    const d = data as any;
    return {
      orgId,
      country: d.country ?? DEFAULT_CONFIG.country,
      currency: d.currency ?? DEFAULT_CONFIG.currency,
      currency_symbol: d.currency_symbol ?? DEFAULT_CONFIG.currency_symbol,
      timezone: d.timezone ?? DEFAULT_CONFIG.timezone,
      default_language: d.default_language ?? DEFAULT_CONFIG.default_language,
      default_tax_rate: d.default_tax_rate != null ? Number(d.default_tax_rate) : DEFAULT_CONFIG.default_tax_rate,
      number_format: (d.number_format as any) ?? DEFAULT_CONFIG.number_format,
      fiscal_year_start: d.fiscal_year_start != null ? Number(d.fiscal_year_start) : 1,
      is_internal: !!d.is_internal,
    };
  } catch {
    return { ...DEFAULT_CONFIG, orgId };
  }
}

export async function saveOrgConfig(orgId: number, patch: Partial<OrgConfig>): Promise<{ ok: boolean; error?: string }> {
  const row: Record<string, any> = {};
  for (const k of ["country", "currency", "currency_symbol", "timezone", "default_language", "default_tax_rate", "number_format", "fiscal_year_start", "is_internal"] as const) {
    if (patch[k] !== undefined) row[k] = patch[k];
  }
  if (!Object.keys(row).length) return { ok: true };
  const { error } = await supabase.from("organizations").update(row).eq("id", orgId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

// ── مُنسّقات ──────────────────────────────────────────────────────────────────
const digits = (s: string, fmt: "en" | "ar") => (fmt === "ar" ? s.replace(/[0-9]/g, (d) => "٠١٢٣٤٥٦٧٨٩"[+d]) : s);

export function fmtMoney(n: number, symbol = ACTIVE.symbol, fmt = ACTIVE.numberFormat): string {
  const s = (Math.round((Number(n) || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${digits(s, fmt)} ${symbol}`;
}
export function fmtNumber(n: number, fmt = ACTIVE.numberFormat): string {
  return digits((Number(n) || 0).toLocaleString("en-US"), fmt);
}
export function fmtDateTZ(iso: string, tz = ACTIVE.timezone, locale = "en-GB"): string {
  try { return new Date(iso).toLocaleString(locale, { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }); } catch { return iso; }
}
