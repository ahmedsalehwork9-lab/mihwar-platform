// =============================================================
// src/pages/branchSettings/branchLogic.ts
// منطق إعدادات الفروع (دوال نقية): التحقق، الفروقات، قواعد المخازن، الربط المحاسبي، المؤشرات.
// =============================================================
export type Shop = {
  id: number; shop_name: string; phone: string | null; whatsapp: string | null; city: string | null; address: string | null; email: string | null; website: string | null;
  commercial_registration: string | null; google_maps_url: string | null; logo_url: string | null; is_active: boolean; shop_type: string | null; activity_type: string | null;
  visibility_mode: string | null; default_margin_percent: number | null; organization_id: number | null;
};
export type BasicForm = { shop_name: string; phone: string; whatsapp: string; city: string; address: string; email: string; website: string; commercial_registration: string; google_maps_url: string; logo_url: string; activity_type: string; default_margin_percent: string };
export const BASIC_FIELDS: (keyof BasicForm)[] = ["shop_name", "phone", "whatsapp", "city", "address", "email", "website", "commercial_registration", "google_maps_url", "logo_url", "activity_type", "default_margin_percent"];
export const toForm = (s: Shop): BasicForm => ({
  shop_name: s.shop_name ?? "", phone: s.phone ?? "", whatsapp: s.whatsapp ?? "", city: (s.city ?? "").trim(), address: s.address ?? "", email: s.email ?? "", website: s.website ?? "",
  commercial_registration: s.commercial_registration ?? "", google_maps_url: s.google_maps_url ?? "", logo_url: s.logo_url ?? "", activity_type: s.activity_type ?? "",
  default_margin_percent: s.default_margin_percent == null ? "" : String(s.default_margin_percent),
});
const AR = "٠١٢٣٤٥٦٧٨٩";
export const latin = (s: string): string => s.replace(/[٠-٩]/g, (d) => String(AR.indexOf(d))).replace(/٫/g, ".").trim();
export function dirtyFields(a: BasicForm, b: BasicForm): (keyof BasicForm)[] { return BASIC_FIELDS.filter((k) => a[k].trim() !== b[k].trim()); }

export type FieldErr = "name" | "phone" | "email" | "url" | "margin" | "cr";
export function validateBasic(f: BasicForm): Partial<Record<keyof BasicForm, FieldErr>> {
  const e: Partial<Record<keyof BasicForm, FieldErr>> = {};
  if (!f.shop_name.trim()) e.shop_name = "name";
  const ph = /^\+?[0-9\s-]{7,16}$/;
  if (f.phone.trim() && !ph.test(latin(f.phone))) e.phone = "phone";
  if (f.whatsapp.trim() && !ph.test(latin(f.whatsapp))) e.whatsapp = "phone";
  if (f.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.trim())) e.email = "email";
  const url = (v: string) => /^https?:\/\/[^\s]+\.[^\s]+$/i.test(v.trim());
  for (const k of ["website", "google_maps_url", "logo_url"] as const) if (f[k].trim() && !url(f[k])) e[k] = "url";
  if (f.commercial_registration.trim() && !/^[0-9]{6,15}$/.test(latin(f.commercial_registration))) e.commercial_registration = "cr";
  if (f.default_margin_percent.trim()) { const m = Number(latin(f.default_margin_percent)); if (!Number.isFinite(m) || m < 0 || m > 1000) e.default_margin_percent = "margin"; }
  return e;
}
/** يحوّل النموذج لحمولة تحديث تحتوي الحقول المتغيرة فقط ("" → null). */
export function patchOf(saved: BasicForm, f: BasicForm): Record<string, string | number | null> {
  const p: Record<string, string | number | null> = {};
  for (const k of dirtyFields(saved, f)) {
    const v = f[k].trim();
    if (k === "default_margin_percent") p[k] = v === "" ? null : Number(latin(v));
    else if (k === "phone" || k === "whatsapp" || k === "commercial_registration") p[k] = v === "" ? null : latin(v);
    else if (k === "shop_name") p[k] = v;
    else p[k] = v === "" ? null : v;
  }
  return p;
}

// ── المخازن ──
export type Wh = { id: number; branch_id: number | null; name: string; code: string | null; is_default: boolean; is_active: boolean; inventory_account_id: number | null };
export type WhErr = "name" | "default_inactive" | "last_active" | "dup_code";
export function whValidate(all: Wh[], next: Wh): WhErr | null {
  if (!next.name.trim()) return "name";
  if (next.is_default && !next.is_active) return "default_inactive";
  const others = all.filter((w) => w.id !== next.id);
  if (!next.is_active && !others.some((w) => w.is_active)) return "last_active";
  const c = (next.code ?? "").trim().toLowerCase(); if (c && others.some((w) => (w.code ?? "").trim().toLowerCase() === c)) return "dup_code";
  return null;
}
/** عند جعل مخزن افتراضيًا: يُلغى الافتراضي عن البقية. تُرجع الهوّيات المراد إلغاؤها. */
export const defaultsToClear = (all: Wh[], targetId: number): number[] => all.filter((w) => w.is_default && w.id !== targetId).map((w) => w.id);

// ── الربط المحاسبي ──
export type MapRow = { branch_id: number | null; role: string; account_id: number };
export type RoleDef = { role: string; ar: string; en: string; type: string };
export const ROLES: RoleDef[] = [
  { role: "revenue", ar: "إيرادات المبيعات", en: "Sales revenue", type: "revenue" },
  { role: "output_vat", ar: "ضريبة القيمة المضافة (مخرجات)", en: "Output VAT", type: "liability" },
  { role: "inventory", ar: "المخزون (احتياطي لحساب المستودع)", en: "Inventory (fallback to warehouse account)", type: "asset" },
  { role: "cogs", ar: "تكلفة البضاعة المباعة", en: "Cost of goods sold", type: "expense" },
];
export const orgDefault = (rows: MapRow[], role: string): number | null => rows.find((r) => r.role === role && r.branch_id == null)?.account_id ?? null;
export const branchOverride = (rows: MapRow[], branchId: number, role: string): number | null => rows.find((r) => r.role === role && r.branch_id === branchId)?.account_id ?? null;
export const effective = (rows: MapRow[], branchId: number, role: string): number | null => branchOverride(rows, branchId, role) ?? orgDefault(rows, role);
export type MapOp = { op: "upsert" | "delete"; role: string; account_id?: number };
/** sel: القيمة المختارة لكل دور ("" = لا تخصيص، يستخدم افتراضي الشركة). */
export function planMap(rows: MapRow[], branchId: number, sel: Record<string, number | "">): MapOp[] {
  const ops: MapOp[] = [];
  for (const r of ROLES) {
    const cur = branchOverride(rows, branchId, r.role); const want = sel[r.role] === "" || sel[r.role] == null ? null : Number(sel[r.role]);
    if (want === cur) continue; if (want == null) ops.push({ op: "delete", role: r.role }); else ops.push({ op: "upsert", role: r.role, account_id: want });
  }
  return ops;
}

// ── المؤشرات والقوائم ──
export type Kpis = { branches: number; active: number; warehouses: number; items: number };
export function kpisOf(shops: Shop[], whs: Wh[], items: Record<number, number>): Kpis {
  return { branches: shops.length, active: shops.filter((s) => s.is_active).length, warehouses: whs.filter((w) => w.is_active).length, items: shops.reduce((n, s) => n + (items[s.id] || 0), 0) };
}
export function filterShops(shops: Shop[], q: string): Shop[] {
  const s = latin(q).toLowerCase(); if (!s) return shops;
  return shops.filter((x) => `${x.shop_name} ${x.city ?? ""} ${x.id}`.toLowerCase().includes(s));
}
export const typeLabel = (t: string | null): { en: string; ar: string } => (t === "warehouse" ? { en: "Central warehouse", ar: "مخزن مركزي" } : { en: "Branch", ar: "فرع" });
