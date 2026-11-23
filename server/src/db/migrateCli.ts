import { loadDotEnv } from '../config';
import { createPool } from './pool';
import { runMigrations } from './migrate';

// npm run migrate  -> aplica server/migrations/*.sql sobre DATABASE_URL
loadDotEnv();
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Falta DATABASE_URL (copia .env.example a .env). Ver docs/despliegue-nube.md');
  process.exit(1);
}
const pool = createPool(url);
try {
  const applied = await runMigrations(pool);
  console.log(`Migraciones aplicadas: ${applied.join(', ')}`);
} catch (err) {
  console.error((err as Error).message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
