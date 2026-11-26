#!/bin/bash
export PGHOST=/var/tmp/pgtest/sock PGPORT=54329 PGUSER=postgres PGDATABASE=t2
OWN=$(psql -At -c "select test.u('owner')")
psql -q -c "update products set quantity=3 where id=2" 
# A) same idempotency key from 6 parallel sessions
KEY=$(psql -At -c "select gen_random_uuid()")
PL=$(psql -At -c "select (test.pl('{\"items\":[{\"product_id\":1,\"qty\":1,\"unit_price\":20}],\"tenders\":[{\"method\":\"cash\",\"account_id\":1,\"amount\":23}],\"idempotency_key\":\"$KEY\"}'))::text")
Q0=$(psql -At -c "select quantity from products where id=1")
for i in 1 2 3 4 5 6; do PGOPTIONS="-c request.jwt.claim.sub=$OWN" psql -q -At -c "set role authenticated" -c "select (public.post_sales_invoice(1, \$q\$$PL\$q\$::jsonb))->>'duplicate'" > /tmp/dup_$i.txt 2>&1 & done; wait
echo "A) results (expect one 'false' and five 'true'): $(cat /tmp/dup_*.txt | grep -v SET | sort | uniq -c | tr '\n' ' ')"
echo "A) invoices with that key (expect 1): $(psql -At -c "select count(*) from gl_sales_invoices where idempotency_key='$KEY'")  stock delta (expect -1): $(psql -At -c "select quantity - $Q0 from products where id=1")"
# B) two different invoices both wanting all 3 remaining units of P2
for i in 1 2 3 4; do
  PLB=$(psql -At -c "select (test.pl('{\"items\":[{\"product_id\":2,\"qty\":3,\"unit_price\":60}],\"tenders\":[{\"method\":\"cash\",\"account_id\":1,\"amount\":207}]}'))::text")
  PGOPTIONS="-c request.jwt.claim.sub=$OWN" psql -q -At -c "set role authenticated" -c "select 'OK'||((public.post_sales_invoice(1, \$q\$$PLB\$q\$::jsonb))->>'invoice_no')" > /tmp/oversell_$i.txt 2>&1 & done; wait
echo "B) 4 racing sales of the last 3 units: $(cat /tmp/oversell_*.txt | grep -c '^OK') succeeded, $(cat /tmp/oversell_*.txt | grep -c 'Insufficient') rejected; P2 stock now: $(psql -At -c 'select quantity from products where id=2') (expect 0, never negative)"
# C) invoice-number uniqueness under 8 parallel different invoices
for i in 1 2 3 4 5 6 7 8; do
  PLC=$(psql -At -c "select (test.pl('{\"items\":[{\"product_id\":1,\"qty\":1,\"unit_price\":20}],\"tenders\":[{\"method\":\"cash\",\"account_id\":1,\"amount\":23}]}'))::text")
  PGOPTIONS="-c request.jwt.claim.sub=$OWN" psql -q -At -c "set role authenticated" -c "select (public.post_sales_invoice(1, \$q\$$PLC\$q\$::jsonb))->>'invoice_no'" > /tmp/par_$i.txt 2>&1 & done; wait
echo "C) 8 parallel invoices: errors=$(cat /tmp/par_*.txt | grep -ci error) ; numbers unique & gapless: $(psql -At -c "select count(*)=max(invoice_no) and count(*)=count(distinct invoice_no) from gl_sales_invoices")  entries unique: $(psql -At -c "select count(*)=count(distinct entry_no) from gl_journal_entries")"
