// =============================================================
// src/context/OrgConfigContext.tsx
// يحمّل إعداد الشركة النشطة (حسب الفرع الحالي) ويضبط حامل العملة العالمي،
// فتتبع كل التنسيقات (العملة/الأرقام/التواريخ) إعدادات الشركة تلقائيًا.
// =============================================================
import { createContext, useContext, useEffect, useState, useCallback, Fragment, ReactNode } from "react";
import { useAuth } from "./AuthContext";
import { getOrgForBranch } from "../pages/lib/accountingDb";
import { OrgConfig, DEFAULT_CONFIG, fetchOrgConfig, setActiveFromConfig } from "../pages/lib/orgConfig";

type Ctx = { cfg: OrgConfig; loading: boolean; reload: () => void };
const OrgConfigContext = createContext<Ctx | null>(null);

export function OrgConfigProvider({ children }: { children: ReactNode }) {
  const { ownedShopId } = (useAuth() as any) ?? {};
  const [cfg, setCfg] = useState<OrgConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const org = await getOrgForBranch(ownedShopId ?? null);
      if (org) { const c = await fetchOrgConfig(org.id); setActiveFromConfig(c); setCfg(c); }
      else { setActiveFromConfig(DEFAULT_CONFIG); setCfg(DEFAULT_CONFIG); }
    } catch { setCfg(DEFAULT_CONFIG); } finally { setLoading(false); }
  }, [ownedShopId]);

  useEffect(() => { load(); }, [load]);

  return <OrgConfigContext.Provider value={{ cfg, loading, reload: load }}>
    {/* عند تغيّر العملة (تحميل الشركة أو تغيير الدولة) تُعاد رسم الواجهة كي تلتقط كل الشاشات الاختصار الجديد */}
    <Fragment key={`${cfg.currency}|${cfg.currency_symbol}`}>{children}</Fragment>
  </OrgConfigContext.Provider>;
}

export function useOrgConfig(): Ctx {
  const c = useContext(OrgConfigContext);
  return c ?? { cfg: DEFAULT_CONFIG, loading: false, reload: () => { /* noop */ } };
}
