// Aplica a política de retenção do histórico de ponto (TIME_RECORDS_RETENTION_DAYS).
// Por segurança, só executa a exclusão com --apply; sem a flag, mostra o que seria removido.
// Embeddings NÃO são tratados aqui: são excluídos imediatamente na desativação do funcionário.
import { loadConfig } from '../config.js';
import { flushDeletedPages, openDatabase } from '../database/db.js';
import { migrate } from '../database/migrator.js';

const config = loadConfig({ ...process.env, ADMIN_AUTH_DISABLED: 'true' });
const days = config.TIME_RECORDS_RETENTION_DAYS;
if (days === 0) {
  console.log('TIME_RECORDS_RETENTION_DAYS=0: retenção indefinida; nada a fazer.');
  process.exit(0);
}
const db = openDatabase(config.databaseFile);
migrate(db);
const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
const count = (db.prepare('SELECT COUNT(*) AS n FROM time_records WHERE recorded_at < ?').get(cutoff) as { n: number }).n;
if (!process.argv.includes('--apply')) {
  console.log(`${count} registro(s) anteriores a ${cutoff} seriam excluídos. Rode com "-- --apply" para confirmar.`);
} else {
  const deleted = db.prepare('DELETE FROM time_records WHERE recorded_at < ?').run(cutoff).changes;
  flushDeletedPages(db);
  console.log(`${deleted} registro(s) anteriores a ${cutoff} excluídos.`);
}
db.close();
