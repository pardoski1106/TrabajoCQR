import type { Pool } from 'pg';
import type { ReadModelWriter } from './projector';

/** Escribe en read_salas / read_mensajes. ON CONFLICT DO NOTHING hace idempotente cada evento. */
export class PgReadModelWriter implements ReadModelWriter {
  constructor(private readonly pool: Pool) {}

  async insertSala(sala: { id: string; nombre: string; creadaEn: string }): Promise<void> {
    await this.pool.query(
      'INSERT INTO read_salas (id, nombre, creada_en) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING',
      [sala.id, sala.nombre, sala.creadaEn],
    );
  }

  async insertMensaje(m: { id: string; salaId: string; autor: string; texto: string; enviadoEn: string }): Promise<void> {
    await this.pool.query(
      `INSERT INTO read_mensajes (id, sala_id, autor, texto, enviado_en)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING`,
      [m.id, m.salaId, m.autor, m.texto, m.enviadoEn],
    );
  }
}
