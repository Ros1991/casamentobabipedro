import { create } from 'zustand';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface PwaState {
  /** Evento do Chrome/Android que permite abrir o diálogo nativo de instalação */
  installEvent: BeforeInstallPromptEvent | null;
  installed: boolean;
  swRegistration: ServiceWorkerRegistration | null;
}

export const usePwa = create<PwaState>(() => ({ installEvent: null, installed: false, swRegistration: null }));

/** Aberto a partir do ícone na tela inicial (modo app). */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isIos(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/** Registra o service worker e escuta os eventos de instalação. Chamar uma vez, no início. */
export function setupPwa(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    usePwa.setState({ installEvent: e as BeforeInstallPromptEvent });
  });
  window.addEventListener('appinstalled', () => usePwa.setState({ installEvent: null, installed: true }));
  if (isStandalone()) usePwa.setState({ installed: true });

  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        usePwa.setState({ swRegistration: reg });
        void reg.update();
      })
      .catch(() => undefined);
  }
}

export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const ev = usePwa.getState().installEvent;
  if (!ev) return 'unavailable';
  await ev.prompt();
  const choice = await ev.userChoice;
  usePwa.setState({ installEvent: null });
  return choice.outcome;
}

/** Garante um service worker registrado (necessário para notificações). */
export async function ensureServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  let reg = await navigator.serviceWorker.getRegistration();
  if (!reg) reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  usePwa.setState({ swRegistration: reg });
  return reg;
}
