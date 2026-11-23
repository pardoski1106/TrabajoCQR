-- Lado de LECTURA: tablas desnormalizadas que mantiene el proyector.
CREATE TABLE IF NOT EXISTS read_salas (
    id        uuid        PRIMARY KEY,
    nombre    text        NOT NULL,
    creada_en timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS read_mensajes (
    id         uuid        PRIMARY KEY,
    sala_id    uuid        NOT NULL REFERENCES read_salas (id),
    autor      text        NOT NULL,
    texto      text        NOT NULL,
    enviado_en timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS read_mensajes_sala_enviado_idx
    ON read_mensajes (sala_id, enviado_en);
