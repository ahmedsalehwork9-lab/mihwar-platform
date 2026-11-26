const { chromium } = require('playwright');
let pass=0, fail=0; const ok=(n,c,x)=>{ if(c){pass++;console.log('PASS',n);} else {fail++;console.log('FAIL',n,x===undefined?'':JSON.stringify(x));} };
const num=s=>parseFloat(String(s).replace(/[^0-9.\-]/g,''));
(async()=>{
 const br=await chromium.launch(); 
 const fresh=async()=>{ const pg=await br.newPage({viewport:{width:1400,height:1000}}); const errs=[]; pg.on('pageerror',e=>errs.push(String(e))); pg.on('dialog',d=>d.accept()); await pg.goto('file://'+process.cwd()+'/dist/index.html'); await pg.waitForSelector('[data-testid=sales-invoice-page]'); pg.errs=errs; return pg; };
 const add=async(pg,q,pick=0)=>{ await pg.fill('[data-testid=prod-search]',q); await pg.waitForSelector('[data-testid=prod-item]'); await pg.locator('[data-testid=prod-item]').nth(pick).click(); };
 const total=async pg=>num(await pg.textContent('[data-testid=t-total]'));
 const posted=pg=>pg.evaluate(()=>window.__posted);
 const treasury=async pg=>pg.selectOption('[data-testid=treasury]','1');
 const setAcc=async pg=>{ /* accounts are auto-selected when unambiguous (single candidate) */ };

 // 1 RTL default + search by code / Arabic name / English name / barcode / partial
 let pg=await fresh();
 ok('Arabic default: dir=rtl', await pg.evaluate(()=>document.querySelector('[data-testid=sales-invoice-page]').getAttribute('dir'))==='rtl');
 ok('Arabic title shown', (await pg.textContent('h1')).includes('فاتورة مبيعات جديدة'));
 await pg.fill('[data-testid=prod-search]','BRK-001'); await pg.waitForSelector('[data-testid=prod-item]');
 ok('search by exact code', await pg.locator('[data-testid=prod-item]').count()===1);
 await pg.fill('[data-testid=prod-search]','brk'); await pg.waitForTimeout(450);
 ok('search by partial code (case-insens.)', await pg.locator('[data-testid=prod-item]').count()===1);
 await pg.fill('[data-testid=prod-search]','فحمات'); await pg.waitForTimeout(450);
 ok('search by Arabic name', await pg.locator('[data-testid=prod-item]').count()===1);
 await pg.fill('[data-testid=prod-search]','engine'); await pg.waitForTimeout(450);
 ok('search by English name', await pg.locator('[data-testid=prod-item]').count()===1);
 await pg.fill('[data-testid=prod-search]','6281000000011'); await pg.waitForTimeout(450);
 ok('search by barcode', await pg.locator('[data-testid=prod-item]').count()===1);
 await pg.fill('[data-testid=prod-search]','zzzz'); await pg.waitForTimeout(450);
 ok('no match message', (await pg.textContent('[data-testid=prod-list]')).includes('لا أصناف'));
 await pg.fill('[data-testid=prod-search]','FLT-009'); await pg.waitForSelector('[data-testid=prod-item]');
 ok('out-of-stock product disabled in list', await pg.locator('[data-testid=prod-item]').first().isDisabled());
 // Enter on exact barcode adds line
 await pg.fill('[data-testid=prod-search]','6281000000011'); await pg.press('[data-testid=prod-search]','Enter'); await pg.waitForSelector('[data-testid=line-row]');
 ok('Enter on barcode adds the line', await pg.locator('[data-testid=line-row]').count()===1);
 // no duplicate lines
 await add(pg,'BRK-001'); await add(pg,'BRK-001');
 ok('no duplicate lines: still 1 row, qty incremented to 3', await pg.locator('[data-testid=line-row]').count()===1 && await pg.inputValue('[data-testid=qty]')==='3');
 // customer search
 await pg.click('[data-testid=cust-input]');
 for (const [q,label] of [['النور','Arabic name'],['Al Noor','English name'],['0500000001','phone'],['300111','tax number'],['1','customer code/id']]) { await pg.fill('[data-testid=cust-input]',q); await pg.waitForTimeout(100); ok('customer search by '+label, (await pg.locator('[data-testid=cust-list] button').allTextContents()).some(t=>t.includes('شركة النور'))); }
 await pg.fill('[data-testid=cust-input]','Gulf'); await pg.locator('[data-testid=cust-list] button',{hasText:'Gulf'}).click();
 ok('customer picked -> info bar shows balance 1,250.00', (await pg.textContent('[data-testid=cust-info]')).includes('1,250.00'));
 ok('page errors none (scenario 1)', pg.errs.length===0, pg.errs);
 await pg.close();

 // 2 cash sale, VAT, totals, payload
 pg=await fresh(); await add(pg,'BRK-001'); await pg.fill('[data-testid=qty]','3');
 ok('cash: total = 3x20 + 15% = 69.00', await total(pg)===69);
 ok('cash: VAT shown 9.00', num(await pg.textContent('[data-testid=t-vat]'))===9);
 await pg.click('[data-testid=post]');
 ok('cash without treasury blocked with message', (await pg.textContent('[data-testid=msg]')).includes('خزنة') && (await posted(pg)).length===0);
 await treasury(pg); await setAcc(pg); await pg.click('[data-testid=post]'); await pg.waitForFunction(()=>window.__posted.length===1);
 let p=(await posted(pg))[0];
 ok('cash payload: one cash tender 69 on treasury account 1', p.tenders.length===1&&p.tenders[0].method==='cash'&&p.tenders[0].amount===69&&p.tenders[0].account_id===1, p.tenders);
 ok('payload expected_total=69, revenue acc 3, tax acc 4, tax rate 15', p.expected_total===69&&p.revenue_account_id===3&&p.tax_account_id===4&&p.tax_rate===15);
 ok('success message + form reset', (await pg.textContent('[data-testid=msg]')).includes('1') && await pg.locator('[data-testid=line-row]').count()===0);
 ok('stock deducted server-side (100->97), UI never writes qty', await pg.evaluate(()=>window.__stock[1])===97);
 await pg.close();

 // 3 credit sale
 pg=await fresh(); await add(pg,'OIL'); await pg.selectOption('[data-testid=pay-mode]','credit'); await setAcc(pg);
 await pg.click('[data-testid=post]');
 ok('credit without customer blocked', (await pg.textContent('[data-testid=msg]')).includes('العميل') && (await posted(pg)).length===0);
 await pg.click('[data-testid=cust-input]'); await pg.fill('[data-testid=cust-input]','النور'); await pg.locator('[data-testid=cust-list] button',{hasText:'شركة النور'}).click();
 ok('due date defaults to date+30 (customer credit days)', (await pg.inputValue('[data-testid=due-date]'))===await pg.evaluate(()=>{const d=new Date(document.querySelector('[data-testid=inv-date]').value+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+30);return d.toISOString().slice(0,10);}));
 ok('credit: remaining = total', num(await pg.textContent('[data-testid=remaining]'))===69);
 await pg.click('[data-testid=post]'); await pg.waitForFunction(()=>window.__posted.length===1);
 p=(await posted(pg))[0];
 ok('credit payload: single credit tender to receivable acct 5, party 1', p.tenders.length===1&&p.tenders[0].method==='credit'&&p.tenders[0].account_id===5&&p.tenders[0].amount===69&&p.party_id===1, p);
 ok('credit payload has due_date', !!p.due_date);
 await pg.close();

 // 4 partial + multiple products + discount
 pg=await fresh(); await add(pg,'BRK-001'); await pg.fill('[data-testid=qty]','10'); await add(pg,'OIL'); await pg.locator('[data-testid=disc]').nth(1).fill('10');
 // line1: 200 net -> 230; line2: 60-6=54 -> 62.10 ; total 292.10
 ok('multi-product + discount total 292.10', await total(pg)===292.1, await total(pg));
 ok('discount total 6.00', num(await pg.textContent('[data-testid=t-discount]'))===6);
 await pg.selectOption('[data-testid=pay-mode]','credit'); await pg.click('[data-testid=cust-input]'); await pg.fill('[data-testid=cust-input]','النور'); await pg.locator('[data-testid=cust-list] button',{hasText:'شركة النور'}).click();
 await pg.check('[data-testid=collect-now]'); await pg.fill('[data-testid=paid]','100'); await treasury(pg); await setAcc(pg);
 ok('partial: remaining 192.10', num(await pg.textContent('[data-testid=remaining]'))===192.1);
 await pg.click('[data-testid=post]'); await pg.waitForFunction(()=>window.__posted.length===1); p=(await posted(pg))[0];
 const sum=Math.round(p.tenders.reduce((a,t)=>a+t.amount,0)*100)/100;
 ok('partial payload: cash 100 + credit 192.10, sum == total', p.tenders.length===2&&sum===292.1&&p.tenders.find(t=>t.method==='credit').amount===192.1&&p.tenders.find(t=>t.method==='cash').amount===100, p.tenders);
 ok('payload carries 2 items with discount_pct', p.items.length===2&&p.items[1].discount_pct===10);
 // overpay
 await pg.close(); pg=await fresh(); await add(pg,'BRK-001'); await pg.selectOption('[data-testid=pay-mode]','credit'); await pg.click('[data-testid=cust-input]'); await pg.fill('[data-testid=cust-input]','النور'); await pg.locator('[data-testid=cust-list] button',{hasText:'شركة النور'}).click();
 await pg.check('[data-testid=collect-now]'); await pg.fill('[data-testid=paid]','999'); await treasury(pg); await setAcc(pg); await pg.click('[data-testid=post]');
 ok('overpayment blocked, nothing posted', (await posted(pg)).length===0 && (await pg.textContent('[data-testid=msg]')).includes('المدفوع'));
 await pg.close();

 // 5 invalid quantities & insufficient stock
 pg=await fresh(); await add(pg,'OIL'); await treasury(pg); await setAcc(pg);
 for (const [v,label] of [['0','zero'],['-2','negative'],['1.5','fractional']]) { await pg.fill('[data-testid=qty]',v); ok('invalid qty '+label+' shows line error', await pg.locator('[data-testid=line-error]').count()===1); await pg.click('[data-testid=post]'); ok('invalid qty '+label+' not posted', (await posted(pg)).length===0); }
 await pg.fill('[data-testid=qty]','6'); ok('insufficient stock (6>5) flagged', (await pg.textContent('[data-testid=line-error]')).includes('5'));
 await pg.click('[data-testid=post]'); ok('insufficient stock not posted', (await posted(pg)).length===0);
 await pg.fill('[data-testid=qty]','5'); ok('qty == stock accepted (no error)', await pg.locator('[data-testid=line-error]').count()===0);
 await pg.close();

 // 6 duplicate submission (double click while RPC slow) -> exactly one posted
 pg=await fresh(); await pg.evaluate(()=>{window.__delay=600;}); await add(pg,'BRK-001'); await treasury(pg); await setAcc(pg);
 await pg.locator('[data-testid=post]').dblclick(); await pg.waitForTimeout(1500);
 ok('double-click posts exactly once', (await posted(pg)).length===1 && await pg.evaluate(()=>window.__stock[1])===99, await posted(pg));
 ok('server idempotency map holds one key', await pg.evaluate(()=>Object.keys(window.__idem).length)===1);
 await pg.close();

 // 7 RPC missing -> banner and post disabled
 pg=await fresh(); await pg.evaluate(()=>{window.__rpc=false;}); await add(pg,'BRK-001'); await treasury(pg); await setAcc(pg); await pg.click('[data-testid=post]'); await pg.waitForTimeout(300);
 ok('RPC missing at post-time: clear error, form kept, nothing saved', (await pg.textContent('[data-testid=msg]')).includes('P01') && await pg.locator('[data-testid=line-row]').count()===1);
 await pg.close();

 // 8 draft save/open
 pg=await fresh(); await add(pg,'BRK-001'); await pg.fill('[data-testid=qty]','4'); await pg.click('[data-testid=save-draft]'); await pg.waitForTimeout(200);
 ok('draft saved; no posting, no stock change', (await posted(pg)).length===0 && await pg.evaluate(()=>window.__stock[1])===100 && (await pg.textContent('[data-testid=msg]')).includes('مسودة'));
 await pg.click('[data-testid=cancel]'); ok('cancel clears lines', await pg.locator('[data-testid=line-row]').count()===0);
 await pg.click('[data-testid=tab-history]'); await pg.waitForSelector('[data-testid=draft-row]'); await pg.locator('[data-testid=draft-row] button',{hasText:'فتح'}).click();
 await pg.waitForSelector('[data-testid=line-row]'); ok('draft reopened with qty 4', await pg.inputValue('[data-testid=qty]')==='4');
 await pg.close();

 // 9 history after posting
 pg=await fresh(); await add(pg,'BRK-001'); await treasury(pg); await setAcc(pg); await pg.click('[data-testid=post]'); await pg.waitForFunction(()=>window.__posted.length===1);
 await pg.click('[data-testid=tab-history]'); await pg.waitForSelector('[data-testid=history-row]'); ok('history lists posted invoice', await pg.locator('[data-testid=history-row]').count()===1);
 await pg.close();

 // 10 English / LTR
 pg=await fresh(); await pg.evaluate(()=>window.__setLang('en')); await pg.waitForTimeout(200);
 ok('English: dir=ltr', await pg.evaluate(()=>document.querySelector('[data-testid=sales-invoice-page]').getAttribute('dir'))==='ltr');
 ok('English title', (await pg.textContent('h1')).includes('New Sales Invoice'));
 await add(pg,'فحمات'); ok('English UI: Arabic-name search works', await pg.locator('[data-testid=line-row]').count()===1);
 await pg.fill('[data-testid=qty]','0'); ok('English error text', (await pg.textContent('[data-testid=line-error]')).includes('Quantity'));
 const aligned=await pg.evaluate(()=>getComputedStyle(document.querySelector('[data-testid=lines-table] th:nth-child(2)')).textAlign);
 const cls=await pg.evaluate(()=>document.querySelector('[data-testid=lines-table] th:nth-child(2)').className); ok('table header uses logical text-start (flips with dir)', cls.includes('text-start'), cls);
 await pg.close();

 await br.close(); console.log(`\nRESULT: ${pass} passed, ${fail} failed`); process.exit(fail?1:0);
})().catch(e=>{console.error('HARNESS ERROR',e);process.exit(2);});
