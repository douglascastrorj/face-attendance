import type { DB } from '../database/db.js';

export interface EmployeeRow {
  id: number;
  name: string;
  employee_code: string | null;
  active: 0 | 1;
  created_at: string;
  updated_at: string;
  deactivated_at: string | null;
}

export interface EmployeeListFilter {
  status: 'active' | 'inactive' | 'all';
  name?: string;
  code?: string;
  limit: number;
  offset: number;
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export class EmployeesRepository {
  constructor(private readonly db: DB) {}

  findById(id: number): EmployeeRow | undefined {
    return this.db.prepare('SELECT * FROM employees WHERE id = ?').get(id) as EmployeeRow | undefined;
  }

  findByCode(code: string): EmployeeRow | undefined {
    return this.db.prepare('SELECT * FROM employees WHERE employee_code = ?').get(code) as EmployeeRow | undefined;
  }

  insert(name: string, code: string | null, now: string): number {
    const r = this.db
      .prepare('INSERT INTO employees (name, employee_code, active, created_at, updated_at) VALUES (?, ?, 1, ?, ?)')
      .run(name, code, now, now);
    return Number(r.lastInsertRowid);
  }

  deactivate(id: number, now: string): void {
    this.db
      .prepare('UPDATE employees SET active = 0, deactivated_at = ?, updated_at = ? WHERE id = ? AND active = 1')
      .run(now, now, id);
  }

  list(f: EmployeeListFilter): { items: EmployeeRow[]; total: number } {
    const where: string[] = [];
    const params: unknown[] = [];
    if (f.status !== 'all') {
      where.push('active = ?');
      params.push(f.status === 'active' ? 1 : 0);
    }
    if (f.name) {
      where.push("name LIKE ? ESCAPE '\\'");
      params.push(`%${escapeLike(f.name)}%`);
    }
    if (f.code) {
      where.push("employee_code LIKE ? ESCAPE '\\'");
      params.push(`%${escapeLike(f.code)}%`);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = (this.db.prepare(`SELECT COUNT(*) AS n FROM employees ${clause}`).get(...params) as { n: number }).n;
    const items = this.db
      .prepare(`SELECT * FROM employees ${clause} ORDER BY name COLLATE NOCASE, id LIMIT ? OFFSET ?`)
      .all(...params, f.limit, f.offset) as EmployeeRow[];
    return { items, total };
  }

  countActive(): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM employees WHERE active = 1').get() as { n: number }).n;
  }
}
