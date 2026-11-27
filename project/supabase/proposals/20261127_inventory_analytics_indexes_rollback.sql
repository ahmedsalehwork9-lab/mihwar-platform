-- التراجع عن مقترح الفهارس (آمن: حذف فهارس فقط).
drop index concurrently if exists public.idx_products_org_id;
drop index concurrently if exists public.idx_gl_smoves_org_prod_date;
drop index concurrently if exists public.idx_gl_sinv_org_date;
