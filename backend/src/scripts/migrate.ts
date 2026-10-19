// Cria o banco (se necessário) e aplica migrations pendentes. Nunca apaga dados. Uso: npm run db:migrate [-- --status]
import { loadConfig } from '../config.js';
import { openDatabase } from '../database/db.js';
import { migrate, migrationStatus } from '../database/migrator.js';

try {
  const config = loadConfig({ ...process.env, ADMIN_AUTH_DISABLED: 'true' });
  const db = openDatabase(config.databaseFile);
  if (process.argv.includes('--status')) {
    const s = migrationStatus(db);
    console.log(`Banco: ${config.databaseFile}`);
    console.log(`Aplicadas (${s.applied.length}): ${s.applied.join(', ') || '-'}`);
    console.log(`Pendentes (${s.pending.length}): ${s.pending.join(', ') || '-'}`);
  } else {
    const { applied } = migrate(db);
    console.log(`Banco: ${config.databaseFile}`);
    console.log(applied.length ? `Migrations aplicadas: ${applied.join(', ')}` : 'Banco já está atualizado.');
  }
  db.close();
} catch (err) {
  console.error(`Falha na migration: ${(err as Error).message}`);
  process.exit(1);
}
