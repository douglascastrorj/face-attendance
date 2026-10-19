import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import type { Config } from '../config.js';
import type { DB } from '../database/db.js';
import { AppError } from '../errors.js';
import { ah, bearer, parse } from '../http.js';
import type { AttendanceService } from '../services/attendanceService.js';
import type { AuthService } from '../services/authService.js';
import type { RecognitionClient } from '../services/recognitionClient.js';

export function healthRouter(db: DB, cfg: Config, recognition: RecognitionClient) {
  const r = Router();

  r.get('/', (_req, res) => {
    db.prepare('SELECT 1').get();
    res.json({ status: 'ok', time: new Date().toISOString(), timezone: cfg.DISPLAY_TIMEZONE });
  });

  r.get(
    '/recognition',
    ah(async (_req, res) => {
      try {
        const h = await recognition.health();
        const compatible =
          h.models_loaded &&
          h.model_name === cfg.RECOGNITION_MODEL_NAME &&
          h.model_version === cfg.RECOGNITION_MODEL_VERSION &&
          h.embedding_dim === cfg.RECOGNITION_EMBEDDING_DIM;
        res.status(compatible ? 200 : 503).json({
          status: compatible ? 'ok' : 'degraded',
          service_reachable: true,
          models_loaded: h.models_loaded,
          model_name: h.model_name ?? null,
          model_version: h.model_version ?? null,
          embedding_dim: h.embedding_dim ?? null,
          detector: h.detector ?? null,
          expected_model: `${cfg.RECOGNITION_MODEL_NAME}/${cfg.RECOGNITION_MODEL_VERSION}`,
          threshold: cfg.RECOGNITION_THRESHOLD,
          error: h.error ?? (h.models_loaded && !compatible ? 'Modelo carregado difere do esperado' : null),
        });
      } catch (err) {
        const e = err instanceof AppError ? err : new AppError(503, 'recognition_unavailable', 'Indisponível');
        res.status(503).json({ status: 'down', service_reachable: false, models_loaded: false, error: e.message });
      }
    }),
  );

  return r;
}

export function authRouter(auth: AuthService) {
  const r = Router();
  r.get('/status', (req, res) => {
    res.json({ auth_disabled: auth.disabled, authenticated: auth.verify(bearer(req)) });
  });
  r.post('/login', (req, res) => {
    const { password } = parse(z.object({ password: z.string().min(1).max(256) }), req.body);
    res.json(auth.login(password, req.ip ?? 'unknown'));
  });
  r.post('/logout', (req, res) => {
    auth.logout(bearer(req));
    res.status(204).end();
  });
  return r;
}

export function dashboardRouter(service: AttendanceService, requireAdmin: RequestHandler) {
  const r = Router();
  r.get('/', requireAdmin, (_req, res) => res.json(service.dashboard()));
  return r;
}
