// =============================================================
// src/pages/lib/dispLabels.ts
// عرض ثنائي اللغة لتسميات عربية «مخزّنة كقيم» (قنوات، أسباب، طرق دفع…).
// القيمة المخزَّنة/المقارَنة تبقى كما هي بالعربية؛ نترجم نص العرض فقط.
// =============================================================
import { tNow } from "../../context/LanguageContext";

const EN: Record<string, string> = {
  // طرق الدفع / القنوات
  "نقدي": "Cash", "شبكة (مدى)": "Card (Mada)", "تحويل بنكي": "Bank transfer", "استقطاع": "Deduction", "آجل": "On credit",
  "كيتا": "Keeta", "هنقرستيشن": "HungerStation", "جاهز": "Jahez", "مرتجع (−)": "Refund (−)", "مرتجع": "Refund",
  // أنواع الراتب
  "شهري": "Monthly", "أسبوعي": "Weekly", "يومي": "Daily",
  // بنود المصروفات الثابتة الافتراضية
  "إيجار الفرع": "Branch rent", "كهرباء ومياه": "Electricity & water", "إنترنت/اتصالات": "Internet/telecom",
  "نظافة وصيانة ثابتة": "Cleaning & fixed maintenance", "اشتراكات وبرامج": "Subscriptions & software",
  "تمويل/استقطاع": "Financing/deductions", "مصروفات ثابتة أخرى": "Other fixed expenses",
  // الشفتات
  "الشفت الصباحي": "Morning shift", "الشفت المسائي": "Evening shift", "صباحي": "Morning", "مسائي": "Evening", "الاثنين": "Both", "— الشفت": "— Shift",
  // أسباب الفروقات
  "مبلغ مسترد (استرجاع)": "Refunded amount (return)", "فكة / باقي نقدي ناقص": "Change / missing cash balance", "سحب نقدي للمصاريف": "Cash withdrawn for expenses",
  "طلب ملغي بعد الدفع": "Order cancelled after payment", "خطأ إدخال الكاشير": "Cashier entry error", "ضيافة / على حساب المحل": "Hospitality / on the house",
  "إكرامية": "Tip", "عجز غير مبرر": "Unexplained shortage", "فرق تقريب": "Rounding difference", "أخرى": "Other",
  // تصنيفات ووحدات المشتريات
  "مواد خام": "Raw materials", "مشروبات": "Beverages", "مخبوزات": "Bakery", "سلطة": "Salad", "سندوتشات": "Sandwiches",
  "تغليف وتعبئة": "Packaging", "مستهلكات": "Consumables", "صيانة": "Maintenance",
  "قطعة": "Piece", "كجم": "kg", "جرام": "g", "لتر": "Litre", "مل": "ml", "كرتون": "Carton", "علبة": "Box", "كيس": "Bag", "حبة": "Each", "باكت": "Pack", "صينية": "Tray",
  "آجل (على الحساب)": "On credit (on account)",
  // أنواع المشتريات
  "مخزون": "Inventory", "مصروف": "Expense", "أصل ثابت": "Fixed asset",
};

/** يرجع النص المعروض: العربي كما هو في وضع العربية، والإنجليزي المقابل في وضع الإنجليزية (إن وُجد). */
export const dl = (ar: string): string => (EN[ar] ? tNow(EN[ar], ar) : ar);
