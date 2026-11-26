// src/pages/accounting/treasury/print.ts — printable HTML (statement / voucher). All DB text is escaped.
import { fmt } from "./ui";

export const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

export function openPrint(opts: { title: string; rtl: boolean; body: string }): boolean {
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.write(`<!doctype html><html dir="${opts.rtl ? "rtl" : "ltr"}"><head><meta charset="utf-8"><title>${esc(opts.title)}</title>
<style>
 body{font-family:Tahoma,Arial,sans-serif;color:#111827;margin:24px;font-size:12px}
 h1{font-size:18px;margin:0 0 4px} .muted{color:#6b7280;font-size:11px}
 table{width:100%;border-collapse:collapse;margin-top:12px}
 th{background:#0f172a;color:#fff;padding:6px 8px;text-align:${opts.rtl ? "right" : "left"};font-size:11px}
 td{border-bottom:1px solid #e5e7eb;padding:5px 8px;vertical-align:top}
 .n{direction:ltr;text-align:${opts.rtl ? "left" : "right"};font-variant-numeric:tabular-nums;white-space:nowrap}
 .sum{display:flex;gap:12px;margin:12px 0;flex-wrap:wrap} .sum div{border:1px solid #e5e7eb;border-radius:8px;padding:8px 12px;min-width:130px}
 .sum b{display:block;font-size:14px;direction:ltr}
 @media print{body{margin:10mm}}
</style></head><body>${opts.body}<script>window.onload=function(){setTimeout(function(){window.print()},250)}</script></body></html>`);
  w.document.close();
  return true;
}

export type StatementRow = { date: string; ref: string; desc: string; counter: string; receipt: number; payment: number; balance: number };

export function statementHtml(a: {
  rtl: boolean; org: string; shop?: string | null; tax?: string | null; account: string; code?: string; from: string; to: string;
  opening: number; closing: number; totalIn: number; totalOut: number; rows: StatementRow[]; generated: string;
  L: { title: string; account: string; period: string; opening: string; closing: string; totalIn: string; totalOut: string; date: string; ref: string; desc: string; counter: string; receipt: string; payment: string; balance: string; note: string; generated: string };
}): string {
  return `<h1>${esc(a.L.title)}</h1>
<div class="muted">${esc(a.shop || a.org)}${a.tax ? ` · ${esc(a.tax)}` : ""}</div>
<div style="margin-top:8px"><b>${esc(a.L.account)}:</b> ${esc(a.account)}${a.code ? ` (${esc(a.code)})` : ""} &nbsp; <b>${esc(a.L.period)}:</b> <span dir="ltr">${esc(a.from)} → ${esc(a.to)}</span></div>
<div class="sum"><div>${esc(a.L.opening)}<b>${fmt(a.opening)}</b></div><div>${esc(a.L.totalIn)}<b>${fmt(a.totalIn)}</b></div><div>${esc(a.L.totalOut)}<b>${fmt(a.totalOut)}</b></div><div>${esc(a.L.closing)}<b>${fmt(a.closing)}</b></div></div>
<table><thead><tr><th>${esc(a.L.date)}</th><th>${esc(a.L.ref)}</th><th>${esc(a.L.desc)}</th><th>${esc(a.L.counter)}</th><th>${esc(a.L.receipt)}</th><th>${esc(a.L.payment)}</th><th>${esc(a.L.balance)}</th></tr></thead><tbody>
${a.rows.map((r) => `<tr><td class="n">${esc(r.date)}</td><td class="n">${esc(r.ref)}</td><td>${esc(r.desc)}</td><td>${esc(r.counter)}</td><td class="n">${r.receipt ? fmt(r.receipt) : "-"}</td><td class="n">${r.payment ? fmt(r.payment) : "-"}</td><td class="n">${fmt(r.balance)}</td></tr>`).join("")}
</tbody></table><p class="muted">${esc(a.L.note)} · ${esc(a.L.generated)}: ${esc(a.generated)}</p>`;
}
