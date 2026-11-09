import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { isAdmin, requireGuest } from '../auth.js';
import { db } from '../db/index.js';
import { messages, photos } from '../db/schema.js';
import { ImageError, processPhoto } from '../images.js';
import { loadMessage, loadPhotos } from '../queries.js';
import { broadcast } from '../realtime.js';
import { num, str, validLatLng } from '../validate.js';

const LOCATION_SOURCES = new Set(['gps', 'exif', 'manual']);

export default async function photoRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/photos', { preHandler: requireGuest }, async () => ({ photos: loadPhotos() }));

  app.post(
    '/api/photos',
    { preHandler: requireGuest, config: { rateLimit: { max: 40, timeWindow: '10 minutes' } } },
    async (request, reply) => {
      const body = (request.body ?? {}) as Record<string, unknown>;
      const file = body.file;
      if (!Buffer.isBuffer(file) || file.length === 0) {
        return reply.code(400).send({ error: 'file', message: 'Envie uma foto.' });
      }

      const caption = str(body.caption, 500);
      const lat = num(body.lat);
      const lng = num(body.lng);
      const hasPoint = validLatLng(lat, lng);
      const sourceRaw = str(body.locationSource, 10) ?? 'none';
      const locationSource = hasPoint && LOCATION_SOURCES.has(sourceRaw) ? sourceRaw : hasPoint ? 'gps' : 'none';
      const takenAtRaw = num(body.takenAt);
      const takenAt = takenAtRaw && takenAtRaw > 0 ? Math.round(takenAtRaw) : null;

      const id = crypto.randomUUID();
      let processed;
      try {
        processed = await processPhoto(file, id);
      } catch (err) {
        if (err instanceof ImageError) return reply.code(400).send({ error: 'image', message: err.message });
        throw err;
      }

      const now = Date.now();
      const guestId = request.guest!.id;
      const messageId = db.transaction((tx) => {
        tx.insert(photos)
          .values({
            id,
            guestId,
            fileKey: processed.fileKey,
            thumbKey: processed.thumbKey,
            width: processed.width,
            height: processed.height,
            lat: hasPoint ? lat : null,
            lng: hasPoint ? (lng as number) : null,
            locationSource,
            caption,
            takenAt,
            createdAt: now,
          })
          .run();
        const res = tx.insert(messages).values({ guestId, text: caption, photoId: id, createdAt: now }).run();
        return Number(res.lastInsertRowid);
      });

      const dto = loadMessage(messageId)!;
      broadcast('message:new', dto);
      return { message: dto, photo: dto.photo };
    },
  );

  app.delete('/api/photos/:id', { preHandler: requireGuest }, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const photo = db.select().from(photos).where(eq(photos.id, id)).get();
    if (!photo || photo.deletedAt) return reply.code(404).send({ error: 'not_found', message: 'Foto não encontrada.' });
    if (photo.guestId !== request.guest!.id && !isAdmin(request.guest)) {
      return reply.code(403).send({ error: 'forbidden', message: 'Você só pode apagar as suas fotos.' });
    }
    const now = Date.now();
    const msg = db.select().from(messages).where(eq(messages.photoId, id)).get();
    db.update(photos).set({ deletedAt: now }).where(eq(photos.id, id)).run();
    if (msg) db.update(messages).set({ deletedAt: now }).where(eq(messages.id, msg.id)).run();
    broadcast('message:deleted', { id: msg?.id ?? null, photoId: id });
    return { ok: true };
  });
}
