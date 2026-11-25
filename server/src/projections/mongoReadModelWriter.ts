import type { Db } from 'mongodb';
import type { ReadModelWriter } from './projector';

/**
 * Escribe el modelo de lectura en MongoDB (NoSQL): cada sala y cada mensaje es un DOCUMENTO JSON.
 * El _id es el id del evento/agregado, y $setOnInsert con upsert hace idempotente cada evento
 * (la entrega de RabbitMQ es "al menos una vez").
 */
export class MongoReadModelWriter implements ReadModelWriter {
  constructor(private readonly db: Db) {}

  async insertSala(sala: { id: string; nombre: string; creadaEn: string }): Promise<void> {
    await this.db
      .collection<{ _id: string }>('read_salas')
      .updateOne({ _id: sala.id }, { $setOnInsert: { nombre: sala.nombre, creadaEn: new Date(sala.creadaEn) } }, { upsert: true });
  }

  async insertMensaje(m: { id: string; salaId: string; autor: string; texto: string; enviadoEn: string }): Promise<void> {
    await this.db
      .collection<{ _id: string }>('read_mensajes')
      .updateOne(
        { _id: m.id },
        { $setOnInsert: { salaId: m.salaId, autor: m.autor, texto: m.texto, enviadoEn: new Date(m.enviadoEn) } },
        { upsert: true },
      );
  }
}
