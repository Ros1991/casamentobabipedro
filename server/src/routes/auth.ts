import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import {
  clearSessionCookie,
  createSession,
  deleteSession,
  isAdmin,
  sessionTokenFromRequest,
  setSessionCookie,
} from '../auth.js';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { accommodations, guests } from '../db/schema.js';
import { accommodationDTO, guestMe, guestPublic } from '../dto.js';
import { normalizePhone } from '../phone.js';
import { broadcast } from '../realtime.js';
import { bool, str } from '../validate.js';
import { WEDDING } from '../wedding.js';
import { isInputError, parseCompanions, parseDates, parseStay } from './guestInput.js';

export default async function authRoutes(app: FastifyInstance): Promise<void> {
  /** Dados públicos: se exige código, infos do casamento e hospedagens (para a tela de entrada). */
  app.get('/api/config', async () => ({
    inviteRequired: !!config.inviteCode,
    telaoEnabled: !!config.telaoCode,
    wedding: WEDDING,
    map: { tileUrl: config.mapTileUrl, attribution: config.mapTileAttribution },
    accommodations: db.select().from(accommodations).orderBy(accommodations.sortOrder).all().map(accommodationDTO),
  }));

  app.post(
    '/api/auth/enter',
    { config: { rateLimit: { max: 15, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const body = (request.body ?? {}) as Record<string, unknown>;

      if (config.inviteCode) {
        const code = (str(body.inviteCode, 100) ?? '').toLowerCase();
        if (code !== config.inviteCode.toLowerCase()) {
          return reply.code(403).send({ error: 'inviteCode', message: 'Código do convite incorreto.' });
        }
      }

      const name = str(body.name, 60);
      if (!name || name.length < 2) {
        return reply.code(400).send({ error: 'name', message: 'Digite seu nome.' });
      }

      const phone = normalizePhone(str(body.phone, 30));
      if (!phone) {
        return reply.code(400).send({ error: 'phone', message: 'Telefone inválido. Use DDD + número.' });
      }

      const stay = parseStay(body);
      if (isInputError(stay)) return reply.code(400).send(stay);
      const dates = parseDates(body);
      if (isInputError(dates)) return reply.code(400).send(dates);
      const companions = parseCompanions(body.companions);
      if (isInputError(companions)) return reply.code(400).send(companions);
      const showPhone = bool(body.showPhone) ?? false;

      const now = Date.now();
      const existing = db.select().from(guests).where(eq(guests.phone, phone)).get();
      let guestId: string;
      if (existing) {
        guestId = existing.id;
        db.update(guests)
          .set({ name, ...stay, ...dates, companions, showPhone, lastSeenAt: now })
          .where(eq(guests.id, guestId))
          .run();
      } else {
        guestId = crypto.randomUUID();
        db.insert(guests)
          .values({ id: guestId, name, phone, ...stay, ...dates, companions, showPhone, createdAt: now, lastSeenAt: now })
          .run();
      }

      const guest = db.select().from(guests).where(eq(guests.id, guestId)).get()!;
      const token = createSession(guest.id);
      setSessionCookie(request, reply, token);
      broadcast('guest:upsert', guestPublic(guest));

      return { guest: guestMe(guest), isAdmin: isAdmin(guest), returning: !!existing };
    },
  );

  app.get('/api/auth/me', async (request, reply) => {
    if (!request.guest) return reply.code(401).send({ error: 'unauthorized' });
    return { guest: guestMe(request.guest), isAdmin: isAdmin(request.guest) };
  });

  app.post('/api/auth/logout', async (request, reply) => {
    const token = sessionTokenFromRequest(request);
    if (token) deleteSession(token);
    clearSessionCookie(reply);
    return { ok: true };
  });
}
