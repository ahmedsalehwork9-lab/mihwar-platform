// =============================================================
// src/pages/accounting/ledger/AccountCombo.tsx
// قائمة اختيار حساب بحث متقدم (كود/اسم عربي/اسم إنجليزي، كلمات متعددة)،
// تنقّل بالأسهم، الأحدث استخدامًا، ثنائية اللغة. قابلة لإعادة الاستخدام في صفحات أخرى.
// =============================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Layers, Search, X } from "lucide-react";
import type { GLAccount } from "../../lib/accountingDb";
import { useLang } from "../../../context/LanguageContext";
import { matchesQuery, queryTokens, splitHighlight } from "../chart/chartLogic";

const INPUT = "w-full bg-slate-950 border border-slate-700 rounded-xl text-white px-3 py-2 text-sm outline-none focus:border-blue-500 transition-colors";
const MAX_SHOWN = 80;

const readRecent = (key: string): number[] => {
  try { const j = JSON.parse(localStorage.getItem(key) || "[]"); return Array.isArray(j) ? j.filter((x) => typeof x === "number").slice(0, 6) : []; } catch { return []; }
};
const writeRecent = (key: string, ids: number[]): void => { try { localStorage.setItem(key, JSON.stringify(ids.slice(0, 6))); } catch { /* التخزين غير متاح */ } };

type Props = {
  accounts: GLAccount[]; value: number | null; onChange: (id: number | null) => void;
  storageKey?: string; testId?: string; inputRef?: React.RefObject<HTMLInputElement>; placeholder?: string;
};

export default function AccountCombo({ accounts, value, onChange, storageKey = "mihwar.acct.recent", testId = "acct", inputRef, placeholder }: Props) {
  const { t, lang } = useLang();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hi, setHi] = useState(0);
  const [recent, setRecent] = useState<number[]>(() => readRecent(storageKey));
  const wrapRef = useRef<HTMLDivElement>(null);
  const ownRef = useRef<HTMLInputElement>(null);
  const ref = inputRef ?? ownRef;
  const listRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(() => accounts.find((a) => a.id === value) ?? null, [accounts, value]);
  const nameOf = (a: GLAccount): string => (lang === "en" && a.name_en ? a.name_en : a.name);
  const tokens = useMemo(() => queryTokens(q), [q]);

  const sorted = useMemo(() => [...accounts].sort((a, b) => a.code.localeCompare(b.code, "en", { numeric: true })), [accounts]);
  const items = useMemo(() => {
    if (!tokens.length) {
      const rec = recent.map((id) => accounts.find((a) => a.id === id)).filter((a): a is GLAccount => !!a);
      const recIds = new Set(rec.map((a) => a.id));
      return { recent: rec, rest: sorted.filter((a) => !recIds.has(a.id)).slice(0, MAX_SHOWN), total: sorted.length };
    }
    const m = sorted.filter((a) => matchesQuery(a, tokens));
    return { recent: [] as GLAccount[], rest: m.slice(0, MAX_SHOWN), total: m.length };
  }, [tokens, sorted, accounts, recent]);
  const flat = useMemo(() => [...items.recent, ...items.rest], [items]);

  useEffect(() => { setHi(0); }, [q, open]);
  useEffect(() => { listRef.current?.querySelector<HTMLElement>('[data-hi="1"]')?.scrollIntoView({ block: "nearest" }); }, [hi, open]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const pick = (a: GLAccount) => {
    onChange(a.id); setOpen(false); setQ("");
    const next = [a.id, ...recent.filter((x) => x !== a.id)].slice(0, 6); setRecent(next); writeRecent(storageKey, next);
  };
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setHi((h) => Math.min(h + 1, Math.max(flat.length - 1, 0))); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    else if (e.key === "Enter" && open && flat[hi]) { e.preventDefault(); e.stopPropagation(); pick(flat[hi]); }
    else if (e.key === "Escape" && open) { e.preventDefault(); e.stopPropagation(); setOpen(false); setQ(""); }
  };

  const Row = ({ a, idx }: { a: GLAccount; idx: number }) => (
    <button type="button" role="option" aria-selected={hi === idx} data-hi={hi === idx ? "1" : undefined} data-testid={`${testId}-opt`} data-code={a.code}
      onMouseEnter={() => setHi(idx)} onClick={() => pick(a)}
      className={`w-full text-start px-3 py-1.5 text-sm flex items-center gap-2 border-t border-slate-800 first:border-t-0 ${hi === idx ? "bg-blue-600/25" : "hover:bg-slate-800"} ${a.is_active ? "" : "opacity-50"}`}>
      {a.is_group ? <Layers size={13} className="text-blue-400/80 shrink-0" /> : <span className="w-[13px] shrink-0" />}
      <span className="font-mono text-xs text-slate-400 shrink-0 w-14" dir="ltr">{splitHighlight(a.code, tokens).map((p, i) => (p.hit ? <mark key={i} className="bg-amber-400/30 text-inherit rounded">{p.s}</mark> : <span key={i}>{p.s}</span>))}</span>
      <span className={`truncate ${a.is_group ? "font-bold text-white" : "text-slate-200"}`}>{splitHighlight(nameOf(a), tokens).map((p, i) => (p.hit ? <mark key={i} className="bg-amber-400/30 text-inherit rounded">{p.s}</mark> : <span key={i}>{p.s}</span>))}</span>
      {a.is_group && <span className="ms-auto text-[9px] px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-300 shrink-0">{t("Group · aggregates children", "رئيسي · يجمع فروعه")}</span>}
    </button>
  );

  return (
    <div ref={wrapRef} className="relative" data-testid={`${testId}-combo`}>
      <div className="relative">
        <Search size={15} className="absolute top-1/2 -translate-y-1/2 start-3 text-slate-500 pointer-events-none" />
        <input ref={ref} value={open ? q : selected ? `${selected.code} — ${nameOf(selected)}` : q} data-testid={`${testId}-input`}
          onFocus={() => { setOpen(true); setQ(""); }} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onKeyDown={onKey}
          placeholder={placeholder ?? t("Search account by code or name…", "ابحث عن حساب بالكود أو الاسم…")} className={`${INPUT} ps-9 pe-14`} role="combobox" aria-expanded={open} />
        <span className="absolute top-1/2 -translate-y-1/2 end-2 flex items-center gap-1 text-slate-500">
          {selected && <button type="button" aria-label={t("Clear", "مسح")} data-testid={`${testId}-clear`} onMouseDown={(e) => e.preventDefault()} onClick={() => { onChange(null); setQ(""); }} className="hover:text-white"><X size={14} /></button>}
          <ChevronDown size={14} />
        </span>
      </div>
      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[320px] rounded-xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden" data-testid={`${testId}-list`}>
          <div ref={listRef} className="max-h-72 overflow-auto" role="listbox">
            {items.recent.length > 0 && <div className="px-3 py-1 text-[10px] font-bold text-slate-500 bg-slate-800/60">{t("Recent", "الأحدث استخدامًا")}</div>}
            {items.recent.map((a, i) => <Row key={`r${a.id}`} a={a} idx={i} />)}
            {items.recent.length > 0 && items.rest.length > 0 && <div className="px-3 py-1 text-[10px] font-bold text-slate-500 bg-slate-800/60">{t("All accounts", "كل الحسابات")}</div>}
            {items.rest.map((a, i) => <Row key={a.id} a={a} idx={items.recent.length + i} />)}
            {flat.length === 0 && <div className="px-3 py-5 text-center text-sm text-slate-500" data-testid={`${testId}-none`}>{t("No matching accounts", "لا توجد حسابات مطابقة")}</div>}
          </div>
          {items.total > MAX_SHOWN && <div className="px-3 py-1 text-[10px] text-slate-500 bg-slate-800/60">{t(`Showing ${MAX_SHOWN} of ${items.total} — refine your search`, `يُعرض ${MAX_SHOWN} من ${items.total} — حدّد البحث أكثر`)}</div>}
        </div>
      )}
    </div>
  );
}
