import { describe, expect, it, vi } from 'vitest';
import { createBroadcaster, ROOM_ALL, roomOf } from '../../src/broadcast/socketBridge';
import type { DomainEvent } from '../../src/events/events';

const SALA = '11111111-1111-4111-8111-111111111111';
const base = { id: '1', aggregateType: 'Sala', aggregateId: SALA, version: 1, occurredAt: '2026-01-01T00:00:00.000Z' } as const;

function fakeTarget() {
  const roomEmit = vi.fn();
  return { emit: vi.fn(), to: vi.fn(() => ({ emit: roomEmit })), roomEmit };
}

describe('Broadcaster', () => {
  it('SalaCreada se emite a todos los clientes conectados', () => {
    const t = fakeTarget();
    const event: DomainEvent = { ...base, type: 'SalaCreada', payload: { nombre: 'General' } };
    createBroadcaster(t)(event);
    expect(t.emit).toHaveBeenCalledWith('evento', event);
    expect(t.to).not.toHaveBeenCalled();
  });

  it('MensajeEnviado se emite a la sala y a los suscritos a "todas"', () => {
    const t = fakeTarget();
    const event: DomainEvent = {
      ...base, version: 2, type: 'MensajeEnviado',
      payload: { mensajeId: '22222222-2222-4222-8222-222222222222', autor: 'ana', texto: 'hola' },
    };
    createBroadcaster(t)(event);
    expect(t.to).toHaveBeenCalledWith([roomOf(SALA), ROOM_ALL]);
    expect(t.roomEmit).toHaveBeenCalledWith('evento', event);
    expect(t.emit).not.toHaveBeenCalled();
  });
});
