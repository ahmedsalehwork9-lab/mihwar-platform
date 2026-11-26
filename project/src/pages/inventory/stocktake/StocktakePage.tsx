// =============================================================
// src/pages/inventory/stocktake/StocktakePage.tsx
// الجرد والتسويات: 4 خطوات (بيانات الجرد ← إدخال الكميات ← مراجعة الفروقات ← اعتماد التسوية)،
// مسودات محلية، سجل الجرود المعتمدة، Excel + طباعة. ثنائي اللغة RTL/LTR.
// الاعتماد: حركة adjust لكل صنف + قيد مجمّع اختياري (غير ذرّي — يُعرض الفاشل صراحةً).
// =============================================================
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { AlertTriangle, Check, ClipboardCheck, Download, Printer, Save, ScanLine, Search, Trash2, X } from "lucide-react";
import { useAuth } from "../../../context/AuthContext";
import { useLang } from "../../../context/LanguageContext";
import * as DB from "../../lib/accountingDb";
import { buildReportHTML, openPrint, type ReportCol } from "../../accounting/shared/printReport";
import { fetchShopHead, type ShopHead } from "../itemMovement/movementApi";
import * as API from "./stocktakeApi";
import {
  DEFAULT_SCOPE, adjustable, countNo, diffRows, drifted, glPlan, groupHistory, groupValues, loadDrafts, parseQty, saveDrafts, scanFind, scopeItems, totals, upsertDraft,
  type CountItem, type CountScope, type Draft, type DiffKind, type DiffRow, type HistMove, type Step, type Uncounted,
} from "./stocktakeLogic";

const CARD = "bg-slate-900 border border-slate-800 rounded-2xl";
const INPUT = "w-full bg-slate-950 border border-slate-700 rounded-xl text-white px-3 py-2 text-sm outline-none focus:border-blue-500 transition-colors";
const DATE = INPUT + " [color-scheme:dark]";
const LABEL = "text-[10px] text-slate-500 font-bold mb-1 block";
const BTN_SOFT = "inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 hover:text-white font-bold text-xs transition-colors disabled:opacity-50";
const BTN_BLUE = "inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
const fmt = (n: number): string => (Math.round(n * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qf = (n: number): string => (Math.round(n * 1000) / 1000).toLocaleString("en-US", { maximumFractionDigits: 3 });
const todayStr = (): string => new Date().toISOString().slice(0, 10);
const PAGE = 100;
type View = "count" | "drafts" | "history";
type RowFilter = "all" | "uncounted" | "counted" | "diff";
type ReviewFilter = "all" | DiffKind;
const KIND_TXT: Record<DiffKind, { en: string; ar: string; tone: string }> = {
  surplus: { en: "Surplus", ar: "زيادة", tone: "bg-emerald-500/15 text-emerald-300" }, shortage: { en: "Shortage", ar: "عجز", tone: "bg-red-500/15 text-red-300" },
  match: { en: "Match", ar: "مطابق", tone: "bg-slate-700 text-slate-300" }, uncounted: { en: "Not counted", ar: "لم يُعَد", tone: "bg-amber-500/15 text-amber-300" },
};
const newId = (): string => `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const store = (): Storage | null => { try { return window.localStorage; } catch { return null; } };

export default function StocktakePage() {
  const { t, lang, isRTL } = useLang();
  const auth = (useAuth() as unknown as { ownedShopId: number | null; branches?: { id: number; name: string }[]; user?: { id?: string } }) ?? { ownedShopId: null };
  const { ownedShopId, branches } = auth; const userId = auth.user?.id ?? null;
  const l2 = lang === "en" ? "en" : "ar";
  const [org, setOrg] = useState<{ id: number; name: string } | null>(null);
  const [shop, setShop] = useState<ShopHead>(null);
  const [accounts, setAccounts] = useState<DB.GLAccount[]>([]);
  const [view, setView] = useState<View>("count");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [hist, setHist] = useState<HistMove[]>([]);
  // ── الجرد الحالي ──
  const [id, setId] = useState<string>(newId());
  const [no, setNo] = useState(""); const [name, setName] = useState(""); const [date, setDate] = useState(todayStr());
  const [shopId, setShopId] = useState<number | null>(ownedShopId ?? null);
  const [scope, setScope] = useState<CountScope>(DEFAULT_SCOPE);
  const [counts, setCounts] = useState<Record<string, number>>({}); const [raw, setRaw] = useState<Record<string, string>>({});
  const [uncounted, setUncounted] = useState<Uncounted>("keep"); const [reason, setReason] = useState("");
  const [step, setStep] = useState<Step>(1);
  const [items, setItems] = useState<CountItem[]>([]); const [loadingItems, setLoadingItems] = useState(false); const [itemsErr, setItemsErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // step 2
  const [q, setQ] = useState(""); const [rowFilter, setRowFilter] = useState<RowFilter>("all"); const [page, setPage] = useState(0); const [blind, setBlind] = useState(false);
  const [scanMsg, setScanMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const inputRefs = useRef<Record<number, HTMLInputElement | null>>({}); const scanRef = useRef<HTMLInputElement>(null);
  // step 3
  const [revFilter, setRevFilter] = useState<ReviewFilter>("all");
  // step 4
  const [postGl, setPostGl] = useState(false); const [counterAcc, setCounterAcc] = useState<number | "">(""); const [confirmed, setConfirmed] = useState(false);
  const [applying, setApplying] = useState(false); const [fresh, setFresh] = useState<Map<number, number> | null>(null); const [result, setResult] = useState<API.ApplyResult | null>(null);
  const [pickQ, setPickQ] = useState("");

  const flash = (m: string) => { setToast(m); window.setTimeout(() => setToast(null), 3500); };

  useEffect(() => { let alive = true; void (async () => {
    const o = await DB.getOrgForBranch(ownedShopId ?? null); if (!alive || !o) return; setOrg(o);
    setAccounts(await DB.fetchAccounts(o.id)); if (ownedShopId) setShop(await fetchShopHead(Number(ownedShopId)));
    setDrafts(loadDrafts(store()));
  })(); return () => { alive = false; }; }, [ownedShopId]);

  // أصناف الفرع المختار
  const loadItems = useCallback(async (sid: number | null) => {
    if (sid == null) { setItems([]); return; }
    setLoadingItems(true); setItemsErr(null); const r = await API.fetchCountItems(sid); setItems(r.items); setItemsErr(r.error); setLoadingItems(false);
  }, []);
  useEffect(() => { void loadItems(shopId); }, [shopId, loadItems]);
  useEffect(() => { if (org && view === "history") void API.fetchHistory(org.id, shopId).then(setHist); }, [org, view, shopId]);
  useEffect(() => { if (!no && date) setNo(countNo(date, drafts.map((d) => d.no))); }, [no, date, drafts]);

  const inScope = useMemo(() => scopeItems(items, scope), [items, scope]);
  const cats = useMemo(() => groupValues(items, "category"), [items]); const brands = useMemo(() => groupValues(items, "brand"), [items]);
  const rows = useMemo(() => diffRows(inScope, counts, uncounted), [inScope, counts, uncounted]);
  const tot = useMemo(() => totals(rows), [rows]);
  const adj = useMemo(() => adjustable(rows), [rows]);
  const plan = useMemo(() => glPlan(adj), [adj]);

  const inventoryAcc = useMemo(() => accounts.find((a) => a.code === "1104" && !a.is_group) ?? accounts.find((a) => a.type === "asset" && !a.is_group && /مخزون|inventory/i.test(a.name)), [accounts]);
  const counterOptions = useMemo(() => accounts.filter((a) => !a.is_group && (a.type === "expense" || a.type === "revenue" || /تسوي|عجز|فائض|تالف/.test(a.name))), [accounts]);
  useEffect(() => { if (postGl && !counterAcc) { const d = accounts.find((a) => !a.is_group && /تسوي(ة|ات) المخزون|تسوية مخزون/.test(a.name)) ?? counterOptions[0]; if (d) setCounterAcc(d.id); } }, [postGl, accounts, counterOptions, counterAcc]);

  const countedN = useMemo(() => inScope.filter((i) => Object.prototype.hasOwnProperty.call(counts, String(i.id))).length, [inScope, counts]);
  const visible = useMemo(() => {
    const s = q.trim().toLowerCase();
    return inScope.filter((i) => {
      const has = Object.prototype.hasOwnProperty.call(counts, String(i.id));
      if (rowFilter === "uncounted" && has) return false; if (rowFilter === "counted" && !has) return false;
      if (rowFilter === "diff" && !(has && counts[String(i.id)] !== i.book)) return false;
      return !s || i.name.toLowerCase().includes(s) || (i.code ?? "").toLowerCase().includes(s) || (i.barcode ?? "").toLowerCase().includes(s);
    });
  }, [inScope, counts, q, rowFilter]);
  const pages = Math.max(1, Math.ceil(visible.length / PAGE)); const pageRows = visible.slice(page * PAGE, page * PAGE + PAGE);
  useEffect(() => { if (page >= pages) setPage(0); }, [pages, page]);

  const setCount = (itemId: number, text: string) => {
    setRaw((r) => ({ ...r, [itemId]: text })); const v = parseQty(text);
    setCounts((c) => { const n = { ...c }; if (v == null) delete n[String(itemId)]; else n[String(itemId)] = v; return n; });
  };
  const onScan = (code: string) => {
    const it = scanFind(inScope, code); if (!it) { setScanMsg({ ok: false, text: t(`Not in count scope: ${code}`, `غير موجود في نطاق الجرد: ${code}`) }); return; }
    const v = ((counts[String(it.id)] ?? 0) * 1000 + 1000) / 1000; setCount(it.id, String(v)); setScanMsg({ ok: true, text: `${it.name} → ${qf(v)}` });
  };

  // ── المسودات ──
  const snapshot = (st: Step = step): Draft => ({ v: 1, id, no, name, date, shopId, scope, counts, uncounted, reason, step: st, updatedAt: new Date().toISOString() });
  const saveDraft = (st: Step = step, quiet = false) => {
    const next = upsertDraft(drafts, snapshot(st)); const ok = saveDrafts(store(), next); setDrafts(next);
    if (!quiet) flash(ok ? t("Draft saved on this device.", "حُفظت المسودة على هذا الجهاز.") : t("Could not save draft (browser storage unavailable).", "تعذّر حفظ المسودة (تخزين المتصفح غير متاح)."));
  };
  const resetAll = () => { setId(newId()); setNo(""); setName(""); setDate(todayStr()); setScope(DEFAULT_SCOPE); setCounts({}); setRaw({}); setUncounted("keep"); setReason(""); setStep(1); setResult(null); setConfirmed(false); setFresh(null); setPostGl(false); setQ(""); setRowFilter("all"); setPage(0); setScanMsg(null); };
  const resume = (d: Draft) => {
    setId(d.id); setNo(d.no); setName(d.name); setDate(d.date); setShopId(d.shopId); setScope(d.scope); setCounts(d.counts); setRaw(Object.fromEntries(Object.entries(d.counts).map(([k, v]) => [k, String(v)])));
    setUncounted(d.uncounted); setReason(d.reason); setStep(d.step); setResult(null); setConfirmed(false); setFresh(null); setView("count");
  };
  const delDraft = (did: string) => { const next = drafts.filter((d) => d.id !== did); saveDrafts(store(), next); setDrafts(next); };

  // ── التنقل ──
  const canNext2 = inScope.length > 0 && !loadingItems; const canNext3 = tot.counted > 0; const canNext4 = adj.length > 0;
  const go = (s: Step) => { setStep(s); saveDraft(s, true); if (s === 4) void checkDrift(); };
  const checkDrift = async () => { const m = await API.fetchCurrentQty(adj.map((r) => r.item.id)); setFresh(m); };
  const drift = useMemo(() => (fresh ? drifted(adj.map((r) => r.item), fresh) : []), [fresh, adj]);
  const refreshBook = () => { if (!fresh) return; setItems((all) => all.map((i) => (fresh.has(i.id) ? { ...i, book: fresh.get(i.id) as number } : i))); void checkDrift(); };

  const approve = async () => {
    if (!org) return; if (reason.trim() === "") { flash(t("Write the reason first.", "اكتب السبب أولًا.")); return; }
    if (postGl && (!inventoryAcc || !counterAcc)) { flash(t("Choose the adjustment account (and make sure account 1104 exists).", "اختر حساب التسوية (وتأكّد من وجود حساب المخزون 1104).")); return; }
    setApplying(true);
    const r = await API.applyStocktake({ orgId: org.id, branchId: shopId, no, reason: reason.trim(), date, userId, rows: adj, gl: postGl && inventoryAcc && counterAcc ? { inventoryAccountId: inventoryAcc.id, counterAccountId: Number(counterAcc) } : null });
    setApplying(false); setResult(r); if (r.failed.length === 0) delDraft(id); else saveDraft(4, true);
    void loadItems(shopId);
  };

  // ── تصدير/طباعة المراجعة ──
  const revRows = useMemo(() => rows.filter((r) => revFilter === "all" || r.kind === revFilter), [rows, revFilter]);
  const heads = [t("Code", "الكود"), t("Item", "الصنف"), t("Book qty", "الرصيد الدفتري"), t("Actual", "الفعلي"), t("Difference", "الفرق"), t("Type", "النوع"), t("Cost", "التكلفة"), t("Value", "القيمة")];
  const cell = (r: DiffRow): (string | number)[] => [r.item.code ?? "", r.item.name, r.item.book, r.actual ?? "", r.kind === "uncounted" ? "" : r.diff, KIND_TXT[r.kind][l2], r.item.cost, r.kind === "uncounted" ? "" : r.value];
  const title = `${t("Stock count", "جرد المخزون")} ${no}${name ? ` — ${name}` : ""}`;
  const sub = `${date} · ${t("Surplus", "زيادة")} ${fmt(tot.surplusValue)} · ${t("Shortage", "عجز")} ${fmt(tot.shortageValue)} · ${t("Net", "الصافي")} ${fmt(tot.netValue)}`;
  const exportX = () => {
    const ws = XLSX.utils.aoa_to_sheet([[title, sub], [], heads, ...revRows.map(cell), [], [t("Net difference value", "صافي قيمة الفروقات"), "", "", "", tot.netQty, "", "", tot.netValue]]);
    ws["!cols"] = heads.map((_, i) => ({ wch: i === 1 ? 34 : 14 })); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Stocktake"); XLSX.writeFile(wb, `stocktake_${no}_${todayStr()}.xlsx`);
  };
  const printX = () => {
    const cols: ReportCol[] = [{ label: heads[0], mono: true }, { label: heads[1] }, ...[2, 3, 4].map((i) => ({ label: heads[i], mono: true, align: "end" as const })), { label: heads[5] }, ...[6, 7].map((i) => ({ label: heads[i], mono: true, align: "end" as const }))];
    const ok = openPrint(buildReportHTML({ title, subtitle: sub, orgName: shop?.shop_name || org?.name || "", taxNumber: shop?.tax_number, logoUrl: shop?.logo_url, address: shop?.address, dir: isRTL ? "rtl" : "ltr", lang: l2, cols, rows: revRows.map(cell), totals: [t("Net", "الصافي"), "", "", "", tot.netQty, "", "", tot.netValue] }));
    if (!ok) alert(t("Allow pop-ups to print.", "فعّل النوافذ المنبثقة للطباعة."));
  };

  const th = "text-[10px] px-2 py-2.5 bg-slate-950 text-slate-400 whitespace-nowrap border-b border-slate-700 font-bold sticky top-0 z-10 text-start";
  const td = "px-2 py-1.5 text-xs border-b border-slate-800";
  const kpi = (tid: string, label: string, val: string, tone: string) => <div className={`${CARD} p-3`}><div className="text-[10px] text-slate-500 font-bold">{label}</div><div className={`text-lg font-extrabold font-mono mt-0.5 ${tone}`} dir="ltr" data-testid={tid}>{val}</div></div>;
  const chip = (active: boolean, label: string, on: () => void, tid: string) => <button type="button" onClick={on} data-testid={tid} className={`px-3 py-1.5 rounded-lg text-[11px] font-bold ${active ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white"}`}>{label}</button>;
  const steps: { n: Step; label: string }[] = [{ n: 1, label: t("Count data", "بيانات الجرد") }, { n: 2, label: t("Enter quantities", "إدخال الكميات") }, { n: 3, label: t("Review differences", "مراجعة الفروقات") }, { n: 4, label: t("Approve settlement", "اعتماد التسوية") }];
  const statusLabel = result ? t("Approved", "معتمد") : step === 1 ? t("New", "جديد") : t("Draft", "مسودة");
  const toggleVal = (key: "values", v: string) => setScope((s) => ({ ...s, [key]: s.values.includes(v) ? s.values.filter((x) => x !== v) : [...s.values, v] }));
  const pickHits = useMemo(() => { const s = pickQ.trim().toLowerCase(); return s ? items.filter((i) => i.name.toLowerCase().includes(s) || (i.code ?? "").toLowerCase().includes(s) || (i.barcode ?? "").toLowerCase().includes(s)).slice(0, 8) : []; }, [items, pickQ]);

  return (
    <div className="p-4 md:p-6 max-w-[1500px] mx-auto" dir={isRTL ? "rtl" : "ltr"} data-testid="stocktake">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3"><div className="w-11 h-11 rounded-2xl bg-indigo-500/15 text-indigo-400 flex items-center justify-center"><ClipboardCheck size={22} /></div>
          <div><h1 className="text-xl font-black text-white">{t("Stock count & adjustments", "الجرد والتسويات")}</h1><p className="text-xs text-slate-500">{org?.name ?? "—"}</p></div></div>
        <div className="flex gap-2">{chip(view === "count", t("Count", "الجرد"), () => setView("count"), "v-count")}{chip(view === "drafts", `${t("Drafts", "المسودات")} (${drafts.length})`, () => setView("drafts"), "v-drafts")}{chip(view === "history", t("Approved counts", "الجرود المعتمدة"), () => setView("history"), "v-history")}</div>
      </div>
      {toast && <div className="mb-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-xs text-emerald-300" data-testid="st-toast">{toast}</div>}

      {view === "drafts" && (
        <div className={`${CARD} p-4`} data-testid="drafts-panel">
          <table className="w-full text-xs"><thead><tr className="text-[10px] text-slate-500"><th className="text-start py-1">{t("No.", "الرقم")}</th><th className="text-start">{t("Name", "الاسم")}</th><th className="text-start">{t("Date", "التاريخ")}</th><th className="text-end" dir="ltr">{t("Counted", "المعدود")}</th><th className="text-start">{t("Step", "الخطوة")}</th><th /></tr></thead>
            <tbody>{drafts.map((d) => <tr key={d.id} className="border-t border-slate-800" data-testid="draft-row"><td className="py-2 font-mono text-blue-300" dir="ltr">{d.no}</td><td className="text-slate-200">{d.name || "—"}</td><td className="font-mono text-slate-400" dir="ltr">{d.date}</td>
              <td className="text-end font-mono text-slate-300" dir="ltr">{Object.keys(d.counts).length}</td><td className="text-slate-400">{steps[d.step - 1].label}</td>
              <td className="text-end whitespace-nowrap"><button type="button" onClick={() => resume(d)} className={BTN_SOFT} data-testid="draft-resume">{t("Resume", "متابعة")}</button> <button type="button" onClick={() => delDraft(d.id)} aria-label={t("Delete", "حذف")} className={BTN_SOFT} data-testid="draft-delete"><Trash2 size={13} /></button></td></tr>)}</tbody></table>
          {drafts.length === 0 && <div className="text-center text-slate-500 text-xs py-8" data-testid="drafts-none">{t("No saved drafts.", "لا توجد مسودات محفوظة.")}</div>}
          <div className="mt-3 text-[10px] text-slate-500">{t("Drafts are stored in this browser only.", "المسودات تُحفظ في هذا المتصفح فقط.")}</div>
        </div>
      )}

      {view === "history" && (
        <div className={`${CARD} p-4`} data-testid="history-panel">
          <table className="w-full text-xs"><thead><tr className="text-[10px] text-slate-500"><th className="text-start py-1">{t("No.", "الرقم")}</th><th className="text-start">{t("Date", "التاريخ")}</th><th className="text-start">{t("Reason", "السبب")}</th><th className="text-end" dir="ltr">{t("Items", "الأصناف")}</th><th className="text-end" dir="ltr">{t("Surplus", "زيادة")}</th><th className="text-end" dir="ltr">{t("Shortage", "عجز")}</th><th className="text-end" dir="ltr">{t("Net value", "صافي القيمة")}</th></tr></thead>
            <tbody>{groupHistory(hist).map((g) => <tr key={g.no + g.date} className="border-t border-slate-800" data-testid="hist-row"><td className="py-2 font-mono text-blue-300" dir="ltr">{g.no}</td><td className="font-mono text-slate-400" dir="ltr">{g.date}</td><td className="text-slate-300">{g.reason || "—"}</td>
              <td className="text-end font-mono" dir="ltr">{g.items}</td><td className="text-end font-mono text-emerald-400" dir="ltr">{g.surplus}</td><td className="text-end font-mono text-red-300" dir="ltr">{g.shortage}</td><td className={`text-end font-mono ${g.netValue < 0 ? "text-red-300" : "text-emerald-400"}`} dir="ltr">{fmt(g.netValue)}</td></tr>)}</tbody></table>
          {hist.length === 0 && <div className="text-center text-slate-500 text-xs py-8" data-testid="hist-none">{t("No approved counts yet.", "لا توجد جرود معتمدة بعد.")}</div>}
        </div>
      )}

      {view === "count" && (
        <>
          <ol className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4" data-testid="stepper">
            {steps.map((s) => <li key={s.n} data-testid={`step-${s.n}`} data-active={step === s.n ? "1" : undefined} className={`rounded-xl border px-3 py-2 text-xs font-bold flex items-center gap-2 ${step === s.n ? "border-blue-500 bg-blue-500/10 text-white" : step > s.n ? "border-emerald-500/30 text-emerald-300" : "border-slate-800 text-slate-500"}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${step > s.n ? "bg-emerald-500 text-white" : "bg-slate-800"}`}>{step > s.n ? <Check size={11} /> : s.n}</span>{s.label}</li>)}
          </ol>

          {result ? (
            <div className={`${CARD} p-5`} data-testid="result-panel">
              <div className="flex items-center gap-2 text-base font-black text-white mb-3"><Check className="text-emerald-400" size={20} />{t("Settlement processed", "تمت معالجة التسوية")} <span className="font-mono text-blue-300 text-sm" dir="ltr">{no}</span></div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">{kpi("r-applied", t("Adjusted", "تمت تسويتها"), String(result.applied.length), "text-emerald-400")}{kpi("r-skipped", t("Skipped (no change)", "بلا تغيير"), String(result.skipped), "text-slate-300")}{kpi("r-failed", t("Failed", "فشلت"), String(result.failed.length), result.failed.length ? "text-red-300" : "text-slate-300")}{kpi("r-entry", t("Journal entry", "القيد"), result.entryId ? `#${result.entryId}` : "—", "text-violet-300")}</div>
              {result.glError && <div className="mb-3 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-2.5 text-xs text-red-300" data-testid="r-gl-error">{t("Stock was adjusted but the journal entry failed: ", "عُدِّل المخزون لكن فشل القيد المحاسبي: ")}{result.glError}</div>}
              {result.failed.length > 0 && <div className="mb-3 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-2.5 text-xs text-red-300" data-testid="r-failed-list"><div className="font-bold mb-1">{t("These items were NOT adjusted (the rest were). The draft is kept; fix and approve again — items already adjusted will be skipped.", "هذه الأصناف لم تُسوَّ (والباقي سُوِّي). المسودة محفوظة؛ عالج السبب ثم اعتمد مرة أخرى — ما سُوِّي مسبقًا يُتخطّى.")}</div>{result.failed.map((f) => <div key={f.id}>{f.name}: {f.error}</div>)}</div>}
              <button type="button" onClick={resetAll} className={BTN_BLUE} data-testid="new-count">{t("New count", "جرد جديد")}</button>
            </div>
          ) : (
            <>
              {step === 1 && (
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] items-start" data-testid="step1-panel">
                  <div className={`${CARD} p-4 space-y-4`}>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                      <div><label className={LABEL}>{t("Count no.", "رقم الجرد")}</label><input value={no} readOnly className={INPUT + " font-mono"} dir="ltr" data-testid="f-no" /></div>
                      <div className="md:col-span-1"><label className={LABEL}>{t("Count name", "اسم الجرد")}</label><input value={name} onChange={(e) => setName(e.target.value)} className={INPUT} placeholder={t("e.g. Year-end count", "مثال: جرد نهاية السنة")} data-testid="f-name" /></div>
                      <div><label className={LABEL}>{t("Date", "التاريخ")}</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={DATE} data-testid="f-date" /></div>
                      <div><label className={LABEL}>{t("Branch", "الفرع")}</label>
                        <select value={shopId ?? ""} onChange={(e) => { const v = e.target.value ? Number(e.target.value) : null; setShopId(v); setCounts({}); setRaw({}); setScope(DEFAULT_SCOPE); }} className={INPUT} data-testid="f-branch">
                          {(branches && branches.length ? branches : ownedShopId ? [{ id: Number(ownedShopId), name: `#${ownedShopId}` }] : []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
                    </div>
                    <div>
                      <label className={LABEL}>{t("Count scope", "نطاق الجرد")}</label>
                      <div className="flex flex-wrap gap-2">{([["all", t("All items", "كل الأصناف")], ["category", t("By group", "حسب المجموعة")], ["brand", t("By brand", "حسب الماركة")], ["pick", t("Selected items", "أصناف محددة")]] as const).map(([k, l]) => chip(scope.mode === k, l, () => setScope({ ...scope, mode: k, values: [] }), `scope-${k}`))}</div>
                      {(scope.mode === "category" || scope.mode === "brand") && (
                        <div className="mt-3 flex flex-wrap gap-2 max-h-40 overflow-auto" data-testid="scope-values">{(scope.mode === "category" ? cats : brands).map((g) => (
                          <button type="button" key={g.value} onClick={() => toggleVal("values", g.value)} data-testid="scope-value" data-on={scope.values.includes(g.value) ? "1" : undefined} className={`px-2.5 py-1 rounded-lg text-[11px] border ${scope.values.includes(g.value) ? "border-blue-500 bg-blue-500/10 text-white" : "border-slate-700 text-slate-400"}`}>{g.value || t("(none)", "(بدون)")} <span className="font-mono text-slate-500">{g.count}</span></button>))}</div>)}
                      {scope.mode === "pick" && (
                        <div className="mt-3"><div className="relative"><Search size={14} className="absolute top-1/2 -translate-y-1/2 start-3 text-slate-500" /><input value={pickQ} onChange={(e) => setPickQ(e.target.value)} className={INPUT + " ps-9"} placeholder={t("Search to add items…", "ابحث لإضافة أصناف…")} data-testid="pick-search" /></div>
                          {pickHits.length > 0 && <div className="mt-1 rounded-xl border border-slate-700 bg-slate-950 divide-y divide-slate-800" data-testid="pick-hits">{pickHits.map((h) => <button type="button" key={h.id} onClick={() => { setScope((s) => (s.ids.includes(h.id) ? s : { ...s, ids: [...s.ids, h.id] })); setPickQ(""); }} data-testid="pick-hit" className="w-full text-start px-3 py-2 text-xs text-slate-200 hover:bg-slate-800">{h.name} <span className="font-mono text-slate-500" dir="ltr">{h.code ?? ""}</span></button>)}</div>}
                          <div className="mt-2 flex flex-wrap gap-1.5" data-testid="picked">{scope.ids.map((pid) => <span key={pid} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800 text-[11px] text-slate-200">{items.find((i) => i.id === pid)?.name ?? `#${pid}`}<button type="button" aria-label={t("Remove", "إزالة")} onClick={() => setScope((s) => ({ ...s, ids: s.ids.filter((x) => x !== pid) }))}><X size={11} /></button></span>)}</div></div>)}
                    </div>
                    <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer"><input type="checkbox" className="accent-blue-500" checked={scope.includeZero} onChange={(e) => setScope({ ...scope, includeZero: e.target.checked })} data-testid="f-zero" />{t("Include items with zero book balance", "تضمين الأصناف ذات الرصيد الدفتري صفر")}</label>
                  </div>
                  <div className={`${CARD} p-4`}>
                    <div className="text-xs font-bold text-slate-300 mb-3">{t("Scope summary", "ملخص النطاق")}</div>
                    <dl className="grid grid-cols-2 gap-y-2 text-[11px]"><dt className="text-slate-500">{t("Items in branch", "أصناف الفرع")}</dt><dd className="font-mono text-end text-slate-200" dir="ltr" data-testid="s-all">{loadingItems ? "…" : items.length}</dd>
                      <dt className="text-slate-500">{t("Items to count", "أصناف للجرد")}</dt><dd className="font-mono text-end text-white font-bold" dir="ltr" data-testid="s-scope">{inScope.length}</dd>
                      <dt className="text-slate-500">{t("Book value", "القيمة الدفترية")}</dt><dd className="font-mono text-end text-violet-300" dir="ltr" data-testid="s-value">{fmt(inScope.reduce((a, i) => a + i.book * i.cost, 0))}</dd></dl>
                    {itemsErr && <div className="mt-3 text-[11px] text-red-300" data-testid="items-err">{itemsErr}</div>}
                    <button type="button" disabled={!canNext2} onClick={() => go(2)} className={BTN_BLUE + " w-full mt-4"} data-testid="to-2">{t("Start counting", "ابدأ إدخال الكميات")}</button>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div data-testid="step2-panel" className="space-y-3">
                  <div className={`${CARD} p-3 flex flex-wrap items-end gap-3`}>
                    <div className="grow basis-56"><label className={LABEL}><ScanLine size={11} className="inline" /> {t("Scan barcode / code (adds 1)", "مسح باركود / كود (يضيف 1)")}</label>
                      <input ref={scanRef} className={INPUT + " font-mono"} dir="ltr" data-testid="st-scan" autoComplete="off" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); const v = (e.target as HTMLInputElement).value; if (v.trim()) { onScan(v); (e.target as HTMLInputElement).value = ""; } } }} />
                      {scanMsg && <div className={`mt-1 text-[11px] ${scanMsg.ok ? "text-emerald-300" : "text-red-300"}`} data-testid="st-scan-msg">{scanMsg.text}</div>}</div>
                    <div className="grow basis-48"><label className={LABEL}>{t("Search", "بحث")}</label><input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} className={INPUT} data-testid="st-q" placeholder={t("name, code, barcode…", "اسم، كود، باركود…")} /></div>
                    <div className="flex flex-wrap gap-1.5">{([["all", t("All", "الكل")], ["uncounted", t("Not counted", "لم يُعَد")], ["counted", t("Counted", "المعدود")], ["diff", t("Different", "به فرق")]] as const).map(([k, l]) => chip(rowFilter === k, l, () => { setRowFilter(k); setPage(0); }, `rf-${k}`))}</div>
                    <label className="flex items-center gap-2 text-[11px] text-slate-300 cursor-pointer"><input type="checkbox" className="accent-blue-500" checked={blind} onChange={(e) => setBlind(e.target.checked)} data-testid="st-blind" />{t("Blind count (hide book qty)", "جرد أعمى (إخفاء الرصيد الدفتري)")}</label>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-slate-400"><div className="grow h-2 rounded-full bg-slate-800 overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${inScope.length ? (countedN / inScope.length) * 100 : 0}%` }} /></div><span className="font-mono" dir="ltr" data-testid="st-progress">{countedN} / {inScope.length}</span></div>
                  <div className={`${CARD} overflow-x-auto`}><table className="w-full border-collapse" style={{ minWidth: 640 }} data-testid="st-table"><thead><tr><th className={th}>{t("Code", "الكود")}</th><th className={th}>{t("Item", "الصنف")}</th><th className={th + " text-end"}>{t("Book qty", "الرصيد الدفتري")}</th><th className={th + " text-end"} style={{ width: 130 }}>{t("Actual count", "الكمية الفعلية")}</th><th className={th + " text-end"}>{t("Diff", "الفرق")}</th></tr></thead>
                    <tbody>{pageRows.map((i, idx) => { const c = counts[String(i.id)]; const has = c !== undefined; const d = has ? Math.round((c - i.book) * 1000) / 1000 : null; return (
                      <tr key={i.id} className="hover:bg-white/[0.03]" data-testid="st-row">
                        <td className={`${td} font-mono text-slate-400`} dir="ltr">{i.code ?? "—"}</td><td className={`${td} text-slate-100`}>{i.name}</td>
                        <td className={`${td} text-end font-mono text-slate-300`} dir="ltr" data-testid="st-book">{blind ? "•••" : qf(i.book)}</td>
                        <td className={td}><input ref={(el) => { inputRefs.current[idx] = el; }} value={raw[i.id] ?? (has ? String(c) : "")} inputMode="decimal" dir="ltr" onChange={(e) => setCount(i.id, e.target.value)} aria-label={`${t("Count", "العد")} ${i.name}`} data-testid="st-input"
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); (inputRefs.current[idx + 1] ?? scanRef.current)?.focus(); } }} className="w-full bg-slate-950 border border-slate-700 rounded-lg text-white px-2 py-1.5 text-sm text-end font-mono outline-none focus:border-blue-500" /></td>
                        <td className={`${td} text-end font-mono ${d == null ? "text-slate-600" : d > 0 ? "text-emerald-400" : d < 0 ? "text-red-300" : "text-slate-400"}`} dir="ltr" data-testid="st-diff">{blind ? "" : d == null ? "—" : `${d > 0 ? "+" : ""}${qf(d)}`}</td></tr>); })}</tbody></table>
                    {visible.length === 0 && <div className="p-8 text-center text-xs text-slate-500" data-testid="st-none">{t("No items match.", "لا أصناف مطابقة.")}</div>}</div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-[11px] text-slate-400"><button type="button" disabled={page === 0} onClick={() => setPage(page - 1)} className={BTN_SOFT} data-testid="pg-prev">‹</button><span className="font-mono" dir="ltr" data-testid="pg-info">{page + 1} / {pages}</span><button type="button" disabled={page >= pages - 1} onClick={() => setPage(page + 1)} className={BTN_SOFT} data-testid="pg-next">›</button></div>
                    <div className="flex gap-2"><button type="button" onClick={() => go(1)} className={BTN_SOFT} data-testid="back-1">{t("Back", "رجوع")}</button><button type="button" onClick={() => saveDraft()} className={BTN_SOFT} data-testid="st-save-draft"><Save size={13} /> {t("Save draft", "حفظ كمسودة")}</button><button type="button" disabled={!canNext3} onClick={() => go(3)} className={BTN_BLUE} data-testid="to-3">{t("Review differences", "مراجعة الفروقات")}</button></div>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div data-testid="step3-panel" className="space-y-3">
                  <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                    {kpi("k-status", t("Count status", "حالة الجرد"), statusLabel, "text-sky-300")}{kpi("k-counted", t("Counted items", "الأصناف المعدودة"), `${tot.counted} / ${tot.total}`, "text-white")}
                    {kpi("k-surplus", t("Surplus items", "أصناف بزيادة"), String(tot.surplus), "text-emerald-400")}{kpi("k-shortage", t("Shortage items", "أصناف بعجز"), String(tot.shortage), "text-red-300")}
                    {kpi("k-uncounted", t("Not counted", "لم تُعَد"), String(tot.uncounted), "text-amber-300")}{kpi("k-net", t("Net difference value", "صافي قيمة الفروقات"), fmt(tot.netValue), tot.netValue < 0 ? "text-red-300" : "text-emerald-400")}
                  </div>
                  <div className={`${CARD} p-3 flex flex-wrap items-center gap-3`}>
                    <div className="flex flex-wrap gap-1.5">{([["all", t("All", "الكل")], ["surplus", KIND_TXT.surplus[l2]], ["shortage", KIND_TXT.shortage[l2]], ["match", KIND_TXT.match[l2]], ["uncounted", KIND_TXT.uncounted[l2]]] as const).map(([k, l]) => chip(revFilter === k, l, () => setRevFilter(k), `rv-${k}`))}</div>
                    <div className="flex items-center gap-2 ms-auto"><label className="text-[10px] text-slate-500">{t("Items not counted", "الأصناف غير المعدودة")}</label>
                      <select value={uncounted} onChange={(e) => setUncounted(e.target.value as Uncounted)} className={INPUT + " !py-1 !text-xs w-auto"} data-testid="f-uncounted"><option value="keep">{t("Leave unchanged", "تبقى كما هي")}</option><option value="zero">{t("Treat as zero", "تُعتبر صفرًا")}</option></select></div>
                    <button type="button" onClick={exportX} className={BTN_SOFT} data-testid="rv-export"><Download size={13} /> Excel</button><button type="button" onClick={printX} className={BTN_SOFT} data-testid="rv-print"><Printer size={13} /> {t("Print", "طباعة")}</button>
                  </div>
                  {uncounted === "zero" && tot.shortage > 0 && <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-2 text-xs text-amber-200 flex gap-2" data-testid="zero-warn"><AlertTriangle size={14} className="shrink-0 mt-0.5" />{t("Uncounted items will be written off to zero on approval.", "الأصناف غير المعدودة ستُصفَّر عند الاعتماد.")}</div>}
                  <div className={`${CARD} overflow-x-auto`}><table className="w-full border-collapse" style={{ minWidth: 760 }} data-testid="rv-table"><thead><tr>{heads.map((h, i) => <th key={i} className={th + (i >= 2 && i !== 5 ? " text-end" : "")}>{h}</th>)}</tr></thead>
                    <tbody>{revRows.slice(0, 500).map((r) => <tr key={r.item.id} data-testid="rv-row" data-kind={r.kind} className="hover:bg-white/[0.03]">
                      <td className={`${td} font-mono text-slate-400`} dir="ltr">{r.item.code ?? "—"}</td><td className={`${td} text-slate-100`}>{r.item.name}</td>
                      <td className={`${td} text-end font-mono text-slate-300`} dir="ltr">{qf(r.item.book)}</td><td className={`${td} text-end font-mono text-white`} dir="ltr">{r.actual == null ? "—" : qf(r.actual)}</td>
                      <td className={`${td} text-end font-mono ${r.diff > 0 ? "text-emerald-400" : r.diff < 0 ? "text-red-300" : "text-slate-400"}`} dir="ltr">{r.kind === "uncounted" ? "—" : `${r.diff > 0 ? "+" : ""}${qf(r.diff)}`}</td>
                      <td className={td}><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${KIND_TXT[r.kind].tone}`}>{KIND_TXT[r.kind][l2]}</span></td>
                      <td className={`${td} text-end font-mono text-slate-400`} dir="ltr">{fmt(r.item.cost)}</td><td className={`${td} text-end font-mono ${r.value < 0 ? "text-red-300" : r.value > 0 ? "text-emerald-400" : "text-slate-400"}`} dir="ltr">{r.kind === "uncounted" ? "—" : fmt(r.value)}</td></tr>)}</tbody></table>
                    {revRows.length > 500 && <div className="p-2 text-center text-[10px] text-slate-500">{t(`Showing first 500 of ${revRows.length}; Excel/Print include all.`, `عرض أول 500 من ${revRows.length}؛ Excel والطباعة تشمل الكل.`)}</div>}
                    {revRows.length === 0 && <div className="p-8 text-center text-xs text-slate-500">{t("Nothing to show.", "لا شيء للعرض.")}</div>}</div>
                  <div className="flex justify-end gap-2"><button type="button" onClick={() => go(2)} className={BTN_SOFT} data-testid="back-2">{t("Back", "رجوع")}</button><button type="button" onClick={() => saveDraft()} className={BTN_SOFT} data-testid="rv-save-draft"><Save size={13} /> {t("Save draft", "حفظ كمسودة")}</button><button type="button" disabled={!canNext4} onClick={() => go(4)} className={BTN_BLUE} data-testid="to-4">{t("Approve settlement", "اعتماد التسوية")}</button></div>
                  {!canNext4 && <div className="text-[11px] text-slate-500 text-end" data-testid="no-diff">{t("No differences to settle.", "لا فروقات لتسويتها.")}</div>}
                </div>
              )}

              {step === 4 && (
                <div data-testid="step4-panel" className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] items-start">
                  <div className={`${CARD} p-4 space-y-4`}>
                    {drift.length > 0 && <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-xs text-amber-200" data-testid="drift-warn"><div className="font-bold flex items-center gap-2 mb-1"><AlertTriangle size={14} />{t(`${drift.length} item(s) changed since the count started (sales/purchases).`, `تغيّر رصيد ${drift.length} صنف منذ بدء الجرد (مبيعات/مشتريات).`)}</div>
                      <div className="text-[11px] mb-2">{t("Approval sets each item to the counted quantity. Refresh to recompute differences against the current balances.", "الاعتماد يضبط كل صنف على الكمية المعدودة. حدّث لإعادة حساب الفروقات على الأرصدة الحالية.")}</div>
                      <ul className="text-[11px] font-mono mb-2" dir="ltr">{drift.slice(0, 5).map((x) => <li key={x.item.id}>{x.item.name}: {qf(x.was)} → {qf(x.now)}</li>)}</ul>
                      <button type="button" onClick={refreshBook} className={BTN_SOFT} data-testid="drift-refresh">{t("Refresh balances", "تحديث الأرصدة")}</button></div>}
                    <div><label className={LABEL}>{t("Reason (required)", "سبب التسوية (مطلوب)")}</label><input value={reason} onChange={(e) => setReason(e.target.value)} className={INPUT} placeholder={t("Periodic count / damage / shortage…", "جرد دوري / تالف / عجز…")} data-testid="f-reason" />
                      <div className="flex flex-wrap gap-1.5 mt-2">{[t("Periodic count", "جرد دوري"), t("Damaged", "تالف"), t("Shortage", "عجز"), t("Surplus", "فائض"), t("Entry error", "خطأ إدخال")].map((r) => <button type="button" key={r} onClick={() => setReason(r)} className="text-[11px] px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:border-blue-500">{r}</button>)}</div></div>
                    <div><label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer"><input type="checkbox" className="accent-blue-500" checked={postGl} onChange={(e) => setPostGl(e.target.checked)} data-testid="f-gl" />{t("Post one journal entry for surplus/shortage value", "ترحيل قيد واحد بقيمة الزيادة والعجز")}</label>
                      {postGl && <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3" data-testid="gl-box">
                        <div><label className={LABEL}>{t("Inventory account", "حساب المخزون")}</label><input disabled className={INPUT + " opacity-70"} value={inventoryAcc ? `${inventoryAcc.code} · ${inventoryAcc.name}` : t("— not found (1104) —", "— غير موجود (1104) —")} data-testid="gl-inv" /></div>
                        <div><label className={LABEL}>{t("Adjustment account", "حساب التسوية")}</label><select value={counterAcc} onChange={(e) => setCounterAcc(e.target.value ? Number(e.target.value) : "")} className={INPUT} data-testid="gl-counter"><option value="">{t("— choose —", "— اختر —")}</option>{counterOptions.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select></div>
                        <div className="md:col-span-2 text-[11px] text-slate-500 font-mono" dir="ltr" data-testid="gl-plan">{plan.inventoryDebit > 0 && `Dr Inventory ${fmt(plan.inventoryDebit)} / Cr Adjustment ${fmt(plan.counterCredit)}`}{plan.inventoryDebit > 0 && plan.counterDebit > 0 && "  ·  "}{plan.counterDebit > 0 && `Dr Adjustment ${fmt(plan.counterDebit)} / Cr Inventory ${fmt(plan.inventoryCredit)}`}</div></div>}</div>
                    <label className="flex items-start gap-2 text-xs text-slate-300 cursor-pointer"><input type="checkbox" className="accent-blue-500 mt-0.5" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} data-testid="f-confirm" />{t("I confirm the counted quantities. Approval changes item balances immediately and cannot be undone automatically.", "أؤكد صحة الكميات المعدودة. الاعتماد يغيّر أرصدة الأصناف فورًا ولا يمكن التراجع عنه تلقائيًا.")}</label>
                  </div>
                  <div className={`${CARD} p-4`}>
                    <div className="text-xs font-bold text-slate-300 mb-3">{t("Settlement summary", "ملخص التسوية")} <span className="font-mono text-blue-300" dir="ltr">{no}</span></div>
                    <dl className="grid grid-cols-2 gap-y-2 text-[11px]"><dt className="text-slate-500">{t("Items to adjust", "أصناف ستُسوّى")}</dt><dd className="font-mono text-end text-white font-bold" dir="ltr" data-testid="a-count">{adj.length}</dd>
                      <dt className="text-slate-500">{t("Surplus value", "قيمة الزيادة")}</dt><dd className="font-mono text-end text-emerald-400" dir="ltr" data-testid="a-surplus">{fmt(tot.surplusValue)}</dd>
                      <dt className="text-slate-500">{t("Shortage value", "قيمة العجز")}</dt><dd className="font-mono text-end text-red-300" dir="ltr" data-testid="a-shortage">{fmt(tot.shortageValue)}</dd>
                      <dt className="text-slate-500">{t("Net", "الصافي")}</dt><dd className="font-mono text-end text-white" dir="ltr" data-testid="a-net">{fmt(tot.netValue)}</dd></dl>
                    <div className="mt-4 flex gap-2"><button type="button" onClick={() => go(3)} className={BTN_SOFT} data-testid="back-3">{t("Back", "رجوع")}</button><button type="button" onClick={() => saveDraft()} className={BTN_SOFT} data-testid="ap-save-draft"><Save size={13} /> {t("Draft", "مسودة")}</button>
                      <button type="button" disabled={!confirmed || applying || reason.trim() === "" || adj.length === 0} onClick={() => void approve()} className={BTN_BLUE + " grow"} data-testid="approve">{applying ? t("Applying…", "جارٍ التطبيق…") : t("Approve settlement", "اعتماد التسوية")}</button></div>
                    <div className="mt-2 text-[10px] text-slate-500">{t("Applied item by item (not one atomic transaction); any failure is listed and the draft is kept.", "تُطبَّق صنفًا صنفًا (ليست معاملة ذرّية واحدة)؛ يُعرض أي فشل وتبقى المسودة.")}</div>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
