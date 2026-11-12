// =============================================================
// src/pages/sales/SalesReconciliationPage.tsx
//
// تسوية المبيعات اليومية — مطابقة مبيعات السيستم بالتحصيل الفعلي.
// التخزين الآن على Supabase (cafeDb) فيتزامن بين كل المتصفحات والأجهزة.
// الجدول داخل محور كما هو، وأعمدة قبل/الضريبة/شامل الضريبة في PDF/Excel.
// =============================================================

import { useMemo, useState, useEffect, useCallback } from "react";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../lib/supabase";
import {
  fetchSalesWithMigration, upsertSale,
  getSetting, getSettingWithMigration, setSetting, SETTING_KEYS, LOCAL_KEYS,
} from "../lib/cafeDb";
import { logoBox, contactFooter, waQrDataUrl, SUPPORT_WA } from "../lib/reportChrome";

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

const VAT_RATE = 15; // ضريبة القيمة المضافة % (تظهر في الـ PDF)
const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 });
const num = (v: string) => parseFloat(v) || 0;
const netOf = (gross: number) => gross / (1 + VAT_RATE / 100);
// توافق مع البيانات القديمة: جمع سيستم الشفتين في قيمة سيستم واحدة لكل قناة
const migrateVals = (v: Record<string, string>): Record<string, string> => {
  const out: Record<string, string> = { ...v };
  const chans = new Set<string>();
  Object.keys(v).forEach((k) => { const m = k.match(/^(am|pm)-(.+)-sys$/); if (m) chans.add(m[2]); });
  chans.forEach((c) => {
    if (out[`sys-${c}`] == null || out[`sys-${c}`] === "") {
      const a = parseFloat(v[`am-${c}-sys`]) || 0;
      const b = parseFloat(v[`pm-${c}-sys`]) || 0;
      if (a + b) out[`sys-${c}`] = String(a + b);
    }
  });
  return out;
}; // قبل الضريبة
const newReason = (): Reason => ({ id: Date.now() + Math.random(), shift: "", employees: "", reason: REASON_OPTS[0], amount: "", note: "" });

export default function SalesReconciliationPage() {
  const { ownedShopId } = (useAuth() as any) ?? {};
  const [branch, setBranch] = useState<string>("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const waNum = SUPPORT_WA;
  const [qr, setQr] = useState<string>("");

  useEffect(() => {
    let active = true;
    (async () => {
      if (!ownedShopId) { setBranch(""); setLogoUrl(null); return; }
      const { data } = await supabase.from("shops").select("shop_name, logo_url").eq("id", ownedShopId).single();
      if (active && data) {
        setBranch((data as any).shop_name ?? "");
        setLogoUrl((data as any).logo_url ?? null);
      }
    })();
    return () => { active = false; };
  }, [ownedShopId]);
  useEffect(() => { let a = true; (async () => { const d = await waQrDataUrl(waNum); if (a) setQr(d); })(); return () => { a = false; }; }, [waNum]);

  // ── أسماء الكاشير لكل فرع (مخزّنة على Supabase، غير موحّدة) ──
  const [staff, setStaff] = useState<string[]>([]);
  const [staffInput, setStaffInput] = useState("");
  useEffect(() => {
    (async () => {
      const list = await getSetting(ownedShopId ?? null, "staff_names");
      setStaff(Array.isArray(list) ? list : []);
    })();
  }, [ownedShopId]);
  const persistStaff = (list: string[]) => { setStaff(list); setSetting(ownedShopId ?? null, "staff_names", list); };
  const addStaff = () => { const n = staffInput.trim(); if (!n || staff.includes(n)) { setStaffInput(""); return; } persistStaff([...staff, n]); setStaffInput(""); };
  const removeStaff = (n: string) => persistStaff(staff.filter((x) => x !== n));

  const [tab, setTab] = useState<"entry" | "report">("entry");

  // ── كل تسويات الفرع (من Supabase) ──
  const [allEntries, setAllEntries] = useState<SavedEntry[]>([]);
  const reloadEntries = useCallback(async () => {
    const rows = await fetchSalesWithMigration(ownedShopId ?? null);
    setAllEntries(rows as SavedEntry[]);
  }, [ownedShopId]);
  useEffect(() => { reloadEntries(); }, [reloadEntries]);
  // عند الدخول لتبويب التقرير نعيد الجلب لنضمن أحدث بيانات (من أي جهاز)
  useEffect(() => { if (tab === "report") reloadEntries(); }, [tab, reloadEntries]);

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

  // القنوات ثابتة للفرع (إعداد مخزّن على Supabase): تُحمَّل مرة وتبقى
  useEffect(() => {
    (async () => {
      const cfg = await getSettingWithMigration(ownedShopId ?? null, SETTING_KEYS.salesChannels, LOCAL_KEYS.CH_LKEY, { activeIds: ["cash", "net"], customChannels: [] });
      setActiveIds(Array.isArray(cfg?.activeIds) && cfg.activeIds.length ? cfg.activeIds : ["cash", "net"]);
      setCustomChannels(Array.isArray(cfg?.customChannels) ? cfg.customChannels : []);
    })();
  }, [ownedShopId]);

  // تغيير التاريخ (أو تحديث البيانات) يحمّل تسوية اليوم من القائمة
  useEffect(() => {
    const e = allEntries.find((x) => x.date === date);
    if (e) {
      setVals(migrateVals(e.vals ?? {}));
      setReasons(e.reasons?.length ? e.reasons : [newReason()]);
      setNote(e.note ?? "");
    } else {
      setVals({});
      setReasons([newReason()]);
      setNote("");
    }
  }, [date, allEntries]);

  const getSys = (c: string) => vals[`sys-${c}`] ?? "";
  const setSys = (c: string, v: string) => setVals((p) => ({ ...p, [`sys-${c}`]: v }));
  const getAct = (sh: ShiftId, c: string) => vals[`${sh}-${c}-act`] ?? "";
  const setAct = (sh: ShiftId, c: string, v: string) => setVals((p) => ({ ...p, [`${sh}-${c}-act`]: v }));
  const persistChannels = (ids: string[], customs: Channel[]) =>
    setSetting(ownedShopId ?? null, SETTING_KEYS.salesChannels, { activeIds: ids, customChannels: customs });
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
    const perChannelSys: Record<string, number> = {};
    const perChannelActual: Record<string, number> = {};
    const shiftActual: Record<ShiftId, number> = { am: 0, pm: 0 };
    let gSys = 0, gAct = 0;
    activeChannels.forEach((c) => {
      const sign = c.sign ?? 1;
      const sysV = num(getSys(c.id)) * sign;
      perChannelSys[c.id] = sysV; gSys += sysV;
      const amA = num(getAct("am", c.id)) * sign;
      const pmA = num(getAct("pm", c.id)) * sign;
      perChannelActual[c.id] = amA + pmA;
      shiftActual.am += amA; shiftActual.pm += pmA; gAct += amA + pmA;
    });
    const net = gAct - gSys;
    const err = gSys !== 0 ? (net / gSys) * 100 : 0;
    const warn = Math.abs(err) > 5;
    const reasonsSum = reasons.reduce((s, r) => s + num(r.amount), 0);
    const need = Math.abs(net);
    const left = Math.max(0, need - reasonsSum);
    const covered = need < 0.01 || left < 0.01;
    const hasDiff = need >= 0.01;
    const badReasons = hasDiff ? reasons.filter((r) => num(r.amount) !== 0 && (!r.shift || !r.employees.trim())) : [];
    const justified = covered && badReasons.length === 0;
    return { perChannelSys, perChannelActual, shiftActual, gSys, gAct, net, err, warn, reasonsSum, need, left, covered, hasDiff, badReasons, justified };
  }, [vals, reasons, activeIds]);

  // ملء خانة المبلغ تلقائيًا بقيمة الفرق عند وجود سبب واحد وخانته فارغة
  useEffect(() => {
    setReasons((prev) => {
      if (prev.length !== 1 || prev[0].amount) return prev;
      if (calc.need < 0.01) return prev;
      return [{ ...prev[0], amount: String(Math.round(calc.need * 100) / 100) }];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calc.need]);

  const diffColor = (v: number) => (v > 0.009 ? "text-emerald-400" : v < -0.009 ? "text-red-400" : "text-slate-500");
  const diffTxt = (v: number) => (v > 0 ? "+" : "") + fmt(v);

  const [saving, setSaving] = useState(false);
  const save = async () => {
    const entry: SavedEntry = {
      branchId: ownedShopId ?? null, branch, date, channels: activeIds, customChannels, vals, reasons, note,
      gSys: calc.gSys, gAct: calc.gAct, net: calc.net, err: calc.err, perChannelActual: calc.perChannelActual,
    };
    setSaving(true);
    const ok = await upsertSale(ownedShopId ?? null, entry);
    setSaving(false);
    if (!ok) { alert("تعذّر حفظ التسوية — تأكد من اتصالك بالإنترنت وأن لديك صلاحية على هذا الفرع."); return; }
    await reloadEntries();
    alert("✓ تم حفظ تسوية اليوم");
  };
  const clearForm = () => { setVals({}); setReasons([newReason()]); setNote(""); };

  // ── التقرير ──
  const monthStart = new Date().toISOString().slice(0, 8) + "01";
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));

  const report = useMemo(() => {
    const all = allEntries.filter((e) => e.date >= from && e.date <= to).slice();
    all.sort((a, b) => a.date.localeCompare(b.date));
    const used = new Set<string>(); all.forEach((e) => (e.channels || []).forEach((c) => used.add(c)));
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
  }, [from, to, allEntries]);
  const grandDiff = report.grandActual - report.grandSystem;
  const grandErr = report.grandSystem !== 0 ? (grandDiff / report.grandSystem) * 100 : 0;
  const pctOfTotal = (v: number) => (report.grandActual > 0 ? (v / report.grandActual) * 100 : 0);

  // ── تصدير (الـ PDF/Excel يحتوي أعمدة قبل/الضريبة/شامل الضريبة) ──
  const buildExportHTML = () => {
    const rows = report.rows, cols = report.cols;
    const n = rows.length;
    const grandActual = rows.reduce((s, e) => s + e.gAct, 0);
    const grandSystem = rows.reduce((s, e) => s + e.gSys, 0);
    const grandDiff = grandActual - grandSystem;
    const grandErr = grandSystem !== 0 ? (grandDiff / grandSystem) * 100 : 0;
    const grandBefore = netOf(grandActual);
    const grandVat = grandActual - grandBefore;
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
          ${logoBox(logoUrl)}
        </div>
      </div>`;

    const cards = `
      <div style="display:flex;gap:10px;padding:14px 20px;background:#f8fafc;">
        ${card("الفرع", branch || "—")}
        ${card("عدد الأيام", String(n))}
        ${card("الإجمالي قبل الضريبة", fmt(grandBefore) + " ر.س")}
        ${card("ضريبة القيمة المضافة", fmt(grandVat) + " ر.س")}
        ${card("شامل الضريبة", fmt(grandActual) + " ر.س", true)}
      </div>`;

    const ths = ["التاريخ", ...cols.map((c) => c.nm), "الفعلي", "السيستم", "الفرق", "قبل الضريبة", "الضريبة", "شامل الضريبة", "الخطأ %", "الحالة", "ملاحظات"];
    const thead = `<tr>${ths.map((h) => `<th style="border:1px solid #d1d5db;padding:7px 8px;background:#14304d;color:#fff;font-size:11px;font-weight:700;white-space:nowrap;">${h}</th>`).join("")}</tr>`;

    const body = rows.map((e, idx) => {
      const warn = Math.abs(e.err) > 5;
      const bg = idx % 2 ? "#ffffff" : "#f9fafb";
      const before = netOf(e.gAct);
      const vat = e.gAct - before;
      const cells = [
        e.date,
        ...cols.map((c) => (e.perChannelActual[c.id] ? fmt(e.perChannelActual[c.id]) : "—")),
        `<b style="color:#15a06a;">${fmt(e.gAct)}</b>`,
        fmt(e.gSys),
        (e.net > 0 ? "+" : "") + fmt(e.net),
        fmt(before),
        `<span style="color:#b45309;">${fmt(vat)}</span>`,
        `<b style="color:#0f1b2b;">${fmt(e.gAct)}</b>`,
        (e.err > 0 ? "+" : "") + e.err.toFixed(1) + "%",
        warn ? "⚠️ مراجعة" : "OK",
        (e.note || "").replace(/</g, "&lt;"),
      ];
      return `<tr style="background:${bg};">${cells.map((v, i) =>
        `<td style="border:1px solid #e5e7eb;padding:5px 8px;font-size:11px;text-align:${i === cells.length - 1 ? "right" : "center"};">${v}</td>`
      ).join("")}</tr>`;
    }).join("");

    const totalCells = ["الإجمالي", ...cols.map((c) => fmt(colTotals[c.id])), fmt(grandActual), fmt(grandSystem),
      (grandDiff > 0 ? "+" : "") + fmt(grandDiff), fmt(grandBefore), fmt(grandVat), fmt(grandActual),
      (grandErr > 0 ? "+" : "") + grandErr.toFixed(1) + "%", "", ""];
    const totalRow = `<tr>${totalCells.map((v, i) =>
      `<td style="border:1px solid #cbd5e1;padding:6px 8px;font-size:11px;font-weight:800;text-align:${i === 0 ? "right" : "center"};background:#eef2f7;color:#0f1b2b;">${v}</td>`
    ).join("")}</tr>`;

    const pctCells = ["نسبة القناة %", ...cols.map((c) => pct(colTotals[c.id]).toFixed(1) + "%"), "100%", "", "", "", "", "", "", ""];
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
        <div style="margin-top:4px;font-size:10px;color:#9ca3af;">«شامل الضريبة» = التحصيل الفعلي · «قبل الضريبة» = الفعلي ÷ ${(1 + VAT_RATE / 100).toFixed(2)} · الضريبة ${VAT_RATE}%</div>
      </div>`;

    const footer = `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 20px;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:10px;gap:12px;">
        <div><div>تم إنشاء هذا التقرير آليًا من صفحة تسوية المبيعات</div><div>منصة محور — MIHWAR B2B Marketplace</div></div>
        ${contactFooter(waNum, qr)}
      </div>`;

    return `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;color:#1f2937;background:#fff;">${header}${cards}${table}${footer}</div>`;
  };
  const exportPDF = () => {
    const w = window.open("", "_blank", "width=1000,height=900"); if (!w) return;
    w.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar" style="color-scheme:light;background:#fff;"><head><meta charset="UTF-8"><meta name="color-scheme" content="light"><title>تقرير تسوية — ${branch}</title></head><body style="margin:0;background:#fff;">${buildExportHTML()}<script>window.onload=function(){window.print();}<\/script></body></html>`);
    w.document.close();
  };
  const exportExcel = () => {
    const html = `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"></head><body style="margin:0;background:#fff;">${buildExportHTML()}</body></html>`;
    const blob = new Blob(["﻿" + html], { type: "application/vnd.ms-excel;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `تسوية_${branch || "فرع"}_${from}_${to}.xls`; a.click(); URL.revokeObjectURL(a.href);
  };

  // ================= UI =================
  return (
    <div className="p-4 lg:p-6 min-h-screen" dir="rtl">
      <style>{`input[type=number]::-webkit-inner-spin-button,input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}input[type=number]{-moz-appearance:textfield}`}</style>
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

          {/* ① مبيعات السيستم */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden mb-4">
            <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2"><span className="w-1 h-4 rounded bg-emerald-500" /><h2 className="text-sm font-bold text-white">① مبيعات السيستم (الإجمالي لليوم)</h2><span className="text-[11px] text-slate-500 mr-auto">قيمة واحدة لكل قناة</span></div>
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
                  <tr>
                    <td className="text-right font-bold text-xs text-slate-400 bg-[#0b1220] px-3 py-2 whitespace-nowrap">السيستم</td>
                    {activeChannels.map((c) => (
                      <td key={c.id} className="px-1.5 py-2 text-center border-t border-slate-800">
                        <input type="number" step="0.01" placeholder="0" value={getSys(c.id)} onChange={(e) => setSys(c.id, e.target.value)} className="w-24 bg-[#0b1220] border border-slate-700 rounded-lg text-white px-2 py-1.5 text-center font-mono text-xs [direction:ltr] focus:outline-none focus:border-emerald-500" />
                      </td>
                    ))}
                    <td className="text-center border-t border-slate-800 font-mono font-bold text-emerald-300 text-xs [direction:ltr]">{fmt(calc.gSys)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* ② التحصيل الفعلي حسب الشفت */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden mb-4">
            <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2"><span className="w-1 h-4 rounded bg-blue-500" /><h2 className="text-sm font-bold text-white">② التحصيل الفعلي (حسب الشفت)</h2><span className="text-[11px] text-slate-500 mr-auto">صباحي + مسائي = الفعلي</span></div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse" style={{ minWidth: 120 + activeChannels.length * 110 }}>
                <thead>
                  <tr className="bg-[#0b1220]">
                    <th className="text-right text-[10px] font-bold text-slate-500 uppercase px-3 py-2">الشفت</th>
                    {activeChannels.map((c) => (
                      <th key={c.id} className="text-center text-[10px] font-bold text-slate-500 px-2 py-2 whitespace-nowrap">{c.icon} {c.nm}</th>
                    ))}
                    <th className="text-center text-[10px] font-bold text-slate-500 px-2 py-2">إجمالي الشفت</th>
                  </tr>
                </thead>
                <tbody>
                  {SHIFTS.map((sh) => {
                    const shTotal = activeChannels.reduce((s, c) => s + num(getAct(sh.id, c.id)) * (c.sign ?? 1), 0);
                    return (
                      <tr key={sh.id}>
                        <td className="text-right font-bold text-xs text-slate-400 bg-[#0b1220] px-3 py-2 whitespace-nowrap"><span className={`inline-block w-1.5 h-1.5 rounded-full ${sh.bar} ml-1`} />{sh.nm}</td>
                        {activeChannels.map((c) => (
                          <td key={c.id} className="px-1.5 py-2 text-center border-t border-slate-800">
                            <input type="number" step="0.01" placeholder="0" value={getAct(sh.id, c.id)} onChange={(e) => setAct(sh.id, c.id, e.target.value)} className="w-24 bg-[#0b1220] border border-slate-700 rounded-lg text-white px-2 py-1.5 text-center font-mono text-xs [direction:ltr] focus:outline-none focus:border-blue-500" />
                          </td>
                        ))}
                        <td className="text-center border-t border-slate-800 font-mono text-slate-300 text-xs [direction:ltr]">{fmt(shTotal)}</td>
                      </tr>
                    );
                  })}
                  <tr className="bg-[#0b1220]">
                    <td className="text-right font-bold text-xs text-slate-300 px-3 py-2 whitespace-nowrap">إجمالي الفعلي</td>
                    {activeChannels.map((c) => (
                      <td key={c.id} className="text-center border-t border-slate-700 font-mono font-bold text-emerald-400 text-xs [direction:ltr]">{fmt(calc.perChannelActual[c.id] || 0)}</td>
                    ))}
                    <td className="text-center border-t border-slate-700 font-mono font-bold text-emerald-400 text-xs [direction:ltr]">{fmt(calc.gAct)}</td>
                  </tr>
                  <tr className="bg-white/[0.012]">
                    <td className="text-right font-bold text-xs text-slate-400 px-3 py-2 whitespace-nowrap">الفرق (فعلي − سيستم)</td>
                    {activeChannels.map((c) => {
                      const d = (calc.perChannelActual[c.id] || 0) - (calc.perChannelSys[c.id] || 0);
                      return <td key={c.id} className={`text-center border-t border-slate-800 font-mono font-bold text-xs [direction:ltr] ${diffColor(d)}`}>{diffTxt(d)}</td>;
                    })}
                    <td className={`text-center border-t border-slate-800 font-mono font-bold text-xs [direction:ltr] ${diffColor(calc.net)}`}>{diffTxt(calc.net)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4"><div className="text-[10px] text-slate-500 font-bold">مبيعات السيستم</div><div className="text-xl font-black font-mono mt-1 text-white [direction:ltr]">{fmt(calc.gSys)} <span className="text-[11px] text-slate-500">ر.س</span></div></div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4"><div className="text-[10px] text-slate-500 font-bold">التحصيل الفعلي</div><div className="text-xl font-black font-mono mt-1 text-white [direction:ltr]">{fmt(calc.gAct)} <span className="text-[11px] text-slate-500">ر.س</span></div></div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4"><div className="text-[10px] text-slate-500 font-bold">الفرق</div><div className={`text-xl font-black font-mono mt-1 [direction:ltr] ${diffColor(calc.net)}`}>{diffTxt(calc.net)} <span className="text-[11px] text-slate-500">ر.س</span></div></div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4"><div className="text-[10px] text-slate-500 font-bold">نسبة الخطأ + الحالة</div><div className="text-lg font-black font-mono mt-1 text-white [direction:ltr]">{(calc.err > 0 ? "+" : "") + calc.err.toFixed(1)}%</div><span className={`inline-flex items-center gap-1.5 mt-1.5 text-xs font-extrabold px-3 py-1 rounded-full ${calc.warn ? "bg-amber-500/15 text-amber-400" : "bg-emerald-500/15 text-emerald-400"}`}>{calc.warn ? "⚠️ يحتاج مراجعة" : "✓ مطابق"}</span></div>
          </div>

          {/* reasons */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden mb-4">
            <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2"><span className="w-1 h-4 rounded bg-amber-500" /><h2 className="text-sm font-bold text-white">أسباب الفروقات والمبالغ المستردة</h2>{calc.hasDiff && <span className="text-[11px] text-amber-400 font-bold mr-auto">إلزامي: حدّد الشفت واسم الموظف لكل فرق</span>}</div>

            {/* إدارة أسماء الكاشير لهذا الفرع */}
            <div className="px-4 py-2.5 border-b border-slate-800 bg-[#0b1220]/40 flex items-center gap-2 flex-wrap">
              <span className="text-[11px] text-slate-400 font-bold">أسماء الكاشير (هذا الفرع):</span>
              {staff.map((n) => (
                <span key={n} className="inline-flex items-center gap-1 bg-slate-800 text-slate-200 text-[11px] rounded-full px-2.5 py-1">{n}<button onClick={() => removeStaff(n)} title="حذف" className="text-red-400 leading-none">✕</button></span>
              ))}
              <input value={staffInput} onChange={(e) => setStaffInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addStaff(); } }} placeholder="أضف اسم…" className="bg-slate-950 border border-slate-700 rounded-lg text-white px-2 py-1 text-[11px] w-28" />
              <button onClick={addStaff} className="text-[11px] bg-blue-600/15 border border-blue-500/30 text-blue-300 rounded-lg px-2.5 py-1 font-bold">+ إضافة</button>
            </div>

            <datalist id="staffList">{staff.map((s) => <option key={s} value={s} />)}</datalist>

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
            <button onClick={save} disabled={!calc.justified || saving} className="px-6 py-3 rounded-xl bg-emerald-500 text-emerald-950 font-extrabold text-sm disabled:opacity-40 disabled:cursor-not-allowed">{saving ? "جاري الحفظ…" : "💾 حفظ تسوية اليوم"}</button>
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
                  <thead><tr>{["التاريخ", ...report.cols.map((c) => c.nm), "الفعلي", "السيستم", "الفرق", "الخطأ %", "الحالة", "ملاحظات"].map((h) => <th key={h} className="text-[11px] px-2 py-2.5 bg-[#0b1220] text-slate-300 font-bold uppercase whitespace-nowrap border-b border-slate-700">{h}</th>)}</tr></thead>
                  <tbody>
                    {report.rows.map((e) => {
                      const warn = Math.abs(e.err) > 5;
                      const dc = e.net > 0 ? "text-emerald-400" : e.net < 0 ? "text-red-400" : "text-slate-400";
                      return (
                        <tr key={e.date} className={warn ? "bg-amber-500/[0.07]" : "bg-emerald-500/[0.04]"}>
                          <td className="px-2 py-2.5 text-[13px] text-right font-mono font-semibold text-slate-100 [direction:ltr] whitespace-nowrap border-b border-slate-800">{e.date.slice(5)}</td>
                          {report.cols.map((c) => <td key={c.id} className="px-2 py-2.5 text-[13px] text-center font-mono font-semibold text-slate-100 [direction:ltr] border-b border-slate-800">{e.perChannelActual[c.id] ? fmt(e.perChannelActual[c.id]) : "—"}</td>)}
                          <td className="px-2 py-2.5 text-[13px] text-center font-mono font-extrabold text-amber-300 [direction:ltr] border-b border-slate-800">{fmt(e.gAct)}</td>
                          <td className="px-2 py-2.5 text-[13px] text-center font-mono font-extrabold text-white [direction:ltr] border-b border-slate-800">{fmt(e.gSys)}</td>
                          <td className={`px-2 py-2.5 text-[13px] text-center font-mono font-extrabold [direction:ltr] border-b border-slate-800 ${dc}`}>{e.net === 0 ? "—" : (e.net > 0 ? "+" : "") + fmt(e.net)}</td>
                          <td className={`px-2 py-2.5 text-[13px] text-center font-mono font-bold [direction:ltr] border-b border-slate-800 ${dc}`}>{(e.err > 0 ? "+" : "") + e.err.toFixed(1)}%</td>
                          <td className={`px-2 py-2.5 text-xs text-center font-extrabold border-b border-slate-800 ${warn ? "text-amber-400" : "text-emerald-400"}`}>{warn ? "⚠️" : "OK"}</td>
                          <td className="px-2 py-2.5 text-[12px] text-right text-slate-300 max-w-[240px] border-b border-slate-800">{e.note || ""}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-[#0b1220] font-bold">
                      <td className="px-2 py-2.5 text-[13px] text-right text-slate-100 font-extrabold whitespace-nowrap border-t border-slate-600">الإجمالي</td>
                      {report.cols.map((c) => <td key={c.id} className="px-2 py-2.5 text-[13px] text-center font-mono font-bold text-slate-100 [direction:ltr] border-t border-slate-600">{fmt(report.colTotals[c.id] || 0)}</td>)}
                      <td className="px-2 py-2.5 text-[13px] text-center font-mono font-extrabold text-emerald-400 [direction:ltr] border-t border-slate-600">{fmt(report.grandActual)}</td>
                      <td className="px-2 py-2.5 text-[13px] text-center font-mono font-extrabold text-white [direction:ltr] border-t border-slate-600">{fmt(report.grandSystem)}</td>
                      <td className="px-2 py-2.5 text-[13px] text-center font-mono font-bold text-slate-100 [direction:ltr] border-t border-slate-600">{(grandDiff > 0 ? "+" : "") + fmt(grandDiff)}</td>
                      <td className="px-2 py-2.5 text-[13px] text-center font-mono font-bold text-slate-100 [direction:ltr] border-t border-slate-600">{(grandErr > 0 ? "+" : "") + grandErr.toFixed(1)}%</td>
                      <td className="border-t border-slate-600" /><td className="border-t border-slate-600" />
                    </tr>
                    <tr className="bg-emerald-600/15">
                      <td className="px-2 py-2.5 text-[13px] text-right font-extrabold text-emerald-300 whitespace-nowrap">نسبة القناة %</td>
                      {report.cols.map((c) => <td key={c.id} className="px-2 py-2.5 text-[13px] text-center font-mono font-bold text-emerald-300 [direction:ltr]">{pctOfTotal(report.colTotals[c.id] || 0).toFixed(1)}%</td>)}
                      <td className="px-2 py-2.5 text-[13px] text-center font-mono font-bold text-emerald-300 [direction:ltr]">100%</td>
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
