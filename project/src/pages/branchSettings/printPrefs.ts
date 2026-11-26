// =============================================================
// src/pages/branchSettings/printPrefs.ts
// تفضيلات طباعة المستندات لكل فرع (حجم الورق، الاتجاه، الشعار، توقيع المستلم).
// تُخزَّن في هذا المتصفح (لا يوجد جدول لها في قاعدة البيانات). القيم الافتراضية = القالب الحالي دون تغيير.
// =============================================================
export type Paper = "A4" | "A5" | "80mm";
export type Orient = "portrait" | "landscape";
/** docLang: "ui" = لغة الواجهة الحالية، "ar"/"en" = ثابتة، "bi" = ثنائي اللغة (عربي / English) في كل تسمية. */
export type DocLang = "ui" | "ar" | "en" | "bi";
export const DOC_LANGS: DocLang[] = ["ui", "ar", "en", "bi"];
export type PrintPrefs = { paper: Paper; orient: Orient; showLogo: boolean; showSignature: boolean; showBrand: boolean; docLang: DocLang };
export const DEFAULT_PREFS: PrintPrefs = { paper: "A4", orient: "portrait", showLogo: true, showSignature: false, showBrand: true, docLang: "ui" };
export const PAPERS: Paper[] = ["A4", "A5", "80mm"];
export const prefsKey = (branchId: number | null): string => `mihwar.print.prefs.v1:${branchId ?? 0}`;

export function validPrefs(x: unknown): PrintPrefs | null {
  if (!x || typeof x !== "object") return null; const o = x as Record<string, unknown>;
  const paper = PAPERS.includes(o.paper as Paper) ? (o.paper as Paper) : null; const orient = o.orient === "landscape" || o.orient === "portrait" ? (o.orient as Orient) : null;
  if (!paper || !orient || typeof o.showLogo !== "boolean" || typeof o.showSignature !== "boolean") return null;
  return { paper, orient, showLogo: o.showLogo, showSignature: o.showSignature, showBrand: typeof o.showBrand === "boolean" ? o.showBrand : true, docLang: DOC_LANGS.includes(o.docLang as DocLang) ? (o.docLang as DocLang) : "ui" };
}
export function loadPrintPrefs(s: Storage | null, branchId: number | null): PrintPrefs {
  try { const raw = s?.getItem(prefsKey(branchId)); if (!raw) return DEFAULT_PREFS; return validPrefs(JSON.parse(raw)) ?? DEFAULT_PREFS; } catch { return DEFAULT_PREFS; }
}
export function savePrintPrefs(s: Storage | null, branchId: number | null, p: PrintPrefs): boolean { try { if (!s) return false; s.setItem(prefsKey(branchId), JSON.stringify(p)); return true; } catch { return false; } }
export function clearPrintPrefs(s: Storage | null, branchId: number | null): void { try { s?.removeItem(prefsKey(branchId)); } catch { /* ignore */ } }
export const browserStore = (): Storage | null => { try { return typeof window !== "undefined" ? window.localStorage : null; } catch { return null; } };
export const isDefaultPrefs = (p: PrintPrefs): boolean => p.paper === DEFAULT_PREFS.paper && p.orient === DEFAULT_PREFS.orient && p.showLogo === DEFAULT_PREFS.showLogo && p.showSignature === DEFAULT_PREFS.showSignature && p.showBrand === DEFAULT_PREFS.showBrand && p.docLang === DEFAULT_PREFS.docLang;

/** CSS الصفحة. الافتراضي مطابق حرفيًا للقالب القديم. */
export function pageCss(p: PrintPrefs): string {
  if (p.paper === "80mm") return "@page{size:80mm auto;margin:3mm}body{font-size:11px}";
  return `@page{size:${p.paper}${p.orient === "landscape" ? " landscape" : ""};margin:12mm}${p.paper === "A5" ? "body{font-size:12px}" : ""}`;
}
export function signatureHTML(p: PrintPrefs, label: string): string {
  return p.showSignature ? `<div style="margin-top:36px;display:flex;justify-content:space-between;font-size:12px"><div style="min-width:180px;border-top:1px solid #64748b;padding-top:4px">${label}</div></div>` : "";
}

/** يحوّل لغة الواجهة + التفضيل إلى لغة المستند: ar = اتجاه عربي، bi = ثنائي (اتجاه عربي). */
export function resolveDocLang(p: PrintPrefs, ui: "ar" | "en"): { ar: boolean; bi: boolean; lang: "ar" | "en" } {
  const l = p.docLang === "ui" ? ui : p.docLang === "bi" ? "ar" : p.docLang;
  return { ar: l === "ar", bi: p.docLang === "bi", lang: l };
}
/** مُترجم التسميات: ثنائي → "عربي / English". */
export function makeT(p: PrintPrefs, ui: "ar" | "en"): (en: string, ar: string) => string {
  const r = resolveDocLang(p, ui); return (en, ar) => (r.bi ? `${ar} / ${en}` : r.ar ? ar : en);
}
