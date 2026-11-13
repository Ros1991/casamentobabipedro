import path from 'node:path';
import archiver from 'archiver';
import { count, desc, eq, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { requireAdmin } from '../auth.js';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { accommodations, eventRsvps, events, guests, messages, photos } from '../db/schema.js';
import { accommodationDTO, countPeople, guestPublic } from '../dto.js';
import { formatCpf } from '../cpf.js';
import { formatPhone, isPlaceholderPhone } from '../phone.js';
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
        phone: isPlaceholderPhone(r.guest.phone) ? '' : r.guest.phone,
        phoneFormatted: isPlaceholderPhone(r.guest.phone) ? '' : formatPhone(r.guest.phone),
        cpf: r.guest.cpf,
        /** Quais acompanhantes já têm CPF (mesma ordem dos nomes) */
        companionHasCpf: (r.guest.companions ?? []).map((_, i) => !!r.guest.companionCpfs?.[i]),
        inviteLabel: r.guest.inviteLabel,
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
      'CPF',
      'Acompanhantes',
      'CPF dos acompanhantes',
      'Pessoas',
      'Convite',
      'Entrou no app',
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
          isPlaceholderPhone(g.phone) ? '' : formatPhone(g.phone),
          g.cpf ? formatCpf(g.cpf) : '',
          companions.join(', '),
          companions
            .map((n, i) => (g.companionCpfs?.[i] ? `${n}: ${formatCpf(g.companionCpfs[i])}` : ''))
            .filter(Boolean)
            .join(', '),
          1 + companions.length,
          g.inviteLabel ?? '',
          g.claimedAt ? 'sim' : 'não',
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

  /**
   * Planilha de pessoas para o check-in: uma linha por pessoa (titular e cada acompanhante), com o CPF de cada um.
   * Titulares primeiro, seguidos dos seus acompanhantes; ordenado pelo nome do convite.
   */
  app.get('/api/admin/pessoas.csv', async (_request, reply) => {
    const rows = db
      .select({ guest: guests, accommodation: accommodations })
      .from(guests)
      .leftJoin(accommodations, eq(accommodations.id, guests.accommodationId))
      .all()
      // a conta "dos noivos", dona dos combinados importados, não é uma pessoa da lista
      .filter((r) => r.guest.importKey !== 'noivos')
      .sort((a, b) => (a.guest.inviteLabel ?? a.guest.name).localeCompare(b.guest.inviteLabel ?? b.guest.name) || a.guest.name.localeCompare(b.guest.name));

    // Presenças por combinado (dos noivos), para a Babi ver tudo num arquivo só
    const official = db.select().from(events).where(isNull(events.deletedAt)).orderBy(events.date, events.time).all().filter((e) => e.isOfficial);
    const rsvpRows = db.select().from(eventRsvps).all();
    const label: Record<string, string> = { yes: 'Vai', maybe: 'Talvez', no: 'Não vai' };
    const answer = (guestId: string, eventId: string) => {
      const r = rsvpRows.find((x) => x.guestId === guestId && x.eventId === eventId);
      return r ? (r.status === 'yes' && r.peopleCount > 1 ? `Vai (${r.peopleCount})` : (label[r.status] ?? r.status)) : '';
    };

    const header = ['Nome', 'CPF', 'Tipo', 'Conta de', 'Convite', 'WhatsApp', 'Hospedagem', 'Cidade', 'Chegada', 'Saída', 'Entrou no app', ...official.map((e) => e.title)];
    const lines = [header.join(';')];
    let total = 0;
    let withCpf = 0;
    for (const { guest: g, accommodation: a } of rows) {
      const place = a ? a.name : (g.customPlaceLabel ?? '');
      const city = a ? a.city : (g.customCity ?? '');
      const phone = isPlaceholderPhone(g.phone) ? '' : formatPhone(g.phone);
      // datas em dd/mm/aaaa, como o Excel e o Google Planilhas em português esperam
      const br = (d: string | null) => (d ? d.split('-').reverse().join('/') : '');
      const common = [g.inviteLabel ?? '', phone, place, city, br(g.arrivalDate), br(g.departureDate), g.claimedAt ? 'sim' : 'não'];
      const people = [
        { name: g.name, cpf: g.cpf, type: 'Titular', answers: official.map((e) => answer(g.id, e.id)) },
        // as presenças são respondidas pela conta: nos acompanhantes a coluna fica vazia
        ...(g.companions ?? []).map((name, i) => ({ name, cpf: g.companionCpfs?.[i] || null, type: 'Acompanhante', answers: official.map(() => '') })),
      ];
      for (const p of people) {
        total++;
        if (p.cpf) withCpf++;
        lines.push([p.name, p.cpf ? formatCpf(p.cpf) : '', p.type, g.name, ...common, ...p.answers].map(csvCell).join(';'));
      }
    }
    lines.push('', csvCell(`Total: ${total} pessoas, ${withCpf} com CPF, ${total - withCpf} sem CPF`));
    const csv = '\uFEFF' + lines.join('\r\n');
    return reply
      .type('text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="pessoas-e-cpf-${new Date().toISOString().slice(0, 10)}.csv"`)
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
