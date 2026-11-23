import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ValidationError } from '../errors';
import type { ListarMensajesHandler, ListarSalasHandler } from '../queries/handlers';

const paramsSchema = z.object({ salaId: z.string().uuid('salaId debe ser un UUID') });
// El query string llega como texto: "limite" se convierte a numero en el borde.
const querySchema = z.object({
  limite: z.coerce.number({ invalid_type_error: 'limite debe ser un numero' }).optional(),
});

/** API de CONSULTAS (lectura): solo GET, solo tablas read_*. */
export function registerQueryRoutes(
  app: FastifyInstance,
  handlers: { listarSalas: ListarSalasHandler; listarMensajes: ListarMensajesHandler },
): void {
  app.get('/api/consultas/salas', async () => ({ salas: await handlers.listarSalas() }));

  app.get('/api/consultas/salas/:salaId/mensajes', async (request) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) throw new ValidationError(params.error.issues[0]?.message ?? 'salaId invalido', params.error.issues);
    const query = querySchema.safeParse(request.query);
    if (!query.success) throw new ValidationError(query.error.issues[0]?.message ?? 'limite invalido', query.error.issues);
    const mensajes = await handlers.listarMensajes({ salaId: params.data.salaId, limite: query.data.limite });
    return { mensajes };
  });
}
