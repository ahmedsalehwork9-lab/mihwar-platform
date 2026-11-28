// =============================================================
// src/pages/inventory/itemMovement/ItemMovementPage.tsx
// تقرير حركة الصنف: دفتر حركة برصيد جارٍ، أرصدة المخازن، ملخص النوع، تغيّر أسعار الشراء.
// ثنائي اللغة، بحث متقدم، Excel + طباعة. قراءة فقط.
// =============================================================
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Boxes, Download, Keyboard, Package, Printer, RotateCcw, Search, X } from "lucide-react";
import { useAuth } from "../../../context/AuthContext";
import { useLang } from "../../../context/LanguageContext";
import * as DB from "../../lib/accountingDb";
import { buildReportHTML, openPrint, type ReportCol } from "../../accounting/shared/printReport";
import StatementCharts, { type ChartSpec } from "../../accounting/statements/StatementCharts";
import { topShares } from "../../accounting/statements/statementsLogic";
import * as API from "./movementApi";
import type { ItemRow, ShopHead } from "./movementApi";
import {
  DEFAULT_LEDGER_FILTER, DOC_LABEL, avgInboundCost, docRowsFor, staleness, balanceByWarehouse, balanceSeries, buildLedger, priceChanges, r2, refLabel, summaryByType, typeLabel, typesPresent,
  type DocKind, type LedgerFilter, type LinePt, type Move, type RawDoc,
} from "./movementLogic";

const CARD = "bg-slate-900 border border-slate-800 rounded-2xl";
const INPUT = "w-full bg-slate-950 border border-slate-700 rounded-xl text-white px-3 py-2 text-sm outline-none focus:border-blue-500 transition-colors";
const DATE = INPUT + " [color-scheme:dark]";
const LABEL = "text-[10px] text-slate-500 font-bold mb-1 block";
const BTN_SOFT = "inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 hover:text-white font-bold text-xs transition-colors disabled:opacity-50";
const BTN_BLUE = "inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-300 font-bold text-xs transition-colors disabled:opacity-50";
const KBD = "px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] font-mono text-slate-300";
const fmt = (n: number): string => (Math.round(n * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qf = (n: number): string => (Math.round(n * 1000) / 1000).toLocaleString("en-US", { maximumFractionDigits: 3 });
const todayStr = (): string => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number): string => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const LAST_KEY = "mihwar.itemmove.last";
const readLast = (): number | null => { try { const n = Number(localStorage.getItem(LAST_KEY)); return Number.isFinite(n) && n > 0 ? n : null; } catch { return null; } };
type Tab = "moves" | "docs" | "warehouses" | "summary" | "prices";
const DOC_TONE: Record<DocKind, string> = { purchase: "bg-sky-500/15 text-sky-300", purchase_return: "bg-orange-500/15 text-orange-300", sale: "bg-emerald-500/15 text-emerald-300", sale_return: "bg-rose-500/15 text-rose-300" };
const STALE_TXT: Record<string, { en: string; ar: string; tone: string }> = {
  active: { en: "Active", ar: "نشط", tone: "bg-emerald-500/15 text-emerald-300" }, slow: { en: "Slow-moving", ar: "بطيء الحركة", tone: "bg-amber-500/15 text-amber-300" },
  dead: { en: "Dead stock", ar: "راكد", tone: "bg-red-500/15 text-red-300" }, never: { en: "Never sold", ar: "لم يُبَع قط", tone: "bg-red-500/15 text-red-300" },
  new: { en: "New stock", ar: "مخزون جديد", tone: "bg-sky-500/15 text-sky-300" }, nostock: { en: "No stock", ar: "لا رصيد", tone: "bg-slate-700 text-slate-300" }, unknown: { en: "No history", ar: "بلا سجل", tone: "bg-slate-700 text-slate-300" },
};

function LineChart({ pts, title }: { pts: LinePt[]; title: string }) {
  const W = 320, H = 130, P = 22;
  if (pts.length === 0) return null;
  const vals = pts.map((p) => p.value); const mn = Math.min(0, ...vals), mx = Math.max(1, ...vals);
  const x = (i: number) => (pts.length === 1 ? W / 2 : P + (i * (W - 2 * P)) / (pts.length - 1)); const y = (v: number) => H - P - ((v - mn) / (mx - mn || 1)) * (H - 2 * P);
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4" data-testid="chart-line">
      <div className="text-[11px] font-bold text-slate-400 mb-2">{title}</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ direction: "ltr" }} role="img" aria-label={title}>
        <line x1={P} y1={y(0)} x2={W - P} y2={y(0)} stroke="#334155" strokeDasharray="3 3" />
        <polyline fill="none" stroke="#3b82f6" strokeWidth="2" points={pts.map((p, i) => `${x(i)},${y(p.value)}`).join(" ")} />
        {pts.map((p, i) => <circle key={i} cx={x(i)} cy={y(p.value)} r="3" fill="#3b82f6"><title>{`${p.label}: ${qf(p.value)}`}</title></circle>)}
        <text x={P} y={H - 4} fontSize="10" fill="#64748b">{pts[0].label}</text><text x={W - P} y={H - 4} fontSize="8" fill="#64748b" textAnchor="end">{pts[pts.length - 1].label}</text>
        <text x={P} y={10} fontSize="10" fill="#64748b">{qf(mx)}</text>
      </svg>
    </div>
  );
}

export default function ItemMovementPage() {
  const { t, lang, isRTL } = useLang();
  const { ownedShopId, branches } = (useAuth() as unknown as { ownedShopId: number | null; branches?: { id: number; name: string }[] }) ?? { ownedShopId: null };
  const [org, setOrg] = useState<{ id: number; name: string } | null>(null);
  const [shop, setShop] = useState<ShopHead>(null);
  const [whs, setWhs] = useState<DB.GLWarehouse[]>([]);
  const [q, setQ] = useState(""); const [open, setOpen] = useState(false); const [hits, setHits] = useState<ItemRow[]>([]); const [hi, setHi] = useState(0); const [searching, setSearching] = useState(false);
  const [item, setItem] = useState<ItemRow | null>(null);
  const [moves, setMoves] = useState<Move[]>([]); const [loading, setLoading] = useState(false); const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState<LedgerFilter>({ ...DEFAULT_LEDGER_FILTER, from: daysAgo(90), to: todayStr() });
  const [tab, setTab] = useState<Tab>("moves");
  const [rawDocs, setRawDocs] = useState<RawDoc[]>([]); const [docErr, setDocErr] = useState<string | null>(null); const [docKind, setDocKind] = useState<DocKind | "all">("all"); const [stale, setStale] = useState(90);
  const [showKeys, setShowKeys] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null); const seq = useRef(0);

  // حركة بلا مستودع تُعرض على المستودع الرئيسي إن وُجد (المخزون العام يُحتسب فيه).
  const mainWh = useMemo(() => whs.find((w) => w.is_default) ?? (whs.length === 1 ? whs[0] : null), [whs]);
  const nameOfWh = useCallback((id: number | null): string => (id == null ? (mainWh ? t(`${mainWh.name} (main)`, `${mainWh.name} (رئيسي)`) : t("Unassigned", "بلا مخزن")) : whs.find((w) => w.id === id)?.name || `#${id}`), [whs, t, mainWh]);
  const branchName = useCallback((id: number | null): string => (id == null ? "—" : branches?.find((b) => b.id === id)?.name || `#${id}`), [branches]);
  const refText = useCallback((m: Move): string => refLabel(m), []);

  useEffect(() => { let alive = true; void (async () => {
    const o = await DB.getOrgForBranch(ownedShopId ?? null); if (!alive || !o) return; setOrg(o);
    setWhs(await DB.fetchWarehouses(o.id)); if (ownedShopId) setShop(await API.fetchShopHead(Number(ownedShopId)));
    const last = readLast(); if (last) { const it = await API.fetchItem(o.id, last); if (alive && it) setItem(it); }
  })(); return () => { alive = false; }; }, [ownedShopId]);

  // بحث الأصناف (مع تأخير بسيط وتجاهل النتائج القديمة)
  useEffect(() => {
    if (!org || !open) return; const my = ++seq.current; setSearching(true);
    const h = window.setTimeout(async () => { const r = await API.searchItems(org.id, q); if (my === seq.current) { setHits(r); setHi(0); setSearching(false); } }, 200);
    return () => window.clearTimeout(h);
  }, [q, open, org]);

  const loadMoves = useCallback(async () => {
    if (!org || !item) { setMoves([]); return; }
    setLoading(true); setErr(null); const my = ++seq.current;
    const r = await API.fetchMoves(org.id, item.id); if (my !== seq.current) return;
    setMoves(r.rows); setErr(r.error); setLoading(false);
  }, [org, item]);
  useEffect(() => { void loadMoves(); }, [loadMoves]);
  useEffect(() => {
    if (!org || !item) { setRawDocs([]); setDocErr(null); return; }
    let alive = true; void API.fetchItemDocuments(org.id, item.id).then((r) => { if (alive) { setRawDocs(r.docs); setDocErr(r.error); } });
    return () => { alive = false; };
  }, [org, item]);

  const pick = (it: ItemRow) => { setItem(it); setOpen(false); setQ(""); try { localStorage.setItem(LAST_KEY, String(it.id)); } catch { /* التخزين غير متاح */ } };

  const ledger = useMemo(() => buildLedger(moves, item?.quantity ?? 0, f, refText), [moves, item, f, refText]);
  const avg = useMemo(() => avgInboundCost(moves), [moves]);
  const typeList = useMemo(() => typesPresent(moves), [moves]);
  const byType = useMemo(() => summaryByType(ledger.rows), [ledger.rows]);
  const byWh = useMemo(() => balanceByWarehouse(moves), [moves]);
  const prices = useMemo(() => priceChanges(moves, refText), [moves, refText]);
  const series = useMemo(() => balanceSeries(ledger), [ledger]);
  const docs = useMemo(() => (item ? docRowsFor(rawDocs, { id: item.id, name: item.product_name, code: item.product_code }) : []), [rawDocs, item]);
  const shownDocs = useMemo(() => docs.filter((d) => docKind === "all" || d.kind === docKind), [docs, docKind]);
  const sl = useMemo(() => staleness(moves, docs, item?.quantity ?? 0, item?.price != null ? Number(item.price) : null, todayStr(), stale), [moves, docs, item, stale]);
  const docCount = (k: DocKind): number => docs.filter((d) => d.kind === k).length;
  const l2 = lang === "en" ? "en" : "ar";
  const stockValue = avg != null && item ? r2(ledger.closing * avg) : null;
  const cost = item?.price != null ? Number(item.price) : null;
  const status = !item ? null : item.quantity <= 0 ? "out" : item.reorder_level != null && item.quantity <= Number(item.reorder_level) ? "low" : "ok";

  const chart: ChartSpec = useMemo(() => ({
    bars: { title: t("Net quantity by type", "صافي الكمية حسب النوع"), rows: byType.map((s) => ({ label: typeLabel(s.type, l2), value: s.net, tone: "auto" as const })) },
    donut: { title: t("Inbound vs outbound", "الوارد مقابل المنصرف"), slices: topShares([{ label: t("In", "وارد"), value: ledger.totalIn }, { label: t("Out", "منصرف"), value: ledger.totalOut }], 2, t("Other", "أخرى")), center: qf(ledger.totalIn + ledger.totalOut) },
  }), [byType, ledger.totalIn, ledger.totalOut, t, l2]);

  const setPreset = (k: "30" | "90" | "year" | "all") => setF((x) => ({ ...x, from: k === "all" ? "" : k === "year" ? `${new Date().getFullYear()}-01-01` : daysAgo(Number(k)), to: todayStr() }));
  const filtered = f.q !== "" || f.types != null || f.warehouse !== "all" || f.kind !== "all";

  // ── تصدير / طباعة (حركة الصنف المعروضة) ──
  const heads = [t("Date", "التاريخ"), t("Type", "النوع"), t("Reference", "المرجع"), t("Warehouse", "المخزن"), t("In", "وارد"), t("Out", "منصرف"), t("Balance", "الرصيد"), t("Unit cost", "التكلفة"), t("Value", "القيمة"), t("Notes", "ملاحظات")];
  const cells = (r: (typeof ledger.rows)[number]): (string | number)[] => [r.date, typeLabel(r.m.move_type, l2), refText(r.m), nameOfWh(r.m.warehouse_id), r.inQty || "", r.outQty || "", r.balance, r.m.unit_cost != null ? Number(r.m.unit_cost) : "", r.value, r.m.notes || ""];
  const title = `${t("Item movement", "حركة الصنف")} — ${item?.product_name ?? ""}`;
  const sub = `${item?.product_code ?? ""} · ${f.from || "…"} → ${f.to || "…"} · ${t("Opening", "الافتتاحي")} ${qf(ledger.periodOpening)} · ${t("Closing", "الختامي")} ${qf(ledger.closing)}`;
  const exportX = () => {
    if (!item) return;
    const ws = XLSX.utils.aoa_to_sheet([[title, sub], [], heads, [t("Opening balance", "رصيد أول الفترة"), "", "", "", "", "", ledger.periodOpening], ...ledger.rows.map(cells), [], [t("Totals", "الإجماليات"), "", "", "", ledger.totalIn, ledger.totalOut, ledger.closing, "", ledger.valueIn - ledger.valueOut]]);
    ws["!cols"] = heads.map((_, i) => ({ wch: i === 9 ? 30 : i === 3 || i === 2 ? 16 : 12 }));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Movement"); XLSX.writeFile(wb, `item_movement_${item.product_code || item.id}_${todayStr()}.xlsx`);
  };
  const printX = () => {
    if (!item) return;
    const cols: ReportCol[] = [{ label: heads[0], mono: true }, { label: heads[1] }, { label: heads[2], mono: true }, { label: heads[3] }, ...[4, 5, 6, 7, 8].map((i) => ({ label: heads[i], mono: true, align: "end" as const })), { label: heads[9] }];
    const rows = [[t("Opening balance", "رصيد أول الفترة"), "", "", "", "", "", ledger.periodOpening, "", "", ""] as (string | number)[], ...ledger.rows.map(cells)];
    const ok = openPrint(buildReportHTML({ title, subtitle: sub, orgName: shop?.shop_name || org?.name || "", taxNumber: shop?.tax_number, logoUrl: shop?.logo_url, address: shop?.address, dir: isRTL ? "rtl" : "ltr", lang: l2, cols, rows, totals: [t("Totals", "الإجماليات"), "", "", "", ledger.totalIn, ledger.totalOut, ledger.closing, "", ledger.valueIn - ledger.valueOut, ""] }));
    if (!ok) alert(t("Allow pop-ups to print.", "فعّل النوافذ المنبثقة للطباعة."));
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName; const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      if (e.key === "/" && !typing) { e.preventDefault(); searchRef.current?.focus(); setOpen(true); }
      else if (e.key === "Escape" && open) { setOpen(false); }
    };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [open]);

  const th = "text-[10px] px-2 py-2.5 bg-slate-950 text-slate-400 whitespace-nowrap border-b border-slate-700 font-bold sticky top-0 z-10";
  const td = "px-2 py-2 text-xs border-b border-slate-800";
  const kpi = (id: string, label: string, val: string, sub2: string, tone: string) => (
    <div className={`${CARD} p-3`}><div className="text-[10px] text-slate-500 font-bold">{label}</div><div className={`text-lg font-extrabold font-mono mt-0.5 ${tone}`} dir="ltr" data-testid={id}>{val}</div><div className="text-[10px] text-slate-500 mt-0.5">{sub2}</div></div>
  );
  const tabBtn = (k: Tab, label: string) => <button type="button" onClick={() => setTab(k)} data-testid={`tab-${k}`} className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${tab === k ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white"}`}>{label}</button>;

  return (
    <div className="p-4 md:p-6 max-w-[1500px] mx-auto" dir={isRTL ? "rtl" : "ltr"} data-testid="item-movement">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-blue-500/15 flex items-center justify-center"><Boxes size={20} className="text-blue-400" /></div>
        <div><h1 className="text-xl font-black text-white">{t("Item movement report", "تقرير حركة الصنف")}</h1><p className="text-[11px] text-slate-500">{t("Every stock movement of an item with running balance, cost and references", "كل حركات الصنف بالرصيد الجاري والتكلفة والمراجع")}</p></div>
        <div className="ms-auto flex gap-2">
          <button type="button" onClick={exportX} disabled={!item} className={BTN_BLUE} data-testid="m-export"><Download size={14} /> Excel</button>
          <button type="button" onClick={printX} disabled={!item} className={BTN_BLUE} data-testid="m-print"><Printer size={14} /> {t("Print", "طباعة")}</button>
          <button type="button" onClick={() => setShowKeys((v) => !v)} className={BTN_SOFT} data-testid="m-keys-toggle"><Keyboard size={14} /></button>
        </div>
      </div>
      {showKeys && <div className="mb-3 text-[11px] text-slate-400 flex gap-5" data-testid="m-keys"><span><kbd className={KBD}>/</kbd> {t("search item", "بحث صنف")}</span><span><kbd className={KBD}>↑</kbd><kbd className={KBD}>↓</kbd> <kbd className={KBD}>Enter</kbd> {t("choose", "اختيار")}</span><span><kbd className={KBD}>Esc</kbd> {t("close", "إغلاق")}</span></div>}

      {/* اختيار الصنف */}
      <div className={`${CARD} p-3 mb-4 relative`}>
        <label className={LABEL}>{t("Item", "الصنف")}</label>
        <div className="relative">
          <Search size={14} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          <input ref={searchRef} value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} data-testid="m-search" autoComplete="off"
            placeholder={item ? `${item.product_code ?? ""} — ${item.product_name}` : t("Search by name, code, barcode or brand…   ( / )", "ابحث بالاسم أو الكود أو الباركود أو الماركة…   ( / )")}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setHi((i) => Math.min(hits.length - 1, i + 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setHi((i) => Math.max(0, i - 1)); }
              else if (e.key === "Enter" && hits[hi]) { e.preventDefault(); pick(hits[hi]); }
            }} className={`${INPUT} ps-9`} />
          {item && <button type="button" aria-label={t("Clear", "مسح")} onClick={() => { setItem(null); setMoves([]); try { localStorage.removeItem(LAST_KEY); } catch { /* */ } }} data-testid="m-clear" className="absolute end-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"><X size={14} /></button>}
        </div>
        {open && (
          <div className="absolute z-30 mt-1 start-3 end-3 rounded-xl border border-slate-700 bg-slate-900 shadow-2xl max-h-80 overflow-auto" data-testid="m-hits">
            {searching && <div className="px-3 py-3 text-xs text-slate-500">{t("Searching…", "جارٍ البحث…")}</div>}
            {!searching && hits.length === 0 && <div className="px-3 py-4 text-center text-xs text-slate-500" data-testid="m-nohits">{t("No matching items", "لا أصناف مطابقة")}</div>}
            {hits.map((h, i) => (
              <button type="button" key={h.id} onMouseEnter={() => setHi(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(h)} data-testid="m-hit" data-hi={hi === i ? "1" : undefined}
                className={`w-full text-start px-3 py-2 border-t border-slate-800 first:border-t-0 grid grid-cols-[9rem_1fr_auto] gap-3 items-center text-xs ${hi === i ? "bg-blue-600/25" : "hover:bg-slate-800"}`}>
                <span className="font-mono text-slate-400 truncate" dir="ltr">{h.product_code ?? "—"}</span>
                <span className="text-white font-semibold truncate">{h.product_name}<span className="text-slate-500 font-normal"> · {h.brand ?? ""} · {branchName(h.shop_id)}</span></span>
                <span className="font-mono text-slate-300" dir="ltr">{qf(h.quantity)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {!item ? (
        <div className={`${CARD} p-12 text-center text-slate-500`} data-testid="m-empty"><Package size={34} className="mx-auto mb-3 opacity-40" />{t("Choose an item to see its movement.", "اختر صنفًا لعرض حركته.")}</div>
      ) : (
        <>
          <div className={`${CARD} p-4 mb-4 flex flex-wrap items-center gap-x-6 gap-y-2`} data-testid="m-card">
            <div className="min-w-0"><div className="text-base font-black text-white truncate" data-testid="m-name">{item.product_name}</div>
              <div className="text-[11px] text-slate-500 font-mono" dir="ltr">{item.product_code ?? "—"}{item.barcode ? ` · ${item.barcode}` : ""}</div></div>
            <div className="text-xs text-slate-400">{t("Brand", "الماركة")}: <span className="text-slate-200">{[item.brand, item.model].filter(Boolean).join(" ") || "—"}</span></div>
            <div className="text-xs text-slate-400">{t("Group", "المجموعة")}: <span className="text-slate-200">{item.category || "—"}</span></div>
            <div className="text-xs text-slate-400">{t("Branch", "الفرع")}: <span className="text-slate-200">{branchName(item.shop_id)}</span></div>
            <div className="text-xs text-slate-400">{t("Cost", "التكلفة")}: <span className="font-mono text-slate-200" dir="ltr">{cost != null ? fmt(cost) : "—"}</span></div>
            <div className="text-xs text-slate-400">{t("Price", "سعر البيع")}: <span className="font-mono text-slate-200" dir="ltr">{item.selling_price != null ? fmt(Number(item.selling_price)) : "—"}</span></div>
            <span data-testid="m-status" className={`ms-auto text-[11px] font-bold px-3 py-1 rounded-full ${status === "out" ? "bg-red-500/15 text-red-300" : status === "low" ? "bg-amber-500/15 text-amber-300" : "bg-emerald-500/15 text-emerald-300"}`}>{status === "out" ? t("Out of stock", "نفد") : status === "low" ? t("Low stock", "منخفض") : t("In stock", "متوفر")}</span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 mb-4">
            {kpi("k-open", t("Opening (period)", "الرصيد الافتتاحي"), qf(ledger.periodOpening), f.from || t("all time", "كل الفترة"), "text-sky-300")}
            {kpi("k-in", t("Total in", "إجمالي الوارد"), qf(ledger.totalIn), `${t("value", "قيمة")} ${fmt(ledger.valueIn)}`, "text-emerald-400")}
            {kpi("k-out", t("Total out", "إجمالي المنصرف"), qf(ledger.totalOut), `${t("value", "قيمة")} ${fmt(ledger.valueOut)}`, "text-amber-300")}
            {kpi("k-close", t("Closing balance", "الرصيد الختامي"), qf(ledger.closing), `${t("current stock", "المخزون الحالي")} ${qf(item.quantity)}`, "text-white")}
            {kpi("k-val", t("Stock value", "قيمة الرصيد"), stockValue != null ? fmt(stockValue) : "—", avg != null ? `${t("avg cost", "متوسط التكلفة")} ${fmt(avg)}` : t("no costed purchases", "لا مشتريات بتكلفة"), "text-violet-300")}
          </div>

          {Math.abs(ledger.impliedOpening) > 0.0005 && (
            <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-2.5 text-xs text-amber-200" data-testid="m-implied">
              {t(`Unrecorded opening balance: ${qf(ledger.impliedOpening)}. The item's current quantity differs from the sum of its recorded movements (stock loaded before movements were logged, or older sales invoices that logged no movements). The running balance starts from this figure so it ends exactly at the current quantity.`,
                `رصيد افتتاحي غير مسجّل بحركات: ${qf(ledger.impliedOpening)}. كمية الصنف الحالية تختلف عن مجموع حركاته المسجّلة (مخزون أُدخل قبل تسجيل الحركات، أو فواتير مبيعات قديمة لم تسجّل حركات). يبدأ الرصيد الجاري من هذا الرقم ليصل بالضبط إلى الكمية الحالية.`)}
            </div>
          )}
          {err && <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-2.5 text-xs text-red-300" data-testid="m-err">{t("Could not load movements: ", "تعذّر تحميل الحركات: ")}{err}</div>}

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px] items-start">
            <div className="min-w-0 space-y-3">
              <div className="flex flex-wrap gap-2">{tabBtn("moves", t("Movement", "حركة الصنف"))}{tabBtn("docs", `${t("Documents", "المستندات")} (${docs.length})`)}{tabBtn("warehouses", t("Balances by warehouse", "الأرصدة حسب المخزن"))}{tabBtn("summary", t("Summary", "ملخص الحركة"))}{tabBtn("prices", t("Price changes", "تغيّر الأسعار"))}</div>

              {tab === "moves" && (
                <>
                  <div className={`${CARD} p-3`}>
                    <div className="flex flex-wrap items-end gap-3">
                      <div><label className={LABEL}>{t("From", "من")}</label><input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} className={DATE} data-testid="m-from" /></div>
                      <div><label className={LABEL}>{t("To", "إلى")}</label><input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} className={DATE} data-testid="m-to" /></div>
                      <div><label className={LABEL}>{t("Type", "النوع")}</label>
                        <select value={f.types && f.types.size === 1 ? [...f.types][0] : ""} onChange={(e) => setF({ ...f, types: e.target.value ? new Set([e.target.value]) : null })} className={INPUT} data-testid="m-type"><option value="">{t("All types", "كل الأنواع")}</option>{typeList.map((x) => <option key={x} value={x}>{typeLabel(x, l2)}</option>)}</select></div>
                      <div><label className={LABEL}>{t("Direction", "الاتجاه")}</label>
                        <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as LedgerFilter["kind"] })} className={INPUT} data-testid="m-kind"><option value="all">{t("All", "الكل")}</option><option value="in">{t("In", "وارد")}</option><option value="out">{t("Out", "منصرف")}</option></select></div>
                      <div><label className={LABEL}>{t("Warehouse", "المخزن")}</label>
                        <select value={String(f.warehouse)} onChange={(e) => setF({ ...f, warehouse: e.target.value === "all" ? "all" : e.target.value === "none" ? "none" : Number(e.target.value) })} className={INPUT} data-testid="m-wh"><option value="all">{t("All", "الكل")}</option><option value="none">{t("Unassigned", "بلا مخزن")}</option>{whs.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
                      <div className="grow basis-40"><label className={LABEL}>{t("Search", "بحث")}</label><input value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} className={INPUT} data-testid="m-filter-q" placeholder={t("reference, note, type…", "مرجع، ملاحظة، نوع…")} /></div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-3">
                      {(["30", "90", "year", "all"] as const).map((k) => <button type="button" key={k} onClick={() => setPreset(k)} className={BTN_SOFT} data-testid={`m-preset-${k}`}>{k === "30" ? t("30 days", "30 يومًا") : k === "90" ? t("90 days", "90 يومًا") : k === "year" ? t("This year", "هذا العام") : t("All time", "كل الفترة")}</button>)}
                      {filtered && <button type="button" onClick={() => setF({ ...f, types: null, warehouse: "all", kind: "all", q: "" })} className={BTN_SOFT} data-testid="m-reset"><RotateCcw size={13} /> {t("Reset", "إعادة ضبط")}</button>}
                      <span className="ms-auto text-[11px] text-slate-500" data-testid="m-count">{ledger.rows.length} / {ledger.allCount} {t("movements", "حركة")}{loading ? " …" : ""}</span>
                    </div>
                  </div>
                  <div className={`${CARD} overflow-hidden`}><div className="overflow-x-auto">
                    <table className="w-full border-collapse" style={{ minWidth: 900 }} data-testid="m-table">
                      <thead><tr>
                        <th className={`${th} text-start`}>{heads[0]}</th><th className={`${th} text-start`}>{heads[1]}</th><th className={`${th} text-start`}>{heads[2]}</th><th className={`${th} text-start`}>{heads[3]}</th>
                        {[4, 5, 6, 7, 8].map((i) => <th key={i} dir="ltr" className={`${th} text-end`}>{heads[i]}</th>)}<th className={`${th} text-start`}>{heads[9]}</th>
                      </tr></thead>
                      <tbody>
                        {!filtered && <tr className="bg-slate-950/50" data-testid="m-open-row"><td className={`${td} text-slate-400`} colSpan={6}>{t("Opening balance at start of period", "رصيد أول الفترة")}</td><td className={`${td} text-end font-mono font-bold text-sky-300`} dir="ltr">{qf(ledger.periodOpening)}</td><td colSpan={3} className={td} /></tr>}
                        {ledger.rows.map((r) => (
                          <tr key={r.m.id} className="hover:bg-white/[0.03]" data-testid="m-row" data-type={r.m.move_type}>
                            <td className={`${td} font-mono text-slate-400`} dir="ltr"><span className="block text-start">{r.date}</span></td>
                            <td className={td}><span className={`text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap ${r.kind === "in" ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}`}>{typeLabel(r.m.move_type, l2)}</span></td>
                            <td className={`${td} font-mono text-blue-300`} dir="ltr"><span className="block text-start">{refText(r.m) || "—"}</span></td>
                            <td className={`${td} text-slate-400`}>{nameOfWh(r.m.warehouse_id)}</td>
                            <td className={`${td} text-end font-mono text-emerald-400`} dir="ltr" data-testid="m-in">{r.inQty ? qf(r.inQty) : "—"}</td>
                            <td className={`${td} text-end font-mono text-amber-300`} dir="ltr" data-testid="m-out">{r.outQty ? qf(r.outQty) : "—"}</td>
                            <td className={`${td} text-end font-mono font-bold text-white`} dir="ltr" data-testid="m-bal">{qf(r.balance)}</td>
                            <td className={`${td} text-end font-mono text-slate-300`} dir="ltr">{r.m.unit_cost != null ? fmt(Number(r.m.unit_cost)) : "—"}</td>
                            <td className={`${td} text-end font-mono text-slate-300`} dir="ltr">{fmt(r.value)}</td>
                            <td className={`${td} text-slate-400 max-w-[220px] truncate`} title={r.m.notes || ""}>{r.m.notes || "—"}</td>
                          </tr>
                        ))}
                        {ledger.rows.length === 0 && <tr><td colSpan={10} className="p-8 text-center text-slate-500 text-sm" data-testid="m-none">{loading ? t("Loading…", "جارٍ التحميل…") : t("No movements in this period.", "لا توجد حركات في هذه الفترة.")}</td></tr>}
                      </tbody>
                      {ledger.rows.length > 0 && <tfoot><tr className="bg-slate-950 font-bold"><td colSpan={4} className="px-2 py-2.5 text-xs text-slate-200 border-t border-slate-600 text-start">{t("Totals", "الإجماليات")}</td>
                        <td className="px-2 py-2.5 text-end font-mono text-xs text-emerald-400 border-t border-slate-600" dir="ltr" data-testid="m-tot-in">{qf(ledger.totalIn)}</td><td className="px-2 py-2.5 text-end font-mono text-xs text-amber-300 border-t border-slate-600" dir="ltr" data-testid="m-tot-out">{qf(ledger.totalOut)}</td>
                        <td className="px-2 py-2.5 text-end font-mono text-xs text-white border-t border-slate-600" dir="ltr" data-testid="m-tot-bal">{qf(ledger.closing)}</td><td colSpan={3} className="border-t border-slate-600" /></tr></tfoot>}
                    </table></div></div>
                </>
              )}

              {tab === "docs" && (
                <div className={`${CARD} p-4`} data-testid="docs-panel">
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    {(["all", "purchase", "sale", "purchase_return", "sale_return"] as const).map((k) => (
                      <button type="button" key={k} onClick={() => setDocKind(k)} data-testid={`doc-f-${k}`} className={`px-3 py-1.5 rounded-lg text-[11px] font-bold ${docKind === k ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white"}`}>
                        {k === "all" ? t("All", "الكل") : DOC_LABEL[k][l2]} ({k === "all" ? docs.length : docCount(k)})
                      </button>))}
                  </div>
                  {docErr && <div className="mb-3 text-xs text-red-300" data-testid="doc-err">{t("Some documents could not be loaded: ", "تعذّر تحميل بعض المستندات: ")}{docErr}</div>}
                  <div className="overflow-x-auto"><table className="w-full text-xs" style={{ minWidth: 720 }}><thead><tr className="text-[10px] text-slate-500">
                    <th className="text-start py-1">{t("Document", "المستند")}</th><th className="text-start">{t("Type", "النوع")}</th><th className="text-start">{t("Date", "التاريخ")}</th><th className="text-start">{t("Party", "الطرف")}</th>
                    <th className="text-end" dir="ltr">{t("Qty", "الكمية")}</th><th className="text-end" dir="ltr">{t("Unit price", "السعر")}</th><th className="text-end" dir="ltr">{t("Total", "الإجمالي")}</th></tr></thead>
                    <tbody>{shownDocs.map((d) => (
                      <tr key={`${d.kind}-${d.id}`} className="border-t border-slate-800" data-testid="doc-row" data-kind={d.kind}>
                        <td className="py-1.5 font-mono text-blue-300" dir="ltr" data-testid="doc-no">{d.label}{d.approx && <span title={t("Matched by description (older invoice without item link)", "مطابقة بالوصف (فاتورة قديمة بلا ربط بالصنف)")} className="ms-1 text-amber-300" data-testid="doc-approx">≈</span>}</td>
                        <td><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${DOC_TONE[d.kind]}`}>{DOC_LABEL[d.kind][l2]}</span></td>
                        <td className="font-mono text-slate-400" dir="ltr">{d.date}</td><td className="text-slate-300">{d.party || "—"}</td>
                        <td className="text-end font-mono text-slate-200" dir="ltr">{qf(d.qty)}</td><td className="text-end font-mono text-slate-400" dir="ltr">{fmt(d.unit)}</td><td className="text-end font-mono text-white" dir="ltr">{fmt(d.total)}</td></tr>))}</tbody></table></div>
                  {shownDocs.length === 0 && <div className="text-xs text-slate-500 py-6 text-center" data-testid="docs-none">{t("No documents contain this item.", "لا توجد مستندات تحتوي هذا الصنف.")}</div>}
                  {docs.some((d) => d.approx) && <div className="mt-2 text-[10px] text-amber-300/80">≈ {t("older sales invoices have no item link; matched by item code/name in the description.", "فواتير بيع قديمة بلا ربط بالصنف؛ طُوبقت بكود/اسم الصنف في الوصف.")}</div>}
                </div>
              )}

              {tab === "warehouses" && (
                <div className={`${CARD} p-4`} data-testid="wh-panel">
                  <table className="w-full text-xs"><thead><tr className="text-[10px] text-slate-500"><th className="text-start py-1">{t("Warehouse", "المخزن")}</th><th className="text-end py-1" dir="ltr">{t("Recorded balance", "الرصيد المسجّل")}</th><th className="text-end py-1" dir="ltr">{t("Movements", "الحركات")}</th></tr></thead>
                    <tbody>{byWh.map((w) => <tr key={String(w.warehouseId)} data-testid="wh-row"><td className="py-1.5 text-slate-200">{nameOfWh(w.warehouseId)}</td><td className="text-end font-mono text-white" dir="ltr">{qf(w.qty)}</td><td className="text-end font-mono text-slate-400" dir="ltr">{w.count}</td></tr>)}
                      <tr className="border-t border-slate-700"><td className="py-1.5 text-slate-400">{t("Unrecorded opening", "افتتاحي غير مسجّل")}</td><td className="text-end font-mono text-sky-300" dir="ltr" data-testid="wh-implied">{qf(ledger.impliedOpening)}</td><td /></tr>
                      <tr className="border-t border-slate-600 font-bold"><td className="py-1.5 text-slate-200">{t("Current quantity", "الكمية الحالية")}</td><td className="text-end font-mono text-white" dir="ltr" data-testid="wh-total">{qf(item.quantity)}</td><td /></tr></tbody></table>
                  {byWh.length === 0 && <div className="text-xs text-slate-500 py-4 text-center">{t("No movements recorded.", "لا توجد حركات مسجّلة.")}</div>}
                </div>
              )}

              {tab === "summary" && (
                <div className={`${CARD} p-4`} data-testid="sum-panel"><table className="w-full text-xs"><thead><tr className="text-[10px] text-slate-500"><th className="text-start py-1">{t("Type", "النوع")}</th><th className="text-end" dir="ltr">{t("Count", "العدد")}</th><th className="text-end" dir="ltr">{t("In", "وارد")}</th><th className="text-end" dir="ltr">{t("Out", "منصرف")}</th><th className="text-end" dir="ltr">{t("Net", "الصافي")}</th><th className="text-end" dir="ltr">{t("Value", "القيمة")}</th></tr></thead>
                  <tbody>{byType.map((s) => <tr key={s.type} data-testid="sum-row"><td className="py-1.5 text-slate-200">{typeLabel(s.type, l2)}</td><td className="text-end font-mono text-slate-400" dir="ltr">{s.count}</td><td className="text-end font-mono text-emerald-400" dir="ltr">{qf(s.inQty)}</td><td className="text-end font-mono text-amber-300" dir="ltr">{qf(s.outQty)}</td><td className="text-end font-mono text-white" dir="ltr">{qf(s.net)}</td><td className="text-end font-mono text-slate-300" dir="ltr">{fmt(s.value)}</td></tr>)}</tbody></table>
                  {byType.length === 0 && <div className="text-xs text-slate-500 py-4 text-center">{t("No movements in this period.", "لا توجد حركات في هذه الفترة.")}</div>}</div>
              )}

              {tab === "prices" && (
                <div className={`${CARD} p-4`} data-testid="price-panel"><table className="w-full text-xs"><thead><tr className="text-[10px] text-slate-500"><th className="text-start py-1">{t("Date", "التاريخ")}</th><th className="text-start">{t("Reference", "المرجع")}</th><th className="text-end" dir="ltr">{t("Qty", "الكمية")}</th><th className="text-end" dir="ltr">{t("Unit cost", "تكلفة الوحدة")}</th><th className="text-end" dir="ltr">{t("Previous", "السابق")}</th><th className="text-end" dir="ltr">{t("Change", "الفرق")}</th><th className="text-end" dir="ltr">%</th></tr></thead>
                  <tbody>{prices.map((p, i) => <tr key={i} data-testid="price-row"><td className="py-1.5 font-mono text-slate-400" dir="ltr">{p.date}</td><td className="font-mono text-blue-300" dir="ltr">{p.ref || "—"}</td><td className="text-end font-mono text-slate-300" dir="ltr">{qf(p.qty)}</td><td className="text-end font-mono text-white" dir="ltr">{fmt(p.unitCost)}</td><td className="text-end font-mono text-slate-400" dir="ltr">{p.prev != null ? fmt(p.prev) : "—"}</td>
                    <td className={`text-end font-mono ${p.diff == null ? "text-slate-600" : p.diff > 0 ? "text-red-300" : p.diff < 0 ? "text-emerald-400" : "text-slate-400"}`} dir="ltr">{p.diff != null ? `${p.diff > 0 ? "+" : ""}${fmt(p.diff)}` : "—"}</td>
                    <td className={`text-end font-mono ${p.pct == null ? "text-slate-600" : p.pct > 0 ? "text-red-300" : p.pct < 0 ? "text-emerald-400" : "text-slate-400"}`} dir="ltr" data-testid="price-pct">{p.pct != null ? `${p.pct > 0 ? "↑" : p.pct < 0 ? "↓" : ""} ${fmt(Math.abs(p.pct))}%` : "—"}</td></tr>)}</tbody></table>
                  {prices.length === 0 && <div className="text-xs text-slate-500 py-4 text-center">{t("No costed purchases recorded.", "لا توجد مشتريات بتكلفة مسجّلة.")}</div>}</div>
              )}
            </div>
            <div className="space-y-3"><LineChart pts={series} title={t("Balance over time", "تطور الرصيد")} /><StatementCharts spec={chart} />
              <div className={`${CARD} p-4`} data-testid="stale-card">
                <div className="flex items-center justify-between mb-2"><div className="text-xs font-bold text-slate-300">{t("Stock ageing", "الركود والمخزون الراكد")}</div>
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${STALE_TXT[sl.status].tone}`} data-testid="stale-status">{STALE_TXT[sl.status][l2]}</span></div>
                <dl className="grid grid-cols-2 gap-y-2 text-[11px]">
                  <dt className="text-slate-500">{t("Last sale", "آخر بيع")}</dt><dd className="font-mono text-slate-200 text-end" dir="ltr" data-testid="stale-last-sale">{sl.lastSale ?? "—"}</dd>
                  <dt className="text-slate-500">{t("Days since sale", "أيام منذ آخر بيع")}</dt><dd className="font-mono text-slate-200 text-end" dir="ltr" data-testid="stale-days">{sl.daysSinceSale ?? "—"}</dd>
                  <dt className="text-slate-500">{t("Last purchase", "آخر شراء")}</dt><dd className="font-mono text-slate-200 text-end" dir="ltr" data-testid="stale-last-purchase">{sl.lastPurchase ?? "—"}</dd>
                  <dt className="text-slate-500">{t("Last movement", "آخر حركة")}</dt><dd className="font-mono text-slate-200 text-end" dir="ltr">{sl.lastMove ?? "—"}</dd>
                  <dt className="text-slate-500">{t("Value tied up", "قيمة المخزون المجمّد")}</dt><dd className="font-mono text-violet-300 text-end" dir="ltr" data-testid="stale-value">{sl.tiedValue != null ? fmt(sl.tiedValue) : "—"}</dd>
                </dl>
                <div className="mt-3 flex items-center gap-2"><label className="text-[10px] text-slate-500">{t("Dead after", "راكد بعد")}</label>
                  <select value={stale} onChange={(e) => setStale(Number(e.target.value))} className={INPUT + " !py-1 !text-xs w-auto"} data-testid="stale-th">{[60, 90, 180, 365].map((d) => <option key={d} value={d}>{d} {t("days", "يومًا")}</option>)}</select></div>
                {(sl.status === "unknown") && <div className="mt-2 text-[10px] text-slate-500">{t("No movements or documents recorded for this item, so ageing cannot be measured.", "لا حركات أو مستندات مسجّلة لهذا الصنف، فلا يمكن قياس الركود.")}</div>}
              </div></div>
          </div>
        </>
      )}
    </div>
  );
}
