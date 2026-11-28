// حالة PWA المشتركة: التحديث المتاح + حدث التثبيت.
// بنخزّنها على مستوى الـ module لأن beforeinstallprompt بيتطلق مبكرًا قبل ما React يترسم.
import { useSyncExternalStore } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

interface PwaState {
  needRefresh: boolean;
  canInstall: boolean;
}

let state: PwaState = { needRefresh: false, canInstall: false };
let deferredPrompt: BeforeInstallPromptEvent | null = null;
let updateSW: ((reloadPage?: boolean) => Promise<void>) | null = null;
const listeners = new Set<() => void>();

function set(patch: Partial<PwaState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function setNeedRefresh(v: boolean) { set({ needRefresh: v }); }
export function setUpdateHandler(fn: (reloadPage?: boolean) => Promise<void>) { updateSW = fn; }

export async function applyUpdate(): Promise<void> {
  // workbox-window أحيانًا ما بيعملش reload بعد التفعيل، فنضمن إعادة التحميل بأنفسنا
  // أول ما الـ service worker الجديد يستلم الصفحة (controllerchange).
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
  }
  if (updateSW) await updateSW(true);
}

export async function promptInstall(): Promise<void> {
  if (!deferredPrompt) return;
  const ev = deferredPrompt;
  deferredPrompt = null;
  set({ canInstall: false });
  try {
    await ev.prompt();
    await ev.userChoice;
  } catch {
    /* المستخدم أغلق النافذة — لا شيء */
  }
}

let installListenersAttached = false;
export function attachInstallListeners(): void {
  if (installListenersAttached || typeof window === 'undefined') return;
  installListenersAttached = true;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    set({ canInstall: true });
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    set({ canInstall: false });
  });
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}
const getSnapshot = () => state;

export function usePwaState(): PwaState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
