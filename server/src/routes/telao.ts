import { count, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { hasTelaoAccess, setTelaoCookie } from '../auth.js';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { guests, photos } from '../db/schema.js';
import { countPeople } from '../dto.js';
import { loadEvents, loadPhotos } from '../queries.js';
import { str } from '../validate.js';
import { WEDDING } from '../wedding.js';

export default async function telaoRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/api/telao/login',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const body = (request.body ?? {}) as Record<string, unknown>;
      const code = (str(body.code, 100) ?? '').toLowerCase();
      if (!config.telaoCode || code !== config.telaoCode.toLowerCase()) {
        return reply.code(403).send({ error: 'code', message: 'Código do telão incorreto.' });
      }
      setTelaoCookie(request, reply);
      return { ok: true };
    },
  );

  app.get('/api/telao/feed', async (request, reply) => {
    if (!hasTelaoAccess(request)) {
      return reply.code(401).send({ error: 'unauthorized', message: 'Informe o código do telão.' });
    }
    const guestRows = db.select({ companions: guests.companions }).from(guests).all();
    const photoCount = db.select({ n: count() }).from(photos).where(isNull(photos.deletedAt)).get()?.n ?? 0;
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: WEDDING.timeZone }).format(new Date());
    const nextEvents = loadEvents()
      .filter((e) => e.isOfficial && e.date >= today)
      .slice(0, 3);
    return {
      photos: loadPhotos(150),
      stats: { guests: guestRows.length, people: countPeople(guestRows), photos: photoCount },
      nextEvents,
      wedding: WEDDING,
      publicUrl: config.publicUrl,
      // Vai no QR code: quem escaneia entra sem digitar o código (o telão já é protegido)
      inviteCode: config.inviteCode || null,
    };
  });
}
