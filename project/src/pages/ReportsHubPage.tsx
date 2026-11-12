// =============================================================
// src/pages/ReportsHubPage.tsx
// مركز التقارير — روابط سريعة لكل تقرير مالي، تفتح الصفحة فورًا للتصدير.
// =============================================================

import { Page } from "../components/Layout";
import { useAuth } from "../context/AuthContext";

type Props = { setPage: (p: Page) => void };

const CARDS: { id: Page; title: string; desc: string; emoji: string; accent: string }[] = [
  { id: "sales-reconciliation", title: "تقرير تسوية المبيعات", desc: "مطابقة السيستم بالتحصيل الفعلي + تقرير بالمدة مع الضريبة", emoji: "📊", accent: "from-blue-600/20 border-blue-500/30" },
  { id: "purchases", title: "تقرير المشتريات", desc: "فواتير الشراء + تنبيه تغيّر الأسعار + نِسَب التصنيفات", emoji: "🧾", accent: "from-emerald-600/20 border-emerald-500/30" },
  { id: "fixed-expenses", title: "المصروفات الثابتة ونقطة التعادل", desc: "الرواتب والمصروفات + حساب التعادل والمستهدف", emoji: "🏦", accent: "from-amber-600/20 border-amber-500/30" },
  { id: "financial-report", title: "التقرير المالي الشهري", desc: "قائمة ربح وخسارة + مقارنة شهرين + نقطة التعادل", emoji: "📑", accent: "from-purple-600/20 border-purple-500/30" },
];

export default function ReportsHubPage({ setPage }: Props) {
  const { permissions } = (useAuth() as any) ?? {};
  const allowed = (id: Page) => !permissions || permissions.includes(id);
  const cards = CARDS.filter((c) => allowed(c.id));

  return (
    <div className="p-4 lg:p-6 min-h-screen" dir="rtl">
      <div className="mb-5">
        <h1 className="text-2xl font-black text-white flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-xl">🗂️</span>
          مركز التقارير
        </h1>
        <p className="text-slate-500 text-sm mt-1">اختر نوع التقرير اللي عايز تسحبه — يفتح الصفحة فورًا للتصدير PDF/Excel</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {cards.map((c) => (
          <button
            key={c.id}
            onClick={() => setPage(c.id)}
            className={`text-right bg-gradient-to-br ${c.accent} to-slate-900 border rounded-2xl p-5 transition-all hover:-translate-y-0.5 hover:border-white/20`}
          >
            <div className="flex items-center gap-3 mb-2">
              <span className="w-11 h-11 rounded-xl bg-slate-900/60 border border-slate-700 flex items-center justify-center text-2xl shrink-0">{c.emoji}</span>
              <h2 className="text-lg font-black text-white">{c.title}</h2>
            </div>
            <p className="text-slate-400 text-sm leading-relaxed">{c.desc}</p>
            <div className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-blue-300">فتح التقرير ←</div>
          </button>
        ))}
      </div>

      {cards.length === 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center text-slate-500 text-sm">لا توجد تقارير متاحة ضمن صلاحياتك.</div>
      )}
    </div>
  );
}
