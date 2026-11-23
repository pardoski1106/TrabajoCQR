import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

export const ROLES = ['api', 'projector', 'broadcast'] as const;
export type Role = (typeof ROLES)[number];

const envSchema = z.object({
  DATABASE_URL: z.string().min(1).optional(),
  RABBITMQ_URL: z.string().min(1).default('amqp://guest:guest@localhost:5672'),
  RABBITMQ_EXCHANGE: z.string().min(1).default('cqrs.eventos'),
  PORT: z.coerce.number().int().min(0).max(65535).default(3000),
  HOST: z.string().default('0.0.0.0'),
  ROLES: z.string().default('api,projector,broadcast'),
  CORS_ORIGIN: z.string().default('*'),
  LOG_LEVEL: z.string().default('info'),
});

export interface Config {
  databaseUrl: string | undefined;
  rabbitUrl: string;
  exchange: string;
  port: number;
  host: string;
  roles: Set<Role>;
  corsOrigin: string;
  logLevel: string;
}

/** Carga .env (si existe) desde el directorio actual o desde la raiz del repositorio. */
export function loadDotEnv(): void {
  for (const candidate of [resolve('.env'), resolve('..', '.env')]) {
    if (existsSync(candidate)) {
      process.loadEnvFile(candidate);
      return;
    }
  }
}

export function parseConfig(env: NodeJS.ProcessEnv): Config {
  // Variables vacias (p. ej. "DATABASE_URL=" copiada de .env.example) cuentan como no definidas.
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v !== ''));
  const parsed = envSchema.parse(cleaned);
  const roles = new Set<Role>();
  for (const raw of parsed.ROLES.split(',').map((r) => r.trim()).filter(Boolean)) {
    if (!(ROLES as readonly string[]).includes(raw)) {
      throw new Error(`Rol desconocido en ROLES: "${raw}". Validos: ${ROLES.join(', ')}`);
    }
    roles.add(raw as Role);
  }
  if (roles.size === 0) throw new Error('ROLES no puede estar vacio');
  if ((roles.has('api') || roles.has('projector')) && !parsed.DATABASE_URL) {
    throw new Error('DATABASE_URL es obligatoria para los roles api y projector (ver .env.example)');
  }
  return {
    databaseUrl: parsed.DATABASE_URL,
    rabbitUrl: parsed.RABBITMQ_URL,
    exchange: parsed.RABBITMQ_EXCHANGE,
    port: parsed.PORT,
    host: parsed.HOST,
    roles,
    corsOrigin: parsed.CORS_ORIGIN,
    logLevel: parsed.LOG_LEVEL,
  };
}
