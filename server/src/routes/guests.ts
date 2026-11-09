import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { isAdmin, requireGuest } from '../auth.js';
import { db } from '../db/index.js';
import { guests } from '../db/schema.js';
import { guestMe, guestPublic } from '../dto.js';
import { ImageError, processAvatar, removeUpload } from '../images.js';
import { broadcast, onlineGuestIds } from '../realtime.js';
import { bool, str } from '../validate.js';
import { isInputError, parseCompanions, parseDates, parseStay } from './guestInput.js';

export default async function guestRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/guests', { preHandler: requireGuest }, async () => ({
    guests: db.select().from(guests).orderBy(guests.name).all().map(guestPublic),
    online: onlineGuestIds(),
  }));

  app.patch('/api/guests/me', { preHandler: requireGuest }, async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const me = request.guest!;
    const patch: Partial<typeof guests.$inferInsert> = {};

    if (body.name !== undefined) {
      const name = str(body.name, 60);
      if (!name || name.length < 2) return reply.code(400).send({ error: 'name', message: 'Digite seu nome.' });
      patch.name = name;
    }
    if (body.stayMode !== undefined) {
      const stay = parseStay(body);
      if (isInputError(stay)) return reply.code(400).send(stay);
      Object.assign(patch, stay);
    }
    if (body.arrivalDate !== undefined || body.departureDate !== undefined) {
      const dates = parseDates({
        arrivalDate: body.arrivalDate !== undefined ? body.arrivalDate : me.arrivalDate,
        departureDate: body.departureDate !== undefined ? body.departureDate : me.departureDate,
      });
      if (isInputError(dates)) return reply.code(400).send(dates);
      Object.assign(patch, dates);
    }
    if (body.showPhone !== undefined) {
      const v = bool(body.showPhone);
      if (v === null) return reply.code(400).send({ error: 'showPhone', message: 'Valor inválido.' });
      patch.showPhone = v;
    }
    if (body.companions !== undefined) {
      const companions = parseCompanions(body.companions);
      if (isInputError(companions)) return reply.code(400).send(companions);
      patch.companions = companions;
    }

    if (Object.keys(patch).length > 0) {
      db.update(guests).set(patch).where(eq(guests.id, me.id)).run();
    }
    const updated = db.select().from(guests).where(eq(guests.id, me.id)).get()!;
    broadcast('guest:upsert', guestPublic(updated));
    return { guest: guestMe(updated), isAdmin: isAdmin(updated) };
  });

  app.post(
    '/api/guests/me/avatar',
    { preHandler: requireGuest, config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } },
    async (request, reply) => {
      const body = (request.body ?? {}) as Record<string, unknown>;
      const file = body.file;
      if (!Buffer.isBuffer(file) || file.length === 0) {
        return reply.code(400).send({ error: 'file', message: 'Envie uma imagem.' });
      }
      const me = request.guest!;
      let key: string;
      try {
        key = await processAvatar(file, me.id);
      } catch (err) {
        if (err instanceof ImageError) return reply.code(400).send({ error: 'image', message: err.message });
        throw err;
      }
      await removeUpload(me.avatarKey);
      db.update(guests).set({ avatarKey: key }).where(eq(guests.id, me.id)).run();
      const updated = db.select().from(guests).where(eq(guests.id, me.id)).get()!;
      broadcast('guest:upsert', guestPublic(updated));
      return { guest: guestMe(updated), isAdmin: isAdmin(updated) };
    },
  );

  app.delete('/api/guests/me/avatar', { preHandler: requireGuest }, async (request) => {
    const me = request.guest!;
    await removeUpload(me.avatarKey);
    db.update(guests).set({ avatarKey: null }).where(eq(guests.id, me.id)).run();
    const updated = db.select().from(guests).where(eq(guests.id, me.id)).get()!;
    broadcast('guest:upsert', guestPublic(updated));
    return { guest: guestMe(updated), isAdmin: isAdmin(updated) };
  });
}
