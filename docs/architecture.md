# Arquitetura

```
 Navegador (React, localhost:5173)
   │  captura deliberada (getUserMedia → canvas → JPEG base64)
   │  /api/* via proxy do Vite
   ▼
 Backend Node.js/Express (127.0.0.1:3001)  ── único que escreve no banco ──►  SQLite (data/face-attendance.db)
   │  valida entrada, monta galeria ativa,                                     employees · face_embeddings · time_records
   │  aplica regras, gera timestamp UTC                                        schema_migrations
   ▼  JSON (imagem + galeria + limiar)
 Serviço Python/FastAPI (127.0.0.1:8001)
   YuNet (detecção + 5 landmarks) → qualidade → alinhamento → SFace (embedding 128-d) → cosseno 1:N
   sem banco, sem disco, modelos carregados uma vez na inicialização
```

## Responsabilidades

| Componente | Faz | Não faz |
|---|---|---|
| Frontend | UI administrativa, captura pela webcam, exibe resultados e horários formatados pelo servidor | decidir identidade, gerar horário, guardar imagens |
| Backend | API pública, validação (zod), autenticação admin, galeria ativa, regras de aceite, deduplicação, transações, timestamps, OpenAPI | processar imagens, expor embeddings |
| Python | decodificar/validar imagem, detectar, checar qualidade, alinhar, extrair embedding, comparar | acessar o SQLite, registrar ponto, guardar imagens/galerias |

## Fluxos

**Cadastro** (`POST /api/employees`): valida nome/código/imagem → checa código duplicado (falha rápida) →
Python `/faces/enroll` (exatamente 1 rosto, tamanho mínimo, nitidez) → Node valida modelo/dimensão/valores
→ transação: `INSERT employees` + `INSERT face_embeddings` → a imagem é descartada.

**Ponto** (`POST /api/attendance`): valida imagem → lê galeria ativa (funcionários ativos + embeddings do
modelo esperado) → Python `/faces/identify` → Node revalida (modelo, candidato na galeria, limiar,
ambiguidade) → transação `IMMEDIATE`: funcionário ainda ativo? último registro há ≥ 30 s? → `INSERT
time_records` com `recorded_at` do servidor. Qualquer falha → nenhum registro.

**Desativação** (`DELETE /api/employees/:id`): transação `active=0` + `DELETE face_embeddings` → checkpoint
do WAL. Registros de ponto permanecem.

## Decisões

- **better-sqlite3 + migrations SQL próprias** (`backend/migrations/NNN_nome.sql`, tabela
  `schema_migrations` com checksum): síncrono, transacional, sem ORM; a serialização natural das
  transações no processo único do Node simplifica a proteção contra concorrência.
- **Comparação linear em NumPy**: galerias de centenas/milhares de vetores 128-d custam microssegundos;
  banco vetorial seria complexidade desnecessária.
- **Galeria enviada a cada requisição**: o Python permanece sem estado (nada para vazar ou invalidar
  ao desativar alguém). Para galerias muito grandes, o próximo passo seria cache versionado no Python.
- **Lock no Python**: as redes DNN do OpenCV não são seguras para inferência concorrente na mesma
  instância; as chamadas são serializadas (extração medida em ~10 ms por imagem 1280×960 no MacBook Air M3, CPU).
- **Várias amostras por funcionário**: o esquema e o matcher (melhor pontuação por funcionário) já
  suportam; o MVP cadastra uma.
- **Fuso**: timestamps ISO-8601 UTC (`...Z`), ordenáveis como texto; filtros de data interpretam o dia
  em `America/Sao_Paulo` e convertem para intervalo UTC no servidor.
- **PAD/liveness futuro**: inserir em `FaceEngine.extract` (Python) como etapa que pode lançar
  `Rejection("presentation_attack", ...)`; o backend já trata motivos de rejeição genericamente.

## Estrutura

```
face-attendance/
├── .nvmrc · package.json (workspaces) · package-lock.json · .env.example
├── scripts/            setup.sh · check-tools.sh · dev.mjs · recognition.sh · download-models.mjs · health.mjs · e2e/smoke.py
├── backend/            src/{routes,services,repositories,database,scripts} · migrations/ · tests/
├── frontend/           src/{pages,components,lib} · vite.config.ts
├── recognition/        app/{main,detector,embedder,matcher,engine,schemas,image_io,evaluate}.py · models/manifest.json · tests/ · pyproject.toml · poetry.lock
└── docs/               architecture.md · api.md · model-licenses.md · evaluation.md · security-privacy.md
```
