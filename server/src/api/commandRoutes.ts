import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { CrearSalaHandler, EnviarMensajeHandler } from '../commands/handlers';
import { ValidationError } from '../errors';

/** Validacion en el BORDE (forma y tipos de la peticion); las reglas de dominio las valida el handler. */
const crearSalaBody = z.object({ nombre: z.string({ required_error: 'nombre es obligatorio' }) });
const mensajeParams = z.object({ salaId: z.string().uuid('salaId debe ser un UUID') });
const mensajeBody = z.object({
  autor: z.string({ required_error: 'autor es obligatorio' }),
  texto: z.string({ required_error: 'texto es obligatorio' }),
});

function parseEdge<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, input: unknown): T {
  const r = schema.safeParse(input ?? {});
  if (!r.success) throw new ValidationError(r.error.issues[0]?.message ?? 'Peticion invalida', r.error.issues);
  return r.data;
}

/** API de COMANDOS (escritura): responde 201 con los identificadores generados. */
export function registerCommandRoutes(
  app: FastifyInstance,
  handlers: { crearSala: CrearSalaHandler; enviarMensaje: EnviarMensajeHandler },
): void {
  app.post('/api/comandos/salas', async (request, reply) => {
    const { nombre } = parseEdge(crearSalaBody, request.body);
    const result = await handlers.crearSala({ nombre });
    return reply.status(201).send(result);
  });

  app.post('/api/comandos/salas/:salaId/mensajes', async (request, reply) => {
    const { salaId } = parseEdge(mensajeParams, request.params);
    const { autor, texto } = parseEdge(mensajeBody, request.body);
    const result = await handlers.enviarMensaje({ salaId, autor, texto });
    return reply.status(201).send(result);
  });
}
