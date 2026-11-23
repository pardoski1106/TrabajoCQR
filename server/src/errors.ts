/** Errores de dominio/aplicacion. La capa HTTP los traduce a codigos de estado (ver api/errorHandler.ts). */
export class AppError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly code: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 400, 'VALIDACION', details);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, 404, 'NO_ENCONTRADO');
  }
}

/** Violacion de la concurrencia optimista: otro comando escribio antes la misma version. */
export class ConcurrencyError extends AppError {
  constructor(message = 'Conflicto de concurrencia: intenta de nuevo') {
    super(message, 409, 'CONFLICTO');
  }
}
