import { recommendMaintenance } from './maintenance-intelligence';

describe('recommendMaintenance', () => {
  const startDate = new Date('2026-08-01T12:00:00.000Z');

  it('gera somente atividades dos sistemas selecionados com justificativa auditável', () => {
    const result = recommendMaintenance({ constructionYear: 2010, environmentalExposure: 'MEDIUM',
      occupationIntensity: 'HIGH', systems: ['BOMBAS', 'SPDA'], startDate }, startDate);
    expect(result.map((item) => item.system)).toEqual(['BOMBAS', 'SPDA']);
    expect(result.every((item) => item.checklist.length > 0 && item.technicalReferences.length > 0)).toBe(true);
    expect(result[0].rationale).toContain('Validação do responsável técnico');
  });

  it('eleva criticidade e antecipa a primeira intervenção para prédio antigo e exposto', () => {
    const baseline = recommendMaintenance({ constructionYear: 2024, environmentalExposure: 'LOW',
      occupationIntensity: 'LOW', systems: ['FACHADAS'], startDate }, startDate)[0];
    const exposed = recommendMaintenance({ constructionYear: 1980, environmentalExposure: 'HIGH',
      occupationIntensity: 'HIGH', systems: ['FACHADAS'], startDate }, startDate)[0];
    expect(exposed.riskScore).toBeGreaterThan(baseline.riskScore);
    expect(new Date(exposed.nextDueAt).getTime()).toBeLessThan(new Date(baseline.nextDueAt).getTime());
  });
});
