// =============================================================
// src/pages/accounting/salesItems/salesItemsLogic.ts
// منطق نقي لتقرير «المبيعات بالأصناف» وتفاصيل تكلفة البضاعة المباعة: تسطيح بنود الفواتير والمرتجعات
// وحساب التكلفة (من unit_cost المسجّل في البند، وإلا من حركة المخزون sale_out) والربح والهامش.
// Pure logic: flatten invoice/return items into lines with cost, profit and margin.
// =============================================================
export type RawInvoice = {
  id: number; invoice_no: number; invoice_year: number; date: string; branch_id: number | null; customer_name: string | null;
  payment_type: string | null; items: unknown;
};
export type RawReturn = {
  id: number; return_no: number; return_year: number; date: string; branch_id: number | null; customer_name: string | null;
  original_invoice_id: number; items: unknown;
};
/** تكلفة الوحدة من حركات المخزون: مفتاح `${invoiceId}:${productId}` */
export type MoveCosts = Map<string, number>;

export type SaleLine = {
  kind: "sale" | "return"; docId: number; docNo: string; date: string; branchId: number | null; customer: string; payType: string | null;
  productId: number | null; code: string | null; name: string; qty: number; unitPrice: number; discount: number; net: number;
  unitCost: number | null; costSource: "item" | "move" | null; cost: number | null; profit: number | null; margin: number | null;
  /** سعر القائمة/البيع قبل الخصم (من البند أو من بطاقة الصنف) */ listPrice: number | null; category: string; brand: string;
};
/** بيانات بطاقة الصنف لإثراء السطور (المجموعة/الماركة/سعر البيع). */
export type ProductInfo = { category: string | null; brand: string | null; selling_price: number | null };

const num = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const numOrNull = (v: unknown): number | null => { if (v == null || v === "") return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
const r2 = (n: number): number => Math.round(n * 100) / 100;
const pad = (n: number): string => String(n).padStart(4, "0");
export const invLabel = (year: number, no: number): string => `INV-${year}-${pad(no)}`;
export const retLabel = (year: number, no: number): string => `SR-${year}-${pad(no)}`;
type Item = Record<string, unknown>;
const itemsOf = (v: unknown): Item[] => (Array.isArray(v) ? (v as Item[]) : []);

function costOf(inv: { id: number }, it: Item, moves: MoveCosts): { unit: number | null; src: "item" | "move" | null } {
  const u = numOrNull(it.unit_cost);
  if (u != null) return { unit: u, src: "item" };
  const pid = numOrNull(it.product_id);
  if (pid != null) { const m = moves.get(`${inv.id}:${pid}`); if (m != null) return { unit: m, src: "move" }; }
  return { unit: null, src: null };
}
function finish(l: Omit<SaleLine, "cost" | "profit" | "margin" | "listPrice" | "category" | "brand"> & { listPrice?: number | null }): SaleLine {
  const cost = l.unitCost == null ? null : r2(l.unitCost * l.qty);
  const profit = cost == null ? null : r2(l.net - cost);
  const margin = profit == null || Math.abs(l.net) < 0.005 ? null : r2((profit / l.net) * 100);
  return { ...l, listPrice: l.listPrice ?? null, category: "", brand: "", cost, profit, margin };
}

/** يحوّل فواتير ومرتجعات إلى سطور؛ المرتجع سطره سالب بتكلفة الفاتورة الأصلية (إن عُرفت). */
export function buildLines(invoices: RawInvoice[], returns: RawReturn[], originals: Map<number, RawInvoice>, moves: MoveCosts, includeReturns: boolean): SaleLine[] {
  const out: SaleLine[] = [];
  for (const inv of invoices) {
    for (const it of itemsOf(inv.items)) {
      const qty = num(it.qty); const net = r2(num(it.line_total));
      const list = numOrNull(it.list_price);
      const { unit, src } = costOf(inv, it, moves);
      out.push(finish({
        kind: "sale", docId: inv.id, docNo: invLabel(inv.invoice_year, inv.invoice_no), date: inv.date, branchId: inv.branch_id, customer: inv.customer_name || "", payType: inv.payment_type,
        productId: numOrNull(it.product_id), code: it.product_code != null ? String(it.product_code) : null, name: String(it.description ?? ""), qty,
        unitPrice: qty ? r2(net / qty) : 0, discount: list != null ? Math.max(0, r2(list * qty - net)) : 0, net, unitCost: unit, costSource: src, listPrice: list,
      }));
    }
  }
  if (includeReturns) {
    for (const ret of returns) {
      const orig = originals.get(ret.original_invoice_id);
      for (const ri of itemsOf(ret.items)) {
        const idx = numOrNull(ri.original_item_index); const oi = orig && idx != null ? itemsOf(orig.items)[idx] : undefined;
        const qty = -Math.abs(num(ri.qty)); const net = -Math.abs(r2(num(ri.line_total)));
        const { unit, src } = oi && orig ? costOf(orig, oi, moves) : { unit: null, src: null };
        out.push(finish({
          kind: "return", docId: ret.id, docNo: retLabel(ret.return_year, ret.return_no), date: ret.date, branchId: ret.branch_id, customer: ret.customer_name || "", payType: null,
          productId: oi ? numOrNull(oi.product_id) : null, code: oi && oi.product_code != null ? String(oi.product_code) : null, name: String(ri.description ?? oi?.description ?? ""), qty,
          unitPrice: num(ri.qty) ? r2(Math.abs(net) / Math.abs(qty)) : 0, discount: 0, net, unitCost: unit, costSource: src, listPrice: oi ? numOrNull(oi.list_price) : null,
        }));
      }
    }
  }
  return out.sort((a, b) => (a.date === b.date ? a.docNo.localeCompare(b.docNo) : a.date < b.date ? -1 : 1));
}

export type ItemSummary = { key: string; productId: number | null; code: string | null; name: string; qty: number; net: number; cost: number; costedNet: number; profit: number; margin: number | null; docs: number; uncosted: boolean };
/** ملخص بالصنف: الهامش محسوب على المبيعات ذات التكلفة المعروفة فقط (حتى لا يتضخم الربح بسطور بلا تكلفة). */
export function summarizeByItem(lines: SaleLine[]): ItemSummary[] {
  const m = new Map<string, ItemSummary & { _d: Set<string> }>();
  for (const l of lines) {
    const key = l.productId != null ? `p${l.productId}` : `n${l.name}`;
    let s = m.get(key);
    if (!s) { s = { key, productId: l.productId, code: l.code, name: l.name, qty: 0, net: 0, cost: 0, costedNet: 0, profit: 0, margin: null, docs: 0, uncosted: false, _d: new Set() }; m.set(key, s); }
    s.qty = r2(s.qty + l.qty); s.net = r2(s.net + l.net); s._d.add(`${l.kind}${l.docId}`);
    if (l.cost != null) { s.cost = r2(s.cost + l.cost); s.costedNet = r2(s.costedNet + l.net); s.profit = r2(s.profit + (l.profit ?? 0)); } else s.uncosted = true;
  }
  return [...m.values()].map(({ _d, ...s }) => ({ ...s, docs: _d.size, margin: Math.abs(s.costedNet) < 0.005 ? null : r2((s.profit / s.costedNet) * 100) }))
    .sort((a, b) => b.net - a.net);
}

export type Totals = { qty: number; net: number; cost: number; profit: number; uncostedLines: number; margin: number | null };
export function totalsOf(lines: SaleLine[]): Totals {
  let qty = 0, net = 0, cost = 0, profit = 0, costedNet = 0, unc = 0;
  for (const l of lines) { qty += l.qty; net += l.net; if (l.cost != null) { cost += l.cost; profit += l.profit ?? 0; costedNet += l.net; } else unc++; }
  return { qty: r2(qty), net: r2(net), cost: r2(cost), profit: r2(profit), uncostedLines: unc, margin: Math.abs(costedNet) < 0.005 ? null : r2((profit / costedNet) * 100) };
}
/** تطبيع بحث ذكي: يتجاهل التشكيل وفروق الهمزات/الياء/التاء المربوطة ويحوّل الأرقام الهندية. */
export const normQ = (v: unknown): string => String(v ?? "").toLowerCase().replace(/[\u064B-\u0652\u0640]/g, "").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).trim();
/** كل كلمة في الاستعلام يجب أن تظهر في أي حقل (فاتورة/صنف/كود/عميل/مجموعة/ماركة/دفع). */
export function filterLines(lines: SaleLine[], q: string): SaleLine[] {
  const toks = normQ(q).split(/\s+/).filter(Boolean); if (!toks.length) return lines;
  return lines.filter((l) => { const hay = normQ(`${l.docNo} ${l.name} ${l.code ?? ""} ${l.customer} ${l.category} ${l.brand} ${l.payType ?? ""} ${l.date}`); return toks.every((t) => hay.includes(t)); });
}

/** يضيف المجموعة والماركة وسعر البيع من بطاقة الصنف (سعر القائمة من البند له الأولوية). */
export function enrichLines(lines: SaleLine[], prods: Map<number, ProductInfo>): SaleLine[] {
  return lines.map((l) => { const p = l.productId != null ? prods.get(l.productId) : undefined; return { ...l, category: (p?.category || "").trim(), brand: (p?.brand || "").trim(), listPrice: l.listPrice ?? (p?.selling_price ?? null) }; });
}

export type GroupDim = "item" | "customer" | "category" | "brand" | "customer_item" | "category_item" | "day" | "month" | "branch" | "pay";
export type GroupRow = {
  key: string; label: string; sub: string; code: string | null; qty: number; net: number; discount: number; cost: number; costedNet: number; profit: number; margin: number | null;
  docs: number; avgPrice: number; avgCost: number | null; avgList: number | null; first: string; last: string; uncosted: boolean;
};
/** تجميع عام: dim يحدد المفتاح؛ branchName يحوّل رقم الفرع لاسم. الهامش على السطور ذات التكلفة فقط. */
export function groupLines(lines: SaleLine[], dim: GroupDim, branchName: (id: number | null) => string = (id) => (id == null ? "" : String(id)), none = "—"): GroupRow[] {
  const itemKey = (l: SaleLine): string => (l.productId != null ? `p${l.productId}` : `n${l.name}`);
  const keyOf = (l: SaleLine): { key: string; label: string; sub: string; code: string | null } => {
    switch (dim) {
      case "item": return { key: itemKey(l), label: l.name || none, sub: "", code: l.code };
      case "customer": return { key: `c${l.customer}`, label: l.customer || none, sub: "", code: null };
      case "category": return { key: `g${l.category}`, label: l.category || none, sub: "", code: null };
      case "brand": return { key: `b${l.brand}`, label: l.brand || none, sub: "", code: null };
      case "customer_item": return { key: `c${l.customer}|${itemKey(l)}`, label: l.name || none, sub: l.customer || none, code: l.code };
      case "category_item": return { key: `g${l.category}|${itemKey(l)}`, label: l.name || none, sub: l.category || none, code: l.code };
      case "day": return { key: l.date, label: l.date, sub: "", code: null };
      case "month": return { key: l.date.slice(0, 7), label: l.date.slice(0, 7), sub: "", code: null };
      case "branch": return { key: `r${l.branchId ?? ""}`, label: branchName(l.branchId) || none, sub: "", code: null };
      case "pay": return { key: `y${l.payType ?? ""}`, label: l.payType || none, sub: "", code: null };
    }
  };
  type Acc = GroupRow & { _d: Set<string>; _lq: number; _ln: number; _cq: number; _cc: number };
  const m = new Map<string, Acc>();
  for (const l of lines) {
    const k = keyOf(l); let g = m.get(k.key);
    if (!g) { g = { ...k, qty: 0, net: 0, discount: 0, cost: 0, costedNet: 0, profit: 0, margin: null, docs: 0, avgPrice: 0, avgCost: null, avgList: null, first: l.date, last: l.date, uncosted: false, _d: new Set(), _lq: 0, _ln: 0, _cq: 0, _cc: 0 }; m.set(k.key, g); }
    g.qty = r2(g.qty + l.qty); g.net = r2(g.net + l.net); g.discount = r2(g.discount + l.discount); g._d.add(`${l.kind}${l.docId}`);
    if (l.date < g.first) g.first = l.date; if (l.date > g.last) g.last = l.date;
    if (l.listPrice != null && l.kind === "sale") { g._lq += l.qty; g._ln += l.listPrice * l.qty; }
    if (l.cost != null) { g.cost = r2(g.cost + l.cost); g.costedNet = r2(g.costedNet + l.net); g.profit = r2(g.profit + (l.profit ?? 0)); g._cq += l.qty; g._cc += l.cost; } else g.uncosted = true;
  }
  return [...m.values()].map(({ _d, _lq, _ln, _cq, _cc, ...g }) => ({ ...g, docs: _d.size, margin: Math.abs(g.costedNet) < 0.005 ? null : r2((g.profit / g.costedNet) * 100),
    avgPrice: g.qty ? r2(g.net / g.qty) : 0, avgCost: Math.abs(_cq) > 0.0005 ? r2(_cc / _cq) : null, avgList: _lq > 0 ? r2(_ln / _lq) : null }))
    .sort((a, b) => (dim === "day" || dim === "month" ? (a.key < b.key ? -1 : 1) : b.net - a.net));
}
