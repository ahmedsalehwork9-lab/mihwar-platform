// =============================================================
// src/components/TemplateEditorModal.tsx — إنشاء/تعديل قالب صلاحيات مخصّص (يُحفظ في permission_templates).
// =============================================================
import { useEffect, useRef, useState } from "react";
import { X, Check } from "lucide-react";
import { useLang } from "../context/LanguageContext";
import AccessMatrix from "./AccessMatrix";
import { ACTIONS, PAGE_IDS, pageDef, sanitize, type Access, type Action, type ActionMap } from "../pages/lib/permModel";
import { saveTemplate } from "../pages/admin/permApi";

type Props = { initial?: { id?: number; name: string; nameEn?: string; description?: string; access: Access }; onClose: () => void; onSaved: () => void };
const fullMap = (pages: string[]): ActionMap => Object.fromEntries(pages.map((p) => [p, [...(pageDef(p)?.actions ?? [])]]));

export default function TemplateEditorModal({ initial, onClose, onSaved }: Props) {
  const { t, isRTL } = useLang();
  const a0 = initial?.access ?? { pages: [], actions: {} };
  const startPages = a0.pages ?? [...PAGE_IDS];
  const [name, setName] = useState(initial?.name ?? ""); const [nameEn, setNameEn] = useState(initial?.nameEn ?? ""); const [desc, setDesc] = useState(initial?.description ?? "");
  const [pages, setPages] = useState<string[]>(startPages); const [actions, setActions] = useState<ActionMap>({ ...fullMap(startPages), ...(a0.actions ?? {}) });
  const [saving, setSaving] = useState(false); const [err, setErr] = useState<string | null>(null); const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === "Escape" && !saving) onClose(); }; window.addEventListener("keydown", h); ref.current?.focus(); return () => window.removeEventListener("keydown", h); }, [onClose, saving]);
  const onPage = (p: string, on: boolean) => { setPages((c) => (on ? Array.from(new Set([...c, p])) : c.filter((x) => x !== p))); setActions((c) => ({ ...c, [p]: on ? (c[p]?.length ? c[p] : [...(pageDef(p)?.actions ?? [])]) : [] })); };
  const onAction = (p: string, a: Action, on: boolean) => setActions((c) => { const s = new Set(c[p] ?? []); on ? s.add(a) : s.delete(a); return { ...c, [p]: ACTIONS.map((x) => x.id).filter((x) => s.has(x)) }; });
  const onGroup = (ids: string[], on: boolean) => ids.forEach((p) => onPage(p, on));
  const save = async () => {
    if (!name.trim()) { setErr(t("Enter a template name.", "أدخل اسم القالب.")); return; }
    if (!pages.length) { setErr(t("Select at least one page.", "اختر صفحة واحدة على الأقل.")); return; }
    setSaving(true); setErr(null);
    try { await saveTemplate({ id: initial?.id, name, nameEn, description: desc, access: sanitize(pages, actions) as Access }); onSaved(); }
    catch (e) { const m = e instanceof Error ? e.message : String(e); setErr(m === "DUP" ? t("A template with this name already exists.", "يوجد قالب بهذا الاسم.") : m); setSaving(false); }
  };
  const inp = "w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-3" dir={isRTL ? "rtl" : "ltr"}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="tpl-title" data-testid="tpl-modal" className="w-full max-w-3xl max-h-[92vh] flex flex-col rounded-3xl border border-slate-700 bg-slate-900 shadow-2xl outline-none">
        <div className="flex items-center justify-between p-5 border-b border-slate-800"><h2 id="tpl-title" className="text-lg font-black text-white">{initial?.id ? t("Edit template", "تعديل القالب") : t("New template", "قالب جديد")}</h2><button onClick={onClose} disabled={saving} aria-label={t("Close", "إغلاق")} className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white"><X size={18} /></button></div>
        <div className="overflow-y-auto p-5 space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div><label className="block text-[11px] font-bold text-slate-400 mb-1" htmlFor="tpl-name">{t("Name (Arabic)", "الاسم (عربي)")}</label><input id="tpl-name" data-testid="tpl-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className={inp} /></div>
            <div><label className="block text-[11px] font-bold text-slate-400 mb-1" htmlFor="tpl-name-en">{t("Name (English, optional)", "الاسم (إنجليزي، اختياري)")}</label><input id="tpl-name-en" dir="ltr" value={nameEn} onChange={(e) => setNameEn(e.target.value)} maxLength={60} className={inp} /></div>
          </div>
          <div><label className="block text-[11px] font-bold text-slate-400 mb-1" htmlFor="tpl-desc">{t("Description (optional)", "وصف (اختياري)")}</label><input id="tpl-desc" value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={140} className={inp} /></div>
          <AccessMatrix pages={pages} actions={actions} onPage={onPage} onAction={onAction} onGroup={onGroup} />
        </div>
        <div className="p-4 border-t border-slate-800 space-y-2">
          {err && <p data-testid="tpl-error" role="alert" className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2">{err}</p>}
          <div className="flex justify-end gap-3"><button onClick={onClose} disabled={saving} className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-sm font-bold">{t("Cancel", "إلغاء")}</button>
            <button data-testid="tpl-save" onClick={() => void save()} disabled={saving} className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-black inline-flex items-center gap-2 disabled:opacity-50"><Check size={15} />{saving ? t("Saving…", "جارٍ الحفظ…") : t("Save", "حفظ")}</button></div>
        </div>
      </div>
    </div>
  );
}
