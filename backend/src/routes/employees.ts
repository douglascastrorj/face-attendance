import { Router } from 'express';
import { z } from 'zod';
import { ah, idParam, parse } from '../http.js';
import type { EmployeeService } from '../services/employeeService.js';

const listQuery = z.object({
  status: z.enum(['active', 'inactive', 'all']).default('active'),
  name: z.string().trim().max(200).optional(),
  code: z.string().trim().max(64).optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
});

const createBody = z
  .object({
    name: z.string().trim().min(3, 'Informe o nome completo').max(200),
    employee_code: z
      .string()
      .trim()
      .max(64)
      .regex(/^[\w.\-/]*$/, 'Use apenas letras, números, ".", "-", "_" ou "/"')
      .nullish(),
    image_base64: z.string().min(1, 'Capture a imagem facial'),
  })
  .strict();

export function employeesRouter(service: EmployeeService) {
  const r = Router();

  r.get('/', (req, res) => {
    const q = parse(listQuery, req.query);
    const { items, total } = service.list({
      status: q.status,
      name: q.name || undefined,
      code: q.code || undefined,
      limit: q.page_size,
      offset: (q.page - 1) * q.page_size,
    });
    res.json({ items, page: q.page, page_size: q.page_size, total, total_pages: Math.max(1, Math.ceil(total / q.page_size)) });
  });

  r.get('/:id', (req, res) => {
    res.json(service.get(parse(idParam, req.params).id));
  });

  r.post(
    '/',
    ah(async (req, res) => {
      const body = parse(createBody, req.body);
      const employee = await service.enroll(body);
      res.status(201).json(employee);
    }),
  );

  r.delete('/:id', (req, res) => {
    res.json(service.deactivate(parse(idParam, req.params).id));
  });

  return r;
}
