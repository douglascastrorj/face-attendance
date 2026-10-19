// Logger mínimo. Regra: nunca registrar corpos de requisição, imagens ou embeddings.
type Level = 'debug' | 'info' | 'warn' | 'error';

const silent = process.env.NODE_ENV === 'test' || process.env.VITEST !== undefined;

function write(level: Level, msg: string, meta?: Record<string, unknown>) {
  if (silent && level !== 'error') return;
  const line = `${new Date().toISOString()} ${level.toUpperCase()} [backend] ${msg}`;
  const extra = meta && Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  (level === 'error' || level === 'warn' ? console.error : console.log)(line + extra);
}

export const logger = {
  debug: (m: string, meta?: Record<string, unknown>) => write('debug', m, meta),
  info: (m: string, meta?: Record<string, unknown>) => write('info', m, meta),
  warn: (m: string, meta?: Record<string, unknown>) => write('warn', m, meta),
  error: (m: string, meta?: Record<string, unknown>) => write('error', m, meta),
};
