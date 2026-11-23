import { describe, expect, it, vi } from 'vitest';
import type { DomainEvent } from '../../src/events/events';
import { createProjector } from '../../src/projections/projector';

const SALA = '11111111-1111-4111-8111-111111111111';
const MSG = '22222222-2222-4222-8222-222222222222';

describe('Proyector', () => {
  it('SalaCreada -> insertSala con id del agregado y fecha del evento', async () => {
    const writer = { insertSala: vi.fn(), insertMensaje: vi.fn() };
    const event: DomainEvent = {
      id: '1', type: 'SalaCreada', aggregateType: 'Sala', aggregateId: SALA, version: 1,
      occurredAt: '2026-01-01T10:00:00.000Z', payload: { nombre: 'General' },
    };
    await createProjector(writer)(event);
    expect(writer.insertSala).toHaveBeenCalledWith({ id: SALA, nombre: 'General', creadaEn: '2026-01-01T10:00:00.000Z' });
    expect(writer.insertMensaje).not.toHaveBeenCalled();
  });

  it('MensajeEnviado -> insertMensaje con mensajeId como id', async () => {
    const writer = { insertSala: vi.fn(), insertMensaje: vi.fn() };
    const event: DomainEvent = {
      id: '2', type: 'MensajeEnviado', aggregateType: 'Sala', aggregateId: SALA, version: 2,
      occurredAt: '2026-01-01T10:01:00.000Z', payload: { mensajeId: MSG, autor: 'ana', texto: 'hola' },
    };
    await createProjector(writer)(event);
    expect(writer.insertMensaje).toHaveBeenCalledWith({
      id: MSG, salaId: SALA, autor: 'ana', texto: 'hola', enviadoEn: '2026-01-01T10:01:00.000Z',
    });
  });
});
