// =============================================================
// src/pages/accounting/treasury/SmartSelect.tsx
// قائمة منسدلة ذكية قابلة لإعادة الاستخدام: بحث عربي/إنجليزي، ترتيب بالأهمية،
// تنقّل بلوحة المفاتيح، تمييز النص المطابق، دعم RTL/LTR، عرض تدريجي للنتائج.
// Reusable searchable dropdown (no external deps).
// =============================================================

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Search, X, ChevronDown, Check, Loader2 } from "lucide-react";
import { useLang } from "../../../context/LanguageContext";
import { scoreMatch, highlightParts } from "./searchUtils";

export type SelectOption = {
  value: string | number;
  label: string;
  labelAlt?: string[];          // other-language names / configured aliases only (never invented)
  code?: string;
  numbers?: string[];           // account number, IBAN…
  other?: string[];             // searchable only (bank, branch…)
  sublabel?: string;            // shown under the name
  badge?: { text: string; tone?: "emerald" | "blue" | "slate" | "amber" | "purple" };
  right?: string;               // e.g. current balance
  rightTone?: "pos" | "neg" | "muted";
  group?: string;               // group heading (options must be pre-sorted by group)
  disabled?: boolean;
};

const TONES: Record<string, string> = {
  emerald: "bg-emerald-500/15 text-emerald-400",
  blue: "bg-blue-500/15 text-blue-300",
  slate: "bg-slate-700/40 text-slate-300",
  amber: "bg-amber-500/15 text-amber-400",
  purple: "bg-purple-500/15 text-purple-300",
};

const PAGE = 40;

function Hl({ text, q }: { text: string; q: string }) {
  const parts = useMemo(() => highlightParts(text, q), [text, q]);
  return <>{parts.map((p, i) => p.hit ? <mark key={i} className="bg-blue-500/30 text-inherit rounded-sm px-px">{p.s}</mark> : <span key={i}>{p.s}</span>)}</>;
}

export default function SmartSelect({
  options, value, onChange, placeholder, searchPlaceholder, emptyText, loading = false,
  disabled = false, clearable = true, size = "md", ariaLabel,
}: {
  options: SelectOption[];
  value: string | number | "" | null | undefined;
  onChange: (v: string | number | "", opt?: SelectOption) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  loading?: boolean;
  disabled?: boolean;
  clearable?: boolean;
  size?: "sm" | "md";
  ariaLabel?: string;
}) {
  const { t, isRTL } = useLang();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");               // debounced query
  const [active, setActive] = useState(0);
  const [limit, setLimit] = useState(PAGE);
  const btnRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<{ top: number; bottom: number; left: number; width: number } | null>(null);

  const selected = useMemo(() => options.find((o) => String(o.value) === String(value ?? "")), [options, value]);

  useEffect(() => { const h = setTimeout(() => setDq(q), 120); return () => clearTimeout(h); }, [q]);

  const results = useMemo(() => {
    const seen = new Set<string>();
    const base = options.filter((o) => { const k = String(o.value); if (seen.has(k)) return false; seen.add(k); return true; });
    if (!dq.trim()) return base;
    return base
      .map((o, i) => ({ o, i, s: scoreMatch({ label: o.label, labelAlt: o.labelAlt, code: o.code, numbers: o.numbers, other: [...(o.other || []), o.sublabel || "", o.group || ""] }, dq) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || a.i - b.i)
      .map((x) => x.o);
  }, [options, dq]);

  useEffect(() => { setActive(0); setLimit(PAGE); }, [dq, open]);

  const openIt = () => {
    if (disabled) return;
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setRect({ top: r.bottom + 4, bottom: r.top - 4, left: r.left, width: r.width });
    setQ(""); setDq(""); setOpen(true);
  };
  const close = useCallback(() => { setOpen(false); btnRef.current?.focus(); }, []);
  const pick = (o: SelectOption) => { if (o.disabled) return; onChange(o.value, o); setOpen(false); };

  useEffect(() => {                              // keep the active row visible
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const onKey = (e: React.KeyboardEvent) => {
    const max = Math.min(results.length, limit) - 1;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => { const n = Math.min(a + 1, max); if (n >= limit - 3) setLimit((l) => l + PAGE); return n; }); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Home") { e.preventDefault(); setActive(0); }
    else if (e.key === "End") { e.preventDefault(); setActive(max); }
    else if (e.key === "Enter") { e.preventDefault(); const o = results[active]; if (o) pick(o); }
    else if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "Tab") setOpen(false);
  };

  const btnCls = (size === "sm" ? "px-2 py-1.5 text-xs rounded-lg" : "px-3 py-2 text-sm rounded-xl") +
    " w-full bg-slate-950 border border-slate-700 text-white outline-none focus:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/40 flex items-center gap-1.5 disabled:opacity-50 transition-colors";

  // open upward when there is little room below
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const up = !!rect && vh - rect.top < 300 && rect.bottom > 300;
  const shown = results.slice(0, limit);

  return (
    <>
      <button ref={btnRef} type="button" disabled={disabled} onClick={openIt} aria-haspopup="listbox" aria-expanded={open} aria-label={ariaLabel} className={btnCls}>
        <span className={`flex-1 truncate ${isRTL ? "text-right" : "text-left"} ${selected ? "" : "text-slate-500"}`}>
          {selected ? <>{selected.code ? <span className="font-mono text-slate-400 [direction:ltr] inline-block">{selected.code}</span> : null}{selected.code ? " · " : ""}{selected.label}</> : (placeholder ?? t("Select…", "اختر…"))}
        </span>
        {clearable && selected && !disabled && (
          <span role="button" tabIndex={-1} aria-label={t("Clear", "مسح")} onClick={(e) => { e.stopPropagation(); onChange(""); }} className="text-slate-500 hover:text-slate-200"><X size={13} /></span>
        )}
        <ChevronDown size={13} className="text-slate-500 shrink-0" />
      </button>

      {open && rect && (
        <div className="fixed inset-0 z-[95]" onMouseDown={() => setOpen(false)}>
          <div
            dir={isRTL ? "rtl" : "ltr"}
            role="presentation"
            onMouseDown={(e) => e.stopPropagation()}
            className="absolute bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden"
            style={{
              ...(up ? { bottom: vh - rect.bottom } : { top: rect.top }),
              left: Math.min(rect.left, Math.max(8, (typeof window !== "undefined" ? window.innerWidth : 1200) - Math.max(rect.width, 300) - 8)),
              width: Math.max(rect.width, 300), maxWidth: "94vw",
            }}
          >
            <div className="flex items-center gap-2 px-2.5 py-2 border-b border-slate-800">
              <Search size={14} className="text-slate-500 shrink-0" />
              <input
                autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey}
                role="combobox" aria-expanded="true" aria-controls="smartselect-list" aria-autocomplete="list"
                placeholder={searchPlaceholder ?? t("Search by name, code, number…", "ابحث بالاسم أو الرقم أو الرمز…")}
                className="flex-1 bg-transparent text-white text-xs outline-none placeholder:text-slate-600"
              />
              {loading && <Loader2 size={14} className="animate-spin text-slate-500" />}
              {q && <button type="button" onClick={() => setQ("")} aria-label={t("Clear search", "مسح البحث")} className="text-slate-500 hover:text-slate-200"><X size={13} /></button>}
            </div>
            <div id="smartselect-list" role="listbox" ref={listRef} className="max-h-64 overflow-y-auto py-1"
              onScroll={(e) => { const el = e.currentTarget; if (el.scrollTop + el.clientHeight >= el.scrollHeight - 40 && limit < results.length) setLimit((l) => l + PAGE); }}>
              {results.length === 0 ? (
                <div className="px-3 py-5 text-center text-slate-500 text-xs">{loading ? t("Loading…", "جارٍ التحميل…") : (emptyText ?? t("No matching results", "لا توجد نتائج مطابقة"))}</div>
              ) : shown.map((o, i) => {
                const isSel = String(o.value) === String(value ?? "");
                const showGroup = !!o.group && (i === 0 || shown[i - 1].group !== o.group);
                return (
                  <div key={String(o.value)}>
                    {showGroup && <div className="px-3 pt-2 pb-1 text-[9px] font-bold text-slate-500 uppercase tracking-wide">{o.group}</div>}
                    <button
                      type="button" role="option" aria-selected={isSel} data-idx={i} disabled={o.disabled}
                      onMouseEnter={() => setActive(i)} onClick={() => pick(o)}
                      className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs ${isRTL ? "text-right" : "text-left"} disabled:opacity-40 ${i === active ? "bg-slate-800" : ""} ${isSel ? "bg-blue-500/10" : ""}`}
                    >
                      {o.code && <span className="font-mono text-slate-400 [direction:ltr] shrink-0"><Hl text={o.code} q={dq} /></span>}
                      <span className="flex-1 min-w-0">
                        <span className="block text-slate-200 truncate"><Hl text={o.label} q={dq} /></span>
                        {o.sublabel && <span className="block text-[10px] text-slate-500 truncate"><Hl text={o.sublabel} q={dq} /></span>}
                      </span>
                      {o.badge && <span className={`text-[9px] px-1.5 py-0.5 rounded-full shrink-0 ${TONES[o.badge.tone || "slate"]}`}>{o.badge.text}</span>}
                      {o.right && <span className={`font-mono text-[11px] shrink-0 [direction:ltr] ${o.rightTone === "neg" ? "text-red-400" : o.rightTone === "pos" ? "text-emerald-400" : "text-slate-500"}`}>{o.right}</span>}
                      {isSel && <Check size={13} className="text-blue-400 shrink-0" />}
                    </button>
                  </div>
                );
              })}
              {results.length > limit && <button type="button" onClick={() => setLimit((l) => l + PAGE)} className="w-full py-2 text-[11px] text-blue-300 hover:bg-slate-800/60">{t(`Show more (${results.length - limit})`, `عرض المزيد (${results.length - limit})`)}</button>}
            </div>
            <div className="px-3 py-1.5 border-t border-slate-800 text-[9px] text-slate-500 flex items-center justify-between">
              <span>{results.length} {t("results", "نتيجة")}</span>
              <span className="hidden sm:inline">↑↓ · Enter · Esc</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
