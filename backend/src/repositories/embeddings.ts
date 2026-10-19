import type { DB } from '../database/db.js';

export interface GalleryEntry {
  employee_id: number;
  embedding: number[];
  model_name: string;
  model_version: string;
}

export function serializeEmbedding(values: number[]): Buffer {
  const buf = Buffer.alloc(values.length * 4);
  values.forEach((v, i) => buf.writeFloatLE(v, i * 4));
  return buf;
}

export function deserializeEmbedding(buf: Buffer): number[] {
  const out = new Array<number>(buf.length / 4);
  for (let i = 0; i < out.length; i++) out[i] = buf.readFloatLE(i * 4);
  return out;
}

/** Acesso aos dados biométricos. Nenhum método daqui deve ter o resultado exposto pela API pública. */
export class EmbeddingsRepository {
  constructor(private readonly db: DB) {}

  insert(employeeId: number, embedding: number[], modelName: string, modelVersion: string, now: string): number {
    const r = this.db
      .prepare(
        `INSERT INTO face_embeddings (employee_id, embedding, embedding_dim, model_name, model_version, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(employeeId, serializeEmbedding(embedding), embedding.length, modelName, modelVersion, now);
    return Number(r.lastInsertRowid);
  }

  /** Galeria ativa: somente funcionários ativos e embeddings do modelo/dimensão esperados. */
  activeGallery(modelName: string, modelVersion: string, dim: number): GalleryEntry[] {
    const rows = this.db
      .prepare(
        `SELECT fe.employee_id, fe.embedding, fe.model_name, fe.model_version
           FROM face_embeddings fe
           JOIN employees e ON e.id = fe.employee_id
          WHERE e.active = 1 AND fe.model_name = ? AND fe.model_version = ? AND fe.embedding_dim = ?
          ORDER BY fe.employee_id, fe.id`,
      )
      .all(modelName, modelVersion, dim) as Array<{
      employee_id: number;
      embedding: Buffer;
      model_name: string;
      model_version: string;
    }>;
    return rows.map((r) => ({ ...r, embedding: deserializeEmbedding(r.embedding) }));
  }

  /** Embeddings de modelos diferentes do atual (precisam ser regenerados com novas capturas). */
  countIncompatible(modelName: string, modelVersion: string): number {
    return (
      this.db
        .prepare('SELECT COUNT(*) AS n FROM face_embeddings WHERE NOT (model_name = ? AND model_version = ?)')
        .get(modelName, modelVersion) as { n: number }
    ).n;
  }

  countForEmployee(employeeId: number): number {
    return (
      this.db.prepare('SELECT COUNT(*) AS n FROM face_embeddings WHERE employee_id = ?').get(employeeId) as {
        n: number;
      }
    ).n;
  }

  /** Metadados (sem o vetor) das amostras biométricas de um funcionário. */
  metadataForEmployee(employeeId: number) {
    return this.db
      .prepare(
        'SELECT id, embedding_dim, model_name, model_version, created_at FROM face_embeddings WHERE employee_id = ? ORDER BY id',
      )
      .all(employeeId) as Array<{
      id: number;
      embedding_dim: number;
      model_name: string;
      model_version: string;
      created_at: string;
    }>;
  }

  deleteForEmployee(employeeId: number): number {
    return this.db.prepare('DELETE FROM face_embeddings WHERE employee_id = ?').run(employeeId).changes;
  }
}
