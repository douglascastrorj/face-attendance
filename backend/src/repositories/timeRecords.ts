import type { DB } from '../database/db.js';

export interface TimeRecordRow {
  id: number;
  employee_id: number;
  recorded_at: string;
  similarity_score: number;
  model_name: string;
  model_version: string;
  created_at: string;
  employee_name: string;
  employee_code: string | null;
  employee_active: 0 | 1;
}

export interface TimeRecordFilter {
  employeeId?: number;
  fromUtc?: string;
  toUtcExclusive?: string;
  limit: number;
  offset: number;
}

const SELECT = `SELECT tr.*, e.name AS employee_name, e.employee_code, e.active AS employee_active
                  FROM time_records tr JOIN employees e ON e.id = tr.employee_id`;

export class TimeRecordsRepository {
  constructor(private readonly db: DB) {}

  insert(r: {
    employeeId: number;
    recordedAt: string;
    similarity: number;
    modelName: string;
    modelVersion: string;
  }): number {
    const res = this.db
      .prepare(
        `INSERT INTO time_records (employee_id, recorded_at, similarity_score, model_name, model_version, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(r.employeeId, r.recordedAt, r.similarity, r.modelName, r.modelVersion, r.recordedAt);
    return Number(res.lastInsertRowid);
  }

  lastForEmployee(employeeId: number): { recorded_at: string } | undefined {
    return this.db
      .prepare('SELECT recorded_at FROM time_records WHERE employee_id = ? ORDER BY recorded_at DESC LIMIT 1')
      .get(employeeId) as { recorded_at: string } | undefined;
  }

  findById(id: number): TimeRecordRow | undefined {
    return this.db.prepare(`${SELECT} WHERE tr.id = ?`).get(id) as TimeRecordRow | undefined;
  }

  list(f: TimeRecordFilter): { items: TimeRecordRow[]; total: number } {
    const where: string[] = [];
    const params: unknown[] = [];
    if (f.employeeId !== undefined) {
      where.push('tr.employee_id = ?');
      params.push(f.employeeId);
    }
    if (f.fromUtc) {
      where.push('tr.recorded_at >= ?');
      params.push(f.fromUtc);
    }
    if (f.toUtcExclusive) {
      where.push('tr.recorded_at < ?');
      params.push(f.toUtcExclusive);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = (
      this.db.prepare(`SELECT COUNT(*) AS n FROM time_records tr ${clause}`).get(...params) as { n: number }
    ).n;
    const items = this.db
      .prepare(`${SELECT} ${clause} ORDER BY tr.recorded_at DESC, tr.id DESC LIMIT ? OFFSET ?`)
      .all(...params, f.limit, f.offset) as TimeRecordRow[];
    return { items, total };
  }

  countBetween(fromUtc: string, toUtcExclusive: string): number {
    return (
      this.db
        .prepare('SELECT COUNT(*) AS n FROM time_records WHERE recorded_at >= ? AND recorded_at < ?')
        .get(fromUtc, toUtcExclusive) as { n: number }
    ).n;
  }

  deleteOlderThan(cutoffUtc: string): number {
    return this.db.prepare('DELETE FROM time_records WHERE recorded_at < ?').run(cutoffUtc).changes;
  }
}
