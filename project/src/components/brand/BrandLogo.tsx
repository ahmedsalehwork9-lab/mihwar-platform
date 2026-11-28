// =============================================================
// MIHWAR CLOUD ERP — official brand components (Abstract Axis, Concept 03).
// BrandMark: symbol only. BrandLogo: symbol + wordmark. BrandSplash: full-screen loader.
// Colours come from the brand tokens in tailwind.config.js / index.css.
// =============================================================
import { useId } from "react";
import { BARS, MARK_VIEWBOX, ORBIT } from "./markPaths";

export const BRAND = { navy: "#0B1F44", blue: "#007BFF", cyan: "#00C2FF", gray: "#E6E8ED", white: "#FFFFFF" } as const;

type MarkProps = { size?: number; onDark?: boolean; mono?: boolean; className?: string; title?: string };

export function BrandMark({ size = 32, onDark = false, mono = false, className, title = "MIHWAR CLOUD ERP" }: MarkProps) {
  const uid = useId().replace(/:/g, "");
  const w = size; const h = Math.round((size * 340) / 500);
  const mc = mono ? (onDark ? BRAND.white : BRAND.navy) : null;
  return (
    <svg width={w} height={h} viewBox={MARK_VIEWBOX} role="img" aria-label={title} className={className} xmlns="http://www.w3.org/2000/svg">
      <title>{title}</title>
      {!mono && (
        <defs>
          <linearGradient id={`${uid}a`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={BRAND.cyan} /><stop offset="1" stopColor={BRAND.blue} /></linearGradient>
          <linearGradient id={`${uid}b`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={BRAND.blue} /><stop offset="1" stopColor={onDark ? "#1747A6" : BRAND.navy} /></linearGradient>
          <linearGradient id={`${uid}o`} x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor={BRAND.cyan} /><stop offset=".55" stopColor={onDark ? "#9FD8FF" : BRAND.navy} /><stop offset="1" stopColor={onDark ? BRAND.gray : BRAND.navy} /></linearGradient>
        </defs>
      )}
      <path d={BARS.left} fill={mc ?? `url(#${uid}a)`} />
      <path d={BARS.mid} fill={mc ?? `url(#${uid}a)`} />
      <path d={ORBIT} fill={mc ?? `url(#${uid}o)`} />
      <path d={BARS.tall} fill={mc ?? `url(#${uid}b)`} />
    </svg>
  );
}

type LogoProps = { size?: number; onDark?: boolean; mono?: boolean; stacked?: boolean; showSub?: boolean; className?: string };

/** Symbol + wordmark. `size` = symbol width in px. The wordmark is always Latin (brand name), so it keeps dir="ltr" in RTL pages. */
export function BrandLogo({ size = 40, onDark = false, mono = false, stacked = false, showSub = true, className = "" }: LogoProps) {
  const ink = onDark ? "text-[#ffffff]" : "text-brand-navy"; const accent = mono ? ink : "text-brand-blue";
  return (
    <div dir="ltr" className={`inline-flex ${stacked ? "flex-col items-center text-center" : "items-center"} gap-${stacked ? 2 : 3} ${className}`} data-testid="brand-logo">
      <BrandMark size={size} onDark={onDark} mono={mono} />
      <div className="leading-none font-brand">
        <div className={`font-extrabold tracking-tight ${ink}`} style={{ fontSize: Math.max(11, size * 0.4) }}>MIHWAR CLOUD</div>
        {showSub && (
          <div className={`flex items-center ${stacked ? "justify-center" : ""} gap-1.5 mt-1 font-bold ${accent}`} style={{ fontSize: Math.max(9, size * 0.26), letterSpacing: "0.32em" }}>
            <span className="h-px w-3 bg-current opacity-70" />ERP<span className="h-px w-3 bg-current opacity-70" />
          </div>
        )}
      </div>
    </div>
  );
}

/** Full-screen branded loader (replaces the plain spinners). */
export function BrandSplash({ label }: { label?: string }) {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center" role="status" aria-live="polite" data-testid="brand-splash">
      <div className="flex flex-col items-center gap-5">
        <div className="animate-pulse"><BrandMark size={84} onDark /></div>
        <div dir="ltr" className="text-center leading-none font-brand" data-testid="brand-splash-name">
          <div className="font-extrabold tracking-tight text-white text-xl">MIHWAR CLOUD</div>
          <div className="mt-1.5 font-bold text-brand-blue text-[11px]" style={{ letterSpacing: "0.32em" }}>ERP</div>
        </div>
        <div className="h-1 w-28 rounded-full bg-slate-800 overflow-hidden"><div className="h-full w-1/2 rounded-full bg-brand-cyan animate-[brandbar_1.1s_ease-in-out_infinite]" /></div>
        {label && <div className="text-xs text-slate-400">{label}</div>}
      </div>
    </div>
  );
}
