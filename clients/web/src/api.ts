import type { Mensaje, Sala } from './contrato';

/** URL del servidor; configurable con VITE_API_URL (ver clients/web/.env.example). */
export const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: init?.body ? { 'content-type': 'application/json' } : undefined,
  });
  const body = (await res.json().catch(() => ({}))) as { error?: { mensaje?: string } };
  if (!res.ok) throw new Error(body.error?.mensaje ?? `Error HTTP ${res.status}`);
  return body as T;
}

// --- Comandos (escritura) ---
export const crearSala = (nombre: string) =>
  request<{ salaId: string; eventId: string }>('/api/comandos/salas', { method: 'POST', body: JSON.stringify({ nombre }) });

export const enviarMensaje = (salaId: string, autor: string, texto: string) =>
  request<{ mensajeId: string }>(`/api/comandos/salas/${salaId}/mensajes`, {
    method: 'POST',
    body: JSON.stringify({ autor, texto }),
  });

// --- Consultas (lectura) ---
export const listarSalas = async (): Promise<Sala[]> => (await request<{ salas: Sala[] }>('/api/consultas/salas')).salas;

export const listarMensajes = async (salaId: string, limite = 50): Promise<Mensaje[]> =>
  (await request<{ mensajes: Mensaje[] }>(`/api/consultas/salas/${salaId}/mensajes?limite=${limite}`)).mensajes;
