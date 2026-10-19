import type { Config } from '../config.js';
import { flushDeletedPages, type DB } from '../database/db.js';
import { AppError, notFound } from '../errors.js';
import { EmbeddingsRepository } from '../repositories/embeddings.js';
import { EmployeesRepository, type EmployeeListFilter, type EmployeeRow } from '../repositories/employees.js';
import { formatLocal, type Clock } from '../time.js';
import { validateImageBase64, rejectionMessage } from './imageValidation.js';
import type { RecognitionClient } from './recognitionClient.js';

export interface EmployeeDTO {
  id: number;
  name: string;
  employee_code: string | null;
  active: boolean;
  created_at: string;
  created_at_local: string;
  updated_at: string;
  deactivated_at: string | null;
}

export class EmployeeService {
  private readonly employees: EmployeesRepository;
  private readonly embeddings: EmbeddingsRepository;

  constructor(
    private readonly db: DB,
    private readonly cfg: Config,
    private readonly recognition: RecognitionClient,
    private readonly clock: Clock,
  ) {
    this.employees = new EmployeesRepository(db);
    this.embeddings = new EmbeddingsRepository(db);
  }

  toDTO(e: EmployeeRow): EmployeeDTO {
    return {
      id: e.id,
      name: e.name,
      employee_code: e.employee_code,
      active: e.active === 1,
      created_at: e.created_at,
      created_at_local: formatLocal(e.created_at, this.cfg.DISPLAY_TIMEZONE),
      updated_at: e.updated_at,
      deactivated_at: e.deactivated_at,
    };
  }

  list(filter: EmployeeListFilter) {
    const { items, total } = this.employees.list(filter);
    return { items: items.map((e) => this.toDTO(e)), total };
  }

  get(id: number) {
    const e = this.employees.findById(id);
    if (!e) throw notFound('Funcionário');
    // Metadados da biometria apenas (modelo, data). O vetor nunca é exposto.
    const biometrics = this.embeddings.metadataForEmployee(id);
    return { ...this.toDTO(e), biometric_samples: biometrics };
  }

  async enroll(input: { name: string; employee_code?: string | null; image_base64: string }) {
    const name = input.name.trim().replace(/\s+/g, ' ');
    const code = input.employee_code?.trim() || null;
    const image = validateImageBase64(input.image_base64, this.cfg.MAX_IMAGE_BYTES);

    // Falha rápida antes de processar a biometria. A unicidade definitiva é garantida pelo índice no banco.
    if (code && this.employees.findByCode(code)) throw duplicateCode(code);

    const result = await this.recognition.enroll(image);
    if (!result.accepted) {
      throw new AppError(422, `face_${result.reason ?? 'rejected'}`, rejectionMessage(result.reason), {
        reason: result.reason ?? null,
      });
    }
    this.assertCompatibleEmbedding(result.model_name, result.model_version, result.embedding ?? []);
    const embedding = result.embedding!;

    const now = this.clock().toISOString();
    try {
      const id = this.db.transaction(() => {
        const employeeId = this.employees.insert(name, code, now);
        this.embeddings.insert(employeeId, embedding, result.model_name, result.model_version, now);
        return employeeId;
      })();
      return this.get(id);
    } catch (err) {
      if ((err as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE' && code) throw duplicateCode(code);
      throw err;
    }
  }

  /**
   * Desativa o funcionário e exclui seus dados biométricos na mesma transação.
   * O histórico de ponto é preservado (FK com ON DELETE RESTRICT; o funcionário não é removido).
   */
  deactivate(id: number) {
    const existing = this.employees.findById(id);
    if (!existing) throw notFound('Funcionário');
    const now = this.clock().toISOString();
    const deleted = this.db.transaction(() => {
      this.employees.deactivate(id, now);
      return this.embeddings.deleteForEmployee(id);
    })();
    if (deleted > 0) flushDeletedPages(this.db);
    return { employee: this.get(id), biometric_samples_deleted: deleted };
  }

  private assertCompatibleEmbedding(modelName: string, modelVersion: string, embedding: number[]) {
    if (modelName !== this.cfg.RECOGNITION_MODEL_NAME || modelVersion !== this.cfg.RECOGNITION_MODEL_VERSION) {
      throw new AppError(
        502,
        'recognition_model_mismatch',
        `Serviço de reconhecimento usa ${modelName}/${modelVersion}; esperado ${this.cfg.RECOGNITION_MODEL_NAME}/${this.cfg.RECOGNITION_MODEL_VERSION}`,
      );
    }
    if (embedding.length !== this.cfg.RECOGNITION_EMBEDDING_DIM || !embedding.every(Number.isFinite)) {
      throw new AppError(502, 'recognition_invalid_embedding', 'Embedding recebido com dimensão ou valores inválidos');
    }
    if (embedding.every((v) => v === 0)) {
      throw new AppError(502, 'recognition_invalid_embedding', 'Embedding recebido é nulo');
    }
  }
}

const duplicateCode = (code: string) =>
  new AppError(409, 'duplicate_employee_code', `Já existe um funcionário com o identificador "${code}"`);
