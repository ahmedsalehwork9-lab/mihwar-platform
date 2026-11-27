-- =============================================================
-- مقترح للمراجعة فقط — لم يُنفَّذ على أي قاعدة بيانات.
-- الغرض: تسريع مركز تقارير المخزون (src/pages/inventory/analytics) عند كبر البيانات.
-- الفحص (قراءة فقط) أظهر أن الفهارس التالية غير موجودة:
--   • products: لا فهرس على organization_id (الاستعلام: where organization_id = ? order by id)
--   • gl_stock_moves: لا فهرس مركّب (organization_id, product_id, created_at) لحساب آخر حركة/بيع لكل صنف
--   • gl_sales_invoices: لا فهرس (organization_id, date) لنافذة فترة المبيعات
-- كلها فهارس فقط: لا تغيير في الجداول أو الأعمدة أو السياسات (RLS) ولا كشف لأي بيانات.
-- ملاحظة: CREATE INDEX CONCURRENTLY لا يعمل داخل معاملة (لا تغلّفه بـ BEGIN/COMMIT).
-- =============================================================
create index concurrently if not exists idx_products_org_id         on public.products (organization_id, id);
create index concurrently if not exists idx_gl_smoves_org_prod_date on public.gl_stock_moves (organization_id, product_id, created_at);
create index concurrently if not exists idx_gl_sinv_org_date        on public.gl_sales_invoices (organization_id, date);
