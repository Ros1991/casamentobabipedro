import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { config } from '../config.js';
import * as schema from './schema.js';

const sqlite = new Database(config.dbPath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('synchronous = NORMAL');
sqlite.pragma('foreign_keys = ON');
sqlite.pragma('busy_timeout = 5000');

export const db = drizzle(sqlite, { schema });

export function runMigrations(): void {
  // server/src/db ou server/dist/db → ../../drizzle
  const migrationsFolder = path.resolve(import.meta.dirname, '../../drizzle');
  migrate(db, { migrationsFolder });
}

export function closeDb(): void {
  sqlite.close();
}
