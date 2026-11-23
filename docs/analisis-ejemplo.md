# Análisis de los ejemplos de referencia

Se analizaron las dos carpetas que acompañan el enunciado: `parte 1` (command en PostgreSQL + query en MySQL) y
`ejercicio2_mongodb` (command en PostgreSQL + query en MongoDB). Ambas comparten la misma estructura y código;
solo cambia el motor de la base de lectura. Este documento resume lo observado en ellas y qué se tomó (y qué no) para este proyecto.

## 1. Stack usado en el ejemplo

| Aspecto | Ejemplo |
|---|---|
| Lenguaje / framework | Java con Spring Boot 3.5.7 (`spring-boot-starter-web`, `spring-boot-starter-data-jpa`) |
| Build | Maven con wrapper (`mvnw`) y un `pom.xml` agregador con dos módulos |
| Persistencia | JPA/Hibernate; PostgreSQL (command) y MySQL o MongoDB (query) |
| Logging | Log4j2 |
| Mensajería | HTTP interno por defecto (`POST /events`) y Kafka opcional (`cqrs.events.transport=kafka`) |
| Utilidades | Lombok, colección Postman, scripts `.bat`/`.ps1` para levantar bases y servicios |
| Dominio | `Employee` (crear, actualizar, eliminar, consultar) |

## 2. Estructura de carpetas

```
parte 1/
├── pom.xml                      (agregador de módulos)
├── cqrs_command/                (microservicio de ESCRITURA, puerto 8620)
│   └── src/main/java/co/vinni/cqrs/
│       ├── controller/          EmployeeCommandController
│       ├── service/             EmployeeCommandService
│       ├── events/              EmployeeEventPublisher (+ Http..., Kafka...)
│       ├── persistence/         entity/ + repository/
│       └── dto/                 EmployeeDto, EmployeeEvent
├── cqrs_query/                  (microservicio de LECTURA, puerto 8622)
│   └── src/main/java/co/vinni/cqrs/
│       ├── controller/          EmployeeQueryController, EmployeeEventController
│       ├── service/             EmployeeQueryService, EmployeeEventHandler, KafkaEmployeeEventListener
│       ├── persistence/         entity/ + repository/
│       └── dto/
├── scripts/                     iniciar_todo.ps1, iniciar_postgres.ps1, detener_todo.ps1, verificar_bd.ps1
├── crear_bases_postgres.sql
├── INICIAR.bat / DETENER.bat / VERIFICAR.bat
└── cqrs_employees.postman_collection.json
```

## 3. Cómo separa comandos y consultas

- Son **dos aplicaciones distintas** con **dos bases de datos distintas**. El command (`EmployeeCommandController`,
  POST/PUT/DELETE) escribe en PostgreSQL; el query (`EmployeeQueryController`, GET) lee de su propia base.
- Cada servicio tiene su propia entidad (`persistence/entity/Employee`) y su propio repositorio. No comparten tablas.
- `EmployeeCommandService` valida, guarda en la base de escritura y **después** publica el evento.

## 4. Cómo publica eventos

- El evento es `EmployeeEvent { eventType: CreateEmployee | UpdateEmployee | DeleteEmployee, employee: {...} }`.
- `EmployeeEventPublisher` es una interfaz con dos implementaciones seleccionadas por configuración:
  `HttpEmployeeEventPublisher` (POST al servicio query) y `KafkaEmployeeEventPublisher` (topic de Kafka).
- Si la publicación HTTP falla, el dato ya quedó guardado y solo se registra un error (la lectura queda desincronizada).

## 5. Cómo se sincroniza la lectura y si hay broadcast

- En el query, `EmployeeEventHandler` aplica el evento con un *upsert* idempotente (`CreateEmployee`/`UpdateEmployee`)
  o un borrado (`DeleteEmployee`). Llega por `EmployeeEventController` (HTTP) o por `KafkaEmployeeEventListener`.
- **El ejemplo no hace broadcast**: cada evento va a un único consumidor (el servicio query). No hay clientes que reciban
  eventos en vivo, ni un event store: la fuente de verdad es la tabla del command, no un log de eventos.

## 6. Qué se toma del ejemplo y qué se cambia

| Patrón del ejemplo | En este proyecto |
|---|---|
| Servicios separados de comando y consulta | Se conserva la separación (`server/src/commands` y `server/src/queries`) y cada lado usa tablas distintas; ambos pueden correr como procesos separados con `ROLES` |
| Publicador como interfaz con transporte intercambiable | `EventPublisher` (puerto) con implementación `RabbitBus` (`server/src/messaging/rabbit.ts`) |
| Manejador idempotente en el lado de lectura | `createProjector` + `INSERT ... ON CONFLICT DO NOTHING` |
| Fallo de publicación no pierde el dato | Igual, pero con utilidad de recuperación: `npm run republish` |
| Scripts de arranque y guion de demostración | `npm run demo`, `docker-compose.yml` y la sección de demostración del README |
| Colección Postman | Se documentan peticiones `curl` equivalentes en el README |
| (no existe) | **Nuevo:** event store, broadcast Socket.IO, dos clientes, PostgreSQL en la nube |

## 7. Decisión de stack

El ejemplo usa Java/Spring Boot; el enunciado propone Node.js + TypeScript. Se eligió **Node.js + TypeScript** (decisión
confirmada con el usuario) porque Socket.IO, el cliente web en tiempo real y el cliente de consola comparten lenguaje y
contratos, y porque el broadcast (requisito central) es nativo del ecosistema Node. El detalle está en
[decisiones-tecnologicas.md](decisiones-tecnologicas.md). Se usa Node 20 (el equipo de desarrollo tiene v20.20.2); el
código solo requiere Node ≥ 20.12 por `process.loadEnvFile`.
