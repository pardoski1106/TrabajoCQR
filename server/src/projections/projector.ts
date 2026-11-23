import type { DomainEvent } from '../events/events';

/** Puerto de escritura de las tablas de lectura. */
export interface ReadModelWriter {
  insertSala(sala: { id: string; nombre: string; creadaEn: string }): Promise<void>;
  insertMensaje(mensaje: { id: string; salaId: string; autor: string; texto: string; enviadoEn: string }): Promise<void>;
}

/**
 * PROYECTOR: traduce cada evento de dominio en cambios sobre las tablas de lectura.
 * Las escrituras son idempotentes (la entrega de RabbitMQ es "al menos una vez").
 */
export function createProjector(writer: ReadModelWriter) {
  return async (event: DomainEvent): Promise<void> => {
    switch (event.type) {
      case 'SalaCreada':
        await writer.insertSala({ id: event.aggregateId, nombre: event.payload.nombre, creadaEn: event.occurredAt });
        return;
      case 'MensajeEnviado':
        await writer.insertMensaje({
          id: event.payload.mensajeId,
          salaId: event.aggregateId,
          autor: event.payload.autor,
          texto: event.payload.texto,
          enviadoEn: event.occurredAt,
        });
        return;
    }
  };
}
