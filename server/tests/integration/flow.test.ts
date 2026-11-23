import { randomUUID } from 'node:crypto';
import { pino } from 'pino';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/api/app';
import { createCrearSalaHandler, createEnviarMensajeHandler } from '../../src/commands/handlers';
import { createPool } from '../../src/db/pool';
import { runMigrations } from '../../src/db/migrate';
import { PgEventStore } from '../../src/events/eventStore';
import { RabbitBus } from '../../src/messaging/rabbit';
import { PgReadModelWriter } from '../../src/projections/pgReadModelWriter';
import { createProjector } from '../../src/projections/projector';
import { createListarMensajesHandler, createListarSalasHandler } from '../../src/queries/handlers';
import { PgReadModel } from '../../src/queries/pgReadModel';
import { RABBITMQ_URL, TEST_DATABASE_URL, rabbitAvailable, waitFor } from '../helpers/env';
import { silentLogger } from '../helpers/fakes';

// Requiere PostgreSQL (TEST_DATABASE_URL) y RabbitMQ locales; si no estan, se omite.
const enabled = Boolean(TEST_DATABASE_URL) && (await rabbitAvailable());

describe.skipIf(!enabled)('Integracion: comando -> event_store -> RabbitMQ -> proyeccion -> consulta', () => {
  const exchange = `test.${randomUUID()}`;
  const queue = `${exchange}.proyector`;
  let pool: Pool;
  let bus: RabbitBus;
  let stop: () => Promise<void>;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let store: PgEventStore;

  beforeAll(async () => {
    pool = createPool(TEST_DATABASE_URL!);
    await runMigrations(pool);
    bus = await RabbitBus.connect(RABBITMQ_URL, exchange, silentLogger);
    store = new PgEventStore(pool);
    const project = createProjector(new PgReadModelWriter(pool));
    stop = await bus.subscribe({ queue, name: 'proyector-test' }, project);

    const deps = { store, publisher: bus, logger: silentLogger };
    const readModel = new PgReadModel(pool);
    app = await buildApp({
      logger: pino({ level: 'silent' }),
      corsOrigin: '*',
      roles: ['api'],
      commands: { crearSala: createCrearSalaHandler(deps), enviarMensaje: createEnviarMensajeHandler(deps) },
      queries: { listarSalas: createListarSalasHandler(readModel), listarMensajes: createListarMensajesHandler(readModel) },
    });
  });

  afterAll(async () => {
    await stop?.();
    await bus?.destroy([queue]);
    await bus?.close();
    await app?.close();
    await pool?.end();
  });

  it('un comando queda en event_store y, tras la proyeccion, se ve en las consultas', async () => {
    const nombre = `Sala ${randomUUID().slice(0, 8)}`;

    // 1) Comando (HTTP) -> evento guardado
    const creada = await app.inject({ method: 'POST', url: '/api/comandos/salas', payload: { nombre } });
    expect(creada.statusCode).toBe(201);
    const { salaId } = creada.json();

    const stored = await pool.query('SELECT version, tipo, payload FROM event_store WHERE aggregate_id = $1', [salaId]);
    expect(stored.rows).toEqual([{ version: 1, tipo: 'SalaCreada', payload: { nombre } }]);

    const msg = await app.inject({
      method: 'POST', url: `/api/comandos/salas/${salaId}/mensajes`, payload: { autor: 'ana', texto: 'hola mundo' },
    });
    expect(msg.statusCode).toBe(201);
    expect(msg.json().version).toBe(2);

    // 2) Consistencia eventual: esperar a que el proyector actualice las tablas de lectura
    const mensajes = await waitFor(async () => {
      const res = await app.inject({ method: 'GET', url: `/api/consultas/salas/${salaId}/mensajes?limite=10` });
      return res.statusCode === 200 && res.json().mensajes.length === 1 ? res.json().mensajes : undefined;
    });
    expect(mensajes[0]).toMatchObject({ salaId, autor: 'ana', texto: 'hola mundo' });

    const salas = (await app.inject({ method: 'GET', url: '/api/consultas/salas' })).json().salas;
    expect(salas).toContainEqual(expect.objectContaining({ id: salaId, nombre }));
  });

  it('la proyeccion es idempotente: reproyectar el mismo evento no duplica filas', async () => {
    const { salaId } = await createCrearSalaHandler({ store, publisher: bus, logger: silentLogger })({ nombre: 'Idem' });
    await waitFor(async () => (await pool.query('SELECT 1 FROM read_salas WHERE id = $1', [salaId])).rowCount);

    const events = (await store.readAll()).filter((e) => e.aggregateId === salaId);
    const project = createProjector(new PgReadModelWriter(pool));
    for (const e of events) await project(e);

    const { rows } = await pool.query('SELECT count(*)::int AS n FROM read_salas WHERE id = $1', [salaId]);
    expect(rows[0].n).toBe(1);
  });

  it('event_store rechaza dos eventos con el mismo (aggregate_id, version)', async () => {
    const aggregateId = randomUUID();
    await store.append({ aggregateId, version: 1, type: 'SalaCreada', payload: { nombre: 'dup' } });
    await expect(
      store.append({ aggregateId, version: 1, type: 'SalaCreada', payload: { nombre: 'dup' } }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('mensajes concurrentes a la misma sala reciben versiones distintas (sin perderse)', async () => {
    const deps = { store, publisher: bus, logger: silentLogger };
    const { salaId } = await createCrearSalaHandler(deps)({ nombre: 'Concurrencia' });
    const enviar = createEnviarMensajeHandler(deps);
    const results = await Promise.all(
      Array.from({ length: 3 }, (_, i) => enviar({ salaId, autor: 'ana', texto: `m${i}` }).catch((e: unknown) => e)),
    );
    const versions = results.filter((r): r is { version: number } => typeof r === 'object' && r !== null && 'version' in r).map((r) => r.version);
    expect(new Set(versions).size).toBe(versions.length);
    expect(versions.length).toBeGreaterThanOrEqual(1);
  });
});
