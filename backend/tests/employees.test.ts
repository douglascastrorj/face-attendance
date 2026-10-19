import { describe, expect, it } from 'vitest';
import { count, enroll, fakeImage, setup } from './helpers.js';

describe('autenticação administrativa', () => {
  it('exige token nas rotas administrativas', async () => {
    const ctx = await setup();
    expect((await ctx.request.get('/api/employees')).status).toBe(401);
    expect((await ctx.request.get('/api/employees').set({ Authorization: 'Bearer xyz' })).status).toBe(401);
    expect((await ctx.request.get('/api/employees').set(ctx.auth)).status).toBe(200);
  });

  it('rejeita senha errada e limita tentativas', async () => {
    const ctx = await setup();
    for (let i = 0; i < 5; i++) {
      expect((await ctx.request.post('/api/auth/login').send({ password: 'errada' })).status).toBe(401);
    }
    expect((await ctx.request.post('/api/auth/login').send({ password: 'errada' })).status).toBe(429);
  });

  it('logout invalida o token', async () => {
    const ctx = await setup();
    await ctx.request.post('/api/auth/logout').set(ctx.auth).expect(204);
    expect((await ctx.request.get('/api/employees').set(ctx.auth)).status).toBe(401);
  });
});

describe('cadastro de funcionários', () => {
  it('cadastra funcionário válido e persiste embedding com metadados do modelo', async () => {
    const ctx = await setup();
    const res = await ctx.request
      .post('/api/employees')
      .set(ctx.auth)
      .send({ name: '  Maria   da Silva ', employee_code: 'F-001', image_base64: fakeImage('person:maria') });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Maria da Silva', employee_code: 'F-001', active: true });
    expect(JSON.stringify(res.body)).not.toContain('embedding"');
    expect(res.body.biometric_samples).toHaveLength(1);
    expect(res.body.biometric_samples[0]).toMatchObject({ model_name: 'sface', model_version: '2021dec', embedding_dim: 128 });

    const row = ctx.db.prepare('SELECT * FROM face_embeddings').get() as Record<string, unknown>;
    expect(row).toMatchObject({ employee_id: res.body.id, model_name: 'sface', model_version: '2021dec', embedding_dim: 128 });
    expect((row.embedding as Buffer).length).toBe(128 * 4);
    expect(row.created_at).toMatch(/Z$/);
  });

  it('rejeita imagem sem rosto sem criar funcionário', async () => {
    const ctx = await setup();
    const res = await ctx.request
      .post('/api/employees')
      .set(ctx.auth)
      .send({ name: 'Sem Rosto', image_base64: fakeImage('noface') });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatchObject({ code: 'face_no_face', details: { reason: 'no_face' } });
    expect(count(ctx.db, 'employees')).toBe(0);
    expect(count(ctx.db, 'face_embeddings')).toBe(0);
  });

  it('rejeita imagem com múltiplos rostos', async () => {
    const ctx = await setup();
    const res = await ctx.request
      .post('/api/employees')
      .set(ctx.auth)
      .send({ name: 'Dois Rostos', image_base64: fakeImage('multi') });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('face_multiple_faces');
    expect(count(ctx.db, 'employees')).toBe(0);
  });

  it.each([
    ['base64 inválido', 'isto não é base64 %%%'],
    ['não é imagem', `data:image/png;base64,${Buffer.from('%PDF-1.7 documento').toString('base64')}`],
    ['mime não suportado', `data:image/gif;base64,${Buffer.from('GIF89a').toString('base64')}`],
  ])('rejeita imagem inválida (%s) sem chamar o reconhecimento', async (_label, image) => {
    const ctx = await setup();
    const res = await ctx.request.post('/api/employees').set(ctx.auth).send({ name: 'Fulano Teste', image_base64: image });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_image');
    expect(ctx.recognition.enrollCalls).toBe(0);
  });

  it('rejeita imagem acima do limite', async () => {
    const ctx = await setup({ config: { MAX_IMAGE_BYTES: '1024' } });
    const big = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(4000)]).toString('base64');
    const res = await ctx.request.post('/api/employees').set(ctx.auth).send({ name: 'Fulano Teste', image_base64: big });
    expect(res.status).toBe(413);
  });

  it('impede identificador interno duplicado', async () => {
    const ctx = await setup();
    await enroll(ctx, 'Ana Souza', 'F-100');
    const res = await ctx.request
      .post('/api/employees')
      .set(ctx.auth)
      .send({ name: 'Outra Ana', employee_code: 'F-100', image_base64: fakeImage('person:outra') });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('duplicate_employee_code');
    expect(ctx.recognition.enrollCalls).toBe(1);
    expect(count(ctx.db, 'employees')).toBe(1);
  });

  it('permite vários funcionários sem identificador interno', async () => {
    const ctx = await setup();
    await enroll(ctx, 'Sem Codigo Um', null);
    await enroll(ctx, 'Sem Codigo Dois', null);
    expect(count(ctx.db, 'employees')).toBe(2);
  });

  it.each([
    [{ employee_code: 'X', image_base64: fakeImage('person:a') }, 'name'],
    [{ name: 'Nome Completo' }, 'image_base64'],
    [{ name: 'ab', image_base64: fakeImage('person:a') }, 'name'],
  ])('não permite cadastro incompleto %#', async (body, field) => {
    const ctx = await setup();
    const res = await ctx.request.post('/api/employees').set(ctx.auth).send(body);
    expect(res.status).toBe(400);
    expect(res.body.error.details.fields.map((f: { field: string }) => f.field)).toContain(field);
  });

  it('rejeita embedding com dimensão incorreta sem persistir nada', async () => {
    const ctx = await setup();
    ctx.recognition.dim = 64;
    const res = await ctx.request
      .post('/api/employees')
      .set(ctx.auth)
      .send({ name: 'Dimensao Errada', image_base64: fakeImage('person:x') });
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('recognition_invalid_embedding');
    expect(count(ctx.db, 'employees')).toBe(0);
  });

  it('rejeita embedding de versão de modelo incompatível', async () => {
    const ctx = await setup();
    ctx.recognition.modelVersion = '2099jan';
    const res = await ctx.request
      .post('/api/employees')
      .set(ctx.auth)
      .send({ name: 'Modelo Novo', image_base64: fakeImage('person:x') });
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('recognition_model_mismatch');
    expect(count(ctx.db, 'employees')).toBe(0);
  });
});

describe('listagem, consulta e desativação', () => {
  it('lista ativos por padrão, busca por nome e por identificador', async () => {
    const ctx = await setup();
    await enroll(ctx, 'Carlos Pereira', 'C-1');
    await enroll(ctx, 'Beatriz Lima', 'B-2');
    const inactive = await enroll(ctx, 'Carla Inativa', 'C-3');
    await ctx.request.delete(`/api/employees/${inactive.id}`).set(ctx.auth).expect(200);

    const all = await ctx.request.get('/api/employees').set(ctx.auth);
    expect(all.body.items.map((e: { name: string }) => e.name)).toEqual(['Beatriz Lima', 'Carlos Pereira']);

    const byName = await ctx.request.get('/api/employees?status=all&name=car').set(ctx.auth);
    expect(byName.body.items.map((e: { name: string }) => e.name)).toEqual(['Carla Inativa', 'Carlos Pereira']);

    const byCode = await ctx.request.get('/api/employees?code=B-').set(ctx.auth);
    expect(byCode.body.total).toBe(1);

    const inactiveList = await ctx.request.get('/api/employees?status=inactive').set(ctx.auth);
    expect(inactiveList.body.items[0]).toMatchObject({ name: 'Carla Inativa', active: false });
  });

  it('busca não interpreta curingas do LIKE', async () => {
    const ctx = await setup();
    await enroll(ctx, 'Pessoa Comum', null);
    const res = await ctx.request.get('/api/employees?name=%25').set(ctx.auth);
    expect(res.body.total).toBe(0);
  });

  it('consulta funcionário e retorna 404 para inexistente', async () => {
    const ctx = await setup();
    const e = await enroll(ctx, 'Daniel Costa', 'D-1');
    const res = await ctx.request.get(`/api/employees/${e.id}`).set(ctx.auth);
    expect(res.body).toMatchObject({ id: e.id, name: 'Daniel Costa' });
    expect((await ctx.request.get('/api/employees/9999').set(ctx.auth)).status).toBe(404);
    expect((await ctx.request.get('/api/employees/abc').set(ctx.auth)).status).toBe(400);
  });

  it('desativação exclui embeddings e é idempotente', async () => {
    const ctx = await setup();
    const e = await enroll(ctx, 'Eduarda Rocha', 'E-1');
    const keep = await enroll(ctx, 'Fabio Nunes', 'F-1');
    const res = await ctx.request.delete(`/api/employees/${e.id}`).set(ctx.auth);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ biometric_samples_deleted: 1, employee: { active: false, biometric_samples: [] } });
    expect(res.body.employee.deactivated_at).toBeTruthy();
    const rows = ctx.db.prepare('SELECT employee_id FROM face_embeddings').all() as { employee_id: number }[];
    expect(rows).toEqual([{ employee_id: keep.id }]);

    const again = await ctx.request.delete(`/api/employees/${e.id}`).set(ctx.auth);
    expect(again.body.biometric_samples_deleted).toBe(0);
  });

  it('banco usa secure_delete para não deixar vetores em páginas livres', async () => {
    const ctx = await setup();
    expect(ctx.db.pragma('secure_delete', { simple: true })).toBe(1);
  });
});
