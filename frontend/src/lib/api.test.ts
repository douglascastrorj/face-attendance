import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, qs, request } from './api';

afterEach(() => vi.unstubAllGlobals());

describe('cliente da API', () => {
  it('converte erro padronizado do backend em ApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: () => Promise.resolve({ error: { code: 'duplicate_attendance', message: 'Ponto já registrado', details: { retry_after_seconds: 3 } } }),
      }),
    );
    const err = (await request('POST', '/api/attendance', {}).catch((e) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 409, code: 'duplicate_attendance', details: { retry_after_seconds: 3 } });
  });

  it('falha de rede vira mensagem amigável', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const err = (await request('GET', '/api/health').catch((e) => e)) as ApiError;
    expect(err.code).toBe('network_error');
  });

  it('monta query string ignorando vazios', () => {
    expect(qs({ a: 1, b: '', c: undefined, d: 'x y' })).toBe('?a=1&d=x+y');
  });
});
