import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { badRequest } from '../errors.js';
import { ah, idParam, parse } from '../http.js';
import type { AttendanceService } from '../services/attendanceService.js';

// Somente a imagem é aceita. Qualquer outro campo (employee_id, timestamp...) é rejeitado.
const captureBody = z.object({ image_base64: z.string().min(1, 'Imagem obrigatória') }).strict();

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use o formato AAAA-MM-DD');
const listQuery = z.object({
  employee_id: z.coerce.number().int().positive().optional(),
  from: ymd.optional(),
  to: ymd.optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
});

export function attendanceRouter(service: AttendanceService, requireAdmin: RequestHandler) {
  const r = Router();

  // Público (quiosque): reconhece e registra. A identidade vem SOMENTE do reconhecimento facial.
  r.post(
    '/',
    ah(async (req, res) => {
      const { image_base64 } = parse(captureBody, req.body);
      res.status(201).json(await service.register(image_base64));
    }),
  );

  r.post(
    '/recognize',
    requireAdmin,
    ah(async (req, res) => {
      const { image_base64 } = parse(captureBody, req.body);
      res.json(await service.recognize(image_base64));
    }),
  );

  r.get('/', requireAdmin, (req, res) => {
    const q = parse(listQuery, req.query);
    if (q.from && q.to && q.from > q.to) throw badRequest('invalid_range', 'Data inicial maior que a final');
    res.json(
      service.list({ employeeId: q.employee_id, from: q.from, to: q.to, page: q.page, pageSize: q.page_size }),
    );
  });

  r.get('/:id', requireAdmin, (req, res) => {
    res.json(service.get(parse(idParam, req.params).id));
  });

  return r;
}
