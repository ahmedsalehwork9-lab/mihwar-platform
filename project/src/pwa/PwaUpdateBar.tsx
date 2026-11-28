import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useLang } from '../context/LanguageContext';
import { applyUpdate, setNeedRefresh, usePwaState } from './pwaStore';

// شريط «يوجد تحديث» — يظهر فقط لما يكون إصدار جديد جاهز ومنتظر.
export default function PwaUpdateBar() {
  const { t, lang } = useLang();
  const { needRefresh } = usePwaState();
  const [busy, setBusy] = useState(false);

  if (!needRefresh) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
      data-pwa-update-bar
      className="fixed inset-x-3 z-[100] mx-auto max-w-xl rounded-2xl border border-sky-500/40 bg-slate-900 text-slate-100 shadow-2xl px-4 py-3 flex flex-wrap items-center gap-3"
      style={{ bottom: 'max(5.5rem, calc(env(safe-area-inset-bottom) + 5rem))' }}
    >
      <RefreshCw size={18} className="text-sky-400 flex-shrink-0" aria-hidden="true" />
      <div className="flex-1 min-w-[12rem]">
        <p className="text-sm font-semibold">
          {t('A new version is available', 'يوجد تحديث جديد')}
        </p>
        <p className="text-xs text-slate-300">
          {t('Save your work, then press Update.', 'احفظ شغلك الأول، وبعدين اضغط للتحديث.')}
        </p>
      </div>
      <div className="flex gap-2 w-full sm:w-auto">
        <button
          type="button"
          disabled={busy}
          onClick={async () => { setBusy(true); await applyUpdate(); }}
          className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-60 text-white text-sm font-bold"
        >
          {busy ? t('Updating…', 'جارٍ التحديث…') : t('Update', 'تحديث')}
        </button>
        <button
          type="button"
          onClick={() => setNeedRefresh(false)}
          className="px-3 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-100 text-sm"
        >
          {t('Later', 'لاحقًا')}
        </button>
      </div>
    </div>
  );
}
