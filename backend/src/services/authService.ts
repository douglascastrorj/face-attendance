import crypto from 'node:crypto';
import { AppError } from '../errors.js';
import type { Clock } from '../time.js';

/**
 * Autenticação administrativa local e simples: senha única (ADMIN_PASSWORD) → token de sessão opaco em memória.
 * Reiniciar o backend invalida as sessões. Não substitui um IAM real.
 */
export class AuthService {
  private readonly sessions = new Map<string, number>();
  private readonly failures = new Map<string, number[]>();
  private readonly passwordHash: Buffer | null;

  constructor(
    password: string | undefined,
    private readonly ttlMs: number,
    private readonly clock: Clock,
    readonly disabled = false,
  ) {
    this.passwordHash = password ? sha256(password) : null;
  }

  login(password: string, clientKey: string): { token: string; expires_at: string } {
    const now = this.clock().getTime();
    const recent = (this.failures.get(clientKey) ?? []).filter((t) => now - t < 60_000);
    if (recent.length >= 5) {
      throw new AppError(429, 'too_many_attempts', 'Muitas tentativas. Aguarde um minuto.');
    }
    if (!this.passwordHash || !crypto.timingSafeEqual(sha256(password), this.passwordHash)) {
      this.failures.set(clientKey, [...recent, now]);
      throw new AppError(401, 'invalid_credentials', 'Senha inválida');
    }
    this.failures.delete(clientKey);
    const token = crypto.randomBytes(32).toString('base64url');
    const expires = now + this.ttlMs;
    this.sessions.set(token, expires);
    return { token, expires_at: new Date(expires).toISOString() };
  }

  verify(token: string | undefined): boolean {
    if (this.disabled) return true;
    if (!token) return false;
    const exp = this.sessions.get(token);
    if (!exp) return false;
    if (exp <= this.clock().getTime()) {
      this.sessions.delete(token);
      return false;
    }
    return true;
  }

  logout(token: string | undefined) {
    if (token) this.sessions.delete(token);
  }
}

const sha256 = (s: string) => crypto.createHash('sha256').update(s, 'utf8').digest();
