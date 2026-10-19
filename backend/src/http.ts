import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from 'express';
import { z } from 'zod';
import { AppError } from './errors.js';
import { logger } from './logger.js';
import type { AuthService } from './services/authService.js';

export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) {
    const fields = r.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    throw new AppError(400, 'validation_error', 'Dados inválidos', { fields });
  }
  return r.data;
}

/** Encaminha rejeições de handlers async ao tratador central (Express 5 já faz isso, mantido explícito). */
export const ah =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown> | unknown): RequestHandler =>
  (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

export const bearer = (req: Request) => {
  const h = req.get('authorization');
  return h?.startsWith('Bearer ') ? h.slice(7) : undefined;
};

export const requireAdmin =
  (auth: AuthService): RequestHandler =>
  (req, _res, next) => {
    if (!auth.verify(bearer(req))) {
      return next(new AppError(401, 'unauthorized', 'Autenticação administrativa necessária'));
    }
    next();
  };

export const idParam = z.object({ id: z.coerce.number().int().positive() });

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof AppError) {
    if (err.status >= 500) logger.warn(`${req.method} ${req.originalUrl.split("?")[0]} → ${err.status} ${err.code}`);
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  // Erros do body-parser (JSON inválido ou corpo grande demais). Não ecoar o conteúdo.
  const e = err as { type?: string; status?: number };
  if (e.type === 'entity.too.large') {
    return res.status(413).json({ error: { code: 'payload_too_large', message: 'Requisição excede o tamanho máximo' } });
  }
  if (e.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'invalid_json', message: 'JSON inválido' } });
  }
  logger.error(`${req.method} ${req.originalUrl.split("?")[0]} → erro interno`, { name: (err as Error)?.name });
  res.status(500).json({ error: { code: 'internal_error', message: 'Erro interno' } });
};
