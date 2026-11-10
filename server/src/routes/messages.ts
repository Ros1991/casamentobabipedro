import { and, eq, inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { isAdmin, requireGuest } from '../auth.js';
import { db } from '../db/index.js';
import { guests, messages, photos, reactions } from '../db/schema.js';
import { notifyDirect, notifyNewMessage } from '../push.js';
import { loadMessage, loadMessages, loadReactions } from '../queries.js';
import { broadcast } from '../realtime.js';
import { num, str } from '../validate.js';

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

      // Resposta a outra mensagem (opcional)
      const replyId = num(body.replyToId);
      const replied = replyId ? db.select().from(messages).where(eq(messages.id, replyId)).get() : undefined;
      if (replyId && (!replied || replied.deletedAt)) {
        return reply.code(400).send({ error: 'replyToId', message: 'A mensagem que você está respondendo foi apagada.' });
      }

      // Pessoas marcadas com @: só ids de convidados que existem, sem repetir, no máximo 20
      const asked = Array.isArray(body.mentions) ? [...new Set(body.mentions.filter((v): v is string => typeof v === 'string'))].slice(0, 20) : [];
      const mentions = asked.length
        ? db
            .select({ id: guests.id })
            .from(guests)
            .where(inArray(guests.id, asked))
            .all()
            .map((g) => g.id)
        : [];

      const me = request.guest!;
      const result = db
        .insert(messages)
        .values({ guestId: me.id, text, replyToId: replied?.id ?? null, mentions, createdAt: Date.now() })
        .run();
      const dto = loadMessage(Number(result.lastInsertRowid))!;
      broadcast('message:new', dto);

      // Quem foi marcado ou respondido recebe um aviso próprio; o resto, o aviso geral do mural
      const direct = new Map<string, 'mention' | 'reply'>();
      if (replied && replied.guestId !== me.id) direct.set(replied.guestId, 'reply');
      for (const id of mentions) if (id !== me.id) direct.set(id, 'mention');
      void notifyDirect(dto, direct).then(() => notifyNewMessage(dto, new Set(direct.keys())));
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
