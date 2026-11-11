// =============================================================
// src/components/CreateUserModal.tsx
// نافذة إنشاء حساب موظف جديد وربطه بفرع.
// تُنشئ حساب الدخول عبر عميل Supabase مؤقت (بدون التأثير على جلسة الأدمن)،
// ثم تحدّث/تنشئ صف البروفايل (الاسم، الفرع store_id، الدور، نشط).
// الصلاحيات تُضبط بعد الإنشاء من زر المفتاح 🔑 (وصول كامل افتراضيًا).
// =============================================================

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { createClient } from "@supabase/supabase-js";
import { supabase } from "../pages/lib/supabase";

type Shop = { id: number; shop_name: string };

type Props = {
  isAr?: boolean;
  onClose: () => void;
  onCreated: () => void;
};

export default function CreateUserModal({ isAr = true, onClose, onCreated }: Props) {
  const T = (ar: string, en: string) => (isAr ? ar : en);
  const [shops, setShops] = useState<Shop[]>([]);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [shopId, setShopId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("shops").select("id, shop_name").order("shop_name", { ascending: true });
      if (data) setShops(data as Shop[]);
    })();
  }, []);

  const valid = fullName.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && password.length >= 6 && shopId;

  const create = async () => {
    if (!valid) { alert(T("أكمل البيانات: الاسم، إيميل صحيح، باسورد 6 أحرف على الأقل، والفرع.", "Fill all fields correctly (password ≥ 6).")); return; }
    setSaving(true);
    try {
      // عميل مؤقت حتى لا يتأثر تسجيل دخول الأدمن
      const tmp = createClient(
        import.meta.env.VITE_SUPABASE_URL as string,
        import.meta.env.VITE_SUPABASE_ANON_KEY as string,
        { auth: { persistSession: false, autoRefreshToken: false } }
      );

      const { data, error } = await tmp.auth.signUp({ email: email.trim().toLowerCase(), password });
      if (error) throw error;
      const newId = data.user?.id;
      if (!newId) throw new Error(T("تعذّر إنشاء الحساب.", "Could not create account."));

      // ربط البروفايل بالفرع (upsert يغطي وجود/عدم وجود trigger)
      const { error: pErr } = await supabase.from("profiles").upsert(
        {
          id: newId,
          email: email.trim().toLowerCase(),
          full_name: fullName.trim(),
          phone: phone.trim() || null,
          store_id: Number(shopId),
          role: "employee",
          is_admin: false,
          is_active: true,
          page_permissions: null,
        },
        { onConflict: "id" }
      );
      if (pErr) throw pErr;

      try { await tmp.auth.signOut(); } catch { /* ignore */ }

      alert(T("تم إنشاء الموظف وربطه بالفرع. اضبط صلاحياته من زر المفتاح 🔑.", "Employee created. Set permissions from the key button."));
      onCreated();
      onClose();
    } catch (e: any) {
      alert(T("تعذّر الإنشاء: ", "Create failed: ") + (e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" dir={isAr ? "rtl" : "ltr"}>
      <div className="w-full max-w-md rounded-[2rem] border border-slate-700 bg-slate-900 p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4 mb-5">
          <h2 className="text-xl font-black text-white">{T("إضافة موظف جديد", "Add Employee")}</h2>
          <button onClick={onClose} disabled={saving} className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white disabled:opacity-50"><X size={18} /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-slate-400 mb-1">{T("الاسم الكامل", "Full name")}</label>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full rounded-2xl bg-slate-950 border border-slate-700 px-4 py-2.5 text-white text-sm" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 mb-1">{T("إيميل الدخول", "Login email")}</label>
            <input type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="employee@example.com" className="w-full rounded-2xl bg-slate-950 border border-slate-700 px-4 py-2.5 text-white text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">{T("كلمة المرور", "Password")}</label>
              <input type="text" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="6+ chars" className="w-full rounded-2xl bg-slate-950 border border-slate-700 px-4 py-2.5 text-white text-sm" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">{T("الهاتف (اختياري)", "Phone (optional)")}</label>
              <input dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full rounded-2xl bg-slate-950 border border-slate-700 px-4 py-2.5 text-white text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 mb-1">{T("الفرع", "Branch")}</label>
            <select value={shopId} onChange={(e) => setShopId(e.target.value)} className="w-full rounded-2xl bg-slate-950 border border-slate-700 px-4 py-2.5 text-white text-sm">
              <option value="">{T("— اختر الفرع —", "— Select branch —")}</option>
              {shops.map((s) => <option key={s.id} value={s.id}>{s.shop_name}</option>)}
            </select>
          </div>
        </div>

        <div className="flex gap-3 pt-5">
          <button onClick={onClose} disabled={saving} className="flex-1 px-4 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold disabled:opacity-50">{T("إلغاء", "Cancel")}</button>
          <button onClick={create} disabled={saving || !valid} className="flex-1 px-4 py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-black disabled:opacity-50">{saving ? T("جاري الإنشاء...", "Creating...") : T("إنشاء الموظف", "Create")}</button>
        </div>
      </div>
    </div>
  );
}
