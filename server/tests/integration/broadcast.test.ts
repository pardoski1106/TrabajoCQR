import { randomUUID } from 'node:crypto';
import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import type { Server } from 'socket.io';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { attachSocketIo, createBroadcaster } from '../../src/broadcast/socketBridge';
import type { DomainEvent } from '../../src/events/events';
import { RabbitBus } from '../../src/messaging/rabbit';
import { RABBITMQ_URL, rabbitAvailable } from '../helpers/env';
import { silentLogger } from '../helpers/fakes';

const enabled = await rabbitAvailable();

function emitAck(socket: Socket, ev: string, ...args: unknown[]): Promise<{ ok: boolean }> {
  return socket.timeout(5000).emitWithAck(ev, ...args);
}

describe.skipIf(!enabled)('Integracion: RabbitMQ (fanout) -> Socket.IO', () => {
  const exchange = `test.${randomUUID()}`;
  let http: HttpServer;
  let io: Server;
  let bus: RabbitBus;
  let stop: () => Promise<void>;
  let url: string;
  const sockets: Socket[] = [];

  const salaA = randomUUID();
  const salaB = randomUUID();
  const mensaje = (aggregateId: string, texto: string, version: number): DomainEvent => ({
    id: String(version), type: 'MensajeEnviado', aggregateType: 'Sala', aggregateId, version,
    occurredAt: new Date().toISOString(), payload: { mensajeId: randomUUID(), autor: 'ana', texto },
  });

  beforeAll(async () => {
    http = createServer();
    io = attachSocketIo(http, '*');
    await new Promise<void>((r) => http.listen(0, r));
    url = `http://localhost:${(http.address() as AddressInfo).port}`;
    bus = await RabbitBus.connect(RABBITMQ_URL, exchange, silentLogger);
    const broadcast = createBroadcaster(io);
    stop = await bus.subscribe({ name: 'broadcast-test' }, broadcast);
  });

  afterAll(async () => {
    sockets.forEach((s) => s.disconnect());
    await stop?.();
    await bus?.destroy();
    await bus?.close();
    io?.close();
  });

  async function client(): Promise<Socket> {
    const s = connect(url, { transports: ['websocket'] });
    sockets.push(s);
    await new Promise<void>((resolve) => s.on('connect', () => resolve()));
    return s;
  }

  it('entrega cada evento solo a los clientes suscritos a esa sala (y a "todas")', async () => {
    const enA = await client();
    const enB = await client();
    const todas = await client();
    expect((await emitAck(enA, 'suscribir', salaA)).ok).toBe(true);
    expect((await emitAck(enB, 'suscribir', salaB)).ok).toBe(true);
    expect((await emitAck(todas, 'suscribir_todas')).ok).toBe(true);

    const got = { A: [] as DomainEvent[], B: [] as DomainEvent[], T: [] as DomainEvent[] };
    enA.on('evento', (e: DomainEvent) => got.A.push(e));
    enB.on('evento', (e: DomainEvent) => got.B.push(e));
    todas.on('evento', (e: DomainEvent) => got.T.push(e));

    await bus.publish(mensaje(salaA, 'para A', 1));
    await bus.publish(mensaje(salaB, 'para B', 1));
    await new Promise((r) => setTimeout(r, 500));

    expect(got.A.map((e) => (e.type === 'MensajeEnviado' ? e.payload.texto : ''))).toEqual(['para A']);
    expect(got.B.map((e) => (e.type === 'MensajeEnviado' ? e.payload.texto : ''))).toEqual(['para B']);
    expect(got.T).toHaveLength(2);
  });

  it('SalaCreada llega a todos los clientes conectados, aunque no esten suscritos', async () => {
    const cualquiera = await client();
    const recibido = new Promise<DomainEvent>((resolve) => cualquiera.on('evento', resolve));
    const event: DomainEvent = {
      id: '99', type: 'SalaCreada', aggregateType: 'Sala', aggregateId: randomUUID(), version: 1,
      occurredAt: new Date().toISOString(), payload: { nombre: 'Nueva' },
    };
    await bus.publish(event);
    expect(await recibido).toEqual(event);
  });

  it('rechaza suscripciones con salaId invalido', async () => {
    const s = await client();
    expect((await emitAck(s, 'suscribir', 'no-uuid')).ok).toBe(false);
  });
});
