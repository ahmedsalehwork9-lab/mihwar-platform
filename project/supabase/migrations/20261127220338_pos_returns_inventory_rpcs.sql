-- =====================================================================
-- الجرد المستمر لنقاط البيع/الفواتير اليدوية والمرتجعات (تُستدعى من الواجهة بعد إنشاء المستند).
-- 1) apply_sale_inventory(p_org, p_invoice): خصم المخزون + حركات sale_out + قيد تكلفة (مدين cogs / دائن inventory). idempotent.
-- 2) apply_sale_return_inventory(p_org, p_return): إعادة المخزون + حركات sale_return_in + عكس التكلفة فقط إن كانت الفاتورة الأصلية سُجّلت لها تكلفة.
-- لا تعدّل أي قيد قديم. كل دالة تعمل في معاملة واحدة (إما كل شيء أو لا شيء).
-- =====================================================================
CREATE OR REPLACE FUNCTION public.apply_sale_inventory(p_org bigint, p_invoice bigint)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_inv record; v_wh bigint; v_invacc bigint; v_cogsacc bigint;
  it jsonb; v_items jsonb := '[]'::jsonb; v_pid bigint; v_qty numeric; pr record;
  v_cogs numeric := 0; v_year integer; v_entry_no integer; v_entry bigint; v_moves integer := 0; v_cost numeric;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_org is null or not (p_org in (select public.my_organizations())) then
    raise exception 'Organization access denied' using errcode = '42501'; end if;
  select * into v_inv from public.gl_sales_invoices where id = p_invoice and organization_id = p_org;
  if not found then raise exception 'Invoice not found' using errcode = '23514'; end if;
  if v_inv.branch_id is null or not public.can_access_branch(v_inv.branch_id::integer) then
    raise exception 'Branch access denied' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('apply_sale_inventory:' || p_org || ':' || p_invoice, 0));
  if exists (select 1 from public.gl_stock_moves m where m.organization_id = p_org and m.ref_type = 'gl_sales_invoices'
               and m.ref_id = p_invoice and m.move_type = 'sale_out') then
    return jsonb_build_object('ok', true, 'duplicate', true, 'cogs', 0);
  end if;

  v_wh := v_inv.warehouse_id;
  if v_wh is null then
    select w.id into v_wh from public.warehouses w where w.organization_id = p_org and w.branch_id = v_inv.branch_id and w.is_active
     order by w.is_default desc, w.id limit 1;
  end if;
  if v_wh is null then raise exception 'No active warehouse for this branch' using errcode = '23514'; end if;
  select w.inventory_account_id into v_invacc from public.warehouses w where w.id = v_wh;
  v_invacc  := coalesce(v_invacc, public.resolve_account(p_org, v_inv.branch_id, 'inventory'));
  v_cogsacc := public.resolve_account(p_org, v_inv.branch_id, 'cogs');

  for it in select x from jsonb_array_elements(coalesce(v_inv.items, '[]'::jsonb)) x loop
    v_pid := nullif(it->>'product_id','')::bigint;
    v_qty := nullif(it->>'qty','')::numeric;
    if v_pid is null or v_qty is null or v_qty <= 0 then v_items := v_items || it; continue; end if;
    select pp.id, pp.product_name, pp.quantity, pp.price, pp.warehouse_id into pr
      from public.products pp where pp.id = v_pid and pp.shop_id = v_inv.branch_id for update;
    if not found then raise exception 'Product % is not available in this branch', v_pid using errcode = '23514'; end if;
    if coalesce(pr.quantity, 0) < v_qty then
      raise exception 'Insufficient stock for % (available %, requested %)', pr.product_name, coalesce(pr.quantity,0), v_qty using errcode = '23514'; end if;
    v_cost := coalesce(pr.price, 0);
    update public.products set quantity = quantity - v_qty where id = pr.id;
    insert into public.gl_stock_moves (organization_id, branch_id, warehouse_id, product_id, move_type, qty, unit_cost, ref_type, ref_id, notes, created_by)
    values (p_org, v_inv.branch_id, v_wh, pr.id, 'sale_out', -v_qty, v_cost, 'gl_sales_invoices', p_invoice, null, v_uid);
    v_moves := v_moves + 1;
    v_cogs := v_cogs + round(v_qty * v_cost, 2);
    v_items := v_items || (it || jsonb_build_object('unit_cost', v_cost));
  end loop;
  v_cogs := round(v_cogs, 2);

  if v_cogs > 0 then
    if v_invacc is null then raise exception 'Inventory account mapping is missing (set the warehouse inventory account)' using errcode = '23514'; end if;
    if v_cogsacc is null then raise exception 'Cost of goods sold account mapping is missing' using errcode = '23514'; end if;
    v_year := extract(year from v_inv.date)::integer;
    perform pg_advisory_xact_lock(hashtextextended('gl_entry_no:' || p_org || ':' || v_year, 0));
    select coalesce(max(entry_no), 0) + 1 into v_entry_no from public.gl_journal_entries where organization_id = p_org and entry_year = v_year;
    insert into public.gl_journal_entries (organization_id, entry_no, entry_year, date, description, branch_id, status, entry_type)
    values (p_org, v_entry_no, v_year, v_inv.date, 'تكلفة مبيعات — فاتورة ' || v_inv.invoice_no || '/' || v_inv.invoice_year, v_inv.branch_id, 'draft', 'sales')
    returning id into v_entry;
    insert into public.gl_journal_lines (entry_id, account_id, debit, credit, branch_id) values (v_entry, v_cogsacc, v_cogs, 0, v_inv.branch_id);
    insert into public.gl_journal_lines (entry_id, account_id, debit, credit, branch_id) values (v_entry, v_invacc, 0, v_cogs, v_inv.branch_id);
    update public.gl_journal_entries set status = 'posted' where id = v_entry;
  end if;
  if v_moves > 0 then update public.gl_sales_invoices set items = v_items where id = p_invoice; end if;
  return jsonb_build_object('ok', true, 'duplicate', false, 'cogs', v_cogs, 'moves', v_moves, 'entry_id', v_entry);
end;
$function$;

CREATE OR REPLACE FUNCTION public.apply_sale_return_inventory(p_org bigint, p_return bigint)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_ret record; v_inv record; v_wh bigint; v_invacc bigint; v_cogsacc bigint;
  it jsonb; oi jsonb; v_pid bigint; v_qty numeric; v_cost numeric; v_pcost numeric; v_idx integer;
  v_cogs numeric := 0; v_year integer; v_entry_no integer; v_entry bigint; v_moves integer := 0;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_org is null or not (p_org in (select public.my_organizations())) then
    raise exception 'Organization access denied' using errcode = '42501'; end if;
  select * into v_ret from public.gl_sales_returns where id = p_return and organization_id = p_org;
  if not found then raise exception 'Return not found' using errcode = '23514'; end if;
  if v_ret.branch_id is null or not public.can_access_branch(v_ret.branch_id::integer) then
    raise exception 'Branch access denied' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('apply_sale_return_inventory:' || p_org || ':' || p_return, 0));
  if exists (select 1 from public.gl_stock_moves m where m.organization_id = p_org and m.ref_type = 'gl_sales_returns' and m.ref_id = p_return) then
    return jsonb_build_object('ok', true, 'duplicate', true, 'cogs', 0);
  end if;
  select * into v_inv from public.gl_sales_invoices where id = v_ret.original_invoice_id and organization_id = p_org;
  if not found then raise exception 'Original invoice not found' using errcode = '23514'; end if;

  v_wh := v_inv.warehouse_id;
  if v_wh is null then
    select w.id into v_wh from public.warehouses w where w.organization_id = p_org and w.branch_id = v_ret.branch_id and w.is_active
     order by w.is_default desc, w.id limit 1;
  end if;
  if v_wh is null then raise exception 'No active warehouse for this branch' using errcode = '23514'; end if;
  select w.inventory_account_id into v_invacc from public.warehouses w where w.id = v_wh;
  v_invacc  := coalesce(v_invacc, public.resolve_account(p_org, v_ret.branch_id, 'inventory'));
  v_cogsacc := public.resolve_account(p_org, v_ret.branch_id, 'cogs');

  for it in select x from jsonb_array_elements(coalesce(v_ret.items, '[]'::jsonb)) x loop
    v_idx := nullif(it->>'original_item_index','')::integer;
    v_qty := nullif(it->>'qty','')::numeric;
    if v_idx is null or v_qty is null or v_qty <= 0 then continue; end if;
    oi := (v_inv.items -> v_idx);
    v_pid := nullif(oi->>'product_id','')::bigint;
    if v_pid is null then continue; end if;
    -- التكلفة المسجّلة وقت البيع إن وُجدت؛ بدونها (فاتورة قديمة) يُعاد المخزون بلا عكس تكلفة
    v_cost := nullif(oi->>'unit_cost','')::numeric;
    select pp.price into v_pcost from public.products pp where pp.id = v_pid and pp.shop_id = v_ret.branch_id for update;
    if not found then continue; end if;
    update public.products set quantity = quantity + v_qty where id = v_pid;
    insert into public.gl_stock_moves (organization_id, branch_id, warehouse_id, product_id, move_type, qty, unit_cost, ref_type, ref_id, notes, created_by)
    values (p_org, v_ret.branch_id, v_wh, v_pid, 'sale_return_in', v_qty, coalesce(v_cost, v_pcost, 0), 'gl_sales_returns', p_return, null, v_uid);
    v_moves := v_moves + 1;
    if v_cost is not null then v_cogs := v_cogs + round(v_qty * v_cost, 2); end if;
  end loop;
  v_cogs := round(v_cogs, 2);

  if v_cogs > 0 then
    if v_invacc is null then raise exception 'Inventory account mapping is missing (set the warehouse inventory account)' using errcode = '23514'; end if;
    if v_cogsacc is null then raise exception 'Cost of goods sold account mapping is missing' using errcode = '23514'; end if;
    v_year := extract(year from v_ret.date)::integer;
    perform pg_advisory_xact_lock(hashtextextended('gl_entry_no:' || p_org || ':' || v_year, 0));
    select coalesce(max(entry_no), 0) + 1 into v_entry_no from public.gl_journal_entries where organization_id = p_org and entry_year = v_year;
    insert into public.gl_journal_entries (organization_id, entry_no, entry_year, date, description, branch_id, status, entry_type)
    values (p_org, v_entry_no, v_year, v_ret.date, 'عكس تكلفة مرتجع مبيعات SR-' || v_ret.return_year || '-' || lpad(v_ret.return_no::text, 4, '0'), v_ret.branch_id, 'draft', 'sales_return')
    returning id into v_entry;
    insert into public.gl_journal_lines (entry_id, account_id, debit, credit, branch_id) values (v_entry, v_invacc, v_cogs, 0, v_ret.branch_id);
    insert into public.gl_journal_lines (entry_id, account_id, debit, credit, branch_id) values (v_entry, v_cogsacc, 0, v_cogs, v_ret.branch_id);
    update public.gl_journal_entries set status = 'posted' where id = v_entry;
  end if;
  return jsonb_build_object('ok', true, 'duplicate', false, 'cogs', v_cogs, 'moves', v_moves, 'entry_id', v_entry);
end;
$function$;
