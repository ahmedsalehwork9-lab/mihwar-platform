// =============================================================
// src/pages/orders/print/DocumentVerificationCard.tsx
//
// Shared QR verification card HTML builder used by both print
// templates. Exports plain string builders (not React components)
// since this markup is injected via document.write in the print
// preview window, not rendered by React.
// =============================================================

import { generateVerificationQR } from "../utils/generateVerificationQR";

export type VerificationCardLabels = {
  title: string;
  subtitle: string;
  scanPrompt: string;
  verifiedTag: string;
};

/** Blue-themed QR verification card for the Purchase Order print template. */
export function buildPurchaseVerificationCard(
  docNumber: string,
  verifyUrl: string,
  labels: VerificationCardLabels
): string {
  const qrUrl = generateVerificationQR(verifyUrl);
  return `
  <div style="width:200px;flex-shrink:0;border:1.5px solid #CBD5E1;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(30,58,95,0.08);">
    <div style="background:#1E40AF;padding:10px 12px;"><span style="font-size:12px;font-weight:700;color:#fff;display:block;text-align:center;">${labels.title}</span><span style="font-size:8px;font-weight:500;color:#93C5FD;display:block;text-align:center;margin-top:2px;">${labels.subtitle}</span></div>
    <div style="background:#F8FAFC;padding:14px 12px;display:flex;flex-direction:column;align-items:center;">
      <div style="background:#fff;border:2px solid #E2E8F0;border-radius:12px;padding:8px;box-shadow:0 1px 4px rgba(0,0,0,0.08);"><img src="${qrUrl}" alt="QR" style="width:156px;height:156px;display:block;"/></div>
      <span style="display:block;margin-top:8px;font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:700;color:#1E3A5F;text-align:center;">${docNumber}</span>
      <span style="display:block;margin-top:4px;font-size:8.5px;color:#475569;line-height:1.5;text-align:center;">${labels.scanPrompt}</span>
      <span style="display:block;margin-top:3px;font-size:8px;color:#10B981;font-weight:700;text-align:center;">${labels.verifiedTag}</span>
      <span style="display:block;margin-top:6px;font-family:'JetBrains Mono',monospace;font-size:6.5px;color:#94A3B8;word-break:break-all;line-height:1.5;text-align:center;border-top:1px solid #E2E8F0;padding-top:5px;width:100%;">${verifyUrl}</span>
    </div>
  </div>`;
}

/** Orange-themed QR verification card for the Transfer Order print template. */
export function buildTransferVerificationCard(
  docNumber: string,
  verifyUrl: string,
  labels: VerificationCardLabels
): string {
  const qrUrl = generateVerificationQR(verifyUrl);
  return `
  <div style="width:200px;flex-shrink:0;border:1.5px solid #FED7AA;border-radius:12px;overflow:hidden;">
    <div style="background:linear-gradient(135deg,#7C2D12,#C2410C);padding:10px 12px;"><span style="font-size:12px;font-weight:700;color:#fff;display:block;text-align:center;">${labels.title}</span><span style="font-size:8px;font-weight:500;color:#FED7AA;display:block;text-align:center;margin-top:2px;">${labels.subtitle}</span></div>
    <div style="background:#FFF7ED;padding:14px 12px;display:flex;flex-direction:column;align-items:center;">
      <div style="background:#fff;border:2px solid #FED7AA;border-radius:12px;padding:8px;"><img src="${qrUrl}" alt="QR" style="width:156px;height:156px;display:block;"/></div>
      <span style="display:block;margin-top:8px;font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:700;color:#7C2D12;text-align:center;">${docNumber}</span>
      <span style="display:block;margin-top:4px;font-size:8.5px;color:#92400E;line-height:1.5;text-align:center;">${labels.scanPrompt}</span>
      <span style="display:block;margin-top:6px;font-family:'JetBrains Mono',monospace;font-size:6.5px;color:#D97706;word-break:break-all;line-height:1.5;text-align:center;border-top:1px solid #FED7AA;padding-top:5px;width:100%;">${verifyUrl}</span>
    </div>
  </div>`;
}
