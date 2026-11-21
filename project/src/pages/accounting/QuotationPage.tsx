import { useCallback, useEffect, useMemo, useState } from "react";
import { FilePlus2, Printer, Search, Trash2, RefreshCw, ArrowRightLeft, Plus, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import * as DB from "../lib/accountingDb";
import type { GLAccount, GLParty, GLQuotation, GLTreasury, SalesItem } from "../lib/accountingDb";

const today = () => new Date().toISOString().slice(0, 10);
const firstDay = () => `${today().slice(0, 8)}01`;
const money = (v: number) => (Number(v) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const input = "w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-blue-500";
const btn = "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold";
type DraftItem = { description: string; qty: string; unit_price: string };

export default function QuotationPage() {
  const { ownedShopId, branches } = (useAuth() as any) ?? {};
  const [org, setOrg] = useState<{id:number;name:string}|null>(null);
  const [accounts,setAccounts] = useState<GLAccount[]>([]);
  const [parties,setParties] = useState<GLParty[]>([]);
  const [treasuries,setTreasuries] = useState<GLTreasury[]>([]);
  const [rows,setRows] = useState<GLQuotation[]>([]);
  const [from,setFrom] = useState(firstDay());
  const [to,setTo] = useState(today());
  const [branchFilter,setBranchFilter] = useState("");
  const [search,setSearch] = useState("");
  const [loading,setLoading] = useState(true);
  const [showForm,setShowForm] = useState(false);
  const [formStep,setFormStep] = useState<"basic"|"items"|"terms"|"preview">("basic");
  const [date,setDate] = useState(today());
  const [validUntil,setValidUntil] = useState("");
  const [branch,setBranch] = useState("");
  const [partyId,setPartyId] = useState("");
  const [customerName,setCustomerName] = useState("");
  const [taxRate,setTaxRate] = useState("15");
  const [taxInclusive,setTaxInclusive] = useState(false);
  const [discount,setDiscount] = useState("0");
  const [notes,setNotes] = useState("");
  const [items,setItems] = useState<DraftItem[]>([{description:"",qty:"1",unit_price:""}]);
  const [saving,setSaving] = useState(false);
  const [convertRow,setConvertRow] = useState<GLQuotation|null>(null);
  const [payType,setPayType] = useState<DB.SalesPayType>("cash");
  const [treasuryAcc,setTreasuryAcc] = useState("");
  const [customerAcc,setCustomerAcc] = useState("");
  const [revenueAcc,setRevenueAcc] = useState("");
  const [taxAcc,setTaxAcc] = useState("");

  useEffect(() => {
    let live=true;
    (async()=>{
      const o=await DB.getOrgForBranch(ownedShopId ?? null);
      if(!live)return;
      setOrg(o);
      if(o){
        const [a,p,t]=await Promise.all([DB.fetchAccounts(o.id),DB.fetchParties(o.id,"customer"),DB.fetchTreasuries(o.id)]);
        if(live){setAccounts(a);setParties(p);setTreasuries(t);}
      }
      setLoading(false);
    })();
    return()=>{live=false;};
  },[ownedShopId]);

  const reload=useCallback(async()=>{
    if(!org)return;
    setLoading(true);
    setRows(await DB.fetchQuotations(org.id,from,to,branchFilter?Number(branchFilter):null));
    setLoading(false);
  },[org,from,to,branchFilter]);
  useEffect(()=>{void reload();},[reload]);

  const totals=useMemo(()=>{
    const its=items.map(i=>({qty:Number(i.qty)||0,unit_price:Number(i.unit_price)||0}));
    const raw=DB.invoiceTotals(its,Number(taxRate)||0,taxInclusive);
    const disc=Math.max(0,Math.min(Number(discount)||0,raw.gross));
    const discountedGross=Math.max(0,raw.gross-disc);
    const afterDiscount=DB.invoiceTotals([{qty:1,unit_price:discountedGross}],Number(taxRate)||0,taxInclusive);
    return {subtotal:afterDiscount.subtotal,discount:disc,tax:afterDiscount.tax,total:afterDiscount.total};
  },[items,taxRate,taxInclusive,discount]);
  const branchId=branch?Number(branch):(branches?.length===1?Number(branches[0].id):null);
  const branchLabel=(id:number|null|undefined)=>id==null?"الفرع العام":(branches||[]).find((b:any)=>Number(b.id)===Number(id))?.name||`فرع ${id}`;
  const quoteCode=(q:GLQuotation)=>`QT-B${q.branch_id??0}-${q.quotation_year}-${String(q.quotation_no).padStart(6,"0")}`;
  const setItem=(i:number,p:Partial<DraftItem>)=>setItems(old=>old.map((v,n)=>n===i?{...v,...p}:v));
  const reset=()=>{setDate(today());setValidUntil("");setBranch(branches?.length===1?String(branches[0].id):"");setPartyId("");setCustomerName("");setTaxRate("15");setTaxInclusive(false);setDiscount("0");setNotes("");setItems([{description:"",qty:"1",unit_price:""}]);};

  const save=async()=>{
    if(!org)return;
    const clean:SalesItem[]=items.map(i=>({description:i.description.trim(),qty:Number(i.qty)||0,unit_price:Number(i.unit_price)||0,line_total:Math.round((Number(i.qty)||0)*(Number(i.unit_price)||0)*100)/100})).filter(i=>i.description&&i.qty>0&&i.line_total>0);
    if(!clean.length){alert("أدخل صنفًا واحدًا على الأقل مع الكمية والسعر.");return;}
    if(branches?.length>1&&!branch){alert("اختر الفرع.");return;}
    setSaving(true);
    const r=await DB.createQuotation(org.id,{branch_id:branchId,date,valid_until:validUntil||null,party_id:partyId?Number(partyId):null,customer_name:customerName.trim()||null,items:clean,discount_amount:totals.discount,tax_rate:Number(taxRate)||0,tax_inclusive:taxInclusive,notes:notes.trim()||null});
    setSaving(false);
    if(!r.ok){alert("تعذر حفظ العرض: "+r.error);return;}
    alert(`تم حفظ عرض السعر رقم ${r.quotationNo}`);
    setShowForm(false);reset();await reload();
  };

  const print=(q:GLQuotation)=>{
    const customer=q.customer_name||parties.find(p=>p.id===q.party_id)?.name||"—";
    const lines=q.items.map((it,i)=>`<tr><td>${i+1}</td><td>${it.description}</td><td>${it.qty}</td><td>${money(it.unit_price)}</td><td>${money(it.line_total)}</td></tr>`).join("");
    const html=`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>عرض سعر ${q.quotation_no}</title><style>body{font-family:Tahoma,Arial;padding:32px;color:#172033}header{display:flex;justify-content:space-between;border-bottom:3px solid #183b60;padding-bottom:16px}h1{font-size:24px}table{width:100%;border-collapse:collapse;margin-top:24px}th{background:#183b60;color:white}td,th{border:1px solid #cbd5e1;padding:10px;text-align:center}td:nth-child(2){text-align:right}.total{margin:20px 0 0 auto;width:280px}.total div{display:flex;justify-content:space-between;padding:6px;border-bottom:1px solid #ddd}.muted{color:#64748b}</style></head><body><header><div><h1>عرض سعر</h1><b>رقم العرض: ${q.quotation_no}/${q.quotation_year}</b><p>التاريخ: ${q.date} · صالح حتى: ${q.valid_until||"—"}</p></div><div><h2>${org?.name||"المؤسسة"}</h2><p>العميل: ${customer}</p></div></header><table><thead><tr><th>#</th><th>الصنف / البيان</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th></tr></thead><tbody>${lines}</tbody></table><section class="total"><div><span>الإجمالي قبل الخصم</span><b>${money(q.subtotal+q.discount_amount)}</b></div><div><span>الخصم</span><b>${money(q.discount_amount)}</b></div><div><span>الضريبة ${q.tax_rate}%</span><b>${money(q.tax_amount)}</b></div><div><strong>الإجمالي النهائي</strong><strong>${money(q.total)}</strong></div></section><p class="muted">${q.notes||""}</p><script>window.onload=()=>window.print()</script></body></html>`;
    const w=window.open("","_blank");if(!w){alert("اسمح بالنوافذ المنبثقة للطباعة.");return;}w.document.write(html);w.document.close();
  };

  const convert=async()=>{
    if(!org||!convertRow)return;
    if(convertRow.invoice_id||convertRow.status==="converted"){alert("هذا العرض تم تحويله بالفعل.");return;}
    const paid=payType==="cash"?convertRow.total:payType==="credit"?0:Math.min(convertRow.total,Number((document.getElementById("quotation-paid") as HTMLInputElement)?.value)||0);
    const due=convertRow.total-paid;
    if(paid>0&&!treasuryAcc){alert("اختر خزنة التحصيل.");return;}
    if(due>0&&!customerAcc){alert("اختر حساب العميل/الذمم.");return;}
    if(!revenueAcc){alert("اختر حساب إيراد المبيعات.");return;}
    if(convertRow.tax_amount>0&&!taxAcc){alert("اختر حساب ضريبة المخرجات.");return;}
    if(!window.confirm("سيتم إنشاء فاتورة وترحيل قيد محاسبي. هل تريد المتابعة؟"))return;
    setSaving(true);
    const inv=await DB.createSalesInvoice(org.id,{
      branch_id:convertRow.branch_id,date:today(),party_id:convertRow.party_id,customer_name:convertRow.customer_name,
      payment_type:payType,treasury_account_id:treasuryAcc?Number(treasuryAcc):null,
      customer_account_id:customerAcc?Number(customerAcc):null,revenue_account_id:Number(revenueAcc),
      tax_account_id:taxAcc?Number(taxAcc):null,tax_rate:convertRow.tax_rate,tax_inclusive:false,
      items:convertRow.items.map(i=>{const unit=convertRow.subtotal>0?i.unit_price*convertRow.subtotal/Math.max(0.01,convertRow.items.reduce((s,x)=>s+x.line_total,0)):i.unit_price;return {...i,unit_price:unit,line_total:Math.round(i.qty*unit*100)/100};}),
      paid_amount:paid,notes:`تحويل من عرض السعر رقم ${convertRow.quotation_no}. ${convertRow.notes||""}`.trim()
    });
    if(!inv.ok||!inv.id){setSaving(false);alert("تعذر إنشاء الفاتورة: "+inv.error);return;}
    const marked=await DB.markQuotationConverted(convertRow.id,inv.id);
    setSaving(false);setConvertRow(null);
    if(!marked.ok){alert("تم إنشاء الفاتورة رقم "+inv.invoiceNo+" لكن تعذر تحديث حالة العرض: "+marked.error+". راجع الفاتورة قبل إعادة المحاولة لتجنب التكرار.");}
    else alert("تم تحويل العرض إلى فاتورة رقم "+inv.invoiceNo);
    await reload();
  };

  const filtered=rows.filter(q=>{
    const name=q.customer_name||parties.find(p=>p.id===q.party_id)?.name||"";
    const code=quoteCode(q);
    const needle=search.trim().toLowerCase();
    return !needle||`${q.quotation_no} ${q.quotation_year} ${code} ${name}`.toLowerCase().includes(needle);
  });
  const stats={total:filtered.length,accepted:filtered.filter(q=>q.status==="accepted").length,pending:filtered.filter(q=>q.status==="draft"||q.status==="sent").length,rejected:filtered.filter(q=>q.status==="rejected").length};
  const postable=accounts.filter(a=>!a.is_group);
  if(loading&&!org)return <div className="p-8 text-center text-slate-400">جارٍ تحميل بيانات المؤسسة…</div>;
  if(!org)return <div className="m-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6 text-center text-amber-300" dir="rtl">الفرع الحالي غير مرتبط بمؤسسة. اربط الفرع بمؤسسة أولًا لتفعيل عروض الأسعار.</div>;

  return <div className="min-h-screen p-4 lg:p-6 text-white" dir="rtl">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-black">عروض الأسعار</h1><p className="mt-1 text-xs text-slate-400">إنشاء ومتابعة عروض الأسعار وتحويل المقبول منها إلى فاتورة مبيعات</p></div>
      <button className={`${btn} bg-blue-600 text-white`} onClick={()=>{reset();if(branchFilter)setBranch(branchFilter);setFormStep("basic");setShowForm(true);}}><FilePlus2 size={16}/> عرض سعر جديد</button>
    </div>
    <div className="mb-4 grid grid-cols-1 gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-4 md:grid-cols-5">
      <label className="text-xs text-slate-400">دفتر عروض الفرع<select className={`${input} mt-1`} value={branchFilter} onChange={e=>setBranchFilter(e.target.value)}><option value="">كل دفاتر الفروع</option>{(branches||[]).map((b:any)=><option key={b.id} value={b.id}>{b.name} — دفتر مستقل</option>)}</select></label>
      <label className="text-xs text-slate-400">من تاريخ<input className={`${input} mt-1`} type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label>
      <label className="text-xs text-slate-400">إلى تاريخ<input className={`${input} mt-1`} type="date" value={to} onChange={e=>setTo(e.target.value)}/></label>
      <label className="text-xs text-slate-400 md:col-span-2">بحث برقم العرض أو اسم العميل<div className="relative mt-1"><Search className="absolute right-3 top-2.5 text-slate-500" size={15}/><input className={`${input} pr-9`} value={search} onChange={e=>setSearch(e.target.value)} placeholder="مثال: QT-B12-2026-000145 أو اسم العميل"/></div></label>
    </div>
    <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
      {[{label:"إجمالي العروض",value:stats.total,style:"border-blue-500/30 bg-blue-500/10 text-blue-200"},{label:"مقبولة",value:stats.accepted,style:"border-emerald-500/30 bg-emerald-500/10 text-emerald-200"},{label:"قيد المتابعة",value:stats.pending,style:"border-amber-500/30 bg-amber-500/10 text-amber-200"},{label:"مرفوضة",value:stats.rejected,style:"border-rose-500/30 bg-rose-500/10 text-rose-200"}].map(k=><div key={k.label} className={`rounded-2xl border p-4 ${k.style}`}><div className="text-xs opacity-80">{k.label}</div><div className="mt-2 text-2xl font-black">{k.value}</div></div>)}
    </div>
    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-800 p-4"><div><b className="text-sm">{branchFilter?`دفتر عروض ${branchLabel(Number(branchFilter))}`:"دفاتر عروض الأسعار"}</b><p className="mt-1 text-[11px] text-slate-500">تسلسل مستقل لكل فرع — البحث يشمل رقم العرض واسم العميل</p></div><button className={`${btn} bg-slate-800 text-slate-300`} onClick={()=>void reload()}><RefreshCw size={14}/> تحديث</button></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-right text-xs"><thead className="bg-slate-950 text-slate-400"><tr>{["رقم العرض","التاريخ","العميل","الفرع","الإجمالي","الصلاحية","الحالة","الإجراءات"].map(x=><th className="p-3" key={x}>{x}</th>)}</tr></thead><tbody>
        {filtered.map(q=><tr className="border-t border-slate-800" key={q.id}><td className="p-3 font-bold text-blue-300">{quoteCode(q)}</td><td className="p-3">{q.date}</td><td className="p-3">{q.customer_name||parties.find(p=>p.id===q.party_id)?.name||"—"}</td><td className="p-3"><span className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1">{branchLabel(q.branch_id)}</span></td><td className="p-3 font-bold">{money(q.total)} ر.س</td><td className="p-3">{q.valid_until||"—"}</td><td className="p-3"><span className="rounded-lg bg-slate-800 px-2 py-1">{q.status==="converted"?"تم التحويل":q.status==="accepted"?"مقبول":q.status==="rejected"?"مرفوض":q.status==="sent"?"مرسل":"مسودة"}</span></td><td className="p-3"><div className="flex gap-2"><button title="طباعة" className="rounded-lg bg-slate-800 p-2 text-blue-300" onClick={()=>print(q)}><Printer size={15}/></button>{!q.invoice_id&&q.status!=="converted"&&<><button title="تحويل إلى فاتورة" className="rounded-lg bg-emerald-500/10 p-2 text-emerald-300" onClick={()=>{setConvertRow(q);setPayType("cash");setTreasuryAcc("");setCustomerAcc(String(parties.find(p=>p.id===q.party_id)?.account_id||""));setRevenueAcc("");setTaxAcc("");}}><ArrowRightLeft size={15}/></button><button title="حذف" className="rounded-lg bg-red-500/10 p-2 text-red-300" onClick={async()=>{if(confirm("حذف عرض السعر؟")){const r=await DB.deleteQuotation(q.id);if(!r.ok)alert(r.error);await reload();}}}><Trash2 size={15}/></button></>}</div></td></tr>)}
        {!filtered.length&&<tr><td colSpan={8} className="p-10 text-center text-slate-500">{loading?"جارٍ التحميل…":"لا توجد عروض أسعار خلال الفترة المحددة."}</td></tr>}
      </tbody></table></div>
    </div>

    {showForm&&<div className="fixed inset-0 z-[100] flex h-[100dvh] w-screen items-stretch justify-stretch overflow-hidden bg-slate-950/95 p-0 backdrop-blur-sm">
      <div className="flex h-full min-h-0 w-full max-h-none max-w-none flex-col overflow-hidden rounded-none border-0 bg-[#081326] shadow-none">
        <div className="shrink-0 border-b border-slate-700/80 bg-gradient-to-l from-blue-950/70 to-slate-900/80 px-4 py-4 sm:px-8 lg:px-10">
          <div className="flex items-start justify-between gap-3">
            <div><div className="flex items-center gap-2 text-blue-300"><FilePlus2 size={18}/><span className="text-[11px] font-bold tracking-wide">MIHWAR · SALES</span></div><h2 className="mt-1 text-xl font-black sm:text-2xl">إنشاء عرض سعر</h2><p className="mt-1 text-xs text-slate-400">أدخل بيانات العرض على مراحل، وراجع الإجمالي قبل الحفظ</p></div>
            <button aria-label="إغلاق" className="rounded-xl border border-slate-700 bg-slate-900/80 p-2 text-slate-300 transition hover:border-red-400/50 hover:text-red-300" onClick={()=>setShowForm(false)}><X size={19}/></button>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-400/20 bg-slate-950/50 px-4 py-3">
            <div><div className="text-[10px] text-slate-500">رقم العرض</div><div className="mt-1 text-sm font-black tracking-wide text-blue-200">يُنشأ تلقائيًا عند الحفظ</div></div>
            <div className="text-left"><div className="text-[10px] text-slate-500">دفتر الفرع</div><div className="mt-1 text-sm font-bold text-white">{branch?branchLabel(Number(branch)):"اختر الفرع لإظهار دفتره"}</div></div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {([{id:"basic",n:"01",label:"البيانات الأساسية",hint:"العميل والتواريخ"},{id:"items",n:"02",label:"الأصناف",hint:"الكميات والأسعار"},{id:"terms",n:"03",label:"الشروط والملاحظات",hint:"الضريبة والخصم"},{id:"preview",n:"04",label:"مراجعة العرض",hint:"الإجمالي والحفظ"}] as const).map((t)=><button key={t.id} onClick={()=>setFormStep(t.id)} className={`rounded-xl border px-3 py-2.5 text-right transition ${formStep===t.id?"border-blue-400 bg-blue-600/20 shadow-[inset_0_-2px_0_#3b82f6]":"border-slate-700 bg-slate-900/70 hover:border-slate-500"}`}><div className="flex items-center gap-2"><span className={`text-[10px] font-black ${formStep===t.id?"text-blue-300":"text-slate-500"}`}>{t.n}</span><span className="text-xs font-bold text-white">{t.label}</span></div><div className="mt-1 hidden text-[10px] text-slate-500 sm:block">{t.hint}</div></button>)}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-8 lg:px-10">
          {formStep==="basic"&&<section className="space-y-4"><div className="mb-2"><h3 className="text-base font-black">بيانات العرض والعميل</h3><p className="mt-1 text-xs text-slate-500">حدد الفرع والعميل وتاريخ إصدار العرض وصلاحيته</p></div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <label className="text-xs font-semibold text-slate-300">تاريخ العرض <span className="text-rose-400">*</span><input className={`${input} mt-2 h-12`} type="date" value={date} onChange={e=>setDate(e.target.value)}/></label>
              <label className="text-xs font-semibold text-slate-300">صالح حتى<input className={`${input} mt-2 h-12`} type="date" value={validUntil} min={date} onChange={e=>setValidUntil(e.target.value)}/></label>
              <label className="text-xs font-semibold text-slate-300">دفتر الفرع <span className="text-rose-400">*</span><select className={`${input} mt-2 h-12`} value={branch} onChange={e=>setBranch(e.target.value)}><option value="">اختر الفرع</option>{(branches||[]).map((b:any)=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
              <label className="text-xs font-semibold text-slate-300">العميل<select className={`${input} mt-2 h-12`} value={partyId} onChange={e=>{setPartyId(e.target.value);setCustomerName("");}}><option value="">عميل جديد / اسم يدوي</option>{parties.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            </div>
            {!partyId&&<label className="block text-xs font-semibold text-slate-300">اسم العميل أو المنشأة<input className={`${input} mt-2 h-12`} value={customerName} onChange={e=>setCustomerName(e.target.value)} placeholder="اكتب الاسم كما سيظهر في عرض السعر"/></label>}
            <div className="rounded-2xl border border-blue-400/15 bg-blue-500/5 p-4 text-xs leading-6 text-slate-300"><b className="text-blue-200">تنبيه الدفتر:</b> سيتم حفظ العرض في دفتر الفرع المحدد، وسيُخصص له رقم مستقل عند الحفظ.</div>
          </section>}

          {formStep==="items"&&<section className="space-y-4"><div className="flex flex-wrap items-end justify-between gap-3"><div><h3 className="text-base font-black">أصناف عرض السعر</h3><p className="mt-1 text-xs text-slate-500">أضف البنود وحدد الكمية وسعر الوحدة</p></div><button className={`${btn} border border-blue-400/30 bg-blue-600/15 text-blue-200`} onClick={()=>setItems(old=>[...old,{description:"",qty:"1",unit_price:""}])}><Plus size={15}/> إضافة صنف</button></div>
            <div className="overflow-x-auto rounded-2xl border border-slate-700"><table className="w-full min-w-[720px] text-xs"><thead className="bg-slate-900 text-slate-400"><tr><th className="w-10 p-3">#</th><th className="p-3 text-right">الصنف / البيان</th><th className="w-36 p-3">الكمية</th><th className="w-44 p-3">سعر الوحدة (ر.س)</th><th className="w-36 p-3">الإجمالي (ر.س)</th><th className="w-16 p-3">حذف</th></tr></thead><tbody>{items.map((it,i)=><tr key={i} className="border-t border-slate-800"><td className="p-3 text-center text-slate-500">{i+1}</td><td className="p-2"><input className={`${input} h-11`} value={it.description} onChange={e=>setItem(i,{description:e.target.value})} placeholder="اسم الصنف أو وصف الخدمة"/></td><td className="p-2"><input className={`${input} h-11 text-center`} type="number" min="0" step="1" value={it.qty} onChange={e=>setItem(i,{qty:e.target.value})}/></td><td className="p-2"><input className={`${input} h-11 text-center`} type="number" min="0" step="0.01" value={it.unit_price} onChange={e=>setItem(i,{unit_price:e.target.value})}/></td><td className="p-3 text-center font-black text-blue-200">{money((Number(it.qty)||0)*(Number(it.unit_price)||0))}</td><td className="p-2 text-center"><button aria-label="حذف الصنف" className="rounded-lg p-2 text-rose-300 hover:bg-rose-500/10" onClick={()=>setItems(old=>old.length>1?old.filter((_,n)=>n!==i):[{description:"",qty:"1",unit_price:""}])}><Trash2 size={15}/></button></td></tr>)}</tbody></table></div>
            <div className="flex flex-wrap justify-between gap-3 rounded-2xl border border-slate-700 bg-slate-900/70 p-4"><div className="text-xs text-slate-400">عدد البنود <b className="mr-2 text-white">{items.length}</b></div><div className="text-sm text-slate-300">إجمالي البنود <b className="mr-2 text-lg text-white">{money(items.reduce((s,it)=>s+(Number(it.qty)||0)*(Number(it.unit_price)||0),0))} ر.س</b></div></div>
          </section>}

          {formStep==="terms"&&<section className="space-y-4"><div><h3 className="text-base font-black">الإعدادات المالية والشروط</h3><p className="mt-1 text-xs text-slate-500">راجع الضريبة والخصم وأضف أي شروط أو ملاحظات للعميل</p></div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3"><label className="text-xs font-semibold text-slate-300">نسبة الضريبة %<input className={`${input} mt-2 h-12`} type="number" min="0" max="100" value={taxRate} onChange={e=>setTaxRate(e.target.value)}/></label><label className="text-xs font-semibold text-slate-300">الخصم (ر.س)<input className={`${input} mt-2 h-12`} type="number" min="0" value={discount} onChange={e=>setDiscount(e.target.value)}/></label><label className="flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-xs text-slate-200"><input className="h-4 w-4 accent-blue-500" type="checkbox" checked={taxInclusive} onChange={e=>setTaxInclusive(e.target.checked)}/> الأسعار شاملة الضريبة</label></div>
            <label className="block text-xs font-semibold text-slate-300">الشروط والملاحظات<textarea className={`${input} mt-2 min-h-36 resize-y`} rows={5} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="أضف مدة صلاحية العرض، شروط التوريد أو أي ملاحظات تظهر للعميل..."/></label>
            <div className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4 text-xs leading-6 text-amber-200">حفظ عرض السعر لا ينشئ قيدًا محاسبيًا ولا يخصم المخزون. الأثر المحاسبي والمخزني يبدأ فقط عند تحويل العرض إلى فاتورة.</div>
          </section>}

          {formStep==="preview"&&<section className="space-y-4"><div><h3 className="text-base font-black">مراجعة العرض قبل الحفظ</h3><p className="mt-1 text-xs text-slate-500">تأكد من البيانات والإجماليات قبل إنشاء رقم العرض النهائي</p></div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4"><div className="text-[11px] text-slate-500">العميل</div><div className="mt-2 font-bold">{partyId?parties.find(p=>String(p.id)===partyId)?.name:customerName||"لم يتم تحديد العميل"}</div><div className="mt-4 text-[11px] text-slate-500">الفرع</div><div className="mt-1 font-bold">{branch?branchLabel(Number(branch)):"لم يتم اختيار الفرع"}</div></div><div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4"><div className="text-[11px] text-slate-500">تاريخ العرض</div><div className="mt-2 font-bold">{date}</div><div className="mt-4 text-[11px] text-slate-500">صالح حتى</div><div className="mt-1 font-bold">{validUntil||"غير محدد"}</div></div></div>
            <div className="overflow-hidden rounded-2xl border border-slate-700"><div className="bg-slate-900 px-4 py-3 text-xs font-bold">ملخص الأصناف ({items.filter(i=>i.description.trim()).length})</div><div className="divide-y divide-slate-800">{items.filter(i=>i.description.trim()).map((it,i)=><div key={i} className="flex flex-wrap justify-between gap-2 px-4 py-3 text-xs"><span>{it.description} <span className="text-slate-500">× {it.qty}</span></span><b>{money((Number(it.qty)||0)*(Number(it.unit_price)||0))} ر.س</b></div>)}</div></div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4 text-sm leading-8"><div className="flex justify-between"><span className="text-slate-400">قبل الضريبة</span><b>{money(totals.subtotal)} ر.س</b></div><div className="flex justify-between"><span className="text-slate-400">الخصم</span><b>{money(totals.discount)} ر.س</b></div><div className="flex justify-between"><span className="text-slate-400">الضريبة ({taxRate}%)</span><b>{money(totals.tax)} ر.س</b></div><div className="mt-2 flex justify-between border-t border-slate-700 pt-3 text-lg font-black text-emerald-300"><span>الإجمالي النهائي</span><span>{money(totals.total)} ر.س</span></div></div><div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4 text-xs leading-7"><b className="text-slate-200">ملاحظات العرض</b><p className="mt-2 whitespace-pre-wrap text-slate-400">{notes||"لا توجد ملاحظات"}</p></div></div>
          </section>}
        </div>

        <div className="shrink-0 border-t border-slate-700 bg-slate-950/95 px-4 py-3 sm:px-8 lg:px-10"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex gap-2"><button className={`${btn} border border-slate-700 bg-slate-900 text-slate-300`} onClick={()=>setShowForm(false)}>إلغاء</button>{formStep!=="basic"&&<button className={`${btn} border border-slate-700 bg-slate-900 text-slate-200`} onClick={()=>setFormStep(formStep==="preview"?"terms":formStep==="terms"?"items":"basic")}>السابق</button>}</div><div className="flex gap-2">{formStep!=="preview"?<button className={`${btn} bg-blue-600 px-5 py-3 text-white shadow-lg shadow-blue-950/40`} onClick={()=>setFormStep(formStep==="basic"?"items":formStep==="items"?"terms":"preview")}>التالي <span>←</span></button>:<button disabled={saving} className={`${btn} bg-blue-600 px-6 py-3 text-white shadow-lg shadow-blue-950/40 disabled:opacity-50`} onClick={()=>void save()}>{saving?"جارٍ الحفظ…":"حفظ عرض السعر"}</button>}</div></div></div>
      </div>
    </div>}

    {convertRow&&<div className="fixed inset-0 z-[110] flex items-center justify-center overflow-y-auto bg-black/70 p-3"><div className="my-6 w-full max-w-xl rounded-2xl border border-slate-700 bg-slate-900 p-5">
      <div className="mb-4 flex justify-between"><h2 className="font-black">تحويل العرض إلى فاتورة</h2><button onClick={()=>setConvertRow(null)}><X/></button></div>
      <p className="mb-4 text-sm text-slate-400">عرض رقم {convertRow.quotation_no} — الإجمالي {money(convertRow.total)} ر.س</p>
      <label className="mb-3 block text-xs text-slate-400">طريقة السداد<select className={`${input} mt-1`} value={payType} onChange={e=>setPayType(e.target.value as DB.SalesPayType)}><option value="cash">نقدي</option><option value="credit">آجل</option><option value="partial">جزئي</option></select></label>
      {payType!=="credit"&&<label className="mb-3 block text-xs text-slate-400">خزنة التحصيل<select className={`${input} mt-1`} value={treasuryAcc} onChange={e=>setTreasuryAcc(e.target.value)}><option value="">اختر الخزنة</option>{treasuries.filter(t=>t.is_active&&t.account_id).map(t=><option key={t.id} value={t.account_id!}>{t.name}</option>)}</select></label>}
      {payType!=="cash"&&<label className="mb-3 block text-xs text-slate-400">حساب العميل / الذمم<select className={`${input} mt-1`} value={customerAcc} onChange={e=>setCustomerAcc(e.target.value)}><option value="">اختر الحساب</option>{postable.filter(a=>a.type==="asset").map(a=><option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}</select></label>}
      {payType==="partial"&&<label className="mb-3 block text-xs text-slate-400">المبلغ المدفوع<input id="quotation-paid" className={`${input} mt-1`} type="number" min="0" max={convertRow.total} defaultValue="0"/></label>}
      <label className="mb-3 block text-xs text-slate-400">حساب إيراد المبيعات<select className={`${input} mt-1`} value={revenueAcc} onChange={e=>setRevenueAcc(e.target.value)}><option value="">اختر حساب الإيراد</option>{postable.filter(a=>a.type==="revenue").map(a=><option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}</select></label>
      {convertRow.tax_amount>0&&<label className="mb-4 block text-xs text-slate-400">حساب ضريبة المخرجات<select className={`${input} mt-1`} value={taxAcc} onChange={e=>setTaxAcc(e.target.value)}><option value="">اختر حساب الضريبة</option>{postable.filter(a=>a.type==="liability").map(a=><option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}</select></label>}
      <div className="flex justify-end gap-2"><button className={`${btn} bg-slate-800 text-slate-300`} onClick={()=>setConvertRow(null)}>إلغاء</button><button disabled={saving} className={`${btn} bg-emerald-600 text-white`} onClick={()=>void convert()}>{saving?"جارٍ التحويل…":"إنشاء الفاتورة وترحيل القيد"}</button></div>
      <p className="mt-3 text-[11px] text-amber-300">التحويل ينشئ فاتورة ويرحّل قيدًا محاسبيًا. لا توجد معاملة SQL ذرّية حتى الآن؛ لا تعاود المحاولة إذا ظهرت رسالة تفيد بإنشاء الفاتورة مع فشل تحديث العرض قبل مراجعة الفاتورة.</p>
    </div></div>}
  </div>;
}
