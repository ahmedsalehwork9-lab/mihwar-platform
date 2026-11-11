// =============================================================
// src/components/PagePermissionsModal.tsx
// نافذة تحديد صلاحيات الصفحات لمستخدم واحد.
// "وصول كامل" => page_permissions = null (يرى كل الصفحات).
// غير ذلك => قائمة بمفاتيح الصفحات المسموح بها فقط.
// =============================================================

import { useState } from "react";
import { X } from "lucide-react";
import { supabase } from "../pages/lib/supabase";
import { PERM_PAGES } from "../pages/lib/permPages";

type Props = {
  userId: string;
  userName: string;
  initial: string[] | null;
  isAr?: boolean;
  onClose: () => void;
  onSaved: (perms: string[] | null) => void;
};

export default function PagePermissionsModal({ userId, userName, initial, isAr = true, onClose, onSaved }: Props) {
  const [sel, setSel] = useState<Set<string>>(new Set(initial ?? []));
  const [fullAccess, setFullAccess] = useState<boolean>(!initial || initial.length === 0);
  const [saving, setSaving] = useState(false);
  const T = (ar: string, en: string) => (isAr ? ar : en);

  const toggle = (id: string) => setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const save = async () => {
    setSaving(true);
    const value = fullAccess ? null : [...sel];
    const { error } = await supabase.from("profiles").update({ page_permissions: value }).eq("id", userId);
    setSaving(false);
    if (error) { alert(T("تعذّر حفظ الصلاحيات: ", "Failed to save: ") + error.message); return; }
    onSaved(value);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" dir={isAr ? "rtl" : "ltr"}>
      <div className="w-full max-w-md rounded-[2rem] border border-slate-700 bg-slate-900 p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <h2 className="text-xl font-black text-white">{T("صلاحيات الصفحات", "Page Permissions")}</h2>
            <p className="text-sm text-slate-400 mt-1">{userName}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white"><X size={18} /></button>
        </div>

        <label className="flex items-center gap-2 mb-3 text-sm font-bold text-emerald-300 cursor-pointer select-none">
          <input type="checkbox" checked={fullAccess} onChange={(e) => setFullAccess(e.target.checked)} className="w-4 h-4 accent-emerald-500" />
          {T("وصول كامل لكل الصفحات", "Full access to all pages")}
        </label>

        <div className={`space-y-1.5 max-h-[50vh] overflow-y-auto pr-1 ${fullAccess ? "opacity-40 pointer-events-none" : ""}`}>
          {PERM_PAGES.map((p) => (
            <label key={p.id} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer hover:border-slate-700">
              <input type="checkbox" checked={sel.has(p.id)} onChange={() => toggle(p.id)} className="w-4 h-4 accent-blue-500" />
              <span className="text-sm text-slate-200">{isAr ? p.ar : p.en}</span>
            </label>
          ))}
        </div>

        {!fullAccess && sel.size === 0 && (
          <p className="text-[11px] text-amber-400 mt-2">{T("لم تختر أي صفحة — المستخدم لن يرى أي شيء.", "No page selected — the user will see nothing.")}</p>
        )}

        <div className="flex gap-3 pt-5">
          <button onClick={onClose} disabled={saving} className="flex-1 px-4 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold disabled:opacity-50">{T("إلغاء", "Cancel")}</button>
          <button onClick={save} disabled={saving} className="flex-1 px-4 py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-black disabled:opacity-50">{saving ? T("جاري الحفظ...", "Saving...") : T("حفظ الصلاحيات", "Save")}</button>
        </div>
      </div>
    </div>
  );
}
