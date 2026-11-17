// =============================================================
// src/pages/accounting/AccountingPage.tsx
// وحدة المحاسبة — واجهة مُحسّنة (تعمل في الثيمين الفاتح والداكن):
//   دليل الحسابات · القيود اليومية · كشف حساب · ميزان المراجعة.
// الدفاتر على مستوى المؤسسة (من الفرع النشط)، مع مركز تكلفة بالفرع.
// عناصر جديدة: مسار تنقّل (breadcrumb) · بطاقة رقم القيد (JV) ·
//   نوع القيد · مركز تكلفة لكل سطر · حفظ كمسودة/ترحيل · ملاحظات عامة ·
//   فلاتر (نوع/حالة/بحث) · تعديل قيد.
// =============================================================

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import * as XLSX from "xlsx";
import {
  Home, ChevronLeft, Calculator, Network, BookOpen, FileText, Scale,
  Plus, Pencil, Trash2, Download, Upload, Save, X, Check, Search,
  Building2, FileCheck2, Send, Layers, Paperclip, ExternalLink,
  Wallet, Landmark, ArrowDownCircle, ArrowUpCircle,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import * as DB from "../lib/accountingDb";
import type { GLAccount, GLLine, EntryWithLines, LedgerLine, AccType } from "../lib/accountingDb";

const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 });
const num = (v: any) => parseFloat(v) || 0;
const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => new Date().toISOString().slice(0, 8) + "01";
const yearOf = (d: string) => Number((d || "").slice(0, 4)) || new Date().getFullYear();
const jvLabel = (year: number, no: number) => `JV-${year}-${String(no).padStart(4, "0")}`;
const dayBefore = (d: string) => { const [y, m, dd] = d.split("-").map(Number); const t = new Date(y, m - 1, dd - 1); const z = (n: number) => String(n).padStart(2, "0"); return `${t.getFullYear()}-${z(t.getMonth() + 1)}-${z(t.getDate())}`; };

// ── رموز تنسيق موحّدة (كلاسات قياسية يعيد theme.css تلوينها للثيمين) ──
const CARD = "bg-slate-900 border border-slate-800 rounded-2xl";
const INPUT = "w-full bg-slate-950 border border-slate-700 rounded-xl text-white px-3 py-2 text-sm outline-none focus:border-blue-500 transition-colors";
const SELECT = INPUT;
const DATE = INPUT + " [color-scheme:dark]";
const LABEL = "text-[10px] text-slate-500 font-bold mb-1 block";
const BTN_PRIMARY = "inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-[#fff] font-bold text-xs transition-colors disabled:opacity-50";
const BTN_SOFT = "inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 hover:text-white font-bold text-xs transition-colors disabled:opacity-50";
const BTN_SUCCESS = "inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-emerald-950 font-extrabold text-sm transition-colors disabled:opacity-50";
const BTN_GHOST_EM = "inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold text-xs transition-colors disabled:opacity-50 hover:bg-emerald-500/20";
const BTN_GHOST_BL = "inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-300 font-bold text-xs transition-colors disabled:opacity-50 hover:bg-blue-500/20";

type Tab = "chart" | "journal" | "ledger" | "trial" | "assets" | "treasury";
const TYPE_OPTS: AccType[] = ["asset", "liability", "equity", "revenue", "expense"];
const TABS: { k: Tab; label: string; icon: any }[] = [
  { k: "chart", label: "دليل الحسابات", icon: Network },
  { k: "journal", label: "القيود اليومية", icon: BookOpen },
  { k: "treasury", label: "الخزن والبنوك", icon: Wallet },
  { k: "ledger", label: "كشف حساب", icon: FileText },
  { k: "trial", label: "ميزان المراجعة", icon: Scale },
  { k: "assets", label: "الأصول", icon: Building2 },
];

function SectionHead({ icon: Icon, title, extra }: { icon: any; title: string; extra?: any }) {
  return (
    <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2.5">
      <span className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400"><Icon size={16} /></span>
      <h2 className="text-sm font-bold text-white">{title}</h2>
      {extra && <div className="mr-auto">{extra}</div>}
    </div>
  );
}

// منتقي حساب قابل للبحث (بالاسم أو رقم الحساب) — يحل محل select الطويل
function AccountPicker({ value, onChange, options, placeholder = "— اختر حساب", size = "sm" }: {
  value: number | ""; onChange: (v: number | "") => void; options: GLAccount[]; placeholder?: string; size?: "sm" | "md";
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const btnRef = useRef<HTMLButtonElement>(null);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const selected = options.find((a) => a.id === value);
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return options;
    return options.filter((a) => (a.code + " " + a.name).toLowerCase().includes(s));
  }, [q, options]);
  const openIt = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setRect({ top: r.bottom + 4, left: r.left, width: r.width });
    setQ(""); setOpen(true);
  };
  const pick = (id: number | "") => { onChange(id); setOpen(false); };
  const btnCls = size === "sm"
    ? "w-full min-w-[180px] bg-slate-950 border border-slate-700 rounded-lg text-white px-2 py-1.5 text-xs outline-none focus:border-blue-500"
    : "w-full bg-slate-950 border border-slate-700 rounded-xl text-white px-3 py-2 text-sm outline-none focus:border-blue-500";
  return (
    <>
      <button ref={btnRef} type="button" onClick={openIt} className={btnCls + " text-right flex items-center gap-1"}>
        <span className={`flex-1 truncate ${selected ? "" : "text-slate-500"}`}>{selected ? `${selected.code} - ${selected.name}` : placeholder}</span>
        <ChevronLeft size={12} className="text-slate-500 -rotate-90 shrink-0" />
      </button>
      {open && rect && (
        <div className="fixed inset-0 z-[95]" onClick={() => setOpen(false)}>
          <div className="absolute bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden" style={{ top: rect.top, left: rect.left, width: Math.max(rect.width, 240), maxWidth: "90vw" }} onClick={(e) => e.stopPropagation()} dir="rtl">
            <div className="flex items-center gap-2 px-2.5 py-2 border-b border-slate-800">
              <Search size={13} className="text-slate-500 shrink-0" />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (filtered[0]) pick(filtered[0].id); } else if (e.key === "Escape") setOpen(false); }} placeholder="ابحث بالاسم أو الرقم…" className="flex-1 bg-transparent text-white text-xs outline-none placeholder:text-slate-600" />
            </div>
            <div className="max-h-60 overflow-y-auto py-1">
              {placeholder && <button type="button" onClick={() => pick("")} className="w-full text-right px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-800/60">{placeholder}</button>}
              {filtered.length === 0 ? <div className="px-3 py-3 text-center text-slate-500 text-xs">لا نتائج</div> : (
                filtered.map((a) => (
                  <button key={a.id} type="button" onClick={() => pick(a.id)} className={`w-full flex items-center gap-2 px-3 py-1.5 text-right text-xs hover:bg-slate-800/60 ${a.id === value ? "bg-blue-500/10" : ""}`}>
                    <span className="font-mono text-slate-400 [direction:ltr] shrink-0">{a.code}</span>
                    <span className="flex-1 text-slate-200 truncate">{a.name}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function AccountingPage({ section, onSection }: { section?: string; onSection?: (s: string) => void } = {}) {
  const { ownedShopId, branches } = (useAuth() as any) ?? {};
  const [org, setOrg] = useState<{ id: number; name: string } | null>(null);
  const [orgLoading, setOrgLoading] = useState(true);
  const [accounts, setAccounts] = useState<GLAccount[]>([]);
  const [internalTab, setInternalTab] = useState<Tab>("journal");
  const tab: Tab = (section as Tab) || internalTab;                       // يتحكم به الشريط الجانبي إن وُجد
  const setTab = (k: Tab) => { if (onSection) onSection(k); else setInternalTab(k); };
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

  const activeTab = TABS.find((t) => t.k === tab)!;
  const ActiveIcon = activeTab.icon;

  return (
    <div className="p-4 lg:p-6 min-h-screen" dir="rtl">
      {/* مسار التنقّل */}
      <nav className="flex items-center gap-1.5 text-[11px] text-slate-500 mb-3 flex-wrap">
        <span className="inline-flex items-center gap-1"><Home size={12} /> الرئيسية</span>
        <ChevronLeft size={12} className="opacity-60" />
        <span className="text-slate-400 font-bold">الحسابات</span>
        <ChevronLeft size={12} className="opacity-60" />
        <span className="text-blue-400 font-bold">{activeTab.label}</span>
      </nav>

      {/* الترويسة — تعكس القسم النشط (التنقّل من الشريط الجانبي) */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
        <div className="flex items-center gap-3">
          <span className="w-11 h-11 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-400"><ActiveIcon size={22} /></span>
          <div>
            <h1 className="text-2xl font-black text-white leading-tight">{activeTab.label}</h1>
            <p className="text-slate-500 text-xs mt-0.5">الحسابات — دفتر موحّد على مستوى المؤسسة</p>
          </div>
        </div>
        <div className="inline-flex items-center gap-2.5 bg-slate-900 border border-slate-800 rounded-xl px-4 py-2">
          <Building2 size={16} className="text-slate-500" />
          <div>
            <div className="text-[10px] text-slate-500 font-bold">المؤسسة</div>
            <div className="text-sm font-bold text-white">{org.name}</div>
          </div>
        </div>
      </div>

      {tab === "chart" && <ChartTab org={org} accounts={accounts} reload={reloadAccounts} busy={busy} setBusy={setBusy} />}
      {tab === "journal" && <JournalTab org={org} postable={postable} accById={accById} branches={branches} branchName={branchName} />}
      {tab === "ledger" && <LedgerTab org={org} postable={postable} accounts={accounts} accById={accById} branches={branches} branchName={branchName} />}
      {tab === "trial" && <TrialTab org={org} accById={accById} postable={postable} branches={branches} />}
      {tab === "assets" && <AssetsTab org={org} postable={postable} branches={branches} branchName={branchName} />}
      {tab === "treasury" && <TreasuryTab org={org} postable={postable} accById={accById} branches={branches} branchName={branchName} />}
    </div>
  );
}

// ══════════════ دليل الحسابات ══════════════
function ChartTab({ org, accounts, reload, busy, setBusy }: { org: { id: number; name: string }; accounts: GLAccount[]; reload: () => Promise<void>; busy: boolean; setBusy: (b: boolean) => void }) {
  const [edit, setEdit] = useState<Partial<GLAccount> | null>(null);
  const groups = useMemo(() => accounts.filter((a) => a.is_group), [accounts]);
  const childrenOf = useMemo(() => {
    const m = new Map<number | null, GLAccount[]>();
    accounts.forEach((a) => { const k = a.parent_id ?? null; if (!m.has(k)) m.set(k, []); m.get(k)!.push(a); });
    m.forEach((arr) => arr.sort((a, b) => a.code.localeCompare(b.code)));
    return m;
  }, [accounts]);

  // توليد الكود التالي تلقائيًا تحت حساب أب (أو جذر)
  const nextChildCode = (parentId: number | null): string => {
    const parent = parentId != null ? accounts.find((a) => a.id === parentId) : null;
    const siblings = accounts.filter((a) => (a.parent_id ?? null) === (parentId ?? null));
    if (parent) {
      const pc = parent.code;
      const kids = siblings.filter((s) => s.code.length > pc.length && s.code.startsWith(pc));
      if (kids.length) {
        const sfx = kids.map((k) => k.code.slice(pc.length));
        const width = sfx[0].length;
        const maxN = Math.max(...sfx.map((s) => parseInt(s, 10) || 0));
        return pc + String(maxN + 1).padStart(width, "0");
      }
      return pc + "01";
    }
    const roots = siblings.map((s) => parseInt(s.code, 10) || 0);
    return String((roots.length ? Math.max(...roots) : 0) + 1);
  };
  // النوع يُورَّث من الأب
  const typeOfParent = (parentId: number | null): AccType | undefined =>
    parentId != null ? accounts.find((a) => a.id === parentId)?.type : undefined;

  const seed = async () => {
    if (!window.confirm("تهيئة دليل الحسابات السعودي القياسي لهذه المؤسسة؟")) return;
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

  // ── رفع/تنزيل/تصدير دليل الحسابات من Excel ──
  const fileRef = useRef<HTMLInputElement>(null);
  const typeFromLabel = (s: string): AccType | null => {
    const t = (s || "").trim().toLowerCase();
    if (/أصول|اصول|asset/.test(t)) return "asset";
    if (/خصوم|التزام|liab/.test(t)) return "liability";
    if (/ملكية|حقوق|equity/.test(t)) return "equity";
    if (/إيراد|ايراد|revenue|income/.test(t)) return "revenue";
    if (/مصروف|expense/.test(t)) return "expense";
    return null;
  };
  const pick = (r: any, keys: string[]) => { for (const k of keys) if (r[k] !== undefined && r[k] !== "") return r[k]; return ""; };
  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["الكود", "اسم الحساب", "النوع", "كود الأب", "تجميعي"],
      ["1", "الأصول", "أصول", "", "نعم"],
      ["11", "الأصول المتداولة", "أصول", "1", "نعم"],
      ["1101", "الصندوق", "أصول", "11", "لا"],
      ["4101", "المبيعات", "إيرادات", "", "لا"],
      ["5201", "الرواتب والأجور", "مصروفات", "", "لا"],
    ]);
    ws["!cols"] = [{ wch: 10 }, { wch: 28 }, { wch: 14 }, { wch: 10 }, { wch: 8 }];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "دليل الحسابات");
    XLSX.writeFile(wb, "نموذج_دليل_الحسابات.xlsx");
  };
  const importFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const wb = XLSX.read(new Uint8Array(ev.target!.result as ArrayBuffer), { type: "array" });
        const rows = XLSX.utils.sheet_to_json<any>(wb.Sheets[wb.SheetNames[0]], { defval: "" });
        const mapped: DB.ImportAccRow[] = [];
        const errs: string[] = [];
        rows.forEach((r, i) => {
          const code = String(pick(r, ["الكود", "الكود المحاسبي", "Code", "code"])).trim();
          const name = String(pick(r, ["اسم الحساب", "الاسم", "Name", "name"])).trim();
          if (!code && !name) return;
          const type = typeFromLabel(String(pick(r, ["النوع", "Type", "type"])));
          const parent = String(pick(r, ["كود الأب", "الأب", "Parent", "parent"])).trim();
          const grp = String(pick(r, ["تجميعي", "مجموعة", "Group", "is_group"])).trim().toLowerCase();
          if (!code) { errs.push(`صف ${i + 2}: كود ناقص`); return; }
          if (!name) { errs.push(`صف ${i + 2}: اسم ناقص`); return; }
          if (!type) { errs.push(`صف ${i + 2}: نوع غير معروف`); return; }
          mapped.push({ code, name, type, parent: parent || null, is_group: /نعم|yes|true|^1$|^y$/.test(grp) });
        });
        if (errs.length) { alert("تعذّر الاستيراد:\n" + errs.slice(0, 12).join("\n")); return; }
        if (!mapped.length) { alert("لم يتم العثور على حسابات صالحة. تأكد من أسماء الأعمدة في النموذج."); return; }
        setBusy(true);
        const res = await DB.importChart(org.id, mapped);
        setBusy(false);
        if (!res.ok) { alert("تعذّر الحفظ: " + (res.error || "")); return; }
        await reload();
        alert(`✓ تم إضافة ${res.added} حساب${res.skipped ? ` · تخطّي ${res.skipped} موجود مسبقًا` : ""}`);
      } catch { alert("تعذّر قراءة الملف. استخدم نموذج الإكسيل المرفق."); }
    };
    reader.readAsArrayBuffer(file);
  };
  const exportChart = () => {
    const byId = new Map(accounts.map((a) => [a.id, a] as const));
    const aoa: any[][] = [["الكود", "اسم الحساب", "النوع", "كود الأب", "تجميعي"]];
    [...accounts].sort((a, b) => a.code.localeCompare(b.code)).forEach((a) => {
      aoa.push([a.code, a.name, DB.TYPE_LABEL[a.type], a.parent_id ? (byId.get(a.parent_id)?.code || "") : "", a.is_group ? "نعم" : "لا"]);
    });
    const ws = XLSX.utils.aoa_to_sheet(aoa); ws["!cols"] = [{ wch: 10 }, { wch: 28 }, { wch: 14 }, { wch: 10 }, { wch: 8 }];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "دليل الحسابات");
    XLSX.writeFile(wb, "دليل_الحسابات.xlsx");
  };

  const typeChip = (a: GLAccount) =>
    a.is_group ? "bg-blue-500/15 text-blue-300" : "bg-slate-700/40 text-slate-400";

  const renderNode = (a: GLAccount, depth: number): any => {
    const kids = childrenOf.get(a.id) || [];
    return (
      <div key={a.id}>
        <div className="group flex items-center gap-2 px-3 py-2 border-b border-slate-800 hover:bg-white/[0.02]" style={{ paddingRight: 12 + depth * 20 }}>
          {a.is_group ? <Layers size={13} className="text-blue-400/70 shrink-0" /> : <span className="w-[13px] shrink-0" />}
          <span className={`font-mono text-xs ${a.is_group ? "text-blue-300 font-bold" : "text-slate-400"}`} style={{ direction: "ltr" }}>{a.code}</span>
          <span className={`text-sm ${a.is_group ? "text-white font-bold" : "text-slate-200"}`}>{a.name}</span>
          <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${typeChip(a)}`}>{a.is_group ? "تجميعي" : DB.TYPE_LABEL[a.type]}</span>
          {!a.is_active && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400">موقوف</span>}
          <div className="mr-auto flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
            <button onClick={() => setEdit({ parent_id: a.id, type: a.type, is_group: false, is_active: true, code: nextChildCode(a.id) })} title="إضافة حساب فرعي" className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center hover:bg-emerald-500/20"><Plus size={13} /></button>
            <button onClick={() => setEdit({ ...a })} title="تعديل" className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-300 flex items-center justify-center hover:bg-blue-500/20"><Pencil size={13} /></button>
            <button onClick={() => del(a)} title="حذف" className="w-7 h-7 rounded-lg bg-red-500/10 text-red-400 flex items-center justify-center hover:bg-red-500/20"><Trash2 size={13} /></button>
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
        <button onClick={() => setEdit({ type: "asset", is_group: false, is_active: true, parent_id: null, code: nextChildCode(null) })} className={BTN_GHOST_EM}><Plus size={14} /> حساب جديد</button>
        {accounts.length === 0 && <button onClick={seed} disabled={busy} className={BTN_PRIMARY}><Network size={14} /> {busy ? "جارٍ…" : "تهيئة الدليل السعودي القياسي"}</button>}
        <button onClick={downloadTemplate} className={BTN_SOFT}><Download size={14} /> نموذج Excel</button>
        <button onClick={() => fileRef.current?.click()} disabled={busy} className={BTN_GHOST_BL}><Upload size={14} /> رفع دليل حسابات</button>
        {accounts.length > 0 && <button onClick={exportChart} className={BTN_GHOST_EM}><Download size={14} /> تصدير الدليل</button>}
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ""; }} />
        <span className="text-[11px] text-slate-500 mr-auto">{accounts.length} حساب</span>
      </div>

      {accounts.length === 0 ? (
        <div className={`${CARD} p-10 text-center text-slate-500 text-sm`}>لا توجد حسابات بعد. ابدأ بزر «تهيئة الدليل السعودي القياسي» ثم عدّله كما تريد.</div>
      ) : (
        <div className={`${CARD} overflow-hidden`}>{roots.map((r) => renderNode(r, 0))}</div>
      )}

      {edit && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" dir="rtl">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-5 shadow-2xl">
            <h3 className="text-white font-bold text-base mb-4">{edit.id ? "تعديل حساب" : "حساب جديد"}</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className={LABEL}>الكود</label><input value={edit.code || ""} onChange={(e) => setEdit({ ...edit, code: e.target.value })} className={INPUT + " [direction:ltr]"} /></div>
                <div><label className={LABEL}>النوع</label><select value={edit.type || "asset"} onChange={(e) => setEdit({ ...edit, type: e.target.value as AccType })} className={SELECT}>{TYPE_OPTS.map((t) => <option key={t} value={t}>{DB.TYPE_LABEL[t]}</option>)}</select></div>
              </div>
              <div><label className={LABEL}>اسم الحساب</label><input value={edit.name || ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} className={INPUT} /></div>
              <div><label className={LABEL}>الحساب الأب</label><select value={edit.parent_id ?? ""} onChange={(e) => { const pid = e.target.value ? Number(e.target.value) : null; const patch: any = { ...edit, parent_id: pid }; if (!edit.id) { patch.code = nextChildCode(pid); const t = typeOfParent(pid); if (t) patch.type = t; } setEdit(patch); }} className={SELECT}><option value="">— رئيسي (بدون أب)</option>{groups.filter((g) => g.id !== edit.id).map((g) => <option key={g.id} value={g.id}>{g.code} - {g.name}</option>)}</select></div>
              <div className="flex items-center gap-4 flex-wrap">
                <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={!!edit.is_group} onChange={(e) => setEdit({ ...edit, is_group: e.target.checked })} className="w-4 h-4 accent-blue-500" /> حساب تجميعي (غير قابل للترحيل)</label>
                <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={edit.is_active !== false} onChange={(e) => setEdit({ ...edit, is_active: e.target.checked })} className="w-4 h-4 accent-blue-500" /> نشط</label>
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-5">
              <button onClick={() => setEdit(null)} className={BTN_SOFT}><X size={14} /> إلغاء</button>
              <button onClick={saveAcc} disabled={busy} className={BTN_SUCCESS}><Save size={15} /> {busy ? "جارٍ…" : "حفظ"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════ القيود اليومية ══════════════
type DraftLine = { account_id: number | ""; debit: string; credit: string; branch_id: number | ""; note: string };
const emptyLine = (): DraftLine => ({ account_id: "", debit: "", credit: "", branch_id: "", note: "" });

function JournalTab({ org, postable, accById, branches, branchName }: any) {
  const multiBranch = branches && branches.length > 1;

  // فلاتر العرض
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [fBranch, setFBranch] = useState<string>("");
  const [fType, setFType] = useState<string>("");
  const [fStatus, setFStatus] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [entries, setEntries] = useState<EntryWithLines[]>([]);

  // نموذج الإدخال/التعديل
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingNo, setEditingNo] = useState<string>("");       // JV ثابت عند التعديل
  const [nextNo, setNextNo] = useState<number>(0);              // JV متوقع عند الإضافة
  const [saving, setSaving] = useState(false);

  const [date, setDate] = useState(today());
  const [eType, setEType] = useState<string>("general");
  const [desc, setDesc] = useState("");
  const [notes, setNotes] = useState("");
  const [eBranch, setEBranch] = useState<string>("");          // مركز التكلفة الافتراضي
  const [lines, setLines] = useState<DraftLine[]>([emptyLine(), emptyLine()]);

  // مرفقات القيد
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);            // ملفات جديدة تُرفع عند الحفظ
  const [existingAtts, setExistingAtts] = useState<DB.GLAttachment[]>([]); // مرفقات القيد قيد التعديل
  const [attMap, setAttMap] = useState<Record<number, number>>({});        // عدد مرفقات كل قيد في القائمة
  const attRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    const es = await DB.fetchEntries(org.id, from, to, fBranch ? Number(fBranch) : null);
    setEntries(es);
    setAttMap(await DB.countAttachments(es.map((e) => e.id)));
  }, [org.id, from, to, fBranch]);
  useEffect(() => { reload(); }, [reload]);

  // JV المتوقع عند الإضافة (يتحدّث مع تغيّر السنة)
  useEffect(() => {
    if (!showForm || editingId != null) return;
    let active = true;
    (async () => { const n = await DB.nextEntryNo(org.id, yearOf(date)); if (active) setNextNo(n); })();
    return () => { active = false; };
  }, [showForm, editingId, date, org.id]);

  const sumD = lines.reduce((s, l) => s + num(l.debit), 0);
  const sumC = lines.reduce((s, l) => s + num(l.credit), 0);
  const balanced = Math.abs(sumD - sumC) < 0.005 && sumD > 0;
  const setLine = (i: number, patch: Partial<DraftLine>) => setLines((p) => p.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const resetForm = () => { setDate(today()); setEType("general"); setDesc(""); setNotes(""); setEBranch(""); setLines([emptyLine(), emptyLine()]); setPendingFiles([]); setExistingAtts([]); };

  const openNew = () => { setEditingId(null); setEditingNo(""); resetForm(); setShowForm(true); };
  const closeForm = () => { setShowForm(false); setEditingId(null); setEditingNo(""); resetForm(); };

  const startEdit = (e: EntryWithLines) => {
    setEditingId(e.id);
    setEditingNo(jvLabel(e.entry_year, e.entry_no));
    setDate(e.date);
    setEType(e.entry_type || "general");
    setDesc(e.description || "");
    setNotes(e.notes || "");
    setEBranch(e.branch_id != null ? String(e.branch_id) : "");
    const ls: DraftLine[] = (e.lines || []).map((l) => ({
      account_id: l.account_id, debit: l.debit ? String(l.debit) : "", credit: l.credit ? String(l.credit) : "",
      branch_id: l.branch_id != null ? Number(l.branch_id) : "", note: l.note || "",
    }));
    setLines(ls.length >= 2 ? ls : [...ls, emptyLine(), emptyLine()].slice(0, Math.max(2, ls.length)));
    setPendingFiles([]);
    setExistingAtts([]);
    DB.fetchAttachments(e.id).then(setExistingAtts);
    setShowForm(true);
    try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch { /* noop */ }
  };

  // ── إدارة المرفقات ──
  const addFiles = (files: FileList | null) => {
    if (!files || !files.length) return;
    const arr = Array.from(files);
    const tooBig = arr.find((f) => f.size > 10 * 1024 * 1024);
    if (tooBig) { alert("حجم الملف أكبر من 10 ميجابايت: " + tooBig.name); return; }
    setPendingFiles((p) => [...p, ...arr]);
  };
  const openAtt = async (att: DB.GLAttachment) => {
    const url = await DB.signedUrl(att.file_path);
    if (url) window.open(url, "_blank"); else alert("تعذّر فتح المرفق");
  };
  const delExisting = async (att: DB.GLAttachment) => {
    if (!window.confirm(`حذف المرفق «${att.file_name}»؟`)) return;
    const r = await DB.deleteAttachment(att);
    if (!r.ok) { alert("تعذّر الحذف: " + (r.error || "")); return; }
    setExistingAtts((p) => p.filter((a) => a.id !== att.id));
    await reload();
  };

  const persist = async (status: "posted" | "draft") => {
    const valid = lines.filter((l) => l.account_id && (num(l.debit) || num(l.credit)));
    if (valid.length < 2) { alert("أضف سطرين على الأقل بحساب ومبلغ"); return; }
    if (status === "posted" && !balanced) { alert("القيد غير متوازن: مجموع المدين يجب أن يساوي مجموع الدائن"); return; }
    const header: DB.EntryHeader = {
      date, description: desc || null, branch_id: eBranch ? Number(eBranch) : null,
      entry_type: eType, notes: notes || null, status,
    };
    const glLines: GLLine[] = valid.map((l) => ({
      account_id: Number(l.account_id), debit: num(l.debit), credit: num(l.credit),
      branch_id: l.branch_id === "" ? null : Number(l.branch_id), note: l.note || null,
    }));
    setSaving(true);
    const r = editingId != null ? await DB.updateEntry(editingId, header, glLines) : await DB.createEntry(org.id, header, glLines);
    if (!r.ok) { setSaving(false); alert("تعذّر حفظ القيد: " + ((r as any).error || "")); return; }
    // رفع المرفقات الجديدة بعد تأمين معرّف القيد
    const entryId = editingId != null ? editingId : (r as any).id;
    if (entryId && pendingFiles.length) {
      for (const f of pendingFiles) {
        const up = await DB.uploadAttachment(org.id, entryId, f);
        if (!up.ok) alert(`تعذّر رفع «${f.name}»: ${up.error || ""}`);
      }
    }
    setSaving(false);
    closeForm();
    await reload();
  };

  const post = async (id: number) => { const r = await DB.setEntryStatus(id, "posted"); if (r.ok) await reload(); else alert("تعذّر الترحيل: " + (r.error || "")); };
  const del = async (id: number) => { if (!window.confirm("حذف هذا القيد؟")) return; const r = await DB.deleteEntry(id); if (r.ok) await reload(); else alert("تعذّر الحذف: " + (r.error || "")); };

  // تصفية العرض (نوع/حالة/بحث)
  const shown = useMemo(() => entries.filter((e) => {
    if (fType && (e.entry_type || "general") !== fType) return false;
    if (fStatus && (e.status || "posted") !== fStatus) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const hay = `${e.entry_no} ${e.description || ""} ${e.notes || ""} ${jvLabel(e.entry_year, e.entry_no)}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }), [entries, fType, fStatus, search]);

  const draftCount = entries.filter((e) => (e.status || "posted") === "draft").length;

  return (
    <div>
      {/* شريط الفلاتر */}
      <div className={`${CARD} p-3 mb-4`}>
        <div className="flex flex-wrap items-end gap-3">
          <div><label className={LABEL}>من</label><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={DATE} /></div>
          <div><label className={LABEL}>إلى</label><input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={DATE} /></div>
          {multiBranch && (
            <div><label className={LABEL}>الفرع</label><select value={fBranch} onChange={(e) => setFBranch(e.target.value)} className={SELECT}><option value="">كل الفروع</option>{branches.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
          )}
          <div><label className={LABEL}>النوع</label><select value={fType} onChange={(e) => setFType(e.target.value)} className={SELECT}><option value="">كل الأنواع</option>{DB.ENTRY_TYPE_OPTS.map((t) => <option key={t} value={t}>{DB.ENTRY_TYPE_LABEL[t]}</option>)}</select></div>
          <div><label className={LABEL}>الحالة</label><select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className={SELECT}><option value="">الكل</option><option value="posted">مُرحّل</option><option value="draft">مسودة</option></select></div>
          <div className="flex-1 min-w-[160px]"><label className={LABEL}>بحث</label>
            <div className="relative">
              <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="رقم / بيان / ملاحظة" className={INPUT + " pr-9"} />
            </div>
          </div>
          <button onClick={openNew} className={BTN_PRIMARY}><Plus size={14} /> قيد جديد</button>
        </div>
      </div>

      {/* نموذج الإدخال/التعديل */}
      {showForm && (
        <div className={`${CARD} p-4 mb-4`}>
          {/* بطاقة رقم القيد + النوع + الحالة */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="inline-flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-blue-500/10 border border-blue-500/20">
              <FileCheck2 size={18} className="text-blue-400" />
              <div>
                <div className="text-[10px] text-blue-300/70 font-bold leading-none mb-1">رقم القيد</div>
                <div className="font-mono font-black text-blue-300 text-sm [direction:ltr] leading-none">{editingId != null ? editingNo : jvLabel(yearOf(date), nextNo)}</div>
              </div>
            </div>
            <span className="text-sm font-bold text-white">{editingId != null ? "تعديل قيد يومية" : "إدخال قيد يومية جديد"}</span>
            {editingId != null && <span className="text-[10px] px-2 py-1 rounded-full bg-amber-500/15 text-amber-400 font-bold">وضع التعديل</span>}
            <button onClick={closeForm} className="mr-auto w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white flex items-center justify-center"><X size={15} /></button>
          </div>

          {/* ترويسة القيد */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
            <div><label className={LABEL}>التاريخ</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={DATE} /></div>
            <div><label className={LABEL}>نوع القيد</label><select value={eType} onChange={(e) => setEType(e.target.value)} className={SELECT}>{DB.ENTRY_TYPE_OPTS.map((t) => <option key={t} value={t}>{DB.ENTRY_TYPE_LABEL[t]}</option>)}</select></div>
            <div className={multiBranch ? "" : "lg:col-span-2"}><label className={LABEL}>البيان</label><input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="وصف القيد" className={INPUT} /></div>
            {multiBranch && <div><label className={LABEL}>مركز التكلفة الافتراضي</label><select value={eBranch} onChange={(e) => setEBranch(e.target.value)} className={SELECT}><option value="">— بدون</option>{branches.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>}
          </div>

          {/* سطور القيد */}
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full border-collapse" style={{ minWidth: multiBranch ? 760 : 620 }}>
              <thead>
                <tr className="bg-slate-950">
                  {["#", "الحساب", "مدين", "دائن", ...(multiBranch ? ["مركز التكلفة"] : []), "ملاحظة", ""].map((h, i) => (
                    <th key={i} className="text-right text-[10px] font-bold text-slate-500 px-2 py-2.5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i} className="border-t border-slate-800">
                    <td className="px-2 py-1.5 text-center text-[11px] text-slate-600 font-mono">{i + 1}</td>
                    <td className="px-2 py-1.5"><AccountPicker value={l.account_id} onChange={(v) => setLine(i, { account_id: v })} options={postable} size="sm" /></td>
                    <td className="px-2 py-1.5"><input type="number" step="0.01" value={l.debit} onChange={(e) => setLine(i, { debit: e.target.value, credit: e.target.value ? "" : l.credit })} placeholder="0" className="w-28 bg-slate-950 border border-slate-700 rounded-lg text-white px-2 py-1.5 text-center font-mono text-xs [direction:ltr] outline-none focus:border-emerald-500" /></td>
                    <td className="px-2 py-1.5"><input type="number" step="0.01" value={l.credit} onChange={(e) => setLine(i, { credit: e.target.value, debit: e.target.value ? "" : l.debit })} placeholder="0" className="w-28 bg-slate-950 border border-slate-700 rounded-lg text-white px-2 py-1.5 text-center font-mono text-xs [direction:ltr] outline-none focus:border-amber-500" /></td>
                    {multiBranch && <td className="px-2 py-1.5"><select value={l.branch_id} onChange={(e) => setLine(i, { branch_id: e.target.value ? Number(e.target.value) : "" })} className="w-full min-w-[120px] bg-slate-950 border border-slate-700 rounded-lg text-white px-2 py-1.5 text-xs outline-none focus:border-blue-500"><option value="">افتراضي</option>{branches.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></td>}
                    <td className="px-2 py-1.5"><input value={l.note} onChange={(e) => setLine(i, { note: e.target.value })} placeholder="—" className="w-full min-w-[110px] bg-slate-950 border border-slate-700 rounded-lg text-white px-2 py-1.5 text-xs outline-none focus:border-blue-500" /></td>
                    <td className="px-2 py-1.5 text-center"><button onClick={() => setLines((p) => (p.length > 2 ? p.filter((_, idx) => idx !== i) : p))} title="حذف السطر" className="w-7 h-7 rounded-lg bg-red-500/10 text-red-400 flex items-center justify-center mx-auto hover:bg-red-500/20"><X size={13} /></button></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-950 font-bold">
                  <td className="px-2 py-2.5 text-center" />
                  <td className="px-2 py-2.5 text-right text-xs text-slate-300">الإجمالي</td>
                  <td className={`px-2 py-2.5 text-center font-mono text-xs [direction:ltr] ${balanced ? "text-emerald-400" : "text-amber-400"}`}>{fmt(sumD)}</td>
                  <td className={`px-2 py-2.5 text-center font-mono text-xs [direction:ltr] ${balanced ? "text-emerald-400" : "text-amber-400"}`}>{fmt(sumC)}</td>
                  <td colSpan={multiBranch ? 3 : 2} className={`px-2 py-2.5 text-xs ${balanced ? "text-emerald-400" : "text-amber-400"}`}>{balanced ? "✓ القيد متوازن" : `الفرق: ${fmt(sumD - sumC)}`}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* ملاحظات عامة */}
          <div className="mt-3">
            <label className={LABEL}>ملاحظات عامة (اختياري)</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="ملاحظات إضافية على القيد…" className={INPUT + " resize-y"} />
          </div>

          {/* المرفقات */}
          <div className="mt-3">
            <label className={LABEL}>المرفقات (فواتير/مستندات — PDF أو صورة، حتى 10 ميجابايت)</label>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => attRef.current?.click()} className={BTN_GHOST_BL}><Paperclip size={14} /> إضافة مرفق</button>
              <input ref={attRef} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
              {(existingAtts.length + pendingFiles.length) > 0 && <span className="text-[11px] text-slate-500">{existingAtts.length + pendingFiles.length} مرفق</span>}
            </div>
            {(existingAtts.length > 0 || pendingFiles.length > 0) && (
              <div className="mt-2 flex flex-wrap gap-2">
                {existingAtts.map((a) => (
                  <div key={a.id} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs">
                    <FileText size={13} className="text-blue-400 shrink-0" />
                    <button type="button" onClick={() => openAtt(a)} title="فتح المرفق" className="text-slate-200 hover:text-blue-400 max-w-[170px] truncate inline-flex items-center gap-1">{a.file_name}<ExternalLink size={11} className="opacity-60" /></button>
                    <button type="button" onClick={() => delExisting(a)} title="حذف المرفق" className="text-red-400 hover:text-red-300 shrink-0"><X size={13} /></button>
                  </div>
                ))}
                {pendingFiles.map((f, i) => (
                  <div key={i} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs">
                    <Paperclip size={13} className="text-blue-400 shrink-0" />
                    <span className="text-blue-200 max-w-[170px] truncate">{f.name}</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-300 shrink-0">سيُرفع</span>
                    <button type="button" onClick={() => setPendingFiles((p) => p.filter((_, idx) => idx !== i))} title="إزالة" className="text-red-400 hover:text-red-300 shrink-0"><X size={13} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* أزرار الحفظ */}
          <div className="flex items-center gap-2 mt-4 flex-wrap">
            <button onClick={() => setLines((p) => [...p, emptyLine()])} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600/10 border border-dashed border-blue-500 text-blue-300 font-bold text-xs hover:bg-blue-600/20"><Plus size={13} /> سطر</button>
            <div className="mr-auto flex items-center gap-2 flex-wrap">
              <button onClick={() => persist("draft")} disabled={saving} className={BTN_SOFT}><Save size={14} /> حفظ كمسودة</button>
              <button onClick={() => persist("posted")} disabled={saving || !balanced} className={BTN_SUCCESS}><Check size={16} /> {saving ? "جارٍ…" : editingId != null ? "حفظ وترحيل" : "ترحيل القيد"}</button>
            </div>
          </div>
        </div>
      )}

      {/* دفتر اليومية */}
      <div className={`${CARD} overflow-hidden`}>
        <SectionHead icon={BookOpen} title="دفتر اليومية" extra={
          <div className="flex items-center gap-2 text-[11px]">
            {draftCount > 0 && <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 font-bold">{draftCount} مسودة</span>}
            <span className="text-slate-500">{shown.length} قيد</span>
          </div>
        } />
        {shown.length === 0 ? (
          <div className="p-10 text-center text-slate-500 text-sm">لا توجد قيود مطابقة ضمن هذه الفترة/الفلاتر.</div>
        ) : (
          <div className="divide-y divide-slate-800">
            {shown.map((e) => {
              const d = (e.lines || []).reduce((s, l) => s + Number(l.debit || 0), 0);
              const isDraft = (e.status || "posted") === "draft";
              return (
                <div key={e.id} className="p-3">
                  <div className="flex items-center gap-2.5 flex-wrap mb-2">
                    <span className="font-mono text-xs font-bold text-blue-300 [direction:ltr]">{jvLabel(e.entry_year, e.entry_no)}</span>
                    <span className="font-mono text-xs text-slate-400 [direction:ltr]">{e.date}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-700/40 text-slate-300">{DB.ENTRY_TYPE_LABEL[e.entry_type || "general"]}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${isDraft ? "bg-amber-500/15 text-amber-400" : "bg-emerald-500/15 text-emerald-400"}`}>{isDraft ? "مسودة" : "مُرحّل"}</span>
                    {attMap[e.id] ? <button onClick={() => startEdit(e)} title="عرض المرفقات" className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300 hover:bg-blue-500/20"><Paperclip size={10} /> {attMap[e.id]}</button> : null}
                    <span className="text-sm text-slate-200">{e.description || "—"}</span>
                    {e.branch_id != null && <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300">{branchName(e.branch_id)}</span>}
                    <span className="mr-auto font-mono text-xs font-bold text-emerald-400 [direction:ltr]">{fmt(d)} ر.س</span>
                    <div className="flex items-center gap-1">
                      {isDraft && <button onClick={() => post(e.id)} title="ترحيل" className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center hover:bg-emerald-500/20"><Send size={13} /></button>}
                      <button onClick={() => startEdit(e)} title="تعديل" className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-300 flex items-center justify-center hover:bg-blue-500/20"><Pencil size={13} /></button>
                      <button onClick={() => del(e.id)} title="حذف" className="w-7 h-7 rounded-lg bg-red-500/10 text-red-400 flex items-center justify-center hover:bg-red-500/20"><Trash2 size={13} /></button>
                    </div>
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-slate-800/60">
                    <table className="w-full border-collapse" style={{ minWidth: 480 }}>
                      <tbody>
                        {(e.lines || []).map((l, i) => { const a = accById.get(l.account_id); return (
                          <tr key={i} className="text-xs border-b border-slate-800/60 last:border-0">
                            <td className="px-2 py-1 text-slate-400 font-mono [direction:ltr] w-16">{a?.code}</td>
                            <td className="px-2 py-1 text-slate-200">{a?.name || l.account_id}{l.note ? <span className="text-slate-500"> — {l.note}</span> : null}{l.branch_id != null ? <span className="text-blue-300/70 text-[10px]"> · {branchName(l.branch_id)}</span> : null}</td>
                            <td className="px-2 py-1 text-center font-mono text-emerald-300/90 [direction:ltr] w-24">{Number(l.debit) ? fmt(Number(l.debit)) : ""}</td>
                            <td className="px-2 py-1 text-center font-mono text-amber-300/90 [direction:ltr] w-24">{Number(l.credit) ? fmt(Number(l.credit)) : ""}</td>
                          </tr>
                        ); })}
                      </tbody>
                    </table>
                  </div>
                  {e.notes ? <div className="mt-1.5 text-[11px] text-slate-500">📝 {e.notes}</div> : null}
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
function LedgerTab({ org, postable, accounts, accById, branches, branchName }: any) {
  const multiBranch = branches && branches.length > 1;
  const [accId, setAccId] = useState<string>("");
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [fBranch, setFBranch] = useState<string>("");
  const [rows, setRows] = useState<LedgerLine[]>([]);
  const [opening, setOpening] = useState(0);
  const [loading, setLoading] = useState(false);
  const [ranAcc, setRanAcc] = useState<GLAccount | null>(null);   // الحساب المعروض فعليًا

  const allAccounts = useMemo(() => [...accounts].sort((a: GLAccount, b: GLAccount) => a.code.localeCompare(b.code)), [accounts]);

  const run = async () => {
    if (!accId) { alert("اختر الحساب"); return; }
    const acc = accById.get(Number(accId)) as GLAccount | undefined;
    const ids = acc?.is_group ? DB.descendantPostableIds(accounts, Number(accId)) : [Number(accId)];
    if (!ids.length) { alert("لا توجد حسابات قابلة للترحيل تحت هذا الحساب"); return; }
    setLoading(true);
    const br = fBranch ? Number(fBranch) : null;
    const before = await DB.fetchLedgerMulti(org.id, ids, "2000-01-01", dayBefore(from), br);
    const ob = before.reduce((s, r) => s + r.debit - r.credit, 0);
    const period = await DB.fetchLedgerMulti(org.id, ids, from, to, br);
    setOpening(ob); setRows(period); setRanAcc(acc || null); setLoading(false);
  };

  let running = opening;
  const isGroup = !!ranAcc?.is_group;
  const cols = isGroup ? ["التاريخ", "القيد", "الحساب", "البيان", "مدين", "دائن", "الرصيد"] : ["التاريخ", "القيد", "البيان", "مدين", "دائن", "الرصيد"];
  const span = cols.length;

  return (
    <div>
      <div className={`${CARD} p-3 mb-4`}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[240px]"><label className={LABEL}>الحساب (يمكن اختيار حساب تجميعي لتجميع فروعه)</label><AccountPicker value={accId ? Number(accId) : ""} onChange={(v) => setAccId(v === "" ? "" : String(v))} options={allAccounts} size="md" /></div>
          <div><label className={LABEL}>من</label><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={DATE} /></div>
          <div><label className={LABEL}>إلى</label><input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={DATE} /></div>
          {multiBranch && <div><label className={LABEL}>الفرع</label><select value={fBranch} onChange={(e) => setFBranch(e.target.value)} className={SELECT}><option value="">كل الفروع</option>{branches.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>}
          <button onClick={run} disabled={loading} className={BTN_PRIMARY}><FileText size={14} /> {loading ? "جارٍ…" : "عرض الكشف"}</button>
        </div>
      </div>

      <div className={`${CARD} overflow-hidden`}>
        <SectionHead icon={FileText} title={`كشف حساب${ranAcc ? ` — ${ranAcc.code} ${ranAcc.name}` : ""}${isGroup ? " (مُجمّع للفروع)" : ""}`} />
        <div className="overflow-x-auto">
          <table className="w-full border-collapse" style={{ minWidth: isGroup ? 740 : 640 }}>
            <thead><tr>{cols.map((h) => <th key={h} className="text-[10px] px-2 py-2.5 bg-slate-950 text-slate-500 whitespace-nowrap border-b border-slate-700">{h}</th>)}</tr></thead>
            <tbody>
              <tr className="bg-slate-950/40"><td colSpan={span - 1} className="px-2 py-2 text-xs text-right text-slate-400 border-b border-slate-800">رصيد افتتاحي</td><td className="px-2 py-2 text-center font-mono text-xs font-bold text-slate-200 [direction:ltr] border-b border-slate-800">{fmt(opening)}</td></tr>
              {rows.map((r, i) => { running += r.debit - r.credit; const sub = accById.get(r.account_id) as GLAccount | undefined; return (
                <tr key={i} className="hover:bg-white/[0.02]">
                  <td className="px-2 py-2 text-xs text-center font-mono text-slate-400 [direction:ltr] border-b border-slate-800">{r.date}</td>
                  <td className="px-2 py-2 text-xs text-center font-mono text-blue-300 [direction:ltr] border-b border-slate-800">{String(r.entry_no).padStart(4, "0")}</td>
                  {isGroup && <td className="px-2 py-2 text-xs text-right text-slate-400 border-b border-slate-800"><span className="font-mono [direction:ltr]">{sub?.code}</span> {sub?.name || ""}</td>}
                  <td className="px-2 py-2 text-xs text-right text-slate-300 border-b border-slate-800">{r.description || "—"}{r.note ? <span className="text-slate-500"> · {r.note}</span> : null}</td>
                  <td className="px-2 py-2 text-xs text-center font-mono text-emerald-400 [direction:ltr] border-b border-slate-800">{r.debit ? fmt(r.debit) : ""}</td>
                  <td className="px-2 py-2 text-xs text-center font-mono text-amber-400 [direction:ltr] border-b border-slate-800">{r.credit ? fmt(r.credit) : ""}</td>
                  <td className="px-2 py-2 text-xs text-center font-mono font-bold text-white [direction:ltr] border-b border-slate-800">{fmt(running)}</td>
                </tr>
              ); })}
              {rows.length === 0 && <tr><td colSpan={span} className="p-8 text-center text-slate-500 text-sm">اختر حسابًا واضغط «عرض الكشف».</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ══════════════ ميزان المراجعة ══════════════
function TrialTab({ org, accById, branches }: any) {
  const multiBranch = branches && branches.length > 1;
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

  const diff = Math.abs(totD - totC) < 0.01;

  return (
    <div>
      <div className={`${CARD} p-3 mb-4`}>
        <div className="flex flex-wrap items-end gap-3">
          <div><label className={LABEL}>من</label><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={DATE} /></div>
          <div><label className={LABEL}>إلى</label><input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={DATE} /></div>
          {multiBranch && <div><label className={LABEL}>الفرع</label><select value={fBranch} onChange={(e) => setFBranch(e.target.value)} className={SELECT}><option value="">كل الفروع</option>{branches.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>}
          <button onClick={run} disabled={loading} className={BTN_PRIMARY}><Scale size={14} /> {loading ? "جارٍ…" : "عرض الميزان"}</button>
          <button onClick={exportExcel} disabled={!rows.length} className={BTN_GHOST_EM}><Download size={14} /> Excel</button>
        </div>
      </div>

      <div className={`${CARD} overflow-hidden`}>
        <SectionHead icon={Scale} title="ميزان المراجعة" extra={
          <span className={`text-[11px] font-bold ${diff ? "text-emerald-400" : "text-amber-400"}`}>{diff ? "✓ متوازن" : `فرق: ${fmt(totD - totC)}`}</span>
        } />
        <div className="overflow-x-auto">
          <table className="w-full border-collapse" style={{ minWidth: 560 }}>
            <thead><tr>{["الكود", "الحساب", "مدين", "دائن", "الرصيد"].map((h) => <th key={h} className="text-[10px] px-2 py-2.5 bg-slate-950 text-slate-500 whitespace-nowrap border-b border-slate-700">{h}</th>)}</tr></thead>
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

// ══════════════ الأصول الثابتة ══════════════
function AssetsTab({ org, postable, branches, branchName }: any) {
  const multiBranch = branches && branches.length > 1;
  const [assets, setAssets] = useState<DB.GLAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [asOf, setAsOf] = useState(today());
  const [fBranch, setFBranch] = useState<string>("");
  const [edit, setEdit] = useState<Partial<DB.GLAsset> | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setAssets(await DB.fetchAssets(org.id, fBranch ? Number(fBranch) : null));
    setLoading(false);
  }, [org.id, fBranch]);
  useEffect(() => { reload(); }, [reload]);

  const rows = useMemo(() => assets.map((a) => ({ a, dep: DB.depreciation(a, asOf) })), [assets, asOf]);
  const totCost = rows.reduce((s, r) => s + (Number(r.a.cost) || 0), 0);
  const totAcc = rows.reduce((s, r) => s + r.dep.accumulated, 0);
  const totBook = rows.reduce((s, r) => s + r.dep.bookValue, 0);

  const save = async () => {
    if (!edit) return;
    if (!edit.name || !String(edit.name).trim()) { alert("أدخل اسم الأصل"); return; }
    if (!edit.acquire_date) { alert("أدخل تاريخ الاقتناء"); return; }
    const payload: any = {
      organization_id: org.id,
      branch_id: edit.branch_id ?? (fBranch ? Number(fBranch) : null),
      name: String(edit.name).trim(), category: edit.category || null,
      acquire_date: edit.acquire_date, cost: num(edit.cost), salvage_value: num(edit.salvage_value),
      useful_life_years: num(edit.useful_life_years) || 1, account_id: edit.account_id ?? null,
      notes: edit.notes || null, is_active: edit.is_active !== false,
    };
    if (edit.id) payload.id = edit.id;
    setBusy(true);
    const r = await DB.upsertAsset(payload);
    setBusy(false);
    if (!r.ok) { alert("تعذّر الحفظ: " + (r.error || "")); return; }
    setEdit(null); await reload();
  };

  const del = async (a: DB.GLAsset) => {
    if (!window.confirm(`حذف الأصل «${a.name}»؟`)) return;
    const r = await DB.deleteAsset(a.id);
    if (!r.ok) { alert("تعذّر الحذف: " + (r.error || "")); return; }
    await reload();
  };

  const exportExcel = () => {
    const head = ["الأصل", "الفئة", "تاريخ الاقتناء", "التكلفة", "القيمة التخريدية", "العمر(سنوات)", "إهلاك سنوي", "مجمع الإهلاك", "القيمة الدفترية"];
    const body = rows.map(({ a, dep }) => [a.name, a.category || "", a.acquire_date, fmt(Number(a.cost) || 0), fmt(Number(a.salvage_value) || 0), String(a.useful_life_years), fmt(dep.annual), fmt(dep.accumulated), fmt(dep.bookValue)]);
    const rowsHtml = body.map((c) => `<tr>${c.map((v, i) => `<td style="border:1px solid #e5e7eb;padding:5px 8px;font-size:11px;text-align:${i <= 1 ? "right" : "center"};">${v}</td>`).join("")}</tr>`).join("");
    const html = `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"></head><body dir="rtl"><h3>سجل الأصول الثابتة — ${org.name} — الإهلاك حتى ${asOf}</h3><table style="border-collapse:collapse"><tr>${head.map((h) => `<th style="border:1px solid #d1d5db;padding:6px 8px;background:#14304d;color:#fff;font-size:11px;">${h}</th>`).join("")}</tr>${rowsHtml}</table></body></html>`;
    const blob = new Blob(["﻿" + html], { type: "application/vnd.ms-excel;charset=utf-8" });
    const el = document.createElement("a"); el.href = URL.createObjectURL(blob); el.download = `الأصول_الثابتة_${asOf}.xls`; el.click(); URL.revokeObjectURL(el.href);
  };

  return (
    <div>
      <div className={`${CARD} p-3 mb-4`}>
        <div className="flex flex-wrap items-end gap-3">
          <div><label className={LABEL}>الإهلاك حتى تاريخ</label><input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className={DATE} /></div>
          {multiBranch && <div><label className={LABEL}>الفرع</label><select value={fBranch} onChange={(e) => setFBranch(e.target.value)} className={SELECT}><option value="">كل الفروع</option>{branches.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>}
          <button onClick={() => setEdit({ acquire_date: today(), cost: 0 as any, salvage_value: 0 as any, useful_life_years: 5 as any, is_active: true })} className={BTN_GHOST_EM}><Plus size={14} /> أصل جديد</button>
          <button onClick={exportExcel} disabled={!rows.length} className={BTN_GHOST_BL}><Download size={14} /> Excel</button>
          <span className="text-[11px] text-slate-500 mr-auto">{assets.length} أصل</span>
        </div>
      </div>

      <div className={`${CARD} overflow-hidden`}>
        <SectionHead icon={Building2} title="سجل الأصول الثابتة" extra={
          <span className="text-[11px] text-slate-500">القيمة الدفترية: <span className="font-mono text-emerald-400 font-bold">{fmt(totBook)}</span></span>
        } />
        <div className="overflow-x-auto">
          <table className="w-full border-collapse" style={{ minWidth: 840 }}>
            <thead><tr>{["الأصل", "الفئة", "تاريخ الاقتناء", "التكلفة", "العمر/سنة", "إهلاك سنوي", "مجمع الإهلاك", "القيمة الدفترية", ...(multiBranch ? ["الفرع"] : []), ""].map((h, i) => <th key={i} className="text-[10px] px-2 py-2.5 bg-slate-950 text-slate-500 whitespace-nowrap border-b border-slate-700">{h}</th>)}</tr></thead>
            <tbody>
              {rows.map(({ a, dep }) => (
                <tr key={a.id} className="hover:bg-white/[0.02]">
                  <td className="px-2 py-2 text-xs text-right text-slate-200 border-b border-slate-800">{a.name}{!a.is_active && <span className="text-[9px] text-red-400"> (موقوف)</span>}</td>
                  <td className="px-2 py-2 text-xs text-right text-slate-400 border-b border-slate-800">{a.category || "—"}</td>
                  <td className="px-2 py-2 text-xs text-center font-mono text-slate-400 [direction:ltr] border-b border-slate-800">{a.acquire_date}</td>
                  <td className="px-2 py-2 text-xs text-center font-mono text-slate-200 [direction:ltr] border-b border-slate-800">{fmt(Number(a.cost) || 0)}</td>
                  <td className="px-2 py-2 text-xs text-center font-mono text-slate-400 [direction:ltr] border-b border-slate-800">{a.useful_life_years}</td>
                  <td className="px-2 py-2 text-xs text-center font-mono text-amber-400 [direction:ltr] border-b border-slate-800">{fmt(dep.annual)}</td>
                  <td className="px-2 py-2 text-xs text-center font-mono text-amber-300 [direction:ltr] border-b border-slate-800">{fmt(dep.accumulated)}</td>
                  <td className="px-2 py-2 text-xs text-center font-mono font-bold text-emerald-400 [direction:ltr] border-b border-slate-800">{fmt(dep.bookValue)}</td>
                  {multiBranch && <td className="px-2 py-2 text-xs text-center text-slate-400 border-b border-slate-800">{a.branch_id != null ? branchName(a.branch_id) : "—"}</td>}
                  <td className="px-2 py-2 border-b border-slate-800"><div className="flex items-center gap-1 justify-center"><button onClick={() => setEdit({ ...a })} title="تعديل" className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-300 flex items-center justify-center hover:bg-blue-500/20"><Pencil size={13} /></button><button onClick={() => del(a)} title="حذف" className="w-7 h-7 rounded-lg bg-red-500/10 text-red-400 flex items-center justify-center hover:bg-red-500/20"><Trash2 size={13} /></button></div></td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={multiBranch ? 10 : 9} className="p-8 text-center text-slate-500 text-sm">{loading ? "جارٍ…" : "لا توجد أصول بعد. اضغط «أصل جديد»."}</td></tr>}
            </tbody>
            {rows.length > 0 && (
              <tfoot><tr className="bg-slate-950 font-bold">
                <td colSpan={3} className="px-2 py-2.5 text-xs text-right text-slate-200 border-t border-slate-600">الإجمالي</td>
                <td className="px-2 py-2.5 text-center font-mono text-xs text-slate-100 [direction:ltr] border-t border-slate-600">{fmt(totCost)}</td>
                <td className="border-t border-slate-600" colSpan={2} />
                <td className="px-2 py-2.5 text-center font-mono text-xs text-amber-300 [direction:ltr] border-t border-slate-600">{fmt(totAcc)}</td>
                <td className="px-2 py-2.5 text-center font-mono text-xs text-emerald-400 [direction:ltr] border-t border-slate-600">{fmt(totBook)}</td>
                <td className="border-t border-slate-600" colSpan={multiBranch ? 2 : 1} />
              </tr></tfoot>
            )}
          </table>
        </div>
      </div>

      {edit && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" dir="rtl">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg p-5 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-white font-bold text-base mb-4">{edit.id ? "تعديل أصل" : "أصل جديد"}</h3>
            <div className="space-y-3">
              <div><label className={LABEL}>اسم الأصل</label><input value={edit.name || ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} className={INPUT} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={LABEL}>الفئة</label><input value={edit.category || ""} onChange={(e) => setEdit({ ...edit, category: e.target.value })} placeholder="أثاث / أجهزة / سيارات…" className={INPUT} /></div>
                <div><label className={LABEL}>تاريخ الاقتناء</label><input type="date" value={edit.acquire_date || ""} onChange={(e) => setEdit({ ...edit, acquire_date: e.target.value })} className={DATE} /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className={LABEL}>التكلفة</label><input type="number" step="0.01" value={(edit.cost as any) ?? ""} onChange={(e) => setEdit({ ...edit, cost: e.target.value as any })} className={INPUT + " [direction:ltr] text-center"} /></div>
                <div><label className={LABEL}>القيمة التخريدية</label><input type="number" step="0.01" value={(edit.salvage_value as any) ?? ""} onChange={(e) => setEdit({ ...edit, salvage_value: e.target.value as any })} className={INPUT + " [direction:ltr] text-center"} /></div>
                <div><label className={LABEL}>العمر (سنوات)</label><input type="number" step="1" value={(edit.useful_life_years as any) ?? ""} onChange={(e) => setEdit({ ...edit, useful_life_years: e.target.value as any })} className={INPUT + " [direction:ltr] text-center"} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={LABEL}>حساب الأصل (اختياري)</label><AccountPicker value={edit.account_id ?? ""} onChange={(v) => setEdit({ ...edit, account_id: v === "" ? null : v })} options={postable} placeholder="— بدون" size="md" /></div>
                {multiBranch && <div><label className={LABEL}>مركز التكلفة (فرع)</label><select value={edit.branch_id ?? ""} onChange={(e) => setEdit({ ...edit, branch_id: e.target.value ? Number(e.target.value) : null })} className={SELECT}><option value="">— بدون</option>{branches.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>}
              </div>
              <div><label className={LABEL}>ملاحظات</label><input value={edit.notes || ""} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} className={INPUT} /></div>
              {num(edit.cost) > 0 && num(edit.useful_life_years) > 0 && (() => {
                const d = DB.depreciation({ cost: num(edit.cost), salvage_value: num(edit.salvage_value), useful_life_years: num(edit.useful_life_years), acquire_date: edit.acquire_date || today() }, asOf);
                return (
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-400 flex flex-wrap gap-x-4 gap-y-1">
                    <span>إهلاك سنوي: <span className="font-mono text-amber-400">{fmt(d.annual)}</span></span>
                    <span>شهري: <span className="font-mono text-amber-400">{fmt(d.monthly)}</span></span>
                    <span>مجمع حتى {asOf}: <span className="font-mono text-amber-300">{fmt(d.accumulated)}</span></span>
                    <span>القيمة الدفترية: <span className="font-mono text-emerald-400">{fmt(d.bookValue)}</span></span>
                  </div>
                );
              })()}
              <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={edit.is_active !== false} onChange={(e) => setEdit({ ...edit, is_active: e.target.checked })} className="w-4 h-4 accent-blue-500" /> نشط</label>
            </div>
            <div className="flex gap-2 justify-end mt-5">
              <button onClick={() => setEdit(null)} className={BTN_SOFT}><X size={14} /> إلغاء</button>
              <button onClick={save} disabled={busy} className={BTN_SUCCESS}><Save size={15} /> {busy ? "جارٍ…" : "حفظ"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════ الخزن والبنوك + سندات القبض/الصرف ══════════════
const PAY_METHODS = ["نقدًا", "تحويل بنكي", "شيك", "بطاقة", "أخرى"];

function TreasuryTab({ org, postable, accById, branches, branchName: _branchName }: any) {
  const multiBranch = branches && branches.length > 1;
  const [fBranch, setFBranch] = useState<string>("");
  const [treasuries, setTreasuries] = useState<DB.GLTreasury[]>([]);
  const [balances, setBalances] = useState<Record<number, number>>({});
  const [loadingT, setLoadingT] = useState(false);
  const [edit, setEdit] = useState<Partial<DB.GLTreasury> | null>(null);
  const [busy, setBusy] = useState(false);

  const [vouchers, setVouchers] = useState<EntryWithLines[]>([]);
  const [vKind, setVKind] = useState<"receipt" | "payment">("receipt");
  const [vTreasuryId, setVTreasuryId] = useState<string>("");
  const [vCounterId, setVCounterId] = useState<string>("");
  const [vAmount, setVAmount] = useState<string>("");
  const [vDate, setVDate] = useState<string>(today());
  const [vParty, setVParty] = useState<string>("");
  const [vMethod, setVMethod] = useState<string>("نقدًا");
  const [vDesc, setVDesc] = useState<string>("");
  const [vBranch, setVBranch] = useState<string>("");
  const [saving, setSaving] = useState(false);

  // مرفقات السند (إيصال تحويل/استلام)
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [attMap, setAttMap] = useState<Record<number, number>>({});
  const attRef = useRef<HTMLInputElement>(null);
  const addFiles = (files: FileList | null) => {
    if (!files || !files.length) return;
    const arr = Array.from(files);
    const tooBig = arr.find((f) => f.size > 10 * 1024 * 1024);
    if (tooBig) { alert("حجم الملف أكبر من 10 ميجابايت: " + tooBig.name); return; }
    setPendingFiles((p) => [...p, ...arr]);
  };
  const openVoucherAtts = async (entryId: number) => {
    const atts = await DB.fetchAttachments(entryId);
    if (!atts.length) { alert("لا توجد مرفقات لهذا السند."); return; }
    for (const a of atts) { const url = await DB.signedUrl(a.file_path); if (url) window.open(url, "_blank"); }
  };

  const reloadT = useCallback(async () => {
    setLoadingT(true);
    const ts = await DB.fetchTreasuries(org.id, fBranch ? Number(fBranch) : null);
    setTreasuries(ts);
    const bal: Record<number, number> = {};
    await Promise.all(ts.map(async (t) => {
      const net = t.account_id ? await DB.fetchAccountNet(org.id, t.account_id, fBranch ? Number(fBranch) : null) : 0;
      bal[t.id] = (Number(t.opening_balance) || 0) + net;
    }));
    setBalances(bal);
    setLoadingT(false);
  }, [org.id, fBranch]);

  const reloadV = useCallback(async () => {
    const es = await DB.fetchEntries(org.id, monthStart(), today(), fBranch ? Number(fBranch) : null);
    const vs = es.filter((e) => e.entry_type === "receipt" || e.entry_type === "payment");
    setVouchers(vs);
    setAttMap(await DB.countAttachments(vs.map((e) => e.id)));
  }, [org.id, fBranch]);

  useEffect(() => { reloadT(); reloadV(); }, [reloadT, reloadV]);

  const saveT = async () => {
    if (!edit) return;
    if (!edit.name || !String(edit.name).trim()) { alert("أدخل اسم الخزنة/البنك"); return; }
    const payload: any = {
      organization_id: org.id, branch_id: edit.branch_id ?? (fBranch ? Number(fBranch) : null),
      name: String(edit.name).trim(), kind: edit.kind || "cash", account_id: edit.account_id ?? null,
      opening_balance: num(edit.opening_balance), is_active: edit.is_active !== false,
    };
    if (edit.id) payload.id = edit.id;
    setBusy(true); const r = await DB.upsertTreasury(payload); setBusy(false);
    if (!r.ok) { alert("تعذّر الحفظ: " + (r.error || "")); return; }
    setEdit(null); await reloadT();
  };
  const delT = async (t: DB.GLTreasury) => {
    if (!window.confirm(`حذف «${t.name}»؟ (لن تُحذف القيود المرتبطة)`)) return;
    const r = await DB.deleteTreasury(t.id);
    if (!r.ok) { alert("تعذّر الحذف: " + (r.error || "")); return; }
    await reloadT();
  };

  const saveVoucher = async () => {
    const tr = treasuries.find((t) => t.id === Number(vTreasuryId));
    if (!tr) { alert("اختر الخزنة/البنك"); return; }
    if (!tr.account_id) { alert("هذه الخزنة غير مرتبطة بحساب في دليل الحسابات. عدّلها وحدّد الحساب أولًا."); return; }
    if (!vCounterId) { alert("اختر الحساب المقابل"); return; }
    const amt = num(vAmount);
    if (amt <= 0) { alert("أدخل مبلغًا صحيحًا"); return; }
    const party = vParty.trim();
    const desc = vDesc.trim() || ((vKind === "receipt" ? "سند قبض" : "سند صرف") + (party ? ` — ${party}` : ""));
    const notes = [vMethod, party ? `الطرف: ${party}` : ""].filter(Boolean).join(" · ") || null;
    setSaving(true);
    const r = await DB.createVoucher(org.id, {
      kind: vKind, date: vDate, treasury_account_id: tr.account_id!, counter_account_id: Number(vCounterId),
      amount: amt, description: desc, notes, branch_id: (vBranch ? Number(vBranch) : tr.branch_id) ?? null,
    });
    if (!r.ok) { setSaving(false); alert("تعذّر حفظ السند: " + (r.error || "")); return; }
    // رفع الإيصالات المرفقة على قيد السند
    if (r.id && pendingFiles.length) {
      for (const f of pendingFiles) {
        const up = await DB.uploadAttachment(org.id, r.id, f);
        if (!up.ok) alert(`تعذّر رفع «${f.name}»: ${up.error || ""}`);
      }
    }
    setSaving(false);
    setVAmount(""); setVParty(""); setVDesc(""); setVCounterId(""); setPendingFiles([]);
    await reloadT(); await reloadV();
    alert("✓ تم حفظ السند وترحيله للدفتر");
  };

  const delVoucher = async (id: number) => {
    if (!window.confirm("حذف هذا السند وقيده؟")) return;
    const r = await DB.deleteEntry(id);
    if (r.ok) { await reloadT(); await reloadV(); } else alert("تعذّر الحذف: " + (r.error || ""));
  };

  const treasuryAccIds = new Set(treasuries.map((t) => t.account_id).filter(Boolean) as number[]);
  const counterOptions = postable.filter((a: GLAccount) => !treasuryAccIds.has(a.id));
  const voucherAmount = (e: EntryWithLines) => (e.lines || []).reduce((s, l) => s + Number(l.debit || 0), 0);

  return (
    <div>
      {/* فلتر + إضافة خزنة */}
      <div className={`${CARD} p-3 mb-4`}>
        <div className="flex flex-wrap items-end gap-3">
          {multiBranch && <div><label className={LABEL}>الفرع</label><select value={fBranch} onChange={(e) => setFBranch(e.target.value)} className={SELECT}><option value="">كل الفروع</option>{branches.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>}
          <button onClick={() => setEdit({ kind: "cash", opening_balance: 0 as any, is_active: true })} className={BTN_GHOST_EM}><Plus size={14} /> خزنة / بنك جديد</button>
          <span className="text-[11px] text-slate-500 mr-auto">{treasuries.length} خزنة/بنك</span>
        </div>
      </div>

      {/* بطاقات الخزائن */}
      {treasuries.length === 0 ? (
        <div className={`${CARD} p-8 text-center text-slate-500 text-sm mb-4`}>{loadingT ? "جارٍ…" : "لا توجد خزائن/بنوك بعد. أضف واحدة واربطها بحساب من دليل الحسابات (مثل: الصندوق / البنك)."}</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
          {treasuries.map((t) => {
            const acc = t.account_id ? accById.get(t.account_id) : null;
            const bal = balances[t.id] ?? 0;
            return (
              <div key={t.id} className={`${CARD} p-4`}>
                <div className="flex items-center gap-2.5 mb-3">
                  <span className={`w-9 h-9 rounded-xl flex items-center justify-center ${t.kind === "bank" ? "bg-blue-500/10 text-blue-400" : "bg-emerald-500/10 text-emerald-400"}`}>{t.kind === "bank" ? <Landmark size={18} /> : <Wallet size={18} />}</span>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-white truncate">{t.name}{!t.is_active && <span className="text-[9px] text-red-400"> (موقوف)</span>}</div>
                    <div className="text-[10px] text-slate-500 truncate">{t.kind === "bank" ? "بنك" : "خزنة نقدية"}{acc ? ` · ${acc.code} ${acc.name}` : " · غير مرتبط بحساب"}</div>
                  </div>
                  <div className="mr-auto flex items-center gap-1">
                    <button onClick={() => setEdit({ ...t })} title="تعديل" className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-300 flex items-center justify-center hover:bg-blue-500/20"><Pencil size={13} /></button>
                    <button onClick={() => delT(t)} title="حذف" className="w-7 h-7 rounded-lg bg-red-500/10 text-red-400 flex items-center justify-center hover:bg-red-500/20"><Trash2 size={13} /></button>
                  </div>
                </div>
                <div className="text-[10px] text-slate-500 font-bold">الرصيد الحالي</div>
                <div className={`font-mono font-black text-xl [direction:ltr] ${bal >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmt(bal)} <span className="text-xs text-slate-500">ر.س</span></div>
              </div>
            );
          })}
        </div>
      )}

      {/* نموذج سند قبض/صرف */}
      <div className={`${CARD} p-4 mb-4`}>
        <div className="flex items-center gap-2.5 mb-4">
          <span className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400"><FileCheck2 size={16} /></span>
          <h2 className="text-sm font-bold text-white">سند قبض / صرف</h2>
        </div>

        <div className="inline-flex gap-1 bg-slate-950 border border-slate-800 rounded-xl p-1 mb-3">
          <button onClick={() => setVKind("receipt")} className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold transition-colors ${vKind === "receipt" ? "bg-emerald-500 text-emerald-950" : "text-slate-400 hover:text-slate-200"}`}><ArrowDownCircle size={15} /> سند قبض</button>
          <button onClick={() => setVKind("payment")} className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold transition-colors ${vKind === "payment" ? "bg-red-500 text-[#fff]" : "text-slate-400 hover:text-slate-200"}`}><ArrowUpCircle size={15} /> سند صرف</button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <div><label className={LABEL}>الخزنة / البنك</label><select value={vTreasuryId} onChange={(e) => setVTreasuryId(e.target.value)} className={SELECT}><option value="">— اختر</option>{treasuries.filter((t) => t.is_active).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
          <div><label className={LABEL}>{vKind === "receipt" ? "الحساب المقابل (المصدر)" : "الحساب المقابل (الجهة)"}</label><AccountPicker value={vCounterId ? Number(vCounterId) : ""} onChange={(v) => setVCounterId(v === "" ? "" : String(v))} options={counterOptions} size="md" /></div>
          <div><label className={LABEL}>المبلغ</label><input type="number" step="0.01" value={vAmount} onChange={(e) => setVAmount(e.target.value)} placeholder="0.00" className={INPUT + " [direction:ltr] text-center font-mono"} /></div>
          <div><label className={LABEL}>التاريخ</label><input type="date" value={vDate} onChange={(e) => setVDate(e.target.value)} className={DATE} /></div>
          <div><label className={LABEL}>الطرف (من/إلى)</label><input value={vParty} onChange={(e) => setVParty(e.target.value)} placeholder="اسم العميل/المورد…" className={INPUT} /></div>
          <div><label className={LABEL}>طريقة الدفع</label><select value={vMethod} onChange={(e) => setVMethod(e.target.value)} className={SELECT}>{PAY_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}</select></div>
          <div className={multiBranch ? "" : "lg:col-span-2"}><label className={LABEL}>البيان (اختياري)</label><input value={vDesc} onChange={(e) => setVDesc(e.target.value)} placeholder="وصف السند" className={INPUT} /></div>
          {multiBranch && <div><label className={LABEL}>مركز التكلفة (فرع)</label><select value={vBranch} onChange={(e) => setVBranch(e.target.value)} className={SELECT}><option value="">— افتراضي</option>{branches.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>}
        </div>

        {/* إرفاق إيصال (تحويل بنكي / استلام نقدي) */}
        <div className="mt-3">
          <label className={LABEL}>الإيصال / المرفق (صورة أو PDF، اختياري)</label>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => attRef.current?.click()} className={BTN_GHOST_BL}><Paperclip size={14} /> إرفاق إيصال</button>
            <input ref={attRef} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
          </div>
          {pendingFiles.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {pendingFiles.map((f, i) => (
                <div key={i} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs">
                  <Paperclip size={13} className="text-blue-400 shrink-0" />
                  <span className="text-blue-200 max-w-[170px] truncate">{f.name}</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-300 shrink-0">سيُرفع</span>
                  <button type="button" onClick={() => setPendingFiles((p) => p.filter((_, idx) => idx !== i))} title="إزالة" className="text-red-400 hover:text-red-300 shrink-0"><X size={13} /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 mt-4 flex-wrap">
          <p className="text-[11px] text-slate-500">{vKind === "receipt" ? "القيد: من ح/ الخزنة إلى ح/ الحساب المقابل" : "القيد: من ح/ الحساب المقابل إلى ح/ الخزنة"}</p>
          <button onClick={saveVoucher} disabled={saving} className={`mr-auto ${vKind === "receipt" ? BTN_SUCCESS : "inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-[#fff] font-extrabold text-sm transition-colors disabled:opacity-50"}`}><Check size={16} /> {saving ? "جارٍ…" : "حفظ وترحيل السند"}</button>
        </div>
      </div>

      {/* أحدث السندات */}
      <div className={`${CARD} overflow-hidden`}>
        <SectionHead icon={Wallet} title="أحدث السندات (هذا الشهر)" extra={<span className="text-[11px] text-slate-500">{vouchers.length} سند</span>} />
        {vouchers.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">لا توجد سندات هذا الشهر.</div>
        ) : (
          <div className="divide-y divide-slate-800">
            {vouchers.map((e) => {
              const isR = e.entry_type === "receipt";
              const amt = voucherAmount(e);
              return (
                <div key={e.id} className="flex items-center gap-2.5 flex-wrap px-4 py-2.5">
                  <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold ${isR ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>{isR ? <ArrowDownCircle size={11} /> : <ArrowUpCircle size={11} />}{isR ? "قبض" : "صرف"}</span>
                  <span className="font-mono text-xs text-slate-400 [direction:ltr]">{e.date}</span>
                  <span className="text-sm text-slate-200">{e.description || "—"}</span>
                  {e.notes ? <span className="text-[10px] text-slate-500">· {e.notes}</span> : null}
                  <span className={`mr-auto font-mono text-sm font-bold [direction:ltr] ${isR ? "text-emerald-400" : "text-red-400"}`}>{isR ? "+" : "−"}{fmt(amt)} ر.س</span>
                  {attMap[e.id] ? <button onClick={() => openVoucherAtts(e.id)} title="عرض الإيصال" className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300 hover:bg-blue-500/20"><Paperclip size={10} /> {attMap[e.id]}</button> : null}
                  <button onClick={() => delVoucher(e.id)} title="حذف" className="w-7 h-7 rounded-lg bg-red-500/10 text-red-400 flex items-center justify-center hover:bg-red-500/20"><Trash2 size={13} /></button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* نموذج تعديل الخزنة */}
      {edit && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" dir="rtl">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-5 shadow-2xl">
            <h3 className="text-white font-bold text-base mb-4">{edit.id ? "تعديل خزنة/بنك" : "خزنة/بنك جديد"}</h3>
            <div className="space-y-3">
              <div><label className={LABEL}>الاسم</label><input value={edit.name || ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="الصندوق الرئيسي / بنك الراجحي…" className={INPUT} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={LABEL}>النوع</label><select value={edit.kind || "cash"} onChange={(e) => setEdit({ ...edit, kind: e.target.value })} className={SELECT}><option value="cash">خزنة نقدية</option><option value="bank">بنك</option></select></div>
                <div><label className={LABEL}>رصيد افتتاحي</label><input type="number" step="0.01" value={(edit.opening_balance as any) ?? ""} onChange={(e) => setEdit({ ...edit, opening_balance: e.target.value as any })} className={INPUT + " [direction:ltr] text-center"} /></div>
              </div>
              <div><label className={LABEL}>الحساب المرتبط (من دليل الحسابات)</label><AccountPicker value={edit.account_id ?? ""} onChange={(v) => setEdit({ ...edit, account_id: v === "" ? null : v })} options={postable} placeholder="— بدون (لن تُرحّل سندات)" size="md" /><p className="text-[10px] text-slate-500 mt-1">اربطها عادةً بحساب الصندوق (1101) أو البنك (1102).</p></div>
              {multiBranch && <div><label className={LABEL}>الفرع</label><select value={edit.branch_id ?? ""} onChange={(e) => setEdit({ ...edit, branch_id: e.target.value ? Number(e.target.value) : null })} className={SELECT}><option value="">— بدون</option>{branches.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>}
              <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={edit.is_active !== false} onChange={(e) => setEdit({ ...edit, is_active: e.target.checked })} className="w-4 h-4 accent-blue-500" /> نشط</label>
            </div>
            <div className="flex gap-2 justify-end mt-5">
              <button onClick={() => setEdit(null)} className={BTN_SOFT}><X size={14} /> إلغاء</button>
              <button onClick={saveT} disabled={busy} className={BTN_SUCCESS}><Save size={15} /> {busy ? "جارٍ…" : "حفظ"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
