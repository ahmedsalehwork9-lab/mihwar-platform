// =============================================================
// src/pages/accounting/treasury/ui.tsx
// عناصر واجهة مشتركة لصفحة الخزن والبنوك: تنسيق أرقام/تواريخ، نافذة حوار، إشعارات.
// Shared UI helpers for the Cash & Banks page.
// =============================================================

import { useEffect, useRef, type ReactNode } from "react";
import { X, CheckCircle2, AlertTriangle, Info } from "lucide-react";
import { useLang } from "../../../context/LanguageContext";

export const fmt = (n: number) =>
  (Math.round((Number(n) || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const z = (n: number) => String(n).padStart(2, "0");
/** Local-calendar date (the existing UTC-based today() is a day behind for Saudi users between 00:00 and 03:00). */
export const localISO = (d = new Date()) => `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
export const todayLocal = () => localISO();
export const monthStartLocal = () => { const d = new Date(); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-01`; };
export const jv = (year: number | undefined, no: number | undefined) => `JV-${year ?? ""}-${String(no ?? 0).padStart(4, "0")}`;

export const CARD = "bg-slate-900 border border-slate-800 rounded-2xl";
export const INPUT = "w-full bg-slate-950 border border-slate-700 rounded-xl text-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/40 transition-colors disabled:opacity-50";
export const DATE_INPUT = INPUT + " [color-scheme:dark]";
export const LABEL = "text-[10px] text-slate-500 font-bold mb-1 block";
export const BTN_SOFT = "inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 hover:text-white font-bold text-xs transition-colors disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-blue-500/40 outline-none";
export const BTN_BLUE = "inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-[#fff] font-bold text-xs transition-colors disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-blue-400/50 outline-none";
export const BTN_GREEN = "inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-emerald-950 font-extrabold text-sm transition-colors disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-emerald-300/50 outline-none";
export const BTN_RED = "inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-[#fff] font-extrabold text-sm transition-colors disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-red-300/50 outline-none";

export function Field({ label, children, hint, className = "" }: { label: string; children: ReactNode; hint?: string; className?: string }) {
  return (
    <div className={className}>
      <label className={LABEL}>{label}</label>
      {children}
      {hint && <p className="text-[10px] text-slate-500 mt-1">{hint}</p>}
    </div>
  );
}

export function Modal({ title, icon, onClose, children, footer, wide = false }: { title: string; icon?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const { isRTL, t } = useLang();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !document.querySelector("[role=listbox]")) onClose(); };
    document.addEventListener("keydown", onKey);
    ref.current?.focus();
    return () => { document.removeEventListener("keydown", onKey); prev?.focus?.(); };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[90] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" dir={isRTL ? "rtl" : "ltr"} onMouseDown={onClose}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()}
        className={`bg-slate-900 border border-slate-700 rounded-t-2xl sm:rounded-2xl w-full ${wide ? "sm:max-w-5xl" : "sm:max-w-2xl"} max-h-[92vh] flex flex-col shadow-2xl outline-none`}>
        <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-slate-800 shrink-0">
          {icon && <span className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center">{icon}</span>}
          <h3 className="text-white font-bold text-base flex-1 min-w-0 truncate">{title}</h3>
          <button type="button" onClick={onClose} aria-label={t("Close", "إغلاق")} className="w-8 h-8 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center"><X size={16} /></button>
        </div>
        <div className="p-5 overflow-y-auto flex-1">{children}</div>
        {footer && <div className="px-5 py-3.5 border-t border-slate-800 flex items-center gap-2 flex-wrap shrink-0">{footer}</div>}
      </div>
    </div>
  );
}

export type Toast = { id: number; msg: string; tone: "ok" | "err" | "info" };
export function Toasts({ items, onDismiss }: { items: Toast[]; onDismiss: (id: number) => void }) {
  const { isRTL } = useLang();
  return (
    <div className={`fixed bottom-4 ${isRTL ? "left-4" : "right-4"} z-[120] space-y-2 max-w-[92vw] w-80`} aria-live="polite">
      {items.map((x) => (
        <div key={x.id} className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-xs shadow-xl bg-slate-900 ${x.tone === "ok" ? "border-emerald-500/40 text-emerald-300" : x.tone === "err" ? "border-red-500/40 text-red-300" : "border-blue-500/40 text-blue-300"}`}>
          {x.tone === "ok" ? <CheckCircle2 size={15} className="shrink-0 mt-px" /> : x.tone === "err" ? <AlertTriangle size={15} className="shrink-0 mt-px" /> : <Info size={15} className="shrink-0 mt-px" />}
          <span className="flex-1">{x.msg}</span>
          <button type="button" onClick={() => onDismiss(x.id)} className="opacity-60 hover:opacity-100"><X size={13} /></button>
        </div>
      ))}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-slate-800/70 ${className}`} />;
}
