// =============================================================
// src/pages/orders/utils/generateVerificationQR.ts
// Centralized QR URL generator. Abstracts the external QR service
// so a local generator can be swapped in without touching call sites.
// =============================================================

export function generateVerificationQR(verifyUrl: string): string {
    return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&ecc=H&data=${encodeURIComponent(verifyUrl)}&color=1E3A5F&bgcolor=ffffff&qzone=3&margin=0`;
  }
  
  export function buildVerifyUrl(orderId: number): string {
    return `${window.location.origin}/verify/${orderId}`;
  }
  