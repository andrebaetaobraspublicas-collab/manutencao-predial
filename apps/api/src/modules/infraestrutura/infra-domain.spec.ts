import { BadRequestException } from '@nestjs/common';
import { context, fields, json, reference, sha } from './infra-domain';

describe('Infraestrutura project input — limite, contexto e sanitização', () => {
  test('20MB contam bytes UTF8 serializados: limite exato passa e um byte extra falha', () => {
    const maximum = 20 * 1024 * 1024;
    const exact = { note: 'a'.repeat(maximum - Buffer.byteLength(JSON.stringify({ note: '' }))) };
    expect(Buffer.byteLength(json(exact), 'utf8')).toBe(maximum);
    expect(() => json({ note: `${exact.note}a` })).toThrow(BadRequestException);
    expect(() => json({ note: '💡'.repeat(100) }, 300)).toThrow(BadRequestException);
  });

  test('chaves de protótipo, profundidade e números não finitos são rejeitados', () => {
    expect(() => json(JSON.parse('{"__proto__":{"polluted":true}}'))).toThrow(BadRequestException);
    expect(() => json({ data: { constructor: { pollution: true } } })).toThrow(BadRequestException);
    expect(() => json({ cost: Number.NaN })).toThrow(BadRequestException);
    let nested: object = {};
    for (let i = 0; i < 70; i++) nested = { item: nested };
    expect(() => json(nested)).toThrow(BadRequestException);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  test('descrições sanitizadas mantêm valores e ausência de custo', () => {
    const original = { description: '<script>alert(1)</script>Concreto <img src=x onerror=alert(2)> 30MPa', price: null, quantity: 0.00001234, coefficient: 2.75689, catalog: { structure: 'FIC*custo_improdutivo' } };
    const result = JSON.parse(json(original, undefined, true));
    expect(result.description).toBe('Concreto  30MPa');
    expect(result.price).toBeNull();
    expect(result.quantity).toBe(original.quantity);
    expect(result.coefficient).toBe(original.coefficient);
    expect(result.catalog.structure).toBe(original.catalog.structure);
  });

  test('contexto permite somente UF/regime conhecidos e referência normalizada', () => {
    expect(context('SP', 'SD')).toEqual({ uf: 'SP', regime: 'SD' });
    expect(context('SP', 'CD').regime).toBe('CD');
    expect(() => context('ZZ', 'SD')).toThrow(BadRequestException);
    expect(() => context('SP', 'sem-preco')).toThrow(BadRequestException);
    expect(reference('07/2026')).toBe('2026-07');
    expect(() => reference('13/2026')).toThrow(BadRequestException);
    expect(() => fields({ name: 'x', userId: 'injected' }, ['name'])).toThrow(BadRequestException);
    expect(sha('raw-v1')).toMatch(/^[a-f0-9]{64}$/);
  });
});
