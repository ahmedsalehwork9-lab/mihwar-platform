create schema if not exists test;
create table if not exists test.results(n serial, grp text, label text, expected text, got text, pass boolean);
truncate test.results;
grant usage on schema test to public; grant all on test.results to public; grant all on sequence test.results_n_seq to public;
-- try(): run sql as a JWT user (or as postgres when uid is null) inside a subtransaction.
-- expect: 'ok' | 'fail' | '<substring of error>'
create or replace function test.try(grp text, label text, uid uuid, sql text, expect text default 'ok') returns void language plpgsql as $$
declare err text; res text; pass boolean;
begin
  begin
    if uid is not null then
      perform set_config('request.jwt.claim.sub', uid::text, true);
      execute 'set local role authenticated';
    else
      perform set_config('request.jwt.claim.sub', '', true);
    end if;
    execute sql;
    res := 'ok';
  exception when others then
    res := 'fail: ' || sqlerrm;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
  pass := case when expect='ok' then res='ok' when expect='fail' then res like 'fail%' else res like 'fail%' and res like '%'||expect||'%' end;
  insert into test.results(grp,label,expected,got,pass) values (grp,label,expect,res,pass);
end $$;
create or replace function test.val(sql text) returns text language plpgsql as $$ declare r text; begin execute sql into r; return r; end $$;
create or replace function test.check(grp text, label text, cond boolean) returns void language sql as $$ insert into test.results(grp,label,expected,got,pass) values (grp,label,'true',coalesce(cond::text,'null'),coalesce(cond,false)) $$;
grant execute on all functions in schema test to public;


