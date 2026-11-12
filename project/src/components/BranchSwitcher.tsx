// =============================================================
// src/components/BranchSwitcher.tsx
// مبدّل الفرع — يظهر فقط لو المستخدم يصل لأكثر من فرع.
// يغيّر الفرع النشط (ownedShopId) فتتبعه كل الصفحات والتقارير تلقائيًا.
// =============================================================

import { useAuth } from "../context/AuthContext";

export default function BranchSwitcher() {
  const { branches, ownedShopId, setActiveBranchId } = (useAuth() as any) ?? {};
  if (!branches || branches.length < 2) return null;

  return (
    <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5">
      <span className="text-[13px]">🏪</span>
      <select
        value={ownedShopId ?? ""}
        onChange={(e) => setActiveBranchId(Number(e.target.value))}
        title="تبديل الفرع"
        className="bg-transparent text-white text-sm font-bold focus:outline-none cursor-pointer [direction:rtl] max-w-[160px]"
      >
        {branches.map((b: any) => (
          <option key={b.id} value={b.id} className="bg-slate-900 text-white">{b.name}</option>
        ))}
      </select>
    </div>
  );
}
