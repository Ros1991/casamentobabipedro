import crypto from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  clearSessionCookie,
  createSession,
  deleteSession,
  isAdmin,
  sessionTokenFromRequest,
  setSessionCookie,
} from '../auth.js';
import { config } from '../config.js';
import { normalizeCpf, parseCompanionCpfs } from '../cpf.js';
import { db } from '../db/index.js';
import { accommodations, eventRsvps, guests, type Guest } from '../db/schema.js';
import { accommodationDTO, guestMe, guestPublic } from '../dto.js';
import { normalizePhone, phoneVariants } from '../phone.js';
import { pushEnabled } from '../push.js';
import { broadcast } from '../realtime.js';
import { bool, num, str } from '../validate.js';
import { WEDDING } from '../wedding.js';
import { isInputError, parseCompanions, parseDates, parseStay } from './guestInput.js';

/** Minúsculas e sem acentos, para comparar nomes. */
function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/** Cada palavra digitada precisa ser o começo de alguma palavra do nome. */
function nameMatches(name: string, tokens: string[]): boolean {
  const words = fold(name).split(/\s+/);
  return tokens.every((t) => words.some((w) => w.startsWith(t)));
}

/** Falta responder onde fica e quando chega? (quem respondeu o formulário já vem com isso) */
function needsDetails(g: Guest): boolean {
  return !g.accommodationId && !g.customPlaceLabel && !g.arrivalDate && !g.departureDate;
}

function findByPhone(phone: string): Guest | undefined {
  return db.select().from(guests).where(inArray(guests.phone, phoneVariants(phone))).get();
}

function inviteCodeError(body: Record<string, unknown>): { error: string; message: string } | null {
  if (!config.inviteCode) return null;
  const code = (str(body.inviteCode, 100) ?? '').toLowerCase();
  return code === config.inviteCode.toLowerCase() ? null : { error: 'inviteCode', message: 'Código do convite incorreto.' };
}

export default async function authRoutes(app: FastifyInstance): Promise<void> {
  function login(request: FastifyRequest, reply: FastifyReply, guestId: string, extra: Record<string, unknown> = {}) {
    const now = Date.now();
    const before = db.select().from(guests).where(eq(guests.id, guestId)).get()!;
    const firstTime = before.claimedAt === null;
    db.update(guests)
      .set({ lastSeenAt: now, ...(firstTime ? { claimedAt: now } : {}) })
      .where(eq(guests.id, guestId))
      .run();
    const guest = db.select().from(guests).where(eq(guests.id, guestId)).get()!;
    setSessionCookie(request, reply, createSession(guest.id));
    broadcast('guest:upsert', guestPublic(guest));
    return { found: true, guest: guestMe(guest), isAdmin: isAdmin(guest), firstTime, needsDetails: needsDetails(guest), ...extra };
  }

  /** Dados públicos: se exige código, infos do casamento e hospedagens (para a tela de entrada). */
  app.get('/api/config', async () => ({
    inviteRequired: !!config.inviteCode,
    telaoEnabled: !!config.telaoCode,
    wedding: WEDDING,
    map: { tileUrl: config.mapTileUrl, attribution: config.mapTileAttribution },
    push: { enabled: pushEnabled, publicKey: pushEnabled ? config.vapidPublicKey : null },
    accommodations: db.select().from(accommodations).orderBy(accommodations.sortOrder).all().map(accommodationDTO),
  }));

  /**
   * Etapa 1 da entrada: só o WhatsApp. Se o número já é de alguém (lista de confirmados ou cadastro anterior),
   * a pessoa entra direto com os dados que já temos.
   */
  app.post(
    '/api/auth/lookup',
    { config: { rateLimit: { max: 12, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const body = (request.body ?? {}) as Record<string, unknown>;
      const phone = normalizePhone(str(body.phone, 30));
      if (!phone) {
        return reply.code(400).send({ error: 'phone', message: 'Telefone inválido. Use DDD + número (ou +código do país, se for de fora do Brasil).' });
      }
      const guest = findByPhone(phone);
      if (!guest) return { found: false };
      return login(request, reply, guest.id);
    },
  );

  /**
   * Quem não foi achado pelo telefone procura o próprio nome na lista de confirmados.
   * Devolve só nome e convite: nada de telefone, CPF ou hospedagem.
   */
  app.get(
    '/api/auth/search',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const query = request.query as Record<string, unknown>;
      const codeError = inviteCodeError({ inviteCode: query.inviteCode });
      if (codeError) return reply.code(403).send(codeError);
      const q = fold(str(query.q, 60) ?? '');
      const tokens = q.split(/\s+/).filter(Boolean);
      if (q.replace(/\s/g, '').length < 3) return { results: [] };

      const results: { guestId: string; companionIndex: number | null; name: string; invite: string | null }[] = [];
      // Só quem veio da lista: quem se cadastrou sozinho já tem o próprio telefone
      const rows = db.select().from(guests).orderBy(guests.name).all();
      for (const g of rows) {
        if (!g.importKey) continue;
        if (g.claimedAt === null && g.importKey !== 'noivos' && nameMatches(g.name, tokens)) {
          results.push({ guestId: g.id, companionIndex: null, name: g.name, invite: g.inviteLabel });
        }
        (g.companions ?? []).forEach((name, i) => {
          if (nameMatches(name, tokens)) results.push({ guestId: g.id, companionIndex: i, name, invite: g.inviteLabel ?? g.name });
        });
        if (results.length >= 8) break;
      }
      return { results: results.slice(0, 8) };
    },
  );

  /** A pessoa se achou pelo nome: o telefone digitado passa a ser o dela e ela entra. */
  app.post(
    '/api/auth/claim',
    { config: { rateLimit: { max: 8, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const body = (request.body ?? {}) as Record<string, unknown>;
      const codeError = inviteCodeError(body);
      if (codeError) return reply.code(403).send(codeError);
      const phone = normalizePhone(str(body.phone, 30));
      if (!phone) return reply.code(400).send({ error: 'phone', message: 'Telefone inválido. Use DDD + número.' });
      const taken = findByPhone(phone);
      if (taken) return login(request, reply, taken.id);

      const target = db.select().from(guests).where(eq(guests.id, str(body.guestId, 60) ?? '')).get();
      if (!target || !target.importKey) return reply.code(404).send({ error: 'not_found', message: 'Não achamos esse nome na lista. Tente de novo.' });
      const idx = num(body.companionIndex);

      if (idx === null) {
        if (target.claimedAt !== null) {
          return reply.code(409).send({ error: 'claimed', message: 'Essa pessoa já entrou no app com outro número. Fale com os noivos se for você.' });
        }
        db.update(guests).set({ phone }).where(eq(guests.id, target.id)).run();
        return login(request, reply, target.id);
      }

      // Estava como acompanhante de alguém: ganha conta própria e sai da lista de acompanhantes
      const companions = target.companions ?? [];
      const name = companions[idx];
      if (name === undefined || fold(name) !== fold(str(body.name, 60) ?? '')) {
        return reply.code(409).send({ error: 'changed', message: 'A lista mudou. Procure seu nome de novo.' });
      }
      const cpfs = companions.map((_, i) => target.companionCpfs?.[i] ?? '');
      const now = Date.now();
      const id = crypto.randomUUID();
      db.transaction((tx) => {
        tx.insert(guests)
          .values({
            id,
            name,
            phone,
            accommodationId: target.accommodationId,
            customPlaceLabel: target.customPlaceLabel,
            customCity: target.customCity,
            customLat: target.customLat,
            customLng: target.customLng,
            arrivalDate: target.arrivalDate,
            departureDate: target.departureDate,
            cpf: cpfs[idx] || null,
            inviteLabel: target.inviteLabel,
            createdAt: now,
            lastSeenAt: now,
          })
          .run();
        tx.update(guests)
          .set({ companions: companions.filter((_, i) => i !== idx), companionCpfs: cpfs.filter((_, i) => i !== idx) })
          .where(eq(guests.id, target.id))
          .run();
        // Presenças da turma: a pessoa leva a dela para a conta nova
        for (const r of tx.select().from(eventRsvps).where(eq(eventRsvps.guestId, target.id)).all()) {
          tx.insert(eventRsvps).values({ eventId: r.eventId, guestId: id, status: r.status, peopleCount: 1, updatedAt: now }).run();
          if (r.peopleCount > 1) {
            tx.update(eventRsvps)
              .set({ peopleCount: r.peopleCount - 1 })
              .where(and(eq(eventRsvps.eventId, r.eventId), eq(eventRsvps.guestId, target.id)))
              .run();
          }
        }
      });
      const parent = db.select().from(guests).where(eq(guests.id, target.id)).get()!;
      broadcast('guest:upsert', guestPublic(parent));
      return login(request, reply, id);
    },
  );

  /** Cadastro completo de quem não está na lista de confirmados. */
  app.post(
    '/api/auth/enter',
    { config: { rateLimit: { max: 15, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const body = (request.body ?? {}) as Record<string, unknown>;
      const codeError = inviteCodeError(body);
      if (codeError) return reply.code(403).send(codeError);

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

      const cpfRaw = typeof body.cpf === 'string' ? body.cpf.trim() : '';
      const cpf = cpfRaw ? normalizeCpf(cpfRaw) : null;
      if (cpfRaw && !cpf) return reply.code(400).send({ error: 'cpf', message: 'Seu CPF não confere. Verifique os números.' });
      const { cpfs: companionCpfs, invalid } = parseCompanionCpfs(body.companionCpfs, companions.length);
      if (invalid !== null) {
        return reply.code(400).send({ error: 'companionCpfs', message: `O CPF de ${companions[invalid]} não confere. Verifique os números.` });
      }

      const now = Date.now();
      const existing = findByPhone(phone);
      let guestId: string;
      if (existing) {
        guestId = existing.id;
        db.update(guests)
          .set({ name, ...stay, ...dates, companions, companionCpfs, cpf: cpf ?? existing.cpf, showPhone, lastSeenAt: now })
          .where(eq(guests.id, guestId))
          .run();
      } else {
        guestId = crypto.randomUUID();
        db.insert(guests)
          .values({ id: guestId, name, phone, ...stay, ...dates, companions, companionCpfs, cpf, showPhone, createdAt: now, lastSeenAt: now })
          .run();
      }

      const result = login(request, reply, guestId);
      return { guest: result.guest, isAdmin: result.isAdmin, returning: !!existing };
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
