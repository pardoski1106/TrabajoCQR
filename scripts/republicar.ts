/**
 * Utilidad: vuelve a publicar en RabbitMQ todos los eventos guardados en event_store.
 * Sirve para recuperar la lectura/broadcast si un evento se guardo pero no se pudo publicar
 * (el proyector es idempotente, asi que republicar eventos ya proyectados es seguro).
 *
 *   npm run republish
 */
import { pino } from 'pino';
import { loadDotEnv, parseConfig } from '../server/src/config';
import { createPool } from '../server/src/db/pool';
import { PgEventStore } from '../server/src/events/eventStore';
import { RabbitBus } from '../server/src/messaging/rabbit';

loadDotEnv();
const config = parseConfig({ ...process.env, ROLES: 'api' });
const logger = pino({ level: 'warn' });
const pool = createPool(config.databaseUrl!);
const bus = await RabbitBus.connect(config.rabbitUrl, config.exchange, logger);

try {
  const events = await new PgEventStore(pool).readAll();
  for (const event of events) await bus.publish(event);
  console.log(`Republicados ${events.length} eventos en el exchange "${config.exchange}"`);
} finally {
  await bus.close();
  await pool.end();
}
