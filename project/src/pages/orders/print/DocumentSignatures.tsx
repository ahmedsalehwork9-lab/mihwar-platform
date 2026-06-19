// =============================================================
// src/pages/orders/print/DocumentSignatures.tsx
//
// Shared signature-block HTML builder used by both the Purchase
// and Transfer print templates. Exports plain string builders
// (not React components) because this markup is injected into a
// raw print window via document.write, not rendered by React.
// =============================================================

export type SignatureBlock = [primary: string, secondary: string];

export const PURCHASE_SIGS_AR: SignatureBlock[] = [
  ["إعداد الطلب", "Prepared By"],
  ["اعتماد الإدارة", "Approved By"],
  ["توقيع المورد", "Supplier Signature"],
  ["توقيع المشتري", "Buyer Signature"],
];

export const PURCHASE_SIGS_EN: SignatureBlock[] = [
  ["Prepared By", "إعداد الطلب"],
  ["Approved By", "اعتماد الإدارة"],
  ["Supplier Signature", "توقيع المورد"],
  ["Buyer Signature", "توقيع المشتري"],
];

export const TRANSFER_SIGS_AR: SignatureBlock[] = [
  ["مدير الفرع المرسل", "Sending Branch Mgr"],
  ["مدير الفرع المستلم", "Receiving Branch Mgr"],
  ["اعتماد الإدارة", "Approved By"],
];

export const TRANSFER_SIGS_EN: SignatureBlock[] = [
  ["Sending Branch Mgr", "مدير الفرع المرسل"],
  ["Receiving Branch Mgr", "مدير الفرع المستلم"],
  ["Approved By", "اعتماد الإدارة"],
];

/** Builds the blue-themed signature grid used in the Purchase Order print template. */
export function buildPurchaseSignatureGrid(blocks: SignatureBlock[]): string {
  return `
  <div style="flex:1;display:grid;grid-template-columns:repeat(${blocks.length},1fr);gap:10px;">
    ${blocks.map(([primary, secondary]) => `
    <div style="border:1.5px solid #CBD5E1;border-radius:10px;overflow:hidden;display:flex;flex-direction:column;">
      <div style="background:#1E40AF;padding:9px 10px;text-align:center;"><span style="font-size:11px;font-weight:700;color:#fff;display:block;">${primary}</span><span style="font-size:8px;font-weight:500;color:#93C5FD;display:block;margin-top:2px;">${secondary}</span></div>
      <div style="flex:1;background:#fff;padding:11px 12px;display:flex;flex-direction:column;gap:9px;">
        <div><span style="font-size:7.5px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;color:#94A3B8;display:block;margin-bottom:2px;">Name</span><div style="border-bottom:1px solid #CBD5E1;height:22px;"></div></div>
        <div><span style="font-size:7.5px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;color:#94A3B8;display:block;margin-bottom:2px;">Signature</span><div style="border-bottom:1px solid #CBD5E1;height:34px;"></div></div>
        <div><span style="font-size:7.5px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;color:#94A3B8;display:block;margin-bottom:2px;">Date</span><div style="border-bottom:1px solid #CBD5E1;height:22px;"></div></div>
      </div>
    </div>`).join("")}
  </div>`;
}

/** Builds the orange-themed signature grid used in the Transfer Order print template. */
export function buildTransferSignatureGrid(blocks: SignatureBlock[]): string {
  return `
  <div style="flex:1;display:grid;grid-template-columns:repeat(${blocks.length},1fr);gap:10px;">
    ${blocks.map(([primary, secondary]) => `
    <div style="border:1.5px solid #FED7AA;border-radius:10px;overflow:hidden;display:flex;flex-direction:column;">
      <div style="background:linear-gradient(135deg,#7C2D12,#C2410C);padding:9px 10px;text-align:center;"><span style="font-size:11px;font-weight:700;color:#fff;display:block;">${primary}</span><span style="font-size:8px;font-weight:500;color:#FED7AA;display:block;margin-top:2px;">${secondary}</span></div>
      <div style="flex:1;background:#fff;padding:11px 12px;display:flex;flex-direction:column;gap:9px;">
        <div><span style="font-size:7.5px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;color:#D97706;display:block;margin-bottom:2px;">Name</span><div style="border-bottom:1px solid #FED7AA;height:22px;"></div></div>
        <div><span style="font-size:7.5px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;color:#D97706;display:block;margin-bottom:2px;">Signature</span><div style="border-bottom:1px solid #FED7AA;height:34px;"></div></div>
        <div><span style="font-size:7.5px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;color:#D97706;display:block;margin-bottom:2px;">Date</span><div style="border-bottom:1px solid #FED7AA;height:22px;"></div></div>
      </div>
    </div>`).join("")}
  </div>`;
}
