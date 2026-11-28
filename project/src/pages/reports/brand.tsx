// =============================================================
// src/pages/reports/brand.tsx
// نظام هوية مركزي قابل للتهيئة — لم يُعتمد اسم/شعار المنتج النهائي بعد.
// غيّر القيم هنا فقط ليتغيّر الاسم/الشعار/الألوان في كل صفحات التقارير.
// شعار محايد مؤقت (SVG) — لا اسم منتج نهائي، ولا شعار شركة أخرى.
// =============================================================

import { tNow } from "../../context/LanguageContext";

export type BrandConfig = {
  productName: string;      // اسم المنتج (محايد/مؤقت)
  productNameEn: string;
  tagline: string;
  taglineEn: string;
  colors: {
    primary: string; positive: string; analytic: string;
    warning: string; negative: string; surface: string; bg: string;
  };
};

// Placeholder محايد — يُستبدل لاحقًا عند اعتماد الهوية النهائية، من مكان واحد.
export const BRAND: BrandConfig = {
  productName: "مِحور كلاود ERP",
  productNameEn: "MIHWAR CLOUD ERP",
  tagline: "لوحات وتقارير مؤسسية",
  taglineEn: "Enterprise dashboards & reports",
  colors: {
    primary: "#007BFF", positive: "#10b981", analytic: "#a855f7",
    warning: "#f59e0b", negative: "#ef4444", surface: "#0B1F44", bg: "#06122B",
  },
};

// شعار محايد مؤقت (أعمدة بيانية) — عنصر واحد يُستبدل عند اعتماد الهوية.
export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <span
      style={{ width: size, height: size }}
      className="inline-flex items-center justify-center rounded-xl bg-gradient-to-br from-blue-500/30 to-blue-600/5 border border-blue-500/30 text-blue-300 shrink-0"
      aria-label="placeholder logo"
      title={tNow("Temporary logo — replaced when the identity is approved", "شعار مؤقت — يُستبدل عند اعتماد الهوية")}
    >
      <svg width={size * 0.56} height={size * 0.56} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="12" width="4" height="8" rx="1" />
        <rect x="10" y="7" width="4" height="13" rx="1" />
        <rect x="17" y="3" width="4" height="17" rx="1" />
      </svg>
    </span>
  );
}
