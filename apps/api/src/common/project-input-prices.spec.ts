import { validateInputPriceOverrides } from './project-input-prices';
describe('Project input price persistence boundary', () => {
  const row = { code: '12345', uf: 'SP', ref: '2026-09', regime: 'SD', priceCents: 2000, source: 'Fornecedor', date: '2026-10-27' };
  it('accepts exact cents, zero, project contexts and optional SICRO CHI', () => {
    expect(() => validateInputPriceOverrides(undefined)).not.toThrow();
    expect(() => validateInputPriceOverrides([{ ...row, priceCents: 0 }, { ...row, code: 'E0001', chiCents: 1000 }])).not.toThrow();
  });
  it.each([{ priceCents: -1 }, { priceCents: 0.1 }, { priceCents: '20' }, { uf: 'XX' }, { ref: '2026-13' }, { regime: 'INVALID' }, { source: '' }, { date: '2026-02-30' }, { date: '2026-99-99' }, { code: '123" onclick="alert(1)' }])('rejects malformed rows: %j', patch => {
    expect(() => validateInputPriceOverrides([{ ...row, ...patch }])).toThrow('Substituição');
  });
  it('rejects ambiguous duplicates and oversized input', () => {
    expect(() => validateInputPriceOverrides([row, row])).toThrow();
    expect(() => validateInputPriceOverrides(Array(2001).fill(row))).toThrow();
  });
});
