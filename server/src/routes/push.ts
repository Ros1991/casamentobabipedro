import crypto from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { requireGuest } from '../auth.js';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { pushSubscriptions } from '../db/schema.js';
import { pushEnabled } from '../push.js';
import { str } from '../validate.js';

interface SubscriptionBody {
  subscription?: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
}

export default async function pushRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/push/key', async () => ({ enabled: pushEnabled, publicKey: pushEnabled ? config.vapidPublicKey : null }));

  app.post(
    '/api/push/subscribe',
    { preHandler: requireGuest, config: { rateLimit: { max: 20, timeWindow: '10 minutes' } } },
    async (request, reply) => {
      if (!pushEnabled) return reply.code(503).send({ error: 'push_disabled', message: 'Avisos desligados neste servidor.' });
      const body = (request.body ?? {}) as SubscriptionBody;
      const endpoint = str(body.subscription?.endpoint, 2000);
      const p256dh = str(body.subscription?.keys?.p256dh, 500);
      const auth = str(body.subscription?.keys?.auth, 200);
      if (!endpoint || !p256dh || !auth || !/^https:\/\//.test(endpoint)) {
        return reply.code(400).send({ error: 'subscription', message: 'Assinatura de notificação inválida.' });
      }
      const me = request.guest!;
      const existing = db.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint)).get();
      if (existing) {
        db.update(pushSubscriptions)
          .set({ guestId: me.id, p256dh, auth, userAgent: request.headers['user-agent']?.slice(0, 200) ?? null })
          .where(eq(pushSubscriptions.id, existing.id))
          .run();
      } else {
        db.insert(pushSubscriptions)
          .values({
            id: crypto.randomUUID(),
            guestId: me.id,
            endpoint,
            p256dh,
            auth,
            userAgent: request.headers['user-agent']?.slice(0, 200) ?? null,
            createdAt: Date.now(),
          })
          .run();
      }
      return { ok: true };
    },
  );

  app.delete('/api/push/subscribe', { preHandler: requireGuest }, async (request) => {
    const body = (request.body ?? {}) as { endpoint?: unknown };
    const endpoint = str(body.endpoint, 2000);
    if (endpoint) {
      db.delete(pushSubscriptions)
        .where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.guestId, request.guest!.id)))
        .run();
    }
    return { ok: true };
  });
}
