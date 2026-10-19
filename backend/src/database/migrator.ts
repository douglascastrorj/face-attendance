import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { BACKEND_ROOT } from '../config.js';
import type { DB } from './db.js';

export const MIGRATIONS_DIR = path.join(BACKEND_ROOT, 'migrations');

interface Migration {
  version: string;
  file: string;
  sql: string;
  checksum: string;
}

function readMigrations(dir: string): Migration[] {
  return fs
    .readdirSync(dir)
    .filter((f) => /^\d{3,}_[\w-]+\.sql$/.test(f))
    .sort()
    .map((file) => {
      const sql = fs.readFileSync(path.join(dir, file), 'utf8');
      return {
        version: file.split('_')[0]!,
        file,
        sql,
        checksum: crypto.createHash('sha256').update(sql).digest('hex'),
      };
    });
}

function ensureTable(db: DB) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version    TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    checksum   TEXT NOT NULL,
    applied_at TEXT NOT NULL
  )`);
}

export interface MigrationStatus {
  applied: string[];
  pending: string[];
}

/** Aplica migrations pendentes, cada uma em sua transação. Idempotente; falha se uma migration aplicada foi alterada. */
export function migrate(db: DB, dir = MIGRATIONS_DIR): MigrationStatus {
  ensureTable(db);
  const applied = new Map(
    db
      .prepare('SELECT version, checksum, name FROM schema_migrations')
      .all()
      .map((r) => {
        const row = r as { version: string; checksum: string; name: string };
        return [row.version, row] as const;
      }),
  );
  const result: MigrationStatus = { applied: [], pending: [] };
  for (const m of readMigrations(dir)) {
    const prev = applied.get(m.version);
    if (prev) {
      if (prev.checksum !== m.checksum) {
        throw new Error(
          `Migration ${m.file} foi alterada após ser aplicada. Crie uma nova migration em vez de editar a existente.`,
        );
      }
      continue;
    }
    db.transaction(() => {
      db.exec(m.sql);
      db.prepare('INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)').run(
        m.version,
        m.file,
        m.checksum,
        new Date().toISOString(),
      );
    })();
    result.applied.push(m.file);
  }
  return result;
}

export function migrationStatus(db: DB, dir = MIGRATIONS_DIR): MigrationStatus {
  ensureTable(db);
  const done = new Set(
    db.prepare('SELECT version FROM schema_migrations').all().map((r) => (r as { version: string }).version),
  );
  const all = readMigrations(dir);
  return {
    applied: all.filter((m) => done.has(m.version)).map((m) => m.file),
    pending: all.filter((m) => !done.has(m.version)).map((m) => m.file),
  };
}
