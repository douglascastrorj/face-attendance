// Cliente da API do backend. O frontend nunca decide identidade nem horário: apenas exibe o que o servidor retorna.

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

const TOKEN_KEY = 'fa.admin.token';

export const tokenStore = {
  get: () => {
    try {
      return sessionStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (t: string | null) => {
    try {
      if (t) sessionStorage.setItem(TOKEN_KEY, t);
      else sessionStorage.removeItem(TOKEN_KEY);
    } catch {
      /* armazenamento indisponível: sessão só em memória */
    }
  },
};

let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (fn: (() => void) | null) => {
  onUnauthorized = fn;
};

export async function request<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const headers: Record<string, string> = {};
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError(0, 'network_error', 'Não foi possível conectar ao servidor. Verifique se o backend está em execução.');
  }
  if (res.status === 204) return undefined as T;
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* corpo vazio ou não-JSON */
  }
  if (!res.ok) {
    const e = (data as { error?: { code?: string; message?: string; details?: Record<string, unknown> } })?.error;
    if (res.status === 401 && path !== '/api/auth/login') onUnauthorized?.();
    throw new ApiError(res.status, e?.code ?? 'http_error', e?.message ?? `Erro ${res.status}`, e?.details);
  }
  return data as T;
}

export const qs = (params: Record<string, string | number | undefined | null>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
};

// Tipos espelhando o contrato do backend (docs/api.md)
export interface Employee {
  id: number;
  name: string;
  employee_code: string | null;
  active: boolean;
  created_at: string;
  created_at_local: string;
  updated_at: string;
  deactivated_at: string | null;
  biometric_samples?: { id: number; model_name: string; model_version: string; embedding_dim: number; created_at: string }[];
}

export interface TimeRecord {
  id: number;
  recorded_at: string;
  recorded_at_local: string;
  timezone: string;
  similarity_score: number;
  model_name: string;
  model_version: string;
  employee: { id: number; name: string; employee_code: string | null; active: boolean };
}

export interface Paged<T> {
  items: T[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export interface Dashboard {
  date: string;
  timezone: string;
  active_employees: number;
  records_today: number;
  recent: TimeRecord[];
  incompatible_embeddings: number;
}

export interface RecognitionHealth {
  status: string;
  service_reachable: boolean;
  models_loaded: boolean;
  model_name?: string | null;
  model_version?: string | null;
  threshold?: number;
  error?: string | null;
}

export const api = {
  authStatus: () => request<{ auth_disabled: boolean; authenticated: boolean }>('GET', '/api/auth/status'),
  login: (password: string) => request<{ token: string; expires_at: string }>('POST', '/api/auth/login', { password }),
  logout: () => request<void>('POST', '/api/auth/logout'),
  dashboard: () => request<Dashboard>('GET', '/api/dashboard'),
  recognitionHealth: () =>
    request<RecognitionHealth>('GET', '/api/health/recognition').catch((e: ApiError) => {
      // 503 é um estado válido (serviço degradado); devolve o diagnóstico mesmo assim.
      if (e.status === 503) return { status: 'down', service_reachable: false, models_loaded: false, error: e.message };
      throw e;
    }),
  listEmployees: (p: { status?: string; name?: string; code?: string; page?: number; page_size?: number }, signal?: AbortSignal) =>
    request<Paged<Employee>>('GET', `/api/employees${qs(p)}`, undefined, signal),
  getEmployee: (id: number) => request<Employee>('GET', `/api/employees/${id}`),
  createEmployee: (body: { name: string; employee_code: string | null; image_base64: string }) =>
    request<Employee>('POST', '/api/employees', body),
  deactivateEmployee: (id: number) =>
    request<{ employee: Employee; biometric_samples_deleted: number }>('DELETE', `/api/employees/${id}`),
  registerAttendance: (image_base64: string) => request<TimeRecord>('POST', '/api/attendance', { image_base64 }),
  listAttendance: (p: { employee_id?: number; from?: string; to?: string; page?: number; page_size?: number }) =>
    request<Paged<TimeRecord>>('GET', `/api/attendance${qs(p)}`),
};
