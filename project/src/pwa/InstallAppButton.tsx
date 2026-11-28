import { Download } from 'lucide-react';
import { useLang } from '../context/LanguageContext';
import { promptInstall, usePwaState } from './pwaStore';

// يظهر فقط لما المتصفح يعلن إن التثبيت متاح (beforeinstallprompt). غير ذلك لا يُرسم شيء.
export default function InstallAppButton() {
  const { t } = useLang();
  const { canInstall } = usePwaState();
  if (!canInstall) return null;
  return (
    <button
      type="button"
      data-install-app
      onClick={() => { void promptInstall(); }}
      className="w-full flex items-center justify-center gap-2 bg-slate-800 text-slate-300 py-2 rounded-xl text-sm"
      title={t('Install MIHWAR as an app', 'ثبّت محور كتطبيق')}
    >
      <Download size={15} />
      <span>{t('Install app', 'تثبيت التطبيق')}</span>
    </button>
  );
}
