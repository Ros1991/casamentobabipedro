import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { isAdmin, requireGuest } from '../auth.js';
import { db } from '../db/index.js';
import { messages, photos, reactions } from '../db/schema.js';
import { loadMessage, loadMessages, loadReactions } from '../queries.js';
import { broadcast } from '../realtime.js';
import { str } from '../validate.js';

export const ALLOWED_EMOJI = ['❤️', '😂', '🥹', '🔥', '👏', '🙌'];

export default async function messageRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/messages', { preHandler: requireGuest }, async (request) => {
    const q = request.query as { before?: string; limit?: string };
    const beforeId = Number(q.before) || undefined;
    const limit = Math.min(100, Math.max(1, Number(q.limit) || 50));
    const items = loadMessages({ beforeId, limit });
    const hasMore = items.length === limit;
    return { messages: items.reverse(), hasMore };
  });

  app.post(
    '/api/messages',
    { preHandler: requireGuest, config: { rateLimit: { max: 40, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const body = (request.body ?? {}) as Record<string, unknown>;
      const text = str(body.text, 2000);
      if (!text) return reply.code(400).send({ error: 'text', message: 'Escreva alguma coisa.' });

      const result = db
        .insert(messages)
        .values({ guestId: request.guest!.id, text, createdAt: Date.now() })
        .run();
      const dto = loadMessage(Number(result.lastInsertRowid))!;
      broadcast('message:new', dto);
      return { message: dto };
    },
  );

  app.delete('/api/messages/:id', { preHandler: requireGuest }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const msg = db.select().from(messages).where(eq(messages.id, id)).get();
    if (!msg || msg.deletedAt) return reply.code(404).send({ error: 'not_found', message: 'Mensagem não encontrada.' });
    if (msg.guestId !== request.guest!.id && !isAdmin(request.guest)) {
      return reply.code(403).send({ error: 'forbidden', message: 'Você só pode apagar o que você postou.' });
    }
    const now = Date.now();
    db.update(messages).set({ deletedAt: now }).where(eq(messages.id, id)).run();
    if (msg.photoId) db.update(photos).set({ deletedAt: now }).where(eq(photos.id, msg.photoId)).run();
    broadcast('message:deleted', { id, photoId: msg.photoId });
    return { ok: true };
  });

  app.post(
    '/api/messages/:id/reactions',
    { preHandler: requireGuest, config: { rateLimit: { max: 120, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const id = Number((request.params as { id: string }).id);
      const body = (request.body ?? {}) as Record<string, unknown>;
      const emoji = str(body.emoji, 8);
      if (!emoji || !ALLOWED_EMOJI.includes(emoji)) {
        return reply.code(400).send({ error: 'emoji', message: 'Reação inválida.' });
      }
      const msg = db.select().from(messages).where(eq(messages.id, id)).get();
      if (!msg || msg.deletedAt) return reply.code(404).send({ error: 'not_found', message: 'Mensagem não encontrada.' });

      const guestId = request.guest!.id;
      const existing = db
        .select()
        .from(reactions)
        .where(and(eq(reactions.messageId, id), eq(reactions.guestId, guestId), eq(reactions.emoji, emoji)))
        .get();
      if (existing) {
        db.delete(reactions)
          .where(and(eq(reactions.messageId, id), eq(reactions.guestId, guestId), eq(reactions.emoji, emoji)))
          .run();
      } else {
        db.insert(reactions).values({ messageId: id, guestId, emoji, createdAt: Date.now() }).run();
      }
      const list = loadReactions(id);
      broadcast('reaction:update', { messageId: id, reactions: list });
      return { reactions: list, active: !existing };
    },
  );
}
