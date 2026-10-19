import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

export type DB = Database.Database;

export function openDatabase(file: string): DB {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  // Sobrescreve com zeros o conteúdo removido: embeddings apagados não ficam em páginas livres do arquivo.
  db.pragma('secure_delete = ON');
  return db;
}

/**
 * Após excluir dados biométricos, força o checkpoint do WAL e trunca o arquivo -wal,
 * para que versões antigas das páginas não permaneçam no disco.
 */
export function flushDeletedPages(db: DB): void {
  if (db.memory) return;
  db.pragma('wal_checkpoint(TRUNCATE)');
}
