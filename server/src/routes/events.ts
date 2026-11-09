import crypto from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { isAdmin, requireGuest } from '../auth.js';
import { db } from '../db/index.js';
import { eventRsvps, events, guests, messages } from '../db/schema.js';
import type { EventDTO } from '../dto.js';
import { formatEventDate, notifyNewMessage, notifyOfficialEvent } from '../push.js';
import { loadEvent, loadEvents, loadMessage } from '../queries.js';
import { broadcast } from '../realtime.js';
import { dateStr, num, str, timeStr, validLatLng } from '../validate.js';

const STATUSES = new Set(['yes', 'maybe', 'no']);

interface EventFields {
  title: string;
  description: string | null;
  date: string;
  time: string | null;
  placeLabel: string | null;
  placeLat: number | null;
  placeLng: number | null;
}

function parseEvent(body: Record<string, unknown>): EventFields | { error: string; message: string } {
  const title = str(body.title, 80);
  if (!title || title.length < 3) return { error: 'title', message: 'Dê um nome ao combinado (pelo menos 3 letras).' };
  const date = dateStr(body.date);
  if (!date) return { error: 'date', message: 'Escolha a data do combinado.' };
  const timeRaw = body.time;
  const time = timeRaw ? timeStr(timeRaw) : null;
  if (timeRaw && !time) return { error: 'time', message: 'Horário inválido (use HH:MM).' };
  const description = str(body.description, 600);
  const placeLabel = str(body.placeLabel, 100);
  const lat = num(body.placeLat);
  const lng = num(body.placeLng);
  const hasPoint = validLatLng(lat, lng);
  return {
    title,
    description,
    date,
    time,
    placeLabel,
    placeLat: hasPoint ? lat : null,
    placeLng: hasPoint ? (lng as number) : null,
  };
}

function canManage(event: { createdBy: { id: string } }, request: { guest: { id: string } | null }): boolean {
  return !!request.guest && (event.createdBy.id === request.guest.id || isAdmin(request.guest as never));
}

export default async function eventRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/events', { preHandler: requireGuest }, async () => ({ events: loadEvents() }));

  app.post(
    '/api/events',
    { preHandler: requireGuest, config: { rateLimit: { max: 20, timeWindow: '10 minutes' } } },
    async (request, reply) => {
      const body = (request.body ?? {}) as Record<string, unknown>;
      const fields = parseEvent(body);
      if ('error' in fields) return reply.code(400).send(fields);
      const me = request.guest!;
      const admin = isAdmin(me);
      const isOfficial = admin && body.isOfficial !== false;
      const now = Date.now();
      const id = crypto.randomUUID();

      db.transaction((tx) => {
        tx.insert(events)
          .values({ id, ...fields, isOfficial, createdBy: me.id, createdAt: now, updatedAt: now })
          .run();
        // Quem cria já está confirmado
        tx.insert(eventRsvps)
          .values({ eventId: id, guestId: me.id, status: 'yes', peopleCount: 1 + (me.companions?.length ?? 0), updatedAt: now })
          .run();
      });

      const dto = loadEvent(id)!;
      broadcast('event:upsert', dto);

      // Entra no mural para todo mundo ver
      const when = `${formatEventDate(dto.date)}${dto.time ? ` às ${dto.time}` : ''}`;
      const text = `📅 ${isOfficial ? 'Combinado dos noivos' : 'Novo combinado'}: ${dto.title} · ${when}${dto.placeLabel ? ` · ${dto.placeLabel}` : ''}. Confirme sua presença na Agenda!`;
      const inserted = db.insert(messages).values({ guestId: me.id, text, createdAt: now }).run();
      const msg = loadMessage(Number(inserted.lastInsertRowid))!;
      broadcast('message:new', msg);

      if (isOfficial) void notifyOfficialEvent(dto, 'new');
      else void notifyNewMessage(msg);

      return { event: dto };
    },
  );

  app.patch('/api/events/:id', { preHandler: requireGuest }, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const current = loadEvent(id);
    if (!current || db.select().from(events).where(eq(events.id, id)).get()?.deletedAt) {
      return reply.code(404).send({ error: 'not_found', message: 'Combinado não encontrado.' });
    }
    if (!canManage(current, request)) {
      return reply.code(403).send({ error: 'forbidden', message: 'Só quem criou (ou um admin) pode editar.' });
    }
    const body = (request.body ?? {}) as Record<string, unknown>;
    const fields = parseEvent({
      title: body.title ?? current.title,
      date: body.date ?? current.date,
      time: body.time !== undefined ? body.time : current.time,
      description: body.description !== undefined ? body.description : current.description,
      placeLabel: body.placeLabel !== undefined ? body.placeLabel : current.placeLabel,
      placeLat: body.placeLat !== undefined ? body.placeLat : current.placeLat,
      placeLng: body.placeLng !== undefined ? body.placeLng : current.placeLng,
    });
    if ('error' in fields) return reply.code(400).send(fields);
    const admin = isAdmin(request.guest);
    const isOfficial = admin && body.isOfficial !== undefined ? body.isOfficial === true : current.isOfficial;

    db.update(events)
      .set({ ...fields, isOfficial, updatedAt: Date.now() })
      .where(eq(events.id, id))
      .run();
    const dto = loadEvent(id)!;
    broadcast('event:upsert', dto);
    const changedWhen = fields.date !== current.date || fields.time !== current.time;
    if (dto.isOfficial && changedWhen) void notifyOfficialEvent(dto, 'updated');
    return { event: dto };
  });

  app.delete('/api/events/:id', { preHandler: requireGuest }, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const current = loadEvent(id);
    if (!current) return reply.code(404).send({ error: 'not_found', message: 'Combinado não encontrado.' });
    if (!canManage(current, request)) {
      return reply.code(403).send({ error: 'forbidden', message: 'Só quem criou (ou um admin) pode apagar.' });
    }
    db.update(events).set({ deletedAt: Date.now() }).where(eq(events.id, id)).run();
    broadcast('event:deleted', { id });
    return { ok: true };
  });

  app.put(
    '/api/events/:id/rsvp',
    { preHandler: requireGuest, config: { rateLimit: { max: 60, timeWindow: '10 minutes' } } },
    async (request, reply) => {
      const id = (request.params as { id: string }).id;
      const event = db.select().from(events).where(eq(events.id, id)).get();
      if (!event || event.deletedAt) return reply.code(404).send({ error: 'not_found', message: 'Combinado não encontrado.' });
      const body = (request.body ?? {}) as Record<string, unknown>;
      const status = str(body.status, 10) ?? 'none';
      const me = request.guest!;
      const maxPeople = 1 + (me.companions?.length ?? 0);
      const requested = num(body.peopleCount);
      const peopleCount = Math.min(maxPeople, Math.max(1, Math.round(requested ?? maxPeople)));
      const note = str(body.note, 140);

      if (status === 'none') {
        db.delete(eventRsvps).where(and(eq(eventRsvps.eventId, id), eq(eventRsvps.guestId, me.id))).run();
      } else {
        if (!STATUSES.has(status)) return reply.code(400).send({ error: 'status', message: 'Resposta inválida.' });
        db.insert(eventRsvps)
          .values({ eventId: id, guestId: me.id, status, peopleCount, note, updatedAt: Date.now() })
          .onConflictDoUpdate({
            target: [eventRsvps.eventId, eventRsvps.guestId],
            set: { status, peopleCount, note, updatedAt: Date.now() },
          })
          .run();
      }
      const dto = loadEvent(id)!;
      broadcast('event:upsert', dto);
      return { event: dto };
    },
  );

  /** Lista de confirmados em CSV (quem criou ou admin). */
  app.get('/api/events/:id/rsvps.csv', { preHandler: requireGuest }, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const event = loadEvent(id);
    if (!event) return reply.code(404).send({ error: 'not_found', message: 'Combinado não encontrado.' });
    if (!canManage(event, request)) return reply.code(403).send({ error: 'forbidden', message: 'Sem acesso.' });

    const rows = db
      .select({ rsvp: eventRsvps, guest: guests })
      .from(eventRsvps)
      .innerJoin(guests, eq(guests.id, eventRsvps.guestId))
      .where(eq(eventRsvps.eventId, id))
      .all();
    const label: Record<string, string> = { yes: 'Vou', maybe: 'Talvez', no: 'Não vou' };
    const cell = (v: string | number | null | undefined) => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = ['Nome;Resposta;Pessoas;Acompanhantes;WhatsApp;Observação'];
    for (const { rsvp, guest } of rows.sort((a, b) => a.rsvp.status.localeCompare(b.rsvp.status) || a.guest.name.localeCompare(b.guest.name))) {
      lines.push(
        [guest.name, label[rsvp.status] ?? rsvp.status, rsvp.peopleCount, (guest.companions ?? []).join(', '), guest.phone, rsvp.note ?? '']
          .map(cell)
          .join(';'),
      );
    }
    const slug = event.title
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .toLowerCase()
      .slice(0, 30);
    return reply
      .type('text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="confirmados-${slug || 'combinado'}.csv"`)
      .send('﻿' + lines.join('\r\n'));
  });
}

export type { EventDTO };
