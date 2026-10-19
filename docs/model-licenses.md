# Modelos, origem e licenças

Verificação feita em 17/10/2026 diretamente no repositório oficial **opencv/opencv_zoo**, no commit
[`47534e27c9851bb1128ccc0102f1145e27f23f98`](https://github.com/opencv/opencv_zoo/tree/47534e27c9851bb1128ccc0102f1145e27f23f98).
Os pesos são baixados desse commit fixo por `npm run models:download` e verificados por SHA-256.

| Papel | Modelo | Versão | Arquivo | Tamanho | SHA-256 | Licença |
|---|---|---|---|---|---|---|
| Detecção | YuNet | `2023mar` | `face_detection_yunet_2023mar.onnx` | 232 589 B | `8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4` | MIT |
| Reconhecimento | SFace (MobileFaceNet + SFace loss) | `2021dec` | `face_recognition_sface_2021dec.onnx` | 38 696 353 B | `0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79` | Apache-2.0 |

Fonte dos checksums: os ponteiros Git LFS versionados no próprio repositório oficial
(`oid sha256:` em `models/face_detection_yunet/face_detection_yunet_2023mar.onnx` e
`models/face_recognition_sface/face_recognition_sface_2021dec.onnx`). O manifesto local está em
[`recognition/models/manifest.json`](../recognition/models/manifest.json).

## Licenças

- **YuNet** — `models/face_detection_yunet/LICENSE` no opencv_zoo: **MIT License**, Copyright (c) 2020 Shiqi Yu.
  Origem do modelo: [ShiqiYu/libfacedetection.train](https://github.com/ShiqiYu/libfacedetection.train). Uso comercial e redistribuição permitidos mantendo o aviso de copyright.
- **SFace** — `models/face_recognition_sface/LICENSE` no opencv_zoo: **Apache License 2.0**.
  Contribuição de Yaoyao Zhong ([zhongyy/SFace](https://github.com/zhongyy/SFace)); conversão ONNX por Chengrui Wang.
- **OpenCV** (biblioteca, `opencv-python-headless`) — Apache-2.0.

### Ressalva sobre dados de treinamento

As licenças acima cobrem o código e os arquivos de pesos publicados. Modelos de reconhecimento facial
costumam ser treinados com bases públicas de rostos (o artigo do SFace avalia com CASIA-WebFace, VGGFace2
e MS1M), algumas com termos restritos a pesquisa ou retiradas de circulação. O opencv_zoo não informa
qual base gerou exatamente o checkpoint `2021dec`. **Antes de uso comercial/operacional, obtenha
parecer jurídico sobre essa cadeia de proveniência.** Para este MVP local e não comercial, a escolha foi
considerada adequada; se o parecer for desfavorável, substitua o reconhecedor (ver "Troca de modelo").

## Decisões técnicas

- **ONNX Runtime não é usado.** O OpenCV 4.x executa os dois modelos ONNX com o próprio motor DNN
  (`cv2.FaceDetectorYN` e `cv2.FaceRecognizerSF`), na CPU, com wheels nativas arm64 para macOS.
- **OpenCV fixado em `<5.0`.** O README do opencv_zoo informa que o `yunet_2023mar` tem shape fixo e
  que o OpenCV 5.x usa ONNX Runtime, exigindo a variante de shape dinâmico (`2026may`). Migrar para
  OpenCV 5 exige trocar o detector e revalidar.
- **Limiar inicial 0.363 (cosseno)** — valor de referência publicado pela OpenCV para SFace. É apenas
  ponto de partida de desenvolvimento; calibre conforme [evaluation.md](evaluation.md).
- **Pesos não são versionados** (`recognition/models/*.onnx` está no `.gitignore`); só o manifesto.

## Procedimento de download

```bash
npm run models:download   # baixa o que faltar e verifica tamanho + SHA-256 (idempotente)
npm run models:verify     # apenas verifica; falha se ausente/corrompido
```

O script aceita apenas hosts do GitHub (`media.githubusercontent.com`), grava em `*.part` e só renomeia
após validar o checksum. O serviço Python também recalcula o SHA-256 na inicialização e recusa
carregar arquivos divergentes (`RECOGNITION_VERIFY_CHECKSUMS=true` por padrão).

## Troca de modelo

Embeddings de modelos diferentes **não são comparáveis**. Cada embedding é salvo com `model_name`,
`model_version` e `embedding_dim`; o backend só envia ao Python os que correspondem a
`RECOGNITION_MODEL_NAME/VERSION/EMBEDDING_DIM`, e o Python rejeita (HTTP 409) galerias de outro modelo.
Para trocar de modelo:

1. Atualize `recognition/models/manifest.json` (arquivo, URL de fonte confiável, SHA-256, `embedding_dim`) e documente a licença aqui.
2. Atualize `RECOGNITION_MODEL_NAME/VERSION/EMBEDDING_DIM` no `.env`.
3. **Recadastre todos os funcionários com novas capturas autorizadas.** Não há conversão de embeddings antigos.
   O Dashboard mostra quantas referências biométricas ficaram incompatíveis.
4. Recalibre o limiar com o procedimento de avaliação.
