import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

const here = path.dirname(fileURLToPath(import.meta.url));
export const BACKEND_ROOT = path.resolve(here, '..');
export const REPO_ROOT = path.resolve(BACKEND_ROOT, '..');

const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  BACKEND_HOST: z.string().default('127.0.0.1'),
  BACKEND_PORT: z.coerce.number().int().positive().default(3001),
  FRONTEND_ORIGIN: z.string().default('http://localhost:5173'),
  DATABASE_PATH: z.string().default('data/face-attendance.db'),

  RECOGNITION_URL: z.string().url().default('http://127.0.0.1:8001'),
  RECOGNITION_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
  RECOGNITION_MODEL_NAME: z.string().default('sface'),
  RECOGNITION_MODEL_VERSION: z.string().default('2021dec'),
  RECOGNITION_EMBEDDING_DIM: z.coerce.number().int().positive().default(128),
  // Valor inicial SOMENTE para desenvolvimento. Validar com amostras reais antes de uso operacional.
  RECOGNITION_THRESHOLD: z.coerce.number().min(-1).max(1).default(0.363),
  RECOGNITION_AMBIGUITY_MARGIN: z.coerce.number().min(0).max(1).default(0.05),

  // Proteção técnica contra registros duplicados acidentais (não é regra trabalhista).
  ATTENDANCE_DEDUP_SECONDS: z.coerce.number().int().min(0).default(30),
  MAX_IMAGE_BYTES: z.coerce.number().int().positive().default(4 * 1024 * 1024),
  DISPLAY_TIMEZONE: z.string().default('America/Sao_Paulo'),

  ADMIN_PASSWORD: z.string().optional(),
  ADMIN_SESSION_TTL_MINUTES: z.coerce.number().int().positive().default(480),
  // Somente para desenvolvimento isolado: desliga a autenticação administrativa.
  ADMIN_AUTH_DISABLED: bool.default(false),

  // Retenção do histórico (0 = manter indefinidamente). Aplicada apenas pelo comando `npm run data:retention`.
  TIME_RECORDS_RETENTION_DAYS: z.coerce.number().int().min(0).default(0),
});

export type Config = z.infer<typeof schema> & { databaseFile: string };

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  if (env === process.env) {
    loadDotenv({ path: path.join(REPO_ROOT, '.env'), quiet: true });
  }
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Configuração inválida: ${issues}`);
  }
  const cfg = parsed.data;
  if (!cfg.ADMIN_AUTH_DISABLED && (!cfg.ADMIN_PASSWORD || cfg.ADMIN_PASSWORD.length < 12)) {
    throw new Error(
      'ADMIN_PASSWORD ausente ou com menos de 12 caracteres. Execute `npm run setup` para gerar o .env ou defina-o manualmente.',
    );
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: cfg.DISPLAY_TIMEZONE });
  } catch {
    throw new Error(`DISPLAY_TIMEZONE inválido: ${cfg.DISPLAY_TIMEZONE}`);
  }
  const databaseFile =
    cfg.DATABASE_PATH === ':memory:' ? ':memory:' : path.resolve(REPO_ROOT, cfg.DATABASE_PATH);
  return { ...cfg, databaseFile };
}
