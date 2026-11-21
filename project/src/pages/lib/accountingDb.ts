// =============================================================*

// src/pages/lib/accountingDb.ts*

// طبقة بيانات وحدة المحاسبة (شجرة الحسابات + القيود) على Supabase.*

// الدفاتر على مستوى المؤسسة (organization_id)، مع branch_id كمركز تكلفة.*

// =============================================================*



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

  status: string;            // 'posted' | 'draft'*

  entry_type?: string;       // عام/مشتريات/مبيعات/تسوية/سند قبض/سند صرف*

  notes?: string | null;     // ملاحظات عامة*

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

  party_id?: number | null;   // وسم الطرف (عميل/مورد فرعي) لتفصيل كشفه*

};



// طبيعة الحساب (مدين/دائن) حسب النوع*

export const natureOf = (t: AccType): "debit" | "credit" =>

  t === "asset" || t === "expense" ? "debit" : "credit";



export const TYPE_LABEL: Record<AccType, string> = {

  asset: "أصول",

  liability: "خصوم",

  equity: "حقوق ملكية",

  revenue: "إيرادات",

  expense: "مصروفات",

};



// أنواع القيود (لتصنيف القيد وتسهيل الفلترة والربط لاحقًا)*

export type EntryType = "general" | "purchases" | "sales" | "settlement" | "receipt" | "payment" | "depreciation" | "opening";

export const ENTRY_TYPE_LABEL: Record<string, string> = {

  general: "عام",

  purchases: "مشتريات",

  sales: "مبيعات",

  settlement: "تسوية",

  receipt: "سند قبض",

  payment: "سند صرف",

  depreciation: "قيد إهلاك",

  opening: "رصيد افتتاحي",

};

export const ENTRY_TYPE_OPTS: EntryType[] = ["general", "purchases", "sales", "settlement", "receipt", "payment", "depreciation", "opening"];



// ── المؤسسة النشطة من الفرع الحالي ──*

export async function getOrgForBranch(branchId: number | null): Promise<{ id: number; name: string } | null> {

  if (branchId == null) return null;

  const { data: shop } = await supabase.from("shops").select("organization_id").eq("id", branchId).maybeSingle();

  const orgId = (shop as any)?.organization_id;

  if (!orgId) return null;

  const { data: org } = await supabase.from("organizations").select("id, name").eq("id", orgId).maybeSingle();

  return { id: Number(orgId), name: (org as any)?.name || ("مؤسسة " + orgId) };

}



// ── شجرة الحسابات ──*

export async function fetchAccounts(orgId: number): Promise<GLAccount[]> {

  const { data, error } = await supabase.from("gl_accounts").select("*").eq("organization_id", orgId).order("code");

  if (error) { console.error("fetchAccounts", error); return []; }

  return (data as GLAccount[]) || [];

}



export async function upsertAccount(acc: Partial<GLAccount>): Promise<{ ok: boolean; error?: string }> {

  // عمود id معرّف GENERATED ALWAYS، فالتعديل يستخدم update بدل upsert (الذي يحاول إدراج id)*

  const anyAcc = acc as any;

  const { error } = anyAcc.id

    ? await supabase.from("gl_accounts").update((({ id, ...rest }) => rest)(anyAcc)).eq("id", anyAcc.id)

    : await supabase.from("gl_accounts").insert(anyAcc);

  if (error) console.error("upsertAccount", error);

  return { ok: !error, error: error?.message };

}



export async function deleteAccount(id: number): Promise<{ ok: boolean; error?: string }> {

  const { error } = await supabase.from("gl_accounts").delete().eq("id", id);

  if (error) console.error("deleteAccount", error);

  return { ok: !error, error: error?.message };

}



// الشجرة السعودية القياسية المبدئية (قابلة للتعديل بعد التهيئة)*

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



// تهيئة الشجرة القياسية للمؤسسة (تُضيف فقط الأكواد غير الموجودة)*

export async function seedStandardChart(orgId: number): Promise<{ ok: boolean; error?: string; added: number }> {

  const existing = await fetchAccounts(orgId);

  const have = new Set(existing.map((a) => a.code));

  const toAdd = STANDARD_CHART.filter((r) => !have.has(r.code));

  if (!toAdd.length) return { ok: true, added: 0 };

  // تمريرة 1: إدراج بدون أب*

  const { data: ins, error: e1 } = await supabase

    .from("gl_accounts")

    .insert(toAdd.map((r) => ({ organization_id: orgId, code: r.code, name: r.name, type: r.type, is_group: r.is_group, parent_id: null })))

    .select("id, code");

  if (e1) { console.error("seed insert", e1); return { ok: false, error: e1.message, added: 0 }; }

  // خريطة كود→معرّف (الموجود + الجديد)*

  const all = await fetchAccounts(orgId);

  const byCode = new Map(all.map((a) => [a.code, a.id] as const));

  // تمريرة 2: ربط الآباء*

  for (const r of toAdd) {

    if (!r.parent) continue;

    const pid = byCode.get(r.parent);

    const cid = byCode.get(r.code);

    if (pid && cid) { await supabase.from("gl_accounts").update({ parent_id: pid }).eq("id", cid); }

  }

  return { ok: true, added: (ins as any[])?.length || toAdd.length };

}



// استيراد شجرة حسابات من ملف (يضيف الأكواد غير الموجودة ويربط الآباء بالكود)*

export type ImportAccRow = { code: string; name: string; type: AccType; parent?: string | null; is_group?: boolean };

export async function importChart(orgId: number, rows: ImportAccRow[]): Promise<{ ok: boolean; error?: string; added: number; skipped: number }> {

  const existing = await fetchAccounts(orgId);

  const have = new Set(existing.map((a) => a.code));

  const clean = rows.filter((r) => r.code && String(r.code).trim() && r.name && String(r.name).trim());

  const toAdd = clean.filter((r) => !have.has(String(r.code).trim()));

  if (!toAdd.length) return { ok: true, added: 0, skipped: clean.length };

  const { error: e1 } = await supabase.from("gl_accounts").insert(

    toAdd.map((r) => ({ organization_id: orgId, code: String(r.code).trim(), name: String(r.name).trim(), type: r.type, is_group: !!r.is_group, parent_id: null }))

  );

  if (e1) { console.error("importChart insert", e1); return { ok: false, error: e1.message, added: 0, skipped: 0 }; }

  const all = await fetchAccounts(orgId);

  const byCode = new Map(all.map((a) => [a.code, a.id] as const));

  for (const r of toAdd) {

    const p = r.parent ? String(r.parent).trim() : "";

    if (!p) continue;

    const pid = byCode.get(p); const cid = byCode.get(String(r.code).trim());

    if (pid && cid) await supabase.from("gl_accounts").update({ parent_id: pid }).eq("id", cid);

  }

  return { ok: true, added: toAdd.length, skipped: clean.length - toAdd.length };

}



// ── القيود اليومية ──*

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



// ترويسة القيد (البيانات العامة)*

export type EntryHeader = {

  date: string;

  description: string | null;

  branch_id: number | null;        // مركز التكلفة الافتراضي للقيد*

  entry_type?: string;             // نوع القيد*

  notes?: string | null;           // ملاحظات عامة*

  status?: string;                 // 'posted' (مُرحّل) | 'draft' (مسودة)*

};



function linePayload(entryId: number, header: EntryHeader, lines: GLLine[]) {

  return lines

    .filter((l) => l.account_id && (Number(l.debit) || Number(l.credit)))

    .map((l) => ({

      entry_id: entryId,

      account_id: l.account_id,

      debit: Number(l.debit) || 0,

      credit: Number(l.credit) || 0,

      branch_id: l.branch_id ?? header.branch_id,   // مركز تكلفة لكل سطر (fallback لمركز القيد)*

      note: l.note || null,

      party_id: l.party_id ?? null,

    }));

}



export async function createEntry(

  orgId: number, header: EntryHeader, lines: GLLine[]

): Promise<{ ok: boolean; error?: string; id?: number }> {

  const year = Number(header.date.slice(0, 4));

  const entry_no = await nextEntryNo(orgId, year);

  const { data: head, error: e1 } = await supabase

    .from("gl_journal_entries")

    .insert({

      organization_id: orgId, entry_no, entry_year: year, date: header.date,

      description: header.description || null, branch_id: header.branch_id,

      entry_type: header.entry_type || "general", notes: header.notes || null,

      status: header.status || "posted",

    })

    .select("id")

    .single();

  if (e1 || !head) { console.error("createEntry head", e1); return { ok: false, error: e1?.message }; }

  const eid = (head as any).id;

  const { error: e2 } = await supabase.from("gl_journal_lines").insert(linePayload(eid, header, lines));

  if (e2) { console.error("createEntry lines", e2); await supabase.from("gl_journal_entries").delete().eq("id", eid); return { ok: false, error: e2.message }; }

  return { ok: true, id: eid };

}



// تعديل قيد قائم (يُبقي رقم القيد كما هو، ويستبدل سطوره بالكامل)*

export async function updateEntry(

  id: number, header: EntryHeader, lines: GLLine[]

): Promise<{ ok: boolean; error?: string }> {

  const { error: e0 } = await supabase

    .from("gl_journal_entries")

    .update({

      date: header.date, entry_year: Number(header.date.slice(0, 4)),

      description: header.description || null, branch_id: header.branch_id,

      entry_type: header.entry_type || "general", notes: header.notes || null,

      status: header.status || "posted",

    })

    .eq("id", id);

  if (e0) { console.error("updateEntry head", e0); return { ok: false, error: e0.message }; }

  const { error: eDel } = await supabase.from("gl_journal_lines").delete().eq("entry_id", id);

  if (eDel) { console.error("updateEntry delLines", eDel); return { ok: false, error: eDel.message }; }

  const { error: e2 } = await supabase.from("gl_journal_lines").insert(linePayload(id, header, lines));

  if (e2) { console.error("updateEntry lines", e2); return { ok: false, error: e2.message }; }

  return { ok: true };

}



// تغيير حالة القيد (ترحيل مسودة / إعادتها مسودة)*

export async function setEntryStatus(id: number, status: string): Promise<{ ok: boolean; error?: string }> {

  const { error } = await supabase.from("gl_journal_entries").update({ status }).eq("id", id);

  if (error) console.error("setEntryStatus", error);

  return { ok: !error, error: error?.message };

}



// ── مرفقات القيود (Supabase Storage) ──*

export const ATT_BUCKET = "journal-attachments";

export type GLAttachment = {

  id: number;

  entry_id: number;

  organization_id: number;

  file_name: string;

  file_path: string;          // المسار داخل الحاوية*

  mime_type: string | null;

  size_bytes: number | null;

  created_at?: string;

};



const sanitizeName = (s: string) => (s || "file").replace(/[^\w.\\-]+/g, "\_").slice(-80);



export async function fetchAttachments(entryId: number): Promise<GLAttachment[]> {

  const { data, error } = await supabase.from("gl_journal_attachments").select("*").eq("entry_id", entryId).order("id");

  if (error) { console.error("fetchAttachments", error); return []; }

  return (data as GLAttachment[]) || [];

}



export async function countAttachments(entryIds: number[]): Promise<Record<number, number>> {

  const out: Record<number, number> = {};

  if (!entryIds.length) return out;

  const { data, error } = await supabase.from("gl_journal_attachments").select("entry_id").in("entry_id", entryIds);

  if (error) { console.error("countAttachments", error); return out; }

  (data as any[]).forEach((r) => { out[r.entry_id] = (out[r.entry_id] || 0) + 1; });

  return out;

}



export async function uploadAttachment(orgId: number, entryId: number, file: File): Promise<{ ok: boolean; error?: string; row?: GLAttachment }> {

  const path = `${orgId}/${entryId}/${Date.now()}-${sanitizeName(file.name)}`;

  const { error: upErr } = await supabase.storage.from(ATT_BUCKET).upload(path, file, { upsert: false, contentType: file.type || undefined });

  if (upErr) { console.error("uploadAttachment storage", upErr); return { ok: false, error: upErr.message }; }

  const { data, error } = await supabase.from("gl_journal_attachments").insert({

    entry_id: entryId, organization_id: orgId, file_name: file.name, file_path: path,

    mime_type: file.type || null, size_bytes: file.size || null,

  }).select("*").single();

  if (error) {

    console.error("uploadAttachment row", error);

    await supabase.storage.from(ATT_BUCKET).remove([path]);  // تراجُع عن الرفع لو فشل تسجيل الصف*

    return { ok: false, error: error.message };

  }

  return { ok: true, row: data as GLAttachment };

}



export async function deleteAttachment(att: GLAttachment): Promise<{ ok: boolean; error?: string }> {

  await supabase.storage.from(ATT_BUCKET).remove([att.file_path]);

  const { error } = await supabase.from("gl_journal_attachments").delete().eq("id", att.id);

  if (error) { console.error("deleteAttachment", error); return { ok: false, error: error.message }; }

  return { ok: true };

}



export async function signedUrl(path: string, expires = 3600): Promise<string | null> {

  const { data, error } = await supabase.storage.from(ATT_BUCKET).createSignedUrl(path, expires);

  if (error) { console.error("signedUrl", error); return null; }

  return data?.signedUrl || null;

}



export async function deleteEntry(id: number): Promise<{ ok: boolean; error?: string }> {

  // نظّف المرفقات (ملفات التخزين + سجلاتها) قبل حذف القيد*

  const atts = await fetchAttachments(id);

  if (atts.length) {

    await supabase.storage.from(ATT_BUCKET).remove(atts.map((a) => a.file_path));

    await supabase.from("gl_journal_attachments").delete().eq("entry_id", id);

  }

  const { error } = await supabase.from("gl_journal_entries").delete().eq("id", id);

  return { ok: !error, error: error?.message };

}



// حركة حساب (لكشف الحساب) ضمن فترة — ترجع السطور مع تاريخ ووصف القيد*

export type LedgerLine = { date: string; entry_no: number; description: string | null; branch_id: number | null; account_id: number; party_id: number | null; debit: number; credit: number; note: string | null };



// كشف حركة عدة حسابات معًا (يُستخدم لتجميع حركة حساب أب وكل فروعه)*

// partyId اختياري: لتفصيل كشف عميل/مورد فرعي على حساب المركز حسب وسم الطرف*

export async function fetchLedgerMulti(orgId: number, accountIds: number[], from: string, to: string, branchId?: number | null, partyId?: number | null): Promise<LedgerLine[]> {

  if (!accountIds.length) return [];

  let q = supabase

    .from("gl_journal_lines")

    .select("account_id, party_id, debit, credit, branch_id, note, entry:gl_journal_entries!inner(date, entry_no, description, organization_id)")

    .in("account_id", accountIds)

    .gte("entry.date", from)

    .lte("entry.date", to)

    .eq("entry.organization_id", orgId);

  if (branchId != null) q = q.eq("branch_id", branchId);

  if (partyId != null) q = q.eq("party_id", partyId);

  const { data, error } = await q;

  if (error) { console.error("fetchLedgerMulti", error); return []; }

  const rows = ((data as any[]) || []).map((r) => ({

    date: r.entry?.date, entry_no: r.entry?.entry_no, description: r.entry?.description,

    branch_id: r.branch_id, account_id: r.account_id, party_id: r.party_id ?? null, debit: Number(r.debit) || 0, credit: Number(r.credit) || 0, note: r.note,

  }));

  rows.sort((a, b) => (a.date || "").localeCompare(b.date || "") || (a.entry_no - b.entry_no));

  return rows;

}



export async function fetchLedger(orgId: number, accountId: number, from: string, to: string, branchId?: number | null): Promise<LedgerLine[]> {

  return fetchLedgerMulti(orgId, [accountId], from, to, branchId);

}



// معرّفات الحساب نفسه + كل الحسابات الورقية تحته (لتجميع كشف حساب أب)*

export function descendantPostableIds(accounts: GLAccount[], rootId: number): number[] {

  const childrenOf = new Map<number | null, GLAccount[]>();

  accounts.forEach((a) => { const k = a.parent_id ?? null; if (!childrenOf.has(k)) childrenOf.set(k, []); childrenOf.get(k)!.push(a); });

  const ids = new Set<number>([rootId]);   // اشمل الحساب نفسه (قد يحمل حركة قديمة قبل تحويله لتجميعي)*

  const walk = (id: number) => {

    (childrenOf.get(id) || []).forEach((c) => { if (!c.is_group) ids.add(c.id); walk(c.id); });

  };

  walk(rootId);

  return [...ids];

}



// ── الأصول الثابتة + الإهلاك (قسط ثابت) ──*

export type GLAsset = {

  id: number;

  organization_id: number;

  branch_id: number | null;

  name: string;

  category: string | null;

  acquire_date: string;             // تاريخ الاقتناء*

  cost: number;                     // التكلفة*

  salvage_value: number;            // القيمة التخريدية*

  useful_life_years: number;        // العمر الإنتاجي بالسنوات*

  account_id: number | null;        // حساب الأصل (اختياري)*

  expense_account_id: number | null; // حساب مصروف الإهلاك (مدين عند الترحيل)*

  accum_account_id: number | null;   // حساب مجمع الإهلاك (دائن عند الترحيل)*

  depr_posted: number;               // الإهلاك المُرحَّل محاسبيًا حتى الآن (لمنع الازدواج)*

  notes: string | null;

  is_active: boolean;

  created_at?: string;

};



export async function fetchAssets(orgId: number, branchId?: number | null): Promise<GLAsset[]> {

  let q = supabase.from("gl_assets").select("*").eq("organization_id", orgId).order("acquire_date", { ascending: false });

  if (branchId != null) q = q.eq("branch_id", branchId);

  const { data, error } = await q;

  if (error) { console.error("fetchAssets", error); return []; }

  return (data as GLAsset[]) || [];

}



export async function upsertAsset(a: Partial<GLAsset>): Promise<{ ok: boolean; error?: string }> {

  const anyA = a as any;

  const { error } = anyA.id

    ? await supabase.from("gl_assets").update((({ id, ...rest }) => rest)(anyA)).eq("id", anyA.id)

    : await supabase.from("gl_assets").insert(anyA);

  if (error) console.error("upsertAsset", error);

  return { ok: !error, error: error?.message };

}



export async function deleteAsset(id: number): Promise<{ ok: boolean; error?: string }> {

  const { error } = await supabase.from("gl_assets").delete().eq("id", id);

  if (error) console.error("deleteAsset", error);

  return { ok: !error, error: error?.message };

}



// حساب الإهلاك بالقسط الثابت حتى تاريخ معيّن*

export type Depreciation = {

  depreciable: number;   // الأساس القابل للإهلاك = التكلفة − التخريدية*

  annual: number;        // إهلاك سنوي*

  monthly: number;       // إهلاك شهري*

  months: number;        // عدد الأشهر المنقضية حتى asOf*

  accumulated: number;   // مجمع الإهلاك*

  bookValue: number;     // القيمة الدفترية = التكلفة − المجمع*

};

export function depreciation(a: { cost: number; salvage_value: number; useful_life_years: number; acquire_date: string }, asOf: string): Depreciation {

  const cost = Number(a.cost) || 0;

  const salvage = Number(a.salvage_value) || 0;

  const life = Number(a.useful_life_years) || 0;

  const depreciable = Math.max(0, cost - salvage);

  const annual = life > 0 ? depreciable / life : 0;

  const monthly = annual / 12;

  // عدد الأشهر من تاريخ الاقتناء حتى asOf*

  const [ay, am, ad] = (a.acquire_date || "").split("-").map(Number);

  const [oy, om, od] = (asOf || "").split("-").map(Number);

  let months = 0;

  if (ay && oy) {

    months = (oy - ay) * 12 + (om - am);

    if (od < ad) months -= 1;           // لم يكتمل الشهر الجاري*

    months = Math.max(0, months);

  }

  const accumulated = Math.min(depreciable, monthly * months);

  const bookValue = cost - accumulated;

  return { depreciable, annual, monthly, months, accumulated, bookValue };

}



// ترحيل قيد الإهلاك: لكل أصل سطر مدين «مصروف إهلاك» وسطر دائن «مجمع إهلاك» بقيمة*

// المستحق غير المُرحَّل، ثم تحديث depr_posted لمنع الازدواج عند إعادة الترحيل.*

export async function postDepreciation(

  orgId: number,

  header: { date: string; branch_id: number | null; notes?: string | null },

  items: { assetId: number; name: string; amount: number; expAcc: number; accAcc: number; branch: number | null; priorPosted: number }[]

): Promise<{ ok: boolean; error?: string; id?: number; total?: number }> {

  const lines: GLLine[] = [];

  let total = 0;

  for (const it of items) {

    if (!(it.amount > 0) || !it.expAcc || !it.accAcc) continue;

    const amt = Math.round(it.amount * 100) / 100;

    lines.push({ account_id: it.expAcc, debit: amt, credit: 0, branch_id: it.branch ?? header.branch_id, note: `إهلاك ${it.name}` });

    lines.push({ account_id: it.accAcc, debit: 0, credit: amt, branch_id: it.branch ?? header.branch_id, note: `مجمع إهلاك ${it.name}` });

    total += amt;

  }

  if (!lines.length) return { ok: false, error: "لا يوجد إهلاك مستحق للترحيل" };

  const res = await createEntry(orgId, {

    date: header.date,

    description: `قيد إهلاك الأصول حتى ${header.date}`,

    branch_id: header.branch_id,

    entry_type: "depreciation",

    notes: header.notes || null,

    status: "posted",

  }, lines);

  if (!res.ok) return { ok: false, error: res.error };

  // تحديث المُرحَّل لكل أصل (بعد نجاح القيد)*

  for (const it of items) {

    if (!(it.amount > 0)) continue;

    const newPosted = Math.round((it.priorPosted + it.amount) * 100) / 100;

    await supabase.from("gl_assets").update({ depr_posted: newPosted }).eq("id", it.assetId);

  }

  return { ok: true, id: res.id, total };

}



// ── الأرصدة الافتتاحية (قيد افتتاحي واحد من نوع opening) ──*

export async function fetchOpeningEntries(orgId: number): Promise<EntryWithLines[]> {

  const { data, error } = await supabase

    .from("gl_journal_entries")

    .select("*, lines:gl_journal_lines(*)")

    .eq("organization_id", orgId)

    .eq("entry_type", "opening")

    .order("date", { ascending: true });

  if (error) { console.error("fetchOpeningEntries", error); return []; }

  return (data as any[]) || [];

}



// يحذف القيد الافتتاحي القديم (إن وُجد) ثم ينشئ قيدًا جديدًا متوازنًا؛*

// natureById تحدّد طبيعة كل حساب، والفرق يُقفَل في balancingAccountId.*

export async function saveOpeningBalances(

  orgId: number,

  params: { date: string; branch_id: number | null; balancingAccountId: number; natureById: Map<number, "debit" | "credit">; balances: { accountId: number; amount: number }[] }

): Promise<{ ok: boolean; error?: string; id?: number; plug?: number }> {

  // احذف أي قيد افتتاحي سابق (قابل لإعادة الإدخال دون ازدواج)*

  const existing = await fetchOpeningEntries(orgId);

  for (const e of existing) await deleteEntry(e.id);



  // اجمع لكل حساب صافيه (مدين موجب)*

  const net = new Map<number, number>();

  const add = (id: number, signed: number) => net.set(id, Math.round(((net.get(id) || 0) + signed) * 100) / 100);

  for (const b of params.balances) {

    const amt = Math.round((Number(b.amount) || 0) * 100) / 100;

    if (!amt) continue;

    add(b.accountId, params.natureById.get(b.accountId) === "debit" ? amt : -amt);

  }

  let D = 0, C = 0;

  net.forEach((v) => { if (v > 0) D += v; else C += -v; });

  const plug = Math.round((D - C) * 100) / 100;

  // plug>0 (مدين أكبر) ⇒ دائن على حساب الموازنة؛ plug<0 ⇒ مدين. كلاهما = add(-plug)*

  if (Math.abs(plug) > 0.009) add(params.balancingAccountId, -plug);



  const lines: GLLine[] = [];

  net.forEach((v, id) => {

    if (Math.abs(v) < 0.009) return;

    if (v > 0) lines.push({ account_id: id, debit: v, credit: 0 });

    else lines.push({ account_id: id, debit: 0, credit: -v });

  });

  if (!lines.length) return { ok: false, error: "لا توجد أرصدة لإدخالها" };



  const res = await createEntry(orgId, {

    date: params.date, description: "الأرصدة الافتتاحية",

    branch_id: params.branch_id, entry_type: "opening", notes: null, status: "posted",

  }, lines);

  if (!res.ok) return { ok: false, error: res.error };

  return { ok: true, id: res.id, plug };

}



// ── الخزن والبنوك + سندات القبض/الصرف ──*

export type GLTreasury = {

  id: number;

  organization_id: number;

  branch_id: number | null;

  name: string;

  kind: string;                 // 'cash' (خزنة) | 'bank' (بنك)*

  account_id: number | null;    // حساب الخزنة/البنك في دليل الحسابات*

  opening_balance: number;

  is_active: boolean;

  created_at?: string;

};



export async function fetchTreasuries(orgId: number, branchId?: number | null): Promise<GLTreasury[]> {

  let q = supabase.from("gl_treasuries").select("*").eq("organization_id", orgId).order("id");

  if (branchId != null) q = q.eq("branch_id", branchId);

  const { data, error } = await q;

  if (error) { console.error("fetchTreasuries", error); return []; }

  return (data as GLTreasury[]) || [];

}



export async function upsertTreasury(t: Partial<GLTreasury>): Promise<{ ok: boolean; error?: string }> {

  const anyT = t as any;

  const { error } = anyT.id

    ? await supabase.from("gl_treasuries").update((({ id, ...rest }) => rest)(anyT)).eq("id", anyT.id)

    : await supabase.from("gl_treasuries").insert(anyT);

  if (error) console.error("upsertTreasury", error);

  return { ok: !error, error: error?.message };

}



export async function deleteTreasury(id: number): Promise<{ ok: boolean; error?: string }> {

  const { error } = await supabase.from("gl_treasuries").delete().eq("id", id);

  if (error) console.error("deleteTreasury", error);

  return { ok: !error, error: error?.message };

}



// صافي حركة حساب (مدين − دائن) من القيود المُرحّلة حتى تاريخ (لحساب رصيد الخزنة)*

export async function fetchAccountNet(orgId: number, accountId: number, branchId?: number | null, asOf?: string): Promise<number> {

  let q = supabase

    .from("gl_journal_lines")

    .select("debit, credit, branch_id, entry:gl_journal_entries!inner(organization_id, date, status)")

    .eq("account_id", accountId)

    .eq("entry.organization_id", orgId)

    .eq("entry.status", "posted");

  if (asOf) q = q.lte("entry.date", asOf);

  if (branchId != null) q = q.eq("branch_id", branchId);

  const { data, error } = await q;

  if (error) { console.error("fetchAccountNet", error); return 0; }

  return ((data as any[]) || []).reduce((s, r) => s + (Number(r.debit) || 0) - (Number(r.credit) || 0), 0);

}



// إنشاء سند قبض/صرف → يولّد قيدًا متوازنًا تلقائيًا*

export async function createVoucher(orgId: number, v: {

  kind: "receipt" | "payment";

  date: string;

  treasury_account_id: number;

  counter_account_id: number;

  amount: number;

  description: string | null;

  notes: string | null;

  branch_id: number | null;

  party_id?: number | null;   // وسم الطرف على سطر الحساب المقابل*

}): Promise<{ ok: boolean; error?: string; id?: number }> {

  const amt = Number(v.amount) || 0;

  if (amt <= 0) return { ok: false, error: "المبلغ يجب أن يكون أكبر من صفر" };

  if (!v.treasury_account_id || !v.counter_account_id) return { ok: false, error: "اختر الخزنة والحساب المقابل" };

  if (v.treasury_account_id === v.counter_account_id) return { ok: false, error: "الخزنة والحساب المقابل لا يمكن أن يكونا نفس الحساب" };

  const pid = v.party_id ?? null;

  // سند قبض: نقدية مدينة / الحساب المقابل دائن — سند صرف: العكس (الطرف يوسم على سطر الحساب المقابل)*

  const lines: GLLine[] = v.kind === "receipt"

    ? [{ account_id: v.treasury_account_id, debit: amt, credit: 0 }, { account_id: v.counter_account_id, debit: 0, credit: amt, party_id: pid }]

    : [{ account_id: v.counter_account_id, debit: amt, credit: 0, party_id: pid }, { account_id: v.treasury_account_id, debit: 0, credit: amt }];

  return createEntry(orgId, {

    date: v.date, description: v.description, branch_id: v.branch_id,

    entry_type: v.kind, notes: v.notes, status: "posted",

  }, lines);

}



// ── العملاء والموردين (الذمم) + أعمار الدين ──*

export type PartyType = "customer" | "supplier";

export type GLParty = {

  id: number;

  organization_id: number;

  branch_id: number | null;

  type: string;                 // customer | supplier*

  name: string;

  account_id: number | null;    // حساب الذمة*

  credit_days: number;          // مدة السداد (أيام)*

  phone: string | null;

  address: string | null;

  tax_number: string | null;

  parent_id: number | null;     // طرف أب (مركز) للعملاء الفرعيين*

  is_active: boolean;

  notes: string | null;

  created_at?: string;

};



export async function fetchParties(orgId: number, type?: string, branchId?: number | null): Promise<GLParty[]> {

  let q = supabase.from("gl_parties").select("*").eq("organization_id", orgId).order("name");

  if (type) q = q.eq("type", type);

  if (branchId != null) q = q.eq("branch_id", branchId);

  const { data, error } = await q;

  if (error) { console.error("fetchParties", error); return []; }

  return (data as GLParty[]) || [];

}



export async function upsertParty(p: Partial<GLParty>): Promise<{ ok: boolean; error?: string }> {

  const anyP = p as any;

  const { error } = anyP.id

    ? await supabase.from("gl_parties").update((({ id, ...rest }) => rest)(anyP)).eq("id", anyP.id)

    : await supabase.from("gl_parties").insert(anyP);

  if (error) console.error("upsertParty", error);

  return { ok: !error, error: error?.message };

}



export async function deleteParty(id: number): Promise<{ ok: boolean; error?: string }> {

  const { error } = await supabase.from("gl_parties").delete().eq("id", id);

  if (error) console.error("deleteParty", error);

  return { ok: !error, error: error?.message };

}



// مساعدات تواريخ لأعمار الدين*

function addDaysISO(d: string, days: number): string {

  const [y, m, dd] = (d || "").split("-").map(Number);

  const t = new Date(y, (m || 1) - 1, (dd || 1) + (days || 0));

  const z = (n: number) => String(n).padStart(2, "0");

  return `${t.getFullYear()}-${z(t.getMonth() + 1)}-${z(t.getDate())}`;

}

function daysDiff(a: string, b: string): number {   // b - a بالأيام*

  const da = new Date((a || "") + "T00:00:00").getTime();

  const db = new Date((b || "") + "T00:00:00").getTime();

  return Math.round((db - da) / 86400000);

}



export type Aging = { current: number; d30: number; d60: number; d90: number; d90p: number; total: number };



// أعمار الدين بطريقة FIFO: تُطبَّق المدفوعات على أقدم المديونيات، ثم تُبوَّب المتبقّية حسب تاريخ الاستحقاق*

export function partyAging(

  lines: { date: string; debit: number; credit: number }[],

  type: string, creditDays: number, asOf: string

): Aging {

  const chargeIsDebit = type === "customer";   // العميل: مدين = مديونية · المورد: دائن = مديونية*

  const sorted = [...lines].sort((a, b) => (a.date || "").localeCompare(b.date || ""));

  const open: { due: string; amt: number }[] = [];

  for (const l of sorted) {

    const charge = chargeIsDebit ? (Number(l.debit) || 0) : (Number(l.credit) || 0);

    const pay = chargeIsDebit ? (Number(l.credit) || 0) : (Number(l.debit) || 0);

    if (charge > 0) open.push({ due: addDaysISO(l.date, creditDays || 0), amt: charge });

    if (pay > 0) {

      let p = pay;

      while (p > 1e-9 && open.length) {

        if (open[0].amt <= p + 1e-9) { p -= open[0].amt; open.shift(); }

        else { open[0].amt -= p; p = 0; }

      }

    }

  }

  const b: Aging = { current: 0, d30: 0, d60: 0, d90: 0, d90p: 0, total: 0 };

  for (const o of open) {

    const age = daysDiff(o.due, asOf);

    if (age <= 0) b.current += o.amt;

    else if (age <= 30) b.d30 += o.amt;

    else if (age <= 60) b.d60 += o.amt;

    else if (age <= 90) b.d90 += o.amt;

    else b.d90p += o.amt;

    b.total += o.amt;

  }

  return b;

}



// ══════════════ فواتير المبيعات (نقدي/آجل/جزئي + ضريبة) ══════════════*



// ── عروض أسعار المبيعات ──*

export type GLQuotation = {

  id: number;

  organization_id: number;

  branch_id: number | null;

  quotation_no: number;

  quotation_year: number;

  date: string;

  valid_until: string | null;

  party_id: number | null;

  customer_name: string | null;

  items: SalesItem[];

  subtotal: number;

  discount_amount: number;

  tax_rate: number;

  tax_amount: number;

  tax_inclusive: boolean;

  total: number;

  notes: string | null;

  status: "draft" | "sent" | "accepted" | "rejected" | "expired" | "converted";

  invoice_id: number | null;

  created_at?: string;

};



export async function nextQuotationNo(orgId: number, year: number, branchId: number | null): Promise<number> {

  // Atomic, branch-scoped counter. Requires the migration RPC below.*

  const { data, error } = await supabase.rpc("next_gl_sales_quotation_no", {

    p_org_id: orgId,

    p_branch_id: branchId,

    p_year: year,

  });

  if (error) {

    console.error("nextQuotationNo", error);

    throw new Error(error.message);

  }

  return Number(data);

}



export async function fetchQuotations(orgId: number, from: string, to: string, branchId?: number | null): Promise<GLQuotation[]> {

  let q = supabase.from("gl_sales_quotations").select("*").eq("organization_id", orgId)

    .gte("date", from).lte("date", to).order("date", { ascending: false }).order("quotation_no", { ascending: false });

  if (branchId != null) q = q.eq("branch_id", branchId);

  const { data, error } = await q;

  if (error) { console.error("fetchQuotations", error); return []; }

  return (data as GLQuotation[]) || [];

}



export async function createQuotation(orgId: number, quotation: {

  branch_id: number | null; date: string; valid_until: string | null;

  party_id: number | null; customer_name: string | null; items: SalesItem[];

  discount_amount: number; tax_rate: number; tax_inclusive: boolean; notes: string | null;

}): Promise<{ ok: boolean; error?: string; id?: number; quotationNo?: number }> {

  const gross = Math.round(quotation.items.reduce((sum, item) =>

    sum + (Number(item.qty) || 0) * (Number(item.unit_price) || 0), 0) * 100) / 100;

  const discount = Math.min(Math.max(Number(quotation.discount_amount) || 0, 0), gross);

  const discountedGross = Math.round((gross - discount) * 100) / 100;

  const rate = Math.max(0, Number(quotation.tax_rate) || 0);

  const totals = invoiceTotals([{ qty: 1, unit_price: discountedGross }], rate, quotation.tax_inclusive);

  if (!quotation.items.length || gross <= 0 || totals.total <= 0)

    return { ok: false, error: "أضف صنفًا واحدًا على الأقل بقيمة صحيحة." };

  const year = Number(quotation.date.slice(0, 4));

  let quotationNo: number;

  try { quotationNo = await nextQuotationNo(orgId, year, quotation.branch_id); }

  catch (e) { return { ok: false, error: e instanceof Error ? e.message : "تعذر إنشاء رقم العرض." }; }

  const { data, error } = await supabase.from("gl_sales_quotations").insert({

    organization_id: orgId, branch_id: quotation.branch_id, quotation_no: quotationNo, quotation_year: year,

    date: quotation.date, valid_until: quotation.valid_until, party_id: quotation.party_id,

    customer_name: quotation.customer_name, items: quotation.items, subtotal: totals.subtotal,

    discount_amount: discount, tax_rate: rate, tax_amount: totals.tax, tax_inclusive: quotation.tax_inclusive,

    total: totals.total, notes: quotation.notes, status: "draft",

  }).select("id").single();

  if (error) { console.error("createQuotation", error); return { ok: false, error: error.message }; }

  return { ok: true, id: Number((data as any).id), quotationNo };

}



export async function deleteQuotation(id: number): Promise<{ ok: boolean; error?: string }> {

  const { error } = await supabase.from("gl_sales_quotations").delete()

    .eq("id", id).is("invoice_id", null).neq("status", "converted");

  if (error) console.error("deleteQuotation", error);

  return { ok: !error, error: error?.message };

}



export async function markQuotationConverted(id: number, invoiceId: number): Promise<{ ok: boolean; error?: string }> {

  const { data, error } = await supabase.from("gl_sales_quotations").update({

    status: "converted", invoice_id: invoiceId, updated_at: new Date().toISOString()

  }).eq("id", id).is("invoice_id", null).neq("status", "converted").select("id").maybeSingle();

  if (error) { console.error("markQuotationConverted", error); return { ok: false, error: error.message }; }

  if (!data) return { ok: false, error: "تم تحويل العرض مسبقًا أو لم يعد متاحًا للتحديث." };

  return { ok: true };

}





export type SalesItem = { description: string; qty: number; unit_price: number; line_total: number };

export type SalesPayType = "cash" | "credit" | "partial";

export const PAYTYPE_LABEL: Record<SalesPayType, string> = { cash: "نقدي", credit: "آجل", partial: "جزئي" };



export type GLSalesInvoice = {

  id: number;

  organization_id: number;

  branch_id: number | null;

  invoice_no: number;

  invoice_year: number;

  date: string;

  party_id: number | null;

  customer_name: string | null;

  payment_type: SalesPayType;

  treasury_account_id: number | null;

  paid_amount: number;

  subtotal: number;

  tax_rate: number;

  tax_amount: number;

  tax_inclusive: boolean;

  total: number;

  items: SalesItem[];

  notes: string | null;

  entry_id: number | null;

  status: string;

  created_at?: string;

};



// حساب إجماليات الفاتورة من الأسطر والضريبة*

export function invoiceTotals(items: { qty: number; unit_price: number }[], taxRate: number, taxInclusive: boolean) {

  const gross = Math.round(items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.unit_price) || 0), 0) * 100) / 100;

  const r = (Number(taxRate) || 0) / 100;

  let subtotal: number, tax: number, total: number;

  if (taxInclusive) { total = gross; subtotal = Math.round((gross / (1 + r)) * 100) / 100; tax = Math.round((total - subtotal) * 100) / 100; }

  else { subtotal = gross; tax = Math.round(gross * r * 100) / 100; total = Math.round((subtotal + tax) * 100) / 100; }

  return { gross, subtotal, tax, total };

}



export async function nextInvoiceNo(orgId: number, year: number): Promise<number> {

  const { data } = await supabase

    .from("gl_sales_invoices").select("invoice_no")

    .eq("organization_id", orgId).eq("invoice_year", year)

    .order("invoice_no", { ascending: false }).limit(1);

  return (((data as any[])?.[0]?.invoice_no as number) || 0) + 1;

}



export async function fetchSalesInvoices(orgId: number, from: string, to: string, branchId?: number | null): Promise<GLSalesInvoice[]> {

  let q = supabase.from("gl_sales_invoices").select("*")

    .eq("organization_id", orgId).gte("date", from).lte("date", to)

    .order("date", { ascending: false }).order("invoice_no", { ascending: false });

  if (branchId != null) q = q.eq("branch_id", branchId);

  const { data, error } = await q;

  if (error) { console.error("fetchSalesInvoices", error); return []; }

  return (data as GLSalesInvoice[]) || [];

}



/**
 * تحويل عرض السعر إلى فاتورة وقيد محاسبي من خلال RPC ذرية واحدة.
 * تضمن الدالة في قاعدة البيانات عدم إنشاء فاتورة مكررة عند إعادة المحاولة.
 */
export async function convertQuotationToInvoice(args: {
  org_id: number;
  quotation_id: number;
  invoice_date: string;
  payment_type: SalesPayType;
  treasury_account_id: number | null;
  customer_account_id: number | null;
  revenue_account_id: number;
  tax_account_id: number | null;
  paid_amount: number;
}): Promise<{
  ok: boolean;
  error?: string;
  id?: number;
  entryId?: number;
  invoiceNo?: number;
  invoiceYear?: number;
  alreadyConverted?: boolean;
}> {
  const { data, error } = await supabase.rpc(
    "convert_gl_sales_quotation_to_invoice",
    {
      p_org_id: args.org_id,
      p_quotation_id: args.quotation_id,
      p_invoice_date: args.invoice_date,
      p_payment_type: args.payment_type,
      p_treasury_account_id: args.treasury_account_id,
      p_customer_account_id: args.customer_account_id,
      p_revenue_account_id: args.revenue_account_id,
      p_tax_account_id: args.tax_account_id,
      p_paid_amount: args.paid_amount,
    }
  );

  if (error) {
    console.error("convertQuotationToInvoice", error);
    return { ok: false, error: error.message };
  }

  const result = data as {
    ok?: boolean;
    invoice_id?: number | string;
    invoice_no?: number | string;
    invoice_year?: number | string;
    entry_id?: number | string;
    already_converted?: boolean;
    error?: string;
  } | null;

  if (!result?.ok || !result.invoice_id) {
    return { ok: false, error: result?.error || "لم تُرجع قاعدة البيانات بيانات الفاتورة." };
  }

  return {
    ok: true,
    id: Number(result.invoice_id),
    invoiceNo: Number(result.invoice_no),
    invoiceYear: Number(result.invoice_year),
    entryId: Number(result.entry_id),
    alreadyConverted: Boolean(result.already_converted),
  };
}

export async function createSalesInvoice(orgId: number, inv: {

  branch_id: number | null; date: string;

  party_id: number | null; customer_name: string | null;

  payment_type: SalesPayType;

  treasury_account_id: number | null; customer_account_id: number | null;

  revenue_account_id: number; tax_account_id: number | null;

  tax_rate: number; tax_inclusive: boolean;

  items: SalesItem[]; paid_amount: number; notes: string | null;

}): Promise<{ ok: boolean; error?: string; id?: number; entryId?: number; invoiceNo?: number }> {

  const t = invoiceTotals(inv.items, inv.tax_rate, inv.tax_inclusive);

  if (t.total <= 0) return { ok: false, error: "إجمالي الفاتورة صفر — أضف أصنافًا بقيمة." };

  const paid = inv.payment_type === "cash" ? t.total : inv.payment_type === "credit" ? 0 : Math.min(Math.max(Number(inv.paid_amount) || 0, 0), t.total);

  const due = Math.round((t.total - paid) * 100) / 100;



  if (paid > 0 && !inv.treasury_account_id) return { ok: false, error: "اختر خزنة/بنك التحصيل للجزء النقدي." };

  if (due > 0 && !inv.customer_account_id) return { ok: false, error: "اختر العميل (حساب ذمة) للجزء الآجل." };

  if (t.tax > 0 && !inv.tax_account_id) return { ok: false, error: "اختر حساب «الضريبة المستحقة»." };



  // قيد الفاتورة: مدين (خزنة + عميل) = دائن (إيراد + ضريبة)*

  const lines: GLLine[] = [];

  if (paid > 0) lines.push({ account_id: inv.treasury_account_id as number, debit: paid, credit: 0, branch_id: inv.branch_id });

  if (due > 0) lines.push({ account_id: inv.customer_account_id as number, debit: due, credit: 0, branch_id: inv.branch_id, party_id: inv.party_id ?? null });

  lines.push({ account_id: inv.revenue_account_id, debit: 0, credit: t.subtotal, branch_id: inv.branch_id });

  if (t.tax > 0) lines.push({ account_id: inv.tax_account_id as number, debit: 0, credit: t.tax, branch_id: inv.branch_id });



  const cust = inv.customer_name || "عميل نقدي";

  const res = await createEntry(orgId, {

    date: inv.date, description: `فاتورة مبيعات — ${cust}`,

    branch_id: inv.branch_id, entry_type: "sales", notes: inv.notes || null, status: "posted",

  }, lines);

  if (!res.ok) return { ok: false, error: res.error };



  const year = Number(inv.date.slice(0, 4));

  const invoice_no = await nextInvoiceNo(orgId, year);

  const { data, error } = await supabase.from("gl_sales_invoices").insert({

    organization_id: orgId, branch_id: inv.branch_id, invoice_no, invoice_year: year, date: inv.date,

    party_id: inv.party_id ?? null, customer_name: inv.customer_name || null,

    payment_type: inv.payment_type, treasury_account_id: inv.treasury_account_id ?? null,

    paid_amount: paid, subtotal: t.subtotal, tax_rate: inv.tax_rate, tax_amount: t.tax,

    tax_inclusive: inv.tax_inclusive, total: t.total, items: inv.items, notes: inv.notes || null,

    entry_id: res.id, status: "posted",

  }).select("id").single();

  if (error) { // تراجع عن القيد إن فشل حفظ الفاتورة*

    if (res.id) await deleteEntry(res.id);

    console.error("createSalesInvoice", error);

    return { ok: false, error: error.message };

  }

  return { ok: true, id: (data as any).id, entryId: res.id, invoiceNo: invoice_no };

}





// إحضار سطور قيد الفاتورة الأصلية لاستخراج حساب ضريبة المخرجات المستخدم فعليًا.
export async function fetchJournalLines(entryId: number): Promise<GLLine[]> {
  if (!entryId || entryId <= 0) return [];
  const { data, error } = await supabase
    .from("gl_journal_lines")
    .select("*")
    .eq("entry_id", entryId);
  if (error) {
    console.error("fetchJournalLines", error);
    throw new Error(error.message);
  }
  return (data as GLLine[]) || [];
}

export type SalesReturnItem = { original_item_index: number; description: string; qty: number; unit_price: number; line_total: number };
export type GLSalesReturn = {
  id: number; organization_id: number; branch_id: number | null; return_no: number; return_year: number;
  date: string; original_invoice_id: number; original_invoice_no: number; original_invoice_year: number;
  party_id: number | null; customer_name: string | null; subtotal: number; tax_amount: number; total: number;
  items: SalesReturnItem[]; refund_mode: "cash" | "credit"; refund_account_id: number | null;
  notes: string | null; entry_id: number | null; status: string;
};

export async function fetchSalesReturns(orgId: number): Promise<GLSalesReturn[]> {
  const { data, error } = await supabase.from("gl_sales_returns").select("*").eq("organization_id", orgId).order("date", { ascending: false }).order("return_no", { ascending: false });
  if (error) { console.error("fetchSalesReturns", error); return []; }
  return (data as GLSalesReturn[]) || [];
}

export async function createSalesReturn(orgId: number, args: {
  original_invoice: GLSalesInvoice; date: string; items: SalesReturnItem[]; subtotal: number; tax_amount: number; total: number;
  notes: string | null; refund_mode: "cash" | "credit"; refund_account_id: number | null; entry_lines: GLLine[];
}): Promise<{ ok: boolean; error?: string; id?: number; returnNo?: number; returnYear?: number; returnLabel?: string }> {
  const inv = args.original_invoice;
  if (!args.items.length || args.total <= 0) return { ok: false, error: "لا توجد أصناف أو قيمة صالحة للمرتجع." };
  const year = Number(args.date.slice(0, 4));
  // رقم مستقل ذري لكل مؤسسة وسنة. قد تظهر فجوات أرقام عند إلغاء عملية حفظ، وهذا مقبول محاسبيًا.
  const { data: seqData, error: seqError } = await supabase.rpc("next_gl_sales_return_no", { p_org_id: orgId, p_year: year });
  if (seqError) return { ok: false, error: `تعذّر حجز رقم المرتجع: ${seqError.message}. نفّذ ملف SQL المرفق أولًا.` };
  const returnNo = Number(seqData);
  if (!returnNo) return { ok: false, error: "لم تُرجع قاعدة البيانات رقم مرتجع صالحًا." };
  const entry = await createEntry(orgId, {
    date: args.date, description: `مرتجع مبيعات SR-${year}-${String(returnNo).padStart(4,"0")} — فاتورة ${inv.invoice_no}/${inv.invoice_year}`,
    branch_id: inv.branch_id, entry_type: "sales_return", notes: args.notes, status: "posted",
  }, args.entry_lines);
  if (!entry.ok || !entry.id) return { ok: false, error: entry.error || "تعذّر إنشاء القيد المحاسبي." };
  const payload = {
    organization_id: orgId, branch_id: inv.branch_id, return_no: returnNo, return_year: year, date: args.date,
    original_invoice_id: inv.id, original_invoice_no: inv.invoice_no, original_invoice_year: inv.invoice_year,
    party_id: inv.party_id, customer_name: inv.customer_name, subtotal: args.subtotal, tax_amount: args.tax_amount,
    total: args.total, items: args.items, refund_mode: args.refund_mode, refund_account_id: args.refund_account_id,
    notes: args.notes, entry_id: entry.id, status: "posted",
  };
  const { data, error } = await supabase.from("gl_sales_returns").insert(payload).select("id").single();
  if (error) {
    await deleteEntry(entry.id);
    console.error("createSalesReturn", error);
    return { ok: false, error: error.message };
  }
  return { ok: true, id: Number((data as any).id), returnNo, returnYear: year, returnLabel: `SR-${year}-${String(returnNo).padStart(4,"0")}` };
}

export async function deleteSalesInvoice(inv: GLSalesInvoice): Promise<{ ok: boolean; error?: string }> {
  const { count, error: returnsError } = await supabase.from("gl_sales_returns").select("id", { count: "exact", head: true }).eq("original_invoice_id", inv.id);
  if (returnsError) return { ok: false, error: `تعذّر التحقق من المرتجعات المرتبطة: ${returnsError.message}` };
  if ((count || 0) > 0) return { ok: false, error: "لا يمكن حذف الفاتورة لوجود مرتجعات مرتبطة بها. احتفظ بالفاتورة وسجلها المحاسبي." };
  if (inv.entry_id) await deleteEntry(inv.entry_id);
  const { error } = await supabase.from("gl_sales_invoices").delete().eq("id", inv.id);
  if (error) console.error("deleteSalesInvoice", error);
  return { ok: !error, error: error?.message };
}
