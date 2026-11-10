import { eq } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import { sendNotification, setVapidDetails } from 'web-push';
import { config } from './config.js';
import { db } from './db/index.js';
import { pushSubscriptions } from './db/schema.js';
import type { EventDTO, MessageDTO } from './dto.js';
import { onlineGuestIds } from './realtime.js';
import { WEDDING } from './wedding.js';

/** No máximo um aviso a cada 2 minutos por aparelho; a tag "mural" substitui o aviso anterior. */
const THROTTLE_MS = 2 * 60 * 1000;

export const pushEnabled = !!(config.vapidPublicKey && config.vapidPrivateKey);
let warn: (details: Record<string, unknown>, msg: string) => void = (details, msg) => console.warn(msg, details);

export function setupPush(logger: FastifyBaseLogger): void {
  warn = (details, msg) => logger.warn(details, msg);
  if (!pushEnabled) {
    logger.info('Web Push desligado (defina VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY para ativar).');
    return;
  }
  setVapidDetails(config.vapidSubject, config.vapidPublicKey, config.vapidPrivateKey);
  logger.info('Web Push ativo.');
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

const dayFmt = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: WEDDING.timeZone });

/** "sáb., 21/12" a partir de "2026-12-21" */
export function formatEventDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return dayFmt.format(new Date(Date.UTC(y, m - 1, d, 15, 0, 0))).replace('.', '');
}

async function sendToAll(targets: { id: string; endpoint: string; p256dh: string; auth: string }[], payload: string): Promise<void> {
  const now = Date.now();
  await Promise.allSettled(
    targets.map(async (s) => {
      try {
        await sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, {
          TTL: 60 * 60 * 6,
          urgency: 'normal',
        });
        db.update(pushSubscriptions).set({ lastNotifiedAt: now }).where(eq(pushSubscriptions.id, s.id)).run();
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id)).run();
        } else {
          warn({ err, endpoint: s.endpoint.slice(0, 60) }, 'Falha ao enviar push');
        }
      }
    }),
  );
}

/**
 * Combinado oficial (dos noivos): avisa todo mundo que assinou, inclusive quem está online,
 * sem o limite de 2 minutos. Quem criou não recebe.
 */
export async function notifyOfficialEvent(event: EventDTO, action: 'new' | 'updated'): Promise<void> {
  if (!pushEnabled) return;
  const targets = db
    .select()
    .from(pushSubscriptions)
    .all()
    .filter((s) => s.guestId !== event.createdBy.id);
  if (targets.length === 0) return;
  const when = `${formatEventDate(event.date)}${event.time ? ` às ${event.time}` : ''}`;
  const payload = JSON.stringify({
    title: action === 'new' ? 'Combinado dos noivos 💍' : 'Combinado atualizado 💍',
    body: `${event.title} · ${when}. Toque para confirmar presença.`.slice(0, 180),
    url: '/agenda',
    tag: `evento-${event.id}`,
    icon: '/icons/icon-192.png',
    badge: '/icons/badge.png',
  });
  await sendToAll(targets, payload);
}

/**
 * Avisa quem assinou e não está com o app aberto. Roda em segundo plano (não bloqueia a resposta).
 */
/**
 * Aviso para quem foi marcado (@) ou teve a mensagem respondida. Sem o limite de 2 minutos
 * e com título próprio; quem está com o app aberto vê na hora e não recebe push.
 */
export async function notifyDirect(message: MessageDTO, who: Map<string, 'mention' | 'reply'>): Promise<void> {
  if (!pushEnabled || who.size === 0) return;
  const online = new Set(onlineGuestIds());
  const author = firstName(message.guest.name);
  for (const kind of ['mention', 'reply'] as const) {
    const targets = db
      .select()
      .from(pushSubscriptions)
      .all()
      .filter((s) => who.get(s.guestId) === kind && !online.has(s.guestId));
    if (targets.length === 0) continue;
    const payload = JSON.stringify({
      title: kind === 'mention' ? `${author} marcou você 👋` : `${author} respondeu sua mensagem`,
      body: (message.text ?? '').slice(0, 180),
      url: '/mural',
      tag: `mural-${kind}-${message.id}`,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge.png',
    });
    await sendToAll(targets, payload);
  }
}

export async function notifyNewMessage(message: MessageDTO, skip: Set<string> = new Set()): Promise<void> {
  if (!pushEnabled) return;
  const now = Date.now();
  const online = new Set(onlineGuestIds());
  const targets = db
    .select()
    .from(pushSubscriptions)
    .all()
    .filter(
      (s) =>
        s.guestId !== message.guestId &&
        !skip.has(s.guestId) &&
        !online.has(s.guestId) &&
        (!s.lastNotifiedAt || now - s.lastNotifiedAt > THROTTLE_MS),
    );
  if (targets.length === 0) return;

  const author = firstName(message.guest.name);
  const body = message.photo
    ? `${author} postou uma foto${message.text ? `: ${message.text}` : ''} 📸`
    : `${author}: ${message.text ?? ''}`;
  const payload = JSON.stringify({
    title: 'Galera do casamento',
    body: body.slice(0, 180),
    url: '/mural',
    tag: 'mural',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge.png',
  });

  await Promise.allSettled(
    targets.map(async (s) => {
      try {
        await sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          { TTL: 60 * 60, urgency: 'normal' },
        );
        db.update(pushSubscriptions).set({ lastNotifiedAt: now }).where(eq(pushSubscriptions.id, s.id)).run();
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          // Assinatura expirada ou revogada: limpa
          db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id)).run();
        } else {
          warn({ err, endpoint: s.endpoint.slice(0, 60) }, 'Falha ao enviar push');
        }
      }
    }),
  );
}
