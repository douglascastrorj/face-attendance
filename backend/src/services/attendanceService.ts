import type { Config } from '../config.js';
import type { DB } from '../database/db.js';
import { AppError, notFound } from '../errors.js';
import { logger } from '../logger.js';
import { EmbeddingsRepository } from '../repositories/embeddings.js';
import { EmployeesRepository } from '../repositories/employees.js';
import { TimeRecordsRepository, type TimeRecordRow } from '../repositories/timeRecords.js';
import { addDays, formatLocal, localDate, localRangeToUtc, startOfLocalDayUtc, type Clock } from '../time.js';
import { rejectionMessage, validateImageBase64 } from './imageValidation.js';
import type { IdentifyResult, RecognitionClient } from './recognitionClient.js';

export interface RecognitionOutcome {
  employee: { id: number; name: string; employee_code: string | null };
  similarity: number;
  model_name: string;
  model_version: string;
}

export class AttendanceService {
  private readonly employees: EmployeesRepository;
  private readonly embeddings: EmbeddingsRepository;
  private readonly records: TimeRecordsRepository;

  constructor(
    private readonly db: DB,
    private readonly cfg: Config,
    private readonly recognition: RecognitionClient,
    private readonly clock: Clock,
  ) {
    this.employees = new EmployeesRepository(db);
    this.embeddings = new EmbeddingsRepository(db);
    this.records = new TimeRecordsRepository(db);
  }

  /** Identifica o funcionário pela face. Não grava nada. Lança AppError em qualquer rejeição. */
  async recognize(imageInput: string): Promise<RecognitionOutcome> {
    const image = validateImageBase64(imageInput, this.cfg.MAX_IMAGE_BYTES);
    const { RECOGNITION_MODEL_NAME: modelName, RECOGNITION_MODEL_VERSION: modelVersion } = this.cfg;
    const gallery = this.embeddings.activeGallery(modelName, modelVersion, this.cfg.RECOGNITION_EMBEDDING_DIM);
    if (gallery.length === 0) {
      throw new AppError(422, 'recognition_empty_gallery', rejectionMessage('empty_gallery'), {
        reason: 'empty_gallery',
      });
    }

    const result = await this.recognition.identify({
      imageBase64: image,
      gallery,
      threshold: this.cfg.RECOGNITION_THRESHOLD,
      ambiguityMargin: this.cfg.RECOGNITION_AMBIGUITY_MARGIN,
    });
    const galleryIds = new Set(gallery.map((g) => g.employee_id));
    const accepted = this.validateIdentifyResult(result, galleryIds);

    const employee = this.employees.findById(accepted.employeeId);
    if (!employee || employee.active !== 1) {
      throw new AppError(403, 'employee_inactive', 'Funcionário inativo: registro não permitido');
    }
    return {
      employee: { id: employee.id, name: employee.name, employee_code: employee.employee_code },
      similarity: accepted.similarity,
      model_name: result.model_name,
      model_version: result.model_version,
    };
  }

  /** Reconhece e registra o ponto. O horário oficial é gerado aqui, no servidor. */
  async register(imageInput: string) {
    const outcome = await this.recognize(imageInput);

    // Transação IMMEDIATE: obtém o lock de escrita antes de ler, serializando requisições concorrentes.
    const insert = this.db.transaction(() => {
      const employee = this.employees.findById(outcome.employee.id);
      if (!employee || employee.active !== 1) {
        // Pode ter sido desativado enquanto o reconhecimento acontecia.
        throw new AppError(403, 'employee_inactive', 'Funcionário inativo: registro não permitido');
      }
      const now = this.clock();
      const last = this.records.lastForEmployee(employee.id);
      if (last && this.cfg.ATTENDANCE_DEDUP_SECONDS > 0) {
        const elapsed = (now.getTime() - Date.parse(last.recorded_at)) / 1000;
        if (elapsed < this.cfg.ATTENDANCE_DEDUP_SECONDS) {
          throw new AppError(
            409,
            'duplicate_attendance',
            `Ponto já registrado há ${Math.max(0, Math.floor(elapsed))} s. Aguarde antes de registrar novamente.`,
            { retry_after_seconds: Math.ceil(this.cfg.ATTENDANCE_DEDUP_SECONDS - elapsed), last_recorded_at: last.recorded_at },
          );
        }
      }
      return this.records.insert({
        employeeId: employee.id,
        recordedAt: now.toISOString(),
        similarity: outcome.similarity,
        modelName: outcome.model_name,
        modelVersion: outcome.model_version,
      });
    });
    const id = insert.immediate();
    logger.info('Ponto registrado', { record_id: id, employee_id: outcome.employee.id });
    return this.get(id);
  }

  get(id: number) {
    const row = this.records.findById(id);
    if (!row) throw notFound('Registro');
    return this.toDTO(row);
  }

  list(q: { employeeId?: number; from?: string; to?: string; page: number; pageSize: number }) {
    const range = localRangeToUtc(q.from, q.to, this.cfg.DISPLAY_TIMEZONE);
    const { items, total } = this.records.list({
      employeeId: q.employeeId,
      ...range,
      limit: q.pageSize,
      offset: (q.page - 1) * q.pageSize,
    });
    return {
      items: items.map((r) => this.toDTO(r)),
      page: q.page,
      page_size: q.pageSize,
      total,
      total_pages: Math.max(1, Math.ceil(total / q.pageSize)),
    };
  }

  dashboard() {
    const tz = this.cfg.DISPLAY_TIMEZONE;
    const today = localDate(this.clock(), tz);
    const from = startOfLocalDayUtc(today, tz).toISOString();
    const to = startOfLocalDayUtc(addDays(today, 1), tz).toISOString();
    return {
      date: today,
      timezone: tz,
      active_employees: this.employees.countActive(),
      records_today: this.records.countBetween(from, to),
      recent: this.records.list({ limit: 10, offset: 0 }).items.map((r) => this.toDTO(r)),
      incompatible_embeddings: this.embeddings.countIncompatible(
        this.cfg.RECOGNITION_MODEL_NAME,
        this.cfg.RECOGNITION_MODEL_VERSION,
      ),
    };
  }

  toDTO(r: TimeRecordRow) {
    return {
      id: r.id,
      recorded_at: r.recorded_at,
      recorded_at_local: formatLocal(r.recorded_at, this.cfg.DISPLAY_TIMEZONE),
      timezone: this.cfg.DISPLAY_TIMEZONE,
      similarity_score: Math.round(r.similarity_score * 10000) / 10000,
      model_name: r.model_name,
      model_version: r.model_version,
      employee: {
        id: r.employee_id,
        name: r.employee_name,
        employee_code: r.employee_code,
        active: r.employee_active === 1,
      },
    };
  }

  /** O Node não confia cegamente no Python: revalida contrato, modelo, candidato e limiar. */
  private validateIdentifyResult(r: IdentifyResult, galleryIds: Set<number>) {
    if (r.model_name !== this.cfg.RECOGNITION_MODEL_NAME || r.model_version !== this.cfg.RECOGNITION_MODEL_VERSION) {
      throw new AppError(502, 'recognition_model_mismatch', 'Modelo do serviço de reconhecimento difere do esperado');
    }
    if (!r.matched) {
      throw new AppError(422, `recognition_${r.reason ?? 'rejected'}`, rejectionMessage(r.reason), {
        reason: r.reason ?? null,
      });
    }
    const id = r.employee_id;
    const sim = r.similarity;
    if (id == null || sim == null || !Number.isFinite(sim) || !galleryIds.has(id)) {
      throw new AppError(502, 'recognition_bad_response', 'Resposta de reconhecimento inconsistente');
    }
    if (sim < this.cfg.RECOGNITION_THRESHOLD) {
      throw new AppError(422, 'recognition_no_match', rejectionMessage('no_match'), { reason: 'no_match' });
    }
    const second = r.second_best_similarity;
    if (
      second != null &&
      second >= this.cfg.RECOGNITION_THRESHOLD &&
      sim - second < this.cfg.RECOGNITION_AMBIGUITY_MARGIN
    ) {
      throw new AppError(422, 'recognition_ambiguous', rejectionMessage('ambiguous'), { reason: 'ambiguous' });
    }
    return { employeeId: id, similarity: sim };
  }
}
