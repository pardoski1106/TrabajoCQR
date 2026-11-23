import pg from 'pg';

/** Pool de conexiones a PostgreSQL (Neon/Supabase exigen TLS: va en la cadena con sslmode=require). */
export function createPool(connectionString: string): pg.Pool {
  return new pg.Pool({ connectionString, max: 5, connectionTimeoutMillis: 15_000 });
}
