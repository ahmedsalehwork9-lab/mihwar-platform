// =============================================================
// src/pages/PermissionsPage.tsx — مركز الصلاحيات (أدمن المنصة فقط).
// تبويبات: المستخدمون (صفحات + إجراءات + فروع) · القوالب (جاهزة ومخصّصة) · سجل التدقيق.
// =============================================================
import { useCallback, useEffect, useMemo, useState } from "react";
import { KeyRound, Search, RefreshCw, Users, ShieldCheck, ShieldAlert, UserX, Layers, History, Plus, Pencil, Trash2, Copy, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../context/LanguageContext";
import UserAccessModal from "../components/UserAccessModal";
import TemplateEditorModal from "../components/TemplateEditorModal";
import { loadUsers, loadTemplates, loadAudit, deleteTemplate, type UserRow, type ShopLite, type AuditRow } from "./admin/permApi";
import { SYSTEM_TEMPLATES, diffAccess, sanitize, summarize, matchTemplate, type Template, type Access } from "./lib/permModel";

type Tab = "users" | "templates" | "audit";
const CARD = "bg-slate-900 border border-slate-800 rounded-2xl";
const fdt = (iso: string | null, lang: string) => (iso ? new Intl.DateTimeFormat(lang === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso)) : "—");

export default function PermissionsPage() {
  const { t, lang, isRTL } = useLang();
  const { user: me } = useAuth();
  const selfId = me?.id ?? null;
  const [tab, setTab] = useState<Tab>("users");
  const [users, setUsers] = useState<UserRow[]>([]); const [shops, setShops] = useState<ShopLite[]>([]);
  const [actionsSupported, setActionsSupported] = useState(true);
  const [custom, setCustom] = useState<Template[]>([]); const [tplSupported, setTplSupported] = useState(true);
  const [audit, setAudit] = useState<AuditRow[]>([]); const [auditSupported, setAuditSupported] = useState(true);
  const [loading, setLoading] = useState(true); const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState(""); const [fStatus, setFStatus] = useState("all"); const [fKind, setFKind] = useState("all");
  const [editing, setEditing] = useState<UserRow | null>(null); const [tplEdit, setTplEdit] = useState<{ id?: number; name: string; nameEn?: string; description?: string; access: Access } | "new" | null>(null);
  const [delTpl, setDelTpl] = useState<Template | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "warn"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const [u, tp, au] = await Promise.all([loadUsers(), loadTemplates(), loadAudit()]);
      setUsers(u.users); setShops(u.shops); setActionsSupported(u.actionsSupported); setCustom(tp.templates); setTplSupported(tp.supported); setAudit(au.rows); setAuditSupported(au.supported);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const nameOf = useMemo(() => new Map(users.map((u) => [u.id, u.full_name || u.email])), [users]);
  const stats = useMemo(() => ({
    total: users.length, active: users.filter((u) => u.is_active).length, admins: users.filter((u) => u.is_admin).length,
    restricted: users.filter((u) => !u.is_admin && (u.access.pages !== null || u.access.actions !== null)).length,
    noBranch: users.filter((u) => !u.is_admin && u.store_id == null && u.branches.length === 0).length,
  }), [users]);
  const norm = (s: string) => s.toLowerCase();
  const list = useMemo(() => users.filter((u) => {
    if (q && !(norm(u.full_name || "").includes(norm(q)) || norm(u.email).includes(norm(q)) || (u.phone || "").includes(q))) return false;
    if (fStatus === "active" && !u.is_active) return false; if (fStatus === "inactive" && u.is_active) return false;
    if (fKind === "admin" && !u.is_admin) return false; if (fKind === "restricted" && (u.is_admin || (u.access.pages === null && u.access.actions === null))) return false;
    if (fKind === "full" && (u.is_admin || u.access.pages !== null || u.access.actions !== null)) return false; if (fKind === "nobranch" && (u.is_admin || u.store_id != null || u.branches.length > 0)) return false;
    return true;
  }), [users, q, fStatus, fKind]);

  const onSaved = (u: UserRow, note: string | null) => { setUsers((cur) => cur.map((x) => (x.id === u.id ? u : x))); setEditing(null); setNotice(note ? { kind: "warn", text: note } : { kind: "ok", text: t("Permissions saved.", "تم حفظ الصلاحيات.") }); void loadAudit().then((r) => { setAudit(r.rows); setAuditSupported(r.supported); }); };
  const removeTpl = async () => { if (!delTpl) return; const id = Number(delTpl.id.slice(1)); try { await deleteTemplate(id); setDelTpl(null); setNotice({ kind: "ok", text: t("Template deleted. Users keep their current permissions.", "حُذف القالب. يحتفظ المستخدمون بصلاحياتهم الحالية.") }); await load(); } catch (e) { setNotice({ kind: "warn", text: e instanceof Error ? e.message : String(e) }); setDelTpl(null); } };

  const kpi = (id: string, label: string, v: number, Icon: typeof Users, tone: string) => (
    <div key={id} data-testid={`pk-${id}`} className={`${CARD} p-4 flex items-center gap-3`}><span className={`w-10 h-10 rounded-xl bg-slate-800/60 flex items-center justify-center ${tone}`}><Icon size={18} /></span>
      <div><div className="text-2xl font-black text-white tabular-nums" data-testid={`pk-${id}-v`}>{v}</div><div className="text-[11px] text-slate-400">{label}</div></div></div>);
  const tabBtn = (id: Tab, label: string, Icon: typeof Users) => (
    <button key={id} role="tab" aria-selected={tab === id} data-testid={`tab-${id}`} onClick={() => setTab(id)} className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border ${tab === id ? "bg-blue-600 text-white border-blue-500" : "bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-600"}`}><Icon size={15} />{label}</button>);
  const sel = "rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-white";

  const auditSummary = (r: AuditRow): string => {
    const b = (r.before_data || {}) as { pages?: unknown; actions?: unknown; role?: string; is_active?: boolean; is_admin?: boolean }; const a = (r.after_data || {}) as typeof b;
    const d = diffAccess(sanitize(b.pages, b.actions) as Access, sanitize(a.pages, a.actions) as Access); const parts: string[] = [];
    if (d.addedPages.length) parts.push(t(`+${d.addedPages.length} pages`, `+${d.addedPages.length} صفحة`)); if (d.removedPages.length) parts.push(t(`−${d.removedPages.length} pages`, `−${d.removedPages.length} صفحة`));
    if (d.actionChanges) parts.push(t(`${d.actionChanges} action sets changed`, `تغيّر إجراءات ${d.actionChanges} صفحة`));
    if (b.role !== a.role) parts.push(t(`role ${b.role}→${a.role}`, `الدور ${b.role}→${a.role}`)); if (b.is_active !== a.is_active) parts.push(a.is_active ? t("activated", "تفعيل") : t("deactivated", "تعطيل")); if (b.is_admin !== a.is_admin) parts.push(a.is_admin ? t("made admin", "منح أدمن") : t("admin removed", "سحب أدمن"));
    return parts.join(" · ") || t("no visible change", "بلا تغيير ظاهر");
  };

  return (
    <div data-rpt data-testid="perm-page" dir={isRTL ? "rtl" : "ltr"} className="min-h-screen bg-slate-950 text-white pb-12">
      <div className="p-4 lg:p-8 space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/50 pb-5">
          <div className="flex items-center gap-3"><span className="w-11 h-11 rounded-2xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center"><KeyRound size={22} className="text-blue-400" /></span>
            <div><h1 className="text-2xl font-black">{t("Permissions center", "مركز الصلاحيات")}</h1><p className="text-xs text-slate-400 mt-0.5">{t("Pages, actions, branches and account status for every user.", "الصفحات والإجراءات والفروع وحالة الحساب لكل مستخدم.")}</p></div></div>
          <button data-testid="perm-refresh" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm font-semibold text-slate-300 disabled:opacity-50"><RefreshCw size={15} className={loading ? "animate-spin" : ""} />{t("Refresh", "تحديث")}</button>
        </header>

        {err && <div data-testid="perm-error" role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-300 flex gap-2"><AlertTriangle size={15} className="shrink-0 mt-0.5" />{err}</div>}
        {notice && <div data-testid="perm-notice" role="status" className={`rounded-xl border px-4 py-3 text-xs flex gap-2 ${notice.kind === "ok" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-amber-500/30 bg-amber-500/10 text-amber-300"}`}>{notice.kind === "ok" ? <CheckCircle2 size={15} className="shrink-0" /> : <Info size={15} className="shrink-0" />}{notice.text}</div>}
        {!loading && !err && (!actionsSupported || !tplSupported || !auditSupported) && <div data-testid="perm-sql-warn" className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-300 flex gap-2"><Info size={15} className="shrink-0 mt-0.5" />{t("Action-level permissions, custom templates and the audit log are waiting for the SQL file (20261127_admin_permissions.sql). Page access works now.", "صلاحيات الإجراءات والقوالب المخصّصة وسجل التدقيق بانتظار تطبيق ملف SQL (20261127_admin_permissions.sql). صلاحيات الصفحات تعمل الآن.")}</div>}

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {kpi("total", t("Users", "المستخدمون"), stats.total, Users, "text-blue-400")}{kpi("active", t("Active", "فعّالون"), stats.active, ShieldCheck, "text-emerald-400")}
          {kpi("admins", t("Admins", "أدمن"), stats.admins, ShieldAlert, "text-red-400")}{kpi("restricted", t("Restricted access", "صلاحيات مقيّدة"), stats.restricted, KeyRound, "text-amber-400")}
          {kpi("nobranch", t("No branch assigned", "بلا فرع"), stats.noBranch, UserX, "text-purple-400")}
        </div>

        <div role="tablist" className="flex flex-wrap gap-2">{tabBtn("users", t("Users", "المستخدمون"), Users)}{tabBtn("templates", t("Templates", "القوالب"), Layers)}{tabBtn("audit", t("Audit log", "سجل التدقيق"), History)}</div>

        {tab === "users" && (
          <section className="space-y-3" aria-label={t("Users", "المستخدمون")}>
            <div className="flex flex-wrap gap-2 items-center">
              <div className="relative flex-1 min-w-[14rem]"><Search size={14} className="absolute top-1/2 -translate-y-1/2 start-3 text-slate-500" /><input data-testid="u-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search name, email or phone…", "ابحث بالاسم أو الإيميل أو الجوال…")} aria-label={t("Search users", "بحث المستخدمين")} className="w-full rounded-xl bg-slate-900 border border-slate-700 ps-9 pe-3 py-2 text-sm text-white" /></div>
              <select data-testid="u-status" aria-label={t("Status filter", "تصفية الحالة")} value={fStatus} onChange={(e) => setFStatus(e.target.value)} className={sel}><option value="all">{t("All statuses", "كل الحالات")}</option><option value="active">{t("Active", "فعّال")}</option><option value="inactive">{t("Inactive", "معطّل")}</option></select>
              <select data-testid="u-kind" aria-label={t("Access filter", "تصفية الصلاحيات")} value={fKind} onChange={(e) => setFKind(e.target.value)} className={sel}><option value="all">{t("All access levels", "كل المستويات")}</option><option value="admin">{t("Admins", "أدمن")}</option><option value="full">{t("Full access", "وصول كامل")}</option><option value="restricted">{t("Restricted", "مقيّد")}</option><option value="nobranch">{t("No branch", "بلا فرع")}</option></select>
            </div>
            <div className={`${CARD} overflow-x-auto relative`}>
              <table className="w-full text-sm min-w-[44rem]"><thead><tr className="text-[11px] text-slate-500 border-b border-slate-800"><th scope="col" className="text-start p-3 font-bold">{t("User", "المستخدم")}</th><th scope="col" className="text-start p-3 font-bold">{t("Access", "الصلاحيات")}</th><th scope="col" className="text-start p-3 font-bold">{t("Branches", "الفروع")}</th><th scope="col" className="text-start p-3 font-bold">{t("Status", "الحالة")}</th><th scope="col" className="p-3"><span className="sr-only">{t("Actions", "إجراءات")}</span></th></tr></thead>
                <tbody>{list.map((u) => (
                  <tr key={u.id} data-testid="u-row" className="border-b border-slate-800/60 last:border-0 hover:bg-slate-800/30">
                    <td className="p-3"><div className="font-bold text-slate-100">{u.full_name || "—"}</div><div className="text-[11px] text-slate-500" dir="ltr">{u.email}</div></td>
                    <td className="p-3"><span data-testid="u-access" className={`inline-block px-2 py-0.5 rounded-lg text-[11px] font-bold border ${u.is_admin ? "bg-red-500/10 text-red-300 border-red-500/30" : u.access.pages === null && u.access.actions === null ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30" : "bg-amber-500/10 text-amber-300 border-amber-500/30"}`}>{summarize(u.access, u.is_admin, t, custom)}</span></td>
                    <td className="p-3 text-slate-300 text-xs">{u.shop_name || (u.branches.length ? "" : <span className="text-purple-300">{t("none", "لا يوجد")}</span>)}{u.branches.length > 0 && <span className="text-slate-500"> {u.shop_name ? "+" : ""}{u.branches.length}</span>}</td>
                    <td className="p-3"><span className={`text-[11px] font-bold ${u.is_active ? "text-emerald-400" : "text-slate-500"}`}>{u.is_active ? t("Active", "فعّال") : t("Inactive", "معطّل")}</span></td>
                    <td className="p-3 text-end"><button data-testid="u-edit" onClick={() => setEditing(u)} aria-label={`${t("Edit access for", "تعديل صلاحيات")} ${u.full_name || u.email}`} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600/15 hover:bg-blue-600/25 border border-blue-500/30 text-blue-300 text-xs font-bold"><Pencil size={13} />{t("Edit access", "تعديل")}</button></td>
                  </tr>))}
                  {!loading && list.length === 0 && <tr><td colSpan={5} data-testid="u-empty" className="p-8 text-center text-xs text-slate-500">{t("No users match.", "لا يوجد مستخدمون مطابقون.")}</td></tr>}
                  {loading && <tr><td colSpan={5} data-testid="perm-loading" className="p-8 text-center text-xs text-slate-500">{t("Loading…", "جارٍ التحميل…")}</td></tr>}</tbody></table>
            </div>
          </section>)}

        {tab === "templates" && (
          <section className="space-y-4" aria-label={t("Templates", "القوالب")}>
            <div><h2 className="text-sm font-black mb-2">{t("Built-in templates", "القوالب الجاهزة")}</h2>
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">{SYSTEM_TEMPLATES.map((x) => (
                <div key={x.id} data-testid="tpl-sys" className={`${CARD} p-4 flex flex-col gap-2`}><div className="font-black text-slate-100">{t(x.en, x.ar)}</div><p className="text-xs text-slate-400 flex-1">{t(x.descEn, x.descAr)}</p>
                  <div className="flex items-center justify-between text-[11px] text-slate-500"><span>{x.access.pages ? t(`${x.access.pages.length} pages`, `${x.access.pages.length} صفحة`) : t("All pages", "كل الصفحات")} · {users.filter((u) => !u.is_admin && matchTemplate(u.access, custom)?.id === x.id).length} {t("users", "مستخدم")}</span>
                    {x.access.pages && <button data-testid="tpl-copy" disabled={!tplSupported} onClick={() => setTplEdit({ name: `${x.ar} (نسخة)`, nameEn: `${x.en} (copy)`, description: x.descAr, access: x.access })} className="inline-flex items-center gap-1 text-blue-400 font-bold disabled:opacity-40"><Copy size={12} />{t("Copy as custom", "نسخ كقالب مخصّص")}</button>}</div></div>))}</div></div>
            <div><div className="flex items-center justify-between mb-2"><h2 className="text-sm font-black">{t("Your templates", "قوالبك المخصّصة")}</h2>
              <button data-testid="tpl-new" disabled={!tplSupported} onClick={() => setTplEdit("new")} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-black disabled:opacity-40"><Plus size={14} />{t("New template", "قالب جديد")}</button></div>
              {!tplSupported ? <p className="text-xs text-slate-500">{t("Custom templates need the SQL file.", "القوالب المخصّصة تتطلب تطبيق ملف SQL.")}</p>
                : custom.length === 0 ? <p data-testid="tpl-none" className="text-xs text-slate-500">{t("No custom templates yet.", "لا توجد قوالب مخصّصة بعد.")}</p>
                : <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">{custom.map((x) => (
                  <div key={x.id} data-testid="tpl-custom" className={`${CARD} p-4 flex flex-col gap-2`}><div className="font-black text-slate-100">{t(x.en, x.ar)}</div><p className="text-xs text-slate-400 flex-1">{x.descAr || "—"}</p>
                    <div className="flex items-center justify-between text-[11px] text-slate-500"><span>{x.access.pages ? x.access.pages.length : "∞"} {t("pages", "صفحة")} · {users.filter((u) => matchTemplate(u.access, custom)?.id === x.id).length} {t("users", "مستخدم")}</span>
                      <span className="inline-flex gap-1">
                        <button data-testid="tpl-edit" aria-label={t("Edit template", "تعديل القالب")} onClick={() => setTplEdit({ id: Number(x.id.slice(1)), name: x.ar, nameEn: x.en === x.ar ? "" : x.en, description: x.descAr, access: x.access })} className="p-1.5 rounded-lg bg-slate-800 text-slate-300"><Pencil size={13} /></button>
                        <button data-testid="tpl-del" aria-label={t("Delete template", "حذف القالب")} onClick={() => setDelTpl(x)} className="p-1.5 rounded-lg bg-slate-800 text-red-400"><Trash2 size={13} /></button></span></div></div>))}</div>}
              {delTpl && <div data-testid="tpl-del-confirm" role="alertdialog" className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200 flex items-center gap-3 flex-wrap"><span className="flex-1">{t(`Delete template “${delTpl.en}”? Users already using it keep their permissions.`, `حذف القالب «${delTpl.ar}»؟ المستخدمون الحاليون يحتفظون بصلاحياتهم.`)}</span>
                <button data-testid="tpl-del-yes" onClick={() => void removeTpl()} className="px-3 py-1.5 rounded-lg bg-red-600 text-white font-bold">{t("Delete", "حذف")}</button><button onClick={() => setDelTpl(null)} className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-200 font-bold">{t("Cancel", "إلغاء")}</button></div>}</div>
          </section>)}

        {tab === "audit" && (
          <section aria-label={t("Audit log", "سجل التدقيق")}>
            {!auditSupported ? <p data-testid="audit-unsupported" className="text-xs text-slate-500">{t("The audit log needs the SQL file.", "سجل التدقيق يتطلب تطبيق ملف SQL.")}</p>
              : audit.length === 0 ? <p data-testid="audit-empty" className="text-xs text-slate-500">{t("No permission changes recorded yet.", "لا توجد تغييرات صلاحيات مسجّلة بعد.")}</p>
              : <div className={`${CARD} overflow-x-auto relative`}><table className="w-full text-xs min-w-[40rem]"><thead><tr className="text-[11px] text-slate-500 border-b border-slate-800"><th scope="col" className="text-start p-3">{t("When", "الوقت")}</th><th scope="col" className="text-start p-3">{t("By", "بواسطة")}</th><th scope="col" className="text-start p-3">{t("User", "المستخدم")}</th><th scope="col" className="text-start p-3">{t("Change", "التغيير")}</th></tr></thead>
                <tbody>{audit.map((r) => (<tr key={r.id} data-testid="audit-row" className="border-b border-slate-800/60 last:border-0"><td className="p-3 text-slate-400 whitespace-nowrap">{fdt(r.at, lang)}</td><td className="p-3 text-slate-200">{(r.actor && nameOf.get(r.actor)) || "—"}</td><td className="p-3 text-slate-200">{(r.target_user && nameOf.get(r.target_user)) || "—"}</td><td className="p-3 text-slate-300">{auditSummary(r)}{r.note ? <span className="text-slate-500"> — {r.note}</span> : null}</td></tr>))}</tbody></table></div>}
          </section>)}
      </div>

      {editing && <UserAccessModal user={editing} shops={shops} customTemplates={custom} actionsSupported={actionsSupported} selfId={selfId} onClose={() => setEditing(null)} onSaved={onSaved} />}
      {tplEdit && <TemplateEditorModal initial={tplEdit === "new" ? undefined : tplEdit} onClose={() => setTplEdit(null)} onSaved={() => { setTplEdit(null); setNotice({ kind: "ok", text: t("Template saved.", "تم حفظ القالب.") }); void load(); }} />}
    </div>
  );
}
