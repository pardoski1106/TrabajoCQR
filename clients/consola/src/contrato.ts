/**
 * Contrato que el cliente conoce del servidor (solo el JSON de Socket.IO).
 * No se importa nada del servidor: si el contrato cambia, se actualiza aqui.
 */
export interface EventoBase {
  id: string;
  aggregateType: 'Sala';
  aggregateId: string;
  version: number;
  occurredAt: string;
}

export type EventoDominio =
  | (EventoBase & { type: 'SalaCreada'; payload: { nombre: string } })
  | (EventoBase & { type: 'MensajeEnviado'; payload: { mensajeId: string; autor: string; texto: string } });
