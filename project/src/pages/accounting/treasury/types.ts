// src/pages/accounting/treasury/types.ts — shared prop types
import type { GLAccount, GLParty } from "../../lib/accountingDb";

export type BranchLite = { id: number; name: string };
export type OrgLite = { id: number; name: string };

export type Ctx = {
  org: OrgLite;
  postable: GLAccount[];                 // postable (non-group) chart-of-accounts rows
  accById: Map<number, GLAccount>;
  branches: BranchLite[];
  parties: GLParty[];
  shop: { id?: number | null; shop_name?: string | null; tax_number?: string | null; commercial_registration?: string | null; logo_url?: string | null } | null;
  notify: (msg: string, tone?: "ok" | "err" | "info") => void;
};

export const resolvePartyAccount = (p: GLParty, all: GLParty[]): number | null => {
  if (p.account_id) return p.account_id;
  if (p.parent_id) { const parent = all.find((x) => x.id === p.parent_id); return parent?.account_id ?? null; }
  return null;
};

import type { EntryState } from "./treasuryDb";

/** One ledger line that hits a cash/bank account, enriched for the transactions table. */
export type Row = {
  key: number; lineId: number; entryId: number;
  date: string; entryNo: number; entryYear: number; jvLabel: string;
  description: string; notes: string; entryType: string;
  treasuryId: number | null; treasuryName: string; accountId: number;
  debit: number; credit: number; balance: number | null;
  state: EntryState; isTransfer: boolean;
  partyName: string; counter: string; createdAt?: string;
};
