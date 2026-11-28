-- =====================================================================
-- الجرد المستمر: ترحيل تكلفة البضاعة المباعة عند كل فاتورة مبيعات
-- Perpetual inventory: post COGS (Dr cogs / Cr inventory) in post_sales_invoice.
-- لا يعدّل أي قيد تاريخي. يغيّر الفواتير الجديدة فقط. (No historical entries are changed.)
-- التكلفة = كمية البيع × products.price (نفس unit_cost المسجّل في gl_stock_moves).
-- حساب المخزون = warehouses.inventory_account_id ثم دور الربط 'inventory'.
-- حساب التكلفة = دور الربط 'cogs' (مسموح في قيد gl_account_map_role_check).
-- =====================================================================

-- (1) الدالة: نسخة كاملة من الدالة الحالية + سطور التكلفة (التعديلات معلَّمة بـ -- [COGS])
CREATE OR REPLACE FUNCTION public.post_sales_invoice(p_org bigint, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid        uuid := auth.uid();
  v_key        uuid := nullif(p->>'idempotency_key','')::uuid;
  v_branch     bigint := nullif(p->>'branch_id','')::bigint;
  v_date       date := (p->>'date')::date;
  v_due        date := nullif(p->>'due_date','')::date;
  v_party      bigint := nullif(p->>'party_id','')::bigint;
  v_rate       numeric := coalesce(nullif(p->>'tax_rate','')::numeric, 0);
  v_incl       boolean := coalesce((p->>'tax_inclusive')::boolean, false);
  v_rev        bigint := nullif(p->>'revenue_account_id','')::bigint;
  v_taxacc     bigint := nullif(p->>'tax_account_id','')::bigint;
  v_wh         bigint := nullif(p->>'warehouse_id','')::bigint;
  v_expected   numeric := nullif(p->>'expected_total','')::numeric;
  v_cust       text := nullif(trim(p->>'customer_name'),'');
  v_notes      text := nullif(trim(p->>'notes'),'');
  v_year       integer;
  r            record;
  v_items      jsonb := '[]'::jsonb;
  v_gross      numeric := 0;  v_disc numeric := 0;
  v_sub        numeric; v_tax numeric; v_total numeric;
  v_paid       numeric := 0;  v_credit numeric := 0; v_tsum numeric := 0;
  v_net        numeric; v_lg numeric; v_ld numeric;
  v_inv_no     integer; v_entry_no integer; v_entry bigint; v_inv bigint;
  v_ptype      text; v_first_treas bigint; v_ntend integer := 0; v_ncash integer := 0; v_ncred integer := 0;
  v_existing   record;
  v_pcredit_acc bigint;
  v_moves      bigint[] := '{}';
  v_defwh      bigint;
  v_taxacc_map bigint;
  v_stype      text := coalesce(nullif(p->>'sale_type',''), '');
  v_pmethod    text;
  v_nnc        integer := 0;
  v_kind       text;
  v_cogs       numeric := 0;      -- [COGS] إجمالي تكلفة الوحدات المباعة
  v_invacc     bigint;            -- [COGS] حساب المخزون
  v_cogsacc    bigint;            -- [COGS] حساب تكلفة المبيعات
begin
  if v_uid is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_org is null or not (p_org in (select public.my_organizations())) then
    raise exception 'Organization access denied' using errcode = '42501';
  end if;
  if v_key is null then raise exception 'idempotency_key is required' using errcode = '22023'; end if;

  perform pg_advisory_xact_lock(hashtextextended('post_sales_invoice:' || p_org || ':' || v_key, 0));
  select id, invoice_no, invoice_year, entry_id into v_existing
  from public.gl_sales_invoices where organization_id = p_org and idempotency_key = v_key;
  if found then
    return jsonb_build_object('ok', true, 'duplicate', true, 'id', v_existing.id,
      'invoice_no', v_existing.invoice_no, 'invoice_year', v_existing.invoice_year, 'entry_id', v_existing.entry_id);
  end if;

  if v_date is null or extract(year from v_date) not between 2000 and 2200 then
    raise exception 'Invalid invoice date' using errcode = '22007'; end if;
  v_year := extract(year from v_date)::integer;
  if v_due is not null and v_due < v_date then raise exception 'Due date is before invoice date' using errcode = '23514'; end if;
  if v_rate < 0 or v_rate > 100 then raise exception 'Invalid tax rate' using errcode = '23514'; end if;

  if v_branch is null or not exists (select 1 from public.shops s where s.id = v_branch and s.organization_id = p_org) then
    raise exception 'Branch does not belong to this organization' using errcode = '23514'; end if;
  if not public.can_access_branch(v_branch::integer) then
    raise exception 'Branch access denied' using errcode = '42501'; end if;
  if v_wh is null then raise exception 'Warehouse selection is required' using errcode = '23514'; end if;
  if not exists (select 1 from public.warehouses w where w.id = v_wh and w.organization_id = p_org
                    and w.branch_id = v_branch and w.is_active) then
    raise exception 'Warehouse does not belong to the selected branch' using errcode = '23514'; end if;
  select w.id into v_defwh from public.warehouses w
   where w.organization_id = p_org and w.branch_id = v_branch and w.is_active
   order by w.is_default desc, w.id limit 1;

  -- [COGS] حسابا المخزون والتكلفة
  select w.inventory_account_id into v_invacc from public.warehouses w where w.id = v_wh;
  v_invacc  := coalesce(v_invacc, public.resolve_account(p_org, v_branch, 'inventory'));
  v_cogsacc := public.resolve_account(p_org, v_branch, 'cogs');

  if v_party is not null and not exists (
       select 1 from public.gl_parties gp where gp.id = v_party and gp.organization_id = p_org and gp.is_active) then
    raise exception 'Customer does not belong to this organization' using errcode = '23514'; end if;

  declare v_maprev bigint := public.resolve_account(p_org, v_branch, 'revenue');
  begin
    if v_maprev is null then raise exception 'Sales revenue account mapping is missing' using errcode = '23514'; end if;
    if v_rev is not null and v_rev <> v_maprev then raise exception 'Revenue account does not match the configured mapping' using errcode = '23514'; end if;
    v_rev := v_maprev;
  end;
  v_taxacc_map := public.resolve_account(p_org, v_branch, 'output_vat');

  if jsonb_typeof(p->'items') <> 'array' or jsonb_array_length(p->'items') = 0 then
    raise exception 'Invoice has no items' using errcode = '23514'; end if;
  if (select count(*) <> count(distinct (x->>'product_id')) from jsonb_array_elements(p->'items') x) then
    raise exception 'Duplicate product lines are not allowed' using errcode = '23514'; end if;

  for r in
    select (x->>'product_id')::bigint as product_id,
           (x->>'qty')::numeric       as qty,
           (x->>'unit_price')::numeric as price,
           coalesce(nullif(x->>'discount_pct','')::numeric, 0) as dpct
    from jsonb_array_elements(p->'items') x
    order by (x->>'product_id')::bigint
  loop
    if r.product_id is null or r.qty is null or r.qty <= 0 or r.qty <> round(r.qty, 0) then
      raise exception 'Invalid quantity (must be a positive whole number)' using errcode = '23514'; end if;
    if r.price is null or r.price < 0 then raise exception 'Invalid unit price' using errcode = '23514'; end if;
    if r.dpct < 0 or r.dpct > 100 then raise exception 'Invalid discount percentage' using errcode = '23514'; end if;

    declare pr record; v_mid bigint;
    begin
      select pp.id, pp.product_code, pp.product_name, pp.quantity, pp.price, pp.warehouse_id
        into pr from public.products pp
       where pp.id = r.product_id and pp.shop_id = v_branch for update;
      if not found then raise exception 'Product % is not available in this branch', r.product_id using errcode = '23514'; end if;
      if coalesce(pr.warehouse_id, v_defwh) is distinct from v_wh then
        raise exception 'Product % is not in the selected warehouse', pr.product_name using errcode = '23514'; end if;
      if coalesce(pr.quantity, 0) < r.qty then
        raise exception 'Insufficient stock for % (available %, requested %)', pr.product_name, coalesce(pr.quantity,0), r.qty using errcode = '23514'; end if;

      v_lg := round(r.qty * r.price, 2);
      v_ld := round(v_lg * r.dpct / 100, 2);
      v_net := v_lg - v_ld;
      v_gross := v_gross + v_net;  v_disc := v_disc + v_ld;
      v_cogs := v_cogs + round(r.qty * coalesce(pr.price, 0), 2);   -- [COGS]
      v_items := v_items || jsonb_build_object(
        'product_id', pr.id, 'product_code', pr.product_code,
        'description', pr.product_name || coalesce(' (' || pr.product_code || ')', ''),
        'qty', r.qty, 'unit_price', round(v_net / r.qty, 4), 'line_total', v_net,
        'list_price', r.price, 'discount_pct', r.dpct, 'discount_amount', v_ld,
        'unit_cost', coalesce(pr.price, 0));                          -- [COGS] للتتبّع فقط
      update public.products set quantity = quantity - r.qty where id = pr.id;
      insert into public.gl_stock_moves (organization_id, branch_id, warehouse_id, product_id, move_type, qty, unit_cost, ref_type, ref_id, notes, created_by)
      values (p_org, v_branch, v_wh, pr.id, 'sale_out', -r.qty, pr.price, 'gl_sales_invoices', null, null, v_uid)
      returning id into v_mid;
      v_moves := v_moves || v_mid;
    end;
  end loop;

  v_gross := round(v_gross, 2);
  v_cogs  := round(v_cogs, 2);
  if v_incl then
    v_total := v_gross; v_sub := round(v_gross / (1 + v_rate / 100), 2); v_tax := round(v_total - v_sub, 2);
  else
    v_sub := v_gross; v_tax := round(v_gross * v_rate / 100, 2); v_total := round(v_sub + v_tax, 2);
  end if;
  if v_total <= 0 then raise exception 'Invoice total must be positive' using errcode = '23514'; end if;
  if v_expected is not null and abs(v_expected - v_total) > 0.01 then
    raise exception 'Totals mismatch (client %, server %)', v_expected, v_total using errcode = '23514'; end if;
  if v_tax > 0 then
    if v_taxacc_map is null then raise exception 'Output VAT account mapping is missing' using errcode = '23514'; end if;
    if v_taxacc is not null and v_taxacc <> v_taxacc_map then raise exception 'Tax account does not match the configured mapping' using errcode = '23514'; end if;
    v_taxacc := v_taxacc_map;
  end if;

  -- [COGS] إن وُجدت تكلفة فالحسابان إلزاميان (لا ترحيل بلا تكلفة بصمت)
  if v_cogs > 0 then
    if v_invacc is null then raise exception 'Inventory account mapping is missing (set the warehouse inventory account)' using errcode = '23514'; end if;
    if v_cogsacc is null then raise exception 'Cost of goods sold account mapping is missing' using errcode = '23514'; end if;
  end if;

  if jsonb_typeof(p->'tenders') <> 'array' or jsonb_array_length(p->'tenders') = 0 then
    raise exception 'At least one payment line is required' using errcode = '23514'; end if;
  for r in select x->>'method' as method, (x->>'account_id')::bigint as account_id,
                  round((x->>'amount')::numeric, 2) as amount
           from jsonb_array_elements(p->'tenders') x loop
    if r.amount is null or r.amount <= 0 then raise exception 'Invalid payment amount' using errcode = '23514'; end if;
    if r.method not in ('cash','bank_transfer','pos','credit') then raise exception 'Invalid payment method' using errcode = '23514'; end if;
    v_ntend := v_ntend + 1; v_tsum := v_tsum + r.amount;
    if r.method = 'credit' then
      v_ncred := v_ncred + 1; v_credit := v_credit + r.amount;
      if v_party is null then raise exception 'A customer is required for credit sales' using errcode = '23514'; end if;
      select coalesce(gp.account_id, (select pp.account_id from public.gl_parties pp where pp.id = gp.parent_id))
        into v_pcredit_acc from public.gl_parties gp where gp.id = v_party;
      if v_pcredit_acc is null or r.account_id is distinct from v_pcredit_acc then
        raise exception 'Credit payment must use the customer receivable account' using errcode = '23514'; end if;
    else
      v_ncash := v_ncash + 1; v_paid := v_paid + r.amount;
      v_kind := case r.method when 'cash' then 'cash' when 'bank_transfer' then 'bank' else 'pos' end;
      if not exists (select 1 from public.gl_treasuries t where t.organization_id = p_org and t.is_active
                       and t.kind = v_kind and t.account_id = r.account_id and (t.branch_id is null or t.branch_id = v_branch)) then
        raise exception 'Payment account does not match payment method % for this branch', r.method using errcode = '23514'; end if;
      v_pmethod := r.method;
      if v_first_treas is null then v_first_treas := r.account_id; end if;
    end if;
  end loop;
  if abs(v_tsum - v_total) > 0.005 then
    raise exception 'Payments total % does not equal invoice total %', v_tsum, v_total using errcode = '23514'; end if;
  if v_stype not in ('cash','credit','partial_credit') then raise exception 'Invalid sale type' using errcode = '23514'; end if;
  if v_ncash > 1 then raise exception 'Only one payment method per invoice is supported' using errcode = '23514'; end if;
  if v_stype = 'cash' and not (v_ncash = 1 and v_ncred = 0) then raise exception 'Cash sale requires one full payment and no receivable' using errcode = '23514'; end if;
  if v_stype = 'credit' and not (v_ncash = 0 and v_ncred = 1) then raise exception 'Credit sale must not include a payment' using errcode = '23514'; end if;
  if v_stype = 'partial_credit' and not (v_ncash = 1 and v_ncred = 1) then raise exception 'Partially paid sale requires one payment and a remaining receivable' using errcode = '23514'; end if;
  v_ptype := case v_stype when 'cash' then v_pmethod when 'credit' then 'credit' else 'partial' end;

  perform pg_advisory_xact_lock(hashtextextended('sales_invoice_no:' || p_org || ':' || v_year, 0));
  select coalesce(max(invoice_no), 0) + 1 into v_inv_no from public.gl_sales_invoices
   where organization_id = p_org and invoice_year = v_year;
  perform pg_advisory_xact_lock(hashtextextended('gl_entry_no:' || p_org || ':' || v_year, 0));
  select coalesce(max(entry_no), 0) + 1 into v_entry_no from public.gl_journal_entries
   where organization_id = p_org and entry_year = v_year;

  insert into public.gl_journal_entries (organization_id, entry_no, entry_year, date, description, branch_id, status, entry_type, notes)
  values (p_org, v_entry_no, v_year, v_date, 'فاتورة مبيعات — ' || coalesce(v_cust, 'عميل نقدي'), v_branch, 'draft', 'sales', v_notes)
  returning id into v_entry;

  for r in select x->>'method' as method, (x->>'account_id')::bigint as account_id, round((x->>'amount')::numeric, 2) as amount
           from jsonb_array_elements(p->'tenders') x loop
    insert into public.gl_journal_lines (entry_id, account_id, debit, credit, branch_id, party_id)
    values (v_entry, r.account_id, r.amount, 0, v_branch, case when r.method = 'credit' then v_party end);
  end loop;
  insert into public.gl_journal_lines (entry_id, account_id, debit, credit, branch_id) values (v_entry, v_rev, 0, v_sub, v_branch);
  if v_tax > 0 then
    insert into public.gl_journal_lines (entry_id, account_id, debit, credit, branch_id) values (v_entry, v_taxacc, 0, v_tax, v_branch);
  end if;
  -- [COGS] مدين تكلفة المبيعات / دائن المخزون (نفس القيد)
  if v_cogs > 0 then
    insert into public.gl_journal_lines (entry_id, account_id, debit, credit, branch_id) values (v_entry, v_cogsacc, v_cogs, 0, v_branch);
    insert into public.gl_journal_lines (entry_id, account_id, debit, credit, branch_id) values (v_entry, v_invacc, 0, v_cogs, v_branch);
  end if;
  update public.gl_journal_entries set status = 'posted' where id = v_entry;

  insert into public.gl_sales_invoices (
    organization_id, branch_id, invoice_no, invoice_year, date, party_id, customer_name, payment_type, treasury_account_id,
    paid_amount, subtotal, tax_rate, tax_amount, tax_inclusive, total, items, notes, entry_id, status, source,
    due_date, discount_total, warehouse_id, customer_ref, salesperson, idempotency_key, sale_type, payment_method)
  values (p_org, v_branch, v_inv_no, v_year, v_date, v_party, v_cust, v_ptype, v_first_treas,
    v_paid, v_sub, v_rate, v_tax, v_incl, v_total, v_items, v_notes, v_entry, 'posted', coalesce(nullif(p->>'source',''), 'sales_entry'),
    v_due, v_disc, v_wh, nullif(trim(p->>'customer_ref'),''), nullif(trim(p->>'salesperson'),''), v_key, v_stype, v_pmethod)
  returning id into v_inv;

  insert into public.gl_sales_payments (organization_id, invoice_id, method, treasury_account_id, customer_account_id, party_id, amount)
  select p_org, v_inv, x->>'method',
         case when x->>'method' = 'credit' then null else (x->>'account_id')::bigint end,
         case when x->>'method' = 'credit' then (x->>'account_id')::bigint end,
         case when x->>'method' = 'credit' then v_party end,
         round((x->>'amount')::numeric, 2)
  from jsonb_array_elements(p->'tenders') x;

  update public.gl_stock_moves set ref_id = v_inv where id = any (v_moves);

  return jsonb_build_object('ok', true, 'duplicate', false, 'id', v_inv, 'invoice_no', v_inv_no,
    'invoice_year', v_year, 'entry_id', v_entry, 'subtotal', v_sub, 'tax', v_tax, 'total', v_total, 'cogs', v_cogs);
end;
$function$;

-- (2) ربط حساب تكلفة المبيعات لمؤسستك (organization 10): 5101 (id=95). يُنفَّذ بعد مراجعتك.
-- ملاحظة: حساب 5101 اسمه «تكلفة المشتريات / المواد» ويقع تحت المجموعة 51 التي تقرؤها قائمة الدخل.
insert into public.gl_account_map (organization_id, branch_id, role, account_id)
select 10, null, 'cogs', 95
where not exists (select 1 from public.gl_account_map where organization_id = 10 and branch_id is null and role = 'cogs');
