// =============================================================
// src/components/OrgAdminsPanel.tsx
// قسم «أدمن المجموعة» داخل تفاصيل المجموعة — تعيين/إزالة مستخدمين
// يديروا كل فروع المجموعة. يكتب في organization_members.
// =============================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../pages/lib/supabase";
import { Shield, UserPlus, Trash2, Search, RefreshCw, AlertCircle, X } from "lucide-react";

type Member = { id: number; user_id: string; role: string; name: string; email: string };
type UserRow = { id: string; full_name: string | null; email: string | null; is_admin: boolean };
type Props = { organizationId: number; t: (en: string, ar: string) => string; isRTL: boolean };

export default function OrgAdminsPanel({ organizationId, t, isRTL }: Props) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<number | null>(null);

  const loadMembers = useCallback(async () => {
    setLoading(true); setErr(null);
    const { data: ms, error } = await supabase
      .from("organization_members").select("id, user_id, role").eq("organization_id", organizationId)
      .order("created_at", { ascending: true });
    if (error) { setErr(error.message); setLoading(false); return; }
    const rows = ms || [];
    const ids = rows.map((r: any) => r.user_id);
    const profMap: Record<string, { full_name: string | null; email: string | null }> = {};
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
      (profs || []).forEach((p: any) => { profMap[p.id] = { full_name: p.full_name, email: p.email }; });
    }
    setMembers(rows.map((r: any) => ({ id: r.id, user_id: r.user_id, role: r.role, name: profMap[r.user_id]?.full_name || "—", email: profMap[r.user_id]?.email || "" })));
    setLoading(false);
  }, [organizationId]);

  useEffect(() => { loadMembers(); }, [loadMembers]);

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    const { data } = await supabase.from("profiles").select("id, full_name, email, is_admin").order("full_name", { ascending: true });
    setUsers((data || []) as UserRow[]);
    setUsersLoading(false);
  }, []);
  useEffect(() => { if (showAdd) { setSelected(null); setSearch(""); loadUsers(); } }, [showAdd, loadUsers]);

  const memberIds = useMemo(() => new Set(members.map((m) => m.user_id)), [members]);
  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => !u.is_admin && !memberIds.has(u.id) &&
      (!q || (u.full_name || "").toLowerCase().includes(q) || (u.email || "").toLowerCase().includes(q)));
  }, [users, memberIds, search]);

  const assign = async () => {
    if (!selected) return;
    setSaving(true); setErr(null);
    const { error } = await supabase.from("organization_members").insert({ organization_id: organizationId, user_id: selected, role: "admin" });
    setSaving(false);
    if (error) { setErr(error.message); return; }
    setShowAdd(false); await loadMembers();
  };
  const remove = async (id: number) => {
    if (!window.confirm(t("Remove this admin?", "إزالة هذا الأدمن من المجموعة؟"))) return;
    setRemoving(id);
    const { error } = await supabase.from("organization_members").delete().eq("id", id);
    setRemoving(null);
    if (error) { alert(error.message); return; }
    await loadMembers();
  };

  const roleBadge = (role: string) =>
    role === "owner"
      ? <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full border bg-amber-500/10 text-amber-400 border-amber-500/20">{t("Owner", "مالك")}</span>
      : <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full border bg-blue-500/10 text-blue-400 border-blue-500/20">{t("Admin", "أدمن")}</span>;

  return (
    <div className="mt-8 space-y-3">
      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
        <h4 className="text-white font-black text-base sm:text-lg flex items-center gap-2">
          <Shield size={16} className="text-blue-400" aria-hidden="true" />
          {t("Group Admins", "أدمن المجموعة")}
          <span className="text-xs font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full tabular-nums">{members.length}</span>
        </h4>
        <button onClick={() => setShowAdd((v) => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600/10 hover:bg-blue-600/20 border border-blue-500/20 text-blue-400 text-xs font-bold transition-all active:scale-95">
          <UserPlus size={13} />{t("Assign Admin", "تعيين أدمن")}
        </button>
      </div>
      <p className="text-slate-500 text-[11px] -mt-1">{t("Admins can switch between all branches of this group.", "الأدمن يقدر يتنقل بين كل فروع المجموعة دي.")}</p>

      {showAdd && (
        <div className="bg-slate-950/60 border border-blue-500/20 rounded-2xl p-4 space-y-3">
          <p className="text-blue-400 font-bold text-xs uppercase tracking-wide">{t("Select a user to assign", "اختر مستخدم لتعيينه")}</p>
          <div className="relative">
            <Search size={13} className={`absolute ${isRTL ? "right-3" : "left-3"} top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none`} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("Search by name or email...", "بحث بالاسم أو الإيميل...")}
              className={`w-full bg-slate-900 border border-slate-700 rounded-xl ${isRTL ? "pr-8 pl-3" : "pl-8 pr-3"} h-9 text-white text-xs focus:outline-none focus:border-blue-500/50`} />
          </div>
          <div className="max-h-48 overflow-y-auto space-y-1.5">
            {usersLoading ? (
              <div className="flex items-center justify-center py-6 gap-2 text-slate-500 text-xs"><RefreshCw size={13} className="animate-spin" />{t("Loading...", "جاري التحميل...")}</div>
            ) : candidates.length === 0 ? (
              <div className="py-6 text-center text-slate-600 text-xs">{t("No users available", "لا يوجد مستخدمون متاحون")}</div>
            ) : candidates.map((u) => (
              <button key={u.id} onClick={() => setSelected(u.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-right transition-all ${selected === u.id ? "bg-blue-600/15 border-blue-500/50" : "bg-slate-900/60 border-slate-800/50 hover:border-slate-700"}`}>
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${selected === u.id ? "border-blue-500 bg-blue-600" : "border-slate-600"}`}>
                  {selected === u.id && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
                <div className="w-7 h-7 rounded-lg bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-blue-400 font-black text-xs shrink-0">{(u.full_name || u.email || "U").charAt(0)}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-bold text-xs truncate">{u.full_name || t("(no name)", "(بدون اسم)")}</p>
                  <p className="text-slate-500 text-[10px] truncate [direction:ltr] text-right">{u.email || "—"}</p>
                </div>
              </button>
            ))}
          </div>
          {err && <p className="text-red-400 text-xs font-bold flex items-center gap-1.5"><AlertCircle size={12} />{err}</p>}
          <div className="flex gap-2 pt-1">
            <button onClick={() => { setShowAdd(false); setErr(null); }} disabled={saving} className="flex-1 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs disabled:opacity-50">{t("Cancel", "إلغاء")}</button>
            <button onClick={assign} disabled={saving || !selected} className="flex-1 h-9 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5">
              {saving ? <><RefreshCw size={12} className="animate-spin" />{t("Assigning...", "جاري التعيين...")}</> : <><UserPlus size={12} />{t("Assign", "تعيين")}</>}
            </button>
          </div>
        </div>
      )}

      {err && !showAdd && <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-2xl px-3 py-2.5"><AlertCircle size={13} className="text-red-400 shrink-0" /><span className="text-red-400 text-xs font-bold">{err}</span></div>}

      {loading ? (
        <div className="space-y-2">{[0, 1].map((i) => <div key={i} className="h-14 bg-slate-800/50 rounded-2xl animate-pulse" />)}</div>
      ) : members.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 gap-2 opacity-50">
          <Shield size={28} className="text-slate-500" aria-hidden="true" />
          <p className="text-slate-400 text-sm font-bold">{t("No admins assigned yet", "لا يوجد أدمن معيّن بعد")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-3 bg-slate-950/50 border border-slate-800/50 rounded-2xl px-4 py-3 hover:border-slate-700 transition-colors group">
              <div className="w-9 h-9 rounded-xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-blue-400 font-black text-sm shrink-0">{(m.name || m.email || "U").charAt(0)}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2"><p className="text-white font-bold text-sm truncate">{m.name}</p>{roleBadge(m.role)}</div>
                <p className="text-slate-500 text-[11px] truncate [direction:ltr] text-right">{m.email || "—"}</p>
              </div>
              {m.role !== "owner" && (
                <button onClick={() => remove(m.id)} disabled={removing === m.id}
                  className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 transition-all disabled:opacity-50 shrink-0 opacity-0 group-hover:opacity-100">
                  {removing === m.id ? <RefreshCw size={13} className="animate-spin" /> : <Trash2 size={13} />}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
