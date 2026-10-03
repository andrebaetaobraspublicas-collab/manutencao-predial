import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';

export type InfraObject = Record<string, unknown>;
export const INFRA_UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
export function object(value: unknown): InfraObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('Informe um objeto JSON válido.');
  return value as InfraObject;
}
export function fields(value: unknown, allowed: string[]): InfraObject {
  const body = object(value);
  if (Object.keys(body).some(key => !allowed.includes(key))) throw new BadRequestException('Campo não permitido na operação.');
  return body;
}
export function text(value: unknown, name: string, max = 200, optional = false): string {
  if (optional && value == null) return '';
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new BadRequestException(`${name} inválido.`);
  return value.trim();
}
export function uuid(value: unknown): string {
  const result = text(value, 'Identificador', 36);
  if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(result)) throw new BadRequestException('Identificador inválido.');
  return result.toLowerCase();
}
export function integer(value: unknown, name: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) throw new BadRequestException(`${name} inválido.`);
  return value;
}
export function context(uf: unknown, regime: unknown): { uf: string; regime: 'SD'|'CD'|'SE' } {
  if (typeof uf !== 'string' || !INFRA_UFS.includes(uf) || !['SD','CD','SE'].includes(String(regime))) throw new BadRequestException('UF ou regime SICRO inválido.');
  return { uf, regime: regime as 'SD'|'CD'|'SE' };
}
export function reference(value: unknown): string {
  const ref = text(value, 'Referência', 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(ref) && !/^(0[1-9]|1[0-2])\/\d{4}$/.test(ref)) throw new BadRequestException('Referência deve ter mês e ano válidos.');
  return ref.includes('/') ? `${ref.slice(3)}-${ref.slice(0,2)}` : ref;
}
export function digest(value: unknown): string {
  const result = text(value, 'SHA-256', 64);
  if (!/^[a-f\d]{64}$/i.test(result)) throw new BadRequestException('SHA-256 inválido.');
  return result.toLowerCase();
}
export function json(value: unknown, maximum = 20 * 1024 * 1024, sanitize = false): string {
  let nodes = 0;
  const visit = (current: unknown, depth: number, key = ''): unknown => {
    if (++nodes > 1000000 || depth > 64) throw new BadRequestException('Estrutura JSON excede os limites permitidos.');
    if (typeof current === 'number' && !Number.isFinite(current)) throw new BadRequestException('Valor numérico inválido.');
    if (current === null || typeof current === 'boolean' || typeof current === 'number') return current;
    if (typeof current === 'string') {
      if (sanitize && ['name','description','desc','obs','notes','label','nome','descricao'].includes(key)) {
        return current.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'').replace(/<[^>]*>/g,'').replace(/[<>]/g,'');
      }
      return current;
    }
    if (Array.isArray(current)) return current.map(child => visit(child, depth + 1, key));
    if (current && typeof current === 'object') {
      const output: InfraObject = {};
      for (const [childKey, child] of Object.entries(current)) {
        if (['__proto__','prototype','constructor'].includes(childKey)) throw new BadRequestException('Chave JSON não permitida.');
        output[childKey] = visit(child, depth + 1, childKey);
      }
      return output;
    }
    throw new BadRequestException('Tipo de valor JSON não permitido.');
  };
  const encoded = JSON.stringify(visit(value, 0));
  if (Buffer.byteLength(encoded,'utf8') > maximum) throw new BadRequestException(`JSON excede ${Math.floor(maximum / 1024 / 1024)} MB.`);
  return encoded;
}
export function parsed(value: unknown): any { return typeof value === 'string' ? JSON.parse(value) : value; }
export function sha(value: Buffer | string): string { return createHash('sha256').update(value).digest('hex'); }
export function page(value: unknown, fallback = 1, max = 100000): number {
  if (value == null || value === '') return fallback;
  const result = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  return integer(result, 'Página', 1, max);
}
