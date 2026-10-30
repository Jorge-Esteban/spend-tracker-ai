// Error de dominio con status HTTP y mensaje seguro para el cliente.
export class AppError extends Error {
  constructor(status, message, code = undefined) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
  }
}

export const badRequest = (msg, code) => new AppError(400, msg, code);
export const unauthorized = (msg = 'No autenticado') => new AppError(401, msg, 'UNAUTHORIZED');
export const forbidden = (msg = 'No permitido', code = 'FORBIDDEN') => new AppError(403, msg, code);
export const notFound = (msg = 'No encontrado') => new AppError(404, msg, 'NOT_FOUND');
export const conflict = (msg, code = 'CONFLICT') => new AppError(409, msg, code);
