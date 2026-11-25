import { pino } from 'pino';
import { buildApp } from './api/app';
import { attachSocketIo, createBroadcaster } from './broadcast/socketBridge';
import { createCrearSalaHandler, createEnviarMensajeHandler } from './commands/handlers';
import { loadDotEnv, parseConfig } from './config';
import { connectMongo } from './db/mongo';
import { createPool } from './db/pool';
import { MongoReadModelWriter } from './projections/mongoReadModelWriter';
import { MongoReadModel } from './queries/mongoReadModel';
import { PgEventStore } from './events/eventStore';
import { RabbitBus } from './messaging/rabbit';
import { createProjector } from './projections/projector';
import { PgReadModelWriter } from './projections/pgReadModelWriter';
import { createListarMensajesHandler, createListarSalasHandler } from './queries/handlers';
import { PgReadModel } from './queries/pgReadModel';

/**
 * Punto de entrada. Compone SOLO los componentes pedidos en ROLES, de modo que
 * api, projector y broadcast pueden correr en el mismo proceso o en procesos separados:
 *   ROLES=api            -> API HTTP de comandos y consultas (publica en RabbitMQ)
 *   ROLES=projector      -> consume RabbitMQ y actualiza read_salas / read_mensajes
 *   ROLES=broadcast      -> consume RabbitMQ y emite por Socket.IO (no necesita base de datos)
 */
loadDotEnv();
const config = parseConfig(process.env);
const logger = pino({ level: config.logLevel, base: { servicio: 'cqrs-server' } });
const roles = [...config.roles];

const pool = config.databaseUrl ? createPool(config.databaseUrl) : undefined;
const bus = await RabbitBus.connect(config.rabbitUrl, config.exchange, logger);
const stops: Array<() => Promise<void>> = [];

// Modelo de lectura: MongoDB (NoSQL) si hay MONGODB_URL; si no, tablas read_* en PostgreSQL.
const needsReadStore = config.roles.has('api') || config.roles.has('projector');
const mongo = config.mongoUrl && needsReadStore ? await connectMongo(config.mongoUrl, config.mongoDb) : undefined;
if (mongo) logger.info({ db: config.mongoDb }, 'Modelo de lectura en MongoDB');

// --- Rol api: comandos (escritura) y consultas (lectura) ---
let apiParts = {};
if (config.roles.has('api') && pool) {
  const deps = { store: new PgEventStore(pool), publisher: bus, logger };
  const readModel = mongo ? new MongoReadModel(mongo.db) : new PgReadModel(pool);
  apiParts = {
    commands: { crearSala: createCrearSalaHandler(deps), enviarMensaje: createEnviarMensajeHandler(deps) },
    queries: { listarSalas: createListarSalasHandler(readModel), listarMensajes: createListarMensajesHandler(readModel) },
  };
}

const app = await buildApp({ logger, corsOrigin: config.corsOrigin, roles, ...apiParts });

// --- Rol projector: RabbitMQ -> tablas de lectura ---
if (config.roles.has('projector') && pool) {
  const project = createProjector(mongo ? new MongoReadModelWriter(mongo.db) : new PgReadModelWriter(pool));
  stops.push(
    await bus.subscribe({ queue: `${config.exchange}.proyector`, name: 'proyector' }, async (event) => {
      await project(event);
      logger.info({ eventId: event.id, type: event.type }, 'Evento proyectado');
    }),
  );
}

// --- Rol broadcast: RabbitMQ -> Socket.IO ---
let io: ReturnType<typeof attachSocketIo> | undefined;
if (config.roles.has('broadcast')) {
  io = attachSocketIo(app.server, config.corsOrigin);
  const broadcast = createBroadcaster(io);
  stops.push(
    await bus.subscribe({ name: 'broadcast' }, (event) => {
      broadcast(event);
      logger.info({ eventId: event.id, type: event.type, clientes: io?.engine.clientsCount }, 'Evento difundido');
    }),
  );
}

await app.listen({ port: config.port, host: config.host });
logger.info({ roles, port: config.port, exchange: config.exchange }, 'Servidor listo');

let closing = false;
async function shutdown(signal: string): Promise<void> {
  if (closing) return;
  closing = true;
  logger.info({ signal }, 'Cerrando servidor');
  for (const stop of stops) await stop().catch(() => undefined);
  io?.close();
  await app.close().catch(() => undefined);
  await bus.close();
  await pool?.end();
  await mongo?.client.close().catch(() => undefined);
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
