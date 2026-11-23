import type { Pool } from 'pg';
import type { MensajeView, ReadModel, SalaView } from './handlers';

/** Lectura de las tablas read_salas y read_mensajes en PostgreSQL. */
export class PgReadModel implements ReadModel {
  constructor(private readonly pool: Pool) {}

  async listSalas(): Promise<SalaView[]> {
    const { rows } = await this.pool.query<{ id: string; nombre: string; creada_en: Date }>(
      'SELECT id, nombre, creada_en FROM read_salas ORDER BY creada_en, id',
    );
    return rows.map((r) => ({ id: r.id, nombre: r.nombre, creadaEn: r.creada_en.toISOString() }));
  }

  async salaExists(salaId: string): Promise<boolean> {
    const { rowCount } = await this.pool.query('SELECT 1 FROM read_salas WHERE id = $1', [salaId]);
    return (rowCount ?? 0) > 0;
  }

  async listMensajes(salaId: string, limit: number): Promise<MensajeView[]> {
    const { rows } = await this.pool.query<{
      id: string;
      sala_id: string;
      autor: string;
      texto: string;
      enviado_en: Date;
    }>(
      `SELECT id, sala_id, autor, texto, enviado_en
         FROM read_mensajes WHERE sala_id = $1
        ORDER BY enviado_en DESC, id DESC LIMIT $2`,
      [salaId, limit],
    );
    return rows
      .reverse()
      .map((r) => ({
        id: r.id,
        salaId: r.sala_id,
        autor: r.autor,
        texto: r.texto,
        enviadoEn: r.enviado_en.toISOString(),
      }));
  }
}
