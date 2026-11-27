-- =====================================================================
-- MIHWAR CLOUD ERP — Journal Entries Center (PROPOSAL — NOT APPLIED)
-- مراجعة فقط. لا تُطبَّق على قاعدة الإنتاج دون موافقة صريحة.
-- إضافية بالكامل (additive): لا تعدّل ولا تحذف أي قيد/سطر موجود، ولا تغيّر قيد CHECK للحالة
-- (تبقى الحالات draft/posted فقط، فتبقى كل التقارير الحالية سليمة).
-- الاعتماد يُمثَّل بعمود approval_state منفصل (none/pending/approved).
-- يتطلب وجود: my_organizations() ، my_branches() ، gl_accounts ، gl_journal_entries ، gl_journal_lines.
-- =====================================================================
begin;

-- 1) أعمدة جديدة على ترويسة القيد (كلها nullable/ذات قيمة افتراضية؛ القيود القديمة لا تتغير)
alter table public.gl_journal_entries
  add column if not exists approval_state text not null default 'none',
  add column if not exists approved_by   uuid,
  add column if not exists approved_at   timestamptz,
  add column if not exists posted_by     uuid,
  add column if not exists posted_at     timestamptz,
  add column if not exists reversed_of   bigint references public.gl_journal_entries(id),
  add column if not exists reversed_by   bigint references public.gl_journal_entries(id),
  add column if not exists reverse_reason text,
  add column if not exists currency_code text not null default 'SAR',
  add column if not exists fx_rate       numeric(18,6) not null default 1,
  add column if not exists external_ref  text,
  add column if not exists project       text,
  add column if not exists cost_center   text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'gl_je_approval_state_chk') then
    alter table public.gl_journal_entries add constraint gl_je_approval_state_chk check (approval_state in ('none','pending','approved'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'gl_je_fx_rate_chk') then
    alter table public.gl_journal_entries add constraint gl_je_fx_rate_chk check (fx_rate > 0);
  end if;
end $$;
create unique index if not exists gl_je_one_reversal_uidx on public.gl_journal_entries (reversed_of) where reversed_of is not null;  -- لا عكس مكرر
create index if not exists gl_je_org_date_idx   on public.gl_journal_entries (organization_id, date);
create index if not exists gl_je_org_status_idx on public.gl_journal_entries (organization_id, status);
create index if not exists gl_jl_entry_idx      on public.gl_journal_lines (entry_id);
create index if not exists gl_jl_account_idx    on public.gl_journal_lines (account_id);

-- 2) إعدادات مركز القيود لكل مؤسسة
create table if not exists public.gl_journal_settings (
  organization_id bigint primary key,
  require_approval boolean not null default false,       -- إن فُعّل: لا ترحيل بدون اعتماد
  lock_through date,                                      -- لا إنشاء/ترحيل/عكس بتاريخ <= هذا التاريخ (فترة مغلقة)
  attachment_required_over numeric(18,2),                 -- مبلغ يتطلب مرفقًا (لتقرير المراجعة فقط)
  high_amount_threshold numeric(18,2),                    -- حد «المبالغ المرتفعة» في تقرير المراجعة
  updated_at timestamptz not null default now()
);
alter table public.gl_journal_settings enable row level security;
drop policy if exists gl_je_settings_all on public.gl_journal_settings;
drop policy if exists gl_je_settings_sel on public.gl_journal_settings;
drop policy if exists gl_je_settings_ins on public.gl_journal_settings;
drop policy if exists gl_je_settings_upd on public.gl_journal_settings;
create policy gl_je_settings_sel on public.gl_journal_settings for select using (organization_id in (select public.my_organizations()));
-- تعديل إعدادات الرقابة (إقفال الفترة/الاعتماد) للمدير فقط
create policy gl_je_settings_ins on public.gl_journal_settings for insert with check (organization_id in (select public.my_organizations()) and public.is_admin());
create policy gl_je_settings_upd on public.gl_journal_settings for update using (organization_id in (select public.my_organizations()) and public.is_admin()) with check (organization_id in (select public.my_organizations()) and public.is_admin());

-- 3) سجل التدقيق (إضافة فقط — محمي من التعديل والحذف)
create table if not exists public.gl_journal_audit (
  id bigint generated always as identity primary key,
  organization_id bigint not null,
  entry_id bigint,
  action text not null,           -- create | update | approve | request_approval | post | reverse | delete_draft | recurring_generate
  actor uuid default auth.uid(),
  at timestamptz not null default now(),
  before_data jsonb,
  after_data jsonb,
  reason text
);
create index if not exists gl_je_audit_entry_idx on public.gl_journal_audit (entry_id, at);
create index if not exists gl_je_audit_org_idx   on public.gl_journal_audit (organization_id, at desc);
alter table public.gl_journal_audit enable row level security;
drop policy if exists gl_je_audit_select on public.gl_journal_audit;
create policy gl_je_audit_select on public.gl_journal_audit for select using (organization_id in (select public.my_organizations()));
-- لا سياسات insert/update/delete: الكتابة عبر دوال SECURITY DEFINER فقط
revoke insert, update, delete, truncate on public.gl_journal_audit from anon, authenticated;
create or replace function public.gl_journal_audit_immutable() returns trigger language plpgsql as $$
begin raise exception 'gl_journal_audit is append-only'; end $$;
drop trigger if exists gl_journal_audit_no_change on public.gl_journal_audit;
create trigger gl_journal_audit_no_change before update or delete on public.gl_journal_audit for each row execute function public.gl_journal_audit_immutable();

-- 4) قوالب القيود (بلا مبالغ ما لم يختر المستخدم حفظها)
create table if not exists public.gl_journal_templates (
  id bigint generated always as identity primary key,
  organization_id bigint not null,
  name text not null,
  name_en text,
  entry_type text not null default 'general',
  description text,
  lines jsonb not null default '[]'::jsonb,   -- [{account_id, side:'debit'|'credit', amount?, note?}]
  keep_amounts boolean not null default false,
  is_active boolean not null default true,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists gl_je_tpl_org_idx on public.gl_journal_templates (organization_id);
alter table public.gl_journal_templates enable row level security;
drop policy if exists gl_je_tpl_all on public.gl_journal_templates;
create policy gl_je_tpl_all on public.gl_journal_templates for all
  using (organization_id in (select public.my_organizations()))
  with check (organization_id in (select public.my_organizations()));

-- 5) القيود المتكررة — تُنشأ مسودات للمراجعة فقط، ولا ترحيل تلقائي
create table if not exists public.gl_journal_recurring (
  id bigint generated always as identity primary key,
  organization_id bigint not null,
  name text not null,
  description text,
  entry_type text not null default 'general',
  branch_id bigint,
  lines jsonb not null default '[]'::jsonb,   -- [{account_id, debit, credit, note}]
  frequency text not null check (frequency in ('daily','weekly','monthly','yearly','custom')),
  interval_n integer not null default 1 check (interval_n >= 1),   -- كل N وحدة؛ custom = كل N يوم
  start_date date not null,
  end_date date,
  next_run date not null,
  last_run date,
  is_active boolean not null default true,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists gl_je_rec_org_idx on public.gl_journal_recurring (organization_id, is_active, next_run);
alter table public.gl_journal_recurring enable row level security;
drop policy if exists gl_je_rec_all on public.gl_journal_recurring;
create policy gl_je_rec_all on public.gl_journal_recurring for all
  using (organization_id in (select public.my_organizations()))
  with check (organization_id in (select public.my_organizations()));
create table if not exists public.gl_journal_recurring_runs (
  recurring_id bigint not null references public.gl_journal_recurring(id) on delete cascade,
  run_date date not null,
  entry_id bigint,
  created_at timestamptz not null default now(),
  primary key (recurring_id, run_date)          -- يمنع التوليد المزدوج لنفس التاريخ
);
alter table public.gl_journal_recurring_runs enable row level security;
drop policy if exists gl_je_rec_runs_all on public.gl_journal_recurring_runs;
create policy gl_je_rec_runs_all on public.gl_journal_recurring_runs for all
  using (recurring_id in (select id from public.gl_journal_recurring where organization_id in (select public.my_organizations())))
  with check (recurring_id in (select id from public.gl_journal_recurring where organization_id in (select public.my_organizations())));

-- 6) دوال مساعدة داخلية ------------------------------------------------
create or replace function public.gl__assert_org(p_org bigint) returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if p_org not in (select public.my_organizations()) then raise exception 'access denied for organization %', p_org using errcode = '42501'; end if;
end $$;

create or replace function public.gl__audit(p_org bigint, p_entry bigint, p_action text, p_before jsonb, p_after jsonb, p_reason text)
returns void language sql security definer set search_path = public as $$
  insert into public.gl_journal_audit(organization_id, entry_id, action, actor, before_data, after_data, reason)
  values (p_org, p_entry, p_action, auth.uid(), p_before, p_after, p_reason);
$$;

create or replace function public.gl__check_lines(p_org bigint, p_lines jsonb, p_strict boolean default true) returns void language plpgsql security definer set search_path = public as $$
declare r record; d bigint := 0; c bigint := 0; n int := 0; dd numeric; cc numeric;
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then raise exception 'lines must be a JSON array'; end if;
  for r in select * from jsonb_array_elements(p_lines) with ordinality as x(l, i) loop
    dd := coalesce((r.l->>'debit')::numeric, 0); cc := coalesce((r.l->>'credit')::numeric, 0);
    if dd < 0 or cc < 0 then raise exception 'line %: negative amount', r.i; end if;
    if dd <> round(dd, 2) or cc <> round(cc, 2) then raise exception 'line %: more than 2 decimals', r.i; end if;
    if dd > 0 and cc > 0 then raise exception 'line %: both debit and credit', r.i; end if;
    if dd = 0 and cc = 0 then continue; end if;
    if not exists (select 1 from public.gl_accounts a where a.id = (r.l->>'account_id')::bigint and a.organization_id = p_org and coalesce(a.is_active, true) and not coalesce(a.is_group, false)) then
      raise exception 'line %: account is missing, inactive, a parent group, or belongs to another organization', r.i;
    end if;
    d := d + round(dd * 100)::bigint; c := c + round(cc * 100)::bigint; n := n + 1;
  end loop;
  if not p_strict then return; end if;   -- المسودة قد تكون غير مكتملة/غير متوازنة؛ قواعد السطر الواحد تبقى سارية
  if n < 2 then raise exception 'at least two valid lines are required'; end if;
  if d <> c then raise exception 'entry is not balanced (debit % vs credit %)', d / 100.0, c / 100.0; end if;
end $$;

create or replace function public.gl__check_period(p_org bigint, p_date date) returns void language plpgsql security definer set search_path = public as $$
declare lk date;
begin
  select lock_through into lk from public.gl_journal_settings where organization_id = p_org;
  if lk is not null and p_date <= lk then raise exception 'period is closed through % (entry date %)', lk, p_date; end if;
end $$;

create or replace function public.gl__next_no(p_org bigint, p_year int) returns int language plpgsql security definer set search_path = public as $$
declare nxt int;
begin
  perform pg_advisory_xact_lock(hashtextextended('gl_je_no:' || p_org || ':' || p_year, 0));
  select greatest(coalesce((select max(entry_no) from public.gl_journal_entries where organization_id = p_org and entry_year = p_year), 0),
                  coalesce((select last_no from public.gl_journal_entry_counters where organization_id = p_org and entry_year = p_year), 0)) + 1 into nxt;
  insert into public.gl_journal_entry_counters(organization_id, entry_year, last_no, updated_at) values (p_org, p_year, nxt, now())
    on conflict (organization_id, entry_year) do update set last_no = excluded.last_no, updated_at = now();
  return nxt;
end $$;

-- 7) الدوال العامة -------------------------------------------------------
-- إنشاء قيد (مسودة أو مرحّل) ذريًا: ترويسة + سطور + تدقيق في معاملة واحدة.
create or replace function public.gl_journal_create(p_org bigint, p_header jsonb, p_lines jsonb, p_post boolean default false)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_date date := (p_header->>'date')::date; v_year int; v_no int; v_id bigint; v_branch bigint := nullif(p_header->>'branch_id','')::bigint; r jsonb; s public.gl_journal_settings%rowtype;
begin
  perform public.gl__assert_org(p_org);
  if v_date is null then raise exception 'date is required'; end if;
  if v_branch is not null and v_branch not in (select id from public.my_branches()) then raise exception 'branch not permitted' using errcode = '42501'; end if;
  perform public.gl__check_period(p_org, v_date);
  perform public.gl__check_lines(p_org, p_lines, p_post);
  if p_post then
    select * into s from public.gl_journal_settings where organization_id = p_org;
    if coalesce(s.require_approval, false) then raise exception 'approval is required before posting'; end if;
  end if;
  v_year := extract(year from v_date)::int; v_no := public.gl__next_no(p_org, v_year);
  insert into public.gl_journal_entries(organization_id, entry_no, entry_year, date, description, branch_id, status, created_by, entry_type, notes,
                                        currency_code, fx_rate, external_ref, project, cost_center, posted_by, posted_at)
  values (p_org, v_no, v_year, v_date, nullif(p_header->>'description',''), v_branch, case when p_post then 'posted' else 'draft' end, auth.uid(),
          coalesce(nullif(p_header->>'entry_type',''), 'general'), nullif(p_header->>'notes',''),
          coalesce(nullif(p_header->>'currency_code',''), 'SAR'), coalesce(nullif(p_header->>'fx_rate','')::numeric, 1),
          nullif(p_header->>'external_ref',''), nullif(p_header->>'project',''), nullif(p_header->>'cost_center',''),
          case when p_post then auth.uid() end, case when p_post then now() end)
  returning id into v_id;
  for r in select * from jsonb_array_elements(p_lines) loop
    if coalesce((r->>'debit')::numeric, 0) = 0 and coalesce((r->>'credit')::numeric, 0) = 0 then continue; end if;
    insert into public.gl_journal_lines(entry_id, account_id, debit, credit, branch_id, note, party_id)
    values (v_id, (r->>'account_id')::bigint, coalesce((r->>'debit')::numeric, 0), coalesce((r->>'credit')::numeric, 0),
            coalesce(nullif(r->>'branch_id','')::bigint, v_branch), nullif(r->>'note',''), nullif(r->>'party_id','')::bigint);
  end loop;
  perform public.gl__audit(p_org, v_id, case when p_post then 'post' else 'create' end, null, jsonb_build_object('header', p_header, 'lines', p_lines), null);
  return v_id;
end $$;

-- تعديل مسودة فقط (القيد المرحّل لا يُعدَّل أبدًا)
create or replace function public.gl_journal_update_draft(p_id bigint, p_header jsonb, p_lines jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare e public.gl_journal_entries%rowtype; v_date date := (p_header->>'date')::date; v_branch bigint := nullif(p_header->>'branch_id','')::bigint; r jsonb; v_before jsonb;
begin
  select * into e from public.gl_journal_entries where id = p_id for update;
  if not found then raise exception 'entry not found'; end if;
  perform public.gl__assert_org(e.organization_id);
  if e.status <> 'draft' then raise exception 'only drafts can be edited; use reversal for posted entries'; end if;
  if v_branch is not null and v_branch not in (select id from public.my_branches()) then raise exception 'branch not permitted' using errcode = '42501'; end if;
  perform public.gl__check_period(e.organization_id, v_date);
  perform public.gl__check_lines(e.organization_id, p_lines, false);
  select jsonb_build_object('header', to_jsonb(e), 'lines', coalesce((select jsonb_agg(to_jsonb(l)) from public.gl_journal_lines l where l.entry_id = p_id), '[]'::jsonb)) into v_before;
  update public.gl_journal_entries set date = v_date, entry_year = extract(year from v_date)::int,
         entry_no = case when e.entry_year <> extract(year from v_date)::int then public.gl__next_no(e.organization_id, extract(year from v_date)::int) else e.entry_no end,
         description = nullif(p_header->>'description',''), branch_id = v_branch,
         entry_type = coalesce(nullif(p_header->>'entry_type',''), entry_type), notes = nullif(p_header->>'notes',''),
         currency_code = coalesce(nullif(p_header->>'currency_code',''), currency_code), fx_rate = coalesce(nullif(p_header->>'fx_rate','')::numeric, fx_rate),
         external_ref = nullif(p_header->>'external_ref',''), project = nullif(p_header->>'project',''), cost_center = nullif(p_header->>'cost_center',''),
         approval_state = 'none', approved_by = null, approved_at = null
   where id = p_id;
  delete from public.gl_journal_lines where entry_id = p_id;
  for r in select * from jsonb_array_elements(p_lines) loop
    if coalesce((r->>'debit')::numeric, 0) = 0 and coalesce((r->>'credit')::numeric, 0) = 0 then continue; end if;
    insert into public.gl_journal_lines(entry_id, account_id, debit, credit, branch_id, note, party_id)
    values (p_id, (r->>'account_id')::bigint, coalesce((r->>'debit')::numeric, 0), coalesce((r->>'credit')::numeric, 0),
            coalesce(nullif(r->>'branch_id','')::bigint, v_branch), nullif(r->>'note',''), nullif(r->>'party_id','')::bigint);
  end loop;
  perform public.gl__audit(e.organization_id, p_id, 'update', v_before, jsonb_build_object('header', p_header, 'lines', p_lines), null);
end $$;

create or replace function public.gl_journal_request_approval(p_id bigint) returns void language plpgsql security definer set search_path = public as $$
declare e public.gl_journal_entries%rowtype;
begin
  select * into e from public.gl_journal_entries where id = p_id for update; if not found then raise exception 'entry not found'; end if;
  perform public.gl__assert_org(e.organization_id);
  if e.status <> 'draft' then raise exception 'only drafts can be sent for approval'; end if;
  perform public.gl__check_lines(e.organization_id, (select coalesce(jsonb_agg(jsonb_build_object('account_id', account_id, 'debit', debit, 'credit', credit)), '[]'::jsonb) from public.gl_journal_lines where entry_id = p_id));
  update public.gl_journal_entries set approval_state = 'pending' where id = p_id;
  perform public.gl__audit(e.organization_id, p_id, 'request_approval', null, null, null);
end $$;

-- الاعتماد: لا يعتمد المنشئ قيده بنفسه (فصل المهام)
create or replace function public.gl_journal_approve(p_id bigint) returns void language plpgsql security definer set search_path = public as $$
declare e public.gl_journal_entries%rowtype;
begin
  select * into e from public.gl_journal_entries where id = p_id for update; if not found then raise exception 'entry not found'; end if;
  perform public.gl__assert_org(e.organization_id);
  if e.status <> 'draft' or e.approval_state <> 'pending' then raise exception 'entry is not awaiting approval'; end if;
  if e.created_by is not null and e.created_by = auth.uid() and not public.is_admin() then raise exception 'creator cannot approve own entry'; end if;
  update public.gl_journal_entries set approval_state = 'approved', approved_by = auth.uid(), approved_at = now() where id = p_id;
  perform public.gl__audit(e.organization_id, p_id, 'approve', null, null, null);
end $$;

-- الترحيل: ذري، مرة واحدة فقط (يفشل بوضوح إن كان مُرحَّلًا)
create or replace function public.gl_journal_post(p_id bigint) returns void language plpgsql security definer set search_path = public as $$
declare e public.gl_journal_entries%rowtype; s public.gl_journal_settings%rowtype;
begin
  select * into e from public.gl_journal_entries where id = p_id for update; if not found then raise exception 'entry not found'; end if;
  perform public.gl__assert_org(e.organization_id);
  if e.status = 'posted' then raise exception 'entry is already posted'; end if;
  perform public.gl__check_period(e.organization_id, e.date);
  select * into s from public.gl_journal_settings where organization_id = e.organization_id;
  if coalesce(s.require_approval, false) and e.approval_state <> 'approved' then raise exception 'approval is required before posting'; end if;
  perform public.gl__check_lines(e.organization_id, (select coalesce(jsonb_agg(jsonb_build_object('account_id', account_id, 'debit', debit, 'credit', credit)), '[]'::jsonb) from public.gl_journal_lines where entry_id = p_id));
  update public.gl_journal_entries set status = 'posted', posted_by = auth.uid(), posted_at = now() where id = p_id;
  perform public.gl__audit(e.organization_id, p_id, 'post', null, null, null);
end $$;

-- العكس: ينشئ قيدًا معاكسًا مرحّلًا ويربطه بالأصل؛ لا عكس مرتين (فهرس فريد + فحص)
create or replace function public.gl_journal_reverse(p_id bigint, p_date date default current_date, p_reason text default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare e public.gl_journal_entries%rowtype; v_new bigint; v_no int; v_year int := extract(year from p_date)::int;
begin
  select * into e from public.gl_journal_entries where id = p_id for update; if not found then raise exception 'entry not found'; end if;
  perform public.gl__assert_org(e.organization_id);
  if e.status <> 'posted' then raise exception 'only posted entries can be reversed'; end if;
  if e.reversed_by is not null or exists (select 1 from public.gl_journal_entries x where x.reversed_of = p_id) then raise exception 'entry is already reversed'; end if;
  if e.reversed_of is not null then raise exception 'a reversal entry cannot be reversed'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'a reversal reason is required'; end if;
  perform public.gl__check_period(e.organization_id, p_date);
  v_no := public.gl__next_no(e.organization_id, v_year);
  insert into public.gl_journal_entries(organization_id, entry_no, entry_year, date, description, branch_id, status, created_by, entry_type, notes, reversed_of, posted_by, posted_at, currency_code, fx_rate)
  values (e.organization_id, v_no, v_year, p_date, 'عكس قيد JV-' || e.entry_year || '-' || lpad(e.entry_no::text, 4, '0') || coalesce(' — ' || e.description, ''), e.branch_id, 'posted', auth.uid(), e.entry_type,
          '[REVERSAL] ' || p_reason, p_id, auth.uid(), now(), e.currency_code, e.fx_rate)
  returning id into v_new;
  insert into public.gl_journal_lines(entry_id, account_id, debit, credit, branch_id, note, party_id)
  select v_new, account_id, credit, debit, branch_id, note, party_id from public.gl_journal_lines where entry_id = p_id;
  update public.gl_journal_entries set reversed_by = v_new, reverse_reason = p_reason, notes = coalesce(notes || ' ', '') || '[REVERSED] عُكس بالقيد #' || v_new where id = p_id;
  perform public.gl__audit(e.organization_id, p_id, 'reverse', null, jsonb_build_object('reversal_entry', v_new), p_reason);
  return v_new;
end $$;

create or replace function public.gl_journal_delete_draft(p_id bigint) returns void language plpgsql security definer set search_path = public as $$
declare e public.gl_journal_entries%rowtype;
begin
  select * into e from public.gl_journal_entries where id = p_id for update; if not found then raise exception 'entry not found'; end if;
  perform public.gl__assert_org(e.organization_id);
  if e.status <> 'draft' then raise exception 'posted entries cannot be deleted'; end if;
  perform public.gl__audit(e.organization_id, p_id, 'delete_draft', to_jsonb(e), null, null);
  delete from public.gl_journal_entries where id = p_id;
end $$;

-- توليد مسودات القيود المتكررة المستحقة حتى تاريخ معيّن (لا ترحيل). يعيد عدد المسودات.
create or replace function public.gl_generate_recurring(p_org bigint, p_until date default current_date) returns integer language plpgsql security definer set search_path = public as $$
declare rec public.gl_journal_recurring%rowtype; cnt int := 0; d date; v_id bigint; guard int;
begin
  perform public.gl__assert_org(p_org);
  for rec in select * from public.gl_journal_recurring where organization_id = p_org and is_active and next_run <= p_until and (end_date is null or next_run <= end_date) order by id for update loop
    d := rec.next_run; guard := 0;
    while d <= p_until and (rec.end_date is null or d <= rec.end_date) and guard < 400 loop
      guard := guard + 1;
      if not exists (select 1 from public.gl_journal_recurring_runs where recurring_id = rec.id and run_date = d) then
        v_id := public.gl_journal_create(p_org,
                 jsonb_build_object('date', d, 'description', coalesce(rec.description, rec.name), 'branch_id', rec.branch_id, 'entry_type', rec.entry_type, 'notes', 'قيد متكرر: ' || rec.name),
                 rec.lines, false);
        insert into public.gl_journal_recurring_runs(recurring_id, run_date, entry_id) values (rec.id, d, v_id);
        cnt := cnt + 1;
      end if;
      d := case rec.frequency when 'daily' then d + rec.interval_n when 'weekly' then d + 7 * rec.interval_n
                 when 'monthly' then (d + make_interval(months => rec.interval_n))::date when 'yearly' then (d + make_interval(years => rec.interval_n))::date
                 else d + rec.interval_n end;
    end loop;
    update public.gl_journal_recurring set next_run = d, last_run = p_until where id = rec.id;
  end loop;
  return cnt;
end $$;

grant execute on function public.gl_journal_create(bigint, jsonb, jsonb, boolean), public.gl_journal_update_draft(bigint, jsonb, jsonb),
  public.gl_journal_request_approval(bigint), public.gl_journal_approve(bigint), public.gl_journal_post(bigint),
  public.gl_journal_reverse(bigint, date, text), public.gl_journal_delete_draft(bigint), public.gl_generate_recurring(bigint, date) to authenticated;
revoke execute on function public.gl__assert_org(bigint), public.gl__audit(bigint, bigint, text, jsonb, jsonb, text), public.gl__check_lines(bigint, jsonb, boolean),
  public.gl__check_period(bigint, date), public.gl__next_no(bigint, int) from public, anon, authenticated;
commit;
