import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { openDatabase } from '../src/database/db.js';
import { MIGRATIONS_DIR, migrate, migrationStatus } from '../src/database/migrator.js';
import { deserializeEmbedding, serializeEmbedding } from '../src/repositories/embeddings.js';
import { formatLocal, localRangeToUtc, startOfLocalDayUtc } from '../src/time.js';
import { setup, testConfig } from './helpers.js';

describe('migrations', () => {
  it('são idempotentes e preservam dados', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fa-'));
    const file = path.join(dir, 'test.db');
    const db = openDatabase(file);
    expect(migrate(db).applied).toEqual(['001_initial.sql']);
    db.prepare("INSERT INTO employees (name, created_at, updated_at) VALUES ('X Y Z', 'a', 'a')").run();
    db.close();

    const db2 = openDatabase(file);
    expect(migrate(db2).applied).toEqual([]);
    expect(migrationStatus(db2)).toEqual({ applied: ['001_initial.sql'], pending: [] });
    expect((db2.prepare('SELECT COUNT(*) n FROM employees').get() as { n: number }).n).toBe(1);
    db2.close();
    fs.rmSync(dir, { recursive: true });
  });

  it('falha se uma migration aplicada foi alterada', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fa-mig-'));
    fs.copyFileSync(path.join(MIGRATIONS_DIR, '001_initial.sql'), path.join(dir, '001_initial.sql'));
    const db = openDatabase(':memory:');
    migrate(db, dir);
    fs.appendFileSync(path.join(dir, '001_initial.sql'), '\n-- editado');
    expect(() => migrate(db, dir)).toThrow(/alterada/);
    fs.rmSync(dir, { recursive: true });
  });

  it('rejeita embedding com tamanho inconsistente no banco', () => {
    const db = openDatabase(':memory:');
    migrate(db);
    db.prepare("INSERT INTO employees (name, created_at, updated_at) VALUES ('X Y Z', 'a', 'a')").run();
    expect(() =>
      db
        .prepare("INSERT INTO face_embeddings (employee_id, embedding, embedding_dim, model_name, model_version, created_at) VALUES (1, ?, 128, 'sface', 'v', 'a')")
        .run(Buffer.alloc(10)),
    ).toThrow(/CHECK/);
  });
});

describe('serialização de embeddings', () => {
  it('ida e volta em float32', () => {
    const v = [0.5, -1.25, 3.0, 1e-3];
    const back = deserializeEmbedding(serializeEmbedding(v));
    back.forEach((x, i) => expect(x).toBeCloseTo(v[i]!, 6));
  });
});

describe('fuso horário', () => {
  it('formata em America/Sao_Paulo independentemente do fuso do processo', () => {
    expect(formatLocal('2026-10-17T02:30:00.000Z', 'America/Sao_Paulo')).toBe('16/10/2026, 23:30:00');
  });

  it('converte dia local em intervalo UTC', () => {
    expect(startOfLocalDayUtc('2026-10-17', 'America/Sao_Paulo').toISOString()).toBe('2026-10-17T03:00:00.000Z');
    expect(localRangeToUtc('2026-10-17', '2026-10-17', 'America/Sao_Paulo')).toEqual({
      fromUtc: '2026-10-17T03:00:00.000Z',
      toUtcExclusive: '2026-10-18T03:00:00.000Z',
    });
    // Fuso com horário de verão: Nova York, 2026-03-08 (início do DST)
    expect(startOfLocalDayUtc('2026-03-09', 'America/New_York').toISOString()).toBe('2026-03-09T04:00:00.000Z');
  });
});

describe('configuração', () => {
  it('exige senha administrativa forte, salvo desativação explícita', () => {
    expect(() => testConfig({ ADMIN_PASSWORD: 'curta' })).toThrow(/ADMIN_PASSWORD/);
    expect(() => testConfig({ ADMIN_PASSWORD: '', ADMIN_AUTH_DISABLED: 'true' })).not.toThrow();
  });
});

describe('API geral', () => {
  it('health, openapi e 404', async () => {
    const ctx = await setup();
    expect((await ctx.request.get('/api/health')).body.status).toBe('ok');
    const h = await ctx.request.get('/api/health/recognition');
    expect(h.body).toMatchObject({ status: 'ok', model_name: 'sface', models_loaded: true });
    const spec = await ctx.request.get('/api/openapi.json');
    expect(spec.body.paths['/api/attendance']).toBeDefined();
    expect((await ctx.request.get('/api/nao-existe')).status).toBe(404);
  });

  it('JSON inválido → 400 sem ecoar o corpo', async () => {
    const ctx = await setup();
    const res = await ctx.request.post('/api/attendance').set('content-type', 'application/json').send('{"image_base64": SEGREDO');
    expect(res.status).toBe(400);
    expect(res.text).not.toContain('SEGREDO');
  });

  it('CORS restrito à origem do frontend', async () => {
    const ctx = await setup();
    const ok = await ctx.request.get('/api/health').set('Origin', 'http://localhost:5173');
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    const bad = await ctx.request.get('/api/health').set('Origin', 'http://evil.example');
    expect(bad.headers['access-control-allow-origin']).toBeUndefined();
  });
});
