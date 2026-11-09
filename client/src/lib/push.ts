import { api } from './api';
import { ensureServiceWorker, isIos, isStandalone } from './pwa';

export type PushState = 'unsupported' | 'needs-install' | 'default' | 'denied' | 'subscribed';

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export async function getPushState(): Promise<PushState> {
  if (!pushSupported()) return isIos() && !isStandalone() ? 'needs-install' : 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    return sub ? 'subscribed' : 'default';
  } catch {
    return 'default';
  }
}

/** Pede permissão, assina no navegador e registra no servidor. */
export async function subscribePush(publicKey: string): Promise<PushState> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'default';
  const reg = await ensureServiceWorker();
  if (!reg) return 'unsupported';
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: publicKey }));
  await api('/api/push/subscribe', { method: 'POST', json: { subscription: sub.toJSON() } });
  return 'subscribed';
}

export async function unsubscribePush(): Promise<void> {
  if (!pushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    const endpoint = sub.endpoint;
    await sub.unsubscribe();
    await api('/api/push/subscribe', { method: 'DELETE', json: { endpoint } }).catch(() => undefined);
  } catch {
    /* melhor esforço */
  }
}

/** Aviso local quando o app está aberto mas em segundo plano (aba escondida). */
export async function showLocalNotification(title: string, body: string, url = '/mural'): Promise<void> {
  if (!pushSupported() || Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return;
    await reg.showNotification(title, {
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: 'mural',
      data: { url },
    });
  } catch {
    /* sem suporte */
  }
}
