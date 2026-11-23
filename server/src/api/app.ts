import cors from '@fastify/cors';
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import { registerErrorHandler } from './errorHandler';
import { registerCommandRoutes } from './commandRoutes';
import { registerQueryRoutes } from './queryRoutes';
import type { CrearSalaHandler, EnviarMensajeHandler } from '../commands/handlers';
import type { ListarMensajesHandler, ListarSalasHandler } from '../queries/handlers';

export interface AppOptions {
  logger: FastifyBaseLogger;
  corsOrigin: string;
  roles: string[];
  /** Presentes solo si el rol "api" esta activo. */
  commands?: { crearSala: CrearSalaHandler; enviarMensaje: EnviarMensajeHandler };
  queries?: { listarSalas: ListarSalasHandler; listarMensajes: ListarMensajesHandler };
}

/** Construye la aplicacion Fastify: rutas de comandos, de consultas y /salud. */
export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({ loggerInstance: options.logger });
  await app.register(cors, { origin: options.corsOrigin === '*' ? true : options.corsOrigin.split(',') });
  registerErrorHandler(app);

  app.get('/salud', async () => ({ estado: 'ok', roles: options.roles }));
  if (options.commands) registerCommandRoutes(app, options.commands);
  if (options.queries) registerQueryRoutes(app, options.queries);
  return app;
}
