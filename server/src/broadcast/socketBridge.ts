import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { z } from 'zod';
import type { DomainEvent } from '../events/events';

/**
 * PUENTE RabbitMQ -> Socket.IO (broadcast).
 *
 * Contrato con los clientes (Socket.IO):
 *   cliente -> servidor:  "suscribir"         (salaId, ack)  entra a la sala "sala:<id>"
 *                         "desuscribir"       (salaId, ack)
 *                         "suscribir_todas"   (ack)          recibe los eventos de TODAS las salas
 *   servidor -> cliente:  "evento"            (DomainEvent)
 *
 * Reglas de difusion:
 *   SalaCreada     -> a todos los clientes conectados (para que vean la sala nueva).
 *   MensajeEnviado -> a los suscritos a esa sala y a los suscritos a "todas".
 */
export const ROOM_ALL = 'todas';
export const roomOf = (salaId: string): string => `sala:${salaId}`;

/** Subconjunto de Socket.IO que usa el broadcaster (permite probarlo sin red). */
export interface BroadcastTarget {
  emit(ev: string, payload: unknown): unknown;
  to(rooms: string[]): { emit(ev: string, payload: unknown): unknown };
}

export function createBroadcaster(target: BroadcastTarget) {
  return (event: DomainEvent): void => {
    if (event.type === 'SalaCreada') {
      target.emit('evento', event);
    } else {
      target.to([roomOf(event.aggregateId), ROOM_ALL]).emit('evento', event);
    }
  };
}

type Ack = (res: { ok: boolean; error?: string }) => void;
const salaIdSchema = z.string().uuid();

/** Crea el servidor Socket.IO sobre el servidor HTTP y registra los eventos de suscripcion. */
export function attachSocketIo(httpServer: HttpServer, corsOrigin: string): Server {
  const io = new Server(httpServer, { cors: { origin: corsOrigin === '*' ? true : corsOrigin.split(',') } });

  io.on('connection', (socket) => {
    const reply = (ack: unknown, res: Parameters<Ack>[0]) => {
      if (typeof ack === 'function') (ack as Ack)(res);
    };

    socket.on('suscribir', async (salaId: unknown, ack?: unknown) => {
      const parsed = salaIdSchema.safeParse(salaId);
      if (!parsed.success) return reply(ack, { ok: false, error: 'salaId debe ser un UUID' });
      await socket.join(roomOf(parsed.data));
      reply(ack, { ok: true });
    });

    socket.on('desuscribir', async (salaId: unknown, ack?: unknown) => {
      const parsed = salaIdSchema.safeParse(salaId);
      if (!parsed.success) return reply(ack, { ok: false, error: 'salaId debe ser un UUID' });
      await socket.leave(roomOf(parsed.data));
      reply(ack, { ok: true });
    });

    socket.on('suscribir_todas', async (ack?: unknown) => {
      await socket.join(ROOM_ALL);
      reply(ack, { ok: true });
    });
  });

  return io;
}
