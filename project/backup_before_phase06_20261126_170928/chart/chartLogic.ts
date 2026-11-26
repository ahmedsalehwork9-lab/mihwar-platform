// =============================================================
// src/pages/accounting/chart/chartLogic.ts
// منطق دليل الحسابات (دوال نقية قابلة للاختبار): تطبيع النص العربي،
// البحث المتقدم، العمق، تجميع الأرصدة، تسطيح الشجرة، توليد الكود.
// =============================================================
import type { AccType, GLAccount } from "../../lib/accountingDb";

export type KindFilter = "all" | "group" | "posting";
export type StatusFilter = "all" | "active" | "inactive";
export type BalanceFilter = "all" | "nonzero" | "zero";

export type ChartFilters = {
  q: string;
  type: AccType | "all";
  kind: KindFilter;
  status: StatusFilter;
  level: number; // 0 = كل المستويات
  balance: BalanceFilter;
};

export const DEFAULT_FILTERS: ChartFilters = { q: "", type: "all", kind: "all", status: "all", level: 0, balance: "all" };

/** تطبيع حرف بحرف (1:1 أو حذف) ليبقى تعيين المواضع ممكنًا للتظليل. */
const mapChar = (ch: string): string => {
  const c = ch.charCodeAt(0);
  if ((c >= 0x064b && c <= 0x065f) || c === 0x0670 || c === 0x0640) return ""; // تشكيل/تطويل
  if (ch === "أ" || ch === "إ" || ch === "آ" || ch === "ٱ") return "ا";
  if (ch === "ى") return "ي";
  if (ch === "ة") return "ه";
  if (ch === "ؤ") return "و";
  if (ch === "ئ") return "ي";
  if (c >= 0x0660 && c <= 0x0669) return String(c - 0x0660); // أرقام هندية
  if (c >= 0x06f0 && c <= 0x06f9) return String(c - 0x06f0); // أرقام فارسية
  return ch.toLowerCase();
};

export function normMap(s: string): { n: string; idx: number[] } {
  let n = ""; const idx: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const m = mapChar(s[i]);
    for (let k = 0; k < m.length; k++) { n += m[k]; idx.push(i); }
  }
  return { n, idx };
}
export const normalizeText = (s: string): string => normMap(s ?? "").n;

export const queryTokens = (q: string): string[] => normalizeText(q).split(/\s+/).filter(Boolean);

export function matchesQuery(a: Pick<GLAccount, "code" | "name" | "name_en">, tokens: string[]): boolean {
  if (!tokens.length) return true;
  const code = normalizeText(a.code);
  const hay = `${normalizeText(a.name)} ${normalizeText(a.name_en ?? "")}`;
  return tokens.every((tk) => code.includes(tk) || hay.includes(tk));
}

/** يقسم النص إلى أجزاء مع تحديد المطابق لأي كلمة بحث (يحترم التطبيع). */
export function splitHighlight(text: string, tokens: string[]): { s: string; hit: boolean }[] {
  if (!tokens.length || !text) return [{ s: text, hit: false }];
  const { n, idx } = normMap(text);
  const hit = new Array<boolean>(text.length).fill(false);
  for (const tk of tokens) {
    let from = 0;
    for (;;) {
      const p = n.indexOf(tk, from);
      if (p < 0) break;
      for (let k = p; k < p + tk.length; k++) hit[idx[k]] = true;
      from = p + Math.max(tk.length, 1);
    }
  }
  const out: { s: string; hit: boolean }[] = [];
  for (let i = 0; i < text.length; i++) {
    const last = out[out.length - 1];
    if (last && last.hit === hit[i]) last.s += text[i]; else out.push({ s: text[i], hit: hit[i] });
  }
  return out;
}

export function buildChildren(accounts: GLAccount[]): Map<number | null, GLAccount[]> {
  const ids = new Set(accounts.map((a) => a.id));
  const m = new Map<number | null, GLAccount[]>();
  accounts.forEach((a) => {
    const k = a.parent_id != null && ids.has(a.parent_id) ? a.parent_id : null; // يتيم → جذر
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(a);
  });
  m.forEach((arr) => arr.sort((x, y) => x.code.localeCompare(y.code, "en", { numeric: true })));
  return m;
}

/** عمق كل حساب (الجذر = 1) — آمن ضد الحلقات. */
export function depthMap(accounts: GLAccount[]): Map<number, number> {
  const byId = new Map(accounts.map((a) => [a.id, a] as const));
  const d = new Map<number, number>();
  const walk = (a: GLAccount): number => {
    const got = d.get(a.id); if (got) return got;
    d.set(a.id, 1); // حارس الحلقات
    const p = a.parent_id != null ? byId.get(a.parent_id) : undefined;
    const v = p ? walk(p) + 1 : 1;
    d.set(a.id, v);
    return v;
  };
  accounts.forEach(walk);
  return d;
}

export function ancestorsOf(a: GLAccount, byId: Map<number, GLAccount>): number[] {
  const out: number[] = []; const seen = new Set<number>([a.id]);
  let p = a.parent_id != null ? byId.get(a.parent_id) : undefined;
  while (p && !seen.has(p.id)) { out.push(p.id); seen.add(p.id); p = p.parent_id != null ? byId.get(p.parent_id) : undefined; }
  return out;
}

export function descendantsOf(id: number, children: Map<number | null, GLAccount[]>): Set<number> {
  const out = new Set<number>(); const st = [id];
  while (st.length) { const x = st.pop()!; for (const k of children.get(x) || []) if (!out.has(k.id)) { out.add(k.id); st.push(k.id); } }
  return out;
}

export const isFiltering = (f: ChartFilters): boolean =>
  queryTokens(f.q).length > 0 || f.type !== "all" || f.kind !== "all" || f.status !== "all" || f.level !== 0 || f.balance !== "all";

export type Visibility = { matches: Set<number>; visible: Set<number> };

/** المطابقات = الحسابات التي تحقق كل المرشحات؛ المرئي = المطابقات + آباؤها (لإظهار المسار). */
export function computeVisibility(accounts: GLAccount[], f: ChartFilters, balances: Map<number, number> | null): Visibility {
  const tokens = queryTokens(f.q);
  const byId = new Map(accounts.map((a) => [a.id, a] as const));
  const depth = depthMap(accounts);
  const matches = new Set<number>();
  for (const a of accounts) {
    if (!matchesQuery(a, tokens)) continue;
    if (f.type !== "all" && a.type !== f.type) continue;
    if (f.kind === "group" && !a.is_group) continue;
    if (f.kind === "posting" && a.is_group) continue;
    if (f.status === "active" && !a.is_active) continue;
    if (f.status === "inactive" && a.is_active) continue;
    if (f.level !== 0 && depth.get(a.id) !== f.level) continue;
    if (f.balance !== "all" && balances) {
      const b = Math.abs(balances.get(a.id) ?? 0);
      if (f.balance === "nonzero" && b < 0.005) continue;
      if (f.balance === "zero" && b >= 0.005) continue;
    }
    matches.add(a.id);
  }
  const visible = new Set<number>(matches);
  for (const id of matches) for (const p of ancestorsOf(byId.get(id)!, byId)) visible.add(p);
  return { matches, visible };
}

export type Row = { acc: GLAccount; depth: number; hasKids: boolean; match: boolean };

/** تسطيح الشجرة: عند التصفية تُفتح كل الفروع؛ وإلا تُحترم الفروع المطوية. */
export function flattenTree(children: Map<number | null, GLAccount[]>, vis: Visibility | null, collapsed: Set<number>): Row[] {
  const out: Row[] = [];
  const walk = (parent: number | null, depth: number) => {
    for (const a of children.get(parent) || []) {
      if (vis && !vis.visible.has(a.id)) continue;
      const kids = (children.get(a.id) || []).filter((k) => !vis || vis.visible.has(k.id));
      out.push({ acc: a, depth, hasKids: kids.length > 0, match: vis ? vis.matches.has(a.id) : true });
      if (kids.length && (vis || !collapsed.has(a.id))) walk(a.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

export function flattenFlat(accounts: GLAccount[], vis: Visibility | null): Row[] {
  return [...accounts]
    .filter((a) => !vis || vis.matches.has(a.id))
    .sort((x, y) => x.code.localeCompare(y.code, "en", { numeric: true }))
    .map((acc) => ({ acc, depth: 0, hasKids: false, match: true }));
}

/** رصيد طبيعي بالإشارة: أصول/مصروفات = مدين − دائن، والباقي = دائن − مدين؛ والمجموعات = مجموع الأبناء. */
export function rollupBalances(accounts: GLAccount[], raw: Map<number, { d: number; c: number }>): Map<number, number> {
  const children = buildChildren(accounts);
  const out = new Map<number, number>();
  const calc = (a: GLAccount, seen: Set<number>): number => {
    if (out.has(a.id)) return out.get(a.id)!;
    if (seen.has(a.id)) return 0;
    seen.add(a.id);
    const r = raw.get(a.id) ?? { d: 0, c: 0 };
    const own = a.type === "asset" || a.type === "expense" ? r.d - r.c : r.c - r.d;
    let sum = own;
    for (const k of children.get(a.id) || []) sum += calc(k, seen);
    sum = Math.round(sum * 100) / 100;
    out.set(a.id, sum);
    return sum;
  };
  accounts.forEach((a) => calc(a, new Set()));
  return out;
}

/** الكود التالي تحت حساب أب (أو جذر) — نفس منطق الصفحة السابقة. */
export function nextChildCode(accounts: GLAccount[], parentId: number | null): string {
  const parent = parentId != null ? accounts.find((a) => a.id === parentId) : null;
  const siblings = accounts.filter((a) => (a.parent_id ?? null) === (parentId ?? null));
  if (parent) {
    const pc = parent.code;
    const kids = siblings.filter((s) => s.code.length > pc.length && s.code.startsWith(pc));
    if (kids.length) {
      const sfx = kids.map((k) => k.code.slice(pc.length));
      const width = sfx[0].length;
      const maxN = Math.max(...sfx.map((s) => parseInt(s, 10) || 0));
      return pc + String(maxN + 1).padStart(width, "0");
    }
    return pc + "01";
  }
  const roots = siblings.map((s) => parseInt(s.code, 10) || 0);
  return String((roots.length ? Math.max(...roots) : 0) + 1);
}

export const TYPE_LABEL_EN: Record<AccType, string> = { asset: "Assets", liability: "Liabilities", equity: "Equity", revenue: "Revenue", expense: "Expenses" };
export const TYPE_LABEL_AR: Record<AccType, string> = { asset: "أصول", liability: "خصوم", equity: "حقوق ملكية", revenue: "إيرادات", expense: "مصروفات" };
