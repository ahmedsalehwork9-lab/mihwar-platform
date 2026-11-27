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
import {
  Home, ChevronLeft, Network, BookOpen, FileText, Scale,
  Plus, Trash2, Download, Save, Check, Search,
  Building2,
  Wallet, Landmark, ArrowDownCircle, Users, Printer,
  TrendingDown, TrendingUp, BarChart3, ShoppingCart,
  LayoutDashboard, RotateCcw,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../lib/supabase";
import * as DB from "../lib/accountingDb";
import TreasuryPage from "./treasury/TreasuryPage";
import ChartTab from "./chart/ChartTab";
import LedgerTab from "./ledger/LedgerTab";
import PartiesTab from "./parties/PartiesTab";
import StatementsTab from "./statements/StatementsTab";
import AssetsTab from "./assets/AssetsTab";
import { buildReportHTML, openPrint } from "./shared/printReport";
import { useLang } from "../../context/LanguageContext";
import JournalCenter from "./journal/JournalCenter";
import AccountingDashboard from "./dash/AccountingDashboard";
import { cashBankOptions } from "../lib/cashAccounts";
import type { GLAccount, GLLine, EntryWithLines, AccType } from "../lib/accountingDb";

const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 });
const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => new Date().toISOString().slice(0, 8) + "01";

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

type Tab = "dashboard" | "chart" | "opening" | "journal" | "sales" | "sales-returns" | "ledger" | "trial" | "statements" | "assets" | "treasury" | "parties";
const TYPE_OPTS: AccType[] = ["asset", "liability", "equity", "revenue", "expense"];
const TABS: { k: Tab; label: string; icon: any }[] = [
  { k: "dashboard", label: "لوحة التحكم", icon: LayoutDashboard },
  { k: "chart", label: "دليل الحسابات", icon: Network },
  { k: "opening", label: "الأرصدة الافتتاحية", icon: Landmark },
  { k: "journal", label: "القيود اليومية", icon: BookOpen },
  { k: "sales", label: "المبيعات", icon: ShoppingCart },
  { k: "sales-returns", label: "مرتجعات المبيعات", icon: RotateCcw },
  { k: "treasury", label: "الخزن والبنوك", icon: Wallet },
  { k: "parties", label: "العملاء والموردين", icon: Users },
  { k: "ledger", label: "كشف حساب", icon: FileText },
  { k: "trial", label: "ميزان المراجعة", icon: Scale },
  { k: "statements", label: "القوائم المالية", icon: BarChart3 },
  { k: "assets", label: "الأصول", icon: Building2 },
];

const TAB_EN: Record<Tab, string> = { dashboard: "Dashboard", chart: "Chart of Accounts", opening: "Opening Balances", journal: "Journal Entries", sales: "Sales", "sales-returns": "Sales Returns", treasury: "Treasury & Banks", parties: "Customers & Suppliers", ledger: "Account Statement", trial: "Trial Balance", statements: "Financial Statements", assets: "Assets" };

function SectionHead({ icon: Icon, title, extra }: { icon: any; title: string; extra?: any }) {
  return (
    <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2.5">
      <span className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400"><Icon size={16} /></span>
      <h2 className="text-sm font-bold text-white">{title}</h2>
      {extra && <div className="mr-auto">{extra}</div>}
    </div>
  );
}

// ── طباعة كشف الحساب بترويسة المؤسسة (اسم/رقم ضريبي/سجل تجاري/شعار) ──
function logoImg(url?: string | null) {
  return url
    ? `<img src="${url}" style="width:54px;height:54px;border-radius:10px;object-fit:cover;border:1px solid #e5e7eb;" />`
    : `<div style="width:54px;height:54px;border-radius:10px;background:#0f1b2b;color:#34d399;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:18px;">م</div>`;
}
type PrintRow = { date: string; no: string; acc?: string; desc: string; debit: number; credit: number; running: number };
function printStatement(shop: any, o: {
  heading: string; account: string; from?: string; to?: string;
  showAccountCol?: boolean; opening?: number | null;
  rows: PrintRow[]; totalDebit: number; totalCredit: number; finalBalance: number;
}) {
  const win = window.open("", "_blank");
  if (!win) { alert("فضلاً اسمح بالنوافذ المنبثقة لهذا الموقع لتفعيل الطباعة."); return; }
  const now = new Date().toLocaleString("ar-SA");
  const name = shop?.shop_name || "المؤسسة";
  const info: string[] = [];
  if (shop?.tax_number) info.push(`الرقم الضريبي: ${shop.tax_number}`);
  if (shop?.commercial_registration) info.push(`س.ت: ${shop.commercial_registration}`);
  if (shop?.phone) info.push(`هاتف: ${shop.phone}`);
  const period = (o.from && o.to) ? `الفترة: ${o.from} إلى ${o.to}` : (o.to ? `حتى: ${o.to}` : "");
  const th = ["التاريخ", "القيد", ...(o.showAccountCol ? ["الحساب"] : []), "البيان", "مدين", "دائن", "الرصيد"];
  const cell = "border:1px solid #e5e7eb;padding:4px 8px;font-size:11px;";
  const openRow = (o.opening != null)
    ? `<tr style="background:#f3f4f6;"><td colspan="${th.length - 1}" style="${cell}text-align:right;">رصيد افتتاحي</td><td style="${cell}text-align:center;font-weight:700;">${fmt(o.opening)}</td></tr>`
    : "";
  const body = o.rows.map((r) => `<tr>
    <td style="${cell}text-align:center;">${r.date || ""}</td>
    <td style="${cell}text-align:center;">${r.no}</td>
    ${o.showAccountCol ? `<td style="${cell}text-align:right;">${r.acc || ""}</td>` : ""}
    <td style="${cell}text-align:right;">${(r.desc || "—").replace(/</g, "&lt;")}</td>
    <td style="${cell}text-align:center;">${r.debit ? fmt(r.debit) : ""}</td>
    <td style="${cell}text-align:center;">${r.credit ? fmt(r.credit) : ""}</td>
    <td style="${cell}text-align:center;font-weight:700;">${fmt(r.running)}</td>
  </tr>`).join("");
  const html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>${o.heading} - ${name}</title>
<style>@page{size:A4;margin:14mm;} body{font-family:'Segoe UI',Tahoma,sans-serif;color:#111827;margin:0;} table{border-collapse:collapse;width:100%;}</style></head>
<body>
  <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #0f1b2b;padding-bottom:12px;margin-bottom:14px;">
    <div style="display:flex;align-items:center;gap:12px;">
      ${logoImg(shop?.logo_url)}
      <div><div style="font-size:19px;font-weight:800;">${name}</div><div style="font-size:11px;color:#6b7280;margin-top:3px;">${info.join(" · ")}</div></div>
    </div>
    <div style="text-align:left;">
      <div style="font-size:16px;font-weight:800;">${o.heading}</div>
      <div style="font-size:11px;color:#6b7280;">${o.account}</div>
      <div style="font-size:10px;color:#9ca3af;">${period}</div>
    </div>
  </div>
  <table>
    <thead><tr>${th.map((h) => `<th style="border:1px solid #d1d5db;background:#0f1b2b;color:#fff;padding:6px 8px;font-size:11px;">${h}</th>`).join("")}</tr></thead>
    <tbody>${openRow}${body}</tbody>
    <tfoot><tr style="background:#f3f4f6;font-weight:800;">
      <td colspan="${o.showAccountCol ? 3 : 2}" style="border:1px solid #d1d5db;padding:6px 8px;text-align:right;font-size:11px;">الإجمالي</td>
      <td style="border:1px solid #d1d5db;padding:6px 8px;text-align:center;font-size:11px;">${fmt(o.totalDebit)}</td>
      <td style="border:1px solid #d1d5db;padding:6px 8px;text-align:center;font-size:11px;">${fmt(o.totalCredit)}</td>
      <td style="border:1px solid #d1d5db;padding:6px 8px;text-align:center;font-size:12px;">${fmt(o.finalBalance)}</td>
    </tr></tfoot>
  </table>
  <div style="margin-top:18px;display:flex;justify-content:space-between;font-size:10px;color:#9ca3af;">
    <div>طُبع في: ${now}</div>
    <div>إعداد: المحاسب أحمد صالح / Prepared by: Accountant Ahmed Saleh</div>
  </div>
  <script>window.onload=function(){setTimeout(function(){window.print();},300);};</script>
</body></html>`;
  win.document.write(html); win.document.close();
}

// منتقي حساب قابل للبحث (بالاسم أو رقم الحساب) — يحل محل select الطويل
function AccountPicker({ value, onChange, options, placeholder = "— اختر حساب", size = "sm" }: {
  value: number | ""; onChange: (v: number | "") => void; options: GLAccount[]; placeholder?: string; size?: "sm" | "md";
}) {
  const { lang } = useLang(); const en = lang === "en";
  const nm = (a: GLAccount) => (en && a.name_en ? a.name_en : a.name);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const btnRef = useRef<HTMLButtonElement>(null);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const selected = options.find((a) => a.id === value);
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return options;
    return options.filter((a) => (a.code + " " + a.name + " " + (a.name_en || "")).toLowerCase().includes(s));
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
        <span className={`flex-1 truncate ${selected ? "" : "text-slate-500"}`}>{selected ? `${selected.code} - ${nm(selected)}` : placeholder}</span>
        <ChevronLeft size={12} className="text-slate-500 -rotate-90 shrink-0" />
      </button>
      {open && rect && (
        <div className="fixed inset-0 z-[95]" onClick={() => setOpen(false)}>
          <div className="absolute bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden" style={{ top: rect.top, left: rect.left, width: Math.max(rect.width, 240), maxWidth: "90vw" }} onClick={(e) => e.stopPropagation()} dir={en ? "ltr" : "rtl"}>
            <div className="flex items-center gap-2 px-2.5 py-2 border-b border-slate-800">
              <Search size={13} className="text-slate-500 shrink-0" />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (filtered[0]) pick(filtered[0].id); } else if (e.key === "Escape") setOpen(false); }} placeholder={en ? "Search by name or code…" : "ابحث بالاسم أو رقم الحساب…"} className="flex-1 bg-transparent text-white text-xs outline-none placeholder:text-slate-600" />
            </div>
            <div className="max-h-60 overflow-y-auto py-1">
              {placeholder && <button type="button" onClick={() => pick("")} className="w-full text-right px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-800/60">{placeholder}</button>}
              {filtered.length === 0 ? <div className="px-3 py-3 text-center text-slate-500 text-xs">{en ? "No results" : "لا نتائج"}</div> : (
                filtered.map((a) => (
                  <button key={a.id} type="button" onClick={() => pick(a.id)} className={`w-full flex items-center gap-2 px-3 py-1.5 text-right text-xs hover:bg-slate-800/60 ${a.id === value ? "bg-blue-500/10" : ""}`}>
                    <span className="font-mono text-slate-400 [direction:ltr] shrink-0">{a.code}</span>
                    <span className="flex-1 text-slate-200 truncate">{nm(a)}</span>
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

// حساب الذمة الفعلي لطرف: حسابه الخاص، وإلا حساب مركزه (الأب)
function resolvePartyAccount(p: DB.GLParty, all: DB.GLParty[]): number | null {
  if (p.account_id) return p.account_id;
  if (p.parent_id) { const parent = all.find((x) => x.id === p.parent_id); return parent?.account_id ?? null; }
  return null;
}

// منتقي طرف (عميل/مورد) قابل للبحث — يُستخدم في القيود والسندات
function PartyPicker({ parties, onPick, value, placeholder = "— اختر طرف", size = "md", compact = false }: {
  parties: DB.GLParty[]; onPick: (p: DB.GLParty) => void; value?: number | ""; placeholder?: string; size?: "sm" | "md"; compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const { lang: pl } = useLang(); const en = pl === "en";
  const [drill, setDrill] = useState<DB.GLParty | null>(null);   // المركز المفتوح لعرض فروعه
  const btnRef = useRef<HTMLButtonElement>(null);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const actives = useMemo(() => parties.filter((p) => p.is_active !== false), [parties]);
  const childrenOf = useMemo(() => {
    const m = new Map<number, DB.GLParty[]>();
    actives.forEach((p) => { if (p.parent_id != null) { if (!m.has(p.parent_id)) m.set(p.parent_id, []); m.get(p.parent_id)!.push(p); } });
    return m;
  }, [actives]);
  const topLevel = useMemo(() => actives.filter((p) => p.parent_id == null), [actives]);
  const searching = q.trim().length > 0;
  const searchResults = useMemo(() => {
    const s = q.trim().toLowerCase();
    return actives.filter((p) => (p.name + " " + (p.phone || "")).toLowerCase().includes(s));
  }, [q, actives]);
  const selected = value ? parties.find((p) => p.id === value) : null;
  const openIt = () => { const r = btnRef.current?.getBoundingClientRect(); if (r) setRect({ top: r.bottom + 4, left: r.left, width: r.width }); setQ(""); setDrill(null); setOpen(true); };
  const pick = (p: DB.GLParty) => { onPick(p); setOpen(false); };
  const nameOf = (id: number | null) => (id == null ? "" : parties.find((x) => x.id === id)?.name || "");
  const leaf = (p: DB.GLParty, hint: string) => (
    <button key={p.id} type="button" onClick={() => pick(p)} className={`w-full flex items-center gap-2 px-3 py-1.5 text-right text-xs hover:bg-slate-800/60 ${p.id === value ? "bg-blue-500/10" : ""}`}>
      <span className="flex-1 text-slate-200 truncate">{p.name}</span>
      <span className="text-[9px] text-slate-500">{hint}</span>
    </button>
  );
  return (
    <>
      {compact ? (
        <button ref={btnRef} type="button" onClick={openIt} title={en ? "Pick customer/supplier" : "اختيار عميل/مورد"} className="w-8 h-8 shrink-0 rounded-lg bg-blue-500/10 text-blue-300 flex items-center justify-center hover:bg-blue-500/20"><Users size={14} /></button>
      ) : (
        <button ref={btnRef} type="button" onClick={openIt} className={(size === "sm" ? "w-full bg-slate-950 border border-slate-700 rounded-lg text-white px-2 py-1.5 text-xs" : "w-full bg-slate-950 border border-slate-700 rounded-xl text-white px-3 py-2 text-sm") + " outline-none focus:border-blue-500 text-right flex items-center gap-1"}>
          <span className={`flex-1 truncate ${selected ? "" : "text-slate-500"}`}>{selected ? selected.name : placeholder}</span>
          <ChevronLeft size={12} className="text-slate-500 -rotate-90 shrink-0" />
        </button>
      )}
      {open && rect && (
        <div className="fixed inset-0 z-[95]" onClick={() => setOpen(false)}>
          <div className="absolute bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden" style={{ top: rect.top, left: compact ? Math.max(8, rect.left - 220) : rect.left, width: compact ? 270 : Math.max(rect.width, 250), maxWidth: "90vw" }} onClick={(e) => e.stopPropagation()} dir="rtl">
            <div className="flex items-center gap-2 px-2.5 py-2 border-b border-slate-800">
              <Search size={13} className="text-slate-500 shrink-0" />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (searchResults[0]) pick(searchResults[0]); } else if (e.key === "Escape") setOpen(false); }} placeholder={en ? "Search name, phone or tax no…" : "ابحث بالاسم أو الجوال أو الرقم الضريبي…"} className="flex-1 bg-transparent text-white text-xs outline-none placeholder:text-slate-600" />
            </div>
            <div className="max-h-60 overflow-y-auto py-1">
              {searching ? (
                searchResults.length === 0
                  ? <div className="px-3 py-3 text-center text-slate-500 text-xs">{en ? "No results — add the party in Customers & Suppliers" : "لا نتائج — أضِف الطرف من «العملاء والموردين»"}</div>
                  : searchResults.map((p) => (
                      <button key={p.id} type="button" onClick={() => pick(p)} className={`w-full flex items-center gap-2 px-3 py-1.5 text-right text-xs hover:bg-slate-800/60 ${p.id === value ? "bg-blue-500/10" : ""}`}>
                        <span className="flex-1 text-slate-200 truncate">{p.name}</span>
                        <span className="text-[9px] text-slate-500">{p.type === "customer" ? (en ? "Customer" : "عميل") : (en ? "Supplier" : "مورد")}</span>
                        {p.parent_id != null && <span className="text-[9px] text-blue-300/70 truncate">{en ? "Under" : "تحت"} {nameOf(p.parent_id)}</span>}
                      </button>
                    ))
              ) : drill ? (
                <>
                  <button type="button" onClick={() => setDrill(null)} className="w-full flex items-center gap-1 px-3 py-1.5 text-right text-[11px] text-blue-300 hover:bg-slate-800/60 border-b border-slate-800"><ChevronLeft size={12} /> {en ? "Back to all" : "رجوع للكل"}</button>
                  <div className="px-3 py-1 text-[9px] text-slate-500">فروع {drill.name}</div>
                  {drill.account_id ? leaf(drill, "المركز نفسه") : null}
                  {(childrenOf.get(drill.id) || []).map((c) => leaf(c, "فرعي"))}
                  {(childrenOf.get(drill.id) || []).length === 0 && !drill.account_id && <div className="px-3 py-3 text-center text-slate-500 text-xs">لا فروع</div>}
                </>
              ) : (
                topLevel.length === 0
                  ? <div className="px-3 py-3 text-center text-slate-500 text-xs">لا عملاء/موردين — أضِفهم من «العملاء والموردين»</div>
                  : topLevel.map((p) => {
                      const kids = childrenOf.get(p.id) || [];
                      return kids.length > 0 ? (
                        <button key={p.id} type="button" onClick={() => setDrill(p)} className="w-full flex items-center gap-2 px-3 py-1.5 text-right text-xs hover:bg-slate-800/60">
                          <Users size={12} className="text-blue-400/70 shrink-0" />
                          <span className="flex-1 text-slate-200 truncate font-medium">{p.name}</span>
                          <span className="text-[9px] text-slate-500">{kids.length} فرعي</span>
                          <ChevronLeft size={12} className="text-slate-500 shrink-0" />
                        </button>
                      ) : leaf(p, p.type === "customer" ? "عميل" : "مورد");
                    })
              )}
            </div>
            {!searching && !drill && <div className="px-3 py-1.5 text-[9px] text-slate-500 border-t border-slate-800">اختر المركز لعرض فروعه · أو ابحث بالاسم مباشرة</div>}
          </div>
        </div>
      )}
    </>
  );
}

export default function AccountingPage({ section, onSection, onNavigate }: { section?: string; onSection?: (s: string) => void; onNavigate?: (p: string) => void } = {}) {
  const { ownedShopId, branches, isAdmin: isAdminFlag } = (useAuth() as any) ?? {};
  const { t: tr, lang: uiLang, isRTL: uiRTL } = useLang();
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

  // بيانات المؤسسة/الفرع للطباعة (اسم/شعار/رقم ضريبي/سجل تجاري)
  const [shopInfo, setShopInfo] = useState<any>(null);
  useEffect(() => {
    if (!ownedShopId) { setShopInfo(null); return; }
    supabase.from("shops").select("id, shop_name, logo_url, commercial_registration, phone, address").eq("id", ownedShopId).single()
      .then(({ data }) => setShopInfo(data || null));
  }, [ownedShopId]);

  // قائمة الأطراف (عملاء/موردين) — لاختيارها داخل القيود والسندات
  const [parties, setParties] = useState<DB.GLParty[]>([]);
  useEffect(() => { if (org) DB.fetchParties(org.id).then(setParties); }, [org]);
  const refreshParties = useCallback(async () => { if (org) setParties(await DB.fetchParties(org.id)); }, [org]);

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

  // «الخزن والبنوك»: صفحة مستقلة ثنائية اللغة (ترويستها ومسار تنقّلها داخلها)
  if (tab === "treasury") {
    return (
      <div className="p-4 lg:p-6 min-h-screen">
        <TreasuryPage org={org} postable={postable} accById={accById} branches={branches || []} parties={parties} shop={shopInfo} />
      </div>
    );
  }

  const activeTab = TABS.find((t) => t.k === tab)!;
  const ActiveIcon = activeTab.icon;
  const tabLabel = uiLang === "en" ? TAB_EN[activeTab.k] : activeTab.label;
  const shellDir = tab === "chart" && !uiRTL ? "ltr" : "rtl"; // صفحات الحسابات الأخرى ما زالت عربية فقط (مراحل لاحقة)

  return (
    <div className="p-4 lg:p-6 min-h-screen" dir={shellDir}>
      {/* مسار التنقّل */}
      <nav className="flex items-center gap-1.5 text-[11px] text-slate-500 mb-3 flex-wrap">
        <span className="inline-flex items-center gap-1"><Home size={12} /> {tr("Home", "الرئيسية")}</span>
        <ChevronLeft size={12} className="opacity-60" />
        <span className="text-slate-400 font-bold">{tab === "sales" || tab === "sales-returns" ? tr("Sales", "المبيعات") : tr("Accounting", "الحسابات")}</span>
        <ChevronLeft size={12} className="opacity-60" />
        <span className="text-blue-400 font-bold">{tabLabel}</span>
      </nav>

      {/* الترويسة — تعكس القسم النشط (التنقّل من الشريط الجانبي) */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
        <div className="flex items-center gap-3">
          <span className="w-11 h-11 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-400"><ActiveIcon size={22} /></span>
          <div>
            <h1 className="text-2xl font-black text-white leading-tight">{tabLabel}</h1>
            <p className="text-slate-500 text-xs mt-0.5">{tab === "sales-returns" ? "مرتجعات المبيعات — تُرحَّل للدفتر وتُرجع الكميات للمخزون" : tab === "sales" ? "إدارة المبيعات والفواتير — مرحّلة للدفتر تلقائيًا" : tr("Accounting — one ledger at organization level", "الحسابات — دفتر موحّد على مستوى المؤسسة")}</p>
          </div>
        </div>
        <div className="inline-flex items-center gap-2.5 bg-slate-900 border border-slate-800 rounded-xl px-4 py-2">
          <Building2 size={16} className="text-slate-500" />
          <div>
            <div className="text-[10px] text-slate-500 font-bold">{tr("Organization", "المؤسسة")}</div>
            <div className="text-sm font-bold text-white">{org.name}</div>
          </div>
        </div>
      </div>

      {tab === "dashboard" && <AccountingDashboard org={org} accounts={accounts} parties={parties} branches={branches || []} onSection={(k: string) => setTab(k as Tab)} onNavigate={onNavigate} />}
      {tab === "chart" && <ChartTab org={org} shop={shopInfo} accounts={accounts} reload={reloadAccounts} busy={busy} setBusy={setBusy} />}
      {tab === "opening" && <OpeningTab org={org} accounts={accounts} postable={postable} branches={branches} />}
      {tab === "journal" && <JournalCenter org={org} postable={postable} accById={accById} branches={branches || []} branchName={(id: number) => branchName(id)} parties={parties} ui={{ AccountPicker, PartyPicker, resolvePartyAccount }} onSection={onSection ? (k: string) => setTab(k as Tab) : undefined} shopInfo={shopInfo} isAdmin={!!isAdminFlag} />}
      {tab === "sales-returns" && <SalesTab returnsMode org={org} postable={postable} accById={accById} branches={branches} branchName={branchName} parties={parties} onPartiesChange={refreshParties} shop={shopInfo} onNavigate={onNavigate} />}
      {tab === "sales" && <SalesTab org={org} postable={postable} accById={accById} branches={branches} branchName={branchName} parties={parties} onPartiesChange={refreshParties} shop={shopInfo} onNavigate={onNavigate} />}
      {tab === "ledger" && <LedgerTab org={org} accounts={accounts} branches={branches} shop={shopInfo} parties={parties} printStatement={printStatement} />}
      {tab === "trial" && <TrialTab shop={shopInfo} org={org} accById={accById} postable={postable} branches={branches} />}
      {tab === "statements" && <StatementsTab org={org} accounts={accounts} branches={branches} shop={shopInfo} />}
      {tab === "assets" && <AssetsTab org={org} accounts={accounts} postable={postable} branches={branches} shop={shopInfo} />}
      {tab === "parties" && <PartiesTab org={org} accounts={accounts} postable={postable} accById={accById} branches={branches} shop={shopInfo} printStatement={printStatement} />}
    </div>
  );
}

// ══════════════ القيود اليومية ══════════════

// ══════════════ لوحة التحكم المحاسبية ══════════════

// ══════════════ ميزان المراجعة ══════════════
function TrialTab({ org, shop, accById, branches }: any) {
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

  const printTrial = () => {
    const ok = openPrint(buildReportHTML({
      title: "ميزان المراجعة", subtitle: `${from} إلى ${to}`, orgName: shop?.shop_name || org.name, taxNumber: shop?.tax_number, logoUrl: shop?.logo_url, address: shop?.address, dir: "rtl", lang: "ar",
      cols: [{ label: "الكود", mono: true }, { label: "الحساب" }, { label: "مدين", align: "end" }, { label: "دائن", align: "end" }, { label: "الرصيد", align: "end" }],
      rows: rows.map((r) => [r.code, r.name, r.debit, r.credit, r.debit - r.credit]), totals: ["الإجمالي", "", totD, totC, totD - totC],
    }));
    if (!ok) alert("فعّل النوافذ المنبثقة للطباعة.");
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
          <button onClick={printTrial} disabled={!rows.length} data-testid="trial-print" className={BTN_GHOST_EM}><Printer size={14} /> طباعة</button>
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

// ══════════════ الأرصدة الافتتاحية ══════════════
function OpeningTab({ org, accounts, postable, branches }: any) {
  const multiBranch = branches && branches.length > 1;
  const [date, setDate] = useState(`${new Date().getFullYear() - 1}-12-31`);
  const [fBranch, setFBranch] = useState<string>("");
  const [balances, setBalances] = useState<Record<number, string>>({});
  const [balAcc, setBalAcc] = useState<number | "">("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [existing, setExisting] = useState(false);

  const natureById = useMemo(() => new Map(accounts.map((a: GLAccount) => [a.id, DB.natureOf(a.type)] as const)), [accounts]);

  // قيمة المخزون الفعلية من وحدة المخزون (الكمية × التكلفة) — صفحة المخزون لا تُنشئ قيودًا، فلا تظهر في الميزانية إلا عبر حساب المخزون.
  const { ownedShopId: ownShop } = (useAuth() as any) ?? {};
  const [stock, setStock] = useState<{ value: number; items: number } | null>(null);
  const invAcc = useMemo(() => postable.find((x: GLAccount) => x.code === "1104") ?? postable.find((x: GLAccount) => x.type === "asset" && /مخزون|inventory/i.test(x.name)), [postable]);
  useEffect(() => {
    let off = false;
    (async () => {
      const ids = Array.from(new Set([...(branches || []).map((b: any) => Number(b.id)), ...(ownShop ? [Number(ownShop)] : [])].filter((n) => Number.isFinite(n))));
      if (!ids.length) { setStock({ value: 0, items: 0 }); return; }
      let value = 0, items = 0;
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from("products").select("id,quantity,price").in("shop_id", ids).order("id").range(from, from + 999);
        if (error || off) { if (!off) setStock(null); return; }
        const rows = (data as any[]) || [];
        rows.forEach((r) => { const q = Number(r.quantity) || 0; if (q > 0) { value += q * (Number(r.price) || 0); items++; } });
        if (rows.length < 1000) break;
      }
      if (!off) setStock({ value: Math.round(value * 100) / 100, items });
    })();
    return () => { off = true; };
  }, [branches, ownShop]);

  const load = useCallback(async () => {
    setLoading(true);
    const entries = await DB.fetchOpeningEntries(org.id);
    const b: Record<number, string> = {}; let d = "";
    entries.forEach((e: EntryWithLines) => {
      if (!d) d = e.date;
      (e.lines || []).forEach((l) => {
        const amt = (Number(l.debit) || 0) > 0 ? Number(l.debit) : Number(l.credit) || 0;
        if (amt) b[l.account_id] = String(amt);
      });
    });
    setBalances(b); setExisting(entries.length > 0);
    if (d) setDate(d);
    setLoading(false);
  }, [org.id]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (balAcc === "") { const eq = accounts.find((a: GLAccount) => a.type === "equity" && !a.is_group); if (eq) setBalAcc(eq.id); }
  }, [accounts]); // eslint-disable-line

  const totals = useMemo(() => {
    let D = 0, C = 0;
    postable.forEach((a: GLAccount) => {
      const amt = Number(balances[a.id]) || 0; if (!amt) return;
      if (DB.natureOf(a.type) === "debit") D += amt; else C += amt;
    });
    D = Math.round(D * 100) / 100; C = Math.round(C * 100) / 100;
    return { D, C, diff: Math.round((D - C) * 100) / 100 };
  }, [balances, postable]);

  const save = async () => {
    if (totals.D === 0 && totals.C === 0) { alert("أدخل رصيدًا افتتاحيًا واحدًا على الأقل."); return; }
    if (Math.abs(totals.diff) > 0.009 && balAcc === "") { alert(`هناك فرق ${fmt(totals.diff)}. اختر «حساب الموازنة» ليُقفَل فيه الفرق، أو عدّل الأرصدة لتتوازن.`); return; }
    if (existing && !window.confirm("يوجد قيد افتتاحي سابق — سيُستبدل بالكامل بهذه الأرصدة. متابعة؟")) return;
    setSaving(true);
    const arr = postable.filter((a: GLAccount) => Number(balances[a.id])).map((a: GLAccount) => ({ accountId: a.id, amount: Number(balances[a.id]) }));
    const res = await DB.saveOpeningBalances(org.id, { date, branch_id: fBranch ? Number(fBranch) : null, balancingAccountId: balAcc === "" ? 0 : Number(balAcc), natureById, balances: arr });
    setSaving(false);
    if (!res.ok) { alert("تعذّر الحفظ: " + (res.error || "")); return; }
    alert("تم حفظ الأرصدة الافتتاحية" + (res.plug && Math.abs(res.plug) > 0.009 ? ` — أُقفل فرق ${fmt(res.plug)} في حساب الموازنة` : "") + ".");
    await load();
  };

  const bySide = (t: AccType) => DB.natureOf(t) === "debit" ? "مدين" : "دائن";
  const balanced = Math.abs(totals.diff) < 0.009;

  return (
    <div>
      <div className={`${CARD} p-3 mb-4`}>
        <div className="flex flex-wrap items-end gap-3">
          <div><label className={LABEL}>تاريخ القيد الافتتاحي</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={DATE} /></div>
          {multiBranch && <div><label className={LABEL}>الفرع</label><select value={fBranch} onChange={(e) => setFBranch(e.target.value)} className={SELECT}><option value="">المؤسسة (بدون فرع)</option>{branches.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>}
          <div className="min-w-[200px]"><label className={LABEL}>حساب الموازنة (للفرق)</label><AccountPicker value={balAcc} onChange={(v) => setBalAcc(v === "" ? "" : v)} options={postable} placeholder="— رأس المال عادةً" size="md" /></div>
          <button onClick={save} disabled={saving || loading} className={BTN_SUCCESS}><Save size={15} /> {saving ? "جارٍ…" : "حفظ الأرصدة"}</button>
          <div className="mr-auto text-left">
            <div className="text-[10px] text-slate-500">مدين {fmt(totals.D)} · دائن {fmt(totals.C)}</div>
            <div className={`text-xs font-bold ${balanced ? "text-emerald-400" : "text-amber-400"}`}>{balanced ? "✓ متوازن" : `فرق سيُقفَل في الموازنة: ${fmt(totals.diff)}`}</div>
          </div>
        </div>
        {invAcc && stock && stock.value > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2" data-testid="open-stock-hint">
            <p className="text-[11px] text-amber-200 flex-1 min-w-[220px]">
              قيمة المخزون في وحدة المخزون: <b className="[direction:ltr] inline-block">{fmt(stock.value)}</b> ({stock.items} صنف بالتكلفة). صفحة المخزون لا تُنشئ قيودًا محاسبية، لذلك لا تظهر في الميزانية إلا إذا سُجّلت في حساب «{invAcc.name}» ({invAcc.code}).
              {Number(balances[invAcc.id]) === stock.value ? " ✓ مطابقة لما هو مُدخل." : Number(balances[invAcc.id]) ? ` المُدخل حاليًا ${fmt(Number(balances[invAcc.id]))}.` : ""}
              {" "}لا تستخدمها إن كانت مشتريات المخزون مُسجّلة محاسبيًا فعلًا (تفاديًا للازدواج).
            </p>
            <button type="button" data-testid="open-stock-fill" onClick={() => setBalances((p) => ({ ...p, [invAcc.id]: String(stock.value) }))} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500/20 border border-amber-500/40 text-amber-100 hover:bg-amber-500/30">
              تعبئة حساب المخزون بهذه القيمة
            </button>
          </div>
        )}
        {existing && <p className="text-[11px] text-blue-300/80 mt-2">يوجد قيد افتتاحي محفوظ — القيم معبّأة أدناه. التعديل والحفظ يستبدلانه بالكامل (لا ازدواج).</p>}
      </div>

      {TYPE_OPTS.map((t) => {
        const list = postable.filter((a: GLAccount) => a.type === t);
        if (!list.length) return null;
        return (
          <div key={t} className={`${CARD} overflow-hidden mb-4`}>
            <div className="px-4 py-2.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <span className="text-sm font-bold text-slate-200">{DB.TYPE_LABEL[t]}</span>
              <span className="text-[10px] text-slate-500">الرصيد الطبيعي: {bySide(t)}</span>
            </div>
            <div className="divide-y divide-slate-800/60">
              {list.map((a: GLAccount) => (
                <div key={a.id} className="flex items-center gap-3 px-4 py-2">
                  <span className="text-[10px] font-mono text-slate-500 [direction:ltr] w-20 shrink-0">{a.code}</span>
                  <span className="flex-1 text-xs text-slate-300 truncate">{a.name}</span>
                  <input type="number" step="0.01" inputMode="decimal" value={balances[a.id] ?? ""} onChange={(e) => setBalances((p) => ({ ...p, [a.id]: e.target.value }))} placeholder="0.00"
                    className="w-36 bg-slate-950 border border-slate-700 rounded-lg text-white px-3 py-1.5 text-xs text-center [direction:ltr] outline-none focus:border-blue-500" />
                </div>
              ))}
            </div>
          </div>
        );
      })}
      {postable.length === 0 && <div className={`${CARD} p-8 text-center text-slate-500 text-sm`}>لا توجد حسابات. أنشئ دليل الحسابات أولًا من «دليل الحسابات».</div>}
    </div>
  );
}

// رسوم SVG خفيفة بلا مكتبات
const CHART_PALETTE = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#06b6d4", "#ec4899"];
// ══════════════ فواتير المبيعات (نقدي/آجل/جزئي + ضريبة) ══════════════
function SalesTab({ org, postable, accById, branches, branchName, parties, shop, onNavigate, returnsMode = false }: any) {
  const multiBranch = branches && branches.length > 1;
  const [from, setFrom] = useState(returnsMode ? new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10) : monthStart()); // المرتجع قد يخص فاتورة أقدم من الشهر الحالي
  const [to, setTo] = useState(today());
  const [fBranch, setFBranch] = useState<string>("");
  const [invoices, setInvoices] = useState<DB.GLSalesInvoice[]>([]);
  const [loading, setLoading] = useState(false);

  const [showReturnForm, setShowReturnForm] = useState(false);
  const [branch] = useState<string>(branches?.length === 1 ? String(branches[0].id) : "");
  const [treasuryRows, setTreasuryRows] = useState<DB.GLTreasury[]>([]);

  const reload = useCallback(async () => {
    setLoading(true);
    setInvoices(await DB.fetchSalesInvoices(org.id, from, to, fBranch ? Number(fBranch) : null));
    setLoading(false);
  }, [org.id, from, to, fBranch]);
  useEffect(() => { reload(); }, [reload]);
  useEffect(() => { DB.fetchTreasuries(org.id).then(setTreasuryRows); }, [org.id]);
  const targetBranchId = branch ? Number(branch) : (fBranch ? Number(fBranch) : (branches?.length === 1 ? Number(branches[0].id) : null));
  // الحساب التجميعي لا يظهر؛ الصندوق/البنك غير التجميعي يظهر (مربوطًا بخزنة أو لا).
  const treasuryAccounts = (() => { const ids = new Set(cashBankOptions(postable, treasuryRows.filter((t) => t.branch_id == null || targetBranchId == null || t.branch_id === targetBranchId)).map((o) => o.id)); return postable.filter((a: GLAccount) => ids.has(a.id)); })();

  // لا نختار حسابات الإيراد أو ضريبة المخرجات تلقائيًا؛ يلزم اعتماد الحساب الصحيح لكل فرع.




  const del = async (inv: DB.GLSalesInvoice) => {
    if (!window.confirm(`حذف الفاتورة رقم ${inv.invoice_no}؟ سيُحذف قيدها المحاسبي أيضًا.`)) return;
    const r = await DB.deleteSalesInvoice(inv);
    if (!r.ok) { alert("تعذّر الحذف: " + (r.error || "")); return; }
    await reload();
  };

  const partyName = (id: number | null) => (id == null ? "" : parties.find((p: DB.GLParty) => p.id === id)?.name || "");
  const invCustomer = (inv: DB.GLSalesInvoice) => inv.customer_name || partyName(inv.party_id) || "عميل نقدي";

  const printInv = (inv: DB.GLSalesInvoice) => {
    const orgName = shop?.shop_name || org.name;
    const rows = (inv.items || []).map((it, i) => `<tr><td style="border:1px solid #e5e7eb;padding:5px 8px;text-align:center">${i + 1}</td><td style="border:1px solid #e5e7eb;padding:5px 8px;text-align:right">${it.description || "—"}</td><td style="border:1px solid #e5e7eb;padding:5px 8px;text-align:center;direction:ltr">${it.qty}</td><td style="border:1px solid #e5e7eb;padding:5px 8px;text-align:center;direction:ltr">${fmt(it.unit_price)}</td><td style="border:1px solid #e5e7eb;padding:5px 8px;text-align:left;direction:ltr">${fmt(it.line_total)}</td></tr>`).join("");
    const logo = shop?.logo_url ? `<img src="${shop.logo_url}" style="height:54px;object-fit:contain"/>` : "";
    const vat = shop?.tax_number ? `<div>الرقم الضريبي: ${shop.tax_number}</div>` : "";
    const trow = (label: string, val: string, bold = false) => `<tr><td style="padding:3px 8px;text-align:right;${bold ? "font-weight:800" : ""}">${label}</td><td style="padding:3px 8px;text-align:left;direction:ltr;${bold ? "font-weight:800" : ""}">${val}</td></tr>`;
    const html = `<html dir="rtl"><head><meta charset="UTF-8"><title>فاتورة ${inv.invoice_no}</title></head><body style="font-family:'Segoe UI',Tahoma,sans-serif;padding:24px;color:#0f172a">
      <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #14304d;padding-bottom:10px;margin-bottom:12px">
        <div><div style="font-size:19px;font-weight:800">${orgName}</div>${vat}</div>${logo}
      </div>
      <h2 style="font-size:16px;margin:0 0 4px">فاتورة ضريبية — مبيعات</h2>
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:10px">
        <div>رقم الفاتورة: <b>${inv.invoice_no}</b> · التاريخ: ${inv.date}</div>
        <div>العميل: <b>${invCustomer(inv)}</b> · ${DB.PAYTYPE_LABEL[inv.payment_type]}</div>
      </div>
      <table style="border-collapse:collapse;width:100%;font-size:12px;margin-bottom:10px">
        <tr>${["#", "الصنف", "الكمية", "السعر", "الإجمالي"].map((h) => `<th style="border:1px solid #d1d5db;padding:6px 8px;background:#14304d;color:#fff">${h}</th>`).join("")}</tr>${rows}
      </table>
      <table style="margin-right:auto;font-size:12px;min-width:240px">
        ${trow("الإجمالي قبل الضريبة", fmt(inv.subtotal))}
        ${trow(`الضريبة (${inv.tax_rate}%)`, fmt(inv.tax_amount))}
        ${trow("الإجمالي", fmt(inv.total), true)}
        ${trow("المدفوع", fmt(inv.paid_amount))}
        ${trow("المتبقي", fmt(inv.total - inv.paid_amount), true)}
      </table>
      <div style="margin-top:22px;font-size:11px;color:#64748b;display:flex;justify-content:space-between">
        <span>إعداد: المحاسب أحمد صالح / Prepared by: Accountant Ahmed Saleh</span><span>واتساب: +966 55 930 1659</span>
      </div>
    </body></html>`;
    const w = window.open("", "_blank"); if (!w) { alert("فعّل النوافذ المنبثقة للطباعة."); return; }
    w.document.write(html); w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
  };

  const tTotal = invoices.reduce((s, i) => s + (Number(i.total) || 0), 0);
  const tPaid = invoices.reduce((s, i) => s + (Number(i.paid_amount) || 0), 0);
  const tDue = tTotal - tPaid;
  const tTax = invoices.reduce((s, i) => s + (Number(i.tax_amount) || 0), 0);

  // المرتجعات (لحساب الحالة ومؤشّر المرتجعات)
  const [returns, setReturns] = useState<DB.GLSalesReturn[]>([]);
  useEffect(() => { DB.fetchSalesReturns(org.id).then(setReturns); }, [org.id, invoices.length]);
  const tReturns = useMemo(() => returns.filter((r) => r.date >= from && r.date <= to && (!fBranch || r.branch_id === Number(fBranch))).reduce((s, r) => s + (Number(r.total) || 0), 0), [returns, from, to, fBranch]);
  const returnedByInvoice = useMemo(() => { const m = new Map<number, number>(); returns.forEach((r) => { if (r.original_invoice_id) m.set(r.original_invoice_id, (m.get(r.original_invoice_id) || 0) + (Number(r.total) || 0)); }); return m; }, [returns]);
  const invStatus = (inv: DB.GLSalesInvoice): { label: string; cls: string } => {
    const ret = returnedByInvoice.get(inv.id) || 0; const tot = Number(inv.total) || 0;
    if (ret > 0 && ret >= tot - 0.009) return { label: "مرتجعة بالكامل", cls: "bg-red-500/15 text-red-300" };
    if (ret > 0) return { label: "مرتجعة جزئيًا", cls: "bg-orange-500/15 text-orange-300" };
    const due = tot - (Number(inv.paid_amount) || 0);
    if ((inv.payment_type === "credit" || inv.payment_type === "partial") && due > 0.009) return { label: "آجلة", cls: "bg-amber-500/15 text-amber-300" };
    if (due > 0.009) return { label: "مدفوعة جزئيًا", cls: "bg-blue-500/15 text-blue-300" };
    return { label: "مدفوعة", cls: "bg-emerald-500/15 text-emerald-300" };
  };
  const srcLabel = (inv: DB.GLSalesInvoice) => ((inv as any).source === "pos" ? "POS" : "يدوي");

  // تجميعات اللوحة
  const byBranchData = useMemo(() => {
    const m = new Map<string, number>();
    invoices.forEach((inv) => { const key = inv.branch_id != null ? branchName(inv.branch_id) : "المؤسسة"; m.set(key, (m.get(key) || 0) + (Number(inv.total) || 0)); });
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([label, value], i) => ({ label, value, color: CHART_PALETTE[i % CHART_PALETTE.length] }));
  }, [invoices]); // eslint-disable-line
  const byDayData = useMemo(() => {
    const m = new Map<string, number>();
    invoices.forEach((inv) => m.set(inv.date, (m.get(inv.date) || 0) + (Number(inv.total) || 0)));
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([label, value]) => ({ label, value }));
  }, [invoices]);

  return (
    <div>
      <div className={`${CARD} p-3 mb-4`}>
        <div className="flex flex-wrap items-end gap-3">
          <div><label className={LABEL}>من</label><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={DATE} /></div>
          <div><label className={LABEL}>إلى</label><input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={DATE} /></div>
          {multiBranch && <div><label className={LABEL}>الفرع</label><select value={fBranch} onChange={(e) => setFBranch(e.target.value)} className={SELECT}><option value="">كل الفروع</option>{branches.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>}
          {!returnsMode && <button onClick={() => onNavigate?.("sales-invoice")} className={BTN_GHOST_EM}><Plus size={14} /> فاتورة جديدة</button>}
          <button data-testid="new-return" onClick={() => setShowReturnForm(true)} disabled={invoices.length === 0} className={BTN_GHOST_BL} title={invoices.length === 0 ? "لا توجد فواتير ضمن الفترة المحددة" : "إنشاء مرتجع مبيعات"}><ArrowDownCircle size={14} /> إنشاء مرتجع</button>
          {returnsMode ? <button onClick={() => onNavigate?.("sales-invoice")} className={BTN_SOFT}><ShoppingCart size={14} /> فواتير المبيعات</button> : <>
          <button onClick={() => onNavigate?.("pos")} className={BTN_GHOST_BL}><ShoppingCart size={14} /> نقاط البيع</button>
          <button onClick={() => onNavigate?.("reports")} className={BTN_SOFT}><BarChart3 size={14} /> تقارير المبيعات</button></>}
          <span className="text-[11px] text-slate-500 mr-auto">{invoices.length} فاتورة · متبقٍّ على العملاء: <span className="font-mono text-amber-300 font-bold">{fmt(tDue)}</span></span>
        </div>
      </div>

      {/* مؤشّرات تشغيلية مختصرة */}
      {!returnsMode && <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
        {[
          { label: "عدد الفواتير", value: String(invoices.length), icon: ShoppingCart, tone: "blue" },
          { label: "إجمالي الفواتير", value: fmt(tTotal), icon: TrendingUp, tone: "emerald" },
          { label: "المحصّل", value: fmt(tPaid), icon: Wallet, tone: "violet" },
          { label: "المستحق على العملاء", value: fmt(tDue), icon: ArrowDownCircle, tone: "amber" },
          { label: "إجمالي المرتجعات", value: fmt(tReturns), icon: TrendingDown, tone: "red" },
        ].map((k, i) => {
          const KIcon = k.icon;
          const tones: any = { emerald: "text-emerald-400 bg-emerald-500/10", blue: "text-blue-400 bg-blue-500/10", violet: "text-violet-400 bg-violet-500/10", amber: "text-amber-400 bg-amber-500/10", red: "text-red-400 bg-red-500/10" };
          return (
            <div key={i} className={`${CARD} p-4 flex items-center justify-between`}>
              <div>
                <div className="text-[11px] text-slate-500 mb-1">{k.label}</div>
                <div className="text-xl font-black text-slate-100 font-mono [direction:ltr]">{k.value}</div>
              </div>
              <span className={`w-11 h-11 rounded-2xl flex items-center justify-center ${tones[k.tone]}`}><KIcon size={20} /></span>
            </div>
          );
        })}
      </div>}

      {/* التحليلات والرسوم البيانية في «تقارير المبيعات» — هذه الصفحة تشغيلية */}


      {!returnsMode && <div className={`${CARD} overflow-hidden`}>
        <SectionHead icon={ShoppingCart} title="فواتير المبيعات" extra={<span className="text-[11px] text-slate-500">الإجمالي: <span className="font-mono text-emerald-400 font-bold">{fmt(tTotal)}</span></span>} />
        <div className="overflow-x-auto">
          <table className="w-full border-collapse" style={{ minWidth: 980 }}>
            <thead><tr>{["رقم", "التاريخ", "العميل", "المصدر", "النوع", "الإجمالي", "مدفوع", "متبقٍّ", "الحالة", ...(multiBranch ? ["الفرع"] : []), ""].map((h, i) => <th key={i} className="text-[10px] px-2 py-2.5 bg-slate-950 text-slate-500 whitespace-nowrap border-b border-slate-700">{h}</th>)}</tr></thead>
            <tbody>
              {invoices.map((inv) => { const d = (Number(inv.total) || 0) - (Number(inv.paid_amount) || 0); return (
                <tr key={inv.id} className="hover:bg-white/[0.02]">
                  <td className="px-2 py-2 text-xs text-center font-mono text-slate-300 [direction:ltr] border-b border-slate-800">{inv.invoice_no}</td>
                  <td className="px-2 py-2 text-xs text-center font-mono text-slate-400 [direction:ltr] border-b border-slate-800">{inv.date}</td>
                  <td className="px-2 py-2 text-xs text-right text-slate-200 border-b border-slate-800">{invCustomer(inv)}</td>
                  <td className="px-2 py-2 text-center border-b border-slate-800"><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${(inv as any).source === "pos" ? "bg-sky-500/15 text-sky-300" : "bg-slate-600/30 text-slate-300"}`}>{srcLabel(inv)}</span></td>
                  <td className="px-2 py-2 text-xs text-center border-b border-slate-800"><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${inv.payment_type === "cash" ? "bg-emerald-500/15 text-emerald-300" : inv.payment_type === "credit" ? "bg-amber-500/15 text-amber-300" : "bg-blue-500/15 text-blue-300"}`}>{DB.PAYTYPE_LABEL[inv.payment_type]}</span></td>
                  <td className="px-2 py-2 text-xs text-center font-mono text-slate-100 [direction:ltr] border-b border-slate-800">{fmt(inv.total)}</td>
                  <td className="px-2 py-2 text-xs text-center font-mono text-emerald-400 [direction:ltr] border-b border-slate-800">{fmt(inv.paid_amount)}</td>
                  <td className={`px-2 py-2 text-xs text-center font-mono [direction:ltr] border-b border-slate-800 ${d > 0.009 ? "text-red-300 font-bold" : "text-slate-600"}`}>{fmt(d)}</td>
                  <td className="px-2 py-2 text-center border-b border-slate-800">{(() => { const st = invStatus(inv); return <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${st.cls}`}>{st.label}</span>; })()}</td>
                  {multiBranch && <td className="px-2 py-2 text-xs text-center text-slate-400 border-b border-slate-800">{inv.branch_id != null ? branchName(inv.branch_id) : "—"}</td>}
                  <td className="px-2 py-2 border-b border-slate-800"><div className="flex items-center gap-1 justify-center"><button onClick={() => printInv(inv)} title="طباعة" className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-300 flex items-center justify-center hover:bg-blue-500/20"><Printer size={13} /></button><button onClick={() => del(inv)} title="حذف" className="w-7 h-7 rounded-lg bg-red-500/10 text-red-400 flex items-center justify-center hover:bg-red-500/20"><Trash2 size={13} /></button></div></td>
                </tr>
              ); })}
              {invoices.length === 0 && <tr><td colSpan={multiBranch ? 11 : 10} className="p-8 text-center text-slate-500 text-sm">{loading ? "جارٍ…" : "لا فواتير في الفترة. اضغط «فاتورة جديدة»."}</td></tr>}
            </tbody>
            {invoices.length > 0 && (
              <tfoot><tr className="bg-slate-950 font-bold">
                <td colSpan={5} className="px-2 py-2.5 text-xs text-right text-slate-200 border-t border-slate-600">الإجمالي</td>
                <td className="px-2 py-2.5 text-center font-mono text-xs text-slate-100 [direction:ltr] border-t border-slate-600">{fmt(tTotal)}</td>
                <td className="px-2 py-2.5 text-center font-mono text-xs text-emerald-400 [direction:ltr] border-t border-slate-600">{fmt(tPaid)}</td>
                <td className="px-2 py-2.5 text-center font-mono text-xs text-red-300 [direction:ltr] border-t border-slate-600">{fmt(tDue)}</td>
                <td className="border-t border-slate-600" colSpan={multiBranch ? 3 : 2} />
              </tr></tfoot>
            )}
          </table>
        </div>
      </div>}

      <SalesReturnsPanel returnsMode={returnsMode} org={org} invoices={invoices} parties={parties} postable={postable} treasuryAccounts={treasuryAccounts} branchName={branchName} reloadInvoices={reload} open={showReturnForm} setOpen={setShowReturnForm} />

    </div>
  );
}

// يطابق حساب مردودات المبيعات المخصص فقط (ولا يستخدم حساب المبيعات الأصلي بدلًا منه).
function normalizeAccountLabel(value: string) {
  return String(value || "").toLowerCase().replace(/[\u064B-\u065F\u0670ـ]/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/[\s_\-–—]/g, "");
}
function isDedicatedSalesReturnsAccount(account: GLAccount) {
  if (account.type !== "revenue" || account.is_group || account.is_active === false) return false;
  const name = normalizeAccountLabel(account.name);
  const aliases = ["مردوداتالمبيعات", "مرتجعاتالمبيعات", "مردودالمبيعات", "مرتجعالمبيعات", "مردوداتمبيعات", "مرتجعاتمبيعات", "مردوداتالبيع", "مرتجعاتالبيع", "salesreturns", "salesreturn", "returnsales"];
  return aliases.some((alias) => name === alias || name.includes(alias));
}

// ══════════════ مرتجعات المبيعات — مستند مستقل SR ══════════════
function SalesReturnsPanel({ org, invoices, parties, postable, treasuryAccounts, branchName, reloadInvoices, open, setOpen, returnsMode = false }: any) {
  const [rows, setRows] = useState<DB.GLSalesReturn[]>([]);
  const [busy, setBusy] = useState(false);
  const [invoiceId, setInvoiceId] = useState("");
  const [returnDate, setReturnDate] = useState(today());
  const [reason, setReason] = useState("");
  const [refundMode, setRefundMode] = useState<"cash" | "credit">("cash");
  const [refundAccount, setRefundAccount] = useState<number | "">("");
  const [qtys, setQtys] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);
  const selected = invoices.find((x: DB.GLSalesInvoice) => String(x.id) === invoiceId) as DB.GLSalesInvoice | undefined;
  const returnAccountMatches = useMemo(() => postable.filter((a: GLAccount) => isDedicatedSalesReturnsAccount(a)), [postable]);
  const autoReturnAccount: GLAccount | null = returnAccountMatches.length === 1 ? returnAccountMatches[0] : null;
  const [sourceTaxAccount, setSourceTaxAccount] = useState<GLAccount | null>(null);
  const [taxAccountStatus, setTaxAccountStatus] = useState<"idle" | "loading" | "ready" | "none" | "missing" | "ambiguous">("idle");
  const reload = useCallback(async () => { setBusy(true); setRows(await DB.fetchSalesReturns(org.id)); setBusy(false); }, [org.id]);
  useEffect(() => { reload(); }, [reload]);
  useEffect(() => {
    if (open) {
      setInvoiceId("");
      setReturnDate(today());
      setReason("");
      setQtys({});
      setRefundAccount("");
      setRefundMode("cash");
    }
  }, [open]);
  useEffect(() => {
    let alive = true;
    setSourceTaxAccount(null);
    if (!selected || Number(selected.tax_amount || 0) <= 0.009) {
      setTaxAccountStatus("none");
      return () => { alive = false; };
    }
    if (!selected.entry_id) {
      setTaxAccountStatus("missing");
      return () => { alive = false; };
    }
    setTaxAccountStatus("loading");
    DB.fetchJournalLines(Number(selected.entry_id)).then((lines: GLLine[]) => {
      if (!alive) return;
      const tax = Number(selected.tax_amount) || 0;
      const candidates = lines
        .filter((line) => Number(line.credit || 0) > 0.001 && Math.abs(Number(line.credit) - tax) < 0.02)
        .map((line) => postable.find((account: GLAccount) => account.id === Number(line.account_id) && account.type === "liability" && account.is_active !== false))
        .filter(Boolean) as GLAccount[];
      const unique = [...new Map(candidates.map((account) => [account.id, account])).values()];
      if (unique.length === 1) {
        setSourceTaxAccount(unique[0]);
        setTaxAccountStatus("ready");
      } else {
        setTaxAccountStatus(unique.length > 1 ? "ambiguous" : "missing");
      }
    }).catch(() => { if (alive) setTaxAccountStatus("missing"); });
    return () => { alive = false; };
  }, [selected?.id, selected?.entry_id, selected?.tax_amount, postable]);
  const usedByIndex = useMemo(() => {
    const out: Record<number, number> = {};
    rows.filter((r) => r.original_invoice_id === selected?.id && r.status === "posted").forEach((r) => (r.items || []).forEach((it) => { out[it.original_item_index] = (out[it.original_item_index] || 0) + Number(it.qty || 0); }));
    return out;
  }, [rows, selected?.id]);
  const returnItems = (selected?.items || []).map((it, i) => ({ ...it, index: i, remaining: Math.max(0, Number(it.qty || 0) - (usedByIndex[i] || 0)), qty: Number(qtys[i] || 0) })).filter((it) => it.remaining > 0);
  const picked = returnItems.filter((it) => it.qty > 0).map((it) => ({ original_item_index: it.index, description: it.description, qty: it.qty, unit_price: Number(it.unit_price), line_total: Math.round(it.qty * Number(it.unit_price) * 100) / 100 }));
  const totals = selected ? DB.invoiceTotals(picked, Number(selected.tax_rate) || 0, !!selected.tax_inclusive) : { subtotal: 0, tax: 0, total: 0 };
  const party = selected?.party_id == null ? null : parties.find((p: DB.GLParty) => p.id === selected.party_id);
  const customerAccount = party?.account_id || null;
  const cashOptions = treasuryAccounts.filter((a: GLAccount) => a.is_active !== false);
  const save = async () => {
    if (!selected) { alert("اختر فاتورة المبيعات الأصلية."); return; }
    if (!picked.length) { alert("أدخل كمية مرتجعة واحدة على الأقل."); return; }
    if (picked.some((it) => it.qty > Number(selected.items[it.original_item_index]?.qty || 0) - (usedByIndex[it.original_item_index] || 0) + 0.000001)) { alert("الكمية تتجاوز المتاح للإرجاع."); return; }
    if (!autoReturnAccount) {
      alert(returnAccountMatches.length > 1
        ? "يوجد أكثر من حساب مطابق لمردودات المبيعات. احتفظ بحساب واحد مخصص باسم واضح «مردودات المبيعات»."
        : "لم يتم العثور على حساب «مردودات المبيعات». أضف الحساب ضمن مجموعة الإيرادات ثم أعد فتح المرتجع.");
      return;
    }
    if (totals.tax > 0 && taxAccountStatus !== "ready") {
      alert("تعذّر تحديد حساب ضريبة المخرجات من قيد الفاتورة الأصلية. تأكد من وجود قيد الفاتورة وحساب ضريبة التزام مرتبط به.");
      return;
    }
    if (refundMode === "cash" && refundAccount === "") { alert("اختر خزنة/بنك رد المبلغ."); return; }
    if (refundMode === "credit" && !customerAccount) { alert("الفاتورة لا تحتوي على حساب عميل؛ اختر ردًا نقديًا أو اربط العميل بحساب ذمم."); return; }
    const lines: GLLine[] = [
      { account_id: Number(autoReturnAccount.id), debit: totals.subtotal, credit: 0, branch_id: selected.branch_id },
      ...(totals.tax > 0 ? [{ account_id: Number(sourceTaxAccount!.id), debit: totals.tax, credit: 0, branch_id: selected.branch_id } as GLLine] : []),
      refundMode === "cash"
        ? { account_id: Number(refundAccount), debit: 0, credit: totals.total, branch_id: selected.branch_id }
        : { account_id: Number(customerAccount), debit: 0, credit: totals.total, branch_id: selected.branch_id, party_id: selected.party_id },
    ];
    setSaving(true);
    const result = await DB.createSalesReturn(org.id, { original_invoice: selected, date: returnDate, items: picked, subtotal: totals.subtotal, tax_amount: totals.tax, total: totals.total, notes: reason.trim() || null, refund_mode: refundMode, refund_account_id: refundMode === "cash" ? Number(refundAccount) : null, entry_lines: lines });
    setSaving(false);
    if (!result.ok) { alert("تعذّر إنشاء المرتجع: " + (result.error || "")); return; }
    alert(`تم إنشاء مرتجع ${result.returnLabel} وربطه بالفاتورة ${selected.invoice_no}.`);
    setOpen(false); await reload(); await reloadInvoices?.();
  };
  return <>
    {!open && <div className={`${CARD} overflow-hidden ${returnsMode ? "" : "mt-4"}`} data-testid="returns-list">
      <SectionHead icon={ArrowDownCircle} title="مرتجعات المبيعات" extra={<span className="text-[11px] text-slate-500">مستندات المرتجعات المرتبطة بفواتير المبيعات</span>} />
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-950 text-slate-500"><tr>{["رقم المرتجع","التاريخ","الفاتورة الأصلية","العميل","طريقة التسوية","الإجمالي","القيد"].map(h=><th key={h} className="p-3">{h}</th>)}</tr></thead>
          <tbody>{rows.map(r=><tr key={r.id} className="border-t border-slate-800 hover:bg-slate-800/40">
            <td className="p-3 text-center font-mono text-emerald-300">SR-{r.return_year}-{String(r.return_no).padStart(4,"0")}</td>
            <td className="p-3 text-center">{r.date}</td><td className="p-3 text-center">{r.original_invoice_no}/{r.original_invoice_year}</td>
            <td className="p-3">{r.customer_name||"—"}</td><td className="p-3 text-center">{r.refund_mode==="cash"?"رد نقدي":"إشعار دائن"}</td>
            <td className="p-3 text-center font-mono text-emerald-300">{fmt(r.total)}</td><td className="p-3 text-center">{r.entry_id||"—"}</td>
          </tr>)}{!rows.length&&<tr><td colSpan={7} className="p-8 text-center text-slate-500">{busy?"جارٍ التحميل…":"لا توجد مرتجعات مسجلة."}</td></tr>}</tbody>
        </table>
      </div>
    </div>}

    {open && <div className="fixed inset-0 z-[100] min-h-screen overflow-y-auto bg-slate-950 text-slate-100" dir="rtl"><div className="min-h-screen w-full bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-700 bg-slate-950 px-5 py-5">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-blue-500/15 p-2.5 text-blue-300"><ArrowDownCircle size={21}/></div>
            <div><div className="text-xs text-sky-300 mb-1">الحسابات　›　المبيعات　›　مرتجع مبيعات</div><h2 className="text-2xl font-extrabold text-white">إنشاء مرتجع مبيعات</h2><p className="mt-1 text-sm text-slate-400">تسجيل مرتجع جزئي أو كلي على فاتورة مبيعات</p></div>
          </div>
          <button onClick={()=>setOpen(false)} className="inline-flex items-center gap-2 rounded-xl border border-slate-600 bg-slate-800 px-4 py-3 text-sm font-bold text-slate-200 hover:bg-slate-700">{returnsMode ? "العودة إلى المرتجعات" : "العودة إلى المبيعات"} <ArrowDownCircle size={16}/></button>
        </div>

        <div className="p-5 md:p-7 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 rounded-xl border border-slate-700 bg-slate-950/60 p-5">
            <div className="md:col-span-1"><label className={LABEL}>الفاتورة الأصلية</label>
              <select value={invoiceId} onChange={(e) => { setInvoiceId(e.target.value); setQtys({}); }} className={`${SELECT} mt-1`}>
                <option value="">— اختر فاتورة —</option>
                {invoices.map((x: DB.GLSalesInvoice) => <option key={x.id} value={x.id}>INV-{x.invoice_year}-{String(x.invoice_no).padStart(4,"0")} · {x.customer_name || parties.find((p: DB.GLParty) => p.id===x.party_id)?.name || "عميل نقدي"} · {fmt(x.total)}</option>)}
              </select>
            </div>
            <div><label className={LABEL}>تاريخ المرتجع</label><input type="date" value={returnDate} onChange={(e)=>setReturnDate(e.target.value)} className={`${DATE} mt-1`}/></div>
            <div><label className={LABEL}>سبب الإرجاع</label><input value={reason} onChange={(e)=>setReason(e.target.value)} placeholder="اكتب سبب المرتجع" className={`${INPUT} mt-1`}/></div>
          </div>

          {selected ? <>
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-3"><div className="text-xs text-slate-400">رقم الفاتورة</div><div className="mt-1 font-bold text-white">{selected.invoice_no}/{selected.invoice_year}</div></div>
              <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-3"><div className="text-xs text-slate-400">العميل</div><div className="mt-1 font-bold text-white">{selected.customer_name || party?.name || "عميل نقدي"}</div></div>
              <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-3"><div className="text-xs text-slate-400">إجمالي الفاتورة</div><div className="mt-1 font-bold text-white">{fmt(selected.total)}</div></div>
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3"><div className="text-xs text-emerald-300">إجمالي المرتجع الحالي</div><div className="mt-1 font-bold text-emerald-300">{fmt(totals.total)}</div></div>
            </div>

            <section className="overflow-hidden rounded-xl border border-slate-700">
              <div className="flex items-center justify-between bg-slate-800/80 px-4 py-3"><h3 className="font-bold text-white">أصناف الفاتورة</h3><span className="text-xs text-slate-400">أدخل الكمية في الخانة الزرقاء</span></div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[850px] text-sm">
                  <thead className="bg-slate-950 text-slate-300"><tr>{["الصنف","الكمية المباعة","مرتجع سابق","المتاح للإرجاع","كمية الإرجاع","سعر الوحدة","قيمة المرتجع"].map(h=><th key={h} className="px-3 py-3 text-center font-semibold">{h}</th>)}</tr></thead>
                  <tbody>{(selected.items || []).map((it: DB.SalesItem,i:number)=>{
                    const sold=Number(it.qty)||0, already=usedByIndex[i]||0, remaining=Math.max(0,sold-already), entered=Number(qtys[i])||0;
                    return <tr key={i} className="border-t border-slate-700 hover:bg-slate-800/40">
                      <td className="px-3 py-3 font-medium text-white">{it.description}</td>
                      <td className="px-3 py-3 text-center text-slate-200">{fmt(sold)}</td>
                      <td className="px-3 py-3 text-center"><span className="inline-flex rounded-lg bg-amber-500/15 px-3 py-1 font-bold text-amber-300">{fmt(already)}</span></td>
                      <td className="px-3 py-3 text-center"><span className="inline-flex rounded-lg bg-emerald-500/15 px-3 py-1 font-bold text-emerald-300">{fmt(remaining)}</span></td>
                      <td className="px-3 py-3 text-center"><input aria-label={`كمية إرجاع ${it.description}`} type="number" min="0" max={remaining} step="0.01" disabled={!remaining} value={qtys[i]||""} onChange={(e)=>setQtys(p=>({...p,[i]:e.target.value}))} className="w-28 rounded-lg border-2 border-sky-400 bg-sky-950 px-3 py-2 text-center text-base font-extrabold text-white shadow-inner outline-none placeholder:text-sky-300 focus:border-sky-300 focus:ring-2 focus:ring-sky-400/30 disabled:opacity-40"/></td>
                      <td className="px-3 py-3 text-center text-slate-200">{fmt(it.unit_price)}</td>
                      <td className="px-3 py-3 text-center font-bold text-emerald-300">{fmt(entered*Number(it.unit_price))}</td>
                    </tr>;
                  })}</tbody>
                </table>
              </div>
            </section>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 rounded-xl border border-slate-700 bg-slate-950/50 p-5">
              <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-3">
                <label className={LABEL}>حساب مردودات المبيعات — ربط تلقائي</label>
                {autoReturnAccount ? <div className="mt-2 flex items-center gap-2 text-sm font-bold text-emerald-300"><Check size={16}/><span>{autoReturnAccount.code} — {autoReturnAccount.name}</span></div> : <div className="mt-2 text-xs font-bold text-amber-300">{returnAccountMatches.length > 1 ? "توجد حسابات متعددة مطابقة؛ يلزم ترك حساب مخصص واحد." : "لم يُضف الحساب بعد. أضف «مردودات المبيعات» ضمن الإيرادات وسيتم ربطه تلقائيًا."}</div>}
              </div>
              <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-3">
                <label className={LABEL}>ضريبة المخرجات — من قيد الفاتورة الأصلية</label>
                {Number(selected.tax_amount || 0) <= 0.009 ? <div className="mt-2 text-sm font-bold text-slate-400">لا توجد ضريبة على الفاتورة</div> : taxAccountStatus === "loading" ? <div className="mt-2 text-xs text-sky-300">جارٍ تحديد حساب الضريبة من القيد الأصلي…</div> : sourceTaxAccount ? <div className="mt-2 flex items-center gap-2 text-sm font-bold text-emerald-300"><Check size={16}/><span>{sourceTaxAccount.code} — {sourceTaxAccount.name}</span></div> : <div className="mt-2 text-xs font-bold text-amber-300">{taxAccountStatus === "ambiguous" ? "تعذر التحديد: أكثر من حساب ضريبة مطابق في قيد الفاتورة." : "لم يتم العثور على حساب ضريبة التزام في قيد الفاتورة الأصلية."}</div>}
              </div>
              <div><label className={LABEL}>طريقة التسوية</label><select value={refundMode} onChange={e=>setRefundMode(e.target.value as "cash"|"credit")} className={SELECT}><option value="cash">رد نقدي من الخزنة</option><option value="credit">إشعار دائن على حساب العميل</option></select></div>
              {refundMode==="cash" && <div><label className={LABEL}>خزنة/بنك رد المبلغ</label><AccountPicker value={refundAccount} onChange={setRefundAccount} options={cashOptions} placeholder="اختر الخزنة" size="md"/></div>}
            </div>
          </> : <div className="rounded-xl border border-dashed border-slate-600 bg-slate-950/40 p-12 text-center"><div className="text-slate-300 font-semibold">اختر الفاتورة الأصلية للبدء</div><p className="mt-2 text-xs text-slate-500">ستظهر هنا أصناف الفاتورة والكميات المتاحة للإرجاع</p></div>}
        </div>

        <div className="border-t border-slate-700 bg-slate-950 px-5 py-5">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="grid grid-cols-3 gap-3 text-center lg:min-w-[420px]">
              <div><div className="text-xs text-slate-400">الصافي</div><div className="mt-1 font-bold text-white">{fmt(totals.subtotal)}</div></div>
              <div><div className="text-xs text-slate-400">الضريبة</div><div className="mt-1 font-bold text-amber-300">{fmt(totals.tax)}</div></div>
              <div><div className="text-xs text-slate-400">إجمالي المرتجع</div><div className="mt-1 text-lg font-extrabold text-emerald-300">{fmt(totals.total)}</div></div>
            </div>
            <div className="flex flex-wrap gap-3"><button onClick={()=>setOpen(false)} className={BTN_SOFT}>إلغاء والعودة</button><button disabled={saving || !selected || !autoReturnAccount || (totals.tax > 0 && taxAccountStatus !== "ready")} onClick={save} className={BTN_SUCCESS}><Save size={14}/>{saving?"جارٍ الحفظ…":"حفظ وترحيل المرتجع"}</button></div>
          </div>
        </div>
      </div>
    </div>}
  </>;
}
