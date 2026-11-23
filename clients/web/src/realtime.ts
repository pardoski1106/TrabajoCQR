import { io, type Socket } from 'socket.io-client';
import { API_URL } from './api';
import type { EventoDominio } from './contrato';

/** Conexion Socket.IO al broadcast del servidor. */
export function connectRealtime(onEvent: (e: EventoDominio) => void, onStatus: (connected: boolean) => void): Socket {
  const socket = io(API_URL, { transports: ['websocket'] });
  socket.on('evento', onEvent);
  socket.on('connect', () => onStatus(true));
  socket.on('disconnect', () => onStatus(false));
  return socket;
}
