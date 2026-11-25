import type { Db } from 'mongodb';
import type { MensajeView, ReadModel, SalaView } from './handlers';

interface SalaDoc {
  _id: string;
  nombre: string;
  creadaEn: Date;
}
interface MensajeDoc {
  _id: string;
  salaId: string;
  autor: string;
  texto: string;
  enviadoEn: Date;
}

/** Lectura (consultas) desde las colecciones read_salas y read_mensajes de MongoDB. */
export class MongoReadModel implements ReadModel {
  constructor(private readonly db: Db) {}

  async listSalas(): Promise<SalaView[]> {
    const docs = await this.db.collection<SalaDoc>('read_salas').find().sort({ creadaEn: 1, _id: 1 }).toArray();
    return docs.map((d) => ({ id: d._id, nombre: d.nombre, creadaEn: d.creadaEn.toISOString() }));
  }

  async salaExists(salaId: string): Promise<boolean> {
    return (await this.db.collection<SalaDoc>('read_salas').countDocuments({ _id: salaId }, { limit: 1 })) > 0;
  }

  async listMensajes(salaId: string, limit: number): Promise<MensajeView[]> {
    const docs = await this.db
      .collection<MensajeDoc>('read_mensajes')
      .find({ salaId })
      .sort({ enviadoEn: -1, _id: -1 })
      .limit(limit)
      .toArray();
    return docs.reverse().map((d) => ({
      id: d._id,
      salaId: d.salaId,
      autor: d.autor,
      texto: d.texto,
      enviadoEn: d.enviadoEn.toISOString(),
    }));
  }
}
