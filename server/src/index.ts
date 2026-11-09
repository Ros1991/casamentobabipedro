import fs from 'node:fs';
import path from 'node:path';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { eq } from 'drizzle-orm';
import Fastify from 'fastify';
import { hasTelaoAccess, resolveGuestByToken, sessionTokenFromRequest } from './auth.js';
import { config } from './config.js';
import { closeDb, db, runMigrations } from './db/index.js';
import { guests } from './db/schema.js';
import { setupRealtime } from './realtime.js';
import adminRoutes from './routes/admin.js';
import authRoutes from './routes/auth.js';
import guestRoutes from './routes/guests.js';
import messageRoutes from './routes/messages.js';
import photoRoutes from './routes/photos.js';
import telaoRoutes from './routes/telao.js';
import { seedAccommodations } from './seed.js';

const LAST_SEEN_INTERVAL = 2 * 60 * 1000;

async function main(): Promise<void> {
  runMigrations();
  seedAccommodations();

  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? 'info' },
    trustProxy: true,
    bodyLimit: 1024 * 1024,
  });

  await app.register(cookie, { secret: config.sessionSecret });

  // Identifica o convidado em toda requisição (depois do parse de cookies).
  app.decorateRequest('guest', null);
  app.addHook('onRequest', async (request) => {
    if (request.url.startsWith('/assets/')) return;
    const token = sessionTokenFromRequest(request);
    const guest = token ? resolveGuestByToken(token) : null;
    request.guest = guest;
    if (guest && Date.now() - guest.lastSeenAt > LAST_SEEN_INTERVAL) {
      db.update(guests).set({ lastSeenAt: Date.now() }).where(eq(guests.id, guest.id)).run();
    }
  });

  await app.register(rateLimit, {
    global: true,
    max: 600,
    timeWindow: '1 minute',
    keyGenerator: (request) => request.guest?.id ?? request.ip,
  });

  await app.register(multipart, {
    attachFieldsToBody: 'keyValues',
    limits: { fileSize: config.maxUploadBytes, files: 1, fields: 20, fieldSize: 10 * 1024 },
  });

  app.setErrorHandler((error, request, reply) => {
    const err = error as { statusCode?: number; code?: string; message?: string };
    const status = typeof err.statusCode === 'number' ? err.statusCode : 500;
    if (status === 413) {
      return reply.code(413).send({
        error: 'too_large',
        message: `Arquivo muito grande (máximo ${Math.round(config.maxUploadBytes / 1024 / 1024)} MB).`,
      });
    }
    if (status === 429) {
      return reply
        .code(429)
        .send({ error: 'rate_limit', message: 'Calma! Muitas ações em pouco tempo. Tente de novo em instantes.' });
    }
    if (status >= 500) {
      request.log.error(error);
      return reply.code(status).send({ error: 'server', message: 'Erro inesperado no servidor.' });
    }
    return reply.code(status).send({ error: err.code ?? 'error', message: err.message ?? 'Requisição inválida.' });
  });

  app.get('/health', { config: { rateLimit: false } }, async () => ({ ok: true, time: Date.now() }));

  await app.register(authRoutes);
  await app.register(guestRoutes);
  await app.register(messageRoutes);
  await app.register(photoRoutes);
  await app.register(telaoRoutes);
  await app.register(adminRoutes);

  // Fotos: só para convidados logados ou telão.
  await app.register(async (scope) => {
    scope.addHook('onRequest', async (request, reply) => {
      if (!request.guest && !hasTelaoAccess(request)) {
        return reply.code(401).send({ error: 'unauthorized' });
      }
    });
    await scope.register(fastifyStatic, {
      root: config.uploadDir,
      prefix: '/uploads/',
      decorateReply: false,
      index: false,
      list: false,
      maxAge: '365d',
      immutable: true,
    });
  });

  // Front-end compilado (produção). Em desenvolvimento o Vite serve o client.
  const hasClient = fs.existsSync(path.join(config.clientDist, 'index.html'));
  if (hasClient) {
    await app.register(fastifyStatic, {
      root: config.clientDist,
      prefix: '/',
      index: ['index.html'],
      wildcard: false,
      cacheControl: false,
      setHeaders: (res, filePath) => {
        // Assets do Vite têm hash no nome: cache longo. O resto (index.html, manifest) sempre revalida.
        const normalized = String(filePath).replace(/\\/g, '/');
        if (normalized.includes('/assets/')) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else {
          res.setHeader('Cache-Control', 'no-cache');
        }
      },
    });
  }

  app.setNotFoundHandler((request, reply) => {
    const isRead = request.method === 'GET' || request.method === 'HEAD';
    if (!isRead || request.url.startsWith('/api/') || request.url.startsWith('/uploads/')) {
      return reply.code(404).send({ error: 'not_found', message: 'Rota não encontrada.' });
    }
    if (hasClient) {
      reply.header('Cache-Control', 'no-cache');
      return reply.sendFile('index.html');
    }
    return reply.code(404).send({ error: 'not_found', message: 'Client não compilado. Rode "npm run build".' });
  });

  setupRealtime(app);

  const shutdown = async () => {
    app.log.info('Encerrando...');
    await app.close();
    closeDb();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await app.listen({ port: config.port, host: config.host });
  app.log.info(`Dados em ${config.dataDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
