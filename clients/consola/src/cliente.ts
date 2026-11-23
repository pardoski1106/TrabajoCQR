import { io, type Socket } from 'socket.io-client';
import type { EventoDominio } from './contrato';

export interface ConsoleClient {
  socket: Socket;
  close(): void;
}

/**
 * Se conecta al servidor Socket.IO y se suscribe al broadcast.
 *  - sin salaId  -> "suscribir_todas": recibe los eventos de todas las salas
 *  - con salaId  -> "suscribir": solo los de esa sala (las SalaCreada llegan siempre)
 * Resuelve cuando el servidor confirmo la suscripcion (ack), asi quien llama sabe que ya esta escuchando.
 */
export async function connectConsole(
  url: string,
  onEvent: (event: EventoDominio) => void,
  options: { salaId?: string; onStatus?: (msg: string) => void } = {},
): Promise<ConsoleClient> {
  const socket = io(url, { transports: ['websocket'], reconnection: true });
  socket.on('evento', onEvent);

  const subscribe = async (): Promise<void> => {
    const res: { ok: boolean; error?: string } = options.salaId
      ? await socket.timeout(5000).emitWithAck('suscribir', options.salaId)
      : await socket.timeout(5000).emitWithAck('suscribir_todas');
    if (!res.ok) throw new Error(res.error ?? 'Suscripcion rechazada');
  };

  // Tras una reconexion Socket.IO pierde las salas: hay que volver a suscribirse.
  socket.io.on('reconnect', () => {
    options.onStatus?.('Reconectado; renovando suscripcion');
    subscribe().catch((err: Error) => options.onStatus?.(`Error al re-suscribir: ${err.message}`));
  });
  socket.on('disconnect', (reason) => options.onStatus?.(`Desconectado (${reason})`));

  await new Promise<void>((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', (err) => reject(err));
  });
  await subscribe();
  return { socket, close: () => void socket.close() };
}
