// =============================================================
// src/components/landing/landingContent.ts — محتوى صفحة الهبوط (ثنائي اللغة).
// كل بند هنا مُتحقَّق من وجوده فعليًا في المشروع (انظر تقرير التنفيذ). لا ميزات غير موجودة.
// =============================================================
export type Bi = { en: string; ar: string };
export const b = (en: string, ar: string): Bi => ({ en, ar });
export type IconName = "calc" | "cart" | "bag" | "box" | "branch" | "pos" | "chart" | "bell" | "print" | "wallet" | "tag" | "settings" | "users" | "globe" | "cloud" | "layers" | "shield";

export const CAPABILITIES: { icon: IconName; t: Bi }[] = [
  { icon: "cloud", t: b("Cloud-based", "سحابي بالكامل") },
  { icon: "globe", t: b("Arabic & English, RTL/LTR", "عربي وإنجليزي RTL/LTR") },
  { icon: "branch", t: b("Multi-branch", "متعدد الفروع") },
  { icon: "layers", t: b("Full document cycle", "دورة مستندية متكاملة") },
  { icon: "bell", t: b("Smart alerts centre", "مركز تنبيهات ذكي") },
  { icon: "shield", t: b("Roles & permissions", "أدوار وصلاحيات") },
];

export const MODULES: { icon: IconName; title: Bi; points: Bi[] }[] = [
  { icon: "calc", title: b("Accounting & finance", "المحاسبة والمالية"), points: [b("Chart of accounts, general ledger, journal entries", "شجرة الحسابات ودفتر الأستاذ والقيود"), b("Income statement, balance sheet, cash flows", "قائمة الدخل والميزانية والتدفقات النقدية"), b("Fixed assets & depreciation, treasuries & banks", "الأصول الثابتة والإهلاك والخزائن والبنوك")] },
  { icon: "cart", title: b("Sales", "المبيعات"), points: [b("Tax invoices, cash & credit, partial payments", "فواتير ضريبية ونقدي وآجل ودفعات جزئية"), b("Quotations convertible to invoices", "عروض أسعار تتحول إلى فواتير"), b("Sales returns & customer statements", "مرتجعات المبيعات وكشوف العملاء")] },
  { icon: "bag", title: b("Purchases", "المشتريات"), points: [b("Purchase invoices with supplier invoice & due dates", "فواتير مشتريات برقم فاتورة المورد وتواريخ الاستحقاق"), b("Purchase returns & supplier payments", "مرتجعات المشتريات ومدفوعات الموردين"), b("Inventory, expense & asset purchase kinds", "مشتريات مخزون ومصروفات وأصول")] },
  { icon: "box", title: b("Inventory", "إدارة المخزون"), points: [b("Stock by warehouse & item movement report", "رصيد بالمخازن وتقرير حركة الصنف"), b("Stocktake & adjustments", "الجرد والتسويات"), b("Low-stock and out-of-stock alerts", "تنبيهات النفاد وانخفاض الكمية")] },
  { icon: "branch", title: b("Branches", "إدارة الفروع"), points: [b("Branch data, warehouses & accounting link", "بيانات الفرع والمخازن والربط المحاسبي"), b("Per-branch print settings", "إعدادات طباعة لكل فرع"), b("Switch branch from the top bar", "التبديل بين الفروع من الشريط العلوي")] },
  { icon: "pos", title: b("Point of sale", "نقاط البيع POS"), points: [b("Fast cashier screen with cart & discounts", "شاشة كاشير سريعة بسلة وخصومات"), b("Cash and credit sales", "بيع نقدي وآجل"), b("Posts to the same accounting ledger", "ترحيل لنفس دفتر الحسابات")] },
  { icon: "chart", title: b("Reports & analytics", "التقارير والتحليلات"), points: [b("Financial statements with charts & drill-down", "قوائم مالية برسوم وتفاصيل الحسابات"), b("Purchases dashboard & supplier totals", "لوحة المشتريات وإجماليات الموردين"), b("Excel export & print", "تصدير Excel وطباعة")] },
];

export const NEW_FEATURES: { icon: IconName; title: Bi; text: Bi; img?: string }[] = [
  { icon: "bag", title: b("Advanced purchases dashboard", "لوحة مشتريات متطورة"), text: b("KPIs with period comparison, overdue and due-soon invoices, supplier totals and a 12-month trend.", "مؤشرات مع مقارنة بالفترة السابقة، فواتير متأخرة وقريبة الاستحقاق، إجماليات الموردين واتجاه 12 شهرًا."), img: "purchases" },
  { icon: "tag", title: b("Item price history", "متابعة تاريخ أسعار الأصناف"), text: b("Every price change is recorded per item so you can review how prices moved over time.", "كل تغيير في سعر الصنف يُسجَّل ليسهل مراجعة تطور الأسعار عبر الزمن.") },
  { icon: "chart", title: b("Purchases & cost movement analysis", "تحليل المشتريات وحركة التكاليف"), text: b("Spot items whose purchase cost changed versus the previous purchase, with percentage change.", "اكتشف الأصناف التي تغيّرت تكلفة شرائها عن آخر شراء، مع نسبة التغيّر.") },
  { icon: "settings", title: b("Company, branch & account settings", "إدارة إعدادات الفروع والحسابات"), text: b("One page for company settings, branch data, warehouses and the accounting link per branch.", "صفحة واحدة لإعدادات الشركة وبيانات الفروع والمخازن والربط المحاسبي لكل فرع."), img: "company" },
  { icon: "print", title: b("Document-cycle print templates", "تخصيص نماذج الطباعة للدورة المستندية"), text: b("Nine templates (quotation to journal voucher), Arabic / English / bilingual, with your logo beside MIHWAR CLOUD ERP.", "تسعة قوالب (من عرض السعر إلى قيد اليومية) بالعربية أو الإنجليزية أو ثنائية اللغة، بشعارك بجانب شعار MIHWAR CLOUD ERP."), img: "invoice" },
  { icon: "wallet", title: b("Cash & credit payment methods", "إدارة طرق الدفع النقدي والآجل"), text: b("Cash, credit and partial payments on sales and purchases, with receipt and payment vouchers.", "نقدي وآجل ودفعات جزئية في المبيعات والمشتريات، مع سندات القبض والصرف.") },
  { icon: "bell", title: b("Alerts centre", "مركز التنبيهات"), text: b("Stock, overdue suppliers/customers, draft journals and assets in one prioritised list with snooze and acknowledge.", "المخزون والمتأخرات والقيود المسودة والأصول في قائمة واحدة مرتبة بالأولوية مع الإخفاء المؤقت والاطلاع."), img: "alerts" },
];

export const BRANCH_POINTS: Bi[] = [
  b("Each branch has its own data, warehouses and accounting accounts", "لكل فرع بياناته ومخازنه وحساباته المحاسبية"),
  b("Company-level defaults with per-branch overrides", "افتراضيات على مستوى الشركة مع تخصيص لكل فرع"),
  b("Copy settings from one branch to another", "نسخ الإعدادات من فرع إلى آخر"),
  b("Activate or deactivate a branch without losing its data", "تفعيل الفرع أو إيقافه دون فقدان بياناته"),
  b("Roles and page permissions per user", "أدوار وصلاحيات صفحات لكل مستخدم"),
];
export const REPORT_POINTS: Bi[] = [
  b("Income statement, balance sheet and cash-flow views", "قائمة الدخل والميزانية والتدفقات النقدية"),
  b("Compare with the previous period and drill into any account", "مقارنة بالفترة السابقة والنزول لتفاصيل أي حساب"),
  b("Charts for revenue vs. costs and expense distribution", "رسوم للإيرادات مقابل التكاليف وتوزيع المصروفات"),
  b("Print and Excel export from every report", "طباعة وتصدير Excel من كل تقرير"),
];

export const DEMO_TABS: { id: string; label: Bi; img: string; caption: Bi }[] = [
  { id: "dashboard", label: b("Financial dashboard", "لوحة القوائم المالية"), img: "dashboard", caption: b("Income statement with KPIs and cost charts", "قائمة الدخل بمؤشرات ورسوم التكاليف") },
  { id: "purchases", label: b("Purchases", "المشتريات"), img: "purchases", caption: b("Purchases dashboard, price changes and supplier totals", "لوحة المشتريات وتغيّر الأسعار وإجماليات الموردين") },
  { id: "alerts", label: b("Alerts", "التنبيهات"), img: "alerts", caption: b("Prioritised alerts centre", "مركز التنبيهات المرتب بالأولوية") },
  { id: "assets", label: b("Fixed assets", "الأصول الثابتة"), img: "assets", caption: b("Assets register with depreciation", "سجل الأصول مع الإهلاك") },
  { id: "accounts", label: b("Chart of accounts", "شجرة الحسابات"), img: "accounts", caption: b("Hierarchical chart of accounts", "شجرة حسابات هرمية") },
  { id: "branches", label: b("Settings & printing", "الإعدادات والطباعة"), img: "branches", caption: b("Company & branch settings with print templates", "إعدادات الشركة والفروع مع نماذج الطباعة") },
];

export const PLAN_CARDS: { id: "trial" | "monthly" | "annual" | "enterprise"; title: Bi; tag?: Bi; points: Bi[] }[] = [
  { id: "trial", title: b("Free trial", "تجربة مجانية"), tag: b("Free to start", "ابدأ مجانًا"), points: [b("All core modules", "كل الوحدات الأساسية"), b("Trial length agreed with our team", "مدة التجربة بالاتفاق مع فريقنا"), b("No setup fee, no credit card", "بدون رسوم تأسيس أو بطاقة")] },
  { id: "monthly", title: b("Monthly", "اشتراك شهري"), points: [b("Flexible month-to-month", "مرونة شهر بشهر"), b("Technical support", "دعم فني"), b("Pricing shared on request", "الأسعار تُرسل عند الطلب")] },
  { id: "annual", title: b("Annual", "اشتراك سنوي"), tag: b("Best value", "الأفضل قيمة"), points: [b("Discounted yearly term", "مدة سنوية بسعر أوفر"), b("Technical support", "دعم فني"), b("Pricing shared on request", "الأسعار تُرسل عند الطلب")] },
  { id: "enterprise", title: b("Enterprise", "مؤسسات"), points: [b("Many branches & users", "فروع ومستخدمون كثيرون"), b("Onboarding assistance", "مساعدة في التهيئة"), b("Custom quote", "عرض سعر مخصص")] },
];

export const FAQS: { q: Bi; a: Bi }[] = [
  { q: b("What is MIHWAR CLOUD ERP?", "ما هو MIHWAR CLOUD ERP؟"), a: b("A cloud ERP that brings accounting, sales, purchases, inventory, branches and reports into one platform.", "منصة ERP سحابية تجمع المحاسبة والمبيعات والمشتريات والمخزون والفروع والتقارير في مكان واحد.") },
  { q: b("Do I need to install anything?", "هل أحتاج لتثبيت برنامج؟"), a: b("No. It runs in the browser from any device with internet access.", "لا. يعمل من المتصفح على أي جهاز متصل بالإنترنت.") },
  { q: b("Does it support Arabic and English?", "هل يدعم العربية والإنجليزية؟"), a: b("Yes. The interface switches between Arabic (RTL) and English (LTR), and documents can print in Arabic, English or both.", "نعم. تتبدل الواجهة بين العربية (RTL) والإنجليزية (LTR)، ويمكن طباعة المستندات بالعربية أو الإنجليزية أو بالاثنتين.") },
  { q: b("Can I manage several branches?", "هل يمكنني إدارة عدة فروع؟"), a: b("Yes. Each branch has its own warehouses, settings and accounting link, with company-level defaults.", "نعم. لكل فرع مخازنه وإعداداته وربطه المحاسبي، مع افتراضيات على مستوى الشركة.") },
  { q: b("Can invoices carry my company logo?", "هل تظهر فواتيري بشعار شركتي؟"), a: b("Yes. Add your logo link in the branch data; printed documents then show your logo beside the MIHWAR CLOUD ERP logo (both can be switched off).", "نعم. أضف رابط شعارك في بيانات الفرع، فتظهر المستندات المطبوعة بشعارك بجانب شعار MIHWAR CLOUD ERP (ويمكن إيقاف أيٍّ منهما).") },
  { q: b("How does the free trial work?", "كيف تعمل التجربة المجانية؟"), a: b("Send a request; our team contacts you to set up your account. The trial has no fixed length in advance: we agree it with you based on your business size. No setup fee and no credit card.", "أرسل طلبك وسيتواصل معك فريقنا لتجهيز حسابك. مدة التجربة غير محددة مسبقًا؛ نتفق عليها معك حسب حجم منشأتك، بدون رسوم تأسيس أو بطاقة ائتمانية.") },
  { q: b("Can I export my reports?", "هل يمكنني تصدير التقارير؟"), a: b("Yes, reports can be printed or exported to Excel.", "نعم، يمكن طباعة التقارير أو تصديرها إلى Excel.") },
  { q: b("Who can see my data?", "من يستطيع رؤية بياناتي؟"), a: b("Access is controlled by user roles and page permissions; each company's data is separated from other companies.", "الوصول مضبوط بأدوار المستخدمين وصلاحيات الصفحات، وبيانات كل شركة منفصلة عن غيرها.") },
];

export type PrintDoc = { kind: string; stage: "sales" | "purchases" | "accounting"; t: Bi };
export const PRINT_STAGES: { id: PrintDoc["stage"]; t: Bi }[] = [
  { id: "sales", t: b("Sales cycle", "دورة المبيعات") }, { id: "purchases", t: b("Purchases cycle", "دورة المشتريات") }, { id: "accounting", t: b("Accounting", "المحاسبة") },
];
export const PRINT_DOCS: PrintDoc[] = [
  { kind: "quotation", stage: "sales", t: b("Quotation", "عرض سعر") },
  { kind: "sales_invoice", stage: "sales", t: b("Sales tax invoice", "فاتورة ضريبية — مبيعات") },
  { kind: "receipt_voucher", stage: "sales", t: b("Receipt voucher", "سند قبض") },
  { kind: "sales_return", stage: "sales", t: b("Credit note (sales return)", "إشعار دائن — مرتجع مبيعات") },
  { kind: "purchase_order", stage: "purchases", t: b("Purchase order", "أمر شراء") },
  { kind: "purchase_invoice", stage: "purchases", t: b("Purchase tax invoice", "فاتورة ضريبية — مشتريات") },
  { kind: "payment_voucher", stage: "purchases", t: b("Payment voucher", "سند صرف") },
  { kind: "purchase_return", stage: "purchases", t: b("Debit note (purchase return)", "إشعار مدين — مرتجع مشتريات") },
  { kind: "journal_voucher", stage: "accounting", t: b("Journal voucher", "قيد يومية") },
];
export const PRINT_POINTS: Bi[] = [
  b("Arabic, English or bilingual documents", "مستندات بالعربية أو الإنجليزية أو ثنائية اللغة"),
  b("Your logo beside MIHWAR CLOUD ERP (each can be switched off)", "شعار منشأتك بجانب شعار MIHWAR CLOUD ERP (ويمكن إيقاف أيٍّ منهما)"),
  b("A4, A5 or 80mm receipt paper, set per branch", "ورق A4 أو A5 أو إيصال 80مم، يُضبط لكل فرع"),
  b("Company data and VAT number printed automatically", "بيانات الشركة والرقم الضريبي تُطبع تلقائيًا"),
];
