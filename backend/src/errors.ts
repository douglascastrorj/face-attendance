export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new AppError(404, 'not_found', `${what} não encontrado`);
export const badRequest = (code: string, message: string, details?: Record<string, unknown>) =>
  new AppError(400, code, message, details);
