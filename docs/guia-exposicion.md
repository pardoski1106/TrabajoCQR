# Guía de exposición

Rutas relativas a la raíz del repositorio. Bases, colas, URLs y errores comunes:
[README-BASES-Y-COLAS.md](../README-BASES-Y-COLAS.md).

## Qué hace el sistema (30 segundos)

Intranet de mensajería por canales. Escribir y leer van por caminos y **bases distintas** (CQRS) y se comunican con
**eventos**. Se escribe en **PostgreSQL en la nube (Supabase)** y se lee de **MongoDB**. RabbitMQ reparte cada evento por
*fanout* a dos consumidores: el **proyector** (guarda documentos en MongoDB) y el **broadcast** (avisa por Socket.IO).

```
Cliente → POST comando → handler → event_store (PostgreSQL) → RabbitMQ (fanout)
                                                               ├─ proyector → MongoDB → GET consultas
                                                               └─ broadcast → Socket.IO → web y consola
```

## Antes de empezar

- [ ] Internet activo
- [ ] `INICIAR.bat`, sin cerrar las ventanas que abre
- [ ] Terminal con `npm run dev:consola`
- [ ] Dos ventanas en http://localhost:5173 con empleados distintos
- [ ] Supabase → Table Editor → `event_store`
- [ ] Compass → `mongodb://localhost:27017` → `cqrs_query_supabase`
- [ ] RabbitMQ → http://localhost:15672 (`guest` / `guest`)
- [ ] Postman con `cqrs_trabajo.postman_collection.json`

## Orden de la exposición

| # | Tema | Qué mostrar | Qué decir |
|---|---|---|---|
| 1 | Problema y solución | `docs/problematica.md` | «Separé escritura y lectura con CQRS y los mensajes llegan en vivo» |
| 2 | Arquitectura | `docs/arquitectura.md` | «Comando → PostgreSQL → RabbitMQ → MongoDB → consulta» |
| 3 | Servidor y clientes | `server/`, `clients/web`, `clients/consola` | «Aplicaciones separadas que solo se comunican por la red» |
| 4 | Broadcast | Escribir en una ventana web | El mensaje aparece en la otra y en la consola |
| 5 | Comando | Postman «1. Crear sala» y «2. Enviar mensaje» | «201: el evento quedó guardado» |
| 6 | Base relacional | Supabase `event_store` | Filas nuevas |
| 7 | Cola | Exchanges → `cqrs.eventos` → Bindings | «No hay tópicos; no uso Kafka» |
| 8 | Base no relacional | Compass `read_mensajes` → Refresh | Documento con el mismo `mensajeId` |
| 9 | Consulta | Postman «3. Listar salas» y «4. Listar mensajes» | «Esta respuesta sale de MongoDB» |
| 10 | Cierre | Errores 400 y 404 | Validación y consistencia eventual |

## "Muéstreme…" → archivo

| Pregunta | Dónde |
|---|---|
| Los **comandos** | `server/src/commands/handlers.ts` |
| Las **consultas** | `server/src/queries/handlers.ts`, `server/src/queries/mongoReadModel.ts` |
| Las rutas HTTP | `server/src/api/commandRoutes.ts`, `server/src/api/queryRoutes.ts` |
| Los **eventos** | `server/src/events/events.ts` |
| El **event store** (SQL) | `server/src/events/eventStore.ts` |
| La conexión a **MongoDB** | `server/src/db/mongo.ts`, `server/src/main.ts` |
| El **proyector** | `server/src/projections/projector.ts`, `mongoReadModelWriter.ts` |
| El **exchange fanout** | `server/src/messaging/rabbit.ts` |
| El **broadcast** | `server/src/broadcast/socketBridge.ts` |
| Concurrencia optimista | `server/migrations/001_event_store.sql`, `commands/handlers.ts` |
| Validación y errores | `api/commandRoutes.ts`, `commands/handlers.ts`, `api/errorHandler.ts` |
| Ejecutar por separado | variable `ROLES` en `server/src/main.ts` |
| Clientes | `clients/web/src/`, `clients/consola/src/` |
| Pruebas | `server/tests/`, `clients/consola/tests/` |

`pgReadModel.ts`, `pgReadModelWriter.ts` y las tablas `read_*` de PostgreSQL son el modo alterno, que solo se usa sin `MONGODB_URL`.

## Checklist de requerimientos

| Req. | Qué pide | Cómo se demuestra |
|---|---|---|
| R1 | Broadcast | Dos ventanas web y la consola (paso 4) |
| R2 | Mensajería con CQRS | Pasos 5 a 9 |
| R3 | Servidor y al menos dos clientes | Pasos 3 y 4 |
| R4 | Todo en GitHub | https://github.com/pardoski1106/TrabajoCQR |
| R5 | Componentes claros | `docs/arquitectura.md` |
| R6 | Justificación tecnológica | `docs/decisiones-tecnologicas.md` |
| R7 | Cómo se usa y en qué archivo | `docs/requerimientos.md` |
| R8 | Tecnologías nuevas justificadas | `docs/decisiones-tecnologicas.md` |
| R9 | PostgreSQL en la nube | Supabase (paso 6) |
| Extra | Base relacional y no relacional | Pasos 6 y 8 |

## Preguntas probables

- **¿Qué es CQRS?** Separar lo que modifica datos de lo que los consulta. Aquí cada lado tiene su propia base.
- **¿Por qué dos bases?** PostgreSQL da transacciones y restricciones al escribir; MongoDB entrega documentos listos para leer.
- **¿Dónde están los tópicos?** No hay: no se usa Kafka. El equivalente es el exchange `cqrs.eventos`.
- **¿Qué es fanout?** Cada cola enlazada recibe una copia de todos los eventos.
- **¿Por qué RabbitMQ y no Redis?** Redis Pub/Sub pierde eventos si el consumidor está caído; RabbitMQ tiene colas durables y acks.
- **¿Qué es event sourcing?** Guardar los hechos ocurridos; `event_store` es ese historial.
- **¿Qué es la consistencia eventual?** El 201 significa "evento guardado"; MongoDB se actualiza un instante después.
- **¿Dos usuarios a la vez?** `UNIQUE (aggregate_id, version)`: el que choca reintenta, hasta 3 veces; después, 409.
- **¿Y si RabbitMQ falla al publicar?** El evento queda en PostgreSQL; `npm run republish` lo recupera. No hay *outbox*.
- **¿Y si falla MongoDB al proyectar?** Se reintenta una vez y se descarta; `npm run republish` lo recupera.
- **¿Command y query son servicios separados?** Separados en código y rutas, en un mismo proceso. `ROLES` separa API, proyector y broadcast.
- **¿En qué difiere del ejercicio 2?** Allí hay dos servicios y CRUD; aquí un proceso, solo crear y consultar, y SQL guarda eventos.
- **¿Hay autenticación?** No. Los empleados y cargos son datos de demostración del cliente.
