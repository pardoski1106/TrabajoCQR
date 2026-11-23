import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { EventStore } from '../events/eventStore';
import type { EventPublisher, Logger } from '../events/publisher';
import { ConcurrencyError, NotFoundError, ValidationError } from '../errors';

/**
 * LADO DE ESCRITURA (comandos). Cada handler:
 *  1. valida las reglas de dominio,
 *  2. guarda el evento en event_store (fuente de verdad),
 *  3. publica el evento en RabbitMQ (exchange fanout).
 * Los handlers NO leen las tablas de lectura ni conocen Socket.IO.
 */

export const NOMBRE_SALA_MAX = 80;
export const AUTOR_MAX = 40;
export const TEXTO_MAX = 1000;
const MAX_REINTENTOS = 3;

const crearSalaSchema = z.object({
  nombre: z.string().trim().min(1, 'nombre es obligatorio').max(NOMBRE_SALA_MAX, `nombre admite maximo ${NOMBRE_SALA_MAX} caracteres`),
});

const enviarMensajeSchema = z.object({
  salaId: z.string().uuid('salaId debe ser un UUID'),
  autor: z.string().trim().min(1, 'autor es obligatorio').max(AUTOR_MAX, `autor admite maximo ${AUTOR_MAX} caracteres`),
  texto: z.string().trim().min(1, 'texto es obligatorio').max(TEXTO_MAX, `texto admite maximo ${TEXTO_MAX} caracteres`),
});

export interface CrearSala {
  nombre: string;
}
export interface EnviarMensaje {
  salaId: string;
  autor: string;
  texto: string;
}

export interface CommandDeps {
  store: EventStore;
  publisher: EventPublisher;
  logger: Logger;
  newId?: () => string;
}

function validate<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new ValidationError(first?.message ?? 'Comando invalido', result.error.issues);
  }
  return result.data;
}

/** El evento ya esta guardado: si RabbitMQ falla, el comando no se pierde (ver npm run republish). */
async function publishSafely(deps: CommandDeps, event: Parameters<EventPublisher['publish']>[0]): Promise<void> {
  try {
    await deps.publisher.publish(event);
  } catch (err) {
    deps.logger.error({ err, eventId: event.id, type: event.type }, 'Evento guardado pero no publicado; usar npm run republish');
  }
}

export function createCrearSalaHandler(deps: CommandDeps) {
  const newId = deps.newId ?? randomUUID;
  return async (command: CrearSala): Promise<{ salaId: string; eventId: string }> => {
    const { nombre } = validate(crearSalaSchema, command);
    const salaId = newId();
    const event = await deps.store.append({ aggregateId: salaId, version: 1, type: 'SalaCreada', payload: { nombre } });
    await publishSafely(deps, event);
    return { salaId, eventId: event.id };
  };
}

export function createEnviarMensajeHandler(deps: CommandDeps) {
  const newId = deps.newId ?? randomUUID;
  return async (command: EnviarMensaje): Promise<{ mensajeId: string; eventId: string; version: number }> => {
    const { salaId, autor, texto } = validate(enviarMensajeSchema, command);
    const mensajeId = newId();

    for (let intento = 1; ; intento++) {
      const current = await deps.store.currentVersion(salaId);
      if (current === 0) throw new NotFoundError(`La sala ${salaId} no existe`);
      try {
        const event = await deps.store.append({
          aggregateId: salaId,
          version: current + 1,
          type: 'MensajeEnviado',
          payload: { mensajeId, autor, texto },
        });
        await publishSafely(deps, event);
        return { mensajeId, eventId: event.id, version: event.version };
      } catch (err) {
        // Concurrencia optimista: otro mensaje tomo la version; releer y reintentar.
        if (err instanceof ConcurrencyError && intento < MAX_REINTENTOS) continue;
        throw err;
      }
    }
  };
}

export type CrearSalaHandler = ReturnType<typeof createCrearSalaHandler>;
export type EnviarMensajeHandler = ReturnType<typeof createEnviarMensajeHandler>;
