# MIHWAR — Phase 01: Sales Entry (فاتورة المبيعات)

## ما الذي تغيّر (ملفات React فقط + SQL مقترح منفصل)
| الملف | النوع |
|---|---|
| src/pages/sales/SalesInvoicePage.tsx | جديد |
| src/pages/sales/salesInvoiceCalc.ts | جديد (يعيد استخدام invoiceTotals) |
| src/pages/sales/salesInvoiceApi.ts | جديد |
| src/pages/sales/salesInvoicePrint.ts | جديد |
| src/App.tsx | تعديل: سطران (lazy import + route `sales-invoice`) |
| src/components/Layout.tsx | تعديل: 3 أسطر (نوع Page + التسمية + عنصر القائمة) |
| sql/P01_sales_invoice_schema_and_rpc.sql | **مقترح — لم يُطبَّق على الإنتاج** |
| sql/P01_rollback.sql | تراجع P01 |

## التركيب (PowerShell) — من جذر المشروع
```powershell
# 1) نسخة احتياطية من الملفين المعدّلين
Copy-Item src\App.tsx src\App.tsx.bak_p01
Copy-Item src\components\Layout.tsx src\components\Layout.tsx.bak_p01

# 2) فكّ الضغط فوق المشروع (يكتب 6 ملفات فقط)
Expand-Archive -Path .\mihwar-phase01-sales.zip -DestinationPath .\_p01 -Force
New-Item -ItemType Directory -Force src\pages\sales | Out-Null
Copy-Item _p01\mihwar-phase01-sales\src\pages\sales\* src\pages\sales\ -Force
Copy-Item _p01\mihwar-phase01-sales\src\App.tsx src\App.tsx -Force
Copy-Item _p01\mihwar-phase01-sales\src\components\Layout.tsx src\components\Layout.tsx -Force

# 3) تحقق
npx tsc --noEmit -p tsconfig.app.json
npx vite build
```
> إن كان `App.tsx`/`Layout.tsx` لديك قد تغيّر عن نسختي، لا تستبدلهما؛ طبّق الأسطر الخمسة يدويًا (انظر الجدول).

## SQL (بعد موافقتك الصريحة فقط)
شغّل `sql/P01_sales_invoice_schema_and_rpc.sql` في Supabase SQL Editor. قبل ذلك تظهر الشاشة بشريط تنبيه ويكون الترحيل معطّلًا (لا يُحفظ شيء).
التراجع: `sql/P01_rollback.sql` (يحذف الدالة وجدول المسودات والفهرس، ويترك الأعمدة المضافة).
