import { z } from 'zod';
import { NotFoundError, ValidationError } from '../errors';

/**
 * LADO DE LECTURA (consultas). Solo leen las tablas read_* (nunca event_store)
 * y nunca publican eventos ni modifican datos.
 */

export const LIMITE_DEFECTO = 50;
export const LIMITE_MAX = 200;

export interface SalaView {
  id: string;
  nombre: string;
  creadaEn: string;
}

export interface MensajeView {
  id: string;
  salaId: string;
  autor: string;
  texto: string;
  enviadoEn: string;
}

/** Puerto de lectura; la implementacion real esta en pgReadModel.ts. */
export interface ReadModel {
  listSalas(): Promise<SalaView[]>;
  salaExists(salaId: string): Promise<boolean>;
  /** Ultimos `limit` mensajes de la sala, en orden cronologico ascendente. */
  listMensajes(salaId: string, limit: number): Promise<MensajeView[]>;
}

const listarMensajesSchema = z.object({
  salaId: z.string().uuid('salaId debe ser un UUID'),
  limite: z
    .number({ invalid_type_error: 'limite debe ser un numero' })
    .int('limite debe ser entero')
    .min(1, 'limite debe ser >= 1')
    .max(LIMITE_MAX, `limite debe ser <= ${LIMITE_MAX}`),
});

export function createListarSalasHandler(readModel: ReadModel) {
  return (): Promise<SalaView[]> => readModel.listSalas();
}

export function createListarMensajesHandler(readModel: ReadModel) {
  return async (query: { salaId: string; limite?: number }): Promise<MensajeView[]> => {
    const parsed = listarMensajesSchema.safeParse({ salaId: query.salaId, limite: query.limite ?? LIMITE_DEFECTO });
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Consulta invalida', parsed.error.issues);
    }
    const { salaId, limite } = parsed.data;
    if (!(await readModel.salaExists(salaId))) {
      // Por consistencia eventual, una sala recien creada puede tardar milisegundos en aparecer.
      throw new NotFoundError(`La sala ${salaId} no existe (o aun no se proyecta)`);
    }
    return readModel.listMensajes(salaId, limite);
  };
}

export type ListarSalasHandler = ReturnType<typeof createListarSalasHandler>;
export type ListarMensajesHandler = ReturnType<typeof createListarMensajesHandler>;
