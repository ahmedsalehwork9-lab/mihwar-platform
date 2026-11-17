// =============================================================
// src/pages/accounting/AccountingPage.tsx
// وحدة المحاسبة — صفحة متكاملة بتبويبات:
// شجرة الحسابات · القيود اليومية · كشف حساب · ميزان المراجعة.
// الدفاتر على مستوى المؤسسة (من الفرع النشط)، مع تصفية بالفرع.
// =============================================================

import { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "../../context/AuthContext";
import * as DB from "../lib/accountingDb";
import type { GLAccount, GLLine, EntryWithLines, LedgerLine, AccType } from "../lib/accountingDb";

const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 });
const num = (v: any) => parseFloat(v) || 0;
const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => new Date().toISOString().slice(0, 8) + "01";
const dayBefore = (d: string) => { const [y, m, dd] = d.split("-").map(Number); const t = new Date(y, m - 1, dd - 1); const z = (n: number) => String(n).padStart(2, "0"); return `${t.getFullYear()}-${z(t.getMonth() + 1)}-${z(t.getDate())}`; };

type Tab = "chart" | "journal" | "ledger" | "trial";
const TYPE_OPTS: AccType[] = ["asset", "liability", "equity", "revenue", "expense"];

export default function AccountingPage() {
  const { ownedShopId, branches } = (useAuth() as any) ?? {};
  const [org, setOrg] = useState<{ id: number; name: string } | null>(null);
  const [orgLoading, setOrgLoading] = useState(true);
  const [accounts, setAccounts] = useState<GLAccount[]>([]);
  const [tab, setTab] = useState<Tab>("chart");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      setOrgLoading(true);
      const o = await DB.getOrgForBranch(ownedShopId ?? null);
      if (!active) return;
      setOrg(o);
      if (o) setAccounts(await DB.fetchAccounts(o.id));
      setOrgLoading(false);
    })();
    return () => { active = false; };
  }, [ownedShopId]);

  const reloadAccounts = useCallback(async () => { if (org) setAccounts(await DB.fetchAccounts(org.id)); }, [org]);

  const postable = useMemo(() => accounts.filter((a) => !a.is_group).sort((a, b) => a.code.localeCompare(b.code)), [accounts]);
  const accById = useMemo(() => new Map(accounts.map((a) => [a.id, a] as const)), [accounts]);
  const branchName = (id: number | null | undefined) => (id == null ? "" : (branches || []).find((b: any) => b.id === id)?.name || ("فرع " + id));

  if (orgLoading) return <div className="p-10 text-center text-slate-500 text-sm">جارٍ التحميل…</div>;
  if (!org) return (
    <div className="p-4 lg:p-6" dir="rtl">
      <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-8 text-center max-w-lg mx-auto">
        <h2 className="text-amber-400 font-bold text-lg mb-2">الحسابات على مستوى المؤسسة</h2>
        <p className="text-slate-400 text-sm">الفرع الحالي غير مرتبط بمؤسسة. اربط الفرع بمؤسسة من صفحة المجموعات/المحلات أولًا لتفعيل الدفاتر.</p>
      </div>
    </div>
  );

  return (
    <div className="p-4 lg:p-6 min-h-screen" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-xl">📒</span>
            الحسابات
          </h1>
          <p className="text-slate-500 text-sm mt-1">الدفاتر المحاسبية — {org.name}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-2">
          <div className="text-[10px] text-slate-500 font-bold">المؤسسة</div>
          <div className="text-sm font-bold text-white">{org.name}</div>
        </div>
      </div>

      <div className="inline-flex flex-wrap gap-1 bg-slate-900 border border-slate-800 rounded-2xl p-1 mb-5">
        {([["chart", "🌳 شجرة الحسابات"], ["journal", "📝 القيود اليومية"], ["ledger", "📄 كشف حساب"], ["trial", "⚖️ ميزان المراجعة"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-4 py-2.5 rounded-xl font-bold text-sm transition-all ${tab === k ? "bg-blue-600 text-white" : "text-slate-400 hover:text-slate-200"}`}>{label}</button>
        ))}
      </div>

      {tab === "chart" && <ChartTab org={org} accounts={accounts} reload={reloadAccounts} busy={busy} setBusy={setBusy} />}
      {tab === "journal" && <JournalTab org={org} postable={postable} accById={accById} branches={branches} branchName={branchName} />}
      {tab === "ledger" && <LedgerTab org={org} postable={postable} branches={branches} branchName={branchName} />}
      {tab === "trial" && <TrialTab org={org} accById={accById} postable={postable} branches={branches} />}
    </div>
  );
}

// ══════════════ شجرة الحسابات ══════════════
function ChartTab({ org, accounts, reload, busy, setBusy }: { org: { id: number; name: string }; accounts: GLAccount[]; reload: () => Promise<void>; busy: boolean; setBusy: (b: boolean) => void }) {
  const [edit, setEdit] = useState<Partial<GLAccount> | null>(null);
  const groups = useMemo(() => accounts.filter((a) => a.is_group), [accounts]);
  const childrenOf = useMemo(() => {
    const m = new Map<number | null, GLAccount[]>();
    accounts.forEach((a) => { const k = a.parent_id ?? null; if (!m.has(k)) m.set(k, []); m.get(k)!.push(a); });
    m.forEach((arr) => arr.sort((a, b) => a.code.localeCompare(b.code)));
    return m;
  }, [accounts]);

  const seed = async () => {
    if (!window.confirm("تهيئة شجرة الحسابات السعودية القياسية لهذه المؤسسة؟")) return;
    setBusy(true);
    const r = await DB.seedStandardChart(org.id);
    setBusy(false);
    if (!r.ok) { alert("تعذّرت التهيئة: " + (r.error || "")); return; }
    await reload();
    alert(`✓ تم إضافة ${r.added} حساب`);
  };

  const saveAcc = async () => {
    if (!edit) return;
    if (!edit.code || !edit.code.trim()) { alert("أدخل كود الحساب"); return; }
    if (!edit.name || !edit.name.trim()) { alert("أدخل اسم الحساب"); return; }
    const payload: any = {
      organization_id: org.id, code: edit.code.trim(), name: edit.name.trim(),
      type: edit.type || "asset", is_group: !!edit.is_group, is_active: edit.is_active !== false,
      parent_id: edit.parent_id ?? null,
    };
    if (edit.id) payload.id = edit.id;
    setBusy(true);
    const r = await DB.upsertAccount(payload);
    setBusy(false);
    if (!r.ok) { alert("تعذّر الحفظ: " + (r.error || "")); return; }
    setEdit(null);
    await reload();
  };

  const del = async (a: GLAccount) => {
    if (!window.confirm(`حذف الحساب «${a.code} - ${a.name}»؟`)) return;
    const r = await DB.deleteAccount(a.id);
    if (!r.ok) { alert("تعذّر الحذف (قد يحتوي على حسابات فرعية أو حركات): " + (r.error || "")); return; }
    await reload();
  };

  const renderNode = (a: GLAccount, depth: number): any => {
    const kids = childrenOf.get(a.id) || [];
    return (
      <div key={a.id}>
        <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-800 hover:bg-white/[0.02]" style={{ paddingRight: 12 + depth * 20 }}>
          <span className={`font-mono text-xs ${a.is_group ? "text-blue-300 font-bold" : "text-slate-400"}`} style={{ direction: "ltr" }}>{a.code}</span>
          <span className={`text-sm ${a.is_group ? "text-white font-bold" : "text-slate-200"}`}>{a.name}</span>
          <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${a.is_group ? "bg-blue-500/15 text-blue-300" : "bg-slate-700/40 text-slate-400"}`}>{a.is_group ? "تجميعي" : DB.TYPE_LABEL[a.type]}</span>
          {!a.is_active && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400">موقوف</span>}
          <div className="mr-auto flex items-center gap-1">
            <button onClick={() => setEdit({ parent_id: a.id, type: a.type, is_group: false, is_active: true })} title="إضافة حساب فرعي" className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 text-xs">＋</button>
            <button onClick={() => setEdit({ ...a })} title="تعديل" className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-300 text-xs">✏️</button>
            <button onClick={() => del(a)} title="حذف" className="w-7 h-7 rounded-lg bg-red-500/10 text-red-400 text-xs">✕</button>
          </div>
        </div>
        {kids.map((k) => renderNode(k, depth + 1))}
      </div>
    );
  };

  const roots = (childrenOf.get(null) || []);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button onClick={() => setEdit({ type: "asset", is_group: false, is_active: true, parent_id: null })} className="px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold text-xs">＋ حساب جديد</button>
        {accounts.length === 0 && <button onClick={seed} disabled={busy} className="px-4 py-2.5 rounded-xl bg-blue-600 text-white font-bold text-xs disabled:opacity-50">{busy ? "جارٍ…" : "🌳 تهيئة الشجرة السعودية القياسية"}</button>}
        <span className="text-[11px] text-slate-500 mr-auto">{accounts.length} حساب</span>
      </div>

      {accounts.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center text-slate-500 text-sm">لا توجد حسابات بعد. ابدأ بزر «تهيئة الشجرة السعودية القياسية» ثم عدّلها كما تريد.</div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">{roots.map((r) => renderNode(r, 0))}</div>
      )}

      {edit && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" dir="rtl">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-5">
            <h3 className="text-white font-bold text-base mb-4">{edit.id ? "تعديل حساب" : "حساب جديد"}</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-[10px] text-slate-500 font-bold">الكود</label><input value={edit.code || ""} onChange={(e) => setEdit({ ...edit, code: e.target.value })} className="w-full bg-slate-950 border border-slate-700 rounded-xl text-white px-3 py-2 text-sm [direction:ltr]" /></div>
                <div><label className="text-[10px] text-slate-500 font-bold">النوع</label><select value={edit.type || "asset"} onChange={(e) => setEdit({ ...edit, type: e.target.value as AccType })} className="w-full bg-slate-950 border border-slate-700 rounded-xl text-white px-3 py-2 text-sm">{TYPE_OPTS.map((t) => <option key={t} value={t}>{DB.TYPE_LABEL[t]}</option>)}</select></div>
              </div>
              <div><label className="text-[10px] text-slate-500 font-bold">اسم الحساب</label><input value={edit.name || ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} className="w-full bg-slate-950 border border-slate-700 rounded-xl text-white px-3 py-2 text-sm" /></div>
              <div><label className="text-[10px] text-slate-500 font-bold">الحساب الأب</label><select value={edit.parent_id ?? ""} onChange={(e) => setEdit({ ...edit, parent_id: e.target.value ? Number(e.target.value) : null })} className="w-full bg-slate-950 border border-slate-700 rounded-xl text-white px-3 py-2 text-sm"><option value="">— رئيسي (بدون أب)</option>{groups.filter((g) => g.id !== edit.id).map((g) => <option key={g.id} value={g.id}>{g.code} - {g.name}</option>)}</select></div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={!!edit.is_group} onChange={(e) => setEdit({ ...edit, is_group: e.target.checked })} className="w-4 h-4 accent-blue-500" /> حساب تجميعي (غير قابل للترحيل)</label>
                <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={edit.is_active !== false} onChange={(e) => setEdit({ ...edit, is_active: e.target.checked })} className="w-4 h-4 accent-blue-500" /> نشط</label>
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-5">
              <button onClick={() => setEdit(null)} className="px-5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 font-bold text-sm">إلغاء</button>
              <button onClick={saveAcc} disabled={busy} className="px-6 py-2.5 rounded-xl bg-emerald-500 text-emerald-950 font-extrabold text-sm disabled:opacity-50">{busy ? "جارٍ…" : "حفظ"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════ القيود اليومية ══════════════
type DraftLine = { account_id: number | ""; debit: string; credit: string; note: string };
const emptyLine = (): DraftLine => ({ account_id: "", debit: "", credit: "", note: "" });

function JournalTab({ org, postable, accById, branches, branchName }: any) {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [fBranch, setFBranch] = useState<string>("");
  const [entries, setEntries] = useState<EntryWithLines[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const [date, setDate] = useState(today());
  const [desc, setDesc] = useState("");
  const [eBranch, setEBranch] = useState<string>("");
  const [lines, setLines] = useState<DraftLine[]>([emptyLine(), emptyLine()]);

  const reload = useCallback(async () => {
    setEntries(await DB.fetchEntries(org.id, from, to, fBranch ? Number(fBranch) : null));
  }, [org.id, from, to, fBranch]);
  useEffect(() => { reload(); }, [reload]);

  const sumD = lines.reduce((s, l) => s + num(l.debit), 0);
  const sumC = lines.reduce((s, l) => s + num(l.credit), 0);
  const balanced = Math.abs(sumD - sumC) < 0.005 && sumD > 0;
  const setLine = (i: number, patch: Partial<DraftLine>) => setLines((p) => p.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const save = async () => {
    const valid = lines.filter((l) => l.account_id && (num(l.debit) || num(l.credit)));
    if (valid.length < 2) { alert("أضف سطرين على الأقل بحساب ومبلغ"); return; }
    if (!balanced) { alert("القيد غير متوازن: مجموع المدين يجب أن يساوي مجموع الدائن"); return; }
    setSaving(true);
    const r = await DB.createEntry(org.id, date, desc, eBranch ? Number(eBranch) : null,
      valid.map((l) => ({ account_id: Number(l.account_id), debit: num(l.debit), credit: num(l.credit), note: l.note || null })));
    setSaving(false);
    if (!r.ok) { alert("تعذّر حفظ القيد: " + (r.error || "")); return; }
    setShowForm(false); setDesc(""); setLines([emptyLine(), emptyLine()]); setEBranch("");
    await reload();
    alert("✓ تم حفظ القيد");
  };

  const del = async (id: number) => {
    if (!window.confirm("حذف هذا القيد؟")) return;
    const r = await DB.deleteEntry(id);
    if (r.ok) await reload(); else alert("تعذّر الحذف: " + (r.error || ""));
  };

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div className="flex flex-col gap-1"><label className="text-[10px] text-slate-500 font-bold">من</label><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-xl text-white px-3 py-2 text-sm [color-scheme:dark]" /></div>
        <div className="flex flex-col gap-1"><label className="text-[10px] text-slate-500 font-bold">إلى</label><input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-xl text-white px-3 py-2 text-sm [color-scheme:dark]" /></div>
        {branches && branches.length > 1 && (
          <div className="flex flex-col gap-1"><label className="text-[10px] text-slate-500 font-bold">الفرع</label><select value={fBranch} onChange={(e) => setFBranch(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-xl text-white px-3 py-2 text-sm"><option value="">كل الفروع</option>{branches.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
        )}
        <button onClick={() => setShowForm((v) => !v)} className="mr-auto px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold text-xs">{showForm ? "✕ إغلاق النموذج" : "＋ قيد جديد"}</button>
      </div>

      {showForm && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 mb-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-3">
            <div className="flex flex-col gap-1"><label className="text-[10px] text-slate-500 font-bold">التاريخ</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="bg-slate-950 border border-slate-700 rounded-xl text-white px-3 py-2 text-sm [color-scheme:dark]" /></div>
            <div className="flex flex-col gap-1 lg:col-span-1"><label className="text-[10px] text-slate-500 font-bold">البيان</label><input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="وصف القيد" className="bg-slate-950 border border-slate-700 rounded-xl text-white px-3 py-2 text-sm" /></div>
            {branches && branches.length > 1 && (
              <div className="flex flex-col gap-1"><label className="text-[10px] text-slate-500 font-bold">مركز التكلفة (فرع)</label><select value={eBranch} onChange={(e) => setEBranch(e.target.value)} className="bg-slate-950 border border-slate-700 rounded-xl text-white px-3 py-2 text-sm"><option value="">— بدون</option>{branches.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 620 }}>
              <thead><tr className="bg-slate-950">{["الحساب", "مدين", "دائن", "ملاحظة", ""].map((h) => <th key={h} className="text-right text-[10px] font-bold text-slate-500 uppercase px-2 py-2">{h}</th>)}</tr></thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i} className="border-t border-slate-800">
                    <td className="px-2 py-1.5"><select value={l.account_id} onChange={(e) => setLine(i, { account_id: e.target.value ? Number(e.target.value) : "" })} className="w-full min-w-[180px] bg-slate-950 border border-slate-700 rounded-lg text-white px-2 py-1.5 text-xs"><option value="">— اختر حساب</option>{postable.map((a: GLAccount) => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}</select></td>
                    <td className="px-2 py-1.5"><input type="number" step="0.01" value={l.debit} onChange={(e) => setLine(i, { debit: e.target.value, credit: e.target.value ? "" : l.credit })} placeholder="0" className="w-28 bg-slate-950 border border-slate-700 rounded-lg text-white px-2 py-1.5 text-center font-mono text-xs [direction:ltr]" /></td>
                    <td className="px-2 py-1.5"><input type="number" step="0.01" value={l.credit} onChange={(e) => setLine(i, { credit: e.target.value, debit: e.target.value ? "" : l.debit })} placeholder="0" className="w-28 bg-slate-950 border border-slate-700 rounded-lg text-white px-2 py-1.5 text-center font-mono text-xs [direction:ltr]" /></td>
                    <td className="px-2 py-1.5"><input value={l.note} onChange={(e) => setLine(i, { note: e.target.value })} placeholder="—" className="w-full min-w-[120px] bg-slate-950 border border-slate-700 rounded-lg text-white px-2 py-1.5 text-xs" /></td>
                    <td className="px-2 py-1.5 text-center"><button onClick={() => setLines((p) => (p.length > 2 ? p.filter((_, idx) => idx !== i) : p))} className="w-7 h-7 rounded-lg bg-red-500/10 text-red-400">✕</button></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-950 font-bold">
                  <td className="px-2 py-2 text-right text-xs text-slate-300">الإجمالي</td>
                  <td className={`px-2 py-2 text-center font-mono text-xs [direction:ltr] ${balanced ? "text-emerald-400" : "text-amber-400"}`}>{fmt(sumD)}</td>
                  <td className={`px-2 py-2 text-center font-mono text-xs [direction:ltr] ${balanced ? "text-emerald-400" : "text-amber-400"}`}>{fmt(sumC)}</td>
                  <td colSpan={2} className={`px-2 py-2 text-xs ${balanced ? "text-emerald-400" : "text-amber-400"}`}>{balanced ? "✓ متوازن" : `الفرق: ${fmt(sumD - sumC)}`}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <button onClick={() => setLines((p) => [...p, emptyLine()])} className="px-3 py-2 rounded-lg bg-blue-600/10 border border-dashed border-blue-500 text-blue-300 font-bold text-xs">＋ سطر</button>
            <button onClick={save} disabled={saving || !balanced} className={`mr-auto px-6 py-2.5 rounded-xl font-extrabold text-sm ${balanced && !saving ? "bg-emerald-500 text-emerald-950" : "bg-emerald-500/40 text-emerald-100"}`}>{saving ? "جارٍ…" : "💾 حفظ القيد"}</button>
          </div>
        </div>
      )}

      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2"><span className="w-1 h-4 rounded bg-blue-500" /><h2 className="text-sm font-bold text-white">دفتر اليومية</h2><span className="text-[11px] text-slate-500 mr-auto">{entries.length} قيد</span></div>
        {entries.length === 0 ? (
          <div className="p-10 text-center text-slate-500 text-sm">لا توجد قيود ضمن هذه الفترة.</div>
        ) : (
          <div className="divide-y divide-slate-800">
            {entries.map((e) => {
              const d = (e.lines || []).reduce((s, l) => s + Number(l.debit || 0), 0);
              return (
                <div key={e.id} className="p-3">
                  <div className="flex items-center gap-3 flex-wrap mb-2">
                    <span className="font-mono text-xs font-bold text-blue-300 [direction:ltr]">#{e.entry_year}/{String(e.entry_no).padStart(4, "0")}</span>
                    <span className="font-mono text-xs text-slate-400 [direction:ltr]">{e.date}</span>
                    <span className="text-sm text-slate-200">{e.description || "—"}</span>
                    {e.branch_id != null && <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-700/40 text-slate-300">{branchName(e.branch_id)}</span>}
                    <span className="mr-auto font-mono text-xs font-bold text-emerald-400 [direction:ltr]">{fmt(d)} ر.س</span>
                    <button onClick={() => del(e.id)} className="w-7 h-7 rounded-lg bg-red-500/10 text-red-400 text-xs">✕</button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse" style={{ minWidth: 480 }}>
                      <tbody>
                        {(e.lines || []).map((l, i) => { const a = accById.get(l.account_id); return (
                          <tr key={i} className="text-xs">
                            <td className="px-2 py-1 text-slate-400 font-mono [direction:ltr] w-16">{a?.code}</td>
                            <td className="px-2 py-1 text-slate-200">{a?.name || l.account_id}{l.note ? <span className="text-slate-500"> — {l.note}</span> : null}</td>
                            <td className="px-2 py-1 text-center font-mono text-slate-300 [direction:ltr] w-24">{Number(l.debit) ? fmt(Number(l.debit)) : ""}</td>
                            <td className="px-2 py-1 text-center font-mono text-slate-300 [direction:ltr] w-24">{Number(l.credit) ? fmt(Number(l.credit)) : ""}</td>
                          </tr>
                        ); })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════ كشف حساب ══════════════
function LedgerTab({ org, postable, branches, branchName }: any) {
  const [accId, setAccId] = useState<string>("");
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [fBranch, setFBranch] = useState<string>("");
  const [rows, setRows] = useState<LedgerLine[]>([]);
  const [opening, setOpening] = useState(0);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    if (!accId) { alert("اختر الحساب"); return; }
    setLoading(true);
    const br = fBranch ? Number(fBranch) : null;
    const before = await DB.fetchLedger(org.id, Number(accId), "2000-01-01", dayBefore(from), br);
    const ob = before.reduce((s, r) => s + r.debit - r.credit, 0);
    const period = await DB.fetchLedger(org.id, Number(accId), from, to, br);
    setOpening(ob); setRows(period); setLoading(false);
  };

  let running = opening;
  const acc = postable.find((a: GLAccount) => a.id === Number(accId));

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div className="flex flex-col gap-1"><label className="text-[10px] text-slate-500 font-bold">الحساب</label><select value={accId} onChange={(e) => setAccId(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-xl text-white px-3 py-2 text-sm min-w-[200px]"><option value="">— اختر حساب</option>{postable.map((a: GLAccount) => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}</select></div>
        <div className="flex flex-col gap-1"><label className="text-[10px] text-slate-500 font-bold">من</label><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-xl text-white px-3 py-2 text-sm [color-scheme:dark]" /></div>
        <div className="flex flex-col gap-1"><label className="text-[10px] text-slate-500 font-bold">إلى</label><input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-xl text-white px-3 py-2 text-sm [color-scheme:dark]" /></div>
        {branches && branches.length > 1 && (
          <div className="flex flex-col gap-1"><label className="text-[10px] text-slate-500 font-bold">الفرع</label><select value={fBranch} onChange={(e) => setFBranch(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-xl text-white px-3 py-2 text-sm"><option value="">كل الفروع</option>{branches.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
        )}
        <button onClick={run} disabled={loading} className="px-5 py-2.5 rounded-xl bg-blue-600 text-white font-bold text-xs disabled:opacity-50">{loading ? "جارٍ…" : "عرض الكشف"}</button>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2"><span className="w-1 h-4 rounded bg-blue-500" /><h2 className="text-sm font-bold text-white">كشف حساب{acc ? ` — ${acc.code} ${acc.name}` : ""}</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse" style={{ minWidth: 640 }}>
            <thead><tr>{["التاريخ", "القيد", "البيان", "مدين", "دائن", "الرصيد"].map((h) => <th key={h} className="text-[10px] px-2 py-2.5 bg-slate-950 text-slate-500 uppercase whitespace-nowrap border-b border-slate-700">{h}</th>)}</tr></thead>
            <tbody>
              <tr className="bg-slate-950/40"><td colSpan={5} className="px-2 py-2 text-xs text-right text-slate-400 border-b border-slate-800">رصيد افتتاحي</td><td className="px-2 py-2 text-center font-mono text-xs font-bold text-slate-200 [direction:ltr] border-b border-slate-800">{fmt(opening)}</td></tr>
              {rows.map((r, i) => { running += r.debit - r.credit; return (
                <tr key={i} className="hover:bg-white/[0.02]">
                  <td className="px-2 py-2 text-xs text-center font-mono text-slate-400 [direction:ltr] border-b border-slate-800">{r.date}</td>
                  <td className="px-2 py-2 text-xs text-center font-mono text-blue-300 [direction:ltr] border-b border-slate-800">{String(r.entry_no).padStart(4, "0")}</td>
                  <td className="px-2 py-2 text-xs text-right text-slate-300 border-b border-slate-800">{r.description || "—"}{r.note ? <span className="text-slate-500"> · {r.note}</span> : null}</td>
                  <td className="px-2 py-2 text-xs text-center font-mono text-emerald-400 [direction:ltr] border-b border-slate-800">{r.debit ? fmt(r.debit) : ""}</td>
                  <td className="px-2 py-2 text-xs text-center font-mono text-amber-400 [direction:ltr] border-b border-slate-800">{r.credit ? fmt(r.credit) : ""}</td>
                  <td className="px-2 py-2 text-xs text-center font-mono font-bold text-white [direction:ltr] border-b border-slate-800">{fmt(running)}</td>
                </tr>
              ); })}
              {rows.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-slate-500 text-sm">اختر حسابًا واضغط «عرض الكشف».</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ══════════════ ميزان المراجعة ══════════════
function TrialTab({ org, accById, postable, branches }: any) {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [fBranch, setFBranch] = useState<string>("");
  const [rows, setRows] = useState<{ id: number; code: string; name: string; debit: number; credit: number }[]>([]);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    const entries = await DB.fetchEntries(org.id, from, to, fBranch ? Number(fBranch) : null);
    const agg = new Map<number, { debit: number; credit: number }>();
    entries.forEach((e: EntryWithLines) => (e.lines || []).forEach((l) => {
      if (fBranch && l.branch_id != null && Number(l.branch_id) !== Number(fBranch)) return;
      const g = agg.get(l.account_id) || { debit: 0, credit: 0 };
      g.debit += Number(l.debit) || 0; g.credit += Number(l.credit) || 0;
      agg.set(l.account_id, g);
    }));
    const out: any[] = [];
    agg.forEach((v, id) => { const a = accById.get(id); if (a && (v.debit || v.credit)) out.push({ id, code: a.code, name: a.name, debit: v.debit, credit: v.credit }); });
    out.sort((a, b) => a.code.localeCompare(b.code));
    setRows(out); setLoading(false);
  };

  const totD = rows.reduce((s, r) => s + r.debit, 0);
  const totC = rows.reduce((s, r) => s + r.credit, 0);

  const exportExcel = () => {
    const head = ["الكود", "الحساب", "مدين", "دائن", "الرصيد"];
    const body = rows.map((r) => [r.code, r.name, fmt(r.debit), fmt(r.credit), fmt(r.debit - r.credit)]);
    const rowsHtml = body.map((c) => `<tr>${c.map((v, i) => `<td style="border:1px solid #e5e7eb;padding:5px 8px;font-size:11px;text-align:${i === 1 ? "right" : "center"};">${v}</td>`).join("")}</tr>`).join("");
    const html = `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"></head><body dir="rtl"><h3>ميزان المراجعة — ${org.name} — ${from} إلى ${to}</h3><table style="border-collapse:collapse"><tr>${head.map((h) => `<th style="border:1px solid #d1d5db;padding:6px 8px;background:#14304d;color:#fff;font-size:11px;">${h}</th>`).join("")}</tr>${rowsHtml}<tr><td colspan="2" style="border:1px solid #cbd5e1;padding:6px;font-weight:800;text-align:right;">الإجمالي</td><td style="border:1px solid #cbd5e1;padding:6px;text-align:center;font-weight:800;">${fmt(totD)}</td><td style="border:1px solid #cbd5e1;padding:6px;text-align:center;font-weight:800;">${fmt(totC)}</td><td></td></tr></table></body></html>`;
    const blob = new Blob(["﻿" + html], { type: "application/vnd.ms-excel;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `ميزان_المراجعة_${from}_${to}.xls`; a.click(); URL.revokeObjectURL(a.href);
  };

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div className="flex flex-col gap-1"><label className="text-[10px] text-slate-500 font-bold">من</label><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-xl text-white px-3 py-2 text-sm [color-scheme:dark]" /></div>
        <div className="flex flex-col gap-1"><label className="text-[10px] text-slate-500 font-bold">إلى</label><input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-xl text-white px-3 py-2 text-sm [color-scheme:dark]" /></div>
        {branches && branches.length > 1 && (
          <div className="flex flex-col gap-1"><label className="text-[10px] text-slate-500 font-bold">الفرع</label><select value={fBranch} onChange={(e) => setFBranch(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-xl text-white px-3 py-2 text-sm"><option value="">كل الفروع</option>{branches.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
        )}
        <button onClick={run} disabled={loading} className="px-5 py-2.5 rounded-xl bg-blue-600 text-white font-bold text-xs disabled:opacity-50">{loading ? "جارٍ…" : "عرض الميزان"}</button>
        <button onClick={exportExcel} disabled={!rows.length} className="px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold text-xs disabled:opacity-40">⬇ Excel</button>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2"><span className="w-1 h-4 rounded bg-blue-500" /><h2 className="text-sm font-bold text-white">ميزان المراجعة</h2><span className={`text-[11px] font-bold mr-auto ${Math.abs(totD - totC) < 0.01 ? "text-emerald-400" : "text-amber-400"}`}>{Math.abs(totD - totC) < 0.01 ? "✓ متوازن" : `فرق: ${fmt(totD - totC)}`}</span></div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse" style={{ minWidth: 560 }}>
            <thead><tr>{["الكود", "الحساب", "مدين", "دائن", "الرصيد"].map((h) => <th key={h} className="text-[10px] px-2 py-2.5 bg-slate-950 text-slate-500 uppercase whitespace-nowrap border-b border-slate-700">{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((r) => { const bal = r.debit - r.credit; return (
                <tr key={r.id} className="hover:bg-white/[0.02]">
                  <td className="px-2 py-2 text-xs text-center font-mono text-slate-400 [direction:ltr] border-b border-slate-800">{r.code}</td>
                  <td className="px-2 py-2 text-xs text-right text-slate-200 border-b border-slate-800">{r.name}</td>
                  <td className="px-2 py-2 text-xs text-center font-mono text-emerald-400 [direction:ltr] border-b border-slate-800">{r.debit ? fmt(r.debit) : "—"}</td>
                  <td className="px-2 py-2 text-xs text-center font-mono text-amber-400 [direction:ltr] border-b border-slate-800">{r.credit ? fmt(r.credit) : "—"}</td>
                  <td className={`px-2 py-2 text-xs text-center font-mono font-bold [direction:ltr] border-b border-slate-800 ${bal >= 0 ? "text-emerald-300" : "text-red-300"}`}>{fmt(bal)}</td>
                </tr>
              ); })}
              {rows.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-slate-500 text-sm">اضغط «عرض الميزان» لعرض أرصدة الحسابات ضمن الفترة.</td></tr>}
            </tbody>
            {rows.length > 0 && (
              <tfoot><tr className="bg-slate-950 font-bold">
                <td colSpan={2} className="px-2 py-2.5 text-xs text-right text-slate-200 border-t border-slate-600">الإجمالي</td>
                <td className="px-2 py-2.5 text-xs text-center font-mono text-emerald-400 [direction:ltr] border-t border-slate-600">{fmt(totD)}</td>
                <td className="px-2 py-2.5 text-xs text-center font-mono text-amber-400 [direction:ltr] border-t border-slate-600">{fmt(totC)}</td>
                <td className="border-t border-slate-600" />
              </tr></tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
