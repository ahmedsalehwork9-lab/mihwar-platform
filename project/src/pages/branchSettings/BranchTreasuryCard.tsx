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
import { CHAN_ROLES, channelAssigned, writeLocalChan } from "../lib/channelTreasury";
import type { ChanRole } from "../lib/channelTreasury";
import * as BAPI from "./branchApi";
import type { MapOp, MapRow } from "./branchLogic";

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
  const [mapRows, setMapRows] = useState<MapRow[]>([]);
  const [chan, setChan] = useState<Record<ChanRole, number | "">>({ sales_cash: "", sales_bank: "", pos_cash: "", pos_bank: "" });
  const [chanSaved, setChanSaved] = useState<Record<ChanRole, number | "">>({ sales_cash: "", sales_bank: "", pos_cash: "", pos_bank: "" });

  const reload = useCallback(async () => {
    const r = await DB.fetchTreasuries(orgId);
    setRows(r);
    try { setMapRows(await BAPI.fetchMap(orgId)); } catch { setMapRows([]); }
  }, [orgId]);
  useEffect(() => { void reload(); }, [reload]);

  const mine = useMemo(() => ({
    cash: rows.find((x) => x.branch_id === branchId && x.kind === "cash") ?? null,
    bank: rows.find((x) => x.branch_id === branchId && isBankRow(x)) ?? null,
  }), [rows, branchId]);

  useEffect(() => {
    setSel({ cash: mine.cash?.is_active !== false && mine.cash?.account_id ? mine.cash.account_id : "", bank: mine.bank?.is_active !== false && mine.bank?.account_id ? mine.bank.account_id : "" });
  }, [mine]);

  useEffect(() => {
    const v = Object.fromEntries(CHAN_ROLES.map((r) => [r, channelAssigned(mapRows, branchId, r) ?? ""])) as Record<ChanRole, number | "">;
    setChan(v); setChanSaved(v);
  }, [mapRows, branchId]);

  const opts = useMemo(() => cashBankOptions(accounts, []), [accounts]);
  const branchOpts = useMemo(() => cashBankOptions(accounts, rows.filter((x) => x.branch_id === branchId)).filter((o) => o.backed), [accounts, rows, branchId]);
  const chanOpts = (k: Kind) => branchOpts.filter((o) => o.kind === k);
  const chanDirty = CHAN_ROLES.some((r) => chan[r] !== chanSaved[r]);
  const saveChan = async () => {
    setBusy(true);
    const ops: MapOp[] = CHAN_ROLES.filter((r) => chan[r] !== chanSaved[r]).map((r) => chan[r] === "" ? { op: "delete", role: r } as MapOp : { op: "upsert", role: r, account_id: Number(chan[r]) } as MapOp);
    const res = await BAPI.applyMapOps(orgId, branchId, ops);
    let text: string; let ok = true;
    if (res.ok) { CHAN_ROLES.forEach((r) => writeLocalChan(branchId, r, null)); text = t("Channel treasuries saved.", "تم حفظ خزن القنوات (المبيعات / نقاط البيع)."); }
    else {
      CHAN_ROLES.filter((r) => chan[r] !== chanSaved[r]).forEach((r) => writeLocalChan(branchId, r, chan[r] === "" ? null : Number(chan[r])));
      ok = false; text = t("The database did not accept the channel setting (", "لم تقبل قاعدة البيانات إعداد القنوات (") + res.error + t("). Saved on this browser only.", "). حُفظ على هذا المتصفح فقط.");
    }
    setBusy(false); await reload(); onMsg({ ok, text });
  };
  const chanField = (r: ChanRole, label: string) => (
    <div>
      <label className={LBL}>{label}</label>
      <select className={INP} value={chan[r]} onChange={(e) => setChan((c) => ({ ...c, [r]: e.target.value ? Number(e.target.value) : "" }))} data-testid={`chan-${r}`}>
        <option value="">{t("— all branch treasuries —", "— كل خزن الفرع —")}</option>
        {chanOpts(r.endsWith("cash") ? "cash" : "bank").map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </div>
  );
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
      <div className="border-t border-slate-800 pt-3 space-y-2" data-testid="chan-section">
        <div className="text-xs font-bold">{t("Separate treasuries per channel", "فصل الخزن حسب القناة")}</div>
        <p className="text-[11px] text-slate-500">{t("Choose which treasury each channel uses. Leave as «all» to let the screen offer every branch treasury, or pick the same account in both channels to share it. Save the branch cash/bank above first.", "حدّد خزنة كل قناة: اتركها «كل خزن الفرع» لتظهر جميعها، أو اختر نفس الحساب في القناتين لتشتركا فيه. احفظ خزنة وبنك الفرع بالأعلى أولًا.")}</p>
        <div className="grid gap-3 md:grid-cols-2">
          {chanField("sales_cash", t("Sales invoices — cash", "فواتير المبيعات — نقد"))}
          {chanField("sales_bank", t("Sales invoices — bank/card", "فواتير المبيعات — بنك/شبكة"))}
          {chanField("pos_cash", t("POS — cash", "نقاط البيع — نقد"))}
          {chanField("pos_bank", t("POS — bank/card", "نقاط البيع — بنك/شبكة"))}
        </div>
        <div className="flex justify-end"><button type="button" onClick={() => void saveChan()} disabled={!chanDirty || busy} className={BTN} data-testid="chan-save"><Save size={15} />{t("Save channels", "حفظ القنوات")}</button></div>
      </div>
    </div>
  );
}
