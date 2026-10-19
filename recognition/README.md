# recognition — serviço de reconhecimento facial

FastAPI + OpenCV (YuNet para detecção, SFace para embeddings). Executa localmente em CPU, escuta em
`127.0.0.1:8001`, não acessa o banco e não grava imagens. Contrato em [../docs/api.md](../docs/api.md).

Todos os comandos usam o Poetry e o ambiente virtual isolado `recognition/.venv`
(`poetry.toml` define `virtualenvs.in-project = true`). Pela raiz do repositório:

```bash
npm run recognition:install     # poetry env use python3.12 && poetry install
npm run recognition:dev         # poetry run python -m app.main
npm run test:recognition        # todos os testes (inclui modelos reais, se baixados)
npm run test:recognition:unit   # só testes sem modelos (-m "not models")
npm run recognition:evaluate -- --data /caminho/eval-data
```

Ativar o ambiente manualmente (opcional):

```bash
cd recognition
source .venv/bin/activate        # ou: eval "$(poetry env activate)"
python -m app.main
deactivate
```

Configuração por variáveis `RECOGNITION_*` (lidas também do `.env` da raiz): `HOST`, `PORT`,
`MODELS_DIR`, `VERIFY_CHECKSUMS`, `MAX_REQUEST_BYTES`, `MAX_IMAGE_BYTES`, `MIN_IMAGE_SIDE`,
`MAX_IMAGE_SIDE`, `MAX_GALLERY_SIZE`, `DETECTION_SCORE_THRESHOLD`, `MIN_FACE_SIZE`, `MIN_SHARPNESS`.
Ver [app/config.py](app/config.py).

| Módulo | Função |
|---|---|
| `main.py` | app FastAPI, limites de requisição, carga única dos modelos (lifespan), endpoints |
| `detector.py` | YuNet (`cv2.FaceDetectorYN`), detecção em imagem reduzida a ≤ 640 px |
| `embedder.py` | alinhamento por 5 landmarks + SFace (`cv2.FaceRecognizerSF`), nitidez (variância do Laplaciano) |
| `engine.py` | pipeline: 0/1/N rostos → confiança → tamanho → nitidez → embedding validado |
| `matcher.py` | cosseno 1:N, melhor amostra por funcionário, limiar e ambiguidade |
| `image_io.py` | base64/data URL → validação de assinatura, tamanho e resolução, tudo em memória |
| `models_registry.py` | manifesto + verificação SHA-256 dos pesos |
| `evaluate.py` | FAR/FRR offline com imagens autorizadas |
