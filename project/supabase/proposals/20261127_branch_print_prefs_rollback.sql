alter table public.shops drop constraint if exists shops_print_prefs_object;
alter table public.shops drop column if exists print_prefs;
