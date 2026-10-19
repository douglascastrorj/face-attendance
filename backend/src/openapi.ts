// Especificação OpenAPI 3.1 da API pública do backend. Servida em /api/docs (Swagger UI) e /api/openapi.json.

const errorSchema = {
  type: 'object',
  properties: {
    error: {
      type: 'object',
      properties: {
        code: { type: 'string', example: 'recognition_no_match' },
        message: { type: 'string' },
        details: { type: 'object', additionalProperties: true },
      },
      required: ['code', 'message'],
    },
  },
};

const employee = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    name: { type: 'string' },
    employee_code: { type: ['string', 'null'] },
    active: { type: 'boolean' },
    created_at: { type: 'string', format: 'date-time', description: 'UTC' },
    created_at_local: { type: 'string', description: 'Formatado em America/Sao_Paulo' },
    updated_at: { type: 'string', format: 'date-time' },
    deactivated_at: { type: ['string', 'null'], format: 'date-time' },
  },
};

const timeRecord = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    recorded_at: { type: 'string', format: 'date-time', description: 'Horário oficial (UTC), gerado pelo servidor' },
    recorded_at_local: { type: 'string', example: '17/10/2026, 09:01:22' },
    timezone: { type: 'string', example: 'America/Sao_Paulo' },
    similarity_score: { type: 'number' },
    model_name: { type: 'string' },
    model_version: { type: 'string' },
    employee: {
      type: 'object',
      properties: {
        id: { type: 'integer' },
        name: { type: 'string' },
        employee_code: { type: ['string', 'null'] },
        active: { type: 'boolean' },
      },
    },
  },
};

const imageBody = {
  required: true,
  content: {
    'application/json': {
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['image_base64'],
        properties: { image_base64: { type: 'string', description: 'JPEG/PNG como data URL ou base64 (máx. 4 MB)' } },
      },
    },
  },
};

const err = (description: string) => ({ description, content: { 'application/json': { schema: errorSchema } } });
const admin = [{ bearerAuth: [] }];
const paged = (item: object) => ({
  type: 'object',
  properties: {
    items: { type: 'array', items: item },
    page: { type: 'integer' },
    page_size: { type: 'integer' },
    total: { type: 'integer' },
    total_pages: { type: 'integer' },
  },
});

export const openApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'face-attendance API',
    version: '0.1.0',
    description:
      'MVP técnico de registro de ponto com reconhecimento facial local. Não é solução trabalhista certificada nem sistema antifraude validado. Embeddings nunca são expostos.',
  },
  servers: [{ url: '/' }],
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', description: 'Token de POST /api/auth/login' } },
    schemas: { Error: errorSchema, Employee: employee, TimeRecord: timeRecord },
  },
  paths: {
    '/api/health': { get: { tags: ['Saúde'], summary: 'Saúde do backend', responses: { 200: { description: 'OK' } } } },
    '/api/health/recognition': {
      get: {
        tags: ['Saúde'],
        summary: 'Saúde do serviço Python e disponibilidade/compatibilidade dos modelos',
        responses: { 200: { description: 'Serviço e modelos OK' }, 503: { description: 'Indisponível ou degradado' } },
      },
    },
    '/api/auth/login': {
      post: {
        tags: ['Autenticação'],
        summary: 'Login administrativo local',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', properties: { password: { type: 'string' } } } } },
        },
        responses: { 200: { description: '{ token, expires_at }' }, 401: err('Senha inválida'), 429: err('Muitas tentativas') },
      },
    },
    '/api/auth/logout': { post: { tags: ['Autenticação'], security: admin, responses: { 204: { description: 'OK' } } } },
    '/api/auth/status': { get: { tags: ['Autenticação'], responses: { 200: { description: 'Estado da sessão' } } } },
    '/api/dashboard': {
      get: { tags: ['Dashboard'], security: admin, summary: 'Contadores e registros recentes', responses: { 200: { description: 'OK' } } },
    },
    '/api/employees': {
      get: {
        tags: ['Funcionários'],
        security: admin,
        summary: 'Listar funcionários (padrão: ativos)',
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['active', 'inactive', 'all'], default: 'active' } },
          { name: 'name', in: 'query', schema: { type: 'string' } },
          { name: 'code', in: 'query', schema: { type: 'string' } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'page_size', in: 'query', schema: { type: 'integer', default: 20, maximum: 100 } },
        ],
        responses: { 200: { description: 'OK', content: { 'application/json': { schema: paged(employee) } } }, 401: err('Não autenticado') },
      },
      post: {
        tags: ['Funcionários'],
        security: admin,
        summary: 'Cadastrar funcionário com referência biométrica',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                additionalProperties: false,
                required: ['name', 'image_base64'],
                properties: {
                  name: { type: 'string', minLength: 3 },
                  employee_code: { type: ['string', 'null'] },
                  image_base64: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Criado', content: { 'application/json': { schema: employee } } },
          400: err('Dados ou imagem inválidos'),
          409: err('Identificador interno duplicado'),
          422: err('Imagem rejeitada (sem rosto, múltiplos rostos, baixa qualidade)'),
          503: err('Serviço de reconhecimento indisponível'),
        },
      },
    },
    '/api/employees/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
      get: {
        tags: ['Funcionários'],
        security: admin,
        summary: 'Consultar funcionário (inclui metadados das amostras biométricas, sem vetores)',
        responses: { 200: { description: 'OK' }, 404: err('Não encontrado') },
      },
      delete: {
        tags: ['Funcionários'],
        security: admin,
        summary: 'Desativar funcionário e excluir seus dados biométricos (histórico é preservado)',
        responses: { 200: { description: '{ employee, biometric_samples_deleted }' }, 404: err('Não encontrado') },
      },
    },
    '/api/attendance': {
      post: {
        tags: ['Ponto'],
        summary: 'Reconhecer e registrar ponto (horário gerado pelo servidor). Aceita SOMENTE a imagem.',
        requestBody: imageBody,
        responses: {
          201: { description: 'Registrado', content: { 'application/json': { schema: timeRecord } } },
          400: err('Imagem inválida ou campos extras (ex.: employee_id, timestamp)'),
          403: err('Funcionário inativo'),
          409: err('Registro duplicado dentro do intervalo configurado'),
          422: err('Não reconhecido / ambíguo / sem rosto / qualidade insuficiente'),
          502: err('Resposta inválida do serviço de reconhecimento'),
          503: err('Serviço de reconhecimento ou modelos indisponíveis'),
        },
      },
      get: {
        tags: ['Ponto'],
        security: admin,
        summary: 'Histórico (mais recentes primeiro)',
        parameters: [
          { name: 'employee_id', in: 'query', schema: { type: 'integer' } },
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date' }, description: 'Dia local (America/Sao_Paulo), inclusivo' },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date' }, description: 'Dia local, inclusivo' },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'page_size', in: 'query', schema: { type: 'integer', default: 20, maximum: 100 } },
        ],
        responses: { 200: { description: 'OK', content: { 'application/json': { schema: paged(timeRecord) } } } },
      },
    },
    '/api/attendance/recognize': {
      post: {
        tags: ['Ponto'],
        security: admin,
        summary: 'Reconhecer sem gravar (diagnóstico administrativo)',
        requestBody: imageBody,
        responses: { 200: { description: '{ employee, similarity, model_name, model_version }' }, 422: err('Não reconhecido') },
      },
    },
    '/api/attendance/{id}': {
      get: {
        tags: ['Ponto'],
        security: admin,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'OK', content: { 'application/json': { schema: timeRecord } } }, 404: err('Não encontrado') },
      },
    },
  },
};
