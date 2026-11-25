# TrabajoCQR — Mensajería por salas con CQRS y broadcast

Aplicación de mensajería por salas que demuestra **CQRS** (comandos y consultas separados) sobre una pila de
mensajería con **broadcast en tiempo real**: servidor aparte, dos clientes distintos (web y consola) y dos bases:
**PostgreSQL en la nube** (relacional, escritura) y **MongoDB** (no relacional, lectura).

> **Para ejecutar en Windows:** `INICIAR.bat` / `DETENER.bat`. Bases, colas, Postman y errores comunes:
> [README-BASES-Y-COLAS.md](README-BASES-Y-COLAS.md).

- **Escritura:** comandos HTTP → validación → `event_store` (PostgreSQL) → RabbitMQ (exchange *fanout*).
- **Lectura:** RabbitMQ → proyector → colecciones `read_*` en MongoDB → consultas HTTP.
  Sin `MONGODB_URL`, la lectura usa las tablas `read_*` de PostgreSQL (modo alterno).
- **Broadcast:** RabbitMQ → servidor → Socket.IO → todos los clientes suscritos.
- **Consistencia:** eventual entre escritura y lectura (ver [arquitectura](docs/arquitectura.md#5-consistencia-eventual-y-su-impacto)).

## Documentación

| Documento | Contenido |
|---|---|
| [docs/problematica.md](docs/problematica.md) | Problema que originó la solución y cómo la resuelve cada decisión |
| [docs/arquitectura.md](docs/arquitectura.md) | Componentes, diagramas Mermaid (componentes y dos secuencias), consistencia eventual |
| [docs/decisiones-tecnologicas.md](docs/decisiones-tecnologicas.md) | Qué es cada tecnología, por qué, alternativas (incl. Redis descartado), archivos, tecnologías nuevas |
| [docs/requerimientos.md](docs/requerimientos.md) | R1–R9: cómo se cumplen, tecnología y archivos |
| [docs/despliegue-nube.md](docs/despliegue-nube.md) | Crear PostgreSQL en Neon/Supabase, migrar y verificar |
| [docs/guia-exposicion.md](docs/guia-exposicion.md) | Orden de la exposición, checklist de requerimientos y preguntas probables |
| [README-BASES-Y-COLAS.md](README-BASES-Y-COLAS.md) | Dónde ver bases y colas, URLs de Postman y errores comunes |
| [docs/analisis-ejemplo.md](docs/analisis-ejemplo.md) | Análisis de los proyectos de ejemplo (Java/Spring) y decisiones derivadas |

## Estructura

```
TrabajoCQR/
├── docker-compose.yml          RabbitMQ y MongoDB (+ PostgreSQL local opcional)
├── .env.example                variables de entorno (sin valores reales)
├── docs/                       documentación
├── server/                     SERVIDOR
│   ├── src/api/                rutas HTTP de comandos y consultas, manejo de errores
│   ├── src/commands/           handlers de comandos (escritura)
│   ├── src/queries/            handlers de consultas (lectura)
│   ├── src/events/             eventos de dominio y event store
│   ├── src/messaging/          publicador/consumidor RabbitMQ
│   ├── src/projections/        proyector al modelo de lectura
│   ├── src/broadcast/          puente RabbitMQ → Socket.IO
│   ├── src/db/                 pool pg, migraciones y conexión a MongoDB
│   ├── src/main.ts             composición por roles
│   ├── migrations/             SQL versionado (3 tablas)
│   └── tests/                  unitarias e integración
├── clients/
│   ├── web/                    cliente React + Vite
│   └── consola/                cliente CLI (broadcast en vivo)
├── scripts/                    demo.ts, republicar.ts, iniciar.ps1 y detener.ps1
└── INICIAR.bat / DETENER.bat   arranque y apagado en Windows
```

## Requisitos previos

- **Node.js ≥ 20.12** y npm (desarrollado con Node 20.20).
- **Docker** (para MongoDB y, si no hay uno propio, RabbitMQ).
- Una base **PostgreSQL en la nube** (Neon o Supabase, gratis). Ver [docs/despliegue-nube.md](docs/despliegue-nube.md).

## Variables de entorno

Copia `.env.example` a `.env` (Windows PowerShell: `Copy-Item .env.example .env`) y completa `DATABASE_URL`.
Si usas el CLI de Neon (`neon deploy`), la variable queda en `.env.local`, que el servidor también lee.
**`.env` está en `.gitignore`; nunca lo subas.**

| Variable | Descripción | Por defecto |
|---|---|---|
| `DATABASE_URL` | Cadena de conexión PostgreSQL (obligatoria para los roles `api` y `projector`) | — |
| `MONGODB_URL` / `MONGODB_DB` | MongoDB para el modelo de lectura | sin definir / `cqrs_query` |
| `RABBITMQ_URL` | URL AMQP | `amqp://guest:guest@localhost:5672` |
| `RABBITMQ_EXCHANGE` | Nombre del exchange fanout | `cqrs.eventos` |
| `PORT` / `HOST` | Puerto y host del servidor | `3000` / `0.0.0.0` |
| `ROLES` | Componentes del servidor a ejecutar: `api`, `projector`, `broadcast` | los tres |
| `CORS_ORIGIN` | Origen(es) permitidos, separados por coma | `*` |
| `LOG_LEVEL` | Nivel de logs (pino) | `info` |
| `TEST_DATABASE_URL` | Base **solo para pruebas** de integración | — |

El cliente web usa `VITE_API_URL` (`clients/web/.env.example`, por defecto `http://localhost:3000`).

## Cómo ejecutar todo, en orden

```bash
# 1. Dependencias (servidor y clientes, con npm workspaces)
npm install

# 2. RabbitMQ  (consola de administración: http://localhost:15672, guest/guest) y MongoDB
docker compose up -d rabbitmq mongo

# 3. Base de datos: completa DATABASE_URL en .env y luego
npm run migrate        # crea event_store, read_salas, read_mensajes (las read_* solo se usan sin MongoDB)
npm run verify:db      # comprueba la conexión y las tablas

# 4. Servidor (API + proyector + broadcast en un proceso) -> http://localhost:3000
npm run start:server   # o npm run dev:server para recargar al editar

# 5. Cliente web -> http://localhost:5173   (otra terminal)
npm run dev:web

# 6. Cliente de consola (otra terminal; opcional --url y --sala <uuid>)
npm run dev:consola
npm run dev:consola -- --url http://localhost:3000 --sala <uuid-de-sala>
```

> Si ya tienes un RabbitMQ local usando el puerto 5672, no hace falta Docker: apunta `RABBITMQ_URL` a él.
> PostgreSQL local opcional (en lugar de la nube): `docker compose --profile local-db up -d postgres`, con
> `DATABASE_URL=postgresql://cqrs:cqrs@localhost:5432/cqrs`. Si el 5432 está ocupado, usa otro puerto:
> `POSTGRES_PORT=5440 docker compose --profile local-db up -d postgres` y `...@localhost:5440/cqrs`.

### Ejecutar los componentes por separado

El servidor arranca solo lo indicado en `ROLES`. Ejemplo en tres terminales (mismo `.env`, puertos distintos):

```bash
ROLES=api PORT=3000 npm run start:server         # comandos y consultas HTTP
ROLES=projector PORT=3001 npm run start:server   # proyector a tablas de lectura (sin tráfico de clientes)
ROLES=broadcast PORT=3002 npm run start:server   # Socket.IO (no necesita DATABASE_URL)
```

En PowerShell: `$env:ROLES="api"; $env:PORT=3000; npm run start:server`. El cliente web usa **una sola URL** para HTTP y
Socket.IO (`VITE_API_URL`), así que con él conviene `ROLES=api,broadcast` en un proceso; el proyector sí puede ir aparte.
La consola solo usa Socket.IO, de modo que puede apuntar directamente a un proceso `broadcast` (`--url http://localhost:3002`).

## Cliente web: intranet "Nexora"

El cliente web simula la intranet de una empresa (**Nexora**): los *canales* son las salas del dominio (por área: General,
Finanzas, Tecnología...), y los empleados tienen nombre, cargo y área. Al abrir la web se elige con qué empleado entrar
(abre otra ventana con otro empleado para ver el broadcast). Incluye mensajes con avatar y cargo, contador de no leídos por
canal y un panel **"Flujo de datos en vivo"** que ilumina el camino Comando → `event_store` → RabbitMQ → Proyector + Broadcast
→ Clientes cada vez que llega un evento, con el id de evento, su versión y la latencia de entrega.

- Los empleados y cargos son **datos de demostración del cliente** (`clients/web/src/empresa.ts`): el servidor no los conoce y sigue
  con solo tres tablas. El cargo viaja dentro del campo `autor` como `Nombre · Cargo`.
- El permiso "solo Gerente, Directora o Líder crean canales" es de interfaz (demostrativo); no hay autenticación real.

## Demostración rápida

`npm run demo` levanta el servidor completo, conecta un cliente en vivo, envía comandos, muestra los eventos recibidos por
broadcast y, tras la consistencia eventual, las consultas. Requiere RabbitMQ, `DATABASE_URL` y `npm run migrate`.

Guion manual (con el servidor corriendo y la consola abierta):

```bash
# Comando: crear sala (201 {salaId, eventId})
curl -X POST http://localhost:3000/api/comandos/salas -H "content-type: application/json" -d '{"nombre":"General"}'

# Comando: enviar mensaje
curl -X POST http://localhost:3000/api/comandos/salas/<salaId>/mensajes -H "content-type: application/json" \
     -d '{"autor":"ana","texto":"Hola"}'

# Consultas
curl http://localhost:3000/api/consultas/salas
curl "http://localhost:3000/api/consultas/salas/<salaId>/mensajes?limite=20"
```

La consola y el cliente web muestran los eventos al instante (broadcast). Para ver el log de eventos:
`SELECT * FROM event_store ORDER BY id;` en el SQL Editor de Supabase (o Neon).

## API

| Método y ruta | Tipo | Respuesta |
|---|---|---|
| `POST /api/comandos/salas` `{nombre}` | Comando `CrearSala` → `SalaCreada` | `201 {salaId, eventId}` |
| `POST /api/comandos/salas/:salaId/mensajes` `{autor, texto}` | Comando `EnviarMensaje` → `MensajeEnviado` | `201 {mensajeId, eventId, version}` |
| `GET /api/consultas/salas` | Consulta `ListarSalas` | `200 {salas}` |
| `GET /api/consultas/salas/:salaId/mensajes?limite=50` | Consulta `ListarMensajes` (1–200) | `200 {mensajes}` |
| `GET /salud` | Estado y roles activos | `200` |

Errores: `{ "error": { "codigo", "mensaje", "detalles?" } }` con `400` (validación), `404` (sala inexistente o aún no
proyectada), `409` (conflicto de concurrencia agotados los reintentos) y `500`.

Evento de dominio (en `event_store`, RabbitMQ y Socket.IO): `{ id, type, aggregateType, aggregateId, version, occurredAt, payload }`
con `type` = `SalaCreada` (`payload.nombre`) o `MensajeEnviado` (`payload.mensajeId, autor, texto`).
Socket.IO: el cliente emite `suscribir` (salaId), `desuscribir` o `suscribir_todas` y recibe `evento`
(ver [arquitectura](docs/arquitectura.md#4-broadcast)).

## Pruebas y calidad

```bash
npm run lint
npm run typecheck
npm test
```

- **Unitarias** (siempre se ejecutan): handlers de comandos y consultas, validaciones, proyector, enrutamiento del broadcast,
  API y errores HTTP, configuración, formato de la consola.
- **Integración** (se omiten solas si falta la infraestructura):
  - `server/tests/integration/flow.test.ts`: comando → `event_store` → RabbitMQ → proyección → consulta. Requiere
    `TEST_DATABASE_URL` (base de pruebas) y RabbitMQ.
  - `server/tests/integration/broadcast.test.ts`: RabbitMQ → Socket.IO → clientes por sala. Requiere RabbitMQ.
  - `clients/consola/tests/broadcast.test.ts`: levanta el servidor real (`ROLES=broadcast`), publica un evento en RabbitMQ y
    comprueba que el cliente de consola lo recibe. Requiere RabbitMQ.

Última ejecución verificada (25-11-2026, PostgreSQL local temporal + RabbitMQ local): `npm run lint` y `npm run typecheck` sin errores;
`npm test` con 52 pruebas en el servidor (incluye 7 de integración) y 3 en la consola, todas en verde; `npm run demo` completa el flujo.
Para ejecutar las pruebas de integración: `TEST_DATABASE_URL=postgresql://cqrs:cqrs@localhost:5440/cqrs npm test`
(PowerShell: `$env:TEST_DATABASE_URL="..."; npm test`).

Las pruebas de integración usan el modelo de lectura en PostgreSQL; el de MongoDB se verificó con el flujo manual.

Las pruebas usan un exchange con nombre único por ejecución y lo borran al terminar.

## Utilidades

- `npm run republish`: republica en RabbitMQ todos los eventos de `event_store`. Útil si un evento se guardó pero no se pudo
  publicar (el proyector es idempotente, no duplica).

## Limitaciones conocidas

- Sin patrón *outbox*: si RabbitMQ falla justo tras guardar un evento, la lectura y el broadcast se recuperan con `npm run republish`.
- Sin autenticación: el `autor` es un texto libre (el alcance es demostrar CQRS y broadcast).
- Sin reconexión automática del servidor a RabbitMQ si el broker se cae (el proceso registra el error de conexión).
- Las migraciones son idempotentes pero no hay tabla de control (se mantiene la base en tres tablas).
