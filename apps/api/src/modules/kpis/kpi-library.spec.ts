import { KpiCategory } from '../../generated/prisma/client';
import { KPI_LIBRARY } from './kpi-library';

describe('biblioteca de KPIs de facilities', () => {
  it('mantém catálogo amplo, códigos únicos e memória de cálculo completa', () => {
    expect(KPI_LIBRARY.length).toBeGreaterThanOrEqual(80);
    expect(new Set(KPI_LIBRARY.map((item) => item.code)).size).toBe(KPI_LIBRARY.length);
    for (const item of KPI_LIBRARY) {
      expect(item.formula.length).toBeGreaterThan(10);
      expect(item.formulaExample.length).toBeGreaterThan(10);
      expect(item.objective.length).toBeGreaterThan(10);
      expect(item.dataSource.length).toBeGreaterThan(3);
      expect(item.acceptableRange.length).toBeGreaterThan(3);
    }
  });

  it('cobre as doze famílias funcionais pedidas', () => {
    const categories = new Set(KPI_LIBRARY.map((item) => item.category));
    for (const category of [KpiCategory.SLA, KpiCategory.PREVENTIVE_MAINTENANCE,
      KpiCategory.CORRECTIVE_MAINTENANCE, KpiCategory.AVAILABILITY, KpiCategory.QUALITY,
      KpiCategory.SAFETY, KpiCategory.SATISFACTION, KpiCategory.FINANCIAL,
      KpiCategory.SUSTAINABILITY, KpiCategory.DOCUMENTATION, KpiCategory.PREDICTIVE,
      KpiCategory.SYSTEM_SPECIFIC]) expect(categories.has(category)).toBe(true);
  });
});
