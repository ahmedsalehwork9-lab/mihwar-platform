// =============================================================
// src/pages/purchases/PurchaseInvoicesPage.tsx
// فواتير المشتريات: القائمة (list/PurchaseListView) + نموذج الإدخال (entry/PurchaseEntryForm).
// هذه الصفحة تحمّل البيانات المرجعية وتبدّل بين العرضين فقط.
// =============================================================
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import * as DB from "../lib/accountingDb";
import type { GLAccount, GLPurchaseInvoice, GLTreasury } from "../lib/accountingDb";
import PurchaseListView from "./list/PurchaseListView";
import PurchaseEntryForm from "./entry/PurchaseEntryForm";

const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10); };
const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export default function PurchaseInvoicesPage() {
  const { ownedShopId } = (useAuth() as any) ?? {};
  const [org, setOrg] = useState<{ id: number; name: string } | null>(null);
  const [accounts, setAccounts] = useState<GLAccount[]>([]);
  const [treasuries, setTreasuries] = useState<GLTreasury[]>([]);
  const [list, setList] = useState<GLPurchaseInvoice[]>([]);
  const [retByInv, setRetByInv] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [mode, setMode] = useState<"list" | "new">("list");
  const shopId = ownedShopId ? Number(ownedShopId) : null;

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const o = await DB.getOrgForBranch(ownedShopId ?? null);
      if (!alive) return;
      setOrg(o);
      if (o) {
        const [accs, treas] = await Promise.all([DB.fetchAccounts(o.id), DB.fetchTreasuries(o.id)]);
        if (!alive) return;
        setAccounts(accs); setTreasuries(treas);
      } else { setAccounts([]); setTreasuries([]); }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [ownedShopId]);

  const loadList = useCallback(async () => {
    if (!org) return;
    const [inv, rets] = await Promise.all([
      DB.fetchPurchaseInvoices(org.id, from, to, shopId),
      DB.fetchPurchaseReturns(org.id, undefined, undefined, shopId),
    ]);
    setList(inv);
    const m: Record<number, number> = {};
    for (const r of rets) m[r.original_invoice_id] = r2((m[r.original_invoice_id] || 0) + (Number(r.total) || 0));
    setRetByInv(m);
  }, [org, from, to, shopId]);
  useEffect(() => { loadList(); }, [loadList]);

  const reloadAccounts = useCallback(async () => { if (org) setAccounts(await DB.fetchAccounts(org.id)); }, [org]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" dir="rtl">
      <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (mode === "new" && org) {
    return <PurchaseEntryForm org={org} shopId={shopId} accounts={accounts} treasuries={treasuries} reloadAccounts={reloadAccounts} onChanged={loadList} onClose={() => { setMode("list"); window.scrollTo(0, 0); }} />;
  }

  return (
    <PurchaseListView
      orgId={org?.id ?? null} orgName={org?.name ?? ""} shopId={shopId} branchId={shopId}
      list={list} retByInv={retByInv} from={from} to={to} setFrom={setFrom} setTo={setTo} onReload={loadList}
      onNew={() => { setMode("new"); window.scrollTo(0, 0); }} notice={null}
    />
  );
}
