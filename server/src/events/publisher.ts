import type { DomainEvent } from './events';

/** Puerto de publicacion de eventos (la implementacion real usa RabbitMQ). */
export interface EventPublisher {
  publish(event: DomainEvent): Promise<void>;
}

/** Logger minimo que usan los componentes (compatible con pino / Fastify). */
export interface Logger {
  info(obj: object, msg?: string): void;
  warn(obj: object, msg?: string): void;
  error(obj: object, msg?: string): void;
}
