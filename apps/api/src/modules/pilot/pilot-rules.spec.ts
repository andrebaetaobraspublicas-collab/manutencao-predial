import { summarizePilot } from './pilot-rules';

describe('regras de homologação do piloto', () => {
  it('só libera o aceite quando todos os cenários aptos foram homologados', () => {
    const pending = summarizePilot([
      { automaticStatus: 'PASSED', decisionOutcome: 'PASSED' },
      { automaticStatus: 'PENDING', decisionOutcome: 'PASSED' },
      { automaticStatus: 'MANUAL', decisionOutcome: 'PASSED' },
    ]);
    expect(pending.canAccept).toBe(false);
    expect(pending.status).toBe('IN_PROGRESS');

    const ready = summarizePilot([
      { automaticStatus: 'PASSED', decisionOutcome: 'PASSED' },
      { automaticStatus: 'MANUAL', decisionOutcome: 'PASSED' },
    ]);
    expect(ready.canAccept).toBe(true);
    expect(ready.status).toBe('READY_FOR_ACCEPTANCE');
  });

  it('detecta regressão após um aceite anteriormente aprovado', () => {
    const result = summarizePilot([
      { automaticStatus: 'PASSED', decisionOutcome: 'PASSED' },
      { automaticStatus: 'PENDING', decisionOutcome: 'PASSED' },
    ], 'APPROVED');
    expect(result.status).toBe('REGRESSION_DETECTED');
    expect(result.canAccept).toBe(false);
  });

  it('prioriza bloqueio e falha enquanto não existe aceite final', () => {
    expect(summarizePilot([{ automaticStatus: 'MANUAL', decisionOutcome: 'BLOCKED' }]).status).toBe('BLOCKED');
    expect(summarizePilot([{ automaticStatus: 'PASSED', decisionOutcome: 'FAILED' }]).status).toBe('FAILED');
  });
});
