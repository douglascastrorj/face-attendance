# Avaliação de falsos aceites e falsas rejeições

Os testes automatizados verificam **regras e contratos**, não a acurácia biométrica. Antes de qualquer
uso operacional é obrigatório medir FAR/FRR com **imagens de pessoas que autorizaram formalmente**
o uso para esse fim, nas condições reais de operação (câmera, local, iluminação).

## 1. Coleta (autorizada)

- Termo de consentimento específico para avaliação biométrica; defina retenção e descarte das imagens.
- Ideal: ≥ 30 pessoas, diversidade de idade, tom de pele, gênero, uso de óculos/barba.
- Por pessoa: 1 imagem de cadastro (`enroll.jpg`, frontal, boa luz) e 5–10 tentativas variando:
  luz forte/fraca/contraluz, ângulo (±15–30°), distância, óculos, expressão, dias diferentes.
- Use a mesma câmera e resolução do posto de ponto (o frontend captura até 1280 px de largura, JPEG 0.92).
- Guarde fora do repositório, ex.: `face-attendance/eval-data/` (já ignorado pelo Git):

```
eval-data/
  pessoa_01/ enroll.jpg  luz_baixa.jpg  angulo_esq.jpg  oculos.jpg ...
  pessoa_02/ ...
```

## 2. Execução

```bash
npm run recognition:evaluate -- --data "$PWD/eval-data" --thresholds 0.30,0.35,0.363,0.40,0.45,0.50 --out "$PWD/eval-data/relatorio.json"
```

O script ([`recognition/app/evaluate.py`](../recognition/app/evaluate.py)) usa exatamente o mesmo
pipeline do serviço (detecção, qualidade, alinhamento, SFace, regra de ambiguidade) e reporta:

| Métrica | Significado |
|---|---|
| **FRR** | tentativas genuínas não aceitas como a pessoa certa (inclui ambíguas e identificação errada) |
| **FAR (1:N, conjunto aberto)** | cada tentativa comparada com a galeria **sem** a própria pessoa; aceite = falso aceite (simula pessoa não cadastrada) |
| **misidentification** | aceita como outro funcionário com a própria referência presente |
| **rejeitadas por qualidade** | imagens barradas antes do reconhecimento (sem rosto, borradas, rosto pequeno...) |

Também imprime a distribuição das similaridades genuínas e de impostor (min, p05, média, p95, max).

## 3. Escolha do limiar

- Priorize FAR baixo (um falso aceite registra ponto para outra pessoa).
- Escolha um limiar acima do p95/máximo das similaridades de impostor com folga, e verifique o FRR resultante.
- Ajuste `RECOGNITION_THRESHOLD` e `RECOGNITION_AMBIGUITY_MARGIN` no `.env` e reinicie o backend.
- Registre data, versão do modelo, câmera, tamanho da amostra e resultados.
- Repita após trocar modelo, câmera ou local, e periodicamente.

## 4. Limitações

- Amostras pequenas têm intervalos de confiança largos: 0 falsos aceites em 100 tentativas **não**
  significa FAR = 0.
- A avaliação **não mede resistência a ataques de apresentação** (foto impressa, tela, vídeo, máscara).
  O MVP não possui PAD/liveness — ver [security-privacy.md](security-privacy.md).
- Viés demográfico precisa ser medido por subgrupo, com amostra suficiente em cada um.

## Execução de demonstração realizada

Com as duas imagens de domínio público do scikit-image (astronaut/NASA e cameraman), mais variações
sintéticas (espelhamento, escurecimento), o script registrou similaridade genuína 0,92–0,97 e de
impostor 0,16–0,21, sem erros em nenhum limiar de 0,25 a 0,50. **Isso demonstra apenas que o
pipeline funciona; não tem valor estatístico.**
