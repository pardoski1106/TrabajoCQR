import { describe, expect, it } from 'vitest';
import { createCrearSalaHandler, createEnviarMensajeHandler } from '../../src/commands/handlers';
import { ConcurrencyError, NotFoundError, ValidationError } from '../../src/errors';
import { FakePublisher, InMemoryEventStore, silentLogger } from '../helpers/fakes';

function setup() {
  const store = new InMemoryEventStore();
  const publisher = new FakePublisher();
  const deps = { store, publisher, logger: silentLogger };
  return { store, publisher, crearSala: createCrearSalaHandler(deps), enviarMensaje: createEnviarMensajeHandler(deps) };
}

describe('CrearSala', () => {
  it('guarda SalaCreada v1 en el event store y la publica', async () => {
    const { store, publisher, crearSala } = setup();
    const { salaId, eventId } = await crearSala({ nombre: '  General  ' });

    expect(store.events).toHaveLength(1);
    expect(store.events[0]).toMatchObject({ type: 'SalaCreada', aggregateId: salaId, version: 1, payload: { nombre: 'General' } });
    expect(publisher.published.map((e) => e.id)).toEqual([eventId]);
  });

  it.each([[''], ['   '], ['x'.repeat(81)]])('rechaza nombre invalido %j sin escribir nada', async (nombre) => {
    const { store, publisher, crearSala } = setup();
    await expect(crearSala({ nombre })).rejects.toBeInstanceOf(ValidationError);
    expect(store.events).toHaveLength(0);
    expect(publisher.published).toHaveLength(0);
  });

  it('no pierde el comando si RabbitMQ falla (el evento ya esta guardado)', async () => {
    const { store, publisher, crearSala } = setup();
    publisher.fail = true;
    await expect(crearSala({ nombre: 'General' })).resolves.toHaveProperty('salaId');
    expect(store.events).toHaveLength(1);
  });
});

describe('EnviarMensaje', () => {
  it('guarda MensajeEnviado con la version siguiente y lo publica', async () => {
    const { store, publisher, crearSala, enviarMensaje } = setup();
    const { salaId } = await crearSala({ nombre: 'General' });
    const res = await enviarMensaje({ salaId, autor: 'ana', texto: 'hola' });

    expect(res.version).toBe(2);
    expect(store.events[1]).toMatchObject({
      type: 'MensajeEnviado',
      aggregateId: salaId,
      version: 2,
      payload: { mensajeId: res.mensajeId, autor: 'ana', texto: 'hola' },
    });
    expect(publisher.published).toHaveLength(2);
    const segundo = await enviarMensaje({ salaId, autor: 'luis', texto: 'que tal' });
    expect(segundo.version).toBe(3);
  });

  it('falla con NotFoundError si la sala no existe', async () => {
    const { enviarMensaje } = setup();
    await expect(
      enviarMensaje({ salaId: '11111111-1111-4111-8111-111111111111', autor: 'ana', texto: 'hola' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it.each([
    [{ salaId: 'no-es-uuid', autor: 'ana', texto: 'hola' }],
    [{ salaId: '11111111-1111-4111-8111-111111111111', autor: '', texto: 'hola' }],
    [{ salaId: '11111111-1111-4111-8111-111111111111', autor: 'ana', texto: '   ' }],
    [{ salaId: '11111111-1111-4111-8111-111111111111', autor: 'a'.repeat(41), texto: 'hola' }],
    [{ salaId: '11111111-1111-4111-8111-111111111111', autor: 'ana', texto: 't'.repeat(1001) }],
  ])('rechaza datos invalidos %j', async (cmd) => {
    const { enviarMensaje } = setup();
    await expect(enviarMensaje(cmd)).rejects.toBeInstanceOf(ValidationError);
  });

  it('reintenta ante un conflicto de concurrencia y termina guardando', async () => {
    const { store, crearSala, enviarMensaje } = setup();
    const { salaId } = await crearSala({ nombre: 'General' });
    store.failNextAppends = 2;
    await expect(enviarMensaje({ salaId, autor: 'ana', texto: 'hola' })).resolves.toHaveProperty('version', 2);
  });

  it('propaga ConcurrencyError cuando agota los reintentos', async () => {
    const { store, crearSala, enviarMensaje } = setup();
    const { salaId } = await crearSala({ nombre: 'General' });
    store.failNextAppends = 10;
    await expect(enviarMensaje({ salaId, autor: 'ana', texto: 'hola' })).rejects.toBeInstanceOf(ConcurrencyError);
  });
});
