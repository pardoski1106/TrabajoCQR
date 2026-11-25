import { MongoClient, type Db } from 'mongodb';

export interface MongoHandle {
  client: MongoClient;
  db: Db;
}

/** Conecta a MongoDB y garantiza los indices del modelo de lectura (las colecciones se crean solas). */
export async function connectMongo(url: string, dbName: string): Promise<MongoHandle> {
  const client = new MongoClient(url, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  const db = client.db(dbName);
  await db.collection('read_mensajes').createIndex({ salaId: 1, enviadoEn: -1, _id: -1 });
  await db.collection('read_salas').createIndex({ creadaEn: 1, _id: 1 });
  return { client, db };
}
