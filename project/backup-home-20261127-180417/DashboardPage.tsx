// =============================================================
// src/pages/DashboardPage.tsx
// الصفحة الرئيسية — لوحة مالية للفرع (بدون مخزون/منتجات).
// تعرض اسم الفرع + <BranchDashboard /> (مبيعات، صافي ربح،
// نقطة التعادل، مشتريات/مصروفات، أعلى القنوات، اتجاه 7 أيام).
// زر «تزامن البيانات» يعيد قراءة بيانات الفرع لحظيًا.
// =============================================================

import { useEffect, useState, useCallback } from 'react';
import { Store, RefreshCw } from 'lucide-react';
import { supabase } from './lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LanguageContext';
import BranchDashboard from '../components/BranchDashboard';

export default function DashboardPage() {
  const { user, ownedShopId } = (useAuth() as any) ?? {};
  const { t, isRTL } = useLang();

  const [shop, setShop] = useState<any>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // اسم الفرع: مالك المحل أولاً، وإلا عبر store_id (عضو فرع)
  const loadShop = useCallback(async () => {
    try {
      if (!user) return;
      let data: any = null;
      const owned = await supabase
        .from('shops').select('shop_name').eq('owner_id', user.id).maybeSingle();
      data = owned.data;
      if (!data && ownedShopId) {
        const byId = await supabase
          .from('shops').select('shop_name').eq('id', ownedShopId).maybeSingle();
        data = byId.data;
      }
      setShop(data);
    } catch (err) {
      console.error('LOAD SHOP NAME FAILED', err);
    }
  }, [user, ownedShopId]);

  useEffect(() => { loadShop(); }, [loadShop]);

  // يعيد قراءة اسم الفرع + يجبر BranchDashboard على إعادة القراءة من التخزين
  const refresh = () => { loadShop(); setRefreshKey((k) => k + 1); };

  return (
    <div dir={isRTL ? 'rtl' : 'ltr'} className="min-h-screen bg-slate-950 text-white pb-12">
      <div className="w-full max-w-none space-y-5 p-4 lg:p-8">

        {/* ── HEADER ── */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/50 pb-6">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-12 h-12 rounded-2xl bg-[#002B5B]/40 border border-[#002B5B]/60 flex items-center justify-center shrink-0 shadow-lg shadow-[#002B5B]/10">
              <Store size={24} className="text-[#00A86B]" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl lg:text-3xl font-black text-white tracking-tight truncate">
                {shop?.shop_name || t('My Store', 'متجري')}
              </h1>
              <div className="flex items-center gap-2 mt-1">
                <span className="flex h-2 w-2 rounded-full bg-[#00A86B] animate-pulse" />
                <p className="text-slate-400 text-xs font-medium uppercase tracking-wider">
                  {t('Financial Overview', 'النظرة المالية')}
                </p>
              </div>
            </div>
          </div>
          <button
            onClick={refresh}
            className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 border border-slate-700/50 rounded-xl px-4 py-2.5 transition-all active:scale-95 group self-start md:self-auto"
          >
            <RefreshCw size={16} className="text-slate-400 group-hover:rotate-180 transition-transform duration-500" />
            <span className="text-slate-300 text-sm font-semibold">{t('Sync Data', 'تزامن البيانات')}</span>
          </button>
        </div>

        {/* ── لوحة الفرع المالية اللحظية ── */}
        <BranchDashboard key={refreshKey} />

      </div>
    </div>
  );
}
