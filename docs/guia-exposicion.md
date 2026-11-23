# Guía de exposición: dónde está cada cosa

Pensada para responder rápido cuando se pregunte "¿dónde está X?". Rutas relativas a la raíz del repositorio.

## Qué hace el sistema (30 segundos)

Intranet de mensajería por canales. Escribir y leer van por caminos separados (CQRS) y solo se comunican con **eventos**.
RabbitMQ reparte cada evento por *fanout* a dos consumidores independientes: el **proyector** (actualiza las tablas de lectura)
y el **broadcast** (avisa por Socket.IO a todos los clientes).

```
Cliente → POST comando → handler → event_store (PostgreSQL/Neon) → RabbitMQ (fanout)
                                                                      ├─ proyector → read_salas / read_mensajes → GET consultas
                                                                      └─ broadcast → Socket.IO → web y consola (en vivo)
```

## "Muéstreme…" → archivo

| Pregunta | Dónde | Línea / detalle |
|---|---|---|
| Los **comandos** (escritura) | `server/src/commands/handlers.ts` | `createCrearSalaHandler` (l. 64), `createEnviarMensajeHandler` (l. 75) |
| Las **consultas** (lectura) | `server/src/queries/handlers.ts`, `server/src/queries/pgReadModel.ts` | solo leen `read_*` |
| Las rutas HTTP | `server/src/api/commandRoutes.ts` (POST), `queryRoutes.ts` (GET) | `/api/comandos/...` y `/api/consultas/...` |
| Los **eventos** y su contrato | `server/src/events/events.ts` | `domainEventSchema` (l. 32): `SalaCreada`, `MensajeEnviado` |
| El **event store** | `server/src/events/eventStore.ts` | `INSERT INTO event_store` (l. 43), conflicto de versión (l. 50) |
| Concurrencia optimista | `server/migrations/001_event_store.sql` (l. 12) y `commands/handlers.ts` (reintentos, l. 95) | `UNIQUE (aggregate_id, version)` |
| El **exchange fanout** de RabbitMQ | `server/src/messaging/rabbit.ts` | `assertExchange(..., 'fanout')` (l. 25); mensajes persistentes (l. 36) |
| Cola del proyector (compartida) y del broadcast (exclusiva) | `server/src/main.ts` (l. 47 y l. 60), `rabbit.ts` (l. 57–58) | |
| El **proyector** | `server/src/projections/projector.ts`, `pgReadModelWriter.ts` | idempotente: `ON CONFLICT DO NOTHING` |
| El **broadcast** (RabbitMQ → Socket.IO) | `server/src/broadcast/socketBridge.ts` | `createBroadcaster` (l. 28); suscripciones (l. 50, 64) |
| Ejecutar componentes por separado | `server/src/main.ts` (l. 32, 44, 56) | variable `ROLES` |
| **Validación** en el borde y en el dominio | borde: `api/commandRoutes.ts`; dominio: `commands/handlers.ts` | zod en ambos |
| Errores HTTP coherentes | `server/src/api/errorHandler.ts` | 400 / 404 / 409 / 500 con formato único |
| Logs estructurados | `server/src/main.ts` (pino) y logs de `rabbit.ts` | JSON en la terminal del servidor |
| La **base de datos** (3 tablas) | `server/migrations/001_event_store.sql`, `002_read_models.sql` | índice `(sala_id, enviado_en)` |
| Conexión a la nube (Neon) | `.env.local` (no se sube), `neon.ts`, `server/src/db/pool.ts` | `DATABASE_URL` por variable de entorno |
| **Cliente web** | `clients/web/src/` (`App.tsx`, `FlowFeed.tsx`, `empresa.ts`) | HTTP + Socket.IO |
| **Cliente de consola** | `clients/consola/src/cliente.ts`, `formato.ts`, `main.ts` | solo Socket.IO |
| Contratos de los clientes (no importan el servidor) | `clients/web/src/contrato.ts`, `clients/consola/src/contrato.ts` | |
| Pruebas | `server/tests/unit/`, `server/tests/integration/`, `clients/consola/tests/` | `npm test` |
| Prueba comando → event_store → proyección → consulta | `server/tests/integration/flow.test.ts` | |
| Prueba de broadcast hacia la consola | `clients/consola/tests/broadcast.test.ts` | levanta el servidor real |
| Demo automática | `scripts/demo.ts` (`npm run demo`) | |
| Recuperar eventos no publicados | `scripts/republicar.ts` (`npm run republish`) | |

## Requerimientos → dónde se demuestran

| Req. | Demostración en vivo | Documento |
|---|---|---|
| R1 Broadcast | Dos ventanas web + consola: un mensaje aparece en todas a la vez | `docs/arquitectura.md` §4 |
| R2 Pila CQRS con mensajería | Panel "Flujo de datos" + `event_store` vs `read_*` en Neon | `docs/arquitectura.md` §2–3 |
| R3 Servidor y ≥2 clientes | Carpetas `server/`, `clients/web`, `clients/consola` (cada una con su `package.json`) | README (Estructura) |
| R4 GitHub | https://github.com/pardoski1106/TrabajoCQR (rama `main`) | — |
| R5 Componentes claros | Tabla de componentes y diagrama | `docs/arquitectura.md` §1 |
| R6 Justificación tecnológica | Una sección por tecnología (incl. Redis descartado) | `docs/decisiones-tecnologicas.md` |
| R7 Cómo y en qué archivo | Tabla R1–R9 | `docs/requerimientos.md` |
| R8 Tecnologías nuevas | Apartado final de decisiones | `docs/decisiones-tecnologicas.md` |
| R9 PostgreSQL mínimo en la nube | Neon: 3 tablas | `docs/despliegue-nube.md` |

## Pasos de la demo (5 min)

1. Dos ventanas web (Laura, Gerente; Juan, Desarrollador) y la consola abierta (`npm run dev:consola`).
2. Laura crea canales con los botones `+ General`, `+ Finanzas` → aparecen en la otra ventana sin recargar (broadcast).
3. Escribir desde ambas ventanas; en el panel derecho se enciende el flujo y se ve la latencia.
4. En el SQL Editor de Neon: `SELECT id, aggregate_id, version, tipo, payload FROM event_store ORDER BY id DESC;` (escritura) y
   `SELECT * FROM read_mensajes ORDER BY enviado_en;` (lectura).
5. Recargar la web: el historial viene de la consulta `GET /api/consultas/salas/{id}/mensajes`.
6. Opcional: separar `ROLES` (ver README) para probar que los componentes corren por separado.

## Preguntas probables

- **¿Qué es CQRS aquí?** Comandos (`commands/`) escriben eventos; consultas (`queries/`) leen otras tablas. Nunca se mezclan.
- **¿Por qué RabbitMQ y no Redis?** Redis Pub/Sub pierde eventos si el consumidor está caído; RabbitMQ tiene colas durables y acks.
- **¿Qué es la consistencia eventual?** El 201 significa "evento guardado"; la tabla de lectura se actualiza milisegundos después.
- **¿Qué pasa si dos usuarios escriben a la vez?** Versiones del agregado + `UNIQUE`: uno recibe conflicto y el handler reintenta.
- **¿Y si RabbitMQ se cae al publicar?** El evento ya está guardado; `npm run republish` lo recupera. No hay *outbox* (limitación documentada).
- **¿Los empleados y cargos son reales?** No: son datos de demostración del cliente (`clients/web/src/empresa.ts`); no hay autenticación.
- **¿Por qué Node y no Java como el ejemplo?** Broadcast y clientes en vivo nativos de Node; ver `docs/analisis-ejemplo.md` §7.
