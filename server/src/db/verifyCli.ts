import { loadDotEnv } from '../config';
import { createPool } from './pool';

// npm run verify:db -> comprueba la conexion y que existan las tres tablas esperadas
loadDotEnv();
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Falta DATABASE_URL (copia .env.example a .env). Ver docs/despliegue-nube.md');
  process.exit(1);
}
const EXPECTED = ['event_store', 'read_mensajes', 'read_salas'];
const pool = createPool(url);
try {
  const { rows: info } = await pool.query<{ version: string; db: string }>(
    'SELECT version() AS version, current_database() AS db',
  );
  console.log(`Conexion OK -> base "${info[0]!.db}"\n${info[0]!.version}`);
  const { rows } = await pool.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ANY($1) ORDER BY table_name`,
    [EXPECTED],
  );
  const found = rows.map((r) => r.table_name);
  const missing = EXPECTED.filter((t) => !found.includes(t));
  console.log(`Tablas encontradas: ${found.join(', ') || '(ninguna)'}`);
  if (missing.length > 0) {
    console.error(`Faltan tablas: ${missing.join(', ')}. Ejecuta: npm run migrate`);
    process.exitCode = 1;
  }
} catch (err) {
  console.error(`No se pudo conectar: ${(err as Error).message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
