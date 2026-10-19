import { z } from 'zod';
import { AppError } from '../errors.js';
import { logger } from '../logger.js';
import type { GalleryEntry } from '../repositories/embeddings.js';

/** Contrato com o serviço Python. Ver docs/api.md#serviço-python. */

const quality = z.object({
  detection_score: z.number(),
  face_width: z.number(),
  face_height: z.number(),
  sharpness: z.number(),
});

const modelFields = {
  model_name: z.string(),
  model_version: z.string(),
  embedding_dim: z.number().int().positive(),
};

export const enrollResponseSchema = z.object({
  ...modelFields,
  accepted: z.boolean(),
  reason: z.string().nullish(),
  detail: z.string().nullish(),
  embedding: z.array(z.number()).nullish(),
  quality: quality.nullish(),
});
export type EnrollResult = z.infer<typeof enrollResponseSchema>;

export const identifyResponseSchema = z.object({
  ...modelFields,
  matched: z.boolean(),
  employee_id: z.number().int().positive().nullish(),
  similarity: z.number().nullish(),
  second_best_similarity: z.number().nullish(),
  threshold: z.number(),
  ambiguity_margin: z.number(),
  reason: z.string().nullish(),
  detail: z.string().nullish(),
  candidates: z.array(z.object({ employee_id: z.number(), similarity: z.number() })).default([]),
  quality: quality.nullish(),
});
export type IdentifyResult = z.infer<typeof identifyResponseSchema>;

export const healthResponseSchema = z.object({
  status: z.string(),
  models_loaded: z.boolean(),
  model_name: z.string().nullish(),
  model_version: z.string().nullish(),
  embedding_dim: z.number().nullish(),
  detector: z.string().nullish(),
  error: z.string().nullish(),
});
export type RecognitionHealth = z.infer<typeof healthResponseSchema>;

export interface IdentifyParams {
  imageBase64: string;
  gallery: GalleryEntry[];
  threshold: number;
  ambiguityMargin: number;
}

export interface RecognitionClient {
  health(): Promise<RecognitionHealth>;
  enroll(imageBase64: string): Promise<EnrollResult>;
  identify(p: IdentifyParams): Promise<IdentifyResult>;
}

export class HttpRecognitionClient implements RecognitionClient {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs: number,
  ) {}

  async health(): Promise<RecognitionHealth> {
    // /health devolve 503 com corpo válido quando os modelos não carregaram.
    return this.call('GET', '/health', undefined, healthResponseSchema, [200, 503]);
  }

  enroll(imageBase64: string): Promise<EnrollResult> {
    return this.call('POST', '/faces/enroll', { image_base64: imageBase64 }, enrollResponseSchema);
  }

  identify(p: IdentifyParams): Promise<IdentifyResult> {
    return this.call(
      'POST',
      '/faces/identify',
      { image_base64: p.imageBase64, gallery: p.gallery, threshold: p.threshold, ambiguity_margin: p.ambiguityMargin },
      identifyResponseSchema,
    );
  }

  private async call<T>(
    method: string,
    path: string,
    body: unknown,
    schema: z.ZodType<T>,
    okStatuses: number[] = [200],
  ): Promise<T> {
    let res: Response;
    try {
      res = await fetch(this.baseUrl + path, {
        method,
        headers: body ? { 'content-type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      const name = (err as Error).name;
      if (name === 'TimeoutError' || name === 'AbortError') {
        throw new AppError(504, 'recognition_timeout', 'O serviço de reconhecimento não respondeu a tempo');
      }
      logger.warn('Serviço de reconhecimento inacessível', { path, error: name });
      throw new AppError(503, 'recognition_unavailable', 'Serviço de reconhecimento indisponível');
    }

    let json: unknown;
    try {
      json = await res.json();
    } catch {
      throw new AppError(502, 'recognition_bad_response', 'Resposta inválida do serviço de reconhecimento');
    }

    if (!okStatuses.includes(res.status)) {
      const code = (json as { error?: string })?.error;
      logger.warn('Serviço de reconhecimento retornou erro', { path, status: res.status, code });
      if (res.status === 503 && code === 'models_unavailable') {
        throw new AppError(503, 'recognition_models_unavailable', 'Modelos de reconhecimento não carregados');
      }
      if (code === 'model_mismatch') {
        throw new AppError(
          409,
          'recognition_model_mismatch',
          'Embeddings cadastrados são incompatíveis com o modelo carregado. Regere os cadastros.',
        );
      }
      if (code === 'invalid_embedding_dimension' || code === 'invalid_embedding') {
        throw new AppError(500, 'recognition_invalid_gallery', 'Galeria biométrica inválida enviada ao reconhecimento');
      }
      if (res.status === 413) {
        throw new AppError(413, 'image_too_large', 'Imagem excede o tamanho máximo');
      }
      throw new AppError(502, 'recognition_error', 'Falha no serviço de reconhecimento');
    }

    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      throw new AppError(502, 'recognition_bad_response', 'Resposta fora do contrato do serviço de reconhecimento');
    }
    return parsed.data;
  }
}
