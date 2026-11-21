// =============================================================
// src/pages/lib/accountingDb.ts
// Ø·Ø¨Ù‚Ø© Ø¨ÙŠØ§Ù†Ø§Øª ÙˆØ­Ø¯Ø© Ø§Ù„Ù…Ø­Ø§Ø³Ø¨Ø© (Ø´Ø¬Ø±Ø© Ø§Ù„Ø­Ø³Ø§Ø¨Ø§Øª + Ø§Ù„Ù‚ÙŠÙˆØ¯) Ø¹Ù„Ù‰ Supabase.
// Ø§Ù„Ø¯ÙØ§ØªØ± Ø¹Ù„Ù‰ Ù…Ø³ØªÙˆÙ‰ Ø§Ù„Ù…Ø¤Ø³Ø³Ø© (organization_id)ØŒ Ù…Ø¹ branch_id ÙƒÙ…Ø±ÙƒØ² ØªÙƒÙ„ÙØ©.
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
  status: string;            // 'posted' | 'draft'
  entry_type?: string;       // Ø¹Ø§Ù…/Ù…Ø´ØªØ±ÙŠØ§Øª/Ù…Ø¨ÙŠØ¹Ø§Øª/ØªØ³ÙˆÙŠØ©/Ø³Ù†Ø¯ Ù‚Ø¨Ø¶/Ø³Ù†Ø¯ ØµØ±Ù
  notes?: string | null;     // Ù…Ù„Ø§Ø­Ø¸Ø§Øª Ø¹Ø§Ù…Ø©
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
  party_id?: number | null;   // ÙˆØ³Ù… Ø§Ù„Ø·Ø±Ù (Ø¹Ù…ÙŠÙ„/Ù…ÙˆØ±Ø¯ ÙØ±Ø¹ÙŠ) Ù„ØªÙØµÙŠÙ„ ÙƒØ´ÙÙ‡
};

// Ø·Ø¨ÙŠØ¹Ø© Ø§Ù„Ø­Ø³Ø§Ø¨ (Ù…Ø¯ÙŠÙ†/Ø¯Ø§Ø¦Ù†) Ø­Ø³Ø¨ Ø§Ù„Ù†ÙˆØ¹
export const natureOf = (t: AccType): "debit" | "credit" =>
  t === "asset" || t === "expense" ? "debit" : "credit";

export const TYPE_LABEL: Record<AccType, string> = {
  asset: "Ø£ØµÙˆÙ„",
  liability: "Ø®ØµÙˆÙ…",
  equity: "Ø­Ù‚ÙˆÙ‚ Ù…Ù„ÙƒÙŠØ©",
  revenue: "Ø¥ÙŠØ±Ø§Ø¯Ø§Øª",
  expense: "Ù…ØµØ±ÙˆÙØ§Øª",
};

// Ø£Ù†ÙˆØ§Ø¹ Ø§Ù„Ù‚ÙŠÙˆØ¯ (Ù„ØªØµÙ†ÙŠÙ Ø§Ù„Ù‚ÙŠØ¯ ÙˆØªØ³Ù‡ÙŠÙ„ Ø§Ù„ÙÙ„ØªØ±Ø© ÙˆØ§Ù„Ø±Ø¨Ø· Ù„Ø§Ø­Ù‚Ù‹Ø§)
export type EntryType = "general" | "purchases" | "sales" | "settlement" | "receipt" | "payment" | "depreciation" | "opening";
export const ENTRY_TYPE_LABEL: Record<string, string> = {
  general: "Ø¹Ø§Ù…",
  purchases: "Ù…Ø´ØªØ±ÙŠØ§Øª",
  sales: "Ù…Ø¨ÙŠØ¹Ø§Øª",
  settlement: "ØªØ³ÙˆÙŠØ©",
  receipt: "Ø³Ù†Ø¯ Ù‚Ø¨Ø¶",
  payment: "Ø³Ù†Ø¯ ØµØ±Ù",
  depreciation: "Ù‚ÙŠØ¯ Ø¥Ù‡Ù„Ø§Ùƒ",
  opening: "Ø±ØµÙŠØ¯ Ø§ÙØªØªØ§Ø­ÙŠ",
};
export const ENTRY_TYPE_OPTS: EntryType[] = ["general", "purchases", "sales", "settlement", "receipt", "payment", "depreciation", "opening"];

// â”€â”€ Ø§Ù„Ù…Ø¤Ø³Ø³Ø© Ø§Ù„Ù†Ø´Ø·Ø© Ù…Ù† Ø§Ù„ÙØ±Ø¹ Ø§Ù„Ø­Ø§Ù„ÙŠ â”€â”€
export async function getOrgForBranch(branchId: number | null): Promise<{ id: number; name: string } | null> {
  if (branchId == null) return null;
  const { data: shop } = await supabase.from("shops").select("organization_id").eq("id", branchId).maybeSingle();
  const orgId = (shop as any)?.organization_id;
  if (!orgId) return null;
  const { data: org } = await supabase.from("organizations").select("id, name").eq("id", orgId).maybeSingle();
  return { id: Number(orgId), name: (org as any)?.name || ("Ù…Ø¤Ø³Ø³Ø© " + orgId) };
}

// â”€â”€ Ø´Ø¬Ø±Ø© Ø§Ù„Ø­Ø³Ø§Ø¨Ø§Øª â”€â”€
export async function fetchAccounts(orgId: number): Promise<GLAccount[]> {
  const { data, error } = await supabase.from("gl_accounts").select("*").eq("organization_id", orgId).order("code");
  if (error) { console.error("fetchAccounts", error); return []; }
  return (data as GLAccount[]) || [];
}

export async function upsertAccount(acc: Partial<GLAccount>): Promise<{ ok: boolean; error?: string }> {
  // Ø¹Ù…ÙˆØ¯ id Ù…Ø¹Ø±Ù‘Ù GENERATED ALWAYSØŒ ÙØ§Ù„ØªØ¹Ø¯ÙŠÙ„ ÙŠØ³ØªØ®Ø¯Ù… update Ø¨Ø¯Ù„ upsert (Ø§Ù„Ø°ÙŠ ÙŠØ­Ø§ÙˆÙ„ Ø¥Ø¯Ø±Ø§Ø¬ id)
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

// Ø§Ù„Ø´Ø¬Ø±Ø© Ø§Ù„Ø³Ø¹ÙˆØ¯ÙŠØ© Ø§Ù„Ù‚ÙŠØ§Ø³ÙŠØ© Ø§Ù„Ù…Ø¨Ø¯Ø¦ÙŠØ© (Ù‚Ø§Ø¨Ù„Ø© Ù„Ù„ØªØ¹Ø¯ÙŠÙ„ Ø¨Ø¹Ø¯ Ø§Ù„ØªÙ‡ÙŠØ¦Ø©)
type SeedRow = { code: string; name: string; type: AccType; is_group: boolean; parent: string | null };
export const STANDARD_CHART: SeedRow[] = [
  { code: "1", name: "Ø§Ù„Ø£ØµÙˆÙ„", type: "asset", is_group: true, parent: null },
  { code: "11", name: "Ø§Ù„Ø£ØµÙˆÙ„ Ø§Ù„Ù…ØªØ¯Ø§ÙˆÙ„Ø©", type: "asset", is_group: true, parent: "1" },
  { code: "1101", name: "Ø§Ù„ØµÙ†Ø¯ÙˆÙ‚ (Ø§Ù„Ù†Ù‚Ø¯ÙŠØ©)", type: "asset", is_group: false, parent: "11" },
  { code: "1102", name: "Ø§Ù„Ø¨Ù†Ùƒ", type: "asset", is_group: false, parent: "11" },
  { code: "1103", name: "Ø§Ù„Ø¹Ù…Ù„Ø§Ø¡ (Ù…Ø¯ÙŠÙ†ÙˆÙ†)", type: "asset", is_group: false, parent: "11" },
  { code: "1104", name: "Ø§Ù„Ù…Ø®Ø²ÙˆÙ†", type: "asset", is_group: false, parent: "11" },
  { code: "1105", name: "Ù…ØµØ±ÙˆÙØ§Øª Ù…Ø¯ÙÙˆØ¹Ø© Ù…Ù‚Ø¯Ù…Ù‹Ø§", type: "asset", is_group: false, parent: "11" },
  { code: "1106", name: "Ø¶Ø±ÙŠØ¨Ø© Ø§Ù„Ù‚ÙŠÙ…Ø© Ø§Ù„Ù…Ø¶Ø§ÙØ© - Ø§Ù„Ù…Ø¯Ø®Ù„Ø§Øª", type: "asset", is_group: false, parent: "11" },
  { code: "1107", name: "Ø¹ÙÙ‡Ø¯ ÙˆØ³Ù„Ù", type: "asset", is_group: false, parent: "11" },
  { code: "12", name: "Ø§Ù„Ø£ØµÙˆÙ„ ØºÙŠØ± Ø§Ù„Ù…ØªØ¯Ø§ÙˆÙ„Ø©", type: "asset", is_group: true, parent: "1" },
  { code: "1201", name: "Ø£Ø«Ø§Ø« ÙˆØªØ¬Ù‡ÙŠØ²Ø§Øª", type: "asset", is_group: false, parent: "12" },
  { code: "1202", name: "Ø£Ø¬Ù‡Ø²Ø© ÙˆÙ…Ø¹Ø¯Ø§Øª", type: "asset", is_group: false, parent: "12" },
  { code: "1203", name: "Ø³ÙŠØ§Ø±Ø§Øª", type: "asset", is_group: false, parent: "12" },
  { code: "1204", name: "ØªØ­Ø³ÙŠÙ†Ø§Øª ÙˆØ¯ÙŠÙƒÙˆØ±Ø§Øª", type: "asset", is_group: false, parent: "12" },
  { code: "1209", name: "Ù…Ø¬Ù…Ø¹ Ø§Ù„Ø¥Ù‡Ù„Ø§Ùƒ", type: "asset", is_group: false, parent: "12" },
  { code: "2", name: "Ø§Ù„Ø®ØµÙˆÙ…", type: "liability", is_group: true, parent: null },
  { code: "21", name: "Ø§Ù„Ø®ØµÙˆÙ… Ø§Ù„Ù…ØªØ¯Ø§ÙˆÙ„Ø©", type: "liability", is_group: true, parent: "2" },
  { code: "2101", name: "Ø§Ù„Ù…ÙˆØ±Ø¯ÙˆÙ† (Ø¯Ø§Ø¦Ù†ÙˆÙ†)", type: "liability", is_group: false, parent: "21" },
  { code: "2102", name: "Ù…ØµØ±ÙˆÙØ§Øª Ù…Ø³ØªØ­Ù‚Ø©", type: "liability", is_group: false, parent: "21" },
  { code: "2103", name: "Ø¶Ø±ÙŠØ¨Ø© Ø§Ù„Ù‚ÙŠÙ…Ø© Ø§Ù„Ù…Ø¶Ø§ÙØ© - Ø§Ù„Ù…Ø®Ø±Ø¬Ø§Øª", type: "liability", is_group: false, parent: "21" },
  { code: "2104", name: "Ø±ÙˆØ§ØªØ¨ Ù…Ø³ØªØ­Ù‚Ø©", type: "liability", is_group: false, parent: "21" },
  { code: "2105", name: "Ø¯Ø§Ø¦Ù†ÙˆÙ† Ø¢Ø®Ø±ÙˆÙ†", type: "liability", is_group: false, parent: "21" },
  { code: "22", name: "Ø§Ù„Ø®ØµÙˆÙ… ØºÙŠØ± Ø§Ù„Ù…ØªØ¯Ø§ÙˆÙ„Ø©", type: "liability", is_group: true, parent: "2" },
  { code: "2201", name: "Ù‚Ø±ÙˆØ¶ Ø·ÙˆÙŠÙ„Ø© Ø§Ù„Ø£Ø¬Ù„", type: "liability", is_group: false, parent: "22" },
  { code: "3", name: "Ø­Ù‚ÙˆÙ‚ Ø§Ù„Ù…Ù„ÙƒÙŠØ©", type: "equity", is_group: true, parent: null },
  { code: "3101", name: "Ø±Ø£Ø³ Ø§Ù„Ù…Ø§Ù„", type: "equity", is_group: false, parent: "3" },
  { code: "3102", name: "Ø¬Ø§Ø±ÙŠ Ø§Ù„Ù…Ø§Ù„Ùƒ / Ø§Ù„Ø´Ø±ÙƒØ§Ø¡", type: "equity", is_group: false, parent: "3" },
  { code: "3103", name: "Ø§Ù„Ø£Ø±Ø¨Ø§Ø­ Ø§Ù„Ù…Ø±Ø­Ù‘Ù„Ø©", type: "equity", is_group: false, parent: "3" },
  { code: "3104", name: "Ø£Ø±Ø¨Ø§Ø­ (Ø®Ø³Ø§Ø¦Ø±) Ø§Ù„Ø¹Ø§Ù… Ø§Ù„Ø­Ø§Ù„ÙŠ", type: "equity", is_group: false, parent: "3" },
  { code: "4", name: "Ø§Ù„Ø¥ÙŠØ±Ø§Ø¯Ø§Øª", type: "revenue", is_group: true, parent: null },
  { code: "4101", name: "Ø§Ù„Ù…Ø¨ÙŠØ¹Ø§Øª / Ø¥ÙŠØ±Ø§Ø¯ Ø§Ù„Ù†Ø´Ø§Ø·", type: "revenue", is_group: false, parent: "4" },
  { code: "4102", name: "Ø¥ÙŠØ±Ø§Ø¯Ø§Øª Ø£Ø®Ø±Ù‰", type: "revenue", is_group: false, parent: "4" },
  { code: "4103", name: "Ø®ØµÙˆÙ…Ø§Øª Ù…ÙƒØªØ³Ø¨Ø©", type: "revenue", is_group: false, parent: "4" },
  { code: "5", name: "Ø§Ù„Ù…ØµØ±ÙˆÙØ§Øª", type: "expense", is_group: true, parent: null },
  { code: "51", name: "ØªÙƒÙ„ÙØ© Ø§Ù„Ù…Ø¨ÙŠØ¹Ø§Øª", type: "expense", is_group: true, parent: "5" },
  { code: "5101", name: "ØªÙƒÙ„ÙØ© Ø§Ù„Ù…Ø´ØªØ±ÙŠØ§Øª / Ø§Ù„Ù…ÙˆØ§Ø¯", type: "expense", is_group: false, parent: "51" },
  { code: "5102", name: "Ù…Ø±Ø¯ÙˆØ¯Ø§Øª ÙˆÙ…Ø³Ù…ÙˆØ­Ø§Øª Ø§Ù„Ù…Ø´ØªØ±ÙŠØ§Øª", type: "expense", is_group: false, parent: "51" },
  { code: "52", name: "Ù…ØµØ±ÙˆÙØ§Øª ØªØ´ØºÙŠÙ„ÙŠØ© ÙˆØ¥Ø¯Ø§Ø±ÙŠØ©", type: "expense", is_group: true, parent: "5" },
  { code: "5201", name: "Ø§Ù„Ø±ÙˆØ§ØªØ¨ ÙˆØ§Ù„Ø£Ø¬ÙˆØ±", type: "expense", is_group: false, parent: "52" },
  { code: "5202", name: "Ø§Ù„Ø¥ÙŠØ¬Ø§Ø±", type: "expense", is_group: false, parent: "52" },
  { code: "5203", name: "Ø§Ù„ÙƒÙ‡Ø±Ø¨Ø§Ø¡ ÙˆØ§Ù„Ù…ÙŠØ§Ù‡", type: "expense", is_group: false, parent: "52" },
  { code: "5204", name: "Ø§Ù„Ø§ØªØµØ§Ù„Ø§Øª ÙˆØ§Ù„Ø¥Ù†ØªØ±Ù†Øª", type: "expense", is_group: false, parent: "52" },
  { code: "5205", name: "Ù…ÙˆØ§Ø¯ Ø§Ù„ØªØºÙ„ÙŠÙ ÙˆØ§Ù„ØªØ¹Ø¨Ø¦Ø©", type: "expense", is_group: false, parent: "52" },
  { code: "5206", name: "Ø§Ù„ØµÙŠØ§Ù†Ø© ÙˆØ§Ù„Ù†Ø¸Ø§ÙØ©", type: "expense", is_group: false, parent: "52" },
  { code: "5207", name: "Ø§Ù„ØªØ³ÙˆÙŠÙ‚ ÙˆØ§Ù„Ø¥Ø¹Ù„Ø§Ù†", type: "expense", is_group: false, parent: "52" },
  { code: "5208", name: "Ø¹Ù…ÙˆÙ„Ø§Øª ØªØ·Ø¨ÙŠÙ‚Ø§Øª Ø§Ù„ØªÙˆØµÙŠÙ„", type: "expense", is_group: false, parent: "52" },
  { code: "5209", name: "Ù…ØµØ±ÙˆÙØ§Øª Ø¨Ù†ÙƒÙŠØ© ÙˆØ±Ø³ÙˆÙ…", type: "expense", is_group: false, parent: "52" },
  { code: "5210", name: "Ø±Ø³ÙˆÙ… Ø­ÙƒÙˆÙ…ÙŠØ©", type: "expense", is_group: false, parent: "52" },
  { code: "5211", name: "Ø¥Ù‡Ù„Ø§Ùƒ Ø§Ù„Ø£ØµÙˆÙ„", type: "expense", is_group: false, parent: "52" },
  { code: "5212", name: "Ù…ØµØ±ÙˆÙØ§Øª Ø£Ø®Ø±Ù‰", type: "expense", is_group: false, parent: "52" },
];

// ØªÙ‡ÙŠØ¦Ø© Ø§Ù„Ø´Ø¬Ø±Ø© Ø§Ù„Ù‚ÙŠØ§Ø³ÙŠØ© Ù„Ù„Ù…Ø¤Ø³Ø³Ø© (ØªÙØ¶ÙŠÙ ÙÙ‚Ø· Ø§Ù„Ø£ÙƒÙˆØ§Ø¯ ØºÙŠØ± Ø§Ù„Ù…ÙˆØ¬ÙˆØ¯Ø©)
export async function seedStandardChart(orgId: number): Promise<{ ok: boolean; error?: string; added: number }> {
  const existing = await fetchAccounts(orgId);
  const have = new Set(existing.map((a) => a.code));
  const toAdd = STANDARD_CHART.filter((r) => !have.has(r.code));
  if (!toAdd.length) return { ok: true, added: 0 };
  // ØªÙ…Ø±ÙŠØ±Ø© 1: Ø¥Ø¯Ø±Ø§Ø¬ Ø¨Ø¯ÙˆÙ† Ø£Ø¨
  const { data: ins, error: e1 } = await supabase
    .from("gl_accounts")
    .insert(toAdd.map((r) => ({ organization_id: orgId, code: r.code, name: r.name, type: r.type, is_group: r.is_group, parent_id: null })))
    .select("id, code");
  if (e1) { console.error("seed insert", e1); return { ok: false, error: e1.message, added: 0 }; }
  // Ø®Ø±ÙŠØ·Ø© ÙƒÙˆØ¯â†’Ù…Ø¹Ø±Ù‘Ù (Ø§Ù„Ù…ÙˆØ¬ÙˆØ¯ + Ø§Ù„Ø¬Ø¯ÙŠØ¯)
  const all = await fetchAccounts(orgId);
  const byCode = new Map(all.map((a) => [a.code, a.id] as const));
  // ØªÙ…Ø±ÙŠØ±Ø© 2: Ø±Ø¨Ø· Ø§Ù„Ø¢Ø¨Ø§Ø¡
  for (const r of toAdd) {
    if (!r.parent) continue;
    const pid = byCode.get(r.parent);
    const cid = byCode.get(r.code);
    if (pid && cid) { await supabase.from("gl_accounts").update({ parent_id: pid }).eq("id", cid); }
  }
  return { ok: true, added: (ins as any[])?.length || toAdd.length };
}

// Ø§Ø³ØªÙŠØ±Ø§Ø¯ Ø´Ø¬Ø±Ø© Ø­Ø³Ø§Ø¨Ø§Øª Ù…Ù† Ù…Ù„Ù (ÙŠØ¶ÙŠÙ Ø§Ù„Ø£ÙƒÙˆØ§Ø¯ ØºÙŠØ± Ø§Ù„Ù…ÙˆØ¬ÙˆØ¯Ø© ÙˆÙŠØ±Ø¨Ø· Ø§Ù„Ø¢Ø¨Ø§Ø¡ Ø¨Ø§Ù„ÙƒÙˆØ¯)
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

// â”€â”€ Ø§Ù„Ù‚ÙŠÙˆØ¯ Ø§Ù„ÙŠÙˆÙ…ÙŠØ© â”€â”€
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

// ØªØ±ÙˆÙŠØ³Ø© Ø§Ù„Ù‚ÙŠØ¯ (Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ø¹Ø§Ù…Ø©)
export type EntryHeader = {
  date: string;
  description: string | null;
  branch_id: number | null;        // Ù…Ø±ÙƒØ² Ø§Ù„ØªÙƒÙ„ÙØ© Ø§Ù„Ø§ÙØªØ±Ø§Ø¶ÙŠ Ù„Ù„Ù‚ÙŠØ¯
  entry_type?: string;             // Ù†ÙˆØ¹ Ø§Ù„Ù‚ÙŠØ¯
  notes?: string | null;           // Ù…Ù„Ø§Ø­Ø¸Ø§Øª Ø¹Ø§Ù…Ø©
  status?: string;                 // 'posted' (Ù…ÙØ±Ø­Ù‘Ù„) | 'draft' (Ù…Ø³ÙˆØ¯Ø©)
};

function linePayload(entryId: number, header: EntryHeader, lines: GLLine[]) {
  return lines
    .filter((l) => l.account_id && (Number(l.debit) || Number(l.credit)))
    .map((l) => ({
      entry_id: entryId,
      account_id: l.account_id,
      debit: Number(l.debit) || 0,
      credit: Number(l.credit) || 0,
      branch_id: l.branch_id ?? header.branch_id,   // Ù…Ø±ÙƒØ² ØªÙƒÙ„ÙØ© Ù„ÙƒÙ„ Ø³Ø·Ø± (fallback Ù„Ù…Ø±ÙƒØ² Ø§Ù„Ù‚ÙŠØ¯)
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

// ØªØ¹Ø¯ÙŠÙ„ Ù‚ÙŠØ¯ Ù‚Ø§Ø¦Ù… (ÙŠÙØ¨Ù‚ÙŠ Ø±Ù‚Ù… Ø§Ù„Ù‚ÙŠØ¯ ÙƒÙ…Ø§ Ù‡ÙˆØŒ ÙˆÙŠØ³ØªØ¨Ø¯Ù„ Ø³Ø·ÙˆØ±Ù‡ Ø¨Ø§Ù„ÙƒØ§Ù…Ù„)
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

// ØªØºÙŠÙŠØ± Ø­Ø§Ù„Ø© Ø§Ù„Ù‚ÙŠØ¯ (ØªØ±Ø­ÙŠÙ„ Ù…Ø³ÙˆØ¯Ø© / Ø¥Ø¹Ø§Ø¯ØªÙ‡Ø§ Ù…Ø³ÙˆØ¯Ø©)
export async function setEntryStatus(id: number, status: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from("gl_journal_entries").update({ status }).eq("id", id);
  if (error) console.error("setEntryStatus", error);
  return { ok: !error, error: error?.message };
}

// â”€â”€ Ù…Ø±ÙÙ‚Ø§Øª Ø§Ù„Ù‚ÙŠÙˆØ¯ (Supabase Storage) â”€â”€
export const ATT_BUCKET = "journal-attachments";
export type GLAttachment = {
  id: number;
  entry_id: number;
  organization_id: number;
  file_name: string;
  file_path: string;          // Ø§Ù„Ù…Ø³Ø§Ø± Ø¯Ø§Ø®Ù„ Ø§Ù„Ø­Ø§ÙˆÙŠØ©
  mime_type: string | null;
  size_bytes: number | null;
  created_at?: string;
};

const sanitizeName = (s: string) => (s || "file").replace(/[^\w.\-]+/g, "_").slice(-80);

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
    await supabase.storage.from(ATT_BUCKET).remove([path]);  // ØªØ±Ø§Ø¬ÙØ¹ Ø¹Ù† Ø§Ù„Ø±ÙØ¹ Ù„Ùˆ ÙØ´Ù„ ØªØ³Ø¬ÙŠÙ„ Ø§Ù„ØµÙ
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
  // Ù†Ø¸Ù‘Ù Ø§Ù„Ù…Ø±ÙÙ‚Ø§Øª (Ù…Ù„ÙØ§Øª Ø§Ù„ØªØ®Ø²ÙŠÙ† + Ø³Ø¬Ù„Ø§ØªÙ‡Ø§) Ù‚Ø¨Ù„ Ø­Ø°Ù Ø§Ù„Ù‚ÙŠØ¯
  const atts = await fetchAttachments(id);
  if (atts.length) {
    await supabase.storage.from(ATT_BUCKET).remove(atts.map((a) => a.file_path));
    await supabase.from("gl_journal_attachments").delete().eq("entry_id", id);
  }
  const { error } = await supabase.from("gl_journal_entries").delete().eq("id", id);
  return { ok: !error, error: error?.message };
}

// Ø­Ø±ÙƒØ© Ø­Ø³Ø§Ø¨ (Ù„ÙƒØ´Ù Ø§Ù„Ø­Ø³Ø§Ø¨) Ø¶Ù…Ù† ÙØªØ±Ø© â€” ØªØ±Ø¬Ø¹ Ø§Ù„Ø³Ø·ÙˆØ± Ù…Ø¹ ØªØ§Ø±ÙŠØ® ÙˆÙˆØµÙ Ø§Ù„Ù‚ÙŠØ¯
export type LedgerLine = { date: string; entry_no: number; description: string | null; branch_id: number | null; account_id: number; party_id: number | null; debit: number; credit: number; note: string | null };

// ÙƒØ´Ù Ø­Ø±ÙƒØ© Ø¹Ø¯Ø© Ø­Ø³Ø§Ø¨Ø§Øª Ù…Ø¹Ù‹Ø§ (ÙŠÙØ³ØªØ®Ø¯Ù… Ù„ØªØ¬Ù…ÙŠØ¹ Ø­Ø±ÙƒØ© Ø­Ø³Ø§Ø¨ Ø£Ø¨ ÙˆÙƒÙ„ ÙØ±ÙˆØ¹Ù‡)
// partyId Ø§Ø®ØªÙŠØ§Ø±ÙŠ: Ù„ØªÙØµÙŠÙ„ ÙƒØ´Ù Ø¹Ù…ÙŠÙ„/Ù…ÙˆØ±Ø¯ ÙØ±Ø¹ÙŠ Ø¹Ù„Ù‰ Ø­Ø³Ø§Ø¨ Ø§Ù„Ù…Ø±ÙƒØ² Ø­Ø³Ø¨ ÙˆØ³Ù… Ø§Ù„Ø·Ø±Ù
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

// Ù…Ø¹Ø±Ù‘ÙØ§Øª Ø§Ù„Ø­Ø³Ø§Ø¨ Ù†ÙØ³Ù‡ + ÙƒÙ„ Ø§Ù„Ø­Ø³Ø§Ø¨Ø§Øª Ø§Ù„ÙˆØ±Ù‚ÙŠØ© ØªØ­ØªÙ‡ (Ù„ØªØ¬Ù…ÙŠØ¹ ÙƒØ´Ù Ø­Ø³Ø§Ø¨ Ø£Ø¨)
export function descendantPostableIds(accounts: GLAccount[], rootId: number): number[] {
  const childrenOf = new Map<number | null, GLAccount[]>();
  accounts.forEach((a) => { const k = a.parent_id ?? null; if (!childrenOf.has(k)) childrenOf.set(k, []); childrenOf.get(k)!.push(a); });
  const ids = new Set<number>([rootId]);   // Ø§Ø´Ù…Ù„ Ø§Ù„Ø­Ø³Ø§Ø¨ Ù†ÙØ³Ù‡ (Ù‚Ø¯ ÙŠØ­Ù…Ù„ Ø­Ø±ÙƒØ© Ù‚Ø¯ÙŠÙ…Ø© Ù‚Ø¨Ù„ ØªØ­ÙˆÙŠÙ„Ù‡ Ù„ØªØ¬Ù…ÙŠØ¹ÙŠ)
  const walk = (id: number) => {
    (childrenOf.get(id) || []).forEach((c) => { if (!c.is_group) ids.add(c.id); walk(c.id); });
  };
  walk(rootId);
  return [...ids];
}

// â”€â”€ Ø§Ù„Ø£ØµÙˆÙ„ Ø§Ù„Ø«Ø§Ø¨ØªØ© + Ø§Ù„Ø¥Ù‡Ù„Ø§Ùƒ (Ù‚Ø³Ø· Ø«Ø§Ø¨Øª) â”€â”€
export type GLAsset = {
  id: number;
  organization_id: number;
  branch_id: number | null;
  name: string;
  category: string | null;
  acquire_date: string;             // ØªØ§Ø±ÙŠØ® Ø§Ù„Ø§Ù‚ØªÙ†Ø§Ø¡
  cost: number;                     // Ø§Ù„ØªÙƒÙ„ÙØ©
  salvage_value: number;            // Ø§Ù„Ù‚ÙŠÙ…Ø© Ø§Ù„ØªØ®Ø±ÙŠØ¯ÙŠØ©
  useful_life_years: number;        // Ø§Ù„Ø¹Ù…Ø± Ø§Ù„Ø¥Ù†ØªØ§Ø¬ÙŠ Ø¨Ø§Ù„Ø³Ù†ÙˆØ§Øª
  account_id: number | null;        // Ø­Ø³Ø§Ø¨ Ø§Ù„Ø£ØµÙ„ (Ø§Ø®ØªÙŠØ§Ø±ÙŠ)
  expense_account_id: number | null; // Ø­Ø³Ø§Ø¨ Ù…ØµØ±ÙˆÙ Ø§Ù„Ø¥Ù‡Ù„Ø§Ùƒ (Ù…Ø¯ÙŠÙ† Ø¹Ù†Ø¯ Ø§Ù„ØªØ±Ø­ÙŠÙ„)
  accum_account_id: number | null;   // Ø­Ø³Ø§Ø¨ Ù…Ø¬Ù…Ø¹ Ø§Ù„Ø¥Ù‡Ù„Ø§Ùƒ (Ø¯Ø§Ø¦Ù† Ø¹Ù†Ø¯ Ø§Ù„ØªØ±Ø­ÙŠÙ„)
  depr_posted: number;               // Ø§Ù„Ø¥Ù‡Ù„Ø§Ùƒ Ø§Ù„Ù…ÙØ±Ø­ÙŽÙ‘Ù„ Ù…Ø­Ø§Ø³Ø¨ÙŠÙ‹Ø§ Ø­ØªÙ‰ Ø§Ù„Ø¢Ù† (Ù„Ù…Ù†Ø¹ Ø§Ù„Ø§Ø²Ø¯ÙˆØ§Ø¬)
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

// Ø­Ø³Ø§Ø¨ Ø§Ù„Ø¥Ù‡Ù„Ø§Ùƒ Ø¨Ø§Ù„Ù‚Ø³Ø· Ø§Ù„Ø«Ø§Ø¨Øª Ø­ØªÙ‰ ØªØ§Ø±ÙŠØ® Ù…Ø¹ÙŠÙ‘Ù†
export type Depreciation = {
  depreciable: number;   // Ø§Ù„Ø£Ø³Ø§Ø³ Ø§Ù„Ù‚Ø§Ø¨Ù„ Ù„Ù„Ø¥Ù‡Ù„Ø§Ùƒ = Ø§Ù„ØªÙƒÙ„ÙØ© âˆ’ Ø§Ù„ØªØ®Ø±ÙŠØ¯ÙŠØ©
  annual: number;        // Ø¥Ù‡Ù„Ø§Ùƒ Ø³Ù†ÙˆÙŠ
  monthly: number;       // Ø¥Ù‡Ù„Ø§Ùƒ Ø´Ù‡Ø±ÙŠ
  months: number;        // Ø¹Ø¯Ø¯ Ø§Ù„Ø£Ø´Ù‡Ø± Ø§Ù„Ù…Ù†Ù‚Ø¶ÙŠØ© Ø­ØªÙ‰ asOf
  accumulated: number;   // Ù…Ø¬Ù…Ø¹ Ø§Ù„Ø¥Ù‡Ù„Ø§Ùƒ
  bookValue: number;     // Ø§Ù„Ù‚ÙŠÙ…Ø© Ø§Ù„Ø¯ÙØªØ±ÙŠØ© = Ø§Ù„ØªÙƒÙ„ÙØ© âˆ’ Ø§Ù„Ù…Ø¬Ù…Ø¹
};
export function depreciation(a: { cost: number; salvage_value: number; useful_life_years: number; acquire_date: string }, asOf: string): Depreciation {
  const cost = Number(a.cost) || 0;
  const salvage = Number(a.salvage_value) || 0;
  const life = Number(a.useful_life_years) || 0;
  const depreciable = Math.max(0, cost - salvage);
  const annual = life > 0 ? depreciable / life : 0;
  const monthly = annual / 12;
  // Ø¹Ø¯Ø¯ Ø§Ù„Ø£Ø´Ù‡Ø± Ù…Ù† ØªØ§Ø±ÙŠØ® Ø§Ù„Ø§Ù‚ØªÙ†Ø§Ø¡ Ø­ØªÙ‰ asOf
  const [ay, am, ad] = (a.acquire_date || "").split("-").map(Number);
  const [oy, om, od] = (asOf || "").split("-").map(Number);
  let months = 0;
  if (ay && oy) {
    months = (oy - ay) * 12 + (om - am);
    if (od < ad) months -= 1;           // Ù„Ù… ÙŠÙƒØªÙ…Ù„ Ø§Ù„Ø´Ù‡Ø± Ø§Ù„Ø¬Ø§Ø±ÙŠ
    months = Math.max(0, months);
  }
  const accumulated = Math.min(depreciable, monthly * months);
  const bookValue = cost - accumulated;
  return { depreciable, annual, monthly, months, accumulated, bookValue };
}

// ØªØ±Ø­ÙŠÙ„ Ù‚ÙŠØ¯ Ø§Ù„Ø¥Ù‡Ù„Ø§Ùƒ: Ù„ÙƒÙ„ Ø£ØµÙ„ Ø³Ø·Ø± Ù…Ø¯ÙŠÙ† Â«Ù…ØµØ±ÙˆÙ Ø¥Ù‡Ù„Ø§ÙƒÂ» ÙˆØ³Ø·Ø± Ø¯Ø§Ø¦Ù† Â«Ù…Ø¬Ù…Ø¹ Ø¥Ù‡Ù„Ø§ÙƒÂ» Ø¨Ù‚ÙŠÙ…Ø©
// Ø§Ù„Ù…Ø³ØªØ­Ù‚ ØºÙŠØ± Ø§Ù„Ù…ÙØ±Ø­ÙŽÙ‘Ù„ØŒ Ø«Ù… ØªØ­Ø¯ÙŠØ« depr_posted Ù„Ù…Ù†Ø¹ Ø§Ù„Ø§Ø²Ø¯ÙˆØ§Ø¬ Ø¹Ù†Ø¯ Ø¥Ø¹Ø§Ø¯Ø© Ø§Ù„ØªØ±Ø­ÙŠÙ„.
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
    lines.push({ account_id: it.expAcc, debit: amt, credit: 0, branch_id: it.branch ?? header.branch_id, note: `Ø¥Ù‡Ù„Ø§Ùƒ ${it.name}` });
    lines.push({ account_id: it.accAcc, debit: 0, credit: amt, branch_id: it.branch ?? header.branch_id, note: `Ù…Ø¬Ù…Ø¹ Ø¥Ù‡Ù„Ø§Ùƒ ${it.name}` });
    total += amt;
  }
  if (!lines.length) return { ok: false, error: "Ù„Ø§ ÙŠÙˆØ¬Ø¯ Ø¥Ù‡Ù„Ø§Ùƒ Ù…Ø³ØªØ­Ù‚ Ù„Ù„ØªØ±Ø­ÙŠÙ„" };
  const res = await createEntry(orgId, {
    date: header.date,
    description: `Ù‚ÙŠØ¯ Ø¥Ù‡Ù„Ø§Ùƒ Ø§Ù„Ø£ØµÙˆÙ„ Ø­ØªÙ‰ ${header.date}`,
    branch_id: header.branch_id,
    entry_type: "depreciation",
    notes: header.notes || null,
    status: "posted",
  }, lines);
  if (!res.ok) return { ok: false, error: res.error };
  // ØªØ­Ø¯ÙŠØ« Ø§Ù„Ù…ÙØ±Ø­ÙŽÙ‘Ù„ Ù„ÙƒÙ„ Ø£ØµÙ„ (Ø¨Ø¹Ø¯ Ù†Ø¬Ø§Ø­ Ø§Ù„Ù‚ÙŠØ¯)
  for (const it of items) {
    if (!(it.amount > 0)) continue;
    const newPosted = Math.round((it.priorPosted + it.amount) * 100) / 100;
    await supabase.from("gl_assets").update({ depr_posted: newPosted }).eq("id", it.assetId);
  }
  return { ok: true, id: res.id, total };
}

// â”€â”€ Ø§Ù„Ø£Ø±ØµØ¯Ø© Ø§Ù„Ø§ÙØªØªØ§Ø­ÙŠØ© (Ù‚ÙŠØ¯ Ø§ÙØªØªØ§Ø­ÙŠ ÙˆØ§Ø­Ø¯ Ù…Ù† Ù†ÙˆØ¹ opening) â”€â”€
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

// ÙŠØ­Ø°Ù Ø§Ù„Ù‚ÙŠØ¯ Ø§Ù„Ø§ÙØªØªØ§Ø­ÙŠ Ø§Ù„Ù‚Ø¯ÙŠÙ… (Ø¥Ù† ÙˆÙØ¬Ø¯) Ø«Ù… ÙŠÙ†Ø´Ø¦ Ù‚ÙŠØ¯Ù‹Ø§ Ø¬Ø¯ÙŠØ¯Ù‹Ø§ Ù…ØªÙˆØ§Ø²Ù†Ù‹Ø§Ø›
// natureById ØªØ­Ø¯Ù‘Ø¯ Ø·Ø¨ÙŠØ¹Ø© ÙƒÙ„ Ø­Ø³Ø§Ø¨ØŒ ÙˆØ§Ù„ÙØ±Ù‚ ÙŠÙÙ‚ÙÙŽÙ„ ÙÙŠ balancingAccountId.
export async function saveOpeningBalances(
  orgId: number,
  params: { date: string; branch_id: number | null; balancingAccountId: number; natureById: Map<number, "debit" | "credit">; balances: { accountId: number; amount: number }[] }
): Promise<{ ok: boolean; error?: string; id?: number; plug?: number }> {
  // Ø§Ø­Ø°Ù Ø£ÙŠ Ù‚ÙŠØ¯ Ø§ÙØªØªØ§Ø­ÙŠ Ø³Ø§Ø¨Ù‚ (Ù‚Ø§Ø¨Ù„ Ù„Ø¥Ø¹Ø§Ø¯Ø© Ø§Ù„Ø¥Ø¯Ø®Ø§Ù„ Ø¯ÙˆÙ† Ø§Ø²Ø¯ÙˆØ§Ø¬)
  const existing = await fetchOpeningEntries(orgId);
  for (const e of existing) await deleteEntry(e.id);

  // Ø§Ø¬Ù…Ø¹ Ù„ÙƒÙ„ Ø­Ø³Ø§Ø¨ ØµØ§ÙÙŠÙ‡ (Ù…Ø¯ÙŠÙ† Ù…ÙˆØ¬Ø¨)
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
  // plug>0 (Ù…Ø¯ÙŠÙ† Ø£ÙƒØ¨Ø±) â‡’ Ø¯Ø§Ø¦Ù† Ø¹Ù„Ù‰ Ø­Ø³Ø§Ø¨ Ø§Ù„Ù…ÙˆØ§Ø²Ù†Ø©Ø› plug<0 â‡’ Ù…Ø¯ÙŠÙ†. ÙƒÙ„Ø§Ù‡Ù…Ø§ = add(-plug)
  if (Math.abs(plug) > 0.009) add(params.balancingAccountId, -plug);

  const lines: GLLine[] = [];
  net.forEach((v, id) => {
    if (Math.abs(v) < 0.009) return;
    if (v > 0) lines.push({ account_id: id, debit: v, credit: 0 });
    else lines.push({ account_id: id, debit: 0, credit: -v });
  });
  if (!lines.length) return { ok: false, error: "Ù„Ø§ ØªÙˆØ¬Ø¯ Ø£Ø±ØµØ¯Ø© Ù„Ø¥Ø¯Ø®Ø§Ù„Ù‡Ø§" };

  const res = await createEntry(orgId, {
    date: params.date, description: "Ø§Ù„Ø£Ø±ØµØ¯Ø© Ø§Ù„Ø§ÙØªØªØ§Ø­ÙŠØ©",
    branch_id: params.branch_id, entry_type: "opening", notes: null, status: "posted",
  }, lines);
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, id: res.id, plug };
}

// â”€â”€ Ø§Ù„Ø®Ø²Ù† ÙˆØ§Ù„Ø¨Ù†ÙˆÙƒ + Ø³Ù†Ø¯Ø§Øª Ø§Ù„Ù‚Ø¨Ø¶/Ø§Ù„ØµØ±Ù â”€â”€
export type GLTreasury = {
  id: number;
  organization_id: number;
  branch_id: number | null;
  name: string;
  kind: string;                 // 'cash' (Ø®Ø²Ù†Ø©) | 'bank' (Ø¨Ù†Ùƒ)
  account_id: number | null;    // Ø­Ø³Ø§Ø¨ Ø§Ù„Ø®Ø²Ù†Ø©/Ø§Ù„Ø¨Ù†Ùƒ ÙÙŠ Ø¯Ù„ÙŠÙ„ Ø§Ù„Ø­Ø³Ø§Ø¨Ø§Øª
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

// ØµØ§ÙÙŠ Ø­Ø±ÙƒØ© Ø­Ø³Ø§Ø¨ (Ù…Ø¯ÙŠÙ† âˆ’ Ø¯Ø§Ø¦Ù†) Ù…Ù† Ø§Ù„Ù‚ÙŠÙˆØ¯ Ø§Ù„Ù…ÙØ±Ø­Ù‘Ù„Ø© Ø­ØªÙ‰ ØªØ§Ø±ÙŠØ® (Ù„Ø­Ø³Ø§Ø¨ Ø±ØµÙŠØ¯ Ø§Ù„Ø®Ø²Ù†Ø©)
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

// Ø¥Ù†Ø´Ø§Ø¡ Ø³Ù†Ø¯ Ù‚Ø¨Ø¶/ØµØ±Ù â†’ ÙŠÙˆÙ„Ù‘Ø¯ Ù‚ÙŠØ¯Ù‹Ø§ Ù…ØªÙˆØ§Ø²Ù†Ù‹Ø§ ØªÙ„Ù‚Ø§Ø¦ÙŠÙ‹Ø§
export async function createVoucher(orgId: number, v: {
  kind: "receipt" | "payment";
  date: string;
  treasury_account_id: number;
  counter_account_id: number;
  amount: number;
  description: string | null;
  notes: string | null;
  branch_id: number | null;
  party_id?: number | null;   // ÙˆØ³Ù… Ø§Ù„Ø·Ø±Ù Ø¹Ù„Ù‰ Ø³Ø·Ø± Ø§Ù„Ø­Ø³Ø§Ø¨ Ø§Ù„Ù…Ù‚Ø§Ø¨Ù„
}): Promise<{ ok: boolean; error?: string; id?: number }> {
  const amt = Number(v.amount) || 0;
  if (amt <= 0) return { ok: false, error: "Ø§Ù„Ù…Ø¨Ù„Øº ÙŠØ¬Ø¨ Ø£Ù† ÙŠÙƒÙˆÙ† Ø£ÙƒØ¨Ø± Ù…Ù† ØµÙØ±" };
  if (!v.treasury_account_id || !v.counter_account_id) return { ok: false, error: "Ø§Ø®ØªØ± Ø§Ù„Ø®Ø²Ù†Ø© ÙˆØ§Ù„Ø­Ø³Ø§Ø¨ Ø§Ù„Ù…Ù‚Ø§Ø¨Ù„" };
  if (v.treasury_account_id === v.counter_account_id) return { ok: false, error: "Ø§Ù„Ø®Ø²Ù†Ø© ÙˆØ§Ù„Ø­Ø³Ø§Ø¨ Ø§Ù„Ù…Ù‚Ø§Ø¨Ù„ Ù„Ø§ ÙŠÙ…ÙƒÙ† Ø£Ù† ÙŠÙƒÙˆÙ†Ø§ Ù†ÙØ³ Ø§Ù„Ø­Ø³Ø§Ø¨" };
  const pid = v.party_id ?? null;
  // Ø³Ù†Ø¯ Ù‚Ø¨Ø¶: Ù†Ù‚Ø¯ÙŠØ© Ù…Ø¯ÙŠÙ†Ø© / Ø§Ù„Ø­Ø³Ø§Ø¨ Ø§Ù„Ù…Ù‚Ø§Ø¨Ù„ Ø¯Ø§Ø¦Ù† â€” Ø³Ù†Ø¯ ØµØ±Ù: Ø§Ù„Ø¹ÙƒØ³ (Ø§Ù„Ø·Ø±Ù ÙŠÙˆØ³Ù… Ø¹Ù„Ù‰ Ø³Ø·Ø± Ø§Ù„Ø­Ø³Ø§Ø¨ Ø§Ù„Ù…Ù‚Ø§Ø¨Ù„)
  const lines: GLLine[] = v.kind === "receipt"
    ? [{ account_id: v.treasury_account_id, debit: amt, credit: 0 }, { account_id: v.counter_account_id, debit: 0, credit: amt, party_id: pid }]
    : [{ account_id: v.counter_account_id, debit: amt, credit: 0, party_id: pid }, { account_id: v.treasury_account_id, debit: 0, credit: amt }];
  return createEntry(orgId, {
    date: v.date, description: v.description, branch_id: v.branch_id,
    entry_type: v.kind, notes: v.notes, status: "posted",
  }, lines);
}

// â”€â”€ Ø§Ù„Ø¹Ù…Ù„Ø§Ø¡ ÙˆØ§Ù„Ù…ÙˆØ±Ø¯ÙŠÙ† (Ø§Ù„Ø°Ù…Ù…) + Ø£Ø¹Ù…Ø§Ø± Ø§Ù„Ø¯ÙŠÙ† â”€â”€
export type PartyType = "customer" | "supplier";
export type GLParty = {
  id: number;
  organization_id: number;
  branch_id: number | null;
  type: string;                 // customer | supplier
  name: string;
  account_id: number | null;    // Ø­Ø³Ø§Ø¨ Ø§Ù„Ø°Ù…Ø©
  credit_days: number;          // Ù…Ø¯Ø© Ø§Ù„Ø³Ø¯Ø§Ø¯ (Ø£ÙŠØ§Ù…)
  phone: string | null;
  address: string | null;
  tax_number: string | null;
  parent_id: number | null;     // Ø·Ø±Ù Ø£Ø¨ (Ù…Ø±ÙƒØ²) Ù„Ù„Ø¹Ù…Ù„Ø§Ø¡ Ø§Ù„ÙØ±Ø¹ÙŠÙŠÙ†
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

// Ù…Ø³Ø§Ø¹Ø¯Ø§Øª ØªÙˆØ§Ø±ÙŠØ® Ù„Ø£Ø¹Ù…Ø§Ø± Ø§Ù„Ø¯ÙŠÙ†
function addDaysISO(d: string, days: number): string {
  const [y, m, dd] = (d || "").split("-").map(Number);
  const t = new Date(y, (m || 1) - 1, (dd || 1) + (days || 0));
  const z = (n: number) => String(n).padStart(2, "0");
  return `${t.getFullYear()}-${z(t.getMonth() + 1)}-${z(t.getDate())}`;
}
function daysDiff(a: string, b: string): number {   // b - a Ø¨Ø§Ù„Ø£ÙŠØ§Ù…
  const da = new Date((a || "") + "T00:00:00").getTime();
  const db = new Date((b || "") + "T00:00:00").getTime();
  return Math.round((db - da) / 86400000);
}

export type Aging = { current: number; d30: number; d60: number; d90: number; d90p: number; total: number };

// Ø£Ø¹Ù…Ø§Ø± Ø§Ù„Ø¯ÙŠÙ† Ø¨Ø·Ø±ÙŠÙ‚Ø© FIFO: ØªÙØ·Ø¨ÙŽÙ‘Ù‚ Ø§Ù„Ù…Ø¯ÙÙˆØ¹Ø§Øª Ø¹Ù„Ù‰ Ø£Ù‚Ø¯Ù… Ø§Ù„Ù…Ø¯ÙŠÙˆÙ†ÙŠØ§ØªØŒ Ø«Ù… ØªÙØ¨ÙˆÙŽÙ‘Ø¨ Ø§Ù„Ù…ØªØ¨Ù‚Ù‘ÙŠØ© Ø­Ø³Ø¨ ØªØ§Ø±ÙŠØ® Ø§Ù„Ø§Ø³ØªØ­Ù‚Ø§Ù‚
export function partyAging(
  lines: { date: string; debit: number; credit: number }[],
  type: string, creditDays: number, asOf: string
): Aging {
  const chargeIsDebit = type === "customer";   // Ø§Ù„Ø¹Ù…ÙŠÙ„: Ù…Ø¯ÙŠÙ† = Ù…Ø¯ÙŠÙˆÙ†ÙŠØ© Â· Ø§Ù„Ù…ÙˆØ±Ø¯: Ø¯Ø§Ø¦Ù† = Ù…Ø¯ÙŠÙˆÙ†ÙŠØ©
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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â• ÙÙˆØ§ØªÙŠØ± Ø§Ù„Ù…Ø¨ÙŠØ¹Ø§Øª (Ù†Ù‚Ø¯ÙŠ/Ø¢Ø¬Ù„/Ø¬Ø²Ø¦ÙŠ + Ø¶Ø±ÙŠØ¨Ø©) â•â•â•â•â•â•â•â•â•â•â•â•â•â•

// â”€â”€ Ø¹Ø±ÙˆØ¶ Ø£Ø³Ø¹Ø§Ø± Ø§Ù„Ù…Ø¨ÙŠØ¹Ø§Øª â”€â”€
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
  // Atomic, branch-scoped counter. Requires the migration RPC below.
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
    return { ok: false, error: "Ø£Ø¶Ù ØµÙ†ÙÙ‹Ø§ ÙˆØ§Ø­Ø¯Ù‹Ø§ Ø¹Ù„Ù‰ Ø§Ù„Ø£Ù‚Ù„ Ø¨Ù‚ÙŠÙ…Ø© ØµØ­ÙŠØ­Ø©." };
  const year = Number(quotation.date.slice(0, 4));
  let quotationNo: number;
  try { quotationNo = await nextQuotationNo(orgId, year, quotation.branch_id); }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : "ØªØ¹Ø°Ø± Ø¥Ù†Ø´Ø§Ø¡ Ø±Ù‚Ù… Ø§Ù„Ø¹Ø±Ø¶." }; }
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
  if (!data) return { ok: false, error: "ØªÙ… ØªØ­ÙˆÙŠÙ„ Ø§Ù„Ø¹Ø±Ø¶ Ù…Ø³Ø¨Ù‚Ù‹Ø§ Ø£Ùˆ Ù„Ù… ÙŠØ¹Ø¯ Ù…ØªØ§Ø­Ù‹Ø§ Ù„Ù„ØªØ­Ø¯ÙŠØ«." };
  return { ok: true };
}


export type SalesItem = { description: string; qty: number; unit_price: number; line_total: number };
export type SalesPayType = "cash" | "credit" | "partial";
export const PAYTYPE_LABEL: Record<SalesPayType, string> = { cash: "Ù†Ù‚Ø¯ÙŠ", credit: "Ø¢Ø¬Ù„", partial: "Ø¬Ø²Ø¦ÙŠ" };

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

// Ø­Ø³Ø§Ø¨ Ø¥Ø¬Ù…Ø§Ù„ÙŠØ§Øª Ø§Ù„ÙØ§ØªÙˆØ±Ø© Ù…Ù† Ø§Ù„Ø£Ø³Ø·Ø± ÙˆØ§Ù„Ø¶Ø±ÙŠØ¨Ø©
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
  if (t.total <= 0) return { ok: false, error: "Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„ÙØ§ØªÙˆØ±Ø© ØµÙØ± â€” Ø£Ø¶Ù Ø£ØµÙ†Ø§ÙÙ‹Ø§ Ø¨Ù‚ÙŠÙ…Ø©." };
  const paid = inv.payment_type === "cash" ? t.total : inv.payment_type === "credit" ? 0 : Math.min(Math.max(Number(inv.paid_amount) || 0, 0), t.total);
  const due = Math.round((t.total - paid) * 100) / 100;

  if (paid > 0 && !inv.treasury_account_id) return { ok: false, error: "Ø§Ø®ØªØ± Ø®Ø²Ù†Ø©/Ø¨Ù†Ùƒ Ø§Ù„ØªØ­ØµÙŠÙ„ Ù„Ù„Ø¬Ø²Ø¡ Ø§Ù„Ù†Ù‚Ø¯ÙŠ." };
  if (due > 0 && !inv.customer_account_id) return { ok: false, error: "Ø§Ø®ØªØ± Ø§Ù„Ø¹Ù…ÙŠÙ„ (Ø­Ø³Ø§Ø¨ Ø°Ù…Ø©) Ù„Ù„Ø¬Ø²Ø¡ Ø§Ù„Ø¢Ø¬Ù„." };
  if (t.tax > 0 && !inv.tax_account_id) return { ok: false, error: "Ø§Ø®ØªØ± Ø­Ø³Ø§Ø¨ Â«Ø§Ù„Ø¶Ø±ÙŠØ¨Ø© Ø§Ù„Ù…Ø³ØªØ­Ù‚Ø©Â»." };

  // Ù‚ÙŠØ¯ Ø§Ù„ÙØ§ØªÙˆØ±Ø©: Ù…Ø¯ÙŠÙ† (Ø®Ø²Ù†Ø© + Ø¹Ù…ÙŠÙ„) = Ø¯Ø§Ø¦Ù† (Ø¥ÙŠØ±Ø§Ø¯ + Ø¶Ø±ÙŠØ¨Ø©)
  const lines: GLLine[] = [];
  if (paid > 0) lines.push({ account_id: inv.treasury_account_id as number, debit: paid, credit: 0, branch_id: inv.branch_id });
  if (due > 0) lines.push({ account_id: inv.customer_account_id as number, debit: due, credit: 0, branch_id: inv.branch_id, party_id: inv.party_id ?? null });
  lines.push({ account_id: inv.revenue_account_id, debit: 0, credit: t.subtotal, branch_id: inv.branch_id });
  if (t.tax > 0) lines.push({ account_id: inv.tax_account_id as number, debit: 0, credit: t.tax, branch_id: inv.branch_id });

  const cust = inv.customer_name || "Ø¹Ù…ÙŠÙ„ Ù†Ù‚Ø¯ÙŠ";
  const res = await createEntry(orgId, {
    date: inv.date, description: `ÙØ§ØªÙˆØ±Ø© Ù…Ø¨ÙŠØ¹Ø§Øª â€” ${cust}`,
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
  if (error) { // ØªØ±Ø§Ø¬Ø¹ Ø¹Ù† Ø§Ù„Ù‚ÙŠØ¯ Ø¥Ù† ÙØ´Ù„ Ø­ÙØ¸ Ø§Ù„ÙØ§ØªÙˆØ±Ø©
    if (res.id) await deleteEntry(res.id);
    console.error("createSalesInvoice", error);
    return { ok: false, error: error.message };
  }
  return { ok: true, id: (data as any).id, entryId: res.id, invoiceNo: invoice_no };
}

export async function deleteSalesInvoice(inv: GLSalesInvoice): Promise<{ ok: boolean; error?: string }> {
  if (inv.entry_id) await deleteEntry(inv.entry_id);
  const { error } = await supabase.from("gl_sales_invoices").delete().eq("id", inv.id);
  if (error) console.error("deleteSalesInvoice", error);
  return { ok: !error, error: error?.message };
}

