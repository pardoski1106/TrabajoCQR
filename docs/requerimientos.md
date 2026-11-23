# Requerimientos (R1–R9)

Origen: lo pedido por el profesor ("proponer soluciones con conexiones broadcast", "pila de mensajería implementando CQRS",
"aplicación servidor y aplicaciones cliente", "en su GitHub", "componentes claros", "justificar tecnológicamente",
"en los requerimientos colocar cómo lo usa y en qué", "se puede usar cualquier cosa nueva", "base de datos mínima en PostgreSQL en la nube").

| # | Requerimiento | Cómo se cumple | Tecnología | Archivos / módulos |
|---|---|---|---|---|
| R1 | Solución con conexiones de broadcast: cada evento se difunde a todos los clientes suscritos | RabbitMQ difunde cada evento con un exchange **fanout**; el puente de broadcast lo recibe y lo emite por Socket.IO a la sala del evento y a los suscritos a `todas`; `SalaCreada` va a todos los conectados | RabbitMQ (fanout), Socket.IO | `server/src/messaging/rabbit.ts`, `server/src/broadcast/socketBridge.ts`, `server/src/main.ts`; prueba: `server/tests/integration/broadcast.test.ts` |
| R2 | Pila de mensajería con CQRS: escritura por comandos, lectura por consultas, comunicación por eventos | Comandos → `event_store` → RabbitMQ → proyector → tablas `read_*` → consultas. Los handlers de comandos nunca leen `read_*`; los de consultas nunca leen `event_store` | Fastify, zod, RabbitMQ, PostgreSQL (`pg`) | `server/src/commands/handlers.ts`, `server/src/queries/handlers.ts`, `server/src/events/`, `server/src/projections/`, `server/src/api/`; prueba: `server/tests/integration/flow.test.ts` |
| R3 | Una aplicación servidor y, aparte, aplicaciones cliente (mínimo dos) | Servidor en `server/`; dos clientes independientes: web (`clients/web`) y consola (`clients/consola`), cada uno con su `package.json`. Solo conocen HTTP y Socket.IO | Node.js/TypeScript, React + Vite, socket.io-client | `server/`, `clients/web/`, `clients/consola/` (contratos en `clients/*/src/contrato.ts`) |
| R4 | Todo en el GitHub indicado | Repositorio `https://github.com/pardoski1106/TrabajoCQR.git`, rama `main`, commits pequeños (Conventional Commits) | Git/GitHub | Todo el repositorio (`.gitignore` excluye `.env` y `node_modules`) |
| R5 | Componentes claros, con responsabilidad única y documentada | Una carpeta por responsabilidad; tabla de componentes en la arquitectura; puertos (`EventStore`, `EventPublisher`, `ReadModel`, `ReadModelWriter`) separan lógica de infraestructura; cada rol se ejecuta por separado con `ROLES` | TypeScript | `docs/arquitectura.md` §1 y §6, `server/src/*` |
| R6 | Justificar tecnológicamente cada tecnología | Cada tecnología tiene qué es, por qué, alternativas y archivos; incluye Redis Pub/Sub descartado y el apartado "Tecnologías nuevas" | — | `docs/decisiones-tecnologicas.md` |
| R7 | En los requerimientos indicar cómo se usa la tecnología y en qué archivo/módulo | Esta tabla (columnas "Tecnología" y "Archivos / módulos") | — | `docs/requerimientos.md` |
| R8 | Se pueden usar tecnologías nuevas si aportan valor, justificadas | Socket.IO, RabbitMQ, event store, Fastify, zod, pino, React/Vite, Vitest, Docker Compose, justificadas frente al ejemplo | — | `docs/decisiones-tecnologicas.md` ("Tecnologías nuevas"), `docs/analisis-ejemplo.md` |
| R9 | Base de datos mínima, PostgreSQL en la nube | Solo 3 tablas y sin campos innecesarios; `DATABASE_URL` por variable de entorno (Neon/Supabase). Migraciones idempotentes versionadas | PostgreSQL, `pg` | `server/migrations/001_event_store.sql`, `server/migrations/002_read_models.sql`, `server/src/db/`, `docs/despliegue-nube.md`, `.env.example` |

## Estado de cumplimiento y verificación

- **Código:** `npm run typecheck`, `npm run lint` y `npm test` pasan (52 pruebas en el servidor, 3 en la consola).
- **Verificado con infraestructura real** (PostgreSQL 16 en Docker y RabbitMQ local): integración comando → event_store → proyección → consulta,
  broadcast por salas, broadcast hacia el cliente de consola y `npm run demo`. Las de integración se omiten solas si falta `TEST_DATABASE_URL` o RabbitMQ.
- **R9** queda completo cuando se cree la base en la nube (la cuenta y las credenciales las aporta el usuario; ver `docs/despliegue-nube.md`).
