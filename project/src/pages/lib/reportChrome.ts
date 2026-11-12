// =============================================================
// src/pages/lib/reportChrome.ts
// عناصر مشتركة لترويسة/فوتر تقارير محور:
//  • شعار الفرع (logo_url) في الترويسة
//  • رقم واتساب ثابت + كود QR (wa.me) في الفوتر للتواصل مع صاحب المنصة
// يتطلب مكتبة qrcode:  npm install qrcode @types/qrcode
// =============================================================

// رقم واتساب التواصل الثابت (يظهر في كل التقارير) — غيّره هنا فقط عند الحاجة
export const SUPPORT_WA = "966559301659";
export const SUPPORT_NAME = "ACC Ahmed Saleh";

// صندوق الشعار داخل ترويسة التقرير (يستخدم logo_url لو كان رابط صالح، وإلا حرف «م»)
export function logoBox(logoUrl?: string | null): string {
  const u = (logoUrl || "").trim();
  if (u && /^https?:\/\//i.test(u)) {
    return `<img src="${u}" alt="logo" style="width:150px;height:52px;border-radius:10px;object-fit:contain;background:#fff;padding:4px 8px;box-sizing:border-box;display:block;" />`;
  }
  return `<div style="width:42px;height:42px;border-radius:11px;background:rgba(52,211,153,0.12);border:1px solid rgba(52,211,153,0.4);color:#34d399;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:18px;">م</div>`;
}

// كتلة التواصل (الاسم + رقم + QR) التي تُدرَج داخل فوتر التقرير
export function contactFooter(whatsapp?: string | null, qrDataUrl?: string): string {
  const digits = (whatsapp || SUPPORT_WA || "").replace(/[^\d]/g, "");
  if (!digits) return "";
  return `<div style="display:flex;align-items:center;gap:10px;">
    ${qrDataUrl ? `<img src="${qrDataUrl}" alt="whatsapp" style="width:60px;height:60px;border-radius:6px;" />` : ""}
    <div style="text-align:right;">
      <div style="font-size:11px;color:#111827;font-weight:800;">${SUPPORT_NAME} — واتساب</div>
      <div style="font-size:13px;color:#15803d;font-weight:800;direction:ltr;">+${digits}</div>
      <div style="font-size:9px;color:#9ca3af;">امسح الكود للتواصل مباشرة</div>
    </div>
  </div>`;
}

// توليد كود QR لرابط واتساب كـ data URL (يُستدعى عند تحميل الصفحة)
export async function waQrDataUrl(whatsapp?: string | null): Promise<string> {
  const digits = (whatsapp || SUPPORT_WA || "").replace(/[^\d]/g, "");
  if (!digits) return "";
  try {
    const QRCode = (await import("qrcode")).default as any;
    return await QRCode.toDataURL("https://wa.me/" + digits, { margin: 1, width: 160, color: { dark: "#0f1b2b", light: "#ffffff" } });
  } catch (e) {
    console.error("waQrDataUrl failed", e);
    return "";
  }
}
