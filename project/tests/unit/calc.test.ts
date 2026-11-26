import { computeInvoice, validateLines, buildTenders, addDays, daysBetween, normalizeSearch, clampPct } from "/home/claude/proj/src/pages/sales/salesInvoiceCalc";
import { invoiceTotals } from "/home/claude/proj/src/pages/lib/accountingDb";
let pass=0, fail=0;
const ok=(name:string,c:boolean,extra?:unknown)=>{ if(c){pass++;console.log("PASS",name);} else {fail++;console.log("FAIL",name,extra??"");} };
const L=(o:Partial<any>={})=>({key:"k"+Math.random(),productId:1,code:"P1",name:"x",barcode:null,unit:"pc",stock:100,cost:10,qty:1,unitPrice:100,discountPct:0,...o});
// VAT exclusive
let t=computeInvoice([L({qty:2,unitPrice:100})],15,false);
ok("vat exclusive: subtotal 200, tax 30, total 230",t.subtotal===200&&t.tax===30&&t.total===230,t);
// VAT inclusive
t=computeInvoice([L({qty:1,unitPrice:115})],15,true);
ok("vat inclusive: total 115, tax 15",t.total===115&&t.tax===15,t);
// discount
t=computeInvoice([L({qty:2,unitPrice:100,discountPct:10})],15,false);
ok("discount 10%: discount 20, subtotal(net) 180, tax 27, total 207",t.discount===20&&t.tax===27&&t.total===207,t);
// multi-lines reconcile with reused invoiceTotals
const lines=[L({productId:1,qty:3,unitPrice:19.99,discountPct:5}),L({productId:2,qty:2,unitPrice:7.35,discountPct:0}),L({productId:3,qty:1,unitPrice:0.99,discountPct:12.5})];
t=computeInvoice(lines,15,false);
const sumLines=Math.round(t.lines.reduce((a,l)=>a+l.total,0)*100)/100;
ok("multi lines: per-line display total vs invoice total differ by at most 1 cent (documented rounding)",Math.abs(sumLines-t.total)<=0.0100001,{sumLines,total:t.total});
ok("multi lines: subtotal+tax==total",Math.abs(t.subtotal+t.tax-t.total)<=0.01,t);
const ref=invoiceTotals(t.lines.map(l=>({qty:1,unit_price:l.net})) as any,15,false) as any;
ok("reuses accountingDb.invoiceTotals (tax matches)",ref.tax===t.tax&&ref.total===t.total&&ref.subtotal===t.subtotal,ref);
// validation
ok("qty 0 invalid",validateLines([L({qty:0})])[0]?.code==="qty");
ok("negative qty invalid",validateLines([L({qty:-3})])[0]?.code==="qty");
ok("fractional qty invalid",validateLines([L({qty:1.5})])[0]?.code==="qty_int");
ok("NaN qty invalid",validateLines([L({qty:NaN})]).length===1);
ok("insufficient stock flagged with max",(()=>{const i=validateLines([L({qty:11,stock:10})])[0];return i?.code==="stock"&&i.max===10;})());
ok("qty == stock allowed",validateLines([L({qty:10,stock:10})]).length===0);
ok("negative price invalid",validateLines([L({unitPrice:-1})])[0]?.code==="price");
ok("discount >100 invalid",validateLines([L({discountPct:101})]).length===1);
ok("clampPct",clampPct(150)===100&&clampPct(-5)===0);
// tenders
let tn:any=buildTenders({mode:"cash",total:230,paidNow:230,treasuryAccountId:1,treasuryMethod:"cash",receivableAccountId:null});
ok("cash: one cash tender 230",tn.ok&&tn.tenders.length===1&&tn.tenders[0].method==="cash"&&tn.tenders[0].amount===230,tn);
tn=buildTenders({mode:"cash",total:230,paidNow:230,treasuryAccountId:null,treasuryMethod:"cash",receivableAccountId:null});
ok("cash without treasury rejected",!tn.ok&&tn.error==="treasury",tn);
tn=buildTenders({mode:"credit",total:230,paidNow:0,treasuryAccountId:null,treasuryMethod:"cash",receivableAccountId:5});
ok("credit: one credit tender to receivable",tn.ok&&tn.tenders.length===1&&tn.tenders[0].method==="credit"&&tn.tenders[0].account_id===5&&tn.tenders[0].amount===230,tn);
tn=buildTenders({mode:"credit",total:230,paidNow:100,treasuryAccountId:1,treasuryMethod:"cash",receivableAccountId:5});
ok("partial: cash 100 + credit 130 = 230",tn.ok&&tn.tenders.length===2&&Math.round(tn.tenders.reduce((a:number,x:any)=>a+x.amount,0)*100)/100===230&&tn.tenders.find((x:any)=>x.method==="credit").amount===130,tn);
tn=buildTenders({mode:"credit",total:230,paidNow:300,treasuryAccountId:1,treasuryMethod:"cash",receivableAccountId:5});
ok("overpay rejected",!tn.ok,tn);
tn=buildTenders({mode:"credit",total:230,paidNow:0,treasuryAccountId:null,treasuryMethod:"cash",receivableAccountId:null});
ok("credit without receivable rejected",!tn.ok&&tn.error==="receivable",tn);
// dates
ok("addDays +30",addDays("2026-11-26",30)==="2026-12-26",addDays("2026-11-26",30));
ok("addDays month rollover",addDays("2026-01-31",1)==="2026-02-01");
ok("daysBetween",daysBetween("2026-11-26","2026-12-26")===30&&daysBetween("2026-11-26","2026-11-20")===-6);
// search normalization (Arabic)
ok("normalize: alef/taa marbuta/diacritics/case",normalizeSearch("أَحمد")===normalizeSearch("احمد")&&normalizeSearch("ABC")===normalizeSearch("abc"),[normalizeSearch("أَحمد"),normalizeSearch("احمد")]);
console.log(`\nRESULT: ${pass} passed, ${fail} failed`); process.exit(fail?1:0);
