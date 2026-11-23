import amqp from 'amqplib';
import { loadDotEnv } from '../../src/config';

loadDotEnv();

export const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';
/** Base SOLO para pruebas (nunca la de produccion): las pruebas insertan datos. */
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || undefined;

export async function rabbitAvailable(): Promise<boolean> {
  try {
    const conn = await amqp.connect(RABBITMQ_URL);
    await conn.close();
    return true;
  } catch {
    return false;
  }
}

/** Espera hasta que `check` devuelva un valor (o lanza si se agota el tiempo). */
export async function waitFor<T>(check: () => Promise<T | undefined | false> | T | undefined | false, timeoutMs = 8000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() - start > timeoutMs) throw new Error('waitFor: tiempo agotado');
    await new Promise((r) => setTimeout(r, 50));
  }
}
