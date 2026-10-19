-- 001: esquema inicial. Timestamps em ISO 8601 UTC (ex.: 2026-10-17T12:34:56.789Z).

CREATE TABLE employees (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT    NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  employee_code  TEXT    NULL CHECK (employee_code IS NULL OR length(trim(employee_code)) BETWEEN 1 AND 64),
  active         INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at     TEXT    NOT NULL,
  updated_at     TEXT    NOT NULL,
  deactivated_at TEXT    NULL
);

-- Unicidade do identificador interno apenas quando preenchido.
CREATE UNIQUE INDEX ux_employees_employee_code ON employees (employee_code) WHERE employee_code IS NOT NULL;
CREATE INDEX ix_employees_active_name ON employees (active, name);

-- Dados biométricos segregados em tabela própria. Apagados (DELETE) quando o funcionário é desativado.
CREATE TABLE face_embeddings (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id   INTEGER NOT NULL REFERENCES employees (id) ON DELETE CASCADE,
  embedding     BLOB    NOT NULL,              -- float32 little-endian
  embedding_dim INTEGER NOT NULL CHECK (embedding_dim > 0),
  model_name    TEXT    NOT NULL,
  model_version TEXT    NOT NULL,
  created_at    TEXT    NOT NULL,
  CHECK (length(embedding) = embedding_dim * 4)
);

CREATE INDEX ix_face_embeddings_employee ON face_embeddings (employee_id);
CREATE INDEX ix_face_embeddings_model ON face_embeddings (model_name, model_version);

-- Histórico de ponto: nunca apagado automaticamente; RESTRICT impede remover funcionário com histórico.
CREATE TABLE time_records (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id      INTEGER NOT NULL REFERENCES employees (id) ON DELETE RESTRICT,
  recorded_at      TEXT    NOT NULL,
  similarity_score REAL    NOT NULL,
  model_name       TEXT    NOT NULL,
  model_version    TEXT    NOT NULL,
  created_at       TEXT    NOT NULL
);

CREATE INDEX ix_time_records_employee_recorded ON time_records (employee_id, recorded_at DESC);
CREATE INDEX ix_time_records_recorded ON time_records (recorded_at DESC);
