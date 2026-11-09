import fs from 'node:fs';
import path from 'node:path';
import { normalizePhone } from './phone.js';

// Raiz do repositório (server/src ou server/dist → ../..)
export const rootDir = path.resolve(import.meta.dirname, '../..');

// Carrega .env da raiz, se existir. Variáveis já definidas no ambiente (Railway) têm prioridade.
try {
  process.loadEnvFile(path.join(rootDir, '.env'));
} catch {
  /* sem .env: usa só as variáveis do ambiente */
}

function resolveDataDir(): string {
  const raw = process.env.DATA_DIR?.trim();
  if (!raw) return path.join(rootDir, 'data');
  return path.isAbsolute(raw) ? raw : path.resolve(rootDir, raw);
}

const dataDir = resolveDataDir();

export const config = {
  port: Number(process.env.PORT ?? 3000),
  host: '0.0.0.0',
  isProd: process.env.NODE_ENV === 'production',
  dataDir,
  dbPath: path.join(dataDir, 'galera.db'),
  uploadDir: path.join(dataDir, 'uploads'),
  clientDist: path.join(rootDir, 'client', 'dist'),
  sessionSecret: process.env.SESSION_SECRET?.trim() || 'segredo-de-desenvolvimento-troque-em-producao',
  inviteCode: (process.env.INVITE_CODE ?? '').trim(),
  adminPhones: (process.env.ADMIN_PHONES ?? '')
    .split(',')
    .map((p) => normalizePhone(p))
    .filter((p): p is string => !!p),
  telaoCode: (process.env.TELAO_CODE ?? '').trim(),
  maxUploadBytes: Math.max(1, Number(process.env.MAX_UPLOAD_MB ?? 12)) * 1024 * 1024,
  publicUrl: (process.env.PUBLIC_URL ?? '').trim().replace(/\/$/, ''),
  /** Provedor de tiles do mapa (padrão: OpenStreetMap, sem chave). */
  mapTileUrl: (process.env.MAP_TILE_URL ?? '').trim() || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  mapTileAttribution:
    (process.env.MAP_TILE_ATTRIBUTION ?? '').trim() ||
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
};

fs.mkdirSync(config.uploadDir, { recursive: true });

if (config.isProd && config.sessionSecret.length < 24) {
  console.warn('[config] SESSION_SECRET curto ou ausente: defina uma frase longa no Railway.');
}
