# face-attendance — Ponto com Reconhecimento Facial (MVP)

Aplicação web **local** para registro de ponto por reconhecimento facial: cadastro de funcionários com
referência biométrica, desativação com exclusão da biometria, Bater Ponto pela webcam com horário
gerado pelo servidor e histórico filtrável. Todo o processamento facial roda na máquina (CPU), sem
serviços externos pagos e sem enviar imagens para nuvem.

> ⚠️ **MVP técnico.** Não é sistema de ponto certificado (Portaria MTP 671/2021), não é antifraude
> validado e **não detecta fotos/vídeos (sem liveness/PAD)**. O limiar de reconhecimento não foi
> calibrado com dados reais. Leia [docs/security-privacy.md](docs/security-privacy.md) antes de qualquer uso.

| Camada | Tecnologia | Porta |
|---|---|---|
| Frontend | React 19 + TypeScript + Vite 8 | `http://localhost:5173` |
| Backend | Node.js 24 + Express 5 + TypeScript + SQLite (better-sqlite3) | `127.0.0.1:3001` (docs: `/api/docs`) |
| Reconhecimento | Python 3.12 + Poetry + FastAPI + OpenCV 4 (YuNet + SFace) + NumPy | `127.0.0.1:8001` |

Arquitetura: [docs/architecture.md](docs/architecture.md) · API: [docs/api.md](docs/api.md) ·
Modelos e licenças: [docs/model-licenses.md](docs/model-licenses.md) · Avaliação FAR/FRR:
[docs/evaluation.md](docs/evaluation.md) · Segurança/LGPD: [docs/security-privacy.md](docs/security-privacy.md)

## Versões fixadas

| Ferramenta | Versão | Onde está fixada |
|---|---|---|
| Node.js | **24.18.0** | `.nvmrc`, `engines` |
| npm | **11.16.x** (≥ 11.16.0 < 12, vem com o Node 24.18.0) | `engines`, `packageManager` |
| Dependências JS | exatas | `package-lock.json` (workspaces `backend`, `frontend`), instaladas com `npm ci` |
| Python | **3.12** (aceita 3.12–3.13) | `recognition/pyproject.toml` (`requires-python`) |
| Poetry | **2.3.2** (série 2.3) | `requires-poetry` no `pyproject.toml`, verificado por `scripts/check-tools.sh` |
| Dependências Python | exatas | `recognition/poetry.lock` (OpenCV 4.14.0, NumPy 2.5.4, FastAPI 0.143.3, uvicorn 0.54.0) |
| Modelos | YuNet `2023mar`, SFace `2021dec` @ opencv_zoo `47534e2` | `recognition/models/manifest.json` (URL + SHA-256) |

Validado em MacBook Air M3 (arm64), macOS 26, CPU. Todas as dependências têm binários nativos arm64.
O npm 11 bloqueia scripts de instalação por padrão: apenas `better-sqlite3` e `esbuild` estão liberados
(`allowScripts` no `package.json`).

## 1. Instalar as ferramentas (uma vez)

```bash
xcode-select --install                                         # compiladores (better-sqlite3)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash   # nvm
brew install python@3.12 pipx
pipx install "poetry==2.3.2"
```

Abra um novo terminal e, na raiz do repositório:

```bash
nvm install    # lê .nvmrc → instala Node 24.18.0 (com npm 11.16)
nvm use
```

## 2. Configurar o ambiente

```bash
npm run setup
```

Etapas (idempotente — pode rodar de novo sem apagar dados nem sobrescrever o `.env`):

1. ativa o Node do `.nvmrc` via nvm e verifica Node, npm, Python, Poetry e Xcode CLT;
2. `npm ci` (frontend + backend, a partir do lockfile);
3. cria o ambiente virtual Poetry em `recognition/.venv` com Python 3.12 e roda `poetry install`;
4. baixa e verifica os modelos ONNX (`npm run models:download`);
5. cria `.env` a partir de `.env.example` **somente se não existir**, gerando `ADMIN_PASSWORD` aleatória (exibida uma vez; fica no `.env`);
6. cria/migra o banco SQLite em `data/face-attendance.db`.

Equivalente sem npm: `bash scripts/setup.sh`.

## 3. Executar

```bash
npm run dev
```

Inicia os três serviços com saída prefixada. Abra **http://localhost:5173**, entre com a senha do
`ADMIN_PASSWORD` e cadastre um funcionário. A página **Bater Ponto** (`/ponto`) é pública (modo quiosque).
**Ctrl+C** encerra todos os processos (cada serviço roda em seu grupo de processos; não ficam órfãos).
Se um serviço cair, os demais são encerrados e o comando falha.

Modo build: `npm run build && npm start` (backend compilado + `vite preview`).

```bash
npm run health    # checa Python, backend, backend→Python e frontend
```

### Usar a webcam

O navegador pedirá permissão na primeira captura. `getUserMedia` só funciona em contexto seguro:
use **http://localhost:5173** (não o IP da máquina). Para acesso por outros dispositivos é preciso HTTPS
— ver [docs/security-privacy.md](docs/security-privacy.md#acesso-pela-rede-local).
A câmera só liga ao clicar em "Ativar câmera" e é desligada ao sair da página; cada registro exige um
clique (não há reconhecimento contínuo).

## 4. Testes

```bash
npm test                         # backend + frontend + Python (com modelos reais)
npm run test:backend             # Vitest + Supertest (serviço Python simulado)
npm run test:frontend            # Vitest + Testing Library (jsdom)
npm run test:recognition:unit    # Python sem modelos (motor falso)
npm run test:recognition         # Python, inclusive testes com os modelos ONNX reais
npm run test:e2e                 # fumaça ponta a ponta contra `npm run dev` (cria dados no banco!)
npm run typecheck
```

Os testes de negócio (backend com reconhecimento simulado; Python com motor falso) são separados dos
testes com modelos reais (`pytest -m models`), que usam somente imagens de domínio público do
scikit-image (`astronaut` — foto oficial da NASA; `camera`).

### Resultados executados em 17/10/2026 (MacBook Air M3)

| Suíte | Resultado |
|---|---|
| Backend (`npm run test:backend`) | **65 passed** (4 arquivos) |
| Frontend (`npm run test:frontend`) | **7 passed** (2 arquivos) |
| Python, regras/contrato (`-m "not models"`) | **29 passed** |
| Python, modelos reais (`-m models`) | **7 passed** |
| Fumaça E2E com modelos reais (`npm run test:e2e`) | **13/13** verificações |
| Instalação em cópia limpa do repositório (`npm run setup` → `npm test` → `npm run build && npm start` → `npm run health`) | OK, inclusive download real dos modelos e 2ª execução do setup preservando `.env` e dados |
| Fluxo pela interface (navegador com câmera simulada exibindo a foto de domínio público) | cadastro → Bater Ponto reconhecido com horário do servidor → desativação com confirmação: OK |

Cobertura dos cenários exigidos: cadastro válido; sem rosto; múltiplos rostos; imagem inválida
(base64, não-imagem, MIME, tamanho); identificador duplicado; reconhecimento positivo; desconhecido
rejeitado; funcionário inativo (inclusive desativado durante o reconhecimento); timestamp do servidor
(cliente não pode enviar `employee_id`/timestamp); bloqueio de duplicidade e intervalo configurável;
8 requisições concorrentes → 1 registro; exclusão de embeddings ao desativar; histórico preservado
(FK `RESTRICT`); Python indisponível, timeout, resposta fora do contrato, não-JSON; modelos ausentes e
corrompidos; dimensão incorreta; versão de modelo incompatível (Node e Python); ambiguidade; limiar
reaplicado pelo Node; filtros por fuso de São Paulo; paginação; migrations idempotentes; CORS; logs sem
eco de dados. **Testes automatizados não comprovam segurança biométrica** — ver
[docs/evaluation.md](docs/evaluation.md).

## 5. Comandos auxiliares

| Comando | Função |
|---|---|
| `npm run check:tools` | verifica versões das ferramentas |
| `npm run db:migrate` / `npm run db:status` | aplica / lista migrations (nunca apaga dados) |
| `npm run models:download` / `npm run models:verify` | baixa+verifica / só verifica os modelos |
| `npm run recognition:install` / `recognition:dev` | ambiente Poetry / só o serviço Python |
| `npm run recognition:evaluate -- --data <dir>` | FAR/FRR com imagens autorizadas |
| `npm run data:retention [-- --apply]` | aplica `TIME_RECORDS_RETENTION_DAYS` ao histórico |
| `bash scripts/recognition.sh shell-info` | caminho e ativação do virtualenv Python |

## 6. Configuração (`.env`)

Principais variáveis (todas em [.env.example](.env.example)):

| Variável | Padrão | Observação |
|---|---|---|
| `RECOGNITION_THRESHOLD` | `0.363` | similaridade de cosseno mínima. **Valor de desenvolvimento** (referência OpenCV para SFace); calibrar com amostras reais |
| `RECOGNITION_AMBIGUITY_MARGIN` | `0.05` | 1º e 2º candidatos acima do limiar com diferença menor → rejeita como ambíguo |
| `ATTENDANCE_DEDUP_SECONDS` | `30` | proteção contra duplicidade acidental (não é regra trabalhista) |
| `ADMIN_PASSWORD` | gerada | ≥ 12 caracteres |
| `ADMIN_AUTH_DISABLED` | `false` | `true` só em ambiente isolado de desenvolvimento |
| `DISPLAY_TIMEZONE` | `America/Sao_Paulo` | exibição; persistência sempre em UTC |
| `TIME_RECORDS_RETENTION_DAYS` | `0` | 0 = indefinido |
| `RECOGNITION_HOST` | `127.0.0.1` | não exponha o serviço Python na rede |

## 7. Encerrar e limpar

- Encerrar: **Ctrl+C** no terminal do `npm run dev`.
- Apagar dados locais (irreversível, faça manualmente): `rm -rf data/` e depois `npm run db:migrate`.
- Remover ambientes: `rm -rf node_modules recognition/.venv recognition/models/*.onnx`.

## 8. Problemas comuns

| Sintoma | Solução |
|---|---|
| `Node v… ativo; esperado v24.18.0` | `nvm install && nvm use` no diretório do projeto |
| `better-sqlite3` não carrega / erro de ABI | `npm rebuild better-sqlite3` (requer Xcode CLT); confirme o Node do `.nvmrc` |
| `Poetry x.y; esperado 2.3.x` | `pipx install --force "poetry==2.3.2"` |
| `Python 3.12/3.13 não encontrado` | `brew install python@3.12` |
| Dashboard: "Serviço de reconhecimento indisponível" | veja a saída `[recognition]` do `npm run dev`; rode `npm run models:verify` |
| `Checksum inválido` / modelo ausente | `npm run models:download` (rebaixa arquivos divergentes) |
| Porta em uso (5173/3001/8001) | `lsof -nP -iTCP:3001 -sTCP:LISTEN` e encerre o processo, ou ajuste as portas no `.env` |
| Câmera: "Permissão negada" | Ajustes do Sistema → Privacidade e Segurança → Câmera → habilite o navegador; libere o site no navegador |
| Câmera: "exige contexto seguro" | acesse por `http://localhost:5173` |
| "Rosto muito pequeno"/"sem nitidez" | aproxime-se, melhore a luz frontal, fique parado na captura |
| "Funcionário não reconhecido" com a pessoa certa | recadastre com boa iluminação; avalie o limiar com [docs/evaluation.md](docs/evaluation.md) |
| `Migration … foi alterada após ser aplicada` | não edite migrations aplicadas; crie `NNN_nova.sql` |
| `ADMIN_PASSWORD ausente` | rode `npm run setup` ou defina no `.env` |

## Limitações

- Sem liveness/PAD: fotos, telas e vídeos podem enganar o sistema.
- Limiar não calibrado com população real; FAR/FRR desconhecidos fora das imagens de teste.
- Autenticação administrativa por senha única, sem usuários/papéis/MFA/auditoria; sessões em memória.
- SQLite sem criptografia em repouso; exclusão segura não alcança backups/snapshots externos.
- Uma amostra biométrica por funcionário (o esquema suporta várias). Reativação exige novo cadastro.
- Proveniência dos dados de treino do SFace exige revisão jurídica para uso comercial
  ([docs/model-licenses.md](docs/model-licenses.md)).
- Não atende requisitos de REP (Portaria 671/2021) e exige avaliação LGPD antes de uso real.
