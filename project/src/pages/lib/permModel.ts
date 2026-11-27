// =============================================================
// src/pages/lib/permModel.ts — نموذج الصلاحيات (منطق نقي، بلا اعتماد على الواجهة).
// المستوى 1: الصفحات المسموحة   → profiles.page_permissions  (null = كل الصفحات)
// المستوى 2: الإجراءات لكل صفحة → profiles.action_permissions (null = كل الإجراءات، وهو سلوك الحسابات القديمة)
// ملاحظة صريحة: التطبيق هنا على مستوى الواجهة؛ الحماية الخادمية الوحيدة هي أعلام الأدمن/الدور
// (انظر supabase/proposals/20261127_admin_permissions.sql).
// =============================================================
export type Action = "create" | "edit" | "delete" | "approve" | "export";
export const ACTIONS: { id: Action; ar: string; en: string }[] = [
  { id: "create", ar: "إضافة", en: "Create" },
  { id: "edit", ar: "تعديل", en: "Edit" },
  { id: "delete", ar: "حذف", en: "Delete" },
  { id: "approve", ar: "اعتماد/ترحيل", en: "Approve/Post" },
  { id: "export", ar: "تصدير/طباعة", en: "Export/Print" },
];
export const ACTION_IDS: Action[] = ACTIONS.map((a) => a.id);

export type PermPage = { id: string; ar: string; en: string; actions: Action[] };
export type PermGroup = { id: string; ar: string; en: string; pages: PermPage[] };
const ALL: Action[] = ["create", "edit", "delete", "approve", "export"];
const P = (id: string, ar: string, en: string, actions: Action[] = ALL): PermPage => ({ id, ar, en, actions });

export const PERM_GROUPS: PermGroup[] = [
  { id: "ops", ar: "العمليات", en: "Operations", pages: [
    P("dashboard", "الرئيسية", "Dashboard", []), P("search", "المتجر", "Store", ["create", "edit", "export"]),
    P("inventory", "المخزون", "Inventory"), P("stock-adjustments", "الجرد والتسويات", "Stock adjustments", ["create", "edit", "approve", "export"]),
    P("item-movement", "حركة الصنف", "Item movement", ["export"]), P("inventory-analytics", "تقارير المخزون", "Inventory reports", ["export"]),
    P("orders", "الطلبات", "Orders", ["create", "edit", "delete", "approve", "export"]) ] },
  { id: "sales", ar: "المبيعات", en: "Sales", pages: [
    P("pos", "نقاط البيع", "POS", ["create", "export"]), P("sales-invoice", "فاتورة مبيعات", "Sales invoice", ["create", "edit", "delete", "approve", "export"]),
    P("quotation", "عروض الأسعار", "Quotations", ["create", "edit", "delete", "export"]), P("sales-returns", "مرتجعات المبيعات", "Sales returns", ["create", "export"]), P("sales-items", "المبيعات بالأصناف", "Sales by items", ["export"]), P("sales-reconciliation", "تسوية المبيعات", "Sales reconciliation", ["create", "edit", "delete", "approve", "export"]) ] },
  { id: "purch", ar: "المشتريات", en: "Purchases", pages: [
    P("purchases", "المشتريات", "Purchases"), P("purchase-invoices", "فواتير المشتريات", "Purchase invoices"), P("purchase-orders", "أوامر الشراء", "Purchase orders"),
    P("purchase-returns", "مرتجعات المشتريات", "Purchase returns"), P("supplier-payments", "سداد الموردين", "Supplier payments"), P("fixed-expenses", "المصروفات الثابتة", "Fixed expenses") ] },
  { id: "fin", ar: "المالية والتقارير", en: "Finance & reports", pages: [
    P("accounting", "الحسابات", "Accounting"), P("financial-report", "التقرير المالي", "Financial report", ["export"]), P("reports", "التقارير", "Reports", ["export"]),
    P("reports-center", "مركز التقارير", "Reports center", ["export"]), P("business-analytics", "تحليلات الأعمال", "Business analytics", ["export"]),
    P("monthly-financial", "التقرير المالي الشهري", "Monthly financial", ["export"]), P("report-builder", "مُنشئ التقارير", "Report builder", ["create", "edit", "delete", "export"]) ] },
  { id: "sys", ar: "النظام", en: "System", pages: [P("alerts", "التنبيهات", "Alerts", ["edit"]), P("shop-settings", "إعدادات الشركة والفروع", "Company & branch settings", ["edit"])] },
];
export const PERM_PAGES: PermPage[] = PERM_GROUPS.flatMap((g) => g.pages);
export const PAGE_IDS: string[] = PERM_PAGES.map((p) => p.id);
const PAGE_BY_ID = new Map(PERM_PAGES.map((p) => [p.id, p]));
export const pageDef = (id: string): PermPage | undefined => PAGE_BY_ID.get(id);

/**
 * تسجيل تلقائي: أي صفحة جديدة تُضاف إلى القائمة الجانبية تظهر هنا في نافذة الصلاحيات دون تعديل هذا الملف.
 * تُستدعى من Layout عند التحميل. الصفحات المعرّفة يدويًا أعلاه تحتفظ بإجراءاتها؛ غير المعرّفة تأخذ كل الإجراءات.
 * مجموعة غير معروفة تُنشأ تلقائيًا بعنوان القسم الجانبي. (تطبيق على مستوى الواجهة كبقية النموذج.)
 */
export type NavPageInput = { id: string; ar: string; en: string; group: string; groupAr?: string; groupEn?: string };
export function registerNavPages(list: NavPageInput[]): string[] {
  const added: string[] = [];
  for (const it of list) {
    if (!it.id || PAGE_BY_ID.has(it.id)) continue;
    let g = PERM_GROUPS.find((x) => x.id === it.group);
    if (!g) { g = { id: it.group, ar: it.groupAr || it.group, en: it.groupEn || it.group, pages: [] }; PERM_GROUPS.push(g); }
    const def = P(it.id, it.ar, it.en); g.pages.push(def); PERM_PAGES.push(def); PAGE_IDS.push(it.id); PAGE_BY_ID.set(it.id, def); added.push(it.id);
  }
  return added;
}

export type ActionMap = Record<string, Action[]>;
export type Access = { pages: string[] | null; actions: ActionMap | null };

/** هل المستخدم يملك الصفحة؟ (null = كل الصفحات). */
export const hasPage = (pages: string[] | null | undefined, id: string): boolean => !pages || pages.includes(id);

/**
 * هل يُسمح بإجراء على صفحة؟
 * الأدمن دائمًا نعم · pages=null و actions=null → نعم (سلوك قديم) · الصفحة غير مسموحة → لا ·
 * actions=null → نعم لكل إجراءات الصفحة · وإلا فقط المدرَج صراحةً.
 */
export function canDo(a: Access & { isAdmin?: boolean }, page: string, action: Action): boolean {
  if (a.isAdmin) return true;
  if (!hasPage(a.pages, page)) return false;
  if (!a.actions) return true;
  return (a.actions[page] || []).includes(action);
}

/** تنظيف بيانات قادمة من قاعدة البيانات/الواجهة: يحذف المجهول ويقصر الإجراءات على الصفحات الممنوحة والمعرّفة لها. */
export function sanitize(pages: unknown, actions: unknown): Access {
  const p = Array.isArray(pages) ? Array.from(new Set(pages.filter((x): x is string => typeof x === "string" && PAGE_BY_ID.has(x)))) : null;
  const pg = p && p.length ? p : null;                                  // قائمة فارغة تُعامل كـ«كل الصفحات» (سلوك AuthContext الحالي)
  let am: ActionMap | null = null;
  if (actions && typeof actions === "object" && !Array.isArray(actions)) {
    am = {};
    for (const [k, v] of Object.entries(actions as Record<string, unknown>)) {
      const def = PAGE_BY_ID.get(k); if (!def || !Array.isArray(v) || (pg && !pg.includes(k))) continue;
      const list = Array.from(new Set(v.filter((x): x is Action => typeof x === "string" && def.actions.includes(x as Action))));
      am[k] = ACTION_IDS.filter((x) => list.includes(x));
    }
  }
  return { pages: pg, actions: am };
}

// ── قوالب الأدوار الجاهزة ──
export type Template = { id: string; ar: string; en: string; descAr: string; descEn: string; access: Access };
const grant = (ids: string[], pick: (p: PermPage) => Action[]): ActionMap => Object.fromEntries(ids.map((i) => [i, pick(pageDef(i)!)]));
const ids = (...x: string[]) => x;
const NO_DELETE = (p: PermPage): Action[] => p.actions.filter((a) => a !== "delete");
const READ_EXPORT = (p: PermPage): Action[] => p.actions.filter((a) => a === "export");
const CREATE_ONLY = (p: PermPage): Action[] => p.actions.filter((a) => a === "create" || a === "export");
const MANAGER_PAGES = PAGE_IDS.filter((x) => x !== "shop-settings");
const ACC_PAGES = ids("dashboard", "accounting", "financial-report", "reports", "reports-center", "business-analytics", "monthly-financial", "report-builder", "sales-reconciliation", "purchases", "purchase-invoices", "purchase-returns", "supplier-payments", "fixed-expenses", "alerts");
const INV_PAGES = ids("dashboard", "search", "inventory", "stock-adjustments", "item-movement", "inventory-analytics", "orders", "alerts");
const CASH_PAGES = ids("dashboard", "pos", "sales-invoice", "quotation", "search");
const VIEW_PAGES = ids("dashboard", "reports", "reports-center", "business-analytics", "monthly-financial", "inventory-analytics", "alerts");
export const SYSTEM_TEMPLATES: Template[] = [
  { id: "full", ar: "وصول كامل", en: "Full access", descAr: "كل الصفحات وكل الإجراءات.", descEn: "All pages, all actions.", access: { pages: null, actions: null } },
  { id: "manager", ar: "مدير فرع", en: "Branch manager", descAr: "كل الصفحات عدا إعدادات الشركة، بلا حذف.", descEn: "All pages except company settings; no delete.", access: { pages: MANAGER_PAGES, actions: grant(MANAGER_PAGES, NO_DELETE) } },
  { id: "accountant", ar: "محاسب", en: "Accountant", descAr: "الحسابات والتقارير والمشتريات مع الاعتماد.", descEn: "Accounting, reports and purchasing with approval.", access: { pages: ACC_PAGES, actions: grant(ACC_PAGES, NO_DELETE) } },
  { id: "inventory", ar: "مشرف مخزون", en: "Inventory supervisor", descAr: "المخزون والجرد والطلبات.", descEn: "Inventory, stock counts and orders.", access: { pages: INV_PAGES, actions: grant(INV_PAGES, NO_DELETE) } },
  { id: "cashier", ar: "كاشير", en: "Cashier", descAr: "نقطة البيع والفواتير وعروض الأسعار فقط.", descEn: "POS, invoices and quotations only.", access: { pages: CASH_PAGES, actions: grant(CASH_PAGES, CREATE_ONLY) } },
  { id: "viewer", ar: "عرض وتقارير فقط", en: "Read-only & reports", descAr: "اطلاع على التقارير وتصديرها دون أي تعديل.", descEn: "View and export reports, no changes.", access: { pages: VIEW_PAGES, actions: grant(VIEW_PAGES, READ_EXPORT) } },
];
const norm = (a: Access): string => JSON.stringify({ p: a.pages ? [...a.pages].sort() : null, a: a.actions ? Object.keys(a.actions).sort().map((k) => [k, [...(a.actions![k] || [])].sort()]) : null });
/** يتعرّف على القالب المطابق تمامًا (أو null = مخصّص). */
export function matchTemplate(a: Access, extra: Template[] = []): Template | null {
  const s = sanitize(a.pages, a.actions); const key = norm(s);
  return [...SYSTEM_TEMPLATES, ...extra].find((t) => norm(sanitize(t.access.pages, t.access.actions)) === key) ?? null;
}
/** يمنح/يسحب صفحة مع إدارة إجراءاتها: عند المنح يأخذ كل إجراءاتها (عند وجود خريطة)، وعند السحب تُحذف. */
export function togglePage(a: Access, page: string, on: boolean): Access {
  const cur = a.pages ?? PAGE_IDS; const pages = on ? Array.from(new Set([...cur, page])) : cur.filter((x) => x !== page);
  const actions = a.actions ? { ...a.actions } : null;
  if (actions) { if (on) actions[page] = a.actions![page] ?? [...(pageDef(page)?.actions ?? [])]; else delete actions[page]; }
  return { pages, actions };
}
export function toggleAction(a: Access, page: string, action: Action, on: boolean): Access {
  const def = pageDef(page); if (!def || !def.actions.includes(action)) return a;
  const base: ActionMap = a.actions ? { ...a.actions } : Object.fromEntries((a.pages ?? PAGE_IDS).map((p) => [p, [...(pageDef(p)?.actions ?? [])]]));
  const cur = new Set(base[page] ?? []); on ? cur.add(action) : cur.delete(action); base[page] = ACTION_IDS.filter((x) => cur.has(x));
  return { pages: a.pages, actions: base };
}
/** ملخص نصي قصير لعرضه في القوائم. */
export function summarize(a: Access, isAdmin: boolean, t: (en: string, ar: string) => string, extra: Template[] = []): string {
  if (isAdmin) return t("Administrator", "أدمن");
  const m = matchTemplate(a, extra); if (m) return t(m.en, m.ar);
  const n = a.pages ? a.pages.length : PAGE_IDS.length; return t(`Custom · ${n} pages`, `مخصّص · ${n} صفحة`);
}
export type AccessDiff = { addedPages: string[]; removedPages: string[]; actionChanges: number };
export function diffAccess(before: Access, after: Access): AccessDiff {
  const b = new Set(before.pages ?? PAGE_IDS), a = new Set(after.pages ?? PAGE_IDS);
  let changes = 0; const pgs = Array.from(new Set([...b, ...a]));
  for (const p of pgs) { const x = before.actions ? (before.actions[p] ?? []) : (pageDef(p)?.actions ?? []); const y = after.actions ? (after.actions[p] ?? []) : (pageDef(p)?.actions ?? []); if (a.has(p) && b.has(p) && x.join() !== y.join()) changes++; }
  return { addedPages: [...a].filter((x) => !b.has(x)), removedPages: [...b].filter((x) => !a.has(x)), actionChanges: changes };
}
