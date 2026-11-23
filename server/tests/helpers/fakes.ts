import { ConcurrencyError } from '../../src/errors';
import type { DomainEvent, NewEvent } from '../../src/events/events';
import type { EventStore } from '../../src/events/eventStore';
import type { EventPublisher, Logger } from '../../src/events/publisher';

/** Almacen de eventos en memoria con la misma regla de unicidad (aggregateId, version). */
export class InMemoryEventStore implements EventStore {
  readonly events: DomainEvent[] = [];
  /** Permite simular una carrera: la proxima N veces append falla con ConcurrencyError. */
  failNextAppends = 0;

  async append(event: NewEvent): Promise<DomainEvent> {
    if (this.failNextAppends > 0) {
      this.failNextAppends--;
      throw new ConcurrencyError();
    }
    if (this.events.some((e) => e.aggregateId === event.aggregateId && e.version === event.version)) {
      throw new ConcurrencyError();
    }
    const stored = {
      id: String(this.events.length + 1),
      aggregateType: 'Sala',
      aggregateId: event.aggregateId,
      version: event.version,
      occurredAt: new Date().toISOString(),
      type: event.type,
      payload: event.payload,
    } as DomainEvent;
    this.events.push(stored);
    return stored;
  }

  async currentVersion(aggregateId: string): Promise<number> {
    return Math.max(0, ...this.events.filter((e) => e.aggregateId === aggregateId).map((e) => e.version));
  }

  async readAll(): Promise<DomainEvent[]> {
    return [...this.events];
  }
}

export class FakePublisher implements EventPublisher {
  readonly published: DomainEvent[] = [];
  fail = false;
  async publish(event: DomainEvent): Promise<void> {
    if (this.fail) throw new Error('RabbitMQ caido');
    this.published.push(event);
  }
}

export const silentLogger: Logger = { info: () => undefined, warn: () => undefined, error: () => undefined };
