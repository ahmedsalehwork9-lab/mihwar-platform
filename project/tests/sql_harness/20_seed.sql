create table if not exists test.users(name text primary key, id uuid);
truncate test.users;
insert into test.users select n, ('00000000-0000-0000-0000-0000000000'||lpad(i::text,2,'0'))::uuid from unnest(array['owner','acct','other','req']) with ordinality t(n,i);
grant select on test.users to public;
create or replace function test.u(n text) returns uuid language sql stable as $$ select id from test.users where name=n $$;
grant execute on function test.u(text) to public;
insert into profiles(id,role) select id,'shop_owner' from test.users;
insert into organizations(name, owner_id) values ('OrgA', test.u('owner')), ('OrgB', test.u('other'));
insert into shops(shop_name, owner_id, organization_id) values ('B1', test.u('owner'), 1), ('B2', null, 1), ('B3', test.u('other'), 2);
insert into organization_members(organization_id,user_id,role) values (1,test.u('acct'),'accountant');
insert into gl_accounts(organization_id,code,name,type,is_group,is_active) values
 (1,'1001','cash','asset',false,true),(1,'1002','bank','asset',false,true),(1,'4001','sales','revenue',false,true),(1,'2201','vat','liability',false,true),
 (1,'1101','receivable','asset',false,true),(1,'1','grp','asset',true,true),(2,'1001','foreign','revenue',false,true),(1,'1003','branch2cash','asset',false,true);
insert into gl_treasuries(organization_id,branch_id,name,kind,account_id) values (1,1,'cash B1','cash',1),(1,null,'bank','bank',2),(1,2,'cash B2','cash',8);
insert into gl_parties(organization_id,name,type,account_id,credit_days) values (1,'cust','customer',5,30),(2,'foreign','customer',7,0);
insert into products(product_code,product_name,shop_id,quantity,price,selling_price) values ('C1','P1',1,100,10,20),('C2','P2',1,5,40,60),('C3','P3',1,0,5,9),('C9','P9-other-branch',2,50,1,2);
create or replace function test.pl(extra jsonb default '{}') returns jsonb language sql as $$
  select jsonb_build_object('idempotency_key', gen_random_uuid(), 'branch_id',1,'date','2026-11-25','due_date','2026-12-25','party_id',1,'customer_name','cust','tax_rate',15,'tax_inclusive',false,
    'revenue_account_id',3,'tax_account_id',4,'customer_ref','PO-1',
    'items', jsonb_build_array(jsonb_build_object('product_id',1,'qty',10,'unit_price',20)),
    'tenders', jsonb_build_array(jsonb_build_object('method','cash','account_id',1,'amount',230))) || extra $$;
grant execute on function test.pl(jsonb) to public;
