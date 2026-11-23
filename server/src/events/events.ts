import { z } from 'zod';

/**
 * Contrato de los eventos de dominio. Es el mismo JSON que se guarda en event_store,
 * viaja por RabbitMQ y llega a los clientes por Socket.IO (evento "evento").
 */
export const EVENT_TYPES = ['SalaCreada', 'MensajeEnviado'] as const;
export type EventType = (typeof EVENT_TYPES)[number];

const base = {
  /** Identificador del evento = id (bigserial) asignado por event_store, en texto. */
  id: z.string().min(1),
  aggregateType: z.literal('Sala'),
  aggregateId: z.string().uuid(),
  version: z.number().int().min(1),
  /** Fecha ISO-8601 (columna ocurrido_en). */
  occurredAt: z.string().min(1),
};

export const salaCreadaSchema = z.object({
  ...base,
  type: z.literal('SalaCreada'),
  payload: z.object({ nombre: z.string() }),
});

export const mensajeEnviadoSchema = z.object({
  ...base,
  type: z.literal('MensajeEnviado'),
  payload: z.object({ mensajeId: z.string().uuid(), autor: z.string(), texto: z.string() }),
});

export const domainEventSchema = z.discriminatedUnion('type', [salaCreadaSchema, mensajeEnviadoSchema]);

export type SalaCreada = z.infer<typeof salaCreadaSchema>;
export type MensajeEnviado = z.infer<typeof mensajeEnviadoSchema>;
export type DomainEvent = z.infer<typeof domainEventSchema>;

/** Datos que aporta un comando para escribir un evento (id y fecha los asigna el almacen). */
export type NewEvent =
  | { aggregateId: string; version: number; type: 'SalaCreada'; payload: SalaCreada['payload'] }
  | { aggregateId: string; version: number; type: 'MensajeEnviado'; payload: MensajeEnviado['payload'] };
