import { registerSW } from 'virtual:pwa-register';
import { attachInstallListeners, setNeedRefresh, setUpdateHandler } from './pwaStore';

const CHECK_EVERY_MS = 60 * 60 * 1000; // فحص تحديث كل ساعة

// يُستدعى مرة واحدة من main.tsx. لا يعمل في وضع التطوير (devOptions.enabled=false).
export function registerPwa(): void {
  attachInstallListeners();

  const update = registerSW({
    immediate: true,
    onNeedRefresh() {
      setNeedRefresh(true);
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      const check = () => { registration.update().catch(() => { /* أوفلاين: تجاهل */ }); };
      window.setInterval(check, CHECK_EVERY_MS);
      // لما المستخدم يرجع للتبويب/التطبيق بعد فترة، نفحص فورًا حتى لا يعلق على نسخة قديمة
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
    },
    onRegisterError(err) {
      console.error('[PWA] service worker registration failed', err);
    },
  });
  setUpdateHandler(update);
}
