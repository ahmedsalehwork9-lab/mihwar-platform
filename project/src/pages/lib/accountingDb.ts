// =============================================================
// src/pages/lib/accountingDb.ts
// طبقة بيانات وحدة المحاسبة (شجرة الحسابات + القيود) على Supabase.
// الدفاتر على مستوى المؤسسة (organization_id)، مع branch_id كمركز تكلفة.
// =============================================================

import { supabase } from "./supabase";

export type AccType = "asset" | "liability" | "equity" | "revenue" | "expense";

export type GLAccount = {
  id: number;
  organization_id: number;
  code: string;
  name: string;
  name_en?: string | null;
  parent_id: number | null;
  type: AccType;
  is_group: boolean;
  is_active: boolean;
};

export type GLEntry = {
  id: number;
  organization_id: number;
  entry_no: number;
  entry_year: number;
  date: string;
  description: string | null;
  branch_id: number | null;
  status: string;
  created_at?: string;
};

export type GLLine = {
  id?: number;
  entry_id?: number;
  account_id: number;
  debit: number;
  credit: number;
  branch_id?: number | null;
  note?: string | null;
};

// طبيعة الحساب (مدين/دائن) حسب النوع
export const natureOf = (t: AccType): "debit" | "credit" =>
  t === "asset" || t === "expense" ? "debit" : "credit";

export const TYPE_LABEL: Record<AccType, string> = {
  asset: "أصول",
  liability: "خصوم",
  equity: "حقوق ملكية",
  revenue: "إيرادات",
  expense: "مصروفات",
};

// ── المؤسسة النشطة من الفرع الحالي ──
export async function getOrgForBranch(branchId: number | null): Promise<{ id: number; name: string } | null> {
  if (branchId == null) return null;
  const { data: shop } = await supabase.from("shops").select("organization_id").eq("id", branchId).maybeSingle();
  const orgId = (shop as any)?.organization_id;
  if (!orgId) return null;
  const { data: org } = await supabase.from("organizations").select("id, name").eq("id", orgId).maybeSingle();
  return { id: Number(orgId), name: (org as any)?.name || ("مؤسسة " + orgId) };
}

// ── شجرة الحسابات ──
export async function fetchAccounts(orgId: number): Promise<GLAccount[]> {
  const { data, error } = await supabase.from("gl_accounts").select("*").eq("organization_id", orgId).order("code");
  if (error) { console.error("fetchAccounts", error); return []; }
  return (data as GLAccount[]) || [];
}

export async function upsertAccount(acc: Partial<GLAccount>): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from("gl_accounts").upsert(acc as any);
  if (error) console.error("upsertAccount", error);
  return { ok: !error, error: error?.message };
}

export async function deleteAccount(id: number): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from("gl_accounts").delete().eq("id", id);
  if (error) console.error("deleteAccount", error);
  return { ok: !error, error: error?.message };
}

// الشجرة السعودية القياسية المبدئية (قابلة للتعديل بعد التهيئة)
type SeedRow = { code: string; name: string; type: AccType; is_group: boolean; parent: string | null };
export const STANDARD_CHART: SeedRow[] = [
  { code: "1", name: "الأصول", type: "asset", is_group: true, parent: null },
  { code: "11", name: "الأصول المتداولة", type: "asset", is_group: true, parent: "1" },
  { code: "1101", name: "الصندوق (النقدية)", type: "asset", is_group: false, parent: "11" },
  { code: "1102", name: "البنك", type: "asset", is_group: false, parent: "11" },
  { code: "1103", name: "العملاء (مدينون)", type: "asset", is_group: false, parent: "11" },
  { code: "1104", name: "المخزون", type: "asset", is_group: false, parent: "11" },
  { code: "1105", name: "مصروفات مدفوعة مقدمًا", type: "asset", is_group: false, parent: "11" },
  { code: "1106", name: "ضريبة القيمة المضافة - المدخلات", type: "asset", is_group: false, parent: "11" },
  { code: "1107", name: "عُهد وسلف", type: "asset", is_group: false, parent: "11" },
  { code: "12", name: "الأصول غير المتداولة", type: "asset", is_group: true, parent: "1" },
  { code: "1201", name: "أثاث وتجهيزات", type: "asset", is_group: false, parent: "12" },
  { code: "1202", name: "أجهزة ومعدات", type: "asset", is_group: false, parent: "12" },
  { code: "1203", name: "سيارات", type: "asset", is_group: false, parent: "12" },
  { code: "1204", name: "تحسينات وديكورات", type: "asset", is_group: false, parent: "12" },
  { code: "1209", name: "مجمع الإهلاك", type: "asset", is_group: false, parent: "12" },
  { code: "2", name: "الخصوم", type: "liability", is_group: true, parent: null },
  { code: "21", name: "الخصوم المتداولة", type: "liability", is_group: true, parent: "2" },
  { code: "2101", name: "الموردون (دائنون)", type: "liability", is_group: false, parent: "21" },
  { code: "2102", name: "مصروفات مستحقة", type: "liability", is_group: false, parent: "21" },
  { code: "2103", name: "ضريبة القيمة المضافة - المخرجات", type: "liability", is_group: false, parent: "21" },
  { code: "2104", name: "رواتب مستحقة", type: "liability", is_group: false, parent: "21" },
  { code: "2105", name: "دائنون آخرون", type: "liability", is_group: false, parent: "21" },
  { code: "22", name: "الخصوم غير المتداولة", type: "liability", is_group: true, parent: "2" },
  { code: "2201", name: "قروض طويلة الأجل", type: "liability", is_group: false, parent: "22" },
  { code: "3", name: "حقوق الملكية", type: "equity", is_group: true, parent: null },
  { code: "3101", name: "رأس المال", type: "equity", is_group: false, parent: "3" },
  { code: "3102", name: "جاري المالك / الشركاء", type: "equity", is_group: false, parent: "3" },
  { code: "3103", name: "الأرباح المرحّلة", type: "equity", is_group: false, parent: "3" },
  { code: "3104", name: "أرباح (خسائر) العام الحالي", type: "equity", is_group: false, parent: "3" },
  { code: "4", name: "الإيرادات", type: "revenue", is_group: true, parent: null },
  { code: "4101", name: "المبيعات / إيراد النشاط", type: "revenue", is_group: false, parent: "4" },
  { code: "4102", name: "إيرادات أخرى", type: "revenue", is_group: false, parent: "4" },
  { code: "4103", name: "خصومات مكتسبة", type: "revenue", is_group: false, parent: "4" },
  { code: "5", name: "المصروفات", type: "expense", is_group: true, parent: null },
  { code: "51", name: "تكلفة المبيعات", type: "expense", is_group: true, parent: "5" },
  { code: "5101", name: "تكلفة المشتريات / المواد", type: "expense", is_group: false, parent: "51" },
  { code: "5102", name: "مردودات ومسموحات المشتريات", type: "expense", is_group: false, parent: "51" },
  { code: "52", name: "مصروفات تشغيلية وإدارية", type: "expense", is_group: true, parent: "5" },
  { code: "5201", name: "الرواتب والأجور", type: "expense", is_group: false, parent: "52" },
  { code: "5202", name: "الإيجار", type: "expense", is_group: false, parent: "52" },
  { code: "5203", name: "الكهرباء والمياه", type: "expense", is_group: false, parent: "52" },
  { code: "5204", name: "الاتصالات والإنترنت", type: "expense", is_group: false, parent: "52" },
  { code: "5205", name: "مواد التغليف والتعبئة", type: "expense", is_group: false, parent: "52" },
  { code: "5206", name: "الصيانة والنظافة", type: "expense", is_group: false, parent: "52" },
  { code: "5207", name: "التسويق والإعلان", type: "expense", is_group: false, parent: "52" },
  { code: "5208", name: "عمولات تطبيقات التوصيل", type: "expense", is_group: false, parent: "52" },
  { code: "5209", name: "مصروفات بنكية ورسوم", type: "expense", is_group: false, parent: "52" },
  { code: "5210", name: "رسوم حكومية", type: "expense", is_group: false, parent: "52" },
  { code: "5211", name: "إهلاك الأصول", type: "expense", is_group: false, parent: "52" },
  { code: "5212", name: "مصروفات أخرى", type: "expense", is_group: false, parent: "52" },
];

// تهيئة الشجرة القياسية للمؤسسة (تُضيف فقط الأكواد غير الموجودة)
export async function seedStandardChart(orgId: number): Promise<{ ok: boolean; error?: string; added: number }> {
  const existing = await fetchAccounts(orgId);
  const have = new Set(existing.map((a) => a.code));
  const toAdd = STANDARD_CHART.filter((r) => !have.has(r.code));
  if (!toAdd.length) return { ok: true, added: 0 };
  // تمريرة 1: إدراج بدون أب
  const { data: ins, error: e1 } = await supabase
    .from("gl_accounts")
    .insert(toAdd.map((r) => ({ organization_id: orgId, code: r.code, name: r.name, type: r.type, is_group: r.is_group, parent_id: null })))
    .select("id, code");
  if (e1) { console.error("seed insert", e1); return { ok: false, error: e1.message, added: 0 }; }
  // خريطة كود→معرّف (الموجود + الجديد)
  const all = await fetchAccounts(orgId);
  const byCode = new Map(all.map((a) => [a.code, a.id] as const));
  // تمريرة 2: ربط الآباء
  for (const r of toAdd) {
    if (!r.parent) continue;
    const pid = byCode.get(r.parent);
    const cid = byCode.get(r.code);
    if (pid && cid) { await supabase.from("gl_accounts").update({ parent_id: pid }).eq("id", cid); }
  }
  return { ok: true, added: (ins as any[])?.length || toAdd.length };
}

// ── القيود اليومية ──
export async function nextEntryNo(orgId: number, year: number): Promise<number> {
  const { data } = await supabase
    .from("gl_journal_entries")
    .select("entry_no")
    .eq("organization_id", orgId)
    .eq("entry_year", year)
    .order("entry_no", { ascending: false })
    .limit(1);
  return (((data as any[])?.[0]?.entry_no as number) || 0) + 1;
}

export type EntryWithLines = GLEntry & { lines: GLLine[] };

export async function fetchEntries(orgId: number, from: string, to: string, branchId?: number | null): Promise<EntryWithLines[]> {
  let q = supabase
    .from("gl_journal_entries")
    .select("*, lines:gl_journal_lines(*)")
    .eq("organization_id", orgId)
    .gte("date", from)
    .lte("date", to)
    .order("date", { ascending: false })
    .order("entry_no", { ascending: false });
  if (branchId != null) q = q.eq("branch_id", branchId);
  const { data, error } = await q;
  if (error) { console.error("fetchEntries", error); return []; }
  return (data as any[]) || [];
}

export async function createEntry(
  orgId: number, date: string, description: string, branchId: number | null, lines: GLLine[]
): Promise<{ ok: boolean; error?: string }> {
  const year = Number(date.slice(0, 4));
  const entry_no = await nextEntryNo(orgId, year);
  const { data: head, error: e1 } = await supabase
    .from("gl_journal_entries")
    .insert({ organization_id: orgId, entry_no, entry_year: year, date, description: description || null, branch_id: branchId, status: "posted" })
    .select("id")
    .single();
  if (e1 || !head) { console.error("createEntry head", e1); return { ok: false, error: e1?.message }; }
  const eid = (head as any).id;
  const payload = lines
    .filter((l) => l.account_id && (Number(l.debit) || Number(l.credit)))
    .map((l) => ({ entry_id: eid, account_id: l.account_id, debit: Number(l.debit) || 0, credit: Number(l.credit) || 0, branch_id: l.branch_id ?? branchId, note: l.note || null }));
  const { error: e2 } = await supabase.from("gl_journal_lines").insert(payload);
  if (e2) { console.error("createEntry lines", e2); await supabase.from("gl_journal_entries").delete().eq("id", eid); return { ok: false, error: e2.message }; }
  return { ok: true };
}

export async function deleteEntry(id: number): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from("gl_journal_entries").delete().eq("id", id);
  return { ok: !error, error: error?.message };
}

// حركة حساب (لكشف الحساب) ضمن فترة — ترجع السطور مع تاريخ ووصف القيد
export type LedgerLine = { date: string; entry_no: number; description: string | null; branch_id: number | null; debit: number; credit: number; note: string | null };
export async function fetchLedger(orgId: number, accountId: number, from: string, to: string, branchId?: number | null): Promise<LedgerLine[]> {
  let q = supabase
    .from("gl_journal_lines")
    .select("debit, credit, branch_id, note, entry:gl_journal_entries!inner(date, entry_no, description, organization_id)")
    .eq("account_id", accountId)
    .gte("entry.date", from)
    .lte("entry.date", to)
    .eq("entry.organization_id", orgId);
  if (branchId != null) q = q.eq("branch_id", branchId);
  const { data, error } = await q;
  if (error) { console.error("fetchLedger", error); return []; }
  const rows = ((data as any[]) || []).map((r) => ({
    date: r.entry?.date, entry_no: r.entry?.entry_no, description: r.entry?.description,
    branch_id: r.branch_id, debit: Number(r.debit) || 0, credit: Number(r.credit) || 0, note: r.note,
  }));
  rows.sort((a, b) => (a.date || "").localeCompare(b.date || "") || (a.entry_no - b.entry_no));
  return rows;
}
