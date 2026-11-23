import { pino } from 'pino';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/api/app';
import { createCrearSalaHandler, createEnviarMensajeHandler } from '../../src/commands/handlers';
import { createListarMensajesHandler, createListarSalasHandler, type ReadModel } from '../../src/queries/handlers';
import { FakePublisher, InMemoryEventStore, silentLogger } from '../helpers/fakes';

const SALA_INEXISTENTE = '11111111-1111-4111-8111-111111111111';

let app: FastifyInstance;
const readModel: ReadModel = {
  listSalas: vi.fn().mockResolvedValue([]),
  salaExists: vi.fn().mockResolvedValue(false),
  listMensajes: vi.fn().mockResolvedValue([]),
};

beforeAll(async () => {
  const deps = { store: new InMemoryEventStore(), publisher: new FakePublisher(), logger: silentLogger };
  app = await buildApp({
    logger: pino({ level: 'silent' }),
    corsOrigin: '*',
    roles: ['api'],
    commands: { crearSala: createCrearSalaHandler(deps), enviarMensaje: createEnviarMensajeHandler(deps) },
    queries: { listarSalas: createListarSalasHandler(readModel), listarMensajes: createListarMensajesHandler(readModel) },
  });
});
afterAll(() => app.close());

describe('API de comandos', () => {
  it('POST /api/comandos/salas -> 201 con salaId y eventId', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/comandos/salas', payload: { nombre: 'General' } });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ salaId: expect.any(String), eventId: expect.any(String) });
  });

  it('nombre ausente -> 400 VALIDACION', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/comandos/salas', payload: {} });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.codigo).toBe('VALIDACION');
  });

  it('nombre en blanco (regla de dominio) -> 400', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/comandos/salas', payload: { nombre: '   ' } });
    expect(res.statusCode).toBe(400);
  });

  it('JSON malformado -> 400', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/comandos/salas', payload: '{no es json', headers: { 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('mensaje a sala inexistente -> 404', async () => {
    const res = await app.inject({
      method: 'POST', url: `/api/comandos/salas/${SALA_INEXISTENTE}/mensajes`, payload: { autor: 'ana', texto: 'hola' },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.codigo).toBe('NO_ENCONTRADO');
  });

  it('salaId que no es UUID -> 400', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/comandos/salas/abc/mensajes', payload: { autor: 'a', texto: 'b' } });
    expect(res.statusCode).toBe(400);
  });

  it('flujo feliz: crear sala y enviar mensaje -> 201', async () => {
    const sala = (await app.inject({ method: 'POST', url: '/api/comandos/salas', payload: { nombre: 'Otra' } })).json();
    const res = await app.inject({
      method: 'POST', url: `/api/comandos/salas/${sala.salaId}/mensajes`, payload: { autor: 'ana', texto: 'hola' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().version).toBe(2);
  });
});

describe('API de consultas', () => {
  it('GET /api/consultas/salas -> 200', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/consultas/salas' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ salas: [] });
  });

  it('limite fuera de rango -> 400', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/consultas/salas/${SALA_INEXISTENTE}/mensajes?limite=999` });
    expect(res.statusCode).toBe(400);
  });

  it('limite no numerico -> 400', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/consultas/salas/${SALA_INEXISTENTE}/mensajes?limite=abc` });
    expect(res.statusCode).toBe(400);
  });

  it('sala no proyectada -> 404', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/consultas/salas/${SALA_INEXISTENTE}/mensajes` });
    expect(res.statusCode).toBe(404);
  });
});

describe('Otros', () => {
  it('/salud responde ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/salud' });
    expect(res.json()).toMatchObject({ estado: 'ok' });
  });

  it('ruta inexistente -> 404 con formato de error', async () => {
    const res = await app.inject({ method: 'GET', url: '/nada' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.codigo).toBe('RUTA_NO_ENCONTRADA');
  });
});
