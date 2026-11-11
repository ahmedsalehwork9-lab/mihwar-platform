// =============================================================
// src/pages/expenses/FixedExpensesPage.tsx
//
// المصروفات الثابتة + نقطة التعادل — لكل فرع.
// • قسم رواتب تفصيلي: اسم الموظف، الوظيفة، نوع الراتب (يومي/أسبوعي/شهري)،
//   القيمة، والمستحق الشهري يُحسب تلقائيًا.
// • قسم مصروفات ثابتة أخرى (إيجار، كهرباء، إنترنت…) مع الاستحقاق وطريقة الدفع
//   وخيار «يدخل في التعادل؟».
// • تبويب نقطة التعادل: يسحب المبيعات الفعلية من تسوية المبيعات والتكاليف
//   المتغيرة من المشتريات للشهر المختار (قابلة للتعديل)، ويحسب التعادل والمستهدف.
// • التخزين محلي (localStorage) لكل فرع — الربط بـ Supabase لاحقًا.
// =============================================================

import { useMemo, useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../lib/supabase";

type SalType = "daily" | "weekly" | "monthly";
type Salary = { id: number; name: string; title: string; type: SalType; amount: string; count: string; note: string };
type FEItem = { id: number; name: string; amount: string; dueDate: string; payment: string; inBE: boolean; note: string };
type FEConfig = { salaries: Salary[]; items: FEItem[]; targetUplift: string };

const PAY_OPTS = ["نقدي", "شبكة (مدى)", "تحويل بنكي", "استقطاع", "آجل"];
const SAL_TYPES: { v: SalType; l: string; def: number }[] = [
  { v: "monthly", l: "شهري", def: 1 }, { v: "weekly", l: "أسبوعي", def: 4 }, { v: "daily", l: "يومي", def: 30 },
];
const DEFAULT_ITEM_NAMES = ["إيجار الفرع", "كهرباء ومياه", "إنترنت/اتصالات", "نظافة وصيانة ثابتة", "اشتراكات وبرامج", "تمويل/استقطاع", "مصروفات ثابتة أخرى"];

const FE_KEY = "mihwar_fixed_expenses";
const SALES_KEY = "mihwar_sales_reconciliation";
const PURCH_KEY = "mihwar_purchases";

const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 });
const num = (v: string) => parseFloat(v) || 0;
const uid = () => Date.now() + Math.random();

const newSalary = (): Salary => ({ id: uid(), name: "", title: "", type: "monthly", amount: "", count: "", note: "" });
const seedItems = (): FEItem[] => DEFAULT_ITEM_NAMES.map((nm) => ({ id: uid(), name: nm, amount: "", dueDate: "", payment: PAY_OPTS[0], inBE: true, note: "" }));
const defaultConfig = (): FEConfig => ({ salaries: [newSalary()], items: seedItems(), targetUplift: "40" });

function loadFE(branchId: number | null): FEConfig {
  try {
    const all = JSON.parse(localStorage.getItem(FE_KEY) || "{}");
    const c = all[String(branchId)];
    if (c && Array.isArray(c.salaries) && Array.isArray(c.items)) return { salaries: c.salaries, items: c.items, targetUplift: c.targetUplift ?? "40" };
  } catch { /* ignore */ }
  return defaultConfig();
}
function saveFE(branchId: number | null, cfg: FEConfig) {
  try { const all = JSON.parse(localStorage.getItem(FE_KEY) || "{}"); all[String(branchId)] = cfg; localStorage.setItem(FE_KEY, JSON.stringify(all)); } catch { /* ignore */ }
}
function salesActualForMonth(branchId: number | null, ym: string): number {
  try { const all = JSON.parse(localStorage.getItem(SALES_KEY) || "[]"); return all.filter((e: any) => e.branchId === branchId && (e.date || "").slice(0, 7) === ym).reduce((s: number, e: any) => s + (e.gAct || 0), 0); } catch { return 0; }
}
function purchasesForMonth(branchId: number | null, ym: string): number {
  try { const all = JSON.parse(localStorage.getItem(PURCH_KEY) || "[]"); return all.filter((e: any) => e.branchId === branchId && (e.date || "").slice(0, 7) === ym).reduce((s: number, e: any) => s + ((e.subtotal ?? e.total) || 0), 0); } catch { return 0; }
}

const salaryMonthly = (s: Salary) => {
  const amt = num(s.amount); const t = SAL_TYPES.find((x) => x.v === s.type)!;
  const cnt = s.count.trim() ? num(s.count) : t.def;
  return s.type === "monthly" ? amt : amt * cnt;
};

export default function FixedExpensesPage() {
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

  // تحويلات الفرع (طلبات) من Supabase: وارد = +تكلفة، صادر = −تكلفة
  const [orders, setOrders] = useState<any[]>([]);
  useEffect(() => {
    let active = true;
    (async () => {
      if (!ownedShopId) { setOrders([]); return; }
      const { data } = await supabase
        .from("orders")
        .select("id, from_shop_id, to_shop_id, status, total_amount, created_at")
        .or(`from_shop_id.eq.${ownedShopId},to_shop_id.eq.${ownedShopId}`);
      if (active) setOrders(data || []);
    })();
    return () => { active = false; };
  }, [ownedShopId]);

  const [tab, setTab] = useState<"fixed" | "breakeven">("fixed");

  // ── إعداد المصروفات (ثابت لكل فرع) ──
  const [salaries, setSalaries] = useState<Salary[]>([newSalary()]);
  const [items, setItems] = useState<FEItem[]>(seedItems());
  const [targetUplift, setTargetUplift] = useState("40");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const cfg = loadFE(ownedShopId ?? null);
    setSalaries(cfg.salaries.length ? cfg.salaries : [newSalary()]);
    setItems(cfg.items.length ? cfg.items : seedItems());
    setTargetUplift(cfg.targetUplift || "40");
    setReady(true);
  }, [ownedShopId]);
  useEffect(() => { if (ready) saveFE(ownedShopId ?? null, { salaries, items, targetUplift }); }, [salaries, items, targetUplift, ready, ownedShopId]);

  const addSalary = () => setSalaries((p) => [...p, newSalary()]);
  const delSalary = (id: number) => setSalaries((p) => (p.length > 1 ? p.filter((r) => r.id !== id) : [newSalary()]));
  const editSalary = (id: number, patch: Partial<Salary>) => setSalaries((p) => p.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const addItem = () => setItems((p) => [...p, { id: uid(), name: "", amount: "", dueDate: "", payment: PAY_OPTS[0], inBE: true, note: "" }]);
  const delItem = (id: number) => setItems((p) => p.filter((r) => r.id !== id));
  const editItem = (id: number, patch: Partial<FEItem>) => setItems((p) => p.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const salariesTotal = useMemo(() => salaries.reduce((s, r) => s + salaryMonthly(r), 0), [salaries]);
  const itemsTotal = useMemo(() => items.reduce((s, r) => s + num(r.amount), 0), [items]);
  const fixedTotal = salariesTotal + itemsTotal;
  // المصروفات الداخلة في التعادل (الرواتب كلها + البنود المحددة)
  const fixedForBE = useMemo(() => salariesTotal + items.filter((r) => r.inBE).reduce((s, r) => s + num(r.amount), 0), [salariesTotal, items]);

  // ── نقطة التعادل ──
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const suggSales = salesActualForMonth(ownedShopId ?? null, month);
  const suggPurch = purchasesForMonth(ownedShopId ?? null, month);
  // تحويلات الشهر (مكتمل/موافقة جزئية فقط): وارد للفرع +تكلفة، صادر −تكلفة
  const transfers = useMemo(() => {
    const inMonth = orders.filter((o) => (o.created_at || "").slice(0, 7) === month && (o.status === "completed" || o.status === "partially_approved"));
    const transIn = inMonth.filter((o) => o.to_shop_id === ownedShopId).reduce((s, o) => s + (o.total_amount || 0), 0);
    const transOut = inMonth.filter((o) => o.from_shop_id === ownedShopId).reduce((s, o) => s + (o.total_amount || 0), 0);
    return { transIn, transOut };
  }, [orders, month, ownedShopId]);
  const suggVar = suggPurch + transfers.transIn - transfers.transOut;
  const [salesOv, setSalesOv] = useState(""); // تجاوز يدوي
  const [varOv, setVarOv] = useState("");
  useEffect(() => { setSalesOv(""); setVarOv(""); }, [month, ownedShopId]);

  const actualSales = salesOv.trim() ? num(salesOv) : suggSales;
  const variableCosts = varOv.trim() ? num(varOv) : suggVar;

  const be = useMemo(() => {
    const varPct = actualSales > 0 ? variableCosts / actualSales : 0;
    const cm = 1 - varPct; // هامش المساهمة
    const breakEven = cm > 0 ? fixedForBE / cm : 0;
    const dailyBE = breakEven / 30;
    const uplift = num(targetUplift) / 100;
    const target = breakEven * (1 + uplift);
    const achievement = target > 0 ? (actualSales / target) * 100 : 0;
    const beAchievement = breakEven > 0 ? (actualSales / breakEven) * 100 : 0;
    const profit = actualSales - variableCosts - fixedForBE;
    const scenarios = [
      { l: "حد أدنى", up: 35 }, { l: "أساسي", up: num(targetUplift) }, { l: "حد أعلى", up: 50 },
    ].map((s) => ({ ...s, target: breakEven * (1 + s.up / 100), diff: breakEven * (s.up / 100) }));
    return { varPct, cm, breakEven, dailyBE, target, achievement, beAchievement, profit, scenarios };
  }, [actualSales, variableCosts, fixedForBE, targetUplift]);

  // ── تصدير التعادل (تصميم محور) ──
  const buildBEHTML = () => {
    const now = new Date().toLocaleString("ar-SA");
    const card = (l: string, v: string, green = false) => `<div style="flex:1;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:10px 14px;"><div style="font-size:10px;color:#6b7280;font-weight:700;">${l}</div><div style="font-size:16px;font-weight:800;margin-top:3px;color:${green ? "#15a06a" : "#111827"};">${v}</div></div>`;
    const header = `<div style="background:#0f1b2b;padding:16px 20px;display:flex;justify-content:space-between;align-items:center;"><div style="text-align:left;"><div style="font-size:20px;font-weight:800;color:#34d399;">نقطة التعادل والمستهدف</div><div style="font-size:12px;color:#9fb3c8;">الشهر: ${month} — ${now}</div></div><div style="display:flex;align-items:center;gap:10px;"><div style="text-align:right;"><div style="font-size:18px;font-weight:800;color:#fff;">محور</div><div style="font-size:9px;letter-spacing:3px;color:#9fb3c8;">MIHWAR PLATFORM</div></div><div style="width:42px;height:42px;border-radius:11px;background:rgba(52,211,153,0.12);border:1px solid rgba(52,211,153,0.4);color:#34d399;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:18px;">م</div></div></div>`;
    const cards = `<div style="display:flex;gap:10px;padding:14px 20px;background:#f8fafc;">${card("الفرع", branch || "—")}${card("المبيعات الفعلية", fmt(actualSales) + " ر.س")}${card("نقطة التعادل", fmt(be.breakEven) + " ر.س", true)}${card("المستهدف", fmt(be.target) + " ر.س", true)}</div>`;
    const row = (l: string, v: string, note = "") => `<tr><td style="border:1px solid #e5e7eb;padding:6px 10px;font-size:12px;text-align:right;font-weight:600;color:#374151;">${l}</td><td style="border:1px solid #e5e7eb;padding:6px 10px;font-size:12px;text-align:center;font-weight:800;color:#0f1b2b;">${v}</td><td style="border:1px solid #e5e7eb;padding:6px 10px;font-size:11px;text-align:right;color:#6b7280;">${note}</td></tr>`;
    const metrics = `<div style="padding:8px 20px;"><table style="border-collapse:collapse;width:100%;max-width:640px;">
      ${row("المبيعات الشهرية الفعلية", fmt(actualSales) + " ر.س", "من بيانات تسوية المبيعات")}
      ${row("التكاليف الثابتة الشهرية", fmt(fixedForBE) + " ر.س", "من صفحة المصروفات الثابتة")}
      ${row("التكاليف المتغيرة", fmt(variableCosts) + " ر.س", "مشتريات + تحويل وارد − تحويل صادر")}
      ${row("— تحويل وارد (مكتمل/جزئي)", "+" + fmt(transfers.transIn) + " ر.س", "طلبات واردة للفرع")}
      ${row("— تحويل صادر (مكتمل/جزئي)", "−" + fmt(transfers.transOut) + " ر.س", "طلبات صادرة من الفرع")}
      ${row("نسبة التكلفة المتغيرة", (be.varPct * 100).toFixed(1) + "%", "متغيرة ÷ مبيعات")}
      ${row("هامش المساهمة", (be.cm * 100).toFixed(1) + "%", "1 − نسبة المتغيرة")}
      ${row("نقطة التعادل الشهرية", fmt(be.breakEven) + " ر.س", "ثابتة ÷ هامش المساهمة")}
      ${row("نقطة التعادل اليومية", fmt(be.dailyBE) + " ر.س", "شهري ÷ 30")}
      ${row("المستهدف (Target)", fmt(be.target) + " ر.س", `تعادل × (1 + ${targetUplift}%)`)}
      ${row("تحقيق المستهدف", be.achievement.toFixed(1) + "%", "مبيعات ÷ المستهدف")}
      ${row("صافي الربح التقديري", fmt(be.profit) + " ر.س", "مبيعات − متغيرة − ثابتة")}
    </table></div>`;
    const scen = `<div style="padding:4px 20px 14px;"><div style="font-size:13px;font-weight:800;color:#0f1b2b;margin:6px 0;">سيناريوهات المستهدف فوق نقطة التعادل</div>
      <table style="border-collapse:collapse;width:100%;max-width:640px;"><tr>${["السيناريو", "الزيادة", "Target", "الفرق عن التعادل"].map((h) => `<th style="border:1px solid #d1d5db;padding:6px 8px;background:#14304d;color:#fff;font-size:11px;">${h}</th>`).join("")}</tr>
      ${be.scenarios.map((s) => `<tr><td style="border:1px solid #e5e7eb;padding:5px 8px;font-size:11px;text-align:right;">${s.l}</td><td style="border:1px solid #e5e7eb;padding:5px 8px;font-size:11px;text-align:center;">${s.up}%</td><td style="border:1px solid #e5e7eb;padding:5px 8px;font-size:11px;text-align:center;font-weight:800;color:#15a06a;">${fmt(s.target)}</td><td style="border:1px solid #e5e7eb;padding:5px 8px;font-size:11px;text-align:center;">${fmt(s.diff)}</td></tr>`).join("")}</table></div>`;
    const footer = `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 20px;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:10px;"><div>تم إنشاء هذا التقرير آليًا من صفحة المصروفات الثابتة / نقطة التعادل</div><div>منصة محور — MIHWAR B2B Marketplace</div></div>`;
    return `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;color:#1f2937;background:#fff;">${header}${cards}${metrics}${scen}${footer}</div>`;
  };
  const exportPDF = () => {
    const w = window.open("", "_blank", "width=1000,height=900"); if (!w) return;
    w.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>نقطة التعادل — ${branch}</title></head><body>${buildBEHTML()}<script>window.onload=function(){window.print();}<\/script></body></html>`);
    w.document.close();
  };

  const upliftNum = num(targetUplift);

  // ================= UI =================
  return (
    <div className="p-4 lg:p-6 min-h-screen" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-xl">🏦</span>
            المصروفات الثابتة ونقطة التعادل
          </h1>
          <p className="text-slate-500 text-sm mt-1">الرواتب والمصروفات الثابتة + حساب نقطة التعادل والمستهدف</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-2">
          <div className="text-[10px] text-slate-500 font-bold">الفرع</div>
          <div className="text-sm font-bold text-white">{branch || "—"}</div>
        </div>
      </div>

      <div className="inline-flex gap-1 bg-slate-900 border border-slate-800 rounded-2xl p-1 mb-5">
        {([["fixed", "🏢 المصروفات الثابتة"], ["breakeven", "🎯 نقطة التعادل"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${tab === k ? "bg-blue-600 text-white" : "text-slate-400 hover:text-slate-200"}`}>{label}</button>
        ))}
      </div>

      {/* ===== المصروفات الثابتة ===== */}
      {tab === "fixed" && (
        <>
          {/* الرواتب */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden mb-4">
            <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2"><span className="w-1 h-4 rounded bg-emerald-500" /><h2 className="text-sm font-bold text-white">الرواتب (تفصيلي)</h2><span className="text-[11px] text-emerald-400 font-bold mr-auto">إجمالي شهري: {fmt(salariesTotal)} ر.س</span></div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse" style={{ minWidth: 820 }}>
                <thead><tr className="bg-[#0b1220]">{["اسم الموظف", "الوظيفة", "نوع الراتب", "القيمة", "العدد/الشهر", "المستحق الشهري", "ملاحظات", ""].map((h) => <th key={h} className="text-right text-[10px] font-bold text-slate-500 px-3 py-2 whitespace-nowrap">{h}</th>)}</tr></thead>
                <tbody>
                  {salaries.map((s) => {
                    const t = SAL_TYPES.find((x) => x.v === s.type)!;
                    return (
                      <tr key={s.id} className="border-t border-slate-800">
                        <td className="px-2 py-1.5"><input value={s.name} onChange={(e) => editSalary(s.id, { name: e.target.value })} placeholder="الاسم" className="w-full min-w-[130px] bg-[#0b1220] border border-slate-700 rounded-lg text-white px-2 py-1.5 text-xs" /></td>
                        <td className="px-2 py-1.5"><input value={s.title} onChange={(e) => editSalary(s.id, { title: e.target.value })} placeholder="مثال: باريستا" className="w-full min-w-[110px] bg-[#0b1220] border border-slate-700 rounded-lg text-white px-2 py-1.5 text-xs" /></td>
                        <td className="px-2 py-1.5"><select value={s.type} onChange={(e) => editSalary(s.id, { type: e.target.value as SalType })} className="w-24 bg-[#0b1220] border border-slate-700 rounded-lg text-white px-2 py-1.5 text-xs">{SAL_TYPES.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}</select></td>
                        <td className="px-2 py-1.5"><input type="number" step="0.01" value={s.amount} onChange={(e) => editSalary(s.id, { amount: e.target.value })} placeholder="0" className="w-24 bg-[#0b1220] border border-slate-700 rounded-lg text-white px-2 py-1.5 text-center font-mono text-xs [direction:ltr]" /></td>
                        <td className="px-2 py-1.5">{s.type === "monthly" ? <span className="text-slate-600 text-xs">—</span> : <input type="number" value={s.count} onChange={(e) => editSalary(s.id, { count: e.target.value })} placeholder={String(t.def)} className="w-16 bg-[#0b1220] border border-slate-700 rounded-lg text-white px-2 py-1.5 text-center font-mono text-xs [direction:ltr]" />}</td>
                        <td className="px-2 py-1.5 text-center font-mono text-emerald-400 text-xs [direction:ltr] whitespace-nowrap">{fmt(salaryMonthly(s))}</td>
                        <td className="px-2 py-1.5"><input value={s.note} onChange={(e) => editSalary(s.id, { note: e.target.value })} placeholder="ملاحظة" className="w-full min-w-[90px] bg-[#0b1220] border border-slate-700 rounded-lg text-white px-2 py-1.5 text-xs" /></td>
                        <td className="px-2 py-1.5 text-center"><button onClick={() => delSalary(s.id)} className="w-7 h-7 rounded-lg bg-red-500/10 text-red-400">✕</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <button onClick={addSalary} className="m-3.5 bg-blue-600/10 border border-dashed border-blue-500 text-blue-300 py-2.5 rounded-xl w-[calc(100%-28px)] font-bold text-xs">+ إضافة موظف</button>
          </div>

          {/* مصروفات ثابتة أخرى */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden mb-4">
            <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2"><span className="w-1 h-4 rounded bg-blue-500" /><h2 className="text-sm font-bold text-white">مصروفات ثابتة أخرى</h2><span className="text-[11px] text-slate-400 font-bold mr-auto">إجمالي: {fmt(itemsTotal)} ر.س</span></div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse" style={{ minWidth: 820 }}>
                <thead><tr className="bg-[#0b1220]">{["البند", "القيمة الشهرية", "تاريخ الاستحقاق", "طريقة الدفع", "يدخل في التعادل؟", "ملاحظات", ""].map((h) => <th key={h} className="text-right text-[10px] font-bold text-slate-500 px-3 py-2 whitespace-nowrap">{h}</th>)}</tr></thead>
                <tbody>
                  {items.map((r) => (
                    <tr key={r.id} className="border-t border-slate-800">
                      <td className="px-2 py-1.5"><input value={r.name} onChange={(e) => editItem(r.id, { name: e.target.value })} placeholder="اسم البند" className="w-full min-w-[150px] bg-[#0b1220] border border-slate-700 rounded-lg text-white px-2 py-1.5 text-xs" /></td>
                      <td className="px-2 py-1.5"><input type="number" step="0.01" value={r.amount} onChange={(e) => editItem(r.id, { amount: e.target.value })} placeholder="0" className="w-28 bg-[#0b1220] border border-slate-700 rounded-lg text-white px-2 py-1.5 text-center font-mono text-xs [direction:ltr]" /></td>
                      <td className="px-2 py-1.5"><input type="date" value={r.dueDate} onChange={(e) => editItem(r.id, { dueDate: e.target.value })} className="bg-[#0b1220] border border-slate-700 rounded-lg text-white px-2 py-1.5 text-xs [color-scheme:dark]" /></td>
                      <td className="px-2 py-1.5"><select value={r.payment} onChange={(e) => editItem(r.id, { payment: e.target.value })} className="w-28 bg-[#0b1220] border border-slate-700 rounded-lg text-white px-2 py-1.5 text-xs">{PAY_OPTS.map((o) => <option key={o}>{o}</option>)}</select></td>
                      <td className="px-2 py-1.5 text-center"><button onClick={() => editItem(r.id, { inBE: !r.inBE })} className={`text-xs font-bold px-3 py-1 rounded-full ${r.inBE ? "bg-emerald-500/15 text-emerald-400" : "bg-slate-600/20 text-slate-500"}`}>{r.inBE ? "✓ نعم" : "لا"}</button></td>
                      <td className="px-2 py-1.5"><input value={r.note} onChange={(e) => editItem(r.id, { note: e.target.value })} placeholder="المصدر/ملاحظة" className="w-full min-w-[110px] bg-[#0b1220] border border-slate-700 rounded-lg text-white px-2 py-1.5 text-xs" /></td>
                      <td className="px-2 py-1.5 text-center"><button onClick={() => delItem(r.id)} className="w-7 h-7 rounded-lg bg-red-500/10 text-red-400">✕</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button onClick={addItem} className="m-3.5 bg-blue-600/10 border border-dashed border-blue-500 text-blue-300 py-2.5 rounded-xl w-[calc(100%-28px)] font-bold text-xs">+ إضافة بند</button>
          </div>

          {/* إجماليات */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4"><div className="text-[10px] text-slate-500 font-bold">إجمالي الرواتب</div><div className="text-xl font-black font-mono mt-1 text-white [direction:ltr]">{fmt(salariesTotal)} <span className="text-[11px] text-slate-500">ر.س</span></div></div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4"><div className="text-[10px] text-slate-500 font-bold">إجمالي المصروفات الأخرى</div><div className="text-xl font-black font-mono mt-1 text-white [direction:ltr]">{fmt(itemsTotal)} <span className="text-[11px] text-slate-500">ر.س</span></div></div>
            <div className="bg-gradient-to-br from-blue-600/20 to-slate-900 border border-blue-500/20 rounded-2xl p-4"><div className="text-[10px] text-slate-400 font-bold">إجمالي المصروفات الثابتة</div><div className="text-2xl font-black font-mono mt-1 text-emerald-400 [direction:ltr]">{fmt(fixedTotal)} <span className="text-xs text-slate-400">ر.س</span></div></div>
          </div>
        </>
      )}

      {/* ===== نقطة التعادل ===== */}
      {tab === "breakeven" && (
        <>
          <div className="flex flex-wrap items-end gap-3 mb-4">
            <div className="flex flex-col gap-1"><label className="text-[10px] text-slate-500 font-bold">الشهر</label><input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-xl text-white px-3 py-2 text-sm [color-scheme:dark]" /></div>
            <div className="flex flex-col gap-1"><label className="text-[10px] text-slate-500 font-bold">نسبة الزيادة المستهدفة %</label><input type="number" value={targetUplift} onChange={(e) => setTargetUplift(e.target.value)} className="w-32 bg-slate-900 border border-slate-700 rounded-xl text-white px-3 py-2 text-sm text-center font-mono [direction:ltr]" /></div>
            <button onClick={exportPDF} className="px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 font-bold text-xs mr-auto">⬇ PDF</button>
          </div>

          {/* المدخلات (مع المقترح التلقائي) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-1"><span className="text-[10px] text-slate-500 font-bold">المبيعات الفعلية (شهري)</span>{salesOv.trim() && <button onClick={() => setSalesOv("")} className="text-[10px] text-blue-400">استخدم المقترح</button>}</div>
              <input type="number" value={salesOv} onChange={(e) => setSalesOv(e.target.value)} placeholder={fmt(suggSales)} className="w-full bg-[#0b1220] border border-slate-700 rounded-xl text-white px-3 py-2 text-lg font-mono text-center [direction:ltr]" />
              <div className="text-[10px] text-slate-500 mt-1">مقترح من تسوية المبيعات: {fmt(suggSales)} ر.س</div>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-1"><span className="text-[10px] text-slate-500 font-bold">التكاليف المتغيرة (شهري)</span>{varOv.trim() && <button onClick={() => setVarOv("")} className="text-[10px] text-blue-400">استخدم المقترح</button>}</div>
              <input type="number" value={varOv} onChange={(e) => setVarOv(e.target.value)} placeholder={fmt(suggVar)} className="w-full bg-[#0b1220] border border-slate-700 rounded-xl text-white px-3 py-2 text-lg font-mono text-center [direction:ltr]" />
              <div className="text-[10px] text-slate-500 mt-1 leading-relaxed [direction:ltr] text-right">مشتريات {fmt(suggPurch)} <span className="text-emerald-400">+ وارد {fmt(transfers.transIn)}</span> <span className="text-red-400">− صادر {fmt(transfers.transOut)}</span> = <b className="text-slate-300">{fmt(suggVar)}</b> ر.س</div>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
              <div className="text-[10px] text-slate-500 font-bold">التكاليف الثابتة (من الصفحة)</div>
              <div className="w-full text-lg font-mono text-center text-white [direction:ltr] py-2">{fmt(fixedForBE)}</div>
              <div className="text-[10px] text-slate-500 mt-1">الرواتب + البنود الداخلة في التعادل</div>
            </div>
          </div>

          {/* المؤشرات */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4"><div className="text-[10px] text-slate-500 font-bold">هامش المساهمة</div><div className="text-xl font-black font-mono mt-1 text-white [direction:ltr]">{(be.cm * 100).toFixed(1)}%</div><div className="text-[10px] text-slate-600 mt-0.5">متغيرة: {(be.varPct * 100).toFixed(1)}%</div></div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4"><div className="text-[10px] text-slate-500 font-bold">نقطة التعادل الشهرية</div><div className="text-xl font-black font-mono mt-1 text-amber-400 [direction:ltr]">{fmt(be.breakEven)}</div><div className="text-[10px] text-slate-600 mt-0.5">يومي: {fmt(be.dailyBE)}</div></div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4"><div className="text-[10px] text-slate-500 font-bold">المستهدف (+{upliftNum}%)</div><div className="text-xl font-black font-mono mt-1 text-emerald-400 [direction:ltr]">{fmt(be.target)}</div></div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4"><div className="text-[10px] text-slate-500 font-bold">صافي الربح التقديري</div><div className={`text-xl font-black font-mono mt-1 [direction:ltr] ${be.profit >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmt(be.profit)}</div></div>
          </div>

          {/* شريط الإنجاز */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 mb-4">
            <div className="flex justify-between text-xs mb-2"><span className="text-slate-400 font-bold">المبيعات الفعلية مقابل التعادل والمستهدف</span><span className="font-mono text-white [direction:ltr]">{fmt(actualSales)} ر.س</span></div>
            <div className="relative h-5 bg-slate-800 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${actualSales >= be.breakEven ? "bg-gradient-to-l from-emerald-500 to-blue-500" : "bg-gradient-to-l from-amber-500 to-red-500"}`} style={{ width: `${be.target > 0 ? Math.min(100, (actualSales / be.target) * 100) : 0}%` }} />
              {be.target > 0 && <div className="absolute top-0 h-full border-r-2 border-dashed border-amber-300" style={{ right: `${Math.min(100, (be.breakEven / be.target) * 100)}%` }} title="نقطة التعادل" />}
            </div>
            <div className="flex justify-between text-[10px] text-slate-500 mt-1.5">
              <span>تحقيق التعادل: <b className={be.beAchievement >= 100 ? "text-emerald-400" : "text-amber-400"}>{be.beAchievement.toFixed(0)}%</b></span>
              <span>تحقيق المستهدف: <b className={be.achievement >= 100 ? "text-emerald-400" : "text-amber-400"}>{be.achievement.toFixed(0)}%</b></span>
            </div>
            <div className="mt-2 text-xs font-bold">
              {actualSales >= be.target ? <span className="text-emerald-400">✅ تجاوزت المستهدف</span>
                : actualSales >= be.breakEven ? <span className="text-blue-400">✔️ فوق نقطة التعادل — تحتاج {fmt(Math.max(0, be.target - actualSales))} ر.س للوصول للمستهدف</span>
                : <span className="text-amber-400">⚠️ تحت نقطة التعادل — تحتاج {fmt(Math.max(0, be.breakEven - actualSales))} ر.س للوصول للتعادل</span>}
            </div>
          </div>

          {/* السيناريوهات */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2"><span className="w-1 h-4 rounded bg-emerald-500" /><h2 className="text-sm font-bold text-white">سيناريوهات المستهدف فوق نقطة التعادل</h2></div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse" style={{ minWidth: 520 }}>
                <thead><tr>{["السيناريو", "الزيادة", "Target الشهري", "الفرق عن التعادل"].map((h) => <th key={h} className="text-[10px] px-3 py-2.5 bg-[#0b1220] text-slate-500 border-b border-slate-700">{h}</th>)}</tr></thead>
                <tbody>
                  {be.scenarios.map((s, i) => (
                    <tr key={i} className={i === 1 ? "bg-emerald-500/[0.05]" : ""}>
                      <td className="px-3 py-2 text-xs text-right text-slate-200 border-b border-slate-800">{s.l}{i === 1 && <span className="text-[10px] text-emerald-400 mr-1">(أساسي)</span>}</td>
                      <td className="px-3 py-2 text-xs text-center font-mono text-slate-300 [direction:ltr] border-b border-slate-800">{s.up}%</td>
                      <td className="px-3 py-2 text-xs text-center font-mono font-bold text-emerald-400 [direction:ltr] border-b border-slate-800">{fmt(s.target)}</td>
                      <td className="px-3 py-2 text-xs text-center font-mono text-slate-300 [direction:ltr] border-b border-slate-800">{fmt(s.diff)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
