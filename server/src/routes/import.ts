import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { and, eq, gt, isNotNull, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import { normalizeCpf } from '../cpf.js';
import { db } from '../db/index.js';
import { accommodations, eventRsvps, events, guests, messages, photos, pushSubscriptions, reactions, sessions } from '../db/schema.js';
import { normalizePhone, phoneVariants, placeholderPhone } from '../phone.js';
import { dateStr, num, str, timeStr } from '../validate.js';

/** Dono dos combinados importados: uma conta "dos noivos", que um deles pode assumir depois pela busca por nome. */
const OWNER_KEY = 'noivos';

const STATUSES = new Set(['yes', 'maybe', 'no']);

function sameToken(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/**
 * Importação da lista de confirmados (feita pelo script scripts/importar-lista.mjs, com o token IMPORT_TOKEN).
 * Cria os confirmados já como convidados do app (com hospedagem, datas e acompanhantes), os combinados da
 * programação e as presenças respondidas no formulário. Rodar de novo atualiza só quem ainda não entrou no app.
 */
export default async function importRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/import', { bodyLimit: 5 * 1024 * 1024 }, async (request, reply) => {
    const token = request.headers['x-import-token'];
    if (!config.importToken || typeof token !== 'string' || !sameToken(token, config.importToken)) {
      return reply.code(403).send({ error: 'forbidden', message: 'Importação desligada ou token incorreto.' });
    }
    const body = (request.body ?? {}) as Record<string, unknown>;
    const inGuests = Array.isArray(body.guests) ? (body.guests as Record<string, unknown>[]) : [];
    const inEvents = Array.isArray(body.events) ? (body.events as Record<string, unknown>[]) : [];
    const inRsvps = Array.isArray(body.rsvps) ? (body.rsvps as Record<string, unknown>[]) : [];
    const ownerName = str(body.ownerName, 60) ?? 'Os noivos';
    const dryRun = body.dryRun === true;

    const accIds = new Set(db.select({ id: accommodations.id }).from(accommodations).all().map((a) => a.id));
    const reset = body.reset === true;
    /** Contas com ajuste manual: datas e acompanhantes valem mesmo para quem já entrou no app */
    const forceKeys = new Set(Array.isArray(body.forceKeys) ? body.forceKeys.filter((k): k is string => typeof k === 'string') : []);
    const summary = { wiped: null as null | Record<string, number>, created: 0, updated: 0, keptClaimed: 0, forced: 0, linkedExisting: 0, removed: 0, events: 0, rsvps: 0, warnings: [] as string[] };
    const now = Date.now();

    class DryRun extends Error {}

    try {
      db.transaction((tx) => {
        // Zerar tudo antes (dados de teste): convidados, mural, fotos, combinados, sessões e avisos
        if (reset) {
          summary.wiped = {
            reactions: tx.delete(reactions).run().changes,
            messages: tx.delete(messages).run().changes,
            photos: tx.delete(photos).run().changes,
            rsvps: tx.delete(eventRsvps).run().changes,
            events: tx.delete(events).run().changes,
            pushSubscriptions: tx.delete(pushSubscriptions).run().changes,
            sessions: tx.delete(sessions).run().changes,
            guests: tx.delete(guests).run().changes,
          };
        }

        // Conta dos noivos (dona dos combinados)
        let owner = tx.select().from(guests).where(eq(guests.importKey, OWNER_KEY)).get();
        if (!owner) {
          const id = crypto.randomUUID();
          tx.insert(guests)
            .values({ id, name: ownerName, phone: placeholderPhone(OWNER_KEY), importKey: OWNER_KEY, createdAt: now, lastSeenAt: now })
            .run();
          owner = tx.select().from(guests).where(eq(guests.id, id)).get()!;
        }

        const idByKey = new Map<string, string>();
        const claimedKeys = new Set<string>();

        for (const g of inGuests) {
          const key = str(g.key, 120);
          const name = str(g.name, 60);
          if (!key || !name || key === OWNER_KEY) {
            summary.warnings.push(`Linha ignorada (sem chave ou nome): ${JSON.stringify(g).slice(0, 80)}`);
            continue;
          }
          const realPhone = normalizePhone(str(g.phone, 30));
          const companions = (Array.isArray(g.companions) ? g.companions : [])
            .filter((c): c is string => typeof c === 'string' && !!c.trim())
            .map((c) => c.trim().slice(0, 40));
          const rawCpfs = Array.isArray(g.companionCpfs) ? g.companionCpfs : [];
          const companionCpfs = companions.map((_, i) => normalizeCpf(rawCpfs[i]) ?? '');
          const accommodationId = str(g.accommodationId, 60);
          if (accommodationId && !accIds.has(accommodationId)) summary.warnings.push(`${name}: hospedagem "${accommodationId}" não existe`);
          const arrivalDate = dateStr(g.arrivalDate);
          const departureDate = dateStr(g.departureDate);
          const fields = {
            name,
            companions,
            companionCpfs,
            cpf: normalizeCpf(g.cpf),
            accommodationId: accommodationId && accIds.has(accommodationId) ? accommodationId : null,
            customPlaceLabel: accommodationId ? null : str(g.customPlaceLabel, 80),
            customCity: accommodationId ? null : str(g.customCity, 40),
            arrivalDate,
            departureDate: arrivalDate && departureDate && departureDate < arrivalDate ? null : departureDate,
            inviteLabel: str(g.inviteLabel, 80),
          };

          const byKey = tx.select().from(guests).where(eq(guests.importKey, key)).get();
          const byPhone = realPhone
            ? phoneVariants(realPhone)
                .map((p) => tx.select().from(guests).where(eq(guests.phone, p)).get())
                .find(Boolean)
            : undefined;

          if (byKey) {
            idByKey.set(key, byKey.id);
            if (byKey.claimedAt !== null) {
              // Já entrou no app: o que a pessoa editou vale mais que a planilha
              claimedKeys.add(key);
              if (forceKeys.has(key)) {
                // Ajuste manual combinado com os noivos: corrige só datas e acompanhantes
                tx.update(guests)
                  .set({ arrivalDate: fields.arrivalDate, departureDate: fields.departureDate, companions, companionCpfs })
                  .where(eq(guests.id, byKey.id))
                  .run();
                tx.update(eventRsvps)
                  .set({ peopleCount: 1 + companions.length })
                  .where(and(eq(eventRsvps.guestId, byKey.id), gt(eventRsvps.peopleCount, 1 + companions.length)))
                  .run();
                summary.forced++;
              } else {
                summary.keptClaimed++;
              }
              continue;
            }
            const phone = realPhone && (!byPhone || byPhone.id === byKey.id) ? realPhone : byKey.phone;
            tx.update(guests).set({ ...fields, phone }).where(eq(guests.id, byKey.id)).run();
            summary.updated++;
          } else if (byPhone) {
            // O telefone já é de alguém que se cadastrou sozinho: liga à lista e só completa o que estiver vazio
            idByKey.set(key, byPhone.id);
            claimedKeys.add(key);
            if (byPhone.importKey) {
              summary.warnings.push(`${name}: telefone repetido com "${byPhone.name}" (ficou sem conta própria)`);
              continue;
            }
            const hasStay = byPhone.accommodationId || byPhone.customPlaceLabel;
            tx.update(guests)
              .set({
                importKey: key,
                inviteLabel: fields.inviteLabel,
                cpf: byPhone.cpf ?? fields.cpf,
                ...(hasStay ? {} : { accommodationId: fields.accommodationId, customPlaceLabel: fields.customPlaceLabel, customCity: fields.customCity }),
                ...(byPhone.arrivalDate ? {} : { arrivalDate: fields.arrivalDate, departureDate: fields.departureDate }),
                ...((byPhone.companions ?? []).length ? {} : { companions, companionCpfs }),
              })
              .where(eq(guests.id, byPhone.id))
              .run();
            summary.linkedExisting++;
          } else {
            const id = crypto.randomUUID();
            tx.insert(guests)
              .values({ id, ...fields, phone: realPhone ?? placeholderPhone(id), importKey: key, createdAt: now, lastSeenAt: now })
              .run();
            idByKey.set(key, id);
            summary.created++;
          }
        }

        // Saiu da planilha e nunca entrou no app: remove (com as presenças importadas)
        if (body.removeMissing !== false) {
          const stale = tx
            .select()
            .from(guests)
            .where(and(isNotNull(guests.importKey), isNull(guests.claimedAt)))
            .all()
            .filter((g) => g.importKey !== OWNER_KEY && !idByKey.has(g.importKey!));
          for (const g of stale) {
            tx.delete(eventRsvps).where(eq(eventRsvps.guestId, g.id)).run();
            tx.delete(guests).where(eq(guests.id, g.id)).run();
            summary.removed++;
          }
        }

        // Combinados da programação
        const eventIds = new Set<string>();
        for (const e of inEvents) {
          const id = str(e.id, 60);
          const title = str(e.title, 80);
          const date = dateStr(e.date);
          if (!id || !title || !date) {
            summary.warnings.push(`Combinado ignorado: ${JSON.stringify(e).slice(0, 80)}`);
            continue;
          }
          const lat = num(e.placeLat);
          const lng = num(e.placeLng);
          const fields = {
            title,
            description: str(e.description, 600),
            date,
            time: e.time ? timeStr(e.time) : null,
            placeLabel: str(e.placeLabel, 100),
            placeLat: lat !== null && lng !== null ? lat : null,
            placeLng: lat !== null && lng !== null ? lng : null,
          };
          const existing = tx.select().from(events).where(eq(events.id, id)).get();
          if (existing) {
            // Já existe: quem manda agora é o que os noivos editaram no app
            if (!existing.deletedAt) eventIds.add(id);
          } else {
            tx.insert(events)
              .values({ id, ...fields, isOfficial: true, createdBy: owner.id, createdAt: now, updatedAt: now })
              .run();
            eventIds.add(id);
            summary.events++;
          }
        }

        // Presenças respondidas no formulário
        for (const r of inRsvps) {
          const eventId = str(r.eventId, 60);
          const guestId = idByKey.get(str(r.guestKey, 120) ?? '');
          const status = str(r.status, 10);
          if (!eventId || !guestId || !status || !eventIds.has(eventId) || !STATUSES.has(status)) continue;
          // Quem já entrou no app responde por si: a importação não cria nem altera as presenças dessa pessoa
          if (claimedKeys.has(str(r.guestKey, 120) ?? '')) continue;
          const where = and(eq(eventRsvps.eventId, eventId), eq(eventRsvps.guestId, guestId));
          const existing = tx.select().from(eventRsvps).where(where).get();
          const peopleCount = Math.max(1, Math.min(20, Math.round(num(r.peopleCount) ?? 1)));
          if (existing) {
            tx.update(eventRsvps).set({ status, peopleCount, updatedAt: now }).where(where).run();
          } else {
            tx.insert(eventRsvps).values({ eventId, guestId, status, peopleCount, updatedAt: now }).run();
          }
          summary.rsvps++;
        }

        if (dryRun) throw new DryRun();
      });
    } catch (err) {
      if (!(err instanceof DryRun)) throw err;
    }

    // Arquivos das fotos e avatares apagados (só depois de a transação valer)
    if (reset && !dryRun && summary.wiped) {
      let files = 0;
      for (const name of fs.readdirSync(config.uploadDir)) {
        try {
          fs.rmSync(path.join(config.uploadDir, name), { force: true });
          files++;
        } catch {
          /* arquivo em uso: fica para trás, sem referência no banco */
        }
      }
      summary.wiped.files = files;
    }

    return { ok: true, dryRun, ...summary };
  });

  /** Limpa o mural: apaga as mensagens de texto e as reações. Fotos (e as mensagens delas) ficam. */
  app.post('/api/import/limpar-mural', async (request, reply) => {
    const token = request.headers['x-import-token'];
    if (!config.importToken || typeof token !== 'string' || !sameToken(token, config.importToken)) {
      return reply.code(403).send({ error: 'forbidden', message: 'Token incorreto.' });
    }
    const includePhotos = ((request.body ?? {}) as Record<string, unknown>).photos === true;
    const result = db.transaction((tx) => {
      const before = { messages: tx.select().from(messages).all().length, photos: tx.select().from(photos).all().length };
      const keep = includePhotos ? [] : tx.select().from(messages).all().filter((m) => m.photoId).map((m) => m.id);
      let removed = 0;
      for (const m of tx.select().from(messages).all()) {
        if (keep.includes(m.id)) continue;
        tx.delete(reactions).where(eq(reactions.messageId, m.id)).run();
        tx.delete(messages).where(eq(messages.id, m.id)).run();
        removed++;
      }
      const files: string[] = [];
      if (includePhotos) {
        for (const p of tx.select().from(photos).all()) files.push(p.fileKey, p.thumbKey);
        tx.delete(photos).run();
      }
      return { before, removedMessages: removed, removedPhotos: includePhotos ? before.photos : 0, files };
    });
    for (const f of result.files) fs.rmSync(path.join(config.uploadDir, f), { force: true });
    return { ok: true, before: result.before, removedMessages: result.removedMessages, removedPhotos: result.removedPhotos };
  });
}
