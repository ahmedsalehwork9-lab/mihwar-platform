// =============================================================
// src/pages/branchSettings/BranchSettingsPage.tsx
// إعدادات الفروع: قائمة الفروع + تبويبات (البيانات الأساسية، المخازن، الربط المحاسبي، المستخدمون (قراءة)، التشغيل، النماذج والطباعة، المتجر العام).
// بدون إضافة فرع/مستخدم وبدون حذف. ثنائي اللغة RTL/LTR. تفضيلات الطباعة محفوظة في هذا المتصفح.
// =============================================================
import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { Building2, Check, ChevronLeft, ChevronRight, Copy, Eye, FileText, Globe, Home, Layers, Package, Printer, RotateCcw, Save, Search, Settings, Store, Users, Warehouse, Wallet, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useLang } from "../../context/LanguageContext";
import { useOrgConfig } from "../../context/OrgConfigContext";
import * as DB from "../lib/accountingDb";
import type { GLAccount } from "../lib/accountingDb";
import { printHTML } from "../sales/salesInvoicePrint";
import { fetchPrintOrg, type PrintOrg } from "../sales/salesInvoiceApi";
import { DOC_KINDS, buildDocHTML, sampleDoc, type DocKind } from "../print/docTemplates";
import * as API from "./branchApi";
import {
  ROLES, branchOverride, defaultsToClear, dirtyFields, effective, filterShops, kpisOf, orgDefault, patchOf, planMap, toForm, typeLabel, validateBasic, whValidate,
  type BasicForm, type MapRow, type Shop, type Wh, type WhErr,
} from "./branchLogic";
import { DEFAULT_PREFS, DOC_LANGS, PAPERS, type DocLang, browserStore, clearPrintPrefs, isDefaultPrefs, loadPrintPrefs, savePrintPrefs, type PrintPrefs } from "./printPrefs";

const PublicShopSettings = lazy(() => import("../ShopSettingsPage"));
const CompanySettings = lazy(() => import("../CompanySettingsPage"));
const CARD = "bg-slate-900 border border-slate-800 rounded-2xl";
const INP = "w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500 disabled:opacity-50";
const LBL = "block text-xs font-semibold text-slate-400 mb-1";
const BTN = "inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:text-white text-xs font-bold disabled:opacity-40";
const BTN_BLUE = "inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold disabled:opacity-40";
type TabId = "company" | "basic" | "warehouses" | "accounting" | "users" | "ops" | "print" | "public";
const TABS: { id: TabId; en: string; ar: string; icon: JSX.Element }[] = [
  { id: "company", en: "Company", ar: "الشركة", icon: <Building2 size={15} /> },
  { id: "basic", en: "Basic data", ar: "البيانات الأساسية", icon: <Home size={15} /> }, { id: "warehouses", en: "Warehouses", ar: "المخازن", icon: <Warehouse size={15} /> },
  { id: "accounting", en: "Accounting link", ar: "الربط المحاسبي", icon: <Layers size={15} /> }, { id: "users", en: "Users", ar: "المستخدمون", icon: <Users size={15} /> },
  { id: "ops", en: "Operations", ar: "إعدادات التشغيل", icon: <Settings size={15} /> }, { id: "print", en: "Forms & printing", ar: "النماذج والطباعة", icon: <Printer size={15} /> },
  { id: "public", en: "Public shop (QR)", ar: "المتجر العام", icon: <Store size={15} /> },
];
const FIELD_ERR = { name: ["Name is required", "الاسم مطلوب"], phone: ["Invalid phone number", "رقم هاتف غير صالح"], email: ["Invalid email", "بريد إلكتروني غير صالح"], url: ["Invalid link (must start with http/https)", "رابط غير صالح (يبدأ بـ http/https)"], margin: ["Margin must be 0–1000", "الهامش بين 0 و1000"], cr: ["Commercial registration: digits only (6–15)", "السجل التجاري: أرقام فقط (6–15)"] } as const;
const WH_ERR: Record<WhErr, [string, string]> = { name: ["Name is required", "الاسم مطلوب"], default_inactive: ["The default warehouse must stay active", "المخزن الافتراضي يجب أن يبقى نشطًا"], last_active: ["At least one warehouse must stay active", "يجب أن يبقى مخزن واحد نشط على الأقل"], dup_code: ["Code already used by another warehouse", "الكود مستخدم في مخزن آخر"] };

export default function BranchSettingsPage() {
  const { t, lang, isRTL } = useLang(); const l2 = lang === "en" ? "en" : "ar";
  const { ownedShopId, isAdmin } = (useAuth() as { ownedShopId?: number | string | null; isAdmin?: boolean } | undefined) ?? {};
  const { cfg } = (useOrgConfig() as { cfg?: Record<string, unknown> } | undefined) ?? {};
  const activeShop = ownedShopId ? Number(ownedShopId) : null;
  const [org, setOrg] = useState<{ id: number; name: string } | null>(null);
  const [shops, setShops] = useState<Shop[]>([]); const [whs, setWhs] = useState<Wh[]>([]); const [items, setItems] = useState<Record<number, number>>({});
  const [map, setMap] = useState<MapRow[]>([]); const [accounts, setAccounts] = useState<GLAccount[]>([]);
  const [loading, setLoading] = useState(true); const [loadErr, setLoadErr] = useState<string | null>(null);
  const [selId, setSelId] = useState<number | null>(null); const [tab, setTab] = useState<TabId>("company"); const [q, setQ] = useState("");
  const [form, setForm] = useState<BasicForm | null>(null); const [showErrs, setShowErrs] = useState(false); const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [whDraft, setWhDraft] = useState<Record<number, Wh>>({}); const [whMsg, setWhMsg] = useState<Record<number, { ok: boolean; text: string }>>({});
  const [sel, setSel] = useState<Record<string, number | "">>({}); const [users, setUsers] = useState<API.BranchUser[] | null>(null);
  const [pp, setPp] = useState<PrintPrefs>(DEFAULT_PREFS); const [pv, setPv] = useState<{ kind: DocKind; lang: DocLang } | null>(null); const [pOrg, setPOrg] = useState<PrintOrg | null>(null); const [copyOpen, setCopyOpen] = useState(false);
  const [cp, setCp] = useState<{ from: number | ""; map: boolean; print: boolean; margin: boolean }>({ from: "", map: true, print: true, margin: true });

  const sh = useMemo(() => shops.find((s) => s.id === selId) ?? null, [shops, selId]);
  const saved = useMemo(() => (sh ? toForm(sh) : null), [sh]);
  const dirty = useMemo(() => (form && saved ? dirtyFields(saved, form) : []), [form, saved]);
  const errs = useMemo(() => (form ? validateBasic(form) : {}), [form]);
  const kp = useMemo(() => kpisOf(shops, whs, items), [shops, whs, items]);
  const list = useMemo(() => filterShops(shops, q), [shops, q]);
  const myWhs = useMemo(() => whs.filter((w) => w.branch_id === selId), [whs, selId]);

  const load = useCallback(async (o: { id: number }) => {
    setLoading(true); setLoadErr(null);
    try {
      const [s, w, m, a] = await Promise.all([API.fetchShops(o.id), API.fetchWarehouses(o.id), API.fetchMap(o.id), DB.fetchAccounts(o.id)]);
      setShops(s); setWhs(w); setMap(m); setAccounts(a); setItems(await API.fetchItemCounts(s.map((x) => x.id)));
      setSelId((cur) => (cur != null && s.some((x) => x.id === cur) ? cur : s.find((x) => x.id === activeShop)?.id ?? s[0]?.id ?? null));
    } catch (e) { setLoadErr((e as { message?: string })?.message || "load failed"); }
    setLoading(false);
  }, [activeShop]);
  useEffect(() => { let a = true; void DB.getOrgForBranch(activeShop).then((o) => { if (!a) return; setOrg(o); if (o) void load(o); else setLoading(false); }).catch(() => { if (a) setLoading(false); }); return () => { a = false; }; }, [activeShop, load]);
  useEffect(() => { if (sh) { setForm(toForm(sh)); setShowErrs(false); setMsg(null); setPp(loadPrintPrefs(browserStore(), sh.id)); setUsers(null); } else setForm(null); }, [sh?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setWhDraft(Object.fromEntries(myWhs.map((w) => [w.id, w]))); setWhMsg({}); }, [myWhs]);
  useEffect(() => { if (sh) setSel(Object.fromEntries(ROLES.map((r) => [r.role, branchOverride(map, sh.id, r.role) ?? ""]))); }, [sh?.id, map]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (tab === "users" && sh && users == null) void API.fetchBranchUsers(sh.id).then(setUsers).catch(() => setUsers([])); }, [tab, sh, users]);

  useEffect(() => { if (tab === "print" && sh && org) { let a = true; void fetchPrintOrg(org.id, sh.id).then((o) => { if (a) setPOrg(o); }).catch(() => { if (a) setPOrg(null); }); return () => { a = false; }; } }, [tab, sh?.id, org?.id, sh?.logo_url]); // eslint-disable-line react-hooks/exhaustive-deps
  const previewOrg: PrintOrg = useMemo(() => ({ name: pOrg?.name ?? sh?.shop_name ?? null, tax_number: pOrg?.tax_number ?? null, commercial_registration: sh?.commercial_registration ?? pOrg?.commercial_registration ?? null, phone: sh?.phone ?? pOrg?.phone ?? null, address: sh?.address ?? pOrg?.address ?? null, logo_url: form?.logo_url?.trim() || sh?.logo_url || pOrg?.logo_url || null }), [pOrg, sh, form?.logo_url]);
  const cur = (cfg?.currency_symbol as string | undefined) ?? "";
  const pvHTML = useMemo(() => (pv && sh ? buildDocHTML({ ...sampleDoc(pv.kind, (pv.lang === "ui" ? l2 : pv.lang === "en" ? "en" : "ar") === "ar", cur), branchId: sh.id }, previewOrg, l2, { ...pp, docLang: pv.lang }) : ""), [pv, sh, previewOrg, pp, l2, cur]);
  const guard = (): boolean => !dirty.length || window.confirm(t("You have unsaved changes. Discard them?", "لديك تغييرات غير محفوظة. تجاهلها؟"));
  const pickShop = (id: number) => { if (id !== selId && guard()) { setSelId(id); setTab((c) => (c === "company" ? c : "basic")); } };
  const pickTab = (id: TabId) => { if (id !== tab && (id === "basic" || id === "ops" || id === "company" || guard() || tab === "basic" || tab === "ops" || tab === "company")) setTab(id); };
  const reload = async () => { if (org) await load(org); };

  const setF = (k: keyof BasicForm, v: string) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const saveBasic = async () => {
    if (!sh || !form || !saved) return; setShowErrs(true); if (Object.keys(errs).length) { setMsg({ ok: false, text: t("Fix the highlighted fields first.", "صحّح الحقول المظلّلة أولًا.") }); return; }
    const patch = patchOf(saved, form); setBusy(true); const r = await API.updateShop(sh.id, patch); setBusy(false);
    if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
    setForm((f) => (f ? { ...f, ...Object.fromEntries(Object.entries(patch).filter(([k]) => k in f).map(([k, v]) => [k, v == null ? "" : String(v)])) } : f));
    setMsg({ ok: true, text: t("Saved.", "تم الحفظ.") }); await reload();
  };
  const toggleActive = async () => {
    if (!sh) return; const to = !sh.is_active;
    if (!window.confirm(to ? t("Activate this branch?", "تفعيل هذا الفرع؟") : t(`Deactivate "${sh.shop_name}"? ${sh.id === activeShop ? "This is your current branch. " : ""}Its data is kept.`, `إيقاف «${sh.shop_name}»؟ ${sh.id === activeShop ? "هذا فرعك الحالي. " : ""}بياناته تبقى محفوظة.`))) return;
    setBusy(true); const r = await API.updateShop(sh.id, { is_active: to }); setBusy(false);
    setMsg(r.ok ? { ok: true, text: to ? t("Branch activated.", "تم تفعيل الفرع.") : t("Branch deactivated.", "تم إيقاف الفرع.") } : { ok: false, text: r.error }); if (r.ok) await reload();
  };
  const resetForm = () => { if (sh) { setForm(toForm(sh)); setShowErrs(false); setMsg(null); } };

  const saveWh = async (w: Wh) => {
    if (!org) return; const d = whDraft[w.id]; if (!d) return;
    const err = whValidate(myWhs.map((x) => (x.id === d.id ? d : x)), d); if (err) { setWhMsg((m) => ({ ...m, [w.id]: { ok: false, text: WH_ERR[err][l2 === "en" ? 0 : 1] } })); return; }
    setBusy(true); let r: API.Res = { ok: true };
    if (d.is_default && !w.is_default) r = await API.setDefaultWarehouse(org.id, w.id, defaultsToClear(myWhs, w.id));
    if (r.ok) r = await API.updateWarehouse(org.id, w.id, { name: d.name.trim(), code: (d.code ?? "").trim() || null, is_active: d.is_active, inventory_account_id: d.inventory_account_id });
    setBusy(false); setWhMsg((m) => ({ ...m, [w.id]: r.ok ? { ok: true, text: t("Saved.", "تم الحفظ.") } : { ok: false, text: r.error } })); if (r.ok) await reload();
  };
  const accOpts = (type: string) => accounts.filter((a) => !a.is_group && a.type === type);
  const invAccs = useMemo(() => accounts.filter((a) => !a.is_group && a.type === "asset"), [accounts]);
  const accName = (id: number | null | undefined) => { const a = accounts.find((x) => x.id === id); return a ? `${a.code} · ${a.name}` : "—"; };
  const mapOps = useMemo(() => (sh ? planMap(map, sh.id, sel) : []), [map, sh, sel]);
  const saveMap = async () => { if (!org || !sh || !mapOps.length) return; setBusy(true); const r = await API.applyMapOps(org.id, sh.id, mapOps); setBusy(false); setMsg(r.ok ? { ok: true, text: t("Accounting link saved.", "تم حفظ الربط المحاسبي.") } : { ok: false, text: r.error }); if (r.ok) await reload(); };

  const ppSave = () => { if (!sh) return; const ok = isDefaultPrefs(pp) ? (clearPrintPrefs(browserStore(), sh.id), true) : savePrintPrefs(browserStore(), sh.id, pp); setMsg(ok ? { ok: true, text: t("Print settings saved on this device.", "تم حفظ إعدادات الطباعة على هذا الجهاز.") } : { ok: false, text: t("Could not save (browser storage unavailable).", "تعذّر الحفظ (تخزين المتصفح غير متاح).") }); };
  const ppPreview = () => { if (sh) setPv({ kind: "sales_invoice", lang: pp.docLang }); };
  const ppPrintNow = () => { if (pvHTML) printHTML(pvHTML); };

  const doCopy = async () => {
    if (!org || !sh || cp.from === "") return; const src = shops.find((s) => s.id === cp.from); if (!src) return;
    if (!window.confirm(t(`Copy the selected settings from "${src.shop_name}" to "${sh.shop_name}"? This overwrites them.`, `نسخ الإعدادات المحددة من «${src.shop_name}» إلى «${sh.shop_name}»؟ سيتم استبدالها.`))) return;
    setBusy(true); const done: string[] = []; let bad: string | null = null;
    if (cp.map) { const ops = planMap(map, sh.id, Object.fromEntries(ROLES.map((r) => [r.role, branchOverride(map, src.id, r.role) ?? ""]))); const r = await API.applyMapOps(org.id, sh.id, ops); if (r.ok) done.push(t("accounting link", "الربط المحاسبي")); else bad = r.error; }
    if (!bad && cp.print) { const p = loadPrintPrefs(browserStore(), src.id); if (isDefaultPrefs(p)) clearPrintPrefs(browserStore(), sh.id); else savePrintPrefs(browserStore(), sh.id, p); setPp(p); done.push(t("print settings", "إعدادات الطباعة")); }
    if (!bad && cp.margin) { const r = await API.updateShop(sh.id, { default_margin_percent: src.default_margin_percent }); if (r.ok) done.push(t("default margin", "الهامش الافتراضي")); else bad = r.error; }
    setBusy(false); setCopyOpen(false); setMsg(bad ? { ok: false, text: `${bad}${done.length ? ` — ${t("copied before the error: ", "نُسخ قبل الخطأ: ")}${done.join(", ")}` : ""}` } : { ok: true, text: `${t("Copied: ", "تم النسخ: ")}${done.join(isRTL ? "، " : ", ") || "—"}` }); await reload();
  };

  const fe = (k: keyof BasicForm) => (showErrs && errs[k] ? FIELD_ERR[errs[k]!][l2 === "en" ? 0 : 1] : null);
  const field = (k: keyof BasicForm, label: string, o: { ltr?: boolean; ph?: string } = {}) => (
    <div><label className={LBL}>{label}</label><input value={form?.[k] ?? ""} onChange={(e) => setF(k, e.target.value)} dir={o.ltr ? "ltr" : undefined} placeholder={o.ph} className={`${INP} ${fe(k) ? "border-red-500/60" : ""}`} data-testid={`bs-f-${k}`} />
      {fe(k) && <div className="mt-1 text-[11px] text-red-300" data-testid={`bs-e-${k}`}>{fe(k)}</div>}</div>);
  const saveBar = (tab === "basic" || tab === "ops") && form && (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-3 mt-4">
      <span className="text-[11px] text-slate-500" data-testid="bs-dirty">{dirty.length ? t(`${dirty.length} unsaved change(s)`, `${dirty.length} تغيير غير محفوظ`) : t("No changes", "لا تغييرات")}</span>
      <div className="flex gap-2"><button type="button" onClick={resetForm} disabled={!dirty.length || busy} className={BTN} data-testid="bs-reset"><RotateCcw size={14} />{t("Discard changes", "تراجع عن التغييرات")}</button>
        <button type="button" onClick={() => void saveBasic()} disabled={!dirty.length || busy} className={BTN_BLUE} data-testid="bs-save"><Save size={15} />{busy ? t("Saving…", "جارٍ الحفظ…") : t("Save", "حفظ")}</button></div></div>);
  const kpi = (id: string, label: string, v: number, icon: JSX.Element, tone: string) => <div className={`${CARD} p-4 flex items-center justify-between ${tone}`}><div className="text-3xl font-black font-mono" dir="ltr" data-testid={id}>{v.toLocaleString("en-US")}</div><div className="text-right"><div className="text-xs font-bold text-slate-300">{label}</div></div><div className="opacity-70">{icon}</div></div>;
  const orgRow = (label: string, v: unknown) => <div className="flex justify-between py-1.5 border-b border-slate-800 text-sm"><span className="text-slate-400">{label}</span><b dir="ltr">{v == null || v === "" ? "—" : String(v)}</b></div>;

  if (loading) return <div className="p-6 text-slate-500 text-sm" data-testid="bs-loading">{t("Loading…", "جارٍ التحميل…")}</div>;
  return (
    <div className="p-4 lg:p-6 min-h-screen text-slate-100 space-y-4" dir={isRTL ? "rtl" : "ltr"} data-testid="bs-page">
      <div><div className="text-xs text-slate-500 flex items-center gap-1"><Home size={12} />{t("Home", "الرئيسية")} / {t("Company & branch settings", "إعدادات الشركة والفروع")}</div>
        <h1 className="text-2xl font-black mt-1">{t("Company & Branch Settings", "إعدادات الشركة والفروع")}</h1>
        <p className="text-xs text-slate-500">{t("Manage company settings, branches, warehouses, accounting link and document printing.", "إدارة إعدادات الشركة والفروع والمخازن والربط المحاسبي وطباعة المستندات.")}</p></div>
      {loadErr && <div className="rounded-xl border border-red-500/40 bg-red-500/10 text-red-200 text-sm p-3" data-testid="bs-err">{loadErr}</div>}
      {!org && !loadErr && <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-200 text-sm p-3" data-testid="bs-noorg">{t("The current branch is not linked to a company.", "الفرع الحالي غير مرتبط بشركة.")}</div>}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {kpi("bs-kpi-total", t("Total branches", "إجمالي الفروع"), kp.branches, <Building2 size={26} />, "")}{kpi("bs-kpi-active", t("Active branches", "الفروع النشطة"), kp.active, <Store size={26} />, "")}
        {kpi("bs-kpi-wh", t("Active warehouses", "المخازن النشطة"), kp.warehouses, <Warehouse size={26} />, "")}{kpi("bs-kpi-items", t("Total items", "إجمالي الأصناف"), kp.items, <Package size={26} />, "")}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] items-start">
        <div className="min-w-0 order-2 lg:order-1 space-y-3">
          {!sh ? <div className={`${CARD} p-10 text-center text-slate-500`} data-testid="bs-empty">{t("No branches to show.", "لا توجد فروع للعرض.")}</div> : (<>
            <div className={`${CARD} p-4 flex flex-wrap items-center justify-between gap-3`}>
              <div className="flex items-center gap-3 min-w-0"><div className="w-11 h-11 rounded-xl bg-blue-500/10 text-blue-300 flex items-center justify-center shrink-0"><Store size={22} /></div>
                <div className="min-w-0"><h2 className="text-lg font-black truncate" data-testid="bs-title">{sh.shop_name}</h2>
                  <div className="text-[11px] text-slate-500 flex flex-wrap gap-x-3"><span dir="ltr">#{sh.id}</span><span>{typeLabel(sh.shop_type)[l2]}</span><span className={sh.is_active ? "text-emerald-400" : "text-red-300"} data-testid="bs-state">{sh.is_active ? t("Active", "نشط") : t("Inactive", "موقوف")}</span></div></div></div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={resetForm} disabled={!dirty.length} className={BTN} data-testid="bs-default"><RotateCcw size={14} />{t("Restore saved", "استعادة المحفوظ")}</button>
                <button type="button" onClick={() => { setCp({ from: "", map: true, print: true, margin: true }); setCopyOpen(true); }} disabled={shops.length < 2} className={BTN} data-testid="bs-copy"><Copy size={14} />{t("Copy settings", "نسخ الإعدادات")}</button>
                <button type="button" onClick={() => void toggleActive()} disabled={busy} className={BTN} data-testid="bs-active-toggle">{sh.is_active ? t("Deactivate", "إيقاف الفرع") : t("Activate", "تفعيل الفرع")}</button></div>
            </div>
            <div className={`${CARD} p-2 flex flex-wrap gap-1`} role="tablist">
              {TABS.map((x) => <button key={x.id} type="button" role="tab" aria-selected={tab === x.id} onClick={() => pickTab(x.id)} data-testid={`bs-tab-${x.id}`} className={`px-3 py-2 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 border-b-2 ${tab === x.id ? "bg-blue-600/20 text-blue-200 border-blue-500" : "text-slate-400 border-transparent hover:text-white"}`}>{x.icon}{x[l2]}</button>)}
            </div>
            {msg && <div className={`rounded-xl border text-sm p-3 flex justify-between gap-2 ${msg.ok ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" : "border-red-500/40 bg-red-500/10 text-red-200"}`} data-testid="bs-msg"><span>{msg.text}</span><button type="button" onClick={() => setMsg(null)} aria-label={t("Close", "إغلاق")}><X size={14} /></button></div>}

            {tab === "basic" && form && <div className={`${CARD} p-4`} data-testid="bs-panel-basic"><h3 className="font-bold mb-3">{t("Branch data", "بيانات الفرع")}</h3>
              <div className="grid gap-3 md:grid-cols-2">{field("shop_name", t("Branch name", "اسم الفرع") + " *")}{field("activity_type", t("Activity", "النشاط"))}{field("phone", t("Phone", "الهاتف"), { ltr: true })}{field("whatsapp", t("WhatsApp", "واتساب"), { ltr: true })}
                {field("city", t("City", "المدينة"))}{field("email", t("Email", "البريد الإلكتروني"), { ltr: true })}{field("commercial_registration", t("Commercial registration", "السجل التجاري"), { ltr: true })}{field("website", t("Website", "الموقع الإلكتروني"), { ltr: true, ph: "https://" })}
                <div className="md:col-span-2">{field("address", t("Address", "العنوان"))}</div>{field("google_maps_url", t("Google Maps link", "رابط خرائط جوجل"), { ltr: true, ph: "https://" })}{field("logo_url", t("Logo link", "رابط الشعار"), { ltr: true, ph: "https://" })}</div>
              {form.logo_url && !errs.logo_url && <img src={form.logo_url} alt="" className="mt-3 h-14 object-contain rounded bg-white/5 p-1" />}{saveBar}</div>}

            {tab === "warehouses" && <div className={`${CARD} p-4 space-y-3`} data-testid="bs-panel-warehouses"><h3 className="font-bold">{t("Warehouses of this branch", "مخازن هذا الفرع")}</h3>
              {myWhs.length === 0 && <div className="text-sm text-slate-500 py-6 text-center" data-testid="wh-none">{t("No warehouses are linked to this branch.", "لا توجد مخازن مرتبطة بهذا الفرع.")}</div>}
              {myWhs.map((w) => { const d = whDraft[w.id] ?? w; const ch = d.name !== w.name || (d.code ?? "") !== (w.code ?? "") || d.is_active !== w.is_active || d.is_default !== w.is_default || d.inventory_account_id !== w.inventory_account_id; const m = whMsg[w.id]; return (
                <div key={w.id} className="rounded-xl border border-slate-800 p-3 grid gap-3 md:grid-cols-4" data-testid="wh-row" data-id={w.id}>
                  <div><label className={LBL}>{t("Name", "الاسم")}</label><input value={d.name} onChange={(e) => setWhDraft((x) => ({ ...x, [w.id]: { ...d, name: e.target.value } }))} className={INP} data-testid="wh-name" /></div>
                  <div><label className={LBL}>{t("Code", "الكود")}</label><input value={d.code ?? ""} onChange={(e) => setWhDraft((x) => ({ ...x, [w.id]: { ...d, code: e.target.value } }))} dir="ltr" className={INP} data-testid="wh-code" /></div>
                  <div className="md:col-span-2"><label className={LBL}>{t("Inventory account", "حساب المخزون")}</label><select value={d.inventory_account_id ?? ""} onChange={(e) => setWhDraft((x) => ({ ...x, [w.id]: { ...d, inventory_account_id: e.target.value ? Number(e.target.value) : null } }))} className={INP} data-testid="wh-acc"><option value="">{t("— not set —", "— غير محدد —")}</option>{invAccs.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select></div>
                  <div className="md:col-span-4 flex flex-wrap items-center justify-between gap-3"><div className="flex gap-4 text-sm">
                    <label className="flex items-center gap-2"><input type="checkbox" checked={d.is_active} onChange={(e) => setWhDraft((x) => ({ ...x, [w.id]: { ...d, is_active: e.target.checked } }))} data-testid="wh-active" />{t("Active", "نشط")}</label>
                    <label className="flex items-center gap-2"><input type="checkbox" checked={d.is_default} disabled={w.is_default} onChange={(e) => setWhDraft((x) => ({ ...x, [w.id]: { ...d, is_default: e.target.checked } }))} data-testid="wh-default" />{t("Default", "افتراضي")}</label></div>
                    <div className="flex items-center gap-3">{m && <span className={`text-[11px] ${m.ok ? "text-emerald-300" : "text-red-300"}`} data-testid="wh-msg">{m.text}</span>}<button type="button" onClick={() => void saveWh(w)} disabled={!ch || busy} className={BTN_BLUE} data-testid="wh-save"><Save size={14} />{t("Save", "حفظ")}</button></div></div>
                </div>); })}
              <p className="text-[11px] text-slate-500">{t("Adding or deleting warehouses is not available here.", "إضافة المخازن أو حذفها غير متاح من هنا.")}</p></div>}

            {tab === "accounting" && <div className={`${CARD} p-4 space-y-3`} data-testid="bs-panel-accounting"><h3 className="font-bold">{t("Accounting link", "الربط المحاسبي")}</h3>
              <p className="text-[11px] text-slate-500">{t("Each role uses the company default unless this branch has its own account.", "كل دور يستخدم افتراضي الشركة ما لم يكن لهذا الفرع حساب خاص.")}</p>
              {ROLES.map((r) => { const cur = sel[r.role] ?? ""; const eff = cur !== "" ? Number(cur) : orgDefault(map, r.role); return (
                <div key={r.role} className="grid gap-2 md:grid-cols-3 items-end rounded-xl border border-slate-800 p-3" data-testid={`map-${r.role}`}>
                  <div><div className="text-sm font-bold">{r[l2]}</div><div className="text-[11px] text-slate-500">{t("Company default", "افتراضي الشركة")}: <span data-testid={`map-org-${r.role}`}>{accName(orgDefault(map, r.role))}</span></div></div>
                  <div className="md:col-span-2"><label className={LBL}>{t("This branch uses", "هذا الفرع يستخدم")}</label>
                    <select value={cur} onChange={(e) => setSel((s) => ({ ...s, [r.role]: e.target.value ? Number(e.target.value) : "" }))} className={INP} data-testid={`map-sel-${r.role}`}><option value="">{t("— company default —", "— افتراضي الشركة —")}</option>{accOpts(r.type).map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select>
                    <div className="mt-1 text-[11px] text-slate-400">{t("Effective", "الفعّال")}: <b data-testid={`map-eff-${r.role}`}>{accName(eff)}</b>{sh && effective(map, sh.id, r.role) == null && cur === "" && <span className="text-amber-300"> · {t("not configured", "غير مُعدّ")}</span>}</div></div></div>); })}
              <div className="flex justify-end"><button type="button" onClick={() => void saveMap()} disabled={!mapOps.length || busy} className={BTN_BLUE} data-testid="map-save"><Save size={15} />{t("Save link", "حفظ الربط")}</button></div></div>}

            {tab === "users" && <div className={`${CARD} p-4`} data-testid="bs-panel-users"><h3 className="font-bold mb-1">{t("Users of this branch", "مستخدمو هذا الفرع")}</h3>
              <p className="text-[11px] text-slate-500 mb-3">{t("Read-only. Add users and set permissions from the Users page.", "عرض فقط. إضافة المستخدمين وضبط الصلاحيات من صفحة المستخدمين.")}{!isAdmin && ` ${t("You may only see your own account here.", "قد لا يظهر لك هنا إلا حسابك.")}`}</p>
              {users == null ? <div className="text-slate-500 text-sm" data-testid="user-loading">{t("Loading…", "جارٍ التحميل…")}</div> : users.length === 0 ? <div className="text-slate-500 text-sm py-4 text-center" data-testid="user-none">{t("No users are linked to this branch.", "لا يوجد مستخدمون مرتبطون بهذا الفرع.")}</div> :
                <table className="w-full text-sm"><thead className="text-xs text-slate-400 bg-slate-800/60"><tr><th className="p-2 text-start">{t("Name", "الاسم")}</th><th className="p-2 text-start">{t("Email", "البريد")}</th><th className="p-2">{t("Role", "الدور")}</th><th className="p-2">{t("Status", "الحالة")}</th></tr></thead>
                  <tbody>{users.map((u) => <tr key={u.id} className="border-t border-slate-800" data-testid="user-row"><td className="p-2">{u.full_name || "—"}</td><td className="p-2" dir="ltr">{u.email || "—"}</td><td className="p-2 text-center">{u.role || "—"}</td><td className="p-2 text-center">{u.is_active === false ? t("Inactive", "موقوف") : t("Active", "نشط")}</td></tr>)}</tbody></table>}</div>}

            {tab === "ops" && form && <div className="space-y-3" data-testid="bs-panel-ops">
              <div className={`${CARD} p-4`}><h3 className="font-bold mb-3">{t("Branch operations", "تشغيل الفرع")}</h3>
                <div className="grid gap-3 md:grid-cols-2">{field("default_margin_percent", t("Default profit margin %", "هامش الربح الافتراضي %"), { ltr: true })}
                  <div><label className={LBL}>{t("Market visibility", "ظهور المتجر في السوق")}</label><div className="px-3 py-2 rounded-lg bg-slate-800/60 border border-slate-700 text-sm" data-testid="ops-visibility">{sh.visibility_mode || "—"}</div><div className="text-[11px] text-slate-500 mt-1">{t("Read-only here (platform setting).", "للعرض فقط هنا (إعداد على مستوى المنصة).")}</div></div></div>{saveBar}</div>
              <div className={`${CARD} p-4`}><h3 className="font-bold mb-2">{t("Company settings (read-only)", "إعدادات الشركة (للعرض)")}</h3>
                {orgRow(t("Country", "الدولة"), cfg?.country)}{orgRow(t("Currency", "العملة"), cfg?.currency)}{orgRow(t("VAT rate %", "نسبة الضريبة %"), cfg?.default_tax_rate)}{orgRow(t("Time zone", "المنطقة الزمنية"), cfg?.timezone)}
                <p className="text-[11px] text-slate-500 mt-2">{t("Change these from Company Settings.", "تُعدَّل من إعدادات الشركة.")}</p></div></div>}

            {tab === "company" && <div data-testid="bs-panel-company"><Suspense fallback={<div className="text-slate-500 text-sm p-4">{t("Loading…", "جارٍ التحميل…")}</div>}><CompanySettings /></Suspense></div>}

            {tab === "print" && <div className="space-y-3" data-testid="bs-panel-print">
              <div className={`${CARD} p-4 space-y-4`}><h3 className="font-bold">{t("Document printing for this branch", "طباعة مستندات هذا الفرع")}</h3>
                <p className="text-[11px] text-amber-200/80 bg-amber-500/5 border border-amber-500/20 rounded-lg p-2">{t("Saved on this device/browser only, and applied to every printed document of this branch.", "تُحفظ على هذا الجهاز/المتصفح فقط، وتُطبَّق على كل مستند يُطبع لهذا الفرع.")}</p>
                <div className="grid gap-3 md:grid-cols-3">
                  <div><label className={LBL}>{t("Paper size", "حجم الورق")}</label><div className="flex gap-1.5">{PAPERS.map((x) => <button key={x} type="button" onClick={() => setPp({ ...pp, paper: x })} data-testid={`pp-paper-${x}`} className={`flex-1 py-2 rounded-lg text-xs font-bold border ${pp.paper === x ? "bg-blue-600 border-blue-500 text-white" : "bg-slate-800 border-slate-700 text-slate-400"}`}>{x}</button>)}</div></div>
                  <div><label className={LBL}>{t("Orientation", "اتجاه الطباعة")}</label><div className="flex gap-1.5">{(["portrait", "landscape"] as const).map((x) => <button key={x} type="button" disabled={pp.paper === "80mm"} onClick={() => setPp({ ...pp, orient: x })} data-testid={`pp-orient-${x}`} className={`flex-1 py-2 rounded-lg text-xs font-bold border disabled:opacity-40 ${pp.orient === x ? "bg-blue-600 border-blue-500 text-white" : "bg-slate-800 border-slate-700 text-slate-400"}`}>{x === "portrait" ? t("Portrait", "عمودي") : t("Landscape", "أفقي")}</button>)}</div></div>
                  <div><label className={LBL}><Globe size={11} className="inline" /> {t("Document language", "لغة المستندات")}</label><select value={pp.docLang} onChange={(e) => setPp({ ...pp, docLang: e.target.value as DocLang })} className={INP} data-testid="pp-lang">{DOC_LANGS.map((x) => <option key={x} value={x}>{x === "ui" ? t("Follow interface language", "حسب لغة الواجهة") : x === "ar" ? "العربية" : x === "en" ? "English" : t("Bilingual (Arabic / English)", "ثنائي (عربي / English)")}</option>)}</select></div></div>
                <div className="space-y-2 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={pp.showLogo} onChange={(e) => setPp({ ...pp, showLogo: e.target.checked })} data-testid="pp-logo" />{t("Print the company logo", "طباعة شعار الشركة")}</label>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={pp.showBrand} onChange={(e) => setPp({ ...pp, showBrand: e.target.checked })} data-testid="pp-brand" />{t("Show MIHWAR CLOUD ERP logo beside the company logo", "إظهار شعار MIHWAR CLOUD ERP بجانب شعار الشركة")}</label>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={pp.showSignature} onChange={(e) => setPp({ ...pp, showSignature: e.target.checked })} data-testid="pp-sign" />{t("Show signature lines on invoices", "إظهار خطوط التوقيع في الفواتير")}</label></div>
                <div className="flex items-center gap-3 rounded-xl border border-slate-800 p-3 text-xs" data-testid="pp-logo-status">
                  {previewOrg.logo_url ? <img src={previewOrg.logo_url} alt="" className="h-10 max-w-[120px] object-contain rounded bg-white/5 p-1" /> : <div className="h-10 w-10 rounded bg-slate-800 flex items-center justify-center text-slate-500"><Store size={16} /></div>}
                  <div className="text-slate-400">{previewOrg.logo_url ? t("Company logo found — it prints with the MIHWAR CLOUD ERP logo.", "تم العثور على شعار الشركة — يُطبع مع شعار MIHWAR CLOUD ERP.") : t("No company logo yet. Add a logo link in Basic data; until then the company name prints with the program logo.", "لا يوجد شعار للشركة بعد. أضف رابط الشعار من «البيانات الأساسية»، وحتى ذلك الحين يُطبع اسم الشركة مع شعار البرنامج.")}</div></div>
                <div className="flex flex-wrap gap-2 justify-end"><button type="button" onClick={() => { setPp(DEFAULT_PREFS); }} className={BTN} data-testid="pp-reset"><RotateCcw size={14} />{t("Defaults", "الافتراضي")}</button><button type="button" onClick={ppPreview} className={BTN} data-testid="pp-preview"><Eye size={14} />{t("Preview", "معاينة الطباعة")}</button><button type="button" onClick={ppSave} className={BTN_BLUE} data-testid="pp-save"><Save size={15} />{t("Save", "حفظ")}</button></div></div>

              <div className={`${CARD} p-4`} data-testid="wf-card"><h3 className="font-bold mb-3">{t("Document cycle", "الدورة المستندية")}</h3>
                {(["sales", "purchases", "accounting"] as const).map((st) => <div key={st} className="flex flex-wrap items-center gap-1.5 mb-2" data-testid={`wf-${st}`}>
                  <span className="text-[11px] font-bold text-slate-400 w-20">{st === "sales" ? t("Sales", "المبيعات") : st === "purchases" ? t("Purchases", "المشتريات") : t("Accounting", "المحاسبة")}</span>
                  {DOC_KINDS.filter((k) => k.stage === st).sort((a, b) => a.step - b.step).map((k, i, arr) => <span key={k.kind} className="inline-flex items-center gap-1.5"><button type="button" onClick={() => setPv({ kind: k.kind, lang: pp.docLang })} className="px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs font-bold hover:border-blue-500" style={{ borderInlineStartColor: k.accent, borderInlineStartWidth: 3 }}>{t(k.en, k.ar)}</button>{i < arr.length - 1 && (isRTL ? <ChevronLeft size={14} className="text-slate-600" /> : <ChevronRight size={14} className="text-slate-600" />)}</span>)}</div>)}</div>

              <div className={`${CARD} p-4`}><h3 className="font-bold mb-3">{t("Print templates", "نماذج الطباعة")} <span className="text-slate-500 font-mono text-xs" dir="ltr">({DOC_KINDS.length})</span></h3>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{DOC_KINDS.map((k) => <button key={k.kind} type="button" onClick={() => setPv({ kind: k.kind, lang: pp.docLang })} data-testid={`tpl-${k.kind}`} className="text-start rounded-xl border border-slate-800 hover:border-blue-500 p-3 flex items-center gap-3">
                  <span className="w-10 h-12 rounded-md bg-white flex items-center justify-center shrink-0 border-t-4" style={{ borderTopColor: k.accent }}><FileText size={18} className="text-slate-500" /></span>
                  <span className="min-w-0"><span className="block text-sm font-bold truncate">{t(k.en, k.ar)}</span><span className="block text-[11px] text-slate-500">{k.stage === "sales" ? t("Sales", "المبيعات") : k.stage === "purchases" ? t("Purchases", "المشتريات") : t("Accounting", "المحاسبة")} · {t("Preview", "معاينة")}</span></span></button>)}</div>
                <p className="text-[11px] text-slate-500 mt-3">{t("Sales/purchase invoices, quotations and treasury vouchers already print with these templates; other templates are ready for their pages.", "فواتير المبيعات والمشتريات وعروض الأسعار وسندات الخزينة تُطبع بهذه القوالب الآن، وباقي القوالب جاهزة لربطها بصفحاتها.")}</p></div>
            </div>}

            {tab === "public" && <div data-testid="bs-panel-public">{sh.id === activeShop ? <Suspense fallback={<div className="text-slate-500 text-sm p-4">{t("Loading…", "جارٍ التحميل…")}</div>}><PublicShopSettings /></Suspense> :
              <div className={`${CARD} p-6 text-sm text-slate-400`} data-testid="public-other">{t("Public shop settings apply to your current branch. Switch to this branch from the top bar first.", "إعدادات المتجر العام تخص فرعك الحالي. بدّل إلى هذا الفرع من الشريط العلوي أولًا.")}</div>}</div>}
          </>)}
        </div>

        <aside className={`${CARD} p-3 order-1 lg:order-2`} data-testid="bs-list">
          <div className="flex items-center justify-between mb-2"><h3 className="font-bold text-sm">{t("Registered branches", "الفروع المسجلة")} <span className="font-mono text-slate-500" dir="ltr">({shops.length})</span></h3></div>
          <div className="relative mb-2"><Search size={14} className="absolute top-1/2 -translate-y-1/2 start-3 text-slate-500" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search branch…", "بحث عن فرع…")} className={`${INP} ps-9`} data-testid="bs-search" /></div>
          <div className="space-y-2 max-h-[70vh] overflow-auto">
            {list.map((s) => { const n = whs.filter((w) => w.branch_id === s.id && w.is_active).length; return (
              <button key={s.id} type="button" onClick={() => pickShop(s.id)} data-testid="bs-item" data-id={s.id} data-active={s.is_active ? "1" : "0"} aria-current={s.id === selId}
                className={`w-full text-start rounded-xl border p-3 flex items-center gap-3 ${s.id === selId ? "border-blue-500 bg-blue-500/10" : "border-slate-800 hover:border-slate-600"}`}>
                <div className="w-9 h-9 rounded-lg bg-slate-800 flex items-center justify-center text-blue-300 shrink-0"><Store size={17} /></div>
                <div className="min-w-0 flex-1"><div className="text-sm font-bold truncate">{s.shop_name}</div><div className="text-[11px] text-slate-500 flex gap-2"><span>{typeLabel(s.shop_type)[l2]}</span><span>{n} {t("warehouse", "مخزن")}</span></div></div>
                <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${s.is_active ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300"}`}>{s.is_active ? t("Active", "نشط") : t("Inactive", "موقوف")}</span>
              </button>); })}
            {list.length === 0 && <div className="text-center text-xs text-slate-500 py-6" data-testid="bs-none">{t("No matching branches.", "لا فروع مطابقة.")}</div>}
          </div>
        </aside>
      </div>

      {pv && sh && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3" data-testid="pv-modal" onClick={() => setPv(null)}>
        <div className={`${CARD} w-full max-w-4xl max-h-[94vh] flex flex-col`} onClick={(e) => e.stopPropagation()} dir={isRTL ? "rtl" : "ltr"} role="dialog">
          <div className="flex flex-wrap items-center justify-between gap-2 p-3 border-b border-slate-800"><h3 className="font-bold text-sm">{(() => { const k = DOC_KINDS.find((x) => x.kind === pv.kind); return k ? t(k.en, k.ar) : ""; })()}</h3>
            <div className="flex items-center gap-2"><select value={pv.lang} onChange={(e) => setPv({ ...pv, lang: e.target.value as DocLang })} className={`${INP} !w-auto !py-1.5 text-xs`} data-testid="pv-lang" aria-label={t("Language", "اللغة")}>{DOC_LANGS.map((x) => <option key={x} value={x}>{x === "ui" ? t("Interface language", "لغة الواجهة") : x === "ar" ? "العربية" : x === "en" ? "English" : t("Bilingual", "ثنائي")}</option>)}</select>
              <button type="button" onClick={ppPrintNow} className={BTN_BLUE} data-testid="pv-print"><Printer size={14} />{t("Print", "طباعة")}</button><button type="button" onClick={() => setPv(null)} className={BTN} data-testid="pv-close" aria-label={t("Close", "إغلاق")}><X size={14} /></button></div></div>
          <iframe title="preview" srcDoc={pvHTML} sandbox="" className="flex-1 min-h-[60vh] bg-white rounded-b-2xl" data-testid="pv-frame" /></div></div>}

      {copyOpen && sh && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" data-testid="cp-modal" onClick={() => setCopyOpen(false)}>
        <div className={`${CARD} p-5 w-full max-w-md space-y-3`} onClick={(e) => e.stopPropagation()} dir={isRTL ? "rtl" : "ltr"} role="dialog">
          <h3 className="font-bold flex items-center gap-2"><Copy size={16} />{t(`Copy settings to "${sh.shop_name}"`, `نسخ الإعدادات إلى «${sh.shop_name}»`)}</h3>
          <div><label className={LBL}>{t("Copy from", "النسخ من")}</label><select value={cp.from} onChange={(e) => setCp({ ...cp, from: e.target.value ? Number(e.target.value) : "" })} className={INP} data-testid="cp-from"><option value="">{t("— choose a branch —", "— اختر فرعًا —")}</option>{shops.filter((s) => s.id !== sh.id).map((s) => <option key={s.id} value={s.id}>{s.shop_name}</option>)}</select></div>
          <div className="space-y-1.5 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={cp.map} onChange={(e) => setCp({ ...cp, map: e.target.checked })} data-testid="cp-map" /><Wallet size={14} />{t("Accounting link", "الربط المحاسبي")}</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={cp.print} onChange={(e) => setCp({ ...cp, print: e.target.checked })} data-testid="cp-print" /><Printer size={14} />{t("Print settings (this device)", "إعدادات الطباعة (هذا الجهاز)")}</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={cp.margin} onChange={(e) => setCp({ ...cp, margin: e.target.checked })} data-testid="cp-margin" />{t("Default profit margin", "هامش الربح الافتراضي")}</label></div>
          <p className="text-[11px] text-slate-500">{t("Branch identity (name, phone, address…) and warehouses are never copied.", "هوية الفرع (الاسم والهاتف والعنوان…) والمخازن لا تُنسخ أبدًا.")}</p>
          <div className="flex justify-end gap-2"><button type="button" onClick={() => setCopyOpen(false)} className={BTN} data-testid="cp-cancel">{t("Cancel", "إلغاء")}</button><button type="button" onClick={() => void doCopy()} disabled={cp.from === "" || (!cp.map && !cp.print && !cp.margin) || busy} className={BTN_BLUE} data-testid="cp-go"><Check size={15} />{t("Copy", "نسخ")}</button></div></div></div>}
    </div>
  );
}
