// src/pages/accounting/treasury/options.ts — SmartSelect option builders (names/aliases only from real data)
import type { GLAccount, GLParty } from "../../lib/accountingDb";
import type { SelectOption } from "./SmartSelect";
import type { Treasury } from "./treasuryDb";
import type { Tr } from "./i18n";
import { fmt } from "./ui";
import { maskTail } from "./searchUtils";
import type { BranchLite } from "./types";

export function treasuryOptions(ts: Treasury[], accById: Map<number, GLAccount>, branches: BranchLite[], T: Tr, balances?: Map<number, number>): SelectOption[] {
  const bName = (id: number | null) => (id == null ? "" : branches.find((b) => b.id === id)?.name || "");
  const sorted = [...ts].sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "cash" ? -1 : 1));
  return sorted.map((t) => {
    const acc = t.account_id ? accById.get(t.account_id) : undefined;
    const bal = balances?.get(t.id);
    const sub = [t.kind === "bank" ? (t.bank_name || T.bank) : T.cash, bName(t.branch_id), t.iban ? maskTail(t.iban) : ""].filter(Boolean).join(" · ");
    return {
      value: t.id, label: t.name, code: acc?.code,
      labelAlt: [acc?.name, acc?.name_en].filter(Boolean) as string[],
      numbers: [t.iban, t.account_number, acc?.code].filter(Boolean) as string[],
      other: [t.bank_name, bName(t.branch_id)].filter(Boolean) as string[],
      sublabel: sub,
      badge: t.is_active ? undefined : { text: T.inactive, tone: "slate" as const },
      right: bal == null ? undefined : fmt(bal), rightTone: bal == null ? undefined : bal < 0 ? ("neg" as const) : ("pos" as const),
      group: t.kind === "bank" ? T.bankAccounts : T.cashAccounts,
    };
  });
}

export function ledgerAccountOptions(accs: GLAccount[], T: Tr): SelectOption[] {
  const typeLabel: Record<string, string> = { asset: T.typeAsset, liability: T.typeLiability, equity: T.typeEquity, revenue: T.typeRevenue, expense: T.typeExpense };
  return accs.map((a) => ({
    value: a.id, label: a.name, code: a.code,
    labelAlt: a.name_en ? [a.name_en] : undefined,
    sublabel: typeLabel[a.type] || a.type,
  }));
}

export function partyOptions(parties: GLParty[], T: Tr): SelectOption[] {
  const byId = new Map(parties.map((p) => [p.id, p] as const));
  return parties.filter((p) => p.is_active !== false).map((p) => {
    const parent = p.parent_id != null ? byId.get(p.parent_id) : undefined;
    return {
      value: p.id, label: p.name, other: [p.phone || "", parent?.name || ""].filter(Boolean),
      sublabel: parent ? parent.name : undefined,
      badge: { text: p.type === "customer" ? T.customer : T.supplier, tone: p.type === "customer" ? ("emerald" as const) : ("purple" as const) },
      group: p.type === "customer" ? T.customer : T.supplier,
    };
  }).sort((a, b) => String(a.group).localeCompare(String(b.group)));
}

export function branchOptions(branches: BranchLite[]): SelectOption[] {
  return branches.map((b) => ({ value: b.id, label: b.name }));
}
