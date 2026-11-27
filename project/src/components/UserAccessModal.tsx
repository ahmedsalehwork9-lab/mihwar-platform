// =============================================================
// src/components/UserAccessModal.tsx — صلاحيات مستخدم واحد: صفحات + إجراءات + قالب + فروع + حالة الحساب.
// بلا alert/confirm. يحفظ عبر permApi.saveAccess (دالة خادمية مع تدقيق، أو احتياطي للصفحات فقط قبل تطبيق SQL).
// =============================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { X, ShieldAlert, Check, Info } from "lucide-react";
import { useLang } from "../context/LanguageContext";
import { ACTIONS, PAGE_IDS, SYSTEM_TEMPLATES, diffAccess, matchTemplate, pageDef, sanitize, type Access, type Action, type ActionMap, type Template } from "../pages/lib/permModel";
import AccessMatrix from "./AccessMatrix";
import { saveAccess, type ShopLite, type UserRow } from "../pages/admin/permApi";

type Props = { user: UserRow; shops: ShopLite[]; customTemplates: Template[]; actionsSupported: boolean; selfId: string | null; onClose: () => void; onSaved: (u: UserRow, note: string | null) => void };

const fullMap = (pages: string[]): ActionMap => Object.fromEntries(pages.map((p) => [p, [...(pageDef(p)?.actions ?? [])]]));
function toState(a: Access): { full: boolean; pages: string[]; actions: ActionMap } {
  if (a.pages === null && a.actions === null) return { full: true, pages: [...PAGE_IDS], actions: fullMap(PAGE_IDS) };
  const pages = a.pages ?? [...PAGE_IDS]; return { full: false, pages, actions: { ...fullMap(pages), ...(a.actions ?? {}) } };
}

export default function UserAccessModal({ user, shops, customTemplates, actionsSupported, selfId, onClose, onSaved }: Props) {
  const { t, isRTL } = useLang();
  const init = useMemo(() => toState(user.access), [user.access]);
  const [full, setFull] = useState(init.full);
  const [pages, setPages] = useState<string[]>(init.pages);
  const [actions, setActions] = useState<ActionMap>(init.actions);
  const roleInit = user.role === "shop_owner" ? "shop_owner" : "employee";
  const [role, setRole] = useState<string>(roleInit);
  const [isActive, setIsActive] = useState(user.is_active);
  const [isAdmin, setIsAdmin] = useState(user.is_admin);
  const [branches, setBranches] = useState<number[]>(user.branches);
  const [bq, setBq] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const self = selfId === user.id;
  const allTemplates = useMemo(() => [...SYSTEM_TEMPLATES, ...customTemplates], [customTemplates]);

  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === "Escape" && !saving) onClose(); }; window.addEventListener("keydown", h); ref.current?.focus(); return () => window.removeEventListener("keydown", h); }, [onClose, saving]);

  const current = useMemo<Access>(() => (full ? { pages: null, actions: null } : sanitize(pages, actions) as Access), [full, pages, actions]);
  const effective: Access = full ? { pages: null, actions: null } : { pages: pages.length ? pages : [], actions: current.actions };
  const tpl = matchTemplate(effective, customTemplates);
  const diff = useMemo(() => diffAccess(user.access, effective), [user.access, effective.pages, effective.actions]);   // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = full !== init.full || diff.addedPages.length + diff.removedPages.length + diff.actionChanges > 0 || role !== roleInit || isActive !== user.is_active || isAdmin !== user.is_admin || branches.slice().sort().join() !== user.branches.slice().sort().join();
  const actionCount = full ? null : pages.reduce((n, p) => n + (actions[p]?.length ?? 0), 0);
  const empty = !full && pages.length === 0;

  const applyTemplate = (id: string) => { const tp = allTemplates.find((x) => x.id === id); if (!tp) return; const s = toState(tp.access); setFull(s.full); setPages(s.pages); setActions(s.actions); };
  const togglePageOn = (p: string, on: boolean) => { setPages((cur) => (on ? Array.from(new Set([...cur, p])) : cur.filter((x) => x !== p))); setActions((cur) => ({ ...cur, [p]: on ? (cur[p] && cur[p].length ? cur[p] : [...(pageDef(p)?.actions ?? [])]) : [] })); };
  const toggleAct = (p: string, a: Action, on: boolean) => setActions((cur) => { const s = new Set(cur[p] ?? []); on ? s.add(a) : s.delete(a); return { ...cur, [p]: ACTIONS.map((x) => x.id).filter((x) => s.has(x)) }; });
  const toggleGroup = (ids: string[], on: boolean) => ids.forEach((p) => togglePageOn(p, on));
  const toggleBranch = (id: number) => setBranches((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const save = async () => {
    if (empty && !isAdmin) { setErr(t("Select at least one page, or switch on full access.", "اختر صفحة واحدة على الأقل، أو فعّل الوصول الكامل.")); return; }
    setSaving(true); setErr(null);
    try {
      const access: Access = isAdmin ? { pages: null, actions: null } : effective;
      const r = await saveAccess({ userId: user.id, access, role: role !== roleInit ? role : undefined, isActive, isAdmin, branches });
      const note = !r.usedRpc ? t("Saved pages and account status only. Action-level permissions and the audit log need the SQL file to be applied.", "حُفظت الصفحات وحالة الحساب فقط. صلاحيات الإجراءات وسجل التدقيق تتطلب تطبيق ملف SQL.") : null;
      onSaved({ ...user, role: role !== roleInit ? role : user.role, is_active: isActive, is_admin: isAdmin, access: r.usedRpc ? access : { pages: access.pages, actions: user.access.actions }, branches }, note);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setSaving(false); }
  };

  const shopList = shops.filter((s) => !bq || s.shop_name.toLowerCase().includes(bq.toLowerCase()));
  const lbl = "block text-[11px] font-bold text-slate-400 mb-1";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-3" dir={isRTL ? "rtl" : "ltr"} onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="uam-title" data-testid="access-modal" className="w-full max-w-3xl max-h-[92vh] flex flex-col rounded-3xl border border-slate-700 bg-slate-900 shadow-2xl outline-none">
        <div className="flex items-start justify-between gap-4 p-5 border-b border-slate-800">
          <div className="min-w-0"><h2 id="uam-title" className="text-lg font-black text-white">{t("User access", "صلاحيات المستخدم")}</h2><p className="text-xs text-slate-400 mt-1 truncate">{user.full_name || user.email} · <bdi dir="ltr">{user.email}</bdi></p></div>
          <button onClick={onClose} disabled={saving} aria-label={t("Close", "إغلاق")} className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white disabled:opacity-50"><X size={18} /></button>
        </div>

        <div className="overflow-y-auto p-5 space-y-5">
          {/* حالة الحساب */}
          <section className="grid sm:grid-cols-3 gap-3">
            <div><label className={lbl} htmlFor="uam-role">{t("Role", "الدور")}</label>
              <select id="uam-role" data-testid="uam-role" value={role} onChange={(e) => setRole(e.target.value)} disabled={isAdmin} className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white">
                <option value="employee">{t("Employee", "موظف")}</option><option value="shop_owner">{t("Shop owner", "مالك محل")}</option></select></div>
            <label className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200 cursor-pointer self-end h-[38px]"><input data-testid="uam-active" type="checkbox" checked={isActive} disabled={self} onChange={(e) => setIsActive(e.target.checked)} className="w-4 h-4 accent-emerald-500" />{t("Account active", "الحساب فعّال")}</label>
            <label className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200 cursor-pointer self-end h-[38px]"><input data-testid="uam-admin" type="checkbox" checked={isAdmin} disabled={self} onChange={(e) => setIsAdmin(e.target.checked)} className="w-4 h-4 accent-red-500" /><ShieldAlert size={14} className="text-red-400" />{t("Platform admin", "أدمن المنصة")}</label>
          </section>
          {self && <p data-testid="uam-self" className="text-[11px] text-amber-400 flex items-center gap-1"><Info size={12} />{t("You cannot deactivate or demote your own account.", "لا يمكنك تعطيل حسابك أو سحب الأدمن منه.")}</p>}
          {isAdmin && !user.is_admin && <p data-testid="uam-admin-warn" role="alert" className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2">{t("This user will get unrestricted control of the whole platform: every company, user and permission.", "سيحصل هذا المستخدم على تحكم كامل بالمنصة كلها: كل الشركات والمستخدمين والصلاحيات.")}</p>}

          {isAdmin ? <p className="text-sm text-slate-400 bg-slate-950 border border-slate-800 rounded-xl px-4 py-3">{t("Platform admins always have access to every page and action.", "أدمن المنصة يملك كل الصفحات والإجراءات دائمًا.")}</p> : (<>
            {/* قالب + وصول كامل */}
            <section className="grid sm:grid-cols-2 gap-3 items-end">
              <div><label className={lbl} htmlFor="uam-tpl">{t("Start from a template", "ابدأ من قالب")}</label>
                <select id="uam-tpl" data-testid="uam-tpl" value={tpl?.id ?? ""} onChange={(e) => applyTemplate(e.target.value)} className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white">
                  <option value="" disabled>{t("Custom", "مخصّص")}</option>
                  {SYSTEM_TEMPLATES.map((x) => <option key={x.id} value={x.id}>{t(x.en, x.ar)}</option>)}
                  {customTemplates.length > 0 && <optgroup label={t("Your templates", "قوالبك")}>{customTemplates.map((x) => <option key={x.id} value={x.id}>{t(x.en, x.ar)}</option>)}</optgroup>}</select></div>
              <label className="flex items-center gap-2 text-sm font-bold text-emerald-300 cursor-pointer select-none h-[38px]"><input data-testid="uam-full" type="checkbox" checked={full} onChange={(e) => { setFull(e.target.checked); if (e.target.checked) { setPages([...PAGE_IDS]); setActions(fullMap(PAGE_IDS)); } }} className="w-4 h-4 accent-emerald-500" />{t("Full access to every page and action", "وصول كامل لكل الصفحات والإجراءات")}</label>
            </section>
            {tpl && <p className="text-[11px] text-slate-500 -mt-3">{t(tpl.descEn, tpl.descAr)}</p>}

            {/* مصفوفة الصلاحيات */}
            <section aria-label={t("Pages and actions", "الصفحات والإجراءات")} className={full ? "opacity-40 pointer-events-none" : ""} data-testid="uam-matrix">
              {!actionsSupported && <p data-testid="uam-noactions" className="text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2 mb-3">{t("Action-level permissions are not stored yet — apply the SQL file first. Page access is saved normally.", "صلاحيات الإجراءات لا تُحفظ بعد — طبّق ملف SQL أولًا. صلاحيات الصفحات تُحفظ بشكل طبيعي.")}</p>}
              <AccessMatrix pages={pages} actions={actions} onPage={togglePageOn} onAction={toggleAct} onGroup={toggleGroup} />
            </section>
            {empty && <p data-testid="uam-empty" className="text-xs text-amber-300">{t("No page selected — choose at least one or enable full access.", "لم تُختر أي صفحة — اختر واحدة على الأقل أو فعّل الوصول الكامل.")}</p>}
          </>)}

          {/* الفروع */}
          <section aria-label={t("Branch access", "الفروع المسموحة")}>
            <div className="flex items-center justify-between gap-2 mb-2"><h3 className="text-sm font-black text-white">{t("Branches this user can open", "الفروع التي يستطيع فتحها")}</h3>
              <input value={bq} onChange={(e) => setBq(e.target.value)} placeholder={t("Search branches…", "ابحث في الفروع…")} aria-label={t("Search branches", "بحث في الفروع")} className="rounded-xl bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs text-white w-40" /></div>
            {user.shop_name && <p className="text-[11px] text-slate-500 mb-2">{t("Primary branch (profile):", "الفرع الأساسي (من الملف الشخصي):")} <b className="text-slate-300">{user.shop_name}</b> — {t("always accessible.", "متاح دائمًا.")}</p>}
            <div className="grid sm:grid-cols-2 gap-1.5 max-h-40 overflow-y-auto" data-testid="uam-branches">{shopList.map((s) => (
              <label key={s.id} className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 cursor-pointer"><input type="checkbox" data-testid={`br-${s.id}`} checked={branches.includes(s.id)} onChange={() => toggleBranch(s.id)} className="w-3.5 h-3.5 accent-blue-500" /><span className="truncate">{s.shop_name}</span></label>))}
              {shopList.length === 0 && <p className="text-xs text-slate-500">{t("No branches match.", "لا توجد فروع مطابقة.")}</p>}</div>
          </section>
        </div>

        <div className="p-4 border-t border-slate-800 space-y-2">
          {err && <p data-testid="uam-error" role="alert" className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2">{err}</p>}
          <div className="flex items-center gap-3 flex-wrap">
            <p data-testid="uam-summary" className="text-[11px] text-slate-400 flex-1 min-w-[12rem]">
              {isAdmin ? t("Admin — everything", "أدمن — كل شيء") : full ? t("Full access", "وصول كامل") : <>{t(`${pages.length} pages · ${actionCount} actions`, `${pages.length} صفحة · ${actionCount} إجراء`)}{tpl ? ` · ${t(tpl.en, tpl.ar)}` : ` · ${t("Custom", "مخصّص")}`}</>}
              {dirty && <span data-testid="uam-dirty" className="text-amber-400"> · {t("unsaved changes", "تغييرات غير محفوظة")}</span>}</p>
            <button onClick={onClose} disabled={saving} className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-bold disabled:opacity-50">{t("Cancel", "إلغاء")}</button>
            <button data-testid="uam-save" onClick={() => void save()} disabled={saving || !dirty} className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-black disabled:opacity-50 inline-flex items-center gap-2">{saving ? t("Saving…", "جارٍ الحفظ…") : <><Check size={15} />{t("Save", "حفظ")}</>}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
