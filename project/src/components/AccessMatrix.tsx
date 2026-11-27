// =============================================================
// src/components/AccessMatrix.tsx — مصفوفة الصفحات × الإجراءات (تُستخدم في نافذة المستخدم ونافذة القالب).
// =============================================================
import { useLang } from "../context/LanguageContext";
import { ACTIONS, PERM_GROUPS, type Action, type ActionMap } from "../pages/lib/permModel";

type Props = { pages: string[]; actions: ActionMap; onPage: (id: string, on: boolean) => void; onAction: (id: string, a: Action, on: boolean) => void; onGroup: (ids: string[], on: boolean) => void };
export default function AccessMatrix({ pages, actions, onPage, onAction, onGroup }: Props) {
  const { t } = useLang();
  const togglePageOn = onPage, toggleAct = onAction, toggleGroup = onGroup;
  return (
    <div className="overflow-x-auto"><table className="w-full text-xs">
      <thead><tr className="text-slate-500"><th scope="col" className="text-start font-bold py-2">{t("Page", "الصفحة")}</th>{ACTIONS.map((a) => <th scope="col" key={a.id} className="font-bold py-2 px-1 text-center whitespace-nowrap">{t(a.en, a.ar)}</th>)}</tr></thead>
      {PERM_GROUPS.map((g) => { const gids = g.pages.map((p) => p.id); const allOn = gids.every((i) => pages.includes(i)); return (
        <tbody key={g.id} className="border-t border-slate-800">
          <tr className="bg-slate-950/60"><td colSpan={1 + ACTIONS.length} className="py-1.5 px-2"><label className="inline-flex items-center gap-2 font-black text-slate-300 cursor-pointer"><input type="checkbox" data-testid={`grp-${g.id}`} checked={allOn} onChange={(e) => toggleGroup(gids, e.target.checked)} className="w-3.5 h-3.5 accent-blue-500" />{t(g.en, g.ar)}</label></td></tr>
          {g.pages.map((p) => { const on = pages.includes(p.id); return (
            <tr key={p.id} className="border-t border-slate-800/60">
              <td className="py-1.5 px-2"><label className="inline-flex items-center gap-2 cursor-pointer text-slate-200"><input type="checkbox" data-testid={`pg-${p.id}`} checked={on} onChange={(e) => togglePageOn(p.id, e.target.checked)} className="w-4 h-4 accent-blue-500" />{t(p.en, p.ar)}</label></td>
              {ACTIONS.map((a) => <td key={a.id} className="text-center px-1">{p.actions.includes(a.id)
                ? <input type="checkbox" aria-label={`${t(p.en, p.ar)} — ${t(a.en, a.ar)}`} data-testid={`ac-${p.id}-${a.id}`} checked={on && (actions[p.id] ?? []).includes(a.id)} disabled={!on} onChange={(e) => toggleAct(p.id, a.id, e.target.checked)} className="w-4 h-4 accent-emerald-500 disabled:opacity-30" />
                : <span className="text-slate-700" aria-hidden>—</span>}</td>)}
            </tr>); })}
        </tbody>); })}
    </table></div>
  );
}
