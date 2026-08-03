export type NumericBand = {
  rating: string;
  label: string;
  minValue: number | null;
  maxValue: number | null;
  score: number;
  adjustmentType: 'NONE' | 'DEDUCTION' | 'BONUS';
  adjustmentPercent: number | null;
  fixedAmount: number | null;
  triggerActionPlan: boolean;
  sortOrder: number;
};

export function findPerformanceBand(value: number, bands: NumericBand[]) {
  return [...bands].sort((a, b) => a.sortOrder - b.sortOrder).find((band) =>
    (band.minValue === null || value >= band.minValue) &&
    (band.maxValue === null || value < band.maxValue),
  ) ?? null;
}

export function weightedPerformanceIndex(rows: Array<{ score: number; weight: number }>) {
  const active = rows.filter((row) => Number.isFinite(row.score) && row.weight > 0);
  const totalWeight = active.reduce((sum, row) => sum + row.weight, 0);
  if (!totalWeight) return null;
  return active.reduce((sum, row) => sum + row.score * row.weight, 0) / totalWeight;
}

export function performanceRating(score: number | null) {
  if (score === null) return 'SEM_DADOS';
  if (score >= 95) return 'EXCELENTE';
  if (score >= 85) return 'BOM';
  if (score >= 70) return 'REGULAR';
  if (score >= 50) return 'INSATISFATORIO';
  return 'CRITICO';
}

export function cappedAdjustment(input: {
  basis: number; percent: number; fixedAmount?: number | null; capPercent?: number | null;
}) {
  const raw = input.fixedAmount ?? input.basis * input.percent / 100;
  const cap = input.capPercent === null || input.capPercent === undefined
    ? raw : input.basis * input.capPercent / 100;
  return Math.max(0, Math.min(raw, cap));
}
