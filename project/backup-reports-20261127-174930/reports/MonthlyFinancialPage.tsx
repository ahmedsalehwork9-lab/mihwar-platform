// =============================================================
// src/pages/reports/MonthlyFinancialPage.tsx
// التقرير المالي الشهري (محاسبي) — من القيود المُرحّلة فقط (المصدر المعتمد).
// قائمة دخل بمقارنة فترة + تفاصيل حسابات + رسوم + مقارنة فروع + طباعة.
// الإيراد = دائن − مدين (حسابات الإيراد) · المصروف = مدين − دائن (حسابات المصروف).
// لا بيانات تجريبية. لا تلفيق لربط الحسابات: تصنيف تكلفة البضاعة تقديري بالاسم ومُعلَّم.
// =============================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FileBarChart, RefreshCw, Printer, TrendingUp, TrendingDown, Layers,
  Building2, ChevronDown, ChevronLeft, ExternalLink, DollarSign, Receipt,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import * as DB from "../lib/accountingDb";
import type { Page } from "../../components/Layout";
import { money, growth, pctLabel, CARD, Loading, Warn, SectionCard, Kpi, LineDual, Donut, DataTable } from "./reportingKit";
import { BRAND } from "./brand";

type Props = { onNavigate?: (p: Page) => void };

const MONTHS_AR = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const monthLabel = (ym: string) => { const [y, m] = ym.split("-").map(Number); return `${MONTHS_AR[m - 1]} ${y}`; };
const monthRange = (ym: string) => { const [y, m] = ym.split("-").map(Number); const last = new Date(y, m, 0).getDate(); return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, "0")}` }; };
const prevYm = (ym: string) => { const [y, m] = ym.split("-").map(Number); const d = new Date(y, m - 2, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const shiftYm = (ym: string, n: number) => { const [y, m] = ym.split("-").map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const isCogsAcc = (a: any) => /تكلفة|cost of goods|cogs|c\.o\.g/i.test(`${a?.name || ""} ${a?.name_en || ""}`);
const EXP_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#a855f7", "#ef4444", "#06b6d4", "#64748b", "#ec4899"];

type AcctAmt = { id: number; name: string; code: string; amt: number; isCogs?: boolean };
type Pnl = {
  netRevenue: number; cogs: number; grossProfit: number; opEx: number; netProfit: number;
  revAccts: AcctAmt[]; cogsAccts: AcctAmt[]; opexAccts: AcctAmt[]; cogsMapped: boolean; postedCount: number;
};

export default function MonthlyFinancialPage({ onNavigate }: Props) {
  const { ownedShopId, branches } = (useAuth() as any) ?? {};
  const branchList: { id: number; name: string }[] = Array.isArray(branches) ? branches : [];
  const branchName = (id: number | null) => (id == null ? "عام" : branchList.find((b) => b.id === id)?.name || ("فرع " + id));

  const [org, setOrg] = useState<{ id: number; name: string } | null>(null);
  const [ym, setYm] = useState(new Date().toISOString().slice(0, 7));
  const [fBranch, setFBranch] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [cur, setCur] = useState<Pnl | null>(null);
  const [prev, setPrev] = useState<Pnl | null>(null);
  const [trend, setTrend] = useState<{ ym: string; revenue: number; expense: number }[]>([]);
  const [branchRows, setBranchRows] = useState<{ branch_id: number | null; revenue: number; expense: number }[]>([]);
  const [open, setOpen] = useState<Record<string, boolean>>({ rev: false, cogs: false, opex: true });

  useEffect(() => { let al = true; (async () => { const o = await DB.getOrgForBranch(ownedShopId ?? null); if (al) setOrg(o); })(); return () => { al = false; }; }, [ownedShopId]);
  const branchId = fBranch ? Number(fBranch) : null;

  const computePnl = useCallback((entries: DB.EntryWithLines[], accById: Map<number, any>, from: string, to: string): Pnl => {
    const revM: Record<number, AcctAmt> = {}, cogsM: Record<number, AcctAmt> = {}, opexM: Record<number, AcctAmt> = {};
    let postedCount = 0, cogsMapped = false;
    for (const e of entries) {
      if ((e.status || "posted") !== "posted") continue;
      const d = e.date || "";
      if (d < from || d > to) continue;
      postedCount++;
      for (const l of e.lines || []) {
        const a = accById.get(l.account_id); if (!a) continue;
        const debit = Number(l.debit) || 0, credit = Number(l.credit) || 0;
        if (a.type === "revenue") {
          const v = credit - debit;
          (revM[a.id] ||= { id: a.id, name: a.name, code: a.code, amt: 0 }).amt += v;
        } else if (a.type === "expense") {
          const v = debit - credit;
          if (isCogsAcc(a)) { cogsMapped = true; (cogsM[a.id] ||= { id: a.id, name: a.name, code: a.code, amt: 0, isCogs: true }).amt += v; }
          else (opexM[a.id] ||= { id: a.id, name: a.name, code: a.code, amt: 0 }).amt += v;
        }
      }
    }
    const revAccts = Object.values(revM).sort((a, b) => b.amt - a.amt);
    const cogsAccts = Object.values(cogsM).sort((a, b) => b.amt - a.amt);
    const opexAccts = Object.values(opexM).sort((a, b) => b.amt - a.amt);
    const netRevenue = revAccts.reduce((s, a) => s + a.amt, 0);
    const cogs = cogsAccts.reduce((s, a) => s + a.amt, 0);
    const opEx = opexAccts.reduce((s, a) => s + a.amt, 0);
    const grossProfit = netRevenue - cogs;
    const netProfit = grossProfit - opEx;
    return { netRevenue, cogs, grossProfit, opEx, netProfit, revAccts, cogsAccts, opexAccts, cogsMapped, postedCount };
  }, []);

  const reload = useCallback(async () => {
    if (!org) return;
    setLoading(true);
    const trendFromYm = shiftYm(ym, -5);
    const wideFrom = monthRange(trendFromYm).from;
    const curR = monthRange(ym);
    const [entries, accounts] = await Promise.all([
      DB.fetchEntries(org.id, wideFrom, curR.to, branchId),
      DB.fetchAccounts(org.id),
    ]);
    const accById = new Map(accounts.map((a) => [a.id, a] as const));

    const curPnl = computePnl(entries, accById, curR.from, curR.to);
    const pr = monthRange(prevYm(ym));
    const prevPnl = computePnl(entries, accById, pr.from, pr.to);

    // اتجاه 6 أشهر
    const tr: { ym: string; revenue: number; expense: number }[] = [];
    for (let i = 5; i >= 0; i--) { const mm = shiftYm(ym, -i); const r = monthRange(mm); const p = computePnl(entries, accById, r.from, r.to); tr.push({ ym: mm, revenue: p.netRevenue, expense: p.cogs + p.opEx }); }

    // مقارنة الفروع (الشهر الحالي) — تجميع حسب فرع القيد
    const bm: Record<string, { revenue: number; expense: number }> = {};
    for (const e of entries) {
      if ((e.status || "posted") !== "posted") continue;
      const d = e.date || ""; if (d < curR.from || d > curR.to) continue;
      for (const l of e.lines || []) {
        const a = accById.get(l.account_id); if (!a) continue;
        const bId = String((l as any).branch_id ?? e.branch_id ?? "null");
        const slot = (bm[bId] ||= { revenue: 0, expense: 0 });
        if (a.type === "revenue") slot.revenue += (Number(l.credit) || 0) - (Number(l.debit) || 0);
        else if (a.type === "expense") slot.expense += (Number(l.debit) || 0) - (Number(l.credit) || 0);
      }
    }
    setCur(curPnl); setPrev(prevPnl); setTrend(tr);
    setBranchRows(Object.entries(bm).map(([k, v]) => ({ branch_id: k === "null" ? null : Number(k), revenue: v.revenue, expense: v.expense })).sort((a, b) => b.revenue - a.revenue));
    setLoading(false);
  }, [org, ym, branchId, computePnl]);

  useEffect(() => { reload(); }, [reload]);

  const pctOf = (v: number) => (cur && cur.netRevenue ? `${Math.round((v / cur.netRevenue) * 1000) / 10}%` : "—");
  const varc = (c: number, p: number) => (p === 0 ? (c === 0 ? 0 : 100) : ((c - p) / Math.abs(p)) * 100);
  const grossMargin = cur && cur.netRevenue ? (cur.grossProfit / cur.netRevenue) * 100 : 0;
  const netMargin = cur && cur.netRevenue ? (cur.netProfit / cur.netRevenue) * 100 : 0;

  const printReport = () => {
    if (!cur) return;
    const row = (label: string, amt: number, bold = false) => `<tr style="${bold ? "font-weight:800;background:#f1f5f9" : ""}"><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0">${label}</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:left;direction:ltr">${money(amt)}</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:left">${pctOf(amt)}</td></tr>`;
    const html = `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>التقرير المالي — ${monthLabel(ym)}</title>
      <style>body{font-family:'Segoe UI',Tahoma,sans-serif;color:#0f172a;padding:24px}h1{font-size:20px;margin:0}table{width:100%;border-collapse:collapse;margin-top:12px;font-size:13px}th{background:#0f172a;color:#fff;padding:8px 10px;text-align:right}@media print{button{display:none}}</style></head>
      <body><div style="display:flex;justify-content:space-between;align-items:center">
        <div><h1>${BRAND.productName} — التقرير المالي الشهري</h1><div style="color:#64748b;font-size:13px">${monthLabel(ym)} · ${branchName(branchId)}</div></div>
        <button onclick="window.print()" style="padding:8px 16px;border:0;background:#2563eb;color:#fff;border-radius:8px;cursor:pointer">طباعة / PDF</button>
      </div>
      <table><thead><tr><th>البند</th><th style="text-align:left">المبلغ</th><th style="text-align:left">% من صافي الإيراد</th></tr></thead><tbody>
      ${row("صافي الإيراد", cur.netRevenue, true)}
      ${row("تكلفة البضاعة المباعة", cur.cogs)}
      ${row("مجمل الربح", cur.grossProfit, true)}
      ${row("المصروفات التشغيلية", cur.opEx)}
      ${row("صافي الربح", cur.netProfit, true)}
      </tbody></table>
      <p style="color:#94a3b8;font-size:11px;margin-top:16px">المصدر: القيود المُرحّلة فقط${cur.cogsMapped ? "" : " — تكلفة البضاعة غير مُصنّفة بحساب مستقل، لذا عُرضت كل المصروفات كتشغيلية."}</p>
      </body></html>`;
    const w = window.open("", "_blank"); if (w) { w.document.write(html); w.document.close(); }
  };

  const Expand = ({ k, label, amt, accts, tone }: { k: string; label: string; amt: number; accts: AcctAmt[]; tone?: string }) => (
    <>
      <tr onClick={() => accts.length && setOpen((o) => ({ ...o, [k]: !o[k] }))} className={`${accts.length ? "cursor-pointer hover:bg-slate-800/30" : ""}`}>
        <td className="px-3 py-2.5 font-bold text-slate-200">{accts.length ? (open[k] ? <ChevronDown size={13} className="inline ml-1 text-slate-500" /> : <ChevronLeft size={13} className="inline ml-1 text-slate-500" />) : null}{label}</td>
        <td className={`px-3 py-2.5 text-left font-mono font-bold [direction:ltr] ${tone || "text-slate-200"}`}>{money(amt)}</td>
        <td className="px-3 py-2.5 text-left text-slate-500">{pctOf(amt)}</td>
        <td className="px-3 py-2.5 text-left font-mono text-slate-500 [direction:ltr]">{prev ? money(k === "rev" ? prev.netRevenue : k === "cogs" ? prev.cogs : prev.opEx) : "—"}</td>
        <td className="px-3 py-2.5 text-left">{prev && (() => { const pv = k === "rev" ? prev.netRevenue : k === "cogs" ? prev.cogs : prev.opEx; const g = varc(amt, pv); return <span className={`text-[11px] font-bold ${g >= 0 ? "text-emerald-400" : "text-red-400"}`}>{pctLabel(g)}</span>; })()}</td>
      </tr>
      {open[k] && accts.map((a) => (
        <tr key={a.id} className="bg-slate-950/30 text-[11px]">
          <td className="px-3 py-1.5 text-slate-400 pr-8"><span className="font-mono text-slate-600 [direction:ltr]">{a.code}</span> {a.name}</td>
          <td className="px-3 py-1.5 text-left font-mono text-slate-400 [direction:ltr]">{money(a.amt)}</td>
          <td className="px-3 py-1.5 text-left text-slate-600">{pctOf(a.amt)}</td>
          <td colSpan={2} />
        </tr>
      ))}
    </>
  );

  return (
    <div className="p-4 lg:p-6 min-h-screen" dir="rtl">
      <header className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <span className="w-11 h-11 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-400"><FileBarChart size={22} /></span>
          <div>
            <h1 className="text-2xl font-black text-white leading-tight">التقرير المالي الشهري</h1>
            <p className="text-slate-500 text-xs mt-0.5">قائمة الدخل من القيود المُرحّلة — {monthLabel(ym)} · {branchName(branchId)}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1"><label className="text-[10px] text-slate-500 font-bold">الشهر</label><input type="month" value={ym} onChange={(e) => setYm(e.target.value)} className="bg-slate-950 border border-slate-700 rounded-xl text-white px-3 py-2 text-sm [color-scheme:dark]" /></div>
          {branchList.length > 1 && (
            <div className="flex flex-col gap-1"><label className="text-[10px] text-slate-500 font-bold">الفرع</label><select value={fBranch} onChange={(e) => setFBranch(e.target.value)} className="bg-slate-950 border border-slate-700 rounded-xl text-white px-3 py-2 text-sm"><option value="">كل الفروع</option>{branchList.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
          )}
          <button onClick={printReport} className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-slate-800 bg-slate-900 text-slate-300 hover:text-white text-xs font-bold"><Printer size={15} /> طباعة / PDF</button>
          <button onClick={reload} className="p-2.5 rounded-xl border border-slate-800 bg-slate-900 text-slate-400 hover:text-white"><RefreshCw size={16} className={loading ? "animate-spin text-blue-500" : ""} /></button>
        </div>
      </header>

      {!org ? (
        <div className={`${CARD} p-10 text-center text-amber-400 text-sm`}>الفرع الحالي غير مرتبط بمؤسسة.</div>
      ) : loading || !cur ? (
        <Loading label="جارٍ تجميع القائمة المالية…" />
      ) : (
        <div className="space-y-4">
          {cur.postedCount === 0 && <Warn>لا توجد قيود مُرحّلة في {monthLabel(ym)} — الأرقام صفرية.</Warn>}
          {!cur.cogsMapped && cur.netRevenue > 0 && <Warn>لا يوجد حساب مستقل باسم «تكلفة البضاعة» ضمن دليل الحسابات، لذا <b>عُرضت كل المصروفات كمصروفات تشغيلية</b> ومجمل الربح = صافي الإيراد. لفصل تكلفة البضاعة أضِف حسابًا باسمها وربطه بترحيل المبيعات.</Warn>}

          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
            <Kpi label="صافي الإيراد" value={money(cur.netRevenue)} tone="emerald" icon={DollarSign} deltaPct={prev ? growth(cur.netRevenue, prev.netRevenue) : undefined} prev={prev ? money(prev.netRevenue) : undefined} />
            <Kpi label="تكلفة البضاعة" value={money(cur.cogs)} tone="amber" icon={Receipt} hint={!cur.cogsMapped ? "غير مُصنّفة" : undefined} />
            <Kpi label="مجمل الربح" value={money(cur.grossProfit)} tone="blue" icon={TrendingUp} deltaPct={prev ? growth(cur.grossProfit, prev.grossProfit) : undefined} />
            <Kpi label="المصروفات التشغيلية" value={money(cur.opEx)} tone="amber" icon={Receipt} deltaPct={prev ? growth(cur.opEx, prev.opEx) : undefined} />
            <Kpi label="صافي الربح" value={money(cur.netProfit)} tone={cur.netProfit >= 0 ? "emerald" : "red"} icon={cur.netProfit >= 0 ? TrendingUp : TrendingDown} deltaPct={prev ? growth(cur.netProfit, prev.netProfit) : undefined} prev={prev ? money(prev.netProfit) : undefined} />
            <Kpi label="هامش مجمل الربح" value={`${Math.round(grossMargin * 10) / 10}%`} tone="purple" icon={Layers} />
            <Kpi label="هامش صافي الربح" value={`${Math.round(netMargin * 10) / 10}%`} tone="purple" icon={Layers} />
            <Kpi label="قيود مُرحّلة" value={String(cur.postedCount)} tone="slate" icon={FileBarChart} />
          </div>

          {/* قائمة الدخل */}
          <SectionCard title={`قائمة الدخل — ${monthLabel(ym)}`} icon={FileBarChart} pad={false}
            extra={<span className={`text-[11px] font-bold ${cur.netProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>{cur.netProfit >= 0 ? "ربح" : "خسارة"}: {money(cur.netProfit)}</span>}>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs border-collapse" style={{ minWidth: 640 }}>
                <thead><tr className="bg-slate-950/40 border-b border-slate-800 text-[10px] text-slate-500">
                  <th className="px-3 py-2.5 font-bold">البند</th><th className="px-3 py-2.5 font-bold text-left">المبلغ</th><th className="px-3 py-2.5 font-bold text-left">% من الإيراد</th><th className="px-3 py-2.5 font-bold text-left">الفترة السابقة</th><th className="px-3 py-2.5 font-bold text-left">التغيّر</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-800/60">
                  <Expand k="rev" label="صافي الإيراد" amt={cur.netRevenue} accts={cur.revAccts} tone="text-emerald-400" />
                  <Expand k="cogs" label="تكلفة البضاعة المباعة" amt={cur.cogs} accts={cur.cogsAccts} tone="text-amber-300" />
                  <tr className="bg-slate-950/40 font-bold"><td className="px-3 py-2.5 text-blue-300">مجمل الربح</td><td className="px-3 py-2.5 text-left font-mono text-blue-300 [direction:ltr]">{money(cur.grossProfit)}</td><td className="px-3 py-2.5 text-left text-slate-500">{pctOf(cur.grossProfit)}</td><td className="px-3 py-2.5 text-left font-mono text-slate-500 [direction:ltr]">{prev ? money(prev.grossProfit) : "—"}</td><td className="px-3 py-2.5 text-left">{prev && <span className={`text-[11px] font-bold ${varc(cur.grossProfit, prev.grossProfit) >= 0 ? "text-emerald-400" : "text-red-400"}`}>{pctLabel(varc(cur.grossProfit, prev.grossProfit))}</span>}</td></tr>
                  <Expand k="opex" label="المصروفات التشغيلية" amt={cur.opEx} accts={cur.opexAccts} tone="text-amber-300" />
                  <tr className="bg-slate-900 font-black border-t-2 border-slate-700"><td className="px-3 py-3 text-white">صافي الربح</td><td className={`px-3 py-3 text-left font-mono [direction:ltr] ${cur.netProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>{money(cur.netProfit)}</td><td className="px-3 py-3 text-left text-slate-400">{pctOf(cur.netProfit)}</td><td className="px-3 py-3 text-left font-mono text-slate-500 [direction:ltr]">{prev ? money(prev.netProfit) : "—"}</td><td className="px-3 py-3 text-left">{prev && <span className={`text-[11px] font-bold ${varc(cur.netProfit, prev.netProfit) >= 0 ? "text-emerald-400" : "text-red-400"}`}>{pctLabel(varc(cur.netProfit, prev.netProfit))}</span>}</td></tr>
                </tbody>
              </table>
            </div>
          </SectionCard>

          {/* رسوم */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="lg:col-span-2">
              <SectionCard title="الإيراد مقابل المصروفات (6 أشهر)" icon={TrendingUp}>
                <LineDual labels={trend.map((t) => monthLabel(t.ym).split(" ")[0].slice(0, 4))} a={trend.map((t) => t.revenue)} b={trend.map((t) => t.expense)} aName="الإيراد" bName="المصروفات" aColor="#10b981" bColor="#ef4444" />
              </SectionCard>
            </div>
            <SectionCard title="توزيع المصروفات" icon={Layers}>
              <Donut data={[...cur.cogsAccts, ...cur.opexAccts].sort((a, b) => b.amt - a.amt).slice(0, 8).map((a, i) => ({ label: a.name, value: a.amt, color: EXP_COLORS[i % EXP_COLORS.length] }))} />
            </SectionCard>
          </div>

          {/* مقارنة الفروع */}
          {branchList.length > 1 && (
            <SectionCard title="مقارنة الفروع" icon={Building2} pad={false}>
              <DataTable
                cols={[
                  { k: "name", label: "الفرع" },
                  { k: "revenue", label: "الإيراد", align: "l", fmt: (v) => money(v) },
                  { k: "expense", label: "المصروفات", align: "l", fmt: (v) => money(v) },
                  { k: "net", label: "صافي الربح", align: "l", fmt: (v) => <span className={v >= 0 ? "text-emerald-400" : "text-red-400"}>{money(v)}</span> },
                  { k: "margin", label: "الهامش", align: "l", fmt: (v) => `${Math.round(v * 10) / 10}%` },
                ]}
                rows={branchRows.map((b) => ({ name: branchName(b.branch_id), revenue: b.revenue, expense: b.expense, net: b.revenue - b.expense, margin: b.revenue ? ((b.revenue - b.expense) / b.revenue) * 100 : 0 }))}
              />
            </SectionCard>
          )}

          <button onClick={() => onNavigate?.("sales-reconciliation")} className={`${CARD} w-full p-3 flex items-center justify-between hover:border-blue-500/40 transition-all`}>
            <span className="flex items-center gap-2 text-sm font-bold text-slate-200"><ExternalLink size={15} className="text-blue-400" /> مطابقة قنوات التوصيل (التحصيل مقابل المبيعات)</span>
            <ChevronLeft size={16} className="text-slate-500" />
          </button>
          <p className="text-[11px] text-slate-600 text-center">المصدر المعتمد: القيود المُرحّلة فقط (المسودة مستبعدة). الإيراد = رصيد حسابات الإيراد، المصروفات = رصيد حسابات المصروفات، خلال الشهر المحدد.</p>
        </div>
      )}
    </div>
  );
}
