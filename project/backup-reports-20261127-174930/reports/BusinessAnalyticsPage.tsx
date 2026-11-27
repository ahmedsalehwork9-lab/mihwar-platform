// =============================================================
// src/pages/reports/BusinessAnalyticsPage.tsx
// لوحة تحليلات الأعمال (Business Analytics) — للإدارة واتخاذ القرار.
// بيانات حقيقية من: فواتير المبيعات/المشتريات · قيود المصروفات · المخزون.
// لا بيانات تجريبية. تُعرض تحذيرات اكتمال عند نقص مصدر (مثل تكلفة البضاعة).
// =============================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DollarSign, TrendingUp, TrendingDown, ShoppingCart, Receipt, Package,
  Layers, Users, RefreshCw, BarChart3, Building2, Boxes,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../lib/supabase";
import * as DB from "../lib/accountingDb";
import type { Page } from "../../components/Layout";
import {
  money, fmtInt, growth, CARD, Loading, Warn, SectionCard, Kpi, BarsH, LineDual, Donut, DataTable,
} from "./reportingKit";

const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => new Date().toISOString().slice(0, 8) + "01";
const addDays = (d: string, n: number) => { const t = new Date(d + "T00:00:00"); t.setDate(t.getDate() + n); return t.toISOString().slice(0, 10); };
const daysBetween = (a: string, b: string) => Math.max(0, Math.round((+new Date(b) - +new Date(a)) / 86400000));
const notCancelled = (s: string | undefined) => (s || "") !== "cancelled" && (s || "") !== "void";
const EXP_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#a855f7", "#ef4444", "#06b6d4", "#64748b", "#ec4899"];

type Props = { onNavigate?: (p: Page) => void; onSection?: (s: string) => void };

type Agg = {
  salesNet: number; salesTotal: number; vat: number; tx: number;
  purchasesNet: number; purchasesTotal: number; cogs: number; expenses: number;
  monthly: { ym: string; sales: number; purchases: number }[];
  branchRows: { branch_id: number | null; sales: number; purchases: number }[];
  topProducts: { name: string; qty: number; net: number }[];
  expenseDist: { name: string; value: number }[];
  customers: { name: string; total: number }[];
  suppliers: { name: string; total: number }[];
  cogsCovered: boolean;
};

export default function BusinessAnalyticsPage({ onNavigate, onSection }: Props) {
  const { ownedShopId, branches } = (useAuth() as any) ?? {};
  const branchList: { id: number; name: string }[] = Array.isArray(branches) ? branches : [];
  const branchName = (id: number | null) => (id == null ? "—" : branchList.find((b) => b.id === id)?.name || ("فرع " + id));

  const [org, setOrg] = useState<{ id: number; name: string } | null>(null);
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [fBranch, setFBranch] = useState<string>(""); // "" = كل الفروع
  const [loading, setLoading] = useState(true);
  const [agg, setAgg] = useState<Agg | null>(null);
  const [prev, setPrev] = useState<{ salesTotal: number; purchasesTotal: number; expenses: number; grossProfit: number } | null>(null);
  const [inv, setInv] = useState<{ value: number; items: number; low: number; out: number }>({ value: 0, items: 0, low: 0, out: 0 });

  useEffect(() => {
    let alive = true;
    (async () => { const o = await DB.getOrgForBranch(ownedShopId ?? null); if (alive) setOrg(o); })();
    return () => { alive = false; };
  }, [ownedShopId]);

  const branchId = fBranch ? Number(fBranch) : null;
  const scopeShopIds = useMemo(() => (branchId ? [branchId] : branchList.map((b) => b.id)), [branchId, branchList]);

  // ── تجميع فترة ──
  const aggregate = useCallback(async (orgId: number, f: string, t: string, bId: number | null): Promise<Agg> => {
    const [sales, purchases, entries, accounts] = await Promise.all([
      DB.fetchSalesInvoices(orgId, f, t, bId),
      DB.fetchPurchaseInvoices(orgId, f, t, bId),
      DB.fetchEntries(orgId, f, t, bId),
      DB.fetchAccounts(orgId),
    ]);
    const accById = new Map(accounts.map((a) => [a.id, a] as const));

    let salesNet = 0, salesTotal = 0, vat = 0, tx = 0;
    const monthM: Record<string, { sales: number; purchases: number }> = {};
    const branchM: Record<string, { sales: number; purchases: number }> = {};
    const prodM: Record<string, { qty: number; net: number }> = {};
    const custM: Record<string, number> = {};
    const mk = (ym: string) => (monthM[ym] ||= { sales: 0, purchases: 0 });
    const bk = (k: string) => (branchM[k] ||= { sales: 0, purchases: 0 });

    for (const s of sales) {
      if (!notCancelled(s.status)) continue;
      salesNet += Number(s.subtotal) || 0; salesTotal += Number(s.total) || 0; vat += Number(s.tax_amount) || 0; tx++;
      mk((s.date || "").slice(0, 7)).sales += Number(s.total) || 0;
      bk(String(s.branch_id)).sales += Number(s.total) || 0;
      if (s.customer_name) custM[s.customer_name] = (custM[s.customer_name] || 0) + (Number(s.total) || 0);
      for (const it of s.items || []) {
        const n = it.description || "—";
        const p = (prodM[n] ||= { qty: 0, net: 0 });
        p.qty += Number(it.qty) || 0; p.net += Number(it.line_total) || 0;
      }
    }

    let purchasesNet = 0, purchasesTotal = 0;
    const suppM: Record<string, number> = {};
    for (const p of purchases) {
      if (!notCancelled(p.status)) continue;
      purchasesNet += Number(p.subtotal) || 0; purchasesTotal += Number(p.total) || 0;
      mk((p.date || "").slice(0, 7)).purchases += Number(p.total) || 0;
      bk(String(p.branch_id)).purchases += Number(p.total) || 0;
      if (p.supplier_name) suppM[p.supplier_name] = (suppM[p.supplier_name] || 0) + (Number(p.total) || 0);
    }

    // المصروفات من القيود المُرحّلة على حسابات نوعها «مصروف»
    let expenses = 0;
    const expDistM: Record<string, number> = {};
    for (const e of entries) {
      if ((e.status || "posted") !== "posted") continue;
      for (const l of e.lines || []) {
        const a = accById.get(l.account_id);
        if (a && a.type === "expense") {
          const v = (Number(l.debit) || 0) - (Number(l.credit) || 0);
          expenses += v;
          if (v !== 0) expDistM[a.name] = (expDistM[a.name] || 0) + v;
        }
      }
    }

    // تكلفة البضاعة المباعة من حركات المخزون (sale_out) — تُسجَّل من نقاط البيع
    let q = supabase.from("gl_stock_moves").select("qty, unit_cost").eq("organization_id", orgId)
      .eq("move_type", "sale_out").gte("created_at", f).lte("created_at", t + "T23:59:59");
    if (bId != null) q = q.eq("branch_id", bId);
    const { data: moves } = await q;
    let cogs = 0;
    for (const m of (moves || []) as any[]) cogs += Math.abs(Number(m.qty) || 0) * (Number(m.unit_cost) || 0);
    const cogsCovered = (moves || []).length > 0;

    return {
      salesNet, salesTotal, vat, tx, purchasesNet, purchasesTotal, cogs, expenses,
      monthly: Object.entries(monthM).sort((a, b) => a[0].localeCompare(b[0])).map(([ym, v]) => ({ ym, sales: v.sales, purchases: v.purchases })),
      branchRows: Object.entries(branchM).map(([k, v]) => ({ branch_id: k === "null" ? null : Number(k), sales: v.sales, purchases: v.purchases })).sort((a, b) => b.sales - a.sales),
      topProducts: Object.entries(prodM).map(([name, v]) => ({ name, qty: v.qty, net: v.net })).sort((a, b) => b.net - a.net).slice(0, 10),
      expenseDist: Object.entries(expDistM).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8),
      customers: Object.entries(custM).map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total).slice(0, 8),
      suppliers: Object.entries(suppM).map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total).slice(0, 8),
      cogsCovered,
    };
  }, []);

  const reload = useCallback(async () => {
    if (!org) return;
    setLoading(true);
    const main = await aggregate(org.id, from, to, branchId);
    // الفترة السابقة (نفس الطول)
    const len = Math.max(1, daysBetween(from, to) + 1);
    const prevTo = addDays(from, -1);
    const prevFrom = addDays(prevTo, -(len - 1));
    const pv = await aggregate(org.id, prevFrom, prevTo, branchId);
    // المخزون (لقطة حالية)
    let pv_inv = { value: 0, items: 0, low: 0, out: 0 };
    if (scopeShopIds.length) {
      const { data: prods } = await supabase.from("products").select("quantity, price, reorder_level, min_quantity, shop_id").in("shop_id", scopeShopIds);
      for (const p of (prods || []) as any[]) {
        const qn = Number(p.quantity) || 0, pr = Number(p.price) || 0;
        pv_inv.items++; pv_inv.value += qn * pr;
        const thr = p.reorder_level != null ? Number(p.reorder_level) : (p.min_quantity != null ? Number(p.min_quantity) : 0);
        if (qn <= 0) pv_inv.out++; else if (thr > 0 && qn <= thr) pv_inv.low++;
      }
    }
    setAgg(main);
    setPrev({ salesTotal: pv.salesTotal, purchasesTotal: pv.purchasesTotal, expenses: pv.expenses, grossProfit: pv.salesNet - pv.cogs });
    setInv(pv_inv);
    setLoading(false);
  }, [org, from, to, branchId, scopeShopIds, aggregate]);

  useEffect(() => { reload(); }, [reload]);

  const grossProfit = agg ? agg.salesNet - agg.cogs : 0;
  const netProfit = agg ? grossProfit - agg.expenses : 0;
  const grossMargin = agg && agg.salesNet ? (grossProfit / agg.salesNet) * 100 : 0;

  return (
    <div className="p-4 lg:p-6 min-h-screen" dir="rtl">
      {/* ترويسة + فلاتر */}
      <header className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <span className="w-11 h-11 rounded-2xl bg-purple-500/10 flex items-center justify-center text-purple-400"><BarChart3 size={22} /></span>
          <div>
            <h1 className="text-2xl font-black text-white leading-tight">لوحة تحليلات الأعمال</h1>
            <p className="text-slate-500 text-xs mt-0.5">مؤشرات الإدارة واتخاذ القرار — من بيانات المبيعات والمشتريات والحسابات والمخزون.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1"><label className="text-[10px] text-slate-500 font-bold">من</label><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="bg-slate-950 border border-slate-700 rounded-xl text-white px-3 py-2 text-sm [color-scheme:dark]" /></div>
          <div className="flex flex-col gap-1"><label className="text-[10px] text-slate-500 font-bold">إلى</label><input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="bg-slate-950 border border-slate-700 rounded-xl text-white px-3 py-2 text-sm [color-scheme:dark]" /></div>
          {branchList.length > 1 && (
            <div className="flex flex-col gap-1"><label className="text-[10px] text-slate-500 font-bold">الفرع</label>
              <select value={fBranch} onChange={(e) => setFBranch(e.target.value)} className="bg-slate-950 border border-slate-700 rounded-xl text-white px-3 py-2 text-sm"><option value="">كل الفروع</option>{branchList.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
          )}
          <button onClick={reload} className="p-2.5 rounded-xl border border-slate-800 bg-slate-900 text-slate-400 hover:text-white"><RefreshCw size={16} className={loading ? "animate-spin text-blue-500" : ""} /></button>
        </div>
      </header>

      {!org ? (
        <div className={`${CARD} p-10 text-center text-amber-400 text-sm`}>الفرع الحالي غير مرتبط بمؤسسة — اربطه بمؤسسة لتفعيل التحليلات.</div>
      ) : loading || !agg ? (
        <Loading label="جارٍ تجميع التحليلات…" />
      ) : (
        <div className="space-y-4">
          {!agg.cogsCovered && agg.salesNet > 0 && (
            <Warn>تكلفة البضاعة المباعة تُسجَّل حاليًا من نقاط البيع فقط، ولا توجد حركات تكلفة ضمن هذه الفترة — لذا <b>مجمل الربح وصافي الربح تقديريان</b> ولا يُعتمدان كأرقام نهائية.</Warn>
          )}

          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
            <Kpi label="إجمالي المبيعات" value={money(agg.salesTotal)} tone="emerald" icon={DollarSign} deltaPct={prev ? growth(agg.salesTotal, prev.salesTotal) : undefined} prev={prev ? money(prev.salesTotal) : undefined} onClick={() => onNavigate?.("sales-reconciliation")} />
            <Kpi label="صافي المبيعات (بدون ضريبة)" value={money(agg.salesNet)} tone="emerald" icon={TrendingUp} />
            <Kpi label="مجمل الربح" value={money(grossProfit)} tone="blue" icon={BarChart3} deltaPct={prev ? growth(grossProfit, prev.grossProfit) : undefined} hint={!agg.cogsCovered ? "تقديري" : undefined} />
            <Kpi label="هامش مجمل الربح" value={`${Math.round(grossMargin * 10) / 10}%`} tone="purple" icon={Layers} hint={!agg.cogsCovered ? "تقديري" : undefined} />
            <Kpi label="إجمالي المشتريات" value={money(agg.purchasesTotal)} tone="sky" icon={ShoppingCart} deltaPct={prev ? growth(agg.purchasesTotal, prev.purchasesTotal) : undefined} prev={prev ? money(prev.purchasesTotal) : undefined} onClick={() => onNavigate?.("purchase-invoices")} />
            <Kpi label="إجمالي المصروفات" value={money(agg.expenses)} tone="amber" icon={Receipt} deltaPct={prev ? growth(agg.expenses, prev.expenses) : undefined} prev={prev ? money(prev.expenses) : undefined} onClick={() => onNavigate?.("fixed-expenses")} />
            <Kpi label="صافي الربح (تقديري)" value={money(netProfit)} tone={netProfit >= 0 ? "emerald" : "red"} icon={netProfit >= 0 ? TrendingUp : TrendingDown} hint="مجمل الربح − المصروفات" />
            <Kpi label="عدد العمليات" value={fmtInt(agg.tx)} tone="slate" icon={Receipt} />
          </div>

          {/* اتجاه المبيعات/المشتريات + توزيع المصروفات */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="lg:col-span-2">
              <SectionCard title="اتجاه المبيعات والمشتريات (شهريًا)" icon={TrendingUp}>
                <LineDual labels={agg.monthly.map((m) => m.ym.slice(5))} a={agg.monthly.map((m) => m.sales)} b={agg.monthly.map((m) => m.purchases)} aName="المبيعات" bName="المشتريات" aColor="#10b981" bColor="#3b82f6" />
              </SectionCard>
            </div>
            <SectionCard title="توزيع المصروفات" icon={Layers}>
              <Donut data={agg.expenseDist.map((e, i) => ({ label: e.name, value: e.value, color: EXP_COLORS[i % EXP_COLORS.length] }))} />
            </SectionCard>
          </div>

          {/* أداء الفروع + صحة المخزون */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="lg:col-span-2">
              <SectionCard title="أداء الفروع" icon={Building2} pad={false}>
                <DataTable
                  onRow={() => onNavigate?.("sales-reconciliation")}
                  cols={[
                    { k: "name", label: "الفرع" },
                    { k: "sales", label: "المبيعات", align: "l", fmt: (v) => money(v) },
                    { k: "purchases", label: "المشتريات", align: "l", fmt: (v) => money(v) },
                    { k: "net", label: "الصافي (مبيعات − مشتريات)", align: "l", fmt: (v) => <span className={v >= 0 ? "text-emerald-400" : "text-red-400"}>{money(v)}</span> },
                  ]}
                  rows={agg.branchRows.map((b) => ({ name: branchName(b.branch_id), sales: b.sales, purchases: b.purchases, net: b.sales - b.purchases }))}
                />
              </SectionCard>
            </div>
            <SectionCard title="صحة المخزون" icon={Package}>
              <div className="grid grid-cols-2 gap-2.5">
                <div className={`${CARD} p-3`}><div className="text-[10px] text-slate-500 font-bold">قيمة المخزون</div><div className="text-lg font-black text-emerald-400 [direction:ltr] mt-1">{money(inv.value)}</div></div>
                <div className={`${CARD} p-3`}><div className="text-[10px] text-slate-500 font-bold">إجمالي الأصناف</div><div className="text-lg font-black text-blue-400 mt-1">{fmtInt(inv.items)}</div></div>
                <div className={`${CARD} p-3`}><div className="text-[10px] text-slate-500 font-bold">منخفض المخزون</div><div className="text-lg font-black text-amber-400 mt-1">{fmtInt(inv.low)}</div></div>
                <div className={`${CARD} p-3`}><div className="text-[10px] text-slate-500 font-bold">نافد</div><div className="text-lg font-black text-red-400 mt-1">{fmtInt(inv.out)}</div></div>
              </div>
              <button onClick={() => onNavigate?.("inventory")} className="w-full mt-3 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800/60 border border-slate-700 text-slate-300 text-xs font-bold hover:text-white"><Boxes size={14} /> فتح المخزون</button>
            </SectionCard>
          </div>

          {/* أعلى المنتجات + العملاء + الموردون */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <SectionCard title="أعلى المنتجات مبيعًا" icon={Package} pad={false}>
              <DataTable cols={[{ k: "name", label: "المنتج" }, { k: "qty", label: "الكمية", align: "c", fmt: (v) => fmtInt(v) }, { k: "net", label: "المبيعات", align: "l", fmt: (v) => money(v) }]} rows={agg.topProducts} maxH={320} />
            </SectionCard>
            <SectionCard title="أعلى العملاء" icon={Users} pad={false}>
              <DataTable cols={[{ k: "name", label: "العميل" }, { k: "total", label: "المبيعات", align: "l", fmt: (v) => money(v) }]} rows={agg.customers} maxH={320} />
            </SectionCard>
            <SectionCard title="أعلى الموردين" icon={Users} pad={false}>
              <DataTable cols={[{ k: "name", label: "المورد" }, { k: "total", label: "المشتريات", align: "l", fmt: (v) => money(v) }]} rows={agg.suppliers} maxH={320} />
            </SectionCard>
          </div>

          <p className="text-[11px] text-slate-600 text-center pt-1">المبيعات = قيمة الفواتير (ليست التحصيل). المصروفات من القيود المُرحّلة على حسابات المصروفات. المخزون لقطة حالية بطريقة المتوسط المرجّح.</p>
        </div>
      )}
    </div>
  );
}
