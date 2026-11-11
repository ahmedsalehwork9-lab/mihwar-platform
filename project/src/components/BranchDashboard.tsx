// =============================================================
// src/components/BranchDashboard.tsx
// لوحة مؤشرات حيّة للفرع — تُدرَج أعلى الصفحة الرئيسية.
// تقرأ لحظيًا من: تسوية المبيعات + المشتريات + المصروفات الثابتة
// (نفس مفاتيح التخزين المستخدمة في صفحات المقهى)،
// بالإضافة إلى أكثر الأصناف وارد/صادر من تحويلات الفروع (Supabase).
// =============================================================

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../pages/lib/supabase";

const SALES_KEY = "mihwar_sales_reconciliation";
const PURCH_KEY = "mihwar_purchases";
const FE_KEY = "mihwar_fixed_expenses";
const VAT_RATE = 15;

const BASE_CH: Record<string, string> = { cash: "نقدي", net: "شبكة", keeta: "كيتا", hunger: "هنقرستيشن", jahez: "جاهز", trans: "تحويل", refund: "مرتجع" };
const fmt = (n: number) => (Math.round(n) ).toLocaleString("en-US");
const num = (v: any) => parseFloat(v) || 0;
const readArr = (k: string): any[] => { try { return JSON.parse(localStorage.getItem(k) || "[]"); } catch { return []; } };

const salaryMonthly = (s: any) => {
  const amt = num(s.amount); const cnt = s.count && String(s.count).trim() ? num(s.count) : (s.type === "daily" ? 30 : s.type === "weekly" ? 4 : 1);
  return s.type === "monthly" ? amt : amt * cnt;
};

// تجميع أصناف التحويلات حسب المنتج (أعلى 5 بالكمية)
type ItemAgg = { id: number; name: string; qty: number };
const aggItems = (rows: any[]): ItemAgg[] => {
  const m: Record<string, { name: string; qty: number }> = {};
  (rows || []).forEach((r) => {
    const pid = r.product_id;
    if (pid == null) return;
    const prod = Array.isArray(r.products) ? r.products[0] : r.products;
    const name = prod?.product_name || prod?.product_code || "—";
    if (!m[pid]) m[pid] = { name, qty: 0 };
    m[pid].qty += num(r.quantity);
  });
  return Object.entries(m)
    .map(([id, v]) => ({ id: Number(id), name: v.name, qty: v.qty }))
    .filter((x) => x.qty > 0)
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5);
};

function ItemsCard({ title, rows, accent, empty }: { title: string; rows: ItemAgg[]; accent: string; empty: string }) {
  const max = Math.max(1, ...rows.map((r) => r.qty));
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
      <div className="text-xs text-slate-400 font-bold mb-2">{title}</div>
      {rows.length === 0 ? <div className="text-xs text-slate-600">{empty}</div> : rows.map((r, i) => (
        <div key={r.id} className="mb-1.5">
          <div className="flex justify-between text-[11px] mb-0.5 gap-2">
            <span className="text-slate-300 truncate">{i + 1}. {r.name}</span>
            <span className="font-mono text-slate-400 [direction:ltr] shrink-0">{fmt(r.qty)}</span>
          </div>
          <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden"><div className={`h-full rounded-full ${accent}`} style={{ width: `${(r.qty / max) * 100}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

export default function BranchDashboard() {
  const { ownedShopId } = (useAuth() as any) ?? {};
  const bid = ownedShopId ?? null;
  const today = new Date().toISOString().slice(0, 10);
  const ym = today.slice(0, 7);

  const d = useMemo(() => {
    const sales = readArr(SALES_KEY).filter((e) => e.branchId === bid);
    const monthSalesRows = sales.filter((e) => (e.date || "").slice(0, 7) === ym);
    const todaySales = sales.filter((e) => e.date === today).reduce((s, e) => s + (e.gAct || 0), 0);
    const monthSales = monthSalesRows.reduce((s, e) => s + (e.gAct || 0), 0);

    // قنوات الشهر
    const perCh: Record<string, number> = {};
    monthSalesRows.forEach((e) => Object.entries(e.perChannelActual || {}).forEach(([k, v]) => { perCh[k] = (perCh[k] || 0) + (v as number); }));
    const channels = Object.entries(perCh).filter(([, v]) => (v as number) > 0).sort((a, b) => (b[1] as number) - (a[1] as number)).slice(0, 4)
      .map(([id, v]) => ({ name: BASE_CH[id] || id, val: v as number }));

    // آخر 7 أيام
    const trend: { day: string; val: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const dt = new Date(); dt.setDate(dt.getDate() - i);
      const key = dt.toISOString().slice(0, 10);
      const v = sales.filter((e) => e.date === key).reduce((s, e) => s + (e.gAct || 0), 0);
      trend.push({ day: key.slice(8), val: v });
    }
    const trendMax = Math.max(1, ...trend.map((t) => t.val));

    // مشتريات الشهر (صافي)
    const monthPurch = readArr(PURCH_KEY).filter((e) => e.branchId === bid && (e.date || "").slice(0, 7) === ym).reduce((s, e) => s + ((e.subtotal ?? e.total) || 0), 0);

    // مصروفات ثابتة
    const fe = (() => { try { return JSON.parse(localStorage.getItem(FE_KEY) || "{}")[String(bid)] || { salaries: [], items: [] }; } catch { return { salaries: [], items: [] }; } })();
    const salaries = (fe.salaries || []).reduce((s: number, r: any) => s + salaryMonthly(r), 0);
    const itemsTotal = (fe.items || []).reduce((s: number, r: any) => s + num(r.amount), 0);
    const fixedMonthly = salaries + itemsTotal;

    // تعادل وربح
    const netSales = monthSales / (1 + VAT_RATE / 100);
    const varPct = monthSales > 0 ? monthPurch / netSales : 0;
    const cm = 1 - varPct;
    const breakEven = cm > 0 ? fixedMonthly / cm : 0;
    const beAchievement = breakEven > 0 ? (netSales / breakEven) * 100 : 0;
    const profit = netSales - monthPurch - fixedMonthly;

    // تنبيهات
    const discrepancies = monthSalesRows.filter((e) => Math.abs(e.err || 0) > 5).length;
    const hasData = sales.length > 0;

    return { todaySales, monthSales, monthPurch, fixedMonthly, netSales, breakEven, beAchievement, profit, channels, trend, trendMax, discrepancies, hasData };
  }, [bid, today, ym]);

  const chTotal = d.channels.reduce((s, c) => s + c.val, 0) || 1;

  // ── أكثر الأصناف وارد/صادر (تحويلات الفروع من Supabase) ──
  const [inItems, setInItems] = useState<ItemAgg[]>([]);
  const [outItems, setOutItems] = useState<ItemAgg[]>([]);

  useEffect(() => {
    let alive = true;
    if (!bid) { setInItems([]); setOutItems([]); return; }
    (async () => {
      try {
        const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
        const base = () => supabase
          .from("order_items")
          .select("quantity, product_id, products(product_name, product_code), orders!inner(from_shop_id, to_shop_id, status, created_at)")
          .in("orders.status", ["completed", "partially_approved"])
          .gte("orders.created_at", monthStart)
          .limit(2000);
        const [inc, out] = await Promise.all([
          base().eq("orders.to_shop_id", bid),   // وارد للفرع
          base().eq("orders.from_shop_id", bid), // صادر من الفرع
        ]);
        if (!alive) return;
        setInItems(aggItems(inc.data || []));
        setOutItems(aggItems(out.data || []));
      } catch (e) {
        console.error("TRANSFER ITEMS FAILED", e);
      }
    })();
    return () => { alive = false; };
  }, [bid]);

  return (
    <div className="mb-6" dir="rtl">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-1 h-5 rounded bg-emerald-500" />
        <h2 className="text-lg font-black text-white">نظرة الفرع اللحظية</h2>
        <span className="text-[11px] text-slate-500 mr-auto">هذا الشهر · {ym}</span>
      </div>

      {!d.hasData && (
        <div className="mb-3 text-xs text-slate-400 bg-slate-900 border border-slate-800 rounded-xl p-3">
          لا توجد بيانات مبيعات بعد — ابدأ الإدخال من «تسوية المبيعات» وستظهر المؤشرات هنا تلقائيًا.
        </div>
      )}

      {/* بطاقات */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="text-[10px] text-slate-500 font-bold">مبيعات اليوم</div>
          <div className="text-2xl font-black font-mono mt-1 text-white [direction:ltr]">{fmt(d.todaySales)} <span className="text-xs text-slate-500">ر.س</span></div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="text-[10px] text-slate-500 font-bold">مبيعات الشهر</div>
          <div className="text-2xl font-black font-mono mt-1 text-blue-400 [direction:ltr]">{fmt(d.monthSales)} <span className="text-xs text-slate-500">ر.س</span></div>
        </div>
        <div className="bg-gradient-to-br from-emerald-600/15 to-slate-900 border border-emerald-500/20 rounded-2xl p-4">
          <div className="text-[10px] text-slate-400 font-bold">صافي الربح التقديري (الشهر)</div>
          <div className={`text-2xl font-black font-mono mt-1 [direction:ltr] ${d.profit >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmt(d.profit)} <span className="text-xs text-slate-500">ر.س</span></div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="text-[10px] text-slate-500 font-bold">مشتريات / مصروفات الشهر</div>
          <div className="text-sm font-black font-mono mt-1 text-slate-200 [direction:ltr]">{fmt(d.monthPurch)} <span className="text-[10px] text-slate-500">مشتريات</span></div>
          <div className="text-sm font-black font-mono text-slate-200 [direction:ltr]">{fmt(d.fixedMonthly)} <span className="text-[10px] text-slate-500">ثابتة</span></div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* التعادل */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="flex justify-between text-xs mb-2"><span className="text-slate-400 font-bold">التقدّم نحو نقطة التعادل</span><span className="font-mono text-amber-400 [direction:ltr]">{fmt(d.breakEven)} ر.س</span></div>
          <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${d.beAchievement >= 100 ? "bg-gradient-to-l from-emerald-500 to-blue-500" : "bg-gradient-to-l from-amber-500 to-red-500"}`} style={{ width: `${Math.min(100, d.beAchievement)}%` }} />
          </div>
          <div className="mt-2 text-xs font-bold">
            {d.breakEven <= 0 ? <span className="text-slate-500">أدخل المصروفات الثابتة لحساب التعادل</span>
              : d.netSales >= d.breakEven ? <span className="text-emerald-400">✅ تجاوزت التعادل ({d.beAchievement.toFixed(0)}%)</span>
                : <span className="text-amber-400">تحت التعادل ({d.beAchievement.toFixed(0)}%) — باقي {fmt(Math.max(0, d.breakEven - d.netSales))} ر.س</span>}
          </div>
        </div>

        {/* أعلى القنوات */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="text-xs text-slate-400 font-bold mb-2">أعلى القنوات (الشهر)</div>
          {d.channels.length === 0 ? <div className="text-xs text-slate-600">لا يوجد</div> : d.channels.map((c) => (
            <div key={c.name} className="mb-1.5">
              <div className="flex justify-between text-[11px] mb-0.5"><span className="text-slate-300">{c.name}</span><span className="font-mono text-slate-400 [direction:ltr]">{fmt(c.val)}</span></div>
              <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden"><div className="h-full bg-gradient-to-l from-emerald-500 to-blue-500 rounded-full" style={{ width: `${(c.val / chTotal) * 100}%` }} /></div>
            </div>
          ))}
        </div>

        {/* اتجاه 7 أيام + تنبيه */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="text-xs text-slate-400 font-bold mb-2">مبيعات آخر 7 أيام</div>
          <div className="flex items-end justify-between gap-1 h-16">
            {d.trend.map((t, i) => (
              <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
                <div className="w-full bg-blue-500/70 rounded-t" style={{ height: `${Math.max(3, (t.val / d.trendMax) * 100)}%` }} title={fmt(t.val)} />
                <span className="text-[9px] text-slate-600 mt-1">{t.day}</span>
              </div>
            ))}
          </div>
          {d.discrepancies > 0 && <div className="mt-2 text-[11px] text-amber-400 font-bold">⚠️ {d.discrepancies} يوم فيه فروقات تتجاوز 5% هذا الشهر</div>}
        </div>
      </div>

      {/* أكثر الأصناف وارد / صادر (تحويلات الفروع) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-3">
        <ItemsCard
          title="أكثر الأصناف طلبًا — وارد (تحويلات واردة · الشهر)"
          rows={inItems}
          accent="bg-gradient-to-l from-emerald-500 to-teal-500"
          empty="لا توجد تحويلات واردة هذا الشهر"
        />
        <ItemsCard
          title="أكثر الأصناف — صادر (تحويلات صادرة · الشهر)"
          rows={outItems}
          accent="bg-gradient-to-l from-amber-500 to-orange-500"
          empty="لا توجد تحويلات صادرة هذا الشهر"
        />
      </div>
    </div>
  );
}
