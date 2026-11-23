/**
 * Demo de extremo a extremo (npm run demo).
 * Requiere: RabbitMQ en marcha, DATABASE_URL en .env y migraciones aplicadas (npm run migrate).
 *
 * 1. Levanta el servidor completo (api + projector + broadcast) como proceso hijo.
 * 2. Conecta un cliente Socket.IO (igual que la consola) suscrito a "todas".
 * 3. Envia COMANDOS por HTTP: crear sala y 2 mensajes.
 * 4. Muestra los EVENTOS recibidos en vivo por broadcast.
 * 5. Espera la consistencia eventual y muestra las CONSULTAS.
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { io } from 'socket.io-client';

const ROOT = new URL('..', import.meta.url);

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const srv = createServer().listen(0, () => {
      const { port } = srv.address() as { port: number };
      srv.close(() => resolve(port));
    });
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const step = (msg: string) => console.log(`\n=== ${msg}`);

async function http<T>(base: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json()) as T;
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${JSON.stringify(json)}`);
  return json;
}

const port = await freePort();
const base = `http://localhost:${port}`;
step(`Levantando el servidor en ${base}`);
const server = spawn(process.execPath, ['--import', 'tsx', 'server/src/main.ts'], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(port), ROLES: 'api,projector,broadcast', LOG_LEVEL: 'warn', RABBITMQ_EXCHANGE: 'cqrs.demo' },
  stdio: ['ignore', 'inherit', 'inherit'],
});
let serverExited = false;
server.on('exit', () => (serverExited = true));

try {
  for (let i = 0; ; i++) {
    if (serverExited) throw new Error('El servidor se cerro al arrancar (revisa DATABASE_URL, RabbitMQ y npm run migrate)');
    if (i > 100) throw new Error('El servidor no respondio a tiempo');
    try {
      if ((await fetch(`${base}/salud`)).ok) break;
    } catch {
      await sleep(200);
    }
  }

  step('Cliente en vivo suscrito a "todas" (broadcast Socket.IO)');
  const socket = io(base, { transports: ['websocket'] });
  const eventos: string[] = [];
  socket.on('evento', (e: { type: string; version: number; payload: Record<string, string> }) => {
    const resumen = e.type === 'SalaCreada' ? `"${e.payload.nombre}"` : `${e.payload.autor}: ${e.payload.texto}`;
    console.log(`   [broadcast] ${e.type} v${e.version} -> ${resumen}`);
    eventos.push(e.type);
  });
  await socket.emitWithAck('suscribir_todas');

  step('COMANDOS (escritura)');
  const { salaId } = await http<{ salaId: string }>(base, '/api/comandos/salas', { nombre: `Demo ${new Date().toISOString().slice(11, 19)}` });
  console.log(`   POST CrearSala        -> salaId ${salaId}`);
  await http(base, `/api/comandos/salas/${salaId}/mensajes`, { autor: 'ana', texto: 'Hola desde la demo' });
  await http(base, `/api/comandos/salas/${salaId}/mensajes`, { autor: 'luis', texto: 'CQRS + broadcast funcionando' });
  console.log('   POST EnviarMensaje x2');

  for (let i = 0; i < 50 && eventos.length < 3; i++) await sleep(100);

  step('CONSULTAS (lectura, tras la proyeccion: consistencia eventual)');
  let mensajes: Array<{ autor: string; texto: string }> = [];
  for (let i = 0; i < 50 && mensajes.length < 2; i++) {
    try {
      mensajes = (await http<{ mensajes: typeof mensajes }>(base, `/api/consultas/salas/${salaId}/mensajes?limite=10`)).mensajes;
    } catch {
      /* la sala aun no se proyecta */
    }
    if (mensajes.length < 2) await sleep(100);
  }
  const { salas } = await http<{ salas: Array<{ nombre: string }> }>(base, '/api/consultas/salas');
  console.log(`   GET ListarSalas       -> ${salas.length} sala(s)`);
  mensajes.forEach((m) => console.log(`   GET ListarMensajes    -> ${m.autor}: ${m.texto}`));

  socket.close();
  if (eventos.length < 3 || mensajes.length < 2) throw new Error('La demo no completo el flujo esperado');
  step('Flujo completo OK: comando -> event_store -> RabbitMQ -> proyeccion + broadcast -> consulta');
} catch (err) {
  console.error(`\nDEMO FALLIDA: ${(err as Error).message}`);
  process.exitCode = 1;
} finally {
  server.kill();
}
