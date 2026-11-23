import { describe, expect, it } from 'vitest';
import { formatEvent } from '../src/formato';

const base = { id: '7', aggregateType: 'Sala', aggregateId: '11111111-1111-4111-8111-111111111111', occurredAt: '2026-01-01T15:04:05.000Z' } as const;

describe('formatEvent', () => {
  it('describe SalaCreada con el nombre', () => {
    const line = formatEvent({ ...base, version: 1, type: 'SalaCreada', payload: { nombre: 'General' } });
    expect(line).toContain('SalaCreada');
    expect(line).toContain('"General"');
    expect(line).toContain('sala=11111111');
  });

  it('describe MensajeEnviado con autor y texto', () => {
    const line = formatEvent({
      ...base, version: 2, type: 'MensajeEnviado',
      payload: { mensajeId: '22222222-2222-4222-8222-222222222222', autor: 'ana', texto: 'hola' },
    });
    expect(line).toContain('MensajeEnviado');
    expect(line).toContain('ana: hola');
    expect(line).toContain('v2');
  });
});
