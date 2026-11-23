import { connectConsole } from './cliente';
import { formatEvent } from './formato';

// Uso: npm run dev:consola -- [--url http://localhost:3000] [--sala <uuid>]
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const url = arg('url') ?? process.env.SERVER_URL ?? 'http://localhost:3000';
const salaId = arg('sala');

try {
  const client = await connectConsole(url, (event) => console.log(formatEvent(event)), {
    salaId,
    onStatus: (msg) => console.error(`(${msg})`),
  });
  console.log(`Conectado a ${url}. Escuchando ${salaId ? `la sala ${salaId}` : 'todas las salas'}. Ctrl+C para salir.`);
  process.on('SIGINT', () => {
    client.close();
    process.exit(0);
  });
} catch (err) {
  console.error(`No se pudo conectar a ${url}: ${(err as Error).message}`);
  process.exit(1);
}
