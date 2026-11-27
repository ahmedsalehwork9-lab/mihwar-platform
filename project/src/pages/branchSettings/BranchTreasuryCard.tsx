// =============================================================
// src/pages/branchSettings/BranchTreasuryCard.tsx
// «الخزنة والحساب البنكي للفرع» — يحدّد صندوق الفرع وحساب بنكه/شبكته (تُستخدم في نقاط البيع وفواتير البيع والشراء).
// يكتب في gl_treasuries (kind=cash|bank، branch_id=الفرع) بلا أي جدول جديد، ولا يحذف شيئًا (الإلغاء = تعطيل الصف).
// Branch cash drawer + bank/POS account picker. Writes branch-scoped rows to gl_treasuries; never deletes.
// =============================================================
import { useCallback, useEffect, useMemo, useState } from "react";
import { Wallet, Save } from "lucide-react";
import * as DB from "../lib/accountingDb";
import type { GLAccount, GLTreasury } from "../lib/accountingDb";
import { cashBankOptions } from "../lib/cashAccounts";

type Props = {
  orgId: number; branchId: number; branchName: string; accounts: GLAccount[];
  t: (en: string, ar: string) => string; INP: string; LBL: string; BTN: string;
  onMsg: (m: { ok: boolean; text: string }) => void;
};
type Kind = "cash" | "bank";
const isBankRow = (x: GLTreasury) => x.kind === "bank" || (x.kind as string) === "pos";

export default function BranchTreasuryCard({ orgId, branchId, branchName, accounts, t, INP, LBL, BTN, onMsg }: Props) {
  const [rows, setRows] = useState<GLTreasury[]>([]);
  const [sel, setSel] = useState<Record<Kind, number | "">>({ cash: "", bank: "" });
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const r = await DB.fetchTreasuries(orgId);
    setRows(r);
  }, [orgId]);
  useEffect(() => { void reload(); }, [reload]);

  const mine = useMemo(() => ({
    cash: rows.find((x) => x.branch_id === branchId && x.kind === "cash") ?? null,
    bank: rows.find((x) => x.branch_id === branchId && isBankRow(x)) ?? null,
  }), [rows, branchId]);

  useEffect(() => {
    setSel({ cash: mine.cash?.is_active !== false && mine.cash?.account_id ? mine.cash.account_id : "", bank: mine.bank?.is_active !== false && mine.bank?.account_id ? mine.bank.account_id : "" });
  }, [mine]);

  const opts = useMemo(() => cashBankOptions(accounts, []), [accounts]);
  const optsOf = (k: Kind) => opts.filter((o) => o.kind === k);
  const autoName = (k: Kind, id: number | "") => { const o = optsOf(k).find((x) => x.id === id); return o ? o.name : t("not set", "غير محدد"); };

  const changed = (k: Kind): boolean => {
    const cur = mine[k]; const curAcc = cur && cur.is_active !== false ? cur.account_id ?? "" : "";
    return curAcc !== sel[k];
  };
  const dirty = changed("cash") || changed("bank");

  const save = async () => {
    setBusy(true);
    let err: string | null = null;
    for (const k of ["cash", "bank"] as Kind[]) {
      if (!changed(k)) continue;
      const cur = mine[k]; const acc = sel[k];
      if (acc === "") { if (cur) { const r = await DB.upsertTreasury({ id: cur.id, is_active: false } as Partial<GLTreasury>); if (!r.ok) err = r.error || "error"; } continue; }
      if (cur) { const r = await DB.upsertTreasury({ id: cur.id, account_id: acc, is_active: true } as Partial<GLTreasury>); if (!r.ok) err = r.error || "error"; }
      else {
        const r = await DB.upsertTreasury({ organization_id: orgId, branch_id: branchId, kind: k, account_id: acc, opening_balance: 0, is_active: true,
          name: k === "cash" ? `${t("Cash drawer", "خزنة")} ${branchName}` : `${t("Bank / card network", "بنك / شبكة")} ${branchName}` } as Partial<GLTreasury>);
        if (!r.ok) err = r.error || "error";
      }
    }
    setBusy(false);
    await reload();
    onMsg(err ? { ok: false, text: t("Could not save: ", "تعذّر الحفظ: ") + err } : { ok: true, text: t("Branch cash drawer and bank account saved.", "تم حفظ خزنة الفرع وحسابه البنكي.") });
  };

  const field = (k: Kind, label: string, hint: string) => (
    <div>
      <label className={LBL}>{label}</label>
      <select className={INP} value={sel[k]} onChange={(e) => setSel((s) => ({ ...s, [k]: e.target.value ? Number(e.target.value) : "" }))} data-testid={`bt-${k}`}>
        <option value="">{t("— not set —", "— غير محدد —")}</option>
        {optsOf(k).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
      <div className="mt-1 text-[11px] text-slate-400">{hint}: <b data-testid={`bt-eff-${k}`}>{autoName(k, sel[k])}</b></div>
    </div>
  );

  return (
    <div className="rounded-xl border border-slate-800 p-3 space-y-3 mt-2" data-testid="branch-treasury-card">
      <div className="flex items-center gap-2 text-sm font-bold"><Wallet size={15} className="text-emerald-400" />{t("Cash drawer & bank account (POS, sales, purchases)", "الخزنة والحساب البنكي (نقاط البيع والمبيعات والمشتريات)")}</div>
      <p className="text-[11px] text-slate-500">{t("These accounts are used for this branch's cash and card/bank collection. Only leaf accounts are listed (group accounts never appear).", "تُستخدم لتحصيل هذا الفرع نقدًا وبالشبكة/البنك. تظهر الحسابات غير التجميعية فقط (الحساب التجميعي لا يظهر).")}</p>
      <div className="grid gap-3 md:grid-cols-2">
        {field("cash", t("Cash drawer account", "حساب الخزنة (الصندوق)"), t("Current", "المحدد"))}
        {field("bank", t("Bank / card-network account", "حساب البنك / الشبكة"), t("Current", "المحدد"))}
      </div>
      {optsOf("cash").length === 0 && <div className="text-[11px] text-amber-300">{t("No cash account found in the chart of accounts (e.g. 1101).", "لا يوجد حساب صندوق في دليل الحسابات (مثل 1101).")}</div>}
      {optsOf("bank").length === 0 && <div className="text-[11px] text-amber-300">{t("No bank account found in the chart of accounts (e.g. 1102).", "لا يوجد حساب بنك في دليل الحسابات (مثل 1102).")}</div>}
      <div className="flex justify-end"><button type="button" onClick={() => void save()} disabled={!dirty || busy} className={BTN} data-testid="bt-save"><Save size={15} />{t("Save cash & bank", "حفظ الخزنة والبنك")}</button></div>
    </div>
  );
}
