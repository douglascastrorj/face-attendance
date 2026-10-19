# Segurança, privacidade e conformidade

> **MVP técnico.** Não é solução de registro eletrônico de ponto certificada, nem sistema antifraude
> validado. Não use em produção sem as avaliações descritas aqui.

## O que está implementado

| Controle | Implementação |
|---|---|
| Identidade só pelo rosto | `POST /api/attendance` aceita **apenas** `image_base64` (schema estrito). `employee_id` ou timestamp enviados pelo cliente → 400. |
| Horário oficial | Gerado no backend dentro da transação de escrita (`new Date()` do servidor), salvo em UTC; exibido em `America/Sao_Paulo` formatado pelo servidor. O relógio/fuso do navegador não é usado. |
| Validação dupla do reconhecimento | O Node revalida a resposta do Python: contrato (zod), modelo/versão, candidato pertencente à galeria ativa, limiar e margem de ambiguidade. |
| Duplicidade/concorrência | Transação `BEGIN IMMEDIATE` (lock de escrita) + intervalo configurável (`ATTENDANCE_DEDUP_SECONDS=30`). Testado com 8 requisições simultâneas → 1 registro. Não é regra trabalhista. |
| Funcionário inativo | Excluído da galeria; reverificado dentro da transação (cobre desativação durante o reconhecimento). |
| Imagens | Validação de tipo (assinatura JPEG/PNG), tamanho (4 MB) e resolução no Node e no Python. Processadas **só em memória**: nenhum arquivo temporário, nenhuma imagem persistida. |
| Logs | Sem corpo, sem query string, sem cabeçalhos. Erros de validação não ecoam o conteúdo. Verificado: nenhum base64/vetor nos logs de uma sessão completa. |
| Embeddings | Tabela própria (`face_embeddings`), nunca retornados pela API pública (apenas metadados: modelo, versão, dimensão, data). Tratados como **dado biométrico sensível**, não como dado anônimo. |
| Exclusão biométrica | Desativar = `active=0` + `DELETE` dos embeddings na mesma transação. `PRAGMA secure_delete=ON` sobrescreve o conteúdo apagado e `wal_checkpoint(TRUNCATE)` limpa o WAL. O Python não guarda cache de galerias. |
| Histórico | Preservado após desativação; FK `ON DELETE RESTRICT` impede apagar funcionário com registros. |
| Acesso administrativo | Senha local (`ADMIN_PASSWORD`, ≥ 12 caracteres, gerada pelo setup) → token de sessão opaco em memória (8 h), comparação em tempo constante, limite de 5 tentativas/min por IP. Bater Ponto é público (quiosque). |
| Rede | Backend em `127.0.0.1:3001`, Python em `127.0.0.1:8001`, frontend em `localhost:5173`. CORS restrito a `FRONTEND_ORIGIN`. Helmet (cabeçalhos de segurança), `Cache-Control: no-store`. |
| Retenção | Embeddings: excluídos na desativação. Histórico: `TIME_RECORDS_RETENTION_DAYS` + `npm run data:retention` (simulação) / `npm run data:retention -- --apply`. |
| Segredos | `.env` (permissão 600) e banco fora do Git (`.gitignore`). |

## Limitações conhecidas (não resolvidas no MVP)

- **Sem detecção de ataque de apresentação (PAD/liveness).** Fotos impressas, imagens em celular e
  vídeos podem ser aceitos. Comparação facial isolada **não prova presença física**. A arquitetura
  permite inserir um passo de PAD no Python (`FaceEngine.extract`, antes do embedding) e um novo
  motivo de rejeição; nada foi simulado.
- **Autenticação administrativa simples**: senha única compartilhada, sem usuários, papéis, MFA ou
  trilha de auditoria. Sessões se perdem ao reiniciar o backend.
- **Sem criptografia em repouso** do SQLite. Proteja o disco (FileVault) e o arquivo `data/`.
- **Backups e cópias externas**: `secure_delete` não alcança backups, snapshots (Time Machine) ou
  cópias do arquivo `.db`. Uma política real de exclusão precisa cobri-los. Por isso o sistema não
  promete "exclusão completa" fora do banco ativo.
- **HTTP sem TLS**, válido apenas em `localhost`.
- Limiar não calibrado com dados reais (ver [evaluation.md](evaluation.md)).
- Busca por nome é case-insensitive apenas para ASCII (limitação do `LIKE` do SQLite).

## Acesso pela rede local

Navegadores só liberam `getUserMedia` em **contexto seguro**: `https://` ou `http://localhost`/`127.0.0.1`.
Abrir `http://192.168.x.x:5173` em outro dispositivo **não** dará acesso à câmera. Para uso em rede:

1. Sirva o frontend via HTTPS (certificado confiável na rede; ex.: proxy reverso com TLS).
2. Ajuste `FRONTEND_ORIGIN` e o `host` do Vite/proxy.
3. Mantenha o serviço Python em `127.0.0.1` (só o backend fala com ele).
4. Reavalie autenticação, rate limiting e exposição antes de expor o backend.

## Conformidade (avaliar antes de uso operacional)

- **LGPD (Lei 13.709/2018)**: biometria é dado pessoal sensível (art. 5º, II; art. 11). Defina base
  legal, finalidade, minimização, transparência, prazos de retenção, atendimento a direitos do titular
  (acesso, eliminação), RIPD/DPIA e encarregado (DPO). Considere alternativa não biométrica para quem
  não puder/quiser usar biometria.
- **Registro eletrônico de ponto**: a Portaria MTP nº 671/2021 (e atualizações) define requisitos de
  REP-C/REP-A/REP-P (certificação, AFD, comprovante ao trabalhador, inviolabilidade). **Este MVP não
  atende a esses requisitos** e não deve ser usado como sistema oficial de ponto.
- Consulte jurídico/DPO; os pontos acima são indicativos, não parecer legal.
