import { amountProduct, amendmentQuantity, compensation, compensationInstallment, globalMeasurement, indexedPrice, newServicePrice, unitMeasurement } from './contract-engine';

describe('Gestão Contratual exact financial rules', () => {
  it('measures, adds and suppresses without erasing prior execution', () => {
    expect(unitMeasurement({ contractQuantity: '1000', previousQuantity: '0', presentedQuantity: '200', approvedQuantity: '200', unitPrice: '50' }))
      .toMatchObject({ amount: '10000.00', accumulatedQuantity: '200', remainingQuantity: '800' });
    expect(amendmentQuantity({ original: '1000', additions: ['100'], suppressions: [], measured: '200' }))
      .toMatchObject({ current: '1100', remaining: '900' });
    expect(amendmentQuantity({ original: '1000', additions: ['100'], suppressions: ['50'], measured: '200' }))
      .toMatchObject({ current: '1050', remaining: '850' });
    expect(() => amendmentQuantity({ original: '1000', additions: [], suppressions: ['850'], measured: '200' })).toThrow(/já medida/);
    expect(() => unitMeasurement({ contractQuantity: '1000', previousQuantity: '950', presentedQuantity: '100', approvedQuantity: '100', unitPrice: '50' })).toThrow(/quantidade vigente/);
  });

  it('preserves glosa and valid zero rather than consuming presented quantity', () => {
    expect(unitMeasurement({ contractQuantity: '100', previousQuantity: '0', presentedQuantity: '100', approvedQuantity: '90', unitPrice: '50' }))
      .toMatchObject({ disallowedQuantity: '10', accumulatedQuantity: '90', remainingQuantity: '10', amount: '4500.00' });
    expect(amountProduct('1.005', '1')).toBe('1.01');
    expect(amountProduct('0', '100')).toBe('0.00');
    expect(() => amountProduct('', '50')).toThrow();
    expect(() => amountProduct('1e3', '50')).toThrow();
    expect(() => amountProduct('1', '-50')).toThrow();
    expect(() => amountProduct('0.1234567', '50')).toThrow();
    expect(() => amountProduct(1 as unknown as string, '50')).toThrow();
  });

  it('computes single and basket indexes without rounding the factor first', () => {
    expect(indexedPrice({ basePrice: '50', components: [{ weight: '1', baseIndex: '100', currentIndex: '105' }] })).toMatchObject({ price: '52.50' });
    expect(indexedPrice({ basePrice: '50', components: [{ weight: '0.6', baseIndex: '100', currentIndex: '108' }, { weight: '0.4', baseIndex: '100', currentIndex: '105' }] }))
      .toMatchObject({ price: '53.40', factor: '1.068000000000', factorNumerator: '267', factorDenominator: '250' });
    expect(indexedPrice({ basePrice: '3', components: [{ weight: '1', baseIndex: '3', currentIndex: '1' }] }).price).toBe('1.00');
    expect(() => indexedPrice({ basePrice: '50', components: [{ weight: '0.9', baseIndex: '100', currentIndex: '105' }] })).toThrow(/Pesos/);
    expect(() => indexedPrice({ basePrice: '50', components: [{ weight: '1', baseIndex: '0', currentIndex: '105' }] })).toThrow(/Divisor/);
  });

  it('forms new service price using full original relationship', () => {
    expect(newServicePrice({ originalContract: '900', originalReference: '1000', referencePrice: '100' }).price).toBe('90.00');
    // Screenshot shows 9.52%, but the exact 2/21 ratio is needed to reproduce it.
    const result = compensation({ originalContract: '19000', originalReference: '21000', currentContract: '39100', currentReference: '32900', retained: '0', refunded: '0' });
    expect(result).toMatchObject({ compatibleAmount: '29766.67', required: '9333.33', discountNumerator: '2', discountDenominator: '21' });
    const halfCent = compensation({ originalContract: '1', originalReference: '2', currentContract: '1', currentReference: '1.01', retained: '0', refunded: '0' });
    expect(halfCent).toMatchObject({ compatibleAmount: '0.51', required: '0.49' });
  });

  const example = (currentContract: string, retained: string, refunded = '0') => compensation({
    originalContract: '90000', originalReference: '100000', currentContract, currentReference: '100000', retained, refunded,
  });

  it('recalculates cumulative compensation across successive amendments and refunds', () => {
    expect(example('100000', '0')).toMatchObject({ required: '10000.00', toRecover: '10000.00', toRefund: '0.00' });
    expect(compensationInstallment({ balanceAtMilestone: '10000', eligibleBalanceAtMilestone: '100000', measuredAtMilestone: '10000', previousAllocated: '0' }))
      .toEqual({ deduction: '1000.00', cumulativeAllocated: '1000.00', remaining: '9000.00' });
    expect(example('104000', '1000')).toMatchObject({ required: '14000.00', toRecover: '13000.00' });
    expect(example('94000', '6000')).toMatchObject({ required: '4000.00', toRecover: '0.00', toRefund: '2000.00' });
    expect(example('94000', '6000', '2000')).toMatchObject({ netRetained: '4000.00', toRecover: '0.00', toRefund: '0.00' });
    expect(example('90000', '6000', '2000')).toMatchObject({ required: '0.00', toRefund: '4000.00' });
    expect(example('90000', '6000', '6000')).toMatchObject({ netRetained: '0.00', toRefund: '0.00' });
    expect(() => example('90000', '1000', '1000.01')).toThrow(/Devoluções/);
  });

  it('reserves each cent once and closes rounding residues by cumulative allocation', () => {
    const a = compensationInstallment({ balanceAtMilestone: '1', eligibleBalanceAtMilestone: '3', measuredAtMilestone: '1', previousAllocated: '0' });
    const b = compensationInstallment({ balanceAtMilestone: '1', eligibleBalanceAtMilestone: '3', measuredAtMilestone: '2', previousAllocated: a.cumulativeAllocated });
    const c = compensationInstallment({ balanceAtMilestone: '1', eligibleBalanceAtMilestone: '3', measuredAtMilestone: '3', previousAllocated: b.cumulativeAllocated });
    expect([a.deduction, b.deduction, c.deduction]).toEqual(['0.33', '0.34', '0.33']);
    expect(c.remaining).toBe('0.00');
    expect(compensationInstallment({ balanceAtMilestone: '1', eligibleBalanceAtMilestone: '3', measuredAtMilestone: '3', previousAllocated: '1' }).deduction).toBe('0.00');
    expect(() => compensationInstallment({ balanceAtMilestone: '1', eligibleBalanceAtMilestone: '0', measuredAtMilestone: '0', previousAllocated: '0' })).toThrow(/acerto específico/);
    expect(() => compensationInstallment({ balanceAtMilestone: '10', eligibleBalanceAtMilestone: '3', measuredAtMilestone: '1', previousAllocated: '0' })).toThrow(/acerto específico/);
    expect(() => compensationInstallment({ balanceAtMilestone: '1', eligibleBalanceAtMilestone: '3', measuredAtMilestone: '1', previousAllocated: '0.5' })).toThrow(/concilie/);
  });

  const events = [
    { id: 'structure', amount: '100000', accepted: true },
    { id: 'floor1', parentId: 'structure', amount: '25000', accepted: true },
    { id: 'floor2', parentId: 'structure', amount: '25000', accepted: false },
  ];
  it('pays accepted contractual events, not reported physical percentages', () => {
    expect(globalMeasurement({ events, selectedIds: ['floor1'], previouslyMeasuredIds: [] })).toEqual({ eventIds: ['floor1'], amount: '25000.00' });
    expect(() => globalMeasurement({ events, selectedIds: ['floor2'], previouslyMeasuredIds: [] })).toThrow(/aceite/);
    expect(() => globalMeasurement({ events, selectedIds: ['floor1'], previouslyMeasuredIds: ['floor1'] })).toThrow(/duplicidade/);
    expect(() => globalMeasurement({ events, selectedIds: ['structure'], previouslyMeasuredIds: ['floor1'] })).toThrow(/evento-pai/);
    expect(() => globalMeasurement({ events, selectedIds: ['floor1', 'structure'], previouslyMeasuredIds: [] })).toThrow(/evento-pai/);
  });

  it('rejects broken event graphs, missing identifiers and repeated selection', () => {
    expect(() => globalMeasurement({ events: [{ id: 'a', parentId: 'b', amount: '1', accepted: true }, { id: 'b', parentId: 'a', amount: '1', accepted: true }], selectedIds: ['a'], previouslyMeasuredIds: [] })).toThrow(/ciclo/);
    expect(() => globalMeasurement({ events: [{ id: 'a', parentId: 'missing', amount: '1', accepted: true }], selectedIds: ['a'], previouslyMeasuredIds: [] })).toThrow(/não encontrado/);
    expect(() => globalMeasurement({ events, selectedIds: ['missing'], previouslyMeasuredIds: [] })).toThrow(/não encontrado/);
  });
});
