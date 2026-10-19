# Implementação de MVP — Sistema de Registro de Ponto com Reconhecimento Facial

## Instrução principal

Implemente um MVP funcional de um sistema de registro de ponto com reconhecimento facial, seguindo integralmente os requisitos desta especificação.

Não se limite a criar um planejamento, uma arquitetura teórica ou telas estáticas. Implemente o código, configure as dependências, crie o banco de dados, escreva os testes e documente como executar e validar o sistema.

Trabalhe diretamente no repositório disponível. Antes de alterar arquivos existentes, inspecione sua estrutura e preserve funcionalidades que já existam e sejam relevantes.

Tome decisões técnicas razoáveis sem interromper a implementação para perguntar sobre detalhes que possam ser definidos por padrões seguros. Se houver uma limitação técnica ou de licenciamento, documente-a e escolha uma alternativa adequada.

O objetivo é entregar um MVP que funcione localmente em um MacBook com Apple Silicon M3 e 16 GB de RAM, sem depender de serviços externos pagos.

# 1. Objetivo do produto

Desenvolver uma aplicação web local para registro de ponto de funcionários por reconhecimento facial.

O sistema deve permitir:

1. Cadastrar funcionários e suas referências biométricas.
2. Listar e consultar funcionários.
3. Desativar funcionários e excluir seus dados biométricos.
4. Capturar uma imagem pela webcam.
5. Identificar um funcionário utilizando reconhecimento facial.
6. Registrar o ponto com data e hora geradas pelo servidor.
7. Consultar o histórico de registros.
8. Executar todo o processamento facial localmente.

Não implementar folha de pagamento, escalas, banco de horas, cálculo de jornada, gestão de férias ou integrações com sistemas externos.

O sistema é um MVP técnico e não deve ser apresentado como uma solução trabalhista certificada ou como um sistema antifraude já validado.

# 2. Stack tecnológica

Utilizar as seguintes tecnologias:

## Frontend

- React.
- TypeScript.
- Vite.
- npm.
- CSS moderno ou uma biblioteca leve de componentes.
- API de webcam do navegador (`navigator.mediaDevices.getUserMedia`).

## Backend

- Node.js.
- TypeScript.
- Express.
- npm.
- SQLite.
- Uma biblioteca adequada para migrations e acesso ao banco, escolhida de forma consistente.

## Reconhecimento facial

- Python.
- Poetry para gerenciamento de dependências e ambiente virtual.
- FastAPI para disponibilizar uma API HTTP local.
- OpenCV para processamento de imagens.
- YuNet para detecção facial.
- SFace para extração de embeddings e comparação facial.
- NumPy para operações numéricas.
- ONNX Runtime, se necessário para os modelos selecionados.

Esses modelos são a primeira opção técnica, não uma exigência que justifique violar licenças. Antes de utilizá-los, verifique as licenças aplicáveis aos arquivos exatos dos pesos pré-treinados. Se os pesos escolhidos não puderem ser utilizados no cenário pretendido, selecione uma alternativa com licença adequada e documentada.

Não treinar modelos próprios.

Não utilizar serviços de reconhecimento facial em nuvem.

Não enviar imagens faciais para APIs externas.

# 3. Arquitetura

Separar a aplicação em três componentes.

## 3.1. Frontend React

Responsável por:

- Exibir a interface administrativa.
- Cadastrar funcionários.
- Capturar imagens pela webcam.
- Listar e desativar funcionários.
- Iniciar uma tentativa de registro de ponto.
- Exibir resultados de reconhecimento.
- Consultar o histórico de pontos.
- Tratar estados de carregamento, sucesso e erro.

O frontend não deve decidir qual funcionário foi reconhecido nem gerar o horário oficial do ponto.

## 3.2. Backend Node.js

Responsável por:

- Expor a API utilizada pelo frontend.
- Validar requisições.
- Gerenciar funcionários.
- Gerenciar embeddings cadastrados.
- Encaminhar imagens ao serviço Python.
- Comparar o resultado recebido com as regras de negócio.
- Persistir registros no SQLite.
- Gerar timestamps no servidor.
- Impedir registros duplicados.
- Gerenciar a desativação de funcionários.
- Expor endpoints de saúde e documentação.

O Node.js será a única camada autorizada a modificar o banco de dados.

A identidade do funcionário deve ser obtida pelo reconhecimento facial, nunca confiada a partir de um `employee_id` enviado pelo frontend durante o registro de ponto.

## 3.3. Serviço Python

Responsável por:

- Carregar os modelos ONNX.
- Detectar rostos.
- Verificar condições mínimas de qualidade da imagem.
- Alinhar os rostos.
- Extrair embeddings.
- Comparar embeddings.
- Retornar candidatos, pontuações e motivos de rejeição.

O Python não deve acessar diretamente o banco SQLite nem registrar pontos.

Os modelos devem ser carregados na inicialização, não a cada requisição.

O serviço deve funcionar em `127.0.0.1` por padrão e não deve ser exposto à rede local sem configuração explícita.

# 4. Reconhecimento facial

## 4.1. Cadastro biométrico

Durante o cadastro, o sistema deve:

1. Receber a imagem capturada pela webcam.
2. Detectar os rostos.
3. Exigir exatamente um rosto válido.
4. Verificar qualidade mínima, resolução e nitidez.
5. Alinhar o rosto usando os pontos faciais.
6. Extrair o embedding com o modelo pré-treinado.
7. Validar a dimensão e a consistência do vetor.
8. Associar o embedding ao funcionário.
9. Salvar o embedding no banco por meio do backend.

Para o MVP, uma amostra aprovada por funcionário é suficiente. Estruture o código para permitir múltiplas amostras no futuro.

Não persistir a imagem facial original por padrão.

## 4.2. Identificação durante o ponto

Durante uma tentativa de registro:

1. O navegador captura uma imagem.
2. O backend recebe a imagem.
3. O backend consulta os funcionários ativos e seus embeddings.
4. O backend encaminha a imagem e a galeria ativa ao serviço Python.
5. O Python detecta e alinha o rosto.
6. O Python extrai o embedding.
7. O Python compara o vetor com os embeddings cadastrados.
8. O Python retorna o candidato mais provável, sua pontuação e eventuais ambiguidades.
9. O Node.js aplica as regras de aceitação.
10. O Node.js registra o ponto apenas se todas as condições forem satisfeitas.

Para uma galeria pequena, utilizar comparação direta dos vetores. Não implementar banco vetorial especializado no MVP.

## 4.3. Similaridade e limiar

Utilizar uma métrica de similaridade compatível com o modelo escolhido, como similaridade por cosseno quando aplicável.

O limiar de aceitação deve ser configurável por variável de ambiente ou arquivo de configuração.

Não assumir que um valor de similaridade é universalmente válido.

Documentar um valor inicial exclusivamente para desenvolvimento, indicando que ele deve ser validado com amostras reais antes de qualquer utilização operacional.

Rejeitar a identificação quando:

- Nenhum candidato atingir o limiar.
- A imagem não contiver um rosto.
- A imagem contiver múltiplos rostos.
- A qualidade for insuficiente.
- Houver ambiguidade entre candidatos.
- O serviço de reconhecimento estiver indisponível.
- O funcionário identificado não estiver ativo.

Não registrar ponto automaticamente quando houver falha.

## 4.4. Controle de versões dos embeddings

Armazenar, junto a cada embedding:

- Nome do modelo.
- Versão ou revisão do modelo.
- Dimensão do vetor.
- Data de criação.

Embeddings de modelos incompatíveis não devem ser comparados.

Se houver alteração de modelo, documentar a necessidade de regenerar os embeddings a partir de novas capturas autorizadas. Não assumir que embeddings antigos serão compatíveis com um modelo novo.

## 4.5. Antifraude

Não alegar que a comparação facial isolada garante que uma pessoa esteja fisicamente presente.

O MVP deve utilizar captura deliberada iniciada pelo usuário, e não vigilância passiva.

Documentar que fotos impressas, imagens em celulares e vídeos podem enganar um sistema sem proteção específica contra ataques de apresentação.

Não simular um mecanismo de liveness que não exista.

Deixar a arquitetura preparada para uma implementação futura de PAD (*Presentation Attack Detection*) ou liveness, mas não tornar essa funcionalidade fictícia um requisito para considerar concluído o MVP básico.

# 5. Gerenciamento de versões e reprodutibilidade

Este requisito é obrigatório.

Todos os componentes devem possuir versões e dependências documentadas e reproduzíveis. O projeto não pode depender de versões globais desconhecidas instaladas na máquina.

## 5.1. Node.js e npm

Utilizar `nvm` para gerenciar a versão do Node.js.

Criar um arquivo `.nvmrc` na raiz do repositório, com a versão exata do Node.js escolhida e validada para o projeto.

Definir uma versão compatível do npm e documentá-la.

Criar e versionar:

- `.nvmrc`.
- `package.json`.
- `package-lock.json`.

Utilizar `npm ci` na configuração padrão do ambiente.

Utilizar os campos `engines` para documentar as versões suportadas.

Criar scripts npm para configuração, desenvolvimento, build e testes.

Se frontend e backend possuírem `package.json` separados, utilizar workspaces npm ou scripts de orquestração consistentes na raiz.

## 5.2. Python e Poetry

Utilizar Poetry como ferramenta oficial de gerenciamento do ambiente Python.

Criar e versionar:

- `pyproject.toml`.
- `poetry.lock`.

Requisitos:

- Fixar a versão do Poetry utilizada.
- Declarar a versão do Python compatível com as dependências.
- Validar a instalação em macOS ARM64.
- Utilizar ambiente virtual isolado.
- Não instalar dependências do projeto globalmente.
- Utilizar `poetry install` para instalar dependências.
- Utilizar `poetry run` para executar a aplicação e os testes.
- Documentar como criar e ativar o ambiente virtual.
- Não manter um `requirements.txt` independente como segunda fonte de verdade.

Validar a compatibilidade de OpenCV, NumPy, FastAPI, ONNX Runtime e demais dependências com o Apple Silicon.

Se uma biblioteca não oferecer suporte adequado à plataforma, encontrar uma alternativa compatível e documentar a decisão.

## 5.3. Modelos ONNX

Documentar:

- Origem de cada arquivo.
- Nome e versão do modelo.
- Licença do código e dos pesos.
- Procedimento de download.
- Checksums, quando disponíveis em fontes confiáveis.

Criar um script idempotente para baixar e verificar os modelos necessários.

Não baixar executáveis ou modelos de fontes desconhecidas.

Não versionar pesos grandes ou com restrições de redistribuição sem justificativa e autorização.

## 5.4. Instalação automatizada

Criar scripts para simplificar o onboarding.

O fluxo documentado deve contemplar:

1. Verificar as ferramentas necessárias.
2. Ativar a versão de Node.js definida em `.nvmrc`.
3. Instalar dependências com `npm ci`.
4. Verificar a versão do Poetry.
5. Criar o ambiente Python e instalar as dependências.
6. Baixar e validar os modelos.
7. Criar ou migrar o banco de dados.
8. Iniciar os serviços.
9. Executar os testes.

Disponibilizar, quando tecnicamente adequado:

- `npm run setup`.
- `npm run dev`.
- `npm run build`.
- `npm test`.

Criar comandos auxiliares para o serviço Python, sem exigir que o desenvolvedor memorize comandos internos de cada componente.

A configuração deve ser idempotente: executá-la novamente não pode apagar registros existentes, duplicar dados ou corromper o ambiente.

Não exigir Docker para executar o MVP.

# 6. Cadastro de funcionários

Criar uma página administrativa de cadastro com:

- Nome completo.
- Identificador interno opcional.
- Captura facial pela webcam.
- Pré-visualização da imagem.
- Botão para capturar.
- Botão para confirmar o cadastro.
- Mensagens de validação.

Fluxo:

1. O administrador preenche os dados.
2. A aplicação solicita acesso à webcam.
3. O funcionário posiciona o rosto.
4. O administrador captura a imagem.
5. O frontend envia os dados ao backend.
6. O backend solicita a extração do embedding ao Python.
7. O backend valida a resposta.
8. O funcionário e seu embedding são persistidos em uma operação consistente.
9. A interface exibe a confirmação.

Regras:

- Recusar imagens inválidas.
- Exigir exatamente um rosto.
- Impedir duplicidade de identificadores internos.
- Não permitir cadastros incompletos.
- Permitir cancelar a operação.
- Encerrar a webcam ao sair da página.
- Não salvar imagens originais por padrão.

# 7. Listagem e remoção de funcionários

Criar uma página com:

- Nome.
- Identificador interno.
- Status.
- Data de cadastro.
- Busca por nome.
- Busca por identificador.
- Ação para desativar.

A remoção deve exigir confirmação.

Ao desativar um funcionário:

1. Marcar o funcionário como inativo.
2. Impedir novos registros.
3. Excluir os embeddings da galeria ativa.
4. Excluir seus dados biométricos conforme a política definida.
5. Preservar a integridade referencial do histórico de ponto.

Não excluir registros históricos automaticamente.

Implementar também a exclusão dos dados biométricos associados ao funcionário, sem deixar cópias ocultas em caches, arquivos temporários ou logs.

A exclusão definitiva dos dados pessoais deve respeitar a política de retenção aplicável. Não implementar um mecanismo que prometa exclusão completa se houver cópias não controladas.

# 8. Registro de ponto

Criar uma página chamada **Bater Ponto**.

A interface deve apresentar:

- Visualização da webcam.
- Orientações para posicionamento.
- Botão para capturar imagem.
- Indicador de processamento.
- Resultado da identificação.
- Nome do funcionário reconhecido.
- Data e hora do registro.
- Mensagens de erro compreensíveis.

O usuário deve iniciar deliberadamente cada captura.

Não utilizar reconhecimento contínuo em segundo plano.

## Regras do registro

- O horário oficial é gerado pelo backend.
- O cliente não pode fornecer ou alterar o timestamp.
- A identificação precisa ser concluída antes da gravação.
- O funcionário deve estar ativo no momento da gravação.
- Uma tentativa malsucedida não pode gerar registro de ponto.
- O sistema deve ser resistente a requisições repetidas e concorrentes.

Implementar proteção técnica contra duplicidade. Para o MVP, utilizar um intervalo configurável de 30 segundos entre registros consecutivos do mesmo funcionário.

Esse intervalo serve apenas como proteção contra duplicidade acidental; não deve ser apresentado como regra trabalhista.

Não implementar alternância automática entre entrada e saída. Cada operação válida gera um evento de ponto independente.

## Fuso horário

Persistir timestamps em UTC, de maneira consistente.

Exibir os horários em `America/Sao_Paulo`.

Não depender do relógio ou do fuso horário configurado no navegador.

# 9. Histórico de pontos

Criar uma página com:

- Data e hora.
- Nome do funcionário.
- Identificador interno.
- Pontuação de similaridade.
- Modelo utilizado.
- Paginação.
- Filtro por funcionário.
- Filtro por intervalo de datas.

Exibir primeiro os registros mais recentes.

Os registros anteriores devem continuar consultáveis após a desativação de um funcionário.

Não armazenar imagens faciais originais no histórico.

# 10. Banco de dados

Utilizar SQLite com migrations versionadas.

O backend Node.js é o único responsável pela escrita no banco.

## Tabela `employees`

Campos:

- `id`: identificador único.
- `name`: nome completo.
- `employee_code`: identificador opcional.
- `active`: status do funcionário.
- `created_at`: timestamp.
- `updated_at`: timestamp.

Aplicar unicidade ao identificador interno quando preenchido.

## Tabela `face_embeddings`

Campos:

- `id`: identificador único.
- `employee_id`: referência ao funcionário.
- `embedding`: vetor numérico serializado.
- `model_name`: nome do modelo.
- `model_version`: versão do modelo.
- `created_at`: timestamp.

Validar dimensão e compatibilidade dos embeddings.

## Tabela `time_records`

Campos:

- `id`: identificador único.
- `employee_id`: referência ao funcionário.
- `recorded_at`: timestamp UTC do servidor.
- `similarity_score`: pontuação calculada.
- `model_name`: nome do modelo.
- `model_version`: versão do modelo.
- `created_at`: timestamp de criação.

Criar índices para consultas por funcionário e data.

Configurar integridade referencial e transações nas operações que precisem atualizar múltiplas tabelas.

# 11. API Node.js

Implementar os seguintes endpoints.

## Funcionários

- `GET /api/employees`: listar funcionários ativos.
- `GET /api/employees/:id`: consultar um funcionário.
- `POST /api/employees`: cadastrar funcionário e embedding.
- `DELETE /api/employees/:id`: desativar funcionário e excluir seus embeddings ativos.

## Registro de ponto

- `POST /api/attendance/recognize`: reconhecer um funcionário sem gravar o ponto.
- `POST /api/attendance`: reconhecer e registrar o ponto se a validação for aprovada.
- `GET /api/attendance`: consultar histórico com filtros e paginação.
- `GET /api/attendance/:id`: consultar um registro.

## Saúde

- `GET /api/health`: verificar o backend.
- `GET /api/health/recognition`: verificar o serviço Python e a disponibilidade dos modelos.

Implementar validação de entradas, respostas HTTP consistentes e tratamento centralizado de erros.

Documentar a API usando Swagger/OpenAPI.

Não expor embeddings completos nos endpoints públicos da aplicação.

## Contrato de identificação

O serviço Python deve retornar uma estrutura equivalente a:

- `matched`: indicação de correspondência.
- `employee_id`: candidato identificado, quando aplicável.
- `similarity`: pontuação.
- `reason`: motivo da rejeição, quando houver.
- `model_name`.
- `model_version`.

Os nomes dos campos podem ser adaptados, desde que sejam consistentes e documentados.

O backend deve validar a resposta antes de registrar o ponto.

# 12. API Python

Implementar:

- `GET /health`.
- `POST /faces/enroll`.
- `POST /faces/identify`.

## `/faces/enroll`

Recebe uma imagem, valida a presença de um único rosto e retorna um embedding compatível com o modelo.

## `/faces/identify`

Recebe uma imagem e os embeddings dos funcionários ativos.

Retorna o candidato, a pontuação, a decisão técnica e o motivo de rejeição quando aplicável.

O serviço não grava pontos nem modifica o banco de dados.

Validar tamanho e conteúdo das imagens, dimensões dos vetores e versões dos modelos.

Limitar o tamanho das requisições e evitar carregamentos repetidos dos modelos.

# 13. Interface e experiência do usuário

Implementar as páginas abaixo.

## Dashboard

Exibir:

- Quantidade de funcionários ativos.
- Quantidade de registros do dia.
- Registros recentes.
- Atalhos para cadastro, funcionários, histórico e bater ponto.

## Funcionários

Exibir tabela com busca, status e ações administrativas.

## Cadastro

Exibir formulário e captura facial com pré-visualização.

## Bater Ponto

Exibir webcam, instruções, captura e resultado da identificação.

## Histórico

Exibir registros paginados, com filtros por funcionário e período.

A interface deve ser minimalista, responsiva e consistente.

Implementar estados de carregamento, mensagens de erro, confirmações e feedback de sucesso.

Não deixar botões sem funcionalidade.

Não utilizar dados fictícios como se fossem dados reais após a integração com o backend.

# 14. Segurança e privacidade

Mesmo em um MVP local, implementar:

- Validação de conteúdo e tamanho de imagens.
- Tratamento seguro de erros.
- CORS restrito ao frontend configurado.
- Serviço Python acessível apenas localmente por padrão.
- Proteção contra gravação de ponto por ID arbitrário.
- Ausência de imagens e embeddings em logs.
- Exclusão de arquivos temporários após o processamento.
- Segregação dos dados biométricos.
- Controle de acesso à área administrativa.
- Configuração de retenção e exclusão de dados.
- `.gitignore` adequado para dados locais e credenciais.

Se não houver autenticação administrativa implementada, documentar claramente essa limitação e restringir a utilização a um ambiente de desenvolvimento isolado. Preferir uma autenticação local simples para as operações administrativas.

Não tratar embeddings como dados anônimos. Eles continuam sendo dados biométricos sensíveis.

Não implementar liveness fictício nem afirmar proteção antifraude não testada.

Documentar a necessidade de avaliar a LGPD, a base legal aplicável e os requisitos da regulamentação brasileira de registro eletrônico de ponto antes da utilização operacional.

# 15. Testes automatizados

Implementar testes unitários e de integração.

Cobrir, no mínimo:

- Cadastro válido.
- Cadastro sem rosto.
- Cadastro com múltiplos rostos.
- Imagem inválida.
- Funcionário duplicado.
- Reconhecimento positivo.
- Rejeição de pessoa desconhecida.
- Rejeição de funcionário inativo.
- Registro com timestamp do servidor.
- Bloqueio de duplicidade.
- Requisições concorrentes.
- Exclusão de embeddings ao desativar um funcionário.
- Preservação do histórico após a desativação.
- Serviço Python indisponível.
- Modelos ausentes.
- Dimensão incorreta do embedding.
- Incompatibilidade de versão de modelo.
- Falhas de comunicação entre serviços.

Separar os testes de negócio dos testes com modelos reais.

Criar um procedimento documentado para avaliar falsos aceites e falsas rejeições com imagens autorizadas, obtidas em condições variadas de iluminação e ângulo.

Não declarar o sistema seguro para uso real com base apenas em testes unitários.

# 16. Estrutura de diretórios

Utilizar uma estrutura semelhante à seguinte, adaptando-a quando necessário:

face-attendance/
├── frontend/
│   ├── src/
│   ├── package.json
│   └── vite.config.ts
├── backend/
│   ├── src/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── repositories/
│   │   └── database/
│   ├── migrations/
│   └── package.json
├── recognition/
│   ├── app/
│   │   ├── main.py
│   │   ├── detector.py
│   │   ├── embedder.py
│   │   ├── matcher.py
│   │   └── schemas.py
│   ├── models/
│   ├── tests/
│   ├── pyproject.toml
│   └── poetry.lock
├── docs/
│   ├── architecture.md
│   ├── api.md
│   └── model-licenses.md
├── .nvmrc
├── .env.example
├── .gitignore
├── package.json
└── README.md

Se utilizar workspaces npm, organizar os arquivos de forma que a raiz consiga executar os comandos necessários sem duplicar desnecessariamente as configurações.

Não versionar o banco de dados de desenvolvimento, dados de funcionários, imagens pessoais, arquivos `.env` ou modelos que não possam ser redistribuídos.

# 17. Execução no macOS Apple Silicon

O ambiente principal é um MacBook Air M3 com 16 GB de RAM.

O MVP deve executar localmente, inicialmente usando CPU.

Não exigir GPU dedicada, Docker, Kubernetes, nuvem ou serviços pagos.

Fornecer documentação completa para:

1. Instalar as ferramentas necessárias.
2. Selecionar as versões fixadas de Node.js e Python.
3. Instalar dependências.
4. Baixar e validar modelos.
5. Criar o banco.
6. Iniciar os serviços.
7. Executar os testes.
8. Encerrar os serviços.
9. Resolver problemas comuns.

O navegador deve acessar a webcam por meio das permissões apropriadas. Documentar os requisitos de contexto seguro do navegador para captura de mídia, especialmente se houver mudança para acesso pela rede local.

# 18. Scripts de desenvolvimento

Fornecer scripts npm na raiz para orquestrar o ambiente.

Como referência:

- `npm run setup`: validar ferramentas e preparar dependências.
- `npm run dev`: iniciar frontend, backend e serviço Python.
- `npm run build`: compilar frontend e backend.
- `npm test`: executar os testes automatizados.

Criar scripts adicionais para migrations, verificação de saúde e testes do serviço Python.

Os scripts devem exibir erros claramente, propagar falhas e permitir encerrar os processos sem deixar serviços órfãos.

Não fazer o script de configuração apagar dados persistidos ou sobrescrever configurações do usuário sem autorização.

# 19. Critérios de aceitação

A implementação será considerada concluída quando:

1. O repositório puder ser configurado seguindo o README em um ambiente limpo.
2. As versões e dependências estiverem fixadas e documentadas.
3. Os modelos necessários forem baixados e validados.
4. O frontend, o backend e o serviço Python iniciarem localmente.
5. Um funcionário puder ser cadastrado com um embedding válido.
6. Funcionários puderem ser listados e consultados.
7. Um funcionário puder ser desativado.
8. A desativação impedir novos registros e retirar os embeddings da galeria ativa.
9. Uma pessoa cadastrada puder ser reconhecida nas condições de teste.
10. Uma pessoa desconhecida for rejeitada nas condições avaliadas.
11. Um ponto válido for persistido com horário do servidor.
12. Registros anteriores continuarem consultáveis após a desativação.
13. O histórico puder ser filtrado e paginado.
14. As falhas de captura e reconhecimento forem tratadas sem gravar pontos inválidos.
15. Os testes automatizados forem executados e seus resultados documentados.
16. Não houver dependência de APIs pagas ou processamento facial em nuvem.
17. A documentação de licenciamento dos modelos estiver disponível.
18. As limitações de segurança, biometria e conformidade trabalhista estiverem explícitas.

# 20. Ordem de implementação

Execute o trabalho nesta ordem:

1. Inspecione o repositório e confirme a estrutura.
2. Defina e documente as versões compatíveis das ferramentas.
3. Verifique as licenças e selecione os modelos.
4. Configure npm, nvm, Poetry e os arquivos de lock.
5. Implemente o banco de dados e as migrations.
6. Implemente o serviço Python e valide a extração e comparação de embeddings.
7. Implemente o backend e a comunicação com Python.
8. Implemente o cadastro e a desativação de funcionários.
9. Implemente o registro de ponto.
10. Implemente o histórico.
11. Integre as páginas React ao backend.
12. Escreva e execute os testes.
13. Valide a instalação em um ambiente limpo, na medida em que o ambiente disponível permitir.
14. Finalize a documentação.

Priorize um fluxo funcional de ponta a ponta. Não gaste tempo com funcionalidades secundárias antes de conseguir cadastrar um funcionário, reconhecê-lo e registrar um ponto real no banco.

Ao concluir, apresente um resumo dos arquivos criados, das decisões técnicas, dos comandos para executar o sistema, dos testes efetivamente executados e das limitações ainda existentes.

Não declare nenhum teste como aprovado sem tê-lo executado. Não declare a implementação completa se algum critério de aceitação importante permanecer pendente.