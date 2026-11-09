import path from 'node:path';
import archiver from 'archiver';
import { count, desc, eq, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { requireAdmin } from '../auth.js';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { accommodations, guests, messages, photos } from '../db/schema.js';
import { accommodationDTO, countPeople, guestPublic } from '../dto.js';
import { formatPhone } from '../phone.js';
import { onlineGuestIds } from '../realtime.js';
import { WEDDING } from '../wedding.js';

const fmtDateTime = new Intl.DateTimeFormat('pt-BR', {
  timeZone: WEDDING.timeZone,
  dateStyle: 'short',
  timeStyle: 'short',
});

function fileStamp(ms: number): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: WEDDING.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}_${get('hour')}-${get('minute')}-${get('second')}`;
}

function slug(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
    .slice(0, 30);
}

function csvCell(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default async function adminRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAdmin);

  app.get('/api/admin/stats', async () => {
    const guestRows = db.select({ companions: guests.companions }).from(guests).all();
    const photoCount = db.select({ n: count() }).from(photos).where(isNull(photos.deletedAt)).get()?.n ?? 0;
    const messageCount = db.select({ n: count() }).from(messages).where(isNull(messages.deletedAt)).get()?.n ?? 0;
    const withDates = db.select({ n: count() }).from(guests).where(isNull(guests.arrivalDate)).get()?.n ?? 0;
    return {
      guests: guestRows.length,
      people: countPeople(guestRows),
      photos: photoCount,
      messages: messageCount,
      online: onlineGuestIds().length,
      guestsWithoutArrival: withDates,
    };
  });

  app.get('/api/admin/guests', async () => {
    const rows = db
      .select({ guest: guests, accommodation: accommodations })
      .from(guests)
      .leftJoin(accommodations, eq(accommodations.id, guests.accommodationId))
      .orderBy(desc(guests.createdAt))
      .all();
    return {
      guests: rows.map((r) => ({
        ...guestPublic(r.guest),
        phone: r.guest.phone,
        phoneFormatted: formatPhone(r.guest.phone),
        showPhone: r.guest.showPhone,
        accommodation: r.accommodation ? accommodationDTO(r.accommodation) : null,
      })),
    };
  });

  app.get('/api/admin/guests.csv', async (_request, reply) => {
    const rows = db
      .select({ guest: guests, accommodation: accommodations })
      .from(guests)
      .leftJoin(accommodations, eq(accommodations.id, guests.accommodationId))
      .orderBy(guests.name)
      .all();

    const header = [
      'Nome',
      'WhatsApp',
      'Acompanhantes',
      'Pessoas',
      'Hospedagem',
      'Cidade',
      'Chegada',
      'Saída',
      'Mostra WhatsApp',
      'Cadastro',
      'Último acesso',
    ];
    const lines = [header.join(';')];
    for (const { guest: g, accommodation: a } of rows) {
      const place = a ? a.name : g.customPlaceLabel ?? 'Ainda não sabe';
      const city = a ? a.city : g.customCity ?? '';
      const companions = g.companions ?? [];
      lines.push(
        [
          g.name,
          formatPhone(g.phone),
          companions.join(', '),
          1 + companions.length,
          place,
          city,
          g.arrivalDate ?? '',
          g.departureDate ?? '',
          g.showPhone ? 'sim' : 'não',
          fmtDateTime.format(new Date(g.createdAt)),
          fmtDateTime.format(new Date(g.lastSeenAt)),
        ]
          .map(csvCell)
          .join(';'),
      );
    }
    const csv = '﻿' + lines.join('\r\n');
    return reply
      .type('text/csv; charset=utf-8')
      .header('Content-Disposition', 'attachment; filename="convidados.csv"')
      .send(csv);
  });

  app.get('/api/admin/photos.zip', async (_request, reply) => {
    const rows = db
      .select({ photo: photos, guest: guests })
      .from(photos)
      .innerJoin(guests, eq(guests.id, photos.guestId))
      .where(isNull(photos.deletedAt))
      .orderBy(photos.createdAt)
      .all();

    const archive = archiver('zip', { zlib: { level: 0 } });
    archive.on('warning', (err) => app.log.warn(err));
    archive.on('error', (err) => app.log.error(err));

    for (const { photo, guest } of rows) {
      const name = `${fileStamp(photo.takenAt ?? photo.createdAt)}_${slug(guest.name) || 'convidado'}_${photo.id.slice(0, 8)}.jpg`;
      archive.file(path.join(config.uploadDir, photo.fileKey), { name });
    }
    void archive.finalize();

    return reply
      .type('application/zip')
      .header('Content-Disposition', `attachment; filename="fotos-casamento-${new Date().toISOString().slice(0, 10)}.zip"`)
      .send(archive);
  });
}
