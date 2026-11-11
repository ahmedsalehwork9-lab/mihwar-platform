// =============================================================
// src/pages/sales/SalesReconciliationPage.tsx
//
// تسوية المبيعات اليومية — مطابقة مبيعات السيستم بالتحصيل الفعلي
// لكل شفت × قناة، مع احتساب الفرق ونسبة الخطأ والحالة وسجل الأسباب.
//
// • الفرع يُؤخذ تلقائيًا من حساب المستخدم (الفرع الذي سجّل دخوله به).
// • عند وجود فروقات: يلزم تحديد الشفت واسم الموظف (أو أكثر) لكل سبب.
// • التخزين محلي (localStorage) مؤقتًا، والتقرير يُبنى من الأيام المحفوظة
//   للفرع الحالي فقط، مع فلتر مدى تاريخ وتصدير PDF/Excel.
//   الربط بـ Supabase لاحقًا (نفس شكل البيانات).
// =============================================================

import { useMemo, useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../lib/supabase";

type ShiftId = "am" | "pm";
type Channel = { id: string; icon: string; nm: string; base?: boolean; sign?: number };

const CHANNEL_CATALOG: Channel[] = [
  { id: "cash",   icon: "💵", nm: "نقدي", base: true },
  { id: "net",    icon: "💳", nm: "شبكة (مدى)", base: true },
  { id: "keeta",  icon: "🛵", nm: "كيتا" },
  { id: "hunger", icon: "🛵", nm: "هنقرستيشن" },
  { id: "jahez",  icon: "🛵", nm: "جاهز" },
  { id: "trans",  icon: "🏦", nm: "تحويل بنكي" },
  { id: "refund", icon: "↩️", nm: "مرتجع (−)", sign: -1 },
];

const SHIFTS: { id: ShiftId; nm: string; bar: string }[] = [
  { id: "am", nm: "الشفت الصباحي", bar: "bg-amber-500" },
  { id: "pm", nm: "الشفت المسائي", bar: "bg-blue-500" },
];

const REASON_OPTS = [
  "مبلغ مسترد (استرجاع)", "فكة / باقي نقدي ناقص", "سحب نقدي للمصاريف",
  "طلب ملغي بعد الدفع", "خطأ إدخال الكاشير", "ضيافة / على حساب المحل",
  "إكرامية", "عجز غير مبرر", "فرق تقريب", "أخرى",
];
const SHIFT_OPTS: { v: string; l: string }[] = [
  { v: "", l: "— الشفت" }, { v: "am", l: "صباحي" }, { v: "pm", l: "مسائي" }, { v: "both", l: "الاثنين" },
];
const STAFF_SUGGEST = ["الطيب", "الين", "عابد", "ياس"];

type Reason = { id: number; shift: string; employees: string; reason: string; amount: string; note: string };

type SavedEntry = {
  branchId: number | null; branch: string; date: string; channels: string[];
  customChannels?: Channel[];
  vals: Record<string, string>; reasons: Reason[]; note: string;
  gSys: number; gAct: number; net: number; err: number;
  perChannelActual: Record<string, number>;
};

const STORAGE_KEY = "mihwar_sales_reconciliation";
const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 });
const num = (v: string) => parseFloat(v) || 0;
const newReason = (): Reason => ({ id: Date.now() + Math.random(), shift: "", employees: "", reason: REASON_OPTS[0], amount: "", note: "" });

function loadAll(): SavedEntry[] { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; } }
function saveAll(list: SavedEntry[]) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch { /* ignore */ } }

// ── إعداد القنوات ثابت لكل فرع (يُضاف مرة واحدة ويبقى دائمًا، لا يتأثر بتغيير التاريخ) ──
const CH_KEY = "mihwar_sales_channels";
type ChannelConfig = { activeIds: string[]; customChannels: Channel[] };
function loadChannelConfig(branchId: number | null): ChannelConfig {
  try {
    const all = JSON.parse(localStorage.getItem(CH_KEY) || "{}");
    const c = all[String(branchId)];
    if (c && Array.isArray(c.activeIds) && c.activeIds.length) return { activeIds: c.activeIds, customChannels: c.customChannels ?? [] };
  } catch { /* ignore */ }
  return { activeIds: ["cash", "net"], customChannels: [] };
}
function saveChannelConfig(branchId: number | null, cfg: ChannelConfig) {
  try {
    const all = JSON.parse(localStorage.getItem(CH_KEY) || "{}");
    all[String(branchId)] = cfg;
    localStorage.setItem(CH_KEY, JSON.stringify(all));
  } catch { /* ignore */ }
}

export default function SalesReconciliationPage() {
  const { ownedShopId } = (useAuth() as any) ?? {};
  const [branch, setBranch] = useState<string>("");

  useEffect(() => {
    let active = true;
    (async () => {
      if (!ownedShopId) { setBranch(""); return; }
      const { data } = await supabase.from("shops").select("shop_name").eq("id", ownedShopId).single();
      if (active && data) setBranch((data as any).shop_name ?? "");
    })();
    return () => { active = false; };
  }, [ownedShopId]);

  const [tab, setTab] = useState<"entry" | "report">("entry");

  // ── إدخال اليوم ──
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [activeIds, setActiveIds] = useState<string[]>(["cash", "net"]);
  const [customChannels, setCustomChannels] = useState<Channel[]>([]);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Reason[]>([newReason()]);
  const [note, setNote] = useState("");

  const allCatalog = useMemo(() => [...CHANNEL_CATALOG, ...customChannels], [customChannels]);
  const resolveChannel = (id: string): Channel => allCatalog.find((c) => c.id === id) ?? { id, icon: "🏷️", nm: id };
  const activeChannels = activeIds.map(resolveChannel);
  const availableToAdd = allCatalog.filter((c) => !activeIds.includes(c.id));

  // القنوات ثابتة للفرع: تُحمَّل مرة عند دخول الفرع وتبقى في كل الأيام
  useEffect(() => {
    const cfg = loadChannelConfig(ownedShopId ?? null);
    setActiveIds(cfg.activeIds);
    setCustomChannels(cfg.customChannels);
  }, [ownedShopId]);

  // تغيير التاريخ يغيّر بيانات الإدخال فقط (الأرقام والأسباب والملاحظة) — لا يمسّ القنوات
  useEffect(() => {
    const e = loadAll().find((x) => x.branchId === (ownedShopId ?? null) && x.date === date);
    if (e) {
      setVals(e.vals ?? {});
      setReasons(e.reasons?.length ? e.reasons : [newReason()]);
      setNote(e.note ?? "");
    } else {
      setVals({});
      setReasons([newReason()]);
      setNote("");
    }
  }, [date, ownedShopId]);

  const setVal = (sh: ShiftId, c: string, f: "sys" | "act", v: string) => setVals((p) => ({ ...p, [`${sh}-${c}-${f}`]: v }));
  const getVal = (sh: ShiftId, c: string, f: "sys" | "act") => vals[`${sh}-${c}-${f}`] ?? "";
  const persistChannels = (ids: string[], customs: Channel[]) =>
    saveChannelConfig(ownedShopId ?? null, { activeIds: ids, customChannels: customs });
  const addChannel = (id: string) => {
    if (!id) return;
    if (id === "__custom__") {
      const name = (window.prompt("اسم القناة الجديدة (مثال: مرسول، نون، تطبيق خاص):") || "").trim();
      if (!name) return;
      const cid = "custom-" + Date.now();
      const nc = [...customChannels, { id: cid, icon: "🏷️", nm: name }];
      const ni = [...activeIds, cid];
      setCustomChannels(nc); setActiveIds(ni); persistChannels(ni, nc);
      return;
    }
    const ni = [...activeIds, id];
    setActiveIds(ni); persistChannels(ni, customChannels);
  };
  const removeChannel = (id: string) => {
    const ni = activeIds.filter((x) => x !== id);
    const nc = id.startsWith("custom-") ? customChannels.filter((c) => c.id !== id) : customChannels;
    setActiveIds(ni); setCustomChannels(nc); persistChannels(ni, nc);
  };
  const addReason = () => setReasons((p) => [...p, newReason()]);
  const delReason = (id: number) => setReasons((p) => p.filter((r) => r.id !== id));
  const editReason = (id: number, patch: Partial<Reason>) => setReasons((p) => p.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const calc = useMemo(() => {
    const shiftTotals: Record<ShiftId, { sys: number; act: number }> = { am: { sys: 0, act: 0 }, pm: { sys: 0, act: 0 } };
    const perChannelActual: Record<string, number> = {};
    SHIFTS.forEach((sh) => {
      activeChannels.forEach((c) => {
        const sign = c.sign ?? 1;
        const sys = num(getVal(sh.id, c.id, "sys")) * sign;
        const act = num(getVal(sh.id, c.id, "act")) * sign;
        shiftTotals[sh.id].sys += sys; shiftTotals[sh.id].act += act;
        perChannelActual[c.id] = (perChannelActual[c.id] || 0) + act;
      });
    });
    const gSys = shiftTotals.am.sys + shiftTotals.pm.sys;
    const gAct = shiftTotals.am.act + shiftTotals.pm.act;
    const net = gAct - gSys;
    const err = gSys !== 0 ? (net / gSys) * 100 : 0;
    const warn = Math.abs(err) > 5;
    const reasonsSum = reasons.reduce((s, r) => s + num(r.amount), 0);
    const need = Math.abs(net);
    const left = Math.max(0, need - reasonsSum);
    const covered = need < 0.01 || left < 0.01;
    // عند وجود فرق: كل سبب له مبلغ لازم يحدد الشفت واسم الموظف
    const hasDiff = need >= 0.01;
    const badReasons = hasDiff ? reasons.filter((r) => num(r.amount) !== 0 && (!r.shift || !r.employees.trim())) : [];
    const justified = covered && badReasons.length === 0;
    return { shiftTotals, gSys, gAct, net, err, warn, reasonsSum, need, left, covered, hasDiff, badReasons, justified, perChannelActual };
  }, [vals, reasons, activeIds]);

  const diffColor = (v: number) => (v > 0.009 ? "text-emerald-400" : v < -0.009 ? "text-red-400" : "text-slate-500");
  const diffTxt = (v: number) => (v > 0 ? "+" : "") + fmt(v);

  const [reloadKey, setReloadKey] = useState(0);

  const save = () => {
    const entry: SavedEntry = {
      branchId: ownedShopId ?? null, branch, date, channels: activeIds, customChannels, vals, reasons, note,
      gSys: calc.gSys, gAct: calc.gAct, net: calc.net, err: calc.err, perChannelActual: calc.perChannelActual,
    };
    const all = loadAll().filter((e) => !(e.branchId === (ownedShopId ?? null) && e.date === date));
    all.push(entry); all.sort((a, b) => a.date.localeCompare(b.date));
    saveAll(all); setReloadKey((k) => k + 1);
    alert("✓ تم حفظ تسوية اليوم");
  };
  const clearForm = () => { setVals({}); setReasons([newReason()]); setNote(""); };

  // ── التقرير ──
  const monthStart = new Date().toISOString().slice(0, 8) + "01";
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));

  const report = useMemo(() => {
    const all = loadAll().filter((e) => e.branchId === (ownedShopId ?? null) && e.date >= from && e.date <= to);
    all.sort((a, b) => a.date.localeCompare(b.date));
    const used = new Set<string>(); all.forEach((e) => e.channels.forEach((c) => used.add(c)));
    const customMap = new Map<string, Channel>();
    all.forEach((e) => (e.customChannels ?? []).forEach((c) => customMap.set(c.id, c)));
    const cols = [...CHANNEL_CATALOG, ...customMap.values()].filter((c) => used.has(c.id));
    const acts = all.map((e) => e.gAct);
    const max = acts.length ? Math.max(...acts) : 0;
    const min = acts.length ? Math.min(...acts) : 0;
    const avg = acts.length ? acts.reduce((s, n) => s + n, 0) / acts.length : 0;
    const grandActual = all.reduce((s, e) => s + e.gAct, 0);
    const grandSystem = all.reduce((s, e) => s + e.gSys, 0);
    const colTotals: Record<string, number> = {};
    cols.forEach((c) => { colTotals[c.id] = all.reduce((s, e) => s + (e.perChannelActual[c.id] || 0), 0); });
    return { rows: all, cols, max, min, avg, grandActual, grandSystem, colTotals };
  }, [from, to, reloadKey, tab, ownedShopId]);
  const grandDiff = report.grandActual - report.grandSystem;
  const grandErr = report.grandSystem !== 0 ? (grandDiff / report.grandSystem) * 100 : 0;
  const pctOfTotal = (v: number) => (report.grandActual > 0 ? (v / report.grandActual) * 100 : 0);

  // ── تصدير ──
  const buildExportHTML = () => {
    const rows = report.rows, cols = report.cols;
    const n = rows.length;
    const grandActual = rows.reduce((s, e) => s + e.gAct, 0);
    const grandSystem = rows.reduce((s, e) => s + e.gSys, 0);
    const grandDiff = grandActual - grandSystem;
    const grandErr = grandSystem !== 0 ? (grandDiff / grandSystem) * 100 : 0;
    const colTotals: Record<string, number> = {};
    cols.forEach((c) => { colTotals[c.id] = rows.reduce((s, e) => s + (e.perChannelActual[c.id] || 0), 0); });
    const pct = (v: number) => (grandActual > 0 ? (v / grandActual) * 100 : 0);
    const now = new Date().toLocaleString("ar-SA");

    const card = (label: string, value: string, green = false) =>
      `<div style="flex:1;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:10px 14px;">
         <div style="font-size:10px;color:#6b7280;font-weight:700;">${label}</div>
         <div style="font-size:17px;font-weight:800;margin-top:3px;color:${green ? "#15a06a" : "#111827"};">${value}</div>
       </div>`;

    const header = `
      <div style="background:#0f1b2b;padding:16px 20px;display:flex;justify-content:space-between;align-items:center;">
        <div style="text-align:left;">
          <div style="font-size:20px;font-weight:800;color:#34d399;">تقرير تسوية المبيعات</div>
          <div style="font-size:12px;color:#9fb3c8;">الفترة: ${from} إلى ${to} — ${now}</div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="text-align:right;">
            <div style="font-size:18px;font-weight:800;color:#ffffff;">محور</div>
            <div style="font-size:9px;letter-spacing:3px;color:#9fb3c8;">MIHWAR PLATFORM</div>
          </div>
          <div style="width:42px;height:42px;border-radius:11px;background:rgba(52,211,153,0.12);border:1px solid rgba(52,211,153,0.4);color:#34d399;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:18px;">م</div>
        </div>
      </div>`;

    const cards = `
      <div style="display:flex;gap:10px;padding:14px 20px;background:#f8fafc;">
        ${card("الفرع", branch || "—")}
        ${card("عدد الأيام", String(n))}
        ${card("إجمالي التحصيل الفعلي", fmt(grandActual) + " ر.س", true)}
        ${card("متوسط اليوم", fmt(report.avg) + " ر.س")}
      </div>`;

    const ths = ["التاريخ", ...cols.map((c) => c.nm), "الفعلي", "السيستم", "الفرق", "الخطأ %", "الحالة", "ملاحظات"];
    const thead = `<tr>${ths.map((h) => `<th style="border:1px solid #d1d5db;padding:7px 8px;background:#14304d;color:#fff;font-size:11px;font-weight:700;white-space:nowrap;">${h}</th>`).join("")}</tr>`;

    const body = rows.map((e, idx) => {
      const warn = Math.abs(e.err) > 5;
      const bg = idx % 2 ? "#ffffff" : "#f9fafb";
      const cells = [
        e.date,
        ...cols.map((c) => (e.perChannelActual[c.id] ? fmt(e.perChannelActual[c.id]) : "—")),
        `<b style="color:#15a06a;">${fmt(e.gAct)}</b>`,
        fmt(e.gSys),
        (e.net > 0 ? "+" : "") + fmt(e.net),
        (e.err > 0 ? "+" : "") + e.err.toFixed(1) + "%",
        warn ? "⚠️ مراجعة" : "OK",
        (e.note || "").replace(/</g, "&lt;"),
      ];
      return `<tr style="background:${bg};">${cells.map((v, i) =>
        `<td style="border:1px solid #e5e7eb;padding:5px 8px;font-size:11px;text-align:${i === cells.length - 1 ? "right" : "center"};">${v}</td>`
      ).join("")}</tr>`;
    }).join("");

    // صف الإجماليات
    const totalCells = ["الإجمالي", ...cols.map((c) => fmt(colTotals[c.id])), fmt(grandActual), fmt(grandSystem),
      (grandDiff > 0 ? "+" : "") + fmt(grandDiff), (grandErr > 0 ? "+" : "") + grandErr.toFixed(1) + "%", "", ""];
    const totalRow = `<tr>${totalCells.map((v, i) =>
      `<td style="border:1px solid #cbd5e1;padding:6px 8px;font-size:11px;font-weight:800;text-align:${i === 0 ? "right" : "center"};background:#eef2f7;color:#0f1b2b;">${v}</td>`
    ).join("")}</tr>`;

    // صف نسبة كل قناة من إجمالي المبيعات
    const pctCells = ["نسبة القناة %", ...cols.map((c) => pct(colTotals[c.id]).toFixed(1) + "%"), "100%", "", "", "", "", ""];
    const pctRow = `<tr>${pctCells.map((v, i) =>
      `<td style="border:1px solid #cbd5e1;padding:6px 8px;font-size:11px;font-weight:800;text-align:${i === 0 ? "right" : "center"};background:#15a06a;color:#ffffff;">${v}</td>`
    ).join("")}</tr>`;

    const table = `
      <div style="padding:6px 20px 14px;">
        <table style="border-collapse:collapse;width:100%;">
          <thead>${thead}</thead>
          <tbody>${body}${totalRow}${pctRow}</tbody>
        </table>
        <div style="margin-top:10px;font-size:11px;color:#374151;">
          أعلى يوم: <b style="color:#15a06a;">${fmt(report.max)}</b> · المتوسط: <b>${fmt(report.avg)}</b> · أقل يوم: <b style="color:#dc2626;">${fmt(report.min)}</b> · عدد الأيام: <b>${n}</b>
        </div>
      </div>`;

    const footer = `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 20px;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:10px;">
        <div>تم إنشاء هذا التقرير آليًا من صفحة تسوية المبيعات</div>
        <div>منصة محور — MIHWAR B2B Marketplace</div>
      </div>`;

    return `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;color:#1f2937;background:#fff;">${header}${cards}${table}${footer}</div>`;
  };
  const exportPDF = () => {
    const w = window.open("", "_blank", "width=1000,height=900"); if (!w) return;
    w.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>تقرير تسوية — ${branch}</title></head><body>${buildExportHTML()}<script>window.onload=function(){window.print();}<\/script></body></html>`);
    w.document.close();
  };
  const exportExcel = () => {
    const html = `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"></head><body>${buildExportHTML()}</body></html>`;
    const blob = new Blob(["﻿" + html], { type: "application/vnd.ms-excel;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `تسوية_${branch || "فرع"}_${from}_${to}.xls`; a.click(); URL.revokeObjectURL(a.href);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setReloadKey((k) => k + 1); }, [tab]);

  // ================= UI =================
  return (
    <div className="p-4 lg:p-6 min-h-screen" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-xl">📊</span>
            تسوية المبيعات اليومية
          </h1>
          <p className="text-slate-500 text-sm mt-1">مطابقة مبيعات السيستم مع التحصيل الفعلي</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-2">
          <div className="text-[10px] text-slate-500 font-bold">الفرع</div>
          <div className="text-sm font-bold text-white">{branch || "—"}</div>
        </div>
      </div>

      <div className="inline-flex gap-1 bg-slate-900 border border-slate-800 rounded-2xl p-1 mb-5">
        {([["entry", "📝 إدخال اليوم"], ["report", "📊 التقرير المجمّع"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${tab === k ? "bg-blue-600 text-white" : "text-slate-400 hover:text-slate-200"}`}>{label}</button>
        ))}
      </div>

      {/* ENTRY */}
      {tab === "entry" && (
        <>
          <div className="flex flex-wrap items-end gap-3 mb-4">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-slate-500 font-bold">التاريخ</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-xl text-white px-3 py-2 text-sm [color-scheme:dark]" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-slate-500 font-bold">إضافة قناة</label>
              <select value="" onChange={(e) => addChannel(e.target.value)} className="bg-blue-600/10 border border-dashed border-blue-500 rounded-xl text-blue-300 px-3 py-2 text-sm">
                <option value="">+ اختر قناة…</option>
                {availableToAdd.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.nm}</option>)}
                <option value="__custom__">➕ قناة مخصصة (اكتب الاسم)…</option>
              </select>
            </div>
          </div>

          {SHIFTS.map((sh) => (
            <div key={sh.id} className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden mb-4">
              <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2"><span className={`w-1 h-4 rounded ${sh.bar}`} /><h2 className="text-sm font-bold text-white">{sh.nm}</h2></div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse" style={{ minWidth: 120 + activeChannels.length * 110 }}>
                  <thead>
                    <tr className="bg-[#0b1220]">
                      <th className="text-right text-[10px] font-bold text-slate-500 uppercase px-3 py-2">البند</th>
                      {activeChannels.map((c) => (
                        <th key={c.id} className="text-center text-[10px] font-bold text-slate-500 px-2 py-2 whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1"><span>{c.icon} {c.nm}</span>{!c.base && <button onClick={() => removeChannel(c.id)} title="إزالة" className="text-red-400 text-[11px] leading-none">✕</button>}</div>
                        </th>
                      ))}
                      <th className="text-center text-[10px] font-bold text-slate-500 px-2 py-2">الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(["sys", "act"] as const).map((f) => (
                      <tr key={f}>
                        <td className="text-right font-bold text-xs text-slate-400 bg-[#0b1220] px-3 py-2 whitespace-nowrap">{f === "sys" ? "السيستم" : "الفعلي"}</td>
                        {activeChannels.map((c) => (
                          <td key={c.id} className="px-1.5 py-2 text-center border-t border-slate-800">
                            <input type="number" step="0.01" placeholder="0" value={getVal(sh.id, c.id, f)} onChange={(e) => setVal(sh.id, c.id, f, e.target.value)} className="w-20 bg-[#0b1220] border border-slate-700 rounded-lg text-white px-2 py-1.5 text-center font-mono text-xs [direction:ltr] focus:outline-none focus:border-blue-500" />
                          </td>
                        ))}
                        <td className="text-center border-t border-slate-800 font-mono text-slate-300 text-xs">{fmt(calc.shiftTotals[sh.id][f])}</td>
                      </tr>
                    ))}
                    <tr className="bg-white/[0.012]">
                      <td className="text-right font-bold text-xs text-slate-400 bg-[#0b1220] px-3 py-2 whitespace-nowrap">الفرق</td>
                      {activeChannels.map((c) => {
                        const sign = c.sign ?? 1;
                        const d = (num(getVal(sh.id, c.id, "act")) - num(getVal(sh.id, c.id, "sys"))) * sign;
                        return <td key={c.id} className={`text-center border-t border-slate-800 font-mono font-bold text-xs [direction:ltr] ${diffColor(d)}`}>{diffTxt(d)}</td>;
                      })}
                      <td className={`text-center border-t border-slate-800 font-mono font-bold text-xs [direction:ltr] ${diffColor(calc.shiftTotals[sh.id].act - calc.shiftTotals[sh.id].sys)}`}>{diffTxt(calc.shiftTotals[sh.id].act - calc.shiftTotals[sh.id].sys)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4"><div className="text-[10px] text-slate-500 font-bold">مبيعات السيستم</div><div className="text-xl font-black font-mono mt-1 text-white [direction:ltr]">{fmt(calc.gSys)} <span className="text-[11px] text-slate-500">ر.س</span></div></div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4"><div className="text-[10px] text-slate-500 font-bold">التحصيل الفعلي</div><div className="text-xl font-black font-mono mt-1 text-white [direction:ltr]">{fmt(calc.gAct)} <span className="text-[11px] text-slate-500">ر.س</span></div></div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4"><div className="text-[10px] text-slate-500 font-bold">الفرق</div><div className={`text-xl font-black font-mono mt-1 [direction:ltr] ${diffColor(calc.net)}`}>{diffTxt(calc.net)} <span className="text-[11px] text-slate-500">ر.س</span></div></div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4"><div className="text-[10px] text-slate-500 font-bold">نسبة الخطأ + الحالة</div><div className="text-lg font-black font-mono mt-1 text-white [direction:ltr]">{(calc.err > 0 ? "+" : "") + calc.err.toFixed(1)}%</div><span className={`inline-flex items-center gap-1.5 mt-1.5 text-xs font-extrabold px-3 py-1 rounded-full ${calc.warn ? "bg-amber-500/15 text-amber-400" : "bg-emerald-500/15 text-emerald-400"}`}>{calc.warn ? "⚠️ يحتاج مراجعة" : "✓ مطابق"}</span></div>
          </div>

          {/* reasons */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden mb-4">
            <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2"><span className="w-1 h-4 rounded bg-amber-500" /><h2 className="text-sm font-bold text-white">أسباب الفروقات والمبالغ المستردة</h2>{calc.hasDiff && <span className="text-[11px] text-amber-400 font-bold mr-auto">إلزامي: حدّد الشفت واسم الموظف لكل فرق</span>}</div>

            <datalist id="staffList">{STAFF_SUGGEST.map((s) => <option key={s} value={s} />)}</datalist>

            {reasons.map((r) => {
              const bad = calc.hasDiff && num(r.amount) !== 0 && (!r.shift || !r.employees.trim());
              return (
                <div key={r.id} className={`flex flex-wrap gap-2 items-center px-4 py-2 border-b border-dashed last:border-b-0 ${bad ? "border-red-500/40 bg-red-500/[0.04]" : "border-slate-800"}`}>
                  <select value={r.shift} onChange={(e) => editReason(r.id, { shift: e.target.value })} className={`w-24 bg-[#0b1220] border rounded-lg text-white px-2 py-1.5 text-xs ${bad && !r.shift ? "border-red-500" : "border-slate-700"}`}>{SHIFT_OPTS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}</select>
                  <input list="staffList" placeholder="اسم الموظف (أو أكثر بفاصلة)" value={r.employees} onChange={(e) => editReason(r.id, { employees: e.target.value })} className={`flex-1 min-w-[150px] bg-[#0b1220] border rounded-lg text-white px-2 py-1.5 text-xs ${bad && !r.employees.trim() ? "border-red-500" : "border-slate-700"}`} />
                  <select value={r.reason} onChange={(e) => editReason(r.id, { reason: e.target.value })} className="flex-1 min-w-[140px] bg-[#0b1220] border border-slate-700 rounded-lg text-white px-2 py-1.5 text-xs">{REASON_OPTS.map((o) => <option key={o}>{o}</option>)}</select>
                  <input type="number" step="0.01" placeholder="المبلغ" value={r.amount} onChange={(e) => editReason(r.id, { amount: e.target.value })} className="w-24 bg-[#0b1220] border border-slate-700 rounded-lg text-white px-2 py-1.5 text-center font-mono text-xs [direction:ltr]" />
                  <input placeholder="ملاحظة" value={r.note} onChange={(e) => editReason(r.id, { note: e.target.value })} className="flex-1 min-w-[100px] bg-[#0b1220] border border-slate-700 rounded-lg text-white px-2 py-1.5 text-xs" />
                  <button onClick={() => delReason(r.id)} className="w-8 h-8 rounded-lg bg-red-500/10 text-red-400 shrink-0">✕</button>
                </div>
              );
            })}
            <button onClick={addReason} className="m-3.5 bg-blue-600/10 border border-dashed border-blue-500 text-blue-300 py-2.5 rounded-xl w-[calc(100%-28px)] font-bold text-xs">+ إضافة سبب / مبلغ مسترد</button>

            <div className="mx-3.5 mb-3.5 bg-[#0b1220] border border-slate-800 rounded-xl p-3.5">
              <div className="flex justify-between text-xs mb-1.5"><span className="text-slate-400 font-semibold">الفرق المطلوب تبريره</span><span className="font-mono font-bold text-slate-200 [direction:ltr]">{fmt(calc.need)}</span></div>
              <div className="flex justify-between text-xs mb-1.5"><span className="text-slate-400 font-semibold">المبرَّر (مجموع الأسباب)</span><span className="font-mono font-bold text-emerald-400 [direction:ltr]">{fmt(calc.reasonsSum)}</span></div>
              <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden my-2"><div className="h-full bg-gradient-to-l from-emerald-500 to-amber-500 rounded-full transition-all" style={{ width: `${calc.need > 0 ? Math.min(100, (calc.reasonsSum / calc.need) * 100) : calc.net === 0 ? 100 : 0}%` }} /></div>
              <div className="flex justify-between text-xs"><span className="text-slate-400 font-semibold">غير المبرَّر المتبقي</span><span className={`font-mono font-bold [direction:ltr] ${calc.left > 0.009 ? "text-red-400" : "text-emerald-400"}`}>{fmt(calc.left)}</span></div>
              <div className="mt-2.5 text-xs font-extrabold">
                {calc.need < 0.01 ? <span className="text-emerald-400">✅ مطابق تمامًا</span>
                  : !calc.covered ? <span className="text-amber-400">⚠️ يتبقى {fmt(calc.left)} ر.س غير مبرَّر</span>
                  : calc.badReasons.length > 0 ? <span className="text-red-400">⚠️ حدّد الشفت واسم الموظف لكل سبب</span>
                  : <span className="text-emerald-400">✅ الفرق مبرَّر بالكامل — جاهز للحفظ</span>}
              </div>
            </div>

            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="ملاحظة اليوم (تظهر في عمود Notes بالتقرير)…" className="w-[calc(100%-28px)] mx-3.5 mb-3.5 bg-[#0b1220] border border-slate-700 rounded-xl text-white p-2.5 text-sm resize-y min-h-[54px]" />
          </div>

          <div className="flex gap-3 justify-end flex-wrap">
            <button onClick={clearForm} className="px-6 py-3 rounded-xl bg-slate-900 border border-slate-700 text-slate-400 font-bold text-sm">تفريغ</button>
            <button onClick={save} disabled={!calc.justified} className="px-6 py-3 rounded-xl bg-emerald-500 text-emerald-950 font-extrabold text-sm disabled:opacity-40 disabled:cursor-not-allowed">💾 حفظ تسوية اليوم</button>
          </div>
        </>
      )}

      {/* REPORT */}
      {tab === "report" && (
        <>
          <div className="flex flex-wrap items-end gap-3 mb-4">
            <div className="flex flex-col gap-1"><label className="text-[10px] text-slate-500 font-bold">من</label><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-xl text-white px-3 py-2 text-sm [color-scheme:dark]" /></div>
            <div className="flex flex-col gap-1"><label className="text-[10px] text-slate-500 font-bold">إلى</label><input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-xl text-white px-3 py-2 text-sm [color-scheme:dark]" /></div>
            <div className="flex gap-2 mr-auto">
              <button onClick={exportPDF} disabled={!report.rows.length} className="px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 font-bold text-xs disabled:opacity-40">⬇ PDF</button>
              <button onClick={exportExcel} disabled={!report.rows.length} className="px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold text-xs disabled:opacity-40">⬇ Excel</button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5"><div className="text-[10px] text-slate-500 font-bold">أعلى مبيعات (MAX)</div><div className="text-xl font-black font-mono mt-1 text-emerald-400">{fmt(report.max)}</div></div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5"><div className="text-[10px] text-slate-500 font-bold">المتوسط (AVG)</div><div className="text-xl font-black font-mono mt-1 text-white">{fmt(report.avg)}</div></div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5"><div className="text-[10px] text-slate-500 font-bold">أقل مبيعات (MIN)</div><div className="text-xl font-black font-mono mt-1 text-red-400">{fmt(report.min)}</div></div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2"><span className="w-1 h-4 rounded bg-blue-500" /><h2 className="text-sm font-bold text-white">تقرير تسوية المبيعات</h2><span className="text-[11px] text-slate-500 mr-auto">{branch || "—"} · {report.rows.length} يوم</span></div>
            {report.rows.length === 0 ? (
              <div className="p-10 text-center text-slate-500 text-sm">لا توجد أيام محفوظة ضمن هذا النطاق. احفظ يومًا من تبويب «إدخال اليوم» ليظهر هنا.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse" style={{ minWidth: 700 + report.cols.length * 80 }}>
                  <thead><tr>{["التاريخ", ...report.cols.map((c) => c.nm), "الفعلي", "السيستم", "الفرق", "الخطأ %", "الحالة", "ملاحظات"].map((h) => <th key={h} className="text-[10px] px-2 py-2.5 bg-[#0b1220] text-slate-500 uppercase whitespace-nowrap border-b border-slate-700">{h}</th>)}</tr></thead>
                  <tbody>
                    {report.rows.map((e) => {
                      const warn = Math.abs(e.err) > 5;
                      const dc = e.net > 0 ? "text-emerald-400" : e.net < 0 ? "text-red-400" : "text-slate-500";
                      return (
                        <tr key={e.date} className={warn ? "bg-amber-500/[0.07]" : "bg-emerald-500/[0.04]"}>
                          <td className="px-2 py-2 text-xs text-right font-mono [direction:ltr] whitespace-nowrap border-b border-slate-800">{e.date.slice(5)}</td>
                          {report.cols.map((c) => <td key={c.id} className="px-2 py-2 text-xs text-center font-mono [direction:ltr] border-b border-slate-800">{e.perChannelActual[c.id] ? fmt(e.perChannelActual[c.id]) : "—"}</td>)}
                          <td className="px-2 py-2 text-xs text-center font-mono font-bold text-amber-300 [direction:ltr] border-b border-slate-800">{fmt(e.gAct)}</td>
                          <td className="px-2 py-2 text-xs text-center font-mono font-bold text-white [direction:ltr] border-b border-slate-800">{fmt(e.gSys)}</td>
                          <td className={`px-2 py-2 text-xs text-center font-mono font-bold [direction:ltr] border-b border-slate-800 ${dc}`}>{e.net === 0 ? "—" : (e.net > 0 ? "+" : "") + fmt(e.net)}</td>
                          <td className={`px-2 py-2 text-xs text-center font-mono [direction:ltr] border-b border-slate-800 ${dc}`}>{(e.err > 0 ? "+" : "") + e.err.toFixed(1)}%</td>
                          <td className={`px-2 py-2 text-xs text-center font-extrabold border-b border-slate-800 ${warn ? "text-amber-400" : "text-emerald-400"}`}>{warn ? "⚠️" : "OK"}</td>
                          <td className="px-2 py-2 text-[11px] text-right text-slate-400 max-w-[240px] border-b border-slate-800">{e.note || ""}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-[#0b1220] font-bold">
                      <td className="px-2 py-2.5 text-xs text-right text-slate-200 whitespace-nowrap border-t border-slate-600">الإجمالي</td>
                      {report.cols.map((c) => <td key={c.id} className="px-2 py-2.5 text-xs text-center font-mono text-slate-200 [direction:ltr] border-t border-slate-600">{fmt(report.colTotals[c.id] || 0)}</td>)}
                      <td className="px-2 py-2.5 text-xs text-center font-mono text-emerald-400 [direction:ltr] border-t border-slate-600">{fmt(report.grandActual)}</td>
                      <td className="px-2 py-2.5 text-xs text-center font-mono text-white [direction:ltr] border-t border-slate-600">{fmt(report.grandSystem)}</td>
                      <td className="px-2 py-2.5 text-xs text-center font-mono [direction:ltr] border-t border-slate-600">{(grandDiff > 0 ? "+" : "") + fmt(grandDiff)}</td>
                      <td className="px-2 py-2.5 text-xs text-center font-mono [direction:ltr] border-t border-slate-600">{(grandErr > 0 ? "+" : "") + grandErr.toFixed(1)}%</td>
                      <td className="border-t border-slate-600" /><td className="border-t border-slate-600" />
                    </tr>
                    <tr className="bg-emerald-600/15">
                      <td className="px-2 py-2.5 text-xs text-right font-extrabold text-emerald-300 whitespace-nowrap">نسبة القناة %</td>
                      {report.cols.map((c) => <td key={c.id} className="px-2 py-2.5 text-xs text-center font-mono font-bold text-emerald-300 [direction:ltr]">{pctOfTotal(report.colTotals[c.id] || 0).toFixed(1)}%</td>)}
                      <td className="px-2 py-2.5 text-xs text-center font-mono font-bold text-emerald-300 [direction:ltr]">100%</td>
                      <td /><td /><td /><td /><td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
