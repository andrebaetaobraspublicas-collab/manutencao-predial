import { cappedAdjustment, findPerformanceBand, performanceRating, weightedPerformanceIndex } from './kpi-rules';

describe('regras de desempenho contratual', () => {
  const bands = [
    { rating: 'CRITICAL', label: 'Crítico', minValue: null, maxValue: 80, score: 40, adjustmentType: 'DEDUCTION' as const, adjustmentPercent: 2, fixedAmount: null, triggerActionPlan: true, sortOrder: 0 },
    { rating: 'GOOD', label: 'Bom', minValue: 80, maxValue: 95, score: 85, adjustmentType: 'NONE' as const, adjustmentPercent: null, fixedAmount: null, triggerActionPlan: false, sortOrder: 1 },
    { rating: 'EXCELLENT', label: 'Excelente', minValue: 95, maxValue: null, score: 100, adjustmentType: 'BONUS' as const, adjustmentPercent: 1, fixedAmount: null, triggerActionPlan: false, sortOrder: 2 },
  ];

  it('enquadra limites sem sobreposição', () => {
    expect(findPerformanceBand(79.999, bands)?.rating).toBe('CRITICAL');
    expect(findPerformanceBand(80, bands)?.rating).toBe('GOOD');
    expect(findPerformanceBand(95, bands)?.rating).toBe('EXCELLENT');
  });

  it('calcula IGD normalizando pelos pesos ativos', () => {
    expect(weightedPerformanceIndex([{ score: 100, weight: 20 }, { score: 50, weight: 10 }])).toBeCloseTo(83.3333, 3);
    expect(weightedPerformanceIndex([{ score: 100, weight: 0 }])).toBeNull();
    expect(performanceRating(83.33)).toBe('REGULAR');
  });

  it('limita o ajuste financeiro pelo teto contratual', () => {
    expect(cappedAdjustment({ basis: 100_000, percent: 5, capPercent: 2 })).toBe(2_000);
    expect(cappedAdjustment({ basis: 100_000, percent: 1.5, capPercent: 2 })).toBe(1_500);
  });
});
