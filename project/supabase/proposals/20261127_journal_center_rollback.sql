-- Rollback لمقترح مركز القيود (يزيل الإضافات فقط؛ لا يمسّ قيودًا أو سطورًا).
-- تحذير: حذف gl_journal_audit يفقد سجل التدقيق المتراكم — صدّره أولًا.
begin;
drop function if exists public.gl_generate_recurring(bigint, date);
drop function if exists public.gl_journal_delete_draft(bigint);
drop function if exists public.gl_journal_reverse(bigint, date, text);
drop function if exists public.gl_journal_post(bigint);
drop function if exists public.gl_journal_approve(bigint);
drop function if exists public.gl_journal_request_approval(bigint);
drop function if exists public.gl_journal_update_draft(bigint, jsonb, jsonb);
drop function if exists public.gl_journal_create(bigint, jsonb, jsonb, boolean);
drop function if exists public.gl__next_no(bigint, int);
drop function if exists public.gl__check_period(bigint, date);
drop function if exists public.gl__check_lines(bigint, jsonb, boolean);
drop function if exists public.gl__audit(bigint, bigint, text, jsonb, jsonb, text);
drop function if exists public.gl__assert_org(bigint);
drop table if exists public.gl_journal_recurring_runs;
drop table if exists public.gl_journal_recurring;
drop table if exists public.gl_journal_templates;
drop table if exists public.gl_journal_audit;
drop function if exists public.gl_journal_audit_immutable();
drop table if exists public.gl_journal_settings;
drop index if exists public.gl_je_one_reversal_uidx;
drop index if exists public.gl_je_org_date_idx;
drop index if exists public.gl_je_org_status_idx;
drop index if exists public.gl_jl_entry_idx;
drop index if exists public.gl_jl_account_idx;
alter table public.gl_journal_entries
  drop constraint if exists gl_je_approval_state_chk, drop constraint if exists gl_je_fx_rate_chk,
  drop column if exists approval_state, drop column if exists approved_by, drop column if exists approved_at,
  drop column if exists posted_by, drop column if exists posted_at, drop column if exists reversed_of, drop column if exists reversed_by,
  drop column if exists reverse_reason, drop column if exists currency_code, drop column if exists fx_rate,
  drop column if exists external_ref, drop column if exists project, drop column if exists cost_center;
commit;
