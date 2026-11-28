import { useCallback, useEffect, useMemo, useState } from "react";
import { FilePlus2, Printer, Search, Trash2, RefreshCw, ArrowRightLeft, Plus, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useLang } from "../../context/LanguageContext";
import { fetchPrintOrg } from "../sales/salesInvoiceApi";
import { printHTML } from "../sales/salesInvoicePrint";
import { buildDocHTML } from "../print/docTemplates";
import * as DB from "../lib/accountingDb";
import PartyQuickEditor from "../lib/PartyQuickEditor";
import type { GLAccount, GLParty, GLQuotation, GLTreasury, SalesItem } from "../lib/accountingDb";
import { cashBankOptions } from "../lib/cashAccounts";

import { curAr } from "../lib/orgConfig";
const today = () => new Date().toISOString().slice(0, 10);
const firstDay = () => `${today().slice(0, 8)}01`;
const money = (v: number) => (Number(v) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const input = "w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-blue-500";
const btn = "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold";
type DraftItem = { description: string; qty: string; unit_price: string };

export default function QuotationPage() {
  const { ownedShopId, branches } = (useAuth() as any) ?? {};
  const { lang, t, isRTL } = useLang();
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
  const [partyEditorOpen,setPartyEditorOpen] = useState(false);
  const [partyEditorRow,setPartyEditorRow] = useState<GLParty|null>(null);

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
    const disc=Math.max(0,Math.min(Number(discount)||0,raw.subtotal));
    const subtotal=Math.max(0,raw.subtotal-disc);
    const tax=Math.round(subtotal*(Number(taxRate)||0)/100*100)/100;
    return {subtotal,discount:disc,tax,total:Math.round((subtotal+tax)*100)/100};
  },[items,taxRate,taxInclusive,discount]);
  const branchId=branch?Number(branch):(branches?.length===1?Number(branches[0].id):null);
  const setItem=(i:number,p:Partial<DraftItem>)=>setItems(old=>old.map((v,n)=>n===i?{...v,...p}:v));
  const reset=()=>{setDate(today());setValidUntil("");setBranch(branches?.length===1?String(branches[0].id):"");setPartyId("");setCustomerName("");setTaxRate("15");setTaxInclusive(false);setDiscount("0");setNotes("");setItems([{description:"",qty:"1",unit_price:""}]);};

  const save=async()=>{
    if(!org)return;
    const clean:SalesItem[]=items.map(i=>({description:i.description.trim(),qty:Number(i.qty)||0,unit_price:Number(i.unit_price)||0,line_total:Math.round((Number(i.qty)||0)*(Number(i.unit_price)||0)*100)/100})).filter(i=>i.description&&i.qty>0&&i.line_total>0);
    if(!clean.length){alert(t("Enter at least one item with quantity and price.", "أدخل صنفًا واحدًا على الأقل مع الكمية والسعر."));return;}
    if(branches?.length>1&&!branch){alert(t("Select a branch.", "اختر الفرع."));return;}
    setSaving(true);
    const r=await DB.createQuotation(org.id,{branch_id:branchId,date,valid_until:validUntil||null,party_id:partyId?Number(partyId):null,customer_name:customerName.trim()||null,items:clean,discount_amount:totals.discount,tax_rate:Number(taxRate)||0,tax_inclusive:taxInclusive,notes:notes.trim()||null});
    setSaving(false);
    if(!r.ok){alert(t("Could not save the quotation: ", "تعذر حفظ العرض: ")+r.error);return;}
    alert(t(`Quotation no. ${r.quotationNo} saved`, `تم حفظ عرض السعر رقم ${r.quotationNo}`));
    setShowForm(false);reset();await reload();
  };

  const print=async(q:GLQuotation)=>{
    const customer=q.customer_name||parties.find(p=>p.id===q.party_id)?.name||"—";
    const po=await fetchPrintOrg(org?.id??0, ownedShopId??null).catch(()=>({name:org?.name??null,tax_number:null,commercial_registration:null,phone:null,address:null,logo_url:null}));
    const items=(q.items||[]).map(it=>({description:it.description,qty:Number(it.qty)||0,price:Number(it.unit_price)||0,total:Number(it.line_total)||0}));
    printHTML(buildDocHTML({kind:"quotation",number:`QT-${q.quotation_year}-${String(q.quotation_no).padStart(4,"0")}`,date:q.date,dueDate:q.valid_until,partyName:customer,items,subtotal:q.subtotal,discount:q.discount_amount,taxRate:q.tax_rate,tax:q.tax_amount,total:q.total,notes:q.notes,currency:"",branchId:ownedShopId??null},po,lang==="en"?"en":"ar"));
  };

  const convert=async()=>{
    if(!org||!convertRow)return;
    if(convertRow.invoice_id||convertRow.status==="converted"){alert(t("This quotation has already been converted.", "هذا العرض تم تحويله بالفعل."));return;}
    const paid=payType==="cash"?convertRow.total:payType==="credit"?0:Math.min(convertRow.total,Number((document.getElementById("quotation-paid") as HTMLInputElement)?.value)||0);
    const due=convertRow.total-paid;
    if(paid>0&&!treasuryAcc){alert(t("Select the collection cash account.", "اختر خزنة التحصيل."));return;}
    if(due>0&&!customerAcc){alert(t("Select the customer/receivables account.", "اختر حساب العميل/الذمم."));return;}
    if(!revenueAcc){alert(t("Select the sales revenue account.", "اختر حساب إيراد المبيعات."));return;}
    if(convertRow.tax_amount>0&&!taxAcc){alert(t("Select the output tax account.", "اختر حساب ضريبة المخرجات."));return;}
    if(!window.confirm(t("An invoice will be created and a journal entry posted. Continue?", "سيتم إنشاء فاتورة وترحيل قيد محاسبي. هل تريد المتابعة؟")))return;
    setSaving(true);
    const inv=await DB.createSalesInvoice(org.id,{
      branch_id:convertRow.branch_id,date:today(),party_id:convertRow.party_id,customer_name:convertRow.customer_name,
      payment_type:payType,treasury_account_id:treasuryAcc?Number(treasuryAcc):null,
      customer_account_id:customerAcc?Number(customerAcc):null,revenue_account_id:Number(revenueAcc),
      tax_account_id:taxAcc?Number(taxAcc):null,tax_rate:convertRow.tax_rate,tax_inclusive:false,
      items:convertRow.items.map(i=>{const unit=convertRow.subtotal>0?i.unit_price*convertRow.subtotal/Math.max(0.01,convertRow.items.reduce((s,x)=>s+x.line_total,0)):i.unit_price;return {...i,unit_price:unit,line_total:Math.round(i.qty*unit*100)/100};}),
      paid_amount:paid,notes:t(`Converted from quotation no. ${convertRow.quotation_no}. ${convertRow.notes||""}`, `تحويل من عرض السعر رقم ${convertRow.quotation_no}. ${convertRow.notes||""}`).trim()
    });
    if(!inv.ok||!inv.id){setSaving(false);alert(t("Could not create the invoice: ", "تعذر إنشاء الفاتورة: ")+inv.error);return;}
    const marked=await DB.markQuotationConverted(convertRow.id,inv.id);
    setSaving(false);setConvertRow(null);
    if(!marked.ok){alert(t("Invoice created, no. ", "تم إنشاء الفاتورة رقم ")+inv.invoiceNo+t(" but updating the quotation status failed: ", " لكن تعذر تحديث حالة العرض: ")+marked.error+t(". Review the invoice before retrying to avoid duplicates.", ". راجع الفاتورة قبل إعادة المحاولة لتجنب التكرار."));}
    else alert(t("Quotation converted to invoice no. ", "تم تحويل العرض إلى فاتورة رقم ")+inv.invoiceNo);
    await reload();
  };

  const filtered=rows.filter(q=>{
    const name=q.customer_name||parties.find(p=>p.id===q.party_id)?.name||"";
    return !search||`${q.quotation_no} ${name}`.toLowerCase().includes(search.toLowerCase());
  });
  const postable=accounts.filter(a=>!a.is_group);
  if(loading&&!org)return <div className="p-8 text-center text-slate-400">{t("Loading organization data…", "جارٍ تحميل بيانات المؤسسة…")}</div>;
  if(!org)return <div className="m-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6 text-center text-amber-300" dir={isRTL ? "rtl" : "ltr"}>{t("The current branch is not linked to an organization. Link it to an organization first to enable quotations.", "الفرع الحالي غير مرتبط بمؤسسة. اربط الفرع بمؤسسة أولًا لتفعيل عروض الأسعار.")}</div>;

  return <div className="min-h-screen p-4 lg:p-6 text-white" dir={isRTL ? "rtl" : "ltr"}>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-black">{t("Quotations", "عروض الأسعار")}</h1><p className="mt-1 text-xs text-slate-400">{t("Create and track quotations and convert accepted ones into a sales invoice", "إنشاء ومتابعة عروض الأسعار وتحويل المقبول منها إلى فاتورة مبيعات")}</p></div>
      {!showForm&&<button className={`${btn} bg-blue-600 text-white`} onClick={()=>{reset();setShowForm(true);}}><FilePlus2 size={16}/> {t("New quotation", "عرض سعر جديد")}</button>}
    </div>
    {!showForm&&<>
    <div className="mb-4 grid grid-cols-1 gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-4 md:grid-cols-5">
      <label className="text-xs text-slate-400">{t("From date", "من تاريخ")}<input className={`${input} mt-1`} type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label>
      <label className="text-xs text-slate-400">{t("To date", "إلى تاريخ")}<input className={`${input} mt-1`} type="date" value={to} onChange={e=>setTo(e.target.value)}/></label>
      <label className="text-xs text-slate-400">{t("Branch", "الفرع")}<select className={`${input} mt-1`} value={branchFilter} onChange={e=>setBranchFilter(e.target.value)}><option value="">{t("All branches", "كل الفروع")}</option>{(branches||[]).map((b:any)=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
      <label className="text-xs text-slate-400 md:col-span-2">{t("Search by quotation no. or customer", "بحث برقم العرض أو العميل")}<div className="relative mt-1"><Search className="absolute right-3 top-2.5 text-slate-500" size={15}/><input className={`${input} pr-9`} value={search} onChange={e=>setSearch(e.target.value)} placeholder={t("Search...", "بحث...")}/></div></label>
    </div>
    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-800 p-4"><b className="text-sm">{t("Quotations log", "سجل عروض الأسعار")}</b><button className={`${btn} bg-slate-800 text-slate-300`} onClick={()=>void reload()}><RefreshCw size={14}/> {t("Refresh", "تحديث")}</button></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-right text-xs"><thead className="bg-slate-950 text-slate-400"><tr>{[t("Quotation no.", "رقم العرض"),t("Date", "التاريخ"),t("Customer", "العميل"),t("Total", "الإجمالي"),t("Validity", "الصلاحية"),t("Status", "الحالة"),t("Actions", "الإجراءات")].map(x=><th className="p-3" key={x}>{x}</th>)}</tr></thead><tbody>
        {filtered.map(q=><tr className="border-t border-slate-800" key={q.id}><td className="p-3 font-bold">QT-{q.quotation_year}-{String(q.quotation_no).padStart(4,"0")}</td><td className="p-3">{q.date}</td><td className="p-3">{q.customer_name||parties.find(p=>p.id===q.party_id)?.name||"—"}</td><td className="p-3 font-bold">{money(q.total)} {curAr()}</td><td className="p-3">{q.valid_until||"—"}</td><td className="p-3"><span className="rounded-lg bg-slate-800 px-2 py-1">{q.status==="converted"?t("Converted", "تم التحويل"):q.status==="accepted"?t("Accepted", "مقبول"):q.status==="rejected"?t("Rejected", "مرفوض"):q.status==="sent"?t("Sent", "مرسل"):t("Draft", "مسودة")}</span></td><td className="p-3"><div className="flex gap-2"><button title={t("Print", "طباعة")} className="rounded-lg bg-slate-800 p-2 text-blue-300" onClick={()=>print(q)}><Printer size={15}/></button>{!q.invoice_id&&q.status!=="converted"&&<><button title={t("Convert to invoice", "تحويل إلى فاتورة")} className="rounded-lg bg-emerald-500/10 p-2 text-emerald-300" onClick={()=>{setConvertRow(q);setPayType("cash");setTreasuryAcc("");setCustomerAcc(String(parties.find(p=>p.id===q.party_id)?.account_id||""));setRevenueAcc("");setTaxAcc("");}}><ArrowRightLeft size={15}/></button><button title={t("Delete", "حذف")} className="rounded-lg bg-red-500/10 p-2 text-red-300" onClick={async()=>{if(confirm(t("Delete this quotation?", "حذف عرض السعر؟"))){const r=await DB.deleteQuotation(q.id);if(!r.ok)alert(r.error);await reload();}}}><Trash2 size={15}/></button></>}</div></td></tr>)}
        {!filtered.length&&<tr><td colSpan={7} className="p-10 text-center text-slate-500">{loading?t("Loading…", "جارٍ التحميل…"):t("No quotations in the selected period.", "لا توجد عروض أسعار خلال الفترة المحددة.")}</td></tr>}
      </tbody></table></div>
    </div>
    </>}

    {showForm&&<section className="w-full rounded-2xl border border-slate-800 bg-slate-900 p-4 lg:p-6">
      <div className="mb-5 flex items-center justify-between border-b border-slate-800 pb-4"><div><h2 className="text-xl font-black">{t("Create quotation", "إنشاء عرض سعر")}</h2><p className="mt-1 text-xs text-slate-400">{t("Enter customer, items, tax and notes", "أدخل بيانات العميل والأصناف والضريبة والملاحظات")}</p></div><button className={`${btn} bg-slate-800 text-slate-300`} onClick={()=>setShowForm(false)}><X size={16}/> {t("Back", "رجوع")}</button></div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <label className="text-xs text-slate-400">{t("Date", "التاريخ")}<input className={`${input} mt-1`} type="date" value={date} onChange={e=>setDate(e.target.value)}/></label>
        <label className="text-xs text-slate-400">{t("Valid until", "صالح حتى")}<input className={`${input} mt-1`} type="date" value={validUntil} min={date} onChange={e=>setValidUntil(e.target.value)}/></label>
        <label className="text-xs text-slate-400">{t("Branch", "الفرع")}<select className={`${input} mt-1`} value={branch} onChange={e=>setBranch(e.target.value)}><option value="">{t("Select branch", "اختر الفرع")}</option>{(branches||[]).map((b:any)=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
        <div><label className="text-xs text-slate-400">{t("Customer", "العميل")}<select className={`${input} mt-1`} value={partyId} onChange={e=>{setPartyId(e.target.value);setCustomerName("");}}><option value="">{t("New customer / manual name", "عميل جديد / اسم يدوي")}</option>{parties.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><div className="mt-1 flex gap-2"><button type="button" onClick={()=>{setPartyEditorRow(null);setPartyEditorOpen(true);}} className="text-[11px] font-bold text-emerald-300">{t("+ Create", "+ إنشاء")}</button>{partyId&&<button type="button" onClick={()=>{setPartyEditorRow(parties.find(p=>p.id===Number(partyId))||null);setPartyEditorOpen(true);}} className="text-[11px] font-bold text-blue-300">{t("Edit", "تحرير")}</button>}</div></div>
        {!partyId&&<label className="text-xs text-slate-400 md:col-span-2">{t("Customer name", "اسم العميل")}<input className={`${input} mt-1`} value={customerName} onChange={e=>setCustomerName(e.target.value)} placeholder={t("Customer or company name", "اسم العميل أو المنشأة")}/></label>}
      </div>
      <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[650px] text-xs"><thead className="text-slate-400"><tr><th className="p-2 text-right">{t("Item / description", "الصنف / البيان")}</th><th>{t("Quantity", "الكمية")}</th><th>{t("Unit price", "سعر الوحدة")}</th><th>{t("Total", "الإجمالي")}</th><th></th></tr></thead><tbody>{items.map((it,i)=><tr key={i} className="border-t border-slate-800"><td className="p-2"><input className={input} value={it.description} onChange={e=>setItem(i,{description:e.target.value})} placeholder={t("Item name", "اسم الصنف")}/></td><td className="p-2"><input className={`${input} w-24`} type="number" min="0" value={it.qty} onChange={e=>setItem(i,{qty:e.target.value})}/></td><td className="p-2"><input className={`${input} w-28`} type="number" min="0" step="0.01" value={it.unit_price} onChange={e=>setItem(i,{unit_price:e.target.value})}/></td><td className="p-2 text-center">{money((Number(it.qty)||0)*(Number(it.unit_price)||0))}</td><td><button className="text-red-300" onClick={()=>setItems(old=>old.length>1?old.filter((_,n)=>n!==i):old)}><X size={15}/></button></td></tr>)}</tbody></table><button className={`${btn} mt-3 bg-slate-800 text-slate-200`} onClick={()=>setItems(old=>[...old,{description:"",qty:"1",unit_price:""}])}><Plus size={14}/> {t("Add item", "إضافة صنف")}</button></div>
      <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-4">
        <label className="text-xs text-slate-400">{t("Tax rate %", "نسبة الضريبة %")}<input className={`${input} mt-1`} type="number" min="0" value={taxRate} onChange={e=>setTaxRate(e.target.value)}/></label>
        <label className="text-xs text-slate-400">{t("Discount", "الخصم")}<input className={`${input} mt-1`} type="number" min="0" value={discount} onChange={e=>setDiscount(e.target.value)}/></label>
        <label className="flex items-center gap-2 pt-5 text-xs text-slate-300"><input type="checkbox" checked={taxInclusive} onChange={e=>setTaxInclusive(e.target.checked)}/> {t("Prices include tax", "الأسعار شاملة الضريبة")}</label>
        <label className="text-xs text-slate-400">{t("Notes", "ملاحظات")}<textarea className={`${input} mt-1`} rows={2} value={notes} onChange={e=>setNotes(e.target.value)}/></label>
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-4"><div className="text-sm leading-7"><div>{t("Before tax:", "قبل الضريبة:")} <b>{money(totals.subtotal)}</b></div><div>{t("Tax:", "الضريبة:")} <b>{money(totals.tax)}</b></div><div className="text-lg font-black text-emerald-300">{t("Total:", "الإجمالي:")} {money(totals.total)} {curAr()}</div></div><button disabled={saving} className={`${btn} bg-blue-600 px-6 py-3 text-white disabled:opacity-50`} onClick={()=>void save()}>{saving?t("Saving…", "جارٍ الحفظ…"):t("Save quotation", "حفظ عرض السعر")}</button></div>
      <p className="mt-3 text-[11px] text-amber-300">{t("Saving the quotation does not create a journal entry or deduct stock.", "حفظ العرض لا ينشئ قيدًا محاسبيًا ولا يخصم المخزون.")}</p>
    </section>}

    {convertRow&&<div className="fixed inset-0 z-[110] flex items-center justify-center overflow-y-auto bg-black/70 p-3"><div className="my-6 w-full max-w-xl rounded-2xl border border-slate-700 bg-slate-900 p-5">
      <div className="mb-4 flex justify-between"><h2 className="font-black">{t("Convert quotation to invoice", "تحويل العرض إلى فاتورة")}</h2><button onClick={()=>setConvertRow(null)}><X/></button></div>
      <p className="mb-4 text-sm text-slate-400">{t("Quotation no.", "عرض رقم")} {convertRow.quotation_no} {t("— Total", "— الإجمالي")} {money(convertRow.total)} {curAr()}</p>
      <label className="mb-3 block text-xs text-slate-400">{t("Payment method", "طريقة السداد")}<select className={`${input} mt-1`} value={payType} onChange={e=>setPayType(e.target.value as DB.SalesPayType)}><option value="cash">{t("Cash", "نقدي")}</option><option value="credit">{t("On credit", "آجل")}</option><option value="partial">{t("Partial", "جزئي")}</option></select></label>
      {payType!=="credit"&&<label className="mb-3 block text-xs text-slate-400">{t("Collection cash account", "خزنة التحصيل")}<select className={`${input} mt-1`} value={treasuryAcc} onChange={e=>setTreasuryAcc(e.target.value)}><option value="">{t("Select cash account", "اختر الخزنة")}</option>{cashBankOptions(accounts,treasuries).map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label>}
      {payType!=="cash"&&<label className="mb-3 block text-xs text-slate-400">{t("Customer / receivables account", "حساب العميل / الذمم")}<select className={`${input} mt-1`} value={customerAcc} onChange={e=>setCustomerAcc(e.target.value)}><option value="">{t("Select account", "اختر الحساب")}</option>{postable.filter(a=>a.type==="asset").map(a=><option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}</select></label>}
      {payType==="partial"&&<label className="mb-3 block text-xs text-slate-400">{t("Amount paid", "المبلغ المدفوع")}<input id="quotation-paid" className={`${input} mt-1`} type="number" min="0" max={convertRow.total} defaultValue="0"/></label>}
      <label className="mb-3 block text-xs text-slate-400">{t("Sales revenue account", "حساب إيراد المبيعات")}<select className={`${input} mt-1`} value={revenueAcc} onChange={e=>setRevenueAcc(e.target.value)}><option value="">{t("Select revenue account", "اختر حساب الإيراد")}</option>{postable.filter(a=>a.type==="revenue").map(a=><option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}</select></label>
      {convertRow.tax_amount>0&&<label className="mb-4 block text-xs text-slate-400">{t("Output tax account", "حساب ضريبة المخرجات")}<select className={`${input} mt-1`} value={taxAcc} onChange={e=>setTaxAcc(e.target.value)}><option value="">{t("Select tax account", "اختر حساب الضريبة")}</option>{postable.filter(a=>a.type==="liability").map(a=><option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}</select></label>}
      <div className="flex justify-end gap-2"><button className={`${btn} bg-slate-800 text-slate-300`} onClick={()=>setConvertRow(null)}>{t("Cancel", "إلغاء")}</button><button disabled={saving} className={`${btn} bg-emerald-600 text-white`} onClick={()=>void convert()}>{saving?t("Converting…", "جارٍ التحويل…"):t("Create invoice and post entry", "إنشاء الفاتورة وترحيل القيد")}</button></div>
      <p className="mt-3 text-[11px] text-amber-300">{t("Conversion creates an invoice and posts a journal entry. There is no atomic SQL transaction yet; do not retry if a message says the invoice was created but updating the quotation failed, before reviewing the invoice.", "التحويل ينشئ فاتورة ويرحّل قيدًا محاسبيًا. لا توجد معاملة SQL ذرّية حتى الآن؛ لا تعاود المحاولة إذا ظهرت رسالة تفيد بإنشاء الفاتورة مع فشل تحديث العرض قبل مراجعة الفاتورة.")}</p>
    </div></div>}
    <PartyQuickEditor open={partyEditorOpen} onClose={()=>setPartyEditorOpen(false)} orgId={org.id} branchId={branchId} type="customer" accounts={accounts} party={partyEditorRow} onSaved={async(saved)=>{setParties(await DB.fetchParties(org.id,"customer"));setPartyId(String(saved.id));setCustomerName("");}} />
  </div>;
}
