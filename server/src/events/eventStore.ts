import type { Pool } from 'pg';
import { ConcurrencyError } from '../errors';
import { domainEventSchema, type DomainEvent, type NewEvent } from './events';

/** Puerto del almacen de eventos (lado de escritura). */
export interface EventStore {
  /** Agrega un evento. Lanza ConcurrencyError si (aggregateId, version) ya existe. */
  append(event: NewEvent): Promise<DomainEvent>;
  /** Ultima version del agregado; 0 si no existe. */
  currentVersion(aggregateId: string): Promise<number>;
  /** Todos los eventos en orden de insercion (usado por la utilidad de republicacion). */
  readAll(): Promise<DomainEvent[]>;
}

interface EventRow {
  id: string;
  aggregate_id: string;
  version: number;
  tipo: string;
  payload: unknown;
  ocurrido_en: Date;
}

function rowToEvent(row: EventRow): DomainEvent {
  return domainEventSchema.parse({
    id: String(row.id),
    type: row.tipo,
    aggregateType: 'Sala',
    aggregateId: row.aggregate_id,
    version: row.version,
    occurredAt: row.ocurrido_en.toISOString(),
    payload: row.payload,
  });
}

/** Implementacion sobre PostgreSQL (tabla event_store). */
export class PgEventStore implements EventStore {
  constructor(private readonly pool: Pool) {}

  async append(event: NewEvent): Promise<DomainEvent> {
    try {
      const { rows } = await this.pool.query<EventRow>(
        `INSERT INTO event_store (aggregate_id, version, tipo, payload)
         VALUES ($1, $2, $3, $4)
         RETURNING id, aggregate_id, version, tipo, payload, ocurrido_en`,
        [event.aggregateId, event.version, event.type, JSON.stringify(event.payload)],
      );
      return rowToEvent(rows[0]!);
    } catch (err) {
      // 23505 = unique_violation sobre (aggregate_id, version)
      if ((err as { code?: string }).code === '23505') throw new ConcurrencyError();
      throw err;
    }
  }

  async currentVersion(aggregateId: string): Promise<number> {
    const { rows } = await this.pool.query<{ v: number }>(
      'SELECT COALESCE(MAX(version), 0)::int AS v FROM event_store WHERE aggregate_id = $1',
      [aggregateId],
    );
    return rows[0]!.v;
  }

  async readAll(): Promise<DomainEvent[]> {
    const { rows } = await this.pool.query<EventRow>(
      'SELECT id, aggregate_id, version, tipo, payload, ocurrido_en FROM event_store ORDER BY id',
    );
    return rows.map(rowToEvent);
  }
}
