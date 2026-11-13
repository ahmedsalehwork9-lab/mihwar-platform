// =============================================================
// src/pages/ReportsHubPage.tsx
// مركز التقارير — اختر الفترة + الفروع المشمولة، وصدّر تقرير مباشر
// (فرع واحد = تقرير كامل · عدة فروع = تقرير مجمّع بصف لكل فرع).
// =============================================================

import { useEffect, useMemo, useState } from "react";
import { Page } from "../components/Layout";
import { useAuth } from "../context/AuthContext";
import { EXPORTERS, exportConsolidated, ExportMode, BranchRef } from "./lib/cafeExports";

type Props = { setPage: (p: Page) => void };

const CARDS: { id: Page; title: string; desc: string; emoji: string; accent: string }[] = [
  { id: "sales-reconciliation", title: "تقرير تسوية المبيعات", desc: "مطابقة السيستم بالتحصيل الفعلي + الضريبة ونِسَب القنوات", emoji: "📊", accent: "from-blue-600/20 border-blue-500/30" },
  { id: "purchases", title: "تقرير المشتريات", desc: "فواتير الشراء + تنبيه تغيّر الأسعار + نِسَب التصنيفات", emoji: "🧾", accent: "from-emerald-600/20 border-emerald-500/30" },
  { id: "fixed-expenses", title: "المصروفات الثابتة ونقطة التعادل", desc: "الرواتب والمصروفات + حساب التعادل والمستهدف", emoji: "🏦", accent: "from-amber-600/20 border-amber-500/30" },
  { id: "financial-report", title: "التقرير المالي الشهري", desc: "قائمة ربح وخسارة + مقارنة شهرين + نقطة التعادل", emoji: "📑", accent: "from-purple-600/20 border-purple-500/30" },
];

function monthBounds(ym: string): { from: string; to: string } {
  const [y, m] = ym.split("-").map(Number);
  const from = `${ym}-01`;
  const last = new Date(y, m, 0).getDate();
  const to = `${ym}-${String(last).padStart(2, "0")}`;
  return { from, to };
}

export default function ReportsHubPage({ setPage }: Props) {
  const { permissions, ownedShopId, branches } = (useAuth() as any) ?? {};
  const allowed = (id: Page) => !permissions || permissions.includes(id);
  const cards = CARDS.filter((c) => allowed(c.id));

  const allBranches: BranchRef[] = Array.isArray(branches) ? branches : [];
  const multiBranch = allBranches.length > 1;

  const thisMonth = new Date().toISOString().slice(0, 7);
  const [month, setMonth] = useState(thisMonth);
  const [custom, setCustom] = useState(false);
  const b = useMemo(() => monthBounds(month), [month]);
  const [from, setFrom] = useState(b.from);
  const [to, setTo] = useState(b.to);
  const onMonth = (ym: string) => { setMonth(ym); const nb = monthBounds(ym); setFrom(nb.from); setTo(nb.to); };

  // اختيار الفروع — افتراضيًا كلها
  const [selected, setSelected] = useState<Set<number>>(new Set());
  useEffect(() => { setSelected(new Set(allBranches.map((x) => x.id))); /* eslint-disable-next-line */ }, [branches]);
  const toggle = (id: number) => setSelected((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selectAll = () => setSelected(new Set(allBranches.map((x) => x.id)));
  const clearAll = () => setSelected(new Set());

  const [busy, setBusy] = useState<string>("");
  const [msg, setMsg] = useState<{ t: "ok" | "err"; x: string } | null>(null);

  const rangeFrom = custom ? from : b.from;
  const rangeTo = custom ? to : b.to;

  const chosen: BranchRef[] = useMemo(
    () => (multiBranch ? allBranches.filter((x) => selected.has(x.id)) : allBranches),
    [multiBranch, allBranches, selected],
  );

  const run = async (id: Page, mode: ExportMode) => {
    const fn = EXPORTERS[id as string];
    if (!fn) { setPage(id); return; }
    const key = `${id}-${mode}`;
    setBusy(key); setMsg(null);
    try {
      // فرع واحد → تقرير كامل · عدة فروع → مجمّع
      const picks = chosen.length ? chosen : (ownedShopId ? [{ id: ownedShopId, name: "" }] : []);
      let res;
      if (picks.length === 0) res = { ok: false, rows: 0, msg: "اختر فرعًا واحدًا على الأقل." };
      else if (picks.length === 1) res = await fn(picks[0].id, rangeFrom, rangeTo, mode);
      else res = await exportConsolidated(id as string, picks, rangeFrom, rangeTo, mode);

      if (!res.ok) setMsg({ t: "err", x: res.msg || "تعذّر إنشاء التقرير." });
      else setMsg({ t: "ok", x: picks.length > 1
        ? `تم إنشاء تقرير مجمّع لـ ${res.rows} فرع للفترة ${rangeFrom} → ${rangeTo}.`
        : `تم إنشاء التقرير (${res.rows} سجل) للفترة ${rangeFrom} → ${rangeTo}.` });
    } catch (e: any) {
      setMsg({ t: "err", x: "حصل خطأ أثناء التصدير: " + (e?.message || e) });
    } finally { setBusy(""); }
  };

  return (
    <div className="p-4 lg:p-6 min-h-screen" dir="rtl">
      <div className="mb-5">
        <h1 className="text-2xl font-black text-white flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-xl">🗂️</span>
          مركز التقارير
        </h1>
        <p className="text-slate-500 text-sm mt-1">اختر الفترة والفروع ثم صدّر أي تقرير PDF/Excel مباشرة — أو افتح الصفحة الكاملة.</p>
      </div>

      {/* شريط الفترة */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 mb-4 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-slate-500 font-bold">الشهر</label>
          <input type="month" value={month} onChange={(e) => onMonth(e.target.value)} disabled={custom}
            className="bg-slate-950 border border-slate-700 rounded-xl text-white px-3 py-2 text-sm [color-scheme:dark] disabled:opacity-40" />
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-400 font-bold cursor-pointer select-none pb-2.5">
          <input type="checkbox" checked={custom} onChange={(e) => setCustom(e.target.checked)} className="accent-blue-500 w-4 h-4" />
          نطاق مخصّص
        </label>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-slate-500 font-bold">من</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} disabled={!custom}
            className="bg-slate-950 border border-slate-700 rounded-xl text-white px-3 py-2 text-sm [color-scheme:dark] disabled:opacity-40" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-slate-500 font-bold">إلى</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} disabled={!custom}
            className="bg-slate-950 border border-slate-700 rounded-xl text-white px-3 py-2 text-sm [color-scheme:dark] disabled:opacity-40" />
        </div>
        <div className="mr-auto text-[11px] text-slate-500 pb-2.5">
          الفترة: <b className="text-slate-300 [direction:ltr] inline-block">{rangeFrom} → {rangeTo}</b>
        </div>
      </div>

      {/* اختيار الفروع — يظهر فقط لو عندك أكتر من فرع */}
      {multiBranch && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 mb-4">
          <div className="flex items-center justify-between mb-2.5">
            <div className="text-sm font-bold text-white flex items-center gap-2">
              🏪 الفروع المشمولة
              <span className="text-[11px] text-slate-500 font-normal">({selected.size} من {allBranches.length})</span>
            </div>
            <div className="flex gap-2">
              <button onClick={selectAll} className="text-[11px] font-bold text-blue-300 bg-blue-600/10 border border-blue-500/20 rounded-lg px-2.5 py-1">تحديد الكل</button>
              <button onClick={clearAll} className="text-[11px] font-bold text-slate-400 bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1">إلغاء الكل</button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {allBranches.map((br) => {
              const on = selected.has(br.id);
              return (
                <button key={br.id} onClick={() => toggle(br.id)}
                  className={`text-xs font-bold rounded-xl px-3 py-1.5 border transition-all ${on ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300" : "bg-slate-800/60 border-slate-700 text-slate-400"}`}>
                  {on ? "✓ " : ""}{br.name}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-slate-500 mt-2.5">فرع واحد مختار → تقرير كامل بالتفاصيل · أكتر من فرع → تقرير مجمّع بصف لكل فرع وإجمالي عام.</p>
        </div>
      )}

      {msg && (
        <div className={`mb-4 rounded-xl px-4 py-2.5 text-sm font-bold border ${msg.t === "ok" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300" : "bg-amber-500/10 border-amber-500/20 text-amber-300"}`}>
          {msg.t === "ok" ? "✓ " : "⚠️ "}{msg.x}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {cards.map((c) => {
          const hasExport = !!EXPORTERS[c.id as string];
          const bPdf = busy === `${c.id}-pdf`, bXls = busy === `${c.id}-excel`;
          return (
            <div key={c.id} className={`bg-gradient-to-br ${c.accent} to-slate-900 border rounded-2xl p-5`}>
              <div className="flex items-center gap-3 mb-2">
                <span className="w-11 h-11 rounded-xl bg-slate-900/60 border border-slate-700 flex items-center justify-center text-2xl shrink-0">{c.emoji}</span>
                <h2 className="text-lg font-black text-white">{c.title}</h2>
              </div>
              <p className="text-slate-400 text-sm leading-relaxed mb-3">{c.desc}</p>
              <div className="flex flex-wrap gap-2">
                {hasExport ? (
                  <>
                    <button onClick={() => run(c.id, "pdf")} disabled={!!busy}
                      className="px-4 py-2 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 font-bold text-xs disabled:opacity-40">
                      {bPdf ? "… جاري" : "⬇ PDF"}
                    </button>
                    <button onClick={() => run(c.id, "excel")} disabled={!!busy}
                      className="px-4 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-bold text-xs disabled:opacity-40">
                      {bXls ? "… جاري" : "⬇ Excel"}
                    </button>
                  </>
                ) : (
                  <span className="text-[11px] text-slate-500 font-bold pt-1">التصدير المباشر قريبًا —</span>
                )}
                <button onClick={() => { try { sessionStorage.setItem("mihwar_open_tab", c.id); } catch (e) {} setPage(c.id); }}
                  className="px-4 py-2 rounded-xl bg-slate-800/60 border border-slate-700 text-slate-300 font-bold text-xs mr-auto">
                  فتح الصفحة ←
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {cards.length === 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center text-slate-500 text-sm">لا توجد تقارير متاحة ضمن صلاحياتك.</div>
      )}
    </div>
  );
}
