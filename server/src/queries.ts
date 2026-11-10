import { and, asc, desc, eq, inArray, isNull, lt } from 'drizzle-orm';
import { db } from './db/index.js';
import {
  eventRsvps,
  events,
  guests,
  messages,
  photos,
  reactions,
  type EventRow,
  type Guest,
  type Message,
  type Photo,
} from './db/schema.js';
import {
  guestLite,
  photoDTO,
  type EventDTO,
  type GuestLiteDTO,
  type MessageDTO,
  type PhotoDTO,
  type ReactionDTO,
  type ReplyPreviewDTO,
  type RsvpDTO,
} from './dto.js';

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

  // Mensagens respondidas (podem estar fora da página carregada, ou já apagadas)
  const replyIds = [...new Set(rows.map((r) => r.replyToId).filter((id): id is number => !!id))];
  const replyRows = replyIds.length ? db.select().from(messages).where(inArray(messages.id, replyIds)).all() : [];
  const replyMap = new Map<number, Message>(replyRows.map((m) => [m.id, m]));

  const guestIds = [...new Set([...rows, ...replyRows].map((r) => r.guestId))];
  const photoIds = [...rows, ...replyRows].map((r) => r.photoId).filter((id): id is string => !!id);
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

  const replyPreview = (id: number | null): ReplyPreviewDTO | null => {
    if (!id) return null;
    const m = replyMap.get(id);
    if (!m) return null;
    const author = guestMap.get(m.guestId);
    const photo = m.photoId ? photoMap.get(m.photoId) : undefined;
    const deleted = !!m.deletedAt;
    return {
      id: m.id,
      guestId: m.guestId,
      guestName: author?.name ?? 'Convidado',
      text: deleted ? null : (m.text?.slice(0, 140) ?? null),
      thumbUrl: !deleted && photo && !photo.deletedAt ? photoDTO(photo, m.id).thumbUrl : null,
      deleted,
    };
  };

  return rows.map((r) => {
    const g = guestMap.get(r.guestId);
    const p = r.photoId ? photoMap.get(r.photoId) : undefined;
    return {
      replyTo: replyPreview(r.replyToId),
      mentions: r.mentions ?? [],
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

/** Combinados ativos, do mais próximo ao mais distante, com todas as confirmações. */
export function loadEvents(): EventDTO[] {
  const rows = db.select().from(events).where(isNull(events.deletedAt)).orderBy(asc(events.date), asc(events.time)).all();
  return hydrateEvents(rows);
}

export function loadEvent(id: string): EventDTO | null {
  const row = db.select().from(events).where(eq(events.id, id)).get();
  if (!row) return null;
  return hydrateEvents([row])[0] ?? null;
}

function hydrateEvents(rows: EventRow[]): EventDTO[] {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const rsvpRows = db.select().from(eventRsvps).where(inArray(eventRsvps.eventId, ids)).all();
  const creatorIds = [...new Set(rows.map((r) => r.createdBy))];
  const creators = new Map(
    db
      .select()
      .from(guests)
      .where(inArray(guests.id, creatorIds))
      .all()
      .map((g) => [g.id, g]),
  );
  const byEvent = new Map<string, RsvpDTO[]>();
  for (const r of rsvpRows) {
    const list = byEvent.get(r.eventId) ?? [];
    list.push({ guestId: r.guestId, status: r.status, peopleCount: r.peopleCount, note: r.note, updatedAt: r.updatedAt });
    byEvent.set(r.eventId, list);
  }
  return rows.map((r) => {
    const rsvps = byEvent.get(r.id) ?? [];
    const yes = rsvps.filter((x) => x.status === 'yes');
    const creator = creators.get(r.createdBy);
    return {
      id: r.id,
      title: r.title,
      description: r.description,
      date: r.date,
      time: r.time,
      placeLabel: r.placeLabel,
      placeLat: r.placeLat,
      placeLng: r.placeLng,
      isOfficial: r.isOfficial,
      createdBy: creator ? guestLite(creator) : { id: r.createdBy, name: 'Convidado', avatarUrl: null },
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      rsvps,
      counts: {
        yes: yes.length,
        maybe: rsvps.filter((x) => x.status === 'maybe').length,
        no: rsvps.filter((x) => x.status === 'no').length,
        people: yes.reduce((sum, x) => sum + x.peopleCount, 0),
      },
    };
  });
}
