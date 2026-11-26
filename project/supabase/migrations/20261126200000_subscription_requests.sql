-- =============================================================
-- subscription_requests — طلبات الاشتراك/التجربة من صفحة الهبوط
-- مراجعة قبل التنفيذ: الجدول جديد ولا يلمس أي جدول قائم.
-- الزائر (anon) يستطيع الإدراج فقط (لا قراءة). الأدمن فقط يقرأ ويحدّث.
-- =============================================================
create table if not exists public.subscription_requests (
  id              bigint generated always as identity primary key,
  created_at      timestamptz not null default now(),
  business_name   text not null check (char_length(btrim(business_name)) between 2 and 120),
  contact_name    text not null check (char_length(btrim(contact_name)) between 2 and 120),
  phone           text not null check (phone ~ '^\+[0-9]{8,15}$'),
  email           text not null check (char_length(email) between 5 and 160 and email ~* '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$'),
  activity        text not null check (char_length(activity) between 2 and 100),
  branches_count  integer not null check (branches_count between 1 and 500),
  plan            text not null check (plan in ('trial','monthly','annual','enterprise')),
  notes           text check (notes is null or char_length(notes) <= 1000),
  lang            text check (lang is null or lang in ('ar','en')),
  source          text not null default 'landing',
  idempotency_key text not null unique check (char_length(idempotency_key) between 8 and 80),
  status          text not null default 'new' check (status in ('new','contacted','converted','rejected')),
  admin_note      text check (admin_note is null or char_length(admin_note) <= 1000),
  handled_at      timestamptz
);
create index if not exists subscription_requests_status_created_idx on public.subscription_requests (status, created_at desc);

alter table public.subscription_requests enable row level security;

-- إدراج للزوار والمستخدمين المسجلين، بحالة new فقط (لا يستطيع الزائر تحديد الحالة أو ملاحظات الإدارة)
drop policy if exists "sub_req_insert_public" on public.subscription_requests;
create policy "sub_req_insert_public" on public.subscription_requests
  for insert to anon, authenticated
  with check (status = 'new' and admin_note is null and handled_at is null);

-- قراءة وتحديث للأدمن فقط
drop policy if exists "sub_req_admin_select" on public.subscription_requests;
create policy "sub_req_admin_select" on public.subscription_requests
  for select to authenticated
  using (public.is_admin());

drop policy if exists "sub_req_admin_update" on public.subscription_requests;
create policy "sub_req_admin_update" on public.subscription_requests
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- صلاحيات الجدول: إدراج فقط للزائر؛ لا حذف لأحد من الواجهة
revoke all on public.subscription_requests from anon, authenticated;
grant insert on public.subscription_requests to anon, authenticated;
grant select, update on public.subscription_requests to authenticated;
-- ملاحظة: anon لا يملك select، لذا يجب ألا يطلب الكود returning (الكود يستخدم insert بدون select).
