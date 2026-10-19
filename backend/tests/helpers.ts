import supertest from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig, type Config } from '../src/config.js';
import { openDatabase, type DB } from '../src/database/db.js';
import { migrate } from '../src/database/migrator.js';
import type {
  EnrollResult,
  IdentifyParams,
  IdentifyResult,
  RecognitionClient,
  RecognitionHealth,
} from '../src/services/recognitionClient.js';

export const PASSWORD = 'senha-de-teste-123';
export const DIM = 128;

/** Imagem "JPEG" sintética: cabeçalho JPEG válido + marcador lido pelo FakeRecognition. */
export function fakeImage(marker: string): string {
  const buf = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from(`|${marker}|`)]);
  return `data:image/jpeg;base64,${buf.toString('base64')}`;
}

export function vectorFor(person: string): number[] {
  // Vetor determinístico por "pessoa": base one-hot + ruído pequeno.
  let seed = [...person].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32) * 2 - 1;
  return Array.from({ length: DIM }, () => rnd());
}

function cosine(a: number[], b: number[]) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! ** 2;
    nb += b[i]! ** 2;
  }
  return dot / Math.sqrt(na * nb);
}

/**
 * Serviço de reconhecimento falso. Marcadores de imagem:
 *  person:<nome>  → um rosto da pessoa <nome>
 *  noface | multi | blurry → rejeições técnicas
 */
export class FakeRecognition implements RecognitionClient {
  modelName = 'sface';
  modelVersion = '2021dec';
  dim = DIM;
  delayMs = 0;
  enrollCalls = 0;
  identifyCalls: IdentifyParams[] = [];
  /** Permite forçar uma resposta de identify (ex.: contrato quebrado, funcionário fora da galeria). */
  identifyOverride?: (p: IdentifyParams) => IdentifyResult;

  private marker(b64: string) {
    const text = Buffer.from(b64, 'base64').toString('latin1');
    return /\|(.+)\|/.exec(text)?.[1] ?? '';
  }

  private base() {
    return { model_name: this.modelName, model_version: this.modelVersion, embedding_dim: this.dim };
  }

  private rejection(marker: string): string | null {
    if (marker === 'noface') return 'no_face';
    if (marker === 'multi') return 'multiple_faces';
    if (marker === 'blurry') return 'blurry';
    return null;
  }

  async health(): Promise<RecognitionHealth> {
    return { status: 'ok', models_loaded: true, ...this.base(), detector: 'yunet-2023mar' };
  }

  async enroll(b64: string): Promise<EnrollResult> {
    this.enrollCalls++;
    const m = this.marker(b64);
    const reason = this.rejection(m);
    if (reason) return { ...this.base(), accepted: false, reason };
    const person = m.replace('person:', '');
    return { ...this.base(), accepted: true, embedding: vectorFor(person).slice(0, this.dim) };
  }

  async identify(p: IdentifyParams): Promise<IdentifyResult> {
    this.identifyCalls.push(p);
    if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
    if (this.identifyOverride) return this.identifyOverride(p);
    const base = { ...this.base(), threshold: p.threshold, ambiguity_margin: p.ambiguityMargin, candidates: [] };
    const m = this.marker(p.imageBase64);
    const reason = this.rejection(m);
    if (reason) return { ...base, matched: false, reason };
    const probe = vectorFor(m.replace('person:', ''));
    const scored = p.gallery
      .map((g) => ({ id: g.employee_id, s: cosine(probe, g.embedding) }))
      .sort((a, b) => b.s - a.s);
    const best = scored[0];
    if (!best || best.s < p.threshold) {
      return { ...base, matched: false, reason: 'no_match', similarity: best?.s ?? null };
    }
    return { ...base, matched: true, employee_id: best.id, similarity: best.s, second_best_similarity: scored[1]?.s };
  }
}

export class TestClock {
  constructor(public current = new Date('2026-10-17T12:00:00.000Z')) {}
  now = () => new Date(this.current);
  advance(seconds: number) {
    this.current = new Date(this.current.getTime() + seconds * 1000);
  }
}

export function testConfig(overrides: Record<string, string> = {}): Config {
  return loadConfig({
    NODE_ENV: 'test',
    DATABASE_PATH: ':memory:',
    ADMIN_PASSWORD: PASSWORD,
    ...overrides,
  });
}

export interface Ctx {
  db: DB;
  config: Config;
  recognition: FakeRecognition;
  clock: TestClock;
  request: ReturnType<typeof supertest>;
  token: string;
  auth: { Authorization: string };
}

export async function setup(
  opts: { config?: Record<string, string>; recognition?: RecognitionClient } = {},
): Promise<Ctx> {
  const db = openDatabase(':memory:');
  migrate(db);
  const config = testConfig(opts.config);
  const recognition = new FakeRecognition();
  const clock = new TestClock();
  const app = createApp({ db, config, recognition: opts.recognition ?? recognition, clock: clock.now });
  const request = supertest(app);
  const login = await request.post('/api/auth/login').send({ password: PASSWORD });
  const token = login.body.token as string;
  return { db, config, recognition, clock, request, token, auth: { Authorization: `Bearer ${token}` } };
}

export async function enroll(ctx: Ctx, name: string, code: string | null, person = name) {
  const res = await ctx.request
    .post('/api/employees')
    .set(ctx.auth)
    .send({ name, employee_code: code, image_base64: fakeImage(`person:${person}`) });
  if (res.status !== 201) throw new Error(`enroll falhou: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body as { id: number; name: string };
}

export const count = (db: DB, table: string) =>
  (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
