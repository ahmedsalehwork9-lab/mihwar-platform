// =============================================================
// src/pages/lib/channelTreasury.ts
// فصل خزنة/بنك «نقاط البيع» عن «فواتير المبيعات» لكل فرع (كل قناة إما نفس الخزنة أو خزنة مختلفة).
// التخزين: gl_account_map بأدوار sales_cash / sales_bank / pos_cash / pos_bank؛ وإن رفضتها قاعدة البيانات
// يُحفظ الاختيار في هذا المتصفح فقط (localStorage) مع إخبار المستخدم صراحةً.
// Per-channel (sales vs POS) cash/bank assignment per branch. Unassigned = all branch treasuries (unchanged behaviour).
// =============================================================
import type { CashOption } from "./cashAccounts";

export type Channel = "sales" | "pos";
export type ChanKind = "cash" | "bank";
export type ChanRole = `${Channel}_${ChanKind}`;
export const CHAN_ROLES: ChanRole[] = ["sales_cash", "sales_bank", "pos_cash", "pos_bank"];
type MapLike = { branch_id: number | null; role: string; account_id: number };

const key = (branchId: number, role: string) => `mihwar.chan.${branchId}.${role}`;

export function readLocalChan(branchId: number, role: ChanRole): number | null {
  try { const v = localStorage.getItem(key(branchId, role)); const n = v ? Number(v) : NaN; return Number.isFinite(n) && n > 0 ? n : null; } catch { return null; }
}
export function writeLocalChan(branchId: number, role: ChanRole, accountId: number | null): void {
  try { if (accountId == null) localStorage.removeItem(key(branchId, role)); else localStorage.setItem(key(branchId, role), String(accountId)); } catch { /* storage unavailable */ }
}
/** التعيين الفعلي: صف الفرع في gl_account_map ثم الاحتياطي المحلي. */
export function channelAssigned(rows: MapLike[], branchId: number, role: ChanRole): number | null {
  const r = rows.find((x) => x.role === role && x.branch_id === branchId);
  return r ? r.account_id : readLocalChan(branchId, role);
}
/** يقيّد القائمة بالحساب المعيَّن للقناة إن كان موجودًا فيها؛ وإلا تبقى القائمة كما هي. */
export function limitToChannel(options: CashOption[], kind: ChanKind, assignedId: number | null): CashOption[] {
  const ofKind = options.filter((o) => o.kind === kind);
  if (assignedId == null) return ofKind;
  const hit = ofKind.filter((o) => o.id === assignedId);
  return hit.length ? hit : ofKind;
}
