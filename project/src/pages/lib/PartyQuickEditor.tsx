import { useEffect, useMemo, useState } from "react";
import * as DB from "./accountingDb";
import type { GLAccount, GLParty, PartyType } from "./accountingDb";

type Props = { open: boolean; onClose: () => void; orgId: number; branchId: number | null; type: PartyType; accounts: GLAccount[]; party?: GLParty | null; onSaved: (party: GLParty) => void };
const input = "w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-blue-500";

export default function PartyQuickEditor({ open, onClose, orgId, branchId, type, accounts, party, onSaved }: Props) {
  const expected = type === "customer" ? "asset" : "liability";
  const parentCode = type === "customer" ? "1103" : "2101";
  const parentLabel = type === "customer" ? "العملاء (مدينون)" : "الموردون (دائنون)";
  const parentAccount = useMemo(
    () => accounts.find(a => a.code === parentCode && a.type === expected && a.is_active && !a.is_group)
      || accounts.find(a => a.type === expected && a.is_active && !a.is_group && (type === "customer" ? /العملاء|مدينون/.test(a.name) : /الموردون|دائنون/.test(a.name))),
    [accounts, parentCode, expected, type]
  );
  const [name,setName]=useState("");
  const [phone,setPhone]=useState("");
  const [address,setAddress]=useState("");
  const [taxNumber,setTaxNumber]=useState("");
  const [creditDays,setCreditDays]=useState("0");
  const [notes,setNotes]=useState("");
  const [active,setActive]=useState(true);
  const [busy,setBusy]=useState(false);

  useEffect(()=>{
    if(!open)return;
    setName(party?.name||"");
    setPhone(party?.phone||"");
    setAddress(party?.address||"");
    setTaxNumber(party?.tax_number||"");
    setCreditDays(String(party?.credit_days??0));
    setNotes(party?.notes||"");
    setActive(party?.is_active!==false);
  },[open,party]);

  if(!open)return null;
  const save=async()=>{
    if(!name.trim()){alert("أدخل اسم الطرف.");return;}
    if(!parentAccount){alert(`تعذر العثور على حساب الأب «${parentLabel}» في دليل الحسابات. راجع دليل الحسابات أولًا.`);return;}
    setBusy(true);
    const payload:Partial<GLParty>={
      organization_id:orgId, branch_id:party?.branch_id??branchId, type,
      name:name.trim(), account_id:parentAccount.id,
      credit_days:Math.max(0,Number(creditDays)||0),
      phone:phone.trim()||null, address:address.trim()||null, tax_number:taxNumber.trim()||null,
      parent_id:party?.parent_id??null, notes:notes.trim()||null, is_active:active
    };
    if(party?.id)payload.id=party.id;
    const r=await DB.upsertParty(payload);
    if(!r.ok){setBusy(false);alert("تعذر حفظ الطرف: "+(r.error||""));return;}
    const all=await DB.fetchParties(orgId);
    const saved=all.find(x=>x.id===party?.id)||all.find(x=>x.type===type&&x.name===name.trim()&&x.account_id===parentAccount.id);
    setBusy(false);
    if(!saved){alert("تم الحفظ، لكن تعذر استرجاع الطرف. أغلق النافذة ثم حدّث القائمة.");onClose();return;}
    onSaved(saved);onClose();
  };
  return <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/75 p-3" dir="rtl">
    <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
      <div className="mb-4 flex items-center justify-between"><h3 className="text-base font-black text-white">{party?"تحرير":"إنشاء"} {type==="customer"?"عميل":"مورد"}</h3><button onClick={onClose} className="rounded-lg bg-slate-800 p-2 text-slate-300"><span aria-hidden="true">×</span></button></div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-xs text-slate-400 sm:col-span-2">اسم {type==="customer"?"العميل":"المورد"} *<input required className={`${input} mt-1`} value={name} onChange={e=>setName(e.target.value)} /></label>
        <label className="text-xs text-slate-400">رقم الهاتف<input className={`${input} mt-1`} value={phone} onChange={e=>setPhone(e.target.value)} /></label>
        <label className="text-xs text-slate-400">مدة السداد (أيام)<input className={`${input} mt-1`} type="number" min="0" value={creditDays} onChange={e=>setCreditDays(e.target.value)} /></label>
        <label className="text-xs text-slate-400 sm:col-span-2">العنوان<input className={`${input} mt-1`} value={address} onChange={e=>setAddress(e.target.value)} placeholder="المدينة، الحي، الشارع..." /></label>
        <label className="text-xs text-slate-400 sm:col-span-2">الرقم الضريبي<input className={`${input} mt-1`} value={taxNumber} onChange={e=>setTaxNumber(e.target.value)} placeholder="الرقم الضريبي / VAT" /></label>
        <div className="sm:col-span-2"><label className="text-xs text-slate-400">حساب الأب في دليل الحسابات *</label><div className={`${input} mt-1 flex items-center justify-between`}><span>{parentAccount?`${parentAccount.code} — ${parentAccount.name}`:`غير موجود: ${parentLabel}`}</span><span className="text-emerald-400 text-[10px]">إلزامي</span></div><span className="mt-1 block text-[10px] text-slate-500">يرتبط {type==="customer"?"العميل":"المورد"} تلقائيًا بحساب الأب «{parentLabel}».</span></div>
        <label className="text-xs text-slate-400 sm:col-span-2">ملاحظات<textarea className={`${input} mt-1`} rows={2} value={notes} onChange={e=>setNotes(e.target.value)} /></label>
        <label className="flex items-center gap-2 text-xs text-slate-300 sm:col-span-2"><input type="checkbox" checked={active} onChange={e=>setActive(e.target.checked)} className="accent-blue-500"/> نشط</label>
      </div>
      <div className="mt-5 flex justify-end gap-2"><button onClick={onClose} className="rounded-xl bg-slate-800 px-4 py-2 text-xs font-bold text-slate-300">إلغاء</button><button disabled={busy||!parentAccount} onClick={()=>void save()} className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{busy?"جارٍ الحفظ…":"حفظ"}</button></div>
    </div>
  </div>;
}
