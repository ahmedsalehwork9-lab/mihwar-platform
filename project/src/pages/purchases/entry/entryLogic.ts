// =============================================================
// src/pages/purchases/entry/entryLogic.ts
// منطق إدخال فاتورة الشراء (نقي): الأسطر، التحقق، دمج الصنف المكرر، تغيّر التكلفة،
// الاستحقاق السريع، تكرار رقم فاتورة المورد، والمسودة المحلية.
// =============================================================
export type Kind = "inventory" | "expense" | "asset";
export type FLine = { key: number; product_id: number | null; code: string; description: string; qty: string; unit_cost: string; cur_cost: number | null; stock: number | null };
export type PickedProduct = { id: number; product_code: string | null; product_name: string; price: number; quantity: number };
export type OutItem = { product_id: number | null; description: string; qty: number; unit_cost: number; line_total: number };
export type LineErr = "no_product" | "no_desc" | "bad_qty" | "bad_cost";

export const r2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;
export const r3 = (n: number): number => Math.round((Number(n) || 0) * 1000) / 1000;
let seq = 1;
export const emptyLine = (): FLine => ({ key: seq++, product_id: null, code: "", description: "", qty: "1", unit_cost: "", cur_cost: null, stock: null });
export const bumpKey = (n: number): void => { if (n >= seq) seq = n + 1; };

/** يقبل الأرقام العربية والفاصلة العربية؛ null إن لم يكن رقمًا. */
export function num(s: string): number | null {
  const t = (s ?? "").trim().replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[٫,]/g, ".");
  if (t === "" || !/^-?\d*\.?\d+$/.test(t)) return null; const n = Number(t); return Number.isFinite(n) ? n : null;
}
/** سطر فارغ تمامًا (لا صنف ولا وصف ولا تكلفة) — يُتجاهل ولا يُعدّ خطأ. */
export const isBlank = (l: FLine): boolean => l.product_id == null && l.description.trim() === "" && l.unit_cost.trim() === "";

export function lineErrors(l: FLine, kind: Kind): LineErr[] {
  if (isBlank(l)) return [];
  const e: LineErr[] = [];
  if (kind === "inventory" ? l.product_id == null : l.description.trim() === "") e.push(kind === "inventory" ? "no_product" : "no_desc");
  const q = num(l.qty), c = num(l.unit_cost);
  if (q == null || q <= 0) e.push("bad_qty"); if (c == null || c <= 0) e.push("bad_cost");
  return e;
}
export function validateLines(lines: FLine[], kind: Kind): { items: OutItem[]; errors: { key: number; errs: LineErr[] }[] } {
  const items: OutItem[] = []; const errors: { key: number; errs: LineErr[] }[] = [];
  for (const l of lines) {
    const errs = lineErrors(l, kind); if (errs.length) { errors.push({ key: l.key, errs }); continue; } if (isBlank(l)) continue;
    const qty = r3(num(l.qty) as number), uc = num(l.unit_cost) as number;
    items.push({ product_id: kind === "inventory" ? l.product_id : l.product_id, description: l.description.trim(), qty, unit_cost: uc, line_total: r2(qty * uc) });
  }
  return { items, errors };
}

/** تغيّر تكلفة الإدخال عن تكلفة الصنف الحالية (نسبة%)؛ المقارنة بدون الضريبة إن كانت الفاتورة شاملة. */
export function costDelta(unitCost: string, cur: number | null, inclusive: boolean, ratePct: number): number | null {
  const c = num(unitCost); if (c == null || c <= 0 || cur == null || cur <= 0) return null;
  const net = inclusive ? c / (1 + (ratePct || 0) / 100) : c; const d = r2(((net - cur) / cur) * 100); return d === 0 ? 0 : d;
}

/** إضافة صنف: إن وُجد في الأسطر تُزاد كميته؛ وإلا يملأ أول سطر فارغ أو يُضاف سطر جديد. */
export function addProduct(lines: FLine[], p: PickedProduct, addQty = 1): { lines: FLine[]; index: number; merged: boolean } {
  const ex = lines.findIndex((l) => l.product_id === p.id);
  if (ex >= 0) { const q = (num(lines[ex].qty) ?? 0) + addQty; return { lines: lines.map((l, i) => (i === ex ? { ...l, qty: String(r3(q)) } : l)), index: ex, merged: true }; }
  const fill: FLine = { key: 0, product_id: p.id, code: p.product_code ?? "", description: p.product_name, qty: String(addQty), unit_cost: p.price > 0 ? String(p.price) : "", cur_cost: p.price > 0 ? p.price : null, stock: p.quantity };
  const bi = lines.findIndex(isBlank);
  if (bi >= 0) return { lines: lines.map((l, i) => (i === bi ? { ...fill, key: l.key } : l)), index: bi, merged: false };
  return { lines: [...lines, { ...fill, key: seq++ }], index: lines.length, merged: false };
}

const pad = (n: number): string => String(n).padStart(2, "0");
export const ymd = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const addDays = (d: string, n: number): string => { const x = new Date(d + "T00:00:00"); x.setDate(x.getDate() + n); return ymd(x); };
export const endOfMonth = (d: string): string => { const x = new Date(d + "T00:00:00"); return ymd(new Date(x.getFullYear(), x.getMonth() + 1, 0)); };

export type DupInv = { id: number; invoice_no: number; invoice_year: number; supplier_invoice_no: string | null; supplier_name: string | null; date: string };
/** فواتير سابقة بنفس رقم فاتورة المورد (تطابق مقصوص وغير حساس للحالة) ومن نفس المورد إن عُرف الاسم. */
export function duplicates(existing: DupInv[], supplierInvNo: string, supplierName: string | null): DupInv[] {
  const n = supplierInvNo.trim().toLowerCase(); if (!n) return [];
  const s = (supplierName ?? "").trim().toLowerCase();
  return existing.filter((x) => (x.supplier_invoice_no ?? "").trim().toLowerCase() === n && (s === "" || (x.supplier_name ?? "").trim().toLowerCase() === s || (x.supplier_name ?? "") === ""));
}

// ── المسودة ──
export type EntryDraft = { v: 1; savedAt: string; date: string; kind: Kind; pay: string; supplierAcc: number | ""; supplierName: string; supplierInvNo: string; rate: string; inclusive: boolean; paid: string; due: string; notes: string; lines: FLine[] };
export const draftKey = (orgId: number, shopId: number | null): string => `mihwar.purchase.draft.v1:${orgId}:${shopId ?? 0}`;
export function validDraft(x: unknown): x is EntryDraft {
  const d = x as EntryDraft; return !!d && d.v === 1 && Array.isArray(d.lines) && typeof d.date === "string" && ["inventory", "expense", "asset"].includes(d.kind)
    && d.lines.every((l) => l && typeof l.key === "number" && typeof l.qty === "string" && typeof l.unit_cost === "string" && typeof l.description === "string");
}
/** المسودة تستحق الحفظ فقط إن فيها شيء غير فارغ. */
export const draftHasContent = (d: EntryDraft): boolean => d.lines.some((l) => !isBlank(l)) || d.supplierInvNo.trim() !== "" || d.notes.trim() !== "" || d.supplierAcc !== "";
export function loadDraft(st: Pick<Storage, "getItem"> | null, key: string): EntryDraft | null {
  try { const raw = st?.getItem(key); if (!raw) return null; const d = JSON.parse(raw); return validDraft(d) ? d : null; } catch { return null; }
}
export function saveDraft(st: Pick<Storage, "setItem" | "removeItem"> | null, key: string, d: EntryDraft): boolean {
  try { if (!st) return false; if (!draftHasContent(d)) { st.removeItem(key); return false; } st.setItem(key, JSON.stringify(d)); return true; } catch { return false; }
}
export function clearDraft(st: Pick<Storage, "removeItem"> | null, key: string): void { try { st?.removeItem(key); } catch { /* */ } }
