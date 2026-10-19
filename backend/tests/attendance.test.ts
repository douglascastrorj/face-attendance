import { describe, expect, it } from 'vitest';
import { count, enroll, fakeImage, setup } from './helpers.js';

const capture = (person: string) => ({ image_base64: fakeImage(`person:${person}`) });

describe('registro de ponto', () => {
  it('reconhece e registra com timestamp gerado pelo servidor (UTC)', async () => {
    const ctx = await setup();
    const e = await enroll(ctx, 'Maria Silva', 'M-1', 'maria');
    ctx.clock.current = new Date('2026-10-17T11:05:09.123Z');

    const res = await ctx.request.post('/api/attendance').send(capture('maria'));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      recorded_at: '2026-10-17T11:05:09.123Z',
      recorded_at_local: '17/10/2026, 08:05:09',
      timezone: 'America/Sao_Paulo',
      model_name: 'sface',
      model_version: '2021dec',
      employee: { id: e.id, name: 'Maria Silva', employee_code: 'M-1' },
    });
    expect(res.body.similarity_score).toBeGreaterThan(0.99);
    const row = ctx.db.prepare('SELECT * FROM time_records').get() as Record<string, unknown>;
    expect(row.recorded_at).toBe('2026-10-17T11:05:09.123Z');
  });

  it('envia ao reconhecimento somente a galeria ativa e o limiar configurado', async () => {
    const ctx = await setup({ config: { RECOGNITION_THRESHOLD: '0.5' } });
    await enroll(ctx, 'Ativo Um', null, 'a1');
    const off = await enroll(ctx, 'Inativo Dois', null, 'i2');
    await ctx.request.delete(`/api/employees/${off.id}`).set(ctx.auth);
    await ctx.request.post('/api/attendance').send(capture('a1'));
    const call = ctx.recognition.identifyCalls.at(-1)!;
    expect(call.threshold).toBe(0.5);
    expect(call.gallery.map((g) => g.employee_id)).not.toContain(off.id);
    expect(call.gallery).toHaveLength(1);
  });

  it('não aceita employee_id nem timestamp vindos do cliente', async () => {
    const ctx = await setup();
    const e = await enroll(ctx, 'Maria Silva', null, 'maria');
    for (const extra of [{ employee_id: e.id }, { recorded_at: '2020-01-01T00:00:00Z' }]) {
      const res = await ctx.request.post('/api/attendance').send({ ...capture('maria'), ...extra });
      expect(res.status).toBe(400);
    }
    expect(count(ctx.db, 'time_records')).toBe(0);
  });

  it('rejeita pessoa desconhecida sem gravar', async () => {
    const ctx = await setup();
    await enroll(ctx, 'Maria Silva', null, 'maria');
    const res = await ctx.request.post('/api/attendance').send(capture('desconhecido'));
    expect(res.status).toBe(422);
    expect(res.body.error).toMatchObject({ code: 'recognition_no_match', details: { reason: 'no_match' } });
    expect(count(ctx.db, 'time_records')).toBe(0);
  });

  it.each(['noface', 'multi', 'blurry'])('falha de captura (%s) não grava ponto', async (marker) => {
    const ctx = await setup();
    await enroll(ctx, 'Maria Silva', null, 'maria');
    const res = await ctx.request.post('/api/attendance').send({ image_base64: fakeImage(marker) });
    expect(res.status).toBe(422);
    expect(count(ctx.db, 'time_records')).toBe(0);
  });

  it('rejeita quando não há galeria ativa', async () => {
    const ctx = await setup();
    const res = await ctx.request.post('/api/attendance').send(capture('maria'));
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('recognition_empty_gallery');
  });

  it('funcionário desativado não é reconhecido nem registra', async () => {
    const ctx = await setup();
    const e = await enroll(ctx, 'Maria Silva', null, 'maria');
    await enroll(ctx, 'Outro Ativo', null, 'outro');
    await ctx.request.delete(`/api/employees/${e.id}`).set(ctx.auth).expect(200);
    const res = await ctx.request.post('/api/attendance').send(capture('maria'));
    expect(res.status).toBe(422);
    expect(count(ctx.db, 'time_records')).toBe(0);
  });

  it('rejeita funcionário desativado durante o reconhecimento (corrida)', async () => {
    const ctx = await setup();
    const e = await enroll(ctx, 'Maria Silva', null, 'maria');
    ctx.recognition.delayMs = 50;
    // .then() dispara a requisição (supertest é preguiçoso); desativa enquanto o "Python" processa.
    const pending = ctx.request.post('/api/attendance').send(capture('maria')).then((r) => r);
    while (ctx.recognition.identifyCalls.length === 0) await new Promise((r) => setTimeout(r, 2));
    ctx.db.prepare('UPDATE employees SET active = 0 WHERE id = ?').run(e.id);
    const res = await pending;
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('employee_inactive');
    expect(count(ctx.db, 'time_records')).toBe(0);
  });

  it('bloqueia duplicidade dentro do intervalo e libera depois', async () => {
    const ctx = await setup();
    await enroll(ctx, 'Maria Silva', null, 'maria');
    await ctx.request.post('/api/attendance').send(capture('maria')).expect(201);
    ctx.clock.advance(29);
    const dup = await ctx.request.post('/api/attendance').send(capture('maria'));
    expect(dup.status).toBe(409);
    expect(dup.body.error).toMatchObject({ code: 'duplicate_attendance', details: { retry_after_seconds: 1 } });
    ctx.clock.advance(1);
    await ctx.request.post('/api/attendance').send(capture('maria')).expect(201);
    expect(count(ctx.db, 'time_records')).toBe(2);
  });

  it('intervalo de duplicidade é configurável', async () => {
    const ctx = await setup({ config: { ATTENDANCE_DEDUP_SECONDS: '5' } });
    await enroll(ctx, 'Maria Silva', null, 'maria');
    await ctx.request.post('/api/attendance').send(capture('maria')).expect(201);
    ctx.clock.advance(6);
    await ctx.request.post('/api/attendance').send(capture('maria')).expect(201);
  });

  it('requisições concorrentes do mesmo funcionário geram um único registro', async () => {
    const ctx = await setup();
    await enroll(ctx, 'Maria Silva', null, 'maria');
    ctx.recognition.delayMs = 20;
    const results = await Promise.all(
      Array.from({ length: 8 }, () => ctx.request.post('/api/attendance').send(capture('maria'))),
    );
    const statuses = results.map((r) => r.status).sort();
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(7);
    expect(count(ctx.db, 'time_records')).toBe(1);
  });

  it('requisições concorrentes de funcionários diferentes são todas registradas', async () => {
    const ctx = await setup();
    for (const p of ['a', 'b', 'c']) await enroll(ctx, `Pessoa ${p}`, null, p);
    ctx.recognition.delayMs = 10;
    const results = await Promise.all(['a', 'b', 'c'].map((p) => ctx.request.post('/api/attendance').send(capture(p))));
    expect(results.every((r) => r.status === 201)).toBe(true);
    expect(count(ctx.db, 'time_records')).toBe(3);
  });

  describe('validação da resposta do Python pelo Node', () => {
    it('rejeita candidato fora da galeria ativa', async () => {
      const ctx = await setup();
      await enroll(ctx, 'Maria Silva', null, 'maria');
      ctx.recognition.identifyOverride = (p) => ({
        model_name: 'sface', model_version: '2021dec', embedding_dim: 128, threshold: p.threshold,
        ambiguity_margin: p.ambiguityMargin, candidates: [], matched: true, employee_id: 999, similarity: 0.9,
      });
      const res = await ctx.request.post('/api/attendance').send(capture('maria'));
      expect(res.status).toBe(502);
      expect(count(ctx.db, 'time_records')).toBe(0);
    });

    it('reaplica o limiar do Node mesmo se o Python indicar correspondência', async () => {
      const ctx = await setup();
      const e = await enroll(ctx, 'Maria Silva', null, 'maria');
      ctx.recognition.identifyOverride = (p) => ({
        model_name: 'sface', model_version: '2021dec', embedding_dim: 128, threshold: p.threshold,
        ambiguity_margin: p.ambiguityMargin, candidates: [], matched: true, employee_id: e.id, similarity: 0.1,
      });
      const res = await ctx.request.post('/api/attendance').send(capture('maria'));
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('recognition_no_match');
    });

    it('reaplica a regra de ambiguidade', async () => {
      const ctx = await setup();
      const e = await enroll(ctx, 'Maria Silva', null, 'maria');
      ctx.recognition.identifyOverride = (p) => ({
        model_name: 'sface', model_version: '2021dec', embedding_dim: 128, threshold: p.threshold,
        ambiguity_margin: p.ambiguityMargin, candidates: [], matched: true, employee_id: e.id,
        similarity: 0.6, second_best_similarity: 0.58,
      });
      expect((await ctx.request.post('/api/attendance').send(capture('maria'))).status).toBe(422);
    });

    it('rejeita resposta de modelo diferente do esperado', async () => {
      const ctx = await setup();
      await enroll(ctx, 'Maria Silva', null, 'maria');
      ctx.recognition.modelVersion = '2099jan';
      const res = await ctx.request.post('/api/attendance').send(capture('maria'));
      expect(res.status).toBe(502);
      expect(res.body.error.code).toBe('recognition_model_mismatch');
      expect(count(ctx.db, 'time_records')).toBe(0);
    });

    it('não envia embeddings de modelo incompatível na galeria', async () => {
      const ctx = await setup();
      const e = await enroll(ctx, 'Maria Silva', null, 'maria');
      ctx.db.prepare("UPDATE face_embeddings SET model_version = '2019old' WHERE employee_id = ?").run(e.id);
      const res = await ctx.request.post('/api/attendance').send(capture('maria'));
      expect(res.body.error.code).toBe('recognition_empty_gallery');
      const dash = await ctx.request.get('/api/dashboard').set(ctx.auth);
      expect(dash.body.incompatible_embeddings).toBe(1);
    });
  });

  it('POST /api/attendance/recognize identifica sem gravar e exige admin', async () => {
    const ctx = await setup();
    const e = await enroll(ctx, 'Maria Silva', null, 'maria');
    expect((await ctx.request.post('/api/attendance/recognize').send(capture('maria'))).status).toBe(401);
    const res = await ctx.request.post('/api/attendance/recognize').set(ctx.auth).send(capture('maria'));
    expect(res.status).toBe(200);
    expect(res.body.employee).toMatchObject({ id: e.id, name: 'Maria Silva' });
    expect(count(ctx.db, 'time_records')).toBe(0);
  });
});

describe('histórico', () => {
  async function seed() {
    const ctx = await setup();
    const a = await enroll(ctx, 'Ana Alves', 'A-1', 'ana');
    const b = await enroll(ctx, 'Bruno Braga', 'B-1', 'bruno');
    // 16/10 23:30 em São Paulo = 17/10 02:30 UTC
    const times = ['2026-10-17T02:30:00.000Z', '2026-10-17T12:00:00.000Z', '2026-10-17T20:00:00.000Z', '2026-10-18T03:30:00.000Z'];
    for (const t of times) {
      ctx.clock.current = new Date(t);
      await ctx.request.post('/api/attendance').send(capture('ana')).expect(201);
      ctx.clock.advance(60);
      await ctx.request.post('/api/attendance').send(capture('bruno')).expect(201);
    }
    // Volta o relógio para dentro da validade da sessão administrativa (8 h).
    ctx.clock.current = new Date('2026-10-17T13:00:00.000Z');
    return { ctx, a, b };
  }

  it('lista mais recentes primeiro com paginação', async () => {
    const { ctx } = await seed();
    const p1 = await ctx.request.get('/api/attendance?page=1&page_size=3').set(ctx.auth);
    expect(p1.body).toMatchObject({ total: 8, total_pages: 3, page: 1, page_size: 3 });
    const all = [...p1.body.items];
    for (const page of [2, 3]) {
      all.push(...(await ctx.request.get(`/api/attendance?page=${page}&page_size=3`).set(ctx.auth)).body.items);
    }
    const stamps = all.map((r: { recorded_at: string }) => r.recorded_at);
    expect(stamps).toEqual([...stamps].sort().reverse());
    expect(all).toHaveLength(8);
  });

  it('filtra por funcionário e por intervalo de datas no fuso de São Paulo', async () => {
    const { ctx, a } = await seed();
    const byEmp = await ctx.request.get(`/api/attendance?employee_id=${a.id}`).set(ctx.auth);
    expect(byEmp.body.total).toBe(4);
    expect(byEmp.body.items.every((r: { employee: { id: number } }) => r.employee.id === a.id)).toBe(true);

    const day17 = await ctx.request.get('/api/attendance?from=2026-10-17&to=2026-10-17').set(ctx.auth);
    // Dia 17/10 local = [17T03:00Z, 18T03:00Z): 12:00Z e 20:00Z de ambos (02:30Z é dia 16; 18T03:30Z é dia 18).
    expect(day17.body.items.map((r: { recorded_at_local: string }) => r.recorded_at_local.slice(0, 10))).toEqual(
      Array(4).fill('17/10/2026'),
    );

    const day16 = await ctx.request.get(`/api/attendance?from=2026-10-16&to=2026-10-16&employee_id=${a.id}`).set(ctx.auth);
    expect(day16.body.items.map((r: { recorded_at_local: string }) => r.recorded_at_local)).toEqual(['16/10/2026, 23:30:00']);

    const bad = await ctx.request.get('/api/attendance?from=2026-10-18&to=2026-10-01').set(ctx.auth);
    expect(bad.status).toBe(400);
  });

  it('preserva histórico consultável após desativação', async () => {
    const { ctx, a } = await seed();
    await ctx.request.delete(`/api/employees/${a.id}`).set(ctx.auth).expect(200);
    const res = await ctx.request.get(`/api/attendance?employee_id=${a.id}`).set(ctx.auth);
    expect(res.body.total).toBe(4);
    expect(res.body.items[0].employee).toMatchObject({ name: 'Ana Alves', employee_code: 'A-1', active: false });
    const one = await ctx.request.get(`/api/attendance/${res.body.items[0].id}`).set(ctx.auth);
    expect(one.status).toBe(200);
    expect(count(ctx.db, 'face_embeddings')).toBe(1);
  });

  it('histórico não pode ser apagado via exclusão do funcionário no banco (FK RESTRICT)', async () => {
    const { ctx, a } = await seed();
    expect(() => ctx.db.prepare('DELETE FROM employees WHERE id = ?').run(a.id)).toThrow(/FOREIGN KEY/);
  });

  it('dashboard conta registros do dia local', async () => {
    const { ctx } = await seed();
    ctx.clock.current = new Date('2026-10-17T15:00:00.000Z');
    const res = await ctx.request.get('/api/dashboard').set(ctx.auth);
    expect(res.body).toMatchObject({ date: '2026-10-17', active_employees: 2, records_today: 4 });
    expect(res.body.recent).toHaveLength(8);
  });
});
