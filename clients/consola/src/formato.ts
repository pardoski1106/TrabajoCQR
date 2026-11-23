import type { EventoDominio } from './contrato';

/** Convierte un evento de dominio en una linea legible para la consola. */
export function formatEvent(event: EventoDominio): string {
  const hora = new Date(event.occurredAt).toLocaleTimeString('es-CO', { hour12: false });
  const sala = event.aggregateId.slice(0, 8);
  switch (event.type) {
    case 'SalaCreada':
      return `[${hora}] + SalaCreada      sala=${sala} "${event.payload.nombre}" (id evento ${event.id})`;
    case 'MensajeEnviado':
      return `[${hora}] > MensajeEnviado  sala=${sala} ${event.payload.autor}: ${event.payload.texto} (v${event.version})`;
  }
}
