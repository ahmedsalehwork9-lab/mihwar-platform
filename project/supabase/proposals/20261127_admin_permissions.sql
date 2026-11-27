-- =============================================================
-- 20261127_admin_permissions.sql  (مقترح — لم يُطبَّق بعد)
-- الغرض:
--  1) إغلاق ثغرة: أي مستخدم مسجّل كان يستطيع تعديل صفّه في profiles بما فيه is_admin/role/page_permissions.
--  2) إضافة صلاحيات الإجراءات لكل مستخدم (action_permissions) + قوالب أدوار مخصّصة + سجل تدقيق.
--  3) دالة واحدة آمنة (admin_set_user_access) لتغيير صلاحيات/أعلام مستخدم مع حماية «آخر أدمن» وتدقيق.
-- إضافي بلا حذف بيانات. التراجع: 20261127_admin_permissions_rollback.sql
-- =============================================================

-- ── 1) أعمدة جديدة ──
alter table public.profiles add column if not exists action_permissions jsonb;

-- ── 2) حارس الأعمدة الحساسة ──
-- المسموح: الأدمن، أو الخدمة (auth.uid() = null: edge functions / triggers). غير ذلك لا يغيّر إلا بياناته غير الحساسة.
create or replace function public.profiles_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then return new; end if;
  if new.id               is distinct from old.id
  or new.is_admin         is distinct from old.is_admin
  or new.role             is distinct from old.role
  or new.is_active        is distinct from old.is_active
  or new.store_id         is distinct from old.store_id
  or new.email            is distinct from old.email
  or new.page_permissions is distinct from old.page_permissions
  or new.action_permissions is distinct from old.action_permissions then
    raise exception 'not allowed to change protected profile fields' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists profiles_guard_trg on public.profiles;
create trigger profiles_guard_trg before update on public.profiles for each row execute function public.profiles_guard();

-- أي أدمن (وليس معرّفًا ثابتًا واحدًا) يرى كل المستخدمين
drop policy if exists profiles_select_admin on public.profiles;
create policy profiles_select_admin on public.profiles for select using (public.is_admin());

-- تقليل الامتيازات الزائدة (RLS تبقى كما هي)
revoke truncate, references, trigger on public.profiles from anon, authenticated;
revoke insert, update, delete on public.profiles from anon;

-- ── 3) قوالب أدوار مخصّصة ──
create table if not exists public.permission_templates (
  id bigint generated always as identity primary key,
  name text not null,
  name_en text,
  description text,
  page_permissions jsonb,
  action_permissions jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists permission_templates_name_uidx on public.permission_templates (lower(name));
alter table public.permission_templates enable row level security;
drop policy if exists perm_tpl_admin_all on public.permission_templates;
create policy perm_tpl_admin_all on public.permission_templates for all using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.permission_templates to authenticated;

-- ── 4) سجل تدقيق (إضافة فقط) ──
create table if not exists public.permission_audit (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid default auth.uid(),
  target_user uuid,
  action text not null,
  before_data jsonb,
  after_data jsonb,
  note text
);
create index if not exists permission_audit_target_idx on public.permission_audit (target_user, at desc);
create index if not exists permission_audit_at_idx on public.permission_audit (at desc);
alter table public.permission_audit enable row level security;
drop policy if exists perm_audit_admin_select on public.permission_audit;
create policy perm_audit_admin_select on public.permission_audit for select using (public.is_admin());
revoke all on public.permission_audit from anon, authenticated;
grant select on public.permission_audit to authenticated;
create or replace function public.permission_audit_immutable() returns trigger language plpgsql as $$
begin raise exception 'permission_audit is append-only'; end $$;
drop trigger if exists permission_audit_no_change on public.permission_audit;
create trigger permission_audit_no_change before update or delete on public.permission_audit for each row execute function public.permission_audit_immutable();

-- ── 5) الدالة الوحيدة لتغيير صلاحيات مستخدم ──
-- p_pages: null = وصول كامل · مصفوفة نصوص = الصفحات المسموحة (غير فارغة)
-- p_actions: null = كل الإجراءات · كائن {page:[action,...]}
-- p_role/p_is_active/p_is_admin: null = بلا تغيير · p_branches: null = بلا تغيير، مصفوفة = تستبدل user_branches
create or replace function public.admin_set_user_access(
  p_user uuid, p_pages jsonb, p_actions jsonb,
  p_role text default null, p_is_active boolean default null, p_is_admin boolean default null,
  p_branches integer[] default null, p_note text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  b public.profiles%rowtype; v_other_admins int; k text; v jsonb; a text;
  allowed_actions constant text[] := array['create','edit','delete','approve','export'];
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  select * into b from public.profiles where id = p_user for update;
  if not found then raise exception 'user not found'; end if;

  if p_pages is not null then
    if jsonb_typeof(p_pages) <> 'array' or jsonb_array_length(p_pages) = 0 then raise exception 'p_pages must be null (full access) or a non-empty array'; end if;
    if exists (select 1 from jsonb_array_elements(p_pages) e where jsonb_typeof(e) <> 'string') then raise exception 'p_pages must contain strings'; end if;
  end if;
  if p_actions is not null then
    if jsonb_typeof(p_actions) <> 'object' then raise exception 'p_actions must be an object'; end if;
    for k, v in select * from jsonb_each(p_actions) loop
      if jsonb_typeof(v) <> 'array' then raise exception 'actions for % must be an array', k; end if;
      for a in select jsonb_array_elements_text(v) loop
        if not (a = any (allowed_actions)) then raise exception 'unknown action %', a; end if;
      end loop;
    end loop;
  end if;
  if p_role is not null and p_role not in ('admin','employee','shop_owner') then raise exception 'unknown role %', p_role; end if;

  -- حماية: لا تُزل آخر أدمن فعّال، ولا تُلغِ/تُجمّد نفسك
  if (p_is_admin is false or p_is_active is false) and b.is_admin then
    select count(*) into v_other_admins from public.profiles where is_admin and is_active and id <> p_user;
    if v_other_admins = 0 then raise exception 'cannot remove or deactivate the last active admin'; end if;
  end if;
  if p_user = auth.uid() and (p_is_admin is false or p_is_active is false) then raise exception 'you cannot demote or deactivate yourself'; end if;

  update public.profiles set
    page_permissions   = p_pages,
    action_permissions = p_actions,
    role      = coalesce(p_role, role),
    is_active = coalesce(p_is_active, is_active),
    is_admin  = coalesce(p_is_admin, is_admin)
  where id = p_user;

  if p_branches is not null then
    delete from public.user_branches where user_id = p_user;
    insert into public.user_branches(user_id, branch_id) select p_user, x from (select distinct unnest(p_branches) x) s;
  end if;

  insert into public.permission_audit(actor, target_user, action, before_data, after_data, note)
  values (auth.uid(), p_user, 'set_access',
    jsonb_build_object('pages', b.page_permissions, 'actions', b.action_permissions, 'role', b.role, 'is_active', b.is_active, 'is_admin', b.is_admin),
    jsonb_build_object('pages', p_pages, 'actions', p_actions, 'role', coalesce(p_role, b.role), 'is_active', coalesce(p_is_active, b.is_active), 'is_admin', coalesce(p_is_admin, b.is_admin), 'branches', p_branches),
    p_note);
end $$;
revoke all on function public.admin_set_user_access(uuid, jsonb, jsonb, text, boolean, boolean, integer[], text) from public, anon;
grant execute on function public.admin_set_user_access(uuid, jsonb, jsonb, text, boolean, boolean, integer[], text) to authenticated;
