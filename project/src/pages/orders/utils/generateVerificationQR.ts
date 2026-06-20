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
  const baseUrl =
    import.meta.env.VITE_APP_URL ||
    "https://mihwarb2b.com";

  return `${baseUrl}/verify/${orderId}`;
}