import { describe, expect, it, vi } from 'vitest';
import { NotFoundError, ValidationError } from '../../src/errors';
import { createListarMensajesHandler, createListarSalasHandler, type ReadModel } from '../../src/queries/handlers';

const SALA = '11111111-1111-4111-8111-111111111111';

function fakeReadModel(exists = true): ReadModel & { listMensajes: ReturnType<typeof vi.fn> } {
  return {
    listSalas: vi.fn().mockResolvedValue([{ id: SALA, nombre: 'General', creadaEn: '2026-01-01T00:00:00.000Z' }]),
    salaExists: vi.fn().mockResolvedValue(exists),
    listMensajes: vi.fn().mockResolvedValue([]),
  };
}

describe('ListarSalas', () => {
  it('devuelve lo que entrega el modelo de lectura', async () => {
    const salas = await createListarSalasHandler(fakeReadModel())();
    expect(salas).toHaveLength(1);
  });
});

describe('ListarMensajes', () => {
  it('usa limite 50 por defecto', async () => {
    const rm = fakeReadModel();
    await createListarMensajesHandler(rm)({ salaId: SALA });
    expect(rm.listMensajes).toHaveBeenCalledWith(SALA, 50);
  });

  it('respeta el limite pedido', async () => {
    const rm = fakeReadModel();
    await createListarMensajesHandler(rm)({ salaId: SALA, limite: 10 });
    expect(rm.listMensajes).toHaveBeenCalledWith(SALA, 10);
  });

  it.each([[0], [-1], [201], [1.5], [Number.NaN]])('rechaza limite %s', async (limite) => {
    await expect(createListarMensajesHandler(fakeReadModel())({ salaId: SALA, limite })).rejects.toBeInstanceOf(ValidationError);
  });

  it('rechaza salaId que no es UUID', async () => {
    await expect(createListarMensajesHandler(fakeReadModel())({ salaId: 'abc' })).rejects.toBeInstanceOf(ValidationError);
  });

  it('lanza NotFoundError si la sala no existe', async () => {
    await expect(createListarMensajesHandler(fakeReadModel(false))({ salaId: SALA })).rejects.toBeInstanceOf(NotFoundError);
  });
});
