-- ROLLBACK لـ P01 — يحذف الدالة والجدول والفهرس. الأعمدة الجديدة على gl_sales_invoices
-- تُترك عمدًا (حذفها قد يفقد فواتير أُنشئت بها: due_date/discount_total/…)؛ وهي
-- additive وآمنة. لحذفها بعد التأكد (يدويًا، بموافقتك): alter table … drop column ….
begin;
drop function if exists public.post_sales_invoice(bigint, jsonb);
drop table if exists public.gl_sales_invoice_drafts;
drop index if exists public.gl_sales_invoices_idem_uidx;
commit;
