import type { FastifyError, FastifyInstance } from 'fastify';
import { AppError } from '../errors';

/** Formato unico de error: { error: { codigo, mensaje, detalles? } } con codigo HTTP coherente. */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((err: FastifyError | AppError, request, reply) => {
    if (err instanceof AppError) {
      request.log.warn({ codigo: err.code, mensaje: err.message }, 'Error de aplicacion');
      return reply.status(err.statusCode).send({
        error: { codigo: err.code, mensaje: err.message, detalles: err.details },
      });
    }
    const status = (err as FastifyError).statusCode;
    if (status && status >= 400 && status < 500) {
      // Errores de Fastify: JSON malformado, content-type incorrecto, etc.
      return reply.status(status).send({ error: { codigo: 'PETICION_INVALIDA', mensaje: err.message } });
    }
    request.log.error({ err }, 'Error no controlado');
    return reply.status(500).send({ error: { codigo: 'ERROR_INTERNO', mensaje: 'Error interno del servidor' } });
  });

  app.setNotFoundHandler((request, reply) =>
    reply.status(404).send({ error: { codigo: 'RUTA_NO_ENCONTRADA', mensaje: `${request.method} ${request.url} no existe` } }),
  );
}
