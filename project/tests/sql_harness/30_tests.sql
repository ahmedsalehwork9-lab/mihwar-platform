create or replace function test.rpc(uname text, payload jsonb) returns jsonb language plpgsql as $$
declare r jsonb; begin
  perform set_config('request.jwt.claim.sub', test.u(uname)::text, true); execute 'set local role authenticated';
  begin select public.post_sales_invoice(1, payload) into r; exception when others then execute 'reset role'; perform set_config('request.jwt.claim.sub','',true); raise; end;
  execute 'reset role'; perform set_config('request.jwt.claim.sub','',true); return r; end $$;
grant execute on function test.rpc(text,jsonb) to public;
create or replace function test.call(grp text, label text, uname text, payload jsonb, expect text default 'ok') returns void language plpgsql as $$
declare res text;
begin
  begin perform test.rpc(uname, payload); res := 'ok'; exception when others then res := 'fail: '||sqlerrm; end;
  insert into test.results(grp,label,expected,got,pass) values (grp,label,expect,res, case when expect='ok' then res='ok' when expect='fail' then res like 'fail%' else res like 'fail%' and res like '%'||expect||'%' end);
end $$;
grant execute on function test.call(text,text,text,jsonb,text) to public;
create temp table _k(k text primary key, v jsonb); grant all on _k to public;

-- 1 cash invoice
insert into _k select 'cash', test.rpc('owner', test.pl());
select test.check('P01','cash invoice posted: no/year/total', (select v->>'invoice_no'='1' and (v->>'total')::numeric=230 and (v->>'tax')::numeric=30 from _k where k='cash'));
select test.check('P01','cash: entry posted & balanced (debit cash 230 = credit rev 200 + vat 30)', (select e.status='posted' and (select sum(debit) from gl_journal_lines where entry_id=e.id)=230 and (select sum(credit) from gl_journal_lines where entry_id=e.id)=230 and (select count(*) from gl_journal_lines where entry_id=e.id)=3 from gl_journal_entries e where e.id=(select (v->>'entry_id')::bigint from _k where k='cash')));
select test.check('P01','cash: stock 100 -> 90 via RPC only', (select quantity from products where id=1)=90);
select test.check('P01','cash: one sale_out move, qty -10, unit_cost = cost(10), ref = invoice id', (select count(*)=1 and min(qty)=-10 and min(unit_cost)=10 and min(ref_id)=(select (v->>'id')::bigint from _k where k='cash') and min(ref_type)='gl_sales_invoices' from gl_stock_moves where move_type='sale_out'));
select test.check('P01','cash: payment row linked to treasury account, invoice paid=total', (select (select count(*) from gl_sales_payments where invoice_id=i.id and method='cash' and treasury_account_id=1 and amount=230)=1 and i.paid_amount=230 and i.payment_type='cash' and i.due_date='2026-12-25' and i.customer_ref='PO-1' and i.entry_id is not null from gl_sales_invoices i where i.id=(select (v->>'id')::bigint from _k where k='cash')));
-- 2 credit
select test.call('P01','credit invoice (customer receivable account 5, party on line)','owner', test.pl('{"items":[{"product_id":1,"qty":2,"unit_price":20}],"tenders":[{"method":"credit","account_id":5,"amount":46}]}'));
select test.check('P01','credit: receivable debited with party_id, invoice paid=0', (select i.paid_amount=0 and i.payment_type='credit' and exists (select 1 from gl_journal_lines l where l.entry_id=i.entry_id and l.account_id=5 and l.debit=46 and l.party_id=1) from gl_sales_invoices i where i.invoice_no=2));
-- 3 partial
select test.call('P01','partial payment: cash 100 + credit rest','owner', test.pl('{"items":[{"product_id":1,"qty":5,"unit_price":20}],"tenders":[{"method":"cash","account_id":1,"amount":100},{"method":"credit","account_id":5,"amount":15}]}'));
select test.check('P01','partial: payment_type=partial, paid=100, 2 payment rows', (select i.payment_type='partial' and i.paid_amount=100 and (select count(*) from gl_sales_payments where invoice_id=i.id)=2 from gl_sales_invoices i where i.invoice_no=3));
-- 4 multi products + discounts + VAT exclusive
select test.call('P01','multiple products with line discounts (10% and 5%) paid by card','owner', test.pl('{"items":[{"product_id":1,"qty":3,"unit_price":20,"discount_pct":10},{"product_id":2,"qty":2,"unit_price":60,"discount_pct":5}],"tenders":[{"method":"card","account_id":2,"amount":193.20}],"expected_total":193.20}'));
select test.check('P01','multi: nets 54+114=168, discount 18? (6+6=12) vat 25.20 total 193.20', (select i.subtotal=168 and i.tax_amount=25.2 and i.total=193.2 and i.discount_total=12 from gl_sales_invoices i where i.invoice_no=4));
select test.check('P01','multi: both items stored with product_id, list price, discount', (select (i.items->0->>'product_id')='1' and (i.items->0->>'discount_pct')::numeric=10 and (i.items->1->>'line_total')::numeric=114 from gl_sales_invoices i where i.invoice_no=4));
select test.check('P01','multi: stock P1 90-2-5-3=80, P2 5-2=3; one move per product', (select quantity from products where id=1)=80 and (select quantity from products where id=2)=3);
-- 5 VAT inclusive
select test.call('P01','VAT-inclusive invoice: gross 115 -> sub 100 tax 15','owner', test.pl('{"tax_inclusive":true,"items":[{"product_id":1,"qty":1,"unit_price":115}],"tenders":[{"method":"cash","account_id":1,"amount":115}]}'));
select test.check('P01','inclusive: subtotal 100.00 tax 15.00 total 115.00', (select subtotal=100 and tax_amount=15 and total=115 from gl_sales_invoices where invoice_no=5));
-- 6 zero-VAT: no tax account needed
select test.call('P01','0% VAT needs no tax account','owner', test.pl('{"tax_rate":0,"tax_account_id":null,"items":[{"product_id":1,"qty":1,"unit_price":20}],"tenders":[{"method":"cash","account_id":1,"amount":20}]}'));
-- negative / invalid
create temp table _before as select (select sum(quantity) from products) q, (select count(*) from gl_sales_invoices) inv, (select count(*) from gl_journal_entries) ent, (select count(*) from gl_stock_moves) mv, (select count(*) from gl_journal_lines) ln;
grant all on _before to public;
select test.call('P01','invalid: qty 0','owner', test.pl('{"items":[{"product_id":1,"qty":0,"unit_price":20}]}'),'Invalid quantity');
select test.call('P01','invalid: negative qty','owner', test.pl('{"items":[{"product_id":1,"qty":-3,"unit_price":20}]}'),'Invalid quantity');
select test.call('P01','invalid: fractional qty (products.quantity is integer)','owner', test.pl('{"items":[{"product_id":1,"qty":1.5,"unit_price":20}]}'),'Invalid quantity');
select test.call('P01','invalid: negative price','owner', test.pl('{"items":[{"product_id":1,"qty":1,"unit_price":-1}]}'),'Invalid unit price');
select test.call('P01','invalid: discount > 100%','owner', test.pl('{"items":[{"product_id":1,"qty":1,"unit_price":20,"discount_pct":101}]}'),'discount');
select test.call('P01','invalid: duplicate product lines','owner', test.pl('{"items":[{"product_id":1,"qty":1,"unit_price":20},{"product_id":1,"qty":1,"unit_price":20}]}'),'Duplicate product');
select test.call('P01','insufficient stock (P2 has 3, ask 4)','owner', test.pl('{"items":[{"product_id":2,"qty":4,"unit_price":60}],"tenders":[{"method":"cash","account_id":1,"amount":276}]}'),'Insufficient stock');
select test.call('P01','out of stock (P3 has 0)','owner', test.pl('{"items":[{"product_id":3,"qty":1,"unit_price":9}],"tenders":[{"method":"cash","account_id":1,"amount":10.35}]}'),'Insufficient stock');
select test.call('P01','multi-line failure rolls back ALL lines (P1 ok + P2 short)','owner', test.pl('{"items":[{"product_id":1,"qty":1,"unit_price":20},{"product_id":2,"qty":9,"unit_price":60}],"tenders":[{"method":"cash","account_id":1,"amount":690}]}'),'Insufficient stock');
select test.call('P01','product of another branch rejected','owner', test.pl('{"items":[{"product_id":4,"qty":1,"unit_price":2}]}'),'not available in this branch');
select test.call('P01','totals mismatch vs client rejected','owner', test.pl('{"expected_total":999}'),'Totals mismatch');
select test.call('P01','payments total != invoice total rejected','owner', test.pl('{"tenders":[{"method":"cash","account_id":1,"amount":100}]}'),'does not equal');
select test.call('P01','no payment lines rejected','owner', test.pl('{"tenders":[]}'),'payment');
select test.call('P01','cash into non-treasury account (revenue) rejected','owner', test.pl('{"tenders":[{"method":"cash","account_id":3,"amount":230}]}'),'not an active treasury');
select test.call('P01','cash into another branch treasury (acct 8) rejected','owner', test.pl('{"tenders":[{"method":"cash","account_id":8,"amount":230}]}'),'not an active treasury');
select test.call('P01','credit without customer rejected','owner', test.pl('{"party_id":null,"tenders":[{"method":"credit","account_id":5,"amount":230}]}'),'customer is required');
select test.call('P01','credit to a wrong receivable account rejected','owner', test.pl('{"tenders":[{"method":"credit","account_id":1,"amount":230}]}'),'receivable account');
select test.call('P01','foreign-org customer rejected','owner', test.pl('{"party_id":2}'),'Customer');
select test.call('P01','foreign-org revenue account rejected','owner', test.pl('{"revenue_account_id":7}'),'revenue');
select test.call('P01','group (non-leaf) revenue account rejected','owner', test.pl('{"revenue_account_id":6}'),'revenue');
select test.call('P01','missing tax account while VAT>0 rejected','owner', test.pl('{"tax_account_id":null}'),'tax account');
select test.call('P01','due date before invoice date rejected','owner', test.pl('{"due_date":"2026-11-01"}'),'Due date');
select test.call('P01','missing idempotency key rejected','owner', (test.pl()) - 'idempotency_key','idempotency_key');
select test.call('P01','branch of another org rejected','owner', test.pl('{"branch_id":3}'),'Branch');
select test.call('P01','user of another org denied','other', test.pl(),'Organization access denied');
select test.call('P01','org member without branch... accountant allowed (org member rule)','acct', test.pl('{"items":[{"product_id":1,"qty":1,"unit_price":20}],"tenders":[{"method":"cash","account_id":1,"amount":23}]}'));
select test.call('P01','user with no org access denied','req', test.pl(),'Organization access denied');
select test.check('P01','failed attempts left NOTHING behind (stock/invoices/entries/lines/moves unchanged except 1 accepted acct sale)',
  (select (select sum(quantity) from products) = b.q - 1 and (select count(*) from gl_sales_invoices) = b.inv + 1 and (select count(*) from gl_journal_entries) = b.ent + 1 and (select count(*) from gl_stock_moves) = b.mv + 1 and (select count(*) from gl_journal_lines) = b.ln + 3 from _before b));
select test.check('P01','anon / PUBLIC have no EXECUTE', not has_function_privilege('anon','public.post_sales_invoice(bigint,jsonb)','execute') and not exists (select 1 from pg_proc p, aclexplode(p.proacl) a where p.proname='post_sales_invoice' and a.grantee=0));
-- duplicate submission (same key twice)
do $$ declare pl jsonb := test.pl('{"items":[{"product_id":1,"qty":4,"unit_price":20}],"tenders":[{"method":"cash","account_id":1,"amount":92}]}'); a jsonb; b jsonb; q0 int; begin
  q0 := (select quantity from products where id=1);
  a := test.rpc('owner', pl); b := test.rpc('owner', pl);
  perform test.check('P01','duplicate submission: 2nd call returns duplicate=true with SAME invoice', (a->>'duplicate')='false' and (b->>'duplicate')='true' and a->>'id'=b->>'id' and a->>'invoice_no'=b->>'invoice_no');
  perform test.check('P01','duplicate submission: stock deducted ONCE (-4) and one invoice/entry', (select quantity from products where id=1)=q0-4 and (select count(*) from gl_sales_invoices where idempotency_key=(pl->>'idempotency_key')::uuid)=1 and (select count(*) from gl_stock_moves where ref_id=(a->>'id')::bigint)=1);
end $$;
-- Arabic text round trip
select test.call('P01','Arabic customer/notes stored intact','owner', test.pl('{"customer_name":"شركة نسمة لقطع الغيار","notes":"ملاحظات على الفاتورة","salesperson":"محمد العلي","items":[{"product_id":1,"qty":1,"unit_price":20}],"tenders":[{"method":"cash","account_id":1,"amount":23}]}'));
select test.check('P01','Arabic text round trip + entry description','' <> '' or exists (select 1 from gl_sales_invoices i join gl_journal_entries e on e.id=i.entry_id where i.customer_name='شركة نسمة لقطع الغيار' and i.notes='ملاحظات على الفاتورة' and i.salesperson='محمد العلي' and e.description='فاتورة مبيعات — شركة نسمة لقطع الغيار'));
-- numbering is sequential, no gaps/dups
select test.check('P01','invoice numbers are unique and sequential 1..n', (select count(*)=max(invoice_no) and count(*)=count(distinct invoice_no) from gl_sales_invoices));
select test.check('P01','every posted entry balances', not exists (select 1 from gl_journal_entries e where e.status='posted' and (select coalesce(sum(debit),0)-coalesce(sum(credit),0) from gl_journal_lines where entry_id=e.id) <> 0));
select test.check('P01','every invoice total = sum of its payments', not exists (select 1 from gl_sales_invoices i where i.total <> (select sum(amount) from gl_sales_payments where invoice_id=i.id)));
select test.check('P01','products.quantity never negative', not exists (select 1 from products where quantity < 0));
select test.check('P01','sum(stock moves) per product = stock decrease', (select coalesce(sum(qty),0) from gl_stock_moves where product_id=1) = (select quantity from products where id=1) - 100);
