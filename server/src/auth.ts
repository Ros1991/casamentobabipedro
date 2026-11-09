import crypto from 'node:crypto';
import { eq, lt } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { config } from './config.js';
import { db } from './db/index.js';
import { guests, sessions, type Guest } from './db/schema.js';

export const SESSION_COOKIE = 'galera_session';
export const TELAO_COOKIE = 'galera_telao';
const SESSION_MS = 120 * 24 * 60 * 60 * 1000; // 120 dias
const TELAO_MS = 60 * 24 * 60 * 60 * 1000; // 60 dias

declare module 'fastify' {
  interface FastifyRequest {
    guest: Guest | null;
  }
}

export function isAdmin(guest: Guest | null | undefined): boolean {
  return !!guest && config.adminPhones.includes(guest.phone);
}

export function createSession(guestId: string): string {
  const token = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  db.insert(sessions).values({ token, guestId, createdAt: now, expiresAt: now + SESSION_MS }).run();
  // Limpeza oportunista de sessões vencidas
  db.delete(sessions).where(lt(sessions.expiresAt, now)).run();
  return token;
}

export function deleteSession(token: string): void {
  db.delete(sessions).where(eq(sessions.token, token)).run();
}

export function resolveGuestByToken(token: string): Guest | null {
  const row = db
    .select({ guest: guests, expiresAt: sessions.expiresAt })
    .from(sessions)
    .innerJoin(guests, eq(sessions.guestId, guests.id))
    .where(eq(sessions.token, token))
    .get();
  if (!row || row.expiresAt < Date.now()) return null;
  return row.guest;
}

/** Token de sessão vindo da requisição HTTP (cookie assinado). */
export function sessionTokenFromRequest(request: FastifyRequest): string | null {
  const raw = request.cookies[SESSION_COOKIE];
  if (!raw) return null;
  const unsigned = request.unsignCookie(raw);
  return unsigned.valid && unsigned.value ? unsigned.value : null;
}

/** Usado pelo Socket.IO, que só tem o header Cookie cru. */
export function guestFromCookieHeader(app: FastifyInstance, header: string | undefined): Guest | null {
  if (!header) return null;
  const cookies = app.parseCookie(header);
  const raw = cookies[SESSION_COOKIE];
  if (!raw) return null;
  const unsigned = app.unsignCookie(raw);
  if (!unsigned.valid || !unsigned.value) return null;
  return resolveGuestByToken(unsigned.value);
}

export function telaoFromCookieHeader(app: FastifyInstance, header: string | undefined): boolean {
  if (!header) return false;
  const cookies = app.parseCookie(header);
  const raw = cookies[TELAO_COOKIE];
  if (!raw) return false;
  const unsigned = app.unsignCookie(raw);
  return unsigned.valid && unsigned.value === 'ok';
}

function isSecure(request: FastifyRequest): boolean {
  return request.protocol === 'https';
}

export function setSessionCookie(request: FastifyRequest, reply: FastifyReply, token: string): void {
  reply.setCookie(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecure(request),
    maxAge: Math.floor(SESSION_MS / 1000),
    signed: true,
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}

export function setTelaoCookie(request: FastifyRequest, reply: FastifyReply): void {
  reply.setCookie(TELAO_COOKIE, 'ok', {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecure(request),
    maxAge: Math.floor(TELAO_MS / 1000),
    signed: true,
  });
}

/** Telão: cookie do telão OU qualquer convidado logado. */
export function hasTelaoAccess(request: FastifyRequest): boolean {
  if (request.guest) return true;
  const raw = request.cookies[TELAO_COOKIE];
  if (!raw) return false;
  const unsigned = request.unsignCookie(raw);
  return unsigned.valid && unsigned.value === 'ok';
}

export async function requireGuest(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!request.guest) {
    await reply.code(401).send({ error: 'unauthorized', message: 'Entre com seu nome e telefone primeiro.' });
  }
}

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!request.guest) {
    await reply.code(401).send({ error: 'unauthorized' });
    return;
  }
  if (!isAdmin(request.guest)) {
    await reply.code(403).send({ error: 'forbidden', message: 'Só os noivos e organizadores têm acesso.' });
  }
}
