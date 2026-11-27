-- =============================================================
-- مقترح (لم يُطبَّق): تخزين تفضيلات الطباعة لكل فرع على الخادم
-- العمود الجديد يرث سياسات RLS الحالية لجدول shops (القراءة كالمعتاد، والتعديل لمالك الفرع أو مدير النظام).
-- آمن: عمود اختياري، لا يغيّر أي بيانات، والواجهة تعمل بدونه (تحفظ محليًا كما كان).
-- =============================================================
alter table public.shops add column if not exists print_prefs jsonb;
alter table public.shops drop constraint if exists shops_print_prefs_object;
alter table public.shops add constraint shops_print_prefs_object
  check (print_prefs is null or (jsonb_typeof(print_prefs) = 'object' and pg_column_size(print_prefs) < 2048));
comment on column public.shops.print_prefs is 'تفضيلات طباعة المستندات للفرع: paper, orient, showLogo, showSignature, showBrand, docLang';
