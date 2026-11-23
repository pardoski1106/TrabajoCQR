/**
 * Contrato que el cliente web conoce del servidor: JSON de la API HTTP y del evento
 * Socket.IO "evento". No se importa nada del servidor.
 */
export interface Sala {
  id: string;
  nombre: string;
  creadaEn: string;
}

export interface Mensaje {
  id: string;
  salaId: string;
  autor: string;
  texto: string;
  enviadoEn: string;
}

interface EventoBase {
  id: string;
  aggregateType: 'Sala';
  aggregateId: string;
  version: number;
  occurredAt: string;
}

export type EventoDominio =
  | (EventoBase & { type: 'SalaCreada'; payload: { nombre: string } })
  | (EventoBase & { type: 'MensajeEnviado'; payload: { mensajeId: string; autor: string; texto: string } });
