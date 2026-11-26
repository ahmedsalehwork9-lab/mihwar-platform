#!/bin/bash
# usage: harness/run.sh  (from p01/)  — local throwaway Postgres only
export PGHOST=/var/tmp/pgtest/sock PGPORT=54329 PGUSER=postgres
psql -q -d postgres -c "drop database if exists t2" -c "create database t2" 2>&1 | grep -v NOTICE
export PGDATABASE=t2
psql -q -v ON_ERROR_STOP=1 -f harness/00_base.sql 2>&1 | grep -v NOTICE
psql -q -v ON_ERROR_STOP=1 -f out/sql/P01_sales_invoice_schema_and_rpc.sql 2>&1 | grep -v NOTICE
psql -q -v ON_ERROR_STOP=1 -f harness/10_helpers.sql -f harness/20_seed.sql -f harness/30_tests.sql > /tmp/p01_run.log 2>&1 || { echo "SCRIPT ERROR"; grep -i "error" /tmp/p01_run.log | head -5; }
psql -X -At -c "select count(*) filter (where pass)||'/'||count(*) from test.results"
psql -X -At -F' | ' -c "select 'FAIL: '||label||' => '||left(got,140) from test.results where not pass"
