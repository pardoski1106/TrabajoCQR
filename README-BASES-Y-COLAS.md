# Guía visual: bases de datos, cola de mensajería, URLs y evidencias

El proyecto usa una base **relacional** para escribir, una **no relacional** para leer y **RabbitMQ** como cola.

| Lado CQRS | Motor | Tipo | Dónde está | Qué guarda |
|---|---|---|---|---|
| **Command** (escritura) | **PostgreSQL** en la nube (**Supabase**) | SQL | `DATABASE_URL` en `.env` | tabla `event_store` (historial de eventos) |
| **Query** (lectura) | **MongoDB** (Docker, local) | NoSQL | `mongodb://localhost:27017` · base `MONGODB_DB` (`cqrs_query_supabase`) | colecciones `read_salas`, `read_mensajes` |
| **Cola** | **RabbitMQ** | mensajería | `amqp://localhost:5672` | exchange `cqrs.eventos` (fanout) |

> **No se usa Kafka**, así que no hay tópicos. El equivalente es el exchange `cqrs.eventos`.

## 1. Flujo

```
Web / Postman ─POST─► API comandos ─► PostgreSQL (event_store) ─► RabbitMQ (fanout) ─┬─► Proyector ─► MongoDB
                                                                                    └─► Broadcast ─► Socket.IO ─► web y consola
Web / Postman ─GET──► API consultas ─► MongoDB
```

El `POST` responde `201` cuando el evento ya está guardado y publicado. MongoDB se actualiza un instante después
(**consistencia eventual**).

## 2. Levantar y apagar

- **`INICIAR.bat`**: abre Docker Desktop si hace falta, levanta MongoDB, comprueba RabbitMQ y PostgreSQL, y abre el
  servidor (3000) y la web (5173). Con Supabase se necesita **internet**.
- **`DETENER.bat`**: detiene servidor, web y MongoDB. Los datos se conservan.
- Cliente de consola (opcional): `npm run dev:consola`.

## 3. Ver la base SQL (escritura)

Supabase → tu proyecto → **Table Editor** → `event_store`, o en **SQL Editor**:

```sql
SELECT id, tipo, version, aggregate_id, payload FROM event_store ORDER BY id DESC;
```

Las tablas `read_salas` y `read_mensajes` existen en PostgreSQL pero están **vacías a propósito**: la lectura vive en MongoDB.
Las tres tablas tienen RLS activo para que no queden expuestas por la API pública de Supabase.

## 4. Ver la base NoSQL (lectura)

MongoDB Compass → **Add new connection** → `mongodb://localhost:27017` (sin usuario ni clave) → `cqrs_query_supabase`
→ `read_salas` / `read_mensajes` → **Refresh** después de cada comando (Compass no se actualiza solo).

Sin Compass:

```powershell
docker exec trabajocqr-mongo-1 mongosh cqrs_query_supabase --eval "db.read_mensajes.find().sort({enviadoEn:-1}).limit(5)"
```

**Si no ves los mensajes nuevos:** revisa que estés en `cqrs_query_supabase`. `cqrs_query` es la base de cuando se
escribía en PostgreSQL local y ya no se actualiza. Las horas se muestran en UTC.

## 5. Ver la cola (RabbitMQ)

http://localhost:15672 (`guest` / `guest`).

- **Exchanges → `cqrs.eventos`** (fanout): aquí se publica; *Message rates* sube con cada comando.
- **Queues → `cqrs.eventos.proyector`**: cola durable que alimenta MongoDB.
- **Cola `amq.gen-...`**: la del broadcast; cambia de nombre en cada arranque.
- **Bindings** del exchange: las dos colas enlazadas.

Para ver el contenido de un mensaje (las colas del sistema se vacían al instante):

1. *Queues and Streams* → *Add a new queue* → `evidencia`, Durability **Durable** → *Add queue*.
2. Abre `evidencia` → *Bindings* → From exchange `cqrs.eventos` → *Bind*.
3. Envía un `POST` desde Postman.
4. En `evidencia` → *Get messages* → *Get Message(s)*.
5. Borra la cola (*Delete*) para que no acumule mensajes.

| Pieza | Nombre | Código |
|---|---|---|
| Exchange | `cqrs.eventos` | `server/src/messaging/rabbit.ts` (`assertExchange`) |
| Publicar / consumir | `publish()` / `subscribe()` | `server/src/messaging/rabbit.ts` |
| Colas | proyector y broadcast | `server/src/main.ts` |

## 6. URLs y Postman

Importa `cqrs_trabajo.postman_collection.json`.

| Método y URL (`http://localhost:3000`) | Cuerpo | Responde | Base |
|---|---|---|---|
| `GET /salud` | — | `200` | — |
| `POST /api/comandos/salas` | `{"nombre":"Finanzas"}` | `201 {salaId, eventId}` | escribe PostgreSQL |
| `POST /api/comandos/salas/{salaId}/mensajes` | `{"autor":"Ana · Gerente","texto":"Hola"}` | `201 {mensajeId, eventId, version}` | escribe PostgreSQL |
| `GET /api/consultas/salas` | — | `200 {salas}` | lee MongoDB |
| `GET /api/consultas/salas/{salaId}/mensajes?limite=50` | — | `200 {mensajes}` | lee MongoDB |

- Los mensajes se consultan **de una sala a la vez**. Primero lista las salas y copia el `id`.
- En la colección, `{{salaId}}` es la última sala creada con «1. Crear sala». Para otra sala: colección → **Variables** →
  `salaId` → *Current value* → guardar.
- Límites: `nombre` 80, `autor` 40 y `texto` 1000 caracteres.
- Errores: `400` validación, `404` sala inexistente o aún no proyectada.
- La carpeta «COLA RabbitMQ» consulta el exchange, las colas y los bindings (Basic Auth `guest` / `guest`).

**Crear salas desde la web:** entra como Laura Gómez, Sofía Vega o María Ángel → *Crear canal*.

## 7. Volver a PostgreSQL local (sin internet)

En `.env`: quita el `#` de la línea `DATABASE_URL` local (puerto 5433), comenta la de Supabase, pon `MONGODB_DB=cqrs_query`
y ejecuta `DETENER.bat` e `INICIAR.bat`. En ese modo, PostgreSQL se ve con pgAdmin (importa `pgadmin-servers.json`).

Si pgAdmin dice *«no existe la base de datos "bd_query"»*: en el servidor → *Properties* → *Connection* →
**Maintenance database** `bd_command_cqrs`. `bd_query` es del ejercicio 2 y no se crea en este proyecto.
