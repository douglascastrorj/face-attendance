# API

Documentação interativa (Swagger UI): **http://127.0.0.1:3001/api/docs** · especificação: `/api/openapi.json`.

## Convenções

- JSON em todas as rotas. Imagens: `image_base64` como data URL (`data:image/jpeg;base64,...`) ou base64 puro; JPEG/PNG, ≤ 4 MB.
- Erros: `{"error": {"code": "...", "message": "...", "details": {...}}}`.
- Timestamps: `*_at` em ISO-8601 UTC; `*_local` formatado em `America/Sao_Paulo` pelo servidor.
- Rotas administrativas exigem `Authorization: Bearer <token>` (de `POST /api/auth/login`).
- Embeddings nunca são retornados.

## Backend (Node.js)

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| GET | `/api/health` | — | saúde do backend/banco |
| GET | `/api/health/recognition` | — | Python acessível, modelos carregados e compatíveis (200) ou 503 |
| POST | `/api/auth/login` | — | `{password}` → `{token, expires_at}` |
| POST | `/api/auth/logout` | admin | invalida o token |
| GET | `/api/auth/status` | — | `{auth_disabled, authenticated}` |
| GET | `/api/dashboard` | admin | ativos, registros do dia, recentes, embeddings incompatíveis |
| GET | `/api/employees` | admin | `status=active\|inactive\|all` (padrão `active`), `name`, `code`, `page`, `page_size≤100` |
| GET | `/api/employees/:id` | admin | funcionário + metadados das amostras biométricas |
| POST | `/api/employees` | admin | `{name, employee_code?, image_base64}` → 201 |
| DELETE | `/api/employees/:id` | admin | desativa e exclui biometria → `{employee, biometric_samples_deleted}` |
| POST | `/api/attendance` | — | `{image_base64}` (somente) → 201 registro |
| POST | `/api/attendance/recognize` | admin | reconhece sem gravar |
| GET | `/api/attendance` | admin | `employee_id`, `from`, `to` (AAAA-MM-DD, dias locais inclusivos), `page`, `page_size` — mais recentes primeiro |
| GET | `/api/attendance/:id` | admin | um registro |

### Códigos de erro relevantes

| HTTP | `code` | Quando |
|---|---|---|
| 400 | `validation_error`, `invalid_image`, `invalid_json`, `invalid_range` | entrada inválida, campos extras |
| 401 / 429 | `unauthorized`, `invalid_credentials` / `too_many_attempts` | autenticação |
| 403 | `employee_inactive` | funcionário inativo no momento da gravação |
| 409 | `duplicate_employee_code` | identificador interno já usado |
| 409 | `duplicate_attendance` | registro do mesmo funcionário há menos de `ATTENDANCE_DEDUP_SECONDS` (`details.retry_after_seconds`) |
| 409 | `recognition_model_mismatch` | Python recusou galeria de outro modelo |
| 413 | `image_too_large`, `payload_too_large` | limite de tamanho |
| 422 | `face_<motivo>` (cadastro) / `recognition_<motivo>` (ponto) | `no_face`, `multiple_faces`, `face_too_small`, `low_detection_confidence`, `blurry`, `image_too_small`, `no_match`, `ambiguous`, `empty_gallery` — `details.reason` traz o motivo técnico |
| 502 | `recognition_bad_response`, `recognition_invalid_embedding`, `recognition_model_mismatch` | resposta do Python fora do contrato/modelo esperado |
| 503 / 504 | `recognition_unavailable`, `recognition_models_unavailable` / `recognition_timeout` | serviço Python fora, sem modelos ou lento |

### Exemplo

```bash
curl -s -X POST http://127.0.0.1:3001/api/attendance \
  -H 'Content-Type: application/json' \
  -d "{\"image_base64\":\"data:image/jpeg;base64,$(base64 -i foto.jpg)\"}"
```

```json
{
  "id": 12,
  "recorded_at": "2026-10-17T11:05:09.123Z",
  "recorded_at_local": "17/10/2026, 08:05:09",
  "timezone": "America/Sao_Paulo",
  "similarity_score": 0.8123,
  "model_name": "sface",
  "model_version": "2021dec",
  "employee": { "id": 3, "name": "Maria Silva", "employee_code": "F-001", "active": true }
}
```

## Serviço Python (interno, 127.0.0.1:8001)

Consumido apenas pelo backend. Docs automáticas do FastAPI em `http://127.0.0.1:8001/docs`.

### `GET /health`
`200 {status:"ok", models_loaded:true, model_name, model_version, embedding_dim, detector}` ou
`503 {status:"degraded", models_loaded:false, error}` (modelo ausente/corrompido).

### `POST /faces/enroll`
Requisição `{image_base64}`. Resposta 200:
- aceito: `{accepted:true, embedding:[128 floats], quality:{detection_score, face_width, face_height, sharpness}, model_name, model_version, embedding_dim}`
- rejeitado: `{accepted:false, reason, detail, model_name, model_version, embedding_dim}`

### `POST /faces/identify`
Requisição:
```json
{ "image_base64": "...", "threshold": 0.363, "ambiguity_margin": 0.05,
  "gallery": [{ "employee_id": 3, "embedding": [128 floats], "model_name": "sface", "model_version": "2021dec" }] }
```
Resposta 200 (contrato de identificação):

| Campo | Descrição |
|---|---|
| `matched` | decisão técnica do Python |
| `employee_id` | candidato aceito (ou `null`) |
| `similarity` | melhor similaridade de cosseno (mesmo quando rejeitado por limiar) |
| `second_best_similarity` | 2º funcionário mais similar |
| `reason` | `null` ou motivo (`no_face`, `multiple_faces`, `no_match`, `ambiguous`, `empty_gallery`, ...) |
| `candidates` | top-3 `{employee_id, similarity}` |
| `threshold`, `ambiguity_margin` | valores aplicados |
| `model_name`, `model_version`, `embedding_dim` | modelo usado |
| `quality` | métricas da face detectada |

Erros 4xx/5xx: `{error, detail}` — `model_mismatch` (409), `invalid_embedding_dimension`/`invalid_embedding`/`invalid_request`/`gallery_too_large` (422), `payload_too_large` (413), `models_unavailable` (503).

**O backend não confia cegamente nessa resposta**: revalida modelo, presença do candidato na galeria
ativa, limiar e ambiguidade antes de gravar.
