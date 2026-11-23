# Decisiones tecnológicas

Para cada tecnología: qué es, por qué se eligió, alternativas consideradas y en qué archivos se usa.

## Node.js + TypeScript (servidor y clientes)

- **Qué es:** entorno de ejecución de JavaScript con tipado estático en tiempo de compilación.
- **Por qué:** el servidor y los dos clientes comparten lenguaje; los contratos de los eventos se describen una vez con tipos y
  el broadcast (Socket.IO) es nativo de este ecosistema. El tipado estricto (`strict`, `noUncheckedIndexedAccess`) evita errores en
  un sistema basado en mensajes. Se ejecuta con `tsx` (sin paso de compilación) y se verifica con `tsc --noEmit`.
- **Frente al ejemplo (Java/Spring Boot):** el ejemplo no tiene clientes en tiempo real ni broadcast; Spring serviría con
  WebSocket/STOMP, pero obligaría a un cliente web separado en otro lenguaje y a más código de configuración. Decisión confirmada con el usuario.
- **Versión:** el enunciado sugiere Node 22; el equipo de desarrollo tiene Node 20.20.2 y todo funciona en Node ≥ 20.12
  (`engines` en `package.json`). Se usa `process.loadEnvFile` (≥ 20.12) en lugar de la librería `dotenv`.
- **Alternativas:** Java/Spring Boot (ejemplo), Python/FastAPI, Go.
- **Dónde:** `server/`, `clients/`, `scripts/`, `tsconfig.base.json`.

## Fastify (API HTTP)

- **Qué es:** framework HTTP para Node, rápido y con logging estructurado integrado (pino).
- **Por qué:** logs JSON estructurados sin configuración extra (requisito no funcional), manejo central de errores
  (`setErrorHandler`) y `app.inject()` para probar la API sin abrir puertos. Su servidor HTTP subyacente (`app.server`) se comparte con Socket.IO.
- **Alternativas:** Express (menos soporte nativo de logging estructurado), NestJS (más ceremonia para un dominio tan pequeño).
- **Dónde:** `server/src/api/` (`app.ts`, `commandRoutes.ts`, `queryRoutes.ts`, `errorHandler.ts`), `server/src/main.ts`. CORS con `@fastify/cors`.

## Socket.IO (broadcast en tiempo real)

- **Qué es:** biblioteca de comunicación bidireccional sobre WebSocket con salas, reconexión automática y *acknowledgements*.
- **Por qué:** cumple el requisito de broadcast: las **salas** (`sala:<id>`) mapean exactamente el dominio, el *ack* de suscripción
  permite saber cuándo un cliente ya está escuchando (lo usan el cliente web, la consola, la demo y las pruebas), y existe
  cliente oficial para navegador y Node.
- **Alternativas:** WebSocket nativo (`ws`: habría que programar salas, reconexión y acks), Server-Sent Events (solo servidor → cliente, sin salas).
- **Dónde:** `server/src/broadcast/socketBridge.ts`; clientes: `clients/web/src/realtime.ts`, `clients/consola/src/cliente.ts`.

## RabbitMQ con exchange `fanout` (mensajería)

- **Qué es:** broker de mensajes AMQP. Un exchange *fanout* copia cada mensaje a **todas** las colas enlazadas.
- **Por qué:** es exactamente el patrón de broadcast que pide el enunciado: el proyector y el puente de Socket.IO son consumidores
  independientes del mismo evento. Se usan mensajes persistentes, colas durables, *publisher confirms* y *acks* manuales
  (entrega "al menos una vez" → proyector idempotente). El proyector usa una cola compartida (una copia procesa cada evento);
  cada instancia de broadcast usa una cola exclusiva (todas reciben todo).
- **Alternativa considerada y descartada: Redis Pub/Sub.** Es muy simple, pero es *fire-and-forget*: si un consumidor está caído
  o aún no suscrito, **pierde el evento**, no hay colas durables ni acks. Para el proyector eso rompería la lectura de forma
  silenciosa. Redis Streams resolvería la durabilidad, pero implica reimplementar grupos de consumidores y *fanout* a mano.
  Otras: Kafka (el ejemplo lo usa de forma opcional; es excesivo para este volumen y para ejecutar en local), NATS.
- **Dónde:** `server/src/messaging/rabbit.ts`; uso en `server/src/main.ts`; infraestructura en `docker-compose.yml`.

## PostgreSQL en la nube (Neon o Supabase) con el driver `pg`

- **Qué es:** base de datos relacional; Neon y Supabase ofrecen plan gratuito gestionado.
- **Por qué:** requisito del enunciado. `jsonb` guarda el `payload` de los eventos sin una tabla por tipo; las restricciones
  (`UNIQUE (aggregate_id, version)`, llave foránea) imponen invariantes en la base. Solo **tres tablas** (event_store, read_salas,
  read_mensajes). Se usa `pg` directamente (SQL explícito) porque el modelo es pequeño y así el SQL es visible para evaluar.
- **Migraciones sin tabla de control:** los `.sql` son idempotentes (`IF NOT EXISTS`) y se aplican en orden; así la base queda
  en exactamente tres tablas. Contrapartida: no hay historial de migraciones aplicadas (aceptable para este alcance).
- **Alternativas:** ORM (Prisma/TypeORM/JPA del ejemplo: más capas que no aportan aquí), MongoDB (el ejemplo lo usa en la lectura, pero el
  enunciado exige PostgreSQL), una base distinta para lectura y escritura (se prefirió una sola base mínima con tablas separadas).
- **Dónde:** `server/src/db/`, `server/migrations/`, `server/src/events/eventStore.ts`, `server/src/projections/pgReadModelWriter.ts`, `server/src/queries/pgReadModel.ts`.

## zod (validación)

- **Qué es:** validación de esquemas con inferencia de tipos de TypeScript.
- **Por qué:** una sola definición sirve para validar y para tipar. Se usa en tres puntos: peticiones HTTP (borde), reglas de
  los comandos/consultas (dominio), y eventos recibidos de RabbitMQ o leídos de la base (contrato de `events.ts`).
  También valida la configuración (`config.ts`).
- **Alternativas:** Ajv/JSON Schema (de Fastify; menos ergonómico con TypeScript), Joi, validación manual.
- **Dónde:** `server/src/api/*Routes.ts`, `server/src/commands/handlers.ts`, `server/src/queries/handlers.ts`, `server/src/events/events.ts`, `server/src/config.ts`.

## React + Vite (cliente web)

- **Qué es:** biblioteca de interfaces y herramienta de build/dev server.
- **Por qué:** estado reactivo sencillo para pintar mensajes en vivo y arranque rápido (`vite`). Es una aplicación cliente
  separada que solo conoce el contrato HTTP/Socket.IO.
- **Alternativas:** Vue/Svelte, HTML plano (sin estructura para escalar), Next.js (SSR innecesario).
- **Dónde:** `clients/web/`.

## Cliente de consola (Node.js + `socket.io-client`)

- **Por qué:** segunda aplicación cliente, distinta del navegador, que demuestra que el broadcast es independiente de la UI y permite
  una verificación sencilla en vivo. Su lógica (`cliente.ts`, `formato.ts`) es reutilizable en pruebas.
- **Dónde:** `clients/consola/`.

## Pino (logs estructurados)

- **Qué es:** logger JSON de alto rendimiento (el de Fastify).
- **Por qué:** logs en JSON con campos (`eventId`, `type`, `consumer`) fáciles de filtrar; el mismo logger se pasa a Fastify, RabbitMQ y los handlers.
- **Dónde:** `server/src/main.ts`, `server/src/events/publisher.ts` (interfaz `Logger`).

## Vitest (pruebas)

- **Qué es:** ejecutor de pruebas nativo de TypeScript/ESM.
- **Por qué:** cero configuración con TypeScript, rápido, y sirve igual para pruebas unitarias e integración.
  Las pruebas de integración usan PostgreSQL y RabbitMQ **reales**; se omiten (con `skipIf`) si no se configuran, para que `npm test` no falle en un equipo sin infraestructura.
- **Alternativas:** Jest (requiere transformadores para ESM/TS).
- **Dónde:** `server/tests/`, `clients/consola/tests/`.

## ESLint + typescript-eslint, tsx, npm workspaces

- **ESLint/typescript-eslint:** `npm run lint` con reglas recomendadas. **tsx:** ejecuta TypeScript directamente en desarrollo.
  **npm workspaces:** un solo `npm install` para servidor y clientes, que siguen siendo paquetes independientes (cada uno con su
  `package.json`, scripts y pruebas). **Dónde:** `eslint.config.js`, `package.json` raíz.

## Docker Compose

- **Por qué:** levantar RabbitMQ (y opcionalmente PostgreSQL local) con un comando y sin instalar nada. **Dónde:** `docker-compose.yml`.

## Tecnologías nuevas (no estaban en el ejemplo)

El ejemplo era Java/Spring Boot con JPA, Maven, Log4j2 y Kafka opcional. Todo lo siguiente es nuevo y se justifica por el valor que aporta:

| Tecnología | Valor que aporta frente al ejemplo |
|---|---|
| **Socket.IO** | Broadcast en tiempo real a clientes (el ejemplo solo sincronizaba servicios, sin clientes en vivo) |
| **RabbitMQ (fanout)** | Entrega múltiple e independiente (proyector + broadcast) con durabilidad y acks; el ejemplo usaba HTTP punto a punto o Kafka opcional |
| **Event store en PostgreSQL** | Registro inmutable de eventos con concurrencia optimista y capacidad de reproyectar; el ejemplo guardaba estado en una tabla |
| **Fastify, zod, pino** | API ligera, validación tipada en todos los bordes y logs estructurados |
| **React + Vite** | Primer cliente de usuario (el ejemplo solo se probaba con Postman) |
| **Cliente de consola** | Segundo cliente, para demostrar desacople entre servidor y clientes |
| **Vitest, ESLint, TypeScript estricto** | Pruebas, calidad estática y contratos tipados |
| **Docker Compose** | Infraestructura local reproducible (el ejemplo usaba scripts de PowerShell para instancias locales) |
| **PostgreSQL en la nube (Neon/Supabase)** | Requisito del enunciado; el ejemplo usaba bases locales |
