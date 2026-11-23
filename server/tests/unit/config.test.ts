import { describe, expect, it } from 'vitest';
import { parseConfig } from '../../src/config';

describe('parseConfig', () => {
  it('aplica valores por defecto y exige DATABASE_URL para api/projector', () => {
    expect(() => parseConfig({})).toThrow(/DATABASE_URL/);
    const cfg = parseConfig({ DATABASE_URL: 'postgresql://x' });
    expect(cfg.port).toBe(3000);
    expect([...cfg.roles].sort()).toEqual(['api', 'broadcast', 'projector']);
  });

  it('el rol broadcast no necesita base de datos', () => {
    const cfg = parseConfig({ ROLES: 'broadcast' });
    expect(cfg.databaseUrl).toBeUndefined();
  });

  it('trata variables vacias como no definidas', () => {
    expect(() => parseConfig({ DATABASE_URL: '' })).toThrow(/DATABASE_URL/);
    expect(parseConfig({ DATABASE_URL: '', ROLES: 'broadcast' }).databaseUrl).toBeUndefined();
  });

  it('rechaza roles desconocidos', () => {
    expect(() => parseConfig({ ROLES: 'api,otro', DATABASE_URL: 'x' })).toThrow(/Rol desconocido/);
  });
});
