// =============================================================
// src/pages/lib/permPages.ts
// قائمة الصفحات التشغيلية القابلة للتحكم في صلاحياتها لكل مستخدم.
// تُستخدم في Layout (لفلترة القائمة) وفي نافذة الصلاحيات بصفحة المستخدمين.
// =============================================================

export type PermPage = { id: string; ar: string; en: string };

export const PERM_PAGES: PermPage[] = [
  { id: "dashboard", ar: "الرئيسية", en: "Dashboard" },
  { id: "search", ar: "المنتجات", en: "Products" },
  { id: "inventory", ar: "المخزون", en: "Inventory" },
  { id: "orders", ar: "الطلبات", en: "Orders" },
  { id: "reports", ar: "التقارير", en: "Reports" },
  { id: "sales-reconciliation", ar: "تسوية المبيعات", en: "Sales Reconciliation" },
  { id: "purchases", ar: "المشتريات", en: "Purchases" },
  { id: "fixed-expenses", ar: "المصروفات الثابتة", en: "Fixed Expenses" },
  { id: "financial-report", ar: "التقرير المالي", en: "Financial Report" },
  { id: "reports-center", ar: "مركز التقارير", en: "Reports Center" },
  { id: "alerts", ar: "التنبيهات", en: "Alerts" },
  { id: "shop-settings", ar: "إعدادات المحل", en: "Shop Settings" },
];
