import amqp from 'amqplib';
import { domainEventSchema, type DomainEvent } from '../events/events';
import type { EventPublisher, Logger } from '../events/publisher';

type RabbitConnection = Awaited<ReturnType<typeof amqp.connect>>;

/**
 * Conexion a RabbitMQ con el exchange FANOUT de eventos de dominio.
 * Fanout = cada cola enlazada recibe una copia de TODOS los eventos, sin routing key.
 * Asi el proyector y el puente de broadcast consumen el mismo evento de forma independiente.
 */
export class RabbitBus implements EventPublisher {
  private constructor(
    private readonly connection: RabbitConnection,
    private readonly publishChannel: amqp.ConfirmChannel,
    readonly exchange: string,
    private readonly log: Logger,
  ) {}

  static async connect(url: string, exchange: string, log: Logger): Promise<RabbitBus> {
    const connection = await amqp.connect(url);
    connection.on('error', (err: Error) => log.error({ err }, 'Error en la conexion RabbitMQ'));
    connection.on('close', () => log.warn({}, 'Conexion RabbitMQ cerrada'));
    const channel = await connection.createConfirmChannel();
    await channel.assertExchange(exchange, 'fanout', { durable: true });
    return new RabbitBus(connection, channel, exchange, log);
  }

  /** Publica el evento y espera la confirmacion del broker (publisher confirms). */
  async publish(event: DomainEvent): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.publishChannel.publish(
        this.exchange,
        '', // fanout ignora la routing key
        Buffer.from(JSON.stringify(event)),
        { persistent: true, contentType: 'application/json', messageId: event.id, type: event.type },
        (err) => (err ? reject(err) : resolve()),
      );
    });
    this.log.info({ eventId: event.id, type: event.type, aggregateId: event.aggregateId }, 'Evento publicado en RabbitMQ');
  }

  /**
   * Suscribe un consumidor al exchange.
   *  - queue = nombre  -> cola durable compartida (p. ej. el proyector: una sola copia procesa cada evento).
   *  - queue = undefined -> cola exclusiva y temporal propia de esta instancia (p. ej. broadcast:
   *    cada instancia del servidor recibe todos los eventos y los reenvia a sus clientes Socket.IO).
   * Devuelve una funcion para cancelar el consumo.
   */
  async subscribe(
    options: { queue?: string; name: string },
    handler: (event: DomainEvent) => Promise<void> | void,
  ): Promise<() => Promise<void>> {
    const channel = await this.connection.createChannel();
    await channel.prefetch(10);
    const q = options.queue
      ? await channel.assertQueue(options.queue, { durable: true })
      : await channel.assertQueue('', { exclusive: true, autoDelete: true });
    await channel.bindQueue(q.queue, this.exchange, '');

    const { consumerTag } = await channel.consume(q.queue, async (msg) => {
      if (!msg) return;
      let event: DomainEvent;
      try {
        event = domainEventSchema.parse(JSON.parse(msg.content.toString('utf8')));
      } catch (err) {
        // Mensaje malformado: reintentar no sirve; se descarta.
        this.log.error({ err, consumer: options.name }, 'Mensaje invalido descartado');
        channel.nack(msg, false, false);
        return;
      }
      try {
        await handler(event);
        channel.ack(msg);
      } catch (err) {
        // Un reintento (requeue); si ya fue reentregado, se descarta para no hacer bucle infinito.
        const giveUp = msg.fields.redelivered;
        this.log.error({ err, consumer: options.name, eventId: event.id, giveUp }, 'Fallo al procesar el evento');
        channel.nack(msg, false, !giveUp);
      }
    });

    return async () => {
      await channel.cancel(consumerTag);
      await channel.close();
    };
  }

  /** Borra exchange y colas indicadas (solo para pruebas). */
  async destroy(queues: string[] = []): Promise<void> {
    const ch = await this.connection.createChannel();
    for (const q of queues) await ch.deleteQueue(q);
    await ch.deleteExchange(this.exchange);
    await ch.close();
  }

  async close(): Promise<void> {
    await this.publishChannel.close().catch(() => undefined);
    await this.connection.close().catch(() => undefined);
  }
}
