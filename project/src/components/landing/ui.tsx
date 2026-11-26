// مكوّنات واجهة مشتركة لصفحة الهبوط (ألوان الهوية بصيغة hex صريحة كي لا يغيّرها theme.css)
import { ReactNode } from "react";
import { Calculator, ShoppingCart, ShoppingBag, Boxes, Building2, ScanBarcode, BarChart3, Bell, Printer, Wallet, Tag, Settings, Users, Globe, Cloud, Layers, ShieldCheck, Check } from "lucide-react";
import type { IconName } from "./landingContent";

const ICONS: Record<IconName, typeof Calculator> = { calc: Calculator, cart: ShoppingCart, bag: ShoppingBag, box: Boxes, branch: Building2, pos: ScanBarcode, chart: BarChart3, bell: Bell, print: Printer, wallet: Wallet, tag: Tag, settings: Settings, users: Users, globe: Globe, cloud: Cloud, layers: Layers, shield: ShieldCheck };
export function Ico({ name, size = 22, className = "" }: { name: IconName; size?: number; className?: string }) {
  const I = ICONS[name]; return <I size={size} className={className} aria-hidden="true" />;
}
export function IconTile({ name, dark = false }: { name: IconName; dark?: boolean }) {
  return (
    <span className={`inline-flex h-12 w-12 items-center justify-center rounded-xl ${dark ? "bg-[#ffffff1a] text-[#00C2FF]" : "bg-[#007BFF14] text-[#007BFF]"}`}>
      <Ico name={name} />
    </span>
  );
}
export function Section({ id, children, tone = "white", className = "" }: { id?: string; children: ReactNode; tone?: "white" | "gray" | "navy"; className?: string }) {
  const bg = tone === "navy" ? "bg-[#0B1F44]" : tone === "gray" ? "bg-[#F4F6FA]" : "bg-[#ffffff]";
  return <section id={id} className={`${bg} scroll-mt-16 py-16 sm:py-24 ${className}`}><div className="mx-auto max-w-7xl px-4 sm:px-6">{children}</div></section>;
}
export function Heading({ eyebrow, title, sub, dark = false, center = true }: { eyebrow?: string; title: string; sub?: string; dark?: boolean; center?: boolean }) {
  return (
    <div className={`mb-12 max-w-3xl ${center ? "mx-auto text-center" : ""}`}>
      {eyebrow && <div className="mb-3 text-sm font-bold tracking-wide text-[#007BFF]">{eyebrow}</div>}
      <h2 className={`text-3xl font-extrabold leading-tight sm:text-4xl ${dark ? "text-[#ffffff]" : "text-[#0B1F44]"}`}>{title}</h2>
      {sub && <p className={`mt-4 text-base leading-relaxed sm:text-lg ${dark ? "text-[#c9d6ee]" : "text-[#4b5b78]"}`}>{sub}</p>}
    </div>
  );
}
export function CheckList({ items, dark = false }: { items: string[]; dark?: boolean }) {
  return (
    <ul className="space-y-3">
      {items.map((x) => (
        <li key={x} className={`flex items-start gap-3 text-base ${dark ? "text-[#e6ecf8]" : "text-[#1d2f55]"}`}>
          <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#007BFF] text-[#ffffff]"><Check size={13} strokeWidth={3} /></span>
          <span>{x}</span>
        </li>
      ))}
    </ul>
  );
}
export function BrowserFrame({ src, alt, className = "", eager = false }: { src: string; alt: string; className?: string; eager?: boolean }) {
  return (
    <div className={`overflow-hidden rounded-2xl border border-[#E6E8ED] bg-[#ffffff] shadow-[0_30px_80px_-20px_rgba(11,31,68,0.45)] ${className}`}>
      <div className="flex items-center gap-1.5 border-b border-[#E6E8ED] bg-[#F4F6FA] px-4 py-2.5" dir="ltr">
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff6b6b]" /><span className="h-2.5 w-2.5 rounded-full bg-[#ffc947]" /><span className="h-2.5 w-2.5 rounded-full bg-[#3ddc97]" />
        <span className="ms-3 truncate rounded-md bg-[#ffffff] px-3 py-0.5 text-[11px] text-[#6b7a99]">app.mihwar.cloud</span>
      </div>
      <img src={src} alt={alt} loading={eager ? "eager" : "lazy"} decoding="async" className="block h-auto w-full" />
    </div>
  );
}
export const btnPrimary = "inline-flex items-center justify-center gap-2 rounded-xl bg-[#007BFF] px-6 py-3.5 text-base font-bold text-[#ffffff] shadow-lg shadow-[#007BFF]/30 transition hover:bg-[#0062CC] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00C2FF]";
export const btnGhostDark = "inline-flex items-center justify-center gap-2 rounded-xl border border-[#ffffff40] bg-[#ffffff0d] px-6 py-3.5 text-base font-bold text-[#ffffff] transition hover:bg-[#ffffff1f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00C2FF]";
