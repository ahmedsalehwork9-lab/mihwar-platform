-- تراجع 20261127_admin_permissions.sql (لا يعيد فتح الثغرة عمدًا إلا إن طلبتَ ذلك بإلغاء تعليق آخر سطرين)
drop function if exists public.admin_set_user_access(uuid, jsonb, jsonb, text, boolean, boolean, integer[], text);
drop table if exists public.permission_audit;
drop function if exists public.permission_audit_immutable();
drop table if exists public.permission_templates;
-- الحارس يبقى (يحمي الأعمدة الحساسة) لكن بدون عمود action_permissions قبل حذفه:
create or replace function public.profiles_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then return new; end if;
  if new.id is distinct from old.id or new.is_admin is distinct from old.is_admin or new.role is distinct from old.role
     or new.is_active is distinct from old.is_active or new.store_id is distinct from old.store_id or new.email is distinct from old.email
     or new.page_permissions is distinct from old.page_permissions then
    raise exception 'not allowed to change protected profile fields' using errcode = '42501';
  end if;
  return new;
end $$;
alter table public.profiles drop column if exists action_permissions;
-- ⚠ حذف الحارس يعيد الثغرة:
-- drop trigger if exists profiles_guard_trg on public.profiles; drop function if exists public.profiles_guard();
