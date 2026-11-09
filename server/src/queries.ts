import { and, desc, eq, inArray, isNull, lt } from 'drizzle-orm';
import { db } from './db/index.js';
import { guests, messages, photos, reactions, type Guest, type Message, type Photo } from './db/schema.js';
import { guestLite, photoDTO, type GuestLiteDTO, type MessageDTO, type PhotoDTO, type ReactionDTO } from './dto.js';

export interface PhotoWithGuestDTO extends PhotoDTO {
  guest: GuestLiteDTO;
}

const UNKNOWN_GUEST: GuestLiteDTO = { id: '', name: 'Convidado', avatarUrl: null };

export function loadMessages(opts: { beforeId?: number; limit: number }): MessageDTO[] {
  const conds = [isNull(messages.deletedAt)];
  if (opts.beforeId) conds.push(lt(messages.id, opts.beforeId));
  const rows = db
    .select()
    .from(messages)
    .where(and(...conds))
    .orderBy(desc(messages.id))
    .limit(opts.limit)
    .all();
  return hydrateMessages(rows);
}

export function loadMessage(id: number): MessageDTO | null {
  const row = db.select().from(messages).where(eq(messages.id, id)).get();
  if (!row) return null;
  return hydrateMessages([row])[0] ?? null;
}

export function loadReactions(messageId: number): ReactionDTO[] {
  return db
    .select({ emoji: reactions.emoji, guestId: reactions.guestId })
    .from(reactions)
    .where(eq(reactions.messageId, messageId))
    .all();
}

function hydrateMessages(rows: Message[]): MessageDTO[] {
  if (rows.length === 0) return [];

  const guestIds = [...new Set(rows.map((r) => r.guestId))];
  const photoIds = rows.map((r) => r.photoId).filter((id): id is string => !!id);
  const messageIds = rows.map((r) => r.id);

  const guestRows = db.select().from(guests).where(inArray(guests.id, guestIds)).all();
  const photoRows = photoIds.length ? db.select().from(photos).where(inArray(photos.id, photoIds)).all() : [];
  const reactionRows = db
    .select({ messageId: reactions.messageId, emoji: reactions.emoji, guestId: reactions.guestId })
    .from(reactions)
    .where(inArray(reactions.messageId, messageIds))
    .all();

  const guestMap = new Map<string, Guest>(guestRows.map((g) => [g.id, g]));
  const photoMap = new Map<string, Photo>(photoRows.map((p) => [p.id, p]));
  const reactionMap = new Map<number, ReactionDTO[]>();
  for (const r of reactionRows) {
    const list = reactionMap.get(r.messageId) ?? [];
    list.push({ emoji: r.emoji, guestId: r.guestId });
    reactionMap.set(r.messageId, list);
  }

  return rows.map((r) => {
    const g = guestMap.get(r.guestId);
    const p = r.photoId ? photoMap.get(r.photoId) : undefined;
    return {
      id: r.id,
      guestId: r.guestId,
      guest: g ? guestLite(g) : { ...UNKNOWN_GUEST, id: r.guestId },
      text: r.text,
      photo: p && !p.deletedAt ? photoDTO(p, r.id) : null,
      createdAt: r.createdAt,
      reactions: reactionMap.get(r.id) ?? [],
    };
  });
}

export function loadPhotos(limit?: number): PhotoWithGuestDTO[] {
  let q = db
    .select({ photo: photos, messageId: messages.id, guest: guests })
    .from(photos)
    .leftJoin(messages, eq(messages.photoId, photos.id))
    .innerJoin(guests, eq(guests.id, photos.guestId))
    .where(isNull(photos.deletedAt))
    .orderBy(desc(photos.createdAt))
    .$dynamic();
  if (limit) q = q.limit(limit);
  return q.all().map((r) => ({ ...photoDTO(r.photo, r.messageId), guest: guestLite(r.guest) }));
}

export function findGuestById(id: string): Guest | undefined {
  return db.select().from(guests).where(eq(guests.id, id)).get();
}
