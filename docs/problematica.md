# Problemática y justificación del proyecto

> Escenario ilustrativo: **Nexora** es una empresa ficticia usada para contextualizar la solución. Las situaciones descritas
> son típicas de organizaciones medianas; no corresponden a mediciones reales.

## 1. Contexto

Una empresa con varias áreas (Finanzas, Comercial, Talento Humano, Tecnología, Operaciones) coordina su trabajo diario con
correos, llamadas y grupos de mensajería personales. A medida que crece, la comunicación interna se vuelve un problema de
**arquitectura de software**, no solo de hábitos.

## 2. Problemas identificados

| # | Problema | Consecuencia para el negocio |
|---|---|---|
| P1 | **La información llega tarde.** Los sistemas consultan al servidor cada cierto tiempo (*polling*) para ver si hay novedades. | Decisiones basadas en datos desactualizados; la gente recarga la pantalla o vuelve a preguntar. |
| P2 | **Lectura y escritura compiten por los mismos recursos.** Una sola base y un solo modelo atienden a la vez a quien publica y a quienes consultan el historial. | Al crecer el uso, las consultas pesadas vuelven lento el envío de mensajes (y al revés). |
| P3 | **Acoplamiento entre módulos.** Si el servicio que guarda llama directamente al que muestra, una falla en uno tumba al otro. | Una caída parcial se convierte en una caída total; es difícil agregar funciones (notificaciones, auditoría) sin tocar lo existente. |
| P4 | **No hay trazabilidad.** Se guarda solo el estado final, no la secuencia de hechos que lo produjo. | No se puede auditar quién dijo qué y cuándo, ni reconstruir lo ocurrido ante un error o una disputa. |
| P5 | **Los mensajes se pierden o se duplican** cuando un servicio está caído o se reintenta una operación. | Pérdida de información importante o acciones repetidas. |
| P6 | **Los clientes están atados al servidor.** Cada canal (web, móvil, consola, otros sistemas) exige integraciones a medida. | Costo de mantenimiento creciente y poca flexibilidad para sumar nuevos canales. |

## 3. Pregunta que originó la solución

> ¿Cómo diseñar la comunicación interna de una organización para que cada novedad llegue **al instante a todos los interesados**,
> sin que leer afecte a escribir, sin perder hechos y sin que los módulos dependan unos de otros?

## 4. Solución propuesta

Una pila de mensajería basada en **CQRS** y eventos con **broadcast**:

| Problema | Cómo lo resuelve la solución | Dónde |
|---|---|---|
| P1 Información tardía | **Broadcast** por Socket.IO: el evento se empuja a todos los clientes suscritos, sin *polling* | `server/src/broadcast/` |
| P2 Competencia lectura/escritura | **CQRS**: comandos escriben en `event_store`; las consultas leen tablas `read_*` separadas | `server/src/commands/`, `server/src/queries/` |
| P3 Acoplamiento | Los lados se comunican solo por **eventos** en RabbitMQ (*fanout*); proyector y broadcast son consumidores independientes que pueden ejecutarse por separado (`ROLES`) | `server/src/messaging/`, `server/src/main.ts` |
| P4 Trazabilidad | **Event store** inmutable: cada hecho queda con id, versión, fecha y contenido; permite auditar y reproyectar | `server/src/events/`, tabla `event_store` |
| P5 Pérdida/duplicados | Colas durables, mensajes persistentes y confirmaciones; proyección **idempotente** (`ON CONFLICT DO NOTHING`); `npm run republish` para recuperar | `server/src/messaging/rabbit.ts`, `server/src/projections/` |
| P6 Atadura a clientes | El servidor expone solo contratos (HTTP + eventos Socket.IO); web y consola son clientes independientes, y se pueden sumar más | `clients/web`, `clients/consola` |

## 5. Beneficios esperados

- **Inmediatez:** los equipos ven los mensajes y la creación de canales en el momento en que ocurren.
- **Escalabilidad independiente:** se puede reforzar el lado de lectura sin tocar el de escritura (y viceversa).
- **Resiliencia:** si el proyector se detiene, los mensajes se siguen aceptando y el broadcast sigue funcionando; el proyector
  se pone al día desde su cola durable al volver.
- **Auditoría y evolución:** el registro de eventos permite nuevas funciones (notificaciones, reportes) suscribiéndose al mismo flujo.

## 6. Costo de la solución (trade-offs)

- **Consistencia eventual:** la tabla de lectura se actualiza milisegundos después de la escritura (ver `arquitectura.md` §5).
- **Mayor complejidad** que un CRUD simple: más piezas (broker, proyector) que operar. Se justifica cuando importan la
  inmediatez, la trazabilidad y el desacople; no para una aplicación pequeña con un solo usuario.
- **Alcance de esta entrega:** sin autenticación real ni patrón *outbox* (ver README, "Limitaciones conocidas").

## 7. Resumen para decir en voz alta (20 segundos)

*"En una empresa en crecimiento, la comunicación interna se vuelve lenta, difícil de auditar y frágil porque todo depende de un
servidor que a la vez guarda y consulta. Propusimos separar escritura y lectura con CQRS y comunicar todo mediante eventos;
con broadcast, cada novedad llega al instante a todos los clientes. Así ganamos inmediatez, trazabilidad y desacople, a cambio
de aceptar consistencia eventual."*
