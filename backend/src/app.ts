import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import type { Config } from './config.js';
import type { DB } from './database/db.js';
import { AppError } from './errors.js';
import { errorHandler, requireAdmin } from './http.js';
import { logger } from './logger.js';
import { openApiSpec } from './openapi.js';
import { attendanceRouter } from './routes/attendance.js';
import { employeesRouter } from './routes/employees.js';
import { authRouter, dashboardRouter, healthRouter } from './routes/system.js';
import { AttendanceService } from './services/attendanceService.js';
import { AuthService } from './services/authService.js';
import { EmployeeService } from './services/employeeService.js';
import type { RecognitionClient } from './services/recognitionClient.js';
import { systemClock, type Clock } from './time.js';

export interface AppDeps {
  db: DB;
  config: Config;
  recognition: RecognitionClient;
  clock?: Clock;
}

export function createApp({ db, config, recognition, clock = systemClock }: AppDeps) {
  const auth = new AuthService(
    config.ADMIN_PASSWORD,
    config.ADMIN_SESSION_TTL_MINUTES * 60_000,
    clock,
    config.ADMIN_AUTH_DISABLED,
  );
  const employees = new EmployeeService(db, config, recognition, clock);
  const attendance = new AttendanceService(db, config, recognition, clock);
  const admin = requireAdmin(auth);

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');

  // Swagger UI antes do helmet: precisa de scripts/estilos inline que a CSP padrão bloquearia.
  app.get('/api/openapi.json', (_req, res) => res.json(openApiSpec));
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec, { customSiteTitle: 'face-attendance API' }));

  app.use(helmet());
  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || origin === config.FRONTEND_ORIGIN),
      methods: ['GET', 'POST', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }),
  );
  // Limite de JSON: imagem (≤ MAX_IMAGE_BYTES) em base64 (+33%) com folga para os demais campos.
  app.use(express.json({ limit: Math.ceil(config.MAX_IMAGE_BYTES * 1.4) + 4096 }));

  // Log de acesso sem corpo, sem query string (pode conter nomes) e sem cabeçalhos.
  app.use((req, res, next) => {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      logger.info(`${req.method} ${req.originalUrl.split("?")[0]} ${res.statusCode} ${ms.toFixed(0)}ms`);
    });
    next();
  });
  app.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  app.use('/api/health', healthRouter(db, config, recognition));
  app.use('/api/auth', authRouter(auth));
  app.use('/api/dashboard', dashboardRouter(attendance, admin));
  app.use('/api/employees', admin, employeesRouter(employees));
  app.use('/api/attendance', attendanceRouter(attendance, admin));

  app.use('/api', (_req, _res, next) => next(new AppError(404, 'not_found', 'Rota não encontrada')));
  app.use(errorHandler);
  return app;
}
