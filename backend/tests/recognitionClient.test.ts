import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { HttpRecognitionClient } from '../src/services/recognitionClient.js';
import { count, fakeImage, setup, vectorFor } from './helpers.js';

/** Servidor HTTP que simula o serviço Python em diferentes estados de falha. */
let servers: http.Server[] = [];
async function stub(handler: http.RequestListener): Promise<string> {
  const server = http.createServer(handler);
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
afterEach(async () => {
  for (const s of servers) {
    s.closeAllConnections();
    await new Promise((r) => s.close(r));
  }
  servers = [];
});

const json = (res: http.ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
};

async function ctxWith(url: string, timeoutMs = 2000) {
  const ctx = await setup({ recognition: new HttpRecognitionClient(url, timeoutMs) });
  // Funcionário pré-existente na galeria (inserido direto, pois o cadastro também depende do serviço).
  const now = new Date().toISOString();
  const id = Number(ctx.db.prepare("INSERT INTO employees (name, active, created_at, updated_at) VALUES ('Maria', 1, ?, ?)").run(now, now).lastInsertRowid);
  const buf = Buffer.alloc(128 * 4);
  vectorFor('maria').forEach((v, i) => buf.writeFloatLE(v, i * 4));
  ctx.db.prepare("INSERT INTO face_embeddings (employee_id, embedding, embedding_dim, model_name, model_version, created_at) VALUES (?, ?, 128, 'sface', '2021dec', ?)").run(id, buf, now);
  return { ctx, id };
}

const image = { image_base64: fakeImage('person:maria') };

describe('comunicação com o serviço Python', () => {
  it('serviço indisponível → 503 e nenhum registro', async () => {
    const { ctx } = await ctxWith('http://127.0.0.1:1');
    const res = await ctx.request.post('/api/attendance').send(image);
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('recognition_unavailable');
    expect(count(ctx.db, 'time_records')).toBe(0);

    const health = await ctx.request.get('/api/health/recognition');
    expect(health.status).toBe(503);
    expect(health.body).toMatchObject({ status: 'down', service_reachable: false });
  });

  it('cadastro com serviço indisponível não cria funcionário', async () => {
    const { ctx } = await ctxWith('http://127.0.0.1:1');
    const res = await ctx.request.post('/api/employees').set(ctx.auth).send({ name: 'Novo Func', ...image });
    expect(res.status).toBe(503);
    expect(count(ctx.db, 'employees')).toBe(1);
  });

  it('modelos ausentes no Python → 503 recognition_models_unavailable', async () => {
    const url = await stub((req, res) => {
      if (req.url === '/health') return json(res, 503, { status: 'degraded', models_loaded: false, error: 'Arquivo do modelo ausente' });
      json(res, 503, { error: 'models_unavailable', detail: 'Arquivo do modelo ausente' });
    });
    const { ctx } = await ctxWith(url);
    const res = await ctx.request.post('/api/attendance').send(image);
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('recognition_models_unavailable');
    const health = await ctx.request.get('/api/health/recognition');
    expect(health.status).toBe(503);
    expect(health.body).toMatchObject({ service_reachable: true, models_loaded: false });
  });

  it('timeout → 504 e nenhum registro', async () => {
    const url = await stub(() => {
      /* nunca responde */
    });
    const { ctx } = await ctxWith(url, 200);
    const res = await ctx.request.post('/api/attendance').send(image);
    expect(res.status).toBe(504);
    expect(count(ctx.db, 'time_records')).toBe(0);
  });

  it('resposta fora do contrato → 502', async () => {
    const url = await stub((_req, res) => json(res, 200, { matched: 'talvez' }));
    const { ctx } = await ctxWith(url);
    const res = await ctx.request.post('/api/attendance').send(image);
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('recognition_bad_response');
  });

  it('resposta não-JSON → 502', async () => {
    const url = await stub((_req, res) => res.writeHead(200).end('<html>proxy</html>'));
    const { ctx } = await ctxWith(url);
    expect((await ctx.request.post('/api/attendance').send(image)).status).toBe(502);
  });

  it('incompatibilidade de modelo reportada pelo Python → 409', async () => {
    const url = await stub((_req, res) => json(res, 409, { error: 'model_mismatch', detail: 'x' }));
    const { ctx } = await ctxWith(url);
    const res = await ctx.request.post('/api/attendance').send(image);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('recognition_model_mismatch');
  });

  it('caminho feliz via HTTP: envia galeria e não vaza embeddings na resposta', async () => {
    let received: { gallery: { employee_id: number; embedding: number[] }[]; threshold: number } | undefined;
    const url = await stub((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        received = JSON.parse(body);
        json(res, 200, {
          model_name: 'sface', model_version: '2021dec', embedding_dim: 128, matched: true,
          employee_id: received!.gallery[0]!.employee_id, similarity: 0.8, threshold: received!.threshold,
          ambiguity_margin: 0.05, candidates: [],
        });
      });
    });
    const { ctx, id } = await ctxWith(url);
    const res = await ctx.request.post('/api/attendance').send(image);
    expect(res.status).toBe(201);
    expect(received!.gallery[0]!.embedding).toHaveLength(128);
    expect(received!.gallery[0]!.employee_id).toBe(id);
    expect(JSON.stringify(res.body)).not.toMatch(/embedding/);
  });
});
