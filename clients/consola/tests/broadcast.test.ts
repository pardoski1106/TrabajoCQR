import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import amqp from 'amqplib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connectConsole, type ConsoleClient } from '../src/cliente';
import type { EventoDominio } from '../src/contrato';
import { formatEvent } from '../src/formato';

/**
 * Prueba de extremo a extremo del BROADCAST, solo a traves de contratos:
 * levanta el servidor real (ROLES=broadcast, sin base de datos) como proceso aparte,
 * publica un evento en RabbitMQ y comprueba que el cliente de consola lo recibe.
 * Requiere RabbitMQ local (RABBITMQ_URL); si no esta, se omite.
 */
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';
const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..', '..', '..');

async function rabbitUp(): Promise<boolean> {
  try {
    (await amqp.connect(RABBITMQ_URL)).close();
    return true;
  } catch {
    return false;
  }
}

function freePort(): Promise<number> {
  return new Promise((res) => {
    const srv = createServer().listen(0, () => {
      const { port } = srv.address() as { port: number };
      srv.close(() => res(port));
    });
  });
}

const enabled = await rabbitUp();

describe.skipIf(!enabled)('Broadcast: evento publicado en RabbitMQ -> cliente de consola', () => {
  const exchange = `test.${randomUUID()}`;
  let server: ChildProcess;
  let client: ConsoleClient;
  const received: EventoDominio[] = [];
  let port: number;

  beforeAll(async () => {
    port = await freePort();
    server = spawn(process.execPath, ['--import', 'tsx', 'server/src/main.ts'], {
      cwd: ROOT,
      env: { ...process.env, ROLES: 'broadcast', PORT: String(port), RABBITMQ_URL, RABBITMQ_EXCHANGE: exchange, LOG_LEVEL: 'silent', DATABASE_URL: '' },
      stdio: 'ignore',
    });
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(`http://localhost:${port}/salud`)).ok) break;
      } catch { /* aun arrancando */ }
      await new Promise((r) => setTimeout(r, 200));
    }
    client = await connectConsole(`http://localhost:${port}`, (e) => received.push(e));
  });

  afterAll(async () => {
    client?.close();
    server?.kill();
    const conn = await amqp.connect(RABBITMQ_URL);
    const ch = await conn.createChannel();
    await ch.deleteExchange(exchange).catch(() => undefined);
    await conn.close();
  });

  it('el cliente de consola recibe y formatea el evento publicado', async () => {
    const event: EventoDominio = {
      id: '1', type: 'MensajeEnviado', aggregateType: 'Sala', aggregateId: randomUUID(), version: 2,
      occurredAt: new Date().toISOString(), payload: { mensajeId: randomUUID(), autor: 'ana', texto: 'hola consola' },
    };
    const conn = await amqp.connect(RABBITMQ_URL);
    const ch = await conn.createChannel();
    ch.publish(exchange, '', Buffer.from(JSON.stringify(event)), { contentType: 'application/json' });
    await ch.close();
    await conn.close();

    for (let i = 0; i < 100 && received.length === 0; i++) await new Promise((r) => setTimeout(r, 100));
    expect(received).toEqual([event]);
    expect(formatEvent(received[0]!)).toContain('ana: hola consola');
  });
});
