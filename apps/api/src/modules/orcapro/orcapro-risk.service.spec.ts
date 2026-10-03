import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { OrcaproRiskService } from './orcapro-risk.service';
import { OrcaproService } from './orcapro.service';
import { PrismaService } from '../../prisma/prisma.service';
import { loadLegacyRuntime } from './legacy/legacy-runtime';

describe('Fotografia de riscos com custos do motor original', () => {
  const fixture = (file: string) => JSON.parse(readFileSync(join(__dirname, '../../../../../legacy/orcaplan-1.8.3', file), 'utf8'));
  const raw = fixture('sinapi-2026-08.raw.json');
  const service = new OrcaproRiskService({} as OrcaproService, {} as PrismaService);
  const snapshot = (project: Record<string, any>) => (service as any).rows(raw, project);
  const project = () => {
    const p = fixture('fixtures/edificio.project.json');
    p.root.children = [{ id: 'fractional', kind: 'item', code: '', desc: 'Custo informado', unit: 'M2', qty: 2.75, custo: 1.23456 }];
    return p;
  };

  it('aceita todos os 283 itens do edifício sem mudar custos, totais ou quantidades', () => {
    const p = fixture('fixtures/edificio.project.json');
    const original = loadLegacyRuntime().calculateProject(raw, p).model;
    expect(original.items.some((row: any) => !Number.isSafeInteger(row.unitCost))).toBe(true);
    const result = snapshot(p);
    expect(result.rows).toHaveLength(283);
    expect(result.total).toBe(String(original.tot.direct));
    for (const row of result.rows) {
      const source = original.items.find((item: any) => item.id === row.id);
      expect(row.unitCostCents).toBe(String(source.unitCost));
      expect(row.directCents).toBe(String(source.direct));
      expect(row.qty).toBe(source.qty);
    }
  });

  it('preserva frações reais de centavo no unitário e o total arredondado pelo motor', () => {
    const result = snapshot(project());
    expect(Number(result.rows[0].unitCostCents)).toBeCloseTo(123.456, 8);
    expect(result.rows[0].directCents).toBe('340');
    expect(result.total).toBe('340');
  });

  it('identifica o item com preço ausente sem confundi-lo com preço fracionário', () => {
    const p = project(); delete p.root.children[0].custo;
    expect(() => snapshot(p)).toThrow(/preço ausente.*fractional/i);
  });

  it('mantém o bloqueio de custo negativo e de valores fora da precisão segura', () => {
    const p = project(); p.root.children[0].custo = -1;
    expect(() => snapshot(p)).toThrow(/inválido|precisão/);
    p.root.children[0].custo = Number.MAX_SAFE_INTEGER;
    expect(() => snapshot(p)).toThrow(/inválido|precisão/);
  });
});
