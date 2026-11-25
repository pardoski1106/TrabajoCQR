# Despliegue de la base de datos en la nube

La base de datos es **PostgreSQL gestionado en la nube** (plan gratuito de Neon o Supabase). Las credenciales **nunca** se
escriben en el repositorio: viven en `.env` (ignorado por git) o en variables de entorno.

## Opción A: Neon

1. Crea una cuenta en <https://neon.tech> y un proyecto nuevo (región cercana).
2. En el panel del proyecto abre **Connect** y copia la cadena de conexión (con *pooled connection* o sin ella; ambas funcionan).
   Tiene la forma `postgresql://USUARIO:CLAVE@HOST/BASE?sslmode=require`.
3. Guárdala en tu `.env` local como `DATABASE_URL=...`.

## Opción A2: Neon con su CLI

El repositorio incluye `neon.ts` (configuración de Neon como código; solo declara PostgreSQL) y `@neon/config`.

```bash
npx neon@latest login          # abre el navegador una vez
npx neon@latest init -y --org-id <org-id> --project-id <project-id> --branch production --services postgres
npx neon@latest deploy         # escribe DATABASE_URL (pooled) y otras variables en .env.local
npm run migrate && npm run verify:db
```

El servidor lee `.env` y `.env.local` (`server/src/config.ts`), por lo que no hace falta copiar nada a mano.
`.env.local`, `.env.*` y `.neon` están en `.gitignore`. Para pruebas de integración usa una rama de Neon aparte, nunca `production`:
`neon checkout dev --create --no-env-pull`, `neon env pull --file .env.test.local`, `neon checkout production --no-env-pull`,
y pasa esa `DATABASE_URL` como `TEST_DATABASE_URL`. Las ramas nuevas expiran a los 7 días (política en `neon.ts`).

## Opción B: Supabase

1. Crea una cuenta en <https://supabase.com> y un proyecto nuevo (anota la contraseña de la base).
2. En **Project Settings → Database → Connection string** copia la cadena **URI** (usa la de *Session pooler* si tu red no tiene IPv6).
3. Reemplaza `[YOUR-PASSWORD]` y guárdala en `.env` como `DATABASE_URL=...`, terminando en
   `?sslmode=require&uselibpqcompat=true` (cifra sin verificar el certificado; sin esto `pg` suele rechazar el certificado del pooler).
4. `npm run migrate` y, en Supabase, activa RLS en las tres tablas para que no queden expuestas por su API pública
   (`ALTER TABLE event_store ENABLE ROW LEVEL SECURITY;` y lo mismo con `read_salas` y `read_mensajes`).

**Esta es la opción en uso en el proyecto.**

## Aplicar las migraciones

```bash
cp .env.example .env          # y completa DATABASE_URL
npm install
npm run migrate
```

`npm run migrate` ejecuta en orden `server/migrations/*.sql` (cada archivo en una transacción). Son idempotentes
(`CREATE ... IF NOT EXISTS`), por lo que repetirlo es seguro. Crean exactamente tres tablas:

| Tabla | Lado | Contenido |
|---|---|---|
| `event_store` | Escritura | `id bigserial`, `aggregate_id uuid`, `version int`, `tipo text`, `payload jsonb`, `ocurrido_en timestamptz`; única `(aggregate_id, version)` |
| `read_salas` | Lectura | `id uuid` (PK), `nombre`, `creada_en` |
| `read_mensajes` | Lectura | `id uuid` (PK), `sala_id` → `read_salas`, `autor`, `texto`, `enviado_en`; índice `(sala_id, enviado_en)` |

## Verificar la conexión

```bash
npm run verify:db
```

Imprime la base y la versión de PostgreSQL y lista las tablas encontradas; termina con error si falta alguna
(en ese caso ejecuta `npm run migrate`). Si falla la conexión, revisa que `DATABASE_URL` esté completa, que incluya
`sslmode=require` y que tu red permita salir al puerto 5432/6543.

## Qué corre en la nube y qué en local

Solo PostgreSQL está en la nube. El servidor, MongoDB (Docker), RabbitMQ y los clientes corren en tu equipo y se conectan a la base
por internet. Desplegar RabbitMQ en la nube es opcional (p. ej. CloudAMQP, plan gratuito): basta cambiar `RABBITMQ_URL`.

## Base separada para pruebas

Las pruebas de integración **insertan datos**. Usa una base de pruebas distinta (otra base en Neon/Supabase o el
PostgreSQL local de `docker compose --profile local-db`) en `TEST_DATABASE_URL`, nunca la de uso real.
