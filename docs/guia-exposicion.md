# Guía de exposición

## En una frase

Es una mensajería por salas donde **se escribe en PostgreSQL (nube, Supabase) y se lee de MongoDB**, y las dos partes se
comunican por RabbitMQ.

> Para decirlo en voz alta: «Cuando envío un mensaje, se guarda en PostgreSQL, viaja por una cola, se copia en MongoDB para
> consultarlo y llega en vivo a los demás».

## El recorrido

```
Web/Postman ──POST──► API comandos ──► PostgreSQL (event_store)
                                            │
                                            ▼
                                   RabbitMQ (cqrs.eventos)
                                    │                    │
                               Proyector              Broadcast ──► web y consola (en vivo)
                                    │
                                 MongoDB ◄── API consultas ◄──GET── Web/Postman
```

1. La web o Postman envía un **POST**.
2. El servidor **valida** y guarda un **evento** en PostgreSQL.
3. Publica el evento en **RabbitMQ**.
4. El **proyector** lo recibe y lo guarda en **MongoDB**.
5. El **broadcast** recibe otra copia y la envía en vivo a los clientes.
6. Un **GET** responde leyendo solo de MongoDB.

## Partes del proyecto y sus archivos

Las rutas están dentro de `server/src/`, salvo las de `clients/`. El número es la línea.

| Parte | Se conecta con | Archivo y línea |
|---|---|---|
| Arranque | Une todas las partes | `main.ts`: MongoDB 35, comandos y consultas 40, proyector 52, broadcast 64 |
| Rutas POST | Web y Postman → lógica | `api/commandRoutes.ts`: 25 y 31 |
| Lógica de comandos | Guarda y luego publica | `commands/handlers.ts`: 64 y 75 |
| Guardar en PostgreSQL | Tabla `event_store` | `events/eventStore.ts`: 43 |
| Conexión PostgreSQL | `DATABASE_URL` | `db/pool.ts`: 4 |
| Forma del evento | Lo usan todos | `events/events.ts`: 32 |
| Cola RabbitMQ | Exchange, publicar, consumir | `messaging/rabbit.ts`: 25, 30 y 50 |
| Confirmar y reintentar | RabbitMQ | `messaging/rabbit.ts`: 106 |
| Proyector | RabbitMQ → MongoDB | `projections/projector.ts`: 13 |
| Guardar en MongoDB | `read_salas`, `read_mensajes` | `projections/mongoReadModelWriter.ts`: 12 y 18 |
| Conexión MongoDB | `MONGODB_URL` | `db/mongo.ts`: 9 |
| Rutas GET | Web y Postman → consultas | `api/queryRoutes.ts`: 17 y 19 |
| Leer de MongoDB | Respuesta de los GET | `queries/mongoReadModel.ts`: 21 y 30 |
| Broadcast | RabbitMQ → Socket.IO | `broadcast/socketBridge.ts`: 28 y 42 |
| Cliente web | HTTP y en vivo | `clients/web/src/api.ts` y `realtime.ts` |
| Cliente de consola | Solo en vivo | `clients/consola/src/cliente.ts`: 20 |

## La cola de RabbitMQ

**RabbitMQ no guarda datos, los transporta.** El mensaje entra, se entrega y se borra, por eso las colas se ven en 0. Lo
guardado está en Supabase y MongoDB.

Sirve para tres cosas: separar la escritura de la lectura, repartir cada evento a dos consumidores y no perder trabajo
(cola durable con confirmación).

| En el panel | Qué es |
|---|---|
| Exchange `cqrs.eventos` (fanout) | Donde se publica; copia a todas las colas |
| Cola `cqrs.eventos.proyector` | Alimenta MongoDB |
| Cola `amq.gen-...` | Broadcast; es temporal |

## Antes de empezar

- [ ] Internet activo
- [ ] `INICIAR.bat`, sin cerrar las ventanas que abre
- [ ] Terminal en `TrabajoCQR` con `npm run dev:consola`
- [ ] Dos ventanas web con empleados distintos
- [ ] Supabase, Compass, RabbitMQ y Postman abiertos

| Qué | Dónde | Acceso |
|---|---|---|
| Web | http://localhost:5173 | Elegir empleado |
| API | http://localhost:3000/salud | Sin clave |
| RabbitMQ | http://localhost:15672 | `guest` / `guest` |
| PostgreSQL | Panel de Supabase | Tu cuenta |
| MongoDB | `mongodb://localhost:27017` → `cqrs_query_supabase` | Sin clave |

Para apagar: `DETENER.bat`.

## Orden de la exposición

| Paso | Muestra | Di |
|---|---|---|
| 1. Idea | La frase del inicio | Separé escritura y lectura (CQRS) |
| 2. Arquitectura | El recorrido | Cada parte tiene una sola tarea |
| 3. Aplicaciones | `server`, `clients/web`, `clients/consola` | Un servidor y dos clientes separados |
| 4. En vivo | Escribe en una ventana web | Llega a la otra y a la consola |
| 5. Comando | Postman: crear sala y enviar mensaje | 201: quedó guardado |
| 6. Base relacional | Supabase: `event_store` | Aquí se escribe |
| 7. Cola | Exchange `cqrs.eventos` y Bindings | No hay tópicos, no uso Kafka |
| 8. Base no relacional | Compass: `read_mensajes`, Refresh | El mismo `mensajeId` |
| 9. Consulta | Postman: listar salas y mensajes | Esto sale de MongoDB |
| 10. Cierre | Errores 400 y 404 | Hay validación |

## Cómo ver las evidencias

**Supabase (escritura):** Table Editor → `event_store`, o en SQL Editor:

```sql
SELECT id, tipo, version, payload FROM event_store ORDER BY id DESC;
```

Las tablas `read_salas` y `read_mensajes` de Supabase están vacías a propósito.

**MongoDB (lectura):** Compass → `mongodb://localhost:27017` → `cqrs_query_supabase` → `read_salas` o `read_mensajes` →
Refresh. La base `cqrs_query` es antigua. Las horas salen en UTC. Sin Compass:

```powershell
docker exec trabajocqr-mongo-1 mongosh cqrs_query_supabase --eval "db.read_mensajes.find()"
```

**Ver un mensaje dentro de la cola:**

1. Queues and Streams → Add a new queue → `evidencia`, Durable.
2. Entra a `evidencia` → Bindings → From exchange `cqrs.eventos` → Bind.
3. Envía un mensaje.
4. Get messages → Get Message(s).
5. Borra la cola `evidencia`.

## Postman

Importa `cqrs_trabajo.postman_collection.json`. Base: `http://localhost:3000`.

| Método y ruta | Body | Resultado |
|---|---|---|
| `GET /salud` | — | 200 |
| `POST /api/comandos/salas` | `{"nombre":"Finanzas"}` | 201 con `salaId` |
| `POST /api/comandos/salas/{salaId}/mensajes` | `{"autor":"Ana","texto":"Hola"}` | 201 con `mensajeId` |
| `GET /api/consultas/salas` | — | Lista de salas |
| `GET /api/consultas/salas/{salaId}/mensajes?limite=50` | — | Mensajes de esa sala |
| `POST /api/comandos/salas` | `{}` | Error 400 |
| `GET /api/consultas/salas/00000000-0000-0000-0000-000000000000/mensajes` | — | Error 404 |

Para usar otra sala: Colección → Variables → `salaId` → *Current value* y guarda. En la web crean salas Laura Gómez, Sofía
Vega y María Ángel.

## Checklist de requerimientos

| Req. | Qué pide | Cómo se demuestra |
|---|---|---|
| R1 | Broadcast | Paso 4 |
| R2 | Mensajería con CQRS | Pasos 5 a 9 |
| R3 | Servidor y dos clientes | Pasos 3 y 4 |
| R4 | Todo en GitHub | https://github.com/pardoski1106/TrabajoCQR |
| R5 | Componentes claros | `docs/arquitectura.md` |
| R6 | Justificar tecnologías | `docs/decisiones-tecnologicas.md` |
| R7 | Cómo se usa y en qué archivo | `docs/requerimientos.md` |
| R8 | Tecnologías nuevas | `docs/decisiones-tecnologicas.md` |
| R9 | PostgreSQL en la nube | Supabase, paso 6 |
| Extra | Base relacional y no relacional | Pasos 6 y 8 |

## Preguntas del profesor

- **¿Qué es CQRS?** Separar lo que modifica datos (comandos) de lo que los consulta.
- **¿Por qué dos bases?** PostgreSQL da seguridad al escribir; MongoDB entrega documentos listos para leer.
- **¿Dónde se publica en la cola?** El comando guarda y llama a `publish()`, de `rabbit.ts`.
- **¿Quién consume?** El proyector y el broadcast, suscritos en `main.ts`.
- **¿Dónde están los tópicos?** No hay, son de Kafka. El equivalente es el exchange `cqrs.eventos`.
- **¿Qué es fanout?** Cada cola enlazada recibe una copia de todos los eventos.
- **¿Por qué RabbitMQ y no Kafka?** Basta para repartir a dos consumidores y el historial ya queda en PostgreSQL.
- **¿El comando escribe en MongoDB?** No, lo hace el proyector.
- **¿La consulta toca PostgreSQL?** No, solo MongoDB.
- **¿Los clientes se conectan a las bases?** No, solo al servidor por HTTP y Socket.IO.
- **¿Cómo sabe a qué bases conectarse?** Por el archivo `.env`, que se lee en `config.ts`.
- **¿Qué es event sourcing?** Guardar los hechos ocurridos; `event_store` es ese historial.
- **¿Qué es la consistencia eventual?** El 201 confirma que se guardó; MongoDB se actualiza un instante después.
- **¿Si falla RabbitMQ al publicar?** El evento queda en PostgreSQL y se recupera con `npm run republish`. No hay *outbox*.
- **¿Si falla el proyector?** Reintenta una vez, descarta y se recupera con `npm run republish`.
- **¿Se duplica al republicar?** En MongoDB no (upsert). Los clientes en vivo sí vuelven a recibirlo.
- **¿Si dos escriben a la vez?** La versión es única por sala: el que choca reintenta hasta 3 veces; después responde 409.
- **¿Son servicios separados?** Es un proceso. `ROLES` permite separar API, proyector y broadcast; comandos y consultas van juntos.
- **¿En qué difiere del ejercicio 2?** Allí hay dos servicios (8620 y 8622), CRUD y sincronización por HTTP. Aquí un proceso,
  solo crear y consultar, RabbitMQ, y SQL guarda eventos.
- **¿Hay autenticación?** No. Los empleados de la web son datos de demostración.

## Si algo falla

| Problema | Solución |
|---|---|
| No arranca | Revisa internet y Docker Desktop; ejecuta `DETENER.bat` e `INICIAR.bat` |
| Mongo no muestra mensajes | Usa `cqrs_query_supabase` y pulsa Refresh |
| 404 al enviar o listar | Copia un `salaId` actual con listar salas |
| Sin internet | En `.env` activa la línea local de `DATABASE_URL`, comenta la de Supabase, pon `MONGODB_DB=cqrs_query` y reinicia |

Más detalle sobre bases y colas: [README-BASES-Y-COLAS.md](../README-BASES-Y-COLAS.md).
