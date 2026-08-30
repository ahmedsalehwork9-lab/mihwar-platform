// =============================================================
// src/pages/orders/utils/generateVerificationQR.ts
// =============================================================
 
export function generateVerificationQR(
  verifyUrl: string
): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&ecc=H&data=${encodeURIComponent(
    verifyUrl
  )}&color=1E3A5F&bgcolor=ffffff&qzone=3&margin=0`;
}
 
export function buildVerifyUrl(orderId: number): string {
  // ترتيب الأولوية:
  // 1) متغيّر البيئة VITE_APP_URL لو موجود (يُضبط في .env وعلى Vercel)
  // 2) نفس دومين الموقع الحالي تلقائيًا (يعمل على اللايف والمحلي)
  // 3) دومين الموقع الصحيح كحل أخير
  const baseUrl =
    import.meta.env.VITE_APP_URL ||
    (typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "https://mihwar-b2b.vercel.app");
 
  return `${baseUrl}/verify/${orderId}`;
}