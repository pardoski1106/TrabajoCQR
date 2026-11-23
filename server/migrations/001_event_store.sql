-- Lado de ESCRITURA: log inmutable de eventos de dominio (fuente de verdad).
-- Idempotente: se puede ejecutar varias veces (no hay tabla de control de migraciones,
-- para mantener la base en exactamente tres tablas).
CREATE TABLE IF NOT EXISTS event_store (
    id           bigserial   PRIMARY KEY,
    aggregate_id uuid        NOT NULL,
    version      int         NOT NULL CHECK (version >= 1),
    tipo         text        NOT NULL,
    payload      jsonb       NOT NULL,
    ocurrido_en  timestamptz NOT NULL DEFAULT now(),
    -- Concurrencia optimista: dos comandos no pueden escribir la misma version de un agregado.
    CONSTRAINT event_store_aggregate_version_uq UNIQUE (aggregate_id, version)
);
