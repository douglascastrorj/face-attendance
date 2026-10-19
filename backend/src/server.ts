import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { openDatabase } from './database/db.js';
import { migrate } from './database/migrator.js';
import { logger } from './logger.js';
import { HttpRecognitionClient } from './services/recognitionClient.js';

const config = loadConfig();
const db = openDatabase(config.databaseFile);
const { applied } = migrate(db);
if (applied.length) logger.info('Migrations aplicadas', { applied });

if (config.ADMIN_AUTH_DISABLED) {
  logger.warn('ADMIN_AUTH_DISABLED=true — área administrativa SEM autenticação. Use apenas em ambiente isolado.');
}
logger.info('Limiar de reconhecimento em uso (validar com amostras reais antes de uso operacional)', {
  threshold: config.RECOGNITION_THRESHOLD,
  ambiguity_margin: config.RECOGNITION_AMBIGUITY_MARGIN,
});

const app = createApp({
  db,
  config,
  recognition: new HttpRecognitionClient(config.RECOGNITION_URL, config.RECOGNITION_TIMEOUT_MS),
});

const server = app.listen(config.BACKEND_PORT, config.BACKEND_HOST, () => {
  logger.info(`Backend em http://${config.BACKEND_HOST}:${config.BACKEND_PORT} (docs: /api/docs)`);
});

function shutdown(signal: string) {
  logger.info(`${signal} recebido, encerrando`);
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
