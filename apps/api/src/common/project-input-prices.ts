import { BadRequestException } from '@nestjs/common';

const ufs = new Set('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' '));
/** Additive project JSON, never an update to a published reference or library. */
export function validateInputPriceOverrides(value: unknown): void {
  if (value === undefined) return;
  const invalid = () => { throw new BadRequestException('Substituição de preço do orçamento inválida.'); };
  if (!Array.isArray(value) || value.length > 2000) return invalid();
  const keys = new Set<string>();
  const cents = (n: unknown) => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 && n <= 100_000_000_000;
  for (const r of value) {
    if (!r || typeof r !== 'object' || Array.isArray(r) ||
        !/^(?:\d{1,12}|[A-Z]\d{4}|IP-[A-Z0-9_-]{1,54})$/.test(String(r.code)) || !ufs.has(r.uf) ||
        !/^\d{4}-(0[1-9]|1[0-2])$/.test(r.ref) || !['SD', 'CD', 'SE'].includes(r.regime) ||
        !cents(r.priceCents) || (r.chiCents !== undefined && !cents(r.chiCents)) ||
        typeof r.source !== 'string' || !r.source.trim() || r.source.length > 500 ||
        typeof r.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.date) ||
        !Number.isFinite(Date.parse(r.date + 'T00:00:00Z')) ||
        new Date(r.date + 'T00:00:00Z').toISOString().slice(0, 10) !== r.date) return invalid();
    const key = [r.code, r.uf, r.ref, r.regime].join('|');
    if (keys.has(key)) return invalid(); keys.add(key);
  }
}
