import { io, type Socket } from 'socket.io-client';
import { API_URL } from './api';
import type { EventoDominio } from './contrato';

/**
 * Conexion Socket.IO al broadcast del servidor. Se suscribe a "todas" (cada vez que conecta o
 * reconecta, porque el servidor pierde las suscripciones al caerse la conexion) para recibir
 * los eventos de todos los canales: sirven para el chat, los no leidos y el panel de flujo.
 */
export function connectRealtime(onEvent: (e: EventoDominio) => void, onStatus: (connected: boolean) => void): Socket {
  const socket = io(API_URL, { transports: ['websocket'] });
  socket.on('evento', onEvent);
  socket.on('connect', () => {
    socket.emit('suscribir_todas');
    onStatus(true);
  });
  socket.on('disconnect', () => onStatus(false));
  return socket;
}
